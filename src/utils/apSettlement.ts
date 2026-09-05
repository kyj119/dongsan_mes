// 매입 지급예정 ↔ 실제 지급 대사 — 파생 FIFO + 연체 분산 (2026-09-05)
//
// ■ 왜 파생인가 (저장하지 않는다)
//   지급 생성 경로가 둘(bank.ts 출금적용 · ledger/accounts-payable POST)이고 삭제 경로도 둘이라,
//   충당 결과를 테이블에 저장하면 네 곳 전부에 충당·복원을 심어야 하고 하나만 빠지면 예정이 영영 굳는다.
//   파생이면 지급을 지우는 순간 다음 조회에서 저절로 복구된다 — 매출 §0(cashflowEngine)과 같은 판단이다.
//   CLAUDE.md §누적 캐시 1순위("파생으로 뺀다").
//
// ■ 왜 순수 모듈인가
//   「무엇을 얼마나 갚은 것으로 볼 것인가」가 600줄 엔진 안에 있으면 하네스가 못 닿는다.
//   여기 함수는 전부 입력→출력만 본다 → scripts/cashflow-ap-selftest.cjs 가 픽스처로 직접 때린다.
//   (CLAUDE.md §조용한 격하 "판정을 순수 모듈로 뺀다"와 같은 이유)
//
// ■ 왜 지급 이벤트를 '합계'가 아니라 '행'으로 받나
//   매출 §0 은 SUM 만 쓴다. 매입은 **관측 지연**(실제 지급일 − 예정일)을 같이 뽑아야 해서 날짜가 필요하다.
//   prod 실측 536행이라 메모리 부담이 없고, 호출부가 LIMIT 으로 상한을 건다.

import { daysBetween, type CashEvent } from './overdueSpread'

/** 지급 의무 한 건 = 물질화된 cash_schedule PURCHASE 행 또는 미물질화 확정발주. */
export interface ApObligation {
  /** 엔진이 되찾을 키. 'cs:<id>' 또는 'po:<id>' */
  ref: string
  supplierId: number
  entityId: number
  /** 예정일 YYYY-MM-DD */
  due: string
  amount: number
  /** 이미 완료(DONE) 처리된 행 — 충당 대상이 아니되 그 금액만큼 풀에서 뺀다.
   *  안 빼면 같은 지급이 다른 예정을 한 번 더 지운다(매출 §0 과 동일한 함정). */
  done?: boolean
  /** done 일 때의 실지급액(없으면 amount) */
  doneAmount?: number
  /** 이 채무가 '생긴 날'(발주 기준일). 이보다 앞선 지급은 이 채무의 지급일 수 없다.
   *  ★관측 지연 표본에서만 쓴다 — 잔액 계산은 원장 항등식이라 여기 영향을 받지 않는다.
   *  prod 2026-09-06 실측: 이게 없어서 중앙값이 **−111일**로 나왔다. 지급 기록은 1월부터 있는데
   *  발주 기록은 공급처마다 훨씬 늦게 시작해, FIFO 가 '발주보다 먼저 있었던 지급'으로 채무를 닫았다.
   *  「111일 일찍 낸다」로 읽히는 숫자를 화면에 띄우면 진단이 아니라 오정보다. */
  notBefore?: string
}

/** 실제로 나간 돈 한 건 = purchase_payments 또는 purchase_adjustments. */
export interface ApSettlementEvent extends CashEvent {
  supplierId: number
  entityId: number
}

export interface ApSettlementResult {
  /** ref → 이미 지급된 금액. 없으면 0. */
  settledByRef: Map<string, number>
  /** 관측 지연 표본(일) — FIFO 가 '닫은' 의무의 (실제 지급일 − 예정일). 음수 = 예정보다 일찍 냄. */
  lagSamples: number[]
  /** 충당하고도 남은 지급(발주 없이 지급만 있는 이관 흔적). 공급처×법인 합계. */
  unappliedTotal: number
}

const keyOf = (s: number, e: number) => s + ':' + e

