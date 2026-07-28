// ============================================================================
// 광고성 문자 발송 (/api/messages/ad) — ADMIN 전용
//
// 왜 별도 라우터인가:
//   일반 발송(/api/messages/send-bulk)과 같은 화면·같은 코드에 두면 "유형을 잘못 고르는" 실수가
//   반드시 발생한다. 과태료(최대 3천만원)는 직원이 아니라 사업자에게 귀속되므로,
//   광고 발송은 **경로 자체를 분리하고 서버가 무조건 강제**한다.
//
// 이 라우터를 지나면 다음이 자동으로 보장된다(사용자가 끌 수 없음):
//   §50④  본문·제목 첫머리 (광고) 표기 + 전송자 명칭
//   §50④⑧ 수신거부 방법 명시 + 무료 수단(링크)
//   §50①  사전동의 — 6개월 내 거래처로 대상을 좁혀 시행령 §61② 예외를 충족
//   §50③  야간(21~08시) 발송 차단 — 즉시·예약 모두
//   §50⑤  수신거부자 자동 제외
// ============================================================================

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { requireRole } from '../middleware/auth'
import { getKakaoProvider, getKakaoSettings } from './kakao'
import { getEntityId } from '../utils/entityFilter'
import { insertSendLog, applyVars, unresolvedVars, buildBulkVarContext, BULK_VAR_NAMES, type BulkReceiver } from './messages'
import { MMS_IMAGE } from '../constants/barobillCodes'
import { stripDataUri } from '../utils/thumbnailStore'
import {
  normalizePhone, getOptedOutSet, getOrCreateUnsubToken, buildUnsubscribeUrl,
  withAdPrefix, unsubscribeFooter, isNightTimeKst, parseSendDT, AD_PREFIX,
  getBannedWords,
} from '../services/messageCompliance'
import type { SMSMessage } from './kakao'

/** 광고 MMS 1회 상한(건) — 100원/건이라 오조작 비용이 크다. settings.mms_bulk_limit와 동일 키 사용. */
const AD_MMS_LIMIT_DEFAULT = 50

/** 사전동의 면제 기간 — 시행령 §61② "거래가 종료된 날부터 6개월" */
const CONSENT_EXEMPT_MONTHS = 6

const messagesAdRouter = new Hono<HonoEnv>()

// 광고 발송은 ADMIN만. (상위 messagesRouter가 ADMIN/MANAGER를 이미 통과시키므로 여기서 한 번 더 좁힌다)
messagesAdRouter.use('/*', requireRole('ADMIN'))

// ────────────────────────────────────────────────────────────────────────────
// 수신자 해석 — 광고 발송 가능 대상만 남긴다
// ────────────────────────────────────────────────────────────────────────────

export interface AdReceiver extends BulkReceiver {
  phoneNorm: string
  last_order_date?: string | null
}

export interface AdAudience {
  sendable: AdReceiver[]
  excluded: {
    /** 수신거부 등록 번호 */
    optOut: AdReceiver[]
    /** 마지막 거래가 6개월을 넘김 → 사전동의 예외 불성립 */
    stale: AdReceiver[]
    /** 거래 이력을 확인할 수 없음(거래처 매칭 실패) → 동의 근거 없음 */
    unknown: AdReceiver[]
    /** 번호 자체가 없거나 형식 불량 */
    invalid: AdReceiver[]
  }
}

/**
 * 광고 수신 대상 판정.
 *
 * 6개월 기준은 **3사 전체 주문**을 본다(사용자 결정 2026-07-28).
 * ⚠️ entityFilter를 의도적으로 쓰지 않는다 — 거래처는 3사 공유 자산이고, 동산기획·선명·청주 중
 *    어느 법인과든 최근 거래가 있으면 대상으로 본다는 운영 방침. entity 감사에서 누락으로 오인 말 것.
 */
