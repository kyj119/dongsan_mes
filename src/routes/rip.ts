import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole, agentKeyMiddleware } from '../middleware/auth'

const ripRouter = new Hono<HonoEnv>()

// ─── 유틸: RIP 파일명 파싱 ──────────────────────────────────────────────────

// New format: YYYYMMDD-NNN-CC-거래처명-카테고리(품목요약)[후가공]
// Example: 20260215-001-01-동산인쇄-실사출력(현수막(900x600) x1EA)[열재단+코팅]
// Old format (fallback): [순번]-[거래처명] [품목명]([규격-수량])후가공_납기
function parseRipFilename(filename: string) {
  try {
    const nameWithoutExt = filename.replace(/\.(bmp|tsc|job)$/i, '')

    // Try new format: YYYYMMDD-NNN-CC-clientName-category(summary)[pp]
    const newPattern = /^(\d{8})-(\d+)-(\d+)-(.+?)-(.+?)\((.+)\)(\[.*?\])?$/
    const newMatch = nameWithoutExt.match(newPattern)
    if (newMatch) {
      const ppStr = newMatch[7] ? newMatch[7].replace(/[\[\]]/g, '') : ''
      return {
        cardNumber: `${newMatch[1]}-${newMatch[2]}-${newMatch[3]}`,
        orderDate: newMatch[1],
        orderSeq: newMatch[2],
        cardSeq: newMatch[3],
        clientName: newMatch[4],
        category: newMatch[5],
        itemSummary: newMatch[6],
        postProcessing: ppStr ? ppStr.split('+') : [],
        format: 'new'
      }
    }

    // Fallback: old format 순번-거래처명 품목명(규격-수량)후가공_납기
    const oldPattern = /^(\d+)-(.+?)\s+(.+?)\((.+?)-(\d+)(\w+)\)(.*)_(.+)$/
    const oldMatch = nameWithoutExt.match(oldPattern)
    if (oldMatch) {
      return {
        sequence: parseInt(oldMatch[1]),
        clientName: oldMatch[2].trim(),
        itemName: oldMatch[3].trim(),
        specs: oldMatch[4].trim(),
        quantity: parseInt(oldMatch[5]),
        unit: oldMatch[6],
        postProcessing: oldMatch[7].trim(),
        deliveryDate: oldMatch[8].trim(),
        format: 'old'
      }
    }

    return null
  } catch {
    return null
  }
}

// ============================================================================
// JWT 인증 엔드포인트 (프론트엔드 + 관리)
// ============================================================================

// ─── GET /api/rip/status — RIP 상태 요약 ────────────────────────────────────

