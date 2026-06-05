import type { Context } from 'hono'
import { renderPortalPage } from './portalLayout'
import portalInvoicesScript from '../../scripts/portalInvoices.js?raw'

export const portalInvoicesPage = (c: Context) => {
  const content = `
    <div class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-2xl font-bold text-gray-800">세금계산서</h1>
        <select id="inv-year-filter" class="border border-gray-300 rounded-lg px-3 py-2 text-sm" onchange="onInvYearChange()">
          <option value="">전체 연도</option>
        </select>
      </div>
      <div class="bg-white rounded-lg shadow">
        <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full ds-table-striped">
            <thead><tr class="bg-gray-50 border-b text-sm text-gray-600">
              <th class="px-3 py-3 text-left">계산서 번호</th>
              <th class="px-3 py-3 text-left">발행일</th>
              <th class="px-3 py-3 text-right">공급가액</th>
              <th class="px-3 py-3 text-right">세액</th>
              <th class="px-3 py-3 text-right">합계</th>
              <th class="px-3 py-3 text-left">상태</th>
              <th class="px-3 py-3 text-center">다운로드</th>
            </tr></thead>
            <tbody id="invoices-tbody"></tbody>
          </table>
        </div>
        <div id="invoices-pagination" class="flex items-center justify-end gap-2 px-3 py-3"></div>
      </div>
    </div>
  `
  return c.html(renderPortalPage({ title: '세금계산서', content, pageScript: portalInvoicesScript }))
}
