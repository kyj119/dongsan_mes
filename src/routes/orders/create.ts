/**
 * orders/create.ts — 주문 생성 라우트 POST / (core.ts에서 분리, 2026-06-11 대형파일 분할 3/4)
 *
 * 주문서 단일 생성 엔드포인트(품목/카드/청구그룹/재고경고/알림 포함, 단일 핸들러).
 * 배럴(orders.ts)에서 동일 prefix('/')에 마운트. ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order } from '../../types/models'
import { authMiddleware } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { getNextEntitySeqNumber } from '../../utils/sequenceGenerator'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { checkMaterialShortage } from '../../utils/materialShortageCheck'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { kstYmd, kstYmdCompact } from '../../utils/kstDate'
import { ORDER_STATUS_LABELS } from '../../utils/statusLabels'
import { thumbRef, resolveGroupByAiIndex, type AnalysisGroup } from '../../utils/thumbnailStore'
import { recommendAssignedEntity, recalcOrderBillingGroups, generateCardsForOrder, enqueueAutoProcessJobsForItems } from './helpers'

const ordersCreateRouter = new Hono<HonoEnv>()
ordersCreateRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

// Create new order
ordersCreateRouter.post('/', async (c) => {
  try {
    const user = c.get('user')
    const orderData = await c.req.json()

    // Validate required fields
    if (!orderData.client_id || !orderData.items || orderData.items.length === 0) {
      return c.json({
        success: false,
        error: '거래처와 품목은 필수입니다.'
      }, 400)
    }
    if (!orderData.delivery_date) {
      return c.json({ success: false, error: '납품일은 필수입니다.' }, 400)
    }

    // AI 파일 관련 필드
    const aiFilePath: string | null = orderData.ai_file_path || null
    const aiAnalysisId: number | null = orderData.ai_analysis_id || null
    const layoutId: number | null = orderData.layout_id || null

    // 합배송 예약 (배송 후속 P1): 같은 거래처 검증 + root 해소(체인 방지 — 대상이 이미
    // 예약 보유 시 그 root를 저장). 검증 실패는 주문 등록을 막지 않고 예약만 드롭(best-effort).
    let consolidateWithOrderId: number | null = null
    if (orderData.consolidate_with_order_id) {
      const target = await c.env.DB.prepare(
        `SELECT id, client_id, consolidate_with_order_id FROM orders WHERE id = ? AND status NOT IN ('CANCELLED', 'DELETED')`
      ).bind(Number(orderData.consolidate_with_order_id)).first<{ id: number; client_id: number; consolidate_with_order_id: number | null }>()
      if (target && Number(target.client_id) === Number(orderData.client_id)) {
        consolidateWithOrderId = target.consolidate_with_order_id || target.id
      } else {
        console.warn('consolidate_with_order_id 드롭 (대상 없음/거래처 불일치):', orderData.consolidate_with_order_id)
      }
    }

    // 청구(매출) 법인: 명시값 우선, 없으면 로그인 법인 (코디네이터가 타법인 주문 접수 시 명시 선택)
    // ⚠️ 불변식 "번호 E{eid} = 행 entity_id" → 채번도 billingEntityId 기준이어야 함(세션 법인 X).
    //    billing_entity_id ≠ 세션 법인일 때(코디 타법인 접수) 번호 접두와 entity_id 불일치 버그 방지.
    const billingEntityId = (orderData.billing_entity_id && Number(orderData.billing_entity_id) > 0)
      ? Number(orderData.billing_entity_id)
      : (getEntityId(c) || 1)

    // Generate order number (without ORD- prefix)
    const dateStr = kstYmdCompact()

    const orderNumber = await getNextEntitySeqNumber(c.env.DB, 'orders', 'order_number', billingEntityId, dateStr)

    // pricing_method batch 조회 (AREA 계산 분기용)
    const itemIdsForPricing = [...new Set(
      orderData.items.map((it: any) => it.item_id).filter((id: any) => id != null)
    )] as number[]
    const pricingMethodMap = new Map<number, string>()
    if (itemIdsForPricing.length > 0) {
      const placeholders = itemIdsForPricing.map(() => '?').join(',')
      const { results: pricingRows } = await c.env.DB.prepare(
        `SELECT id, pricing_method FROM items WHERE id IN (${placeholders})`
      ).bind(...itemIdsForPricing).all()
      for (const row of pricingRows) {
        pricingMethodMap.set(row.id as number, (row.pricing_method as string) || 'FIXED')
      }
    }

    // VAT rate from settings
    const vatSettingPost = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const vatRatePost = vatSettingPost ? parseFloat(vatSettingPost.setting_value) : 0.10

    // Calculate totals (PENDING 품목은 0원 처리)
    let totalAmount = 0
    let vatAmount = 0
    for (const item of orderData.items) {
      if (item.price_status === 'PENDING') { continue }
      const pricingMethod = item.item_id ? (pricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      let itemAmount: number
      if (pricingMethod === 'AREA' && w > 0 && h > 0) {
        // 10cm 올림 후 면적 계산 (프론트엔드와 동일)
        const wRound = Math.ceil(w / 10) * 10
        const hRound = Math.ceil(h / 10) * 10
        itemAmount = (item.unit_price || 0) * (wRound / 100) * (hRound / 100) * (item.quantity || 1)
      } else {
        itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      }
      // 100원 단위 반올림
      itemAmount = Math.round(itemAmount / 100) * 100
      totalAmount += itemAmount
      if (item.vat_included) {
        vatAmount += itemAmount * vatRatePost
      }
    }

    const finalAmount = totalAmount + vatAmount - (orderData.discount_amount || 0)

    // QUOTATION 상태가 명시적으로 전달되면 견적서로 생성, 그 외 기본값 CONFIRMED
    const requestedStatus = orderData.status
    const initialStatus = requestedStatus === 'QUOTATION'
      ? 'QUOTATION'
      : 'CONFIRMED'

    // 견적서인 경우 valid_until 자동 설정 (30일 후), 명시적 값 우선
    let validUntil: string | null = null
    if (initialStatus === 'QUOTATION') {
      if (orderData.valid_until) {
        validUntil = orderData.valid_until
      } else {
        validUntil = kstYmd(30)
      }
    }

    // Insert order
    const orderType = orderData.order_type === 'DISTRIBUTION' ? 'DISTRIBUTION' : 'PRODUCTION'
    // Phase 3.2: source_quotation_id 받으면 orders.quotation_id에 저장 (견적서 → 주문 prefill 흐름)
    const sourceQuotationId = orderData.source_quotation_id || orderData.quotation_id || null
    // billingEntityId는 위(채번 전)에서 계산됨 — 번호 접두와 entity_id 일치 보장
    const orderResult = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, client_id, status, order_year, order_month,
        reception_location, delivery_info, delivery_date, order_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, internal_notes, created_by,
        ai_file_path, ai_analysis_id, layout_id, priority, delivery_method, delivery_time,
        contact_phone, contact_mobile, shipping_payment, valid_until, entity_id,
        sheet_layout_params, order_type, quotation_id, consolidate_with_order_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderNumber,
      orderData.client_id,
      initialStatus,
      orderData.order_year || Number(kstYmd().slice(0, 4)),
      orderData.order_month || Number(kstYmd().slice(5, 7)),
      orderData.reception_location || null,
      orderData.delivery_info || null,
      orderData.delivery_date || null,
      orderData.order_date || kstYmd(),
      totalAmount,
      vatAmount,
      orderData.discount_amount || 0,
      finalAmount,
      orderData.notes || null,
      orderData.internal_notes || null,
      user?.id || 1,
      aiFilePath,
      aiAnalysisId,
      layoutId,
      orderData.priority || 'NORMAL',
      orderData.delivery_method || '배송',
      orderData.delivery_time || null,
      orderData.contact_phone || null,
      orderData.contact_mobile || null,
      orderData.shipping_payment || null,
      validUntil,
      billingEntityId,
      (() => {
        const slItem = orderData.items.find((it: any) => it.sheet_layout_params && !it.parent_client_id)
        return slItem?.sheet_layout_params || null
      })(),
      orderType,
      sourceQuotationId,
      consolidateWithOrderId
    ).run()

    // Phase 3.2: 견적서로부터 생성된 주문이면 quotations 카운트 갱신
    if (sourceQuotationId && initialStatus !== 'QUOTATION') {
      await c.env.DB.prepare(`
        UPDATE quotations
        SET converted_count = converted_count + 1,
            first_converted_at = COALESCE(first_converted_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(sourceQuotationId).run().catch(() => {})
    }

    const orderId = orderResult.meta.last_row_id

    // Insert order items — two-pass batch for parent_item_id support (#63 원자화)
    // Pre-resolve: item detail lookups for items missing name
    const parentItems: Array<{ idx: number; item: any; itemName: string | null; categoryName: string | null; unit: string; itemAmount: number }> = []
    const itemIdsToLookup: number[] = []
    const lookupIndices: number[] = []

    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (item.parent_client_id) continue

      const itemPricingMethod = item.item_id ? (pricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const itemW = item.width_mm || item.width || 0
      const itemH = item.height_mm || item.height || 0
      let itemAmount: number
      if (itemPricingMethod === 'AREA' && itemW > 0 && itemH > 0) {
        const iwRound = Math.ceil(itemW / 10) * 10
        const ihRound = Math.ceil(itemH / 10) * 10
        itemAmount = (item.unit_price || 0) * (iwRound / 100) * (ihRound / 100) * (item.quantity || 1)
      } else {
        itemAmount = (item.unit_price || 0) * (item.quantity || 1)
      }
      itemAmount = Math.round(itemAmount / 100) * 100

      const entry = { idx: i, item, itemName: item.item_name || null, categoryName: item.category_name || null, unit: item.unit || 'EA', itemAmount }
      parentItems.push(entry)

      if (item.item_id && !entry.itemName) {
        itemIdsToLookup.push(item.item_id)
        lookupIndices.push(parentItems.length - 1)
      }
    }

    // Batch lookup item details
    if (itemIdsToLookup.length > 0) {
      const lookupStmts = itemIdsToLookup.map(id =>
        c.env.DB.prepare('SELECT item_name, category, unit FROM items WHERE id = ?').bind(id)
      )
      const lookupResults = await c.env.DB.batch(lookupStmts)
      for (let k = 0; k < lookupResults.length; k++) {
        const row = lookupResults[k].results[0] as { item_name: string; category: string; unit: string } | undefined
        if (row) {
          const entry = parentItems[lookupIndices[k]]
          entry.itemName = row.item_name
          entry.categoryName = row.category
          entry.unit = row.unit
        }
      }
    }

    // Pass 1: batch insert parent/regular rows
    const orderEntityId = billingEntityId
    const pass1Stmts = parentItems.map(({ idx, item, itemName, categoryName, unit, itemAmount }) => {
      // 담당 법인: 요청 명시값 우선, 없으면 카드그룹 기반 추천. NULL=청구 법인 담당(투명)
      const assignedEntity = (item.assigned_entity_id !== undefined && item.assigned_entity_id !== null)
        ? item.assigned_entity_id
        : recommendAssignedEntity({ ...item, category_name: categoryName }, orderEntityId)
      const assignmentStatus = assignedEntity ? (item.assignment_status || 'PENDING') : null
      return c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id, finishing, price_status,
          assigned_entity_id, assignment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `).bind(
        orderId,
        item.item_id || null,
        itemName || 'Unknown',
        categoryName || null,
        item.width_mm || item.width || null,
        item.height_mm || item.height || null,
        item.quantity || 1,
        unit,
        item.price_status === 'PENDING' ? 0 : (item.unit_price || 0),
        item.price_status === 'PENDING' ? 0 : itemAmount,
        item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1,
        item.post_processing || item.paper || null,
        item.content || item.print || null,
        item.specification || null,
        idx,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1,
        item.ai_analysis_id || null,
        item.finishing || null,
        item.price_status || 'CONFIRMED',
        assignedEntity,
        assignmentStatus
      )
    })

    const clientIdMap = new Map<string, number>()
    if (pass1Stmts.length > 0) {
      const pass1Results = await c.env.DB.batch(pass1Stmts)
      for (let k = 0; k < pass1Results.length; k++) {
        const item = parentItems[k].item
        if (item.client_group_id) {
          clientIdMap.set(item.client_group_id, pass1Results[k].meta.last_row_id as number)
        }
      }
    }

    // Pass 2: batch insert child rows (has parent_client_id)
    const parentOnlyCount = parentItems.length
    const pass2Stmts: ReturnType<ReturnType<typeof c.env.DB.prepare>['bind']>[] = []
    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i]
      if (!item.parent_client_id) continue

      const parentDbId = clientIdMap.get(item.parent_client_id) ?? null
      pass2Stmts.push(
        c.env.DB.prepare(`
          INSERT INTO order_items (
            order_id, item_id, item_name, category_name,
            width, height, quantity, unit,
            unit_price, amount, vat_included,
            post_processing, content, specification, sort_order,
            ai_group_index, scale_factor, ai_analysis_id, parent_item_id,
            assigned_entity_id, assignment_status
          ) VALUES (?, NULL, ?, NULL, ?, ?, ?, ?, 0, 0, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          orderId,
          item.item_name || '',
          item.width_mm || item.width || null,
          item.height_mm || item.height || null,
          item.quantity || 1,
          item.unit || 'EA',
          item.content || null,
          item.specification || null,
          parentOnlyCount + i,
          item.ai_group_index !== undefined ? item.ai_group_index : null,
          item.scale_factor || 1,
          item.ai_analysis_id || null,
          parentDbId,
          item.assigned_entity_id || null,
          (item.assigned_entity_id ? (item.assignment_status || 'PENDING') : null)
        )
      )
    }
    if (pass2Stmts.length > 0) {
      await c.env.DB.batch(pass2Stmts)
    }

    // split billing P2: 품목 담당법인별 청구그룹 생성/재계산
    await recalcOrderBillingGroups(c.env.DB, orderId)

    // Insert status history
    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?)
    `).bind(orderId, initialStatus, user?.id || null, initialStatus === 'QUOTATION' ? 'Quotation created' : 'Order created').run()

    // Step 3.5 — save order_ai_files (다중 AI 파일 지원)
    const aiFiles: Array<{ file_path: string; analysis_id?: number; groups_count?: number }> = orderData.ai_files || []
    if (aiFiles.length > 0) {
      const aiFileStmts = aiFiles.map((af: { file_path: string; analysis_id?: number }, idx: number) =>
        c.env.DB.prepare(
          `INSERT INTO order_ai_files (order_id, file_path, file_name, analysis_id, sort_order, entity_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          orderId,
          af.file_path,
          (af.file_path || '').split(/[/\\]/).pop() || null,
          af.analysis_id || null,
          idx,
          billingEntityId // #entity정합: 주문행과 동일 법인 (코디 타법인 접수 시 세션≠청구 법인)
        )
      )
      await c.env.DB.batch(aiFileStmts)
    }

    // Step 4 — enqueue an AI_PROCESS task for IllustratorAutomat.
    // One task per order covers the entire file: JSX processing + EPS output +
    // NAS upload to Z:\orders\{category}\{year}\{month}\{order_number}\.
    // The agent claims this via POST /api/tasks/claim?type=AI_PROCESS.
    if (aiFilePath) {
      try {
        await c.env.DB.prepare(`
          INSERT INTO tasks (type, status, order_id, input_payload, created_by, entity_id)
          VALUES ('AI_PROCESS', 'PENDING', ?, ?, ?, ?)
        `).bind(
          orderId,
          JSON.stringify({
            order_number: orderNumber,
            ai_file_path: aiFilePath,
            ai_analysis_id: orderData.ai_analysis_id ?? null
          }),
          user?.id || null,
          billingEntityId // #entity정합: 주문행과 동일 법인 (코디 타법인 접수 대응)
        ).run()
      } catch (taskErr) {
        // Non-fatal — IllustratorAutomat still polls /api/orders?status=CONFIRMED
        // as a legacy fallback, so the order will be picked up either way.
        console.error('Failed to enqueue AI_PROCESS task:', taskErr)
      }
    }

    // balance는 경리 확인(BILLED) 시점에만 반영 — 주문 생성 시 미반영

    // Auto-generate cards immediately after order creation
    // QUOTATION 상태 주문은 카드 생성 건너뜀 (확정 전 견적)
    if (initialStatus === 'QUOTATION') {
      return c.json({
        success: true,
        data: { id: orderId, order_number: orderNumber },
        message: `견적서가 생성되었습니다. 유효기한: ${validUntil}`
      })
    }

    // ── 여신한도 체크 (#69) ──────────────────────────────────────────────────
    // ADMIN은 무조건 통과, 그 외 역할은 여신 초과 시 결재 요청 생성 + 카드 미생성
    let creditBlocked = false
    if (orderData.client_id && user?.role !== 'ADMIN') {
      const creditClient = await c.env.DB.prepare(
        `SELECT credit_limit, credit_hold FROM clients WHERE id = ?`
      ).bind(orderData.client_id).first<{ credit_limit: number; credit_hold: number }>()

      if (creditClient?.credit_hold === 1) {
        // 수동 차단 — 주문 자체를 막진 않되 결재 필수
        creditBlocked = true
      } else if (creditClient?.credit_limit && creditClient.credit_limit > 0) {
        const balRow = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(CASE WHEN final_amount > 0 THEN final_amount ELSE 0 END), 0)
                 - COALESCE((SELECT SUM(amount) FROM payments WHERE client_id = ?), 0) as balance
          FROM orders WHERE client_id = ? AND status NOT IN ('CANCELLED','DELETED','QUOTATION')
        `).bind(orderData.client_id, orderData.client_id).first<{ balance: number }>()
        const balance = balRow?.balance || 0
        if (balance >= creditClient.credit_limit) {
          creditBlocked = true
        }
      }

      if (creditBlocked) {
        // #163: 여신 초과 — 결재 요청 원자적 생성
        const today2 = kstYmdCompact()
        // #329: 법인코드 E{eid} 내장 — 멀티법인 번호 충돌 방지 (행 entity_id와 동일 eid 사용)
        const aprNumber = await getNextEntitySeqNumber(c.env.DB, 'approval_requests', 'request_number', getEntityId(c) || 1, today2, { base: 'APR-' })

        const clientName = await c.env.DB.prepare(
          `SELECT client_name FROM clients WHERE id = ?`
        ).bind(orderData.client_id).first<{ client_name: string }>()

        const balRow2 = await c.env.DB.prepare(`
          SELECT COALESCE(SUM(CASE WHEN final_amount > 0 THEN final_amount ELSE 0 END), 0)
                 - COALESCE((SELECT SUM(amount) FROM payments WHERE client_id = ?), 0) as balance
          FROM orders WHERE client_id = ? AND status NOT IN ('CANCELLED','DELETED','QUOTATION')
        `).bind(orderData.client_id, orderData.client_id).first<{ balance: number }>()

        const creditInfo = await c.env.DB.prepare(
          `SELECT credit_limit FROM clients WHERE id = ?`
        ).bind(orderData.client_id).first<{ credit_limit: number }>()

        const entityId = getEntityId(c) || 1 // #329: 번호 E{eid}와 행 entity_id 일치 보장

        // batch 1: 주문 credit_status + approval_requests 원자적 생성
        const batchResults = await c.env.DB.batch([
          c.env.DB.prepare(
            `UPDATE orders SET credit_status = 'PENDING' WHERE id = ?`
          ).bind(orderId),
          c.env.DB.prepare(`
            INSERT INTO approval_requests (request_number, type, requester_id, title, content, amount, reference_type, reference_id, status, current_step, total_steps, entity_id)
            VALUES (?, 'CREDIT_OVERRIDE', ?, ?, ?, ?, 'order', ?, 'PENDING', 1, 1, ?)
          `).bind(
            aprNumber,
            user?.id || 1,
            `여신한도 초과 승인 요청 — ${clientName?.client_name || ''}`,
            JSON.stringify({
              client_id: orderData.client_id,
              client_name: clientName?.client_name,
              credit_limit: creditInfo?.credit_limit || 0,
              current_balance: balRow2?.balance || 0,
              order_amount: finalAmount,
              order_number: orderNumber
            }),
            finalAmount,
            orderId,
            entityId
          )
        ])

        const aprId = batchResults[1].meta?.last_row_id as number

        // batch 2: approval_steps + credit_overrides 원자적 생성
        await c.env.DB.batch([
          c.env.DB.prepare(`
            INSERT INTO approval_steps (request_id, step_order, approver_role, label, status, entity_id)
            VALUES (?, 1, 'ADMIN', '경리/관리자 승인', 'PENDING', ?)
          `).bind(aprId, entityId || 1),
          c.env.DB.prepare(`
            INSERT INTO credit_overrides (order_id, client_id, credit_limit, balance_at_time, order_amount, approval_request_id, entity_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            orderId, orderData.client_id,
            creditInfo?.credit_limit || 0, balRow2?.balance || 0,
            finalAmount, aprId, entityId || 1
          )
        ])

        // 카드 생성 없이 반환 — 여신 승인 대기 상태
        return c.json({
          success: true,
          data: { id: orderId, order_number: orderNumber, credit_status: 'PENDING', approval_request_id: aprId },
          message: '여신한도 초과 — 경리/관리자 승인 대기 중입니다. 승인 후 생산이 시작됩니다.'
        })
      }
    }

    // 유통 주문: 카드 미생성, 전 품목 shipment_ready=1 (바로 출고 가능)
    let cardsGenerated = 0
    if (orderType === 'DISTRIBUTION') {
      await c.env.DB.prepare(
        `UPDATE order_items SET shipment_ready = 1 WHERE order_id = ?`
      ).bind(orderId).run()
    } else {
      cardsGenerated = await generateCardsForOrder({
        db: c.env.DB,
        orderId,
        orderNumber,
        clientId: orderData.client_id,
        deliveryDate: orderData.delivery_date || null,
        priority: orderData.priority || 'NORMAL',
        notes: orderData.notes || null,
        entityId: billingEntityId
      })
    }

    // ── 타법인 배정 알림: 타법인 담당(assigned_entity_id ≠ 청구법인) 품목이 있으면 그 법인에 알림 (멀티법인 협업) ──
    try {
      const { results: crossEntities } = await c.env.DB.prepare(
        `SELECT DISTINCT assigned_entity_id AS eid FROM order_items
         WHERE order_id = ? AND assigned_entity_id IS NOT NULL AND assigned_entity_id != ?`
      ).bind(orderId, billingEntityId).all<{ eid: number }>()
      for (const row of (crossEntities || [])) {
        await notifyRoles(
          c.env.DB,
          ['DESIGNER', 'MANAGER'],
          '타법인 작업 배정',
          `주문 ${orderNumber}에 귀 법인 담당 품목이 배정되었습니다.`,
          '/orders',
          row.eid as number
        )
      }
    } catch (_) { /* 알림 실패는 주문 생성에 영향 없음 */ }

    // ── C. Thumbnail extraction: for each created card, look up AI group thumbnail ──
    // Only attempt if the order has an ai_analysis_id or any item has one
    try {
      const { results: cardsForThumb } = await c.env.DB.prepare(`
        SELECT c.id as card_id, oi.ai_analysis_id, oi.ai_group_index
        FROM cards c
        JOIN card_items ci ON ci.card_id = c.id
        JOIN order_items oi ON oi.id = ci.order_item_id
        WHERE c.order_id = ?
          AND oi.ai_analysis_id IS NOT NULL
          AND oi.ai_group_index IS NOT NULL
          AND c.thumbnail_url IS NULL
        GROUP BY c.id
      `).bind(orderId).all()

      // N+1 제거: 분석 결과를 IN(...)으로 일괄 선조회 후 thumbnail UPDATE는 db.batch로 묶음
      const thumbAnalysisIds = [...new Set((cardsForThumb as any[]).map((r) => r.ai_analysis_id as number))]
      const analysisCache = new Map<number, AnalysisGroup[]>()
      if (thumbAnalysisIds.length > 0) {
        const aph = thumbAnalysisIds.map(() => '?').join(',')
        const { results: aRows } = await c.env.DB.prepare(
          `SELECT id, groups_json FROM ai_analysis_requests WHERE id IN (${aph})`
        ).bind(...thumbAnalysisIds).all<{ id: number; groups_json: string | null }>()
        for (const a of aRows) {
          let parsed: AnalysisGroup[] = []
          if (a.groups_json) { try { parsed = JSON.parse(a.groups_json) } catch (_) { parsed = [] } }
          analysisCache.set(a.id, parsed)
        }
      }

      const thumbStmts: D1PreparedStatement[] = []
      for (const row of cardsForThumb) {
        const analysisId = row.ai_analysis_id as number
        const groupIndex = row.ai_group_index as number
        const groups = analysisCache.get(analysisId) || []
        // 음수 ai_group_index = "파일 전체"(-1 전체문서 · -3 완성본 passthrough) → 첫 그룹 썸네일
        const matchedGroup = resolveGroupByAiIndex(groups, groupIndex)

        if (matchedGroup?.thumbnail_r2_key) {
          // R2 이관: 그룹 썸네일이 R2에 있으면 카드엔 마커('r2:thumb:')만 저장(D1 누적 차단)
          thumbStmts.push(c.env.DB.prepare(
            'UPDATE cards SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(thumbRef(matchedGroup.thumbnail_r2_key), row.card_id))
        } else if (matchedGroup?.thumbnail_base64) {
          // 레거시(미이관) 폴백: base64 → data URI 저장
          const thumbnailUrl = `data:image/png;base64,${matchedGroup.thumbnail_base64}`
          thumbStmts.push(c.env.DB.prepare(
            'UPDATE cards SET thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(thumbnailUrl, row.card_id))
        }
      }
      for (let i = 0; i < thumbStmts.length; i += 80) {
        await c.env.DB.batch(thumbStmts.slice(i, i + 80))
      }
    } catch (_thumbErr) {
      // Thumbnail extraction failure must not break order creation
    }

    // ── D. 자동가공: ai_analysis_id가 있으면 auto_process_jobs 자동 생성 ──
    let autoProcessStarted = false
    if (aiAnalysisId) {
      try {
        const analysis = await c.env.DB.prepare(
          `SELECT id, file_path, groups_json FROM ai_analysis_requests WHERE id = ?`
        ).bind(aiAnalysisId).first<{ id: number; file_path: string; groups_json: string | null }>()
        if (analysis?.groups_json) {
          const groups = JSON.parse(analysis.groups_json || '[]')
          const { results: postOrderItems } = await c.env.DB.prepare(
            `SELECT id, order_id, item_id, item_name, category_name,
                    width, height, quantity, unit, unit_price, amount, vat_included,
                    post_processing, content, sort_order, parent_item_id,
                    scale_factor, finishing,
                    ai_group_index, ai_analysis_id
             FROM order_items WHERE order_id = ? AND ai_analysis_id IS NOT NULL ORDER BY sort_order ASC`
          ).bind(orderId).all()
          const aiItems = postOrderItems

          // sheet_layout 주문은 orders.sheet_layout_params에 저장됨
          // → C#의 ProcessOrderAsync에서 처리 (auto_process_jobs 불필요)
          // 여기서는 개별 자동가공 job만 생성 (기존 로직)
          {
          const SCALE_RULES: Record<string, number> = {
            '현수막': 5, '게시대': 5, '게릴라': 5, '솔벤현수막': 5,
            '패트': 1, '솔벤시트': 1, '합성지': 1, '포맥스': 1,
            'UV': 1, '클리어필름': 1, '간판': 1,
          }
          const MARGIN_RULES: Record<string, { w: number; h: number }> = {
            '미싱': { w: 83, h: 0 }, '사방접어미싱': { w: 61, h: 61 },
            '접어미싱': { w: 34, h: 0 }, '봉미싱': { w: 0, h: 55 },
            '밴드미싱': { w: 2, h: 0 }, '사방미싱': { w: 2, h: 0 },
            '열재단': { w: 14, h: 0 }, '재단만': { w: 0, h: 0 },
          }
          function _getScale(product: string, widthCm: number): number {
            const base = SCALE_RULES[product] ?? 5
            if (['현수막', '게시대', '솔벤현수막', '게릴라'].includes(product)) {
              if (widthCm > 300) return 5
              if (widthCm > 150) return 2
            }
            return base
          }
          function _getMargins(finishing: string): { w: number; h: number } {
            if (!finishing) return { w: 0, h: 0 }
            if (MARGIN_RULES[finishing]) return MARGIN_RULES[finishing]
            for (const k of Object.keys(MARGIN_RULES).sort((a, b) => b.length - a.length)) {
              if (finishing.includes(k)) return MARGIN_RULES[k]
            }
            return { w: 0, h: 0 }
          }

          // N+1 제거: 품목명을 IN(...)으로 일괄 선조회 후 INSERT는 db.batch로 묶음
          const aiItemIds = [...new Set((aiItems as any[]).map((oi) => oi.item_id as number).filter((v) => v != null))]
          const itemNameMap = new Map<number, string>()
          if (aiItemIds.length > 0) {
            const iph = aiItemIds.map(() => '?').join(',')
            const { results: nameRows } = await c.env.DB.prepare(
              `SELECT id, item_name FROM items WHERE id IN (${iph})`
            ).bind(...aiItemIds).all<{ id: number; item_name: string }>()
            for (const nr of nameRows) itemNameMap.set(nr.id, nr.item_name)
          }

          const jobStmts: D1PreparedStatement[] = []
          for (const oi of aiItems) {
            const gIdx = (oi.ai_group_index as number) ?? 0
            const group = groups[gIdx]
            if (!group) continue

            const finishing = (oi.finishing as string) || ''
            const productName = itemNameMap.get(oi.item_id as number) || ''
            const scale = (oi.scale_factor as number) || _getScale(productName, (oi.width as number) || 0)
            const margins = _getMargins(finishing)
            const mL = margins.w / 10.0 / scale, mR = margins.w / 10.0 / scale
            const mT = margins.h > 0 ? margins.h / 10.0 / scale : 0
            const mB = margins.h > 0 ? margins.h / 10.0 / scale : 0
            const clipBounds = group.bounds_mm || null
            const ts = Date.now()
            const outputDir = 'Z:\\Designs\\IllustratorAutomat\\_auto_output'
            const srcBase = (analysis.file_path || 'output').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'output'

            const iaParams = {
              mode: 'process', source: analysis.file_path, output: outputDir,
              epsOutput: `${outputDir}\\${srcBase}_g${gIdx}_${ts}.eps`,
              pngOutput: `${outputDir}\\${srcBase}_g${gIdx}_${ts}.png`,
              marginL: mL, marginR: mR, marginT: mT, marginB: mB,
              thumbSize: 300, scaleFactor: scale, clipBounds,
            }

            jobStmts.push(c.env.DB.prepare(
              `INSERT INTO auto_process_jobs
               (order_id, order_item_id, ai_analysis_id, ai_group_index,
                source_path, product, width_cm, height_cm, finishing,
                scale_factor, clip_bounds, margins, status, ia_params, entity_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
            ).bind(
              orderId, oi.id as number, aiAnalysisId, gIdx,
              analysis.file_path, productName, (oi.width as number) || 0, (oi.height as number) || 0, finishing,
              scale, JSON.stringify(clipBounds),
              JSON.stringify({ L: mL, R: mR, T: mT, B: mB }),
              JSON.stringify(iaParams),
              billingEntityId // #entity정합: 주문행과 동일 법인 (코디 타법인 접수 대응)
            ))
          }
          for (let i = 0; i < jobStmts.length; i += 80) {
            await c.env.DB.batch(jobStmts.slice(i, i + 80))
          }
          if (aiItems.length > 0) autoProcessStarted = true
          }
        }
      } catch (_autoErr) {
        // 자동가공 실패가 주문 생성을 방해하면 안 됨
        console.error('Auto-process job creation error:', _autoErr)
      }
    }

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'CREATE', entityType: 'ORDER', entityId: orderId,
      entityLabel: orderNumber, details: null,
      actorEntityId: getEntityId(c)
    })

    // Phase 5: 주문 생성 시 CONFIRMED이면 자재 부족 경고
    let materialWarnings: any[] = []
    if (initialStatus === 'CONFIRMED') {
      try {
        materialWarnings = await checkMaterialShortage(c.env.DB, orderId, getEntityId(c) || 1)
      } catch (mErr) {
        console.error('Material shortage check failed (non-blocking):', mErr)
      }
    }

    return c.json({
      success: true,
      data: {
        id: orderId,
        order_number: orderNumber
      },
      message: `Order created successfully. ${cardsGenerated} card(s) generated.${autoProcessStarted ? ' 자동가공이 시작되었습니다.' : ''}`,
      ...(materialWarnings.length > 0 && {
        material_warnings: materialWarnings,
        warning_message: `자재 부족 ${materialWarnings.length}건: ${materialWarnings.slice(0, 3).map((w: any) => w.material_name).join(', ')}${materialWarnings.length > 3 ? ' 외' : ''}`,
      }),
    })
  } catch (error) {
    console.error('Order creation error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── POST /:id/items — 기존 주문에 품목 라인 추가 (ia-editor append) ──
// 신규 주문 생성 대신 기존 주문에 ia-editor 산출 라인만 끼워넣는다.
//  · 기존 품목/카드/생산은 건드리지 않음 — 신규 라인만 INSERT → 신규 라인만 카드 생성(itemIdsFilter).
//  · 가드: 주문 소유 법인(entityFilter) + 상태 '출력완료(PRINT_DONE)'까지만 허용.
//          차단: SHIPPED/COMPLETED/CANCELLED/QUOTATION/DRAFT.
//  · 청구: recalcOrderBillingGroups(동결 그룹 보존) — 이미 BILLED면 신규 라인은 미청구/별도 청구(경고 반환).
//  · 가공: ai_file_path → AI_PROCESS task, ai_analysis_id 보유 라인 → auto_process_jobs(에이전트 폴링 큐).
ordersCreateRouter.post('/:id/items', async (c) => {
  try {
    const user = c.get('user')
    const orderId = parseInt(c.req.param('id'), 10)
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return c.json({ success: false, error: '잘못된 주문 ID입니다.' }, 400)
    }
    const body = await c.req.json()
    const items: any[] = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) {
      return c.json({ success: false, error: '추가할 품목이 없습니다.' }, 400)
    }

    // 주문 조회 + 소유 법인 검증 (ADMIN entity=0이면 무필터)
    const efOrd = entityFilter(c, 'orders')
    const order = await c.env.DB.prepare(
      `SELECT id, order_number, client_id, status, billing_status, delivery_date, priority, notes, order_type, entity_id
       FROM orders WHERE id = ?${efOrd.clause}`
    ).bind(orderId, ...efOrd.params).first<{
      id: number; order_number: string; client_id: number; status: string; billing_status: string | null
      delivery_date: string | null; priority: string | null; notes: string | null; order_type: string | null; entity_id: number
    }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    // 상태 가드: 출력완료(PRINT_DONE)까지만
    const APPENDABLE = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'HOLD']
    if (!APPENDABLE.includes(order.status)) {
      const label = ORDER_STATUS_LABELS[order.status] || order.status
      return c.json({ success: false, error: `'${label}' 상태 주문에는 품목을 추가할 수 없습니다 (출력완료까지만 허용).` }, 409)
    }

    const billingEntityId = Number(order.entity_id) || (getEntityId(c) || 1)

    // pricing_method + vat rate
    const itemIdsForPricing = [...new Set(items.map((it) => it.item_id).filter((v) => v != null))] as number[]
    const pricingMethodMap = new Map<number, string>()
    if (itemIdsForPricing.length > 0) {
      const ph = itemIdsForPricing.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(`SELECT id, pricing_method FROM items WHERE id IN (${ph})`).bind(...itemIdsForPricing).all()
      for (const r of results) pricingMethodMap.set(r.id as number, (r.pricing_method as string) || 'FIXED')
    }
    const vatRow = await c.env.DB.prepare(`SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`).first<{ setting_value: string }>()
    const vatRate = vatRow ? parseFloat(vatRow.setting_value) : 0.10

    // 품목명/카테고리/단위 누락분 일괄 조회
    const lookupIds = [...new Set(items.filter((it) => it.item_id && !it.item_name).map((it) => it.item_id))] as number[]
    const nameMap = new Map<number, { item_name: string; category: string; unit: string }>()
    if (lookupIds.length > 0) {
      const ph = lookupIds.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(`SELECT id, item_name, category, unit FROM items WHERE id IN (${ph})`).bind(...lookupIds).all<{ id: number; item_name: string; category: string; unit: string }>()
      for (const r of results) nameMap.set(r.id, { item_name: r.item_name, category: r.category, unit: r.unit })
    }

    // 신규 라인 sort_order는 기존 최대값 뒤로
    const maxSort = await c.env.DB.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM order_items WHERE order_id = ?`).bind(orderId).first<{ m: number }>()
    let sortOrder = (maxSort?.m ?? -1) + 1

    // 라인 INSERT (ia-editor 라인은 flat — parent/child 없음). 금액 계산은 create와 동일(AREA 10cm올림·100원 반올림·PENDING 0)
    let totalDelta = 0, vatDelta = 0
    const insertStmts: ReturnType<typeof c.env.DB.prepare>[] = []
    for (const item of items) {
      const lookup = item.item_id ? nameMap.get(item.item_id) : undefined
      const itemName = item.item_name || lookup?.item_name || 'Unknown'
      const categoryName = item.category_name || lookup?.category || null
      const unit = item.unit || lookup?.unit || 'EA'
      const pm = item.item_id ? (pricingMethodMap.get(item.item_id) || 'FIXED') : 'FIXED'
      const w = item.width_mm || item.width || 0
      const h = item.height_mm || item.height || 0
      const isPending = item.price_status === 'PENDING'
      let amount: number
      if (pm === 'AREA' && w > 0 && h > 0) {
        amount = (item.unit_price || 0) * (Math.ceil(w / 10) * 10 / 100) * (Math.ceil(h / 10) * 10 / 100) * (item.quantity || 1)
      } else {
        amount = (item.unit_price || 0) * (item.quantity || 1)
      }
      amount = Math.round(amount / 100) * 100
      const vatIncluded = item.vat_included !== undefined ? (item.vat_included ? 1 : 0) : 1
      if (!isPending) {
        totalDelta += amount
        if (vatIncluded) vatDelta += amount * vatRate
      }
      const assignedEntity = (item.assigned_entity_id !== undefined && item.assigned_entity_id !== null)
        ? item.assigned_entity_id
        : recommendAssignedEntity({ ...item, category_name: categoryName }, billingEntityId)
      const assignmentStatus = assignedEntity ? (item.assignment_status || 'PENDING') : null
      insertStmts.push(c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          ai_group_index, scale_factor, ai_analysis_id, parent_item_id, finishing, price_status,
          assigned_entity_id, assignment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `).bind(
        orderId, item.item_id || null, itemName, categoryName,
        item.width_mm || item.width || null, item.height_mm || item.height || null,
        item.quantity || 1, unit,
        isPending ? 0 : (item.unit_price || 0), isPending ? 0 : amount, vatIncluded,
        item.post_processing || null, item.content || null, item.specification || null, sortOrder++,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.scale_factor || 1, item.ai_analysis_id || null, item.finishing || null, item.price_status || 'CONFIRMED',
        assignedEntity, assignmentStatus
      ))
    }

    const insertResults = await c.env.DB.batch(insertStmts)
    const newItemIds = insertResults.map((r) => r.meta.last_row_id as number)

    // 주문 합계 갱신 (delta — discount 불변)
    const totalDeltaR = Math.round(totalDelta)
    const vatDeltaR = Math.round(vatDelta)
    await c.env.DB.prepare(
      `UPDATE orders SET total_amount = COALESCE(total_amount,0) + ?, vat_amount = COALESCE(vat_amount,0) + ?, final_amount = COALESCE(final_amount,0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(totalDeltaR, vatDeltaR, totalDeltaR + vatDeltaR, orderId).run()

    // 청구그룹 재계산 (BILLED/PAID 동결 그룹 보존)
    await recalcOrderBillingGroups(c.env.DB, orderId)

    // 신규 라인만 카드 생성 (DISTRIBUTION은 카드 미생성·shipment_ready)
    let cardsGenerated = 0
    if ((order.order_type || 'PRODUCTION') === 'DISTRIBUTION') {
      const ph = newItemIds.map(() => '?').join(',')
      await c.env.DB.prepare(`UPDATE order_items SET shipment_ready = 1 WHERE id IN (${ph})`).bind(...newItemIds).run()
    } else {
      cardsGenerated = await generateCardsForOrder({
        db: c.env.DB, orderId, orderNumber: order.order_number, clientId: order.client_id,
        deliveryDate: order.delivery_date, priority: order.priority || 'NORMAL', notes: order.notes,
        entityId: billingEntityId, itemIdsFilter: newItemIds,
      })
    }

    // order_ai_files append (file_path 중복 제거)
    const aiFiles: Array<{ file_path: string; analysis_id?: number }> = Array.isArray(body.ai_files) ? body.ai_files : []
    if (aiFiles.length > 0) {
      const { results: existingAf } = await c.env.DB.prepare(`SELECT file_path FROM order_ai_files WHERE order_id = ?`).bind(orderId).all<{ file_path: string }>()
      const seen = new Set((existingAf || []).map((r) => r.file_path))
      const maxAfSort = await c.env.DB.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM order_ai_files WHERE order_id = ?`).bind(orderId).first<{ m: number }>()
      let afSort = (maxAfSort?.m ?? -1) + 1
      const afStmts = aiFiles.filter((af) => af.file_path && !seen.has(af.file_path)).map((af) =>
        c.env.DB.prepare(`INSERT INTO order_ai_files (order_id, file_path, file_name, analysis_id, sort_order, entity_id) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(orderId, af.file_path, (af.file_path || '').split(/[/\\]/).pop() || null, af.analysis_id || null, afSort++, billingEntityId)
      )
      if (afStmts.length > 0) await c.env.DB.batch(afStmts)
    }

    // 출력완료 주문에 신규 미출력 카드 추가 → '출력중'으로 되돌려 상태 정합 유지
    if (cardsGenerated > 0 && order.status === 'PRINT_DONE') {
      await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE orders SET status = 'PRINTING', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(orderId),
        c.env.DB.prepare(`INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason) VALUES (?, 'PRINT_DONE', 'PRINTING', ?, ?)`).bind(orderId, user?.id || null, '라인 추가로 재출력 필요'),
      ])
    }

    // AI_PROCESS task (전체 주문 파일 가공 — create와 동일)
    const aiFilePath: string | null = body.ai_file_path || null
    if (aiFilePath) {
      try {
        await c.env.DB.prepare(`INSERT INTO tasks (type, status, order_id, input_payload, created_by, entity_id) VALUES ('AI_PROCESS', 'PENDING', ?, ?, ?, ?)`)
          .bind(orderId, JSON.stringify({ order_number: order.order_number, ai_file_path: aiFilePath, ai_analysis_id: body.ai_analysis_id ?? null, append_item_ids: newItemIds }), user?.id || null, billingEntityId).run()
      } catch (taskErr) { console.error('append AI_PROCESS enqueue failed:', taskErr) }
    }

    // auto_process_jobs (신규 라인만 — 에이전트 폴링 큐). 라인별 자기 ai_analysis_id 사용.
    let autoProcessStarted = false
    try {
      const created = await enqueueAutoProcessJobsForItems(c.env.DB, orderId, newItemIds, body.ai_analysis_id || null, billingEntityId)
      if (created > 0) autoProcessStarted = true
    } catch (apErr) { console.error('append auto_process_jobs failed:', apErr) }

    await logActivity({
      db: c.env.DB, userId: user?.id, userName: user?.username,
      action: 'UPDATE', entityType: 'ORDER', entityId: orderId,
      entityLabel: order.order_number, details: `라인 ${newItemIds.length}건 추가`,
      actorEntityId: getEntityId(c)
    })

    const warning = (order.billing_status === 'BILLED' || order.billing_status === 'PAID')
      ? '이미 청구된 주문입니다. 추가된 라인은 별도 청구가 필요합니다.' : null
    return c.json({
      success: true,
      data: { order_id: orderId, order_number: order.order_number, added: newItemIds.length, cards_generated: cardsGenerated },
      message: `${order.order_number}에 ${newItemIds.length}개 라인 추가 (카드 ${cardsGenerated}건${autoProcessStarted ? ', 자동가공 시작' : ''}).`,
      ...(warning && { warning }),
    })
  } catch (error) {
    console.error('Order append items error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default ordersCreateRouter
