# DineFlow AI

Restaurant ordering aligned to **DineFlow_AI_SE2_Documentation (1).pdf**, including reproducible Apriori output (Appendix A), schema migrations (Appendix B), and private assistant transcripts (Appendix C).

## Start locally

Requires Node 22.12+ and Python 3.12+ for offline mining.

```sh
npm install
# Copy .env.example to .env.local and supply this project's credentials.
npm start
```

Open `http://127.0.0.1:5173`. Vite serves React **and** the serverless API handlers locally, so the assistant, recommendations and sales summaries work with this one command. Restart after changes to server code or environment variables. `npm run build` produces `dist/`; `npm run preview` previews static assets only. Vercel serves the API functions when deployed.

The older `server/` Express/Prisma project is legacy and is not used by this Supabase application. React Scripts remains only for the existing Jest test runner; production and development use Vite and Tailwind 4 utilities alongside the established styles.

## Database activation

For an **existing DineFlow installation**, run these files in the Supabase SQL Editor in order:

1. `supabase/multi-method-payments.sql` (if not already installed).
2. `supabase/se2-01-roles.sql`. Run this separately so the new enum value commits.
3. `supabase/se2-02-workflows.sql`.
4. `supabase/se2-03-storage.sql`.
5. `supabase/se2-04-maya.sql` for the hosted Maya sandbox path.

For a **new database**, first run `supabase/dineflow-setup.sql`, then the files above. Do not rerun the old base setup on an upgraded database: its legacy status normalization and policies predate SE2. The SE2 migration is transactional and repeatable. It preserves orders and supports the earlier `chat_sessions.user_id` / `chat_messages.chat_session_id` naming; installation against other legacy schemas must be checked separately.

The linked project was checked read-only during implementation. It had zero indexed knowledge vectors and no embedding credential. The new migrations have **not** been applied to that remote database. They were executed and tested against isolated PostgreSQL with pgvector.

## Roles and operations

| Role | Workspace |
|---|---|
| Customer | Menu, cart, table/takeout ordering, own bills/history/chat |
| Service crew (`staff`) | Orders, table QR sessions, billing, cancellation of unpaid open orders, staff requests |
| Cashier | POS, orders, table sessions, discounts and cash settlement |
| Kitchen | Confirmed → preparing → ready |
| Management | Service/kitchen operations, menu/pricing, reports and AI summaries |
| Administrator | Management access plus role assignment and restaurant settings |

Self-signup always creates a customer. Bootstrap the first administrator through Supabase, then use **Administration** to assign roles to existing accounts. User metadata does not grant privileges. RLS and validated functions enforce permissions independently of the UI.

Staff create tables under **Tables & QR**, print the scannable codes, and customers use those links for dine-in sessions. Occupancy is derived from active bills. Staff mark ready orders served; served bills complete after payment. Customers may pay before preparation, but only authorized staff mark them served/completed. Discounts apply only to an unpaid active bill and require staff to verify the eligible share. Administration configures VAT registration; the calculation removes included VAT from the eligible portion when applicable, then applies the senior/PWD discount. The bill and payment ledger retain the discount, tendered amount and change.

## Appendix A: actual Apriori mining

```sh
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -r requirements-ml.txt
# macOS/Linux:
.venv/bin/python -m pip install -r requirements-ml.txt
npm run test:mining
npm run mine:demo
```

`mine:demo` executes **mlxtend Apriori** over `docs/fixtures/transactions.json`. It writes CSV and JSON into `docs/appendices/generated/` and never creates fake sales. The fixture produces 10 baskets, 13 frequent itemsets and 16 positive rules at support 0.05 / confidence 0.25 / lift > 1.

```sh
# Mines all completed, paid orders from the configured database and publishes atomically:
npm run mine:publish
```

Each basket counts once, including single-item baskets. Item quantity does not inflate support. Mining uses stable menu IDs, paginates the dataset, retains multi-item antecedents/consequents, and records thresholds, counts and a dataset fingerprint. A successful batch with no qualifying rules retires stale rules. Insufficient history leaves the prior snapshot intact; simulated rules cannot overwrite a historical batch.

