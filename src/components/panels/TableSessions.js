import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { encodeQR } from '../checkout/qr';
import './WorkflowPanels.css';

function TableQR({url,number}) {
  try {
    const {size,modules}=encodeQR(url);
    const path=modules.flatMap((row,r)=>row.map((dark,c)=>dark?`M${c+4} ${r+4}h1v1h-1z`:'')).join('');
    return <svg className="workflow-qr" viewBox={`0 0 ${size+8} ${size+8}`} role="img" aria-label={`Scan to order at table ${number}`} shapeRendering="crispEdges"><rect width={size+8} height={size+8} fill="white"/><path d={path} fill="black"/></svg>;
  } catch {return <p role="alert">The link is too long for a QR code. Use the table link below.</p>;}
}
export default function TableSessions({orders}) {
  const [tables,setTables]=useState([]),[number,setNumber]=useState(''),[seats,setSeats]=useState(4),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const {data,error:failure}=await supabase.from('dining_tables').select('*').order('table_number');if(failure)setError(failure.message);else setTables(data||[]);},[]);
  useEffect(()=>{void load();},[load]);
  const add=async e=>{e.preventDefault();setBusy(true);setError('');const {error:failure}=await supabase.from('dining_tables').insert({table_number:number.trim(),seats:Number(seats)});if(failure)setError(failure.message);else{setNumber('');await load();}setBusy(false);};
  const update=async(table,values)=>{setBusy(true);setError('');const {error:failure}=await supabase.from('dining_tables').update(values).eq('id',table.id);if(failure)setError(failure.message);else await load();setBusy(false);};
  return <div className="page-content workflow"><div className="page-hero"><div><h2 className="page-title">Tables & QR sessions</h2><p className="page-sub">Create a table, print its code, and follow active bills.</p></div><button className="hero-btn hero-btn--outline" onClick={()=>window.print()}>Print table codes</button></div>
    <form className="workflow-controls" onSubmit={add}><label>Table number<input required maxLength={30} value={number} onChange={e=>setNumber(e.target.value)}/></label><label>Seats<input required type="number" min={1} max={100} value={seats} onChange={e=>setSeats(e.target.value)}/></label><button className="hero-btn" disabled={busy||!number.trim()}>Add table</button></form>
    {error&&<p className="workflow-error" role="alert">{error}</p>}
    {!tables.length&&!error&&<p>No tables yet. Add a table to create its dine-in QR session.</p>}
    {tables.map(table=>{const active=orders.filter(o=>o.tableId===table.id&&!['completed','cancelled'].includes(o.status));const url=`${window.location.origin}/?tableSession=${table.session_token}`;return <section className="workflow-table-row" key={table.id}><div><h3>Table {table.table_number}</h3><p>{table.seats} seats · {table.active?(active.length?`${active.length} active bill(s)`:'Available'):'Inactive'}</p>{active.map(o=><p key={o.id}>{o.orderNumber} · {o.status} · {o.paymentStatus}</p>)}{table.active&&<><TableQR url={url} number={table.table_number}/><a href={url} target="_blank" rel="noreferrer">Open table ordering session</a></>}</div><div className="workflow-controls"><button className="hero-btn hero-btn--outline" disabled={busy||active.length>0} onClick={()=>update(table,{session_token:crypto.randomUUID()})}>Replace QR session</button><button className="hero-btn hero-btn--outline" disabled={busy||active.length>0} onClick={()=>update(table,{active:!table.active})}>{table.active?'Deactivate':'Activate'}</button></div></section>;})}
  </div>;
}
