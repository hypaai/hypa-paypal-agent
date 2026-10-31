import type { PaymentProvider, PaymentStatus } from './contracts.js';

type PayPalResponse = {
  id?: string;
  status?: string;
  links?: { rel?: string; href?: string }[];
  purchase_units?: {
    payments?: {
      captures?: { status?: string }[];
    };
  }[];
};

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
};

/** Event types that move a payment. Anything else verifies but has no status. */
const WEBHOOK_EVENT_STATUS: Record<string, PaymentStatus> = {
  'PAYMENT.CAPTURE.COMPLETED': 'paid',
  'PAYMENT.CAPTURE.DENIED': 'failed',
  'PAYMENT.CAPTURE.DECLINED': 'failed',
  'CHECKOUT.ORDER.APPROVED': 'pending',
  'CHECKOUT.ORDER.CREATED': 'pending',
  'PAYMENT.CAPTURE.PENDING': 'pending',
};

const decimalPlaces = (value: string) => (value.split('.')[1] ?? '').length;

const scaled = (value: string, places: number) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(places, '0'));
};

/**
 * PayPal rejects a purchase unit that lists `items` without
 * `amount.breakdown.item_total`, so the breakdown is required here. The items
 * must add up to the order amount exactly; decimal strings are compared as
 * integers so no float rounding can creep in.
 */
const assertItemsMatchAmount = (
  items: { qty: number; unitPrice: string }[],
  amount: string,
) => {
  const places = Math.max(
    decimalPlaces(amount),
    ...items.map((item) => decimalPlaces(item.unitPrice)),
  );
  const total = items.reduce(
    (sum, item) => sum + scaled(item.unitPrice, places) * BigInt(item.qty),
    0n,
  );
  if (total !== scaled(amount, places)) {
    const digits = total.toString().padStart(places + 1, '0');
    const readable = places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits;
    throw new Error(
      `Order items add up to ${readable} but the order amount is ${amount}; PayPal rejects a mismatched breakdown.`,
    );
  }
};

export interface PayPalProviderOptions {
  clientId: string;
  clientSecret: string;
  /** Only needed to verify webhooks; checkout-only callers can leave it unset. */
  webhookId?: string;
  environment?: 'sandbox' | 'live';
  fetch?: typeof fetch;
}

export class PayPalProvider implements PaymentProvider {
  readonly id = 'paypal' as const;
  private readonly baseUrl: string;
  private readonly request: typeof fetch;
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly options: PayPalProviderOptions) {
    if (!options.clientId || !options.clientSecret) {
      throw new Error('PayPal client credentials are required');
    }
    this.baseUrl =
      options.environment === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    this.request = options.fetch ?? fetch;
  }

  async createCheckout(input: Parameters<PaymentProvider['createCheckout']>[0]) {
    assertItemsMatchAmount(input.items, input.amount);
    const response = await this.api<PayPalResponse>('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': input.idempotencyKey },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.orderId,
            custom_id: input.orderId,
            amount: {
              currency_code: input.currency,
              value: input.amount,
              breakdown: {
                item_total: { currency_code: input.currency, value: input.amount },
              },
            },
            items: input.items.map((item) => ({
              name: item.name,
              quantity: String(item.qty),
              unit_amount: {
                currency_code: input.currency,
                value: item.unitPrice,
              },
            })),
          },
        ],
        application_context: {
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          ...(input.locale ? { locale: input.locale } : {}),
          user_action: 'PAY_NOW',
        },
      }),
    });
    const checkoutUrl = response.links?.find((link) => link.rel === 'approve')?.href;
    if (!response.id || !checkoutUrl) {
      throw new Error('PayPal did not return an order ID and approval URL');
    }
    return { providerRef: response.id, checkoutUrl };
  }

  async capture(providerRef: string, idempotencyKey: string) {
    const response = await this.api<PayPalResponse>(
      `/v2/checkout/orders/${encodeURIComponent(providerRef)}/capture`,
      {
        method: 'POST',
        headers: { 'PayPal-Request-Id': idempotencyKey },
        body: '{}',
      },
    );
    return { status: this.status(response) === 'paid' ? 'paid' : 'failed' } as const;
  }

  async getStatus(providerRef: string): Promise<PaymentStatus> {
    const response = await this.api<PayPalResponse>(
      `/v2/checkout/orders/${encodeURIComponent(providerRef)}`,
    );
    return this.status(response);
  }

  async verifyWebhook(headers: Record<string, string>, rawBody: string) {
    if (!this.options.webhookId) {
      throw new Error('A PayPal webhook ID is required to verify webhooks');
    }
    let event: PayPalWebhookEvent;
    try {
      event = JSON.parse(rawBody) as PayPalWebhookEvent;
    } catch {
      return { valid: false };
    }
    const normalized = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
    );
    const requiredHeaders = [
      'paypal-auth-algo',
      'paypal-cert-url',
      'paypal-transmission-id',
      'paypal-transmission-sig',
      'paypal-transmission-time',
    ];
    if (requiredHeaders.some((name) => !normalized[name])) return { valid: false };
    const verified = await this.api<{ verification_status?: string }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: JSON.stringify({
          auth_algo: normalized['paypal-auth-algo'],
          cert_url: normalized['paypal-cert-url'],
          transmission_id: normalized['paypal-transmission-id'],
          transmission_sig: normalized['paypal-transmission-sig'],
          transmission_time: normalized['paypal-transmission-time'],
          webhook_id: this.options.webhookId,
          webhook_event: event,
        }),
      },
    );
    const providerRef =
      event.resource?.supplementary_data?.related_ids?.order_id ??
      event.resource?.id;
    // `valid` answers the signature question only. A verified event we cannot
    // identify is malformed, not forged, so it is reported separately.
    if (verified.verification_status !== 'SUCCESS') return { valid: false };
    if (!event.id || !providerRef) return { valid: true };
    const eventType = event.event_type ?? '';
    const status = WEBHOOK_EVENT_STATUS[eventType];
    return {
      valid: true,
      event: { eventId: event.id, providerRef, eventType, ...(status ? { status } : {}) },
    };
  }

  private status(response: PayPalResponse): PaymentStatus {
    const captureStatus = response.purchase_units?.[0]?.payments?.captures?.[0]?.status;
    if (response.status === 'COMPLETED' || captureStatus === 'COMPLETED') return 'paid';
    if (
      response.status === 'CREATED' ||
      response.status === 'APPROVED' ||
      response.status === 'PAYER_ACTION_REQUIRED' ||
      response.status === 'PENDING'
    ) return 'pending';
    return 'failed';
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const response = await this.request(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...init.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`PayPal API ${response.status}: ${detail}`);
    }
    return (await response.json()) as T;
  }

  private async getAccessToken() {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 30_000) {
      return this.accessToken.value;
    }
    const response = await this.request(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${this.options.clientId}:${this.options.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new Error(`PayPal OAuth failed (${response.status})`);
    const token = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = {
      value: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return token.access_token;
  }
}
