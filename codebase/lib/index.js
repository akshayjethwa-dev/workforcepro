"use strict";
/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRazorpayPayment = exports.createRazorpayOrder = exports.cashfreeWebhook = exports.verifyCashfreePayment = exports.createCashfreeOrder = void 0;
const firebase_functions_1 = require("firebase-functions");
// Keep your Cashfree functions exported exactly as before
var cashfree_1 = require("./cashfree");
Object.defineProperty(exports, "createCashfreeOrder", { enumerable: true, get: function () { return cashfree_1.createCashfreeOrder; } });
var cashfree_2 = require("./cashfree");
Object.defineProperty(exports, "verifyCashfreePayment", { enumerable: true, get: function () { return cashfree_2.verifyCashfreePayment; } });
var cashfree_3 = require("./cashfree");
Object.defineProperty(exports, "cashfreeWebhook", { enumerable: true, get: function () { return cashfree_3.cashfreeWebhook; } });
var razorpay_1 = require("./razorpay");
Object.defineProperty(exports, "createRazorpayOrder", { enumerable: true, get: function () { return razorpay_1.createRazorpayOrder; } });
Object.defineProperty(exports, "verifyRazorpayPayment", { enumerable: true, get: function () { return razorpay_1.verifyRazorpayPayment; } });
// For cost control, set the maximum number of containers that can be
// running at the same time.
(0, firebase_functions_1.setGlobalOptions)({
    maxInstances: 10,
    // 👇 Add this so every v2 function defaults to your region.
    // You can still override per-function inside cashfree.ts if needed.
    region: "asia-south1",
});
//# sourceMappingURL=index.js.map