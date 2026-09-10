#!/usr/bin/env node
/**
 * e2e-print-match.cjs — 출력 이벤트가 카드까지 도달하는가 (2026-09-08)
 *
 * 왜 이 게이트가 없었나
 *   기존 `test:autodeduct` 는 print_file_map 을 등록할 때 **card_id 를 명시로 넣는다**
 *   (e2e-autodeduct-restore.cjs 의 file-map 호출). 그런데 실제 흐름인 **흡수 학습**
 *   (workbench.ts — 파일을 주문 라인에 붙이는 시점)은 카드가 아직 없어서 **card_id 를 NULL 로** 넣는다.
 *   테스트만 채워 넣은 탓에 깨진 경로를 한 번도 지나지 않았고, 그 사이
 *   `applyEventToCard` 가 `!cardId && !cardNumber` 에서 즉시 빠져나가
 *   **출력완료가 와도 카드·card_items·shipment_ready·자동차감이 전부 멈춰 있었다**(2026-09-08 수정).
 *
 * 시나리오
 *   A 흡수 학습 재현 — card_id **없이** 파일맵 등록 → 이벤트 → 카드가 PRINT_DONE 이 되는가
 *                      (card_items 역추적이 없으면 여기서 죽는다)
 *   A' 출고 전파      — order_items.shipment_ready 가 1 로 서는가
 *   B 재주문 충돌     — **같은 파일명**을 새 주문에 다시 등록 → 이벤트가 **새 주문**에 붙는가
 *                      (종전에는 ORDER BY 없는 .first() 라 가장 오래된 주문이 잡혔다)
 *   C 모호 처리       — 진행 중 후보가 둘이면 **붙이지 않는다**(사람이 확정)
 *   C' 모호 해소      — 한쪽이 끝나면 남은 하나에 붙는다
 *
 * ⚠️ print_event 중복 판정 키가 **(file_path, print_completed_at)** 이다. 시각을 안 바꾸고 재전송하면
 *    duplicate 로 삼켜져 **매칭 로직에 도달조차 못 한다** — 그래서 이벤트마다 시각을 바꾼다.
 * ⚠️ 파일명은 실행마다 고유하게 만든다. 주문을 지워도 print_file_map 행은 남으므로
 *    (core.ts 가 card_id·order_item_id 만 NULL 로 끊는다) 고정 이름을 쓰면 다음 실행이 옛 행에 걸린다.
 *
 * 사용: 서버(dev:d1) 가동 상태에서  npm run test:print-match
 *   에이전트 키 = 환경변수 AGENT_API_KEY, 없으면 .dev.vars 에서 읽는다(로컬 전용 게이트).
 */
const fs = require('fs')
const path = require('path')

const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (/pages\.dev|dongsanplan\.com/i.test(BASE)) {
  console.error('\x1b[31m[guard] 프로덕션 대상 차단:\x1b[0m ' + BASE + '\n  → 주문·출력 이벤트가 실제로 남습니다. 로컬 전용입니다.')
  process.exit(1)
}
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'

function agentKey() {
  if (process.env.AGENT_API_KEY) return process.env.AGENT_API_KEY
  const p = path.join(__dirname, '..', '.dev.vars')
  if (!fs.existsSync(p)) return null
  const m = fs.readFileSync(p, 'utf8').match(/^AGENT_API_KEY=(.+)$/m)
  return m ? m[1].trim() : null
}

const PROD_NAME = 'E2E 출력매칭 테스트 제품'
const RUN = Date.now().toString(36).toUpperCase()
const FILE_NAME = `E2EMATCH-${RUN}.pdf`
const FILE_PATH = `Z:/e2e/${FILE_NAME}`

let TOKEN = ''
let KEY = ''
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
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

