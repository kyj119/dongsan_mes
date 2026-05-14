import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'
import type { HonoEnv } from '../types/env'
import { encryptPII, decryptPII } from '../utils/crypto'
import { getEntityId } from '../utils/entityFilter'
import { renderEmploymentCertificateHTML } from '../templates/employmentCertificate'

const hrRouter = new Hono<HonoEnv>()

// Apply authentication middleware
hrRouter.use('/*', authMiddleware, requirePagePermission('/hr'))

// 다음 사원번호 자동 생성 (DS-### 패턴)
// 정책: 현재 직원 수 기준으로 시작 (COUNT+1), 이미 존재하면 빈 번호 발견할 때까지 증가
hrRouter.get('/employees/next-code', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`SELECT employee_code FROM employees`).all<any>()
    const existing = new Set<string>(
      (results || []).map((r: any) => String(r.employee_code || '').toUpperCase())
    )
    const total = existing.size
    let n = total + 1
    // 충돌 시 다음 빈 번호 탐색 (안전장치 1만회 한도)
    for (let i = 0; i < 10000; i++) {
      const candidate = 'DS-' + String(n).padStart(3, '0')
      if (!existing.has(candidate)) {
        return c.json({ success: true, data: { next_code: candidate } })
      }
      n++
    }
    return c.json({ success: false, error: '사원번호 생성 한도 초과' }, 500)
  } catch (error: any) {
    console.error('hr.ts [next-code]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get employees list
hrRouter.get('/employees', async (c) => {
  try {
    const { page = '1', limit = '50', department, position, status = 'ACTIVE', search } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT
        e.*,
        u.username,
        ent.short_name as entity_name
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN entities ent ON ent.id = e.entity_id
      WHERE 1=1
    `
    const params: any[] = []

    if (department) {
      query += ` AND e.department = ?`
      params.push(department)
    }

    if (position) {
      query += ` AND e.position = ?`
      params.push(position)
    }

    if (status) {
      query += ` AND e.status = ?`
      params.push(status)
    }

    if (search) {
      query += ` AND (e.employee_code LIKE ? OR e.name LIKE ? OR e.email LIKE ?)`
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm)
    }

    query += ` ORDER BY e.employee_code LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    // Count total
    let countQuery = `SELECT COUNT(*) as total FROM employees WHERE 1=1`
    const countParams: any[] = []

    if (department) {
      countQuery += ` AND department = ?`
      countParams.push(department)
    }

    if (position) {
      countQuery += ` AND position = ?`
      countParams.push(position)
    }

    if (status) {
      countQuery += ` AND status = ?`
      countParams.push(status)
    }

    if (search) {
      countQuery += ` AND (employee_code LIKE ? OR name LIKE ? OR email LIKE ?)`
      const searchTerm = `%${search}%`
      countParams.push(searchTerm, searchTerm, searchTerm)
    }

    const { results: countResults } = await c.env.DB.prepare(countQuery).bind(...countParams).all<{ total: number }>()
    const total = countResults[0].total

    return c.json({
      success: true,
      data: {
        employees: results,
        pagination: {
          page: parseInt(page),
          limit: safeLimit,
          total,
          total_pages: Math.ceil(total / safeLimit)
        }
      }
    })
  } catch (error: any) {
    console.error('Failed to get employees:', error)
    console.error('HR error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get employee by ID
hrRouter.get('/employees/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(`
      SELECT e.*, u.username
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `).bind(id).all()

    if (results.length === 0) {
      return c.json({ success: false, error: 'Employee not found' }, 404)
    }

    return c.json({ success: true, data: results[0] })
  } catch (error: any) {
    console.error('Failed to get employee:', error)
    console.error('HR error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get attendance records
hrRouter.get('/attendance', async (c) => {
  try {
    const { employee_id, start_date, end_date, limit = '100' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 100, 200)

    let query = `
      SELECT
        a.*,
        e.employee_code,
        e.name,
        e.department
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE 1=1
    `
    const params: any[] = []

    if (employee_id) {
      query += ` AND a.employee_id = ?`
      params.push(employee_id)
    }

    if (start_date) {
      query += ` AND a.work_date >= ?`
      params.push(start_date)
    }

    if (end_date) {
      query += ` AND a.work_date <= ?`
      params.push(end_date)
    }

    query += ` ORDER BY a.work_date DESC, e.employee_code LIMIT ?`
    params.push(safeLimit)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({ success: true, data: { records: results } })
  } catch (error: any) {
    console.error('Failed to get attendance:', error)
    console.error('HR error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Check in/out
hrRouter.post('/attendance/checkin', async (c) => {
  try {
    const user = c.get('user')
    const data = await c.req.json()
    const { employee_id, work_date } = data

    // Check if already checked in today
    const { results: existing } = await c.env.DB.prepare(`
      SELECT id FROM attendance WHERE employee_id = ? AND work_date = ?
    `).bind(employee_id, work_date || new Date().toISOString().split('T')[0]).all()

    if (existing.length > 0) {
      return c.json({ success: false, error: 'Already checked in today' }, 400)
    }

    // Insert check-in record
    await c.env.DB.prepare(`
      INSERT INTO attendance (employee_id, work_date, check_in_time, attendance_type, status)
      VALUES (?, ?, ?, 'NORMAL', 'PRESENT')
    `).bind(
      employee_id,
      work_date || new Date().toISOString().split('T')[0],
      new Date().toISOString()
    ).run()

    return c.json({ success: true, data: { message: 'Checked in successfully' } })
  } catch (error: any) {
    console.error('Failed to check in:', error)
    console.error('HR error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

hrRouter.post('/attendance/checkout', async (c) => {
  try {
    const data = await c.req.json()
    const { employee_id, work_date } = data

    // Get check-in record
    const { results } = await c.env.DB.prepare(`
      SELECT id, check_in_time, check_out_time FROM attendance WHERE employee_id = ? AND work_date = ?
    `).bind(employee_id, work_date || new Date().toISOString().split('T')[0]).all()

    if (results.length === 0) {
      return c.json({ success: false, error: 'No check-in record found' }, 404)
    }

    const record = results[0] as { id: number; check_in_time: string; check_out_time: string | null }

    if (record.check_out_time) {
      return c.json({ success: false, error: 'Already checked out' }, 400)
    }

    // Calculate work hours
    const checkIn = new Date(record.check_in_time)
    const checkOut = new Date()
    const workHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)
    const overtimeHours = Math.max(0, workHours - 8)

    // Update check-out
    await c.env.DB.prepare(`
      UPDATE attendance
      SET check_out_time = ?, work_hours = ?, overtime_hours = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(checkOut.toISOString(), workHours, overtimeHours, record.id).run()

    return c.json({
      success: true,
      data: { message: 'Checked out successfully', work_hours: workHours, overtime_hours: overtimeHours }
    })
  } catch (error: any) {
    console.error('Failed to check out:', error)
    console.error('HR error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get payroll records (실제 테이블: payroll - 단수형)
hrRouter.get('/payrolls', async (c) => {
  try {
    const { employee_id, pay_period, limit = '100' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 100, 500)

    let query = `
      SELECT
        p.*,
        p.net_pay as net_salary,
        e.employee_code,
        e.name as employee_name,
        e.department,
        e.position
      FROM payroll p
      LEFT JOIN employees e ON p.employee_id = e.id
      WHERE 1=1
    `
    const params: any[] = []

    if (employee_id) {
      query += ` AND p.employee_id = ?`
      params.push(employee_id)
    }

    if (pay_period) {
      query += ` AND p.pay_period = ?`
      params.push(pay_period)
    }

    query += ` ORDER BY p.pay_period DESC, e.employee_code LIMIT ?`
    params.push(safeLimit)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      data: {
        items: results,
        payrolls: results  // backwards compat
      }
    })
  } catch (error: any) {
    console.error('Failed to get payroll:', error)
    console.error('HR error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get attendance records (실제 테이블: attendance - 단수형)
hrRouter.get('/attendances', async (c) => {
  try {
    const { employee_id, date, type, start_date, end_date, limit = '100' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 100, 500)

    let query = `
      SELECT
        a.id,
        a.employee_id,
        a.work_date as date,
        a.check_in_time as check_in,
        a.check_out_time as check_out,
        a.work_hours,
        a.overtime_hours,
        a.attendance_type,
        a.status,
        a.notes,
        e.employee_code,
        e.name as employee_name,
        e.department
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE 1=1
    `
    const params: any[] = []

    if (employee_id) {
      query += ` AND a.employee_id = ?`
      params.push(employee_id)
    }

    if (date) {
      query += ` AND a.work_date = ?`
      params.push(date)
    }

    if (start_date) {
      query += ` AND a.work_date >= ?`
      params.push(start_date)
    }

    if (end_date) {
      query += ` AND a.work_date <= ?`
      params.push(end_date)
    }

    if (type) {
      query += ` AND a.attendance_type = ?`
      params.push(type)
    }

    query += ` ORDER BY a.work_date DESC, e.employee_code LIMIT ?`
    params.push(safeLimit)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      data: {
        items: results,
        attendances: results,  // backwards compat
        records: results       // backwards compat
      }
    })
  } catch (error: any) {
    console.error('Failed to get attendances:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Create employee
hrRouter.post('/employees', async (c) => {
  try {
    const body = await c.req.json()

    // 필수 항목 검증
    const REQUIRED: Record<string, string> = {
      employee_code: '사원번호', name: '성명',
      department: '부서', position: '직위', hire_date: '입사일자',
    }
    for (const [col, label] of Object.entries(REQUIRED)) {
      if (!body[col] || String(body[col]).trim() === '') {
        return c.json({ success: false, error: `${label}은(는) 필수 항목입니다.` }, 400)
      }
    }

    // pay_type enum 검증
    if (body.pay_type && !['VARIABLE', 'FIXED'].includes(body.pay_type)) {
      return c.json({ success: false, error: '급여유형은 VARIABLE 또는 FIXED만 가능합니다.' }, 400)
    }

    // RRN 마스킹된 값은 무시
    if (typeof body.resident_number === 'string' && body.resident_number.includes('*')) {
      delete body.resident_number
    }
    // RRN 암호화 (평문 → AES-256-GCM)
    if (body.resident_number && !body.resident_number.startsWith('aes:')) {
      const piiKey = c.env.JWT_SECRET || 'fallback-dev-key'
      body.resident_number = await encryptPII(body.resident_number, piiKey)
    }

    // INSERT 허용 컬럼 (employee_code 포함, status는 별도)
    const ALLOWED = [
      'employee_code', 'name', 'name_eng', 'birth_date', 'resident_number',
      'email', 'phone', 'mobile', 'address', 'postal_code', 'address_detail',
      'department', 'position', 'job_title', 'employment_type',
      'hire_date', 'resignation_date',
      'bank_name', 'bank_account', 'bank_holder',
      'base_salary', 'hourly_rate',
      'position_allowance', 'vehicle_allowance', 'meal_allowance_fixed',
      'special_bonus_fixed', 'other_allowance_fixed',
      'mutual_aid_fee', 'other_deduction_fixed',
      'dependents_count', 'children_under_20_count', 'income_tax_table_option',
      'insurance_grade',
      'insurance_apply_national_pension', 'insurance_apply_health',
      'insurance_apply_long_term_care', 'insurance_apply_employment',
      'insurance_apply_industrial_accident',
      'caps_id', 'caps_sync_enabled',
      'pay_type',
      'emergency_contact', 'emergency_phone', 'notes',
      'entity_id',
    ]

    // 실제 테이블 컬럼 조회 (없는 컬럼은 제외)
    let validCols: Set<string>
    try {
      const info: any = await c.env.DB.prepare(`PRAGMA table_info(employees)`).all()
      validCols = new Set((info?.results || []).map((r: any) => r.name as string))
    } catch {
      validCols = new Set(ALLOWED)
    }

    const cols: string[] = []
    const placeholders: string[] = []
    const values: any[] = []
    for (const key of ALLOWED) {
      if (!(key in body)) continue
      if (!validCols.has(key)) continue
      cols.push(key)
      placeholders.push('?')
      let v = body[key]
      // 빈 문자열은 NULL로
      if (v === '') v = null
      // boolean → 0/1
      if (typeof v === 'boolean') v = v ? 1 : 0
      values.push(v)
    }

    // status 기본값
    if (validCols.has('status')) {
      cols.push('status')
      placeholders.push('?')
      values.push('ACTIVE')
    }

    const sql = `INSERT INTO employees (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`
    const result = await c.env.DB.prepare(sql).bind(...values).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error: any) {
    console.error('hr.ts [POST /employees]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// PUT /api/hr/employees/:id
// 직원 상세 필드 업데이트 (기본정보 + 급여통장 + 고정수당/공제 + 4대보험 토글 + 세금설정)
// ============================================================================
hrRouter.put('/employees/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json<any>()

    // 화이트리스트 — 업데이트 허용 컬럼 (UI에서 관리)
    const ALLOWED = [
      // 기본정보
      'name', 'name_eng', 'birth_date', 'resident_number',
      'email', 'phone', 'mobile', 'address', 'postal_code', 'address_detail',
      'department', 'position', 'job_title', 'employment_type',
      'hire_date', 'resignation_date', 'status',
      // 급여통장
      'bank_name', 'bank_account', 'bank_holder',
      // 급여 (고정급)
      'base_salary', 'hourly_rate',
      'position_allowance', 'vehicle_allowance', 'meal_allowance_fixed',
      'special_bonus_fixed', 'other_allowance_fixed',
      // 고정 공제
      'mutual_aid_fee', 'other_deduction_fixed',
      // 세금 / 부양가족
      'dependents_count', 'children_under_20_count', 'income_tax_table_option',
      'insurance_grade',
      // 4대보험 토글
      'insurance_apply_national_pension', 'insurance_apply_health',
      'insurance_apply_long_term_care', 'insurance_apply_employment',
      'insurance_apply_industrial_accident',
      // CAPS 매핑
      'caps_id', 'caps_sync_enabled',
      // 급여유형
      'pay_type',
      // 비상연락망 / 메모
      'emergency_contact', 'emergency_phone', 'notes',
      // 소속 법인
      'entity_id',
    ]

    // ⚠️ pay_type enum 검증
    if ('pay_type' in body && !['VARIABLE', 'FIXED'].includes(body.pay_type)) {
      return c.json({ success: false, error: '급여유형은 VARIABLE 또는 FIXED만 가능합니다.' }, 400)
    }

    // ⚠️ NOT NULL 필드 방어: 빈 값이 들어오면 null 변환 전에 차단
    const NOT_NULL_FIELDS: Record<string, string> = {
      name: '성명', department: '부서', position: '직위', hire_date: '입사일자',
    }
    for (const [col, label] of Object.entries(NOT_NULL_FIELDS)) {
      if (col in body && (body[col] === null || body[col] === '' || body[col] === undefined)) {
        return c.json({ success: false, error: `${label}은(는) 필수 항목입니다.` }, 400)
      }
    }

    // ⚠️ 주민등록번호 마스킹 값 방어: GET에서 마스킹된 값이 그대로 돌아오는 것 방지
    if ('resident_number' in body && typeof body.resident_number === 'string' && body.resident_number.includes('*')) {
      delete body.resident_number  // 마스킹된 값은 저장하지 않음
    }
    // RRN 암호화 (평문 → AES-256-GCM)
    if (body.resident_number && !body.resident_number.startsWith('aes:')) {
      const piiKey = c.env.JWT_SECRET || 'fallback-dev-key'
      body.resident_number = await encryptPII(body.resident_number, piiKey)
    }

    // ⚠️ 급여/민감 필드 변경 시 ADMIN/MANAGER 권한 필요
    // 현재 DB 값과 비교하여 실제 변경이 있을 때만 체크
    const SALARY_FIELDS = ['pay_type', 'base_salary', 'hourly_rate', 'position_allowance',
      'vehicle_allowance', 'meal_allowance_fixed', 'special_bonus_fixed', 'other_allowance_fixed']
    const currentEmp = await c.env.DB.prepare(`SELECT * FROM employees WHERE id = ?`).bind(id).first<any>()
    if (!currentEmp) {
      return c.json({ success: false, error: '직원을 찾을 수 없습니다.' }, 404)
    }
    const hasSalaryChange = SALARY_FIELDS.some(f => {
      if (!(f in body)) return false
      const newVal = body[f]
      const curVal = currentEmp[f]
      // null/undefined/0/'' 정규화 후 비교
      return String(newVal ?? '') !== String(curVal ?? '')
    })
    if (hasSalaryChange) {
      const user = c.get('user')
      if (user?.role !== 'ADMIN' && user?.role !== 'MANAGER') {
        return c.json({ success: false, error: '급여 정보 변경은 관리자만 가능합니다.' }, 403)
      }
    }

    // ⚠️ 방어 로직: employees 테이블에 실제 존재하는 컬럼만 업데이트한다.
    // (0112 마이그레이션이 아직 적용되지 않은 환경 대응)
    let colInfo: { name: string }[] = []
    try {
      const res = await c.env.DB.prepare(`PRAGMA table_info(employees)`).all()
      colInfo = (res.results || []) as { name: string }[]
    } catch (pragmaErr: any) {
      console.error('PRAGMA table_info failed:', pragmaErr)
      // PRAGMA 실패 시 ALLOWED 목록을 그대로 사용 (fallback)
    }
    const existingCols = colInfo.length > 0
      ? new Set(colInfo.map((r) => r.name))
      : new Set(ALLOWED)  // fallback: 허용 목록 전부 사용

    const setCols: string[] = []
    const vals: any[] = []
    const skippedCols: string[] = []

    for (const key of ALLOWED) {
      if (!(key in body)) continue
      if (!existingCols.has(key)) {
        skippedCols.push(key)
        continue
      }
      setCols.push(`${key} = ?`)
      const v = body[key]
      if (typeof v === 'boolean') vals.push(v ? 1 : 0)
      else if (v === '') vals.push(null)
      else vals.push(v)
    }

    if (setCols.length === 0) {
      return c.json({
        success: false,
        error: '업데이트할 필드가 없습니다.',
        detail: skippedCols.length > 0
          ? `DB에 존재하지 않는 컬럼: ${skippedCols.join(', ')}. 마이그레이션(0112)을 먼저 적용하세요.`
          : undefined,
      }, 400)
    }

    if (existingCols.has('updated_at')) {
      setCols.push(`updated_at = datetime('now')`)
    }
    vals.push(id)

    await c.env.DB.prepare(
      `UPDATE employees SET ${setCols.join(', ')} WHERE id = ?`
    ).bind(...vals).run()

    // 반환: 업데이트된 행
    const updated = await c.env.DB.prepare(
      `SELECT * FROM employees WHERE id = ?`
    ).bind(id).first<any>()

    // RRN 복호화 + 마스킹
    const user = c.get('user')
    if (updated?.resident_number) {
      const piiKey = c.env.JWT_SECRET || 'fallback-dev-key'
      const decrypted = await decryptPII(String(updated.resident_number), piiKey)
      if (user?.role === 'ADMIN') {
        updated.resident_number = decrypted
      } else {
        updated.resident_number = decrypted.length >= 7 ? decrypted.slice(0, 6) + '-*******' : '******-*******'
      }
    }

    return c.json({
      success: true,
      data: updated,
      warnings: skippedCols.length > 0
        ? [`다음 필드는 DB에 컬럼이 없어 저장되지 않았습니다: ${skippedCols.join(', ')}`]
        : undefined,
    })
  } catch (error: any) {
    console.error('hr.ts [PUT /employees/:id]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// DELETE /api/hr/employees/:id
// 직원 하드 삭제 (ADMIN 전용) — 출근/급여/휴가 등 관련 데이터까지 함께 제거
// ============================================================================
hrRouter.delete('/employees/:id', async (c) => {
  try {
    const user = c.get('user')
    if (user?.role !== 'ADMIN') {
      return c.json({ success: false, error: '관리자(ADMIN)만 직원을 삭제할 수 있습니다.' }, 403)
    }

    const id = Number(c.req.param('id'))
    if (!id || isNaN(id)) {
      return c.json({ success: false, error: '유효하지 않은 직원 ID입니다.' }, 400)
    }

    const emp = await c.env.DB.prepare(`SELECT id, name, employee_code FROM employees WHERE id = ?`).bind(id).first<any>()
    if (!emp) {
      return c.json({ success: false, error: '직원을 찾을 수 없습니다.' }, 404)
    }

    // 자식 테이블 정리 — 존재하지 않는 테이블은 무시
    const CHILD_TABLES = [
      'attendance', 'payroll', 'payroll_records', 'payslips',
      'leave_balances', 'leave_requests', 'leaves',
      'caps_attendance_raw', 'caps_employee_mapping',
      'work_assignments', 'production_logs', 'production_issues',
      'employee_documents', 'employee_history',
    ]
    const cleanupResults: Record<string, number | string> = {}
    for (const table of CHILD_TABLES) {
      try {
        const r = await c.env.DB.prepare(`DELETE FROM ${table} WHERE employee_id = ?`).bind(id).run()
        cleanupResults[table] = r.meta?.changes ?? 0
      } catch (e: any) {
        // 테이블 없음 등은 무시
        cleanupResults[table] = 'skipped'
      }
    }

    // 본 테이블 삭제
    await c.env.DB.prepare(`DELETE FROM employees WHERE id = ?`).bind(id).run()

    return c.json({
      success: true,
      data: {
        deleted_id: id,
        deleted_name: emp.name,
        deleted_code: emp.employee_code,
        cleanup: cleanupResults,
      },
    })
  } catch (error: any) {
    console.error('hr.ts [DELETE /employees/:id]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Create attendance (UPSERT into canonical attendance table)
hrRouter.post('/attendances', async (c) => {
  try {
    const body = await c.req.json()
    const { employee_id, date, check_in, check_out, attendance_type = 'NORMAL', status = 'PRESENT', notes } = body

    let work_hours = 0
    let overtime_hours = 0
    if (check_in && check_out) {
      const checkInTime = new Date(`${date}T${check_in}`)
      const checkOutTime = new Date(`${date}T${check_out}`)
      work_hours = Math.max(0, (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60))
      overtime_hours = Math.max(0, work_hours - 8)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO attendance (employee_id, work_date, check_in_time, check_out_time, work_hours, overtime_hours, attendance_type, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, work_date) DO UPDATE SET
        check_in_time = excluded.check_in_time,
        check_out_time = excluded.check_out_time,
        work_hours = excluded.work_hours,
        overtime_hours = excluded.overtime_hours,
        attendance_type = excluded.attendance_type,
        status = excluded.status,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).bind(
      employee_id, date,
      check_in ? `${date}T${check_in}` : null,
      check_out ? `${date}T${check_out}` : null,
      work_hours, overtime_hours, attendance_type, status, notes || null
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error: any) {
    console.error('Failed to create attendance:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Create payroll
hrRouter.post('/payrolls', async (c) => {
  try {
    const body = await c.req.json()
    const {
      employee_id,
      pay_period,
      base_salary,
      meal_allowance = 0,
      transport_allowance = 0,
      other_allowances = 0,
      overtime_pay = 0,
      national_pension = 0,
      health_insurance = 0,
      employment_insurance = 0,
      income_tax = 0,
      payment_status = 'PENDING'
    } = body

    const total_allowances = parseFloat(meal_allowance) + parseFloat(transport_allowance) + parseFloat(other_allowances) + parseFloat(overtime_pay)
    const total_deductions = parseFloat(national_pension) + parseFloat(health_insurance) + parseFloat(employment_insurance) + parseFloat(income_tax)
    const net_salary = parseFloat(base_salary) + total_allowances - total_deductions

    const result = await c.env.DB.prepare(`
      INSERT INTO payrolls (
        employee_id, pay_period, base_salary,
        meal_allowance, transport_allowance, other_allowances, overtime_pay,
        national_pension, health_insurance, employment_insurance, income_tax,
        total_allowances, total_deductions, net_salary, payment_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      employee_id, pay_period, base_salary,
      meal_allowance, transport_allowance, other_allowances, overtime_pay,
      national_pension, health_insurance, employment_insurance, income_tax,
      total_allowances, total_deductions, net_salary, payment_status
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error: any) {
    console.error('Failed to create payroll:', error)
    console.error('HR error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// Get HR statistics
hrRouter.get('/stats', async (c) => {
  try {
    // Total employees
    const { results: totalResults } = await c.env.DB.prepare(`
      SELECT COUNT(*) as total FROM employees WHERE status = 'ACTIVE'
    `).all<{ total: number }>()

    // Department breakdown (employees table doesn't have base_salary)
    const { results: deptResults } = await c.env.DB.prepare(`
      SELECT 
        department,
        COUNT(*) as count
      FROM employees
      WHERE status = 'ACTIVE'
      GROUP BY department
    `).all()

    // Today's attendance — 재직(ACTIVE) 직원의 PRESENT 상태만 카운트
    // KST 기준 오늘 (UTC+9)
    const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { results: attendanceResults } = await c.env.DB.prepare(`
      SELECT COUNT(DISTINCT a.employee_id) as present
      FROM attendance a
      INNER JOIN employees e ON e.id = a.employee_id
      WHERE a.work_date = ?
        AND e.status = 'ACTIVE'
        AND a.status = 'PRESENT'
    `).bind(todayKst).all<{ present: number }>()

    // Average work hours this month — 재직 직원의 PRESENT 기록만 (결근 제외)
    const { results: avgHoursResults } = await c.env.DB.prepare(`
      SELECT AVG(a.work_hours) as avg_hours
      FROM attendance a
      INNER JOIN employees e ON e.id = a.employee_id
      WHERE strftime('%Y-%m', a.work_date) = strftime('%Y-%m', 'now', '+9 hours')
        AND e.status = 'ACTIVE'
        AND a.status = 'PRESENT'
        AND a.work_hours IS NOT NULL
        AND a.work_hours > 0
    `).all<{ avg_hours: number }>()

    // Monthly payroll total (실제 테이블: payroll 단수형, 컬럼: net_pay)
    const thisMonth = new Date().toISOString().slice(0, 7)
    const { results: payrollResults } = await c.env.DB.prepare(`
      SELECT SUM(net_pay) as total
      FROM payroll
      WHERE pay_period = ?
    `).bind(thisMonth).all<{ total: number }>()

    return c.json({
      success: true,
      data: {
        total_employees: totalResults[0].total || 0,
        today_attendance: attendanceResults[0].present || 0,
        avg_work_hours: avgHoursResults[0].avg_hours || 0,
        monthly_payroll: payrollResults[0].total || 0,
        departments: deptResults
      }
    })
  } catch (error: any) {
    console.error('Failed to get HR stats:', error)
    console.error('HR error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /api/hr/employees/:id/detail
// 직원 프로필 + 월간 근태 + 연도 급여 한 번에
// query: ?month=YYYY-MM (default: 이번 달), ?year=YYYY (default: 올해)
// ============================================================================
hrRouter.get('/employees/:id/detail', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const month = c.req.query('month') || new Date().toISOString().slice(0, 7)  // YYYY-MM
    const year = c.req.query('year') || new Date().getFullYear().toString()

    // 1) 직원 프로필 + users.username
    const employee = await c.env.DB.prepare(`
      SELECT e.*, u.username
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `).bind(id).first<any>()

    if (!employee) {
      return c.json({ success: false, error: '직원을 찾을 수 없습니다.' }, 404)
    }

    // RRN 복호화 + 마스킹 (ADMIN만 원본)
    const user = c.get('user')
    if (employee.resident_number) {
      const piiKey = c.env.JWT_SECRET || 'fallback-dev-key'
      const decrypted = await decryptPII(String(employee.resident_number), piiKey)
      if (user?.role === 'ADMIN') {
        employee.resident_number = decrypted
      } else {
        employee.resident_number = decrypted.length >= 7 ? decrypted.slice(0, 6) + '-*******' : '******-*******'
      }
    }

    // 2) 해당 월 근태 (일자별)
    const { results: attendanceRecords } = await c.env.DB.prepare(`
      SELECT
        id, work_date, check_in_time, check_out_time,
        work_hours, overtime_hours, attendance_type, status, notes
      FROM attendance
      WHERE employee_id = ?
        AND strftime('%Y-%m', work_date) = ?
      ORDER BY work_date
    `).bind(id, month).all()

    // 월간 근태 집계
    const attendanceSummary = (attendanceRecords || []).reduce((acc: any, r: any) => {
      acc.total_days += 1
      acc.total_work_hours += Number(r.work_hours || 0)
      acc.total_overtime_hours += Number(r.overtime_hours || 0)
      if (r.attendance_type === 'LATE') acc.late_count += 1
      if (r.attendance_type === 'ABSENT' || r.status === 'ABSENT') acc.absent_days += 1
      if (r.attendance_type === 'VACATION' || r.status === 'VACATION') acc.vacation_days += 1
      return acc
    }, { total_days: 0, total_work_hours: 0, total_overtime_hours: 0, late_count: 0, absent_days: 0, vacation_days: 0 })

    // 3) 연도별 급여 (12개월)
    const { results: payrollRecords } = await c.env.DB.prepare(`
      SELECT
        id, pay_period, pay_date, base_salary, overtime_pay, night_pay, holiday_pay,
        meal_allowance, transportation_allowance, bonus, annual_leave_pay,
        total_salary, taxable_pay,
        national_pension, health_insurance, long_term_care_insurance,
        employment_insurance, income_tax, local_tax, other_deduction,
        total_deduction, net_pay,
        work_days, overtime_hours, absent_days, late_count,
        status, paid_at
      FROM payroll
      WHERE employee_id = ?
        AND pay_period LIKE ?
      ORDER BY pay_period
    `).bind(id, `${year}-%`).all()

    const payrollSummary = (payrollRecords || []).reduce((acc: any, r: any) => {
      acc.total_gross += Number(r.total_salary || 0)
      acc.total_deduction += Number(r.total_deduction || 0)
      acc.total_net += Number(r.net_pay || 0)
      return acc
    }, { total_gross: 0, total_deduction: 0, total_net: 0 })

    // 4) 연차 사용 (leave_requests)
    const { results: leaveRecords } = await c.env.DB.prepare(`
      SELECT id, leave_type, start_date, end_date, days, status, reason
      FROM leave_requests
      WHERE employee_id = ?
        AND strftime('%Y', start_date) = ?
      ORDER BY start_date DESC
    `).bind(id, year).all().catch(() => ({ results: [] }))

    return c.json({
      success: true,
      data: {
        employee,
        month,
        year,
        attendance: {
          records: attendanceRecords || [],
          summary: attendanceSummary
        },
        payroll: {
          records: payrollRecords || [],
          summary: payrollSummary
        },
        leaves: leaveRecords || []
      }
    })
  } catch (error: any) {
    console.error('hr.ts [GET /employees/:id/detail]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// 근로계약서 CRUD
// ============================================================================

// GET /api/hr/contracts/expiring — 만료 임박 계약 (30일 내)
hrRouter.get('/contracts/expiring', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const entityId = getEntityId(c)
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    let query = `
      SELECT lc.*, e.name as employee_name, e.employee_code, e.department, e.position,
             ent.name as entity_name
      FROM labor_contracts lc
      JOIN employees e ON lc.employee_id = e.id
      LEFT JOIN entities ent ON lc.entity_id = ent.id
      WHERE lc.contract_end_date IS NOT NULL
        AND lc.contract_end_date >= ?
        AND lc.contract_end_date <= ?
        AND lc.status IN ('DRAFT', 'SIGNED')
    `
    const params: any[] = [today, thirtyDaysLater]

    if (entityId) {
      query += ` AND lc.entity_id = ?`
      params.push(entityId)
    }

    query += ` ORDER BY lc.contract_end_date ASC`

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({ success: true, data: results || [] })
  } catch (error: any) {
    console.error('hr.ts [GET /contracts/expiring]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/hr/contracts — 계약서 목록
hrRouter.get('/contracts', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { employee_id, status, page = '1', limit = '50' } = c.req.query()
    const entityId = getEntityId(c)
    const safeLimit = Math.min(parseInt(limit) || 50, 200)
    const offset = (parseInt(page) - 1) * safeLimit

    let query = `
      SELECT lc.*, e.name as employee_name, e.employee_code, e.department, e.position,
             ent.name as entity_name
      FROM labor_contracts lc
      JOIN employees e ON lc.employee_id = e.id
      LEFT JOIN entities ent ON lc.entity_id = ent.id
      WHERE 1=1
    `
    const params: any[] = []

    if (entityId) {
      query += ` AND lc.entity_id = ?`
      params.push(entityId)
    }
    if (employee_id) {
      query += ` AND lc.employee_id = ?`
      params.push(employee_id)
    }
    if (status) {
      query += ` AND lc.status = ?`
      params.push(status)
    }

    // Count
    const countQuery = query.replace(/SELECT lc\.\*.*?FROM/, 'SELECT COUNT(*) as total FROM')
    const countResult = await c.env.DB.prepare(countQuery).bind(...params).first<{ total: number }>()
    const total = countResult?.total || 0

    query += ` ORDER BY lc.created_at DESC LIMIT ? OFFSET ?`
    params.push(safeLimit, offset)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      data: {
        contracts: results || [],
        pagination: {
          page: parseInt(page),
          limit: safeLimit,
          total,
          total_pages: Math.ceil(total / safeLimit)
        }
      }
    })
  } catch (error: any) {
    console.error('hr.ts [GET /contracts]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/hr/contracts/:id — 계약서 상세
hrRouter.get('/contracts/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const entityId = getEntityId(c)

    let query = `
      SELECT lc.*, e.name as employee_name, e.employee_code, e.department, e.position,
             ent.name as entity_name
      FROM labor_contracts lc
      JOIN employees e ON lc.employee_id = e.id
      LEFT JOIN entities ent ON lc.entity_id = ent.id
      WHERE lc.id = ?
    `
    const params: any[] = [id]

    if (entityId) {
      query += ` AND lc.entity_id = ?`
      params.push(entityId)
    }

    const contract = await c.env.DB.prepare(query).bind(...params).first<Record<string, unknown>>()

    if (!contract) {
      return c.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, 404)
    }

    return c.json({ success: true, data: contract })
  } catch (error: any) {
    console.error('hr.ts [GET /contracts/:id]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/hr/contracts — 계약서 생성 (DRAFT)
hrRouter.post('/contracts', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json()
    const entityId = getEntityId(c)

    const {
      employee_id, contract_type, contract_date, contract_start_date,
      contract_end_date, wage_start_date, wage_end_date,
      hourly_rate, work_type, job_description, probation_months
    } = body

    if (!employee_id || !contract_type || !contract_date || !contract_start_date) {
      return c.json({ success: false, error: '필수 항목이 누락되었습니다. (employee_id, contract_type, contract_date, contract_start_date)' }, 400)
    }

    // 직원 존재 확인 + entity_id 가져오기
    const emp = await c.env.DB.prepare(`SELECT id, entity_id FROM employees WHERE id = ?`).bind(employee_id).first<{ id: number; entity_id: number | null }>()
    if (!emp) {
      return c.json({ success: false, error: '직원을 찾을 수 없습니다.' }, 404)
    }

    const contractEntityId = emp.entity_id || entityId || 1

    const result = await c.env.DB.prepare(`
      INSERT INTO labor_contracts (
        employee_id, entity_id, contract_type, contract_date, contract_start_date,
        contract_end_date, wage_start_date, wage_end_date,
        hourly_rate, work_type, job_description, probation_months,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', datetime('now'), datetime('now'))
    `).bind(
      employee_id, contractEntityId, contract_type, contract_date, contract_start_date,
      contract_end_date || null, wage_start_date || null, wage_end_date || null,
      hourly_rate || null, work_type || null, job_description || null, probation_months || null
    ).run()

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error: any) {
    console.error('hr.ts [POST /contracts]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PUT /api/hr/contracts/:id — 계약서 수정
hrRouter.put('/contracts/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const entityId = getEntityId(c)
    const body = await c.req.json()

    // 기존 계약 확인
    let checkQuery = `SELECT id, status FROM labor_contracts WHERE id = ?`
    const checkParams: any[] = [id]
    if (entityId) {
      checkQuery += ` AND entity_id = ?`
      checkParams.push(entityId)
    }
    const existing = await c.env.DB.prepare(checkQuery).bind(...checkParams).first<{ id: number; status: string }>()

    if (!existing) {
      return c.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, 404)
    }
    if (existing.status === 'SIGNED') {
      return c.json({ success: false, error: '서명된 계약서는 수정할 수 없습니다.' }, 400)
    }

    const ALLOWED = [
      'contract_type', 'contract_date', 'contract_start_date', 'contract_end_date',
      'wage_start_date', 'wage_end_date', 'hourly_rate', 'work_type',
      'job_description', 'probation_months'
    ]

    const setCols: string[] = []
    const vals: any[] = []
    for (const key of ALLOWED) {
      if (!(key in body)) continue
      setCols.push(`${key} = ?`)
      vals.push(body[key] === '' ? null : body[key])
    }

    if (setCols.length === 0) {
      return c.json({ success: false, error: '업데이트할 필드가 없습니다.' }, 400)
    }

    setCols.push(`updated_at = datetime('now')`)
    vals.push(id)

    await c.env.DB.prepare(
      `UPDATE labor_contracts SET ${setCols.join(', ')} WHERE id = ?`
    ).bind(...vals).run()

    // 업데이트된 행 반환
    const updated = await c.env.DB.prepare(
      `SELECT * FROM labor_contracts WHERE id = ?`
    ).bind(id).first<Record<string, unknown>>()

    return c.json({ success: true, data: updated })
  } catch (error: any) {
    console.error('hr.ts [PUT /contracts/:id]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// PATCH /api/hr/contracts/:id/sign — 서명
hrRouter.patch('/contracts/:id/sign', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const entityId = getEntityId(c)
    const body = await c.req.json()

    const { signature_employee_base64, signature_employer_base64 } = body

    if (!signature_employee_base64) {
      return c.json({ success: false, error: '근로자 서명이 필요합니다.' }, 400)
    }

    // 기존 계약 확인
    let checkQuery = `SELECT id, status FROM labor_contracts WHERE id = ?`
    const checkParams: any[] = [id]
    if (entityId) {
      checkQuery += ` AND entity_id = ?`
      checkParams.push(entityId)
    }
    const existing = await c.env.DB.prepare(checkQuery).bind(...checkParams).first<{ id: number; status: string }>()

    if (!existing) {
      return c.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, 404)
    }
    if (existing.status === 'SIGNED') {
      return c.json({ success: false, error: '이미 서명된 계약서입니다.' }, 400)
    }

    const signedIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'

    await c.env.DB.prepare(`
      UPDATE labor_contracts
      SET signature_employee_base64 = ?,
          signature_employer_base64 = ?,
          signed_ip = ?,
          signed_at = datetime('now'),
          status = 'SIGNED',
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      signature_employee_base64,
      signature_employer_base64 || null,
      signedIp,
      id
    ).run()

    const updated = await c.env.DB.prepare(
      `SELECT * FROM labor_contracts WHERE id = ?`
    ).bind(id).first<Record<string, unknown>>()

    return c.json({ success: true, data: updated })
  } catch (error: any) {
    console.error('hr.ts [PATCH /contracts/:id/sign]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/hr/contracts/:id/preview — 계약서 HTML 미리보기
hrRouter.get('/contracts/:id/preview', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const entityId = getEntityId(c)

    let query = `
      SELECT lc.*,
             e.name as employee_name, e.birth_date as employee_birth_date,
             COALESCE(e.mobile, e.phone) as employee_phone, e.address as employee_address,
             ent.name as entity_name, ent.representative as entity_representative,
             ent.address as entity_address
      FROM labor_contracts lc
      JOIN employees e ON lc.employee_id = e.id
      LEFT JOIN entities ent ON lc.entity_id = ent.id
      WHERE lc.id = ?
    `
    const params: any[] = [id]

    if (entityId) {
      query += ` AND lc.entity_id = ?`
      params.push(entityId)
    }

    const row = await c.env.DB.prepare(query).bind(...params).first<Record<string, any>>()

    if (!row) {
      return c.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, 404)
    }

    const { renderLaborContractHTML } = await import('../templates/laborContract')

    const html = renderLaborContractHTML({
      entity: {
        name: row.entity_name || '동산기획',
        representative: row.entity_representative || '',
        address: row.entity_address || '',
      },
      employee: {
        name: row.employee_name || '',
        birth_date: row.employee_birth_date || '',
        phone: row.employee_phone || '',
        address: row.employee_address || '',
      },
      contract: {
        contract_date: row.contract_date || '',
        contract_start_date: row.contract_start_date || '',
        contract_end_date: row.contract_end_date || null,
        wage_start_date: row.wage_start_date || '',
        wage_end_date: row.wage_end_date || '',
        hourly_rate: row.hourly_rate || 0,
        work_type: row.work_type || 'REGULAR',
        job_description: row.job_description || '',
        probation_months: row.probation_months ?? 3,
        signature_employee_base64: row.signature_employee_base64 || undefined,
        signature_employer_base64: row.signature_employer_base64 || undefined,
      },
    })

    return c.html(html)
  } catch (error: any) {
    console.error('hr.ts [GET /contracts/:id/preview]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/hr/contracts/:id — 삭제 (DRAFT만)
hrRouter.delete('/contracts/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const entityId = getEntityId(c)

    let checkQuery = `SELECT id, status FROM labor_contracts WHERE id = ?`
    const checkParams: any[] = [id]
    if (entityId) {
      checkQuery += ` AND entity_id = ?`
      checkParams.push(entityId)
    }
    const existing = await c.env.DB.prepare(checkQuery).bind(...checkParams).first<{ id: number; status: string }>()

    if (!existing) {
      return c.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, 404)
    }
    if (existing.status !== 'DRAFT') {
      return c.json({ success: false, error: 'DRAFT 상태의 계약서만 삭제할 수 있습니다.' }, 400)
    }

    await c.env.DB.prepare(`DELETE FROM labor_contracts WHERE id = ?`).bind(id).run()

    return c.json({ success: true, data: { deleted_id: id } })
  } catch (error: any) {
    console.error('hr.ts [DELETE /contracts/:id]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ============================================================================
// GET /api/hr/certificates/employment/:employeeId — 재직증명서 HTML 반환
// ============================================================================
hrRouter.get('/certificates/employment/:employeeId', async (c) => {
  try {
    const employeeId = Number(c.req.param('employeeId'))
    const purpose = c.req.query('purpose') || '제출용'

    // employee + entity JOIN
    const emp = await c.env.DB.prepare(`
      SELECT e.*, ent.name as entity_name, ent.representative, ent.address as entity_address,
             ent.business_reg_no
      FROM employees e
      LEFT JOIN entities ent ON ent.id = e.entity_id
      WHERE e.id = ? AND e.status = 'ACTIVE'
    `).bind(employeeId).first<any>()

    if (!emp) {
      return c.json({ success: false, error: '직원을 찾을 수 없습니다.' }, 404)
    }

    // certificate_number 자동 채번: CERT-YYYYMMDD-NNN
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const { results: countResult } = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM certificate_logs WHERE issue_date = ?
    `).bind(today.toISOString().slice(0, 10)).all<{ cnt: number }>().catch(() => ({ results: [{ cnt: 0 }] }))
    const seq = ((countResult?.[0]?.cnt) || 0) + 1
    const certificateNumber = `CERT-${dateStr}-${String(seq).padStart(3, '0')}`

    // 발급 로그 저장 (테이블 없으면 무시)
    try {
      await c.env.DB.prepare(`
        INSERT INTO certificate_logs (employee_id, certificate_number, certificate_type, purpose, issue_date, created_at)
        VALUES (?, ?, 'EMPLOYMENT', ?, ?, datetime('now'))
      `).bind(employeeId, certificateNumber, purpose, today.toISOString().slice(0, 10)).run()
    } catch {
      // certificate_logs 테이블 없으면 무시
    }

    const html = renderEmploymentCertificateHTML({
      entity: {
        name: emp.entity_name || '동산기획',
        representative: emp.representative || '',
        address: emp.entity_address || '',
        business_reg_no: emp.business_reg_no || '',
      },
      employee: {
        name: emp.name,
        birth_date: emp.birth_date || '',
        department: emp.department || '',
        position: emp.position || '',
        hire_date: emp.hire_date || '',
        employee_code: emp.employee_code || '',
      },
      issue_date: today.toISOString().slice(0, 10),
      certificate_number: certificateNumber,
      purpose,
    })

    return c.html(html)
  } catch (error: any) {
    console.error('hr.ts [GET /certificates/employment/:employeeId]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default hrRouter
