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
import { buildOrderListFilter, resolveOrderSort, ORDER_SORT_DEFAULT } from './listFilter'
import { kstYmd, kstDate } from '../../utils/kstDate'
import { CONSOLIDATABLE_ORDER_STATUSES } from '../../utils/statusLabels'
import { deductStockLinesOnShip } from '../../utils/stockShip'
import { ensureShipmentForOrder } from '../../utils/shipmentHelper'
import { formatDeliveryTiming } from '../../utils/productionDeadline'   // 직배 배차 슬롯 표기
import { resolveGroupByAiIndex, getThumbnailDataUri, isThumbRef, type AnalysisGroup } from '../../utils/thumbnailStore'

const ordersQueriesRouter = new Hono<HonoEnv>()
ordersQueriesRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

// ── 주문서 담당자 후보 (2026-08-10) ──────────────────────────────────────────
// 담당자 컬럼은 `orders.sales_rep_id → employees.id` 지만, **고를 수 있는 사람**은
// 사용자 관리(users)의 역할로 정한다 — 주문을 치는 사람이 곧 담당이기 때문(용준님 결정).
//   ⚠️ employees 전원(재직 30여 명)을 뿌리던 것을 좁히는 변경이다. 좁히면 **과거 담당자**
//      (이관분의 정해선 등 MES 계정이 없는 영업)가 후보에서 빠지는데, 옵션에 없는 값을
//      select 에 넣으면 조용히 '' 가 되어 **수정 저장마다 담당자가 지워진다.**
//      → `include` 로 현재 담당자를 항상 합류시킨다(`is_current` 로 표시만 구분).
const ORDER_SALES_REP_ROLES = ['DESIGNER', 'ADMIN'] as const

