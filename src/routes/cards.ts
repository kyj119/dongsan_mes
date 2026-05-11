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
import cardsQueriesRouter from './cards/queries'
import cardsSchedulingRouter from './cards/scheduling'
import cardsLifecycleRouter from './cards/lifecycle'

const cardsRouter = new Hono<HonoEnv>()

// 인증/권한 미들웨어는 각 서브 라우터가 자체 적용 (이중 적용 안 함)
// 매칭 순서: 구체 경로 우선
cardsRouter.route('/', cardsQueriesRouter)
cardsRouter.route('/', cardsSchedulingRouter)
cardsRouter.route('/', cardsLifecycleRouter)

export default cardsRouter
