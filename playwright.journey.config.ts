import { defineConfig, devices } from '@playwright/test'

/**
 * 업무 여정(journey) 전용 Playwright 설정 — `npm run test:journey`
 *
 * 기존 `playwright.config.ts` 와 분리한 이유:
 *   - 그쪽은 기본 대상이 **prod**(webapp-9i0.pages.dev) 이고 읽기 전용 원칙이다.
 *   - 여정은 주문 생성·출고·입고 같은 **쓰기**를 포함하므로 로컬 D1 밖에서는 절대 돌면 안 된다.
 *     (2026-06-22 e2e 쓰기 스위트가 prod 에 entity-99 쓰레기를 쌓은 전례 — memory `project-e2e-prod-pollution`)
 *   - 여정은 상태를 이어 가므로 **직렬**(workers 1)로 돈다.
 *
 * 환경 변수:
 *   JOURNEY_BASE_URL  기본 http://localhost:3000  (로컬 주소만 허용 — 아래 가드)
 *   JOURNEY_USER / JOURNEY_PASS  기본 admin / password (스냅샷은 prod 실계정 전부 password)
 */
const baseURL = process.env.JOURNEY_BASE_URL || 'http://localhost:3000'
if (!/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?\/?$/.test(baseURL)) {
  throw new Error(`[journey] 로컬 주소만 허용한다: ${baseURL} — 여정은 쓰기를 포함하므로 prod 대상 실행 금지`)
}

export default defineConfig({
  testDir: './e2e/journeys',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: '.journey/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: '.journey/reports/last.json' }],
    ['html', { open: 'never', outputFolder: '.journey/reports/html' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
