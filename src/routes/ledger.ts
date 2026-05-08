/**
 * ledger.ts — 원장 라우터 (aggregator)
 *
 * 2026-04-15 분할: AR(매출) + AP(매입) 도메인 분리
 *   - src/routes/ledger/accounts-receivable.ts: 매출/입금/수금/감액/미수금 (25 엔드포인트)
 *   - src/routes/ledger/accounts-payable.ts: 매입/지급/매입감액/매입미지급 (13 엔드포인트)
 * 기존 URL 구조(/api/ledger/...)는 그대로 유지됨.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import arRouter from './ledger/accounts-receivable'
import apRouter from './ledger/accounts-payable'

const ledgerRouter = new Hono<HonoEnv>()

// 두 서브 라우터를 동일 prefix("/")에 마운트 → URL 호환 유지
ledgerRouter.route('/', arRouter)
ledgerRouter.route('/', apRouter)

export default ledgerRouter
