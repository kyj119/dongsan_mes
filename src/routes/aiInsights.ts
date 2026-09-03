import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, cardEntityFilter } from '../utils/entityFilter'
import { excludeArExcludedClientsSql } from '../constants/arPolicy'
import { deriveClientBalance } from './ledger/ar-helpers'

const aiInsights = new Hono<HonoEnv>()
aiInsights.use('*', authMiddleware)

// ─── 리스크 등급별 거래처 현황 (static route — must be before :clientId) ─────
aiInsights.get('/credit-risk/summary', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    // G-1: 폐기 clients.balance 대신 파생 미수(order_billing_groups[BILLED]−payments−adjustments)
    //
    // 성능(2026-08-25): 이 셋을 **행별 상관 서브쿼리**로 두면 거래처 1건마다 order_billing_groups·
    //   payments·adjustments 를 훑는다 — `/api/clients?dormant` 를 36초 뒤 500 으로 만든 것과 **같은 모양**이다.
    //   지금 싸 보이는 건 `credit_risk_grade != 'N/A'` 가 1건만 남기기 때문이고, `calculate-all` 이
    //   한 번 돌아 등급이 채워지면 그대로 2,873행 × 서브쿼리 3개가 된다. 미리 접어서 조인한다.
    //   등가 검증 = prod 활성 2,873곳 전수 대조 **불일치 0**·합계 569,804,879 동일.
    const arJoins = `
      LEFT JOIN (SELECT o.client_id AS cid, SUM(g.billed_amount) AS billed
                   FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
                  WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
                  GROUP BY o.client_id) b ON b.cid = cl.id
      LEFT JOIN (SELECT client_id AS cid, SUM(amount) AS paid FROM payments GROUP BY client_id) p ON p.cid = cl.id
      LEFT JOIN (SELECT client_id AS cid, SUM(amount) AS adj FROM adjustments GROUP BY client_id) a ON a.cid = cl.id`
    const arBalance = `(COALESCE(b.billed, 0) - COALESCE(p.paid, 0) - COALESCE(a.adj, 0))`

    const { results } = await c.env.DB.prepare(`
      SELECT cl.credit_risk_grade as grade, COUNT(*) as count,
        ROUND(SUM(${arBalance}), 0) as total_outstanding,
        ROUND(AVG(cl.credit_risk_score), 1) as avg_score
      FROM clients cl${arJoins}
      WHERE cl.is_active = 1 AND cl.credit_risk_grade != 'N/A'${excludeArExcludedClientsSql('cl.id')}
      GROUP BY cl.credit_risk_grade
      ORDER BY avg_score DESC
    `).all()

    const { results: highRisk } = await c.env.DB.prepare(`
      SELECT cl.id, cl.client_name, cl.credit_risk_score, cl.credit_risk_grade,
        ${arBalance} as balance,
        cl.credit_limit
      FROM clients cl${arJoins}
      WHERE cl.is_active = 1 AND cl.credit_risk_grade IN ('D', 'F')${excludeArExcludedClientsSql('cl.id')}
      ORDER BY cl.credit_risk_score DESC, cl.id DESC LIMIT 10
    `).all()

    return c.json({ success: true, data: { by_grade: results, high_risk: highRisk } })
  } catch (e: any) {
    console.error('credit-risk/summary error:', e)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ─── 거래처 미수금 리스크 스코어링 ───────────────────────────────────────────
aiInsights.get('/credit-risk/:clientId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  const clientId = Number(c.req.param('clientId'))
  // clients는 법인 공유 테이블 → client_id만으로 격리 불가. orders/payments에 entity 필터 적용 (#333)
  const ef = entityFilter(c)       // orders/payments (alias 없음)
  const efP = entityFilter(c, 'p') // payments p

  // 거래 데이터 수집
  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(final_amount), 0) as total_revenue,
      MIN(order_date) as first_order,
      MAX(order_date) as last_order
    FROM orders
    WHERE client_id = ?${ef.clause} AND status NOT IN ('CANCELLED', 'DELETED', 'QUOTATION')
  `).bind(clientId, ...ef.params).first<any>()

  // 미수금은 파생 정본(청구 정본 order_billing_groups[BILLED] − 입금 − 조정)만 쓴다.
  // 종전 `SUM(orders.final_amount) − SUM(payments.amount)` 는 clients.ts 가 폐기 선언한 그 식이라
  // 미청구 주문까지 미수로 세어 등급을 과대 위험 쪽으로 밀었다(형제 /credit-risk/summary 는 이미 파생).
  const outstanding = await deriveClientBalance(c, clientId)

  // 평균 수금일 (입금까지 걸린 일수)
  const avgDays = await c.env.DB.prepare(`
    SELECT AVG(julianday(p.payment_date) - julianday(o.order_date)) as avg_days
    FROM payments p
    JOIN orders o ON o.client_id = p.client_id
    WHERE p.client_id = ?${efP.clause} AND p.payment_date IS NOT NULL AND o.order_date IS NOT NULL
  `).bind(clientId, ...efP.params).first<{ avg_days: number }>()

  // 연체 횟수 (30일 초과 미수금 이력)
  const overdueCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt
    FROM orders
    WHERE client_id = ?${ef.clause} AND status NOT IN ('CANCELLED','DELETED','QUOTATION')
      AND billing_status = 'BILLED'
      AND julianday('now') - julianday(COALESCE(accounting_date, billed_at)) > 30
  `).bind(clientId, ...ef.params).first<{ cnt: number }>()

  // 거래 기간 (월)
  const tradingMonths = stats?.first_order
    ? Math.max(1, Math.round((Date.now() - new Date(stats.first_order).getTime()) / (30 * 86400000)))
    : 0

  // 리스크 스코어 계산 (0~100, 높을수록 위험)
  const avgCollectionDays = avgDays?.avg_days || 0
  const overdueRatio = stats?.total_orders > 0 ? (overdueCount?.cnt || 0) / stats.total_orders : 0
  const outstandingRatio = stats?.total_revenue > 0 ? outstanding / stats.total_revenue : 0

  let score = 0
  // 평균 수금일 기여 (30일 이상부터 가중)
  score += Math.min(30, Math.max(0, avgCollectionDays - 15)) * 1.0
  // 연체 비율 기여
  score += overdueRatio * 30
  // 미수금 비율 기여
  score += outstandingRatio * 25
  // 거래 기간 보정 (신규 거래처일수록 불확실)
  if (tradingMonths < 3) score += 10
  else if (tradingMonths > 24) score -= 5

  score = Math.max(0, Math.min(100, Math.round(score)))

  // 등급 결정
  let grade: string
  if (score <= 20) grade = 'A'       // 우량
  else if (score <= 40) grade = 'B'  // 양호
  else if (score <= 60) grade = 'C'  // 주의
  else if (score <= 80) grade = 'D'  // 위험
  else grade = 'F'                   // 고위험

  // G-1: GET은 부수효과 없이 조회만 — 캐시(clients.credit_risk_*) 영속은 POST /credit-risk/calculate-all 담당(멱등·감사 명확)
  return c.json({
    success: true,
    data: {
      client_id: clientId,
      score, grade,
      factors: {
        avg_collection_days: Math.round(avgCollectionDays),
        overdue_count: overdueCount?.cnt || 0,
        overdue_ratio: Math.round(overdueRatio * 1000) / 10,
        outstanding_ratio: Math.round(outstandingRatio * 1000) / 10,
        trading_months: tradingMonths,
        total_orders: stats?.total_orders || 0,
        outstanding
      }
    }
  })
})