ripRouter.get('/status', authMiddleware, async (c) => {
  try {
    const { results: cards } = await c.env.DB.prepare(`
      SELECT
        id, card_number, rip_filename, rip_status,
        rip_sent_at, rip_preview_path, rip_job_path,
        rip_queued_at, equipment_id, rip_preset,
        status, client_name, item_name
      FROM cards
      WHERE rip_filename IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 50
    `).all()

    const summary = {
      total: cards.length,
      queued: cards.filter((c: any) => c.rip_status === 'QUEUED').length,
      sent: cards.filter((c: any) => c.rip_sent_at).length,
      pending: cards.filter((c: any) => !c.rip_sent_at).length,
      cards: cards
    }

    return c.json({ success: true, data: summary })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── GET /api/rip/equipment — 장비 목록 + 온라인 상태 + 프리셋 ──────────────

ripRouter.get('/equipment', authMiddleware, async (c) => {
  try {
    const { results: equipmentList } = await c.env.DB.prepare(`
      SELECT e.*,
        ah.last_seen_at,
        ah.ip_address as agent_ip,
        CASE
          WHEN ah.last_seen_at IS NULL THEN 'OFFLINE'
          WHEN (julianday('now') - julianday(ah.last_seen_at)) * 86400 > 120 THEN 'OFFLINE'
          ELSE 'ONLINE'
        END as agent_status
      FROM equipment e
      LEFT JOIN agent_heartbeats ah ON ah.equipment_id = e.id
      WHERE e.status = 'ACTIVE'
      ORDER BY e.id
    `).all()

    // 각 장비에 프리셋 목록 첨부
    const result = await Promise.all(
      (equipmentList as any[]).map(async (eq) => {
        const { results: presets } = await c.env.DB.prepare(`
          SELECT * FROM equipment_presets
          WHERE equipment_id = ?
          ORDER BY is_default DESC, preset_name ASC
        `).bind(eq.id).all()
        return { ...eq, presets }
      })
    )

    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/equipment — 장비 등록 (admin) ────────────────────────────

ripRouter.post('/equipment', authMiddleware, requireRole('ADMIN'), async (c) => {
  try {
    const { id, name, printer_name, ip_address } = await c.req.json()

    if (!id || !name) {
      return c.json({ success: false, error: 'id and name are required' }, 400)
    }

    await c.env.DB.prepare(`
      INSERT INTO equipment (id, name, printer_name, ip_address)
      VALUES (?, ?, ?, ?)
    `).bind(id, name, printer_name || null, ip_address || null).run()

    const equipment = await c.env.DB.prepare(
      'SELECT * FROM equipment WHERE id = ?'
    ).bind(id).first()

    return c.json({ success: true, data: equipment }, 201)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── PUT /api/rip/equipment/:id — 장비 수정 (admin) ─────────────────────────

ripRouter.put('/equipment/:id', authMiddleware, requireRole('ADMIN'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const body = await c.req.json()

    const existing = await c.env.DB.prepare(
      'SELECT id FROM equipment WHERE id = ?'
    ).bind(equipId).first()

    if (!existing) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    const fields: string[] = []
    const values: any[] = []

    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
    if (body.printer_name !== undefined) { fields.push('printer_name = ?'); values.push(body.printer_name) }
    if (body.ip_address !== undefined) { fields.push('ip_address = ?'); values.push(body.ip_address) }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status) }
    if (body.head_count !== undefined) { fields.push('head_count = ?'); values.push(body.head_count) }
    if (body.location_zone !== undefined) { fields.push('location_zone = ?'); values.push(body.location_zone) }
    if (body.notes !== undefined) { fields.push('notes = ?'); values.push(body.notes) }
    if (body.size_type !== undefined) { fields.push('size_type = ?'); values.push(body.size_type) }
    fields.push('updated_at = CURRENT_TIMESTAMP')

    if (fields.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400)
    }

    values.push(equipId)
    await c.env.DB.prepare(
      `UPDATE equipment SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values).run()

    const updated = await c.env.DB.prepare(
      'SELECT * FROM equipment WHERE id = ?'
    ).bind(equipId).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/equipment/:id/presets — 프리셋 추가 (admin) ──────────────

ripRouter.post('/equipment/:id/presets', authMiddleware, requireRole('ADMIN'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const { preset_name, tps_filename, description, is_default } = await c.req.json()

    if (!preset_name || !tps_filename) {
      return c.json({ success: false, error: 'preset_name and tps_filename are required' }, 400)
    }

    const equipment = await c.env.DB.prepare(
      'SELECT id FROM equipment WHERE id = ?'
    ).bind(equipId).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    // is_default=1로 등록 시 기존 기본 프리셋 해제
    if (is_default) {
      await c.env.DB.prepare(
        'UPDATE equipment_presets SET is_default = 0 WHERE equipment_id = ?'
      ).bind(equipId).run()
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO equipment_presets (equipment_id, preset_name, tps_filename, description, is_default)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      equipId,
      preset_name,
      tps_filename,
      description || null,
      is_default ? 1 : 0
    ).run()

    const preset = await c.env.DB.prepare(
      'SELECT * FROM equipment_presets WHERE id = ?'
    ).bind(result.meta.last_row_id).first()

    return c.json({ success: true, data: preset }, 201)
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── DELETE /api/rip/equipment/:id/presets/:presetId — 프리셋 삭제 (admin) ──

ripRouter.delete('/equipment/:id/presets/:presetId', authMiddleware, requireRole('ADMIN'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const presetId = c.req.param('presetId')

    const preset = await c.env.DB.prepare(
      'SELECT id FROM equipment_presets WHERE id = ? AND equipment_id = ?'
    ).bind(presetId, equipId).first()

    if (!preset) {
      return c.json({ success: false, error: 'Preset not found' }, 404)
    }

    await c.env.DB.prepare(
      'DELETE FROM equipment_presets WHERE id = ? AND equipment_id = ?'
    ).bind(presetId, equipId).run()

    return c.json({ success: true, message: 'Preset deleted' })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── GET /api/rip/equipment/:id — 장비 상세 (헤드 + 유지보수 이력) ────────────

ripRouter.get('/equipment/:id', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')

    const equipment = await c.env.DB.prepare(`
      SELECT e.*,
        ah.last_seen_at,
        CASE
          WHEN ah.last_seen_at IS NULL THEN 'OFFLINE'
          WHEN datetime(ah.last_seen_at, '+5 minutes') < datetime('now') THEN 'OFFLINE'
          ELSE 'ONLINE'
        END as agent_status
      FROM equipment e
      LEFT JOIN agent_heartbeats ah ON ah.equipment_id = e.id
      WHERE e.id = ?
    `).bind(equipId).first() as any

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    // 프리셋
    const { results: presets } = await c.env.DB.prepare(
      'SELECT * FROM equipment_presets WHERE equipment_id = ? ORDER BY is_default DESC, preset_name ASC'
    ).bind(equipId).all()

    // 헤드
    const { results: heads } = await c.env.DB.prepare(
      'SELECT * FROM equipment_heads WHERE equipment_id = ? ORDER BY head_number ASC'
    ).bind(equipId).all()

    // 최근 유지보수 이력 (20건)
    const { results: logs } = await c.env.DB.prepare(`
      SELECT ml.*, u.name as performed_by_name
      FROM maintenance_logs ml
      LEFT JOIN users u ON ml.performed_by = u.id
      WHERE ml.equipment_id = ?
      ORDER BY ml.performed_at DESC
      LIMIT 20
    `).bind(equipId).all()

    return c.json({
      success: true,
      data: { ...equipment, presets, heads, maintenance_logs: logs }
    })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── PATCH /api/rip/equipment/:id/status — 장비 상태 변경 ────────────────────

ripRouter.patch('/equipment/:id/status', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const user = c.get('user')
    const { equipment_status, notes } = await c.req.json()

    const validStatuses = ['RUNNING', 'IDLE', 'MAINTENANCE', 'BROKEN']
    if (!validStatuses.includes(equipment_status)) {
      return c.json({ success: false, error: `상태는 ${validStatuses.join('|')} 중 하나여야 합니다` }, 400)
    }

    const existing = await c.env.DB.prepare(
      'SELECT id, equipment_status FROM equipment WHERE id = ?'
    ).bind(equipId).first() as any

    if (!existing) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    const prevStatus = existing.equipment_status || 'IDLE'

    await c.env.DB.prepare(
      'UPDATE equipment SET equipment_status = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(equipment_status, notes || null, equipId).run()

    // 상태 변경 이력 기록
    await c.env.DB.prepare(`
      INSERT INTO maintenance_logs (equipment_id, log_type, description, performed_by)
      VALUES (?, 'STATUS_CHANGE', ?, ?)
    `).bind(
      equipId,
      `상태 변경: ${prevStatus} → ${equipment_status}` + (notes ? ` (${notes})` : ''),
      user?.id || null
    ).run()

    return c.json({ success: true, data: { prev_status: prevStatus, new_status: equipment_status } })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── PUT /api/rip/equipment/:id/capacity — 일일 용량 설정 ────────────────────

ripRouter.put('/equipment/:id/capacity', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const { daily_capacity } = await c.req.json()

    if (typeof daily_capacity !== 'number' || daily_capacity < 0) {
      return c.json({ success: false, error: '일일 용량은 0 이상의 숫자여야 합니다' }, 400)
    }

    const existing = await c.env.DB.prepare(
      'SELECT id FROM equipment WHERE id = ?'
    ).bind(equipId).first()

    if (!existing) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    await c.env.DB.prepare(
      'UPDATE equipment SET daily_capacity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(daily_capacity, equipId).run()

    return c.json({ success: true, data: { daily_capacity } })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── PATCH /api/rip/equipment/:id/position — 배치도 위치 저장 ────────────────

ripRouter.patch('/equipment/:id/position', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const { location_x, location_y, location_zone } = await c.req.json()

    await c.env.DB.prepare(
      'UPDATE equipment SET location_x = ?, location_y = ?, location_zone = COALESCE(?, location_zone), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(location_x, location_y, location_zone || null, equipId).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/equipment/:id/heads — 헤드 초기화/추가 ───────────────────

ripRouter.post('/equipment/:id/heads', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const { head_count } = await c.req.json()

    if (!head_count || head_count < 1 || head_count > 16) {
      return c.json({ success: false, error: '헤드 수는 1~16 사이여야 합니다' }, 400)
    }

    const equipment = await c.env.DB.prepare(
      'SELECT id FROM equipment WHERE id = ?'
    ).bind(equipId).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    // 기존 헤드 삭제 후 재생성
    await c.env.DB.prepare('DELETE FROM equipment_heads WHERE equipment_id = ?').bind(equipId).run()

    for (let i = 1; i <= head_count; i++) {
      await c.env.DB.prepare(
        'INSERT INTO equipment_heads (equipment_id, head_number, status) VALUES (?, ?, ?)'
      ).bind(equipId, i, 'NORMAL').run()
    }

    // equipment.head_count 업데이트
    await c.env.DB.prepare(
      'UPDATE equipment SET head_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(head_count, equipId).run()

    const { results: heads } = await c.env.DB.prepare(
      'SELECT * FROM equipment_heads WHERE equipment_id = ? ORDER BY head_number'
    ).bind(equipId).all()

    return c.json({ success: true, data: heads })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── PUT /api/rip/equipment/:id/heads/:headNum — 헤드 상태 업데이트 ──────────

ripRouter.put('/equipment/:id/heads/:headNum', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const headNum = parseInt(c.req.param('headNum'))
    const user = c.get('user')
    const { status, replaced_at, notes } = await c.req.json()

    const validStatuses = ['NORMAL', 'CLOGGED', 'REPLACE_NEEDED', 'REPLACED']
    if (status && !validStatuses.includes(status)) {
      return c.json({ success: false, error: `헤드 상태는 ${validStatuses.join('|')} 중 하나여야 합니다` }, 400)
    }

    const head = await c.env.DB.prepare(
      'SELECT * FROM equipment_heads WHERE equipment_id = ? AND head_number = ?'
    ).bind(equipId, headNum).first() as any

    if (!head) {
      return c.json({ success: false, error: 'Head not found' }, 404)
    }

    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP']
    const values: any[] = []

    if (status) { fields.push('status = ?'); values.push(status) }
    if (replaced_at) { fields.push('replaced_at = ?'); values.push(replaced_at) }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }

    values.push(equipId, headNum)
    await c.env.DB.prepare(
      `UPDATE equipment_heads SET ${fields.join(', ')} WHERE equipment_id = ? AND head_number = ?`
    ).bind(...values).run()

    // 교체 시 유지보수 이력 기록
    if (status === 'REPLACED' || replaced_at) {
      await c.env.DB.prepare(`
        INSERT INTO maintenance_logs (equipment_id, log_type, description, performed_by, performed_at)
        VALUES (?, 'PART_REPLACEMENT', ?, ?, ?)
      `).bind(
        equipId,
        `헤드 #${headNum} 교체` + (notes ? ` - ${notes}` : ''),
        user?.id || null,
        replaced_at || new Date().toISOString()
      ).run()
    }

    const updated = await c.env.DB.prepare(
      'SELECT * FROM equipment_heads WHERE equipment_id = ? AND head_number = ?'
    ).bind(equipId, headNum).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/equipment/:id/maintenance — 유지보수 이력 추가 ────────────

ripRouter.post('/equipment/:id/maintenance', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const user = c.get('user')
    const body = await c.req.json()

    const validTypes = ['MAINTENANCE', 'REPAIR', 'PART_REPLACEMENT', 'STATUS_CHANGE', 'INSPECTION']
    if (!validTypes.includes(body.log_type || 'MAINTENANCE')) {
      return c.json({ success: false, error: `log_type은 ${validTypes.join('|')} 중 하나여야 합니다` }, 400)
    }

    if (!body.description) {
      return c.json({ success: false, error: '작업 내용(description)은 필수입니다' }, 400)
    }

    const equipment = await c.env.DB.prepare(
      'SELECT id FROM equipment WHERE id = ?'
    ).bind(equipId).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO maintenance_logs (equipment_id, log_type, description, cost, performed_by, performed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      equipId,
      body.log_type || 'MAINTENANCE',
      body.description,
      body.cost || 0,
      body.performed_by || user?.id || null,
      body.performed_at || new Date().toISOString()
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201)
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── GET /api/rip/equipment/:id/maintenance — 유지보수 이력 조회 ─────────────

ripRouter.get('/equipment/:id/maintenance', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const { log_type } = c.req.query()

    let query = `
      SELECT ml.*, u.name as performed_by_name
      FROM maintenance_logs ml
      LEFT JOIN users u ON ml.performed_by = u.id
      WHERE ml.equipment_id = ?
    `
    const params: any[] = [equipId]

    if (log_type) {
      query += ' AND ml.log_type = ?'
      params.push(log_type)
    }

    query += ' ORDER BY ml.performed_at DESC LIMIT 50'

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── DELETE /api/rip/equipment/:id/maintenance/:logId — 유지보수 이력 삭제 ───

ripRouter.delete('/equipment/:id/maintenance/:logId', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const logId = c.req.param('logId')

    const existing = await c.env.DB.prepare(
      'SELECT id FROM maintenance_logs WHERE id = ?'
    ).bind(logId).first()

    if (!existing) {
      return c.json({ success: false, error: '이력을 찾을 수 없습니다' }, 404)
    }

    await c.env.DB.prepare('DELETE FROM maintenance_logs WHERE id = ?').bind(logId).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// 소모품 관리 (equipment_consumables)
// ============================================================================

// ─── GET /api/rip/equipment/:id/consumables — 소모품 목록 ───────────────────

ripRouter.get('/equipment/:id/consumables', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT *,
        CASE
          WHEN next_due_at IS NOT NULL AND next_due_at <= date('now') THEN 'OVERDUE'
          WHEN next_due_at IS NOT NULL AND next_due_at <= date('now', '+7 days') THEN 'DUE_SOON'
          ELSE 'OK'
        END as due_status
      FROM equipment_consumables
      WHERE equipment_id = ?
      ORDER BY next_due_at ASC NULLS LAST
    `).bind(equipId).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/equipment/:id/consumables — 소모품 추가 ──────────────────

ripRouter.post('/equipment/:id/consumables', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const body = await c.req.json()

    if (!body.name) {
      return c.json({ success: false, error: '소모품 이름은 필수입니다' }, 400)
    }

    const equipment = await c.env.DB.prepare(
      'SELECT id FROM equipment WHERE id = ?'
    ).bind(equipId).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    const cycleDays = body.replacement_cycle_days || 0
    const lastReplaced = body.last_replaced_at || new Date().toISOString()
    const nextDue = cycleDays > 0
      ? new Date(new Date(lastReplaced).getTime() + cycleDays * 86400000).toISOString().substring(0, 10)
      : null

    const result = await c.env.DB.prepare(`
      INSERT INTO equipment_consumables (equipment_id, name, replacement_cycle_days, last_replaced_at, next_due_at, quantity_on_hand, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      equipId, body.name, cycleDays,
      lastReplaced, nextDue,
      body.quantity_on_hand || 0,
      body.notes || null
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201)
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── PUT /api/rip/equipment/:id/consumables/:cid — 소모품 수정 ──────────────

ripRouter.put('/equipment/:id/consumables/:cid', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const cid = c.req.param('cid')
    const body = await c.req.json()

    const existing = await c.env.DB.prepare(
      'SELECT * FROM equipment_consumables WHERE id = ?'
    ).bind(cid).first() as any

    if (!existing) {
      return c.json({ success: false, error: 'Consumable not found' }, 404)
    }

    const fields: string[] = []
    const values: any[] = []

    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
    if (body.replacement_cycle_days !== undefined) { fields.push('replacement_cycle_days = ?'); values.push(body.replacement_cycle_days) }
    if (body.last_replaced_at !== undefined) { fields.push('last_replaced_at = ?'); values.push(body.last_replaced_at) }
    if (body.quantity_on_hand !== undefined) { fields.push('quantity_on_hand = ?'); values.push(body.quantity_on_hand) }
    if (body.notes !== undefined) { fields.push('notes = ?'); values.push(body.notes) }

    // next_due_at 자동 계산
    const cycleDays = body.replacement_cycle_days ?? existing.replacement_cycle_days
    const lastReplaced = body.last_replaced_at ?? existing.last_replaced_at
    if (cycleDays > 0 && lastReplaced) {
      const nextDue = new Date(new Date(lastReplaced).getTime() + cycleDays * 86400000).toISOString().substring(0, 10)
      fields.push('next_due_at = ?')
      values.push(nextDue)
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(cid)

    await c.env.DB.prepare(
      `UPDATE equipment_consumables SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/equipment/:id/consumables/:cid/replace — 소모품 교체 기록 ─

ripRouter.post('/equipment/:id/consumables/:cid/replace', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const cid = c.req.param('cid')
    const user = c.get('user')

    const consumable = await c.env.DB.prepare(
      'SELECT * FROM equipment_consumables WHERE id = ? AND equipment_id = ?'
    ).bind(cid, equipId).first() as any

    if (!consumable) {
      return c.json({ success: false, error: 'Consumable not found' }, 404)
    }

    const now = new Date().toISOString()
    const cycleDays = consumable.replacement_cycle_days || 0
    const nextDue = cycleDays > 0
      ? new Date(Date.now() + cycleDays * 86400000).toISOString().substring(0, 10)
      : null

    await c.env.DB.prepare(`
      UPDATE equipment_consumables SET last_replaced_at = ?, next_due_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(now, nextDue, cid).run()

    // 유지보수 이력에도 기록
    await c.env.DB.prepare(`
      INSERT INTO maintenance_logs (equipment_id, log_type, description, performed_by, performed_at)
      VALUES (?, 'PART_REPLACEMENT', ?, ?, ?)
    `).bind(equipId, `소모품 교체: ${consumable.name}`, user?.id || null, now).run()

    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── DELETE /api/rip/equipment/:id/consumables/:cid — 소모품 삭제 ────────────

ripRouter.delete('/equipment/:id/consumables/:cid', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const cid = c.req.param('cid')
    await c.env.DB.prepare('DELETE FROM equipment_consumables WHERE id = ?').bind(cid).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// 예방정비 스케줄 (maintenance_schedules)
// ============================================================================

// ─── GET /api/rip/equipment/:id/schedules — 정비 스케줄 목록 ────────────────

ripRouter.get('/equipment/:id/schedules', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT *,
        CASE
          WHEN next_due_at IS NOT NULL AND next_due_at <= date('now') THEN 'OVERDUE'
          WHEN next_due_at IS NOT NULL AND next_due_at <= date('now', '+7 days') THEN 'DUE_SOON'
          ELSE 'OK'
        END as due_status
      FROM maintenance_schedules
      WHERE equipment_id = ? AND is_active = 1
      ORDER BY next_due_at ASC NULLS LAST
    `).bind(equipId).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/equipment/:id/schedules — 정비 스케줄 추가 ───────────────

ripRouter.post('/equipment/:id/schedules', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const body = await c.req.json()

    if (!body.title || !body.interval_days) {
      return c.json({ success: false, error: '제목과 주기(일)는 필수입니다' }, 400)
    }

    const equipment = await c.env.DB.prepare(
      'SELECT id FROM equipment WHERE id = ?'
    ).bind(equipId).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    const nextDue = new Date(Date.now() + body.interval_days * 86400000).toISOString().substring(0, 10)

    const result = await c.env.DB.prepare(`
      INSERT INTO maintenance_schedules (equipment_id, title, description, interval_days, checklist, next_due_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      equipId, body.title, body.description || null,
      body.interval_days, body.checklist || null, nextDue
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } }, 201)
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/equipment/:id/schedules/:sid/complete — 정비 완료 처리 ───

ripRouter.post('/equipment/:id/schedules/:sid/complete', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const sid = c.req.param('sid')
    const user = c.get('user')
    const body = await c.req.json()

    const schedule = await c.env.DB.prepare(
      'SELECT * FROM maintenance_schedules WHERE id = ? AND equipment_id = ?'
    ).bind(sid, equipId).first() as any

    if (!schedule) {
      return c.json({ success: false, error: 'Schedule not found' }, 404)
    }

    const now = new Date().toISOString()
    const nextDue = new Date(Date.now() + schedule.interval_days * 86400000).toISOString().substring(0, 10)

    // 스케줄 업데이트
    await c.env.DB.prepare(`
      UPDATE maintenance_schedules SET last_performed_at = ?, next_due_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(now, nextDue, sid).run()

    // 유지보수 이력에 기록
    await c.env.DB.prepare(`
      INSERT INTO maintenance_logs (equipment_id, log_type, description, performed_by, performed_at, schedule_id)
      VALUES (?, 'MAINTENANCE', ?, ?, ?, ?)
    `).bind(
      equipId,
      `[정기점검] ${schedule.title}` + (body.notes ? `: ${body.notes}` : ''),
      user?.id || null, now, parseInt(sid)
    ).run()

    return c.json({ success: true, data: { next_due_at: nextDue } })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── DELETE /api/rip/equipment/:id/schedules/:sid — 정비 스케줄 삭제 ─────────

ripRouter.delete('/equipment/:id/schedules/:sid', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const sid = c.req.param('sid')
    await c.env.DB.prepare(
      'UPDATE maintenance_schedules SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(sid).run()
    return c.json({ success: true })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// 장비별 생산 실적 통계
// ============================================================================

// ─── GET /api/rip/equipment/:id/stats — 장비 생산 실적 ──────────────────────

ripRouter.get('/equipment/:id/stats', authMiddleware, async (c) => {
  try {
    const equipId = c.req.param('id')
    const { period } = c.req.query()

    // 일별 생산 실적 (최근 30일)
    const { results: dailyStats } = await c.env.DB.prepare(`
      SELECT
        date(pe.print_completed_at) as date,
        COUNT(*) as print_count,
        COUNT(DISTINCT pe.card_number) as card_count
      FROM print_events pe
      WHERE pe.equipment_id = ?
        AND pe.print_status = 'OK'
        AND pe.print_completed_at >= date('now', '-30 days')
      GROUP BY date(pe.print_completed_at)
      ORDER BY date DESC
    `).bind(equipId).all()

    // 월별 집계 (최근 6개월)
    const { results: monthlyStats } = await c.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', pe.print_completed_at) as month,
        COUNT(*) as print_count,
        COUNT(DISTINCT pe.card_number) as card_count
      FROM print_events pe
      WHERE pe.equipment_id = ?
        AND pe.print_status = 'OK'
        AND pe.print_completed_at >= date('now', '-180 days')
      GROUP BY strftime('%Y-%m', pe.print_completed_at)
      ORDER BY month DESC
    `).bind(equipId).all()

    // 오늘 실적
    const todayStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as print_count,
        COUNT(DISTINCT card_number) as card_count
      FROM print_events
      WHERE equipment_id = ?
        AND print_status = 'OK'
        AND date(print_completed_at) = date('now')
    `).bind(equipId).first()

    // 가동률 (최근 7일: 출력 이벤트가 있는 시간대 비율)
    const uptimeData = await c.env.DB.prepare(`
      SELECT
        COUNT(DISTINCT date(print_completed_at)) as active_days
      FROM print_events
      WHERE equipment_id = ?
        AND print_status = 'OK'
        AND print_completed_at >= date('now', '-7 days')
    `).bind(equipId).first() as any

    // 유지보수 비용 합계 (최근 6개월)
    const costData = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(cost), 0) as total_cost, COUNT(*) as maintenance_count
      FROM maintenance_logs
      WHERE equipment_id = ?
        AND performed_at >= date('now', '-180 days')
    `).bind(equipId).first()

    return c.json({
      success: true,
      data: {
        today: todayStats,
        daily: dailyStats,
        monthly: monthlyStats,
        uptime_days_7d: uptimeData?.active_days || 0,
        uptime_rate_7d: Math.round(((uptimeData?.active_days || 0) / 7) * 100),
        maintenance: costData
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── GET /api/rip/maintenance/alerts — 전체 장비 정비/소모품 알림 ────────────

ripRouter.get('/maintenance/alerts', authMiddleware, async (c) => {
  try {
    // 교체 기한 도래 소모품
    const { results: consumableAlerts } = await c.env.DB.prepare(`
      SELECT ec.*, e.name as equipment_name,
        CASE
          WHEN ec.next_due_at <= date('now') THEN 'OVERDUE'
          ELSE 'DUE_SOON'
        END as alert_type
      FROM equipment_consumables ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE e.status = 'ACTIVE'
        AND ec.next_due_at IS NOT NULL
        AND ec.next_due_at <= date('now', '+7 days')
      ORDER BY ec.next_due_at ASC
    `).all()

    // 정비 기한 도래 스케줄
    const { results: scheduleAlerts } = await c.env.DB.prepare(`
      SELECT ms.*, e.name as equipment_name,
        CASE
          WHEN ms.next_due_at <= date('now') THEN 'OVERDUE'
          ELSE 'DUE_SOON'
        END as alert_type
      FROM maintenance_schedules ms
      JOIN equipment e ON ms.equipment_id = e.id
      WHERE e.status = 'ACTIVE' AND ms.is_active = 1
        AND ms.next_due_at IS NOT NULL
        AND ms.next_due_at <= date('now', '+7 days')
      ORDER BY ms.next_due_at ASC
    `).all()

    return c.json({
      success: true,
      data: {
        consumables: consumableAlerts,
        schedules: scheduleAlerts,
        total_alerts: consumableAlerts.length + scheduleAlerts.length
      }
    })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/send/:cardId — 카드를 RIP 큐에 등록 (JWT) ────────────────

ripRouter.post('/send/:cardId', authMiddleware, async (c) => {
  try {
    const cardId = c.req.param('cardId')
    const { equipment_id, rip_preset } = await c.req.json()

    if (!equipment_id || !rip_preset) {
      return c.json({ success: false, error: 'equipment_id and rip_preset are required' }, 400)
    }

    // 1. 카드 존재 확인
    const card = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ?'
    ).bind(cardId).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    // 2. equipment 존재 확인
    const equipment = await c.env.DB.prepare(
      "SELECT id FROM equipment WHERE id = ? AND status = 'ACTIVE'"
    ).bind(equipment_id).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found or inactive' }, 400)
    }

    // 3. 해당 장비에 프리셋 존재 확인
    const preset = await c.env.DB.prepare(
      'SELECT id FROM equipment_presets WHERE equipment_id = ? AND preset_name = ?'
    ).bind(equipment_id, rip_preset).first()

    if (!preset) {
      return c.json({ success: false, error: 'Preset not found for this equipment' }, 400)
    }

    const prevStatus = card.status

    // 4. 카드 QUEUED 상태로 업데이트
    await c.env.DB.prepare(`
      UPDATE cards SET
        equipment_id = ?,
        rip_preset = ?,
        rip_status = 'QUEUED',
        rip_queued_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(equipment_id, rip_preset, cardId).run()

    // 5. 상태 이력 기록
    await c.env.DB.prepare(`
      INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(cardId, prevStatus, prevStatus, 1, `RIP queued → equipment: ${equipment_id}, preset: ${rip_preset}`).run()

    return c.json({
      success: true,
      data: {
        card_id: cardId,
        rip_status: 'QUEUED',
        equipment_id,
        rip_preset
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/complete/:cardId — RIP 완료 처리 (JWT) ───────────────────
// LogWatcher 기존 완료 처리와의 호환성 유지

ripRouter.post('/complete/:cardId', authMiddleware, async (c) => {
  try {
    const cardId = c.req.param('cardId')

    const card = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ?'
    ).bind(cardId).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    const jobPath = `C:\\TNSRip-X11\\Job\\${card.rip_filename}.job`

    await c.env.DB.prepare(`
      UPDATE cards SET
        rip_job_path = ?,
        rip_status = 'COMPLETED',
        status = 'PRINT_DONE',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(jobPath, cardId).run()

    await c.env.DB.prepare(`
      INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(cardId, card.status, 'PRINT_DONE', 1, 'RIP job completed').run()

    return c.json({
      success: true,
      message: 'RIP job completed successfully',
      data: { card_id: cardId, job_path: jobPath }
    })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/parse-filename — 파일명 파싱 유틸 (JWT) ──────────────────

ripRouter.post('/parse-filename', authMiddleware, async (c) => {
  try {
    const { filename } = await c.req.json()

    if (!filename) {
      return c.json({ success: false, error: 'Filename is required' }, 400)
    }

    const parsed = parseRipFilename(filename)

    if (!parsed) {
      return c.json({ success: false, error: 'Failed to parse filename' }, 400)
    }

    return c.json({ success: true, data: parsed })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── GET /api/rip/test-filename/:cardId — 카드 파일명 테스트 (JWT) ───────────

ripRouter.get('/test-filename/:cardId', authMiddleware, async (c) => {
  try {
    const cardId = c.req.param('cardId')

    const card = await c.env.DB.prepare(
      'SELECT * FROM cards WHERE id = ?'
    ).bind(cardId).first() as any

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    const parsed = card.rip_filename ? parseRipFilename(card.rip_filename) : null

    return c.json({
      success: true,
      data: {
        card_id: cardId,
        generated_filename: card.rip_filename,
        parsed,
        is_valid: parsed !== null
      }
    })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ============================================================================
// API Key 인증 엔드포인트 (LogWatcher 에이전트용)
// ============================================================================

// ─── GET /api/rip/pending — QUEUED 카드 목록 조회 (API Key) ─────────────────

ripRouter.get('/pending', agentKeyMiddleware, async (c) => {
  try {
    const { equipment_id } = c.req.query()

    if (!equipment_id) {
      return c.json({ success: false, error: 'equipment_id query parameter is required' }, 400)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT
        c.id as card_id,
        c.card_number,
        c.source_file_path,
        c.rip_preset,
        c.rip_filename,
        c.width,
        c.height,
        c.quantity,
        c.equipment_id
      FROM cards c
      WHERE c.equipment_id = ?
        AND c.rip_status = 'QUEUED'
      ORDER BY c.priority DESC, c.delivery_date ASC
      LIMIT 10
    `).bind(equipment_id).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── POST /api/rip/ack/:cardId — 카드 수신 확인 (API Key) ───────────────────

ripRouter.post('/ack/:cardId', agentKeyMiddleware, async (c) => {
  try {
    const cardId = c.req.param('cardId')
    const { job_path } = await c.req.json()

    if (!job_path) {
      return c.json({ success: false, error: 'job_path is required' }, 400)
    }

    const card = await c.env.DB.prepare(
      "SELECT id, status, rip_status FROM cards WHERE id = ? AND rip_status = 'QUEUED'"
    ).bind(cardId).first() as any

    if (!card) {
      return c.json({
        success: false,
        error: 'Card not found or not in QUEUED status'
      }, 404)
    }

    await c.env.DB.prepare(`
      UPDATE cards SET
        rip_status = 'SENT',
        rip_sent_at = CURRENT_TIMESTAMP,
        rip_job_path = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND rip_status = 'QUEUED'
    `).bind(job_path, cardId).run()

    await c.env.DB.prepare(`
      INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(cardId, card.status, card.status, 1, `RIP ACK received, job_path: ${job_path}`).run()

    return c.json({
      success: true,
      data: {
        card_id: cardId,
        rip_status: 'SENT',
        job_path: job_path
      }
    })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다'
    }, 500)
  }
})

// ============================================================================
// 아이템 단위 RIP 전송 API (신규)
// ============================================================================

// ─── POST /api/rip/send-item/:cardItemId — 아이템별 RIP 전송 (JWT) ──────────

ripRouter.post('/send-item/:cardItemId', authMiddleware, async (c) => {
  try {
    const cardItemId = Number(c.req.param('cardItemId'))
    if (!Number.isInteger(cardItemId) || cardItemId <= 0) {
      return c.json({ success: false, error: 'Invalid card_item_id' }, 400)
    }

    const { equipment_id, rip_preset } = await c.req.json()

    if (!equipment_id?.trim() || !rip_preset?.trim()) {
      return c.json({ success: false, error: 'equipment_id and rip_preset are required' }, 400)
    }

    // 1. card_item 존재 확인 + 카드/주문 정보 조인
    const cardItem = await c.env.DB.prepare(`
      SELECT ci.id, ci.card_id, ci.order_item_id, ci.quantity, ci.rip_status, ci.source_file_path,
             c.card_number, c.status as card_status, c.delivery_date, c.priority,
             oi.item_name, oi.width, oi.height, oi.content, oi.scale_factor
      FROM card_items ci
      JOIN cards c ON ci.card_id = c.id
      JOIN order_items oi ON ci.order_item_id = oi.id
      WHERE ci.id = ?
    `).bind(cardItemId).first() as any

    if (!cardItem) {
      return c.json({ success: false, error: 'Card item not found' }, 404)
    }

    if (cardItem.rip_status === 'QUEUED' || cardItem.rip_status === 'SENT') {
      return c.json({ success: false, error: `이미 RIP 전송됨 (${cardItem.rip_status})` }, 400)
    }

    // 2. equipment 존재 확인
    const equipment = await c.env.DB.prepare(
      "SELECT id, name FROM equipment WHERE id = ? AND status = 'ACTIVE'"
    ).bind(equipment_id).first() as any

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found or inactive' }, 400)
    }

    // 3. 해당 장비에 프리셋 존재 확인
    const preset = await c.env.DB.prepare(
      'SELECT id, tps_filename FROM equipment_presets WHERE equipment_id = ? AND preset_name = ?'
    ).bind(equipment_id, rip_preset).first()

    if (!preset) {
      return c.json({ success: false, error: 'Preset not found for this equipment' }, 400)
    }

    // 4. card_item QUEUED 상태로 업데이트
    await c.env.DB.prepare(`
      UPDATE card_items SET
        rip_equipment_id = ?,
        rip_preset = ?,
        rip_status = 'QUEUED',
        rip_queued_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(equipment_id, rip_preset, cardItemId).run()

    // 5. 카드 rip_status 동기화 + 상태 이력
    const user = c.get('user') as any
    if (cardItem.card_status !== 'RIP_WAITING' && cardItem.card_status !== 'PRINTING') {
      await c.env.DB.prepare(`
        UPDATE cards SET rip_status = 'QUEUED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(cardItem.card_id).run()
    }

    await c.env.DB.prepare(`
      INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      cardItem.card_id, cardItem.card_status, cardItem.card_status,
      user?.id || 1,
      `RIP 아이템(#${cardItemId}) 전송: ${cardItem.item_name} → ${equipment.name} / ${rip_preset}`
    ).run()

    return c.json({
      success: true,
      data: {
        card_item_id: Number(cardItemId),
        card_id: cardItem.card_id,
        rip_status: 'QUEUED',
        equipment_id,
        rip_preset
      }
    })
  } catch (error) {
    console.error('src/routes/rip.ts send-item error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── POST /api/rip/send-items-bulk — 여러 아이템 일괄 전송 (JWT) ────────────

ripRouter.post('/send-items-bulk', authMiddleware, async (c) => {
  try {
    const { items } = await c.req.json() as { items: Array<{ card_item_id: number, equipment_id: string, rip_preset: string }> }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: 'items array is required' }, 400)
    }

    const results: any[] = []
    const errors: any[] = []
    const cardIdsToUpdate = new Set<number>()

    for (const item of items) {
      if (!Number.isInteger(item.card_item_id) || item.card_item_id <= 0 ||
          !item.equipment_id?.trim() || !item.rip_preset?.trim()) {
        errors.push({ card_item_id: item.card_item_id, error: 'Missing required fields' })
        continue
      }

      // card_item 조회
      const cardItem = await c.env.DB.prepare(`
        SELECT ci.id, ci.card_id, ci.rip_status,
               c.card_number, c.status as card_status,
               oi.item_name
        FROM card_items ci
        JOIN cards c ON ci.card_id = c.id
        JOIN order_items oi ON ci.order_item_id = oi.id
        WHERE ci.id = ?
      `).bind(item.card_item_id).first() as any

      if (!cardItem) {
        errors.push({ card_item_id: item.card_item_id, error: 'Not found' })
        continue
      }

      if (cardItem.rip_status === 'QUEUED' || cardItem.rip_status === 'SENT') {
        errors.push({ card_item_id: item.card_item_id, error: `Already ${cardItem.rip_status}` })
        continue
      }

      // 장비 + 프리셋 검증
      const equipment = await c.env.DB.prepare(
        "SELECT id FROM equipment WHERE id = ? AND status = 'ACTIVE'"
      ).bind(item.equipment_id).first()

      if (!equipment) {
        errors.push({ card_item_id: item.card_item_id, error: 'Equipment inactive' })
        continue
      }

      const preset = await c.env.DB.prepare(
        'SELECT id FROM equipment_presets WHERE equipment_id = ? AND preset_name = ?'
      ).bind(item.equipment_id, item.rip_preset).first()

      if (!preset) {
        errors.push({ card_item_id: item.card_item_id, error: 'Preset not found' })
        continue
      }

      // 업데이트
      await c.env.DB.prepare(`
        UPDATE card_items SET
          rip_equipment_id = ?, rip_preset = ?, rip_status = 'QUEUED', rip_queued_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(item.equipment_id, item.rip_preset, item.card_item_id).run()

      cardIdsToUpdate.add(cardItem.card_id)
      results.push({ card_item_id: item.card_item_id, rip_status: 'QUEUED' })
    }

    // 카드 rip_status 일괄 동기화 (중복 제거)
    for (const cardId of cardIdsToUpdate) {
      await c.env.DB.prepare(`
        UPDATE cards SET rip_status = 'QUEUED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(cardId).run()
    }

    return c.json({ success: true, data: { sent: results, errors } })
  } catch (error) {
    console.error('src/routes/rip.ts send-items-bulk error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── GET /api/rip/pending-items — QUEUED 아이템 목록 (API Key, LogWatcher용) ──

ripRouter.get('/pending-items', agentKeyMiddleware, async (c) => {
  try {
    const equipment_id = c.req.query('equipment_id')?.trim()

    if (!equipment_id) {
      return c.json({ success: false, error: 'equipment_id query parameter is required' }, 400)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT
        ci.id as card_item_id,
        ci.card_id,
        ci.source_file_path,
        ci.rip_preset,
        ci.quantity,
        c.card_number,
        c.rip_filename,
        c.priority,
        c.delivery_date,
        oi.item_name,
        oi.width,
        oi.height,
        oi.scale_factor
      FROM card_items ci
      JOIN cards c ON ci.card_id = c.id
      JOIN order_items oi ON ci.order_item_id = oi.id
      WHERE ci.rip_equipment_id = ?
        AND ci.rip_status = 'QUEUED'
        AND COALESCE(ci.rip_retry_count, 0) < 5
      ORDER BY c.priority DESC, c.delivery_date ASC
      LIMIT 10
    `).bind(equipment_id).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/rip.ts pending-items error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── POST /api/rip/ack-item/:cardItemId — 아이템 수신 확인 (API Key) ─────────

ripRouter.post('/ack-item/:cardItemId', agentKeyMiddleware, async (c) => {
  try {
    const cardItemId = Number(c.req.param('cardItemId'))
    if (!Number.isInteger(cardItemId) || cardItemId <= 0) {
      return c.json({ success: false, error: 'Invalid card_item_id' }, 400)
    }

    const { job_path } = await c.req.json()

    if (!job_path || typeof job_path !== 'string' || !job_path.trim()) {
      return c.json({ success: false, error: 'job_path is required' }, 400)
    }

    const cardItem = await c.env.DB.prepare(`
      SELECT ci.id, ci.card_id, ci.rip_status, ci.rip_job_path, c.status as card_status
      FROM card_items ci
      JOIN cards c ON ci.card_id = c.id
      WHERE ci.id = ?
    `).bind(cardItemId).first() as any

    if (!cardItem) {
      return c.json({ success: false, error: 'Card item not found' }, 404)
    }

    // Idempotent: 이미 SENT 상태면 성공 반환 (ACK 재시도 대응)
    if (cardItem.rip_status === 'SENT') {
      return c.json({
        success: true,
        data: {
          card_item_id: Number(cardItemId),
          card_id: cardItem.card_id,
          rip_status: 'SENT',
          job_path: cardItem.rip_job_path || job_path,
          duplicate: true
        }
      })
    }

    if (cardItem.rip_status !== 'QUEUED') {
      return c.json({ success: false, error: `Card item is in ${cardItem.rip_status} status, expected QUEUED` }, 400)
    }

    await c.env.DB.prepare(`
      UPDATE card_items SET
        rip_status = 'SENT',
        rip_sent_at = CURRENT_TIMESTAMP,
        rip_job_path = ?,
        rip_retry_count = 0,
        rip_error_reason = NULL
      WHERE id = ? AND rip_status = 'QUEUED'
    `).bind(job_path, cardItemId).run()

    // 카드의 모든 아이템이 SENT 이상인지 확인 → 카드 rip_status 갱신
    const { results: remainingQueued } = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM card_items WHERE card_id = ? AND rip_status = 'QUEUED'
    `).bind(cardItem.card_id).all() as any

    if (remainingQueued[0]?.cnt === 0) {
      await c.env.DB.prepare(`
        UPDATE cards SET rip_status = 'SENT', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(cardItem.card_id).run()
    }

    return c.json({
      success: true,
      data: {
        card_item_id: Number(cardItemId),
        card_id: cardItem.card_id,
        rip_status: 'SENT',
        job_path
      }
    })
  } catch (error) {
    console.error('src/routes/rip.ts ack-item error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── POST /api/rip/fail-item/:cardItemId — 잡 생성 실패 보고 (API Key, LogWatcher용) ──
// 소스 파일 미존재 등으로 잡 생성 실패 시 retry_count 증가 + 에러 사유 기록
// retry_count >= 5가 되면 pending-items에서 제외됨 (무한 루프 방지)

ripRouter.post('/fail-item/:cardItemId', agentKeyMiddleware, async (c) => {
  try {
    const cardItemId = Number(c.req.param('cardItemId'))
    if (!Number.isInteger(cardItemId) || cardItemId <= 0) {
      return c.json({ success: false, error: 'Invalid card_item_id' }, 400)
    }

    const { reason } = await c.req.json()

    await c.env.DB.prepare(`
      UPDATE card_items SET
        rip_retry_count = COALESCE(rip_retry_count, 0) + 1,
        rip_error_reason = ?
      WHERE id = ? AND rip_status = 'QUEUED'
    `).bind(reason || 'unknown', cardItemId).run()

    // retry_count >= 5면 ERROR로 전환
    const item = await c.env.DB.prepare(
      `SELECT rip_retry_count FROM card_items WHERE id = ?`
    ).bind(cardItemId).first() as any

    if (item && item.rip_retry_count >= 5) {
      await c.env.DB.prepare(`
        UPDATE card_items SET rip_status = 'ERROR' WHERE id = ?
      `).bind(cardItemId).run()
    }

    return c.json({
      success: true,
      data: {
        card_item_id: cardItemId,
        rip_retry_count: item?.rip_retry_count || 0,
        rip_status: (item?.rip_retry_count >= 5) ? 'ERROR' : 'QUEUED'
      }
    })
  } catch (error) {
    console.error('src/routes/rip.ts fail-item error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── GET /api/rip/card-items/:cardId — 카드의 아이템별 RIP 상태 (JWT) ────────

ripRouter.get('/card-items/:cardId', authMiddleware, async (c) => {
  try {
    const cardId = Number(c.req.param('cardId'))
    if (!Number.isInteger(cardId) || cardId <= 0) {
      return c.json({ success: false, error: 'Invalid card_id' }, 400)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT
        ci.id as card_item_id,
        ci.card_id,
        ci.order_item_id,
        ci.quantity,
        ci.print_completed,
        ci.source_file_path,
        ci.rip_equipment_id,
        ci.rip_preset,
        ci.rip_status,
        ci.rip_queued_at,
        ci.rip_sent_at,
        oi.item_name,
        oi.width,
        oi.height,
        oi.content,
        oi.post_processing,
        oi.scale_factor,
        oi.ai_analysis_id,
        oi.ai_group_index
      FROM card_items ci
      JOIN order_items oi ON ci.order_item_id = oi.id
      WHERE ci.card_id = ?
      ORDER BY oi.sort_order ASC
    `).bind(cardId).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/rip.ts card-items error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default ripRouter