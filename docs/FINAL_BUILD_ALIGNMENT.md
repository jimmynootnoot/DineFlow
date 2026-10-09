# Final-build alignment checklist

Source reviewed: the user's 56-page `SE2_FINAL_DOCU.pdf` dated 9 October 2026. This is a code-and-read-only-data review, not Chapter 8 acceptance evidence. The paper itself was not edited. Its screenshot placeholders and test procedures are requirements to verify, not instructions to fabricate results.

| Paper requirement | Current implementation | Evidence still needed before final screenshots |
|---|---|---|
| §6.1.5, UC-04: management dashboard with one selected date range, revenue, order count, average value, top sellers, and an on-demand AI summary | Dashboard now uses the protected `sales-insight` endpoint for all period figures. It separates live operational alerts from period sales, labels demonstration orders, and hides a cached summary when sales change. | Deploy this build; reconcile a fixed period against paid orders, then capture Figure 9 / Figure 18. Verify the model-generated or explicitly computed-fallback label. |
| UC-01: menu, cart, table/takeout order, recommendation, kitchen routing | Implemented menu, cart, table sessions, takeout, stored-rule recommendations and same-category fallback. | Complete TC-05 through TC-11 on the deployed database. Confirm the table foreign-key repair `se2-05-table-order-fk.sql` has been applied; the previous guest checkout failed with `orders_table_id_fkey`. |
| UC-02, Appendix C: approved-data assistant, unsupported refusal, staff handoff, saved transcripts | Server assistant, private history/export, staff queue and restricted-action routing exist. Allergen safety questions now use a deterministic staff-verification response; absence from an allergen list is not treated as proof of safety. | Run TC-16 through TC-19 against current approved menu records. Export genuine final-build transcripts. Replace Appendix C2's unsafe peanut-free example with a verified response; do not tune the app to reproduce that claim. |
| §5.1, §7.2.6: vector retrieval over approved knowledge | Server supports pgvector retrieval and explicitly labeled approved-text fallback. | Read-only readiness check found **0 indexed vectors** and **no local embedding credential**. Supply a protected embedding key, run indexing, and verify the deployed model/configuration before claiming vector RAG. |
| §7.2.7, Appendix A: Apriori rules with support, confidence, lift and provenance | Offline miner, rule report/export, and recommendation endpoint exist. Simulated data is labeled. | Read-only readiness check found **0 published recommendation runs**. Publish an authorized historical run when eligible orders exist, or explicitly publish a simulated validation run; capture provenance and TC-20 to TC-22. The paper's 20-basket example and repository's 10-basket test fixture are separate demonstration datasets. |
| UC-03: kitchen and customer tracking | Confirmed → preparing → ready, serving/completion separation and realtime subscriptions exist. | Capture Figure 16; measure the two-second delivery target instead of inferring it from code. Kitchen cannot cancel an order because §3.2 gives that action to service/management, although the illustrative Figure 8 shows a Cancel control. |
| UC-05: billing and payment | Numeric bill calculations, authorized discount controls, cash recording, demo simulation, and hosted Maya sandbox code exist. | Complete TC-12 to TC-15 with the configured sandbox; verify no duplicate settlement and table release. Hosted Maya credentials/callbacks were not verified by local tests. |
| §3.2: role permissions | UI routing, RLS, and server/RPC checks are implemented. | Test separate customer, staff, kitchen, management, and admin accounts, including direct unauthorized reads/writes (TC-01 to TC-04). Guest ordering additionally requires Supabase anonymous sign-ins to be enabled. |
| §3.4: load, mobile touch targets, and AI-outage independence | Responsive styles and independent core ordering path exist. | Measure menu loading, kitchen delivery, 44px touch targets, and the controlled AI outage on recorded devices/network (TC-19, TC-25). |

## Screenshot capture order

1. Finish the database activation and configure the actual sandbox and AI services.
2. Run the Chapter 8 tests and record build ID, date, account role, inputs, actual outcome, status, and evidence ID. Blank results are **not passes**.
3. Use a clearly labeled demonstration environment if synthetic orders are needed. Do not present its revenue or mined rules as live restaurant performance.
4. Capture Figures 12-19 from that same tested build: menu; cart/recommendations; assistant; tracking; kitchen; bill/sandbox payment; management dashboard/insight; menu management/roles.
5. Replace the Figure 9 placeholder and Appendix C examples only after their displayed answers and figures have been checked against current records. Record failures and retests in §8.4.

The local production build, server tests, and UI tests passed for the dashboard and assistant changes. This does **not** establish the PDF's two-second performance targets, remote migration state, vector RAG activation, published Apriori batch, or hosted Maya completion.

## Paper wording to reconcile before submission

- §2.1.1 says Tailwind avoids separate stylesheets. The running React/Vite app uses Tailwind **alongside** component CSS and design tokens; the paper should describe that actual implementation.
- §5.1 says every client request passes through one API gateway and never reaches the data layer directly. The app does call Supabase directly for permitted catalog, order, and session operations under RLS; AI and payment provider calls are server-mediated. Keep the security boundary accurate in the final architecture text/diagram.
- §5.2 describes eleven **logical core entities**. The deployed schema also has operational support tables such as mining runs, staff escalations, and sales-insight cache. Do not claim the physical schema has exactly eleven tables.
- Appendix C2's “peanut-free” conclusion is not supported merely because peanuts are absent from a listed allergen field. The final transcript should show the menu's stated facts plus staff verification, not an allergy-safety guarantee.
