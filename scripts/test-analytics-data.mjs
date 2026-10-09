// Executes the real seed against isolated PostgreSQL. Never connects to Supabase.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { aggregateSales, periodBounds } from '../serverlib/sales.mjs';

const db = new PGlite({ extensions: { vector, pgcrypto } });
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    create publication supabase_realtime;`);
  for (const file of ['dineflow-setup.sql','multi-method-payments.sql','se2-01-roles.sql','se2-02-workflows.sql','se2-04-maya.sql','se2-06-safe-mining-publish.sql']) {
    await db.exec(await readFile(`supabase/${file}`, 'utf8'));
  }
  await db.exec(`insert into orders(order_number,customer_name,order_type,status,notes)
    values('PRESERVE-ME','Existing guest','takeout','confirmed','Existing order');`);
  const existing = (await db.query("select * from orders where order_number='PRESERVE-ME'")).rows;
  const menu = (await db.query('select * from menu_items order by id')).rows;
  // Exercise VAT removal as well as ordinary undiscounted bills.
  await db.exec('update restaurant_settings set vat_registered=true');
  const seed = await readFile('supabase/analytics-demo-data.sql', 'utf8');
  await db.exec(seed);
  const result = await db.query(`select o.*,
    (select jsonb_agg(i) from order_items i where i.order_id=o.id) as order_items,
    (select jsonb_agg(p) from payments p where p.order_id=o.id) as payments
    from orders o where notes like '[DEMO ANALYTICS V1]%' order by created_at,order_number`);
  const orders = result.rows;
  assert.ok(orders.length > 1500 && orders.length < 2000);
  const seenItems = new Set();
  const seenMethods = new Set();
  for (const order of orders) {
    const gross = order.order_items.reduce((sum, item) => {
      seenItems.add(item.menu_item_id);
      assert.equal(Number(item.price), Number(item.unit_price));
      assert.equal(item.name, item.name_snapshot);
      assert.equal(Number(item.subtotal), Number(item.price) * item.quantity);
      return sum + Math.round(Number(item.price) * 100) * item.quantity;
    }, 0);
    assert.equal(Math.round(Number(order.subtotal) * 100), gross);
    assert.equal(Math.round(Number(order.total_amount) * 100), gross
      - Math.round(Number(order.discount_amount) * 100) - Math.round(Number(order.vat_exemption) * 100));
    assert.ok(new Date(order.created_at) <= new Date());
    assert.equal(order.customer_id, null);
    if (order.status === 'cancelled') {
      assert.equal(order.payment_status, 'unpaid');
      assert.equal(order.payments, null);
    } else {
      assert.equal(order.status, 'completed');
      assert.equal(order.payment_status, 'paid');
      assert.equal(order.payments.length, 1);
      const payment = order.payments[0];
      assert.equal(Number(payment.amount), Number(order.total_amount));
      assert.equal(Math.round(Number(payment.amount_tendered) * 100) - Math.round(Number(payment.change_due) * 100), Math.round(Number(payment.amount) * 100));
      seenMethods.add(payment.method);
    }
  }
  assert.equal(seenItems.size, menu.length);
  assert.equal(seenMethods.size, 5);
  assert.ok(orders.some(o => Number(o.discount_amount) > 0 && Number(o.vat_exemption) > 0));
  const { rows: [dates] } = await db.query(`select to_char((now() at time zone 'Asia/Manila')::date-29,'YYYY-MM-DD') as start,
    to_char(now() at time zone 'Asia/Manila','YYYY-MM-DD') as end`);
  const report = aggregateSales(orders, periodBounds(dates.start, dates.end));
  assert.ok(report.revenue > 0 && report.previousRevenue > 0);
  assert.ok(report.cancelledOrders > 0 && report.items.length === menu.length);
  const snapshot = (await db.query('select * from orders order by id')).rows;
  const lines = (await db.query('select count(*) from order_items')).rows;
  const payments = (await db.query('select count(*) from payments')).rows;
  await db.exec(seed);
  assert.deepEqual((await db.query('select * from orders order by id')).rows, snapshot);
  assert.deepEqual((await db.query('select count(*) from order_items')).rows, lines);
  assert.deepEqual((await db.query('select count(*) from payments')).rows, payments);
  assert.deepEqual((await db.query("select * from orders where order_number='PRESERVE-ME'")).rows, existing);
  assert.deepEqual((await db.query('select * from menu_items order by id')).rows, menu);
  await mkdir('tmp/analytics-demo', { recursive: true });
  const baskets = orders.filter(o => o.status === 'completed').map(o => o.order_items.map(i => i.name));
  await writeFile('tmp/analytics-demo/transactions.json', JSON.stringify(baskets));
  await writeFile('tmp/analytics-demo/report.json', JSON.stringify({ source: 'simulated', period: dates, ...report }, null, 2));
  const columns = ['order_number','customer_name','order_type','status','payment_status','payment_method','subtotal','discount_amount','vat_exemption','total_amount','created_at','notes'];
  const cell = value => `"${String(value instanceof Date ? value.toISOString() : value ?? '').replaceAll('"','""')}"`;
  await writeFile('tmp/analytics-demo/orders.csv', [columns.join(','), ...orders.map(o => columns.map(k => cell(o[k])).join(','))].join('\n'));
  console.log(JSON.stringify({ orders: orders.length, completedPaid: baskets.length, cancelled: orders.length - baskets.length,
    lineItems: Number(lines[0].count), menuItems: seenItems.size,
    last30DaysRevenue: report.revenue, previous30DaysRevenue: report.previousRevenue }, null, 2));
  console.log('PASS: balanced bills, payments, all menu items, date comparisons, no future orders, repeatability, existing records and stock preserved. Preview files: tmp/analytics-demo/');
} finally {
  await db.close();
}
