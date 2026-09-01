import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, agentKeyMiddleware } from '../middleware/auth'
import { autoDeductInventory } from '../utils/autoDeductInventory'
import { entityFilter, cardEntityFilter } from '../utils/entityFilter'
import { kstDate, kstDateOf } from '../utils/kstDate'

const printEventsRouter = new Hono<HonoEnv>()

// 수신 시각 정규화: tz 표식 없는 값은 KST naive로 간주 → UTC naive('YYYY-MM-DD HH:MM:SS')로 변환(-9h).
// tz 표식(Z, +HH:MM, -HH:MM)이 있으면 신뢰하여 UTC로 변환 후 표식 제거.
// (LogWatcher는 현재 tz 없는 KST 로컬시간을 보내며, 향후 ISO+offset 전환 대비)
function kstNaiveToUtc(ts: string | null | undefined): string | null {
  if (!ts) return null
  const s = String(ts).trim()
  if (!s) return null
  // 이미 tz 표식 있으면 Date로 UTC 정규화 (끝의 Z 또는 ±HH:MM / ±HHMM, 날짜부 이후 구간에서만 판별)
  if (/[zZ]$/.test(s) || /[+\-]\d{2}:?\d{2}$/.test(s.slice(11))) {
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d.toISOString().replace('T', ' ').slice(0, 19)
  }
  // tz 없는 KST naive → +09:00 부여 후 UTC naive로 환산(-9h)
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(iso + '+09:00')
  return isNaN(d.getTime()) ? null : d.toISOString().replace('T', ' ').slice(0, 19)
}

// 인쇄 소요시간(초) 계산 헬퍼
function calcPrintDuration(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(completedAt).getTime()
  if (isNaN(start) || isNaN(end) || end <= start) return null
  return Math.round((end - start) / 1000)
}

// 카드 entity 유도: cards.requesting_entity_id 우선, NULL이면 order로 fallback, 그래도 없으면 1
// (#384: cards 테이블 컬럼은 entity_id가 아니라 requesting_entity_id — entity_id 조회는 throw)
async function deriveCardEntityId(
  db: D1Database, opts: { cardId?: number | null; cardNumber?: string | null }
): Promise<number> {
  const { cardId, cardNumber } = opts
  let row: { entity_id: number | null } | null = null
  if (cardId) {
    row = await db.prepare(
      'SELECT COALESCE(c.requesting_entity_id, o.entity_id) AS entity_id FROM cards c LEFT JOIN orders o ON c.order_id = o.id WHERE c.id = ?'
    ).bind(cardId).first<{ entity_id: number | null }>()
  } else if (cardNumber) {
    row = await db.prepare(
      'SELECT COALESCE(c.requesting_entity_id, o.entity_id) AS entity_id FROM cards c LEFT JOIN orders o ON c.order_id = o.id WHERE c.card_number = ?'
    ).bind(cardNumber).first<{ entity_id: number | null }>()
  }
  return row?.entity_id || 1
}

// 현장 표시용 장비 라벨: 호스트명(agent_id) 대신 장비명 우선 (equipment_id → agent_id 매핑 순, 실패 시 원문)
async function resolveEquipmentLabel(db: D1Database, agentId: string, equipmentId?: string | null): Promise<string> {
  try {
    if (equipmentId) {
      const eq = await db.prepare('SELECT name FROM equipment WHERE id = ?').bind(equipmentId).first<{ name: string }>()
      if (eq?.name) return eq.name
    }
    if (agentId) {
      const eq = await db.prepare('SELECT name FROM equipment WHERE agent_id = ?').bind(agentId).first<{ name: string }>()
      if (eq?.name) return eq.name
    }
  } catch (_e) { /* 라벨 조회 실패 → 호스트명 폴백 */ }
  return agentId
}

// 인쇄 에러/취소 → quality_issues 자동 등록 헬퍼
async function autoCreateQualityIssue(
  db: D1Database, cardId: number, printStatus: string, agentLabel: string,
  filePath: string, copyTotal: number
) {
  const issueType = printStatus === 'ERROR' ? 'DEFECT' : 'REWORK'
  const defectCategory = 'OTHER'
  const description = printStatus === 'ERROR'
    ? `인쇄 에러 자동 감지 (${agentLabel}, 파일: ${filePath})`
    : `인쇄 취소 자동 감지 (${copyTotal}매 중 취소, ${agentLabel})`
  try {
    // #85: reported_by=NULL (시스템 자동 감지), entity_id는 카드에서 가져오되 fallback 안전 처리
    // #384: cards.requesting_entity_id 우선, NULL이면 order entity, 그래도 없으면 1
    const entityId = await deriveCardEntityId(db, { cardId })
    await db.prepare(`
      INSERT INTO quality_issues (card_id, issue_type, defect_category, description, status, reported_by, reported_at, entity_id)
      VALUES (?, ?, ?, ?, 'REPORTED', NULL, CURRENT_TIMESTAMP, ?)
    `).bind(cardId, issueType, defectCategory, description, entityId).run()
  } catch (e) {
    console.warn('[printEvents] autoCreateQualityIssue failed:', e)
  }
}

// ─── Row 타입 정의 ───
interface FileMapRow { card_id: number | null; card_number: string | null; order_number: string | null; order_item_id: number | null; file_name: string | null }
interface CardRow { id: number; status: string; post_processing?: string | null; order_id?: number | null }
interface CountRow { count: number }
interface DoneTilesRow { done_tiles: number }
interface PrintCompletedRow { print_completed: number }
interface EquipmentStatusRow { equipment_status: string | null }
interface AgentHeartbeatRow { computed_status: string; [key: string]: unknown }
interface TodaySummaryRow { ok_count: number; error_count: number; cancel_count: number; total_count: number }

// ─── 카드 매칭 헬퍼 ───
// 파일명에서 order_number + file_seq를 추출하고, print_file_map → fallback regex 순으로 카드 조회
async function resolveCard(db: D1Database, extractedName: string, entityId?: number): Promise<{
  cardId: number | null, cardNumber: string | null, orderNumber: string | null, orderItemId: number | null
}> {
  // entity가 알려진 경우 print_file_map 조회를 해당 entity로 한정 (per-entity unique index 대응)
  const entClause = entityId != null ? ' AND entity_id = ?' : ''
  // 1차: file_map 조회 — 법인 접두 포함 E{n}-YYYYMMDD-NNN-FFF 및 구형식 YYYYMMDD-NNN-FFF 모두 지원
  // (주문번호 법인별 채번 E{eid}- 도입 후 접두어 미대응으로 매칭 전멸하던 버그 수정)
  // 위치 무관(비anchored, 2026-07-31): 정보 우선형 파일명(거래처-규격-…-주문번호-FFF)은 키가 꼬리에 온다.
  //   선두 anchored를 유지하면 신형식 전멸 — RIP가 접미사를 붙여도 키가 살아남는 성질은 그대로.
  //   (?!\d)로 FFF가 더 긴 숫자열의 앞부분을 오려내는 오매칭 차단.
  const seqMatch = extractedName.match(/((?:E\d+-)?\d{8}-\d{3})-(\d{3})(?!\d)/)
  if (seqMatch) {
    const orderNum = seqMatch[1]
    const fileSeq = Number(seqMatch[2])
    const binds: any[] = [orderNum, fileSeq]
    if (entityId != null) binds.push(entityId)
    const map = await db.prepare(
      `SELECT card_id, card_number, order_item_id FROM print_file_map WHERE order_number = ? AND file_seq = ?${entClause}`
    ).bind(...binds).first<FileMapRow>()
    if (map) return { cardId: map.card_id, cardNumber: map.card_number, orderNumber: orderNum, orderItemId: map.order_item_id || null }
  }
  // 2차: 파일명 직접 매칭 (entity 한정 시 교차 매칭 방지)
  // file_map에는 확장자 포함(.eps 등) 저장, LogWatcher 추출명은 확장자 제거본일 수 있어 양쪽 허용
  // ⚠️ D1 은 LIKE 패턴을 50바이트로 제한한다(2026-08-10 실측: 51바이트부터 "pattern too complex").
  //    한글 파일명은 필연적으로 초과해 LIKE 가 던지고, 단건 POST 500 → LogWatcher 무한 재시도 홍수가 났다.
  //    → LIKE 대신 substr 접두 일치("이름" + "." + 확장자)로 동일 의미를 한도 없이 매칭한다.
  //    매칭 실패가 이벤트 적재를 죽이면 안 되므로 예외는 삼키고 3차로 넘어간다.
  const nameNoExt = extractedName.replace(/\.[^.]+$/, '')
  try {
    const charLen = [...nameNoExt].length
    const fnBinds: any[] = [extractedName, nameNoExt, charLen, nameNoExt, charLen]
    if (entityId != null) fnBinds.push(entityId)
    const fnMap = await db.prepare(
      `SELECT card_id, card_number, order_number, order_item_id FROM print_file_map
       WHERE (file_name = ? OR file_name = ?
              OR (substr(file_name, 1, ?) = ? AND substr(file_name, ? + 1, 1) = '.'))${entClause}`
    ).bind(...fnBinds).first<FileMapRow>()
    if (fnMap) return { cardId: fnMap.card_id, cardNumber: fnMap.card_number, orderNumber: fnMap.order_number, orderItemId: fnMap.order_item_id || null }
  } catch (e: any) {
    console.warn('[printEvents] resolveCard 2nd-pass failed (continuing): %s | len=%d head=%s', e?.message || e, nameNoExt.length, nameNoExt.slice(0, 80))
  }
  // 3차: 기존 regex fallback (order_number만) — E{n}- 접두 포함 추출
  const orderMatch = extractedName.match(/((?:E\d+-)?\d{8}-\d{3})/)
  return { cardId: null, cardNumber: null, orderNumber: orderMatch?.[1] || null, orderItemId: null }
}

