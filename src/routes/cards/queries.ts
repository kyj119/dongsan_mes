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
import { cardEntityFilter, entityFilter } from '../../utils/entityFilter'
import { isThumbRef, getThumbnailDataUri, resolveGroupByAiIndex, type AnalysisGroup } from '../../utils/thumbnailStore'
import { kstYmd } from '../../utils/kstDate'

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
    // 1. 활성 장비 목록 + 큐 카운트 + 일일 용량 (equipment·cards 법인 격리 — 0302 #342)
    const efEq = entityFilter(c, 'e')        // equipment(entity_id)
    const efCnt = cardEntityFilter(c, 'c')   // queue_count 카드(requesting_entity_id)
    const { results: equipmentList } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.equipment_status, COALESCE(e.daily_capacity, 0) as daily_capacity,
        e.location_zone,
        (SELECT COUNT(*) FROM cards c WHERE c.equipment_id = e.id AND c.status = 'PRINTING'${efCnt.clause}) as queue_count,
        ah.last_seen_at,
        CASE
          WHEN ah.last_seen_at IS NULL THEN 'OFFLINE'
          WHEN (julianday('now') - julianday(ah.last_seen_at)) * 86400 > 120 THEN 'OFFLINE'
          ELSE 'ONLINE'
        END as agent_status
      FROM equipment e
      LEFT JOIN agent_heartbeats ah ON ah.equipment_id = e.id
      WHERE e.status = 'ACTIVE'${efEq.clause}
      ORDER BY e.name
    `).bind(...efCnt.params, ...efEq.params).all<EquipmentRow>()

    // 2. 전체 PRINTING 카드를 한 번에 조회 후 장비별 그룹핑 (N+1 → 1 쿼리)
    const ef2 = cardEntityFilter(c, 'c')
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
      ORDER BY c.equipment_id, c.priority DESC, c.delivery_date ASC, c.created_at ASC, c.id ASC
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
    const efUn = cardEntityFilter(c, 'c')
    const { results } = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.client_name, c.item_name, c.category_name,
        c.delivery_date, c.priority, c.status, c.rip_status,
        c.width, c.height, c.quantity, c.unit, c.created_at,
        o.order_number
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE c.status = 'PRINTING'
        AND (c.equipment_id IS NULL OR c.equipment_id = '')${efUn.clause}
      ORDER BY c.priority DESC, c.delivery_date ASC, c.created_at ASC, c.id ASC
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
  // #375: 멀티법인 격리 — 비관리자는 자기 법인 카드만 집계
  const efDbg = cardEntityFilter(c)        // ' AND requesting_entity_id = ?' or ''
  const efDbgC = cardEntityFilter(c, 'c')  // ' AND c.requesting_entity_id = ?' or ''
  const { results } = await c.env.DB.prepare(`
    SELECT status, rip_status, COUNT(*) as cnt
    FROM cards
    WHERE 1=1${efDbg.clause}
    GROUP BY status, rip_status
    ORDER BY status, rip_status
  `).bind(...efDbg.params).all()
  const { results: orderCounts } = await c.env.DB.prepare(`
    SELECT o.status as order_status, COUNT(c.id) as card_cnt
    FROM cards c
    LEFT JOIN orders o ON c.order_id = o.id
    WHERE 1=1${efDbgC.clause}
    GROUP BY o.status
  `).bind(...efDbgC.params).all()
  return c.json({ success: true, data: { card_counts: results, order_status_counts: orderCounts } })
})

// Get distinct category list from active cards
cardsQueriesRouter.get('/categories', async (c) => {
  try {
    const efCat = cardEntityFilter(c, 'c')
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
      // 단일 상태축: 대기=PRINT_PENDING, 출력중=PRINTING(LogWatcher 감지), 완료=PRINT_DONE.
      // RIP 진행(rip_status)은 출력대기 내부 디테일(배지)로만 표시 — 컬럼 분기 기준 아님.
      if (kanban_column === 'rip_waiting') {
        query += ` AND c.status = 'PRINT_PENDING'`
      } else if (kanban_column === 'printing') {
        query += ` AND c.status = 'PRINTING'`
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
      // half-open 구간으로 표현해 컬럼에 date() 함수 미적용 → idx_cards_delivery 활용 (date() 비교와 결과 동일)
      if (urgency === 'urgent') {
        // D-0 or overdue: delivery_date <= today  →  < 내일
        query += ` AND c.delivery_date < date('now', '+9 hours', '+1 day')`
      } else if (urgency === 'high') {
        // D-1: exactly tomorrow  →  [내일, 모레)
        query += ` AND c.delivery_date >= date('now', '+9 hours', '+1 day') AND c.delivery_date < date('now', '+9 hours', '+2 days')`
      } else if (urgency === 'normal') {
        // D-2 or D-3  →  [+2일, +4일)
        query += ` AND c.delivery_date >= date('now', '+9 hours', '+2 days') AND c.delivery_date < date('now', '+9 hours', '+4 days')`
      } else if (urgency === 'low') {
        // D-4 or later
        query += ` AND c.delivery_date >= date('now', '+9 hours', '+4 days')`
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

    const ef = cardEntityFilter(c, 'c')
    query += ef.clause
    params.push(...ef.params)

    // 정렬 규약: 모든 옵션에 고유키(c.id) tie-break 필수 (CLAUDE.md)
    const sortOptions: Record<string, string> = {
      'priority_desc': 'c.priority DESC, c.delivery_date ASC, c.created_at ASC, c.id ASC',
      'delivery_asc': 'c.delivery_date ASC, c.priority DESC, c.id DESC',
      'created_desc': 'c.created_at DESC, c.id DESC',
      'created_asc': 'c.created_at ASC, c.id ASC'
    }
    const orderBy = sortOptions[sort] || sortOptions['priority_desc']
    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Batch-query live display data from order_items
    const typedResults = results as CardResultRow[]
    const cardIds = typedResults.map((r) => r.id)
    if (cardIds.length > 0) {
      // #409: card_id IN (...)을 카드당 1바인드로 묶으면 D1 바인드 파라미터 한도(100)를 초과해
      //   limit=500 칸반(컬럼당 카드 100+)에서 결정적 500. 80개 청크로 분할(카드별 items는 같은 청크에 모임 → 정렬·그룹 보존).
      const liveItems: LiveItemRow[] = []
      for (let i = 0; i < cardIds.length; i += 80) {
        const chunk = cardIds.slice(i, i + 80)
        const ph = chunk.map(() => '?').join(',')
        const { results: part } = await c.env.DB.prepare(`
          SELECT ci.card_id, ci.id as card_item_id, ci.print_completed,
                 oi.item_name, oi.width, oi.height,
                 oi.scale_factor, oi.quantity, oi.unit, oi.content, oi.post_processing, oi.finishing,
                 mat.item_name AS print_media_name
          FROM card_items ci
          JOIN order_items oi ON ci.order_item_id = oi.id
          LEFT JOIN product_materials pmat ON pmat.product_item_id = oi.item_id AND pmat.is_default = 1
          LEFT JOIN items mat ON mat.id = pmat.material_item_id
          WHERE ci.card_id IN (${ph})
          ORDER BY ci.card_id, oi.sort_order ASC, oi.id ASC
        `).bind(...chunk).all<LiveItemRow>()
        if (part) liveItems.push(...part)
      }

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
        // #409: order_id IN (...)도 D1 바인드 한도(100) 초과 방지 — 80개 청크 분할 (GROUP BY는 order당 같은 청크라 정확)
        const orderProgress: OrderProgressRow[] = []
        for (let i = 0; i < orderIds.length; i += 80) {
          const chunk = orderIds.slice(i, i + 80)
          const oph = chunk.map(() => '?').join(',')
          const { results: part } = await c.env.DB.prepare(`
            SELECT order_id,
                   COUNT(*) as order_card_total,
                   SUM(CASE WHEN status = 'PRINT_DONE' THEN 1 ELSE 0 END) as order_card_done
            FROM cards
            WHERE order_id IN (${oph}) AND status != 'HOLD'
            GROUP BY order_id
          `).bind(...chunk).all<OrderProgressRow>()
          if (part) orderProgress.push(...part)
        }

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
        countQuery += ` AND c.status = 'PRINT_PENDING'`
      } else if (kanban_column === 'printing') {
        countQuery += ` AND c.status = 'PRINTING'`
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
      // 메인 쿼리와 동일한 half-open 구간 (sargable)
      if (urgency === 'urgent') {
        countQuery += ` AND c.delivery_date < date('now', '+9 hours', '+1 day')`
      } else if (urgency === 'high') {
        countQuery += ` AND c.delivery_date >= date('now', '+9 hours', '+1 day') AND c.delivery_date < date('now', '+9 hours', '+2 days')`
      } else if (urgency === 'normal') {
        countQuery += ` AND c.delivery_date >= date('now', '+9 hours', '+2 days') AND c.delivery_date < date('now', '+9 hours', '+4 days')`
      } else if (urgency === 'low') {
        countQuery += ` AND c.delivery_date >= date('now', '+9 hours', '+4 days')`
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

    const efCount = cardEntityFilter(c, 'c')
    countQuery += efCount.clause
    countParams.push(...efCount.params)

    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first<CountRow>()
    const count = countResult?.count ?? 0

    // 썸네일: R2 마커(r2:thumb:)는 목록에 인라인하지 않고 has_thumbnail 플래그로만 노출
    //   (프론트가 /thumbnails 로 lazy-load). 레거시 data URI/URL은 그대로 인라인(하위호환).
    //   마커를 그대로 흘리면 <img src>가 깨져 썸네일 전멸 → R2 이관(0449) 회귀 방지.
    for (const card of typedResults) {
      const cc = card as Record<string, unknown>
      const tu = cc.thumbnail_url
      if (isThumbRef(tu)) { cc.has_thumbnail = 1; cc.thumbnail_url = null }
      else if (typeof tu === 'string' && tu.length > 0) { cc.has_thumbnail = 1 }
      else { cc.has_thumbnail = 0 }
    }

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

    const efKanban = cardEntityFilter(c, 'c')

    const colCountSql = `
      SELECT
        SUM(CASE WHEN c.status = 'PRINT_PENDING' THEN 1 ELSE 0 END) as rip_waiting,
        SUM(CASE WHEN c.status = 'PRINTING' THEN 1 ELSE 0 END) as printing,
        SUM(CASE WHEN c.status = 'PRINT_DONE' THEN 1 ELSE 0 END) as print_done,
        SUM(CASE WHEN c.status = 'HOLD' THEN 1 ELSE 0 END) as hold
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE o.status != 'CANCELLED'${categoryFilter}${efKanban.clause}
    `
    const colRow = await c.env.DB.prepare(colCountSql).bind(...categoryParams, ...efKanban.params).first<KanbanColRow>()

    // 2. 지연(overdue): 오늘 납기 이전인데 아직 미출고 카드
    let overdueSql = `
      SELECT COUNT(*) as cnt
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE c.status NOT IN ('PRINT_DONE', 'HOLD')
        AND c.delivery_date < date('now', '+9 hours')${categoryFilter}${efKanban.clause}
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
        AND o.delivery_date < date('now', '+9 hours', '+1 day')
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
        AND o.delivery_date < date('now', '+9 hours', '+1 day')
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
    const efDaily = cardEntityFilter(c, 'c')
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
    // #375: 멀티법인 격리 — quality_issues.entity_id (NOT NULL DEFAULT 1) 직접 필터
    const efDef = entityFilter(c)
    if (efDef.params.length) { wheres.push('qi.entity_id = ?'); params.push(...efDef.params) }

    if (wheres.length > 0) query += ' WHERE ' + wheres.join(' AND ')
    query += ' ORDER BY qi.created_at DESC, qi.id DESC LIMIT ? OFFSET ?'
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


