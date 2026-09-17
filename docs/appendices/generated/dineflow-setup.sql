-- DineFlow operational schema and seed data
-- Run this entire file once in the Supabase SQL Editor.
-- It is safe to run again: tables, policies, and menu rows are idempotent.

create schema if not exists extensions;
create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role' and typnamespace = 'public'::regnamespace) then
    create type public.user_role as enum ('admin', 'kitchen', 'staff', 'cashier', 'customer');
  end if;
end $$;

alter type public.user_role add value if not exists 'admin';
alter type public.user_role add value if not exists 'kitchen';
alter type public.user_role add value if not exists 'staff';
alter type public.user_role add value if not exists 'cashier';
alter type public.user_role add value if not exists 'customer';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'customer'::public.user_role,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Customer'), '@', 1)),
    'customer'::public.user_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  category text not null,
  price numeric(10,2) not null check (price >= 0),
  image_url text not null,
  stock integer not null default 0 check (stock >= 0),
  available boolean not null default true,
  ingredients text[] not null default '{}',
  allergens text[] not null default '{}',
  spice_level text not null default 'none' check (spice_level in ('none', 'mild', 'medium', 'hot')),
  serving_size text not null default '1 serving',
  prep_minutes integer not null default 15 check (prep_minutes > 0),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade the proposal's earlier menu schema without deleting its rows.
alter table public.menu_items add column if not exists category text not null default 'Sides';
alter table public.menu_items add column if not exists image_url text not null default '';
alter table public.menu_items add column if not exists stock integer not null default 30;
alter table public.menu_items add column if not exists available boolean not null default true;
alter table public.menu_items add column if not exists ingredients text[] not null default '{}';
alter table public.menu_items add column if not exists allergens text[] not null default '{}';
alter table public.menu_items add column if not exists spice_level text not null default 'none';
alter table public.menu_items add column if not exists serving_size text not null default '1 serving';
alter table public.menu_items add column if not exists prep_minutes integer not null default 15;
alter table public.menu_items add column if not exists featured boolean not null default false;
alter table public.menu_items add column if not exists updated_at timestamptz not null default now();

-- The original proposal stored ingredients and allergens as comma-separated
-- text. Normalize them to arrays so menu editing, allergen display, and RAG
-- indexing all use one consistent representation.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'menu_items'
      and column_name = 'ingredients' and data_type <> 'ARRAY'
  ) then
    alter table public.menu_items alter column ingredients drop default;
    execute $convert$
      alter table public.menu_items alter column ingredients type text[]
      using case
        when ingredients is null or btrim(ingredients) = '' then '{}'::text[]
        else string_to_array(ingredients, ',')
      end
    $convert$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'menu_items'
      and column_name = 'allergens' and data_type <> 'ARRAY'
  ) then
    alter table public.menu_items alter column allergens drop default;
    execute $convert$
      alter table public.menu_items alter column allergens type text[]
      using case
        when allergens is null or btrim(allergens) = '' then '{}'::text[]
        else string_to_array(allergens, ',')
      end
    $convert$;
  end if;
end $$;

update public.menu_items
set ingredients = array(
      select btrim(value) from unnest(coalesce(ingredients, '{}'::text[])) as value
      where btrim(value) <> ''
    ),
    allergens = array(
      select btrim(value) from unnest(coalesce(allergens, '{}'::text[])) as value
      where btrim(value) <> ''
    );
alter table public.menu_items alter column ingredients set default '{}';
alter table public.menu_items alter column ingredients set not null;
alter table public.menu_items alter column allergens set default '{}';
alter table public.menu_items alter column allergens set not null;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'menu_items' and column_name = 'category_id')
     and to_regclass('public.categories') is not null then
    execute 'update public.menu_items m set category = c.name from public.categories c where m.category_id = c.id';
    execute 'alter table public.menu_items alter column category_id drop not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'menu_items' and column_name = 'is_available') then
    execute 'update public.menu_items set available = is_available';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'menu_items' and column_name = 'preparation_minutes') then
    execute 'update public.menu_items set prep_minutes = preparation_minutes where preparation_minutes is not null';
  end if;
end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  order_type text not null check (order_type in ('dine-in', 'takeout')),
  table_number text,
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  subtotal numeric(10,2) not null default 0,
  service_fee numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  payment_method text not null default 'cash',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  cashier_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists customer_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists customer_name text not null default 'Guest';
alter table public.orders add column if not exists order_type text not null default 'takeout';
alter table public.orders add column if not exists table_number text;
alter table public.orders add column if not exists notes text not null default '';
alter table public.orders add column if not exists status text not null default 'pending';
alter table public.orders add column if not exists subtotal numeric(10,2) not null default 0;
alter table public.orders add column if not exists service_fee numeric(10,2) not null default 0;
alter table public.orders add column if not exists total_amount numeric(10,2) not null default 0;
alter table public.orders add column if not exists payment_method text not null default 'cash';
alter table public.orders add column if not exists payment_status text not null default 'unpaid';
alter table public.orders add column if not exists cashier_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists updated_at timestamptz not null default now();
create unique index if not exists orders_order_number_key on public.orders(order_number) where order_number is not null;

