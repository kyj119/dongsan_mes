// src/routes/workbench.ts — 웹 캔버스 IA 워크벤치 P1: 시안 검수 (그룹 ↔ 품목 매칭)
// spec: docs/superpowers/specs/2026-06-11-web-canvas-ia-workbench.md §5
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, orderVisibilityFilter } from '../utils/entityFilter'

const workbenchRouter = new Hono<HonoEnv>()

workbenchRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER', 'DESIGNER'))

// ── GET /api/workbench/orders — AI 분석이 있는 최근 주문 목록 (검수 대상) ──
workbenchRouter.get('/orders', async (c) => {
  try {
    const q = (c.req.query('q') || '').trim()
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
    const ef = orderVisibilityFilter(c, 'o')

    let where = `o.ai_analysis_id IS NOT NULL`
    const params: unknown[] = []
    if (q) {
      where += ` AND (o.order_number LIKE ? OR cl.client_name LIKE ?)`
      params.push(`%${q}%`, `%${q}%`)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.created_at, o.status, o.ai_analysis_id,
             cl.client_name as client_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.ai_group_index IS NOT NULL) as matched_count,
             ar.status as analysis_status
      FROM orders o
      LEFT JOIN clients cl ON cl.id = o.client_id
      LEFT JOIN ai_analysis_requests ar ON ar.id = o.ai_analysis_id
      WHERE ${where}${ef.clause}
      ORDER BY o.created_at DESC
      LIMIT ?
    `).bind(...params, ...ef.params, limit).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Workbench orders error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── GET /api/workbench/analyses/:orderId — 그룹 썸네일 + 품목 매칭 현황 ──
workbenchRouter.get('/analyses/:orderId', async (c) => {
  try {
    const orderId = parseInt(c.req.param('orderId'), 10)
    if (!orderId) return c.json({ success: false, error: '잘못된 주문 ID' }, 400)

    const ef = orderVisibilityFilter(c, 'o')
    const order = await c.env.DB.prepare(`
      SELECT o.id, o.order_number, o.ai_analysis_id, o.ai_file_path,
             cl.client_name as client_name
      FROM orders o
      LEFT JOIN clients cl ON cl.id = o.client_id
      WHERE o.id = ?${ef.clause}
    `).bind(orderId, ...ef.params).first<{
      id: number; order_number: string; ai_analysis_id: number | null
      ai_file_path: string | null; client_name: string | null
    }>()
    if (!order) return c.json({ success: false, error: '주문을 찾을 수 없습니다.' }, 404)
    if (!order.ai_analysis_id) return c.json({ success: false, error: 'AI 분석이 없는 주문입니다.' }, 400)

    const analysis = await c.env.DB.prepare(
      `SELECT id, status, groups_json, error_message FROM ai_analysis_requests WHERE id = ?`
    ).bind(order.ai_analysis_id).first<{
      id: number; status: string; groups_json: string | null; error_message: string | null
    }>()

    let groups: unknown[] = []
    try { groups = analysis?.groups_json ? JSON.parse(analysis.groups_json) : [] } catch (_e) { groups = [] }

    const { results: items } = await c.env.DB.prepare(`
      SELECT oi.id, oi.item_name, oi.category_name, oi.width, oi.height,
             oi.quantity, oi.ai_group_index
      FROM order_items oi
      WHERE oi.order_id = ?
      ORDER BY oi.id
    `).bind(orderId).all()

    return c.json({
      success: true,
      data: {
        order: { id: order.id, order_number: order.order_number, client_name: order.client_name, ai_file_path: order.ai_file_path },
        analysis: { id: analysis?.id, status: analysis?.status, error_message: analysis?.error_message },
        groups,
        items,
      },
    })
  } catch (error) {
    console.error('Workbench analyses error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ── PUT /api/workbench/match — 품목 ↔ 그룹 매칭 수정 ──
workbenchRouter.put('/match', async (c) => {
  try {
    const body = await c.req.json<{ order_item_id: number; ai_group_index: number | null }>()
    if (!body.order_item_id) return c.json({ success: false, error: 'order_item_id가 필요합니다.' }, 400)
    const gi = body.ai_group_index
    if (gi !== null && (typeof gi !== 'number' || gi < 0 || !Number.isInteger(gi))) {
      return c.json({ success: false, error: 'ai_group_index는 null 또는 0 이상의 정수여야 합니다.' }, 400)
    }

    // 품목 → 부모 주문 entity 검증 (IDOR 가드)
    const ef = orderVisibilityFilter(c, 'o')
    const item = await c.env.DB.prepare(`
      SELECT oi.id, o.ai_analysis_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = ?${ef.clause}
    `).bind(body.order_item_id, ...ef.params).first<{ id: number; ai_analysis_id: number | null }>()
    if (!item) return c.json({ success: false, error: '품목을 찾을 수 없습니다.' }, 404)

    // 그룹 인덱스 범위 검증 (분석 결과 내 존재 여부)
    if (gi !== null && item.ai_analysis_id) {
      const analysis = await c.env.DB.prepare(
        `SELECT groups_json FROM ai_analysis_requests WHERE id = ?`
      ).bind(item.ai_analysis_id).first<{ groups_json: string | null }>()
      let count = 0
      try { count = analysis?.groups_json ? JSON.parse(analysis.groups_json).length : 0 } catch (_e) { count = 0 }
      if (gi >= count) {
        return c.json({ success: false, error: `그룹 인덱스 범위 초과 (0~${count - 1})` }, 400)
      }
    }

    await c.env.DB.prepare(
      `UPDATE order_items SET ai_group_index = ? WHERE id = ?`
    ).bind(gi, body.order_item_id).run()

    return c.json({ success: true, data: { order_item_id: body.order_item_id, ai_group_index: gi } })
  } catch (error) {
    console.error('Workbench match error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default workbenchRouter
