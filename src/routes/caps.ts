// ============================================================================
// CAPS (근태 시스템) 연동 라우트 — 멀티사이트 지원
// - caps_sites 테이블에서 사이트별 설정 관리
// - 워커가 site_id를 전달하여 사이트 구분
// ============================================================================

import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import type { HonoEnv } from '../types/env'
import { LEAVE_ATTENDANCE_TYPES } from '../utils/leaveAttendance'
import { entityFilter } from '../utils/entityFilter'
import { kstYmd } from '../utils/kstDate'

const capsRouter = new Hono<HonoEnv>()

// 워커가 한 번에 백필할 수 있는 최대 일수. Access 조회량·D1 batch·Worker CPU 한도를 함께 보호한다.
// 워커(caps-worker/src/config.js maxBackfillDays)와 같은 값을 유지할 것.
export const CAPS_MAX_BACKFILL_DAYS = 60

/** 'YYYYMMDD' 정규화 — 8자리가 아니면 null */
function normYmd(v: any): string | null {
  const s = String(v ?? '').replace(/[^0-9]/g, '')
  return s.length === 8 ? s : null
}

/** 'YYYYMMDD' 두 날짜의 일수 차 (to - from) */
function ymdSpanDays(from: string, to: string): number {
  const toMs = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
  return Math.round((toMs(to) - toMs(from)) / 86400000)
}

// 큐06: CAPS 동기화가 보존해야 할 휴가/특수 근태유형 — 출퇴근 시각은 갱신하되 유형/상태는 덮어쓰지 않음.
const CAPS_PRESERVE_TYPES = [...LEAVE_ATTENDANCE_TYPES, 'SICK', 'FAMILY_EVENT', 'HOLIDAY']
const CAPS_PRESERVE_SQL = CAPS_PRESERVE_TYPES.map((t) => `'${t}'`).join(',')
const CAPS_PRESERVE_STATUS_SQL = ['VACATION', 'SICK', 'FAMILY_EVENT', 'HOLIDAY'].map((t) => `'${t}'`).join(',')

// ---------- 워커 인증 헬퍼 ----------
async function verifyAgentKey(db: any, providedKey: string, siteId?: string): Promise<{ valid: boolean; site?: any }> {
  if (!providedKey) return { valid: false }

  // site_id가 주어지면 해당 사이트의 키로 검증
  if (siteId) {
    const site = await db.prepare(
      `SELECT id, name, relay_db_host, relay_db_port, relay_db_engine, relay_db_name, relay_db_user, relay_db_password, relay_table, sync_enabled, sync_interval_min, sync_lookback_days, worker_endpoint, worker_api_key, ignored_fpids, last_sync_ok_at, last_unmapped, is_active, created_at FROM caps_sites WHERE id = ? AND is_active = 1`
    ).bind(siteId).first()
    if (!site || !site.worker_api_key) return { valid: false }

    const enc = new TextEncoder()
    const [a, b] = await Promise.all([
      crypto.subtle.digest('SHA-256', enc.encode(providedKey)),
      crypto.subtle.digest('SHA-256', enc.encode(site.worker_api_key as string))
    ])
    const match = new Uint8Array(a).every((v, i) => v === new Uint8Array(b)[i])
    return { valid: match, site }
  }

  // site_id 없으면 모든 활성 사이트의 키를 순회 (하위호환)
  const { results: sites } = await db.prepare(
    `SELECT id, name, worker_api_key FROM caps_sites WHERE is_active = 1 AND worker_api_key != ''`
  ).all()
  const enc = new TextEncoder()
  const providedHash = await crypto.subtle.digest('SHA-256', enc.encode(providedKey))
  for (const site of (sites || [])) {
    const storedHash = await crypto.subtle.digest('SHA-256', enc.encode(site.worker_api_key as string))
    const match = new Uint8Array(providedHash).every((v, i) => v === new Uint8Array(storedHash)[i])
    if (match) return { valid: true, site }
  }
  return { valid: false }
}

