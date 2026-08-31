import { Hono } from 'hono'
import { OWN_DELIVERY_METHODS } from '../constants/deliveryMethod'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { requireAnyPagePermission, requireEditOrRole, requireAccessOrRole } from '../middleware/permissions'
import { sendEmail } from '../services/emailProvider'
import { renderTemplate } from '../services/emailTemplates'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { getNextSeqNumber, withSeqRetry } from '../utils/sequenceGenerator'
import { autoDeductPostProcessingMaterials } from '../utils/autoDeductPostProcessingMaterials'
import { deductStockLinesOnShip, restoreStockLinesOnUnship } from '../utils/stockShip'
import { restorePpDeductionsByOrder } from '../utils/autoDeductRestore'
import { ensureShipmentForOrder } from '../utils/shipmentHelper'
import { kstYmd, kstYmdCompact, kstDate } from '../utils/kstDate'
import { CONSOLIDATABLE_ORDER_STATUSES } from '../utils/statusLabels'
import { getEntityCompanyInfo } from '../utils/entitySettings'
import { escapeCsvField } from '../utils/csv'

const shipmentsRouter = new Hono<HonoEnv>()
// v2 P4: /pack(모바일 출고 검수) 권한 보유자도 출고 데이터 API 사용 (orders 라우터의 '/orders','/cards' 패턴)
shipmentsRouter.use('/*', authMiddleware, requireAnyPagePermission('/shipments', '/pack'))

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
      ORDER BY s.shipped_at DESC, s.created_at DESC, s.id DESC
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
    const targetDate = date || kstYmd()

    const efDaily = entityFilter(c, 'o')
    // P1 출고 정합화: 최신 활성 shipment 1:1 조인 — 송장번호/라벨수량/수신자주소 재표시
    // (기존엔 미조인이라 저장한 송장번호가 재로딩 시 빈칸으로 보이던 버그)
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.delivery_info,
             o.delivery_postal, o.delivery_detail,
             o.delivery_time, o.status, o.final_amount, o.contact_phone, o.notes,
             o.reception_location, o.shipping_payment,
             o.entity_id, en.short_name as entity_name,
             cl.id as client_id, cl.client_name, cl.phone as client_phone, cl.mobile as client_mobile,
             cl.address as client_address, cl.delivery_address,
             sp.id as shipment_id, sp.merged_into_id,
             COALESCE(spm.tracking_number, sp.tracking_number) as tracking_number,
             COALESCE(spm.label_count, sp.label_count) as label_count,
             COALESCE(spm.box_count, sp.box_count) as box_count,
             COALESCE(spm.receiver_address, sp.receiver_address) as receiver_address,
             COALESCE(spm.delivery_type, sp.delivery_type) as delivery_type,
             COALESCE(spm.courier_name, sp.courier_name) as courier_name,
             om.delivery_method as primary_delivery_method,
             sp.status as shipment_status,
             (SELECT COUNT(*) FROM shipment_checks sc WHERE sc.shipment_id = sp.id) as chk_total,
             (SELECT COUNT(*) FROM shipment_checks sc WHERE sc.shipment_id = sp.id AND sc.checked_at IS NOT NULL) as chk_done,
             o.consolidate_with_order_id,
             (SELECT MAX(o2.delivery_date) FROM orders o2
              WHERE (o2.id = COALESCE(o.consolidate_with_order_id, o.id)
                     OR o2.consolidate_with_order_id = COALESCE(o.consolidate_with_order_id, o.id))
                AND o2.id != o.id
                AND o2.status NOT IN ('CANCELLED', 'DELETED')
                AND o2.shipped_at IS NULL) as consolidate_partner_pending_date,
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
      LEFT JOIN shipments spm ON spm.id = sp.merged_into_id
      LEFT JOIN orders om ON om.id = spm.order_id
      WHERE o.delivery_date = ? AND o.status NOT IN ('CANCELLED', 'DELETED', 'DRAFT')${efDaily.clause}
      GROUP BY o.id
      ORDER BY o.delivery_time IS NULL, o.delivery_time ASC, o.delivery_method ASC, cl.client_name ASC, o.id ASC
    `).bind(targetDate, ...efDaily.params).all()

    // 품목 상세
    interface DailyOrderRow { id: number; [key: string]: unknown }
    interface DailyItemRow { order_id: number; item_name: string; category_name: string | null; specification: string | null; width: number | null; height: number | null; quantity: number; content: string | null }
    const orderIds = (results as DailyOrderRow[]).map(r => r.id)
    const ordersWithItems = results as (DailyOrderRow & { items?: DailyItemRow[]; item_summary?: string })[]

    if (orderIds.length > 0) {
      // #458: D1 바인드 한도(100) — IN절 80청크 분할 후 병합 (cards #409 패턴)
      const itemRows: DailyItemRow[] = []
      for (let i = 0; i < orderIds.length; i += 80) {
        const chunk = orderIds.slice(i, i + 80)
        const placeholders = chunk.map(() => '?').join(',')
        const { results: chunkRows } = await c.env.DB.prepare(`
          SELECT oi.order_id, oi.item_name, oi.category_name, oi.specification, oi.width, oi.height,
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

    // 합배송 파트너(미출고) 상세 — 출고확정 동반 출고 프롬프트용.
    // 그룹 키 = COALESCE(consolidate_with_order_id, id). 미출고 파트너가 있는 행에만 부착.
    interface PartnerRow { id: number; order_number: string; delivery_date: string | null; entity_id: number | null; entity_name: string | null; root_id: number; chk_done: number; line_total: number }
    const pendingRows = ordersWithItems.filter(r => r.consolidate_partner_pending_date != null)
    if (pendingRows.length > 0) {
      const rootIds = [...new Set(pendingRows.map(r => Number(r.consolidate_with_order_id ?? r.id)))]
      const partnerRows: PartnerRow[] = []
      // IN절 2회 사용 → 청크 40 (바인드 80, D1 한도 100 이내)
      for (let i = 0; i < rootIds.length; i += 40) {
        const chunk = rootIds.slice(i, i + 40)
        const ph = chunk.map(() => '?').join(',')
        const { results: rows } = await c.env.DB.prepare(`
          SELECT o2.id, o2.order_number, o2.delivery_date, o2.entity_id, en2.short_name as entity_name,
                 COALESCE(o2.consolidate_with_order_id, o2.id) as root_id,
                 (SELECT COUNT(*) FROM shipment_checks sc WHERE sc.checked_at IS NOT NULL AND sc.shipment_id =
                   (SELECT id FROM shipments s2 WHERE s2.order_id = o2.id AND s2.status != 'CANCELLED' ORDER BY s2.id DESC LIMIT 1)) as chk_done,
                 (SELECT COUNT(*) FROM order_items oi2 WHERE oi2.order_id = o2.id AND (oi2.parent_item_id IS NULL OR oi2.parent_item_id = 0)) as line_total
          FROM orders o2 LEFT JOIN entities en2 ON en2.id = o2.entity_id
          WHERE (o2.id IN (${ph}) OR o2.consolidate_with_order_id IN (${ph}))
            AND o2.status NOT IN ('CANCELLED', 'DELETED') AND o2.shipped_at IS NULL
        `).bind(...chunk, ...chunk).all<PartnerRow>()
        if (rows) partnerRows.push(...rows)
      }
      const byRoot: Record<number, PartnerRow[]> = {}
      for (const p of partnerRows) {
        if (!byRoot[p.root_id]) byRoot[p.root_id] = []
        byRoot[p.root_id].push(p)
      }
      for (const row of pendingRows) {
        const root = Number(row.consolidate_with_order_id ?? row.id)
        ;(row as { consolidate_partners?: PartnerRow[] }).consolidate_partners =
          (byRoot[root] || []).filter(p => p.id !== row.id)
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
shipmentsRouter.get('/consolidation-candidates', requireAccessOrRole('/shipments', 'MANAGER'), async (c) => {
  try {
    const { date } = c.req.query()
    const targetDate = date || kstYmd()

    interface ConsolidationRow {
      id: number; order_number: string; entity_id: number | null; entity_name: string | null
      delivery_method: string | null; delivery_time: string | null; delivery_info: string | null
      shipping_payment: string | null; client_id: number; client_name: string; postal_code: string | null
      shipment_id: number | null; merged_into_id: number | null
      delivery_date: string | null; shipped_at: string | null; is_today?: boolean; waiting?: boolean
    }
    // v2 확장: 당일 출고 거래처(anchor)의 "미출고 전체" 주문을 함께 조회 —
    // 같은 법인 복수 주문·납품일 다른 주문도 합배송 후보로 (기존: 같은 날 + 복수 법인만)
    // ⚠️ 딸림(미출고) 절만 진행중 상태 화이트리스트 + 30일 제한. anchor(당일 납품일) 절은
    //    상태 무관 유지 — 당일 이미 출고한 건이 빠지면 묶음(merged_into_id) 표시가 깨진다.
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.entity_id, en.short_name as entity_name,
             o.delivery_method, o.delivery_time, o.delivery_info, o.shipping_payment,
             o.delivery_date, o.shipped_at,
             cl.id as client_id, cl.client_name,
             sp.id as shipment_id, sp.merged_into_id,
             -- 0535: 우편번호는 orders.delivery_postal 이 정본. 레거시 '[nnnnn] 주소' 프리픽스는
             --   폴백으로만 남긴다(prod 0건이지만 외부 유입 대비).
             COALESCE(
               CASE WHEN o.delivery_postal GLOB '[0-9][0-9][0-9][0-9][0-9]' THEN o.delivery_postal END,
               CASE WHEN substr(o.delivery_info, 1, 1) = '[' AND substr(o.delivery_info, 7, 1) = ']'
                         AND substr(o.delivery_info, 2, 5) GLOB '[0-9][0-9][0-9][0-9][0-9]'
                    THEN substr(o.delivery_info, 2, 5) END
             ) as postal_code
      FROM orders o
      JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN entities en ON en.id = o.entity_id
      LEFT JOIN shipments sp ON sp.id = (
        SELECT id FROM shipments WHERE order_id = o.id AND status != 'CANCELLED' ORDER BY id DESC LIMIT 1
      )
      WHERE o.status NOT IN ('CANCELLED', 'DELETED', 'DRAFT', 'QUOTATION')
        AND (o.delivery_date = ?
             OR (o.shipped_at IS NULL
                  AND o.status IN (${CONSOLIDATABLE_ORDER_STATUSES.map(() => '?').join(', ')})
                  AND o.order_date >= ${kstDate("'-30 days'")}
                  AND o.client_id IN (
                  SELECT o3.client_id FROM orders o3
                  WHERE o3.delivery_date = ? AND o3.status NOT IN ('CANCELLED', 'DELETED', 'DRAFT', 'QUOTATION')
                )))
      ORDER BY cl.client_name ASC, o.delivery_date ASC, o.entity_id ASC
    `).bind(targetDate, ...CONSOLIDATABLE_ORDER_STATUSES, targetDate).all<ConsolidationRow>()

    for (const r of results) {
      r.is_today = r.delivery_date === targetDate
      r.waiting = !r.is_today // 당일이 아닌 미출고 건 (WHERE 조건상 비당일 = 미출고만 조회됨)
    }

    // ① 같은 거래처 미출고 복수 주문 → 합포장/합짐 후보 (법인 수·배송방법·납품일 무관, anchor=당일 1건+)
    const byClient = new Map<number, ConsolidationRow[]>()
    for (const r of results) {
      if (!byClient.has(r.client_id)) byClient.set(r.client_id, [])
      byClient.get(r.client_id)!.push(r)
    }
    const sameClient: any[] = []
    for (const rows of byClient.values()) {
      const entities = new Set(rows.map(r => r.entity_id))
      if (rows.length >= 2 && rows.some(r => r.is_today)) {
        // P3: 묶음 상태 — 전 주문의 실효 대표(merged_into || 자신)가 하나로 수렴하면 합포장 완료
        const primaries = new Set(rows.map(r => r.shipment_id ? (r.merged_into_id || r.shipment_id) : null))
        const merged = !primaries.has(null) && primaries.size === 1 && rows.length >= 2
        sameClient.push({
          client_id: rows[0].client_id,
          client_name: rows[0].client_name,
          entity_count: entities.size,
          waiting_count: rows.filter(r => r.waiting).length,
          merged,
          orders: rows,
        })
      }
    }

    // ② 같은 권역(우편번호 앞 3자리) × 자가배송(직배/용차/퀵) → 동선 묶음 후보 (당일 건만)
    //    ①에 이미 잡힌 거래처는 제외. 복수 법인 겹침 또는 단일 법인이라도 3건+ 묶음.
    const OWN_DELIVERY = new Set<string>(OWN_DELIVERY_METHODS)   // constants/deliveryMethod.ts SSOT (과거 표기 '직배' 포함)
    const sameClientIds = new Set(sameClient.map(g => g.client_id))
    const byRegion = new Map<string, ConsolidationRow[]>()
    for (const r of results) {
      if (!r.is_today) continue
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
// POST /merge - 동일 거래처 합포장 묶음 (P3)
// 같은 날 + 같은 거래처의 복수 주문(법인 무관)을 한 박스로 묶는다.
// 각 주문의 shipment는 유지, 대표(최소 shipment id) 외에는 merged_into_id로 연결.
// 송장/라벨수량/수신자주소 쓰기는 대표로 리다이렉트(applyShipmentFieldPatch).
// ============================================================================
shipmentsRouter.post('/merge', requireEditOrRole('/shipments', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const { order_ids } = await c.req.json<{ order_ids: number[] }>()
    if (!Array.isArray(order_ids) || order_ids.length < 2) {
      return c.json({ success: false, error: '묶을 주문을 2건 이상 지정하세요.' }, 400)
    }

    // 같은 거래처 검증 (한 박스 전제).
    // v2: 납품일 동일 검증 제거 — 납품일이 다른 주문도 묶기 허용(이른 주문은 '합배송 대기'로 보류,
    // 실제 출고 시점에 함께 나감). 대기 가시성 = /daily consolidate_partner_pending_date 배지.
    // status 조건은 후보 조회(:300)와 동일 — 취소·삭제·초안·견적 주문이 묶음에 섞이던
    //   형제-비대칭 차단(2026-07-29 구조감사). 법인 조건은 의도적으로 없음(cross-entity 합포장 = 요구사항).
    const ph = order_ids.map(() => '?').join(',')
    const { results: orders } = await c.env.DB.prepare(
      `SELECT id, client_id, delivery_date FROM orders
       WHERE id IN (${ph}) AND status NOT IN ('CANCELLED', 'DELETED', 'DRAFT', 'QUOTATION')`
    ).bind(...order_ids).all<{ id: number; client_id: number; delivery_date: string | null }>()
    if (orders.length !== order_ids.length) {
      return c.json({ success: false, error: '취소·삭제·견적 상태이거나 존재하지 않는 주문이 포함되어 있습니다.' }, 404)
    }
    if (new Set(orders.map(o => o.client_id)).size > 1) {
      return c.json({ success: false, error: '같은 거래처의 주문만 합포장할 수 있습니다.' }, 400)
    }

    // shipment 확보 (미출고 주문은 PREPARING 생성)
    const shipmentIds: number[] = []
    for (const o of orders) {
      const sid = await ensureShipmentForOrder(c.env.DB, o.id, { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1, status: 'PREPARING' })
      if (!sid) return c.json({ success: false, error: `주문 ${o.id}의 출고 정보를 생성할 수 없습니다.` }, 500)
      shipmentIds.push(sid)
    }

    const primaryId = Math.min(...shipmentIds)
    const childIds = shipmentIds.filter(sid => sid !== primaryId)
    // v2: 접수 예약 포인터(0438)도 동기 — 납품일 다른 묶음의 '합배송 대기' 배지 근거 +
    // unmerge 시 그룹 예약 클리어와 대칭. root = 대표 shipment의 주문 (1-hop, 체인 없음)
    const rootOrderId = orders[shipmentIds.indexOf(primaryId)]?.id
    const childOrderIds = orders.filter(o => o.id !== rootOrderId).map(o => o.id)
    const stmts = [
      c.env.DB.prepare(`UPDATE shipments SET merged_into_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(primaryId),
      ...childIds.map(sid =>
        c.env.DB.prepare(`UPDATE shipments SET merged_into_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(primaryId, sid)
      ),
      // 부속이 기존에 다른 묶음의 대표였다면 그 자식들도 새 대표로 재지정 (체인 방지)
      ...(childIds.length > 0
        ? [c.env.DB.prepare(`UPDATE shipments SET merged_into_id = ? WHERE merged_into_id IN (${childIds.map(() => '?').join(',')})`).bind(primaryId, ...childIds)]
        : []),
      ...(rootOrderId && childOrderIds.length > 0
        ? [
            c.env.DB.prepare(`UPDATE orders SET consolidate_with_order_id = NULL WHERE id = ?`).bind(rootOrderId),
            c.env.DB.prepare(`UPDATE orders SET consolidate_with_order_id = ? WHERE id IN (${childOrderIds.map(() => '?').join(',')})`).bind(rootOrderId, ...childOrderIds),
          ]
        : []),
    ]
    await c.env.DB.batch(stmts)

    return c.json({ success: true, data: { primary_shipment_id: primaryId, merged: childIds.length }, message: `${order_ids.length}건 합포장 묶음 완료` })
  } catch (error) {
    console.error('shipments merge error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// POST /unmerge - 합포장 해제 (그룹 전체 해제)
// ============================================================================
shipmentsRouter.post('/unmerge', requireEditOrRole('/shipments', 'MANAGER'), async (c) => {
  try {
    const { order_id } = await c.req.json<{ order_id: number }>()
    if (!order_id) return c.json({ success: false, error: 'order_id가 필요합니다.' }, 400)

    const shipment = await c.env.DB.prepare(
      `SELECT id, merged_into_id FROM shipments WHERE order_id = ? AND status != 'CANCELLED' ORDER BY id DESC LIMIT 1`
    ).bind(order_id).first<{ id: number; merged_into_id: number | null }>()
    if (!shipment) return c.json({ success: false, error: '출고 정보를 찾을 수 없습니다.' }, 404)

    const primaryId = shipment.merged_into_id || shipment.id

    // 그룹 멤버 주문의 접수 시점 합배송 예약(0438)도 함께 해제 —
    // 예약이 남으면 다음 출고확정 이벤트에서 자동으로 다시 묶여 해제가 무력화됨
    const { results: groupOrders } = await c.env.DB.prepare(
      `SELECT order_id FROM shipments WHERE id = ? OR merged_into_id = ?`
    ).bind(primaryId, primaryId).all<{ order_id: number }>()
    const groupOrderIds = groupOrders.map(r => r.order_id).filter(Boolean)

    const res = await c.env.DB.prepare(
      `UPDATE shipments SET merged_into_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE merged_into_id = ?`
    ).bind(primaryId).run()

    if (groupOrderIds.length > 0) {
      const gph = groupOrderIds.map(() => '?').join(',')
      await c.env.DB.prepare(
        `UPDATE orders SET consolidate_with_order_id = NULL WHERE id IN (${gph}) AND consolidate_with_order_id IS NOT NULL`
      ).bind(...groupOrderIds).run()
    }

    return c.json({ success: true, data: { released: res.meta.changes ?? 0 }, message: '합포장이 해제되었습니다.' })
  } catch (error) {
    console.error('shipments unmerge error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /pack-search?q= — 출고 검수(모바일) 주문 찾기. **읽기 전용**
//   ⚠️ /checklist/by-order 는 shipment(PREPARING) 생성 + shipment_checks upsert 를 하는 **쓰기** 경로다.
//      후보 탐색에 그걸 쓰면 엉뚱한 주문에 출고 레코드가 생긴다 → 탐색은 반드시 이 라우트로.
//   숫자 입력도 여기로 온다. 주문번호 부분일치 + '주문 ID 정확일치' 후보를 함께 돌려주고 자동으로 열지 않는다
//   (현장에서 주문번호 꼬리 3자리를 치면 그 숫자가 **다른 주문의 id** 로 해석돼 열리던 위험 제거, 2026-08-19).
//   LIKE 대신 instr — D1 LIKE 패턴 50바이트 제한(한글 16자) 회피.
// ※ /:id 보다 먼저 등록
// ============================================================================
shipmentsRouter.get('/pack-search', async (c) => {
  try {
    const raw = (c.req.query('q') || '').trim()
    if ([...raw].length < 2) return c.json({ success: false, error: '2자 이상 입력하세요.' }, 400)
    const q = [...raw].slice(0, 40).join('')            // 길이 상한(검색어 폭주·바인드 낭비 방지)
    const idExact = /^\d+$/.test(q) ? parseInt(q) : 0
    const ef = entityFilter(c, 'o')

    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.status, o.shipped_at,
             cl.client_name, en.short_name AS entity_name,
             (SELECT COUNT(*) FROM order_items oi
               WHERE oi.order_id = o.id AND (oi.parent_item_id IS NULL OR oi.parent_item_id = 0)) AS line_count,
             CASE WHEN o.id = ? THEN 1 ELSE 0 END AS id_match
      FROM orders o
      LEFT JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN entities en ON en.id = o.entity_id
      WHERE (instr(o.order_number, ?) > 0 OR instr(COALESCE(cl.client_name, ''), ?) > 0 OR o.id = ?)${ef.clause}
      ORDER BY id_match DESC, (o.shipped_at IS NULL) DESC,
               o.delivery_date IS NULL, o.delivery_date DESC, o.id DESC
      LIMIT 11
    `).bind(idExact, q, q, idExact, ...ef.params).all()

    const rows = (results || []) as unknown[]
    return c.json({ success: true, data: rows.slice(0, 10), has_more: rows.length > 10 })
  } catch (e) {
    console.error('pack-search error:', e)
    return c.json({ success: false, error: '검색 실패' }, 500)
  }
})

// ============================================================================
// GET /checklist/by-order/:orderId - 포장 검수 체크리스트 (출고관리 v2 P1)
// shipment(없으면 PREPARING 생성) 확보 + 주문 라인 스냅샷(shipment_checks upsert) 후 반환.
// 검수 단위 = top-level order_item. packed_quantity NULL = 전량.
// ※ /:id 보다 먼저 등록
// ============================================================================
shipmentsRouter.get('/checklist/by-order/:orderId', async (c) => {
  try {
    const rawParam = c.req.param('orderId')
    const orderId = /^\d+$/.test(rawParam) ? parseInt(rawParam) : 0
    if (!orderId && !rawParam) return c.json({ success: false, error: '주문 ID가 필요합니다.' }, 400)

    const ef = entityFilter(c, 'o')
    // 숫자 = 주문 ID, 비숫자 = 주문번호 (/pack 수동 입력·QR 폴백)
    const order = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_date, o.delivery_method, o.status, o.shipped_at,
             o.entity_id, en.short_name as entity_name, cl.client_name
      FROM orders o
      LEFT JOIN clients cl ON o.client_id = cl.id
      LEFT JOIN entities en ON en.id = o.entity_id
      WHERE ${orderId ? 'o.id = ?' : 'o.order_number = ?'}${ef.clause}
    `).bind(orderId || rawParam, ...ef.params).first<{
      id: number; order_number: string; delivery_date: string | null; delivery_method: string | null
      status: string; shipped_at: string | null; entity_id: number | null; entity_name: string | null; client_name: string | null
    }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)

    const user = c.get('user')
    const shipmentId = await ensureShipmentForOrder(c.env.DB, order.id, { userId: user?.id ?? null, fallbackEntityId: getEntityId(c) || 1, status: 'PREPARING' })
    if (!shipmentId) return c.json({ success: false, error: '출고 정보를 생성할 수 없습니다.' }, 500)

    // 라인 스냅샷 upsert — 신규 추가 라인도 재조회 시 합류 (UNIQUE + OR IGNORE 멱등)
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO shipment_checks (shipment_id, order_item_id)
      SELECT ?, oi.id FROM order_items oi
      WHERE oi.order_id = ? AND (oi.parent_item_id IS NULL OR oi.parent_item_id = 0)
    `).bind(shipmentId, order.id).run()

    const { results: lines } = await c.env.DB.prepare(`
      SELECT sc.order_item_id, sc.packed_quantity, sc.checked_at, sc.checked_by, u.name as checker_name,
             oi.item_name, oi.specification, oi.width, oi.height, oi.quantity, oi.unit, oi.content, oi.shipment_ready
      FROM shipment_checks sc
      JOIN order_items oi ON oi.id = sc.order_item_id
      LEFT JOIN users u ON u.id = sc.checked_by
      WHERE sc.shipment_id = ?
      ORDER BY oi.sort_order ASC, oi.id ASC
    `).bind(shipmentId).all()

    // 합포장 그룹 (통합 명세서·묶음 검수용)
    const sp = await c.env.DB.prepare(`SELECT merged_into_id, status FROM shipments WHERE id = ?`)
      .bind(shipmentId).first<{ merged_into_id: number | null; status: string }>()
    const primaryId = sp?.merged_into_id || shipmentId
    // 갭4: 파트너 가시화 — 검수 진척(chk_*)·라인수·법인 동봉. 표기는 법인 무관(합배송 후보 카드와 동일 정책),
    // 검수 라인 로드 자체는 by-order 최상위 entityFilter가 계속 게이트.
    const { results: group } = await c.env.DB.prepare(`
      SELECT s.id as shipment_id, s.order_id, o.order_number, o.delivery_date,
             o.entity_id, en2.short_name as entity_name,
             (SELECT COUNT(*) FROM shipment_checks sc WHERE sc.shipment_id = s.id) as chk_total,
             (SELECT COUNT(*) FROM shipment_checks sc WHERE sc.shipment_id = s.id AND sc.checked_at IS NOT NULL) as chk_done,
             (SELECT COUNT(*) FROM order_items oi2 WHERE oi2.order_id = s.order_id AND (oi2.parent_item_id IS NULL OR oi2.parent_item_id = 0)) as line_total
      FROM shipments s JOIN orders o ON o.id = s.order_id
      LEFT JOIN entities en2 ON en2.id = o.entity_id
      WHERE (s.id = ? OR s.merged_into_id = ?) AND s.status != 'CANCELLED'
      ORDER BY s.id ASC
    `).bind(primaryId, primaryId).all()

    return c.json({
      success: true,
      data: {
        shipment_id: shipmentId,
        shipment_status: sp?.status || 'PREPARING',
        order: {
          id: order.id, order_number: order.order_number, client_name: order.client_name,
          delivery_date: order.delivery_date, delivery_method: order.delivery_method,
          status: order.status, shipped_at: order.shipped_at, entity_name: order.entity_name,
        },
        lines,
        group,
      },
    })
  } catch (error) {
    console.error('shipments checklist error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PATCH /checklist/:shipmentId - 검수 라인 체크 저장 (출고관리 v2 P1)
// checked=true → checked_at/by 스탬프(최초 체크 시각 보존), false → NULL 복귀.
// packed_quantity: 예외(일부만 담음) 시에만 값, 전량이면 null.
// ============================================================================
shipmentsRouter.patch('/checklist/:shipmentId', async (c) => {
  try {
    const sid = parseInt(c.req.param('shipmentId'))
    const body = await c.req.json<{ items?: Array<{ order_item_id: number; checked: boolean; packed_quantity?: number | null }> }>()
    if (!sid || !Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ success: false, error: 'items가 필요합니다.' }, 400)
    }

    const ef = entityFilter(c, 'o')
    const sp = await c.env.DB.prepare(
      `SELECT s.id FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.id = ?${ef.clause}`
    ).bind(sid, ...ef.params).first<{ id: number }>()
    if (!sp) return c.json({ success: false, error: '출고 정보를 찾을 수 없습니다.' }, 404)

    const user = c.get('user')
    const stmts = body.items.map((it) => {
      const pq = (it.packed_quantity === undefined || it.packed_quantity === null) ? null : Number(it.packed_quantity)
      return it.checked
        ? c.env.DB.prepare(
            `UPDATE shipment_checks SET checked_at = COALESCE(checked_at, CURRENT_TIMESTAMP), checked_by = COALESCE(checked_by, ?), packed_quantity = ? WHERE shipment_id = ? AND order_item_id = ?`
          ).bind(user?.id ?? null, pq, sid, it.order_item_id)
        : c.env.DB.prepare(
            `UPDATE shipment_checks SET checked_at = NULL, checked_by = NULL, packed_quantity = ? WHERE shipment_id = ? AND order_item_id = ?`
          ).bind(pq, sid, it.order_item_id)
    })
    await c.env.DB.batch(stmts)

    const summary = await c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN checked_at IS NOT NULL THEN 1 ELSE 0 END) as done FROM shipment_checks WHERE shipment_id = ?`
    ).bind(sid).first<{ total: number; done: number }>()

    return c.json({ success: true, data: { shipment_id: sid, total: summary?.total || 0, done: summary?.done || 0 } })
  } catch (error) {
    console.error('shipments checklist patch error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /dashboard/counts - 출고 카운트 (사이드바 뱃지용)
// ※ /:id 보다 먼저 등록해야 "dashboard"가 :id로 매칭되지 않음
// ============================================================================
shipmentsRouter.get('/dashboard/counts', async (c) => {
  try {
    const today = kstYmd()
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
    const targetDate = date || kstYmd()
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT
        o.id as order_id, o.order_number, o.delivery_method, o.delivery_date, o.delivery_time,
        o.status as order_status,
        c.id as client_id, c.client_name,
        oi.id as order_item_id, oi.item_name, oi.quantity, oi.width, oi.height,
        oi.specification, oi.content, oi.unit,
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
      ORDER BY c.client_name ASC, o.id ASC, oi.sort_order ASC, oi.id ASC
    `).bind(targetDate, ...ef.params).all<{
      order_id: number; order_number: string; delivery_method: string | null; delivery_date: string | null; delivery_time: string | null; order_status: string;
      client_id: number; client_name: string;
      order_item_id: number; item_name: string; quantity: number; width: number | null; height: number | null; specification: string | null; content: string | null; unit: string | null; amount: number | null; shipment_ready: number | null;
      card_id: number | null; card_number: string | null; card_status: string | null; card_category: string | null;
    }>()

    interface DashboardItem { order_item_id: number; item_name: string; quantity: number; width: number | null; height: number | null; specification: string | null; content: string | null; unit: string | null; amount: number | null; shipment_ready: number | null; card_id: number | null; card_number: string | null; card_status: string | null; card_category: string | null }
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
        width: row.width, height: row.height, specification: row.specification, content: row.content, unit: row.unit,
        amount: row.amount, shipment_ready: row.shipment_ready,
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
shipmentsRouter.post('/', requireEditOrRole('/shipments', 'MANAGER', 'DESIGNER'), async (c) => {
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

    // v2 전량 출고 원칙 (부분출고 전면 금지):
    // ① 주문의 미출고 카드는 전부 PRINT_DONE이어야 하고 ② card_ids 지정 시 미출고 카드 전체를 커버해야 한다.
    {
      const { results: pendingCards } = await c.env.DB.prepare(`
        SELECT id, card_number, status FROM cards WHERE order_id = ? AND shipped_at IS NULL
      `).bind(body.order_id).all<{ id: number; card_number: string; status: string }>()
      const notDone = pendingCards.filter(cd => cd.status !== 'PRINT_DONE')
      if (notDone.length > 0) {
        return c.json({ success: false, error: `미완성 카드 ${notDone.length}건(${notDone.map(x => x.card_number || x.id).join(', ')}) — 전량 출고 원칙에 따라 출고할 수 없습니다.` }, 400)
      }
      if (body.card_ids && body.card_ids.length > 0) {
        const idSet = new Set(body.card_ids)
        const uncovered = pendingCards.filter(cd => !idSet.has(cd.id))
        if (uncovered.length > 0) {
          return c.json({ success: false, error: `미포함 미출고 카드 ${uncovered.length}건(${uncovered.map(x => x.card_number || x.id).join(', ')}) — 부분 출고는 불가합니다. 전체 카드를 포함하세요.` }, 400)
        }
      }
    }

    // 출고번호 생성 (#148: entity별 독립 시퀀스)
    const dateStr = kstYmdCompact()
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
  // P3 합포장: 부속 shipment는 대표로 리다이렉트 (송장/라벨수량/수신자 정본 = 대표)
  const merged = await db.prepare(`SELECT merged_into_id FROM shipments WHERE id = ?`).bind(shipmentId).first<{ merged_into_id: number | null }>()
  if (merged?.merged_into_id) shipmentId = merged.merged_into_id

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
  // #477: 리다이렉트 대상(대표)이 삭제됐으면 0행 → true 반환 시 무성 write 손실. meta.changes로 판정.
  const res = await db.prepare(`UPDATE shipments SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()
  return (res.meta.changes ?? 0) > 0
}

// ============================================================================
// PATCH /by-order/:orderId - 주문 기준 라벨/송장/수신자 업데이트 (없으면 자동 생성)
// P1 정합화: 기존 PATCH /:id의 "shipment PK 우선 → order_id 폴백" 조회는 shipments 행이
// 축적되면 타 주문 shipment를 오업데이트할 수 있어(ID 공간 충돌) 주문 기준 명시 라우트로 분리.
// ============================================================================
shipmentsRouter.patch('/by-order/:orderId', requireEditOrRole('/shipments', 'MANAGER', 'OPERATOR'), async (c) => {
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
shipmentsRouter.patch('/:id', requireEditOrRole('/shipments', 'MANAGER', 'OPERATOR'), async (c) => {
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
shipmentsRouter.patch('/:id/status', requireEditOrRole('/shipments', 'MANAGER'), async (c) => {
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
      // 취소에 필요한 정보를 먼저 조회 (환원 대상 법인까지 함께)
      const orderRow = await c.env.DB.prepare(
        `SELECT s.order_id, o.entity_id FROM shipments s LEFT JOIN orders o ON o.id = s.order_id WHERE s.id = ?`
      ).bind(id).first<{ order_id: number; entity_id: number | null }>()

      const stmts: ReturnType<typeof c.env.DB.prepare>[] = [
        // 1) 출고 상태 변경
        c.env.DB.prepare(
          'UPDATE shipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(status, id),
        // #477: 취소되는 대표를 가리키는 합포장 자식 detach (취소행이 정본 되는 것 방지)
        c.env.DB.prepare(
          'UPDATE shipments SET merged_into_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE merged_into_id = ?'
        ).bind(id),
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
            // ★재고 환원 — 이 라우트의 출고(PATCH /:orderId/ship)는 예전부터 차감을 했는데
            //   취소 쪽에 환원이 없어 **출고취소가 곧 재고 증발**이었다(2026-08-30 발견, 기존 결함).
            //   batch 밖에서 도는 건 차감 쪽(deductStockLinesOnShip)과 같은 모양이다.
            const cancelActor = { userId: c.get('user')?.id ?? null, userName: c.get('user')?.username ?? null, entityId: getEntityId(c) }
            await restoreStockLinesOnUnship(
              c.env.DB, Number(orderRow.order_id), orderRow.entity_id || getEntityId(c) || 1, cancelActor
            )
            // 후가공 코팅지는 **출고 시점**에 차감된다(아래 autoDeductPostProcessingMaterials) → 취소도 짝을 맞춘다.
            await restorePpDeductionsByOrder(c.env.DB, Number(orderRow.order_id), cancelActor)
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
shipmentsRouter.patch('/:orderId/ship', requireEditOrRole('/shipments', 'MANAGER'), async (c) => {
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
      targets?: Array<{ client_id?: number; client_name?: string; phone?: string; postal?: string; address?: string; item?: string }>
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
      (t.postal || '').replace(/[^0-9]/g, ''),    // 받는분우편번호 (0535 — 이전엔 항상 공란)
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