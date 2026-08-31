/**
 * 직배 배차 슬롯 · 생산 완료기한 정본 (2026-08-31 용준님)
 *
 * 왜 여기 모았는가: 「납품시간」과 「완료기한」은 **다른 축**인데 컬럼이 하나뿐이었다.
 *   직배는 배차가 오전편·오후편 2회뿐이고, 현장이 맞춰야 하는 건 도착 시각이 아니라
 *   **차에 실려 있어야 하는 시각**이다 — 오전편은 **전날 18:00**, 오후편은 당일 13:00.
 *   `orders.delivery_time` 은 시각(HH:MM)만 담아 '전날'을 표현할 수 없다.
 *
 * 그래서 슬롯(`orders.delivery_slot`)만 저장하고 **마감시각은 저장하지 않는다**(파생).
 *   컬럼으로 들고 있으면 납품일·출고방법이 바뀔 때 따라 갱신해야 하는 누적 캐시가 하나 더 생긴다
 *   (CLAUDE.md §누적 캐시 = 수정·삭제가 안 따라온다).
 *
 * ⚠️ 클라 사본 = `src/scripts/shared/deliverySlot.js` (주문서 토글·라벨·선택 가드).
 *    상수가 갈리면 "주문서에서 고른 슬롯 ≠ 칸반이 계산한 마감"이 된다 — 반드시 쌍으로 수정.
 *    게이트 = `npm run test:delivery-slot` (양쪽 상수 일치까지 대조).
 *
 * 마감 계산 결과는 **KST naive 문자열**('YYYY-MM-DD HH:MM')이다. 사내 PC·현장 태블릿이 모두 KST라
 *   클라는 그대로 `new Date(y, m-1, d, h, mi)` 로 만들면 되고, UTC 변환 왕복이 없다.
 */

import { normalizeDeliveryMethod } from '../constants/deliveryMethod'

export type DeliverySlot = 'AM' | 'PM'

/** 화면 표기 — `직배 오전` */
export const SLOT_LABELS: Record<DeliverySlot, string> = { AM: '오전', PM: '오후' }

/**
 * `delivery_time` 에 함께 저장하는 대표시각.
 * 슬롯을 쓰더라도 이 값을 비우지 않는 이유: 출고목록 정렬(`routes/shipments.ts` ORDER BY delivery_time)·
 * 주문상세·칸반 납품방법별 집계가 이미 delivery_time 을 쓴다. 비우면 그 화면들이 전부 '미정'이 된다.
 */
export const SLOT_REPRESENTATIVE_TIME: Record<DeliverySlot, string> = { AM: '09:00', PM: '14:00' }

/** 생산 완료기한 — 납품일로부터의 일수 오프셋 + 시각. ★오전편의 -1 이 이 기능의 전부다. */
export const SLOT_DEADLINE: Record<DeliverySlot, { dayOffset: number; time: string }> = {
  AM: { dayOffset: -1, time: '18:00' },
  PM: { dayOffset: 0, time: '13:00' },
}

/** 슬롯을 쓰는 출고방법 = 자사 배차(직배). 과거 표기(`직배`)도 정규화로 함께 받는다. */
export function isSlotDeliveryMethod(method: string | null | undefined): boolean {
  return normalizeDeliveryMethod(method) === '직접배송'
}

/** 입력값 → 슬롯. 유효하지 않으면 null(= 종전 동작). */
export function normalizeSlot(value: unknown): DeliverySlot | null {
  const v = String(value ?? '').trim().toUpperCase()
  return v === 'AM' || v === 'PM' ? v : null
}

/** 출고방법까지 함께 본 유효 슬롯 — 직배가 아니면 슬롯은 의미가 없다. */
export function resolveSlot(method: string | null | undefined, slot: unknown): DeliverySlot | null {
  return isSlotDeliveryMethod(method) ? normalizeSlot(slot) : null
}

/** 'YYYY-MM-DD' + 일수 → 'YYYY-MM-DD'. UTC 기준 산술이라 서머타임·로컬시간대 영향이 없다. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10)
}

export interface DeadlineInput {
  delivery_date?: string | null
  delivery_time?: string | null
  delivery_method?: string | null
  delivery_slot?: string | null
}

/**
 * 생산 완료기한(KST naive 'YYYY-MM-DD HH:MM').
 *  - 직배 + 슬롯 → 오전=전날 18:00 · 오후=당일 13:00
 *  - 그 외        → 납품일 + 납품시간 (종전 동작). 시간이 없으면 null = 마감시각 미정
 */
export function getProductionDeadline(o: DeadlineInput): string | null {
  const date = (o.delivery_date || '').trim()
  if (!date) return null

  const slot = resolveSlot(o.delivery_method, o.delivery_slot)
  if (slot) {
    const rule = SLOT_DEADLINE[slot]
    return `${addDays(date, rule.dayOffset)} ${rule.time}`
  }

  const time = (o.delivery_time || '').trim()
  return time ? `${date} ${time}` : null
}

/** 화면 표기 — `직배 오전` · `한진택배 18:00` · `방문수령`. 출고방법은 저장된 원문을 유지한다. */
export function formatDeliveryTiming(o: DeadlineInput): string {
  const method = (o.delivery_method || '').trim()
  const slot = resolveSlot(method, o.delivery_slot)
  if (slot) return `${method} ${SLOT_LABELS[slot]}`.trim()
  const time = (o.delivery_time || '').trim()
  return time ? `${method} ${time}`.trim() : method
}

/**
 * 이 슬롯을 지금 고를 수 있는가 — **주문서 입력 가드 전용**.
 *
 * 오전편은 전날 18:00 이 마감이라 당일 아침에 접수하면 이미 지난 기한이 된다(용준님: 전날 접수건에만 허용).
 * ⚠️ 서버는 이 규칙으로 400 을 내지 않는다 — 과거 오전편 주문을 수정·복사·견적전환할 때마다
 *    전부 막혀 업무가 멈춘다. 저장 검증은 값 유효성('AM'/'PM'/null)까지다.
 *
 * @param nowKst 현재 KST naive('YYYY-MM-DD HH:MM'). 미지정 시 실행 시각.
 */
export function isSlotSelectable(slot: DeliverySlot, deliveryDate: string, nowKst?: string): boolean {
  if (slot === 'PM') return true
  if (!deliveryDate) return true
  const rule = SLOT_DEADLINE.AM
  const deadline = `${addDays(deliveryDate, rule.dayOffset)} ${rule.time}`
  const now = nowKst || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
  return now <= deadline
}
