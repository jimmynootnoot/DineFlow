import React, { useEffect, useMemo, useState } from 'react';
import { recordPayment } from '../../services/reportService';
import { DEMO_PAYMENT } from '../../../serverlib/demo-payment.mjs';
import './MayaCheckout.css';
import Icon from '../ui/Icon';
import { useModalFocus } from '../../hooks/useModalFocus';
import { encodeQR } from './qr';

const STEP = { METHOD: 'METHOD', DETAILS: 'DETAILS', REVIEW: 'REVIEW', VERIFY: 'VERIFY', PROCESSING: 'PROCESSING', SUCCESS: 'SUCCESS', ERROR: 'ERROR' };
const METHODS = [
  { id: 'CARD', icon: 'card', label: 'Credit or debit card', hint: 'Visa or Mastercard test card' },
  { id: 'GCASH', icon: 'bag', label: 'GCash', hint: 'Authorize a test wallet' },
  { id: 'BANK', icon: 'book', label: 'Online banking', hint: 'Approve from a test bank account' },
  { id: 'QR', icon: 'grid', label: 'QR Ph', hint: 'Simulate payment from a banking app' },
];
const BANKS = ['BPI', 'BDO', 'UnionBank', 'Metrobank', 'Landbank'];
const METHOD_LABEL = { CARD: 'Card', GCASH: 'GCash', BANK: 'Online banking', QR: 'QR Ph', CASH: 'Cash at counter' };
const peso = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));
const digits = (value, max) => String(value || '').replace(/\D/g, '').slice(0, max);
const formatCard = value => digits(value, 16).replace(/(.{4})/g, '$1 ').trim();
const formatMobile = value => { const d = digits(value, 11); return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(' '); };
const blankForm = () => ({ card: { number: '', expiry: '', cvv: '', name: '' }, mobile: '', bank: BANKS[0], account: '' });

function QrCode({ payload }) {
  const symbol = useMemo(() => { try { return encodeQR(payload); } catch { return null; } }, [payload]);
  if (!symbol) return <p className="maya-note" role="alert">The test QR could not be generated. Choose another method.</p>;
  const quiet = 4;
  const cells = [];
  for (let row = 0; row < symbol.size; row += 1) for (let column = 0; column < symbol.size; column += 1) {
    if (symbol.modules[row][column]) cells.push(`M${column + quiet} ${row + quiet}h1v1h-1z`);
  }
  const span = symbol.size + quiet * 2;
  return <svg className="maya-qr__code" viewBox={`0 0 ${span} ${span}`} role="img" aria-label="Demo QR payment code" shapeRendering="crispEdges">
    <rect width={span} height={span} fill="#fff"/><path d={cells.join('')} fill="#000"/>
  </svg>;
}

