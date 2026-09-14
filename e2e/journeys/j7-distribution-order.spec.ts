import { test, expect, expectClean, expectNoGarbage, db, MARK } from './fixtures'

/**
 * J7 영업(자재 유통) — 자재만 넣은 주문 → 성격이 라인에서 유통으로 파생 → 카드 없이 출고 준비 → 주문 목록에서 일괄 출고 → 재고 차감
 *
 * P11(2026-09-14): 유통 주문서 화면은 폐지(prod 0건 사용). order_type 은 helpers.deriveOrderType 이 라인에서 정한다.
 * 판정: `?type=dist` 는 주문서로 리다이렉트 · 자재만이면 DISTRIBUTION·카드 0·shipment_ready=1 · 일괄 출고 → SHIPPED·OUT 원장·재고 −수량.
 */
test.describe.serial('J7 유통: 자재만 주문 → 라인 파생 → 카드 없이 출고', () => {
  const QTY = 2
  let orderId = 0
  let orderNumber = ''
  let stockItemId = 0
  let stockBefore = 0
  const stockNow = () => Number(db<{ q: number }>(`SELECT IFNULL(SUM(quantity),0) q FROM inventory WHERE item_id=${stockItemId} AND entity_id=1`)[0].q)

  test('유통 주문서 링크는 주문서로 간다(폐지)', async ({ journey: page, signals }) => {
    await page.goto('/order-form?type=dist')
    await page.waitForLoadState('domcontentloaded')
    expect(page.url(), '?type=dist 는 주문서로 리다이렉트').toMatch(/\/order-form$/)
    await expect(page.locator('a[href="/order-form?type=dist"]'), '전환 링크가 사라져야 한다').toHaveCount(0)
    await page.goto('/orders')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('#newOrderLink')).toHaveAttribute('href', '/order-form')
    expectClean(signals, '유통 주문서 폐지')
  })

  test('자재만 넣은 주문서 저장 → DISTRIBUTION·카드 0·출고 준비', async ({ journey: page, signals }) => {
    const stock = db<{ id: number; item_name: string; base_price: number }>(
      `SELECT i.id, i.item_name, i.base_price FROM items i JOIN inventory inv ON inv.item_id=i.id AND inv.entity_id=1
       WHERE i.is_active=1 AND IFNULL(i.production_required,1)=0 AND i.is_sales_item=1 AND i.item_type='MATERIAL' AND inv.quantity>5 ORDER BY inv.quantity DESC LIMIT 1`,
    )[0]
    expect(stock, '재고가 있는 판매 자재').toBeTruthy()
    stockItemId = stock.id
    stockBefore = stockNow()

    await page.goto('/order-form')
    await page.locator('#clientSearch').fill('대전')
    await page.locator('#clientSearch').press('Enter')
    await expect
      .poll(() => page.evaluate(() => (document.getElementById('clientId') as HTMLInputElement)?.value || (document.getElementById('clientSearchModal') ? 'MODAL' : '')), { timeout: 15_000 })
      .not.toBe('')
    if (await page.locator('#clientSearchModal').isVisible().catch(() => false)) {
      await page.locator('#clientSearchModalBody [data-id], #clientSearchModalBody [onclick]').first().click()
    }
    // 자재 검색 — 토글은 기본 ON(P8). 정확한 이름으로 넣어 1건 자동 선택 또는 모달 첫 행
    await expect(page.locator('#includeMaterials')).toBeChecked()
    const s = page.locator('[name="item_search_1"]')
    await s.fill(stock.item_name)
    await s.press('Enter')
    await expect
      .poll(() => page.evaluate(() => (document.querySelector('[name="item_id_1"]') as HTMLInputElement)?.value || (document.getElementById('itemSearchModal') ? 'MODAL' : '')), { timeout: 15_000 })
      .not.toBe('')
    if (await page.locator('#itemSearchModal').isVisible().catch(() => false)) {
      const row = page.locator(`#itemSearchModalBody [data-id="${stock.id}"]`).first()
      await expect(row, '검색 모달에 그 자재 행').toBeAttached({ timeout: 10_000 })
      // P11-③: 자재 행에는 재고 잔량이 보여야 한다
      await expect(row.locator('td').nth(6), '자재 행의 재고 칸').not.toHaveText('')
      await row.dispatchEvent('click')
    }
    await expect(page.locator('[name="item_id_1"]')).toHaveValue(String(stock.id), { timeout: 10_000 })
    await page.locator('[name="quantity_1"]').fill(String(QTY))
    const priceEl = page.locator('[name="unit_price_1"]')
    if (!Number((await priceEl.inputValue()).replace(/[^\d]/g, ''))) await priceEl.fill('1000')
    await page.locator('[name="quantity_1"]').press('Tab')
    // 선불/착불은 배송방법·라인 성격에 따라 숨겨진다 — 보일 때만 고른다(숨긴 select 에 selectOption 하면 영원히 기다린다)
    const sp = page.locator('#shippingPayment')
    if ((await sp.isVisible().catch(() => false)) && (await sp.isEnabled().catch(() => false)) && !(await sp.inputValue())) await sp.selectOption({ index: 1 })
    await page.locator('#notes').fill(`${MARK} J7 유통 주문`)
    await page.locator('#submitBtn').click()
    await page.waitForURL(/\/orders/, { timeout: 30_000 })

    const o = db<{ id: number; order_number: string; order_type: string; cards: number; ready: number; lines: number }>(
      `SELECT o.id, o.order_number, o.order_type,
              (SELECT COUNT(*) FROM cards c WHERE c.order_id=o.id) cards,
              (SELECT SUM(CASE WHEN shipment_ready=1 THEN 1 ELSE 0 END) FROM order_items oi WHERE oi.order_id=o.id) ready,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) lines
       FROM orders o WHERE o.notes LIKE '%${MARK} J7%' ORDER BY o.id DESC LIMIT 1`,
    )[0]
    expect(o, '주문 생성').toBeTruthy()
    orderId = o.id
    orderNumber = o.order_number
    expect(o.order_type, '자재만이면 라인 파생 = DISTRIBUTION').toBe('DISTRIBUTION')
    expect(o.cards, '유통 주문은 카드가 없다').toBe(0)
    expect(o.ready, '전 라인 shipment_ready').toBe(o.lines)
    await expectNoGarbage(page, '저장 후 목록')
    expectClean(signals, '유통 주문 저장')
  })

  test('주문 목록에서 일괄 출고 → SHIPPED·재고 차감·OUT 원장', async ({ journey: page, signals }) => {
    test.skip(!orderId, '앞 단계 실패')
    await page.goto('/orders')
    await page.locator('#searchQuery').fill(orderNumber)
    await page.locator('#searchQuery').press('Enter')
    const cb = page.locator(`input.order-checkbox[data-order-id="${orderId}"]`)
    await expect(cb).toBeVisible({ timeout: 15_000 })
    await cb.check()
    await page.locator('[onclick="bulkShipSelected()"]').first().click()
    const ok = page.locator('#__confirmOk')
    if (await ok.isVisible({ timeout: 3_000 }).catch(() => false)) await ok.click()
    await expect
      .poll(() => db<{ s: string }>(`SELECT status s FROM orders WHERE id=${orderId}`)[0].s, { timeout: 20_000, message: '카드 없는 유통 주문도 일괄 출고로 SHIPPED' })
      .toBe('SHIPPED')
    const out = db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_transactions WHERE reference_type='ORDER' AND reference_id=${orderId} AND item_id=${stockItemId} AND transaction_type='OUT'`)[0].n
    expect(out, '출고 = OUT 원장 1행').toBe(1)
    expect(stockNow(), '출고 = 재고 −수량').toBe(stockBefore - QTY)
    await page.waitForTimeout(600)
    await expectNoGarbage(page, '출고 후 목록')
    expectClean(signals, '일괄 출고')
  })
})
