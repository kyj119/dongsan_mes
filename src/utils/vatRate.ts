/**
 * vatRate.ts — 부가세율 조회 헬퍼 (화면 주입용)
 *
 * 왜 있나: 서버는 `settings.vat_rate` 를 읽어 금액을 계산하는데(orders/create.ts · quotations.ts),
 * 화면 합계는 스크립트가 `0.1` 을 하드코딩하고 있었다. 값이 같아 눈에 안 보이지만 설정을 바꾸는
 * 순간 "화면에 보이는 합계"와 "저장되는 금액"이 갈린다.
 *
 * 생산 주문서(pages/orderForm.ts)는 이미 이 방식으로 `window.VAT_RATE` 를 주입하고 있었다 —
 * 유통 주문서·견적서 폼이 안 따라와 있어서 같은 헬퍼로 묶는다.
 *
 * ⚠️ 조회 실패는 화면을 막지 않는다. 서버와 같은 기본값(0.10)으로 폴백한다.
 */
export const DEFAULT_VAT_RATE = 0.1

export async function readVatRate(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const parsed = row ? parseFloat(row.setting_value) : NaN
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  } catch { /* 설정 조회 실패 → 기본값 */ }
  return DEFAULT_VAT_RATE
}
