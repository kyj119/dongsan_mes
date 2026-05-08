import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/purchaseRequests.js?raw'

export function purchaseRequestsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '발주 요청',
    activePage: '/purchase-requests',
    pageContent: `
      <!-- 통계 카드 3개 -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="bg-white border border-gray-200 rounded-lg p-5 cursor-pointer shadow-sm hover:shadow-md transition-shadow" onclick="filterPRByStatus('PENDING')">
          <div class="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1">
            <i class="fas fa-clock text-amber-500"></i>승인 대기
          </div>
          <div class="text-3xl font-bold text-amber-600 tabular-nums" id="prStatPending">
            <div class="ds-skeleton h-8 w-12 rounded"></div>
          </div>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-5 cursor-pointer shadow-sm hover:shadow-md transition-shadow" onclick="filterPRByStatus('APPROVED')">
          <div class="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1">
            <i class="fas fa-check text-blue-500"></i>승인됨
          </div>
          <div class="text-3xl font-bold text-blue-600 tabular-nums" id="prStatApproved">
            <div class="ds-skeleton h-8 w-12 rounded"></div>
          </div>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-5 cursor-pointer shadow-sm hover:shadow-md transition-shadow" onclick="filterPRByStatus('CONVERTED')">
          <div class="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1">
            <i class="fas fa-exchange-alt text-green-500"></i>변환 완료
          </div>
          <div class="text-3xl font-bold text-green-600 tabular-nums" id="prStatConverted">
            <div class="ds-skeleton h-8 w-12 rounded"></div>
          </div>
        </div>
      </div>

      <!-- 필터 바 -->
      <div class="bg-white rounded-lg shadow p-4 mb-4 flex items-center gap-3 flex-wrap">
        <input type="text" id="prSearchInput" placeholder="요청번호, 요청자 검색..."
          class="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[200px]"
          onkeyup="if(event.key==='Enter')loadPurchaseRequests(1)">
        <select id="prStatusFilter" onchange="loadPurchaseRequests(1)" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">전체 상태</option>
          <option value="PENDING">승인대기</option>
          <option value="APPROVED">승인됨</option>
          <option value="REJECTED">반려</option>
          <option value="CONVERTED">발주전환</option>
        </select>
        <select id="prUrgencyFilter" onchange="loadPurchaseRequests(1)" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">전체 긴급도</option>
          <option value="LOW">낮음</option>
          <option value="NORMAL">보통</option>
          <option value="HIGH">높음</option>
          <option value="URGENT">긴급</option>
        </select>
        <button onclick="window.location.href='/purchase-request-form'"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <i class="fas fa-plus mr-1"></i>새 발주 요청
        </button>
      </div>

      <!-- 목록 테이블 -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full text-sm ds-table-striped">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left">요청번호</th>
              <th class="px-4 py-3 text-left">요청자</th>
              <th class="px-4 py-3 text-left">공급업체(추천)</th>
              <th class="px-4 py-3 text-center">긴급도</th>
              <th class="px-4 py-3 text-center">요청일</th>
              <th class="px-4 py-3 text-center">품목수</th>
              <th class="px-4 py-3 text-center">상태</th>
              <th class="px-4 py-3 text-center">작업</th>
            </tr>
          </thead>
          <tbody id="prTableBody">
            <tr class="ds-skeleton-row"><td colspan="8" class="px-4 py-3"><div class="ds-skeleton h-4 w-full rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="8" class="px-4 py-3"><div class="ds-skeleton h-4 w-5/6 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="8" class="px-4 py-3"><div class="ds-skeleton h-4 w-4/6 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="8" class="px-4 py-3"><div class="ds-skeleton h-4 w-full rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="8" class="px-4 py-3"><div class="ds-skeleton h-4 w-3/4 rounded"></div></td></tr>
          </tbody>
        </table>
        </div>
      </div>
      <div id="prPagination" class="mt-4 flex justify-center"></div>

      <!-- 상세 모달 -->
      <div id="prDetailModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div class="p-6" id="prDetailContent"></div>
        </div>
      </div>

      <!-- 승인 모달 (ADMIN) -->
      <div id="prApproveModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div class="p-6" id="prApproveContent"></div>
        </div>
      </div>

      <!-- 반려 모달 -->
      <div id="prRejectModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
          <div class="p-6">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-bold text-red-700"><i class="fas fa-ban mr-2"></i>발주 요청 반려</h3>
              <button onclick="document.getElementById('prRejectModal').classList.add('hidden')"
                class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-1">반려 사유 <span class="text-red-500">*</span></label>
              <textarea id="rejectReasonInput" rows="4" placeholder="반려 사유를 입력하세요..."
                class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-red-300"></textarea>
            </div>
            <div class="flex justify-end gap-3">
              <button onclick="document.getElementById('prRejectModal').classList.add('hidden')"
                class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">취소</button>
              <button id="rejectConfirmBtn"
                class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium">반려 확인</button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
