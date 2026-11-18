import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  auditWorkerWageStructureServer,
  ServerBranchInput,
  ServerMinWageRevisionRule,
  ServerWorkerInput,
} from './wageValidation';

admin.initializeApp();
const db = admin.firestore();

// ✅ SECURE: Using Firebase Secrets instead of hardcoded key
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const CASHFREE_APP_ID = defineSecret('CASHFREE_APP_ID');
const CASHFREE_SECRET_KEY = defineSecret('CASHFREE_SECRET_KEY');
const CASHFREE_ENV = defineString('CASHFREE_ENV', { default: 'sandbox' });
const CASHFREE_RETURN_URL = defineString('CASHFREE_RETURN_URL', {
  default: 'https://workforcepro-saas.web.app/'
});

const CASHFREE_API_VERSION = '2026-01-01';
const CASHFREE_PAID_PLANS = {
  GROWTH: {
    version: 1,
    planId: 'plan-growth-50',
    monthlyPrice: 1999,
    annualPrice: 19990,
    gstRate: 18,
    employeeCap: 50,
    overageRate: 45,
    tier: 'STARTER'
  },
  PRO: {
    version: 1,
    planId: 'plan-pro-100',
    monthlyPrice: 3999,
    annualPrice: 39990,
    gstRate: 18,
    employeeCap: 100,
    overageRate: 40,
    tier: 'PRO'
  }
} as const;

type CashfreeEnvironment = 'sandbox' | 'production';

interface CashfreeOrderRecord {
  orderId: string;
  ownerUid: string;
  tenantId: string;
  planCode: 'GROWTH' | 'PRO';
  planId: string;
  planVersion: number;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  tenantPlan: 'STARTER' | 'PRO';
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  employeeCap: number;
  overageRate: number;
  currency: 'INR';
  orderNote: string;
}

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
    throw new HttpsError('failed-precondition', 'Cashfree API credentials are not configured.');
  }
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new HttpsError('failed-precondition', 'CASHFREE_ENV must be sandbox or production.');
  }

  return {
    appId,
    secretKey,
    environment,
    apiBaseUrl: environment === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'
  };
}

function getPlanRank(plan: string): number | undefined {
  const rankByPlan: Record<string, number> = {
    FREE: 0,
    TRIAL: 0,
    STARTER: 1,
    GROWTH: 1,
    PRO: 2,
    ENTERPRISE: 3
  };
  return rankByPlan[plan.toUpperCase()];
}

function createCashfreeOrderNote(order: CashfreeOrderRecord, secretKey: string): string {
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
    order.currency
  ].join('|');
  return `wf:${createHmac('sha256', secretKey).update(signedFields).digest('hex')}`;
}

