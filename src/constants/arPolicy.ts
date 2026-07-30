// AR(미수금) 정책 제외 SSOT — 2026-07-31
//
// 기타거래처(client_code '000-00-00000') = 현금·카드 소매 더미 거래처.
//   이카운트 이관 결정(INSPECTION.md §⑧-5, 용준님 2026-07-30): 매출·수금·기초·차액은 정상 적재하되
//   ① 미수금 산정(AR 목록/합계/연체/리스크)에서 제외 — 소매 현금거래라 채권 개념이 없고,
//     장부상 잔액(단수차·차액 누적)이 미수로 표시되면 독촉·리스크가 오작동한다.
//   ② 세금계산서 대상 제외 — 실사업자번호가 없어 발행 불가.
//     후보 제외는 invoice_method='CARD'(발행X,카드결재)가 이미 담당(eligible-orders/monthly-eligible의
//     CARD 필터) → 코드 측은 직접 발행 경로 가드만 추가.
//
// ⚠️ 매출/원장(거래처원장·매출 집계)에서는 제외하지 않는다 — 실매출이다. 제외 범위는 AR 화면·집계뿐.
// ⚠️ 법인간거래 제외(excludeInternalClientsSql)와 의미가 다르다: 내부 3사는 회계허브 탭이 흡수하지만,
//    기타거래처는 어디로도 흡수되지 않는 '채권 비대상'이다.
import { excludeInternalClientsSql } from './intercompany'

/** 현금·카드 소매 더미 거래처 코드 (clients.client_code) */
export const CASH_RETAIL_CLIENT_CODE = '000-00-00000'

/**
 * SQL 조각: 현금소매 더미 거래처를 AR 집계에서 제외.
 * id 하드코딩 대신 client_code 서브셀렉트 — 로컬/신규 D1에서도 동일 동작(코드가 SSOT).
 * clientIdColumn = client_id 를 담은 컬럼 표현식(예: 'c.id', 'o.client_id', 'client_id').
 */
export function excludeCashRetailClientSql(clientIdColumn = 'c.id'): string {
  return ` AND ${clientIdColumn} NOT IN (SELECT id FROM clients WHERE client_code = '${CASH_RETAIL_CLIENT_CODE}')`
}

/**
 * AR 집계 공용 제외 = 내부법인(회계허브 흡수) + 현금소매 더미.
 * 미수금/연체/리스크/재무보고 AR 계열은 전부 이걸 쓴다(내부법인 단독 제외는 AP·발주 계열에만 남김).
 */
export function excludeArExcludedClientsSql(clientIdColumn = 'c.id'): string {
  return excludeInternalClientsSql(clientIdColumn) + excludeCashRetailClientSql(clientIdColumn)
}

/**
 * 더미 사업자번호(000-00-00000) 판정 — 세금계산서 발행 가드용.
 * all-zero 는 국세청 체크섬을 "통과"하므로 형식 검사로는 못 거른다(이관 §⑧-1 실측).
 * 하이픈 유무 무관 비교.
 */
export function isCashRetailBrn(brn: string | null | undefined): boolean {
  if (!brn) return false
  return brn.replace(/\D/g, '') === CASH_RETAIL_CLIENT_CODE.replace(/\D/g, '')
}
