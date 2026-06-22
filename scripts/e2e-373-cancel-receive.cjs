#!/usr/bin/env node
/**
 * e2e-373-cancel-receive.cjs — #373 회귀 E2E (취소 → 재입고 사이클)
 *
 * 검증 시나리오:
 *   1) CONFIRMED PO 생성 (item 10개)
 *   2) 입고: received=10, accepted=8, rejected=2 → PENDING_REVIEW, PO=RECEIVED, 재고 +8
 *   3) 검수 전량취소(CANCELLED):
 *        - 재고 -8 (합격분만, received(10) 아님) → 원복
 *        - PO received_quantity 0, line_status PENDING, PO status CONFIRMED 롤백
 *   4) 재입고: 동일 수량 재시도 → 200 (이전엔 400 "입고 가능 수량 초과")
 *
 * 사용: 서버(dev:d1) 가동 상태에서  node scripts/e2e-373-cancel-receive.cjs
 */
const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (/pages\.dev|dongsanplan\.com/i.test(BASE) && process.env.ALLOW_PROD !== '1') {
  console.error('\x1b[31m[guard] 프로덕션 대상 e2e 차단:\x1b[0m ' + BASE + '\n  → prod에 테스트 데이터가 쌓입니다. 로컬에서 실행하세요. 정말 필요하면 ALLOW_PROD=1 설정.')
  process.exit(1)
}
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'

