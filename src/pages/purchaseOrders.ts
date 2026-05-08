import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/purchaseOrders.js?raw'

export function purchaseOrdersPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '발주 관리',
    activePage: '/purchase-orders',
    pageContent: `
      <!-- 통계 카드 (핵심 4개) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-4 cursor-pointer" onclick="filterByStatus('CONFIRMED')">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">입고 대기</div>
          <div class="text-3xl font-bold text-blue-600 mt-1 tabular-nums" id="statConfirmed">-</div>
        </div>
        <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-4 cursor-pointer" onclick="filterByStatus('PARTIAL_RECEIVED')">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">부분 입고</div>
          <div class="text-3xl font-bold text-amber-500 mt-1 tabular-nums" id="statPartial">-</div>
        </div>
        <div class="bg-white rounded-lg border border-red-200 shadow-sm hover:shadow-md transition-shadow p-4 cursor-pointer" onclick="filterByStatus('OVERDUE')">
          <div class="text-xs font-semibold text-red-500 uppercase tracking-wider">납기 지연</div>
          <div class="text-3xl font-bold text-red-600 mt-1 tabular-nums" id="statOverdue">-</div>
        </div>
        <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-4">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">이번달 발주 금액</div>
          <div class="text-2xl font-bold text-gray-900 mt-1 tabular-nums" id="statMonthlyAmount">-</div>
        </div>
      </div>

      <!-- 검색/필터 바 -->
      <div class="bg-white rounded-lg shadow p-4 mb-4 flex items-center gap-3 flex-wrap">
        <input type="text" id="searchInput" placeholder="발주번호, 공급업체 검색..."
          class="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[200px]"
          onkeyup="if(event.key==='Enter')loadPOs(1)">
        <select id="statusFilter" onchange="loadPOs(1)" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">전체 상태</option>
          <option value="DRAFT">임시저장</option>
          <option value="CONFIRMED">발주확정</option>
          <option value="PARTIAL_RECEIVED">부분입고</option>
          <option value="RECEIVED">입고완료</option>
          <option value="CANCELLED">취소</option>
        </select>
        <select id="supplierFilter" onchange="loadPOs(1)" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">전체 공급업체</option>
        </select>
        <select id="sortSelect" onchange="loadPOs(1)" class="px-3 py-2 border rounded-lg text-sm">
          <option value="created_at_desc">최신순</option>
          <option value="order_date_desc">발주일순</option>
          <option value="expected_date_asc">납기순</option>
          <option value="final_amount_desc">금액순</option>
        </select>
        <button onclick="exportPoCsv()" class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium">
          <i class="fas fa-file-csv mr-1"></i>CSV
        </button>
        <button onclick="openTemplateModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <i class="fas fa-copy mr-1"></i>템플릿에서 생성
        </button>
        <a href="/purchase-order-form" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <i class="fas fa-plus mr-1"></i>새 발주
        </a>
      </div>

      <!-- 발주 목록 테이블 -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full text-sm ds-table-striped">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left">발주번호</th>
              <th class="px-4 py-3 text-left">공급업체</th>
              <th class="px-4 py-3 text-center">발주일</th>
              <th class="px-4 py-3 text-center">납기예정</th>
              <th class="px-4 py-3 text-right">금액</th>
              <th class="px-4 py-3 text-center">상태</th>
              <th class="px-4 py-3 text-center">작업</th>
            </tr>
          </thead>
          <tbody id="poTableBody">
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
          </tbody>
        </table>
        </div>
      </div>
      <div id="pagination" class="mt-4 flex justify-center"></div>

      <!-- 상세 모달 -->
      <div id="detailModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div class="p-6" id="detailContent"></div>
        </div>
      </div>

      <!-- 입고 처리 모달 -->
      <div id="receiveModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div class="p-6" id="receiveContent"></div>
        </div>
      </div>

      <!-- 템플릿 선택 모달 -->
      <div id="templateModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <div class="p-6">
            <div class="flex justify-between items-center mb-4">
              <h3 class="font-bold text-lg"><i class="fas fa-copy text-green-600 mr-2"></i>템플릿에서 발주 생성</h3>
              <button onclick="closeTemplateModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div id="templateList" class="space-y-3 mb-4">
              <div class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin mr-2"></i>템플릿 로딩 중...</div>
            </div>
            <div id="templateDetail" class="hidden border-t pt-4 mt-4">
              <h4 class="font-medium text-sm mb-3"><i class="fas fa-list mr-1"></i>품목 (수량/단가 조정 가능)</h4>
              <div id="templateItems" class="space-y-2 mb-4"></div>
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label class="text-xs text-gray-500">납기예정일</label>
                  <input type="date" id="tmplExpectedDate" class="w-full px-3 py-2 border rounded text-sm mt-1" />
                </div>
                <div>
                  <label class="text-xs text-gray-500">생성 상태</label>
                  <select id="tmplStatus" class="w-full px-3 py-2 border rounded text-sm mt-1">
                    <option value="DRAFT">임시저장</option>
                    <option value="CONFIRMED">즉시 확정</option>
                  </select>
                </div>
              </div>
              <div class="flex gap-2 justify-end">
                <button onclick="closeTemplateModal()" class="px-4 py-2 bg-gray-300 rounded text-sm hover:bg-gray-400">취소</button>
                <button onclick="createFromTemplate()" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                  <i class="fas fa-check mr-1"></i>발주 생성
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
