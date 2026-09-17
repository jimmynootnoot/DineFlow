import React, { useEffect, useMemo, useState } from 'react';
import { recordPayment } from '../../services/reportService';
import './MayaCheckout.css';
import Icon from '../ui/Icon';
import { useModalFocus } from '../../hooks/useModalFocus';
import { encodeQR } from './qr';

// ─── Sandbox authorisation ───────────────────────────────────
// Card 4111 1111 1111 1111 · Exp 12/28 · CVV 123 · OTP 123456
const DEMO_OTP = '123456';

const steps = {
  METHOD: 'METHOD',
  DETAILS: 'DETAILS',
  OTP: 'OTP',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
};

const METHODS = [
  { id: 'CARD',   icon: 'card',    label: 'Credit or debit card', hint: 'Visa, Mastercard, JCB' },
  { id: 'GCASH',  icon: 'bag',     label: 'GCash',                hint: 'Pay with your GCash wallet' },
  { id: 'BANK',   icon: 'book',    label: 'Online banking',       hint: 'BPI, BDO, UnionBank, Metrobank' },
    { id: 'QR',     icon: 'grid',    label: 'QR simulation',        hint: 'Test a payment reference' },
  { id: 'CASH',   icon: 'peso',    label: 'Cash at the counter',  hint: 'Pay the cashier when you collect' },
];

const BANKS = ['BPI', 'BDO', 'UnionBank', 'Metrobank', 'Landbank', 'Security Bank', 'RCBC', 'PNB'];

const METHOD_LABEL = {
  CARD: 'card', GCASH: 'GCash', BANK: 'online banking', QR: 'QR Ph', CASH: 'cash',
};

const peso = (value) => `₱${Number(value || 0).toFixed(2)}`;
const digits = (value, max) => String(value).replace(/\D/g, '').slice(0, max);
const formatCard = (value) => digits(value, 16).replace(/(.{4})/g, '$1 ').trim();
const formatMobile = (value) => {
  const d = digits(value, 11);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join(' ');
};

const blankState = () => ({
  card: { number: '', expiry: '', cvv: '', name: '' },
  mobile: '',
  bank: BANKS[0],
  account: '',
});

function QrCanvas({ payload }) {
  const symbol = useMemo(() => {
    try { return encodeQR(payload); } catch { return null; }
  }, [payload]);

  if (!symbol) return <p className="maya-qr__fallback">This code could not be generated. Choose another method.</p>;

  const { size, modules } = symbol;
  const quiet = 4;
  const span = size + quiet * 2;
  const cells = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r][c]) cells.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    }
  }
  return (
    // Pure black on pure white is deliberate and the one place the warm
    // palette is wrong: scanners rely on maximum luminance contrast.
    <svg className="maya-qr__code" viewBox={`0 0 ${span} ${span}`} role="img"
      aria-label="QR code containing this order's payment reference" shapeRendering="crispEdges">
      <rect width={span} height={span} fill="#ffffff" />
      <path d={cells.join('')} fill="#000000" />
    </svg>
  );
}

