import type { D1Database } from '@cloudflare/workers-types'

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
        `SELECT id, card_id, order_number, output_width, output_height, copy_total
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
        `SELECT id, order_id, order_item_id
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

    // 4. product_materials에서 원단 목록 조회 (width_mm 순 정렬)
    const { results: materialRows } = await db
      .prepare(
        `SELECT pm.material_item_id, i.width_mm, i.item_name
         FROM product_materials pm
         JOIN items i ON pm.material_item_id = i.id
         WHERE pm.product_item_id = ? AND i.width_mm IS NOT NULL
         ORDER BY i.width_mm ASC`
      )
      .bind(productItemId)
      .all() as any

    if (!materialRows || materialRows.length === 0) {
      return { success: false, deducted: false, reason: 'no materials mapped to product' }
    }

    // 5. output_width 이상의 가장 가까운 width_mm 선택
    let selectedMaterial: (typeof materialRows)[0] | null = null

    for (const material of materialRows) {
      if (material.width_mm >= outputWidthMm) {
        selectedMaterial = material
        break
      }
    }

    // 모든 원단의 폭이 output_width보다 작으면 스킵
    if (!selectedMaterial) {
      return {
        success: false,
        deducted: false,
        reason: `no material width >= ${outputWidthMm}mm`
      }
    }

    // 6. 차감량 계산 (mm → yd 변환: 914.4mm = 1yd)
    const deductedLengthYd = (outputHeightMm / 914.4) * copyTotal

    // 7. 원자적 재고 차감 (Race condition 방지)
    // D1(SQLite)은 단일 쓰기이므로 UPDATE 내에서 직접 차감하면 안전
    const inventoryRow = await db
      .prepare(`SELECT quantity FROM inventory WHERE item_id = ?`)
      .bind(selectedMaterial.material_item_id)
      .first() as any

    const inventoryBefore = inventoryRow?.quantity ?? 0

    // 원자적 UPDATE: quantity = quantity - deductedLengthYd (음수 허용, 실사에서 보정)
    await db
      .prepare(
        `UPDATE inventory
         SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP
         WHERE item_id = ?`
      )
      .bind(deductedLengthYd, selectedMaterial.material_item_id)
      .run()

    const inventoryAfter = inventoryBefore - deductedLengthYd

    // 8. inventory_auto_deductions 기록 (UNIQUE print_event_id로 중복 INSERT 방지)
    try {
      await db
        .prepare(
          `INSERT INTO inventory_auto_deductions (
            print_event_id, material_item_id, deducted_length_mm, deducted_length_yd,
            output_width_mm, output_height_mm, copy_total, inventory_before, inventory_after,
            matched_width_mm, card_id, order_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          selectedMaterial.width_mm,
          cardId,
          printEvent.order_number || null
        )
        .run()
    } catch (insertError: any) {
      // UNIQUE 제약 위반 = 이미 차감됨 → 차감 롤백
      if (insertError?.message?.includes('UNIQUE')) {
        await db
          .prepare(
            `UPDATE inventory SET quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP WHERE item_id = ?`
          )
          .bind(deductedLengthYd, selectedMaterial.material_item_id)
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
