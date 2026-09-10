import { test, expect, expectClean, expectNoGarbage, db, MARK } from './fixtures'

/**
 * J4 구매 — 발주 작성(공급업체·자재·수량) → 확정 → 입고(실측 수량) → 검수 대기 → 승인 → 재고·원장 검산
 *
 * 「내일 쓸 사람」 = 발주 담당(동산 용준님·선명 강지영 님). 화면은 /purchase-order-form → /receiving → /purchase-orders.
 * 규칙 정본 = docs/PURCHASE_RECEIVING_RULES.md: 발주=의도, 입고 실측=사실, 검수=차이 승인(undo 가능).
 * 판정: 신호 1~4 = 0 · 발주 CONFIRMED → 입고 후 RECEIVED/PARTIAL · 수량 차이가 검수 대기에 오른다 · 승인 후 reviewed_at
 *       · 재고가 **실측 수량만큼** 늘고 IN 원장이 남는다.
 */
test.describe.serial('J4 구매: 발주 → 입고 → 검수', () => {
  const ORDER_QTY = 10
  const RECV_QTY = 9 // 일부러 1 부족 → 검수 대기에 올라야 한다
  let supplierName = ''
  let material = { id: 0, item_name: '', unit: '' }
  let poId = 0
  let poNumber = ''
  let poItemId = 0
  let stockBefore = 0
  let inTxBefore = 0

  test.beforeAll(() => {
    const sup = db<{ client_name: string }>(
      `SELECT client_name FROM clients WHERE is_active=1 AND (client_name LIKE '%지업%' OR client_name LIKE '%원단%' OR client_name LIKE '%잉크%' OR client_name LIKE '%상사%') ORDER BY id LIMIT 1`,
    )[0] || db<{ client_name: string }>(`SELECT client_name FROM clients WHERE is_active=1 ORDER BY id LIMIT 1`)[0]
    supplierName = sup.client_name
    const m = db<{ id: number; item_name: string; unit: string }>(
      `SELECT id, item_name, unit FROM items WHERE is_active=1 AND item_type='MATERIAL' AND unit IN ('EA','개','통','장','권') ORDER BY id LIMIT 1`,
    )[0] || db<{ id: number; item_name: string; unit: string }>(`SELECT id, item_name, unit FROM items WHERE is_active=1 AND item_type='MATERIAL' ORDER BY id LIMIT 1`)[0]
    material = m
    stockBefore = Number(db<{ q: number }>(`SELECT IFNULL(SUM(quantity),0) q FROM inventory WHERE item_id=${material.id}`)[0].q)
    inTxBefore = Number(db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_transactions WHERE item_id=${material.id} AND transaction_type='IN'`)[0].n)
  })

  test('발주 작성 → 확정', async ({ journey: page, signals }) => {
    await page.goto('/purchase-order-form')
    await expectNoGarbage(page, '발주서 초기')

    await page.locator('#supplierSearch').fill(supplierName)
    const supRow = page.locator('#supplierDropdown .po-dropdown-item[onmousedown*="selectSupplier"]').first()
    await expect(supRow, `공급업체 「${supplierName}」 검색 결과`).toBeVisible({ timeout: 10_000 })
    await supRow.click()
    await expect(page.locator('#supplierId')).not.toHaveValue('')

    // 품목 검색: 1건이면 자동 선택, 여럿이면 공용 모달(#itemSearchModal) — 주문서와 같은 규약
    await page.locator('#item_name_1').fill(material.item_name)
    await expect
      .poll(
        () => page.evaluate(() => (document.getElementById('item_id_1') as HTMLInputElement)?.value || (document.getElementById('itemSearchModal') ? 'MODAL' : '')),
        { message: `자재 「${material.item_name}」 검색 결과(자동 선택 또는 모달)`, timeout: 15_000 },
      )
      .not.toBe('')
    if (await page.locator('#itemSearchModal').isVisible().catch(() => false)) {
      const pick = page.locator('#itemSearchModalBody [data-id]').first()
      await expect(pick, '품목 모달에 결과가 있어야 한다').toBeVisible({ timeout: 10_000 })
      await pick.click()
    }
    await expect(page.locator('#item_id_1')).not.toHaveValue('', { timeout: 10_000 })
    material.id = Number(await page.locator('#item_id_1').inputValue())
    stockBefore = Number(db<{ q: number }>(`SELECT IFNULL(SUM(quantity),0) q FROM inventory WHERE item_id=${material.id}`)[0].q)
    inTxBefore = Number(db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_transactions WHERE item_id=${material.id} AND transaction_type='IN'`)[0].n)

    await page.locator('#item_qty_1').fill(String(ORDER_QTY))
    const priceEl = page.locator('#item_price_1')
    if (!Number((await priceEl.inputValue()).replace(/[^\d]/g, ''))) await priceEl.fill('1000')
    await page.locator('#item_qty_1').press('Tab')
    await page.locator('#notes').fill(`${MARK} J4 구매 여정`)
    await page.locator('#confirmBtn').click()

    await expect
      .poll(() => db<{ id: number }>(`SELECT id FROM purchase_orders WHERE notes LIKE '%${MARK} J4%' ORDER BY id DESC LIMIT 1`)[0]?.id ?? 0, { timeout: 20_000, message: '발주가 DB 에 생겨야 한다' })
      .toBeGreaterThan(0)
    const po = db<{ id: number; po_number: string; status: string }>(`SELECT id, po_number, status FROM purchase_orders WHERE notes LIKE '%${MARK} J4%' ORDER BY id DESC LIMIT 1`)[0]
    poId = po.id
    poNumber = po.po_number
    expect(po.status, '「발주 확정」은 CONFIRMED').toBe('CONFIRMED')
    const line = db<{ id: number; quantity: number }>(`SELECT id, quantity FROM purchase_order_items WHERE po_id=${poId} ORDER BY id LIMIT 1`)[0]
    expect(line, '발주 라인').toBeTruthy()
    poItemId = line.id
    expect(Number(line.quantity)).toBe(ORDER_QTY)

    await page.waitForTimeout(800)
    await expectNoGarbage(page, '발주 확정 후')
    expectClean(signals, '발주 작성')
  })

  test('입고 — 실측 수량 입력(1 부족)', async ({ journey: page, signals }) => {
    test.skip(!poId, '앞 단계 실패')
    await page.goto('/receiving')
    await page.waitForLoadState('domcontentloaded')
    // 기본이 「내 담당」이라 다른 담당자 발주는 「전체」에서 본다
    await page.locator('#scopeAllBtn').click()
    const openBtn = page.locator(`[onclick*="openReceiveModal(${poId},"], [onclick*="openReceiveModal(${poId})"]`).first()
    await expect(openBtn, '입고대기 목록에 방금 확정한 발주가 있어야 한다').toBeVisible({ timeout: 15_000 })
    await openBtn.click()
    await expect(page.locator('#receiveModal')).toBeVisible({ timeout: 10_000 })
    await expectNoGarbage(page, '입고 모달')

    const recv = page.locator(`#recv_${poItemId}`)
    await expect(recv, '라인별 실측 입력칸').toBeVisible({ timeout: 10_000 })
    await recv.fill(String(RECV_QTY))
    const dateEl = page.locator('#receipt_date')
    if (!(await dateEl.inputValue())) await dateEl.fill(new Date().toISOString().slice(0, 10))
    await page.locator('[onclick="submitReceive()"]').first().click()

    await expect
      .poll(() => db<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=${poId}`)[0]?.status, { timeout: 20_000, message: '입고 후 발주 상태' })
      .toMatch(/RECEIVED/)
    await page.waitForTimeout(800)
    await expectNoGarbage(page, '입고 후')
    expectClean(signals, '입고')
  })

  test('검수 대기 → 승인', async ({ journey: page, signals }) => {
    test.skip(!poId, '앞 단계 실패')
    const before = db<{ reviewed_at: string | null }>(`SELECT reviewed_at FROM purchase_orders WHERE id=${poId}`)[0]
    expect(before.reviewed_at, '승인 전에는 reviewed_at 이 비어 있어야 한다').toBeNull()

    await page.goto('/purchase-orders')
    await page.waitForLoadState('domcontentloaded')
    // 승인 버튼은 「검수 대기」 카드(filterByStatus('REVIEW'))를 눌러 그 목록으로 들어가야 보인다
    const reviewCard = page.locator(`[onclick="filterByStatus('REVIEW')"]`).first()
    await expect(reviewCard, '발주 목록 상단의 검수 대기 카드').toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() => reviewCard.locator('#statReview').textContent().then((t) => Number((t || '').replace(/[^\d]/g, ''))), { timeout: 15_000, message: '검수 대기 건수' })
      .toBeGreaterThan(0)
    await reviewCard.click()
    const approve = page.locator(`[onclick="poApproveReview(${poId})"]`).first()
    await expect(approve, '수량 차이(10→9) 발주가 「검수 대기」로 목록에 떠야 한다').toBeVisible({ timeout: 15_000 })
    await approve.click()
    await expect
      .poll(() => db<{ reviewed_at: string | null }>(`SELECT reviewed_at FROM purchase_orders WHERE id=${poId}`)[0]?.reviewed_at ?? null, { timeout: 15_000, message: '승인 후 reviewed_at' })
      .not.toBeNull()
    await page.waitForTimeout(800)
    await expectNoGarbage(page, '검수 승인 후')
    expectClean(signals, '검수 승인')
  })

  test('검산: 재고·원장은 실측 수량으로', async ({}, testInfo) => {
    test.skip(!poId, '앞 단계 실패')
    const stockAfter = Number(db<{ q: number }>(`SELECT IFNULL(SUM(quantity),0) q FROM inventory WHERE item_id=${material.id}`)[0].q)
    const inTxAfter = Number(db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_transactions WHERE item_id=${material.id} AND transaction_type='IN'`)[0].n)
    const line = db<{ received_quantity: number }>(`SELECT received_quantity FROM purchase_order_items WHERE id=${poItemId}`)[0]
    testInfo.annotations.push({ type: 'stock', description: `${material.item_name}(${material.unit}) 재고 ${stockBefore}→${stockAfter} · IN 원장 ${inTxBefore}→${inTxAfter} · 라인 입고 ${line.received_quantity}` })
    expect(Number(line.received_quantity), '라인 입고 수량 = 실측').toBe(RECV_QTY)
    expect(stockAfter - stockBefore, '재고 증가 = 실측 수량(발주 수량이 아니다)').toBe(RECV_QTY)
    expect(inTxAfter - inTxBefore, '입고는 IN 원장 1행을 남긴다').toBe(1)
  })
})
