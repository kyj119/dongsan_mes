#!/usr/bin/env node
/**
 * 코드 구조 감사 (증상 아닌 "구조 지표" 측정)
 *
 * 기존 감사와의 역할 분담 — 중복 금지:
 *   - entity-audit.mjs : entity_id 8개 핵심테이블 **SELECT**만 하드게이트 (CI PR 게이트)
 *   - check-dom-refs   : pages↔scripts getElementById 정합
 *   - smoke.cjs        : 배포 후 런타임 엔드포인트 생존
 *   - 이 스크립트      : 정적 **구조** 지표 (크기·레이어·중복·죽은코드·정렬·write-path 비대칭)
 *
 * 하드게이트 아님(기본 exit 0). 지표 수집·추세 관찰용.
 * `--fail-on-regress` 지정 시 baseline 대비 악화하면 비0 종료.
 *
 * 실행:
 *   node scripts/structure-audit.mjs            # 콘솔 요약
 *   node scripts/structure-audit.mjs --json     # JSON 전체 출력
 *   node scripts/structure-audit.mjs --save     # baseline 저장(.audit-baseline.json)
 *   node scripts/structure-audit.mjs --fail-on-regress
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs'
import { join, relative } from 'path'

const SRC = 'src'
const BASELINE_PATH = 'scripts/.structure-baseline.json'
const ENTITY_TABLES_PATH = 'scripts/.entity-tables.json'
const JSON_OUT = process.argv.includes('--json')
const SAVE = process.argv.includes('--save')
const FAIL_ON_REGRESS = process.argv.includes('--fail-on-regress')

/** 파일 종류별 라인수 임계 — 초과 시 분할 후보 */
const SIZE_LIMITS = { routes: 800, pages: 700, scripts: 900, utils: 500, services: 500, other: 800 }

// ─────────────────────────────────────────────────────────── 공통 유틸

function walk(dir, exts = ['.ts', '.tsx', '.js']) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some(e => name.endsWith(e))) out.push(p.split('\\').join('/'))
  }
  return out
}

function kindOf(file) {
  const m = file.match(/^src\/(routes|pages|scripts|utils|services)\//)
  return m ? m[1] : 'other'
}

/** .prepare(`...`) 백틱 SQL 블록 추출 (entity-audit.mjs와 동일 스캐너) */
function extractPreparedSql(src) {
  const blocks = []
  const re = /\.prepare\(\s*`/g
  let m
  while ((m = re.exec(src)) !== null) {
    const start = m.index + m[0].length
    let i = start
    let depth = 0
    for (; i < src.length; i++) {
      const ch = src[i]
      if (ch === '\\') { i++; continue }
      if (ch === '$' && src[i + 1] === '{') { depth++; i++; continue }
      if (ch === '}' && depth > 0) { depth--; continue }
      if (ch === '`' && depth === 0) break
    }
    blocks.push({ line: src.slice(0, m.index).split('\n').length, offset: m.index, sql: src.slice(start, i) })
  }
  return blocks
}

const flat = s => s.replace(/\s+/g, ' ').trim()

/**
 * entity_id 컬럼을 실제 보유한 테이블 집합.
 * 정본 = 로컬 D1 스키마. 갱신:
 *   npx wrangler d1 execute webapp-production --local --json \
 *     --command "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%entity_id%'"
 * 이 목록이 없으면 write-path 검사는 테이블 판별 불가 → 오탐 방지를 위해 검사를 건너뛴다.
 */
const ENTITY_TABLES = (() => {
  if (!existsSync(ENTITY_TABLES_PATH)) return null
  try {
    const j = JSON.parse(readFileSync(ENTITY_TABLES_PATH, 'utf8').replace(/^﻿/, ''))
    const s = new Set(j.tables)
    // 변종 컬럼으로 귀속하는 테이블도 격리 대상 — 빠지면 사각이 된다.
    //   cards=requesting_entity_id · order_items=assigned_entity_id (cardEntityFilter 계열이 가드)
    //   users(default_entity_id)·inter_entity_transactions(from/to)는 의미가 달라 제외.
    for (const t of ['cards', 'order_items']) if (j.variantTables?.[t]) s.add(t)
    return s
  } catch { return null }
})()

