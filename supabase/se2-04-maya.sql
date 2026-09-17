-- Optional hosted Maya SANDBOX. Apply after SE2 workflows.
begin;
create table if not exists public.maya_checkouts(
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  checkout_id uuid unique, redirect_url text, amount numeric(10,2) not null,
  state text not null default 'creating' check(state in ('creating','pending','paid','expired')),
  created_at timestamptz not null default now()
);
create unique index if not exists maya_active_order on public.maya_checkouts(order_id) where state in ('creating','pending');
alter table public.maya_checkouts enable row level security;
revoke all on public.maya_checkouts from anon,authenticated;
grant all on public.maya_checkouts to service_role;
create or replace function public.reserve_maya_checkout(p_order_id uuid,p_customer_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; a maya_checkouts%rowtype;
begin
  select * into o from orders where id=p_order_id for update;
  if not found or o.customer_id is distinct from p_customer_id or o.payment_status<>'unpaid' or o.status in ('cancelled','completed') then raise exception 'An active unpaid order belonging to this customer is required';end if;
  select * into a from maya_checkouts where order_id=p_order_id and state in ('creating','pending') for update;
  if found then
    if a.created_at<now()-interval '1 hour' then raise exception 'Checkout has expired. Verify its payment status before staff releases it';end if;
    return to_jsonb(a)||jsonb_build_object('isNew',false);
  end if;
  insert into maya_checkouts(order_id,amount) values(o.id,o.total_amount) returning * into a;
  return to_jsonb(a)||jsonb_build_object('isNew',true);
end $$;
create or replace function public.settle_verified_maya(p_attempt_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare a maya_checkouts%rowtype; o orders%rowtype; v_id uuid;
begin
  select * into a from maya_checkouts where id=p_attempt_id;
  if not found or a.checkout_id is null then raise exception 'Checkout not found';end if;
  select * into o from orders where id=a.order_id for update;
  select * into a from maya_checkouts where id=p_attempt_id for update;
  if a.state='paid' then return jsonb_build_object('orderId',o.id,'paid',true);end if;
  if o.status='cancelled' or o.payment_status<>'unpaid' or o.total_amount<>a.amount then raise exception 'Bill changed or was already settled; staff review required';end if;
  insert into payments(order_id,method,amount,amount_tendered,status) values(o.id,'MAYA_SANDBOX',a.amount,a.amount,'PAID') returning id into v_id;
  update maya_checkouts set state='paid' where id=a.id;
  update orders set payment_status='paid',payment_method='MAYA_SANDBOX',status=case when status='served' then 'completed' else status end where id=o.id;
  return jsonb_build_object('id',v_id,'orderId',o.id,'paid',true);
end $$;
-- Do not allow discount edits, cancellation or alternate payment while Maya is active.
create or replace function public.guard_hosted_bill() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from maya_checkouts where order_id=old.id and state in ('creating','pending'))
    and (new.total_amount<>old.total_amount or new.status='cancelled' or new.payment_status<>old.payment_status) then
    raise exception 'Verify or release the active Maya checkout before changing or settling this bill';
  end if;
  return new;
end $$;
drop trigger if exists hosted_bill_guard on public.orders;
create trigger hosted_bill_guard before update on public.orders for each row execute function public.guard_hosted_bill();
revoke all on function public.reserve_maya_checkout(uuid,uuid),public.settle_verified_maya(uuid) from public,anon,authenticated;
grant execute on function public.reserve_maya_checkout(uuid,uuid),public.settle_verified_maya(uuid) to service_role;
notify pgrst,'reload schema';
commit;
