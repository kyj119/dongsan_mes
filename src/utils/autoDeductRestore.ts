import type { D1Database } from '@cloudflare/workers-types'
import { kstDate } from './kstDate'

/**
 * 자동차감(인쇄 원단 · 후가공 코팅지) 환원 — `autoDeductInventory` / `autoDeductPostProcessingMaterials` 의 역방향.
 *
 * ★2026-08-31 이전엔 **되돌리는 경로가 아예 없었다.** 카드 되돌리기·출고 취소·주문 삭제 어디서도
 *   재고가 돌아오지 않았고, 주문 하드삭제는 `inventory_auto_deductions` 행만 지워
 *   "얼마나 빠졌는지"를 아는 유일한 근거까지 함께 없앴다.
 *
 * ★같은 시점에 두 차감 함수가 **원장(`inventory_transactions`)에 아무 행도 안 남기던 것**도 고쳤다.
 *   `inventory.quantity` 만 직접 바꾸고 있어서 증감내역 화면에 자재 소모가 통째로 안 보였다.
 *   그래서 이 환원은 차감 기록 테이블과 원장을 **함께** 되돌린다.
 *
 * 되돌리는 양 = 차감 기록에 남은 실제 차감량(`deducted_base`/`deducted_length_yd`).
 * 재계산하지 않는다 — 규격·매칭 원단이 뒤에 바뀌어도 뺀 만큼만 정확히 돌려놓기 위해서다.
 */

/** 인쇄 자동차감 원장 참조 유형 (print_events.id 를 reference_id 로 쓴다) */
export const AUTO_DEDUCT_REF = 'AUTO_DEDUCT'
/** 후가공 자재차감 원장 참조 유형 */
export const PP_DEDUCT_REF = 'PP_DEDUCT'

export interface RestoreResult {
  restored: number      // 되돌린 건수
  quantity: number      // 되돌린 총량(단위 혼재 — 건수 확인용)
}

/** 창고 키가 어긋나면 엉뚱한 행이 늘어난다 — 차감과 같은 규칙으로 (item, entity, zone) 을 잡는다 */
async function addBack(
  db: D1Database, itemId: number, entityId: number, zoneId: number | null, qty: number
): Promise<number> {
  await db.prepare(
    `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`
  ).bind(itemId, entityId, zoneId).run()
  await db.prepare(
    `UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP
     WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
  ).bind(qty, itemId, entityId, zoneId).run()
  const row = await db.prepare(
    `SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
  ).bind(itemId, entityId, zoneId).first<{ quantity: number }>()
  return row?.quantity ?? 0
}

/** 차감 시 쓴 창고를 원장에서 되찾는다. 원장 행이 없던 옛 차감분은 NULL(기본창고)로 되돌린다. */
async function zoneOfDeduction(
  db: D1Database, refType: string, refId: number, itemId: number, entityId: number
): Promise<number | null> {
  const row = await db.prepare(
    `SELECT storage_zone_id FROM inventory_transactions
     WHERE reference_type = ? AND reference_id = ? AND item_id = ? AND entity_id = ? AND transaction_type = 'OUT'
     LIMIT 1`
  ).bind(refType, refId, itemId, entityId).first<{ storage_zone_id: number | null }>()
  return row ? (row.storage_zone_id ?? null) : null
}

/**
 * 인쇄 자동차감 환원 — print_event 단위.
 * `inventory_auto_deductions` 는 `print_event_id` UNIQUE 라 이벤트당 1행이다.
 */
export async function restoreAutoDeductionsByPrintEvents(
  db: D1Database, printEventIds: number[]
): Promise<RestoreResult> {
  const out: RestoreResult = { restored: 0, quantity: 0 }
  const ids = [...new Set(printEventIds.filter((v) => Number.isFinite(v)))]
  if (ids.length === 0) return out

  for (let i = 0; i < ids.length; i += 80) {   // D1 바인드 한도
    const chunk = ids.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db.prepare(`
      SELECT id, print_event_id, material_item_id, entity_id,
             COALESCE(deducted_base, deducted_length_yd) AS qty
      FROM inventory_auto_deductions WHERE print_event_id IN (${ph})
    `).bind(...chunk).all<{ id: number; print_event_id: number; material_item_id: number; entity_id: number; qty: number }>()

    for (const r of (results || [])) {
      const qty = Math.abs(Number(r.qty) || 0)
      if (!r.material_item_id || qty <= 0) continue
      const entityId = Number(r.entity_id) || 1
      const zoneId = await zoneOfDeduction(db, AUTO_DEDUCT_REF, r.print_event_id, r.material_item_id, entityId)
      await addBack(db, r.material_item_id, entityId, zoneId, qty)

      // 원장의 차감 행을 철회한다 — 재고 축(stockShip)과 같은 모델이다.
      //   UNIQUE 인덱스(#88)가 reference 당 OUT 1행이라 역분개 IN 을 넣으면 재차감이 막힌다.
      await db.prepare(
        `DELETE FROM inventory_transactions
         WHERE reference_type = ? AND reference_id = ? AND item_id = ? AND entity_id = ? AND transaction_type = 'OUT'`
      ).bind(AUTO_DEDUCT_REF, r.print_event_id, r.material_item_id, entityId).run()

      // 차감 기록도 지운다 — 남겨두면 UNIQUE(print_event_id)에 걸려 **재출력 시 재차감이 안 된다**.
      await db.prepare(`DELETE FROM inventory_auto_deductions WHERE id = ?`).bind(r.id).run()
      out.restored++
      out.quantity += qty
    }
  }
  return out
}

