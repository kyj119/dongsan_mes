#!/usr/bin/env node
/**
 * 단가 의미 감사 — `order_items.unit_price` 가 저장 금액과 맞물리는가 (`npm run audit:unit-price-semantics`)
 *
 * 무엇을 보나: 서버(`utils/orderLineAmount.computeLineAmount`)가 **지금 계산해 낼 금액**과
 *   저장된 `amount` 를 대조한다. 어긋나면 그 주문을 화면에서 열어 저장하는 순간
 *   차액이 통째로 **행 에누리**로 기록된다(실적·마진 오염).
 *
 * 왜 코드로 못 막고 감사로 지키나:
 *   단가 의미 환산(장당가↔㎡단가)은 **적재 시점 1회**만 돈다. 그런데 규격·품목은 그 뒤에
 *   채워진다 — 2026-09-08 추적 결과 그 보정은 커밋된 스크립트가 아니라 **수동 SQL** 이었다.
 *   막을 코드 경로가 없으므로 「어긋나면 잡는다」로 간다(`audit:stock-ledger` 와 같은 형태).
 *   같은 결함의 4번째 재발이다 — 0530(이관 12,142건) · 0571(게릴라) · 0572(프레임간판) · 0596(336건).
 *
 * ★기준선 파일이 없다 — 「못 고치는 것」을 산식으로 판정할 수 있기 때문이다:
 *   정수 단가로는 재현할 수 없는 라인은 `되나눈 값 == 저장된 단가` 다(이미 최선값).
 *   그 조건을 못 넘는 라인만 「정정 가능 = 신규 발생」으로 세고 exit 1 한다.
 *   기준선 JSON 은 대상 DB 별로 갈리고 갱신을 잊으면 조용히 무력해진다 — 여기선 불필요하다.
 *
 * 제외:
 *   · `line_discount <> 0`  — 사람이 의도한 에누리다. 어긋나는 게 정상.
 *   · `price_status='PENDING'` — 단가 미정이라 auto=0 이 정상.
 *   · `amount = 0`          — 되나누면 단가가 0 이 되어 원 단가 정보가 사라진다(무상·취소 라인).
 *   · 수량 0/NULL           — 나눌 수 없다.
 *
 * 실행:
 *   npm run audit:unit-price-semantics          # prod
 *   node scripts/unit-price-semantics-audit.cjs # 로컬 D1
 *
 * 정정: `migrations/0596_fix_unit_price_semantics.sql` 과 **같은 규칙**이다.
 *   신규 발생분은 그 마이그를 다시 돌리면 된다(멱등).
 */
const { execFileSync } = require('child_process')
const path = require('path')

const REMOTE = process.argv.includes('--remote')
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }

function d1(sql) {
  // ★wrangler 를 npx 로 부르지 않는다 — Windows 의 npx.cmd 는 Node 24 에서 shell 없이 spawn 이 막히고
  //   shell:true 로 돌리면 인자를 공백으로 이어 붙여 SQL 이 토막난다(stock-ledger-audit 선례).
  const wrangler = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const args = [wrangler, 'd1', 'execute', 'webapp-production', REMOTE ? '--remote' : '--local', '--json',
                '--command', sql.replace(/\s+/g, ' ').trim()]
  const out = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: false })
  const i = out.indexOf('[')
  if (i < 0) throw new Error('D1 응답을 파싱할 수 없습니다:\n' + out.slice(0, 400))
  return (JSON.parse(out.slice(i))[0] || {}).results || []
}

/**
 * 라인별 재계산·정정값. 분기는 서버 `computeLineAmount` 와 **같아야 한다** —
 * 갈리면 감사가 멀쩡한 라인을 잡거나(오탐) 진짜를 놓친다.
 *   AREA + 규격 있음 → 단가 × 청구폭 × 청구높이 × 수량, 100원 반올림
 *   그 외            → 단가 × 수량, 100원 반올림
 * 청구 치수 = 10cm 올림 후 `items.min_billing_side_cm`(기본 100). ★UV 판재는 0 이라 하드코딩 금지.
 */
const SQL = `
WITH base AS (
  SELECT oi.id, oi.order_id, oi.item_name, oi.unit_price, oi.quantity, oi.amount,
         oi.width, oi.height, oi.price_status, oi.line_discount,
         i.pricing_method AS pm, COALESCE(i.min_billing_side_cm, 100) AS ms
    FROM order_items oi LEFT JOIN items i ON i.id = oi.item_id
),
dim AS (
  SELECT b.*, MAX(CEIL(b.width / 10.0) * 10, b.ms) / 100.0 AS bw,
              MAX(CEIL(b.height / 10.0) * 10, b.ms) / 100.0 AS bh
    FROM base b
),
calc AS (
  SELECT d.*,
         CASE WHEN d.pm = 'AREA' AND d.width > 0 AND d.height > 0
              THEN ROUND(d.unit_price * d.bw * d.bh * d.quantity / 100.0) * 100
              ELSE ROUND(d.unit_price * d.quantity / 100.0) * 100 END AS recalc,
         CASE WHEN d.pm = 'AREA' AND d.width > 0 AND d.height > 0
              THEN ROUND(d.amount / (d.bw * d.bh * d.quantity))
              ELSE ROUND(d.amount / d.quantity) END AS new_price
    FROM dim d
)
SELECT c.id, o.order_number, o.order_date, c.item_name, c.pm,
       c.width, c.height, c.quantity, c.unit_price, c.new_price, c.amount, c.recalc,
       (c.recalc - c.amount) AS gap
  FROM calc c JOIN orders o ON o.id = c.order_id
 WHERE c.quantity IS NOT NULL AND c.quantity <> 0
   AND c.amount IS NOT NULL AND c.amount <> 0
   AND COALESCE(c.price_status, '') <> 'PENDING'
   AND COALESCE(c.line_discount, 0) = 0
   AND ABS(c.recalc - c.amount) > 100
   AND c.new_price <> c.unit_price
   AND NOT (c.pm = 'AREA' AND c.width > 0 AND c.height > 0 AND c.width <= 10 AND c.height <= 10)
 ORDER BY ABS(c.recalc - c.amount) DESC
 LIMIT 200`

