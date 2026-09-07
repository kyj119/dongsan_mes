#!/usr/bin/env node
/**
 * 카드 제외 사유 마커 감사 — `card_transactions.offset_reason` (마이그 0575)
 *
 * 왜 있는가: `is_offset=1` 은 "순비용에서 제외"라는 **결과**만 말한다. 사유가 없으면
 * 「카드사가 실제로 청구한 금액」을 다시 가를 수 없고, 출금액↔사용기간 귀속이 통째로 막힌다.
 * 2026-09-07 이전엔 카드로 결제한 매입 224건 56,707,684 이 memo 자유텍스트로만 표시돼 있었다.
 *
 * 타입체크·smoke 는 이 부류를 절대 못 잡는다 — 사유가 비어도 200 이고 화면도 정상이다.
 * 새 제외 경로가 사유를 안 쓰면 **여기서만** 드러난다.
 *
 * 다섯 가지를 본다:
 *   ① is_offset=1 인데 사유 없음        → 청구 기준이 조용히 틀린다 (P0)
 *   ② is_offset=0 인데 사유 있음        → 모순 (P0)
 *   ③ 정의에 없는 사유 값               → 오타·미지 코드 (P0)
 *   ④ PAIR 인데 offset_pair_id 없음      → 마커와 근거 불일치 (P1)
 *   ⑤ PREAUTH 인데 가맹점명에 '가승인' 없음 → 마커와 근거 불일치 (P1)
 *
 * 실행: node scripts/card-offset-reason-audit.cjs [--remote]   (발견 시 exit 1)
 *   ⚠️ 기본은 로컬. prod 를 보려면 `--remote`(= `npm run audit:card-offset-reason`).
 */
'use strict'

const { execFileSync } = require('child_process')
const path = require('path')

const REMOTE = process.argv.includes('--remote')
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }

function d1(sql) {
  // ★wrangler 를 npx 로 부르지 않는다 — Windows npx.cmd 는 spawn 이 막히고(EINVAL),
  //   shell:true 면 인자를 공백으로 이어 붙여 SQL 이 토막난다.
  const wrangler = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const args = [wrangler, 'd1', 'execute', 'webapp-production', REMOTE ? '--remote' : '--local', '--json',
                '--command', sql.replace(/\s+/g, ' ').trim()]
  const out = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: false })
  const i = out.indexOf('[')
  if (i < 0) throw new Error('D1 응답을 파싱할 수 없습니다:\n' + out.slice(0, 400))
  return (JSON.parse(out.slice(i))[0] || {}).results || []
}

// 정본은 src/utils/cardSpend.ts 의 OffsetReason. 값이 늘면 양쪽을 같이 고친다.
const REASONS = ['PAIR', 'PREAUTH', 'PURCHASE', 'ORPHAN_CANCEL']
const inList = REASONS.map(r => `'${r}'`).join(',')

const CHECKS = [
  ['P0', '사유 없는 제외', `COALESCE(is_offset,0)=1 AND offset_reason IS NULL`],
  ['P0', '사유만 있고 제외 아님', `COALESCE(is_offset,0)=0 AND offset_reason IS NOT NULL`],
  ['P0', '정의에 없는 사유 값', `offset_reason IS NOT NULL AND offset_reason NOT IN (${inList})`],
  ['P1', 'PAIR 인데 짝 없음', `offset_reason='PAIR' AND offset_pair_id IS NULL`],
  ['P1', "PREAUTH 인데 '가승인' 표기 없음", `offset_reason='PREAUTH' AND COALESCE(merchant_name,'') NOT LIKE '%가승인%'`],
]

let bad = 0
console.log(`\n${C.b}■ 카드 제외 사유 마커 감사${C.x} ${C.d}(${REMOTE ? 'prod' : '로컬'})${C.x}\n`)

// 현황판 — 사유별 분포를 먼저 보여 준다(0건이어도 무엇을 셌는지 알 수 있게)
for (const r of d1(`SELECT COALESCE(offset_reason,'(없음)') rsn, COUNT(*) n, ROUND(SUM(amount)) amt
                    FROM card_transactions WHERE COALESCE(is_offset,0)=1 GROUP BY 1 ORDER BY n DESC`)) {
  console.log(`  ${C.d}${String(r.rsn).padEnd(15)}${C.x} ${String(r.n).padStart(5)}건  ${Number(r.amt).toLocaleString('ko-KR').padStart(14)}`)
}
console.log()

for (const [sev, label, where] of CHECKS) {
  const rows = d1(`SELECT id, transaction_date d, merchant_name m, amount, is_offset, offset_reason, offset_pair_id
                   FROM card_transactions WHERE ${where} ORDER BY transaction_date DESC, id DESC LIMIT 20`)
  const cnt = d1(`SELECT COUNT(*) n, ROUND(COALESCE(SUM(amount),0)) amt FROM card_transactions WHERE ${where}`)[0]
  const n = Number(cnt.n) || 0
  if (!n) { console.log(`  ${C.g}✓${C.x} ${label}`); continue }
  bad += n
  console.log(`  ${C.r}✗ [${sev}] ${label} — ${n}건 ${Number(cnt.amt).toLocaleString('ko-KR')}${C.x}`)
  for (const r of rows) {
    console.log(`      ${C.d}#${r.id} ${r.d} ${String(r.m || '').slice(0, 20).padEnd(20)} ${Number(r.amount).toLocaleString('ko-KR').padStart(11)}` +
                `  is_offset=${r.is_offset} reason=${r.offset_reason || 'NULL'} pair=${r.offset_pair_id ?? '-'}${C.x}`)
  }
  if (n > rows.length) console.log(`      ${C.d}… 외 ${n - rows.length}건${C.x}`)
}

if (bad) {
  console.log(`\n${C.r}✗ 사유 마커 결함 ${bad}건${C.x} — 새 제외 경로가 offset_reason 을 안 쓴 것이다.`)
  console.log(`${C.d}  제외를 새로 만들면 src/utils/cardSpend.ts 의 OffsetReason 에 사유를 추가하고 같은 커밋에서 쓴다.${C.x}\n`)
  process.exit(1)
}
console.log(`\n${C.g}✓ 사유 마커 이상 없음${C.x}\n`)
