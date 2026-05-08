import type { Context } from 'hono'
import { renderPage } from '../layout'
// @ts-ignore — Vite raw import
import inspectionsScript from '../scripts/inspections.js?raw'

export async function inspectionsPage(c: Context) {
  return renderPage(c, {
    title: '검수 관리',
    activePage: '/inspections',
    pageContent: `
      <div class="ds-container">
        <!-- Announcement Banner -->
        <div class="mb-4 p-3 bg-blue-50 border border-blue-300 rounded text-sm text-blue-800">
          <i class="fas fa-info-circle mr-1"></i>
          <strong>알림:</strong> 2026-04-15부터 <b>기본 검수는 입고 관리에서 수량만 확인</b>하는 방식으로 전환되었습니다.
          이 페이지(품질 템플릿)는 ADMIN 전용 <b>고급 기능</b>으로, 필요 시 템플릿을 활성화하여 사용할 수 있습니다.
        </div>

        <!-- Tab Bar -->
        <div class="flex border-b border-gray-200 mb-4">
          <button id="tabTemplates" onclick="inspectionsSwitchTab('templates')"
            class="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
            <i class="fas fa-clipboard-list mr-2"></i>검수 템플릿
          </button>
          <button id="tabResults" onclick="inspectionsSwitchTab('results')"
            class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">
            <i class="fas fa-history mr-2"></i>검수 결과
          </button>
          <button id="tabReview" onclick="inspectionsSwitchTab('review')"
            class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">
            <i class="fas fa-exclamation-triangle mr-2"></i>검수 확인 대기 <span id="reviewCountBadge" class="hidden ml-1 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full"></span>
          </button>
        </div>

        <!-- Templates Tab Content -->
        <div id="templatesContent">
          <div class="ds-card ds-card-compact mb-4">
            <div class="flex justify-between items-center">
              <div class="flex gap-3 items-end">
                <div>
                  <label class="ds-label">카테고리 필터</label>
                  <input type="text" id="templateCategoryFilter" placeholder="(전체)"
                    class="ds-input w-48"
                    onkeydown="if(event.key==='Enter')inspectionsLoadTemplates()">
                </div>
                <button onclick="inspectionsLoadTemplates()" class="ds-btn ds-btn-primary">
                  <i class="fas fa-search mr-1"></i>조회
                </button>
              </div>
              <button onclick="inspectionsOpenTemplateModal()" class="ds-btn ds-btn-primary">
                <i class="fas fa-plus mr-1"></i>새 템플릿
              </button>
            </div>
          </div>
          <div class="ds-card" style="padding:0">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left">템플릿명</th>
                  <th class="px-4 py-3 text-left">카테고리</th>
                  <th class="px-4 py-3 text-center">검수 항목 수</th>
                  <th class="px-4 py-3 text-center">상태</th>
                  <th class="px-4 py-3 text-center">액션</th>
                </tr>
              </thead>
              <tbody id="templatesTableBody">
                <tr><td colspan="5" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Results Tab Content -->
        <div id="resultsContent" class="hidden">
          <div class="ds-card ds-card-compact mb-4">
            <div class="flex gap-3 items-end">
              <div>
                <label class="ds-label">입고번호</label>
                <input type="text" id="resultsReceiptFilter" placeholder="receipt_id"
                  class="ds-input w-32"
                  onkeydown="if(event.key==='Enter')inspectionsLoadResults()">
              </div>
              <div>
                <label class="ds-label">공급업체 ID</label>
                <input type="text" id="resultsSupplierFilter" placeholder="supplier_id"
                  class="ds-input w-32"
                  onkeydown="if(event.key==='Enter')inspectionsLoadResults()">
              </div>
              <button onclick="inspectionsLoadResults()" class="ds-btn ds-btn-primary">
                <i class="fas fa-search mr-1"></i>조회
              </button>
            </div>
          </div>
          <div class="ds-card" style="padding:0">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left">검수일시</th>
                  <th class="px-4 py-3 text-left">입고번호</th>
                  <th class="px-4 py-3 text-left">공급업체</th>
                  <th class="px-4 py-3 text-left">검수자</th>
                  <th class="px-4 py-3 text-center">결과</th>
                  <th class="px-4 py-3 text-center">액션</th>
                </tr>
              </thead>
              <tbody id="resultsTableBody">
                <tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">조회 조건 입력 후 [조회] 버튼 클릭</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Review Tab Content -->
        <div id="reviewContent" class="hidden">
          <div class="ds-card ds-card-compact mb-4">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600"><i class="fas fa-info-circle mr-1"></i>검수 후 수량 부족 또는 FAIL이 있어 관리자 결정이 필요한 입고 건입니다.</span>
              <button onclick="inspectionsLoadReview()" class="ds-btn ds-btn-secondary ds-btn-sm"><i class="fas fa-sync mr-1"></i>새로고침</button>
            </div>
          </div>
          <div id="reviewListContainer" class="space-y-3">
            <div class="text-center text-gray-400 py-8">로딩 중...</div>
          </div>
        </div>
      </div>

      <!-- Template Edit Modal (Task 3에서 채움) -->
      <div id="templateModal" class="hidden ds-modal-overlay" onclick="if(event.target===this)inspectionsCloseTemplateModal()">
        <div class="ds-modal" style="max-width:800px">
          <div id="templateModalBody"></div>
        </div>
      </div>

      <!-- Result Detail Modal (Task 6에서 채움) -->
      <div id="resultDetailModal" class="hidden ds-modal-overlay" onclick="if(event.target===this)inspectionsCloseResultModal()">
        <div class="ds-modal" style="max-width:700px">
          <div id="resultDetailBody"></div>
        </div>
      </div>
    `,
    pageScript: inspectionsScript
  })
}
