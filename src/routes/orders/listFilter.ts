/**
 * orders/listFilter.ts — 주문 목록 조회조건 SSOT (2026-08-08)
 *
 * 왜 만들었나: 같은 WHERE 조건이 목록(core.ts)·카운트(core.ts)·CSV(queries.ts)에 3벌 복사돼 있었고,
 * 통계(/stats)는 아예 조건 없이 전량을 세고 있었다. 그래서 화면 상단 "전체 주문"과 하단 "총 N건"이
 * 구조적으로 일치할 수 없었다(감사: docs/audits/2026-08-08-list-ux-ecount-gap.md G1).
 * 조회조건을 여기 한 곳에서만 조립해 네 경로가 같은 모집단을 보도록 한다.
 *
 * ⚠️ 조건을 추가할 때는 반드시 이 파일만 고친다. 호출부에 조건을 직접 붙이면 다시 갈라진다.
 * ⚠️ FROM 절에 `orders o LEFT JOIN clients c` 가 있어야 한다(search 가 c.client_name 을 참조).
 */
import type { Context } from 'hono'
import type { HonoEnv } from '../../types/env'
import { orderVisibilityFilter } from '../../utils/entityFilter'
import { kstYmd } from '../../utils/kstDate'

/**
 * 정렬 SSOT — 목록과 CSV 가 같은 표를 쓴다.
 * 이전에는 CSV 에 4개짜리 사본이 따로 있어, 목록에서 고른 정렬이 CSV 에서 조용히 기본값으로 떨어졌다.
 *
 * ⚠️ 정렬 규약(CLAUDE.md): 모든 옵션에 고유키(o.id) tie-break 필수.
 *   이관 주문은 created_at 이 'order_date 09:00:00' 로 고정돼 동값 군집이 최대 29건 →
 *   tie-break 없으면 군집 내부가 id ASC↔DESC 로 반전되고 LIMIT/OFFSET 페이징에서 행 중복·누락이 발생.
 *   NULL 처리는 D1 방언(NULLS LAST) 대신 `col IS NULL` 선행 정렬.
 */
/**
 * 출고 기준일 — `shipped_at` 이 정본이나 2026-07 이관분 1,420건이 비어 있어(전량 7월) 주문일로 대체한다.
 * ⚠️ 대체 사실은 화면에서 숨기지 않는다: 행에 「주문일 대체」 배지 + 결측 건수를 summary 로 내려 경고 칩에 띄운다.
 *   조용히 메우면 「출고일」 열의 14%가 실제로는 주문일이 되어 집계가 말없이 왜곡된다.
 *   설계 = docs/specs/2026-08-09-shipment-history-list.md §2-2
 */
export const SHIP_DATE_EXPR = 'COALESCE(o.shipped_at, o.order_date)'

/**
 * 출고일이 **추정치**인지 판별하는 지문.
 * 이 시스템에 실제 출고시각은 (2026-08-09 실측) **0건**이다 — 이카운트 원본에 출고일 항목 자체가 없어
 * 이관 백필(0520·0527)이 `order_date 00:00:00` 을 넣었다. NULL 이거나 이 패턴이면 추정치다.
 * 실제 출고 시각이 기록되기 시작하면 시분초가 00:00:00 이 아니게 되어 자동으로 빠진다.
 */
export const SHIP_DATE_ESTIMATED_SQL =
  "(o.shipped_at IS NULL OR o.shipped_at = o.order_date || ' 00:00:00')"

/**
 * 회계 전표성 주문 — 기초채권 이월(`*OPEN*`)·법인간 미러(`ICM-*`). prod 195건(5.4억)이 status=SHIPPED 다.
 * 실제 출고가 아니므로 출고 이력에서 제외한다(안 하면 "2025-12-31 출고 5.3억"이 뜬다).
 * ⚠️ 명명 규칙 의존은 이관 규칙이 바뀌면 깨진다 — `orders.is_voucher` 플래그 신설이 후속 과제(§7).
 */
export const VOUCHER_ORDER_SQL = "(o.order_number LIKE 'ICM-%' OR o.order_number LIKE '%OPEN%')"

export const ORDER_SORT_OPTIONS: Record<string, string> = {
  // 업무일자(주문일) 기준 — 기본값. created_at 은 이관분에서 '이관 실행 시각'이라 업무상 무의미하다.
  'order_date_desc': 'o.order_date IS NULL, o.order_date DESC, o.id DESC',
  'order_date_asc': 'o.order_date IS NULL, o.order_date ASC, o.id ASC',
  'created_at_desc': 'o.created_at DESC, o.id DESC',
  'created_at_asc': 'o.created_at ASC, o.id ASC',
  'delivery_date_asc': 'o.delivery_date IS NULL, o.delivery_date ASC, o.id DESC',
  'delivery_date_desc': 'o.delivery_date IS NULL, o.delivery_date DESC, o.id DESC',
  'final_amount_desc': 'o.final_amount DESC, o.id DESC',
  'final_amount_asc': 'o.final_amount ASC, o.id ASC',
  'client_name_asc': 'c.client_name IS NULL, c.client_name ASC, o.id DESC',
  // 출고 이력용 — 출고일(미기록분은 주문일) 기준
  'ship_date_desc': `${SHIP_DATE_EXPR} IS NULL, ${SHIP_DATE_EXPR} DESC, o.id DESC`,
  'ship_date_asc': `${SHIP_DATE_EXPR} IS NULL, ${SHIP_DATE_EXPR} ASC, o.id ASC`,
  'priority_desc': "CASE WHEN o.priority = 'URGENT' THEN 0 ELSE 1 END, o.delivery_date IS NULL, o.delivery_date ASC, o.id DESC",
}
export const ORDER_SORT_DEFAULT = 'order_date_desc'

