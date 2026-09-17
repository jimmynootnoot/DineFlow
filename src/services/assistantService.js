import { serverRequest } from './platformService';
import { supabase } from './supabase';

const money = value => `₱${Number(value||0).toFixed(2)}`;
export function localAnswer(question,menu,orders=[]) {
  if (/discount|cancel|refund|dispute|special|medical|nutrition|diet|diabet|pregnan|calorie|severe allerg|(?:change|modify|place|pay).*order/i.test(question)) return 'This request needs restaurant staff. Use Ask staff for review. I cannot approve discounts, change orders, or give medical, nutritional, or dietary advice.';
  if (/\b(status|track|ready|where)\b.*\border\b|\border\b.*\b(status|ready|track)\b/i.test(question)) {
    const latest=orders[0];return latest?`${latest.orderNumber} is ${latest.status}.`:'You do not have a recorded order yet.';
  }
  const available=menu.filter(item=>item.available&&item.stock>0);
  const budget=Number(question.match(/(?:₱|php|peso|budget(?: of)?|under|below)\s*(\d+)/i)?.[1]);
  if(budget){const choices=available.filter(item=>item.price<=budget).slice(0,4);return choices.length?`Available within ${money(budget)}: ${choices.map(item=>`${item.name} (${money(item.price)})`).join(', ')}.`:'No available menu item matches that budget.';}
  const named=menu.filter(item=>question.toLowerCase().includes(item.name.toLowerCase()));
  if(named.length)return named.map(item=>`${item.name}: ${money(item.price)}. ${item.description} Ingredients: ${(item.ingredients||[]).join(', ')||'not recorded'}. Allergens: ${(item.allergens||[]).join(', ')||'not recorded; confirm with staff'}. Spice: ${item.spiceLevel}. Portion: ${item.servingSize}. ${item.available&&item.stock>0?'Available':'Unavailable'}.`).join('\n');
  return 'The approved information available here does not answer that question. Please use Ask staff for help.';
}
export async function askAssistant({question,menu,orders=[],sessionId}) {
  try{return await serverRequest('assistant',{question,sessionId});}
  catch(error){return {answer:localAnswer(question,menu,orders),mode:'local-grounded',reason:error.message,saved:false,sessionId};}
}
export async function loadConversation(userId) {
  const {data:sessions,error}=await supabase.from('chat_sessions').select('id').eq('customer_id',userId).order('created_at',{ascending:false}).limit(1);
  if(error)throw error;
  if(!sessions?.length)return {sessionId:null,messages:[]};
  const sessionId=sessions[0].id;
  const {data,error:messageError}=await supabase.from('chat_messages').select('*').eq('session_id',sessionId).order('created_at',{ascending:false}).limit(200);
  if(messageError)throw messageError;
  return {sessionId,messages:data.reverse().map(row=>({role:row.role,text:row.content,mode:row.mode,sources:row.sources,saved:true,createdAt:row.created_at}))};
}
export async function exportConversation(sessionId) {
  const rows=[];
  for(let offset=0;;){const {data,error}=await supabase.from('chat_messages').select('role,content,mode,sources,created_at').eq('session_id',sessionId).order('created_at').order('id').range(offset,offset+499);if(error)throw error;if(!data.length)return rows;rows.push(...data);offset+=data.length;}
}
export function createSalesInsight({dailyStats,bestSellers,comparison}) {
  return `${dailyStats?.totalOrders||0} orders today generated ${money(dailyStats?.totalRevenue)} from completed, paid bills.${bestSellers?.[0]?` ${bestSellers[0].name} leads the last 30 days.`:''}${comparison?.changePercent==null?' No comparison baseline yet.':` Revenue changed ${comparison.changePercent.toFixed(1)}% against the previous ${comparison.days} days.`}`;
}
