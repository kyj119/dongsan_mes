// ============================================================================
// BOM/MRP 페이지
// ============================================================================

import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import bomScript from '../scripts/bom.js?raw'

export const bomPage = (c: Context<HonoEnv>) => {
  const content = `
    <div class="space-y-4">
      <!-- 탭 네비게이션 -->
      <div class="flex space-x-2">
        <button data-tab="bom" class="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white">자재명세(BOM)</button>
        <button data-tab="mrp" class="px-4 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700">MRP 실행</button>
        <button data-tab="history" class="px-4 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700">실행 이력</button>
      </div>

      <!-- 탭 1: BOM 관리 -->
      <div id="tab-bom" class="tab-content">
        <div class="bg-white rounded-lg shadow">
          <div class="flex justify-between items-center p-4 border-b">
            <h2 class="text-lg font-bold"><i class="fas fa-sitemap mr-2 text-blue-600"></i>자재명세서 (BOM)</h2>
            <button onclick="openBomAddModal()" class="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <i class="fas fa-plus mr-1"></i>BOM 추가
            </button>
          </div>
          <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
            <table class="w-full ds-table-striped">
              <thead>
                <tr class="bg-gray-50 border-b text-sm text-gray-600">
                  <th class="px-4 py-3 text-left">카테고리</th>
                  <th class="px-4 py-3 text-left">품목</th>
                  <th class="px-4 py-3 text-left">원재료</th>
                  <th class="px-4 py-3 text-right">m2당 사용량</th>
                  <th class="px-4 py-3 text-center">단위</th>
                  <th class="px-4 py-3 text-right">로스율</th>
                  <th class="px-4 py-3 text-center w-24">관리</th>
                </tr>
              </thead>
              <tbody id="bom-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 탭 2: MRP 실행 -->
      <div id="tab-mrp" class="tab-content hidden">
        <div class="bg-white rounded-lg shadow">
          <div class="flex justify-between items-center p-4 border-b">
            <h2 class="text-lg font-bold"><i class="fas fa-calculator mr-2 text-green-600"></i>자재소요계획 (MRP)</h2>
            <button onclick="openMrpRunModal()" class="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <i class="fas fa-play mr-1"></i>MRP 실행
            </button>
          </div>
          <div id="mrp-result" class="p-4">
            <div class="text-center py-12 text-gray-400">
              <i class="fas fa-cogs text-4xl mb-3"></i>
              <p>MRP 실행 버튼을 클릭하여 자재 소요량을 계산하세요.</p>
              <p class="text-sm mt-1">확정/생산중 주문의 품목을 BOM 기준으로 원재료 소요량을 산출합니다.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 탭 3: 실행 이력 -->
      <div id="tab-history" class="tab-content hidden">
        <div class="bg-white rounded-lg shadow">
          <div class="p-4 border-b">
            <h2 class="text-lg font-bold"><i class="fas fa-history mr-2 text-purple-600"></i>MRP 실행 이력</h2>
          </div>
          <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
            <table class="w-full ds-table-striped">
              <thead>
                <tr class="bg-gray-50 border-b text-sm text-gray-600">
                  <th class="px-3 py-3 text-left">실행 번호</th>
                  <th class="px-3 py-3 text-left">유형</th>
                  <th class="px-3 py-3 text-right">자재 수</th>
                  <th class="px-3 py-3 text-right">부족</th>
                  <th class="px-3 py-3 text-left">실행자</th>
                  <th class="px-3 py-3 text-left">실행일시</th>
                  <th class="px-3 py-3 text-center w-16">상세</th>
                </tr>
              </thead>
              <tbody id="mrp-history-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `
  return renderPage(c, {
    title: '자재명세(BOM) / MRP',
    activePage: '/bom',
    pageContent: content,
    pageScript: bomScript,
  })
}
