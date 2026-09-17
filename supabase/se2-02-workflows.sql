-- DineFlow SE2 paper alignment. Apply after base setup, multi-method-payments,
-- and se2-01-roles.sql. Non-destructive, transactional, repeatable upgrade.
begin;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), name text not null unique
);
insert into public.categories(name) select distinct category from public.menu_items on conflict do nothing;
alter table public.menu_items add column if not exists category_id uuid references public.categories(id);
update public.menu_items m set category_id = c.id from public.categories c where c.name = m.category;
create or replace function public.sync_menu_category() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into categories(name) values(new.category) on conflict do nothing;
  select id into new.category_id from categories where name = new.category;
  return new;
end $$;
drop trigger if exists menu_category_sync on public.menu_items;
create trigger menu_category_sync before insert or update of category on public.menu_items for each row execute function public.sync_menu_category();
alter table public.categories enable row level security;
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to authenticated using(true);
grant select on public.categories to authenticated;

create table if not exists public.dining_tables (
  id uuid primary key default gen_random_uuid(), table_number text not null unique,
  session_token uuid not null default gen_random_uuid() unique,
  seats integer not null default 4 check(seats > 0), active boolean not null default true
);
alter table public.dining_tables enable row level security;
drop policy if exists tables_staff on public.dining_tables;
create policy tables_staff on public.dining_tables for all to authenticated
using(public.current_user_role() in ('admin','management','staff','cashier'))
with check(public.current_user_role() in ('admin','management','staff','cashier'));
grant select, insert, update on public.dining_tables to authenticated;
create or replace function public.resolve_table_session(p_token uuid) returns table(table_number text) language sql stable security definer set search_path = public as $$
  select d.table_number from dining_tables d where d.session_token = p_token and d.active and auth.uid() is not null;
$$;
revoke all on function public.resolve_table_session(uuid) from public, anon;
grant execute on function public.resolve_table_session(uuid) to authenticated;

alter table public.orders add column if not exists table_id uuid references public.dining_tables(id);
alter table public.orders drop constraint if exists orders_status_check;
update public.orders set status = 'confirmed' where status = 'pending';
alter table public.orders alter column status set default 'confirmed';
alter table public.orders add constraint orders_status_check check(status in ('confirmed','preparing','ready','served','completed','cancelled'));
drop index if exists public.orders_active_idx;
create index orders_active_idx on public.orders(created_at) where status in ('confirmed','preparing','ready','served');
alter table public.order_items add column if not exists subtotal numeric(10,2) generated always as (price * quantity) stored;
alter table public.orders add column if not exists discount_type text not null default 'none';
alter table public.orders add column if not exists discount_eligible_amount numeric(10,2) not null default 0;
alter table public.orders add column if not exists discount_amount numeric(10,2) not null default 0;
alter table public.orders add column if not exists vat_exemption numeric(10,2) not null default 0;
alter table public.orders add column if not exists discount_approved_by uuid references auth.users(id);
alter table public.restaurant_settings add column if not exists vat_registered boolean not null default false;

-- Roles are enforced here, independent of navigation visibility.
drop policy if exists "Staff manage menu" on public.menu_items;
create policy "Staff manage menu" on public.menu_items for all to authenticated
using(public.current_user_role() in ('admin','management')) with check(public.current_user_role() in ('admin','management'));
drop policy if exists "Users read permitted orders" on public.orders;
create policy "Users read permitted orders" on public.orders for select to authenticated
using(customer_id = auth.uid() or public.current_user_role() in ('admin','management','staff','cashier','kitchen'));
drop policy if exists "Users read permitted escalations" on public.staff_escalations;
create policy "Users read permitted escalations" on public.staff_escalations for select to authenticated
using(customer_id = auth.uid() or public.current_user_role() in ('admin','management','staff','cashier'));
drop policy if exists "Staff resolve escalations" on public.staff_escalations;
create policy "Staff resolve escalations" on public.staff_escalations for update to authenticated
using(public.current_user_role() in ('admin','management','staff','cashier')) with check(public.current_user_role() in ('admin','management','staff','cashier'));
drop policy if exists admin_profiles_read on public.profiles;
create policy admin_profiles_read on public.profiles for select to authenticated using(public.current_user_role() = 'admin');
create or replace function public.assign_user_role(p_user_id uuid, p_role text) returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_user_role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  if p_role not in ('admin','management','staff','cashier','kitchen','customer') then raise exception 'Invalid role'; end if;
  if p_user_id = auth.uid() then raise exception 'Ask another administrator to change your own role'; end if;
  update profiles set role = p_role::public.user_role where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
