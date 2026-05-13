// ============================================================================
// CAPS (근태 시스템) 연동 라우트
// - Method A: ODBC DB 릴레이 방식
// - Cloudflare Worker는 외부 MySQL/PostgreSQL 직접 접근이 어려우므로,
//   사내망에 on-prem 워커(Node.js 또는 C# 에이전트)를 두고
//   이 워커가 릴레이 DB → D1(REST API)로 밀어 넣는 구조.
// - 이 라우트는 다음을 담당한다:
//   1. 설정 관리 (GET/PUT /api/caps/settings)
//   2. 사원 매핑 CRUD (GET/POST/DELETE /api/caps/employee-map)
//   3. 동기화 수신 엔드포인트 (POST /api/caps/ingest) — 워커가 호출
//   4. 동기화 이력 조회 (GET /api/caps/sync-log)
//   5. 수동 동기화 트리거 (POST /api/caps/sync/trigger) — 워커에 푸시
// ============================================================================

import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import type { HonoEnv } from '../types/env'

const capsRouter = new Hono<HonoEnv>()

// ---------- 인증 분기 ----------
// /ingest 는 워커가 X-Agent-Key로 호출 → 별도 검증
// 나머지는 사용자 JWT

// ============================================================================
// POST /api/caps/ingest
// 사내 on-prem 워커가 릴레이 DB에서 읽어온 nOutput 레코드를 푸시
// Body: { from_date, to_date, records: [{ fpid, e_idno, e_name, c_dept, d_date, in_time, out_time, leave_time, return_time, late_time, ealry_time, over_time, night_time, total_time }] }
// ============================================================================
capsRouter.post('/ingest', async (c) => {
  try {
    // 워커 인증: settings.caps_worker_api_key 와 X-Agent-Key 비교
    const providedKey = c.req.header('X-Agent-Key') || ''
    const { results: keyRows } = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'caps_worker_api_key'`
    ).all()
    const storedKey = ((keyRows[0] as Record<string, unknown>)?.setting_value || '') as string
    // 타이밍 공격 방지: 해시 비교
    const enc = new TextEncoder()
    const [a, b] = await Promise.all([
      crypto.subtle.digest('SHA-256', enc.encode(providedKey)),
      crypto.subtle.digest('SHA-256', enc.encode(storedKey))
    ])
    const match = new Uint8Array(a).every((v, i) => v === new Uint8Array(b)[i])
    if (!storedKey || !match) {
      return c.json({ success: false, error: 'Invalid agent key' }, 401)
    }

    const body = await c.req.json() as any // dynamic ingest payload — fields vary per record
    const records: any[] = Array.isArray(body.records) ? body.records : []
    const fromDate = body.from_date || null
    const toDate = body.to_date || null
    const triggerType = body.trigger_type || 'SCHEDULED'

    // sync log 시작
    const logResult = await c.env.DB.prepare(
      `INSERT INTO caps_sync_log (status, fetched_count, from_date, to_date, trigger_type)
       VALUES ('RUNNING', ?, ?, ?, ?)`
    ).bind(records.length, fromDate, toDate, triggerType).run()
    const logId = logResult.meta.last_row_id as number

    let inserted = 0, updated = 0, skipped = 0, errors = 0
    const errorSamples: string[] = []
    // 미매핑 e_idno 샘플 (최대 20건, 중복 제거) — Phase 9: 설정 UI 배너용
    const unmappedSamples: Array<{ fpid: string; e_idno: string; e_name: string; c_dept: string }> = []
    const unmappedSeen = new Set<string>()

    // 사원 매핑 캐시 — employees.caps_id 기반
    const empMap: Record<string, number> = {}

    // 고정급(FIXED) 직원은 출퇴근 기록 대상에서 제외
    const { results: capsIdRows } = await c.env.DB.prepare(
      `SELECT id, caps_id FROM employees WHERE caps_id IS NOT NULL AND caps_id != '' AND (pay_type IS NULL OR pay_type != 'FIXED')`
    ).all()
    for (const row of capsIdRows as Array<{ id: number; caps_id: string }>) {
      empMap[String(row.caps_id)] = row.id
    }

    // 퇴사자 등 무시할 fpid 목록 (settings에서 JSON 배열로 관리)
    const ignoredFpidsSet = new Set<string>()
    const ignoredSetting = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'caps_ignored_fpids'`
    ).first<{ setting_value: string | null }>()
    if (ignoredSetting?.setting_value) {
      try {
        const arr = JSON.parse(ignoredSetting.setting_value)
        if (Array.isArray(arr)) arr.forEach((v: any) => ignoredFpidsSet.add(String(v)))
      } catch (_) { /* invalid JSON, ignore */ }
    }

    let ignoredCount = 0

    for (const rec of records) {
      try {
        // fpid(=CAPS tuser.id)를 매핑키로 사용
        // ACServer는 4자리 zero-padded ID (0001, 0027 등)이지만
        // DB에서 fpid는 숫자(1, 27 등)로 넘어오므로 양쪽 다 시도
        const fpidRaw = rec.fpid != null ? String(rec.fpid) : ''
        const fpidPadded = fpidRaw ? fpidRaw.padStart(4, '0') : ''
        const eIdno = String(rec.e_idno || '').trim()
        const matchKey = fpidRaw || eIdno
        if (!matchKey) { skipped++; continue }

        // 퇴사자 등 무시 대상 → 조용히 스킵
        if (ignoredFpidsSet.has(fpidRaw) || ignoredFpidsSet.has(fpidPadded)) { ignoredCount++; skipped++; continue }

        const employeeId = empMap[fpidPadded] || empMap[fpidRaw] || (eIdno ? empMap[eIdno] : undefined)
        if (!employeeId) {
          skipped++
          const sampleKey = fpidPadded || fpidRaw || eIdno
          if (unmappedSamples.length < 20 && !unmappedSeen.has(sampleKey)) {
            unmappedSeen.add(sampleKey)
            unmappedSamples.push({
              fpid: fpidPadded || fpidRaw,
              e_idno: eIdno,
              e_name: String(rec.e_name || '').trim(),
              c_dept: String(rec.c_dept || '').trim(),
            })
          }
          continue
        }

        // d_date: YYYYMMDD → YYYY-MM-DD
        const dd = String(rec.d_date || '').replace(/-/g, '')
        if (dd.length !== 8) { skipped++; continue }
        const workDate = `${dd.slice(0, 4)}-${dd.slice(4, 6)}-${dd.slice(6, 8)}`

        // 시간 파싱 (HHMMSS 또는 HHMM → HH:MM:SS)
        const parseTime = (t: any): string | null => {
          if (!t) return null
          const s = String(t).replace(/[^0-9]/g, '')
          if (s.length === 6) return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`
          if (s.length === 4) return `${s.slice(0, 2)}:${s.slice(2, 4)}:00`
          return null
        }
        const inTime = parseTime(rec.in_time)
        const outTime = parseTime(rec.out_time)

        // 분 단위 파싱 (HHMM → minutes)
        const parseMin = (t: any): number => {
          if (!t) return 0
          const s = String(t).replace(/[^0-9]/g, '')
          if (s.length >= 3) {
            const h = parseInt(s.slice(0, s.length - 2)) || 0
            const m = parseInt(s.slice(s.length - 2)) || 0
            return h * 60 + m
          }
          return parseInt(s) || 0
        }
        const lateMin = parseMin(rec.late_time)
        const earlyMin = parseMin(rec.ealry_time)
        const overMin = parseMin(rec.over_time)
        const nightMin = parseMin(rec.night_time)
        const totalMin = parseMin(rec.total_time)

        // ========== 근태 규정 기반 계산 ==========
        // 근무시간: 08:30~18:00, 점심 12:00~13:00 (1h), 실근무 8.5h
        // 조기출근: 07:30 이전 출근 시, (08:30 - 출근시간)을 30분 단위 절사
        // 연장근무: 18:00 이후 퇴근 시, (퇴근시간 - 18:00)을 30분 단위 절사
        // 지각: 08:31부터
        const WORK_START = 8 * 60 + 30   // 08:30 = 510분
        const WORK_END = 18 * 60         // 18:00 = 1080분
        const EARLY_CUTOFF = 7 * 60 + 30 // 07:30 = 450분 (조기출근 기준)
        const LUNCH_DURATION = 60        // 점심 1시간

        const timeToMin = (t: string | null): number => {
          if (!t) return -1
          const parts = t.split(':')
          return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
        }

        let inMin = timeToMin(inTime)
        let outMin = timeToMin(outTime)
        // 퇴근 기록 없으면 18:00 처리 (출근은 있는 경우)
        let checkOutDefaulted = false
        if (inMin >= 0 && outMin < 0) {
          outMin = WORK_END  // 18:00
          checkOutDefaulted = true
        }

        // 근무시간 계산 (출퇴근 기반)
        let workHours = 0
        let overtimeHours = 0
        let earlyHours = 0
        let earlyLeaveHours = 0
        let holidayWorkHours = 0
        let lateMinutes = 0  // 지각 분 (08:31부터)
        if (inMin >= 0 && outMin > inMin) {
          // 총 체류시간
          let totalWork = (outMin - inMin) / 60
          // 점심시간(12:00~13:00) 실제 겹치는 만큼만 차감
          const LUNCH_START = 12 * 60
          const LUNCH_END = 13 * 60
          if (inMin < LUNCH_END && outMin > LUNCH_START) {
            const overlapStart = Math.max(inMin, LUNCH_START)
            const overlapEnd = Math.min(outMin, LUNCH_END)
            totalWork -= (overlapEnd - overlapStart) / 60
          }
          // 30분 단위 내림 (floor)
          workHours = Math.max(0, Math.floor(totalWork * 2) / 2)

          // 지각: 08:31 이후 출근 → 분 단위 기록 (타입이 아닌 별도 표시)
          if (inMin > WORK_START) {
            lateMinutes = inMin - WORK_START
          }

          // 조기출근: 07:30 이전 출근 → (08:30 - 출근시간) 30분 단위 절사(floor)
          if (inMin < EARLY_CUTOFF) {
            const earlyMinutes = WORK_START - inMin
            earlyHours = Math.floor(earlyMinutes / 30) * 0.5
          }

          // 연장근무: 18:00 이후 퇴근 → (퇴근시간 - 18:00) 30분 단위 절사(floor)
          if (outMin > WORK_END) {
            const overMinutes = outMin - WORK_END
            overtimeHours = Math.floor(overMinutes / 30) * 0.5
          }

          // 조퇴: 18:00 이전 퇴근 → (18:00 - 퇴근시간) 30분 단위 올림(ceil)
          // 퇴근 기본값(18:00) 적용된 경우는 조퇴 아님
          if (outMin < WORK_END && !checkOutDefaulted) {
            const leaveMinutes = WORK_END - outMin
            earlyLeaveHours = Math.ceil(leaveMinutes / 30) * 0.5
          }
        }

        // attendance_type 판정: NORMAL / ABSENT / HOLIDAY만 자동 분류
        // 지각(late_minutes > 0)과 조퇴(early_leave_hours > 0)는 뱃지로 표시
        let attType = 'NORMAL'
        if (inMin < 0 && outMin < 0) {
          attType = 'ABSENT'                           // 출퇴근 모두 없음
        } else if (inMin < 0) {
          attType = 'ABSENT'                           // 출근 기록 없음
        }

        // 토요일/일요일 판정
        const dayOfWeek = new Date(workDate).getDay() // 0=일, 6=토
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          attType = 'HOLIDAY'
          holidayWorkHours = workHours // 휴일근무 시간 (1.5배 수당 계산용)
          overtimeHours = 0            // 휴일은 연장근무 별도 → holiday_work_hours로
          earlyHours = 0               // 휴일은 조기출근 없음
          earlyLeaveHours = 0          // 휴일은 조퇴 없음
          lateMinutes = 0              // 휴일은 지각 없음
        }

        // 기존 레코드 조회 — 수동 수정된(CAPS_EDITED / MANUAL) 것은 덮어쓰지 않음
        const existing = await c.env.DB.prepare(
          `SELECT id, source FROM attendance WHERE employee_id = ? AND work_date = ?`
        ).bind(employeeId, workDate).first<any>()

        const checkInFull = inTime ? `${workDate}T${inTime}` : null
        const checkOutFull = checkOutDefaulted
          ? `${workDate}T18:00:00`   // 퇴근 기록 없으면 18:00 기본값
          : (outTime ? `${workDate}T${outTime}` : null)
        const rawJson = JSON.stringify(rec)

        if (existing) {
          if (existing.source === 'CAPS_EDITED' || existing.source === 'MANUAL') {
            skipped++
            continue
          }
          // CAPS 레코드 업데이트
          await c.env.DB.prepare(`
            UPDATE attendance SET
              check_in_time = ?, check_out_time = ?,
              work_hours = ?, overtime_hours = ?, early_hours = ?,
              early_leave_hours = ?, holiday_work_hours = ?,
              late_minutes = ?,
              attendance_type = ?, status = 'PRESENT',
              source = 'CAPS',
              caps_fpid = ?, caps_e_idno = ?,
              caps_late_min = ?, caps_early_min = ?,
              caps_over_min = ?, caps_night_min = ?, caps_total_min = ?,
              caps_raw_json = ?, caps_synced_at = datetime('now'),
              updated_at = datetime('now')
            WHERE id = ?
          `).bind(
            checkInFull, checkOutFull, workHours, overtimeHours, earlyHours,
            earlyLeaveHours, holidayWorkHours, lateMinutes,
            attType,
            rec.fpid || null, eIdno,
            lateMin, earlyMin, overMin, nightMin, totalMin,
            rawJson, existing.id
          ).run()
          updated++
        } else {
          await c.env.DB.prepare(`
            INSERT INTO attendance (
              employee_id, work_date, check_in_time, check_out_time,
              work_hours, overtime_hours, early_hours, early_leave_hours, holiday_work_hours,
              late_minutes,
              attendance_type, status,
              source, caps_fpid, caps_e_idno,
              caps_late_min, caps_early_min, caps_over_min, caps_night_min, caps_total_min,
              caps_raw_json, caps_synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PRESENT', 'CAPS', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).bind(
            employeeId, workDate, checkInFull, checkOutFull,
            workHours, overtimeHours, earlyHours, earlyLeaveHours, holidayWorkHours,
            lateMinutes, attType,
            rec.fpid || null, eIdno,
            lateMin, earlyMin, overMin, nightMin, totalMin,
            rawJson
          ).run()
          inserted++
        }

        // employees.caps_last_synced_at 갱신
        await c.env.DB.prepare(
          `UPDATE employees SET caps_last_synced_at = datetime('now') WHERE id = ?`
        ).bind(employeeId).run()
      } catch (innerErr: any) {
        console.error('CAPS record processing error:', innerErr)
        errors++
        if (errorSamples.length < 3) errorSamples.push('기록 처리 오류')
      }
    }

    const finalStatus = errors > 0 ? 'PARTIAL' : 'SUCCESS'
    await c.env.DB.prepare(`
      UPDATE caps_sync_log
      SET finished_at = datetime('now'),
          status = ?,
          inserted_count = ?,
          updated_count = ?,
          skipped_count = ?,
          error_count = ?,
          error_message = ?
      WHERE id = ?
    `).bind(
      finalStatus, inserted, updated, skipped, errors,
      errorSamples.length > 0 ? errorSamples.join(' | ') : null,
      logId
    ).run()

    // settings.caps_sync_last_ok_at 갱신
    if (finalStatus === 'SUCCESS') {
      await c.env.DB.prepare(
        `UPDATE settings SET setting_value = datetime('now') WHERE setting_key = 'caps_sync_last_ok_at'`
      ).run()
    }

    // settings.caps_last_unmapped 갱신 (이번 sync에서 매핑 실패한 e_idno 샘플)
    // Phase 9 자동 감지 배너용. 빈 배열이라도 덮어써서 오래된 데이터 제거.
    await c.env.DB.prepare(
      `INSERT INTO settings (setting_key, setting_value) VALUES ('caps_last_unmapped', ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
    ).bind(JSON.stringify(unmappedSamples)).run()

    return c.json({
      success: true,
      data: {
        log_id: logId,
        fetched: records.length,
        inserted, updated, skipped, errors,
        ignored: ignoredCount,
        status: finalStatus,
        unmappedSamples,
      },
    })
  } catch (error: any) {
    console.error('CAPS ingest failed:', error)
    return c.json({ success: false, error: 'CAPS 동기화 실패', detail: '서버 오류가 발생했습니다' }, 500)
  }
})

// ============================================================================
// GET /api/caps/sync/pending — 워커가 폴링하는 엔드포인트 (Agent Key 인증)
// /ingest와 마찬가지로 JWT 미들웨어 전에 배치
// ============================================================================
capsRouter.get('/sync/pending', async (c) => {
  const providedKey = c.req.header('X-Agent-Key') || ''
  const { results: keyRows } = await c.env.DB.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'caps_worker_api_key'`
  ).all()
  const storedKey = (keyRows[0] as Record<string, unknown>)?.setting_value || ''
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(providedKey as string)),
    crypto.subtle.digest('SHA-256', enc.encode(storedKey as string))
  ])
  const match = new Uint8Array(a).every((v, i) => v === new Uint8Array(b)[i])
  if (!storedKey || !match) {
    return c.json({ success: false, error: 'Invalid agent key' }, 401)
  }

  const row = await c.env.DB.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'caps_sync_requested_at'`
  ).first<{ setting_value: string | null }>()
  const requestedAt = row?.setting_value || null

  if (!requestedAt) {
    return c.json({ success: true, pending: false })
  }

  // 플래그 클리어
  await c.env.DB.prepare(
    `UPDATE settings SET setting_value = '' WHERE setting_key = 'caps_sync_requested_at'`
  ).run()

  return c.json({ success: true, pending: true, requested_at: requestedAt })
})

// ============================================================================
// 이하 사용자 JWT 필요
// ============================================================================
capsRouter.use('/settings', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/employee-map', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/employee-map/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/sync-log', authMiddleware)
capsRouter.use('/sync/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// GET /api/caps/settings — 릴레이 DB 설정 조회
capsRouter.get('/settings', async (c) => {
  const keys = [
    'caps_relay_db_host', 'caps_relay_db_port', 'caps_relay_db_engine',
    'caps_relay_db_name', 'caps_relay_db_user', 'caps_relay_table',
    'caps_sync_enabled', 'caps_sync_interval_min', 'caps_sync_lookback_days',
    'caps_sync_last_ok_at', 'caps_worker_endpoint', 'caps_worker_api_key',
    'caps_last_unmapped', 'caps_ignored_fpids',
  ]
  const placeholders = keys.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(
    `SELECT setting_key, setting_value FROM settings WHERE setting_key IN (${placeholders})`
  ).bind(...keys).all()
  const data: Record<string, string> = {}
  for (const row of results as Array<{ setting_key: string; setting_value: string }>) data[row.setting_key] = row.setting_value
  return c.json({ success: true, data })
})

// PUT /api/caps/settings — 설정 업데이트
capsRouter.put('/settings', async (c) => {
  const body = await c.req.json<Record<string, string>>()
  const ALLOWED = [
    'caps_relay_db_host', 'caps_relay_db_port', 'caps_relay_db_engine',
    'caps_relay_db_name', 'caps_relay_db_user', 'caps_relay_db_password',
    'caps_relay_table', 'caps_sync_enabled', 'caps_sync_interval_min',
    'caps_sync_lookback_days', 'caps_worker_endpoint', 'caps_worker_api_key',
    'caps_ignored_fpids',
  ]
  for (const key of ALLOWED) {
    if (key in body) {
      await c.env.DB.prepare(
        `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
      ).bind(key, String(body[key] ?? '')).run()
    }
  }
  return c.json({ success: true })
})

