/**
 * payroll/tax-agent.ts — 세무대리인 CSV API (E)
 * 2026-04-15 분할
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import { authMiddleware, requireRole } from '../../middleware/auth'

const taxAgentRouter = new Hono<HonoEnv>()
taxAgentRouter.use('/*', authMiddleware)

// 세무대리인 CSV 전용 헬퍼 (원본 1633~1682)
// ============================================================================
// B5: 세무사 대행 전달용 CSV 다운로드
// 목적: 세무사가 4대보험/원천세 신고 시 복사·편집할 수 있는 월별 엑셀 호환 CSV.
//       한국 엑셀 기본 인코딩(CP949)에서도 한글이 깨지지 않도록 UTF-8 BOM 포함.
// ============================================================================

/** CSV 한 필드를 안전하게 이스케이프 — 쉼표/큰따옴표/개행 포함 시 따옴표 감쌈 */
function csvField(v: any): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/** 주민등록번호 마스킹 (뒷 6자리 ***) — 세무사 CSV는 원본 필요하지만, ADMIN이 아닐 때는 마스킹 */
function maskRrn(rrn: string | null | undefined, unmask: boolean): string {
  if (!rrn) return ''
  if (unmask) return rrn
  // 000000-0000000 → 000000-0******
  const clean = rrn.replace(/\s/g, '')
  if (clean.length >= 8) return clean.slice(0, 8) + '******'
  return clean
}

/** YYYY-MM → [firstDay, lastDay] */
function monthBounds(period: string): { first: string; last: string } {
  const [y, m] = period.split('-').map(Number)
  const firstD = new Date(y, m - 1, 1)
  const lastD = new Date(y, m, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    first: `${y}-${pad(m)}-01`,
    last: `${y}-${pad(m)}-${pad(lastD.getDate())}`,
  }
}

/** CSV 응답 — BOM + Content-Disposition */
function csvResponse(c: any, filename: string, rows: string[]): Response {
  const body = '\uFEFF' + rows.join('\r\n') + '\r\n'
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}

