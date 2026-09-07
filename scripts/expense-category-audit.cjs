#!/usr/bin/env node
/**
 * 비용 계정 정합성 감사 — `expense_categories` ↔ 통장·카드 분류
 *
 * ★왜 있는가 (2026-09-07)
 *   이 축을 볼 도구가 없어서 다음이 전부 조용히 굴러가고 있었다:
 *     · 표준 계정 3종이 `is_active=0` 인데 데이터 8건이 그 안에 갇혀 있었다(화면에서 못 고른다)
 *     · 「차입금상환」에 **차입 실행(입금) 2건 1.2억** 이 섞여 상환 실적이 묻혔다
 *     · 「수도광열비」에 세금 성격 30건이 남아 있었다
 *   타입체크·smoke 는 이걸 절대 못 잡는다 — 계정이 틀려도 200 이고 화면도 정상이다.
 *
 * ★`CAT_ROLE` 은 **계정명 문자열**로 역할을 가른다(financialReports.ts + finance-diagnose.cjs 사본 쌍).
 *   그래서 이름이 곧 계약이고, 이름과 내용이 어긋나면 손익이 조용히 틀린다.
 *
 * 보는 것:
 *   ① 비활성 계정에 남은 행                → 화면에서 고칠 수 없다 (P0)
 *   ② 입금에 **비용 역할** 계정이 붙음      → 부호가 반대다 (P0)
 *      (가수금·차입금·보증금 같은 NOT_EXPENSE 는 입금이 정상이라 제외한다)
 *   ③ 방향을 말하는 계정에 반대 거래       → 「상환」에 입금, 「취득」에 입금 (P1)
 *   ④ CAT_ROLE 사본 쌍 불일치              → 한쪽만 고치면 화면과 진단이 갈린다 (P0)
 *
 * 실행: node scripts/expense-category-audit.cjs [--remote]   (발견 시 exit 1)
 */
'use strict'

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REMOTE = process.argv.includes('--remote')
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }

function d1(sql, tries = 3) {
  // ★wrangler 를 npx 로 부르지 않는다(Windows npx.cmd spawn 차단 · shell:true 면 SQL 이 토막난다).
  const wrangler = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const args = [wrangler, 'd1', 'execute', 'webapp-production', REMOTE ? '--remote' : '--local', '--json',
                '--command', sql.replace(/\s+/g, ' ').trim()]
  for (let i = 0; i < tries; i++) {
    try {
      const out = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: false })
      const j = out.indexOf('[')
      if (j < 0) throw new Error('D1 응답 파싱 불가')
      return (JSON.parse(out.slice(j))[0] || {}).results || []
    } catch (e) {
      const m = String((e.stdout || '') + (e.stderr || ''))
      if (i < tries - 1 && /7403|fetch failed|not authorized/.test(m)) continue
      throw new Error(m.slice(0, 300) || e.message)
    }
  }
}
const won = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR')

// ── ④ CAT_ROLE 사본 쌍이 같은가 (DB 를 안 봐도 되는 검사라 먼저) ──────────
//   ★주석은 두 파일이 다르게 쓴다(진단 도구 쪽에 경위가 길다) -> **역할별 이름 목록만** 뽑아 비교한다.
//     원문 텍스트를 비교하면 주석 한 줄 차이로 매번 빨간불이 뜬다(실제로 한 번 그랬다).
const roleOf = (p) => {
  const src = fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
  const m = src.match(/const CAT_ROLE[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (!m) throw new Error(`CAT_ROLE 을 못 찾았다: ${p}`)
  const out = {}
  for (const g of m[1].matchAll(/^\s*([A-Z_]+):\s*\[([^\]]*)\]/gm))
    out[g[1]] = g[2].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean)
  if (!Object.keys(out).length) throw new Error(`CAT_ROLE 항목을 못 읽었다: ${p}`)
  return out
}
const A = roleOf('src/routes/financialReports.ts')
const B = roleOf('scripts/finance-diagnose.cjs')
const same = JSON.stringify(A) === JSON.stringify(B)
let bad = 0
console.log(`\n${C.b}■ 비용 계정 정합성 감사${C.x} ${C.d}(${REMOTE ? 'prod' : '로컬'})${C.x}\n`)
if (!same) {
  bad++
  console.log(`  ${C.r}✗ [P0] CAT_ROLE 사본 쌍 불일치${C.x} — financialReports.ts ↔ scripts/finance-diagnose.cjs`)
  console.log(`      ${C.d}한쪽만 고치면 화면(손익)과 진단 도구가 다른 답을 낸다.${C.x}`)
} else {
  console.log(`  ${C.g}✓${C.x} CAT_ROLE 사본 쌍 일치`)
}