/**
 * 공급처×법인 안에서 예정일 순으로 실제 지급을 충당한다.
 *
 * 발주와 지급을 잇는 기록이 사실상 없어서(prod 실측: purchase_payments 536건 중 po_id 가 붙은 건 **1건**)
 * 건별 매칭은 불가능하다 → 잔액식(발주 − 지급 − 조정)과 같은 결과를 내면서
 * 「어느 예정이 남았는지」까지 말해 주는 FIFO 가 유일하게 성립하는 방법이다.
 */
export function settleApFifo(
  obligations: ApObligation[],
  events: ApSettlementEvent[]
): ApSettlementResult {
  const settledByRef = new Map<string, number>()
  const lagSamples: number[] = []

  const obByKey = new Map<string, ApObligation[]>()
  for (const o of obligations) {
    const k = keyOf(o.supplierId, o.entityId)
    const list = obByKey.get(k) ?? []
    list.push(o)
    obByKey.set(k, list)
  }
  const evByKey = new Map<string, ApSettlementEvent[]>()
  for (const e of events) {
    const k = keyOf(e.supplierId, e.entityId)
    const list = evByKey.get(k) ?? []
    list.push(e)
    evByKey.set(k, list)
  }

  let unappliedTotal = 0
  const allKeys = new Set<string>([...obByKey.keys(), ...evByKey.keys()])

  for (const k of allKeys) {
    const obs = (obByKey.get(k) ?? []).slice().sort((a, b) =>
      a.due === b.due ? (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0) : (a.due < b.due ? -1 : 1))
    // 조정(감액)은 현금이 아니지만 채무를 줄이는 것은 같다 → 같은 스트림에 날짜순으로 섞는다.
    const evs = (evByKey.get(k) ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    let ei = 0
    let evLeft = evs.length > 0 ? Number(evs[0].amount) || 0 : 0

    /** 스트림에서 need 만큼 꺼낸다. 마지막으로 꺼낸 이벤트의 날짜를 함께 돌려준다(관측 지연용). */
    const consume = (need: number): { taken: number; lastDate: string | null } => {
      let taken = 0
      let lastDate: string | null = null
      while (need > 0 && ei < evs.length) {
        if (evLeft <= 0) { ei++; evLeft = ei < evs.length ? Number(evs[ei].amount) || 0 : 0; continue }
        const t = Math.min(need, evLeft)
        taken += t; need -= t; evLeft -= t
        lastDate = evs[ei].date
        if (evLeft <= 0) { ei++; evLeft = ei < evs.length ? Number(evs[ei].amount) || 0 : 0 }
      }
      return { taken, lastDate }
    }

    for (const o of obs) {
      const amt = Number(o.amount) || 0
      if (o.done) {
        // 이미 해결된 건 — 충당 대상은 아니지만 풀은 그만큼 소진시킨다.
        const doneAmt = Number(o.doneAmount ?? o.amount) || 0
        consume(doneAmt)
        settledByRef.set(o.ref, doneAmt)
        continue
      }
      if (amt <= 0) continue
      const { taken, lastDate } = consume(amt)
      if (taken > 0) settledByRef.set(o.ref, taken)
      // 완전히 닫힌 의무만 관측 지연 표본이 된다 — 부분 지급은 '언제 다 갚았는지'를 아직 모른다.
      // 채무가 생기기 전의 지급으로 닫힌 건은 짝 자체가 성립하지 않는다(이관으로 한쪽 이력만 있는 경우) → 표본 제외.
      if (taken >= amt - 0.5 && lastDate && (!o.notBefore || lastDate >= o.notBefore)) {
        const d = daysBetween(o.due, lastDate)
        if (d !== null) lagSamples.push(d)
      }
    }

    // 남은 지급 = 발주가 없는 지급(이관 흔적). 채무를 음수로 만들지 않는다.
    let left = 0
    if (ei < evs.length) {
      left += evLeft
      for (let j = ei + 1; j < evs.length; j++) left += Number(evs[j].amount) || 0
    }
    unappliedTotal += Math.max(0, left)
  }

  return { settledByRef, lagSamples, unappliedTotal }
}
