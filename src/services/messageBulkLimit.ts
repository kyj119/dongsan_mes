/**
 * messageBulkLimit.ts — 대량 발송 1회 건수 상한 (#584)
 *
 * 왜 필요한가: 발송은 취소가 불가능하고 채널마다 건당 과금된다. 프론트 확인창은 API 직접호출을
 * 못 막고, 오조작 한 번이 곧 실비용이다. 기존에는 MMS(100원/건)에만 상한이 있었고 SMS·LMS·
 * 알림톡에는 없어서, 실수로 전 거래처(수천 건)에 발송하면 수만~십수만 원이 즉시 나갔다.
 *
 * 단일 소스: 대량 발송 경로 4곳(messages `/send-bulk`, messagesAd `/ad/send`,
 * kakao `/send-sms-bulk`·`/send-shipment-bulk`)이 전부 이 헬퍼를 쓴다.
 *
 * 상한 결정 순서: settings `<channel>_bulk_limit` → settings `bulk_limit`(전 채널 공통) →
 * 아래 기본값. 0 이하/미설정이면 다음 단계로 넘어간다. 기본값 0 = 무제한(이메일: 과금 없음).
 * ⚠️ `mms_bulk_limit`은 기존 키를 그대로 쓴다 — 이미 운영 중이라 재설정 없이 이어진다.
 */

export type BulkChannel = 'mms' | 'lms' | 'sms' | 'kakao' | 'email'

/** 채널별 1회 상한 기본값(건). 0 = 무제한. */
const BULK_LIMIT_DEFAULTS: Record<BulkChannel, number> = {
  mms: 50,    // 100원/건 — 기존 MMS_BULK_LIMIT_DEFAULT 승계
  lms: 500,   // 장문, 수십 원/건
  sms: 500,   // 15원/건 — 500건이면 약 7,500원
  kakao: 500, // 7원/건 (알림톡)
  email: 0,   // 과금 없음 → 무제한
}

/** 안내 문구의 예상 비용 계산용 단가(원/건). 정확한 청구단가가 아니라 오조작 감각용 추정치. */
const UNIT_COST: Record<BulkChannel, number> = { mms: 100, lms: 50, sms: 15, kakao: 7, email: 0 }

const CHANNEL_LABEL: Record<BulkChannel, string> = {
  mms: 'MMS', lms: 'LMS(장문)', sms: 'SMS', kakao: '알림톡', email: '이메일',
}

/**
 * 채널의 1회 발송 상한을 해석한다. 0이면 무제한.
 * settings 2개 키를 한 번의 쿼리로 읽는다(건별 호출이 아니라 요청당 1회).
 */
export async function resolveBulkLimit(db: D1Database, channel: BulkChannel): Promise<number> {
  const { results } = await db
    .prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN (?, 'bulk_limit')")
    .bind(`${channel}_bulk_limit`)
    .all<{ setting_key: string; setting_value: string }>()

  const pick = (key: string): number => {
    const row = (results || []).find((r) => r.setting_key === key)
    const n = parseInt(row?.setting_value || '', 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  return pick(`${channel}_bulk_limit`) || pick('bulk_limit') || BULK_LIMIT_DEFAULTS[channel] || 0
}

/**
 * 상한 초과면 사용자에게 보여줄 에러 문구를 돌려준다(통과면 null).
 * 호출부는 `if (err) return c.json({ success:false, error: err }, 400)` 형태로 쓴다.
 */
export async function checkBulkLimit(
  db: D1Database,
  channel: BulkChannel,
  count: number
): Promise<string | null> {
  const limit = await resolveBulkLimit(db, channel)
  if (limit <= 0 || count <= limit) return null

  const cost = UNIT_COST[channel] ? ` 예상 ${(count * UNIT_COST[channel]).toLocaleString()}원.` : ''
  return `${CHANNEL_LABEL[channel]} 대량 발송은 1회 ${limit}건까지입니다 (요청 ${count}건).${cost}`
    + ` 대상을 나눠 발송하거나 설정(${channel}_bulk_limit)에서 상한을 조정하세요.`
}
