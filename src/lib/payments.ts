// ============================================================================
// 공유 입금 생성 함수
// ledger.ts POST /payment 와 bank.ts POST /transactions/:id/apply 에서 공용 사용
// ============================================================================

import type { D1Database } from '@cloudflare/workers-types'

export interface PaymentInput {
  client_id: number
  payment_date: string
  amount: number
  payment_method?: string
  reference_number?: string
  notes?: string
  created_by: number
  entity_id?: number
}

export interface PaymentResult {
  payment_id: number
  new_balance: number
}

/**
 * 입금 사전 검증 (읽기 전용) — batch 처리 전 호출
 * client 존재 확인 + 중복 결제 방지
 */
export async function validatePayment(
  db: D1Database,
  data: PaymentInput
): Promise<{ client: { id: number; balance: number }; newBalance: number }> {
  const client = await db.prepare(
    'SELECT id, balance FROM clients WHERE id = ?'
  ).bind(data.client_id).first<{ id: number; balance: number | null }>()

  if (!client) {
    throw new Error(`Client not found: id=${data.client_id}`)
  }

  const recent = await db.prepare(
    `SELECT id FROM payments
     WHERE client_id = ? AND amount = ? AND payment_date = ?
     AND created_at >= datetime('now', '-1 minute')`
  ).bind(data.client_id, data.amount, data.payment_date).first()
  if (recent) {
    throw new Error('DUPLICATE_PAYMENT: 1분 이내 동일한 결제가 이미 등록되었습니다.')
  }

  const newBalance = (Number(client.balance) || 0) - data.amount
  return { client: { id: client.id, balance: Number(client.balance) || 0 }, newBalance }
}

/**
 * 입금 쓰기용 prepared statements 반환 (batch에 포함 가능)
 */
export function preparePaymentStatements(
  db: D1Database,
  data: PaymentInput,
  newBalance: number
): D1PreparedStatement[] {
  return [
    db.prepare(`
      INSERT INTO payments (
        client_id, payment_date, amount, payment_method,
        reference_number, notes, created_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.client_id,
      data.payment_date,
      data.amount,
      data.payment_method ?? null,
      data.reference_number ?? null,
      data.notes ?? null,
      data.created_by,
      data.entity_id ?? 1
    ),
    // split billing P3: clients.balance 캐시 미사용 — 미수금은 order_billing_groups[BILLED] 파생.
  ]
}

/**
 * 입금을 생성하고 거래처 잔액을 차감한다 (기존 호환 API).
 * 내부적으로 validatePayment + preparePaymentStatements + batch 실행.
 */
export async function createPayment(
  db: D1Database,
  data: PaymentInput
): Promise<PaymentResult> {
  const { newBalance } = await validatePayment(db, data)
  const stmts = preparePaymentStatements(db, data, newBalance)
  const results = await db.batch(stmts)

  const paymentId = results[0].meta.last_row_id

  return {
    payment_id: paymentId,
    new_balance: newBalance,
  }
}
