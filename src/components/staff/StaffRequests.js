import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../ui/Icon';
import { getEscalations, updateEscalation } from '../../services/escalationService';
import { supabase } from '../../services/supabase';

export default function StaffRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try { setRequests(await getEscalations()); }
    catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void refresh();
    const channel=supabase.channel('staff-escalations-live').on('postgres_changes',{event:'*',schema:'public',table:'staff_escalations'},refresh).subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  }, []);
  const resolve = async (id) => {
    try { await updateEscalation(id, 'resolved', 'Reviewed by restaurant staff.'); await refresh(); toast.success('Request resolved.'); }
    catch (error) { toast.error(error.message); }
  };
  return (
    <div className="page-content">
      <div className="page-hero"><div><h2 className="page-title">Staff Requests</h2><p className="page-sub">Human approval queue for requests the assistant cannot perform</p></div><button className="hero-btn hero-btn--outline" onClick={refresh}>Refresh requests</button></div>
      <div className="card requests-list">
        {loading ? <p className="table-empty">Loading requests…</p> : requests.length === 0 ? <div className="card-empty"><Icon name="check" size={22} /><p>No requests need review.</p></div> : requests.map((request) => (
          <article className="request-row" key={request.id}>
            <div><p className="request-row__type">{request.requestType}</p><h3>{request.message}</h3><small>{new Date(request.createdAt).toLocaleString('en-PH')}</small></div>
            <div className="request-row__actions"><span className={`tag tag--${request.status === 'resolved' ? 'completed' : 'pending'}`}>{request.status}</span>{request.status !== 'resolved' && <button className="tbl-btn tbl-btn--green" onClick={() => resolve(request.id)}>Resolve</button>}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
