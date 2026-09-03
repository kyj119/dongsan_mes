# Security scan — categories 5 (info exposure), 6 (CORS/CSRF), 7 (business logic), 8 (infra/config)

Repo: `C:\Users\user\dongsan_mes` — Hono + Cloudflare D1/Pages/R2. Read-only static review, no files modified, no `npm audit`.

---

## LEAD FINDING (cross-cutting — overlaps the auth/IDOR agent's scope)

`src/middleware/permissions.ts:54` — **CRITICAL** — BIZ-006 — `requirePagePermission` opens with `if (!user?.role) return next()`. Two JWTs signed with the same `JWT_SECRET` carry no `role` claim, so both short-circuit this gate and reach the protected router.

Token sources with no `role` claim:

- `src/middleware/portalAuth.ts:20` — customer portal token (`portal:true`, `portal_client_id`), issued by `src/routes/portal.ts:114` on client `login_id` + password.
- `src/routes/hrSelf.ts:57` — employee self-service token (`scope:'employee-self'`), issued by `src/routes/hrSelf.ts:17` on employee code + 6-digit birth date, no password.

`authMiddleware` (`src/middleware/auth.ts:9`) only verifies the signature and sets `c.set('user', payload)`; it does not check `role`, `portal` or `scope`. `entityId` falls back to 1 (`src/middleware/auth.ts:25`).

Result: an external customer holding portal credentials, or anyone knowing an employee code and birth date, reaches internal APIs on every router gated by `authMiddleware + requirePagePermission` alone.

| Router | Gate line | Page key | Endpoints with no further role guard |
|---|---|---|---|
| `src/routes/hr.ts` | :22 | `/hr` | employees list `:50`, create `:388`, update `:502`, delete `:721`, detail `:949` |
| `src/routes/dashboard.ts` | :23 | `/dashboard` | 11 of 11 |
| `src/routes/postProcessing.ts` | :8 | `/post-processing` | 12 of 12 |
| `src/routes/cashSchedule.ts` | :53 | `/cash-schedule` | 0 of 16 guarded |
| `src/routes/paymentRequests.ts` | :12 | `/payment-requests` | create `:116`, from-po `:162`, patch `:215`, delete `:238`, submit `:251` |
| `src/routes/approvals.ts` | :16 | `/approvals` | create `:172`, update `:269`, submit `:297`, approve `:326`, reject `:392`, cancel `:456` |
| `src/routes/attendance.ts` | :23 | `/attendance` | 1 of 4 |
| `src/routes/leaves.ts` | :41 | `/leaves` | 13 of 33 |

`src/middleware/permissions.ts:124` — **HIGH** — same bypass in `requireAdminPage()`; a role-less token passes ADMIN-only page gates (`/ia-scan`, `/ia-auto` at `src/index.tsx:446-447`).

Mitigating detail: resident numbers stay masked for non-ADMIN at `src/routes/hr.ts:973-979`. But `SELECT e.*` at `src/routes/hr.ts:962` still returns salary, bank account, address and phone.

Not affected (these return 401 when `role` is missing): `requirePageEdit` `:70`, `requireEditOrRole` `:89`, `requireAccessOrRole` `:108`, `requireAnyPagePermission` `:141`.

---

## Category 7 — business logic

