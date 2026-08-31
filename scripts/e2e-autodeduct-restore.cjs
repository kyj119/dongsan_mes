#!/usr/bin/env node
/**
 * e2e-autodeduct-restore.cjs — 인쇄 자재 자동차감의 원장 기록 + 환원 (2026-08-31)
 *
 * 2026-08-31 이전엔 자동차감이
 *   ① `inventory_transactions` 에 **아무 행도 안 남기고**(증감내역 화면 사각지대)
 *   ② **되돌리는 경로가 아예 없었다**(카드 되돌리기·주문 삭제 어디서도 자재가 안 돌아옴)
 * 이 게이트가 그 둘을 못 박는다.
 *
 * 시나리오
 *   1) 전용 테스트 품목 2개 확보(있으면 재사용) — 자재(ROLL·폭 1370) + 제품(제작)
 *   2) product_materials 매핑 + 자재 재고 시드
 *   3) 주문·카드 생성 → print_file_map 등록
 *   4) 출력 이벤트(OK)  → 재고 감소 · 원장 AUTO_DEDUCT OUT 1행 · 차감 기록 1행
 *   5) 카드 되돌리기    → 재고 원복 · 원장 행 철회 · 차감 기록 철회
 *   6) 재출력           → 다시 감소 · 원장 재생성 (UNIQUE 위반 없음)
 *   7) 주문 삭제        → 재고 원복 (정리 겸 검증)
 *
 * ⚠️ print_event 중복 판정 키가 **(file_path, print_completed_at)** 이다. 시각을 빼고 재전송하면
 *    duplicate 로 삼켜져 차감 로직에 **도달조차 못 한다** — 그래서 6)은 시각을 바꿔 보낸다.
 *
 * 사용: 서버(dev:d1) 가동 상태에서  npm run test:autodeduct
 *   에이전트 키 = 환경변수 AGENT_API_KEY, 없으면 .dev.vars 에서 읽는다(로컬 전용 게이트).
 */
const fs = require('fs')
const path = require('path')

const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (/pages\.dev|dongsanplan\.com/i.test(BASE)) {
  console.error('\x1b[31m[guard] 프로덕션 대상 차단:\x1b[0m ' + BASE + '\n  → 실제 출력 이벤트·차감 기록이 남습니다. 로컬 전용입니다.')
  process.exit(1)
}
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'

function agentKey() {
  if (process.env.AGENT_API_KEY) return process.env.AGENT_API_KEY
  // 로컬 전용 게이트라 .dev.vars 에서 읽는다(키를 스크립트에 박지 않기 위해서다)
  const p = path.join(__dirname, '..', '.dev.vars')
  if (!fs.existsSync(p)) return null
  const m = fs.readFileSync(p, 'utf8').match(/^AGENT_API_KEY=(.+)$/m)
  return m ? m[1].trim() : null
}

const MAT_NAME = 'E2E 자동차감 테스트 원단'
const PROD_NAME = 'E2E 자동차감 테스트 제품'
const SEED_QTY = 500

let TOKEN = ''
const C = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
let failed = 0
function check(name, cond, detail) {
  if (cond) console.log(`  ${C.g}PASS${C.x}  ${name}`)
  else { failed++; console.log(`  ${C.r}FAIL${C.x}  ${name}  ${C.d}${detail || ''}${C.x}`) }
}
async function api(method, p, body, headers) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: Object.assign({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' }, headers || {}),
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null; const text = await res.text()
  try { data = JSON.parse(text) } catch { /* non-json */ }
  return { status: res.status, data, text }
}
function arr(d) { return Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : (d && Array.isArray(d.data) ? d.data : [])) }

async function stockOf(itemId) {
  const r = await api('GET', `/api/inventory/${itemId}`)
  return Number(r.data?.data?.current_stock ?? NaN)
}
/** 이 자재의 AUTO_DEDUCT 원장 행 수 (신설 증감내역 API 경유 — 화면이 보는 것과 같은 경로) */
async function ledgerRows(itemId) {
  const r = await api('GET', `/api/inventory/transactions?item_id=${itemId}&reference_type=AUTO_DEDUCT&limit=50`)
  return (r.data?.data?.transactions || [])
}
/** 이름으로 찾고 없으면 만든다 — 반복 실행해도 품목이 쌓이지 않는다 */
async function ensureItem(name, extra) {
  const found = arr((await api('GET', `/api/items?limit=200&search=${encodeURIComponent(name)}`)).data?.data)
    .find((it) => it && it.item_name === name)
  if (found) return found
  const created = await api('POST', '/api/items', Object.assign({ item_name: name, category: '원자재', unit: 'EA' }, extra))
  if (!created.data?.success) throw new Error(`품목 생성 실패(${name}): ${created.status} ${created.text.slice(0, 160)}`)
  const id = created.data?.data?.id
  return { id, item_name: name }
}

