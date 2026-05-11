import { test, expect } from './fixtures'

/**
 * 1. 인증 흐름 — 로그인 → /cards 리다이렉트 + 콘솔 에러 0
 *
 * 회귀 시그널:
 *   - 로그인 폼 깨짐
 *   - 로그인 후 페이지 깨짐 (JS 에러)
 *   - 인증 토큰 안 박혀서 후속 API 401
 */
test.describe('인증', () => {
  test('로그인 → /cards 진입 + 콘솔 에러 0', async ({ authedPage, consoleErrors }) => {
    // authedPage fixture가 이미 로그인 + /cards 리다이렉트 확인
    await expect(authedPage).toHaveURL(/\/cards/)

    // 사이드바 핵심 메뉴 보여야 함 (href로 매칭 — 아이콘/공백 영향 없음)
    await expect(authedPage.locator('a[href="/clients"]')).toBeVisible()
    await expect(authedPage.locator('a[href="/items"]')).toBeVisible()
    await expect(authedPage.locator('a[href="/orders"]')).toBeVisible()

    // 콘솔 에러가 발생하면 실패
    expect(consoleErrors).toEqual([])
  })
})
