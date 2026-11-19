/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";

// Keep your Cashfree functions exported exactly as before
export { createCashfreeOrder } from "./cashfree";
export { verifyCashfreePayment } from "./cashfree";
export { cashfreeWebhook } from "./cashfree";
export { createRazorpayOrder, verifyRazorpayPayment } from "./razorpay";

// For cost control, set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({
  maxInstances: 10,
  // 👇 Add this so every v2 function defaults to your region.
  // You can still override per-function inside cashfree.ts if needed.
  region: "asia-south1",
});