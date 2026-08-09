#!/usr/bin/env node
/**
 * smoke-write.cjs — **쓰기 경로** 스모크 (생성 → 검증 → 삭제)
 *
 * ★ 왜 필요한가 (2026-08-09)
 *   `sales_rep_id` 를 추가하면서 컬럼·플레이스홀더는 32개로 늘리고 `.bind()` 값은 31개로 뒀다.
 *   D1 은 개수가 정확히 맞아야 하므로 **POST /api/orders 가 전부 던졌다** — 주문 생성이 통째로 죽었다.
 *   그런데 배포 후 `npm run smoke` 는 **110/110 통과**했다. 읽기 전용이기 때문이다
 *   (그 파일 헤더에 「쓰기 요청은 포함하지 않는다」고 적혀 있다).
 *   111개 GET 을 다 돌아도 **바인드 개수 불일치·NOT NULL 위반·FK 오류는 한 건도 안 잡힌다.**
 *   실사용 주문이 아직 0건이라 피해가 없었을 뿐, 잡아낸 게 아니라 운이었다.
 *
 * ★ 안전 설계 — 흔적을 남기지 않는다
 *   ① **entity 99(E2E 테스트)로 전환해서 만들고 지운다.**
 *      `entityId` 는 JWT 에 박혀 있어 헤더로 못 바꾸지만 **`POST /api/auth/switch-entity` 가 새 JWT 를 준다.**
 *      99 세션이면 `entityFilter` 도 99 라 **삭제까지 통과**한다(첫 판은 세션 법인 1 로 만들어
 *      실법인 번호 시퀀스를 소진했다 — E1-...-001 을 스모크가 먹으면 실주문이 002 부터 시작한다).
 *      99 는 집계·원장·리포트에서 실법인(1·2·3)과 섞이지 않는다.
 *   ①-b 전환에 실패하면 **중단한다.** 실법인에 만들 바에는 안 도는 게 낫다.
 *   ② 만든 것은 **반드시 지운다.** 실패해도 `finally` 로 정리하고, 정리 실패는 별도로 보고한다
 *      (조용히 남기면 다음 실행이 그 잔재를 실데이터로 착각한다).
 *   ③ 식별자에 `SMOKEW` 마커를 넣어 **잔재가 남아도 즉시 판별**된다.
 *   ④ 삭제까지 성공해야 PASS. 「만들어졌으니 됐다」로 끝내면 삭제 경로가 깨진 걸 못 본다.
 *   ⑤ **되돌릴 수 없는 쓰기는 넣지 않는다.**
 *      출고·입고에는 DELETE 라우트가 **없다**(`shipments` 는 PATCH 만, 입고는 POST 만).
 *      · 출고는 넣었다 — **주문 하드삭제가 `shipments`·`shipment_items` 까지 지운다**(`orders/core.ts` batch).
 *        주문 체인으로 만들면 주문 하나 지우는 것으로 정리가 끝난다.
 *      · **입고는 prod 에서 안 돌린다.** 입고는 12개 테이블을 건드리는데 그중
 *        **`UPDATE items SET base_price`** 가 있고, 같은 `item_group` **전체에 전파**한다.
 *        품목은 법인 공유라 entity 99 로 해도 **실품목 판매가가 스모크 단가(1,000원)로 덮인다.**
 *        `inventory`·`inventory_transactions`·`client_item_prices`·`price_change_history` 도 남는다.
 *        → **로컬(localhost)일 때만** 돈다. 원격 URL 이면 자동으로 건너뛴다.
 *
 * ⚠️ 프로덕션에 그대로 돌려도 되지만(위 ①~④), **매번 돌릴 필요는 없다.**
 *   쓰기 라우트를 건드린 배포에서만 돌리는 게 맞다 — 실행 자체가 데이터를 만들기 때문이다.
 *
 * 사용:
 *   npm run smoke:write
 *   SMOKE_URL=https://webapp-9i0.pages.dev npm run smoke:write
 *   npm run smoke:write -- --keep      # 정리 생략(디버깅용. 잔재는 직접 지울 것)
 *
 * 종료 코드: 0 전부 PASS · 1 하나라도 실패(정리 실패 포함)
 */
const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '')
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'
const KEEP = process.argv.includes('--keep')
const MARK = 'SMOKEW'
const E2E_ENTITY = 99      // entities 에 「E2E 테스트」로 등록돼 있다
// ★ 입고는 `items.base_price` 를 품목그룹 전체에 전파한다 → **로컬에서만** 돌린다.
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.)/.test(BASE)

