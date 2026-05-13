import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { HonoEnv } from './types/env'
import { authMiddleware, requireAdmin, pageAuthMiddleware } from './middleware/auth'
import { requirePagePermission, requireAdminPage } from './middleware/permissions'
import { rateLimitMiddleware } from './middleware/rateLimit'

// API Routers
import clientsRouter from './routes/clients'
import itemsRouter from './routes/items'
import ordersRouter from './routes/orders'
import cardsRouter from './routes/cards'
import ripRouter from './routes/rip'
import authRouter from './routes/auth'
import dashboardRouter from './routes/dashboard'
import ledgerRouter from './routes/ledger'
import inventoryRouter from './routes/inventory'
import hrRouter from './routes/hr'
import productionRouter from './routes/production'
import aiAnalysisRouter from './routes/aiAnalysis'
import aiLayoutRouter from './routes/aiLayout'
import tasksRouter from './routes/tasks'
import templatesRouter from './routes/templates'
import ppRouter from './routes/postProcessing'
import printEventsRouter from './routes/printEvents'
import settingsRouter from './routes/settings'
import poRouter from './routes/purchaseOrders'
import purchaseRequestsRouter from './routes/purchaseRequests'
import pricesRouter from './routes/prices'
import priceListsRouter from './routes/priceLists'
import usersRouter from './routes/users'
import taxInvoicesRouter from './routes/taxInvoices'
import webhooksRouter from './routes/webhooks'
import bankRouter from './routes/bank'
import shipmentsRouter from './routes/shipments'
import reportsRouter from './routes/reports'
import activityLogsRouter from './routes/activityLogs'
import notificationsRouter from './routes/notifications'
import searchRouter from './routes/search'
import productionReportsRouter from './routes/productionReports'
import costsRouter from './routes/costs'
import forecastRouter from './routes/forecast'
import emailsRouter from './routes/emails'
import cashFlowRouter from './routes/cashFlow'
import facilityRouter from './routes/facility'
import bomRouter from './routes/bom'
import approvalsRouter from './routes/approvals'
import cashReceiptsRouter from './routes/cashReceipts'
import hometaxInvoicesRouter from './routes/hometaxInvoices'
import portalRouter from './routes/portal'
import { iaAuto } from './routes/iaAuto'
import inventoryCountRouter from './routes/inventoryCount'
import autoProcessRouter from './routes/autoProcess'
import storageZonesRouter from './routes/storageZones'
import permissionsRouter from './routes/permissions'
import inspectionsRouter from './routes/inspections'
import migrationRouter from './routes/migration'
import cashScheduleRouter from './routes/cashSchedule'
import vatReportsRouter from './routes/vatReports'
import paymentRequestsRouter from './routes/paymentRequests'
import financialReportsRouter from './routes/financialReports'
import leavesRouter from './routes/leaves'
import payrollRouter from './routes/payroll'
import attendanceRouter from './routes/attendance'
import kakaoRouter from './routes/kakao'
import messagesRouter from './routes/messages'
import capsRouter from './routes/caps'
import { insuranceReportsRouter } from './routes/insuranceReports'
import messageTemplatesRouter from './routes/messageTemplates'
import faxRouter from './routes/fax'
import printSystemRouter from './routes/printSystem'
import finishingRouter from './routes/finishing'
import filesRouter from './routes/files'
import priceListRouter from './routes/priceList'
import quotationsRouter from './routes/quotations'

