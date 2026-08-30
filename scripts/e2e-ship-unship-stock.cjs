#!/usr/bin/env node
/**
 * e2e-ship-unship-stock.cjs — 출고 → 출고취소 → 재출고 재고 대칭 E2E (2026-08-30)
 *
 * 왜 필요한가:
 *   카드 출고 3경로가 주문을 SHIPPED 로 올리면서 재고를 차감하지 않고 있었다(prod OUT 0건의 한 축).
 *   차감을 넣으면 곧바로 **반대 방향**이 문제가 된다 — `PATCH /api/cards/:id/unship` 은
 *   주문을 SHIPPED → PRINT_DONE 으로 되돌리는 유일한 문인데 재고를 되돌리지 않았다.
 *   차감만 넣고 환원을 빼면 **출고취소 = 재고 증발**이다.
 *
 *   그리고 환원을 「역분개 IN」으로 넣을 수도 없다 — idx_inventory_tx_unique_ref(#88)가
 *   reference 당 OUT 1행을 강제해서, OUT 을 남긴 채 재출고하면 **UNIQUE 위반 500** 이다.
 *   (재고는 이미 빠진 뒤 INSERT 만 터져 원장과 어긋난다) → 환원 = **차감 행 철회**.
 *
 * 시나리오:
 *   1) 기성/유통 품목(production_required=0, is_purchase_item=1) 재고를 조정으로 +50 확보
 *   2) 제작 품목 + 기성 품목 혼합 주문 생성 (제작 라인이 카드를 만든다)
 *   3) 카드 PRINT_DONE → 출고  → 주문 SHIPPED · 기성 재고 −10 · OUT 1행
 *   4) 출고취소                → 주문 PRINT_DONE · 재고 원복 · OUT 행 철회
 *   5) 재출고                  → 재고 다시 −10 · OUT 1행 재생성 (UNIQUE 위반 없음)
 *   6) 같은 상태에서 차감 재호출 → 변화 없음 (멱등)
 *   7) 출고(shipments) 취소     → 재고 원복 · OUT 행 철회
 *      ★7번은 이번에 새로 넣은 경로가 아니라 **원래 있던 결함**이다 —
 *        PATCH /api/shipments/:orderId/ship 은 예전부터 차감했는데 취소 쪽에 환원이 없었다.
 *
 * 사용: 서버(dev:d1) 가동 상태에서  node scripts/e2e-ship-unship-stock.cjs
 */
const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (/pages\.dev|dongsanplan\.com/i.test(BASE) && process.env.ALLOW_PROD !== '1') {
  console.error('\x1b[31m[guard] 프로덕션 대상 e2e 차단:\x1b[0m ' + BASE + '\n  → prod에 테스트 데이터가 쌓입니다. 로컬에서 실행하세요.')
  process.exit(1)
}
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'
const QTY = 10
const SEED = 50

let TOKEN = ''
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
let failed = 0
function check(name, cond, detail) {
  if (cond) console.log(`  ${C.g}PASS${C.x}  ${name}`)
  else { failed++; console.log(`  ${C.r}FAIL${C.x}  ${name}  ${C.d}${detail || ''}${C.x}`) }
}
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null; const text = await res.text()
  try { data = JSON.parse(text) } catch { /* non-json */ }
  return { status: res.status, data, text }
}
function arr(d) { return Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : (d && Array.isArray(d.data) ? d.data : [])) }

/** 재고는 GET /api/inventory/:id 로 읽는다 — is_purchase_item=1 품목만 반환한다는 점에 주의 */
async function stockOf(itemId) {
  const r = await api('GET', `/api/inventory/${itemId}`)
  return Number(r.data?.data?.current_stock ?? r.data?.current_stock ?? NaN)
}
/** 이 주문의 기성 라인 순증감 (OUT 은 음수) — 차감/환원이 원장에 남았는지 확인용 */
async function ledgerNet(itemId, orderId) {
  const r = await api('GET', `/api/inventory/transactions?item_id=${itemId}&limit=200`)
  const rows = (r.data?.data?.transactions || []).filter(
    (t) => t.reference_type === 'ORDER' && Number(t.reference_id) === Number(orderId)
  )
  return {
    net: rows.reduce((a, t) => a + (Number(t.signed_quantity) || 0), 0),
    out: rows.filter((t) => t.transaction_type === 'OUT').length,
    in: rows.filter((t) => t.transaction_type === 'IN').length,
  }
}

