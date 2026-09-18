// 배송 알림 정책 — 「이 출고를 지금 알릴 수 있는가」 판정 단일 소스 (2026-09-18)
//
// ★왜 여기 있나
//   판정이 두 벌이었다 — 서버 자동 발송은 코드에 하드코딩된 맵(배송방법 축), 화면 기본 템플릿은
//   DB 테이블(`kakao_template_defaults`, **섹션 축**). 축이 달라 결과가 어긋났다:
//     · 퀵·용차 섹션에 **「방문 수령 준비 완료」**가 걸려 있었다 — 우리가 가져다 주는 건인데
//       「방문 수령이 가능합니다」로 나간다.
//     · 최다 배송수단인 **방문수령(583건)이 `etc` 섹션**이라 화면 기본 템플릿이 없었다.
//     · `배송`(78건)이 화물 섹션으로 가서 「대신화물 출고」가 기본 선택됐다.
//   그래서 판정을 여기 하나로 내리고, 화면·서버가 같은 함수를 쓴다
//   (CLAUDE.md §조용한 격하 「판정을 순수 모듈로 뺀다」).
//
// ★승인 템플릿 실측 (2026-09-18, 바로빌 4건)
//   어느 템플릿에도 `#{송장번호}` 가 **없다**. 대신택배·대신화물·방문수령은 송장 없이 완전한 문구라
//   **출고 즉시 보낼 수 있다.** 송장을 기다려야 하는 건 템플릿이 없는 **한진택배뿐**이다(문자로 보낸다).
//
// ★용준님 결정 (2026-09-18)
//   **직배·직접배송·퀵·용차·자차배송은 알림을 보내지 않는다.** 우리가 직접 가져다 주는 건이라
//   따로 알릴 필요가 없다 — 「문구가 없다」가 아니라 **「대상이 아니다」**로 분류한다.
//   (이 둘을 섞으면 확정 대기 목록이 영영 안 줄어드는 미발송 건으로 가득 찬다.)

import { normalizeDeliveryMethod } from '../constants/deliveryMethod'

/** 알림 정책 — 배송방법이 기준이다(화면 섹션이 아니다). */
export type NoticeChannel = 'kakao' | 'sms'
export type NoticeBlock =
  | 'not_target'      // 알림 대상이 아닌 배송수단 (직배·퀵 등) — 결함이 아니다
  | 'no_mobile'       // 거래처 휴대폰 없음
  | 'needs_tracking'  // 송장이 있어야 보낼 수 있다 (한진)
  | 'already_sent'    // 이미 보냈다 (멱등)
  | 'unknown_method'  // 분류되지 않은 배송수단 — 사람이 정해야 한다

interface MethodPolicy {
  /** 알림 대상인가 */
  notify: boolean
  /** 알림톡 승인 템플릿명 (없으면 문자로 보낸다) */
  template?: string
  /** 송장번호가 있어야 보낼 수 있는가 */
  needsTracking?: boolean
}

/**
 * 배송방법 → 알림 정책.
 * ⚠️ 템플릿명은 **바로빌에 승인된 이름 그대로**다(코드도 이름과 같다). 글자가 다르면 발송이 거절된다.
 */
export const NOTICE_POLICY: Record<string, MethodPolicy> = {
  // ── 알림톡 (승인 템플릿 있음 · 송장 불필요 → 출고 즉시) ──
  '방문수령': { notify: true, template: '방문 수령 준비 완료' },
  '직접수령': { notify: true, template: '방문 수령 준비 완료' },
  '대신화물': { notify: true, template: '대신화물 출고' },
  '대신택배': { notify: true, template: '대신택배 출고' },

  // ── 문자 (승인 템플릿 없음 · 송장을 본문에 넣는다 → 송장 입력 후) ──
  '한진택배': { notify: true, needsTracking: true },

  // ── 알림 대상 아님 (2026-09-18 용준님 결정) — 우리가 직접 가져다 준다 ──
  //   키는 **정본 표기**만 둔다. 「직배」·「자차배송」·「배송」은 SSOT ALIASES 가 「직접배송」으로 풀어 준다.
  '직접배송': { notify: false },
  '퀵': { notify: false },
  '용차': { notify: false },
}

