import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import type { Order, OrderItem, ApiResponse, PaginatedResponse } from '../../types/models'
import { authMiddleware, requireRole } from '../../middleware/auth'
import { requireAnyPagePermission, requireEditOrRole } from '../../middleware/permissions'
import { getNextSeqNumber, getNextEntitySeqNumber, withSeqRetry } from '../../utils/sequenceGenerator'
import { logActivity } from '../../utils/activityLog'
import { notifyRoles } from '../../utils/notify'
import { recalculateOrderCosts } from '../../utils/costCalculator'
import { sendEmail } from '../../services/emailProvider'
import { getEntityId, orderVisibilityFilter } from '../../utils/entityFilter'
import { kstYmdCompact, kstYmd } from '../../utils/kstDate'
import { checkMaterialCoverage, describeGap, type CoverageGap } from '../../utils/materialShortageCheck'
import { deriveClientBalance } from '../ledger/ar-helpers'
import { generateCardsForOrder } from './helpers'

// ---------- D1 row shapes ----------
interface OrderCopyRow {
  id: number; client_id: number; order_number: string; status: string
  order_year: number; order_month: number
  reception_location: string | null; delivery_info: string | null; delivery_date: string | null
  delivery_postal: string | null; delivery_detail: string | null
  total_amount: number; vat_amount: number; discount_amount: number; final_amount: number
  notes: string | null; internal_notes: string | null
  priority: string | null; delivery_method: string | null; delivery_time: string | null; delivery_slot: string | null
  contact_phone: string | null; contact_mobile: string | null; shipping_payment: string | null
}
interface OrderItemCopyRow {
  id: number; order_id: number; item_id: number | null
  item_name: string; category_name: string | null
  width: number | null; height: number | null; quantity: number; unit: string
  unit_price: number; amount: number; vat_included: number
  post_processing: string | null; content: string | null; specification: string | null; sort_order: number
  scale_factor: number; ai_group_index: number | null; parent_item_id: number | null
  assigned_entity_id: number | null; assignment_status: string | null
  // 라인 고유 속성(주문에 종속되지 않는 값) — 복사본에도 그대로 따라가야 한다
  finishing: string | null; price_status: string | null
  auto_amount: number | null; line_discount: number | null; discount_reason: string | null
  ai_analysis_id: number | null; shipment_ready: number | null
}
interface MaxSeqRow { max_seq: number }
interface QuotationRow {
  id: number; order_number: string; status: string
  valid_until: string | null; client_id: number; final_amount: number
  delivery_date: string | null; order_type: string | null
  priority: string | null; notes: string | null; entity_id: number | null
}
interface OrderEmailRow {
  id: number; order_number: string; order_date: string; delivery_date: string | null
  client_name: string; representative: string | null; client_email: string | null
  total_amount: number; vat_amount: number; discount_amount: number; final_amount: number
  notes: string | null; valid_until: string | null
  client_id: number; status: string
  billing_status: string | null; billed_amount: number | null
}
interface EmailItemRow {
  item_name: string; width: number | null; height: number | null; specification: string | null
  quantity: number; unit: string; unit_price: number; amount: number; vat_included: number
}
interface SettingRow { setting_key: string; setting_value: string | null }
interface SettingValueRow { setting_value: string | null }

const ordersOpsRouter = new Hono<HonoEnv>()
ordersOpsRouter.use('/*', authMiddleware, requireAnyPagePermission('/orders', '/cards'))

