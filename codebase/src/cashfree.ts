import {createHmac, randomBytes, timingSafeEqual} from "crypto";
import * as admin from "firebase-admin";
import {defineSecret, defineString} from "firebase-functions/params";
import {HttpsError, onCall, onRequest} from "firebase-functions/v2/https";

admin.initializeApp();
const db = admin.firestore();

const CASHFREE_APP_ID = defineSecret("CASHFREE_APP_ID");
const CASHFREE_SECRET_KEY = defineSecret("CASHFREE_SECRET_KEY");
const CASHFREE_ENV = defineString("CASHFREE_ENV", {default: "sandbox"});
const CASHFREE_RETURN_URL = defineString("CASHFREE_RETURN_URL", {
  default: "https://workforcepro-saas.web.app/",
});
const CASHFREE_API_VERSION = "2026-01-01";

const CASHFREE_PAID_PLANS = {
  GROWTH: {
    version: 1,
    planId: "plan-growth-50",
    monthlyPrice: 1999,
    annualPrice: 19990,
    gstRate: 18,
    employeeCap: 50,
    overageRate: 45,
    tier: "STARTER",
  },
  PRO: {
    version: 1,
    planId: "plan-pro-100",
    monthlyPrice: 3999,
    annualPrice: 39990,
    gstRate: 18,
    employeeCap: 100,
    overageRate: 40,
    tier: "PRO",
  },
} as const;

type PaidPlanCode = keyof typeof CASHFREE_PAID_PLANS;
type BillingInterval = "MONTHLY" | "ANNUAL";
type CashfreeEnvironment = "sandbox" | "production";

interface CashfreeOrderRecord {
  orderId: string;
  ownerUid: string;
  tenantId: string;
  planCode: PaidPlanCode;
  planId: string;
  planVersion: number;
  billingInterval: BillingInterval;
  tenantPlan: "STARTER" | "PRO";
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  employeeCap: number;
  overageRate: number;
  currency: "INR";
  orderNote: string;
}

interface CreateOrderRequest {
  planCode?: string;
  planVersion?: number;
  billingInterval?: string;
  customerPhone?: string;
}

interface ProviderOrder {
  order_id?: string;
  order_status?: string;
  order_currency?: string;
  order_amount?: number | string;
  order_note?: string;
  payment_session_id?: string;
  cf_order_id?: number | string;
}

interface CashfreeOrderResponse {
  orderId: string;
  paymentSessionId: string;
  environment: CashfreeEnvironment;
  planCode: PaidPlanCode;
  planVersion: number;
  billingInterval: BillingInterval;
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  currency: "INR";
}

interface PaymentVerification {
  status: string;
  activated: boolean;
  planCode?: PaidPlanCode;
  billingInterval?: BillingInterval;
}

/**
 * Resolves credentials and API host for the configured Cashfree environment.
 * @return {{appId: string, secretKey: string,
 *   environment: CashfreeEnvironment, apiBaseUrl: string}} Credentials.
 */
function getCashfreeCredentials(): {
  appId: string;
  secretKey: string;
  environment: CashfreeEnvironment;
  apiBaseUrl: string;
  } {
  const appId = CASHFREE_APP_ID.value().trim();
  const secretKey = CASHFREE_SECRET_KEY.value().trim();
  const environment = CASHFREE_ENV.value().trim().toLowerCase();

  if (!appId || !secretKey) {
    throw new HttpsError(
      "failed-precondition",
      "Cashfree API credentials are not configured.",
    );
  }
  if (environment !== "sandbox" && environment !== "production") {
    throw new HttpsError(
      "failed-precondition",
      "CASHFREE_ENV must be sandbox or production.",
    );
  }

  return {
    appId,
    secretKey,
    environment,
    apiBaseUrl: environment === "production" ?
      "https://api.cashfree.com/pg" :
      "https://sandbox.cashfree.com/pg",
  };
}

/**
 * Maps subscription tiers to an orderable rank for upgrade checks.
 * @param {string} plan Subscription tier.
 * @return {number|undefined} The tier rank, or undefined for unknown tiers.
 */
