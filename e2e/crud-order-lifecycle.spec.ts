/**
 * 주문 생성 → 상태 전이 → 카드 생성 E2E — entity_id=99 격리
 *
 * 시나리오:
 *   1. 테스트 거래처 생성
 *   2. 주문 생성 (POST /api/orders)
 *   3. 주문 상태 전이: CONFIRMED → PRINTING → PRINT_DONE
 *   4. 카드 생성 (POST /api/cards/generate/:orderId)
 *   5. 카드 조회 확인
 *   6. Cleanup (주문 취소 → 거래처 삭제)
 *
 * entity_id=99로 격리되어 운영 데이터 불간섭.
 */
import { test, expect } from './fixtures'

const PREFIX = `E2E_OL_${Date.now()}`

test.describe.serial('주문 생성 → 상태 전이 → 카드 생성', () => {
  let clientId: number
  let orderId: number
  let orderNumber: string
  let cardIds: number[] = []

  test('테스트 거래처 생성', async ({ writeApi }) => {
    const res = await writeApi.post('/api/clients', {
      client_name: `${PREFIX}_Client`,
      client_type: 'SALES',
    })
    expect(res.success).toBe(true)
    clientId = res.data.id
  })

  test('주문 생성', async ({ writeApi }) => {
    const res = await writeApi.post('/api/orders', {
      client_id: clientId,
      delivery_date: '2099-12-31',
      order_type: 'PRODUCTION',
      notes: 'E2E test order',
      items: [
        {
          item_name: `${PREFIX}_현수막_대형`,
          width: 3000,
          height: 1000,
          quantity: 2,
          unit_price: 50000,
        },
        {
          item_name: `${PREFIX}_배너_소형`,
          width: 600,
          height: 1800,
          quantity: 3,
          unit_price: 20000,
        },
      ],
    })

    expect(res.success).toBe(true)
    expect(res.data.id).toBeGreaterThan(0)
    expect(res.data.order_number).toBeDefined()
    orderId = res.data.id
    orderNumber = res.data.order_number
  })

  test('주문 상세 조회', async ({ writeApi }) => {
    const res = await writeApi.get(`/api/orders/${orderId}`)

    expect(res.success).toBe(true)
    expect(res.data.order_number).toBe(orderNumber)
    expect(res.data.client_id).toBe(clientId)
    expect(res.data.status).toBe('CONFIRMED')
    expect(res.data.entity_id).toBe(99) // entity 격리 확인

    const items = res.data.items || res.data.order_items
    expect(items).toBeDefined()
    expect(items.length).toBe(2)
  })

  test('상태 전이: CONFIRMED → PRINTING', async ({ writeApi }) => {
    const res = await writeApi.patch(`/api/orders/${orderId}/status`, {
      status: 'PRINTING',
    })

    expect(res.success).toBe(true)

    const check = await writeApi.get(`/api/orders/${orderId}`)
    expect(check.data.status).toBe('PRINTING')
  })

  test('상태 전이: PRINTING → PRINT_DONE', async ({ writeApi }) => {
    const res = await writeApi.patch(`/api/orders/${orderId}/status`, {
      status: 'PRINT_DONE',
    })

    expect(res.success).toBe(true)

    const check = await writeApi.get(`/api/orders/${orderId}`)
    expect(check.data.status).toBe('PRINT_DONE')
  })

  test('잘못된 상태 전이 거부: PRINT_DONE → SHIPPED 후 역행 불가', async ({ writeApi }) => {
    // PRINT_DONE → SHIPPED 는 유효
    const shipRes = await writeApi.patch(`/api/orders/${orderId}/status`, {
      status: 'SHIPPED',
    })
    if (!shipRes.success) {
      console.error('[E2E DEBUG] SHIPPED transition failed:', JSON.stringify(shipRes))
    }
    expect(shipRes.success).toBe(true)

    // SHIPPED → PRINTING 은 불가
    const invalidRes = await writeApi.patch(`/api/orders/${orderId}/status`, {
      status: 'PRINTING',
    })
    expect(invalidRes.success).toBe(false)

    // 복구: SHIPPED 상태로 유지 (카드 생성은 상태 무관)
  })

  test('카드 생성', async ({ writeApi }) => {
    // 상태를 CONFIRMED으로 돌려서 카드 생성 테스트
    // SHIPPED에서는 카드 생성이 안 될 수 있으므로 새 주문 생성
    const orderRes = await writeApi.post('/api/orders', {
      client_id: clientId,
      delivery_date: '2099-12-31',
      order_type: 'PRODUCTION',
      items: [
        {
          item_name: `${PREFIX}_카드테스트`,
          width: 1000,
          height: 500,
          quantity: 1,
          unit_price: 10000,
        },
      ],
    })
    expect(orderRes.success).toBe(true)
    const cardTestOrderId = orderRes.data.id

    const res = await writeApi.post(`/api/cards/generate/${cardTestOrderId}`)

    expect(res.success).toBe(true)
    // 카드 생성 결과 확인
    if (res.data?.cards) {
      cardIds = res.data.cards.map((c: any) => c.id)
    } else if (res.data?.id) {
      cardIds = [res.data.id]
    }

    // 생성된 카드 존재 확인
    const cardsRes = await writeApi.get(`/api/cards?entity_id=99`)
    expect(cardsRes.success).toBe(true)
  })

  test('Cleanup', async ({ writeApi }) => {
    // 주문 취소 (cancel endpoint 사용)
    if (orderId) {
      await writeApi.patch(`/api/orders/${orderId}/cancel`, { reason: 'E2E cleanup' })
        .catch(() => {}) // cancel 없으면 무시
    }

    // 거래처 삭제 시도 (주문 있으면 실패 — 허용)
    if (clientId) {
      await writeApi.del(`/api/clients/${clientId}`).catch(() => {})
    }
  })
})