// POST /items/:itemId/files — 라인에 부가 파일을 붙인다(현재 소비자 = 에이전트가 복사한 재단 칼선 DXF).
//   여태 라인→파일은 order_items.ai_file_id 하나뿐이라 "EPS + DXF" 두 개를 못 실었다(0516).
//   ⚠️ 세그먼트 3개라 /:id/copy(2개)·GET /:id(1개)와 매칭 충돌 없음. ops 라우터가 core 보다 먼저 마운트된다.
ordersOpsRouter.post('/items/:itemId/files', requireEditOrRole('/orders', 'MANAGER', 'DESIGNER'), async (c) => {
  try {
    const itemId = parseInt(c.req.param('itemId'), 10)
    if (!itemId) return c.json({ success: false, error: '잘못된 라인 ID입니다.' }, 400)
    const body = await c.req.json<Record<string, unknown>>().catch(() => null)
    if (!body) return c.json({ success: false, error: 'JSON 본문이 필요합니다.' }, 400)

    const filePath = String(body.file_path || '').trim()
    if (!filePath) return c.json({ success: false, error: 'file_path 가 필요합니다.' }, 400)
    const kind = String(body.kind || 'dxf').trim().toLowerCase()
    if (!['dxf', 'source'].includes(kind)) {
      return c.json({ success: false, error: "kind 는 dxf|source 여야 합니다." }, 400)
    }

    // 라인 소유 법인 검증 — 없으면 타법인 주문 라인에 남의 파일을 물릴 수 있다(workbench absorb #582와 같은 IDOR).
    const ovf = orderVisibilityFilter(c, 'o')
    const line = await c.env.DB.prepare(
      `SELECT oi.id, oi.order_id, o.entity_id
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = ?${ovf.clause}`
    ).bind(itemId, ...ovf.params).first<{ id: number; order_id: number; entity_id: number | null }>()
    if (!line) return c.json({ success: false, error: '주문 라인을 찾을 수 없습니다.' }, 404)

    // 멱등 — 에이전트는 잡을 재시도할 수 있고, 같은 파일이 라인에 여러 번 붙으면 화면에 중복으로 뜬다.
    const dup = await c.env.DB.prepare(
      `SELECT id FROM order_ai_files WHERE order_item_id = ? AND kind = ? AND file_path = ? LIMIT 1`
    ).bind(itemId, kind, filePath).first<{ id: number }>()
    if (dup) return c.json({ success: true, data: { id: dup.id, duplicated: true } })

    const fileName = body.file_name != null && String(body.file_name).trim() !== ''
      ? String(body.file_name).trim()
      : (filePath.split(/[/\\]/).pop() || null)
    const maxSort = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM order_ai_files WHERE order_id = ?`
    ).bind(line.order_id).first<{ m: number }>()

    const created = await c.env.DB.prepare(
      `INSERT INTO order_ai_files (order_id, order_item_id, kind, file_path, file_name, sort_order, entity_id)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(
      line.order_id, itemId, kind, filePath, fileName,
      (maxSort?.m ?? -1) + 1,
      line.entity_id ?? getEntityId(c)   // 라인이 속한 주문의 법인 상속(세션≠청구 법인 대비)
    ).first<{ id: number }>()

    return c.json({ success: true, data: { id: created?.id ?? null, order_item_id: itemId, kind } })
  } catch (error) {
    console.error('order item file register error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

ordersOpsRouter.post('/:id/copy', requireEditOrRole('/orders', 'MANAGER', 'DESIGNER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')

    // Get original order — #446: 소스 주문 cross-tenant read-exfil(타법인 단가/거래처) 차단. 가시성 모델 준수(코디네이터/담당 품목 포함).
    const ovf = orderVisibilityFilter(c, 'orders')
    const original = await c.env.DB.prepare(`
      SELECT id, client_id, order_number, status,
             order_year, order_month, reception_location, delivery_info, delivery_postal, delivery_detail, delivery_date,
             total_amount, vat_amount, discount_amount, final_amount,
             notes, internal_notes,
             priority, delivery_method, delivery_time, delivery_slot,
             contact_phone, contact_mobile, shipping_payment
      FROM orders WHERE id = ?${ovf.clause}
    `).bind(id, ...ovf.params).first<OrderCopyRow>()

    if (!original) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    // Get original order items
    const { results: originalItems } = await c.env.DB.prepare(`
      SELECT id, order_id, item_id, item_name, category_name,
             width, height, quantity, unit, unit_price, amount, vat_included,
             post_processing, content, specification, sort_order, parent_item_id,
             scale_factor, ai_group_index, assigned_entity_id, assignment_status,
             finishing, price_status, auto_amount, line_discount, discount_reason,
             ai_analysis_id, shipment_ready
      FROM order_items WHERE order_id = ? ORDER BY sort_order ASC, id ASC
    `).bind(id).all<OrderItemCopyRow>()

    // Generate new order number
    const today = new Date()
    const dateStr = kstYmdCompact()

    const newOrderNumber = await getNextEntitySeqNumber(c.env.DB, 'orders', 'order_number', getEntityId(c) || 1, dateStr)

    // Insert new order
    const orderResult = await c.env.DB.prepare(`
      INSERT INTO orders (
        order_number, client_id, status,
        order_year, order_month, reception_location, delivery_info, delivery_postal, delivery_detail,
        delivery_date, order_date,
        total_amount, vat_amount, discount_amount, final_amount,
        notes, internal_notes, created_by,
        priority, delivery_method, delivery_time, delivery_slot,
        contact_phone, contact_mobile, shipping_payment, entity_id
      ) VALUES (?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, date('now', '+9 hours'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      newOrderNumber,
      original.client_id,
      today.getFullYear(),
      today.getMonth() + 1,
      original.reception_location || null,
      original.delivery_info || null,
      original.delivery_postal || null,
      original.delivery_detail || null,
      original.delivery_date || null,
      original.total_amount || 0,
      original.vat_amount || 0,
      original.discount_amount || 0,
      original.final_amount || 0,
      (original.notes ? original.notes + ' (복사본)' : '복사본'),
      original.internal_notes || null,
      user.id,
      original.priority || 'NORMAL',
      original.delivery_method || null,
      original.delivery_time || null,
      original.delivery_slot || null,
      original.contact_phone || null,
      original.contact_mobile || null,
      original.shipping_payment || null,
      getEntityId(c) || 1
    ).run()

    const newOrderId = orderResult.meta.last_row_id

    // Copy order items — two-pass to preserve parent_item_id bundle structure
    // Pass 1: rows with no parent (parent or standalone) → collect old id → new id mapping
    const copyIdMap = new Map<number, number>() // oldId → newId

    for (const item of originalItems) {
      if (item.parent_item_id !== null && item.parent_item_id !== undefined) continue

      const insertResult = await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          scale_factor, ai_group_index, parent_item_id,
          assigned_entity_id, assignment_status,
          finishing, price_status, auto_amount, line_discount, discount_reason,
          ai_analysis_id, shipment_ready
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newOrderId,
        item.item_id || null,
        item.item_name,
        item.category_name || null,
        item.width || null,
        item.height || null,
        item.quantity,
        item.unit || 'EA',
        item.unit_price,
        item.amount,
        item.vat_included,
        item.post_processing || null,
        item.content || null,
        item.specification || null,
        item.sort_order,
        item.scale_factor || 1,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        item.assigned_entity_id || null,
        item.assignment_status || null,
        item.finishing || null,
        item.price_status || null,
        item.auto_amount ?? null,
        item.line_discount ?? null,
        item.discount_reason || null,
        item.ai_analysis_id ?? null,
        item.shipment_ready ?? 0
      ).run()

      copyIdMap.set(item.id as number, insertResult.meta.last_row_id as number)
    }

    // Pass 2: child rows → resolve parent_item_id via mapping
    for (const item of originalItems) {
      if (item.parent_item_id === null || item.parent_item_id === undefined) continue

      const newParentId = copyIdMap.get(item.parent_item_id as number) ?? null

      await c.env.DB.prepare(`
        INSERT INTO order_items (
          order_id, item_id, item_name, category_name,
          width, height, quantity, unit,
          unit_price, amount, vat_included,
          post_processing, content, specification, sort_order,
          scale_factor, ai_group_index, parent_item_id,
          assigned_entity_id, assignment_status,
          finishing, price_status, auto_amount, line_discount, discount_reason,
          ai_analysis_id, shipment_ready
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newOrderId,
        item.item_id || null,
        item.item_name,
        item.category_name || null,
        item.width || null,
        item.height || null,
        item.quantity,
        item.unit || 'EA',
        item.unit_price,
        item.amount,
        item.vat_included,
        item.post_processing || null,
        item.content || null,
        item.specification || null,
        item.sort_order,
        item.scale_factor || 1,
        item.ai_group_index !== undefined ? item.ai_group_index : null,
        newParentId,
        item.assigned_entity_id || null,
        item.assignment_status || null,
        item.finishing || null,
        item.price_status || null,
        item.auto_amount ?? null,
        item.line_discount ?? null,
        item.discount_reason || null,
        item.ai_analysis_id ?? null,
        item.shipment_ready ?? 0
      ).run()
    }

    // ★원가 스냅샷 — order_items 를 새로 만드는 **모든** 경로가 불러야 한다(2026-09-03 리뷰).
    //   여기가 빠져 있어 전환·복사로 생긴 주문은 수정·확정 전까지 total_cost 0 · 마진 100 퍼센트로 남았다.
    //   CLAUDE.md §누적 캐시 「수정·삭제 경로가 그걸 모르는 것 — 가장 자주 재발한 결함」과 같은 축이다.
    //   실패해도 주문 생성 자체는 막지 않는다(백필로 복구 가능).
    try { await recalculateOrderCosts(c.env.DB, newOrderId) } catch (e) { console.error('cost snapshot(order-copy) failed:', e) }

    return c.json({
      success: true,
      data: { id: newOrderId, order_number: newOrderNumber },
      message: `Order copied as ${newOrderNumber}`
    })
  } catch (error) {
    console.error('Order copy error:', error)
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /:id/convert-to-order - 견적서 → 주문 전환 (MANAGER+)
ordersOpsRouter.post('/:id/convert-to-order', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json().catch(() => ({})) as { force?: boolean }
    const force = body.force === true

    // 타법인 견적을 주문으로 전환할 수 없다 — 복사 경로(:120 #446)와 같은 가시성 모델.
    const cvOvf = orderVisibilityFilter(c, 'orders')
    const order = await c.env.DB.prepare(`
      SELECT id, order_number, status, valid_until, client_id, final_amount, delivery_date, order_type,
             priority, notes, entity_id
      FROM orders WHERE id = ?${cvOvf.clause}
    `).bind(id, ...cvOvf.params).first<QuotationRow>()

    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    if (order.status !== 'QUOTATION') {
      return c.json({
        success: false,
        error: `견적서 상태가 아닙니다. 현재 상태: ${order.status}`
      }, 400)
    }

    // 유효기한 만료 확인
    const today = kstYmd()
    const isExpired = order.valid_until && order.valid_until < today

    if (isExpired && !force) {
      return c.json({
        success: false,
        error: `견적 유효기한이 만료되었습니다 (${order.valid_until}). force=true 로 강제 전환하거나 유효기한을 연장하세요.`,
        data: { expired: true, valid_until: order.valid_until }
      }, 400)
    }

    // #134: 납품일 없는 견적은 주문 전환 불가
    if (!order.delivery_date) {
      return c.json({ success: false, error: '납품일을 먼저 입력해야 주문으로 전환할 수 있습니다.' }, 400)
    }

    // QUOTATION → CONFIRMED 전환
    await c.env.DB.prepare(`
      UPDATE orders SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(id).run()

    // balance는 경리 확인(BILLED) 시점에만 반영 — 견적서→주문 전환 시 미반영

    await c.env.DB.prepare(`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, 'QUOTATION', 'CONFIRMED', ?, ?)
    `).bind(id, user?.id || null, force && isExpired ? '만료 견적 강제 전환' : '견적서 → 주문 전환').run()

    // ★생산 카드 생성 — 생성 경로(create.ts:579)와 **같은 규칙**이어야 한다.
    //   여기가 빠지면 전환된 주문은 카드 0건 + 전 라인 shipment_ready=0 이라 작업지시가 안 나가고
    //   PATCH /shipments/:orderId/ship 이 「미완료 품목」으로 막힌다(지시 현황판 '누락' 큐에만 뜬다).
    //   법인 기준은 세션이 아니라 **주문 행**(update.ts·lifecycle.ts:1131 과 동일).
    const cvEntityId = order.entity_id ?? (getEntityId(c) || 1)
    let cardsGenerated = 0
    if (order.order_type === 'DISTRIBUTION') {
      // 유통 주문: 카드 미생성, 전 품목 즉시 출고 가능
      await c.env.DB.prepare(
        `UPDATE order_items SET shipment_ready = 1 WHERE order_id = ?`
      ).bind(id).run()
    } else {
      // 멱등: 이미 카드가 붙은 주문이면 재생성하지 않는다(중복 카드 방지)
      const existingCards = await c.env.DB.prepare(
        'SELECT COUNT(*) AS n FROM cards WHERE order_id = ?'
      ).bind(id).first<{ n: number }>()
      if (!existingCards || (existingCards.n || 0) === 0) {
        cardsGenerated = await generateCardsForOrder({
          db: c.env.DB,
          orderId: order.id,
          orderNumber: order.order_number,
          clientId: order.client_id,
          deliveryDate: order.delivery_date || null,
          priority: order.priority || 'NORMAL',
          notes: order.notes || null,
          entityId: cvEntityId
        })
      }
    }

    // Phase 5: 자재 부족 경고 (non-blocking)
    //   ⚠️ 부족 0건 ≠ 자재 이상 없음 — 판정 불가(gap)도 함께 올린다(생성·상태변경 경로와 동일 규칙).
    let materialWarnings: any[] = []
    let materialGap: CoverageGap | null = null
    let materialCheckFailed = false
    try {
      const cov = await checkMaterialCoverage(c.env.DB, order.id, cvEntityId)
      materialWarnings = cov.warnings
      materialGap = order.order_type === 'DISTRIBUTION' ? null : cov.gap
    } catch (mErr) {
      materialCheckFailed = true
      console.error('Material shortage check failed (non-blocking):', mErr)
    }

    return c.json({
      success: true,
      message: `견적서 ${order.order_number}이(가) 주문으로 전환되었습니다. ${cardsGenerated} card(s) generated.`,
      data: { id: order.id, order_number: order.order_number, status: 'CONFIRMED', cards_generated: cardsGenerated },
      ...(isExpired && { warning: `유효기한이 만료된 견적서입니다 (${order.valid_until}).` }),
      ...(materialWarnings.length > 0 && {
        material_warnings: materialWarnings,
        warning_message: `자재 부족 ${materialWarnings.length}건: ${materialWarnings.slice(0, 3).map((w: any) => w.material_name).join(', ')}${materialWarnings.length > 3 ? ' 외' : ''}`,
      }),
      ...(materialGap && { material_gap: materialGap, material_gap_message: describeGap(materialGap) }),
      ...(materialCheckFailed && { material_check_failed: true }),
    })
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /:id/send-email - 거래명세서 또는 견적서 이메일 발송 (MANAGER+)
ordersOpsRouter.post('/:id/send-email', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const { type, to_email } = await c.req.json() as { type: 'invoice' | 'quotation'; to_email: string }

    if (!type || !to_email) {
      return c.json({ success: false, error: 'type과 to_email은 필수입니다.' }, 400)
    }
    if (!['invoice', 'quotation'].includes(type)) {
      return c.json({ success: false, error: "type은 'invoice' 또는 'quotation'이어야 합니다." }, 400)
    }

    // 이메일 형식 기본 검증
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to_email)) {
      return c.json({ success: false, error: '올바른 이메일 주소를 입력하세요.' }, 400)
    }

    // 주문 + 거래처 정보 조회
    //   ★타법인 주문의 금액·거래처·미수금을 임의 주소로 내보낼 수 없다 — 복사·전환 경로와 같은 가시성 모델.
    const emOvf = orderVisibilityFilter(c, 'o')
    const order = await c.env.DB.prepare(`
      SELECT o.*, c.client_name, c.representative, c.email as client_email
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      WHERE o.id = ?${emOvf.clause}
    `).bind(id, ...emOvf.params).first<OrderEmailRow>()

    if (!order) {
      return c.json({ success: false, error: 'Order not found' }, 404)
    }

    // 주문 품목 조회 (부모/단독 행만)
    const { results: items } = await c.env.DB.prepare(`
      SELECT item_name, width, height, specification, quantity, unit, unit_price, amount, vat_included
      FROM order_items
      WHERE order_id = ? AND parent_item_id IS NULL
      ORDER BY sort_order ASC, id ASC
    `).bind(id).all<EmailItemRow>()

    // 회사 settings 조회
    const { results: settingsRows } = await c.env.DB.prepare(
      'SELECT setting_key, setting_value FROM settings'
    ).all<SettingRow>()
    const company: Record<string, string> = {}
    for (const row of settingsRows) {
      company[row.setting_key] = row.setting_value || ''
    }

    const companyName = company.company_name || '동산기획'
    const fromEmail = company.email_from_address || company.company_email
    const fromName = company.email_from_name || companyName

    // 거래처 미수금 (거래명세서용) — 파생값이 정본.
    //   ⚠️ `clients.balance` 를 쓰면 안 된다. 폐기 캐시라 prod 2,845곳 중 1곳만 non-zero 다
    //      → 메일에 「현재 미수금 0원 / 이전 미수금 −주문금액(음수)」이 찍혀 거래처로 나갔다.
    //   인쇄용 명세서(orders/core.ts 의 X5)와 **같은 산식**을 쓴다 — 갈리면 같은 문서의
    //   인쇄본과 메일본이 다른 금액을 말한다.
    const derivedBalance = order.client_id ? await deriveClientBalance(c, order.client_id) : 0
    const isBilled = order.billing_status === 'BILLED'
    // BILLED면 이 주문은 이미 파생 잔액에 포함 → 현재=파생, 이전=파생−이번청구
    // 미청구면 아직 미포함    → 이전=파생, 현재=파생+이번금액
    const currentBalance = isBilled
      ? derivedBalance
      : derivedBalance + (order.final_amount || 0)
    const previousBalance = isBilled
      ? derivedBalance - (order.billed_amount || order.final_amount || 0)
      : derivedBalance

    // 문서 유형별 제목 및 본문 구성
    const isQuotation = type === 'quotation'
    const docTitle = isQuotation ? '견적서' : '거래명세서'
    const subject = `[${companyName}] ${docTitle} - ${order.order_number} (${order.client_name})`

    // 금액 포맷 (한국식 콤마 구분)
    const formatAmount = (v: number) => Math.round(v).toLocaleString('ko-KR')

    // 품목 테이블 행 생성
    const itemRows = items.map((item) => {
      const sizeStr = item.specification
        ? item.specification
        : (item.width && item.height ? `${item.width}x${item.height}cm` : '')
      return `
        <tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.item_name}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${sizeStr}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${item.quantity}${item.unit}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${formatAmount(item.unit_price)}원</td>
          <td style="padding:6px 10px;border:1px solid #ddd;text-align:right;">${formatAmount(item.amount)}원</td>
        </tr>`
    }).join('')

    // 문서별 추가 정보 블록
    const extraInfoBlock = isQuotation
      ? `<p style="margin:4px 0;color:#e67e22;"><strong>견적 유효기한:</strong> ${order.valid_until || '미지정'}</p>`
      : `
        <p style="margin:4px 0;"><strong>이전 미수금:</strong> ${formatAmount(previousBalance)}원</p>
        <p style="margin:4px 0;"><strong>현재 미수금:</strong> ${formatAmount(currentBalance)}원</p>`

    const htmlBody = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:'Malgun Gothic',Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;padding:20px;">
  <div style="background:#1a56db;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:22px;">${companyName}</h1>
    <p style="color:#c7d9ff;margin:6px 0 0;font-size:14px;">${docTitle}</p>
  </div>
  <div style="background:#f8f9fa;padding:16px 24px;border:1px solid #e2e8f0;border-top:none;">
    <p style="margin:4px 0;"><strong>주문번호:</strong> ${order.order_number}</p>
    <p style="margin:4px 0;"><strong>거래처:</strong> ${order.client_name}</p>
    <p style="margin:4px 0;"><strong>주문일:</strong> ${order.order_date}</p>
    ${order.delivery_date ? `<p style="margin:4px 0;"><strong>납기일:</strong> ${order.delivery_date}</p>` : ''}
    ${extraInfoBlock}
  </div>
  <div style="padding:16px 24px;border:1px solid #e2e8f0;border-top:none;">
    <h3 style="margin:0 0 10px;font-size:15px;">품목 내역</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">품목명</th>
          <th style="padding:8px 10px;border:1px solid #ddd;">규격</th>
          <th style="padding:8px 10px;border:1px solid #ddd;">수량</th>
          <th style="padding:8px 10px;border:1px solid #ddd;">단가</th>
          <th style="padding:8px 10px;border:1px solid #ddd;">금액</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
  </div>
  <div style="background:#f8f9fa;padding:12px 24px;border:1px solid #e2e8f0;border-top:none;text-align:right;">
    <p style="margin:4px 0;font-size:14px;"><strong>공급가액:</strong> ${formatAmount(order.total_amount)}원</p>
    <p style="margin:4px 0;font-size:14px;"><strong>부가세:</strong> ${formatAmount(order.vat_amount)}원</p>
    ${order.discount_amount > 0 ? `<p style="margin:4px 0;font-size:14px;"><strong>할인:</strong> -${formatAmount(order.discount_amount)}원</p>` : ''}
    <p style="margin:8px 0 0;font-size:16px;color:#1a56db;"><strong>합계금액: ${formatAmount(order.final_amount)}원</strong></p>
  </div>
  <div style="padding:12px 24px;border:1px solid #e2e8f0;border-top:none;font-size:12px;color:#888;text-align:center;">
    본 메일은 ${companyName} ERP 시스템에서 자동 발송되었습니다.
  </div>
</body>
</html>`

    // 포털 안전 확인 링크 생성
    const user = c.get('user')
    let portalLink = ''
    try {
      const { generatePortalToken } = await import('../portal')
      const siteUrlSetting = await c.env.DB.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'site_base_url'`
      ).first<SettingValueRow>()
      const baseUrl = siteUrlSetting?.setting_value || new URL(c.req.url).origin
      const portalResult = await generatePortalToken(c.env.DB, order.client_id, user?.id || 0, baseUrl, 7,
        { type: 'invoice', order_id: Number(id) })
      portalLink = `${baseUrl}/portal/document?t=${portalResult.token}`
    } catch (_) { /* 포털 링크 생성 실패는 무시 */ }

    // 포털 링크가 있으면 이메일 본문에 안전 확인 버튼 추가
    const finalHtml = portalLink
      ? htmlBody.replace(
          '본 메일은 ' + companyName + ' ERP 시스템에서 자동 발송되었습니다.',
          `<a href="${portalLink}" style="display:inline-block;padding:12px 28px;background:#1a56db;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;margin-bottom:12px;">문서 안전 확인 (사업자등록번호 인증)</a><br>본 메일은 ${companyName} ERP 시스템에서 자동 발송되었습니다.`
        )
      : htmlBody

    const emailResult = await sendEmail(c.env, c.env.DB, {
      to: to_email,
      subject: subject,
      html: finalHtml,
      from: fromEmail ? `${fromName} <${fromEmail}>` : undefined
    }, {
      template: isQuotation ? 'QUOTATION' : 'INVOICE',
      relatedType: 'ORDER',
      relatedId: Number(id),
      sentBy: user?.id
    })

    if (emailResult.success) {
      return c.json({
        success: true,
        message: `${docTitle}가 ${to_email}(으)로 발송되었습니다.`,
        data: {
          order_number: order.order_number,
          to_email: to_email,
          type: type,
          subject: subject
        }
      })
    } else {
      return c.json({
        success: false,
        error: emailResult.error
      }, 500)
    }
  } catch (error) {
    console.error('src/routes/orders.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})


export default ordersOpsRouter
