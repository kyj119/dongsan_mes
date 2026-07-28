// ============================================================================
// 통합 메시지 발송 라우터 (/api/messages)
// 채널: kakao | sms | email | fax
// 기존 /api/kakao/* 는 하위 호환 유지
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { sendEmail } from '../services/emailProvider'
import { baseLayout } from '../services/emailTemplates'
import { getKakaoProvider, getKakaoSettings } from './kakao'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import type { SMSMessage, ATSMessage } from './kakao'
import { generatePortalToken } from './portal'
import { MMS_IMAGE } from '../constants/barobillCodes'
import { stripDataUri } from '../utils/thumbnailStore'
import { deriveClientBalancesBulk } from './ledger/ar-helpers'
import { kstYmd } from '../utils/kstDate'
import messagesAdRouter from './messagesAd'
import { getBannedWords, findBannedWords } from '../services/messageCompliance'
import { checkBulkLimit, type BulkChannel } from '../services/messageBulkLimit'
import type { Context } from 'hono'

/**
 * base64 문자열의 디코드 후 바이트 수 (atob 없이 길이 산술 — 수백KB 문자열 복사 회피).
 * 공백/개행이 섞여도 되도록 whitespace는 제외하고 계산한다.
 */
// ────────────────────────────────────────────────────────────────────────────
// 대량 발송 변수 치환 (#{변수})
//
// 알림톡은 승인 템플릿과 글자 단위로 일치해야 하고 #{} 자리만 치환 가능하다.
// 기존 대량 발송은 전 수신자에게 동일 본문을 보내 #{고객명}이 리터럴로 나갔다
// (출고 경로 kakao.ts resolveMsg만 수신자별 치환을 하고 있었음) → 여기서 공통화한다.
// ────────────────────────────────────────────────────────────────────────────

/** 수신자별 기본 변수 이름 — 문서·UI 도움말과 단일 소스로 맞춘다. */
export const BULK_VAR_NAMES = ['거래처명', '고객명', '연락처', '대표자', '거래처코드', '미수금', '날짜', '기준일', '회사명'] as const

/** `#{변수}` 치환. 정의되지 않은 변수는 남겨두고 호출부가 미치환 검사로 잡는다. */
export function applyVars(template: string, vars: Record<string, string>): string {
  return template.replace(/#\{([^}]+)\}/g, (whole, name) => {
    const key = String(name).trim()
    return Object.prototype.hasOwnProperty.call(vars, key) ? (vars[key] ?? '') : whole
  })
}

/** 본문에 남은 미치환 변수명 목록 (중복 제거) */
export function unresolvedVars(text: string): string[] {
  const found = Array.from(text.matchAll(/#\{([^}]+)\}/g)).map(m => String(m[1]).trim())
  return Array.from(new Set(found))
}

export interface BulkReceiver { name?: string; phone?: string; client_id?: number; vars?: Record<string, string> }

/**
 * 수신자별 변수 해석기 — 거래처 정보·미수금·법인명·오늘 날짜를 한 번에 준비한다.
 * 미수금은 거래처당 3쿼리(deriveClientBalance)라 대량에선 못 쓰므로 IN 그룹쿼리 일괄판을 사용.
 * 엑셀/CSV로 들어온 vars가 자동 변수보다 **우선**한다(사용자가 명시한 값이 정답).
 */
export async function buildBulkVarContext(c: Context<HonoEnv>, receivers: BulkReceiver[]) {
  const db = c.env.DB
  const clientIds = receivers.map(r => Number(r.client_id)).filter(n => Number.isFinite(n) && n > 0)

  const info: Record<number, { client_name: string; client_code: string; representative: string }> = {}
  for (let i = 0; i < clientIds.length; i += 80) {
    const chunk = clientIds.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await db.prepare(
      `SELECT id, client_name, client_code, representative FROM clients WHERE id IN (${ph})`
    ).bind(...chunk).all<{ id: number; client_name: string; client_code: string; representative: string }>()
    for (const r of results || []) {
      info[Number(r.id)] = {
        client_name: r.client_name || '',
        client_code: r.client_code || '',
        representative: r.representative || '',
      }
    }
  }

  // 미수금은 본문에서 실제로 쓸 때만 계산(수백 명 발송에서 불필요한 부하 회피)
  let balances: Record<number, number> = {}
  const needsBalance = clientIds.length > 0
  if (needsBalance) balances = await deriveClientBalancesBulk(c, clientIds)

  const entityRow = await db.prepare('SELECT name FROM entities WHERE id = ?')
    .bind(c.get('entityId') || 1).first<{ name: string }>()
  const companyName = entityRow?.name || '동산기획'
  const today = kstYmd()

  return {
    varsFor(r: BulkReceiver): Record<string, string> {
      const ci = r.client_id ? info[Number(r.client_id)] : undefined
      const bal = r.client_id ? balances[Number(r.client_id)] : undefined
      const name = r.name || ci?.client_name || ''
      return {
        거래처명: name,
        고객명: name,                                   // 승인 템플릿이 '고객명'을 쓰므로 동의어 제공
        연락처: r.phone || '',
        대표자: ci?.representative || '',
        거래처코드: ci?.client_code || '',
        미수금: bal != null ? Math.round(bal).toLocaleString() : '',
        날짜: today,
        기준일: today,
        회사명: companyName,
        ...(r.vars || {}),                              // 엑셀 열 우선
      }
    }
  }
}

function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s/g, '')
  if (clean.length === 0) return 0
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor((clean.length * 3) / 4) - pad
}

