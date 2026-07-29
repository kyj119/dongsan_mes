#!/usr/bin/env node
/**
 * 목록 정렬 tie-break 감사 (CLAUDE.md "알려진 함정" · review-checklist §15)
 *
 * ORDER BY 가 비고유 컬럼으로 끝나면 동값 구간의 순서가 미정의다.
 * 이관·배치 INSERT 데이터는 날짜/시각이 초 단위까지 동일해 동값 군집이 크고,
 * LIMIT/OFFSET 페이징에서는 페이지 간 행 중복·누락까지 발생한다.
 * (실제 사고: 발주 목록 258건 중 241건 동일 created_at → 첫 줄이 가장 오래된 발주. 2026-07-27)
 *
 * 사용법:
 *   node scripts/sort-audit.cjs                  # src/routes 전체, P1·P2만 출력
 *   node scripts/sort-audit.cjs orders           # 파일경로 정규식 필터
 *   node scripts/sort-audit.cjs --all            # P3·P4(집계·랭킹)까지 출력
 *   node scripts/sort-audit.cjs --json           # 기계 판독용
 *
 * 종료코드: P1(페이징 목록 미적용)이 하나라도 있으면 1 → CI/훅 게이트로 사용 가능
 *
 * ⚠️ 이 스크립트는 "후보"를 고른다. 최종 판단은 사람이 한다. 특히:
 *   - tie-break 키는 **최외곽 FROM(행 grain)** 의 PK여야 한다. 조인된 lookup 테이블 별칭을 쓰면 틀린다.
 *   - `SELECT DISTINCT` 는 ORDER BY가 출력 컬럼만 참조 가능하고, 고유키를 붙이면 DISTINCT 자체가 무의미해진다.
 *   - compound SELECT(UNION)도 출력 컬럼만 참조 가능 → 별칭(`t.id`) 불가.
 *   - `id` 컬럼이 없는 복합PK 테이블에 `id`를 붙이면 런타임 500. 아래 KNOWN_SAFE 참조.
 *   - 타입체크는 SQL 오류를 못 잡는다. 수정 후 반드시 로컬 D1에 prepare()/실행으로 확인할 것.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const SCAN_DIRS = ['src/routes', 'src/services', 'src/utils']

// 정렬 종결로 인정하는 고유 컬럼 (PK/UNIQUE)
const UNIQUE = /(^|\.|_)(id|rowid|item_code|employee_code|client_code|order_number|po_number|card_number|quotation_number|receipt_number|invoice_number|page_key|setting_key)$/i

// 집계/파생 별칭 — 행 정체성이 없는 랭킹 쿼리 (등급 P4)
const AGG = /^(total|count|cnt|sum|avg|amount|balance|score|shortage|qty|quantity|minutes?|sec|days?|rate|pct|ratio|value|revenue|usage|n)\w*$/i

/**
 * 이미 결정론적이라 tie-break 를 붙이면 안 되는 곳.
 * 라인번호는 밀리므로 (파일, 정규화된 ORDER BY 절) 로 매칭한다.
 */
const KNOWN_SAFE = [
  { file: 'src/routes/aiAnalysis.ts', clause: 'chunk_index ASC', why: 'ai_file_chunks: id 없음. PK(analysis_id,chunk_index) + WHERE analysis_id=? → 유일' },
  { file: 'src/routes/departments.ts', clause: 'd.sort_order, m.category', why: 'department_category_map: id 없음. category 가 PK → 유일' },
  { file: 'src/routes/rip.ts', clause: 'is_primary DESC, process_code ASC', why: 'equipment_processes: id 없음. PK(equipment_id,process_code) + WHERE equipment_id=? → 유일' },
  { file: 'src/routes/payroll/settings.ts', clause: 'holiday_date', why: 'holidays: id 없음. holiday_date 가 PK → 유일' },
  { file: 'src/routes/cards/queries.ts', clause: 'c.category_name ASC', why: 'SELECT DISTINCT 단일 컬럼 → 결과가 이미 유일. 고유키 추가 시 DISTINCT 무력화' },
  { file: 'src/routes/workbench.ts', clause: 'worker_name', why: 'SELECT DISTINCT 단일 컬럼 → 결과가 이미 유일' },
]

const args = process.argv.slice(2)
const SHOW_ALL = args.includes('--all')
const AS_JSON = args.includes('--json')
const filterArg = args.find(a => !a.startsWith('--'))
const FILTER = filterArg ? new RegExp(filterArg) : null

// ── 문자열/주석을 건너뛰며 괄호 depth 계산 ──
function depthAt(s, idx) {
  let d = 0, i = 0, q = null
  while (i < idx && i < s.length) {
    const ch = s[i]
    if (q) { if (ch === q) q = null; i++; continue }
    if (ch === "'" || ch === '"') { q = ch; i++; continue }
    if (ch === '-' && s[i + 1] === '-') { const nl = s.indexOf('\n', i); i = nl < 0 ? s.length : nl; continue }
    if (ch === '(') d++
    else if (ch === ')') d--
    i++
  }
  return d
}