type ResolvedCard = { cardId: number | null, cardNumber: string | null, orderNumber: string | null, orderItemId: number | null }

/**
 * LogWatcher `--probe` 가 로그 경로를 확정하려고 출력시키는 마커 잡 판별.
 * 파일명이 `MESPROBE-<PC>-<타임스탬프>` 로 시작한다. 실제 생산이 아니므로 적재하지 않는다.
 * (RIP 이 접두/접미를 붙일 수 있어 위치 무관으로 본다 — resolveCard 의 비anchored 매칭과 같은 이유)
 */
function isProbeMarker(fileName?: string | null, filePath?: string | null): boolean {
  const hay = `${fileName || ''} ${filePath || ''}`
  return /MESPROBE-[\w.-]+-\d{8,}/i.test(hay)
}

/** 경로·확장자 제거 — resolveCard 에 넘기는 이름 정규화 (LogWatcher 추출명과 동일 규칙) */
function baseFileName(raw: string): string {
  return String(raw || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim()
}

// ─── 합판(네스트) 멤버 → 매칭 대상 이름 목록 ───
// 판 1개에 서로 다른 주문 N건이 들어가는데(오퍼레이터가 RIP에서 배치) 단일 이름으로만 매칭하면
// N건 중 1건에만 실적이 찍히고 나머지는 영구 미완료로 남는다. Flexi·neoStampa 공통 결함.
// nest_members 가 없으면 기존 단건 동작 그대로.
function nestMatchNames(extractedName: string, nestMembers: unknown): string[] {
  const names: string[] = []
  if (Array.isArray(nestMembers)) {
    for (const m of nestMembers as any[]) {
      const raw = typeof m === 'string' ? m : (m && typeof m.file === 'string' ? m.file : '')
      const base = baseFileName(raw)
      if (base) names.push(base)
    }
  }
  if (names.length === 0 && extractedName) names.push(extractedName)
  return Array.from(new Set(names))
}

// ─── 매칭된 카드 1건에 이벤트 반영 ───
// eventKind='RIP'(리핑 전용 로그 = neoStampa)는 카드를 PRINT_DONE 시키지 않고 불량도 등록하지 않는다.
// 리핑은 실제 출력이 아니며 하류 제어 SW에서 취소될 수 있다. 실측상 재RIP(시행착오)이 36%라
// RIP 중단을 불량으로 올리면 노이즈만 쌓인다. 실적 정본은 PRINT 이벤트다.
async function applyEventToCard(
  db: D1Database, resolved: ResolvedCard, printStatus: string, eventKind: string,
  equipLabel: string, filePath: string, copyTotal: number
): Promise<number | null> {
  if (!resolved.cardId && !resolved.cardNumber) return null
  const card = resolved.cardId
    ? await db.prepare('SELECT id, status FROM cards WHERE id = ?').bind(resolved.cardId).first<CardRow>()
    : await db.prepare('SELECT id, status FROM cards WHERE card_number = ?').bind(resolved.cardNumber).first<CardRow>()
  if (!card) return resolved.cardId

  // 실제 인쇄/리핑 감지 → 대기 카드를 출력중으로 전환.
  // PRINTING 진입 트리거는 이 LogWatcher 경로(및 수동 scan)로만 단일화 (#3).
  if (printStatus === 'OK' && card.status !== 'PRINT_DONE') {
    if (card.status === 'PRINT_PENDING' || card.status === 'RIP_WAITING') {
      await db.prepare(
        "UPDATE cards SET status = 'PRINTING', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(card.id).run()
    }
  }
  if (eventKind !== 'RIP') {
    if (printStatus === 'CANCEL') {
      await db.prepare(
        `UPDATE cards SET rip_status = 'ERROR', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(card.id).run()
    }
    if (printStatus === 'ERROR' || printStatus === 'CANCEL') {
      await autoCreateQualityIssue(db, card.id, printStatus, equipLabel, filePath, copyTotal)
    }
  }
  return card.id
}

// ─── 타일 완료 판단: 같은 파일의 고유 tile_index 기준 ───
async function checkAllTilesComplete(db: D1Database, filePath: string, tileCount: number): Promise<boolean> {
  if (!tileCount || tileCount <= 1) return true // 타일 분할 없으면 즉시 완료
  // 같은 file_path에서 OK인 고유 tile_index 개수 카운트
  const result = await db.prepare(
    "SELECT COUNT(DISTINCT tile_index) as done_tiles FROM print_events WHERE file_path = ? AND print_status = 'OK' AND event_kind = 'PRINT' AND tile_index > 0"
  ).bind(filePath).first<DoneTilesRow>()
  return (result?.done_tiles || 0) >= tileCount
}

// ─── card_item 자동 체크 + 전체 완료 시 PRINT_DONE 전환 ───
async function autoCheckCardItem(db: D1Database, cardId: number, orderItemId: number | null, agentLabel: string): Promise<void> {
  // orderItemId로 card_item 찾기
  if (orderItemId) {
    await db.prepare(
      'UPDATE card_items SET print_completed = 1, print_completed_at = CURRENT_TIMESTAMP WHERE card_id = ? AND order_item_id = ? AND print_completed = 0'
    ).bind(cardId, orderItemId).run()
  }

  // 모든 card_items 완료 여부 확인
  const { results: allItems } = await db.prepare(
    'SELECT print_completed FROM card_items WHERE card_id = ?'
  ).bind(cardId).all<PrintCompletedRow>()

  if (!allItems || allItems.length === 0) return

  const total = allItems.length
  const done = allItems.filter((i) => i.print_completed === 1).length
  const allDone = total > 0 && done === total

  if (allDone) {
    // 카드 상태 확인
    const card = await db.prepare('SELECT status, post_processing, order_id FROM cards WHERE id = ?').bind(cardId).first<CardRow>()
    if (card && card.status !== 'PRINT_DONE') {
      // 후가공 여부 → pp_status
      const hasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
      const ppStatus = hasPP ? 'PENDING' : 'N/A'

      await db.prepare(
        "UPDATE cards SET status = 'PRINT_DONE', rip_status = 'COMPLETED', pp_status = ?, print_done_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(ppStatus, cardId).run()
      // changed_by=NULL: 시스템 자동 전환. 하드코딩 1은 prod에 user id=1 부재 시 FK 위반
      // → 이력 전멸 + throw로 아래 주문 동기화까지 중단되던 버그. 이력 실패가 동기화를 막지 않도록 격리.
      try {
        await db.prepare(
          "INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason) VALUES (?, ?, 'PRINT_DONE', NULL, ?)"
        ).bind(cardId, card.status, `All items printed (${agentLabel})`).run()
      } catch (histErr) { console.warn('[printEvents] status history insert failed:', histErr) }

      // 주문 상태 동기화
      if (card.order_id) {
        try {
          // syncOrderStatus는 cards.ts 내부 함수라 직접 호출 불가 → 동일 로직 적용
          const { results: siblingCards } = await db.prepare(
            "SELECT status FROM cards WHERE order_id = ? AND status != 'CANCELLED'"
          ).bind(card.order_id).all<{ status: string }>()
          const orderCheck = await db.prepare(
            "SELECT status FROM orders WHERE id = ?"
          ).bind(card.order_id).first<{ status: string }>()
          const statuses = (siblingCards || []).map((sc) => sc.status)
          const hasHold = statuses.some((s: string) => s === 'HOLD')
          const nonHold = statuses.filter((s: string) => s !== 'HOLD')
          let newOrderStatus = null
          if (!hasHold && nonHold.length > 0 && nonHold.every((s: string) => s === 'PRINT_DONE')) {
            newOrderStatus = 'PRINT_DONE'
          } else if (nonHold.some((s: string) => s === 'PRINTING')) {
            // CONFIRMED 상태에서 모든 카드가 PRINTING(실제 출력 미시작)이면 전이하지 않음
            if (orderCheck?.status === 'CONFIRMED' && !statuses.some((s: string) => s === 'PRINT_DONE')) {
              newOrderStatus = null
            } else {
              newOrderStatus = 'PRINTING'
            }
          }
          if (newOrderStatus && newOrderStatus !== orderCheck?.status) {
            await db.prepare(
              'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(newOrderStatus, card.order_id).run()
          }
        } catch (syncErr) { console.error(`[printEvents] order sync failed for order_id=${card.order_id}:`, syncErr) }
      }
    }
  }
}

// ─── Agent endpoints (API key auth) ───

// POST /api/print-events/file-map — IA가 파일 생성 시 매핑 등록
printEventsRouter.post('/file-map', agentKeyMiddleware, async (c) => {
  try {
    const { order_number, file_seq, card_id, card_number, file_name, order_item_id } = await c.req.json()

    if (!order_number || !file_seq || !file_name) {
      return c.json({ success: false, error: 'order_number, file_seq, file_name required' }, 400)
    }

    // entity_id: 카드에서 유도 (agent endpoint이므로 user context 없음), fallback 1
    // #384: cards.requesting_entity_id (NULL이면 order entity)
    const mapEntityId = await deriveCardEntityId(c.env.DB, { cardId: card_id, cardNumber: card_number })

    await c.env.DB.prepare(`
      INSERT INTO print_file_map (order_number, file_seq, card_id, card_number, order_item_id, file_name, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_number, file_seq) DO UPDATE SET
        card_id = excluded.card_id,
        card_number = excluded.card_number,
        order_item_id = excluded.order_item_id,
        file_name = excluded.file_name,
        entity_id = excluded.entity_id
    `).bind(order_number, file_seq, card_id || null, card_number || null, order_item_id || null, file_name, mapEntityId).run()

    return c.json({ success: true, data: { order_number, file_seq, card_number } })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/print-events — receive print event from LogWatcher
printEventsRouter.post('/', agentKeyMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const { agent_id, equipment_id, file_path, print_status, print_completed_at,
            file_name, printer_name, print_started_at,
            output_width, output_height, dpi,
            copy_columns, copy_rows, copy_total, tile_count, tile_index,
            nest_members, event_kind } = body
    // 리핑 전용 이벤트(neoStampa) 구분 — 미지정은 기존 파서들이므로 실제 출력(PRINT)
    const eventKind = String(event_kind || 'PRINT').toUpperCase() === 'RIP' ? 'RIP' : 'PRINT'

    // 수신 시각 UTC 정규화 (KST naive → UTC naive). 멱등성/소요시간/INSERT 모두 동일 정규화값 사용.
    const normStartedAt = kstNaiveToUtc(print_started_at)
    const normCompletedAt = kstNaiveToUtc(print_completed_at)

    if (!agent_id || !file_path || !print_status) {
      return c.json({ success: false, error: 'agent_id, file_path, print_status required' }, 400)
    }

    const validStatuses = ['OK', 'CANCEL', 'ERROR']
    if (!validStatuses.includes(print_status)) {
      return c.json({ success: false, error: 'print_status must be OK, CANCEL, or ERROR' }, 400)
    }

    // LogWatcher --probe 의 마커 출력은 로그 경로를 찾으려고 일부러 낸 것이지 생산이 아니다.
    // 적재하면 장비를 세팅할 때마다 가짜 출력이 실적·가동률에 쌓인다 → 아예 넣지 않는다.
    if (isProbeMarker(file_name, file_path)) {
      return c.json({ success: true, data: { skipped: 'probe_marker', duplicate: false } })
    }

    // equipment_id 폴백: 누락 시 agent_id→heartbeat 매핑으로 복구
    // (universal 모드 에이전트가 출력이벤트에 equipment_id를 빈값으로 보내 NULL 적재되던 회귀 방어)
    let resolvedEquipmentId: string | null = equipment_id || null
    if (!resolvedEquipmentId && agent_id) {
      const hb = await c.env.DB.prepare(
        'SELECT equipment_id FROM agent_heartbeats WHERE agent_id = ?'
      ).bind(agent_id).first<{ equipment_id: string | null }>()
      if (hb?.equipment_id) resolvedEquipmentId = hb.equipment_id
    }

    // 현장 표시용 장비 라벨 (상태 이력·불량 자동등록 문구에 호스트명 대신 사용)
    const equipLabel = await resolveEquipmentLabel(c.env.DB, agent_id, resolvedEquipmentId)

    // Idempotency check (정규화된 completed_at 기준 — 저장값과 동일 기준)
    // IS 연산자로 NULL-safe 비교 (INSERT가 normCompletedAt을 그대로 저장하므로 SELECT도 동일값 바인드, #495)
    const existing = await c.env.DB.prepare(
      'SELECT id FROM print_events WHERE file_path = ? AND print_completed_at IS ?'
    ).bind(file_path, normCompletedAt).first<{ id: number }>()

    if (existing) {
      return c.json({ success: true, message: 'Event already recorded', data: { id: existing.id, duplicate: true } })
    }

    // Extract card/order from file-map or regex fallback
    const extractedName = file_name || file_path.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '')

    // 합판이면 멤버별로 전부 매칭 (단건이면 목록 길이 1 → 기존 동작 그대로)
    const matchNames = nestMatchNames(extractedName, nest_members)
    const resolvedByName = new Map<string, ResolvedCard>()
    for (const nm of matchNames) resolvedByName.set(nm, await resolveCard(c.env.DB, nm))
    const resolvedList = matchNames.map((nm) => resolvedByName.get(nm)!)

    // 매칭된 카드 전부에 반영 — 합판 N건이 함께 전환된다
    const appliedIds: (number | null)[] = []
    for (const r of resolvedList) {
      appliedIds.push(await applyEventToCard(c.env.DB, r, print_status, eventKind, equipLabel, file_path, copy_total || 1))
    }
    const appliedCards = resolvedList
      .map((r, i) => ({ cardId: appliedIds[i], orderItemId: r.orderItemId }))
      .filter((a): a is { cardId: number, orderItemId: number | null } => a.cardId != null)

    // 대표 매칭 = print_events 행의 card_id/card_number/order_number 컬럼용 (기존 스키마 유지).
    // 대표와 cardId 를 같은 인덱스에서 뽑아야 카드번호/ID 가 어긋나지 않는다.
    const primaryIdxRaw = resolvedList.findIndex((r) => r.cardId || r.cardNumber)
    const primaryIdx = primaryIdxRaw >= 0 ? primaryIdxRaw : 0
    const primary = resolvedList[primaryIdx] || { cardId: null, cardNumber: null, orderNumber: null, orderItemId: null }
    const cardNumber = primary.cardNumber
    const orderNumber = primary.orderNumber
    const cardId = appliedIds[primaryIdx] ?? primary.cardId ?? null

    // 멤버별 매칭 결과를 nest_members 에 실어 저장 — 미매칭 멤버를 웹에서 집어낼 수 있어야
    // "판에 들어갔는데 주문에 안 붙은 건"을 회수할 수 있다 (P3 연결 UI 의 입력).
    const nestMembersJson = Array.isArray(nest_members) && nest_members.length > 0
      ? JSON.stringify((nest_members as any[]).map((m) => {
          const raw = typeof m === 'string' ? m : (m?.file || '')
          const r = resolvedByName.get(baseFileName(raw))
          const obj: any = typeof m === 'string' ? { file: raw } : { ...m }
          obj.card_id = r?.cardId ?? null
          obj.card_number = r?.cardNumber ?? null
          obj.order_number = r?.orderNumber ?? null
          return obj
        }))
      : null

    // 인쇄 소요시간 계산 (정규화된 UTC 값 기준 — 차이는 동일하므로 안전)
    const durationSec = calcPrintDuration(normStartedAt, normCompletedAt)

    // entity_id: 카드에서 유도 (agent endpoint이므로 user context 없음)
    // #384: cards.requesting_entity_id (NULL이면 order entity)
    const eventEntityId = await deriveCardEntityId(c.env.DB, { cardId })

    // Insert event
    const result = await c.env.DB.prepare(`
      INSERT INTO print_events (
        agent_id, equipment_id, card_number, card_id, order_number, file_path, file_name,
        printer_name, print_status, print_started_at, print_completed_at, print_duration_sec,
        output_width, output_height, dpi,
        copy_columns, copy_rows, copy_total, tile_count, tile_index, entity_id, nest_members, event_kind
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      agent_id, resolvedEquipmentId, cardNumber, cardId, orderNumber, file_path, extractedName,
      printer_name || null, print_status, normStartedAt,
      normCompletedAt, durationSec,
      output_width || null, output_height || null,
      dpi || null,
      copy_columns || 1, copy_rows || 1, copy_total || 1,
      tile_count || 0, tile_index || 0, eventEntityId, nestMembersJson, eventKind
    ).run()

    const printEventId = result.meta.last_row_id as number

    // 타일 완료 체크 → card_item 자동 체크 → 전체 완료 시 PRINT_DONE 전환
    // RIP 이벤트는 실제 출력이 아니므로 PRINT_DONE 경로를 타지 않는다.
    if (print_status === 'OK' && eventKind !== 'RIP' && appliedCards.length > 0) {
      try {
        const tileComplete = await checkAllTilesComplete(c.env.DB, file_path, tile_count || 0)
        if (tileComplete) {
          for (const a of appliedCards) {
            await autoCheckCardItem(c.env.DB, a.cardId, a.orderItemId, equipLabel)
          }
        }
      } catch (tileError) {
        console.error('Tile completion check error:', tileError)
      }
    }

    // Auto-deduct inventory if print_status === 'OK'
    // RIP 이벤트는 자재를 쓰지 않는다 — 차감하면 실제 출력(PRINT) 때 이중 차감된다.
    let deductionResult = null
    if (print_status === 'OK' && eventKind !== 'RIP' && printEventId) {
      try {
        deductionResult = await autoDeductInventory(c.env.DB, printEventId)
      } catch (deductError) {
        // Log deduction error but don't fail the API response
        console.error('Inventory deduction error:', deductError)
      }
    }

    return c.json({
      success: true,
      data: {
        id: printEventId,
        card_number: cardNumber,
        card_matched: cardId !== null,
        duplicate: false,
        deduction: deductionResult
      }
    })
  } catch (error) {
    // 어떤 이벤트가 죽였는지 없이는 진단이 안 된다 — 파일 지문을 함께 남긴다 (2026-08-10 LIKE 홍수 교훈)
    let fileHint = ''
    try { const b: any = await c.req.json().catch(() => null); fileHint = String(b?.file_path || b?.file_name || '').slice(0, 150) } catch {}
    console.error('src/routes/printEvents.ts error:', error, '| file=', fileHint)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/print-events/heartbeat — agent heartbeat
printEventsRouter.post('/heartbeat', agentKeyMiddleware, async (c) => {
  try {
    const { agent_id, equipment_id, equipment_name, agent_version, ip_address, print_log_path, is_printing,
            kit_version, parser_type } = await c.req.json()

    if (!agent_id) {
      return c.json({ success: false, error: 'agent_id required' }, 400)
    }

    const isPrinting = is_printing ? 1 : 0

    await c.env.DB.prepare(`
      INSERT INTO agent_heartbeats (agent_id, equipment_id, agent_version, ip_address, last_seen_at, print_log_path, status, is_printing, updated_at, kit_version, parser_type)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'online', ?, CURRENT_TIMESTAMP, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        equipment_id = excluded.equipment_id,
        agent_version = excluded.agent_version,
        ip_address = excluded.ip_address,
        last_seen_at = CURRENT_TIMESTAMP,
        print_log_path = excluded.print_log_path,
        status = 'online',
        is_printing = excluded.is_printing,
        updated_at = CURRENT_TIMESTAMP,
        -- 구버전 에이전트(필드 미전송)가 기존 값을 NULL 로 지우지 않게 한다 — 롤아웃 도중 섞여 붙는다
        kit_version = COALESCE(excluded.kit_version, agent_heartbeats.kit_version),
        parser_type = COALESCE(excluded.parser_type, agent_heartbeats.parser_type)
    `).bind(agent_id, equipment_id || null, agent_version || null, ip_address || null, print_log_path || null, isPrinting,
            kit_version || null, parser_type || null).run()

    // 장비 상태/수집정보 갱신 + 미등록 장비 자동 등록 (LogWatcher 장비 중심 모델, 스펙 0615)
    if (equipment_id) {
      const equip = await c.env.DB.prepare(
        'SELECT equipment_status FROM equipment WHERE id = ?'
      ).bind(equipment_id).first<EquipmentStatusRow>()

      if (equip) {
        // 수동 상태(MAINTENANCE/BROKEN)는 보존, 그 외 RUNNING/IDLE 자동 전환
        const currentStatus = equip.equipment_status || 'IDLE'
        const statusToSet = (currentStatus === 'MAINTENANCE' || currentStatus === 'BROKEN')
          ? currentStatus
          : (isPrinting ? 'RUNNING' : 'IDLE')
        await c.env.DB.prepare(
          `UPDATE equipment SET equipment_status = ?, last_seen_at = CURRENT_TIMESTAMP,
             print_log_path = ?, agent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(statusToSet, print_log_path || null, agent_id || null, equipment_id).run()
      } else {
        // 미등록 장비 자동 등록 (entity_id=1 동산 기본 → 관리자가 /equipment에서 공정·법인 보강)
        await c.env.DB.prepare(
          `INSERT INTO equipment (id, name, equipment_status, agent_id, last_seen_at, print_log_path, entity_id, status)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 1, 'ACTIVE')`
        ).bind(
          equipment_id, equipment_name || equipment_id,
          isPrinting ? 'RUNNING' : 'IDLE', agent_id || null, print_log_path || null
        ).run()
        console.log(`[heartbeat] auto-registered equipment: ${equipment_id}`)
      }
    }

    return c.json({ success: true, message: 'Heartbeat received' })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// POST /api/print-events/batch — receive multiple events at once
printEventsRouter.post('/batch', agentKeyMiddleware, async (c) => {
  try {
    const { agent_id, equipment_id, events } = await c.req.json()

    if (!agent_id || !Array.isArray(events) || events.length === 0) {
      return c.json({ success: false, error: 'agent_id and events array required' }, 400)
    }

    // equipment_id 폴백 (단일 핸들러와 동일): 누락 시 agent_id→heartbeat 매핑으로 복구
    let resolvedEquipmentId: string | null = equipment_id || null
    if (!resolvedEquipmentId && agent_id) {
      const hb = await c.env.DB.prepare(
        'SELECT equipment_id FROM agent_heartbeats WHERE agent_id = ?'
      ).bind(agent_id).first<{ equipment_id: string | null }>()
      if (hb?.equipment_id) resolvedEquipmentId = hb.equipment_id
    }

    // 현장 표시용 장비 라벨 (배치 공통 — 요청당 1회 조회)
    const equipLabel = await resolveEquipmentLabel(c.env.DB, agent_id, resolvedEquipmentId)

    let inserted = 0
    let duplicates = 0
    let errors = 0
    // 무음 유실 방지: 실패 샘플 최대 5건 수집 + 로깅 (#495)
    const failSamples: { file_path?: string; error: string }[] = []

    for (const evt of events) {
      try {
        // --probe 마커 잡은 생산이 아니다 (단일 핸들러와 동일). 오프라인 큐로 늦게 올라와도 막는다.
        if (isProbeMarker(evt.file_name, evt.file_path)) { duplicates++; continue }

        // 수신 시각 UTC 정규화 (단일 핸들러와 동일)
        const evtNormStartedAt = kstNaiveToUtc(evt.print_started_at)
        const evtNormCompletedAt = kstNaiveToUtc(evt.print_completed_at)

        // Idempotency (정규화된 completed_at 기준) — IS 연산자로 NULL-safe 비교 (#495)
        const existing = await c.env.DB.prepare(
          'SELECT id FROM print_events WHERE file_path = ? AND print_completed_at IS ?'
        ).bind(evt.file_path, evtNormCompletedAt).first()

        if (existing) { duplicates++; continue }

        const extractedName = evt.file_name || evt.file_path.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '')
        const evtKind = String(evt.event_kind || 'PRINT').toUpperCase() === 'RIP' ? 'RIP' : 'PRINT'

        // 합판이면 멤버별로 전부 매칭 (단건이면 길이 1 → 기존 동작 그대로)
        const evtMatchNames = nestMatchNames(extractedName, evt.nest_members)
        const evtResolvedByName = new Map<string, ResolvedCard>()
        for (const nm of evtMatchNames) evtResolvedByName.set(nm, await resolveCard(c.env.DB, nm))
        const evtResolvedList = evtMatchNames.map((nm) => evtResolvedByName.get(nm)!)

        const evtPrimaryIdxRaw = evtResolvedList.findIndex((r) => r.cardId || r.cardNumber)
        const evtPrimaryIdx = evtPrimaryIdxRaw >= 0 ? evtPrimaryIdxRaw : 0
        const evtPrimary = evtResolvedList[evtPrimaryIdx] || { cardId: null, cardNumber: null, orderNumber: null, orderItemId: null }
        const cardNumber = evtPrimary.cardNumber
        const orderNumber = evtPrimary.orderNumber
        const evtAppliedIds: (number | null)[] = []

        // file_map 또는 fallback으로 카드 매칭 (status + post_processing 1쿼리로 조회)
        for (const resolved of evtResolvedList) {
          let memberCardId = resolved.cardId
          const card = memberCardId
            ? await c.env.DB.prepare('SELECT id, status, post_processing FROM cards WHERE id = ?').bind(memberCardId).first<CardRow>()
            : resolved.cardNumber
              ? await c.env.DB.prepare('SELECT id, status, post_processing FROM cards WHERE card_number = ?').bind(resolved.cardNumber).first<CardRow>()
              : null
          if (card) {
            memberCardId = card.id
            // RIP 이벤트는 실제 출력이 아니다 → PRINT_DONE·ERROR·불량등록을 하지 않는다
            if (evtKind === 'RIP') {
              if (evt.print_status === 'OK' && (card.status === 'PRINT_PENDING' || card.status === 'RIP_WAITING')) {
                await c.env.DB.prepare(
                  "UPDATE cards SET status = 'PRINTING', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                ).bind(card.id).run()
              }
            }
            else if (evt.print_status === 'OK' && card.status !== 'PRINT_DONE') {
              const bHasPP = card.post_processing && card.post_processing !== '[]' && card.post_processing !== ''
              const bPpStatus = bHasPP ? 'PENDING' : 'N/A'

              await c.env.DB.batch([
                c.env.DB.prepare(
                  `UPDATE cards SET status = 'PRINT_DONE', rip_status = 'COMPLETED',
                   pp_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                ).bind(bPpStatus, card.id),
                c.env.DB.prepare(
                  `INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
                   VALUES (?, ?, 'PRINT_DONE', NULL, ?)`
                ).bind(card.id, card.status, `Print completed on ${equipLabel}`)
              ])
            }
            if (evtKind !== 'RIP' && evt.print_status === 'CANCEL') {
              const evtCopyTotal = evt.copy_total || 1
              const reason = evtCopyTotal > 1
                ? `Print cancelled (${evtCopyTotal}매 배열출력 중 취소) on ${equipLabel}`
                : `Print cancelled on ${equipLabel}`
              await c.env.DB.batch([
                c.env.DB.prepare(
                  `UPDATE cards SET rip_status = 'ERROR', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                ).bind(card.id),
                c.env.DB.prepare(
                  `INSERT INTO card_status_history (card_id, from_status, to_status, changed_by, change_reason)
                   VALUES (?, ?, ?, NULL, ?)`
                ).bind(card.id, card.status, card.status, reason)
              ])
            }
            if (evtKind !== 'RIP' && (evt.print_status === 'ERROR' || evt.print_status === 'CANCEL')) {
              await autoCreateQualityIssue(c.env.DB, card.id, evt.print_status, equipLabel, evt.file_path, evt.copy_total || 1)
            }
          }
          evtAppliedIds.push(card ? memberCardId : null)
        }

        const cardId = evtAppliedIds[evtPrimaryIdx] ?? evtPrimary.cardId ?? null
        const evtDuration = calcPrintDuration(evtNormStartedAt, evtNormCompletedAt)

        // entity_id: 카드에서 유도 (#384: requesting_entity_id, NULL이면 order entity)
        const batchEntityId = await deriveCardEntityId(c.env.DB, { cardId })

        // 멤버별 매칭 결과 동봉 (단건 핸들러와 동일) — 미매칭 멤버 회수용
        const evtNestMembersJson = Array.isArray(evt.nest_members) && evt.nest_members.length > 0
          ? JSON.stringify((evt.nest_members as any[]).map((m) => {
              const raw = typeof m === 'string' ? m : (m?.file || '')
              const r = evtResolvedByName.get(baseFileName(raw))
              const obj: any = typeof m === 'string' ? { file: raw } : { ...m }
              obj.card_id = r?.cardId ?? null
              obj.card_number = r?.cardNumber ?? null
              obj.order_number = r?.orderNumber ?? null
              return obj
            }))
          : null

        const batchResult = await c.env.DB.prepare(`
          INSERT INTO print_events (
            agent_id, equipment_id, card_number, card_id, order_number, file_path, file_name,
            printer_name, print_status, print_started_at, print_completed_at, print_duration_sec,
            output_width, output_height, dpi,
            copy_columns, copy_rows, copy_total, tile_count, tile_index, entity_id, nest_members, event_kind
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          agent_id, resolvedEquipmentId, cardNumber, cardId, orderNumber,
          evt.file_path, extractedName, evt.printer_name || null,
          evt.print_status, evtNormStartedAt,
          evtNormCompletedAt, evtDuration, evt.output_width || null,
          evt.output_height || null, evt.dpi || null,
          evt.copy_columns || 1, evt.copy_rows || 1, evt.copy_total || 1,
          evt.tile_count || 0, evt.tile_index || 0, batchEntityId, evtNestMembersJson, evtKind
        ).run()

        const batchPrintEventId = batchResult.meta.last_row_id as number

        // Auto-deduct inventory if print_status === 'OK' (RIP 은 자재 미사용 → 이중차감 방지)
        if (evt.print_status === 'OK' && evtKind !== 'RIP' && batchPrintEventId) {
          try {
            await autoDeductInventory(c.env.DB, batchPrintEventId)
          } catch {
            // Log but don't fail batch processing
          }
        }

        inserted++
      } catch (err: any) {
        console.error(`[printEvents/batch] event failed (agent=${agent_id}, file=${evt?.file_path}):`, err)
        if (failSamples.length < 5) {
          failSamples.push({ file_path: evt?.file_path, error: String(err?.message || err) })
        }
        errors++
      }
    }

    // 전건 실패 시 비-200 반환 → 클라 재시도 유도 (조용한 영구 유실 방지, #495)
    if (inserted === 0 && errors > 0) {
      return c.json({
        success: false,
        status: 'PARTIAL',
        error: '이벤트 처리 전건 실패',
        data: { inserted, duplicates, errors, total: events.length, failSamples }
      }, 500)
    }

    return c.json({
      success: true,
      status: errors > 0 ? 'PARTIAL' : 'OK',
      data: { inserted, duplicates, errors, total: events.length, failSamples }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ─── Dashboard endpoints (JWT auth) ───

// PATCH /api/print-events/:id/actual-printed — Cancel 이벤트에 실제 출력 매수 입력
printEventsRouter.patch('/:id/actual-printed', authMiddleware, async (c) => {
  try {
    const eventId = c.req.param('id')
    const { actual_printed } = await c.req.json()

    if (actual_printed === undefined || actual_printed === null) {
      return c.json({ success: false, error: 'actual_printed is required' }, 400)
    }

    // 이벤트 존재 확인 (#571: 형제 GET / entityFilter와 대칭으로 소유 검증)
    const ef = entityFilter(c)
    const event = await c.env.DB.prepare(
      `SELECT id, print_status, copy_total FROM print_events WHERE id = ?${ef.clause}`
    ).bind(eventId, ...ef.params).first()

    if (!event) {
      return c.json({ success: false, error: 'Event not found' }, 404)
    }

    // JWT에서 사용자 정보 추출
    const user = c.get('user')
    const userName = user?.username || 'unknown'

    await c.env.DB.prepare(`
      UPDATE print_events SET
        actual_printed = ?,
        actual_printed_by = ?,
        actual_printed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(actual_printed, userName, eventId).run()

    return c.json({
      success: true,
      data: { id: eventId, actual_printed }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/print-events — list events with filters
printEventsRouter.get('/', authMiddleware, async (c) => {
  try {
    const {
      page = '1', limit = '50', agent_id = '', equipment_id = '', status = '', date = '',
      q = '', from = '', to = '', equipment_ids = '', tiled = ''
    } = c.req.query()
    const pageNum = Number(page)
    const limitNum = Number(limit)
    const offset = (pageNum - 1) * limitNum

    // 출력 이벤트 = 장비 로그(장비는 전 법인 공유 인프라, 매출 실적 아님) → 조회는 격리 안 함
    // (2026-08-11: 전 이벤트가 entity 1이라 타법인 세션은 현황 KPI·이벤트가 전부 0이었다. 쓰기 경로는 격리 유지)
    let where = 'WHERE 1=1'
    const params: (string | number)[] = []

    if (agent_id) {
      where += ' AND pe.agent_id = ?'
      params.push(agent_id)
    }
    // equipment_ids(콤마구분 다중) 우선 — 값이 있으면 단일 equipment_id 무시
    const equipmentIdList = equipment_ids
      ? equipment_ids.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : []
    if (equipmentIdList.length > 0) {
      where += ` AND pe.equipment_id IN (${equipmentIdList.map(() => '?').join(',')})`
      params.push(...equipmentIdList)
    } else if (equipment_id) {
      where += ' AND pe.equipment_id = ?'
      params.push(equipment_id)
    }
    if (status) {
      where += ' AND pe.print_status = ?'
      params.push(status)
    }
    // 분할출력(타일)만 — tile_count>0 행은 타일 1장 = 1행으로 이미 분리 저장돼 있다
    if (tiled === '1') {
      where += ' AND pe.tile_count > 0'
    }
    // 통합 검색어 q: 파일명/경로/카드/주문/장비명 LIKE OR (COLLATE NOCASE)
    if (q) {
      where += ` AND (
        pe.file_name LIKE '%' || ? || '%' COLLATE NOCASE
        OR pe.file_path LIKE '%' || ? || '%' COLLATE NOCASE
        OR pe.card_number LIKE '%' || ? || '%' COLLATE NOCASE
        OR pe.order_number LIKE '%' || ? || '%' COLLATE NOCASE
        OR pe.printer_name LIKE '%' || ? || '%' COLLATE NOCASE
      )`
      params.push(q, q, q, q, q)
    }
    // from/to(KST 날짜) 우선 — 동시 입력 시 date 단일 필터 무시.
    // 저장값=UTC이므로 KST(+9h) 환산 후 date 비교. completed 없으면 created_at 폴백.
    if (from || to) {
      if (from) {
        where += " AND date(datetime(COALESCE(pe.print_completed_at, pe.created_at), '+9 hours')) >= ?"
        params.push(from)
      }
      if (to) {
        where += " AND date(datetime(COALESCE(pe.print_completed_at, pe.created_at), '+9 hours')) <= ?"
        params.push(to)
      }
    } else if (date) {
      // 단일 date 필터도 KST 기준 (저장값 UTC → +9h 환산)
      where += " AND date(datetime(pe.print_completed_at, '+9 hours')) = ?"
      params.push(date)
    }

    // Count
    // 건수 + 실적 합계 — 조회조건 전체 기준(현재 페이지 아님)
    //
    // ★면적이 실적이다. 건수만으로는 A4 한 장과 10m 현수막이 같은 1건이 된다.
    //   `output_width/height` 는 **TEXT 컬럼**이라 CAST 필수(안 하면 문자열 비교로 엉킨다). 단위는 mm(실측 40mm~27.8m).
    //   `copy_total`(모아찍기 매수)을 곱한다. ⚠️`tile_count` 는 곱하지 않는다 —
    //   타일 행은 타일마다 폭이 달라(2473mm/1807mm) 이미 행 단위로 분리돼 있어 곱하면 중복이다.
    //
    // ⚠️`print_duration_sec` 은 합계에 넣지 않는다. 파서별로 의미가 다르고(memory reference-logwatcher-duration-semantics)
    //   실측이 1초~14,293초에 100장 작업이 45초인 행까지 있어 합산이 무의미하다. 열로만 원본을 보여준다.
    const countQuery = `SELECT COUNT(*) as count,
        COALESCE(SUM(CAST(pe.output_width AS REAL) * CAST(pe.output_height AS REAL) * COALESCE(pe.copy_total, 1)), 0) / 1000000.0 as area_m2,
        COUNT(DISTINCT pe.equipment_id) as equipment_count,
        SUM(CASE WHEN pe.print_status = 'CANCEL' THEN 1 ELSE 0 END) as cancel_count,
        SUM(CASE WHEN pe.print_status = 'ERROR' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN pe.tile_count > 0 THEN 1 ELSE 0 END) as tile_rows,
        COUNT(DISTINCT CASE WHEN pe.tile_count > 0 THEN pe.file_path END) as tile_files
      FROM print_events pe ${where}`
    const countRow = await c.env.DB.prepare(countQuery).bind(...params).first<{
      count: number; area_m2: number; equipment_count: number; cancel_count: number; error_count: number
      tile_rows: number; tile_files: number
    }>()
    const count = countRow?.count ?? 0

    // 장비명 표시 통일: 사용자가 /장비관리에서 정한 equipment.name 우선, 없으면 RIPLOG 원본(printer_name)
    const selectQuery = `SELECT pe.*, COALESCE(eq.name, pe.printer_name) as printer_name,
        date(datetime(COALESCE(pe.print_completed_at, pe.created_at), '+9 hours')) as kst_day
      FROM print_events pe LEFT JOIN equipment eq ON pe.equipment_id = eq.id ${where} ORDER BY COALESCE(pe.print_completed_at, pe.created_at) DESC, pe.id DESC LIMIT ? OFFSET ?`
    params.push(limitNum, offset)
    const { results } = await c.env.DB.prepare(selectQuery).bind(...params).all()

    // ─── 과다 기록 의심 (파일명 주문수량 대비, 페이지 행에만 표시) ───
    // 파일명 꼬리 "(폭-높이-N조|N장)"의 N 대비 같은 날(KST)·같은 파일의 OK 기록 매수 합이
    // 2배 이상 && 2행 이상이면 의심. '양면'은 앞뒤 2매가 정상이라 N×2.
    // FLEXI(RIPLOG)는 전송 로그 — 전송 완료 후 취소는 기록에 안 남아 취소→재전송이 전부 '정상'으로
    // 쌓인다(2026-08-12 양구군 5조 주문/25매 기록). ⚠️"30분 내 동일파일 반복" 휴리스틱은 대형 조수
    // 작업의 분할 반복 출력(예: 100조를 2~4매씩)과 구분 불가로 기각 — 백테스트 FLEXI 34.7% 오염.
    try {
      const declaredRe = /-(\d+)\s*(조|장)\)/
      const pageRows = results as Array<Record<string, unknown>>
      const names: string[] = []
      const nameSeen = new Set<string>()
      for (const r of pageRows) {
        const fn = String(r.file_name || '')
        if (!fn || r.print_status !== 'OK' || (r.event_kind || 'PRINT') !== 'PRINT') continue
        if (!declaredRe.test(fn) || nameSeen.has(fn)) continue
        nameSeen.add(fn)
        names.push(fn)
      }
      if (names.length > 0) {
        // 바인드 100 한도 → 80개 청크 (memory d1-bind-param-limit)
        const dayMap = new Map<string, { copies: number; rows: number }>()
        for (let i = 0; i < names.length; i += 80) {
          const chunk = names.slice(i, i + 80)
          // ⚠️타일 정규화: 분할출력은 타일 1장 = 1행이라 그대로 합치면 "1장 주문 3타일 = 3매"로
          //   오탐한다(2026-08-12 prod 실측 TOPM-01). 각 행을 copy/tile_count 로 환산해 출력 1회 = 1로 센다.
          const grp = await c.env.DB.prepare(`
            SELECT file_name, date(datetime(COALESCE(print_completed_at, created_at), '+9 hours')) as kst_day,
              SUM(COALESCE(copy_total, 1) * 1.0 / (CASE WHEN COALESCE(tile_count, 0) > 0 THEN tile_count ELSE 1 END)) as day_copies,
              SUM(1.0 / (CASE WHEN COALESCE(tile_count, 0) > 0 THEN tile_count ELSE 1 END)) as day_prints
            FROM print_events
            WHERE event_kind = 'PRINT' AND print_status = 'OK' AND file_name IN (${chunk.map(() => '?').join(',')})
            GROUP BY file_name, kst_day
          `).bind(...chunk).all<{ file_name: string; kst_day: string; day_copies: number; day_prints: number }>()
          for (const g of grp.results || []) {
            dayMap.set(g.file_name + '|' + g.kst_day, { copies: Number(g.day_copies) || 0, rows: Number(g.day_prints) || 0 })
          }
        }
        for (const r of pageRows) {
          const fn = String(r.file_name || '')
          if (!fn || r.print_status !== 'OK' || (r.event_kind || 'PRINT') !== 'PRINT') continue
          const m = fn.match(declaredRe)
          if (!m) continue
          let declared = parseInt(m[1], 10)
          if (fn.includes('양면')) declared *= 2
          const g = dayMap.get(fn + '|' + String(r.kst_day || ''))
          if (declared >= 1 && g && g.rows >= 2 && g.copies >= declared * 2) {
            r.over_declared = declared
            r.over_day_copies = Math.round(g.copies)
            r.over_day_rows = Math.round(g.rows)   // 타일 정규화 후 = 출력 횟수
          }
        }
      }
    } catch (overErr) {
      console.error('overprint check error:', overErr)   // 표시용 부가정보 — 실패해도 목록은 낸다
    }

    return c.json({
      success: true,
      data: results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        total_pages: Math.ceil(count / limitNum)
      },
      summary: {
        count,
        area_m2: Number(countRow?.area_m2) || 0,
        equipment_count: Number(countRow?.equipment_count) || 0,
        cancel_count: Number(countRow?.cancel_count) || 0,
        error_count: Number(countRow?.error_count) || 0,
        tile_rows: Number(countRow?.tile_rows) || 0,
        tile_files: Number(countRow?.tile_files) || 0,
      }
    })
  } catch (error) {
    return c.json({
      success: false,

      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/print-events/agents — list all agents with status
printEventsRouter.get('/agents', authMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, agent_id, agent_version, kit_version, parser_type, ip_address, last_seen_at, print_log_path, status, equipment_id, is_printing, created_at, updated_at,
        CASE
          WHEN last_seen_at IS NULL THEN 'unknown'
          WHEN (julianday('now') - julianday(last_seen_at)) * 86400 > 120 THEN 'offline'
          ELSE 'online'
        END as computed_status
      FROM agent_heartbeats
      ORDER BY last_seen_at DESC, id DESC
    `).all()

    const online = (results as AgentHeartbeatRow[]).filter((a) => a.computed_status === 'online').length
    const offline = (results as AgentHeartbeatRow[]).filter((a) => a.computed_status === 'offline').length

    return c.json({
      success: true,
      data: {
        agents: results,
        summary: { total: results.length, online, offline }
      }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// GET /api/print-events/stats — print statistics
printEventsRouter.get('/stats', authMiddleware, async (c) => {
  try {
    const { days = '7' } = c.req.query()
    // 출력 이벤트 조회 = 격리 안 함 (목록 GET 과 동일 사유, 2026-08-11)

    // Today summary
    const todaySummary = await c.env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN print_status = 'ERROR' THEN 1 END) as error_count,
        COUNT(CASE WHEN print_status = 'CANCEL' THEN 1 END) as cancel_count,
        COUNT(*) as total_count
      FROM print_events
      WHERE ${kstDateOf('created_at')} = ${kstDate()}
        AND event_kind = 'PRINT'
    `).first<TodaySummaryRow>()

    // Daily breakdown
    const { results: daily } = await c.env.DB.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count,
        COUNT(CASE WHEN print_status = 'ERROR' THEN 1 END) as error_count,
        COUNT(CASE WHEN print_status = 'CANCEL' THEN 1 END) as cancel_count,
        COUNT(*) as total_count
      FROM print_events
      WHERE date(created_at) >= date('now', ? || ' days')
        AND event_kind = 'PRINT'
      GROUP BY date(created_at)
      ORDER BY date DESC
    `).bind(`-${days}`).all()

    // Top agents today
    const { results: topAgents } = await c.env.DB.prepare(`
      SELECT agent_id, COUNT(*) as count,
        COUNT(CASE WHEN print_status = 'OK' THEN 1 END) as ok_count
      FROM print_events
      WHERE ${kstDateOf('created_at')} = ${kstDate()}
        AND event_kind = 'PRINT'
      GROUP BY agent_id
      ORDER BY count DESC
      LIMIT 10
    `).all()

    // Recent events (last 20)
    const { results: recent } = await c.env.DB.prepare(`
      SELECT id, agent_id, card_number, card_id, order_number, file_path, file_name, printer_name, print_status, print_started_at, print_completed_at, output_width, output_height, dpi, equipment_id, copy_total, print_duration_sec, created_at FROM print_events
      WHERE 1=1
      ORDER BY created_at DESC, id DESC LIMIT 20
    `).all()

    return c.json({
      success: true,
      data: {
        today: todaySummary,
        daily,
        top_agents: topAgents,
        recent
      }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════════
//  출력파일 ↔ 카드 연결 (P3)
//
//  전사 등 일부 공정은 디자이너가 파일명을 자유 명명한다(주문번호 미포함) → resolveCard 전멸.
//  파일명 규칙을 강제하는 대신, RIP 로그에 실제로 등장한 파일명을 모아
//  "규격·수량·거래처를 파싱해 카드 후보를 추천 → 1클릭 확정 → print_file_map 학습" 시킨다.
//  같은 파일명 재출력은 이후 자동 매칭된다.
// ═══════════════════════════════════════════════════════════════════════

/**
 * 도안 파일명에서 규격/수량/거래처 추출.
 * 실측 예: `해양호-빨강(75-60-300장).eps` · `제75보병사단-탁상기붙임(135-90-1벌).eps` · `민방위(120-80).eps`
 * 규격 단위는 cm (order_items.width/height 와 동일 — apScale(widthCm) 참조).
 */
export function parseDesignFileName(rawName: string): {
  client: string | null, width: number | null, height: number | null, qty: number | null
} {
  const name = String(rawName || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  // (가로-세로[-수량단위]) — 구분자는 -, x, ×, * 허용
  const m = name.match(/\((\d+(?:\.\d+)?)\s*[-x×*]\s*(\d+(?:\.\d+)?)(?:\s*[-x×*]\s*(\d+)\s*(?:장|벌|개|매|ea|EA)?)?\s*\)/)
  const width = m ? Number(m[1]) : null
  const height = m ? Number(m[2]) : null
  const qty = m && m[3] ? Number(m[3]) : null

  // 거래처 추정: 선두 "N." 순번(판 내 배치 순서)을 떼고 첫 구분자 앞 토큰
  const head = name.replace(/^\s*\d+\s*\.\s*/, '').split(/[-(（]/)[0].trim()
  const client = head.length >= 2 ? head : null

  return { client, width, height, qty }
}

/** 확장자 유무 양쪽을 허용하는 비교키 (resolveCard 2차와 동일 기준) */
function fileKey(s: string): string {
  return String(s || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim().toLowerCase()
}

// GET /api/print-events/unmatched — 카드에 안 붙은 출력파일 목록 (단건 + 합판 멤버)
printEventsRouter.get('/unmatched', authMiddleware, async (c) => {
  try {
    const { days = '90', limit = '100' } = c.req.query()
    const dayNum = Math.min(365, Math.max(1, parseInt(days as string) || 90))
    const limitNum = Math.min(300, Math.max(1, parseInt(limit as string) || 100))
    // 출력 이벤트 조회 = 격리 안 함 (목록 GET 과 동일 사유, 2026-08-11)

    // 단건 이벤트 + 합판 멤버를 한 목록으로. 멤버는 구형식(문자열 배열)과 신형식(객체) 모두 지원.
    const { results } = await c.env.DB.prepare(`
      SELECT file_name, SUM(cnt) AS cnt, MAX(last_at) AS last_at,
             MAX(w) AS w, MAX(h) AS h, MAX(equipment_id) AS equipment_id, MAX(is_nest) AS is_nest
      FROM (
        SELECT pe.file_name AS file_name, COUNT(*) AS cnt,
               MAX(COALESCE(pe.print_completed_at, pe.created_at)) AS last_at,
               MAX(pe.output_width) AS w, MAX(pe.output_height) AS h,
               MAX(pe.equipment_id) AS equipment_id, 0 AS is_nest
        FROM print_events pe
        WHERE pe.card_id IS NULL
          AND (pe.nest_members IS NULL OR pe.nest_members = '')
          AND pe.file_name IS NOT NULL AND pe.file_name != ''
          AND COALESCE(pe.print_completed_at, pe.created_at) >= date('now', '-' || ? || ' days')
        GROUP BY pe.file_name
        UNION ALL
        -- ⚠️ GROUP BY 에 별칭(file_name)을 쓰면 SQLite가 스코프에 있는 pe.file_name 컬럼으로 해석해
        --    합판 전체가 한 그룹으로 뭉개진다. 반드시 표현식을 그대로 반복할 것.
        -- ⚠️ 구형식 멤버(= 그냥 파일명 문자열)에 json_extract 를 쓰면 COALESCE 로 넘어가는 게 아니라
        --    **쿼리 전체가 "malformed JSON" 으로 죽는다**(SQLITE_ERROR 7500). 2026-06-22 자 구형식 5건
        --    때문에 days>=70 구간이 통째로 500 이었고, 화면 기본값이 90일이라 이 탭은 아예 안 떴다.
        --    → json_valid 로 먼저 거른다. 구형식은 값 자체가 파일명이고 card_id 는 없다(=미연결).
        SELECT CASE WHEN json_valid(m.value) THEN COALESCE(json_extract(m.value, '$.file'), m.value) ELSE m.value END AS file_name, COUNT(*) AS cnt,
               MAX(COALESCE(pe.print_completed_at, pe.created_at)) AS last_at,
               MAX(CASE WHEN json_valid(m.value) THEN json_extract(m.value, '$.w') END) AS w,
               MAX(CASE WHEN json_valid(m.value) THEN json_extract(m.value, '$.h') END) AS h,
               MAX(pe.equipment_id) AS equipment_id, 1 AS is_nest
        FROM print_events pe, json_each(pe.nest_members) m
        WHERE pe.nest_members IS NOT NULL AND pe.nest_members != ''
          AND (CASE WHEN json_valid(m.value) THEN json_extract(m.value, '$.card_id') END) IS NULL
          AND COALESCE(pe.print_completed_at, pe.created_at) >= date('now', '-' || ? || ' days')
        GROUP BY CASE WHEN json_valid(m.value) THEN COALESCE(json_extract(m.value, '$.file'), m.value) ELSE m.value END
      )
      WHERE file_name IS NOT NULL AND file_name != ''
      GROUP BY file_name
      ORDER BY last_at DESC, file_name ASC
      LIMIT ?
    `).bind(dayNum, dayNum, limitNum).all<{
      file_name: string; cnt: number; last_at: string; w: number | null; h: number | null;
      equipment_id: string | null; is_nest: number
    }>()

    const rows = results || []
    // 이미 file_map 에 등록된 이름 제외 — 연결 직후 목록에서 바로 빠지도록 저장값이 아닌 실시간 대조.
    // ⚠️ D1 바인드 한도(~100). 아래 쿼리는 **같은 청크를 IN 절 2개에 바인드**하므로 실제 바인드 수는 청크×2 다.
    //    통상 쓰는 80 청크를 그대로 쓰면 160개가 되어 결정적 500 (실제로 그렇게 터졌다) → 40 으로 잡는다.
    const CHUNK = 40
    const linked = new Set<string>()
    const keys = Array.from(new Set(rows.map((r) => fileKey(r.file_name))))
    for (let i = 0; i < keys.length; i += CHUNK) {
      const chunk = keys.slice(i, i + CHUNK)
      if (chunk.length === 0) continue
      const ph = chunk.map(() => '?').join(',')
      const { results: fm } = await c.env.DB.prepare(
        `SELECT file_name FROM print_file_map WHERE lower(file_name) IN (${ph})
         OR lower(replace(replace(file_name, '.eps', ''), '.EPS', '')) IN (${ph})`
      ).bind(...chunk, ...chunk).all<{ file_name: string }>()
      for (const r of (fm || [])) linked.add(fileKey(r.file_name))
    }

    const data = rows
      .filter((r) => !linked.has(fileKey(r.file_name)))
      .map((r) => ({ ...r, parsed: parseDesignFileName(r.file_name) }))

    return c.json({ success: true, data })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /api/print-events/link-candidates?file_name=... — 파일명 파싱 → 카드 후보 추천
printEventsRouter.get('/link-candidates', authMiddleware, async (c) => {
  try {
    const fileName = c.req.query('file_name') || ''
    if (!fileName) return c.json({ success: false, error: 'file_name required' }, 400)

    const parsed = parseDesignFileName(fileName)
    const ef = cardEntityFilter(c, 'c')

    // 후보 축소: 규격(정/역방향) 또는 거래처/품목명 부분일치. 신호가 없으면 최근 카드로 폴백.
    const conds: string[] = []
    const params: any[] = []
    if (parsed.width && parsed.height) {
      conds.push('(ABS(c.width - ?) <= 1 AND ABS(c.height - ?) <= 1)')
      params.push(parsed.width, parsed.height)
      conds.push('(ABS(c.width - ?) <= 1 AND ABS(c.height - ?) <= 1)')
      params.push(parsed.height, parsed.width)
    }
    if (parsed.client) {
      conds.push('c.client_name LIKE ?'); params.push(`%${parsed.client}%`)
      conds.push('c.item_name LIKE ?'); params.push(`%${parsed.client}%`)
    }
    const signalClause = conds.length > 0 ? ` AND (${conds.join(' OR ')})` : ''

    const { results } = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.item_name, c.client_name, c.width, c.height,
             c.quantity, c.status, o.order_number, o.order_date
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE c.status IN ('PRINT_PENDING', 'RIP_WAITING', 'PRINTING')${ef.clause}${signalClause}
      ORDER BY c.id DESC
      LIMIT 200
    `).bind(...ef.params, ...params).all<{
      id: number; card_number: string; item_name: string | null; client_name: string | null;
      width: number | null; height: number | null; quantity: number | null; status: string;
      order_number: string | null; order_date: string | null
    }>()

    const scored = (results || []).map((row) => {
      let score = 0
      const reasons: string[] = []
      if (parsed.width && parsed.height && row.width && row.height) {
        const fit = Math.abs(row.width - parsed.width) <= 1 && Math.abs(row.height - parsed.height) <= 1
        const swap = Math.abs(row.width - parsed.height) <= 1 && Math.abs(row.height - parsed.width) <= 1
        if (fit || swap) { score += 3; reasons.push(swap ? '규격(가로세로 반전)' : '규격') }
      }
      if (parsed.qty && row.quantity && parsed.qty === row.quantity) { score += 2; reasons.push('수량') }
      if (parsed.client && row.client_name && row.client_name.includes(parsed.client)) { score += 3; reasons.push('거래처') }
      if (parsed.client && row.item_name && row.item_name.includes(parsed.client)) { score += 1; reasons.push('품목명') }
      return { ...row, score, reasons }
    })
      .filter((r) => r.score > 0 || conds.length === 0)
      .sort((a, b) => b.score - a.score || b.id - a.id)
      .slice(0, 20)

    return c.json({ success: true, data: { parsed, candidates: scored } })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /api/print-events/link — 파일명 ↔ 카드 연결 (print_file_map 학습 + 과거 이벤트 소급)
printEventsRouter.post('/link', authMiddleware, async (c) => {
  try {
    const { file_name, card_id } = await c.req.json()
    if (!file_name || !card_id) {
      return c.json({ success: false, error: 'file_name, card_id required' }, 400)
    }

    // #600: 형제 GET /link-candidates와 동일하게 카드 소유 법인 검증 — 후보 목록은 격리되는데
    // 쓰기 본체가 body card_id를 무검증 신뢰하면 타법인 카드에 파일 연결(실적 오염) 가능
    const efCard = cardEntityFilter(c, 'c')
    const card = await c.env.DB.prepare(`
      SELECT c.id, c.card_number, c.order_item_id, o.order_number
      FROM cards c LEFT JOIN orders o ON c.order_id = o.id WHERE c.id = ?${efCard.clause}
    `).bind(card_id, ...efCard.params).first<{ id: number; card_number: string; order_item_id: number | null; order_number: string | null }>()
    if (!card) return c.json({ success: false, error: '카드를 찾을 수 없습니다.' }, 404)
    if (!card.order_number) return c.json({ success: false, error: '카드에 주문번호가 없습니다.' }, 400)

    const mapEntityId = await deriveCardEntityId(c.env.DB, { cardId: card.id })

    // file_seq: 같은 파일명이 이미 있으면 그 자리에 덮어쓰고, 없으면 다음 번호를 딴다.
    // (UNIQUE(order_number, file_seq) — IA 자동등록분과 충돌하지 않도록 max+1)
    const existing = await c.env.DB.prepare(
      'SELECT file_seq FROM print_file_map WHERE order_number = ? AND file_name = ?'
    ).bind(card.order_number, file_name).first<{ file_seq: number }>()
    let fileSeq = existing?.file_seq
    if (!fileSeq) {
      const maxRow = await c.env.DB.prepare(
        'SELECT COALESCE(MAX(file_seq), 0) AS m FROM print_file_map WHERE order_number = ?'
      ).bind(card.order_number).first<{ m: number }>()
      fileSeq = (maxRow?.m || 0) + 1
    }

    await c.env.DB.prepare(`
      INSERT INTO print_file_map (order_number, file_seq, card_id, card_number, order_item_id, file_name, entity_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_number, file_seq) DO UPDATE SET
        card_id = excluded.card_id, card_number = excluded.card_number,
        order_item_id = excluded.order_item_id, file_name = excluded.file_name,
        entity_id = excluded.entity_id
    `).bind(card.order_number, fileSeq, card.id, card.card_number, card.order_item_id || null, file_name, mapEntityId).run()

    // 소급: 이 파일명으로 이미 들어온 단건 미매칭 이벤트에 카드를 붙인다.
    // (합판 멤버는 nest_members JSON 이라 갱신하지 않는다 — /unmatched 가 file_map 과 실시간 대조하므로
    //  연결 즉시 목록에서 빠지고, JSON 은 당시 기록으로 남긴다)
    const noExt = String(file_name).replace(/\.[^.]+$/, '')
    // entity_id 도 같이 교정한다 — 입수 시점엔 카드가 안 붙어 deriveCardEntityId 가 법인 1로 디폴트했다.
    // 카드가 확정되는 지금이 진짜 법인을 아는 유일한 시점이라, 여기서 안 고치면 영구히 1로 남는다.
    const back = await c.env.DB.prepare(`
      UPDATE print_events SET card_id = ?, card_number = ?, order_number = ?, entity_id = ?
      WHERE card_id IS NULL AND (file_name = ? OR file_name = ?)
    `).bind(card.id, card.card_number, card.order_number, mapEntityId, file_name, noExt).run()

    return c.json({
      success: true,
      data: {
        file_name, card_id: card.id, card_number: card.card_number,
        order_number: card.order_number, file_seq: fileSeq,
        backfilled_events: back.meta.changes || 0
      }
    })
  } catch (error) {
    console.error('src/routes/printEvents.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default printEventsRouter