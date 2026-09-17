// 발신 정체성 해석 — 「누가 보내는가」는 법인 간에 상속되지 않는다 (2026-09-18)
//
// ★왜 여기 있나
//   `settings`(전역) → `entity_settings`(법인) 순으로 덮어쓰는 구조인데, prod 전역값이
//   **선명 번호(01043481973)·선명 채널(@sunm2596)** 이다. 그래서 자기 설정이 없는 법인
//   (청주 3)이 발송하면 고객에게 **남의 회사 번호·채널로** 문자가 간다 — 조용히.
//
//   폴백이 성립하는 값과 아닌 값이 섞여 있는 게 원인이다:
//     · 정책(`kakao_enabled`·`kakao_alt_send_type`) = 회사 공통 운영 방침 → **상속한다**
//     · 정체성(`kakao_sender_num`·`kakao_channel_id`) = 누가 보내는가 → **상속하지 않는다**
//   정체성이 없으면 빈 값으로 두고, 각 발송 경로에 이미 있는 가드
//   (`if (!senderNum) return '발신번호가 설정되지 않았습니다'`)에 걸리게 한다.
//   ⚠️ 틀린 번호로 나가는 것보다 **안 나가고 막히는 쪽**이 낫다 — 받은 사람은 되돌릴 수 없다.

/** 법인 간 상속하지 않는 키 — 「누가 보내는가」 */
export const KAKAO_IDENTITY_KEYS = ['kakao_sender_num', 'kakao_channel_id'] as const

/**
 * 전역 설정 + 법인 설정 → 최종 설정 맵.
 * @param globalMap  `settings` 의 kakao_* 값
 * @param entityMap  `entity_settings` 의 kakao_* 값 (해당 법인 행만). null = 법인 지정 없음(전역 그대로)
 */
export function resolveKakaoIdentity(
  globalMap: Record<string, string>,
  entityMap: Record<string, string> | null
): Record<string, string> {
  const out: Record<string, string> = { ...globalMap }
  if (!entityMap) return out   // 법인을 지정하지 않은 호출(전역 발송)은 종전 그대로

  for (const [k, v] of Object.entries(entityMap)) {
    if (v != null && v !== '') out[k] = v
  }
  // 정체성은 **자기 값이 있을 때만** 남긴다. 없으면 비운다(전역 = 남의 회사 값일 수 있다).
  for (const k of KAKAO_IDENTITY_KEYS) {
    const own = entityMap[k]
    if (own == null || own === '') out[k] = ''
  }
  return out
}
