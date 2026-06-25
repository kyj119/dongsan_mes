/**
 * taxInvoices.ts — 세금계산서 라우터 (aggregator)
 *
 * 2026-06-11 대형파일 분할(2195줄 → 배럴): 헬퍼 + 5 서브라우터.
 *   - taxInvoices/queries.ts: GET 조회(목록·상세·발행대상·월합산대상·인쇄URL·연결테스트)
 *   - taxInvoices/issue.ts:   발행 라이프사이클(direct·생성·issue·modify·cancel)
 *   - taxInvoices/batch.ts:   일괄/월합산 발행(batch-create·monthly-create)
 *   - taxInvoices/manage.ts:  관리(PATCH·DELETE·refresh-status·retry·send-email)
 *   - taxInvoices/helpers.ts: 공유 헬퍼(provider·번호·설정·issueTaxInvoice·createSplitInvoices)
 * 각 서브라우터가 자체 auth(.use) 적용. 기존 URL 구조(/api/tax-invoices/...) 유지.
 */
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import taxInvoicesQueriesRouter from './taxInvoices/queries'
import taxInvoicesIssueRouter from './taxInvoices/issue'
import taxInvoicesBatchRouter from './taxInvoices/batch'
import taxInvoicesManageRouter from './taxInvoices/manage'
import taxInvoicesPaymentMatchRouter from './taxInvoices/paymentMatch'

// #344: 포털 세금계산서 다운로드에서 getTaxProvider 재사용 (외부 import 경로 호환)
export { getTaxProvider } from './taxInvoices/helpers'

const taxInvoicesRouter = new Hono<HonoEnv>()

// 마운트: 모든 라우트가 method+path로 명확히 구분(/:id는 숫자 제약)되어 순서 무관.
taxInvoicesRouter.route('/', taxInvoicesQueriesRouter)
taxInvoicesRouter.route('/', taxInvoicesIssueRouter)
taxInvoicesRouter.route('/', taxInvoicesBatchRouter)
taxInvoicesRouter.route('/', taxInvoicesManageRouter)
taxInvoicesRouter.route('/', taxInvoicesPaymentMatchRouter)

export default taxInvoicesRouter
