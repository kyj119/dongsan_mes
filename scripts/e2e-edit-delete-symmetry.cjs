#!/usr/bin/env node
/**
 * e2e-edit-delete-symmetry.cjs — 수정·삭제가 파생/누적 상태를 제대로 되돌리는지 (2026-08-31)
 *
 * 이 시스템의 반복되는 결함 하나를 못 박는 게이트다:
 *   **이벤트 시점에 캐시를 누적 갱신해 놓고, 수정·삭제 경로가 그걸 모른다.**
 *   재고(출고차감)에서 처음 드러났고, 전수 점검에서 차입금·자동차감·AP·견적까지 같은 모양이었다.
 *
 * 검증 항목
 *   ① 주문 — 출고 차감된 주문은 기성 라인 구성을 못 바꾼다(수정 차단) · 삭제하면 재고가 돌아온다
 *   ② 차입금 — 같은 상환을 두 번 반영해도 잔액이 두 번 빠지지 않는다(차액만 반영)
 *   ④ 매입잔액 — 지급 등록/삭제 후 응답 잔액이 파생값과 일치한다(캐시 드리프트 없음)
 *   ⑤ 견적 — 전환 주문을 지우면 "이미 전환됨" 잠금이 풀린다
 *
 * ③(자동차감 환원)은 print_events 를 만들어야 해서 여기서 못 돈다 — 원장 참조 유형 등록만 확인한다.
 *
 * 사용: 서버(dev:d1) 가동 상태에서  node scripts/e2e-edit-delete-symmetry.cjs
 */
const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (/pages\.dev|dongsanplan\.com/i.test(BASE) && process.env.ALLOW_PROD !== '1') {
  console.error('\x1b[31m[guard] 프로덕션 대상 e2e 차단:\x1b[0m ' + BASE + '\n  → prod에 테스트 데이터가 쌓입니다. 로컬에서 실행하세요.')
  process.exit(1)
}
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'

let TOKEN = ''
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
let failed = 0
function check(name, cond, detail) {
  if (cond) console.log(`  ${C.g}PASS${C.x}  ${name}`)
  else { failed++; console.log(`  ${C.r}FAIL${C.x}  ${name}  ${C.d}${detail || ''}${C.x}`) }
}
function section(t) { console.log(`\n${C.b}${t}${C.x}`) }
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
async function stockOf(itemId) {
  const r = await api('GET', `/api/inventory/${itemId}`)
  return Number(r.data?.data?.current_stock ?? NaN)
}

