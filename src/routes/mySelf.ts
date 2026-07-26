// mySelf.ts — 로그인 계정(users) 보유 직원의 셀프서비스 (#568 C안)
//   employeeSelf 포털(scope 토큰)과 별개로, 메인앱 users 토큰으로 "내 휴가"를 처리.
//   employee_id 는 employees.user_id = 로그인 user.id 로 해석 → 본인 것만. requirePagePermission 게이트 없음(authMiddleware만).
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import {
  getLeaveBalanceForEmployee, listLeaveRequestsForEmployee, getActiveLeaveTypes,
  createLeaveRequestForEmployee, cancelPendingLeaveRequest, LeaveRequestError,
} from './leaveShared'

const mySelfRouter = new Hono<HonoEnv>()
mySelfRouter.use('/*', authMiddleware)

/** 로그인 사용자에 연결된 직원(employees.user_id) 조회. 없으면 null. */
async function resolveMyEmployee(c: any): Promise<{ id: number; name: string; entity_id: number } | null> {
  const user = c.get('user')
  if (!user?.id) return null
  const row = await c.env.DB.prepare(
    `SELECT id, name, entity_id FROM employees WHERE user_id = ? AND is_deleted = 0 LIMIT 1`
  ).bind(user.id).first()
  return (row as { id: number; name: string; entity_id: number } | null) || null
}

const NO_LINK = '로그인 계정에 연결된 직원 정보가 없습니다. 관리자에게 직원-계정 연결을 요청하세요.'

// GET /api/my/leaves — 내 연차 현황 + 신청 이력 + 유형 목록
mySelfRouter.get('/leaves', async (c) => {
  try {
    const emp = await resolveMyEmployee(c)
    if (!emp) return c.json({ success: false, error: NO_LINK, linked: false }, 404)
    const [balance, requests, types] = await Promise.all([
      getLeaveBalanceForEmployee(c.env.DB, emp.id),
      listLeaveRequestsForEmployee(c.env.DB, emp.id),
      getActiveLeaveTypes(c.env.DB),
    ])
    return c.json({ success: true, data: { employee: { id: emp.id, name: emp.name }, balance, requests, leave_types: types } })
  } catch (error: any) {
    console.error('mySelf [GET /leaves]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/my/leaves — 내 휴가 신청 (employee_id = 내 연결 직원)
mySelfRouter.post('/leaves', async (c) => {
  try {
    const emp = await resolveMyEmployee(c)
    if (!emp) return c.json({ success: false, error: NO_LINK, linked: false }, 404)
    const user = c.get('user')
    const body = await c.req.json<{ leave_type: string; start_date: string; end_date: string; reason?: string }>()
    const res = await createLeaveRequestForEmployee(c.env.DB, {
      employeeId: emp.id, leaveType: body.leave_type, startDate: body.start_date, endDate: body.end_date,
      reason: body.reason, createdBy: user?.id || null, entityId: emp.entity_id || 1,
    })
    return c.json({ success: true, data: res })
  } catch (error: any) {
    if (error instanceof LeaveRequestError) {
      return c.json({ success: false, error: error.message }, error.code === 'DUPLICATE' ? 409 : 400)
    }
    console.error('mySelf [POST /leaves]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// DELETE /api/my/leaves/:id — 내 대기(PENDING) 신청 취소
mySelfRouter.delete('/leaves/:id', async (c) => {
  try {
    const emp = await resolveMyEmployee(c)
    if (!emp) return c.json({ success: false, error: NO_LINK, linked: false }, 404)
    const ok = await cancelPendingLeaveRequest(c.env.DB, Number(c.req.param('id')), emp.id)
    if (!ok) return c.json({ success: false, error: '취소할 수 없는 신청입니다(대기 상태·본인 신청만 취소 가능).' }, 400)
    return c.json({ success: true })
  } catch (error: any) {
    console.error('mySelf [DELETE /leaves/:id]:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default mySelfRouter
