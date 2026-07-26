// 부문 관리 라우트 — 부문 트리 조회/편집 + 직원 부문 배정 + 매출 귀속 매핑 조회
// 설계 정본: memory/design-departmental-pnl.md
// departments 는 전역 차원(entity_id 없음). 매출/자재비/인건비 귀속의 리포팅 그릇.
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter } from '../utils/entityFilter'

const departmentsRouter = new Hono<HonoEnv>()
departmentsRouter.use('/*', authMiddleware)

// GET / — 부문 트리 + 재직/전체 인원 + serves(지원 생산부문)
departmentsRouter.get('/', async (c) => {
  try {
    const ef = entityFilter(c, 'e')  // #521: 인원수도 현재 법인 스코프 (ADMIN 전체모드=0이면 미필터)
    const { results } = await c.env.DB.prepare(`
      SELECT d.id, d.name, d.parent_id, d.dept_type, d.serves_department_id,
             s.name AS serves_name, d.sort_order, d.is_active,
             (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id
                AND (e.status = 'ACTIVE' OR e.status IS NULL)${ef.clause}) AS emp_active,
             (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id${ef.clause}) AS emp_total
      FROM departments d
      LEFT JOIN departments s ON s.id = d.serves_department_id
      ORDER BY d.sort_order, d.name
    `).bind(...ef.params, ...ef.params).all()
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
    const ef = entityFilter(c, 'e')  // #521: 부문 배정 목록 = 현재 법인 스코프 (전 법인 노출 차단)
    const statusClause = includeResigned ? '' : ` AND (e.status = 'ACTIVE' OR e.status IS NULL)`
    const { results } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.position, e.status, e.department AS legacy,
             e.department_id, d.name AS dept_name, en.short_name AS entity_name
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN entities en ON en.id = e.entity_id
      WHERE 1=1${statusClause}${ef.clause}
      ORDER BY d.sort_order, e.name
    `).bind(...ef.params).all()
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
    // #521: 타 법인 직원 부문 재배정 차단 — caller 법인 직원만 조회(없으면 404). super-ADMIN(0)=전권. hr.ts:566 형제 패턴(단 이 라우트는 ADMIN·MANAGER 공용이라 entityFilter(c) 그대로).
    const ef = entityFilter(c)
    const emp = await c.env.DB.prepare(`SELECT id FROM employees WHERE id = ?${ef.clause}`).bind(id, ...ef.params).first()
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
    // #525: serves_department_id 지정 시 대상이 PRODUCTION 부문인지 검증 (신규라 자기참조는 불가)
    if (body.serves_department_id != null) {
      const target = await c.env.DB.prepare('SELECT id, dept_type FROM departments WHERE id = ?').bind(body.serves_department_id).first<{ id: number; dept_type: string }>()
      if (!target) return c.json({ success: false, error: '지원 대상 부문을 찾을 수 없습니다.' }, 400)
      if (target.dept_type !== 'PRODUCTION') return c.json({ success: false, error: '지원 대상은 생산(PRODUCTION) 부문이어야 합니다.' }, 400)
    }
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
    // #525: serves_department_id 지정 시 자기참조 금지 + 대상 PRODUCTION 검증
    if (body.serves_department_id != null) {
      if (Number(body.serves_department_id) === Number(id)) return c.json({ success: false, error: '자기 자신을 지원 대상으로 지정할 수 없습니다.' }, 400)
      const target = await c.env.DB.prepare('SELECT id, dept_type FROM departments WHERE id = ?').bind(body.serves_department_id).first<{ id: number; dept_type: string }>()
      if (!target) return c.json({ success: false, error: '지원 대상 부문을 찾을 수 없습니다.' }, 400)
      if (target.dept_type !== 'PRODUCTION') return c.json({ success: false, error: '지원 대상은 생산(PRODUCTION) 부문이어야 합니다.' }, 400)
    }
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
      body.dept_type ? (body.dept_type === 'PRODUCTION' ? 'PRODUCTION' : 'SUPPORT') : null,
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

// GET /pnl?from=&to= — 부문별 손익 집계 (매출·자재비·인건비 → 공헌이익). 관리회계.
//  매출=order_items 라인금액(비취소·주문일). PRODUCT=items.category→부문, MATERIAL/GOODS=유통 부문
//  원가=① 제조 자재비: 소진이력 deducted_base × 이동평균단가(iad·cards.category→부문)
//       ② 유통 매출원가(COGS): MATERIAL/GOODS 판매수량 × avg_unit_cost(유통 부문) — 둘 다 material 버킷
//  인건비=payroll 급여총액+회사부담 4대보험(employees.department_id, pay_period 월 기준)
departmentsRouter.get('/pnl', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { from, to } = c.req.query()
    if (!from || !to) return c.json({ success: false, error: 'from, to 파라미터 필요' }, 400)
    const fromMonth = from.slice(0, 7)
    const toMonth = to.slice(0, 7)

    const { results: depts } = await c.env.DB.prepare(
      `SELECT id, name, parent_id, dept_type, serves_department_id, sort_order FROM departments ORDER BY sort_order, name`
    ).all<any>()

    // 유통 부문 id — MATERIAL/GOODS(원단·상품 직접판매)는 공정 category가 없어(category_name NULL)
    //   process 매핑 대신 item_type 기준으로 유통 부문에 귀속. 미존재 시 null(미분류) 폴백.
    const distDeptId = (depts || []).find((d: any) => d.name === '유통')?.id ?? null

    // 1) 매출 — order_items 라인금액. PRODUCT=items.category→부문, MATERIAL/GOODS=유통 부문(유통 판매)
    //   ※ oi.category_name은 전 유형 미채움이라 items.category로 귀속(수성→출력·전사→전사 등).
    const efO = entityFilter(c, 'o')
    const { results: rev } = await c.env.DB.prepare(`
      SELECT CASE WHEN i.item_type IN ('MATERIAL','GOODS') THEN ? ELSE dcm.department_id END AS dept_id,
             COALESCE(SUM(COALESCE(oi.amount, oi.quantity * oi.unit_price)), 0) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN items i ON i.id = oi.item_id
      LEFT JOIN department_category_map dcm ON dcm.category = i.category
      WHERE o.status != 'CANCELLED'
        AND date(COALESCE(o.order_date, o.created_at)) BETWEEN ? AND ?${efO.clause}
      GROUP BY 1
    `).bind(distDeptId, from, to, ...efO.params).all<any>()

    // 2) 자재비 — 소진이력 × 자재 이동평균단가, cards.category_name → 부문
    const efI = entityFilter(c, 'iad')
    const { results: mat } = await c.env.DB.prepare(`
      SELECT dcm.department_id AS dept_id,
             COALESCE(SUM(iad.deducted_base * COALESCE(it.avg_unit_cost, 0)), 0) AS material
      FROM inventory_auto_deductions iad
      LEFT JOIN cards ca ON ca.id = iad.card_id
      LEFT JOIN department_category_map dcm ON dcm.category = ca.category_name
      LEFT JOIN items it ON it.id = iad.material_item_id
      WHERE date(datetime(iad.created_at, '+9 hours')) BETWEEN ? AND ?${efI.clause}
      GROUP BY dcm.department_id
    `).bind(from, to, ...efI.params).all<any>()

    // 2-b) 유통 매출원가(COGS) — MATERIAL/GOODS 직접판매는 소진(제조)이 아니라 매입원가.
    //   COGS = 판매수량 × avg_unit_cost, 유통 부문 귀속. 제조 자재비(iad)와 부문 비중복(품목유형 disjoint).
    const efOc = entityFilter(c, 'o')
    const { results: cogs } = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(oi.quantity * COALESCE(i.avg_unit_cost, 0)), 0) AS cogs
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN items i ON i.id = oi.item_id
      WHERE o.status != 'CANCELLED'
        AND i.item_type IN ('MATERIAL','GOODS')
        AND date(COALESCE(o.order_date, o.created_at)) BETWEEN ? AND ?${efOc.clause}
    `).bind(from, to, ...efOc.params).all<any>()

    // 3) 인건비 — payroll 급여총액 + 회사부담 4대보험, employees.department_id
    //   ⚠️ payroll.entity_id는 신뢰불가(0150 DEFAULT 1·미채움) → employees.entity_id로 필터(hr.ts:840 동일 이유)
    const efP = entityFilter(c, 'e')
    const { results: lab } = await c.env.DB.prepare(`
      SELECT e.department_id AS dept_id,
             COALESCE(SUM(
               p.total_salary
               + COALESCE(p.employer_national_pension,0) + COALESCE(p.employer_health_insurance,0)
               + COALESCE(p.employer_long_term_care,0) + COALESCE(p.employer_employment_insurance,0)
               + COALESCE(p.employer_industrial_accident,0)
             ), 0) AS labor
      FROM payroll p JOIN employees e ON e.id = p.employee_id
      WHERE p.pay_period BETWEEN ? AND ?${efP.clause}
      GROUP BY e.department_id
    `).bind(fromMonth, toMonth, ...efP.params).all<any>()

    const num = (v: any) => Number(v) || 0
    const revMap = new Map<any, number>(); for (const r of rev || []) revMap.set(r.dept_id, num(r.revenue))
    const matMap = new Map<any, number>(); for (const r of mat || []) matMap.set(r.dept_id, num(r.material))
    // 유통 COGS를 material 버킷에 합산(유통 부문). 제조 iad와 부문 disjoint이라 안전.
    const cogsTotal = num((cogs || [])[0]?.cogs)
    if (cogsTotal > 0) matMap.set(distDeptId, (matMap.get(distDeptId) || 0) + cogsTotal)
    const labMap = new Map<any, number>(); for (const r of lab || []) labMap.set(r.dept_id, num(r.labor))

    // ── P5 배부: serves 재배분(지원 하위→생산부문) + 공통풀(잔여 지원인건비 + 고정비) 안분 ──
    // 4) 배부 기준 데이터 — 활성 직원수(인원) + 고정 공통비(임대·통신·전기)
    const efHc = entityFilter(c)  // #521: 인원비례 배부 기준도 법인 스코프
    const { results: hc } = await c.env.DB.prepare(
      `SELECT department_id AS dept_id, COUNT(*) AS cnt FROM employees
       WHERE (status='ACTIVE' OR status IS NULL) AND department_id IS NOT NULL${efHc.clause} GROUP BY department_id`
    ).bind(...efHc.params).all<any>()
    const hcMap = new Map<any, number>(); for (const r of hc || []) hcMap.set(r.dept_id, num(r.cnt))

    const fromDate = new Date(from), toDate = new Date(to)
    const months = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (30 * 86400000)))
    // #554: is_active(현재상태)로 필터하면 조회기간 당시엔 유효했으나 지금 비활성인 고정비가 과거조회에서 누락됨.
    //   기간중첩(start<=to AND (end IS NULL OR end>=from))이 시간적 유효성의 정본. (비활성화는 이제 end_date를 마감 →
    //   현재/미래 기간엔 자동 제외되고, 과거 기간엔 정상 포함. 0470 마이그가 기존 비활성행 end_date backfill.)
    const fixedRow = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS total FROM fixed_expenses
       WHERE frequency='MONTHLY' AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)`
    ).bind(to, from).first<{ total: number }>().catch(() => ({ total: 0 }))
    const fixedCommon = num(fixedRow?.total) * months

    const basis = ['revenue', 'headcount', 'labor'].includes(c.req.query('basis') || '') ? (c.req.query('basis') as string) : 'revenue'
    const nameById = new Map<number, string>(); for (const d of depts || []) nameById.set(d.id, d.name)

    // serves 재배분 + 공통풀 집계
    const servesIn = new Map<number, number>()
    let supportCommonLabor = 0
    const supportDetail: any[] = []
    for (const d of depts || []) {
      if (d.dept_type !== 'SUPPORT') continue
      const l = labMap.get(d.id) || 0
      if (l <= 0) continue
      if (d.serves_department_id) {
        servesIn.set(d.serves_department_id, (servesIn.get(d.serves_department_id) || 0) + l)
        supportDetail.push({ name: d.name, labor: Math.round(l), target: (nameById.get(d.serves_department_id) || '?') + ' 직접귀속' })
      } else {
        supportCommonLabor += l
        supportDetail.push({ name: d.name, labor: Math.round(l), target: '공통배부' })
      }
    }
    const commonPool = supportCommonLabor + fixedCommon

    const production = (depts || []).filter((d: any) => d.dept_type === 'PRODUCTION')
    const weightOf = (d: any) => basis === 'headcount' ? (hcMap.get(d.id) || 0) : basis === 'labor' ? (labMap.get(d.id) || 0) : (revMap.get(d.id) || 0)
    const totalWeight = production.reduce((s: number, d: any) => s + weightOf(d), 0)
    // 공통풀 배부 비율 — basis 가중치 합이 0(예: 매출기준인데 기간 생산매출 0)이어도
    //   공통풀(지원인건비+고정비)이 소실되지 않도록 폴백: ① 인원수 비례 → ② 균등(1/N).
    //   비율의 합은 항상 1 → 생산부문 ≥1이면 공통풀 전액이 배부됨.
    const totalProdHc = production.reduce((s: number, d: any) => s + (hcMap.get(d.id) || 0), 0)
    const allocShareOf = (d: any) => {
      if (totalWeight > 0) return weightOf(d) / totalWeight
      if (totalProdHc > 0) return (hcMap.get(d.id) || 0) / totalProdHc
      return production.length > 0 ? 1 / production.length : 0
    }

    const rows = production.map((d: any) => {
      const revenue = revMap.get(d.id) || 0
      const material = matMap.get(d.id) || 0
      const labor = labMap.get(d.id) || 0
      const contribution = revenue - material - labor
      const serves_alloc = servesIn.get(d.id) || 0
      const common_alloc = commonPool * allocShareOf(d)
      const operating_profit = contribution - serves_alloc - common_alloc
      return {
        id: d.id, name: d.name, dept_type: d.dept_type,
        revenue, material, labor, contribution,
        serves_alloc: Math.round(serves_alloc), common_alloc: Math.round(common_alloc),
        operating_profit: Math.round(operating_profit),
        op_margin: revenue > 0 ? +((operating_profit / revenue) * 100).toFixed(1) : null,
        labor_ratio: revenue > 0 ? +((labor / revenue) * 100).toFixed(1) : null,
      }
    })

    const unclassified = { revenue: revMap.get(null) || 0, material: matMap.get(null) || 0 }
    // 합계 공헌이익은 행(생산부문) 기준으로 정합 — 지원부문 인건비는 공통풀/serves로 배부되어
    //   operating_profit(=totalOperating)에 이미 반영되므로, 공헌이익 라인은 생산부문 인건비만 차감.
    const totalProdLabor = production.reduce((s: number, d: any) => s + (labMap.get(d.id) || 0), 0)
    const totalRevenue = production.reduce((s: number, d: any) => s + (revMap.get(d.id) || 0), 0) + unclassified.revenue
    const totalMaterial = production.reduce((s: number, d: any) => s + (matMap.get(d.id) || 0), 0) + unclassified.material
    const totalOperating = rows.reduce((s: number, r: any) => s + r.operating_profit, 0)

    return c.json({
      success: true,
      data: {
        period: { from, to, months }, basis,
        rows,
        pool: { support_common_labor: Math.round(supportCommonLabor), fixed_common: Math.round(fixedCommon), total: Math.round(commonPool) },
        support_detail: supportDetail,
        unclassified,
        totals: {
          revenue: totalRevenue, material: totalMaterial, labor: totalProdLabor,
          contribution: totalRevenue - totalMaterial - totalProdLabor,
          operating_profit: totalOperating,
        },
      },
    })
  } catch (error) {
    console.error('departments pnl GET error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default departmentsRouter