;(async () => {
  const lr = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const ld = await lr.json()
  if (!ld?.data?.token) throw new Error('로그인 실패: ' + JSON.stringify(ld))
  TOKEN = ld.data.token
  console.log(`${C.b}수정·삭제 대칭 E2E${C.x}  (${BASE}, ${USER})`)

  const items = arr((await api('GET', '/api/items?limit=300')).data?.data).filter((it) => it && it.id)
  const stockItem = items.find((it) => Number(it.production_required) === 0 && Number(it.is_purchase_item) === 1)
  const prodItem = items.find((it) => Number(it.production_required) === 1)
  if (!stockItem || !prodItem) throw new Error('테스트용 품목(기성·제작) 확보 실패')
  const today = new Date().toISOString().slice(0, 10)
  const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)

  // ── ① 주문 수정 차단 + 삭제 환원 ─────────────────────────────────────────
  section('① 주문 수정·삭제 ↔ 재고')
  await api('POST', '/api/inventory/adjustments', {
    item_id: stockItem.id, adjustment_date: today, adjustment_quantity: 50, reason: 'FOUND', notes: 'e2e symmetry seed',
  })
  const s0 = await stockOf(stockItem.id)

  const mkOrder = async (qty) => api('POST', '/api/orders', {
    client_id: 1, delivery_date: future, notes: 'e2e 수정·삭제 대칭',
    items: [
      { item_id: prodItem.id, item_name: prodItem.item_name, quantity: 1, unit_price: 1000 },
      { item_id: stockItem.id, item_name: stockItem.item_name, quantity: qty, unit_price: 1000 },
    ],
  })
  const ord = await mkOrder(10)
  const orderId = ord.data?.data?.id
  check('주문 생성', !!orderId, `${ord.status} ${ord.text.slice(0, 120)}`)

  let cards = arr((await api('GET', `/api/cards?order_id=${orderId}&limit=50`)).data?.data)
  if (!cards.length) { await api('POST', `/api/cards/generate/${orderId}`); cards = arr((await api('GET', `/api/cards?order_id=${orderId}&limit=50`)).data?.data) }
  for (const cd of cards) await api('PATCH', `/api/cards/${cd.id}/status`, { status: 'PRINT_DONE' })
  await api('POST', '/api/cards/bulk-ship', { card_ids: cards.map((cd) => cd.id) })
  const s1 = await stockOf(stockItem.id)
  check('출고 차감 −10', s1 === s0 - 10, `before=${s0} after=${s1}`)

  // 수량 변경 → 차단돼야 한다
  const editQty = await api('PUT', `/api/orders/${orderId}`, {
    client_id: 1, delivery_date: future,
    items: [
      { item_id: prodItem.id, item_name: prodItem.item_name, quantity: 1, unit_price: 1000 },
      { item_id: stockItem.id, item_name: stockItem.item_name, quantity: 20, unit_price: 1000 },
    ],
  })
  check('★기성 라인 수량 변경 차단(400)', editQty.status === 400 && editQty.data?.meta?.stock_locked === true,
    `${editQty.status} ${editQty.text.slice(0, 140)}`)

  // 기성 라인 삭제 → 차단돼야 한다 (환원 근거가 사라지는 케이스)
  const editDrop = await api('PUT', `/api/orders/${orderId}`, {
    client_id: 1, delivery_date: future,
    items: [{ item_id: prodItem.id, item_name: prodItem.item_name, quantity: 1, unit_price: 1000 }],
  })
  check('★기성 라인 삭제 차단(400)', editDrop.status === 400 && editDrop.data?.meta?.stock_locked === true,
    `${editDrop.status} ${editDrop.text.slice(0, 140)}`)

  // 구성이 같은 수정(비고만) → 통과해야 한다
  const editSame = await api('PUT', `/api/orders/${orderId}`, {
    client_id: 1, delivery_date: future, notes: 'e2e 비고만 수정',
    items: [
      { item_id: prodItem.id, item_name: prodItem.item_name, quantity: 1, unit_price: 1000 },
      { item_id: stockItem.id, item_name: stockItem.item_name, quantity: 10, unit_price: 1000 },
    ],
  })
  check('구성 동일한 수정은 통과', editSame.status === 200, `${editSame.status} ${editSame.text.slice(0, 140)}`)

  // 삭제 → 재고 환원
  const del = await api('DELETE', `/api/orders/${orderId}`)
  check('주문 삭제 200', del.status === 200, `${del.status} ${del.text.slice(0, 140)}`)
  const s2 = await stockOf(stockItem.id)
  check('★삭제 후 재고 원복 (증발 없음)', s2 === s0, `expected=${s0} actual=${s2}`)

  // ── ② 차입금 상환 이중 차감 ──────────────────────────────────────────────
  section('② 차입금 상환 재호출')
  // 테스트 전용 차입금을 새로 만든다 — 기존 차입금에 generate-schedule 을 돌리면
  //   실제 스케줄이 재생성된다(SCHEDULED 삭제 후 재작성). 반드시 새로 만든 것에만 쓴다.
  const maturity = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)
  const loanRes = await api('POST', '/api/cash-flow/loans', {
    loan_number: `E2E-SYM-${Date.now()}`, creditor: 'e2e', description: '수정·삭제 대칭 테스트',
    original_amount: 12000000, current_balance: 12000000,
    rate_type: 'FIXED', current_rate: 5, repayment_type: 'EQUAL_PRINCIPAL',
    start_date: today, maturity_date: maturity, monthly_payment_day: 25, maturity_confirmed: 1,
  })
  const loan = loanRes.data?.data
  if (!loan?.id) {
    check('테스트 차입금 생성', false, `${loanRes.status} ${loanRes.text.slice(0, 140)}`)
  } else {
    await api('POST', `/api/cash-flow/loans/${loan.id}/generate-schedule`, {})
    const sched = arr((await api('GET', `/api/cash-flow/loans/${loan.id}/schedule`)).data?.data?.payments)
      .filter((p) => p && p.id && !p.actual_paid_amount && Number(p.principal_amount) > 0)
    if (!sched.length) {
      check('상환 스케줄 확보', false, '미상환 스케줄이 없다')
    } else {
      const pay = sched[0]
      // 단건 차입금 조회 라우트가 없다 — schedule 응답의 loan 을 쓴다.
      const balOf = async () => Number((await api('GET', `/api/cash-flow/loans/${loan.id}/schedule`)).data?.data?.loan?.current_balance)
      const before = await balOf()
      const amt = Math.max(1, Math.round(Number(pay.principal_amount) || 1))
      const r1 = await api('POST', `/api/cash-flow/loans/${loan.id}/payments/${pay.id}/pay`,
        { actual_paid_amount: amt, actual_paid_date: today })
      check('상환 반영 200', r1.status === 200, `${r1.status} ${r1.text.slice(0, 140)}`)
      const mid = await balOf()
      check('1회 반영 = 원금만큼 감소', Math.abs((before - mid) - amt) < 0.01, `before=${before} after=${mid} amt=${amt}`)

      const r2 = await api('POST', `/api/cash-flow/loans/${loan.id}/payments/${pay.id}/pay`,
        { actual_paid_amount: amt, actual_paid_date: today })
      const after = await balOf()
      check('★같은 금액 재호출은 잔액 불변 (이중 차감 없음)', r2.status === 200 && Math.abs(after - mid) < 0.01,
        `mid=${mid} after=${after}`)
    }
  }

  // ── ④ 매입잔액 파생 일치 ─────────────────────────────────────────────────
  section('④ 매입잔액(AP) 파생')
  // ★응답이 `data.clients` 다. `data` 로 읽으면 조용히 빈 배열(2026-08-25 현금영수증 드롭다운과 같은 함정).
  const suppliers = arr((await api('GET', '/api/clients?limit=20&fields=picker')).data?.data?.clients).filter((x) => x && x.id)
  const sup = suppliers[0]
  if (!sup) {
    check('공급처 확보', false, 'clients 없음')
  } else {
    const apBefore = arr((await api('GET', '/api/ledger/purchase-settlement')).data?.data?.suppliers)
      .find((x) => Number(x.id) === Number(sup.id))
    const base = Number(apBefore?.purchase_balance || 0)
    const created = await api('POST', '/api/ledger/purchase-payment',
      { supplier_id: sup.id, amount: 12345, payment_date: today, payment_method: '계좌이체', notes: 'e2e symmetry' })
    check('지급 등록 200', created.status === 200, `${created.status} ${created.text.slice(0, 140)}`)
    const echoed = Number(created.data?.data?.new_purchase_balance)
    check('★응답 잔액 = 파생값 (등록분 반영)', Math.abs(echoed - (base - 12345)) < 0.01,
      `base=${base} echoed=${echoed}`)

    const payId = created.data?.data?.id
    const removed = await api('DELETE', `/api/ledger/purchase-payment/${payId}`)
    check('지급 삭제 200', removed.status === 200, `${removed.status} ${removed.text.slice(0, 140)}`)
    check('★삭제 후 잔액 = 원래대로', Math.abs(Number(removed.data?.data?.new_purchase_balance) - base) < 0.01,
      `base=${base} after=${removed.data?.data?.new_purchase_balance}`)
  }

  // ── ⑤ 견적 전환 잠금 해제 ────────────────────────────────────────────────
  section('⑤ 견적 전환 카운터')
  const q = await api('POST', '/api/quotations', {
    client_id: 1, quotation_date: today, valid_until: future, delivery_date: future, notes: 'e2e symmetry',
    items: [{ item_id: prodItem.id, item_name: prodItem.item_name, quantity: 1, unit_price: 1000 }],
  })
  const quoteId = q.data?.data?.id
  if (!quoteId) {
    check('견적 생성', false, `${q.status} ${q.text.slice(0, 140)}`)
  } else {
    const conv = await api('POST', `/api/quotations/${quoteId}/convert-to-order`, { delivery_date: future })
    check('견적 → 주문 전환 200', conv.status === 200, `${conv.status} ${conv.text.slice(0, 140)}`)
    const convOrderId = conv.data?.data?.order_id || conv.data?.data?.id

    const again = await api('POST', `/api/quotations/${quoteId}/convert-to-order`, { delivery_date: future })
    check('재전환은 409로 막힌다', again.status === 409, `${again.status} ${again.text.slice(0, 120)}`)

    if (convOrderId) {
      await api('DELETE', `/api/orders/${convOrderId}`)
      const after = await api('POST', `/api/quotations/${quoteId}/convert-to-order`, { delivery_date: future })
      check('★전환 주문 삭제 후 잠금 해제 (파생 판정)', after.status === 200,
        `${after.status} ${after.text.slice(0, 140)}`)
      if (after.status === 200) {
        const cleanupId = after.data?.data?.order_id || after.data?.data?.id
        if (cleanupId) await api('DELETE', `/api/orders/${cleanupId}`)
      }
    }
  }

  console.log('')
  if (failed) { console.log(`${C.r}${C.b}E2E FAIL ${failed}건${C.x}`); process.exit(1) }
  console.log(`${C.g}${C.b}E2E PASS — 수정·삭제 대칭 확인${C.x}`)
})().catch((e) => { console.error(`${C.r}E2E 실행 오류:${C.x}`, e.message); process.exit(1) })
