// 내부 관계사(그룹 법인) 매핑 단일 소스(SSOT) — 2026-07-20
// ⚠️ entity_id ↔ 그 법인을 가리키는 clients 행(거래처)의 매핑. 3법인 고정 현실이라 하드코딩.
//    (prod client id 조사값: 동산기획=53, 선명=1271, 청주=3757 — cron.ts 미러 대사가 쓰던 값 이관)
//
// 이 매핑을 참조하는 곳(재하드코딩 금지):
//   - src/routes/cron.ts            : 내부 관계사 채권·채무 미러 대사(일 1회 대사 알림)
//   - src/utils/intercompany.ts     : deriveIntercompanyPositions(주문·매입 기반 파생)
//   - AR 집계 전반                  : 내부법인을 일반 미수금/원장/연체 목록에서 제외(excludeInternalClientsSql)
//   - src/routes/accounting.ts      : 회계허브 법인간거래 탭(파생 채권·채무 흡수)
//
// 설계: 내부법인 간 거래는 일반 거래처원장·미수금 목록에서 노출하지 않고,
//       회계허브 > 법인간거래 탭 한 곳에서 통합 확인(정보 손실 없이 창구 일원화, 2026-07-20).

export interface IntercompanyEntity {
  entityId: number
  clientId: number
  name: string
}

// 내부 관계사 3사. entityId = entities.id, clientId = 그 법인을 가리키는 clients.id.
export const INTERCOMPANY_ENTITIES: IntercompanyEntity[] = [
  { entityId: 1, clientId: 53,   name: '동산기획' },
  { entityId: 2, clientId: 1271, name: '선명' },
  { entityId: 3, clientId: 3757, name: '청주' },
]

// 내부법인을 가리키는 거래처 id 집합 — 일반 AR(미수금/원장/연체/정합성) 집계에서 제외 대상.
export const INTERNAL_ENTITY_CLIENT_IDS: number[] = INTERCOMPANY_ENTITIES.map(e => e.clientId)

// 내부 관계사 entity id 집합.
export const INTERCOMPANY_ENTITY_IDS: number[] = INTERCOMPANY_ENTITIES.map(e => e.entityId)

/**
 * SQL 조각: 내부법인 거래처를 집계에서 제외한다.
 *   `AND <clientIdColumn> NOT IN (53,1271,3757)`
 * clientIdColumn = client_id 를 담은 컬럼 표현식(예: 'c.id', 'o.client_id', 'p.client_id', 'client_id').
 * 값이 신뢰된 정수 상수라 bind 파라미터 없이 리터럴로 인라인(bind 한도·순서 영향 없음).
 * 집합이 비면 빈 문자열(안전).
 */
export function excludeInternalClientsSql(clientIdColumn = 'c.id'): string {
  if (INTERNAL_ENTITY_CLIENT_IDS.length === 0) return ''
  return ` AND ${clientIdColumn} NOT IN (${INTERNAL_ENTITY_CLIENT_IDS.join(',')})`
}

/** clientId → 내부법인 매핑(내부법인 아니면 undefined). */
export function internalEntityByClientId(clientId: number): IntercompanyEntity | undefined {
  return INTERCOMPANY_ENTITIES.find(e => e.clientId === clientId)
}

/** entityId → 그 법인을 가리키는 clients.id(없으면 undefined). */
export function clientIdOfEntity(entityId: number): number | undefined {
  return INTERCOMPANY_ENTITIES.find(e => e.entityId === entityId)?.clientId
}

/** 해당 거래처가 내부법인(그룹 3사 중 하나)인지. */
export function isInternalEntityClient(clientId: number | string | null | undefined): boolean {
  if (clientId == null) return false
  return INTERNAL_ENTITY_CLIENT_IDS.includes(Number(clientId))
}

// ─────────────────────────────────────────────────────────────────────────────
// 관계 사업자(affiliate) — 2026-08-07
//
// ⚠️ 위 INTERCOMPANY_ENTITIES 와 **성격이 다르다.** 재사용하면 안 된다.
//   · 내부법인 3사 : entity_id 가 있고 매출·매입 **양쪽**이 미러링된다 → AR·AP 양쪽 제외 + 회계허브 탭이 흡수
//   · 관계 사업자  : entity_id 가 **없고** AR 도 0건이다. 나간 돈이 매입이 아니라 **자금이동**이라
//                    **매입·원가·AP 에서만** 제외한다. 흡수할 미러 상대가 없으니 회계허브 탭 대상도 아니다.
//
// 오다플래그(client 1655 · 889-16-02571 · 대표 안혜옥): 2026년 발주 9건 129,466,420(공급가 117,696,745).
//   전부 통장 출금 역산으로 만든 PO 라 품목 라인이 없다(`E1-PO-BK-1655-*` · internal_notes 에 마커).
//   용준님 확정(2026-08-07) — 「사실상 내부 업체여서 매입거래처가 아니야 … 관계사 자금이동으로 보는 게 맞다」.
//   제외 시 Top-down 매입/매출 49.5% → 45.8%. 근거 = docs/analysis/2026-08-07-sales-cost-analysis.md §5-7-e
export interface AffiliateClient {
  clientId: number
  name: string
  reason: string
}

export const AFFILIATE_CLIENTS: AffiliateClient[] = [
  { clientId: 1655, name: '오다플래그', reason: '관계사 자금이동 — 매입거래처 아님(2026-08-07 확정)' },
]

/** 관계 사업자 거래처 id 집합 — 매입·원가·AP 집계에서 제외 대상. */
export const AFFILIATE_CLIENT_IDS: number[] = AFFILIATE_CLIENTS.map(a => a.clientId)

/**
 * SQL 조각: 관계 사업자를 집계에서 제외한다. `AND <col> NOT IN (1655)`
 * 값이 신뢰된 정수 상수라 bind 없이 리터럴로 인라인(bind 한도·순서 영향 없음). 집합이 비면 빈 문자열.
 */
export function excludeAffiliateClientsSql(clientIdColumn = 'c.id'): string {
  if (AFFILIATE_CLIENT_IDS.length === 0) return ''
  return ` AND ${clientIdColumn} NOT IN (${AFFILIATE_CLIENT_IDS.join(',')})`
}

/**
 * **매입 계열 집계 전용** 제외 조각 = 내부법인 3사 + 관계 사업자.
 * AP 잔액·발주 목록·매입 통계·재무제표 매입미지급이 전부 이걸 쓴다(기준 불일치 방지).
 * ⚠️ AR 집계에는 쓰지 말 것 — 관계 사업자는 매출 쪽 제외 대상이 아니다(AR 정책 = constants/arPolicy.ts).
 */
export function excludePurchaseNonCounterpartiesSql(clientIdColumn = 'c.id'): string {
  return excludeInternalClientsSql(clientIdColumn) + excludeAffiliateClientsSql(clientIdColumn)
}

/** 해당 거래처가 관계 사업자인지(매입거래처 아님). */
export function isAffiliateClient(clientId: number | string | null | undefined): boolean {
  if (clientId == null) return false
  return AFFILIATE_CLIENT_IDS.includes(Number(clientId))
}
