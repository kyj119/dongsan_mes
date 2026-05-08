import type { Context } from 'hono'
import { renderPortalPage } from './portalLayout'
import portalOrdersScript from '../../scripts/portalOrders.js?raw'

export const portalOrdersPage = (c: Context) => {
  const content = `
    <div class="space-y-4">
      <h1 class="text-2xl font-bold text-gray-800">주문 내역</h1>
      <div class="bg-white rounded-lg shadow">
        <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full ds-table-striped">
            <thead><tr class="bg-gray-50 border-b text-sm text-gray-600">
              <th class="px-3 py-3 text-left">주문번호</th>
              <th class="px-3 py-3 text-left">주문일</th>
              <th class="px-3 py-3 text-left">납기일</th>
              <th class="px-3 py-3 text-left">상태</th>
              <th class="px-3 py-3 text-right">금액</th>
              <th class="px-3 py-3 text-left">배송</th>
            </tr></thead>
            <tbody id="orders-tbody"></tbody>
          </table>
        </div>
        <div id="orders-pagination" class="flex justify-center space-x-1 p-4"></div>
      </div>
    </div>
  `
  return c.html(renderPortalPage({ title: '주문 내역', content, pageScript: portalOrdersScript }))
}
