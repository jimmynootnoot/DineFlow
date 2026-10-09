import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendations } from '../serverlib/recommendations.mjs';
import { aggregateSales,periodBounds,sameSalesAggregates,salesSummary } from '../serverlib/sales.mjs';
import { needsStaff,lexicalKnowledge,isComboQuestion,isAllergySafetyQuestion,allergenReviewAnswer,menuKnowledgeForQuestion,menuPairingFallback,trendRecommendationAnswer } from '../serverlib/assistant.mjs';
import { validateMayaPayment } from '../serverlib/maya.mjs';
import { DEMO_PAYMENT, validateDemoPayment } from '../serverlib/demo-payment.mjs';
const menu=['A','B','C','D'].map(id=>({id,name:id,category:'Mains',available:true,stock:5}));
const rule={id:'rule',run_id:'run',antecedent_ids:['A','B'],consequent_ids:['C'],source:'historical',support:.2,confidence:.8,lift:2};
test('hosted Maya only settles a matching provider-verified success',()=>{
  const attempt={id:'reference',checkout_id:'checkout',amount:'112.00'};
  const payment={id:'checkout',requestReferenceNumber:'reference',paymentStatus:'PAYMENT_SUCCESS',amount:'112.00',currency:'PHP'};
  assert.equal(validateMayaPayment(payment,attempt),true);
  for(const changes of [{amount:'1.00'},{currency:'USD'},{requestReferenceNumber:'other'},{id:'other'},{paymentStatus:'PENDING'}])assert.equal(validateMayaPayment({...payment,...changes},attempt),false);
});
test('demo payments require documented credentials and expose a safe decline path',()=>{
  const base={otp:DEMO_PAYMENT.otp,expectedOtp:DEMO_PAYMENT.otp,reference:'1111'};
  assert.equal(validateDemoPayment({...base,method:'CARD',instrument:DEMO_PAYMENT.cardApproved}).ok,true);
  assert.equal(validateDemoPayment({...base,method:'CARD',instrument:DEMO_PAYMENT.cardDeclined}).code,'CARD_DECLINED');
  assert.equal(validateDemoPayment({...base,method:'CARD',instrument:'5555555555554444'}).code,'INVALID_DEMO_CARD');
  assert.equal(validateDemoPayment({...base,method:'GCASH',instrument:DEMO_PAYMENT.walletMobile}).ok,true);
  assert.equal(validateDemoPayment({...base,method:'BANK',instrument:DEMO_PAYMENT.bankAccount}).ok,true);
  assert.equal(validateDemoPayment({...base,method:'QR',instrument:'QR:1111'}).ok,true);
  assert.equal(validateDemoPayment({...base,method:'CARD',instrument:DEMO_PAYMENT.cardApproved,otp:'000000'}).code,'INVALID_OTP');
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
  const item={menu_item_id:'A',name:'Adobo',quantity:1,price:'0.10'};
  const order={status:'completed',payment_status:'paid',total_amount:'0.10',created_at:'2026-09-01T00:00:00.000Z',order_items:[item]};
  const prior={...order,created_at:'2026-08-31T00:00:00.000Z',order_items:[{...item,quantity:1}]};
  const result=aggregateSales([order,{...order,total_amount:'0.20'},{...order,status:'cancelled',total_amount:'100'},prior],bounds);
  assert.equal(result.revenue,.3);assert.equal(result.completedOrders,2);assert.equal(result.changePercent,200);
  assert.equal(result.itemTrends[0].quantity,2);assert.equal(result.itemTrends[0].previousQuantity,1);
  assert.equal(result.itemTrends[0].quantityChange,1);assert.equal(result.itemTrends[0].trend,'up');
  assert.throws(()=>periodBounds('2026-09-03','2026-09-01'));assert.throws(()=>periodBounds('2026-02-30','2026-03-01'));
});
test('sales summaries distinguish demonstration orders and invalidate changed aggregates',()=>{
  const bounds=periodBounds('2026-10-01','2026-10-09');
  const order={order_number:'DEMO-ANALYTICS-001',status:'completed',payment_status:'paid',total_amount:'125.00',created_at:'2026-10-02T04:00:00.000Z',order_items:[{menu_item_id:'bangsilog',name:'Bangsilog',quantity:1,price:'125.00'}]};
  const current=aggregateSales([order],bounds);
  assert.equal(current.demoOrderCount,1);
  assert.match(salesSummary(current),/demonstration order/);
  assert.equal(sameSalesAggregates(current,JSON.parse(JSON.stringify(current))),true);
  assert.equal(sameSalesAggregates(current,{...current,revenue:0}),false);
});
test('sensitive requests escalate and unrelated queries retrieve no context',()=>{
  for(const question of ['Cancel my order','Is it safe for my diabetes?','Give me a senior discount','Offer nutritional advice','Special preparation please'])assert.equal(needsStaff(question),true,question);
  assert.equal(needsStaff('What are Chicken Sisig ingredients?'),false);
  assert.equal(lexicalKnowledge('Who won the football game?',[{content:'Chicken Sisig. Ingredients: chicken, onion.'}]).length,0);
});
test('live menu retrieval recognizes dish names and broad menu questions',()=>{
  const rows=[
    {id:'bangsilog',name:'Bangsilog',description:'Marinated milkfish with garlic rice and fried egg.',price:125,category:'Silog Meals',serving_size:'1 plate',prep_minutes:15,spice_level:'none',ingredients:['milkfish','garlic rice','egg'],allergens:['fish','egg'],available:true,stock:30},
    {id:'juice',name:'Calamansi Juice',description:'Fresh calamansi drink.',price:55,category:'Drinks',available:true,stock:30},
  ];
  const named=menuKnowledgeForQuestion('What is Bangsilog good for?',rows);
  assert.equal(named.length,1);assert.match(named[0].content,/Marinated milkfish/);
  assert.equal(menuKnowledgeForQuestion('What can I get under PHP 100?',rows).length,1);
});
test('allergy safety questions cannot be answered by absence from an allergen list',()=>{
  const adobo={id:'adobo',name:'Adobo Rice Bowl',price:95,available:true,stock:5,allergens:['soy']};
  assert.equal(isAllergySafetyQuestion('Is the Adobo Rice Bowl peanut-free?'),true);
  assert.equal(isAllergySafetyQuestion('Which dishes contain allergens?'),false);
  assert.equal(menuKnowledgeForQuestion('Is the Adobo Rice Bowl peanut-free?',[adobo])[0].id,'menu:adobo');
  assert.match(allergenReviewAnswer(adobo),/does not confirm it is free/);
  assert.match(allergenReviewAnswer(adobo),/Ask staff/);
});
test('combo answers distinguish mined trends from menu-based ideas',()=>{
  assert.equal(isComboQuestion('What combos do you recommend?'),true);
  assert.match(trendRecommendationAnswer([{antecedent_name:'Bangsilog',consequent_name:'Barako Coffee',lift:1.4,source:'historical'}]),/completed, paid order trends/);
  assert.match(trendRecommendationAnswer([{antecedent_name:'Bangsilog',consequent_name:'Barako Coffee',lift:1.4,source:'simulated'}]),/not production demand/);
  const fallback=menuPairingFallback([
    {name:'Bangsilog',category:'Silog Meals',available:true,stock:3},
    {name:'Barako Coffee',category:'Drinks',available:true,stock:3},
  ]);
  assert.match(fallback,/Bangsilog \+ Barako Coffee/);assert.match(fallback,/not mined sales trends/);
});
