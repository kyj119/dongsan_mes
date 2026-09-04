import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { excludeArExcludedClientsSql } from '../constants/arPolicy'
import { kstDate, kstDateOf, kstMonth } from '../utils/kstDate'
import { printEventKstDay } from '../utils/printEventDay'
import { buildOldestUnpaidJoin, agingDaysFromOldest } from './ledger/ar-helpers'
import { VOUCHER_ORDER_SQL } from './orders/listFilter'

/** cards 테이블용 엔티티 필터 (requesting_entity_id 컬럼 사용) */
function cardEntityFilter(c: any, tableAlias?: string): { clause: string; params: number[] } {
  const entityId = getEntityId(c)
  if (entityId === 0) return { clause: '', params: [] }
  const prefix = tableAlias ? `${tableAlias}.` : ''
  return { clause: ` AND ${prefix}requesting_entity_id = ?`, params: [entityId] }
}

const dashboardRouter = new Hono<HonoEnv>()

// Apply authentication middleware
dashboardRouter.use('/*', authMiddleware, requirePagePermission('/dashboard'))

// Get dashboard statistics
dashboardRouter.get('/stats', async (c) => {
  try {
    const ef = entityFilter(c)
    const cf = cardEntityFilter(c)
    // Build basic stats query dynamically to support entity filter on orders + cards
    const basicStats = await c.env.DB.prepare(`
      WITH card_agg AS (
        SELECT
          COUNT(*) AS total_cards,
          SUM(CASE WHEN status = 'PRINTING' THEN 1 ELSE 0 END) AS pending_cards,
          SUM(CASE WHEN status = 'PRINTING' THEN 1 ELSE 0 END) AS printing_cards,
          SUM(CASE WHEN status = 'PRINT_DONE' THEN 1 ELSE 0 END) AS done_cards,
          SUM(CASE WHEN status = 'HOLD' THEN 1 ELSE 0 END) AS hold_cards,
          SUM(CASE WHEN status = 'PRINT_DONE' THEN 1 ELSE 0 END) AS shipment_ready_count
        FROM cards
        WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = cards.order_id AND o.status = 'CANCELLED')${cf.clause}
      )
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as active_users,
        (SELECT COUNT(*) FROM clients WHERE is_active = 1) as active_clients,
        (SELECT COUNT(*) FROM orders WHERE 1=1${ef.clause}) as total_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'CONFIRMED'${ef.clause}) as confirmed_orders,
        (SELECT COUNT(*) FROM orders WHERE status IN ('PRINTING', 'PRINT_DONE')${ef.clause}) as production_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'SHIPPED'${ef.clause}) as shipped_orders,
        ca.total_cards as total_cards,
        ca.pending_cards as pending_cards,
        ca.printing_cards as printing_cards,
        ca.done_cards as done_cards,
        ca.hold_cards as hold_cards,
        (SELECT SUM(final_amount) FROM orders WHERE 1=1${ef.clause}) as total_revenue,
        (SELECT COUNT(*) FROM orders WHERE ${kstDateOf('created_at')} = ${kstDate()} AND status NOT IN ('CANCELLED', 'QUOTATION')${ef.clause}) as today_order_count,
        (SELECT SUM(final_amount) FROM orders WHERE ${kstDateOf('created_at')} = ${kstDate()} AND status NOT IN ('CANCELLED', 'QUOTATION')${ef.clause}) as today_revenue,
        (SELECT COUNT(*) FROM orders WHERE ${kstMonth('created_at')} = ${kstMonth()} AND status NOT IN ('CANCELLED', 'QUOTATION')${ef.clause}) as month_order_count,
        (SELECT SUM(final_amount) FROM orders WHERE ${kstMonth('created_at')} = ${kstMonth()} AND status NOT IN ('CANCELLED', 'QUOTATION')${ef.clause}) as month_revenue,
        (SELECT SUM(final_amount) FROM orders WHERE ${kstMonth('created_at')} = ${kstMonth("'now'", "'start of month'", "'-1 month'")} AND status NOT IN ('CANCELLED', 'QUOTATION')${ef.clause}) as prev_month_revenue,
        (SELECT COUNT(*) FROM orders WHERE ${kstMonth('created_at')} = ${kstMonth("'now'", "'start of month'", "'-1 month'")} AND status NOT IN ('CANCELLED', 'QUOTATION')${ef.clause}) as prev_month_order_count,
        (SELECT SUM(final_amount) FROM orders WHERE created_at >= ${kstDate("'-7 days'")} AND status NOT IN ('CANCELLED', 'QUOTATION')${ef.clause}) as week_revenue,
        ca.shipment_ready_count as shipment_ready_count,
        (SELECT COUNT(*) FROM orders WHERE delivery_date = ${kstDate()} AND status NOT IN ('SHIPPED','CANCELLED')${ef.clause}) as today_shipment_due,
        (SELECT COUNT(*) FROM orders WHERE priority='URGENT' AND status NOT IN ('SHIPPED','CANCELLED','QUOTATION')${ef.clause}) as urgent_count,
        (SELECT COUNT(*) FROM orders WHERE id IN (SELECT DISTINCT order_id FROM order_items WHERE price_status = 'PENDING') AND status NOT IN ('CANCELLED','SHIPPED')${ef.clause}) as pending_price_orders,
        (SELECT COALESCE(SUM(final_amount),0) FROM orders WHERE billing_status='BILLED' AND strftime('%Y-%m',COALESCE(accounting_date,billed_at))=${kstMonth()}${ef.clause}) as month_billed,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE strftime('%Y-%m',payment_date)=${kstMonth()}${ef.clause}) as month_paid,
        (SELECT ROUND(
          COUNT(CASE WHEN date(
            COALESCE(
              (SELECT MAX(sh.shipped_at) FROM shipments sh WHERE sh.order_id = o2.id),
              (SELECT MAX(cd.shipped_at) FROM cards cd WHERE cd.order_id = o2.id),
              o2.updated_at
            ), '+9 hours') <= o2.delivery_date THEN 1 END) * 100.0 /
          NULLIF(COUNT(*), 0), 1)
         FROM orders o2 WHERE o2.status IN ('SHIPPED','COMPLETED') AND strftime('%Y-%m', o2.delivery_date) = ${kstMonth()} AND o2.delivery_date IS NOT NULL${ef.clause}
        ) as on_time_rate
      FROM card_agg ca
    `).bind(...[
      ...cf.params, // card_agg CTE (WITH 절이 최상단 → 먼저 바인딩)
      ...ef.params, // total_orders
      ...ef.params, // confirmed_orders
      ...ef.params, // production_orders
      ...ef.params, // shipped_orders
      ...ef.params, // total_revenue
      ...ef.params, // today_order_count
      ...ef.params, // today_revenue
      ...ef.params, // month_order_count
      ...ef.params, // month_revenue
      ...ef.params, // prev_month_revenue
      ...ef.params, // prev_month_order_count
      ...ef.params, // week_revenue
      ...ef.params, // today_shipment_due
      ...ef.params, // urgent_count
      ...ef.params, // pending_price_orders
      ...ef.params, // month_billed
      ...ef.params, // month_paid
      ...ef.params, // on_time_rate
    ]).first()

    // 후가공 대기 현황: pp_status='PENDING'(후가공 대기, 인덱스 idx_cards_pp_status) 카드만 파싱.
    //   출고(shipped_at IS NOT NULL, 강제출고 시 status는 PRINT_DONE 유지) · 취소주문 · 후가공완료(DONE)/무(N/A)를
    //   SQL WHERE에서 제외 → PRINT_DONE 카드 무한 누적 방지. WIP(대기) 카드에 한해서만 JSON 파싱.
    const { results: ppCards } = await c.env.DB.prepare(`
      SELECT post_processing FROM cards
      WHERE pp_status = 'PENDING'
      AND shipped_at IS NULL
      AND post_processing IS NOT NULL AND post_processing != '' AND post_processing != '[]'
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = cards.order_id AND o.status = 'CANCELLED')${cf.clause}
    `).bind(...cf.params).all<{ post_processing: string }>()

    const ppCounts: Record<string, number> = {}
    for (const row of (ppCards || [])) {
      try {
        const ppArr = JSON.parse(row.post_processing)
        if (Array.isArray(ppArr)) {
          for (const pp of ppArr) {
            const name = pp.name || pp.code || String(pp)
            ppCounts[name] = (ppCounts[name] || 0) + 1
          }
        }
      } catch (e) {
        console.error('post_processing JSON 파싱 실패:', String(e))
      }
    }

    // Vary: Authorization → 법인(토큰) 변경 시 캐시 무효화
    c.header('Cache-Control', 'private, max-age=60')
    c.header('Vary', 'Authorization')
    return c.json({
      success: true,
      data: {
        ...basicStats,
        pp_stats: ppCounts
      }
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get client-wise order summary
dashboardRouter.get('/stats/clients', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id,
        c.client_code,
        c.client_name,
        COUNT(o.id) as order_count,
        SUM(o.final_amount) as total_revenue,
        MAX(o.created_at) as last_order_date
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
        AND o.status NOT IN ('CANCELLED', 'QUOTATION')
        AND NOT ${VOUCHER_ORDER_SQL}
      WHERE c.is_active = 1${ef.clause}
      GROUP BY c.id
      HAVING order_count > 0
      ORDER BY total_revenue DESC
      LIMIT 10
    `).bind(...ef.params).all()

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('dashboard GET /stats/clients error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Receivables dashboard (미수금 현황)
dashboardRouter.get('/stats/receivables', async (c) => {
  try {
    const ef = entityFilter(c, 'o')

    // TOP 10 clients by balance — split billing P3: clients.balance 캐시 폐기 → 미수금 파생(청구 법인 g 기준)
    //   거래처별 상관 서브쿼리(O(clients×scans)) → client_id 사전집계 서브쿼리 LEFT JOIN(O(1 pass))로 재작성. 값 동일.
    //   payments는 SUM(결제)+MAX(최근결제일)을 한 번의 GROUP BY로 통합.
    const efBalG = entityFilter(c, 'g')
    const efBalP = entityFilter(c, 'p2')
    const efBalA = entityFilter(c, 'a2')
    const { results: topClients } = await c.env.DB.prepare(`
      SELECT * FROM (
        SELECT
          c.id, c.client_code, c.client_name,
          (COALESCE(bg.billed_sum, 0) - COALESCE(pay.paid_sum, 0) - COALESCE(adj.adj_sum, 0)) as balance,
          pay.last_payment_date as last_payment_date,
          COALESCE(bo.billed_order_count, 0) as billed_order_count
        FROM clients c
        LEFT JOIN (
          SELECT o.client_id AS client_id, COALESCE(SUM(g.billed_amount), 0) AS billed_sum
          FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
          WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${efBalG.clause}
          GROUP BY o.client_id
        ) bg ON bg.client_id = c.id
        LEFT JOIN (
          SELECT p2.client_id AS client_id, COALESCE(SUM(p2.amount), 0) AS paid_sum, MAX(p2.payment_date) AS last_payment_date
          FROM payments p2 WHERE 1=1${efBalP.clause}
          GROUP BY p2.client_id
        ) pay ON pay.client_id = c.id
        LEFT JOIN (
          SELECT a2.client_id AS client_id, COALESCE(SUM(a2.amount), 0) AS adj_sum
          FROM adjustments a2 WHERE 1=1${efBalA.clause}
          GROUP BY a2.client_id
        ) adj ON adj.client_id = c.id
        LEFT JOIN (
          SELECT o.client_id AS client_id, COUNT(*) AS billed_order_count
          FROM orders o WHERE o.billing_status = 'BILLED'${ef.clause}
          GROUP BY o.client_id
        ) bo ON bo.client_id = c.id
        WHERE c.is_active = 1${excludeArExcludedClientsSql('c.id')}
      ) WHERE balance > 0
      ORDER BY balance DESC
      LIMIT 10
    `).bind(...efBalG.params, ...efBalP.params, ...efBalA.params, ...ef.params).all()

    // Aging buckets (연체 구간) — 미수금 일원화(2026-07-17 SSOT): 채권 나이 = 최고령 미결제 청구건(oldest_unpaid_date) 기준.
    //   구방식(주문건별 billed_amount + julianday('now') UTC heuristic) 폐기 → reports 미수금분석·bank 미수금현황과 동일하게
    //   '거래처 파생잔액(order_billing_groups[BILLED] − payments − adjustments)을 그 거래처 채권나이 버킷에 전액 귀속'.
    //   버킷 JOIN/일수 = buildOldestUnpaidJoin + agingDaysFromOldest SSOT (reports.ts:494~522 로직과 동형).
    const efAgeG = entityFilter(c, 'g')
    const efAgeP = entityFilter(c, 'p')
    const efAgeA = entityFilter(c, 'a')
    const agBalExpr = `(COALESCE(b.amt,0) - COALESCE(pp.amt,0) - COALESCE(aa.amt,0))`
    const oupAging = buildOldestUnpaidJoin(c, { entityScoped: true }) // dashboard = 법인 스코프 → entityScoped=true (reports 와 일치)
    const { results: agingRows } = await c.env.DB.prepare(`
      SELECT ${agBalExpr} AS balance, oup.oldest_unpaid_date AS oldest_unpaid_date
      FROM clients c
      LEFT JOIN (
        SELECT o.client_id AS cid, SUM(g.billed_amount) AS amt
        FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
        WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${efAgeG.clause}
        GROUP BY o.client_id
      ) b ON b.cid = c.id
      LEFT JOIN (
        SELECT client_id AS cid, SUM(amount) AS amt FROM payments p WHERE 1=1${efAgeP.clause} GROUP BY client_id
      ) pp ON pp.cid = c.id
      LEFT JOIN (
        SELECT client_id AS cid, SUM(amount) AS amt FROM adjustments a WHERE 1=1${efAgeA.clause} GROUP BY client_id
      ) aa ON aa.cid = c.id${oupAging.sql}
      WHERE c.is_active = 1${excludeArExcludedClientsSql('c.id')} AND ${agBalExpr} > 0
    `).bind(...efAgeG.params, ...efAgeP.params, ...efAgeA.params, ...oupAging.params)
      .all<{ balance: number; oldest_unpaid_date: string | null }>()

    // 거래처 파생잔액을 채권나이 구간에 전액 귀속 (reports.ts 버킷 로직 동형). overdue_count = 30일 초과 거래처 수.
    const agBuckets = { current: 0, over_30: 0, over_60: 0, over_90: 0 }
    let agOverdueCount = 0
    for (const row of agingRows) {
      const days = agingDaysFromOldest(row.oldest_unpaid_date) ?? 0
      const bal = Number(row.balance) || 0
      if (days <= 30) agBuckets.current += bal
      else if (days <= 60) { agBuckets.over_30 += bal; agOverdueCount++ }
      else if (days <= 90) { agBuckets.over_60 += bal; agOverdueCount++ }
      else { agBuckets.over_90 += bal; agOverdueCount++ }
    }

    // Total receivables / clients_with_balance — #565: 별도 쿼리(billed−payments, adjustments 누락) 폐기.
    //   같은 화면 aging(agingRows)이 이미 SSOT 파생잔액(order_billing_groups[BILLED] − payments − adjustments,
    //   balance>0, 법인스코프, 내부법인 제외)을 거래처별로 계산 완료 → 여기서 파생해 화면 내부 정합성 보장.
    const totalReceivables = agBuckets.current + agBuckets.over_30 + agBuckets.over_60 + agBuckets.over_90
    const clientsWithBalance = agingRows.length

    return c.json({
      success: true,
      data: {
        top_clients: topClients,
        aging: {
          current: agBuckets.current,
          over_30: agBuckets.over_30,
          over_60: agBuckets.over_60,
          over_90: agBuckets.over_90,
          overdue_count: agOverdueCount
        },
        total_receivables: totalReceivables,
        clients_with_balance: clientsWithBalance
      }
    })
  } catch (error) {
    console.error('Get receivables stats error:', error)
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 납기 지연 발주서 목록 (미입고 경고)
dashboardRouter.get('/overdue-pos', async (c) => {
  try {
    const ef = entityFilter(c, 'po')
    const { results } = await c.env.DB.prepare(`
      SELECT
        po.id, po.po_number, po.expected_date, po.status, po.final_amount,
        c.client_name as supplier_name,
        CAST(julianday('now') - julianday(po.expected_date) AS INTEGER) as overdue_days
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      WHERE po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
        AND po.expected_date IS NOT NULL
        AND po.expected_date < ${kstDate()}${ef.clause}
      ORDER BY po.expected_date ASC, po.id ASC
      LIMIT 20
    `).bind(...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('dashboard GET /overdue-pos error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 재고 부족 품목 목록 (안전재고 이하)
dashboardRouter.get('/low-stock', async (c) => {
  try {
    // UP4 백로그: 창고별 다중행 → 품목당 SUM/MAX 집계 + entity 격리(행 중복·타법인 합산 방지).
    const entityId = getEntityId(c)
    const invJoin = entityId > 0
      ? 'JOIN inventory inv ON i.id = inv.item_id AND inv.entity_id = ?'
      : 'JOIN inventory inv ON i.id = inv.item_id'
    const lowParams = entityId > 0 ? [entityId] : []
    const { results } = await c.env.DB.prepare(`
      SELECT
        i.id, i.item_name, i.category, i.unit,
        COALESCE(SUM(inv.quantity), 0) as current_stock,
        COALESCE(MAX(inv.safe_stock), 0) as safety_stock,
        COALESCE(MAX(inv.reorder_point), 0) as reorder_point,
        ROUND(COALESCE(MAX(inv.safe_stock), 0) - COALESCE(SUM(inv.quantity), 0), 1) as shortage
      FROM items i
      ${invJoin}
      WHERE i.is_purchase_item = 1 AND i.is_active = 1
      GROUP BY i.id
      HAVING COALESCE(SUM(inv.quantity), 0) <= COALESCE(MAX(inv.safe_stock), 0) AND COALESCE(MAX(inv.safe_stock), 0) > 0
      ORDER BY shortage DESC
      LIMIT 10
    `).bind(...lowParams).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('dashboard GET /low-stock error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 금일 납기 주문 (출고 안 된 것)
dashboardRouter.get('/stats/today-due', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.final_amount, o.status, o.priority,
        c.client_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.delivery_date <= ${kstDate()}
        AND o.status NOT IN ('SHIPPED', 'CANCELLED', 'QUOTATION')${ef.clause}
      ORDER BY o.delivery_date ASC, o.priority DESC, o.id DESC
      LIMIT 20
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 최근 7일 주문 추이
dashboardRouter.get('/stats/weekly-trend', async (c) => {
  try {
    const ef = entityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT
        ${kstDateOf('created_at')} as date,
        COUNT(*) as order_count,
        COALESCE(SUM(final_amount), 0) as revenue
      FROM orders
      WHERE created_at >= ${kstDate("'-6 days'")}
        AND status NOT IN ('CANCELLED', 'QUOTATION')${ef.clause}
      GROUP BY ${kstDateOf('created_at')}
      ORDER BY date ASC
    `).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 장비별 부하 현황 (대시보드 위젯)
dashboardRouter.get('/equipment-load', async (c) => {
  try {
    // 장비 조회 = 전 법인 공유, 큐 카운트만 법인 격리 유지 (2026-08-11 — 쓰기 경로만 #342)
    const efCnt = cardEntityFilter(c, 'c')   // queue_count 카드(requesting_entity_id)
    const { results } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.equipment_status, COALESCE(e.daily_capacity, 0) as daily_capacity,
        (SELECT COUNT(*) FROM cards c WHERE c.equipment_id = e.id AND c.status = 'PRINTING'${efCnt.clause}) as queue_count,
        e.last_seen_at, e.agent_id, e.print_log_path,
        -- 장비 그룹 축 = 출력방식(equipment_processes.is_primary). 자유텍스트 location_zone 은 은퇴(0546).
        (SELECT ep.process_code FROM equipment_processes ep
          WHERE ep.equipment_id = e.id ORDER BY ep.is_primary DESC, ep.process_code ASC LIMIT 1) as process_code,
        CASE
          WHEN e.last_seen_at IS NULL THEN 'OFFLINE'
          WHEN (julianday('now') - julianday(e.last_seen_at)) * 86400 > 120 THEN 'OFFLINE'
          ELSE 'ONLINE'
        END as agent_status
      FROM equipment e
      WHERE e.status = 'ACTIVE'
      ORDER BY e.name
    `).bind(...efCnt.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/dashboard.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 금일 생산 실적 (print_events 기반)
dashboardRouter.get('/stats/production-today', async (c) => {
  try {
    const summary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_prints,
        SUM(CASE WHEN pe.print_status = 'OK' THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN pe.print_status = 'CANCEL' THEN 1 ELSE 0 END) as cancel_count,
        SUM(CASE WHEN pe.print_status = 'ERROR' THEN 1 ELSE 0 END) as error_count
      FROM print_events pe
      WHERE ${printEventKstDay('pe')} = ${kstDate()}
        AND pe.event_kind = 'PRINT'
    `).first()

    const { results: byEquipment } = await c.env.DB.prepare(`
      SELECT pe.equipment_id, e.name as equipment_name,
        COUNT(*) as total,
        SUM(CASE WHEN pe.print_status = 'OK' THEN 1 ELSE 0 END) as ok_count
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE ${printEventKstDay('pe')} = ${kstDate()}
        AND pe.event_kind = 'PRINT'
      GROUP BY pe.equipment_id
      ORDER BY total DESC
    `).all()

    return c.json({
      success: true,
      data: {
        total_prints: (summary as Record<string, unknown>)?.total_prints || 0,
        ok_count: (summary as Record<string, unknown>)?.ok_count || 0,
        cancel_count: (summary as Record<string, unknown>)?.cancel_count || 0,
        error_count: (summary as Record<string, unknown>)?.error_count || 0,
        by_equipment: byEquipment
      }
    })
  } catch (error) {
    console.error('dashboard GET /stats/production-today error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// 장비 가동시간 (print_duration_sec 기반, 근무시간 570분 = 08:30~18:00)
dashboardRouter.get('/stats/equipment-utilization', async (c) => {
  try {
    const WORK_MINUTES = 570 // 08:30~18:00

    // 오늘 장비별 가동시간
    const { results: todayRows } = await c.env.DB.prepare(`
      SELECT pe.equipment_id, e.name as equipment_name,
        SUM(pe.print_duration_sec) as total_sec,
        COUNT(*) as print_count,
        SUM(CASE WHEN pe.print_status = 'OK' THEN 1 ELSE 0 END) as ok_count,
        MIN(pe.print_started_at) as first_print,
        MAX(pe.print_completed_at) as last_print
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE ${printEventKstDay('pe')} = ${kstDate()}
        AND pe.event_kind = 'PRINT'
      GROUP BY pe.equipment_id
      ORDER BY total_sec DESC
    `).all()

    // 최근 7일 장비별 일평균 가동시간
    const { results: weeklyRows } = await c.env.DB.prepare(`
      SELECT pe.equipment_id, e.name as equipment_name,
        SUM(pe.print_duration_sec) as total_sec,
        COUNT(DISTINCT ${printEventKstDay('pe')}) as active_days,
        COUNT(*) as print_count
      FROM print_events pe
      LEFT JOIN equipment e ON pe.equipment_id = e.id
      WHERE ${printEventKstDay('pe')} >= ${kstDate("'-6 days'")}
        AND pe.event_kind = 'PRINT'
      GROUP BY pe.equipment_id
      ORDER BY total_sec DESC
    `).all()

    interface TodayRow { equipment_id: string; equipment_name: string; total_sec: number; print_count: number; ok_count: number; first_print: string; last_print: string }
    interface WeeklyRow { equipment_id: string; equipment_name: string; total_sec: number; active_days: number; print_count: number }

    const weeklyMap = new Map<string, WeeklyRow>()
    for (const r of (weeklyRows as unknown as WeeklyRow[])) {
      weeklyMap.set(r.equipment_id, r)
    }

    const equipment = (todayRows as unknown as TodayRow[]).map((row) => {
      const totalMin = Math.round(row.total_sec / 60)
      const utilPct = Math.min(Number(((totalMin / WORK_MINUTES) * 100).toFixed(1)), 100)
      const weekly = weeklyMap.get(row.equipment_id)
      const weeklyAvgMin = weekly
        ? Math.round(weekly.total_sec / 60 / Math.max(weekly.active_days, 1))
        : 0
      const weeklyAvgPct = Math.min(Number(((weeklyAvgMin / WORK_MINUTES) * 100).toFixed(1)), 100)
      return {
        equipment_id: row.equipment_id,
        equipment_name: row.equipment_name || row.equipment_id,
        today_minutes: totalMin,
        today_pct: utilPct,
        today_print_count: row.print_count,
        today_ok_count: row.ok_count,
        first_print: row.first_print,
        last_print: row.last_print,
        weekly_avg_minutes: weeklyAvgMin,
        weekly_avg_pct: weeklyAvgPct,
        weekly_active_days: weekly?.active_days || 0
      }
    })

    // 전체 장비 + 아직 오늘 가동 안 된 장비도 weekly에서 추가
    for (const [eqId, weekly] of weeklyMap) {
      if (!equipment.find(e => e.equipment_id === eqId)) {
        const weeklyAvgMin = Math.round(weekly.total_sec / 60 / Math.max(weekly.active_days, 1))
        equipment.push({
          equipment_id: eqId,
          equipment_name: weekly.equipment_name || eqId,
          today_minutes: 0,
          today_pct: 0,
          today_print_count: 0,
          today_ok_count: 0,
          first_print: '',
          last_print: '',
          weekly_avg_minutes: weeklyAvgMin,
          weekly_avg_pct: Math.min(Number(((weeklyAvgMin / WORK_MINUTES) * 100).toFixed(1)), 100),
          weekly_active_days: weekly.active_days
        })
      }
    }

    // 전체 평균 가동률
    const avgTodayPct = equipment.length > 0
      ? Number((equipment.reduce((s, e) => s + e.today_pct, 0) / equipment.length).toFixed(1))
      : 0
    const avgWeeklyPct = equipment.length > 0
      ? Number((equipment.reduce((s, e) => s + e.weekly_avg_pct, 0) / equipment.length).toFixed(1))
      : 0

    return c.json({
      success: true,
      data: {
        work_minutes: WORK_MINUTES,
        avg_today_pct: avgTodayPct,
        avg_weekly_pct: avgWeeklyPct,
        equipment
      }
    })
  } catch (error) {
    console.error('equipment-utilization error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 최근 활동: 최근 주문 5건 + 최근 출고 5건
dashboardRouter.get('/stats/recent-activity', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const { results: recentOrders } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.final_amount, o.status, o.created_at,
        c.client_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.status != 'CANCELLED'${ef.clause}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 5
    `).bind(...ef.params).all()

    const { results: recentShipments } = await c.env.DB.prepare(`
      SELECT s.id, s.shipment_number, s.shipped_at, s.status,
        o.order_number, o.final_amount,
        c.client_name
      FROM shipments s
      LEFT JOIN orders o ON s.order_id = o.id
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE s.status != 'CANCELLED'${ef.clause}
      ORDER BY s.shipped_at DESC, s.id DESC
      LIMIT 5
    `).bind(...ef.params).all()

    return c.json({
      success: true,
      data: {
        recent_orders: recentOrders,
        recent_shipments: recentShipments
      }
    })
  } catch (error) {
    console.error('src/routes/dashboard.ts recent-activity error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default dashboardRouter