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
 * 입금을 생성하고 거래처 잔액을 차감한다.
 * - client 존재 확인
 * - payments 테이블 INSERT
 * - clients.balance -= amount
 */
export async function createPayment(
  db: D1Database,
  data: PaymentInput
): Promise<PaymentResult> {
  // 1. client 존재 확인
  const client = await db.prepare(
    'SELECT id, balance FROM clients WHERE id = ?'
  ).bind(data.client_id).first<{ id: number; balance: number | null }>()

  if (!client) {
    throw new Error(`Client not found: id=${data.client_id}`)
  }

  // 1.5 중복 결제 방지: 동일 거래처+금액+날짜가 1분 이내 존재하면 거부
  const recent = await db.prepare(
    `SELECT id FROM payments
     WHERE client_id = ? AND amount = ? AND payment_date = ?
     AND created_at >= datetime('now', '-1 minute')`
  ).bind(data.client_id, data.amount, data.payment_date).first()
  if (recent) {
    throw new Error('DUPLICATE_PAYMENT: 1분 이내 동일한 결제가 이미 등록되었습니다.')
  }

  // 2. INSERT INTO payments
  const result = await db.prepare(`
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
  ).run()

  const paymentId = result.meta.last_row_id

  // 3. UPDATE clients.balance (잔액 차감)
  const newBalance = (Number(client.balance) || 0) - data.amount
  await db.prepare(
    'UPDATE clients SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(newBalance, data.client_id).run()

  // 4. 결과 반환
  return {
    payment_id: paymentId,
    new_balance: newBalance,
  }
}
