import type { Context } from 'hono'
import { renderPortalPage } from './portalLayout'
import portalScript from '../../scripts/portal.js?raw'

export const portalDashboardPage = (c: Context) => {
  const content = `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-gray-800">대시보드</h1>

      <!-- KPI 카드 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="bg-white rounded-lg shadow p-5">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm text-gray-500">총 주문</div>
              <div class="text-2xl font-bold mt-1" id="total-orders">-</div>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <i class="fas fa-shopping-cart text-blue-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-lg shadow p-5">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm text-gray-500">미수금 잔액</div>
              <div class="text-2xl font-bold mt-1 text-red-600" id="outstanding-balance">-</div>
            </div>
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <i class="fas fa-file-invoice-dollar text-red-600 text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- 최근 주문 -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-lg font-bold">최근 주문</h2>
          <a href="/portal/orders" class="text-sm text-blue-600 hover:text-blue-800">전체 보기 <i class="fas fa-arrow-right"></i></a>
        </div>
        <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full ds-table-striped">
            <thead><tr class="bg-gray-50 border-b text-sm text-gray-600">
              <th class="px-3 py-2 text-left">주문번호</th>
              <th class="px-3 py-2 text-left">주문일</th>
              <th class="px-3 py-2 text-left">상태</th>
              <th class="px-3 py-2 text-right">금액</th>
            </tr></thead>
            <tbody id="recent-orders-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `
  return c.html(renderPortalPage({ title: '대시보드', content, pageScript: portalScript }))
}
