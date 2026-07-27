import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import bankScript from '../scripts/bank.js?raw'

// P3 자금 허브(/cash-schedule) 이식용 단일소스 export. 표준 /bank 라우트와 공유(HTML 중복 방지).
export const bankPageCSS = `
      .tab-btn { cursor:pointer; transition:border-color .15s, color .15s; }
      .tab-btn.active { border-bottom-color:var(--c-info); color:var(--c-info); }
      .tab-content { display:none; }
      .tab-content.active { display:block; }
      .kpi-card { border-radius:8px; padding:16px 20px; display:flex; flex-direction:column; gap:4px; }
      .status-badge { display:inline-block; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:600; }
      .badge-unmatched { background:var(--c-border); color:var(--c-text); }
      .badge-suggested { background:var(--c-warning-light); color:var(--c-warning); }
      .badge-confirmed { background:var(--c-info-light); color:var(--c-info); }
      .badge-applied   { background:var(--c-success-light); color:var(--c-success); }
      .badge-ignored   { background:var(--c-danger-light); color:var(--c-danger); }
      .tx-row:hover { background:var(--c-surface-stripe); }
      .tx-row td { padding:6px 10px; border-bottom:1px solid var(--c-border-light); font-size:12px; vertical-align:middle; }
      .account-card { background:var(--c-surface); border:1px solid var(--c-border); border-radius:8px; padding:16px 20px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .modal-overlay { display:none; position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.45); justify-content:center; align-items:center; }
      .modal-overlay.show { display:flex; }
      .modal-box { background:var(--c-surface); border-radius:10px; width:480px; max-width:95vw; padding:28px; box-shadow:0 8px 32px rgba(0,0,0,.18); }
      .form-label { font-size:13px; font-weight:500; color:var(--c-text); margin-bottom:4px; display:block; }
      .form-input { width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; outline:none; }
      .form-input:focus { border-color:var(--c-primary); box-shadow:0 0 0 2px var(--c-primary-light); }
      .form-select { width:100%; padding:8px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; background:var(--c-surface); outline:none; }
      .btn-primary { background:#2563eb; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; }
      .btn-primary:hover { background:#1d4ed8; }
      .btn-secondary { background:var(--c-surface); color:var(--c-text); border:1px solid var(--c-border); border-radius:6px; padding:8px 16px; font-size:13px; cursor:pointer; }
      .btn-secondary:hover { background:var(--c-surface-secondary); }
      .btn-sm { padding:4px 10px; font-size:12px; border-radius:4px; cursor:pointer; border:none; font-weight:500; }
      .btn-match { background:var(--c-info-light); color:var(--c-info); }
      .btn-match:hover { filter:brightness(.95); }
      .btn-ignore { background:var(--c-danger-light); color:var(--c-danger); }
      .btn-ignore:hover { filter:brightness(.95); }
      .btn-unmatch { background:var(--c-border-light); color:var(--c-text); }
      .btn-unmatch:hover { filter:brightness(.95); }
      .btn-sync { background:var(--c-success-light); color:var(--c-success); border:1px solid var(--c-success-light); }
      .btn-sync:hover { filter:brightness(.95); }
      .btn-delete { background:var(--c-danger-light); color:var(--c-danger); border:1px solid var(--c-danger-light); }
      .btn-delete:hover { filter:brightness(.95); }
    `

