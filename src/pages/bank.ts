import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import bankScript from '../scripts/bank.js?raw'
import cashFlowScript from '../scripts/cashFlow.js?raw'
import barobillViewScript from '../scripts/barobillView.js?raw'

export function bankPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '자금 관리',
    activePage: '/bank',
    pageCSS: `
      .tab-btn { cursor:pointer; transition:border-color .15s, color .15s; }
      .tab-btn.active { border-bottom-color:#2563eb; color:#2563eb; }
      .tab-content { display:none; }
      .tab-content.active { display:block; }
      .kpi-card { border-radius:8px; padding:16px 20px; display:flex; flex-direction:column; gap:4px; }
      .status-badge { display:inline-block; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:600; }
      .badge-unmatched { background:#e5e7eb; color:#374151; }
      .badge-suggested { background:#fef3c7; color:#92400e; }
      .badge-confirmed { background:#dbeafe; color:#1e40af; }
      .badge-applied   { background:#d1fae5; color:#065f46; }
      .badge-ignored   { background:#fee2e2; color:#991b1b; }
      .tx-row:hover { background:#f8fafc; }
      .tx-row td { padding:6px 10px; border-bottom:1px solid #f1f5f9; font-size:12px; vertical-align:middle; }
      .account-card { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .modal-overlay { display:none; position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.45); justify-content:center; align-items:center; }
      .modal-overlay.show { display:flex; }
      .modal-box { background:#fff; border-radius:10px; width:480px; max-width:95vw; padding:28px; box-shadow:0 8px 32px rgba(0,0,0,.18); }
      .form-label { font-size:13px; font-weight:500; color:#374151; margin-bottom:4px; display:block; }
      .form-input { width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; outline:none; }
      .form-input:focus { border-color:#3b82f6; box-shadow:0 0 0 2px #bfdbfe; }
      .form-select { width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; background:#fff; outline:none; }
      .btn-primary { background:#2563eb; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; }
      .btn-primary:hover { background:#1d4ed8; }
      .btn-secondary { background:#fff; color:#374151; border:1px solid #d1d5db; border-radius:6px; padding:8px 16px; font-size:13px; cursor:pointer; }
      .btn-secondary:hover { background:#f9fafb; }
      .btn-sm { padding:4px 10px; font-size:12px; border-radius:4px; cursor:pointer; border:none; font-weight:500; }
      .btn-match { background:#dbeafe; color:#1e40af; }
      .btn-match:hover { background:#bfdbfe; }
      .btn-ignore { background:#fee2e2; color:#991b1b; }
      .btn-ignore:hover { background:#fecaca; }
      .btn-unmatch { background:#f3f4f6; color:#374151; }
      .btn-unmatch:hover { background:#e5e7eb; }
      .btn-sync { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
      .btn-sync:hover { background:#dcfce7; }
      .btn-delete { background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }
      .btn-delete:hover { background:#fecaca; }
    `,
    pageContent: `
      <div>
        <!-- 상위 탭: 자금 관리 선택 -->
        <div class="flex border-b mb-4">
          <button onclick="switchFinanceTab('bank')" id="finTabBank" class="px-5 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
            <i class="fas fa-university mr-1"></i>은행 연동
          </button>
          <button onclick="switchFinanceTab('barobill')" id="finTabBarobill" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
            <i class="fas fa-plug mr-1"></i>바로빌 통장
          </button>
          <button onclick="switchFinanceTab('cashflow')" id="finTabCashflow" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
            <i class="fas fa-money-bill-wave mr-1"></i>캐시플로
          </button>
        </div>

        <!-- 은행 연동 탭 내용 -->
        <div id="finBankContent">
          <!-- Tab Navigation -->
          <div class="flex border-b mb-6">
          <button id="tabTx" class="tab-btn active px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600"
            onclick="switchBankTab('tx')">
            <i class="fas fa-exchange-alt mr-1"></i>거래내역 매칭
          </button>
          <button id="tabReceivables" class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            onclick="switchBankTab('receivables')">
            <i class="fas fa-file-invoice-dollar mr-1"></i>미수금 현황
          </button>
          <button id="tabRules" class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            onclick="switchBankTab('rules')">
            <i class="fas fa-brain mr-1"></i>매칭 규칙
          </button>
          <button id="tabAccounts" class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            onclick="switchBankTab('accounts')">
            <i class="fas fa-university mr-1"></i>계좌 관리
          </button>
        </div>

        <!-- Tab 1: 거래내역 매칭 -->
        <div id="tabContentTx" class="tab-content active">
          <input type="hidden" id="filterStatus" value="PENDING">

          <!-- 통합 필터 바: 필터 + 상태탭 + KPI 인라인 -->
          <div class="bg-white rounded-lg shadow px-4 py-3 mb-3">
            <!-- Row 1: 필터 + 인라인 KPI -->
            <div class="flex flex-wrap items-center gap-3">
              <select id="filterAccount" class="form-select text-sm" style="width:160px;" onchange="loadTransactions()">
                <option value="">전체 계좌</option>
              </select>
              <div class="flex items-center gap-1">
                <input type="date" id="filterDateStart" class="form-input text-sm" style="width:130px;" onchange="loadTransactions()">
                <span class="text-gray-300">~</span>
                <input type="date" id="filterDateEnd" class="form-input text-sm" style="width:130px;" onchange="loadTransactions()">
              </div>
              <select id="filterTxType" class="form-select text-sm" style="width:80px;" onchange="loadTransactions()">
                <option value="">전체</option>
                <option value="DEPOSIT">입금</option>
                <option value="WITHDRAWAL">출금</option>
              </select>
              <div class="border-l border-gray-200 h-5 mx-1"></div>
              <!-- 인라인 KPI 뱃지 -->
              <div class="flex items-center gap-2 text-xs">
                <span class="px-2 py-1 rounded-full bg-orange-50 text-orange-700 font-medium">미매칭 <b id="kpiUnmatched">-</b></span>
                <span class="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">제안 <b id="kpiSuggested">-</b></span>
                <span class="px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium">적용 <b id="kpiApplied">-</b></span>
              </div>
            </div>
            <!-- Row 2: 상태 필터 + 액션 -->
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              <div class="flex gap-1">
                <button onclick="switchStatusTab('')" id="statusTabAll" class="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">
                  전체 <span id="statusCountAll" class="opacity-80"></span>
                </button>
                <button onclick="switchStatusTab('PENDING')" id="statusTabPending" class="px-3 py-1 text-xs font-medium rounded-full bg-blue-600 text-white">
                  미반영 <span id="statusCountPending" class="opacity-80"></span>
                </button>
                <button onclick="switchStatusTab('APPLIED')" id="statusTabApplied" class="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">
                  반영 <span id="statusCountApplied" class="opacity-80"></span>
                </button>
                <button onclick="switchStatusTab('IGNORED')" id="statusTabIgnored" class="px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">
                  무시 <span id="statusCountIgnored" class="opacity-80"></span>
                </button>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="syncBarobillBank()" id="syncBarobillBtn" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
                  <i class="fas fa-sync-alt"></i> 동기화
                </button>
                <button onclick="runAutoMatch()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1">
                  <i class="fas fa-magic"></i> 자동매칭
                </button>
                <div class="relative" id="moreActionsWrap">
                  <button onclick="toggleMoreActions()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1">
                    <i class="fas fa-ellipsis-h"></i>
                  </button>
                  <div id="moreActionsMenu" class="hidden absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-44">
                    <button onclick="openCsvImport(); toggleMoreActions();" class="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><i class="fas fa-file-upload text-gray-400 w-4"></i>CSV 가져오기</button>
                    <button onclick="exportCsv(); toggleMoreActions();" class="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><i class="fas fa-download text-gray-400 w-4"></i>CSV 내보내기</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="overflow-x-auto" style="max-height: calc(100vh - 220px); overflow-y: auto;">
              <table class="w-full border-collapse ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase" style="width:32px;">
                      <input type="checkbox" id="checkAll" onchange="toggleCheckAll(this)">
                    </th>
                    <th class="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">날짜</th>
                    <th class="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">계좌</th>
                    <th class="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">적요</th>
                    <th class="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">입금</th>
                    <th class="px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">출금</th>
                    <th class="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">상태</th>
                    <th class="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">거래처</th>
                    <th class="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-20"></th>
                  </tr>
                </thead>
                <tbody id="txTableBody">
                  <tr><td colspan="8" class="text-center py-10 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Floating Selection Bar -->
          <div id="floatingSelectionBar" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4" style="min-width:420px;">
            <span class="text-sm"><b id="selectedCount">0</b>건 선택</span>
            <div class="border-l border-gray-600 h-5"></div>
            <button onclick="batchMatch()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 hover:bg-indigo-400 flex items-center gap-1">
              <i class="fas fa-link"></i> 일괄 매칭
            </button>
            <button onclick="batchApply()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 hover:bg-blue-400 flex items-center gap-1">
              <i class="fas fa-check-double"></i> 일괄 적용
            </button>
            <button onclick="clearSelection()" class="ml-auto px-2 py-1 text-xs text-gray-400 hover:text-white">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>

        <!-- Tab 2: 미수금 현황 -->
        <div id="tabContentReceivables" class="tab-content">
          <!-- 미수금 KPI -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-5" id="receivablesKpi">
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-gray-500">총 미수금</div>
              <div class="text-xl font-bold text-red-600" id="rcvTotal">-</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-green-700">정상 (30일 이내)</div>
              <div class="text-xl font-bold text-green-600" id="rcvNormal">-</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-yellow-700">주의 (31~60일)</div>
              <div class="text-xl font-bold text-yellow-600" id="rcvWarning">-</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-orange-700">위험 (61~90일)</div>
              <div class="text-xl font-bold text-orange-600" id="rcvDanger">-</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-red-700">장기 미입금 (90일+)</div>
              <div class="text-xl font-bold text-red-700" id="rcvCritical">-</div>
            </div>
          </div>
          <!-- 미수금 테이블 -->
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="overflow-x-auto" style="max-height: calc(100vh - 320px); overflow-y: auto;">
              <table class="w-full border-collapse ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">거래처</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">대표자</th>
                    <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">미수금</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">최근 입금일</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">총 입금 횟수</th>
                    <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">최근 90일 입금</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody id="receivablesTableBody">
                  <tr><td colspan="7" class="text-center py-10 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 3: 매칭 규칙 관리 -->
        <div id="tabContentRules" class="tab-content">
          <div class="flex justify-between items-center mb-4">
            <div>
              <h2 class="text-base font-semibold text-gray-700">자동매칭 학습 규칙</h2>
              <p class="text-xs text-gray-400 mt-1">수동 매칭 시 자동으로 학습된 규칙입니다. 입금자명이 같으면 해당 거래처로 자동 제안합니다.</p>
            </div>
            <div class="flex gap-2">
              <button onclick="checkRuleConflicts()" class="flex items-center gap-1 px-3 py-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-sm cursor-pointer hover:bg-yellow-100">
                <i class="fas fa-exclamation-triangle"></i> 충돌 검사
              </button>
            </div>
          </div>
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full border-collapse ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">입금자명 (키워드)</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">매칭 거래처</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">사용 횟수</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">최근 사용</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32">액션</th>
                  </tr>
                </thead>
                <tbody id="rulesTableBody">
                  <tr><td colspan="5" class="text-center py-10 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div id="ruleConflictResult" class="hidden mt-4"></div>
        </div>

        <!-- Tab 4: 계좌 관리 -->
        <div id="tabContentAccounts" class="tab-content">
          <!-- 계좌 목록 -->
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-base font-semibold text-gray-700">등록 계좌 목록</h2>
            <button onclick="openAddAccountModal()" class="btn-primary flex items-center gap-1">
              <i class="fas fa-plus"></i> 새 계좌 등록
            </button>
          </div>
          <div id="accountsList" class="space-y-3">
            <div class="text-center py-10 text-gray-400">로딩 중...</div>
          </div>
        </div>
        </div>

        <!-- 바로빌 조회 탭 -->
        <div id="finBarobillContent" class="hidden">
          <!-- 연결 상태 -->
          <div id="bbStatusArea" class="bg-white rounded-lg shadow p-4 mb-4">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500">바로빌 연결 확인 중...</span>
            </div>
          </div>

          <!-- 통장 내역 -->
          <div id="bbBankPanel">
            <div class="bg-white rounded-lg shadow p-4 mb-4">
              <div class="flex flex-wrap gap-3 items-end mb-3">
                <div>
                  <label class="text-xs text-gray-500">시작일</label>
                  <input type="date" id="bbBankDateStart" class="form-input text-sm" style="width:150px;">
                </div>
                <span class="text-gray-400 self-end pb-2">~</span>
                <div>
                  <label class="text-xs text-gray-500">종료일</label>
                  <input type="date" id="bbBankDateEnd" class="form-input text-sm" style="width:150px;">
                </div>
                <div>
                  <label class="text-xs text-gray-500">유형</label>
                  <select id="bbBankDir" class="form-select text-sm" style="width:100px;">
                    <option value="0">전체</option>
                    <option value="1">입금</option>
                    <option value="2">출금</option>
                  </select>
                </div>
                <button onclick="loadBBBankLogs()" class="btn-primary text-sm"><i class="fas fa-search mr-1"></i>전체 조회</button>
                <div id="bbBankTotal" class="text-sm text-gray-500 ml-2"></div>
              </div>
              <div id="bbBankFilters" class="flex flex-wrap gap-2"></div>
            </div>
            <div class="bg-white rounded-lg shadow overflow-hidden">
              <div class="overflow-x-auto" style="max-height:60vh; overflow-y:auto;">
                <table class="w-full text-sm ds-table-striped">
                  <thead class="bg-gray-50 sticky top-0">
                    <tr><th class="px-3 py-2 text-left">일시</th><th class="px-3 py-2 text-left">계좌</th><th class="px-3 py-2 text-left">적요</th><th class="px-3 py-2 text-right">입금</th><th class="px-3 py-2 text-right">출금</th><th class="px-3 py-2 text-right">잔액</th></tr>
                  </thead>
                  <tbody id="bbBankBody"><tr><td colspan="6" class="text-center py-8 text-gray-400">날짜를 선택하고 전체 조회를 클릭하세요</td></tr></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- 카드 수수료 → /card-expenses로 이동됨 -->
        <div id="finCardfeeContent" class="hidden" style="display:none!important">
          <!-- 수수료 계산기 -->
          <div class="bg-white rounded-lg shadow p-6 mb-6">
            <h3 class="text-base font-bold text-gray-800 mb-4"><i class="fas fa-calculator text-blue-500 mr-2"></i>카드 수수료 계산</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label class="form-label">카드사</label>
                <select id="calcCardCompany" class="form-select">
                  <option value="">카드사 선택</option>
                </select>
              </div>
              <div>
                <label class="form-label">입금액 (통장 입금된 금액)</label>
                <input type="number" id="calcDepositAmount" class="form-input" placeholder="예: 975000">
              </div>
              <div>
                <button onclick="calculateCardFee()" class="btn-primary w-full"><i class="fas fa-calculator mr-1"></i>계산</button>
              </div>
            </div>
            <div id="calcResult" class="hidden mt-4 p-4 bg-blue-50 rounded-lg">
              <div class="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div class="text-xs text-gray-500">원래 결제금액</div>
                  <div class="text-lg font-bold text-gray-800" id="calcOriginal">-</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500">수수료 (<span id="calcRateDisplay">-</span>%)</div>
                  <div class="text-lg font-bold text-red-600" id="calcFee">-</div>
                </div>
                <div>
                  <div class="text-xs text-gray-500">실제 입금액</div>
                  <div class="text-lg font-bold text-blue-600" id="calcDeposit">-</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 기간별 수수료 요약 -->
          <div class="bg-white rounded-lg shadow p-6 mb-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-bold text-gray-800"><i class="fas fa-chart-bar text-green-500 mr-2"></i>기간별 카드 수수료 집계</h3>
              <div class="flex items-center gap-2">
                <input type="date" id="feeDateStart" class="form-input" style="width:140px;">
                <span class="text-gray-400">~</span>
                <input type="date" id="feeDateEnd" class="form-input" style="width:140px;">
                <button onclick="loadFeeSummary()" class="btn-primary text-sm"><i class="fas fa-search mr-1"></i>조회</button>
              </div>
            </div>
            <div id="feeSummaryArea">
              <div class="text-center py-8 text-gray-400">기간을 선택하고 조회를 클릭하세요</div>
            </div>
          </div>

          <!-- 카드사 수수료율 설정 -->
          <div class="bg-white rounded-lg shadow p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-bold text-gray-800"><i class="fas fa-cog text-gray-500 mr-2"></i>카드사 수수료율 설정</h3>
              <button onclick="openAddFeeRateModal()" class="btn-primary text-sm"><i class="fas fa-plus mr-1"></i>추가</button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">카드사</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">수수료율 (%)</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">매칭 키워드</th>
                    <th class="px-3 py-2 text-center text-xs font-medium text-gray-500 w-24">액션</th>
                  </tr>
                </thead>
                <tbody id="feeRateTableBody">
                  <tr><td colspan="4" class="text-center py-6 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 수수료율 추가/수정 모달 -->
          <div class="modal-overlay" id="feeRateModal">
            <div class="modal-box" style="width:400px;">
              <div class="flex items-center justify-between mb-5">
                <h3 class="text-base font-bold text-gray-800" id="feeRateModalTitle"><i class="fas fa-credit-card text-blue-500 mr-2"></i>카드사 수수료율</h3>
                <button onclick="closeFeeRateModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
              <input type="hidden" id="feeRateEditId">
              <div class="space-y-4">
                <div>
                  <label class="form-label">카드사명 <span class="text-red-500">*</span></label>
                  <input type="text" id="feeRateCompany" class="form-input" placeholder="예: BC카드">
                </div>
                <div>
                  <label class="form-label">수수료율 (%) <span class="text-red-500">*</span></label>
                  <input type="number" id="feeRatePercent" class="form-input" step="0.01" min="0" max="100" placeholder="예: 2.2">
                </div>
                <div>
                  <label class="form-label">매칭 키워드 (콤마 구분)</label>
                  <input type="text" id="feeRateKeywords" class="form-input" placeholder="예: BC,비씨">
                  <div class="text-xs text-gray-400 mt-1">통장 입금자명에서 이 키워드가 포함되면 해당 카드사로 인식</div>
                </div>
              </div>
              <div class="flex gap-2 justify-end mt-6">
                <button onclick="closeFeeRateModal()" class="btn-secondary">취소</button>
                <button onclick="saveFeeRate()" class="btn-primary">저장</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 캐시플로 탭 내용 -->
        <div id="finCashflowContent" class="hidden">
          <!-- 탭 네비게이션 -->
          <div class="flex border-b mb-6 gap-1">
            <button onclick="switchCashFlowTab('overview')" id="tab-overview" class="px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600">캐시플로 현황</button>
            <button onclick="switchCashFlowTab('fixed')" id="tab-fixed" class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">고정비 관리</button>
            <button onclick="switchCashFlowTab('loans')" id="tab-loans" class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">대출 관리</button>
            <button onclick="switchCashFlowTab('calendar')" id="tab-calendar" class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">달력</button>
          </div>

          <!-- 탭 1: 캐시플로 현황 -->
          <div id="panel-overview">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div class="bg-white rounded-lg shadow p-4">
                <div class="text-sm text-gray-500">이번달 수입</div>
                <div id="kpiIncome" class="text-2xl font-bold text-green-600 mt-1">-</div>
              </div>
              <div class="bg-white rounded-lg shadow p-4">
                <div class="text-sm text-gray-500">이번달 지출</div>
                <div id="kpiExpense" class="text-2xl font-bold text-red-600 mt-1">-</div>
              </div>
              <div class="bg-white rounded-lg shadow p-4">
                <div class="text-sm text-gray-500">순 현금흐름</div>
                <div id="kpiNet" class="text-2xl font-bold mt-1">-</div>
              </div>
              <div class="bg-white rounded-lg shadow p-4">
                <div class="text-sm text-gray-500">대출 잔액 합계</div>
                <div id="kpiLoanBalance" class="text-2xl font-bold text-purple-600 mt-1">-</div>
              </div>
            </div>

            <div class="bg-white rounded-lg shadow p-6 mb-6">
              <h3 class="text-lg font-bold mb-4">6개월 캐시플로 프로젝션</h3>
              <div id="projectionChart" class="space-y-3"></div>
            </div>

            <div class="bg-white rounded-lg shadow p-6">
              <h3 class="text-lg font-bold mb-4">월별 상세</h3>
              <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                <table class="w-full text-sm ds-table-striped">
                  <thead>
                    <tr class="bg-gray-50 text-gray-600">
                      <th class="px-3 py-2 text-left">월</th>
                      <th class="px-3 py-2 text-right">수입</th>
                      <th class="px-3 py-2 text-right">고정비</th>
                      <th class="px-3 py-2 text-right">대출상환</th>
                      <th class="px-3 py-2 text-right">구매비</th>
                      <th class="px-3 py-2 text-right">순 현금흐름</th>
                      <th class="px-3 py-2 text-right">누적</th>
                    </tr>
                  </thead>
                  <tbody id="projectionTable"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 탭 2: 고정비 관리 -->
          <div id="panel-fixed" class="hidden">
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold"><i class="fas fa-file-invoice-dollar text-blue-600 mr-2"></i>고정비 목록</h3>
                <button onclick="openFixedExpenseModal()" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                  <i class="fas fa-plus mr-1"></i>추가
                </button>
              </div>
              <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                <table class="w-full text-sm ds-table-striped">
                  <thead>
                    <tr class="bg-gray-50 text-gray-600">
                      <th class="px-3 py-2 text-left">이름</th>
                      <th class="px-3 py-2 text-left">분류</th>
                      <th class="px-3 py-2 text-right">금액</th>
                      <th class="px-3 py-2 text-center">주기</th>
                      <th class="px-3 py-2 text-center">납부일</th>
                      <th class="px-3 py-2 text-left">기간</th>
                      <th class="px-3 py-2 text-center">상태</th>
                      <th class="px-3 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody id="fixedExpenseTable"></tbody>
                </table>
              </div>
              <div id="noFixedMsg" class="text-center text-gray-400 py-6 hidden">등록된 고정비가 없습니다.</div>
            </div>
          </div>

          <!-- 탭 3: 대출 관리 -->
          <div id="panel-loans" class="hidden">
            <div class="bg-white rounded-lg shadow p-6 mb-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold"><i class="fas fa-university text-purple-600 mr-2"></i>대출 목록</h3>
                <button onclick="openLoanModal()" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                  <i class="fas fa-plus mr-1"></i>추가
                </button>
              </div>
              <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                <table class="w-full text-sm ds-table-striped">
                  <thead>
                    <tr class="bg-gray-50 text-gray-600">
                      <th class="px-3 py-2 text-left">대출기관</th>
                      <th class="px-3 py-2 text-left">대출번호</th>
                      <th class="px-3 py-2 text-right">원금</th>
                      <th class="px-3 py-2 text-right">잔액</th>
                      <th class="px-3 py-2 text-center">금리(%)</th>
                      <th class="px-3 py-2 text-center">상환방식</th>
                      <th class="px-3 py-2 text-left">만기일</th>
                      <th class="px-3 py-2 w-28"></th>
                    </tr>
                  </thead>
                  <tbody id="loanTable"></tbody>
                </table>
              </div>
              <div id="noLoanMsg" class="text-center text-gray-400 py-6 hidden">등록된 대출이 없습니다.</div>
            </div>

            <!-- 대출 상세 (선택 시 표시) -->
            <div id="loanDetailPanel" class="hidden">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white rounded-lg shadow p-6">
                  <h4 class="font-bold mb-3"><i class="fas fa-chart-line text-orange-500 mr-2"></i>금리 변동 이력</h4>
                  <div id="rateHistoryTable"></div>
                  <button onclick="openRateChangeModal()" class="mt-3 px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">
                    <i class="fas fa-edit mr-1"></i>금리 변경
                  </button>
                </div>
                <div class="bg-white rounded-lg shadow p-6">
                  <h4 class="font-bold mb-3"><i class="fas fa-calendar-check text-green-600 mr-2"></i>상환 스케줄</h4>
                  <div class="flex gap-2 mb-3">
                    <button onclick="generateSchedule()" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                      <i class="fas fa-sync mr-1"></i>스케줄 생성
                    </button>
                  </div>
                  <div id="scheduleTable" class="max-h-96 overflow-y-auto"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 탭 4: 달력 -->
          <div id="panel-calendar" class="hidden">
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center justify-between mb-4">
                <button onclick="changeMonth(-1)" class="px-3 py-1.5 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm"><i class="fas fa-chevron-left"></i></button>
                <h3 id="calendarTitle" class="text-lg font-bold"></h3>
                <button onclick="changeMonth(1)" class="px-3 py-1.5 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm"><i class="fas fa-chevron-right"></i></button>
              </div>
              <div class="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                <div class="bg-gray-50 p-2 text-center text-xs font-bold text-red-500">일</div>
                <div class="bg-gray-50 p-2 text-center text-xs font-bold">월</div>
                <div class="bg-gray-50 p-2 text-center text-xs font-bold">화</div>
                <div class="bg-gray-50 p-2 text-center text-xs font-bold">수</div>
                <div class="bg-gray-50 p-2 text-center text-xs font-bold">목</div>
                <div class="bg-gray-50 p-2 text-center text-xs font-bold">금</div>
                <div class="bg-gray-50 p-2 text-center text-xs font-bold text-blue-500">토</div>
              </div>
              <div id="calendarGrid" class="grid grid-cols-7 gap-px bg-gray-200 border-x border-b border-gray-200 rounded-b-lg overflow-hidden"></div>
            </div>
            <!-- 일별 상세 모달 -->
            <div id="dayDetailModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
              <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                  <h3 id="dayDetailTitle" class="font-bold text-lg"></h3>
                  <button onclick="closeDayDetail()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
                </div>
                <div id="dayDetailContent"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Account Modal (Add/Edit) -->
      <div class="modal-overlay" id="accountModal">
        <div class="modal-box">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-gray-800" id="accountModalTitle"><i class="fas fa-university text-blue-500 mr-2"></i>새 계좌 등록</h3>
            <button onclick="closeAccountModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <input type="hidden" id="accEditId" value="">
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">은행명 <span class="text-red-500">*</span></label>
                <select id="accBank" class="form-select">
                  <option value="">선택</option>
                  <option value="0004">국민은행</option>
                  <option value="0088">신한은행</option>
                  <option value="0020">우리은행</option>
                  <option value="0081">하나은행</option>
                  <option value="0003">기업은행</option>
                  <option value="0011">농협은행</option>
                  <option value="0023">SC제일은행</option>
                  <option value="0090">카카오뱅크</option>
                  <option value="0092">토스뱅크</option>
                  <option value="0089">케이뱅크</option>
                  <option value="0045">새마을금고</option>
                  <option value="0007">수협은행</option>
                  <option value="0048">신협</option>
                  <option value="0032">부산은행</option>
                  <option value="0031">대구은행</option>
                  <option value="0034">광주은행</option>
                  <option value="0037">전북은행</option>
                  <option value="0035">제주은행</option>
                </select>
              </div>
              <div>
                <label class="form-label">계좌번호 <span class="text-red-500">*</span></label>
                <input type="text" id="accNumber" class="form-input" placeholder="000-000-000000">
              </div>
            </div>
            <div>
              <label class="form-label">예금주</label>
              <input type="text" id="accHolder" class="form-input" placeholder="예금주명">
            </div>
          </div>
          <div class="flex gap-2 justify-end mt-6">
            <button onclick="closeAccountModal()" class="btn-secondary">취소</button>
            <button onclick="saveAccount()" class="btn-primary" id="accSaveBtn">등록</button>
          </div>
        </div>
      </div>

      <!-- CSV Import Modal -->
      <div class="modal-overlay" id="csvImportModal">
        <div class="modal-box" style="width:680px; max-height:90vh; overflow-y:auto;">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-file-csv text-green-500 mr-2"></i>통장 내역 CSV 가져오기</h3>
            <button onclick="closeCsvImport()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>

          <!-- Step 1: 파일 선택 -->
          <div id="csvStep1">
            <div class="space-y-4">
              <div>
                <label class="form-label">계좌 선택 <span class="text-red-500">*</span></label>
                <select id="csvAccountId" class="form-select"></select>
              </div>
              <div>
                <label class="form-label">CSV 파일 <span class="text-red-500">*</span></label>
                <input type="file" id="csvFileInput" accept=".csv,.xls,.xlsx,.txt" class="form-input" onchange="parseCsvFile()">
                <div class="text-xs text-gray-400 mt-1">인터넷뱅킹에서 다운로드한 거래내역 파일 (CSV, TXT)</div>
              </div>
              <div id="csvColumnMapping" class="hidden">
                <label class="form-label">컬럼 매핑</label>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-16">날짜:</span>
                    <select id="mapDate" class="form-select text-sm"></select>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-16">시간:</span>
                    <select id="mapTime" class="form-select text-sm"><option value="">없음</option></select>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-16">입금:</span>
                    <select id="mapDeposit" class="form-select text-sm"></select>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-16">출금:</span>
                    <select id="mapWithdrawal" class="form-select text-sm"><option value="">없음</option></select>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-16">잔액:</span>
                    <select id="mapBalance" class="form-select text-sm"><option value="">없음</option></select>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-16">입금자:</span>
                    <select id="mapCounterpart" class="form-select text-sm"><option value="">없음</option></select>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-16">내용:</span>
                    <select id="mapDesc" class="form-select text-sm"><option value="">없음</option></select>
                  </div>
                </div>
                <button onclick="applyMapping()" class="mt-3 btn-primary text-sm">매핑 적용 & 미리보기</button>
              </div>
            </div>
          </div>

          <!-- Step 2: 미리보기 -->
          <div id="csvStep2" class="hidden">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm text-gray-600"><span id="csvPreviewCount" class="font-bold text-blue-600">0</span>건 파싱됨</span>
              <button onclick="backToCsvStep1()" class="text-sm text-gray-500 hover:text-gray-700"><i class="fas fa-arrow-left mr-1"></i>다시 선택</button>
            </div>
            <div class="overflow-x-auto max-h-64 overflow-y-auto border rounded">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 sticky top-0">
                  <tr><th class="px-2 py-1 text-left">날짜</th><th class="px-2 py-1 text-left">입금자명</th><th class="px-2 py-1 text-right">입금</th><th class="px-2 py-1 text-right">출금</th><th class="px-2 py-1 text-right">잔액</th></tr>
                </thead>
                <tbody id="csvPreviewBody"></tbody>
              </table>
            </div>
            <div class="flex gap-2 justify-end mt-4">
              <button onclick="closeCsvImport()" class="btn-secondary">취소</button>
              <button onclick="confirmCsvImport()" class="btn-primary"><i class="fas fa-upload mr-1"></i>가져오기 실행</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Apply Modal -->
      <div class="modal-overlay" id="applyModal">
        <div class="modal-box" style="width:420px;">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-check-circle text-green-500 mr-2"></i>입금 적용</h3>
            <button onclick="closeApplyModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <input type="hidden" id="applyTxId">
          <div class="space-y-3">
            <div>
              <label class="form-label">거래처 <span class="text-red-500">*</span></label>
              <select id="applyClientId" class="form-select"></select>
            </div>
            <div>
              <label class="form-label">결제 방법</label>
              <select id="applyPaymentMethod" class="form-select">
                <option value="bank_transfer">계좌이체</option>
                <option value="cash">현금</option>
                <option value="card">카드</option>
              </select>
            </div>
            <div>
              <label class="form-label">메모</label>
              <input type="text" id="applyNotes" class="form-input" placeholder="메모 (선택)">
            </div>
          </div>
          <div class="flex gap-2 justify-end mt-6">
            <button onclick="closeApplyModal()" class="btn-secondary">취소</button>
            <button onclick="confirmApply()" class="btn-primary">적용</button>
          </div>
        </div>
      </div>

      <!-- Rule Edit Modal -->
      <div class="modal-overlay" id="ruleEditModal">
        <div class="modal-box" style="width:420px;">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-edit text-blue-500 mr-2"></i>매칭 규칙 수정</h3>
            <button onclick="closeRuleEditModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <input type="hidden" id="ruleEditId">
          <div class="space-y-3">
            <div>
              <label class="form-label">입금자명 (키워드)</label>
              <input type="text" id="ruleEditName" class="form-input bg-gray-50" readonly>
            </div>
            <div>
              <label class="form-label">매칭 거래처 <span class="text-red-500">*</span></label>
              <div class="relative">
                <input type="text" id="ruleEditClientSearch" class="form-input" placeholder="거래처 검색..."
                  oninput="searchRuleClient(this.value)" onfocus="searchRuleClient(this.value)">
                <input type="hidden" id="ruleEditClientId">
                <div id="ruleEditClientDropdown" class="hidden absolute z-50 left-0 right-0 top-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>
              </div>
            </div>
          </div>
          <div class="flex gap-2 justify-end mt-6">
            <button onclick="closeRuleEditModal()" class="btn-secondary">취소</button>
            <button onclick="saveRuleEdit()" class="btn-primary">저장</button>
          </div>
        </div>
      </div>

    `,
    pageScript: `
      window.switchFinanceTab = function(tab) {
        var tabs = ['bank', 'barobill', 'cashflow'];
        var contents = { bank: 'finBankContent', barobill: 'finBarobillContent', cashflow: 'finCashflowContent' };
        var buttons = { bank: 'finTabBank', barobill: 'finTabBarobill', cashflow: 'finTabCashflow' };
        tabs.forEach(function(t) {
          var content = document.getElementById(contents[t]);
          var btn = document.getElementById(buttons[t]);
          if (t === tab) {
            if (content) content.classList.remove('hidden');
            if (btn) { btn.classList.remove('border-transparent', 'text-gray-500'); btn.classList.add('border-blue-600', 'text-blue-600'); }
          } else {
            if (content) content.classList.add('hidden');
            if (btn) { btn.classList.remove('border-blue-600', 'text-blue-600'); btn.classList.add('border-transparent', 'text-gray-500'); }
          }
        });
        if (tab === 'cardfee' && window.initCardFeeTab) window.initCardFeeTab();
        if (tab === 'barobill' && window.initBarobillTab) window.initBarobillTab();
      };
      (function() {
        var p = new URLSearchParams(window.location.search);
        if (p.get('tab') === 'cashflow' || window.location.hash === '#cashflow') {
          window.switchFinanceTab('cashflow');
        }
      })();

      ${bankScript}

      ${barobillViewScript}

      ${cashFlowScript}
    `
  })
}
