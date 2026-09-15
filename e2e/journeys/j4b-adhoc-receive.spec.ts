import { test, expect, expectClean, expectNoGarbage, db } from './fixtures'

/**
 * J4b 구매 — 발주 없이 물건이 왔다: 입고 화면 「발주 없이 입고」 → 공급처·품목·수량 → 발주 자동 생성(사후 표시) → 입고 확정
 *           → 검수 대기(사후 발주는 수량이 맞아도 오른다) → 승인 → 재고·원장 검산
 *
 * 「내일 쓸 사람」 = 현장에서 물건을 받는 사람. 화면은 /receiving → /purchase-orders.
 * 규칙(0611): 막지 않고 그 자리에서 발주를 만들고 `adhoc_source='RECEIVING'` 표시를 남긴다 — 차단하면 사람은 시스템 밖으로 나간다.
 * 판정: 신호 1~4 = 0 · 발주가 CONFIRMED 로 생기고 표시가 붙는다 · 입고 후 RECEIVED · 검수 대기에 오른다 · 승인 후 reviewed_at
 *       · 재고가 받은 수량만큼 늘고 IN 원장 1행.
 */
test.describe.serial('J4b 구매: 발주 없이 입고', () => {
  const RECV_QTY = 5
  let supplierName = ''
  let material = { id: 0, item_name: '', unit: '' }
  let poId = 0
  let poItemId = 0
  let maxPoBefore = 0
  let stockBefore = 0
  let inTxBefore = 0

  test.beforeAll(() => {
    const sup = db<{ client_name: string }>(
      `SELECT client_name FROM clients WHERE is_active=1 AND (client_name LIKE '%지업%' OR client_name LIKE '%원단%' OR client_name LIKE '%잉크%' OR client_name LIKE '%상사%') ORDER BY id LIMIT 1`,
    )[0] || db<{ client_name: string }>(`SELECT client_name FROM clients WHERE is_active=1 ORDER BY id LIMIT 1`)[0]
    supplierName = sup.client_name
    // 구매 품목 모달(type=purchase)에 나오려면 is_purchase_item=1 이어야 한다
    material = db<{ id: number; item_name: string; unit: string }>(
      `SELECT id, item_name, unit FROM items WHERE is_active=1 AND item_type='MATERIAL' AND is_purchase_item=1 AND unit IN ('EA','개','통','장','권') ORDER BY id LIMIT 1`,
    )[0] || db<{ id: number; item_name: string; unit: string }>(`SELECT id, item_name, unit FROM items WHERE is_active=1 AND item_type='MATERIAL' AND is_purchase_item=1 ORDER BY id LIMIT 1`)[0]
    maxPoBefore = Number(db<{ m: number }>(`SELECT IFNULL(MAX(id),0) m FROM purchase_orders`)[0].m)
  })

  test('「발주 없이 입고」 — 공급처·품목·수량 → 발주 자동 생성 → 입고 확정', async ({ journey: page, signals }) => {
    await page.goto('/receiving')
    await page.waitForLoadState('domcontentloaded')
    await expectNoGarbage(page, '입고 화면 초기')
    const btn = page.locator('[onclick="openAdhocReceive()"]').first()
    await expect(btn, '입고 화면의 「발주 없이 입고」 버튼').toBeVisible({ timeout: 10_000 })
    await btn.click()

    // 공급처 모달(shell.js 공용)
    await expect(page.locator('#clientSearchModal')).toBeVisible({ timeout: 10_000 })
    await page.locator('#clientSearchModalInput').fill(supplierName)
    const supRow = page.locator('#clientSearchModalBody [data-id], #clientSearchModalBody [onclick]').first()
    await expect(supRow, `공급처 「${supplierName}」 검색 결과`).toBeVisible({ timeout: 10_000 })
    await supRow.click()

    // 품목 모달(shell.js 공용, type=purchase) → 수량은 브라우저 prompt 로 받는다(receiving.js adhocCreate)
    await expect(page.locator('#itemSearchModal')).toBeVisible({ timeout: 10_000 })
    await page.locator('#itemSearchModalInput').fill(material.item_name)
    const itemRow = page.locator('#itemSearchModalBody [data-id]').first()
    await expect(itemRow, `자재 「${material.item_name}」 검색 결과`).toBeAttached({ timeout: 10_000 })
    page.once('dialog', (d) => d.accept(String(RECV_QTY)))
    await itemRow.dispatchEvent('click')

    // 발주가 그 자리에서 생긴다 — 사후 표시가 붙은 채, 확정 상태로
    await expect
      .poll(() => db<{ id: number }>(`SELECT id FROM purchase_orders WHERE id > ${maxPoBefore} AND adhoc_source='RECEIVING' ORDER BY id DESC LIMIT 1`)[0]?.id ?? 0, { timeout: 20_000, message: '사후 발주가 DB 에 생겨야 한다' })
      .toBeGreaterThan(0)
    const po = db<{ id: number; status: string }>(`SELECT id, status FROM purchase_orders WHERE id > ${maxPoBefore} AND adhoc_source='RECEIVING' ORDER BY id DESC LIMIT 1`)[0]
    poId = po.id
    expect(po.status, '바로 입고해야 하므로 CONFIRMED 로 생긴다').toBe('CONFIRMED')
    const line = db<{ id: number; item_id: number; quantity: number }>(`SELECT id, item_id, quantity FROM purchase_order_items WHERE po_id=${poId} ORDER BY id LIMIT 1`)[0]
    expect(line, '발주 라인').toBeTruthy()
    poItemId = line.id
    material.id = line.item_id
    expect(Number(line.quantity), 'prompt 에 넣은 수량이 발주 수량').toBe(RECV_QTY)
    stockBefore = Number(db<{ q: number }>(`SELECT IFNULL(SUM(quantity),0) q FROM inventory WHERE item_id=${material.id}`)[0].q)
    inTxBefore = Number(db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_transactions WHERE item_id=${material.id} AND transaction_type='IN'`)[0].n)

    // 곧바로 입고 모달이 열린다 → 실측 수량 확정
    await expect(page.locator('#receiveModal'), '발주 생성 직후 입고 모달').toBeVisible({ timeout: 15_000 })
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
    await expectNoGarbage(page, '입고 확정 후')
    expectClean(signals, '발주 없이 입고')
  })

  test('검수 대기 — 사후 발주는 수량이 맞아도 오른다 → 승인', async ({ journey: page, signals }) => {
    test.skip(!poId, '앞 단계 실패')
    expect(db<{ reviewed_at: string | null }>(`SELECT reviewed_at FROM purchase_orders WHERE id=${poId}`)[0].reviewed_at, '승인 전 reviewed_at 비어 있음').toBeNull()
    await page.goto('/purchase-orders')
    await page.waitForLoadState('domcontentloaded')
    const reviewCard = page.locator(`[onclick="filterByStatus('REVIEW')"]`).first()
    await expect(reviewCard, '검수 대기 카드').toBeVisible({ timeout: 10_000 })
    await expect
      .poll(() => reviewCard.locator('#statReview').textContent().then((t) => Number((t || '').replace(/[^\d]/g, ''))), { timeout: 15_000, message: '검수 대기 건수' })
      .toBeGreaterThan(0)
    await reviewCard.click()
    const approve = page.locator(`[onclick="poApproveReview(${poId})"]`).first()
    await expect(approve, '사후 발주(adhoc_source)가 「검수 대기」 목록에 떠야 한다(PO_REVIEW_PENDING_SQL)').toBeVisible({ timeout: 15_000 })
    await approve.click()
    await expect
      .poll(() => db<{ reviewed_at: string | null }>(`SELECT reviewed_at FROM purchase_orders WHERE id=${poId}`)[0]?.reviewed_at ?? null, { timeout: 15_000, message: '승인 후 reviewed_at' })
      .not.toBeNull()
    await page.waitForTimeout(800)
    await expectNoGarbage(page, '검수 승인 후')
    expectClean(signals, '검수 승인')
  })

  test('검산: 사후 표시·재고·원장', async ({}, testInfo) => {
    test.skip(!poId, '앞 단계 실패')
    const po = db<{ adhoc_source: string | null; notes: string | null; status: string }>(`SELECT adhoc_source, notes, status FROM purchase_orders WHERE id=${poId}`)[0]
    expect(po.adhoc_source, '사후 생성 표시가 남는다 — 한 달 뒤 전화 발주 건수의 근거').toBe('RECEIVING')
    expect(po.notes || '', '어디서 만들었는지 비고에 남는다').toContain('입고 화면에서 사후 생성')
    const line = db<{ received_quantity: number }>(`SELECT received_quantity FROM purchase_order_items WHERE id=${poItemId}`)[0]
    const stockAfter = Number(db<{ q: number }>(`SELECT IFNULL(SUM(quantity),0) q FROM inventory WHERE item_id=${material.id}`)[0].q)
    const inTxAfter = Number(db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_transactions WHERE item_id=${material.id} AND transaction_type='IN'`)[0].n)
    testInfo.annotations.push({ type: 'stock', description: `${material.item_name}(${material.unit}) 재고 ${stockBefore}→${stockAfter} · IN 원장 ${inTxBefore}→${inTxAfter} · 라인 입고 ${line.received_quantity}` })
    expect(Number(line.received_quantity)).toBe(RECV_QTY)
    expect(stockAfter - stockBefore, '재고 증가 = 받은 수량').toBe(RECV_QTY)
    expect(inTxAfter - inTxBefore, '입고는 IN 원장 1행').toBe(1)
  })
})
