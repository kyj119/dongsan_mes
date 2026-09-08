#!/usr/bin/env node
/**
 * 차입금 ↔ 통장 대사 — 대출계좌 적요가 제 자리에 갔는가
 *
 * ★왜 있는가 (2026-09-08)
 *   하나은행 대출계좌 거래의 적요는 `{계좌번호}-{일련번호}` 인데 그 계좌번호가 `loans.description`
 *   자유텍스트 안에만 있어 아무 코드도 못 읽었다. 그 결과 **만기일시 대출의 월 이자 44건
 *   40,233,462 가 「차입금상환」(NOT_EXPENSE)에 들어가 손익에서 통째로 빠져 있었다** —
 *   MES 이자비용 3,187,533 vs 세무장부 정본 56,960,000, 17배 격차의 원인이 이것이다.
 *   200 이 뜨고 표도 정상이라 타입체크·smoke·계정감사 어느 것도 못 잡는다.
 *
 * 보는 것:
 *   ① 미등록 대출계좌      → 이자를 내고 있는데 `loans` 에 그 차입금이 없다 (P0)
 *   ② 계좌번호 없는 차입금  → 통장과 이어질 열쇠가 없다 (P1)
 *   ③ 이자가 NOT_EXPENSE 에 → 이번 결함의 재발 감시. 월납 1.5배 이하인데 상환 계정 (P0)
 *   ④ 실행 vs 원금상환 대사 → 회전대출의 입출 정합성 (P2 · 참고)
 *
 * 실행: node scripts/loan-bank-audit.cjs [--remote]   (발견 시 exit 1)
 */
'use strict'

const { execFileSync } = require('child_process')
const path = require('path')

const REMOTE = process.argv.includes('--remote')
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }

