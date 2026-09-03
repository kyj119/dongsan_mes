# Security scan — Category 3 (Auth) + Category 4 (IDOR / entity isolation)

Target: `C:\Users\user\dongsan_mes` (Hono + Cloudflare D1/Pages). Read-only scan, no files modified.
Date: 2026-09-02

---

## Category 3 — Authentication / Authorization

Structural note: every router is mounted in `src/index.tsx` **without** a global gate (`app.route('/api/x', xRouter)` only), so each router file applies its own `authMiddleware`. That mapping is complete — no `/api` router was found lacking a gate. The real gap is in **what those gates accept**, not in which routes carry them. The first two findings compose into a single working auth bypass.

- `src/middleware/auth.ts:22` — CRITICAL — AUTH-005 — `authMiddleware` verifies only the HS256 signature; portal tokens (`portalAuth.ts:20`, same `JWT_SECRET`) and employee-self tokens (`hrSelf.ts:56`) both pass, since no claim-type check exists.
- `src/middleware/permissions.ts:52` — CRITICAL — AUTH-005 — `requirePagePermission`: `if (!user?.role) return next()` — a role-less portal/self token passes every page-permission gate, opening `/api/hr`, `/api/leaves`, `/api/attendance`, `/api/dashboard`, `/api/approvals`, `/api/payment-requests`, `/api/cash-schedule`, `/api/post-processing`, plus all `authMiddleware`-only routers (`inventory`, `items`, `clients`, `prices`, `notifications`, `search`, `printEvents`, `rip`, `settings/data-completeness`) as entity 1.
- `src/routes/auth.ts:117` — HIGH — AUTH-004 — `POST /api/auth/refresh` re-signs a fresh 8h token straight from the presented token's claims with no `users` lookup; deactivated accounts and demoted roles renew indefinitely, and portal/self tokens are accepted here too.
- `src/routes/hrSelf.ts:17` — MEDIUM — AUTH-007 — `POST /api/hr/self-auth` mints a JWT from employee code + 6-digit birthdate alone (rate-limited 5/min per IP, in-memory), and that token is honored by internal `authMiddleware`.
- `src/routes/auth.ts:186` — MEDIUM — AUTH-004 — `switch-entity` non-admin guard is `if (userRow?.default_entity_id && ... !== entity_id)`; NULL or 0 `default_entity_id` skips it entirely, letting a STAFF user mint a token for any 법인. (MANAGER is unrestricted by design.)
- `src/utils/crypto.ts:70` — MEDIUM — AUTH-007 — `verifyPassword` returns `password === stored` for any hash lacking the `pbkdf2:` prefix; plaintext credentials remain storable and accepted (auto-migrated only on a successful login at `auth.ts:36`).
- `src/routes/hr.ts:422` (also `src/routes/payroll/year-end.ts:73`) — MEDIUM — `JWT_SECRET` doubles as the AES-256-GCM key for resident registration numbers; rotating the signing key after a token leak makes stored PII undecryptable, and one leaked value yields both token forgery and PII decryption.
- `src/utils/crypto.ts:31` — MEDIUM — PII key derivation uses static salt `'dongsan-pii-salt'` at 10,000 iterations, versus 100,000 for passwords (`crypto.ts:5`).
- `src/middleware/auth.ts:79` — LOW — AUTH-006 — `agentKeyMiddleware` compares with `key !== expectedKey` (non-constant-time); `caps.ts:47` already hashes both sides first, the better pattern in-repo.

**checked 132 route files, 4 middleware files, `src/index.tsx`, `src/utils/crypto.ts`, `.github/workflows/`, `wrangler.jsonc`**

Rejected false positives (Category 3):
1. AUTH-003 — no `c.env.X || 'literal'` secret fallback anywhere in `src/`; the only hit is `fax.ts:43` `BAROBILL_FTP_PASSWORD || ''`, an empty string, not a secret literal. No `secrets.X || '...'` in `.github/workflows/`.
2. `scripts/*.cjs` `process.env.SMOKE_PASS || 'password'` (smoke/e2e harnesses) — local test tooling, never shipped to the Worker; `.dev.vars` is gitignored and no `.env` file is tracked.
3. `src/routes/webhooks.ts` — an 8-line empty router (bar-obill uses its own callback mechanism); nothing to protect, and the Popbill/Barobill IP `allowedPrefixes` design is out of scope per brief.
4. `src/routes/caps.ts` `/sites`, `/settings`, `/employee-map`, `/sync-log`, `/ignore-fpids` initially looked ungated (no inline middleware) — they are covered by path-scoped `capsRouter.use(...)` at `caps.ts:538-546`; the two agent endpoints registered *before* that line (`/sync/pending`, `/sync/state`) authenticate via `verifyAgentKey`, which is deliberate Hono registration ordering.
5. `src/routes/users.ts:147` — `#338` already removed the predictable `'password'` default from reset-password; user create/patch/hard-delete all carry `requireAdmin` plus a last-active-ADMIN guard.

