import { test, expect, expectClean, expectNoGarbage, db, MARK } from './fixtures'

/**
 * J5 재고 담당 — 실사 회차 생성(구역) → 품목 실측 입력 → 제출 → 승인 → 재고·원장 검산
 *
 * 「내일 쓸 사람」 = 출력실·현수막실 재고 담당(09-04 담당자 승인 개통). 화면은 /inventory 「실사」 탭.
 * 규칙 정본 = memory design-weekly-stock-count: 구역에 `inventory` 행이 있어야 품목이 뜬다 · 낡은 회차 승인은 재고를 되돌린다.
 * 판정: 신호 1~4 = 0 · 입력값이 count_items.counted_quantity 로 저장 · 승인 후 inventory.quantity = counted · 원장 행이 남는다.
 */
test.describe.serial('J5 재고: 실사 생성 → 입력 → 제출 → 승인', () => {
  const ZONE_ID = 6 // 현수막실(entity 1) — 재고 행 11개로 작아서 빠르다
  let countId = 0
  let itemId = 0
  let counted: number | null = null

  test('실사 탭 → 새 실사(구역) 생성', async ({ journey: page, signals }) => {
    const before = db<{ m: number }>(`SELECT IFNULL(MAX(id),0) m FROM inventory_counts`)[0].m
    await page.goto('/inventory')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('#tabCount').click()
    const newBtn = page.locator('[onclick="createNewCount()"]').first()
    await expect(newBtn, '실사 탭의 「새 실사」 버튼').toBeVisible({ timeout: 15_000 })
    await newBtn.click()
    const zone = page.locator('#countZone')
    await expect(zone, '새 실사 모달의 구역 선택').toBeVisible({ timeout: 10_000 })
    await expect.poll(() => zone.locator('option').count(), { timeout: 10_000, message: '구역 목록 로드' }).toBeGreaterThan(1)
    await zone.selectOption(String(ZONE_ID))
    await page.locator('#countNotes').fill(`${MARK} J5 실사`)
    await page.locator('[onclick="submitNewCount()"]').first().click()

    await expect
      .poll(() => db<{ m: number }>(`SELECT IFNULL(MAX(id),0) m FROM inventory_counts`)[0].m, { timeout: 15_000, message: '실사 회차가 생겨야 한다' })
      .toBeGreaterThan(before)
    const c = db<{ id: number; status: string; storage_zone_id: number; n: number }>(
      `SELECT c.id, c.status, c.storage_zone_id, (SELECT COUNT(*) FROM inventory_count_items i WHERE i.count_id=c.id) n FROM inventory_counts c ORDER BY c.id DESC LIMIT 1`,
    )[0]
    countId = c.id
    expect(Number(c.storage_zone_id)).toBe(ZONE_ID)
    expect(c.n, '구역의 재고 행만큼 실사 품목이 생겨야 한다(0이면 구역 배정 문제)').toBeGreaterThan(0)
    await page.waitForTimeout(600)
    await expectNoGarbage(page, '실사 생성 후')
    expectClean(signals, '실사 생성')
  })

  test('품목 실측 입력 → 제출 → 승인', async ({ journey: page, signals }) => {
    test.skip(!countId, '앞 단계 실패')
    // 입력칸의 onchange 는 updateItemCount(<count_items.id>, this.value, <count_id>, factor) — item_id 가 아니라 실사 행 id 다
    const target = db<{ id: number; item_id: number; system_quantity: number }>(
      `SELECT id, item_id, system_quantity FROM inventory_count_items WHERE count_id=${countId} ORDER BY system_quantity DESC, id LIMIT 1`,
    )[0]
    itemId = target.item_id
    const rowId = target.id

    await page.goto('/inventory')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('#tabCount').click()
    const row = page.locator(`[onclick="openDetail(${countId})"]`).first()
    await expect(row, '실사 목록에 방금 만든 회차').toBeVisible({ timeout: 15_000 })
    await row.click()
    // 화면의 onchange 인자 id 가 어느 축(실사 행·품목·재고 행)인지에 기대지 않는다 — 첫 실측 칸에 넣고,
    // DB 에서 counted_quantity 가 채워진 행을 찾아 그 품목을 검산 대상으로 삼는다.
    const input = page.locator('input[type="number"][onchange*="updateItemCount("]').first()
    await expect(input, '상세의 품목 실측 입력칸').toBeVisible({ timeout: 15_000 })
    await expectNoGarbage(page, '실사 상세')
    await input.fill('1')
    await input.press('Tab')
    await expect
      .poll(() => db<{ n: number }>(`SELECT COUNT(*) n FROM inventory_count_items WHERE count_id=${countId} AND counted_quantity IS NOT NULL`)[0].n, { timeout: 15_000, message: '실측이 저장돼야 한다' })
      .toBeGreaterThan(0)
    const saved = db<{ item_id: number; q: number }>(`SELECT item_id, counted_quantity q FROM inventory_count_items WHERE count_id=${countId} AND counted_quantity IS NOT NULL ORDER BY id LIMIT 1`)[0]
    itemId = saved.item_id
    counted = Number(saved.q)
    void rowId; void target

    await page.locator(`[onclick="submitCount(${countId})"]`).first().click()
    const ok = page.locator('#__confirmOk')
    await expect(ok, '제출 확인 모달').toBeVisible({ timeout: 10_000 })
    await ok.click()
    await expect
      .poll(() => db<{ s: string }>(`SELECT status s FROM inventory_counts WHERE id=${countId}`)[0].s, { timeout: 15_000, message: '제출 후 상태' })
      .toMatch(/SUBMITTED|PENDING|REVIEW/)

    const approve = page.locator(`[onclick="approveCount(${countId})"]`).first()
    await expect(approve, '제출 후 승인 버튼').toBeVisible({ timeout: 15_000 })
    await approve.click()
    await expect(ok, '승인 확인 모달').toBeVisible({ timeout: 10_000 })
    await ok.click()
    await expect
      .poll(() => db<{ s: string }>(`SELECT status s FROM inventory_counts WHERE id=${countId}`)[0].s, { timeout: 15_000, message: '승인 후 상태' })
      .toMatch(/APPROVED|COMPLETED/)
    await page.waitForTimeout(600)
    await expectNoGarbage(page, '승인 후')
    expectClean(signals, '실측·제출·승인')
  })

  test('검산: 재고 = 실측 · 원장 행', async ({}, testInfo) => {
    test.skip(!countId || counted == null, '앞 단계 실패')
    const inv = db<{ q: number }>(`SELECT quantity q FROM inventory WHERE item_id=${itemId} AND storage_zone_id=${ZONE_ID} AND entity_id=1`)[0]
    // 원장의 reference_id 는 회차가 아니라 **실사 라인 id**(품목×창고 당 1, inventoryCount.ts 승인 INSERT)
    const tx = db<{ n: number }>(
      `SELECT COUNT(*) n FROM inventory_transactions WHERE item_id=${itemId} AND transaction_type='ADJUST' AND reference_type='STOCK_COUNT' AND reference_id IN (SELECT id FROM inventory_count_items WHERE count_id=${countId})`,
    )[0].n
    testInfo.annotations.push({ type: 'stock', description: `품목 ${itemId} 구역 ${ZONE_ID}: 실측 ${counted} → 재고 ${inv?.q} · 원장 ${tx}행` })
    expect(Number(inv?.q), '승인 = 그 구역 재고가 실측값이 된다').toBe(counted)
    expect(tx, '승인은 재고 원장에 남는다').toBeGreaterThan(0)
  })
})
