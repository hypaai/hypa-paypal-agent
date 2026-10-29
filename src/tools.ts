export const paymentTools = [
  {
    name: 'create_order',
    description: 'Create a draft payment order for a customer.',
    inputSchema: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        customerContact: { type: 'string' },
        currency: { type: 'string', description: 'ISO 4217 currency code.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              qty: { type: 'integer', minimum: 1 },
              unitPrice: { type: 'string' },
            },
            required: ['name', 'qty', 'unitPrice'],
            additionalProperties: false,
          },
        },
      },
      required: ['currency', 'items'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_payment_methods',
    description: 'List payment methods available for an order currency.',
    inputSchema: {
      type: 'object',
      properties: { currency: { type: 'string' } },
      required: ['currency'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_checkout',
    description: 'Create checkout for an approved payment order.',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_payment_status',
    description: 'Get payment status for an order.',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
      additionalProperties: false,
    },
  },
  {
    name: 'send_payment_link',
    description: 'Send the approved order checkout link to its customer.',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
      additionalProperties: false,
    },
  },
] as const;
