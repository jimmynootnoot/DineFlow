import { serviceClient, embed, readAll } from '../serverlib/platform.mjs';
const db=serviceClient();
const rows=await readAll(()=>db.from('restaurant_knowledge').select('id,content,updated_at').is('embedding',null).order('id'));
let count=0;
for(const row of rows){
  const embedding=await embed(row.content);
  // Optimistic concurrency: never attach an old embedding to a newer menu text.
  const {data,error}=await db.from('restaurant_knowledge').update({embedding}).eq('id',row.id).eq('content',row.content).select('id');
  if(error)throw error;
  count+=data.length;
}
console.log(`Indexed ${count} approved records; ${rows.length-count} changed while indexing and will retry next run.`);