`src/routes/approvals.ts:172` — **HIGH** — BIZ-003 — approval create accepts `reference_type` and `reference_id` verbatim from the body; `handlePostApproval` (`:588`) then acts on that row with no ownership or entity check — flips `orders.credit_status` to APPROVED and generates production cards (`:599-626`), or approves any `purchase_requests` row by id (`:591-596`).
`src/routes/approvals.ts:352` — **HIGH** — BIZ-006 — `canApprove` passes when `step.approver_role === userRole`, with no check that the approver is not the requester. A user whose role matches a template step approves their own credit-override request end to end.
`src/routes/inventory.ts:499` — **HIGH** — BIZ-006 — `POST /api/inventory/receipts` sits behind `inventoryRouter.use('/*', authMiddleware)` (`:18`) only. Any authenticated role creates a receipt that raises stock and writes an arbitrary `total_amount` purchase record.
`src/routes/inventory.ts:540` — **HIGH** — BIZ-004 — same handler never bounds `quantity`; a negative value decrements stock and writes a negative-amount receipt line.
`src/routes/inventory.ts:557` — **HIGH** — BIZ-005 — inventory `UPDATE` commits in `batch(receiptStmts)`, the matching `inventory_transactions` INSERT runs in a second `batch()` at `:568`. A failure between them leaves stock raised with no ledger row — the exact split the project rule forbids.
`src/routes/purchaseOrders/po-receive.ts:99` — **MEDIUM** — BIZ-004 — the guard is `receiveQty > remaining` with no lower bound. A negative received quantity passes, decrementing `purchase_order_items.received_quantity` and writing negative receipt lines. Stock is spared only because the write is gated on `acceptedQty > 0` (`:301`).
`src/routes/accounting.ts:508` — **MEDIUM** — BIZ-006 — POST, PUT (`:537`), DELETE (`:573`) on `/inter-entity` carry no handler guard; the router gate at `:29` is `requireAccessOrRole('/accounting','MANAGER')`, a read-level permission. Any role with view access to the accounting page writes inter-company entries. `ietValidate` (`:341`) does bound the amount and check the party.
`src/routes/claims.ts:107` — **MEDIUM** — BIZ-001 — `resolved_amount` unbounded; for REFUND or DISCOUNT it becomes an AR credit adjustment via `syncArAdjustmentStmts` (`:130`). Gate is `requireEditOrRole('/quality','MANAGER')`, so a quality-page editor issues arbitrary customer credits.
`src/routes/returns.ts:123` — **MEDIUM** — BIZ-001 — `refund_amount` from the body flows into `syncArAdjustmentStmts` (`:135`) with no ceiling against the original order and no non-negative check.
`src/routes/inventory.ts:1023` — **MEDIUM** — BIZ-005 — stock `UPDATE` is a standalone `.run()`; `inventory_adjustments` and `inventory_transactions` follow in a separate `batch()` at `:1047`.
`src/routes/scan.ts:298` — **MEDIUM** — BIZ-005 — scan stock-out updates `inventory` in one `.run()` and inserts the ledger row in another at `:307`.
`src/routes/inventory.ts:1313` — **MEDIUM** — BIZ-005 — warehouse transfer splits across three writes: source decrement `:1313`, destination batch `:1322`, ledger batch `:1334`. A failure after the first strands the quantity.
`src/routes/orders/create.ts:155` — **MEDIUM** — BIZ-001 — `discount_amount` enters `finalAmount` unbounded; negative inflates the total, oversized drives it below zero into a negative receivable. Header discount records no reason or actor, unlike line-level overrides.
`src/routes/orders/update.ts:191` — **MEDIUM** — BIZ-001 — same unbounded `discount_amount` on the update path.
`src/routes/orders/lifecycle.ts:277` — **LOW** — BIZ-002 — the status `UPDATE` is not conditioned on the status read at `:176`, leaving a check-then-act window. Stock deduction is separately idempotent via `idx_inventory_tx_unique_ref`, which limits impact.

**Checked 41 files.**

Rejected false positives:
1. Order line `unit_price` and manual `amount` override — explicit product decision documented at `src/utils/orderLineAmount.ts:15-17`, audited via `auto_amount`, `line_discount`, `discount_reason`, `discount_by`.
2. Double-ship via `deductStockLinesOnShip` — idempotent by the `inventory_transactions` unique reference index; re-ship is a no-op, not a double deduction.
3. Quotation convert-to-order double conversion — `src/routes/quotations.ts:611` counts real non-cancelled orders rather than a cache, plus an optimistic lock on `updated_at` at `:640`.
4. Payroll amounts editable by non-ACCOUNTING — every payroll router root is `requireRole('ADMIN','MANAGER')` (`core.ts:25`, `records.ts:12`, `settings.ts:14`).
5. AR payment create/update/delete — amount bounded above zero (`ar-payments.ts:34`, `:136`), entity-scoped against IDOR (`:126`, `:188`), delete restricted to `requireRole('ADMIN')` (`:182`).

---

## Category 5 — sensitive info exposure

