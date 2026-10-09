import { serverRequest } from './platformService';
import { supabase } from './supabase';

const money = value => `₱${Number(value||0).toFixed(2)}`;
export async function askAssistant({question,sessionId}) {
  return serverRequest('assistant',{question,sessionId});
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