function getPlanRank(plan: string): number | undefined {
  const rankByPlan: Record<string, number> = {
    FREE: 0,
    TRIAL: 0,
    STARTER: 1,
    GROWTH: 1,
    PRO: 2,
    ENTERPRISE: 3,
  };
  return rankByPlan[plan.toUpperCase()];
}

/**
 * Signs order metadata so payment reconciliation can detect tampering.
 * @param {CashfreeOrderRecord} order Server-created order details.
 * @param {string} secretKey Cashfree secret used to sign the order note.
 * @return {string} The signed Cashfree order note.
 */
function createCashfreeOrderNote(
  order: CashfreeOrderRecord,
  secretKey: string,
): string {
  const signedFields = [
    order.orderId,
    order.ownerUid,
    order.tenantId,
    order.planCode,
    order.planId,
    order.planVersion,
    order.billingInterval,
    order.tenantPlan,
    order.baseAmount.toFixed(2),
    order.gstRate,
    order.gstAmount.toFixed(2),
    order.totalAmount.toFixed(2),
    order.employeeCap,
    order.overageRate,
    order.currency,
  ].join("|");
  const signature = createHmac("sha256", secretKey)
    .update(signedFields)
    .digest("hex");
  return `wf:${signature}`;
}

/**
 * Sends an authenticated, version-pinned request to the Cashfree PG API.
 * @param {string} path Cashfree API path.
 * @param {string} method HTTP method.
 * @param {Object} credentials Cashfree API credentials and environment.
 * @param {Record<string, unknown>} [body] Optional JSON request body.
 * @return {Promise<Response>} The HTTP response.
 */
