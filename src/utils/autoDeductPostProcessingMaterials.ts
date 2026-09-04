import type { D1Database } from '@cloudflare/workers-types'
import { PP_DEDUCT_REF } from './autoDeductRestore'
import { kstDate } from './kstDate'
import { resolveDeductionZone } from './inventoryZone'
import { computeRollConsumption } from './rollConsumption'

/**
 * 출고 완료 시 후가공(코팅 등) 소비 자재 자동차감
 *
 * 인쇄 자재차감(autoDeductInventory)과 동일한 폭매칭 로직을 후가공 소비재에 적용.
 * - 트리거: 출고 등록(shipment POST)에서 출고된 카드들
 * - 대상: order_item.post_processing(JSON)에 선택된 PP옵션 중 material_item_group이 매핑된 것(예 무광/유광코팅)
 * - 자재 선택: 출력폭 이상 최소폭 → group_sort(지정 우선순위) → 재고보유 → id (아래 상세 주석)
 *   ⚠️ 인쇄(autoDeductInventory)는 후보가 product_materials(제품별 연결자재)로 좁혀지지만
 *      후가공은 item_group 전체가 후보라 동폭 경합이 구조적으로 발생할 수 있다.
 * - 차감량: output_height / 914.4 × copy_total (yd)
 * - 중복방지: pp_material_deductions UNIQUE(print_event_id, material_item_id)
 */
