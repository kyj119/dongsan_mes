/**
 * purchaseOrders.ts — 발주 라우터 (aggregator)
 *
 * 2026-04-15 분할 → 2026-06-12 재분할(대형파일): core.ts 2194→771줄, 도메인별 7 서브라우터
 *   - core.ts:        발주 CRUD (목록·:id·생성·수정·status·삭제)
 *   - po-queries.ts:  통계/조회 (stats·csv·:id/invoice·my-lines)
 *   - po-receipts.ts: 입고 이력/검수/명세서 (receipts·:id/inspections·receiving-queue)
 *   - po-receive.ts:  입고 처리 (POST /:id/receive)
 *   - po-special.ts:  복사/재발주/빠른발주 (:id/copy·:id/reorder·quick)
 *   - templates.ts:   발주 템플릿 CRUD
 *   - stock-alerts.ts: 재고 경고
 * 각 서브라우터 자체 auth(.use). URL 구조(/api/purchase-orders/*) 그대로.
 *
 * 마운트 순서: 구체 경로 서브라우터 전부 → core(/:id) 마지막.
 * 이유: core의 /:id 가 /templates·/stats·/receipts 등 구체 경로를 섀도잉하지 않도록.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import poCoreRouter from './purchaseOrders/core'
import templatesRouter from './purchaseOrders/templates'
import stockAlertsRouter from './purchaseOrders/stock-alerts'
import poQueriesRouter from './purchaseOrders/po-queries'
import poReceiptsRouter from './purchaseOrders/po-receipts'
import poReceiveRouter from './purchaseOrders/po-receive'
import poSpecialRouter from './purchaseOrders/po-special'

const poRouter = new Hono<HonoEnv>()

// 대형파일 분할: 구체 경로 서브라우터들을 core(/:id) 앞에 마운트 (섀도잉 방지).
poRouter.route('/', templatesRouter)
poRouter.route('/', stockAlertsRouter)
poRouter.route('/', poQueriesRouter)
poRouter.route('/', poReceiptsRouter)
poRouter.route('/', poReceiveRouter)
poRouter.route('/', poSpecialRouter)
poRouter.route('/', poCoreRouter)

export default poRouter
