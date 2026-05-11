import { test, expect } from './fixtures'

/**
 * 2. 거래처 페이지 — 편집 모달 + 가격 정책 드롭다운 (Phase 0)
 *
 * 회귀 시그널:
 *   - editClient() 함수 누락
 *   - 가격 정책 select가 모달에서 안 보임 (Phase 0 작업 회귀)
 *   - /api/price-list/policies 401/500
 */
test.describe('거래처', () => {
  test('편집 모달 → 가격 정책 드롭다운 표시', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/clients')
    await expect(authedPage.getByRole('button', { name: '거래처 추가' })).toBeVisible()

    // 첫 거래처의 editClient 호출 (페이지 내부 함수)
    await authedPage.evaluate(() => {
      const btn = document.querySelector('tr td button[onclick*="editClient"]') as HTMLElement
      if (btn) btn.click()
    })

    // 모달 열림 + 가격 정책 드롭다운 존재
    const sel = authedPage.locator('#clientModalPricePolicy')
    await expect(sel).toBeVisible({ timeout: 5_000 })

    // 옵션 개수 ≥ 1 (정가 기본정책)
    const optCount = await sel.locator('option').count()
    expect(optCount).toBeGreaterThanOrEqual(1)

    expect(consoleErrors).toEqual([])
  })
})
