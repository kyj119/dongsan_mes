/**
 * cards/queries.ts — 카드 읽기 + 통계 (13 라우트)
 * Phase 3.1.A 분할: 2026-05-09
 *   - /schedule/queues, /schedule/unassigned, /debug-counts, /categories
 *   - /, /kanban-summary, /stats/daily
 *   - /defects/list, /by-number/:cardNumber
 *   - /:id, /:id/history, /defect-stats, /:id/defects (GET)
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Card, ApiResponse } from '../../types/models'
import { authMiddleware } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { entityFilter } from '../../utils/entityFilter'

// ── Row types for D1 query results ──
interface EquipmentRow {
  id: number; name: string; equipment_status: string; daily_capacity: number;
  location_zone: string | null; queue_count: number; last_seen_at: string | null; agent_status: string;
}

interface PrintingCardRow {
  id: number; card_number: string; client_name: string; item_name: string; category_name: string;
  delivery_date: string; priority: number; status: string; rip_status: string | null; rip_preset: string | null;
  width: number; height: number; quantity: number; unit: string; created_at: string;
  equipment_id: number; order_number: string;
}

interface CategoryRow { category_name: string }

interface CardResultRow {
  id: number; order_id: number; client_name: string; item_name: string; width: number; height: number;
  quantity: number; unit: string; content: string | null; status: string; priority: number;
  delivery_date: string; created_at: string; equipment_id: number | null;
  order_number: string; delivery_method: string | null; delivery_time: string | null;
  order_delivery_date: string | null; created_by_name: string | null; order_notes: string | null;
  item_scale_factor?: number; item_count?: number;
  _items?: CardLiveItem[]; print_progress?: { total: number; done: number };
  order_card_total?: number; order_card_done?: number;
  [key: string]: unknown;
}

interface CardLiveItem {
  card_item_id: number; item_name: string; width: number; height: number;
  quantity: number; unit: string; content: string; scale_factor: number;
  post_processing: string | null; finishing: string | null; print_completed: number;
}

interface LiveItemRow {
  card_id: number; card_item_id: number; print_completed: number;
  item_name: string; width: number; height: number;
  scale_factor: number; quantity: number; unit: string; content: string; post_processing: string | null; finishing: string | null;
}

interface OrderProgressRow { order_id: number; order_card_total: number; order_card_done: number }

interface CountRow { count: number }

interface KanbanColRow { rip_waiting: number; printing: number; print_done: number; hold: number }
interface OverdueRow { cnt: number }
interface DeliveryRow { delivery_method: string | null; delivery_time: string | null; total: number; done: number }
interface TodayRow { today_total: number; today_done: number }

interface DailyStatsRow { date: string; completed: number; in_progress: number; on_hold: number }

interface DefectCategoryRow { defect_category: string; count: number; resolved: number; open_count: number }
interface DefectEquipmentRow { equipment_name: string; equipment_id: number; count: number }
interface DefectDailyRow { date: string; count: number }
interface DefectRateRow { defect_cards: number; total_cards: number }

interface CardItemRow {
  id: number; item_name: string; width: number; height: number; quantity: number; unit: string;
  content: string | null; scale_factor: number; ai_analysis_id: number | null; ai_group_index: number | null;
  card_item_id: number; print_completed: number; card_quantity: number;
  thumbnail_url?: string;
}

interface AnalysisRow { id: number; groups_json: string | null }

const cardsQueriesRouter = new Hono<HonoEnv>()
cardsQueriesRouter.use('/*', authMiddleware, requireAnyPagePermission('/cards', '/orders'))

// ── 스케줄: 장비별 작업 큐 조회 ──
cardsQueriesRouter.get('/schedule/queues', async (c) => {
  try {
    // 1. 활성 장비 목록 + 큐 카운트 + 일일 용량
    const { results: equipmentList } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.equipment_status, COALESCE(e.daily_capacity, 0) as daily_capacity,
        e.location_zone,
        (SELECT COUNT(*) FROM cards c WHERE c.equipment_id = e.id AND c.status = 'PRINTING') as queue_count,
        ah.last_seen_at,
        CASE
          WHEN ah.last_seen_at IS NULL THEN 'OFFLINE'
          WHEN (julianday('now') - julianday(ah.last_seen_at)) * 86400 > 120 THEN 'OFFLINE'
          ELSE 'ONLINE'
        END as agent_status
      FROM equipment e
      LEFT JOIN agent_heartbeats ah ON ah.equipment_id = e.id
      WHERE e.status = 'ACTIVE'
      ORDER BY e.name
    `).all<EquipmentRow>()

    // 2. 전체 PRINTING 카드를 한 번에 조회 후 장비별 그룹핑 (N+1 → 1 쿼리)
    const ef2 = entityFilter(c, 'o')
    const { results: allPrintingCards } = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.client_name, c.item_name, c.category_name,
        c.delivery_date, c.priority, c.status, c.rip_status, c.rip_preset,
        c.width, c.height, c.quantity, c.unit, c.created_at, c.equipment_id,
        o.order_number
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE c.status = 'PRINTING' AND c.equipment_id IN (
        SELECT id FROM equipment WHERE status = 'ACTIVE'
      )${ef2.clause}
      ORDER BY c.equipment_id, c.priority DESC, c.delivery_date ASC, c.created_at ASC
    `).bind(...ef2.params).all<PrintingCardRow>()

    const cardsByEquipment = new Map<number, PrintingCardRow[]>()
    for (const card of allPrintingCards) {
      if (!cardsByEquipment.has(card.equipment_id)) cardsByEquipment.set(card.equipment_id, [])
      cardsByEquipment.get(card.equipment_id)!.push(card)
    }
    const queues = equipmentList.map(eq => ({
      ...eq,
      cards: cardsByEquipment.get(eq.id) || []
    }))

    return c.json({ success: true, data: queues })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── 스케줄: 미배정 카드 조회 ──
cardsQueriesRouter.get('/schedule/unassigned', async (c) => {
  try {
    const efUn = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.client_name, c.item_name, c.category_name,
        c.delivery_date, c.priority, c.status, c.rip_status,
        c.width, c.height, c.quantity, c.unit, c.created_at,
        o.order_number
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE c.status = 'PRINTING'
        AND (c.equipment_id IS NULL OR c.equipment_id = '')${efUn.clause}
      ORDER BY c.priority DESC, c.delivery_date ASC, c.created_at ASC
    `).bind(...efUn.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Debug: card counts by status/rip_status
cardsQueriesRouter.get('/debug-counts', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT status, rip_status, COUNT(*) as cnt
    FROM cards
    GROUP BY status, rip_status
    ORDER BY status, rip_status
  `).all()
  const { results: orderCounts } = await c.env.DB.prepare(`
    SELECT o.status as order_status, COUNT(c.id) as card_cnt
    FROM cards c
    LEFT JOIN orders o ON c.order_id = o.id
    GROUP BY o.status
  `).all()
  return c.json({ success: true, data: { card_counts: results, order_status_counts: orderCounts } })
})

// Get distinct category list from active cards
cardsQueriesRouter.get('/categories', async (c) => {
  try {
    const efCat = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT DISTINCT c.category_name
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE c.category_name IS NOT NULL
        AND c.status != 'PRINT_DONE'${efCat.clause}
      ORDER BY c.category_name ASC
    `).bind(...efCat.params).all<CategoryRow>()

    const categories = results.map((r) => r.category_name)
    return c.json({ success: true, data: categories })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get all cards (enhanced with search, sort, urgency, equipment_id, kanban_column)
cardsQueriesRouter.get('/', async (c) => {
  try {
    const {
      page = '1',
      limit = '50',
      status = '',
      kanban_column = '',
      category = '',
      search = '',
      sort = 'priority_desc',
      urgency = '',
      equipment_id = '',
      exclude_order_status = '',
      order_id = ''
    } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT c.*, o.order_number, o.delivery_method, o.delivery_time, o.delivery_date as order_delivery_date,
             u.name as created_by_name, o.internal_notes as order_notes
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE 1=1
    `
    const params: any[] = []

    // order_id 필터 (같은 주문의 카드 조회, 알림 배너용)
    if (order_id) {
      query += ' AND c.order_id = ?'
      params.push(parseInt(order_id))
    }

    // kanban_column이 지정되면 status 파라미터 무시하고 칸반 컬럼 조건 적용
    if (kanban_column) {
      if (kanban_column === 'rip_waiting') {
        query += ` AND c.status = 'PRINTING' AND (c.rip_status IS NULL OR c.rip_status = '' OR c.rip_status = 'ERROR')`
      } else if (kanban_column === 'printing') {
        query += ` AND c.status = 'PRINTING' AND c.rip_status IN ('QUEUED', 'SENT')`
      } else if (kanban_column === 'print_done') {
        query += ` AND c.status = 'PRINT_DONE'`
      }
    } else if (status) {
      query += ' AND c.status = ?'
      params.push(status)
    }

    if (category) {
      query += ' AND c.category_name = ?'
      params.push(category)
    }

    if (search) {
      query += ' AND (c.client_name LIKE ? OR c.card_number LIKE ? OR o.order_number LIKE ? OR c.item_name LIKE ?)'
      const pat = `%${search}%`
      params.push(pat, pat, pat, pat)
    }

    // urgency filter: maps urgency label to delivery_date range relative to today
    if (urgency) {
      if (urgency === 'urgent') {
        // D-0 or overdue: delivery_date <= today
        query += ` AND date(c.delivery_date) <= date('now')`
      } else if (urgency === 'high') {
        // D-1: exactly tomorrow
        query += ` AND date(c.delivery_date) = date('now', '+1 day')`
      } else if (urgency === 'normal') {
        // D-2 or D-3: within 2-3 days from now
        query += ` AND date(c.delivery_date) >= date('now', '+2 days') AND date(c.delivery_date) <= date('now', '+3 days')`
      } else if (urgency === 'low') {
        // D-4 or later
        query += ` AND date(c.delivery_date) >= date('now', '+4 days')`
      }
    }

    if (equipment_id) {
      query += ' AND c.equipment_id = ?'
      params.push(equipment_id)
    }

    if (exclude_order_status) {
      query += ' AND o.status != ?'
      params.push(exclude_order_status)
    }

    const ef = entityFilter(c, 'o')
    query += ef.clause
    params.push(...ef.params)

    const sortOptions: Record<string, string> = {
      'priority_desc': 'c.priority DESC, c.delivery_date ASC, c.created_at ASC',
      'delivery_asc': 'c.delivery_date ASC, c.priority DESC',
      'created_desc': 'c.created_at DESC',
      'created_asc': 'c.created_at ASC'
    }
    const orderBy = sortOptions[sort] || sortOptions['priority_desc']
    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Batch-query live display data from order_items
    const typedResults = results as CardResultRow[]
    const cardIds = typedResults.map((r) => r.id)
    if (cardIds.length > 0) {
      const ph = cardIds.map(() => '?').join(',')
      const { results: liveItems } = await c.env.DB.prepare(`
        SELECT ci.card_id, ci.id as card_item_id, ci.print_completed,
               oi.item_name, oi.width, oi.height,
               oi.scale_factor, oi.quantity, oi.unit, oi.content, oi.post_processing, oi.finishing
        FROM card_items ci
        JOIN order_items oi ON ci.order_item_id = oi.id
        WHERE ci.card_id IN (${ph})
        ORDER BY ci.card_id, oi.sort_order ASC
      `).bind(...cardIds).all<LiveItemRow>()

      const byCard = new Map<number, LiveItemRow[]>()
      for (const item of liveItems || []) {
        if (!byCard.has(item.card_id)) byCard.set(item.card_id, [])
        byCard.get(item.card_id)!.push(item)
      }

      for (const card of typedResults) {
        const items = byCard.get(card.id)
        if (items && items.length > 0) {
          card.item_name = items.map((i) => i.item_name).join(', ')
          card.width = items[0].width || 0
          card.height = items[0].height || 0
          card.item_scale_factor = items[0].scale_factor || 1
          card.quantity = items.reduce((s: number, i) => s + (i.quantity || 0), 0)
          card.unit = items[0].unit || 'EA'
          card.item_count = items.length
          card.content = items.map((i) => i.content).filter(Boolean).join(', ')
          // 개별 품목 배열
          card._items = items.map((i) => ({
            card_item_id: i.card_item_id,
            item_name: i.item_name,
            width: i.width || 0,
            height: i.height || 0,
            quantity: i.quantity || 0,
            unit: i.unit || 'EA',
            content: i.content || '',
            scale_factor: i.scale_factor || 1,
            post_processing: i.post_processing || null,
            finishing: i.finishing || null,
            print_completed: i.print_completed || 0
          }))
          // 진행률 계산
          const totalItems = items.length
          const doneItems = items.filter((i) => i.print_completed === 1).length
          card.print_progress = { total: totalItems, done: doneItems }
        }
      }
    }

    // Batch-query order card progress (for shipping completeness check)
    if (cardIds.length > 0) {
      const orderIds = [...new Set(typedResults.map((r) => r.order_id).filter(Boolean))]
      if (orderIds.length > 0) {
        const oph = orderIds.map(() => '?').join(',')
        const { results: orderProgress } = await c.env.DB.prepare(`
          SELECT order_id,
                 COUNT(*) as order_card_total,
                 SUM(CASE WHEN status = 'PRINT_DONE' THEN 1 ELSE 0 END) as order_card_done
          FROM cards
          WHERE order_id IN (${oph}) AND status != 'HOLD'
          GROUP BY order_id
        `).bind(...orderIds).all<OrderProgressRow>()

        const progressMap = new Map<number, { total: number, done: number }>()
        for (const p of orderProgress || []) {
          progressMap.set(p.order_id, { total: p.order_card_total, done: p.order_card_done })
        }
        for (const card of typedResults) {
          const prog = progressMap.get(card.order_id)
          if (prog) {
            card.order_card_total = prog.total
            card.order_card_done = prog.done
          }
        }
      }
    }

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as count FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE 1=1
    `
    const countParams: any[] = []

    if (kanban_column) {
      if (kanban_column === 'rip_waiting') {
        countQuery += ` AND c.status = 'PRINTING' AND (c.rip_status IS NULL OR c.rip_status = '' OR c.rip_status = 'ERROR')`
      } else if (kanban_column === 'printing') {
        countQuery += ` AND c.status = 'PRINTING' AND c.rip_status IN ('QUEUED', 'SENT')`
      } else if (kanban_column === 'print_done') {
        countQuery += ` AND c.status = 'PRINT_DONE'`
      }
    } else if (status) {
      countQuery += ' AND c.status = ?'
      countParams.push(status)
    }

    if (category) {
      countQuery += ' AND c.category_name = ?'
      countParams.push(category)
    }

    if (search) {
      countQuery += ' AND (c.client_name LIKE ? OR c.card_number LIKE ? OR o.order_number LIKE ? OR c.item_name LIKE ?)'
      const pat = `%${search}%`
      countParams.push(pat, pat, pat, pat)
    }

    if (urgency) {
      if (urgency === 'urgent') {
        countQuery += ` AND date(c.delivery_date) <= date('now')`
      } else if (urgency === 'high') {
        countQuery += ` AND date(c.delivery_date) = date('now', '+1 day')`
      } else if (urgency === 'normal') {
        countQuery += ` AND date(c.delivery_date) >= date('now', '+2 days') AND date(c.delivery_date) <= date('now', '+3 days')`
      } else if (urgency === 'low') {
        countQuery += ` AND date(c.delivery_date) >= date('now', '+4 days')`
      }
    }

    if (equipment_id) {
      countQuery += ' AND c.equipment_id = ?'
      countParams.push(equipment_id)
    }

    if (exclude_order_status) {
      countQuery += ' AND o.status != ?'
      countParams.push(exclude_order_status)
    }

    const efCount = entityFilter(c, 'o')
    countQuery += efCount.clause
    countParams.push(...efCount.params)

    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<CountRow>()
    const count = countResult?.count ?? 0

    return c.json({
      success: true,
      data: typedResults,
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      }
    })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Kanban summary (must be before /:id)
cardsQueriesRouter.get('/kanban-summary', async (c) => {
  try {
    const { category = '' } = c.req.query()

    // 1. 칸반 컬럼별 카드 수
    let categoryFilter = ''
    const categoryParams: any[] = []
    if (category) {
      categoryFilter = ' AND c.category_name = ?'
      categoryParams.push(category)
    }

    const efKanban = entityFilter(c, 'o')

    const colCountSql = `
      SELECT
        SUM(CASE WHEN c.status = 'PRINTING' AND (c.rip_status IS NULL OR c.rip_status = '' OR c.rip_status = 'ERROR') THEN 1 ELSE 0 END) as rip_waiting,
        SUM(CASE WHEN c.status = 'PRINTING' AND c.rip_status IN ('QUEUED', 'SENT') THEN 1 ELSE 0 END) as printing,
        SUM(CASE WHEN c.status = 'PRINT_DONE' THEN 1 ELSE 0 END) as print_done,
        SUM(CASE WHEN c.status = 'HOLD' THEN 1 ELSE 0 END) as hold
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE 1=1${categoryFilter}${efKanban.clause}
    `
    const colRow = await c.env.DB.prepare(colCountSql).bind(...categoryParams, ...efKanban.params).first<KanbanColRow>()

    // 2. 지연(overdue): 오늘 납기 이전인데 아직 미출고 카드
    let overdueSql = `
      SELECT COUNT(*) as cnt
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE c.status NOT IN ('PRINT_DONE', 'HOLD')
        AND date(c.delivery_date) < date('now')${categoryFilter}${efKanban.clause}
    `
    const overdueRow = await c.env.DB.prepare(overdueSql).bind(...categoryParams, ...efKanban.params).first<OverdueRow>()

    // 3. 납품방법별 집계 (오늘 납기 + 미출고 주문 기준)
    let deliverySql = `
      SELECT o.delivery_method, o.delivery_time,
             COUNT(DISTINCT c.id) as total,
             SUM(CASE WHEN c.status = 'PRINT_DONE' THEN 1 ELSE 0 END) as done
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE c.status != 'HOLD'
        AND date(o.delivery_date) <= date('now')
        AND o.status NOT IN ('SHIPPED', 'CANCELLED')
    `
    const deliveryParams: any[] = []
    if (category) {
      deliverySql += ' AND c.category_name = ?'
      deliveryParams.push(category)
    }
    deliverySql += efKanban.clause
    deliveryParams.push(...efKanban.params)
    deliverySql += ' GROUP BY o.delivery_method, o.delivery_time ORDER BY o.delivery_time ASC'

    const { results: deliveryRows } = await c.env.DB.prepare(deliverySql).bind(...deliveryParams).all<DeliveryRow>()

    // 4. 오늘 납기 전체/완료 요약
    let todaySql = `
      SELECT
        COUNT(DISTINCT c.id) as today_total,
        SUM(CASE WHEN c.status = 'PRINT_DONE' THEN 1 ELSE 0 END) as today_done
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE c.status != 'HOLD'
        AND date(o.delivery_date) <= date('now')
        AND o.status NOT IN ('SHIPPED', 'CANCELLED')
    `
    const todayParams: any[] = []
    if (category) {
      todaySql += ' AND c.category_name = ?'
      todayParams.push(category)
    }
    todaySql += efKanban.clause
    todayParams.push(...efKanban.params)
    const todayRow = await c.env.DB.prepare(todaySql).bind(...todayParams).first<TodayRow>()

    return c.json({
      success: true,
      data: {
        rip_waiting: colRow?.rip_waiting ?? 0,
        printing: colRow?.printing ?? 0,
        print_done: colRow?.print_done ?? 0,
        hold: colRow?.hold ?? 0,
        overdue: overdueRow?.cnt ?? 0,
        by_delivery_method: (deliveryRows || []).map((r) => ({
          method: r.delivery_method || '미지정',
          time: r.delivery_time || null,
          total: r.total ?? 0,
          done: r.done ?? 0
        })),
        today_total: todayRow?.today_total ?? 0,
        today_done: todayRow?.today_done ?? 0
      }
    })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Daily print stats (must be before /:id)
cardsQueriesRouter.get('/stats/daily', async (c) => {
  try {
    const efDaily = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT
        date(c.updated_at) as date,
        COUNT(CASE WHEN c.status = 'PRINT_DONE' THEN 1 END) as completed,
        COUNT(CASE WHEN c.status = 'PRINTING' THEN 1 END) as in_progress,
        COUNT(CASE WHEN c.status = 'HOLD' THEN 1 END) as on_hold
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE date(c.updated_at) >= date('now', '-7 days')${efDaily.clause}
      GROUP BY date(c.updated_at)
      ORDER BY date DESC
    `).bind(...efDaily.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// GET /defects/list — 전체 불량 목록 (필터링) — must be before /:id
cardsQueriesRouter.get('/defects/list', async (c) => {
  try {
    const { status = '', defect_category = '', date_from = '', date_to = '', equipment_id = '', limit = '50', page = '1' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT qi.*, c.card_number, c.equipment_id, c.category_name,
        o.order_number, o.client_id,
        cl.client_name,
        e1.name as reporter_name,
        e2.name as resolver_name,
        eq.name as equipment_name
      FROM quality_issues qi
      LEFT JOIN cards c ON qi.card_id = c.id
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN employees e1 ON qi.reported_by = e1.id
      LEFT JOIN employees e2 ON qi.resolved_by = e2.id
      LEFT JOIN equipment eq ON c.equipment_id = eq.id
    `
    const wheres: string[] = []
    const params: any[] = []

    if (status) { wheres.push('qi.status = ?'); params.push(status) }
    if (defect_category) { wheres.push('qi.defect_category = ?'); params.push(defect_category) }
    if (date_from) { wheres.push('qi.created_at >= ?'); params.push(date_from) }
    if (date_to) { wheres.push('qi.created_at <= ?'); params.push(date_to + ' 23:59:59') }
    if (equipment_id) { wheres.push('c.equipment_id = ?'); params.push(parseInt(equipment_id)) }

    if (wheres.length > 0) query += ' WHERE ' + wheres.join(' AND ')
    query += ' ORDER BY qi.created_at DESC LIMIT ? OFFSET ?'
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// GET /api/cards/by-number/:cardNumber — LogWatcher/EdgeAgent lookup.
// Must be registered BEFORE `/:id` so the 2-segment path wins.
cardsQueriesRouter.get('/by-number/:cardNumber', async (c) => {
  try {
    const cardNumber = c.req.param('cardNumber')
    const row = await c.env.DB.prepare(`
      SELECT c.*, o.order_number
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE c.card_number = ?
    `).bind(cardNumber).first()
    if (!row) return c.json({ success: false, error: 'Card not found' }, 404)
    return c.json({ success: true, data: row })
  } catch (error) {
    console.error('cards by-number error:', error)
    return c.json({ success: false, error: 'Server error' }, 500)
  }
})



// 불량 통계 (최근 30일, defect_category별)
cardsQueriesRouter.get('/defect-stats', async (c) => {
  try {
    const { date_from = '', date_to = '' } = c.req.query()
    const startDate = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const endDate = (date_to || new Date().toISOString().slice(0, 10)) + ' 23:59:59'

    // 유형별 통계
    const { results: byCategory } = await c.env.DB.prepare(`
      SELECT qi.defect_category, COUNT(*) as count,
        SUM(CASE WHEN qi.status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN qi.status = 'OPEN' THEN 1 ELSE 0 END) as open_count
      FROM quality_issues qi
      WHERE qi.created_at >= ? AND qi.created_at <= ? AND qi.card_id IS NOT NULL
      GROUP BY qi.defect_category ORDER BY count DESC
    `).bind(startDate, endDate).all()

    // 장비별 통계
    const { results: byEquipment } = await c.env.DB.prepare(`
      SELECT eq.name as equipment_name, c.equipment_id, COUNT(*) as count
      FROM quality_issues qi
      LEFT JOIN cards c ON qi.card_id = c.id
      LEFT JOIN equipment eq ON c.equipment_id = eq.id
      WHERE qi.created_at >= ? AND qi.created_at <= ? AND qi.card_id IS NOT NULL AND c.equipment_id IS NOT NULL
      GROUP BY c.equipment_id ORDER BY count DESC
    `).bind(startDate, endDate).all()

    // 일별 추이
    const { results: daily } = await c.env.DB.prepare(`
      SELECT date(qi.created_at) as date, COUNT(*) as count
      FROM quality_issues qi
      WHERE qi.created_at >= ? AND qi.created_at <= ? AND qi.card_id IS NOT NULL
      GROUP BY date(qi.created_at) ORDER BY date ASC
    `).bind(startDate, endDate).all()

    // 전체 불량률 (해당 기간 카드 대비)
    const totalCards = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT qi.card_id) as defect_cards,
        (SELECT COUNT(*) FROM cards WHERE created_at >= ?) as total_cards
      FROM quality_issues qi
      WHERE qi.created_at >= ? AND qi.created_at <= ?
    `).bind(startDate, startDate, endDate).first<DefectRateRow>()

    return c.json({
      success: true,
      data: {
        by_category: byCategory,
        by_equipment: byEquipment,
        daily_trend: daily,
        defect_rate: totalCards ? {
          defect_cards: totalCards.defect_cards || 0,
          total_cards: totalCards.total_cards || 0,
          rate: totalCards.total_cards > 0 ? Math.round((totalCards.defect_cards / totalCards.total_cards) * 10000) / 100 : 0
        } : null
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ── 생산 현황 보드 전용 API (/:id 보다 먼저 등록) ────────────────────────────
cardsQueriesRouter.get('/board', async (c) => {
  try {
    const { status = '', category = '', sort = 'priority_desc' } = c.req.query()
    const ef = entityFilter(c, 'o')

    let where = `WHERE c.status != 'CANCELLED'`
    const params: any[] = []

    if (status) {
      if (status === 'HOLD') {
        where += ` AND c.status = 'HOLD'`
      } else if (status === 'PRINTING') {
        where += ` AND c.status = 'PRINTING'`
      } else if (status === 'PRINT_DONE') {
        where += ` AND c.status = 'PRINT_DONE'`
      } else if (status === 'PRINT_PENDING') {
        where += ` AND c.status = 'PRINTING' AND (c.rip_status IS NULL OR c.rip_status = '' OR c.rip_status = 'ERROR')`
      }
    }
    if (category) { where += ' AND c.category_name = ?'; params.push(category) }
    where += ef.clause
    params.push(...ef.params)

    const sortMap: Record<string, string> = {
      'priority_desc': 'c.priority DESC, c.delivery_date ASC',
      'delivery_asc': 'c.delivery_date ASC, c.priority DESC',
      'status_group': `CASE c.status WHEN 'HOLD' THEN 0 WHEN 'PRINTING' THEN 1 WHEN 'PRINT_DONE' THEN 2 ELSE 3 END, c.delivery_date ASC`
    }
    const orderBy = sortMap[sort] || sortMap['priority_desc']

    const { results: cards } = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.client_name, c.item_name, c.category_name,
             c.width, c.height, c.quantity, c.unit, c.status, c.priority,
             c.delivery_date, c.pp_status, c.thumbnail_url, c.equipment_id,
             c.hold_reason, c.created_at,
             o.order_number, e.name as equipment_name
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN equipment e ON c.equipment_id = e.id
      ${where}
      ORDER BY ${orderBy}
      LIMIT 200
    `).bind(...params).all()

    const cardIds = cards.map((c: any) => c.id)
    const itemMap = new Map<number, { item_count: number; done: number; total: number; items: string }>()

    if (cardIds.length > 0) {
      const ph = cardIds.map(() => '?').join(',')
      const { results: itemStats } = await c.env.DB.prepare(`
        SELECT ci.card_id,
               COUNT(*) as item_count,
               SUM(CASE WHEN ci.print_completed = 1 THEN 1 ELSE 0 END) as done,
               GROUP_CONCAT(oi.item_name, ', ') as items
        FROM card_items ci
        JOIN order_items oi ON ci.order_item_id = oi.id
        WHERE ci.card_id IN (${ph})
        GROUP BY ci.card_id
      `).bind(...cardIds).all<{ card_id: number; item_count: number; done: number; items: string }>()

      for (const s of itemStats) {
        itemMap.set(s.card_id, { item_count: s.item_count, done: s.done, total: s.item_count, items: s.items })
      }
    }

    const efSummary = entityFilter(c, 'o')
    const { results: statusCounts } = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN c.status = 'PRINTING' AND (c.rip_status IS NULL OR c.rip_status = '' OR c.rip_status = 'ERROR') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN c.status = 'PRINTING' AND c.rip_status IN ('QUEUED','SENT') THEN 1 ELSE 0 END) as printing,
        SUM(CASE WHEN c.status = 'PRINT_DONE' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN c.status = 'HOLD' THEN 1 ELSE 0 END) as hold
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE c.status != 'CANCELLED'${efSummary.clause}
    `).bind(...efSummary.params).all()

    const data = cards.map((card: any) => {
      const stats = itemMap.get(card.id)
      return {
        ...card,
        item_count: stats?.item_count || 1,
        item_names: stats?.items || card.item_name,
        print_progress: stats ? { done: stats.done, total: stats.total } : { done: 0, total: 1 }
      }
    })

    return c.json({
      success: true,
      data,
      summary: statusCounts[0] || { total: 0, pending: 0, printing: 0, done: 0, hold: 0 }
    })
  } catch (error) {
    console.error('board API error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get card by ID
cardsQueriesRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const card = await c.env.DB.prepare(`
      SELECT
        c.*,
        o.order_number,
        o.client_id,
        o.internal_notes as order_notes,
        u.name as created_by_name
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE c.id = ?
    `).bind(id).first()

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found'
      }, 404)
    }

    // Get related order items through card_items junction table
    const { results: cardItems } = await c.env.DB.prepare(`
      SELECT
        oi.id,
        oi.item_name,
        oi.width,
        oi.height,
        oi.quantity,
        oi.unit,
        oi.content,
        oi.scale_factor,
        oi.ai_analysis_id,
        oi.ai_group_index,
        ci.id as card_item_id,
        ci.print_completed,
        ci.quantity as card_quantity
      FROM card_items ci
      LEFT JOIN order_items oi ON ci.order_item_id = oi.id
      WHERE ci.card_id = ?
      ORDER BY oi.sort_order ASC
    `).bind(id).all<CardItemRow>()

    // Resolve per-item thumbnails from ai_analysis_requests
    const analysisIds = new Set<number>()
    for (const item of cardItems || []) {
      if (item.ai_analysis_id && item.ai_group_index !== null && item.ai_group_index !== undefined) {
        analysisIds.add(item.ai_analysis_id)
      }
    }

    interface AnalysisGroup { index: number; thumbnail_base64?: string; [key: string]: unknown }
    const analysisCache = new Map<number, AnalysisGroup[]>()
    if (analysisIds.size > 0) {
      const idArr = Array.from(analysisIds)
      const placeholders = idArr.map(() => '?').join(',')
      const { results: analyses } = await c.env.DB.prepare(
        `SELECT id, groups_json FROM ai_analysis_requests WHERE id IN (${placeholders})`
      ).bind(...idArr).all<AnalysisRow>()
      for (const analysis of analyses || []) {
        if (analysis.groups_json) {
          try {
            analysisCache.set(analysis.id, JSON.parse(analysis.groups_json))
          } catch (_) {
            analysisCache.set(analysis.id, [])
          }
        }
      }
    }

    for (const item of cardItems || []) {
      if (item.ai_analysis_id && item.ai_group_index !== null && item.ai_group_index !== undefined) {
        const groups = analysisCache.get(item.ai_analysis_id) || []
        const matched = item.ai_group_index === -1
          ? groups[0]
          : groups.find((g) => g.index === item.ai_group_index)
        if (matched?.thumbnail_base64) {
          item.thumbnail_url = `data:image/png;base64,${matched.thumbnail_base64}`
        }
      }
    }

    // 거래처 메모 (최근 3건)
    interface ClientNoteRow { note_type: string; content: string; created_at: string }
    let clientNotes: ClientNoteRow[] = []
    const typedCard = card as Record<string, unknown>
    if (typedCard.client_id) {
      const { results: cnRows } = await c.env.DB.prepare(
        `SELECT note_type, content, created_at FROM client_notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 3`
      ).bind(typedCard.client_id).all<ClientNoteRow>()
      clientNotes = cnRows || []
    }

    const firstItem = cardItems?.[0]
    const response: ApiResponse<Card> = {
      success: true,
      data: {
        ...card,
        item_name: cardItems?.length > 0
          ? cardItems.map((i) => i.item_name).join(', ')
          : typedCard.item_name,
        width: firstItem?.width || typedCard.width || 0,
        height: firstItem?.height || typedCard.height || 0,
        quantity: cardItems?.length > 0
          ? cardItems.reduce((s: number, i) => s + (i.quantity || 0), 0)
          : typedCard.quantity,
        items: cardItems || [],
        client_notes: clientNotes
      } as unknown as Card
    }

    return c.json(response)
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get card status history
cardsQueriesRouter.get('/:id/history', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT
        csh.*,
        u.username as changed_by_name
      FROM card_status_history csh
      LEFT JOIN users u ON csh.changed_by = u.id
      WHERE csh.card_id = ?
      ORDER BY csh.created_at DESC
    `).bind(id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// ── 불량 관리 (quality_issues) ──

// GET /:id/defects — 카드별 불량 이력 조회
cardsQueriesRouter.get('/:id/defects', async (c) => {
  try {
    const cardId = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT qi.*,
        e1.name as reporter_name,
        e2.name as resolver_name
      FROM quality_issues qi
      LEFT JOIN employees e1 ON qi.reported_by = e1.id
      LEFT JOIN employees e2 ON qi.resolved_by = e2.id
      WHERE qi.card_id = ?
      ORDER BY qi.created_at DESC
    `).bind(cardId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


export default cardsQueriesRouter
