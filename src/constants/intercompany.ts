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
