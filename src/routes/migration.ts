import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { getEntityId } from '../utils/entityFilter'
import { getNextEntitySeqNumber } from '../utils/sequenceGenerator'

const migrationRouter = new Hono<HonoEnv>()

// 전체 ADMIN 전용
migrationRouter.use('/*', authMiddleware, requireRole('ADMIN'))

/**
 * 적재 법인 결정 — 세션 법인이 정본이다.
 *
 * 이전에는 body 의 `entity_id || 1` 을 그대로 썼다. 그러면 법인 2 세션에서 법인 1 로 매출·입금을
 * 적재할 수 있고, `migration_logs` 에는 세션 법인이 남아 **로그와 실제 적재 법인이 어긋난다**.
 * 전체모드(0)에서는 세션에 귀속 법인이 없으므로 그때만 body 값을 받는다(미지정이면 400).
 */
function resolveImportEntity(c: any, bodyEntityId?: number): { entityId: number } | { error: string } {
  const sessionEntity = getEntityId(c)
  const bodyId = bodyEntityId != null ? Number(bodyEntityId) : null
  if (sessionEntity === 0) {
    if (!bodyId || !Number.isFinite(bodyId)) {
      return { error: '전체 모드에서는 적재할 법인(entity_id)을 지정해야 합니다. 상단에서 법인을 선택하세요.' }
    }
    return { entityId: bodyId }
  }
  if (bodyId != null && Number.isFinite(bodyId) && bodyId !== sessionEntity) {
    return { error: `선택된 법인(${sessionEntity})과 요청 법인(${bodyId})이 다릅니다. 상단에서 적재할 법인으로 전환하세요.` }
  }
  return { entityId: sessionEntity }
}

