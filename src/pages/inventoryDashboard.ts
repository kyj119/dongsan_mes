// 창고별 재고 대시보드 페이지
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import dashScript from '../scripts/inventoryDashboard.js?raw'

export function inventoryDashboardPage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="max-w-7xl mx-auto px-6 pt-6 space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900">창고별 재고 현황</h2>
      <p class="text-sm text-gray-500 mt-1">법인·창고별 자재 현황 및 부족 품목 일괄 발주</p>
    </div>
    <button onclick="loadDashboard()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
      <i class="fas fa-sync-alt mr-1"></i>새로고침
    </button>
  </div>
  <div id="dashContent"></div>
</div>
`
  return renderPage(c, {
    title: '창고별 재고',
    activePage: '/inventory-dashboard',
    pageContent,
    pageScript: dashScript,
  })
}
