import { test, expect, expectClean, expectNoGarbage, db, MARK } from './fixtures'

/**
 * J2 생산 — (영업이 넣어 둔 주문) → 현장 카드 보드에서 카드 찾기 → 출력완료 → 출고 → 상태·재고 검산
 *
 * 「내일 쓸 사람」 = 출력실·출고 담당(ADMIN/MANAGER 권한이 출고를 누른다). 화면은 /cards.
 * 주문은 API 로 만든다 — 이 여정의 주인공은 주문서가 아니라 보드다(J1 이 주문서를 본다).
 * 판정: 신호 1~4 = 0 · 카드 PRINT_PENDING→PRINT_DONE→SHIPPED · 주문 SHIPPED · 상태 이력이 남는다.
 *       재고 차감은 품목에 BOM 이 있을 때만 기대한다(없으면 정보로만 남긴다).
 */
test.describe.serial('J2 생산: 카드 보드 → 출력완료 → 출고', () => {
  let orderId = 0
  let orderNumber = ''
  let cardId = 0
  let itemId = 0

  test('준비: 영업 주문 1건(API)', async ({ api }) => {
    const item = db<{ id: number; item_name: string; base_price: number }>(
      `SELECT id, item_name, base_price FROM items WHERE is_active=1 AND item_name LIKE '%게릴라%현수막%' AND base_price>0 ORDER BY id LIMIT 1`,
    )[0] || db<{ id: number; item_name: string; base_price: number }>(
      `SELECT id, item_name, base_price FROM items WHERE is_active=1 AND is_sales_item=1 AND item_type='PRODUCT' AND base_price>0 ORDER BY id LIMIT 1`,
    )[0]
    expect(item, '판매 품목이 하나는 있어야 한다').toBeTruthy()
    itemId = item.id
    const client = db<{ id: number }>(`SELECT id FROM clients WHERE is_active=1 AND client_name LIKE '%대전%' ORDER BY id LIMIT 1`)[0]
    expect(client, '거래처가 있어야 한다').toBeTruthy()

    const r = await api.post('/api/orders', {
      client_id: client.id,
      delivery_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
      notes: `${MARK} J2 생산 여정`,
      items: [{ item_id: item.id, item_name: item.item_name, width: 300, height: 90, quantity: 1, unit_price: item.base_price || 10000 }],
    })
    expect(r.status, `주문 생성 응답 ${JSON.stringify(r.data).slice(0, 200)}`).toBe(200)
    orderId = r.data.data.id
    const o = db<{ order_number: string; status: string }>(`SELECT order_number, status FROM orders WHERE id=${orderId}`)[0]
    orderNumber = o.order_number
    const card = db<{ id: number; status: string }>(`SELECT id, status FROM cards WHERE order_id=${orderId} ORDER BY id LIMIT 1`)[0]
    expect(card, '주문 저장이 카드를 만들어야 한다').toBeTruthy()
    cardId = card.id
    expect(card.status).toBe('PRINT_PENDING')
  })

  test('보드에서 카드를 찾아 출력완료', async ({ journey: page, signals }) => {
    test.skip(!cardId, '준비 실패')
    await page.goto('/cards')
    await page.waitForLoadState('networkidle', { timeout: 30_000 })
    await expectNoGarbage(page, '보드 초기')

    await page.locator('#kanbanSearch').fill(orderNumber)
    await page.locator('#kanbanSearch').press('Enter')
    const card = page.locator(`[data-card-id="${cardId}"]`).first()
    await expect(card, '검색한 주문의 카드가 보드에 보여야 한다').toBeVisible({ timeout: 15_000 })

    // 출력대기(PRINT_PENDING) 카드에는 개별 버튼이 없다 — 출력실은 카드를 체크하고 「일괄 변경」으로 출력완료를 찍는다
    //   체크하면 하단에 고정 바(#bulkBar)가 뜨고 거기 「✓ 출력완료」가 있다(상단 「일괄 변경」은 바에 가려진다).
    await page.locator(`input.card-checkbox[data-card-id="${cardId}"]`).first().check()
    const doneBtn = page.locator(`#bulkBar [onclick="bulkChangeStatus('PRINT_DONE')"]`)
    await expect(doneBtn, '카드를 체크하면 하단 바에 출력완료 버튼이 떠야 한다').toBeVisible({ timeout: 5_000 })
    await doneBtn.click()
    const ok = page.locator('#__confirmOk')
    if (await ok.isVisible({ timeout: 2_000 }).catch(() => false)) await ok.click()

    await expect
      .poll(() => db<{ status: string }>(`SELECT status FROM cards WHERE id=${cardId}`)[0]?.status, { timeout: 15_000, message: '카드가 PRINT_DONE 이 돼야 한다' })
      .toBe('PRINT_DONE')
    await page.waitForTimeout(800)
    await expectNoGarbage(page, '출력완료 후 보드')
    expectClean(signals, '출력완료')
  })

  test('출고 처리', async ({ journey: page, signals }) => {
    test.skip(!cardId, '준비 실패')
    await page.goto('/cards')
    await page.waitForLoadState('networkidle', { timeout: 30_000 })
    await page.locator('#kanbanSearch').fill(orderNumber)
    await page.locator('#kanbanSearch').press('Enter')

    const shipBtn = page.locator(`[onclick*="shipCard(${cardId})"]`).first()
    await expect(shipBtn, '출력완료 칸의 카드에 출고 버튼이 있어야 한다').toBeVisible({ timeout: 15_000 })
    await shipBtn.click()
    const ok = page.locator('#__confirmOk')
    await expect(ok, '출고 확인 모달').toBeVisible({ timeout: 5_000 })
    await ok.click()

    // 출고는 카드 status 를 바꾸지 않고 shipped_at 을 찍는다(lifecycle.ts ship) — 주문이 SHIPPED 로 넘어간다
    await expect
      .poll(() => db<{ shipped_at: string | null }>(`SELECT shipped_at FROM cards WHERE id=${cardId}`)[0]?.shipped_at ?? null, { timeout: 15_000, message: '카드에 shipped_at 이 찍혀야 한다' })
      .not.toBeNull()
    await page.waitForTimeout(800)
    await expectNoGarbage(page, '출고 후 보드')
    expectClean(signals, '출고')
  })

  test('검산: 주문 상태·이력·재고', async ({}, testInfo) => {
    test.skip(!orderId, '준비 실패')
    const o = db<{ status: string; shipped_at: string | null }>(`SELECT status, shipped_at FROM orders WHERE id=${orderId}`)[0]
    expect(o.status, '카드 전부 출고 = 주문 SHIPPED').toBe('SHIPPED')
    // 이력 컬럼명이 to_status/new_status 중 무엇이든 — 행을 통째로 읽어 'SHIPPED' 가 들어 있는지 본다
    const histRows = db<Record<string, unknown>>(`SELECT * FROM order_status_history WHERE order_id=${orderId}`)
    const hist = histRows.filter((r) => JSON.stringify(r).includes('SHIPPED')).length
    expect(hist, '출고가 order_status_history 에 남아야 한다').toBeGreaterThan(0)
    // 출고 차감 규칙(utils/stockShip.ts): 기성/유통 라인(production_required=0)만 출고 시 차감.
    //   제작 라인(현수막 등)은 RIP 단계 자동차감이 원단을 뺀다 — 출고에서 원장이 없는 게 정상이다.
    const stockLines = db<{ n: number }>(
      `SELECT COUNT(*) n FROM order_items oi JOIN items i ON i.id=oi.item_id WHERE oi.order_id=${orderId} AND IFNULL(i.production_required,1)=0`,
    )[0]?.n ?? 0
    const tx = db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_transactions WHERE reference_type='ORDER' AND reference_id=${orderId} AND transaction_type='OUT'`)[0]?.n ?? 0
    testInfo.annotations.push({ type: 'stock', description: `기성/유통 라인 ${stockLines}건 · 출고 OUT 원장 ${tx}건 · 상태이력 ${hist}건` })
    if (stockLines > 0) expect(tx, '기성/유통 라인은 출고 시 재고 OUT 원장이 남아야 한다').toBe(stockLines)
    else expect(tx, '제작 라인만 있으면 출고가 재고를 건드리면 안 된다').toBe(0)
  })
})
