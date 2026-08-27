#!/usr/bin/env node
/**
 * 정적 Entity 필터 감사 (CI PR 게이트 — verify.yml)
 *
 * src/routes 전체의 .prepare(`...`) SQL을 추출해, entity_id가 있는 테이블을
 * FROM/JOIN으로 참조하는 SELECT가 entityFilter를 적용했는지 정적 검사한다.
 * 누락 발견 시 비0 종료 → PR 검증 실패.
 *
 * 검사 대상 테이블 = bank/card 격리 핵심군 8개로 **의도적으로 좁게 유지**(전체
 * entity_id 테이블은 110개+, 2026-07-17 auto-improve Area6 실측 — 목록을 그대로
 * 확장하면 SELECT 위반 후보가 8→349건으로 폭증하고 대부분 개별 파일 맥락 판단이
 * 필요해[전역 대시보드 집계·부모 JOIN으로 이미 격리·ADMIN 전용 등] 이 단순 정규식
 * 스크립트로는 큐레이션 없이 하드게이트화 불가 — 확장 시 반드시 후보를 개별
 * 검토해 ALLOWLIST에 반영 후 반영할 것, 기계적 목록 교체 금지).
 * 예외(통과): ① 같은 prepare 블록 SQL에 `.clause}` 보간(=entityFilter clause)
 *            ② 단건 PK 조회(WHERE ... id = ?)  ③ COUNT 등 비행 조회라도 위 조건 충족 시
 *            ④ ALLOWLIST 스니펫  ⑤ entityFilter 헬퍼 대신 **직접** `<별칭>.entity_id`를 WHERE에서 좁힌 경우
 *
 * ★⑤를 왜 넣었나(2026-08-27) — `financialReports.ts` 6곳이 법인 번호 E를 손으로 바인딩해
 *   (`ba.entity_id=?`·`cc.entity_id=?`) 실제로는 격리돼 있는데 헬퍼를 안 써서 계속 잡혔다.
 *   08-24부터 상시 빨간 상태라 아무도 안 보게 된다 → 게이트가 죽는다(`feedback-gate-must-be-fixable`).
 *   file:line 예외 목록 대신 **패턴을 인정**한 이유는 그 목록이 리팩터링마다 썩기 때문.
 *   ⑤는 게이트를 느슨하게 만드는 규칙이라 **자기검사 7건을 평시 실행 경로에 박아 뒀다**
 *   (`--selftest`로 단독 실행도 가능). 실제로 초안이 `GROUP BY ba.entity_id`를 필터로 오인했고
 *   자기검사가 그걸 잡았다 — 별칭 대조 없이 `entity_id` 존재만 보면 **다른 테이블** 필터로도 뚫린다.
 *
 * ⚠️ 알려진 사각(2026-07-17 codify) — 이 스크립트는 SELECT만 검사한다(`isSelect`
 * 필터). auto-improve 누적 40+회차 실측상 실제 확정된 IDOR 다수(#349·#356·#437·
 * #452·#455·#473·#481·#521·#527·#529·#539 등)는 거의 전부 **UPDATE/DELETE/
 * PUT·PATCH mutate 핸들러**의 bare `WHERE id = ?`에서 발생했고, 그 클래스는
 * "같은 파일의 list가 entityFilter를 쓰는데 단건 write만 안 쓴다"는 형제-비대칭이
 * 근거라 파일 단위 교차분석이 필요 — 이 정적 SELECT 스캔만으로는 안 잡힌다.
 * 이 스크립트 통과 ≠ write-path IDOR 없음. 그 클래스는 auto-improve Area 5
 * 형제-비대칭 자동스캔(#452 레시피) 또는 `/security-audit`으로 별도 확인할 것 —
 * "단건 조회 WHERE id=? 예외"를 write 핸들러에도 안전하다고 오독 금지
 * (`.claude/skills/entity-audit/SKILL.md`·`security-audit/SKILL.md` 참조).
 *
 * 실행: node scripts/entity-audit.mjs   (--verbose 로 통과 쿼리도 출력)
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ENTITY_TABLES = [
  'bank_transactions', 'bank_accounts', 'bank_match_rules',
  'card_fee_rates', 'corporate_cards', 'card_transactions',
  'expense_categories', 'expense_auto_rules',
]

const ROOT = 'src/routes'
const VERBOSE = process.argv.includes('--verbose')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

/** .prepare(`...`) 백틱 SQL 블록을 (시작줄, sql) 목록으로 추출 */
function extractPreparedSql(src) {
  const blocks = []
  const re = /\.prepare\(\s*`/g
  let m
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length
    // 백틱 종료 위치 탐색(중첩 ${} 내부 백틱은 이 코드베이스에 없음 — 단순 스캔)
    let i = start
    let depth = 0
    for (; i < src.length; i++) {
      const ch = src[i]
      if (ch === '\\') { i++; continue }
      if (ch === '$' && src[i + 1] === '{') { depth++; i++; continue }
      if (ch === '}' && depth > 0) { depth--; continue }
      if (ch === '`' && depth === 0) break
    }
    const sql = src.slice(start, i)
    const line = src.slice(0, m.index).split('\n').length
    blocks.push({ line, sql })
  }
  return blocks
}

