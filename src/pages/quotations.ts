import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/quotations.js?raw'

export function quotationsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '견적서 관리',
    activePage: '/quotations',
    pageContent: `
      <!-- 통계 카드 4개 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-4 cursor-pointer" onclick="filterByQuotStatus('')">
          <div class="text-sm text-gray-600">총 견적수</div>
          <div class="text-2xl font-bold" id="statTotal">-</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 cursor-pointer" onclick="filterByQuotStatus('valid')">
          <div class="text-sm text-gray-600">유효 견적</div>
          <div class="text-2xl font-bold text-teal-600" id="statValid">-</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4 cursor-pointer" onclick="filterByQuotStatus('expired')">
          <div class="text-sm text-gray-600">만료 견적</div>
          <div class="text-2xl font-bold text-red-500" id="statExpired">-</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-600">총 견적금액</div>
          <div class="text-xl font-bold text-blue-600" id="statAmount">-</div>
        </div>
      </div>

      <!-- 필터 바 -->
      <div class="bg-white rounded-lg shadow p-4 mb-4 flex items-center gap-3 flex-wrap">
        <select id="quotStatusFilter" onchange="loadQuotations(1)" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">전체 상태</option>
          <option value="valid">유효</option>
          <option value="expired">만료</option>
          <option value="converted">주문전환</option>
        </select>
        <input type="text" id="quotClientSearch" placeholder="거래처 검색..."
          class="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[160px]"
          onkeyup="if(event.key==='Enter')loadQuotations(1)">
        <input type="date" id="quotDateFrom" class="px-3 py-2 border rounded-lg text-sm"
          onchange="loadQuotations(1)">
        <span class="text-gray-400 text-sm">~</span>
        <input type="date" id="quotDateTo" class="px-3 py-2 border rounded-lg text-sm"
          onchange="loadQuotations(1)">
        <button onclick="loadQuotations(1)" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm">
          <i class="fas fa-search mr-1"></i>검색
        </button>
        <a href="/quotation-form" class="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium">
          <i class="fas fa-plus mr-1"></i>새 견적서
        </a>
      </div>

      <!-- 견적 목록 테이블 -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <table class="w-full text-sm ds-table-striped">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left">견적번호</th>
              <th class="px-4 py-3 text-left">거래처</th>
              <th class="px-4 py-3 text-right">금액</th>
              <th class="px-4 py-3 text-center">유효기한</th>
              <th class="px-4 py-3 text-center">상태</th>
              <th class="px-4 py-3 text-center">작성일</th>
              <th class="px-4 py-3 text-center">액션</th>
            </tr>
          </thead>
          <tbody id="quotTableBody">
            <tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>
      <div id="quotPagination" class="mt-4 flex justify-center"></div>

      <!-- 상세 모달 -->
      <div id="quotDetailModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div class="p-6" id="quotDetailContent"></div>
        </div>
      </div>
    `,
    pageScript
  })
}
