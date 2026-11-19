import {createHmac, randomBytes, timingSafeEqual} from "crypto";
import * as admin from "firebase-admin";
import Razorpay from "razorpay";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");

const PAID_PLANS = {
  GROWTH: {
    version: 1,
    monthlyPrice: 1999,
    annualPrice: 19990,
    gstRate: 18,
    rank: 1,
  },
  PRO: {
    version: 1,
    monthlyPrice: 3999,
    annualPrice: 39990,
    gstRate: 18,
    rank: 2,
  },
} as const;

type PaidPlanCode = keyof typeof PAID_PLANS;

interface CreateRazorpayOrderRequest {
  planCode?: string;
  planVersion?: number;
  billingInterval?: string;
  amount?: number;
  currency?: string;
}

interface VerifyRazorpayPaymentRequest {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

/**
 * Creates the Razorpay SDK client from Firebase-managed credentials.
 * @return {Razorpay} The configured SDK client.
 */
function getRazorpayClient(): Razorpay {
  const keyId = RAZORPAY_KEY_ID.value().trim();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) {
    throw new HttpsError(
      "failed-precondition",
      "Razorpay API credentials are not configured.",
    );
  }
  return new Razorpay({key_id: keyId, key_secret: keySecret});
}

/**
 * Returns the configured secret used for HMAC verification.
 * @return {string} The Razorpay API secret.
 */
function getRazorpayKeySecret(): string {
  const keySecret = RAZORPAY_KEY_SECRET.value().trim();
  if (!keySecret) {
    throw new HttpsError(
      "failed-precondition",
      "The Razorpay API secret is not configured.",
    );
  }
  return keySecret;
}

export const createRazorpayOrder = onCall<
  CreateRazorpayOrderRequest,
  Promise<{
    orderId: string;
    amount: number;
    currency: "INR";
    keyId: string;
  }>
>(
  {
    region: "asia-south1",
    maxInstances: 10,
    secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before starting checkout.",
      );
    }

    const planCode = String(request.data?.planCode || "").toUpperCase();
    const plan = PAID_PLANS[planCode as PaidPlanCode];
    const billingInterval = request.data?.billingInterval;
    if (!plan || request.data?.planVersion !== plan.version) {
      throw new HttpsError(
        "failed-precondition",
        "This plan version is not available for Razorpay checkout.",
      );
    }
    if (billingInterval !== "MONTHLY" && billingInterval !== "ANNUAL") {
      throw new HttpsError(
        "invalid-argument",
        "Choose a valid billing interval.",
      );
    }

    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    const userProfile = userSnap.data();
    if (!userSnap.exists || userProfile?.role !== "FACTORY_OWNER") {
      throw new HttpsError(
        "permission-denied",
        "Only a factory owner can purchase a plan.",
      );
    }
    const tenantId = String(userProfile.tenantId || "");
    if (!tenantId) {
      throw new HttpsError(
        "failed-precondition",
        "Your account is not associated with a tenant.",
      );
    }

    const tenantSnap = await db.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      throw new HttpsError(
        "not-found",
        "The organization for this account was not found.",
      );
    }
    const currentPlan = String(tenantSnap.data()?.plan || "FREE").toUpperCase();
    const currentRank = currentPlan === "ENTERPRISE" ? 3 :
      currentPlan === "PRO" ? 2 :
        currentPlan === "GROWTH" || currentPlan === "STARTER" ? 1 : 0;
    if (plan.rank < currentRank) {
      throw new HttpsError(
        "failed-precondition",
        "Plan downgrades must be handled through support.",
      );
    }

    const baseAmount = billingInterval === "ANNUAL" ?
      plan.annualPrice :
      plan.monthlyPrice;
    const totalAmount = Math.round(
      baseAmount * (1 + plan.gstRate / 100) * 100,
    );
    const requestedAmount = request.data?.amount;
    const requestedCurrency = request.data?.currency;
    if (!Number.isInteger(requestedAmount) || Number(requestedAmount) < 100) {
      throw new HttpsError(
        "invalid-argument",
        "The payment amount must be at least 100 paise.",
      );
    }
    if (requestedAmount !== totalAmount || requestedCurrency !== "INR") {
      throw new HttpsError(
        "invalid-argument",
        "The requested amount or currency does not match this plan.",
      );
    }

    const keyId = RAZORPAY_KEY_ID.value().trim();
    const receipt = `wf_${Date.now().toString(36)}_` +
      randomBytes(8).toString("hex");
    let orderId: string;
    try {
      const order = await getRazorpayClient().orders.create({
        amount: totalAmount,
        currency: "INR",
        receipt,
      });
      orderId = order.id;
    } catch (error) {
      console.error(
        "Razorpay order creation failed.",
        error instanceof Error ? error.message : "Unknown provider error.",
      );
      throw new HttpsError(
        "internal",
        "Razorpay could not create the payment order. Please try again.",
      );
    }

    try {
      await db.collection("razorpay_payment_orders").doc(orderId).create({
        ownerUid: request.auth.uid,
        tenantId,
        planCode,
        planVersion: plan.version,
        billingInterval,
        amount: totalAmount,
        currency: "INR",
        status: "CREATED",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Razorpay order record could not be saved.", error);
      throw new HttpsError(
        "internal",
        "The payment order could not be saved. Please try again.",
      );
    }

    return {
      orderId,
      amount: totalAmount,
      currency: "INR",
      keyId,
    };
  },
);

export const verifyRazorpayPayment = onCall<
  VerifyRazorpayPaymentRequest,
  Promise<{verified: boolean}>
>(
  {
    region: "asia-south1",
    maxInstances: 10,
    secrets: [RAZORPAY_KEY_SECRET],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to verify this payment.",
      );
    }

    const orderId = String(request.data?.razorpay_order_id || "");
    const paymentId = String(request.data?.razorpay_payment_id || "");
    const signature = String(request.data?.razorpay_signature || "");
    if (!orderId || !paymentId || !signature) {
      throw new HttpsError(
        "invalid-argument",
        "Razorpay order ID, payment ID, and signature are required.",
      );
    }
    if (!/^[a-f\d]{64}$/i.test(signature)) {
      throw new HttpsError("invalid-argument", "Invalid payment signature.");
    }

    const orderRef = db.collection("razorpay_payment_orders").doc(orderId);
    const orderSnap = await orderRef.get();
    const order = orderSnap.data();
    if (!orderSnap.exists || order?.ownerUid !== request.auth.uid) {
      throw new HttpsError(
        "not-found",
        "The payment order was not found for this account.",
      );
    }
    if (order.status === "VERIFIED") {
      return {verified: true};
    }

    const expectedSignature = createHmac("sha256", getRazorpayKeySecret())
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    const expected = Buffer.from(expectedSignature, "hex");
    const received = Buffer.from(signature, "hex");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new HttpsError("invalid-argument", "Payment signature mismatch.");
    }

    await orderRef.update({
      status: "VERIFIED",
      paymentId,
      verifiedAt: new Date().toISOString(),
    });
    return {verified: true};
  },
);
