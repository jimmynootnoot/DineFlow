import { httpError } from './platform.mjs';

const BASE='https://pg-sandbox.paymaya.com'; // Deliberately no production switch.
export const mayaConfigured=()=>Boolean(process.env.MAYA_PUBLIC_KEY&&process.env.MAYA_SECRET_KEY&&process.env.APP_BASE_URL);
export async function mayaRequest(path,key,body) {
  const response=await fetch(`${BASE}${path}`,{method:body?'POST':'GET',signal:AbortSignal.timeout(20000),headers:{Authorization:`Basic ${Buffer.from(`${key}:`).toString('base64')}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok)throw httpError(502,'Maya sandbox could not process the request. Please try again or ask staff.');
  return data;
}
export function validateMayaPayment(payment,attempt) {
  const amount=payment.totalAmount?.value ?? payment.amount?.value ?? payment.amount;
  const currency=payment.totalAmount?.currency ?? payment.amount?.currency ?? payment.currency;
  return payment.id===attempt.checkout_id && payment.requestReferenceNumber===attempt.id && payment.paymentStatus==='PAYMENT_SUCCESS' && currency==='PHP' && Number.isFinite(Number(amount)) && Math.round(Number(amount)*100)===Math.round(Number(attempt.amount)*100);
}
export async function verifyMaya(db,attempt) {
  const payment=await mayaRequest(`/payments/v1/payments/${encodeURIComponent(attempt.checkout_id)}`,process.env.MAYA_SECRET_KEY);
  if(payment.paymentStatus==='PAYMENT_SUCCESS'){
    if(!validateMayaPayment(payment,attempt))throw httpError(409,'Maya payment details do not match the recorded checkout. Staff review is required.');
    const {data,error}=await db.rpc('settle_verified_maya',{p_attempt_id:attempt.id});
    if(error)throw error;
    return {paid:true,payment:data};
  }
  if(payment.id===attempt.checkout_id && payment.requestReferenceNumber===attempt.id && ['PAYMENT_FAILED','PAYMENT_EXPIRED','PAYMENT_CANCELLED'].includes(payment.paymentStatus)) {
    const {error}=await db.from('maya_checkouts').update({state:'expired'}).eq('id',attempt.id).neq('state','paid');
    if(error)throw error;
  }
  return {paid:false,status:payment.paymentStatus||'PENDING'};
}
