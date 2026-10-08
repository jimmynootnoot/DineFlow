-- Synthetic sales for development / demonstrations. Run AFTER the SE2 migrations.
-- Adds 90 days of history; never deletes orders, changes stock, or calls a gateway.
-- Repeating this script skips existing demo order numbers. All changes are atomic.
begin;
do $$
declare
  v_day date;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_offset integer;
  v_slot integer;
  v_count integer;
  v_serial integer := 0;
  v_inserted integer := 0;
  v_id uuid;
  v_number text;
  v_created timestamptz;
  v_names text[];
  v_menu uuid[];
  v_selected uuid[];
  v_item record;
  v_quantity integer;
  v_subtotal numeric(10,2);
  v_eligible numeric(10,2);
  v_net numeric(10,2);
  v_discount numeric(10,2);
  v_exemption numeric(10,2);
  v_total numeric(10,2);
  v_tendered numeric(10,2);
  v_vat boolean;
  v_cancelled boolean;
  v_method text;
  v_discount_type text;
  v_type text;
begin
  -- Serializes concurrent runs of this seed without locking normal ordering.
  perform pg_advisory_xact_lock(72409103);
  select array_agg(id order by name,id) into v_menu from public.menu_items;
  if coalesce(cardinality(v_menu),0) < 3 then
    raise exception 'Install at least three menu items before adding analytics demo data';
  end if;
  select coalesce(bool_or(vat_registered),false) into v_vat from public.restaurant_settings;
  for v_offset in 0..89 loop
    v_day := v_today - 89 + v_offset;
    -- Busier weekends and gradual growth give date comparisons a useful baseline.
    v_count := 12 + v_offset % 5 + (v_offset / 30) * 3
      + case when extract(isodow from v_day) in (6,7) then 8 else 0 end;
    for v_slot in 1..v_count loop
      v_serial := v_serial + 1;
      v_number := 'DEMO-ANALYTICS-V1-' || to_char(v_day,'YYYYMMDD') || '-' || lpad(v_slot::text,3,'0');
      if exists(select 1 from public.orders where order_number = v_number) then continue; end if;
      v_id := gen_random_uuid();
      v_created := least((v_day + interval '10 hours' + (v_slot - 1) * interval '24 minutes') at time zone 'Asia/Manila', now() - interval '1 minute');
      v_cancelled := v_serial % 17 = 0;
      v_type := case when v_serial % 3 = 0 then 'takeout' else 'dine-in' end;
      v_method := (array['CASH','CASH','GCASH','CARD','QR','BANK'])[1 + v_serial % 6];
      v_names := case v_serial % 5
        when 0 then array['Chicken Inasal','Garlic Rice','Iced Tea']
        when 1 then array['Pork Sisig','Plain Rice','Calamansi Juice']
        when 2 then array['Pancit Canton','Lumpiang Shanghai','Iced Tea']
        when 3 then array['Beef Caldereta','Plain Rice','Leche Flan']
        else array['Fried Chicken','Garlic Rice','Halo-Halo'] end;
      select array_agg(id order by name) into v_selected from public.menu_items where name = any(v_names);
      if v_serial % 7 = 0 or coalesce(cardinality(v_selected),0) = 0 then
        -- Rotating single-item orders cover the whole current menu, too.
        v_selected := array[v_menu[1 + (v_serial / 7) % cardinality(v_menu)]];
      end if;
      insert into public.orders(id,order_number,customer_name,order_type,table_number,notes,status,payment_status,created_at,updated_at)
      values(v_id,v_number,'Demo Guest ' || lpad((1 + v_serial % 48)::text,2,'0'),v_type,
        case when v_type = 'dine-in' then 'DEMO-' || (1 + v_serial % 12)::text end,
        '[DEMO ANALYTICS V1] Synthetic training data; no real customer or payment.',
        case when v_cancelled then 'cancelled' else 'completed' end,'unpaid',v_created,v_created);
      v_subtotal := 0;
      for v_item in select * from public.menu_items where id = any(v_selected) order by name loop
        v_quantity := case when v_serial % 9 = 0 then 3 when v_serial % 4 = 0 then 2 else 1 end;
        insert into public.order_items(order_id,menu_item_id,name,name_snapshot,price,unit_price,quantity,image_url,remarks)
        values(v_id,v_item.id,v_item.name,v_item.name,v_item.price,v_item.price,v_quantity,v_item.image_url,'Synthetic analytics sample');
        v_subtotal := v_subtotal + v_item.price * v_quantity;
      end loop;
      v_discount_type := case when not v_cancelled and v_serial % 10 = 0 then 'senior'
        when not v_cancelled and v_serial % 13 = 0 then 'pwd' else 'none' end;
      v_eligible := case when v_discount_type = 'none' then 0 else round(v_subtotal / 2,2) end;
      v_net := case when v_vat then round(v_eligible / 1.12,2) else v_eligible end;
      v_exemption := v_eligible - v_net;
      v_discount := round(v_net * 0.20,2);
      v_total := v_subtotal - v_exemption - v_discount;
      -- Reassert totals after line inserts for compatibility with legacy recalculation triggers.
      update public.orders set subtotal = v_subtotal,service_fee = 0,total_amount = v_total,
        discount_type = v_discount_type,discount_eligible_amount = v_eligible,
        discount_amount = v_discount,vat_exemption = v_exemption,payment_method = v_method,
        payment_status = case when v_cancelled then 'unpaid' else 'paid' end where id = v_id;
      if not v_cancelled then
        v_tendered := case when v_method = 'CASH' then ceil(v_total / 100) * 100 else v_total end;
        insert into public.payments(order_id,method,amount,amount_tendered,change_due,status,paid_at)
        values(v_id,v_method,v_total,v_tendered,v_tendered - v_total,'PAID',least(v_created + interval '25 minutes',now()));
      end if;
      v_inserted := v_inserted + 1;
    end loop;
  end loop;
  raise notice 'Added % synthetic analytics orders. Existing orders and menu stock were preserved.',v_inserted;
end $$;
commit;

select count(*) as demo_orders,
  count(*) filter(where status = 'completed' and payment_status = 'paid') as completed_paid,
  count(*) filter(where status = 'cancelled') as cancelled,
  min(created_at at time zone 'Asia/Manila')::date as first_day,
  max(created_at at time zone 'Asia/Manila')::date as last_day,
  sum(total_amount) filter(where status = 'completed' and payment_status = 'paid') as demo_net_revenue
from public.orders where notes like '[DEMO ANALYTICS V1]%';
