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
