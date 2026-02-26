// functions/index.js

const { onCall, HttpsError } = require("firebase-functions/v2/https");

const admin = require('firebase-admin');

const { GoogleGenerativeAI } = require('@google/generative-ai');

admin.initializeApp();

const db = admin.firestore();


// ... (keep your 'tools' and 'systemInstructionText' definitions)

exports.askFactoryAI = onCall({

  secrets: ["GEMINI_API_KEY"],

  memory: "1GiB",

  timeoutSeconds: 60,

  region: "us-central1"

}, async (request) => {

 

  if (!request.auth) {

    throw new HttpsError('unauthenticated', 'Must be logged in.');

  }



  const { tenantId, message } = request.data;

  const apiKey = process.env.GEMINI_API_KEY;



  try {

    const genAI = new GoogleGenerativeAI(apiKey);

   

    // FIX: Use the stable model name 'gemini-1.5-flash'

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



    // FIX: Access functionCalls correctly as a property, not a method

    const calls = response.functionCalls();

   

    if (calls && calls.length > 0) {

      const call = calls[0];

      let apiResponse = {};



      if (call.name === "getTodayAttendanceSummary") {

        // ... (your existing attendance logic)

      }

      else if (call.name === "getMonthlyPayrollSummary") {

        // ... (your existing payroll logic)

      }

      else if (call.name === "getWorkersList") {

        // ... (your existing workers logic)

      }



      // Send the tool output back to the model

      result = await chat.sendMessage([{

        functionResponse: { name: call.name, response: apiResponse }

      }]);

    }



    return { reply: result.response.text() };



  } catch (error) {

    console.error("AI Error:", error);

    // Return the specific error message to help you debug in the browser console

    throw new HttpsError('internal', error.message || 'AI processing failed.');

  }

});