// functions/index.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

admin.initializeApp();
const db = admin.firestore();

// 1. SYSTEM INSTRUCTIONS: Defines the AI's persona and rules
const systemInstructionText = "You are an expert Factory AI assistant. You help managers track attendance, payroll, and worker details using the provided tools. Always be precise and professional.";

// 2. TOOLS DEFINITION: Declarations for the functions the AI can trigger
const tools = [
  {
    functionDeclarations: [
      {
        name: "getTodayAttendanceSummary",
        description: "Returns a summary of which workers are present, absent, or on leave today.",
      },
      {
        name: "getMonthlyPayrollSummary",
        description: "Calculates and returns the total payroll expenses for the current month.",
      },
      {
        name: "getWorkersList",
        description: "Retrieves a list of all active workers in the factory.",
      }
    ]
  }
];

exports.askFactoryAI = onCall({
  secrets: ["GEMINI_API_KEY"],
  memory: "1GiB",
  timeoutSeconds: 60,
  region: "asia-south1" // UPDATED: Changed to India region
}, async (request) => {
 
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The user must be authenticated.');
  }

  const { tenantId, message } = request.data;
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
   
    // Initializing the model with tools and system instructions
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      tools,
      systemInstruction: {
        role: "system",
        parts: [{ text: systemInstructionText }]
      }
    });
   
    const chat = model.startChat();
    let result = await chat.sendMessage(message);
    let response = result.response;

    // FIX: Safely detect if functionCalls is a method or a property
    const calls = typeof response.functionCalls === 'function' ? response.functionCalls() : response.functionCalls;
   
    if (calls && calls.length > 0) {
      const call = calls[0];
      let apiResponse = {};

      // Logic for tool execution
      if (call.name === "getTodayAttendanceSummary") {
        // Your existing attendance logic here
      }
      else if (call.name === "getMonthlyPayrollSummary") {
        // Your existing payroll logic here
      }
      else if (call.name === "getWorkersList") {
        // Your existing workers logic here
      }

      // Feed the tool data back to the AI for the final answer
      result = await chat.sendMessage([{
        functionResponse: { name: call.name, response: apiResponse }
      }]);
    }

    return { reply: result.response.text() };

  } catch (error) {
    console.error("AI Service Error:", error);
    throw new HttpsError('internal', error.message || 'An error occurred during AI processing.');
  }
});