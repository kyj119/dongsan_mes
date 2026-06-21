// 규격그룹(spec_groups) + 규격값(spec_group_values) self-service 관리 API
// spec: docs/superpowers/specs/2026-06-20-spec-group-variant-item-plan.md §2, §5
// 모델: 규격그룹(호수·판재두께·원단폭) 정의 → 품목+그룹값 조합으로 변종품목 생성(items.ts).
// 그룹/값은 메타데이터(생성·묶음·통계용). 값 삭제/이름변경은 기존 변종품목 무영향(스냅샷, 안전규칙 §4).
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const specGroupsRouter = new Hono<HonoEnv>()

specGroupsRouter.use('/*', authMiddleware)

// ── 그룹 목록 (값 개수 포함) ──
specGroupsRouter.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT sg.id, sg.name, sg.unit, sg.sort_order, sg.is_active,
        (SELECT COUNT(*) FROM spec_group_values v WHERE v.group_id = sg.id AND v.is_active = 1) AS value_count,
        (SELECT COUNT(*) FROM items i WHERE i.spec_group_id = sg.id OR i.spec_group_id2 = sg.id) AS item_count
      FROM spec_groups sg
      ORDER BY sg.sort_order ASC, sg.name ASC
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/specGroups.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ── 그룹 단건 + 값 목록 ──
specGroupsRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const group = await c.env.DB.prepare(
      'SELECT id, name, unit, sort_order, is_active FROM spec_groups WHERE id = ?'
    ).bind(id).first()
    if (!group) return c.json({ success: false, error: '규격그룹을 찾을 수 없습니다' }, 404)
    const { results: values } = await c.env.DB.prepare(`
      SELECT id, group_id, value_code, label, sort_order, is_active
      FROM spec_group_values WHERE group_id = ? ORDER BY sort_order ASC, id ASC
    `).bind(id).all()
    // 이 그룹을 사용하는 base 품목 (축1 또는 축2, spec_value NULL = 템플릿) + 현재 변종 수
    const { results: bases } = await c.env.DB.prepare(`
      SELECT b.id, b.item_code, b.item_name, b.item_type, b.is_active, b.item_group,
        b.spec_group_id, b.spec_group_id2,
        g1.name AS group1_name, g2.name AS group2_name,
        (SELECT COUNT(*) FROM items v WHERE v.item_group = b.item_group AND v.spec_value IS NOT NULL) AS variant_count
      FROM items b
      LEFT JOIN spec_groups g1 ON g1.id = b.spec_group_id
      LEFT JOIN spec_groups g2 ON g2.id = b.spec_group_id2
      WHERE (b.spec_group_id = ? OR b.spec_group_id2 = ?) AND b.spec_value IS NULL AND b.spec_value2 IS NULL
      ORDER BY b.item_name ASC
    `).bind(id, id).all()
    return c.json({ success: true, data: { ...group, values, bases } })
  } catch (error) {
    console.error('src/routes/specGroups.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ── 그룹 생성 ──
specGroupsRouter.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { name, unit, sort_order } = await c.req.json()
    if (!name || !String(name).trim()) {
      return c.json({ success: false, error: '그룹명은 필수입니다' }, 400)
    }
    const dup = await c.env.DB.prepare('SELECT id FROM spec_groups WHERE name = ?').bind(name.trim()).first()
    if (dup) return c.json({ success: false, error: `이미 존재하는 그룹명입니다: ${name}` }, 409)
    const res = await c.env.DB.prepare(
      'INSERT INTO spec_groups (name, unit, sort_order, is_active) VALUES (?, ?, ?, 1)'
    ).bind(name.trim(), unit || null, sort_order || 0).run()
    return c.json({ success: true, data: { id: res.meta.last_row_id } })
  } catch (error) {
    console.error('src/routes/specGroups.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ── 그룹 수정 ──
specGroupsRouter.put('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const fields: string[] = []
    const params: any[] = []
    for (const k of ['name', 'unit', 'sort_order', 'is_active']) {
      if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]) }
    }
    if (!fields.length) return c.json({ success: false, error: '수정할 필드가 없습니다' }, 400)
    fields.push("updated_at = datetime('now')")
    params.push(id)
    const res = await c.env.DB.prepare(`UPDATE spec_groups SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true, data: { updated: res.meta.changes } })
  } catch (error) {
    console.error('src/routes/specGroups.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ── 그룹 비활성화 (소프트, 기존 변종품목 무영향) ──
specGroupsRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare("UPDATE spec_groups SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/specGroups.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ── 값 추가 (value_code 정규화: 대문자, 공백·하이픈 제거) ──
specGroupsRouter.post('/:id/values', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const groupId = c.req.param('id')
    const body = await c.req.json()
    let valueCode = String(body.value_code || '').trim().toUpperCase().replace(/[\s-]/g, '')
    const label = String(body.label || '').trim()
    if (!valueCode || !label) {
      return c.json({ success: false, error: 'value_code와 label은 필수입니다' }, 400)
    }
    const group = await c.env.DB.prepare('SELECT id FROM spec_groups WHERE id = ?').bind(groupId).first()
    if (!group) return c.json({ success: false, error: '규격그룹을 찾을 수 없습니다' }, 404)
    const dup = await c.env.DB.prepare(
      'SELECT id FROM spec_group_values WHERE group_id = ? AND value_code = ?'
    ).bind(groupId, valueCode).first()
    if (dup) return c.json({ success: false, error: `이미 존재하는 값입니다: ${valueCode}` }, 409)
    const res = await c.env.DB.prepare(
      'INSERT INTO spec_group_values (group_id, value_code, label, sort_order, is_active) VALUES (?, ?, ?, ?, 1)'
    ).bind(groupId, valueCode, label, body.sort_order || 0).run()
    return c.json({ success: true, data: { id: res.meta.last_row_id, value_code: valueCode } })
  } catch (error) {
    console.error('src/routes/specGroups.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ── 값 수정 (value_code는 불변 — label/sort/active만; 코드 변경은 기존 품목코드 거짓말 방지 위해 금지) ──
specGroupsRouter.put('/values/:valueId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const valueId = c.req.param('valueId')
    const body = await c.req.json()
    const fields: string[] = []
    const params: any[] = []
    for (const k of ['label', 'sort_order', 'is_active']) {
      if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]) }
    }
    if (!fields.length) return c.json({ success: false, error: '수정할 필드가 없습니다' }, 400)
    params.push(valueId)
    const res = await c.env.DB.prepare(`UPDATE spec_group_values SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run()
    return c.json({ success: true, data: { updated: res.meta.changes } })
  } catch (error) {
    console.error('src/routes/specGroups.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

// ── 값 비활성화 (소프트. 기존 변종품목은 스냅샷이라 무영향 — 신규 생성 후보에서만 제외) ──
specGroupsRouter.delete('/values/:valueId', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const valueId = c.req.param('valueId')
    await c.env.DB.prepare('UPDATE spec_group_values SET is_active = 0 WHERE id = ?').bind(valueId).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/specGroups.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
  }
})

export default specGroupsRouter
