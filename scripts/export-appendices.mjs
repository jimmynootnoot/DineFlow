import { mkdir,readFile,writeFile,copyFile } from 'node:fs/promises';
const out='docs/appendices/generated';
await mkdir(out,{recursive:true});
const files=['dineflow-setup.sql','multi-method-payments.sql','se2-01-roles.sql','se2-02-workflows.sql','se2-03-storage.sql','se2-04-maya.sql'];
const parts=[];
for(const file of files){parts.push(`-- SOURCE: supabase/${file}\n${await readFile(`supabase/${file}`,'utf8')}`);await copyFile(`supabase/${file}`,`${out}/${file}`);}
// The bootstrap group commits the enum extension before its first use.
const sql=`-- Appendix B: fresh-install schema. For an existing database use the\n-- numbered SE2 files individually as documented in README.md.\nBEGIN;\n${parts.slice(0,3).join('\n\n')}\nCOMMIT;\n${parts.slice(3).join('\n\n')}\n`;
await writeFile(`${out}/appendix-b-schema.sql`,sql);
const rules=JSON.parse(await readFile(`${out}/appendix-a-rules.json`,'utf8'));
const transcripts=JSON.parse(await readFile(`${out}/appendix-c-test-conversations.json`,'utf8'));
const escape=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
const table=['| Antecedent | Consequent | Support | Confidence | Lift |','|---|---|---:|---:|---:|',...rules.rules.map(rule=>`| ${escape(rule.antecedent_names.join(' + '))} | ${escape(rule.consequent_names.join(' + '))} | ${rule.support.toFixed(6)} | ${rule.confidence.toFixed(6)} | ${rule.lift.toFixed(4)} |`)].join('\n');
const text=`# DineFlow SE2 appendix evidence\n\n## Appendix A — Association rules\n\nSource: **${rules.source} validation data**. This output was computed by ${rules.algorithm}, not written by hand.\n\n${rules.transaction_count} baskets; ${rules.frequent_itemset_count} frequent itemsets; ${rules.rule_count} rules. Minimum support ${rules.min_support}, confidence ${rules.min_confidence}, lift > 1.\n\nDataset SHA256: \`${rules.dataset_sha256}\`\n\n${table}\n\nFull precision: [CSV](appendix-a-rules.csv) and [JSON](appendix-a-rules.json). For current historical results, export Appendix A from Reports after publishing a historical batch.\n\n## Appendix B — Database schema\n\n[Fresh-install SQL](appendix-b-schema.sql) contains tables, enums, indexes, RLS policies, validated functions, Storage policies, and optional hosted Maya sandbox records. Existing installations should apply the individual numbered migration files according to the project README.\n\n## Appendix C — Assistant transcripts\n\n${transcripts.source}\n\n${transcripts.transcripts.map((item,index)=>`### Conversation ${index+1}\n\nCustomer: ${item.question}\n\nAssistant: ${item.answer}\n\nMode: ${item.mode}. Save path exercised: ${item.saved}. Staff review suggested: ${Boolean(item.escalationSuggested)}.`).join('\n\n')}\n\nThe database integration suite separately verifies owner-private message storage and a real escalation-to-transcript trigger. For a transcript from the deployed LLM, use the assistant's Export transcript control. No real customer conversations are bundled here.\n`;
await writeFile(`${out}/APPENDICES.md`,text);
console.log(`Appendix package written to ${out}/APPENDICES.md`);
