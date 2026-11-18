import { Capacitor } from '@capacitor/core';
import { CFEnvironment, CFSession, CFWebCheckoutPayment, CFWebThemeBuilder } from 'cashfree-pg-api-contract';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';

export type CashfreeEnvironment = 'sandbox' | 'production';

export interface CashfreeOrder {
  orderId: string;
  paymentSessionId: string;
  environment: CashfreeEnvironment;
  planCode: string;
  planVersion: number;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  currency: 'INR';
}

export interface CashfreePaymentVerification {
  status: string;
  activated: boolean;
  planCode?: string;
  billingInterval?: string;
}

export interface CashfreeCheckoutOutcome extends CashfreePaymentVerification {
  redirected?: boolean;
  notCompleted?: boolean;
}

interface CreateOrderRequest {
  planCode: string;
  planVersion: number;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  customerPhone: string;
}

interface VerifyOrderRequest {
  orderId: string;
}

interface BrowserCheckoutResult {
  error?: { message?: string } | string;
  redirect?: boolean;
  paymentDetails?: unknown;
}

interface BrowserCashfree {
  checkout(options: {
    paymentSessionId: string;
    redirectTarget: '_modal';
  }): Promise<BrowserCheckoutResult>;
}

declare global {
  interface Window {
    Cashfree?: (options: { mode: CashfreeEnvironment }) => BrowserCashfree;
  }
}

const functions = getFunctions(app, 'asia-south1');
const createCashfreeOrder = httpsCallable<CreateOrderRequest, CashfreeOrder>(functions, 'createCashfreeOrder');
const verifyCashfreePayment = httpsCallable<VerifyOrderRequest, CashfreePaymentVerification>(
  functions,
  'verifyCashfreePayment'
);

let cashfreeScriptPromise: Promise<void> | null = null;
const browserCashfreeInstances = new Map<CashfreeEnvironment, BrowserCashfree>();

async function getBrowserCashfree(environment: CashfreeEnvironment): Promise<BrowserCashfree> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Cashfree checkout is only available in a browser.');
  }

  if (!window.Cashfree) {
    if (!cashfreeScriptPromise) {
      cashfreeScriptPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          cashfreeScriptPromise = null;
          reject(new Error('Cashfree checkout could not be loaded. Check your connection and try again.'));
        };
        document.head.appendChild(script);
      });
    }
    await cashfreeScriptPromise;
  }

  if (!window.Cashfree) {
    throw new Error('Cashfree checkout did not initialize.');
  }

  let instance = browserCashfreeInstances.get(environment);
  if (!instance) {
    instance = window.Cashfree({ mode: environment });
    browserCashfreeInstances.set(environment, instance);
  }
  return instance;
}

async function verifyOrder(orderId: string): Promise<CashfreePaymentVerification> {
  const result = await verifyCashfreePayment({ orderId });
  return result.data;
}

async function openCheckout(order: CashfreeOrder): Promise<CashfreeCheckoutOutcome> {
  if (Capacitor.isNativePlatform()) {
    const { CFPaymentGateway } = await import('capacitor-plugin-cashfree-pg');
    const session = new CFSession(
      order.paymentSessionId,
      order.orderId,
      order.environment === 'production' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX
    );
    const theme = new CFWebThemeBuilder()
      .setNavigationBarBackgroundColor('#2563eb')
      .setNavigationBarTextColor('#ffffff')
      .build();
    const result = await CFPaymentGateway.doWebCheckoutPayment(new CFWebCheckoutPayment(session, theme));

    if (result.error) {
      const verification = await verifyOrder(order.orderId);
      return verification.status === 'PAID'
        ? verification
        : { ...verification, notCompleted: true };
    }
  } else {
    const cashfree = await getBrowserCashfree(order.environment);
    const result = await cashfree.checkout({
      paymentSessionId: order.paymentSessionId,
      redirectTarget: '_modal'
    });

    if (result.redirect) {
      return { status: 'REDIRECTED', activated: false, redirected: true };
    }
    if (result.error) {
      const verification = await verifyOrder(order.orderId);
      return verification.status === 'PAID'
        ? verification
        : { ...verification, notCompleted: true };
    }
    if (!result.paymentDetails) {
      const verification = await verifyOrder(order.orderId);
      return verification.status === 'PAID'
        ? verification
        : { ...verification, notCompleted: true };
    }
  }

  return verifyOrder(order.orderId);
}

export const cashfreePaymentService = {
  createOrder: async (request: CreateOrderRequest): Promise<CashfreeOrder> => {
    const result = await createCashfreeOrder(request);
    return result.data;
  },
  verifyOrder,
  openCheckout
};
