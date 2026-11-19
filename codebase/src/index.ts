/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";

// Cashfree functions
export { createCashfreeOrder } from "./cashfree";
export { verifyCashfreePayment } from "./cashfree";
export { cashfreeWebhook } from "./cashfree";

// Razorpay functions
export { createRazorpayOrder, verifyRazorpayPayment } from "./razorpay";

// For cost control, set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({
  maxInstances: 10,
  // All v2 functions default to this region.
  region: "asia-south1",
});