import { useState } from 'react';
import { serverRequest } from '../../services/platformService';

export default function HostedMaya({orderId}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const request=async action=>{setBusy(true);setMessage('');try{const result=await serverRequest('maya',{action,orderId});if(result.redirectUrl)window.location.assign(result.redirectUrl);else setMessage(result.paid?'Payment verified. Your bill will update.':`Maya status: ${result.status}. No payment has been recorded yet.`);}catch(error){setMessage(error.message);}finally{setBusy(false);}};
  return <div><div className="tbl-actions"><button className="tbl-btn tbl-btn--green" disabled={busy} onClick={()=>request('create')}>Open Maya sandbox</button><button className="tbl-btn" disabled={busy} onClick={()=>request('verify')}>Verify Maya payment</button></div>{message&&<small role="status">{message}</small>}</div>;
}
