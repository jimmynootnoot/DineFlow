# DineFlow SE2 appendix evidence

## Appendix A — Association rules

Source: **simulated validation data**. This output was computed by mlxtend.apriori, not written by hand.

10 baskets; 13 frequent itemsets; 16 rules. Minimum support 0.05, confidence 0.25, lift > 1.

Dataset SHA256: `c8f1d67ec8d68e2704ddf0528c1d4e644cf690a6287407eb0beddb6d1eb4fbea`

| Antecedent | Consequent | Support | Confidence | Lift |
|---|---|---:|---:|---:|
| Garlic Rice + Iced Tea | Pork Sisig | 0.100000 | 1.000000 | 3.3333 |
| Pork Sisig | Garlic Rice + Iced Tea | 0.100000 | 0.333333 | 3.3333 |
| Pork Sisig | Garlic Rice | 0.300000 | 1.000000 | 2.5000 |
| Chicken Sisig + Iced Tea | Plain Rice | 0.200000 | 1.000000 | 2.5000 |
| Iced Tea + Pork Sisig | Garlic Rice | 0.100000 | 1.000000 | 2.5000 |
| Plain Rice | Chicken Sisig + Iced Tea | 0.200000 | 0.500000 | 2.5000 |
| Garlic Rice | Iced Tea + Pork Sisig | 0.100000 | 0.250000 | 2.5000 |
| Garlic Rice | Pork Sisig | 0.300000 | 0.750000 | 2.5000 |
| Plain Rice | Chicken Sisig | 0.400000 | 1.000000 | 2.0000 |
| Iced Tea + Plain Rice | Chicken Sisig | 0.200000 | 1.000000 | 2.0000 |
| Chicken Sisig | Plain Rice | 0.400000 | 0.800000 | 2.0000 |
| Chicken Sisig | Iced Tea + Plain Rice | 0.200000 | 0.400000 | 2.0000 |
| Chicken Sisig + Plain Rice | Iced Tea | 0.200000 | 0.500000 | 1.2500 |
| Iced Tea | Chicken Sisig + Plain Rice | 0.200000 | 0.500000 | 1.2500 |
| Iced Tea | Plain Rice | 0.200000 | 0.500000 | 1.2500 |
| Plain Rice | Iced Tea | 0.200000 | 0.500000 | 1.2500 |

Full precision: [CSV](appendix-a-rules.csv) and [JSON](appendix-a-rules.json). For current historical results, export Appendix A from Reports after publishing a historical batch.

## Appendix B — Database schema

[Fresh-install SQL](appendix-b-schema.sql) contains tables, enums, indexes, RLS policies, validated functions, Storage policies, and optional hosted Maya sandbox records. Existing installations should apply the individual numbered migration files according to the project README.

## Appendix C — Assistant transcripts

Automated integration test, simulated restaurant knowledge; deterministic model stub. Not a live LLM transcript.

### Conversation 1

Customer: What are the Chicken Sisig ingredients?

Assistant: Chicken Sisig costs PHP 95.00. Ingredients: chicken, onion. Spice: mild.

Mode: text-retrieval. Save path exercised: true. Staff review suggested: false.

### Conversation 2

Customer: Who won the football game?

Assistant: The approved restaurant information does not contain an answer to that question. Please use Ask staff for help.

Mode: unsupported. Save path exercised: true. Staff review suggested: true.

### Conversation 3

Customer: Cancel my order and give me a discount

Assistant: That request requires restaurant staff. Use Ask staff to forward it for review. I cannot approve discounts, change orders, or provide medical, nutritional, or dietary advice.

Mode: staff-required. Save path exercised: true. Staff review suggested: true.

The database integration suite separately verifies owner-private message storage and a real escalation-to-transcript trigger. For a transcript from the deployed LLM, use the assistant's Export transcript control. No real customer conversations are bundled here.