const MayaCheckout = ({ open, onClose, orderId, total, onPaymentComplete }) => {
  const [step, setStep] = useState(steps.METHOD);
  const [method, setMethod] = useState(null);
  const [form, setForm] = useState(blankState);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrScanned, setQrScanned] = useState(false);

  const reset = () => {
    setStep(steps.METHOD);
    setMethod(null);
    setForm(blankState());
    setOtp('');
    setError('');
    setLoading(false);
    setQrScanned(false);
  };

  useEffect(() => { if (open) reset(); }, [open]);

  const resetAndClose = () => { reset(); onClose(); };
  const dialogRef = useModalFocus(open, resetAndClose);

  // A stable per-order reference so the QR and the settlement agree.
  const reference = useMemo(() => {
    const seed = String(orderId || '').replace(/\D/g, '').slice(-6) || '000000';
    return seed.padStart(6, '0');
  }, [orderId]);

  const qrPayload = useMemo(
    () => `PH.QR.DINEFLOW/${reference}?amt=${Number(total || 0).toFixed(2)}&cur=PHP`,
    [reference, total],
  );

  // The settlement RPC keys every payment on a 4-digit reference,
  // whatever the method: card tail, mobile tail, account tail, or the
  // QR reference itself.
  const settlementRef = () => {
    if (method === 'CARD') return digits(form.card.number, 16).slice(-4);
    if (method === 'GCASH') return digits(form.mobile, 11).slice(-4);
    if (method === 'BANK') return digits(form.account, 12).slice(-4);
    return reference.slice(-4);
  };

  const chooseMethod = (id) => {
    setMethod(id);
    setError('');
    setStep(steps.DETAILS);
  };

  const handleDetailsSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (method === 'CARD') {
      if (digits(form.card.number, 16).length < 16) return setError('Enter a valid 16-digit card number.');
      if (!/^\d{2}\/\d{2}$/.test(form.card.expiry)) return setError('Enter the expiry as MM/YY.');
      if (Number(form.card.expiry.slice(0, 2)) < 1 || Number(form.card.expiry.slice(0, 2)) > 12) return setError('Enter a month between 01 and 12.');
      if (form.card.cvv.length < 3) return setError('Enter a valid CVV.');
      if (!form.card.name.trim()) return setError('Enter the cardholder name.');
    }
    if (method === 'GCASH' && digits(form.mobile, 11).length !== 11) {
      return setError('Enter an 11-digit mobile number, e.g. 0917 123 4567.');
    }
    if (method === 'BANK' && digits(form.account, 12).length < 4) {
      return setError('Enter at least the last 4 digits of your account number.');
    }
    if (method === 'QR' && !qrScanned) {
        return setError('Confirm the simulated scan to continue.');
    }
    return setStep(steps.OTP);
  };

  const settle = async (paymentMethod) => {
    setLoading(true);
    setError('');
    try {
      await recordPayment({
        orderId,
        method: paymentMethod,
        amount: total,
        cardLast4: settlementRef(),
        sandboxOtp: otp.trim(),
      });
      setStep(steps.SUCCESS);
      if (onPaymentComplete) onPaymentComplete({ method: paymentMethod, settled: true });
    } catch (err) {
      console.error('Payment failed', err);
      setError(err.message || 'Payment processing failed.');
      setStep(steps.ERROR);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    if (otp.trim() !== DEMO_OTP) {
      setError(`Invalid OTP. Use the sandbox OTP ${DEMO_OTP}.`);
      return;
    }
    settle(method);
  };

  // Cash is owed, not received: the order is placed unpaid and the
  // cashier settles it at the counter. Nothing is recorded here.
  const confirmCash = () => {
    setStep(steps.SUCCESS);
    if (onPaymentComplete) onPaymentComplete({ method: 'CASH', settled: false });
  };

  if (!open) return null;

  const showsSteps = step === steps.DETAILS || step === steps.OTP;
  const amountRow = (
    <div className="maya-amount-row">
      <span>Amount to pay</span>
      <strong className="maya-amount">{peso(total)}</strong>
    </div>
  );

  return (
    <div className="maya-overlay">
      <div ref={dialogRef} className="maya-modal" role="dialog" aria-modal="true" aria-labelledby="maya-dialog-title" tabIndex={-1}>
        <header className="maya-modal__header">
          <div className="maya-modal__brand">
            <span className="maya-modal__logo"><Icon name="card" size={18} /></span>
            <div>
              <p id="maya-dialog-title" className="maya-modal__brand-name">Checkout</p>
              <p className="maya-modal__brand-sub">Sandbox payment · no real money moves</p>
            </div>
          </div>
          {step !== steps.SUCCESS && (
            <button className="maya-modal__close" onClick={resetAndClose} aria-label="Close"><Icon name="x" size={15} /></button>
          )}
        </header>

        {showsSteps && method !== 'CASH' && (
          <div className="maya-steps">
            <div className={`maya-step ${step === steps.DETAILS ? 'maya-step--active' : 'maya-step--done'}`}>
              <span className="maya-step__dot">1</span>
              <span>{METHODS.find((m) => m.id === method)?.label || 'Details'}</span>
            </div>
            <div className="maya-step__line" />
            <div className={`maya-step ${step === steps.OTP ? 'maya-step--active' : ''}`}>
              <span className="maya-step__dot">2</span>
              <span>Confirm</span>
            </div>
          </div>
        )}

        <div className="maya-modal__body">
          {/* ── CHOOSE A METHOD ── */}
          {step === steps.METHOD && (
            <div className="maya-methods">
              <p className="maya-methods__lead">How would you like to pay {peso(total)}?</p>
              {METHODS.map((option) => (
                <button key={option.id} type="button" className="maya-method" onClick={() => chooseMethod(option.id)}>
                  <span className="maya-method__icon"><Icon name={option.icon} size={18} /></span>
                  <span className="maya-method__text">
                    <span className="maya-method__label">{option.label}</span>
                    <span className="maya-method__hint">{option.hint}</span>
                  </span>
                  <Icon name="arrowRight" size={15} />
                </button>
              ))}
            </div>
          )}

          {/* ── DETAILS PER METHOD ── */}
          {step === steps.DETAILS && method === 'CASH' && (
            <div className="maya-form">
              <div className="maya-otp-info">
                <span className="maya-otp-info__icon"><Icon name="peso" size={18} /></span>
                <div>
                  <p><strong>Pay {peso(total)} at the counter</strong></p>
                  <p className="maya-otp-info__sub">
                    Your order goes to the kitchen now. It stays marked unpaid until the cashier receives the cash.
                  </p>
                </div>
              </div>
              {amountRow}
              <button type="button" className="maya-btn-primary" onClick={confirmCash}>
                Place order, pay at counter
              </button>
              <button type="button" className="maya-btn-ghost" onClick={() => setStep(steps.METHOD)}>
                Choose another method
              </button>
            </div>
          )}

          {step === steps.DETAILS && method !== 'CASH' && (
            <form className="maya-form" onSubmit={handleDetailsSubmit}>
              {method === 'CARD' && (
                <>
                  <div className="maya-demo-hint">
                    <p>Sandbox card: <strong>4111 1111 1111 1111</strong> · Exp <strong>12/28</strong> · CVV <strong>123</strong></p>
                  </div>
                  <div className="maya-card-preview">
                    <div className="maya-card-visual">
                      <p className="maya-card-visual__bank">DineFlow Sandbox</p>
                      <p className="maya-card-visual__number">
                        {form.card.number ? formatCard(form.card.number) : '•••• •••• •••• ••••'}
                      </p>
                      <div className="maya-card-visual__bottom">
                        <span>{form.card.name || 'CARDHOLDER NAME'}</span>
                        <span>{form.card.expiry || 'MM/YY'}</span>
                      </div>
                    </div>
                  </div>

                  <label className="maya-label" htmlFor="pay-card">Card number
                    <input id="pay-card" className="maya-input" type="text" inputMode="numeric" autoComplete="cc-number"
                      placeholder="4111 1111 1111 1111" maxLength={19} value={formatCard(form.card.number)}
                      onChange={(e) => setForm((p) => ({ ...p, card: { ...p.card, number: digits(e.target.value, 16) } }))} />
                  </label>

                  <label className="maya-label" htmlFor="pay-name">Cardholder name
                    <input id="pay-name" className="maya-input" type="text" autoComplete="cc-name"
                      placeholder="e.g. Juan dela Cruz" value={form.card.name}
                      onChange={(e) => setForm((p) => ({ ...p, card: { ...p.card, name: e.target.value } }))} />
                  </label>

                  <div className="maya-form__row">
                    <label className="maya-label maya-label--half" htmlFor="pay-exp">Expiry (MM/YY)
                      <input id="pay-exp" className="maya-input" type="text" inputMode="numeric" autoComplete="cc-exp"
                        placeholder="12/28" maxLength={5} value={form.card.expiry}
                        onChange={(e) => {
                          let v = digits(e.target.value, 4);
                          if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
                          setForm((p) => ({ ...p, card: { ...p.card, expiry: v } }));
                        }} />
                    </label>
                    <label className="maya-label maya-label--half" htmlFor="pay-cvv">CVV
                      <input id="pay-cvv" className="maya-input" type="password" inputMode="numeric" autoComplete="cc-csc"
                        placeholder="123" maxLength={4} value={form.card.cvv}
                        onChange={(e) => setForm((p) => ({ ...p, card: { ...p.card, cvv: digits(e.target.value, 4) } }))} />
                    </label>
                  </div>
                </>
              )}

              {method === 'GCASH' && (
                <>
                  <div className="maya-demo-hint">
                    <p>Sandbox wallet: any 11-digit mobile number, then OTP <strong>123456</strong>.</p>
                  </div>
                  <label className="maya-label" htmlFor="pay-mobile">GCash mobile number
                    <input id="pay-mobile" className="maya-input" type="tel" inputMode="numeric" autoComplete="tel"
                      placeholder="0917 123 4567" maxLength={13} value={formatMobile(form.mobile)}
                      onChange={(e) => setForm((p) => ({ ...p, mobile: digits(e.target.value, 11) }))} />
                  </label>
                </>
              )}

              {method === 'BANK' && (
                <>
                  <div className="maya-demo-hint">
                    <p>Sandbox transfer: any account digits, then OTP <strong>123456</strong>.</p>
                  </div>
                  <label className="maya-label" htmlFor="pay-bank">Bank
                    <select id="pay-bank" className="maya-input" value={form.bank}
                      onChange={(e) => setForm((p) => ({ ...p, bank: e.target.value }))}>
                      {BANKS.map((bank) => <option key={bank}>{bank}</option>)}
                    </select>
                  </label>
                  <label className="maya-label" htmlFor="pay-account">Account number
                    <input id="pay-account" className="maya-input" type="text" inputMode="numeric"
                      placeholder="Last 4 digits are enough" maxLength={12} value={form.account}
                      onChange={(e) => setForm((p) => ({ ...p, account: digits(e.target.value, 12) }))} />
                  </label>
                </>
              )}

              {method === 'QR' && (
                <div className="maya-qr">
                  <QrCanvas payload={qrPayload} />
                  <p className="maya-qr__ref">
                    Reference <strong>{reference}</strong> · {peso(total)}
                  </p>
                  <p className="maya-qr__note">
                    This code contains a demonstration payment reference. It is not a payable banking QR. No funds are transferred.
                  </p>
                  <label className="maya-check">
                    <input type="checkbox" checked={qrScanned}
                      onChange={(e) => { setQrScanned(e.target.checked); setError(''); }} />
                      <span>Simulate a successful QR scan</span>
                  </label>
                </div>
              )}

              {error && <p className="maya-error" role="alert">{error}</p>}
              {amountRow}

              <button type="submit" className="maya-btn-primary">
                Continue <Icon name="arrowRight" />
              </button>
              <button type="button" className="maya-btn-ghost" onClick={() => { setStep(steps.METHOD); setError(''); }}>
                Choose another method
              </button>
            </form>
          )}

          {/* ── OTP ── */}
          {step === steps.OTP && (
            <form className="maya-form" onSubmit={handleOtpSubmit}>
              <div className="maya-otp-info">
                <span className="maya-otp-info__icon"><Icon name="card" size={18} /></span>
                <div>
                  <p><strong>Enter the code sent to your registered number</strong></p>
                  <p className="maya-otp-info__sub">Sandbox OTP: <strong>{DEMO_OTP}</strong></p>
                </div>
              </div>

              <label className="maya-label" htmlFor="pay-otp">6-digit code
                <input id="pay-otp" className="maya-input maya-input--otp" type="text" inputMode="numeric"
                  autoComplete="one-time-code" placeholder="123456" maxLength={6} value={otp}
                  onChange={(e) => { setOtp(digits(e.target.value, 6)); setError(''); }} />
              </label>

              {error && <p className="maya-error" role="alert">{error}</p>}
              {amountRow}

              <button type="submit" className="maya-btn-primary" disabled={loading}>
                {loading ? 'Processing' : `Pay ${peso(total)}`}
              </button>
              <button type="button" className="maya-btn-ghost" disabled={loading}
                onClick={() => { setStep(steps.DETAILS); setError(''); setOtp(''); }}>
                Back
              </button>
            </form>
          )}

          {/* ── SUCCESS ── */}
          {step === steps.SUCCESS && (
            <div className="maya-success">
              <div className="maya-success__icon"><Icon name="check" size={26} /></div>
              <h3>{method === 'CASH' ? 'Order placed' : 'Payment successful'}</h3>
              <p>
                {method === 'CASH'
                  ? 'The kitchen has your order. Pay the cashier when you collect it.'
                  : 'Your order has been paid and is now being prepared.'}
              </p>
              <p className="maya-success__amount">{peso(total)} · {METHOD_LABEL[method] || 'payment'}</p>
              <button className="maya-btn-primary" onClick={resetAndClose}>Done</button>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === steps.ERROR && (
            <div className="maya-error-state">
              <div className="maya-error-state__icon"><Icon name="x" size={26} /></div>
              <h3>Payment failed</h3>
              <p>{error}</p>
              <button className="maya-btn-primary" onClick={() => { setStep(steps.OTP); setError(''); }}>
                Try again
              </button>
              <button className="maya-btn-ghost" onClick={() => { setStep(steps.METHOD); setError(''); setOtp(''); }}>
                Choose another method
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MayaCheckout;
