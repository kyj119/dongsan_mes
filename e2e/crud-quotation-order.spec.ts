/**
 * 견적서 → 주문 변환 E2E — entity_id=99 격리
 *
 * 시나리오:
 *   1. 테스트 거래처 생성
 *   2. 견적서 생성 (POST /api/quotations)
 *   3. 견적서 상세 조회 (GET /api/quotations/:id)
 *   4. 견적서 → 주문 변환 (POST /api/quotations/:id/convert-to-order)
 *   5. 변환된 주문 확인 (quotation_id FK, 품목 복사)
 *   6. Cleanup (주문 취소 → 견적서 취소 → 거래처 삭제)
 */
import { test, expect, WriteApiContext } from './fixtures'

const PREFIX = `E2E_QO_${Date.now()}`

test.describe.serial('견적서 → 주문 변환', () => {
  let clientId: number
  let quotationId: number
  let orderId: number

  test('테스트 거래처 생성', async ({ writeApi }) => {
    const res = await writeApi.post('/api/clients', {
      client_name: `${PREFIX}_Client`,
      client_type: 'SALES',
    })
    expect(res.success).toBe(true)
    clientId = res.data.id
  })

  test('견적서 생성', async ({ writeApi }) => {
    const res = await writeApi.post('/api/quotations', {
      client_id: clientId,
      delivery_date: '2099-12-31',
      notes: 'E2E test quotation',
      items: [
        {
          item_name: `${PREFIX}_현수막`,
          width: 1000,
          height: 500,
          quantity: 10,
          unit_price: 5000,
        },
        {
          item_name: `${PREFIX}_배너`,
          width: 600,
          height: 1800,
          quantity: 5,
          unit_price: 15000,
        },
      ],
    })

    expect(res.success).toBe(true)
    expect(res.data.quotation_number).toMatch(/^Q-/)
    quotationId = res.data.id
  })

  test('견적서 상세 조회', async ({ writeApi }) => {
    const res = await writeApi.get(`/api/quotations/${quotationId}`)

    expect(res.success).toBe(true)
    expect(res.data.client_id).toBe(clientId)
    expect(res.data.status).toBe('ACTIVE')
    expect(res.data.items).toHaveLength(2)
    expect(res.data.items[0].item_name).toContain(PREFIX)
  })

  test('견적서 → 주문 변환', async ({ writeApi }) => {
    const res = await writeApi.post(`/api/quotations/${quotationId}/convert-to-order`)

    expect(res.success).toBe(true)
    expect(res.data.order_id).toBeGreaterThan(0)
    expect(res.data.order_number).toBeDefined()
    orderId = res.data.order_id
  })

  test('변환된 주문 확인', async ({ writeApi }) => {
    // 주문에 quotation_id FK 연결 확인
    const orderRes = await writeApi.get(`/api/orders/${orderId}`)
    expect(orderRes.success).toBe(true)
    expect(orderRes.data.quotation_id).toBe(quotationId)
    expect(orderRes.data.client_id).toBe(clientId)
    expect(orderRes.data.status).toBe('CONFIRMED')

    // 품목 복사 확인
    const items = orderRes.data.items || orderRes.data.order_items
    expect(items).toBeDefined()
    expect(items.length).toBe(2)

    // 견적서 converted_count 증가 확인
    const quotRes = await writeApi.get(`/api/quotations/${quotationId}`)
    expect(quotRes.data.converted_count).toBeGreaterThanOrEqual(1)
  })

  test('Cleanup: 주문 취소 → 견적서 취소 → 거래처 삭제', async ({ writeApi }) => {
    // 주문 취소
    if (orderId) {
      const cancelOrder = await writeApi.patch(`/api/orders/${orderId}/cancel`, {
        reason: 'E2E cleanup',
      })
      // cancel이 없으면 status 변경 시도
      if (!cancelOrder.success) {
        await writeApi.patch(`/api/orders/${orderId}/status`, { status: 'CANCELLED' })
      }
    }

    // 견적서 취소
    if (quotationId) {
      await writeApi.del(`/api/quotations/${quotationId}`)
    }

    // 거래처 삭제 — 주문이 있으면 soft delete 실패할 수 있음
    if (clientId) {
      await writeApi.del(`/api/clients/${clientId}`)
    }
  })
})
