import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabase';
import { serverRequest, downloadText, csvCell } from '../../services/platformService';
import './WorkflowPanels.css';

const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money = value => `₱${Number(value||0).toFixed(2)}`;
const percent = value => `${(Number(value||0)*100).toFixed(2)}%`;
const ruleKey = rule => `${(rule.antecedent_names||[]).join('|')}=>${(rule.consequent_names||[]).join('|')}`;
const trendLabel = value => value>0?`+${value}`:`${value}`;

export default function ResearchReportsV2() {
  const [start,setStart] = useState(()=>`${today().slice(0,7)}-01`);
  const [end,setEnd] = useState(today);
  const [result,setResult] = useState(null);
  const [runs,setRuns] = useState([]);
  const [error,setError] = useState('');
  const [miningError,setMiningError] = useState('');
  const [busy,setBusy] = useState(false);
  const [range,setRange] = useState(null);

  useEffect(()=>{
    let active=true;
    supabase.from('recommendation_runs').select('*').order('created_at',{ascending:false}).limit(2)
      .then(({data,error:failure})=>{
        if(!active)return;
        if(failure)setMiningError('Mining history is unavailable. Apply the SE2 database migration, then retry.');
        else setRuns(data||[]);
      });
    return ()=>{active=false;};
  },[]);

  const load = async (generate=false,regenerate=false) => {
    setBusy(true);setError('');
    try {setResult(await serverRequest('sales-insight',{start,end,generate,regenerate}));setRange({start,end});}
    catch(failure){setError(failure.message);}finally{setBusy(false);}
  };

  useEffect(()=>{ void load(); },[]); // Initial current-month report; later date changes stay explicit.

  const run=runs[0]||null;
  const previousRun=runs[1]||null;
  const rules=Array.isArray(run?.report?.rules)?run.report.rules:[];
  const previousRules=useMemo(()=>new Map((previousRun?.report?.rules||[]).map(rule=>[ruleKey(rule),rule])),[previousRun]);
  const strongestRule=rules[0]||null;
  const a=result?.aggregates;
  const demandByName=new Map((a?.itemTrends||[]).map(item=>[String(item.name).toLowerCase(),item]));
  const changed=range && (range.start!==start||range.end!==end);
  const topTrends=(a?.itemTrends||[]).slice(0,6);
  const trendMax=Math.max(1,...topTrends.flatMap(item=>[item.quantity,item.previousQuantity]));

  const exportRules = () => {
    if(!run)return;
    const header=['Antecedent','Consequent','Support','Confidence','Lift','Source','Transactions','Dataset SHA256'];
    const rows=rules.map(rule=>[(rule.antecedent_names||[]).join(' + '),(rule.consequent_names||[]).join(' + '),rule.support,rule.confidence,rule.lift,run.source,run.transaction_count,run.report.dataset_sha256]);
    downloadText('appendix-a-association-rules.csv',[header,...rows].map(row=>row.map(csvCell).join(',')).join('\n'),'text/csv');
  };

  return <div className="page-content workflow research-report">
    <div className="page-hero"><div><p className="page-eyebrow">Decision intelligence</p><h2 className="page-title">Sales & Recommendation Report</h2><p className="page-sub">See which dishes are trending, how Apriori finds meaningful combinations, and why each recommendation is shown.</p></div></div>

    <form className="workflow-controls report-period-controls" onSubmit={e=>{e.preventDefault();void load();}}>
      <label>From<input required type="date" value={start} max={end} onChange={e=>setStart(e.target.value)}/></label>
      <label>Through<input required type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)}/></label>
      <button className="hero-btn" disabled={busy}>{busy?'Loading…':'View period'}</button>
    </form>
    <p className="workflow-note">Dates use Philippine time. Revenue includes completed, paid bills after discounts. Trends compare against the immediately preceding equal-length period.</p>
    {error&&<p role="alert" className="workflow-error">{error}</p>}
    {changed&&<p role="status" className="report-status">Dates changed. Select View period to update the report.</p>}

    {a&&<>
      <section aria-labelledby="period-title" className="workflow-section report-section">
        <div className="report-section__heading"><div><p className="report-kicker">Period performance</p><h3 id="period-title">{range.start} to {range.end}</h3></div><span className={`report-change ${a.changePercent>0?'is-up':a.changePercent<0?'is-down':'is-flat'}`}>{a.changePercent==null?'No prior baseline':`${a.changePercent>0?'+':''}${a.changePercent.toFixed(1)}% revenue`}</span></div>
        <dl className="workflow-metrics report-metrics"><div><dt>Net revenue</dt><dd>{money(a.revenue)}</dd></div><div><dt>Orders</dt><dd>{a.totalOrders}</dd></div><div><dt>Completed & paid</dt><dd>{a.completedOrders}</dd></div><div><dt>Average bill</dt><dd>{a.completedOrders?money(a.averageOrderValue):'—'}</dd></div></dl>
        {a.demoOrderCount>0&&<p className="workflow-note" role="note">This period includes {a.demoOrderCount} demonstration order{a.demoOrderCount===1?'':'s'}. Do not present these figures as live-only restaurant performance.</p>}
        <p className="workflow-note">Previous period revenue: {money(a.previousRevenue)} · Discounts and VAT exemptions: {money(a.discounts)}</p>

        <div className="report-subsection">
          <div className="workflow-controls"><div><p className="report-kicker">Demand narrative</p><h3>Sales insight</h3></div><button type="button" className="hero-btn hero-btn--outline" disabled={busy||changed} onClick={()=>load(true,Boolean(result.insight))}>{result.insight?'Regenerate summary':'Generate AI summary'}</button></div>
          {result.insight?<><p className="workflow-prose report-insight">{result.insight.summary}</p><p className="workflow-note">{result.insight.mode==='generative'?'AI summary from aggregated figures':'Computed summary · AI service unavailable'} · Saved {new Date(result.insight.generated_at).toLocaleString('en-PH')}. The summary is hidden when its saved figures no longer match this period.</p></>:<p>{result.stale?'The saved summary no longer matches the current sales figures. Generate a new summary.':'No summary generated for this period.'}</p>}
        </div>
      </section>

      <section aria-labelledby="trend-title" className="workflow-section report-section">
        <div className="report-section__heading"><div><p className="report-kicker">Equal-period comparison</p><h3 id="trend-title">Menu demand trends</h3></div><span className="report-evidence-badge">Observed units only</span></div>
        <p className="report-section__intro">The largest unit changes help management interpret which menu combinations may be gaining or losing relevance. They do not replace Apriori support, confidence, or lift.</p>
        {topTrends.length?<div className="trend-list">{topTrends.map(item=><article className="trend-row" key={item.id}>
          <div className="trend-row__heading"><strong>{item.name}</strong><span className={`trend-delta is-${item.trend}`}>{item.trend==='new'?'New':`${trendLabel(item.quantityChange)} units`}</span></div>
          <div className="trend-bars" aria-label={`${item.name}: ${item.quantity} units current, ${item.previousQuantity} previous`}>
            <div><span>Current</span><i style={{width:`${item.quantity/trendMax*100}%`}}/><b>{item.quantity}</b></div>
            <div><span>Previous</span><i style={{width:`${item.previousQuantity/trendMax*100}%`}}/><b>{item.previousQuantity}</b></div>
          </div>
        </article>)}</div>:<p>No item trend comparison is available for this period.</p>}
      </section>

      <section aria-labelledby="items-title" className="workflow-section report-section">
        <div className="report-section__heading"><div><p className="report-kicker">Dish-level evidence</p><h3 id="items-title">Item performance</h3></div>{a.items.length>0&&<button type="button" className="hero-btn hero-btn--outline" onClick={()=>downloadText('item-performance.csv',[['Item','Current quantity','Previous quantity','Unit change','Gross sales'],...a.items.map(i=>[i.name,i.quantity,i.previousQuantity,i.quantityChange,i.grossRevenue])].map(row=>row.map(csvCell).join(',')).join('\n'),'text/csv')}>Export item performance</button>}</div>
        {a.items.length?<div className="workflow-table"><table className="orders-table report-table"><thead><tr><th>Item</th><th className="num">Current units</th><th className="num">Previous units</th><th className="num">Change</th><th className="num">Gross item sales</th></tr></thead><tbody>{a.items.map(item=><tr key={item.id}><td>{item.name}</td><td className="num">{item.quantity}</td><td className="num">{item.previousQuantity}</td><td className={`num report-table__delta ${item.quantityChange>0?'is-up':item.quantityChange<0?'is-down':'is-flat'}`}>{trendLabel(item.quantityChange)}</td><td className="num">{money(item.grossRevenue)}</td></tr>)}</tbody></table></div>:<p>No completed, paid orders in this period.</p>}
      </section>
    </>}

    <section className="workflow-section report-section mining-report" aria-labelledby="mining-title">
      <div className="report-section__heading"><div><p className="report-kicker">Association-rule evidence</p><h3 id="mining-title">Apriori recommendation report</h3></div>{run&&<div className="report-actions"><button type="button" className="hero-btn hero-btn--outline" onClick={exportRules}>Export rules CSV</button><button type="button" className="hero-btn hero-btn--outline" onClick={()=>downloadText('appendix-a-mining-run.json',JSON.stringify(run.report,null,2),'application/json')}>Download batch JSON</button></div>}</div>
      <p className="report-section__intro">Apriori identifies dishes that repeatedly appear in the same paid order. A recommendation is eligible only when the full left-hand combination is already in the cart, the suggested dish is available, and lift is greater than 1.</p>

      <ol className="mining-process" aria-label="Apriori mining process">
        <li><span>01</span><div><strong>Prepare baskets</strong><p>Use unique menu-item presence from each eligible completed and paid order.</p></div></li>
        <li><span>02</span><div><strong>Find frequent sets</strong><p>Keep itemsets appearing in at least {percent(run?.report?.min_support??0.05)} of eligible baskets.</p></div></li>
        <li><span>03</span><div><strong>Generate rules</strong><p>Require at least {percent(run?.report?.min_confidence??0.25)} confidence and a maximum itemset length of {run?.report?.max_length||3}.</p></div></li>
        <li><span>04</span><div><strong>Reject coincidence</strong><p>Publish only positive associations with lift greater than {run?.report?.min_lift_exclusive||1}.</p></div></li>
        <li><span>05</span><div><strong>Rank recommendations</strong><p>Sort by lift, confidence, then support; exclude unavailable and already selected dishes.</p></div></li>
      </ol>

      {miningError?<p role="alert" className="workflow-error">{miningError}</p>:!run?<div className="report-empty"><h4>No published mining batch yet</h4><p>Apriori results appear after an authorized mining run is published. Until then, cart recommendations use actual same-category best sellers when available. This state does not imply that the database has too few orders.</p></div>:<>
        <div className={`mining-provenance ${run.source==='simulated'?'is-simulated':'is-historical'}`}>
          <div><span className={`report-evidence-badge ${run.source==='simulated'?'is-simulated':'is-historical'}`}>{run.source==='simulated'?'Validation mode':'Historical evidence'}</span><strong>{run.source==='simulated'?'Simulated transactions — not production demand':'Completed, paid historical orders'}</strong></div>
          <p>Published {new Date(run.created_at).toLocaleString('en-PH')} · Dataset fingerprint {String(run.report.dataset_sha256||'unavailable').slice(0,12)}…</p>
        </div>

        <dl className="mining-metrics">
          <div><dt>Eligible baskets</dt><dd>{run.transaction_count}</dd><small>single-item orders included</small></div>
          <div><dt>Frequent itemsets</dt><dd>{run.report.frequent_itemset_count||0}</dd><small>passed minimum support</small></div>
          <div><dt>Positive rules</dt><dd>{run.rule_count}</dd><small>lift greater than 1</small></div>
          <div><dt>Strongest lift</dt><dd>{strongestRule?Number(strongestRule.lift).toFixed(2):'—'}</dd><small>{strongestRule?'top ranked association':'no qualifying rule'}</small></div>
        </dl>

        {previousRun?<p className="workflow-note mining-comparison-note">Trend baseline: batch from {new Date(previousRun.created_at).toLocaleString('en-PH')}. {previousRun.report?.dataset_sha256===run.report.dataset_sha256?'Both runs use the same dataset fingerprint, so rule movement should be flat.':'Rule movement reflects changed basket evidence or thresholds.'}</p>:<p className="workflow-note mining-comparison-note">This is the first available batch, so rule-level trend deltas are marked as new.</p>}

        {run.rule_count===0?<div className="report-empty"><h4>No positive associations passed</h4><p>Prior rules were retired. Collect more completed, paid orders or review thresholds before the next controlled mining run.</p></div>:<>
          <div className="rule-highlights">{rules.slice(0,3).map((rule,index)=>{
            const prior=previousRules.get(ruleKey(rule));
            const liftDelta=prior?Number(rule.lift)-Number(prior.lift):null;
            const demand=demandByName.get(String(rule.consequent_names?.[0]||'').toLowerCase());
            const demandText=!a?'Load a sales period to add demand context.':!demand?'No sales recorded in either compared period.':demand.trend==='new'?`New demand: ${demand.quantity} units in this period.`:`Demand ${demand.quantityChange>0?'rose':demand.quantityChange<0?'fell':'held steady'} by ${Math.abs(demand.quantityChange)} unit${Math.abs(demand.quantityChange)===1?'':'s'} versus the previous period.`;
            return <article key={ruleKey(rule)}><span className="rule-rank">#{index+1}</span><p className="report-kicker">Recommended pairing</p><h4>{(rule.antecedent_names||[]).join(' + ')} <span>→</span> {(rule.consequent_names||[]).join(' + ')}</h4><p>Appears in {percent(rule.support)} of baskets; {percent(rule.confidence)} of qualifying baskets also include the recommendation.</p><p className="rule-demand-context">{demandText}</p><dl><div><dt>Lift</dt><dd>{Number(rule.lift).toFixed(2)}×</dd></div><div><dt>Vs previous</dt><dd className={liftDelta>0?'is-up':liftDelta<0?'is-down':'is-flat'}>{liftDelta==null?'New rule':`${liftDelta>0?'+':''}${liftDelta.toFixed(2)}`}</dd></div></dl></article>;
          })}</div>

          <div className="workflow-table"><table className="orders-table report-table mining-table"><thead><tr><th>Cart contains</th><th>Recommend</th><th className="num">Support</th><th className="num">Confidence</th><th className="num">Lift</th><th>Lift trend</th></tr></thead><tbody>{rules.map(rule=>{
            const prior=previousRules.get(ruleKey(rule));
            const delta=prior?Number(rule.lift)-Number(prior.lift):null;
            return <tr key={ruleKey(rule)}><td>{(rule.antecedent_names||[]).join(' + ')}</td><td>{(rule.consequent_names||[]).join(' + ')}</td><td className="num">{percent(rule.support)}</td><td className="num">{percent(rule.confidence)}</td><td className="num">{Number(rule.lift).toFixed(4)}</td><td><span className={`rule-trend ${delta>0?'is-up':delta<0?'is-down':'is-flat'}`}>{delta==null?'New':`${delta>0?'+':''}${delta.toFixed(4)}`}</span></td></tr>;
          })}</tbody></table></div>
        </>}

        <p className="workflow-note report-caveat">Interpretation guardrail: association is not causation. Simulated runs validate the pipeline only; historical runs reflect observed co-purchases and do not guarantee future demand.</p>
      </>}
    </section>
  </div>;
}
