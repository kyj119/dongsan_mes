// 통장 매칭 정책 판정 — 「붙여도 되는가」를 정하는 부분만 모은다. (2026-09-06)
//
// ■ 왜 라우트 밖인가
//   `bank.ts` 의 매칭 엔진은 「누구인가」(이름 판정)와 「붙여도 되는가」(정책)를 한 덩어리로 갖고 있었다.
//   앞의 것은 utils/counterpartName.ts 로 뺐고, 여기는 뒤의 것이다.
//   ★이 판정이 틀리면 **돈이 엉뚱한 원장에 들어간다** — 화면은 200 이고, 틀린 결과도 「매칭됨」으로 보인다.
//   실제로 자기 계좌간 이체 54건 502,280,000 이 수금으로 확정돼 있었고(prod 2026-09-06),
//   시험 적용 20건을 사람이 눈으로 보다가 겨우 잡혔다. 그런 건 하네스가 잡아야 한다.

import { internalEntityByClientId } from '../constants/intercompany'

export interface InternalMatchDecision {
  status: 'IGNORED' | 'SUGGESTED'
  /** IGNORED(자기 이체)면 거래처를 지운다 — 자기 자신은 거래 상대가 아니다. */
  clientId: number | null
  confidence: number
  reason: string
}

/**
 * 내부 3법인 거래처로 매칭된 건의 처리를 정한다. 내부법인이 아니면 null(기존 흐름 유지).
 *
 * ★가르는 기준은 **어느 법인 계좌에 들어왔는가**다.
 *   · 같은 법인  = 동산기획 계좌에 동산기획이 넣은 돈 → 수금이 아니라 **자기 계좌간 이체**.
 *                 원장에 넣으면 매출채권이 그만큼 거짓이 된다.
 *   · 다른 법인  = 진짜 내부거래. 회계허브 「내부거래 채권·채무」 탭이 흡수하는 축이고
 *                 채권·채무 집계는 내부법인을 이미 제외하므로, 자동 확정 대신 사람이 보게 남긴다.
 *
 * @param clientId    매칭된 거래처 id (null 이면 판단 대상 아님)
 * @param txEntityId  거래가 들어온 법인(bank_transactions.entity_id)
 * @param confidence  이름 판정이 낸 신뢰도 — 내부거래로 남길 때 상한을 씌운다
 */
export function resolveInternalEntityMatch(
  clientId: number | null | undefined,
  txEntityId: number | null | undefined,
  confidence = 0
): InternalMatchDecision | null {
  if (clientId == null) return null
  const internal = internalEntityByClientId(Number(clientId))
  if (!internal) return null

  if (Number(txEntityId) === internal.entityId) {
    return { status: 'IGNORED', clientId: null, confidence: 1.0, reason: '자사 계좌간 이체(같은 법인)' }
  }
  return {
    status: 'SUGGESTED',
    clientId: Number(clientId),
    confidence: Math.min(Number(confidence) || 0, 0.7),
    reason: '내부거래 — 회계허브에서 확인',
  }
}

/**
 * 카드사별 정산 전용 거래처(`현대카드(매출정산)` 류) → 브랜드 키 맵.
 *
 * ★id 하드코딩을 피한다 — 신규·로컬 D1 에는 그 id 가 없고, 있으면 3777 번을 가진 엉뚱한 거래처에 붙는다.
 * ★같은 브랜드가 둘이면 **먼저 만난 것**을 쓴다(중복 등록은 데이터 문제라 여기서 고를 일이 아니다).
 */
export function buildSettlementClientMap(
  clients: { id: number; client_name: string | null }[]
): Map<string, number> {
  const map = new Map<string, number>()
  for (const cl of clients) {
    const nm = (cl.client_name || '').trim()
    if (!nm.includes('매출정산')) continue
    const brand = nm.replace(/카드.*$/, '').trim()   // "NH농협카드(매출정산)" → "NH농협"
    if (brand && !map.has(brand)) map.set(brand, cl.id)
  }
  return map
}

/** 확정 이력 판정 결과. null 이면 이력을 근거로 쓰지 않는다. */
export interface HistoryMatchDecision {
  clientId: number
  confidence: number
  reason: string
}

/**
 * 같은 적요가 과거 확정된 이력을 근거로 쓸지 정한다.
 *
 * ★왜 이력이 필요한가 (2026-09-07 실사고)
 *   적요 `홍익` 은 홍익(익산)에 **26회** 확정돼 있었는데, 「홍익」이 세 거래처
 *   (홍익(익산)·홍익디자인·홍익산업디자인)의 **접두**라 이름 규칙이 하나도 못 걸렸다.
 *   그 사이 220,000 이 온오프컴퍼니 미수와 우연히 같아 `금액일치`(0.5)로 붙었다.
 *   이름 규칙이 못 가리는 곳을 **사람이 이미 여러 번 답해 놓았는데** 아무도 안 읽고 있었다.
 *
 * ★규칙 테이블(`bank_match_rules`)에 더 쌓지 않고 이력을 파생으로 읽는 이유
 *   규칙은 「수동매칭」 경로에서만 쓰인다 — 자동 제안을 승인해 APPLIED 가 된 건 학습을 안 한다.
 *   그래서 한 거래처로만 확정된 적요 1,136종 중 규칙은 266종뿐이었다(prod 실측).
 *   파생이면 과거 매칭이 정정될 때 판정도 같이 따라오고, 어긋날 캐시가 하나 더 생기지 않는다.
 *
 * @param nClients 그 적요가 붙은 **서로 다른** 거래처 수 — 2 이상이면 모호하므로 쓰지 않는다
 * @param nRows    확정된 건수 — 1회뿐이면 자동 확정하지 않고 사람이 보게 남긴다
 */
