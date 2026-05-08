/**
 * purchaseOrders.ts — 발주 라우터 (aggregator)
 *
 * 2026-04-15 분할: 3개 서브 라우터로 분리 (원본 2,011줄 → 26줄 aggregator)
 *   - src/routes/purchaseOrders/core.ts: 발주 CRUD + 상태/조회/특수 (15 routes, ~1620줄)
 *   - src/routes/purchaseOrders/templates.ts: 발주 템플릿 CRUD (5 routes, ~290줄)
 *   - src/routes/purchaseOrders/stock-alerts.ts: 재고 경고 (3 routes, ~95줄)
 * URL 구조(/api/purchase-orders/*) 그대로.
 *
 * 마운트 순서: templates → stock-alerts → core.
 * 이유: /:id 경로(core)가 /templates, /stock-alerts 구체 경로를 섀도잉하지 않도록.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import poCoreRouter from './purchaseOrders/core'
import templatesRouter from './purchaseOrders/templates'
import stockAlertsRouter from './purchaseOrders/stock-alerts'

const poRouter = new Hono<HonoEnv>()

poRouter.route('/', templatesRouter)
poRouter.route('/', stockAlertsRouter)
poRouter.route('/', poCoreRouter)

export default poRouter