export async function autoDeductPostProcessingMaterials(
  db: D1Database,
  cardIds: number[]
): Promise<{ success: boolean; deducted: number; reason?: string }> {
  try {
    if (!cardIds || cardIds.length === 0) return { success: true, deducted: 0 }

    // 1. material_item_group이 매핑된 활성 PP옵션 (code → group)
    const { results: ppOpts } = await db
      .prepare(
        `SELECT option_code, material_item_group
         FROM post_processing_options
         WHERE material_item_group IS NOT NULL AND material_item_group != '' AND is_active = 1`
      )
      .all() as any
    if (!ppOpts || ppOpts.length === 0) return { success: true, deducted: 0, reason: 'no PP material mappings' }
    const ppMap = new Map<string, string>(ppOpts.map((o: any) => [o.option_code, o.material_item_group]))

    let deducted = 0

    for (const cardId of cardIds) {
      const card = await db
        .prepare(`SELECT id, order_id, order_item_id, requesting_entity_id FROM cards WHERE id = ?`)
        .bind(cardId)
        .first() as any
      if (!card || !card.order_item_id) continue

      // order_item의 post_processing(JSON)에서 자재소비 PP옵션 추출
      const oi = await db
        .prepare(`SELECT id, post_processing FROM order_items WHERE id = ?`)
        .bind(card.order_item_id)
        .first() as any
      if (!oi?.post_processing) continue
      let ppList: any[] = []
      try {
        const parsed = JSON.parse(oi.post_processing)
        ppList = Array.isArray(parsed) ? parsed : []
      } catch { continue }
      const consuming = ppList
        .map((p: any) => ({ code: p?.code, group: p?.code ? ppMap.get(p.code) : undefined }))
        .filter((x) => x.group)
      if (consuming.length === 0) continue

      // 이 카드의 OK 인쇄이벤트 (출력 치수)
      const { results: pes } = await db
        .prepare(
          `SELECT id, output_width, output_height, copy_total
           FROM print_events WHERE card_id = ? AND print_status = 'OK' AND event_kind = 'PRINT'`
        )
        .bind(cardId)
        .all() as any
      if (!pes || pes.length === 0) continue

      // 차감 법인 = requesting_entity_id, 없으면 주문 법인
      let entityId = 1
      if (card.requesting_entity_id) entityId = card.requesting_entity_id
      else if (card.order_id) {
        const o = await db.prepare(`SELECT entity_id FROM orders WHERE id = ?`).bind(card.order_id).first() as any
        if (o?.entity_id) entityId = o.entity_id
      }

      for (const cons of consuming) {
        for (const pe of pes) {
          const ow = parseFloat(pe.output_width || '0')
          const oh = parseFloat(pe.output_height || '0')
          const copy = pe.copy_total || 1
          if (ow <= 0 || oh <= 0) continue

          // 자재 선택 규칙 (2026-07-29 확정 — 어느 SKU를 소비할지의 업무규칙)
          //   ① width_mm >= 출력폭 중 최소폭 — 폭이 자재 적합성의 1차 기준
          //   ② group_sort ASC — 운영자가 지정한 그룹내 우선순위(= 기본자재). 미지정은 0.
          //   ③ 재고 > 0 우선 — 같은 우선순위면 실물이 있는 SKU를 소비 (차감 법인 기준)
          //   ④ id ASC — 최종 결정론. 위 셋이 전부 동값이어도 실행마다 달라지지 않는다.
          // ⚠️ ①이 ③보다 우선 = 최소폭 자재의 재고가 0이어도 더 넓은 폭으로 넘어가지 않는다.
          //    폭이 안 맞는 자재를 쓰는 건 재고 부족보다 나쁜 선택이라 의도적으로 이 순서다.
          // ⚠️ 애초에 ②③④가 갈리는 상황(동일 그룹·동일 폭 SKU 다수)은 대부분 그룹 분류 오류다
          //    (0480: 코인텍 코팅지가 호홍 그룹에 섞여 있던 건). 그래서 발생 시 아래에서 경고한다.
          const { results: matCands } = await db
            .prepare(
              `SELECT i.id, i.width_mm, i.item_name, i.unit, i.base_unit, i.pack_size,
                      COALESCE(i.group_sort, 0) AS group_sort,
                      COALESCE((SELECT SUM(v.quantity) FROM inventory v
                                 WHERE v.item_id = i.id AND v.entity_id = ?), 0) AS stock
                 FROM items i
                WHERE i.item_group = ? AND i.is_active = 1
                  AND i.width_mm IS NOT NULL AND i.width_mm >= ?
                ORDER BY i.width_mm ASC,
                         COALESCE(i.group_sort, 0) ASC,
                         CASE WHEN COALESCE((SELECT SUM(v.quantity) FROM inventory v
                                              WHERE v.item_id = i.id AND v.entity_id = ?), 0) > 0
                              THEN 0 ELSE 1 END ASC,
                         i.id ASC
                LIMIT 5`
            )
            .bind(entityId, cons.group, ow, entityId)
            .all() as any
          const mat = matCands?.[0]
          if (!mat) continue // 적정폭 없음 → 스킵

          // 분류 점검 유도: 선택된 폭에 경합 SKU가 더 있으면 경고 (품목 페이지 배지와 동일 조건)
          const sameWidth = matCands.filter((m: any) => m.width_mm === mat.width_mm)
          if (sameWidth.length > 1) {
            console.warn(
              `[ppDeduct] ⚠️ 동폭 자재 경합: 그룹 "${cons.group}" ${mat.width_mm}mm 에 ${sameWidth.length}개 SKU. ` +
              `선택=${mat.item_name}(id=${mat.id}, group_sort=${mat.group_sort}, 재고=${mat.stock}) / ` +
              `밀림=${sameWidth.slice(1).map((m: any) => `${m.item_name}(id=${m.id})`).join(', ')}. ` +
              `대체 가능한 자재가 아니라면 자재그룹 분리 필요.`
            )
          }

          // 중복 차감 방지
          const exist = await db
            .prepare(`SELECT id FROM pp_material_deductions WHERE print_event_id = ? AND material_item_id = ?`)
            .bind(pe.id, mat.id)
            .first()
          if (exist) continue

          // 단위 환산 = utils/rollConsumption 단일 소스(인쇄차감과 동일 규칙).
          // 코팅지는 현재 전부 unit='yd' 라 기존 ÷914.4 경로가 그대로 유지된다(회귀 0).
          const ppCons = computeRollConsumption(mat, oh, copy)
          const dedYd = ppCons.qty

          // 소모 대상 창고 = 코팅지 품목 기본창고 (NULL=미배정). 재고 행 키 = (item, entity, zone).
          // UP2 제외: 코팅은 라미네이터에서 소비되나 card.equipment_id는 출력 프린터뿐 → 라미 장비 신호 없음.
          //   잘못된 장비(프린터) zone을 끌어오면 더 부정확 → 코팅지 품목 기본창고가 정확.
          // 차감이므로 **재고가 있는 구역**에서 뺀다(입고 축인 축1 이 아니라) — 2026-09-04.
          const zoneId = await resolveDeductionZone(db, { equipmentId: null, itemId: mat.id, entityId })

          await db
            .prepare(`INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`)
            .bind(mat.id, entityId, zoneId)
            .run()
          const invRow = await db
            .prepare(`SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`)
            .bind(mat.id, entityId, zoneId)
            .first() as any
          const before = invRow?.quantity ?? 0

          const after = before - dedYd
          if (after < 0) {
            console.warn(`[ppDeduct] ⚠️ 코팅지 재고 음수: ${mat.item_name} (entity=${entityId}), 잔량=${after.toFixed(2)}${ppCons.unit}, 차감=${dedYd.toFixed(2)}${ppCons.unit}, card=${cardId}`)
          }

          // 차감·기록·원장을 한 batch 로 (2026-08-31 원자화 — 인쇄 자동차감과 같은 규칙).
          //   UNIQUE(print_event, material) 위반 시 batch 전체가 롤백되므로 수동 보상이 필요 없다.
          try {
            await db.batch([
              db.prepare(
                `UPDATE inventory SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
              ).bind(dedYd, mat.id, entityId, zoneId),
              db.prepare(
                `INSERT INTO pp_material_deductions (
                   print_event_id, order_id, order_item_id, pp_option_code, material_item_id,
                   matched_width_mm, output_width_mm, output_height_mm, copy_total,
                   deducted_length_yd, inventory_before, inventory_after, entity_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).bind(
                pe.id, card.order_id, card.order_item_id, cons.code, mat.id,
                mat.width_mm, ow, oh, copy,
                dedYd, before, after, entityId
              ),
              // 원장 기록 (인쇄 자동차감과 같은 규칙 — 환원이 이 행을 근거로 한다)
              db.prepare(
                `INSERT INTO inventory_transactions
                   (item_id, transaction_type, quantity, reference_type, reference_id, balance_after, notes, transaction_date, entity_id, storage_zone_id)
                 VALUES (?, 'OUT', ?, ?, ?, ?, '후가공 자재 자동차감', ${kstDate()}, ?, ?)`
              ).bind(mat.id, Math.abs(dedYd), PP_DEDUCT_REF, pe.id, after, entityId, zoneId),
            ])
            deducted++
          } catch (insertError: any) {
            // UNIQUE 위반 = 동시 중복. batch 가 통째로 롤백되므로 되돌릴 것이 없다.
            if (!insertError?.message?.includes('UNIQUE')) throw insertError
          }
        }
      }
    }

    return { success: true, deducted }
  } catch (error) {
    return { success: false, deducted: 0, reason: error instanceof Error ? error.message : 'Unknown error' }
  }
}
