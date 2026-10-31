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

/** A merchant's review card. The model may propose an order, but only the
 * signed-in merchant can approve it through the commerce API. */
export interface ApprovalEvent {
  orderId: string;
  amount: string;
  currency: string;
  fee: { amount: string; currency: string };
  customer: { name: string; contact: string; language: string | null };
  items: PaymentItem[];
  merchantLanguage: string;
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
  /**
   * Checks the transmission signature. `valid` answers only that question: an
   * event whose signature verifies is valid even when this library does not
   * map it to a payment status, so a caller can tell a forged event from one
   * it simply does not act on. `status` is set only for the event types that
   * move a payment; `eventType` is always the provider's own name for it.
   */
  verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<{
    valid: boolean;
    event?: {
      eventId: string;
      providerRef: string;
      eventType: string;
      status?: PaymentStatus;
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
