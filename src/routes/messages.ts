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
import type { SMSMessage, ATSMessage } from '../services/kakaoProvider'
import { generatePortalToken } from './portal'

const messagesRouter = new Hono<HonoEnv>()
messagesRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ────────────────────────────────────────────────────────────────────────────
// 공통: 로그 저장 헬퍼
// ────────────────────────────────────────────────────────────────────────────
async function insertSendLog(db: any, log: {
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
}): Promise<number> {
  const result = await db.prepare(
    `INSERT INTO kakao_send_logs (
      receipt_num, template_code, receiver_num, receiver_name,
      related_type, related_id, client_id, content, alt_content,
      status, result_code, result_message, sent_by, channel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
  ).run() as any
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

    const channel: 'kakao' | 'sms' | 'email' | 'fax' = body.channel
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
      ).first() as any
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
      } else if (channel === 'sms') {
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
      const faxEnabledRow = await c.env.DB.prepare("SELECT setting_value FROM settings WHERE setting_key = 'fax_enabled'").first() as any
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
      })

      return c.json({
        success: true,
        data: { log_id: logId, receipt_num: emailResult.id, status: 'SUCCESS', channel: 'email' }
      })
    }

    // ── 카카오톡 / SMS — 팝빌 Provider 공통 준비 ──────────────────────────
    if (!receiver.phone) {
      return c.json({ success: false, error: `${channel} 채널에서는 receiver.phone이 필요합니다.` }, 400)
    }
    if (!content.body) {
      return c.json({ success: false, error: 'content.body는 필수입니다.' }, 400)
    }

    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호(kakao_sender_num)가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
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
          subject: content.subject || '동산현수막',
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
    ).bind(...bindings).first() as any
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
      ORDER BY ksl.created_at DESC
      LIMIT ? OFFSET ?
    `

    const queryBindings = [...bindings, limit, offset]
    const { results: logs } = await db.prepare(query).bind(...queryBindings).all() as any

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

    const channel: 'kakao' | 'sms' | 'email' = body.channel
    const content = body.content || {}
    const targetType: 'clients' | 'employees' | 'custom' = body.target_type || 'custom'

    if (!channel) {
      return c.json({ success: false, error: 'channel은 필수입니다.' }, 400)
    }
    if (!content.body) {
      return c.json({ success: false, error: 'content.body는 필수입니다.' }, 400)
    }

    // ── 이메일 대량 발송 ─────────────────────────────────────────────────
    if (channel === 'email') {
      let receivers: Array<{ name?: string; email?: string; client_id?: number }> = body.receivers || []

      if (targetType === 'clients') {
        const { results: clientRows } = await db.prepare(
          `SELECT client_name, email FROM clients WHERE email IS NOT NULL AND email != '' ORDER BY client_name`
        ).all() as any
        receivers = (clientRows || []).map((r: any) => ({ name: r.client_name, email: r.email }))
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

    // ── 카카오 / SMS 대량 발송 — 팝빌 Provider ───────────────────────────
    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호(kakao_sender_num)가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 수신자 목록 구성
    let rawReceivers: Array<{ name?: string; phone?: string; client_id?: number }> = body.receivers || []

    if (targetType === 'clients') {
      const { results: clientRows } = await db.prepare(
        `SELECT client_name, mobile FROM clients WHERE mobile IS NOT NULL AND mobile != '' ORDER BY client_name`
      ).all() as any
      rawReceivers = (clientRows || []).map((r: any) => ({ name: r.client_name, phone: r.mobile }))
    } else if (targetType === 'employees') {
      const { results: empRows } = await db.prepare(
        `SELECT name, phone FROM employees WHERE phone IS NOT NULL AND phone != '' ORDER BY name`
      ).all() as any
      rawReceivers = (empRows || []).map((r: any) => ({ name: r.name, phone: r.phone }))
    }

    if (rawReceivers.length === 0) {
      return c.json({ success: false, error: '발송 대상이 없습니다.' }, 400)
    }

    const messages: SMSMessage[] = rawReceivers
      .filter(r => !!r.phone)
      .map(r => ({ rcv: r.phone!, rcvnm: r.name || '수신자' }))

    if (messages.length === 0) {
      return c.json({ success: false, error: '유효한 전화번호가 없습니다.' }, 400)
    }

    let sendResult
    let templateCode: string

    if (channel === 'kakao') {
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
        })
      } else {
        sendResult = await provider.sendSMS({
          snd: kakaoSettings.senderNum,
          content: content.body,
          messages,
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
    })

    return c.json({
      success: true,
      data: {
        log_id: logId,
        receipt_num: sendResult.receiptNum,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        channel,
        receiver_count: messages.length,
        type: templateCode,
      }
    })
  } catch (error) {
    console.error('src/routes/messages.ts POST /send-bulk error:', error)
    return c.json({ success: false, error: '대량 메시지 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /stats — 발송 통계
// ────────────────────────────────────────────────────────────────────────────
messagesRouter.get('/stats', async (c) => {
  try {
    const db = c.env.DB
    const days = Math.min(90, Math.max(7, parseInt(c.req.query('days') || '30', 10)))

    // 1. 일별 발송 건수 (최근 N일)
    const dailyQuery = `
      SELECT DATE(created_at) as date,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `
    const { results: daily } = await db.prepare(dailyQuery).all() as any

    // 2. 채널별 통계
    const channelQuery = `
      SELECT COALESCE(channel, 'kakao') as channel,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY COALESCE(channel, 'kakao')
    `
    const { results: byChannel } = await db.prepare(channelQuery).all() as any

    // 3. 관련 업무별 통계
    const typeQuery = `
      SELECT COALESCE(related_type, 'direct') as type,
             COUNT(*) as total
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY COALESCE(related_type, 'direct')
      ORDER BY total DESC
    `
    const { results: byType } = await db.prepare(typeQuery).all() as any

    // 4. 전체 요약
    const summaryQuery = `
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
             SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')
    `
    const summary = await db.prepare(summaryQuery).first() as any

    // 5. 주요 수신자 Top 10
    const topReceiversQuery = `
      SELECT receiver_name, receiver_num, COUNT(*) as count
      FROM kakao_send_logs
      WHERE created_at >= datetime('now', '-${days} days')
        AND receiver_name IS NOT NULL AND receiver_name != ''
      GROUP BY receiver_name, receiver_num
      ORDER BY count DESC
      LIMIT 10
    `
    const { results: topReceivers } = await db.prepare(topReceiversQuery).all() as any

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