function d1(sql, tries = 3) {
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

let bad = 0
console.log(`\n${C.b}■ 차입금 ↔ 통장 대사${C.x} ${C.d}(${REMOTE ? 'prod' : '로컬'})${C.x}\n`)

const loans = d1(`SELECT id, entity_id, creditor, COALESCE(account_no,'') acc, repayment_type rt,
                         COALESCE(monthly_payment_amount,0) mp, is_active
                  FROM loans WHERE is_active = 1`)
const byAcc = new Map(loans.filter(l => l.acc).map(l => [String(l.acc), l]))

// 통장에서 대출계좌 형태 적요를 모은다. `{11~16자리}` 또는 `{계좌}-{일련}`.
//   ★GLOB 에 문자클래스를 11개 늘어놓으면 SQLite 가 «pattern too complex» 로 거절한다(LIKE 50바이트
//     한도와 같은 축) → 길이로 거르고 형태 판정은 JS 에서 한다.
//   ★★SQL 문자열 안에 `--` 주석을 쓰지 않는다 — d1() 이 개행을 공백으로 눌러 **그 뒤가 통째로**
//     **주석이 된다**. WHERE·GROUP BY 가 사라져도 오류가 아니라 «1행» 이 돌아온다(2026-09-08 실사고).
const txs = d1(`SELECT counterpart_name cn, transaction_type t, COUNT(*) n, ROUND(SUM(amount)) v
                FROM bank_transactions
                WHERE counterpart_name GLOB '[0-9]*' AND length(counterpart_name) >= 11
                GROUP BY 1, 2`)
const parse = (s) => {
  const m = String(s || '').trim().match(/^(\d{11,16})(?:-(\d{2,8}))?$/)
  return m ? m[1] : null
}
const unknown = new Map()
for (const r of txs) {
  const acc = parse(r.cn)
  if (!acc || byAcc.has(acc)) continue
  const e = unknown.get(acc) || { n: 0, v: 0 }
  e.n += Number(r.n); e.v += Number(r.v)
  unknown.set(acc, e)
}
// ★자사 수금계좌(가맹점번호 등)도 이 형태다 — **출금이 있는 계좌만** 대출로 본다(이자를 내고 있다).
const withdrawAcc = new Set(txs.filter(r => r.t === 'WITHDRAWAL').map(r => parse(r.cn)).filter(Boolean))
const suspects = [...unknown].filter(([a]) => withdrawAcc.has(a))
if (suspects.length) {
  bad += suspects.length
  console.log(`  ${C.r}✗ [P0] 미등록 대출계좌 ${suspects.length}개${C.x} ${C.d}— 이자를 내고 있는데 loans 에 없다${C.x}`)
  for (const [a, o] of suspects.sort((x, y) => y[1].v - x[1].v).slice(0, 8))
    console.log(`      ${C.d}${a}  ${String(o.n).padStart(3)}건 ${won(o.v).padStart(13)}${C.x}`)
} else {
  console.log(`  ${C.g}✓${C.x} 미등록 대출계좌 없음`)
}

const noAcc = loans.filter(l => !l.acc)
if (noAcc.length) {
  console.log(`  ${C.y}⚠ [P1] 계좌번호 없는 차입금 ${noAcc.length}건${C.x} ${C.d}— 통장과 이어질 열쇠가 없다(수기 확인 필요)${C.x}`)
  for (const l of noAcc.slice(0, 6)) console.log(`      ${C.d}#${l.id} E${l.entity_id} ${l.creditor} (${l.rt})${C.x}`)
} else {
  console.log(`  ${C.g}✓${C.x} 모든 활성 차입금에 계좌번호 있음`)
}

// ③ 이자인데 상환 계정에 있는가 — 월납 1.5배 이하 출금이 NOT_EXPENSE 계정에 붙어 있으면 재발이다.
let mis = 0
for (const l of loans) {
  if (!l.acc || String(l.rt) !== 'INTEREST_ONLY' || !Number(l.mp)) continue
  const cap = Math.round(Number(l.mp) * 1.5)
  const rows = d1(`SELECT bt.id, bt.transaction_date d, bt.amount v, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE bt.counterpart_name LIKE '${l.acc}%' AND bt.transaction_type = 'WITHDRAWAL'
      AND bt.amount <= ${cap} AND ec.role = 'NOT_EXPENSE'`)
  if (!rows.length) continue
  mis += rows.length; bad += rows.length
  console.log(`  ${C.r}✗ [P0] #${l.id} ${l.creditor} — 이자가 비용 아님 계정에 ${rows.length}건 ${won(rows.reduce((a, r) => a + Number(r.v), 0))}${C.x}`)
  for (const r of rows.slice(0, 4)) console.log(`      ${C.d}#${r.id} ${r.d} ${won(r.v).padStart(12)} → ${r.nm}${C.x}`)
}
if (!mis) console.log(`  ${C.g}✓${C.x} 만기일시 대출 이자가 손익에 들어가 있음`)

// ④ 회전대출 대사 — 실행(입금) vs 원금상환(출금 대액)
for (const l of loans) {
  if (!l.acc) continue
  const dep = d1(`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM bank_transactions
    WHERE counterpart_name = '${l.acc}' AND transaction_type='DEPOSIT'`)[0]
  if (!Number(dep.n)) continue
  const cap = Math.round(Number(l.mp) * 3)
  const prin = d1(`SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM bank_transactions
    WHERE counterpart_name LIKE '${l.acc}-%' AND transaction_type='WITHDRAWAL' AND amount >= ${cap}`)[0]
  const gap = Number(dep.v) - Number(prin.v)
  const pct = Number(dep.v) ? Math.abs(gap / Number(dep.v) * 100) : 0
  console.log(`  ${C.d}· #${l.id} ${l.creditor} 실행 ${dep.n}건 ${won(dep.v)} vs 원금상환 ${prin.n}건 ${won(prin.v)} — 차 ${won(gap)} (${pct.toFixed(1)}%)${C.x}`)
}

if (bad) {
  console.log(`\n${C.r}✗ 차입금 대사 결함 ${bad}건${C.x}`)
  console.log(`${C.d}  적요 = {계좌번호}-{일련번호}. 계좌번호 정본 = loans.account_no(0589) · 판정 = src/utils/loanAccountMatch.ts${C.x}\n`)
  process.exit(1)
}
console.log(`\n${C.g}✓ 차입금 ↔ 통장 대사 이상 없음${C.x}\n`)
