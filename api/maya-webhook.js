import { endpoint,httpError,serviceClient } from '../serverlib/platform.mjs';
import { mayaConfigured,verifyMaya } from '../serverlib/maya.mjs';

// Never trusts a redirect or webhook's claimed status/amount. Re-fetch from Maya.
export default endpoint(async request=>{
  if(!mayaConfigured())throw httpError(503,'Maya sandbox is not configured.');
  const id=request.body?.id;
  if(!/^[0-9a-f-]{36}$/i.test(id||''))throw httpError(400,'Invalid payment ID.');
  const db=serviceClient();
  const {data:attempt,error}=await db.from('maya_checkouts').select('*').eq('checkout_id',id).maybeSingle();
  if(error)throw error;if(!attempt)return {received:true};
  if(attempt.state==='paid')return {received:true};
  await verifyMaya(db,attempt);
  return {received:true};
});
