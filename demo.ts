import { FakePaymentProvider } from './src/fake-payment-provider.js';

const provider = new FakePaymentProvider();
const checkout = await provider.createCheckout({
  orderId: 'demo-order-1',
  amount: '24.00',
  currency: 'USD',
  items: [{ name: 'Coffee', qty: 2, unitPrice: '12.00' }],
  returnUrl: 'http://localhost:3000/success',
  cancelUrl: 'http://localhost:3000/cancel',
  idempotencyKey: 'demo-order-1-checkout',
});

console.log(`Checkout URL: ${checkout.checkoutUrl}`);
console.log(`Before capture: ${await provider.getStatus(checkout.providerRef)}`);
await provider.capture(checkout.providerRef, 'demo-order-1-capture');
console.log(`After capture: ${await provider.getStatus(checkout.providerRef)}`);
