// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

admin.initializeApp();
const db = admin.firestore();

// 1. DEFINE THE TOOLS FOR GEMINI
const tools = [
  {
    functionDeclarations: [
      {
        name: "getTodayAttendanceSummary",
        description: "Fetches the exact names and total counts of workers who are present, absent, or late for the current day.",
        parameters: { type: "object", properties: {}, required: [] }
      },
      {
        name: "getMonthlyPayrollSummary",
        description: "Fetches the total estimated payroll cost and total overtime hours for the current month.",
        parameters: { type: "object", properties: {}, required: [] }
      },
      {
        name: "getWorkersList",
        description: "Fetches the list of all registered workers, including their names and departments.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    ]
  }
];

// 2. THE SYSTEM PROMPT
const systemInstruction = `You are a highly intelligent, polite factory assistant for WorkforcePro. 
Your job is to answer the factory owner's questions about their factory using the provided tools.
RULES:
1. Only answer questions related to attendance, payroll, workers, and factory operations. If asked about general knowledge, politely decline.
2. ALWAYS reply in the exact same language the user asks in (e.g., if they ask in Hindi, reply in Hindi).
3. If they ask for lists of names, format them nicely using bullet points.
4. Be concise. Factory owners are busy.`;

// 3. SECURE EXECUTION WITH SECRETS
// We explicitly tell Firebase: "Allow this function to unlock and read the GEMINI_API_KEY"
exports.askFactoryAI = functions.runWith({ secrets: ["GEMINI_API_KEY"] }).https.onCall(async (data, context) => {
  
  // Security Check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  }

  const { tenantId, message } = data;
  if (!tenantId || !message) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing tenantId or message.');
  }

  // Load the key from the secure vault inside the function
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("API Key is missing from the environment!");
    throw new functions.https.HttpsError('internal', 'AI is missing its API Key.');
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools, systemInstruction });
    
    const chat = model.startChat();
    let result = await chat.sendMessage(message);
    const response = result.response;

    // INTERCEPT & EXECUTE FUNCTION CALLS
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      let apiResponse = {};

      if (call.name === "getTodayAttendanceSummary") {
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.collection('attendance')
            .where('tenantId', '==', tenantId)
            .where('date', '==', today)
            .get();
        
        let present = [], absent = [], late = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const name = data.workerName || "Unknown Worker";
            if (data.status === 'PRESENT') present.push(name);
            if (data.status === 'ABSENT') absent.push(name);
            if (data.lateStatus && data.lateStatus.isLate) late.push(name);
        });
        apiResponse = { 
            counts: { present: present.length, absent: absent.length, late: late.length },
            names: { present, absent, late },
            date: today 
        };
      } 
      
      else if (call.name === "getMonthlyPayrollSummary") {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const snapshot = await db.collection('payrolls')
            .where('tenantId', '==', tenantId)
            .where('month', '==', currentMonth)
            .get();
        
        let totalCost = 0, totalOvertime = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            totalCost += (data.netPayable || 0);
            totalOvertime += (data.attendanceSummary?.totalOvertimeHours || 0);
        });
        apiResponse = { totalCost, totalOvertime, month: currentMonth, currency: 'INR' };
      }

      else if (call.name === "getWorkersList") {
        const snapshot = await db.collection('workers')
            .where('tenantId', '==', tenantId)
            .get();
        
        let workers = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            workers.push({ name: data.name, department: data.department || 'Unassigned' });
        });
        apiResponse = { totalWorkers: workers.length, workersList: workers };
      }

      // Send the data back to Gemini to translate into text
      result = await chat.sendMessage([{
        functionResponse: { name: call.name, response: apiResponse }
      }]);
    }

    // RETURN FINAL TEXT TO FRONTEND
    return { reply: result.response.text() };

  } catch (error) {
    console.error("AI Assistant Error details:", error);
    throw new functions.https.HttpsError('internal', 'AI processing failed.');
  }
});