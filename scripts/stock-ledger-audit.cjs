#!/usr/bin/env node
/**
 * stock-ledger-audit.cjs — 재고 잔고 ↔ 원장 대사 (2026-08-31)
 *
 * `inventory.quantity` 가 정본이고 `inventory_transactions` 는 **별개 기록**이다. 둘은 서로를
 * 강제하지 않아 **조용히 어긋난다** — prod 실측(2026-08-30) 잔고 합계 132,121 vs 원장 순합 72,873.
 * 그 격차의 정체는 **이관**이다: 주문·발주를 최종 상태로 넣으면서 `inventory` 에 수량을 직접 적재했고
 * 원장은 만들지 않았다. 즉 **이미 있는 격차는 버그가 아니라 출발점**이다.
 *
 * 그래서 총량을 재는 대신 **기준선 대비 새 드리프트**만 본다.
 *   품목별 (잔고 − 원장 순합) 을 기준선과 비교해, 기준선에 없던 품목이나 값이 달라진 품목만 보고한다.
 *   → 새로 만든 쓰기 경로가 원장을 빠뜨리면 그 품목만 딱 떠오른다. (게이트=고칠 것만)
 *
 * 사용:
 *   node scripts/stock-ledger-audit.cjs              # 로컬 D1
 *   node scripts/stock-ledger-audit.cjs --remote     # prod D1
 *   node scripts/stock-ledger-audit.cjs --update-baseline [--remote]
 *
 * 기준선 = scripts/stock-ledger-baseline.json (품목별 격차 스냅샷)
 * 드리프트 발견 시 exit 1.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REMOTE = process.argv.includes('--remote')
const UPDATE = process.argv.includes('--update-baseline')
const BASELINE = path.join(__dirname, 'stock-ledger-baseline.json')
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
const EPS = 0.01   // 부동소수 비교 여유 (자재 차감이 소수점 yd 라 정수 비교가 안 된다)

function d1(sql) {
  // ★wrangler 를 npx 로 부르지 않는다 — Windows 의 npx.cmd 는 Node 24 에서 shell 없이 spawn 이 막히고
  //   (EINVAL), shell:true 로 돌리면 인자를 공백으로 이어 붙여 **SQL 이 토막난다**(둘 다 실측).
  //   node 로 wrangler 엔트리를 직접 실행하면 두 문제 다 없다.
  const wrangler = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const args = [wrangler, 'd1', 'execute', 'webapp-production', REMOTE ? '--remote' : '--local', '--json',
                '--command', sql.replace(/\s+/g, ' ').trim()]
  const out = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false })
  // wrangler 가 배너를 섞어 찍으므로 첫 '[' 부터 파싱한다
  const i = out.indexOf('[')
  if (i < 0) throw new Error('D1 응답을 파싱할 수 없습니다:\n' + out.slice(0, 400))
  const parsed = JSON.parse(out.slice(i))
  return (parsed[0] && parsed[0].results) || []
}

/**
 * 품목별 (잔고 − 원장 순합). 원장 부호는 화면·CSV 와 **같은 규칙**으로 정규화한다
 * (INSERT 경로마다 부호가 엇갈리므로 유형으로 강제 — CLAUDE.md 누적 캐시 섹션 참조).
 */
const SQL = `
  SELECT i.id AS item_id, i.item_code, i.item_name,
         ROUND(COALESCE(b.q, 0), 4)  AS balance,
         ROUND(COALESCE(l.n, 0), 4)  AS ledger,
         ROUND(COALESCE(b.q, 0) - COALESCE(l.n, 0), 4) AS gap
    FROM items i
    LEFT JOIN (SELECT item_id, SUM(quantity) q FROM inventory GROUP BY item_id) b ON b.item_id = i.id
    LEFT JOIN (
      SELECT item_id, SUM(CASE
               WHEN transaction_type IN ('OUT','TRANSFER_OUT') THEN -ABS(quantity)
               WHEN transaction_type IN ('IN','TRANSFER_IN')   THEN  ABS(quantity)
               ELSE quantity END) n
        FROM inventory_transactions GROUP BY item_id
    ) l ON l.item_id = i.id
   WHERE COALESCE(b.q, 0) <> 0 OR COALESCE(l.n, 0) <> 0
   ORDER BY i.id
`