;(async () => {
  const lr = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const ld = await lr.json()
  if (!ld?.data?.token) throw new Error('로그인 실패: ' + JSON.stringify(ld))
  TOKEN = ld.data.token
  console.log(`${C.b}출고→취소→재출고 재고 대칭 E2E${C.x}  (${BASE}, ${USER})\n`)

  // ── 품목 확보 ────────────────────────────────────────────────────────────
  const itemsRes = await api('GET', '/api/items?limit=300')
  const items = arr(itemsRes.data?.data).filter((it) => it && it.id)
  // 기성/유통 = production_required 0. 재고 조회를 위해 is_purchase_item=1 이어야 한다.
  const stockItem = items.find((it) => Number(it.production_required) === 0 && Number(it.is_purchase_item) === 1)
  // 제작 = production_required 1. 이 라인이 카드를 만든다(카드가 있어야 출고/출고취소를 탄다).
  const prodItem = items.find((it) => Number(it.production_required) === 1)
  if (!stockItem) throw new Error('기성/유통 매입품목(production_required=0, is_purchase_item=1) 없음')
  if (!prodItem) throw new Error('제작 품목(production_required=1) 없음')
  console.log(`${C.d}기성 #${stockItem.id} ${stockItem.item_name} / 제작 #${prodItem.id} ${prodItem.item_name}${C.x}`)

  // ── 1) 재고 시드 ─────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const adj = await api('POST', '/api/inventory/adjustments', {
    item_id: stockItem.id, adjustment_date: today, adjustment_quantity: SEED,
    reason: 'FOUND', notes: 'e2e ship/unship seed',
  })
  check('재고 시드 조정 200', adj.status === 200 && adj.data?.success, `${adj.status} ${adj.text.slice(0, 120)}`)
  const stock0 = await stockOf(stockItem.id)
  check('시드 후 재고 조회 가능', Number.isFinite(stock0), `stock=${stock0}`)

  // ── 2) 혼합 주문 생성 ────────────────────────────────────────────────────
  const ord = await api('POST', '/api/orders', {
    client_id: 1,
    delivery_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    notes: 'e2e ship/unship 재고 대칭',
    items: [
      { item_id: prodItem.id, item_name: prodItem.item_name, quantity: 1, unit_price: 1000 },
      { item_id: stockItem.id, item_name: stockItem.item_name, quantity: QTY, unit_price: 1000 },
    ],
  })
  check('주문 생성 200', ord.status === 200 && ord.data?.success, `${ord.status} ${ord.text.slice(0, 160)}`)
  const orderId = ord.data?.data?.id
  const orderNumber = ord.data?.data?.order_number || ''
  if (!orderId) throw new Error('주문 생성 실패로 중단')

  // 카드 확보 (주문 생성 시 자동 생성되지 않았으면 수동 생성)
  let cards = arr((await api('GET', `/api/cards?order_id=${orderId}&limit=50`)).data?.data)
  if (!cards.length) {
    await api('POST', `/api/cards/generate/${orderId}`)
    cards = arr((await api('GET', `/api/cards?order_id=${orderId}&limit=50`)).data?.data)
  }
  check('카드 생성됨', cards.length > 0, `cards=${cards.length}`)
  if (!cards.length) throw new Error('카드가 없어 출고 경로를 탈 수 없다')

  // ── 3) 카드 PRINT_DONE → 출고 ────────────────────────────────────────────
  for (const cd of cards) await api('PATCH', `/api/cards/${cd.id}/status`, { status: 'PRINT_DONE' })
  const shipRes = await api('POST', '/api/cards/bulk-ship', { card_ids: cards.map((cd) => cd.id) })
  check('카드 일괄 출고 200', shipRes.status === 200 && shipRes.data?.success, `${shipRes.status} ${shipRes.text.slice(0, 160)}`)

  const orderAfterShip = (await api('GET', `/api/orders/${orderId}`)).data?.data
  check('출고 후 주문 SHIPPED', orderAfterShip?.status === 'SHIPPED', `status=${orderAfterShip?.status}`)

  const stock1 = await stockOf(stockItem.id)
  check(`출고 후 재고 −${QTY}`, stock1 === stock0 - QTY, `before=${stock0} after=${stock1}`)
  const led1 = await ledgerNet(stockItem.id, orderId)
  check('출고 OUT 원장 1행', led1.out === 1 && led1.net === -QTY, `out=${led1.out} in=${led1.in} net=${led1.net}`)

  // ── 4) 출고 취소 → 환원 ──────────────────────────────────────────────────
  const unship = await api('PATCH', `/api/cards/${cards[0].id}/unship`, {})
  check('출고 취소 200', unship.status === 200 && unship.data?.success, `${unship.status} ${unship.text.slice(0, 140)}`)

  const orderAfterUnship = (await api('GET', `/api/orders/${orderId}`)).data?.data
  check('취소 후 주문 PRINT_DONE', orderAfterUnship?.status === 'PRINT_DONE', `status=${orderAfterUnship?.status}`)

  const stock2 = await stockOf(stockItem.id)
  check('★취소 후 재고 원복 (증발 없음)', stock2 === stock0, `expected=${stock0} actual=${stock2}`)
  // UNIQUE 인덱스가 reference 당 OUT 1행을 강제하므로 환원은 역분개가 아니라 **행 철회**다.
  //   역분개 IN 을 넣으면 OUT 행이 남아 재출고 INSERT 가 UNIQUE 위반(500) 난다.
  const led2 = await ledgerNet(stockItem.id, orderId)
  check('★차감 행 철회됨 (원장 순증감 0)', led2.out === 0 && led2.net === 0, `out=${led2.out} in=${led2.in} net=${led2.net}`)

  // ── 5) 재출고 → 다시 차감돼야 한다 ───────────────────────────────────────
  for (const cd of cards) await api('PATCH', `/api/cards/${cd.id}/status`, { status: 'PRINT_DONE' })
  const reship = await api('POST', '/api/cards/bulk-ship', { card_ids: cards.map((cd) => cd.id) })
  check('재출고 200', reship.status === 200 && reship.data?.success, `${reship.status} ${reship.text.slice(0, 140)}`)
  const stock3 = await stockOf(stockItem.id)
  check(`★재출고 후 재고 다시 −${QTY} (멱등이 재차감을 막지 않는다)`, stock3 === stock0 - QTY, `expected=${stock0 - QTY} actual=${stock3}`)
  const led3 = await ledgerNet(stockItem.id, orderId)
  check('재출고 OUT 원장 1행 (UNIQUE 위반 없음)', led3.out === 1 && led3.net === -QTY, `out=${led3.out} net=${led3.net}`)

  // ── 6) 같은 상태에서 또 출고 → 변화 없어야 한다 ──────────────────────────
  await api('POST', '/api/cards/bulk-ship', { card_ids: cards.map((cd) => cd.id) })
  const stock4 = await stockOf(stockItem.id)
  check('★중복 출고는 재차감 없음 (멱등)', stock4 === stock3, `before=${stock3} after=${stock4}`)

  // ── 7) 출고(shipments) 취소도 환원해야 한다 ─────────────────────────────
  //    카드 출고가 ensureShipmentForOrder 로 shipment 를 만들어 두므로 그걸 취소한다.
  const shipList = arr((await api('GET', `/api/shipments?search=${encodeURIComponent(orderNumber)}&limit=20`)).data?.data)
  const shipment = shipList.find((sh) => sh && sh.status !== 'CANCELLED')
  if (!shipment) {
    check('출고(shipments) 레코드 존재', false, `order_number=${orderNumber} 로 찾지 못함`)
  } else {
    const cancel = await api('PATCH', `/api/shipments/${shipment.id}/status`, { status: 'CANCELLED' })
    check('출고 취소 200', cancel.status === 200 && cancel.data?.success, `${cancel.status} ${cancel.text.slice(0, 140)}`)
    const stock5 = await stockOf(stockItem.id)
    check('★출고(shipments) 취소 후 재고 원복 (기존 결함)', stock5 === stock0, `expected=${stock0} actual=${stock5}`)
    const led5 = await ledgerNet(stockItem.id, orderId)
    check('출고 취소 후 OUT 행 철회', led5.out === 0 && led5.net === 0, `out=${led5.out} net=${led5.net}`)
  }

  console.log('')
  if (failed) { console.log(`${C.r}${C.b}E2E FAIL ${failed}건${C.x}  (order #${orderId})`); process.exit(1) }
  console.log(`${C.g}${C.b}E2E PASS — 출고/취소/재출고 재고 대칭 확인${C.x}  (order #${orderId})`)
})().catch((e) => { console.error(`${C.r}E2E 실행 오류:${C.x}`, e.message); process.exit(1) })