// (GET /by-number/:cardNumber 는 #375로 cards.ts 상위에 이동 — agent-key 겸용 인증)

// 불량 통계 (최근 30일, defect_category별)
cardsQueriesRouter.get('/defect-stats', async (c) => {
  try {
    const { date_from = '', date_to = '' } = c.req.query()
    const startDate = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const endDate = (date_to || kstYmd()) + ' 23:59:59'

    // #375: 멀티법인 격리 — quality_issues.entity_id / cards.requesting_entity_id 필터
    const ef = entityFilter(c, 'qi')          // ' AND qi.entity_id = ?' or ''
    const efCards = cardEntityFilter(c)       // ' AND requesting_entity_id = ?' or ''

    // 유형별 통계
    const { results: byCategory } = await c.env.DB.prepare(`
      SELECT qi.defect_category, COUNT(*) as count,
        SUM(CASE WHEN qi.status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN qi.status = 'OPEN' THEN 1 ELSE 0 END) as open_count
      FROM quality_issues qi
      WHERE qi.created_at >= ? AND qi.created_at <= ? AND qi.card_id IS NOT NULL${ef.clause}
      GROUP BY qi.defect_category ORDER BY count DESC
    `).bind(startDate, endDate, ...ef.params).all()

    // 장비별 통계
    const { results: byEquipment } = await c.env.DB.prepare(`
      SELECT eq.name as equipment_name, c.equipment_id, COUNT(*) as count
      FROM quality_issues qi
      LEFT JOIN cards c ON qi.card_id = c.id
      LEFT JOIN equipment eq ON c.equipment_id = eq.id
      WHERE qi.created_at >= ? AND qi.created_at <= ? AND qi.card_id IS NOT NULL AND c.equipment_id IS NOT NULL${ef.clause}
      GROUP BY c.equipment_id ORDER BY count DESC
    `).bind(startDate, endDate, ...ef.params).all()

    // 일별 추이
    const { results: daily } = await c.env.DB.prepare(`
      SELECT date(qi.created_at) as date, COUNT(*) as count
      FROM quality_issues qi
      WHERE qi.created_at >= ? AND qi.created_at <= ? AND qi.card_id IS NOT NULL${ef.clause}
      GROUP BY date(qi.created_at) ORDER BY date ASC
    `).bind(startDate, endDate, ...ef.params).all()

    // 전체 불량률 (해당 기간 카드 대비)
    const totalCards = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT qi.card_id) as defect_cards,
        (SELECT COUNT(*) FROM cards WHERE created_at >= ?${efCards.clause}) as total_cards
      FROM quality_issues qi
      WHERE qi.created_at >= ? AND qi.created_at <= ?${ef.clause}
    `).bind(startDate, ...efCards.params, startDate, endDate, ...ef.params).first<DefectRateRow>()

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
    const { status = '', category = '', sort = 'urgency',
            offset: offsetStr = '0', limit: limitStr = '20',
            summary_only = '' } = c.req.query()
    const ef = cardEntityFilter(c, 'c')
    const offset = parseInt(offsetStr) || 0
    const limit = Math.min(parseInt(limitStr) || 20, 50)

    // ── Summary counts (always needed) ──
    const efSummary = cardEntityFilter(c, 'c')
    const { results: statusCounts } = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN c.status = 'PRINT_PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN c.status = 'PRINTING' THEN 1 ELSE 0 END) as printing,
        SUM(CASE WHEN c.status = 'PRINT_DONE' AND c.shipped_at IS NULL THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN c.shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped,
        SUM(CASE WHEN c.status = 'HOLD' THEN 1 ELSE 0 END) as hold
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE c.status != 'CANCELLED' AND IFNULL(o.status,'') != 'CANCELLED'${efSummary.clause}
    `).bind(...efSummary.params).all()
    const summary = statusCounts[0] || { total: 0, pending: 0, printing: 0, done: 0, shipped: 0, hold: 0 }

    // summary_only: lightweight refresh (탭 카운트만)
    if (summary_only === '1') {
      return c.json({ success: true, data: [], hasMore: false, summary })
    }

    // ── Status filter ──
    // 취소 주문의 카드(취소 시 HOLD로 주차됨)는 보드에서 제외 — restore 시 복원되므로 데이터는 보존
    let where = `WHERE c.status != 'CANCELLED' AND IFNULL(o.status,'') != 'CANCELLED'`
    const params: any[] = []

    if (status === 'SHIPPED') {
      where += ` AND c.shipped_at IS NOT NULL`
    } else if (status === 'PRINT_DONE') {
      where += ` AND c.status = 'PRINT_DONE' AND c.shipped_at IS NULL`
    } else if (status === 'PRINTING') {
      where += ` AND c.status = 'PRINTING'`
    } else if (status === 'PRINT_PENDING') {
      where += ` AND c.status = 'PRINT_PENDING'`
    } else if (status === 'HOLD') {
      where += ` AND c.status = 'HOLD'`
    }
    // '' = 전체 (shipped 포함)

    if (category) { where += ' AND c.category_name = ?'; params.push(category) }
    where += ef.clause
    params.push(...ef.params)

    // ── Sort ──
    const sortMap: Record<string, string> = {
      'urgency': `
        CASE
          WHEN c.shipped_at IS NOT NULL THEN 4
          WHEN date(c.delivery_date) < date('now', '+9 hours') THEN 0
          WHEN date(c.delivery_date) = date('now', '+9 hours') THEN 1
          WHEN date(c.delivery_date) <= date('now', '+9 hours', '+2 days') THEN 2
          ELSE 3
        END,
        CASE WHEN c.pp_status = 'PENDING' THEN 0 ELSE 1 END,
        c.delivery_date ASC, c.priority DESC, c.id DESC`,
      'priority_desc': 'c.priority DESC, c.delivery_date ASC, c.id DESC',
      'delivery_asc': 'c.delivery_date ASC, c.priority DESC, c.id DESC',
      'status_group': `CASE c.status WHEN 'HOLD' THEN 0 WHEN 'PRINTING' THEN 1 WHEN 'PRINT_DONE' THEN 2 ELSE 3 END, c.delivery_date ASC, c.id DESC`
    }
    // 출고완료 탭은 최근 출고순 (정렬 규약: 고유키 tie-break 필수 — LIMIT+1 페이징이라 순서 안정 필요)
    const orderBy = status === 'SHIPPED' ? 'c.shipped_at DESC, c.id DESC' : (sortMap[sort] || sortMap['urgency'])

    const { results: cards } = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.client_name, c.item_name, c.category_name,
             c.width, c.height, c.quantity, c.unit, c.status, c.priority,
             c.delivery_date, c.pp_status, c.equipment_id,
             c.hold_reason, c.created_at, c.shipped_at, c.post_processing,
             CASE WHEN c.thumbnail_url IS NOT NULL AND c.thumbnail_url != '' THEN 1 ELSE 0 END as has_thumbnail,
             o.order_number, e.name as equipment_name
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN equipment e ON c.equipment_id = e.id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).bind(...params, limit + 1, offset).all()

    const hasMore = cards.length > limit
    const pageCards = hasMore ? cards.slice(0, limit) : cards

    // ── Item stats (품목 수, 출력 진행, 총수량) ──
    const cardIds = pageCards.map((c: any) => c.id)
    const itemMap = new Map<number, { item_count: number; done: number; total: number; items: string; total_quantity: number }>()

    if (cardIds.length > 0) {
      const ph = cardIds.map(() => '?').join(',')
      const { results: itemStats } = await c.env.DB.prepare(`
        SELECT ci.card_id,
               COUNT(*) as item_count,
               SUM(CASE WHEN ci.print_completed = 1 THEN 1 ELSE 0 END) as done,
               SUM(oi.quantity) as total_quantity,
               GROUP_CONCAT(oi.item_name, ', ') as items
        FROM card_items ci
        JOIN order_items oi ON ci.order_item_id = oi.id
        WHERE ci.card_id IN (${ph})
        GROUP BY ci.card_id
      `).bind(...cardIds).all<{ card_id: number; item_count: number; done: number; total_quantity: number; items: string }>()

      for (const s of itemStats) {
        itemMap.set(s.card_id, { item_count: s.item_count, done: s.done, total: s.item_count, items: s.items, total_quantity: s.total_quantity || 0 })
      }
    }

    // ── Response mapping ──
    const data = pageCards.map((card: any) => {
      const stats = itemMap.get(card.id)
      let ppNames: string[] = []
      try {
        if (card.post_processing && card.post_processing !== '[]') {
          const ppList = JSON.parse(card.post_processing)
          ppNames = ppList.map((p: any) => p.name || p.code || '').filter(Boolean)
        }
      } catch (_) { /* ignore */ }

      const { post_processing: _pp, ...rest } = card
      return {
        ...rest,
        item_count: stats?.item_count || 1,
        item_names: stats?.items || card.item_name,
        total_quantity: stats?.total_quantity || card.quantity || 0,
        pp_names: ppNames,
        print_progress: stats ? { done: stats.done, total: stats.total } : { done: 0, total: 1 }
      }
    })

    return c.json({ success: true, data, hasMore, summary })
  } catch (error) {
    console.error('board API error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 배치 썸네일 API (보드용 lazy-load) ───────────────────────────────────────
cardsQueriesRouter.get('/thumbnails', async (c) => {
  try {
    const idsParam = c.req.query('ids') || ''
    const ids = idsParam.split(',').map(Number).filter(n => n > 0).slice(0, 20)
    if (ids.length === 0) return c.json({ success: true, data: {} })

    const ph = ids.map(() => '?').join(',')
    // #559: 형제 GET /:id(:938)와 동일하게 법인 격리. 비관리자는 자법인 카드 썸네일만, super-admin(0)=전권.
    const efThumb = cardEntityFilter(c)
    const { results } = await c.env.DB.prepare(
      `SELECT id, thumbnail_url FROM cards WHERE id IN (${ph}) AND thumbnail_url IS NOT NULL AND thumbnail_url != ''${efThumb.clause}`
    ).bind(...ids, ...efThumb.params).all<{ id: number; thumbnail_url: string }>()

    // R2 이관: 'r2:thumb:' 마커는 R2에서 읽어 data URI로 복원(인증=헤더 전용이라 백엔드가 서빙). 레거시 data URI는 그대로.
    const map: Record<number, string> = {}
    for (const r of results) {
      if (isThumbRef(r.thumbnail_url)) {
        const uri = await getThumbnailDataUri(c.env, r.thumbnail_url)
        if (uri) map[r.id] = uri
      } else {
        map[r.id] = r.thumbnail_url
      }
    }
    return c.json({ success: true, data: map })
  } catch (error) {
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ── 지시 현황판 (2026-08-05 work-order-auto-issue): 누락·진행·개정필요 3개 큐 ──
// ⚠️ /:id 라우트보다 앞에 등록 (정적 경로 우선이지만 코드 관례대로 명시 배치)
cardsQueriesRouter.get('/issue-status', async (c) => {
  try {
    // 1) 누락: **카드가 안 붙은 제작 라인(shipment_ready=0)** 이 하나라도 있는 주문.
    //    ⚠️ 예전엔 "주문에 카드 0건"이 조건이라 **부분 누락(기존 카드는 있고 새 라인만 없음)** 을 못 봤다.
    //    shipment_ready 불변식 활용 — 카드 비대상 라인은 generateCardsForOrder가 생성 시 1로 세팅.
    //    상태는 화이트리스트만 (이관 SHIPPED 범람 방지 — feedback-imported-orders-status-timestamp)
    const efO = entityFilter(c, 'o')
    const { results: missing } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, cl.client_name, o.delivery_date, o.status, o.created_at
      FROM orders o
      LEFT JOIN clients cl ON o.client_id = cl.id
      WHERE o.status IN ('CONFIRMED', 'PRINTING')${efO.clause}
        AND EXISTS (
          SELECT 1 FROM order_items oi
          WHERE oi.order_id = o.id AND COALESCE(oi.shipment_ready, 0) = 0
            AND NOT EXISTS (
              SELECT 1 FROM card_items ci JOIN cards c2 ON c2.id = ci.card_id
              WHERE ci.order_item_id = oi.id AND c2.status != 'CANCELLED'
            )
        )
      ORDER BY (o.delivery_date IS NULL), o.delivery_date ASC, o.id ASC
      LIMIT 100
    `).bind(...efO.params).all()

    // 2) 진행: 활성 카드 × 체크 진행률. PRINT_DONE은 미체크 스텝이 남은 경우만 (후가공 체크 잔여).
    //    체크리스트 없는 레거시 PRINT_DONE 카드는 제외 (범람 방지).
    const efC = cardEntityFilter(c, 'c')
    const { results: progress } = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.client_name, c.item_name, c.category_name, c.status,
        c.delivery_date, c.quantity, c.needs_reissue, o.order_number,
        COUNT(ccl.id) as step_total,
        SUM(CASE WHEN ccl.checked_at IS NOT NULL THEN 1 ELSE 0 END) as step_done
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      LEFT JOIN card_checklist_items ccl ON ccl.card_id = c.id
      WHERE c.status IN ('PRINT_PENDING', 'PRINTING', 'HOLD', 'PRINT_DONE')
        AND o.status NOT IN ('SHIPPED', 'COMPLETED', 'CANCELLED', 'DELETED')${efC.clause}
      GROUP BY c.id
      HAVING c.status != 'PRINT_DONE'
          OR (COUNT(ccl.id) > 0 AND SUM(CASE WHEN ccl.checked_at IS NOT NULL THEN 1 ELSE 0 END) < COUNT(ccl.id))
      ORDER BY (c.delivery_date IS NULL), c.delivery_date ASC, c.id ASC
      LIMIT 200
    `).bind(...efC.params).all()

    // 3) 개정 필요: 주문 수정 시 카드 보존 경로가 세팅 (reissue-ack로 해제)
    //    활성 카드만 — 플래그 후 출고/취소된 카드는 조치 대상이 아님 (세팅 시점 필터와 이중 방어)
    const efR = cardEntityFilter(c, 'c')
    const { results: reissue } = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.client_name, c.item_name, c.status, c.delivery_date, o.order_number
      FROM cards c
      JOIN orders o ON c.order_id = o.id
      WHERE c.needs_reissue = 1
        AND c.status IN ('PRINT_PENDING', 'PRINTING', 'HOLD', 'PRINT_DONE')
        -- #603: 출고 이후 주문의 카드는 개정할 지시서가 더 없다 — 큐 영구 잔류 차단
        AND o.status NOT IN ('SHIPPED', 'COMPLETED', 'CANCELLED', 'DELETED')${efR.clause}
      ORDER BY (c.delivery_date IS NULL), c.delivery_date ASC, c.id ASC
      LIMIT 100
    `).bind(...efR.params).all()

    return c.json({ success: true, data: { missing, progress, reissue } })
  } catch (error) {
    console.error('cards issue-status error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get card by ID
cardsQueriesRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    // #414: 단건 카드 상세도 법인 격리 — #375가 by-number만 고치고 by-id 누락(형제 부분픽스).
    // cardEntityFilter는 ' AND c.requesting_entity_id = ?'(비관리자) / ''(super-admin). 거래처 PII·영업정보 cross-tenant 유출 차단.
    const efCard = cardEntityFilter(c, 'c')
    const card = await c.env.DB.prepare(`
      SELECT
        c.*,
        o.order_number,
        o.client_id,
        o.internal_notes as order_notes,
        o.delivery_date as order_delivery_date,
        o.delivery_method,
        o.delivery_time,
        o.delivery_info,
        o.shipping_payment,
        o.contact_phone,
        o.contact_mobile,
        o.notes as order_public_notes,
        u.name as created_by_name
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE c.id = ?${efCard.clause}
    `).bind(id, ...efCard.params).first()

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found'
      }, 404)
    }

    // 카드 레벨 썸네일 R2 마커('r2:thumb:') → data URI 복원. 단건이라 인라인 hydrate 저렴.
    //   (인쇄 작업지시서 등 <img src=card.thumbnail_url> 이 마커면 깨지므로 — R2 이관 회귀 방지)
    {
      const ct = (card as Record<string, unknown>).thumbnail_url
      if (isThumbRef(ct)) {
        const uri = await getThumbnailDataUri(c.env, ct)
        ;(card as Record<string, unknown>).thumbnail_url = uri || null
      }
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
        oi.post_processing,
        oi.finishing,
        oi.category_name,
        oi.parent_item_id,
        ci.id as card_item_id,
        ci.print_completed,
        ci.quantity as card_quantity,
        mat.item_name AS print_media_name
      FROM card_items ci
      LEFT JOIN order_items oi ON ci.order_item_id = oi.id
      LEFT JOIN items it ON oi.item_id = it.id
      LEFT JOIN product_materials pmat ON pmat.product_item_id = oi.item_id AND pmat.is_default = 1
      LEFT JOIN items mat ON mat.id = pmat.material_item_id
      WHERE ci.card_id = ?
      ORDER BY oi.sort_order ASC, ci.id ASC
    `).bind(id).all<CardItemRow>()

    // Resolve per-item thumbnails from ai_analysis_requests
    const analysisIds = new Set<number>()
    for (const item of cardItems || []) {
      if (item.ai_analysis_id && item.ai_group_index !== null && item.ai_group_index !== undefined) {
        analysisIds.add(item.ai_analysis_id)
      }
    }

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

    // 품목별 썸네일 복원. R2 GET 은 **병렬**로 — 직렬 await 면 다품목 카드에서 왕복이 그대로 쌓인다
    // (현장 태블릿에서 카드 상세가 눈에 띄게 느려지는 지점).
    await Promise.all((cardItems || []).map(async (item) => {
      if (!item.ai_analysis_id || item.ai_group_index === null || item.ai_group_index === undefined) return
      const groups = analysisCache.get(item.ai_analysis_id) || []
      // 음수 인덱스(-1 전체문서 · -3 완성본 passthrough)는 첫 그룹 — resolveGroupByAiIndex가 정본
      const matched = resolveGroupByAiIndex(groups, item.ai_group_index)
      if (matched?.thumbnail_base64) {
        item.thumbnail_url = `data:image/png;base64,${matched.thumbnail_base64}`
      } else if (matched?.thumbnail_r2_key) {
        // R2 이관: 썸네일이 R2에 있으면 읽어 data URI로 복원(프론트 무수정)
        const uri = await getThumbnailDataUri(c.env, matched.thumbnail_r2_key)
        if (uri) item.thumbnail_url = uri
      }
    }))

    const typedCard = card as Record<string, unknown>

    // 부속품 조회 (카드 품목의 자식 — parent_item_id 관계, GOODS 타입)
    const mainItemIds = (cardItems || []).map((i) => i.id).filter(Boolean)
    let accessories: Array<{ item_name: string; quantity: number; item_code?: string }> = []
    if (mainItemIds.length > 0 && typedCard?.order_id) {
      const { results: accRows } = await c.env.DB.prepare(
        `SELECT oi.item_name, oi.quantity, it.item_code
         FROM order_items oi
         LEFT JOIN items it ON oi.item_id = it.id
         WHERE oi.order_id = ? AND oi.parent_item_id IN (${mainItemIds.map(() => '?').join(',')})
         ORDER BY oi.sort_order ASC, oi.id ASC`
      ).bind(typedCard.order_id as number, ...mainItemIds).all<{ item_name: string; quantity: number; item_code?: string }>()
      accessories = accRows || []
    }

    // 거래처 메모 (최근 3건)
    interface ClientNoteRow { note_type: string; content: string; created_at: string }
    let clientNotes: ClientNoteRow[] = []
    if (typedCard.client_id) {
      const { results: cnRows } = await c.env.DB.prepare(
        `SELECT note_type, content, created_at FROM client_notes WHERE client_id = ? ORDER BY created_at DESC, id DESC LIMIT 3`
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
        accessories: accessories,
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
    // #599: 형제 GET /:id(#414)와 동일하게 카드 소유 법인 검증 — 자식 read 3종(history/defects/checklist)
    // bare WHERE card_id=? 는 순차 정수 열거로 타법인 이력·성명이 노출되는 IDOR
    const efHist = cardEntityFilter(c)
    const owned = await c.env.DB.prepare(`SELECT id FROM cards WHERE id = ?${efHist.clause}`)
      .bind(id, ...efHist.params).first()
    if (!owned) return c.json({ success: false, error: '카드를 찾을 수 없습니다.' }, 404)
    const { results } = await c.env.DB.prepare(`
      SELECT
        csh.*,
        u.username as changed_by_name
      FROM card_status_history csh
      LEFT JOIN users u ON csh.changed_by = u.id
      WHERE csh.card_id = ?
      ORDER BY csh.created_at DESC, csh.id DESC
    `).bind(id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})


// GET /:id/checklist — 작업지시서 공정 체크리스트 (2026-08-05 work-order-auto-issue)
cardsQueriesRouter.get('/:id/checklist', async (c) => {
  try {
    const id = c.req.param('id')
    // #599: 카드 소유 법인 검증 (형제 GET /:id 패턴)
    const efCcl = cardEntityFilter(c)
    const owned = await c.env.DB.prepare(`SELECT id FROM cards WHERE id = ?${efCcl.clause}`)
      .bind(id, ...efCcl.params).first()
    if (!owned) return c.json({ success: false, error: '카드를 찾을 수 없습니다.' }, 404)
    const { results } = await c.env.DB.prepare(`
      SELECT ccl.*, u.name as checked_by_name
      FROM card_checklist_items ccl
      LEFT JOIN users u ON ccl.checked_by = u.id
      WHERE ccl.card_id = ?
      ORDER BY ccl.sort_order ASC, ccl.id ASC
    `).bind(id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('cards checklist get error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── 불량 관리 (quality_issues) ──

// GET /:id/defects — 카드별 불량 이력 조회
cardsQueriesRouter.get('/:id/defects', async (c) => {
  try {
    const cardId = c.req.param('id')
    // #599: 카드 소유 법인 검증 (형제 GET /:id 패턴)
    const efDef = cardEntityFilter(c)
    const owned = await c.env.DB.prepare(`SELECT id FROM cards WHERE id = ?${efDef.clause}`)
      .bind(cardId, ...efDef.params).first()
    if (!owned) return c.json({ success: false, error: '카드를 찾을 수 없습니다.' }, 404)
    const { results } = await c.env.DB.prepare(`
      SELECT qi.*,
        e1.name as reporter_name,
        e2.name as resolver_name
      FROM quality_issues qi
      LEFT JOIN employees e1 ON qi.reported_by = e1.id
      LEFT JOIN employees e2 ON qi.resolved_by = e2.id
      WHERE qi.card_id = ?
      ORDER BY qi.created_at DESC, qi.id DESC
    `).bind(cardId).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/cards.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})


export default cardsQueriesRouter