// ─── 전체 거래처 리스크 일괄 계산 ────────────────────────────────────────────
aiInsights.post('/credit-risk/calculate-all', requireRole('ADMIN', 'MANAGER'), async (c) => {
  // #177: N+1 → 단일 집계 쿼리로 교체
  // 미수금은 파생 정본(order_billing_groups[BILLED] − payments − adjustments)으로 계산한다 —
  // 종전 `SUM(final_amount) − (SELECT SUM(amount) FROM payments WHERE client_id = o.client_id)` 는
  // ①폐기된 산식이고 ②거래처마다 payments 를 훑는 행별 상관 서브쿼리라 계획이 무너진다.
  // 큰 쪽을 먼저 GROUP BY 로 접고 작은 쪽을 조인한다(형제 /credit-risk/summary 와 같은 모양).
  const { results: clientStats } = await c.env.DB.prepare(`
    WITH ord AS (
      SELECT o.client_id AS client_id,
        COUNT(*) as total_orders,
        COALESCE(SUM(o.final_amount), 0) as total_revenue,
        SUM(CASE WHEN o.billing_status = 'BILLED'
             AND julianday('now') - julianday(COALESCE(o.accounting_date, o.billed_at)) > 30
             THEN 1 ELSE 0 END) as overdue_count
      FROM orders o
      JOIN clients c ON o.client_id = c.id AND c.is_active = 1
      WHERE o.status NOT IN ('CANCELLED','DELETED','QUOTATION')${excludeArExcludedClientsSql('c.id')}
      GROUP BY o.client_id
    ),
    billed AS (
      SELECT o.client_id AS cid, SUM(g.billed_amount) AS v
        FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
       WHERE g.billing_status = 'BILLED' AND o.status != 'CANCELLED'
       GROUP BY o.client_id
    ),
    paid AS (SELECT client_id AS cid, SUM(amount) AS v FROM payments GROUP BY client_id),
    adj  AS (SELECT client_id AS cid, SUM(amount) AS v FROM adjustments GROUP BY client_id)
    SELECT ord.client_id, ord.total_orders, ord.total_revenue, ord.overdue_count,
      (COALESCE(billed.v, 0) - COALESCE(paid.v, 0) - COALESCE(adj.v, 0)) as outstanding
    FROM ord
    LEFT JOIN billed ON billed.cid = ord.client_id
    LEFT JOIN paid ON paid.cid = ord.client_id
    LEFT JOIN adj ON adj.cid = ord.client_id
    WHERE ord.total_orders > 0
  `).all<{ client_id: number; total_orders: number; total_revenue: number; outstanding: number; overdue_count: number }>()

  const updateStmts = clientStats.map(s => {
    const overdueRatio = s.total_orders > 0 ? s.overdue_count / s.total_orders : 0
    const outstandingRatio = s.total_revenue > 0 ? s.outstanding / s.total_revenue : 0
    let score = overdueRatio * 30 + outstandingRatio * 25
    score = Math.max(0, Math.min(100, Math.round(score)))
    const grade = score <= 20 ? 'A' : score <= 40 ? 'B' : score <= 60 ? 'C' : score <= 80 ? 'D' : 'F'
    return c.env.DB.prepare(
      'UPDATE clients SET credit_risk_score = ?, credit_risk_grade = ?, credit_risk_updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(score, grade, s.client_id)
  })

  if (updateStmts.length > 0) {
    for (let i = 0; i < updateStmts.length; i += 80) {
      await c.env.DB.batch(updateStmts.slice(i, i + 80))
    }
  }

  return c.json({ success: true, data: { calculated: updateStmts.length } })
})

// (credit-risk/summary는 상단으로 이동됨 — static route before :clientId)

// ─── 생산 병목 탐지 (Phase 2 기초) ──────────────────────────────────────────
aiInsights.get('/bottleneck', async (c) => {
  // 장비별 현재 큐 깊이 + 예상 처리시간 + 납기 위험 (equipment·cards 법인 격리 — 0302 #342)
  const efEq = entityFilter(c, 'e')        // equipment(entity_id)
  const efCard = cardEntityFilter(c, 'c')  // 큐 카드(requesting_entity_id)
  const { results } = await c.env.DB.prepare(`
    SELECT e.id, e.name, e.daily_capacity,
      COUNT(c.id) as queue_depth,
      COALESCE(SUM(c.estimated_minutes), 0) as total_queue_minutes,
      SUM(CASE WHEN c.delivery_date <= date('now', '+9 hours', '+2 days') THEN 1 ELSE 0 END) as urgent_count,
      MIN(c.delivery_date) as earliest_deadline
    FROM equipment e
    LEFT JOIN cards c ON c.equipment_id = e.id AND c.status = 'PRINTING'${efCard.clause}
    WHERE e.status = 'ACTIVE'${efEq.clause}
    GROUP BY e.id
    HAVING queue_depth > 0
    ORDER BY total_queue_minutes DESC
  `).bind(...efCard.params, ...efEq.params).all()

  // 병목 판정: 큐 처리시간 > 8시간 (1일 용량 초과)
  const bottlenecks = (results || []).filter((r: any) => r.total_queue_minutes > 480)

  return c.json({ success: true, data: { equipment_load: results, bottlenecks, bottleneck_count: bottlenecks.length } })
})

export default aiInsights
