<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Ku3_mTkLHXpfaXnJfiJjtjuDk7gobFB1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Cashfree Payments

See [CASHFREE_SETUP.md](./CASHFREE_SETUP.md) for Firebase secrets, webhook
registration, sandbox testing, and native platform setup.

## Razorpay Standard Checkout

The Billing screen uses the Firebase callable functions
`createRazorpayOrder` and `verifyRazorpayPayment`. The server currently supports
Growth and Pro plan version 1; order totals are calculated and checked on the
server, including GST.

For production, configure both Firebase Functions secrets and deploy:

```text
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase deploy --only functions
```

For local development, the ignored `.env` and `codebase/.secret.local` files
hold the supplied test credentials. Never commit either file. After deploying
the Functions, run `npm run dev`, sign in as a factory owner, and select the
Growth or Pro plan to test checkout.
