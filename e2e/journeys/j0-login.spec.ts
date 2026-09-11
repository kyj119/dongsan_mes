import { test, expect, expectClean, expectNoGarbage, MARK } from './fixtures'

/**
 * J0 로그인 — 직원이 로그인 화면으로 들어온다 + 로그인 한도가 「계정별」로 센다
 *
 * 「내일 쓸 사람」 = 전 직원(사무실 공유기 뒤 = 한 IP).
 * P5(2026-09-11): IP 당 5회/분이라 아침에 3~4명째부터 429 → 계정당 5회/분 + IP 당 30회/분(index.tsx·rateLimit.ts).
 * 판정: ①화면 로그인이 되고 신호 0 ②한 계정을 5번 틀리면 6번째는 429 ③그때도 다른 계정은 같은 IP 에서 통과.
 */
test.describe.serial('J0 로그인: 화면 + 계정별 한도', () => {
  test('로그인 화면에서 아이디·비밀번호로 들어간다', async ({ page, signals }) => {
    // journey 픽스처(토큰 주입)를 일부러 안 쓴다 — 여기서는 화면 로그인 자체가 대상이다
    await page.goto('/login')
    await expectNoGarbage(page, '로그인 화면')
    await page.locator('input[type="text"], input[name="username"]').first().fill(process.env.JOURNEY_USER || 'admin')
    await page.locator('input[type="password"]').first().fill(process.env.JOURNEY_PASS || 'password')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20_000 })
    await page.waitForLoadState('domcontentloaded')
    await expectNoGarbage(page, '로그인 직후')
    expectClean(signals, '화면 로그인')
  })

  test('한 계정을 5번 틀리면 6번째는 429, 다른 계정은 같은 IP 에서 통과', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.JOURNEY_BASE_URL || 'http://localhost:3000' })
    const victim = `${MARK.toLowerCase()}-nobody` // 존재하지 않는 계정 — 틀린 시도도 계정 버킷에 센다
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const r = await request.post('/api/auth/login', { data: { username: victim, password: 'wrong' } })
      statuses.push(r.status())
    }
    expect(statuses.slice(0, 5), '5번까지는 401(틀린 비밀번호)').toEqual([401, 401, 401, 401, 401])
    expect(statuses[5], '6번째는 계정 한도 429').toBe(429)

    // 같은 IP 의 다른 계정은 막히지 않는다 — 사무실 NAT 뒤 직원이 서로를 잠그면 안 된다
    const other = await request.post('/api/auth/login', { data: { username: `${MARK.toLowerCase()}-other`, password: 'wrong' } })
    expect(other.status(), '다른 계정은 IP 한도(30/분) 안이라 401 로 정상 판정').toBe(401)
    await request.dispose()
  })
})