---

## Category 4 — IDOR / entity isolation

Method: handler-level scan of all 132 route files, cross-referenced against the tables that actually carry `entity_id` / `requesting_entity_id` (derived from `schema/baseline_schema.sql` + `migrations/*.sql` ALTERs), then reachability-checked against 109 client scripts in `src/scripts` and `src/pages`.

- `src/routes/orders/core.ts:263` — HIGH — idor-asymmetry — `GET /:id/invoice` looks up `WHERE o.id = ?` unguarded and returns the order, full client master and amounts; sibling `GET /:id` at `:452` enforces `viewerEntity` and `DELETE /:id` at `:535` uses `entityFilter` (#333). Reachable: `src/scripts/invoice.js:197`, `orders.js:1877`, `quotation.js:180`.
- `src/routes/cards/lifecycle.ts:1157` — HIGH — idor-asymmetry — `PATCH /:cardId/items/:itemId/print-toggle` has neither `cardEntityScope` nor an edit gate, while siblings at `:1041` and `:1086` both call `cardEntityScope`; it flips print state and cascades to card `PRINT_DONE` + order status sync. Reachable: `src/scripts/cards/actions.js:4`, `cardDetail.js:456`.
- `src/routes/inventory.ts:849` — HIGH — idor-asymmetry — `GET /receipts/:id` returns supplier and amounts with no entity filter though `inventory_receipts` carries `entity_id` and the list paths in the same file use `entityFilter`. Reachable: `src/scripts/receiving.js:599` and `:706`.
- `src/routes/rip.ts:1685` — MEDIUM — idor-asymmetry — `POST /send-item/:cardItemId` joins `cards` without `requesting_entity_id`, reading another 법인's card item content + `source_file_path` and queueing it to a printer. Reachable: `src/scripts/cards/rip.js:309`.
- `src/routes/rip.ts:2056` — MEDIUM — idor-asymmetry — `GET /card-items/:cardId` same unguarded `cards` join, exposing another 법인's card line items and RIP file paths.
- `src/routes/orders/operations.ts:376` — MEDIUM — idor-exfil — `POST /:id/send-email` fetches the order with no entity guard and mails the invoice/quotation, amounts and derived AR balance to a caller-supplied address (ADMIN/MANAGER gated). Reachable: `src/scripts/orders.js:1894`, `invoice.js:272`.
- `src/routes/purchaseOrders/core.ts:240` — MEDIUM — entity-injection — `data.entity_id` from the request body is trusted verbatim with no check that the caller may act for it; the PO number prefix follows the injected value.
- `src/routes/orders/create.ts:95` — MEDIUM — entity-injection — `orderData.billing_entity_id` accepted verbatim, same class as above; the order number channel follows it.
- `src/routes/orders/operations.ts:287` — MEDIUM — idor-asymmetry — `POST /:id/convert-to-order` reads `WHERE id = ?` unguarded, converting another 법인's quotation into an order.
- `src/routes/orders/core.ts:245` — MEDIUM — idor-asymmetry — `GET /:id/timeline` returns another 법인's `order_status_history` unguarded. Reachable: `src/scripts/orders.js:1453`.
- `src/routes/aiAnalysis.ts:472` — MEDIUM — raw-resource — `GET /:id/chunks` reassembles raw source design files with no entity filter, while sibling `/:id/download` at `:417` carries the #339 filter and its local-path branch explicitly redirects callers here; router-wide `requireRole('ADMIN')` narrows this to entity-context bypass, but it is a raw-resource-by-key path (not downgraded per brief).
- `src/routes/aiAnalysis.ts:444` — MEDIUM — raw-resource — `POST /:id/chunks` `INSERT OR REPLACE` overwrites chunk data for any analysis id with no entity filter (write side of the above).
- `src/routes/paymentRequests.ts:162` — MEDIUM — idor-asymmetry — `POST /from-po/:poId` reads any `purchase_orders` row unguarded and plants a payment request from it into the caller's entity (unreached — dead code candidate; 0 callers in `src/scripts`/`src/pages`).
- `src/routes/cards/lifecycle.ts:1103` — MEDIUM — idor-asymmetry — `POST /generate/:orderId` reads any order unguarded and generates cards for it (unreached — dead code candidate).
- `src/routes/quotations.ts:775` — LOW — idor-asymmetry — `GET /:id/orders` lists orders by `quotation_id` with no entity filter (unreached — dead code candidate).
- `src/routes/priceLists.ts:215` — LOW — idor-asymmetry — `GET /:id/preview` reads `price_lists` (which carries `entity_id`) unguarded (unreached — dead code candidate).

**checked 132 route files against the schema's actual `entity_id` column set, plus 109 client scripts for reachability**

Rejected false positives (Category 4):
1. `src/routes/clients.ts` (`GET/PATCH/DELETE /:id`, `/:id/credit`, `/:id/toggle-active`), `src/routes/items.ts` (~15 `/:id` handlers), `src/routes/departments.ts:123`, `src/routes/prices.ts` price-groups and `client_item_prices`, `src/routes/contactGroups.ts` — all address tables with **no `entity_id` column** (verified against `schema/baseline_schema.sql`); these are company-wide shared masters and cannot leak across 법인.
2. `src/routes/ledger/ar-ledger.ts:25` and `:287`, `src/routes/ledger/ar-receivables.ts:108` and `:307` — flagged only because the `clients` lookup is unfiltered (that table has no `entity_id`); the `orders`, `payments` and `adjustments` queries in each handler all carry `entityFilter` (e.g. `ar-ledger.ts:50`, `ar-receivables.ts:122`).
3. `src/routes/rip.ts:518` / `:234` (equipment detail and list) — cross-entity by the documented 2026-08-11 decision recorded inline at `rip.ts:236`: all equipment is owned by entity 1, so isolating reads would empty the equipment picker for entities 2/3; #342 isolation is deliberately kept on write paths only.
4. `src/routes/storageZones.ts:283` (`PUT /:id/bounds`) and `:448` (`DELETE /:id`) — the deliberate #368 symmetry, `requireRole('ADMIN')`-gated with the reasoning inline at `:452`.
5. `src/routes/workbench.ts` `/intakes/:id/thumb`, `/void`, `/restore`, `/process/:id/download` — all carry `waitingOpenFilter(c)` or `entityFilter(c, 'ia_process_jobs')` plus `canVoidIntake` ownership; `src/routes/portal.ts` handlers all scope by `user.portal_client_id` from the token, never from body/query; `src/routes/hrSelf.ts` `/self/*` scope by the employee id inside the self token via `verifySelfToken`.

Also verified clean: `src/routes/files.ts` is `requireRole('ADMIN')` with `..`/`\` traversal guards on GET (#365); `facility.ts:187` and `storageZones.ts:142` R2 serving read the key from a settings row, not from the client; `cardExpenses.ts:687` gates the R2 key against caller-owned `card_transactions` (#442); `bank.ts` and `payroll/*` are per-route `requireRole`-gated despite a bare router-level `authMiddleware`.

Client-controlled filter bypass: the only entity-disabling query params in the codebase are `storageZones.ts:16` (`all_entities`, ADMIN/MANAGER-gated), `inventoryCount.ts:19` and `purchaseOrders/po-receipts.ts:340` (`scope`, which selects "mine vs all" **within** the already entity-filtered set, not across entities). No unguarded `entity_id`/`include_all` query param exists.

---

## Known already-fixed items — verification status

| Item | Status | Evidence |
|---|---|---|
| #610 employee PII cross-tenant in messages.ts | FIXED — still in place | `src/routes/messages.ts:722` applies `entityFilter(c)` to the `employees` bulk-target query, with the reasoning comment at `:720` |
| #612 analysis file IDOR | FIXED — still in place | `src/routes/aiAnalysis.ts:417` `entityFilter` on `/:id/download`; `src/utils/entityFilter.ts` `findForeignAnalysisIds` guards order-line linkage. **Residual gap:** `/:id/chunks` (`:444`, `:472`) was not covered — reported above as MEDIUM |
| #614 hard-delete guard designer_intakes | FIXED — still in place | `src/routes/workbench.ts:1190` and `:1217` use `canVoidIntake` + status-conditioned UPDATE; no hard `DELETE FROM designer_intakes` exists |
| #368 storageZones all_entities | FIXED — still in place | `src/routes/storageZones.ts:16` — `all_entities` honored only when `user?.role === 'ADMIN' || 'MANAGER'` |

---

## Severity totals

| Severity | Category 3 | Category 4 | Total |
|---|---|---|---|
| CRITICAL | 2 | 0 | 2 |
| HIGH | 1 | 3 | 4 |
| MEDIUM | 5 | 11 | 16 |
| LOW | 1 | 2 | 3 |
| **Total** | **9** | **16** | **25** |
