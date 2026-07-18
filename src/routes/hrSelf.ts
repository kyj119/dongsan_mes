// 직원 간이 인증 API — 계정 없는 직원이 사원번호+생년월일로 본인 확인
import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import type { HonoEnv } from '../types/env'
import { renderEmploymentCertificateHTML } from '../templates/employmentCertificate'
import { renderPayslipHTML } from '../templates/payslipHtml'
import { renderLaborContractHTML } from '../templates/laborContract'
import { kstYmd, kstYmdCompact } from '../utils/kstDate'

const hrSelfRouter = new Hono<HonoEnv>()

// POST /api/hr/self-auth — 사원번호 + 생년월일 6자리로 본인 확인
hrSelfRouter.post('/self-auth', async (c) => {
  try {
    const body = await c.req.json()
    const { employee_code, birth_date } = body

    if (!employee_code || !birth_date) {
      return c.json({ success: false, error: '사원번호와 생년월일을 입력하세요.' }, 400)
    }

    // birth_date: "YYMMDD" 6자리 → DB birth_date 형식과 비교
    const birthInput = String(birth_date).replace(/[^0-9]/g, '')
    if (birthInput.length !== 6) {
      return c.json({ success: false, error: '생년월일은 6자리(YYMMDD)로 입력하세요.' }, 400)
    }

    // DB 조회
    const emp = await c.env.DB.prepare(`
      SELECT id, employee_code, name, birth_date, department, position, hire_date, entity_id, status
      FROM employees
      WHERE employee_code = ? AND status = 'ACTIVE' AND is_deleted = 0
    `).bind(String(employee_code).toUpperCase().trim()).first<any>()

    if (!emp) {
      return c.json({ success: false, error: '일치하는 직원 정보를 찾을 수 없습니다.' }, 401)
    }

    // birth_date 비교: DB에 YYYY-MM-DD 또는 YYMMDD 등 다양한 형태 가능
    const dbBirth = String(emp.birth_date || '').replace(/[^0-9]/g, '')
    // DB가 YYYY-MM-DD (8자리)이면 뒤 6자리와 비교, 6자리이면 직접 비교
    const dbBirthShort = dbBirth.length >= 8 ? dbBirth.slice(2) : dbBirth
    if (dbBirthShort !== birthInput) {
      return c.json({ success: false, error: '일치하는 직원 정보를 찾을 수 없습니다.' }, 401)
    }

    // 임시 JWT (30분, 제한된 scope)
    const jwtSecret = c.env.JWT_SECRET
    const payload = {
      sub: emp.id,
      employee_code: emp.employee_code,
      name: emp.name,
      scope: 'employee-self',
      exp: Math.floor(Date.now() / 1000) + (30 * 60), // 30분
    }
    const token = await sign(payload, jwtSecret, 'HS256')

    return c.json({
      success: true,
      data: {
        token,
        employee: {
          id: emp.id,
          name: emp.name,
          employee_code: emp.employee_code,
          department: emp.department,
          position: emp.position,
        }
      }
    })
  } catch (error: any) {
    console.error('hrSelf [POST /self-auth]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// 임시 토큰 검증 헬퍼
async function verifySelfToken(c: any): Promise<any | null> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  try {
    const token = authHeader.substring(7)
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    if ((payload as any).scope !== 'employee-self') return null
    return payload
  } catch {
    return null
  }
}

// GET /api/hr/self/certificates/employment — 본인 재직증명서 HTML
hrSelfRouter.get('/self/certificates/employment', async (c) => {
  try {
    const payload = await verifySelfToken(c)
    if (!payload) {
      return c.json({ success: false, error: '인증이 필요합니다. 다시 로그인하세요.' }, 401)
    }

    const employeeId = payload.sub
    const purpose = c.req.query('purpose') || '제출용'

    // employee + entity JOIN
    const emp = await c.env.DB.prepare(`
      SELECT e.*, ent.name as entity_name, ent.representative, ent.address as entity_address,
             ent.business_reg_no
      FROM employees e
      LEFT JOIN entities ent ON ent.id = e.entity_id
      WHERE e.id = ? AND e.status = 'ACTIVE' AND e.is_deleted = 0
    `).bind(employeeId).first<any>()

    if (!emp) {
      return c.json({ success: false, error: '직원 정보를 찾을 수 없습니다.' }, 404)
    }

    // certificate_number 자동 채번: CERT-YYYYMMDD-NNN
    const today = kstYmd()
    const dateStr = kstYmdCompact()
    const eidCert = emp.entity_id || 1
    const { results: countResult } = await c.env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM certificate_logs WHERE issue_date = ? AND entity_id = ?
    `).bind(today, eidCert).all<{ cnt: number }>().catch(() => ({ results: [{ cnt: 0 }] }))
    const seq = ((countResult?.[0]?.cnt) || 0) + 1
    const certificateNumber = `CERT-${dateStr}-${String(seq).padStart(3, '0')}`

    // 발급 로그 저장 (#301: entity별 번호 독립)
    try {
      await c.env.DB.prepare(`
        INSERT INTO certificate_logs (employee_id, certificate_number, certificate_type, purpose, issue_date, entity_id, created_at)
        VALUES (?, ?, 'EMPLOYMENT', ?, ?, ?, datetime('now'))
      `).bind(employeeId, certificateNumber, purpose, today, eidCert).run()
    } catch (certErr) {
      console.error('certificate_logs insert failed:', certErr)
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
      issue_date: today,
      certificate_number: certificateNumber,
      purpose,
    })

    return c.html(html)
  } catch (error: any) {
    console.error('hrSelf [GET /self/certificates/employment]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/hr/self/contracts — 본인 계약서 목록
hrSelfRouter.get('/self/contracts', async (c) => {
  try {
    const payload = await verifySelfToken(c)
    if (!payload) {
      return c.json({ success: false, error: '인증이 필요합니다. 다시 로그인하세요.' }, 401)
    }

    const employeeId = payload.sub

    const { results } = await c.env.DB.prepare(`
      SELECT lc.id, lc.contract_type, lc.contract_date, lc.contract_start_date, lc.contract_end_date,
             lc.hourly_rate, lc.work_type, lc.status, lc.signed_at,
             ent.name as entity_name
      FROM labor_contracts lc
      LEFT JOIN entities ent ON lc.entity_id = ent.id
      WHERE lc.employee_id = ?
      ORDER BY lc.contract_date DESC
    `).bind(employeeId).all()

    return c.json({ success: true, data: results || [] })
  } catch (error: any) {
    console.error('hrSelf [GET /self/contracts]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/hr/self/payslips — 본인 급여명세서 목록 (교부(published)된 것만)
hrSelfRouter.get('/self/payslips', async (c) => {
  try {
    const payload = await verifySelfToken(c)
    if (!payload) return c.json({ success: false, error: '인증이 필요합니다. 다시 로그인하세요.' }, 401)
    const employeeId = payload.sub

    const { results } = await c.env.DB.prepare(`
      SELECT p.id, p.pay_period, p.pay_date, p.total_salary, p.total_deduction, p.net_pay, p.published_at
      FROM payroll p
      WHERE p.employee_id = ? AND p.published_at IS NOT NULL
      ORDER BY p.pay_period DESC
    `).bind(employeeId).all()

    return c.json({ success: true, data: results || [] })
  } catch (error: any) {
    console.error('hrSelf [GET /self/payslips]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/hr/self/payslips/:id — 본인 급여명세서 HTML (교부된 것만) + 열람 증빙 기록
hrSelfRouter.get('/self/payslips/:id', async (c) => {
  try {
    const payload = await verifySelfToken(c)
    if (!payload) return c.html('<h2 style="font-family:sans-serif;padding:40px;text-align:center;color:#dc2626;">인증이 필요합니다. 셀프서비스에서 다시 로그인하세요.</h2>', 401)
    const employeeId = payload.sub
    const id = Number(c.req.param('id'))

    // 소유(employee_id) + 교부(published_at) 이중 게이트
    const p = await c.env.DB.prepare(`
      SELECT p.*, e.name as employee_name, e.employee_code, e.department, e.position,
             ent.name as entity_name
      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      LEFT JOIN entities ent ON ent.id = p.entity_id
      WHERE p.id = ? AND p.employee_id = ? AND p.published_at IS NOT NULL
    `).bind(id, employeeId).first<any>()

    if (!p) return c.html('<h2 style="font-family:sans-serif;padding:40px;text-align:center;color:#dc2626;">급여명세서를 찾을 수 없거나 아직 교부되지 않았습니다.</h2>', 404)

    // 열람 증빙 기록 (교부 시 로그가 생성되지만, 방어적으로 upsert)
    try {
      const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || ''
      await c.env.DB.prepare(`
        INSERT INTO payslip_issuance_logs (payroll_id, employee_id, entity_id, pay_period, first_viewed_at, last_viewed_at, view_count, viewed_ip)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 1, ?)
        ON CONFLICT(payroll_id) DO UPDATE SET
          first_viewed_at = COALESCE(payslip_issuance_logs.first_viewed_at, datetime('now')),
          last_viewed_at = datetime('now'),
          view_count = payslip_issuance_logs.view_count + 1,
          viewed_ip = excluded.viewed_ip
      `).bind(id, employeeId, p.entity_id ?? null, p.pay_period, ip).run()
    } catch (logErr) {
      console.error('payslip view log failed:', logErr)
    }

    return c.html(renderPayslipHTML(p, kstYmd()))
  } catch (error: any) {
    console.error('hrSelf [GET /self/payslips/:id]:', error)
    return c.html('<h2 style="font-family:sans-serif;padding:40px;text-align:center;color:#dc2626;">서버 오류가 발생했습니다.</h2>', 500)
  }
})

// GET /api/hr/self/contracts/:id/preview — 본인 근로계약서 HTML (서명 전 검토용)
hrSelfRouter.get('/self/contracts/:id/preview', async (c) => {
  try {
    const payload = await verifySelfToken(c)
    if (!payload) return c.html('<h2 style="font-family:sans-serif;padding:40px;text-align:center;color:#dc2626;">인증이 필요합니다. 셀프서비스에서 다시 로그인하세요.</h2>', 401)
    const employeeId = payload.sub
    const id = Number(c.req.param('id'))

    // 소유(employee_id) 게이트 — 본인 계약서만
    const row = await c.env.DB.prepare(`
      SELECT lc.*,
             e.name as employee_name, e.birth_date as employee_birth_date,
             COALESCE(e.mobile, e.phone) as employee_phone, e.address as employee_address,
             e.base_salary as employee_base_salary,
             ent.name as entity_name, ent.representative as entity_representative,
             ent.address as entity_address
      FROM labor_contracts lc
      JOIN employees e ON lc.employee_id = e.id
      LEFT JOIN entities ent ON lc.entity_id = ent.id
      WHERE lc.id = ? AND lc.employee_id = ?
    `).bind(id, employeeId).first<Record<string, any>>()

    if (!row) return c.html('<h2 style="font-family:sans-serif;padding:40px;text-align:center;color:#dc2626;">계약서를 찾을 수 없습니다.</h2>', 404)

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
        contract_type: row.contract_type || 'HOURLY',
        contract_date: row.contract_date || '',
        contract_start_date: row.contract_start_date || '',
        contract_end_date: row.contract_end_date || null,
        wage_start_date: row.wage_start_date || '',
        wage_end_date: row.wage_end_date || '',
        hourly_rate: row.hourly_rate || 0,
        base_salary: row.employee_base_salary || 0,
        overtime_daily_hours: row.overtime_daily_hours || 0,
        overtime_work_days: row.overtime_work_days || 22,
        base_hours_monthly: row.base_hours_monthly || 209,
        monthly_salary: row.monthly_salary || 0,
        work_type: row.work_type || 'REGULAR',
        job_description: row.job_description || '',
        probation_months: row.probation_months ?? 3,
        signature_employee_base64: row.signature_employee_base64 || undefined,
        signature_employer_base64: row.signature_employer_base64 || undefined,
      },
    })
    return c.html(html)
  } catch (error: any) {
    console.error('hrSelf [GET /self/contracts/:id/preview]:', error)
    return c.html('<h2 style="font-family:sans-serif;padding:40px;text-align:center;color:#dc2626;">서버 오류가 발생했습니다.</h2>', 500)
  }
})

// PATCH /api/hr/self/contracts/:id/sign — 본인 근로계약서 전자서명 (직원 본인)
hrSelfRouter.patch('/self/contracts/:id/sign', async (c) => {
  try {
    const payload = await verifySelfToken(c)
    if (!payload) return c.json({ success: false, error: '인증이 필요합니다. 다시 로그인하세요.' }, 401)
    const employeeId = payload.sub
    const id = Number(c.req.param('id'))
    const body = await c.req.json().catch(() => ({} as any))
    const sig = body.signature_employee_base64

    if (!sig || typeof sig !== 'string' || !sig.startsWith('data:image')) {
      return c.json({ success: false, error: '서명 데이터가 필요합니다.' }, 400)
    }

    // 소유(employee_id) + 상태 게이트
    const existing = await c.env.DB.prepare(
      `SELECT id, status FROM labor_contracts WHERE id = ? AND employee_id = ?`
    ).bind(id, employeeId).first<{ id: number; status: string }>()
    if (!existing) return c.json({ success: false, error: '계약서를 찾을 수 없습니다.' }, 404)
    if (existing.status === 'SIGNED') return c.json({ success: false, error: '이미 서명된 계약서입니다.' }, 400)
    if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_SIGNATURE') {
      return c.json({ success: false, error: `서명할 수 없는 상태입니다 (${existing.status}).` }, 400)
    }

    const signedIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || ''
    // 근로자 서명만 기록(사용자측 서명은 admin 별도). 소유 게이트를 UPDATE에도 재적용.
    await c.env.DB.prepare(`
      UPDATE labor_contracts
      SET signature_employee_base64 = ?,
          signed_ip = ?,
          signed_at = datetime('now'),
          status = 'SIGNED',
          updated_at = datetime('now')
      WHERE id = ? AND employee_id = ? AND status IN ('DRAFT','PENDING_SIGNATURE')
    `).bind(sig, signedIp, id, employeeId).run()

    return c.json({ success: true })
  } catch (error: any) {
    console.error('hrSelf [PATCH /self/contracts/:id/sign]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default hrSelfRouter
