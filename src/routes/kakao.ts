import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createKakaoProvider, KakaoProvider, SMSMessage, ATSMessage } from '../services/kakaoProvider'

const kakaoRouter = new Hono<HonoEnv>()
kakaoRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 카카오 Provider 인스턴스 생성
// ────────────────────────────────────────────────────────────────────────────
export async function getKakaoProvider(c: any): Promise<KakaoProvider | null> {
  try {
    const db = c.env.DB
    const entityId = c.get?.('entityId') || 1

    // 팝빌 연동 설정 확인
    const linkedIdSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first() as any
    const secretKey = c.env.POPBILL_SECRET_KEY

    // entities 테이블에서 corpNum 조회 (우선), 폴백: settings
    let brn = ''
    const entity = await db.prepare(
      'SELECT popbill_corp_num, business_reg_no FROM entities WHERE id = ?'
    ).bind(entityId).first() as any
    if (entity?.popbill_corp_num) {
      brn = entity.popbill_corp_num
    } else if (entity?.business_reg_no) {
      brn = entity.business_reg_no.replace(/-/g, '')
    } else {
      const companyBrn = await db.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'company_business_registration_number'`
      ).first() as any
      brn = (companyBrn?.setting_value || '').replace(/-/g, '')
    }

    if (!linkedIdSetting?.setting_value || !secretKey || !brn) {
      return null
    }

    // 테스트 모드 확인
    const testModeSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'`
    ).first() as any
    const isTestMode = testModeSetting?.setting_value === '1'

    return createKakaoProvider(linkedIdSetting.setting_value, secretKey, brn, isTestMode)
  } catch (error) {
    console.error('src/routes/kakao.ts getKakaoProvider error:', error)
    return null
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 카카오 알림톡 설정 일괄 조회
// ────────────────────────────────────────────────────────────────────────────
export interface KakaoSettings {
  enabled: boolean
  senderNum: string
  channelId: string
  altSendType: string
}

export async function getKakaoSettings(db: any): Promise<KakaoSettings> {
  const { results } = await db.prepare(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN ('kakao_enabled', 'kakao_sender_num', 'kakao_channel_id', 'kakao_alt_send_type')`
  ).all() as any

  const map: Record<string, string> = {}
  for (const r of results) map[r.setting_key] = r.setting_value || ''

  return {
    enabled: map['kakao_enabled'] === '1',
    senderNum: map['kakao_sender_num'] || '',
    channelId: map['kakao_channel_id'] || '',
    altSendType: map['kakao_alt_send_type'] || 'C',
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /settings — 카카오 알림톡 설정 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/settings', async (c) => {
  try {
    const db = c.env.DB

    // 카카오 알림톡 + 이메일 + 팩스 설정 조회
    const { results: settingRows } = await db.prepare(
      `SELECT setting_key, setting_value FROM settings
       WHERE setting_key IN (
         'kakao_enabled', 'kakao_sender_num', 'kakao_channel_id', 'kakao_alt_send_type',
         'email_enabled', 'email_from_name', 'email_from_address',
         'fax_enabled', 'fax_sender_num'
       )`
    ).all() as any

    const settings: Record<string, any> = {}
    for (const row of settingRows) {
      if (row.setting_key === 'kakao_enabled') {
        settings[row.setting_key] = row.setting_value || '0'
      } else {
        settings[row.setting_key] = row.setting_value || ''
      }
    }

    // 팝빌 연동 여부 확인
    const linkedIdSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'`
    ).first() as any
    const popbillConfigured = !!linkedIdSetting?.setting_value && !!c.env.POPBILL_SECRET_KEY

    return c.json({
      success: true,
      data: {
        kakao_enabled: settings.kakao_enabled || '0',
        kakao_sender_num: settings.kakao_sender_num || '',
        kakao_channel_id: settings.kakao_channel_id || '',
        kakao_alt_send_type: settings.kakao_alt_send_type || 'C',
        email_enabled: settings.email_enabled || '0',
        email_from_name: settings.email_from_name || '',
        email_from_address: settings.email_from_address || '',
        fax_enabled: settings.fax_enabled || '0',
        fax_sender_num: settings.fax_sender_num || '',
        popbill_configured: popbillConfigured
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /settings error:', error)
    return c.json({ success: false, error: '설정 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// PATCH /settings — 카카오 알림톡 설정 업데이트
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.patch('/settings', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any

    // 입력 유효성 검사
    const kakaoEnabled = body.kakao_enabled
    const kakaoSenderNum = body.kakao_sender_num?.trim() || ''
    const kakaoChannelId = body.kakao_channel_id?.trim() || ''
    const kakaoAltSendType = body.kakao_alt_send_type || 'C'

    // 활성화 시 경고 (저장은 허용, 실제 발송 시점에 체크)
    let warning = ''
    if (kakaoEnabled === '1' || kakaoEnabled === true) {
      if (!kakaoSenderNum) warning = '발신번호가 비어있습니다. 발송 시 오류가 발생합니다.'
      else if (!kakaoChannelId) warning = '채널ID가 비어있습니다. 카카오톡 발송이 제한될 수 있습니다.'
    }

    // Settings 테이블에 upsert
    const settingsToUpdate: { key: string, value: string }[] = [
      { key: 'kakao_enabled', value: kakaoEnabled ? '1' : '0' },
      { key: 'kakao_sender_num', value: kakaoSenderNum },
      { key: 'kakao_channel_id', value: kakaoChannelId },
      { key: 'kakao_alt_send_type', value: kakaoAltSendType }
    ]

    // 이메일 설정
    if ('email_enabled' in body) settingsToUpdate.push({ key: 'email_enabled', value: body.email_enabled === '1' || body.email_enabled === true ? '1' : '0' })
    if ('email_from_name' in body) settingsToUpdate.push({ key: 'email_from_name', value: body.email_from_name?.trim() || '' })
    if ('email_from_address' in body) settingsToUpdate.push({ key: 'email_from_address', value: body.email_from_address?.trim() || '' })

    // 팩스 설정
    if ('fax_enabled' in body) settingsToUpdate.push({ key: 'fax_enabled', value: body.fax_enabled === '1' || body.fax_enabled === true ? '1' : '0' })
    if ('fax_sender_num' in body) settingsToUpdate.push({ key: 'fax_sender_num', value: body.fax_sender_num?.trim() || '' })

    for (const setting of settingsToUpdate) {
      const existing = await db.prepare(
        `SELECT id FROM settings WHERE setting_key = ?`
      ).bind(setting.key).first() as any

      if (existing) {
        await db.prepare(
          `UPDATE settings SET setting_value = ? WHERE setting_key = ?`
        ).bind(setting.value, setting.key).run()
      } else {
        await db.prepare(
          `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)`
        ).bind(setting.key, setting.value).run()
      }
    }

    return c.json({ success: true, data: { updated: true, warning } })
  } catch (error) {
    console.error('src/routes/kakao.ts PATCH /settings error:', error)
    return c.json({ success: false, error: '설정 업데이트 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /templates — 팝빌 알림톡 템플릿 목록 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/templates', async (c) => {
  try {
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다. (provider null)' }, 400)
    }

    const templates = await provider.listATSTemplate()
    return c.json({ success: true, data: templates })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /templates error:', error)
    return c.json({ success: false, error: '템플릿 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /balance — 포인트 잔액 + 발송 단가 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/balance', async (c) => {
  try {
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const [balance, unitCost] = await Promise.all([
      provider.getBalance(),
      provider.getUnitCost()
    ])

    return c.json({
      success: true,
      data: {
        remain_point: balance.remainPoint,
        partner_point: balance.partnerPoint,
        unit_cost: unitCost.unitCost
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /balance error:', error)
    return c.json({ success: false, error: '잔액 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send — 알림톡 수동 발송
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    // 필수 파라미터 확인
    const templateCode = body.template_code?.trim()
    const receiverNum = body.receiver_num?.trim()
    const receiverName = body.receiver_name?.trim()
    const content = body.content?.trim()

    if (!templateCode || !receiverNum || !content) {
      return c.json(
        { success: false, error: '필수 항목(template_code, receiver_num, content)을 입력해주세요.' },
        400
      )
    }

    // 카카오 설정 일괄 조회
    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.enabled) {
      return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    }
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 팝빌 제공자 생성
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 알림톡 발송
    const sendResult = await provider.sendATS({
      templateCode,
      snd: kakaoSettings.senderNum,
      content,
      altSendType: kakaoSettings.altSendType,
      messages: [{
        rcv: receiverNum,
        rcvnm: receiverName || '고객',
        msg: content,
        altmsg: body.alt_content || content,
        btns: body.buttons || undefined,
      }]
    })

    // kakao_send_logs에 저장
    const clientId = body.client_id || null
    const relatedType = body.related_type || null
    const relatedId = body.related_id || null

    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      receiverNum,
      receiverName || null,
      relatedType,
      relatedId,
      clientId,
      content,
      body.alt_content || content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId
    ).run() as any

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED'
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send error:', error)
    return c.json({ success: false, error: '카카오톡 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-shipment — 출고 알림톡 발송
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-shipment', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const shipmentId = body.shipment_id
    if (!shipmentId) {
      return c.json({ success: false, error: 'shipment_id는 필수입니다.' }, 400)
    }

    // 출고 정보 조회
    const shipment = await db.prepare(
      `SELECT s.*, o.order_number, c.client_name, c.mobile
       FROM shipments s
       LEFT JOIN orders o ON s.order_id = o.id
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE s.id = ?`
    ).bind(shipmentId).first() as any

    if (!shipment) {
      return c.json({ success: false, error: '출고 정보를 찾을 수 없습니다.' }, 400)
    }

    if (!shipment.mobile) {
      return c.json({ success: false, error: '거래처 휴대폰 번호가 없습니다.' }, 400)
    }

    // 템플릿 코드 확인
    const templateCode = body.template_code
    if (!templateCode) {
      return c.json({ success: false, error: 'template_code는 필수입니다.' }, 400)
    }

    // 카카오 설정 일괄 조회
    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.enabled) {
      return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    }
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 발송 내용 구성
    const content = body.content || `주문 ${shipment.order_number} 출고되었습니다.`

    // 팝빌 제공자 생성
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 알림톡 발송
    const sendResult = await provider.sendATS({
      templateCode,
      snd: kakaoSettings.senderNum,
      content,
      altSendType: kakaoSettings.altSendType,
      messages: [{
        rcv: shipment.mobile,
        rcvnm: shipment.client_name || '고객',
        msg: content,
        altmsg: content,
      }]
    })

    // kakao_send_logs에 저장
    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      shipment.mobile,
      shipment.client_name,
      'shipments',
      shipmentId,
      shipment.client_id,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId
    ).run() as any

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED'
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-shipment error:', error)
    return c.json({ success: false, error: '출고 카카오톡 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-tax-invoice — 세금계산서 알림톡 발송
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-tax-invoice', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const taxInvoiceId = body.tax_invoice_id
    if (!taxInvoiceId) {
      return c.json({ success: false, error: 'tax_invoice_id는 필수입니다.' }, 400)
    }

    // 세금계산서 정보 조회
    const taxInvoice = await db.prepare(
      `SELECT ti.*, c.client_name, c.mobile
       FROM tax_invoices ti
       LEFT JOIN clients c ON ti.client_id = c.id
       WHERE ti.id = ?`
    ).bind(taxInvoiceId).first() as any

    if (!taxInvoice) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 400)
    }

    if (!taxInvoice.mobile) {
      return c.json({ success: false, error: '거래처 휴대폰 번호가 없습니다.' }, 400)
    }

    // 템플릿 코드 확인
    const templateCode = body.template_code
    if (!templateCode) {
      return c.json({ success: false, error: 'template_code는 필수입니다.' }, 400)
    }

    // 카카오 설정 일괄 조회
    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.enabled) {
      return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    }
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 발송 내용 구성
    const content = body.content || `세금계산서 ${taxInvoice.invoice_number} 발행되었습니다.`

    // 팝빌 제공자 생성
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 알림톡 발송
    const sendResult = await provider.sendATS({
      templateCode,
      snd: kakaoSettings.senderNum,
      content,
      altSendType: kakaoSettings.altSendType,
      messages: [{
        rcv: taxInvoice.mobile,
        rcvnm: taxInvoice.client_name || '고객',
        msg: content,
        altmsg: content,
      }]
    })

    // kakao_send_logs에 저장
    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      taxInvoice.mobile,
      taxInvoice.client_name,
      'tax_invoices',
      taxInvoiceId,
      taxInvoice.client_id,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId
    ).run() as any

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED'
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-tax-invoice error:', error)
    return c.json({ success: false, error: '세금계산서 카카오톡 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-portal-link — 거래처 포털 조회 링크 알림톡
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-portal-link', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const clientId = body.client_id
    const templateCode = body.template_code

    if (!clientId || !templateCode) {
      return c.json({ success: false, error: 'client_id, template_code는 필수입니다.' }, 400)
    }

    // 거래처 정보 조회
    const client = await db.prepare(
      `SELECT * FROM clients WHERE id = ?`
    ).bind(clientId).first() as any

    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다.' }, 400)
    }

    if (!client.mobile) {
      return c.json({ success: false, error: '거래처 휴대폰 번호가 없습니다.' }, 400)
    }

    // 카카오 설정 일괄 조회
    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.enabled) {
      return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    }
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 포털 베이스 URL — settings에서 조회, 없으면 빈 문자열
    const portalBaseUrlRow = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'portal_base_url'`
    ).first() as any
    const portalBaseUrl = portalBaseUrlRow?.setting_value || ''
    const portalLink = portalBaseUrl ? `${portalBaseUrl}/client/${clientId}` : ''

    // 발송 내용 구성
    const content = body.content || (portalLink
      ? `거래 정보를 조회하려면 아래 링크를 클릭하세요: ${portalLink}`
      : '거래 정보 조회 링크를 확인하세요.')

    // 팝빌 제공자 생성
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 버튼 구성 (포털링크가 있을 때만)
    const btns = portalLink
      ? [{ n: '포털 접속', t: 'WL', u1: portalLink, u2: portalLink }]
      : undefined

    // 알림톡 발송
    const sendResult = await provider.sendATS({
      templateCode,
      snd: kakaoSettings.senderNum,
      content,
      altSendType: kakaoSettings.altSendType,
      messages: [{
        rcv: client.mobile,
        rcvnm: client.client_name || '고객',
        msg: content,
        altmsg: content,
        btns,
      }]
    })

    // kakao_send_logs에 저장
    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      client.mobile,
      client.client_name,
      'ledger',
      clientId,
      clientId,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId
    ).run() as any

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        portal_link: portalLink
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-portal-link error:', error)
    return c.json({ success: false, error: '포털 링크 카카오톡 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-sms — SMS/LMS 단건 발송
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-sms', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const receiverNum = body.receiver_num?.trim()
    const receiverName = body.receiver_name?.trim() || ''
    const content = body.content?.trim()
    const subject = body.subject?.trim() || ''

    if (!receiverNum || !content) {
      return c.json({ success: false, error: '필수 항목(receiver_num, content)을 입력해주세요.' }, 400)
    }

    // 발신번호 확인 (kakao_sender_num 공용)
    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const messages: SMSMessage[] = [{
      rcv: receiverNum,
      rcvnm: receiverName || '수신자',
    }]

    // subject 있으면 LMS, 없으면 SMS
    const isLms = !!subject
    const templateCode = isLms ? 'LMS' : 'SMS'

    let sendResult
    if (isLms) {
      sendResult = await provider.sendLMS({
        snd: kakaoSettings.senderNum,
        subject,
        content,
        messages,
      })
    } else {
      sendResult = await provider.sendSMS({
        snd: kakaoSettings.senderNum,
        content,
        messages,
      })
    }

    // kakao_send_logs에 저장
    const clientId = body.client_id || null
    const relatedType = body.related_type || null
    const relatedId = body.related_id || null

    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      receiverNum,
      receiverName || null,
      relatedType,
      relatedId,
      clientId,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId
    ).run() as any

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        type: templateCode,
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-sms error:', error)
    return c.json({ success: false, error: 'SMS 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-sms-bulk — 대량 SMS/LMS 발송 (사내 공지 등)
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-sms-bulk', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const content = body.content?.trim()
    const subject = body.subject?.trim() || ''
    const targetType: 'clients' | 'employees' | 'custom' = body.target_type || 'custom'

    if (!content) {
      return c.json({ success: false, error: 'content는 필수입니다.' }, 400)
    }

    // 발신번호 확인
    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 수신자 목록 구성
    let messages: SMSMessage[] = []

    if (targetType === 'clients') {
      const { results: clientRows } = await db.prepare(
        `SELECT client_name, mobile FROM clients WHERE mobile IS NOT NULL AND mobile != '' ORDER BY client_name`
      ).all() as any
      messages = (clientRows || []).map((r: any) => ({
        rcv: r.mobile,
        rcvnm: r.client_name || '고객',
      }))
    } else if (targetType === 'employees') {
      const { results: empRows } = await db.prepare(
        `SELECT name, phone FROM employees WHERE phone IS NOT NULL AND phone != '' ORDER BY name`
      ).all() as any
      messages = (empRows || []).map((r: any) => ({
        rcv: r.phone,
        rcvnm: r.name || '직원',
      }))
    } else {
      // custom: body.receivers 사용
      const receivers: Array<{ num: string; name?: string }> = body.receivers || []
      messages = receivers.map((r) => ({
        rcv: r.num,
        rcvnm: r.name || '수신자',
      }))
    }

    if (messages.length === 0) {
      return c.json({ success: false, error: '발송 대상이 없습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const isLms = !!subject
    const templateCode = isLms ? 'LMS' : 'SMS'

    let sendResult
    if (isLms) {
      sendResult = await provider.sendLMS({
        snd: kakaoSettings.senderNum,
        subject,
        content,
        messages,
      })
    } else {
      sendResult = await provider.sendSMS({
        snd: kakaoSettings.senderNum,
        content,
        messages,
      })
    }

    // kakao_send_logs에 bulk 기록 (1건으로 대표 저장)
    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      `BULK(${messages.length})`,
      targetType,
      'bulk',
      null,
      null,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId
    ).run() as any

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        type: templateCode,
        receiver_count: messages.length,
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-sms-bulk error:', error)
    return c.json({ success: false, error: '대량 SMS 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-shipment-bulk — 출고 알림 일괄 발송 (체크박스 선택)
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-shipment-bulk', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id
    const { channel, content, targets, template_code, subject, date } = body

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return c.json({ success: false, error: '발송 대상이 없습니다.' }, 400)
    }
    if (!content) {
      return c.json({ success: false, error: '메시지 내용이 없습니다.' }, 400)
    }

    const kakaoSettings = await getKakaoSettings(db)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 각 대상별 변수 치환
    const resolveMsg = (t: any): string => content
      .replace(/#{고객명}/g, t.client_name || '')
      .replace(/#{품목}/g, t.item_summary || '')
      .replace(/#{송장번호}/g, t.tracking_number || '')
      .replace(/#{터미널}/g, t.terminal || '')
      .replace(/#{배송방법}/g, t.delivery_type || '')
      .replace(/#{날짜}/g, date || '')

    let sendResult
    if (channel === 'alimtalk' && template_code) {
      const atsMessages: ATSMessage[] = targets.map((t: any) => {
        const msg: ATSMessage = {
          rcv: t.mobile,
          rcvnm: t.client_name || '고객',
          msg: resolveMsg(t),
          altmsg: resolveMsg(t)
        }
        // 한진택배 + 송장번호 있으면 배송조회 버튼 자동 추가
        if (t.tracking_number && t.delivery_type && /한진/.test(t.delivery_type)) {
          msg.btns = [{ n: '배송 조회', t: 'WL', u1: 'https://trace.hanjin.co.kr/newinfo/gonsang/tracking?waybillNo=' + t.tracking_number, u2: 'https://trace.hanjin.co.kr/newinfo/gonsang/tracking?waybillNo=' + t.tracking_number }]
        }
        return msg
      })
      sendResult = await provider.sendATS({
        templateCode: template_code,
        snd: kakaoSettings.senderNum,
        content,
        altSendType: kakaoSettings.altSendType || 'C',
        messages: atsMessages
      })
    } else {
      const smsMessages: SMSMessage[] = targets.map((t: any) => ({
        rcv: t.mobile,
        rcvnm: t.client_name || '고객',
        msg: resolveMsg(t)
      }))
      if (subject) {
        sendResult = await provider.sendLMS({
          snd: kakaoSettings.senderNum,
          subject,
          content,
          messages: smsMessages
        })
      } else {
        sendResult = await provider.sendSMS({
          snd: kakaoSettings.senderNum,
          content,
          messages: smsMessages
        })
      }
    }

    const templateLabel = channel === 'alimtalk' ? (template_code || 'ATS') : (subject ? 'LMS' : 'SMS')

    // 로그 저장 (bulk 대표 1건)
    await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, content, alt_content,
        status, result_code, result_message, sent_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult!.receiptNum || '',
      templateLabel,
      `BULK(${targets.length})`,
      targets.map((t: any) => t.client_name).join(', '),
      'shipments',
      null,
      content,
      content,
      sendResult!.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult!.code || 0,
      sendResult!.message || '',
      userId
    ).run()

    return c.json({
      success: true,
      data: {
        sent_count: targets.length,
        receipt_num: sendResult!.receiptNum,
        code: sendResult!.code,
        message: sendResult!.message
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-shipment-bulk error:', error)
    return c.json({ success: false, error: '일괄 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /logs — 발송 이력 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/logs', async (c) => {
  try {
    const db = c.env.DB

    // 쿼리 파라미터 파싱
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '30', 10)))
    const clientId = c.req.query('client_id')
    const status = c.req.query('status')
    const relatedType = c.req.query('related_type')
    const dateFrom = c.req.query('date_from')
    const dateTo = c.req.query('date_to')
    const channel = c.req.query('channel')
    const search = c.req.query('search')

    // SQL 동적 구성
    let whereConditions: string[] = []
    let bindings: any[] = []

    if (clientId) {
      whereConditions.push('ksl.client_id = ?')
      bindings.push(parseInt(clientId, 10))
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
    if (channel) {
      whereConditions.push('ksl.channel = ?')
      bindings.push(channel)
    }
    if (search) {
      whereConditions.push("(ksl.receiver_name LIKE ? OR ksl.receiver_num LIKE ?)")
      bindings.push('%' + search + '%', '%' + search + '%')
    }

    const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : ''

    // 총 건수 조회
    const countQuery = `SELECT COUNT(*) as total FROM kakao_send_logs ksl${whereClause}`
    const countResult = await db.prepare(countQuery).bind(...bindings).first() as any
    const total = countResult?.total || 0

    // 이력 조회
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
        ksl.channel,
        ksl.sent_by,
        u.name as user_name,
        ksl.created_at
      FROM kakao_send_logs ksl
      LEFT JOIN clients c ON ksl.client_id = c.id
      LEFT JOIN users u ON ksl.sent_by = u.id
      ${whereClause}
      ORDER BY ksl.created_at DESC
      LIMIT ? OFFSET ?
    `

    bindings.push(limit, offset)
    const { results: logs } = await db.prepare(query).bind(...bindings).all() as any

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
    console.error('src/routes/kakao.ts GET /logs error:', error)
    return c.json({ success: false, error: '발송 이력 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /logs/:receiptNum/status — 팝빌에서 발송 결과 상세 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/logs/:receiptNum/status', async (c) => {
  try {
    const receiptNum = c.req.param('receiptNum')
    if (!receiptNum) {
      return c.json({ success: false, error: 'receiptNum은 필수입니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const messages = await provider.getMessages(receiptNum)
    return c.json({ success: true, data: messages })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /logs/:receiptNum/status error:', error)
    return c.json({ success: false, error: '발송 결과 조회 실패' }, 500)
  }
})

export default kakaoRouter
