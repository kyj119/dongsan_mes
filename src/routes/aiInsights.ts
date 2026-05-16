import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'

const aiInsights = new Hono<HonoEnv>()
aiInsights.use('*', authMiddleware)

// ─── 리스크 등급별 거래처 현황 (static route — must be before :clientId) ─────
aiInsights.get('/credit-risk/summary', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT credit_risk_grade as grade, COUNT(*) as count,
        ROUND(SUM(balance), 0) as total_outstanding,
        ROUND(AVG(credit_risk_score), 1) as avg_score
      FROM clients
      WHERE is_active = 1 AND credit_risk_grade != 'N/A'
      GROUP BY credit_risk_grade
      ORDER BY avg_score DESC
    `).all()

    const { results: highRisk } = await c.env.DB.prepare(`
      SELECT id, client_name, credit_risk_score, credit_risk_grade, balance, credit_limit
      FROM clients
      WHERE is_active = 1 AND credit_risk_grade IN ('D', 'F')
      ORDER BY credit_risk_score DESC LIMIT 10
    `).all()

    return c.json({ success: true, data: { by_grade: results, high_risk: highRisk } })
  } catch (e: any) {
    console.error('credit-risk/summary error:', e)
    return c.json({ success: false, error: e.message || '서버 오류' }, 500)
  }
})

// ─── 거래처 미수금 리스크 스코어링 ───────────────────────────────────────────
aiInsights.get('/credit-risk/:clientId', async (c) => {
  const clientId = Number(c.req.param('clientId'))

  // 거래 데이터 수집
  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(final_amount), 0) as total_revenue,
      COALESCE(SUM(final_amount) - SUM(COALESCE(paid_amount, 0)), 0) as outstanding,
      MIN(order_date) as first_order,
      MAX(order_date) as last_order
    FROM orders
    WHERE client_id = ? AND status NOT IN ('CANCELLED', 'DELETED', 'QUOTATION')
  `).bind(clientId).first<any>()

  // 평균 수금일 (입금까지 걸린 일수)
  const avgDays = await c.env.DB.prepare(`
    SELECT AVG(julianday(p.payment_date) - julianday(o.order_date)) as avg_days
    FROM payments p
    JOIN orders o ON o.client_id = p.client_id
    WHERE p.client_id = ? AND p.payment_date IS NOT NULL AND o.order_date IS NOT NULL
  `).bind(clientId).first<{ avg_days: number }>()

  // 연체 횟수 (30일 초과 미수금 이력)
  const overdueCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt
    FROM orders
    WHERE client_id = ? AND status NOT IN ('CANCELLED','DELETED','QUOTATION')
      AND billing_status = 'BILLED'
      AND julianday('now') - julianday(billed_at) > 30
      AND (paid_amount IS NULL OR paid_amount < final_amount)
  `).bind(clientId).first<{ cnt: number }>()

  // 거래 기간 (월)
  const tradingMonths = stats?.first_order
    ? Math.max(1, Math.round((Date.now() - new Date(stats.first_order).getTime()) / (30 * 86400000)))
    : 0

  // 리스크 스코어 계산 (0~100, 높을수록 위험)
  const avgCollectionDays = avgDays?.avg_days || 0
  const overdueRatio = stats?.total_orders > 0 ? (overdueCount?.cnt || 0) / stats.total_orders : 0
  const outstandingRatio = stats?.total_revenue > 0 ? (stats.outstanding || 0) / stats.total_revenue : 0

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

  // 캐시 업데이트
  await c.env.DB.prepare(`
    UPDATE clients SET credit_risk_score = ?, credit_risk_grade = ?, credit_risk_updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(score, grade, clientId).run()

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
        outstanding: stats?.outstanding || 0
      }
    }
  })
})

// ─── 전체 거래처 리스크 일괄 계산 ──────��─────────────────────────────────────
aiInsights.post('/credit-risk/calculate-all', requireRole('ADMIN', 'MANAGER'), async (c) => {
  // clients 테이블에는 entity_id 없음
  const { results: clients } = await c.env.DB.prepare(`
    SELECT id FROM clients WHERE is_active = 1
  `).all<{ id: number }>()

  let calculated = 0
  for (const client of clients) {
    // 개별 계산 (위 엔드포인트 로직 축약)
    const stats = await c.env.DB.prepare(`
      SELECT COUNT(*) as total_orders,
        COALESCE(SUM(final_amount), 0) as total_revenue,
        COALESCE(SUM(final_amount) - SUM(COALESCE(paid_amount, 0)), 0) as outstanding
      FROM orders WHERE client_id = ? AND status NOT IN ('CANCELLED','DELETED','QUOTATION')
    `).bind(client.id).first<any>()

    if (!stats || stats.total_orders === 0) continue

    const overdueCount = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM orders
      WHERE client_id = ? AND billing_status = 'BILLED'
        AND julianday('now') - julianday(billed_at) > 30
        AND (paid_amount IS NULL OR paid_amount < final_amount)
    `).bind(client.id).first<{ cnt: number }>()

    const overdueRatio = stats.total_orders > 0 ? (overdueCount?.cnt || 0) / stats.total_orders : 0
    const outstandingRatio = stats.total_revenue > 0 ? stats.outstanding / stats.total_revenue : 0
    let score = overdueRatio * 30 + outstandingRatio * 25
    score = Math.max(0, Math.min(100, Math.round(score)))

    let grade = score <= 20 ? 'A' : score <= 40 ? 'B' : score <= 60 ? 'C' : score <= 80 ? 'D' : 'F'

    await c.env.DB.prepare(`
      UPDATE clients SET credit_risk_score = ?, credit_risk_grade = ?, credit_risk_updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(score, grade, client.id).run()
    calculated++
  }

  return c.json({ success: true, data: { calculated } })
})

// (credit-risk/summary는 상단으로 이동됨 — static route before :clientId)

// ─── 생산 병목 탐지 (Phase 2 기초) ──────────────────────────────────────────
aiInsights.get('/bottleneck', async (c) => {
  // 장비별 현재 큐 깊이 + 예상 처리시간 + 납기 위험
  const { results } = await c.env.DB.prepare(`
    SELECT e.id, e.name, e.daily_capacity,
      COUNT(c.id) as queue_depth,
      COALESCE(SUM(c.estimated_minutes), 0) as total_queue_minutes,
      SUM(CASE WHEN c.delivery_date <= date('now', '+2 days') THEN 1 ELSE 0 END) as urgent_count,
      MIN(c.delivery_date) as earliest_deadline
    FROM equipment e
    LEFT JOIN cards c ON c.equipment_id = e.id AND c.status = 'PRINTING'
    WHERE e.status = 'ACTIVE'
    GROUP BY e.id
    HAVING queue_depth > 0
    ORDER BY total_queue_minutes DESC
  `).all()

  // 병목 판정: 큐 처리시간 > 8시간 (1일 용량 초과)
  const bottlenecks = (results || []).filter((r: any) => r.total_queue_minutes > 480)

  return c.json({ success: true, data: { equipment_load: results, bottlenecks, bottleneck_count: bottlenecks.length } })
})

export default aiInsights