end $$;
revoke all on function public.assign_user_role(uuid,text) from public, anon;
grant execute on function public.assign_user_role(uuid,text) to authenticated;

-- Validate stock using aggregated quantities, lock menu rows in ID order, and
-- preserve the snapshot price/remarks even when a menu is subsequently edited.
drop function if exists public.place_order(text,text,text,text,text,jsonb);
create or replace function public.place_order(p_customer_name text,p_order_type text,p_table_number text,p_notes text,p_payment_method text,p_items jsonb,p_table_session_token uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid(); v_number text := 'DF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  v_item jsonb; v_row record; v_menu menu_items%rowtype; v_total numeric(10,2) := 0; v_table dining_tables%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_customer_name),'') is null or length(p_customer_name) > 120 then raise exception 'Customer name is required (up to 120 characters)'; end if;
  if p_order_type is null or p_order_type not in ('dine-in','takeout') then raise exception 'Invalid order type'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Order must contain 1 to 100 lines'; end if;
  if p_order_type = 'dine-in' then
    if p_table_session_token is not null then
      select * into v_table from dining_tables where session_token = p_table_session_token and active for update;
    elsif public.current_user_role() in ('admin','management','staff','cashier') then
      select * into v_table from dining_tables where table_number = trim(p_table_number) and active for update;
    else raise exception 'Scan the table QR code to start a dine-in order'; end if;
    if v_table.id is null then raise exception 'Table session is unavailable. Ask staff for a current QR code'; end if;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^[1-9][0-9]{0,2}$' then raise exception 'Quantity must be a whole number from 1 to 999'; end if;
    if length(coalesce(v_item->>'remarks','')) > 500 then raise exception 'Remarks are too long'; end if;
  end loop;
  for v_row in select (value->>'id')::uuid as id, sum((value->>'quantity')::integer) as quantity from jsonb_array_elements(p_items) group by 1 order by 1 loop
    select * into v_menu from menu_items where id = v_row.id for update;
    if not found or not v_menu.available or v_menu.stock < v_row.quantity then raise exception 'A selected item is unavailable or has insufficient stock'; end if;
    v_total := v_total + v_menu.price * v_row.quantity;
  end loop;
  insert into orders(id,order_number,customer_id,customer_name,order_type,table_number,table_id,notes,subtotal,total_amount,payment_method,cashier_id)
  values(v_id,v_number,auth.uid(),trim(p_customer_name),p_order_type,v_table.table_number,v_table.id,coalesce(p_notes,''),v_total,v_total,'pending',
    case when public.current_user_role() in ('admin','management','staff','cashier') then auth.uid() else null end);
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_menu from menu_items where id = (v_item->>'id')::uuid;
    insert into order_items(order_id,menu_item_id,name,name_snapshot,price,unit_price,quantity,remarks,image_url)
    values(v_id,v_menu.id,v_menu.name,v_menu.name,v_menu.price,v_menu.price,(v_item->>'quantity')::integer,coalesce(v_item->>'remarks',''),v_menu.image_url);
    update menu_items set stock = stock - (v_item->>'quantity')::integer, available = stock - (v_item->>'quantity')::integer > 0 where id = v_menu.id;
  end loop;
  return jsonb_build_object('id',v_id,'orderNumber',v_number,'totalAmount',v_total,'status','confirmed');
end $$;
revoke all on function public.place_order(text,text,text,text,text,jsonb,uuid) from public, anon;
grant execute on function public.place_order(text,text,text,text,text,jsonb,uuid) to authenticated;

create or replace function public.update_order_status(p_order_id uuid,p_status text) returns void language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype; v_role text := public.current_user_role();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if p_status = 'preparing' and v_order.status = 'confirmed' and v_role in ('admin','management','kitchen') then null;
  elsif p_status = 'ready' and v_order.status = 'preparing' and v_role in ('admin','management','kitchen') then null;
  elsif p_status = 'served' and v_order.status = 'ready' and v_role in ('admin','management','staff','cashier') then null;
  elsif p_status = 'completed' and v_order.status = 'served' and v_order.payment_status = 'paid' and v_role in ('admin','management','staff','cashier') then null;
  elsif p_status = 'cancelled' and v_order.status in ('confirmed','preparing') and v_order.payment_status = 'unpaid' and v_role in ('admin','management','staff') then
    update menu_items m set stock = m.stock + q.quantity, available = case when m.stock = 0 then true else m.available end from (select menu_item_id,sum(quantity) as quantity from order_items where order_id = p_order_id group by menu_item_id) q where m.id = q.menu_item_id;
  else raise exception 'This transition is not allowed. Completion requires a served, paid order'; end if;
  update orders set status = p_status where id = p_order_id;
end $$;

create or replace function public.apply_order_discount(p_order_id uuid,p_type text,p_eligible_amount numeric) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype; v_vat boolean; v_net numeric(10,2); v_discount numeric(10,2); v_exemption numeric(10,2);
begin
  if coalesce(public.current_user_role(),'') not in ('admin','management','staff','cashier') then raise exception 'Billing staff required'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.status in ('cancelled','completed') or v_order.payment_status <> 'unpaid' then raise exception 'Only an active unpaid bill can be discounted'; end if;
  if p_type is null or p_type not in ('none','senior','pwd') or p_eligible_amount is null or p_eligible_amount < 0 or p_eligible_amount > v_order.subtotal then raise exception 'Invalid discount or eligible amount'; end if;
  if p_type = 'none' then p_eligible_amount := 0; end if;
  select vat_registered into v_vat from restaurant_settings where id;
  v_net := round(p_eligible_amount / case when v_vat then 1.12 else 1 end,2);
  v_exemption := p_eligible_amount - v_net;
  v_discount := round(v_net * 0.20,2);
  update orders set discount_type = p_type,discount_eligible_amount = p_eligible_amount,discount_amount = v_discount,vat_exemption = v_exemption,
    discount_approved_by = auth.uid(),total_amount = subtotal + service_fee - v_exemption - v_discount where id = p_order_id;
  return jsonb_build_object('discount',v_discount,'vatExemption',v_exemption,'total',v_order.subtotal + v_order.service_fee - v_exemption - v_discount);
end $$;
revoke all on function public.apply_order_discount(uuid,text,numeric) from public, anon;
grant execute on function public.apply_order_discount(uuid,text,numeric) to authenticated;

create or replace function public.record_order_payment(p_order_id uuid,p_method text,p_amount numeric,p_card_last4 text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype; v_id uuid := gen_random_uuid(); v_change numeric(10,2);
begin
  if coalesce(public.current_user_role(),'') not in ('admin','management','staff','cashier') then raise exception 'Billing staff required'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found or v_order.status in ('cancelled','completed') then raise exception 'Active order required'; end if;
  if v_order.payment_status <> 'unpaid' then raise exception 'Order is already settled'; end if;
  if p_amount is null or p_amount < v_order.total_amount or p_amount > 99999999 then raise exception 'Amount tendered must cover the bill'; end if;
  if p_method is null or upper(p_method) <> 'CASH' or p_card_last4 is not null then raise exception 'Cash payment required'; end if;
  v_change := round(p_amount,2) - v_order.total_amount;
  insert into payments(id,order_id,method,amount,amount_tendered,change_due,status) values(v_id,p_order_id,'CASH',v_order.total_amount,p_amount,v_change,'PAID');
  update orders set payment_status = 'paid',payment_method = 'CASH',cashier_id = auth.uid(),status = case when status = 'served' then 'completed' else status end where id = p_order_id;
  return jsonb_build_object('id',v_id,'amount',v_order.total_amount,'amountTendered',p_amount,'changeDue',v_change);
end $$;

-- Guard existing online settlement functions too; cancelled orders cannot be paid.
create or replace function public.guard_payment_order() returns trigger language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders where id = new.order_id for update;
  if v_order.status = 'cancelled' then raise exception 'Cancelled orders cannot be paid'; end if;
  return new;
end $$;
drop trigger if exists payment_order_guard on public.payments;
create trigger payment_order_guard before insert on public.payments for each row execute function public.guard_payment_order();
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check(method in ('CASH','CARD','MAYA_SANDBOX','GCASH','BANK','QR'));

-- Persistent, owner-private assistant transcripts (Appendix C).
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Upgrade the proposal's earlier chat naming without dropping its records.
alter table public.chat_sessions add column if not exists customer_id uuid references auth.users(id) on delete cascade;
alter table public.chat_sessions add column if not exists created_at timestamptz not null default now();
alter table public.chat_sessions alter column id set default gen_random_uuid();
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='chat_sessions' and column_name='user_id') then
    execute 'update public.chat_sessions set customer_id=user_id where customer_id is null';
    execute 'alter table public.chat_sessions alter column user_id drop not null';
  end if;
end $$;
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check(role in ('user','assistant')), content text not null,
  mode text, sources jsonb not null default '[]', created_at timestamptz not null default now()
);
alter table public.chat_messages add column if not exists session_id uuid references public.chat_sessions(id) on delete cascade;
alter table public.chat_messages add column if not exists mode text;
alter table public.chat_messages add column if not exists sources jsonb not null default '[]';
alter table public.chat_messages add column if not exists created_at timestamptz not null default now();
alter table public.chat_messages alter column id set default gen_random_uuid();
do $$ declare policy_row record; begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='chat_messages' and column_name='chat_session_id') then
    execute 'update public.chat_messages set session_id=chat_session_id where session_id is null';
    execute 'alter table public.chat_messages alter column chat_session_id drop not null';
  end if;
  -- Replace earlier policies rather than OR-ing potentially broader permissions.
  for policy_row in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('chat_sessions','chat_messages') loop
    execute format('drop policy %I on public.%I',policy_row.policyname,policy_row.tablename);
  end loop;