/** 이름으로 찾고 없으면 만든다 — 반복 실행해도 품목이 쌓이지 않는다 */
async function ensureItem(name, extra) {
  const found = arr((await api('GET', `/api/items?limit=200&search=${encodeURIComponent(name)}`)).data?.data)
    .find((it) => it && it.item_name === name)
  if (found) return found
  const created = await api('POST', '/api/items', Object.assign({ item_name: name }, extra))
  if (!created.data?.success) throw new Error(`품목 생성 실패(${name}): ${created.status} ${created.text.slice(0, 160)}`)
  return { id: created.data?.data?.id, item_name: name }
}

const future = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)

/** 주문 1건 + 카드 + (card_id 없는) 파일맵까지 세운다 = 흡수 학습이 남기는 모양 그대로 */
async function makeOrder(prodId, label) {
  const ord = await api('POST', '/api/orders', {
    client_id: 1, delivery_date: future(), notes: `e2e 출력매칭 ${label}`,
    items: [{ item_id: prodId, item_name: PROD_NAME, quantity: 1, unit_price: 1000, width: 100, height: 200 }],
  })
  const orderId = ord.data?.data?.id
  const orderNumber = ord.data?.data?.order_number
  if (!orderId) throw new Error(`주문 생성 실패(${label}): ${ord.status} ${ord.text.slice(0, 160)}`)

  let cards = arr((await api('GET', `/api/cards?order_id=${orderId}&limit=10`)).data?.data)
  if (!cards.length) {
    await api('POST', `/api/cards/generate/${orderId}`)
    cards = arr((await api('GET', `/api/cards?order_id=${orderId}&limit=10`)).data?.data)
  }
  const detail = await api('GET', `/api/orders/${orderId}`)
  const items = arr(detail.data?.data?.items || detail.data?.data)
  const orderItemId = items[0]?.id
  return { orderId, orderNumber, card: cards[0], orderItemId }
}

/** ★card_id 를 넣지 않는다 — 흡수 학습이 남기는 행과 동일하게 */
async function registerFileMap(o) {
  return api('POST', '/api/print-events/file-map', {
    order_number: o.orderNumber, file_seq: '001', file_name: FILE_NAME, order_item_id: o.orderItemId,
  }, { 'X-Agent-Key': KEY })
}

let clock = 0
function nextTime() {
  clock += 1
  return `2026-09-08 ${String(9 + clock).padStart(2, '0')}:00:00`
}
async function postPrint() {
  return api('POST', '/api/print-events', {
    agent_id: 'e2e-agent', equipment_id: 1, file_path: FILE_PATH, file_name: FILE_NAME,
    print_status: 'OK', print_completed_at: nextTime(),
    output_width: 1000, output_height: 2000, copy_total: 1, event_kind: 'PRINT',
  }, { 'X-Agent-Key': KEY })
}
async function cardStatus(cardId) {
  const r = await api('GET', `/api/cards/${cardId}`)
  return r.data?.data?.status || r.data?.data?.card?.status || null
}
async function shipmentReady(orderId) {
  const r = await api('GET', `/api/orders/${orderId}`)
  const items = arr(r.data?.data?.items || r.data?.data)
  return Number(items[0]?.shipment_ready ?? -1)
}

