import { test as base, expect, Page, ConsoleMessage, APIRequestContext } from '@playwright/test'

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
 *
 * writeApi: entity_id=99 격리된 API context (e2e_tester 계정)
 *   — 쓰기 테스트 전용. 운영 데이터 오염 0.
 */
type Fixtures = {
  authedPage: Page
  consoleErrors: string[]
  writeApi: WriteApiContext
}

export type WriteApiContext = {
  request: APIRequestContext
  token: string
  baseURL: string
  /** Authenticated GET/POST/PUT/PATCH/DELETE shortcuts */
  get: (path: string) => Promise<any>
  post: (path: string, data?: any) => Promise<any>
  put: (path: string, data?: any) => Promise<any>
  patch: (path: string, data?: any) => Promise<any>
  del: (path: string) => Promise<any>
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
    await page.waitForLoadState('domcontentloaded')
    await page.locator('input[type="text"], input[name="username"]').first().fill(user)
    await page.locator('input[type="password"]').first().fill(pass)
    await page.locator('button[type="submit"]').click()

    // 로그인 성공 시 /cards 또는 /dashboard로 리다이렉트
    // Cloudflare cold start + 병렬 worker 환경 고려해 timeout 넉넉히
    await page.waitForURL(/\/(cards|dashboard)/, { timeout: 30_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 })

    await use(page)
  },

  writeApi: [async ({ playwright }, use) => {
    const baseURL = process.env.E2E_BASE_URL || 'https://webapp-9i0.pages.dev'
    const user = process.env.E2E_WRITE_USER || 'e2e_tester'
    const pass = process.env.E2E_WRITE_PASS || 'password'

    const request = await playwright.request.newContext({ baseURL })

    // Login as e2e_tester (entity_id=99) — 한 번만 로그인
    const loginResp = await request.post('/api/auth/login', {
      data: { username: user, password: pass },
    })
    const loginData = await loginResp.json()
    if (!loginData.success) {
      throw new Error(`E2E write login failed: ${loginData.message}. Run migration 0192 first.`)
    }
    const token = loginData.data.token

    const headers = { Authorization: `Bearer ${token}` }

    const api: WriteApiContext = {
      request,
      token,
      baseURL,
      get: async (path) => {
        const r = await request.get(path, { headers })
        return r.json()
      },
      post: async (path, data?) => {
        const r = await request.post(path, { headers, data })
        return r.json()
      },
      put: async (path, data?) => {
        const r = await request.put(path, { headers, data })
        return r.json()
      },
      patch: async (path, data?) => {
        const r = await request.patch(path, { headers, data })
        return r.json()
      },
      del: async (path) => {
        const r = await request.delete(path, { headers })
        return r.json()
      },
    }

    await use(api)
    await request.dispose()
  }, { scope: 'worker' }],
})

export { expect }
