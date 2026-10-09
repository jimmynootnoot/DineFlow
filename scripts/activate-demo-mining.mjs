// One-time presentation recovery when the remote publish RPC still uses an
// unrestricted DELETE. Normal future batches should use mine_recommendations.py.
import { readFile } from 'node:fs/promises';
import { serviceClient } from '../serverlib/platform.mjs';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Pass the generated appendix-a-rules.json path.');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
if (report.source !== 'simulated' || report.transaction_count < 5 || !Array.isArray(report.rules) || !report.rules.length) {
  throw new Error('Only a nonempty, labeled simulated batch with at least five baskets can be activated.');
}

const db = serviceClient();
const { count: runCount, error: runReadError } = await db.from('recommendation_runs').select('id', { count: 'exact', head: true });
if (runReadError) throw runReadError;
if (runCount !== 0) throw new Error('A published batch already exists. Use the normal atomic publisher instead.');

const { data: menu, error: menuError } = await db.from('menu_items').select('id,name');
if (menuError) throw menuError;
const names = new Map(menu.map((item) => [item.id, item.name]));
for (const rule of report.rules) {
  if (!(Number(rule.lift) > 1) || !rule.antecedent?.length || !rule.consequent?.length) throw new Error('The report contains an invalid rule.');
  for (const id of [...rule.antecedent, ...rule.consequent]) {
    if (!names.has(id)) throw new Error(`The menu no longer contains item ${id}. Regenerate the batch.`);
  }
}

let runId;
try {
  const { data: run, error: insertRunError } = await db.from('recommendation_runs').insert({
    source: 'simulated', transaction_count: report.transaction_count,
    rule_count: report.rules.length, report,
  }).select('id').single();
  if (insertRunError) throw insertRunError;
  runId = run.id;

  const ruleRows = report.rules.map((rule) => ({
    antecedent_name: rule.antecedent.join(' + '),
    consequent_name: rule.consequent.join(' + '),
    antecedent: rule.antecedent.map((id) => names.get(id)),
    consequent: rule.consequent.map((id) => names.get(id)),
    antecedent_ids: rule.antecedent,
    consequent_ids: rule.consequent,
    support: rule.support, confidence: rule.confidence, lift: rule.lift,
    source: 'simulated', run_id: runId,
  }));
  const { data: inserted, error: insertRulesError } = await db.from('recommendation_rules')
    .insert(ruleRows).select('id,antecedent_ids,consequent_ids');
  if (insertRulesError) throw insertRulesError;
  if (inserted.length !== ruleRows.length) throw new Error('Not all rules were inserted.');

  const itemRows = inserted.flatMap((rule) => [
    ...rule.antecedent_ids.map((id) => ({ rule_id: rule.id, menu_item_id: id, side: 'antecedent' })),
    ...rule.consequent_ids.map((id) => ({ rule_id: rule.id, menu_item_id: id, side: 'consequent' })),
  ]);
  const { error: insertItemsError } = await db.from('recommendation_rule_items').insert(itemRows);
  if (insertItemsError) throw insertItemsError;

  const [{ count: savedRules, error: rulesCheckError }, { count: savedItems, error: itemsCheckError }] = await Promise.all([
    db.from('recommendation_rules').select('id', { count: 'exact', head: true }).eq('run_id', runId),
    db.from('recommendation_rule_items').select('rule_id', { count: 'exact', head: true }).in('rule_id', inserted.map((rule) => rule.id)),
  ]);
  if (rulesCheckError || itemsCheckError || savedRules !== inserted.length || savedItems !== itemRows.length) {
    throw rulesCheckError || itemsCheckError || new Error('Saved rule counts did not match the batch.');
  }
  console.log(`Activated simulated mining batch ${runId}: ${savedRules} rules and ${savedItems} item links.`);
} catch (error) {
  if (runId) {
    const { error: rulesCleanupError } = await db.from('recommendation_rules').delete().eq('run_id', runId);
    const { error: runCleanupError } = await db.from('recommendation_runs').delete().eq('id', runId);
    if (rulesCleanupError || runCleanupError) {
      throw new Error(`Activation failed: ${error.message}. Cleanup also failed; inspect batch ${runId} before retrying.`);
    }
  }
  throw error;
}
