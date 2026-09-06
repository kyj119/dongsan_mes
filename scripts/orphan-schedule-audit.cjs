#!/usr/bin/env node
/**
 * 주인 없는 지급예정 감사 — `cash_schedule` PURCHASE 행 중 근거 발주가 취소됐거나 사라진 것.
 *
 * 왜 있는가: 발주를 취소해도 지급예정 행이 남는다. 남은 행은 **나가지도 않을 돈**인데
 * 자금예측이 계속 유출로 세고, 화면은 200 을 뱉는다. typecheck·smoke 는 이 부류를 못 잡는다.
 * prod 실측 2026-09-06: 28건 52,006,174(전부 선명 SMP-*). 발주 취소 경로가 `cash_schedule` 을
 * 한 번도 건드리지 않아 생긴 것이고, 경로를 고쳐도 **과거분과 다른 경로가 또 만든다**.
 *
 * 두 형태를 본다:
 *   ① 발주가 CANCELLED/DRAFT 인데 예정행이 PENDING/OVERDUE
 *   ② 발주 행이 아예 없다(하드 삭제 잔재) — 상태 조인으로는 안 걸러진다(null 은 CANCELLED 가 아니다)
 *
 * 실행: node scripts/orphan-schedule-audit.cjs [--remote]   (발견 시 exit 1)
 *   ⚠️ 기본은 로컬. prod 를 보려면 `--remote`(= `npm run audit:orphan-schedule`).
 */
'use strict'

const { execFileSync } = require('child_process')
const path = require('path')

const REMOTE = process.argv.includes('--remote')
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }

function d1(sql) {
  // ★wrangler 를 npx 로 부르지 않는다 — Windows npx.cmd 는 spawn 이 막히고(EINVAL),
  //   shell:true 면 인자를 공백으로 이어 붙여 SQL 이 토막난다(stock-ledger-audit 실측).
  const wrangler = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const args = [wrangler, 'd1', 'execute', 'webapp-production', REMOTE ? '--remote' : '--local', '--json',
                '--command', sql.replace(/\s+/g, ' ').trim()]
  const out = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: false })
  const i = out.indexOf('[')
  if (i < 0) throw new Error('D1 응답을 파싱할 수 없습니다:\n' + out.slice(0, 400))
  return (JSON.parse(out.slice(i))[0] || {}).results || []
}

const SQL = `
  SELECT cs.id, cs.entity_id, cs.schedule_date, cs.amount, cs.status,
         cs.source_id, po.po_number, po.status AS po_status,
         CASE WHEN po.id IS NULL THEN '발주없음' ELSE '발주취소' END AS kind,
         c.client_name
  FROM cash_schedule cs
  LEFT JOIN purchase_orders po ON po.id = cs.source_id
  LEFT JOIN clients c ON c.id = cs.client_id
  WHERE cs.source_type = 'PURCHASE'
    AND cs.status IN ('PENDING', 'OVERDUE')
    AND cs.source_id IS NOT NULL
    AND (po.id IS NULL OR po.status IN ('CANCELLED', 'DRAFT'))
  ORDER BY cs.amount DESC
`

const rows = d1(SQL)
const won = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR')
const target = REMOTE ? 'prod' : 'local'

if (rows.length === 0) {
  console.log(`${C.g}[orphan-schedule] OK — 주인 없는 지급예정 0건 (${target})${C.x}`)
  process.exit(0)
}

const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0)
const byKind = {}
for (const r of rows) {
  const b = byKind[r.kind] ??= { n: 0, amt: 0 }
  b.n++; b.amt += Number(r.amount) || 0
}

console.log(`${C.r}${C.b}[orphan-schedule] ${rows.length}건 ${won(total)}원 — 나가지도 않을 돈을 예측이 유출로 세고 있다 (${target})${C.x}`)
for (const [k, v] of Object.entries(byKind)) console.log(`  · ${k}: ${v.n}건 ${won(v.amt)}원`)
console.log(`${C.d}  상위 10건${C.x}`)
for (const r of rows.slice(0, 10)) {
  console.log(`    cs#${String(r.id).padEnd(6)} 법인${r.entity_id} ${r.schedule_date} ${won(r.amount).padStart(12)}  ${r.kind}  ${r.po_number || 'PO#' + r.source_id}  ${r.client_name || ''}`)
}
console.log(`${C.y}  처리: 발주취소분은 cash_schedule.status='CANCELLED'(이력 보존) · 발주없음은 DELETE.${C.x}`)
console.log(`${C.y}  재발 방지는 purchaseOrders/core.ts 취소·삭제 경로에 이미 들어가 있다 — 여기 걸리면 새 경로가 생긴 것이다.${C.x}`)
process.exit(1)