function referencesEntityTable(sql) {
  const hits = []
  for (const t of ENTITY_TABLES) {
    // FROM <t> 또는 JOIN <t> (별칭 허용)
    const re = new RegExp(`\\b(FROM|JOIN)\\s+${t}\\b`, 'i')
    if (re.test(sql)) hits.push(t)
  }
  return hits
}

// 별칭 자리에 올 수 없는 토큰 — `FROM bank_accounts WHERE` 의 WHERE 를 별칭으로 오인 금지
const NOT_AN_ALIAS = new Set([
  'on', 'where', 'group', 'order', 'having', 'limit', 'offset', 'union', 'set',
  'join', 'left', 'right', 'inner', 'outer', 'cross', 'full', 'using', 'and', 'or', 'values',
])

/** FROM/JOIN 으로 들어온 entity 테이블의 **별칭**(없으면 테이블명) 목록 */
function entityAliases(sql) {
  const out = []
  for (const t of ENTITY_TABLES) {
    const re = new RegExp(`\\b(?:FROM|JOIN)\\s+${t}\\b(?:\\s+(?:AS\\s+)?([a-z][a-z0-9_]*))?`, 'gi')
    let m
    while ((m = re.exec(sql)) !== null) {
      const a = m[1]
      out.push(a && !NOT_AN_ALIAS.has(a.toLowerCase()) ? a : t)
    }
  }
  return out
}

// 명시적 예외 — 의도된 비-entityFilter 쿼리(스니펫 부분일치). 추가 시 사유 주석 필수.
const ALLOWLIST = [
  // CSV import 중복체크: bank_account_id로 스코프(계좌=법인 종속), 관리자 import 흐름
  'FROM bank_transactions WHERE bank_account_id = ? AND transaction_date IN',
  // findLinkCandidates(bank.ts): 외부 SELECT는 purchase_payments FROM + COALESCE(entity_id,1)=?로 이미 법인 필터. bank_transactions는 NOT EXISTS 안티조인이라 테이블 오귀속(#529 검증)
  'FROM purchase_payments pp WHERE pp.supplier_id = ?',
  // findLinkCandidates(bank.ts): payments FROM + COALESCE(entity_id,1)=? 필터. 동일 오귀속
  'FROM payments p WHERE p.client_id = ? AND ABS(p.amount - ?) < 0.01',
  // cron.ts 무결성 트립와이어(0451): 전 법인 content_key 중복감지 = 의도된 글로벌 집계(cron 실행·사용자 entity 컨텍스트 없음)
  'FROM bank_transactions GROUP BY content_key HAVING COUNT(*) > 1',
]

