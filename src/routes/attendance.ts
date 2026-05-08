// ============================================================================
// 근태 관리 라우터
// ----------------------------------------------------------------------------
// - 테이블: attendance (단수형)
// - /month   : 월간 스프레드시트 편집용 — 직원×일자 매트릭스
// - /        : 일반 목록 조회
// - /bulk    : 일괄 UPSERT — 스프레드시트 편집 저장
// - /:id     : 단건 삭제
//
// CAPS 연동 (Phase 7, 2026-04-09):
//   attendance.source 컬럼으로 'CAPS' / 'CAPS_EDITED' / 'MANUAL' 추적.
//   PATCH /bulk에서 CAPS → CAPS_EDITED 자동 전환 (Provenance 보존).
//   마이그레이션 0113 미적용 환경 대비해 PRAGMA 방어 로직 포함.
// ============================================================================
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { requirePagePermission } from '../middleware/permissions'

const attendanceRouter = new Hono<HonoEnv>()
attendanceRouter.use('/*', authMiddleware, requirePagePermission('/attendance'))

// ----------------------------------------------------------------------------
// 공통 헬퍼: attendance 테이블에 CAPS 컬럼(source)이 존재하는지 확인
// ----------------------------------------------------------------------------
// 컬럼 존재 여부 캐시 (세션 내 1회만 PRAGMA, 테이블별)
const _colCaches: Record<string, Record<string, boolean>> = {}
const ALLOWED_TABLES = new Set(['attendance', 'employees'])
async function getAttendanceColumns(db: D1Database, table: string = 'attendance'): Promise<Record<string, boolean>> {
  if (!ALLOWED_TABLES.has(table)) throw new Error(`Invalid table: ${table}`)
  if (_colCaches[table]) return _colCaches[table]
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all()
  const cols: Record<string, boolean> = {}
  for (const r of results as any[]) cols[r.name] = true
  _colCaches[table] = cols
  return cols
}
async function hasAttendanceSourceColumn(db: D1Database): Promise<boolean> {
  const cols = await getAttendanceColumns(db)
  return !!cols['source']
}
async function hasLateMinutesColumn(db: D1Database): Promise<boolean> {
  const cols = await getAttendanceColumns(db)
  return !!cols['late_minutes']
}

