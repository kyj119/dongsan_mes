// 부문 관리 라우트 — 부문 트리 조회/편집 + 직원 부문 배정 + 매출 귀속 매핑 조회
// 설계 정본: memory/design-departmental-pnl.md
// departments 는 전역 차원(entity_id 없음). 매출/자재비/인건비 귀속의 리포팅 그릇.
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'

const departmentsRouter = new Hono<HonoEnv>()
departmentsRouter.use('/*', authMiddleware)

// GET / — 부문 트리 + 재직/전체 인원 + serves(지원 생산부문)
departmentsRouter.get('/', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT d.id, d.name, d.parent_id, d.dept_type, d.serves_department_id,
             s.name AS serves_name, d.sort_order, d.is_active,
             (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id
                AND (e.status = 'ACTIVE' OR e.status IS NULL)) AS emp_active,
             (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS emp_total
      FROM departments d
      LEFT JOIN departments s ON s.id = d.serves_department_id
      ORDER BY d.sort_order, d.name
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('departments GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /employees — 직원 목록(부문 배정용). 기본 재직만, include_resigned=1 시 퇴사 포함
departmentsRouter.get('/employees', async (c) => {
  try {
    const includeResigned = c.req.query('include_resigned') === '1'
    const statusClause = includeResigned ? '' : `WHERE (e.status = 'ACTIVE' OR e.status IS NULL)`
    const { results } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.position, e.status, e.department AS legacy,
             e.department_id, d.name AS dept_name, en.short_name AS entity_name
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN entities en ON en.id = e.entity_id
      ${statusClause}
      ORDER BY d.sort_order, e.name
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('departments employees GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /category-map — 매출 귀속 매핑(공정 category → 부문)
departmentsRouter.get('/category-map', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT m.category, m.department_id, d.name AS dept_name
      FROM department_category_map m
      LEFT JOIN departments d ON d.id = m.department_id
      ORDER BY d.sort_order, m.category
    `).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('departments category-map GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /employees/:id — 직원 부문 재배정 (ADMIN/MANAGER)
departmentsRouter.patch('/employees/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{ department_id: number | null }>()
    if (body.department_id != null) {
      const dep = await c.env.DB.prepare('SELECT id FROM departments WHERE id = ? AND is_active = 1').bind(body.department_id).first()
      if (!dep) return c.json({ success: false, error: '유효하지 않은 부문입니다.' }, 400)
    }
    const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE id = ?').bind(id).first()
    if (!emp) return c.json({ success: false, error: '직원을 찾을 수 없습니다.' }, 404)
    await c.env.DB.prepare('UPDATE employees SET department_id = ? WHERE id = ?').bind(body.department_id ?? null, id).run()
    return c.json({ success: true, message: '부문이 변경되었습니다.' })
  } catch (error) {
    console.error('departments employee PATCH error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST / — 부문 추가 (ADMIN)
departmentsRouter.post('/', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json<{ name: string; parent_id?: number | null; dept_type?: string; serves_department_id?: number | null; sort_order?: number }>()
    if (!body.name?.trim()) return c.json({ success: false, error: '부문명을 입력해주세요.' }, 400)
    const type = body.dept_type === 'PRODUCTION' ? 'PRODUCTION' : 'SUPPORT'
    const result = await c.env.DB.prepare(`
      INSERT INTO departments (name, parent_id, dept_type, serves_department_id, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      body.name.trim(),
      body.parent_id ?? null,
      type,
      body.serves_department_id ?? null,
      body.sort_order ?? 0
    ).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '부문이 추가되었습니다.' })
  } catch (error) {
    console.error('departments POST error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /:id — 부문 수정 (ADMIN). serves_department_id 는 명시적 set(null 허용 = 공통).
departmentsRouter.put('/:id', requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{ name?: string; dept_type?: string; serves_department_id?: number | null; sort_order?: number; is_active?: number }>()
    const row = await c.env.DB.prepare('SELECT id FROM departments WHERE id = ?').bind(id).first()
    if (!row) return c.json({ success: false, error: '부문을 찾을 수 없습니다.' }, 404)
    await c.env.DB.prepare(`
      UPDATE departments SET
        name = COALESCE(?, name),
        dept_type = COALESCE(?, dept_type),
        serves_department_id = ?,
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(
      body.name?.trim() || null,
      body.dept_type || null,
      body.serves_department_id ?? null,
      body.sort_order ?? null,
      body.is_active ?? null,
      id
    ).run()
    return c.json({ success: true, message: '부문이 수정되었습니다.' })
  } catch (error) {
    console.error('departments PUT error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default departmentsRouter
