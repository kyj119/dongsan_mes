import type { Context } from 'hono'
import { renderPortalPage } from './portalLayout'
import portalBalanceScript from '../../scripts/portalBalance.js?raw'

export const portalBalancePage = (c: Context) => {
  const content = `
    <div id="balance-container" class="space-y-4">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold text-gray-800">미수금 현황</h1>
          <p id="portal-client-name" class="text-sm text-gray-500 mt-1"></p>
        </div>
        <div class="text-xl font-bold text-red-600" id="total-balance">-</div>
      </div>
      <div id="balance-table-wrap" class="bg-white rounded-lg shadow">
        <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full ds-table-striped">
            <thead><tr class="bg-gray-50 border-b text-sm text-gray-600">
              <th class="px-3 py-3 text-left">주문번호</th>
              <th class="px-3 py-3 text-left">청구일</th>
              <th class="px-3 py-3 text-right">청구액</th>
              <th class="px-3 py-3 text-right">수금액</th>
              <th class="px-3 py-3 text-right">잔액</th>
            </tr></thead>
            <tbody id="balance-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `
  return c.html(renderPortalPage({ title: '미수금 현황', content, pageScript: portalBalanceScript }))
}
