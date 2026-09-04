import type { D1Database } from '@cloudflare/workers-types'
import { resolveDeductionZone } from './inventoryZone'
import { kstDate } from './kstDate'
import { logActivity } from './activityLog'

/**
 * 재고를 움직인 주체 — 환원 흔적을 `activity_log` 에 남기기 위해 호출처가 넘긴다.
 *
 * ★환원은 원장의 차감 행을 **철회**하므로(UNIQUE 제약상 역분개가 불가능하다) 되돌린 사실이
 *   재고 축에 남지 않는다. 주문 출고는 `order_status_history` 가 받쳐 주지만 자동차감은
 *   아무 데도 안 남았다 — 그래서 두 환원 경로 모두 시스템 로그(`/activity-log`)에 기록한다.
 */
export interface StockActor {
  userId?: number | null
  userName?: string | null
  entityId?: number | null
}

/**
 * 출고 대상 라인(기성/유통) 조회 — 차감과 환원이 **같은 집합**을 보도록 한 곳에서 만든다.
 * 두 방향이 서로 다른 기준으로 행을 고르면 환원이 차감을 못 따라가 재고가 어긋난다.
 */
async function selectShippableLines(db: D1Database, orderId: number) {
  const { results } = await db.prepare(`
    SELECT oi.item_id as item_id,
           COALESCE(oi.assigned_entity_id, o.entity_id) as entity_id,
           SUM(oi.quantity) as qty
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.order_id = ?
      AND oi.parent_item_id IS NULL
      AND oi.item_id IS NOT NULL
      AND i.production_required = 0
    GROUP BY oi.item_id, COALESCE(oi.assigned_entity_id, o.entity_id)
  `).bind(orderId).all<{ item_id: number; entity_id: number | null; qty: number }>()
  return results || []
}

/**
 * 이 (주문×품목×법인)의 출고 차감 행 — 있으면 이미 차감된 것.
 *
 * ★`idx_inventory_tx_unique_ref`(0224·0293, #88)가
 *   `(reference_type, reference_id, item_id, transaction_type, entity_id)` UNIQUE 를 강제한다.
 *   → **reference 당 OUT 은 최대 1행**이다. 그래서 출고취소를 「환원 IN 을 더한다」로 만들 수 없다:
 *   IN 을 넣어 순합을 0 으로 만들어도 OUT 행이 남아 있어 **재출고 INSERT 가 UNIQUE 위반(500)** 이다.
 *   (2026-08-30 e2e 로 실측 — 재고는 이미 빠진 뒤 INSERT 만 터져 원장·재고가 어긋났다)
 *
 *   그래서 환원은 역분개가 아니라 **그 차감의 철회**다(행 삭제 + 재고 복원).
 *   「출고했다가 취소했다」는 사실은 `order_status_history` 가 남긴다 — 재고 원장은
 *   UNIQUE 인덱스가 선언한 대로 "현재 유효한 이동" 한 벌만 담는다.
 *
 * ⚠️ `POST /api/inventory/releases` 는 `reference_type` 을 요청 본문에서 받는다. 누군가 'ORDER' +
 *   같은 주문 id 로 수동 출고를 넣으면 이 키와 겹친다 — 그 경우 원래도 stockShip 이 조용히 스킵됐다.
 *   구분 수단이 없는 기존 모호함이라 여기서 새로 악화시키지는 않는다.
 */
async function findShipOutRow(
  db: D1Database, orderId: number, itemId: number, entityId: number
): Promise<{ id: number; quantity: number; storage_zone_id: number | null } | null> {
  const row = await db.prepare(`
    SELECT id, quantity, storage_zone_id FROM inventory_transactions
    WHERE reference_type = 'ORDER' AND reference_id = ? AND item_id = ? AND entity_id = ?
      AND transaction_type = 'OUT'
    LIMIT 1
  `).bind(orderId, itemId, entityId).first<{ id: number; quantity: number; storage_zone_id: number | null }>()
  return row || null
}

