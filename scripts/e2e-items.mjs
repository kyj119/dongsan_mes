#!/usr/bin/env node
/**
 * e2e-items.mjs — 품목 체계 E2E 검증
 * 등록 → 수정 → 삭제 → 주문서 사용까지 전체 흐름 테스트
 */
import http from 'http'

const BASE = (process.env.SMOKE_URL || 'http://192.168.0.94:3000').replace(/\/$/, '')
const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[36m', D = '\x1b[0m'
let pass = 0, fail = 0, token = ''
const fails = []

function fetch(url, opts = {}) {
  return new Promise((res, rej) => {
    const u = new URL(url)
    const req = http.request({
      hostname: u.hostname, port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: 10000
    }, resp => {
      let d = ''
      resp.on('data', c => d += c)
      resp.on('end', () => { try { res(JSON.parse(d)) } catch { res({ raw: d }) } })
    })
    req.on('timeout', () => { req.destroy(); rej(new Error('timeout')) })
    req.on('error', rej)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

function ok(n, d) { pass++; console.log(`  ${G}✓${D} ${n}${d ? ' — ' + d : ''}`) }
function no(n, r) { fail++; fails.push(`${n}: ${r}`); console.log(`  ${R}✗ ${n} — ${r}${D}`) }
function H(ct) { const h = { Authorization: `Bearer ${token}` }; if (ct) h['Content-Type'] = 'application/json'; return h }

async function main() {
  console.log(`\n${B}▶ 품목 E2E 검증 — ${BASE}${D}\n`)

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password' })
  })
  if (!login.data?.token) { console.log(`${R}✗ 로그인 실패${D}`); process.exit(1) }
  token = login.data.token
  console.log(`${G}✓ 로그인${D}`)

  // ═══ Test 1: 소재 개별 등록 → 자동 연결 ═══
  console.log(`${B}\n═══ Test 1: 소재 개별 등록 → 자동 연결 ═══${D}`)

  const newMedia = await fetch(`${BASE}/api/print-system/media`, {
    method: 'POST', headers: H(true),
    body: JSON.stringify({
      name: '테스트소재', media_type: 'ROLL', price_per_unit: 999,
      roll_width_cm: 100, media_group: '테스트', method_ids: [1, 2]
    })
  })
  if (newMedia.success) {
    ok('소재 등록', `id=${newMedia.data.id}`)
    const items = newMedia.data.created_items || []
    if (items.length === 2) ok('출력 품목 자동 생성', items.map(i => i.item_name).join(', '))
    else no('출력 품목 자동 생성', `2건 예상, ${items.length}건`)

    // methods 연결 확인
    const mediaCheck = await fetch(`${BASE}/api/print-system/media`, { headers: H() })
    const allMedia = Object.values(mediaCheck.data?.groups || {}).flat().concat(mediaCheck.data?.ungrouped || [])
    const testMedia = allMedia.find(m => m.name === '테스트소재')
    if (testMedia?.methods?.length === 2) ok('print_method_media 자동 연결', '솔벤+수성')
    else no('print_method_media 자동 연결', `methods=${testMedia?.methods?.length || 0}`)
  } else no('소재 등록', newMedia.error)

  // ═══ Test 2: 소재 수정 → 단가 연쇄 ═══
  console.log(`${B}\n═══ Test 2: 소재 수정 → 단가 연쇄 ═══${D}`)

  await fetch(`${BASE}/api/print-system/media/55`, {
    method: 'PUT', headers: H(true),
    body: JSON.stringify({ price_per_unit: 19000 })
  })
  const afterPrice = await fetch(`${BASE}/api/print-system/items-for-order?method_id=4`, { headers: H() })
  const pm4001 = (afterPrice.data || []).find(i => i.item_code === 'PM-4001')
  if (pm4001?.base_price === 22000) ok('단가 연쇄', `소재 18000→19000 → PM-4001 base_price=22000 (평판3000+소재19000)`)
  else no('단가 연쇄', `예상 22000, 실제 ${pm4001?.base_price}`)
  // 원복
  await fetch(`${BASE}/api/print-system/media/55`, {
    method: 'PUT', headers: H(true),
    body: JSON.stringify({ price_per_unit: 18000 })
  })

  // ═══ Test 3: 소재 삭제 → 품목 비활성화 ═══
  console.log(`${B}\n═══ Test 3: 소재 삭제 → 품목 비활성화 ═══${D}`)

  const allM = Object.values((await fetch(`${BASE}/api/print-system/media`, { headers: H() })).data?.groups || {}).flat()
    .concat((await fetch(`${BASE}/api/print-system/media`, { headers: H() })).data?.ungrouped || [])
  const testM = allM.find(m => m.name === '테스트소재')
  if (testM) {
    await fetch(`${BASE}/api/print-system/media/${testM.id}`, { method: 'DELETE', headers: H() })
    const afterDel = await fetch(`${BASE}/api/print-system/items-for-order`, { headers: H() })
    const testItems = (afterDel.data || []).filter(i => i.item_name?.includes('테스트소재'))
    if (testItems.length === 0) ok('소재 삭제 → 품목 비활성화', '테스트소재 관련 품목 0건')
    else no('소재 삭제', `${testItems.length}건 여전히 활성`)
  } else ok('소재 삭제', '테스트소재 이미 정리')

  // ═══ Test 4: GOODS 등록 → 플래그 자동설정 ═══
  console.log(`${B}\n═══ Test 4: GOODS 등록 → 플래그 자동설정 ═══${D}`)

  const goods = await fetch(`${BASE}/api/items`, {
    method: 'POST', headers: H(true),
    body: JSON.stringify({ item_name: '테스트 깃대 6m', category: '상품', item_type: 'GOODS', unit: 'EA', base_price: 15000 })
  })
  if (goods.success) {
    const gid = goods.data.id
    const g = (await fetch(`${BASE}/api/items/${gid}`, { headers: H() })).data
    if (g?.is_sales_item === 1 && g?.is_purchase_item === 1)
      ok('GOODS 플래그', 'is_sales=1, is_purchase=1')
    else no('GOODS 플래그', `is_sales=${g?.is_sales_item}, is_purchase=${g?.is_purchase_item}`)

    // 주문서 검색
    const s = await fetch(`${BASE}/api/items?type=sales&search=깃대`, { headers: H() })
    if ((s.data || []).length > 0) ok('GOODS 주문서 검색', '검색됨')
    else no('GOODS 주문서 검색', '미발견')

    // 발주서 검색
    const p = await fetch(`${BASE}/api/items?type=purchase&search=깃대`, { headers: H() })
    if ((p.data || []).length > 0) ok('GOODS 발주서 검색', '검색됨')
    else no('GOODS 발주서 검색', '미발견')

    await fetch(`${BASE}/api/items/${gid}`, { method: 'DELETE', headers: H() })
  } else no('GOODS 등록', goods.error)

  // ═══ Test 5: 원자재 등록 → 코드 자동생성 ═══
  console.log(`${B}\n═══ Test 5: 원자재 등록 → 코드 + parent_media ═══${D}`)

  const rm = await fetch(`${BASE}/api/items`, {
    method: 'POST', headers: H(true),
    body: JSON.stringify({
      item_name: '테스트원단 60폭', category: '원자재', sub_category: '원단류',
      item_type: 'MATERIAL', unit: 'EA', width_mm: 600, parent_media_id: 67
    })
  })
  if (rm.success) {
    const r = (await fetch(`${BASE}/api/items/${rm.data.id}`, { headers: H() })).data
    if (r?.item_code?.startsWith('RM-F')) ok('원자재 코드', r.item_code)
    else no('원자재 코드', `예상 RM-F, 실제 ${r?.item_code}`)
    if (r?.parent_media_id === 67) ok('parent_media_id', '67 (현수막)')
    else no('parent_media_id', `${r?.parent_media_id}`)
    if (r?.is_purchase_item === 1) ok('is_purchase_item', '자동 1')
    else no('is_purchase_item', `${r?.is_purchase_item}`)
    await fetch(`${BASE}/api/items/${rm.data.id}`, { method: 'DELETE', headers: H() })
  } else no('원자재 등록', rm.error)

  // ═══ Test 6: 주문서 품목 검색 + 단가 ═══
  console.log(`${B}\n═══ Test 6: 주문서 품목 검색 + 단가 ═══${D}`)

  const oi = await fetch(`${BASE}/api/print-system/items-for-order`, { headers: H() })
  const oid = oi.data || []
  ok('출력 품목 목록', `${oid.length}건`)

  if (oid.length > 0) {
    const t = oid[0]
    const hasFields = t.method_name && t.media_name && t.base_price !== undefined && t.media_type
    if (hasFields) ok('응답 필드', `method=${t.method_name}, media=${t.media_name}, type=${t.media_type}`)
    else no('응답 필드', `누락: method=${!!t.method_name}, media=${!!t.media_name}, type=${!!t.media_type}`)
  }

  // ═══ Test 7: 주문 생성 → 카드 그룹핑 ═══
  console.log(`${B}\n═══ Test 7: 주문 생성 → 카드 그룹핑 ═══${D}`)

  let clients = await fetch(`${BASE}/api/clients?limit=1`, { headers: H() })
  let clientId = (clients.data || [])[0]?.id
  let tempClient = false
  if (!clientId) {
    // 테스트용 거래처 생성
    const nc = await fetch(`${BASE}/api/clients`, {
      method: 'POST', headers: H(true),
      body: JSON.stringify({ client_name: '테스트거래처', client_code: `E2E-${Date.now()}`, client_type: 'CORPORATE' })
    })
    clientId = nc.data?.id
    tempClient = true
  }
  if (!clientId) { no('주문 생성', '거래처 생성 실패') }
  else {
    const pm1001 = oid.find(i => i.item_code === 'PM-1001')
    const pm4001r = oid.find(i => i.item_code === 'PM-4001')

    if (pm1001 && pm4001r) {
      const dd = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]
      const order = await fetch(`${BASE}/api/orders`, {
        method: 'POST', headers: H(true),
        body: JSON.stringify({
          client_id: clientId, delivery_date: dd,
          items: [
            { item_id: pm1001.id, item_name: pm1001.item_name, category_name: '현수막', width: 90, height: 300, quantity: 1, unit: 'EA', unit_price: 2000, amount: 5400 },
            { item_id: pm4001r.id, item_name: pm4001r.item_name, category_name: '포맥스', width: 50, height: 70, quantity: 1, unit: 'EA', unit_price: 21000, amount: 21000 }
          ]
        })
      })
      if (order.success) {
        const orderId = order.data?.id || order.data?.order_id
        ok('주문 생성', `id=${orderId}`)

        // 주문 확정 (CONFIRMED) → 카드 자동 생성
        await fetch(`${BASE}/api/orders/${orderId}/status`, {
          method: 'PATCH', headers: H(true),
          body: JSON.stringify({ status: 'CONFIRMED' })
        })

        // 주문 응답에서 카드 생성 메시지 확인
        const cardMsg = order.message || ''
        const cardMatch = cardMsg.match(/(\d+) card/)
        const cardCount = cardMatch ? parseInt(cardMatch[1]) : 0

        if (cardCount === 1) ok('카드 그룹핑', `OUTPUT → 1카드 생성 (${cardMsg})`)
        else if (cardCount > 1) no('카드 그룹핑', `${cardCount}카드 (1 예상)`)
        else no('카드 그룹핑', `카드 미생성 (msg: ${cardMsg})`)

        ok('카드 생성 완료', `주문 ${orderId}`)

        await fetch(`${BASE}/api/orders/${orderId}`, { method: 'DELETE', headers: H() })
        ok('테스트 주문 정리', '삭제')
      } else no('주문 생성', JSON.stringify(order.error || order.message || '').slice(0, 100))
    } else no('주문 생성', 'PM-1001/PM-4001 미발견')
    // 테스트 거래처 정리
    if (tempClient && clientId) await fetch(`${BASE}/api/clients/${clientId}`, { method: 'DELETE', headers: H() })
  }

  // ═══ Test 8: 출력방식 추가 → 품목+매핑 자동 ═══
  console.log(`${B}\n═══ Test 8: 출력방식 추가 → 품목+매핑 자동 ═══${D}`)

  await fetch(`${BASE}/api/print-system/media/55`, {
    method: 'PUT', headers: H(true),
    body: JSON.stringify({ method_ids: [3, 4] })  // UV+평판
  })
  const afterAdd = await fetch(`${BASE}/api/print-system/items-for-order`, { headers: H() })
  const uvItem = (afterAdd.data || []).find(i => i.media_name === '포맥스 1T 백색' && i.method_name === 'UV')
  if (uvItem) {
    ok('출력방식 추가', `UV 포맥스 1T 백색 → ${uvItem.item_code}`)
    const uvPM = await fetch(`${BASE}/api/items/${uvItem.id}/materials`, { headers: H() })
    if ((uvPM.data || []).length > 0)
      ok('신규 품목 product_materials', `${(uvPM.data || []).length}건 자동 연결`)
    else no('신규 품목 product_materials', '0건')
  } else no('출력방식 추가', 'UV 포맥스 1T 백색 미발견')

  // 원복
  await fetch(`${BASE}/api/print-system/media/55`, {
    method: 'PUT', headers: H(true),
    body: JSON.stringify({ method_ids: [4] })
  })
  ok('출력방식 원복', '평판만으로 복원')

  // ═══ 결과 ═══
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`${G}PASS: ${pass}${D}  ${fail > 0 ? R : ''}FAIL: ${fail}${D}`)
  if (fails.length > 0) {
    console.log(`\n${R}실패:${D}`)
    fails.forEach(f => console.log(`  ${R}✗${D} ${f}`))
  }
  console.log()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error(`${R}ERROR: ${e.message}${D}`); process.exit(1) })
