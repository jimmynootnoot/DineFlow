import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendations } from '../serverlib/recommendations.mjs';
import { aggregateSales,periodBounds } from '../serverlib/sales.mjs';
import { needsStaff,lexicalKnowledge } from '../serverlib/assistant.mjs';
import { validateMayaPayment } from '../serverlib/maya.mjs';
const menu=['A','B','C','D'].map(id=>({id,name:id,category:'Mains',available:true,stock:5}));
const rule={id:'rule',run_id:'run',antecedent_ids:['A','B'],consequent_ids:['C'],source:'historical',support:.2,confidence:.8,lift:2};
test('hosted Maya only settles a matching provider-verified success',()=>{
  const attempt={id:'reference',checkout_id:'checkout',amount:'112.00'};
  const payment={id:'checkout',requestReferenceNumber:'reference',paymentStatus:'PAYMENT_SUCCESS',amount:'112.00',currency:'PHP'};
  assert.equal(validateMayaPayment(payment,attempt),true);
  for(const changes of [{amount:'1.00'},{currency:'USD'},{requestReferenceNumber:'other'},{id:'other'},{paymentStatus:'PENDING'}])assert.equal(validateMayaPayment({...payment,...changes},attempt),false);
});
test('entire antecedent is required, unavailable and already selected items excluded',()=>{
  assert.equal(rankRecommendations(['A'],menu,[rule],[]).length,0);
  assert.equal(rankRecommendations(['A','B'],menu,[rule],[]).length,1);
  assert.equal(rankRecommendations(['A','B','C'],menu,[rule],[]).length,0);
  assert.equal(rankRecommendations(['A','B'],menu.map(i=>({...i,stock:0})),[rule],[]).length,0);
});
test('rules require an actual batch, positive lift and no duplicate combo',()=>{
  assert.equal(rankRecommendations(['A','B'],menu,[{...rule,lift:1}],[]).length,0);
  assert.equal(rankRecommendations(['A','B'],menu,[{...rule,run_id:null}],[]).length,0);
  assert.equal(rankRecommendations(['A','B'],menu,[rule,rule],[]).length,1);
});
test('fallback is actual same-category bestseller only',()=>{
  const result=rankRecommendations(['A'],menu.map(i=>i.id==='D'?{...i,category:'Drinks'}:i),[],[{id:'D',quantity:100},{id:'B',quantity:8},{id:'C',quantity:0}]);
  assert.equal(result.length,1);assert.equal(result[0].items[0].id,'B');assert.equal(result[0].source,'bestseller');
});
test('Philippine date boundaries and paid completed revenue use decimal cents',()=>{
  const bounds=periodBounds('2026-09-01','2026-09-01');
  assert.equal(bounds.from,'2026-08-31T16:00:00.000Z');assert.equal(bounds.to,'2026-09-01T16:00:00.000Z');
  const order={status:'completed',payment_status:'paid',total_amount:'0.10',created_at:'2026-09-01T00:00:00.000Z',order_items:[]};
  const result=aggregateSales([order,{...order,total_amount:'0.20'},{...order,status:'cancelled',total_amount:'100'}],bounds);
  assert.equal(result.revenue,.3);assert.equal(result.completedOrders,2);assert.equal(result.changePercent,null);
  assert.throws(()=>periodBounds('2026-09-03','2026-09-01'));assert.throws(()=>periodBounds('2026-02-30','2026-03-01'));
});
test('sensitive requests escalate and unrelated queries retrieve no context',()=>{
  for(const question of ['Cancel my order','Is it safe for my diabetes?','Give me a senior discount','Offer nutritional advice','Special preparation please'])assert.equal(needsStaff(question),true,question);
  assert.equal(needsStaff('What are Chicken Sisig ingredients?'),false);
  assert.equal(lexicalKnowledge('Who won the football game?',[{content:'Chicken Sisig. Ingredients: chicken, onion.'}]).length,0);
});
