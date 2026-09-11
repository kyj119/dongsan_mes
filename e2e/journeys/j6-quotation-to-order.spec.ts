import { test, expect, expectClean, expectNoGarbage, db, MARK } from './fixtures'

/**
 * J6 영업 — 견적서 작성 → 목록에서 상세 → 「주문 전환」 → (프리필된) 주문서 저장 → 검산
 *
 * 「내일 쓸 사람」 = 영업(견적을 먼저 내고 확정되면 주문으로). 화면은 /quotation-form → /quotations → /order-form?quotation_id=.
 * 규칙 정본: 견적 1:N 주문(immutable snapshot, orders.quotation_id) — 전환해도 견적 라인은 안 바뀐다.
 * 판정: 신호 1~4 = 0 · 주문에 quotation_id 가 박힌다 · 견적 first_converted_at 이 찍힌다 · 라인 금액이 견적과 같다.
 */
test.describe.serial('J6 영업: 견적 → 주문 전환', () => {
  let quotationId = 0
  let quotationNumber = ''
  let quotAmount = 0
  let orderId = 0

  async function pickClientAndItem(page: import('@playwright/test').Page) {
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
      // 견적서의 품목 모달은 표(tr) 로 그린다 — 주문서의 [data-id] 카드형과 다르다. 둘 다 받는다.
      const row = page.locator('#itemSearchModalBody [data-id], #itemSearchModal tbody tr[onclick], #itemSearchModal tbody tr').first()
      await expect(row, '품목 검색 모달의 첫 결과').toBeAttached({ timeout: 10_000 })
      // 견적서 검색은 결과가 50행이라 첫 행이 고정 헤더 아래 깔린다 — 좌표 클릭은 헤더를 맞힌다(force 도 같다).
      // 사람은 살짝 스크롤해 누른다; 여기서는 행에 click 이벤트를 직접 보낸다(리스너는 실측으로 확인, probe3).
      await row.dispatchEvent('click')
    }
    await expect(page.locator('[name="item_id_1"]')).not.toHaveValue('', { timeout: 10_000 })
  }

  test('견적서 작성·저장', async ({ journey: page, signals }) => {
    await page.goto('/quotation-form')
    await expectNoGarbage(page, '견적서 초기')
    await pickClientAndItem(page)
    await page.locator('[name="width_1"]').fill('300')
    await page.locator('[name="height_1"]').fill('90')
    await page.locator('[name="quantity_1"]').fill('2')
    const priceEl = page.locator('[name="unit_price_1"]')
    if (!Number((await priceEl.inputValue()).replace(/[^\d]/g, ''))) await priceEl.fill('10000')
    await page.locator('[name="quantity_1"]').press('Tab')
    await page.waitForTimeout(400)
    quotAmount = Number((await page.locator('[name="amount_1"]').inputValue()).replace(/[^\d]/g, ''))
    expect(quotAmount).toBeGreaterThan(0)
    await page.locator('#notes').fill(`${MARK} J6 견적`)
    await page.locator('#submitBtn').click()
    await page.waitForURL(/\/quotations/, { timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded')

    const q = db<{ id: number; quotation_number: string }>(`SELECT id, quotation_number FROM quotations WHERE notes LIKE '%${MARK} J6%' ORDER BY id DESC LIMIT 1`)[0]
    expect(q, '견적이 DB 에 생겨야 한다').toBeTruthy()
    quotationId = q.id
    quotationNumber = q.quotation_number
    await expectNoGarbage(page, '견적 목록')
    expectClean(signals, '견적 작성')
  })

  test('목록 → 상세 → 주문 전환 → 프리필 주문서 저장', async ({ journey: page, signals }) => {
    test.skip(!quotationId, '앞 단계 실패')
    await page.goto('/quotations')
    await page.waitForLoadState('domcontentloaded')
    const view = page.locator(`[onclick*="viewQuotation(${quotationId})"]`).first()
    await expect(view, '목록에 방금 만든 견적의 상세 버튼').toBeVisible({ timeout: 15_000 })
    await view.click()
    await expect(page.locator('#quotDetailModal')).toBeVisible({ timeout: 10_000 })
    await expectNoGarbage(page, '견적 상세')
    const convert = page.locator(`#quotDetailModal [onclick*="convertToOrder(${quotationId})"]`).first()
    await expect(convert, '상세 모달의 「주문 전환」 버튼').toBeVisible({ timeout: 10_000 })
    await convert.click()
    await page.waitForURL(/\/order-form\?quotation_id=/, { timeout: 15_000 })
    await page.waitForLoadState('domcontentloaded')

    // 프리필 확인 — 거래처·품목·금액이 견적에서 넘어와야 한다
    await expect(page.locator('#clientId'), '거래처 프리필').not.toHaveValue('', { timeout: 15_000 })
    await expect(page.locator('[name="item_id_1"]'), '품목 프리필').not.toHaveValue('', { timeout: 15_000 })
    await expect
      .poll(() => page.locator('[name="amount_1"]').inputValue().then((v) => Number(v.replace(/[^\d]/g, ''))), { timeout: 10_000, message: '라인 금액 프리필' })
      .toBe(quotAmount)
    await expectNoGarbage(page, '프리필 주문서')

    await page.locator('#notes').fill(`${MARK} J6 전환 주문`)
    await page.locator('#submitBtn').click()
    await page.waitForURL(/\/orders/, { timeout: 30_000 })
    await page.waitForLoadState('domcontentloaded')
    const o = db<{ id: number; quotation_id: number | null; total_amount: number }>(`SELECT id, quotation_id, total_amount FROM orders WHERE notes LIKE '%${MARK} J6 전환%' ORDER BY id DESC LIMIT 1`)[0]
    expect(o, '전환 주문이 생겨야 한다').toBeTruthy()
    orderId = o.id
    expect(Number(o.quotation_id), '주문에 견적 id 가 박혀야 한다').toBe(quotationId)
    expect(Number(o.total_amount), '주문 공급가 = 견적 라인 금액').toBe(quotAmount)
    expectClean(signals, '주문 전환')
  })

  test('검산: 견적 스냅샷 불변·전환 시각', async () => {
    test.skip(!orderId, '앞 단계 실패')
    const q = db<{ first_converted_at: string | null; n: number; amt: number }>(
      `SELECT q.first_converted_at, (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id=q.id) n, (SELECT SUM(amount) FROM quotation_items qi WHERE qi.quotation_id=q.id) amt FROM quotations q WHERE q.id=${quotationId}`,
    )[0]
    expect(q.first_converted_at, '견적에 first_converted_at 이 찍혀야 한다').not.toBeNull()
    expect(q.n, '견적 라인은 그대로').toBe(1)
    expect(Number(q.amt), '견적 라인 금액 불변').toBe(quotAmount)
    const linked = db<{ n: number }>(`SELECT COUNT(*) n FROM orders WHERE quotation_id=${quotationId}`)[0].n
    expect(linked, '견적 1:N 주문 — 이 견적에서 난 주문 1건').toBe(1)
  })
})