async function fetchCashfreeOrder(orderId: string, apiBaseUrl: string, appId: string, secretKey: string) {
  const response = await fetch(`${apiBaseUrl}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      'x-api-version': CASHFREE_API_VERSION,
      'x-client-id': appId,
      'x-client-secret': secretKey,
      'x-request-id': orderId
    }
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('Cashfree order verification failed:', response.status, body.slice(0, 1000));
    throw new Error(`Cashfree order verification failed with HTTP ${response.status}.`);
  }

  return await response.json() as Record<string, any>;
}

async function reconcileCashfreeOrder(orderId: string, cfPaymentId?: string): Promise<{
  status: string;
  activated: boolean;
  planCode?: string;
  billingInterval?: string;
}> {
  const orderRef = db.collection('cashfree_payment_orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error('Cashfree order was not found.');
  }

  const order = orderSnap.data() as CashfreeOrderRecord & {
    status?: string;
    ownerUid?: string;
  };
  const credentials = getCashfreeCredentials();
  const providerOrder = await fetchCashfreeOrder(
    orderId,
    credentials.apiBaseUrl,
    credentials.appId,
    credentials.secretKey
  );
  const expectedOrderNote = createCashfreeOrderNote(order, credentials.secretKey);

  if (
    providerOrder.order_id !== orderId ||
    providerOrder.order_note !== expectedOrderNote ||
    order.orderNote !== expectedOrderNote ||
    providerOrder.order_currency !== order.currency ||
    Math.round(Number(providerOrder.order_amount) * 100) !== Math.round(order.totalAmount * 100)
  ) {
    throw new Error('Cashfree order details do not match the recorded payment request.');
  }

  if (providerOrder.order_status !== 'PAID') {
    return { status: String(providerOrder.order_status || 'UNKNOWN'), activated: false };
  }

  return db.runTransaction(async (transaction) => {
    const currentOrderSnap = await transaction.get(orderRef);
    if (!currentOrderSnap.exists) {
      throw new Error('Cashfree order was not found during payment reconciliation.');
    }

    const currentOrder = currentOrderSnap.data() as CashfreeOrderRecord & { status?: string };
    if (currentOrder.status === 'PAID') {
      return {
        status: 'PAID',
        activated: true,
        planCode: currentOrder.planCode,
        billingInterval: currentOrder.billingInterval
      };
    }
    if (currentOrder.status === 'PAID_REVIEW_REQUIRED') {
      return { status: 'PAID_REVIEW_REQUIRED', activated: false };
    }

    const tenantRef = db.collection('tenants').doc(currentOrder.tenantId);
    const tenantSnap = await transaction.get(tenantRef);
    if (!tenantSnap.exists) {
      transaction.update(orderRef, {
        status: 'PAID_REVIEW_REQUIRED',
        paidAt: new Date().toISOString(),
        cfPaymentId: cfPaymentId || null,
        reviewReason: 'tenant_not_found'
      });
      return { status: 'PAID_REVIEW_REQUIRED', activated: false };
    }

    const currentTenantPlan = String(tenantSnap.data()?.plan || 'FREE');
    const currentRank = getPlanRank(currentTenantPlan);
    const targetRank = getPlanRank(currentOrder.tenantPlan);
    if (currentRank === undefined || targetRank === undefined || targetRank < currentRank) {
      transaction.update(orderRef, {
        status: 'PAID_REVIEW_REQUIRED',
        paidAt: new Date().toISOString(),
        cfPaymentId: cfPaymentId || null,
        reviewReason: 'tenant_plan_changed_after_order'
      });
      return { status: 'PAID_REVIEW_REQUIRED', activated: false };
    }

    const now = new Date();
    const periodEnd = new Date(now);
    const currentDay = periodEnd.getUTCDate();
    if (currentOrder.billingInterval === 'ANNUAL') {
      periodEnd.setUTCDate(1);
      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    } else {
      periodEnd.setUTCDate(1);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    }
    const lastDayOfPeriodMonth = new Date(
      Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0)
    ).getUTCDate();
    periodEnd.setUTCDate(Math.min(currentDay, lastDayOfPeriodMonth));

    const nowIso = now.toISOString();
    const subscription = {
      id: orderId,
      tenantId: currentOrder.tenantId,
      provider: 'CASHFREE',
      planCode: currentOrder.planCode,
      planId: currentOrder.planId,
      planVersion: currentOrder.planVersion,
      billingInterval: currentOrder.billingInterval,
      priceLockedAt: {
        monthlyPrice: CASHFREE_PAID_PLANS[currentOrder.planCode].monthlyPrice,
        annualPrice: CASHFREE_PAID_PLANS[currentOrder.planCode].annualPrice,
        gstRate: currentOrder.gstRate,
        overageRate: currentOrder.overageRate,
        employeeCap: currentOrder.employeeCap,
        lockedAt: nowIso
      },
      baseAmount: currentOrder.baseAmount,
      gstRate: currentOrder.gstRate,
      gstAmount: currentOrder.gstAmount,
      totalAmount: currentOrder.totalAmount,
      currency: currentOrder.currency,
      status: 'ACTIVE',
      currentPeriodStart: nowIso,
      currentPeriodEnd: periodEnd.toISOString(),
      isGrandfathered: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    transaction.update(tenantRef, {
      plan: currentOrder.tenantPlan,
      billingCycleEndsAt: periodEnd.toISOString(),
      cashfreeSubscription: subscription,
      pendingDowngrade: admin.firestore.FieldValue.delete(),
      updatedAt: nowIso
    });
    transaction.update(orderRef, {
      status: 'PAID',
      paidAt: nowIso,
      cfPaymentId: cfPaymentId || null,
      providerOrderStatus: providerOrder.order_status
    });

    return {
      status: 'PAID',
      activated: true,
      planCode: currentOrder.planCode,
      billingInterval: currentOrder.billingInterval
    };
  });
}

export const createCashfreeOrder = onCall(
  {
    region: 'asia-south1',
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before starting checkout.');
    }

    const data = request.data as {
      planCode?: string;
      planVersion?: number;
      billingInterval?: string;
      customerPhone?: string;
    };
    const planCode = String(data?.planCode || '').toUpperCase();
    const billingInterval = data?.billingInterval;
    const plan = CASHFREE_PAID_PLANS[planCode as keyof typeof CASHFREE_PAID_PLANS];

    if (!plan || data?.planVersion !== plan.version) {
      throw new HttpsError('failed-precondition', 'This plan version is not available for Cashfree checkout.');
    }
    if (billingInterval !== 'MONTHLY' && billingInterval !== 'ANNUAL') {
      throw new HttpsError('invalid-argument', 'Choose a valid billing interval.');
    }

    const customerPhone = String(data?.customerPhone || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(customerPhone)) {
      throw new HttpsError('invalid-argument', 'Enter a valid 10-digit Indian mobile number.');
    }

    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== 'FACTORY_OWNER') {
      throw new HttpsError('permission-denied', 'Only a factory owner can purchase a plan.');
    }
    const userProfile = userSnap.data()!;
    const tenantId = String(userProfile.tenantId || '');
    if (!tenantId) {
      throw new HttpsError('failed-precondition', 'Your account is not associated with a tenant.');
    }

    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new HttpsError('not-found', 'The organization for this account was not found.');
    }
    const currentPlan = String(tenantSnap.data()?.plan || 'FREE');
    const currentRank = getPlanRank(currentPlan);
    const targetRank = getPlanRank(plan.tier);
    if (currentRank === undefined || targetRank === undefined || targetRank < currentRank) {
      throw new HttpsError('failed-precondition', 'Plan downgrades must be handled through support.');
    }

    const credentials = getCashfreeCredentials();
    const baseAmount = billingInterval === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
    const gstAmount = Math.round(baseAmount * plan.gstRate) / 100;
    const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;
    const orderId = `wf_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
    const order: CashfreeOrderRecord = {
      orderId,
      ownerUid: request.auth.uid,
      tenantId,
      planCode: planCode as 'GROWTH' | 'PRO',
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
      currency: 'INR',
      orderNote: ''
    };
    order.orderNote = createCashfreeOrderNote(order, credentials.secretKey);

    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const orderRef = db.collection('cashfree_payment_orders').doc(orderId);
    await orderRef.create({
      ...order,
      status: 'CREATING',
      expiresAt,
      createdAt: new Date().toISOString()
    });

    const returnUrl = new URL(CASHFREE_RETURN_URL.value());
    if (returnUrl.protocol !== 'https:') {
      await orderRef.update({ status: 'CREATE_FAILED', failureReason: 'invalid_return_url' });
      throw new HttpsError('failed-precondition', 'CASHFREE_RETURN_URL must use HTTPS.');
    }
    returnUrl.searchParams.set('screen', 'BILLING');

    let response: Response;
    try {
      response = await fetch(`${credentials.apiBaseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': CASHFREE_API_VERSION,
          'x-client-id': credentials.appId,
          'x-client-secret': credentials.secretKey,
          'x-request-id': orderId
        },
        body: JSON.stringify({
          order_id: orderId,
          order_amount: totalAmount,
          order_currency: 'INR',
          customer_details: {
            customer_id: request.auth.uid.slice(0, 50),
            customer_name: String(userProfile.companyName || request.auth.token.name || 'WorkForcePro Customer'),
            customer_phone: customerPhone,
            ...(userProfile.email || request.auth.token.email
              ? { customer_email: String(userProfile.email || request.auth.token.email) }
              : {})
          },
          order_meta: { return_url: returnUrl.toString() },
          order_expiry_time: expiresAt,
          order_note: order.orderNote
        })
      });
    } catch (error) {
      await orderRef.update({ status: 'CREATE_FAILED', failureReason: 'cashfree_unavailable' });
      console.error('Cashfree order creation request failed:', error);
      throw new HttpsError('unavailable', 'Cashfree could not create the payment order. Please try again.');
    }

    if (!response.ok) {
      const body = await response.text();
      await orderRef.update({ status: 'CREATE_FAILED', failureReason: `cashfree_http_${response.status}` });
      console.error('Cashfree order creation failed:', response.status, body.slice(0, 1000));
      throw new HttpsError('internal', `Cashfree could not create the payment order (HTTP ${response.status}).`);
    }

    const providerOrder = await response.json() as { payment_session_id?: string; cf_order_id?: number | string };
    if (!providerOrder.payment_session_id) {
      await orderRef.update({ status: 'CREATE_FAILED', failureReason: 'missing_payment_session_id' });
      throw new HttpsError('internal', 'Cashfree did not return a payment session.');
    }
    await orderRef.update({
      status: 'ACTIVE',
      cfOrderId: providerOrder.cf_order_id || null
    });

    return {
      orderId,
      paymentSessionId: providerOrder.payment_session_id,
      environment: credentials.environment,
      planCode,
      planVersion: plan.version,
      billingInterval,
      baseAmount,
      gstRate: plan.gstRate,
      gstAmount,
      totalAmount,
      currency: 'INR'
    };
  }
);

export const verifyCashfreePayment = onCall(
  {
    region: 'asia-south1',
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to verify this payment.');
    }
    const orderId = String(request.data?.orderId || '');
    if (!orderId) {
      throw new HttpsError('invalid-argument', 'A Cashfree order ID is required.');
    }

    const orderSnap = await db.collection('cashfree_payment_orders').doc(orderId).get();
    if (!orderSnap.exists || orderSnap.data()?.ownerUid !== request.auth.uid) {
      throw new HttpsError('not-found', 'The payment order was not found for this account.');
    }

    try {
      return await reconcileCashfreeOrder(orderId);
    } catch (error) {
      console.error('Cashfree payment verification failed:', orderId, error);
      throw new HttpsError('unavailable', 'Payment status could not be verified. Please try again shortly.');
    }
  }
);

export const cashfreeWebhook = onRequest(
  {
    region: 'asia-south1',
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY]
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }

    const signature = request.get('x-webhook-signature') || '';
    const timestamp = request.get('x-webhook-timestamp') || '';
    if (!signature || !timestamp || !request.rawBody) {
      response.status(400).send('Missing webhook signature headers or body');
      return;
    }

    const credentials = getCashfreeCredentials();
    const rawBody = request.rawBody.toString('utf8');
    const expectedSignature = createHmac('sha256', credentials.secretKey)
      .update(timestamp + rawBody)
      .digest('base64');
    const expected = Buffer.from(expectedSignature);
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      response.status(400).send('Invalid webhook signature');
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
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.error('Cashfree sent an invalid webhook body:', error);
      response.status(400).send('Invalid webhook body');
      return;
    }

    const orderId = payload.data?.order?.order_id;
    const payment = payload.data?.payment;
    if (payload.type !== 'PAYMENT_SUCCESS_WEBHOOK' || payment?.payment_status !== 'SUCCESS' || !orderId) {
      response.status(200).send('Ignored');
      return;
    }

    try {
      await reconcileCashfreeOrder(orderId, payment.cf_payment_id?.toString());
      response.status(200).send('OK');
    } catch (error) {
      console.error('Cashfree webhook reconciliation failed:', orderId, error);
      response.status(500).send('Payment reconciliation failed');
    }
  }
);

// ✅ Lazy initialization - only creates when needed
let genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
  }
  return genAI;
}

enum QueryIntent {
  ATTENDANCE_TODAY = 'attendance_today',
  ATTENDANCE_SPECIFIC = 'attendance_specific',
  OVERTIME = 'overtime',
  PAYROLL = 'payroll',
  WORKER_INFO = 'worker_info',
  ADVANCES = 'advances',
  WORKER_COUNT = 'worker_count',
  GENERAL = 'general'
}

interface ChatRequest {
  message: string;
  tenantId: string;
  language?: 'english' | 'gujarati';
}

export const chatWithAI = onCall(
  {
    region: 'asia-south1',
    timeoutSeconds: 60,
    memory: '512MiB',
    // ✅ SECURE: Binds the secret to this function
    secrets: [GEMINI_API_KEY]
  },
  async (request) => {
    console.log('🔐 Auth Status:', {
      hasAuth: !!request.auth,
      uid: request.auth?.uid,
      email: request.auth?.token?.email
    });

    const { message, tenantId, language = 'english' } = request.data as ChatRequest;

    if (!message || !tenantId) {
      throw new HttpsError(
        'invalid-argument',
        'Message and tenantId are required'
      );
    }

    try {
      console.log(`AI Query from ${tenantId}: ${message}`);

      const intent = await classifyIntent(message);
      console.log(`Classified intent: ${intent}`);

      const firestoreData = await fetchDataBasedOnIntent(intent, tenantId, message);
      console.log(`Fetched data:`, JSON.stringify(firestoreData).substring(0, 500));

      const response = await generateResponse(message, firestoreData, intent, language);

      return { 
        success: true, 
        response,
        intent,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('AI Chat Error:', error);
      throw new HttpsError(
        'internal', 
        `Failed to process request: ${error.message || error}`
      );
    }
  }
);

async function classifyIntent(message: string): Promise<QueryIntent> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are an intent classifier for a factory workforce management system.
Classify this user query into ONE category:

Categories:
- attendance_today: "Who is absent today?", "Who came today?", "Today's attendance summary"
- attendance_specific: "Check-in time of [name]", "punch in time", "When did [name] arrive?", "Was [name] present on [date]?", "Attendance of [name]", "Show me [name]'s attendance"
- overtime: "How much overtime did [name] do?", "Overtime this week/month"
- payroll: "Total payroll cost", "Monthly salary expenses", "Payment summary"
- worker_info: "Phone number of [name]", "Department of [name]", "Worker details of [name]"
- advances: "Advances given to [name]", "How much kharchi did [name] take?"
- worker_count: "How many workers?", "Total employees", "Active workers count"
- general: System questions, greetings, unclear queries

User query: "${message}"

Respond with ONLY the category name (e.g., "attendance_specific"), nothing else.
`;

  const result = await model.generateContent(prompt);
  const response = result.response.text().trim().toLowerCase();
  
  const intentMap: Record<string, QueryIntent> = {
    'attendance_today': QueryIntent.ATTENDANCE_TODAY,
    'attendance_specific': QueryIntent.ATTENDANCE_SPECIFIC,
    'overtime': QueryIntent.OVERTIME,
    'payroll': QueryIntent.PAYROLL,
    'worker_info': QueryIntent.WORKER_INFO,
    'advances': QueryIntent.ADVANCES,
    'worker_count': QueryIntent.WORKER_COUNT,
    'general': QueryIntent.GENERAL
  };

  return intentMap[response] || QueryIntent.GENERAL;
}

async function fetchDataBasedOnIntent(
  intent: QueryIntent,
  tenantId: string,
  message: string
): Promise<any> {
  // ✅ Fixed Timezone: Using IST date instead of UTC
  const today = getISTDateString();

  console.log(`📍 Processing intent: ${intent}`);

  if (intent === QueryIntent.ATTENDANCE_SPECIFIC) {
    console.log('🎯 ATTENDANCE_SPECIFIC case triggered');
    
    const workerName = extractWorkerName(message);
    const targetDate = extractDate(message) || today;

    console.log('🔍 Searching for worker:', workerName, 'on date:', targetDate);

    if (!workerName) {
      return { 
        error: 'Could not identify worker name',
        message: 'Please specify which worker you want to check'
      };
    }

    // Get ALL active workers
    const allWorkersSnap = await db
      .collection('workers')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'ACTIVE')
      .get();

    console.log('📋 Total active workers found:', allWorkersSnap.size);

    if (allWorkersSnap.empty) {
      return {
        error: 'No active workers found',
        message: 'There are no active workers in your system'
      };
    }

    // Find matching worker
    let matchedWorkerId = null;
    let matchedWorkerName = null;
    const searchNameLower = workerName.toLowerCase().trim();

    // Exact match
    for (const doc of allWorkersSnap.docs) {
      const dbName = doc.data().name.toLowerCase().trim();
      if (dbName === searchNameLower) {
        matchedWorkerId = doc.id;
        matchedWorkerName = doc.data().name;
        console.log('✅ Exact match found:', matchedWorkerName);
        break;
      }
    }

    // Partial match
    if (!matchedWorkerId) {
      for (const doc of allWorkersSnap.docs) {
        const dbName = doc.data().name.toLowerCase().trim();
        if (dbName.includes(searchNameLower) || searchNameLower.includes(dbName)) {
          matchedWorkerId = doc.id;
          matchedWorkerName = doc.data().name;
          console.log('✅ Partial match found:', matchedWorkerName);
          break;
        }
      }
    }

    if (!matchedWorkerId) {
      console.log('❌ No worker found matching:', workerName);
      const availableNames = allWorkersSnap.docs.map(d => d.data().name);
      console.log('Available workers:', availableNames);
      return {
        error: 'Worker not found',
        searchedName: workerName,
        availableWorkers: availableNames,
        message: `Could not find "${workerName}". Available: ${availableNames.slice(0, 5).join(', ')}`
      };
    }

    console.log('🎯 Using worker:', matchedWorkerName, 'ID:', matchedWorkerId);

    // Get attendance
    const attendanceSnap = await db
      .collection('attendance')
      .where('tenantId', '==', tenantId)
      .where('workerId', '==', matchedWorkerId)
      .where('date', '==', targetDate)
      .limit(1)
      .get();

    console.log('📅 Attendance records found:', attendanceSnap.size);

    if (attendanceSnap.empty) {
      return {
        workerName: matchedWorkerName,
        date: targetDate,
        status: 'ABSENT',
        message: `No attendance record for ${matchedWorkerName} on ${formatDate(targetDate)}`
      };
    }

    const attendance = attendanceSnap.docs[0].data();
    console.log('✅ Attendance status:', attendance.status);

    let checkInTime = 'Not recorded';
    let checkOutTime = 'Not checked out yet';

    if (attendance.timeline && attendance.timeline.length > 0) {
      const timeline = attendance.timeline;
      const firstIn = timeline.find((p: any) => p.type === 'IN');
      if (firstIn) {
        checkInTime = formatTime(firstIn.timestamp);
      }
      const lastOut = [...timeline].reverse().find((p: any) => p.type === 'OUT');
      if (lastOut) {
        checkOutTime = formatTime(lastOut.timestamp);
      }
    }

    return {
      workerName: matchedWorkerName,
      date: targetDate,
      status: attendance.status || 'PRESENT',
      checkInTime,
      checkOutTime,
      totalHours: attendance.hours?.total || 0,
      overtime: attendance.hours?.overtime || 0,
      timeline: attendance.timeline || []
    };
  }

  if (intent === QueryIntent.ATTENDANCE_TODAY) {
    const attendanceSnapshot = await db
      .collection('attendance')
      .where('tenantId', '==', tenantId)
      .where('date', '==', today)
      .get();

    const workersSnapshot = await db
      .collection('workers')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'ACTIVE')
      .get();

    const attendance = attendanceSnapshot.docs.map(doc => doc.data());
    const allWorkers = workersSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name
    }));

    const presentWorkerIds = new Set(attendance.map((a: any) => a.workerId));
    const absentWorkers = allWorkers.filter(w => !presentWorkerIds.has(w.id));

    return {
      date: today,
      presentCount: attendance.filter((a: any) => a.status === 'PRESENT' || a.status === 'HALF_DAY').length,
      absentCount: absentWorkers.length,
      totalWorkers: allWorkers.length,
      absentWorkers: absentWorkers.map(w => w.name),
      attendance: attendance
    };
  }

  if (intent === QueryIntent.WORKER_COUNT) {
    const workersSnapshot = await db
      .collection('workers')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'ACTIVE')
      .get();

    return {
      totalWorkers: workersSnapshot.size,
      workers: workersSnapshot.docs.map(doc => ({
        name: doc.data().name,
        department: doc.data().department
      }))
    };
  }

  if (intent === QueryIntent.PAYROLL) {
    // ✅ Fixed Timezone: Using IST month instead of UTC
    const currentMonth = getISTMonthString();
    
    const payrollSnapshot = await db
      .collection('payrolls')
      .where('tenantId', '==', tenantId)
      .where('month', '==', currentMonth)
      .get();

    const payrolls = payrollSnapshot.docs.map(doc => doc.data());
    const totalPayroll = payrolls.reduce((sum: number, p: any) => sum + (p.netPayable || 0), 0);

    return {
      month: currentMonth,
      totalPayroll,
      workerCount: payrolls.length,
      payrolls: payrolls.map((p: any) => ({
        workerName: p.workerName,
        netPayable: p.netPayable,
        status: p.status
      }))
    };
  }

  return { message: 'General query - no specific data needed' };
}

