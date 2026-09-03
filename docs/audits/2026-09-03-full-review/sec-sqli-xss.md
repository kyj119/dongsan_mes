# Security scan — SQL Injection / XSS / CSV Formula Injection

Target: 동산기획 ERP+MES, `C:\Users\user\dongsan_mes` (Hono + Cloudflare D1/Pages). Read-only scan, no files modified.
Date: 2026-09-02. Categories: 1 (SQLi), 2 (XSS), 2b (CSV formula injection).

---

## Category 1 — SQL Injection

**No injectable finding.** Every request-controlled value reaches D1 through `.bind()`.

Defenses confirmed by reading the code, not assumed:

- Dynamic `ORDER BY` is whitelist-mapped everywhere, with an unknown-key fallback to a default: `src/routes/orders/listFilter.ts:73` (`resolveOrderSort`), `src/routes/purchaseOrders/listFilter.ts:47` (`resolvePoSort`), `src/routes/quotationsListFilter.ts:40` (`resolveQuotSort`), `src/routes/cards/queries.ts:315` (`sortOptions`), `src/routes/cards/queries.ts:832` (`sortMap`). SQL-002 not present.
- SQL-003 not present. `src/routes/activityLogs.ts:27`, `src/routes/items.ts:452`, `src/routes/inventory.ts:173`, `src/routes/workbench.ts:832`, `src/routes/search.ts:31` all bind the `%term%` pattern rather than interpolating it. The only `LIKE '${...}'` in SQL text is `src/routes/ledger/ar-receivables.ts:424`, whose value is the module constant `CREDIT_ALERT_TITLE_PREFIX`.
- SQL-004 not present. Every `IN (...)` builds `?,?,?` from array length (`map(() => '?').join(',')`). The only two `join(',')` value forms are `src/constants/intercompany.ts:42` and `:92`, which join hardcoded numeric ID arrays.
- All 20 dynamic `UPDATE ... SET` builders iterate a server-side column allowlist: `src/routes/cashFlow.ts:90`, `src/routes/cashFlow.ts:225`, `src/routes/items.ts:393`, `src/routes/items.ts:751`, `src/routes/settings.ts:111`, `src/routes/caps.ts:588`, `src/routes/hr.ts:623`, `src/routes/hr.ts:1319`, `src/routes/facility.ts:59`, `src/routes/leaves.ts:949`, `src/routes/leaves.ts:985`, `src/routes/paymentRequests.ts:221`, `src/routes/postProcessing.ts:162`, `src/routes/specGroups.ts:87`, `src/routes/cashSchedule.ts:242`, `src/routes/clients.ts:1063`, `src/routes/clients.ts:1291`, `src/routes/contactGroups.ts:240`, `src/routes/finishing.ts:97`, `src/routes/messageTemplates.ts:75`. `src/routes/hr.ts:451` additionally intersects the allowlist with `PRAGMA table_info(employees)`.
- Interpolated `LIMIT`/`OFFSET` (11 sites) are all `Math.min/Math.max(parseInt(...))` clamped: `src/routes/bank.ts:513`, `src/routes/bank.ts:2891`, `src/routes/ledger/ar-payments.ts:227`, `src/routes/payroll/records.ts:19`, `src/routes/purchaseInvoices.ts:15`, `src/routes/purchaseInvoices.ts:50`, `src/routes/inventory.ts:1228`, `src/routes/workbench.ts:369`, `src/routes/workbench.ts:821`, `src/routes/bank.ts:1422`, `src/routes/approvals.ts:157` (module constant).
- `src/routes/users.ts:314` and `src/routes/users.ts:360` interpolate table/column names into `PRAGMA`/`SELECT`/`DELETE`, but the names come from `PRAGMA foreign_key_list` output or a hardcoded `AUDIT_COLUMNS` pair list, and each passes a `/^[A-Za-z0-9_]+$/` gate.
- `src/utils/entityFilter.ts:51` `entityFilter` returns a fixed clause string plus bound params; the alias prefix is a caller-side string literal in all 430 call sites.

**Checked: 126 files containing template-literal SQL, 1,899 interpolation sites across 755 unique expressions; 77 traced back to a request-derived or externally-supplied identifier and read individually.**

### False positives rejected (Category 1)

- `ef.clause` / `efP.clause` / ~60 alias variants (430 sites) — `src/utils/entityFilter.ts` fixed string + bound params.
- `ph`, `placeholders`, `oph`, `dph`, `gph`, `iph` (84 sites) — `map(() => '?').join(',')` placeholder lists.
- `src/routes/payroll/shared.ts:348` `dependents_${safeDeps}` — clamped to 1..11 via `Math.max(1, Math.min(11, dependents))`.
- `src/utils/sequenceGenerator.ts:24-25` `${table}` / `${column}` — all 16 call sites pass string literals; `prefix` is bound, and only `prefix.length` is interpolated.
- `src/routes/messages.ts:991`, `src/routes/printEvents.ts:1071`, `src/services/messageAudience.ts:83` `${days}` — clamped integer or passed via `.bind()`.

