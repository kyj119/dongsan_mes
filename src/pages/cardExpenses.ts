import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import cardExpensesScript from '../scripts/cardExpenses.js?raw'

export function cardExpensesPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '법인카드',
    activePage: '/card-expenses',
    pageCSS: `
      .cat-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
      .card-stat{border-left:3px solid}
      .status-pill{display:inline-block;padding:1px 8px;border-radius:9999px;font-size:11px;font-weight:600}
      .tx-row{cursor:pointer;transition:background .15s}
      .tx-row:hover{background:#f8fafc}
      .tx-row.selected{background:#eff6ff}
      .receipt-preview{max-width:200px;max-height:200px;border-radius:8px;border:1px solid #e5e7eb}
    `,
    pageContent: `
      <!-- 탭 -->
      <div class="flex items-center border-b mb-4">
        <button id="tabTransactions" onclick="switchCardTab('transactions')" class="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
          <i class="fas fa-list mr-1"></i>사용 내역
        </button>
        <button id="tabCards" onclick="switchCardTab('cards')" class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-credit-card mr-1"></i>카드 관리
        </button>
        <button id="tabCategories" onclick="switchCardTab('categories')" class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-tags mr-1"></i>경비 분류
        </button>
      </div>

      <!-- ===== 사용 내역 탭 ===== -->
      <div id="transactionsContent">

        <!-- KPI -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div class="ds-card ds-card-compact card-stat" style="border-color:#3b82f6">
            <div class="ds-label mb-1">이번달 사용</div>
            <div class="text-lg font-bold text-gray-700 tabular-nums text-right" id="kpiTotalAmount">-</div>
          </div>
          <div class="ds-card ds-card-compact card-stat" style="border-color:#f59e0b">
            <div class="ds-label mb-1">미분류</div>
            <div class="text-lg font-bold text-amber-600 tabular-nums text-right" id="kpiUnclassified">-</div>
          </div>
          <div class="ds-card ds-card-compact card-stat" style="border-color:#8b5cf6">
            <div class="ds-label mb-1">결의 대기</div>
            <div class="text-lg font-bold text-purple-600 tabular-nums text-right" id="kpiClassified">-</div>
          </div>
          <div class="ds-card ds-card-compact card-stat" style="border-color:#22c55e">
            <div class="ds-label mb-1">승인 완료</div>
            <div class="text-lg font-bold text-green-600 tabular-nums text-right" id="kpiApproved">-</div>
          </div>
        </div>

        <!-- 필터 -->
        <div class="ds-card ds-card-compact mb-4">
          <div class="flex flex-wrap gap-3 items-center">
            <select id="filterCard" onchange="loadTransactions()" class="ds-input" style="width:auto">
              <option value="">전체 카드</option>
            </select>
            <select id="filterStatus" onchange="loadTransactions()" class="ds-input" style="width:auto">
              <option value="">전체 상태</option>
              <option value="UNCLASSIFIED">미분류</option>
              <option value="CLASSIFIED">분류 완료</option>
              <option value="REQUESTED">결의 요청</option>
              <option value="APPROVED">승인 완료</option>
            </select>
            <select id="filterCategory" onchange="loadTransactions()" class="ds-input" style="width:auto">
              <option value="">전체 분류</option>
            </select>
            <input type="date" id="filterStartDate" class="ds-input" style="width:auto" onchange="loadTransactions()">
            <span class="text-gray-400">~</span>
            <input type="date" id="filterEndDate" class="ds-input" style="width:auto" onchange="loadTransactions()">
            <input type="text" id="filterSearch" placeholder="가맹점 검색..." class="ds-input" style="width:140px">
            <button onclick="loadTransactions()" class="ds-btn ds-btn-primary ds-btn-sm" style="background:var(--c-warning)">
              <i class="fas fa-search mr-1"></i>조회
            </button>
            <div class="ml-auto flex gap-2">
              <button onclick="openImportModal()" class="ds-btn ds-btn-secondary ds-btn-sm">
                <i class="fas fa-file-upload mr-1"></i>CSV 가져오기
              </button>
              <button onclick="openAddTxModal()" class="ds-btn ds-btn-primary ds-btn-sm">
                <i class="fas fa-plus mr-1"></i>수동 등록
              </button>
            </div>
          </div>
        </div>

        <!-- 일괄 작업 바 -->
        <div id="bulkBar" class="hidden ds-card ds-card-compact mb-3" style="background:#eff6ff;border:1px solid #93c5fd">
          <div class="flex items-center gap-3">
            <span class="text-sm font-bold text-blue-700"><span id="selectedCount">0</span>건 선택</span>
            <select id="bulkCategory" class="ds-input" style="width:auto;font-size:12px">
              <option value="">분류 선택...</option>
            </select>
            <button onclick="bulkClassify()" class="ds-btn ds-btn-sm" style="background:#6366f1;color:white;font-size:12px">
              <i class="fas fa-tags mr-1"></i>일괄 분류
            </button>
            <button onclick="bulkCreateRequests()" class="ds-btn ds-btn-sm" style="background:#059669;color:white;font-size:12px">
              <i class="fas fa-file-signature mr-1"></i>일괄 결의 생성
            </button>
            <button onclick="clearSelection()" class="ds-btn ds-btn-ghost ds-btn-sm text-gray-500">선택 해제</button>
          </div>
        </div>

        <!-- 내역 테이블 -->
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 340px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead>
                <tr>
                  <th style="width:36px"><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
                  <th class="text-left" style="width:90px">일자</th>
                  <th class="text-left">카드</th>
                  <th class="text-left">가맹점</th>
                  <th class="text-right" style="width:100px">금액</th>
                  <th class="text-center" style="width:100px">분류</th>
                  <th class="text-center" style="width:70px">상태</th>
                  <th class="text-center" style="width:30px"></th>
                </tr>
              </thead>
              <tbody id="txTableBody"></tbody>
            </table>
          </div>
          <div id="txPagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- ===== 카드 관리 탭 ===== -->
      <div id="cardsContent" style="display:none">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-sm font-bold text-gray-700"><i class="fas fa-credit-card text-blue-500 mr-2"></i>등록된 법인카드</h2>
          <button onclick="openAddCardModal()" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-plus mr-1"></i>카드 등록
          </button>
        </div>
        <div id="cardsList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
      </div>

      <!-- ===== 경비 분류 탭 ===== -->
      <div id="categoriesContent" style="display:none">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-sm font-bold text-gray-700"><i class="fas fa-tags text-purple-500 mr-2"></i>경비 분류 관리</h2>
          <button onclick="openAddCategoryModal()" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-plus mr-1"></i>분류 추가
          </button>
        </div>
        <div class="ds-card" style="padding:0">
          <table class="ds-table ds-table-compact ds-table-striped">
            <thead><tr>
              <th class="text-center" style="width:50px">아이콘</th>
              <th class="text-left">분류명</th>
              <th class="text-center" style="width:60px">색상</th>
              <th class="text-center" style="width:60px">순서</th>
              <th class="text-center" style="width:80px">관리</th>
            </tr></thead>
            <tbody id="categoryTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- ===== 카드 등록/수정 모달 ===== -->
      <div id="cardModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-[440px] p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800" id="cardModalTitle"><i class="fas fa-credit-card text-blue-500 mr-2"></i>카드 등록</h3>
            <button onclick="closeCardModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <input type="hidden" id="editCardId">
          <div class="space-y-3">
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">카드명 <span class="text-red-500">*</span></label>
              <input type="text" id="cardName" placeholder="예: 동산기획 법인카드 1" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">카드사 <span class="text-red-500">*</span></label>
              <select id="cardCompany" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">선택</option>
                <option value="신한">신한</option><option value="삼성">삼성</option>
                <option value="현대">현대</option><option value="KB국민">KB국민</option>
                <option value="롯데">롯데</option><option value="하나">하나</option>
                <option value="우리">우리</option><option value="NH농협">NH농협</option>
                <option value="BC">BC</option><option value="기타">기타</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">카드번호 끝 4자리</label>
                <input type="text" id="cardLast4" maxlength="4" placeholder="0000" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">월 한도</label>
                <input type="text" inputmode="numeric" data-money id="cardLimit" placeholder="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">명의자</label>
              <input type="text" id="cardHolder" placeholder="사용자명" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeCardModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="saveCard()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>

      <!-- ===== 경비 분류 추가 모달 ===== -->
      <div id="categoryModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-[380px] p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-tag text-purple-500 mr-2"></i>경비 분류</h3>
            <button onclick="closeCategoryModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <input type="hidden" id="editCategoryId">
          <div class="space-y-3">
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">분류명 <span class="text-red-500">*</span></label>
              <input type="text" id="catName" placeholder="예: 복리후생비" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">아이콘</label>
                <input type="text" id="catIcon" placeholder="fa-tag" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">색상</label>
                <input type="color" id="catColor" value="#6b7280" class="w-full h-9 border border-gray-300 rounded-lg">
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeCategoryModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="saveCategory()" class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>

      <!-- ===== 수동 등록 모달 ===== -->
      <div id="addTxModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-[480px] p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-plus-circle text-green-500 mr-2"></i>카드 내역 수동 등록</h3>
            <button onclick="closeAddTxModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">카드 <span class="text-red-500">*</span></label>
                <select id="txCardId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">사용일 <span class="text-red-500">*</span></label>
                <input type="date" id="txDate" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">가맹점명</label>
              <input type="text" id="txMerchant" placeholder="사용처" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">금액 <span class="text-red-500">*</span></label>
                <input type="text" inputmode="numeric" data-money id="txAmount" placeholder="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">경비 분류</label>
                <select id="txCategory" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
              </div>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">메모</label>
              <input type="text" id="txMemo" placeholder="메모" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeAddTxModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="saveTransaction()" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"><i class="fas fa-save mr-1"></i>등록</button>
          </div>
        </div>
      </div>

      <!-- ===== CSV 가져오기 모달 ===== -->
      <div id="importModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-[500px] p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-file-csv text-green-500 mr-2"></i>CSV 가져오기</h3>
            <button onclick="closeImportModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">카드 선택 <span class="text-red-500">*</span></label>
              <select id="importCardId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">CSV 파일</label>
              <input type="file" id="importFile" accept=".csv,.xlsx,.xls" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <p class="text-xs text-gray-400 mt-1">카드사 홈페이지에서 다운받은 이용내역 파일 (CSV/엑셀)</p>
            </div>
            <div id="importPreview" class="hidden">
              <label class="text-sm font-semibold text-gray-700 mb-1 block">미리보기</label>
              <div class="max-h-40 overflow-y-auto border rounded-lg p-2 text-xs" id="importPreviewBody"></div>
            </div>
            <div id="importStatus" class="text-sm"></div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeImportModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="executeImport()" id="importBtn" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"><i class="fas fa-upload mr-1"></i>가져오기</button>
          </div>
        </div>
      </div>
    `,
    pageScript: cardExpensesScript
  })
}
