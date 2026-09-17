import { serviceClient } from '../serverlib/platform.mjs';
const db=serviceClient();
for(const table of ['menu_items','orders','dining_tables','chat_sessions','chat_messages','recommendation_runs','sales_insights']){
  const {count,error}=await db.from(table).select('*',{count:'exact',head:true});
  console.log(`${table}: ${error||count===null?'unavailable ('+(error?.code||'no count')+')':count+' rows'}`);
}
const {count,error}=await db.from('restaurant_knowledge').select('id',{count:'exact',head:true}).not('embedding','is',null);
console.log(`Vector knowledge: ${error?'unavailable':count+' indexed records'}`);
console.log(`Embedding credential configured: ${Boolean(process.env.EMBEDDING_API_KEY||/^sk-/.test(process.env.OPENAI_API_KEY||''))}`);
if(process.argv.includes('--schema')){
  const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,Accept:'application/openapi+json'}});
  const spec=await response.json();
  for(const name of ['chat_sessions','chat_messages','categories','restaurant_knowledge','orders','order_items','recommendation_rules']){
    const def=spec.definitions?.[name];console.log(name,JSON.stringify({required:def?.required,columns:def?.properties}));
  }
}
