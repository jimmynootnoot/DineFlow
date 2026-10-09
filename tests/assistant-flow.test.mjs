import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { createAssistantHandler } from '../api/assistant.mjs';

test('assistant retrieves approved data, refuses unsupported requests, persists exchanges and requests staff review',async()=>{
  const saved=[];
  const knowledge=[{id:'menu-1',content:'Chicken Sisig costs PHP 95.00. Ingredients: chicken, onion. Spice: mild.',metadata:{type:'menu'}}];
  const menu=[
    {id:'menu-1',name:'Chicken Sisig',description:'Chopped chicken with onion.',price:95,category:'Sizzling Plates',serving_size:'1 plate',prep_minutes:15,spice_level:'mild',ingredients:['chicken','onion'],allergens:[],available:true,stock:10,featured:true},
    {id:'menu-2',name:'Adobo Rice Bowl',description:'Chicken adobo flakes over rice.',price:95,category:'Rice Bowls',serving_size:'1 bowl',prep_minutes:10,spice_level:'none',ingredients:['chicken','soy sauce','rice'],allergens:['soy'],available:true,stock:10,featured:true},
  ];
  const db={
    from(table){assert.ok(['restaurant_knowledge','menu_items'].includes(table));const rows=table==='menu_items'?menu:knowledge;const query={select(){return query;},is(){return query;},eq(){return query;},gt(){return query;},order(){return query;},range(from){return Promise.resolve({data:from?[]:rows,error:null});}};return query;},
    async rpc(name,args){
      if(name==='consume_assistant_quota')return {data:true,error:null};
      if(name==='match_restaurant_knowledge')return {data:[],error:null};
      assert.equal(name,'append_chat_exchange');saved.push(args);return {data:`00000000-0000-4000-8000-${String(saved.length).padStart(12,'0')}`,error:null};
    },
  };
  let generated=0;
  const handler=createAssistantHandler({authenticateUser:async()=>({db,user:{id:'test-customer'}}),embedQuery:async()=>[1],generate:async(_instructions,context)=>{generated++;assert.equal(context.approvedContext[0].id,'menu:menu-1');return context.approvedContext[0].content;}});
  const transcripts=[];
  for(const question of ['What are the Chicken Sisig ingredients?','Who won the football game?','Is the Adobo Rice Bowl peanut-free?','Cancel my order and give me a discount']){
    let status=200,payload;
    const response={setHeader(){},status(value){status=value;return this;},json(value){payload=value;return this;}};
    await handler({method:'POST',headers:{},body:{question}},response);
    assert.equal(status,200);assert.equal(payload.saved,true);transcripts.push({question,...payload});
  }
  assert.equal(generated,1);
  assert.equal(transcripts[0].mode,'menu-retrieval');
  assert.equal(transcripts[1].mode,'unsupported');
  assert.equal(transcripts[2].mode,'allergen-review');assert.equal(transcripts[2].escalationSuggested,true);
  assert.match(transcripts[2].answer,/does not confirm it is free/);
  assert.equal(transcripts[3].mode,'staff-required');assert.equal(transcripts[3].escalationSuggested,true);
  assert.equal(saved.length,4);
  await mkdir('docs/appendices/generated',{recursive:true});
  await writeFile('docs/appendices/generated/appendix-c-test-conversations.json',JSON.stringify({
    source:'Automated integration test, simulated restaurant knowledge; deterministic model stub. Not a live LLM transcript.',
    transcripts,
  },null,2));
});
