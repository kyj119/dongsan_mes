import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import cardExpensesScript from '../scripts/cardExpenses.js?raw'
import cardFeeScript from '../scripts/cardFee.js?raw'

export function cardExpensesPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '법인카드',
    activePage: '/card-expenses',
    pageCSS: `
      .cat-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap}
      .card-stat{border-left:3px solid}
      .status-pill{display:inline-block;padding:1px 8px;border-radius:9999px;font-size:11px;font-weight:600}
      .tx-row{transition:background .15s}
      .tx-row:hover{background:#f8fafc}
      .tx-row.selected{background:#eff6ff}
      .tx-row.offset-row{opacity:.55;background:#f9fafb}
      .tx-row.offset-row td{color:#9ca3af}
      .tx-row td{vertical-align:middle}
      .receipt-preview{max-width:200px;max-height:200px;border-radius:8px;border:1px solid #e5e7eb}
      /* 영수증 인쇄 영역: 화면에선 숨기고 인쇄 시에만 표시 */
      #receiptPrintArea{display:none}
      .rp-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
      .rp-item{border:1px solid #e5e7eb;border-radius:6px;padding:8px;break-inside:avoid;page-break-inside:avoid}
      .rp-item img{width:100%;height:auto;object-fit:contain;max-height:340px}
      .rp-cap{font-size:11px;color:#374151;margin-top:4px;line-height:1.4}
      @media print{
        body * { visibility:hidden; }
        #receiptPrintArea, #receiptPrintArea * { visibility:visible; }
        #receiptPrintArea{display:block;position:absolute;left:0;top:0;width:100%;padding:8px}
      }
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
        <button id="tabSchedule" onclick="switchCardTab('schedule')" class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-calendar-alt mr-1"></i>결제 예정
        </button>
        <button id="tabReport" onclick="switchCardTab('report')" class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-chart-pie mr-1"></i>보고서
        </button>
        <button id="tabCategories" onclick="switchCardTab('categories')" class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-tags mr-1"></i>경비 분류
        </button>
        <button id="tabCardfee" onclick="switchCardTab('cardfee')" class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-calculator mr-1"></i>수수료
        </button>
      </div>

      <!-- ===== 사용 내역 탭 ===== -->
      <div id="transactionsContent">

        <!-- 통합 필터 바: 필터 + 인라인 KPI -->
        <div class="ds-card ds-card-compact mb-3">
          <!-- Row 1: 필터 + KPI -->
          <div class="flex flex-wrap items-center gap-3">
            <select id="filterCard" onchange="loadTransactions()" class="ds-input" style="width:auto;font-size:12px">
              <option value="">전체 카드</option>
            </select>
            <select id="filterCategory" onchange="loadTransactions()" class="ds-input" style="width:auto;font-size:12px">
              <option value="">전체 분류</option>
            </select>
            <div class="flex items-center gap-1">
              <input type="date" id="filterStartDate" class="ds-input" style="width:125px;font-size:12px" onchange="loadTransactions()">
              <span class="text-gray-300">~</span>
              <input type="date" id="filterEndDate" class="ds-input" style="width:125px;font-size:12px" onchange="loadTransactions()">
            </div>
            <input type="text" id="filterSearch" placeholder="가맹점..." class="ds-input" style="width:110px;font-size:12px">
            <div class="border-l border-gray-200 h-5 mx-1"></div>
            <div class="flex items-center gap-2 text-xs">
              <span class="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">미분류 <b id="kpiUnclassified">-</b></span>
              <span class="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">대기 <b id="kpiClassified">-</b></span>
              <span class="px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium">승인 <b id="kpiApproved">-</b></span>
              <span class="px-2 py-1 rounded-full bg-red-50 text-red-700 font-medium cursor-pointer hover:bg-red-100" onclick="switchCardTab('schedule')" title="결제 예정 탭으로 이동">결제예정 <b id="kpiPaymentDue">-</b></span>
            </div>
          </div>
          <!-- Row 2: 상태 필터 탭 + 액션 -->
          <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <div class="flex gap-1">
              <input type="hidden" id="filterStatus" value="UNCLASSIFIED">
              <button onclick="switchCardStatus('')" id="csTabAll" class="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">전체</button>
              <button onclick="switchCardStatus('UNCLASSIFIED')" id="csTabUnclassified" class="px-3 py-1 text-xs font-medium rounded-full bg-blue-600 text-white">미분류</button>
              <button onclick="switchCardStatus('CLASSIFIED')" id="csTabClassified" class="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">분류완료</button>
              <button onclick="switchCardStatus('REQUESTED')" id="csTabRequested" class="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">결의요청</button>
              <button onclick="switchCardStatus('APPROVED')" id="csTabApproved" class="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">승인</button>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="syncBarobillCards()" id="syncCardBtn" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1">
                <i class="fas fa-sync-alt"></i> 동기화
              </button>
              <button onclick="openAddTxModal()" class="ds-btn ds-btn-primary ds-btn-sm flex items-center gap-1">
                <i class="fas fa-plus"></i> 등록
              </button>
              <div class="relative" id="cardMoreWrap">
                <button onclick="var m=document.getElementById('cardMoreMenu'); m.classList.toggle('hidden');" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                  <i class="fas fa-ellipsis-h"></i>
                </button>
                <div id="cardMoreMenu" class="hidden absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-40">
                  <button onclick="openImportModal(); document.getElementById('cardMoreMenu').classList.add('hidden');" class="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><i class="fas fa-file-upload text-gray-400 w-4"></i>CSV 가져오기</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 내역 테이블 -->
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 220px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="text-[10px] text-gray-500 uppercase border-b">
                  <th class="px-1 py-2" style="width:28px"><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
                  <th class="px-2 py-2 text-left" style="width:55px">일자</th>
                  <th class="px-2 py-2 text-left" style="width:58px">카드</th>
                  <th class="px-2 py-2 text-left" style="width:55px">담당자</th>
                  <th class="px-2 py-2 text-left">가맹점</th>
                  <th class="px-2 py-2 text-right" style="width:95px">금액</th>
                  <th class="px-1 py-2 text-center" style="width:110px">분류</th>
                  <th class="px-1 py-2 text-left" style="width:160px">적요</th>
                  <th class="px-1 py-2 text-center" style="width:50px">상태</th>
                  <th class="px-1 py-2" style="width:28px"></th>
                </tr>
              </thead>
              <tbody id="txTableBody"></tbody>
            </table>
          </div>
          <div id="txPagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>

        <!-- Floating Selection Bar -->
        <div id="cardBulkBar" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4" style="min-width:480px;">
          <span class="text-sm"><b id="selectedCount">0</b>건 선택</span>
          <div class="border-l border-gray-600 h-5"></div>
          <select id="bulkCategory" class="bg-gray-800 text-white border border-gray-600 rounded-lg px-2 py-1 text-xs">
            <option value="">분류 선택...</option>
          </select>
          <button onclick="bulkClassify()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
            <i class="fas fa-tags"></i> 일괄 분류
          </button>
          <button onclick="bulkCreateRequests()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1">
            <i class="fas fa-file-signature"></i> 결의 생성
          </button>
          <button onclick="clearSelection()" class="ml-auto px-2 py-1 text-xs text-gray-400 hover:text-white">
            <i class="fas fa-times"></i>
          </button>
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

      <!-- ===== 결제 예정 탭 (결제일/마감 사이클 기준 일원화) ===== -->
      <div id="scheduleContent" style="display:none">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div class="ds-card ds-card-compact card-stat" style="border-color:#ef4444">
            <div class="ds-label mb-1">다음 결제 예정 총액</div>
            <div class="text-xl font-bold text-red-600 tabular-nums text-right" id="scheduleTotal">-</div>
          </div>
          <div class="ds-card ds-card-compact card-stat" style="border-color:#3b82f6">
            <div class="ds-label mb-1">카드 수</div>
            <div class="text-xl font-bold text-blue-600 text-right" id="scheduleCardCount">-</div>
          </div>
          <div class="ds-card ds-card-compact card-stat" style="border-color:#8b5cf6">
            <div class="ds-label mb-1">가장 가까운 결제일</div>
            <div class="text-xl font-bold text-right" id="scheduleNextDate">-</div>
          </div>
        </div>
        <p class="text-xs text-gray-400 mb-2"><i class="fas fa-info-circle mr-1"></i>현재 진행 중인 청구 사이클(직전 마감일+1 ~ 다음 마감일)의 누적 사용액과 결제 예정일입니다. 마감일·결제일은 [카드 관리]에서 설정합니다.</p>
        <div class="ds-card" style="padding:0">
          <table class="ds-table ds-table-compact ds-table-striped">
            <thead><tr>
              <th class="text-left">카드</th>
              <th class="text-left">카드사</th>
              <th class="text-center">청구 기간</th>
              <th class="text-center">결제 예정일</th>
              <th class="text-right font-bold">결제 예정액</th>
              <th class="text-center">한도 사용률</th>
              <th class="text-center">건수</th>
            </tr></thead>
            <tbody id="scheduleTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- ===== 보고서 탭 ===== -->
      <div id="reportContent" style="display:none">
        <div class="flex items-center gap-3 mb-4">
          <select id="reportMonth" class="ds-input" style="width:auto" onchange="loadReport()"></select>
          <span class="text-sm text-gray-500" id="reportGrandTotal"></span>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- 카테고리별 -->
          <div class="ds-card">
            <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-pie text-blue-600 mr-2"></i>경비 분류별</h3>
            <div id="reportCategoryBars" class="space-y-2"></div>
          </div>
          <!-- 카드별 -->
          <div class="ds-card">
            <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-credit-card text-blue-500 mr-2"></i>카드별</h3>
            <div id="reportCardBars" class="space-y-2"></div>
          </div>
        </div>

        <!-- 세무사 전달 -->
        <div class="ds-card mt-4">
          <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-file-export text-emerald-600 mr-2"></i>세무사 전달</h3>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-gray-500">기간</span>
            <input type="date" id="taxExportStart" class="ds-input" style="width:140px;font-size:12px">
            <span class="text-gray-300">~</span>
            <input type="date" id="taxExportEnd" class="ds-input" style="width:140px;font-size:12px">
            <button onclick="downloadTaxCsv()" class="ds-btn ds-btn-primary ds-btn-sm flex items-center gap-1"><i class="fas fa-file-csv"></i> 내역 CSV</button>
            <button onclick="printReceipts()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-700 text-white hover:bg-gray-800 flex items-center gap-1"><i class="fas fa-print"></i> 영수증 인쇄</button>
            <span id="taxExportStatus" class="text-xs text-gray-400"></span>
          </div>
          <p class="text-xs text-gray-400 mt-2">CSV: 사용일·카드·가맹점·공급가/세액·구분(승인/취소/상계)·분류·영수증여부. 영수증 인쇄: 기간 내 첨부 영수증을 한 화면에 모아 인쇄/PDF 저장.</p>
        </div>
      </div>

      <!-- ===== 경비 분류 탭 ===== -->
      <div id="categoriesContent" style="display:none">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-sm font-bold text-gray-700"><i class="fas fa-tags text-blue-600 mr-2"></i>경비 분류 관리</h2>
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

      <!-- ===== 카드 수수료 탭 (자금관리에서 이동) ===== -->
      <div id="cardfeeContent" style="display:none">
        <div class="ds-card mb-4">
          <h3 class="text-sm font-bold text-gray-800 mb-3"><i class="fas fa-calculator text-blue-500 mr-2"></i>카드 수수료 계산</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label class="text-xs font-medium text-gray-600 mb-1 block">카드사</label>
              <select id="calcCardCompany" class="ds-input"></select>
            </div>
            <div>
              <label class="text-xs font-medium text-gray-600 mb-1 block">입금액 (통장 입금된 금액)</label>
              <input type="number" id="calcDepositAmount" class="ds-input" placeholder="예: 975000">
            </div>
            <button onclick="calculateCardFee()" class="ds-btn ds-btn-primary"><i class="fas fa-calculator mr-1"></i>계산</button>
          </div>
          <div id="calcResult" class="hidden mt-4 p-4 bg-blue-50 rounded-lg">
            <div class="grid grid-cols-3 gap-4 text-center">
              <div><div class="text-xs text-gray-500">원래 결제금액</div><div class="text-lg font-bold text-gray-800" id="calcOriginal">-</div></div>
              <div><div class="text-xs text-gray-500">수수료 (<span id="calcRateDisplay">-</span>%)</div><div class="text-lg font-bold text-red-600" id="calcFee">-</div></div>
              <div><div class="text-xs text-gray-500">실제 입금액</div><div class="text-lg font-bold text-blue-600" id="calcDeposit">-</div></div>
            </div>
          </div>
        </div>

        <div class="ds-card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-gray-800"><i class="fas fa-chart-bar text-green-500 mr-2"></i>기간별 카드 수수료 집계</h3>
            <div class="flex items-center gap-2">
              <input type="date" id="feeDateStart" class="ds-input" style="width:140px;">
              <span class="text-gray-400">~</span>
              <input type="date" id="feeDateEnd" class="ds-input" style="width:140px;">
              <button onclick="loadFeeSummary()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-search mr-1"></i>검색</button>
            </div>
          </div>
          <div id="feeSummaryArea"><div class="text-center py-6 text-gray-400">기간을 선택하고 조회를 클릭하세요</div></div>
        </div>

        <div class="ds-card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-gray-800"><i class="fas fa-cog text-gray-500 mr-2"></i>카드사 수수료율 설정</h3>
            <button onclick="openAddFeeRateModal()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-plus mr-1"></i>추가</button>
          </div>
          <table class="ds-table ds-table-compact ds-table-striped">
            <thead><tr>
              <th class="text-left">카드사</th>
              <th class="text-center">수수료율 (%)</th>
              <th class="text-left">매칭 키워드</th>
              <th class="text-center w-24">액션</th>
            </tr></thead>
            <tbody id="feeRateTableBody"><tr><td colspan="4" class="text-center py-6 text-gray-400">로딩 중...</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- 수수료율 추가/수정 모달 -->
      <div id="feeRateModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-6" style="max-width:400px">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-800" id="feeRateModalTitle"><i class="fas fa-credit-card text-blue-500 mr-2"></i>카드사 수수료율</h3>
            <button onclick="closeFeeRateModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <input type="hidden" id="feeRateEditId">
          <div class="space-y-3">
            <div><label class="text-sm font-semibold text-gray-700 mb-1 block">카드사명 *</label><input type="text" id="feeRateCompany" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: BC카드"></div>
            <div><label class="text-sm font-semibold text-gray-700 mb-1 block">수수료율 (%) *</label><input type="number" id="feeRatePercent" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" step="0.01" min="0" max="100" placeholder="예: 2.2"></div>
            <div><label class="text-sm font-semibold text-gray-700 mb-1 block">매칭 키워드 (콤마 구분)</label><input type="text" id="feeRateKeywords" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: BC,비씨"><div class="text-xs text-gray-400 mt-1">통장 입금자명에서 이 키워드가 포함되면 해당 카드사로 인식</div></div>
          </div>
          <div class="flex gap-2 justify-end mt-5">
            <button onclick="closeFeeRateModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm">취소</button>
            <button onclick="saveFeeRate()" class="ds-btn ds-btn-primary">저장</button>
          </div>
        </div>
      </div>

      <!-- ===== 카드 등록/수정 모달 ===== -->
      <div id="cardModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-6" style="max-width:440px">
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
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">명의자</label>
                <input type="text" id="cardHolder" placeholder="사용자명" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">마감일 (매월)</label>
                <input type="number" id="cardCutoffDay" min="1" max="31" value="15" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="카드사 마감일">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">결제일 (매월)</label>
                <input type="number" id="cardPayDay" min="1" max="31" value="15" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">담당자</label>
              <select id="cardAssignedUser" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">미지정</option>
              </select>
            </div>
            <!-- 바로빌 자동 수집 연동 (신규 등록 시) -->
            <div id="cardBarobillSection" class="border-t pt-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="cardBarobillSync" onchange="toggleCardBarobill()" class="rounded">
                <span class="text-sm font-semibold text-gray-700"><i class="fas fa-link text-emerald-500 mr-1"></i>바로빌 자동 수집 연동</span>
              </label>
              <div id="cardBarobillFields" class="hidden mt-3 space-y-3 bg-gray-50 rounded-lg p-3">
                <p class="text-xs text-gray-500"><i class="fas fa-shield-alt mr-1"></i>인증정보는 바로빌 등록에만 1회 사용되며 MES에 저장되지 않습니다. 카드사 이용내역 조회 서비스가 먼저 신청되어 있어야 합니다.</p>
                <div>
                  <label class="text-sm font-semibold text-gray-700 mb-1 block">전체 카드번호 <span class="text-red-500">*</span></label>
                  <input type="text" id="cardFullNum" inputmode="numeric" autocomplete="off" placeholder="카드번호 전체 (- 없이)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="text-sm font-semibold text-gray-700 mb-1 block">카드사 홈페이지 ID <span class="text-red-500">*</span></label>
                    <input type="text" id="cardWebId" autocomplete="off" placeholder="카드사 로그인 ID" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  </div>
                  <div>
                    <label class="text-sm font-semibold text-gray-700 mb-1 block">카드사 홈페이지 PW <span class="text-red-500">*</span></label>
                    <input type="password" id="cardWebPwd" autocomplete="new-password" placeholder="카드사 로그인 PW" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  </div>
                  <div>
                    <label class="text-sm font-semibold text-gray-700 mb-1 block">카드 구분</label>
                    <select id="cardTypeSel" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="C">법인</option>
                      <option value="P">개인</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeCardModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="saveCard()" class="ds-btn ds-btn-primary"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>

      <!-- ===== 경비 분류 추가 모달 ===== -->
      <div id="categoryModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-6" style="max-width:380px">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-tag text-blue-600 mr-2"></i>경비 분류</h3>
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
            <button onclick="saveCategory()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>

      <!-- ===== 거래 수정 모달 ===== -->
      <div id="editTxModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-6" style="max-width:520px;max-height:90vh;overflow-y:auto">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-pen text-blue-500 mr-2"></i>카드 내역 관리</h3>
            <button onclick="closeEditTxModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <input type="hidden" id="editTxId">

          <!-- 거래 정보 (읽기 전용) -->
          <div class="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
            <div class="flex justify-between mb-1">
              <span class="text-gray-500">일자</span>
              <span class="font-medium" id="editTxDate">-</span>
            </div>
            <div class="flex justify-between mb-1">
              <span class="text-gray-500">가맹점</span>
              <span class="font-medium" id="editTxMerchant">-</span>
            </div>
            <div class="flex justify-between mb-1">
              <span class="text-gray-500">금액</span>
              <span class="font-bold text-blue-600" id="editTxAmount">-</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">카드</span>
              <span id="editTxCard">-</span>
            </div>
          </div>

          <!-- 수정 가능 필드 -->
          <div class="space-y-3">
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">경비 분류</label>
              <select id="editTxCategory" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">적요 / 메모</label>
              <input type="text" id="editTxMemo" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="사용 목적, 참석자 등">
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">상태</label>
              <select id="editTxStatus" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="UNCLASSIFIED">미분류</option>
                <option value="CLASSIFIED">분류 완료</option>
                <option value="REQUESTED">결의 요청</option>
                <option value="APPROVED">승인 완료</option>
              </select>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">영수증 첨부</label>
              <div id="editTxReceiptPreview" class="mb-2"></div>
              <input type="file" id="editTxReceiptFile" accept="image/*,.pdf" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <p class="text-xs text-gray-400 mt-1">이미지 또는 PDF 파일</p>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeEditTxModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="saveEditTx()" class="ds-btn ds-btn-primary"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>

      <!-- ===== 수동 등록 모달 ===== -->
      <div id="addTxModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-6" style="max-width:480px">
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
      <div id="importModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-6" style="max-width:500px">
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

      <!-- ===== 영수증 라이트박스 ===== -->
      <div id="receiptLightbox" class="hidden fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onclick="closeReceiptLightbox()">
        <div class="relative max-w-3xl max-h-[90vh]" onclick="event.stopPropagation()">
          <button onclick="closeReceiptLightbox()" class="absolute -top-3 -right-3 bg-white rounded-full w-8 h-8 shadow text-gray-700 hover:text-red-600"><i class="fas fa-times"></i></button>
          <div id="receiptLightboxBody" class="bg-white rounded-lg p-2 overflow-auto" style="max-height:90vh"><div class="p-10 text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i></div></div>
        </div>
      </div>

      <!-- ===== 영수증 인쇄 영역 (평소 숨김, 인쇄 시에만 표시) ===== -->
      <div id="receiptPrintArea"></div>
    `,
    pageScript: cardExpensesScript + '\n' + cardFeeScript
  })
}
