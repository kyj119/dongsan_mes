/**
 * clientSegment.ts — 메시지 발송 대상 세그먼트 (법인 × 품목묶음 × 최근 N개월)
 *
 * 왜 필요한가: 발송 대상이 매번 다르다. 명절 공지는 최근 1년 거래처 전체, 단가표 재공지는
 * 해당 품목을 취급한 거래처만 나가야 한다. 거래처가 2,873곳이라 손으로 고를 수 없고,
 * 묶음을 따로따로 발송하면 겹치는 거래처가 여러 번 받고 그만큼 이중 과금된다
 * (실측: UV+솔벤+간판을 따로 보내면 446건, 합치면 251건 — 195건 44% 차이).
 *
 * ★품목묶음이 4개인 이유 (2026-08-25 용준님 확정)
 *   수성·솔벤·UV·간판은 **취급 거래처가 사실상 겹친다** — 간판 거래처 79곳 중 76곳이 출력도
 *   거래한다(간판만 하는 곳은 3곳). 그래서 부문(출력/간판)을 쪼개지 않고 한 묶음으로 둔다.
 *   전사·태극기도 같은 이유로 한 묶음(부문 '전사'와 정확히 일치).
 *   원자재(145곳)와 상품(368곳)은 대상 규모도 안내 내용도 달라 분리한다.
 *
 * ★이 파일이 판정 규칙의 정본이다. SQL 을 라우트로 복사하지 말 것.
 *   부문 손익(`routes/departments.ts` /pnl)은 회계용 4부문(출력·전사·간판·유통)이라 축이 다르다.
 *   같은 규칙처럼 보이지만 목적이 달라 일부러 공유하지 않는다(발송은 "누가 취급하나",
 *   손익은 "어느 팀 매출인가").
 *
 * ★제외 규칙 3가지 — 빠뜨리면 대상이 오염된다
 *   1) 이관 개시잔액 전표(`E{n}-OPEN-####`): order_date=2025-12-31 로 들어와 있다(188건 4.19억).
 *      거래가 아니므로 제외하지 않으면 **실거래가 전혀 없는 48곳이 "최근 1년 거래처"로 잡힌다**.
 *   2) 취소 주문(status='CANCELLED')
 *   3) 비활성 거래처(clients.is_active=0) — 폐업·거래종료
 */

import { normalizePhone } from './messageCompliance'
import { kstDate } from '../utils/kstDate'

/** 품목묶음 키. UI 체크박스와 1:1. */
export type SegmentKey = 'PRINT' | 'TRANSFER' | 'MATERIAL' | 'GOODS' | 'ETC'

export const SEGMENT_KEYS: SegmentKey[] = ['PRINT', 'TRANSFER', 'MATERIAL', 'GOODS', 'ETC']

/** 화면 라벨 — 프론트가 같은 문구를 쓰도록 API 응답에 실어 보낸다(라벨 이중 정의 방지). */
export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  PRINT: '출력·간판',
  TRANSFER: '전사·태극기',
  MATERIAL: '원자재',
  GOODS: '상품',
  ETC: '기타·미분류',
}

/** 각 묶음에 무엇이 들어가는지(툴팁용). 품목 대분류(items.category)·유형(item_type) 기준. */
export const SEGMENT_HINTS: Record<SegmentKey, string> = {
  PRINT: '수성 · 솔벤 · UV · 간판',
  TRANSFER: '전사 · 태극기',
  MATERIAL: '원단 · 자재 직판',
  GOODS: '완제품 · 상품',
  ETC: '품목 미연결 수기 라인 등',
}

/**
 * 주문 라인 → 품목묶음 판정 SQL.
 *
 * 순서가 의미를 갖는다: 대분류(category)로 먼저 가르고, 남은 것을 품목유형(item_type)으로 줍는다.
 * PRODUCT 인데 category='원자재'인 품목이 118개 있어(오분류) item_type 만 보면 이들이 빠진다.
 */
const SEGMENT_CASE_SQL = `
  CASE
    WHEN i.category IN ('수성','솔벤','UV','간판') THEN 'PRINT'
    WHEN i.category IN ('전사','태극기') THEN 'TRANSFER'
    WHEN i.item_type = 'MATERIAL' OR i.category = '원자재' THEN 'MATERIAL'
    WHEN i.item_type = 'GOODS' OR i.category = '상품' THEN 'GOODS'
    ELSE 'ETC'
  END`

