import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import productionDailyScript from '../scripts/productionDaily.js?raw'

export function productionDailyPage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold text-gray-900">일일 생산 리포트</h2>
    <div class="flex items-center gap-2">
      <button onclick="changeDate(-1)" class="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"><i class="fas fa-chevron-left"></i></button>
      <input type="date" id="reportDate" class="px-3 py-1.5 text-sm border rounded-lg" onchange="loadDailySummary()">
      <button onclick="changeDate(1)" class="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"><i class="fas fa-chevron-right"></i></button>
      <button onclick="setToday()" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">오늘</button>
    </div>
  </div>

  <!-- KPI 카드 -->
  <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
    <div class="bg-white rounded-xl shadow-sm border p-4">
      <div class="text-xs text-gray-500 mb-1">출력 건수</div>
      <div class="text-2xl font-bold text-blue-700" id="kpiPrints">-</div>
      <div class="text-xs text-gray-400 mt-1"><span id="kpiOk">0</span> OK / <span id="kpiError">0</span> 에러</div>
    </div>
    <div class="bg-white rounded-xl shadow-sm border p-4">
      <div class="text-xs text-gray-500 mb-1">출력 면적</div>
      <div class="text-2xl font-bold text-green-700" id="kpiSqm">-</div>
      <div class="text-xs text-gray-400 mt-1">㎡</div>
    </div>
    <div class="bg-white rounded-xl shadow-sm border p-4">
      <div class="text-xs text-gray-500 mb-1">카드 처리율</div>
      <div class="text-2xl font-bold text-purple-700" id="kpiRate">-</div>
      <div class="text-xs text-gray-400 mt-1"><span id="kpiCardDone">0</span> / <span id="kpiCardTotal">0</span> 카드</div>
    </div>
    <div class="bg-white rounded-xl shadow-sm border p-4">
      <div class="text-xs text-gray-500 mb-1">장비 가동</div>
      <div class="text-2xl font-bold text-amber-700" id="kpiEquipCount">-</div>
      <div class="text-xs text-gray-400 mt-1">대</div>
    </div>
    <div class="bg-white rounded-xl shadow-sm border p-4">
      <div class="text-xs text-gray-500 mb-1">미완료/마감</div>
      <div class="text-2xl font-bold text-red-600" id="kpiOverdue">-</div>
      <div class="text-xs text-gray-400 mt-1">건</div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- 장비별 현황 -->
    <div class="bg-white rounded-xl shadow-sm border p-4">
      <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-print mr-1"></i> 장비별 출력 현황</h3>
      <div id="equipmentTable">
        <div class="text-center py-4 text-gray-400 text-sm">데이터 로딩 중...</div>
      </div>
    </div>

    <!-- 시간대별 출력 -->
    <div class="bg-white rounded-xl shadow-sm border p-4">
      <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-bar mr-1"></i> 시간대별 출력량</h3>
      <div id="hourlyChart" style="height:250px;">
        <div class="text-center py-4 text-gray-400 text-sm">데이터 로딩 중...</div>
      </div>
    </div>
  </div>

  <!-- 미완료 주문 -->
  <div class="bg-white rounded-xl shadow-sm border p-4">
    <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-exclamation-triangle text-red-500 mr-1"></i> 미완료/마감임박 주문</h3>
    <div id="overdueTable">
      <div class="text-center py-4 text-gray-400 text-sm">데이터 로딩 중...</div>
    </div>
  </div>
</div>
`
  return renderPage(c, {
    title: '일일 생산 리포트',
    pageContent,
    pageScript: productionDailyScript,
    activePage: 'production-daily'
  })
}