/** 인쇄 자동차감 환원 — 카드 단위(카드 되돌리기·주문 삭제에서 사용) */
export async function restoreAutoDeductionsByCards(
  db: D1Database, cardIds: number[]
): Promise<RestoreResult> {
  const ids = [...new Set(cardIds.filter((v) => Number.isFinite(v)))]
  if (ids.length === 0) return { restored: 0, quantity: 0 }
  const acc: RestoreResult = { restored: 0, quantity: 0 }
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db.prepare(
      `SELECT DISTINCT print_event_id FROM inventory_auto_deductions WHERE card_id IN (${ph})`
    ).bind(...chunk).all<{ print_event_id: number }>()
    const r = await restoreAutoDeductionsByPrintEvents(db, (results || []).map((x) => Number(x.print_event_id)))
    acc.restored += r.restored
    acc.quantity += r.quantity
  }
  return acc
}

/**
 * 후가공 자재차감 환원 — 카드가 아니라 **주문** 단위다.
 * `pp_material_deductions` 는 UNIQUE(print_event, material) 이라 이벤트당 여러 자재가 올 수 있다.
 */
export async function restorePpDeductionsByOrder(
  db: D1Database, orderId: number
): Promise<RestoreResult> {
  const out: RestoreResult = { restored: 0, quantity: 0 }
  if (!Number.isFinite(orderId)) return out

  const { results } = await db.prepare(`
    SELECT id, print_event_id, material_item_id, entity_id, deducted_length_yd AS qty
    FROM pp_material_deductions WHERE order_id = ?
  `).bind(orderId).all<{ id: number; print_event_id: number; material_item_id: number; entity_id: number; qty: number }>()

  for (const r of (results || [])) {
    const qty = Math.abs(Number(r.qty) || 0)
    if (!r.material_item_id || qty <= 0) continue
    const entityId = Number(r.entity_id) || 1
    const zoneId = await zoneOfDeduction(db, PP_DEDUCT_REF, r.print_event_id, r.material_item_id, entityId)
    await addBack(db, r.material_item_id, entityId, zoneId, qty)

    await db.prepare(
      `DELETE FROM inventory_transactions
       WHERE reference_type = ? AND reference_id = ? AND item_id = ? AND entity_id = ? AND transaction_type = 'OUT'`
    ).bind(PP_DEDUCT_REF, r.print_event_id, r.material_item_id, entityId).run()
    await db.prepare(`DELETE FROM pp_material_deductions WHERE id = ?`).bind(r.id).run()
    out.restored++
    out.quantity += qty
  }
  return out
}

/**
 * 자동차감을 원장에 남긴다. 차감 함수 두 곳에서 부른다.
 *
 * 실패해도 차감 자체는 되돌리지 않는다 — 원장은 기록이고 `inventory.quantity` 가 정본이라,
 * 여기서 던지면 이미 빠진 재고가 되살아나지 않은 채 500 이 된다. 대신 경고를 남긴다.
 * (UNIQUE 위반 = 이미 기록됨 → 정상 흐름)
 */
export async function logAutoDeductToLedger(
  db: D1Database,
  params: {
    refType: string; refId: number; itemId: number; entityId: number;
    zoneId: number | null; qty: number; balanceAfter: number; note: string
  }
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO inventory_transactions
         (item_id, transaction_type, quantity, reference_type, reference_id, balance_after, notes, transaction_date, entity_id, storage_zone_id)
       VALUES (?, 'OUT', ?, ?, ?, ?, ?, ${kstDate()}, ?, ?)`
    ).bind(
      params.itemId, Math.abs(params.qty), params.refType, params.refId,
      params.balanceAfter, params.note, params.entityId, params.zoneId
    ).run()
  } catch (e: any) {
    if (!String(e?.message || '').includes('UNIQUE')) {
      console.warn(`[autoDeduct] 원장 기록 실패(차감은 유지): ref=${params.refType}#${params.refId} item=${params.itemId} — ${e?.message}`)
    }
  }
}
