import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { serverRequest, downloadText, csvCell } from '../../services/platformService';
import './WorkflowPanels.css';

const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money = value => `₱${Number(value||0).toFixed(2)}`;
export default function ResearchReports() {
  const [start,setStart] = useState(()=>`${today().slice(0,7)}-01`);
  const [end,setEnd] = useState(today);
  const [result,setResult] = useState(null);
  const [run,setRun] = useState(null);
  const [error,setError] = useState('');
  const [miningError,setMiningError] = useState('');
  const [busy,setBusy] = useState(false);
  const [range,setRange] = useState(null);
  useEffect(()=>{
    let active=true;
    supabase.from('recommendation_runs').select('*').order('created_at',{ascending:false}).limit(1)
      .then(({data,error:failure})=>{if(active){if(failure)setMiningError('Mining history is unavailable. Apply the SE2 database migration, then retry.');else setRun(data?.[0]||null);}});
    return ()=>{active=false;};
  },[]);
  const load = async (generate=false,regenerate=false) => {
    setBusy(true);setError('');
    try {setResult(await serverRequest('sales-insight',{start,end,generate,regenerate}));setRange({start,end});}
    catch(failure){setError(failure.message);}finally{setBusy(false);}
  };
  const exportRules = () => {
    const header=['Antecedent','Consequent','Support','Confidence','Lift','Source','Transactions','Dataset SHA256'];
    const rows=(run.report.rules||[]).map(rule=>[rule.antecedent_names.join(' + '),rule.consequent_names.join(' + '),rule.support,rule.confidence,rule.lift,run.source,run.transaction_count,run.report.dataset_sha256]);
    downloadText('appendix-a-association-rules.csv',[header,...rows].map(row=>row.map(csvCell).join(',')).join('\n'),'text/csv');
  };
  const a=result?.aggregates;
  const changed=range && (range.start!==start||range.end!==end);
  return <div className="page-content workflow">
    <div className="page-hero"><div><h2 className="page-title">Reports</h2><p className="page-sub">Sales performance and evidence behind menu recommendations.</p></div></div>
    <form className="workflow-controls" onSubmit={e=>{e.preventDefault();void load();}}>
      <label>From<input required type="date" value={start} max={end} onChange={e=>setStart(e.target.value)}/></label>
      <label>Through<input required type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)}/></label>
      <button className="hero-btn" disabled={busy}>{busy?'Loading…':'View period'}</button>
    </form>
    <p className="workflow-note">Dates use Philippine time. Revenue includes completed, paid bills after discounts.</p>
    {error&&<p role="alert" className="workflow-error">{error}</p>}
    {changed&&<p role="status">Dates changed. Select View period to update the report.</p>}
    {a&&<section aria-label="Period sales" className="workflow-section">
      <h3>{range.start} to {range.end}</h3>
      <dl className="workflow-metrics"><div><dt>Revenue</dt><dd>{money(a.revenue)}</dd></div><div><dt>Orders</dt><dd>{a.totalOrders}</dd></div><div><dt>Completed & paid</dt><dd>{a.completedOrders}</dd></div><div><dt>Average bill</dt><dd>{money(a.averageOrderValue)}</dd></div></dl>
      <p>Previous equal-length period: {money(a.previousRevenue)} · {a.changePercent==null?'No comparison baseline':`${a.changePercent.toFixed(1)}% change`} · Discounts and VAT exemptions: {money(a.discounts)}</p>
      <div className="workflow-controls"><h3>Sales insight</h3><button className="hero-btn hero-btn--outline" disabled={busy||changed} onClick={()=>load(true,Boolean(result.insight))}>{result.insight?'Regenerate summary':'Generate AI summary'}</button></div>
      {result.insight?<><p className="workflow-prose">{result.insight.summary}</p><p className="workflow-note">{result.insight.mode==='generative'?'AI summary from aggregated figures':'Computed summary · AI service unavailable'} · Saved {new Date(result.insight.generated_at).toLocaleString('en-PH')}. Cached figures remain unchanged until regenerated.</p></>:<p>No summary generated for this period.</p>}
      <h3>Item performance</h3>
      {a.items.length?<><div className="workflow-table"><table className="orders-table"><thead><tr><th>Item</th><th>Units sold</th><th>Gross item sales</th></tr></thead><tbody>{a.items.map(item=><tr key={item.id}><td>{item.name}</td><td>{item.quantity}</td><td>{money(item.grossRevenue)}</td></tr>)}</tbody></table></div><button className="hero-btn hero-btn--outline" onClick={()=>downloadText('item-performance.csv',[['Item','Quantity','Gross sales'],...a.items.map(i=>[i.name,i.quantity,i.grossRevenue])].map(row=>row.map(csvCell).join(',')).join('\n'),'text/csv')}>Export item performance</button></>:<p>No completed, paid orders in this period.</p>}
    </section>}
    <section className="workflow-section" aria-labelledby="mining-title"><div className="workflow-controls"><h3 id="mining-title">Mined menu associations</h3>{run&&<button className="hero-btn hero-btn--outline" onClick={exportRules}>Export Appendix A</button>}</div>
      <p>Apriori finds frequently ordered combinations. Support measures frequency, confidence measures the pairing probability, and lift must be greater than 1.</p>
      {miningError?<p role="alert" className="workflow-error">{miningError}</p>:!run?<p>No mining batch has been published yet. Recommendations will use available same-category top sellers until a batch is ready.</p>:<>
        <p><strong>{run.source==='simulated'?'Simulated validation dataset':'Historical paid orders'}</strong> · {run.transaction_count} transactions · {run.rule_count} rules · {new Date(run.created_at).toLocaleString('en-PH')}</p>
        <p className="workflow-note">Minimum support {run.report.min_support}; minimum confidence {run.report.min_confidence}; lift &gt; 1. Single-item orders count in the denominator.</p>
        {run.rule_count===0?<p>No positive associations met this batch’s thresholds. Prior rules have been retired.</p>:<div className="workflow-table"><table className="orders-table"><thead><tr><th>Antecedent</th><th>Consequent</th><th>Support</th><th>Confidence</th><th>Lift</th></tr></thead><tbody>{run.report.rules.map((rule,index)=><tr key={index}><td>{rule.antecedent_names.join(' + ')}</td><td>{rule.consequent_names.join(' + ')}</td><td>{(rule.support*100).toFixed(2)}%</td><td>{(rule.confidence*100).toFixed(2)}%</td><td>{rule.lift.toFixed(4)}</td></tr>)}</tbody></table></div>}
        <button className="hero-btn hero-btn--outline" onClick={()=>downloadText('appendix-a-mining-run.json',JSON.stringify(run.report,null,2),'application/json')}>Download batch details</button>
      </>}
    </section>
  </div>;
}