`src/routes/hrSelf.ts:17` — **MEDIUM** — INFO-002 — `/api/hr/self-auth` issues a 30-minute token on employee code plus a 6-digit birth date, no password. It unlocks payslips (`:196`), contracts (`:169`) and certificates (`:98`), and per the lead finding it also passes `requirePagePermission`. Rate-limited to 5/min at `src/index.tsx:258`.
`src/routes/portal.ts:106` — **MEDIUM** — INFO-002 — `verifyPortalPassword` still accepts a bare unsalted SHA-256 digest for accounts not yet migrated to PBKDF2. Any leak of `client_accounts.password_hash` is reversible by rainbow table.
`src/routes/cron.ts:119` — **LOW** — INFO-001 — `String(err?.message || err).slice(0,300)` returned to the caller. Reachable only with a valid `X-Agent-Key`.
`src/routes/fax.ts:94` — **LOW** — INFO-001 — FTP error text concatenated into the response; may carry host or path detail. Same at `:138`, `:159`.
`src/routes/mySelf.ts:58` — **LOW** — INFO-001 — `error.message` returned, but only from a typed application error, not the D1 driver.
`src/routes/hrSelf.ts:404` — **LOW** — INFO-001 — same typed-error pattern.

**Checked 19 files.**

Rejected false positives:
1. INFO-002 `password_hash` in responses — never returned. All 21 references are login comparison (`auth.ts:30`, `portal.ts:134`, `users.ts:72`) or `UPDATE` on rotation. No `SELECT *` on `users`, `client_accounts`, `settings`, `api_keys` or `portal_users`.
2. `GET /api/settings` leaking secrets — `src/routes/settings.ts:44` returns `tax_secret_key_configured` as a `'1'`/`''` boolean, explicitly not the key; route is `requireRole('ADMIN','MANAGER')` at `:32`.
3. INFO-006 console logging of secrets/PII — grep over `console.*(password|token|secret|certkey|api_key|jwt|주민)` yields only "JWT_SECRET is not set" style diagnostics and token-refresh status lines in `src/scripts/layout/shell.js`. No values logged.
4. INFO-005 production sourcemaps — `vite.config.ts` sets no `build.sourcemap`, so Vite's production default (off) applies.
5. INFO-003/007 secret files committed — `.dev.vars`, `.env` and `.config/` are gitignored and `git ls-files` confirms none is tracked.

---

## Category 6 — CORS and CSRF

`src/index.tsx:229` — **LOW** — the origin callback reflects any `*.pages.dev` or `*.dongsan.co.kr` host, plus any `http://192.168.` or `http://10.` origin. Anyone can deploy a Cloudflare Pages project and hold an allowed origin. Not exploitable today because no ambient credential is attached to cross-origin requests.

**Checked 6 files** (`src/index.tsx`, the four files in `src/middleware/`, `src/routes/portal.ts`).

No CSRF exposure. `credentials` is not set on the `cors()` config at `src/index.tsx:224-235`, and a repo-wide grep for `setCookie`, `getCookie`, `deleteCookie`, `Set-Cookie`, `document.cookie` and `credentials: 'include'` across `src/**/*.{ts,tsx,js}` returns **zero hits**. Auth is Bearer-only in all three surfaces — main app (`src/middleware/auth.ts:11`), customer portal (`src/middleware/portalAuth.ts:28`) and employee self-service (`src/routes/hrSelf.ts:82`). The known-accepted `!origin → '*'` case at `src/index.tsx:227` therefore stands as not-a-finding.

Rejected false positives:
1. `X-Agent-Key` in `allowHeaders` (`src/index.tsx:233`) — agent calls are server-to-server and send no `Origin`, so CORS is not the control here.
2. `origin.startsWith('http://192.168.')` — LAN dev origin, no credential attached, same reasoning as the `.pages.dev` entry above.

---

## Category 8 — infrastructure and config

`src/index.tsx:238` — **MEDIUM** — INFRA — no `Content-Security-Policy` on HTML responses. The header middleware sets `X-Frame-Options` (`:243`/`:245`), `X-Content-Type-Options: nosniff` (`:247`) and `Referrer-Policy: strict-origin-when-cross-origin` (`:248`). No `Strict-Transport-Security`, though Cloudflare Pages supplies HSTS at the edge.
`src/routes/fax.ts:43` — **LOW** — INFRA-001 — the only secret fallback in `src/`; degrades to an empty string, so it cannot forge anything.

