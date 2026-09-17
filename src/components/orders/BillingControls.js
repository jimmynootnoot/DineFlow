import { useState } from 'react';
import { supabase } from '../../services/supabase';
import { recordPayment } from '../../services/reportService';
import '../panels/WorkflowPanels.css';

export default function BillingControls({order}) {
  const [type,setType]=useState(order.discountType||'none'),[eligible,setEligible]=useState(String(order.discountEligibleAmount||0)),[tendered,setTendered]=useState(''),[verified,setVerified]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[busy,setBusy]=useState(false);
  const apply=async e=>{e.preventDefault();setBusy(true);setError('');setResult(null);const {error:failure}=await supabase.rpc('apply_order_discount',{p_order_id:order.id,p_type:type,p_eligible_amount:type==='none'?0:Number(eligible)});if(failure)setError(failure.message);else setResult({message:'Discount saved. The bill updates from the recorded total.'});setBusy(false);};
  const settle=async e=>{e.preventDefault();setBusy(true);setError('');try{const payment=await recordPayment({orderId:order.id,method:'CASH',amount:Number(tendered)});setResult({message:`Cash recorded. Change: ₱${Number(payment.changeDue).toFixed(2)}.`});}catch(failure){setError(failure.message);}finally{setBusy(false);}};
  return <section className="workflow workflow-section" aria-label="Staff billing"><h3>Billing</h3>{error&&<p role="alert" className="workflow-error">{error}</p>}{result&&<p role="status">{result.message}</p>}
    <p>Bill total: <strong>₱{order.totalAmount.toFixed(2)}</strong> · {order.paymentStatus}</p>
    {order.paymentStatus==='unpaid'&&!['cancelled','completed'].includes(order.status)&&<>
      <form onSubmit={apply}><div className="workflow-controls"><label>Statutory discount<select value={type} onChange={e=>{setType(e.target.value);setVerified(false);}}><option value="none">None</option><option value="senior">Senior citizen</option><option value="pwd">Person with disability</option></select></label>{type!=='none'&&<label>Eligible portion of subtotal (₱)<input type="number" min="0.01" max={order.subtotal} step="0.01" required value={eligible} onChange={e=>setEligible(e.target.value)}/></label>}<button className="hero-btn hero-btn--outline" disabled={busy||(type!=='none'&&!verified)}>Apply discount</button></div>{type!=='none'&&<label><span><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/> I verified eligibility and the eligible share of this bill.</span></label>}</form>
      <form className="workflow-controls" onSubmit={settle}><label>Cash tendered (₱)<input required type="number" min={order.totalAmount} step="0.01" value={tendered} onChange={e=>setTendered(e.target.value)}/></label><button className="hero-btn" disabled={busy}>Record cash payment</button></form>
      <p className="workflow-note">Payment of a served order completes the bill and releases its table when no other active bills remain.</p>
    </>}
  </section>;
}
