import Icon from '../ui/Icon';
import { useModalFocus } from '../../hooks/useModalFocus';

const money = (value) => `₱${Number(value || 0).toFixed(2)}`;

export default function ReceiptPanel({ order, onClose }) {
  const dialogRef = useModalFocus(Boolean(order), onClose);
  if (!order) return null;
  return (
    <div className="receipt-backdrop" onMouseDown={onClose}>
      <section ref={dialogRef} className="receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
        <button className="receipt__close" onClick={onClose} aria-label="Close bill"><Icon name="x" /></button>
        <p className="receipt__brand">DINEFLOW OS</p><h2 id="receipt-title">Order bill</h2>
        <div className="receipt__meta"><span>{order.orderNumber}</span><span>{new Date(order.createdAt).toLocaleString('en-PH')}</span></div>
        <div className="receipt__meta"><span>{order.orderType}{order.tableNumber ? ` · Table ${order.tableNumber}` : ''}</span><span className={`tag tag--${order.paymentStatus === 'paid' ? 'completed' : 'pending'}`}>{order.paymentStatus}</span></div>
        <div className="receipt__items">{order.items.map((item) => <div key={item.id || item.name}><span>{item.quantity} × {item.name}{item.remarks ? <small>{item.remarks}</small> : null}</span><b>{money(item.price * item.quantity)}</b></div>)}</div>
        <dl className="receipt__totals"><div><dt>Subtotal</dt><dd>{money(order.subtotal ?? order.totalAmount)}</dd></div>{order.serviceFee > 0 && <div><dt>Service fee</dt><dd>{money(order.serviceFee)}</dd></div>}{order.vatExemption>0&&<div><dt>VAT exemption</dt><dd>−{money(order.vatExemption)}</dd></div>}{order.discountAmount>0&&<div><dt>{order.discountType==='senior'?'Senior citizen':'PWD'} discount</dt><dd>−{money(order.discountAmount)}</dd></div>}<div className="receipt__grand"><dt>Total</dt><dd>{money(order.totalAmount)}</dd></div></dl>
        <p className="receipt__note">Status: {order.status}. This bill is generated from the recorded order and payment data.</p>
        {(order.payments||[]).filter(payment=>payment.status==='PAID').map(payment=><div key={payment.id} className="receipt__meta"><span>{payment.method} · Tendered {money(payment.amountTendered)}</span><span>Change {money(payment.changeDue)}</span></div>)}
        <button className="pos-submit" onClick={() => window.print()}><Icon name="download" /> Print bill</button>
      </section>
    </div>
  );
}