export function resolveHistoryMatch(
  clientId: number | null | undefined,
  nClients: number,
  nRows: number
): HistoryMatchDecision | null {
  if (clientId == null || Number(nClients) !== 1 || Number(nRows) < 1) return null
  const n = Number(nRows)
  return { clientId: Number(clientId), confidence: n >= 2 ? 0.95 : 0.75, reason: `확정 이력 ${n}회` }
}

/**
 * 금액 단독 매칭(`금액일치`)을 허용할지 — 적요에 **이름이 없을 때만** 허용한다.
 *
 * ★금액만으로 붙이면 「그 금액과 미수잔액이 같은 거래처」가 흡인점이 된다. prod 실측 2026-09-07:
 *   1,000,000 → 프로테크 6건 · 198,000 → 에스에이치몰 3건 · 220,000 → 온오프컴퍼니 3건 ·
 *   19,800 → 광고월드. 적요는 `홍익`·`시나위광고`처럼 멀쩡한 상호인데 전혀 다른 곳에 붙었다.
 *   36건 중 21건은 확정 이력이 **다른** 거래처를 가리키고 있었다.
 * ★이름이 하나도 없는 적요(순수 숫자·기호)라면 금액이 유일한 단서이므로 그때는 남긴다.
 */
export function allowAmountOnlyMatch(txName: string | null | undefined): boolean {
  return !/[가-힣A-Za-z]/.test(String(txName || ''))
}

/** 「제안」이 아니라 「힌트」로 다뤄야 하는 신뢰도 하한 — 이 미만은 일괄확정 대상에서 뺀다. */
export const SUGGESTION_WEAK_BELOW = 0.7

/**
 * 약한 제안인가 — 화면·일괄적용이 **확정 버튼을 내주면 안 되는** 근거인지.
 *
 * ★prod 실측 2026-09-07: `대표자명 일치`(0.65) 220건 199,941,722. 대표자명은 직원·동명이인과
 *   충돌해 오탐 17.6% 다. 0.6~0.65 대(부분일치·적요에 거래처명 포함)도 같은 성격이라
 *   **한 줄(0.7)로 자른다** — 근거 문자열을 화면이 다시 해석하면 사본 쌍이 하나 더 생긴다.
 *   제안 자체는 지우지 않는다. 사람이 한 건씩 보면 유용한 단서다.
 */
export function isWeakSuggestion(confidence: number | null | undefined): boolean {
  const v = Number(confidence)
  return !Number.isFinite(v) || v < SUGGESTION_WEAK_BELOW
}

/**
 * 기존 SUGGESTED 를 새 근거로 **승격**할지 — 강등·횡보는 하지 않는다.
 *
 * ★스윕 본 루프는 `match_status='UNMATCHED'` 만 본다. 그래서 규칙을 새로 넣어도 **이미 제안이 붙은
 *   행에는 영원히 닿지 않는다**. prod 실측 2026-09-07: 확정 이력이 단일 거래처를 가리키는데도
 *   미처리로 남은 485건 중 465건은 제안이 이력과 같고, 15건 6,709,200 은 **이력과 다른 거래처**를
 *   가리키고 있었다(그중 3건이 `대표자명 일치` 오탐).
 *
 * ★「승격만」인 이유 — 사람이 고른 값은 CONFIRMED/APPLIED 라 여기 오지 않는다. 즉 SUGGESTED 를
 *   덮어써도 사람의 판단은 지워지지 않는다. 그래도 신뢰도가 **더 높을 때만** 갈아탄다.
 *   같은 신뢰도에서 거래처만 바꾸면 스윕을 돌릴 때마다 결과가 흔들린다(멱등하지 않다).
 */
export function shouldPromoteSuggestion(
  existing: { status: string | null | undefined; confidence: number | null | undefined; clientId: number | null | undefined },
  next: { confidence: number; clientId: number }
): boolean {
  if (String(existing.status) !== 'SUGGESTED') return false
  if (!Number.isFinite(Number(next.confidence)) || next.clientId == null) return false
  const cur = Number(existing.confidence)
  const base = Number.isFinite(cur) ? cur : 0
  if (Number(next.confidence) > base) return true
  // 같은 근거·같은 거래처면 이미 반영된 상태 → 아무것도 하지 않는다(멱등).
  return false
}
