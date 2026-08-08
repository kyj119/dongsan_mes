/**
 * quotationsListFilter.ts — 견적 목록 조회조건 SSOT (2026-08-08)
 *
 * 주문·발주와 같은 이유(감사 G1): WHERE 가 목록·카운트에 복사돼 있고 통계는 기간을 무시했다.
 * 이식 중 추가로 발견한 결함 2건도 여기서 해소한다 —
 *   ① 화면의 '작성일 from/to' 입력이 서버·클라 어디에서도 읽히지 않는 **죽은 필터**였다.
 *   ② '부분주문' 상태는 현재 페이지 행만 걸러내 총건수·합계와 어긋났다 → 서버 조건으로 승격.
 *
 * ⚠️ FROM 절에 `quotations q LEFT JOIN clients c` 가 있어야 한다(search 가 c.client_name 참조).
 */
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { entityFilter } from '../utils/entityFilter'

export interface QuotListFilterOptions {
  /** 상태 조건 제외 — 통계 카드는 '상태별 분포'라 자기 자신으로 걸러지면 안 된다 */
  skipStatus?: boolean
}

export interface QuotListFilterResult {
  where: string
  params: unknown[]
}

/** 정렬 SSOT — 모든 옵션에 고유키(q.id) tie-break 필수 (CLAUDE.md 정렬 규약) */
export const QUOT_SORT_OPTIONS: Record<string, string> = {
  // 기본 = 업무일자(견적일). created_at 은 이관분에서 '이관 실행 시각'이라 업무상 무의미
  'quotation_date_desc': 'q.quotation_date IS NULL, q.quotation_date DESC, q.id DESC',
  'quotation_date_asc': 'q.quotation_date IS NULL, q.quotation_date ASC, q.id ASC',
  'created_desc': 'q.created_at DESC, q.id DESC',
  'created_asc': 'q.created_at ASC, q.id ASC',
  'valid_asc': 'q.valid_until IS NULL, q.valid_until ASC, q.id DESC',
  'valid_desc': 'q.valid_until IS NULL, q.valid_until DESC, q.id DESC',
  'amount_desc': 'q.final_amount DESC, q.id DESC',
  'amount_asc': 'q.final_amount ASC, q.id ASC',
  'client_name_asc': 'c.client_name IS NULL, c.client_name ASC, q.id DESC',
}
export const QUOT_SORT_DEFAULT = 'quotation_date_desc'

export function resolveQuotSort(sort: string | undefined): string {
  return QUOT_SORT_OPTIONS[sort || ''] || QUOT_SORT_OPTIONS[QUOT_SORT_DEFAULT]
}

export function buildQuotListFilter(c: Context<HonoEnv>, opts: QuotListFilterOptions = {}): QuotListFilterResult {
  const {
    status = '', search = '', client_id = '', date_from = '', date_to = '', has_orders = '',
  } = c.req.query()

  const clauses: string[] = []
  const params: unknown[] = []

  if (status && !opts.skipStatus) {
    const wanted = status.split(',').map(s => s.trim()).filter(Boolean)
    if (wanted.length === 1) {
      clauses.push('q.status = ?')
      params.push(wanted[0])
    } else if (wanted.length > 1) {
      clauses.push(`q.status IN (${wanted.map(() => '?').join(',')})`)
      params.push(...wanted)
    }
  }

  if (client_id) { clauses.push('q.client_id = ?'); params.push(Number(client_id)) }

  if (search) {
    clauses.push('(q.quotation_number LIKE ? OR c.client_name LIKE ?)')
    const p = `%${search}%`
    params.push(p, p)
  }

  // 작성일(견적일) 범위 — 화면에 입력칸이 있는데 서버가 받지 않아 동작하지 않던 조건
  if (date_from) { clauses.push('q.quotation_date >= ?'); params.push(date_from) }
  if (date_to) { clauses.push('q.quotation_date <= ?'); params.push(date_to) }

  // 주문 생성 여부 — '부분주문' 상태 표시의 정본. 클라에서 페이지 행만 거르면 총건수·합계가 어긋난다.
  if (has_orders === '1') {
    clauses.push('EXISTS (SELECT 1 FROM orders o WHERE o.quotation_id = q.id)')
  } else if (has_orders === '0') {
    clauses.push('NOT EXISTS (SELECT 1 FROM orders o WHERE o.quotation_id = q.id)')
  }

  const ef = entityFilter(c, 'q')
  if (ef.clause) {
    clauses.push(ef.clause.replace(' AND ', ''))
    params.push(...ef.params)
  }

  return {
    where: clauses.length > 0 ? ' WHERE ' + clauses.join(' AND ') : '',
    params,
  }
}
