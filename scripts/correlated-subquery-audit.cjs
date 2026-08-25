#!/usr/bin/env node
/**
 * 상관 서브쿼리 감사 — SELECT 절의 행별 재실행 서브쿼리를 위험도순으로 분류한다.
 *
 * 왜 필요한가 (2026-08-25):
 *   `/api/clients?dormant=90` 은 느린 게 아니라 **36초 뒤 500** 이었다. 원인은 목록 SELECT 절의
 *   `(SELECT MAX(order_date) FROM orders WHERE client_id = c.id)` — 거래처 1건마다 orders 를 훑는
 *   상관 스칼라 서브쿼리였다. 통계(ANALYZE)가 있으면 가려지지만 통계는 언제든 낡는다.
 *   grep 으로는 못 잡는다 — 여러 줄에 걸쳐 있고, WHERE 의 EXISTS 와 구분이 안 된다.
 *
 * 무엇을 위험으로 보는가
 *   P1  SELECT 절 상관 서브쿼리 + 바깥 쿼리에 LIMIT 없음   → 행수만큼 재실행(무제한). dormant 유형.
 *   P2  SELECT 절 상관 서브쿼리 + 바깥 쿼리에 LIMIT 있음   → 상한은 있으나 페이지당 N회. 목록이면 개선 대상.
 *   P3  WHERE 절 상관 서브쿼리(EXISTS/IN 등)              → 보통 조기 종료돼 무해. 참고용.
 *   비상관 서브쿼리(바깥 별칭 참조 없음)는 1회 실행이라 대상 아님.
 *
 * 사용법:
 *   node scripts/correlated-subquery-audit.cjs            # 요약 + P1 목록
 *   node scripts/correlated-subquery-audit.cjs --all      # P2·P3 까지
 *   node scripts/correlated-subquery-audit.cjs --json
 *   node scripts/correlated-subquery-audit.cjs --gate     # P1 이 기준선보다 늘면 exit 1
 *
 * 기준선 = scripts/correlated-subquery-baseline.json (--save 로 갱신)
 *
 * ⚠️ 정적 분석이라 「고쳐야 한다」가 아니라 「봐야 한다」를 고른다. 판정은 EXPLAIN QUERY PLAN 으로.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src', 'routes')
const BASELINE = path.join(__dirname, 'correlated-subquery-baseline.json')
const ROWS_SNAPSHOT = path.join(__dirname, 'table-rows.json')
const ARGS = process.argv.slice(2)
const SHOW_ALL = ARGS.includes('--all')
const JSON_OUT = ARGS.includes('--json')
const GATE = ARGS.includes('--gate')
const SAVE = ARGS.includes('--save')

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', cyan: '\x1b[36m' }

// ---------------------------------------------------------------------------
// 1) 파일에서 SQL 을 담은 템플릿 리터럴 추출
// ---------------------------------------------------------------------------
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (e.name.endsWith('.ts')) acc.push(p)
  }
  return acc
}

/** 백틱 템플릿 리터럴을 뽑는다. ${...} 는 중첩 괄호까지 세어 통째로 치환(SQL 파싱을 방해하지 않도록). */
function extractTemplates(src) {
  const out = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '`') continue
    // 이스케이프된 백틱 건너뛰기
    if (i > 0 && src[i - 1] === '\\') continue
    let j = i + 1
    let buf = ''
    let closed = false
    while (j < src.length) {
      const ch = src[j]
      if (ch === '\\') { buf += src[j] + (src[j + 1] || ''); j += 2; continue }
      if (ch === '`') { closed = true; break }
      if (ch === '$' && src[j + 1] === '{') {
        // 중첩 { } 를 세어 표현식 전체를 건너뛴다
        let depth = 1
        let k = j + 2
        while (k < src.length && depth > 0) {
          if (src[k] === '{') depth++
          else if (src[k] === '}') depth--
          k++
        }
        buf += ' _EXPR_ '   // 자리표시자 — 별칭/컬럼으로 오인되지 않도록 밑줄로 감싼다
        j = k
        continue
      }
      buf += ch
      j++
    }
    if (closed) {
      const startLine = src.slice(0, i).split('\n').length
      out.push({ sql: buf, line: startLine, at: i, end: j })
      i = j
    }
  }
  return out
}

