import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../ui/Icon';
import { askAssistant, loadConversation, exportConversation } from '../../services/assistantService';
import { downloadText } from '../../services/platformService';
import { createEscalation } from '../../services/escalationService';

const STARTERS = ['What can I get under ₱100?', 'Which dishes contain allergens?', 'What is my order status?'];

export default function AssistantPanel({ menu, orders, user }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', text: 'Ask me about the menu, ingredients, budget, portions, availability, or your order status.', mode: 'approved menu' }]);
  const [loading, setLoading] = useState(false);
  const [sessionId,setSessionId] = useState(null);
  const [historyLoading,setHistoryLoading] = useState(true);
  const [historyNotice,setHistoryNotice] = useState('');
  const [escalating,setEscalating] = useState(false);
  useEffect(()=>{
    let active=true;
    loadConversation(user.id).then(result=>{if(active){setSessionId(result.sessionId);if(result.messages.length)setMessages(result.messages);}})
      .catch(()=>{if(active)setHistoryNotice('Saved history is unavailable. New answers will show whether they were saved.');})
      .finally(()=>{if(active)setHistoryLoading(false);});
    return()=>{active=false;};
  },[user.id]);
  const exportTranscript=async()=>{
    try {
      const saved=sessionId?await exportConversation(sessionId):[];
      downloadText('appendix-c-conversation.json',JSON.stringify({sessionId,savedMessages:saved,unsavedMessages:messages.filter(message=>message.saved===false)},null,2),'application/json');
    }catch(error){toast.error(error.message);}
  };

  const ask = async (value = question) => {
    const clean = value.trim();
    if (!clean || loading || historyLoading || escalating) return;
    setMessages((previous) => [...previous, { role: 'user', text: clean, saved:false }]);
    setQuestion('');
    setLoading(true);
    const result = await askAssistant({ question: clean, menu, orders, sessionId });
    setSessionId(result.sessionId);
    setMessages((previous) => [...previous.slice(0,-1), {...previous[previous.length-1],saved:result.saved}, { role: 'assistant', text: result.answer, mode: result.mode, sources:result.sources, saved:result.saved }]);
    setHistoryNotice(result.saved?'':'This exchange was not saved to the database. It is included as unsaved in the transcript export.');
    setLoading(false);
  };

  const escalate = async () => {
    if(escalating)return;
    setEscalating(true);
    const lastQuestion = [...messages].reverse().find((message) => message.role === 'user')?.text || 'Customer requested staff assistance.';
    try {
      const request=await createEscalation({ customerId: user.id, sessionId, requestType: 'customer-assistance', message: lastQuestion });
      toast.success('A staff request was created.');
      setMessages(previous=>[...previous,{role:'assistant',text:`Your request was forwarded to staff for review. Reference: ${request.id}`,mode:'staff-escalation',saved:Boolean(sessionId)}]);
    } catch (error) { toast.error(error.message); }
    finally {setEscalating(false);}
  };

  return (
    <div className={`assistant ${open ? 'assistant--open' : ''}`}>
      {open && (
        <section className="assistant__panel" aria-label="DineFlow menu assistant">
          <header className="assistant__head">
            <div><span className="assistant__eyebrow">Grounded assistant</span><h2>DineFlow Guide</h2></div>
            <button className="assistant__close" onClick={() => setOpen(false)} aria-label="Close assistant"><Icon name="x" /></button>
          </header>
          <div className="assistant__starters"><button disabled={loading||historyLoading||escalating} onClick={()=>{setSessionId(null);setMessages([{role:'assistant',text:'New conversation. Ask about the approved menu.'}]);setHistoryNotice('');}}>New conversation</button><button onClick={exportTranscript}>Export transcript</button></div>
          {historyNotice&&<p className="session-note" role="status">{historyNotice}</p>}
          <div className="assistant__messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={index} className={`assistant__message assistant__message--${message.role}`}>
                <p>{message.text}</p>
                {message.mode && <span>{message.mode === 'rag' ? 'AI · vector RAG' : message.mode === 'text-retrieval' ? 'AI · approved text retrieval' : message.mode}{message.saved===false?' · not saved':''}</span>}
              </div>
            ))}
            {loading && <div className="assistant__message assistant__message--assistant"><p>Checking the approved menu…</p></div>}
          </div>
          {messages.length === 1 && <div className="assistant__starters">{STARTERS.map((starter) => <button key={starter} onClick={() => ask(starter)}>{starter}</button>)}</div>}
          <div className="assistant__composer">
            <label className="sr-only" htmlFor="assistant-question">Ask about the restaurant</label>
            <textarea id="assistant-question" rows={2} maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(); } }}
              placeholder="Ask about a dish or your order" />
            <button className="assistant__send" onClick={() => ask()} disabled={!question.trim() || loading || historyLoading || escalating} aria-label="Send question"><Icon name="arrowRight" /></button>
          </div>
          <button className="assistant__escalate" disabled={escalating||loading||historyLoading} onClick={escalate}>{escalating?'Forwarding…':'Ask staff for approval or help'}</button>
          <p className="assistant__boundary">The assistant cannot place, change, cancel, or pay for orders.</p>
        </section>
      )}
      <button className="assistant__trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Icon name={open ? 'x' : 'message'} size={19} /><span>{open ? 'Close' : 'Ask DineFlow'}</span>
      </button>
    </div>
  );
}
