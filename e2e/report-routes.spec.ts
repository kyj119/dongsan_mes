import { test, expect } from './fixtures'

/**
 * 회계·리포트 라우트 핵심 흐름 e2e (스모크 보강 — 2026-06-09)
 *
 * 대상: financialReports / insuranceReports / vatReports / forecast / oee / claims
 *  - 페이지형(financial/insurance/vat): 페이지 로드 + 핵심 컨테이너 렌더 + console.error 0
 *    → 리포트 스크립트 getElementById 가드 회귀 시그널 (페이지 JS 에러 시 consoleErrors 검출)
 *  - API형(forecast/oee/claims): 페이지 전용 라우트 없음 → 주 GET 엔드포인트 success + data 검증
 *
 * 회귀 시그널:
 *   - 라우트/컬럼/JOIN 오류로 500
 *   - 페이지 스크립트 ID 불일치(silent fail) → console.error
 */
test.describe('회계·리포트 라우트', () => {
  // ── 페이지형: 로드 + 렌더 + 콘솔 에러 0 ──
  test('손익계산서(/financial-reports) 로드 + 렌더', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/financial-reports')
    await authedPage.waitForLoadState('networkidle', { timeout: 30_000 })
    await expect(authedPage.locator('#pnlTableBody')).toBeVisible({ timeout: 15_000 })
    expect(consoleErrors).toEqual([])
  })

  test('4대보험 신고서(/insurance-reports) 로드 + 렌더', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/insurance-reports')
    await authedPage.waitForLoadState('networkidle', { timeout: 30_000 })
    await expect(authedPage.locator('#irTableBody')).toBeVisible({ timeout: 15_000 })
    expect(consoleErrors).toEqual([])
  })

  test('부가세 신고서(/vat-reports) 로드 + 렌더', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/vat-reports')
    await authedPage.waitForLoadState('networkidle', { timeout: 30_000 })
    await expect(authedPage.locator('#vatSalesPanel')).toBeVisible({ timeout: 15_000 })
    expect(consoleErrors).toEqual([])
  })

  // ── API형: 주 엔드포인트 success + data ──
  test('생산능력 예측(/api/forecast/capacity-analysis) 응답 형식', async ({ authedPage }) => {
    const res = await authedPage.evaluate(async () => {
      const r = await (window as any).axios.get('/api/forecast/capacity-analysis')
      return r.data
    })
    expect(res.success).toBe(true)
    expect(res.data).toBeDefined()
  })

  test('설비종합효율(/api/oee/summary) 응답 형식', async ({ authedPage }) => {
    const res = await authedPage.evaluate(async () => {
      const r = await (window as any).axios.get('/api/oee/summary')
      return r.data
    })
    expect(res.success).toBe(true)
    expect(res.data).toBeDefined()
  })

  test('고객 클레임(/api/claims, /analytics) 응답 형식', async ({ authedPage }) => {
    const res = await authedPage.evaluate(async () => {
      const axios = (window as any).axios
      const [list, analytics] = await Promise.all([
        axios.get('/api/claims?limit=10'),
        axios.get('/api/claims/analytics'),
      ])
      return { list: list.data, analytics: analytics.data }
    })
    expect(res.list.success).toBe(true)
    expect(res.list.data).toBeDefined()
    expect(res.analytics.success).toBe(true)
    expect(res.analytics.data).toBeDefined()
  })
})
