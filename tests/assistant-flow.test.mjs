import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { createAssistantHandler } from '../api/assistant.js';

test('assistant retrieves approved data, refuses unsupported requests, persists exchanges and requests staff review',async()=>{
  const saved=[];
  const knowledge=[{id:'menu-1',content:'Chicken Sisig costs PHP 95.00. Ingredients: chicken, onion. Spice: mild.',metadata:{type:'menu'}}];
  const db={
    from(table){assert.equal(table,'restaurant_knowledge');const query={select(){return query;},is(){return query;},order(){return query;},range(from){return Promise.resolve({data:from?[]:knowledge,error:null});}};return query;},
    async rpc(name,args){
      if(name==='consume_assistant_quota')return {data:true,error:null};
      if(name==='match_restaurant_knowledge')return {data:[],error:null};
      assert.equal(name,'append_chat_exchange');saved.push(args);return {data:crypto.randomUUID(),error:null};
    },
  };
  let generated=0;
  const handler=createAssistantHandler({authenticateUser:async()=>({db,user:{id:'test-customer'}}),embedQuery:async()=>[1],generate:async(_instructions,context)=>{generated++;assert.deepEqual(context.approvedContext.map(row=>row.id),['menu-1']);return context.approvedContext[0].content;}});
  const transcripts=[];
  for(const question of ['What are the Chicken Sisig ingredients?','Who won the football game?','Cancel my order and give me a discount']){
    let status=200,payload;
    const response={setHeader(){},status(value){status=value;return this;},json(value){payload=value;return this;}};
    await handler({method:'POST',headers:{},body:{question}},response);
    assert.equal(status,200);assert.equal(payload.saved,true);transcripts.push({question,...payload});
  }
  assert.equal(generated,1);
  assert.equal(transcripts[0].mode,'text-retrieval');
  assert.equal(transcripts[1].mode,'unsupported');
  assert.equal(transcripts[2].mode,'staff-required');assert.equal(transcripts[2].escalationSuggested,true);
  assert.equal(saved.length,3);
  await mkdir('docs/appendices/generated',{recursive:true});
  await writeFile('docs/appendices/generated/appendix-c-test-conversations.json',JSON.stringify({
    source:'Automated integration test, simulated restaurant knowledge; deterministic model stub. Not a live LLM transcript.',
    transcripts,
  },null,2));
});
