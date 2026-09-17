// Real PostgreSQL/pgvector execution in an isolated in-memory database.
// Supabase's auth roles and uid() are stubbed; no remote records are changed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db=new PGlite({extensions:{vector,pgcrypto}});
const q=(sql,args)=>db.query(sql,args);
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const fails=async(sql,args,pattern)=>{await assert.rejects(()=>q(sql,args),pattern);checks++;};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
    create publication supabase_realtime;`);
  const legacy=process.argv.includes('--legacy');
  if(legacy){
    await db.exec(`create table chat_sessions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),created_at timestamptz default now());
      create table chat_messages(id uuid primary key default gen_random_uuid(),chat_session_id uuid not null references chat_sessions(id),role text not null,content text not null,created_at timestamptz default now());
      alter table chat_messages enable row level security; create policy legacy_public_history on chat_messages for select to authenticated using(true);
      insert into auth.users(id,email) values('11111111-1111-1111-1111-111111111111','legacy@test.invalid');
      insert into chat_sessions(id,user_id) values('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111');
      insert into chat_messages(chat_session_id,role,content) values('22222222-2222-2222-2222-222222222222','user','Preserved legacy question');`);
  }
  for(const file of ['dineflow-setup.sql','multi-method-payments.sql','se2-01-roles.sql','se2-02-workflows.sql','se2-04-maya.sql']){
    await db.exec(await readFile(`supabase/${file}`,'utf8'));console.log(`Applied ${file}`);
  }
  await db.exec(await readFile('supabase/se2-02-workflows.sql','utf8'));
  console.log('Upgrade is repeatable.');
  if(legacy)check((await q("select m.content,s.customer_id from chat_messages m join chat_sessions s on s.id=m.session_id where m.content='Preserved legacy question'")).rows[0]?.customer_id==='11111111-1111-1111-1111-111111111111','Legacy history preserved and owner mapped');
  const ids={};
  for(const role of ['admin','management','staff','cashier','kitchen','customer','other']){
    const id=crypto.randomUUID();ids[role]=id;
    await q("insert into auth.users(id,email) values($1,$2)",[id,`${role}@test.invalid`]);
    await q('update profiles set role=$1::user_role where id=$2',[role==='other'?'customer':role,id]);
  }
  const as=async role=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[ids[role]]);await db.exec('set role authenticated');};
  const root=async()=>{await db.exec('reset role');};
  await as('staff');
  const table=(await q("insert into dining_tables(table_number) values('T1') returning *")).rows[0];
  await as('customer');
  check((await q('select * from dining_tables')).rows.length===0,'Customers cannot enumerate table session tokens');
  check((await q('select * from resolve_table_session($1)',[table.session_token])).rows[0].table_number==='T1','QR token resolves');
  const menu=(await q('select id,price,stock from menu_items order by id limit 1')).rows[0];
  const place="select place_order('Test diner','dine-in','T1','','cash',$1::jsonb,$2::uuid) as result";
  await fails(place,[JSON.stringify([{id:menu.id,quantity:1}]),null],/Scan the table/);
  await fails(place,[JSON.stringify([{id:menu.id,quantity:0}]),table.session_token],/Quantity/);
  await fails(place,[JSON.stringify([{id:menu.id,quantity:menu.stock},{id:menu.id,quantity:menu.stock}]),table.session_token],/insufficient stock/);
  const order=(await q(place,[JSON.stringify([{id:menu.id,quantity:2,remarks:'No onions'}]),table.session_token])).rows[0].result;
  check(order.status==='confirmed','Orders start confirmed');
  check((await q('select remarks,subtotal from order_items where order_id=$1',[order.id])).rows[0].remarks==='No onions','Remarks persisted');
  check(Number((await q('select subtotal from order_items where order_id=$1',[order.id])).rows[0].subtotal)===Number(menu.price)*2,'Historical line subtotal stored');
  await fails('select update_order_status($1,$2)',[order.id,'preparing'],/not allowed/);
  await fails('select apply_order_discount($1,$2,$3)',[order.id,'senior',10],/Billing staff/);
  await as('other');check((await q('select * from orders where id=$1',[order.id])).rows.length===0,'Other customer cannot read order');
  await as('staff');
  const changed=await q("update menu_items set price=1 where id=$1 returning id",[menu.id]);check(changed.rows.length===0,'Service crew cannot alter prices');
  await fails('select update_order_status($1,$2)',[order.id,'preparing'],/not allowed/);
  await as('kitchen');
  await q('select update_order_status($1,$2)',[order.id,'preparing']);
  await q('select update_order_status($1,$2)',[order.id,'ready']);
  await fails('select update_order_status($1,$2)',[order.id,'served'],/not allowed/);
  await as('cashier');await q('select update_order_status($1,$2)',[order.id,'served']);
  await fails('select update_order_status($1,$2)',[order.id,'completed'],/not allowed/);
  await root();await q('update restaurant_settings set vat_registered=true');
  await as('cashier');
  const bill=(await q('select apply_order_discount($1,$2,$3) as bill',[order.id,'senior',Number(menu.price)*2])).rows[0].bill;
  const net=Math.round((Number(menu.price)*2/1.12)*100)/100;
  check(Number(bill.discount)===Math.round(net*20)/100,'20% applied after VAT removal');
  await fails('select record_order_payment($1,$2,$3)',[order.id,'CASH',1],/cover the bill/);
  const payment=(await q('select record_order_payment($1,$2,$3) as payment',[order.id,'CASH',500])).rows[0].payment;
  check(Number(payment.changeDue)===Math.round((500-Number(bill.total))*100)/100,'Cash change exact');
  check((await q('select status from orders where id=$1',[order.id])).rows[0].status==='completed','Served cash payment completes order');
  await fails('select record_order_payment($1,$2,$3)',[order.id,'CASH',500],/Active order|settled/);
  await as('customer');
  const hostedOrder=(await q(place,[JSON.stringify([{id:menu.id,quantity:1}]),table.session_token])).rows[0].result;
  await root();
  const reservation=(await q('select reserve_maya_checkout($1,$2) as a',[hostedOrder.id,ids.customer])).rows[0].a;
  check(reservation.isNew===true,'Hosted checkout reserved');
  check((await q('select reserve_maya_checkout($1,$2) as a',[hostedOrder.id,ids.customer])).rows[0].a.isNew===false,'Repeated create reuses active checkout');
  await q('update maya_checkouts set checkout_id=$1,state=$2 where id=$3',[crypto.randomUUID(),'pending',reservation.id]);
  await as('cashier');
  await fails('select apply_order_discount($1,$2,$3)',[hostedOrder.id,'senior',10],/active Maya/);
  await fails('select record_order_payment($1,$2,$3)',[hostedOrder.id,'CASH',500],/active Maya/);
  await root();
  await q('select settle_verified_maya($1)',[reservation.id]);
  await q('select settle_verified_maya($1)',[reservation.id]);
  check((await q('select * from payments where order_id=$1',[hostedOrder.id])).rows.length===1,'Verified hosted settlement is idempotent');
  await root();
  const session=(await q('select append_chat_exchange($1,null,$2,$3,$4,$5) as id',[ids.customer,'What is Chicken Sisig?','Approved answer','rag','[]'])).rows[0].id;
  await fails('select append_chat_exchange($1,$2,$3,$4,$5,$6)',[ids.other,session,'test','test','rag','[]'],/Conversation not found/);
  await as('customer');check((await q('select * from chat_messages where session_id=$1',[session])).rows.length===2,'Customer can read own exchange');
  await q("insert into staff_escalations(customer_id,request_type,message,chat_session_id) values($1,'discount-review','Please review my request',$2)",[ids.customer,session]);
  check((await q('select * from chat_messages where session_id=$1',[session])).rows.length===3,'Escalation recorded in transcript transactionally');
  await as('other');check((await q('select * from chat_messages where session_id=$1',[session])).rows.length===0,'Other customer cannot read exchange');
  await as('management');check((await q('select * from chat_messages')).rows.length===0,'Management cannot browse private conversations');
  await root();
  const allMenu=(await q('select id from menu_items order by id limit 2')).rows;
  const report={source:'historical',transaction_count:10,rules:[{antecedent:[allMenu[0].id],consequent:[allMenu[1].id],support:0.4,confidence:0.8,lift:1.6}]};
  await q('select publish_recommendation_batch($1)',[JSON.stringify(report)]);
  check((await q('select * from recommendation_rules')).rows.length===1,'Batch replaces illustrative legacy rules');
  await fails('select publish_recommendation_batch($1)',[JSON.stringify({...report,rules:[{...report.rules[0],consequent:[crypto.randomUUID()]}]})],/foreign key/);
  check((await q('select * from recommendation_rules')).rows.length===1,'Failed batch leaves old snapshot intact');
  await q('select publish_recommendation_batch($1)',[JSON.stringify({...report,rules:[]})]);
  check((await q('select * from recommendation_rules')).rows.length===0,'Successful empty batch removes stale rules');
  await fails('select publish_recommendation_batch($1)',[JSON.stringify({...report,source:'simulated'})],/cannot replace historical/);
  await as('customer');await fails('select publish_recommendation_batch($1)',[JSON.stringify(report)],/permission denied/);
  console.log(`PASS: ${checks} database invariants, real pgvector schema, ${legacy?'legacy chat upgrade':'clean install'} and repeatable upgrade.`);
} catch(error){console.error('DATABASE TEST FAILED:',error.stack,error.detail||'',error.where||'');process.exitCode=1;}
finally{await db.close();}
