import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole, agentKeyMiddleware } from '../middleware/auth'
import { getEntityId, entityFilter, cardEntityFilter } from '../utils/entityFilter'
import { PROCESS_CODES } from '../constants/process'
import { kstDate, kstDateOf } from '../utils/kstDate'
import { EQUIP_STATUS_LABELS } from '../utils/statusLabels'

// ─── D1 row types ───────────────────────────────────────────────────────────

interface CardRipRow {
  id: number
  card_number: string
  rip_filename: string | null
  rip_status: string | null
  rip_sent_at: string | null
  rip_preview_path: string | null
  rip_job_path: string | null
  rip_queued_at: string | null
  equipment_id: string | null
  rip_preset: string | null
  status: string
  client_name: string | null
  item_name: string | null
}

interface EquipmentRow {
  id: string
  name: string
  printer_name: string | null
  ip_address: string | null
  status: string
  head_count: number | null
  location_zone: string | null
  location_x: number | null
  location_y: number | null
  notes: string | null
  equipment_status: string | null
  daily_capacity: number | null
  size_type: string | null
  last_seen_at: string | null
  print_log_path: string | null
  agent_id: string | null
  agent_ip: string | null
  agent_status: string
}

interface PresetRow {
  id: number
  equipment_id: string
  preset_name: string
  tps_filename: string | null
  description: string | null
  is_default: number
}

interface HeadRow {
  id: number
  equipment_id: string
  head_number: number
  status: string
  replaced_at: string | null
  notes: string | null
}

interface ConsumableRow {
  id: number
  equipment_id: string
  name: string
  replacement_cycle_days: number
  last_replaced_at: string | null
  next_due_at: string | null
  quantity_on_hand: number
  notes: string | null
}

interface ScheduleRow {
  id: number
  equipment_id: string
  title: string
  description: string | null
  interval_days: number
  checklist: string | null
  next_due_at: string | null
  last_performed_at: string | null
  is_active: number
}

interface CardFullRow {
  id: number
  card_number: string
  status: string
  rip_filename: string | null
  rip_status: string | null
  rip_sent_at: string | null
  rip_job_path: string | null
  equipment_id: string | null
  rip_preset: string | null
  source_file_path: string | null
  width: number | null
  height: number | null
  quantity: number | null
  priority: number | null
  delivery_date: string | null
  client_name: string | null
  item_name: string | null
}

interface CardItemJoinRow {
  id: number
  card_id: number
  order_item_id: number
  quantity: number
  rip_status: string | null
  rip_job_path: string | null
  source_file_path: string | null
  card_number: string
  card_status: string
  delivery_date: string | null
  priority: number | null
  item_name: string | null
  width: number | null
  height: number | null
  content: string | null
  scale_factor: number | null
  rip_equipment_id: string | null
  rip_preset: string | null
}

interface CountRow {
  cnt: number
}

interface RetryCountRow {
  rip_retry_count: number
}

