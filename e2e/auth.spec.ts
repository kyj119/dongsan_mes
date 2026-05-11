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

    // 사이드바 핵심 메뉴 보여야 함
    await expect(authedPage.getByRole('link', { name: '거래처' })).toBeVisible()
    await expect(authedPage.getByRole('link', { name: '품목' })).toBeVisible()
    await expect(authedPage.getByRole('link', { name: '주문 관리' })).toBeVisible()

    // 콘솔 에러가 발생하면 실패
    expect(consoleErrors).toEqual([])
  })
})