export async function resolveAdAudience(c: Context<HonoEnv>, receivers: BulkReceiver[]): Promise<AdAudience> {
  const db = c.env.DB
  const list: AdReceiver[] = receivers.map(r => ({ ...r, phoneNorm: normalizePhone(r.phone) }))

  const invalid = list.filter(r => r.phoneNorm.length < 9)
  const valid = list.filter(r => r.phoneNorm.length >= 9)

  // ── 1) client_id가 없는 수신자는 번호로 거래처를 역조회 ──
  // 엑셀 붙여넣기로 들어온 명단도 거래 이력을 확인할 수 있게 해준다(없으면 전부 unknown 처리되어 발송 불가).
  const needLookup = valid.filter(r => !r.client_id).map(r => r.phoneNorm)
  if (needLookup.length > 0) {
    const found: Record<string, { id: number; name: string }> = {}
    const uniq = Array.from(new Set(needLookup))
    for (let i = 0; i < uniq.length; i += 80) {
      const chunk = uniq.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      // mobile/phone 어느 쪽에 저장돼 있어도 매칭되도록 둘 다 본다(하이픈·공백 제거 후 비교)
      const { results } = await db.prepare(`
        SELECT id, client_name,
               REPLACE(REPLACE(COALESCE(mobile, ''), '-', ''), ' ', '') AS m,
               REPLACE(REPLACE(COALESCE(phone, ''), '-', ''), ' ', '') AS p
        FROM clients
        WHERE REPLACE(REPLACE(COALESCE(mobile, ''), '-', ''), ' ', '') IN (${ph})
           OR REPLACE(REPLACE(COALESCE(phone, ''), '-', ''), ' ', '') IN (${ph})
      `).bind(...chunk, ...chunk).all<{ id: number; client_name: string; m: string; p: string }>()
      for (const row of results || []) {
        if (row.m && !found[row.m]) found[row.m] = { id: row.id, name: row.client_name }
        if (row.p && !found[row.p]) found[row.p] = { id: row.id, name: row.client_name }
      }
    }
    for (const r of valid) {
      if (!r.client_id && found[r.phoneNorm]) {
        r.client_id = found[r.phoneNorm].id
        if (!r.name) r.name = found[r.phoneNorm].name
      }
    }
  }

  // ── 2) 수신거부 제외 ──
  const optedOut = await getOptedOutSet(db, valid.map(r => r.phoneNorm))
  const optOut = valid.filter(r => optedOut.has(r.phoneNorm))
  const afterOptOut = valid.filter(r => !optedOut.has(r.phoneNorm))

  // ── 3) 6개월 거래 이력 (3사 전체) ──
  const clientIds = Array.from(new Set(
    afterOptOut.map(r => Number(r.client_id)).filter(n => Number.isFinite(n) && n > 0)
  ))
  const lastOrder: Record<number, string> = {}
  for (let i = 0; i < clientIds.length; i += 80) {
    const chunk = clientIds.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db.prepare(`
      SELECT client_id, MAX(order_date) AS last_order
      FROM orders
      WHERE client_id IN (${ph})
      GROUP BY client_id
    `).bind(...chunk).all<{ client_id: number; last_order: string }>()
    for (const row of results || []) {
      if (row.last_order) lastOrder[Number(row.client_id)] = row.last_order
    }
  }

  const cutoff = new Date(Date.now() + 9 * 3600 * 1000)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - CONSENT_EXEMPT_MONTHS)
  const cutoffYmd = cutoff.toISOString().slice(0, 10)

  const sendable: AdReceiver[] = []
  const stale: AdReceiver[] = []
  const unknown: AdReceiver[] = []

  for (const r of afterOptOut) {
    const cid = Number(r.client_id)
    const last = cid > 0 ? lastOrder[cid] : undefined
    r.last_order_date = last || null
    if (!last) {
      unknown.push(r)          // 거래 이력 없음/거래처 미매칭 → 동의 근거 없음
    } else if (last < cutoffYmd) {
      stale.push(r)            // 6개월 경과 → 예외 불성립
    } else {
      sendable.push(r)
    }
  }

  return { sendable, excluded: { optOut, stale, unknown, invalid } }
}

// ────────────────────────────────────────────────────────────────────────────
// 발송 전 공통 검증 — 야간·채널·이미지
// ────────────────────────────────────────────────────────────────────────────

interface AdGuardResult { error?: string; sndDT?: string }