export default function MayaCheckout({ open, onClose, orderId, orderNumber, total, onPaymentComplete }) {
  const [step, setStep] = useState(STEP.METHOD);
  const [method, setMethod] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [payment, setPayment] = useState(null);
  const [retryStep, setRetryStep] = useState(STEP.VERIFY);

  const reset = () => { setStep(STEP.METHOD); setMethod(null); setForm(blankForm()); setOtp(''); setError(''); setPayment(null); setRetryStep(STEP.VERIFY); };
  useEffect(() => { if (open) reset(); }, [open]);
  const close = () => { if (step !== STEP.PROCESSING) { reset(); onClose(); } };
  const dialogRef = useModalFocus(open, close);
  const reference = useMemo(() => (String(orderId || '').replace(/\D/g, '').slice(-6) || '000000').padStart(6, '0'), [orderId]);
  const shownOrder = orderNumber || `#${String(orderId || '').slice(-8).toUpperCase()}`;
  const qrPayload = `PH.QR.DINEFLOW/${reference}?amt=${Number(total || 0).toFixed(2)}&cur=PHP&mode=DEMO`;
  const selected = METHODS.find(item => item.id === method);

  const instrument = () => {
    if (method === 'CARD') return digits(form.card.number, 16);
    if (method === 'GCASH') return digits(form.mobile, 11);
    if (method === 'BANK') return digits(form.account, 10);
    return `QR:${reference.slice(-4)}`;
  };
  const paymentReference = () => instrument().replace(/\D/g, '').slice(-4) || reference.slice(-4);
  const maskedAccount = () => {
    if (method === 'CARD') return `Card ending ${paymentReference()}`;
    if (method === 'GCASH') return `GCash ${formatMobile(form.mobile).replace(/^.{4}/, '••••')}`;
    if (method === 'BANK') return `${form.bank} account ending ${paymentReference()}`;
    return `QR reference ${reference}`;
  };

  const validateDetails = event => {
    event.preventDefault(); setError('');
    if (method === 'CARD') {
      if (![DEMO_PAYMENT.cardApproved, DEMO_PAYMENT.cardDeclined].includes(digits(form.card.number, 16))) return setError('Use one of the test card numbers shown above.');
      if (!/^\d{2}\/\d{2}$/.test(form.card.expiry) || Number(form.card.expiry.slice(0, 2)) < 1 || Number(form.card.expiry.slice(0, 2)) > 12) return setError('Enter a valid expiry in MM/YY format.');
      if (form.card.cvv !== '123') return setError('Use 123 as the demo CVV.');
      if (form.card.name.trim().length < 2) return setError('Enter the name shown on the card.');
    }
    if (method === 'GCASH' && digits(form.mobile, 11) !== DEMO_PAYMENT.walletMobile) return setError('Use 0917 123 4567 for the demo wallet.');
    if (method === 'BANK' && digits(form.account, 10) !== DEMO_PAYMENT.bankAccount) return setError('Use 1234567890 for the demo bank account.');
    setStep(STEP.REVIEW);
  };

  const settle = async ({ qr = false } = {}) => {
    setStep(STEP.PROCESSING); setError('');
    try {
      const [result] = await Promise.all([
        recordPayment({ orderId, method, amount: total, cardLast4: paymentReference(), sandboxOtp: qr ? DEMO_PAYMENT.otp : otp, sandboxInstrument: instrument() }),
        new Promise(resolve => setTimeout(resolve, 650)),
      ]);
      setPayment(result); setStep(STEP.SUCCESS);
      onPaymentComplete?.({ method, settled: true, payment: result });
    } catch (failure) {
      setError(failure.message || 'The payment service could not complete this attempt.');
      setRetryStep(['CARD_DECLINED', 'INVALID_DEMO_CARD', 'INVALID_DEMO_WALLET', 'INVALID_DEMO_BANK'].includes(failure.code) ? STEP.DETAILS : STEP.VERIFY);
      setStep(STEP.ERROR);
    }
  };

  if (!open) return null;
  const phase = [STEP.DETAILS, STEP.REVIEW, STEP.VERIFY, STEP.PROCESSING].includes(step);
  return <div className="maya-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} className="maya-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title" tabIndex={-1} aria-busy={step === STEP.PROCESSING}>
      <header className="maya-modal__header">
        <div className="maya-modal__brand"><span className="maya-modal__logo"><Icon name="card" size={18}/></span><div>
          <p id="payment-title" className="maya-modal__brand-name">DineFlow Pay</p>
          <p className="maya-modal__brand-sub">Secure checkout simulation · no real charge</p>
        </div></div>
        {step !== STEP.PROCESSING && <button type="button" className="maya-modal__close" onClick={close} aria-label="Close payment"><Icon name="x"/></button>}
      </header>

      {phase && <ol className="maya-steps" aria-label="Payment progress">
        {['Details', 'Review', 'Verify'].map((label, index) => {
          const current = [STEP.DETAILS, STEP.REVIEW, STEP.VERIFY, STEP.PROCESSING].indexOf(step);
          return <li key={label} className={`maya-step ${index === Math.min(current, 2) ? 'maya-step--active' : ''} ${index < current ? 'maya-step--done' : ''}`}><span>{index + 1}</span>{label}</li>;
        })}
      </ol>}

      <div className="maya-modal__body">
        {step === STEP.METHOD && <div className="maya-stack">
          <div className="maya-summary"><span>Order {shownOrder}</span><strong>{peso(total)}</strong></div>
          <div><h2 className="maya-heading">Choose how to pay</h2><p className="maya-note">This demo follows a real checkout sequence and records the result in your order.</p></div>
          <div className="maya-methods">{METHODS.map(option => <button key={option.id} type="button" className="maya-method" onClick={() => { setMethod(option.id); setStep(STEP.DETAILS); }}>
            <span className="maya-method__icon"><Icon name={option.icon} size={18}/></span><span className="maya-method__text"><strong>{option.label}</strong><small>{option.hint}</small></span><Icon name="arrowRight"/>
          </button>)}</div>
          <div className="maya-divider"><span>or</span></div>
          <button type="button" className="maya-btn-ghost" onClick={() => { setMethod('CASH'); setStep(STEP.SUCCESS); onPaymentComplete?.({ method: 'CASH', settled: false }); }}>Pay cash at the counter</button>
        </div>}

        {step === STEP.DETAILS && <form className="maya-stack" onSubmit={validateDetails}>
          <div><button type="button" className="maya-back" onClick={() => setStep(STEP.METHOD)}>← Payment methods</button><h2 className="maya-heading">{selected?.label}</h2></div>
          {method === 'CARD' && <>
            <div className="maya-test-data"><strong>Test cards</strong><span>Approved: 4111 1111 1111 1111</span><span>Declined: 4000 0000 0000 0002</span><span>Expiry 12/28 · CVV 123</span></div>
            <label className="maya-label">Card number<input aria-label="Card number" className="maya-input" inputMode="numeric" autoComplete="cc-number" placeholder="4111 1111 1111 1111" value={formatCard(form.card.number)} onChange={e => setForm(p => ({ ...p, card: { ...p.card, number: digits(e.target.value, 16) } }))}/></label>
            <label className="maya-label">Name on card<input aria-label="Name on card" className="maya-input" autoComplete="cc-name" placeholder="Juan dela Cruz" maxLength={80} value={form.card.name} onChange={e => setForm(p => ({ ...p, card: { ...p.card, name: e.target.value } }))}/></label>
            <div className="maya-form__row"><label className="maya-label">Expiry<input aria-label="Expiry" className="maya-input" inputMode="numeric" placeholder="12/28" maxLength={5} value={form.card.expiry} onChange={e => { const d = digits(e.target.value, 4); setForm(p => ({ ...p, card: { ...p.card, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d } })); }}/></label><label className="maya-label">CVV<input aria-label="CVV" className="maya-input" type="password" inputMode="numeric" placeholder="123" maxLength={3} value={form.card.cvv} onChange={e => setForm(p => ({ ...p, card: { ...p.card, cvv: digits(e.target.value, 3) } }))}/></label></div>
          </>}
          {method === 'GCASH' && <><div className="maya-test-data"><strong>Test wallet</strong><span>Mobile: 0917 123 4567</span></div><label className="maya-label">GCash mobile number<input aria-label="GCash mobile number" className="maya-input" type="tel" inputMode="numeric" placeholder="0917 123 4567" value={formatMobile(form.mobile)} onChange={e => setForm(p => ({ ...p, mobile: digits(e.target.value, 11) }))}/></label></>}
          {method === 'BANK' && <><div className="maya-test-data"><strong>Test bank account</strong><span>Account: 1234567890</span></div><label className="maya-label">Bank<select className="maya-input" value={form.bank} onChange={e => setForm(p => ({ ...p, bank: e.target.value }))}>{BANKS.map(bank => <option key={bank}>{bank}</option>)}</select></label><label className="maya-label">Account number<input aria-label="Account number" className="maya-input" inputMode="numeric" placeholder="1234567890" value={form.account} onChange={e => setForm(p => ({ ...p, account: digits(e.target.value, 10) }))}/></label></>}
          {method === 'QR' && <div className="maya-qr"><QrCode payload={qrPayload}/><strong>{peso(total)}</strong><span className="maya-qr__ref">Reference {reference}</span><p className="maya-note">In a real checkout you would scan this in your bank or wallet app. Here, the button below safely simulates the provider confirmation.</p></div>}
          {error && <p className="maya-error" role="alert">{error}</p>}
          {method === 'QR' ? <button type="button" className="maya-btn-primary" onClick={() => settle({ qr: true })}>Simulate payment from banking app</button> : <button className="maya-btn-primary">Review payment</button>}
        </form>}

        {step === STEP.REVIEW && <div className="maya-stack">
          <div><button type="button" className="maya-back" onClick={() => setStep(STEP.DETAILS)}>← Edit details</button><h2 className="maya-heading">Review payment</h2><p className="maya-note">Confirm the amount and account before authorization.</p></div>
          <dl className="maya-review"><div><dt>Order</dt><dd>{shownOrder}</dd></div><div><dt>Method</dt><dd>{METHOD_LABEL[method]}</dd></div><div><dt>Account</dt><dd>{maskedAccount()}</dd></div><div className="maya-review__total"><dt>Total</dt><dd>{peso(total)}</dd></div></dl>
          <button type="button" className="maya-btn-primary" onClick={() => setStep(STEP.VERIFY)}>Authorize payment</button>
          <p className="maya-secure"><Icon name="check"/> Demo credentials are validated before the order is marked paid.</p>
        </div>}

        {step === STEP.VERIFY && <form className="maya-stack" onSubmit={event => { event.preventDefault(); if (otp !== DEMO_PAYMENT.otp) { setError(`Use ${DEMO_PAYMENT.otp} as the demo authorization code.`); return; } settle(); }}>
          <div><button type="button" className="maya-back" onClick={() => setStep(STEP.REVIEW)}>← Back to review</button><h2 className="maya-heading">Verify your payment</h2><p className="maya-note">Enter the one-time authorization code. For this sandbox, use <strong>{DEMO_PAYMENT.otp}</strong>.</p></div>
          <label className="maya-label">6-digit authorization code<input aria-label="6-digit authorization code" className="maya-input maya-input--otp" inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" maxLength={6} value={otp} onChange={e => { setOtp(digits(e.target.value, 6)); setError(''); }}/></label>
          {error && <p className="maya-error" role="alert">{error}</p>}
          <div className="maya-summary"><span>Amount to authorize</span><strong>{peso(total)}</strong></div>
          <button className="maya-btn-primary" disabled={otp.length !== 6}>Pay {peso(total)}</button>
        </form>}

        {step === STEP.PROCESSING && <div className="maya-state" role="status"><span className="maya-spinner"/><h2 className="maya-heading">Authorizing payment</h2><p className="maya-note">Please keep this window open. We are validating the demo account and recording the transaction.</p></div>}

        {step === STEP.SUCCESS && <div className="maya-state">
          <span className="maya-state__icon maya-state__icon--success"><Icon name="check" size={28}/></span><p className="maya-eyebrow">{method === 'CASH' ? 'PAYMENT PENDING' : 'PAYMENT APPROVED'}</p><h2 className="maya-heading">{method === 'CASH' ? 'Pay at the counter' : 'Payment complete'}</h2>
          <p className="maya-note">{method === 'CASH' ? 'Your order is confirmed and remains unpaid until the cashier receives your cash.' : 'The payment was recorded and your order can continue to preparation.'}</p>
          <div className="maya-receipt"><div><span>Amount</span><strong>{peso(total)}</strong></div><div><span>Method</span><strong>{METHOD_LABEL[method]}</strong></div>{payment?.id && <div><span>Transaction</span><strong>{String(payment.id).slice(0, 8).toUpperCase()}</strong></div>}</div>
          <button type="button" className="maya-btn-primary" onClick={close}>Return to order</button>
        </div>}

        {step === STEP.ERROR && <div className="maya-state"><span className="maya-state__icon maya-state__icon--error"><Icon name="x" size={26}/></span><p className="maya-eyebrow">PAYMENT NOT COMPLETED</p><h2 className="maya-heading">We couldn’t authorize this payment</h2><p className="maya-error" role="alert">{error}</p><p className="maya-note">Your order is still unpaid. No duplicate payment was recorded.</p><button type="button" className="maya-btn-primary" onClick={() => { setError(''); setOtp(''); setStep(retryStep); }}>Try again</button><button type="button" className="maya-btn-ghost" onClick={() => { setError(''); setOtp(''); setStep(STEP.METHOD); }}>Choose another method</button></div>}
      </div>
    </section>
  </div>;
}
