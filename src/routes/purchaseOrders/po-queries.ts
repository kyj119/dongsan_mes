/**
 * purchaseOrders/po-queries.ts — 발주 통계/조회 라우트 (core.ts에서 분리, 2026-06-12 대형파일 분할 1/4)
 *
 * 상태별 통계(stats) · CSV export · 발주서 인쇄데이터(/:id/invoice) · 담당 입고대기 라인(my-lines·my-lines-count).
 * 배럴(purchaseOrders.ts)에서 core 앞에 마운트(/:id 섀도잉 방지). ⚠️ 이동만, 로직 수정 0.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware } from '../../middleware/auth'
import { requireAnyPagePermission } from '../../middleware/permissions'
import { getEntityId, entityFilter } from '../../utils/entityFilter'
import { excludePurchaseNonCounterpartiesSql } from '../../constants/intercompany'
import { getEntityCompanyInfo } from '../../utils/entitySettings'
import { kstYmd } from '../../utils/kstDate'
import { buildPoListFilter, resolvePoSort, PO_SORT_DEFAULT } from './listFilter'

const poQueriesRouter = new Hono<HonoEnv>()
poQueriesRouter.use('/*', authMiddleware, requireAnyPagePermission('/purchase-orders', '/receiving'))

// ============================================================================
// GET /stats - 상태별 통계 (/:id 보다 먼저 등록)
// ============================================================================
poQueriesRouter.get('/stats', async (c) => {
  try {
    const ef = entityFilter(c)
    const efAnd = ef.params.length > 0 ? ' AND entity_id = ?' : ''
    const icAnd = c.req.query('include_intercompany') === '1' ? '' : excludePurchaseNonCounterpartiesSql('supplier_id')

    // 상태 분포 = 목록과 동일한 조회조건(listFilter SSOT), 단 status 만 제외.
    // 카드가 곧 상태 선택 수단(드릴다운)이라 자기 자신으로 걸러지면 나머지가 전부 0이 된다.
    const f = buildPoListFilter(c, { skipStatus: true })
    const { results } = await c.env.DB.prepare(
      `SELECT po.status AS status, COUNT(*) as count
       FROM purchase_orders po LEFT JOIN clients c ON po.supplier_id = c.id${f.where}
       GROUP BY po.status`
    ).bind(...f.params).all()

    const stats: Record<string, number> = { total: 0 }
    for (const row of results as Record<string, unknown>[]) {
      stats[row.status as string] = row.count as number
      stats.total += row.count as number
    }

    // 납기 지연 — 상태 분포와 같은 스코프. 지연은 상태가 아니라 파생 조건이라 별도로 센다.
    const today = kstYmd()
    const overdue = await c.env.DB.prepare(
      `SELECT COUNT(*) as count
       FROM purchase_orders po LEFT JOIN clients c ON po.supplier_id = c.id${f.where}
         ${f.where ? 'AND' : 'WHERE'} po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
         AND po.expected_date IS NOT NULL AND po.expected_date < ?`
    ).bind(...f.params, today).first<{ count: number }>()
    stats.overdue = overdue?.count || 0

    // 납기 임박 (D-3 이내) — 같은 스코프
    const upcoming = await c.env.DB.prepare(
      `SELECT COUNT(*) as count
       FROM purchase_orders po LEFT JOIN clients c ON po.supplier_id = c.id${f.where}
         ${f.where ? 'AND' : 'WHERE'} po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED')
         AND po.expected_date IS NOT NULL AND po.expected_date >= ? AND po.expected_date <= date(?, '+3 days')`
    ).bind(...f.params, today, today).first<{ count: number }>()
    stats.upcoming = upcoming?.count || 0

    // 이번 달 발주 금액 합계
    const monthlyAmount = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(final_amount), 0) as total
      FROM purchase_orders
      WHERE status NOT IN ('CANCELLED', 'DRAFT')
        AND order_date >= date('now', 'start of month')${efAnd}${icAnd}
    `).bind(...ef.params).first<{ total: number }>()
    stats.monthly_amount = monthlyAmount?.total || 0

    // 공급업체별 미지급 현황 TOP 5 — purchase_balance 캐시 폐기 → 법인별 파생(POs − payments − adjustments, entity 필터)
    const { results: supplierBalances } = await c.env.DB.prepare(`
      SELECT c.id, c.client_name,
        (COALESCE(bpo.v, 0) - COALESCE(bpp.v, 0) - COALESCE(bpa.v, 0)) as balance,
        COALESCE(ac.cnt, 0) as active_po_count
      FROM clients c
      LEFT JOIN (
        SELECT supplier_id, SUM(final_amount) AS v FROM purchase_orders
        WHERE status NOT IN ('DRAFT', 'CANCELLED')${ef.clause} GROUP BY supplier_id
      ) bpo ON bpo.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS v FROM purchase_payments WHERE 1=1${ef.clause} GROUP BY supplier_id
      ) bpp ON bpp.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS v FROM purchase_adjustments WHERE 1=1${ef.clause} GROUP BY supplier_id
      ) bpa ON bpa.supplier_id = c.id
      LEFT JOIN (
        SELECT supplier_id, COUNT(*) AS cnt FROM purchase_orders
        WHERE status IN ('CONFIRMED', 'PARTIAL_RECEIVED')${ef.clause} GROUP BY supplier_id
      ) ac ON ac.supplier_id = c.id
      -- ⚠️ client_type 필터 금지: prod 매입처는 대부분 'SALES'로 등록돼 있어(PURCHASE/BOTH 4곳뿐)
      --    타입 필터를 걸면 실질 매입처가 전멸함. 잔액>0 실질기준만 사용 (2026-07-16 client_type 수정 전례).
      -- 내부법인(그룹 3사) + 관계 사업자만 c.id NOT IN 제외 — 법인간거래는 회계허브 탭으로 이관,
      --   관계 사업자는 자금이동이라 매입이 아니다 (client_type 필터 아님) (2026-08-07)
      WHERE (COALESCE(bpo.v, 0) - COALESCE(bpp.v, 0) - COALESCE(bpa.v, 0)) > 0${excludePurchaseNonCounterpartiesSql('c.id')}
      GROUP BY c.id
      ORDER BY balance DESC, c.id ASC
      LIMIT 5
    `).bind(...ef.params, ...ef.params, ...ef.params, ...ef.params).all()
    ;(stats as Record<string, unknown>).supplier_balances = supplierBalances

    // 재고 부족 알림 수
    try {
      const alertCount = await c.env.DB.prepare(
        `SELECT COUNT(*) as count FROM stock_alerts WHERE status = 'ACTIVE'`
      ).first<{ count: number }>()
      stats.active_alerts = alertCount?.count || 0
    } catch { stats.active_alerts = 0 }

    return c.json({ success: true, data: stats })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /export/csv - 발주 목록 CSV 내보내기 (/:id 보다 먼저 등록)
// ============================================================================
poQueriesRouter.get('/export/csv', async (c) => {
  try {
    let query = `
      SELECT po.*, c.client_name as supplier_name, u.name as created_by_name
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      LEFT JOIN users u ON po.created_by = u.id
    `
    // 조회조건·정렬 = listFilter.ts SSOT (목록과 동일). 사본을 두면 화면과 CSV 가 갈린다.
    const f = buildPoListFilter(c)
    const params: any[] = [...f.params]
    query += f.where
    query += ` ORDER BY ${resolvePoSort(c.req.query('sort'))} LIMIT 5001`  // #372: 캡+1 조회로 잘림 감지

    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    const truncated = (results || []).length > 5000
    const exportRows = truncated ? (results || []).slice(0, 5000) : (results || [])

    const statusLabels: Record<string, string> = {
      DRAFT: '임시저장', CONFIRMED: '발주확정', PARTIAL_RECEIVED: '부분입고',
      RECEIVED: '입고완료', CANCELLED: '취소'
    }

    const headers = ['발주번호', '공급업체', '발주일', '납기일', '금액', '상태', '비고', '작성자', '등록일']
    const rows = exportRows.map((po: Record<string, unknown>) => [
      po.po_number as string, po.supplier_name as string, po.order_date as string, po.expected_date as string | null,
      po.final_amount as number, statusLabels[po.status as string] || (po.status as string),
      po.notes as string | null, po.created_by_name as string | null,
      po.created_at ? new Date(po.created_at as string).toLocaleDateString('ko-KR') : ''
    ])

    const { generateCsv, csvResponse, CSV_TRUNCATION_NOTE } = await import('../../utils/csv')
    const today = kstYmd()
    return csvResponse(c, `발주목록_${today}.csv`, generateCsv(headers, rows, { footerNote: truncated ? CSV_TRUNCATION_NOTE : undefined }))
  } catch (error) {
    console.error('src/routes/purchaseOrders.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /:id/invoice - 발주서 인쇄 데이터 (/:id 보다 먼저 등록)
// ============================================================================
poQueriesRouter.get('/:id/invoice', async (c) => {
  try {
    const id = c.req.param('id')

    const ef = entityFilter(c, 'po')  // #358계열: 발주 인보이스 조회 법인 격리
    const po = await c.env.DB.prepare(`
      SELECT
        po.*,
        c.client_name as supplier_name,
        u.name as created_by_name,
        u.phone as created_by_phone,
        u.email as created_by_email
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.id = ?${ef.clause}
    `).bind(id, ...ef.params).first()

    if (!po) {
      return c.json({ success: false, error: 'Purchase order not found' }, 404)
    }

    const poRec = po as Record<string, unknown>
    const supplier = poRec.supplier_id
      ? await c.env.DB.prepare(
          `SELECT id, client_code, client_name, representative, business_registration_number,
                  business_type, business_item, phone, mobile, fax, email, address, postal_code,
                  transfer_info, is_active, balance, client_type, delivery_method, auto_billing,
                  price_policy_id, notes, invoice_method, created_at, updated_at
           FROM clients WHERE id = ?`
        ).bind(poRec.supplier_id).first()
      : null

    const { results: items } = await c.env.DB.prepare(`
      SELECT poi.id, poi.po_id, poi.item_id, poi.item_name, poi.category_name, poi.quantity, poi.received_quantity,
             poi.unit, poi.unit_price, poi.price_status, poi.amount, poi.vat_included, poi.sort_order, poi.notes,
             poi.accepted_quantity, poi.rejected_quantity, poi.storage_zone_id, poi.line_status,
             poi.received_by, poi.received_at, poi.created_at, poi.updated_at,
             i.width_mm AS item_width_mm, i.specification AS item_specification
      FROM purchase_order_items poi
      LEFT JOIN items i ON i.id = poi.item_id
      WHERE poi.po_id = ? ORDER BY poi.sort_order ASC, poi.id ASC
    `).bind(id).all()

    // Get company settings (entity 우선, 폴백 settings)
    const entityId = (poRec.entity_id as number) || getEntityId(c)
    const company = await getEntityCompanyInfo(c.env.DB, entityId)

    return c.json({
      success: true,
      data: { po, supplier, items, company }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// GET /my-lines - 로그인 유저의 담당 창고 입고 대기 라인 (⚠️ /:id 보다 먼저 등록)
// ============================================================================
poQueriesRouter.get('/my-lines', async (c) => {
  try {
    const user = c.get('user')
    if (!user?.id) return c.json({ success: false, error: '인증 필요' }, 401)
    const isSupervisor = user.role === 'ADMIN' || user.role === 'MANAGER'

    const sql = `
      SELECT
        poi.id as po_item_id,
        poi.po_id,
        poi.item_id,
        poi.item_name,
        poi.quantity as ordered_quantity,
        poi.received_quantity,
        poi.unit,
        poi.unit_price,
        poi.line_status,
        poi.received_at,
        po.po_number,
        po.order_date,
        po.expected_date,
        po.status as po_status,
        c.client_name as supplier_name,
        COALESCE(poi.storage_zone_id, i.storage_zone_id) as effective_zone_id,
        sz.zone_name,
        sz.manager_id as zone_manager_id,
        u.name as received_by_name
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      LEFT JOIN items i ON i.id = poi.item_id
      LEFT JOIN storage_zones sz ON sz.id = COALESCE(poi.storage_zone_id, i.storage_zone_id)
      LEFT JOIN clients c ON c.id = po.supplier_id
      LEFT JOIN users u ON u.id = poi.received_by
      WHERE poi.line_status IN ('PENDING','PARTIAL')
        AND po.status IN ('CONFIRMED','PARTIAL_RECEIVED')
        AND (
          sz.manager_id = ?
          ${isSupervisor ? "OR sz.manager_id IS NULL OR sz.id IS NULL" : ""}
        )
      ORDER BY po.order_date ASC, poi.id ASC
      LIMIT 200
    `
    const { results } = await c.env.DB.prepare(sql).bind(user.id).all()
    return c.json({ success: true, data: results || [] })
  } catch (err: any) {
    console.error('my-lines error:', err)
    return c.json({ success: false, error: '조회 실패' }, 500)
  }
})

// GET /my-lines-count - 사이드바 배지용 카운트 (⚠️ /:id 보다 먼저)
poQueriesRouter.get('/my-lines-count', async (c) => {
  try {
    const user = c.get('user')
    if (!user?.id) return c.json({ success: false, error: '인증 필요' }, 401)
    const isSupervisor = user.role === 'ADMIN' || user.role === 'MANAGER'

    const sql = `
      SELECT COUNT(*) as cnt
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      LEFT JOIN items i ON i.id = poi.item_id
      LEFT JOIN storage_zones sz ON sz.id = COALESCE(poi.storage_zone_id, i.storage_zone_id)
      WHERE poi.line_status IN ('PENDING','PARTIAL')
        AND po.status IN ('CONFIRMED','PARTIAL_RECEIVED')
        AND (
          sz.manager_id = ?
          ${isSupervisor ? "OR sz.manager_id IS NULL OR sz.id IS NULL" : ""}
        )
    `
    const row = await c.env.DB.prepare(sql).bind(user.id).first<{ cnt: number }>()
    return c.json({ success: true, data: { count: Number(row?.cnt || 0) } })
  } catch (err: any) {
    console.error('my-lines-count error:', err)
    return c.json({ success: false, error: '카운트 실패' }, 500)
  }
})


export default poQueriesRouter
