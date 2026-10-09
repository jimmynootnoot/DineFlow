import { authenticate,endpoint,httpError } from '../serverlib/platform.mjs';
import { mayaConfigured,mayaRequest,verifyMaya } from '../serverlib/maya.mjs';

export default endpoint(async request=>{
  const {db,user}=await authenticate(request);
  const {action,orderId}=request.body||{};
  if(action==='configuration')return {enabled:mayaConfigured()};
  if(!mayaConfigured())throw httpError(503,'Hosted Maya sandbox is not configured.');
  if(!['create','verify'].includes(action)||!/^[0-9a-f-]{36}$/i.test(orderId||''))throw httpError(400,'Invalid checkout request.');
  const {data:order,error}=await db.from('orders').select('id,payment_status,status').eq('id',orderId).eq('customer_id',user.id).maybeSingle();
  if(error)throw error;if(!order)throw httpError(404,'Order not found.');
  if(order.payment_status==='paid')return {paid:true};
  const {data:quota,error:quotaError}=await db.rpc('consume_payment_quota',{p_user_id:user.id});
  if(quotaError||!quota)throw httpError(429,'Please wait before another checkout request.');
  if(action==='verify'){
    const {data:attempt,error:readError}=await db.from('maya_checkouts').select('*').eq('order_id',orderId).order('created_at',{ascending:false}).limit(1);
    if(readError)throw readError;if(!attempt?.[0]?.checkout_id)throw httpError(409,'No hosted checkout is ready to verify yet.');
    return verifyMaya(db,attempt[0]);
  }
  const {data:reservation,error:reserveError}=await db.rpc('reserve_maya_checkout',{p_order_id:orderId,p_customer_id:user.id});
  if(reserveError)throw httpError(409,reserveError.message);
  if(!reservation.isNew){
    if(reservation.redirect_url)return {redirectUrl:reservation.redirect_url};
    throw httpError(409,'A checkout request is already being prepared. Wait before retrying; ask staff if it does not finish.');
  }
  const base=new URL(process.env.APP_BASE_URL);
  if(base.protocol!=='https:'&&base.hostname!=='localhost'&&base.hostname!=='127.0.0.1')throw httpError(503,'A secure application return URL is required.');
  const returnUrl=new URL('/',base);returnUrl.searchParams.set('mayaOrder',orderId);
  const checkout=await mayaRequest('/checkout/v1/checkouts',process.env.MAYA_PUBLIC_KEY,{
    totalAmount:{value:Number(reservation.amount).toFixed(2),currency:'PHP'},requestReferenceNumber:reservation.id,
    redirectUrl:{success:returnUrl.href,failure:returnUrl.href,cancel:returnUrl.href},
  });
  const redirect=new URL(checkout.redirectUrl);
  if(redirect.protocol!=='https:'||!/(^|\.)(paymaya|maya)\.com$|(^|\.)maya\.ph$/.test(redirect.hostname)||!/^[0-9a-f-]{36}$/i.test(checkout.checkoutId||''))throw httpError(502,'Maya returned an invalid checkout.');
  const {error:saveError}=await db.from('maya_checkouts').update({checkout_id:checkout.checkoutId,redirect_url:redirect.href,state:'pending'}).eq('id',reservation.id);
  if(saveError)throw saveError;
  return {redirectUrl:redirect.href};
});