let TOKEN = ''
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
let failed = 0
function check(name, cond, detail) {
  if (cond) { console.log(`  ${C.g}PASS${C.x}  ${name}`) }
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
function arr(d) {
  if (Array.isArray(d)) return d
  if (d && Array.isArray(d.clients)) return d.clients
  if (d && Array.isArray(d.items)) return d.items
  if (d && Array.isArray(d.data)) return d.data
  if (d && Array.isArray(d.rows)) return d.rows
  return []
}

async function main() {
  // 로그인
  const lr = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const ld = await lr.json()
  if (!ld?.data?.token) throw new Error('로그인 실패: ' + JSON.stringify(ld))
  TOKEN = ld.data.token
  console.log(`${C.b}#373 E2E — 취소→재입고 사이클${C.x}  (${BASE}, ${USER})\n`)

  // 테스트용 item / supplier 확보
  const itemsRes = await api('GET', '/api/items?limit=50')
  const items = arr(itemsRes.data?.data).filter((it) => it && it.id)
  const item = items.find((it) => it.item_name) || items[0]
  if (!item) throw new Error('테스트용 item 없음')
  const clientsRes = await api('GET', '/api/clients?limit=20')
  const clients = arr(clientsRes.data?.data).filter((c) => c && c.id)
  const supplier = clients[0]
  if (!supplier) throw new Error('테스트용 client(공급처) 없음')
  console.log(`${C.d}item #${item.id} ${item.item_name || ''} / supplier #${supplier.id} ${supplier.client_name || supplier.name || ''}${C.x}`)

  // 입고 전 재고
  const invBeforeRes = await api('GET', `/api/inventory/${item.id}`)
  const stockBefore = Number(invBeforeRes.data?.data?.current_stock ?? invBeforeRes.data?.current_stock ?? 0)

  // 1) CONFIRMED PO 생성 (수량 10)
  const QTY = 10
  const createRes = await api('POST', '/api/purchase-orders', {
    supplier_id: supplier.id, status: 'CONFIRMED',
    items: [{ item_id: item.id, item_name: item.item_name, quantity: QTY, unit_price: 1000 }],
  })
  const poId = createRes.data?.data?.po_id ?? createRes.data?.data?.id ?? createRes.data?.po_id
  check('PO 생성(CONFIRMED)', (createRes.status === 200 || createRes.status === 201) && poId, `status=${createRes.status} body=${createRes.text.slice(0,200)}`)
  if (!poId) throw new Error('PO 생성 실패 — 중단')

  // po_item_id 조회
  let poDetail = await api('GET', `/api/purchase-orders/${poId}`)
  let poItems = arr(poDetail.data?.data?.items || poDetail.data?.items)
  const poItemId = poItems[0]?.id
  check('PO 라인 존재 + po_item_id', !!poItemId, JSON.stringify(poItems).slice(0,200))

  // 2) 입고 (accepted=8, rejected=2 → PENDING_REVIEW)
  const recvRes = await api('POST', `/api/purchase-orders/${poId}/receive`, {
    items: [{ po_item_id: poItemId, received_quantity: 10, accepted_quantity: 8, rejected_quantity: 2 }],
  })
  const receiptId = recvRes.data?.data?.receipt_id
  check('입고 200 + PENDING_REVIEW', recvRes.status === 200 && recvRes.data?.data?.inspection_status === 'PENDING_REVIEW',
    `status=${recvRes.status} insp=${recvRes.data?.data?.inspection_status}`)
  check('입고 후 PO status=RECEIVED', recvRes.data?.data?.po_status === 'RECEIVED', `po_status=${recvRes.data?.data?.po_status}`)

  poDetail = await api('GET', `/api/purchase-orders/${poId}`)
  poItems = arr(poDetail.data?.data?.items || poDetail.data?.items)
  check('입고 후 received_quantity=10', Number(poItems[0]?.received_quantity) === 10, `received=${poItems[0]?.received_quantity}`)

  const invAfterRecvRes = await api('GET', `/api/inventory/${item.id}`)
  const stockAfterRecv = Number(invAfterRecvRes.data?.data?.current_stock ?? invAfterRecvRes.data?.current_stock ?? 0)
  check('입고 후 재고 +8 (합격분)', stockAfterRecv === stockBefore + 8, `before=${stockBefore} afterRecv=${stockAfterRecv}`)

  // 3) 검수 전량취소
  const cancelRes = await api('PATCH', `/api/inventory/receipts/${receiptId}/inspection-decision`, {
    decision: 'CANCELLED', notes: 'E2E #373',
  })
  check('취소 200', cancelRes.status === 200, `status=${cancelRes.status} body=${cancelRes.text.slice(0,200)}`)
  check('취소 응답 po_status=CONFIRMED', cancelRes.data?.data?.po_status === 'CONFIRMED', `po_status=${cancelRes.data?.data?.po_status}`)

  // 취소 멱등성 재호출
  const cancelAgain = await api('PATCH', `/api/inventory/receipts/${receiptId}/inspection-decision`, { decision: 'CANCELLED' })
  check('취소 멱등 (idempotent)', cancelAgain.status === 200 && cancelAgain.data?.data?.idempotent === true,
    `status=${cancelAgain.status} idem=${cancelAgain.data?.data?.idempotent}`)

  // PO 롤백 검증
  poDetail = await api('GET', `/api/purchase-orders/${poId}`)
  poItems = arr(poDetail.data?.data?.items || poDetail.data?.items)
  const poStatus = poDetail.data?.data?.status ?? poDetail.data?.status
  check('취소 후 received_quantity=0 롤백', Number(poItems[0]?.received_quantity) === 0, `received=${poItems[0]?.received_quantity}`)
  check('취소 후 line_status=PENDING', poItems[0]?.line_status === 'PENDING', `line_status=${poItems[0]?.line_status}`)
  check('취소 후 PO status=CONFIRMED', poStatus === 'CONFIRMED', `po.status=${poStatus}`)

  const invAfterCancelRes = await api('GET', `/api/inventory/${item.id}`)
  const stockAfterCancel = Number(invAfterCancelRes.data?.data?.current_stock ?? invAfterCancelRes.data?.current_stock ?? 0)
  check('취소 후 재고 원복 (-8, received(10) 아님)', stockAfterCancel === stockBefore, `before=${stockBefore} afterCancel=${stockAfterCancel}`)

  // 4) 재입고 — 핵심: 400 차단 해소
  const reRecvRes = await api('POST', `/api/purchase-orders/${poId}/receive`, {
    items: [{ po_item_id: poItemId, received_quantity: 10, accepted_quantity: 10, rejected_quantity: 0 }],
  })
  check('★ 재입고 200 (이전 400 차단 해소)', reRecvRes.status === 200,
    `status=${reRecvRes.status} body=${reRecvRes.text.slice(0,200)}`)
  check('재입고 후 PO status=RECEIVED', reRecvRes.data?.data?.po_status === 'RECEIVED', `po_status=${reRecvRes.data?.data?.po_status}`)

  console.log('')
  if (failed === 0) console.log(`${C.g}${C.b}E2E PASS — #373 해소 확인${C.x}  (PO #${poId})`)
  else console.log(`${C.r}${C.b}E2E FAIL ${failed}건${C.x}  (PO #${poId})`)
  process.exit(failed === 0 ? 0 : 1)
}
main().catch((e) => { console.error(`${C.r}치명적: ${e.stack || e.message}${C.x}`); process.exit(1) })
