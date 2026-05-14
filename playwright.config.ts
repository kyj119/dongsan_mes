import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 설정 — 동산기획 ERP+MES
 *
 * 동작 원칙:
 * - production URL 직접 검증 (smoke가 못 잡는 onclick/모달/계산 흐름)
 * - read-only 시나리오만 (데이터 오염 0)
 * - 한 시나리오 실패해도 다른 시나리오 계속 (fullyParallel)
 *
 * 환경 변수:
 *   E2E_BASE_URL   기본 https://webapp-9i0.pages.dev
 *   E2E_USER       기본 admin
 *   E2E_PASS       기본 password
 *
 * 실행:
 *   npm run e2e            # headless
 *   npm run e2e:headed     # 브라우저 보이게
 *   npm run e2e:ui         # UI 모드 (개발용)
 *   npm run e2e:report     # HTML 리포트
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://webapp-9i0.pages.dev',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
