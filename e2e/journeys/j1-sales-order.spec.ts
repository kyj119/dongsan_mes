import { test, expect, expectClean, expectNoGarbage, db, MARK } from './fixtures'

/**
 * J1 영업 — 거래처 검색 → 주문서 작성(품목·규격·수량) → 저장 → 목록·상세 → 주문서(인보이스) → 검산
 *
 * 「내일 쓸 사람」 = 영업 담당. 화면은 /order-form → /orders.
 * 판정: 신호 1~4 = 0 · 금액이 화면↔DB 일치 · 카드가 자동 생성됐다.
 */
test.describe.serial('J1 영업: 주문서 작성', () => {
  let orderId = 0
  let orderNumber = ''
  let clientId = 0
  let uiAmount = 0
  let uiTotal = 0

  test('거래처 검색 → 품목 → 규격·수량 → 저장', async ({ journey: page, signals }) => {
    await page.goto('/order-form')
    await expectNoGarbage(page, '주문서 초기')

    // 거래처: 「대전」으로 검색 → 모달 첫 행 선택
    await page.locator('#clientSearch').fill('대전')
    await page.locator('#clientSearch').press('Enter')
    // 결과가 1건이면 바로 선택되고, 여럿이면 공용 모달(shell.js #clientSearchModal)이 뜬다
    await expect
      .poll(
        () => page.evaluate(() => (document.getElementById('clientId') as HTMLInputElement)?.value || (document.getElementById('clientSearchModal') ? 'MODAL' : '')),
        { message: '거래처 검색 결과(자동 선택 또는 모달)가 와야 한다', timeout: 15_000 },
      )
      .not.toBe('')
    const clientModal = page.locator('#clientSearchModal')
    if (await clientModal.isVisible().catch(() => false)) {
      const clientRows = page.locator('#clientSearchModalBody [data-id], #clientSearchModalBody [onclick]')
      await expect(clientRows.first(), '거래처 검색 모달에 결과가 있어야 한다').toBeVisible({ timeout: 10_000 })
      await clientRows.first().click()
    }
    clientId = Number(await page.locator('#clientId').inputValue())
    expect(clientId, '거래처 id 가 채워져야 한다').toBeGreaterThan(0)

    // 품목: 「현수막」 검색 → 결과가 여럿이면 모달에서 첫 행
    const search = page.locator('[name="item_search_1"]')
    await search.fill('현수막')
    await search.press('Enter')
    await expect
      .poll(
        () => page.evaluate(() => (document.querySelector('[name="item_id_1"]') as HTMLInputElement)?.value || (document.getElementById('itemSearchModal') ? 'MODAL' : '')),
        { message: '품목 검색 결과(자동 선택 또는 모달)가 와야 한다', timeout: 15_000 },
      )
      .not.toBe('')
    const itemModal = page.locator('#itemSearchModal')
    if (await itemModal.isVisible().catch(() => false)) {
      const pick = page.locator('#itemSearchModalBody [data-id]').first()
      await expect(pick, '품목 검색 모달에 결과가 있어야 한다').toBeVisible({ timeout: 10_000 })
      await pick.click()
    }
    await expect(page.locator('[name="item_id_1"]'), '품목 id 가 채워져야 한다').not.toHaveValue('', { timeout: 10_000 })

    // 규격·수량 — 영업이 단가를 매긴다(품목 기본가가 0 이면 직접 입력)
    await page.locator('[name="width_1"]').fill('300')
    await page.locator('[name="height_1"]').fill('90')
    await page.locator('[name="quantity_1"]').fill('2')
    const priceEl = page.locator('[name="unit_price_1"]')
    const price = Number((await priceEl.inputValue()).replace(/[^\d]/g, ''))
    if (!price) { await priceEl.fill('10000') }
    await page.locator('[name="quantity_1"]').press('Tab')
    await page.waitForTimeout(500)

    const amountText = await page.locator('[name="amount_1"]').inputValue()
    uiAmount = Number(amountText.replace(/[^\d]/g, ''))
    expect(uiAmount, `라인 금액이 계산돼야 한다 (화면: ${amountText})`).toBeGreaterThan(0)
    uiTotal = Number(((await page.locator('#grandTotal').textContent()) || '').replace(/[^\d]/g, ''))
    expect(uiTotal, '합계(VAT 포함)가 계산돼야 한다').toBeGreaterThan(uiAmount)

    await page.locator('#notes').fill(`${MARK} J1 영업 여정`)
    await page.locator('#submitBtn').click()
    await page.waitForURL(/\/orders/, { timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 })

    // orders 금액 축: total_amount=공급가 · vat_amount · discount_amount · final_amount=VAT 포함 청구액
    const rows = db<{ id: number; order_number: string; status: string; total_amount: number; final_amount: number }>(
      `SELECT id, order_number, status, total_amount, final_amount FROM orders WHERE notes LIKE '%${MARK} J1%' ORDER BY id DESC LIMIT 1`,
    )
    expect(rows.length, '주문이 DB 에 생겨야 한다').toBe(1)
    orderId = rows[0].id
    orderNumber = rows[0].order_number
    expect(rows[0].status).toBe('CONFIRMED')
    expect(Number(rows[0].total_amount), '화면 라인 합 = DB total_amount(공급가)').toBe(uiAmount)
    expect(Number(rows[0].final_amount), '화면 합계(VAT 포함) = DB final_amount').toBe(uiTotal)

    await expectNoGarbage(page, '저장 후 목록')
    expectClean(signals, '주문서 작성')
  })

  test('목록에서 찾고 상세를 연다', async ({ journey: page, signals }) => {
    test.skip(!orderId, '앞 단계 실패')
    await page.goto('/orders')
    await page.locator('#searchQuery').fill(orderNumber)
    await page.locator('#searchQuery').press('Enter')
    const row = page.locator(`[onclick*="viewOrder(${orderId})"]`).first()
    await expect(row, '목록에 방금 만든 주문이 보여야 한다').toBeVisible({ timeout: 15_000 })
    await row.click()
    await expect(page.getByText(orderNumber).first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(800)
    await expectNoGarbage(page, '주문 상세')
    expectClean(signals, '목록·상세')
  })

  test('주문서(인보이스) 데이터가 나온다', async ({ api }) => {
    test.skip(!orderId, '앞 단계 실패')
    const r = await api.get(`/api/orders/${orderId}/invoice`)
    expect(r.status, `인보이스 응답 ${JSON.stringify(r.data).slice(0, 200)}`).toBe(200)
    expect(r.data?.success).toBeTruthy()
  })

  test('검산: 라인 금액·카드 자동 생성', async () => {
    test.skip(!orderId, '앞 단계 실패')
    const items = db<{ amount: number; quantity: number; unit_price: number; pricing_method: string }>(
      `SELECT amount, quantity, unit_price, pricing_method FROM order_items WHERE order_id=${orderId}`,
    )
    expect(items.length).toBe(1)
    expect(Number(items[0].amount), '화면 라인 금액 = DB order_items.amount').toBe(uiAmount)
    const cards = db<{ n: number; status: string }>(`SELECT COUNT(*) n, MIN(status) status FROM cards WHERE order_id=${orderId}`)
    expect(cards[0].n, '주문 저장 시 카드가 자동 생성돼야 한다').toBeGreaterThanOrEqual(1)
  })
})
