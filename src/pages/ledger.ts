import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import ledgerScript from '../scripts/ledger.js?raw'

export function ledgerPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '거래처 원장',
    activePage: '/ledger',
    pageCSS: `
      .bar-cell{position:relative;height:24px;border-radius:4px;min-width:2px}
      .client-row{cursor:pointer;transition:background .15s}
      .client-row:hover{background:var(--c-orange-light)}
      .client-row.active{background:#fed7aa}
      #adjustmentModal.show{display:flex!important}
      .aging-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500}
      .aging-normal{background:var(--c-success-light);color:var(--c-success)}
      .aging-warning{background:var(--c-warning-light);color:var(--c-warning)}
      .aging-danger{background:var(--c-orange-light);color:var(--c-orange)}
      .aging-critical{background:var(--c-danger-light);color:var(--c-danger)}
      #clientDetailModal .modal-body{overflow-y:auto;max-height:calc(100vh - 72px)}
      #clientDetailModal .modal-header{position:sticky;top:0;background:var(--c-surface);border-bottom:1px solid var(--c-border);padding:12px 24px;z-index:10}
      #clientDetailModal .ds-table td{font-size:13px}
      #transactionsTableBody .tx-badge{display:inline-block;min-width:52px;text-align:center;padding:2px 6px;font-size:11px;font-weight:600;border-radius:4px;white-space:nowrap}
      /* 거래처별 원장 표: 헤더/바디/합계 패딩 통일 (specificity 0,2,2 > ds-table-striped, Tailwind px-4 무력화) */
      .ds-table.led-tbl thead th, .ds-table.led-tbl tbody td, .ds-table.led-tbl tfoot td{padding:6px 8px}
      /* th 정렬 유틸(text-right/center) 복원은 layout.ts 전역 규칙에서 처리 (단일 소스) */
      /* 원장 모달(.ds-modal): 콘텐츠를 패딩 없이 박스에 직접 배치 → 헤더가 상단·전폭 버튼이 둥근 모서리(12px)에 붙어 잘림. 박스 내부 패딩 부여 (원장 페이지 한정, clientDetailModal=.modal 미해당) */
      .ds-modal-overlay > .ds-modal{padding:var(--space-xl)}
    `,
    pageContent: `
        <!-- 회계반영 대기 배너 -->
        <div id="billingPendingBanner" class="hidden ds-card mb-4" style="border:2px solid var(--c-info);background:var(--c-primary-light);padding:12px 16px">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="fas fa-clock text-blue-500"></i>
              <span class="text-sm font-bold text-blue-700">회계반영 대기</span>
              <span id="billingPendingCount" class="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">0</span>
              <span class="text-sm text-blue-600 font-medium" id="billingPendingAmount"></span>
            </div>
            <a href="/tax-invoices#unbilled" class="ds-btn ds-btn-primary ds-btn-sm" style="background:#2563eb">
              <i class="fas fa-file-invoice mr-1"></i>계산서 발행
            </a>
          </div>
        </div>

        <!-- 매출/매입 토글 -->
        <div class="flex items-center border-b mb-4">
          <button id="tabSales" onclick="switchLedgerTab('sales')" class="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
            <i class="fas fa-file-invoice-dollar mr-1"></i>매출 원장
          </button>
          <button id="tabPurchase" onclick="switchLedgerTab('purchase')" class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
            <i class="fas fa-truck mr-1"></i>매입 원장
          </button>
          <button id="tabAnalysis" onclick="switchLedgerTab('analysis')" class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
            <i class="fas fa-chart-pie mr-1"></i>분석
          </button>
        </div>

        <!-- ===== 매출 원장 콘텐츠 ===== -->
        <div id="salesContent">

            <!-- 미수금 경고 배너 -->
            <div id="overdueWarningSection"></div>

            <!-- 필터 바 -->
            <div class="ds-card ds-card-compact mb-4">
                <div class="flex flex-wrap gap-3 items-center">
                    <span class="text-sm font-medium text-gray-700"><i class="fas fa-calendar-alt mr-1"></i>기간:</span>
                    <div class="flex gap-1">
                        <button onclick="setQuickDate('thisMonth')" class="quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50" data-key="thisMonth">이번달</button>
                        <button onclick="setQuickDate('lastMonth')" class="quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50" data-key="lastMonth">지난달</button>
                        <button onclick="setQuickDate('3months')" class="quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50" data-key="3months">최근3개월</button>
                        <button onclick="setQuickDate('thisYear')" class="quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50" data-key="thisYear">올해</button>
                    </div>
                    <input type="text" id="startDate" class="js-fp px-2 py-1 border rounded text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                    <span class="text-gray-400">~</span>
                    <input type="text" id="endDate" class="js-fp px-2 py-1 border rounded text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                    <button onclick="applyDateFilter()" class="ds-btn ds-btn-primary ds-btn-sm" style="background:var(--c-warning)">
                        <i class="fas fa-search" style="margin-right:4px"></i>조회
                    </button>
                    <div class="ml-auto flex gap-2">
                        <input type="text" id="clientSearch" placeholder="거래처명 검색..." class="px-3 py-1 border rounded text-sm w-40" oninput="filterClientTable()">
                        <button onclick="refreshAll()" class="ds-btn ds-btn-secondary ds-btn-sm">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- KPI Cards (6개: 매출 + 미수금 에이징) -->
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <div class="ds-card ds-card-compact">
                    <div class="ds-label mb-1">총 매출</div>
                    <div class="text-lg font-bold text-gray-700 tabular-nums text-right" id="totalSales">-</div>
                </div>
                <div class="ds-card ds-card-compact">
                    <div class="ds-label mb-1">총 입금</div>
                    <div class="text-lg font-bold text-gray-700 tabular-nums text-right" id="totalPayments">-</div>
                </div>
                <div class="ds-card ds-card-compact">
                    <div class="ds-label mb-1">총 미수금</div>
                    <div class="text-lg font-bold text-red-600 tabular-nums text-right" id="totalBalance">-</div>
                    <div class="text-xs text-gray-400 mt-1 text-right" id="balanceRatio"></div>
                </div>
                <div class="ds-card ds-card-compact" style="border-left:3px solid var(--c-warning)">
                    <div class="ds-label mb-1"><i class="fas fa-clock text-amber-500 mr-1"></i>30일+ 연체</div>
                    <div class="text-lg font-bold text-amber-600 tabular-nums text-right" id="agingOver30">-</div>
                </div>
                <div class="ds-card ds-card-compact" style="border-left:3px solid var(--c-danger)">
                    <div class="ds-label mb-1"><i class="fas fa-fire text-red-500 mr-1"></i>60일+ 연체</div>
                    <div class="text-lg font-bold text-red-600 tabular-nums text-right" id="agingOver60">-</div>
                </div>
                <div class="ds-card ds-card-compact">
                    <div class="ds-label mb-1">거래처 수</div>
                    <div class="text-lg font-bold text-gray-700 tabular-nums text-right" id="totalClients">-</div>
                </div>
            </div>

            <!-- 잔액 정합성 검사 결과 (숨김) -->
            <div id="integrityPanel" class="hidden ds-card mb-4 border-2 border-orange-300 bg-orange-50" style="padding:0">
                <div class="p-4 flex justify-between items-center">
                    <h2 class="text-sm font-bold text-orange-700">
                        <i class="fas fa-exclamation-triangle text-orange-500 mr-2"></i>잔액 불일치 <span id="integrityCount" class="bg-orange-600 text-white px-2 py-0.5 rounded-full text-xs ml-1">0</span>
                    </h2>
                    <div class="flex gap-2">
                        <button onclick="fixAllIntegrity()" class="ds-btn ds-btn-sm" style="background:#dc2626;color:white;font-size:12px">
                            <i class="fas fa-wrench mr-1"></i>일괄 수정
                        </button>
                        <button onclick="document.getElementById('integrityPanel').classList.add('hidden')" class="ds-btn ds-btn-ghost ds-btn-sm text-xs">닫기</button>
                    </div>
                </div>
                <div class="overflow-x-auto px-4 pb-4" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                    <table class="ds-table ds-table-compact ds-table-striped">
                        <thead><tr>
                            <th class="text-left">거래처</th>
                            <th class="text-right">캐시 잔액</th>
                            <th class="text-right">실계산 잔액</th>
                            <th class="text-right">차이</th>
                            <th class="text-center">조치</th>
                        </tr></thead>
                        <tbody id="integrityBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- 월별 매출/입금 추이 (접이식) -->
            <div class="ds-card mb-4" style="padding:0">
                <div class="p-4 flex justify-between items-center cursor-pointer" onclick="toggleMonthly()">
                    <h2 class="text-sm font-bold text-gray-700">
                        <i class="fas fa-chart-bar text-orange-500 mr-2"></i>월별 매출/입금 추이
                    </h2>
                    <i id="monthlyToggleIcon" class="fas fa-chevron-down text-gray-400 text-sm"></i>
                </div>
                <div id="monthlySection" class="hidden px-4 pb-4">
                    <div id="monthlyChart" class="space-y-2"></div>
                </div>
            </div>

            <!-- 거래처 목록 -->
            <div class="ds-card mb-4" style="padding:0">
                <div class="p-4 flex justify-between items-center">
                    <h2 class="text-sm font-bold text-gray-700">
                        <i class="fas fa-building text-orange-500 mr-2"></i>거래처별 원장
                    </h2>
                    <div class="flex gap-2">
                        <button onclick="runIntegrityCheck()" class="ds-btn ds-btn-ghost ds-btn-sm text-orange-600">
                            <i class="fas fa-shield-alt mr-1"></i>정합성 검사
                        </button>
                        <button onclick="exportClientsCSV()" class="ds-btn ds-btn-ghost ds-btn-sm">
                            <i class="fas fa-file-csv mr-1"></i>CSV
                        </button>
                    </div>
                </div>
                <div id="clientsCapNote" class="hidden mx-3 mb-2 px-3 py-2 rounded text-xs" style="background:var(--c-warning-light);color:var(--c-warning);border:1px solid var(--c-warning);"></div>
                <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                    <table class="ds-table ds-table-compact ds-table-striped led-tbl">
                        <thead>
                            <tr>
                                <th class="text-left">코드</th>
                                <th class="text-left">거래처명</th>
                                <th class="text-right">주문수</th>
                                <th class="text-right" style="min-width:100px">매출</th>
                                <th class="text-right" style="min-width:100px">입금</th>
                                <th class="text-right" style="min-width:100px">잔액</th>
                                <th class="text-center">연체</th>
                                <th class="text-center w-10"></th>
                            </tr>
                        </thead>
                        <tbody id="clientsTableBody" class="divide-y">
                        </tbody>
                        <tfoot id="clientsTableFoot" class="bg-gray-50 border-t font-bold text-sm">
                        </tfoot>
                    </table>
                </div>
            </div>

        </div>
        <!-- End salesContent -->

        <!-- ===== 매입 원장 콘텐츠 ===== -->
        <div id="purchaseContent" style="display:none">

            <!-- 필터 바 (기간) — 매출과 동일 구조 -->
            <div class="ds-card ds-card-compact mb-4">
                <div class="flex flex-wrap gap-3 items-center">
                    <span class="text-sm font-medium text-gray-700"><i class="fas fa-calendar-alt mr-1"></i>기간:</span>
                    <div class="flex gap-1">
                        <button onclick="setPurchaseQuickDate('thisMonth')" class="quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50" data-key="thisMonth">이번달</button>
                        <button onclick="setPurchaseQuickDate('lastMonth')" class="quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50" data-key="lastMonth">지난달</button>
                        <button onclick="setPurchaseQuickDate('3months')" class="quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50" data-key="3months">최근3개월</button>
                        <button onclick="setPurchaseQuickDate('thisYear')" class="quick-date px-3 py-1 text-xs rounded border hover:bg-orange-50" data-key="thisYear">올해</button>
                    </div>
                    <input type="text" id="pStartDate" class="js-fp px-2 py-1 border rounded text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                    <span class="text-gray-400">~</span>
                    <input type="text" id="pEndDate" class="js-fp px-2 py-1 border rounded text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                    <button onclick="applyPurchaseDateFilter()" class="ds-btn ds-btn-primary ds-btn-sm" style="background:var(--c-warning)">
                        <i class="fas fa-search" style="margin-right:4px"></i>조회
                    </button>
                    <div class="ml-auto flex gap-2">
                        <button onclick="loadPurchaseSettlement()" class="ds-btn ds-btn-secondary ds-btn-sm">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 매입 KPI -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div class="ds-card ds-card-compact">
                    <div class="ds-label mb-1">총 매입</div>
                    <div class="text-xl font-bold text-gray-700" id="pTotalPurchase">-</div>
                </div>
                <div class="ds-card ds-card-compact">
                    <div class="ds-label mb-1">총 지급</div>
                    <div class="text-xl font-bold text-gray-700" id="pTotalPayments">-</div>
                </div>
                <div class="ds-card ds-card-compact">
                    <div class="ds-label mb-1">미지급금</div>
                    <div class="text-xl font-bold text-red-600" id="pTotalBalance">-</div>
                </div>
                <div class="ds-card ds-card-compact">
                    <div class="ds-label mb-1">공급업체 수</div>
                    <div class="text-xl font-bold text-gray-700" id="pTotalSuppliers">-</div>
                </div>
            </div>

            <!-- 매입 월별 추이 -->
            <div class="ds-card mb-4" style="padding:0">
                <div class="p-4 flex items-center justify-between cursor-pointer" onclick="togglePurchaseMonthly()">
                    <h4 class="text-sm font-medium text-gray-600"><i class="fas fa-chart-bar text-orange-500 mr-2"></i>월별 매입/지급 추이</h4>
                    <i class="fas fa-chevron-down text-gray-400 text-sm" id="pMonthlyToggleIcon"></i>
                </div>
                <div id="pMonthlyChart" class="hidden space-y-2 px-4 pb-4"></div>
            </div>

            <!-- 공급업체 목록 -->
            <div class="ds-card mb-4" style="padding:0">
                <div class="p-4 flex justify-between items-center">
                    <h2 class="text-sm font-bold text-gray-700">
                        <i class="fas fa-truck text-blue-500 mr-2"></i>공급업체별 매입 원장
                    </h2>
                    <div class="flex gap-2 items-center">
                        <input type="text" id="supplierSearch" placeholder="공급업체명 검색..." class="px-3 py-1 border rounded text-sm w-40" oninput="filterSupplierTable()">
                        <button onclick="exportSuppliersCSV()" class="ds-btn ds-btn-ghost ds-btn-sm">
                            <i class="fas fa-file-csv mr-1"></i>CSV
                        </button>
                    </div>
                </div>
                <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                    <table class="ds-table ds-table-compact ds-table-striped">
                        <thead>
                            <tr>
                                <th class="text-left">공급업체명</th>
                                <th class="text-right">발주수</th>
                                <th class="text-right">총매입</th>
                                <th class="text-right">총지급</th>
                                <th class="text-right">잔액</th>
                            </tr>
                        </thead>
                        <tbody id="supplierTableBody" class="divide-y">
                        </tbody>
                        <tfoot id="supplierTableFoot" class="bg-gray-50 border-t font-bold text-sm">
                        </tfoot>
                    </table>
                </div>
            </div>

        </div>
        <!-- End purchaseContent -->

        <!-- ===== 분석 콘텐츠 ===== -->
        <div id="analysisContent" style="display:none">

            <!-- 월말 마감 대시보드 -->
            <div class="mb-6">
                <h2 class="text-sm font-bold text-gray-700 mb-3">
                    <i class="fas fa-calendar-check text-orange-500 mr-2"></i>이번달 마감 현황
                    <span id="closingPeriod" class="text-xs text-gray-400 font-normal ml-2"></span>
                </h2>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                    <div class="ds-card ds-card-compact">
                        <div class="ds-label mb-1">이번달 매출</div>
                        <div class="text-lg font-bold text-gray-700 tabular-nums text-right" id="closingSales">-</div>
                        <div class="text-xs text-right mt-1" id="closingSalesDiff"></div>
                    </div>
                    <div class="ds-card ds-card-compact">
                        <div class="ds-label mb-1">이번달 입금</div>
                        <div class="text-lg font-bold text-gray-700 tabular-nums text-right" id="closingPayments">-</div>
                        <div class="text-xs text-right mt-1" id="closingPaymentsDiff"></div>
                    </div>
                    <div class="ds-card ds-card-compact">
                        <div class="ds-label mb-1">총 미수금</div>
                        <div class="text-lg font-bold text-red-600 tabular-nums text-right" id="closingReceivables">-</div>
                        <div class="text-xs text-gray-400 text-right mt-1" id="closingReceivableClients"></div>
                    </div>
                    <div class="ds-card ds-card-compact" style="border-left:3px solid var(--c-warning)">
                        <div class="ds-label mb-1"><i class="fas fa-file-invoice text-amber-500 mr-1"></i>미발행 계산서</div>
                        <div class="text-lg font-bold text-amber-600 tabular-nums text-right" id="closingUnbilled">-</div>
                        <div class="text-xs text-gray-400 text-right mt-1" id="closingUnbilledAmount"></div>
                    </div>
                    <div class="ds-card ds-card-compact">
                        <div class="ds-label mb-1">이번달 감액</div>
                        <div class="text-lg font-bold text-orange-600 tabular-nums text-right" id="closingAdj">-</div>
                        <div class="text-xs text-gray-400 text-right mt-1" id="closingAdjCount"></div>
                    </div>
                    <div class="ds-card ds-card-compact">
                        <div class="ds-label mb-1">회수율</div>
                        <div class="text-lg font-bold tabular-nums text-right" id="closingCollRate">-</div>
                        <div class="text-xs text-gray-400 text-right mt-1">입금÷매출</div>
                    </div>
                </div>
            </div>

            <!-- 매출-매입 손익 요약 (월별) -->
            <div class="ds-card mb-4" style="padding:0">
                <div class="p-4 flex justify-between items-center">
                    <h2 class="text-sm font-bold text-gray-700">
                        <i class="fas fa-balance-scale text-blue-500 mr-2"></i>월별 손익 요약
                    </h2>
                    <select id="profitMonthRange" onchange="loadProfitSummary()" class="ds-input" style="width:auto">
                        <option value="6">최근 6개월</option>
                        <option value="12">최근 12개월</option>
                    </select>
                </div>
                <div class="overflow-x-auto px-4 pb-4">
                    <table class="ds-table ds-table-compact ds-table-striped">
                        <thead>
                            <tr>
                                <th class="text-left">월</th>
                                <th class="text-right">매출</th>
                                <th class="text-right">매입</th>
                                <th class="text-right">손익</th>
                                <th class="text-right">이익률</th>
                                <th class="text-right">입금</th>
                                <th class="text-right">지급</th>
                                <th class="text-left" style="min-width:180px">손익 그래프</th>
                            </tr>
                        </thead>
                        <tbody id="profitMonthlyBody"></tbody>
                        <tfoot id="profitMonthlyFoot" class="bg-gray-50 border-t font-bold text-sm"></tfoot>
                    </table>
                </div>
            </div>

            <!-- 거래처별 손익 -->
            <div class="ds-card mb-4" style="padding:0">
                <div class="p-4 flex justify-between items-center">
                    <h2 class="text-sm font-bold text-gray-700">
                        <i class="fas fa-building text-green-500 mr-2"></i>거래처별 손익
                    </h2>
                    <input type="text" id="profitClientSearch" placeholder="거래처명 검색..." class="ds-input" style="width:200px" oninput="filterProfitClientTable()">
                </div>
                <div class="overflow-x-auto" style="max-height:400px;overflow-y:auto">
                    <table class="ds-table ds-table-compact ds-table-striped">
                        <thead>
                            <tr>
                                <th class="text-left">거래처</th>
                                <th class="text-right">총 매출</th>
                                <th class="text-right">총 매입</th>
                                <th class="text-right">손익</th>
                                <th class="text-right">이익률</th>
                                <th class="text-left" style="min-width:150px">비율</th>
                            </tr>
                        </thead>
                        <tbody id="profitClientBody"></tbody>
                    </table>
                </div>
            </div>

            <!-- 거래처별 평균 회수 기간 -->
            <div class="ds-card mb-4" style="padding:0">
                <div class="p-4 flex justify-between items-center">
                    <h2 class="text-sm font-bold text-gray-700">
                        <i class="fas fa-hourglass-half text-blue-600 mr-2"></i>거래처별 평균 회수 기간
                    </h2>
                    <span class="text-xs text-gray-400">입금 실적 2건 이상 거래처 기준</span>
                </div>
                <div class="overflow-x-auto" style="max-height:400px;overflow-y:auto">
                    <table class="ds-table ds-table-compact ds-table-striped">
                        <thead>
                            <tr>
                                <th class="text-left">거래처</th>
                                <th class="text-right">평균 회수</th>
                                <th class="text-right">최소</th>
                                <th class="text-right">최대</th>
                                <th class="text-right">정산 건수</th>
                                <th class="text-right">현재 잔액</th>
                                <th class="text-left" style="min-width:150px">회수 속도</th>
                            </tr>
                        </thead>
                        <tbody id="collectionPeriodBody"></tbody>
                    </table>
                </div>
            </div>

        </div>
        <!-- End analysisContent -->

        <!-- ===== 거래처 상세 모달 (은행 거래내역 스타일) ===== -->
        <div id="clientDetailModal" class="hidden" data-esc-close="closeDetailModal" style="position:fixed;inset:0;z-index:50">
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.3)" onclick="closeDetailModal()"></div>
            <div style="position:relative;background:var(--c-surface);max-width:1100px;margin:16px auto;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.15);display:flex;flex-direction:column;max-height:calc(100vh - 32px)">

                <!-- 모달 헤더 -->
                <div class="modal-header" style="flex-shrink:0">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-bold text-gray-800">
                            <i class="fas fa-user-tie text-orange-500 mr-2"></i>
                            <span id="modalClientName"></span>
                        </h2>
                        <button onclick="closeDetailModal()" class="text-gray-400 hover:text-gray-600 text-lg px-2">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <!-- 인라인 요약 -->
                    <div class="flex flex-wrap gap-4 mt-2 text-sm">
                        <span id="modalSummaryRow">
                            <span class="text-gray-500">매출</span> <b id="clientTotalSales" class="text-gray-700">-</b>
                            <span class="text-gray-300 mx-1">|</span>
                            <span class="text-gray-500">입금</span> <b id="clientTotalPayments" class="text-gray-700">-</b>
                            <span class="text-gray-300 mx-1">|</span>
                            <span class="text-gray-500">할인</span> <b id="clientTotalAdjustments" class="text-orange-600">-</b>
                            <span class="text-gray-300 mx-1">|</span>
                            <span class="text-red-600 font-bold">잔액 <span id="clientBalance">-</span></span>
                            <span class="text-gray-300 mx-1">|</span>
                            <span class="text-gray-400">최근입금 <span id="clientLastPayment">-</span></span>
                        </span>
                        <!-- 매입 요약 (숨김, 매입 모드에서 표시) -->
                        <span id="modalPurchaseSummaryRow" class="hidden">
                            <span class="text-gray-500">매입</span> <b id="pClientTotalPurchase" class="text-gray-700">-</b>
                            <span class="text-gray-300 mx-1">|</span>
                            <span class="text-gray-500">지급</span> <b id="pClientTotalPayments" class="text-gray-700">-</b>
                            <span class="text-gray-300 mx-1">|</span>
                            <span class="text-red-600 font-bold">잔액 <span id="pClientBalance">-</span></span>
                            <span class="text-gray-300 mx-1">|</span>
                            <span class="text-gray-400">최근지급 <span id="pClientLastPayment">-</span></span>
                        </span>
                    </div>
                    <!-- 조회 기간 컨트롤 (모달 독립, 기본=페이지 기간) -->
                    <div class="flex items-center gap-2 mt-2 flex-wrap">
                        <span class="text-xs text-gray-500"><i class="far fa-calendar-alt mr-1"></i>조회기간</span>
                        <input type="text" id="modalStartDate" class="js-fp ds-input" style="width:142px;padding:3px 8px;font-size:12px" onchange="applyModalPeriod()" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                        <span class="text-gray-400 text-xs">~</span>
                        <input type="text" id="modalEndDate" class="js-fp ds-input" style="width:142px;padding:3px 8px;font-size:12px" onchange="applyModalPeriod()" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                        <button onclick="setModalPeriodThisYear()" class="ds-btn ds-btn-ghost ds-btn-sm" style="font-size:12px;padding:2px 8px">올해</button>
                        <button onclick="setModalPeriodAll()" class="ds-btn ds-btn-ghost ds-btn-sm" style="font-size:12px;padding:2px 8px">전체</button>
                    </div>
                    <div id="dualBalanceSection" class="mt-1"></div>
                </div>

                <!-- 모달 바디 -->
                <div class="modal-body" style="flex:1;overflow-y:auto;padding:16px 24px">

                    <!-- ===== 매출 상세 ===== -->
                    <div id="detailSection">
                        <!-- 입금 등록 (컴팩트) -->
                        <div class="bg-green-50 rounded-lg p-3 mb-4 border border-green-200">
                            <div class="flex flex-wrap gap-2 items-center">
                                <span class="text-sm font-bold text-green-700"><i class="fas fa-plus-circle mr-1"></i>입금</span>
                                <input type="text" inputmode="numeric" data-money id="paymentAmount" placeholder="금액" class="ds-input" style="width:120px">
                                <input type="text" id="paymentDate" class="js-fp ds-input" style="width:140px" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                                <select id="paymentMethod" class="ds-input" style="width:100px">
                                    <option value="">방법</option>
                                    <option value="계좌이체">계좌이체</option>
                                    <option value="현금">현금</option>
                                    <option value="카드">카드</option>
                                    <option value="수표">수표</option>
                                    <option value="어음">어음</option>
                                    <option value="기타">기타</option>
                                </select>
                                <input type="text" id="paymentRef" placeholder="참조번호" class="ds-input" style="width:100px">
                                <input type="text" id="paymentNotes" placeholder="메모" class="ds-input" style="width:100px">
                                <button onclick="addPayment()" class="ds-btn ds-btn-primary ds-btn-sm" style="background:var(--c-success)">
                                    <i class="fas fa-save mr-1"></i>등록
                                </button>
                            </div>
                        </div>

                        <!-- 통합 타임라인 -->
                        <div class="ds-card" style="padding:0">
                            <div class="p-3 flex justify-between items-center border-b">
                                <h3 class="text-sm font-bold text-gray-700">
                                    <i class="fas fa-stream text-orange-500 mr-1"></i>거래 내역
                                </h3>
                                <div class="flex gap-1">
                                    <button onclick="openAdjustmentModal()" class="ds-btn ds-btn-ghost ds-btn-sm text-orange-600" title="감액 등록">
                                        <i class="fas fa-minus-circle mr-1"></i>감액
                                    </button>
                                    <button onclick="openCollectionModal()" class="ds-btn ds-btn-ghost ds-btn-sm text-blue-600" title="독촉 등록">
                                        <i class="fas fa-phone-alt mr-1"></i>독촉
                                    </button>
                                    <button onclick="openLedgerSendModal(modalContext.clientId, modalContext.clientName, 0, 'email')" class="ds-btn ds-btn-ghost ds-btn-sm text-blue-600" title="알림 발송">
                                        <i class="fas fa-paper-plane mr-1"></i>발송
                                    </button>
                                    <button onclick="printLedgerStatement()" class="ds-btn ds-btn-ghost ds-btn-sm" title="인쇄">
                                        <i class="fas fa-print"></i>
                                    </button>
                                    <button onclick="openLedgerFaxModal()" class="ds-btn ds-btn-ghost ds-btn-sm text-blue-600" title="팩스 발송">
                                        <i class="fas fa-fax"></i>
                                    </button>
                                    <button onclick="exportTransactionsCSV()" class="ds-btn ds-btn-ghost ds-btn-sm" title="CSV 내보내기">
                                        <i class="fas fa-file-csv"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="overflow-x-auto" style="max-height:calc(100vh - 320px);overflow-y:auto">
                                <table class="ds-table ds-table-compact ds-table-striped">
                                    <colgroup>
                                        <col style="width:104px">
                                        <col style="width:52px">
                                        <col>
                                        <col style="width:96px">
                                        <col style="width:82px">
                                        <col style="width:100px">
                                        <col style="width:96px">
                                        <col style="width:100px">
                                        <col style="width:30px">
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th class="text-left">일자</th>
                                            <th class="text-center">구분</th>
                                            <th class="text-left">내용</th>
                                            <th class="text-right">공급가액</th>
                                            <th class="text-right">부가세</th>
                                            <th class="text-right">합계</th>
                                            <th class="text-right">입금(-)</th>
                                            <th class="text-right">잔액</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody id="transactionsTableBody" class="divide-y"></tbody>
                                </table>
                            </div>
                        </div>
                        <!-- 독촉 이력 (collection logs) — #370 등록 이력 조회/삭제 -->
                        <div class="ds-card mt-4" style="padding:0">
                            <div class="p-3 border-b">
                                <h3 class="text-sm font-bold text-gray-700">
                                    <i class="fas fa-bell text-gray-500 mr-1"></i>독촉 이력
                                </h3>
                            </div>
                            <div class="overflow-x-auto" style="max-height:240px;overflow-y:auto">
                                <table class="ds-table ds-table-compact ds-table-striped">
                                    <thead>
                                        <tr>
                                            <th class="text-left">연락일</th>
                                            <th class="text-left">방법</th>
                                            <th class="text-left">담당</th>
                                            <th class="text-left">약속일</th>
                                            <th class="text-right">약속금액</th>
                                            <th class="text-left">메모</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody id="collectionLogsBody" class="divide-y"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <!-- End detailSection -->

                    <!-- ===== 매입 상세 ===== -->
                    <div id="pDetailSection" class="hidden">
                        <!-- 지급 등록 (컴팩트) -->
                        <div class="bg-blue-50 rounded-lg p-3 mb-4 border border-blue-200">
                            <div class="flex flex-wrap gap-2 items-center">
                                <span class="text-sm font-bold text-blue-700"><i class="fas fa-plus-circle mr-1"></i>지급</span>
                                <input type="text" inputmode="numeric" data-money id="pPaymentAmount" placeholder="금액" class="ds-input" style="width:120px">
                                <input type="text" id="pPaymentDate" class="js-fp ds-input" style="width:140px" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                                <select id="pPaymentMethod" class="ds-input" style="width:100px">
                                    <option value="">방법</option>
                                    <option value="계좌이체">계좌이체</option>
                                    <option value="현금">현금</option>
                                    <option value="카드">카드</option>
                                    <option value="수표">수표</option>
                                    <option value="어음">어음</option>
                                    <option value="기타">기타</option>
                                </select>
                                <input type="text" id="pPaymentRef" placeholder="참조번호" class="ds-input" style="width:100px">
                                <input type="text" id="pPaymentNotes" placeholder="메모" class="ds-input" style="width:100px">
                                <button onclick="addPurchasePayment()" class="ds-btn ds-btn-primary ds-btn-sm" style="background:var(--c-success)">
                                    <i class="fas fa-save mr-1"></i>등록
                                </button>
                            </div>
                        </div>
                        <!-- 매입 감액 (컴팩트) -->
                        <div class="bg-orange-50 rounded-lg p-3 mb-4 border border-orange-200">
                            <div class="flex flex-wrap gap-2 items-center">
                                <span class="text-sm font-bold text-orange-700"><i class="fas fa-minus-circle mr-1"></i>감액</span>
                                <select id="purchAdjType" class="ds-input" style="width:80px">
                                    <option value="DISCOUNT">할인</option>
                                    <option value="CLAIM">클레임</option>
                                    <option value="RETURN">반품</option>
                                    <option value="OTHER">기타</option>
                                </select>
                                <input type="text" inputmode="numeric" data-money id="purchAdjAmount" placeholder="금액" class="ds-input" style="width:100px">
                                <input type="text" id="purchAdjDate" class="js-fp ds-input" style="width:140px" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                                <input type="text" id="purchAdjReason" placeholder="사유" class="ds-input" style="width:120px">
                                <input type="text" id="purchAdjPoId" placeholder="PO#" class="ds-input" style="width:80px">
                                <button onclick="recordPurchaseAdjustment()" class="ds-btn ds-btn-primary ds-btn-sm" style="background:var(--c-warning)">
                                    <i class="fas fa-save mr-1"></i>등록
                                </button>
                            </div>
                        </div>

                        <!-- 매입 타임라인 -->
                        <div class="ds-card" style="padding:0">
                            <div class="p-3 flex justify-between items-center border-b">
                                <h3 class="text-sm font-bold text-gray-700">
                                    <i class="fas fa-stream text-blue-500 mr-1"></i>발주/지급 내역
                                </h3>
                                <div class="flex gap-1">
                                    <button id="purchIntegrityBtn" onclick="checkPurchaseIntegrity()" class="ds-btn ds-btn-ghost ds-btn-sm text-blue-600" title="정합성 검사">
                                        <i class="fas fa-shield-alt mr-1"></i>정합성
                                    </button>
                                    <button onclick="openLedgerSendModal(modalContext.clientId, modalContext.clientName, 0, 'email', 'purchase')" class="ds-btn ds-btn-ghost ds-btn-sm text-blue-600" title="알림 발송">
                                        <i class="fas fa-paper-plane mr-1"></i>발송
                                    </button>
                                    <button onclick="printLedgerStatement()" class="ds-btn ds-btn-ghost ds-btn-sm" title="인쇄">
                                        <i class="fas fa-print"></i>
                                    </button>
                                    <button onclick="openLedgerFaxModal()" class="ds-btn ds-btn-ghost ds-btn-sm text-blue-600" title="팩스 발송">
                                        <i class="fas fa-fax"></i>
                                    </button>
                                    <button onclick="exportPurchaseTransactionsCSV()" class="ds-btn ds-btn-ghost ds-btn-sm" title="CSV 내보내기">
                                        <i class="fas fa-file-csv"></i>
                                    </button>
                                </div>
                            </div>
                            <div id="purchIntegrityPanel" class="hidden px-3 py-2 bg-yellow-50 border-b text-sm"></div>
                            <div id="purchaseOverdueList" class="hidden px-3 py-2 bg-red-50 border-b text-sm"></div>
                            <div class="overflow-x-auto" style="max-height:calc(100vh - 360px);overflow-y:auto">
                                <table class="ds-table ds-table-compact ds-table-striped">
                                    <thead>
                                        <tr>
                                            <th class="text-left" style="width:104px">일자</th>
                                            <th class="text-center" style="width:64px">구분</th>
                                            <th class="text-left">내용</th>
                                            <th class="text-right" style="width:96px">공급가액</th>
                                            <th class="text-right" style="width:82px">부가세</th>
                                            <th class="text-right" style="width:104px">합계</th>
                                            <th class="text-right" style="width:100px">지급(-)</th>
                                            <th class="text-right" style="width:104px">잔액</th>
                                            <th class="text-center" style="width:52px"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="pTransactionsBody" class="divide-y"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <!-- End pDetailSection -->

                </div>
                <!-- End modal-body -->
            </div>
        </div>
        <!-- End clientDetailModal -->

        <!-- ===== 입금 수정 모달 ===== -->
        <div id="paymentEditModal" class="ds-modal-overlay hidden" style="z-index:60">
          <div class="ds-modal" style="max-width:440px">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-edit text-orange-500 mr-2"></i>입금 수정</h3>
              <button onclick="closePaymentModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <input type="hidden" id="editPaymentId">
            <div class="space-y-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">입금액</label>
                <input type="text" inputmode="numeric" data-money id="editAmount" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">입금일</label>
                <input type="text" id="editDate" class="js-fp w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">입금방법</label>
                <select id="editMethod" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">선택</option>
                  <option value="계좌이체">계좌이체</option>
                  <option value="현금">현금</option>
                  <option value="카드">카드</option>
                  <option value="수표">수표</option>
                  <option value="어음">어음</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">참조번호</label>
                <input type="text" id="editRef" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">메모</label>
                <input type="text" id="editNotes" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
            </div>
            <div class="flex items-center gap-2 mt-6">
              <button onclick="deletePaymentFromModal()" class="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50">
                <i class="fas fa-trash mr-1"></i>삭제
              </button>
              <div class="flex-1"></div>
              <button onclick="closePaymentModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
              <button onclick="savePaymentEdit()" class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600">
                <i class="fas fa-save mr-1"></i>저장
              </button>
            </div>
          </div>
        </div>

        <!-- ===== 감액 등록 모달 ===== -->
        <div id="adjustmentModal" class="ds-modal-overlay" style="display:none">
            <div class="ds-modal" style="max-width:448px">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-gray-700"><i class="fas fa-minus-circle text-orange-500 mr-2"></i>감액 등록</h3>
                    <button onclick="closeAdjustmentModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="ds-label">유형</label>
                        <select id="adjType" class="w-full ds-input mt-1">
                            <option value="DISCOUNT">할인</option>
                            <option value="CLAIM">클레임</option>
                            <option value="RETURN">반품</option>
                            <option value="BAD_DEBT">대손(탕감)</option>
                            <option value="OTHER">기타</option>
                        </select>
                    </div>
                    <div>
                        <label class="ds-label">금액 (원)</label>
                        <input type="text" inputmode="numeric" data-money id="adjAmount" placeholder="감액 금액" class="w-full ds-input mt-1">
                    </div>
                    <div>
                        <label class="ds-label">사유</label>
                        <input type="text" id="adjReason" placeholder="감액 사유를 입력하세요" class="w-full ds-input mt-1">
                    </div>
                    <div>
                        <label class="ds-label">연결 주문 (선택사항)</label>
                        <select id="adjOrderId" class="w-full ds-input mt-1">
                            <option value="">주문 선택 (선택사항)</option>
                        </select>
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button onclick="saveAdjustment()" class="ds-btn ds-btn-primary flex-1" style="background:var(--c-warning)">등록</button>
                        <button onclick="closeAdjustmentModal()" class="ds-btn ds-btn-secondary flex-1">취소</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ===== 독촉 등록 모달 ===== -->
        <div id="collectionModal" class="ds-modal-overlay" style="display:none">
            <div class="ds-modal" style="max-width:448px">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-gray-700"><i class="fas fa-phone-alt text-blue-600 mr-2"></i>독촉 이력 등록</h3>
                    <button onclick="closeCollectionModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="ds-label">연락일</label>
                        <input type="text" id="colDate" class="js-fp w-full ds-input mt-1" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                    </div>
                    <div>
                        <label class="ds-label">연락 방법</label>
                        <select id="colMethod" class="w-full ds-input mt-1">
                            <option value="PHONE">전화</option>
                            <option value="SMS">문자</option>
                            <option value="EMAIL">이메일</option>
                            <option value="VISIT">방문</option>
                            <option value="LETTER">내용증명</option>
                            <option value="OTHER">기타</option>
                        </select>
                    </div>
                    <div>
                        <label class="ds-label">담당자</label>
                        <input type="text" id="colPerson" placeholder="연락한 사람" class="w-full ds-input mt-1">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="ds-label">약속 입금일</label>
                            <input type="text" id="colPromisedDate" class="js-fp w-full ds-input mt-1" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
                        </div>
                        <div>
                            <label class="ds-label">약속 금액</label>
                            <input type="text" inputmode="numeric" data-money id="colPromisedAmount" placeholder="0" class="w-full ds-input mt-1">
                        </div>
                    </div>
                    <div>
                        <label class="ds-label">메모</label>
                        <textarea id="colNotes" rows="2" placeholder="독촉 내용..." class="w-full ds-input mt-1"></textarea>
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button onclick="saveCollectionLog()" class="ds-btn ds-btn-primary flex-1">등록</button>
                        <button onclick="closeCollectionModal()" class="ds-btn ds-btn-secondary flex-1">취소</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ===== 매입 지급 수정 모달 ===== -->
        <div id="pPaymentEditModal" class="ds-modal-overlay hidden">
          <div class="ds-modal" style="max-width:448px">
            <h3 class="text-lg font-bold mb-4">매입 지급 수정</h3>
            <input type="hidden" id="pEditPaymentId">
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">지급일</label>
                <input type="text" id="pEditPaymentDate" class="js-fp ds-input" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">금액</label>
                <input type="text" inputmode="numeric" data-money id="pEditPaymentAmount" class="ds-input">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">지급방법</label>
                <select id="pEditPaymentMethod" class="ds-input">
                  <option value="계좌이체">계좌이체</option>
                  <option value="현금">현금</option>
                  <option value="어음">어음</option>
                  <option value="카드">카드</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">참조번호</label>
                <input type="text" id="pEditPaymentRef" class="ds-input">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <input type="text" id="pEditPaymentNotes" class="ds-input">
              </div>
            </div>
            <div class="mt-4 flex gap-2">
              <button onclick="savePurchasePaymentEdit()" class="ds-btn ds-btn-primary flex-1">저장</button>
              <button onclick="document.getElementById('pPaymentEditModal').classList.add('hidden')" class="ds-btn ds-btn-secondary">취소</button>
            </div>
          </div>
        </div>

        <!-- ===== 원장 알림 발송 모달 ===== -->
        <div id="ledgerSendModal" class="ds-modal-overlay hidden" style="z-index:60">
          <div class="ds-modal" style="max-width:550px">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-paper-plane text-blue-600 mr-2"></i>원장 알림 발송</h3>
              <button onclick="closeLedgerSendModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="space-y-4">
              <!-- 채널 선택 (토글 버튼) -->
              <div class="flex gap-2">
                <button onclick="setLedgerChannel('alimtalk')" id="ledgerChAlimtalk" class="flex-1 px-3 py-2 text-sm rounded-lg border-2 border-gray-200 text-gray-600">
                  <i class="fas fa-comment-dots mr-1"></i>카카오톡
                </button>
                <button onclick="setLedgerChannel('sms')" id="ledgerChSms" class="flex-1 px-3 py-2 text-sm rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 font-medium">
                  <i class="fas fa-sms mr-1"></i>문자
                </button>
                <button onclick="setLedgerChannel('email')" id="ledgerChEmail" class="flex-1 px-3 py-2 text-sm rounded-lg border-2 border-gray-200 text-gray-600">
                  <i class="fas fa-envelope mr-1"></i>이메일
                </button>
              </div>

              <!-- 수신자 -->
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">수신자</label>
                <input type="text" id="ledgerSendName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50" readonly>
              </div>

              <!-- 수신번호 (문자/카카오톡) -->
              <div id="ledgerPhoneRow">
                <label class="text-sm font-semibold text-gray-700 mb-1 block">수신번호</label>
                <input type="text" id="ledgerSendMobile" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="010-0000-0000">
                <div id="ledgerNoMobile" class="hidden text-xs text-amber-600 mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>거래처에 연락처가 등록되지 않았습니다. 직접 입력해주세요.</div>
              </div>

              <!-- 이메일 (이메일 채널) -->
              <div id="ledgerEmailRow" class="hidden">
                <label class="text-sm font-semibold text-gray-700 mb-1 block">이메일</label>
                <input type="email" id="ledgerSendEmail" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="example@email.com">
                <div id="ledgerNoEmail" class="hidden text-xs text-amber-600 mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>거래처에 이메일이 등록되지 않았습니다. 직접 입력해주세요.</div>
              </div>

              <!-- 알림톡 템플릿 (카카오톡 채널) -->
              <div id="ledgerAlimtalkArea" class="hidden">
                <label class="text-sm font-semibold text-gray-700 mb-1 block">템플릿</label>
                <select id="ledgerTemplateCode" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">직접 작성 (템플릿 없이)</option>
                </select>
              </div>

              <!-- 제목 (문자 LMS) -->
              <div id="ledgerSmsArea">
                <label class="text-sm font-semibold text-gray-700 mb-1 block">제목 <span class="text-xs text-gray-400">(입력 시 LMS)</span></label>
                <input type="text" id="ledgerSmsSubject" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="제목 (선택)">
              </div>

              <!-- 메시지 내용 -->
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">메시지 내용</label>
                <textarea id="ledgerSendContent" rows="6" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></textarea>
                <p class="text-xs text-gray-400 mt-1">포털 링크가 자동으로 추가됩니다 (7일간 유효)</p>
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-6">
              <button onclick="closeLedgerSendModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
              <button onclick="sendLedgerNotification()" class="ds-btn ds-btn-primary">
                <i class="fas fa-paper-plane mr-1"></i>발송
              </button>
            </div>
          </div>
        </div>

        <!-- ===== 원장 팩스 발송 모달 ===== -->
        <div id="ledgerFaxModal" class="ds-modal-overlay hidden" style="z-index:60">
          <div class="ds-modal" style="max-width:400px">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-fax text-blue-600 mr-2"></i>원장 팩스 발송</h3>
              <button onclick="closeLedgerFaxModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="space-y-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">수신 팩스번호 <span class="text-red-500">*</span></label>
                <input type="text" id="ledgerFaxNum" placeholder="042-000-0000" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">수신자명</label>
                <input type="text" id="ledgerFaxName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div id="ledgerFaxStatus" class="text-xs text-gray-500"></div>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button onclick="closeLedgerFaxModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
              <button onclick="sendLedgerFax()" id="ledgerFaxSendBtn" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-paper-plane mr-1"></i>발송</button>
            </div>
          </div>
        </div>

        <!-- 인쇄용 영역 -->
        <div id="ledgerPrintArea" style="display:none"></div>
    `,
    pageScript: ledgerScript
  })
}