To publish an explicitly simulated validation batch, supply server environment variables and run `python scripts/mine_recommendations.py --input docs/fixtures/transactions.json --publish`. Names must match the current menu; the script rejects mismatches. This is deliberately not automatic and does not alter order records.

**Reports → Mined menu associations** displays the latest published batch and exports Appendix A. Cart suggestions use stored rules via the server, exclude unavailable/already-selected items, and fall back to actual same-category top sellers when no rule matches. They never claim arbitrary hand-authored suggestions were mined.

`.github/workflows/ai-batches.yml` provides a nightly 02:00 Philippine-time batch and manual workflow dispatch. Add repository secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `EMBEDDING_API_KEY` to enable it. The workflow is supplied, not deployed or enabled in a remote repository by this change.

## Assistant, RAG and Appendix C

Configure either Groq or OpenAI for generation. **Vector RAG also requires `EMBEDDING_API_KEY`** (an OpenAI embedding credential), independent of the chat provider:

```sh
npm run index:knowledge
```

Approved menu/settings edits invalidate stale embeddings. Indexing checks the text has not changed before saving its vector. The assistant retrieves current approved knowledge server-side; unindexed records use clearly labeled text retrieval. If the model is unavailable it returns approved data excerpts. Unsupported and staff-only requests are handled explicitly. Core ordering does not depend on AI availability.

Chat exchanges are persisted through a server-only function. Customers can access only their own conversations; even managers cannot browse another customer's private chat. **Export transcript** downloads the current session as JSON, including unsaved fallback exchanges labeled as such. **Ask staff** writes a staff request linked to the conversation and records the escalation in its transcript. The staff queue updates in realtime and has a manual refresh control.

`npm run test:server` generates `appendix-c-test-conversations.json`, explicitly labeled as test transcripts with a deterministic model stub. For academic evidence of the configured model, export actual conversations from the running app.

## Reports

Management selects a date range in Philippine time and requests an AI summary. The server aggregates data before calling the model; no customer identities or individual transactions are sent. Summaries are cached by range until regenerated. Revenue means completed, paid net bills; item performance is labeled gross sales. A model outage yields an explicitly labeled computed summary.

## Payment boundary

Two explicit modes are available. Without merchant keys, the existing Maya-style checkout is a **local sandbox simulation**, including card/wallet/bank/QR demonstration paths and OTP authorization. Its QR is a reference, not a payable QR Ph code.

For the paper's external gateway demonstration, set server-only `MAYA_PUBLIC_KEY`, `MAYA_SECRET_KEY` (sandbox merchant keys) and `APP_BASE_URL`, then apply `se2-04-maya.sql`. Customer orders offer **Open Maya sandbox** and **Verify Maya payment**. The server creates the hosted checkout using the recorded bill, and verifies the payment ID, request reference, currency and exact amount through Maya before recording payment. Redirect query parameters and webhook payloads cannot mark a bill paid. Register your deployed `/api/maya-webhook` URL for Maya payment events; the webhook re-fetches the provider record before settlement. Use Verify after returning if the webhook has not arrived.

An active hosted checkout locks bill changes and alternate settlement. Provider-confirmed failed/cancelled/expired attempts are released by Verify so a new attempt can be created. If creation times out without a checkout ID, the reservation stays locked for staff review rather than risking duplicate checkouts. No production gateway URL is supported. Merchant keys were not supplied, so hosted-provider verification remains untested against Maya; matching/amount checks and idempotent database settlement are tested locally.

## Verification and appendix package

```sh
npm run test:ui
npm run test:server
npm run test:database
npm run test:mining
npm run build
npm run appendices
```

Database tests create an isolated in-memory PostgreSQL instance with real pgvector; Supabase auth/Storage infrastructure is represented by test tables and roles. Tests do not touch remote restaurant records. The appendix exporter packages the migration scripts and reproducible test output; no credentials, customers or live chat data are included.

See `docs/PAPER_ALIGNMENT.md` for requirement mapping and deployment/verification limits. The paper's two-second load/realtime targets and physical mobile/kitchen readability require measurement on the deployed app and target devices; they are not claimed from unit tests.