// Page handlers
import { clientsPage } from './pages/clients'
import { itemsPage } from './pages/items'
import { priceListsPage } from './pages/priceLists'
import { priceListPage } from './pages/priceList'
import { cardsPage } from './pages/cards'
import { ordersPage } from './pages/orders'
import { orderFormPage } from './pages/orderForm'
import { loginPage } from './pages/login'
import { ledgerPage } from './pages/ledger'
import { inventoryPage } from './pages/inventory'
import { productionPage } from './pages/production'
import { hrPage } from './pages/hr'
import { hrDetailPage } from './pages/hrDetail'
import { attendancePage } from './pages/attendance'
import { usersPage } from './pages/users'
import { postProcessingPage } from './pages/postProcessing'
import { equipmentPage } from './pages/equipment'
import { iaScanPage } from './pages/iaScan'
import { iaAutoProcessPage } from './pages/iaAutoProcess'
import { iaBatchTestPage } from './pages/iaBatchTest'
import { ripPage } from './pages/rip'
import { invoicePage } from './pages/invoice'
import { quotationPage } from './pages/quotation'
import { quotationsPage } from './pages/quotations'
import { quotationFormPage } from './pages/quotationForm'
import { purchaseInvoicePage } from './pages/purchaseInvoice'
import { settingsPage } from './pages/settings'
import { purchaseOrdersPage } from './pages/purchaseOrders'
import { purchaseOrderFormPage } from './pages/purchaseOrderForm'
import { purchaseRequestsPage } from './pages/purchaseRequests'
import { purchaseRequestFormPage } from './pages/purchaseRequestForm'
import { inspectionsPage } from './pages/inspections'
import { receivingPage } from './pages/receiving'
import { dashboardPage } from './pages/dashboard'
import { taxInvoicesPage } from './pages/taxInvoices'
import { bankPage } from './pages/bank'
// billingPage → ledger 통합됨
import { shipmentsPage } from './pages/shipments'
import { reportsPage } from './pages/reports'
import { clientDetailPage } from './pages/clientDetail'
import { activityLogPage } from './pages/activityLog'
import { tasksPage } from './pages/tasks'
import { schedulePage } from './pages/schedule'
import { productionReportsPage } from './pages/productionReports'
import { productionDailyPage } from './pages/productionDaily'
import { materialForecastPage } from './pages/materialForecast'
// receivablesPage → ledger 통합됨
// forecastPage → reports 통합됨
// emailLogsPage → activityLog 통합됨
// cashFlowPage → bank 통합됨
import { facilityPage } from './pages/facility'
import { bomPage } from './pages/bom'
// workflow page removed (폐기)
import { approvalsPage } from './pages/approvals'
// cashReceiptsPage → taxInvoices 통합됨
// hometaxInvoicesPage → taxInvoices 통합됨
import { deliveryAnalyticsPage } from './pages/deliveryAnalytics'
import { shipmentsDashboardPage } from './pages/shipmentsDashboard'
// demandAnalyticsPage → reports 통합됨
import { uiGuidePage } from './pages/uiGuide'
import { uiComparePage } from './pages/uiCompare'
import { migrationPage } from './pages/migration'
import { vatReportsPage } from './pages/vatReports'
import { cashSchedulePage } from './pages/cashSchedule'
import { paymentRequestsPage } from './pages/paymentRequests'
import { financialReportsPage } from './pages/financialReports'
import { leavesPage } from './pages/leaves'
import { payrollPage } from './pages/payroll'
import { payrollRatesPage } from './pages/payrollRates'
import { storageZonesPage } from './pages/storageZones'
import { permissionsPage } from './pages/permissions'
import { noPermissionPage } from './pages/noPermission'
import { payslipPage } from './pages/payslip'
import { yearEndPage } from './pages/yearEnd'
import { yearEndManagePage } from './pages/yearEndManage'
import { insuranceReportsPage } from './pages/insuranceReports'
import { messagesPage } from './pages/messages'
// costAnalysisPage → productionReports 통합됨
import { portalLoginPage } from './pages/portal/portalLogin'
import { portalDashboardPage } from './pages/portal/portalDashboard'
import { portalOrdersPage } from './pages/portal/portalOrders'
import { portalBalancePage } from './pages/portal/portalBalance'
import { portalInvoicesPage } from './pages/portal/portalInvoices'
import { portalDocumentPage } from './pages/portal/portalDocument'

const app = new Hono<HonoEnv>()

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack)
  return c.json({ success: false, error: '서버 오류가 발생했습니다' }, 500)
})

