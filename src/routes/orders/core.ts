import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order, OrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission, requireAccessOrRole } from '../../middleware/permissions'
import { getNextSeqNumber, getNextEntitySeqNumber, withSeqRetry } from '../../utils/sequenceGenerator'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { sendEmail } from '../../services/emailProvider'
import { getEntityId, entityFilter, orderVisibilityFilter } from '../../utils/entityFilter'
import { getEntityCompanyInfo } from '../../utils/entitySettings'
import { hydrateGroupsJson } from '../../utils/thumbnailStore'
import { deriveClientBalance } from '../ledger/ar-helpers'
import {
  recommendAssignedEntity,
  recalcOrderBillingGroups,
  setOrderBillingStatus,
  generateCardsForOrder,
} from './helpers'
import { buildOrderListFilter, resolveOrderSort, ORDER_SORT_DEFAULT, VOUCHER_ORDER_SQL, SHIP_DATE_ESTIMATED_SQL } from './listFilter'

const ordersCoreRouter = new Hono<HonoEnv>()
ordersCoreRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

// POST /api/orders/recon-status — 이카운트 대사 결과 일괄 기록 (0534)
//
// scripts/zscan-reconcile.py 가 주 1회 돌면서 결과를 여기로 되쓴다. CSV 로만 남기면 다음 주엔
// 잊히고, 같은 불일치를 매번 새로 발견하게 된다. 주문에 붙여야 이력이 쌓인다.
// ★대사는 **판정이 아니라 표시**다 — 주문 금액·상태를 건드리지 않는다. 사람이 보고 고친다.
const RECON_STATUSES = ['MATCHED', 'MISMATCH', 'NO_ECOUNT', 'NO_FILE'] as const
ordersCoreRouter.post('/recon-status', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<{
      items?: Array<{ order_id?: number; batch_key?: string; status?: string; note?: string }>
    }>().catch(() => null)
    const items = Array.isArray(body?.items) ? body!.items! : []
    if (!items.length) return c.json({ success: false, error: 'items 가 필요합니다.' }, 400)

    const ef = entityFilter(c, 'orders')
    // 대사 도구는 이카운트 전표번호를 알지만 MES 주문 id 는 모른다. 대신 **파일 그룹 키**를 안다.
    //   그룹키 → designer_intakes.batch_key → order_item_id → order_items.order_id → orders.id
    //   이 해소를 서버가 맡는다(오프라인 도구가 3단 조인을 흉내내면 갈린다).
    const byKey = new Map<string, number>()
    const keys = items.map((x) => x.batch_key).filter((k): k is string => !!k)
    for (let i = 0; i < keys.length; i += 60) {
      const chunk = keys.slice(i, i + 60)
      const ph = chunk.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        `SELECT di.batch_key, oi.order_id
           FROM designer_intakes di
           JOIN order_items oi ON oi.id = di.order_item_id
          WHERE di.batch_key IN (${ph}) AND di.order_item_id IS NOT NULL`
      ).bind(...chunk).all<{ batch_key: string; order_id: number }>()
      for (const r of results) if (!byKey.has(r.batch_key)) byKey.set(r.batch_key, r.order_id)
    }

    const stmts: D1PreparedStatement[] = []
    let skipped = 0, unresolved = 0
    for (const it of items) {
      const st = String(it.status || '')
      if (!RECON_STATUSES.includes(st as never)) { skipped++; continue }
      let id = Number(it.order_id)
      if (!(Number.isFinite(id) && id > 0) && it.batch_key) {
        id = byKey.get(it.batch_key) ?? 0
        if (!id) { unresolved++; continue }        // 아직 주문서가 안 된 그룹 — 정상이다
      }
      if (!(Number.isFinite(id) && id > 0)) { skipped++; continue }
      stmts.push(c.env.DB.prepare(
        `UPDATE orders SET recon_status = ?, recon_note = ?, recon_at = datetime('now')
          WHERE id = ?${ef.clause}`
      ).bind(st, it.note != null ? String(it.note).slice(0, 500) : null, id, ...ef.params))
    }
    // D1 바인드 한도(100) 회피 — 80개씩 끊는다(feedback/d1-bind-param-limit)
    for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80))
    return c.json({ success: true, data: { updated: stmts.length, skipped, unresolved } })
  } catch (error) {
    console.error('src/routes/orders/core.ts recon-status error:', error)
    return c.json({ success: false, error: '대사 결과 기록 실패' }, 500)
  }
})

