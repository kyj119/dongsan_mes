#!/usr/bin/env node
/**
 * 로컬 D1 = prod 스냅샷(스키마 전체 + 마스터 테이블만)  —  `npm run journey:snapshot`
 *
 * 왜 있나 (2026-09-11):
 *   여정 테스트는 「사람처럼」 거래처·품목을 검색해야 하는데 로컬 D1 은 품목 75개·마이그 70개 뒤(0545~)였다.
 *   `db:reset` 은 2026-07 기준선 + 마이그 리플레이라 prod 행 id 를 박은 데이터 마이그에서 깨진다.
 *   그래서 마이그를 거치지 않고 **prod 스키마를 그대로** 받고, 데이터는 **마스터만** 받는다(5.3MB).
 *
 * 안 받는 것 = 전표(orders·ledger·bank_transactions…)·사람(users·employees)·로그.
 *   여정이 전표를 스스로 만들고, 로그인은 seed_users.sql(admin/password) 로 한다.
 *
 * ⚠️ `.wrangler` 는 worktree 간 junction 공유 — 이 스크립트는 **모든 세션의 로컬 D1** 을 갈아 끼운다.
 *    prod 는 `--remote` 읽기(export)만 한다. 쓰기는 전부 `--local`.
 *
 * 옵션: --skip-export  (캐시 `.journey/snapshot/*.sql` 재사용)
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const CACHE = path.join(ROOT, '.journey', 'snapshot')
const DB = 'webapp-production'
const SKIP_EXPORT = process.argv.includes('--skip-export')

// 여정(J1~J4)이 읽는 마스터. 전표·사람·로그는 제외. 순서 = 부모 먼저(defer_foreign_keys 가 있어도 읽기 쉽게).
// FK 닫힘까지 포함한다(items→spec_groups·print_media…, clients→price_policies, equipment→facility_zones).
// 빠뜨리면 `--file` 배치 끝의 deferred FK 검사에서 **전체가 롤백**된다(2026-09-11 실측). 0행 테이블도 스키마 대조용으로 둔다.
const MASTER_TABLES = [
  'entities', 'settings', 'holidays', 'expense_categories', 'bank_accounts',
  'item_categories', 'item_subcategories', 'spec_groups', 'price_groups', 'print_methods', 'print_media',
  'items', 'product_materials', 'post_processing_options', 'finishing_methods',
  'item_group_settings', 'cost_standards', 'pp_material_deductions',
  'billing_groups', 'price_policies', 'clients', 'client_item_prices', 'credit_overrides',
  'facility_zones', 'storage_zones', 'inventory', 'equipment',
]

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...opts })
}
function d1Local(args) { return sh(`npx wrangler d1 execute ${DB} --local ${args}`) }
function d1Json(sql, remote = false) {
  const raw = sh(`npx wrangler d1 execute ${DB} ${remote ? '--remote' : '--local'} --json --command="${sql.replace(/"/g, '\\"')}"`)
  return JSON.parse(raw.slice(raw.indexOf('[')))[0].results
}
function count(table, remote = false) { return d1Json(`SELECT COUNT(*) n FROM ${table}`, remote)[0].n }

fs.mkdirSync(CACHE, { recursive: true })
const schemaFile = path.join(CACHE, 'schema.sql')
const dataFile = path.join(CACHE, 'masters.sql')

// 1) prod 에서 읽기(export) — 쓰기 없음
if (!SKIP_EXPORT) {
  console.log('[1/5] prod 스키마 export …')
  sh(`npx wrangler d1 export ${DB} --remote --no-data --output="${schemaFile}"`)
  console.log('[1/5] prod 마스터 export …')
  sh(`npx wrangler d1 export ${DB} --remote --no-schema ${MASTER_TABLES.map(t => `--table ${t}`).join(' ')} --output="${dataFile}"`)
} else {
  if (!fs.existsSync(schemaFile) || !fs.existsSync(dataFile)) { console.error('캐시 없음 — --skip-export 를 빼고 실행'); process.exit(2) }
  console.log('[1/5] export 생략(캐시 재사용)')
}
console.log(`      schema ${(fs.statSync(schemaFile).size / 1024).toFixed(0)}KB · masters ${(fs.statSync(dataFile).size / 1024 / 1024).toFixed(2)}MB`)

// 2) 로컬 D1 파일 제거 (백업은 호출자 책임 — 여정 루프에서는 버리는 DB 다)
console.log('[2/5] workerd 종료 + 로컬 D1 파일 제거')
try { sh('taskkill /F /IM workerd.exe') } catch {}
const d1dir = path.join(ROOT, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')
if (fs.existsSync(d1dir)) for (const f of fs.readdirSync(d1dir)) if (/\.sqlite/.test(f)) fs.unlinkSync(path.join(d1dir, f))

// 3) 스키마 → users(비밀번호·연락처 지움) → entities(이미지 지움) → 마스터 → seed 유저
//    각 `--file` 이 한 배치라 **참조되는 쪽을 먼저** 넣어야 한다(entities 를 뒤에 넣었더니 inventory.entity_id 로 전체 롤백).
console.log('[3/5] 스키마 적용'); d1Local(`--file="${schemaFile}"`)
const lit = v => v == null ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"
const writeRows = (file, table, rows, cols) =>
  fs.writeFileSync(file, rows.map(r => `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(c => lit(r[c])).join(',')});`).join('\n') + '\n')

// users: settings·clients 등이 created_by 로 참조하고, 여정이 **역할별 실계정**으로 로그인하려면 있어야 한다.
//   해시는 전부 'password'(평문 시드 → 첫 로그인 시 PBKDF2 승격 = seed_users.sql 과 같은 관례)·이메일·전화는 NULL.
console.log('[3/5] users 적재(비밀번호=password · 연락처 NULL)')
const users = d1Json('SELECT * FROM users', true).map(u => ({ ...u, password_hash: 'password', email: null, phone: null }))
const userFile = path.join(CACHE, 'users.sql')
writeRows(userFile, 'users', users, Object.keys(users[0]))
d1Local(`--file="${userFile}"`)

// entities: stamp_base64·logo_base64(도장·로고 이미지, 행당 127KB)가 SQLITE_TOOBIG → 그 두 컬럼만 NULL.
console.log('[3/5] entities 적재(이미지 컬럼 NULL)')
const BIG_COLS = new Set(['stamp_base64', 'logo_base64'])
const ents = d1Json('SELECT * FROM entities', true)
const entFile = path.join(CACHE, 'entities.sql')
writeRows(entFile, 'entities', ents, Object.keys(ents[0]).filter(c => !BIG_COLS.has(c)))
d1Local(`--file="${entFile}"`)

console.log('[3/5] 마스터 적재(entities 제외)')
const filtered = path.join(CACHE, 'masters.filtered.sql')
fs.writeFileSync(filtered, fs.readFileSync(dataFile, 'utf8').split('\n').filter(l => !l.startsWith('INSERT INTO "entities"')).join('\n'))
d1Local(`--file="${filtered}"`)

console.log('[3/5] seed 유저(admin/manager/operator — 이미 있으면 무시)'); d1Local(`--file="${path.join(ROOT, 'seed', 'seed_users.sql')}"`)

// 4) 마이그 applied 마킹 — 전 파일. 안 하면 누군가 db:migrate:local 을 치는 순간 0001 부터 리플레이된다.
console.log('[4/5] d1_migrations 마킹')
const migs = fs.readdirSync(path.join(ROOT, 'migrations')).filter(f => f.endsWith('.sql')).sort()
const markFile = path.join(CACHE, 'mark.sql')
fs.writeFileSync(markFile, 'INSERT OR IGNORE INTO d1_migrations(name) VALUES ' + migs.map(m => `('${m}')`).join(',') + ';\n')
d1Local(`--file="${markFile}"`)

// 5) 검증 — exit code 가 아니라 행수로 판정한다(wrangler --file 가짜오류 전례)
console.log('[5/5] 검증')
let bad = 0
for (const t of ['items', 'clients', 'inventory', 'product_materials', 'settings', 'users', 'orders']) {
  const n = count(t)
  const expect = t === 'orders' ? 0 : null
  const ok = expect == null ? n > 0 : n === expect
  if (!ok) bad++
  console.log(`      ${ok ? 'OK ' : 'BAD'} ${t}=${n}`)
}
console.log(`      d1_migrations=${count('d1_migrations')} (files ${migs.length})`)
process.exit(bad ? 1 : 0)