function guardAdSend(content: any, channel: string): AdGuardResult {
  // 채널: SMS(90byte)로는 (광고) + 수신거부 URL이 본문을 다 먹어 실질 내용이 안 들어간다 → LMS/MMS만.
  if (channel !== 'lms' && channel !== 'mms') {
    return { error: '광고 발송은 장문(LMS) 또는 MMS만 가능합니다. 단문(SMS)은 (광고) 표기와 수신거부 안내를 담을 수 없습니다.' }
  }

  // 야간 차단 — 예약이면 예약 시각으로, 아니면 지금으로 판정(§50③)
  const sndDT: string | undefined = content.sndDT || undefined
  const at = parseSendDT(sndDT)
  const hour = isNightTimeKst(at || undefined)
  if (hour >= 0) {
    const when = at ? '예약 시각' : '현재'
    return {
      error: `${when}이 ${String(hour).padStart(2, '0')}시입니다. 광고성 정보는 21시~익일 08시에 전송할 수 없습니다(정보통신망법 §50③). 08시 이후로 예약해주세요.`,
    }
  }
  return { sndDT }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /preview — 대상·본문 미리보기 (발송·과금 없음)
// ────────────────────────────────────────────────────────────────────────────
messagesAdRouter.post('/preview', async (c) => {
  try {
    const body = await c.req.json() as any
    const content = body.content || {}
    const receivers: BulkReceiver[] = (body.receivers || [])
    if (!content.body) return c.json({ success: false, error: 'content.body는 필수입니다.' }, 400)
    if (receivers.length === 0) return c.json({ success: false, error: '수신자가 없습니다.' }, 400)

    const audience = await resolveAdAudience(c, receivers)

    // 본문 미리보기(앞 3명) — 실제 발송과 동일하게 (광고) 접두 + 수신거부 문구를 붙여 보여준다.
    const sample = audience.sendable.slice(0, 3)
    let previews: Array<{ name: string; phone: string; body: string; unresolved: string[] }> = []
    if (sample.length > 0) {
      const varCtx = await buildBulkVarContext(c, sample)
      previews = sample.map(r => {
        const resolved = applyVars(content.body, varCtx.varsFor(r))
        const demo = withAdPrefix(resolved) + unsubscribeFooter('https://.../unsubscribe?t=xxxx')
        return { name: r.name || '', phone: r.phone || '', body: demo, unresolved: unresolvedVars(resolved) }
      })
    }

    const brief = (arr: AdReceiver[]) => arr.slice(0, 200).map(r => ({
      name: r.name || '', phone: r.phone || '', client_id: r.client_id || null, last_order_date: r.last_order_date || null,
    }))

    return c.json({
      success: true,
      data: {
        total: receivers.length,
        sendable_count: audience.sendable.length,
        excluded: {
          opt_out: audience.excluded.optOut.length,
          stale: audience.excluded.stale.length,
          unknown: audience.excluded.unknown.length,
          invalid: audience.excluded.invalid.length,
        },
        excluded_list: {
          opt_out: brief(audience.excluded.optOut),
          stale: brief(audience.excluded.stale),
          unknown: brief(audience.excluded.unknown),
          invalid: brief(audience.excluded.invalid),
        },
        previews,
        available_vars: BULK_VAR_NAMES,
        exempt_months: CONSENT_EXEMPT_MONTHS,
      }
    })
  } catch (error) {
    console.error('src/routes/messagesAd.ts POST /preview error:', error)
    return c.json({ success: false, error: '미리보기 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send — 광고 발송
// ────────────────────────────────────────────────────────────────────────────
messagesAdRouter.post('/send', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const channel: string = body.channel
    const content = body.content || {}
    const receivers: BulkReceiver[] = body.receivers || []

    if (!content.body) return c.json({ success: false, error: 'content.body는 필수입니다.' }, 400)
    if (receivers.length === 0) return c.json({ success: false, error: '발송 대상이 없습니다.' }, 400)

    const guard = guardAdSend(content, channel)
    if (guard.error) return c.json({ success: false, error: guard.error }, 400)

    // ── 대상 필터 ──
    const audience = await resolveAdAudience(c, receivers)
    if (audience.sendable.length === 0) {
      return c.json({
        success: false,
        error: `발송 가능한 대상이 없습니다. (수신거부 ${audience.excluded.optOut.length}건, `
          + `${CONSENT_EXEMPT_MONTHS}개월 경과 ${audience.excluded.stale.length}건, `
          + `거래이력 확인불가 ${audience.excluded.unknown.length}건)`,
      }, 400)
    }

    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호(kakao_sender_num)가 설정되지 않았습니다.' }, 400)
    }
    const provider = await getKakaoProvider(c)
    if (!provider) return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)

    // ── MMS 이미지·건수 검증 ──
    let mmsImage = ''
    if (channel === 'mms') {
      mmsImage = typeof content.image_base64 === 'string' ? stripDataUri(content.image_base64).replace(/\s/g, '') : ''
      if (!mmsImage) return c.json({ success: false, error: 'MMS는 첨부 이미지가 필요합니다.' }, 400)
      const bytes = Math.floor((mmsImage.length * 3) / 4)
      if (bytes > MMS_IMAGE.MAX_BYTES) {
        return c.json({
          success: false,
          error: `이미지 용량이 큽니다 (${Math.round(bytes / 1024)}KB / 최대 ${Math.round(MMS_IMAGE.MAX_BYTES / 1024)}KB).`,
        }, 400)
      }
      const limitRow = await db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'mms_bulk_limit'")
        .first<{ setting_value: string }>()
      const limit = Math.max(1, parseInt(limitRow?.setting_value || '', 10) || AD_MMS_LIMIT_DEFAULT)
      if (audience.sendable.length > limit) {
        return c.json({
          success: false,
          error: `MMS 발송은 1회 ${limit}건까지입니다 (대상 ${audience.sendable.length}건, 예상 ${(audience.sendable.length * 100).toLocaleString()}원).`,
        }, 400)
      }
    }

    // ── 본문 조립: 변수 치환 → (광고) 접두 → 수신거부 링크(수신자별) ──
    const siteUrlSetting = await db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'site_base_url'")
      .first<{ setting_value: string }>()
    const baseUrl = siteUrlSetting?.setting_value || new URL(c.req.url).origin

    const varCtx = await buildBulkVarContext(c, audience.sendable)

    // 미치환 변수는 발송 차단 — "#{고객명}"이 그대로 찍힌 광고가 나가면 되돌릴 수 없다
    const firstResolved = applyVars(content.body, varCtx.varsFor(audience.sendable[0]))
    const leftover = unresolvedVars(firstResolved)
    if (leftover.length > 0) {
      return c.json({
        success: false,
        error: `값을 찾지 못한 변수가 있습니다: ${leftover.map(v => '#{' + v + '}').join(', ')}.`,
      }, 400)
    }

    const messages: SMSMessage[] = []
    for (const r of audience.sendable) {
      const token = await getOrCreateUnsubToken(db, r.phoneNorm, r.client_id ?? null)
      const url = buildUnsubscribeUrl(baseUrl, token)
      const resolved = applyVars(content.body, varCtx.varsFor(r))
      messages.push({
        rcv: r.phone!,
        rcvnm: r.name || '수신자',
        msg: withAdPrefix(resolved) + unsubscribeFooter(url),
      })
    }

    // 제목에도 (광고)를 붙인다 — 시행령 §62의3은 "제목이 시작되는 부분"을 규정한다.
    const subject = withAdPrefix(content.subject || '동산기획')

    let sendResult
    if (channel === 'mms') {
      sendResult = await provider.sendMMS({
        snd: kakaoSettings.senderNum,
        subject,
        content: messages[0].msg || '',
        imageBase64: mmsImage,
        messages,
        sndDT: guard.sndDT,
      })
    } else {
      sendResult = await provider.sendLMS({
        snd: kakaoSettings.senderNum,
        subject,
        content: messages[0].msg || '',
        messages,
        sndDT: guard.sndDT,
      })
    }

    const logId = await insertSendLog(db, {
      receiptNum: sendResult.receiptNum,
      templateCode: channel === 'mms' ? 'MMS' : 'LMS',
      receiverNum: `AD(${messages.length})`,
      receiverName: '광고발송',
      relatedType: 'ad',
      relatedId: null,
      clientId: null,
      content: messages[0].msg || '',
      altContent: channel === 'mms' ? `[이미지 ${Math.round((mmsImage.length * 3) / 4 / 1024)}KB]` : (messages[0].msg || ''),
      status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      resultCode: sendResult.code,
      resultMessage: sendResult.message,
      sentBy: userId,
      channel: channel === 'mms' ? 'mms' : 'sms',
      entityId: getEntityId(c),
      messageType: 'AD',
    })

    const perItem = sendResult.results || []
    const successCount = perItem.length > 0 ? perItem.filter(r => r.ok).length : (sendResult.receiptNum ? messages.length : 0)

    return c.json({
      success: true,
      data: {
        log_id: logId,
        receipt_num: sendResult.receiptNum,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        message: sendResult.message,
        channel,
        receiver_count: messages.length,
        success_count: successCount,
        fail_count: messages.length - successCount,
        excluded: {
          opt_out: audience.excluded.optOut.length,
          stale: audience.excluded.stale.length,
          unknown: audience.excluded.unknown.length,
          invalid: audience.excluded.invalid.length,
        },
      }
    })
  } catch (error) {
    console.error('src/routes/messagesAd.ts POST /send error:', error)
    return c.json({ success: false, error: '광고 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// 금지어 관리 (정보성 발송의 광고 문구 차단에 쓰임)
// ────────────────────────────────────────────────────────────────────────────
messagesAdRouter.get('/banned-words', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, word, is_active, created_at FROM ad_banned_words ORDER BY is_active DESC, word'
    ).all()
    return c.json({ success: true, data: results || [] })
  } catch (error) {
    console.error('src/routes/messagesAd.ts GET /banned-words error:', error)
    return c.json({ success: false, error: '금지어 조회 실패' }, 500)
  }
})

messagesAdRouter.post('/banned-words', async (c) => {
  try {
    const body = await c.req.json() as any
    const word = String(body.word || '').trim()
    if (!word) return c.json({ success: false, error: '단어를 입력해주세요.' }, 400)
    if (word.length > 30) return c.json({ success: false, error: '단어가 너무 깁니다(30자 이내).' }, 400)

    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO ad_banned_words (word, created_by) VALUES (?, ?)'
    ).bind(word, c.get('user').id).run()
    // 비활성 상태로 남아 있던 단어를 다시 추가하면 활성화한다
    await c.env.DB.prepare('UPDATE ad_banned_words SET is_active = 1 WHERE word = ?').bind(word).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/messagesAd.ts POST /banned-words error:', error)
    return c.json({ success: false, error: '금지어 추가 실패' }, 500)
  }
})

messagesAdRouter.delete('/banned-words/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    if (!id) return c.json({ success: false, error: 'id가 필요합니다.' }, 400)
    await c.env.DB.prepare('DELETE FROM ad_banned_words WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/messagesAd.ts DELETE /banned-words/:id error:', error)
    return c.json({ success: false, error: '금지어 삭제 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// 수신거부 명단 (전화·방문 요청을 직원이 등록할 수 있어야 한다 — §50⑤ 방해 금지)
// ────────────────────────────────────────────────────────────────────────────
messagesAdRouter.get('/opt-outs', async (c) => {
  try {
    const search = c.req.query('search') || ''
    const like = `%${normalizePhone(search) || search}%`
    const { results } = await c.env.DB.prepare(`
      SELECT o.id, o.phone, o.client_id, c.client_name, o.source, o.reason, o.created_at
      FROM message_opt_outs o
      LEFT JOIN clients c ON o.client_id = c.id
      ${search ? 'WHERE o.phone LIKE ? OR c.client_name LIKE ?' : ''}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 300
    `).bind(...(search ? [like, like] : [])).all()
    return c.json({ success: true, data: results || [] })
  } catch (error) {
    console.error('src/routes/messagesAd.ts GET /opt-outs error:', error)
    return c.json({ success: false, error: '수신거부 명단 조회 실패' }, 500)
  }
})

messagesAdRouter.post('/opt-outs', async (c) => {
  try {
    const body = await c.req.json() as any
    const phone = normalizePhone(body.phone)
    if (phone.length < 9) return c.json({ success: false, error: '전화번호를 확인해주세요.' }, 400)

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO message_opt_outs (phone, client_id, source, reason, created_by)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      phone,
      body.client_id ? Number(body.client_id) : null,
      body.source === 'CALL' ? 'CALL' : 'MANUAL',
      String(body.reason || '').slice(0, 200) || null,
      c.get('user').id,
    ).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/messagesAd.ts POST /opt-outs error:', error)
    return c.json({ success: false, error: '수신거부 등록 실패' }, 500)
  }
})

messagesAdRouter.delete('/opt-outs/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    if (!id) return c.json({ success: false, error: 'id가 필요합니다.' }, 400)
    await c.env.DB.prepare('DELETE FROM message_opt_outs WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/messagesAd.ts DELETE /opt-outs/:id error:', error)
    return c.json({ success: false, error: '수신거부 해제 실패' }, 500)
  }
})

export default messagesAdRouter
export { AD_PREFIX, getBannedWords }