/** UPDATE <t> / DELETE FROM <t> 의 대상 테이블명 */
function writeTargetTable(sql) {
  const m = sql.match(/^\s*(?:UPDATE\s+|DELETE\s+FROM\s+)([A-Za-z0-9_]+)/i)
  return m ? m[1] : null
}

/**
 * 라우트 핸들러 시작 위치 목록 — `.get('/..'` `.post(` `.put(` `.patch(` `.delete(`
 * write 문이 속한 핸들러 범위를 잡아 "선행 가드"를 판정하기 위한 경계.
 */
function handlerStarts(src) {
  const out = []
  // 첫 인자가 경로('/'로 시작)인 것만 — `c.get('user')`·`map.delete(k)`·R2 `.delete(key)` 오인 방지
  for (const m of src.matchAll(/\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]\//g)) out.push(m.index)
  return out
}

/**
 * cross-entity가 **의도된 요구사항**인 write — 법인 필터를 붙이면 기능이 파괴되는 경로.
 * 추가 시 반드시 근거 주석(설계 의도를 밝힌 코드 위치)을 남길 것. 기계적 확장 금지.
 */
const WRITE_ALLOWLIST = [
  // 합배송/합포장: 복수 법인 주문을 한 박스로 묶어 배송비를 절감하는 것이 기능의 존재 이유.
  //   근거 — shipments.ts:264 "법인 통합 뷰" · :267 "목적상 entityFilter 미적용(명시적 cross-entity 조회)"
  //          · :314 "법인 수 무관" · :368 "복수 주문(법인 무관)을 한 박스로 묶는다"
  //   (2026-07-29 구조감사에서 오탐 확정. status 검증 누락은 별건으로 수정함)
  { file: 'src/routes/shipments.ts', match: 'UPDATE shipments SET merged_into_id' },
  { file: 'src/routes/shipments.ts', match: 'UPDATE orders SET consolidate_with_order_id' },
  // IA 에이전트 콜백(IllustratorAutomat 폴링): 분석 행의 entity ≠ 에이전트 토큰의 entity라
  //   필터를 걸면 정상 콜백이 404가 된다. 라우터 전역 requireRole('ADMIN')로 접근 통제.
  //   근거 — aiAnalysis.ts:334-335 "에이전트 전용 콜백 — Bearer 인증으로 충분. entityFilter 미적용
  //          (분석 행 entity ≠ 에이전트 토큰 entity일 때 404 나는 문제 방지; file-map 콜백과 동일 정책)"
  { file: 'src/routes/aiAnalysis.ts', match: 'UPDATE ai_analysis_requests' },
]

/**
 * write 문이 이미 보호되는지 — 실측된 안전 패턴 2종(오탐 주범):
 *   ① 선행 가드: 같은 핸들러 안에서 write 이전에 entityFilter 적용 SELECT로 소유권 확인
 *      (approvals.ts:284 등 — `SELECT ... WHERE id = ?${ef.clause}` 후 UPDATE)
 *   ② 자기 생성 id: 같은 핸들러에서 INSERT ... RETURNING id 로 방금 만든 행을 갱신
 *      (aiAnalysis.ts:311 등 — 외부 입력 id가 아님)
 */
function guardedBefore(src, writeOffset, starts) {
  let begin = 0
  for (const s of starts) { if (s < writeOffset && s > begin) begin = s }
  const scope = src.slice(begin, writeOffset)
  // 변종 헬퍼까지 포괄 — `cardEntityFilter(c)` / `cardEf.clause` 는 대문자 E라 소문자 패턴에 안 걸린다(rip.ts:1399 실측)
  if (/[Ee]ntityFilter\s*\(|[Ee]f\.clause/.test(scope)) return 'preceding-entity-guard'
  // 헬퍼 대신 손으로 붙인 가드 — `getEntityId(c)` + ` AND entity_id = ?` (hr.ts:1488 등)
  if (/entity_id\s*=\s*\?/.test(scope)) return 'manual-entity-guard'
  if (/RETURNING\s+id/i.test(scope)) return 'self-created-id'
  return null
}

// ─────────────────────────────────────────────────────────── 수집

const files = walk(SRC)
const srcCache = new Map()
for (const f of files) srcCache.set(f, readFileSync(f, 'utf8'))

const report = {
  generatedFor: 'dongsan_mes',
  totals: { files: files.length, lines: 0 },
  oversized: [],
  writePathAsymmetry: [],
  missingTieBreak: [],
  deadExports: [],
  domainLogicInRoutes: [],
  duplicateBlocks: [],
}

// ── 1. 파일 크기 임계 초과
for (const f of files) {
  const lines = srcCache.get(f).split('\n').length
  report.totals.lines += lines
  const kind = kindOf(f)
  const limit = SIZE_LIMITS[kind]
  if (lines > limit) report.oversized.push({ file: f, lines, kind, limit, over: lines - limit })
}
report.oversized.sort((a, b) => b.lines - a.lines)

// ── 2. write-path entity 비대칭 (entity-audit.mjs가 명시한 사각 — IDOR 주 발생원)
//    같은 파일이 SELECT에는 entityFilter를 쓰면서 UPDATE/DELETE는 bare `WHERE id = ?`인 경우.
//    "형제-비대칭"이 근거이므로 파일 단위 교차분석으로만 잡힌다.
for (const f of files.filter(x => x.startsWith('src/routes/'))) {
  const src = srcCache.get(f)
  const usesEntityFilter = /entityFilter\s*\(/.test(src)
  if (!usesEntityFilter) continue // entity 인식 자체가 없는 파일은 별도 축(전역 라우트)
  const starts = handlerStarts(src)

  for (const { line, offset, sql } of extractPreparedSql(src)) {
    const t = sql.trim()
    const isWrite = /^\s*(UPDATE|DELETE)\b/i.test(t)
    if (!isWrite) continue
    // 대상 테이블이 실제로 entity_id를 보유할 때만 위험 — 미보유 테이블은 비대칭 개념 자체가 없음
    const table = writeTargetTable(t)
    if (!ENTITY_TABLES || !table || !ENTITY_TABLES.has(table)) continue
    // entity 조건이 SQL 내부에 직접 있거나 clause 보간이면 안전
    if (/entity_id/i.test(sql)) continue
    if (/\$\{[^}]*\.clause\}/.test(sql)) continue
    // bare WHERE id = ? / alias.id = ? 패턴만 위험 후보
    if (!/\bWHERE\b[\s\S]*?\bid\s*=\s*\?/i.test(sql)) continue
    // cross-entity가 의도된 경로 → 제외
    if (WRITE_ALLOWLIST.some(a => f === a.file && flat(sql).includes(a.match))) continue
    // 같은 핸들러의 선행 entity 가드 / 자기생성 id → 안전(오탐 제거)
    const guard = guardedBefore(src, offset, starts)
    if (guard) continue
    // 하위 스코프가 부모 FK로 이미 격리되는 경우(WHERE ... <parent>_id = ?)는 완화 표시
    const scopedByParent = /\b(order_id|card_id|client_id|bank_account_id|employee_id|invoice_id|shipment_id)\s*=\s*\?/i.test(sql)
    report.writePathAsymmetry.push({
      file: f, line, table,
      verb: t.match(/^\s*(UPDATE|DELETE)/i)[1].toUpperCase(),
      scopedByParent,
      snippet: flat(sql).slice(0, 100),
    })
  }
}

// ── 3. ORDER BY 고유키 tie-break 누락 (CLAUDE.md 알려진 함정 — 페이징 중복/누락)
for (const f of files) {
  const src = srcCache.get(f)
  for (const { line, sql } of extractPreparedSql(src)) {
    if (!/\bLIMIT\b/i.test(sql)) continue
    const ob = sql.match(/\bORDER\s+BY\b([\s\S]*?)(\bLIMIT\b|$)/i)
    if (!ob) continue
    const keys = ob[1]
    if (/\$\{/.test(keys)) continue // 동적 정렬맵 보간 — 정적 판정 불가
    const lastKey = keys.split(',').pop().trim()
    // 마지막 정렬 키가 고유 컬럼(id / *_id / rowid)이면 통과
    if (/\b(id|rowid)\b\s*(ASC|DESC)?\s*$/i.test(lastKey)) continue
    report.missingTieBreak.push({ file: f, line, orderBy: flat(keys).slice(0, 80) })
  }
}

// ── 4. dead export (어디서도 import되지 않는 export 심볼)
//    ?raw concat되는 src/scripts/*.js는 전역 스코프 결합이라 제외.
const exportDecl = /export\s+(?:async\s+)?(?:function|const|let|class|interface|type)\s+([A-Za-z0-9_$]+)/g
const allImportedNames = new Set()
const allSrcJoined = files
  .filter(f => !f.startsWith('src/scripts/'))
  .map(f => srcCache.get(f))
  .join('\n')

// ① 정적 import 절
for (const m of allSrcJoined.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]/g)) {
  const clause = m[1]
  for (const name of clause.replace(/[{}]/g, ' ').split(/[,\s]+/)) {
    const n = name.trim().replace(/^\*$/, '')
    if (n && n !== 'as' && n !== 'type') allImportedNames.add(n)
  }
}
// ② 동적 import 구조분해 — `const { getCardList, stopCard } = await import('...')`
//    (cardExpenses.ts:231 실측 — 이걸 빼면 살아있는 심볼이 dead로 오판된다)
for (const m of allSrcJoined.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\s+import\s*\(/g)) {
  for (const name of m[1].split(',')) {
    const n = name.split(':').pop().trim()
    if (n) allImportedNames.add(n)
  }
}
// ③ 재export — `export { X } from './y'` / `export * from`
for (const m of allSrcJoined.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
  for (const name of m[1].split(',')) {
    const n = name.split(/\s+as\s+/)[0].trim()
    if (n) allImportedNames.add(n)
  }
}

for (const f of files) {
  if (f.startsWith('src/scripts/')) continue // ?raw 전역 concat
  const src = srcCache.get(f)
  for (const m of src.matchAll(exportDecl)) {
    const name = m[1]
    if (allImportedNames.has(name)) continue
    const line = src.slice(0, m.index).split('\n').length
    const isType = /export\s+(?:interface|type)\s/.test(m[0])
    // 같은 파일 내부에서 실제로 쓰이는가 (선언 1회 제외)
    const uses = (src.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) || []).length
    const kind = uses > 1 ? 'over-exported' : 'unused'
    report.deadExports.push({ file: f, line, symbol: name, kind, isType })
  }
}
// 진짜 미사용이 먼저, 타입 선언은 뒤로(대개 무해)
report.deadExports.sort((a, b) =>
  (a.kind === b.kind ? 0 : a.kind === 'unused' ? -1 : 1) || (a.isType === b.isType ? 0 : a.isType ? 1 : -1))