;(async () => {
  const KEY = agentKey()
  if (!KEY) {
    console.error('\x1b[31mAGENT_API_KEY 를 찾을 수 없습니다\x1b[0m — 환경변수로 넘기거나 .dev.vars 에 두세요.')
    process.exit(1)
  }
  const lr = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const ld = await lr.json()
  if (!ld?.data?.token) throw new Error('로그인 실패: ' + JSON.stringify(ld))
  TOKEN = ld.data.token
  console.log(`${C.b}인쇄 자동차감 원장·환원 E2E${C.x}  (${BASE}, ${USER})\n`)

  // ── 1) 전용 품목 ─────────────────────────────────────────────────────────
  const mat = await ensureItem(MAT_NAME, {
    category: '원자재', unit: 'yd', is_purchase_item: 1, production_required: 0, width_mm: 1370,
  })
  const prod = await ensureItem(PROD_NAME, {
    category: '수성', unit: 'EA', is_sales_item: 1, production_required: 1,
  })
  // 차감방식은 생성 INSERT 에 없다 — PUT 으로 세운다(ROLL 은 width_mm 이 있어야 후보에 든다)
  await api('PUT', `/api/items/${mat.id}`, { deduction_method: 'ROLL', width_mm: 1370 })
  check('테스트 품목 확보', !!mat.id && !!prod.id, `mat=${mat.id} prod=${prod.id}`)

  // ── 2) 자재 매핑 + 재고 시드 ─────────────────────────────────────────────
  const mats = arr((await api('GET', `/api/items/${prod.id}/materials`)).data?.data)
  if (!mats.some((m) => Number(m.material_item_id) === Number(mat.id))) {
    await api('POST', `/api/items/${prod.id}/materials`, { material_item_id: mat.id, is_default: 1 })
  }
  const linked = arr((await api('GET', `/api/items/${prod.id}/materials`)).data?.data)
  check('제품↔자재 매핑', linked.some((m) => Number(m.material_item_id) === Number(mat.id)), JSON.stringify(linked).slice(0, 120))

  const today = new Date().toISOString().slice(0, 10)
  await api('POST', '/api/inventory/adjustments', {
    item_id: mat.id, adjustment_date: today, adjustment_quantity: SEED_QTY, reason: 'FOUND', notes: 'e2e autodeduct seed',
  })
  const s0 = await stockOf(mat.id)
  check('자재 재고 시드', Number.isFinite(s0) && s0 > 0, `stock=${s0}`)

  // ── 3) 주문·카드·파일맵 ──────────────────────────────────────────────────
  const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  const ord = await api('POST', '/api/orders', {
    client_id: 1, delivery_date: future, notes: 'e2e 자동차감 원장·환원',
    items: [{ item_id: prod.id, item_name: PROD_NAME, quantity: 1, unit_price: 1000, width: 100, height: 200 }],
  })
  const orderId = ord.data?.data?.id
  const orderNumber = ord.data?.data?.order_number
  check('주문 생성', !!orderId && !!orderNumber, `${ord.status} ${ord.text.slice(0, 140)}`)
  if (!orderId) throw new Error('주문 생성 실패로 중단')

  let cards = arr((await api('GET', `/api/cards?order_id=${orderId}&limit=10`)).data?.data)
  if (!cards.length) { await api('POST', `/api/cards/generate/${orderId}`); cards = arr((await api('GET', `/api/cards?order_id=${orderId}&limit=10`)).data?.data) }
  const card = cards[0]
  check('카드 생성', !!card?.id, `cards=${cards.length}`)
  if (!card) throw new Error('카드가 없어 출력 이벤트를 붙일 수 없다')

  const fileName = `${orderNumber}-001.pdf`
  const filePath = `Z:/e2e/${fileName}`
  const mapRes = await api('POST', '/api/print-events/file-map',
    { order_number: orderNumber, file_seq: '001', card_id: card.id, card_number: card.card_number, file_name: fileName },
    { 'X-Agent-Key': KEY })
  check('print_file_map 등록', mapRes.status === 200, `${mapRes.status} ${mapRes.text.slice(0, 140)}`)

  const postPrint = (completedAt) => api('POST', '/api/print-events', {
    agent_id: 'e2e-agent', equipment_id: 1, file_path: filePath, file_name: fileName,
    print_status: 'OK', print_completed_at: completedAt,
    output_width: 1000, output_height: 2000, copy_total: 1, event_kind: 'PRINT',
  }, { 'X-Agent-Key': KEY })

  // ── 4) 출력 → 차감 + 원장 ────────────────────────────────────────────────
  const p1 = await postPrint('2026-08-31 10:00:00')
  const d1 = p1.data?.data?.deduction || {}
  check('출력 이벤트 차감 실행', p1.status === 200 && d1.deducted === true, `${p1.status} ${JSON.stringify(d1).slice(0, 160)}`)
  const s1 = await stockOf(mat.id)
  check('★차감으로 재고 감소', s1 < s0, `before=${s0} after=${s1}`)
  const led1 = await ledgerRows(mat.id)
  check('★원장에 AUTO_DEDUCT 행이 남는다', led1.length === 1, `rows=${led1.length}`)
  check('원장 행이 OUT·음수로 정규화된다', led1[0] && led1[0].transaction_type === 'OUT' && Number(led1[0].signed_quantity) < 0,
    JSON.stringify(led1[0] || {}).slice(0, 140))

  // ── 5) 카드 되돌리기 → 환원 ──────────────────────────────────────────────
  await api('PATCH', `/api/cards/${card.id}/status`, { status: 'PRINT_DONE' })
  const rev = await api('PATCH', `/api/cards/${card.id}/revert`, {})
  check('카드 되돌리기 200', rev.status === 200, `${rev.status} ${rev.text.slice(0, 140)}`)
  const s2 = await stockOf(mat.id)
  check('★환원으로 재고 원복 (증발 없음)', Math.abs(s2 - s0) < 1e-6, `expected=${s0} actual=${s2}`)
  const led2 = await ledgerRows(mat.id)
  check('★원장 차감 행 철회', led2.length === 0, `rows=${led2.length}`)

  // ── 6) 재출력 → 다시 차감 (UNIQUE 위반 없이) ─────────────────────────────
  const p2 = await postPrint('2026-08-31 14:30:00')
  const d2 = p2.data?.data?.deduction || {}
  check('★재출력이 duplicate 로 삼켜지지 않는다', p2.data?.data?.duplicate !== true, JSON.stringify(p2.data?.data || {}).slice(0, 140))
  check('★재출력에서 다시 차감된다', d2.deducted === true, JSON.stringify(d2).slice(0, 160))
  const s3 = await stockOf(mat.id)
  check('재출력 후 재고 감소', s3 < s0, `before=${s0} after=${s3}`)
  const led3 = await ledgerRows(mat.id)
  check('원장 행 재생성 (UNIQUE 위반 없음)', led3.length === 1, `rows=${led3.length}`)

  // ── 7) 주문 삭제 → 환원 (정리 겸 검증) ───────────────────────────────────
  const del = await api('DELETE', `/api/orders/${orderId}`)
  check('주문 삭제 200', del.status === 200, `${del.status} ${del.text.slice(0, 140)}`)
  const s4 = await stockOf(mat.id)
  check('★주문 삭제로도 환원된다', Math.abs(s4 - s0) < 1e-6, `expected=${s0} actual=${s4}`)
  const led4 = await ledgerRows(mat.id)
  check('삭제 후 원장 행 없음', led4.length === 0, `rows=${led4.length}`)

  console.log('')
  if (failed) { console.log(`${C.r}${C.b}E2E FAIL ${failed}건${C.x}  (order #${orderId} · mat #${mat.id})`); process.exit(1) }
  console.log(`${C.g}${C.b}E2E PASS — 자동차감 원장·환원 확인${C.x}  (mat #${mat.id})`)
})().catch((e) => { console.error(`${C.r}E2E 실행 오류:${C.x}`, e.message); process.exit(1) })
