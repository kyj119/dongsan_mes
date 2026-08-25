/**
 * messageAudience.ts — 대량 발송 수신자 가드 (번호 중복 통합 · 발송 피로도)
 *
 * 발송은 취소가 불가능하고 건당 과금된다. 상한([[messageBulkLimit]])이 "몇 건까지"를 막는다면
 * 여기는 "이 사람에게 지금 보내는 게 맞는가"를 본다.
 *
 * ① **번호 중복 통합** — 같은 번호를 쓰는 거래처가 여럿이면(prod 실측 14건) 그대로 발송 시
 *    같은 사람이 두 번 받고 두 번 과금된다. 품목 묶음을 나눠 보낼 때 특히 크다
 *    (UV+솔벤+간판을 따로 보내면 446건, 합치면 251건 — 44% 차이).
 *    ⚠️ **무조건 통합이 용준님 결정(2026-08-25)**. 다만 본문에 `#{미수금}`처럼 수신자별로 값이
 *    달라지는 변수가 있으면 통합된 쪽 정보는 나가지 않는다 → `mergedWith` 로 누가 합쳐졌는지
 *    남겨 화면 경고·사후 추적이 가능하게 한다(차단은 하지 않는다).
 *
 * ② **발송 피로도** — 최근 N일 안에 이미 받은 번호를 뺀다. 수신거부를 유발하는 게 결국 빈도다.
 *    ⚠️ **출고 안내(`/send-shipment-bulk`)에는 절대 적용하지 않는다** — 업무 필수 통지이고
 *    이미 shipment_id 기준 자체 dedup 이 있다. 여기에 빈도 가드를 걸면 배송 안내가 조용히 사라진다.
 *    적용 대상 = 광고(`/ad/send`) · 일반 대량(`/send-bulk`) · SMS 대량(`/send-sms-bulk`).
 */

import { normalizePhone } from './messageCompliance'

/** settings 키 — 0 이하면 피로도 가드를 끈다. */
const FATIGUE_SETTING_KEY = 'message_fatigue_days'
const FATIGUE_DAYS_DEFAULT = 30

export interface AudienceGuardOptions {
  /** 피로도 가드 사용 여부. 업무 통지 경로는 false. */
  fatigue?: boolean
}

export interface AudienceGuardResult<T> {
  /** 실제로 보낼 대상 */
  kept: T[]
  /** 같은 번호라 합쳐져 빠진 대상 */
  duplicates: T[]
  /** 최근 발송 이력으로 빠진 대상 */
  fatigued: T[]
  /** 적용된 피로도 기준일(0 = 미적용) */
  fatigueDays: number
  /** 정규화번호 → 합쳐진 쪽 이름들. 통합으로 무엇이 가려졌는지 추적용 */
  mergedWith: Record<string, string[]>
}

/**
 * 피로도 기준일을 읽는다. 0 이하 = 가드 끔.
 * 설정이 없으면 기본 30일.
 */