// ── 백틱 템플릿 리터럴 추출 (${...} 중첩 인지) ──
function templates(src) {
  const out = []
  let i = 0
  while (i < src.length) {
    const s = src.indexOf('`', i)
    if (s < 0) break
    let j = s + 1, d = 0
    while (j < src.length) {
      const ch = src[j]
      if (ch === '\\') { j += 2; continue }
      if (ch === '$' && src[j + 1] === '{') { d++; j += 2; continue }
      if (ch === '}' && d > 0) { d--; j++; continue }
      if (ch === '`' && d === 0) break
      j++
    }
    out.push({ body: src.slice(s + 1, j), start: s + 1 })
    i = j + 1
  }
  return out
}

// ── ORDER BY 절의 끝: 자기 depth 아래로 닫히는 ')' 또는 LIMIT/OFFSET/주석/보간 ──
function clauseEnd(body, from) {
  let i = from, d = 0
  while (i < body.length) {
    const rest = body.slice(i)
    if (/^(\bLIMIT\b|\bOFFSET\b|--|\$\{)/i.test(rest)) return i
    const ch = body[i]
    if (ch === '(') d++
    else if (ch === ')') { if (d === 0) return i; d-- }
    i++
  }
  return body.length
}

const findings = []
for (const dir of SCAN_DIRS) {
  const abs = path.join(REPO, dir)
  if (!fs.existsSync(abs)) continue
  const files = []
  ;(function walk(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, e.name)
      if (e.isDirectory()) walk(q)
      else if (/\.(ts|js)$/.test(e.name)) files.push(q)
    }
  })(abs)

  for (const f of files) {
    const rel = path.relative(REPO, f).replace(/\\/g, '/')
    if (FILTER && !FILTER.test(rel)) continue
    const src = fs.readFileSync(f, 'utf8')
    for (const { body, start } of templates(src)) {
      const re = /ORDER\s+BY\s+/gi
      let m
      while ((m = re.exec(body)) !== null) {
        const from = m.index + m[0].length
        const clause = body.slice(from, clauseEnd(body, from)).replace(/\s+/g, ' ').trim().replace(/,$/, '')
        if (!clause) continue
        const terms = clause.split(',').map(s => s.trim()).filter(Boolean)
        const lastTerm = terms[terms.length - 1]
        const last = lastTerm.replace(/\s+(ASC|DESC)\s*$/i, '').trim()
        const bare = last.replace(/^\w+\./, '')
        if (UNIQUE.test(last) || UNIQUE.test(bare)) continue
        if (/^\d+$/.test(last)) continue                 // ORDER BY 1
        if (/\bCASE\b|\bRANDOM\b/i.test(last)) continue

        const safe = KNOWN_SAFE.find(k => k.file === rel && k.clause === clause)
        if (safe) continue

        const hasGroup = /\bGROUP\s+BY\b/i.test(body)
        const hasOffset = /\bOFFSET\b/i.test(body)
        const isAgg = AGG.test(bare)
        const nested = depthAt(body, m.index) !== 0
        const distinct = /SELECT\s+DISTINCT/i.test(body)
        const union = /\bUNION\b/i.test(body)

        let sev
        if (hasOffset && !hasGroup && !isAgg) sev = 'P1'   // 페이징 목록 = 중복·누락
        else if (!hasGroup && !isAgg) sev = 'P2'           // 행 목록(전량·상위N)
        else if (hasGroup && !isAgg) sev = 'P3'            // 그룹 행 목록
        else sev = 'P4'                                    // 집계 랭킹(표시 순서만)

        const line = src.slice(0, start).split('\n').length + body.slice(0, m.index).split('\n').length - 1
        const notes = []
        if (nested) notes.push('서브쿼리/윈도우 내부 — 삽입 위치 주의')
        if (distinct) notes.push('DISTINCT — 출력 컬럼만 참조 가능')
        if (union) notes.push('UNION — 별칭 불가, 출력 컬럼명 사용')
        if (hasGroup) notes.push('GROUP BY — tie-break 키가 그룹 키여야 함')
        findings.push({ file: rel, line, severity: sev, clause, lastTerm: last, notes })
      }
    }
  }
}

const rank = { P1: 0, P2: 1, P3: 2, P4: 3 }
findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || a.line - b.line)
const shown = findings.filter(f => SHOW_ALL || f.severity === 'P1' || f.severity === 'P2')

if (AS_JSON) {
  console.log(JSON.stringify({ total: findings.length, findings: shown }, null, 2))
} else {
  const counts = {}
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1
  console.log(`tie-break 미적용 ${findings.length}  |  ${JSON.stringify(counts)}`)
  console.log(`등급: P1=페이징 목록(반드시 수정) · P2=행 목록(권장) · P3=GROUP BY · P4=집계 랭킹(표시 순서만)`)
  if (!SHOW_ALL) console.log(`(P3·P4는 --all 로 확인)`)
  console.log('')
  for (const f of shown) {
    console.log(`[${f.severity}] ${f.file}:${f.line}`)
    console.log(`      ORDER BY ${f.clause}`)
    if (f.notes.length) console.log(`      ⚠ ${f.notes.join(' / ')}`)
  }
  const p1 = counts.P1 || 0
  if (p1) console.log(`\n❌ P1 ${p1}건 — 페이징 목록에 고유키 tie-break 없음. 수정 필요.`)
  else console.log(`\n✅ P1 0건`)
}

process.exit((findings.some(f => f.severity === 'P1')) ? 1 : 0)