end $$;
create index if not exists chat_sessions_owner_idx on public.chat_sessions(customer_id,created_at);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id,created_at);
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
drop policy if exists own_sessions on public.chat_sessions;
create policy own_sessions on public.chat_sessions for select to authenticated using(customer_id = auth.uid());
drop policy if exists own_messages on public.chat_messages;
create policy own_messages on public.chat_messages for select to authenticated using(exists(select 1 from chat_sessions s where s.id = session_id and s.customer_id = auth.uid()));
grant select on public.chat_sessions,public.chat_messages to authenticated;
revoke insert,update,delete on public.chat_sessions,public.chat_messages from anon,authenticated;
create or replace function public.append_chat_exchange(p_customer_id uuid,p_session_id uuid,p_question text,p_answer text,p_mode text,p_sources jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_session_id;
begin
  if v_id is null then insert into chat_sessions(customer_id) values(p_customer_id) returning id into v_id;
  elsif not exists(select 1 from chat_sessions where id = v_id and customer_id = p_customer_id) then raise exception 'Conversation not found'; end if;
  insert into chat_messages(session_id,role,content,mode,sources,created_at) values
    (v_id,'user',p_question,null,'[]',clock_timestamp()),(v_id,'assistant',p_answer,p_mode,coalesce(p_sources,'[]'),clock_timestamp());
  return v_id;
end $$;
revoke all on function public.append_chat_exchange(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.append_chat_exchange(uuid,uuid,text,text,text,jsonb) to service_role;
alter table public.staff_escalations add column if not exists chat_session_id uuid references public.chat_sessions(id);
drop policy if exists "Users create escalations" on public.staff_escalations;
create policy "Users create escalations" on public.staff_escalations for insert to authenticated with check(
  customer_id = auth.uid() and (order_id is null or exists(select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()))
  and (chat_session_id is null or exists(select 1 from chat_sessions s where s.id = chat_session_id and s.customer_id = auth.uid())));
create or replace function public.record_chat_escalation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.chat_session_id is not null then
    insert into chat_messages(session_id,role,content,mode)
    values(new.chat_session_id,'assistant','Your request was forwarded to staff for review. Reference: ' || new.id::text,'staff-escalation');
  end if;
  return new;
end $$;
drop trigger if exists chat_escalation_transcript on public.staff_escalations;
create trigger chat_escalation_transcript after insert on public.staff_escalations for each row execute function public.record_chat_escalation();

-- Occupancy derives from active bills; table edits must not invalidate an active session.
create or replace function public.guard_active_table() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.session_token is distinct from old.session_token or new.active is distinct from old.active or new.table_number is distinct from old.table_number)
     and exists(select 1 from orders where table_id=old.id and status not in ('completed','cancelled')) then
    raise exception 'Complete active bills before changing this table session';
  end if;
  return new;
end $$;
drop trigger if exists active_table_guard on public.dining_tables;
create trigger active_table_guard before update on public.dining_tables for each row execute function public.guard_active_table();

-- Each published batch replaces the active rule snapshot inside one transaction.
create table if not exists public.recommendation_runs (
  id uuid primary key default gen_random_uuid(), source text not null check(source in ('simulated','historical')),
  transaction_count integer not null check(transaction_count >= 5), rule_count integer not null,
  report jsonb not null, created_at timestamptz not null default now()
);
alter table public.recommendation_runs enable row level security;
drop policy if exists management_runs on public.recommendation_runs;
create policy management_runs on public.recommendation_runs for select to authenticated using(public.current_user_role() in ('admin','management'));
grant select on public.recommendation_runs to authenticated;
alter table public.recommendation_rules add column if not exists run_id uuid references public.recommendation_runs(id);
alter table public.recommendation_rules add column if not exists antecedent_ids uuid[] not null default '{}';
alter table public.recommendation_rules add column if not exists consequent_ids uuid[] not null default '{}';
create table if not exists public.recommendation_rule_items (
  rule_id uuid not null references public.recommendation_rules(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  side text not null check(side in ('antecedent','consequent')), primary key(rule_id,menu_item_id,side)
);
alter table public.recommendation_rule_items enable row level security;
-- Customers read only ranked recommendations via the server, never the rule store.
drop policy if exists "Recommendations are readable" on public.recommendation_rules;
drop policy if exists "Admins manage recommendations" on public.recommendation_rules;
drop policy if exists management_rules on public.recommendation_rules;
create policy management_rules on public.recommendation_rules for select to authenticated using(public.current_user_role() in ('admin','management'));
revoke insert,update,delete on public.recommendation_rules from authenticated;
create or replace function public.publish_recommendation_batch(p_report jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare v_run uuid; v_rule uuid; r jsonb; a uuid[]; c uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('dineflow:mining'));
  if p_report->>'source' not in ('simulated','historical') or (p_report->>'transaction_count')::integer < 5 or jsonb_typeof(p_report->'rules') <> 'array' then raise exception 'Invalid batch'; end if;
  if p_report->>'source' = 'simulated' and exists(select 1 from recommendation_runs where source = 'historical') then raise exception 'Simulated rules cannot replace historical mining'; end if;
  insert into recommendation_runs(source,transaction_count,rule_count,report) values(p_report->>'source',(p_report->>'transaction_count')::integer,jsonb_array_length(p_report->'rules'),p_report) returning id into v_run;
  delete from recommendation_rules;
  for r in select value from jsonb_array_elements(p_report->'rules') loop
    a := array(select value::uuid from jsonb_array_elements_text(r->'antecedent'));
    c := array(select value::uuid from jsonb_array_elements_text(r->'consequent'));
    if cardinality(a) = 0 or cardinality(c) = 0 or a && c or (r->>'lift')::numeric <= 1 then raise exception 'Invalid rule'; end if;
    insert into recommendation_rules(antecedent_name,consequent_name,antecedent,consequent,antecedent_ids,consequent_ids,support,confidence,lift,source,run_id)
    values(array_to_string(a,' + '),array_to_string(c,' + '),array(select name from menu_items where id = any(a) order by id),array(select name from menu_items where id = any(c) order by id),a,c,(r->>'support')::numeric,(r->>'confidence')::numeric,(r->>'lift')::numeric,p_report->>'source',v_run) returning id into v_rule;
    insert into recommendation_rule_items select v_rule,unnest(a),'antecedent';
    insert into recommendation_rule_items select v_rule,unnest(c),'consequent';
  end loop;
  return v_run;
end $$;
revoke all on function public.publish_recommendation_batch(jsonb) from public,anon,authenticated;
grant execute on function public.publish_recommendation_batch(jsonb) to service_role;

create table if not exists public.sales_insights (
  id uuid primary key default gen_random_uuid(), period_start date not null, period_end date not null,
  summary text not null, mode text not null, aggregates jsonb not null, generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(), unique(period_start,period_end)
);
alter table public.sales_insights enable row level security;
drop policy if exists management_insights on public.sales_insights;
create policy management_insights on public.sales_insights for select to authenticated using(public.current_user_role() in ('admin','management'));
grant select on public.sales_insights to authenticated;

-- Approved knowledge is refreshed whenever menu/settings change. Changed text
-- invalidates the embedding; the next offline indexing batch rebuilds it.
create or replace function public.refresh_approved_knowledge() returns trigger language plpgsql security definer set search_path = public as $$
declare v_key text; v_content text; v_metadata jsonb;
begin
  if tg_table_name = 'menu_items' then
    if tg_op = 'DELETE' then delete from restaurant_knowledge where source_key = 'menu:' || old.id::text; return old; end if;
    v_key := 'menu:' || new.id::text;
    v_content := concat(new.name,'. ',new.description,' Price: PHP ',new.price,'. Category: ',new.category,'. Serving: ',new.serving_size,'. Preparation: ',new.prep_minutes,' minutes. Spice: ',new.spice_level,'. Ingredients: ',array_to_string(new.ingredients,', '),'. Allergens: ',array_to_string(new.allergens,', '),'. Available: ',new.available and new.stock > 0);
    v_metadata := jsonb_build_object('type','menu','menu_item_id',new.id);
  else
    v_key := 'settings'; v_content := concat('Hours: ',new.operating_hours,'. Payment methods: ',array_to_string(new.payment_methods,', '),'. FAQ: ',new.faq::text); v_metadata := '{"type":"restaurant_settings"}';
  end if;
  insert into restaurant_knowledge(source_key,content,metadata) values(v_key,v_content,v_metadata)
  on conflict(source_key) do update set content = excluded.content,metadata = excluded.metadata,
    embedding = case when restaurant_knowledge.content is distinct from excluded.content then null else restaurant_knowledge.embedding end,updated_at = now();
  return new;
end $$;
drop trigger if exists menu_knowledge_sync on public.menu_items;
create trigger menu_knowledge_sync after insert or update or delete on public.menu_items for each row execute function public.refresh_approved_knowledge();
drop trigger if exists settings_knowledge_sync on public.restaurant_settings;
create trigger settings_knowledge_sync after insert or update on public.restaurant_settings for each row execute function public.refresh_approved_knowledge();
update public.menu_items set name = name;
update public.restaurant_settings set restaurant_name = restaurant_name;
revoke execute on function public.match_restaurant_knowledge(extensions.vector,integer) from authenticated,anon;
grant execute on function public.match_restaurant_knowledge(extensions.vector,integer) to service_role;

-- Supabase schema reload and explicit grants (also work with strict defaults).
grant all on public.recommendation_runs,public.recommendation_rule_items,public.chat_sessions,public.chat_messages,public.sales_insights,public.dining_tables,public.categories to service_role;
notify pgrst, 'reload schema';
do $$ begin
  alter publication supabase_realtime add table public.staff_escalations;
exception when duplicate_object then null;
end $$;
commit;
