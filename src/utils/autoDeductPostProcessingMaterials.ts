import type { D1Database } from '@cloudflare/workers-types'
import { getItemDefaultZone } from './inventoryZone'

/**
 * 출고 완료 시 후가공(코팅 등) 소비 자재 자동차감
 *
 * 인쇄 자재차감(autoDeductInventory)과 동일한 폭매칭 로직을 후가공 소비재에 적용.
 * - 트리거: 출고 등록(shipment POST)에서 출고된 카드들
 * - 대상: order_item.post_processing(JSON)에 선택된 PP옵션 중 material_item_group이 매핑된 것(예 무광/유광코팅)
 * - 폭: 해당 카드 print_events의 output_width 이상 최소폭 자재 선택 (인쇄와 동일)
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
           FROM print_events WHERE card_id = ? AND print_status = 'OK'`
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

          // output_width 이상 최소폭 자재 선택 (해당 자재그룹 내)
          const mat = await db
            .prepare(
              `SELECT id, width_mm, item_name FROM items
               WHERE item_group = ? AND width_mm IS NOT NULL AND width_mm >= ?
               ORDER BY width_mm ASC LIMIT 1`
            )
            .bind(cons.group, ow)
            .first() as any
          if (!mat) continue // 적정폭 없음 → 스킵

          // 중복 차감 방지
          const exist = await db
            .prepare(`SELECT id FROM pp_material_deductions WHERE print_event_id = ? AND material_item_id = ?`)
            .bind(pe.id, mat.id)
            .first()
          if (exist) continue

          const dedYd = (oh / 914.4) * copy

          // 소모 대상 창고 = 코팅지 품목 기본창고 (NULL=미배정). 재고 행 키 = (item, entity, zone).
          // UP2 제외: 코팅은 라미네이터에서 소비되나 card.equipment_id는 출력 프린터뿐 → 라미 장비 신호 없음.
          //   잘못된 장비(프린터) zone을 끌어오면 더 부정확 → 코팅지 품목 기본창고가 정확.
          const zoneId = await getItemDefaultZone(db, mat.id, entityId)

          await db
            .prepare(`INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`)
            .bind(mat.id, entityId, zoneId)
            .run()
          const invRow = await db
            .prepare(`SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`)
            .bind(mat.id, entityId, zoneId)
            .first() as any
          const before = invRow?.quantity ?? 0

          await db
            .prepare(`UPDATE inventory SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`)
            .bind(dedYd, mat.id, entityId, zoneId)
            .run()

          const after = before - dedYd
          if (after < 0) {
            console.warn(`[ppDeduct] ⚠️ 코팅지 재고 음수: ${mat.item_name} (entity=${entityId}), 잔량=${after.toFixed(2)}yd, 차감=${dedYd.toFixed(2)}yd, card=${cardId}`)
          }

          try {
            await db
              .prepare(
                `INSERT INTO pp_material_deductions (
                   print_event_id, order_id, order_item_id, pp_option_code, material_item_id,
                   matched_width_mm, output_width_mm, output_height_mm, copy_total,
                   deducted_length_yd, inventory_before, inventory_after, entity_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
              .bind(
                pe.id, card.order_id, card.order_item_id, cons.code, mat.id,
                mat.width_mm, ow, oh, copy,
                dedYd, before, after, entityId
              )
              .run()
            deducted++
          } catch (insertError: any) {
            // UNIQUE 위반 = 동시 중복 → 차감 롤백
            if (insertError?.message?.includes('UNIQUE')) {
              await db
                .prepare(`UPDATE inventory SET quantity = quantity + ? WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`)
                .bind(dedYd, mat.id, entityId, zoneId)
                .run()
            } else {
              throw insertError
            }
          }
        }
      }
    }

    return { success: true, deducted }
  } catch (error) {
    return { success: false, deducted: 0, reason: error instanceof Error ? error.message : 'Unknown error' }
  }
}
