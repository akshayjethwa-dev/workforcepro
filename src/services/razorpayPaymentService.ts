import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';

export interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: 'INR';
  keyId: string;
}

export interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface CreateOrderRequest {
  planCode: string;
  planVersion: number;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  amount: number;
  currency: 'INR';
}

interface VerifyPaymentResponse {
  verified: boolean;
}

interface RazorpayCheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: 'INR';
  name: string;
  description: string;
  handler: (response: RazorpayPaymentResponse) => void;
  modal: {
    ondismiss: () => void;
  };
}

interface RazorpayFailureResponse {
  error?: {
    description?: string;
  };
}

interface RazorpayCheckoutInstance {
  open: () => void;
  on: (
    event: 'payment.failed',
    handler: (response: RazorpayFailureResponse) => void
  ) => void;
}

interface RazorpayConstructor {
  new (options: RazorpayCheckoutOptions): RazorpayCheckoutInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const functions = getFunctions(app, 'asia-south1');
const createRazorpayOrder = httpsCallable<CreateOrderRequest, RazorpayOrder>(
  functions,
  'createRazorpayOrder'
);
const verifyRazorpayPayment = httpsCallable<RazorpayPaymentResponse, VerifyPaymentResponse>(
  functions,
  'verifyRazorpayPayment'
);

let razorpayScriptPromise: Promise<void> | null = null;

export class RazorpayCheckoutDismissedError extends Error {
  constructor() {
    super('Checkout was dismissed.');
    this.name = 'RazorpayCheckoutDismissedError';
  }
}

async function loadRazorpay(): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Razorpay checkout is only available in a browser.');
  }

  if (!window.Razorpay) {
    if (!razorpayScriptPromise) {
      razorpayScriptPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          razorpayScriptPromise = null;
          reject(new Error('Razorpay checkout could not be loaded. Check your connection and try again.'));
        };
        document.head.appendChild(script);
      });
    }
    await razorpayScriptPromise;
  }

  if (!window.Razorpay) {
    throw new Error('Razorpay checkout did not initialize.');
  }
  return window.Razorpay;
}

function openCheckout(
  order: RazorpayOrder,
  details: { name: string; description: string }
): Promise<RazorpayPaymentResponse> {
  return loadRazorpay().then((Razorpay) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: details.name,
      description: details.description,
      handler: (response) => finish(() => resolve(response)),
      modal: {
        ondismiss: () => finish(() => reject(new RazorpayCheckoutDismissedError()))
      }
    });

    checkout.on('payment.failed', (response) => {
      const message = response.error?.description || 'Razorpay could not complete the payment.';
      finish(() => reject(new Error(message)));
    });

    try {
      checkout.open();
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error('Razorpay checkout could not be opened.')));
    }
  }));
}

export const razorpayPaymentService = {
  createOrder: async (request: CreateOrderRequest): Promise<RazorpayOrder> => {
    const result = await createRazorpayOrder(request);
    return result.data;
  },
  verifyPayment: async (payment: RazorpayPaymentResponse): Promise<VerifyPaymentResponse> => {
    const result = await verifyRazorpayPayment(payment);
    return result.data;
  },
  openCheckout
};
