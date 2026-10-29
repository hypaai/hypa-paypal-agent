import { randomUUID } from 'node:crypto';
import type {
  PaymentProvider,
  PaymentStatus,
} from './contracts.js';

export class FakePaymentProvider implements PaymentProvider {
  readonly id = 'paypal' as const;
  private readonly orders = new Map<string, PaymentStatus>();
  private readonly idempotencyKeys = new Map<string, string>();

  async createCheckout(input: {
    orderId: string;
    amount: string;
    currency: string;
    items: { name: string; qty: number; unitPrice: string }[];
    locale?: string;
    returnUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }) {
    const prior = this.idempotencyKeys.get(input.idempotencyKey);
    const providerRef = prior ?? randomUUID();
    this.idempotencyKeys.set(input.idempotencyKey, providerRef);
    this.orders.set(providerRef, this.orders.get(providerRef) ?? 'pending');
    return {
      providerRef,
      checkoutUrl: `https://example.test/checkout/${providerRef}`,
    };
  }

  async capture(providerRef: string) {
    const status = this.orders.get(providerRef);
    if (!status) throw new Error('Unknown fake payment reference');
    this.orders.set(providerRef, 'paid');
    return { status: 'paid' as const };
  }

  async getStatus(providerRef: string): Promise<PaymentStatus> {
    const status = this.orders.get(providerRef);
    if (!status) throw new Error('Unknown fake payment reference');
    return status;
  }

  async verifyWebhook(_headers: Record<string, string>, rawBody: string) {
    try {
      const payload = JSON.parse(rawBody) as {
        eventId?: string;
        providerRef?: string;
        status?: PaymentStatus;
      };
      if (
        !payload.eventId ||
        !payload.providerRef ||
        !payload.status ||
        !this.orders.has(payload.providerRef)
      ) {
        return { valid: false };
      }
      this.orders.set(payload.providerRef, payload.status);
      return {
        valid: true,
        event: {
          eventId: payload.eventId,
          providerRef: payload.providerRef,
          status: payload.status,
        },
      };
    } catch {
      return { valid: false };
    }
  }
}
