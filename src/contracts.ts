export type PaymentStatus = 'pending' | 'paid' | 'failed';

export type OrderStatus =
  | 'draft'
  | 'approved'
  | 'paid'
  | 'failed'
  | 'cancelled';

export interface PaymentItem {
  name: string;
  qty: number;
  unitPrice: string;
}

export interface PaymentProvider {
  id: 'paypal';
  createCheckout(input: {
    orderId: string;
    amount: string;
    currency: string;
    items: PaymentItem[];
    locale?: string;
    returnUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; checkoutUrl: string }>;
  capture(
    providerRef: string,
    idempotencyKey: string,
  ): Promise<{ status: Exclude<PaymentStatus, 'pending'> }>;
  getStatus(providerRef: string): Promise<PaymentStatus>;
  verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<{
    valid: boolean;
    event?: {
      eventId: string;
      providerRef: string;
      status: PaymentStatus;
    };
  }>;
}

export type PaymentErrorCode =
  | 'NOT_APPROVED'
  | 'NOT_MERCHANT'
  | 'UNSUPPORTED_CURRENCY'
  | 'PROVIDER_ERROR';

export interface PaymentError {
  ok: false;
  code: PaymentErrorCode;
  message: string;
}
