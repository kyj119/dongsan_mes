/**
 * orders.ts — 주문 라우터 (aggregator)
 *
 * 2026-04-15 분할: 3개 서브 라우터로 분리
 *   - src/routes/orders/core.ts: CRUD + 상태/청구/타임라인/세금계산서 (10 엔드포인트, ~1750줄)
 *   - src/routes/orders/queries.ts: 통계/견적만료/출고대기/옵션/일괄작업/CSV (7 엔드포인트, ~300줄)
 *   - src/routes/orders/operations.ts: 복사/전환/이메일 발송 (3 엔드포인트, ~400줄)
 * 기존 URL 구조(/api/orders/...)는 그대로 유지.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import ordersCoreRouter from './orders/core'
import ordersQueriesRouter from './orders/queries'
import ordersOpsRouter from './orders/operations'

const ordersRouter = new Hono<HonoEnv>()

// 주의: 라우트 매칭 우선순위 — 구체 경로(quotations/expired, stats 등)가 /:id 보다 먼저 평가되어야 함
// queries(구체 경로) → operations(/:id/copy 등 POST 특수) → core(CRUD + /:id) 순서로 마운트
ordersRouter.route('/', ordersQueriesRouter)
ordersRouter.route('/', ordersOpsRouter)
ordersRouter.route('/', ordersCoreRouter)

export default ordersRouter