async function cashfreeRequest(
  path: string,
  method: "GET" | "POST",
  credentials: ReturnType<typeof getCashfreeCredentials>,
  body?: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${credentials.apiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-version": CASHFREE_API_VERSION,
      "x-client-id": credentials.appId,
      "x-client-secret": credentials.secretKey,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
}

/**
 * Fetches the provider order used as the source of truth for payment status.
 * @param {string} orderId Cashfree order ID.
 * @param {Object} credentials Cashfree API credentials and environment.
 * @return {Promise<ProviderOrder>} The provider order.
 */
async function fetchCashfreeOrder(
  orderId: string,
  credentials: ReturnType<typeof getCashfreeCredentials>,
): Promise<ProviderOrder> {
  const response = await cashfreeRequest(
    `/orders/${encodeURIComponent(orderId)}`,
    "GET",
    credentials,
  );
  if (!response.ok) {
    console.error("Cashfree order verification failed:", response.status);
    throw new Error(
      `Cashfree order verification failed with HTTP ${response.status}.`,
    );
  }
  return await response.json() as ProviderOrder;
}

/**
 * Verifies provider order details and activates the plan idempotently.
 * @param {string} orderId Cashfree order ID.
 * @param {string} [cfPaymentId] Optional payment attempt ID.
 * @return {Promise<PaymentVerification>} The verification result.
 */
async function reconcileCashfreeOrder(
  orderId: string,
  cfPaymentId?: string,
): Promise<PaymentVerification> {
  const orderRef = db.collection("cashfree_payment_orders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error("Cashfree order was not found.");
  }

  const order = orderSnap.data() as CashfreeOrderRecord & { status?: string };
  const credentials = getCashfreeCredentials();
  const providerOrder = await fetchCashfreeOrder(orderId, credentials);
  const expectedOrderNote = createCashfreeOrderNote(
    order,
    credentials.secretKey,
  );
  const amountMatches =
    Math.round(Number(providerOrder.order_amount) * 100) ===
    Math.round(order.totalAmount * 100);

  if (
    providerOrder.order_id !== orderId ||
    providerOrder.order_note !== expectedOrderNote ||
    order.orderNote !== expectedOrderNote ||
    providerOrder.order_currency !== order.currency ||
    !amountMatches
  ) {
    throw new Error(
      "Cashfree order details do not match the recorded payment request.",
    );
  }

  if (providerOrder.order_status !== "PAID") {
    return {
      status: String(providerOrder.order_status || "UNKNOWN"),
      activated: false,
    };
  }

  return db.runTransaction(async (transaction) => {
    const currentOrderSnap = await transaction.get(orderRef);
    if (!currentOrderSnap.exists) {
      throw new Error(
        "Cashfree order was not found during payment reconciliation.",
      );
    }

    const currentOrder = currentOrderSnap.data() as CashfreeOrderRecord & {
      status?: string;
    };
    if (currentOrder.status === "PAID") {
      return {
        status: "PAID",
        activated: true,
        planCode: currentOrder.planCode,
        billingInterval: currentOrder.billingInterval,
      };
    }
    if (currentOrder.status === "PAID_REVIEW_REQUIRED") {
      return {status: "PAID_REVIEW_REQUIRED", activated: false};
    }

    const tenantRef = db.collection("tenants").doc(currentOrder.tenantId);
    const tenantSnap = await transaction.get(tenantRef);
    if (!tenantSnap.exists) {
      transaction.update(orderRef, {
        status: "PAID_REVIEW_REQUIRED",
        paidAt: new Date().toISOString(),
        cfPaymentId: cfPaymentId || null,
        reviewReason: "tenant_not_found",
      });
      return {status: "PAID_REVIEW_REQUIRED", activated: false};
    }

    const currentTenantPlan = String(tenantSnap.data()?.plan || "FREE");
    const currentRank = getPlanRank(currentTenantPlan);
    const targetRank = getPlanRank(currentOrder.tenantPlan);
    if (
      currentRank === undefined ||
      targetRank === undefined ||
      targetRank < currentRank
    ) {
      transaction.update(orderRef, {
        status: "PAID_REVIEW_REQUIRED",
        paidAt: new Date().toISOString(),
        cfPaymentId: cfPaymentId || null,
        reviewReason: "tenant_plan_changed_after_order",
      });
      return {status: "PAID_REVIEW_REQUIRED", activated: false};
    }

    const now = new Date();
    const periodEnd = new Date(now);
    const currentDay = periodEnd.getUTCDate();
    if (currentOrder.billingInterval === "ANNUAL") {
      periodEnd.setUTCDate(1);
      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    } else {
      periodEnd.setUTCDate(1);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    }
    const lastDayOfPeriodMonth = new Date(
      Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0),
    ).getUTCDate();
    periodEnd.setUTCDate(Math.min(currentDay, lastDayOfPeriodMonth));

    const nowIso = now.toISOString();
    const plan = CASHFREE_PAID_PLANS[currentOrder.planCode];
    const subscription = {
      id: orderId,
      tenantId: currentOrder.tenantId,
      provider: "CASHFREE",
      planCode: currentOrder.planCode,
      planId: currentOrder.planId,
      planVersion: currentOrder.planVersion,
      billingInterval: currentOrder.billingInterval,
      priceLockedAt: {
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        gstRate: currentOrder.gstRate,
        overageRate: currentOrder.overageRate,
        employeeCap: currentOrder.employeeCap,
        lockedAt: nowIso,
      },
      baseAmount: currentOrder.baseAmount,
      gstRate: currentOrder.gstRate,
      gstAmount: currentOrder.gstAmount,
      totalAmount: currentOrder.totalAmount,
      currency: currentOrder.currency,
      status: "ACTIVE",
      currentPeriodStart: nowIso,
      currentPeriodEnd: periodEnd.toISOString(),
      isGrandfathered: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    transaction.update(tenantRef, {
      plan: currentOrder.tenantPlan,
      billingCycleEndsAt: periodEnd.toISOString(),
      cashfreeSubscription: subscription,
      pendingDowngrade: admin.firestore.FieldValue.delete(),
      updatedAt: nowIso,
    });
    transaction.update(orderRef, {
      status: "PAID",
      paidAt: nowIso,
      cfPaymentId: cfPaymentId || null,
      providerOrderStatus: providerOrder.order_status,
    });

    return {
      status: "PAID",
      activated: true,
      planCode: currentOrder.planCode,
      billingInterval: currentOrder.billingInterval,
    };
  });
}

export const createCashfreeOrder = onCall<
  CreateOrderRequest,
  Promise<CashfreeOrderResponse>
>(
  {
    region: "asia-south1",
    maxInstances: 10,
    cors: true,
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before starting checkout.",
      );
    }

    const planCode = String(request.data?.planCode || "").toUpperCase();
    const billingInterval = request.data?.billingInterval;
    const plan = CASHFREE_PAID_PLANS[planCode as PaidPlanCode];
    if (!plan || request.data?.planVersion !== plan.version) {
      throw new HttpsError(
        "failed-precondition",
        "This plan version is not available for Cashfree checkout.",
      );
    }
    if (billingInterval !== "MONTHLY" && billingInterval !== "ANNUAL") {
      throw new HttpsError(
        "invalid-argument",
        "Choose a valid billing interval.",
      );
    }

    const customerPhone = String(request.data?.customerPhone || "")
      .replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(customerPhone)) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a valid 10-digit Indian mobile number.",
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

    const tenantRef = db.collection("tenants").doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new HttpsError(
        "not-found",
        "The organization for this account was not found.",
      );
    }
    const currentRank = getPlanRank(String(tenantSnap.data()?.plan || "FREE"));
    const targetRank = getPlanRank(plan.tier);
    if (
      currentRank === undefined ||
      targetRank === undefined ||
      targetRank < currentRank
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Plan downgrades must be handled through support.",
      );
    }

    const credentials = getCashfreeCredentials();
    const baseAmount = billingInterval === "ANNUAL" ?
      plan.annualPrice :
      plan.monthlyPrice;
    const gstAmount = Math.round(baseAmount * plan.gstRate) / 100;
    const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;
    const orderId = `wf_${Date.now().toString(36)}_` +
      randomBytes(8).toString("hex");
    const order: CashfreeOrderRecord = {
      orderId,
      ownerUid: request.auth.uid,
      tenantId,
      planCode: planCode as PaidPlanCode,
      planId: plan.planId,
      planVersion: plan.version,
      billingInterval,
      tenantPlan: plan.tier,
      baseAmount,
      gstRate: plan.gstRate,
      gstAmount,
      totalAmount,
      employeeCap: plan.employeeCap,
      overageRate: plan.overageRate,
      currency: "INR",
      orderNote: "",
    };
    order.orderNote = createCashfreeOrderNote(order, credentials.secretKey);

    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const orderRef = db.collection("cashfree_payment_orders").doc(orderId);
    await orderRef.create({
      ...order,
      status: "CREATING",
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    const returnUrl = new URL(CASHFREE_RETURN_URL.value());
    if (returnUrl.protocol !== "https:") {
      await orderRef.update({
        status: "CREATE_FAILED",
        failureReason: "invalid_return_url",
      });
      throw new HttpsError(
        "failed-precondition",
        "CASHFREE_RETURN_URL must use HTTPS.",
      );
    }
    returnUrl.searchParams.set("screen", "BILLING");

    let response: Response;
    try {
      response = await cashfreeRequest("/orders", "POST", credentials, {
        order_id: orderId,
        order_amount: totalAmount,
        order_currency: "INR",
        customer_details: {
          customer_id: request.auth.uid.slice(0, 50),
          customer_name: String(
            userProfile.companyName ||
              request.auth.token.name ||
              "WorkForcePro Customer",
          ),
          customer_phone: customerPhone,
          ...((userProfile.email || request.auth.token.email) ?
            {
              customer_email: String(
                userProfile.email || request.auth.token.email,
              ),
            } :
            {}),
        },
        order_meta: {return_url: returnUrl.toString()},
        order_expiry_time: expiresAt,
        order_note: order.orderNote,
      });
    } catch (error) {
      await orderRef.update({
        status: "CREATE_FAILED",
        failureReason: "cashfree_unavailable",
      });
      console.error("Cashfree order creation request failed:", error);
      throw new HttpsError(
        "unavailable",
        "Cashfree could not create the payment order. Please try again.",
      );
    }

    if (!response.ok) {
      const body = await response.text();
      await orderRef.update({
        status: "CREATE_FAILED",
        failureReason: `cashfree_http_${response.status}`,
      });
      console.error(
        "Cashfree order creation failed:",
        response.status,
        body.slice(0, 1000),
      );
      throw new HttpsError(
        "internal",
        "Cashfree could not create the payment order " +
          `(HTTP ${response.status}).`,
      );
    }

    const providerOrder = await response.json() as ProviderOrder;
    if (!providerOrder.payment_session_id) {
      await orderRef.update({
        status: "CREATE_FAILED",
        failureReason: "missing_payment_session_id",
      });
      throw new HttpsError(
        "internal",
        "Cashfree did not return a payment session.",
      );
    }
    await orderRef.update({
      status: "ACTIVE",
      cfOrderId: providerOrder.cf_order_id || null,
    });

    return {
      orderId,
      paymentSessionId: providerOrder.payment_session_id,
      environment: credentials.environment,
      planCode: planCode as PaidPlanCode,
      planVersion: plan.version,
      billingInterval,
      baseAmount,
      gstRate: plan.gstRate,
      gstAmount,
      totalAmount,
      currency: "INR",
    };
  },
);

