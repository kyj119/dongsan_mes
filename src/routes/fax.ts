import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { FaxProvider } from '../services/faxProvider'
import { getKakaoSettings } from './kakao'
import { getEntityCorpNum } from '../utils/entitySettings'
import { getEntityId } from '../utils/entityFilter'

const faxRouter = new Hono<HonoEnv>()
faxRouter.use('*', authMiddleware)
faxRouter.use('*', requireRole('ADMIN', 'MANAGER'))

async function getFaxProvider(c: any): Promise<FaxProvider | null> {
  const db = c.env.DB
  const linkedIdRow = await db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'tax_provider_linked_id'").first() as any
  const testModeRow = await db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'tax_test_mode'").first() as any

  const linkedId = linkedIdRow?.setting_value
  const secretKey = c.env.POPBILL_SECRET_KEY
  const corpNum = await getEntityCorpNum(db, getEntityId(c))

  if (!linkedId || !secretKey || !corpNum) return null

  return new FaxProvider({
    linkedId,
    secretKey,
    corpNum,
    testMode: testModeRow?.setting_value === '1',
  })
}

// POST /send — 팩스 발송 (base64 PDF)
faxRouter.post('/send', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id

    const { receiver_num, receiver_name, file_name, file_data, related_type, related_id, client_id } = body

    if (!receiver_num) {
      return c.json({ success: false, error: '수신 팩스번호는 필수입니다.' }, 400)
    }
    if (!file_data) {
      return c.json({ success: false, error: '발송할 문서(PDF)가 필요합니다.' }, 400)
    }

    const provider = await getFaxProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '팝빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const settings = await getKakaoSettings(db)

    const result = await provider.sendFax({
      senderNum: settings.senderNum || '',
      senderName: '동산현수막',
      receiverNum: receiver_num,
      receiverName: receiver_name || '',
      fileName: file_name || 'document.pdf',
      fileData: file_data,
    })

    // 발송 로그 기록
    await db.prepare(`
      INSERT INTO kakao_send_logs (receipt_num, template_code, receiver_num, receiver_name, related_type, related_id, client_id, content, status, result_code, result_message, sent_by, channel)
      VALUES (?, 'FAX', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fax')
    `).bind(
      result.receiptNum,
      receiver_num,
      receiver_name || null,
      related_type || null,
      related_id || null,
      client_id || null,
      file_name || 'document.pdf',
      result.code >= 1 ? 'SUCCESS' : 'FAILED',
      result.code,
      result.message,
      userId,
    ).run()

    return c.json({
      success: true,
      data: {
        receipt_num: result.receiptNum,
        code: result.code,
        message: result.message,
        status: result.code >= 1 ? 'SUCCESS' : 'FAILED',
      }
    })
  } catch (error) {
    console.error('fax send error:', error)
    return c.json({ success: false, error: '팩스 발송 실패: ' + (error as any).message }, 500)
  }
})

export default faxRouter