// Trailing slash redirect: /api/clients/ → /api/clients
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path !== '/' && path.endsWith('/')) {
    const newUrl = new URL(c.req.url)
    newUrl.pathname = path.slice(0, -1)
    return c.redirect(newUrl.toString(), 301)
  }
  await next()
})

// Enable CORS for API routes — 허용 도메인 제한
app.use('/api/*', cors({
  origin: (origin) => {
    // 로컬 개발
    if (!origin) return '*'
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://192.168.')) return origin
    // Cloudflare Pages 배포 도메인
    if (origin.endsWith('.pages.dev') || origin.endsWith('.dongsan.co.kr')) return origin
    return null
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-SPA-Request', 'X-Agent-Key'],
  maxAge: 86400,
}))

// 보안 헤더 — Clickjacking, MIME sniffing, Referrer 노출 방지
app.use('*', async (c, next) => {
  await next()
  c.header('X-Frame-Options', 'DENY')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
})

// Rate limiting — 로그인 브루트포스 방지
app.use('/api/auth/login', rateLimitMiddleware(5, 60000))  // 분당 5회
app.use('/api/portal/auth/login', rateLimitMiddleware(5, 60000))
app.use('/api/users/change-password', rateLimitMiddleware(5, 60000))  // 분당 5회
app.use('/api/portal/auth/change-password', rateLimitMiddleware(5, 60000))  // 분당 5회
app.use('/api/auth/refresh', rateLimitMiddleware(10, 60000))  // 분당 10회

// Mount API routers
app.route('/api/auth', authRouter)
app.route('/api/dashboard', dashboardRouter)
app.route('/api/ledger', ledgerRouter)
app.route('/api/inventory', inventoryRouter)
app.route('/api/hr', hrRouter)
app.route('/api/production', productionRouter)
app.route('/api/clients', clientsRouter)
app.route('/api/items', itemsRouter)
app.route('/api/orders', ordersRouter)
app.route('/api/quotations', quotationsRouter)
app.route('/api/cards', cardsRouter)
app.route('/api/rip', ripRouter)
app.route('/api/ai-analysis', aiAnalysisRouter)
app.route('/api/ai-layout', aiLayoutRouter)
app.route('/api/tasks', tasksRouter)
app.route('/api/templates', templatesRouter)
app.route('/api/post-processing', ppRouter)
app.route('/api/print-events', printEventsRouter)
app.route('/api/settings', settingsRouter)
app.route('/api/purchase-orders', poRouter)
app.route('/api/purchase-requests', purchaseRequestsRouter)
app.route('/api/prices', pricesRouter)
app.route('/api/price-lists', priceListsRouter)
app.route('/api/price-list', priceListRouter)
app.route('/api/users', usersRouter)
app.route('/api/tax-invoices', taxInvoicesRouter)
app.route('/api/webhooks', webhooksRouter)  // 팝빌 Webhook (인증 불필요)
app.route('/api/bank', bankRouter)
app.route('/api/shipments', shipmentsRouter)
app.route('/api/reports', reportsRouter)
app.route('/api/activity-logs', activityLogsRouter)
app.route('/api/notifications', notificationsRouter)
app.route('/api/search', searchRouter)
app.route('/api/production-reports', productionReportsRouter)
app.route('/api/costs', costsRouter)
app.route('/api/forecast', forecastRouter)
app.route('/api/emails', emailsRouter)
app.route('/api/cash-flow', cashFlowRouter)
app.route('/api/facility', facilityRouter)
app.route('/api/bom', bomRouter)
app.route('/api/approvals', approvalsRouter)
app.route('/api/cash-receipts', cashReceiptsRouter)
app.route('/api/hometax-invoices', hometaxInvoicesRouter)
app.route('/api/portal', portalRouter)
app.route('/api/ia-auto', iaAuto)
app.route('/api/inventory-counts', inventoryCountRouter)
app.route('/api/auto-process', autoProcessRouter)
app.route('/api/files', filesRouter)
app.route('/api/storage-zones', storageZonesRouter)
app.route('/api/permissions', permissionsRouter)
app.route('/api/inspections', inspectionsRouter)
app.route('/api/migration', migrationRouter)
app.route('/api/vat', vatReportsRouter)
app.route('/api/payment-requests', paymentRequestsRouter)
app.route('/api/financial', financialReportsRouter)
app.route('/api/leaves', leavesRouter)
app.route('/api/payroll', payrollRouter)
app.route('/api/attendance', attendanceRouter)
// cashScheduleRouter는 cashFlow와 prefix 공유 (내부 경로 /schedule/* 중복 없음, 스크립트가 /api/cash-flow/schedule/* 호출)
app.route('/api/cash-flow', cashScheduleRouter)
app.route('/api/kakao', kakaoRouter)
app.route('/api/messages', messagesRouter)
app.route('/api/caps', capsRouter)
app.route('/api/insurance-reports', insuranceReportsRouter)
app.route('/api/message-templates', messageTemplatesRouter)
app.route('/api/fax', faxRouter)
app.route('/api/print-system', printSystemRouter)
app.route('/api/finishing', finishingRouter)

// Utility API endpoints
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    message: 'ERP+MES System API',
    timestamp: new Date().toISOString()
  })
})

