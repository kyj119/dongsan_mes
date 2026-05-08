import type { Context } from 'hono'
import { renderPage } from '../layout'
// @ts-ignore — Vite raw import
import shipmentsDashboardScript from '../scripts/shipmentsDashboard.js?raw'

export function shipmentsDashboardPage(c: Context) {
  const pageContent = `
    <div class="ds-container space-y-4">
      <!-- 필터 영역 -->
      <div class="bg-white rounded-lg border p-3 shadow-sm">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="block text-[10px] text-gray-400 mb-1">날짜</label>
            <input type="date" id="dashDate" class="border rounded px-2 py-1 text-xs" style="color:#212529;" />
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-1">배송방법</label>
            <select id="dashMethod" class="border rounded px-2 py-1 text-xs" style="color:#212529;">
              <option value="">전체</option>
              <option value="택배">택배</option>
              <option value="방문수령">방문수령</option>
              <option value="퀵">퀵</option>
              <option value="직접배송">직접배송</option>
              <option value="화물">화물</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-1">상태</label>
            <select id="dashStatus" class="border rounded px-2 py-1 text-xs" style="color:#212529;">
              <option value="all">전체</option>
              <option value="ready">출고 가능</option>
              <option value="pending">미완료</option>
            </select>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <button onclick="window.resetDashFilters()" class="text-gray-500 text-xs">초기화</button>
            <button onclick="window.loadDashboard()" class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-all">
              <i class="fas fa-search mr-1"></i>검색
            </button>
          </div>
        </div>
      </div>

      <!-- 요약 카드 -->
      <div class="grid grid-cols-3 gap-2">
        <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
          <div id="dashTotal" class="text-xl font-bold tabular-nums" style="color:#212529;">-</div>
          <div class="text-[10px] text-gray-400">전체</div>
        </div>
        <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
          <div id="dashReady" class="text-xl font-bold tabular-nums text-green-600">-</div>
          <div class="text-[10px] text-gray-400">출고 가능</div>
        </div>
        <div class="bg-white rounded-lg border border-amber-200 p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
          <div id="dashPending" class="text-xl font-bold tabular-nums text-amber-600">-</div>
          <div class="text-[10px] text-amber-500 font-medium">미완료</div>
        </div>
      </div>

      <!-- 대시보드 콘텐츠 -->
      <div id="dashContent">
        <div class="space-y-2">
          <div class="ds-skeleton ds-skeleton-card"></div>
          <div class="ds-skeleton ds-skeleton-card"></div>
          <div class="ds-skeleton ds-skeleton-card"></div>
        </div>
      </div>
    </div>
  `

  return renderPage(c, {
    title: '출고 대시보드',
    activePage: '/shipments-dashboard',
    pageScript: shipmentsDashboardScript,
    pageContent
  })
}