export const verifyCashfreePayment = onCall<
  {orderId?: string},
  Promise<PaymentVerification>
>(
  {
    region: "asia-south1",
    maxInstances: 10,
    cors: true,
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to verify this payment.",
      );
    }
    const orderId = String(request.data?.orderId || "");
    if (!orderId) {
      throw new HttpsError(
        "invalid-argument",
        "A Cashfree order ID is required.",
      );
    }

    const orderRef = db.collection("cashfree_payment_orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.ownerUid !== request.auth.uid) {
      throw new HttpsError(
        "not-found",
        "The payment order was not found for this account.",
      );
    }

    try {
      return await reconcileCashfreeOrder(orderId);
    } catch (error) {
      console.error("Cashfree payment verification failed:", orderId, error);
      throw new HttpsError(
        "unavailable",
        "Payment status could not be verified. Please try again shortly.",
      );
    }
  },
);

export const cashfreeWebhook = onRequest(
  {
    region: "asia-south1",
    maxInstances: 10,
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY],
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }

    const signature = request.get("x-webhook-signature") || "";
    const timestamp = request.get("x-webhook-timestamp") || "";
    if (!signature || !timestamp || !request.rawBody) {
      response.status(400).send("Missing webhook signature headers or body");
      return;
    }

    const credentials = getCashfreeCredentials();
    const expectedSignature = createHmac("sha256", credentials.secretKey)
      .update(timestamp + request.rawBody.toString("utf8"))
      .digest("base64");
    const expected = Buffer.from(expectedSignature);
    const received = Buffer.from(signature);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      response.status(400).send("Invalid webhook signature");
      return;
    }

    let payload: {
      type?: string;
      data?: {
        order?: { order_id?: string };
        payment?: { payment_status?: string; cf_payment_id?: number | string };
      };
    };
    try {
      payload = JSON.parse(request.rawBody.toString("utf8"));
    } catch (error) {
      console.error("Cashfree sent an invalid webhook body:", error);
      response.status(400).send("Invalid webhook body");
      return;
    }

    const orderId = payload.data?.order?.order_id;
    const payment = payload.data?.payment;
    if (
      payload.type !== "PAYMENT_SUCCESS_WEBHOOK" ||
      payment?.payment_status !== "SUCCESS" ||
      !orderId
    ) {
      response.status(200).send("Ignored");
      return;
    }

    try {
      await reconcileCashfreeOrder(orderId, payment.cf_payment_id?.toString());
      response.status(200).send("OK");
    } catch (error) {
      console.error("Cashfree webhook reconciliation failed:", orderId, error);
      response.status(500).send("Payment reconciliation failed");
    }
  },
);
