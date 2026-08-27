import type { D1Database } from '@cloudflare/workers-types'
import { resolveDeductionZone } from './inventoryZone'
import { computeRollConsumption, selectBoardMaterial, boardAreaSqm } from './rollConsumption'

/**
 * Print event OK 상태 → 원단 재고 자동 차감
 *
 * 알고리즘:
 * 1. print_event에서 output_width(mm), output_height(mm), copy_total 추출
 * 2. card_id → cards.order_id 또는 order_item_id → order_items.item_id (제품 item_id)
 * 3. product_materials에서 제품의 원단 목록 조회
 * 4. output_width >= matched_width인 가장 가까운 폭의 원단 선택
 * 5. 차감량 계산: output_height(mm) / 914.4 × copy_total (yd)
 * 6. inventory 차감 + inventory_auto_deductions 기록
 */
export async function autoDeductInventory(
  db: D1Database,
  printEventId: number
): Promise<{
  success: boolean
  deducted?: boolean
  materialName?: string
  deductedLength?: number
  reason?: string
}> {
  try {
    // 0. 중복 차감 방지: 이미 차감 이력이 있으면 즉시 스킵
    const existingDeduction = await db
      .prepare(`SELECT id FROM inventory_auto_deductions WHERE print_event_id = ?`)
      .bind(printEventId)
      .first()

    if (existingDeduction) {
      return { success: true, deducted: false, reason: 'already deducted (duplicate)' }
    }

    // 1. print_event 조회
    const printEvent = await db
      .prepare(
        `SELECT id, card_id, order_number, output_width, output_height, copy_total, equipment_id
         FROM print_events
         WHERE id = ?`
      )
      .bind(printEventId)
      .first() as any

    if (!printEvent) {
      return { success: false, deducted: false, reason: 'print_event not found' }
    }

    const cardId = printEvent.card_id
    const outputWidthMm = parseFloat(printEvent.output_width || '0')
    const outputHeightMm = parseFloat(printEvent.output_height || '0')
    const copyTotal = printEvent.copy_total || 1

    // output_width 또는 output_height가 0이면 스킵
    if (outputWidthMm <= 0 || outputHeightMm <= 0) {
      return { success: false, deducted: false, reason: 'output dimensions invalid or missing' }
    }

    // 2. card_id가 NULL이면 스킵
    if (!cardId) {
      return { success: false, deducted: false, reason: 'card_id is null' }
    }

    // 3. card에서 order_item_id 또는 order_id 조회
    const card = await db
      .prepare(
        `SELECT id, order_id, order_item_id, requesting_entity_id, equipment_id
         FROM cards
         WHERE id = ?`
      )
      .bind(cardId)
      .first() as any

    if (!card) {
      return { success: false, deducted: false, reason: 'card not found' }
    }

    let productItemId: number | null = null

    // 3-1. order_item_id가 있으면 직접 사용
    if (card.order_item_id) {
      const orderItem = await db
        .prepare(
          `SELECT item_id
           FROM order_items
           WHERE id = ?`
        )
        .bind(card.order_item_id)
        .first() as any

      if (orderItem?.item_id) {
        productItemId = orderItem.item_id
      }
    }

    // 3-2. order_item_id가 없으면 order_id로 조회 (첫 번째 order_item)
    if (!productItemId && card.order_id) {
      const orderItem = await db
        .prepare(
          `SELECT item_id
           FROM order_items
           WHERE order_id = ?
           LIMIT 1`
        )
        .bind(card.order_id)
        .first() as any

      if (orderItem?.item_id) {
        productItemId = orderItem.item_id
      }
    }

    if (!productItemId) {
      return { success: false, deducted: false, reason: 'product_item_id not found' }
    }

    // 4. product_materials에서 연결 자재 + 차감설정 조회
    const { results: materialRows } = await db
      .prepare(
        `SELECT pm.material_item_id, i.width_mm, i.item_name,
                COALESCE(i.deduction_method, 'ROLL') AS deduction_method, i.sheet_spec,
                COALESCE(i.waste_factor, 1.0) AS waste_factor, i.base_unit, i.unit, i.pack_size
         FROM product_materials pm
         JOIN items i ON pm.material_item_id = i.id
         WHERE pm.product_item_id = ?`
      )
      .bind(productItemId)
      .all() as any

    if (!materialRows || materialRows.length === 0) {
      return { success: false, deducted: false, reason: 'no materials mapped to product' }
    }

    // 5. 차감방식별 자재 선택 + 차감량 (ROLL=폭매칭+yd / BOARD=들어가는 최소 장+면적→장 / NONE=제외)
    //    판재 면적·선택 규칙은 `utils/rollConsumption` 정본을 쓴다(사본을 두면 소요량계획과 갈린다).
    const rollMats = materialRows
      .filter((m: any) => m.deduction_method === 'ROLL' && m.width_mm != null)
      .sort((a: any, b: any) => a.width_mm - b.width_mm)
    const boardMats = materialRows.filter((m: any) => m.deduction_method === 'BOARD')

    let selectedMaterial: any = null
    let deductedLengthYd = 0       // 차감량(base_unit 단위): ROLL=yd 또는 cm, BOARD=장
    let dedMethod = 'ROLL'
    let matchedWidthMm: number | null = null

    // ROLL: output_width 이상 최소폭 → 길이
    // 단위 환산은 utils/rollConsumption 단일 소스. unit='롤'+pack_size 면 롤 수,
    // base_unit='cm' 면 cm, 그 외는 yd(현행) — 롤이 아닌 자재는 회귀 0.
    let dedUnitFromCalc = 'yd'
    for (const m of rollMats) {
      if (m.width_mm >= outputWidthMm) {
        selectedMaterial = m; dedMethod = 'ROLL'; matchedWidthMm = m.width_mm
        const cons = computeRollConsumption(m, outputHeightMm, copyTotal)
        deductedLengthYd = cons.qty
        dedUnitFromCalc = cons.unit
        break
      }
    }
    // BOARD: 면적(㎡)→장 = W×H×copy×로스율 ÷ 보드면적
    if (!selectedMaterial && boardMats.length > 0) {
      // ★`[0]` 이었다 — 「제품→해당 두께 보드 1종」 전제가 깨져서(같은 자재의 3x6·4x8 이 BOM 에 공존)
      //   정렬 없는 쿼리의 행 순서로 차감량이 1.78배 갈렸다. 2026-08-27 선택 규칙 도입.
      const bm = selectBoardMaterial(boardMats as any[], outputWidthMm, outputHeightMm)!
      selectedMaterial = bm; dedMethod = 'BOARD'; matchedWidthMm = null
      deductedLengthYd = ((outputWidthMm * outputHeightMm) / 1e6) * copyTotal * (bm.waste_factor || 1) / boardAreaSqm(bm.sheet_spec)
    }

    if (!selectedMaterial) {
      return { success: false, deducted: false, reason: `no matching material (roll width >= ${outputWidthMm} or board)` }
    }
    const dedUnit = dedMethod === 'BOARD' ? '장' : dedUnitFromCalc

    // 7. 차감 법인 = COALESCE(cards.requesting_entity_id, orders.entity_id)
    //    requesting_entity_id = 담당 법인(Phase 2 주입). 타법인 담당 공정의 원단은 그 담당 법인 재고에서 차감(물리 정합).
    //    미지정이면 청구(주문) 법인 fallback.
    let entityId = 1
    if (card.requesting_entity_id) {
      entityId = card.requesting_entity_id
    } else if (card.order_id) {
      const orderRow = await db
        .prepare(`SELECT entity_id FROM orders WHERE id = ?`)
        .bind(card.order_id)
        .first() as any
      if (orderRow?.entity_id) entityId = orderRow.entity_id
    }

    // 차감 창고 = 자재 품목 기본창고 (0440: facility_zone 매핑 폐기로 장비위치 경유 해석 제거, 동작 불변).
    //   ⚠️ 수량(deductedLengthYd)·자재선택은 불변 — zone(출처 창고)만 결정.
    const zoneId = await resolveDeductionZone(db, {
      equipmentId: printEvent.equipment_id || card.equipment_id,
      itemId: selectedMaterial.material_item_id,
      entityId,
    })

    // 담당 법인 재고 row 부재 시 0으로 생성 → UPDATE silent miss 방지(음수 차감 허용)
    await db
      .prepare(`INSERT OR IGNORE INTO inventory (item_id, entity_id, storage_zone_id, quantity) VALUES (?, ?, ?, 0)`)
      .bind(selectedMaterial.material_item_id, entityId, zoneId)
      .run()

    const inventoryRow = await db
      .prepare(`SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`)
      .bind(selectedMaterial.material_item_id, entityId, zoneId)
      .first() as any

    const inventoryBefore = inventoryRow?.quantity ?? 0

    // 원자적 UPDATE: quantity - deductedLengthYd (음수 허용, 경고만)
    await db
      .prepare(
        `UPDATE inventory
         SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP
         WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
      )
      .bind(deductedLengthYd, selectedMaterial.material_item_id, entityId, zoneId)
      .run()

    const inventoryAfter = inventoryBefore - deductedLengthYd

    // 음수 재고 경고 로그
    if (inventoryAfter < 0) {
      console.warn(`[autoDeduct] ⚠️ 재고 음수 경고: ${selectedMaterial.item_name} (entity=${entityId}), 잔량=${inventoryAfter.toFixed(2)}${dedUnit}, 차감=${deductedLengthYd.toFixed(2)}${dedUnit}, card=${cardId}`)
    }

    // 8. inventory_auto_deductions 기록 (UNIQUE print_event_id로 중복 INSERT 방지)
    try {
      await db
        .prepare(
          `INSERT INTO inventory_auto_deductions (
            print_event_id, material_item_id, deducted_length_mm, deducted_length_yd,
            output_width_mm, output_height_mm, copy_total, inventory_before, inventory_after,
            matched_width_mm, card_id, order_number, entity_id, deduction_method, deducted_base
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          printEventId,
          selectedMaterial.material_item_id,
          outputHeightMm,
          deductedLengthYd,
          outputWidthMm,
          outputHeightMm,
          copyTotal,
          inventoryBefore,
          inventoryAfter,
          matchedWidthMm,
          cardId,
          printEvent.order_number || null,
          entityId,
          dedMethod,
          deductedLengthYd  // MU4: deducted_base — base_unit 단위 차감량(cm/yd)
        )
        .run()
    } catch (insertError: any) {
      // UNIQUE 제약 위반 = 이미 차감됨 → 차감 롤백
      if (insertError?.message?.includes('UNIQUE')) {
        await db
          .prepare(
            `UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)`
          )
          .bind(deductedLengthYd, selectedMaterial.material_item_id, entityId, zoneId)
          .run()
        return { success: true, deducted: false, reason: 'already deducted (UNIQUE constraint)' }
      }
      throw insertError
    }

    return {
      success: true,
      deducted: true,
      materialName: selectedMaterial.item_name,
      deductedLength: Math.round(deductedLengthYd * 100) / 100 // 소수점 2자리
    }
  } catch (error) {
    return {
      success: false,
      deducted: false,
      reason: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