ordersCoreRouter.get('/', async (c) => {
  try {
    // 조회조건(status·search·date_from…)은 buildOrderListFilter 가 c.req.query() 에서 직접 읽는다.
    const { page = '1', limit = '50', sort = ORDER_SORT_DEFAULT } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        o.*,
        c.client_name,
        c.mobile as client_mobile,
        c.phone as client_phone,
        c.email as client_email,
        c.fax as client_fax,
        u.name as created_by_name,
        sr.name as sales_rep_name,
        sr.department as sales_rep_dept,
        (SELECT COUNT(*) FROM cards WHERE order_id = o.id) as total_cards,
        (SELECT COUNT(*) FROM cards WHERE order_id = o.id AND shipped_at IS NOT NULL) as shipped_cards,
        (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM order_items WHERE order_id = o.id AND price_status = 'PENDING') as has_pending_prices,
        (SELECT item_name FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_name,
        (SELECT width FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_width,
        (SELECT height FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_height,
        (SELECT content FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0) ORDER BY id LIMIT 1) as main_item_content,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND (parent_item_id IS NULL OR parent_item_id = 0)) as item_count,
        COALESCE(e.short_name, e.name) as entity_name
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN employees sr ON sr.id = o.sales_rep_id
      LEFT JOIN entities e ON e.id = o.entity_id
    `
    // 조회조건 = listFilter.ts SSOT (목록·카운트·통계·CSV 공유). 여기에 조건을 직접 붙이지 말 것.
    const listFilter = buildOrderListFilter(c)
    const params: any[] = [...listFilter.params]
    query += listFilter.where

    // 정렬 = listFilter.ts SSOT (목록·CSV 공유)
    const orderBy = resolveOrderSort(sort)

    query += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // 합배송 묶음 배지 파생 (배송 UX P1): 페이지 행 한정 배치 후속조회 (행별 상관 서브쿼리 N+1 회피).
    // 정본 포인터 = orders.consolidate_with_order_id (접수 예약 0438 + 출고 merge/unmerge 동기 — root=NULL·자식=root).
    // IN(...)은 D1 바인드 한도(~100) 대응 80개 청크. 실패해도 목록 응답은 정상 (배지만 생략).
    try {
      const listRows = results as any[]
      const rootIds = [...new Set(listRows.map(r => Number(r.consolidate_with_order_id)).filter(v => v > 0))]
      const rootNumMap = new Map<number, string>()
      for (let i = 0; i < rootIds.length; i += 80) {
        const chunk = rootIds.slice(i, i + 80)
        const { results: rn } = await c.env.DB.prepare(
          `SELECT id, order_number FROM orders WHERE id IN (${chunk.map(() => '?').join(',')})`
        ).bind(...chunk).all<{ id: number; order_number: string }>()
        for (const r of rn || []) rootNumMap.set(Number(r.id), r.order_number)
      }
      const pageIds = listRows.map(r => Number(r.id)).filter(v => v > 0)
      const childAgg = new Map<number, { cnt: number; nums: string }>()
      for (let i = 0; i < pageIds.length; i += 80) {
        const chunk = pageIds.slice(i, i + 80)
        const { results: ch } = await c.env.DB.prepare(
          `SELECT consolidate_with_order_id AS rid, COUNT(*) AS cnt, GROUP_CONCAT(order_number, ', ') AS nums
           FROM orders
           WHERE consolidate_with_order_id IN (${chunk.map(() => '?').join(',')})
             AND status NOT IN ('CANCELLED', 'DELETED')
           GROUP BY consolidate_with_order_id`
        ).bind(...chunk).all<{ rid: number; cnt: number; nums: string | null }>()
        for (const r of ch || []) childAgg.set(Number(r.rid), { cnt: Number(r.cnt) || 0, nums: r.nums || '' })
      }
      for (const r of listRows) {
        if (r.consolidate_with_order_id) {
          r.consolidate_root_number = rootNumMap.get(Number(r.consolidate_with_order_id)) || null
        }
        const agg = childAgg.get(Number(r.id))
        if (agg && agg.cnt > 0) {
          r.consolidation_child_count = agg.cnt
          r.consolidation_child_numbers = agg.nums
        }
      }
    } catch (_consErr) { /* 배지 파생 실패는 목록을 막지 않음 */ }

    // 총 건수 + 금액 합계 — 목록과 동일한 조회조건(listFilter SSOT)이라 화면의 "총 N건"과 통계 카드가 갈리지 않는다.
    // ⚠️ 합계는 '현재 페이지 50건'이 아니라 '조회조건 전체' 기준이다(이카운트 합계행과 같은 의미).
    const countQuery = `SELECT COUNT(*) as count,
        COALESCE(SUM(o.total_amount), 0) as sum_supply,
        COALESCE(SUM(o.vat_amount), 0) as sum_vat,
        COALESCE(SUM(o.final_amount), 0) as sum_final,
        SUM(CASE WHEN ${SHIP_DATE_ESTIMATED_SQL} THEN 1 ELSE 0 END) as ship_date_estimated
      FROM orders o LEFT JOIN clients c ON o.client_id = c.id${listFilter.where}`
    const countRow = await c.env.DB.prepare(countQuery).bind(...listFilter.params).first<{
      count: number; sum_supply: number; sum_vat: number; sum_final: number; ship_date_estimated: number
    }>()
    const count = countRow?.count || 0

    // 수량 합계 — 주문:품목이 1:N 이라 목록 쿼리에 JOIN 하면 주문 행이 불어나 금액이 중복 합산된다.
    // 그래서 별도 조회 + 최상위 라인만(자식 라인은 부모 수량에 이미 포함).
    let sumQty = 0
    try {
      const qtyRow = await c.env.DB.prepare(
        `SELECT COALESCE(SUM(oi.quantity), 0) as qty
         FROM order_items oi
         WHERE (oi.parent_item_id IS NULL OR oi.parent_item_id = 0)
           AND oi.order_id IN (SELECT o.id FROM orders o LEFT JOIN clients c ON o.client_id = c.id${listFilter.where})`
      ).bind(...listFilter.params).first<{ qty: number }>()
      sumQty = Number(qtyRow?.qty) || 0
    } catch (_qtyErr) { /* 수량 집계 실패는 목록을 막지 않음 (합계 바에서 '-' 표시) */ }

    // 제외된 회계 전표 건수 — 화면 칩에 "회계 전표 N건 제외"로 띄운다(조용히 빼면 총계 차이를 설명 못 한다).
    // exclude_vouchers=1 일 때만 조회 — 다른 페이지는 이 왕복을 내지 않는다.
    let voucherExcluded = 0
    if (c.req.query('exclude_vouchers') === '1') {
      try {
        const vf = buildOrderListFilter(c)   // 같은 조건(전표 제외 포함)
        // 제외 조건을 뒤집어 '제외된 것'만 센다
        const invertedWhere = vf.where.replace(`NOT ${VOUCHER_ORDER_SQL}`, VOUCHER_ORDER_SQL)
        const vRow = await c.env.DB.prepare(
          `SELECT COUNT(*) as n FROM orders o LEFT JOIN clients c ON o.client_id = c.id${invertedWhere}`
        ).bind(...vf.params).first<{ n: number }>()
        voucherExcluded = Number(vRow?.n) || 0
      } catch (_vErr) { /* 제외 건수 집계 실패는 목록을 막지 않음 */ }
    }

    // summary = 조회조건 전체의 합계 바 (건수·수량·공급가·부가세·합계)
    const response: PaginatedResponse<Order> & { summary: Record<string, number> } = {
      success: true,
      data: results as unknown as Order[],
      pagination: {
        page: parseInt(page),
        limit: safeLimit,
        total: count,
        total_pages: Math.ceil(count / safeLimit)
      },
      summary: {
        count,
        quantity: sumQty,
        supply_amount: Number(countRow?.sum_supply) || 0,
        vat_amount: Number(countRow?.sum_vat) || 0,
        final_amount: Number(countRow?.sum_final) || 0,
        // 출고일이 추정치(거래일)인 건수 — 화면에서 「추정」 배지·칩으로 드러낸다.
        // 실제 출고시각이 기록되기 시작하면 자동으로 0 이 된다.
        ship_date_estimated: Number(countRow?.ship_date_estimated) || 0,
        voucher_excluded: voucherExcluded,
      }
    }

    return c.json(response)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Get order timeline (status history)
ordersCoreRouter.get('/:id/timeline', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT osh.*, u.name as changed_by_name
      FROM order_status_history osh
      LEFT JOIN users u ON osh.changed_by = u.id
      WHERE osh.order_id = ?
      ORDER BY osh.created_at ASC, osh.id ASC
    `).bind(id).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get invoice data for an order (must be before /:id to avoid route conflict)
ordersCoreRouter.get('/:id/invoice', async (c) => {
  try {
    const id = c.req.param('id')

    // Get order with client_name
    const order = await c.env.DB.prepare(`
      SELECT
        o.*,
        c.client_name,
        u.name as created_by_name,
        sr.name as sales_rep_name,
        sr.department as sales_rep_dept
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN employees sr ON sr.id = o.sales_rep_id
      WHERE o.id = ?
    `).bind(id).first()

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // Cast order to a typed shape for property access
    const o = order as Record<string, unknown>

    // Get full client info
    const client = o.client_id
      ? await c.env.DB.prepare(
          `SELECT id, client_code, client_name, representative, business_registration_number,
                  business_type, business_item, phone, mobile, fax, email, address, postal_code,
                  transfer_info, is_active, balance, client_type, delivery_method, auto_billing,
                  price_policy_id, notes, invoice_method, created_at, updated_at
           FROM clients WHERE id = ?`
        ).bind(o.client_id as number).first() as Record<string, unknown> | null
      : null

    // Get order items (부모행/단독행만 반환 - 자식행 제외)
    // line_files = 라인에 붙은 부가 파일(0516). 재단 완성 시트의 칼선 DXF 가 여기로 온다 —
    //   ai_file_id 는 1:1 이라 EPS 말고 두 번째 파일을 실을 곳이 없었다.
    const { results: items } = await c.env.DB.prepare(`
      SELECT oi.*, ar.file_path AS ai_file_path,
             (SELECT GROUP_CONCAT(f.kind || '|' || COALESCE(f.file_name, '') || '|' || f.file_path, CHAR(10))
                FROM order_ai_files f
               WHERE f.order_item_id = oi.id) AS line_files,
             -- 주문서 직접 첨부 칼선(analysis_id 有) 최신 1건 — 에이전트가 baseName.dxf 복사, 수정화면이 칩 복원.
             --   재단 패널이 등록한 Z: 사본 행은 analysis_id NULL 이라 자연 제외.
             (SELECT f.analysis_id FROM order_ai_files f
               WHERE f.order_item_id = oi.id AND f.kind = 'dxf' AND f.analysis_id IS NOT NULL
               ORDER BY f.id DESC LIMIT 1) AS dxf_analysis_id,
             (SELECT COALESCE(f.file_name, f.file_path) FROM order_ai_files f
               WHERE f.order_item_id = oi.id AND f.kind = 'dxf' AND f.analysis_id IS NOT NULL
               ORDER BY f.id DESC LIMIT 1) AS dxf_file_name,
             (SELECT f.file_path FROM order_ai_files f
               WHERE f.order_item_id = oi.id AND f.kind = 'dxf' AND f.analysis_id IS NOT NULL
               ORDER BY f.id DESC LIMIT 1) AS dxf_file_path
      FROM order_items oi
      LEFT JOIN ai_analysis_requests ar ON ar.id = oi.ai_analysis_id
      WHERE oi.order_id = ? AND oi.parent_item_id IS NULL
      ORDER BY oi.sort_order ASC, oi.id ASC
    `).bind(id).all()

    // Get company settings (entity 우선, 폴백 settings)
    const entityId = (o.entity_id as number) || getEntityId(c)
    const company = await getEntityCompanyInfo(c.env.DB, entityId)

    // X5: 폐기 clients.balance 캐시(prod 전체 0) 대신 파생 미수금 — 세금계산서/주문서 전미수·현미수 표시 정합
    const derivedBalance = o.client_id ? await deriveClientBalance(c, o.client_id as number) : 0
    if (client) (client as Record<string, unknown>).balance = derivedBalance

    return c.json({
      success: true,
      data: {
        order, client, items, company,
        // 전미수금/현미수금: BILLED면 balance에 이미 포함, 아니면 미포함
        previous_balance: o.billing_status === 'BILLED'
          ? derivedBalance - ((o.billed_amount as number) || (o.final_amount as number) || 0)
          : derivedBalance,
        current_balance: o.billing_status === 'BILLED'
          ? derivedBalance
          : derivedBalance + ((o.final_amount as number) || 0)
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /in-transit - 배송 중 주문 목록 (출고 처리됨, 아직 SHIPPED 아님)
// ※ /:id 보다 먼저 등록해야 "in-transit"가 :id로 매칭되지 않음
ordersCoreRouter.get('/in-transit', requireAccessOrRole('/orders', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'o')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.delivery_method, o.delivery_date,
             o.auto_complete_date, o.updated_at,
             c.client_name
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.auto_complete_date IS NOT NULL
        AND o.status NOT IN ('SHIPPED', 'COMPLETED', 'CANCELLED')
        ${ef.clause}
      ORDER BY o.auto_complete_date ASC, o.id ASC
    `).bind(...ef.params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: '조회 실패' }, 500)
  }
})

// Get order by ID
ordersCoreRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    // Get order (Phase 3.2: quotation_number도 함께 — 견적서 연결 표시용)
    const order = await c.env.DB.prepare(`
      SELECT
        o.*,
        c.client_name,
        u.name as created_by_name,
        sr.name as sales_rep_name,
        sr.department as sales_rep_dept,
        q.quotation_number as quotation_number
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN users u ON o.created_by = u.id
      LEFT JOIN employees sr ON sr.id = o.sales_rep_id
      LEFT JOIN quotations q ON o.quotation_id = q.id
      WHERE o.id = ?
    `).bind(id).first()

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // Get order items (ai_analysis_id → file_path JOIN으로 품목별 소스 파일 경로 포함, pricing_method 포함)
    // card_items → cards JOIN으로 품목별 card_id, card_number 포함 (IA file-map 등록용)
    const { results: items } = await c.env.DB.prepare(`
      SELECT oi.*, ar.file_path AS ai_file_path,
             ar.groups_json AS ai_groups_json,
             i.pricing_method AS pricing_method,
             i.sub_category AS item_subcategory,
             ci.card_id AS card_id,
             ca.card_number AS card_number,
             -- 라인 부가 파일(0516) = "kind|이름|경로" 줄 단위. 화면(orders.js)이 칩으로 그린다.
             --   ⚠️ 이 상세 라우트에는 이 칸이 **없었다** — 목록·청구 라우트에만 있어서, 붙여 놓은
             --      source(Z: 작업파일) 연결이 DB 에는 있는데 주문 상세에서 조용히 안 보였다.
             --   ⚠️ 이 쿼리는 백틱 템플릿 안이다. 주석에도 백틱을 쓰면 문자열이 그 자리에서 끊긴다.
             (SELECT GROUP_CONCAT(f.kind || '|' || COALESCE(f.file_name, '') || '|' || f.file_path, CHAR(10))
                FROM order_ai_files f WHERE f.order_item_id = oi.id) AS line_files,
             -- 주문서 직접 첨부 칼선(analysis_id 有) 최신 1건 — 에이전트가 출력 시 baseName.dxf 복사,
             --   수정화면이 칩 복원. 재단 패널이 등록한 Z: 사본 행은 analysis_id NULL 이라 자연 제외.
             (SELECT f.analysis_id FROM order_ai_files f
               WHERE f.order_item_id = oi.id AND f.kind = 'dxf' AND f.analysis_id IS NOT NULL
               ORDER BY f.id DESC LIMIT 1) AS dxf_analysis_id,
             (SELECT COALESCE(f.file_name, f.file_path) FROM order_ai_files f
               WHERE f.order_item_id = oi.id AND f.kind = 'dxf' AND f.analysis_id IS NOT NULL
               ORDER BY f.id DESC LIMIT 1) AS dxf_file_name,
             (SELECT f.file_path FROM order_ai_files f
               WHERE f.order_item_id = oi.id AND f.kind = 'dxf' AND f.analysis_id IS NOT NULL
               ORDER BY f.id DESC LIMIT 1) AS dxf_file_path
      FROM order_items oi
      LEFT JOIN ai_analysis_requests ar ON ar.id = oi.ai_analysis_id
      LEFT JOIN items i ON i.id = oi.item_id
      LEFT JOIN card_items ci ON ci.order_item_id = oi.id
      LEFT JOIN cards ca ON ca.id = ci.card_id
      WHERE oi.order_id = ?
      ORDER BY oi.sort_order ASC, oi.id ASC
    `).bind(id).all()

    // R2 이관: ai_groups_json 썸네일을 emit 직전 base64로 복원(주문접수/편집 화면 무수정). r2_key 없으면 no-op.
    for (const it of (items || []) as Array<{ ai_groups_json?: string | null }>) {
      it.ai_groups_json = (await hydrateGroupsJson(c.env, it.ai_groups_json)) ?? null
    }

    // 주문 가시성 (멀티법인 격리·IDOR 차단): 소유(청구) 법인 + 담당 품목 보유 법인만 열람.
    // ADMIN(entityId=0)/코디네이터는 전체. 권한 없으면 존재 비노출 위해 404.
    const viewerEntity = getEntityId(c)
    const viewerUser = c.get('user') as { is_coordinator?: number } | undefined
    if (viewerEntity !== 0 && !viewerUser?.is_coordinator) {
      const ownEntity = Number((order as any).entity_id)
      const hasAssigned = (items || []).some((it: any) => Number(it.assigned_entity_id) === viewerEntity)
      let allowed = ownEntity === viewerEntity || hasAssigned
      if (!allowed) {
        // 합배송 묶음 예외: 같은 묶음(대표+자식) 안에 내 법인 주문(소유 또는 담당 품목)이 있으면 열람 허용.
        // 하위 법인 /orders의 "합배송→대표" 배지·묶음 멤버 링크가 타법인 대표 주문을 여는 경로.
        const groupRoot = Number((order as any).consolidate_with_order_id) || Number(id)
        const memberHit = await c.env.DB.prepare(`
          SELECT 1 AS hit FROM orders m
          WHERE (m.id = ? OR m.consolidate_with_order_id = ?)
            AND m.status NOT IN ('CANCELLED', 'DELETED')
            AND (m.entity_id = ? OR EXISTS (
              SELECT 1 FROM order_items oi WHERE oi.order_id = m.id AND oi.assigned_entity_id = ?
            ))
          LIMIT 1
        `).bind(groupRoot, groupRoot, viewerEntity, viewerEntity).first()
        allowed = !!memberHit
      }
      if (!allowed) {
        return c.json({ success: false, error: 'Order not found' }, 404)
      }
    }

    // split billing P2: 청구그룹(법인별 청구 단위) — 상세 화면 요약 표시용
    const { results: billingGroups } = await c.env.DB.prepare(`
      SELECT g.id, g.entity_id, g.billing_status, g.supply_amount, g.tax_amount, g.billed_amount,
             g.billed_at, g.tax_invoice_id, e.name AS entity_name, e.short_name AS entity_short_name
      FROM order_billing_groups g
      LEFT JOIN entities e ON e.id = g.entity_id
      WHERE g.order_id = ?
      ORDER BY g.entity_id ASC
    `).bind(id).all()

    // 합배송 묶음 정보 (배송 UX P1): 자식이면 대표 주문번호, 그리고 같은 묶음의 다른 멤버(자신 제외).
    // root=consolidate_with_order_id(자식) 또는 자기 자신(대표 후보). 표시용 — 실패해도 상세는 정상.
    let consolidateRootNumber: string | null = null
    let consolidationMembers: Array<{ id: number; order_number: string }> = []
    try {
      const selfId = Number(id)
      const rootId = Number((order as any).consolidate_with_order_id) || 0
      if (rootId) {
        const rootRow = await c.env.DB.prepare(`SELECT order_number FROM orders WHERE id = ?`)
          .bind(rootId).first<{ order_number: string }>()
        consolidateRootNumber = rootRow?.order_number || null
      }
      const groupRoot = rootId || selfId
      const { results: members } = await c.env.DB.prepare(`
        SELECT id, order_number FROM orders
        WHERE (id = ? OR consolidate_with_order_id = ?) AND id != ? AND status NOT IN ('CANCELLED', 'DELETED')
        ORDER BY id ASC
      `).bind(groupRoot, groupRoot, selfId).all<{ id: number; order_number: string }>()
      consolidationMembers = (members || []).map(m => ({ id: Number(m.id), order_number: m.order_number }))
    } catch (_consErr) { /* 표시용 파생 실패는 무시 */ }

    const response: ApiResponse<any> = {
      success: true,
      data: {
        ...order,
        items,
        billing_groups: billingGroups || [],
        consolidate_root_number: consolidateRootNumber,
        consolidation_members: consolidationMembers
      }
    }

    return c.json(response)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// Delete order (ADMIN 하드 삭제 / MANAGER 소프트 삭제 가능)
ordersCoreRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const efOrd = entityFilter(c) // 타 법인 주문 삭제 IDOR 방지 — #333

    // Check if order exists (status, client_id, final_amount 포함)
    const order = await c.env.DB.prepare(`
      SELECT id, order_number, status, client_id, final_amount, billing_status, billed_amount FROM orders WHERE id = ?${efOrd.clause}
    `).bind(id, ...efOrd.params).first<{ id: number; order_number: string; status: string; client_id: number; final_amount: number; billing_status: string | null; billed_amount: number | null }>()

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    // 2단계 삭제(2026-07-31): 취소(CANCELLED)된 주문은 ADMIN 하드 삭제 경로로 통과한다.
    //   구 가드("이미 취소된 주문입니다" 무조건 400)는 clients.balance 캐시 시절 이중 차감 방지의
    //   화석 — 미수금이 파생 계산(취소 주문 자동 제외)으로 바뀌며 근거가 사라졌는데 가드만 남아,
    //   아래에 문서·구현된 "CANCELLED = ADMIN 하드 삭제"가 도달 불가였고 상세 모달의 삭제 버튼
    //   (QUOTATION·CANCELLED 노출)과도 어긋났다. 발행분 차단은 아래 세금계산서·현금영수증 가드 유지.
    if (order.status === 'CANCELLED' && user.role !== 'ADMIN') {
      return c.json({ success: false, error: '취소된 주문입니다. 완전 삭제(복구 불가)는 관리자(ADMIN)만 가능합니다.' }, 403)
    }

    // 세금계산서 발행 여부 확인
    const taxInvoiceCheck = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM tax_invoices WHERE order_id = ? AND status != 'CANCELLED'
    `).bind(id).first<{ cnt: number }>()
    if (taxInvoiceCheck && taxInvoiceCheck.cnt > 0) {
      return c.json({
        success: false,
        error: '세금계산서가 발행된 주문은 삭제할 수 없습니다. 먼저 세금계산서를 취소해주세요.'
      }, 400)
    }

    // tax_invoice_orders 다대다 관계도 확인
    const taxInvoiceOrderCheck = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM tax_invoice_orders tio
      JOIN tax_invoices ti ON tio.tax_invoice_id = ti.id
      WHERE tio.order_id = ? AND ti.status != 'CANCELLED'
    `).bind(id).first<{ cnt: number }>()
    if (taxInvoiceOrderCheck && taxInvoiceOrderCheck.cnt > 0) {
      return c.json({
        success: false,
        error: '세금계산서에 포함된 주문은 삭제할 수 없습니다. 먼저 세금계산서를 수정해주세요.'
      }, 400)
    }

    // #464: 현금영수증(재무문서) 발행분 차단 — tax_invoices 가드 동형(RESTRICT FK 500 사전차단+발행 보호).
    //   live(ISSUED/NTS_SUCCESS)만 차단, 잔여(DRAFT/취소/실패)는 하드삭제 batch에서 SET NULL.
    const cashReceiptCheck = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM cash_receipts WHERE order_id = ? AND status IN ('ISSUED', 'NTS_SUCCESS')
    `).bind(id).first<{ cnt: number }>()
    if (cashReceiptCheck && cashReceiptCheck.cnt > 0) {
      return c.json({
        success: false,
        error: '현금영수증이 발행된 주문은 삭제할 수 없습니다. 먼저 현금영수증을 취소해주세요.'
      }, 400)
    }

    const CONFIRMED_AND_AFTER = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'SHIPPED']

    // CONFIRMED 이후 상태 → 소프트 삭제(CANCELLED)
    const needsSoftDelete = CONFIRMED_AND_AFTER.includes(order.status)

    if (needsSoftDelete) {
      // #219: 소프트 삭제 — 원자적 batch 처리
      const softDeleteStmts = [
        c.env.DB.prepare(`
          UPDATE orders
          SET status = 'CANCELLED',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(id),
        c.env.DB.prepare(`
          INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
          VALUES (?, ?, 'CANCELLED', ?, ?)
        `).bind(id, order.status, user.id, '주문 삭제 요청으로 인한 취소'),
        c.env.DB.prepare(`
          UPDATE cards
          SET status = 'HOLD',
              hold_reason = '주문 삭제/취소',
              hold_at = CURRENT_TIMESTAMP,
              hold_by = ?
          WHERE order_id = ? AND status != 'HOLD'
            AND shipped_at IS NULL
        `).bind(user.id, id),
      ]

      // split billing P3: balance 캐시 미사용. 미수금은 order_billing_groups[BILLED] 파생이며
      // status != 'CANCELLED' 필터로 취소 주문은 자동 제외 → 별도 차감 불필요.

      await c.env.DB.batch(softDeleteStmts)

      return c.json({
        success: true,
        message: '주문이 취소되었습니다',
        soft_delete: true
      })
    }

    // 하드 삭제 (CANCELLED 상태) — ADMIN만 허용
    if (user.role !== 'ADMIN') {
      return c.json({
        success: false,
        error: '해당 상태의 주문을 삭제하려면 ADMIN 권한이 필요합니다'
      }, 403)
    }

    // split billing P3: balance 캐시 미사용 — 하드 삭제 시 order_billing_groups 도 함께 삭제(아래 batch).
    // 미수금은 파생이므로 별도 역산 불필요.

    // #87: 원자적 삭제 (db.batch — 전체 성공 또는 전체 롤백)
    await c.env.DB.batch([
      // #116: card_id 기반 정리 (cards 삭제 전에 먼저, #117 FK 미강제 대응)
      c.env.DB.prepare('DELETE FROM card_status_history WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM quality_issues WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM waste_records WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('UPDATE print_events SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM card_items WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      // #332: cards 참조 잔여 (cards 삭제 전) — tasks/print_file_map은 이력 보존(SET NULL), work_records는 card_id NOT NULL이라 DELETE
      c.env.DB.prepare('UPDATE tasks SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM work_records WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('UPDATE print_file_map SET card_id = NULL WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      // #454: cards 참조 비-FK 정리 (cards 삭제 전) — 자동 재고차감 이력
      c.env.DB.prepare('DELETE FROM inventory_auto_deductions WHERE card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      // #464: 타 주문 품질이슈의 재작업카드 링크(0222 재빌드로 FK 제거됨=비-FK orphan) 정리 — cards 삭제 전
      c.env.DB.prepare('UPDATE quality_issues SET rework_card_id = NULL WHERE rework_card_id IN (SELECT id FROM cards WHERE order_id = ?)').bind(id),
      // #567: 클레임/반품 자동조정(adjustments) 정리 — 소스(customer_claims/returns) 삭제 전. 팬텀 AR 감액 방지.
      c.env.DB.prepare("DELETE FROM adjustments WHERE source_type='CLAIM' AND source_id IN (SELECT id FROM customer_claims WHERE order_id = ?)").bind(id),
      c.env.DB.prepare("DELETE FROM adjustments WHERE source_type='RETURN' AND source_id IN (SELECT id FROM returns WHERE order_id = ?)").bind(id),
      // #116: order_id 기반 정리
      c.env.DB.prepare('DELETE FROM customer_claims WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM returns WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM credit_overrides WHERE order_id = ?').bind(id),
      c.env.DB.prepare(`DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE order_id = ?)`).bind(id),
      // #477: 합포장 자식(타 주문)이 이 주문의 대표 shipment를 가리키면 삭제 전 detach (비-FK dangling 방지)
      c.env.DB.prepare('UPDATE shipments SET merged_into_id = NULL WHERE merged_into_id IN (SELECT id FROM shipments WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM shipments WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM cards WHERE order_id = ?').bind(id),
      // #454: order_id/order_item_id 기반 비-FK 정리 (order_items 삭제 전 order_item_id SET NULL)
      c.env.DB.prepare('UPDATE print_file_map SET order_item_id = NULL WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id),
      // #464: return_items.order_item_id RESTRICT — returns CASCADE로 통상 선삭제되나 교차주문 이상 대비 명시 정리 (order_items 삭제 전)
      c.env.DB.prepare('DELETE FROM return_items WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM pp_material_deductions WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM original_archives WHERE order_id = ?').bind(id),  // ⚠️ R2 객체(archive_url)는 별도 정리 필요
      // #570: designer_intakes.order_item_id RESTRICT(0463) — 흡수 이력 보존 위해 SET NULL(디자이너 작업 이력은 존치, status='absorbed' 유지). order_items 삭제 전 필수.
      c.env.DB.prepare('UPDATE designer_intakes SET order_item_id = NULL WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)').bind(id),
      c.env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM order_billing_groups WHERE order_id = ?').bind(id),  // split billing P3
      c.env.DB.prepare('DELETE FROM order_status_history WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM tax_invoice_orders WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM order_ai_files WHERE order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM auto_process_jobs WHERE order_id = ?').bind(id),
      // #332: tasks.order_id 이력 보존 (SET NULL)
      c.env.DB.prepare('UPDATE tasks SET order_id = NULL WHERE order_id = ?').bind(id),
      // #464: 미처리 RESTRICT FK 참조 정리 (orders 삭제 전 — prod FK 강제 시 opaque 500 차단). 운영링크는 보존(SET NULL).
      c.env.DB.prepare('UPDATE customer_claims SET rework_order_id = NULL WHERE rework_order_id = ?').bind(id),                  // 타주문 클레임의 재작업주문 링크(클레임 기록 보존)
      c.env.DB.prepare('UPDATE portal_reorder_requests SET reference_order_id = NULL WHERE reference_order_id = ?').bind(id),     // 포털 재주문 원주문 참조
      c.env.DB.prepare('UPDATE cash_receipts SET order_id = NULL WHERE order_id = ?').bind(id),                                  // 발행분은 pre-guard 차단, 잔여(DRAFT/취소/실패) unlink
      c.env.DB.prepare("UPDATE tax_invoices SET order_id = NULL WHERE order_id = ? AND status = 'CANCELLED'").bind(id),          // pre-guard는 비취소만 차단 → 취소분 잔여 unlink
      // #589: 합배송 예약 포인터(0438, 비-FK) — 대표 주문 삭제 시 자식의 죽은 링크 정리(#477 merged_into_id와 동형).
      //   자식은 단독 배송으로 복귀. 새 대표 자동 승격은 하지 않는다(그룹 재구성은 운영자가 화면에서).
      c.env.DB.prepare('UPDATE orders SET consolidate_with_order_id = NULL WHERE consolidate_with_order_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id),
    ])

    return c.json({
      success: true,
      message: `주문 ${order.order_number}이(가) 완전 삭제되었습니다.`
    })
  } catch (error) {
    console.error('Order deletion error:', error)
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

export default ordersCoreRouter