---

## Category 2 — XSS

- `src/pages/purchaseInvoice.ts:6,138` — HIGH — XSS-REFLECTED — `var poId = c.req.param('poId')` taken raw (no `parseInt`/`isNaN`, unlike its three sibling print pages) and emitted as `var PO_ID = ${poId};` inside an inline `<script>`; `/purchase-invoice/1;alert(1)` executes attacker JS.
- `src/scripts/purchaseInvoice.js:125,126,127,132,133,134,135,181,182` — HIGH — XSS-001 — supplier `client_name`, `representative`, `address`, `phone`, `fax`, `business_type`, `business_item` plus company address and manager name concatenated raw into `innerHTML`; the entire file contains 3 escape calls.
- `src/scripts/cards/actions.js:94,97,100,104` — HIGH — XSS-004 — `clientName.replace(/'/g, '\x27')` replaces a single quote with the same single quote (no-op), so `client_name` reaches two `onclick="fn('…')"` attributes and a `<span>` body with quotes intact.
- `src/scripts/accounting.js:186` — HIGH — XSS-004 — `client_name` only backslash-escapes `'`; a `"` in the value closes the `onclick="…"` attribute and injects a new event handler.
- `src/scripts/forecast.js:89,128,156` — HIGH — XSS-001 — `client_name` and item `category` concatenated raw into `innerHTML`; line 128 escapes the `title` attribute but leaves the same value unescaped in the cell body.
- `src/scripts/bank.js:2159` — HIGH — XSS-001 — `a.bank_name` and `a.account_number` raw into `<option>`; the sibling select at `src/scripts/bank.js:1931` correctly uses `escHtml`.
- `src/scripts/items/core.js:196` — HIGH — XSS-001 — `c.category_name` raw into both the `<option value="…">` attribute and the option body.
- `src/scripts/inventoryCount.js:119` — HIGH — XSS-001 — item `category` raw into `<option value="…">` attribute and body.
- `src/scripts/productionReports.js:149` — HIGH — XSS-001 — `e.equipment_name` raw in the cell body while the `title` attribute on the same line is escaped.
- `src/scripts/taxInvoices.js:597` — HIGH — XSS-001 — `it.item_name || it.description` raw into a `<td>`.
- `src/scripts/items/modals.js:559,569,627,636` — HIGH — XSS-004 — `item_group` escaped for `'` only; a `"` breaks out of the `onclick` attribute.
- `src/scripts/payroll.js:54,55,64` — HIGH — XSS-004 — `employee_name` and `employee_mobile` escape `\` and `'` but not `"`, and land inside `onclick="sendPayslipNotice(…)"`.
- `src/scripts/orders.js:1387,1395` — MEDIUM — XSS-001 — `job.product`, `job.item_name`, `job.error_message` raw into `innerHTML`; `error_message` is written by the automation agent's PATCH body (`src/routes/autoProcess.ts:246`).
- `src/scripts/cardExpenses.js:485` — MEDIUM — XSS-004 — `c.icon` and `c.color` raw inside single-quoted `onclick` arguments, while `c.name` on the same line is escaped.
- `src/scripts/cardExpenses.js:224,607` — MEDIUM — XSS-004 — `tx.receipt_image_url` / `rUrl` raw inside `onclick="viewReceipt('…')"`.
- `src/scripts/postProcessing.js:124,129,134` — MEDIUM — XSS-ATTR — `data.unit`, `data.options`, `data.default` interpolated into `value="${…}"` with no escaping; values come from the admin-authored `parameter_schema` JSON.
- `src/scripts/cashSchedule.js:366,368` — MEDIUM — XSS-004 — HTML-escapes `& < > "` then maps `'` to `\'` without doubling backslashes first, so a client name containing `\'` terminates the JS string.
- `src/scripts/reports.js:395` — MEDIUM — XSS-001 — `c.category_name` raw into `innerHTML`.
- `src/pages/hrDetail.ts:8,44` — MEDIUM — XSS-ATTR — `id` route param taken raw into `data-employee-id="${id}"`; the sibling `src/pages/clientDetail.ts:7` guards the same param with `parseInt`.
- `src/pages/payslip.ts:8,189` — MEDIUM — XSS-REFLECTED — `var ID_PARAM = ${JSON.stringify(idParam)}` does not neutralize a literal `</script>` in the path param, which closes the script element early.
- `src/index.tsx:244-248` — MEDIUM — NO-CSP — only `X-Frame-Options` and `X-Content-Type-Options` are set; no `Content-Security-Policy`. Combined with the JWT stored in `localStorage` (`src/pages/login.ts:129`, `src/scripts/layout/shell.js:934`), any of the above yields full session theft.
- `src/scripts/equipment.js:1355` — LOW — XSS-001 — `item.description.replace(/</g, '&lt;')` escapes only `<`; safe in this element-text context but inconsistent with the global helper.

