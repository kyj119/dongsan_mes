import { test, expect } from './fixtures'

/**
 * 3. 주문서 — 9개 핵심 함수 + 거래처 검색 + 단가 계산 (Phase 3.1.C)
 *
 * 가장 위험도 높은 페이지 (orderForm.js 6분할).
 *
 * 회귀 시그널:
 *   - window.addItemRow/calcItem/submitAsQuotation 등 함수 누락
 *   - 거래처 모달 안 뜸
 *   - 단가 계산 결과 어긋남
 */
test.describe('주문서 (Phase 3.1.C 분할 검증)', () => {
  test.beforeEach(async ({ authedPage }) => {
    await authedPage.goto('/order-form')
    await authedPage.waitForLoadState('networkidle')
  })

  test('9개 핵심 window.* 함수 존재', async ({ authedPage, consoleErrors }) => {
    const types = await authedPage.evaluate(() => ({
      addItemRow: typeof (window as any).addItemRow,
      submitAsQuotation: typeof (window as any).submitAsQuotation,
      calcItem: typeof (window as any).calcItem,
      applyFinPresetToOrder: typeof (window as any).applyFinPresetToOrder,
      calculateAndPreviewSheet: typeof (window as any).calculateAndPreviewSheet,
      onAIFileSelected: typeof (window as any).onAIFileSelected,
      populateAsGroupedItem: typeof (window as any).populateAsGroupedItem,
      handleClientEnter: typeof (window as any).handleClientEnter,
      setupAutocomplete: typeof (window as any).setupAutocomplete,
    }))
    for (const [k, v] of Object.entries(types)) {
      expect(v, `window.${k} should be function`).toBe('function')
    }
    expect(consoleErrors).toEqual([])
  })

  test('거래처 검색 → 선택 → 품목 행 추가 → 단가 계산', async ({ authedPage, consoleErrors }) => {
    // 거래처 검색 (한글 "대전")
    await authedPage.locator('#clientSearch').fill('대전')
    await authedPage.locator('#clientSearch').press('Enter')

    // 검색 모달 결과 표시 대기
    const modalRows = authedPage.locator('#clientModal [onclick*="selectClientFromModal"]')
    await expect(modalRows.first()).toBeVisible({ timeout: 5_000 })
    const rowCount = await modalRows.count()
    expect(rowCount).toBeGreaterThan(0)

    // 첫 거래처 선택
    await modalRows.first().click()

    // client_id가 채워졌는지
    const clientId = await authedPage.locator('#clientId').inputValue()
    expect(clientId).not.toBe('')

    // 품목 행 1개는 기본 + addItemRow로 2개 더 추가
    await authedPage.evaluate(() => {
      ;(window as any).addItemRow()
      ;(window as any).addItemRow()
    })
    const rows = authedPage.locator('#itemsContainer > [id^="item-"]')
    await expect(rows).toHaveCount(3)

    // 첫 행에 폭/높이/수량/단가 채우고 계산
    await authedPage.evaluate(() => {
      const setVal = (sel: string, v: string) => {
        const el = document.querySelector(sel) as HTMLInputElement
        if (el) {
          el.value = v
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }
      setVal('[name="width_1"]', '1500')
      setVal('[name="height_1"]', '3000')
      setVal('[name="quantity_1"]', '7')
      setVal('[name="unit_price_1"]', '8000')
      ;(window as any).calcItem(1)
    })

    // 금액 검증: 7 × 8,000 = 56,000원
    const amount = await authedPage.locator('[name="amount_1"]').inputValue()
    expect(amount).toContain('56,000')

    // 총액 검증: 56,000 + VAT 10% = 61,600
    const total = await authedPage.locator('#grandTotal').textContent()
    expect(total).toContain('61,600')

    expect(consoleErrors).toEqual([])
  })
})
