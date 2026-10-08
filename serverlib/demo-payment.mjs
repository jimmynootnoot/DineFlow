export const DEMO_PAYMENT = Object.freeze({
  otp: '123456',
  cardApproved: '4111111111111111',
  cardDeclined: '4000000000000002',
  walletMobile: '09171234567',
  bankAccount: '1234567890',
});

export const ONLINE_PAYMENT_METHODS = new Set(['CARD', 'GCASH', 'BANK', 'QR']);
const digits = value => String(value || '').replace(/\D/g, '');

export function validateDemoPayment({ method, instrument, reference, otp, expectedOtp = DEMO_PAYMENT.otp }) {
  const chosen = String(method || '').toUpperCase();
  const value = digits(instrument);
  if (!ONLINE_PAYMENT_METHODS.has(chosen)) return { ok: false, status: 400, code: 'UNSUPPORTED_METHOD', message: 'Choose a supported online payment method.' };
  if (String(otp || '') !== String(expectedOtp)) return { ok: false, status: 402, code: 'INVALID_OTP', message: `The authorization code is incorrect. Use ${DEMO_PAYMENT.otp} for this demo.` };
  if (chosen === 'CARD' && value === DEMO_PAYMENT.cardDeclined) return { ok: false, status: 402, code: 'CARD_DECLINED', message: 'The demo bank declined this card. Use 4111 1111 1111 1111 to approve the payment.' };
  if (chosen === 'CARD' && value !== DEMO_PAYMENT.cardApproved) return { ok: false, status: 400, code: 'INVALID_DEMO_CARD', message: 'Use one of the test card numbers shown in the checkout.' };
  if (chosen === 'GCASH' && value !== DEMO_PAYMENT.walletMobile) return { ok: false, status: 400, code: 'INVALID_DEMO_WALLET', message: 'Use 0917 123 4567 for the demo GCash wallet.' };
  if (chosen === 'BANK' && value !== DEMO_PAYMENT.bankAccount) return { ok: false, status: 400, code: 'INVALID_DEMO_BANK', message: 'Use 1234567890 for the demo bank account.' };
  if (chosen === 'QR' && String(instrument || '') !== `QR:${reference}`) return { ok: false, status: 400, code: 'INVALID_DEMO_QR', message: 'The QR payment reference does not match this order.' };
  return { ok: true };
}
