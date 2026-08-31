import type { D1Database } from '@cloudflare/workers-types'

/**
 * 공급처 미지급(AP) 잔액 — **파생 정본**.
 *
 * 목록 화면(`ledger/accounts-payable.ts` Step 3)이 쓰는 산식과 같다:
 *   발주(DRAFT·CANCELLED 제외) − 지급 − 조정, 전부 법인 필터.
 *
 * ★`clients.purchase_balance` 캐시를 쓰지 않는다. 그 컬럼은 `clients` 가 법인 공유 테이블이라
 *   애초에 법인 구분이 안 되고(그래서 목록이 파생으로 옮겨갔다), 2026-08-31 에 누적 갱신 14곳을
 *   제거했다 — 화면이 안 읽는데 갱신만 하고 있었고, 수정·삭제 경로가 하나만 어긋나도
 *   조용히 틀린 값이 남는 축이었다. AR 의 `clients.balance` 폐기와 같은 처리다.
 *   (컬럼 자체는 D1 컬럼 제거 제약 때문에 남겨둔다 — 읽지 않으면 해가 없다)
 *
 * @param entityId 0 = 전체 모드(법인 필터 생략)
 */
export async function deriveSupplierPayable(
  db: D1Database, supplierId: number, entityId: number
): Promise<number> {
  const ef = entityId > 0 ? ' AND entity_id = ?' : ''
  const p: any[] = entityId > 0 ? [supplierId, entityId] : [supplierId]
  const row = await db.prepare(`
    SELECT
      COALESCE((SELECT SUM(final_amount) FROM purchase_orders
                 WHERE supplier_id = ? AND status NOT IN ('DRAFT', 'CANCELLED')${ef}), 0)
    - COALESCE((SELECT SUM(amount) FROM purchase_payments WHERE supplier_id = ?${ef}), 0)
    - COALESCE((SELECT SUM(amount) FROM purchase_adjustments WHERE supplier_id = ?${ef}), 0)
      AS v
  `).bind(...p, ...p, ...p).first<{ v: number }>()
  return Math.round((Number(row?.v) || 0) * 100) / 100
}