let TOKEN = ''
const created = []   // { label, path, id } — 역순으로 정리한다

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (_) { /* HTML 에러 페이지 등 */ }
  return { status: res.status, json, text }
}

async function login() {
  const r = await api('POST', '/api/auth/login', { username: USER, password: PASS })
  // ★ 토큰은 `data.token` 중첩이다 — 최상위 `token` 으로 읽으면 조용히 undefined 가 된다.
  TOKEN = r.json && r.json.data && r.json.data.token
  if (!TOKEN) throw new Error(`로그인 실패 (${r.status}) ${r.text.slice(0, 200)}`)

  // ★ E2E 법인으로 전환 — 새 JWT 를 받는다. 실패하면 **중단**한다(실법인에 만들지 않는다).
  const sw = await api('POST', '/api/auth/switch-entity', { entity_id: E2E_ENTITY })
  const t2 = sw.json && sw.json.data && sw.json.data.token
  if (!t2) throw new Error(`법인 전환 실패 (${sw.status}) ${sw.text.slice(0, 200)} — 실법인 오염 방지를 위해 중단`)
  TOKEN = t2
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

// ── 시나리오 ────────────────────────────────────────────────────────────
// 각 시나리오는 { 생성 → 조회로 확인 → 삭제 } 를 한 묶음으로 본다.
// 조회 확인을 넣는 이유: INSERT 가 200 을 줘도 **컬럼이 엉뚱하게 들어갔는지**는 읽어야 안다.

async function scenarioOrder() {
  const label = '주문 생성/조회/삭제'
  const r = await api('POST', '/api/orders', {
    client_id: 1,
    delivery_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    billing_entity_id: E2E_ENTITY,
    notes: `${MARK} 쓰기 스모크`,
    items: [{ item_name: `${MARK}-품목`, quantity: 1, unit_price: 1000 }],
  })
  if (r.status !== 200 || !r.json || !r.json.success) {
    return record(label, false, `생성 ${r.status} ${(r.json && r.json.error) || r.text.slice(0, 160)}`)
  }
  const id = r.json.data.id
  created.push({ label, path: `/api/orders/${id}`, id })

  const g = await api('GET', `/api/orders/${id}`)
  const o = g.json && g.json.data
  if (!o) return record(label, false, `조회 ${g.status}`)
  // ★ 값 검증까지 한다 — 생성이 200 이어도 필드가 엉뚱하게 들어갔으면 읽어야 안다.
  //   (`sales_rep_id` 바인드 누락은 INSERT 자체를 던졌지만, 자리만 밀린 버그는 200 을 주고 값이 틀린다.)
  if (Number(o.entity_id) !== E2E_ENTITY) {
    return record(label, false, `entity_id 가 ${o.entity_id} — ${E2E_ENTITY} 로 안 갔다(실법인 오염)`)
  }
  record(label, true, `#${id} ${o.order_number}`)
}

async function scenarioPurchaseOrder() {
  const label = '발주 생성/조회/삭제'
  const r = await api('POST', '/api/purchase-orders', {
    supplier_id: 1,
    order_date: new Date().toISOString().slice(0, 10),
    entity_id: E2E_ENTITY,
    notes: `${MARK} 쓰기 스모크`,
    items: [{ item_name: `${MARK}-자재`, quantity: 1, unit_price: 1000, amount: 1000 }],
  })
  // ★ 발주는 **201** 을 주고 id 를 `data.po_id` 로 준다(주문은 200 · `data.id`).
  //   라우트마다 응답 계약이 달라서, 스모크가 200/`data.id` 만 기대하면 **정상 생성을 FAIL 로 읽는다**
  //   (첫 실행에서 실제로 그랬다 — 그리고 FAIL 로 읽는 바람에 정리 목록에도 안 들어가 잔재가 남았다).
  if (r.status !== 200 && r.status !== 201) {
    return record(label, false, `생성 ${r.status} ${(r.json && r.json.error) || r.text.slice(0, 160)}`)
  }
  const d = (r.json && r.json.data) || {}
  const id = d.po_id || d.id
  if (!id) return record(label, false, `생성 응답에 id 없음: ${r.text.slice(0, 160)}`)
  created.push({ label, path: `/api/purchase-orders/${id}`, id })

  const g = await api('GET', `/api/purchase-orders/${id}`)
  const po = g.json && g.json.data
  if (!po) return record(label, false, `조회 ${g.status}`)
  // ★ 이 검증이 본체 버그를 잡았다 — 발주가 body 의 `entity_id` 를 무시하고 세션 법인에 만들었다.
  if (Number(po.entity_id) !== E2E_ENTITY) {
    return record(label, false, `entity_id 가 ${po.entity_id} — ${E2E_ENTITY} 로 안 갔다(실법인 오염)`)
  }
  record(label, true, `#${id} ${po.po_number || d.po_number}`)
}

async function scenarioClient() {
  const label = '거래처 생성/조회/삭제'
  const code = `${MARK}-${Date.now().toString().slice(-8)}`
  const r = await api('POST', '/api/clients', {
    client_code: code, client_name: `${MARK} 테스트거래처`, client_type: 'SALES', is_active: 1,
  })
  if (r.status !== 200 || !r.json || !r.json.success) {
    return record(label, false, `생성 ${r.status} ${(r.json && r.json.error) || r.text.slice(0, 160)}`)
  }
  const id = r.json.data.id
  created.push({ label, path: `/api/clients/${id}`, id })
  const g = await api('GET', `/api/clients/${id}`)
  if (!(g.json && g.json.data)) return record(label, false, `조회 ${g.status}`)
  record(label, true, `#${id} ${code}`)
}

async function scenarioShipment() {
  const label = '출고 생성/조회 (주문 체인)'
  // ★ 출고는 주문에 종속된다 — 전용 주문을 하나 더 만들어 체인으로 검증한다.
  //   정리는 **주문 하드삭제가 `shipments`·`shipment_items` 까지 지운다**(orders/core.ts batch)는 데 기댄다.
  //   출고 자체엔 DELETE 라우트가 없다.
  const o = await api('POST', '/api/orders', {
    client_id: 1,
    delivery_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    billing_entity_id: E2E_ENTITY,
    notes: `${MARK} 출고체인`,
    items: [{ item_name: `${MARK}-출고품목`, quantity: 1, unit_price: 1000 }],
  })
  if (o.status !== 200 || !o.json || !o.json.success) {
    return record(label, false, `체인 주문 생성 ${o.status} ${(o.json && o.json.error) || o.text.slice(0, 140)}`)
  }
  const orderId = o.json.data.id
  created.push({ label: label + '(체인 주문)', path: `/api/orders/${orderId}`, id: orderId })

  const r = await api('POST', '/api/shipments', {
    order_id: orderId,
    delivery_type: 'DELIVERY',
    notes: `${MARK} 쓰기 스모크`,
  })
  if (r.status !== 200 && r.status !== 201) {
    // ★ 카드가 PRINT_DONE 이 아니면 「전량 출고 원칙」으로 400 이 난다 — 그건 **정상 가드**다.
    //   스모크는 라우트가 살아 있는지를 보므로, 가드에 걸린 400 은 PASS 로 본다(500/404 는 FAIL).
    const guard = r.status === 400 && /출고|카드/.test((r.json && r.json.error) || '')
    return record(label, guard, guard ? `가드 정상 동작: ${(r.json.error || '').slice(0, 60)}` :
      `생성 ${r.status} ${(r.json && r.json.error) || r.text.slice(0, 140)}`)
  }
  const d = (r.json && r.json.data) || {}
  const sid = d.id || d.shipment_id
  const g = await api('GET', `/api/shipments/${sid}`)
  if (!(g.json && g.json.data)) return record(label, false, `조회 ${g.status}`)
  record(label, true, `#${sid} (주문 #${orderId})`)
}

async function scenarioReceiving() {
  const label = '입고 처리 (발주 체인)'
  if (!IS_LOCAL) {
    return record(label, true, 'SKIP — 원격에서는 안 돈다(입고가 items.base_price 를 품목그룹 전체에 전파)')
  }
  const po = await api('POST', '/api/purchase-orders', {
    supplier_id: 1,
    order_date: new Date().toISOString().slice(0, 10),
    entity_id: E2E_ENTITY,
    status: 'CONFIRMED',              // 입고는 CONFIRMED/PARTIAL_RECEIVED 만 가능
    notes: `${MARK} 입고체인`,
    items: [{ item_name: `${MARK}-입고자재`, quantity: 2, unit_price: 1000, amount: 2000 }],
  })
  if (po.status !== 200 && po.status !== 201) {
    return record(label, false, `체인 발주 생성 ${po.status} ${(po.json && po.json.error) || ''}`)
  }
  const pd = (po.json && po.json.data) || {}
  const poId = pd.po_id || pd.id
  // ★ 입고를 하면 발주가 `PARTIAL_RECEIVED` 가 되고 **삭제가 400 으로 막힌다**(정상 가드).
  //   입고는 재고를 움직이는 되돌릴 수 없는 작업이라 그게 맞다 — 정리 실패로 치지 않고 `optional` 로 둔다.
  //   로컬에서만 도는 시나리오이므로 잔재는 감수한다(마커 SMOKEW 로 판별된다).
  created.push({ label: label + '(체인 발주)', path: `/api/purchase-orders/${poId}`, id: poId, optional: true })

  // po_item_id 는 발주 상세에서 얻는다
  const det = await api('GET', `/api/purchase-orders/${poId}`)
  const line = det.json && det.json.data && (det.json.data.items || [])[0]
  if (!line) return record(label, false, '발주 상세에 라인이 없다')

  const r = await api('POST', `/api/purchase-orders/${poId}/receive`, {
    items: [{ po_item_id: line.id, quantity: 1 }],
    notes: `${MARK} 쓰기 스모크`,
  })
  if (r.status !== 200 && r.status !== 201) {
    return record(label, false, `입고 ${r.status} ${(r.json && r.json.error) || r.text.slice(0, 140)}`)
  }
  record(label, true, `발주 #${poId} 부분입고 1/2`)
}

// ── 실행 ────────────────────────────────────────────────────────────────
;(async () => {
  console.log(`▶ 쓰기 스모크: ${BASE} (entity ${E2E_ENTITY} 로 전환 후 생성·삭제 · 마커 ${MARK})\n`)
  try {
    await login()
  } catch (e) {
    console.error('✗ ' + e.message)
    process.exit(1)
  }

  for (const fn of [scenarioOrder, scenarioPurchaseOrder, scenarioClient, scenarioShipment, scenarioReceiving]) {
    try { await fn() } catch (e) { record(fn.name, false, '예외: ' + e.message) }
  }

  // ── 정리 — 실패해도 반드시 시도한다. 남기면 다음 실행이 실데이터로 착각한다.
  let cleanupFail = 0
  if (KEEP) {
    console.log(`\n⚠️  --keep 지정 — ${created.length}건을 남긴다. 직접 지울 것:`)
    for (const c of created) console.log(`   DELETE ${c.path}`)
  } else if (created.length) {
    console.log('\n▶ 정리')
    for (const c of created.reverse()) {
      // ★ 주문은 **2단계 삭제**다 — 1차 DELETE 는 CANCELLED 로 바꾸고, ADMIN 이 한 번 더 부르면 하드 삭제된다
      //   (`orders/core.ts`: 「CANCELLED = ADMIN 하드 삭제 경로로 통과」). 한 번만 부르면 취소 상태로 남는다.
      //   첫 판이 정확히 그랬다 — 정리가 PASS 인데 DB 에 CANCELLED 주문이 남았다.
      let last = await api('DELETE', c.path)
      if (last.status === 200 && /orders\/\d+$/.test(c.path)) last = await api('DELETE', c.path)

      // ★ 상태코드만 보면 **거짓 안심**이 된다. 실제로 사라졌는지 GET 으로 확인한다.
      //   404 = 하드 삭제됨 · 200 이지만 status=CANCELLED = 소프트(주문) · is_active=0 = 소프트(거래처).
      const g = await api('GET', c.path)
      const row = g.json && g.json.data
      const gone = g.status === 404 || !row
      const soft = !gone && (row.status === 'CANCELLED' || row.is_active === 0)
      const ok = gone || soft
      // ★ `optional` = 설계상 되돌릴 수 없는 것(입고된 발주). 남아도 실패로 치지 않는다 —
      //   실패로 치면 「정상 가드가 작동했다」는 사실이 매번 빨간불로 나와 감사가 무뎌진다.
      if (!ok && !c.optional) cleanupFail++
      const how = gone ? '제거' : soft ? '소프트삭제(설계상 정상)'
        : c.optional ? '남김(되돌릴 수 없는 작업 — 설계상 정상)' : '★남아 있음'
      console.log(`  ${ok || c.optional ? 'PASS' : 'FAIL'}  정리 ${c.path} — ${how}` +
        (ok || c.optional ? '' : `  ${last.status} ${(last.json && last.json.error) || ''}`))
    }
  }

  const failed = results.filter((r) => !r.ok).length
  console.log(`\n요약: ${failed || cleanupFail ? 'FAIL' : 'PASS'}  시나리오 ${results.length - failed}/${results.length}` +
    (cleanupFail ? ` · 정리 실패 ${cleanupFail}건 ★수동 삭제 필요(마커 ${MARK})` : ''))
  process.exit(failed || cleanupFail ? 1 : 0)
})()
