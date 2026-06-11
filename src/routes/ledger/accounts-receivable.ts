/**
 * ledger/accounts-receivable.ts — 매출원장(AR) 라우터 (aggregator)
 *
 * 2026-06-12 대형파일 분할(2228줄 → 배럴): 공유 헬퍼 + 4 서브라우터.
 *   - ar-ledger.ts:      거래처 원장(client·csv)·정산(settlement)·월/마감/손익 요약
 *   - ar-payments.ts:    입금/감액 (payment·adjustment)
 *   - ar-receivables.ts: 미수금/정합성 (receivables·aging·overdue·integrity·recalculate)
 *   - ar-dunning.ts:     독촉 (collection-logs·send-email)
 *   - ar-helpers.ts:     공유 헬퍼(deriveClientBalance·buildIntegrityQuery·getAgingCategory) + Row 타입
 * 각 서브라우터가 자체 auth(.use) 적용. 기존 URL(/api/ledger/...) 유지. ledger.ts에서 arRouter 마운트.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../../types/env'
import arLedgerRouter from './ar-ledger'
import arPaymentsRouter from './ar-payments'
import arReceivablesRouter from './ar-receivables'
import arDunningRouter from './ar-dunning'

const arRouter = new Hono<HonoEnv>()

// 마운트: 모든 라우트가 path로 명확히 구분되어 순서 무관.
// 단 /collection-logs/:clientId↔:id 동일패턴쌍의 순서는 ar-dunning 내부에서 보존됨.
arRouter.route('/', arLedgerRouter)
arRouter.route('/', arPaymentsRouter)
arRouter.route('/', arReceivablesRouter)
arRouter.route('/', arDunningRouter)

export default arRouter
