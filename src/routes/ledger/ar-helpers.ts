/**
 * ledger/ar-helpers.ts — 매출원장(AR) 공유 헬퍼 (accounts-receivable.ts에서 분리, 2026-06-12 대형파일 분할)
 *
 * 미수금 파생(deriveClientBalance) / 정합성 집계 쿼리(buildIntegrityQuery) /
 * aging 분류(getAgingCategory) + D1 Row 타입. ar-* 라우트 그룹에서 공유. ⚠️ 이동만, 로직 수정 0.
 */
import type { Context } from 'hono'
import type { HonoEnv } from '../../types/env'
import { entityFilter } from '../../utils/entityFilter'

// ── split billing P3: (거래처) 미수금 파생 — order_billing_groups[BILLED] − payments − adjustments ──
// clients.balance 캐시 대체. entityFilter 적용(현재 사용자 법인 = 청구 법인 기준).
export async function deriveClientBalance(c: Context<HonoEnv>, clientId: number | string): Promise<number> {
  const { clause: gEf, params: gP } = entityFilter(c, 'g')
  const billed = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(g.billed_amount), 0) AS v FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
     WHERE o.client_id = ? AND g.billing_status = 'BILLED' AND o.status != 'CANCELLED'${gEf}`
  ).bind(clientId, ...gP).first<{ v: number }>()
  const { clause: pEf, params: pP } = entityFilter(c, 'p')
  const paid = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM payments p WHERE client_id = ?${pEf}`
  ).bind(clientId, ...pP).first<{ v: number }>()
  const { clause: aEf, params: aP } = entityFilter(c, 'a')
  const adj = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM adjustments a WHERE client_id = ?${aEf}`
  ).bind(clientId, ...aP).first<{ v: number }>()
  return (Number(billed?.v) || 0) - (Number(paid?.v) || 0) - (Number(adj?.v) || 0)
}
// ── Row types for D1 .first<T>() / .all<T>() ──

export interface ClientRow {
  id: number
  client_code: string
  client_name: string
  balance: number
  is_active: number
  email?: string | null
  overdue_alert_days?: number | null
}

export interface OrderRow {
  id: number
  order_number: string
  order_date: string
  delivery_date: string | null
  final_amount: number
  billed_amount: number | null
  billing_status: string | null
  billed_at: string | null
  status: string
  created_at: string
}

export interface PaymentRow {
  id: number
  client_id: number
  payment_date: string
  amount: number
  payment_method: string | null
  reference_number: string | null
  notes: string | null
  created_at: string
  client_name?: string
  created_by_name?: string
}

export interface AdjustmentRow {
  id: number
  client_id: number
  order_id: number | null
  type: string
  amount: number
  reason: string | null
  created_at: string
  created_by_name?: string
}

export interface IntegrityRow {
  id: number
  client_code: string
  client_name: string
  balance: number
  total_billed: number
  total_paid: number
  total_adj: number
}

export interface OrderAggRow { client_id: number; order_count: number; total_sales: number }
export interface PaymentAggRow { client_id: number; total_payments: number }

export interface MonthlyOrderRow { month: string; order_count: number; total_sales: number }
export interface MonthlyPaymentRow { month: string; payment_count: number; total_payments: number }

export interface OverdueClientRow {
  id: number
  client_name: string
  balance: number
  oldest_billed_at: string | null
  overdue_days: number
}

export interface NotifLinkRow { link: string }

export interface CollectionLogRow {
  id: number
  client_id: number
  contact_date: string
  contact_method: string
  contact_person: string | null
  promised_date: string | null
  promised_amount: number | null
  notes: string | null
  result: string | null
  created_by: number | null
  created_at: string
  client_name?: string
  created_by_name?: string
}

export interface ReceivableClientRow {
  id: number
  client_code: string
  client_name: string
  balance: number
  last_payment_date: string | null
  billed_order_count: number
  oldest_unpaid_date: string | null
}

export interface ReceivableOrderRow {
  id: number
  order_number: string
  order_date: string
  delivery_date: string | null
  final_amount: number
  billed_amount: number
  billing_status: string
  billed_at: string | null
  days_since_billed: number | null
}

export interface OverdueAlertRow {
  client_id: number
  client_name: string
  overdue_count: number
  overdue_amount: number
  oldest_billed_at: string | null
  overdue_alert_days: number | null
}

export interface UnpaidOrderRow {
  order_number: string
  billed_amount: number
  order_date: string
}
// 잔액 정합성 집계 쿼리 빌더 (단일 JOIN — N+1 방지)
export function buildIntegrityQuery(c: Context<HonoEnv>): { query: string; params: number[] } {
  // split billing P3: billed 소스 = order_billing_groups(청구 법인 g 기준)
  const { clause: oEf, params: oParams } = entityFilter(c, 'g')
  const { clause: pEf, params: pParams } = entityFilter(c)
  const { clause: aEf, params: aParams } = entityFilter(c)
  const query = `
  SELECT c.id, c.client_code, c.client_name, c.balance,
    COALESCE(o.v, 0) as total_billed,
    COALESCE(p.v, 0) as total_paid,
    COALESCE(a.v, 0) as total_adj
  FROM clients c
  LEFT JOIN (
    SELECT o.client_id, SUM(CASE WHEN g.billing_status = 'BILLED' THEN g.billed_amount ELSE 0 END) as v
    FROM order_billing_groups g JOIN orders o ON o.id = g.order_id WHERE o.status != 'CANCELLED'${oEf} GROUP BY o.client_id
  ) o ON o.client_id = c.id
  LEFT JOIN (
    SELECT client_id, SUM(amount) as v FROM payments WHERE 1=1${pEf} GROUP BY client_id
  ) p ON p.client_id = c.id
  LEFT JOIN (
    SELECT client_id, SUM(amount) as v FROM adjustments WHERE 1=1${aEf} GROUP BY client_id
  ) a ON a.client_id = c.id
  WHERE c.is_active = 1
`
  return { query, params: [...oParams, ...pParams, ...aParams] }
}
// Aging 카테고리 분류 헬퍼
export function getAgingCategory(days: number | null): string {
  if (days === null || days < 0) return 'normal'
  if (days <= 30) return 'normal'
  if (days <= 60) return 'warning'
  if (days <= 90) return 'danger'
  return 'critical'
}
