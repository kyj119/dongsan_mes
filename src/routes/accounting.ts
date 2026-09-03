/**
 * accounting.ts — 회계 통합 관리 허브 API (회계 허브 Phase 1)
 *
 * spec: docs/archive/superpowers/specs/2026-06-23-accounting-hub.md (Phase1~4 완료·정본=design-accounting-hub 메모리)
 * 통합 조회·정정 허브. 입금/세금계산서/현금영수증/카드/매입을 한 화면에서 조회·정정.
 *
 * Phase 1 = 요약 KPI(수입/지출/미수금) + 입금(payments) 전체목록 조회.
 *   - GET /summary  : 기간 매출(billed) · 기간 지출(카드+매입) · 전체 미수금(파생)
 *   - GET /payments : 입금 전체목록 (기간·금액·검색 필터 + 페이지네이션)
 *   - 입금 수정/삭제는 기존 /api/ledger/payment/:id (ar-payments) 재사용.
 *
 * 모든 집계는 entity_id 필터(멀티법인) 적용. super-admin(entityId=0)은 전체.
 * billed_at은 UTC 타임스탬프 → KST 업무일 보정(+9h). 나머지(payment_date·invoice_date·
 * transaction_date)는 입력된 업무일이라 보정 불필요.
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { requireAccessOrRole, requireEditOrRole } from '../middleware/permissions'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { kstDateOf } from '../utils/kstDate'
import { INTERCOMPANY_ENTITIES } from '../constants/intercompany'
import { excludeArExcludedClientsSql } from '../constants/arPolicy'
import { deriveArSplit } from './ledger/ar-helpers'

const accountingRouter = new Hono<HonoEnv>()
// ACCOUNTANT(경리) 등 신규 역할은 /accounting 매트릭스 열람권으로 통과(회귀 0: ADMIN·MANAGER 종전 유지)
accountingRouter.use('/*', authMiddleware, requireAccessOrRole('/accounting', 'MANAGER'))

/** YYYY-MM-DD → 현재 KST 기준 이번달 1일/오늘 기본값 보정 (프론트가 항상 전달하지만 방어용) */
function defaultRange(start?: string, end?: string): { start: string; end: string } {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000) // KST
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return {
    start: start || `${y}-${m}-01`,
    end: end || `${y}-${m}-${d}`,
  }
}

