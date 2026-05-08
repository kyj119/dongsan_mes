/**
 * payroll.ts — 급여 라우터 (aggregator)
 *
 * 2026-04-15 분할: 5개 서브 라우터 + 공유 모듈로 분리 (원본 2,004줄 → 24줄 aggregator)
 *   - src/routes/payroll/shared.ts:   공유 타입 6개 + 헬퍼 8개 (core/settings에서 import)
 *   - src/routes/payroll/core.ts:     급여 계산 (preview/save/batch/sync-attendance, 4 routes)
 *   - src/routes/payroll/records.ts:  레코드 CRUD (list/get/approve/pay/delete, 5 routes)
 *   - src/routes/payroll/settings.ts: 요율/세액표 (rates + tax-table + generate, 9 routes)
 *   - src/routes/payroll/year-end.ts: 연말정산 (5 routes + 자체 헬퍼 3개)
 *   - src/routes/payroll/tax-agent.ts: 세무대리인 CSV (4 routes + 자체 헬퍼 4개)
 * 총 27 엔드포인트, URL 구조(/api/payroll/*) 그대로 유지.
 *
 * 마운트 순서 주의: 구체 경로(/year-end-list, /tax-agent/*, /rates/*, /tax-table/*)를
 * /:id 등 파라미터 경로보다 먼저 마운트해야 섀도잉 없음.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import coreRouter from './payroll/core'
import recordsRouter from './payroll/records'
import settingsRouter from './payroll/settings'
import yearEndRouter from './payroll/year-end'
import taxAgentRouter from './payroll/tax-agent'

const payrollRouter = new Hono<HonoEnv>()

// 구체 경로 먼저 마운트 → /:id 경로가 섀도잉 안하도록
payrollRouter.route('/', taxAgentRouter)   // /tax-agent/*
payrollRouter.route('/', yearEndRouter)    // /year-end, /year-end-settlement, /year-end-list
payrollRouter.route('/', settingsRouter)   // /rates, /tax-table
payrollRouter.route('/', coreRouter)       // /preview, /save, /batch, /sync-attendance
payrollRouter.route('/', recordsRouter)    // /, /:id, /:id/approve, /:id/pay, DELETE /:id

export default payrollRouter