/**
 * 배송방법 문자열 → 정책. 못 찾으면 null(=사람이 정해야 한다).
 *
 * ★별칭 판정은 **여기서 하지 않는다** — `constants/deliveryMethod` 가 배송방법 SSOT 다(7종 + ALIASES).
 *   여기서 또 `includes()` 로 흩뿌리면 「직배」를 두 곳이 다르게 읽는 날이 온다.
 *   SSOT 로 정규화한 뒤 그 값으로만 찾고, 정규화가 못 푸는 옛 표기만 마지막에 좁게 흡수한다.
 */
export function noticePolicyFor(deliveryMethod: string | null | undefined): MethodPolicy | null {
  const raw = String(deliveryMethod || '').trim()
  if (!raw) return null
  const m = normalizeDeliveryMethod(raw)
  if (NOTICE_POLICY[m]) return NOTICE_POLICY[m]
  // SSOT 가 못 푸는 이관 표기 — 「동산에서 대신화물」·「동산으로 방문수령」처럼 말이 섞인 것들.
  //   ⚠️ 정확일치가 실패했을 때만 쓴다.
  if (m.includes('방문수령') || m.includes('방문 수령') || m.includes('직접수령')) return NOTICE_POLICY['방문수령']
  if (m.includes('대신화물')) return NOTICE_POLICY['대신화물']
  if (m.includes('대신택배')) return NOTICE_POLICY['대신택배']
  if (m.includes('한진')) return NOTICE_POLICY['한진택배']
  if (m.includes('퀵') || m.includes('용차')) return NOTICE_POLICY['퀵']
  if (m.includes('직접배송') || m.includes('직배')) return NOTICE_POLICY['직접배송']
  return null
}

export interface NoticeInput {
  deliveryMethod: string | null | undefined
  hasMobile: boolean
  trackingNumber?: string | null
  alreadySent?: boolean
}

export interface NoticeDecision {
  /** 지금 보낼 수 있는가 */
  canSendNow: boolean
  /** 애초에 알림 대상인가 — false 면 「미발송」으로 세지 않는다 */
  isTarget: boolean
  channel: NoticeChannel | null
  /** 알림톡 템플릿명 (문자면 null) */
  template: string | null
  blockedReason: NoticeBlock | null
}

/**
 * 「지금 이 출고를 알릴 수 있는가」 — 화면(배지·모달)과 서버(자동 발송)가 **둘 다 이걸 쓴다**.
 * 한쪽만 고치면 「화면엔 보낼 수 있다고 뜨는데 서버가 거절」이 생긴다.
 */
export function resolveShipmentNotice(input: NoticeInput): NoticeDecision {
  const policy = noticePolicyFor(input.deliveryMethod)
  const deny = (isTarget: boolean, reason: NoticeBlock): NoticeDecision =>
    ({ canSendNow: false, isTarget, channel: null, template: null, blockedReason: reason })

  if (!policy) return deny(false, 'unknown_method')
  if (!policy.notify) return deny(false, 'not_target')

  const channel: NoticeChannel = policy.template ? 'kakao' : 'sms'
  const template = policy.template || null

  // 이미 보낸 건은 대상이긴 하되 더 보낼 수 없다(멱등) — 배지는 「발송됨」이 된다.
  if (input.alreadySent) return { canSendNow: false, isTarget: true, channel, template, blockedReason: 'already_sent' }
  if (!input.hasMobile) return { canSendNow: false, isTarget: true, channel, template, blockedReason: 'no_mobile' }
  if (policy.needsTracking && !String(input.trackingNumber || '').trim()) {
    return { canSendNow: false, isTarget: true, channel, template, blockedReason: 'needs_tracking' }
  }
  return { canSendNow: true, isTarget: true, channel, template, blockedReason: null }
}

/** 화면 문구 — 배지·모달이 같은 말을 쓰게 한다. */
export const NOTICE_BLOCK_LABEL: Record<NoticeBlock, string> = {
  not_target: '대상 아님',
  no_mobile: '연락처 없음',
  needs_tracking: '송장 대기',
  already_sent: '발송됨',
  unknown_method: '배송수단 확인',
}
