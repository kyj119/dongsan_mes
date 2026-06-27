// ============================================================================
// QR/바코드 스캔 API (#80)
// 코드 체계: CARD:CARD-20260516-001, ITEM:PM-5001, EQ:EQ-001
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { getItemDefaultZone } from '../utils/inventoryZone'

const scanRouter = new Hono<HonoEnv>()
scanRouter.use('/*', authMiddleware)

interface ScanResult {
  type: 'CARD' | 'ITEM' | 'EQUIPMENT' | 'ORDER' | 'UNKNOWN'
  id: number | null
  label: string
  detail: Record<string, any>
  actions: { key: string; label: string; icon: string }[]
}

// GET /api/scan/:code — 코드 파싱 → 대상 상세 반환
scanRouter.get('/:code', async (c) => {
  const raw = decodeURIComponent(c.req.param('code'))
  const ef = entityFilter(c)

  // 코드 파싱: PREFIX:VALUE 또는 raw value
  let prefix = ''
  let value = raw
  const colonIdx = raw.indexOf(':')
  if (colonIdx > 0) {
    prefix = raw.substring(0, colonIdx).toUpperCase()
    value = raw.substring(colonIdx + 1)
  }

  try {
    let result: ScanResult | null = null

    // 1) CARD prefix 또는 CARD- 패턴
    if (prefix === 'CARD' || value.startsWith('CARD-')) {
      const cardNum = prefix === 'CARD' ? value : value
      // #170: entity 필터 추가
      const cardEf = entityFilter(c, 'c')
      const card = await c.env.DB.prepare(`
        SELECT c.id, c.card_number, c.status, c.order_id,
               o.order_number, c.client_name,
               c.quantity, c.shipped_at, c.created_at, c.item_name
        FROM cards c
        LEFT JOIN orders o ON c.order_id = o.id
        WHERE c.card_number = ?${cardEf.clause}
      `).bind(cardNum, ...cardEf.params).first<any>()

      if (card) {
        const actions: ScanResult['actions'] = []
        if (!card.shipped_at && card.status === 'PRINT_DONE') {
          actions.push({ key: 'ship', label: '출고 처리', icon: 'fa-truck' })
        }
        if (card.status === 'PRINT_PENDING') {
          actions.push({ key: 'start-print', label: '출력 시작', icon: 'fa-print' })
        }
        actions.push({ key: 'detail', label: '상세 보기', icon: 'fa-eye' })

        result = {
          type: 'CARD',
          id: card.id,
          label: `카드 ${card.card_number}`,
          detail: {
            card_number: card.card_number,
            status: card.status,
            order_number: card.order_number,
            client_name: card.client_name,
            item_name: card.item_name,
            quantity: card.quantity,
            shipped_at: card.shipped_at,
            created_at: card.created_at,
          },
          actions,
        }
      }
    }

    // 2) ITEM prefix 또는 PM-/BN-/XB- 등 품목코드 패턴
    if (!result && (prefix === 'ITEM' || /^[A-Z]{2,3}-\d/.test(value))) {
      const itemCode = prefix === 'ITEM' ? value : value
      const item = await c.env.DB.prepare(`
        SELECT id, item_code, item_name, item_type, item_group,
               unit, base_price, sales_price, specification
        FROM items
        WHERE item_code = ?
      `).bind(itemCode).first<any>()

      if (item) {
        const actions: ScanResult['actions'] = []
        actions.push({ key: 'detail', label: '상세 보기', icon: 'fa-eye' })

        result = {
          type: 'ITEM',
          id: item.id,
          label: `${item.item_name} (${item.item_code})`,
          detail: {
            item_code: item.item_code,
            item_name: item.item_name,
            item_type: item.item_type,
            item_group: item.item_group,
            unit: item.unit,
            specification: item.specification,
            base_price: item.base_price,
            sales_price: item.sales_price,
          },
          actions,
        }
      }
    }

    // 3) EQ prefix 또는 EQ- 패턴
    if (!result && (prefix === 'EQ' || value.startsWith('EQ-'))) {
      const eqCode = prefix === 'EQ' ? value : value
      // #425: equipment 테이블엔 equipment_type/location/manufacturer 컬럼 없음.
      // 실제 컬럼(printer_name·location_zone)으로 매핑, 부재 필드는 프론트가 null 스킵.
      const eq = await c.env.DB.prepare(`
        SELECT id, name, printer_name, status, location_zone
        FROM equipment
        WHERE name = ? OR id = ?
      `).bind(eqCode, parseInt(eqCode.replace('EQ-', '')) || 0).first<any>()

      if (eq) {
        result = {
          type: 'EQUIPMENT',
          id: eq.id,
          label: `장비: ${eq.name}`,
          detail: {
            name: eq.name,
            equipment_type: eq.printer_name,   // DB에 equipment_type 없음 → 프린터명
            status: eq.status,
            location: eq.location_zone,         // location → location_zone
          },
          actions: [
            { key: 'maintenance', label: '정비 기록', icon: 'fa-wrench' },
            { key: 'detail', label: '상세 보기', icon: 'fa-eye' },
          ],
        }
      }
    }

    // 4) ORDER prefix 또는 주문번호 패턴
    if (!result && (prefix === 'ORDER' || /^\d{8}-\d{3}/.test(value))) {
      const orderNum = prefix === 'ORDER' ? value : value
      const order = await c.env.DB.prepare(`
        SELECT o.id, o.order_number, o.status, o.order_date,
               cl.client_name, o.total_amount
        FROM orders o
        LEFT JOIN clients cl ON o.client_id = cl.id
        WHERE o.order_number = ?${ef.clause}
      `).bind(orderNum, ...ef.params).first<any>()

      if (order) {
        result = {
          type: 'ORDER',
          id: order.id,
          label: `주문 ${order.order_number}`,
          detail: {
            order_number: order.order_number,
            status: order.status,
            order_date: order.order_date,
            client_name: order.client_name,
            total_amount: order.total_amount,
          },
          actions: [
            { key: 'detail', label: '상세 보기', icon: 'fa-eye' },
          ],
        }
      }
    }

    if (!result) {
      return c.json({
        success: false,
        error: `코드를 인식할 수 없습니다: ${raw}`,
      }, 404)
    }

    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('Scan lookup error:', error)
    return c.json({ success: false, error: '스캔 조회 중 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/scan/action — 스캔 후 액션 수행
scanRouter.post('/action', async (c) => {
  const body = await c.req.json() as {
    type: string
    id: number
    action: string
    quantity?: number
    notes?: string
  }

  if (!body.type || !body.id || !body.action) {
    return c.json({ success: false, error: 'type, id, action 필수' }, 400)
  }

  const user = c.get('user')

  try {
    switch (`${body.type}:${body.action}`) {
      case 'CARD:ship': {
        // 카드 출고 처리
        await c.env.DB.prepare(`
          UPDATE cards SET shipped_at = CURRENT_TIMESTAMP
          WHERE id = ? AND shipped_at IS NULL
        `).bind(body.id).run()
        return c.json({ success: true, message: '출고 처리되었습니다.' })
      }

      case 'CARD:start-print': {
        await c.env.DB.prepare(`
          UPDATE cards SET status = 'PRINTING', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'PRINT_PENDING'
        `).bind(body.id).run()
        return c.json({ success: true, message: '출력이 시작되었습니다.' })
      }

      case 'ITEM:stock-in': {
        if (!body.quantity || body.quantity <= 0) {
          return c.json({ success: false, error: '수량을 입력하세요.' }, 400)
        }
        const entityId = getEntityId(c) || 1
        // UP1: 창고별 다중행. 입고 대상 창고 = 품목 기본창고 (NULL=미배정). 0396 UNIQUE=(item,entity,IFNULL(zone,0)).
        const zoneId = await getItemDefaultZone(c.env.DB, body.id)
        // #412 + #169 + #289: 재고는 inventory.quantity (items에 current_stock 컬럼 없음).
        // upsert(행 부재 대비) + 감사 기록을 단일 batch로 원자 처리. balance_after는 upsert 후 잔량 서브쿼리.
        await c.env.DB.batch([
          c.env.DB.prepare(`
            INSERT INTO inventory (item_id, quantity, entity_id, storage_zone_id, last_updated)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(item_id, entity_id, IFNULL(storage_zone_id, 0)) DO UPDATE SET quantity = quantity + excluded.quantity, last_updated = CURRENT_TIMESTAMP
          `).bind(body.id, body.quantity, entityId, zoneId),
          c.env.DB.prepare(`
            INSERT INTO inventory_transactions
            (item_id, transaction_type, transaction_date, quantity, reference_type, balance_after, reason, handled_by, entity_id, storage_zone_id)
            VALUES (?, 'IN', DATE('now'), ?, 'SCAN', (SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)), ?, ?, ?, ?)
          `).bind(body.id, body.quantity, body.id, entityId, zoneId,
            body.notes || '스캔 입고', user?.id || 1, entityId, zoneId)
        ])

        return c.json({ success: true, message: `${body.quantity}개 입고 처리되었습니다.` })
      }

      case 'ITEM:stock-out': {
        if (!body.quantity || body.quantity <= 0) {
          return c.json({ success: false, error: '수량을 입력하세요.' }, 400)
        }
        const entityId2 = getEntityId(c) || 1
        // 차감 대상 창고 = 품목 기본창고 (NULL=미배정). 창고별 다중행.
        // UP2 제외: 수동 스캔 출고는 스캔 위치/장비를 캡처하지 않음 → 품목 기본창고가 정확.
        const zoneId2 = await getItemDefaultZone(c.env.DB, body.id)
        // #412 + #164: inventory.quantity 차감 (atomic UPDATE WHERE, 부족/행부재 시 changes=0 → 재고부족)
        const result = await c.env.DB.prepare(`
          UPDATE inventory SET quantity = quantity - ?, last_updated = CURRENT_TIMESTAMP
          WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0) AND quantity >= ?
        `).bind(body.quantity, body.id, entityId2, zoneId2, body.quantity).run()

        if (!result.meta.changes || result.meta.changes === 0) {
          return c.json({ success: false, error: '재고가 부족합니다.' }, 400)
        }

        // #169 + #289: 감사 기록 — balance_after를 서브쿼리로 (중간 SELECT 제거, race 차단)
        await c.env.DB.prepare(`
          INSERT INTO inventory_transactions
          (item_id, transaction_type, transaction_date, quantity, reference_type, balance_after, reason, handled_by, entity_id, storage_zone_id)
          VALUES (?, 'OUT', DATE('now'), ?, 'SCAN', (SELECT quantity FROM inventory WHERE item_id = ? AND entity_id = ? AND IFNULL(storage_zone_id, 0) = IFNULL(?, 0)), ?, ?, ?, ?)
        `).bind(body.id, body.quantity, body.id, entityId2, zoneId2,
          body.notes || '스캔 출고', user?.id || 1, entityId2, zoneId2).run()

        return c.json({ success: true, message: `${body.quantity}개 출고 처리되었습니다.` })
      }

      default:
        return c.json({ success: false, error: `지원하지 않는 액션: ${body.action}` }, 400)
    }
  } catch (error) {
    console.error('Scan action error:', error)
    return c.json({ success: false, error: '액션 수행 중 오류가 발생했습니다.' }, 500)
  }
})

export default scanRouter
