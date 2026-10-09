import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { encodeQR } from '../checkout/qr';
import './WorkflowPanels.css';

function TableQR({ url, number }) {
  try {
    const { size, modules } = encodeQR(url);
    const path = modules
      .flatMap((row, rowIndex) => row.map((dark, columnIndex) => (
        dark ? `M${columnIndex + 4} ${rowIndex + 4}h1v1h-1z` : ''
      )))
      .join('');

    return (
      <svg className="workflow-qr" viewBox={`0 0 ${size + 8} ${size + 8}`} role="img" aria-label={`Scan to order at table ${number}`} shapeRendering="crispEdges">
        <rect width={size + 8} height={size + 8} fill="white" />
        <path d={path} fill="black" />
      </svg>
    );
  } catch {
    return <p role="alert">The link is too long for a QR code. Use the table link below.</p>;
  }
}

export default function TableSessions({ orders }) {
  const [tables, setTables] = useState([]);
  const [number, setNumber] = useState('');
  const [seats, setSeats] = useState(4);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: failure } = await supabase.from('dining_tables').select('*').order('table_number');
    if (failure) setError(failure.message);
    else setTables(data || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { error: failure } = await supabase.from('dining_tables').insert({ table_number: number.trim(), seats: Number(seats) });
    if (failure) setError(failure.message);
    else {
      setNumber('');
      await load();
    }
    setBusy(false);
  };

  const update = async (table, values) => {
    setBusy(true);
    setError('');
    const { error: failure } = await supabase.from('dining_tables').update(values).eq('id', table.id);
    if (failure) setError(failure.message);
    else await load();
    setBusy(false);
  };

  return (
    <div className="page-content workflow">
      <div className="workflow-print-header" aria-hidden="true">
        <strong>DineFlow</strong>
        <span>Scan your table code to view the menu and order.</span>
      </div>

      <div className="page-hero">
        <div>
          <h2 className="page-title">Tables &amp; QR sessions</h2>
          <p className="page-sub">Create tables, print guest-ready codes, and follow active bills.</p>
        </div>
        <button className="hero-btn hero-btn--outline" onClick={() => window.print()}>Print active table codes</button>
      </div>

      <form className="workflow-controls" onSubmit={add}>
        <label>Table number<input required maxLength={30} value={number} onChange={(event) => setNumber(event.target.value)} /></label>
        <label>Seats<input required type="number" min={1} max={100} value={seats} onChange={(event) => setSeats(event.target.value)} /></label>
        <button className="hero-btn" disabled={busy || !number.trim()}>Add table</button>
      </form>

      {error && <p className="workflow-error" role="alert">{error}</p>}
      {!tables.length && !error && <p>No tables yet. Add a table to create its dine-in QR session.</p>}

      <div className="workflow-table-grid">
        {tables.map((table) => {
          const activeBills = orders.filter((order) => order.tableId === table.id && !['completed', 'cancelled'].includes(order.status));
          const url = `${window.location.origin}/?tableSession=${table.session_token}`;

          return (
            <section className={`workflow-table-card ${table.active ? '' : 'is-inactive'}`} key={table.id}>
              <header className="workflow-table-card__header">
                <div><h3>Table {table.table_number}</h3><p>{table.seats} seats</p></div>
                <span className={`workflow-table-status ${table.active ? 'is-active' : ''}`}>
                  {table.active ? (activeBills.length ? `${activeBills.length} active bill${activeBills.length === 1 ? '' : 's'}` : 'Ready') : 'Inactive'}
                </span>
              </header>

              {table.active && (
                <div className="workflow-qr-panel">
                  <TableQR url={url} number={table.table_number} />
                  <strong>Scan to view the menu</strong>
                  <p>Open your camera, scan the code, then continue as a guest. No app download needed.</p>
                </div>
              )}

              {activeBills.length > 0 && (
                <div className="workflow-active-bills" aria-label={`Active bills for table ${table.table_number}`}>
                  {activeBills.map((order) => <span key={order.id}>{order.orderNumber} · {order.status} · {order.paymentStatus}</span>)}
                </div>
              )}

              {table.active && <a className="workflow-session-link" href={url} target="_blank" rel="noreferrer">Test this table link</a>}

              <div className="workflow-table-actions">
                <button className="hero-btn hero-btn--outline" disabled={busy || activeBills.length > 0} onClick={() => update(table, { session_token: crypto.randomUUID() })}>Replace QR session</button>
                <button className="hero-btn hero-btn--outline" disabled={busy || activeBills.length > 0} onClick={() => update(table, { active: !table.active })}>{table.active ? 'Deactivate' : 'Activate'}</button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
