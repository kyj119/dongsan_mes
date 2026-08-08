/**
 * purchaseOrders/listFilter.ts — 발주 목록 조회조건 SSOT (2026-08-08)
 *
 * 주문(orders/listFilter.ts)과 같은 이유로 만들었다: 같은 WHERE 가 목록·카운트·CSV 에 복사돼 있고
 * 통계(/stats)는 법인·법인간거래만 보고 기간·검색·공급처를 무시해, 상단 카드와 목록이 어긋났다.
 * (감사: docs/audits/2026-08-08-list-ux-ecount-gap.md G1)
 *
 * ⚠️ 조건 추가는 이 파일에서만. 호출부에 직접 붙이면 다시 갈라진다.
 * ⚠️ FROM 절에 `purchase_orders po LEFT JOIN clients c` 가 있어야 한다(search 가 c.client_name 참조).
 */
import type { Context } from 'hono'
import type { HonoEnv } from '../../types/env'
import { entityFilter } from '../../utils/entityFilter'
import { excludePurchaseNonCounterpartiesSql } from '../../constants/intercompany'
import { kstYmd } from '../../utils/kstDate'

export interface PoListFilterOptions {
  /** 상태 조건을 빼고 조립 — 통계 카드는 '상태별 분포'라 자기 자신으로 걸러지면 안 된다 */
  skipStatus?: boolean
}

export interface PoListFilterResult {
  where: string
  params: unknown[]
}

/**
 * 정렬 SSOT — 목록과 CSV 공유.
 * ⚠️ 모든 옵션에 고유키(po.id) tie-break 필수. 이관/배치 INSERT 는 created_at 이 초 단위까지 동일해
 *   (prod 발주 258건 중 241건 동일) tie-break 없으면 동값 구간이 rowid ASC = 오래된 순으로 뒤집힌다.
 *   기본은 업무일자(order_date) — created_at 은 이관 실행 시각이라 업무상 무의미.
 */
export const PO_SORT_OPTIONS: Record<string, string> = {
  'order_date_desc': 'po.order_date DESC, po.id DESC',
  'order_date_asc': 'po.order_date ASC, po.id ASC',
  'created_at_desc': 'po.created_at DESC, po.id DESC',
  'created_at_asc': 'po.created_at ASC, po.id ASC',
  'expected_date_asc': 'po.expected_date IS NULL, po.expected_date ASC, po.id DESC',
  'expected_date_desc': 'po.expected_date IS NULL, po.expected_date DESC, po.id DESC',
  'final_amount_desc': 'po.final_amount DESC, po.id DESC',
  'final_amount_asc': 'po.final_amount ASC, po.id ASC',
  'supplier_name_asc': 'c.client_name IS NULL, c.client_name ASC, po.id DESC',
  'po_number_asc': 'po.po_number ASC, po.id ASC',
}
export const PO_SORT_DEFAULT = 'order_date_desc'

export function resolvePoSort(sort: string | undefined): string {
  return PO_SORT_OPTIONS[sort || ''] || PO_SORT_OPTIONS[PO_SORT_DEFAULT]
}

export function buildPoListFilter(c: Context<HonoEnv>, opts: PoListFilterOptions = {}): PoListFilterResult {
  const {
    status = '', search = '', date_from = '', date_to = '', supplier_id = '',
    overdue = '', receiving = '', include_intercompany = '',
  } = c.req.query()

  const clauses: string[] = []
  const params: unknown[] = []

  // 입고 페이지(receiving=1)는 '입고 대상'이 곧 상태 조건이라 상태 선택을 덮어쓴다
  if (receiving === '1') {
    clauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED')")
  } else if (status && !opts.skipStatus) {
    const wanted = status.split(',').map(s => s.trim()).filter(Boolean)
    if (wanted.length === 1) {
      clauses.push('po.status = ?')
      params.push(wanted[0])
    } else if (wanted.length > 1) {
      clauses.push(`po.status IN (${wanted.map(() => '?').join(',')})`)
      params.push(...wanted)
    }
  }

  if (search) {
    clauses.push('(po.po_number LIKE ? OR c.client_name LIKE ?)')
    const p = `%${search}%`
    params.push(p, p)
  }

  if (date_from) { clauses.push('po.order_date >= ?'); params.push(date_from) }
  if (date_to) { clauses.push('po.order_date <= ?'); params.push(date_to) }

  if (supplier_id) { clauses.push('po.supplier_id = ?'); params.push(parseInt(supplier_id)) }

  // 납기 지연: 미완료 + 입고예정일 경과. KST 기준일은 헬퍼로 바인드(date('now') 직접 사용 금지 규약)
  if (overdue === '1') {
    clauses.push("po.status IN ('CONFIRMED', 'PARTIAL_RECEIVED') AND po.expected_date IS NOT NULL AND po.expected_date < ?")
    params.push(kstYmd())
  }

  // 법인간거래(내부법인 3사) + 관계 사업자 기본 제외 — AP 집계가 이미 전수 제외하고 있어
  //   목록에만 보이면 기준 불일치(SSOT = excludePurchaseNonCounterpartiesSql).
  //   ⚠️ receiving=1(입고)은 제외 대상 아님 — 실물 업무라 숨기면 입고 누락. (2026-07-27)
  if (include_intercompany !== '1' && receiving !== '1') {
    clauses.push(excludePurchaseNonCounterpartiesSql('po.supplier_id').replace(' AND ', ''))
  }

  const ef = entityFilter(c, 'po')
  if (ef.clause) {
    clauses.push(ef.clause.replace(' AND ', ''))
    params.push(...ef.params)
  }

  return {
    where: clauses.length > 0 ? ' WHERE ' + clauses.join(' AND ') : '',
    params,
  }
}
