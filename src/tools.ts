const objectSchema = (
  properties: Record<string, unknown>,
  required: string[],
) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const paymentItem = objectSchema(
  {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    qty: { type: 'integer', minimum: 1, maximum: 1000 },
    unitPrice: { type: 'string', pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$' },
  },
  ['name', 'qty', 'unitPrice'],
);

const orderId = { type: 'string', minLength: 1 };
const moneyString = { type: 'string', pattern: '^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$' };
const currency = { type: 'string', pattern: '^[A-Za-z]{3}$' };
const url = { type: 'string', format: 'uri' };

/** Provider-neutral payment tools published with the public payment contracts. */
export const paymentTools = [
  {
    name: 'create_order',
    description:
      'Create a draft order and return its merchant approval link. Its proposed amount cannot be charged until the merchant approves it.',
    inputSchema: objectSchema(
      {
        customerName: { type: 'string', minLength: 1, maxLength: 200 },
        customerContact: { type: 'string', minLength: 1, maxLength: 320 },
        customerLanguage: { type: 'string', minLength: 1, maxLength: 40 },
        amount: moneyString,
        currency,
        items: { type: 'array', items: paymentItem, minItems: 1, maxItems: 100 },
        merchantLanguage: { type: 'string', minLength: 1, maxLength: 40 },
      },
      ['customerName', 'customerContact', 'amount', 'currency', 'items'],
    ),
    outputSchema: objectSchema(
      {
        orderId,
        amount: moneyString,
        currency,
        status: { type: 'string', enum: ['draft'] },
        approvalUrl: url,
      },
      ['orderId', 'amount', 'currency', 'status', 'approvalUrl'],
    ),
  },
  {
    name: 'list_payment_methods',
    description: 'List payment methods available for a country and currency.',
    inputSchema: objectSchema(
      {
        country: { type: 'string', pattern: '^[A-Za-z]{2}$' },
        currency,
      },
      ['country', 'currency'],
    ),
    outputSchema: objectSchema(
      {
        methods: {
          type: 'array',
          items: objectSchema(
            {
              id: { type: 'string' },
              name: { type: 'string' },
            },
            ['id', 'name'],
          ),
        },
      },
      ['methods'],
    ),
  },
  {
    name: 'create_checkout',
    description: 'Create a provider checkout for an approved order.',
    inputSchema: objectSchema({ orderId }, ['orderId']),
    outputSchema: objectSchema({ orderId, checkoutUrl: url }, ['orderId', 'checkoutUrl']),
  },
  {
    name: 'get_payment_status',
    description: 'Get the order and payment status for an order.',
    inputSchema: objectSchema({ orderId }, ['orderId']),
    outputSchema: objectSchema(
      {
        orderId,
        orderStatus: { type: 'string', enum: ['draft', 'approved', 'paid', 'failed', 'cancelled'] },
        paymentStatus: { type: ['string', 'null'], enum: ['pending', 'paid', 'failed', null] },
      },
      ['orderId', 'orderStatus', 'paymentStatus'],
    ),
  },
  {
    name: 'send_payment_link',
    description:
      "Prepare the checkout link and a short customer-language message. It uses the customer's language when supported and otherwise the merchant's language.",
    inputSchema: objectSchema({ orderId }, ['orderId']),
    outputSchema: objectSchema(
      {
        orderId,
        checkoutUrl: url,
        message: { type: 'string' },
        language: { type: 'string' },
      },
      ['orderId', 'checkoutUrl', 'message', 'language'],
    ),
  },
] as const;