const isSql = (s) => /\bSELECT\b[\s\S]*\bFROM\b/i.test(s) && s.length > 40

/**
 * 이 쿼리가 실제로 「몇 행짜리」인지는 템플릿만 봐선 모른다.
 * `query += ' ORDER BY ... LIMIT ? OFFSET ?'` 처럼 **템플릿 밖에서 붙는 경우가 흔하다**
 * (orders/core.ts 목록이 그렇다 — 템플릿만 보면 무제한처럼 보이지만 페이지당 50~200행).
 * 그래서 템플릿 시작부터 **실행 지점(.all/.first/.run/.raw)** 까지의 소스 구간을 함께 본다.
 *   - 구간에 LIMIT 이 있으면 유계
 *   - 실행자가 .first( 면 1행이라 유계
 */
function boundedness(raw, tpl, sqlAfterProjection) {
  const win = raw.slice(tpl.at, Math.min(tpl.end + 4000, raw.length))
  const exec = /\.(all|first|run|raw)\s*[<(]/.exec(win)
  const span = exec ? win.slice(0, exec.index + exec[0].length) : win
  if (exec && exec[1] === 'first') return { bounded: true, why: '.first()' }
  if (/\bLIMIT\b/i.test(span)) return { bounded: true, why: 'LIMIT' }
  // 바깥 WHERE 가 PK 를 = / IN 으로 못 박으면 행수는 호출자가 준 id 개수만큼이다
  //   (taxInvoices/issue.ts 묶음 발행: `WHERE o.id IN (${placeholders})`).
  if (/\b\w*\.?id\s*(?:=\s*\?|IN\s*\()/i.test(sqlAfterProjection)) return { bounded: true, why: 'PK 한정' }
  return { bounded: false, why: '' }
}

// ---------------------------------------------------------------------------
// 2) SQL 구조 분석
// ---------------------------------------------------------------------------
/** 문자열 리터럴을 공백으로 지워 파싱 오탐을 줄인다 */
function stripLiterals(sql) {
  return sql.replace(/'(?:[^']|'')*'/g, (m) => "'" + ' '.repeat(Math.max(m.length - 2, 0)) + "'")
}

/** 최상위(깊이 0) SELECT 의 프로젝션 구간 [start,end) = SELECT 다음 ~ 짝이 맞는 FROM 앞 */
function topProjectionRange(sql) {
  const m = /\bSELECT\b/i.exec(sql)
  if (!m) return null
  let depth = 0
  const start = m.index + m[0].length
  const re = /[()]|\bFROM\b/gi
  re.lastIndex = start
  let t
  while ((t = re.exec(sql))) {
    const s = t[0]
    if (s === '(') depth++
    else if (s === ')') depth--
    else if (depth === 0) return { start, end: t.index }
  }
  return null
}

/** 바깥 쿼리가 선언한 테이블 별칭 수집 — FROM/JOIN 뒤의 `table alias` 또는 `table AS alias` */
function outerAliases(sql, projEnd) {
  const tail = sql.slice(projEnd)
  const aliases = new Set()
  const tables = []
  const re = /\b(?:FROM|JOIN)\s+([A-Za-z_]\w*)\s*(?:\bAS\b\s*)?([A-Za-z_]\w*)?/gi
  let m
  while ((m = re.exec(tail))) {
    const tbl = m[1]
    const al = m[2]
    if (/^(SELECT|ON|WHERE|GROUP|ORDER|LEFT|RIGHT|INNER|OUTER|CROSS|JOIN|USING|LIMIT)$/i.test(tbl)) continue
    tables.push(tbl)
    aliases.add(tbl.toLowerCase())
    if (al && !/^(ON|WHERE|GROUP|ORDER|LEFT|RIGHT|INNER|OUTER|CROSS|JOIN|USING|LIMIT|SET|VALUES)$/i.test(al)) {
      aliases.add(al.toLowerCase())
    }
  }
  return { aliases, tables }
}

/** 구간 안에서 괄호로 감싼 서브쿼리들을 찾는다 → [{ body, at }] */
function findSubqueries(sql, from, to) {
  const subs = []
  for (let i = from; i < to; i++) {
    if (sql[i] !== '(') continue
    // 여는 괄호 뒤 첫 토큰이 SELECT 인가
    const ahead = sql.slice(i + 1, i + 40)
    if (!/^\s*SELECT\b/i.test(ahead)) continue
    let depth = 1
    let j = i + 1
    while (j < sql.length && depth > 0) {
      if (sql[j] === '(') depth++
      else if (sql[j] === ')') depth--
      j++
    }
    subs.push({ body: sql.slice(i + 1, j - 1), at: i })
    i = j - 1
  }
  return subs
}

/** 서브쿼리가 바깥 별칭을 참조하면 상관(correlated) */
function correlationOf(subBody, outer) {
  // 서브쿼리 자신이 선언한 별칭은 제외
  const own = outerAliases(subBody, 0).aliases
  const refs = new Set()
  const re = /\b([A-Za-z_]\w*)\s*\.\s*[A-Za-z_]\w*/g
  let m
  while ((m = re.exec(subBody))) {
    const a = m[1].toLowerCase()
    if (own.has(a)) continue
    if (outer.aliases.has(a)) refs.add(m[1])
  }
  return [...refs]
}

const subTarget = (body) => {
  const m = /\bFROM\s+([A-Za-z_]\w*)/i.exec(body)
  return m ? m[1] : '?'
}

// ---------------------------------------------------------------------------
// 3) 실행
// ---------------------------------------------------------------------------
const findings = []
for (const file of walk(SRC)) {
  const raw = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  for (const tpl of extractTemplates(raw)) {
    if (!isSql(tpl.sql)) continue
    const sql = stripLiterals(tpl.sql)
    const proj = topProjectionRange(sql)
    if (!proj) continue
    const outer = outerAliases(sql, proj.end)
    if (!outer.aliases.size) continue
    const whereTail = (/\bWHERE\b/i.test(sql.slice(proj.end)) ? sql.slice(proj.end).replace(/^[\s\S]*?\bWHERE\b/i, '') : '')
    const bound = boundedness(raw, tpl, whereTail)
    const hasLimit = bound.bounded
    const outerTable = outer.tables[0] || '?'

    const scan = (from, to, where) => {
      for (const sub of findSubqueries(sql, from, to)) {
        const refs = correlationOf(sub.body, outer)
        if (!refs.length) continue                      // 비상관 = 1회 실행, 대상 아님
        const severity = where === 'SELECT' ? (hasLimit ? 'P2' : 'P1') : 'P3'
        findings.push({
          severity,
          file: rel,
          line: tpl.line + sql.slice(0, sub.at).split('\n').length - 1,
          where,
          outerTable,
          subTable: subTarget(sub.body),
          refs,
          hasLimit,
          boundBy: bound.why,
          grouped: /\bGROUP\s+BY\b/i.test(sql),   // 있으면 재실행 횟수 = 그룹 수(행 수 아님)
          snippet: sub.body.replace(/\s+/g, ' ').trim().slice(0, 110),
        })
      }
    }
    scan(proj.start, proj.end, 'SELECT')
    scan(proj.end, sql.length, 'WHERE/기타')
  }
}

// ---------------------------------------------------------------------------
// 4) 규모 가중 — 같은 P1 이라도 departments(21행) 와 clients×orders(2,880×10,074) 는 다른 문제다.
//    scanRows = 통계가 없거나 낡았을 때의 최악값(바깥 행수 × 서브 테이블 행수).
//    ★ 이게 실제로 터진 적이 있다: clients.last_order_date → 36초 뒤 500 (2026-08-25).
// ---------------------------------------------------------------------------
let TBL = null
try { TBL = JSON.parse(fs.readFileSync(ROWS_SNAPSHOT, 'utf8')).rows } catch (_) {}
if (TBL) {
  for (const f of findings) {
    const o = TBL[f.outerTable]
    const s = TBL[f.subTable]
    f.outerRows = o != null ? o : null
    f.subRows = s != null ? s : null
    f.scanRows = (o != null && s != null) ? o * s : null
  }
}

const order = { P1: 0, P2: 1, P3: 2 }
findings.sort((a, b) =>
  order[a.severity] - order[b.severity]
  || (b.scanRows || 0) - (a.scanRows || 0)
  || a.file.localeCompare(b.file) || a.line - b.line)

const count = (s) => findings.filter((f) => f.severity === s).length
const BIG = 1_000_000   // 최악 스캔 100만행 이상 = 실제로 터진 적 있는 규모대
const summary = {
  P1: count('P1'), P2: count('P2'), P3: count('P3'), total: findings.length,
  P1_big: findings.filter((f) => f.severity === 'P1' && (f.scanRows || 0) >= BIG).length,
}

if (JSON_OUT) {
  console.log(JSON.stringify({ summary, findings }, null, 2))
} else {
  const fmt = (n) => n == null ? '?' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n)
  console.log(`\n${C.cyan}상관 서브쿼리 감사${C.reset}  ${C.dim}src/routes${C.reset}${TBL ? '' : C.dim + '  (table-rows.json 없음 — 규모 가중 비활성)' + C.reset}`)
  console.log(`  ${C.red}P1${C.reset} SELECT 절 · LIMIT 없음  ${summary.P1}${TBL ? `  ${C.red}(최악 스캔 100만행+ : ${summary.P1_big})${C.reset}` : ''}`)
  console.log(`  ${C.yellow}P2${C.reset} SELECT 절 · LIMIT 있음  ${summary.P2}`)
  console.log(`  ${C.dim}P3 WHERE 절(참고)        ${summary.P3}${C.reset}\n`)

  const show = SHOW_ALL ? findings : findings.filter((f) => f.severity === 'P1')
  let lastFile = ''
  for (const f of show) {
    if (f.file !== lastFile) { console.log(`${C.dim}${f.file}${C.reset}`); lastFile = f.file }
    const tag = f.severity === 'P1' ? C.red + 'P1' + C.reset : f.severity === 'P2' ? C.yellow + 'P2' + C.reset : C.dim + 'P3' + C.reset
    const scale = TBL ? `  ${C.dim}[${fmt(f.outerRows)}×${fmt(f.subRows)}=${fmt(f.scanRows)}]${C.reset}` : ''
    const grp = f.grouped ? `${C.dim} GROUP BY${C.reset}` : ''
    console.log(`  ${tag} :${f.line}  ${f.outerTable} → ${f.subTable}${scale}${grp}  ${C.dim}(${f.refs.join(',')})${C.reset}`)
    console.log(`      ${C.dim}${f.snippet}${C.reset}`)
  }
  if (!SHOW_ALL && summary.P2 + summary.P3 > 0) {
    console.log(`\n${C.dim}P2·P3 까지 보려면 --all${C.reset}`)
  }
  if (TBL) {
    console.log(`\n${C.dim}[바깥×서브=최악] 은 **테이블 전체 행수** 기준 상한이다 — WHERE 로 걸러진 실제 행수가 아니고,`)
    console.log(`GROUP BY 표시가 있으면 재실행 횟수는 행 수가 아니라 그룹 수다. 순위용 눈금이지 측정값이 아니다.${C.reset}`)
  }
}

if (SAVE) {
  fs.writeFileSync(BASELINE, JSON.stringify({ at: new Date().toISOString(), summary }, null, 2) + '\n')
  console.log(`\n기준선 저장: ${path.relative(ROOT, BASELINE)}`)
}

if (GATE) {
  let base = null
  try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) } catch (_) {}
  if (!base) { console.log('\n기준선 없음 — --save 로 먼저 생성하세요.'); process.exit(0) }
  if (summary.P1 > base.summary.P1) {
    console.error(`\n${C.red}FAIL${C.reset} P1 상관 서브쿼리 ${base.summary.P1} → ${summary.P1} (증가)`)
    process.exit(1)
  }
  console.log(`\n${C.green}OK${C.reset} P1 ${summary.P1} (기준선 ${base.summary.P1})`)
}
