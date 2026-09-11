import { test, expect, expectClean, expectNoGarbage, db, MARK } from './fixtures'

/**
 * J3 경리 — (출고된 주문) → 주문 목록에서 회계반영 → 거래처 원장에서 잔액 확인 → 입금 등록 → 잔액 0 검산
 *
 * 「내일 쓸 사람」 = 경리. 화면은 /orders(회계반영) → /ledger(원장·입금).
 * 미수금 정본 = routes/ledger/ar-helpers.deriveClientBalance:
 *   billed(order_billing_groups.billed_amount, BILLED) − payments − adjustments.  clients.balance 는 폐기된 캐시다.
 * 판정: 신호 1~4 = 0 · 회계반영이 청구그룹을 BILLED 로 만든다 · 원장 잔액 = 파생식 · 입금 후 잔액이 정확히 그만큼 준다.
 */
test.describe.serial('J3 경리: 회계반영 → 원장 → 입금', () => {
  let clientId = 0
  let clientName = ''
  let orderId = 0
  let orderNumber = ''
  let finalAmount = 0
  let balanceBefore = 0

  const derive = (cid: number) =>
    Number(
      db<{ v: number }>(
        `SELECT (SELECT COALESCE(SUM(g.billed_amount),0) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id WHERE o.client_id=${cid} AND g.billing_status='BILLED' AND o.status!='CANCELLED')
              - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id=${cid})
              - (SELECT COALESCE(SUM(amount),0) FROM adjustments WHERE client_id=${cid}) AS v`,
      )[0].v,
    )

  test('준비: 출고된 주문 1건(API)', async ({ api }) => {
    const client = db<{ id: number; client_name: string }>(`SELECT id, client_name FROM clients WHERE is_active=1 AND client_name LIKE '%대전%' ORDER BY id LIMIT 1`)[0]
    clientId = client.id
    clientName = client.client_name
    const item = db<{ id: number; item_name: string; base_price: number }>(
      `SELECT id, item_name, base_price FROM items WHERE is_active=1 AND item_name LIKE '%게릴라%현수막%' AND base_price>0 ORDER BY id LIMIT 1`,
    )[0]
    const r = await api.post('/api/orders', {
      client_id: clientId,
      delivery_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10),
      notes: `${MARK} J3 경리 여정`,
      // 수량을 실행마다 달리한다 — 입금 API 가 「1분 이내 같은 거래처·같은 금액」을 중복으로 거절한다(ar-payments DUPLICATE_PAYMENT)
      items: [{ item_id: item.id, item_name: item.item_name, width: 300, height: 90, quantity: 3 + (Date.now() % 7), unit_price: item.base_price }],
    })
    expect(r.status, `주문 생성 ${JSON.stringify(r.data).slice(0, 200)}`).toBe(200)
    orderId = r.data.data.id
    const o = db<{ order_number: string; final_amount: number }>(`SELECT order_number, final_amount FROM orders WHERE id=${orderId}`)[0]
    orderNumber = o.order_number
    finalAmount = Number(o.final_amount)
    const card = db<{ id: number }>(`SELECT id FROM cards WHERE order_id=${orderId} ORDER BY id LIMIT 1`)[0]
    const s1 = await api.patch('/api/cards/bulk/status', { card_ids: [card.id], status: 'PRINT_DONE' })
    expect(s1.status, `출력완료 ${JSON.stringify(s1.data).slice(0, 160)}`).toBe(200)
    const s2 = await api.patch(`/api/cards/${card.id}/ship`, {})
    expect(s2.status, `출고 ${JSON.stringify(s2.data).slice(0, 160)}`).toBe(200)
    expect(db<{ status: string }>(`SELECT status FROM orders WHERE id=${orderId}`)[0].status).toBe('SHIPPED')
    balanceBefore = derive(clientId)
  })

  test('주문 목록에서 회계반영', async ({ journey: page, signals }) => {
    test.skip(!orderId, '준비 실패')
    await page.goto('/orders')
    await page.locator('#searchQuery').fill(orderNumber)
    await page.locator('#searchQuery').press('Enter')
    const cb = page.locator(`input.order-checkbox[data-order-id="${orderId}"]`)
    await expect(cb, '목록에 출고된 주문이 보여야 한다').toBeVisible({ timeout: 15_000 })
    await cb.check()
    await page.locator('[onclick="bulkBillingConfirm()"]').first().click()
    const ok = page.locator('#__confirmOk')
    await expect(ok, '회계반영 확인 모달').toBeVisible({ timeout: 5_000 })
    await ok.click()

    await expect
      .poll(() => Number(db<{ v: number }>(`SELECT COALESCE(SUM(billed_amount),0) v FROM order_billing_groups WHERE order_id=${orderId} AND billing_status='BILLED'`)[0].v), { timeout: 15_000, message: '청구그룹이 BILLED 로 잡혀야 한다' })
      .toBe(finalAmount)
    expect(derive(clientId) - balanceBefore, '회계반영 = 미수금이 청구액만큼 는다').toBe(finalAmount)
    balanceBefore = derive(clientId)
    await page.waitForTimeout(800)
    await expectNoGarbage(page, '회계반영 후 목록')
    expectClean(signals, '회계반영')
  })

  test('원장에서 거래처 잔액 확인 → 입금 등록', async ({ journey: page, signals }) => {
    test.skip(!orderId, '준비 실패')
    await page.goto('/ledger')
    await page.waitForLoadState('domcontentloaded')
    const row = page.locator(`#clientsTableBody .client-row[data-id="${clientId}"]`)
    await expect(row, '매출 원장 목록에 거래처가 보여야 한다').toBeVisible({ timeout: 15_000 })
    await row.click()

    const fmt = (n: number) => n.toLocaleString('ko-KR')
    await expect(page.locator('#clientBalance'), `원장 잔액 = 파생 미수금 ${fmt(balanceBefore)}`).toContainText(fmt(balanceBefore), { timeout: 15_000 })
    await expectNoGarbage(page, '원장 거래처 상세')

    await page.locator('#paymentAmount').fill(String(finalAmount))
    const dateEl = page.locator('#paymentDate')
    if (!(await dateEl.inputValue())) await dateEl.fill(new Date().toISOString().slice(0, 10))
    await page.locator('#paymentMethod').selectOption('계좌이체')
    await page.locator('#paymentNotes').fill(`${MARK} J3 입금`)
    await page.locator('[onclick="addPayment()"]').first().click()
    const ok = page.locator('#__confirmOk')
    if (await ok.isVisible({ timeout: 1_500 }).catch(() => false)) await ok.click()

    await expect
      .poll(() => db<{ n: number }>(`SELECT COUNT(*) n FROM payments WHERE client_id=${clientId} AND notes LIKE '%${MARK} J3%'`)[0].n, { timeout: 15_000, message: '입금 행이 생겨야 한다' })
      .toBe(1)
    await expect(page.locator('#clientBalance'), '입금 후 화면 잔액').toContainText(fmt(balanceBefore - finalAmount), { timeout: 15_000 })
    await page.waitForTimeout(500)
    await expectNoGarbage(page, '입금 후 원장')
    expectClean(signals, '입금 등록')
  })

  test('같은 입금을 1분 안에 또 넣으면 사유가 보이는 거절(400)이어야 한다', async ({ journey: page, signals }) => {
    test.skip(!orderId, '준비 실패')
    // P1(2026-09-11): 거절이 500 「서버 오류」로 나가 경리가 사유를 못 봤다 → bank.ts 와 같은 400·문구
    signals.allow(/\/api\/ledger\/payment$/)
    signals.allowConsole(/^Add payment error/) // ledger.js 가 거부 응답을 console.error 로도 남긴다 — 기대된 경로
    await page.goto('/ledger')
    await page.waitForLoadState('domcontentloaded')
    const row = page.locator(`#clientsTableBody .client-row[data-id="${clientId}"]`)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.click()
    await expect(page.locator('#clientBalance')).toBeVisible({ timeout: 15_000 })
    const [res] = await Promise.all([
      page.waitForResponse((r) => /\/api\/ledger\/payment$/.test(r.url()) && r.request().method() === 'POST'),
      (async () => {
        await page.locator('#paymentAmount').fill(String(finalAmount))
        await page.locator('#paymentMethod').selectOption('계좌이체')
        await page.locator('#paymentNotes').fill(`${MARK} J3 입금 중복`)
        await page.locator('[onclick="addPayment()"]').first().click()
      })(),
    ])
    expect(res.status(), '업무 규칙 거부는 서버 오류(500)가 아니라 400').toBe(400)
    const body = await res.json()
    expect(String(body.error || '')).toContain('1분 이내')
    await expect(page.getByText('1분 이내 동일한 입금').first(), '경리에게 사유가 보여야 한다').toBeVisible({ timeout: 5_000 })
    expect(db<{ n: number }>(`SELECT COUNT(*) n FROM payments WHERE client_id=${clientId} AND notes LIKE '%${MARK} J3 입금 중복%'`)[0].n, '중복은 저장되지 않는다').toBe(0)
    expectClean(signals, '입금 중복 거절')
  })

  test('검산: 파생 미수금·입금 행·법인', async () => {
    test.skip(!orderId, '준비 실패')
    const pay = db<{ amount: number; entity_id: number | null; payment_method: string }>(
      `SELECT amount, entity_id, payment_method FROM payments WHERE client_id=${clientId} AND notes LIKE '%${MARK} J3%'`,
    )[0]
    expect(Number(pay.amount)).toBe(finalAmount)
    expect(pay.payment_method).toBe('계좌이체')
    expect(pay.entity_id, '입금에 entity_id 가 박혀야 한다(DEFAULT 1 함정 — 명시 INSERT)').not.toBeNull()
    expect(derive(clientId), '입금 후 파생 미수금 = 전 − 입금액').toBe(balanceBefore - finalAmount)
  })
})
