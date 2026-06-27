import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { BarobillFaxProvider } from '../services/barobillFax'
import { ftpStor } from '../services/ftpUpload'
import { getKakaoSettings } from './kakao'
import { getEntityCorpNum } from '../utils/entitySettings'
import { getEntityId } from '../utils/entityFilter'

// ────────────────────────────────────────────────────────────────────────────
// 팩스 발송 — 서버 직접 FTP (온프렘 에이전트 없음)
//  바로빌 FAX = FTP 업로드 후 SendFaxFromFTP. Workers가 cloudflare:sockets로 직접 업로드.
//  흐름: 브라우저 PDF(base64) → POST /send → FTP STOR(root) → SendFaxFromFTP → 결과.
//  FTP 계정 = 바로빌 회원 아이디(barobill_sender_id) / 비번 = BAROBILL_FTP_PASSWORD(secret).
//  운영 ftp.barobill.co.kr:9030 · 테스트 testftp.barobill.co.kr:9031 (barobill_test_mode).
// ────────────────────────────────────────────────────────────────────────────
const faxRouter = new Hono<HonoEnv>()
faxRouter.use('*', authMiddleware)
faxRouter.use('*', requireRole('ADMIN', 'MANAGER'))

// 바로빌 연동회원 ID (= FTP 계정 = SendFaxFromFTP SenderID). entity_settings → settings → 'DONGSAN'
async function getBarobillSenderId(db: D1Database, entityId: number): Promise<string> {
  try {
    const e = await db.prepare(
      "SELECT setting_value FROM entity_settings WHERE entity_id = ? AND setting_key = 'barobill_sender_id'"
    ).bind(entityId).first<{ setting_value: string }>()
    if (e?.setting_value) return e.setting_value
  } catch { /* entity_settings 미존재 → 전역 */ }
  const g = await db.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'barobill_sender_id'"
  ).first<{ setting_value: string }>()
  return g?.setting_value || 'DONGSAN'
}

// FTP 비밀번호: entity_settings('barobill_ftp_password') 우선 → env BAROBILL_FTP_PASSWORD (멀티법인 대비)
async function getFtpPassword(c: any, entityId: number): Promise<string> {
  try {
    const e = await (c.env.DB as D1Database).prepare(
      "SELECT setting_value FROM entity_settings WHERE entity_id = ? AND setting_key = 'barobill_ftp_password'"
    ).bind(entityId).first<{ setting_value: string }>()
    if (e?.setting_value) return e.setting_value
  } catch { /* 미존재 → env */ }
  return c.env.BAROBILL_FTP_PASSWORD || ''
}

// POST /send — 팩스 발송 (base64 PDF/이미지). 동기: FTP 업로드 → 바로빌 발송 → 결과 반환.
faxRouter.post('/send', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any
    const userId = c.get('user').id
    const entityId = getEntityId(c) || 1

    const { receiver_num, receiver_name, file_name, file_data, related_type, related_id, client_id } = body
    if (!receiver_num) return c.json({ success: false, error: '수신 팩스번호는 필수입니다.' }, 400)
    if (!file_data) return c.json({ success: false, error: '발송할 문서(PDF)가 필요합니다.' }, 400)

    // base64 → bytes
    let bytes: Uint8Array
    try {
      const bin = atob(String(file_data))
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } catch {
      return c.json({ success: false, error: '문서 데이터(base64) 형식 오류' }, 400)
    }

    // 바로빌 설정
    const testModeRow = await db.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'"
    ).first<{ setting_value: string }>()
    const isTest = testModeRow?.setting_value !== '0'
    const certKey = isTest ? c.env.BAROBILL_CERT_KEY : c.env.BAROBILL_CERT_KEY_PROD
    const corpNum = await getEntityCorpNum(db, entityId)
    const senderId = await getBarobillSenderId(db, entityId)  // FTP 계정 + SOAP SenderID
    const ftpPass = await getFtpPassword(c, entityId)

    if (!certKey || !corpNum) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }
    if (!ftpPass) {
      return c.json({ success: false, error: '바로빌 FTP 비밀번호가 설정되지 않았습니다. (BAROBILL_FTP_PASSWORD)' }, 400)
    }

    const ftpHost = isTest ? 'testftp.barobill.co.kr' : 'ftp.barobill.co.kr'
    const ftpPort = isTest ? 9031 : 9030
    const ftpFilename = `mesfax-${crypto.randomUUID()}.pdf`

    // 1) FTP 업로드 (root 경로)
    try {
      await ftpStor({ host: ftpHost, port: ftpPort, user: senderId, pass: ftpPass }, ftpFilename, bytes)
    } catch (e) {
      console.error('fax FTP upload error:', e)
      return c.json({ success: false, error: 'FTP 업로드 실패: ' + (e as any).message }, 502)
    }

    // 2) 발신 팩스번호: fax_sender_num 우선 → 카카오/SMS 발신번호 공용
    const kakaoSettings = await getKakaoSettings(db, entityId)
    const faxSenderRow = await db.prepare(
      "SELECT setting_value FROM settings WHERE setting_key = 'fax_sender_num'"
    ).first<{ setting_value: string }>()
    const senderNum = (faxSenderRow?.setting_value || '').trim() || kakaoSettings.senderNum || ''

    // 3) SendFaxFromFTP (CERTKEY는 MES env)
    const provider = new BarobillFaxProvider({ certKey, corpNum, isTest, senderId })
    const result = await provider.sendFax({
      senderNum,
      senderName: '동산기획',
      receiverNum: receiver_num,
      receiverName: receiver_name || '',
      fileName: ftpFilename,   // FTP에 올린 파일명
      fileData: '',            // 파일은 이미 FTP에 있음
    })
    const ok = result.code >= 1

    // 4) 발송 로그 (kakao_send_logs, channel='fax', 멀티법인 entity_id)
    await db.prepare(`
      INSERT INTO kakao_send_logs (receipt_num, template_code, receiver_num, receiver_name, related_type, related_id, client_id, content, status, result_code, result_message, sent_by, channel, entity_id)
      VALUES (?, 'FAX', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fax', ?)
    `).bind(
      result.receiptNum || '', receiver_num, receiver_name || null,
      related_type || null, related_id || null, client_id || null,
      file_name || 'document.pdf', ok ? 'SUCCESS' : 'FAILED', result.code, result.message,
      userId, entityId,
    ).run()

    return c.json({
      success: true,
      data: {
        receipt_num: result.receiptNum,
        code: result.code,
        message: result.message,
        status: ok ? 'SUCCESS' : 'FAILED',
      }
    })
  } catch (error) {
    console.error('fax /send error:', error)
    return c.json({ success: false, error: '팩스 발송 실패: ' + (error as any).message }, 500)
  }
})

export default faxRouter