async function generateResponse(
  userQuery: string,
  firestoreData: any,
  intent: QueryIntent,
  language: 'english' | 'gujarati'
): Promise<string> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' });

  const languageInstruction = language === 'gujarati' 
    ? 'Respond in Gujarati script (ગુજરાતી). Use English numbers (123) but Gujarati text.'
    : 'Respond in simple English.';

  const prompt = `
You are a helpful AI assistant for a factory owner in Gujarat, India.

Owner's question: "${userQuery}"

Data from their system:
${JSON.stringify(firestoreData, null, 2)}

Instructions:
1. ${languageInstruction}
2. Be conversational and friendly
3. Use ₹ symbol for money
4. If data shows error or "not found", politely explain
5. For check-in/out times, format clearly
6. If worker absent, say so clearly
7. Keep response under 5 sentences

Generate a helpful response:
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

function extractWorkerName(message: string): string | null {
  const commonWords = ['check', 'in', 'time', 'of', 'for', 'give', 'me', 'show', 'what', 'when', 'did', 'the', 'a', 'an', 'is', 'was', 'today', 'yesterday', 'attendance', 'punch', 'present'];
  
  const words = message.split(' ').filter(word => 
    !commonWords.includes(word.toLowerCase()) && 
    word.length > 2 &&
    /^[A-Za-z]+$/.test(word)
  );

  for (const word of words) {
    if (word[0] === word[0].toUpperCase()) {
      return word;
    }
  }

  return words[0] || null;
}

function extractDate(message: string): string | null {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('today')) {
    return getISTDateString();
  }

  if (lowerMessage.includes('yesterday')) {
    const yesterday = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    yesterday.setDate(yesterday.getDate() - 1);
    
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const todayStr = getISTDateString();
  
  const yesterday = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, '0');
  const d = String(yesterday.getDate()).padStart(2, '0');
  const yesterdayStr = `${y}-${m}-${d}`;

  if (dateStr === todayStr) return 'today';
  if (dateStr === yesterdayStr) return 'yesterday';
  
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-IN', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
}

// ==========================================
// 🕒 IST Timezone Helper Functions Added
// ==========================================

function getISTDateString(date: Date = new Date()): string {
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  };
  
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  
  return `${year}-${month}-${day}`;
}

function getISTMonthString(): string {
  return getISTDateString().slice(0, 7);
}

// ============================================================================
// WAGE STRUCTURE VALIDATION & 50% RULE AUDIT (SERVER-SIDE CLOUD FUNCTIONS)
// ============================================================================

export const validateWorkerWageStructure = onCall(
  { region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    const data = request.data as {
      worker: ServerWorkerInput;
      evaluationDate?: string;
      defaultState?: string;
      ignoreRevisionCutoff?: boolean;
      branches?: ServerBranchInput[];
      minimumWageRevisions?: ServerMinWageRevisionRule[];
    };

    if (!data?.worker) {
      throw new HttpsError('invalid-argument', 'Worker wage payload is required.');
    }

    const evalDate = data.evaluationDate || getISTDateString();
    return auditWorkerWageStructureServer(
      data.worker,
      evalDate,
      data.defaultState || 'Maharashtra',
      Boolean(data.ignoreRevisionCutoff),
      Array.isArray(data.branches) ? data.branches : [],
      Array.isArray(data.minimumWageRevisions) ? data.minimumWageRevisions : []
    );
  }
);

export const auditTenantSalaryStructures = onCall(
  { region: 'asia-south1', timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    const data = request.data as {
      tenantId: string;
      asOfDate?: string;
      defaultState?: string;
      workers?: ServerWorkerInput[];
      branches?: ServerBranchInput[];
      minimumWageRevisions?: ServerMinWageRevisionRule[];
    };

    if (!data?.tenantId) {
      throw new HttpsError('invalid-argument', 'tenantId is required.');
    }

    const evalDate = data.asOfDate || getISTDateString();
    let workersList: ServerWorkerInput[] = Array.isArray(data.workers) ? data.workers : [];

    if (workersList.length === 0) {
      const snap = await db
        .collection('workers')
        .where('tenantId', '==', data.tenantId)
        .get();
      workersList = snap.docs.map(d => ({ id: d.id, ...(d.data() as ServerWorkerInput) }));
    }

    const activeWorkers = workersList.filter(
      w => w.status !== 'INACTIVE' && w.isActive !== false
    );

    const branches = Array.isArray(data.branches) ? data.branches : [];
    const revisions = Array.isArray(data.minimumWageRevisions) ? data.minimumWageRevisions : [];

    const results = activeWorkers.map(w =>
      auditWorkerWageStructureServer(
        w,
        evalDate,
        data.defaultState || 'Maharashtra',
        false,
        branches,
        revisions
      )
    );

    const nonCompliant = results.filter(r => r.isFiftyPercentNonCompliant);
    const minWageViolations = results.filter(r => r.isMinimumWageViolation);

    const totalComplianceGapMonthly = Math.round(
      nonCompliant.reduce((sum, r) => sum + r.gapAmount, 0) * 100
    ) / 100;

    const estimatedExtraStatutoryLiabilityMonthly = Math.round(
      nonCompliant.reduce(
        (sum, r) => sum + r.estimatedAdditionalPfMonthly + r.estimatedAdditionalGratuityMonthly,
        0
      ) * 100
    ) / 100;

    return {
      tenantId: data.tenantId,
      auditedAt: new Date().toISOString(),
      asOfDate: evalDate,
      verificationSource: 'CLOUD_FUNCTION',
      totalWorkersAudited: results.length,
      compliantCount: results.filter(r => !r.isFiftyPercentNonCompliant).length,
      nonCompliantCount: nonCompliant.length,
      minimumWageViolationCount: minWageViolations.length,
      totalComplianceGapMonthly,
      estimatedExtraStatutoryLiabilityMonthly,
      results,
    };
  }
);

export const validatePayrollFinalization = onCall(
  { region: 'asia-south1', timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    const data = request.data as {
      tenantId: string;
      month: string;
      asOfDate?: string;
      defaultState?: string;
      workers?: ServerWorkerInput[];
      branches?: ServerBranchInput[];
      minimumWageRevisions?: ServerMinWageRevisionRule[];
    };

    if (!data?.tenantId || !data?.month) {
      throw new HttpsError('invalid-argument', 'tenantId and month are required.');
    }

    const evalDate = data.asOfDate || `${data.month}-28`;
    let workersList: ServerWorkerInput[] = Array.isArray(data.workers) ? data.workers : [];

    if (workersList.length === 0) {
      const snap = await db
        .collection('workers')
        .where('tenantId', '==', data.tenantId)
        .get();
      workersList = snap.docs.map(d => ({ id: d.id, ...(d.data() as ServerWorkerInput) }));
    }

    const activeWorkers = workersList.filter(
      w => w.status !== 'INACTIVE' && w.isActive !== false
    );

    const branches = Array.isArray(data.branches) ? data.branches : [];
    const revisions = Array.isArray(data.minimumWageRevisions) ? data.minimumWageRevisions : [];

    const allResults = activeWorkers.map(w =>
      auditWorkerWageStructureServer(
        w,
        evalDate,
        data.defaultState || 'Maharashtra',
        false,
        branches,
        revisions
      )
    );

    const flaggedWorkers = allResults.filter(r => r.hasAnyViolation);
    const blockingMinimumWageWorkers = allResults.filter(r => r.isMinimumWageViolation);
    const isPayrollBlocked = blockingMinimumWageWorkers.length > 0;
    const nonCompliantCount = allResults.filter(r => r.isFiftyPercentNonCompliant).length;
    const minimumWageViolationCount = blockingMinimumWageWorkers.length;
    const totalGapAmount = Math.round(
      allResults.reduce((sum, r) => sum + r.gapAmount, 0) * 100
    ) / 100;
    const totalProjectedGratuityIncreaseAnnual = Math.round(
      allResults.reduce(
        (sum, r) => sum + (r.estimatedAdditionalGratuityAnnual ?? Math.round((r.deemedWageAddBack * 15) / 26)),
        0
      )
    );
    const labourCodeEffectiveDate = '2025-11-21';
    const isRetrospectivePeriod = (data.month || '').slice(0, 7) < '2025-11';
    const retrospectiveWarning = isRetrospectivePeriod
      ? `Retrospective Payroll (${data.month} — pre-21 Nov 2025): Defaulting to legacy EPF/ESIC rules without 50% Rule excess allowance add-back. New Labour Code rules apply to current and future periods.`
      : undefined;

    const validatedAt = new Date().toISOString();

    // Persist server pre-finalization audit trail in Firestore
    try {
      await db.collection('payroll_audit_logs').add({
        tenantId: data.tenantId,
        month: data.month,
        validatedAt,
        labourCodeEffectiveDate,
        isRetrospectivePeriod,
        actorUid: request.auth?.uid || 'system',
        totalWorkersChecked: allResults.length,
        nonCompliantCount,
        minimumWageViolationCount,
        isPayrollBlocked,
        blockingErrorCode: isPayrollBlocked ? 'MINIMUM_WAGE_VIOLATION' : null,
        totalGapAmount,
        totalProjectedGratuityIncreaseAnnual,
        flaggedWorkerIds: flaggedWorkers.map(w => w.workerId || w.workerName || 'unknown'),
      });
    } catch (logErr) {
      console.warn('Could not persist payroll_audit_logs entry:', logErr);
    }

    return {
      tenantId: data.tenantId,
      month: data.month,
      validatedAt,
      labourCodeEffectiveDate,
      isRetrospectivePeriod,
      retrospectiveWarning,
      verificationSource: 'CLOUD_FUNCTION',
      hasFlaggedWorkers: flaggedWorkers.length > 0,
      isPayrollBlocked,
      blockingErrorCode: isPayrollBlocked ? 'MINIMUM_WAGE_VIOLATION' : undefined,
      blockingReason: isPayrollBlocked
        ? `MINIMUM_WAGE_VIOLATION: Payroll blocked for ${blockingMinimumWageWorkers.length} employee(s) whose Basic Pay falls below state minimum wage.`
        : undefined,
      nonCompliantCount,
      minimumWageViolationCount,
      totalGapAmount,
      totalProjectedGratuityIncreaseAnnual,
      flaggedWorkers,
      blockingMinimumWageWorkers,
      allResults,
    };
  }
);