**Checked: 109 files, 1,565 HTML sinks (`innerHTML` / `insertAdjacentHTML` / `outerHTML` / `document.write` / `c.html`); ~200 sinks carrying interpolated data read individually.**

Escape-helper contract verified: `window.escapeHtml` (`src/scripts/layout/shell.js:111`, and `src/pages/portal/portalLayout.ts:68` for the portal) escapes `& < > " '` — including the single quote, so correctly-wrapped `onclick` arguments are safe.

### False positives rejected (Category 2)

- All `st.label`, `s.label`, `urgency.label`, `config.label`, `timeRem.text`, `pc.text`, `step.label`, `dir.label`, `side.label` hits (~30 sites) — values come from module-level constant maps, not user data.
- `src/scripts/inventory.js:223` and `src/scripts/ledger.js:198` — `escapeHtml(x).replace(/'/g,"\\'")` is safe; `escapeHtml` already converts `'` to `&#039;`, so the second replace matches nothing and no raw quote survives.
- `src/scripts/items/tabs.js:114,156` and `src/scripts/items/modals.js:649` — `.replace(/['"]/g,'')` strips both quote characters, so neither attribute nor JS-string breakout is possible.
- `src/scripts/paymentRequests.js:148` (`request_number`), `src/scripts/orders.js:1316-1318` (`order_number`, `status`) — system-generated codes and enum values, not free text.
- Local `esc` fallbacks that omit `'` (`src/scripts/cardDetail.js:7`, `src/scripts/cards/detail.js:412`, `src/scripts/equipment/queue.js:4`) — dead branches; `window.escapeHtml` is always injected by the global shell and does escape `'`.

---

## Category 2b — CSV Formula Injection

Server side is fully guarded. `src/utils/csv.ts:77` `escapeCsvField` prefixes `'` on non-numeric strings starting with `= + - @`, tab or CR while preserving numeric negatives via `typeof val !== 'number' && isNaN(Number(str.replace(/,/g,'')))`. Every server export routes through it: `src/routes/bank.ts:2548`, `src/routes/inventory.ts:274`, `src/routes/payroll/tax-agent.ts:23`, `src/routes/shipments.ts:1416`, plus `generateCsv` and `csvStreamResponse`. The client SSOT `window.dsCsvCell` (`src/utils/csv.ts:95`, injected by `layout.ts`) mirrors the same rule. Three client exports bypass both.

- `src/scripts/vatReports.js:209,217` — HIGH — CSV-001 — rows built by `[...].join(',')` with no escaping of any kind. `buyer_name` and `supplier_name` are free-text client names, so a leading `=` yields a live formula (`=HYPERLINK`/`WEBSERVICE` data exfiltration, DDE) and an embedded comma silently shifts every later column.
- `src/scripts/ledger.js:1571` — HIGH — CSV-001 — `'"' + (sp.client_name || '') + '"'` wraps in quotes without doubling embedded `"`, so a supplier name containing a quote breaks the row; no `= + - @` guard either.
- `src/scripts/ledger.js:1068,1086,1587` — MEDIUM — CSV-002 — three exports (`exportClientsCSV`, `exportTransactionsCSV`, `exportPurchaseTransactionsCSV`) double embedded quotes correctly but omit the formula guard. Sources are `client_name`, `client_code` and table-cell text including the free-text 비고 column.

**Checked: 3 server helpers plus 13 client export paths; 8 of the 13 correctly delegate to `dsCsvCell`.**

### False positives rejected (Category 2b)

- `src/scripts/priceManagement.js:1277` (`pmCsvCell`), `src/scripts/taxInvoices.js:180` (`tiCsvCell`), `src/scripts/payroll.js:1206` (`prCsvCell`) — each delegates to `window.dsCsvCell` first and only falls back when it is absent.
- `src/scripts/cardExpenses.js:771`, `src/scripts/inspections.js:285`, `src/scripts/inventoryTx.js:226`, `src/scripts/payroll.js:660` — these download `res.data` produced server-side by `escapeCsvField`.
- `src/scripts/payroll.js:1215,1233` — joined values are constant column labels and `Math.round` numerics.
- `src/scripts/accounting.js:527` — `var esc = window.dsCsvCell`, the guarded SSOT.
