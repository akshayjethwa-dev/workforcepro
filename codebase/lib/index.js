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
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
admin.initializeApp();
const db = admin.firestore();
// ✅ SECURE: Using Firebase Secrets instead of hardcoded key
const GEMINI_API_KEY = (0, params_1.defineSecret)('GEMINI_API_KEY');
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
    // ✅ Changed from genAI to getGenAI()
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
    const today = new Date().toISOString().split('T')[0];
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
    return { message: 'General query - no specific data needed' };
}
async function generateResponse(userQuery, firestoreData, intent, language) {
    // ✅ Changed from genAI to getGenAI()
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
    const today = new Date();
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('today')) {
        return today.toISOString().split('T')[0];
    }
    if (lowerMessage.includes('yesterday')) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0];
    }
    return null;
}
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (dateStr === today)
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
//# sourceMappingURL=index.js.map