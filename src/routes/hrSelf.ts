// 직원 간이 인증 API — 계정 없는 직원이 사원번호+생년월일로 본인 확인
import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import type { HonoEnv } from '../types/env'
import { renderEmploymentCertificateHTML } from '../templates/employmentCertificate'

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
      WHERE employee_code = ? AND status = 'ACTIVE'
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
      WHERE e.id = ? AND e.status = 'ACTIVE'
    `).bind(employeeId).first<any>()

    if (!emp) {
      return c.json({ success: false, error: '직원 정보를 찾을 수 없습니다.' }, 404)
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

export default hrSelfRouter
