// 내부 관계사(그룹 법인) 채권·채무 파생 — 2026-07-20
// 주문·청구 기반 내부거래 AR/AP를 법인 페어별로 파생한다. (수동 inter_entity_transactions 장부와 별개)
//   - cron.ts 미러 대사(일 1회 불일치 알림)와 회계허브 법인간거래 탭이 이 파생을 공유(SSOT).
//   - 정의는 ar-receivables(/receivables)·accounts-payable 파생식과 동일 조인·필터.
import type { D1Database } from '@cloudflare/workers-types'
import {
  INTERCOMPANY_ENTITIES,
  INTERCOMPANY_ENTITY_IDS,
  INTERNAL_ENTITY_CLIENT_IDS,
} from '../constants/intercompany'

// 한 방향 포지션: from법인이 to법인(=to거래처)에 대해 가진 매출채권(ar)과, 그 거울인 to법인의 매입채무(ap).
export interface IntercompanyPosition {
  from_entity_id: number
  from_name: string
  from_client_id: number
  to_entity_id: number
  to_name: string
  to_client_id: number
  ar: number          // from청구법인 → to거래처 매출채권 잔액 (billed[BILLED] − payments − adjustments)
  ap: number          // to매입법인 → from공급처 매입채무 잔액 (po[확정] − purchase_payments − purchase_adjustments)
  diff: number        // ar − ap (0 = 대사 일치)
  reconciled: boolean // |diff| <= 1
}

// (entity_id, key) → 합계 사전집계. GROUP BY 2컬럼 → Map('e:k' → sum).
async function aggMap(db: D1Database, sql: string, binds: number[]): Promise<Map<string, number>> {
  const { results } = await db.prepare(sql).bind(...binds).all<{ e: number; k: number; v: number }>()
  const m = new Map<string, number>()
  for (const r of results || []) m.set(`${r.e}:${r.k}`, Number(r.v) || 0)
  return m
}

/**
 * 내부 관계사 전 방향(3법인 → 6방향) 주문·매입 기반 채권·채무 포지션 파생.
 * 세션 법인 필터를 걸지 않는다(내부거래는 본질적으로 법인 교차) — 가시성 제한은 호출부(엔드포인트)에서.
 */
export async function deriveIntercompanyPositions(db: D1Database): Promise<IntercompanyPosition[]> {
  const entityIds = INTERCOMPANY_ENTITY_IDS   // [1,2,3]
  const clientIds = INTERNAL_ENTITY_CLIENT_IDS // [53,1271,3757]
  const eqs = entityIds.map(() => '?').join(',')
  const cqs = clientIds.map(() => '?').join(',')
  const ecBinds = [...entityIds, ...clientIds]

  // AR 3소스(청구법인 g.entity_id × 거래처 o.client_id) — /receivables 파생식과 동일 조인·필터.
  const billed = await aggMap(db,
    `SELECT g.entity_id e, o.client_id k, COALESCE(SUM(g.billed_amount),0) v
     FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
     WHERE g.billing_status='BILLED' AND o.status!='CANCELLED'
       AND g.entity_id IN (${eqs}) AND o.client_id IN (${cqs})
     GROUP BY g.entity_id, o.client_id`, ecBinds)
  const arPaid = await aggMap(db,
    `SELECT entity_id e, client_id k, COALESCE(SUM(amount),0) v FROM payments
     WHERE entity_id IN (${eqs}) AND client_id IN (${cqs}) GROUP BY entity_id, client_id`, ecBinds)
  const arAdj = await aggMap(db,
    `SELECT entity_id e, client_id k, COALESCE(SUM(amount),0) v FROM adjustments
     WHERE entity_id IN (${eqs}) AND client_id IN (${cqs}) GROUP BY entity_id, client_id`, ecBinds)

  // AP 3소스(매입법인 entity_id × 공급처 supplier_id). PO는 확정 이후(DRAFT/CANCELLED 제외)만 채무.
  const po = await aggMap(db,
    `SELECT entity_id e, supplier_id k, COALESCE(SUM(final_amount),0) v FROM purchase_orders
     WHERE status NOT IN ('DRAFT','CANCELLED') AND entity_id IN (${eqs}) AND supplier_id IN (${cqs})
     GROUP BY entity_id, supplier_id`, ecBinds)
  const apPaid = await aggMap(db,
    `SELECT entity_id e, supplier_id k, COALESCE(SUM(amount),0) v FROM purchase_payments
     WHERE entity_id IN (${eqs}) AND supplier_id IN (${cqs}) GROUP BY entity_id, supplier_id`, ecBinds)
  const apAdj = await aggMap(db,
    `SELECT entity_id e, supplier_id k, COALESCE(SUM(amount),0) v FROM purchase_adjustments
     WHERE entity_id IN (${eqs}) AND supplier_id IN (${cqs}) GROUP BY entity_id, supplier_id`, ecBinds)

  const positions: IntercompanyPosition[] = []
  for (const A of INTERCOMPANY_ENTITIES) {
    for (const B of INTERCOMPANY_ENTITIES) {
      if (A.entityId === B.entityId) continue
      // A의 매출채권(B거래처): 청구법인=A, 거래처=B
      const ar = (billed.get(`${A.entityId}:${B.clientId}`) || 0)
               - (arPaid.get(`${A.entityId}:${B.clientId}`) || 0)
               - (arAdj.get(`${A.entityId}:${B.clientId}`) || 0)
      // B의 매입채무(A공급처): 매입법인=B, 공급처=A
      const ap = (po.get(`${B.entityId}:${A.clientId}`) || 0)
               - (apPaid.get(`${B.entityId}:${A.clientId}`) || 0)
               - (apAdj.get(`${B.entityId}:${A.clientId}`) || 0)
      const diff = ar - ap
      positions.push({
        from_entity_id: A.entityId, from_name: A.name, from_client_id: A.clientId,
        to_entity_id: B.entityId, to_name: B.name, to_client_id: B.clientId,
        ar, ap, diff, reconciled: Math.abs(diff) <= 1,
      })
    }
  }
  return positions
}

// 드릴다운: from법인이 to거래처에 청구한 BILLED 주문 목록(매출채권 구성 내역).
export interface IntercompanyArOrder {
  order_id: number
  order_number: string
  order_date: string | null
  billed_at: string | null
  billed_amount: number
  status: string
}

export async function getIntercompanyArOrders(
  db: D1Database, fromEntityId: number, toClientId: number
): Promise<IntercompanyArOrder[]> {
  const { results } = await db.prepare(`
    SELECT o.id AS order_id, o.order_number, o.order_date,
           COALESCE(g.accounting_date, g.billed_at) AS billed_at,
           COALESCE(g.billed_amount, 0) AS billed_amount, o.status
    FROM order_billing_groups g JOIN orders o ON o.id = g.order_id
    WHERE g.billing_status='BILLED' AND o.status!='CANCELLED'
      AND g.entity_id = ? AND o.client_id = ?
    ORDER BY COALESCE(g.accounting_date, g.billed_at) DESC, g.id DESC
    LIMIT 500
  `).bind(fromEntityId, toClientId).all<IntercompanyArOrder>()
  return (results || []).map(r => ({ ...r, billed_amount: Number(r.billed_amount) || 0 }))
}