/** 정렬 키 → ORDER BY 절. 알 수 없는 키는 기본값으로 (SQL 주입 차단 = 화이트리스트) */
export function resolveOrderSort(sort: string | undefined): string {
  return ORDER_SORT_OPTIONS[sort || ''] || ORDER_SORT_OPTIONS[ORDER_SORT_DEFAULT]
}

export interface OrderListFilterOptions {
  /**
   * 상태(status) 조건을 빼고 조립한다.
   * 통계 카드는 "현재 스코프의 상태별 분포"라서 자기 자신(상태)으로 걸러지면 안 된다.
   */
  skipStatus?: boolean
}

export interface OrderListFilterResult {
  /** '' 또는 ' WHERE a AND b' — 쿼리에 그대로 이어붙인다 */
  where: string
  params: unknown[]
}

/** 사용자가 실제로 좁혀놓은 조건이 있는지 (캡션·칩 표기 판단용) */
export function hasActiveOrderFilter(c: Context<HonoEnv>): boolean {
  const q = c.req.query()
  return Boolean(q.search || q.date_from || q.date_to || q.priority || q.delivery_method || q.billing_status || q.overdue === '1' || q.amount_min || q.amount_max)
}

export function buildOrderListFilter(c: Context<HonoEnv>, opts: OrderListFilterOptions = {}): OrderListFilterResult {
  const {
    status = '', search = '', date_from = '', date_to = '', exclude_status = '',
    priority = '', amount_min = '', amount_max = '', delivery_method = '',
    billing_status = '', overdue = '',
    ship_date_from = '', ship_date_to = '', exclude_vouchers = '',
  } = c.req.query()

  const clauses: string[] = []
  const params: unknown[] = []

  // 주문 가시성 (멀티법인 협업): 소유(청구) 법인 + 담당 품목 보유 법인. ADMIN/코디네이터는 전체.
  const ef = orderVisibilityFilter(c, 'o')
  if (ef.params.length > 0) {
    clauses.push(ef.clause.replace(' AND ', ''))
    params.push(...ef.params)
  }

  // 상태는 복수 허용(콤마) — 통계 카드 '생산중' = PRINTING,PRINT_DONE 드릴다운용
  if (status && !opts.skipStatus) {
    const wanted = status.split(',').map(s => s.trim()).filter(Boolean)
    if (wanted.length === 1) {
      clauses.push('o.status = ?')
      params.push(wanted[0])
    } else if (wanted.length > 1) {
      clauses.push(`o.status IN (${wanted.map(() => '?').join(',')})`)
      params.push(...wanted)
    }
  }

  // 검색: 주문번호 · 거래처명 · 품목명 (#4 재주문 재검색 편의)
  if (search) {
    clauses.push('(o.order_number LIKE ? OR c.client_name LIKE ? OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.item_name LIKE ?))')
    const p = `%${search}%`
    params.push(p, p, p)
  }

  if (date_from) { clauses.push('o.order_date >= ?'); params.push(date_from) }
  if (date_to) { clauses.push('o.order_date <= ?'); params.push(date_to) }

  // 출고 기준일 범위 (출고 이력 탭). shipped_at 은 DATETIME 이라 to 는 하루 끝까지 열어야
  //   '2026-06-30 14:00' 이 '2026-06-30' 조회에서 빠지지 않는다.
  if (ship_date_from) { clauses.push(`${SHIP_DATE_EXPR} >= ?`); params.push(ship_date_from) }
  if (ship_date_to) { clauses.push(`${SHIP_DATE_EXPR} <= ?`); params.push(ship_date_to + ' 23:59:59') }

  // 회계 전표성 주문 제외 — 옵트인. 기본 주문 목록의 동작은 바꾸지 않는다.
  if (exclude_vouchers === '1') clauses.push(`NOT ${VOUCHER_ORDER_SQL}`)

  if (exclude_status) {
    const excludes = exclude_status.split(',').map(s => s.trim()).filter(Boolean)
    if (excludes.length === 1) {
      clauses.push('o.status != ?')
      params.push(excludes[0])
    } else if (excludes.length > 1) {
      clauses.push(`o.status NOT IN (${excludes.map(() => '?').join(',')})`)
      params.push(...excludes)
    }
  }

  if (priority) { clauses.push('o.priority = ?'); params.push(priority) }

  // 금액 범위 — NaN 이 바인드되지 않도록 유효값만 (기존 카운트 쿼리는 가드가 없어 목록과 갈렸다)
  if (amount_min) {
    const min = parseFloat(amount_min)
    if (!isNaN(min)) { clauses.push('o.final_amount >= ?'); params.push(min) }
  }
  if (amount_max) {
    const max = parseFloat(amount_max)
    if (!isNaN(max)) { clauses.push('o.final_amount <= ?'); params.push(max) }
  }

  if (delivery_method) { clauses.push('o.delivery_method = ?'); params.push(delivery_method) }

  if (billing_status) {
    if (billing_status === 'NONE') {
      clauses.push("(o.billing_status IS NULL OR o.billing_status = '')")
    } else {
      clauses.push('o.billing_status = ?')
      params.push(billing_status)
    }
  }

  // 출고지연: 납기일 경과 + 미출고. KST 기준일은 헬퍼로 바인드 (date('now') 직접 사용 금지 규약)
  if (overdue === '1') {
    clauses.push("o.delivery_date IS NOT NULL AND o.delivery_date != '' AND o.delivery_date < ? AND o.status NOT IN ('SHIPPED','COMPLETED','CANCELLED','QUOTATION')")
    params.push(kstYmd())
  }

  return {
    where: clauses.length > 0 ? ' WHERE ' + clauses.join(' AND ') : '',
    params,
  }
}