-- Remove policies and CHECK constraints that can retain dependencies on the
-- proposal's legacy enums while the columns are converted to text. Canonical
-- RLS policies and text checks are restored later in this script.
-- The legacy kitchen index has an enum-typed WHERE predicate, so PostgreSQL
-- cannot rebuild it implicitly as part of ALTER COLUMN TYPE.
drop index if exists public.orders_active_idx;
drop index if exists public.orders_status_idx;

do $$
declare
  v_column text;
  v_dependency record;
begin
  for v_dependency in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'orders'
  loop
    execute format('drop policy %I on public.orders', v_dependency.policyname);
  end loop;

  foreach v_column in array array['order_type', 'status', 'payment_method', 'payment_status']
  loop
    for v_dependency in
      select distinct constraint_row.conname
      from pg_constraint constraint_row
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attnum = any(constraint_row.conkey)
      where constraint_row.conrelid = 'public.orders'::regclass
        and constraint_row.contype = 'c'
        and attribute_row.attname = v_column
    loop
      execute format('alter table public.orders drop constraint %I', v_dependency.conname);
    end loop;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders'
        and column_name = v_column and data_type = 'USER-DEFINED'
    ) then
      execute format('alter table public.orders alter column %I drop default', v_column);
      execute format('alter table public.orders alter column %I type text using %I::text', v_column, v_column);
    end if;
  end loop;
end $$;

-- Translate the proposal's legacy enum labels to the application vocabulary.
update public.orders
set order_type = case upper(replace(replace(order_type, '-', '_'), ' ', '_'))
    when 'DINE_IN' then 'dine-in'
    when 'PICKUP' then 'takeout'
    when 'TAKE_OUT' then 'takeout'
    when 'TAKEOUT' then 'takeout'
    else 'takeout'
  end,
  status = case upper(replace(replace(status, '-', '_'), ' ', '_'))
    when 'NEW' then 'pending'
    when 'RECEIVED' then 'pending'
    when 'PENDING' then 'pending'
    when 'IN_PROGRESS' then 'preparing'
    when 'PREPARING' then 'preparing'
    when 'READY' then 'ready'
    when 'COMPLETED' then 'completed'
    when 'DELIVERED' then 'completed'
    when 'SERVED' then 'completed'
    when 'CANCELLED' then 'cancelled'
    when 'CANCELED' then 'cancelled'
    else 'pending'
  end,
  payment_status = case upper(replace(replace(payment_status, '-', '_'), ' ', '_'))
    when 'PAID' then 'paid'
    when 'REFUNDED' then 'refunded'
    else 'unpaid'
  end;

alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_order_type_check
  check (order_type in ('dine-in', 'takeout'));
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'preparing', 'ready', 'completed', 'cancelled'));
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'refunded'));

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_active_idx on public.orders(created_at)
  where status in ('pending', 'preparing', 'ready');

alter table public.orders alter column order_type set default 'takeout';
alter table public.orders alter column status set default 'pending';
alter table public.orders alter column payment_method set default 'cash';
alter table public.orders alter column payment_status set default 'unpaid';

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  quantity integer not null check (quantity > 0),
  remarks text not null default '',
  image_url text not null default ''
);

alter table public.order_items add column if not exists name text not null default 'Menu item';
alter table public.order_items add column if not exists price numeric(10,2) not null default 0;
alter table public.order_items add column if not exists quantity integer not null default 1;
alter table public.order_items add column if not exists remarks text not null default '';
alter table public.order_items add column if not exists image_url text not null default '';
-- Retain and populate the proposal schema's historical snapshot columns so
-- its existing total-recalculation trigger and NOT NULL rules remain valid.
alter table public.order_items add column if not exists name_snapshot text;
alter table public.order_items add column if not exists unit_price numeric(10,2);
alter table public.order_items alter column name_snapshot set default 'Menu item';
alter table public.order_items alter column unit_price set default 0;
update public.order_items
set name = case when name = 'Menu item' and name_snapshot is not null then name_snapshot else name end,
    price = case when price = 0 and unit_price is not null then unit_price else price end;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null,
  amount numeric(10,2) not null check (amount >= 0),
  card_last4 text,
  status text not null default 'PAID',
  paid_at timestamptz not null default now()
);

alter table public.payments add column if not exists method text not null default 'cash';
alter table public.payments add column if not exists amount numeric(10,2) not null default 0;
alter table public.payments add column if not exists card_last4 text;
alter table public.payments add column if not exists status text not null default 'PAID';
alter table public.payments add column if not exists paid_at timestamptz not null default now();
-- Compatibility with the proposal's original payment ledger.
alter table public.payments add column if not exists amount_tendered numeric(10,2) not null default 0;
alter table public.payments add column if not exists change_due numeric(10,2) not null default 0;
update public.payments
set amount = amount_tendered
where amount = 0 and amount_tendered > 0;