app.get('/api/db-test', authMiddleware, requireAdmin, async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT 1 as test').first()
    return c.json({ status: 'ok', db_connected: true, result })
  } catch (error) {
    return c.json({
      status: 'error', db_connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

app.get('/api/stats', authMiddleware, requireAdmin, async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as active_users,
        (SELECT COUNT(*) FROM clients WHERE is_active = 1) as active_clients,
        (SELECT COUNT(*) FROM items WHERE is_active = 1) as active_items,
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COUNT(*) FROM cards) as total_cards,
        (SELECT COUNT(*) FROM item_categories WHERE is_active = 1) as item_categories
    `).first()
    return c.json({ success: true, data: stats })
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

app.get('/api/debug/cards', authMiddleware, requireAdmin, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT status, rip_status, COUNT(*) as cnt
      FROM cards GROUP BY status, rip_status ORDER BY status, rip_status
    `).all()
    const { results: orderCounts } = await c.env.DB.prepare(`
      SELECT o.status as order_status, COUNT(c.id) as card_cnt
      FROM cards c LEFT JOIN orders o ON c.order_id = o.id
      GROUP BY o.status
    `).all()
    return c.json({ card_counts: results, order_counts: orderCounts })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// Catch-all for unmatched API routes (must be after all route mounts)
app.all('/api/*', (c) => c.json({ success: false, error: 'Not Found' }, 404))

app.get('/favicon.ico', (c) => new Response(null, { status: 204 }))

// Page routes (login은 인증 불필요, 나머지는 pageAuthMiddleware로 SPA 토큰 검증)
app.get('/', (c) => c.redirect('/login'))
app.get('/login', loginPage)
app.get('/dashboard', pageAuthMiddleware, requirePagePermission('/dashboard'), dashboardPage)
app.get('/clients', pageAuthMiddleware, requirePagePermission('/clients'), clientsPage)
app.get('/clients/:id', pageAuthMiddleware, requirePagePermission('/clients'), (c) => clientDetailPage(c))
app.get('/items', pageAuthMiddleware, requirePagePermission('/items'), itemsPage)
app.get('/price-lists', (c) => c.redirect('/price-list'))
app.get('/price-list', pageAuthMiddleware, requirePagePermission('/price-list'), priceListPage)
app.get('/client-prices', (c) => c.redirect('/price-list'))
app.get('/cards', pageAuthMiddleware, requirePagePermission('/cards'), cardsPage)
app.get('/orders', pageAuthMiddleware, requirePagePermission('/orders'), ordersPage)
app.get('/order-form', pageAuthMiddleware, requirePagePermission('/orders'), orderFormPage)
app.get('/ledger', pageAuthMiddleware, requirePagePermission('/ledger'), ledgerPage)
app.get('/inventory', pageAuthMiddleware, requirePagePermission('/inventory'), inventoryPage)
app.get('/production', pageAuthMiddleware, requirePagePermission('/production'), productionPage)
app.get('/schedule', pageAuthMiddleware, requirePagePermission('/schedule'), schedulePage)
app.get('/hr', pageAuthMiddleware, requirePagePermission('/hr'), hrPage)
app.get('/hr/:id{[0-9]+}', pageAuthMiddleware, requirePagePermission('/hr'), hrDetailPage)
app.get('/attendance', pageAuthMiddleware, requirePagePermission('/attendance'), attendancePage)
app.get('/users', pageAuthMiddleware, requireAdminPage(), usersPage)
app.get('/post-processing', pageAuthMiddleware, requirePagePermission('/post-processing'), postProcessingPage)
app.get('/equipment', pageAuthMiddleware, requirePagePermission('/equipment'), equipmentPage)
app.get('/ia-scan', pageAuthMiddleware, requireAdminPage(), iaScanPage)
app.get('/ia-auto', pageAuthMiddleware, requireAdminPage(), iaAutoProcessPage)
app.get('/ia-batch-test', pageAuthMiddleware, requireAdminPage(), iaBatchTestPage)
app.get('/production-reports', pageAuthMiddleware, requirePagePermission('/production-reports'), productionReportsPage)
app.get('/rip', pageAuthMiddleware, requirePagePermission('/rip'), ripPage)
app.get('/invoice/:orderId', pageAuthMiddleware, requirePagePermission('/orders'), invoicePage)
app.get('/quotation/:orderId', pageAuthMiddleware, requirePagePermission('/quotations'), quotationPage)
app.get('/quotations', pageAuthMiddleware, requirePagePermission('/quotations'), quotationsPage)
app.get('/quotation-form', pageAuthMiddleware, requirePagePermission('/quotations'), quotationFormPage)
app.get('/quotation-form/:id', pageAuthMiddleware, requirePagePermission('/quotations'), quotationFormPage)
app.get('/purchase-invoice/:poId', pageAuthMiddleware, requirePagePermission('/purchase-orders'), purchaseInvoicePage)
app.get('/settings', pageAuthMiddleware, requireAdminPage(), settingsPage)
app.get('/cost-settings', (c) => c.redirect('/settings#tab=cost'))
app.get('/purchase-orders', pageAuthMiddleware, requirePagePermission('/purchase-orders'), purchaseOrdersPage)
app.get('/purchase-order-form', pageAuthMiddleware, requirePagePermission('/purchase-orders'), purchaseOrderFormPage)
app.get('/purchase-requests', pageAuthMiddleware, requirePagePermission('/purchase-requests'), purchaseRequestsPage)
app.get('/purchase-request-form', pageAuthMiddleware, requirePagePermission('/purchase-requests'), purchaseRequestFormPage)
app.get('/inspections', pageAuthMiddleware, requireAdminPage(), inspectionsPage)
app.get('/receiving', pageAuthMiddleware, requirePagePermission('/receiving'), receivingPage)
// 2026-04-15 저녁: /my-receiving은 /receiving 으로 통합. 기존 링크 호환 위해 301 리다이렉트.
app.get('/my-receiving', (c) => c.redirect('/receiving', 301))
app.get('/tax-invoices', pageAuthMiddleware, requirePagePermission('/tax-invoices'), taxInvoicesPage)
app.get('/cash-receipts', (c) => c.redirect('/tax-invoices?tab=cash'))
app.get('/hometax-invoices', (c) => c.redirect('/tax-invoices?tab=hometax'))
app.get('/bank', pageAuthMiddleware, requireAdminPage(), bankPage)
app.get('/billing', (c) => c.redirect('/ledger?tab=billing'))
app.get('/shipments', pageAuthMiddleware, requirePagePermission('/shipments'), shipmentsPage)
app.get('/shipments-dashboard', pageAuthMiddleware, requirePagePermission('/shipments-dashboard'), shipmentsDashboardPage)
app.get('/reports', pageAuthMiddleware, requirePagePermission('/reports'), reportsPage)
app.get('/forecast', (c) => c.redirect('/reports?tab=forecast'))
app.get('/activity-log', pageAuthMiddleware, requirePagePermission('/activity-log'), activityLogPage)
app.get('/tasks', pageAuthMiddleware, requirePagePermission('/cards'), tasksPage)
app.get('/email-logs', (c) => c.redirect('/activity-log#tab=email'))
// 이전 /equipment-dashboard 페이지는 /equipment#tab=dashboard로 이동
app.get('/equipment-dashboard', (c) => c.html('<script>window.location.href="/equipment?tab=dashboard"</script>'))
app.get('/receivables', (c) => c.redirect('/ledger?tab=receivables'))
app.get('/delivery-analytics', pageAuthMiddleware, requirePagePermission('/delivery-analytics'), deliveryAnalyticsPage)
app.get('/demand-analytics', (c) => c.redirect('/reports?tab=demand'))
app.get('/inventory-count', (c) => c.redirect('/inventory#tab=count'))
app.get('/cost-analysis', (c) => c.redirect('/production-reports?tab=cost'))
app.get('/cash-flow', (c) => c.redirect('/bank?tab=cashflow'))
app.get('/facility', pageAuthMiddleware, requireAdminPage(), facilityPage)
app.get('/bom', pageAuthMiddleware, requirePagePermission('/bom'), bomPage)
// app.get('/workflow') — 폐기됨
app.get('/approvals', pageAuthMiddleware, requirePagePermission('/approvals'), approvalsPage)
app.get('/ui-guide', pageAuthMiddleware, requireAdminPage(), uiGuidePage)
app.get('/ui-compare', pageAuthMiddleware, requireAdminPage(), uiComparePage)
app.get('/migration', pageAuthMiddleware, requireAdminPage(), migrationPage)
app.get('/vat-reports', pageAuthMiddleware, requirePagePermission('/vat-reports'), vatReportsPage)
app.get('/cash-schedule', pageAuthMiddleware, requirePagePermission('/cash-schedule'), cashSchedulePage)
app.get('/payment-requests', pageAuthMiddleware, requirePagePermission('/payment-requests'), paymentRequestsPage)
app.get('/financial-reports', pageAuthMiddleware, requirePagePermission('/financial-reports'), financialReportsPage)
app.get('/leaves', pageAuthMiddleware, requirePagePermission('/leaves'), leavesPage)
app.get('/payroll', pageAuthMiddleware, requirePagePermission('/payroll'), payrollPage)
app.get('/settings/payroll-rates', pageAuthMiddleware, requirePagePermission('/settings/payroll-rates'), payrollRatesPage)
app.get('/storage-zones', pageAuthMiddleware, requirePagePermission('/storage-zones'), storageZonesPage)
app.get('/permissions', pageAuthMiddleware, requireAdminPage(), permissionsPage)
app.get('/no-permission', pageAuthMiddleware, noPermissionPage)
app.get('/payslip/:id', payslipPage)
app.get('/year-end-manage', pageAuthMiddleware, requirePagePermission('/year-end-manage'), yearEndManagePage)
app.get('/insurance-reports', pageAuthMiddleware, requirePagePermission('/insurance-reports'), insuranceReportsPage)
app.get('/year-end/:employeeId', yearEndPage)
app.get('/messages', pageAuthMiddleware, requirePagePermission('/messages'), messagesPage)
app.get('/kakao', (c) => c.redirect('/messages'))

app.get('/production-daily', pageAuthMiddleware, requirePagePermission('/production-daily'), productionDailyPage)
app.get('/material-forecast', pageAuthMiddleware, requirePagePermission('/material-forecast'), materialForecastPage)

// Portal 페이지 라우트 (고객 포털)
app.get('/portal/login', portalLoginPage)
app.get('/portal', portalDashboardPage)
app.get('/portal/dashboard', portalDashboardPage)
app.get('/portal/orders', portalOrdersPage)
app.get('/portal/balance', portalBalancePage)
app.get('/portal/invoices', portalInvoicesPage)
app.get('/portal/document', portalDocumentPage)

export default app