// ── 5. 라우트 내 도메인 계산 로직 밀집도 (서비스 추출 후보)
//    금액/수량/율 계산이 라우트 핸들러에 인라인된 정도. 높을수록 단위테스트 불가 영역이 큼.
const CALC_HINT = /(amount|price|cost|total|qty|quantity|rate|tax|vat|supply|salary|wage|deduct|allowance|balance|margin)/i
for (const f of files.filter(x => x.startsWith('src/routes/'))) {
  const lines = srcCache.get(f).split('\n')
  let calcLines = 0
  for (const l of lines) {
    const s = l.trim()
    if (s.startsWith('//') || s.startsWith('*')) continue
    // 산술 연산 + 도메인 키워드가 같은 줄에 (SQL 문자열 내부 제외 근사)
    if (/[*/+\-]\s*[A-Za-z0-9_.(]/.test(s) && CALC_HINT.test(s) && !/^\s*(SELECT|INSERT|UPDATE|FROM|WHERE|JOIN)/i.test(s)) calcLines++
  }
  if (calcLines >= 20) report.domainLogicInRoutes.push({ file: f, calcLines, totalLines: lines.length })
}
report.domainLogicInRoutes.sort((a, b) => b.calcLines - a.calcLines)

// ── 6. 중복 코드 블록 (정규화 8줄 윈도우 해시, 서로 다른 파일 간)
const WINDOW = 8
const blockMap = new Map()
for (const f of files) {
  const norm = srcCache.get(f).split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
  for (let i = 0; i + WINDOW <= norm.length; i++) {
    const key = norm.slice(i, i + WINDOW).join('\u0001')
    if (key.length < 200) continue // 너무 짧은 블록(선언 나열) 제외
    if (!blockMap.has(key)) blockMap.set(key, [])
    blockMap.get(key).push({ file: f, line: i + 1 })
  }
}
for (const [key, hits] of blockMap) {
  const distinctFiles = new Set(hits.map(h => h.file))
  if (distinctFiles.size < 2) continue
  report.duplicateBlocks.push({
    files: [...distinctFiles],
    occurrences: hits.length,
    preview: key.split('\u0001')[0].slice(0, 90),
  })
}
// 동일 클러스터가 슬라이딩 윈도우로 중복 보고되는 것 축약
report.duplicateBlocks = report.duplicateBlocks
  .sort((a, b) => b.occurrences - a.occurrences)
  .filter((d, i, arr) => arr.findIndex(x => x.files.join() === d.files.join()) === i)
  .slice(0, 40)

// ─────────────────────────────────────────────────────────── 출력

const summary = {
  files: report.totals.files,
  lines: report.totals.lines,
  oversized: report.oversized.length,
  writePathAsymmetry: report.writePathAsymmetry.length,
  writePathAsymmetryStrict: report.writePathAsymmetry.filter(w => !w.scopedByParent).length,
  missingTieBreak: report.missingTieBreak.length,
  deadExports: report.deadExports.length,
  deadExportsUnusedValue: report.deadExports.filter(d => d.kind === 'unused' && !d.isType).length,
  domainLogicInRoutes: report.domainLogicInRoutes.length,
  duplicateClusters: report.duplicateBlocks.length,
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log('코드 구조 감사')
  console.log('━'.repeat(64))
  console.log(`대상: ${summary.files} 파일 / ${summary.lines.toLocaleString()} 라인\n`)
  const row = (label, n, note) => console.log(`  ${label.padEnd(28)} ${String(n).padStart(5)}  ${note || ''}`)
  row('크기 임계 초과', summary.oversized, '분할 후보')
  row('write-path entity 비대칭', summary.writePathAsymmetry, `엄격(부모스코프 없음) ${summary.writePathAsymmetryStrict}`)
  row('ORDER BY tie-break 누락', summary.missingTieBreak, '페이징 중복/누락 위험')
  row('dead export 후보', summary.deadExports, `완전미사용 값 ${summary.deadExportsUnusedValue} (나머지=내부사용/타입)`)
  row('라우트 계산로직 밀집', summary.domainLogicInRoutes, '서비스 추출 후보')
  row('파일간 중복 블록 클러스터', summary.duplicateClusters, `${WINDOW}줄 윈도우`)

  const top = (title, arr, fmt, n = 10) => {
    if (!arr.length) return
    console.log(`\n[${title}] 상위 ${Math.min(n, arr.length)}`)
    for (const x of arr.slice(0, n)) console.log('  ' + fmt(x))
  }
  top('크기 임계 초과', report.oversized, x => `${x.file}:${x.lines}줄 (${x.kind} 한도 ${x.limit}, +${x.over})`)
  if (!ENTITY_TABLES) console.log(`\n⚠ ${ENTITY_TABLES_PATH} 없음 — write-path 검사 건너뜀(오탐 방지)`)
  top('write-path entity 비대칭 — 엄격', report.writePathAsymmetry.filter(w => !w.scopedByParent),
    x => `${x.file}:${x.line} ${x.verb} ${x.table} — ${x.snippet}`, 15)
  top('ORDER BY tie-break 누락', report.missingTieBreak, x => `${x.file}:${x.line} — ORDER BY ${x.orderBy}`)
  top('라우트 계산로직 밀집', report.domainLogicInRoutes, x => `${x.file} — 계산 ${x.calcLines}줄 / ${x.totalLines}줄`)
  top('중복 블록', report.duplicateBlocks, x => `${x.occurrences}회 · ${x.files.slice(0, 3).join(' | ')}${x.files.length > 3 ? ` (+${x.files.length - 3})` : ''}`)
  console.log('\n전체 상세 → node scripts/structure-audit.mjs --json')
}

if (SAVE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(summary, null, 2))
  console.log(`\nbaseline 저장 → ${BASELINE_PATH}`)
}

if (FAIL_ON_REGRESS && existsSync(BASELINE_PATH)) {
  const base = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const worse = Object.entries(summary).filter(([k, v]) =>
    k !== 'files' && k !== 'lines' && typeof v === 'number' && base[k] != null && v > base[k])
  if (worse.length) {
    console.error('\n❌ baseline 대비 악화:')
    for (const [k, v] of worse) console.error(`   ${k}: ${base[k]} → ${v}`)
    process.exit(1)
  }
  console.log('\n✅ baseline 대비 악화 없음')
}
