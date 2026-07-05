import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order, OrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { sendEmail } from '../../services/emailProvider'
import { getEntityId, entityFilter, orderVisibilityFilter } from '../../utils/entityFilter'
import { deductStockLinesOnShip } from '../../utils/stockShip'
import { ensureShipmentForOrder } from '../../utils/shipmentHelper'

const ordersQueriesRouter = new Hono<HonoEnv>()
ordersQueriesRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

ordersQueriesRouter.get('/quotations/expired', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { results } = await c.env.DB.prepare(`
      SELECT
        o.*,
        c.client_name,
        u.name as created_by_name,
        1 as is_expired
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.status = 'QUOTATION'
        AND o.valid_until IS NOT NULL
        AND o.valid_until < ?${entityFilter(c, 'o').clause}
      ORDER BY o.valid_until ASC
    `).bind(today, ...entityFilter(c, 'o').params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 접수 시점 합배송 후보: 같은 거래처의 미출고 활성 주문 (납품일 무관) — 배송 후속 P1
// ⚠️ entityFilter 의도적 미적용(최소 필드 cross-entity): 같은 거래처 타법인 주문과의
//    합배송 판단이 목적 (shipments consolidation-candidates와 동일 취지의 명시적 예외).
//    게이트 = 주문 접수 권한(라우터 공통 requireAnyPagePermission('/orders','/cards')).
ordersQueriesRouter.get('/unshipped-by-client', async (c) => {
  try {
    const clientId = parseInt(c.req.query('client_id') || '')
    const excludeOrderId = parseInt(c.req.query('exclude_order_id') || '') || 0
    if (!clientId) {
      return c.json({ success: false, error: 'client_id가 필요합니다.' }, 400)
    }
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.status, o.billing_status,
             o.consolidate_with_order_id,
             COALESCE(en.short_name, en.name) as entity_name,
             (SELECT item_name FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_name,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0)) as item_count
      FROM orders o
      LEFT JOIN entities en ON en.id = o.entity_id
      WHERE o.client_id = ?
        AND o.status NOT IN ('CANCELLED', 'DELETED', 'DRAFT', 'QUOTATION', 'COMPLETED')
        AND o.shipped_at IS NULL
        AND o.id != ?
      ORDER BY o.delivery_date ASC, o.id DESC
      LIMIT 20
    `).bind(clientId, excludeOrderId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('orders unshipped-by-client error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get order statistics (must be before /:id to avoid route conflict)
ordersQueriesRouter.get('/stats', async (c) => {
  try {
    // 주문 가시성 필터 (목록과 일치): 소유(청구) + 담당 품목 보유 법인. EXISTS 상관 위해 alias 'o' 필수.
    const ef = orderVisibilityFilter(c, 'o')
    const statsQuery = ef.params.length > 0
      ? `SELECT o.status AS status, COUNT(*) as count FROM orders o WHERE 1=1${ef.clause} GROUP BY o.status`
      : `SELECT status, COUNT(*) as count FROM orders GROUP BY status`
    const { results } = ef.params.length > 0
      ? await c.env.DB.prepare(statsQuery).bind(...ef.params).all()
      : await c.env.DB.prepare(statsQuery).all()

    const stats: Record<string, number> = { total: 0 }
    for (const row of results as Array<{ status: string; count: number }>) {
      stats[row.status] = row.count
      stats.total += row.count
    }

    return c.json({ success: true, data: stats })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get post-processing options (must be before /:id to avoid route conflict)
ordersQueriesRouter.get('/options/post-processing', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, option_code, option_name, margin_left, margin_right, margin_top, margin_bottom, additional_cost, description, pp_category, parameter_schema, pricing_type, unit_price, display_on_card, is_active FROM post_processing_options WHERE is_active = 1 ORDER BY option_name ASC
    `).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/orders/ready-to-ship - 출고 대기 주문 목록
ordersQueriesRouter.get('/ready-to-ship', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.notes, o.status,
             c.id as client_id, c.client_name,
             COUNT(cards.id) as card_count,
             GROUP_CONCAT(DISTINCT oi.item_name) as item_names,
             CAST(SUM(oi.quantity) AS INTEGER) as total_quantity
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.parent_item_id IS NULL
      JOIN cards ON cards.order_id = o.id
      WHERE o.status NOT IN ('SHIPPED', 'CANCELLED')${entityFilter(c, 'o').clause}
      GROUP BY o.id
      HAVING COUNT(cards.id) > 0
         AND COUNT(cards.id) = SUM(CASE WHEN cards.status = 'PRINT_DONE' THEN 1 ELSE 0 END)
      ORDER BY o.delivery_date ASC
    `).bind(...entityFilter(c, 'o').params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /api/orders/bulk-bill - 일괄 경리 확인 (MANAGER+)
// Phase 1.1: receipt_type 추가 (TAX_INVOICE | CASH_RECEIPT | CARD | SIMPLE)
ordersQueriesRouter.patch('/bulk-bill', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    // 클라가 카멜케이스(orderIds/receiptType) 또는 스네이크(order_ids/receipt_type) 둘 다 보낼 수 있음
    const body = await c.req.json<Record<string, unknown>>()
    const order_ids: number[] = (body.order_ids || body.orderIds || []) as number[]
    const receipt_type: string | undefined = (body.receipt_type || body.receiptType) as string | undefined
    // 회계반영일 override(선택): 미지정 시 billable_after→delivery_date→KST오늘 폴백 (예: 출고 6/30→7월 이월)
    const accounting_date: string | null = ((body.accounting_date || body.accountingDate) as string | undefined)?.substring(0, 10) || null

    if (!order_ids || order_ids.length === 0) {
      return c.json({ success: false, error: 'order_ids is required' }, 400)
    }

    // 증빙 유형 검증 (선택 입력이지만 들어오면 화이트리스트만 허용)
    const validReceiptTypes = ['TAX_INVOICE', 'CASH_RECEIPT', 'CARD', 'SIMPLE']
    if (receipt_type && !validReceiptTypes.includes(receipt_type)) {
      return c.json({ success: false, error: '잘못된 증빙 유형입니다.' }, 400)
    }
    const normalizedReceiptType = receipt_type || null

    let billedCount = 0

    // N+1 제거: 주문 일괄 조회 후 BILLED + balance UPDATE를 batch로 묶음 (청크 80, 짝수라 주문쌍 분할 없음 → 주문별 원자성 보존)
    // #458: D1 바인드 한도(100) — 선행 SELECT IN절도 80청크 분할 (write batch는 이미 80청크)
    const billOrderMap = new Map<number, { id: number; status: string; client_id: number; final_amount: number; billing_status: string }>()
    for (let i = 0; i < order_ids.length; i += 80) {
      const chunk = order_ids.slice(i, i + 80)
      const billPh = chunk.map(() => '?').join(',')
      const { results: billOrderRows } = await c.env.DB.prepare(
        `SELECT id, status, client_id, final_amount, billing_status FROM orders WHERE id IN (${billPh})`
      ).bind(...chunk).all<{ id: number; status: string; client_id: number; final_amount: number; billing_status: string }>()
      for (const o of billOrderRows) billOrderMap.set(o.id, o)
    }

    const billStmts: D1PreparedStatement[] = []
    for (const orderId of order_ids) {
      const order = billOrderMap.get(orderId)
      if (!order || order.status !== 'SHIPPED') continue
      if (order.billing_status === 'BILLED') continue

      const billedAmount = Number(order.final_amount) || 0

      // split billing P3: 그룹 BILLED + orders 미러 (balance 캐시 미사용 — 미수금 파생). 각 주문당 2문.
      // 가드: NULL(청구 전 정상)도 매칭하도록 IS NOT 사용 (`!= 'BILLED'`는 NULL 미매칭 버그). 청크 80=짝수라 주문쌍 분할 없음.
      billStmts.push(c.env.DB.prepare(`
          UPDATE order_billing_groups SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?,
              accounting_date = COALESCE(?, (SELECT COALESCE(o.billable_after, o.delivery_date) FROM orders o WHERE o.id = order_billing_groups.order_id), date('now','+9 hours'))
          WHERE order_id = ? AND billing_status IS NOT 'BILLED' AND billing_status IS NOT 'PAID'
        `).bind(user?.id || null, accounting_date, orderId))
      billStmts.push(c.env.DB.prepare(`
          UPDATE orders
          SET billing_status = 'BILLED',
              billed_at = CURRENT_TIMESTAMP,
              billed_by = ?,
              billed_amount = ?,
              accounting_date = COALESCE(?, billable_after, delivery_date, date('now','+9 hours')),
              receipt_type = COALESCE(?, receipt_type),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND billing_status IS NOT 'BILLED'
        `).bind(user?.id || null, billedAmount, accounting_date, normalizedReceiptType, orderId))

      order.billing_status = 'BILLED'  // 동일 요청 내 중복 orderId 재처리 방지 (순차 동작 보존)
      billedCount++
    }
    for (let i = 0; i < billStmts.length; i += 80) {
      await c.env.DB.batch(billStmts.slice(i, i + 80))
    }

    return c.json({ success: true, data: { billed: billedCount } })
  } catch (error) {
    console.error('Bulk bill error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// PATCH /api/orders/bulk-ship - 일괄 출고완료 처리
// #IDOR: 단건 ship(shipments.ts:1038)·bulk-bill(:158)과 동일하게 ADMIN/MANAGER 전용 + entityFilter(자법인만)
ordersQueriesRouter.patch('/bulk-ship', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const { order_ids } = await c.req.json<{ order_ids: number[] }>()
    if (!order_ids || order_ids.length === 0) {
      return c.json({ success: false, error: 'order_ids is required' }, 400)
    }

    const results: { id: number; success: boolean; error?: string; shipped_cards?: number; order_shipped?: boolean; remaining?: number; unshipped_cards?: { id: number; card_number: string; status: string }[] }[] = []

    // N+1 제거: 읽기전용 주문 메타(delivery_method/order_type/entity_id) 일괄 선조회.
    //   (미사용 dead COUNT 쿼리도 제거 — 값 미참조·COUNT는 항상 row 반환이라 !check 미발동)
    //   카드 출고 UPDATE→remaining 확인→deductStockLinesOnShip→상태전이는 read-after-write 순차의존이라 batch 불가, 유지.
    // #458: D1 바인드 한도(100) — 선행 SELECT IN절 80청크 분할 (cards #409 패턴)
    const orderInfoMap = new Map<number, { delivery_method: string | null; order_type: string | null; entity_id: number | null }>()
    // #IDOR: entityFilter로 자법인 주문만 map에 적재 → 아래 루프에서 map 부재 시 skip(타 법인 카드 출고 차단)
    const shipEf = entityFilter(c)
    for (let i = 0; i < order_ids.length; i += 80) {
      const chunk = order_ids.slice(i, i + 80)
      const shipPh = chunk.map(() => '?').join(',')
      const { results: orderInfoRows } = await c.env.DB.prepare(
        `SELECT id, delivery_method, order_type, entity_id FROM orders WHERE id IN (${shipPh})${shipEf.clause}`
      ).bind(...chunk, ...shipEf.params).all<{ id: number; delivery_method: string | null; order_type: string | null; entity_id: number | null }>()
      for (const o of orderInfoRows) orderInfoMap.set(o.id, o)
    }

    for (const orderId of order_ids) {
      // #IDOR: 선조회(entityFilter 적용)에 없으면 타 법인/미존재 주문 → 카드 출고 없이 skip
      const orderInfo = orderInfoMap.get(orderId)
      if (!orderInfo) {
        results.push({ id: orderId, success: false, error: '대상 주문이 없거나 접근 권한이 없습니다.' })
        continue
      }
      // 카드 출고 + 주문 상태 전환 (per-order 순차 처리)
      // Step 0 (v2 하드 게이트): 부분출고 전면 금지 — 미완성(미출고·PRINT_DONE 미달) 카드가
      // 하나라도 있으면 이 주문은 카드 스탬프 없이 전체 차단. (기존: 완성분만 조용히 부분출고 → 잔여 잊힘 사고 원인)
      const { results: notReadyCards } = await c.env.DB.prepare(`
        SELECT id, card_number, status FROM cards
        WHERE order_id = ? AND shipped_at IS NULL AND status != 'PRINT_DONE'
      `).bind(orderId).all<{ id: number; card_number: string; status: string }>()
      if (notReadyCards.length > 0) {
        results.push({
          id: orderId, success: false,
          error: `미완성 카드 ${notReadyCards.length}건 — 전량 출고 원칙에 따라 출고할 수 없습니다.`,
          remaining: notReadyCards.length,
          unshipped_cards: notReadyCards.map((cd) => ({ id: cd.id, card_number: cd.card_number, status: cd.status })),
        })
        continue
      }

      // Step 1: 카드 출고 처리
      const updateResult = await c.env.DB.prepare(`
        UPDATE cards SET shipped_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status = 'PRINT_DONE' AND shipped_at IS NULL
      `).bind(orderId).run()
      const shippedCards = updateResult.meta.changes ?? 0

      // Step 2: 출고 후 전체 카드 확인 → 모두 출고면 auto_complete_date 설정 (동기화 시 SHIPPED 전이)
      const method = (orderInfo.delivery_method || '').trim()

      // 모든 카드 출고 완료 확인
      const afterCheck = await c.env.DB.prepare(`
        SELECT COUNT(*) as remaining FROM cards WHERE order_id = ? AND shipped_at IS NULL
      `).bind(orderId).first<{ remaining: number }>()
      const allShipped = (afterCheck?.remaining || 0) === 0

      if (allShipped) {
        // 기성품/유통(production_required=0) 라인 재고 차감 — order_type 무관, 혼합주문 기성 라인 포함 (Phase 3)
        const orderEntityId = (orderInfo as any)?.entity_id || getEntityId(c) || 1
        await deductStockLinesOnShip(c.env.DB, Number(orderId), orderEntityId)
        const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵' || method.toUpperCase() === 'PICKUP'
        const delayDays = isQuick ? 1 : 2
        // #1: 출고처리 즉시 SHIPPED 전이 (지연 sync 의존 제거 — 유통/기성 주문이 출고처리 후 바로 출고완료로 표시).
        //   청구 타이밍 보존: 기존 2단 지연(출고→완료 delayDays + 완료→청구 delayDays)의 총합을 billable_after에 반영.
        //   auto_complete_date는 호환 위해 오늘로 설정(이미 도래 처리). 미수금/회계 전이 시점 불변.
        const fromRow = await c.env.DB.prepare(`SELECT status FROM orders WHERE id = ?`).bind(orderId).first<{ status: string }>()
        const fromStatus = fromRow?.status || 'CONFIRMED'
        let orderShipped = false
        if (fromStatus !== 'SHIPPED' && fromStatus !== 'CANCELLED') {
          const upd = await c.env.DB.prepare(
            `UPDATE orders SET status = 'SHIPPED', updated_at = datetime('now'),
               shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP),
               billable_after = date('now', '+9 hours', '+' || ? || ' days'),
               auto_complete_date = COALESCE(auto_complete_date, date('now', '+9 hours'))
             WHERE id = ? AND status = ?`
          ).bind(delayDays * 2, orderId, fromStatus).run()
          orderShipped = (upd.meta.changes ?? 0) > 0
          if (orderShipped) {
            await c.env.DB.prepare(
              `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
               VALUES (?, ?, 'SHIPPED', ?, '출고처리 즉시 전이')`
            ).bind(orderId, fromStatus, user?.id || null).run()
          }
        }
        // P1 출고 정합화: 출고확정 시 shipment 레코드 일원 생성 (파생 레코드 — 실패해도 출고는 유지)
        try {
          await ensureShipmentForOrder(c.env.DB, Number(orderId), { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1 })
        } catch (shipRecErr) {
          console.error('bulk-ship ensureShipment error:', shipRecErr)
        }
        results.push({ id: orderId, success: true, shipped_cards: shippedCards, order_shipped: orderShipped || fromStatus === 'SHIPPED' })
      } else {
        // v2: 부분출고 경로 제거 — 하드 게이트 통과 후 여기 도달은 경쟁 상황(게이트 이후 카드 추가 등)뿐.
        // 부분출고 shipment 기록을 만들지 않고 실패로 보고 (전량 출고 원칙).
        const { results: unshippedCards } = await c.env.DB.prepare(`
          SELECT id, card_number, status FROM cards WHERE order_id = ? AND shipped_at IS NULL
        `).bind(orderId).all<{ id: number; card_number: string; status: string }>()
        results.push({ id: orderId, success: false, shipped_cards: shippedCards, order_shipped: false,
          error: '미출고 카드가 남아 있어 출고를 완료하지 못했습니다. 새로고침 후 다시 시도하세요.',
          remaining: afterCheck?.remaining || 0,
          unshipped_cards: (unshippedCards || []).map((cd) => ({ id: cd.id, card_number: cd.card_number, status: cd.status }))
        })
      }
    }

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/orders/export/csv - CSV 다운로드
ordersQueriesRouter.get('/export/csv', async (c) => {
  try {
    const { status = '', search = '', sort = 'created_at_desc', date_from = '', date_to = '', exclude_status = '', priority = '' } = c.req.query()

    let query = `
      SELECT o.order_number, c.client_name, o.order_date, o.delivery_date,
        o.delivery_method, o.delivery_time, o.final_amount, o.status,
        o.billing_status, o.priority, o.contact_phone, o.notes,
        u.name as created_by_name, o.created_at
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
    `
    const params: any[] = []
    const whereClauses: string[] = []

    if (status) { whereClauses.push('o.status = ?'); params.push(status) }
    if (search) {
      whereClauses.push('(o.order_number LIKE ? OR c.client_name LIKE ?)')
      params.push(`%${search}%`, `%${search}%`)
    }
    if (date_from) { whereClauses.push('o.order_date >= ?'); params.push(date_from) }
    if (date_to) { whereClauses.push('o.order_date <= ?'); params.push(date_to) }
    if (exclude_status) {
      const excludes = exclude_status.split(',').map(s => s.trim()).filter(Boolean)
      if (excludes.length === 1) { whereClauses.push('o.status != ?'); params.push(excludes[0]) }
      else if (excludes.length > 1) { whereClauses.push(`o.status NOT IN (${excludes.map(() => '?').join(',')})`); params.push(...excludes) }
    }
    if (priority) { whereClauses.push('o.priority = ?'); params.push(priority) }

    if (whereClauses.length > 0) query += ' WHERE ' + whereClauses.join(' AND ')

    const sortOptions: Record<string, string> = {
      'created_at_desc': 'o.created_at DESC',
      'created_at_asc': 'o.created_at ASC',
      'delivery_date_asc': 'o.delivery_date ASC NULLS LAST',
      'final_amount_desc': 'o.final_amount DESC',
    }
    // LIMIT: 최대 5000, 기본 3000 — 메모리/타임아웃 방지
    const maxRows = Math.min(parseInt(c.req.query('limit') || '3000') || 3000, 5000)
    const orderBy = sortOptions[sort] || 'o.created_at DESC'
    query += ` ORDER BY ${orderBy} LIMIT ?`
    params.push(maxRows)

    const { results } = await c.env.DB.prepare(query).bind(...params).all<Record<string, unknown>>()

    const statusLabels: Record<string, string> = { CONFIRMED: '확정', PRINTING: '출력중', PRINT_DONE: '출력완료', SHIPPED: '출고완료', HOLD: '보류', CANCELLED: '취소' }
    const billingLabels: Record<string, string> = { BILLED: '회계반영', PAID: '수금완료' }

    const headers = ['주문번호', '거래처', '주문일', '납기일', '배송', '금액', '상태', '회계반영', '우선순위', '연락처', '비고', '작성자', '등록일']
    const rows = (results || []).map((o: any) => [
      o.order_number, o.client_name, o.order_date, o.delivery_date,
      (o.delivery_method || '') + (o.delivery_time ? ' ' + o.delivery_time : ''),
      o.final_amount, statusLabels[o.status] || o.status,
      billingLabels[o.billing_status] || '', o.priority === 'URGENT' ? '긴급' : '일반',
      o.contact_phone, o.notes, o.created_by_name,
      o.created_at ? new Date(o.created_at).toLocaleDateString('ko-KR') : ''
    ])

    // 스트리밍 CSV 응답 — 대량 데이터 시 메모리 2배 사용 방지
    const { csvStreamResponse } = await import('../../utils/csv')
    const today = new Date().toISOString().slice(0, 10)
    return csvStreamResponse(`주문목록_${today}.csv`, headers, rows)
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/orders/:id/bill - 경리 확인 (MANAGER+)

export default ordersQueriesRouter
