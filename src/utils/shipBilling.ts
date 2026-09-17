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
// ★ 되돌리기는 짝이 있다 — `clearShipBillingStmt`(아래). 예전엔 「재출고 때 다시 덮으니 안 지워도 된다」고 적어 둔
//   자리인데, 그건 「재출고가 일어난다」는 전제를 검사하지 않은 문장이었다 — 실제로는 `auto_complete_date` 하나만
//   남아도 동기화가 주문을 **스스로 다시 SHIPPED 로 올린다**(2026-09-17 재현).

import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'

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

/**
 * 출고를 **되돌린** 주문의 청구 타이밍을 지운다 — `applyShipBillingDates` 의 짝.
 * batch 안에 넣을 문장을 돌려준다(되돌리기와 같은 batch 여야 한다 — 쪼개지면 한쪽만 남는다).
 *
 * ★왜 필요한가 (2026-09-17 로컬 재현)
 *   `sync-statuses` Step 1 은 **`auto_complete_date` 하나만으로** 주문을 다시 SHIPPED 로 올린다.
 *   조건에 `NOT EXISTS(미출고 카드)` 가 있지만 **카드 없는 주문(유통·기성·이관)은 그게 무조건 참**이다.
 *   → 출고 취소 후 경리가 [상태 동기화]를 한 번 누르면 상태가 되살아나고, 남아 있던 `billable_after`
 *     로 자동 회계반영까지 간다. **재고는 환원됐는데 출고·청구된 주문**이 된다.
 *   되돌리는 문이 넷이라(주문 출고취소·카드 출고취소·출고 CANCELLED·출고 PREPARING 복귀) 식을 여기 둔다.
 *
 * `status <> 'SHIPPED'` 가드 = 되돌리기 UPDATE 가 실제로 먹었을 때만 지운다.
 *   (다른 활성 출고가 남아 주문이 SHIPPED 로 유지되면 청구 타이밍도 유지돼야 한다.)
 */
export function clearShipBillingStmt(db: D1Database, orderId: number): D1PreparedStatement {
  return db.prepare(
    `UPDATE orders
        SET billable_after = NULL, auto_complete_date = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status <> 'SHIPPED'`
  ).bind(orderId)
}
