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
exports.chatWithAI = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
admin.initializeApp();
const db = admin.firestore();
// ✅ SIMPLE: Hardcoded API key (no secrets)
const GEMINI_API_KEY = 'AIzaSyAo_lEkpMKCIwdEKf2T8KU_ft_VPTj9OWQ';
const genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY);
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
// ✅ NO SECRETS in function config
exports.chatWithAI = functions.https.onCall({
    region: 'asia-south1',
    timeoutSeconds: 60,
    memory: '512MiB'
    // ❌ NO secrets: [] here!
}, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { message, tenantId, language = 'english' } = request.data;
    if (!message || !tenantId) {
        throw new functions.https.HttpsError('invalid-argument', 'Message and tenantId are required');
    }
    try {
        console.log(`AI Query from ${tenantId}: ${message}`);
        const intent = await classifyIntent(message);
        console.log(`Classified intent: ${intent}`);
        const firestoreData = await fetchDataBasedOnIntent(intent, tenantId, message);
        console.log(`Fetched data:`, firestoreData);
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
        throw new functions.https.HttpsError('internal', `Failed to process request: ${error}`);
    }
});
async function classifyIntent(message) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `
You are an intent classifier for a factory workforce management system.
Classify this user query into ONE category:

Categories:
- attendance_today: "Who is absent today?", "Who came today?", "Today's attendance"
- attendance_specific: "Was Ramesh present yesterday?", "Attendance for specific date/person"
- overtime: "How much overtime did [name] do?", "Overtime this week/month"
- payroll: "Total payroll cost", "Monthly salary expenses", "Payment summary"
- worker_info: "Worker details", "Phone number of [name]", "Department info"
- advances: "Advances given", "How much kharchi did [name] take?"
- worker_count: "How many workers?", "Total employees", "Active workers"
- general: Any other questions

User query: "${message}"

Respond with ONLY the category name (e.g., "attendance_today"), nothing else.
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
    var _a, _b, _c;
    const today = new Date().toISOString().split('T')[0];
    switch (intent) {
        case QueryIntent.ATTENDANCE_TODAY: {
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
                name: doc.data().name,
                phone: doc.data().phone
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
        case QueryIntent.OVERTIME: {
            const workerName = extractWorkerName(message);
            let workerId = null;
            if (workerName) {
                const workerSnapshot = await db
                    .collection('workers')
                    .where('tenantId', '==', tenantId)
                    .where('name', '==', workerName)
                    .limit(1)
                    .get();
                if (!workerSnapshot.empty) {
                    workerId = workerSnapshot.docs[0].id;
                }
            }
            const query = db
                .collection('attendance')
                .where('tenantId', '==', tenantId);
            const attendanceSnapshot = workerId
                ? await query.where('workerId', '==', workerId).get()
                : await query.get();
            const overtimeRecords = attendanceSnapshot.docs
                .map(doc => doc.data())
                .filter((record) => { var _a; return ((_a = record.hours) === null || _a === void 0 ? void 0 : _a.overtime) > 0; });
            return {
                workerName,
                overtimeRecords: overtimeRecords.map((r) => ({
                    workerName: r.workerName,
                    date: r.date,
                    overtimeHours: r.hours.overtime
                }))
            };
        }
        case QueryIntent.PAYROLL: {
            const currentMonth = new Date().toISOString().slice(0, 7);
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
        case QueryIntent.WORKER_INFO: {
            const workerName = extractWorkerName(message);
            if (workerName) {
                const workerSnapshot = await db
                    .collection('workers')
                    .where('tenantId', '==', tenantId)
                    .where('name', '==', workerName)
                    .limit(1)
                    .get();
                if (!workerSnapshot.empty) {
                    const worker = workerSnapshot.docs[0].data();
                    return {
                        workerName: worker.name,
                        phone: worker.phone,
                        department: worker.department,
                        designation: worker.designation,
                        joinedDate: worker.joinedDate,
                        wageType: (_a = worker.wageConfig) === null || _a === void 0 ? void 0 : _a.type,
                        amount: (_b = worker.wageConfig) === null || _b === void 0 ? void 0 : _b.amount
                    };
                }
            }
            const workersSnapshot = await db
                .collection('workers')
                .where('tenantId', '==', tenantId)
                .where('status', '==', 'ACTIVE')
                .get();
            return {
                workers: workersSnapshot.docs.map(doc => ({
                    name: doc.data().name,
                    department: doc.data().department,
                    designation: doc.data().designation
                }))
            };
        }
        case QueryIntent.ADVANCES: {
            const advancesSnapshot = await db
                .collection('advances')
                .where('tenantId', '==', tenantId)
                .where('status', '==', 'APPROVED')
                .get();
            const advances = advancesSnapshot.docs.map(doc => doc.data());
            const totalAdvances = advances.reduce((sum, a) => sum + a.amount, 0);
            const workerIds = [...new Set(advances.map((a) => a.workerId))];
            const workerNames = {};
            for (const wid of workerIds) {
                const workerDoc = await db.collection('workers').doc(wid).get();
                if (workerDoc.exists) {
                    workerNames[wid] = ((_c = workerDoc.data()) === null || _c === void 0 ? void 0 : _c.name) || 'Unknown';
                }
            }
            return {
                totalAdvances,
                count: advances.length,
                advances: advances.map((a) => ({
                    workerName: workerNames[a.workerId],
                    amount: a.amount,
                    date: a.date,
                    reason: a.reason
                }))
            };
        }
        case QueryIntent.WORKER_COUNT: {
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
        default:
            return { message: 'General query - no specific data needed' };
    }
}
async function generateResponse(userQuery, firestoreData, intent, language) {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
3. Use ₹ symbol for money (e.g., ₹5,000)
4. Format numbers clearly with commas
5. If data is empty, say "No records found" politely
6. Keep response under 5 sentences
7. If asked about absent workers, list names clearly
8. For overtime, show hours and worker names
9. For payroll, show total amount clearly

Generate a helpful response:
`;
    const result = await model.generateContent(prompt);
    return result.response.text();
}
function extractWorkerName(message) {
    const words = message.split(' ');
    for (const word of words) {
        if (word[0] === word[0].toUpperCase() && word.length > 2 && /^[A-Za-z]+$/.test(word)) {
            return word;
        }
    }
    return null;
}
//# sourceMappingURL=index.js.map