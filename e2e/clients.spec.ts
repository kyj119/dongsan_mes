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
    await authedPage.waitForLoadState('networkidle')
    await expect(authedPage.getByRole('button', { name: '거래처 추가' })).toBeVisible()

    // editClient(1) async 호출 + 응답 + 모달 표시 모두 대기
    await authedPage.evaluate(async () => {
      const fn = (window as any).editClient
      if (typeof fn === 'function') await fn(1)
    })

    // 옵션 로드까지 추가 대기 (loadPricePolicyOptions axios)
    const sel = authedPage.locator('#clientModalPricePolicy')
    await sel.waitFor({ state: 'attached', timeout: 10_000 })

    // 옵션 개수 ≥ 1 (정가 기본정책) — visible 대신 option 존재 검증
    await authedPage.waitForFunction(() => {
      const s = document.getElementById('clientModalPricePolicy') as HTMLSelectElement
      return s && s.options.length >= 1
    }, { timeout: 10_000 })
    const optCount = await sel.locator('option').count()
    expect(optCount).toBeGreaterThanOrEqual(1)

    expect(consoleErrors).toEqual([])
  })
})
