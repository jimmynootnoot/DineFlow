-- ═══════════════════════════════════════════════════════════════
-- DineFlow — multi-method payments
--
-- Run this in the Supabase SQL editor after dineflow-setup.sql.
-- Safe to run more than once.
--
-- Fixes two things:
--   1. settle_maya_payment() hardcodes 'MAYA_SANDBOX', so a GCash,
--      bank or QR payment was recorded as a Maya card payment. The
--      replacement takes the method as a parameter.
--   2. Payments consumed the *assistant's* rate-limit bucket, so a
--      customer who asked the assistant ten questions in a minute
--      was refused at checkout. Payments now get their own bucket.
--
-- Until this is applied, /api/payment falls back to the original
-- functions and keeps working — it just records every online method
-- as MAYA_SANDBOX.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Payment settlement that honours the chosen method ────────
create or replace function public.settle_online_payment(
  p_order_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_reference text,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_method text := upper(coalesce(p_method, 'CARD'));
begin
  if v_method not in ('CARD', 'GCASH', 'BANK', 'QR') then
    raise exception 'Unsupported payment method: %', v_method;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.customer_id is distinct from p_customer_id then raise exception 'Order ownership mismatch'; end if;
  if v_order.payment_status = 'paid' then raise exception 'Order is already paid'; end if;
  if p_amount <> v_order.total_amount then raise exception 'Payment amount must match the bill total'; end if;
  if p_reference !~ '^\d{4}$' then raise exception 'Invalid payment reference'; end if;

  insert into public.payments (id, order_id, method, amount, amount_tendered, card_last4, status)
  values (v_payment_id, p_order_id, v_method, p_amount, p_amount, p_reference, 'PAID');

  update public.orders
  set payment_status = 'paid', payment_method = v_method
  where id = p_order_id;

  return jsonb_build_object(
    'id', v_payment_id, 'orderId', p_order_id,
    'method', v_method, 'amount', p_amount, 'status', 'PAID'
  );
end;
$$;

revoke execute on function public.settle_online_payment(uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant  execute on function public.settle_online_payment(uuid, uuid, numeric, text, text) to service_role;

-- ── 2. A rate-limit bucket that is not the assistant's ──────────
create table if not exists public.payment_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.payment_rate_limits enable row level security;
revoke all on public.payment_rate_limits from anon, authenticated;

create or replace function public.consume_payment_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_limit public.payment_rate_limits%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('payment:' || p_user_id::text));
  select * into v_limit from public.payment_rate_limits where user_id = p_user_id for update;

  if not found or v_limit.window_start < now() - interval '1 minute' then
    insert into public.payment_rate_limits (user_id, window_start, request_count)
    values (p_user_id, now(), 1)
    on conflict (user_id) do update set window_start = excluded.window_start, request_count = 1;
    return true;
  end if;

  -- A genuine checkout is a handful of attempts, not dozens.
  if v_limit.request_count >= 8 then return false; end if;

  update public.payment_rate_limits set request_count = request_count + 1 where user_id = p_user_id;
  return true;
end;
$$;

revoke execute on function public.consume_payment_quota(uuid) from public, anon, authenticated;
grant  execute on function public.consume_payment_quota(uuid) to service_role;