export async function resolveFatigueDays(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT setting_value FROM settings WHERE setting_key = ?')
    .bind(FATIGUE_SETTING_KEY).first<{ setting_value: string }>()
  if (!row) return FATIGUE_DAYS_DEFAULT
  const n = Math.floor(Number(row.setting_value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 365)
}

/**
 * 최근 N일 안에 **성공** 발송된 번호 집합.
 *
 * 소스는 `message_send_recipients`(마이그 0543) — `kakao_send_logs` 는 대량 발송을 `BULK(N)`
 * 한 줄로만 남겨 **누구에게 보냈는지가 없다**. 그 테이블을 보면 피로도 가드가 개별 발송만
 * 걸러내고 정작 막아야 할 판촉 대량 발송은 그대로 통과한다.
 *
 * 실패(FAILED)는 도달하지 않았으므로 피로도에 넣지 않는다 — 실패했다고 재발송을 막으면
 * 장애 복구 발송이 불가능해진다.
 * `created_at` 은 UTC 저장이고 기준도 UTC 상대시간이라 KST 보정이 필요 없다(기간 계산).
 */
async function fetchRecentlySent(db: D1Database, phones: string[], days: number): Promise<Set<string>> {
  const sent = new Set<string>()
  if (days <= 0 || phones.length === 0) return sent

  const uniq = Array.from(new Set(phones.filter(p => p.length >= 9)))
  // D1 바인드 한도 → 80개 청크 [[d1-bind-param-limit]]
  for (let i = 0; i < uniq.length; i += 80) {
    const chunk = uniq.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db.prepare(`
      SELECT DISTINCT phone_norm
      FROM message_send_recipients
      WHERE phone_norm IN (${ph})
        AND status = 'SUCCESS'
        AND created_at >= datetime('now', ?)
    `).bind(...chunk, `-${days} days`).all<{ phone_norm: string }>()
    for (const r of results || []) if (r.phone_norm) sent.add(r.phone_norm)
  }
  return sent
}

export interface RecipientRecord {
  phone: string
  name?: string
  clientId?: number | null
  /** 건별 결과. 판정 불가면 생략 → 대표 상태를 따른다. */
  ok?: boolean
}

/**
 * 대량 발송의 수신자별 이력을 남긴다. 피로도 가드의 데이터 소스이자
 * "누가 받았는가"의 유일한 기록이다(대표 로그는 `BULK(N)` 한 줄뿐).
 *
 * 실패해도 발송 자체를 되돌릴 수 없으므로 **기록 실패가 응답을 막지 않는다** — 호출부는
 * await 하되 예외를 삼킨다. 여기서 던지면 이미 나간 발송이 에러로 보고된다.
 */
export async function recordBulkRecipients(db: D1Database, params: {
  logId: number | null
  items: RecipientRecord[]
  channel: string
  messageType?: 'INFO' | 'AD'
  entityId?: number | null
  defaultOk?: boolean
}): Promise<number> {
  const rows = params.items
    .map(x => ({ ...x, norm: normalizePhone(x.phone || '') }))
    .filter(x => x.norm.length >= 9)
  if (rows.length === 0) return 0

  const type = params.messageType || 'INFO'
  const defaultStatus = params.defaultOk === false ? 'FAILED' : 'SUCCESS'

  // 행당 바인드 8개 → 12행씩(한도 100) [[d1-bind-param-limit]]
  const ROWS_PER_STMT = 12
  const stmts = []
  for (let i = 0; i < rows.length; i += ROWS_PER_STMT) {
    const chunk = rows.slice(i, i + ROWS_PER_STMT)
    const values = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
    const binds: any[] = []
    for (const x of chunk) {
      binds.push(
        params.logId ?? null,
        x.norm,
        x.clientId ?? null,
        x.name || null,
        params.channel,
        type,
        x.ok === undefined ? defaultStatus : (x.ok ? 'SUCCESS' : 'FAILED'),
        params.entityId ?? null,
      )
    }
    stmts.push(
      db.prepare(
        `INSERT INTO message_send_recipients
           (log_id, phone_norm, client_id, receiver_name, channel, message_type, status, entity_id)
         VALUES ${values}`
      ).bind(...binds)
    )
  }
  for (let i = 0; i < stmts.length; i += 20) {
    await db.batch(stmts.slice(i, i + 20))
  }
  return rows.length
}

/**
 * 수신자 목록에 가드를 적용한다.
 *
 * @param getPhone 수신자에서 전화번호를 꺼내는 함수 — 경로마다 필드명이 달라(phone·rcv·num) 주입받는다.
 * @param getName  표시용 이름(통합 추적에 쓰인다). 없으면 생략 가능.
 */
export async function applyAudienceGuards<T>(
  db: D1Database,
  items: T[],
  getPhone: (x: T) => string,
  getName?: (x: T) => string,
  opts: AudienceGuardOptions = {}
): Promise<AudienceGuardResult<T>> {
  const useFatigue = opts.fatigue !== false
  const fatigueDays = useFatigue ? await resolveFatigueDays(db) : 0

  // ── ① 번호 중복 통합 (입력 순서상 먼저 온 쪽을 대표로 남긴다) ──
  const seen = new Map<string, T>()
  const deduped: T[] = []
  const duplicates: T[] = []
  const mergedWith: Record<string, string[]> = {}

  for (const it of items) {
    const norm = normalizePhone(getPhone(it) || '')
    if (!norm) { deduped.push(it); continue }   // 번호를 못 읽으면 판단하지 않고 통과
    if (seen.has(norm)) {
      duplicates.push(it)
      if (getName) {
        if (!mergedWith[norm]) mergedWith[norm] = []
        mergedWith[norm].push(getName(it) || '')
      }
      continue
    }
    seen.set(norm, it)
    deduped.push(it)
  }

  // ── ② 피로도 ──
  if (fatigueDays <= 0) {
    return { kept: deduped, duplicates, fatigued: [], fatigueDays: 0, mergedWith }
  }

  const recentlySent = await fetchRecentlySent(db, deduped.map(x => normalizePhone(getPhone(x) || '')), fatigueDays)
  const kept: T[] = []
  const fatigued: T[] = []
  for (const it of deduped) {
    const norm = normalizePhone(getPhone(it) || '')
    if (norm && recentlySent.has(norm)) fatigued.push(it)
    else kept.push(it)
  }

  return { kept, duplicates, fatigued, fatigueDays, mergedWith }
}

/** 화면·로그에 쓸 한 줄 요약. 빠진 게 없으면 빈 문자열. */
export function describeGuardResult(r: { duplicates: unknown[]; fatigued: unknown[]; fatigueDays: number }): string {
  const parts: string[] = []
  if (r.duplicates.length > 0) parts.push(`같은 번호 ${r.duplicates.length}건 통합`)
  if (r.fatigued.length > 0) parts.push(`최근 ${r.fatigueDays}일 내 발송 ${r.fatigued.length}건 제외`)
  return parts.join(' · ')
}