// NOT_EXPENSE 이름 목록을 코드에서 그대로 읽는다(하드코딩 사본을 또 만들지 않는다).
//   가수금·차입금·보증금처럼 **입금이 정상인** 계정을 아래 ② 검사에서 빼는 데 쓴다.
const NOT_EXPENSE = A.NOT_EXPENSE || []
const notExpSql = NOT_EXPENSE.map(n => `'${n.replace(/'/g, "''")}'`).join(',') || `''`

const CHECKS = [
  ['P0', '비활성 계정에 남은 행 (통장)',
   `SELECT bt.id, bt.transaction_date d, bt.counterpart_name cn, bt.amount amt, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE ec.is_active = 0`],
  ['P0', '비활성 계정에 남은 행 (카드)',
   `SELECT ct.id, ct.transaction_date d, ct.merchant_name cn, ct.amount amt, ec.name nm
    FROM card_transactions ct JOIN expense_categories ec ON ec.id = ct.category_id
    WHERE ec.is_active = 0`],
  ['P0', '입금에 비용 역할 계정이 붙음',
   `SELECT bt.id, bt.transaction_date d, bt.counterpart_name cn, bt.amount amt, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE bt.transaction_type = 'DEPOSIT' AND ec.name NOT IN (${notExpSql})`],
  ['P1', '「상환」 계정에 입금',
   `SELECT bt.id, bt.transaction_date d, bt.counterpart_name cn, bt.amount amt, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE bt.transaction_type = 'DEPOSIT' AND ec.name LIKE '%상환%'`],
  ['P1', '「취득」 계정에 입금',
   `SELECT bt.id, bt.transaction_date d, bt.counterpart_name cn, bt.amount amt, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE bt.transaction_type = 'DEPOSIT' AND ec.name LIKE '%취득%'`],
]

for (const [sev, label, sql] of CHECKS) {
  const rows = d1(sql)
  if (!rows.length) { console.log(`  ${C.g}✓${C.x} ${label}`); continue }
  bad += rows.length
  const amt = rows.reduce((a, r) => a + Math.abs(Number(r.amt) || 0), 0)
  console.log(`  ${C.r}✗ [${sev}] ${label} — ${rows.length}건 ${won(amt)}${C.x}`)
  for (const r of rows.slice(0, 8))
    console.log(`      ${C.d}#${r.id} ${r.d} ${String(r.cn || '').slice(0, 22).padEnd(23)} ${won(r.amt).padStart(12)} → ${r.nm}${C.x}`)
  if (rows.length > 8) console.log(`      ${C.d}… 외 ${rows.length - 8}건${C.x}`)
}

if (bad) {
  console.log(`\n${C.r}✗ 계정 정합성 결함 ${bad}건${C.x}`)
  console.log(`${C.d}  이름이 곧 역할이다 — 계정을 새로 만들거나 이름을 바꾸면 CAT_ROLE 사본 쌍도 같은 커밋에서 고친다.${C.x}\n`)
  process.exit(1)
}
console.log(`\n${C.g}✓ 계정 정합성 이상 없음${C.x}\n`)
