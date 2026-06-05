import type { Context } from 'hono'
import { renderPortalPage } from './portalLayout'
import portalOrdersScript from '../../scripts/portalOrders.js?raw'

export const portalOrdersPage = (c: Context) => {
  const content = `
    <div class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-2xl font-bold text-gray-800">주문 내역</h1>
        <div class="flex items-center gap-2">
          <select id="orders-status-filter" onchange="loadOrders(1)" class="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
            <option value="">전체 상태</option>
            <option value="PENDING">접수</option>
            <option value="CONFIRMED">확정</option>
            <option value="IN_PRODUCTION">생산중</option>
            <option value="PRINTING">출력중</option>
            <option value="COMPLETED">완료</option>
            <option value="SHIPPED">출고완료</option>
            <option value="CANCELLED">취소</option>
          </select>
        </div>
      </div>
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
