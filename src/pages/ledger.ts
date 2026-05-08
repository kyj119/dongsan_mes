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
      .client-row:hover{background:#fff7ed}
      .client-row.active{background:#fed7aa}
      .payment-edit-modal{display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.5);justify-content:center;align-items:center}
      .payment-edit-modal.show{display:flex}
      #adjustmentModal.show{display:flex!important}
      .aging-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500}
      .aging-normal{background:#dcfce7;color:#15803d}
      .aging-warning{background:#fef9c3;color:#a16207}
      .aging-danger{background:#ffedd5;color:#c2410c}
      .aging-critical{background:#fee2e2;color:#b91c1c}
      #clientDetailModal .modal-body{overflow-y:auto;max-height:calc(100vh - 72px)}
      #clientDetailModal .modal-header{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 24px;z-index:10}
      #clientDetailModal .ds-table td{font-size:13px}
    `,
    pageContent: `
        <!-- 회계반영 대기 배너 -->
        <div id="billingPendingBanner" class="hidden ds-card mb-4" style="border:2px solid #93c5fd;background:#eff6ff;padding:12px 16px">
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
                    <input type="date" id="startDate" class="px-2 py-1 border rounded text-sm">
                    <span class="text-gray-400">~</span>
                    <input type="date" id="endDate" class="px-2 py-1 border rounded text-sm">
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
                <div class="ds-card ds-card-compact" style="border-left:3px solid #facc15">
                    <div class="ds-label mb-1"><i class="fas fa-clock text-yellow-500 mr-1"></i>30일+ 연체</div>
                    <div class="text-lg font-bold text-yellow-600 tabular-nums text-right" id="agingOver30">-</div>
                </div>
                <div class="ds-card ds-card-compact" style="border-left:3px solid #ef4444">
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
                <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                    <table class="ds-table ds-table-compact ds-table-striped">
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

        <!-- ===== 거래처 상세 모달 (은행 거래내역 스타일) ===== -->
        <div id="clientDetailModal" class="hidden" style="position:fixed;inset:0;z-index:50">
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.3)" onclick="closeDetailModal()"></div>
            <div style="position:relative;background:#fff;max-width:1000px;margin:16px auto;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.15);display:flex;flex-direction:column;max-height:calc(100vh - 32px)">

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
                                <input type="date" id="paymentDate" class="ds-input" style="width:140px">
                                <select id="paymentMethod" class="ds-input" style="width:100px">
                                    <option value="">방법</option>
                                    <option value="계좌이체">계좌이체</option>
                                    <option value="현금">현금</option>
                                    <option value="카드">카드</option>
                                    <option value="수표">수표</option>
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
                                    <button onclick="openCollectionModal()" class="ds-btn ds-btn-ghost ds-btn-sm text-purple-600" title="독촉 등록">
                                        <i class="fas fa-phone-alt mr-1"></i>독촉
                                    </button>
                                    <button onclick="openLedgerSendModal(modalContext.clientId, modalContext.clientName, 0, 'email')" class="ds-btn ds-btn-ghost ds-btn-sm text-blue-600" title="알림 발송">
                                        <i class="fas fa-paper-plane mr-1"></i>발송
                                    </button>
                                    <button onclick="exportTransactionsCSV()" class="ds-btn ds-btn-ghost ds-btn-sm" title="CSV 내보내기">
                                        <i class="fas fa-file-csv"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="overflow-x-auto" style="max-height:calc(100vh - 320px);overflow-y:auto">
                                <table class="ds-table ds-table-compact ds-table-striped">
                                    <thead>
                                        <tr>
                                            <th class="text-left" style="width:90px">일자</th>
                                            <th class="text-center" style="width:70px">구분</th>
                                            <th class="text-left">내용</th>
                                            <th class="text-right" style="width:110px">매출(+)</th>
                                            <th class="text-right" style="width:110px">입금(-)</th>
                                            <th class="text-right" style="width:110px">잔액</th>
                                            <th class="text-center" style="width:50px"></th>
                                        </tr>
                                    </thead>
                                    <tbody id="transactionsTableBody" class="divide-y"></tbody>
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
                                <input type="date" id="pPaymentDate" class="ds-input" style="width:140px">
                                <select id="pPaymentMethod" class="ds-input" style="width:100px">
                                    <option value="">방법</option>
                                    <option value="계좌이체">계좌이체</option>
                                    <option value="현금">현금</option>
                                    <option value="카드">카드</option>
                                    <option value="수표">수표</option>
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
                                <input type="date" id="purchAdjDate" class="ds-input" style="width:140px">
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
                                    <button id="purchIntegrityBtn" onclick="checkPurchaseIntegrity()" class="ds-btn ds-btn-ghost ds-btn-sm text-blue-600">
                                        <i class="fas fa-shield-alt mr-1"></i>정합성
                                    </button>
                                    <button onclick="exportPurchaseTransactionsCSV()" class="ds-btn ds-btn-ghost ds-btn-sm">
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
                                            <th class="text-left" style="width:90px">일자</th>
                                            <th class="text-center" style="width:70px">구분</th>
                                            <th class="text-left">내용</th>
                                            <th class="text-right" style="width:110px">매입(+)</th>
                                            <th class="text-right" style="width:110px">지급(-)</th>
                                            <th class="text-right" style="width:110px">잔액</th>
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
        <div id="paymentEditModal" class="payment-edit-modal">
            <div class="ds-modal" style="max-width:448px">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-gray-700"><i class="fas fa-edit mr-2"></i>입금 수정</h3>
                    <button onclick="closePaymentModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
                </div>
                <input type="hidden" id="editPaymentId">
                <div class="space-y-3">
                    <div>
                        <label class="ds-label">입금액</label>
                        <input type="text" inputmode="numeric" data-money id="editAmount" class="w-full ds-input">
                    </div>
                    <div>
                        <label class="ds-label">입금일</label>
                        <input type="date" id="editDate" class="w-full ds-input">
                    </div>
                    <div>
                        <label class="ds-label">입금방법</label>
                        <select id="editMethod" class="w-full ds-input">
                            <option value="">선택</option>
                            <option value="계좌이체">계좌이체</option>
                            <option value="현금">현금</option>
                            <option value="카드">카드</option>
                            <option value="수표">수표</option>
                            <option value="기타">기타</option>
                        </select>
                    </div>
                    <div>
                        <label class="ds-label">참조번호</label>
                        <input type="text" id="editRef" class="w-full ds-input">
                    </div>
                    <div>
                        <label class="ds-label">메모</label>
                        <input type="text" id="editNotes" class="w-full ds-input">
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button onclick="savePaymentEdit()" class="ds-btn ds-btn-primary flex-1" style="background:var(--c-warning)">저장</button>
                        <button onclick="closePaymentModal()" class="ds-btn ds-btn-secondary flex-1">취소</button>
                    </div>
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
                    <h3 class="font-bold text-gray-700"><i class="fas fa-phone-alt text-purple-500 mr-2"></i>독촉 이력 등록</h3>
                    <button onclick="closeCollectionModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
                </div>
                <div class="space-y-3">
                    <div>
                        <label class="ds-label">연락일</label>
                        <input type="date" id="colDate" class="w-full ds-input mt-1">
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
                            <input type="date" id="colPromisedDate" class="w-full ds-input mt-1">
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
                        <button onclick="saveCollectionLog()" class="ds-btn ds-btn-primary flex-1" style="background:#7c3aed">등록</button>
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
                <input type="date" id="pEditPaymentDate" class="ds-input">
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
        <div id="ledgerSendModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50" style="z-index:60">
          <div class="bg-white rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-y-auto p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-paper-plane text-blue-600 mr-2"></i>원장 알림 발송</h3>
              <button onclick="closeLedgerSendModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">수신자</label>
                <input type="text" id="ledgerSendName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50" readonly>
              </div>
              <div id="ledgerPhoneRow">
                <label class="text-sm font-semibold text-gray-700 mb-1 block">수신번호</label>
                <input type="text" id="ledgerSendMobile" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="010-0000-0000">
                <div id="ledgerNoMobile" class="hidden text-xs text-amber-600 mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>거래처에 연락처가 등록되지 않았습니다. 직접 입력해주세요.</div>
              </div>
              <div id="ledgerEmailRow" class="hidden">
                <label class="text-sm font-semibold text-gray-700 mb-1 block">이메일</label>
                <input type="email" id="ledgerSendEmail" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="example@email.com">
                <div id="ledgerNoEmail" class="hidden text-xs text-amber-600 mt-1"><i class="fas fa-exclamation-triangle mr-1"></i>거래처에 이메일이 등록되지 않았습니다. 직접 입력해주세요.</div>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">발송 채널</label>
                <select id="ledgerSendChannel" onchange="toggleLedgerChannelFields()" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="sms">문자 (SMS/LMS)</option>
                  <option value="alimtalk">카카오톡</option>
                  <option value="email">이메일</option>
                </select>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">카카오톡 템플릿 <span class="text-xs text-gray-400">(카카오톡 선택 시)</span></label>
                <select id="ledgerTemplateCode" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">직접 작성 (템플릿 없이)</option>
                </select>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">제목 <span class="text-xs text-gray-400">(문자 LMS용)</span></label>
                <input type="text" id="ledgerSmsSubject" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="제목 (선택, 입력 시 LMS)">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">메시지 내용</label>
                <textarea id="ledgerSendContent" rows="8" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></textarea>
                <p class="text-xs text-gray-400 mt-1">포털 링크가 자동으로 추가됩니다 (7일간 유효)</p>
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-6">
              <button onclick="closeLedgerSendModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
              <button onclick="sendLedgerNotification()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-paper-plane mr-1"></i>발송</button>
            </div>
          </div>
        </div>
    `,
    pageScript: ledgerScript
  })
}
