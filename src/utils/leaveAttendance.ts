/**
 * 휴가 승인 → 근태(attendance) 자동 연동 헬퍼. (큐 06)
 *
 * 배경: leaves.ts 승인이 attendance를 갱신하지 않아 반차 승인돼도 근태는 NORMAL →
 *   오전반차자 13시 출근이 "지각"으로 오판정. attendance.ts 시간맵은 attendance_type별
 *   기준출근(HALF_AM=13:00 등)으로 지각을 계산하므로, 승인 시 attendance_type을 심어주면 해소.
 *
 * 설계 결정:
 *  - 반차/반반차(HALF_AM·HALF_PM·QUARTER_1~4): attendance_type=코드 그대로
 *    → 시간맵이 기준출근시간으로 지각/조퇴 정확 계산. status='PRESENT'(근무 절반 존재).
 *  - 종일 휴가(ANNUAL·SICK·FAMILY_EVENT 등): attendance_type='VACATION'으로 통일.
 *    이유 = payroll work_days 집계가 NOT IN ('ABSENT','VACATION','HOLIDAY')로 종일휴가를
 *    근무일에서 제외하는데 'ANNUAL'/'SICK'은 제외목록에 없어 근무일로 오집계됨 → VACATION이 안전.
 *    (실제 휴가 종류는 leave_requests/leave_balances가 보존. 전부 유급이라 결근 처리 아님.) status='VACATION'.
 *  - source='LEAVE': CAPS 동기화 skip 목록(MANUAL/CAPS_EDITED)이 아니므로 CAPS가 출퇴근 시각을
 *    갱신하되, caps.ts의 가드가 휴가 attendance_type/status는 보존(아래 LEAVE_ATTENDANCE_TYPES).
 */

const PARTIAL_LEAVE = ['HALF_AM', 'HALF_PM', 'QUARTER_1', 'QUARTER_2', 'QUARTER_3', 'QUARTER_4']

// 이 연동이 attendance에 기록하는 휴가 근태유형 — CAPS 동기화 보존/롤백 정리 대상의 단일 소스.
export const LEAVE_ATTENDANCE_TYPES = [...PARTIAL_LEAVE, 'VACATION']

export function mapLeaveToAttendance(leaveType: string): { attendanceType: string; status: string; fullDay: boolean } {
  if (PARTIAL_LEAVE.includes(leaveType)) {
    return { attendanceType: leaveType, status: 'PRESENT', fullDay: false }
  }
  return { attendanceType: 'VACATION', status: 'VACATION', fullDay: true }
}

/** start~end(YYYY-MM-DD) 포함 날짜 목록 (안전상한 366일). */
export function enumerateDates(start: string, end: string): string[] {
  if (!start) return []
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date((end || start) + 'T00:00:00Z')
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [start]
  const out: string[] = []
  for (let t = s.getTime(), i = 0; t <= e.getTime() && i < 366; t += 86400000, i++) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/** 승인된 휴가를 attendance에 마킹 (날짜별 UPSERT, 멱등). */
export async function markLeaveAttendance(
  db: D1Database,
  opts: { employeeId: number; leaveType: string; startDate: string; endDate: string; entityId: number }
): Promise<void> {
  const { employeeId, leaveType, startDate, endDate, entityId } = opts
  const { attendanceType, status } = mapLeaveToAttendance(leaveType)
  const dates = enumerateDates(startDate, endDate)
  if (dates.length === 0) return
  const stmts = dates.map((wd) => db.prepare(`
    INSERT INTO attendance (employee_id, work_date, attendance_type, status, source, entity_id, late_minutes, early_leave_hours)
    VALUES (?, ?, ?, ?, 'LEAVE', ?, 0, 0)
    ON CONFLICT(employee_id, work_date) DO UPDATE SET
      attendance_type = excluded.attendance_type,
      status = excluded.status,
      late_minutes = 0,
      early_leave_hours = 0,
      updated_at = datetime('now')
  `).bind(employeeId, wd, attendanceType, status, entityId))
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80))
}

/** 휴가 취소/반려 시 마킹 정리: 휴가로만 예약된(출근기록 없는) 레코드는 삭제, 실 출근기록이 있던 날은 NORMAL 복원. */
export async function clearLeaveAttendance(
  db: D1Database,
  opts: { employeeId: number; startDate: string; endDate: string }
): Promise<void> {
  const { employeeId, startDate } = opts
  if (!startDate) return
  const endDate = opts.endDate || startDate
  const inList = LEAVE_ATTENDANCE_TYPES.map((t) => `'${t}'`).join(',')
  await db.batch([
    db.prepare(
      `DELETE FROM attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ?
        AND source = 'LEAVE' AND check_in_time IS NULL AND attendance_type IN (${inList})`
    ).bind(employeeId, startDate, endDate),
    db.prepare(
      `UPDATE attendance SET attendance_type = 'NORMAL', status = 'PRESENT', updated_at = datetime('now')
        WHERE employee_id = ? AND work_date BETWEEN ? AND ? AND attendance_type IN (${inList})`
    ).bind(employeeId, startDate, endDate),
  ])
}
