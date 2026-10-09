import { authenticate, endpoint, embed, generateText, httpError, readAll } from '../serverlib/platform.mjs';
import { needsStaff, lexicalKnowledge, isComboQuestion, isAllergySafetyQuestion, allergenReviewAnswer, menuKnowledge, menuKnowledgeForQuestion, menuPairingFallback, trendRecommendationAnswer, ASSISTANT_INSTRUCTIONS, STAFF_ANSWER, UNSUPPORTED_ANSWER } from '../serverlib/assistant.mjs';

const MENU_FIELDS = 'id,name,description,price,category,serving_size,prep_minutes,spice_level,ingredients,allergens,available,stock,featured';

export function createAssistantHandler({authenticateUser=authenticate,embedQuery=embed,generate=generateText}={}) {
return endpoint(async request => {
  const { db, user } = await authenticateUser(request);
  const question = typeof request.body?.question === 'string' ? request.body.question.trim() : '';
  const sessionId = request.body?.sessionId || null;
  if (!question || question.length > 500) throw httpError(400, 'Ask a question between 1 and 500 characters.');
  if (sessionId && !/^[0-9a-f-]{36}$/i.test(sessionId)) throw httpError(400, 'Invalid conversation.');
  let history = [];
  if (sessionId) {
    const { data: session } = await db.from('chat_sessions').select('id').eq('id',sessionId).eq('customer_id',user.id).maybeSingle();
    if (!session) throw httpError(404, 'Conversation not found. Start a new conversation.');
    const { data } = await db.from('chat_messages').select('role,content').eq('session_id',sessionId).order('created_at',{ ascending:false }).limit(8);
    history = (data || []).reverse();
  }
  const { data: quota, error: quotaError } = await db.rpc('consume_assistant_quota',{ p_user_id:user.id });
  if (quotaError || !quota) throw httpError(429, 'Please wait a minute before asking another question.');
  let answer, mode = 'approved-data', knowledge = [], escalationSuggested = false;
  if (needsStaff(question)) {
    answer = STAFF_ANSWER; mode = 'staff-required'; escalationSuggested = true;
  } else if (isAllergySafetyQuestion(question)) {
    const menu = await readAll(() => db.from('menu_items').select(MENU_FIELDS).eq('available',true).gt('stock',0).order('name'));
    const named = menu.find(item => item.name && question.toLowerCase().includes(item.name.toLowerCase()));
    answer = allergenReviewAnswer(named);
    knowledge = named ? menuKnowledge([named]) : [];
    mode = 'allergen-review'; escalationSuggested = true;
  } else if (/\b(status|where|ready|track)\b.*\border\b|\border\b.*\b(status|ready|track)\b/i.test(question)) {
    const { data, error } = await db.from('orders').select('order_number,status,order_type,table_number').eq('customer_id',user.id).order('created_at',{ascending:false}).limit(1);
    if (error) throw error;
    answer = data.length ? `${data[0].order_number} is ${data[0].status}.${data[0].table_number ? ` Table ${data[0].table_number}.` : ''}` : 'You do not have a recorded order yet.';
  } else if (isComboQuestion(question)) {
    const { data: rules, error: ruleError } = await db.from('recommendation_rules').select('id,antecedent_name,consequent_name,support,confidence,lift,source,run_id').not('run_id','is',null).gt('lift',1).order('lift',{ascending:false}).limit(3);
    if (ruleError) throw ruleError;
    answer = trendRecommendationAnswer(rules);
    if (answer) {
      mode = 'trend-recommendation';
      knowledge = rules.map(rule => ({ id:rule.id,content:`${rule.antecedent_name} pairs with ${rule.consequent_name}.`,metadata:{type:'apriori_rule',source:rule.source} }));
    } else {
      const menu = await readAll(() => db.from('menu_items').select(MENU_FIELDS).eq('available',true).gt('stock',0).order('name'));
      answer = menuPairingFallback(menu);
      mode = 'menu-recommendation';
      knowledge = menuKnowledgeForQuestion(question,menu);
    }
  } else {
    const menu = await readAll(() => db.from('menu_items').select(MENU_FIELDS).eq('available',true).gt('stock',0).order('name'));
    const liveMenu = menuKnowledgeForQuestion(question,menu);
    try {
      const embedding = await embedQuery(question);
      const { data, error } = await db.rpc('match_restaurant_knowledge',{ query_embedding:embedding,match_count:6 });
      if (error) throw error;
      knowledge = (data || []).filter(row => row.similarity >= 0.3);
      mode = 'rag';
      // Menu changes invalidate embeddings. Include current unindexed text so
      // approved facts remain usable before the next scheduled indexing batch.
      const unindexed = await readAll(() => db.from('restaurant_knowledge').select('id,content,metadata').is('embedding',null).order('id'));
      const fresh = lexicalKnowledge(question,unindexed);
      knowledge = [...liveMenu,...fresh,...knowledge.filter(row=>![...liveMenu,...fresh].some(item=>item.id===row.id))].slice(0,12);
      if (liveMenu.length) mode = 'menu-retrieval';
      else if (fresh.length) mode = 'text-retrieval';
    } catch {
      // Explicit degraded mode: approved text retrieval, not a claim of vector RAG.
      const rows = await readAll(() => db.from('restaurant_knowledge').select('id,content,metadata').order('id'));
      const textMatches = lexicalKnowledge(question,rows);
      knowledge = [...liveMenu,...textMatches.filter(row=>!liveMenu.some(item=>item.id===row.id))].slice(0,12);
      mode = liveMenu.length ? 'menu-retrieval' : 'text-retrieval';
    }
    if (!knowledge.length) { answer = UNSUPPORTED_ANSWER; mode = 'unsupported'; escalationSuggested = true; }
    else {
      try { answer = await generate(ASSISTANT_INSTRUCTIONS,{ question, approvedContext:knowledge.map(({id,content}) => ({id,content})),history }); }
      catch { answer = knowledge.slice(0,3).map(row => row.content).join('\n\n'); mode = 'approved-data'; }
    }
  }
  const sources = knowledge.map(row => ({ id:row.id, title:row.metadata?.type || 'Approved restaurant record' }));
  const { data: savedSession, error: saveError } = await db.rpc('append_chat_exchange',{
    p_customer_id:user.id,p_session_id:sessionId,p_question:question,p_answer:answer,p_mode:mode,p_sources:sources,
  });
  return { answer,mode,sources,escalationSuggested,sessionId:savedSession || sessionId,saved:!saveError };
});
}
export default createAssistantHandler();