;(async () => {
  KEY = agentKey()
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
  console.log(`${C.b}출력 이벤트 → 카드 매칭 E2E${C.x}  (${BASE}, ${USER})  file=${FILE_NAME}\n`)

  const prod = await ensureItem(PROD_NAME, { category: '수성', unit: 'EA', is_sales_item: 1, production_required: 1 })
  check('테스트 품목 확보', !!prod.id, `prod=${prod.id}`)

  const made = []
  try {
    // ── A. 흡수 학습 경로 (card_id NULL) ─────────────────────────────────
    console.log(`${C.d}  A. 흡수 학습이 남기는 모양 — card_id 없는 파일맵${C.x}`)
    const A = await makeOrder(prod.id, 'A'); made.push(A)
    check('주문 A · 카드 생성', !!A.card?.id && !!A.orderItemId, `card=${A.card?.id} item=${A.orderItemId}`)
    const mapA = await registerFileMap(A)
    check('파일맵 등록 (card_id 없이)', mapA.status === 200, `${mapA.status} ${mapA.text.slice(0, 120)}`)

    const e1 = await postPrint()
    check('★card_id 가 비어도 카드에 붙는다', e1.data?.data?.card_matched === true,
      `matched=${e1.data?.data?.card_matched} card=${e1.data?.data?.card_number}`)
    check('★카드가 출력완료로 전환된다', (await cardStatus(A.card.id)) === 'PRINT_DONE',
      `status=${await cardStatus(A.card.id)}`)
    check("★출고 준비로 전파된다 (shipment_ready=1)", (await shipmentReady(A.orderId)) === 1,
      `shipment_ready=${await shipmentReady(A.orderId)}`)

    // ── B. 재주문 — 같은 파일명이 새 주문에 다시 등록된다 ────────────────
    console.log(`${C.d}  B. 같은 품목 재주문 — 파일명이 그대로 반복된다${C.x}`)
    const B = await makeOrder(prod.id, 'B'); made.push(B)
    await registerFileMap(B)
    const e2 = await postPrint()
    check('★재출력이 옛 주문이 아니라 새 주문에 붙는다', e2.data?.data?.card_number === B.card?.card_number,
      `matched=${e2.data?.data?.card_number} expected=${B.card?.card_number} (old=${A.card?.card_number})`)
    check('새 주문 카드가 출력완료', (await cardStatus(B.card.id)) === 'PRINT_DONE', `status=${await cardStatus(B.card.id)}`)
    check('옛 주문 카드는 그대로', (await cardStatus(A.card.id)) === 'PRINT_DONE', '(A는 이미 완료 상태여야 한다)')

    // ── C. 진행 중 후보가 둘 — 붙이지 않는다 ─────────────────────────────
    console.log(`${C.d}  C. 진행 중 후보 둘 — 파일명만으로는 판별 불가${C.x}`)
    const Cc = await makeOrder(prod.id, 'C'); made.push(Cc)
    const D = await makeOrder(prod.id, 'D'); made.push(D)
    await registerFileMap(Cc)
    await registerFileMap(D)
    const e3 = await postPrint()
    check('★모호하면 카드에 찍지 않는다', e3.data?.data?.card_matched === false,
      `matched=${e3.data?.data?.card_matched} card=${e3.data?.data?.card_number}`)
    check('C 카드는 대기 그대로', (await cardStatus(Cc.card.id)) !== 'PRINT_DONE', `status=${await cardStatus(Cc.card.id)}`)
    check('D 카드는 대기 그대로', (await cardStatus(D.card.id)) !== 'PRINT_DONE', `status=${await cardStatus(D.card.id)}`)

    // ── C'. 한쪽이 끝나면 남은 하나에 붙는다 ─────────────────────────────
    console.log(`${C.d}  C'. 모호가 풀리면 다시 붙는다${C.x}`)
    await api('PATCH', `/api/cards/${Cc.card.id}/status`, { status: 'PRINT_DONE' })
    const e4 = await postPrint()
    check('★남은 하나에 붙는다', e4.data?.data?.card_number === D.card?.card_number,
      `matched=${e4.data?.data?.card_number} expected=${D.card?.card_number}`)
  } finally {
    // ── 정리 ────────────────────────────────────────────────────────────
    for (const o of made.reverse()) {
      if (o?.orderId) await api('DELETE', `/api/orders/${o.orderId}`)
    }
    console.log(`${C.d}  정리: 주문 ${made.length}건 삭제 (파일맵 행은 이력으로 남는다 — 파일명이 실행마다 달라 간섭 없음)${C.x}`)
  }

  console.log(`\n${failed === 0 ? `${C.g}${C.b}전 항목 통과${C.x}` : `${C.r}${C.b}실패 ${failed}건${C.x}`}`)
  process.exit(failed === 0 ? 0 : 1)
})().catch((e) => {
  console.error(`${C.r}치명적 오류:${C.x}`, e && e.message ? e.message : e)
  process.exit(1)
})