function isCompliant(sql, fileSrc) {
  // ① entityFilter clause 직접 보간 (${ef.clause})
  if (/\$\{[^}]*\.clause\}/.test(sql)) return true
  // ② 합성 절 변수(${where}/${filter}/${cond}…)가 파일 내에서 entityFilter로 구성됨
  const m = sql.match(/\$\{(where|whereClause|filter|cond|conditions?)\}/i)
  if (m) {
    const re = new RegExp(`\\b${m[1]}\\b[\\s\\S]{0,200}?(ef\\.clause|entityFilter|\\.clause)`)
    if (re.test(fileSrc)) return true
  }
  // ③ 단건 PK 조회 (별칭.id = ? 또는 id = ?) — 목록/집계 아닐 때
  if (/\bWHERE\b[\s\S]*?\b([a-z_]+\.)?\bid\s*=\s*\?/i.test(sql) &&
      !/\bGROUP\s+BY\b/i.test(sql) && !/\bLIMIT\b/i.test(sql)) return true
  // ⑤ entityFilter 헬퍼를 **안 쓰고 직접** entity_id 를 좁힌 경우
  //    (financialReports.ts 처럼 법인 번호 E 를 손으로 넘겨 집계하는 라우트)
  //    ★조건: 이 SQL 이 FROM/JOIN 한 entity 테이블의 **그 별칭**이 WHERE 안에서
  //      entity_id 로 비교돼야 한다. 별칭을 맞춰 보지 않으면 `WHERE o.entity_id=?`
  //      같은 **다른 테이블** 필터로도 통과해 버려 격리가 뚫린다.
  //    ⚠️ 한계 — `${ef.clause}`(①) 와 마찬가지로 "바인딩 값이 세션 법인인가"까지는
  //      정적으로 못 본다. `OR` 로 무력화한 절도 문자열로는 구분 못 한다.
  //      자식 테이블(bank_transactions·card_transactions)은 부모(bank_accounts·
  //      corporate_cards) 한쪽만 걸려 있어도 격리가 성립하므로 **하나라도** 맞으면 통과.
  const whereIdx = sql.search(/\bWHERE\b/i)
  if (whereIdx >= 0) {
    // ★WHERE 부터 GROUP/ORDER/LIMIT **앞까지만** — 안 자르면 `GROUP BY ba.entity_id`
    //   같은 집계 키가 필터로 오인된다(자기검사 7번이 이걸 잡았다).
    let cond = sql.slice(whereIdx)
    const tail = cond.search(/\b(GROUP\s+BY|ORDER\s+BY|LIMIT|WINDOW)\b/i)
    if (tail >= 0) cond = cond.slice(0, tail)
    for (const a of entityAliases(sql)) {
      const qualified = new RegExp(`\\b${a}\\.entity_id\\b`, 'i')
      const bare = new RegExp(`(^|[^.\\w])entity_id\\b`, 'i')
      if (qualified.test(cond)) return true
      // 별칭이 테이블명 자체 = 단일 테이블이라 무자격 entity_id 가 모호하지 않다
      if (ENTITY_TABLES.includes(a) && bare.test(cond)) return true
    }
  }
  // ④ 명시적 allowlist
  const flat = sql.replace(/\s+/g, ' ').trim()
  if (ALLOWLIST.some(a => flat.includes(a))) return true
  return false
}

