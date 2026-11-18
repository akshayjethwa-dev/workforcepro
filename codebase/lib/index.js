"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePayrollFinalization = exports.auditTenantSalaryStructures = exports.validateWorkerWageStructure = exports.chatWithAI = exports.cashfreeWebhook = exports.verifyCashfreePayment = exports.createCashfreeOrder = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const generative_ai_1 = require("@google/generative-ai");
const wageValidation_1 = require("./wageValidation");
admin.initializeApp();
const db = admin.firestore();
// ✅ SECURE: Using Firebase Secrets instead of hardcoded key
const GEMINI_API_KEY = (0, params_1.defineSecret)('GEMINI_API_KEY');
const CASHFREE_APP_ID = (0, params_1.defineSecret)('CASHFREE_APP_ID');
const CASHFREE_SECRET_KEY = (0, params_1.defineSecret)('CASHFREE_SECRET_KEY');
const CASHFREE_ENV = (0, params_1.defineString)('CASHFREE_ENV', { default: 'sandbox' });
const CASHFREE_RETURN_URL = (0, params_1.defineString)('CASHFREE_RETURN_URL', {
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
};
function getCashfreeCredentials() {
    const appId = CASHFREE_APP_ID.value().trim();
    const secretKey = CASHFREE_SECRET_KEY.value().trim();
    const environment = CASHFREE_ENV.value().trim().toLowerCase();
    if (!appId || !secretKey) {
        throw new https_1.HttpsError('failed-precondition', 'Cashfree API credentials are not configured.');
    }
    if (environment !== 'sandbox' && environment !== 'production') {
        throw new https_1.HttpsError('failed-precondition', 'CASHFREE_ENV must be sandbox or production.');
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
function getPlanRank(plan) {
    const rankByPlan = {
        FREE: 0,
        TRIAL: 0,
        STARTER: 1,
        GROWTH: 1,
        PRO: 2,
        ENTERPRISE: 3
    };
    return rankByPlan[plan.toUpperCase()];
}
function createCashfreeOrderNote(order, secretKey) {
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
    return `wf:${(0, crypto_1.createHmac)('sha256', secretKey).update(signedFields).digest('hex')}`;
}
async function fetchCashfreeOrder(orderId, apiBaseUrl, appId, secretKey) {
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
    return await response.json();
}
async function reconcileCashfreeOrder(orderId, cfPaymentId) {
    const orderRef = db.collection('cashfree_payment_orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
        throw new Error('Cashfree order was not found.');
    }
    const order = orderSnap.data();
    const credentials = getCashfreeCredentials();
    const providerOrder = await fetchCashfreeOrder(orderId, credentials.apiBaseUrl, credentials.appId, credentials.secretKey);
    const expectedOrderNote = createCashfreeOrderNote(order, credentials.secretKey);
    if (providerOrder.order_id !== orderId ||
        providerOrder.order_note !== expectedOrderNote ||
        order.orderNote !== expectedOrderNote ||
        providerOrder.order_currency !== order.currency ||
        Math.round(Number(providerOrder.order_amount) * 100) !== Math.round(order.totalAmount * 100)) {
        throw new Error('Cashfree order details do not match the recorded payment request.');
    }
    if (providerOrder.order_status !== 'PAID') {
        return { status: String(providerOrder.order_status || 'UNKNOWN'), activated: false };
    }
    return db.runTransaction(async (transaction) => {
        var _a;
        const currentOrderSnap = await transaction.get(orderRef);
        if (!currentOrderSnap.exists) {
            throw new Error('Cashfree order was not found during payment reconciliation.');
        }
        const currentOrder = currentOrderSnap.data();
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
        const currentTenantPlan = String(((_a = tenantSnap.data()) === null || _a === void 0 ? void 0 : _a.plan) || 'FREE');
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
        }
        else {
            periodEnd.setUTCDate(1);
            periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
        }
        const lastDayOfPeriodMonth = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0)).getUTCDate();
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
exports.createCashfreeOrder = (0, https_1.onCall)({
    region: 'asia-south1',
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY]
}, async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in before starting checkout.');
    }
    const data = request.data;
    const planCode = String((data === null || data === void 0 ? void 0 : data.planCode) || '').toUpperCase();
    const billingInterval = data === null || data === void 0 ? void 0 : data.billingInterval;
    const plan = CASHFREE_PAID_PLANS[planCode];
    if (!plan || (data === null || data === void 0 ? void 0 : data.planVersion) !== plan.version) {
        throw new https_1.HttpsError('failed-precondition', 'This plan version is not available for Cashfree checkout.');
    }
    if (billingInterval !== 'MONTHLY' && billingInterval !== 'ANNUAL') {
        throw new https_1.HttpsError('invalid-argument', 'Choose a valid billing interval.');
    }
    const customerPhone = String((data === null || data === void 0 ? void 0 : data.customerPhone) || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(customerPhone)) {
        throw new https_1.HttpsError('invalid-argument', 'Enter a valid 10-digit Indian mobile number.');
    }
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    if (!userSnap.exists || ((_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'FACTORY_OWNER') {
        throw new https_1.HttpsError('permission-denied', 'Only a factory owner can purchase a plan.');
    }
    const userProfile = userSnap.data();
    const tenantId = String(userProfile.tenantId || '');
    if (!tenantId) {
        throw new https_1.HttpsError('failed-precondition', 'Your account is not associated with a tenant.');
    }
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
        throw new https_1.HttpsError('not-found', 'The organization for this account was not found.');
    }
    const currentPlan = String(((_b = tenantSnap.data()) === null || _b === void 0 ? void 0 : _b.plan) || 'FREE');
    const currentRank = getPlanRank(currentPlan);
    const targetRank = getPlanRank(plan.tier);
    if (currentRank === undefined || targetRank === undefined || targetRank < currentRank) {
        throw new https_1.HttpsError('failed-precondition', 'Plan downgrades must be handled through support.');
    }
    const credentials = getCashfreeCredentials();
    const baseAmount = billingInterval === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
    const gstAmount = Math.round(baseAmount * plan.gstRate) / 100;
    const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;
    const orderId = `wf_${Date.now().toString(36)}_${(0, crypto_1.randomBytes)(8).toString('hex')}`;
    const order = {
        orderId,
        ownerUid: request.auth.uid,
        tenantId,
        planCode: planCode,
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
    await orderRef.create(Object.assign(Object.assign({}, order), { status: 'CREATING', expiresAt, createdAt: new Date().toISOString() }));
    const returnUrl = new URL(CASHFREE_RETURN_URL.value());
    if (returnUrl.protocol !== 'https:') {
        await orderRef.update({ status: 'CREATE_FAILED', failureReason: 'invalid_return_url' });
        throw new https_1.HttpsError('failed-precondition', 'CASHFREE_RETURN_URL must use HTTPS.');
    }
    returnUrl.searchParams.set('screen', 'BILLING');
    let response;
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
                customer_details: Object.assign({ customer_id: request.auth.uid.slice(0, 50), customer_name: String(userProfile.companyName || request.auth.token.name || 'WorkForcePro Customer'), customer_phone: customerPhone }, (userProfile.email || request.auth.token.email
                    ? { customer_email: String(userProfile.email || request.auth.token.email) }
                    : {})),
                order_meta: { return_url: returnUrl.toString() },
                order_expiry_time: expiresAt,
                order_note: order.orderNote
            })
        });
    }
    catch (error) {
        await orderRef.update({ status: 'CREATE_FAILED', failureReason: 'cashfree_unavailable' });
        console.error('Cashfree order creation request failed:', error);
        throw new https_1.HttpsError('unavailable', 'Cashfree could not create the payment order. Please try again.');
    }
    if (!response.ok) {
        const body = await response.text();
        await orderRef.update({ status: 'CREATE_FAILED', failureReason: `cashfree_http_${response.status}` });
        console.error('Cashfree order creation failed:', response.status, body.slice(0, 1000));
        throw new https_1.HttpsError('internal', `Cashfree could not create the payment order (HTTP ${response.status}).`);
    }
    const providerOrder = await response.json();
    if (!providerOrder.payment_session_id) {
        await orderRef.update({ status: 'CREATE_FAILED', failureReason: 'missing_payment_session_id' });
        throw new https_1.HttpsError('internal', 'Cashfree did not return a payment session.');
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
});
exports.verifyCashfreePayment = (0, https_1.onCall)({
    region: 'asia-south1',
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY]
}, async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in to verify this payment.');
    }
    const orderId = String(((_a = request.data) === null || _a === void 0 ? void 0 : _a.orderId) || '');
    if (!orderId) {
        throw new https_1.HttpsError('invalid-argument', 'A Cashfree order ID is required.');
    }
    const orderSnap = await db.collection('cashfree_payment_orders').doc(orderId).get();
    if (!orderSnap.exists || ((_b = orderSnap.data()) === null || _b === void 0 ? void 0 : _b.ownerUid) !== request.auth.uid) {
        throw new https_1.HttpsError('not-found', 'The payment order was not found for this account.');
    }
    try {
        return await reconcileCashfreeOrder(orderId);
    }
    catch (error) {
        console.error('Cashfree payment verification failed:', orderId, error);
        throw new https_1.HttpsError('unavailable', 'Payment status could not be verified. Please try again shortly.');
    }
});
exports.cashfreeWebhook = (0, https_1.onRequest)({
    region: 'asia-south1',
    secrets: [CASHFREE_APP_ID, CASHFREE_SECRET_KEY]
}, async (request, response) => {
    var _a, _b, _c, _d;
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
    const expectedSignature = (0, crypto_1.createHmac)('sha256', credentials.secretKey)
        .update(timestamp + rawBody)
        .digest('base64');
    const expected = Buffer.from(expectedSignature);
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !(0, crypto_1.timingSafeEqual)(expected, received)) {
        response.status(400).send('Invalid webhook signature');
        return;
    }
    let payload;
    try {
        payload = JSON.parse(rawBody);
    }
    catch (error) {
        console.error('Cashfree sent an invalid webhook body:', error);
        response.status(400).send('Invalid webhook body');
        return;
    }
    const orderId = (_b = (_a = payload.data) === null || _a === void 0 ? void 0 : _a.order) === null || _b === void 0 ? void 0 : _b.order_id;
    const payment = (_c = payload.data) === null || _c === void 0 ? void 0 : _c.payment;
    if (payload.type !== 'PAYMENT_SUCCESS_WEBHOOK' || (payment === null || payment === void 0 ? void 0 : payment.payment_status) !== 'SUCCESS' || !orderId) {
        response.status(200).send('Ignored');
        return;
    }
    try {
        await reconcileCashfreeOrder(orderId, (_d = payment.cf_payment_id) === null || _d === void 0 ? void 0 : _d.toString());
        response.status(200).send('OK');
    }
    catch (error) {
        console.error('Cashfree webhook reconciliation failed:', orderId, error);
        response.status(500).send('Payment reconciliation failed');
    }
});
// ✅ Lazy initialization - only creates when needed
let genAI = null;
function getGenAI() {
    if (!genAI) {
        genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY.value());
    }
    return genAI;
}
var QueryIntent;
(function (QueryIntent) {
    QueryIntent["ATTENDANCE_TODAY"] = "attendance_today";
    QueryIntent["ATTENDANCE_SPECIFIC"] = "attendance_specific";
    QueryIntent["OVERTIME"] = "overtime";
    QueryIntent["PAYROLL"] = "payroll";
    QueryIntent["WORKER_INFO"] = "worker_info";
    QueryIntent["ADVANCES"] = "advances";
    QueryIntent["WORKER_COUNT"] = "worker_count";
    QueryIntent["GENERAL"] = "general";
})(QueryIntent || (QueryIntent = {}));
exports.chatWithAI = (0, https_1.onCall)({
    region: 'asia-south1',
    timeoutSeconds: 60,
    memory: '512MiB',
    // ✅ SECURE: Binds the secret to this function
    secrets: [GEMINI_API_KEY]
}, async (request) => {
    var _a, _b, _c;
    console.log('🔐 Auth Status:', {
        hasAuth: !!request.auth,
        uid: (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid,
        email: (_c = (_b = request.auth) === null || _b === void 0 ? void 0 : _b.token) === null || _c === void 0 ? void 0 : _c.email
    });
    const { message, tenantId, language = 'english' } = request.data;
    if (!message || !tenantId) {
        throw new https_1.HttpsError('invalid-argument', 'Message and tenantId are required');
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
    }
    catch (error) {
        console.error('AI Chat Error:', error);
        throw new https_1.HttpsError('internal', `Failed to process request: ${error.message || error}`);
    }
});
async function classifyIntent(message) {
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
    const intentMap = {
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
async function fetchDataBasedOnIntent(intent, tenantId, message) {
    var _a, _b;
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
            const firstIn = timeline.find((p) => p.type === 'IN');
            if (firstIn) {
                checkInTime = formatTime(firstIn.timestamp);
            }
            const lastOut = [...timeline].reverse().find((p) => p.type === 'OUT');
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
            totalHours: ((_a = attendance.hours) === null || _a === void 0 ? void 0 : _a.total) || 0,
            overtime: ((_b = attendance.hours) === null || _b === void 0 ? void 0 : _b.overtime) || 0,
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
        const presentWorkerIds = new Set(attendance.map((a) => a.workerId));
        const absentWorkers = allWorkers.filter(w => !presentWorkerIds.has(w.id));
        return {
            date: today,
            presentCount: attendance.filter((a) => a.status === 'PRESENT' || a.status === 'HALF_DAY').length,
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
        const totalPayroll = payrolls.reduce((sum, p) => sum + (p.netPayable || 0), 0);
        return {
            month: currentMonth,
            totalPayroll,
            workerCount: payrolls.length,
            payrolls: payrolls.map((p) => ({
                workerName: p.workerName,
                netPayable: p.netPayable,
                status: p.status
            }))
        };
    }
    return { message: 'General query - no specific data needed' };
}
async function generateResponse(userQuery, firestoreData, intent, language) {
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
function extractWorkerName(message) {
    const commonWords = ['check', 'in', 'time', 'of', 'for', 'give', 'me', 'show', 'what', 'when', 'did', 'the', 'a', 'an', 'is', 'was', 'today', 'yesterday', 'attendance', 'punch', 'present'];
    const words = message.split(' ').filter(word => !commonWords.includes(word.toLowerCase()) &&
        word.length > 2 &&
        /^[A-Za-z]+$/.test(word));
    for (const word of words) {
        if (word[0] === word[0].toUpperCase()) {
            return word;
        }
    }
    return words[0] || null;
}
function extractDate(message) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('today')) {
        return getISTDateString();
    }
    if (lowerMessage.includes('yesterday')) {
        const yesterday = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        yesterday.setDate(yesterday.getDate() - 1);
        const y = yesterday.getFullYear();
        const m = String(yesterday.getMonth() + 1).padStart(2, '0');
        const d = String(yesterday.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return null;
}
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const todayStr = getISTDateString();
    const yesterday = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayStr = `${y}-${m}-${d}`;
    if (dateStr === todayStr)
        return 'today';
    if (dateStr === yesterdayStr)
        return 'yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTime(timestamp) {
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
function getISTDateString(date = new Date()) {
    var _a, _b, _c;
    const options = {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);
    const year = (_a = parts.find(p => p.type === 'year')) === null || _a === void 0 ? void 0 : _a.value;
    const month = (_b = parts.find(p => p.type === 'month')) === null || _b === void 0 ? void 0 : _b.value;
    const day = (_c = parts.find(p => p.type === 'day')) === null || _c === void 0 ? void 0 : _c.value;
    return `${year}-${month}-${day}`;
}
function getISTMonthString() {
    return getISTDateString().slice(0, 7);
}
// ============================================================================
// WAGE STRUCTURE VALIDATION & 50% RULE AUDIT (SERVER-SIDE CLOUD FUNCTIONS)
// ============================================================================
exports.validateWorkerWageStructure = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
    const data = request.data;
    if (!(data === null || data === void 0 ? void 0 : data.worker)) {
        throw new https_1.HttpsError('invalid-argument', 'Worker wage payload is required.');
    }
    const evalDate = data.evaluationDate || getISTDateString();
    return (0, wageValidation_1.auditWorkerWageStructureServer)(data.worker, evalDate, data.defaultState || 'Maharashtra', Boolean(data.ignoreRevisionCutoff), Array.isArray(data.branches) ? data.branches : [], Array.isArray(data.minimumWageRevisions) ? data.minimumWageRevisions : []);
});
exports.auditTenantSalaryStructures = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
    const data = request.data;
    if (!(data === null || data === void 0 ? void 0 : data.tenantId)) {
        throw new https_1.HttpsError('invalid-argument', 'tenantId is required.');
    }
    const evalDate = data.asOfDate || getISTDateString();
    let workersList = Array.isArray(data.workers) ? data.workers : [];
    if (workersList.length === 0) {
        const snap = await db
            .collection('workers')
            .where('tenantId', '==', data.tenantId)
            .get();
        workersList = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
    }
    const activeWorkers = workersList.filter(w => w.status !== 'INACTIVE' && w.isActive !== false);
    const branches = Array.isArray(data.branches) ? data.branches : [];
    const revisions = Array.isArray(data.minimumWageRevisions) ? data.minimumWageRevisions : [];
    const results = activeWorkers.map(w => (0, wageValidation_1.auditWorkerWageStructureServer)(w, evalDate, data.defaultState || 'Maharashtra', false, branches, revisions));
    const nonCompliant = results.filter(r => r.isFiftyPercentNonCompliant);
    const minWageViolations = results.filter(r => r.isMinimumWageViolation);
    const totalComplianceGapMonthly = Math.round(nonCompliant.reduce((sum, r) => sum + r.gapAmount, 0) * 100) / 100;
    const estimatedExtraStatutoryLiabilityMonthly = Math.round(nonCompliant.reduce((sum, r) => sum + r.estimatedAdditionalPfMonthly + r.estimatedAdditionalGratuityMonthly, 0) * 100) / 100;
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
});
exports.validatePayrollFinalization = (0, https_1.onCall)({ region: 'asia-south1', timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
    var _a;
    const data = request.data;
    if (!(data === null || data === void 0 ? void 0 : data.tenantId) || !(data === null || data === void 0 ? void 0 : data.month)) {
        throw new https_1.HttpsError('invalid-argument', 'tenantId and month are required.');
    }
    const evalDate = data.asOfDate || `${data.month}-28`;
    let workersList = Array.isArray(data.workers) ? data.workers : [];
    if (workersList.length === 0) {
        const snap = await db
            .collection('workers')
            .where('tenantId', '==', data.tenantId)
            .get();
        workersList = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
    }
    const activeWorkers = workersList.filter(w => w.status !== 'INACTIVE' && w.isActive !== false);
    const branches = Array.isArray(data.branches) ? data.branches : [];
    const revisions = Array.isArray(data.minimumWageRevisions) ? data.minimumWageRevisions : [];
    const allResults = activeWorkers.map(w => (0, wageValidation_1.auditWorkerWageStructureServer)(w, evalDate, data.defaultState || 'Maharashtra', false, branches, revisions));
    const flaggedWorkers = allResults.filter(r => r.hasAnyViolation);
    const blockingMinimumWageWorkers = allResults.filter(r => r.isMinimumWageViolation);
    const isPayrollBlocked = blockingMinimumWageWorkers.length > 0;
    const nonCompliantCount = allResults.filter(r => r.isFiftyPercentNonCompliant).length;
    const minimumWageViolationCount = blockingMinimumWageWorkers.length;
    const totalGapAmount = Math.round(allResults.reduce((sum, r) => sum + r.gapAmount, 0) * 100) / 100;
    const totalProjectedGratuityIncreaseAnnual = Math.round(allResults.reduce((sum, r) => { var _a; return sum + ((_a = r.estimatedAdditionalGratuityAnnual) !== null && _a !== void 0 ? _a : Math.round((r.deemedWageAddBack * 15) / 26)); }, 0));
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
            actorUid: ((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid) || 'system',
            totalWorkersChecked: allResults.length,
            nonCompliantCount,
            minimumWageViolationCount,
            isPayrollBlocked,
            blockingErrorCode: isPayrollBlocked ? 'MINIMUM_WAGE_VIOLATION' : null,
            totalGapAmount,
            totalProjectedGratuityIncreaseAnnual,
            flaggedWorkerIds: flaggedWorkers.map(w => w.workerId || w.workerName || 'unknown'),
        });
    }
    catch (logErr) {
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
});
//# sourceMappingURL=index.js.map