### Secret-fallback grep (mandatory check) — results

- `grep -rnE "(c\.env|env)\.[A-Z_0-9]+ *\|\| *['\"\`]" src/` → **1 hit**: `src/routes/fax.ts:43` `return c.env.BAROBILL_FTP_PASSWORD || ''`. Empty-string degradation, not a usable default credential.
- `grep -rnE "env\.[A-Z_0-9]+ *\|\| *['\"]" scripts/*.cjs` → hits only in local test harnesses (`smoke.cjs:32-33`, `card-backfill.cjs:24-25`, `orderform-roundtrip.cjs:21-22`, `zscan-intake.cjs:44-45`, the `e2e-*.cjs` family), all defaulting to `admin`/`password` against `http://localhost:3000`. Not deploy paths.
- `grep -rnE "secrets\.[A-Za-z_]+ *\|\|" .github/workflows/` → **0 hits**. `deploy.yml:14` documents that the plaintext `SMOKE_PASS` fallback was deliberately removed under issue #336.
- No `JWT_SECRET` fallback exists. Every consumer fails closed: `src/middleware/auth.ts:18-21` (500), `src/routes/cron.ts:36` and `:125` (500), `src/routes/hr.ts:14` (`requirePiiKey` throws), `src/routes/payroll/year-end.ts:74` (throws). The `wrangler.jsonc` comment describing a "dev-only default" is stale — the code no longer has one.

### Cron / admin endpoint protection

All four endpoints in `src/routes/cron.ts` require `agentKeyMiddleware`: `/barobill-sync` `:34`, `/analyze` `:110`, `/daily-maintenance` `:123`, `/budget-check` `:340`. `agentKeyMiddleware` (`src/middleware/auth.ts:80`) compares the `X-Agent-Key` header against `AGENT_API_KEY` and returns 500 when the variable is unset, so it fails closed. **No GET triggers exist** — every cron route is POST. Mounted at `src/index.tsx:311`.

Related agent-key surfaces, all explicitly guarded: `src/routes/printEvents.ts:310`, `:344`, `:515`, `:584`; `src/routes/iaAuto.ts:7` (`requireRole('ADMIN')` router-wide); `src/routes/migration.ts:9` (`requireRole('ADMIN')` router-wide); `src/routes/files.ts:13`, `:39`, `:96`.

### Config secrets

`wrangler.jsonc` declares only `$schema`, `name`, `compatibility_date`/`flags`, `pages_build_output_dir`, the D1 binding and the R2 binding. **No `vars` block, no plaintext secret.** `workers/barobill-cron/wrangler.jsonc` declares one var, `MES_URL: "https://webapp-9i0.pages.dev"`, and documents `AGENT_API_KEY` as a `wrangler secret put` value.

**Checked 12 files** (`wrangler.jsonc`, `workers/barobill-cron/wrangler.jsonc`, `vite.config.ts`, `.gitignore`, the four `.github/workflows/*.yml`, `src/index.tsx`, `src/routes/cron.ts`, `src/routes/webhooks.ts`, `src/middleware/rateLimit.ts`).

Rejected false positives:
1. INFRA-002 hardcoded IPs — the only IP literal in `src/` outside the known MES address is a placeholder attribute at `src/pages/equipment.ts:477` (`placeholder="192.168.0.101"`). Not a connection target.
2. `admin`/`password` defaults in `scripts/*.cjs` — localhost test harnesses, not deploy or production paths.
3. `src/routes/webhooks.ts` — an 8-line stub with no routes; the comment records that Barobill uses its own callback mechanism. The Popbill `allowedPrefixes` list the brief mentioned no longer exists.
4. INFRA-005 login rate limit — present at `src/index.tsx:254-262` for login, password change, refresh, self-auth, portal verify and unsubscribe. In-memory `Map` limitation excluded per scope.
5. `observability` in `workers/barobill-cron/wrangler.jsonc` — logging config, not a secret.
