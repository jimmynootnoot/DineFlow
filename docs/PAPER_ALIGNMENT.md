# Paper alignment and verification

Authority: the user's supplied `DineFlow_AI_SE2_Documentation (1).pdf` (29 pages). Text inside the paper is treated as product requirements and evidence; placeholders such as “paste diagram here” do not authorize changes to the PDF itself. The paper has not been edited.

| Requirement | Implemented path | Verification / limits |
|---|---|---|
| Chapter 2: React 19, Vite, Tailwind | Vite development/build, Tailwind utilities, existing React/style system | Production build; React Scripts retained for Jest only |
| Chapters 2/5: Supabase and pgvector | Existing Supabase authority plus numbered SE2 migrations | Clean install + repeatable migration on isolated PostgreSQL/pgvector; remote activation pending |
| Chapters 3/5: roles and eleven data entities | `profiles` + `auth.users`, `categories`, `menu_items`, `dining_tables`, `orders`, `order_items`, `payments`, `chat_sessions`, `chat_messages`, `recommendation_rules`, `restaurant_knowledge` | Physical table names are compatible with the existing app; additional run/audit/limit tables support operation |
| Role assignment / settings | Administration, server-validated `assign_user_role`, settings RLS | New registrations remain customers; metadata cannot grant roles |
| Menu/category/pricing/photos | Menu editor; category synchronization; Supabase dish image upload | Only management/admin can mutate; image bucket migration supplied |
| Cart, quantities, remarks | Existing customer/POS cart; aggregated stock validation | Zero/fractional quantities rejected; duplicate lines cannot oversell; historical prices/subtotals retained |
| Table sessions/QR | Tables & QR screen; authenticated token resolver; server validation | Independent QR decoder succeeds for short and long links; occupancy derives from active orders |
| UC-01 / UC-03: status and kitchen routing | confirmed → preparing → ready → served → completed | Legacy pending rows translated; role/state checks in SQL; realtime retained |
| UC-05: billing/discount/change | Staff billing controls, numeric SQL totals, recorded tender/change | Staff verifies eligible share; tests cover VAT-exempt net base and discount; paid/cancelled bills protected |
| Maya sandbox | Hosted sandbox creation, verified retrieval, webhook, idempotent settlement; separate local simulation when keys absent | No production endpoint; provider credential activation and external testing pending |
| UC-02: RAG and grounding | Server orchestration, embedding + pgvector retrieval, current unindexed text fallback | Distinct modes exposed; zero indexed vectors/no embedding key in connected project at read-only check |
| UC-02 / Appendix C: chat history | Server-only append function, owner RLS, history restore, full transcript export | Private cross-customer access tested; generated examples are labeled test conversations |
| Escalation | Staff request insert + linked transcript trigger, realtime queue | Staff makes business decisions; assistant never mutates orders/payments |
| Chapter 5 / Appendix A: Apriori | Python mlxtend batch, pagination, binary baskets, stable IDs, combinations, support/confidence/lift, atomic snapshots | Four numerical tests; reproducible 10-basket simulation yields 16 rules; historical dataset remains untouched |
| UC-01 fallback | Stored-rule server endpoint, otherwise actual top sellers in the same category | No arbitrary “contextual” pairings presented as mining |
| UC-04: AI sales summary | Philippine date ranges, server aggregation, on-demand LLM, persisted range cache | Only aggregates sent to model; explicit computed fallback; amount/date logic tests |
| Appendix B | Individual migrations plus generated complete bootstrap schema | SQL executed locally, RLS tested with authenticated role impersonation |
| Non-functional: AI outage independence | Core order functions separate from assistant/recommendations | API failures yield explicit degraded guidance without blocking cart/order actions |
| Non-functional: two-second menu/realtime and mobile/kitchen usability | Existing realtime subscriptions and mobile styles retained; added controls have 44px target styles | Not claimed as measured. No browser surface was available for visual/device checks; deployed load/realtime measurement remains required |

## Important implementation decisions

- Paper UC-05 introduces `served`; the implementation preserves that distinct step. A served paid bill can complete, and cash settlement of a served bill completes it transactionally. Unpaid bills do not complete or release their table.
- The kitchen screenshot in the paper shows cancellation while the role definition limits kitchen to preparation. Cancellation is assigned to authorized service/management personnel; kitchen only advances preparation.
- The paper names `users`, `tables`, and `knowledge_base`. The existing Supabase equivalents are retained (`auth.users`/`profiles`, `dining_tables`, `restaurant_knowledge`) rather than introducing duplicate authorities.
- Rules reference actual menu records through `recommendation_rule_items` foreign keys, with ID arrays for matching combinations. Menu renames do not break rules. Deleted or unavailable dishes are filtered at serving time.
- Historical revenue uses recorded prices and discounts. Item-performance revenue is explicitly gross and is not presented as allocated net revenue.
- The supplied paper has no numeric Apriori thresholds or real dataset. Defaults are exposed and recorded, and the validation dataset is explicitly simulated. The test transcript generator uses a deterministic model stub and is not represented as a live-model result.

## Activation and verification still required

1. Apply the numbered SQL migrations to the connected Supabase project. The attempted deeper remote-schema inspection was rejected by automatic approval review because the review service's usage limit was reached. No remote migration was applied.
2. Supply an embedding credential and run knowledge indexing to activate pgvector RAG; chat generation can keep the existing Groq configuration. Supply Maya sandbox merchant keys to activate hosted checkout.
3. Publish a historical mining batch once enough completed paid orders exist, or deliberately publish an explicitly simulated dataset that matches the actual menu.
4. Enable the supplied scheduled workflow in the project's repository with its secrets. There is no Git repository/remote configured in this workspace, so a live schedule was not enabled.
5. Exercise the deployed UI on customer mobile and kitchen devices, measure loading/realtime timing, and validate the hosted Maya callbacks. Browser visual verification was unavailable in this session.

## Technical sources checked

- [mlxtend association rule definitions](https://rasbt.github.io/mlxtend/user_guide/frequent_patterns/association_rules/) — support, confidence and lift.
- [Vite guide](https://vite.dev/guide/) — React/Vite setup.
- [PGlite extension documentation](https://pglite.dev/extensions/) — real local pgvector testing.
- [BIR RMC 71-2022](https://bir-cdn.bir.gov.ph/local/pdf/RMC%20No.%2071-2022.pdf) — senior/PWD eligible purchases, discount and VAT treatment. Staff must determine the eligible share and correct restaurant tax configuration.
- [Maya one-time checkout integration](https://developers.maya.ph/reference/accept-one-time-payment-using-maya-checkout), [create checkout](https://developers.maya.ph/reference/createv1checkout), [retrieve payment](https://developers.maya.ph/reference/getpaymentviapaymentid-1) — sandbox creation and server-side payment verification.
