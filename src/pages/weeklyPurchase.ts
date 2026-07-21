// 주간 일괄 발주 대시보드 페이지 (Phase 4)
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import script from '../scripts/weeklyPurchase.js?raw'

export function weeklyPurchasePage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="max-w-7xl mx-auto px-6 pt-6 space-y-4">
  <div class="flex items-center justify-between flex-wrap gap-2">
    <div>
      <h2 class="text-xl font-bold text-gray-900">주간 일괄 발주</h2>
      <p class="text-sm text-gray-500 mt-1">소모예측 + MRP 기반 자동 발주 분석 (리드타임 1주)</p>
    </div>
    <div class="flex gap-2">
      <select id="weeksBack" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <option value="4">최근 4주</option>
        <option value="8" selected>최근 8주</option>
        <option value="12">최근 12주</option>
      </select>
      <button onclick="runAnalysis()" class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700">
        <i class="fas fa-search mr-1"></i>발주 분석
      </button>
      <button id="notifyBtn" onclick="sendNotify()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50" style="display:none;">
        <i class="fas fa-bell mr-1"></i>담당자 알림
      </button>
    </div>
  </div>

  <!-- 요약 카드 -->
  <div id="summaryCards" class="grid grid-cols-2 md:grid-cols-4 gap-4" style="display:none;"></div>

  <!-- 필터 -->
  <div id="filterBar" class="flex items-center gap-3 flex-wrap" style="display:none;">
    <label class="flex items-center gap-1 text-sm text-gray-600">
      <input type="checkbox" id="filterNeedsOrder" checked onchange="applyFilter()">
      발주 필요만
    </label>
    <select id="filterUrgency" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" onchange="applyFilter()">
      <option value="">전체 긴급도</option>
      <option value="URGENT">긴급</option>
      <option value="HIGH">높음</option>
      <option value="NORMAL">보통</option>
    </select>
    <select id="filterSupplier" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" onchange="applyFilter()">
      <option value="">전체 공급처</option>
    </select>
    <span id="resultCount" class="text-sm text-gray-500 ml-auto"></span>
  </div>

  <!-- 결과 테이블 -->
  <div id="analysisResult"></div>

  <!-- 하단 액션 바 -->
  <div id="actionBar" class="sticky bottom-0 bg-white border-t border-gray-200 py-3 px-4 flex items-center justify-between rounded-t-lg shadow-lg" style="display:none;">
    <div class="flex items-center gap-3">
      <label class="flex items-center gap-1 text-sm">
        <input type="checkbox" id="selectAll" onchange="toggleSelectAll()">
        전체 선택
      </label>
      <span id="selectedCount" class="text-sm text-gray-600"></span>
    </div>
    <button onclick="createPRs()" class="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700">
      <i class="fas fa-file-alt mr-1"></i>발주 요청 생성
    </button>
  </div>
</div>
`
  return renderPage(c, {
    title: '주간 일괄 발주',
    activePage: '/weekly-purchase',
    pageContent,
    pageScript: script,
  })
}
