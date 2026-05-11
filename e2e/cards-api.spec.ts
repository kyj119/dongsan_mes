import { test, expect } from './fixtures'

/**
 * 5. cards API — 10개 라우트 200 응답 검증 (Phase 3.1.A + defect-stats 수정)
 *
 * 회귀 시그널:
 *   - 라우트 매칭 순서 깨짐 (/:id가 static path 가로챔)
 *   - 분할 후 import 누락 (entityFilter 등)
 *   - 권한 미들웨어 누락
 *
 * 특히 /defect-stats는 이번 세션에서 잡은 회귀 — 다시 깨지면 즉시 알람
 */
test.describe('cards API (Phase 3.1.A 분할 검증)', () => {
  test('10개 라우트 모두 success=true', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/cards')
    await authedPage.waitForLoadState('networkidle')

    const results = await authedPage.evaluate(async () => {
      const axios = (window as any).axios
      const check = (path: string) =>
        axios.get(path)
          .then((r: any) => ({ path, success: r.data?.success, status: 200 }))
          .catch((e: any) => ({ path, success: false, status: e.response?.status }))
      return Promise.all([
        check('/api/cards?limit=5'),
        check('/api/cards/kanban-summary'),
        check('/api/cards/categories'),
        check('/api/cards/stats/daily'),
        check('/api/cards/debug-counts'),
        check('/api/cards/defect-stats'),       // ← 이번 세션 수정한 버그
        check('/api/cards/defects/list'),
        check('/api/cards/schedule/queues'),
        check('/api/cards/schedule/unassigned'),
        check('/api/cards/1'),                   // /:id 라우트
      ])
    })

    for (const r of results) {
      expect(r.success, `${r.path} should return success=true (got status=${r.status})`).toBe(true)
    }

    expect(consoleErrors).toEqual([])
  })

  test('/:id/history 와 /:id/defects 정상', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/cards')
    await authedPage.waitForLoadState('networkidle')

    const results = await authedPage.evaluate(async () => {
      const axios = (window as any).axios
      const check = (path: string) =>
        axios.get(path)
          .then((r: any) => ({ path, success: r.data?.success, status: 200 }))
          .catch((e: any) => ({ path, success: false, status: e.response?.status }))
      return Promise.all([
        check('/api/cards/1/history'),
        check('/api/cards/1/defects'),
      ])
    })

    for (const r of results) {
      expect(r.success, `${r.path} should return success=true`).toBe(true)
    }

    expect(consoleErrors).toEqual([])
  })
})