do $$
declare
  v_column text;
  v_dependency record;
begin
  for v_dependency in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'payments'
  loop
    execute format('drop policy %I on public.payments', v_dependency.policyname);
  end loop;

  foreach v_column in array array['method', 'status']
  loop
    for v_dependency in
      select distinct constraint_row.conname
      from pg_constraint constraint_row
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attnum = any(constraint_row.conkey)
      where constraint_row.conrelid = 'public.payments'::regclass
        and constraint_row.contype = 'c'
        and attribute_row.attname = v_column
    loop
      execute format('alter table public.payments drop constraint %I', v_dependency.conname);
    end loop;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payments'
        and column_name = v_column and data_type = 'USER-DEFINED'
    ) then
      execute format('alter table public.payments alter column %I drop default', v_column);
      execute format('alter table public.payments alter column %I type text using %I::text', v_column, v_column);
    end if;
  end loop;
end $$;

update public.payments
set method = case upper(replace(replace(method, '-', '_'), ' ', '_'))
    when 'MAYA' then 'MAYA_SANDBOX'
    when 'ONLINE' then 'MAYA_SANDBOX'
    when 'MAYA_SANDBOX' then 'MAYA_SANDBOX'
    when 'CARD' then 'CARD'
    else 'CASH'
  end,
  status = case upper(status)
    when 'PAID' then 'PAID'
    when 'REFUNDED' then 'REFUNDED'
    when 'FAILED' then 'FAILED'
    else 'PENDING'
  end;

alter table public.payments alter column method set default 'CASH';
alter table public.payments alter column status set default 'PENDING';
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_method_check
  check (method in ('CASH', 'CARD', 'MAYA_SANDBOX'));
alter table public.payments add constraint payments_status_check
  check (status in ('PENDING', 'PAID', 'FAILED', 'REFUNDED'));

create table if not exists public.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  antecedent_name text not null,
  consequent_name text not null,
  support numeric(7,6) not null check (support between 0 and 1),
  confidence numeric(7,6) not null check (confidence between 0 and 1),
  lift numeric(10,4) not null check (lift >= 0),
  source text not null default 'simulated' check (source in ('simulated', 'historical')),
  updated_at timestamptz not null default now(),
  unique (antecedent_name, consequent_name)
);

alter table public.recommendation_rules add column if not exists antecedent_name text;
alter table public.recommendation_rules add column if not exists consequent_name text;
alter table public.recommendation_rules add column if not exists support numeric(7,6) not null default 0;
alter table public.recommendation_rules add column if not exists confidence numeric(7,6) not null default 0;
alter table public.recommendation_rules add column if not exists lift numeric(10,4) not null default 0;
alter table public.recommendation_rules add column if not exists source text not null default 'simulated';
alter table public.recommendation_rules add column if not exists updated_at timestamptz not null default now();
-- The earlier proposal schema stored both sides as arrays. Defaults allow the
-- new named-rule representation to coexist without deleting historical data.
alter table public.recommendation_rules add column if not exists antecedent text[] not null default '{}';
alter table public.recommendation_rules add column if not exists consequent text[] not null default '{}';
alter table public.recommendation_rules alter column antecedent set default '{}';
alter table public.recommendation_rules alter column consequent set default '{}';
create unique index if not exists recommendation_rule_names_key
  on public.recommendation_rules(antecedent_name, consequent_name);

create table if not exists public.staff_escalations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  request_type text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  resolution text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_settings (
  id boolean primary key default true check (id),
  restaurant_name text not null default 'DineFlow OS',
  operating_hours text not null default 'Monday–Sunday, 8:00 AM–9:00 PM',
  payment_methods text[] not null default array['Cash', 'Maya sandbox'],
  faq jsonb not null default '{"service":"Dine-in and takeout are available.","eta":"Most orders are prepared in 15–25 minutes."}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_knowledge (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count integer not null default 0
);
alter table public.restaurant_knowledge add column if not exists source_key text;
update public.restaurant_knowledge set source_key = 'legacy:' || id::text where source_key is null;
alter table public.restaurant_knowledge alter column source_key set not null;
create unique index if not exists restaurant_knowledge_source_key_key on public.restaurant_knowledge(source_key);

insert into public.restaurant_settings (id) values (true) on conflict (id) do nothing;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role::text from public.profiles where id = auth.uid()), 'customer');
$$;

grant execute on function public.current_user_role() to authenticated;

alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.recommendation_rules enable row level security;
alter table public.staff_escalations enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.restaurant_knowledge enable row level security;
alter table public.assistant_rate_limits enable row level security;

drop policy if exists "Menu is readable by signed-in users" on public.menu_items;
create policy "Menu is readable by signed-in users" on public.menu_items
  for select to authenticated using (true);