// ============================================================
// 이관 로그 조회
// ============================================================
migrationRouter.get('/logs', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT ml.*, u.name as created_by_name
      FROM migration_logs ml
      LEFT JOIN users u ON u.id = ml.created_by
      ORDER BY ml.created_at DESC, ml.id DESC
      LIMIT 50
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('migration logs error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 거래처 Import
// ============================================================
migrationRouter.post('/clients/preview', async (c) => {
  try {
    const { clients } = await c.req.json() as { clients: any[] }
    if (!Array.isArray(clients) || clients.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const preview: any[] = []

    for (const row of clients.slice(0, 100)) {
      const existing = row.client_code
        ? await db.prepare('SELECT id, client_name, balance FROM clients WHERE client_code = ?').bind(row.client_code).first()
        : null

      preview.push({
        ...row,
        _match: existing ? 'UPDATE' : 'INSERT',
        _existing_name: existing ? (existing as any).client_name : null,
        _existing_balance: existing ? (existing as any).balance : null,
      })
    }

    return c.json({
      success: true,
      data: {
        total: clients.length,
        preview_count: preview.length,
        inserts: preview.filter(p => p._match === 'INSERT').length,
        updates: preview.filter(p => p._match === 'UPDATE').length,
        preview,
      }
    })
  } catch (error) {
    console.error('clients preview error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

migrationRouter.post('/clients/import', async (c) => {
  try {
    const user = c.get('user')
    const { clients } = await c.req.json() as { clients: any[] }
    if (!Array.isArray(clients) || clients.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB

    // 이관 로그 생성
    const logResult = await db.prepare(`
      INSERT INTO migration_logs (migration_type, status, total_rows, started_at, created_by, entity_id)
      VALUES ('clients', 'RUNNING', ?, CURRENT_TIMESTAMP, ?, ?)
    `).bind(clients.length, user?.id || null, getEntityId(c) || 1).run()
    const logId = logResult.meta.last_row_id

    let imported = 0, skipped = 0, errorCount = 0
    const errors: string[] = []

    for (const row of clients) {
      try {
        if (!row.client_code || !row.client_name) {
          skipped++
          errors.push(`건너뜀: client_code 또는 client_name 누락`)
          continue
        }

        const existing = await db.prepare(
          'SELECT id FROM clients WHERE client_code = ?'
        ).bind(row.client_code).first()

        if (existing) {
          await db.prepare(`
            UPDATE clients SET
              client_name = ?, representative = ?, business_type = ?, business_item = ?,
              phone = ?, mobile = ?, fax = ?, email = ?, address = ?,
              business_registration_number = ?, search_keywords = ?, transfer_info = ?,
              credit_limit = CASE WHEN ? > 0 THEN ? ELSE credit_limit END,
              updated_at = CURRENT_TIMESTAMP
            WHERE client_code = ?
          `).bind(
            row.client_name, row.representative || null,
            row.business_type || null, row.business_item || null,
            row.phone || null, row.mobile || null, row.fax || null,
            row.email || null, row.address || null,
            row.business_registration_number || null,
            row.search_keywords || null, row.transfer_info || null,
            row.credit_limit || 0, row.credit_limit || 0,
            row.client_code
          ).run()
        } else {
          await db.prepare(`
            INSERT INTO clients (client_code, client_name, representative, business_type, business_item,
              phone, mobile, fax, email, address, business_registration_number, search_keywords, transfer_info,
              credit_limit, is_active, delivery_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            row.client_code, row.client_name,
            row.representative || null, row.business_type || null,
            row.business_item || null, row.phone || null, row.mobile || null,
            row.fax || null, row.email || null, row.address || null,
            row.business_registration_number || null,
            row.search_keywords || null, row.transfer_info || null,
            row.credit_limit || 0,
            row.is_active !== undefined ? row.is_active : 1,
            row.delivery_method || '방문수령'
          ).run()
        }
        imported++
      } catch (err) {
        errorCount++
        errors.push(`${row.client_code}: ${err instanceof Error ? err.message : '오류'}`)
      }
    }

    await db.prepare(`
      UPDATE migration_logs SET status = 'COMPLETED', imported_rows = ?, skipped_rows = ?,
        error_rows = ?, errors_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(imported, skipped, errorCount, JSON.stringify(errors.slice(0, 100)), logId).run()

    return c.json({
      success: true,
      data: { total: clients.length, imported, skipped, errors: errorCount, error_details: errors.slice(0, 20) }
    })
  } catch (error) {
    console.error('clients import error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 품목 Import
// ============================================================
migrationRouter.post('/items/preview', async (c) => {
  try {
    const { items } = await c.req.json() as { items: any[] }
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const preview: any[] = []

    for (const row of items.slice(0, 100)) {
      const existing = row.item_code
        ? await db.prepare('SELECT id, item_name FROM items WHERE item_code = ?').bind(row.item_code).first()
        : null

      preview.push({
        ...row,
        _match: existing ? 'UPDATE' : 'INSERT',
        _existing_name: existing ? (existing as any).item_name : null,
      })
    }

    return c.json({
      success: true,
      data: {
        total: items.length,
        preview_count: preview.length,
        inserts: preview.filter(p => p._match === 'INSERT').length,
        updates: preview.filter(p => p._match === 'UPDATE').length,
        preview,
      }
    })
  } catch (error) {
    console.error('items preview error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

migrationRouter.post('/items/import', async (c) => {
  try {
    const user = c.get('user')
    const { items } = await c.req.json() as { items: any[] }
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const logResult = await db.prepare(`
      INSERT INTO migration_logs (migration_type, status, total_rows, started_at, created_by, entity_id)
      VALUES ('items', 'RUNNING', ?, CURRENT_TIMESTAMP, ?, ?)
    `).bind(items.length, user?.id || null, getEntityId(c) || 1).run()
    const logId = logResult.meta.last_row_id

    let imported = 0, skipped = 0, errorCount = 0
    const errors: string[] = []

    for (const row of items) {
      try {
        if (!row.item_code || !row.item_name) {
          skipped++
          errors.push(`건너뜀: item_code 또는 item_name 누락`)
          continue
        }

        const existing = await db.prepare(
          'SELECT id FROM items WHERE item_code = ?'
        ).bind(row.item_code).first()

        if (existing) {
          // 단가 열이 없는 파일을 다시 올려도 기존 단가를 0으로 밀지 않는다 —
          // 거래처 import(:110 credit_limit)와 같은 보존 규칙으로 맞춘다(형제 비대칭 해소).
          await db.prepare(`
            UPDATE items SET item_name = ?, specification = ?, unit = ?,
              base_price = CASE WHEN ? > 0 THEN ? ELSE base_price END,
              updated_at = CURRENT_TIMESTAMP
            WHERE item_code = ?
          `).bind(
            row.item_name, row.specification || null,
            row.unit || 'EA', row.unit_price || 0, row.unit_price || 0,
            row.item_code
          ).run()
        } else {
          // category_id 매칭 시도
          let categoryId = row.category_id || null
          if (!categoryId && row.category_name) {
            const cat = await db.prepare(
              'SELECT id FROM item_categories WHERE category_name = ?'
            ).bind(row.category_name).first()
            categoryId = cat ? (cat as any).id : null
          }

          await db.prepare(`
            INSERT INTO items (item_code, item_name, category_id, specification, unit, base_price, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `).bind(
            row.item_code, row.item_name, categoryId,
            row.specification || null, row.unit || 'EA', row.unit_price || 0
          ).run()
        }
        imported++
      } catch (err) {
        errorCount++
        errors.push(`${row.item_code}: ${err instanceof Error ? err.message : '오류'}`)
      }
    }

    await db.prepare(`
      UPDATE migration_logs SET status = 'COMPLETED', imported_rows = ?, skipped_rows = ?,
        error_rows = ?, errors_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(imported, skipped, errorCount, JSON.stringify(errors.slice(0, 100)), logId).run()

    return c.json({
      success: true,
      data: { total: items.length, imported, skipped, errors: errorCount, error_details: errors.slice(0, 20) }
    })
  } catch (error) {
    console.error('items import error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 주문 이력 Import
// ============================================================
migrationRouter.post('/orders/preview', async (c) => {
  try {
    const { orders } = await c.req.json() as { orders: any[] }
    if (!Array.isArray(orders) || orders.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const preview: any[] = []
    let matchedClients = 0, unmatchedClients = 0

    for (const row of orders.slice(0, 100)) {
      // 거래처 매칭
      let clientMatch = null
      if (row.client_code) {
        clientMatch = await db.prepare(
          'SELECT id, client_name FROM clients WHERE client_code = ?'
        ).bind(row.client_code).first()
      }

      // 기존 주문 확인 (external_order_number 기준)
      let existing = null
      if (row.order_number) {
        existing = await db.prepare(
          'SELECT id, order_number FROM orders WHERE external_order_number = ?'
        ).bind(row.order_number).first()
      }

      if (clientMatch) matchedClients++
      else unmatchedClients++

      preview.push({
        ...row,
        _client_match: clientMatch ? { id: (clientMatch as any).id, name: (clientMatch as any).client_name } : null,
        _existing: existing ? 'SKIP' : 'INSERT',
      })
    }

    return c.json({
      success: true,
      data: {
        total: orders.length,
        preview_count: preview.length,
        matched_clients: matchedClients,
        unmatched_clients: unmatchedClients,
        preview,
      }
    })
  } catch (error) {
    console.error('orders preview error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

migrationRouter.post('/orders/import', async (c) => {
  try {
    const user = c.get('user')
    const { orders, entity_id } = await c.req.json() as { orders: any[], entity_id?: number }
    const resolved = resolveImportEntity(c, entity_id)
    if ('error' in resolved) return c.json({ success: false, error: resolved.error }, 400)
    const entityId = resolved.entityId
    if (!Array.isArray(orders) || orders.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const logResult = await db.prepare(`
      INSERT INTO migration_logs (migration_type, status, total_rows, started_at, created_by, entity_id)
      VALUES ('orders', 'RUNNING', ?, CURRENT_TIMESTAMP, ?, ?)
    `).bind(orders.length, user?.id || null, entityId).run()
    const logId = logResult.meta.last_row_id

    let imported = 0, skipped = 0, errorCount = 0
    const errors: string[] = []

    for (const row of orders) {
      try {
        // 중복 체크
        if (row.order_number) {
          const existing = await db.prepare(
            'SELECT id FROM orders WHERE external_order_number = ?'
          ).bind(row.order_number).first()
          if (existing) { skipped++; continue }
        }

        // 거래처 매칭
        let clientId = null
        if (row.client_code) {
          const client = await db.prepare(
            'SELECT id FROM clients WHERE client_code = ?'
          ).bind(row.client_code).first()
          clientId = client ? (client as any).id : null
        }
        if (!clientId) {
          errorCount++
          errors.push(`${row.order_number}: 거래처 매칭 실패 (${row.client_code})`)
          continue
        }

        // 주문번호 생성 (이카운트 번호와 별도로 시스템 번호 생성)
        // COUNT(*)+1 은 삭제 이력이 있으면 기존 번호와 충돌하고, 패턴도 구형식('YYYYMMDD-%')이라
        // 현행 E{n}-YYYYMMDD-NNN 체계를 못 센다 → 정본 채번기(MAX+SUBSTR, 법인별)를 쓴다.
        const orderDate = row.order_date || new Date().toISOString().substring(0, 10)
        const dateStr = orderDate.replace(/-/g, '')
        const orderNumber = await getNextEntitySeqNumber(db, 'orders', 'order_number', entityId, dateStr)

        await db.prepare(`
          INSERT INTO orders (
            order_number, external_order_number, client_id, order_date, delivery_date,
            final_amount, billed_amount, billing_status, status,
            notes, created_by, entity_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          orderNumber, row.order_number || null, clientId,
          orderDate, row.delivery_date || null,
          row.final_amount || 0, row.billed_amount || 0,
          row.billing_status || 'UNBILLED',
          row.status || 'CONFIRMED',
          row.notes || null, user?.id || null, entityId
        ).run()

        imported++
      } catch (err) {
        errorCount++
        errors.push(`${row.order_number}: ${err instanceof Error ? err.message : '오류'}`)
      }
    }

    await db.prepare(`
      UPDATE migration_logs SET status = 'COMPLETED', imported_rows = ?, skipped_rows = ?,
        error_rows = ?, errors_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(imported, skipped, errorCount, JSON.stringify(errors.slice(0, 100)), logId).run()

    return c.json({
      success: true,
      data: { total: orders.length, imported, skipped, errors: errorCount, error_details: errors.slice(0, 20) }
    })
  } catch (error) {
    console.error('orders import error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 입금 이력 Import
// ============================================================
migrationRouter.post('/payments/preview', async (c) => {
  try {
    const { payments } = await c.req.json() as { payments: any[] }
    if (!Array.isArray(payments) || payments.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const preview: any[] = []

    for (const row of payments.slice(0, 100)) {
      let clientMatch = null
      if (row.client_code) {
        clientMatch = await db.prepare(
          'SELECT id, client_name, balance FROM clients WHERE client_code = ?'
        ).bind(row.client_code).first()
      }

      preview.push({
        ...row,
        _client_match: clientMatch ? { id: (clientMatch as any).id, name: (clientMatch as any).client_name } : null,
      })
    }

    return c.json({
      success: true,
      data: {
        total: payments.length,
        preview_count: preview.length,
        matched: preview.filter(p => p._client_match).length,
        unmatched: preview.filter(p => !p._client_match).length,
        preview,
      }
    })
  } catch (error) {
    console.error('payments preview error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

migrationRouter.post('/payments/import', async (c) => {
  try {
    const user = c.get('user')
    const { payments, entity_id } = await c.req.json() as { payments: any[], entity_id?: number }
    const resolved = resolveImportEntity(c, entity_id)
    if ('error' in resolved) return c.json({ success: false, error: resolved.error }, 400)
    const entityId = resolved.entityId
    if (!Array.isArray(payments) || payments.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const logResult = await db.prepare(`
      INSERT INTO migration_logs (migration_type, status, total_rows, started_at, created_by, entity_id)
      VALUES ('payments', 'RUNNING', ?, CURRENT_TIMESTAMP, ?, ?)
    `).bind(payments.length, user?.id || null, entityId).run()
    const logId = logResult.meta.last_row_id

    let imported = 0, skipped = 0, errorCount = 0
    const errors: string[] = []

    for (const row of payments) {
      try {
        if (!row.client_code || !row.amount) {
          skipped++
          errors.push(`건너뜀: client_code 또는 amount 누락`)
          continue
        }

        const client = await db.prepare(
          'SELECT id FROM clients WHERE client_code = ?'
        ).bind(row.client_code).first()
        if (!client) {
          errorCount++
          errors.push(`${row.client_code}: 거래처 매칭 실패`)
          continue
        }
        const clientId = (client as any).id

        // 중복 방지
        const dup = await db.prepare(`
          SELECT id FROM payments WHERE client_id = ? AND payment_date = ? AND amount = ? AND reference_number = ?
        `).bind(clientId, row.payment_date || null, row.amount, row.reference_number || null).first()
        if (dup) { skipped++; continue }

        await db.prepare(`
          INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          clientId, row.payment_date || null, row.amount,
          row.payment_method || 'TRANSFER',
          row.reference_number || null, row.notes || '이카운트 이관',
          user?.id || null, entityId
        ).run()

        // 거래처 잔액은 갱신하지 않는다 — `clients.balance` 는 폐기된 누적 캐시이고
        // 미수는 deriveClientBalance(청구−입금−조정)로 파생한다. 여기서 캐시를 건드리면
        // payment INSERT 와 별개 .run() 이라 한쪽만 반영되는 어긋남까지 같이 만든다.

        imported++
      } catch (err) {
        errorCount++
        errors.push(`${row.client_code}: ${err instanceof Error ? err.message : '오류'}`)
      }
    }

    await db.prepare(`
      UPDATE migration_logs SET status = 'COMPLETED', imported_rows = ?, skipped_rows = ?,
        error_rows = ?, errors_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(imported, skipped, errorCount, JSON.stringify(errors.slice(0, 100)), logId).run()

    return c.json({
      success: true,
      data: { total: payments.length, imported, skipped, errors: errorCount, error_details: errors.slice(0, 20) }
    })
  } catch (error) {
    console.error('payments import error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 기초잔액 설정
// ============================================================
migrationRouter.post('/opening-balances', async (c) => {
  try {
    const user = c.get('user')
    const { balances } = await c.req.json() as { balances: { client_code: string, opening_balance: number }[] }
    if (!Array.isArray(balances) || balances.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const logResult = await db.prepare(`
      INSERT INTO migration_logs (migration_type, status, total_rows, started_at, created_by, entity_id)
      VALUES ('opening_balances', 'RUNNING', ?, CURRENT_TIMESTAMP, ?, ?)
    `).bind(balances.length, user?.id || null, getEntityId(c) || 1).run()
    const logId = logResult.meta.last_row_id

    let imported = 0, errorCount = 0
    const errors: string[] = []

    for (const row of balances) {
      try {
        const result = await db.prepare(`
          UPDATE clients SET opening_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE client_code = ?
        `).bind(row.opening_balance || 0, row.client_code).run()

        if (result.meta.changes > 0) imported++
        else {
          errorCount++
          errors.push(`${row.client_code}: 거래처 없음`)
        }
      } catch (err) {
        errorCount++
        errors.push(`${row.client_code}: ${err instanceof Error ? err.message : '오류'}`)
      }
    }

    await db.prepare(`
      UPDATE migration_logs SET status = 'COMPLETED', imported_rows = ?, error_rows = ?,
        errors_json = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(imported, errorCount, JSON.stringify(errors.slice(0, 100)), logId).run()

    return c.json({
      success: true,
      data: { total: balances.length, imported, errors: errorCount, error_details: errors.slice(0, 20) }
    })
  } catch (error) {
    console.error('opening-balances error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================
// 대사 검증
// ============================================================

// 거래처 대사
migrationRouter.post('/verify/clients', async (c) => {
  try {
    const { clients } = await c.req.json() as { clients: any[] }
    if (!Array.isArray(clients) || clients.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB
    const results: any[] = []

    for (const row of clients) {
      if (!row.client_code) continue
      const existing = await db.prepare(
        'SELECT id, client_code, client_name, business_registration_number, phone, email FROM clients WHERE client_code = ?'
      ).bind(row.client_code).first() as any

      if (!existing) {
        results.push({ client_code: row.client_code, client_name: row.client_name, status: 'MISSING', diffs: [] })
        continue
      }

      const diffs: string[] = []
      if (row.client_name && row.client_name !== existing.client_name) diffs.push(`거래처명: "${existing.client_name}" → "${row.client_name}"`)
      if (row.business_registration_number && row.business_registration_number !== existing.business_registration_number) diffs.push(`사업자번호`)
      if (row.phone && row.phone !== existing.phone) diffs.push(`전화번호`)

      results.push({
        client_code: row.client_code,
        client_name: row.client_name,
        status: diffs.length > 0 ? 'MISMATCH' : 'MATCH',
        diffs,
        system_name: existing.client_name,
      })
    }

    // 시스템에만 있는 거래처 (이카운트에 없는)
    const { results: allClients } = await db.prepare(
      'SELECT client_code, client_name FROM clients WHERE is_active = 1'
    ).all() as any
    const ecountCodes = new Set(clients.map((c: any) => c.client_code))
    const systemOnly = allClients.filter((c: any) => !ecountCodes.has(c.client_code))

    return c.json({
      success: true,
      data: {
        total: clients.length,
        matched: results.filter(r => r.status === 'MATCH').length,
        mismatched: results.filter(r => r.status === 'MISMATCH').length,
        missing: results.filter(r => r.status === 'MISSING').length,
        system_only: systemOnly.length,
        results,
        system_only_list: systemOnly.slice(0, 50),
      }
    })
  } catch (error) {
    console.error('verify clients error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 미수금 잔액 대사
migrationRouter.post('/verify/balances', async (c) => {
  try {
    const { balances, tolerance = 1000 } = await c.req.json() as {
      balances: { client_code: string, client_name?: string, balance: number }[]
      tolerance?: number
    }
    if (!Array.isArray(balances) || balances.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB

    // 시스템 잔액 재계산 (opening_balance 포함)
    const { results: sysBalances } = await db.prepare(`
      SELECT c.id, c.client_code, c.client_name, c.balance, c.opening_balance,
        COALESCE(o.v, 0) as total_billed,
        COALESCE(p.v, 0) as total_paid,
        COALESCE(a.v, 0) as total_adj
      FROM clients c
      LEFT JOIN (
        SELECT client_id, SUM(CASE WHEN billing_status = 'BILLED' THEN billed_amount ELSE 0 END) as v
        FROM orders GROUP BY client_id
      ) o ON o.client_id = c.id
      LEFT JOIN (
        SELECT client_id, SUM(amount) as v FROM payments GROUP BY client_id
      ) p ON p.client_id = c.id
      LEFT JOIN (
        SELECT client_id, SUM(amount) as v FROM adjustments GROUP BY client_id
      ) a ON a.client_id = c.id
      WHERE c.is_active = 1
    `).all() as any

    const sysMap = new Map<string, any>()
    for (const s of sysBalances) {
      const calculated = (s.opening_balance || 0) + s.total_billed - s.total_paid - s.total_adj
      sysMap.set(s.client_code, { ...s, calculated_balance: calculated })
    }

    const results: any[] = []
    let matched = 0, withinTolerance = 0, mismatched = 0, missing = 0

    for (const row of balances) {
      const sys = sysMap.get(row.client_code)
      if (!sys) {
        results.push({
          client_code: row.client_code, client_name: row.client_name,
          ecount_balance: row.balance, system_balance: null, diff: null, status: 'MISSING'
        })
        missing++
        continue
      }

      const diff = row.balance - sys.calculated_balance
      const absDiff = Math.abs(diff)

      let status: string
      if (absDiff <= 0.01) { status = 'MATCH'; matched++ }
      else if (absDiff <= tolerance) { status = 'TOLERANCE'; withinTolerance++ }
      else { status = 'MISMATCH'; mismatched++ }

      results.push({
        client_code: row.client_code,
        client_name: row.client_name || sys.client_name,
        ecount_balance: row.balance,
        system_balance: +sys.calculated_balance.toFixed(2),
        diff: +diff.toFixed(2),
        abs_diff: +absDiff.toFixed(2),
        status,
        client_id: sys.id,
      })
    }

    // 차이 큰 순 정렬
    results.sort((a, b) => (b.abs_diff || 0) - (a.abs_diff || 0))

    const total = balances.length
    const matchRate = total > 0 ? +(((matched + withinTolerance) / total) * 100).toFixed(1) : 0

    return c.json({
      success: true,
      data: {
        total, matched, within_tolerance: withinTolerance, mismatched, missing,
        match_rate: matchRate,
        tolerance,
        go_no_go: matchRate >= 99,
        results,
      }
    })
  } catch (error) {
    console.error('verify balances error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 주문 누락 대사 (이중 운영 기간)
migrationRouter.post('/verify/orders', async (c) => {
  try {
    const { orders, date } = await c.req.json() as { orders: any[], date: string }
    if (!Array.isArray(orders) || orders.length === 0) {
      return c.json({ success: false, error: '데이터가 없습니다.' }, 400)
    }

    const db = c.env.DB

    // 해당 날짜의 시스템 주문 조회
    const { results: sysOrders } = await db.prepare(`
      SELECT o.id, o.order_number, o.external_order_number, o.order_date,
        o.final_amount, o.status, c.client_code, c.client_name
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.order_date = ?
    `).bind(date).all() as any

    const results: any[] = []

    // 이카운트 주문 → 시스템 매칭
    for (const eRow of orders) {
      // 1순위: external_order_number로 매칭
      let match = sysOrders.find((s: any) => s.external_order_number === eRow.order_number)

      // 2순위: 거래처 + 금액으로 매칭
      if (!match && eRow.client_code) {
        match = sysOrders.find((s: any) =>
          s.client_code === eRow.client_code &&
          Math.abs((s.final_amount || 0) - (eRow.final_amount || 0)) < 100
        )
      }

      results.push({
        ecount_order_number: eRow.order_number,
        ecount_client_code: eRow.client_code,
        ecount_client_name: eRow.client_name,
        ecount_amount: eRow.final_amount,
        system_match: match ? {
          id: match.id, order_number: match.order_number, amount: match.final_amount
        } : null,
        status: match ? 'MATCHED' : 'ECOUNT_ONLY',
      })
    }

    // 시스템에만 있는 주문
    const matchedSysIds = new Set(results.filter(r => r.system_match).map(r => r.system_match.id))
    const systemOnly = sysOrders.filter((s: any) => !matchedSysIds.has(s.id))

    return c.json({
      success: true,
      data: {
        date,
        ecount_count: orders.length,
        system_count: sysOrders.length,
        matched: results.filter(r => r.status === 'MATCHED').length,
        ecount_only: results.filter(r => r.status === 'ECOUNT_ONLY').length,
        system_only: systemOnly.length,
        results,
        system_only_list: systemOnly,
      }
    })
  } catch (error) {
    console.error('verify orders error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 이관 현황 리포트
migrationRouter.get('/report/summary', async (c) => {
  try {
    const db = c.env.DB

    // 이관 로그 요약
    const { results: logs } = await db.prepare(`
      SELECT migration_type, status, SUM(total_rows) as total, SUM(imported_rows) as imported,
        SUM(skipped_rows) as skipped, SUM(error_rows) as errors, MAX(completed_at) as last_completed
      FROM migration_logs
      GROUP BY migration_type, status
    `).all() as any

    // 현재 데이터 건수
    const counts = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM clients WHERE is_active = 1) as clients,
        (SELECT COUNT(*) FROM items WHERE is_active = 1) as items,
        (SELECT COUNT(*) FROM orders) as orders,
        (SELECT COUNT(*) FROM payments) as payments,
        (SELECT COUNT(*) FROM tax_invoices) as tax_invoices,
        (SELECT COUNT(*) FROM clients WHERE opening_balance != 0) as clients_with_opening_balance
    `).first() as any

    return c.json({
      success: true,
      data: {
        migration_logs: logs,
        current_counts: counts,
      }
    })
  } catch (error) {
    console.error('report summary error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 잔액 일괄 재계산 — **폐기(2026-09-03)**. 동작하지 않는 no-op 으로 남긴다.
//  ① `clients.balance` 는 폐기된 누적 캐시다(clients.ts 의 파생 정본 = deriveClientBalance).
//  ② 산식도 파생 정본과 달랐다(청구 정본 order_billing_groups 대신 orders.billed_amount + opening_balance).
//  ③ 활성 2,800여 건을 행별 UPDATE 루프로 돌아 Workers subrequest 한도에서 중간에 죽었다
//     → 절반만 덮인 캐시가 남는, 고치려던 것보다 나쁜 상태.
// 엔드포인트 자체는 지우지 않는다 — 외부에서 호출하던 흔적이 404 로 조용히 사라지는 대신
// 왜 없어졌는지 응답으로 알려 준다.
migrationRouter.post('/recalculate-all-balances', async (c) => {
  return c.json({
    success: false,
    deprecated: true,
    error: '잔액 캐시(clients.balance)는 폐기되었습니다. 미수금은 조회 시점에 파생 계산(청구−입금−조정)되므로 재계산이 필요 없습니다.',
  }, 410)
})

export default migrationRouter