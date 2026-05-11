/**
 * 거래처 CRUD E2E — entity_id=99 격리
 *
 * 시나리오:
 *   1. 거래처 생성 (POST /api/clients)
 *   2. 거래처 조회 (GET /api/clients/:id)
 *   3. 거래처 수정 (PUT /api/clients/:id)
 *   4. 거래처 삭제 (DELETE /api/clients/:id — soft delete)
 *
 * clients 테이블은 entity_id 없는 공통 마스터이므로
 * E2E_ prefix + afterAll cleanup으로 격리.
 */
import { test, expect } from './fixtures'

const CLIENT_NAME = `E2E_Client_${Date.now()}`

test.describe.serial('거래처 CRUD', () => {
  let clientId: number

  test('거래처 생성', async ({ writeApi }) => {
    const res = await writeApi.post('/api/clients', {
      client_name: CLIENT_NAME,
      client_type: 'SALES',
      representative: 'E2E Bot',
      phone: '000-0000-0000',
      address: 'E2E Test Address',
    })

    expect(res.success).toBe(true)
    expect(res.data.id).toBeGreaterThan(0)
    clientId = res.data.id
  })

  test('거래처 조회', async ({ writeApi }) => {
    expect(clientId).toBeDefined()
    const res = await writeApi.get(`/api/clients/${clientId}`)

    expect(res.success).toBe(true)
    expect(res.data.client_name).toBe(CLIENT_NAME)
    expect(res.data.representative).toBe('E2E Bot')
    expect(res.data.client_type).toBe('SALES')
    // client_code 자동 채번 확인
    expect(res.data.client_code).toMatch(/^S-\d{4}$/)
  })

  test('거래처 수정', async ({ writeApi }) => {
    expect(clientId).toBeDefined()
    const updatedName = CLIENT_NAME + '_Updated'
    const res = await writeApi.patch(`/api/clients/${clientId}`, {
      client_name: updatedName,
      representative: 'E2E Bot v2',
      mobile: '010-0000-0000',
    })

    expect(res.success).toBe(true)

    // 변경 확인
    const check = await writeApi.get(`/api/clients/${clientId}`)
    expect(check.data.client_name).toBe(updatedName)
    expect(check.data.representative).toBe('E2E Bot v2')
    expect(check.data.mobile).toBe('010-0000-0000')
  })

  test('거래처 삭제 (soft delete)', async ({ writeApi }) => {
    expect(clientId).toBeDefined()
    const res = await writeApi.del(`/api/clients/${clientId}`)

    expect(res.success).toBe(true)

    // 비활성화 확인
    const check = await writeApi.get(`/api/clients/${clientId}`)
    expect(check.data.is_active).toBe(0)
  })
})
