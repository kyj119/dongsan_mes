/**
 * orders.ts — 주문 라우터 (aggregator)
 *
 * 2026-04-15 분할 → 2026-06-11 재분할(대형파일 분할): 헬퍼 + 6개 서브 라우터
 *   - core.ts: GET 목록/상세/timeline/invoice/in-transit + DELETE (~600줄)
 *   - queries.ts: 통계/견적만료/출고대기/옵션/일괄작업/CSV
 *   - operations.ts: 복사/전환/이메일 발송
 *   - lifecycle.ts: 청구(bill·billing-status)·출력폴더·status·cancel·restore·sync-statuses
 *   - create.ts: POST / (주문 생성)
 *   - update.ts: PUT /:id (주문 수정)
 *   - helpers.ts: 공유 헬퍼(카드그룹·담당법인·청구그룹·청구상태·카드생성)
 * 기존 URL 구조(/api/orders/...)는 그대로 유지.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import ordersCoreRouter from './orders/core'
import ordersQueriesRouter from './orders/queries'
import ordersOpsRouter from './orders/operations'
import ordersLifecycleRouter from './orders/lifecycle'
import ordersCreateRouter from './orders/create'
import ordersUpdateRouter from './orders/update'

const ordersRouter = new Hono<HonoEnv>()

// 주의: 라우트 매칭 우선순위 — 구체 경로(quotations/expired, stats 등)가 /:id 보다 먼저 평가되어야 함
// queries(구체 경로) → operations(/:id/copy 등) → lifecycle(/:id/bill·status 등 전이) → create(POST /) → update(PUT /:id) → core(GET + DELETE /:id) 순서로 마운트
ordersRouter.route('/', ordersQueriesRouter)
ordersRouter.route('/', ordersOpsRouter)
ordersRouter.route('/', ordersLifecycleRouter)
ordersRouter.route('/', ordersCreateRouter)
ordersRouter.route('/', ordersUpdateRouter)
ordersRouter.route('/', ordersCoreRouter)

export default ordersRouter
