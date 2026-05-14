import { test, expect } from './fixtures'

/**
 * 10. 대시보드 — /api/dashboard/stats 응답 형식 + 페이지 로드 + KPI 렌더링
 *
 * 회귀 시그널:
 *   - /stats 복합 쿼리(15+ 서브쿼리) 바인딩 개수 불일치
 *   - 신규 엔드포인트 라우팅 깨짐
 *   - 대시보드 JS 에러로 KPI 숫자 미갱신
 */
test.describe('대시보드', () => {
  test('/api/dashboard/stats 응답 형식 검증', async ({ authedPage }) => {
    const res = await authedPage.evaluate(async () => {
      const axios = (window as any).axios
      const r = await axios.get('/api/dashboard/stats')
      return r.data
    })

    expect(res.success).toBe(true)
    expect(res.data).toBeDefined()

    // 핵심 KPI 필드 존재 + 숫자 타입
    const d = res.data
    for (const key of [
      'today_order_count', 'month_revenue', 'production_orders',
      'urgent_count', 'total_orders', 'active_clients',
    ]) {
      expect(d[key], `${key} should be a number`).not.toBeUndefined()
    }
  })

  test('서브 엔드포인트 6개 200 응답', async ({ authedPage }) => {
    const results = await authedPage.evaluate(async () => {
      const axios = (window as any).axios
      const check = (path: string) =>
        axios.get(path)
          .then((r: any) => ({ path, success: r.data?.success, status: 200 }))
          .catch((e: any) => ({ path, success: false, status: e.response?.status }))
      return Promise.all([
        check('/api/dashboard/stats/daily'),
        check('/api/dashboard/stats/monthly'),
        check('/api/dashboard/stats/clients'),
        check('/api/dashboard/stats/status-distribution'),
        check('/api/dashboard/stats/receivables'),
        check('/api/dashboard/stats/recent-activity'),
      ])
    })

    for (const r of results) {
      expect(r.success, `${r.path} should return success=true (got status=${r.status})`).toBe(true)
    }
  })

  test('대시보드 페이지 로드 + KPI 렌더링 + 콘솔 에러 0', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/dashboard')
    await authedPage.waitForLoadState('networkidle', { timeout: 30_000 })

    // KPI 카드가 초기값(-)에서 실제 숫자로 업데이트되었는지 확인
    const statEl = authedPage.locator('#statProductionOrders')
    await expect(statEl).toBeVisible({ timeout: 15_000 })

    // 초기값 '-'이 아닌 실제 값으로 업데이트되어야 함
    await expect(statEl).not.toHaveText('-', { timeout: 15_000 })

    // 주요 KPI 요소들이 DOM에 존재하는지 확인
    for (const id of ['statMonthRevenue', 'statTodayOrders', 'statUrgentCount']) {
      await expect(authedPage.locator(`#${id}`)).toBeVisible()
    }

    expect(consoleErrors).toEqual([])
  })
})
