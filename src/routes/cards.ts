/**
 * cards.ts — 카드 라우터 (aggregator)
 *
 * 2026-05-09 Phase 3.1.A 분할: 3개 서브 라우터로 분리 (총 31 라우트)
 *   - cards/queries.ts: 읽기 + 통계 (13 라우트, ~835줄)
 *   - cards/scheduling.ts: 일정 + 우선순위 (4 라우트, ~166줄)
 *   - cards/lifecycle.ts: 상태 전환 + 출고 + 불량 + 카드 생성 (14 라우트, ~1178줄)
 *
 * URL 구조 그대로 유지 (/api/cards/...).
 *
 * 라우트 매칭 우선순위:
 *   queries(구체 경로 /schedule, /defects, /by-number, /stats, /:id 등)
 *   → scheduling(/schedule/:id, /bulk/priority, /:id)
 *   → lifecycle(/bulk/*, /:id/*, /generate/*)
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { agentKeyOrAuthMiddleware } from '../middleware/auth'
import { cardEntityFilter } from '../utils/entityFilter'
import cardsQueriesRouter from './cards/queries'
import cardsSchedulingRouter from './cards/scheduling'
import cardsLifecycleRouter from './cards/lifecycle'

const cardsRouter = new Hono<HonoEnv>()

// #375: GET /by-number/:cardNumber — LogWatcher/EdgeAgent 겸용 카드 조회.
//   queries 라우터(authMiddleware 강제 = JWT 필수)보다 먼저 등록해 매칭 우선.
//   X-Agent-Key → 전역(교차법인, entityId=0) / JWT 사용자 → cardEntityFilter로 자기 법인만(IDOR 차단).
cardsRouter.get('/by-number/:cardNumber', agentKeyOrAuthMiddleware, async (c) => {
  try {
    const cardNumber = c.req.param('cardNumber')
    const efBn = cardEntityFilter(c, 'c')
    const row = await c.env.DB.prepare(`
      SELECT c.*, o.order_number
      FROM cards c
      LEFT JOIN orders o ON c.order_id = o.id
      WHERE c.card_number = ?${efBn.clause}
    `).bind(cardNumber, ...efBn.params).first()
    if (!row) return c.json({ success: false, error: 'Card not found' }, 404)
    return c.json({ success: true, data: row })
  } catch (error) {
    console.error('cards by-number error:', error)
    return c.json({ success: false, error: 'Server error' }, 500)
  }
})

// 인증/권한 미들웨어는 각 서브 라우터가 자체 적용 (이중 적용 안 함)
// 매칭 순서: 구체 경로 우선
cardsRouter.route('/', cardsQueriesRouter)
cardsRouter.route('/', cardsSchedulingRouter)
cardsRouter.route('/', cardsLifecycleRouter)

export default cardsRouter
