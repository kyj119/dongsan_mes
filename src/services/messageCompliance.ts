/**
 * 광고성 문자 발송 법적 준수 헬퍼 (정보통신망법 §50)
 *
 * 여기 모인 함수들은 "직원이 판단하지 않아도 되게" 만드는 것이 목적이다.
 * 발송 라우트가 이 헬퍼를 거치면 (광고) 표기·수신거부 안내·대상 필터가 자동으로 붙는다.
 */

/** 번호 정규화 — 숫자만. 저장·비교의 단일 소스(010-1234-5678 / +82 10 ... 표기 혼재 대응) */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  let d = String(phone).replace(/[^0-9]/g, '')
  // +82 국가번호 표기를 국내 표기로 환원(8210... → 010...)
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2)
  return d
}

/** 화면 표시용 마스킹 — 수신거부 페이지는 무인증이라 전체 번호를 노출하면 안 된다. */
export function maskPhone(phone: string): string {
  const d = normalizePhone(phone)
  if (d.length < 7) return '***'
  return d.slice(0, 3) + '-****-' + d.slice(-4)
}

/**
 * 번호당 수신거부 토큰 1개를 재사용한다.
 * 발송마다 새로 만들면 같은 사람에게 매번 다른 링크가 나가고 토큰이 무한 증식한다.
 */
export async function getOrCreateUnsubToken(
  db: D1Database,
  phone: string,
  clientId?: number | null
): Promise<string> {
  const p = normalizePhone(phone)
  if (!p) return ''

  const existing = await db.prepare('SELECT token FROM unsubscribe_tokens WHERE phone = ?')
    .bind(p).first<{ token: string }>()
  if (existing?.token) return existing.token

  const token = crypto.randomUUID().replace(/-/g, '')
  await db.prepare(
    'INSERT OR IGNORE INTO unsubscribe_tokens (token, phone, client_id) VALUES (?, ?, ?)'
  ).bind(token, p, clientId ?? null).run()

  // 동시 발송으로 경합했다면 먼저 들어간 토큰을 쓴다(번호당 1개 UNIQUE)
  const row = await db.prepare('SELECT token FROM unsubscribe_tokens WHERE phone = ?')
    .bind(p).first<{ token: string }>()
  return row?.token || token
}

/** 수신거부된 번호 집합 — 대량 발송에서 IN 조회 1회로 끝낸다(D1 바인드 80개 청크). */
export async function getOptedOutSet(db: D1Database, phones: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const list = Array.from(new Set(phones.map(normalizePhone).filter(Boolean)))
  for (let i = 0; i < list.length; i += 80) {
    const chunk = list.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db.prepare(
      `SELECT phone FROM message_opt_outs WHERE phone IN (${ph})`
    ).bind(...chunk).all<{ phone: string }>()
    for (const r of results || []) out.add(r.phone)
  }
  return out
}

/** 활성 금지어 목록 */
export async function getBannedWords(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT word FROM ad_banned_words WHERE is_active = 1 ORDER BY word'
  ).all<{ word: string }>()
  return (results || []).map(r => r.word).filter(Boolean)
}

/**
 * 본문에 포함된 금지어 탐지.
 * 공백을 제거하고 비교한다 — "할 인", "이 벤 트"로 우회하는 것을 막기 위함.
 */
export function findBannedWords(text: string, words: string[]): string[] {
  const squeezed = (text || '').replace(/\s/g, '')
  return words.filter(w => squeezed.includes(w.replace(/\s/g, '')))
}

/** 광고 표기 접두 — 이미 붙어 있으면 중복 부착하지 않는다. */
export const AD_PREFIX = '(광고)'

export function withAdPrefix(body: string): string {
  const t = (body || '').trimStart()
  return t.startsWith(AD_PREFIX) ? t : `${AD_PREFIX} ${t}`
}

/**
 * 수신거부 안내 문구 — §50④(수신거부 방법 명시) + §50⑧(무료 수단).
 * 링크 방식이라 수신자에게 통화료가 발생하지 않는다.
 */
export function unsubscribeFooter(url: string): string {
  return `\n\n무료수신거부 ${url}`
}

/** 수신거부 링크 URL */
export function buildUnsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/unsubscribe?t=${token}`
}

/**
 * 야간 발송 판정 — 21:00~08:00 KST는 별도 동의 없이 광고 전송 불가(§50③).
 * @param at 판정 시각(미지정 시 현재). 예약 발송도 예약 시각으로 검사해야 한다.
 */
export function isNightTimeKst(at?: Date): number {
  const base = at ? at.getTime() : Date.now()
  const kstHour = new Date(base + 9 * 3600 * 1000).getUTCHours()
  return kstHour >= 21 || kstHour < 8 ? kstHour : -1
}

/**
 * 바로빌 예약 발송 시각 문자열(yyyyMMddHHmmss) → Date.
 * 예약 발송도 야간 검사를 해야 하는데, 문자열이라 그대로는 비교할 수 없다.
 */
export function parseSendDT(sndDT: string | undefined): Date | null {
  if (!sndDT) return null
  const s = String(sndDT).replace(/[^0-9]/g, '')
  if (s.length < 12) return null
  const [y, mo, d, h, mi] = [
    Number(s.slice(0, 4)), Number(s.slice(4, 6)), Number(s.slice(6, 8)),
    Number(s.slice(8, 10)), Number(s.slice(10, 12)),
  ]
  if (!y || !mo || !d) return null
  // sndDT는 KST 기준 → UTC로 환산해 Date 생성
  return new Date(Date.UTC(y, mo - 1, d, h - 9, mi))
}