/**
 * 이관 개시잔액 전표 식별 마커 — `orders.order_number` 가 `E{법인}-OPEN-####` 형태다.
 *
 * ★품목명('기초채권이월')으로 찾지 않는다. **prod remote D1 에서 한글 부분문자열 매칭이 실패한다** —
 *   로컬 D1(miniflare)에서는 `instr(item_name,'기초채권이월')`이 정상 매칭되는데 prod 에서는 0건이라,
 *   배포 후에야 이월 거래처 48곳이 그대로 대상에 섞이는 것으로 드러났다(2026-08-25 실측).
 *   짧은 한글('기초')은 prod 에서도 매칭돼 길이 의존으로 보이나 원인은 미확정.
 *   ⇒ 한글 리터럴 매칭에 업무 규칙을 걸지 말 것. ASCII 구조 마커가 안전하다.
 *
 * 정합성 실측(2026-08-25 prod): `-OPEN-` 주문 188건 = 이월 라인 보유 주문 188건,
 * 마커 없는 이월 라인 0건, OPEN 주문에 섞인 다른 라인 0건 — 1:1 대응.
 */
const OPENING_BALANCE_ORDER_MARKER = '-OPEN-'

export interface SegmentFilter {
  /** 법인 id 배열. 비었으면 전 법인. */
  entity_ids?: number[]
  /** 품목묶음. 비었으면 전 묶음(= 기간 내 거래가 있는 모든 거래처). */
  segments?: SegmentKey[]
  /** 최근 N개월. 기본 12. */
  months?: number
}

export interface SegmentClient {
  client_id: number
  name: string
  phone: string
  email: string
  /** 이 거래처가 걸린 묶음들 — 명단 검증·matched_reason 근거 */
  segments: SegmentKey[]
  last_order_date: string
  /** 선택 묶음 기준 기간 내 거래액 */
  amount: number
}

export interface SegmentResult {
  clients: SegmentClient[]
  /** 조건에 걸린 거래처 수(번호 중복 제거 전) */
  matched: number
  /** 연락처가 없어 발송 대상에서 빠진 수 */
  no_phone: number
  /** 같은 번호를 쓰는 다른 거래처라 합쳐진 수 */
  merged_duplicate: number
  filter: Required<SegmentFilter>
}

function sanitizeMonths(v: unknown): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n <= 0) return 12
  return Math.min(n, 120)   // 10년 상한 — 오타로 전 기간이 잡히는 것 방지
}

function sanitizeSegments(v: unknown): SegmentKey[] {
  if (!Array.isArray(v)) return []
  const set = new Set(v.map(x => String(x).toUpperCase()))
  return SEGMENT_KEYS.filter(k => set.has(k))
}

function sanitizeEntityIds(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return Array.from(new Set(
    v.map(x => Math.floor(Number(x))).filter(n => Number.isFinite(n) && n > 0)
  ))
}

/** 저장된 filter_json(또는 요청 body)을 안전한 형태로 정규화한다. */
export function parseSegmentFilter(raw: unknown): Required<SegmentFilter> {
  let obj: any = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { obj = {} }
  }
  if (!obj || typeof obj !== 'object') obj = {}
  return {
    entity_ids: sanitizeEntityIds(obj.entity_ids),
    segments: sanitizeSegments(obj.segments),
    months: sanitizeMonths(obj.months),
  }
}

/**
 * 조건으로 발송 대상 거래처를 산출한다.
 *
 * 번호 기준 중복 제거까지 여기서 한다 — 같은 번호를 쓰는 거래처가 여럿이면(실측 14건) 그대로
 * 발송하면 같은 사람이 두 번 받고 두 번 과금된다. 남기는 쪽은 최근 거래일이 늦은 거래처다.
 */