// tax-agent 라우트 (원본 1686~2002)
taxAgentRouter.get('/tax-agent/changes', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const period = c.req.query('period') || ''
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return c.json({ success: false, error: 'period=YYYY-MM 파라미터 필요' }, 400)
    }
    const user = c.get('user')
    const unmask = user?.role === 'ADMIN'
    const { first, last } = monthBounds(period)

    // 이번 달 입사자
    const { results: hires } = await c.env.DB.prepare(
      `SELECT employee_code, name, resident_number, hire_date, department, position, base_salary
       FROM employees
       WHERE hire_date BETWEEN ? AND ?
       ORDER BY hire_date`
    ).bind(first, last).all()

    // 이번 달 퇴사자
    const { results: quits } = await c.env.DB.prepare(
      `SELECT employee_code, name, resident_number, hire_date, resignation_date, department, position, base_salary
       FROM employees
       WHERE resignation_date BETWEEN ? AND ?
       ORDER BY resignation_date`
    ).bind(first, last).all()

    const rows: string[] = []
    rows.push([
      '구분', '사번', '성명', '주민등록번호', '입사일', '퇴사일',
      '부서', '직급', '월급여', '비고',
    ].map(csvField).join(','))

    for (const r of hires as any[]) {
      rows.push([
        '취득', r.employee_code, r.name, maskRrn(r.resident_number, unmask),
        r.hire_date, '', r.department, r.position, r.base_salary, '신규입사',
      ].map(csvField).join(','))
    }
    for (const r of quits as any[]) {
      rows.push([
        '상실', r.employee_code, r.name, maskRrn(r.resident_number, unmask),
        r.hire_date, r.resignation_date, r.department, r.position, r.base_salary, '퇴사',
      ].map(csvField).join(','))
    }

    return csvResponse(c, `4대보험_변동사항_${period}.csv`, rows)
  } catch (err: any) {
    console.error('tax-agent changes error:', err)
    return c.json({ success: false, error: '변동사항 CSV 생성 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// --- 2) 월별 급여 내역 ---
// GET /api/payroll/tax-agent/payroll?period=YYYY-MM
taxAgentRouter.get('/tax-agent/payroll', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const period = c.req.query('period') || ''
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return c.json({ success: false, error: 'period=YYYY-MM 파라미터 필요' }, 400)
    }
    const user = c.get('user')
    const unmask = user?.role === 'ADMIN'

    const { results } = await c.env.DB.prepare(
      `SELECT
         p.*,
         p.long_term_care_insurance as long_term_care,
         e.employee_code, e.name, e.resident_number, e.department, e.position,
         e.hire_date, e.resignation_date, e.status as employee_status,
         e.bank_name, e.bank_account
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.pay_period = ?
       ORDER BY e.department, e.name`
    ).bind(period).all()

    const rows: string[] = []
    rows.push([
      '사번', '성명', '주민등록번호', '부서', '직급',
      '입사일', '퇴사일', '재직상태',
      '기본급', '상여', '연장수당', '야간수당', '휴일수당',
      '식대(비과세)', '교통비(비과세)', '기타수당',
      '총지급', '과세대상',
      '국민연금', '건강보험', '장기요양', '고용보험',
      '소득세', '지방소득세',
      '총공제', '실지급액',
      '은행', '계좌번호',
    ].map(csvField).join(','))

    for (const r of results as any[]) {
      rows.push([
        r.employee_code, r.name, maskRrn(r.resident_number, unmask),
        r.department, r.position,
        r.hire_date, r.resignation_date || '', r.employee_status,
        r.base_salary, r.bonus || 0,
        r.overtime_pay || 0, r.night_pay || 0, r.holiday_pay || 0,
        r.meal_allowance || 0, r.transportation_allowance || 0, r.other_allowance || 0,
        r.total_salary, r.taxable_salary || r.total_salary,
        r.national_pension || 0, r.health_insurance || 0,
        r.long_term_care || 0, r.employment_insurance || 0,
        r.income_tax || 0, r.local_tax || 0,
        r.total_deduction, r.net_pay,
        r.bank_name || '', r.bank_account || '',
      ].map(csvField).join(','))
    }

    return csvResponse(c, `급여내역_${period}.csv`, rows)
  } catch (err: any) {
    console.error('tax-agent payroll error:', err)
    return c.json({ success: false, error: '급여내역 CSV 생성 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// --- 3) 연간 급여대장 (연말정산 준비용) ---
// GET /api/payroll/tax-agent/annual?year=YYYY
// 목적: 연말정산 시 세무사가 사용하는 직원별 연간 급여 집계.
//       월별 총지급(1~12월)과 연간 합계(총지급/과세/소득세/지방세/4대보험)를 한 행씩.
taxAgentRouter.get('/tax-agent/annual', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const year = c.req.query('year') || ''
    if (!/^\d{4}$/.test(year)) {
      return c.json({ success: false, error: 'year=YYYY 파라미터 필요' }, 400)
    }
    const user = c.get('user')
    const unmask = user?.role === 'ADMIN'

    // 해당 연도의 모든 급여 데이터를 직원별로 집계
    // 주의: payroll 테이블에 taxable_salary 컬럼 없음 → total_salary를 과세대상으로 사용
    //       장기요양 컬럼명은 long_term_care_insurance (migration 0111)
    const { results } = await c.env.DB.prepare(
      `SELECT
         e.id as employee_id,
         e.employee_code, e.name, e.resident_number,
         e.department, e.position, e.hire_date, e.resignation_date, e.status as employee_status,
         p.pay_period,
         p.total_salary,
         p.income_tax, p.local_tax,
         p.national_pension, p.health_insurance,
         p.long_term_care_insurance as long_term_care,
         p.employment_insurance,
         p.net_pay
       FROM employees e
       LEFT JOIN payroll p ON p.employee_id = e.id AND substr(p.pay_period, 1, 4) = ?
       WHERE e.hire_date IS NULL OR substr(e.hire_date, 1, 4) <= ?
       ORDER BY e.department, e.name, p.pay_period`
    ).bind(year, year).all()

    // 직원별로 그룹핑
    type EmpAgg = {
      employee_code: string
      name: string
      resident_number: string
      department: string
      position: string
      hire_date: string
      resignation_date: string
      employee_status: string
      monthly: Record<string, number> // '01'~'12' → total_salary
      totalSalary: number
      taxable: number
      incomeTax: number
      localTax: number
      pension: number
      health: number
      longTerm: number
      employment: number
      netPay: number
    }
    const byEmp = new Map<number, EmpAgg>()
    for (const r of results as any[]) {
      if (!byEmp.has(r.employee_id)) {
        byEmp.set(r.employee_id, {
          employee_code: r.employee_code,
          name: r.name,
          resident_number: r.resident_number,
          department: r.department,
          position: r.position,
          hire_date: r.hire_date,
          resignation_date: r.resignation_date || '',
          employee_status: r.employee_status,
          monthly: {},
          totalSalary: 0,
          taxable: 0,
          incomeTax: 0,
          localTax: 0,
          pension: 0,
          health: 0,
          longTerm: 0,
          employment: 0,
          netPay: 0,
        })
      }
      const agg = byEmp.get(r.employee_id)!
      if (r.pay_period) {
        const mm = String(r.pay_period).slice(5, 7)
        agg.monthly[mm] = (agg.monthly[mm] || 0) + (r.total_salary || 0)
        agg.totalSalary += r.total_salary || 0
        // payroll 테이블에 taxable_salary 컬럼 없음 → total_salary를 과세대상으로 사용
        agg.taxable += r.total_salary || 0
        agg.incomeTax += r.income_tax || 0
        agg.localTax += r.local_tax || 0
        agg.pension += r.national_pension || 0
        agg.health += r.health_insurance || 0
        agg.longTerm += r.long_term_care || 0
        agg.employment += r.employment_insurance || 0
        agg.netPay += r.net_pay || 0
      }
    }

    // 실제로 해당 연도에 급여가 발생한 직원만 (연간합계 > 0)
    const aggList = Array.from(byEmp.values()).filter(a => a.totalSalary > 0)

    const rows: string[] = []
    rows.push([
      '사번', '성명', '주민등록번호', '부서', '직급',
      '입사일', '퇴사일', '재직상태',
      '1월', '2월', '3월', '4월', '5월', '6월',
      '7월', '8월', '9월', '10월', '11월', '12월',
      '연간총지급', '연간과세',
      '연간소득세', '연간지방소득세',
      '연간국민연금', '연간건강보험', '연간장기요양', '연간고용보험',
      '연간실지급',
    ].map(csvField).join(','))

    for (const a of aggList) {
      rows.push([
        a.employee_code, a.name, maskRrn(a.resident_number, unmask),
        a.department, a.position,
        a.hire_date, a.resignation_date, a.employee_status,
        a.monthly['01'] || 0, a.monthly['02'] || 0, a.monthly['03'] || 0,
        a.monthly['04'] || 0, a.monthly['05'] || 0, a.monthly['06'] || 0,
        a.monthly['07'] || 0, a.monthly['08'] || 0, a.monthly['09'] || 0,
        a.monthly['10'] || 0, a.monthly['11'] || 0, a.monthly['12'] || 0,
        a.totalSalary, a.taxable,
        a.incomeTax, a.localTax,
        a.pension, a.health, a.longTerm, a.employment,
        a.netPay,
      ].map(csvField).join(','))
    }

    return csvResponse(c, `연간급여대장_${year}.csv`, rows)
  } catch (err: any) {
    console.error('tax-agent annual error:', err)
    return c.json({ success: false, error: '연간 급여대장 CSV 생성 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// --- 4) 직원 명부 (HR 스냅샷) ---
// GET /api/payroll/tax-agent/roster?status=active|all
// 목적: 세무사가 연말정산·4대보험 작업 시 참조하는 전직원 마스터 정보.
//       주민번호, 주소, 은행계좌, 부양가족 수, 보험등급 등 연말정산 필수 필드 포함.
taxAgentRouter.get('/tax-agent/roster', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const statusFilter = (c.req.query('status') || 'active').toLowerCase()
    const user = c.get('user')
    const unmask = user?.role === 'ADMIN'

    let sql = `SELECT
        employee_code, name, name_eng, resident_number,
        email, phone, mobile, address,
        department, position, job_title, employment_type,
        hire_date, resignation_date, status,
        base_salary, hourly_rate,
        bank_name, bank_account,
        emergency_contact, emergency_phone,
        dependents_count, children_under_20_count,
        income_tax_table_option, insurance_grade,
        notes
      FROM employees`
    const params: any[] = []
    if (statusFilter === 'active') {
      sql += ` WHERE status = 'ACTIVE'`
    } else if (statusFilter === 'resigned') {
      sql += ` WHERE status = 'RESIGNED'`
    }
    // 'all'이면 필터 없음
    sql += ` ORDER BY department, name`

    const { results } = await c.env.DB.prepare(sql).bind(...params).all()

    const rows: string[] = []
    rows.push([
      '사번', '성명', '영문명', '주민등록번호',
      '이메일', '전화', '휴대폰', '주소',
      '부서', '직급', '직책', '고용형태',
      '입사일', '퇴사일', '재직상태',
      '기본급', '시급',
      '은행', '계좌번호',
      '비상연락처', '비상전화',
      '부양가족수', '20세이하자녀수',
      '간이세액표옵션(%)', '보험등급',
      '비고',
    ].map(csvField).join(','))

    for (const r of results as any[]) {
      rows.push([
        r.employee_code, r.name, r.name_eng || '', maskRrn(r.resident_number, unmask),
        r.email || '', r.phone || '', r.mobile || '', r.address || '',
        r.department, r.position, r.job_title || '', r.employment_type,
        r.hire_date, r.resignation_date || '', r.status,
        r.base_salary || 0, r.hourly_rate || 0,
        r.bank_name || '', r.bank_account || '',
        r.emergency_contact || '', r.emergency_phone || '',
        r.dependents_count || 0, r.children_under_20_count || 0,
        r.income_tax_table_option || '100', r.insurance_grade || '',
        r.notes || '',
      ].map(csvField).join(','))
    }

    const today = new Date().toISOString().slice(0, 10)
    const label = statusFilter === 'all' ? '전체' : statusFilter === 'resigned' ? '퇴사자' : '재직자'
    return csvResponse(c, `직원명부_${label}_${today}.csv`, rows)
  } catch (err: any) {
    console.error('tax-agent roster error:', err)
    return c.json({ success: false, error: '직원 명부 CSV 생성 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

export default taxAgentRouter
