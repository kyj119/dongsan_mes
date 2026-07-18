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

// 명시적 예외 — 의도된 비-entityFilter 쿼리(스니펫 부분일치). 추가 시 사유 주석 필수.
const ALLOWLIST = [
  // CSV import 중복체크: bank_account_id로 스코프(계좌=법인 종속), 관리자 import 흐름
  'FROM bank_transactions WHERE bank_account_id = ? AND transaction_date IN',
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
  // ④ 명시적 allowlist
  const flat = sql.replace(/\s+/g, ' ').trim()
  if (ALLOWLIST.some(a => flat.includes(a))) return true
  return false
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
