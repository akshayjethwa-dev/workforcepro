import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

admin.initializeApp();
const db = admin.firestore();

// ✅ SECURE: Using Firebase Secrets instead of hardcoded key
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

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