drop policy if exists "Staff manage menu" on public.menu_items;
create policy "Staff manage menu" on public.menu_items
  for all to authenticated
  using (public.current_user_role() in ('admin', 'staff', 'cashier'))
  with check (public.current_user_role() in ('admin', 'staff', 'cashier'));

drop policy if exists "Users read permitted orders" on public.orders;
create policy "Users read permitted orders" on public.orders
  for select to authenticated using (
    customer_id = auth.uid() or public.current_user_role() in ('admin', 'staff', 'cashier', 'kitchen')
  );
drop policy if exists "Users create orders" on public.orders;
drop policy if exists "Staff update orders" on public.orders;

drop policy if exists "Users read permitted order items" on public.order_items;
create policy "Users read permitted order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id)
  );
drop policy if exists "Users create own order items" on public.order_items;

drop policy if exists "Users read permitted payments" on public.payments;
create policy "Users read permitted payments" on public.payments
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id)
  );
drop policy if exists "Users record permitted payments" on public.payments;

drop policy if exists "Recommendations are readable" on public.recommendation_rules;
create policy "Recommendations are readable" on public.recommendation_rules for select to authenticated using (true);
drop policy if exists "Admins manage recommendations" on public.recommendation_rules;
create policy "Admins manage recommendations" on public.recommendation_rules for all to authenticated
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

drop policy if exists "Users create escalations" on public.staff_escalations;
create policy "Users create escalations" on public.staff_escalations for insert to authenticated
  with check (customer_id = auth.uid() or public.current_user_role() in ('admin', 'staff', 'cashier'));
drop policy if exists "Users read permitted escalations" on public.staff_escalations;
create policy "Users read permitted escalations" on public.staff_escalations for select to authenticated
  using (customer_id = auth.uid() or public.current_user_role() in ('admin', 'staff', 'cashier'));
drop policy if exists "Staff resolve escalations" on public.staff_escalations;
create policy "Staff resolve escalations" on public.staff_escalations for update to authenticated
  using (public.current_user_role() in ('admin', 'staff', 'cashier'))
  with check (public.current_user_role() in ('admin', 'staff', 'cashier'));

drop policy if exists "Settings are readable" on public.restaurant_settings;
create policy "Settings are readable" on public.restaurant_settings for select to authenticated using (true);
drop policy if exists "Admins manage settings" on public.restaurant_settings;
create policy "Admins manage settings" on public.restaurant_settings for all to authenticated
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