// ===========================================================================
// GET /api/accounting/summary — 상단 요약 KPI
//   수입  = 기간 매출(order_billing_groups BILLED/PAID, billed_at KST)
//   지출  = 기간 카드사용(card_transactions ≠CANCEL) + 매입(purchase_invoices total)
//   미수금 = 전체 미수금 파생 (billed[BILLED] − payments − adjustments), 기간무관 스냅샷
// ===========================================================================
accountingRouter.get('/summary', async (c) => {
  try {
    const { start, end } = defaultRange(c.req.query('start'), c.req.query('end'))
    const startCompact = start.replace(/-/g, '')
    const endCompact = end.replace(/-/g, '')

    // ── 수입: 기간 매출 (청구 법인 g 기준) ──
    const efG = entityFilter(c, 'g')
    const revenueRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(g.billed_amount), 0) AS v
      FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
      WHERE g.billing_status IN ('BILLED','PAID') AND o.status != 'CANCELLED'
        AND ${kstDateOf('COALESCE(g.accounting_date, g.billed_at)')} >= ? AND ${kstDateOf('COALESCE(g.accounting_date, g.billed_at)')} <= ?${efG.clause}
    `).bind(start, end, ...efG.params).first<{ v: number }>()

    // ── 지출(카드): 기간 카드사용 (취소는 차감) ──
    const efCt = entityFilter(c, 'ct')
    const cardRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN ct.approval_type != 'CANCEL' THEN ct.amount ELSE -ct.amount END), 0) AS v
      FROM card_transactions ct
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ?${efCt.clause}
    `).bind(startCompact, endCompact, ...efCt.params).first<{ v: number }>()

    // ── 지출(매입): 기간 매입확정 (인보이스 일자 기준) ──
    const efPi = entityFilter(c, 'pi')
    const purchaseRow = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(pi.total_amount), 0) AS v
      FROM purchase_invoices pi
      WHERE date(pi.invoice_date) >= ? AND date(pi.invoice_date) <= ?${efPi.clause}
    `).bind(start, end, ...efPi.params).first<{ v: number }>()

    // ── 미수금: 전체 파생 (deriveClientBalance 집계와 동일 정의) ── 내부법인은 제외(법인간거래 탭으로 분리)
    // ★ 거래처별로 먼저 잔액을 낸 뒤 부호별 합산 — 뭉쳐서 SUM 하면 선수금이 매출채권을 상쇄해 과소 표시된다.
    //   종전 단일값은 arSplit.net 으로 그대로 보존(하위호환).
    const arSplit = await deriveArSplit(c)

    const revenue = Number(revenueRow?.v) || 0
    const expenseCard = Number(cardRow?.v) || 0
    const expensePurchase = Number(purchaseRow?.v) || 0

    return c.json({
      success: true,
      data: {
        period: { start, end },
        revenue,
        expense_total: expenseCard + expensePurchase,
        expense_card: expenseCard,
        expense_purchase: expensePurchase,
        receivable: arSplit.receivable,             // 매출채권(양수 잔액 합) — 진짜 받을 돈
        advance_received: arSplit.advance,          // 선수금(음수 잔액 합의 절대값) — 회계상 부채
        advance_clients: arSplit.advanceClients,
        receivable_net: arSplit.net,                // 종전 값(상계 후) — 하위호환
      },
    })
  } catch (error) {
    console.error('Accounting summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===========================================================================
// GET /api/accounting/payments — 입금 전체목록 (회계 허브 입금 탭)
//   필터: start/end(payment_date) · clientId · amountMin/amountMax · search(거래처/참조/메모) · entity
//   페이지네이션 + 조회 합계.
// ===========================================================================
accountingRouter.get('/payments', async (c) => {
  try {
    const q = c.req.query()
    const ef = entityFilter(c, 'p')

    let where = `WHERE 1=1${ef.clause}`
    const params: (string | number)[] = [...ef.params]

    if (q.start) { where += ' AND date(p.payment_date) >= ?'; params.push(q.start) }
    if (q.end) { where += ' AND date(p.payment_date) <= ?'; params.push(q.end) }
    if (q.clientId) { where += ' AND p.client_id = ?'; params.push(q.clientId) }
    if (q.amountMin) { where += ' AND p.amount >= ?'; params.push(Number(q.amountMin)) }
    if (q.amountMax) { where += ' AND p.amount <= ?'; params.push(Number(q.amountMax)) }
    if (q.search) {
      where += ' AND (c.client_name LIKE ? OR p.reference_number LIKE ? OR p.notes LIKE ?)'
      const kw = '%' + q.search + '%'
      params.push(kw, kw, kw)
    }

    // 합계 + 건수 (동일 WHERE — JOIN clients 포함: search가 client_name 참조)
    const aggRow = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(p.amount), 0) AS total
      FROM payments p LEFT JOIN clients c ON p.client_id = c.id
      ${where}
    `).bind(...params).first<{ cnt: number; total: number }>()
    const total = aggRow?.cnt || 0

    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(Math.max(1, Number(q.limit) || 50), 200)
    const offset = (page - 1) * limit

    const { results } = await c.env.DB.prepare(`
      SELECT p.*, c.client_name, u.name AS created_by_name
      FROM payments p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      ${where}
      ORDER BY date(p.payment_date) DESC, p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({
      success: true,
      data: results,
      summary: { total_amount: Number(aggRow?.total) || 0, total_count: total },
      pagination: { total, page, limit },
    })
  } catch (error) {
    console.error('Accounting payments error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===========================================================================
// GET /api/accounting/purchases — 매입 목록 (회계 허브 매입 탭, Phase 3)
//   기존 /api/purchase-invoices 목록 API에 기간 필터가 없어, 상단 KPI 기간 공유를 위해
//   accounting 라우트에 기간·검색·결제상태 필터 버전을 둔다. 매입확정/정정은 /purchase-invoices 링크아웃.
//   필터: start/end(invoice_date) · paymentStatus · search(공급처/계산서번호) · entity
// ===========================================================================
accountingRouter.get('/purchases', async (c) => {
  try {
    const q = c.req.query()
    const ef = entityFilter(c, 'pi')

    let where = `WHERE 1=1${ef.clause}`
    const params: (string | number)[] = [...ef.params]
    if (q.start) { where += ' AND date(pi.invoice_date) >= ?'; params.push(q.start) }
    if (q.end) { where += ' AND date(pi.invoice_date) <= ?'; params.push(q.end) }
    if (q.paymentStatus) { where += ' AND pi.payment_status = ?'; params.push(q.paymentStatus) }
    if (q.search) {
      where += ' AND (cl.client_name LIKE ? OR pi.invoice_number LIKE ?)'
      const kw = '%' + q.search + '%'
      params.push(kw, kw)
    }

    const aggRow = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(pi.total_amount), 0) AS total
      FROM purchase_invoices pi LEFT JOIN clients cl ON cl.id = pi.supplier_id
      ${where}
    `).bind(...params).first<{ cnt: number; total: number }>()
    const total = aggRow?.cnt || 0

    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(Math.max(1, Number(q.limit) || 50), 200)
    const offset = (page - 1) * limit

    const { results } = await c.env.DB.prepare(`
      SELECT pi.*, cl.client_name AS supplier_name, po.po_number
      FROM purchase_invoices pi
      LEFT JOIN clients cl ON cl.id = pi.supplier_id
      LEFT JOIN purchase_orders po ON po.id = pi.po_id
      ${where}
      ORDER BY date(pi.invoice_date) DESC, pi.id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({
      success: true,
      data: results,
      summary: { total_amount: Number(aggRow?.total) || 0, total_count: total },
      pagination: { total, page, limit },
    })
  } catch (error) {
    console.error('Accounting purchases error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===========================================================================
// GET /api/accounting/timeline — 수입/지출 통합 타임라인 (회계 허브 Phase 4)
//   수입(+) = 입금(payments) · 지출(−) = 카드(card_transactions, 취소 차감) + 매입(purchase_invoices)
//   기간 내 이벤트를 일자 역순 단일 목록으로 + 기간 집계(총수입/총지출/순현금).
//   kind=income|expense 로 한쪽만. signed_amount: 수입 +, 지출 −, 카드취소 +(환불).
//   카드 일자는 compact(YYYYMMDD) → 정규화. 모든 소스 entity_id 필터.
// ===========================================================================
accountingRouter.get('/timeline', async (c) => {
  try {
    const { start, end } = defaultRange(c.req.query('start'), c.req.query('end'))
    const startCompact = start.replace(/-/g, '')
    const endCompact = end.replace(/-/g, '')
    const kind = c.req.query('kind') // 'income' | 'expense' | undefined(전체)

    const efP = entityFilter(c, 'p')
    const efCt = entityFilter(c, 'ct')
    const efPi = entityFilter(c, 'pi')

    // 기간 집계 (총수입/총지출/순현금 + 건수)
    const incomeAgg = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(p.amount), 0) AS v FROM payments p
      WHERE date(p.payment_date) >= ? AND date(p.payment_date) <= ?${efP.clause}
    `).bind(start, end, ...efP.params).first<{ cnt: number; v: number }>()
    const cardAgg = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt,
             COALESCE(SUM(CASE WHEN ct.approval_type != 'CANCEL' THEN ct.amount ELSE -ct.amount END), 0) AS v
      FROM card_transactions ct
      WHERE ct.transaction_date >= ? AND ct.transaction_date <= ?${efCt.clause}
        AND EXISTS (SELECT 1 FROM corporate_cards cca WHERE cca.id = ct.card_id AND cca.is_active = 1)
    `).bind(startCompact, endCompact, ...efCt.params).first<{ cnt: number; v: number }>()
    const purAgg = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(pi.total_amount), 0) AS v FROM purchase_invoices pi
      WHERE date(pi.invoice_date) >= ? AND date(pi.invoice_date) <= ?${efPi.clause}
    `).bind(start, end, ...efPi.params).first<{ cnt: number; v: number }>()

    const incomeTotal = Number(incomeAgg?.v) || 0
    const expenseCard = Number(cardAgg?.v) || 0
    const expensePurchase = Number(purAgg?.v) || 0
    const incomeCount = Number(incomeAgg?.cnt) || 0
    const expenseCount = (Number(cardAgg?.cnt) || 0) + (Number(purAgg?.cnt) || 0)

    let totalCount = incomeCount + expenseCount
    if (kind === 'income') totalCount = incomeCount
    else if (kind === 'expense') totalCount = expenseCount

    const page = Math.max(1, Number(c.req.query('page')) || 1)
    const limit = Math.min(Math.max(1, Number(c.req.query('limit')) || 50), 200)
    const offset = (page - 1) * limit

    const flowFilter = kind === 'income' ? "WHERE t.flow = 'income'"
      : kind === 'expense' ? "WHERE t.flow = 'expense'" : ''

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM (
        SELECT 'income' AS flow, '입금' AS label, date(p.payment_date) AS evt_date,
               COALESCE(c.client_name, '-') AS party, p.payment_method AS detail,
               p.amount AS signed_amount, p.id AS ref_id
        FROM payments p LEFT JOIN clients c ON c.id = p.client_id
        WHERE date(p.payment_date) >= ? AND date(p.payment_date) <= ?${efP.clause}
        UNION ALL
        SELECT 'expense' AS flow, '카드' AS label,
               substr(ct.transaction_date,1,4) || '-' || substr(ct.transaction_date,5,2) || '-' || substr(ct.transaction_date,7,2) AS evt_date,
               COALESCE(ct.merchant_name, '-') AS party, cc.card_name AS detail,
               CASE WHEN ct.approval_type = 'CANCEL' THEN ct.amount ELSE -ct.amount END AS signed_amount, ct.id AS ref_id
        FROM card_transactions ct LEFT JOIN corporate_cards cc ON cc.id = ct.card_id
        WHERE ct.transaction_date >= ? AND ct.transaction_date <= ?${efCt.clause}
          AND EXISTS (SELECT 1 FROM corporate_cards cca WHERE cca.id = ct.card_id AND cca.is_active = 1)
        UNION ALL
        SELECT 'expense' AS flow, '매입' AS label, date(pi.invoice_date) AS evt_date,
               COALESCE(cl.client_name, '-') AS party, pi.invoice_number AS detail,
               -pi.total_amount AS signed_amount, pi.id AS ref_id
        FROM purchase_invoices pi LEFT JOIN clients cl ON cl.id = pi.supplier_id
        WHERE date(pi.invoice_date) >= ? AND date(pi.invoice_date) <= ?${efPi.clause}
      ) t
      ${flowFilter}
      ORDER BY t.evt_date DESC, t.label, t.ref_id DESC
      LIMIT ? OFFSET ?
    `).bind(
      start, end, ...efP.params,
      startCompact, endCompact, ...efCt.params,
      start, end, ...efPi.params,
      limit, offset
    ).all()

    return c.json({
      success: true,
      data: results,
      summary: {
        income_total: incomeTotal,
        expense_total: expenseCard + expensePurchase,
        expense_card: expenseCard,
        expense_purchase: expensePurchase,
        net: incomeTotal - (expenseCard + expensePurchase),
        total_count: totalCount,
      },
      pagination: { total: totalCount, page, limit },
    })
  } catch (error) {
    console.error('Accounting timeline error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ===========================================================================
// 법인간 거래 (inter-entity) — 대납·자금대여·상환·내부거래대금·계산서이전 기록
//   방향 규약: 돈(가치)이 from → to 로 흘렀다. 대납=대납 법인이 from, 상환=갚는 법인이 from.
//   법인간 잔액 = Σ(A→B) − Σ(B→A) (affects_balance=1만) — 상환은 역방향 기록으로 자연 상계.
//   가시성: 전체모드(entityId=0)=전체, 특정 법인 세션=당사자(from/to)인 기록만.
//   spec: docs/superpowers/specs/2026-07-18-inter-entity-transactions.md
// ===========================================================================
const IET_TYPES = ['SUBROGATION', 'LOAN', 'REPAYMENT', 'INTERNAL_TRADE', 'INVOICE_TRANSFER', 'OTHER']

function ietVisibility(c: Context<HonoEnv>): { clause: string; params: number[] } {
  const e = getEntityId(c)
  if (e === 0) return { clause: '', params: [] }
  return { clause: ' AND (t.from_entity_id = ? OR t.to_entity_id = ?)', params: [e, e] }
}

/** 등록/수정 공통 검증. 실패 시 오류 메시지, 성공 시 null. */
async function ietValidate(c: Context<HonoEnv>, body: Record<string, unknown>): Promise<string | null> {
  const date = String(body.transaction_date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '거래일(YYYY-MM-DD)이 필요합니다'
  const from = Number(body.from_entity_id)
  const to = Number(body.to_entity_id)
  if (!from || !to) return '지급 법인과 수혜 법인을 선택하세요'
  if (from === to) return '지급 법인과 수혜 법인이 같을 수 없습니다'
  // 인가: 특정 법인 세션은 본인이 당사자(from/to)인 거래만. 전체모드(0)=허용.
  const sessionEntity = getEntityId(c)
  if (sessionEntity !== 0 && sessionEntity !== from && sessionEntity !== to) {
    return '본인 법인이 당사자인 거래만 등록·수정할 수 있습니다'
  }
  if (!IET_TYPES.includes(String(body.transaction_type))) return '유효하지 않은 거래 유형입니다'
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return '금액은 0보다 커야 합니다'
  const { results: ents } = await c.env.DB.prepare(
    'SELECT id FROM entities WHERE id IN (?, ?) AND is_active = 1'
  ).bind(from, to).all()
  if ((ents || []).length !== 2) return '존재하지 않는 법인입니다'
  if (body.client_id) {
    const cl = await c.env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(Number(body.client_id)).first()
    if (!cl) return '존재하지 않는 거래처입니다'
  }
  return null
}

// GET /api/accounting/inter-entity/summary — 법인 페어별 순잔액 (기간 무관 누적)
accountingRouter.get('/inter-entity/summary', async (c) => {
  try {
    const vis = ietVisibility(c)
    const { results } = await c.env.DB.prepare(`
      SELECT t.from_entity_id AS f, t.to_entity_id AS tt, COALESCE(SUM(t.amount), 0) AS total
      FROM inter_entity_transactions t
      WHERE t.affects_balance = 1${vis.clause}
      GROUP BY t.from_entity_id, t.to_entity_id
    `).bind(...vis.params).all<{ f: number; tt: number; total: number }>()

    const { results: ents } = await c.env.DB.prepare(
      'SELECT id, name, short_name FROM entities'
    ).all<{ id: number; name: string; short_name: string | null }>()
    const nameOf = new Map((ents || []).map(e => [e.id, e.short_name || e.name]))

    // 페어별 순액: net(A,B) = Σ(A→B) − Σ(B→A). net>0 → A가 B에 받을 채권.
    const flow = new Map<string, number>()
    for (const r of results || []) flow.set(`${r.f}:${r.tt}`, Number(r.total) || 0)
    const seen = new Set<string>()
    const pairs: Array<{ creditor_id: number; creditor_name: string; debtor_id: number; debtor_name: string; amount: number }> = []
    for (const r of results || []) {
      const key = r.f < r.tt ? `${r.f}:${r.tt}` : `${r.tt}:${r.f}`
      if (seen.has(key)) continue
      seen.add(key)
      const [a, b] = key.split(':').map(Number)
      const net = (flow.get(`${a}:${b}`) || 0) - (flow.get(`${b}:${a}`) || 0)
      const creditor = net >= 0 ? a : b
      const debtor = net >= 0 ? b : a
      pairs.push({
        creditor_id: creditor,
        creditor_name: nameOf.get(creditor) || `법인${creditor}`,
        debtor_id: debtor,
        debtor_name: nameOf.get(debtor) || `법인${debtor}`,
        amount: Math.abs(net),
      })
    }
    pairs.sort((x, y) => y.amount - x.amount)
    return c.json({ success: true, data: pairs })
  } catch (error) {
    console.error('Inter-entity summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/accounting/inter-entity/derived — 주문·매입 기반 내부거래 채권·채무 포지션(파생)
//   거래처원장에서 제외한 내부법인(그룹 3사) 간 AR/AP를 여기서 통합 확인. cron 미러 대사와 동일 파생(SSOT).
//   가시성: 특정 법인 세션은 본인이 당사자(from/to)인 방향만. 채권·채무 둘 다 0인 미거래 방향은 숨김.
accountingRouter.get('/inter-entity/derived', async (c) => {
  try {
    const { deriveIntercompanyPositions } = await import('../utils/intercompany')
    let positions = await deriveIntercompanyPositions(c.env.DB)
    const e = getEntityId(c)
    if (e !== 0) positions = positions.filter(p => p.from_entity_id === e || p.to_entity_id === e)
    positions = positions.filter(p => Math.round(p.ar) !== 0 || Math.round(p.ap) !== 0)
    positions.sort((x, y) => Math.abs(y.ar) - Math.abs(x.ar))
    return c.json({ success: true, data: positions })
  } catch (error) {
    console.error('Inter-entity derived error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/accounting/inter-entity/derived/orders?from=<법인id>&client=<거래처id> — 방향별 매출채권 구성 주문(드릴다운)
accountingRouter.get('/inter-entity/derived/orders', async (c) => {
  try {
    const fromEntityId = Number(c.req.query('from'))
    const toClientId = Number(c.req.query('client'))
    if (!fromEntityId || !toClientId) return c.json({ success: false, error: 'from·client 파라미터가 필요합니다' }, 400)
    // 가시성: 특정 법인 세션은 본인이 당사자(from법인 또는 to법인)인 방향만 조회 가능.
    const e = getEntityId(c)
    if (e !== 0) {
      const toEntity = INTERCOMPANY_ENTITIES.find(x => x.clientId === toClientId)
      if (fromEntityId !== e && toEntity?.entityId !== e) {
        return c.json({ success: false, error: '조회 권한이 없습니다' }, 403)
      }
    }
    const { getIntercompanyArOrders } = await import('../utils/intercompany')
    const orders = await getIntercompanyArOrders(c.env.DB, fromEntityId, toClientId)
    return c.json({ success: true, data: orders })
  } catch (error) {
    console.error('Inter-entity derived orders error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/accounting/inter-entity — 목록 (start/end/type/search + 페이지네이션)
accountingRouter.get('/inter-entity', async (c) => {
  try {
    const q = c.req.query()
    const vis = ietVisibility(c)
    let where = `WHERE 1=1${vis.clause}`
    const params: (string | number)[] = [...vis.params]
    if (q.start) { where += ' AND t.transaction_date >= ?'; params.push(q.start) }
    if (q.end) { where += ' AND t.transaction_date <= ?'; params.push(q.end) }
    if (q.type) { where += ' AND t.transaction_type = ?'; params.push(q.type) }
    if (q.search) {
      where += ' AND (cl.client_name LIKE ? OR t.description LIKE ?)'
      const kw = '%' + q.search + '%'
      params.push(kw, kw)
    }

    const aggRow = await c.env.DB.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(t.amount), 0) AS total
      FROM inter_entity_transactions t LEFT JOIN clients cl ON cl.id = t.client_id
      ${where}
    `).bind(...params).first<{ cnt: number; total: number }>()
    const total = aggRow?.cnt || 0

    const page = Math.max(1, Number(q.page) || 1)
    const limit = Math.min(Math.max(1, Number(q.limit) || 50), 200)
    const offset = (page - 1) * limit

    const { results } = await c.env.DB.prepare(`
      SELECT t.*,
             COALESCE(fe.short_name, fe.name) AS from_entity_name,
             COALESCE(te.short_name, te.name) AS to_entity_name,
             cl.client_name, u.name AS created_by_name
      FROM inter_entity_transactions t
      LEFT JOIN entities fe ON fe.id = t.from_entity_id
      LEFT JOIN entities te ON te.id = t.to_entity_id
      LEFT JOIN clients cl ON cl.id = t.client_id
      LEFT JOIN users u ON u.id = t.created_by
      ${where}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    return c.json({
      success: true,
      data: results,
      summary: { total_amount: Number(aggRow?.total) || 0, total_count: total },
      pagination: { total, page, limit },
    })
  } catch (error) {
    console.error('Inter-entity list error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/accounting/inter-entity — 등록
accountingRouter.post('/inter-entity', requireEditOrRole('/accounting', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const err = await ietValidate(c, body)
    if (err) return c.json({ success: false, error: err }, 400)
    const user = c.get('user')
    const result = await c.env.DB.prepare(`
      INSERT INTO inter_entity_transactions
        (transaction_date, from_entity_id, to_entity_id, transaction_type, amount, affects_balance, client_id, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      String(body.transaction_date),
      Number(body.from_entity_id),
      Number(body.to_entity_id),
      String(body.transaction_type),
      Number(body.amount),
      body.affects_balance ? 1 : 0,
      body.client_id ? Number(body.client_id) : null,
      body.description ? String(body.description) : null,
      user?.id || null
    ).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '법인간 거래가 등록되었습니다' })
  } catch (error) {
    console.error('Inter-entity create error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/accounting/inter-entity/:id — 수정
accountingRouter.put('/inter-entity/:id', requireEditOrRole('/accounting', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const vis = ietVisibility(c)
    const existing = await c.env.DB.prepare(
      `SELECT id FROM inter_entity_transactions t WHERE t.id = ?${vis.clause}`
    ).bind(id, ...vis.params).first()
    if (!existing) return c.json({ success: false, error: '기록을 찾을 수 없습니다' }, 404)

    const body = await c.req.json()
    const err = await ietValidate(c, body)
    if (err) return c.json({ success: false, error: err }, 400)
    await c.env.DB.prepare(`
      UPDATE inter_entity_transactions
      SET transaction_date = ?, from_entity_id = ?, to_entity_id = ?, transaction_type = ?,
          amount = ?, affects_balance = ?, client_id = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      String(body.transaction_date),
      Number(body.from_entity_id),
      Number(body.to_entity_id),
      String(body.transaction_type),
      Number(body.amount),
      body.affects_balance ? 1 : 0,
      body.client_id ? Number(body.client_id) : null,
      body.description ? String(body.description) : null,
      id
    ).run()
    return c.json({ success: true, message: '수정되었습니다' })
  } catch (error) {
    console.error('Inter-entity update error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/accounting/inter-entity/:id — 삭제
accountingRouter.delete('/inter-entity/:id', requireEditOrRole('/accounting', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const vis = ietVisibility(c)
    const existing = await c.env.DB.prepare(
      `SELECT id FROM inter_entity_transactions t WHERE t.id = ?${vis.clause}`
    ).bind(id, ...vis.params).first()
    if (!existing) return c.json({ success: false, error: '기록을 찾을 수 없습니다' }, 404)
    await c.env.DB.prepare('DELETE FROM inter_entity_transactions WHERE id = ?').bind(id).run()
    return c.json({ success: true, message: '삭제되었습니다' })
  } catch (error) {
    console.error('Inter-entity delete error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default accountingRouter