// GET /api/caps/employee-map — 매핑 목록
capsRouter.get('/employee-map', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT m.*, e.employee_code, e.name AS employee_name, e.department
    FROM caps_employee_map m
    LEFT JOIN employees e ON m.employee_id = e.id
    ORDER BY m.caps_e_idno
  `).all()
  return c.json({ success: true, data: results })
})

// POST /api/caps/employee-map — 매핑 추가
capsRouter.post('/employee-map', async (c) => {
  const body = await c.req.json<{ caps_e_idno?: string; caps_e_name?: string; caps_c_dept?: string; employee_id?: number; notes?: string }>()
  const { caps_e_idno, caps_e_name, caps_c_dept, employee_id, notes } = body
  if (!caps_e_idno || !employee_id) {
    return c.json({ success: false, error: 'caps_e_idno와 employee_id는 필수' }, 400)
  }
  const user = c.get('user')
  const result = await c.env.DB.prepare(`
    INSERT INTO caps_employee_map (caps_e_idno, caps_e_name, caps_c_dept, employee_id, mapped_by, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(caps_e_idno) DO UPDATE SET
      caps_e_name = excluded.caps_e_name,
      caps_c_dept = excluded.caps_c_dept,
      employee_id = excluded.employee_id,
      notes = excluded.notes,
      is_active = 1
  `).bind(caps_e_idno, caps_e_name || null, caps_c_dept || null, employee_id, user?.id || null, notes || null).run()
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// DELETE /api/caps/employee-map/:id — 매핑 비활성화
capsRouter.delete('/employee-map/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare(
    `UPDATE caps_employee_map SET is_active = 0 WHERE id = ?`
  ).bind(id).run()
  return c.json({ success: true })
})

// POST /api/caps/ignore-fpids — 퇴사자 등 무시할 fpid 일괄 추가
capsRouter.post('/ignore-fpids', async (c) => {
  const body = await c.req.json<{ fpids?: string[] }>()
  const { fpids } = body
  if (!Array.isArray(fpids) || fpids.length === 0) {
    return c.json({ success: false, error: 'fpids 배열 필요' }, 400)
  }
  // 기존 목록 로드
  const existing = await c.env.DB.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'caps_ignored_fpids'`
  ).first<{ setting_value: string | null }>()
  let currentList: string[] = []
  if (existing?.setting_value) {
    try { currentList = JSON.parse(existing.setting_value) } catch (_) {}
  }
  // 중복 제거 후 병합
  const merged = [...new Set([...currentList, ...fpids.map((v: any) => String(v))])]
  await c.env.DB.prepare(
    `INSERT INTO settings (setting_key, setting_value) VALUES ('caps_ignored_fpids', ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
  ).bind(JSON.stringify(merged)).run()
  return c.json({ success: true, data: { ignored_fpids: merged, added: merged.length - currentList.length } })
})

// DELETE /api/caps/ignore-fpids — 무시 목록에서 fpid 제거
capsRouter.delete('/ignore-fpids', async (c) => {
  const body2 = await c.req.json<{ fpids?: string[] }>()
  const { fpids: fpidsToRemove } = body2
  if (!Array.isArray(fpidsToRemove) || fpidsToRemove.length === 0) {
    return c.json({ success: false, error: 'fpids 배열 필요' }, 400)
  }
  const removeSet = new Set(fpidsToRemove.map((v) => String(v)))
  const existing = await c.env.DB.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'caps_ignored_fpids'`
  ).first<{ setting_value: string | null }>()
  let currentList: string[] = []
  if (existing?.setting_value) {
    try { currentList = JSON.parse(existing.setting_value) } catch (_) {}
  }
  const filtered = currentList.filter(v => !removeSet.has(v))
  await c.env.DB.prepare(
    `INSERT INTO settings (setting_key, setting_value) VALUES ('caps_ignored_fpids', ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
  ).bind(JSON.stringify(filtered)).run()
  return c.json({ success: true, data: { ignored_fpids: filtered, removed: currentList.length - filtered.length } })
})

// GET /api/caps/sync-log — 동기화 이력
capsRouter.get('/sync-log', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200)
  const { results } = await c.env.DB.prepare(`
    SELECT l.*, u.username AS triggered_by_name
    FROM caps_sync_log l
    LEFT JOIN users u ON l.triggered_by = u.id
    ORDER BY l.started_at DESC
    LIMIT ?
  `).bind(limit).all()
  return c.json({ success: true, data: results })
})

// POST /api/caps/sync/trigger — 수동 동기화 요청 (플래그 설정 → 워커가 폴링)
// 클라우드 → 사내망 직접 호출 불가하므로, 플래그만 설정하고
// 워커가 /api/caps/sync/pending 을 폴링해서 감지하는 방식.
capsRouter.post('/sync/trigger', async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare(
    `INSERT INTO settings (setting_key, setting_value) VALUES ('caps_sync_requested_at', datetime('now'))
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = datetime('now')`
  ).run()
  return c.json({ success: true, message: '동기화 요청이 등록되었습니다. 워커가 곧 실행합니다.' })
})

export default capsRouter
