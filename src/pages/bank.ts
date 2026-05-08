import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import bankScript from '../scripts/bank.js?raw'
import cashFlowScript from '../scripts/cashFlow.js?raw'

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
      .tx-row td { padding:10px 12px; border-bottom:1px solid #f1f5f9; font-size:13px; vertical-align:middle; }
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
          <button id="tabAccounts" class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            onclick="switchBankTab('accounts')">
            <i class="fas fa-university mr-1"></i>계좌 관리
          </button>
        </div>

        <!-- Tab 1: 거래내역 매칭 -->
        <div id="tabContentTx" class="tab-content active">

          <!-- Filter Bar -->
          <div class="bg-white rounded-lg shadow p-4 mb-4">
            <!-- 주요 필터 (항상 표시) -->
            <div class="flex flex-wrap gap-3 items-center">
              <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-gray-700">계좌:</label>
                <select id="filterAccount" class="form-select" style="width:200px;" onchange="loadTransactions()">
                  <option value="">전체 계좌</option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <label class="text-sm font-medium text-gray-700">기간:</label>
                <input type="date" id="filterDateStart" class="form-input" style="width:140px;" onchange="loadTransactions()">
                <span class="text-gray-400">~</span>
                <input type="date" id="filterDateEnd" class="form-input" style="width:140px;" onchange="loadTransactions()">
              </div>
              <button type="button" id="bankFilterToggleBtn" onclick="const m=document.getElementById('bankFilterMore'); m.classList.toggle('hidden'); const s=this.querySelector('span'); s.textContent = m.classList.contains('hidden') ? '필터 더보기 ▼' : '접기 ▲';" class="text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap">
                <span>필터 더보기 ▼</span>
              </button>
            </div>
            <!-- 추가 필터 (접기/펼치기) -->
            <div id="bankFilterMore" class="hidden mt-3 pt-3 border-t border-gray-200">
              <div class="flex flex-wrap gap-3 items-center">
                <div class="flex items-center gap-2">
                  <label class="text-sm font-medium text-gray-700">상태:</label>
                  <select id="filterStatus" class="form-select" style="width:130px;" onchange="loadTransactions()">
                    <option value="">전체</option>
                    <option value="UNMATCHED">미매칭</option>
                    <option value="SUGGESTED">제안</option>
                    <option value="CONFIRMED">확인됨</option>
                    <option value="APPLIED">적용</option>
                    <option value="IGNORED">무시</option>
                  </select>
                </div>
                <div class="flex items-center gap-2">
                  <label class="text-sm font-medium text-gray-600 cursor-pointer">
                    <input type="checkbox" id="showWithdrawal" onchange="loadTransactions()" class="mr-1">
                    출금 표시
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-wrap gap-2 mb-4">
            <button onclick="syncAll()" class="btn-primary flex items-center gap-1">
              <i class="fas fa-sync-alt"></i> 동기화
            </button>
            <button onclick="runAutoMatch()" class="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold cursor-pointer hover:bg-blue-700">
              <i class="fas fa-magic"></i> 자동매칭 실행
            </button>
            <button onclick="batchApply()" class="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold cursor-pointer hover:bg-blue-700">
              <i class="fas fa-check-double"></i> 선택 항목 일괄 적용
            </button>
          </div>

          <!-- KPI Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5" id="kpiArea">
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-orange-700">미매칭</div>
              <div class="text-2xl font-bold text-orange-600" id="kpiUnmatched">-</div>
              <div class="text-xs text-orange-500">건</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-blue-700">매칭 제안</div>
              <div class="text-2xl font-bold text-blue-600" id="kpiSuggested">-</div>
              <div class="text-xs text-blue-500">건</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-green-700">적용 완료</div>
              <div class="text-2xl font-bold text-green-600" id="kpiApplied">-</div>
              <div class="text-xs text-green-500">건</div>
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full border-collapse ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase" style="width:36px;">
                      <input type="checkbox" id="checkAll" onchange="toggleCheckAll(this)">
                    </th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">입금자명</th>
                    <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">금액</th>
                    <th class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">잔액</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
                    <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">매칭 거래처</th>
                    <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">액션</th>
                  </tr>
                </thead>
                <tbody id="txTableBody">
                  <tr><td colspan="8" class="text-center py-10 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 2: 계좌 관리 -->
        <div id="tabContentAccounts" class="tab-content">
          <!-- CODEF 설정 -->
          <div class="bg-white rounded-lg shadow p-5 mb-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2">
                <i class="fas fa-key text-blue-500"></i> CODEF API 설정
              </h3>
              <button onclick="saveCodefSettings()" class="btn-primary text-xs px-3 py-1.5">
                <i class="fas fa-save mr-1"></i>저장
              </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label class="form-label">Client ID</label>
                <input type="text" id="codefClientId" class="form-input" placeholder="CODEF client_id">
              </div>
              <div>
                <label class="form-label">Client Secret</label>
                <input type="password" id="codefClientSecret" class="form-input" placeholder="CODEF client_secret">
              </div>
              <div>
                <label class="form-label">서비스 타입</label>
                <select id="codefServiceType" class="form-select">
                  <option value="sandbox">Sandbox (테스트)</option>
                  <option value="demo">Demo (데모)</option>
                  <option value="api">API (실서비스)</option>
                </select>
              </div>
            </div>
            <p class="text-xs text-gray-400 mt-2"><i class="fas fa-info-circle mr-1"></i>CODEF API 키는 <a href="https://codef.io" target="_blank" class="text-blue-500 underline">codef.io</a>에서 발급받을 수 있습니다.</p>
          </div>

          <!-- 계좌 목록 -->
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-base font-semibold text-gray-700">등록 계좌 목록</h2>
            <button onclick="openAddAccountModal()" class="btn-primary flex items-center gap-1">
              <i class="fas fa-plus"></i> 새 계좌 등록
            </button>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-3 mb-4 text-xs text-gray-600">
            <i class="fas fa-info-circle mr-1 text-blue-600"></i>
            <strong>Connected ID</strong>는 CODEF에서 은행 계좌를 등록할 때 발급받는 식별자입니다.
            Connected ID 없이도 계좌를 등록할 수 있지만, 거래내역 동기화를 위해서는 필요합니다.
            <a href="https://developer.codef.io" target="_blank" class="underline font-medium text-blue-600">CODEF 개발자 포털</a>에서 테스트용 Connected ID를 발급받을 수 있습니다.
          </div>
          <div id="accountsList" class="space-y-3">
            <div class="text-center py-10 text-gray-400">로딩 중...</div>
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
            <!-- Connected ID 발급 섹션 -->
            <div class="border border-gray-200 rounded p-3 bg-gray-50">
              <label class="form-label font-semibold mb-2"><i class="fas fa-key text-blue-500 mr-1"></i>Connected ID</label>
              <div class="flex gap-2 mb-2">
                <input type="text" id="accConnectedId" class="form-input flex-1 text-sm" placeholder="발급된 Connected ID (자동 입력됨)">
              </div>
              <div id="bankLoginSection">
                <p class="text-xs text-gray-500 mb-2"><i class="fas fa-info-circle mr-1"></i>CODEF를 통해 Connected ID를 발급받으려면 은행 로그인 정보를 입력하세요.</p>
                <div class="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label class="text-xs text-gray-500">은행 ID</label>
                    <input type="text" id="bankLoginId" class="form-input text-sm" placeholder="인터넷뱅킹 ID">
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">은행 비밀번호</label>
                    <input type="password" id="bankLoginPw" class="form-input text-sm" placeholder="인터넷뱅킹 비밀번호">
                  </div>
                </div>
                <button type="button" onclick="issueConnectedId()" class="btn-primary text-xs px-3 w-full" id="issueConnIdBtn">
                  <i class="fas fa-key mr-1"></i>Connected ID 발급
                </button>
              </div>
            </div>
          </div>
          <div id="connIdResult" class="hidden mt-3 p-3 bg-white border border-gray-200 rounded text-sm text-gray-600"></div>
          <div class="flex gap-2 justify-end mt-6">
            <button onclick="closeAccountModal()" class="btn-secondary">취소</button>
            <button onclick="saveAccount()" class="btn-primary" id="accSaveBtn">등록</button>
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

      <!-- Sync Preview Modal -->
      <div class="modal-overlay" id="syncPreviewModal">
        <div class="modal-box" style="max-width:640px;">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-search text-blue-500 mr-2"></i>동기화 미리보기</h3>
            <button onclick="closeSyncPreview()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <div class="mb-3 text-sm text-gray-600">
            CODEF에서 조회된 거래내역입니다. 확인 후 저장해주세요.
          </div>
          <div class="mb-3 bg-gray-50 rounded-lg p-3 text-center" id="syncPreviewSummary">
            로딩 중...
          </div>
          <div id="syncPreviewContent" class="mb-4 max-h-96 overflow-y-auto">
          </div>
          <div class="flex justify-end gap-2">
            <button onclick="closeSyncPreview()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">취소</button>
            <button id="syncConfirmBtn" onclick="confirmSync()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"><i class="fas fa-download mr-1"></i>저장</button>
          </div>
        </div>
      </div>
    `,
    pageScript: `
      window.switchFinanceTab = function(tab) {
        var bankContent = document.getElementById('finBankContent');
        var cashflowContent = document.getElementById('finCashflowContent');
        var bankTab = document.getElementById('finTabBank');
        var cashflowTab = document.getElementById('finTabCashflow');

        if (tab === 'bank') {
          bankTab.classList.remove('border-transparent', 'text-gray-500');
          bankTab.classList.add('border-blue-600', 'text-blue-600');
          cashflowTab.classList.remove('border-blue-600', 'text-blue-600');
          cashflowTab.classList.add('border-transparent', 'text-gray-500');
          bankContent.classList.remove('hidden');
          cashflowContent.classList.add('hidden');
        } else {
          cashflowTab.classList.remove('border-transparent', 'text-gray-500');
          cashflowTab.classList.add('border-blue-600', 'text-blue-600');
          bankTab.classList.remove('border-blue-600', 'text-blue-600');
          bankTab.classList.add('border-transparent', 'text-gray-500');
          cashflowContent.classList.remove('hidden');
          bankContent.classList.add('hidden');
        }
      };
      (function() {
        var p = new URLSearchParams(window.location.search);
        if (p.get('tab') === 'cashflow' || window.location.hash === '#cashflow') {
          window.switchFinanceTab('cashflow');
        }
      })();

      ${bankScript}

      ${cashFlowScript}
    `
  })
}