ordersQueriesRouter.get('/sales-rep-options', async (c) => {
  try {
    const includeRaw = c.req.query('include')
    const includeId = includeRaw && !isNaN(parseInt(includeRaw)) ? parseInt(includeRaw) : null
    const rolePh = ORDER_SALES_REP_ROLES.map(() => '?').join(',')

    // 역할은 job_role 우선(확장 역할은 users.role CHECK 재빌드 불가라 job_role 에 저장 — types/roles.ts)
    const { results } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.department, e.position,
             COALESCE(u.job_role, u.role) AS role,
             0 AS is_current
      FROM employees e
      JOIN users u ON u.id = e.user_id
      WHERE e.is_deleted = 0 AND e.status = 'ACTIVE'
        AND u.is_active = 1
        AND COALESCE(u.job_role, u.role) IN (${rolePh})
      ORDER BY e.name COLLATE NOCASE ASC, e.id ASC
    `).bind(...ORDER_SALES_REP_ROLES).all<{ id: number; name: string; department: string | null; position: string | null; role: string; is_current: number }>()

    const options = results || []
    if (includeId && !options.some((o) => o.id === includeId)) {
      const cur = await c.env.DB.prepare(
        `SELECT id, name, department, position, NULL AS role, 1 AS is_current
         FROM employees WHERE id = ? AND is_deleted = 0`
      ).bind(includeId).first<{ id: number; name: string; department: string | null; position: string | null; role: string | null; is_current: number }>()
      if (cur) options.unshift(cur as typeof options[number])
    }

    return c.json({ success: true, data: options })
  } catch (error) {
    console.error('orders sales-rep-options error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

ordersQueriesRouter.get('/quotations/expired', async (c) => {
  try {
    const today = kstYmd()
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
      ORDER BY o.valid_until ASC, o.id ASC
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
// ⚠️ 상태 조건은 **화이트리스트**여야 한다. 블랙리스트(NOT IN)였을 때 이관 주문
//    (status='SHIPPED' + shipped_at NULL) 8,653건이 전건 후보로 떠 접수 화면을 덮었다.
//    출고/완료 주문은 합배송 대상이 아니므로 진행 중 상태만 명시적으로 허용한다.
//    기간 제한(30일): 방치된 옛 미출고건이 후보 목록에 무한 누적되는 것 방지.
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
        AND o.status IN (${CONSOLIDATABLE_ORDER_STATUSES.map(() => '?').join(', ')})
        AND o.shipped_at IS NULL
        AND o.order_date >= ${kstDate("'-30 days'")}
        AND o.id != ?
      ORDER BY o.delivery_date ASC, o.id DESC
      LIMIT 20
    `).bind(clientId, ...CONSOLIDATABLE_ORDER_STATUSES, excludeOrderId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('orders unshipped-by-client error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get order statistics (must be before /:id to avoid route conflict)
/**
 * GET /api/orders/stats — 통계 카드 (목록과 같은 모집단)
 *
 * 목록과 동일한 조회조건(listFilter SSOT)을 적용하되 **status 만 제외**한다.
 * 카드 자체가 상태 선택 수단(드릴다운)이므로, 상태로 걸러버리면 선택한 카드 외 전부 0이 되어
 * 네비게이션이 불가능해진다. 따라서 카드 = "현재 검색·기간 스코프의 상태별 분포",
 * total = 그 분포의 합(= 상태 미선택 시 목록의 '총 N건'과 일치).
 * (이전에는 조건 없이 orders 전량을 세어 목록과 구조적으로 불일치했다 — 감사 G1)
 */
ordersQueriesRouter.get('/stats', async (c) => {
  try {
    const f = buildOrderListFilter(c, { skipStatus: true })
    const statsQuery = `SELECT o.status AS status, COUNT(*) as count
      FROM orders o LEFT JOIN clients c ON o.client_id = c.id${f.where}
      GROUP BY o.status`
    const { results } = await c.env.DB.prepare(statsQuery).bind(...f.params).all()

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
      SELECT id, option_code, option_name, margin_left, margin_right, margin_top, margin_bottom, additional_cost, description, pp_category, parameter_schema, pricing_type, unit_price, display_on_card, is_active FROM post_processing_options WHERE is_active = 1 ORDER BY option_name ASC, id ASC
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
      ORDER BY o.delivery_date ASC, o.id ASC
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
    // #527: entityFilter로 자법인 주문만 map에 적재 → 아래 루프에서 map 부재 시 skip(타 법인 주문 cross-tenant BILLED 차단). bulk-ship(:257) 형제 패턴.
    const billEf = entityFilter(c)
    for (let i = 0; i < order_ids.length; i += 80) {
      const chunk = order_ids.slice(i, i + 80)
      const billPh = chunk.map(() => '?').join(',')
      const { results: billOrderRows } = await c.env.DB.prepare(
        `SELECT id, status, client_id, final_amount, billing_status FROM orders WHERE id IN (${billPh})${billEf.clause}`
      ).bind(...chunk, ...billEf.params).all<{ id: number; status: string; client_id: number; final_amount: number; billing_status: string }>()
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
    const { sort = ORDER_SORT_DEFAULT } = c.req.query()

    let query = `
      SELECT o.order_number, c.client_name, o.order_date, o.delivery_date,
        o.delivery_method, o.delivery_time, o.delivery_slot, o.final_amount, o.status,
        o.billing_status, o.priority, o.contact_phone, o.notes,
        u.name as created_by_name, o.created_at
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
    `
    // 조회조건 = 목록과 동일한 listFilter SSOT.
    // 이전에는 이 경로에만 조건이 따로 적혀 있어 (a) 배송방법·회계상태·지연 필터가 무시되고
    // (b) 주문 가시성(법인) 필터가 통째로 빠져 타 법인 주문이 함께 내려갔다.
    const f = buildOrderListFilter(c)
    const params: any[] = [...f.params]
    query += f.where

    // #372: 캡 + 잘림 안내 — 발주·입고·발주요청과 같은 규칙(utils/csv.ts 단일 소스).
    //   이 경로만 스윕에서 빠져 기본 3,000건으로 **무고지 절단**하고 있었다.
    //   실측(2026-08-09): 전체 기간 주문 8,778건 → CSV 3,000건, 안내 없음, 5,778건 유실.
    //   캡+1 로 조회해 초과를 감지하고 마지막 줄에 안내를 넣는다.
    const { csvStreamResponse, CSV_EXPORT_CAP, CSV_TRUNCATION_NOTE } = await import('../../utils/csv')
    // 정렬 = listFilter.ts SSOT. 사본을 두면 목록에서 고른 정렬이 CSV 에서 조용히 기본값으로 떨어진다.
    const orderBy = resolveOrderSort(sort)
    query += ` ORDER BY ${orderBy} LIMIT ?`
    params.push(CSV_EXPORT_CAP + 1)

    const { results: fetched } = await c.env.DB.prepare(query).bind(...params).all<Record<string, unknown>>()
    const truncated = (fetched || []).length > CSV_EXPORT_CAP
    const results = truncated ? (fetched || []).slice(0, CSV_EXPORT_CAP) : (fetched || [])

    const statusLabels: Record<string, string> = { CONFIRMED: '확정', PRINTING: '출력중', PRINT_DONE: '출력완료', SHIPPED: '출고완료', HOLD: '보류', CANCELLED: '취소' }
    const billingLabels: Record<string, string> = { BILLED: '회계반영', PAID: '수금완료' }

    const headers = ['주문번호', '거래처', '주문일', '납기일', '배송', '금액', '상태', '회계반영', '우선순위', '연락처', '비고', '작성자', '등록일']
    const rows = (results || []).map((o: any) => [
      o.order_number, o.client_name, o.order_date, o.delivery_date,
      formatDeliveryTiming(o),
      o.final_amount, statusLabels[o.status] || o.status,
      billingLabels[o.billing_status] || '', o.priority === 'URGENT' ? '긴급' : '일반',
      o.contact_phone, o.notes, o.created_by_name,
      o.created_at ? new Date(o.created_at).toLocaleDateString('ko-KR') : ''
    ])

    // 스트리밍 CSV 응답 — 대량 데이터 시 메모리 2배 사용 방지
    const today = kstYmd()
    return csvStreamResponse(`주문목록_${today}.csv`, headers, rows, {
      footerNote: truncated ? CSV_TRUNCATION_NOTE : undefined,
    })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/orders/:id/bill - 경리 확인 (MANAGER+)

// ── GET /:id/work-order — 작업지시서 인쇄 정본 (2026-09-04) ────────────────────
// 인쇄 화면이 주문 1건 + 카드 N건을 개별로 긁던 N+1(scripts/cards/detail.js)을 한 번에 대체한다.
// 종이에 실리는 것만 담는다 — 헤더·담당자·라인(생산라인 귀속·원단·시안).
//
// ★원단 = `product_materials` 후보들의 **이름**이다(`is_default` 아님). 주력 제품은 폭만 다른
//   같은 이름의 후보가 19개씩 붙어 있어 기본값을 못 박는다 — `is_default=1` 조인은 8월 기준
//   라인의 **80%가 빈칸**이었다(실측 2026-09-04: 4,074건 중 815건만 채워짐). 이름으로 접으면
//   70%가 채워지고, 어느 폭·어느 코팅을 거는지는 현장이 정한다(용준님 결정).
// ★상관 서브쿼리를 쓰지 않는다 — 라인·카드·자재를 각각 한 번씩 읽어 앱에서 잇는다
//   (SELECT절 상관 서브쿼리 금지 정책 · `npm run audit:subquery`).
interface WorkOrderLineRow {
  id: number
  item_id: number | null
  item_name: string | null
  specification: string | null
  width: number | null
  height: number | null
  quantity: number | null
  unit: string | null
  content: string | null
  post_processing: string | null
  finishing: string | null
  scale_factor: number | null
  parent_item_id: number | null
  ai_analysis_id: number | null
  ai_group_index: number | null
}

/** 원단 후보 이름들 → 종이 한 칸. 계열이 하나면 그 이름, 둘이면 병기, 셋 이상이면 「외 N종」. */
function formatFabricNames(names: string[]): string | null {
  const uniq = names.filter((n) => n && n.trim() !== '')
  if (uniq.length === 0) return null
  if (uniq.length === 1) return uniq[0]
  if (uniq.length === 2) return `${uniq[0]} / ${uniq[1]}`
  return `${uniq[0]} 외 ${uniq.length - 1}종`
}

ordersQueriesRouter.get('/:id/work-order', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    if (!id || isNaN(id)) return c.json({ success: false, error: '주문 ID가 올바르지 않습니다.' }, 400)

    // 형제 GET /:id·/:id/invoice 와 같은 가시성 모델(분할청구 협업 라인 포함)
    const ovf = orderVisibilityFilter(c, 'o')
    const order = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.order_date, o.delivery_date, o.delivery_method,
             o.delivery_time, o.delivery_slot, o.delivery_info, o.shipping_payment,
             o.internal_notes, o.notes, o.priority,
             cl.client_name,
             sr.name AS sales_rep_name, sr.mobile AS sales_rep_mobile
      FROM orders o
      LEFT JOIN clients cl ON cl.id = o.client_id
      LEFT JOIN employees sr ON sr.id = o.sales_rep_id
      WHERE o.id = ?${ovf.clause}
    `).bind(id, ...ovf.params).first<Record<string, unknown>>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    // ① 라인 — 자식을 가진 부모 행은 뺀다(기존 인쇄 규칙 유지: 종이 단위 = 실제 제작·출고 대상)
    const { results: rawLines } = await c.env.DB.prepare(`
      SELECT oi.id, oi.item_id, oi.item_name, oi.specification, oi.width, oi.height,
             oi.quantity, oi.unit, oi.content, oi.post_processing, oi.finishing,
             oi.scale_factor, oi.parent_item_id, oi.ai_analysis_id, oi.ai_group_index
      FROM order_items oi
      WHERE oi.order_id = ?
      ORDER BY oi.sort_order ASC, oi.id ASC
    `).bind(id).all<WorkOrderLineRow>()
    const allLines = rawLines || []
    const parentIds = new Set<number>()
    for (const l of allLines) if (l.parent_item_id) parentIds.add(l.parent_item_id)
    const lines = allLines.filter((l) => !parentIds.has(l.id))

    // ② 생산 라인 귀속 — 카드에서 역으로 읽는다. 카드 그룹 판정은 서버(getCardGroup)가 정본이라
    //    프론트에서 재구현하면 반드시 갈린다. 카드에 안 담긴 라인 = 제작 대상 아님(상품·부자재).
    const { results: cardRows } = await c.env.DB.prepare(`
      SELECT ci.order_item_id, ci.card_id, c.category_name, c.thumbnail_url
      FROM card_items ci
      JOIN cards c ON c.id = ci.card_id
      WHERE c.order_id = ? AND c.status != 'CANCELLED'
      ORDER BY c.id ASC, ci.id ASC
    `).bind(id).all<{ order_item_id: number; card_id: number; category_name: string | null; thumbnail_url: string | null }>()
    const lineByItem = new Map<number, string>()
    const cardOfItem = new Map<number, { card_id: number; thumbnail_url: string | null }>()
    const itemsPerCard = new Map<number, number>()
    for (const r of cardRows || []) {
      if (r.category_name) lineByItem.set(r.order_item_id, r.category_name)
      cardOfItem.set(r.order_item_id, { card_id: r.card_id, thumbnail_url: r.thumbnail_url })
      itemsPerCard.set(r.card_id, (itemsPerCard.get(r.card_id) || 0) + 1)
    }

    // ③ 원단 — 제품에 걸린 자재 후보의 이름을 접는다. 바인드 한도(100) 대비 80개 청크.
    const itemIds = Array.from(new Set(lines.map((l) => l.item_id).filter((v): v is number => !!v)))
    const fabricByItem = new Map<number, string[]>()
    for (let i = 0; i < itemIds.length; i += 80) {
      const chunk = itemIds.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      const { results: mats } = await c.env.DB.prepare(`
        SELECT pm.product_item_id, m.item_name
        FROM product_materials pm
        JOIN items m ON m.id = pm.material_item_id
        WHERE pm.product_item_id IN (${ph})
        ORDER BY m.item_name ASC, m.id ASC
      `).bind(...chunk).all<{ product_item_id: number; item_name: string }>()
      for (const r of mats || []) {
        const cur = fabricByItem.get(r.product_item_id) || []
        if (!cur.includes(r.item_name)) cur.push(r.item_name)
        fabricByItem.set(r.product_item_id, cur)
      }
    }

    // ④ 시안 — order_items.ai_analysis_id + ai_group_index 가 정본. 카드 썸네일은 **단품 카드**
    //    에서만 폴백한다(다품목은 어느 라인 것인지 모호 → 오표시).
    //    ⚠️ 인증이 헤더 전용이라 <img src> 가 R2 를 직접 못 부른다 → 백엔드가 data URI 로 서빙.
    const analysisIds = Array.from(new Set(lines.map((l) => l.ai_analysis_id).filter((v): v is number => !!v)))
    const groupsByAnalysis = new Map<number, AnalysisGroup[]>()
    for (let i = 0; i < analysisIds.length; i += 80) {
      const chunk = analysisIds.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      const { results: rows } = await c.env.DB.prepare(
        `SELECT id, groups_json FROM ai_analysis_requests WHERE id IN (${ph})`
      ).bind(...chunk).all<{ id: number; groups_json: string | null }>()
      for (const r of rows || []) {
        if (!r.groups_json) continue
        try { groupsByAnalysis.set(r.id, JSON.parse(r.groups_json)) } catch { groupsByAnalysis.set(r.id, []) }
      }
    }

    // R2 GET 은 병렬 — 직렬 await 면 라인 수만큼 왕복이 그대로 쌓인다(인쇄 대기 시간).
    const thumbByLine = new Map<number, string>()
    await Promise.all(lines.map(async (l) => {
      let ref: string | null = null
      if (l.ai_analysis_id) {
        const g = resolveGroupByAiIndex(groupsByAnalysis.get(l.ai_analysis_id), l.ai_group_index)
        if (g) {
          // 고해상도(@lg)가 있으면 그것을 쓴다 — 인쇄는 목록과 달리 픽셀이 필요하다.
          //   P2(에이전트 2장 export) 이전 데이터엔 hi 키가 없어 자동으로 sm 로 내려간다.
          const hi = (g as Record<string, unknown>).thumbnail_hi_r2_key
          const sm = g.thumbnail_r2_key
          if (typeof hi === 'string' && hi) ref = hi
          else if (typeof sm === 'string' && sm) ref = sm
          else if (typeof g.thumbnail_base64 === 'string' && g.thumbnail_base64) {
            thumbByLine.set(l.id, `data:image/png;base64,${g.thumbnail_base64}`)
            return
          }
        }
      }
      if (!ref) {
        // 단품 카드 폴백 — 그 카드의 라인이 하나뿐일 때만 그림이 모호하지 않다.
        const card = cardOfItem.get(l.id)
        if (card && card.thumbnail_url && (itemsPerCard.get(card.card_id) || 0) === 1) {
          if (isThumbRef(card.thumbnail_url)) ref = card.thumbnail_url
          else { thumbByLine.set(l.id, card.thumbnail_url); return }   // 레거시 data URI
        }
      }
      if (!ref) return
      try {
        const uri = await getThumbnailDataUri(c.env, ref)
        if (uri) thumbByLine.set(l.id, uri)
      } catch { /* 시안이 없어도 작업지시서는 나가야 한다 */ }
    }))

    const outLines = lines.map((l) => ({
      id: l.id,
      item_name: l.item_name,
      specification: l.specification,
      width: l.width,
      height: l.height,
      quantity: l.quantity,
      unit: l.unit,
      content: l.content,
      post_processing: l.post_processing,
      finishing: l.finishing,
      scale_factor: l.scale_factor,
      production_line: lineByItem.get(l.id) || null,   // null = 제작 대상 아님(출고만)
      fabric: l.item_id ? formatFabricNames(fabricByItem.get(l.item_id) || []) : null,
      thumbnail: thumbByLine.get(l.id) || null,
    }))

    return c.json({ success: true, data: { order, lines: outLines } })
  } catch (error) {
    console.error('orders work-order error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default ordersQueriesRouter
