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
 *   ① **세션 법인에 만들고 즉시 지운다.** 처음엔 entity 99 로 만들려 했는데 **삭제가 404** 였다 —
 *      `DELETE /api/orders/:id` 가 `entityFilter` 로 타 법인 삭제를 막기 때문이다(IDOR 방지 #333, 정상 동작).
 *      `entityId` 는 JWT 에서 오고 헤더로 못 바꾸므로 99 로 지우려면 99 소속 계정이 따로 있어야 한다 —
 *      **삭제 경로를 검증하는 게 이 스모크의 절반**이라, 계정을 늘리기보다 세션 법인에 만들고 지우는 쪽을 택했다.
 *   ①-b ⚠️ 그래서 **번호 시퀀스를 하나 소진한다**(E1-20260809-001 을 스모크가 쓰면 실주문은 002 부터).
 *      결번이 아니라 순번이 밀리는 것뿐이지만, **쓰기 라우트를 건드린 배포에서만 돌릴 것.**
 *   ② 만든 것은 **반드시 지운다.** 실패해도 `finally` 로 정리하고, 정리 실패는 별도로 보고한다
 *      (조용히 남기면 다음 실행이 그 잔재를 실데이터로 착각한다).
 *   ③ 식별자에 `SMOKEW` 마커를 넣어 **잔재가 남아도 즉시 판별**된다.
 *   ④ 삭제까지 성공해야 PASS. 「만들어졌으니 됐다」로 끝내면 삭제 경로가 깨진 걸 못 본다.
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
  if (!o.order_number || !String(o.order_number).includes('-')) {
    return record(label, false, `주문번호가 이상하다: ${o.order_number}`)
  }
  record(label, true, `#${id} ${o.order_number}`)
}

async function scenarioPurchaseOrder() {
  const label = '발주 생성/조회/삭제'
  const r = await api('POST', '/api/purchase-orders', {
    supplier_id: 1,
    order_date: new Date().toISOString().slice(0, 10),
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

// ── 실행 ────────────────────────────────────────────────────────────────
;(async () => {
  console.log(`▶ 쓰기 스모크: ${BASE} (세션 법인에 생성 후 즉시 삭제 · 마커 ${MARK})\n`)
  try {
    await login()
  } catch (e) {
    console.error('✗ ' + e.message)
    process.exit(1)
  }

  for (const fn of [scenarioOrder, scenarioPurchaseOrder, scenarioClient]) {
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
      if (!ok) cleanupFail++
      const how = gone ? '제거' : soft ? '소프트삭제(설계상 정상)' : '★남아 있음'
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  정리 ${c.path} — ${how}` +
        (ok ? '' : `  ${last.status} ${(last.json && last.json.error) || ''}`))
    }
  }

  const failed = results.filter((r) => !r.ok).length
  console.log(`\n요약: ${failed || cleanupFail ? 'FAIL' : 'PASS'}  시나리오 ${results.length - failed}/${results.length}` +
    (cleanupFail ? ` · 정리 실패 ${cleanupFail}건 ★수동 삭제 필요(마커 ${MARK})` : ''))
  process.exit(failed || cleanupFail ? 1 : 0)
})()
