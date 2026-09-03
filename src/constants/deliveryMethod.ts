/**
 * deliveryMethod.ts — 배송방법 SSOT (2026-08-09)
 *
 * 왜 만들었나: 같은 업무를 법인이 다르게 적어왔다 — `직배`(동산 e1, 월 130~190건) · `직접배송`(선명 e2, 월 57~104건).
 * 정본은 **`직접배송`**(사용자 결정 2026-08-09). 마이그레이션 0526 으로 데이터도 통일.
 *
 * ⚠️ `직배` 는 표시 문자열이 아니라 **판정에 쓰이는 값**이었다 —
 *    거래처 검증 화이트리스트(routes/clients.ts) · 합배송 후보 탐지(routes/shipments.ts OWN_DELIVERY).
 *    그래서 문자열을 페이지마다 적지 않고 여기서만 정의한다.
 *
 * ⚠️ 과거 표기(`직배`)는 **하위호환으로 계속 받아준다**. 이관·외부 유입·미배포 클라이언트가 옛 값을 보낼 수 있고,
 *    받아주지 않으면 조용히 필터에서 빠진다.
 *
 * 설계 = docs/specs/2026-08-09-shipment-history-list.md §2-3
 */

/** 정본 목록 — 화면 셀렉트·검증이 모두 이 순서를 쓴다 */
export const DELIVERY_METHODS = [
  '대신택배',
  '대신화물',
  '한진택배',
  '직접배송',
  '용차',
  '퀵',
  '방문수령',
] as const

export type DeliveryMethod = typeof DELIVERY_METHODS[number]

/** 과거·변형 표기 → 정본. 없는 키는 원문 그대로 둔다(임의로 뭉개지 않는다). */
const ALIASES: Record<string, DeliveryMethod> = {
  '직배': '직접배송',
  '직접 배송': '직접배송',
  '자차배송': '직접배송',
}

/** 표기를 정본으로 정규화. 집계·필터에만 쓰고, 화면 표시는 원문을 유지한다. */
export function normalizeDeliveryMethod(value: string | null | undefined): string {
  const v = (value || '').trim()
  if (!v) return ''
  return ALIASES[v] || v
}

/** 검증용 — 정본이거나 과거 표기면 통과 */
export function isValidDeliveryMethod(value: string | null | undefined): boolean {
  const v = normalizeDeliveryMethod(value)
  return (DELIVERY_METHODS as readonly string[]).includes(v)
}

/**
 * 필터·조회용 동치 목록 — 정본 1개를 고르면 그 값과 **같은 뜻의 과거 표기**를 함께 돌려준다.
 * 마이그 0526 이후에도 이관·외부 유입이 옛 값을 넣을 수 있어, 정본만 비교하면 그 행이 조용히 빠진다.
 */
export function deliveryMethodMatchValues(value: string | null | undefined): string[] {
  const canonical = normalizeDeliveryMethod(value)
  if (!canonical) return []
  const legacy = Object.keys(ALIASES).filter((k) => ALIASES[k] === canonical)
  return [canonical, ...legacy.filter((k) => k !== canonical)]
}

/**
 * 배송방법 셀렉트의 <option> 마크업. 페이지마다 값을 손으로 적지 않게 한다 —
 * 폐기값 `직배` 가 세 페이지에 남아 있던 이유가 그 손목록이었다.
 */
export function deliveryMethodOptionsHtml(selected?: string | null): string {
  const sel = normalizeDeliveryMethod(selected)
  return DELIVERY_METHODS
    .map((m) => `<option value="${m}"${sel === m ? ' selected' : ''}>${m}</option>`)
    .join('')
}

/**
 * 자가 배송(자사 인력·차량) — 합배송 동선 묶음 후보 판정에 쓴다.
 * 과거 표기를 함께 담아 미이관 데이터에서도 판정이 유지되게 한다.
 */
export const OWN_DELIVERY_METHODS = ['직접배송', '직배', '용차', '퀵'] as const