/** 구조적 한계(정수 단가로는 더 못 줄이는 라인) — 정보용. 늘어나는 건 문제가 아니다. */
const SQL_FLOOR = `
WITH base AS (
  SELECT oi.id, oi.unit_price, oi.quantity, oi.amount, oi.width, oi.height,
         oi.price_status, oi.line_discount,
         i.pricing_method AS pm, COALESCE(i.min_billing_side_cm, 100) AS ms
    FROM order_items oi LEFT JOIN items i ON i.id = oi.item_id
),
dim AS (
  SELECT b.*, MAX(CEIL(b.width / 10.0) * 10, b.ms) / 100.0 AS bw,
              MAX(CEIL(b.height / 10.0) * 10, b.ms) / 100.0 AS bh
    FROM base b
),
calc AS (
  SELECT d.*,
         CASE WHEN d.pm = 'AREA' AND d.width > 0 AND d.height > 0
              THEN ROUND(d.unit_price * d.bw * d.bh * d.quantity / 100.0) * 100
              ELSE ROUND(d.unit_price * d.quantity / 100.0) * 100 END AS recalc,
         CASE WHEN d.pm = 'AREA' AND d.width > 0 AND d.height > 0
              THEN ROUND(d.amount / (d.bw * d.bh * d.quantity))
              ELSE ROUND(d.amount / d.quantity) END AS new_price
    FROM dim d
)
SELECT COUNT(*) AS n, COALESCE(SUM(ABS(recalc - amount)), 0) AS gap_abs,
       COALESCE(MAX(ABS(recalc - amount)), 0) AS gap_max
  FROM calc
 WHERE quantity IS NOT NULL AND quantity <> 0 AND amount IS NOT NULL AND amount <> 0
   AND COALESCE(price_status, '') <> 'PENDING' AND COALESCE(line_discount, 0) = 0
   AND ABS(recalc - amount) > 100 AND new_price = unit_price
   AND NOT (pm = 'AREA' AND width > 0 AND height > 0 AND width <= 10 AND height <= 10)`

/** 자(尺) 규격이 cm 로 잘못 저장된 라인 — 되나누면 100배가 된다. 조용히 빼지 않고 센다. */
const SQL_RULER = `
SELECT COUNT(*) AS n, COALESCE(SUM(oi.amount), 0) AS amt
  FROM order_items oi JOIN items i ON i.id = oi.item_id
 WHERE i.pricing_method = 'AREA'
   AND oi.width > 0 AND oi.height > 0 AND oi.width <= 10 AND oi.height <= 10`

const won = (n) => Number(n).toLocaleString('ko-KR')

const rows = d1(SQL)
const floor = d1(SQL_FLOOR)[0] || { n: 0, gap_abs: 0, gap_max: 0 }
const ruler = d1(SQL_RULER)[0] || { n: 0, amt: 0 }

console.log(`${C.b}단가 의미 감사${C.x} ${C.d}(${REMOTE ? 'prod' : '로컬'} D1)${C.x}`)
console.log(`  ${C.d}반올림 한계 ${floor.n}건 · 격차 합 ${won(floor.gap_abs)}원 · 최대 ${won(floor.gap_max)}원 — 정정 불가, 정상${C.x}`)
if (ruler.n) console.log(`  ${C.y}자(尺) 규격 오저장 ${ruler.n}건 제외${C.x} ${C.d}(3x6·4x8 등 — 되나누면 100배가 된다. 규격 자체를 고쳐야 한다)${C.x}`)

if (!rows.length) {
  console.log(`${C.g}✅ 정정 가능한 단가 의미 불일치 없음${C.x}`)
  process.exit(0)
}

const gapSum = rows.reduce((s, r) => s + Math.abs(r.gap), 0)
console.error(`\n${C.r}❌ 단가 의미 불일치 ${rows.length}건${C.x} — 화면에서 저장하면 차액이 행 에누리로 기록된다`)
console.error(`   ${C.y}잠재 오염액 ${won(gapSum)}원${C.x}${rows.length >= 200 ? ` ${C.d}(상위 200건만 표시)${C.x}` : ''}\n`)
for (const r of rows.slice(0, 15)) {
  const spec = (r.width && r.height) ? `${r.width}×${r.height}` : '규격없음'
  console.error(`  ${r.order_number} ${C.d}${r.order_date}${C.x} ${r.item_name || '-'} [${r.pm || '품목없음'}]`)
  console.error(`    ${spec} ×${r.quantity} · 단가 ${won(r.unit_price)} → ${C.g}${won(r.new_price)}${C.x}`
    + ` · 금액 ${won(r.amount)} vs 재계산 ${C.r}${won(r.recalc)}${C.x}`)
}
if (rows.length > 15) console.error(`  ${C.d}… 외 ${rows.length - 15}건${C.x}`)
console.error(`\n  정정 = ${C.b}npx wrangler d1 execute webapp-production ${REMOTE ? '--remote' : '--local'} --file=migrations/0596_fix_unit_price_semantics.sql -y${C.x} ${C.d}(멱등)${C.x}`)
process.exit(1)