export const bankPageContent = `
      <div>
          <!-- 바로빌 연결 상태 -->
          <div id="barobillStatusBar" class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 mb-4 text-sm">
            <span class="text-gray-400"><i class="fas fa-plug mr-1"></i>바로빌 연결 확인 중...</span>
          </div>
          <!-- Tab Navigation -->
          <div class="flex border-b mb-6">
          <button id="tabFund" class="tab-btn active px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600"
            onclick="switchBankTab('fund')">
            <i class="fas fa-wallet mr-1"></i>자금 현황
          </button>
          <button id="tabTx" class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
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

        <!-- Tab 0: 자금 현황 -->
        <div id="tabContentFund" class="tab-content active">
          <!-- 총자금 KPI -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-gray-500"><i class="fas fa-university mr-1"></i>총 계좌잔액</div>
              <div class="text-2xl font-bold text-blue-600" id="fundTotalBalance">-</div>
              <div class="text-[11px] text-gray-400" id="fundAccountCount"></div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-gray-500"><i class="fas fa-hand-holding-usd mr-1"></i>대출 잔액</div>
              <div class="text-2xl font-bold text-red-500" id="fundLoanTotal">-</div>
              <div class="text-[11px] text-gray-400" id="fundLoanNote"></div>
            </div>
            <div class="kpi-card bg-blue-50 border border-blue-200 rounded-lg">
              <div class="text-xs font-medium text-blue-700"><i class="fas fa-wallet mr-1"></i>순자금 (잔액−대출)</div>
              <div class="text-2xl font-bold text-blue-700" id="fundNetFunds">-</div>
            </div>
          </div>

          <!-- 계좌별 잔액 -->
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-semibold text-gray-700">계좌별 잔액</h2>
            <button onclick="loadFundSummary()" class="text-xs text-gray-500 hover:text-blue-600"><i class="fas fa-sync-alt mr-1"></i>새로고침</button>
          </div>
          <div class="ds-card overflow-hidden mb-6">
            <div class="overflow-x-auto" style="max-height: 38vh; min-height: 140px; overflow-y: auto;">
              <table class="w-full border-collapse ds-table">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="col-name px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase">계좌</th>
                    <th class="col-tag px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase">계좌번호</th>
                    <th class="col-amount px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase">현재 잔액</th>
                    <th class="col-date px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase">최근 거래일</th>
                    <th class="col-status px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase">연동</th>
                  </tr>
                </thead>
                <tbody id="fundAccountsBody">
                  <tr><td colspan="5" class="text-center py-10 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 당월 고정비 출금 체크리스트 (P2) -->
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-semibold text-gray-700">이번 달 고정비 출금 현황 <span id="fundFixedPeriod" class="text-xs font-normal text-gray-400"></span></h2>
            <button onclick="hubGoto('plan','fixed')" class="hub-only hidden text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded px-2 py-1" title="계획 모드의 고정비 마스터에서 항목 편집">
              <i class="fas fa-pen mr-1"></i>고정비 항목 편집
            </button>
          </div>
          <div class="ds-card overflow-hidden">
            <div class="overflow-x-auto" style="max-height: 42vh; min-height: 140px; overflow-y: auto;">
              <table class="w-full border-collapse ds-table">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="col-name px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase">고정비 항목</th>
                    <th class="col-tag px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase">분류</th>
                    <th class="col-amount px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase">예상액</th>
                    <th class="col-amount px-3 py-2 text-right text-[11px] font-medium text-gray-500 uppercase">실제 출금</th>
                    <th class="col-date px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase">결제일</th>
                    <th class="col-status px-3 py-2 text-center text-[11px] font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody id="fundFixedBody">
                  <tr><td colspan="6" class="text-center py-8 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 1: 거래내역 매칭 -->
        <div id="tabContentTx" class="tab-content">
          <input type="hidden" id="filterStatus" value="PENDING">

          <!-- 통합 필터 바: 필터 + 상태탭 + KPI 인라인 -->
          <div class="ds-card px-4 py-3 mb-3">
            <!-- Row 1: 필터 + 인라인 KPI -->
            <div class="flex flex-wrap items-center gap-3">
              <select id="filterAccount" class="form-select text-sm" style="width:160px;" onchange="loadTransactions()">
                <option value="">전체 계좌</option>
              </select>
              <div class="flex items-center gap-1">
                <input type="text" id="filterDateStart" class="js-fp form-input text-sm" style="width:130px;" onchange="loadTransactions()" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                <span class="text-gray-300">~</span>
                <input type="text" id="filterDateEnd" class="js-fp form-input text-sm" style="width:130px;" onchange="loadTransactions()" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
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
                <button onclick="syncBarobillBank()" id="syncBarobillBtn" class="ds-btn ds-btn-primary ds-btn-sm flex items-center gap-1">
                  <i class="fas fa-sync-alt"></i> 바로빌 동기화
                </button>
                <button onclick="runAutoMatch()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1">
                  <i class="fas fa-magic"></i> 자동매칭
                </button>
                <button onclick="detectTransfers()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center gap-1" title="계좌간 이체 자동감지">
                  <i class="fas fa-right-left"></i> 계좌이체 감지
                </button>
                <button onclick="openCsvImport()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1" title="통장 CSV 가져오기">
                  <i class="fas fa-file-upload text-gray-400"></i> CSV
                </button>
                <button onclick="exportCsv()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center gap-1" title="거래내역 CSV 내보내기">
                  <i class="fas fa-download text-gray-400"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="ds-card overflow-hidden">
            <div class="overflow-x-auto" style="max-height: calc(100vh - 220px); overflow-y: auto;">
              <table class="w-full border-collapse ds-table ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="col-check px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">
                      <input type="checkbox" id="checkAll" onchange="toggleCheckAll(this)">
                    </th>
                    <th class="col-date px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">날짜</th>
                    <th class="col-tag px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">계좌</th>
                    <th class="col-name px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">적요</th>
                    <th class="col-amount px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">입금</th>
                    <th class="col-amount px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">출금</th>
                    <th class="col-amount px-2 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">잔액</th>
                    <th class="col-status px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">상태</th>
                    <th class="col-flex px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">거래처</th>
                    <th class="col-action px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody id="txTableBody">
                  <tr><td colspan="10" class="text-center py-10 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Floating Selection Bar -->
          <div id="floatingSelectionBar" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4" style="min-width:420px;">
            <span class="text-sm"><b id="selectedCount">0</b>건 선택</span>
            <div class="border-l border-gray-600 h-5"></div>
            <!-- 2026-07-27: [일괄 매칭]+[일괄 적용] 통합 → 버튼 1개(거래처 확정 + 원장 반영 + 규칙 학습) -->
            <button onclick="batchApply()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
              title="선택 건의 거래처를 확정하고 입금/지급 원장에 반영합니다. 확정된 거래처는 자동매칭 규칙으로 학습됩니다.">
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
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-5" id="receivablesKpi">
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-gray-500">총 미수금</div>
              <div class="text-xl font-bold text-red-600" id="rcvTotal">-</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-blue-700">예상 회수액 <span class="text-[10px] text-gray-400">(위험조정)</span></div>
              <div class="text-xl font-bold text-blue-600" id="rcvExpected">-</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-green-700">정상 (30일 이내)</div>
              <div class="text-xl font-bold text-green-600" id="rcvNormal">-</div>
            </div>
            <div class="kpi-card bg-white border border-gray-200 rounded-lg">
              <div class="text-xs font-medium text-amber-700">주의 (31~60일)</div>
              <div class="text-xl font-bold text-amber-600" id="rcvWarning">-</div>
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
          <div class="ds-card overflow-hidden">
            <div class="overflow-x-auto" style="max-height: calc(100vh - 320px); overflow-y: auto;">
              <table class="w-full border-collapse ds-table ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="col-name px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">거래처</th>
                    <th class="col-tag px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">대표자</th>
                    <th class="col-amount px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">미수금</th>
                    <th class="col-date px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">예상 입금일</th>
                    <th class="col-qty px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">예상회수율</th>
                    <th class="col-amount px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">예상회수액</th>
                    <th class="col-date px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">최근 입금일</th>
                    <th class="col-qty px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">총 입금 횟수</th>
                    <th class="col-amount px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">최근 90일 입금</th>
                    <th class="col-status px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody id="receivablesTableBody">
                  <tr><td colspan="10" class="text-center py-10 text-gray-400">로딩 중...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 3: 매칭 규칙 관리 -->
        <div id="tabContentRules" class="tab-content">
          <div class="flex justify-between items-center mb-4">
            <div>
              <h2 class="text-base font-semibold text-gray-700">자동매칭 규칙</h2>
              <p class="text-xs text-gray-400 mt-1">수동 매칭 시 자동 학습(완전일치)되거나, 직접 추가할 수 있습니다. <b>부분일치</b>는 적요에 키워드가 포함되면 매칭돼 매달 적요가 달라도 대응합니다.</p>
            </div>
            <div class="flex gap-2">
              <button onclick="openAddRuleModal()" class="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-700">
                <i class="fas fa-plus"></i> 규칙 추가
              </button>
              <button onclick="checkRuleConflicts()" class="flex items-center gap-1 px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm cursor-pointer hover:bg-amber-100">
                <i class="fas fa-exclamation-triangle"></i> 충돌 검사
              </button>
            </div>
          </div>
          <div class="ds-card overflow-hidden">
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full border-collapse ds-table ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 border-b">
                    <th class="col-name px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">입금자명 (키워드)</th>
                    <th class="col-tag px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">방식</th>
                    <th class="col-flex px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">매칭 대상</th>
                    <th class="col-qty px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">사용 횟수</th>
                    <th class="col-date px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">최근 사용</th>
                    <th class="col-action px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">액션</th>
                  </tr>
                </thead>
                <tbody id="rulesTableBody">
                  <tr><td colspan="6" class="text-center py-10 text-gray-400">로딩 중...</td></tr>
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
                <select id="accBank" class="form-select" onchange="onAccBankChange()">
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
            <div>
              <label class="form-label">계좌 이름(별칭)</label>
              <input type="text" id="accAlias" class="form-input" placeholder="예: 주거래-국민, 급여계좌 (거래내역 매칭에 표시)">
              <p class="text-xs text-gray-400 mt-1">거래내역 매칭·계좌 필터에 이 이름으로 표시됩니다. 비우면 은행명·예금주로 표시.</p>
            </div>
            <!-- 바로빌 자동 수집 연동 (신규 등록 시) -->
            <div id="accBarobillSection" class="border-t pt-3 mt-1">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="accBarobillSync" onchange="toggleAccBarobill()" class="rounded">
                <span class="text-sm font-semibold text-gray-700"><i class="fas fa-link text-emerald-500 mr-1"></i>바로빌 자동 수집 연동</span>
              </label>
              <div id="accBarobillFields" class="hidden mt-3 space-y-3 bg-gray-50 rounded-lg p-3">
                <p class="text-xs text-gray-500"><i class="fas fa-shield-alt mr-1"></i>인증정보는 바로빌 등록에만 1회 사용되며 MES에 저장되지 않습니다. 은행 인터넷뱅킹에서 이 계좌의 조회서비스(빠른조회/오픈뱅킹)가 먼저 신청되어 있어야 합니다.</p>
                <p id="accBankAuthHint" class="text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1 hidden"><i class="fas fa-circle-info mr-1"></i><span id="accBankAuthHintText"></span></p>
                <p class="text-xs text-amber-600"><i class="fas fa-triangle-exclamation mr-1"></i>개인사업자 계좌는 <b>계좌 구분=개인</b> + 예금주 식별번호에 <b>생년월일 6자리</b>를 넣으세요. 법인계좌만 사업자번호를 씁니다.</p>
                <div class="border border-blue-200 bg-blue-50 rounded-lg p-2.5">
                  <p class="text-xs text-blue-800 mb-1.5"><i class="fas fa-up-right-from-square mr-1"></i>아래 직접입력이 은행별 인증방식(특히 국민/신한) 때문에 계속 실패하면, <b>바로빌 화면에서 직접 등록</b>하세요. 은행이 그 자리에서 검증하므로 필드를 맞출 필요가 없습니다.</p>
                  <button type="button" onclick="openBarobillManageUrl(this)" class="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"><i class="fas fa-arrow-up-right-from-square mr-1"></i>바로빌에서 직접 등록·관리</button>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">예금주 식별번호 <span class="text-red-500">*</span></label>
                    <input type="text" id="accIdentityNum" class="form-input" autocomplete="off" placeholder="사업자번호 또는 생년월일">
                  </div>
                  <div>
                    <label class="form-label">계좌 비밀번호</label>
                    <input type="password" id="accPassword" class="form-input" autocomplete="new-password" placeholder="빠른조회 은행: 계좌 비밀번호">
                  </div>
                  <div>
                    <label class="form-label">빠른조회/뱅킹 ID <span class="text-gray-400">(선택)</span></label>
                    <input type="text" id="accWebId" class="form-input" autocomplete="off" placeholder="ID 없는 은행은 비움">
                  </div>
                  <div>
                    <label class="form-label">빠른조회/뱅킹 PW <span class="text-gray-400">(선택)</span></label>
                    <input type="password" id="accWebPwd" class="form-input" autocomplete="new-password" placeholder="ID 없는 은행은 비움">
                  </div>
                  <div>
                    <label class="form-label">계좌 구분</label>
                    <select id="accType" class="form-select">
                      <option value="C">법인</option>
                      <option value="P">개인</option>
                    </select>
                  </div>
                  <div>
                    <label class="form-label">수집주기</label>
                    <select id="accCollectCycle" class="form-select">
                      <option value="MINUTE10">10분</option>
                      <option value="MINUTE30">30분</option>
                      <option value="HOUR1" selected>1시간 (4,400원)</option>
                      <option value="HOUR4">4시간</option>
                      <option value="DAY1">1일 (3,300원)</option>
                    </select>
                  </div>
                </div>
                <p class="text-xs text-gray-400">수집주기가 짧을수록 입금 확인이 빠르지만 단가가 높을 수 있습니다.</p>
              </div>
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
              <table class="w-full text-xs" style="table-layout:fixed">
                <colgroup><col style="width:90px"><col><col style="width:90px"><col style="width:90px"><col style="width:100px"></colgroup>
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
            <h3 class="text-base font-bold text-gray-800" id="applyModalTitle"><i class="fas fa-check-circle text-green-500 mr-2"></i>입금 적용</h3>
            <button onclick="closeApplyModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <input type="hidden" id="applyTxId">
          <div class="space-y-3">
            <div>
              <label class="form-label">거래처 <span class="text-red-500">*</span></label>
              <input type="text" id="applyClientSearch" class="form-input" placeholder="클릭하여 거래처 선택..." readonly style="cursor:pointer;background:var(--c-surface);"
                onclick="openClientPicker(window.onApplyClientPicked, this.value)">
              <input type="hidden" id="applyClientId">
            </div>
            <!-- link-first: 동일 거래처·금액·±7일 기존 원장 기록 후보 → 연결(신규 생성 없음) 우선 -->
            <div id="applyCandidatesWrap" class="hidden">
              <label class="form-label">기존 원장 기록 발견 <span class="text-xs font-normal text-amber-600">— 연결하면 이중등록이 방지됩니다</span></label>
              <div id="applyCandidatesList" class="space-y-1 max-h-44 overflow-y-auto border border-amber-200 bg-amber-50 rounded-lg p-2"></div>
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

      <!-- Rule Add/Edit Modal -->
      <div class="modal-overlay" id="ruleEditModal">
        <div class="modal-box" style="width:440px;">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-gray-800" id="ruleModalTitle"><i class="fas fa-plus text-blue-500 mr-2"></i>매칭 규칙 추가</h3>
            <button onclick="closeRuleEditModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <input type="hidden" id="ruleEditId">
          <div class="space-y-4">
            <div>
              <label class="form-label">입금자명 / 출금처 키워드 <span class="text-red-500">*</span></label>
              <input type="text" id="ruleEditName" class="form-input" placeholder="예: 한국전력, 스타벅스, 카카오">
            </div>
            <div>
              <label class="form-label">매칭 방식</label>
              <div class="flex gap-2" id="ruleMatchTypeToggle">
                <button type="button" id="ruleMtExact" onclick="setRuleMatchType('EXACT')" class="flex-1 px-3 py-2 text-sm rounded-lg border font-medium">완전일치</button>
                <button type="button" id="ruleMtContains" onclick="setRuleMatchType('CONTAINS')" class="flex-1 px-3 py-2 text-sm rounded-lg border font-medium">부분일치(포함)</button>
              </div>
              <p class="text-xs text-gray-400 mt-1" id="ruleMatchTypeHint">완전일치: 적요가 키워드와 정확히 같을 때만 매칭.</p>
            </div>
            <div>
              <label class="form-label">매칭 대상</label>
              <div class="flex gap-2 mb-2" id="ruleTargetToggle">
                <button type="button" id="ruleTgtClient" onclick="setRuleTarget('client')" class="flex-1 px-3 py-2 text-sm rounded-lg border font-medium">거래처</button>
                <button type="button" id="ruleTgtCategory" onclick="setRuleTarget('category')" class="flex-1 px-3 py-2 text-sm rounded-lg border font-medium">비용분류</button>
              </div>
              <div id="ruleClientBlock">
                <input type="text" id="ruleEditClientSearch" class="form-input" placeholder="클릭하여 거래처 선택..." readonly style="cursor:pointer;background:var(--c-surface);"
                  onclick="openClientPicker(function(id,name){document.getElementById('ruleEditClientSearch').value=name;document.getElementById('ruleEditClientId').value=id;}, this.value)">
                <input type="hidden" id="ruleEditClientId">
              </div>
              <div id="ruleCategoryBlock" class="hidden">
                <select id="ruleEditCategoryId" class="form-select"><option value="">비용분류 선택...</option></select>
              </div>
            </div>
          </div>
          <div class="flex gap-2 justify-end mt-6">
            <button onclick="closeRuleEditModal()" class="btn-secondary">취소</button>
            <button onclick="saveRuleEdit()" class="btn-primary">저장</button>
          </div>
        </div>
      </div>

      <!-- 거래처 선택 모달 (재사용) -->
      <div class="modal-overlay" id="clientPickerModal">
        <div class="modal-box" style="width:520px; max-height:80vh; display:flex; flex-direction:column;">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-address-book text-blue-500 mr-2"></i>거래처 선택</h3>
            <button onclick="closeClientPicker()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <input type="text" id="clientPickerSearch" class="form-input mb-3" placeholder="거래처명·대표자 검색 (비우면 전체 목록)" oninput="clientPickerSearch(this.value)">
          <div id="clientPickerList" class="border border-gray-100 rounded-lg overflow-y-auto" style="flex:1; min-height:220px; max-height:52vh;">
            <div class="px-3 py-8 text-center text-sm text-gray-400">로딩 중...</div>
          </div>
        </div>
      </div>

      <!-- 계좌이체 후보 확정 모달 -->
      <div class="modal-overlay" id="transferModal">
        <div class="modal-box" style="width:640px; max-height:82vh; display:flex; flex-direction:column;">
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-right-left text-indigo-500 mr-2"></i>계좌간 이체 감지</h3>
            <button onclick="closeTransferModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <p class="text-xs text-gray-400 mb-3">동일 금액이 한 계좌에서 출금·다른 계좌로 입금(±2일)된 후보입니다. 확정하면 손익·비용분류·미수 매칭에서 제외됩니다(잔액엔 반영).</p>
          <div id="transferList" class="border border-gray-100 rounded-lg overflow-y-auto" style="flex:1; min-height:180px; max-height:56vh;">
            <div class="px-3 py-8 text-center text-sm text-gray-400">감지 중...</div>
          </div>
          <div class="flex gap-2 justify-end mt-4">
            <button onclick="closeTransferModal()" class="btn-secondary">닫기</button>
            <button onclick="confirmAllTransfers()" class="btn-primary" id="transferConfirmAllBtn"><i class="fas fa-check-double mr-1"></i>전체 확정</button>
          </div>
        </div>
      </div>

    `

export function bankPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '자금 관리',
    activePage: '/bank',
    pageCSS: bankPageCSS,
    pageContent: bankPageContent,
    pageScript: `
      ${bankScript}
    `
  })
}