/**
 * 출고 시 기성품/유통(production_required=0) 라인의 재고를 차감한다.
 * - 제작 라인(production_required=1)은 제외 (생산품은 RIP 단계에서 원단 차감)
 * - 차감 법인 = 라인별 COALESCE(order_items.assigned_entity_id, orders.entity_id)
 *   → 타법인 담당 품목은 그 담당 법인 재고에서 차감(물리 정합). 미지정(NULL)이면 청구 법인.
 *   담당 법인에 해당 품목 재고 row가 없으면 0으로 생성 후 차감(음수 허용).
 * - 음수 허용 (재고 부족이어도 차감하고 경고만; 주문서 작성 시 경고로 사전 고지)
 * - 멱등: 동일 (주문, 품목)에 OUT 이력이 있으면 스킵 → 재출고/복수 경로에서도 이중차감 방지
 *
 * order_type 무관 — 혼합 주문(제작+기성)의 기성 라인도 정확히 차감.
 * @param entityId 청구(주문) 법인 — assigned_entity_id 미지정 라인의 fallback.
 */
export async function deductStockLinesOnShip(
  db: D1Database,
  orderId: number,
  entityId: number
): Promise<void> {
  const lines = await selectShippableLines(db, orderId)

  for (const ln of lines) {
    if (!ln.item_id || !ln.qty) continue
    // 담당 법인 우선, NULL이면 청구 법인 fallback
    const lineEntity = Number(ln.entity_id) || entityId
    // 중복 차감 방지 (주문×품목×법인 단위 — 같은 품목이 복수 법인 담당으로 분할돼도 각각 차감/멱등).
    // 출고취소가 이 행을 철회하므로, 취소 후 재출고에서는 다시 차감된다.
    if (await findShipOutRow(db, orderId, ln.item_id, lineEntity)) continue

    // 소모 대상 창고 = **재고가 실제로 있는 구역**(`resolveDeductionZone`). 재고 행 키 = (item, entity, zone).
    // ★2026-09-04 이전엔 품목 기본창고(축1)에서 뺐다 — 자재가 다른 구역에 있으면 축1 이 음수가 되고
    //   실제 보유 구역은 그대로였다. 되돌리기(`unship`)는 지금도 **원장이 기록한 창고**를 되짚는다(아래 :164).
    const zoneId = await resolveDeductionZone(db, { equipmentId: null, itemId: ln.item_id, entityId: lineEntity })

    // ★재고 UPDATE 와 원장 INSERT 를 **한 batch 로 묶는다**(2026-08-31).
    //   예전엔 개별 `.run()` 이라 UPDATE 는 됐는데 INSERT 가 터지면 **재고만 빠지고 원장이 비었다** —
    //   UNIQUE 위반 500 이 정확히 그 모습이었다. balance_after 도 read-after-write 대신
    //   서브쿼리로 읽어(returns.ts 전례) 중간 SELECT 를 없앴다. batch 는 순서대로 실행되므로
    //   서브쿼리는 UPDATE 가 반영된 값을 본다.
    await db.batch([
      // 담당 법인 재고 row 부재 시 0으로 생성(음수 차감 허용) → UPDATE silent miss 방지
      db.prepare(
        `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`
      ).bind(ln.item_id, lineEntity, zoneId),
      // #164 패턴: atomic UPDATE, 음수 허용
      db.prepare(
        `UPDATE inventory SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
      ).bind(ln.qty, ln.item_id, lineEntity, zoneId),
      db.prepare(
        `INSERT INTO inventory_transactions (item_id, transaction_type, quantity, reference_type, reference_id, balance_after, notes, transaction_date, entity_id, storage_zone_id)
         VALUES (?, 'OUT', ?, 'ORDER', ?,
           (SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)),
           '기성/유통 출고 차감', ${kstDate()}, ?, ?)`
      ).bind(ln.item_id, ln.qty, orderId, ln.item_id, lineEntity, zoneId, lineEntity, zoneId),
    ])

    // 음수 경고는 **기록용**이라 batch 밖에서 읽는다(값이 틀려도 재고·원장은 이미 정합).
    const afterRow = await db.prepare(
      `SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
    ).bind(ln.item_id, lineEntity, zoneId).first<{ quantity: number }>()
    if ((afterRow?.quantity ?? 0) < 0) {
      console.warn(`[stockShip] ⚠️ 재고 음수: item=${ln.item_id}, entity=${lineEntity}, 잔량=${afterRow?.quantity}, order=${orderId}`)
    }
  }
}

/**
 * 출고 취소 시 차감했던 재고를 되돌린다 — `deductStockLinesOnShip` 의 정확한 역방향.
 *
 * ★대칭이 깨지면 출고취소가 곧 재고 증발이다. 카드 출고취소(`PATCH /api/cards/:id/unship`)는
 *   주문을 SHIPPED → PRINT_DONE 으로 되돌리는 **유일한 문**이므로(주문 상태 전이표는 `'SHIPPED': []`)
 *   차감을 넣는 모든 경로는 이 함수와 짝을 이뤄야 한다.
 *
 * 되돌리는 양 = **미상쇄 차감량**(주문 라인 수량이 아니다). 라인이 나중에 수정돼도
 * 실제로 뺀 만큼만 정확히 돌려놓는다.
 *
 * `IN` 보정행을 남기지 않는다 — 위 `findShipOutRow` 주석대로 `idx_inventory_tx_unique_ref`가
 * reference 당 OUT 1행만 허용해, IN을 더해 순합을 0으로 맞춰도 OUT 행이 남아 재출고 INSERT가
 * UNIQUE 위반(500)이 된다. 그래서 환원은 역분개가 아니라 그 OUT 행 자체의 삭제다(아래).
 * 재출고 시에는 OUT 행이 없으므로 `findShipOutRow`가 다시 차감을 허용한다.
 */
export async function restoreStockLinesOnUnship(
  db: D1Database,
  orderId: number,
  entityId: number,
  actor?: StockActor
): Promise<void> {
  const lines = await selectShippableLines(db, orderId)
  const restored: { itemId: number; qty: number; entityId: number }[] = []

  for (const ln of lines) {
    if (!ln.item_id) continue
    const lineEntity = Number(ln.entity_id) || entityId
    const out = await findShipOutRow(db, orderId, ln.item_id, lineEntity)
    if (!out) continue   // 차감된 적 없거나 이미 환원됨

    // 되돌리는 양 = **실제로 뺀 양**(주문 라인 수량이 아니다). 라인이 뒤에 수정돼도 정확히 원복된다.
    const qty = Math.abs(Number(out.quantity) || 0)
    // ★창고도 **원장이 기록한 그 창고**로 되돌린다. getItemDefaultZone 을 다시 부르면
    //   그 사이 품목 기본창고(items.storage_zone_id)가 바뀐 경우 **엉뚱한 창고로 환원**된다
    //   (총량은 맞고 창고별 재고만 어긋나 발견이 늦다). autoDeductRestore 와 같은 규칙이다.
    const zoneId = out.storage_zone_id ?? null
    // 복원과 철회를 한 batch 로 — 하나만 되면 재고·원장이 어긋난다(차감 쪽과 같은 이유).
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`
      ).bind(ln.item_id, lineEntity, zoneId),
      db.prepare(
        `UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
      ).bind(qty, ln.item_id, lineEntity, zoneId),
      // 차감 행 철회 — UNIQUE 인덱스가 reference 당 1행이라 이걸 남기면 재출고가 500 난다(위 주석).
      db.prepare(`DELETE FROM inventory_transactions WHERE id = ?`).bind(out.id),
    ])
    restored.push({ itemId: ln.item_id, qty, entityId: lineEntity })
  }

  // 철회는 원장에 흔적을 안 남기므로(위 StockActor 주석) 시스템 로그에 남긴다.
  //   실패해도 환원 자체는 유지한다 — 기록이 본 작업을 막으면 안 된다.
  if (restored.length > 0) {
    try {
      await logActivity({
        db,
        userId: actor?.userId ?? null,
        userName: actor?.userName ?? null,
        action: 'STOCK_RESTORE',
        entityType: 'ORDER',
        entityId: orderId,
        entityLabel: `출고 차감 환원 ${restored.length}품목`,
        details: JSON.stringify({ reason: 'unship', lines: restored }),
        actorEntityId: actor?.entityId ?? null,
      })
    } catch (e: any) {
      console.warn(`[stockShip] 환원 로그 실패(환원은 유지): order=${orderId} — ${e?.message}`)
    }
  }
}
