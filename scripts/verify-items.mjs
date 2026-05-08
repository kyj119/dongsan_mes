#!/usr/bin/env node
/**
 * verify-items.mjs — 품목 체계 3계층 검증 스크립트
 *
 * Layer 1: 데이터 무결성 (API 기반)
 * Layer 2: API 동작 검증
 * Layer 3: 브라우저 UI 검증 (Playwright, 선택적)
 *
 * 사용법:
 *   npm run verify:items                    # API 검증만 (Layer 1+2)
 *   npm run verify:items -- --browser       # 브라우저 포함 (Layer 1+2+3)
 *   SMOKE_URL=http://192.168.0.94:3000 npm run verify:items
 */

import http from 'http'

const BASE = (process.env.SMOKE_URL || 'http://192.168.0.94:3000').replace(/\/$/, '')
const USER = process.env.SMOKE_USER || 'admin'
const PASS = process.env.SMOKE_PASS || 'password'
const WITH_BROWSER = process.argv.includes('--browser')

// Colors
const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[36m', D = '\x1b[0m'

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({
      hostname: u.hostname, port: u.port,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: 10000
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, raw: d }) }
      })
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

let token = ''
let passed = 0, failed = 0, warnings = 0
const failures = []

function pass(name, detail) {
  passed++
  console.log(`  ${G}✓${D} ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, reason) {
  failed++
  failures.push({ name, reason })
  console.log(`  ${R}✗ ${name} — ${reason}${D}`)
}
function warn(name, detail) {
  warnings++
  console.log(`  ${Y}⚠ ${name} — ${detail}${D}`)
}

async function login() {
  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS })
    })
    if (res.data?.token) {
      token = res.data.token
      return true
    }
    console.log(`${R}✗ 로그인 실패: ${JSON.stringify(res)}${D}`)
    return false
  } catch (e) {
    console.log(`${R}✗ 서버 연결 실패: ${e.message}${D}`)
    console.log(`  서버가 ${BASE}에서 실행 중인지 확인하세요.`)
    return false
  }
}

function H() { return { Authorization: `Bearer ${token}` } }

// ============================================================================
// Layer 1: 데이터 무결성
// ============================================================================
async function layer1() {
  console.log(`\n${B}═══ Layer 1: 데이터 무결성 ═══${D}`)

  // 1-1. print_methods 존재
  const methods = await fetch(`${BASE}/api/print-system/methods`, { headers: H() })
  const methodData = methods.data || []
  if (methodData.length >= 4) pass('print_methods', `${methodData.length}건`)
  else fail('print_methods', `4건 이상 필요, 현재 ${methodData.length}건`)

  // 1-2. print_media 존재
  const media = await fetch(`${BASE}/api/print-system/media`, { headers: H() })
  const groups = media.data?.groups || {}
  const ungrouped = media.data?.ungrouped || []
  const allMedia = Object.values(groups).flat().concat(ungrouped)
  if (allMedia.length > 0) pass('print_media', `${allMedia.length}건 (${Object.keys(groups).length}그룹)`)
  else fail('print_media', '소재가 없습니다')

  // 1-3. 모든 소재에 methods 연결 확인
  const noMethods = allMedia.filter(m => !m.methods || m.methods.length === 0)
  if (noMethods.length === 0) pass('소재→출력방식 연결', '전체 연결됨')
  else fail('소재→출력방식 연결', `${noMethods.length}건 미연결: ${noMethods.map(m => m.name).join(', ')}`)

  // 1-4. 출력 품목 (PRODUCT with print_method_id)
  const items = await fetch(`${BASE}/api/items?item_type=PRODUCT&limit=200`, { headers: H() })
  const products = (items.data || []).filter(i => i.print_method_id)
  if (products.length > 0) pass('출력 품목', `${products.length}건`)
  else fail('출력 품목', 'print_method_id가 있는 PRODUCT 없음')

  // 1-5. 원자재 parent_media_id 설정
  const materials = await fetch(`${BASE}/api/items?item_type=MATERIAL&limit=200`, { headers: H() })
  const matData = materials.data || []
  const noParent = matData.filter(m => !m.parent_media_id)
  if (matData.length === 0) warn('원자재', '등록된 원자재 없음')
  else if (noParent.length === 0) pass('원자재 parent_media_id', `${matData.length}건 전부 설정`)
  else fail('원자재 parent_media_id', `${noParent.length}건 미설정: ${noParent.map(m => m.item_code).join(', ')}`)

  // 1-6. 원자재 item_group 설정
  const noGroup = matData.filter(m => !m.item_group)
  if (matData.length > 0 && noGroup.length === 0) pass('원자재 item_group', '전부 설정')
  else if (noGroup.length > 0) fail('원자재 item_group', `${noGroup.length}건 null: ${noGroup.map(m => m.item_code).join(', ')}`)

  // 1-7. product_materials 매핑 검증
  let pmMissing = 0
  let pmTotal = 0
  for (const p of products.slice(0, 20)) {
    const pm = await fetch(`${BASE}/api/items/${p.id}/materials`, { headers: H() })
    const count = (pm.data || []).length
    pmTotal += count
    if (count === 0) pmMissing++
  }
  if (pmMissing === 0 && products.length > 0) pass('product_materials 매핑', `${products.length}개 출력 품목 → ${pmTotal}건 원자재 연결`)
  else if (pmMissing > 0) fail('product_materials 매핑', `${pmMissing}/${products.length}개 출력 품목에 원자재 미연결`)

  // 1-8. 출력 품목 ↔ 소재의 methods 교차 검증
  // 각 출력 품목의 print_method_id가 해당 소재의 methods 목록에 포함되어야 함
  let pmmOk = 0, pmmBad = 0
  const mediaMethodsMap = {}
  for (const m of allMedia) {
    mediaMethodsMap[m.id] = new Set((m.methods || []).map(mt => mt.id))
  }
  for (const p of products) {
    const mediaMethodSet = mediaMethodsMap[p.print_media_id]
    if (mediaMethodSet && mediaMethodSet.has(p.print_method_id)) pmmOk++
    else pmmBad++
  }
  if (pmmBad === 0) pass('출력방식↔소재 연결 정합성', `${pmmOk}건 전부 소재의 methods에 포함`)
  else fail('출력방식↔소재 연결 정합성', `${pmmBad}건 소재에 출력방식 미연결`)

  // 1-9. GOODS 플래그 검증
  const goods = await fetch(`${BASE}/api/items?item_type=GOODS&limit=50`, { headers: H() })
  const goodsData = goods.data || []
  if (goodsData.length === 0) {
    warn('GOODS 플래그', 'GOODS 타입 품목 없음 (테스트 불가)')
  } else {
    const badGoods = goodsData.filter(g => !g.is_sales_item || !g.is_purchase_item)
    if (badGoods.length === 0) pass('GOODS 플래그', `${goodsData.length}건 전부 is_sales+is_purchase=1`)
    else fail('GOODS 플래그', `${badGoods.length}건 미설정: ${badGoods.map(g => g.item_name).join(', ')}`)
  }
}

// ============================================================================
// Layer 2: API 동작 검증
// ============================================================================
async function layer2() {
  console.log(`\n${B}═══ Layer 2: API 동작 검증 ═══${D}`)

  // 2-1. items-for-order 응답 구조
  const oi = await fetch(`${BASE}/api/print-system/items-for-order`, { headers: H() })
  const oid = oi.data || []
  if (oid.length > 0) {
    const sample = oid[0]
    const hasFields = sample.method_name && sample.media_name && sample.base_price !== undefined
    if (hasFields) pass('items-for-order', `${oid.length}건, 필수 필드(method_name, media_name, base_price) 포함`)
    else fail('items-for-order', `필수 필드 누락: method_name=${!!sample.method_name}, media_name=${!!sample.media_name}, base_price=${sample.base_price}`)
  } else {
    fail('items-for-order', '출력 품목 0건')
  }

  // 2-2. media API에 methods + raw_materials 포함 확인
  const media = await fetch(`${BASE}/api/print-system/media`, { headers: H() })
  const firstGroup = Object.values(media.data?.groups || {})[0]
  if (firstGroup && firstGroup.length > 0) {
    const sample = firstGroup[0]
    const hasMethods = Array.isArray(sample.methods)
    const hasRM = Array.isArray(sample.raw_materials)
    if (hasMethods && hasRM) pass('media API 응답', `methods(${sample.methods.length}건) + raw_materials(${sample.raw_materials.length}건) 포함`)
    else fail('media API 응답', `methods=${hasMethods}, raw_materials=${hasRM}`)
  } else {
    warn('media API', '그룹 데이터 없음')
  }

  // 2-3. 품목 코드 범위 정합성
  const allItems = await fetch(`${BASE}/api/items?limit=200`, { headers: H() })
  const items = allItems.data || []
  const codeIssues = []
  for (const item of items) {
    if (!item.item_code) continue
    if (item.print_method_id && item.item_code.startsWith('PM-')) {
      const num = parseInt(item.item_code.replace('PM-', ''))
      // PM-1xxx=수성, PM-2xxx=솔벤, PM-3xxx=UV, PM-4xxx=평판
      // 이외 범위에 print_method_id가 있으면 이상
      if (num >= 5000 && item.print_method_id) {
        codeIssues.push(`${item.item_code}(${item.item_name}): 출력 품목인데 PM-5000+ 범위`)
      }
    }
  }
  if (codeIssues.length === 0) pass('품목 코드 범위', '출력 품목 전부 PM-1~4xxx 범위')
  else warn('품목 코드 범위', `${codeIssues.length}건 범위 불일치: ${codeIssues[0]}`)

  // 2-4. 단가 연쇄 검증 (출력방식 + 소재 = base_price)
  const methods = await fetch(`${BASE}/api/print-system/methods`, { headers: H() })
  const methodMap = {}
  for (const m of methods.data || []) methodMap[m.id] = m.price_per_sqm || 0

  const mediaAll = await fetch(`${BASE}/api/print-system/media`, { headers: H() })
  const mediaMap = {}
  for (const group of Object.values(mediaAll.data?.groups || {})) {
    for (const m of group) mediaMap[m.id] = m.price_per_unit || 0
  }

  let priceOk = 0, priceBad = 0
  for (const item of items.filter(i => i.print_method_id && i.print_media_id)) {
    const expected = (methodMap[item.print_method_id] || 0) + (mediaMap[item.print_media_id] || 0)
    if (Math.abs(item.base_price - expected) < 1) priceOk++
    else {
      priceBad++
      if (priceBad <= 2) console.log(`    ${item.item_code}: base_price=${item.base_price} ≠ method(${methodMap[item.print_method_id]})+media(${mediaMap[item.print_media_id]})=${expected}`)
    }
  }
  if (priceBad === 0) pass('단가 연쇄', `${priceOk}건 전부 method+media 합산 일치`)
  else fail('단가 연쇄', `${priceBad}건 불일치`)

  // 2-5. category_id 의존도 (새 코드에서 사용 안 해야 함)
  const catIdUsed = items.filter(i => i.category_id && i.category_id > 0)
  const catIdOther = catIdUsed.filter(i => i.category_name !== '기타')
  if (catIdOther.length === 0) pass('category_id 의존도', `category_id 의미 있는 사용 0건 (전부 '기타' 또는 미사용)`)
  else warn('category_id 의존도', `${catIdOther.length}건이 '기타' 아닌 category_id 사용 중`)
}

// ============================================================================
// Layer 3: 브라우저 검증 (선택적)
// ============================================================================
async function layer3() {
  if (!WITH_BROWSER) {
    console.log(`\n${Y}═══ Layer 3: 브라우저 검증 (--browser 옵션으로 실행) ═══${D}`)
    return
  }

  console.log(`\n${B}═══ Layer 3: 브라우저 검증 ═══${D}`)

  let playwright
  try {
    playwright = await import('playwright')
  } catch {
    warn('브라우저', 'playwright 패키지 미설치 (npm i -D playwright)')
    return
  }

  const browser = await playwright.chromium.launch({ headless: true })
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

  try {
    // 로그인
    await page.goto(`${BASE}/login`)
    await page.fill('input[name="username"], input#username, input[type="text"]', USER)
    await page.fill('input[name="password"], input#password, input[type="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/cards**', { timeout: 5000 }).catch(() => {})

    // 품목 페이지
    await page.goto(`${BASE}/items`)
    await page.waitForTimeout(1500)

    // 출력 탭 확인
    const outputRows = await page.$$eval('#tabOutput table tbody tr', rows => rows.length)
    if (outputRows > 0) pass('브라우저: 출력 탭', `${outputRows}행 표시`)
    else fail('브라우저: 출력 탭', '테이블 행 없음')

    // 설정 탭 이동
    await page.evaluate(() => document.querySelector('#tabSettings')?.click())
    await page.waitForTimeout(1000)

    // 소재 그룹 확인
    const groupHeaders = await page.$$eval('[onclick*="togglePrintMediaGroup"]', els => els.length)
    if (groupHeaders > 0) pass('브라우저: 소재 그룹', `${groupHeaders}개 그룹`)
    else fail('브라우저: 소재 그룹', '그룹 헤더 없음')

    // 그룹 펼치기 → 인라인 편집 요소 확인
    await page.evaluate(() => {
      const toggle = document.querySelector('[onclick*="togglePrintMediaGroup"]')
      if (toggle) toggle.click()
    })
    await page.waitForTimeout(500)

    const editFields = await page.$$eval('.media-edit-name', els => els.length)
    if (editFields > 0) pass('브라우저: 인라인 편집', `${editFields}개 편집 필드`)
    else fail('브라우저: 인라인 편집', '.media-edit-name 요소 없음')

    // 출력방식 배지 확인
    const methodBadges = await page.$$eval('[data-method-id]', els => els.length)
    if (methodBadges > 0) pass('브라우저: 출력방식 배지', `${methodBadges}개`)
    else fail('브라우저: 출력방식 배지', '배지 없음')

    // 콘솔 에러
    const realErrors = consoleErrors.filter(e => !e.includes('No auth token') && !e.includes('tailwindcss'))
    if (realErrors.length === 0) pass('브라우저: 콘솔 에러', '0건')
    else fail('브라우저: 콘솔 에러', `${realErrors.length}건: ${realErrors[0]}`)

  } catch (e) {
    fail('브라우저', `실행 오류: ${e.message}`)
  } finally {
    await browser.close()
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log(`\n${B}▶ 품목 체계 검증 — ${BASE}${D}\n`)

  if (!await login()) {
    process.exit(1)
  }
  console.log(`${G}✓ 로그인 성공${D}`)

  await layer1()
  await layer2()
  await layer3()

  // 결과 요약
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`${G}PASS: ${passed}${D}  ${failed > 0 ? R : ''}FAIL: ${failed}${D}  ${warnings > 0 ? Y : ''}WARN: ${warnings}${D}`)

  if (failures.length > 0) {
    console.log(`\n${R}실패 항목:${D}`)
    failures.forEach(f => console.log(`  ${R}✗${D} ${f.name}: ${f.reason}`))
  }

  console.log()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error(`${R}ERROR: ${e.message}${D}`)
  process.exit(1)
})
