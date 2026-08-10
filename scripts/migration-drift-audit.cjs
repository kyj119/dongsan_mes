#!/usr/bin/env node
/**
 * 마이그레이션 드리프트 감사 — 마이그레이션이 요구하는 스키마가 실제 DB에 있는가
 * (npm run audit:migration-drift)
 *
 * 왜 있나: prod 의 `d1_migrations` 추적은 0313 에서 멈춰 있다. 이후 분은
 *   `wrangler d1 execute --file` 로 직접 적용해 와서 **목록으로는 적용 여부를 알 수 없다**.
 *   2026-08-10 배포에서 0528 미적용 상태로 `bank_accounts.is_overdraft` 를 참조하는 코드가
 *   나가 `/api/bank/accounts` 가 500 났다(prod 장애). 타입체크·빌드·스모크는 SQL 스키마를
 *   모르므로 셋 다 통과시킨다 — 이 축을 볼 도구가 없던 게 근본 원인이다.
 *
 * 무엇을 보나: 파일 **목록**이 아니라 **결과물**을 본다.
 *   ① migrations/*.sql 을 번호순으로 읽어 CREATE / DROP / RENAME 을 **순서대로 시뮬레이션** →
 *      "최종적으로 존재해야 할 객체" 집합을 만든다.
 *   ② 실제 DB 의 sqlite_master 와 대조한다.
 *   재빌드 임시 테이블(`x_new` 만들고 RENAME, `_bak_*` 만들고 DROP)은 시뮬레이션이 스스로
 *   걷어내므로 오탐이 안 뜬다. 테이블을 DROP 하면 그 테이블의 인덱스도 함께 요구에서 빠진다
 *   (SQLite 실제 동작과 같게). ⚠️ 반대로 **테이블 재빌드가 인덱스를 다시 안 만들면 잡힌다** —
 *   0448 이 storage_zones 를 재빌드하며 0391 의 인덱스를 빠뜨린 게 이 방식으로 발견됐다.
 *
 * 창(window): **기본은 전수(0001~)**. 한때 "추적 밖만 보면 된다"고 좁혔다가 `orders.receipt_type` 을
 *   놓칠 뻔했다 — 0189 는 `d1_migrations` 에 **적용됨으로 기록돼 있는데** 0262 의 orders 재빌드가 그 컬럼을
 *   빠뜨려 실제로는 없다. 즉 **추적은 신뢰할 수 없고**, 추적 여부와 무관하게 결과물을 봐야 한다.
 *   비용도 같다(원격 질의 1회 · 파싱만 늘어남). 좁히려면 `--from=NNNN`.
 *
 * 한계: 정규식 파싱이라 문자열 리터럴 안의 `--` 나 DDL 처럼 보이는 텍스트는 구분 못 한다.
 *   `UPDATE`/`INSERT` 같은 데이터 변경은 애초에 대상이 아니다(스키마 객체만 본다).
 *
 * 사용:
 *   npm run audit:migration-drift                 # prod (기본)
 *   node scripts/migration-drift-audit.cjs --local
 *   node scripts/migration-drift-audit.cjs --from=1 --json
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const MIG_DIR = path.join(ROOT, 'migrations')

const argv = process.argv.slice(2)
const hasFlag = (f) => argv.includes(f)
const getOpt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const JSON_OUT = hasFlag('--json')
const LOCAL = hasFlag('--local')
const FROM_OPT = getOpt('from')

// DB 이름은 wrangler.jsonc 에서 읽는다 — 여기 적으면 둘이 갈린다
function dbName() {
  const explicit = getOpt('db')
  if (explicit) return explicit
  for (const f of ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(/database_name["']?\s*[:=]\s*["']([^"']+)["']/)
    if (m) return m[1]
  }
  throw new Error('database_name 을 wrangler 설정에서 찾지 못했다 — --db=<이름> 으로 지정')
}

// wrangler 를 npx(.cmd) 로 부르면 Windows 에서 인용이 깨지거나 spawn ENOENT 가 난다
// → JS 엔트리를 node 로 직접 실행하면 shell:false 라 SQL 을 그대로 넘길 수 있다
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function d1(sql, { optional = false } = {}) {
  // ⚠️ --file 은 행이 아니라 실행 통계만 준다 → 조회는 반드시 --command
  const args = ['d1', 'execute', dbName(), LOCAL ? '--local' : '--remote', '--command', sql, '--json']
  const r = spawnSync(process.execPath, [WRANGLER, ...args], {
    cwd: ROOT, encoding: 'utf8', shell: false, maxBuffer: 128 * 1024 * 1024,
  })
  const out = `${r.stdout || ''}`
  const i = out.indexOf('[')
  if (r.status !== 0 || i < 0) {
    if (optional) return null
    throw new Error(`wrangler d1 실패 (exit ${r.status})\n${(r.stderr || out).slice(0, 1200)}`)
  }
  try {
    return JSON.parse(out.slice(i)).flatMap((x) => x.results || [])
  } catch (e) {
    if (optional) return null
    throw new Error(`d1 응답 파싱 실패: ${e.message}`)
  }
}

// ── SQL 파싱 헬퍼 ────────────────────────────────────────────────
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
const norm = (s) => String(s || '').replace(/["'`\[\]]/g, '').toLowerCase()

function parenBody(text, fromIdx) {
  const open = text.indexOf('(', fromIdx)
  if (open < 0 || text.slice(fromIdx, open).trim() !== '') return null
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i)
  }
  return null
}

function splitTopLevel(body) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

// 컬럼 정의에서 이름만. 테이블 제약(PRIMARY KEY(a,b) 등)은 컬럼이 아니다
const CONSTRAINT_KW = new Set(['primary', 'foreign', 'unique', 'check', 'constraint', 'key'])
function colNames(body) {
  const set = new Set()
  if (!body) return set
  for (const part of splitTopLevel(body)) {
    const first = norm(part.trim().split(/[\s(]+/)[0])
    if (!first || CONSTRAINT_KW.has(first) || !/^\w+$/.test(first)) continue
    set.add(first)
  }
  return set
}

// ── 1) 마이그레이션 시뮬레이션 ───────────────────────────────────
const reqTables = new Map()   // table -> file
const reqCols = new Map()     // table -> Map(col -> file)
const reqIndexes = new Map()  // index -> { table, file }
const reqViews = new Map()
const reqTriggers = new Map()

const colsOfReq = (t) => {
  if (!reqCols.has(t)) reqCols.set(t, new Map())
  return reqCols.get(t)
}

function dropTable(t) {
  reqTables.delete(t)
  reqCols.delete(t)
  for (const [ix, meta] of reqIndexes) if (meta.table === t) reqIndexes.delete(ix)
}

function renameTable(from, to, file) {
  if (reqTables.delete(from)) reqTables.set(to, file)
  const cols = reqCols.get(from)
  if (cols) { reqCols.delete(from); reqCols.set(to, cols) }
  for (const meta of reqIndexes.values()) if (meta.table === from) meta.table = to
}

const PATTERNS = [
  [/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`\[]?(\w+)["'`\]]?/gi, (m, file, body) => {
    const t = norm(m[1])
    reqTables.set(t, file)
    const cols = colNames(parenBody(body, m.index + m[0].length))
    const map = colsOfReq(t)
    for (const c of cols) map.set(c, file)
  }],
  [/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`\[]?(\w+)/gi, (m) => dropTable(norm(m[1]))],
  [/ALTER\s+TABLE\s+["'`\[]?(\w+)["'`\]]?\s+RENAME\s+TO\s+["'`\[]?(\w+)/gi,
    (m, file) => renameTable(norm(m[1]), norm(m[2]), file)],
  [/ALTER\s+TABLE\s+["'`\[]?(\w+)["'`\]]?\s+RENAME\s+(?:COLUMN\s+)?["'`\[]?(\w+)["'`\]]?\s+TO\s+["'`\[]?(\w+)/gi,
    (m, file) => {
      const map = colsOfReq(norm(m[1]))
      map.delete(norm(m[2]))
      map.set(norm(m[3]), file)
    }],
  [/ALTER\s+TABLE\s+["'`\[]?(\w+)["'`\]]?\s+DROP\s+(?:COLUMN\s+)?["'`\[]?(\w+)/gi,
    (m) => colsOfReq(norm(m[1])).delete(norm(m[2]))],
  [/ALTER\s+TABLE\s+["'`\[]?(\w+)["'`\]]?\s+ADD\s+(?:COLUMN\s+)?["'`\[]?(\w+)/gi, (m, file) => {
    const col = norm(m[2])
    if (CONSTRAINT_KW.has(col)) return
    colsOfReq(norm(m[1])).set(col, file)
  }],
  [/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`\[]?(\w+)["'`\]]?\s+ON\s+["'`\[]?(\w+)/gi,
    (m, file) => reqIndexes.set(norm(m[1]), { table: norm(m[2]), file })],
  [/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?["'`\[]?(\w+)/gi, (m) => reqIndexes.delete(norm(m[1]))],
  [/CREATE\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`\[]?(\w+)/gi, (m, file) => reqViews.set(norm(m[1]), file)],
  [/DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?["'`\[]?(\w+)/gi, (m) => reqViews.delete(norm(m[1]))],
  [/CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`\[]?(\w+)/gi, (m, file) => reqTriggers.set(norm(m[1]), file)],
  [/DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?["'`\[]?(\w+)/gi, (m) => reqTriggers.delete(norm(m[1]))],
]

function simulate(files) {
  for (const f of files) {
    const body = stripComments(fs.readFileSync(path.join(MIG_DIR, f), 'utf8'))
    const events = []
    for (const [re, apply] of PATTERNS) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(body))) events.push({ index: m.index, m, apply })
    }
    // 같은 파일 안에서도 실행 순서가 결과를 바꾼다(만들고 RENAME 하고 DROP)
    events.sort((a, b) => a.index - b.index)
    for (const e of events) e.apply(e.m, f, body)
  }
}

// ── 2) 실제 스키마 ───────────────────────────────────────────────
function actualSchema() {
  const rows = d1("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','view','trigger')")
  const tables = new Map()  // table -> Set(col)
  const indexes = new Set()
  const views = new Set()
  const triggers = new Set()
  for (const r of rows) {
    const name = norm(r.name)
    if (r.type === 'table') {
      // ⚠️ sqlite_master 의 sql 은 원문 그대로라 `-- 주석`이 살아 있다. 안 걷어내면 주석이 붙은
      //    컬럼의 **다음** 컬럼이 통째로 유실돼(첫 토큰이 `--`) 없는 드리프트가 무더기로 뜬다.
      tables.set(name, colNames(sqlBody(stripComments(String(r.sql || '')))))
    } else if (r.type === 'index') indexes.add(name)
    else if (r.type === 'view') views.add(name)
    else if (r.type === 'trigger') triggers.add(name)
  }
  return { tables, indexes, views, triggers }
}
// CREATE TABLE 문에서 컬럼 목록 괄호만 뽑는다(가장 바깥 첫 괄호)
function sqlBody(sql) {
  const open = sql.indexOf('(')
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === '(') depth++
    else if (sql[i] === ')' && --depth === 0) return sql.slice(open + 1, i)
  }
  return ''
}

// ── 3) 실행 ─────────────────────────────────────────────────────
function main() {
  const all = fs.readdirSync(MIG_DIR).filter((f) => /^\d{4}.*\.sql$/i.test(f)).sort()

  // 기본 전수. 추적은 판정에 쓰지 않고 정보로만 보여준다(추적 자체가 틀릴 수 있다 — 헤더 참고)
  const from = FROM_OPT ? parseInt(FROM_OPT, 10) : 1
  const t = d1('SELECT COUNT(*) AS n, MAX(name) AS last FROM d1_migrations', { optional: true })
  const tracked = t && t[0] ? t[0] : null

  const files = all.filter((f) => parseInt(f.slice(0, 4), 10) >= from)
  simulate(files)

  const actual = actualSchema()
  const drift = []
  const push = (file, kind, obj, note) => drift.push({ file, kind, obj, note })

  for (const [t, file] of reqTables) if (!actual.tables.has(t)) push(file, 'table', t)
  for (const [t, cols] of reqCols) {
    if (!actual.tables.has(t)) {
      if (!reqTables.has(t) && cols.size) push([...cols.values()][0], 'table(부모)', t, '창 이전에 만들어진 테이블이 없다')
      continue
    }
    const have = actual.tables.get(t)
    for (const [c, file] of cols) if (!have.has(c)) push(file, 'column', `${t}.${c}`)
  }
  for (const [ix, meta] of reqIndexes) {
    if (actual.indexes.has(ix)) continue
    const note = actual.tables.has(meta.table) ? undefined : '테이블 자체가 없다'
    push(meta.file, 'index', ix, note)
  }
  for (const [v, file] of reqViews) if (!actual.views.has(v)) push(file, 'view', v)
  for (const [g, file] of reqTriggers) if (!actual.triggers.has(g)) push(file, 'trigger', g)

  const checked = reqTables.size + [...reqCols.values()].reduce((a, m) => a + m.size, 0)
    + reqIndexes.size + reqViews.size + reqTriggers.size
  drift.sort((a, b) => String(a.file).localeCompare(String(b.file)))

  if (JSON_OUT) {
    console.log(JSON.stringify({
      target: LOCAL ? 'local' : 'remote', db: dbName(), from, files: files.length, checked, drift,
    }, null, 2))
    process.exit(drift.length ? 1 : 0)
  }

  console.log(`대상: ${dbName()} (${LOCAL ? 'local' : 'remote'})`)
  if (tracked) console.log(`d1_migrations 추적: ${tracked.n}건 · 마지막 ${tracked.last} (판정에는 쓰지 않음 — 추적도 틀릴 수 있다)`)
  console.log(`창: ${String(from).padStart(4, '0')}~ · 파일 ${files.length}개`)
  console.log(`객체 ${checked}개 대조 (테이블 ${reqTables.size} · 컬럼 ${[...reqCols.values()].reduce((a, m) => a + m.size, 0)} · 인덱스 ${reqIndexes.size} · 뷰 ${reqViews.size} · 트리거 ${reqTriggers.size})`)
  console.log('')

  if (!drift.length) {
    console.log('✅ 드리프트 없음 — 마이그레이션이 요구하는 스키마가 전부 존재한다')
    return
  }
  console.log(`❌ 드리프트 ${drift.length}건 — DB 에 없는 객체`)
  for (const d of drift) {
    console.log(`   ${d.file}  [${d.kind}]  ${d.obj}${d.note ? `  — ${d.note}` : ''}`)
  }
  console.log('')
  console.log('[조치] 해당 마이그레이션을 적용한다 (추적이 끊겨 있으므로 apply 가 아니라 직접 실행):')
  const firstFile = drift[0].file
  console.log(`   npx wrangler d1 execute ${dbName()} ${LOCAL ? '--local' : '--remote'} --file=migrations/${firstFile}`)
  console.log('   ⚠️ 재실행 안전(멱등)한지 파일을 먼저 확인 — IF NOT EXISTS / 중복 INSERT 여부')
  process.exit(1)
}

try {
  main()
} catch (e) {
  console.error(`❌ 감사 실패: ${e.message}`)
  process.exit(2)
}
