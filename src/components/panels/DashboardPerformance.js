import { useEffect, useState } from 'react';
import { serverRequest } from '../../services/platformService';
import './DashboardPerformance.css';

const todayInManila = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const money = (value) => `₱${Number(value || 0).toFixed(2)}`;

export default function DashboardPerformance({ orders }) {
  const [draftStart, setDraftStart] = useState(() => `${todayInManila().slice(0, 7)}-01`);
  const [draftEnd, setDraftEnd] = useState(todayInManila);
  const [period, setPeriod] = useState(() => ({ start: `${todayInManila().slice(0, 7)}-01`, end: todayInManila() }));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    serverRequest('sales-insight', period).then((data) => {
      if (active) setResult(data);
    }).catch((failure) => {
      if (active) { setResult(null); setError(failure.message || 'The sales period could not be loaded.'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, orders]);

  const applyPeriod = (event) => {
    event.preventDefault();
    if (draftStart > draftEnd) { setError('The start date must be on or before the end date.'); return; }
    setPeriod({ start: draftStart, end: draftEnd });
  };

  const generate = async () => {
    setGenerating(true);
    setError('');
    try {
      const data = await serverRequest('sales-insight', {
        ...period, generate: true, regenerate: Boolean(result?.insight),
      });
      setResult(data);
    } catch (failure) {
      setError(failure.message || 'The summary could not be generated. Try again.');
    } finally { setGenerating(false); }
  };

  const aggregates = result?.aggregates;
  const periodChanged = draftStart !== period.start || draftEnd !== period.end;
  const topSellers = aggregates?.items?.slice(0, 5) || [];

  return <section className="dashboard-performance" aria-label="Management sales performance">
    <form className="dashboard-period" onSubmit={applyPeriod}>
      <div className="dashboard-period__heading">
        <h3>Sales performance</h3>
        <p>Choose a period for every figure and the insight below.</p>
      </div>
      <label>From<input required type="date" value={draftStart} max={draftEnd} onChange={(event) => setDraftStart(event.target.value)} /></label>
      <label>Through<input required type="date" value={draftEnd} min={draftStart} onChange={(event) => setDraftEnd(event.target.value)} /></label>
      <button type="submit" className="hero-btn" disabled={loading || generating}>View period</button>
    </form>
    {periodChanged && <p className="dashboard-performance__note" role="status">Dates changed. Select View period to update the figures.</p>}
    {error && <p className="dashboard-performance__error" role="alert">{error}</p>}
    {loading && <p className="dashboard-performance__note" role="status">Loading sales for {period.start} to {period.end}…</p>}
    {aggregates && !loading && <>
      <p className="dashboard-performance__note">{period.start} to {period.end} · Philippine time · Revenue and average bill use completed, paid orders.</p>
      {aggregates.demoOrderCount > 0 && <p className="dashboard-performance__demo" role="note">Includes {aggregates.demoOrderCount} demonstration order{aggregates.demoOrderCount === 1 ? '' : 's'} in this period. Do not present these figures as live restaurant performance.</p>}
      <div className="dash-cards dashboard-performance__metrics">
        {[
          { label: 'Net revenue', value: money(aggregates.revenue), sub: 'completed, paid bills' },
          { label: 'Orders placed', value: aggregates.totalOrders, sub: 'all statuses in period' },
          { label: 'Average order value', value: aggregates.completedOrders ? money(aggregates.averageOrderValue) : '—', sub: `${aggregates.completedOrders} completed and paid` },
          { label: 'Revenue change', value: aggregates.changePercent == null ? '—' : `${aggregates.changePercent > 0 ? '+' : ''}${aggregates.changePercent.toFixed(1)}%`, sub: 'vs. previous equal-length period' },
        ].map((metric) => <div key={metric.label} className="dash-card"><div className="dash-card__label">{metric.label}</div><div className="dash-card__val">{metric.value}</div><div className="dash-card__sub">{metric.sub}</div></div>)}
      </div>
      <div className="dashboard-performance__evidence">
        <div className="card ai-insight">
          <div className="card-head"><h3 className="card-title">Sales insight</h3><button type="button" className="hero-btn hero-btn--outline" onClick={generate} disabled={generating || loading || periodChanged}>{generating ? 'Generating…' : result.insight ? 'Regenerate summary' : 'Generate AI summary'}</button></div>
          {result.insight ? <><p>{result.insight.summary}</p><small>{result.insight.mode === 'generative' ? 'AI summary from aggregated figures' : 'Computed summary · AI service unavailable'} · Saved {new Date(result.insight.generated_at).toLocaleString('en-PH')}</small></> : <p>{result.stale ? 'The saved summary no longer matches these sales figures. Generate a new summary.' : 'No summary generated for this period.'}</p>}
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">Top-selling items</h3></div>
          {topSellers.length ? <ol className="top-sellers">{topSellers.map((item, index) => <li key={item.id || item.name}><span className="ts-rank">{index + 1}</span><span className="ts-name">{item.name}</span><span className="ts-val">{item.quantity} sold</span></li>)}</ol> : <p className="dashboard-performance__note">No completed, paid item sales in this period.</p>}
        </div>
      </div>
    </>}
  </section>;
}