drop policy if exists "Admins manage knowledge" on public.restaurant_knowledge;
create policy "Admins manage knowledge" on public.restaurant_knowledge for all to authenticated
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create or replace function public.match_restaurant_knowledge(
  query_embedding extensions.vector(1536),
  match_count integer default 6
)
returns table (id uuid, content text, metadata jsonb, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select knowledge.id, knowledge.content, knowledge.metadata,
    1 - (knowledge.embedding <=> query_embedding) as similarity
  from public.restaurant_knowledge as knowledge
  where knowledge.embedding is not null
  order by knowledge.embedding <=> query_embedding
  limit greatest(1, least(match_count, 12));
$$;

grant execute on function public.match_restaurant_knowledge(extensions.vector, integer) to authenticated;
revoke execute on function public.match_restaurant_knowledge(extensions.vector, integer) from public;

create or replace function public.consume_assistant_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_limit public.assistant_rate_limits%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  select * into v_limit from public.assistant_rate_limits where user_id = p_user_id for update;
  if not found or v_limit.window_start < now() - interval '1 minute' then
    insert into public.assistant_rate_limits (user_id, window_start, request_count)
    values (p_user_id, now(), 1)
    on conflict (user_id) do update set window_start = excluded.window_start, request_count = 1;
    return true;
  end if;
  if v_limit.request_count >= 10 then return false; end if;
  update public.assistant_rate_limits set request_count = request_count + 1 where user_id = p_user_id;
  return true;
end;
$$;

revoke execute on function public.consume_assistant_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_assistant_quota(uuid) to service_role;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists menu_items_updated_at on public.menu_items;
create trigger menu_items_updated_at before update on public.menu_items for each row execute procedure public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders for each row execute procedure public.set_updated_at();
drop trigger if exists escalations_updated_at on public.staff_escalations;
create trigger escalations_updated_at before update on public.staff_escalations for each row execute procedure public.set_updated_at();

create or replace function public.place_order(
  p_customer_name text,
  p_order_type text,
  p_table_number text,
  p_notes text,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'DF-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 4));
  v_item jsonb;
  v_menu public.menu_items%rowtype;
  v_quantity integer;
  v_subtotal numeric(10,2) := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_customer_name), '') is null then raise exception 'Customer name is required'; end if;
  if p_order_type not in ('dine-in', 'takeout') then raise exception 'Invalid order type'; end if;
  if p_order_type = 'dine-in' and nullif(trim(p_table_number), '') is null then raise exception 'Table number is required for dine-in'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Order must contain at least one item'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := greatest(1, coalesce((v_item ->> 'quantity')::integer, 1));
    select * into v_menu from public.menu_items where id = (v_item ->> 'id')::uuid for update;
    if not found or not v_menu.available then raise exception 'A selected menu item is unavailable'; end if;
    if v_menu.stock < v_quantity then raise exception 'Not enough stock for %', v_menu.name; end if;
    v_subtotal := v_subtotal + (v_menu.price * v_quantity);
  end loop;

  insert into public.orders (
    id, order_number, customer_id, customer_name, order_type, table_number,
    notes, subtotal, service_fee, total_amount, payment_method, cashier_id
  ) values (
    v_order_id, v_order_number, auth.uid(), trim(p_customer_name), p_order_type,
    case when p_order_type = 'dine-in' then trim(p_table_number) else null end,
    coalesce(trim(p_notes), ''), v_subtotal, 0, v_subtotal, coalesce(p_payment_method, 'cash'),
    case when public.current_user_role() in ('admin', 'staff', 'cashier') then auth.uid() else null end
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := greatest(1, coalesce((v_item ->> 'quantity')::integer, 1));
    select * into v_menu from public.menu_items where id = (v_item ->> 'id')::uuid;
    insert into public.order_items (
      order_id, menu_item_id, name, name_snapshot, price, unit_price,
      quantity, remarks, image_url
    ) values (
      v_order_id, v_menu.id, v_menu.name, v_menu.name, v_menu.price, v_menu.price,
      v_quantity, coalesce(v_item ->> 'remarks', ''), v_menu.image_url
    );
    update public.menu_items set stock = stock - v_quantity, available = (stock - v_quantity) > 0 where id = v_menu.id;
  end loop;

  return jsonb_build_object('id', v_order_id, 'orderNumber', v_order_number, 'totalAmount', v_subtotal);
end;
$$;

grant execute on function public.place_order(text, text, text, text, text, jsonb) to authenticated;
revoke execute on function public.place_order(text, text, text, text, text, jsonb) from public;

create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_role text := public.current_user_role();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if p_status = 'preparing' and v_order.status = 'pending' and v_role in ('admin', 'staff', 'kitchen') then null;
  elsif p_status = 'ready' and v_order.status = 'preparing' and v_role in ('admin', 'staff', 'kitchen') then null;
  elsif p_status = 'completed' and v_order.status = 'ready' and v_role in ('admin', 'staff', 'cashier') then null;
  elsif p_status = 'cancelled' and v_order.status in ('pending', 'preparing') and v_role in ('admin', 'staff', 'kitchen') then null;
  else raise exception 'This status transition is not permitted';
  end if;

  update public.orders set status = p_status where id = p_order_id;
end;
$$;

revoke execute on function public.update_order_status(uuid, text) from public;
grant execute on function public.update_order_status(uuid, text) to authenticated;

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_method text,
  p_amount numeric,
  p_card_last4 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_role text := public.current_user_role();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_role not in ('admin', 'staff', 'cashier') then raise exception 'Cash settlement requires restaurant staff'; end if;
  if v_order.payment_status = 'paid' then raise exception 'Order is already paid'; end if;
  if p_amount <> v_order.total_amount then raise exception 'Payment amount must match the bill total'; end if;
  if upper(p_method) <> 'CASH' then raise exception 'Only cash settlement is available through this staff function'; end if;
  if p_card_last4 is not null then raise exception 'Cash settlement cannot include a card reference'; end if;

  insert into public.payments (id, order_id, method, amount, amount_tendered, card_last4, status)
  values (v_payment_id, p_order_id, upper(p_method), p_amount, p_amount, p_card_last4, 'PAID');
  update public.orders set payment_status = 'paid', payment_method = upper(p_method) where id = p_order_id;

  return jsonb_build_object('id', v_payment_id, 'orderId', p_order_id, 'method', p_method, 'amount', p_amount, 'status', 'PAID');
end;
$$;

grant execute on function public.record_order_payment(uuid, text, numeric, text) to authenticated;
revoke execute on function public.record_order_payment(uuid, text, numeric, text) from public;

create or replace function public.settle_maya_payment(
  p_order_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_card_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment_id uuid := gen_random_uuid();
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.customer_id is distinct from p_customer_id then raise exception 'Order ownership mismatch'; end if;
  if v_order.payment_status = 'paid' then raise exception 'Order is already paid'; end if;
  if p_amount <> v_order.total_amount then raise exception 'Payment amount must match the bill total'; end if;
  if p_card_last4 !~ '^\d{4}$' then raise exception 'Invalid card reference'; end if;

  insert into public.payments (id, order_id, method, amount, amount_tendered, card_last4, status)
  values (v_payment_id, p_order_id, 'MAYA_SANDBOX', p_amount, p_amount, p_card_last4, 'PAID');
  update public.orders set payment_status = 'paid', payment_method = 'MAYA_SANDBOX' where id = p_order_id;
  return jsonb_build_object('id', v_payment_id, 'orderId', p_order_id, 'method', 'MAYA_SANDBOX', 'amount', p_amount, 'status', 'PAID');
end;
$$;

revoke execute on function public.settle_maya_payment(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.settle_maya_payment(uuid, uuid, numeric, text) to service_role;

-- Orders, line items, and payments are mutated only by the validated RPCs above.
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;

-- Preserve the project's existing 45-dish catalog and fill its missing photos.
update public.menu_items as menu
set image_url = photos.image_url,
    updated_at = now()
from (values
  ('Adobo Rice Bowl', 'https://images.unsplash.com/photo-1625937286930-3c5e1f681222?auto=format&fit=crop&w=900&q=85'),
  ('Bangsilog', 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?auto=format&fit=crop&w=900&q=85'),
  ('Barako Coffee', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=85'),
  ('Batchoy', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85'),
  ('Beef Tapa Bowl', 'https://images.unsplash.com/photo-1529694157872-4e0c0f3b238b?auto=format&fit=crop&w=900&q=85'),
  ('Bibingka', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=85'),
  ('Bicol Express Bowl', 'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=900&q=85'),
  ('Bottled Water', 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=900&q=85'),
  ('Calamansi Juice', 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=900&q=85'),
  ('Calamares', 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=900&q=85'),
  ('Chicharon Bulaklak', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=900&q=85'),
  ('Chicken Inasal (Paa)', 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=900&q=85'),
  ('Chicken Inasal (Pecho)', 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=900&q=85'),
  ('Chicken Sisig', 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85'),
  ('Chicksilog', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=900&q=85'),
  ('Ensaladang Talong', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=85'),
  ('Garlic Rice', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85'),
  ('Grilled Bangus', 'https://images.unsplash.com/photo-1510130113356-d94a809c4e85?auto=format&fit=crop&w=900&q=85'),
  ('Halo-Halo', 'https://images.unsplash.com/photo-1514190051997-0f6f39ca5cde?auto=format&fit=crop&w=900&q=85'),
  ('Inihaw na Liempo', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=85'),
  ('Inihaw na Pusit', 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=900&q=85'),
  ('Kinilaw na Tanigue', 'https://images.unsplash.com/photo-1534256958597-7fe685cbd745?auto=format&fit=crop&w=900&q=85'),
  ('Leche Flan', 'https://images.unsplash.com/photo-1570197788417-0e82375c9be7?auto=format&fit=crop&w=900&q=85'),
  ('Lechon Kawali Bowl', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=85'),
  ('Lomi', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85'),
  ('Longsilog', 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?auto=format&fit=crop&w=900&q=85'),
  ('Lumpiang Shanghai', 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=900&q=85'),
  ('Mango Shake', 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?auto=format&fit=crop&w=900&q=85'),
  ('Pancit Bam-i', 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=900&q=85'),
  ('Pancit Bihon', 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=900&q=85'),
  ('Pancit Canton', 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=900&q=85'),
  ('Plain Rice', 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=900&q=85'),
  ('Pork BBQ Skewer', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=85'),
  ('Pork Sisig', 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85'),
  ('Sago''t Gulaman', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85'),
  ('Sisig Rice Bowl', 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85'),
  ('Sizzling Bulalo', 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85'),
  ('Sizzling Gambas', 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=900&q=85'),
  ('Sizzling Tofu', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85'),
  ('Softdrinks in Can', 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?auto=format&fit=crop&w=900&q=85'),
  ('Sotanghon Guisado', 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=900&q=85'),
  ('Spamsilog', 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?auto=format&fit=crop&w=900&q=85'),
  ('Tapsilog', 'https://images.unsplash.com/photo-1529694157872-4e0c0f3b238b?auto=format&fit=crop&w=900&q=85'),
  ('Tocilog', 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?auto=format&fit=crop&w=900&q=85'),
  ('Turon', 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=900&q=85')
) as photos(name, image_url)
where menu.name = photos.name
  and (menu.image_url is null or trim(menu.image_url) = '');

insert into public.restaurant_knowledge (source_key, content, metadata)
select 'menu:' || menu.id::text, concat(
  menu.name, '. ', menu.description, ' Price: PHP ', menu.price,
  '. Category: ', menu.category, '. Serving: ', menu.serving_size,
  '. Preparation: ', menu.prep_minutes, ' minutes. Spice: ', menu.spice_level,
  '. Ingredients: ', array_to_string(menu.ingredients, ', '),
  '. Allergens: ', coalesce(nullif(array_to_string(menu.allergens, ', '), ''), 'none listed'),
  '. Availability: ', case when menu.available then 'available' else 'sold out' end, '.'
), jsonb_build_object('type', 'menu_item', 'menu_item_id', menu.id, 'name', menu.name)
from public.menu_items as menu
on conflict (source_key) do update set content = excluded.content, metadata = excluded.metadata,
  embedding = case when public.restaurant_knowledge.content is distinct from excluded.content then null else public.restaurant_knowledge.embedding end,
  updated_at = now();

insert into public.restaurant_knowledge (source_key, content, metadata)
select 'settings', concat('Restaurant hours: ', settings.operating_hours, '. Payment methods: ', array_to_string(settings.payment_methods, ', '), '. FAQ: ', settings.faq::text),
  jsonb_build_object('type', 'restaurant_settings')
from public.restaurant_settings as settings
where settings.id = true
on conflict (source_key) do update set content = excluded.content, metadata = excluded.metadata,
  embedding = case when public.restaurant_knowledge.content is distinct from excluded.content then null else public.restaurant_knowledge.embedding end,
  updated_at = now();

do $$
begin
if not exists (select 1 from public.menu_items limit 1) then
insert into public.menu_items
  (name, image_url, category, price, stock, description, ingredients, allergens, spice_level, serving_size, prep_minutes, featured)
values
  ('Chicken Adobo', 'https://images.unsplash.com/photo-1625937286930-3c5e1f681222?auto=format&fit=crop&w=900&q=85', 'Chicken', 75, 50, 'Chicken braised in soy sauce, vinegar, garlic, and bay leaf.', array['chicken','soy sauce','vinegar','garlic','bay leaf'], array['soy'], 'none', '1 rice meal', 18, true),
  ('Fried Chicken', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=900&q=85', 'Chicken', 65, 40, 'Crisp, golden chicken seasoned with the house spice blend.', array['chicken','flour','house spices'], array['gluten'], 'mild', '1 piece with rice', 16, false),
  ('Chicken Inasal', 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=900&q=85', 'Chicken', 85, 30, 'Bacolod-style grilled chicken in calamansi and annatto marinade.', array['chicken','calamansi','annatto','garlic'], array['soy'], 'mild', '1 quarter chicken', 20, true),
  ('Pork Sinigang', 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85', 'Pork', 85, 35, 'Tamarind-sour pork soup with seasonal vegetables.', array['pork','tamarind','tomato','kangkong','radish'], '{}', 'none', '1 bowl', 22, true),
  ('Lechon Kawali', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=85', 'Pork', 95, 25, 'Deep-fried pork belly with a crackling crisp exterior.', array['pork belly','salt','pepper'], '{}', 'none', '180 g', 18, false),
  ('Pork Sisig', 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85', 'Pork', 90, 30, 'Sizzling chopped pork with onion, calamansi, and chili.', array['pork','onion','calamansi','chili'], array['egg','soy'], 'medium', '1 sizzling plate', 17, true),
  ('Beef Tapa', 'https://images.unsplash.com/photo-1529694157872-4e0c0f3b238b?auto=format&fit=crop&w=900&q=85', 'Beef', 90, 25, 'Sweet-savory cured beef served as a filling rice meal.', array['beef','soy sauce','garlic','sugar'], array['soy'], 'none', '1 rice meal', 14, false),
  ('Beef Caldereta', 'https://images.unsplash.com/photo-1574484284002-952d92456975?auto=format&fit=crop&w=900&q=85', 'Beef', 100, 20, 'Rich tomato beef stew with potatoes and bell peppers.', array['beef','tomato','potato','bell pepper'], array['dairy'], 'mild', '1 bowl', 24, true),
  ('Bulalo', 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85', 'Beef', 120, 15, 'Slow-simmered beef shank and marrow soup with corn and cabbage.', array['beef shank','corn','cabbage','onion'], '{}', 'none', '1 large bowl', 28, false),
  ('Grilled Bangus', 'https://images.unsplash.com/photo-1510130113356-d94a809c4e85?auto=format&fit=crop&w=900&q=85', 'Seafood', 95, 20, 'Grilled milkfish stuffed with tomato and onion.', array['milkfish','tomato','onion','calamansi'], array['fish'], 'none', '1 half fish', 22, true),
  ('Shrimp Sinigang', 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=900&q=85', 'Seafood', 110, 15, 'Bright tamarind soup with shrimp and vegetables.', array['shrimp','tamarind','tomato','kangkong'], array['shellfish'], 'none', '1 bowl', 20, false),
  ('Pancit Canton', 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=900&q=85', 'Noodles', 55, 40, 'Stir-fried egg noodles with vegetables and savory sauce.', array['egg noodles','cabbage','carrot','soy sauce'], array['egg','gluten','soy'], 'none', '1 plate', 12, true),
  ('Pancit Bihon', 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=900&q=85', 'Noodles', 50, 45, 'Rice vermicelli stir-fried with vegetables and soy.', array['rice noodles','cabbage','carrot','soy sauce'], array['soy'], 'none', '1 plate', 12, false),
  ('Plain Rice', 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=900&q=85', 'Sides', 15, 100, 'Steamed white rice.', array['rice'], '{}', 'none', '1 cup', 5, false),
  ('Garlic Rice', 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85', 'Sides', 20, 80, 'Fragrant garlic fried rice.', array['rice','garlic','oil'], '{}', 'none', '1 cup', 7, true),
  ('Coleslaw', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=85', 'Sides', 25, 50, 'Chilled cabbage and carrot slaw in creamy dressing.', array['cabbage','carrot','mayonnaise'], array['egg'], 'none', '1 side cup', 4, false),
  ('Lumpiang Shanghai', 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=900&q=85', 'Sides', 35, 60, 'Six crisp Filipino pork spring rolls.', array['pork','carrot','wrapper'], array['egg','gluten'], 'none', '6 pieces', 12, true),
  ('Leche Flan', 'https://images.unsplash.com/photo-1570197788417-0e82375c9be7?auto=format&fit=crop&w=900&q=85', 'Desserts', 45, 30, 'Silky caramel custard made with egg yolks and milk.', array['egg yolk','milk','sugar'], array['egg','dairy'], 'none', '1 slice', 3, true),
  ('Halo-Halo', 'https://images.unsplash.com/photo-1514190051997-0f6f39ca5cde?auto=format&fit=crop&w=900&q=85', 'Desserts', 55, 25, 'Shaved ice layered with sweet beans, fruit, leche flan, and ube.', array['shaved ice','milk','ube','sweet beans','fruit'], array['dairy'], 'none', '12 oz glass', 8, true),
  ('Turon', 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=900&q=85', 'Desserts', 20, 40, 'Caramelized banana spring roll.', array['banana','brown sugar','wrapper'], array['gluten'], 'none', '2 pieces', 8, false),
  ('Iced Tea', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=900&q=85', 'Beverages', 25, 60, 'Chilled house-blend black tea with citrus.', array['black tea','citrus','sugar'], '{}', 'none', '16 oz glass', 3, true),
  ('Calamansi Juice', 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=900&q=85', 'Beverages', 20, 50, 'Fresh Philippine lime juice served over ice.', array['calamansi','water','sugar'], '{}', 'none', '16 oz glass', 4, false),
  ('Mango Shake', 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?auto=format&fit=crop&w=900&q=85', 'Beverages', 45, 30, 'Creamy ripe-mango shake.', array['mango','milk','ice'], array['dairy'], 'none', '16 oz glass', 6, true),
  ('Barako Coffee', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=85', 'Beverages', 30, 50, 'Freshly brewed Batangas barako coffee.', array['barako coffee','water'], '{}', 'none', '10 oz cup', 5, false),
  ('Bottled Water', 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=900&q=85', 'Beverages', 15, 100, 'Purified drinking water.', array['water'], '{}', 'none', '500 ml bottle', 1, false)
on conflict (name) do update set
  image_url = excluded.image_url,
  category = excluded.category,
  price = excluded.price,
  stock = excluded.stock,
  description = excluded.description,
  ingredients = excluded.ingredients,
  allergens = excluded.allergens,
  spice_level = excluded.spice_level,
  serving_size = excluded.serving_size,
  prep_minutes = excluded.prep_minutes,
  featured = excluded.featured,
  updated_at = now();
end if;
end $$;

-- These reference dish names from an earlier menu draft. The menu was
-- later curated down to a different 45-item list (see the photo-fill
-- block above), so 'Chicken Adobo', 'Chicken Inasal', and 'Lechon
-- Kawali' no longer exist as item names, and 'Iced Tea' was dropped
-- in favour of Sago't Gulaman / Calamansi Juice / Barako Coffee.
-- Corrected to real current item names below; the underlying support
-- and confidence values were always illustrative, not mined.
insert into public.recommendation_rules
  (antecedent_name, consequent_name, support, confidence, lift, source)
values
  ('Chicken Sisig', 'Plain Rice', 0.310000, 0.820000, 1.4200, 'simulated'),
  ('Pork Sisig', 'Garlic Rice', 0.240000, 0.740000, 1.3600, 'simulated'),
  ('Chicken Inasal (Pecho)', 'Sago''t Gulaman', 0.220000, 0.680000, 1.3100, 'simulated'),
  ('Pancit Canton', 'Lumpiang Shanghai', 0.180000, 0.610000, 1.2700, 'simulated'),
  ('Lechon Kawali Bowl', 'Calamansi Juice', 0.160000, 0.590000, 1.2200, 'simulated'),
  ('Adobo Rice Bowl', 'Calamansi Juice', 0.220000, 0.670000, 1.2900, 'simulated'),
  ('Tapsilog', 'Barako Coffee', 0.190000, 0.630000, 1.2600, 'simulated'),
  ('Chicken Inasal (Paa)', 'Garlic Rice', 0.210000, 0.690000, 1.3300, 'simulated')
on conflict (antecedent_name, consequent_name) do update set
  support = excluded.support,
  confidence = excluded.confidence,
  lift = excluded.lift,
  source = excluded.source,
  updated_at = now();

do $$
begin
  alter publication supabase_realtime add table public.menu_items;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.order_items;
exception when duplicate_object then null;
end $$;
