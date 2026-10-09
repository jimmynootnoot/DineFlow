-- Repair installations where orders.table_id existed before dining_tables.
-- ADD COLUMN IF NOT EXISTS in se2-02 does not replace an older foreign key.
-- Apply after se2-02-workflows.sql. Safe to rerun.
begin;

alter table public.orders add column if not exists table_id uuid;
alter table public.orders add column if not exists legacy_table_id uuid;
alter table public.orders drop constraint if exists orders_table_id_fkey;

-- Keep the old identifier for audit. Preserve the displayed table number even
-- if the corresponding dining table has since been removed or renamed.
update public.orders as o
set legacy_table_id = coalesce(o.legacy_table_id, o.table_id),
    table_id = (
      select d.id from public.dining_tables as d
      where d.table_number = o.table_number
      limit 1
    )
where o.table_id is not null
  and not exists (
    select 1 from public.dining_tables as d where d.id = o.table_id
  );

alter table public.orders add constraint orders_table_id_fkey
  foreign key (table_id) references public.dining_tables(id) on delete set null;

commit;
