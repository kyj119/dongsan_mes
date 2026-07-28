// ============================================================================
// 수신거부 공개 API (/api/public/unsubscribe) — **인증 없음**
//
// 정보통신망법 §50⑧: 수신거부·수신동의 철회 수단은 수신자가 **비용 부담 없이** 쓸 수 있어야 한다.
// 로그인·본인확인을 요구하면 그 자체가 §50⑤(수신거부 방해)에 해당할 수 있어 무인증으로 둔다.
//
// 무인증이라 토큰 추측 공격이 가능하므로:
//  - 토큰은 128bit 랜덤(crypto.randomUUID)
//  - index.tsx에서 rateLimitMiddleware 적용
//  - 응답에 전체 번호를 절대 넣지 않는다(마스킹) — 토큰 스캔으로 번호를 수집당하면 안 됨
// ============================================================================

import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { maskPhone } from '../services/messageCompliance'

const publicUnsubscribeRouter = new Hono<HonoEnv>()

interface TokenRow {
  token: string
  phone: string
  client_id: number | null
  client_name: string | null
}

async function findToken(db: D1Database, token: string): Promise<TokenRow | null> {
  if (!token || token.length < 16) return null
  return await db.prepare(`
    SELECT ut.token, ut.phone, ut.client_id, c.client_name
    FROM unsubscribe_tokens ut
    LEFT JOIN clients c ON ut.client_id = c.id
    WHERE ut.token = ?
  `).bind(token).first<TokenRow>()
}

// GET /:token — 링크 유효성 + 현재 수신거부 상태
publicUnsubscribeRouter.get('/:token', async (c) => {
  try {
    const db = c.env.DB
    const row = await findToken(db, c.req.param('token'))
    if (!row) return c.json({ success: false, error: '유효하지 않은 링크입니다.' }, 404)

    const opted = await db.prepare('SELECT id FROM message_opt_outs WHERE phone = ?')
      .bind(row.phone).first<{ id: number }>()

    return c.json({
      success: true,
      data: {
        phone_masked: maskPhone(row.phone),
        client_name: row.client_name || '',
        opted_out: !!opted,
      }
    })
  } catch (error) {
    console.error('src/routes/publicUnsubscribe.ts GET /:token error:', error)
    return c.json({ success: false, error: '조회 실패' }, 500)
  }
})

// POST /:token — 수신거부 등록 (멱등)
publicUnsubscribeRouter.post('/:token', async (c) => {
  try {
    const db = c.env.DB
    const row = await findToken(db, c.req.param('token'))
    if (!row) return c.json({ success: false, error: '유효하지 않은 링크입니다.' }, 404)

    await db.prepare(
      `INSERT OR IGNORE INTO message_opt_outs (phone, client_id, source, reason)
       VALUES (?, ?, 'WEB', '수신거부 링크')`
    ).bind(row.phone, row.client_id).run()

    // §50⑥ 처리결과 통지: 별도 문자를 보내지 않고 **즉시 화면으로 결과를 알린다**(추가 과금 없음).
    return c.json({
      success: true,
      data: { phone_masked: maskPhone(row.phone), opted_out: true }
    })
  } catch (error) {
    console.error('src/routes/publicUnsubscribe.ts POST /:token error:', error)
    return c.json({ success: false, error: '수신거부 처리 실패' }, 500)
  }
})

// DELETE /:token — 수신거부 철회 (실수로 누른 경우 되돌리기)
publicUnsubscribeRouter.delete('/:token', async (c) => {
  try {
    const db = c.env.DB
    const row = await findToken(db, c.req.param('token'))
    if (!row) return c.json({ success: false, error: '유효하지 않은 링크입니다.' }, 404)

    await db.prepare('DELETE FROM message_opt_outs WHERE phone = ?').bind(row.phone).run()
    return c.json({ success: true, data: { phone_masked: maskPhone(row.phone), opted_out: false } })
  } catch (error) {
    console.error('src/routes/publicUnsubscribe.ts DELETE /:token error:', error)
    return c.json({ success: false, error: '철회 처리 실패' }, 500)
  }
})

export default publicUnsubscribeRouter
