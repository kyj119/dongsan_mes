// leaveShared.ts — 휴가 셀프서비스 공유 로직 (#568)
//   메인앱(/leaves, ADMIN/MANAGER)·셀프포털(hrSelf, scope 토큰)·메인앱 셀프(mySelf, users 토큰)가
//   같은 생성/조회/취소 규칙을 공유. leaves.ts 의 프리미티브를 단방향 import(순환 없음 — leaves 는 이 파일을 import 안 함).
import { countWorkingDays, calcAnnualEntitlement, calcMonthlyAccrualUpTo } from './leaves'
import { kstYear } from '../utils/kstDate'

export interface LeaveTypeRow { code: string; name: string; deduction_days: number }

/** 활성 휴가 유형 목록 (셀프 폼 드롭다운용 — /leaves 게이트 밖에서 노출). */
export async function getActiveLeaveTypes(db: D1Database) {
  const { results } = await db.prepare(
    `SELECT code, name, category, deduction_days FROM leave_types WHERE is_active = 1 ORDER BY sort_order, id`
  ).all()
  return results || []
}

/** 직원 연차 현황 (leaves.ts GET /balance/:id 와 동일 산정 — SSOT). */
export async function getLeaveBalanceForEmployee(db: D1Database, employeeId: number) {
  const emp = await db.prepare(
    `SELECT id, employee_code, name, department, position, hire_date, status FROM employees WHERE id = ?`
  ).bind(employeeId).first<any>()
  if (!emp) return null
  const { results: history } = await db.prepare(`
    SELECT year, leave_type, accrued, granted_extra, used, carried_over, expired,
      (accrued + granted_extra + carried_over - used - expired) as remaining
    FROM leave_balances
    WHERE employee_id = ?
    ORDER BY year DESC, leave_type
  `).bind(employeeId).all()
  return {
    employee: emp,
    current_year: kstYear(),
    expected_annual: calcAnnualEntitlement(emp.hire_date),
    expected_monthly_grant: calcMonthlyAccrualUpTo(emp.hire_date),
    history,
  }
}

/** 특정 직원의 휴가 신청 이력 (본인 조회용). */
export async function listLeaveRequestsForEmployee(db: D1Database, employeeId: number, limit = 50) {
  const { results } = await db.prepare(`
    SELECT lr.id, lr.leave_type, lr.start_date, lr.end_date, lr.days, lr.reason, lr.status,
           lr.rejection_reason, lr.approved_at, lr.created_at,
           lt.name AS leave_type_name
    FROM leave_requests lr
    LEFT JOIN leave_types lt ON lt.code = lr.leave_type
    WHERE lr.employee_id = ?
    ORDER BY lr.created_at DESC
    LIMIT ?
  `).bind(employeeId, Math.min(200, Math.max(1, limit))).all()
  return results || []
}

export class LeaveRequestError extends Error {
  constructor(message: string, public code: 'VALIDATION' | 'NO_WORKING_DAYS' | 'DUPLICATE' = 'VALIDATION') {
    super(message)
  }
}

/**
 * 본인/대리 공통 휴가 신청 생성. employee_id 는 호출부가 신뢰할 수 있는 출처(토큰 sub / user→employee)로 넘긴다.
 * 일수는 백엔드가 소정근로일 기준 권위적으로 산정(프론트 값 미신뢰). leaves.ts POST /requests 규칙과 동일.
 */
export async function createLeaveRequestForEmployee(
  db: D1Database,
  opts: { employeeId: number; leaveType: string; startDate: string; endDate: string; reason?: string | null; createdBy?: number | null; entityId: number }
): Promise<{ id: number; days: number }> {
  const { employeeId, leaveType, startDate, endDate } = opts
  if (!employeeId || !leaveType || !startDate || !endDate) {
    throw new LeaveRequestError('leave_type, start_date, end_date 필수')
  }
  const lt = await db.prepare(`SELECT deduction_days FROM leave_types WHERE code = ?`).bind(leaveType).first<{ deduction_days: number }>()
  let days: number
  if (lt && lt.deduction_days < 1) {
    days = lt.deduction_days // 반차/반반차: 1일 내 사용(날짜 무관)
  } else {
    const workingDays = await countWorkingDays(db, startDate, endDate)
    days = workingDays * (lt?.deduction_days ?? 1)
    if (days <= 0) throw new LeaveRequestError('선택한 기간에 소정근로일이 없습니다(주말·공휴일만 포함).', 'NO_WORKING_DAYS')
  }
  try {
    const result = await db.prepare(`
      INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, reason, status, created_by, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).bind(employeeId, leaveType, startDate, endDate, days, opts.reason || null, opts.createdBy || null, opts.entityId || 1).run()
    return { id: result.meta.last_row_id as number, days }
  } catch (error: any) {
    if (error?.message && /UNIQUE constraint failed/i.test(error.message)) {
      throw new LeaveRequestError('이미 동일한 휴가 신청이 존재합니다.', 'DUPLICATE')
    }
    throw error
  }
}

/** 본인 PENDING 신청 취소(삭제). 본인·대기 상태만. 반환=삭제 여부. */
export async function cancelPendingLeaveRequest(db: D1Database, requestId: number, employeeId: number): Promise<boolean> {
  const r = await db.prepare(
    `DELETE FROM leave_requests WHERE id = ? AND employee_id = ? AND status = 'PENDING'`
  ).bind(requestId, employeeId).run()
  return (r.meta.changes || 0) > 0
}