interface UptimeRow {
  active_days: number
}

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
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `).all<CardRipRow>()

    const summary = {
      total: cards.length,
      queued: cards.filter((r) => r.rip_status === 'QUEUED').length,
      sent: cards.filter((r) => r.rip_sent_at).length,
      pending: cards.filter((r) => !r.rip_sent_at).length,
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
    const ef = entityFilter(c, 'e')  // #342 설비 법인 격리
    const { results: equipmentList } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.printer_name, e.ip_address, e.status,
        e.head_count, e.location_zone, e.zone_id, e.location_x, e.location_y, e.layout_rotation,
        e.notes, e.equipment_status, e.daily_capacity, e.size_type,
        e.last_seen_at,
        e.print_log_path,
        e.agent_id,
        ah.ip_address as agent_ip,
        CASE
          WHEN e.last_seen_at IS NULL THEN 'OFFLINE'
          WHEN (julianday('now') - julianday(e.last_seen_at)) * 86400 > 120 THEN 'OFFLINE'
          ELSE 'ONLINE'
        END as agent_status
      FROM equipment e
      LEFT JOIN agent_heartbeats ah ON ah.agent_id = e.agent_id
      WHERE e.status = 'ACTIVE'${ef.clause}
      ORDER BY e.id
    `).bind(...ef.params).all<EquipmentRow>()

    // 프리셋 일괄 조회 (N+1 → 단일 쿼리)
    const eqIds = equipmentList.map((eq) => eq.id)
    let presetsMap: Record<string, PresetRow[]> = {}
    if (eqIds.length > 0) {
      const placeholders = eqIds.map(() => '?').join(',')
      const { results: allPresets } = await c.env.DB.prepare(`
        SELECT id, equipment_id, preset_name, tps_filename, description, is_default
        FROM equipment_presets
        WHERE equipment_id IN (${placeholders})
        ORDER BY is_default DESC, preset_name ASC, id ASC
      `).bind(...eqIds).all<PresetRow>()
      for (const p of allPresets) {
        if (!presetsMap[p.equipment_id]) presetsMap[p.equipment_id] = []
        presetsMap[p.equipment_id].push(p)
      }
    }

    // 공정 일괄 조회 (N+1 → 단일 쿼리). equipment_processes(0389)
    const processesMap: Record<string, Array<{ process_code: string; is_primary: number }>> = {}
    if (eqIds.length > 0) {
      const placeholders = eqIds.map(() => '?').join(',')
      const { results: allProcs } = await c.env.DB.prepare(`
        SELECT equipment_id, process_code, is_primary
        FROM equipment_processes
        WHERE equipment_id IN (${placeholders})
        ORDER BY is_primary DESC, process_code ASC
      `).bind(...eqIds).all<{ equipment_id: string; process_code: string; is_primary: number }>()
      for (const p of allProcs) {
        if (!processesMap[p.equipment_id]) processesMap[p.equipment_id] = []
        processesMap[p.equipment_id].push({ process_code: p.process_code, is_primary: p.is_primary })
      }
    }

    const result = equipmentList.map((eq) => ({
      ...eq,
      presets: presetsMap[eq.id] || [],
      processes: processesMap[eq.id] || []
    }))

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
    const { id, name, printer_name, ip_address, size_type } = await c.req.json()

    if (!id || !name) {
      return c.json({ success: false, error: 'id and name are required' }, 400)
    }

    await c.env.DB.prepare(`
      INSERT INTO equipment (id, name, printer_name, ip_address, size_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, name, printer_name || null, ip_address || null, size_type || 'LARGE', getEntityId(c) || 1).run()

    const equipment = await c.env.DB.prepare(
      'SELECT id, name, printer_name, ip_address, status, equipment_status, head_count, location_x, location_y, location_zone, zone_id, daily_capacity, size_type, notes, created_at, updated_at FROM equipment WHERE id = ?'
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

    const ef = entityFilter(c)  // #342 타법인 설비 수정 차단
    const existing = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first()

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
    if (body.zone_id !== undefined) { fields.push('zone_id = ?'); values.push(body.zone_id) }
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
      'SELECT id, name, printer_name, ip_address, status, equipment_status, head_count, location_x, location_y, location_zone, zone_id, daily_capacity, size_type, notes, created_at, updated_at FROM equipment WHERE id = ?'
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

// ─── PUT /api/rip/equipment/:id/processes — 장비 공정 다중 지정 (admin) ──────
// body: { processes: [{ code, is_primary }] }  (replace-all). code는 PROCESS_CODES 검증.
ripRouter.put('/equipment/:id/processes', authMiddleware, requireRole('ADMIN'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const body = await c.req.json<{ processes?: Array<{ code: string; is_primary?: number | boolean }> }>()

    const ef = entityFilter(c)  // 타법인 설비 공정 변경 차단 (ADMIN 전체모드는 생략)
    const existing = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first()
    if (!existing) return c.json({ success: false, error: 'Equipment not found' }, 404)

    // 유효 코드만, 중복 제거
    const raw = Array.isArray(body.processes) ? body.processes : []
    const seen = new Set<string>()
    const valid: Array<{ code: string; is_primary: boolean }> = []
    for (const p of raw) {
      const code = String(p?.code || '').toUpperCase()
      if (!PROCESS_CODES.includes(code) || seen.has(code)) continue
      seen.add(code)
      valid.push({ code, is_primary: !!p.is_primary })
    }
    // 대표 공정: is_primary 표시된 첫 항목, 없으면 첫 항목
    let primaryCode = valid.find((v) => v.is_primary)?.code || (valid[0]?.code ?? null)

    const stmts = [
      c.env.DB.prepare('DELETE FROM equipment_processes WHERE equipment_id = ?').bind(equipId),
    ]
    for (const v of valid) {
      stmts.push(
        c.env.DB.prepare(
          'INSERT INTO equipment_processes (equipment_id, process_code, is_primary) VALUES (?, ?, ?)'
        ).bind(equipId, v.code, v.code === primaryCode ? 1 : 0)
      )
    }
    await c.env.DB.batch(stmts)

    return c.json({ success: true, data: { processes: valid.map((v) => ({ process_code: v.code, is_primary: v.code === primaryCode ? 1 : 0 })) } })
  } catch (error) {
    console.error('src/routes/rip.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
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

    const ef = entityFilter(c)  // #561 타법인 설비 프리셋 추가 차단
    const equipment = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first()

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
      'SELECT id, equipment_id, preset_name, tps_filename, description, is_default FROM equipment_presets WHERE id = ?'
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

    const ef = entityFilter(c)  // #561 타법인 설비 프리셋 삭제 차단 (부모 설비 소유 검증)
    const preset = await c.env.DB.prepare(
      `SELECT p.id FROM equipment_presets p JOIN equipment e ON p.equipment_id = e.id
       WHERE p.id = ? AND p.equipment_id = ?${entityFilter(c, 'e').clause}`
    ).bind(presetId, equipId, ...ef.params).first()

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
      WHERE e.id = ?${entityFilter(c, 'e').clause}
    `).bind(equipId, ...entityFilter(c, 'e').params).first<EquipmentRow>()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    // 프리셋
    const { results: presets } = await c.env.DB.prepare(
      'SELECT id, equipment_id, preset_name, tps_filename, description, is_default FROM equipment_presets WHERE equipment_id = ? ORDER BY is_default DESC, preset_name ASC'
    ).bind(equipId).all()

    // 헤드
    const { results: heads } = await c.env.DB.prepare(
      'SELECT id, equipment_id, head_number, status, replaced_at, notes, updated_at FROM equipment_heads WHERE equipment_id = ? ORDER BY head_number ASC'
    ).bind(equipId).all()

    // 최근 유지보수 이력 (20건)
    const { results: logs } = await c.env.DB.prepare(`
      SELECT ml.*, u.name as performed_by_name
      FROM maintenance_logs ml
      LEFT JOIN users u ON ml.performed_by = u.id
      WHERE ml.equipment_id = ?
      ORDER BY ml.performed_at DESC, ml.id DESC
      LIMIT 20
    `).bind(equipId).all()

    // 공정 (equipment_processes 0389)
    const { results: processes } = await c.env.DB.prepare(
      'SELECT process_code, is_primary FROM equipment_processes WHERE equipment_id = ? ORDER BY is_primary DESC, process_code ASC'
    ).bind(equipId).all()

    return c.json({
      success: true,
      data: { ...equipment, presets, heads, maintenance_logs: logs, processes }
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

    const ef = entityFilter(c)  // #342
    const existing = await c.env.DB.prepare(
      `SELECT id, equipment_status FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first<{ id: string; equipment_status: string | null }>()

    if (!existing) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    const prevStatus = existing.equipment_status || 'IDLE'

    await c.env.DB.prepare(
      'UPDATE equipment SET equipment_status = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(equipment_status, notes || null, equipId).run()

    // 상태 변경 이력 기록 — 라벨은 EQUIP_STATUS_LABELS SSOT (utils/statusLabels.ts)
    const equipStatusLabel = EQUIP_STATUS_LABELS
    await c.env.DB.prepare(`
      INSERT INTO maintenance_logs (equipment_id, log_type, description, performed_by)
      VALUES (?, 'STATUS_CHANGE', ?, ?)
    `).bind(
      equipId,
      `상태 변경: ${equipStatusLabel[prevStatus] || prevStatus} → ${equipStatusLabel[equipment_status] || equipment_status}` + (notes ? ` (${notes})` : ''),
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

    const ef = entityFilter(c)  // #342
    const existing = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first()

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
    // 부분 업데이트: 드래그=location_x/y, 회전=layout_rotation (서로 클로버링 방지)
    const body = await c.req.json<{ location_x?: number; location_y?: number; location_zone?: string; layout_rotation?: number }>()

    const fields: string[] = []
    const values: any[] = []
    if (body.location_x !== undefined) { fields.push('location_x = ?'); values.push(body.location_x) }
    if (body.location_y !== undefined) { fields.push('location_y = ?'); values.push(body.location_y) }
    if (body.location_zone !== undefined) { fields.push('location_zone = COALESCE(?, location_zone)'); values.push(body.location_zone || null) }
    if (body.layout_rotation !== undefined) { fields.push('layout_rotation = ?'); values.push((((Number(body.layout_rotation) || 0) % 360) + 360) % 360) }
    if (fields.length === 0) return c.json({ success: false, error: 'No fields to update' }, 400)
    fields.push('updated_at = CURRENT_TIMESTAMP')

    const ef = entityFilter(c)  // #342
    values.push(equipId, ...ef.params)
    await c.env.DB.prepare(
      `UPDATE equipment SET ${fields.join(', ')} WHERE id = ?${ef.clause}`
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

// ─── POST /api/rip/equipment/:id/heads — 헤드 초기화/추가 ───────────────────

ripRouter.post('/equipment/:id/heads', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const { head_count } = await c.req.json()

    if (!head_count || head_count < 1 || head_count > 16) {
      return c.json({ success: false, error: '헤드 수는 1~16 사이여야 합니다' }, 400)
    }

    const ef = entityFilter(c)  // #342
    const equipment = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    // 기존 헤드 삭제 후 재생성 (N+1 제거: DELETE + INSERT를 db.batch로 원자적 처리)
    const headStmts: D1PreparedStatement[] = [
      c.env.DB.prepare('DELETE FROM equipment_heads WHERE equipment_id = ?').bind(equipId)
    ]
    for (let i = 1; i <= head_count; i++) {
      headStmts.push(c.env.DB.prepare(
        'INSERT INTO equipment_heads (equipment_id, head_number, status) VALUES (?, ?, ?)'
      ).bind(equipId, i, 'NORMAL'))
    }
    await c.env.DB.batch(headStmts)

    // equipment.head_count 업데이트
    await c.env.DB.prepare(
      'UPDATE equipment SET head_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(head_count, equipId).run()

    const { results: heads } = await c.env.DB.prepare(
      'SELECT id, equipment_id, head_number, status, replaced_at, notes, updated_at FROM equipment_heads WHERE equipment_id = ? ORDER BY head_number'
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

ripRouter.put('/equipment/:id/heads/:headNum', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const equipId = c.req.param('id')
    const headNum = parseInt(c.req.param('headNum'))
    const user = c.get('user')
    const { status, replaced_at, notes } = await c.req.json()

    const validStatuses = ['NORMAL', 'CLOGGED', 'REPLACE_NEEDED', 'REPLACED']
    if (status && !validStatuses.includes(status)) {
      return c.json({ success: false, error: `헤드 상태는 ${validStatuses.join('|')} 중 하나여야 합니다` }, 400)
    }

    // #561: 형제 POST /heads(:691)와 동일하게 부모 설비 법인 소유 검증 (타법인 헤드 상태 변조 차단).
    const efHead = entityFilter(c)
    const ownerEquip = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${efHead.clause}`
    ).bind(equipId, ...efHead.params).first()
    if (!ownerEquip) return c.json({ success: false, error: 'Equipment not found' }, 404)

    const head = await c.env.DB.prepare(
      'SELECT id, equipment_id, head_number, status, replaced_at, notes, updated_at FROM equipment_heads WHERE equipment_id = ? AND head_number = ?'
    ).bind(equipId, headNum).first<HeadRow>()

    if (!head) {
      return c.json({ success: false, error: 'Head not found' }, 404)
    }

    const fields: string[] = ['updated_at = CURRENT_TIMESTAMP']
    const values: any[] = [] // dynamic SQL params

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
      'SELECT id, equipment_id, head_number, status, replaced_at, notes, updated_at FROM equipment_heads WHERE equipment_id = ? AND head_number = ?'
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

ripRouter.post('/equipment/:id/maintenance', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
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

    const ef = entityFilter(c)  // #561 타법인 설비 유지보수 이력 기록 차단
    const equipment = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first()

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

    // #561: 부모 설비 법인 소유 검증 (타법인 유지보수 이력 삭제 차단).
    const existing = await c.env.DB.prepare(
      `SELECT ml.id FROM maintenance_logs ml JOIN equipment e ON ml.equipment_id = e.id
       WHERE ml.id = ?${entityFilter(c, 'e').clause}`
    ).bind(logId, ...entityFilter(c).params).first()

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
    const ef = entityFilter(c)  // #342 소모품 법인 격리
    const { results } = await c.env.DB.prepare(`
      SELECT id, equipment_id, name, replacement_cycle_days, last_replaced_at, next_due_at, quantity_on_hand, notes, created_at, updated_at,
        CASE
          WHEN next_due_at IS NOT NULL AND next_due_at <= ${kstDate()} THEN 'OVERDUE'
          WHEN next_due_at IS NOT NULL AND next_due_at <= date('now', '+9 hours', '+7 days') THEN 'DUE_SOON'
          ELSE 'OK'
        END as due_status
      FROM equipment_consumables
      WHERE equipment_id = ?${ef.clause}
      ORDER BY next_due_at IS NULL, next_due_at ASC, id ASC
    `).bind(equipId, ...ef.params).all()

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

    const ef = entityFilter(c)  // #342
    const equipment = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    const cycleDays = body.replacement_cycle_days || 0
    const lastReplaced = body.last_replaced_at || new Date().toISOString()
    const nextDue = cycleDays > 0
      ? new Date(new Date(lastReplaced).getTime() + cycleDays * 86400000).toISOString().substring(0, 10)
      : null

    const result = await c.env.DB.prepare(`
      INSERT INTO equipment_consumables (equipment_id, name, replacement_cycle_days, last_replaced_at, next_due_at, quantity_on_hand, notes, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      equipId, body.name, cycleDays,
      lastReplaced, nextDue,
      body.quantity_on_hand || 0,
      body.notes || null,
      getEntityId(c) || 1
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

    const ef = entityFilter(c)  // #342
    const existing = await c.env.DB.prepare(
      `SELECT id, equipment_id, name, replacement_cycle_days, last_replaced_at, next_due_at, quantity_on_hand, notes, created_at, updated_at FROM equipment_consumables WHERE id = ?${ef.clause}`
    ).bind(cid, ...ef.params).first<ConsumableRow>()

    if (!existing) {
      return c.json({ success: false, error: 'Consumable not found' }, 404)
    }

    const fields: string[] = []
    const values: any[] = [] // dynamic SQL params

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

    const ef = entityFilter(c)  // #342
    const consumable = await c.env.DB.prepare(
      `SELECT id, equipment_id, name, replacement_cycle_days, last_replaced_at, next_due_at, quantity_on_hand, notes FROM equipment_consumables WHERE id = ? AND equipment_id = ?${ef.clause}`
    ).bind(cid, equipId, ...ef.params).first<ConsumableRow>()

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
    const ef = entityFilter(c)  // #342
    await c.env.DB.prepare(`DELETE FROM equipment_consumables WHERE id = ?${ef.clause}`).bind(cid, ...ef.params).run()
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
    const ef = entityFilter(c)  // #342 정비 스케줄 법인 격리
    const { results } = await c.env.DB.prepare(`
      SELECT id, equipment_id, title, description, interval_days, checklist, last_performed_at, next_due_at, is_active, created_at, updated_at,
        CASE
          WHEN next_due_at IS NOT NULL AND next_due_at <= ${kstDate()} THEN 'OVERDUE'
          WHEN next_due_at IS NOT NULL AND next_due_at <= date('now', '+9 hours', '+7 days') THEN 'DUE_SOON'
          ELSE 'OK'
        END as due_status
      FROM maintenance_schedules
      WHERE equipment_id = ? AND is_active = 1${ef.clause}
      ORDER BY next_due_at IS NULL, next_due_at ASC, id ASC
    `).bind(equipId, ...ef.params).all()

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

    const ef = entityFilter(c)  // #342
    const equipment = await c.env.DB.prepare(
      `SELECT id FROM equipment WHERE id = ?${ef.clause}`
    ).bind(equipId, ...ef.params).first()

    if (!equipment) {
      return c.json({ success: false, error: 'Equipment not found' }, 404)
    }

    const nextDue = new Date(Date.now() + body.interval_days * 86400000).toISOString().substring(0, 10)

    const result = await c.env.DB.prepare(`
      INSERT INTO maintenance_schedules (equipment_id, title, description, interval_days, checklist, next_due_at, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      equipId, body.title, body.description || null,
      body.interval_days, body.checklist || null, nextDue, getEntityId(c) || 1
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

    const ef = entityFilter(c)  // #342
    const schedule = await c.env.DB.prepare(
      `SELECT id, equipment_id, title, description, interval_days, checklist, last_performed_at, next_due_at, is_active FROM maintenance_schedules WHERE id = ? AND equipment_id = ?${ef.clause}`
    ).bind(sid, equipId, ...ef.params).first<ScheduleRow>()

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
    const ef = entityFilter(c)  // #342
    await c.env.DB.prepare(
      `UPDATE maintenance_schedules SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?${ef.clause}`
    ).bind(sid, ...ef.params).run()
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
        AND pe.event_kind = 'PRINT'
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
        AND pe.event_kind = 'PRINT'
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
        AND event_kind = 'PRINT'
        AND ${kstDateOf('print_completed_at')} = ${kstDate()}
    `).bind(equipId).first()

    // 가동률 (최근 7일: 출력 이벤트가 있는 시간대 비율)
    const uptimeData = await c.env.DB.prepare(`
      SELECT
        COUNT(DISTINCT date(print_completed_at)) as active_days
      FROM print_events
      WHERE equipment_id = ?
        AND print_status = 'OK'
        AND event_kind = 'PRINT'
        AND print_completed_at >= date('now', '-7 days')
    `).bind(equipId).first<UptimeRow>()

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

ripRouter.get('/maintenance/alerts', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'e')  // #342 설비 법인 격리
    // 교체 기한 도래 소모품
    const { results: consumableAlerts } = await c.env.DB.prepare(`
      SELECT ec.*, e.name as equipment_name,
        CASE
          WHEN ec.next_due_at <= ${kstDate()} THEN 'OVERDUE'
          ELSE 'DUE_SOON'
        END as alert_type
      FROM equipment_consumables ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE e.status = 'ACTIVE'${ef.clause}
        AND ec.next_due_at IS NOT NULL
        AND ec.next_due_at <= date('now', '+9 hours', '+7 days')
      ORDER BY ec.next_due_at ASC, ec.id ASC
    `).bind(...ef.params).all()

    // 정비 기한 도래 스케줄
    const { results: scheduleAlerts } = await c.env.DB.prepare(`
      SELECT ms.*, e.name as equipment_name,
        CASE
          WHEN ms.next_due_at <= ${kstDate()} THEN 'OVERDUE'
          ELSE 'DUE_SOON'
        END as alert_type
      FROM maintenance_schedules ms
      JOIN equipment e ON ms.equipment_id = e.id
      WHERE e.status = 'ACTIVE' AND ms.is_active = 1${ef.clause}
        AND ms.next_due_at IS NOT NULL
        AND ms.next_due_at <= date('now', '+9 hours', '+7 days')
      ORDER BY ms.next_due_at ASC, ms.id ASC
    `).bind(...ef.params).all()

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
    const cardEf = cardEntityFilter(c)  // #449: 카드 단건 cross-tenant read 차단 (requesting_entity_id, /cards 칸반과 동일 격리)
    const card = await c.env.DB.prepare(
      `SELECT id, card_number, status, rip_filename, rip_status, rip_sent_at, rip_job_path,
              equipment_id, rip_preset, source_file_path, width, height, quantity,
              priority, delivery_date, client_name, item_name
       FROM cards WHERE id = ?${cardEf.clause}`
    ).bind(cardId, ...cardEf.params).first<CardFullRow>()

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
    `).bind(cardId, prevStatus, prevStatus, null, `RIP queued → equipment: ${equipment_id}, preset: ${rip_preset}`).run()

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

    const cardEf = cardEntityFilter(c)  // #449: 카드 단건 cross-tenant read 차단 (requesting_entity_id, /cards 칸반과 동일 격리)
    const card = await c.env.DB.prepare(
      `SELECT id, card_number, status, rip_filename, rip_status, rip_sent_at, rip_job_path,
              equipment_id, rip_preset, source_file_path, width, height, quantity,
              priority, delivery_date, client_name, item_name
       FROM cards WHERE id = ?${cardEf.clause}`
    ).bind(cardId, ...cardEf.params).first<CardFullRow>()

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
    `).bind(cardId, card.status, 'PRINT_DONE', null, 'RIP job completed').run()

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

    const cardEf = cardEntityFilter(c)  // #449: 카드 단건 cross-tenant read 차단 (requesting_entity_id, /cards 칸반과 동일 격리)
    const card = await c.env.DB.prepare(
      `SELECT id, card_number, status, rip_filename, rip_status, rip_sent_at, rip_job_path,
              equipment_id, rip_preset, source_file_path, width, height, quantity,
              priority, delivery_date, client_name, item_name
       FROM cards WHERE id = ?${cardEf.clause}`
    ).bind(cardId, ...cardEf.params).first<CardFullRow>()

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
      ORDER BY c.priority DESC, c.delivery_date ASC, c.id ASC
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
    ).bind(cardId).first<{ id: number; status: string; rip_status: string }>()

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
    `).bind(cardId, card.status, card.status, null, `RIP ACK received, job_path: ${job_path}`).run()

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
    `).bind(cardItemId).first<CardItemJoinRow>()

    if (!cardItem) {
      return c.json({ success: false, error: 'Card item not found' }, 404)
    }

    if (cardItem.rip_status === 'QUEUED' || cardItem.rip_status === 'SENT') {
      return c.json({ success: false, error: `이미 RIP 전송됨 (${cardItem.rip_status})` }, 400)
    }

    // 2. equipment 존재 확인
    const equipment = await c.env.DB.prepare(
      "SELECT id, name FROM equipment WHERE id = ? AND status = 'ACTIVE'"
    ).bind(equipment_id).first<{ id: string; name: string }>()

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
    const user = c.get('user')
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
      user?.id || null,
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

    const results: Array<{ card_item_id: number; rip_status: string }> = []
    const errors: Array<{ card_item_id: number; error: string }> = []
    const cardIdsToUpdate = new Set<number>()

    // N+1 제거: card_item / equipment / preset 를 IN(...)으로 일괄 선조회
    const validItems = items.filter((it) =>
      Number.isInteger(it.card_item_id) && it.card_item_id > 0 &&
      it.equipment_id?.trim() && it.rip_preset?.trim()
    )
    const cardItemIds = [...new Set(validItems.map((it) => it.card_item_id))]
    const equipmentIds = [...new Set(validItems.map((it) => it.equipment_id))]

    const cardItemMap = new Map<number, { id: number; card_id: number; rip_status: string | null; card_number: string; card_status: string; item_name: string | null }>()
    if (cardItemIds.length > 0) {
      const ph = cardItemIds.map(() => '?').join(',')
      const { results: ciRows } = await c.env.DB.prepare(`
        SELECT ci.id, ci.card_id, ci.rip_status,
               c.card_number, c.status as card_status,
               oi.item_name
        FROM card_items ci
        JOIN cards c ON ci.card_id = c.id
        JOIN order_items oi ON ci.order_item_id = oi.id
        WHERE ci.id IN (${ph})
      `).bind(...cardItemIds).all<{ id: number; card_id: number; rip_status: string | null; card_number: string; card_status: string; item_name: string | null }>()
      for (const r of ciRows) cardItemMap.set(r.id, r)
    }

    const activeEquipment = new Set<string>()
    const presetSet = new Set<string>()
    if (equipmentIds.length > 0) {
      const ph = equipmentIds.map(() => '?').join(',')
      const { results: eqRows } = await c.env.DB.prepare(
        `SELECT id FROM equipment WHERE status = 'ACTIVE' AND id IN (${ph})`
      ).bind(...equipmentIds).all<{ id: string | number }>()
      for (const r of eqRows) activeEquipment.add(String(r.id))
      const { results: presetRows } = await c.env.DB.prepare(
        `SELECT equipment_id, preset_name FROM equipment_presets WHERE equipment_id IN (${ph})`
      ).bind(...equipmentIds).all<{ equipment_id: string | number; preset_name: string }>()
      for (const r of presetRows) presetSet.add(`${r.equipment_id}|${r.preset_name}`)
    }

    const updateStmts: D1PreparedStatement[] = []
    for (const item of items) {
      if (!Number.isInteger(item.card_item_id) || item.card_item_id <= 0 ||
          !item.equipment_id?.trim() || !item.rip_preset?.trim()) {
        errors.push({ card_item_id: item.card_item_id, error: 'Missing required fields' })
        continue
      }

      const cardItem = cardItemMap.get(item.card_item_id)
      if (!cardItem) {
        errors.push({ card_item_id: item.card_item_id, error: 'Not found' })
        continue
      }

      if (cardItem.rip_status === 'QUEUED' || cardItem.rip_status === 'SENT') {
        errors.push({ card_item_id: item.card_item_id, error: `Already ${cardItem.rip_status}` })
        continue
      }

      if (!activeEquipment.has(item.equipment_id)) {
        errors.push({ card_item_id: item.card_item_id, error: 'Equipment inactive' })
        continue
      }

      if (!presetSet.has(`${item.equipment_id}|${item.rip_preset}`)) {
        errors.push({ card_item_id: item.card_item_id, error: 'Preset not found' })
        continue
      }

      // 업데이트 (batch 수집)
      updateStmts.push(c.env.DB.prepare(`
        UPDATE card_items SET
          rip_equipment_id = ?, rip_preset = ?, rip_status = 'QUEUED', rip_queued_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(item.equipment_id, item.rip_preset, item.card_item_id))

      cardIdsToUpdate.add(cardItem.card_id)
      cardItem.rip_status = 'QUEUED'  // 동일 요청 내 중복 card_item_id는 'Already QUEUED' 처리 (순차 동작 보존)
      results.push({ card_item_id: item.card_item_id, rip_status: 'QUEUED' })
    }

    // 카드 rip_status 동기화 (중복 제거) — 같은 batch에 수집
    for (const cardId of cardIdsToUpdate) {
      updateStmts.push(c.env.DB.prepare(`
        UPDATE cards SET rip_status = 'QUEUED', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(cardId))
    }
    for (let i = 0; i < updateStmts.length; i += 80) {
      await c.env.DB.batch(updateStmts.slice(i, i + 80))
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
      ORDER BY c.priority DESC, c.delivery_date ASC, ci.id ASC
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
    `).bind(cardItemId).first<{ id: number; card_id: number; rip_status: string | null; rip_job_path: string | null; card_status: string }>()

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
    `).bind(cardItem.card_id).all<CountRow>()

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
    ).bind(cardItemId).first<RetryCountRow>()

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
        rip_status: ((item?.rip_retry_count ?? 0) >= 5) ? 'ERROR' : 'QUEUED'
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
      ORDER BY oi.sort_order ASC, ci.id ASC
    `).bind(cardId).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/rip.ts card-items error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─── GET /api/rip/maintenance/dashboard — 정비 대시보드 종합 (#73) ────────────

ripRouter.get('/maintenance/dashboard', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const ef = entityFilter(c, 'e')  // #342 설비 법인 격리
    // 최근 30일 정비 이력 요약
    const { results: recentLogs } = await c.env.DB.prepare(`
      SELECT ml.*, e.name as equipment_name
      FROM maintenance_logs ml
      JOIN equipment e ON ml.equipment_id = e.id
      WHERE ml.performed_at >= date('now', '-30 days')${ef.clause}
      ORDER BY ml.performed_at DESC, ml.id DESC
      LIMIT 50
    `).bind(...ef.params).all()

    // 장비별 정비 비용/다운타임 집계 (최근 90일)
    const { results: costSummary } = await c.env.DB.prepare(`
      SELECT ml.equipment_id, e.name as equipment_name,
        COUNT(*) as log_count,
        COALESCE(SUM(ml.cost), 0) as total_cost,
        COALESCE(SUM(ml.downtime_minutes), 0) as total_downtime_min
      FROM maintenance_logs ml
      JOIN equipment e ON ml.equipment_id = e.id
      WHERE ml.performed_at >= date('now', '-90 days')${ef.clause}
      GROUP BY ml.equipment_id
      ORDER BY total_cost DESC
    `).bind(...ef.params).all()

    // PM 스케줄 현황
    const { results: schedules } = await c.env.DB.prepare(`
      SELECT ms.*, e.name as equipment_name,
        CASE
          WHEN ms.next_due_at <= ${kstDate()} THEN 'OVERDUE'
          WHEN ms.next_due_at <= date('now', '+9 hours', '+7 days') THEN 'DUE_SOON'
          ELSE 'OK'
        END as due_status
      FROM maintenance_schedules ms
      JOIN equipment e ON ms.equipment_id = e.id
      WHERE ms.is_active = 1${ef.clause}
      ORDER BY ms.next_due_at IS NULL, ms.next_due_at ASC, ms.id ASC
    `).bind(...ef.params).all()

    // 소모품 현황
    const { results: consumables } = await c.env.DB.prepare(`
      SELECT ec.*, e.name as equipment_name,
        CASE
          WHEN ec.next_due_at <= ${kstDate()} THEN 'OVERDUE'
          WHEN ec.next_due_at <= date('now', '+9 hours', '+7 days') THEN 'DUE_SOON'
          ELSE 'OK'
        END as due_status
      FROM equipment_consumables ec
      JOIN equipment e ON ec.equipment_id = e.id
      WHERE e.status = 'ACTIVE'${ef.clause}
      ORDER BY ec.next_due_at IS NULL, ec.next_due_at ASC, ec.id ASC
    `).bind(...ef.params).all()

    // 프린터 헤드 상태
    const { results: heads } = await c.env.DB.prepare(`
      SELECT eh.*, e.name as equipment_name
      FROM equipment_heads eh
      JOIN equipment e ON eh.equipment_id = e.id
      WHERE e.status = 'ACTIVE'${ef.clause}
      ORDER BY e.name, eh.head_number, eh.id
    `).bind(...ef.params).all()

    // KPI
    const overdue = schedules.filter((s: any) => s.due_status === 'OVERDUE').length
    const dueSoon = schedules.filter((s: any) => s.due_status === 'DUE_SOON').length
    const totalCost90d = costSummary.reduce((sum: number, r: any) => sum + (r.total_cost || 0), 0)
    const totalDowntime90d = costSummary.reduce((sum: number, r: any) => sum + (r.total_downtime_min || 0), 0)

    return c.json({
      success: true,
      data: {
        kpi: { overdue, due_soon: dueSoon, total_cost_90d: totalCost90d, total_downtime_90d_min: totalDowntime90d },
        recent_logs: recentLogs,
        cost_summary: costSummary,
        schedules,
        consumables,
        heads
      }
    })
  } catch (error) {
    console.error('maintenance dashboard error:', error)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default ripRouter