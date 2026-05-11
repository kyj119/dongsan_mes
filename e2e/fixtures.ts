import { test as base, expect, Page, ConsoleMessage } from '@playwright/test'

/**
 * 공통 fixtures — 로그인 + 콘솔 에러 감시
 *
 * 사용법:
 *   import { test, expect } from './fixtures'
 *   test('foo', async ({ authedPage, consoleErrors }) => { ... })
 *
 * authedPage: 로그인 완료된 페이지 (E2E_USER/E2E_PASS 사용)
 * consoleErrors: 테스트 동안 잡힌 console.error/pageerror 메시지 배열
 *   — 테스트 끝에 expect(consoleErrors).toEqual([]) 패턴으로 검증
 */
type Fixtures = {
  authedPage: Page
  consoleErrors: string[]
}

export const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`)
    })
    page.on('pageerror', (err) => {
      errors.push(`[pageerror] ${err.message}`)
    })
    await use(errors)
  },

  authedPage: async ({ page }, use) => {
    const user = process.env.E2E_USER || 'admin'
    const pass = process.env.E2E_PASS || 'password'

    await page.goto('/login')
    await page.locator('input[type="text"], input[name="username"]').first().fill(user)
    await page.locator('input[type="password"]').first().fill(pass)
    await page.locator('button[type="submit"]').click()

    // 로그인 성공 시 /cards 또는 /dashboard로 리다이렉트
    await page.waitForURL(/\/(cards|dashboard)/, { timeout: 10_000 })

    await use(page)
  },
})

export { expect }