// ============================================================================
// POST /api/caps/ingest — 워커가 근태 데이터 푸시
// Body: { site_id, from_date, to_date, records: [...] }
// ============================================================================
capsRouter.post('/ingest', async (c) => {
  try {
    const providedKey = c.req.header('X-Agent-Key') || ''
    const body = await c.req.json() as any
    const siteId = body.site_id || null
    const records: any[] = Array.isArray(body.records) ? body.records : []
    const fromDate = body.from_date || null
    const toDate = body.to_date || null
    const triggerType = body.trigger_type || 'SCHEDULED'
    // 워커 버전 — 기간 지정/자동 갭 복구 지원 여부를 UI에서 확인하기 위해 sync_log.notes에 남긴다.
    const workerVersion = String(body.worker_version || '').trim().slice(0, 40) || null

    // 인증
    const auth = await verifyAgentKey(c.env.DB, providedKey, siteId)
    if (!auth.valid || !auth.site) {
      return c.json({ success: false, error: 'Invalid agent key or site_id' }, 401)
    }
    const site = auth.site
    const resolvedSiteId = site.id as string

    // sync log 시작
    const logResult = await c.env.DB.prepare(
      `INSERT INTO caps_sync_log (status, fetched_count, from_date, to_date, trigger_type, site_id, notes)
       VALUES ('RUNNING', ?, ?, ?, ?, ?, ?)`
    ).bind(records.length, fromDate, toDate, triggerType, resolvedSiteId, workerVersion).run()
    const logId = logResult.meta.last_row_id as number

    let inserted = 0, updated = 0, skipped = 0, errors = 0
    const errorSamples: string[] = []
    const unmappedSamples: Array<{ fpid: string; e_idno: string; e_name: string; c_dept: string }> = []
    const unmappedSeen = new Set<string>()

    // 사원 매핑 캐시 — 해당 사이트 직원만 (entity_id 포함)
    const empMap: Record<string, number> = {}
    const empEntityMap: Record<number, number> = {}
    const { results: capsIdRows } = await c.env.DB.prepare(
      `SELECT id, caps_id, entity_id FROM employees WHERE caps_site_id = ? AND caps_id IS NOT NULL AND caps_id != '' AND is_deleted = 0 AND (pay_type IS NULL OR pay_type != 'FIXED')`
    ).bind(resolvedSiteId).all()
    for (const row of capsIdRows as Array<{ id: number; caps_id: string; entity_id: number | null }>) {
      empMap[String(row.caps_id)] = row.id
      empEntityMap[row.id] = row.entity_id || 1
    }

    // 무시할 fpid 목록 — 사이트별
    const ignoredFpidsSet = new Set<string>()
    const ignoredJson = site.ignored_fpids as string
    if (ignoredJson) {
      try {
        const arr = JSON.parse(ignoredJson)
        if (Array.isArray(arr)) arr.forEach((v: any) => ignoredFpidsSet.add(String(v)))
      } catch (_) {}
    }

    let ignoredCount = 0

    // 공휴일(법정공휴일) 집합 — 토·일 외에 이 날짜도 휴일근로로 분류
    const holidaySet = new Set<string>()
    try {
      const { results: hdays } = await c.env.DB.prepare(`SELECT holiday_date FROM holidays`).all<{ holiday_date: string }>()
      for (const h of (hdays || [])) holidaySet.add(String(h.holiday_date))
    } catch (_) { /* holidays 테이블 미적용 환경 — 토/일만 휴일 처리 */ }

    // ========== 헬퍼 함수 (루프 밖) ==========
    const parseTime = (t: any): string | null => {
      if (!t) return null
      const s = String(t).replace(/[^0-9]/g, '')
      if (s.length === 6) return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`
      if (s.length === 4) return `${s.slice(0, 2)}:${s.slice(2, 4)}:00`
      return null
    }
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
    const WORK_START = 8 * 60 + 30
    const WORK_END = 18 * 60
    const EARLY_CUTOFF = 7 * 60 + 30
    const timeToMin = (t: string | null): number => {
      if (!t) return -1
      const parts = t.split(':')
      return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0)
    }

    // ========== Phase 1: 매칭 + 날짜 파싱 (CPU only) ==========
    interface ParsedRecord {
      employeeId: number
      workDate: string
      rec: any
      fpidRaw: string
      eIdno: string
    }
    const parsed: ParsedRecord[] = []

    for (const rec of records) {
      const fpidRaw = rec.fpid != null ? String(rec.fpid) : ''
      const fpidPadded = fpidRaw ? fpidRaw.padStart(4, '0') : ''
      const eIdno = String(rec.e_idno || '').trim()
      const matchKey = fpidRaw || eIdno
      if (!matchKey) { skipped++; continue }

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

      const dd = String(rec.d_date || '').replace(/-/g, '')
      if (dd.length !== 8) { skipped++; continue }
      const workDate = `${dd.slice(0, 4)}-${dd.slice(4, 6)}-${dd.slice(6, 8)}`

      parsed.push({ employeeId, workDate, rec, fpidRaw, eIdno })
    }

    // ========== Phase 2: 기존 attendance 일괄 조회 (N+1 제거) ==========
    // employee_id + work_date 조합으로 기존 레코드 맵 구축
    const existingMap = new Map<string, { id: number; source: string }>()
    if (parsed.length > 0) {
      // 고유 employee_id 목록 추출하여 해당 기간 attendance 일괄 조회
      const uniqueEmpIds = [...new Set(parsed.map(p => p.employeeId))]
      const workDates = [...new Set(parsed.map(p => p.workDate))]
      // 청크 단위로 조회 (D1 바인드 ~100개 한도 대응).
      // ⚠️ 직원만 청킹하면 바인드 수 = 직원청크 + 날짜전량 → 장기간 백필(기간 지정 동기화)에서 한도 초과.
      //    양쪽 모두 청킹해 최대 EMP_CHUNK + DATE_CHUNK(=80)로 고정한다.
      const EMP_CHUNK = 40
      const DATE_CHUNK = 40
      for (let i = 0; i < uniqueEmpIds.length; i += EMP_CHUNK) {
        const empChunk = uniqueEmpIds.slice(i, i + EMP_CHUNK)
        const empPh = empChunk.map(() => '?').join(',')
        for (let j = 0; j < workDates.length; j += DATE_CHUNK) {
          const dateChunk = workDates.slice(j, j + DATE_CHUNK)
          const datePh = dateChunk.map(() => '?').join(',')
          const { results: existingRows } = await c.env.DB.prepare(
            `SELECT id, employee_id, work_date, source FROM attendance WHERE employee_id IN (${empPh}) AND work_date IN (${datePh})`
          ).bind(...empChunk, ...dateChunk).all<{ id: number; employee_id: number; work_date: string; source: string }>()
          for (const row of existingRows) {
            existingMap.set(`${row.employee_id}:${row.work_date}`, { id: row.id, source: row.source })
          }
        }
      }
    }

    // ========== Phase 3: 계산 + 배치 문 구축 (CPU + stmt build) ==========
    const batchStmts: D1PreparedStatement[] = []
    const touchedEmployeeIds = new Set<number>()

    for (const { employeeId, workDate, rec, fpidRaw, eIdno } of parsed) {
      try {
        const inTime = parseTime(rec.in_time)
        const outTime = parseTime(rec.out_time)
        const lateMin = parseMin(rec.late_time)
        const earlyMin = parseMin(rec.ealry_time)
        const overMin = parseMin(rec.over_time)
        const nightMin = parseMin(rec.night_time)
        const totalMin = parseMin(rec.total_time)

        let inMinVal = timeToMin(inTime)
        let outMinVal = timeToMin(outTime)
        let checkOutDefaulted = false
        if (inMinVal >= 0 && outMinVal < 0) {
          outMinVal = WORK_END
          checkOutDefaulted = true
        }

        let workHours = 0, overtimeHours = 0, earlyHours = 0, earlyLeaveHours = 0, holidayWorkHours = 0, lateMinutes = 0
        if (inMinVal >= 0 && outMinVal > inMinVal) {
          let totalWork = (outMinVal - inMinVal) / 60
          const LUNCH_START = 12 * 60
          const LUNCH_END = 13 * 60
          if (inMinVal < LUNCH_END && outMinVal > LUNCH_START) {
            const overlapStart = Math.max(inMinVal, LUNCH_START)
            const overlapEnd = Math.min(outMinVal, LUNCH_END)
            totalWork -= (overlapEnd - overlapStart) / 60
          }
          workHours = Math.max(0, Math.floor(totalWork * 2) / 2)

          if (inMinVal > WORK_START) lateMinutes = inMinVal - WORK_START
          if (inMinVal < EARLY_CUTOFF) {
            const earlyMinutes = WORK_START - inMinVal
            earlyHours = Math.floor(earlyMinutes / 30) * 0.5
          }
          if (outMinVal > WORK_END) {
            const overMinutes = outMinVal - WORK_END
            overtimeHours = Math.floor(overMinutes / 30) * 0.5
          }
          if (outMinVal < WORK_END && !checkOutDefaulted) {
            const leaveMinutes = WORK_END - outMinVal
            earlyLeaveHours = Math.ceil(leaveMinutes / 30) * 0.5
          }
        }

        let attType = 'NORMAL'
        if (inMinVal < 0 && outMinVal < 0) attType = 'ABSENT'
        else if (inMinVal < 0) attType = 'ABSENT'

        const dayOfWeek = new Date(workDate).getDay()
        if (dayOfWeek === 0 || dayOfWeek === 6 || holidaySet.has(workDate)) {
          attType = 'HOLIDAY'
          holidayWorkHours = workHours
          overtimeHours = 0
          earlyHours = 0
          earlyLeaveHours = 0
          lateMinutes = 0
        }

        const existing = existingMap.get(`${employeeId}:${workDate}`)

        const checkInFull = inTime ? `${workDate}T${inTime}` : null
        const checkOutFull = checkOutDefaulted
          ? `${workDate}T18:00:00`
          : (outTime ? `${workDate}T${outTime}` : null)
        const rawJson = JSON.stringify(rec)

        if (existing) {
          if (existing.source === 'CAPS_EDITED' || existing.source === 'MANUAL') {
            skipped++
            continue
          }
          batchStmts.push(
            c.env.DB.prepare(`
              UPDATE attendance SET
                check_in_time = ?, check_out_time = ?,
                work_hours = ?, overtime_hours = ?, early_hours = ?,
                early_leave_hours = CASE WHEN attendance_type IN (${CAPS_PRESERVE_SQL}) THEN 0 ELSE ? END, holiday_work_hours = ?,
                late_minutes = CASE WHEN attendance_type IN (${CAPS_PRESERVE_SQL}) THEN 0 ELSE ? END,
                attendance_type = CASE WHEN attendance_type IN (${CAPS_PRESERVE_SQL}) THEN attendance_type ELSE ? END,
                status = CASE WHEN attendance_type IN (${CAPS_PRESERVE_STATUS_SQL}) THEN status ELSE 'PRESENT' END,
                source = 'CAPS', caps_site_id = ?,
                caps_fpid = ?, caps_e_idno = ?,
                caps_late_min = ?, caps_early_min = ?,
                caps_over_min = ?, caps_night_min = ?, caps_total_min = ?,
                caps_raw_json = ?, caps_synced_at = datetime('now'),
                updated_at = datetime('now')
              WHERE id = ?
            `).bind(
              checkInFull, checkOutFull, workHours, overtimeHours, earlyHours,
              earlyLeaveHours, holidayWorkHours, lateMinutes,
              attType, resolvedSiteId,
              rec.fpid || null, eIdno,
              lateMin, earlyMin, overMin, nightMin, totalMin,
              rawJson, existing.id
            )
          )
          updated++
        } else {
          batchStmts.push(
            c.env.DB.prepare(`
              INSERT INTO attendance (
                employee_id, work_date, check_in_time, check_out_time,
                work_hours, overtime_hours, early_hours, early_leave_hours, holiday_work_hours,
                late_minutes,
                attendance_type, status,
                source, caps_site_id, caps_fpid, caps_e_idno,
                caps_late_min, caps_early_min, caps_over_min, caps_night_min, caps_total_min,
                caps_raw_json, caps_synced_at, entity_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PRESENT', 'CAPS', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
            `).bind(
              employeeId, workDate, checkInFull, checkOutFull,
              workHours, overtimeHours, earlyHours, earlyLeaveHours, holidayWorkHours,
              lateMinutes, attType, resolvedSiteId,
              rec.fpid || null, eIdno,
              lateMin, earlyMin, overMin, nightMin, totalMin,
              rawJson, empEntityMap[employeeId] || 1
            )
          )
          inserted++
        }

        touchedEmployeeIds.add(employeeId)
      } catch (innerErr: any) {
        console.error('CAPS record processing error:', innerErr)
        errors++
        if (errorSamples.length < 3) errorSamples.push('기록 처리 오류')
      }
    }

    // ========== Phase 4: D1 batch 실행 (100개 단위 청크) ==========
    // employees caps_last_synced_at 일괄 업데이트도 배치에 포함
    for (const empId of touchedEmployeeIds) {
      batchStmts.push(
        c.env.DB.prepare(
          `UPDATE employees SET caps_last_synced_at = datetime('now') WHERE id = ?`
        ).bind(empId)
      )
    }

    for (let i = 0; i < batchStmts.length; i += 100) {
      const chunk = batchStmts.slice(i, i + 100)
      if (chunk.length > 0) await c.env.DB.batch(chunk)
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

    if (finalStatus === 'SUCCESS') {
      await c.env.DB.prepare(
        `UPDATE caps_sites SET last_sync_ok_at = datetime('now') WHERE id = ?`
      ).bind(resolvedSiteId).run()
    }

    // 미매핑 샘플을 사이트에 저장
    await c.env.DB.prepare(
      `UPDATE caps_sites SET last_unmapped = ? WHERE id = ?`
    ).bind(JSON.stringify(unmappedSamples), resolvedSiteId).run()

    return c.json({
      success: true,
      data: {
        log_id: logId,
        site_id: resolvedSiteId,
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
// GET /api/caps/sync/pending — 워커 폴링 (Agent Key 인증)
// 워커가 site_id를 query로 전달: /api/caps/sync/pending?site_id=DJ
// ============================================================================
capsRouter.get('/sync/pending', async (c) => {
  try {
    const providedKey = c.req.header('X-Agent-Key') || ''
    const siteId = c.req.query('site_id') || null

    const auth = await verifyAgentKey(c.env.DB, providedKey, siteId || undefined)
    if (!auth.valid) {
      return c.json({ success: false, error: 'Invalid agent key' }, 401)
    }

    const resolvedSiteId = auth.site?.id || 'DJ'
    const row = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = ?`
    ).bind(`caps_sync_requested_${resolvedSiteId}`).first<{ setting_value: string | null }>()
    const raw = row?.setting_value || null

    if (!raw) {
      return c.json({ success: true, pending: false })
    }

    // 값 포맷: JSON `{"at":..,"from":"YYYYMMDD","to":"YYYYMMDD"}` (기간 지정) 또는 구버전 datetime 문자열.
    let requestedAt = raw
    let fromDate: string | null = null
    let toDate: string | null = null
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw)
        requestedAt = parsed.at || raw
        fromDate = normYmd(parsed.from)
        toDate = normYmd(parsed.to)
      } catch (_) { /* 파싱 실패 시 기간 없는 일반 요청으로 처리 */ }
    }

    await c.env.DB.prepare(
      `UPDATE settings SET setting_value = '' WHERE setting_key = ?`
    ).bind(`caps_sync_requested_${resolvedSiteId}`).run()

    return c.json({
      success: true,
      pending: true,
      requested_at: requestedAt,
      site_id: resolvedSiteId,
      // 구버전 워커는 아래 두 필드를 무시하고 기본 lookback으로 동기화한다(하위호환).
      from_date: fromDate,
      to_date: toDate,
    })
  } catch (err) {
    console.error('CAPS sync/pending error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ============================================================================
// GET /api/caps/sync/state — 워커가 동기화 시작 전에 조회 (Agent Key 인증)
// 자동 갭 복구용: 마지막으로 성공한 동기화의 to_date를 알려주면 워커가 그 날짜부터 다시 긁는다.
// (PC가 며칠 꺼져 있어도 켜기만 하면 공백이 자동으로 메워진다)
// ============================================================================
capsRouter.get('/sync/state', async (c) => {
  try {
    const providedKey = c.req.header('X-Agent-Key') || ''
    const siteId = c.req.query('site_id') || null

    const auth = await verifyAgentKey(c.env.DB, providedKey, siteId || undefined)
    if (!auth.valid) {
      return c.json({ success: false, error: 'Invalid agent key' }, 401)
    }
    const resolvedSiteId = auth.site?.id || 'DJ'

    // 실제로 데이터가 적재된 마지막 날짜 = 성공/부분성공 동기화의 to_date 최대값.
    // to_date는 'YYYYMMDD' 문자열이라 MAX()의 사전순 비교가 날짜순과 일치한다.
    const row = await c.env.DB.prepare(
      `SELECT MAX(to_date) AS last_to_date FROM caps_sync_log
       WHERE site_id = ? AND status IN ('SUCCESS','PARTIAL') AND to_date IS NOT NULL AND to_date != ''`
    ).bind(resolvedSiteId).first<{ last_to_date: string | null }>()

    return c.json({
      success: true,
      site_id: resolvedSiteId,
      last_ok_to_date: normYmd(row?.last_to_date),
      last_sync_ok_at: auth.site?.last_sync_ok_at || null,
      max_backfill_days: CAPS_MAX_BACKFILL_DAYS,
    })
  } catch (err) {
    console.error('CAPS sync/state error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ============================================================================
// 이하 사용자 JWT 필요
// ============================================================================
capsRouter.use('/sites', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/sites/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/settings', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/employee-map', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/employee-map/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/sync-log', authMiddleware)
capsRouter.use('/sync/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))
capsRouter.use('/ignore-fpids', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ============================================================================
// 사이트 CRUD
// ============================================================================

// GET /api/caps/sites — 사이트 목록
capsRouter.get('/sites', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, relay_db_host, relay_db_port, relay_db_engine, relay_db_name,
              relay_db_user, relay_table, sync_enabled, sync_interval_min, sync_lookback_days,
              worker_endpoint, ignored_fpids, last_sync_ok_at, last_unmapped, is_active, created_at
       FROM caps_sites WHERE is_active = 1 ORDER BY created_at, id`
    ).all()
    return c.json({ success: true, data: results || [] })
  } catch (err) {
    console.error('CAPS sites list error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/caps/sites — 사이트 추가
capsRouter.post('/sites', async (c) => {
  try {
    const body = await c.req.json<{ id: string; name: string }>()
    const { id, name } = body
    if (!id || !name) return c.json({ success: false, error: 'id와 name은 필수입니다' }, 400)
    if (!/^[A-Z]{2,5}$/.test(id)) return c.json({ success: false, error: 'id는 2~5자 영문 대문자 (예: CJ, SJ)' }, 400)

    // API 키 자동 생성
    const keyBytes = new Uint8Array(32)
    crypto.getRandomValues(keyBytes)
    const apiKey = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('')

    await c.env.DB.prepare(
      `INSERT INTO caps_sites (id, name, worker_api_key) VALUES (?, ?, ?)`
    ).bind(id, name, apiKey).run()

    return c.json({ success: true, data: { id, name, worker_api_key: apiKey } })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE') || e.message?.includes('PRIMARY')) {
      return c.json({ success: false, error: '이미 존재하는 사이트 코드입니다' }, 409)
    }
    console.error('CAPS site create error:', e)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// PUT /api/caps/sites/:id — 사이트 설정 수정
capsRouter.put('/sites/:id', async (c) => {
  try {
    const siteId = c.req.param('id')
    const body = await c.req.json() as Record<string, any>
    const ALLOWED = [
      'name', 'relay_db_host', 'relay_db_port', 'relay_db_engine',
      'relay_db_name', 'relay_db_user', 'relay_db_password',
      'relay_table', 'sync_enabled', 'sync_interval_min',
      'sync_lookback_days', 'worker_endpoint', 'worker_api_key',
      'ignored_fpids',
    ]
    const sets: string[] = []
    const params: any[] = []
    for (const key of ALLOWED) {
      if (key in body) {
        // 비밀번호/키: 빈 값이면 기존 유지
        if ((key === 'relay_db_password' || key === 'worker_api_key') && !body[key]) continue
        sets.push(`${key} = ?`)
        params.push(body[key])
      }
    }
    if (sets.length === 0) return c.json({ success: true })
    params.push(siteId)
    await c.env.DB.prepare(
      `UPDATE caps_sites SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...params).run()
    return c.json({ success: true })
  } catch (err) {
    console.error('CAPS site update error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /api/caps/sites/:id — 사이트 비활성화
capsRouter.delete('/sites/:id', async (c) => {
  try {
    const siteId = c.req.param('id')
    await c.env.DB.prepare(
      `UPDATE caps_sites SET is_active = 0 WHERE id = ?`
    ).bind(siteId).run()
    return c.json({ success: true })
  } catch (err) {
    console.error('CAPS site delete error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/caps/sites/:id/regenerate-key — API 키 재생성
capsRouter.post('/sites/:id/regenerate-key', async (c) => {
  try {
    const siteId = c.req.param('id')
    const keyBytes = new Uint8Array(32)
    crypto.getRandomValues(keyBytes)
    const apiKey = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    await c.env.DB.prepare(
      `UPDATE caps_sites SET worker_api_key = ? WHERE id = ?`
    ).bind(apiKey, siteId).run()
    return c.json({ success: true, data: { worker_api_key: apiKey } })
  } catch (err) {
    console.error('CAPS key regeneration error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ============================================================================
// 사원 매핑 — site_id 지원
// ============================================================================

// GET /api/caps/employee-map?site_id=DJ
capsRouter.get('/employee-map', async (c) => {
  try {
    const siteId = c.req.query('site_id')
    let query = `SELECT m.*, e.employee_code, e.name AS employee_name, e.department
      FROM caps_employee_map m
      LEFT JOIN employees e ON m.employee_id = e.id`
    const bindings: any[] = []
    if (siteId) {
      query += ` WHERE m.site_id = ?`
      bindings.push(siteId)
    }
    query += ` ORDER BY m.site_id, m.caps_e_idno, m.id`
    const { results } = await c.env.DB.prepare(query).bind(...bindings).all()
    return c.json({ success: true, data: results })
  } catch (err) {
    console.error('CAPS employee-map list error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/caps/employee-map
capsRouter.post('/employee-map', async (c) => {
  try {
    const body = await c.req.json<{ site_id?: string; caps_e_idno?: string; caps_e_name?: string; caps_c_dept?: string; employee_id?: number; notes?: string }>()
    const { site_id, caps_e_idno, caps_e_name, caps_c_dept, employee_id, notes } = body
    const siteId = site_id || 'DJ'
    if (!caps_e_idno || !employee_id) {
      return c.json({ success: false, error: 'caps_e_idno와 employee_id는 필수' }, 400)
    }
    const user = c.get('user')

    // employees.caps_id / caps_site_id 도 동기 업데이트
    await c.env.DB.prepare(
      `UPDATE employees SET caps_id = ?, caps_site_id = ?, caps_sync_enabled = 1 WHERE id = ?`
    ).bind(caps_e_idno, siteId, employee_id).run()

    // #90: 이전 사이트 매핑 비활성화 (동일 employee_id의 다른 사이트 항목)
    await c.env.DB.prepare(
      `UPDATE caps_employee_map SET is_active = 0 WHERE employee_id = ? AND site_id != ? AND is_active = 1`
    ).bind(employee_id, siteId).run()

    const result = await c.env.DB.prepare(`
      INSERT INTO caps_employee_map (site_id, caps_e_idno, caps_e_name, caps_c_dept, employee_id, mapped_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(site_id, caps_e_idno) DO UPDATE SET
        caps_e_name = excluded.caps_e_name,
        caps_c_dept = excluded.caps_c_dept,
        employee_id = excluded.employee_id,
        notes = excluded.notes,
        is_active = 1
    `).bind(siteId, caps_e_idno, caps_e_name || null, caps_c_dept || null, employee_id, user?.id || null, notes || null).run()
    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (err) {
    console.error('CAPS employee-map add error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /api/caps/employee-map/:id
capsRouter.delete('/employee-map/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare(
      `UPDATE caps_employee_map SET is_active = 0 WHERE id = ?`
    ).bind(id).run()
    return c.json({ success: true })
  } catch (err) {
    console.error('CAPS employee-map delete error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ============================================================================
// 무시 fpid 관리 — 사이트별
// ============================================================================

// POST /api/caps/ignore-fpids — { site_id, fpids: [...] }
capsRouter.post('/ignore-fpids', async (c) => {
  try {
    const body = await c.req.json<{ site_id?: string; fpids?: string[] }>()
    const siteId = body.site_id || 'DJ'
    const { fpids } = body
    if (!Array.isArray(fpids) || fpids.length === 0) {
      return c.json({ success: false, error: 'fpids 배열 필요' }, 400)
    }
    const site = await c.env.DB.prepare(`SELECT ignored_fpids FROM caps_sites WHERE id = ?`).bind(siteId).first<{ ignored_fpids: string | null }>()
    let currentList: string[] = []
    if (site?.ignored_fpids) {
      try { currentList = JSON.parse(site.ignored_fpids) } catch (_) {}
    }
    const merged = [...new Set([...currentList, ...fpids.map(v => String(v))])]
    await c.env.DB.prepare(
      `UPDATE caps_sites SET ignored_fpids = ? WHERE id = ?`
    ).bind(JSON.stringify(merged), siteId).run()
    return c.json({ success: true, data: { ignored_fpids: merged, added: merged.length - currentList.length } })
  } catch (err) {
    console.error('CAPS ignore-fpids add error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// DELETE /api/caps/ignore-fpids — { site_id, fpids: [...] }
capsRouter.delete('/ignore-fpids', async (c) => {
  try {
    const body = await c.req.json<{ site_id?: string; fpids?: string[] }>()
    const siteId = body.site_id || 'DJ'
    const { fpids: fpidsToRemove } = body
    if (!Array.isArray(fpidsToRemove) || fpidsToRemove.length === 0) {
      return c.json({ success: false, error: 'fpids 배열 필요' }, 400)
    }
    const removeSet = new Set(fpidsToRemove.map(v => String(v)))
    const site = await c.env.DB.prepare(`SELECT ignored_fpids FROM caps_sites WHERE id = ?`).bind(siteId).first<{ ignored_fpids: string | null }>()
    let currentList: string[] = []
    if (site?.ignored_fpids) {
      try { currentList = JSON.parse(site.ignored_fpids) } catch (_) {}
    }
    const filtered = currentList.filter(v => !removeSet.has(v))
    await c.env.DB.prepare(
      `UPDATE caps_sites SET ignored_fpids = ? WHERE id = ?`
    ).bind(JSON.stringify(filtered), siteId).run()
    return c.json({ success: true, data: { ignored_fpids: filtered, removed: currentList.length - filtered.length } })
  } catch (err) {
    console.error('CAPS ignore-fpids remove error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ============================================================================
// 동기화 이력 — site_id 필터 지원
// ============================================================================
capsRouter.get('/sync-log', async (c) => {
  try {
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200)
    const siteId = c.req.query('site_id')
    let query = `SELECT l.*, u.username AS triggered_by_name
      FROM caps_sync_log l
      LEFT JOIN users u ON l.triggered_by = u.id`
    const bindings: any[] = []
    if (siteId) {
      query += ` WHERE l.site_id = ?`
      bindings.push(siteId)
    }
    query += ` ORDER BY l.started_at DESC, l.id DESC LIMIT ?`
    bindings.push(limit)
    const { results } = await c.env.DB.prepare(query).bind(...bindings).all()
    return c.json({ success: true, data: results })
  } catch (err) {
    console.error('CAPS sync-log error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// POST /api/caps/sync/trigger — 수동 동기화 (사이트별)
// body: { site_id?: 'DJ', from_date?: 'YYYYMMDD', to_date?: 'YYYYMMDD' }
// 기간을 주면 워커가 그 범위를 조회한다(장기 결번 백필). 생략 시 워커 기본 lookback + 자동 갭 복구.
capsRouter.post('/sync/trigger', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { site_id?: string; from_date?: string; to_date?: string }
    const siteId = body.site_id || 'DJ'

    const fromDate = normYmd(body.from_date)
    const toDate = normYmd(body.to_date)
    const rawFrom = String(body.from_date ?? '').trim()
    const rawTo = String(body.to_date ?? '').trim()

    // 기간은 둘 다 주거나 둘 다 비워야 한다 (한쪽만 = 의도 불명확)
    if ((rawFrom || rawTo) && (!fromDate || !toDate)) {
      return c.json({ success: false, error: '시작일과 종료일을 모두 YYYY-MM-DD 형식으로 지정해 주세요' }, 400)
    }
    if (fromDate && toDate) {
      if (fromDate > toDate) {
        return c.json({ success: false, error: '시작일이 종료일보다 늦습니다' }, 400)
      }
      const span = ymdSpanDays(fromDate, toDate) + 1
      if (span > CAPS_MAX_BACKFILL_DAYS) {
        return c.json({ success: false, error: `한 번에 조회할 수 있는 기간은 최대 ${CAPS_MAX_BACKFILL_DAYS}일입니다 (요청: ${span}일)` }, 400)
      }
      const todayYmd = kstYmd().replace(/-/g, '')
      if (fromDate > todayYmd) {
        return c.json({ success: false, error: '미래 날짜는 지정할 수 없습니다' }, 400)
      }
    }

    // 값 포맷: JSON — 구버전 워커는 pending 플래그 존재 여부만 보므로 하위호환된다.
    const payload = JSON.stringify({
      at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      from: fromDate,
      to: toDate,
    })

    await c.env.DB.prepare(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
    ).bind(`caps_sync_requested_${siteId}`, payload).run()

    return c.json({
      success: true,
      message: fromDate
        ? `${fromDate} ~ ${toDate} 기간 동기화 요청이 등록되었습니다. 워커가 곧 실행합니다.`
        : '동기화 요청이 등록되었습니다. 워커가 곧 실행합니다.',
      from_date: fromDate,
      to_date: toDate,
    })
  } catch (err) {
    console.error('CAPS sync trigger error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ============================================================================
// 하위호환: GET /api/caps/settings (기존 UI가 호출할 수 있으므로)
// 이제 caps_sites에서 읽어옴
// ============================================================================
capsRouter.get('/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, relay_db_host, relay_db_port, relay_db_engine, relay_db_name, relay_db_user, relay_table, sync_enabled, sync_interval_min, sync_lookback_days, worker_endpoint, ignored_fpids, last_sync_ok_at, last_unmapped, is_active, created_at FROM caps_sites WHERE is_active = 1 ORDER BY created_at, id`
    ).all()
    return c.json({ success: true, data: results || [] })
  } catch (err) {
    console.error('CAPS settings error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

// ============================================================================
// GET /api/caps/health — 근태 CAPS 미매핑·동기화 지연 경보 요약 (B2 위젯용)
//   - 미매핑: caps_sites.last_unmapped(JSON) = 직원에 매칭 안 된 CAPS 펀치(신규입사자 근태 누락 위험)
//   - 지연: last_sync_ok_at 2일↑ / caps_id 있으나 caps_last_synced_at 2일↑ 직원
// ============================================================================
capsRouter.get('/health', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const { results: sites } = await c.env.DB.prepare(
      `SELECT id, name, last_sync_ok_at, last_unmapped FROM caps_sites WHERE is_active = 1`
    ).all<{ id: number; name: string; last_sync_ok_at: string | null; last_unmapped: string | null }>()

    const now = Date.now()
    const STALE_MS = 2 * 86400000
    let unmappedTotal = 0
    const siteHealth = (sites || []).map(s => {
      let unmapped: any[] = []
      try { unmapped = s.last_unmapped ? JSON.parse(s.last_unmapped) : [] } catch { unmapped = [] }
      unmappedTotal += unmapped.length
      const lastSync = s.last_sync_ok_at ? new Date(String(s.last_sync_ok_at).replace(' ', 'T') + 'Z').getTime() : 0
      const stale = !s.last_sync_ok_at || (now - lastSync) > STALE_MS
      return { id: s.id, name: s.name, last_sync_ok_at: s.last_sync_ok_at, stale, unmapped_count: unmapped.length, unmapped_samples: unmapped.slice(0, 10) }
    })

    // caps_id 매핑됐으나 오래 미동기화된 직원 (entity 필터)
    const ef = entityFilter(c, 'e')
    const staleEmp = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM employees e
       WHERE e.is_deleted = 0 AND e.caps_id IS NOT NULL AND e.caps_id != ''
         AND (e.caps_last_synced_at IS NULL OR julianday('now') - julianday(e.caps_last_synced_at) > 2)${ef.clause}`
    ).bind(...ef.params).first<{ cnt: number }>()

    const staleEmpCount = staleEmp?.cnt || 0
    const hasIssue = unmappedTotal > 0 || siteHealth.some(s => s.stale) || staleEmpCount > 0
    return c.json({ success: true, data: { has_issue: hasIssue, unmapped_total: unmappedTotal, stale_employee_count: staleEmpCount, sites: siteHealth } })
  } catch (err) {
    console.error('CAPS health error:', err)
    return c.json({ success: false, error: '서버 오류' }, 500)
  }
})

export default capsRouter
