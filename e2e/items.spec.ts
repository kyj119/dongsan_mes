import { test, expect } from './fixtures'

/**
 * 4. 품목 페이지 — 메인 탭 7개 전환 + 6개 핵심 함수 (Phase 3.1.B)
 *
 * 회귀 시그널:
 *   - switchMainTab 호출 시 탭 안 바뀜
 *   - currentMainTab 변수 미정의
 *   - editItem/saveItem 등 export 누락
 */
test.describe('품목 (Phase 3.1.B 분할 검증)', () => {
  test('6개 핵심 함수 + 탭 전환 (output → sign → rawMaterial)', async ({ authedPage, consoleErrors }) => {
    await authedPage.goto('/items')
    await authedPage.waitForLoadState('networkidle')

    // 6개 핵심 함수 검증
    const types = await authedPage.evaluate(() => ({
      editItem: typeof (window as any).editItem,
      saveItem: typeof (window as any).saveItem,
      switchMainTab: typeof (window as any).switchMainTab,
      openMediaGroupModal: typeof (window as any).openMediaGroupModal,
      showPriceHistory: typeof (window as any).showPriceHistory,
      applyGroupPrice: typeof (window as any).applyGroupPrice,
    }))
    for (const [k, v] of Object.entries(types)) {
      expect(v, `window.${k} should be function`).toBe('function')
    }

    // 초기 currentMainTab = output
    let cur = await authedPage.evaluate(() => (window as any).currentMainTab)
    expect(cur).toBe('output')

    // sign 탭 전환
    await authedPage.evaluate(() => (window as any).switchMainTab('sign'))
    cur = await authedPage.evaluate(() => (window as any).currentMainTab)
    expect(cur).toBe('sign')

    // rawMaterial 탭 전환
    await authedPage.evaluate(() => (window as any).switchMainTab('rawMaterial'))
    cur = await authedPage.evaluate(() => (window as any).currentMainTab)
    expect(cur).toBe('rawMaterial')

    expect(consoleErrors).toEqual([])
  })
})
