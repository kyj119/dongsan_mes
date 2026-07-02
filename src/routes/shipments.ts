import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'
import { sendEmail } from '../services/emailProvider'
import { renderTemplate } from '../services/emailTemplates'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { getNextSeqNumber, withSeqRetry } from '../utils/sequenceGenerator'
import { autoDeductPostProcessingMaterials } from '../utils/autoDeductPostProcessingMaterials'
import { deductStockLinesOnShip } from '../utils/stockShip'
import { ensureShipmentForOrder } from '../utils/shipmentHelper'
import { getEntityCompanyInfo } from '../utils/entitySettings'
import { escapeCsvField } from '../utils/csv'

const shipmentsRouter = new Hono<HonoEnv>()
shipmentsRouter.use('/*', authMiddleware, requirePagePermission('/shipments'))

// ============================================================================
// GET / - 출고 목록
// ============================================================================
shipmentsRouter.get('/', async (c) => {
  try {
    const { page = '1', limit = '30', status = '', search = '', date_from = '', date_to = '', date = '', courier_name = '' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 30, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    const whereClauses: string[] = []
    const params: any[] = []

    if (status) {
      whereClauses.push('s.status = ?')
      params.push(status)
    }
    if (search) {
      whereClauses.push('(s.shipment_number LIKE ? OR o.order_number LIKE ? OR cl.client_name LIKE ? OR s.tracking_number LIKE ?)')
      const p = `%${search}%`
      params.push(p, p, p, p)
    }
    if (date_from) {
      whereClauses.push('s.created_at >= ?')
      params.push(date_from + ' 00:00:00')
    }
    if (date_to) {
      whereClauses.push('s.created_at < ?')
      params.push(date_to + ' 23:59:59')
    }
    if (date) {
      whereClauses.push("s.shipped_at >= ? AND s.shipped_at < ?")
      params.push(date + ' 00:00:00', date + ' 23:59:59')
    }
    if (courier_name) {
      whereClauses.push("s.courier_name = ?")
      params.push(courier_name)
    }

    const ef = entityFilter(c, 'o')
    if (ef.clause) {
      whereClauses.push(ef.clause.replace(/^ AND /, ''))
      params.push(...ef.params)
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''

    const { results } = await c.env.DB.prepare(`
      -- 주의: receiver_address는 shipments 테이블 컬럼(s.*)에 포함됨.
      -- 스펙 4-2 표의 'orders.receiver_address' 표기는 오기. orders 테이블에 해당 컬럼 없음.
      SELECT s.*,
             o.order_number, o.delivery_date, o.delivery_method, o.contact_phone,
             cl.id as client_id, cl.client_name, cl.delivery_address, cl.mobile,
             u.name as created_by_name,
             (SELECT GROUP_CONCAT(item_name, ' / ')
              FROM (SELECT item_name FROM order_items
                    WHERE order_id = s.order_id AND parent_item_id IS NULL
                    LIMIT 3)) as item_summary
      FROM shipments s
      JOIN orders o ON s.order_id = o.id
      LEFT JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN users u ON s.created_by = u.id
      ${where}
      ORDER BY s.shipped_at DESC, s.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, safeLimit, offset).all()

    const countRow = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM shipments s
      JOIN orders o ON s.order_id = o.id
      LEFT JOIN clients cl ON o.client_id = cl.id
      ${where}
    `).bind(...params).first<{ count: number }>()

    const total = countRow?.count ?? 0
    return c.json({
      success: true,
      data: results,
      pagination: { page: parseInt(page), limit: safeLimit, total, total_pages: Math.ceil(total / safeLimit) }
    })
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /stats - 출고 통계
// ============================================================================
shipmentsRouter.get('/stats', async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN s.status = 'PREPARING' THEN 1 ELSE 0 END) as preparing,
        SUM(CASE WHEN s.status = 'SHIPPED' THEN 1 ELSE 0 END) as shipped,
        SUM(CASE WHEN s.status = 'IN_TRANSIT' THEN 1 ELSE 0 END) as in_transit,
        SUM(CASE WHEN s.status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered
      FROM shipments s
      JOIN orders o ON s.order_id = o.id
      WHERE s.status != 'CANCELLED'${ef.clause}
    `).bind(...ef.params).first()
    return c.json({ success: true, data: stats })
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /daily - 날짜별 출고 관리 (delivery_date 기준 주문 + 카드 상태)
// ============================================================================
shipmentsRouter.get('/daily', async (c) => {
  try {
    const { date } = c.req.query()
    const targetDate = date || new Date().toISOString().substring(0, 10)

    const efDaily = entityFilter(c, 'o')
    // P1 출고 정합화: 최신 활성 shipment 1:1 조인 — 송장번호/라벨수량/수신자주소 재표시
    // (기존엔 미조인이라 저장한 송장번호가 재로딩 시 빈칸으로 보이던 버그)
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.delivery_info,
             o.delivery_time, o.status, o.final_amount, o.contact_phone, o.notes,
             o.reception_location, o.shipping_payment,
             o.entity_id, en.short_name as entity_name,
             cl.id as client_id, cl.client_name, cl.phone as client_phone, cl.mobile as client_mobile,
             cl.address as client_address, cl.delivery_address,
             sp.id as shipment_id, sp.tracking_number, sp.label_count, sp.box_count,
             sp.receiver_address, sp.status as shipment_status,
             COUNT(c.id) as total_cards,
             SUM(CASE WHEN c.status = 'PRINT_DONE' THEN 1 ELSE 0 END) as done_cards,
             SUM(CASE WHEN c.status IN ('RIP_READY', 'PRINTING') THEN 1 ELSE 0 END) as printing_cards,
             SUM(CASE WHEN c.shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped_cards
      FROM orders o
      JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN entities en ON en.id = o.entity_id
      LEFT JOIN cards c ON c.order_id = o.id
      LEFT JOIN shipments sp ON sp.id = (
        SELECT id FROM shipments WHERE order_id = o.id AND status != 'CANCELLED' ORDER BY id DESC LIMIT 1
      )
      WHERE o.delivery_date = ? AND o.status NOT IN ('CANCELLED', 'DELETED', 'DRAFT')${efDaily.clause}
      GROUP BY o.id
      ORDER BY o.delivery_time ASC NULLS LAST, o.delivery_method ASC, cl.client_name ASC
    `).bind(targetDate, ...efDaily.params).all()

    // 품목 상세
    interface DailyOrderRow { id: number; [key: string]: unknown }
    interface DailyItemRow { order_id: number; item_name: string; category_name: string | null; width: number | null; height: number | null; quantity: number; content: string | null }
    const orderIds = (results as DailyOrderRow[]).map(r => r.id)
    const ordersWithItems = results as (DailyOrderRow & { items?: DailyItemRow[]; item_summary?: string })[]

    if (orderIds.length > 0) {
      // #458: D1 바인드 한도(100) — IN절 80청크 분할 후 병합 (cards #409 패턴)
      const itemRows: DailyItemRow[] = []
      for (let i = 0; i < orderIds.length; i += 80) {
        const chunk = orderIds.slice(i, i + 80)
        const placeholders = chunk.map(() => '?').join(',')
        const { results: chunkRows } = await c.env.DB.prepare(`
          SELECT oi.order_id, oi.item_name, oi.category_name, oi.width, oi.height,
                 oi.quantity, oi.content
          FROM order_items oi
          WHERE oi.order_id IN (${placeholders}) AND oi.parent_item_id IS NULL
          ORDER BY oi.order_id, oi.id
        `).bind(...chunk).all<DailyItemRow>()
        if (chunkRows) itemRows.push(...chunkRows)
      }

      const itemsByOrder: Record<number, DailyItemRow[]> = {}
      for (const item of itemRows) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
        itemsByOrder[item.order_id].push(item)
      }

      for (const order of ordersWithItems) {
        order.items = itemsByOrder[order.id] || []
        // 품목 요약
        order.item_summary = order.items.map((i) => {
          const size = (i.width && i.height) ? `${i.width}x${i.height}` : ''
          return `${i.item_name}${size ? ' ' + size : ''} x${i.quantity}`
        }).join(', ')
      }
    }

    return c.json({ success: true, data: ordersWithItems })
  } catch (error) {
    console.error('shipments daily error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// GET /consolidation-candidates - 합배송 후보 (법인 통합 뷰, P2)
// 복수 법인의 같은 날 출고가 ①같은 거래처 ②같은 권역(우편번호 앞 3자리, 자가배송:
// 직배/용차/퀵)으로 겹치는 건을 탐지 — 합짐·합포장 후보 가시화.
// ⚠️ 목적상 entityFilter 미적용(명시적 cross-entity 조회) — ADMIN·MANAGER 한정.
// 권역 키 = delivery_info의 '[12345]' 프리픽스를 쿼리 시점 파생 (컬럼 추가 없이 상시 동기)
// ※ /:id 보다 먼저 등록
// ============================================================================
shipmentsRouter.get('/consolidation-candidates', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { date } = c.req.query()
    const targetDate = date || new Date().toISOString().substring(0, 10)

    interface ConsolidationRow {
      id: number; order_number: string; entity_id: number | null; entity_name: string | null
      delivery_method: string | null; delivery_time: string | null; delivery_info: string | null
      shipping_payment: string | null; client_id: number; client_name: string; postal_code: string | null
    }
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.entity_id, en.short_name as entity_name,
             o.delivery_method, o.delivery_time, o.delivery_info, o.shipping_payment,
             cl.id as client_id, cl.client_name,
             CASE WHEN substr(o.delivery_info, 1, 1) = '[' AND substr(o.delivery_info, 7, 1) = ']'
                       AND substr(o.delivery_info, 2, 5) GLOB '[0-9][0-9][0-9][0-9][0-9]'
                  THEN substr(o.delivery_info, 2, 5) ELSE NULL END as postal_code
      FROM orders o
      JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN entities en ON en.id = o.entity_id
      WHERE o.delivery_date = ? AND o.status NOT IN ('CANCELLED', 'DELETED', 'DRAFT', 'QUOTATION')
      ORDER BY cl.client_name ASC, o.entity_id ASC
    `).bind(targetDate).all<ConsolidationRow>()

    // ① 같은 거래처 × 복수 법인 → 합포장/합짐 후보 (배송방법 무관)
    const byClient = new Map<number, ConsolidationRow[]>()
    for (const r of results) {
      if (!byClient.has(r.client_id)) byClient.set(r.client_id, [])
      byClient.get(r.client_id)!.push(r)
    }
    const sameClient: any[] = []
    for (const rows of byClient.values()) {
      const entities = new Set(rows.map(r => r.entity_id))
      if (entities.size >= 2) {
        sameClient.push({
          client_id: rows[0].client_id,
          client_name: rows[0].client_name,
          entity_count: entities.size,
          orders: rows,
        })
      }
    }

    // ② 같은 권역(우편번호 앞 3자리) × 자가배송(직배/용차/퀵) → 동선 묶음 후보
    //    ①에 이미 잡힌 거래처는 제외. 복수 법인 겹침 또는 단일 법인이라도 3건+ 묶음.
    const OWN_DELIVERY = new Set(['직배', '용차', '퀵'])
    const sameClientIds = new Set(sameClient.map(g => g.client_id))
    const byRegion = new Map<string, ConsolidationRow[]>()
    for (const r of results) {
      if (!r.postal_code || !OWN_DELIVERY.has((r.delivery_method || '').trim())) continue
      if (sameClientIds.has(r.client_id)) continue
      const prefix = r.postal_code.substring(0, 3)
      if (!byRegion.has(prefix)) byRegion.set(prefix, [])
      byRegion.get(prefix)!.push(r)
    }
    const sameRegion: any[] = []
    for (const [prefix, rows] of byRegion) {
      const entities = new Set(rows.map(r => r.entity_id))
      if (entities.size >= 2 || rows.length >= 3) {
        sameRegion.push({ postal_prefix: prefix, entity_count: entities.size, orders: rows })
      }
    }

    return c.json({ success: true, data: { date: targetDate, same_client: sameClient, same_region: sameRegion } })
  } catch (error) {
    console.error('shipments consolidation-candidates error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /dashboard/counts - 출고 카운트 (사이드바 뱃지용)
// ※ /:id 보다 먼저 등록해야 "dashboard"가 :id로 매칭되지 않음
// ============================================================================
shipmentsRouter.get('/dashboard/counts', async (c) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id,
        CASE WHEN MIN(oi.shipment_ready) = 1 THEN 1 ELSE 0 END as all_ready
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id AND oi.parent_item_id IS NULL
      WHERE o.status IN ('CONFIRMED', 'PRINTING', 'PRINT_DONE')
        AND DATE(o.delivery_date) = ?
        ${ef.clause}
      GROUP BY o.id
    `).bind(today, ...ef.params).all<{ id: number; all_ready: number }>()
    const typedResults = results
    const total = typedResults.length
    const ready = typedResults.filter(r => r.all_ready === 1).length
    return c.json({ success: true, data: { total, ready, pending: total - ready } })
  } catch (err) {
    return c.json({ success: false, error: 'Failed to load counts' }, 500)
  }
})

// ============================================================================
// GET /dashboard - 출고 대시보드 (거래처별 출고 현황)
// ============================================================================
shipmentsRouter.get('/dashboard', async (c) => {
  try {
    const { date, delivery_method, status = 'all' } = c.req.query()
    const targetDate = date || new Date().toISOString().split('T')[0]
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT
        o.id as order_id, o.order_number, o.delivery_method, o.delivery_date, o.delivery_time,
        o.status as order_status,
        c.id as client_id, c.client_name,
        oi.id as order_item_id, oi.item_name, oi.quantity, oi.width, oi.height,
        oi.amount, oi.shipment_ready,
        ci.card_id,
        cd.card_number, cd.status as card_status, cd.category_name as card_category
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      JOIN order_items oi ON oi.order_id = o.id AND oi.parent_item_id IS NULL
      LEFT JOIN card_items ci ON ci.order_item_id = oi.id
      LEFT JOIN cards cd ON cd.id = ci.card_id
      WHERE o.status IN ('CONFIRMED', 'PRINTING', 'PRINT_DONE')
        AND DATE(o.delivery_date) = ?
        ${ef.clause}
      ORDER BY c.client_name ASC, o.id ASC, oi.sort_order ASC
    `).bind(targetDate, ...ef.params).all<{
      order_id: number; order_number: string; delivery_method: string | null; delivery_date: string | null; delivery_time: string | null; order_status: string;
      client_id: number; client_name: string;
      order_item_id: number; item_name: string; quantity: number; width: number | null; height: number | null; amount: number | null; shipment_ready: number | null;
      card_id: number | null; card_number: string | null; card_status: string | null; card_category: string | null;
    }>()

    interface DashboardItem { order_item_id: number; item_name: string; quantity: number; width: number | null; height: number | null; amount: number | null; shipment_ready: number | null; card_id: number | null; card_number: string | null; card_status: string | null; card_category: string | null }
    interface DashboardOrder { order_id: number; order_number: string; delivery_method: string | null; delivery_date: string | null; delivery_time: string | null; order_status: string; items: DashboardItem[] }
    interface DashboardClient { client_id: number; client_name: string; orders: Map<number, DashboardOrder> }

    const clientMap = new Map<number, DashboardClient>()
    for (const row of results) {
      if (!clientMap.has(row.client_id)) {
        clientMap.set(row.client_id, { client_id: row.client_id, client_name: row.client_name, orders: new Map() })
      }
      const client = clientMap.get(row.client_id)!
      if (!client.orders.has(row.order_id)) {
        client.orders.set(row.order_id, {
          order_id: row.order_id, order_number: row.order_number, delivery_method: row.delivery_method,
          delivery_date: row.delivery_date, delivery_time: row.delivery_time, order_status: row.order_status, items: []
        })
      }
      client.orders.get(row.order_id)!.items.push({
        order_item_id: row.order_item_id, item_name: row.item_name, quantity: row.quantity,
        width: row.width, height: row.height, amount: row.amount, shipment_ready: row.shipment_ready,
        card_id: row.card_id, card_number: row.card_number, card_status: row.card_status, card_category: row.card_category
      })
    }

    const data = Array.from(clientMap.values()).map(client => {
      const orders = Array.from(client.orders.values()).map((order) => {
        const allReady = order.items.every((i) => i.shipment_ready === 1)
        const readyCount = order.items.filter((i) => i.shipment_ready === 1).length
        return { ...order, all_ready: allReady, ready_count: readyCount, total_count: order.items.length }
      })
      return { client_id: client.client_id, client_name: client.client_name, orders }
    })

    let filtered = data
    if (delivery_method) {
      filtered = data.map(cl => ({ ...cl, orders: cl.orders.filter(o => o.delivery_method === delivery_method) })).filter(cl => cl.orders.length > 0)
    }
    if (status === 'ready') {
      filtered = filtered.map(cl => ({ ...cl, orders: cl.orders.filter(o => o.all_ready) })).filter(cl => cl.orders.length > 0)
    } else if (status === 'pending') {
      filtered = filtered.map(cl => ({ ...cl, orders: cl.orders.filter(o => !o.all_ready) })).filter(cl => cl.orders.length > 0)
    }

    return c.json({ success: true, data: filtered })
  } catch (err) {
    return c.json({ success: false, error: 'Failed to load dashboard' }, 500)
  }
})

// ============================================================================
// GET /:id - 출고 상세
// ============================================================================
shipmentsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const ef = entityFilter(c, 'o')
    const shipment = await c.env.DB.prepare(`
      SELECT s.*, o.order_number, o.delivery_date, o.delivery_method,
             cl.client_name, cl.phone as client_phone, cl.address as client_address,
             u.name as created_by_name
      FROM shipments s
      JOIN orders o ON s.order_id = o.id
      LEFT JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!shipment) return c.json({ success: false, error: '출고 정보를 찾을 수 없습니다.' }, 404)

    const { results: items } = await c.env.DB.prepare(`
      SELECT si.*, c.card_number, c.category_name as category,
             oi.item_name, oi.quantity as order_qty, oi.width, oi.height
      FROM shipment_items si
      LEFT JOIN cards c ON si.card_id = c.id
      LEFT JOIN order_items oi ON si.order_item_id = oi.id
      WHERE si.shipment_id = ?
    `).bind(id).all()

    return c.json({ success: true, data: { ...shipment, items } })
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST / - 출고 등록
// ============================================================================
shipmentsRouter.post('/', requireRole('ADMIN', 'MANAGER', 'DESIGNER'), async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.json() as {
      order_id: number
      delivery_type?: string
      courier_name?: string
      tracking_number?: string
      receiver_name?: string
      receiver_phone?: string
      receiver_address?: string
      notes?: string
      card_ids?: number[]
    }

    if (!body.order_id) return c.json({ success: false, error: '주문을 선택하세요.' }, 400)

    // 주문 확인 (#123: entity_id 필터 추가)
    const ef = entityFilter(c)
    const order = await c.env.DB.prepare(`SELECT id, order_number, status, entity_id FROM orders WHERE id = ?${ef.clause}`).bind(body.order_id, ...ef.params).first<{ id: number; order_number: string; status: string; entity_id: number | null }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    // #298: 수동 지정 카드(card_ids)의 출고 가능 여부 검증 — PRINT_DONE 또는 이미 출고된 카드만 (출고 레코드 생성 전)
    if (body.card_ids && body.card_ids.length > 0) {
      const ph = body.card_ids.map(() => '?').join(', ')
      const { results: invalidCards } = await c.env.DB.prepare(`
        SELECT id, card_number FROM cards
        WHERE id IN (${ph}) AND status != 'PRINT_DONE' AND shipped_at IS NULL
      `).bind(...body.card_ids).all<{ id: number; card_number: string }>()
      if (invalidCards.length > 0) {
        return c.json({ success: false, error: `출고 불가 카드(PRINT_DONE 아님): ${invalidCards.map(x => x.card_number || x.id).join(', ')}` }, 400)
      }
    }

    // 출고번호 생성 (#148: entity별 독립 시퀀스)
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
    const eid = getEntityId(c) || 1
    const shipmentNumber = await getNextSeqNumber(c.env.DB, 'shipments', 'shipment_number', `SHP-E${eid}-${dateStr}-`, 3, eid)

    // 출고 등록
    const result = await c.env.DB.prepare(`
      INSERT INTO shipments (
        shipment_number, order_id, status, delivery_type,
        courier_name, tracking_number, shipped_at,
        receiver_name, receiver_phone, receiver_address,
        notes, created_by, created_at, updated_at, entity_id
      ) VALUES (?, ?, 'SHIPPED', ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `).bind(
      shipmentNumber, body.order_id,
      body.delivery_type || 'DELIVERY',
      body.courier_name || null, body.tracking_number || null,
      body.receiver_name || null, body.receiver_phone || null, body.receiver_address || null,
      body.notes || null, user?.id || 1, order.entity_id ?? eid
    ).run()

    const shipmentId = result.meta.last_row_id

    // #195: 카드 출고 + shipment_items + auto_complete_date를 원자적 batch로 처리
    // 1) 출고 대상 카드 결정 (READ — batch 전 조회)
    let targetCardIds: number[]
    if (body.card_ids && body.card_ids.length > 0) {
      targetCardIds = body.card_ids
    } else {
      // 카드 지정 없으면 주문의 모든 출고 가능 카드 + 이미 출고된 카드
      const { results: eligibleCards } = await c.env.DB.prepare(`
        SELECT id FROM cards
        WHERE order_id = ? AND (
          (status = 'PRINT_DONE' AND shipped_at IS NULL)
          OR shipped_at IS NOT NULL
        )
      `).bind(body.order_id).all<{ id: number }>()
      targetCardIds = eligibleCards.map(card => card.id)
    }

    // 2) auto_complete_date 판정을 위해 전체 카드 수 조회
    const [cardCheck, orderInfo] = await Promise.all([
      c.env.DB.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN shipped_at IS NOT NULL THEN 1 ELSE 0 END) as shipped
        FROM cards WHERE order_id = ?
      `).bind(body.order_id).first<{ total: number; shipped: number }>(),
      c.env.DB.prepare('SELECT delivery_method FROM orders WHERE id = ?')
        .bind(body.order_id).first<{ delivery_method: string | null }>()
    ])

    // 3) 모든 WRITE 문을 수집하여 batch 실행
    const batchStmts: ReturnType<typeof c.env.DB.prepare>[] = []

    // 카드 shipped_at 업데이트 + shipment_items 등록
    for (const cardId of targetCardIds) {
      batchStmts.push(
        c.env.DB.prepare('UPDATE cards SET shipped_at = CURRENT_TIMESTAMP WHERE id = ? AND shipped_at IS NULL').bind(cardId)
      )
      batchStmts.push(
        c.env.DB.prepare('INSERT OR IGNORE INTO shipment_items (shipment_id, card_id) VALUES (?, ?)').bind(shipmentId, cardId)
      )
    }

    // 이번 출고로 모든 카드가 출고 완료되는 경우 → auto_complete_date 설정
    // (현재 미출고 카드 수 = total - shipped, 이번에 출고할 미출고 카드가 이를 커버하면 완료)
    if (cardCheck && cardCheck.total > 0) {
      const unshippedCount = cardCheck.total - (cardCheck.shipped || 0)
      const newlyShipping = body.card_ids
        ? targetCardIds.length  // 지정 카드 수
        : unshippedCount        // else 분기는 미출고 전체 대상
      if (unshippedCount > 0 && newlyShipping >= unshippedCount) {
        const method = (orderInfo?.delivery_method || '').trim()
        const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵'
        const delayDays = isQuick ? 1 : 2
        batchStmts.push(
          c.env.DB.prepare(
            `UPDATE orders SET auto_complete_date = date('now', '+9 hours', '+' || ? || ' days'), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND auto_complete_date IS NULL`
          ).bind(delayDays, body.order_id)
        )
      }
    }

    if (batchStmts.length > 0) {
      await c.env.DB.batch(batchStmts)
    }

    // 출고 완료 → 후가공(코팅 등) 소비자재 폭매칭 자동차감 (fire-and-forget — 실패해도 출고는 성공)
    try {
      await autoDeductPostProcessingMaterials(c.env.DB, targetCardIds)
    } catch (ppDeductErr) {
      console.error('PP material deduction error:', ppDeductErr)
    }

    // 이메일 자동 발송 (fire-and-forget — 실패해도 출고는 성공)
    try {
      const client = await c.env.DB.prepare(
        'SELECT cl.email, cl.client_name FROM clients cl JOIN orders o ON o.client_id = cl.id WHERE o.id = ?'
      ).bind(body.order_id).first<{ email: string | null; client_name: string }>()

      if (client?.email) {
        const { results: shipItems } = await c.env.DB.prepare(`
          SELECT oi.item_name, oi.quantity, oi.width, oi.height, oi.specification
          FROM shipment_items si
          LEFT JOIN cards cd ON si.card_id = cd.id
          LEFT JOIN order_items oi ON cd.order_item_id = oi.id
          WHERE si.shipment_id = ?
        `).bind(shipmentId).all()

        const { subject, html } = renderTemplate('SHIPMENT_NOTICE', {
          clientName: client.client_name,
          orderNumber: order.order_number,
          shipmentNumber,
          shippedAt: new Date().toLocaleDateString('ko-KR'),
          deliveryType: body.delivery_type || 'DELIVERY',
          courierName: body.courier_name,
          trackingNumber: body.tracking_number,
          items: (shipItems as { item_name: string | null; quantity: number | null; width: number | null; height: number | null; specification: string | null }[]).map(i => ({
            itemName: i.item_name || '품목',
            quantity: i.quantity || 1,
            width: i.width,
            height: i.height,
            specification: i.specification,
          })),
          notes: body.notes,
        })

        await sendEmail(c.env, c.env.DB, { to: client.email, subject, html }, {
          template: 'SHIPMENT_NOTICE',
          relatedType: 'shipment',
          relatedId: shipmentId as number,
          sentBy: user?.id,
        })
      }
    } catch (_emailErr) {
      // 이메일 실패해도 출고 등록은 성공 처리
    }

    // 알림톡 자동 발송 (fire-and-forget)
    try {
      const kakaoEnabled = await c.env.DB.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'kakao_enabled'`
      ).first<{ setting_value: string | null }>()
      if (kakaoEnabled?.setting_value === '1') {
        // 내부 API 호출로 알림톡 발송 위임
        const internalRes = await fetch(new URL('/api/kakao/send-shipment', c.req.url).href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': c.req.header('Authorization') || '',
          },
          body: JSON.stringify({ shipment_id: shipmentId }),
        })
        if (!internalRes.ok) {
          console.warn('알림톡 발송 실패 (출고):', await internalRes.text())
        }
      }
    } catch (_kakaoErr) {
      // 알림톡 실패해도 출고 등록은 성공 처리
      console.warn('알림톡 발송 오류 (출고):', _kakaoErr)
    }

    return c.json({
      success: true,
      data: { id: shipmentId, shipment_number: shipmentNumber },
      message: `출고 ${shipmentNumber} 등록 완료`
    }, 201)
  } catch (error) {
    console.error('src/routes/shipments.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 라벨 수량 / 송장번호 / 수신자 필드 patch 공통 적용 (PATCH /by-order/:orderId, /:id 공용)
// ============================================================================
interface ShipmentPatchBody {
  label_count?: number
  box_count?: number
  tracking_number?: string
  receiver_address?: string
  receiver_name?: string
  receiver_phone?: string
}

async function applyShipmentFieldPatch(db: HonoEnv['Bindings']['DB'], shipmentId: number, body: ShipmentPatchBody): Promise<boolean> {
  const updates: string[] = []
  const params: any[] = []

  if (body.label_count !== undefined) {
    updates.push('label_count = ?')
    params.push(body.label_count)
  }
  if (body.box_count !== undefined) {
    updates.push('box_count = ?')
    params.push(body.box_count)
  }
  if (body.tracking_number !== undefined) {
    updates.push('tracking_number = ?')
    params.push(body.tracking_number)
  }
  // P1 출고 정합화: 수신자 정보 저장 (기존엔 라벨 인쇄용으로만 읽고 DB 미저장 → 항상 거래처 주소 폴백)
  if (body.receiver_address !== undefined) {
    updates.push('receiver_address = ?')
    params.push(body.receiver_address || null)
  }
  if (body.receiver_name !== undefined) {
    updates.push('receiver_name = ?')
    params.push(body.receiver_name || null)
  }
  if (body.receiver_phone !== undefined) {
    updates.push('receiver_phone = ?')
    params.push(body.receiver_phone || null)
  }

  if (updates.length === 0) return false

  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(shipmentId)
  await db.prepare(`UPDATE shipments SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()
  return true
}

// ============================================================================
// PATCH /by-order/:orderId - 주문 기준 라벨/송장/수신자 업데이트 (없으면 자동 생성)
// P1 정합화: 기존 PATCH /:id의 "shipment PK 우선 → order_id 폴백" 조회는 shipments 행이
// 축적되면 타 주문 shipment를 오업데이트할 수 있어(ID 공간 충돌) 주문 기준 명시 라우트로 분리.
// ============================================================================
shipmentsRouter.patch('/by-order/:orderId', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const body = await c.req.json<ShipmentPatchBody>()

    const ef = entityFilter(c)
    const order = await c.env.DB.prepare(`SELECT id FROM orders WHERE id = ?${ef.clause}`).bind(orderId, ...ef.params).first<{ id: number }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    const user = c.get('user')
    const shipmentId = await ensureShipmentForOrder(c.env.DB, order.id, { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1, status: 'PREPARING' })
    if (!shipmentId) return c.json({ success: false, error: '출고 정보를 생성할 수 없습니다.' }, 500)

    const applied = await applyShipmentFieldPatch(c.env.DB, shipmentId, body)
    if (!applied) return c.json({ success: false, error: '수정할 항목이 없습니다.' }, 400)

    return c.json({ success: true, data: { shipment_id: shipmentId } })
  } catch (error) {
    console.error('src/routes/shipments.ts PATCH /by-order error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /:id - 라벨 수량 / 송장번호 업데이트 (shipment PK 기준 — 레거시 order_id 폴백 유지)
// ============================================================================
shipmentsRouter.patch('/:id', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<ShipmentPatchBody>()

    const ef = entityFilter(c)
    // 1차: shipment ID로 조회
    let shipment = await c.env.DB.prepare(`SELECT id FROM shipments WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first()

    // 2차: 없으면 order_id로 조회 (구버전 프론트가 주문 ID를 보내는 경우 — 활성 최신 우선)
    if (!shipment) {
      shipment = await c.env.DB.prepare(`SELECT id FROM shipments WHERE order_id = ? AND status != 'CANCELLED'${ef.clause} ORDER BY id DESC LIMIT 1`).bind(id, ...ef.params).first()
    }

    // 3차: 그래도 없으면 해당 주문에 대한 shipment 자동 생성 (공용 헬퍼 — dtMap 7종 정본, PREPARING 상태)
    if (!shipment) {
      const order = await c.env.DB.prepare(`SELECT id FROM orders WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first<{ id: number }>()
      if (!order) {
        return c.json({ success: false, error: '주문 또는 출고 정보를 찾을 수 없습니다.' }, 404)
      }
      const user = c.get('user')
      await ensureShipmentForOrder(c.env.DB, order.id, { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1, status: 'PREPARING' })
      shipment = await c.env.DB.prepare(`SELECT id FROM shipments WHERE order_id = ? AND status != 'CANCELLED'${ef.clause} ORDER BY id DESC LIMIT 1`).bind(id, ...ef.params).first()
    }

    if (!shipment) {
      return c.json({ success: false, error: '출고 정보를 생성할 수 없습니다.' }, 500)
    }

    const applied = await applyShipmentFieldPatch(c.env.DB, (shipment as { id: number }).id, body)
    if (!applied) {
      return c.json({ success: false, error: '수정할 항목이 없습니다.' }, 400)
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/shipments.ts PATCH /:id error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /:id/status - 출고 상태 변경
// ============================================================================
shipmentsRouter.patch('/:id/status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { status } = await c.req.json<{ status: string }>()

    if (!status) {
      return c.json({ success: false, error: '상태를 입력해주세요.' }, 400)
    }

    const validStatuses = ['PREPARING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']
    if (!validStatuses.includes(status)) {
      return c.json({ success: false, error: '유효하지 않은 상태입니다.' }, 400)
    }

    const ef = entityFilter(c)
    const shipment = await c.env.DB.prepare(`SELECT id, status FROM shipments WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first<{ id: number; status: string }>()
    if (!shipment) {
      return c.json({ success: false, error: '출고 정보를 찾을 수 없습니다.' }, 404)
    }

    // #51 + #185: 출고 취소 시 카드 shipped_at 롤백 + 주문 상태 복원 + auto_complete_date 리셋
    // 모든 UPDATE/INSERT를 수집하여 batch로 원자적 실행
    if (status === 'CANCELLED') {
      // 취소에 필요한 정보를 먼저 조회
      const orderRow = await c.env.DB.prepare(
        'SELECT order_id FROM shipments WHERE id = ?'
      ).bind(id).first<{ order_id: number }>()

      const stmts: ReturnType<typeof c.env.DB.prepare>[] = [
        // 1) 출고 상태 변경
        c.env.DB.prepare(
          'UPDATE shipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(status, id),
        // 2) 카드 shipped_at 리셋 (HOLD 카드는 건드리지 않음)
        c.env.DB.prepare(`
          UPDATE cards SET shipped_at = NULL
          WHERE id IN (SELECT card_id FROM shipment_items WHERE shipment_id = ?)
            AND status != 'HOLD'
        `).bind(id),
      ]

      if (orderRow?.order_id) {
        const orderInfo = await c.env.DB.prepare(
          'SELECT status FROM orders WHERE id = ?'
        ).bind(orderRow.order_id).first<{ status: string }>()

        if (orderInfo?.status === 'SHIPPED') {
          // #218: 동일 주문에 다른 활성 출고가 남아있는지 확인
          const otherShipped = await c.env.DB.prepare(
            `SELECT COUNT(*) as cnt FROM shipments WHERE order_id = ? AND id != ? AND status = 'SHIPPED'`
          ).bind(orderRow.order_id, id).first<{ cnt: number }>()

          if (!otherShipped || otherShipped.cnt === 0) {
            // 모든 출고 취소됨 → 주문 상태 복원
            const user = c.get('user')
            // 3) 주문 상태 복원 (shipped_at도 리셋 — P1 정합화)
            stmts.push(c.env.DB.prepare(
              `UPDATE orders SET status = 'PRINT_DONE', auto_complete_date = NULL, shipped_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).bind(orderRow.order_id))
            // 4) 상태 이력 기록
            stmts.push(c.env.DB.prepare(`
              INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
              VALUES (?, 'SHIPPED', 'PRINT_DONE', ?, '출고 취소로 주문 상태 복원')
            `).bind(orderRow.order_id, user?.id || 1))
          } else {
            // 다른 출고가 아직 SHIPPED → auto_complete_date만 리셋
            stmts.push(c.env.DB.prepare(
              'UPDATE orders SET auto_complete_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(orderRow.order_id))
          }
        } else if (orderInfo?.status === 'COMPLETED') {
          // #292: 완료 주문에서 출고 취소 → 더 이상 완료 아님, SHIPPED로 복원
          const user = c.get('user')
          stmts.push(c.env.DB.prepare(
            `UPDATE orders SET status = 'SHIPPED', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), auto_complete_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(orderRow.order_id))
          stmts.push(c.env.DB.prepare(`
            INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
            VALUES (?, 'COMPLETED', 'SHIPPED', ?, '출고 취소로 주문 상태 복원')
          `).bind(orderRow.order_id, user?.id || 1))
        } else {
          // SHIPPED/COMPLETED가 아닌 경우에도 auto_complete_date는 리셋
          stmts.push(c.env.DB.prepare(
            'UPDATE orders SET auto_complete_date = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(orderRow.order_id))
        }
      }

      await c.env.DB.batch(stmts)
    } else {
      // 취소가 아닌 단순 상태 변경 + 주문 상태 동기
      const stmts: ReturnType<typeof c.env.DB.prepare>[] = [
        c.env.DB.prepare(
          'UPDATE shipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(status, id),
      ]

      // 주문 상태 동기화
      const orderRow = await c.env.DB.prepare(
        'SELECT order_id FROM shipments WHERE id = ?'
      ).bind(id).first<{ order_id: number }>()

      if (orderRow?.order_id) {
        const user = c.get('user')
        if (status === 'SHIPPED') {
          stmts.push(c.env.DB.prepare(
            `UPDATE orders SET status = 'SHIPPED', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'SHIPPED'`
          ).bind(orderRow.order_id))
        } else if (status === 'DELIVERED') {
          // 모든 출고가 DELIVERED인지 확인
          const otherNonDelivered = await c.env.DB.prepare(
            `SELECT COUNT(*) as cnt FROM shipments WHERE order_id = ? AND id != ? AND status NOT IN ('DELIVERED', 'CANCELLED')`
          ).bind(orderRow.order_id, id).first<{ cnt: number }>()
          if (!otherNonDelivered || otherNonDelivered.cnt === 0) {
            // #300: orders.status CHECK에 COMPLETED 없음 → 배달완료 시 출고완료일만 스탬프(주문은 SHIPPED 유지). 옵션b
            stmts.push(c.env.DB.prepare(
              `UPDATE orders SET auto_complete_date = COALESCE(auto_complete_date, date('now', '+9 hours')), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('CANCELLED')`
            ).bind(orderRow.order_id))
          }
        } else if (status === 'IN_TRANSIT') {
          // #305: 배송중 — 여전히 출고 상태이므로 주문을 SHIPPED로 유지/설정
          stmts.push(c.env.DB.prepare(
            `UPDATE orders SET status = 'SHIPPED', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'SHIPPED'`
          ).bind(orderRow.order_id))
        } else if (status === 'PREPARING') {
          // #305: 출고 준비중 복귀 — 다른 활성 SHIPPED 출고가 없으면 주문을 PRINT_DONE으로
          const otherShipped = await c.env.DB.prepare(
            `SELECT COUNT(*) as cnt FROM shipments WHERE order_id = ? AND id != ? AND status = 'SHIPPED'`
          ).bind(orderRow.order_id, id).first<{ cnt: number }>()
          if (!otherShipped || otherShipped.cnt === 0) {
            stmts.push(c.env.DB.prepare(
              `UPDATE orders SET status = 'PRINT_DONE', shipped_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'SHIPPED'`
            ).bind(orderRow.order_id))
          }
        }
      }

      await c.env.DB.batch(stmts)
    }

    return c.json({ success: true, message: '출고 상태가 변경되었습니다.' })
  } catch (error) {
    console.error('src/routes/shipments.ts status error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// (dashboard/counts + dashboard 라우트는 /:id 위로 이동 완료 — 라인 240~)
// 아래는 PATCH /:orderId/ship만 유지

// ============================================================================
// PATCH /:orderId/ship - 출고 대시보드에서 출고 처리

// ============================================================================
// PATCH /:orderId/ship - 출고 대시보드에서 출고 처리
// ============================================================================
shipmentsRouter.patch('/:orderId/ship', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const orderId = c.req.param('orderId')
    const user = c.get('user')

    // 주문 확인
    const ef = entityFilter(c)
    const order = await c.env.DB.prepare(
      `SELECT id, order_number, status, client_id, delivery_method, entity_id FROM orders WHERE id = ?${ef.clause}`
    ).bind(orderId, ...ef.params).first<{ id: number; order_number: string; status: string; client_id: number; delivery_method: string | null; entity_id: number | null }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    // 모든 order_items.shipment_ready 확인
    const { results: items } = await c.env.DB.prepare(
      'SELECT id, shipment_ready FROM order_items WHERE order_id = ? AND parent_item_id IS NULL'
    ).bind(orderId).all<{ id: number; shipment_ready: number | null }>()
    const notReady = items.filter(i => !i.shipment_ready)
    if (notReady.length > 0) {
      return c.json({ success: false, error: `미완료 품목이 ${notReady.length}건 있습니다.` }, 400)
    }

    const method = (order.delivery_method || '').trim()
    const isQuick = method === '방문수령' || method === '직접수령' || method === '직접배송' || method === '퀵'
    const delayDays = isQuick ? 1 : 2

    // 카드 출고 처리 (PRINT_DONE 카드에 shipped_at)
    await c.env.DB.prepare(
      `UPDATE cards SET shipped_at = CURRENT_TIMESTAMP, shipped_by = ?
       WHERE order_id = ? AND status = 'PRINT_DONE' AND shipped_at IS NULL`
    ).bind(user?.id || null, orderId).run()

    // 기성품/유통(production_required=0) 라인 재고 차감 (Phase 3) — 멱등(중복 OUT 스킵)
    await deductStockLinesOnShip(c.env.DB, Number(orderId), order.entity_id || getEntityId(c) || 1)

    // #1: 출고처리 즉시 SHIPPED 전이 (지연 sync 의존 제거). 청구 타이밍은 기존 2단 지연 총합 보존.
    let orderShipped = false
    if (order.status !== 'SHIPPED' && order.status !== 'CANCELLED') {
      const upd = await c.env.DB.prepare(
        `UPDATE orders SET status = 'SHIPPED', updated_at = CURRENT_TIMESTAMP,
           shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP),
           billable_after = date('now', '+9 hours', '+' || ? || ' days'),
           auto_complete_date = COALESCE(auto_complete_date, date('now', '+9 hours'))
         WHERE id = ? AND status = ?`
      ).bind(delayDays * 2, orderId, order.status).run()
      orderShipped = (upd.meta.changes ?? 0) > 0
      if (orderShipped) {
        await c.env.DB.prepare(
          `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
           VALUES (?, ?, 'SHIPPED', ?, '출고처리 즉시 전이')`
        ).bind(orderId, order.status, user?.id || null).run()
      }
    }

    // P1 출고 정합화: 출고확정 시 shipment 레코드 일원 생성 (실패해도 출고는 유지)
    try {
      await ensureShipmentForOrder(c.env.DB, Number(orderId), { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1 })
    } catch (shipRecErr) {
      console.error('ship ensureShipment error:', shipRecErr)
    }

    return c.json({ success: true, message: '출고완료 처리되었습니다.' })
  } catch (err) {
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /hanjin-export - 한진 대량등록(송장출력 요청) 엑셀(CSV) 생성
//   보내는분 = 법인 회사정보(entities), 받는분 = 프론트 전달, 출고번호 = H-{date}-{client_id}
// ============================================================================
shipmentsRouter.post('/hanjin-export', async (c) => {
  try {
    const body = await c.req.json<{
      date?: string
      targets?: Array<{ client_id?: number; client_name?: string; phone?: string; address?: string; item?: string }>
    }>()
    const targets = body.targets || []
    if (!targets.length) return c.json({ success: false, error: '발송 대상이 없습니다.' }, 400)

    const dateStr = (body.date || '').replace(/-/g, '')
    const company = await getEntityCompanyInfo(c.env.DB, getEntityId(c) || 1)

    const header = ['출고번호', '보내시는 분', '보내시는 분 전화', '보내는분담당자', '보내는분담당자HP', '보내는분총주소', '받으시는 분', '받으시는 분 전화', '받는분담당자', '받는분우편번호', '받는분총주소', '내품명1']
    const esc = escapeCsvField  // #367: 공용 formula injection 가드 적용
    const rows = targets.map((t) => [
      `H-${dateStr}-${t.client_id ?? ''}`,        // 출고번호(import 1:1 매칭 키)
      company.company_name || '',
      company.company_phone || '',
      company.company_representative || '',
      '',
      company.company_address || '',
      t.client_name || '',
      (t.phone || '').replace(/[^0-9]/g, ''),     // 받는분 전화: 숫자만
      '',
      '',
      t.address || '',
      t.item || '',
    ].map(esc).join(','))

    const csv = '﻿' + header.join(',') + '\n' + rows.join('\n')  // UTF-8 BOM(엑셀 한글)
    return c.json({ success: true, data: { csv, count: targets.length } })
  } catch (error) {
    console.error('src/routes/shipments.ts POST /hanjin-export error:', error)
    return c.json({ success: false, error: '한진 엑셀 생성 실패' }, 500)
  }
})

export default shipmentsRouter