// ============================================================================
// GET /api/attendance/month?month=YYYY-MM&department=...
// 월간 근태 조회 (스프레드시트용 — 직원 × 해당 월 전체 일자)
// 반환:
//   { employees: [...], records: [...], has_caps, last_sync }
//   - records는 CAPS 컬럼 존재 시 source, caps_*_min, caps_synced_at 포함
//   - last_sync는 caps_sync_log 최신 1건 (없으면 null)
// ============================================================================
attendanceRouter.get('/month', async (c) => {
  try {
    const month = c.req.query('month') || new Date().toISOString().slice(0, 7)
    const department = c.req.query('department') || ''
    const status = c.req.query('status') || 'ACTIVE'

    // pay_type 컬럼 존재 여부 확인 (마이그레이션 미적용 환경 대응)
    const empCols = await getAttendanceColumns(c.env.DB, 'employees')
    const hasPayType = !!empCols['pay_type']

    // 재직중 직원 목록 (부서 필터) — 고정급(FIXED) 제외
    let empQuery = `
      SELECT id, employee_code, name, department, position, base_salary, hire_date, resignation_date${hasPayType ? ', pay_type' : ''}
      FROM employees
      WHERE status = ?
    `
    const empParams: any[] = [status]
    if (hasPayType) { empQuery += ` AND (pay_type IS NULL OR pay_type != 'FIXED')` }
    if (department) { empQuery += ` AND department = ?`; empParams.push(department) }
    empQuery += ` ORDER BY department, employee_code`
    const { results: employees } = await c.env.DB.prepare(empQuery).bind(...empParams).all()

    const hasCapsCols = await hasAttendanceSourceColumn(c.env.DB)
    const hasLateMin = await hasLateMinutesColumn(c.env.DB)
    const capsSelect = hasCapsCols
      ? `, source, caps_late_min, caps_early_min, caps_over_min, caps_night_min, caps_total_min, caps_synced_at`
      : ''
    const lateSelect = hasLateMin ? `, late_minutes` : ''

    // 해당 월의 근태 기록
    const { results: records } = await c.env.DB.prepare(`
      SELECT
        id, employee_id, work_date,
        check_in_time, check_out_time,
        work_hours, overtime_hours, early_hours, early_leave_hours, holiday_work_hours
        ${lateSelect},
        attendance_type, status, notes
        ${capsSelect}
      FROM attendance
      WHERE strftime('%Y-%m', work_date) = ?
      ORDER BY work_date, employee_id
    `).bind(month).all()

    // 최근 CAPS 동기화 정보
    let lastSync: any = null
    if (hasCapsCols) {
      try {
        const { results: syncLogs } = await c.env.DB.prepare(`
          SELECT started_at, finished_at, success_count, fail_count, status
          FROM caps_sync_log
          ORDER BY id DESC LIMIT 1
        `).all()
        lastSync = syncLogs && syncLogs[0] ? syncLogs[0] : null
      } catch (_) { /* 테이블 없으면 무시 */ }
    }

    return c.json({
      success: true,
      data: {
        month,
        employees: employees || [],
        records: records || [],
        has_caps: hasCapsCols,
        last_sync: lastSync
      }
    })
  } catch (err: any) {
    console.error('Failed to get monthly attendance:', err)
    return c.json({ success: false, error: '월간 근태 조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// GET /api/attendance
// 일반 목록 조회 (기존 /api/hr/attendances 대체 가능)
// ============================================================================
attendanceRouter.get('/', async (c) => {
  try {
    const { employee_id, start_date, end_date, limit = '100' } = c.req.query()
    const safeLimit = Math.min(parseInt(limit) || 100, 500)

    let query = `
      SELECT
        a.id, a.employee_id, a.work_date,
        a.check_in_time, a.check_out_time,
        a.work_hours, a.overtime_hours,
        a.attendance_type, a.status, a.notes,
        e.employee_code, e.name as employee_name, e.department
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE 1=1
    `
    const params: any[] = []
    if (employee_id) { query += ` AND a.employee_id = ?`; params.push(employee_id) }
    if (start_date) { query += ` AND a.work_date >= ?`; params.push(start_date) }
    if (end_date) { query += ` AND a.work_date <= ?`; params.push(end_date) }
    query += ` ORDER BY a.work_date DESC, e.employee_code LIMIT ?`
    params.push(safeLimit)

    const { results } = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: { items: results || [] } })
  } catch (err: any) {
    console.error('Failed to list attendance:', err)
    return c.json({ success: false, error: '근태 조회 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// PATCH /api/attendance/bulk
// 일괄 UPSERT — 스프레드시트 편집 저장
//
// body: {
//   items: [
//     { employee_id, work_date, attendance_type?, status?,
//       check_in?, check_out?, work_hours?, overtime_hours?, notes? },
//     ...
//   ]
// }
//
// 규칙:
//   - (employee_id, work_date) 복합키 UPSERT
//   - check_in/check_out: "HH:MM" 또는 ISO DATETIME, work_date와 결합해 저장
//   - check_in+check_out만 주어지면 work_hours/overtime_hours 자동 계산
//   - attendance_type=ABSENT 이면 시간류 전부 0
//   - CAPS 컬럼 존재 시: 기존 source='CAPS' → 'CAPS_EDITED' 자동 전환
// ============================================================================
attendanceRouter.patch('/bulk', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const body = await c.req.json<any>()
    const items: any[] = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) {
      return c.json({ success: false, error: 'items 배열이 비어있습니다.' }, 400)
    }

    const hasSourceCol = await hasAttendanceSourceColumn(c.env.DB)
    const hasLateMin = await hasLateMinutesColumn(c.env.DB)

    let upserted = 0
    const errors: any[] = []

    for (const it of items) {
      try {
        const employee_id = Number(it.employee_id)
        const work_date = String(it.work_date || '')
        if (!employee_id || !work_date) {
          errors.push({ item: it, error: 'employee_id/work_date 누락' })
          continue
        }

        const attendance_type = String(it.attendance_type || 'NORMAL')
        const status = String(it.status || 'PRESENT')
        const notes = it.notes != null ? String(it.notes) : null

        // 시간 파싱
        let check_in_time: string | null = null
        let check_out_time: string | null = null
        if (it.check_in) {
          const t = String(it.check_in)
          check_in_time = t.includes('T') ? t : `${work_date}T${t.length === 5 ? t + ':00' : t}`
        }
        if (it.check_out) {
          const t = String(it.check_out)
          check_out_time = t.includes('T') ? t : `${work_date}T${t.length === 5 ? t + ':00' : t}`
        }

        // work_hours / overtime_hours / early_hours 계산 또는 입력값 사용
        let work_hours = it.work_hours != null ? Number(it.work_hours) : 0
        let overtime_hours = it.overtime_hours != null ? Number(it.overtime_hours) : 0
        let early_hours = it.early_hours != null ? Number(it.early_hours) : 0
        let early_leave_hours = it.early_leave_hours != null ? Number(it.early_leave_hours) : 0
        let holiday_work_hours = it.holiday_work_hours != null ? Number(it.holiday_work_hours) : 0
        let late_minutes = it.late_minutes != null ? Number(it.late_minutes) : 0
        if (check_in_time && check_out_time && it.work_hours == null) {
          const inMs = new Date(check_in_time).getTime()
          const outMs = new Date(check_out_time).getTime()
          if (!isNaN(inMs) && !isNaN(outMs) && outMs > inMs) {
            work_hours = Math.round(((outMs - inMs) / 3600000) * 100) / 100
            if (it.overtime_hours == null) {
              overtime_hours = Math.max(0, Math.round((work_hours - 8) * 100) / 100)
            }
          }
        }

        // 결근이면 시간 모두 0
        if (attendance_type === 'ABSENT' || status === 'ABSENT') {
          work_hours = 0
          overtime_hours = 0
        }

        // 동적 SQL 구성 — late_minutes / source 컬럼 유무에 따라
        const baseCols = ['employee_id', 'work_date', 'check_in_time', 'check_out_time',
          'work_hours', 'overtime_hours', 'early_hours', 'early_leave_hours', 'holiday_work_hours']
        const baseParams: any[] = [employee_id, work_date, check_in_time, check_out_time,
          work_hours, overtime_hours, early_hours, early_leave_hours, holiday_work_hours]

        if (hasLateMin) { baseCols.push('late_minutes'); baseParams.push(late_minutes) }
        baseCols.push('attendance_type', 'status', 'notes')
        baseParams.push(attendance_type, status, notes)

        const updateSets = baseCols.filter(c => c !== 'employee_id' && c !== 'work_date')
          .map(c => `${c} = excluded.${c}`).join(', ')

        if (hasSourceCol) {
          baseCols.push('source')
          baseParams.push('MANUAL')
          const placeholders = baseCols.map(() => '?').join(', ')
          const sourceCase = `source = CASE
            WHEN attendance.source = 'CAPS' THEN 'CAPS_EDITED'
            WHEN attendance.source = 'CAPS_EDITED' THEN 'CAPS_EDITED'
            ELSE 'MANUAL' END`
          await c.env.DB.prepare(`
            INSERT INTO attendance (${baseCols.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT(employee_id, work_date) DO UPDATE SET
              ${updateSets}, ${sourceCase}, updated_at = datetime('now')
          `).bind(...baseParams).run()
        } else {
          const placeholders = baseCols.map(() => '?').join(', ')
          await c.env.DB.prepare(`
            INSERT INTO attendance (${baseCols.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT(employee_id, work_date) DO UPDATE SET
              ${updateSets}, updated_at = datetime('now')
          `).bind(...baseParams).run()
        }

        upserted++
      } catch (e: any) {
        console.error('Item processing error:', e)
        errors.push({ item: it, error: '항목 처리 실패' })
      }
    }

    return c.json({
      success: true,
      data: {
        upserted,
        errors_count: errors.length,
        errors: errors.slice(0, 10)  // 처음 10개만 반환
      }
    })
  } catch (err: any) {
    console.error('Failed to bulk upsert attendance:', err)
    return c.json({ success: false, error: '일괄 저장 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// DELETE /api/attendance/:id
// ============================================================================
attendanceRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const id = Number(c.req.param('id'))
    await c.env.DB.prepare(`DELETE FROM attendance WHERE id = ?`).bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    console.error('Failed to delete attendance:', err)
    return c.json({ success: false, error: '삭제 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

export default attendanceRouter
