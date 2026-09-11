import { test, expect, expectClean, expectNoGarbage, db, MARK } from './fixtures'

/**
 * J1b 영업 — 주문서의 **예외 경로**: 거부·경고가 사람에게 보이는가
 *   ① 거래처 없이 저장 → 화면이 막고 주문이 생기지 않는다
 *   ② 여신한도 초과 거래처 → 주문서 배너 「여신한도 초과」 · ADMIN 은 경고만(credit_warning) · MANAGER 는 결재 대기(BLOCKED)
 *   ③ 에누리 → 합계 = 공급가 + VAT − 에누리, DB discount_amount/final_amount 일치
 *
 * 여신 정본 = routes/ledger/credit-helpers.evaluateClientCredit (clients.credit_limit >0 = 명시 한도, balance = billed − payments − adjustments).
 * 이 여정은 로컬 D1 에서 거래처 하나의 credit_limit 을 잠깐 바꾸고 끝에 되돌린다.
 */
test.describe.serial('J1b 영업: 주문서 예외 경로', () => {
  let clientId = 0
  let clientName = ''
  let origLimit: number | null = null
  let itemId = 0
  let itemName = ''
  let itemPrice = 0

  test.beforeAll(() => {
    // J3 가 잔액을 검산하는 첫 「대전」 거래처는 피한다(두 번째 거래처)
    const c = db<{ id: number; client_name: string; credit_limit: number | null }>(
      `SELECT id, client_name, credit_limit FROM clients WHERE is_active=1 AND client_name LIKE '%대전%' ORDER BY id LIMIT 1 OFFSET 1`,
    )[0]
    clientId = c.id
    clientName = c.client_name
    origLimit = c.credit_limit
    const it = db<{ id: number; item_name: string; base_price: number }>(
      `SELECT id, item_name, base_price FROM items WHERE is_active=1 AND item_name LIKE '%게릴라%현수막%' AND base_price>0 ORDER BY id LIMIT 1`,
    )[0]
    itemId = it.id; itemName = it.item_name; itemPrice = Number(it.base_price)
  })
  test.afterAll(() => {
    if (clientId) db(`UPDATE clients SET credit_limit=${origLimit == null ? 'NULL' : origLimit} WHERE id=${clientId}`)
  })

  test('① 거래처 없이 저장하면 화면이 막고 주문은 생기지 않는다', async ({ journey: page, signals }) => {
    const before = Number(db<{ m: number }>(`SELECT IFNULL(MAX(id),0) m FROM orders`)[0].m)
    await page.goto('/order-form')
    // 규격·수량은 채운다 — 비우면 브라우저 기본 검증(required 말풍선)이 먼저 막아 앱 문구가 안 나온다(실측). 여기서 보려는 건 앱의 거부 문구다.
    await page.locator('[name="item_search_1"]').fill('게릴라 현수막')
    await page.locator('[name="width_1"]').fill('300')
    await page.locator('[name="height_1"]').fill('90')
    await page.locator('[name="quantity_1"]').fill('1')
    // P10(실측): 배송방법 기본값(대신택배)이면 「선불/착불」 select 가 required 인데 기본이 빈값이라 브라우저 말풍선이
    //   거래처 검사보다 먼저 막는다(제출 이벤트 자체가 안 뜬다). 사람처럼 선불을 고르고 나서 저장을 누른다.
    const sp = page.locator('#shippingPayment')
    if ((await sp.count()) && !(await sp.inputValue())) await sp.selectOption({ index: 1 })
    await page.locator('#submitBtn').click()
    await expect(page.locator('#toast-container'), '거부 사유가 화면에 보여야 한다').toContainText('거래처를 선택하세요', { timeout: 5_000 })
    await page.waitForTimeout(800)
    expect(Number(db<{ m: number }>(`SELECT IFNULL(MAX(id),0) m FROM orders`)[0].m), '주문이 생기면 안 된다').toBe(before)
    expect(page.url(), '주문서에 머물러야 한다').toContain('/order-form')
    expectClean(signals, '필수 누락')
  })

  test('② 여신한도 초과 — 배너·ADMIN 경고·비관리자(DESIGNER) 결재 대기', async ({ journey: page, api, playwright, signals }) => {
    // 준비: 한도 1,000원 + 미수 1건(회계반영, 미입금) → balance > limit
    db(`UPDATE clients SET credit_limit=1000 WHERE id=${clientId}`)
    const seed = await api.post('/api/orders', {
      client_id: clientId,
      delivery_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10),
      notes: `${MARK} J1b 여신 미수`,
      items: [{ item_id: itemId, item_name: itemName, width: 300, height: 90, quantity: 5, unit_price: itemPrice }],
    })
    expect(seed.status, `미수 주문 생성 ${JSON.stringify(seed.data).slice(0, 120)}`).toBe(200)
    const seedId = seed.data.data.id
    const card = db<{ id: number }>(`SELECT id FROM cards WHERE order_id=${seedId} LIMIT 1`)[0]
    await api.patch('/api/cards/bulk/status', { card_ids: [card.id], status: 'PRINT_DONE' })
    await api.patch(`/api/cards/${card.id}/ship`, {})
    const billed = await api.patch(`/api/orders/${seedId}/billing-status`, { billing_status: 'BILLED' })
    expect(billed.status, `회계반영 ${JSON.stringify(billed.data).slice(0, 120)}`).toBe(200)
    const check = await api.get(`/api/clients/${clientId}/credit-check`)
    expect(check.status).toBe(200)

    // 화면: 거래처를 고르면 배너가 떠야 한다
    await page.goto('/order-form')
    await page.locator('#clientSearch').fill(clientName)
    await page.locator('#clientSearch').press('Enter')
    await expect
      .poll(() => page.evaluate(() => (document.getElementById('clientId') as HTMLInputElement)?.value || (document.getElementById('clientSearchModal') ? 'MODAL' : '')), { timeout: 15_000 })
      .not.toBe('')
    if (await page.locator('#clientSearchModal').isVisible().catch(() => false)) {
      await page.locator(`#clientSearchModalBody [data-id="${clientId}"], #clientSearchModalBody [data-id]`).first().click()
    }
    await expect(page.locator('#creditBanner'), '여신 배너').toContainText(/여신한도 초과|여신 주의/, { timeout: 15_000 })
    await expectNoGarbage(page, '여신 배너')

    // ADMIN: 경고만 싣고 주문은 생긴다(2026-08-25 확정)
    const adminOrder = await api.post('/api/orders', {
      client_id: clientId,
      delivery_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10),
      notes: `${MARK} J1b ADMIN 경고`,
      items: [{ item_id: itemId, item_name: itemName, width: 300, height: 90, quantity: 1, unit_price: itemPrice }],
    })
    expect(adminOrder.status).toBe(200)
    expect(String(adminOrder.data?.data?.credit_warning || adminOrder.data?.credit_warning || ''), 'ADMIN 응답에 credit_warning').not.toBe('')

    // 비관리자: 차단 → 결재 대기(approval_requests) — 4xx 가 아니라 주문+결재 요청이 생긴다
    //   /orders 에 접근권이 있는 비관리자 역할은 prod 기준 DESIGNER·SALES 뿐(role_page_permissions). MANAGER 는 /orders 행이 없어
    //   requireAnyPagePermission 에서 403 — 실제 주문을 넣는 직원은 디자이너 계정이다.
    const staff = db<{ username: string }>(`SELECT username FROM users WHERE is_active=1 AND role='DESIGNER' AND COALESCE(default_entity_id,1)=1 ORDER BY id LIMIT 1`)[0]
    expect(staff, 'DESIGNER 계정').toBeTruthy()
    const req = await playwright.request.newContext({ baseURL: process.env.JOURNEY_BASE_URL || 'http://localhost:3000' })
    const lr = await req.post('/api/auth/login', { data: { username: staff.username, password: 'password' } })
    const lj = await lr.json()
    expect(lj.success, `${staff.username} 로그인`).toBeTruthy()
    const mr = await req.post('/api/orders', {
      headers: { Authorization: `Bearer ${lj.data.token}` },
      data: {
        client_id: clientId,
        delivery_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10),
        notes: `${MARK} J1b MANAGER 차단`,
        items: [{ item_id: itemId, item_name: itemName, width: 300, height: 90, quantity: 1, unit_price: itemPrice }],
      },
    })
    const mj = await mr.json().catch(() => ({}))
    await req.dispose()
    const mid = mj?.data?.id
    expect(mid, `MANAGER 주문 응답 ${JSON.stringify(mj).slice(0, 160)}`).toBeTruthy()
    const blocked = db<{ credit_status: string | null; apr: number }>(
      `SELECT o.credit_status, (SELECT COUNT(*) FROM approval_requests a WHERE UPPER(a.reference_type) LIKE '%ORDER%' AND a.reference_id=o.id) apr FROM orders o WHERE o.id=${mid}`,
    )[0]
    expect(String(blocked.credit_status || ''), 'MANAGER 주문은 여신 차단 상태').toMatch(/BLOCK|HOLD|PENDING/)
    expect(blocked.apr, '결재 요청이 생겨야 한다').toBeGreaterThan(0)
    expectClean(signals, '여신 초과')
  })

  test('③ 에누리 — 합계와 DB 가 같은 식으로 줄어든다', async ({ journey: page, signals }) => {
    db(`UPDATE clients SET credit_limit=${origLimit == null ? 'NULL' : origLimit} WHERE id=${clientId}`)
    await page.goto('/order-form')
    await page.locator('#clientSearch').fill('대전')
    await page.locator('#clientSearch').press('Enter')
    await expect
      .poll(() => page.evaluate(() => (document.getElementById('clientId') as HTMLInputElement)?.value || (document.getElementById('clientSearchModal') ? 'MODAL' : '')), { timeout: 15_000 })
      .not.toBe('')
    if (await page.locator('#clientSearchModal').isVisible().catch(() => false)) {
      await page.locator('#clientSearchModalBody [data-id], #clientSearchModalBody [onclick]').first().click()
    }
    const search = page.locator('[name="item_search_1"]')
    await search.fill('현수막')
    await search.press('Enter')
    await expect
      .poll(() => page.evaluate(() => (document.querySelector('[name="item_id_1"]') as HTMLInputElement)?.value || (document.getElementById('itemSearchModal') ? 'MODAL' : '')), { timeout: 15_000 })
      .not.toBe('')
    if (await page.locator('#itemSearchModal').isVisible().catch(() => false)) {
      await page.locator('#itemSearchModalBody [data-id]').first().dispatchEvent('click')
    }
    await expect(page.locator('[name="item_id_1"]')).not.toHaveValue('', { timeout: 10_000 })
    await page.locator('[name="width_1"]').fill('300')
    await page.locator('[name="height_1"]').fill('90')
    await page.locator('[name="quantity_1"]').fill('4')
    await page.locator('[name="quantity_1"]').press('Tab')
    await page.waitForTimeout(400)
    const amount = Number((await page.locator('[name="amount_1"]').inputValue()).replace(/[^\d]/g, ''))
    expect(amount).toBeGreaterThan(1000)
    const DISCOUNT = 1000
    await page.locator('#discountAmount').fill(String(DISCOUNT))
    await page.locator('#discountAmount').press('Tab')
    await page.waitForTimeout(400)
    const total = Number(((await page.locator('#grandTotal').textContent()) || '').replace(/[^\d]/g, ''))
    expect(total, '합계 = 공급가 + VAT − 에누리').toBe(amount + Math.round(amount * 0.1) - DISCOUNT)
    await page.locator('#notes').fill(`${MARK} J1b 에누리`)
    await page.locator('#submitBtn').click()
    await page.waitForURL(/\/orders/, { timeout: 30_000 })
    const o = db<{ discount_amount: number; final_amount: number; total_amount: number }>(`SELECT discount_amount, final_amount, total_amount FROM orders WHERE notes LIKE '%${MARK} J1b 에누리%' ORDER BY id DESC LIMIT 1`)[0]
    expect(o, '주문 생성').toBeTruthy()
    expect(Number(o.discount_amount)).toBe(DISCOUNT)
    expect(Number(o.final_amount), 'DB final_amount = 화면 합계').toBe(total)
    expect(Number(o.total_amount), '공급가는 에누리 전').toBe(amount)
    expectClean(signals, '에누리')
  })
})