function main() {
  const rows = d1(SQL)
  const current = {}
  for (const r of rows) current[String(r.item_id)] = Number(r.gap) || 0

  if (UPDATE) {
    fs.writeFileSync(BASELINE, JSON.stringify({
      note: '품목별 (재고 잔고 − 원장 순합). 이관으로 생긴 기존 격차를 고정해 두고, 이 값에서 벗어나는 것만 드리프트로 본다.',
      source: REMOTE ? 'remote' : 'local',
      items: current,
    }, null, 2) + '\n', 'utf8')
    const tot = Object.values(current).reduce((a, v) => a + v, 0)
    console.log(`${C.g}기준선 갱신${C.x} — 품목 ${Object.keys(current).length}개 · 격차 합계 ${tot.toFixed(2)} → ${path.relative(process.cwd(), BASELINE)}`)
    return
  }

  if (!fs.existsSync(BASELINE)) {
    console.error(`${C.r}기준선이 없습니다${C.x} — 먼저: node scripts/stock-ledger-audit.cjs --update-baseline${REMOTE ? ' --remote' : ''}`)
    process.exit(1)
  }
  const baseFile = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const base = baseFile.items || {}
  // 기준선은 대상 DB 마다 다르다 — prod 기준선으로 로컬을 재면 전부 드리프트로 보인다.
  const want = REMOTE ? 'remote' : 'local'
  if (baseFile.source && baseFile.source !== want) {
    console.error(`${C.y}기준선은 ${baseFile.source} 스냅샷인데 ${want} 를 재고 있습니다${C.x} — ` +
      `대상을 맞추거나 --update-baseline 으로 이 대상의 기준선을 만드세요.`)
    process.exit(1)
  }

  const drift = []
  for (const r of rows) {
    const key = String(r.item_id)
    const now = Number(r.gap) || 0
    const was = key in base ? Number(base[key]) : 0
    if (Math.abs(now - was) > EPS) {
      drift.push({ ...r, was, delta: now - was, isNew: !(key in base) })
    }
  }
  // 기준선에 있었는데 이번엔 아예 안 잡힌 품목(잔고·원장 둘 다 0) — 격차가 사라진 것이라 정상이다.

  console.log(`${C.b}재고 잔고 ↔ 원장 대사${C.x}  (${REMOTE ? 'remote' : 'local'} · 품목 ${rows.length}개 · 기준선 ${Object.keys(base).length}개)\n`)

  if (drift.length === 0) {
    console.log(`${C.g}${C.b}✅ 드리프트 없음${C.x} — 모든 품목의 격차가 기준선과 같다(새 쓰기 경로가 원장을 빠뜨리지 않았다).`)
    return
  }

  console.log(`${C.r}${C.b}드리프트 ${drift.length}품목${C.x}  ${C.d}(격차 = 잔고 − 원장 순합)${C.x}\n`)
  for (const d of drift.slice(0, 30)) {
    const tag = d.isNew ? `${C.y}NEW${C.x}` : '   '
    console.log(`  ${tag} ${String(d.item_code || '').padEnd(16)} ${String(d.item_name || '').slice(0, 22).padEnd(24)}` +
      ` 잔고 ${String(d.balance).padStart(12)}  원장 ${String(d.ledger).padStart(12)}` +
      `  격차 ${String(d.gap).padStart(10)} ${C.d}(기준선 ${d.was})${C.x}`)
  }
  if (drift.length > 30) console.log(`  ${C.d}… 외 ${drift.length - 30}품목${C.x}`)
  console.log(`\n  ${C.d}재고를 바꾸면서 원장을 안 남긴 경로가 있는지 보세요. 의도된 변화라면:${C.x}`)
  console.log(`  ${C.d}node scripts/stock-ledger-audit.cjs --update-baseline${REMOTE ? ' --remote' : ''}${C.x}`)
  process.exit(1)
}

try { main() } catch (e) {
  console.error(`${C.r}대사 실패:${C.x}`, e.message)
  process.exit(1)
}