const messagesRouter = new Hono<HonoEnv>()
messagesRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// 광고성 발송은 별도 경로 + ADMIN 전용 (정보통신망법 §50 강제 가드) — src/routes/messagesAd.ts
messagesRouter.route('/ad', messagesAdRouter)

// ────────────────────────────────────────────────────────────────────────────
// 공통: 로그 저장 헬퍼
// ────────────────────────────────────────────────────────────────────────────
export async function insertSendLog(db: D1Database, log: {
  receiptNum: string
  templateCode: string
  receiverNum: string
  receiverName: string | null
  relatedType: string | null
  relatedId: number | null
  clientId: number | null
  content: string
  altContent: string
  status: string
  resultCode: number | string | null
  resultMessage: string | null
  sentBy: number
  channel: string
  entityId: number
  /** INFO(거래 관련 통지) | AD(영리목적 광고성). 분쟁 시 "정보성이었다"의 입증 근거 — 마이그 0479. */
  messageType?: 'INFO' | 'AD'
}): Promise<number> {
  const result = await db.prepare(
    `INSERT INTO kakao_send_logs (
      receipt_num, template_code, receiver_num, receiver_name,
      related_type, related_id, client_id, content, alt_content,
      status, result_code, result_message, sent_by, channel, entity_id, message_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    log.receiptNum,
    log.templateCode,
    log.receiverNum,
    log.receiverName,
    log.relatedType,
    log.relatedId,
    log.clientId,
    log.content,
    log.altContent,
    log.status,
    log.resultCode,
    log.resultMessage,
    log.sentBy,
    log.channel,
    log.entityId,
    log.messageType || 'INFO',
  ).run()
  return result.meta.last_row_id
}

// ────────────────────────────────────────────────────────────────────────────
// POST /send — 통합 단건 발송
// ────────────────────────────────────────────────────────────────────────────
messagesRouter.post('/send', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const channel: 'kakao' | 'sms' | 'mms' | 'email' | 'fax' = body.channel
    const receiver = body.receiver || {}
    const content = body.content || {}
    const ctx = body.context || {}

    if (!channel) {
      return c.json({ success: false, error: 'channel은 필수입니다.' }, 400)
    }

    // ── 포털 링크 자동 생성 ────────────────────────────────────────────────
    if (body.include_portal_link && ctx.client_id) {
      const siteUrlSetting = await c.env.DB.prepare(
        "SELECT setting_value FROM settings WHERE setting_key = 'site_base_url'"
      ).first<{ setting_value: string }>()
      const baseUrl: string = siteUrlSetting?.setting_value || new URL(c.req.url).origin

      const { token, url } = await generatePortalToken(db, Number(ctx.client_id), userId, baseUrl)

      if (channel === 'kakao') {
        // body와 버튼 URL의 #{토큰} 플레이스홀더 치환
        if (typeof content.body === 'string') {
          content.body = content.body.replace(/#{토큰}/g, token)
        }
        if (Array.isArray(content.buttons)) {
          content.buttons = content.buttons.map((btn: any) => ({
            ...btn,
            linkMo: typeof btn.linkMo === 'string' ? btn.linkMo.replace(/#{토큰}/g, token) : btn.linkMo,
            linkPc: typeof btn.linkPc === 'string' ? btn.linkPc.replace(/#{토큰}/g, token) : btn.linkPc,
          }))
        }
      } else if (channel === 'sms' || channel === 'mms') {
        if (typeof content.body === 'string') {
          content.body = content.body + `\n\n거래내역 확인: ${url}`
        }
      } else if (channel === 'email') {
        if (typeof content.body === 'string') {
          content.body = content.body + `<div style="margin-top:24px;text-align:center;"><a href="${url}" style="display:inline-block;padding:12px 24px;background:#1a56db;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">거래 내역 확인</a></div>`
        }
      }
    }

    // ── 팩스: fax_enabled 설정 확인 ────────────────────────────────────────
    if (channel === 'fax') {
      const faxEnabledRow = await c.env.DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'fax_enabled'").first<{ setting_value: string }>()
      if (!faxEnabledRow || faxEnabledRow.setting_value !== '1') {
        return c.json({ success: false, error: '팩스 발송이 비활성화되어 있습니다. 설정에서 활성화해주세요.' }, 400)
      }
    }

    // ── 이메일 ────────────────────────────────────────────────────────────
    if (channel === 'email') {
      if (!receiver.email) {
        return c.json({ success: false, error: 'email 채널에서는 receiver.email이 필요합니다.' }, 400)
      }
      if (!content.subject) {
        return c.json({ success: false, error: 'email 채널에서는 content.subject가 필요합니다.' }, 400)
      }
      if (!content.body) {
        return c.json({ success: false, error: 'email 채널에서는 content.body가 필요합니다.' }, 400)
      }

      // HTML 래핑: 수동 발송도 이메일 템플릿 레이아웃 적용
      const wrappedHtml = baseLayout(content.body)

      const emailResult = await sendEmail(
        c.env,
        db,
        {
          to: receiver.email,
          subject: content.subject,
          html: wrappedHtml,
        },
        {
          template: 'MANUAL',
          relatedType: ctx.type || undefined,
          relatedId: ctx.id || undefined,
          sentBy: userId,
        }
      )

      if (!emailResult.success) {
        // 이메일 실패 로그 (kakao_send_logs 에도 기록)
        const logId = await insertSendLog(db, {
          receiptNum: emailResult.id || '',
          templateCode: 'EMAIL',
          receiverNum: receiver.email,
          receiverName: receiver.name || null,
          relatedType: ctx.type || null,
          relatedId: ctx.id || null,
          clientId: ctx.client_id || null,
          content: content.body,
          altContent: content.body,
          status: 'FAILED',
          resultCode: null,
          resultMessage: emailResult.error || null,
          sentBy: userId,
          channel: 'email',
          entityId: getEntityId(c),
        })
        return c.json({ success: false, error: emailResult.error }, 500)
      }

      const logId = await insertSendLog(db, {
        receiptNum: emailResult.id || '',
        templateCode: 'EMAIL',
        receiverNum: receiver.email,
        receiverName: receiver.name || null,
        relatedType: ctx.type || null,
        relatedId: ctx.id || null,
        clientId: ctx.client_id || null,
        content: content.body,
        altContent: content.body,
        status: 'SUCCESS',
        resultCode: null,
        resultMessage: null,
        sentBy: userId,
        channel: 'email',
        entityId: getEntityId(c),
      })

      return c.json({
        success: true,
        data: { log_id: logId, receipt_num: emailResult.id, status: 'SUCCESS', channel: 'email' }
      })
    }

    // ── 카카오톡 / SMS — 바로빌 Provider 공통 준비 ──────────────────────────
    if (!receiver.phone) {
      return c.json({ success: false, error: `${channel} 채널에서는 receiver.phone이 필요합니다.` }, 400)
    }
    if (!content.body) {
      return c.json({ success: false, error: 'content.body는 필수입니다.' }, 400)
    }

    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호(kakao_sender_num)가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // ── 카카오톡 ────────────────────────────────────────────────────────
    if (channel === 'kakao') {
      if (!content.template_code) {
        return c.json({ success: false, error: 'kakao 채널에서는 content.template_code가 필요합니다.' }, 400)
      }
      if (!kakaoSettings.enabled) {
        return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
      }

      const atsMsg: ATSMessage = {
        rcv: receiver.phone,
        rcvnm: receiver.name || '고객',
        msg: content.body,
        altmsg: content.body,
        btns: content.buttons || undefined,
      }

      const sendResult = await provider.sendATS({
        templateCode: content.template_code,
        snd: kakaoSettings.senderNum,
        content: content.body,
        altSendType: kakaoSettings.altSendType,
        messages: [atsMsg],
        sndDT: content.sndDT || undefined,
      })

      const logId = await insertSendLog(db, {
        receiptNum: sendResult.receiptNum,
        templateCode: content.template_code,
        receiverNum: receiver.phone,
        receiverName: receiver.name || null,
        relatedType: ctx.type || null,
        relatedId: ctx.id || null,
        clientId: ctx.client_id || null,
        content: content.body,
        altContent: content.body,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        resultCode: sendResult.code,
        resultMessage: sendResult.receiptNum ? `접수완료 (${sendResult.receiptNum})` : sendResult.message,
        sentBy: userId,
        channel: 'kakao',
        entityId: getEntityId(c),
      })

      return c.json({
        success: true,
        data: {
          log_id: logId,
          receipt_num: sendResult.receiptNum,
          status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
          channel: 'kakao',
        }
      })
    }

    // ── SMS / LMS ────────────────────────────────────────────────────────
    if (channel === 'sms') {
      const smsMsg: SMSMessage = {
        rcv: receiver.phone,
        rcvnm: receiver.name || '수신자',
      }

      // 바이트 수 기반 SMS/LMS 자동 전환 (EUC-KR 기준: 한글 2byte, ASCII 1byte, SMS 한도 90byte)
      const bodyBytes = [...content.body].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)
      const isLms = !!content.subject || bodyBytes > 90
      let sendResult

      if (isLms) {
        sendResult = await provider.sendLMS({
          snd: kakaoSettings.senderNum,
          subject: content.subject || '동산기획',
          content: content.body,
          messages: [smsMsg],
          sndDT: content.sndDT || undefined,
        })
      } else {
        sendResult = await provider.sendSMS({
          snd: kakaoSettings.senderNum,
          content: content.body,
          messages: [smsMsg],
          sndDT: content.sndDT || undefined,
        })
      }

      const templateCode = isLms ? 'LMS' : 'SMS'

      const logId = await insertSendLog(db, {
        receiptNum: sendResult.receiptNum,
        templateCode,
        receiverNum: receiver.phone,
        receiverName: receiver.name || null,
        relatedType: ctx.type || null,
        relatedId: ctx.id || null,
        clientId: ctx.client_id || null,
        content: content.body,
        altContent: content.body,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        resultCode: sendResult.code,
        resultMessage: sendResult.receiptNum ? `접수완료 (${sendResult.receiptNum})` : sendResult.message,
        sentBy: userId,
        channel: 'sms',
        entityId: getEntityId(c),
      })

      return c.json({
        success: true,
        data: {
          log_id: logId,
          receipt_num: sendResult.receiptNum,
          status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
          channel: 'sms',
          type: templateCode,
        }
      })
    }

    // ── MMS (문자 그림) ──────────────────────────────────────────────────
    // 이미지 1장 + 장문. 100원/건(LMS의 약 3배)이라 대량 발송(/send-bulk)에서는 막고 단건만 허용한다.
    // 이미지 리사이즈/압축은 브라우저 canvas 담당(Workers엔 이미지 처리기 없음) — 여기선 용량만 방어 검증.
    if (channel === 'mms') {
      const rawImage = typeof content.image_base64 === 'string' ? stripDataUri(content.image_base64).replace(/\s/g, '') : ''
      if (!rawImage) {
        return c.json({ success: false, error: 'mms 채널에서는 content.image_base64(이미지)가 필요합니다.' }, 400)
      }
      const imgBytes = base64ByteLength(rawImage)
      if (imgBytes > MMS_IMAGE.MAX_BYTES) {
        return c.json({
          success: false,
          error: `이미지 용량이 큽니다 (${Math.round(imgBytes / 1024)}KB / 최대 ${Math.round(MMS_IMAGE.MAX_BYTES / 1024)}KB). 더 작은 이미지를 사용해주세요.`,
        }, 400)
      }

      const sendResult = await provider.sendMMS({
        snd: kakaoSettings.senderNum,
        subject: content.subject || '동산기획',
        content: content.body,
        imageBase64: rawImage,
        messages: [{ rcv: receiver.phone, rcvnm: receiver.name || '수신자' }],
        sndDT: content.sndDT || undefined,
      })

      // ⚠️ 로그 content에는 본문만 저장 — base64를 넣으면 D1이 급팽창(확장성 감사 P3 R2 이관 취지 역행).
      const logId = await insertSendLog(db, {
        receiptNum: sendResult.receiptNum,
        templateCode: 'MMS',
        receiverNum: receiver.phone,
        receiverName: receiver.name || null,
        relatedType: ctx.type || null,
        relatedId: ctx.id || null,
        clientId: ctx.client_id || null,
        content: content.body,
        altContent: `[이미지 ${Math.round(imgBytes / 1024)}KB]`,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        resultCode: sendResult.code,
        resultMessage: sendResult.receiptNum ? `접수완료 (${sendResult.receiptNum})` : sendResult.message,
        sentBy: userId,
        channel: 'mms',
        entityId: getEntityId(c),
      })

      return c.json({
        success: true,
        data: {
          log_id: logId,
          receipt_num: sendResult.receiptNum,
          status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
          message: sendResult.message,
          channel: 'mms',
          type: 'MMS',
        }
      })
    }

    return c.json({ success: false, error: '지원하지 않는 채널입니다.' }, 400)
  } catch (error) {
    console.error('src/routes/messages.ts POST /send error:', error)
    return c.json({ success: false, error: '메시지 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /logs — 통합 발송 이력 조회 (channel 필터 추가)
// ────────────────────────────────────────────────────────────────────────────
messagesRouter.get('/logs', async (c) => {
  try {
    const db = c.env.DB

    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '30', 10)))
    const channel = c.req.query('channel')
    const status = c.req.query('status')
    const relatedType = c.req.query('related_type')
    const dateFrom = c.req.query('date_from')
    const dateTo = c.req.query('date_to')
    const search = c.req.query('search')

    const whereConditions: string[] = []
    const bindings: any[] = []

    // #448: cross-tenant read 차단 — entity 조건을 공용 whereClause에 병합(count·main 동시 적용). ADMIN(0)=무필터.
    const efMsg = entityFilter(c, 'ksl')
    if (efMsg.clause) {
      whereConditions.push(efMsg.clause.replace(/^ AND /, ''))
      bindings.push(...efMsg.params)
    }

    if (channel) {
      whereConditions.push('ksl.channel = ?')
      bindings.push(channel)
    }
    if (status) {
      whereConditions.push('ksl.status = ?')
      bindings.push(status)
    }
    if (relatedType) {
      whereConditions.push('ksl.related_type = ?')
      bindings.push(relatedType)
    }
    if (dateFrom) {
      whereConditions.push("DATE(ksl.created_at) >= ?")
      bindings.push(dateFrom)
    }
    if (dateTo) {
      whereConditions.push("DATE(ksl.created_at) <= ?")
      bindings.push(dateTo)
    }
    if (search) {
      whereConditions.push("(ksl.receiver_num LIKE ? OR ksl.receiver_name LIKE ? OR ksl.content LIKE ?)")
      const like = `%${search}%`
      bindings.push(like, like, like)
    }

    const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : ''

    const countResult = await db.prepare(
      `SELECT COUNT(*) as total FROM kakao_send_logs ksl${whereClause}`
    ).bind(...bindings).first<{ total: number }>()
    const total = countResult?.total || 0

    const offset = (page - 1) * limit
    const query = `
      SELECT
        ksl.id,
        ksl.receipt_num,
        ksl.template_code,
        ksl.receiver_num,
        ksl.receiver_name,
        ksl.related_type,
        ksl.related_id,
        ksl.client_id,
        c.client_name,
        ksl.content,
        ksl.status,
        ksl.result_code,
        ksl.result_message,
        ksl.sent_by,
        u.name as user_name,
        ksl.channel,
        ksl.created_at
      FROM kakao_send_logs ksl
      LEFT JOIN clients c ON ksl.client_id = c.id
      LEFT JOIN users u ON ksl.sent_by = u.id
      ${whereClause}
      ORDER BY ksl.created_at DESC, ksl.id DESC
      LIMIT ? OFFSET ?
    `

    const queryBindings = [...bindings, limit, offset]
    const { results: logs } = await db.prepare(query).bind(...queryBindings).all()

    return c.json({
      success: true,
      data: {
        logs: logs || [],
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    })
  } catch (error) {
    console.error('src/routes/messages.ts GET /logs error:', error)
    return c.json({ success: false, error: '발송 이력 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-bulk — 대량 발송 (kakao | sms | email)
// ────────────────────────────────────────────────────────────────────────────
messagesRouter.post('/send-bulk', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const channel: 'kakao' | 'sms' | 'mms' | 'email' = body.channel
    const content = body.content || {}
    const targetType: 'clients' | 'employees' | 'custom' = body.target_type || 'custom'

    if (!channel) {
      return c.json({ success: false, error: 'channel은 필수입니다.' }, 400)
    }
    if (!content.body) {
      return c.json({ success: false, error: 'content.body는 필수입니다.' }, 400)
    }

    // ── 광고 문구 차단 (정보통신망법 §50) ──────────────────────────────────
    // 이 라우트는 "정보성" 전용이다. 할인·이벤트 같은 광고 문구가 섞이면 (광고) 표기·수신거부
    // 안내 없이 광고성 정보를 보내는 셈이 되고, 과태료는 직원이 아니라 사업자에게 귀속된다.
    //  - 대량 발송만 검사한다. 단건(/send)은 시안 확인·배송 안내 같은 1:1 거래 통신이라
    //    광고성 위험이 낮고, 오탐으로 업무를 막는 손해가 더 크다.
    //  - 알림톡(kakao)은 제외 — 카카오가 승인 템플릿을 강제해 이미 정보성 게이트가 있다.
    if (channel !== 'kakao') {
      const banned = await getBannedWords(db)
      const hits = findBannedWords(String(content.body) + ' ' + String(content.subject || ''), banned)
      if (hits.length > 0) {
        return c.json({
          success: false,
          error: `광고성 문구가 포함되어 있습니다: ${hits.join(', ')}. `
            + `광고 문자는 (광고) 표기·수신거부 안내·수신동의가 필요합니다. `
            + `[광고 발송] 탭에서 보내주세요(관리자 전용). 오탐이면 광고 발송 탭에서 금지어를 삭제할 수 있습니다.`,
          banned_hits: hits,
        }, 400)
      }
    }

    // ── 이메일 대량 발송 ─────────────────────────────────────────────────
    if (channel === 'email') {
      let receivers: Array<{ name?: string; email?: string; client_id?: number }> = body.receivers || []

      if (targetType === 'clients') {
        const { results: clientRows } = await db.prepare(
          `SELECT client_name, email FROM clients WHERE email IS NOT NULL AND email != '' ORDER BY client_name`
        ).all<{ client_name: string; email: string }>()
        receivers = (clientRows || []).map((r) => ({ name: r.client_name, email: r.email }))
      }

      if (receivers.length === 0) {
        return c.json({ success: false, error: '이메일 발송 대상이 없습니다.' }, 400)
      }
      if (!content.subject) {
        return c.json({ success: false, error: 'email 대량 발송에서는 content.subject가 필요합니다.' }, 400)
      }

      let successCount = 0
      let failCount = 0

      for (const r of receivers) {
        if (!r.email) continue
        const result = await sendEmail(
          c.env,
          db,
          { to: r.email, subject: content.subject, html: content.body },
          { template: 'BULK', sentBy: userId }
        )
        if (result.success) successCount++
        else failCount++
      }

      return c.json({
        success: true,
        data: {
          channel: 'email',
          total: receivers.length,
          success_count: successCount,
          fail_count: failCount,
        }
      })
    }

    // ── 카카오 / SMS 대량 발송 — 바로빌 Provider ───────────────────────────
    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호(kakao_sender_num)가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 수신자 목록 구성. vars = 엑셀/CSV 추가 열(헤더명이 변수명)
    let rawReceivers: Array<{ name?: string; phone?: string; client_id?: number; vars?: Record<string, string> }> = body.receivers || []

    if (targetType === 'clients') {
      const { results: clientRows } = await db.prepare(
        `SELECT id, client_name, mobile FROM clients WHERE mobile IS NOT NULL AND mobile != '' ORDER BY client_name`
      ).all<{ id: number; client_name: string; mobile: string }>()
      rawReceivers = (clientRows || []).map((r) => ({ name: r.client_name, phone: r.mobile, client_id: r.id }))
    } else if (targetType === 'employees') {
      const { results: empRows } = await db.prepare(
        `SELECT name, phone FROM employees WHERE phone IS NOT NULL AND phone != '' AND is_deleted = 0 ORDER BY name`
      ).all<{ name: string; phone: string }>()
      rawReceivers = (empRows || []).map((r) => ({ name: r.name, phone: r.phone }))
    }

    if (rawReceivers.length === 0) {
      return c.json({ success: false, error: '발송 대상이 없습니다.' }, 400)
    }

    const sendable = rawReceivers.filter(r => !!r.phone)
    if (sendable.length === 0) {
      return c.json({ success: false, error: '유효한 전화번호가 없습니다.' }, 400)
    }

    // ── 수신자별 변수 해석 ────────────────────────────────────────────────
    const varCtx = await buildBulkVarContext(c, sendable)
    const messages: SMSMessage[] = sendable.map(r => ({
      rcv: r.phone!,
      rcvnm: r.name || '수신자',
      msg: applyVars(content.body, varCtx.varsFor(r)),
    }))

    // 미치환 변수가 남으면 발송 차단 — 알림톡은 카카오가 거부하고, 문자는 "#{고객명}"이 그대로 찍힌다
    const leftover = unresolvedVars(messages[0].msg || '')
    if (leftover.length > 0) {
      return c.json({
        success: false,
        error: `값을 찾지 못한 변수가 있습니다: ${leftover.map(v => '#{' + v + '}').join(', ')}. `
          + `엑셀에 해당 이름의 열을 추가하거나 본문에서 변수를 빼주세요. `
          + `(자동 제공 변수: ${BULK_VAR_NAMES.map(v => '#{' + v + '}').join(', ')})`,
      }, 400)
    }

    // ── MMS 이미지 검증 ───────────────────────────────────────────────────
    let mmsImage = ''
    if (channel === 'mms') {
      mmsImage = typeof content.image_base64 === 'string' ? stripDataUri(content.image_base64).replace(/\s/g, '') : ''
      if (!mmsImage) {
        return c.json({ success: false, error: 'mms 채널에서는 content.image_base64(이미지)가 필요합니다.' }, 400)
      }
      const bytes = base64ByteLength(mmsImage)
      if (bytes > MMS_IMAGE.MAX_BYTES) {
        return c.json({
          success: false,
          error: `이미지 용량이 큽니다 (${Math.round(bytes / 1024)}KB / 최대 ${Math.round(MMS_IMAGE.MAX_BYTES / 1024)}KB).`,
        }, 400)
      }
    }

    // ── 대량 발송 건수 상한 (#584) ────────────────────────────────────────
    // 예전엔 MMS에만 상한이 있었다. 그런데 SMS(15원)·알림톡(7원)도 target_type=clients면
    // 전 거래처(수천 건)가 한 번에 나가 수만~십수만 원이 즉시 발생한다 — 발송은 취소 불가.
    // 채널 판정은 실제 발송 분기(아래 isLms)와 같은 규칙: sms + subject 있으면 LMS.
    // (email 채널은 이 지점 이전에 분기가 끝나 여기 도달하지 않는다 — 타입도 그렇게 좁혀져 있다)
    const limitChannel: BulkChannel =
      channel === 'mms' ? 'mms'
      : channel === 'kakao' ? 'kakao'
      : (content.subject ? 'lms' : 'sms')
    const limitErr = await checkBulkLimit(db, limitChannel, messages.length)
    if (limitErr) return c.json({ success: false, error: limitErr }, 400)

    let sendResult
    let templateCode: string

    if (channel === 'mms') {
      templateCode = 'MMS'
      sendResult = await provider.sendMMS({
        snd: kakaoSettings.senderNum,
        subject: content.subject || '동산기획',
        content: content.body,
        imageBase64: mmsImage,
        messages,
        sndDT: content.sndDT || undefined,
      })
    } else if (channel === 'kakao') {
      if (!content.template_code) {
        return c.json({ success: false, error: 'kakao 채널에서는 content.template_code가 필요합니다.' }, 400)
      }
      if (!kakaoSettings.enabled) {
        return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
      }
      const atsMessages: ATSMessage[] = messages.map(m => ({
        rcv: m.rcv,
        rcvnm: m.rcvnm || '고객',
        msg: content.body,
        altmsg: content.body,
      }))
      sendResult = await provider.sendATS({
        templateCode: content.template_code,
        snd: kakaoSettings.senderNum,
        content: content.body,
        altSendType: kakaoSettings.altSendType,
        messages: atsMessages,
        sndDT: content.sndDT || undefined,   // 예약 발송: UI 토글이 서버에 전달되지 않아 즉시 발송되던 것 배선
      })
      templateCode = content.template_code
    } else {
      // sms
      const isLms = !!content.subject
      templateCode = isLms ? 'LMS' : 'SMS'
      if (isLms) {
        sendResult = await provider.sendLMS({
          snd: kakaoSettings.senderNum,
          subject: content.subject!,
          content: content.body,
          messages,
          sndDT: content.sndDT || undefined,
        })
      } else {
        sendResult = await provider.sendSMS({
          snd: kakaoSettings.senderNum,
          content: content.body,
          messages,
          sndDT: content.sndDT || undefined,
        })
      }
    }

    // 대량 발송 대표 로그 1건 저장
    const logId = await insertSendLog(db, {
      receiptNum: sendResult.receiptNum,
      templateCode,
      receiverNum: `BULK(${messages.length})`,
      receiverName: targetType,
      relatedType: 'bulk',
      relatedId: null,
      clientId: null,
      content: content.body,
      altContent: content.body,
      status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      resultCode: sendResult.code,
      resultMessage: sendResult.message,
      sentBy: userId,
      channel,
      entityId: getEntityId(c),
    })

    // 건별 결과(sendMMS 등)가 있으면 성공/실패 건수를 함께 돌려준다.
    // 프론트가 '완료'로 뭉뚱그리면 전건 실패도 성공처럼 보이므로 판단 근거를 준다.
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
        type: templateCode,
      }
    })
  } catch (error) {
    console.error('src/routes/messages.ts POST /send-bulk error:', error)
    return c.json({ success: false, error: '대량 메시지 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /preview-bulk — 대량 발송 변수 치환 미리보기 (발송·과금 없음)
//   미수금·대표자 등 서버에서만 아는 값이 있어 프론트 단독 미리보기는 부정확하다.
//   앞 3명분 치환 결과 + 미치환 변수 목록을 돌려준다.
// ────────────────────────────────────────────────────────────────────────────
messagesRouter.post('/preview-bulk', async (c) => {
  try {
    const body = await c.req.json() as any
    const content = body.content || {}
    const receivers: BulkReceiver[] = (body.receivers || []).filter((r: BulkReceiver) => !!r.phone)
    if (!content.body) return c.json({ success: false, error: 'content.body는 필수입니다.' }, 400)
    if (receivers.length === 0) return c.json({ success: false, error: '수신자가 없습니다.' }, 400)

    const sample = receivers.slice(0, 3)
    const varCtx = await buildBulkVarContext(c, sample)
    const previews = sample.map(r => {
      const resolved = applyVars(content.body, varCtx.varsFor(r))
      return { name: r.name || '', phone: r.phone || '', body: resolved, unresolved: unresolvedVars(resolved) }
    })
    return c.json({
      success: true,
      data: {
        previews,
        total: receivers.length,
        unresolved: Array.from(new Set(previews.flatMap(p => p.unresolved))),
        available_vars: BULK_VAR_NAMES,
      }
    })
  } catch (error) {
    console.error('src/routes/messages.ts POST /preview-bulk error:', error)
    return c.json({ success: false, error: '미리보기 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /stats — 발송 통계
// ────────────────────────────────────────────────────────────────────────────
messagesRouter.get('/stats', async (c) => {
  try {
    const db = c.env.DB
    const days = Math.min(90, Math.max(7, parseInt(c.req.query('days') || '30', 10)))
    const ef = entityFilter(c, '')

    // 1. 일별 발송 건수 (최근 N일)
    const dailyQuery = `
      SELECT DATE(created_at) as date,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')${ef.clause}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `
    const { results: daily } = await db.prepare(dailyQuery).bind(...ef.params).all<{ date: string; total: number; success: number; failed: number }>()

    // 2. 채널별 통계
    const channelQuery = `
      SELECT COALESCE(channel, 'kakao') as channel,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')${ef.clause}
      GROUP BY COALESCE(channel, 'kakao')
    `
    const { results: byChannel } = await db.prepare(channelQuery).bind(...ef.params).all<{ channel: string; total: number; success: number; failed: number }>()

    // 3. 관련 업무별 통계
    const typeQuery = `
      SELECT COALESCE(related_type, 'direct') as type,
             COUNT(*) as total
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')${ef.clause}
      GROUP BY COALESCE(related_type, 'direct')
      ORDER BY total DESC
    `
    const { results: byType } = await db.prepare(typeQuery).bind(...ef.params).all<{ type: string; total: number }>()

    // 4. 전체 요약
    const summaryQuery = `
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')${ef.clause}
    `
    const summary = await db.prepare(summaryQuery).bind(...ef.params).first<{ total: number; success: number; failed: number; pending: number }>()

    // 5. 주요 수신자 Top 10
    const topReceiversQuery = `
      SELECT receiver_name, receiver_num, COUNT(*) as count
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')${ef.clause}
        AND receiver_name IS NOT NULL AND receiver_name != ''
      GROUP BY receiver_name, receiver_num
      ORDER BY count DESC
      LIMIT 10
    `
    const { results: topReceivers } = await db.prepare(topReceiversQuery).bind(...ef.params).all<{ receiver_name: string; receiver_num: string; count: number }>()

    return c.json({
      success: true,
      data: {
        days,
        summary: summary || { total: 0, success: 0, failed: 0, pending: 0 },
        daily: daily || [],
        byChannel: byChannel || [],
        byType: byType || [],
        topReceivers: topReceivers || [],
      }
    })
  } catch (error) {
    console.error('src/routes/messages.ts GET /stats error:', error)
    return c.json({ success: false, error: '통계 조회 실패' }, 500)
  }
})

export default messagesRouter
