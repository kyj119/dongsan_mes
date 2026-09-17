// 출고 → 청구 타이밍 스탬프 (2026-09-17) — 정본 하나
//
// ★왜 생겼나 (2026-09-17 전수 점검)
//   자동 회계반영(`orders/lifecycle.ts` sync-statuses Step 2)은 조건에 `billable_after IS NOT NULL AND
//   billable_after <= 오늘` 을 걸고 있다. 그런데 이 값을 세우는 경로가 **주문 일괄 출고 · 출고준비 단건 ·
//   배치** 셋뿐이었고, **카드 화면에서 출고한 주문과 주문 상태변경으로 출고한 주문은 비어 있었다**.
//   → `auto_billing=1` 거래처 주문을 인쇄현장이 카드 보드에서 출고하면 **자동 회계반영 대상에서 영영 빠진다.**
//   화면에는 아무 표시도 안 난다(청구 대기 목록에 안 뜨고, 경고도 없다).
//
//   같은 「출고」인데 경로마다 부작용이 달랐던 것이 원인이라, 식을 여기 한 곳에 두고 전 경로가 이걸 부른다.
//   (CLAUDE.md §조용한 격하 — 「공유 지점에 제약을 걸면 그 지점을 지나는 경로를 전부 열거한다」와 같은 축)
//
// ── 식 ──
//   지연일수 = 퀵·방문·직접 계열 1일, 그 외 2일.
//   `billable_after` = 오늘 + (지연일수 × 2)  ← 옛 2단 지연(출고→완료, 완료→청구)의 총합을 한 칸에 보존한다.
//   `auto_complete_date` = 오늘(이미 도래 처리). 이미 값이 있으면 보존한다.
//
// ⚠️ 되돌리기(`unship`)는 이 두 칸을 **안 지운다** — 재출고 때 이 함수가 다시 덮으므로 타이밍은 재계산된다.

import type { D1Database } from '@cloudflare/workers-types'

/** 청구 지연일수 — 배송방법이 즉시 수령 계열이면 1일, 나머지는 2일. */
export function shipDelayDays(deliveryMethod: string | null | undefined): number {
  const m = (deliveryMethod || '').trim()
  const isQuick = m === '방문수령' || m === '직접수령' || m === '직접배송' || m === '퀵'
  return isQuick ? 1 : 2
}

/**
 * 출고 전이가 **실제로 일어난** 주문에 청구 타이밍을 찍는다.
 * 호출 조건 = 그 UPDATE 의 `changes > 0`(새로 SHIPPED 가 된 경우)만. 이미 SHIPPED 였던 주문을 덮지 않는다.
 * 실패해도 출고를 막지 않는다 — 출고는 이미 끝났고, 이 값은 청구 타이밍 힌트다.
 */
export async function applyShipBillingDates(
  db: D1Database,
  orderId: number,
  deliveryMethod: string | null | undefined
): Promise<void> {
  try {
    await db.prepare(
      `UPDATE orders
          SET billable_after = date('now', '+9 hours', '+' || ? || ' days'),
              auto_complete_date = COALESCE(auto_complete_date, date('now', '+9 hours'))
        WHERE id = ? AND status = 'SHIPPED'`
    ).bind(shipDelayDays(deliveryMethod) * 2, orderId).run()
  } catch (e) {
    console.warn('[shipBilling] 청구 타이밍 스탬프 실패 order=' + orderId + ':', e)
  }
}
