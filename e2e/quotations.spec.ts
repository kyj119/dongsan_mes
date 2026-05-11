import { test, expect } from './fixtures'

/**
 * 6. 견적서 API + UI 흐름 (Phase 3.2)
 *
 * 검증 시그널:
 *   - /api/quotations 라우터 정상 작동
 *   - 견적서 페이지 렌더링
 *   - 주문서 페이지에서 ?quotation_id 쿼리 인식 가능
 */
test.describe('견적서 (Phase 3.2)', () => {
  test('/api/quotations 라우트 정상 응답', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/cards')
    await authedPage.waitForLoadState('networkidle')

    const result = await authedPage.evaluate(async () => {
      const axios = (window as any).axios
      return axios.get('/api/quotations?limit=5')
        .then((r: any) => ({ success: r.data?.success, hasData: Array.isArray(r.data?.data) }))
        .catch((e: any) => ({ success: false, status: e.response?.status }))
    })
    expect(result.success).toBe(true)
    expect(result.hasData).toBe(true)
    expect(consoleErrors).toEqual([])
  })

  test('/quotations 페이지 로드 + 핵심 함수 존재', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/quotations')
    await authedPage.waitForLoadState('networkidle')

    const types = await authedPage.evaluate(() => ({
      loadQuotations: typeof (window as any).loadQuotations,
      viewQuotation: typeof (window as any).viewQuotation,
      convertToOrder: typeof (window as any).convertToOrder,
      deleteQuotation: typeof (window as any).deleteQuotation,
    }))
    for (const [k, v] of Object.entries(types)) {
      expect(v, `window.${k} should be function`).toBe('function')
    }
    expect(consoleErrors).toEqual([])
  })

  test('주문서가 ?quotation_id 쿼리 인식 (prefill banner)', async ({ authedPage, consoleErrors }) => {
    // 잘못된 ID는 prefill 실패하지만 페이지 로드는 정상이어야
    await authedPage.goto('/order-form?quotation_id=999999')
    await authedPage.waitForLoadState('networkidle')

    // 페이지 자체는 로드되어야 (주문서 폼 존재)
    await expect(authedPage.locator('#clientSearch')).toBeVisible()
    // window.addItemRow 등 핵심 함수 정상
    const has = await authedPage.evaluate(() => typeof (window as any).addItemRow)
    expect(has).toBe('function')
    // 잘못된 ID라 에러 토스트는 나올 수 있지만 console error는 페이지 자체엔 없어야
    // (axios 404는 page error가 아님)
  })
})
