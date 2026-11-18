# Cashfree Payments setup

The Billing screen uses a one-time Cashfree payment for supported paid plan
versions. Order creation, price calculation, payment verification, and plan
activation run in Firebase Functions. Renewals are manual; this does not create
a recurring mandate.

## Configure sandbox

1. In the Cashfree Merchant Dashboard, switch to Test mode and copy the sandbox
   App ID and Secret Key. Check **Settings → Payment Gateway → Payment
   Methods** for enabled methods.
2. Set the Firebase secrets without putting their values in app code or source
   control:

   ```text
   firebase functions:secrets:set CASHFREE_APP_ID
   firebase functions:secrets:set CASHFREE_SECRET_KEY
   ```

   Enter the sandbox values when prompted.
3. Configure the `CASHFREE_ENV` and `CASHFREE_RETURN_URL` Firebase function
   parameters when prompted during deployment. Use `sandbox` and the app's
   public HTTPS URL (the default is
   `https://workforcepro-saas.web.app/`). The URL must be hosted and reachable;
   localhost is not supported.
4. Deploy the `workforce` Functions codebase. Register the deployed
   `cashfreeWebhook` HTTPS URL in Cashfree and subscribe to
   `PAYMENT_SUCCESS_WEBHOOK`.
5. Add the public checkout domain to Cashfree's allowed domains. For native
   production distribution, configure the official Play Store / App Store
   listing URL required by Cashfree's dashboard; package identifiers alone may
   not satisfy production app whitelisting.
6. Test a successful payment and a cancelled/failed payment in sandbox. Confirm
   that plan access changes only after the backend reports the Cashfree order
   as `PAID`.

The backend currently accepts only catalog version 1 for `GROWTH` and `PRO`.
It calculates the amount itself and adds 18% GST. Other paid plans or versions
direct customers to support rather than accepting a client-supplied price.

## Native app setup

Run `npm run build:mobile` after changing the web app to copy assets and sync
Capacitor plugins. Android plugin registration is included by Capacitor sync.

The installed Cashfree Capacitor plugin ships an iOS CocoaPods specification
but no Swift Package manifest. This repository's iOS app is currently managed
with Swift Package Manager, so `npx cap sync` warns that the Cashfree plugin
cannot be added to the iOS package. Native iOS checkout must not be considered
configured until the project adopts a compatible CocoaPods setup or the plugin
adds Swift Package support, and the resulting iOS app is built and tested on
macOS.

## Switch to production

After sandbox validation and Cashfree account activation, set the production
App ID and Secret Key as Firebase secrets, set `CASHFREE_ENV` to `production`,
and use the public production HTTPS return URL. Register the production
`cashfreeWebhook` URL, whitelist the production domain/package, and verify
enabled payment methods in the production dashboard before accepting live
payments. Never put Cashfree secrets in frontend environment variables.