// ── 자기검사 (`node scripts/entity-audit.mjs --selftest`) ────────────────────
// ⑤ 는 게이트를 **느슨하게** 만드는 규칙이라 회귀 주입 검출을 고정해 둔다.
// 2026-08-27: financialReports.ts 6건이 오탐으로 계속 잡혀 규칙을 추가하며 신설.
const SELFTEST = [
  // [통과해야 함] 부모(bank_accounts) 별칭으로 직접 좁힘 — financialReports.ts:82 실물 형태
  [true, `SELECT ec.name nm, SUM(bt.amount) amt FROM bank_transactions bt
          JOIN bank_accounts ba ON ba.id=bt.bank_account_id
          JOIN expense_categories ec ON ec.id=bt.matched_category_id
          WHERE ba.entity_id=? AND bt.transaction_date BETWEEN ? AND ? GROUP BY ec.name`],
  // [통과] corporate_cards 별칭으로 직접 좁힘 — financialReports.ts:89 실물 형태
  [true, `SELECT ec.name nm, SUM(t.amount) amt FROM card_transactions t
          JOIN corporate_cards cc ON cc.id=t.card_id
          JOIN expense_categories ec ON ec.id=t.category_id
          WHERE cc.entity_id=? GROUP BY ec.name`],
  // [통과] 단일 테이블 + 무자격 entity_id
  [true, `SELECT * FROM bank_accounts WHERE entity_id = ? ORDER BY id`],
  // [통과] COALESCE 로 감싼 형태
  [true, `SELECT * FROM bank_accounts ba WHERE COALESCE(ba.entity_id,1) = ?`],
  // [★차단] 아무 필터 없는 목록
  [false, `SELECT * FROM bank_transactions bt ORDER BY bt.transaction_date DESC LIMIT 50`],
  // [★차단] entity_id 는 있으나 **다른 테이블**(orders) 것 — 별칭 대조가 막아야 한다
  [false, `SELECT bt.* FROM bank_transactions bt JOIN orders o ON o.id=bt.order_id
           WHERE o.entity_id = ? GROUP BY bt.id`],
  // [★차단] entity_id 가 SELECT 절에만 있고 WHERE 에는 없다
  [false, `SELECT ba.entity_id, bt.amount FROM bank_transactions bt
           JOIN bank_accounts ba ON ba.id=bt.bank_account_id WHERE bt.amount > ? GROUP BY ba.entity_id`],
]

function runSelftest() {
  let bad = 0
  for (const [want, sql] of SELFTEST) {
    const got = isCompliant(sql, '')
    if (got !== want) { bad++; console.log(`  ✗ 기대 ${want ? '통과' : '차단'} → 실제 ${got ? '통과' : '차단'}\n    ${sql.replace(/\s+/g, ' ').trim().slice(0, 100)}`) }
  }
  return bad
}

if (process.argv.includes('--selftest')) {
  const bad = runSelftest()
  console.log(bad ? `\n자기검사 실패 ${bad}/${SELFTEST.length}` : `자기검사 OK ${SELFTEST.length}/${SELFTEST.length}`)
  process.exit(bad ? 1 : 0)
}

// ★평시에도 먼저 돌린다 — 별도 npm 스크립트로 빼면 아무도 안 돌린다(스킬·워크플로 배선 불필요).
if (runSelftest()) {
  console.log('\n⛔ 감사 규칙 자체가 깨졌다 — 위 자기검사부터 고칠 것 (`--selftest`)')
  process.exit(2)
}

const files = walk(ROOT)
let queryCount = 0
const violations = []
const passed = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const { line, sql } of extractPreparedSql(src)) {
    const isSelect = /^\s*SELECT|\(\s*SELECT/i.test(sql.trim()) || /^\s*WITH\b/i.test(sql.trim())
    if (!isSelect) continue
    const tables = referencesEntityTable(sql)
    if (tables.length === 0) continue
    queryCount++
    if (isCompliant(sql, src)) {
      passed.push({ file, line, tables })
    } else {
      violations.push({ file, line, tables, snippet: sql.replace(/\s+/g, ' ').trim().slice(0, 90) })
    }
  }
}

console.log('Entity 필터 정적 감사 (CI)')
console.log('━'.repeat(40))
console.log(`검사 파일: ${files.length} · entity테이블 SELECT: ${queryCount} · 통과: ${passed.length} · 누락: ${violations.length}`)

if (VERBOSE) {
  for (const p of passed) console.log(`  ✓ ${p.file}:${p.line} [${p.tables.join(',')}]`)
}

if (violations.length) {
  console.log('\n[누락 — entityFilter 미적용 SELECT]')
  for (const v of violations) {
    console.log(`  ✗ ${v.file}:${v.line} — ${v.tables.join(',')}\n     ${v.snippet}`)
  }
  console.log('\n→ entityFilter(c, alias) 적용 후 SQL에 ${ef.clause} + .bind(...ef.params) 추가 필요.')
  console.log('  (의도된 전체집계라면 이 스크립트의 예외 처리에 추가)')
  process.exit(1)
}
console.log('\n✅ 누락 없음')