export async function resolveSegment(db: D1Database, rawFilter: unknown): Promise<SegmentResult> {
  const filter = parseSegmentFilter(rawFilter)

  const binds: any[] = []
  let entityClause = ''
  if (filter.entity_ids.length > 0) {
    entityClause = ` AND o.entity_id IN (${filter.entity_ids.map(() => '?').join(',')})`
    binds.push(...filter.entity_ids)
  }

  let segClause = ''
  if (filter.segments.length > 0) {
    segClause = ` WHERE seg IN (${filter.segments.map(() => '?').join(',')})`
  }

  // 기간 컷오프는 KST 업무일 기준 — date('now')는 UTC라 00~09시에 하루 어긋난다.
  const cutoffSql = kstDate(`'-${filter.months} months'`)

  const sql = `
    WITH ln AS (
      SELECT o.client_id AS cid,
             ${SEGMENT_CASE_SQL} AS seg,
             date(COALESCE(o.order_date, o.created_at)) AS d,
             COALESCE(oi.amount, oi.quantity * oi.unit_price) AS amt
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN items i ON i.id = oi.item_id
      WHERE o.status <> 'CANCELLED'
        AND o.client_id IS NOT NULL
        AND instr(COALESCE(o.order_number, ''), ?) = 0
        AND date(COALESCE(o.order_date, o.created_at)) >= ${cutoffSql}${entityClause}
    ),
    ag AS (
      SELECT cid,
             GROUP_CONCAT(DISTINCT seg) AS segs,
             MAX(d) AS last_order_date,
             CAST(SUM(amt) AS INTEGER) AS amount
      FROM ln${segClause}
      GROUP BY cid
    )
    SELECT ag.cid AS client_id, ag.segs, ag.last_order_date, ag.amount,
           c.client_name, c.mobile, c.phone, c.email
    FROM ag
    JOIN clients c ON c.id = ag.cid AND c.is_active = 1
    ORDER BY ag.amount DESC, ag.cid`

  const { results } = await db.prepare(sql)
    .bind(OPENING_BALANCE_ORDER_MARKER, ...binds, ...filter.segments)
    .all<{
      client_id: number; segs: string; last_order_date: string; amount: number
      client_name: string; mobile: string | null; phone: string | null; email: string | null
    }>()

  const rows = results || []
  const clients: SegmentClient[] = []
  const byPhone = new Map<string, number>()   // 정규화번호 → clients 배열 index
  let noPhone = 0
  let mergedDuplicate = 0

  for (const r of rows) {
    const rawPhone = (r.mobile || '').trim() || (r.phone || '').trim()
    const norm = normalizePhone(rawPhone)
    if (!rawPhone || norm.length < 9) { noPhone++; continue }

    const dupIdx = byPhone.get(norm)
    if (dupIdx !== undefined) {
      // 같은 번호 — 최근 거래일이 늦은 쪽을 대표로 남기고 묶음·거래액은 합친다.
      const keep = clients[dupIdx]
      mergedDuplicate++
      if ((r.last_order_date || '') > (keep.last_order_date || '')) {
        keep.client_id = r.client_id
        keep.name = r.client_name || ''
        keep.last_order_date = r.last_order_date || ''
      }
      keep.amount += Number(r.amount) || 0
      for (const s of parseSegs(r.segs)) if (!keep.segments.includes(s)) keep.segments.push(s)
      continue
    }

    byPhone.set(norm, clients.length)
    clients.push({
      client_id: r.client_id,
      name: r.client_name || '',
      phone: rawPhone,
      email: (r.email || '').trim(),
      segments: parseSegs(r.segs),
      last_order_date: r.last_order_date || '',
      amount: Number(r.amount) || 0,
    })
  }

  return {
    clients,
    matched: rows.length,
    no_phone: noPhone,
    merged_duplicate: mergedDuplicate,
    filter,
  }
}

function parseSegs(v: string | null): SegmentKey[] {
  if (!v) return []
  const set = new Set(String(v).split(','))
  return SEGMENT_KEYS.filter(k => set.has(k))
}

/** 멤버 행에 남길 근거 문자열 — "왜 이 거래처가 들어왔는지"를 화면에서 확인할 수 있게 한다. */
export function buildMatchedReason(c: SegmentClient): string {
  // 라벨 자체에 '·'가 들어 있어(출력·간판) 같은 구분자로 이으면 경계가 안 보인다 → '/'로 구분
  const labels = c.segments.map(s => SEGMENT_LABELS[s]).join(' / ')
  const amt = c.amount > 0 ? ` · ${Math.round(c.amount / 10000).toLocaleString()}만원` : ''
  return `${labels || '미분류'} · 최근 ${c.last_order_date || '-'}${amt}`
}
