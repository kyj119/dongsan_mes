import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'

const webhooksRouter = new Hono<HonoEnv>()

// ────────────────────────────────────────────────────────────────────────────
// 팝빌 세금계산서 Webhook (인증 없음 — 팝빌에서 직접 POST)
//
// 팝빌이 세금계산서 상태 변경 시 이 URL로 HTTP POST를 보냅니다.
// 설정: 팝빌 > 전자세금계산서 > Webhook > 콜백 URL에 등록
//
// stateCode 매핑:
//   1=임시저장, 2=승인대기, 3=발행완료, 4=발행거부, 5=삭제
//   100=국세청전송중, 110=국세청전송성공, 111=국세청전송실패
// ────────────────────────────────────────────────────────────────────────────
webhooksRouter.post('/popbill/taxinvoice', async (c) => {
  const db = c.env.DB

  try {
    const body = await c.req.json()

    // 팝빌 Webhook 페이로드: mgtKeyType, mgtKey, stateCode, stateDT, ntsconfirmNum, corpNum
    const { mgtKey, stateCode, stateDT, ntsconfirmNum } = body

    if (!mgtKey || stateCode === undefined) {
      return c.json({ code: 1, message: 'OK (ignored: missing fields)' })
    }

    // 팝빌 Webhook 보안:
    // - Popbill은 HMAC 서명을 제공하지 않으므로 IP 기반 필터링 권장
    // - Cloudflare Firewall Rules에서 Popbill IP 대역만 /api/webhooks/* 허용 설정
    // - 또는 WAF 규칙으로 IP 화이트리스트 적용
    const clientIP = c.req.header('CF-Connecting-IP') || 'unknown'

    // IP 기반 검증 — 팝빌 서버 IP 대역만 허용
    const allowedPrefixes = ['211.47.75.', '211.47.74.', '121.131.196.', '175.126.38.']
    const isAllowed = allowedPrefixes.some(prefix => clientIP.startsWith(prefix))
    if (!isAllowed && clientIP !== 'unknown') {
      console.warn(`[Webhook] 차단: 허용되지 않은 IP ${clientIP}`)
      return c.json({ code: -1, message: 'Forbidden' }, 403)
    }

    console.log(`[Webhook] Popbill callback received: stateCode=${stateCode}, mgtKey=${mgtKey}, IP=${clientIP}`)

    // mgtKey = invoice_number (TI-2026-XXXX)
    const invoice = await db.prepare(
      `SELECT id, status FROM tax_invoices WHERE invoice_number = ?`
    ).bind(mgtKey).first() as any

    if (!invoice) {
      // 존재하지 않는 세금계산서 — 무시 (팝빌에 OK 응답)
      return c.json({ code: 1, message: 'OK (invoice not found)' })
    }

    // stateCode → 시스템 상태 매핑
    let newStatus = invoice.status
    let ntsResultCode = null as string | null
    let ntsResultMessage = null as string | null

    const code = parseInt(stateCode)
    if (code === 110) {
      newStatus = 'NTS_SUCCESS'
      ntsResultCode = '110'
      ntsResultMessage = '국세청 전송 성공'
    } else if (code === 111) {
      newStatus = 'NTS_FAILED'
      ntsResultCode = '111'
      ntsResultMessage = '국세청 전송 실패'
    } else if (code === 100) {
      newStatus = 'SENT'
    } else if (code === 3) {
      newStatus = 'SENT'
    } else if (code === 4) {
      newStatus = 'FAILED'
      ntsResultMessage = '발행 거부됨'
    }

    // 상태가 변경된 경우만 업데이트
    if (newStatus !== invoice.status || ntsconfirmNum) {
      await db.prepare(`
        UPDATE tax_invoices
        SET status = ?,
            nts_result_code = COALESCE(?, nts_result_code),
            nts_result_message = COALESCE(?, nts_result_message),
            nts_approval_number = COALESCE(?, nts_approval_number),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        newStatus,
        ntsResultCode,
        ntsResultMessage,
        ntsconfirmNum || null,
        invoice.id
      ).run()
    }

    // 팝빌은 code: 1 응답을 기대
    return c.json({ code: 1, message: 'OK' })
  } catch (error) {
    // Webhook은 에러가 나도 200으로 응답 (팝빌 재시도 방지)
    console.error('Webhook error:', error)
    return c.json({ code: 1, message: 'OK (error logged)' })
  }
})

export default webhooksRouter
