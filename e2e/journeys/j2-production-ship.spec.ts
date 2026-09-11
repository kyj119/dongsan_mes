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
  const STOCK_QTY = 3
  let stockItemId = 0
  let stockBefore = 0
  const stockNow = () => Number(db<{ q: number }>(`SELECT IFNULL(SUM(quantity),0) q FROM inventory WHERE item_id=${stockItemId} AND entity_id=1`)[0].q)
  const outRows = () => Number(db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_transactions WHERE reference_type='ORDER' AND reference_id=${orderId} AND item_id=${stockItemId} AND transaction_type='OUT'`)[0].n)

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

    // 기성/유통 라인 1개를 같이 넣는다 — 출고 차감·취소 환원·재출고 재차감(UNIQUE 위반 없이)이 실제로 움직이는지 보려면
    //   production_required=0 인 재고 품목이 있어야 한다(현수막 같은 제작 라인은 출고가 재고를 안 건드린다).
    const stock = db<{ id: number; item_name: string; base_price: number }>(
      `SELECT i.id, i.item_name, i.base_price FROM items i JOIN inventory inv ON inv.item_id=i.id AND inv.entity_id=1
       WHERE i.is_active=1 AND IFNULL(i.production_required,1)=0 AND i.is_sales_item=1 AND inv.quantity>5 ORDER BY inv.quantity DESC LIMIT 1`,
    )[0]
    expect(stock, '재고가 있는 기성/유통 품목이 하나는 있어야 한다').toBeTruthy()
    stockItemId = stock.id
    stockBefore = Number(db<{ q: number }>(`SELECT IFNULL(SUM(quantity),0) q FROM inventory WHERE item_id=${stockItemId} AND entity_id=1`)[0].q)

    const r = await api.post('/api/orders', {
      client_id: client.id,
      delivery_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
      notes: `${MARK} J2 생산 여정`,
      items: [
        { item_id: item.id, item_name: item.item_name, width: 300, height: 90, quantity: 1, unit_price: item.base_price || 10000 },
        { item_id: stock.id, item_name: stock.item_name, quantity: STOCK_QTY, unit_price: stock.base_price || 1000 },
      ],
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

    // 진행중 카드의 개별 버튼은 「RIP 전송·보류」뿐이다(설계: 출력완료는 출력 이벤트가 찍는다).
    //   에이전트 없이 사람이 찍는 길 = 카드 체크 → 하단 표준 바(#cardBulkBar) 「상태 선택 → 일괄 변경」.
    //   P2(2026-09-11): 레거시 #bulkBar 가 이 표준 바를 덮어 눌리지 않던 것을 제거했다 — 이 단계가 그 회귀 게이트다.
    await page.locator(`input.card-checkbox[data-card-id="${cardId}"]`).first().check()
    const bar = page.locator('#cardBulkBar')
    await expect(bar, '카드를 체크하면 표준 일괄 바가 떠야 한다').toBeVisible({ timeout: 5_000 })
    await page.locator('#cardBulkStatus').selectOption('PRINT_DONE')
    await bar.locator('[onclick="cardBulkChangeStatus()"]').click({ timeout: 5_000 })
    const ok = page.locator('#__confirmOk')
    await expect(ok, '일괄 변경 확인 모달').toBeVisible({ timeout: 5_000 })
    await ok.click()

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
    testInfo.annotations.push({ type: 'stock', description: `기성/유통 라인 ${stockLines}건 · 출고 OUT 원장 ${tx}건 · 상태이력 ${hist}건 · 재고 ${stockBefore}→${stockNow()}` })
    expect(stockLines, '이 주문은 기성/유통 라인 1개를 갖는다').toBe(1)
    expect(tx, '기성/유통 라인은 출고 시 재고 OUT 원장이 남아야 한다').toBe(1)
    expect(stockNow(), '출고 = 기성 라인 수량만큼 재고 차감').toBe(stockBefore - STOCK_QTY)
  })

  test('출고 취소 — 재고 환원(OUT 행 철회)·주문 되돌림·시스템 로그', async ({ journey: page, api, signals }, testInfo) => {
    test.skip(!cardId, '준비 실패')
    // 환원은 역분개가 아니라 **OUT 행 철회**(UNIQUE idx 때문) + 재고 복원 + activity_log STOCK_RESTORE (CLAUDE.md §누적 캐시)
    // ⚠️P9(2026-09-11): 주문이 SHIPPED 가 되면 보드가 카드를 숨기고(`exclude_order_status=SHIPPED`) /cards/:id 엔 출고 버튼만 있어
    //   **화면에서 출고 취소에 닿는 길이 없다**. 보드 모달의 「출고 취소」는 아직 보드에 남은(부분 출고) 카드에서만 보인다.
    //   여정은 그 길이 생기면 화면으로, 없으면 API(PATCH /api/cards/:id/unship — 보드 모달이 부르는 것)로 환원 검산만 한다.
    await page.goto('/cards')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('#kanbanSearch').fill(orderNumber)
    await page.locator('#kanbanSearch').press('Enter')
    const unship = page.locator(`[onclick*="unshipCard(${cardId})"]`).first()
    if (await unship.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await unship.click()
      const ok = page.locator('#__confirmOk')
      await expect(ok, '출고 취소 확인 모달').toBeVisible({ timeout: 5_000 })
      await ok.click()
    } else {
      testInfo.annotations.push({ type: 'P9', description: '출고 취소 화면 진입점 없음 → API 로 환원 검산' })
      const r = await api.patch(`/api/cards/${cardId}/unship`, {})
      expect(r.status, `출고 취소 API ${JSON.stringify(r.data).slice(0, 160)}`).toBe(200)
    }
    await expect
      .poll(() => db<{ s: string | null }>(`SELECT shipped_at s FROM cards WHERE id=${cardId}`)[0]?.s ?? null, { timeout: 15_000, message: '카드 shipped_at 이 비워져야 한다' })
      .toBeNull()
    expect(db<{ s: string }>(`SELECT status s FROM orders WHERE id=${orderId}`)[0].s, '주문은 SHIPPED 에서 내려와야 한다').not.toBe('SHIPPED')
    expect(outRows(), '환원 = OUT 원장 행 철회(상쇄 IN 이 아니라 삭제)').toBe(0)
    expect(stockNow(), '환원 = 재고 복원').toBe(stockBefore)
    const logs = db<{ n: number }>(`SELECT COUNT(*) n FROM activity_logs WHERE action='STOCK_RESTORE' AND entity_id=${orderId}`)[0].n
    expect(logs, '환원 흔적은 시스템 로그(STOCK_RESTORE)에 남아야 한다').toBeGreaterThan(0)
    await page.waitForTimeout(600)
    await expectNoGarbage(page, '출고 취소 후')
    expectClean(signals, '출고 취소')
  })

  test('재출고 — 다시 차감되고 UNIQUE 위반(500) 없이 끝난다', async ({ journey: page, signals }) => {
    test.skip(!cardId, '준비 실패')
    await page.goto('/cards')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('#kanbanSearch').fill(orderNumber)
    await page.locator('#kanbanSearch').press('Enter')
    const shipBtn = page.locator(`[onclick*="shipCard(${cardId})"]`).first()
    await expect(shipBtn, '취소된 카드는 다시 출고 버튼이 있어야 한다').toBeVisible({ timeout: 15_000 })
    await shipBtn.click()
    const ok = page.locator('#__confirmOk')
    await expect(ok).toBeVisible({ timeout: 5_000 })
    await ok.click()
    await expect
      .poll(() => db<{ s: string | null }>(`SELECT shipped_at s FROM cards WHERE id=${cardId}`)[0]?.s ?? null, { timeout: 15_000, message: '재출고 shipped_at' })
      .not.toBeNull()
    expect(db<{ s: string }>(`SELECT status s FROM orders WHERE id=${orderId}`)[0].s).toBe('SHIPPED')
    expect(outRows(), '재출고 = OUT 원장 1행(2026-08-30 UNIQUE 위반 500 회귀)').toBe(1)
    expect(stockNow(), '재출고 = 다시 차감').toBe(stockBefore - STOCK_QTY)
    await page.waitForTimeout(600)
    await expectNoGarbage(page, '재출고 후')
    expectClean(signals, '재출고')
  })
})
