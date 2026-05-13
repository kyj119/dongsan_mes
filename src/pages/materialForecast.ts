import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import materialForecastScript from '../scripts/materialForecast.js?raw'

export function materialForecastPage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold text-gray-900">원단 소모 예측</h2>
    <button onclick="loadMaterialForecast()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
      <i class="fas fa-sync-alt mr-1"></i> 새로고침
    </button>
  </div>

  <!-- 요약 카드 -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="bg-white rounded-xl shadow-sm border p-4">
      <div class="text-xs text-gray-500 mb-1">관리 원단</div>
      <div class="text-2xl font-bold text-gray-800" id="kpiTotal">-</div>
      <div class="text-xs text-gray-400 mt-1">종</div>
    </div>
    <div class="bg-white rounded-xl shadow-sm border p-4 border-red-200">
      <div class="text-xs text-red-500 mb-1">위험 (7일 미만)</div>
      <div class="text-2xl font-bold text-red-600" id="kpiDanger">-</div>
      <div class="text-xs text-gray-400 mt-1">종</div>
    </div>
    <div class="bg-white rounded-xl shadow-sm border p-4 border-amber-200">
      <div class="text-xs text-amber-600 mb-1">주의 (14일 미만)</div>
      <div class="text-2xl font-bold text-amber-600" id="kpiWarning">-</div>
      <div class="text-xs text-gray-400 mt-1">종</div>
    </div>
    <div class="bg-white rounded-xl shadow-sm border p-4 border-green-200">
      <div class="text-xs text-green-600 mb-1">양호</div>
      <div class="text-2xl font-bold text-green-600" id="kpiGood">-</div>
      <div class="text-xs text-gray-400 mt-1">종</div>
    </div>
  </div>

  <!-- 검색/필터 -->
  <div class="ds-filter-bar">
    <div class="ds-filter-chips">
      <div class="ds-filter-field">
        <label class="ds-label">검색</label>
        <input id="materialSearch" class="ds-input ds-input-sm" placeholder="원단명 검색..." oninput="filterMaterials()">
      </div>
      <div class="ds-filter-field">
        <label class="ds-label">상태</label>
        <select id="materialStatusFilter" class="ds-input ds-input-sm" onchange="filterMaterials()">
          <option value="">전체</option>
          <option value="danger">위험</option>
          <option value="warning">주의</option>
          <option value="good">양호</option>
        </select>
      </div>
    </div>
  </div>

  <!-- 원단별 테이블 -->
  <div class="bg-white rounded-xl shadow-sm border p-4">
    <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-boxes mr-1"></i> 원단별 재고 현황</h3>
    <div id="materialTable">
      <div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>데이터 로딩 중...</p></div>
    </div>
  </div>

  <!-- 소모 추이 -->
  <div class="bg-white rounded-xl shadow-sm border p-4">
    <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-line mr-1"></i> 최근 30일 소모 추이</h3>
    <div class="mb-2">
      <select id="trendMaterial" class="text-sm border rounded-lg px-3 py-1.5" onchange="renderTrendChart()">
        <option value="">원단 선택...</option>
      </select>
    </div>
    <div id="trendChart" style="height:200px;">
      <div class="text-center py-4 text-gray-400 text-sm">원단을 선택하세요</div>
    </div>
  </div>
</div>
`
  return renderPage(c, {
    title: '원단 소모 예측',
    pageContent,
    pageScript: materialForecastScript,
    activePage: 'material-forecast'
  })
}
