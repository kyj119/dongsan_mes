import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import accountingScript from '../scripts/accounting.js?raw'

export function accountingPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '회계 허브',
    activePage: '/accounting',
    pageCSS: `
      .acc-kpi{border-left:3px solid;border-radius:8px}
      .acc-tab{padding:10px 18px;font-size:13px;font-weight:600;border-bottom:2px solid transparent;color:#6b7280;white-space:nowrap}
      .acc-tab.active{border-color:#2563eb;color:#2563eb}
      .acc-tab.disabled{color:#cbd5e1;cursor:not-allowed}
      .acc-row{transition:background .15s}
      .acc-row:hover{background:#f8fafc}
      .pm-badge{display:inline-block;padding:1px 8px;border-radius:9999px;font-size:11px;font-weight:600}
    `,
    pageContent: `
      <!-- ===== 요약 KPI 바 ===== -->
      <div class="ds-card ds-card-compact mb-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-medium text-gray-500"><i class="fas fa-calendar-alt mr-1"></i>기간</span>
          <input type="date" id="accStart" class="ds-input" style="width:140px;font-size:12px" onchange="accReload()">
          <span class="text-gray-300">~</span>
          <input type="date" id="accEnd" class="ds-input" style="width:140px;font-size:12px" onchange="accReload()">
          <div class="flex gap-1 ml-1">
            <button onclick="accSetPeriod('thisMonth')" class="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">이번달</button>
            <button onclick="accSetPeriod('lastMonth')" class="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">지난달</button>
            <button onclick="accSetPeriod('thisYear')" class="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">올해</button>
          </div>
          <button id="accCsvBtn" onclick="accExportCsv()" class="ds-btn ds-btn-secondary ds-btn-sm ml-auto" title="현재 탭의 필터 결과를 CSV로 내보냅니다"><i class="fas fa-file-csv mr-1"></i>CSV</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div class="acc-kpi ds-card-compact bg-blue-50/40" style="border-color:#3b82f6;padding:12px 14px">
            <div class="ds-label mb-1"><i class="fas fa-arrow-down text-blue-500 mr-1"></i>수입 (기간 매출)</div>
            <div class="text-2xl font-bold text-blue-700 tabular-nums text-right" id="accKpiRevenue">-</div>
          </div>
          <div class="acc-kpi ds-card-compact bg-red-50/40" style="border-color:#ef4444;padding:12px 14px">
            <div class="ds-label mb-1"><i class="fas fa-arrow-up text-red-500 mr-1"></i>지출 (카드+매입)</div>
            <div class="text-2xl font-bold text-red-600 tabular-nums text-right" id="accKpiExpense">-</div>
            <div class="text-[11px] text-gray-400 text-right mt-0.5" id="accKpiExpenseBreak"></div>
          </div>
          <div class="acc-kpi ds-card-compact bg-amber-50/40" style="border-color:#f59e0b;padding:12px 14px">
            <div class="ds-label mb-1"><i class="fas fa-hand-holding-usd text-amber-500 mr-1"></i>미수금 (현재 전체)</div>
            <div class="text-2xl font-bold text-amber-600 tabular-nums text-right" id="accKpiReceivable">-</div>
            <div class="text-[11px] text-gray-400 text-right mt-0.5">기간 무관 현재 잔액</div>
          </div>
        </div>
      </div>

      <!-- ===== 탭 (Phase 1~4 = 입금·세금계산서·현금영수증·카드·매입·타임라인 전부 활성) ===== -->
      <div class="flex items-center border-b mb-3 overflow-x-auto">
        <button id="accTabPayments" onclick="accSwitchTab('payments')" class="acc-tab active"><i class="fas fa-money-bill-wave mr-1"></i>입금</button>
        <button id="accTabTax" onclick="accSwitchTab('tax')" class="acc-tab"><i class="fas fa-file-invoice mr-1"></i>세금계산서</button>
        <button id="accTabCash" onclick="accSwitchTab('cash')" class="acc-tab"><i class="fas fa-receipt mr-1"></i>현금영수증</button>
        <button id="accTabCard" onclick="accSwitchTab('card')" class="acc-tab"><i class="fas fa-credit-card mr-1"></i>카드</button>
        <button id="accTabPurchase" onclick="accSwitchTab('purchase')" class="acc-tab"><i class="fas fa-file-invoice-dollar mr-1"></i>매입</button>
        <button id="accTabTimeline" onclick="accSwitchTab('timeline')" class="acc-tab"><i class="fas fa-stream mr-1"></i>타임라인</button>
        <button id="accTabInter" onclick="accSwitchTab('inter')" class="acc-tab"><i class="fas fa-exchange-alt mr-1"></i>법인간 거래</button>
      </div>

      <!-- ===== 입금 탭 ===== -->
      <div id="accPaymentsTab">
        <!-- 필터 바 -->
        <div class="ds-card ds-card-compact mb-3">
          <div class="flex flex-wrap items-center gap-3">
            <input type="text" id="accSearch" placeholder="거래처 / 참조번호 / 메모..." class="ds-input" style="width:240px;font-size:12px" onkeydown="if(event.key==='Enter')accSearchNow()">
            <div class="flex items-center gap-1">
              <span class="text-xs text-gray-400">금액</span>
              <input type="text" inputmode="numeric" data-money id="accAmtMin" placeholder="최소" class="ds-input" style="width:110px;font-size:12px">
              <span class="text-gray-300">~</span>
              <input type="text" inputmode="numeric" data-money id="accAmtMax" placeholder="최대" class="ds-input" style="width:110px;font-size:12px">
            </div>
            <button onclick="accSearchNow()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-search mr-1"></i>조회</button>
            <button onclick="accResetFilters()" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">초기화</button>
            <div class="border-l border-gray-200 h-5 mx-1"></div>
            <span class="text-xs text-gray-500">조회 결과 <b id="accResultCount" class="text-gray-700">-</b>건 · 합계 <b id="accResultSum" class="text-blue-700">-</b></span>
          </div>
        </div>

        <!-- 테이블 -->
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 360px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="text-[10px] text-gray-500 uppercase border-b">
                  <th class="px-3 py-2 text-left" style="width:112px">일자</th>
                  <th class="px-3 py-2 text-left">거래처</th>
                  <th class="px-3 py-2 text-right" style="width:120px">금액</th>
                  <th class="px-2 py-2 text-center" style="width:80px">방법</th>
                  <th class="px-3 py-2 text-left" style="width:140px">참조번호</th>
                  <th class="px-3 py-2 text-left">메모</th>
                  <th class="px-3 py-2 text-left" style="width:80px">등록자</th>
                  <th class="px-2 py-2 text-center" style="width:90px">관리</th>
                </tr>
              </thead>
              <tbody id="accPaymentsBody"></tbody>
            </table>
          </div>
          <div id="accPagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- ===== 세금계산서 탭 (조회 — 발행/취소 정정은 /tax-invoices) ===== -->
      <div id="accTaxTab" style="display:none">
        <div class="ds-card ds-card-compact mb-3">
          <div class="flex flex-wrap items-center gap-3">
            <select id="accTaxStatus" onchange="accLoadTax()" class="ds-input" style="width:auto;font-size:12px">
              <option value="">전체 상태</option>
              <option value="DRAFT">작성중</option>
              <option value="ISSUED">발행완료</option>
              <option value="SENT">전송완료</option>
              <option value="NTS_SUCCESS">국세청 전송성공</option>
              <option value="FAILED">전송실패</option>
              <option value="CANCELLED">취소</option>
            </select>
            <input type="text" id="accTaxSearch" placeholder="계산서번호 / 주문 / 거래처..." class="ds-input" style="width:240px;font-size:12px" onkeydown="if(event.key==='Enter')accLoadTax()">
            <button onclick="accLoadTax()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-search mr-1"></i>조회</button>
            <span class="text-xs text-gray-400">상단 기간=작성일 기준</span>
            <a href="/tax-invoices" class="ml-auto text-xs text-blue-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>발행·취소 등 전체 관리</a>
          </div>
        </div>
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 360px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="text-[10px] text-gray-500 uppercase border-b">
                  <th class="px-3 py-2 text-left" style="width:90px">작성일</th>
                  <th class="px-3 py-2 text-left" style="width:150px">계산서번호</th>
                  <th class="px-3 py-2 text-left">거래처</th>
                  <th class="px-3 py-2 text-right" style="width:110px">공급가액</th>
                  <th class="px-3 py-2 text-right" style="width:90px">세액</th>
                  <th class="px-3 py-2 text-right" style="width:120px">합계</th>
                  <th class="px-2 py-2 text-center" style="width:90px">상태</th>
                </tr>
              </thead>
              <tbody id="accTaxBody"></tbody>
            </table>
          </div>
          <div id="accTaxPagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- ===== 현금영수증 탭 (조회 — 발행/취소 정정은 /tax-invoices?tab=cash) ===== -->
      <div id="accCashTab" style="display:none">
        <div class="ds-card ds-card-compact mb-3">
          <div class="flex flex-wrap items-center gap-3">
            <select id="accCashStatus" onchange="accLoadCash()" class="ds-input" style="width:auto;font-size:12px">
              <option value="">전체 상태</option>
              <option value="DRAFT">작성중</option>
              <option value="ISSUED">발행완료</option>
              <option value="CANCELLED">취소</option>
              <option value="FAILED">실패</option>
            </select>
            <input type="text" id="accCashSearch" placeholder="영수증번호 / 거래처 / 식별번호..." class="ds-input" style="width:240px;font-size:12px" onkeydown="if(event.key==='Enter')accLoadCash()">
            <button onclick="accLoadCash()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-search mr-1"></i>조회</button>
            <span class="text-xs text-gray-400">상단 기간=거래일 기준</span>
            <a href="/tax-invoices?tab=cash" class="ml-auto text-xs text-blue-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>발행·취소 등 전체 관리</a>
          </div>
        </div>
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 360px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="text-[10px] text-gray-500 uppercase border-b">
                  <th class="px-3 py-2 text-left" style="width:90px">거래일</th>
                  <th class="px-3 py-2 text-left" style="width:160px">영수증번호</th>
                  <th class="px-3 py-2 text-left">거래처</th>
                  <th class="px-3 py-2 text-left" style="width:130px">식별번호</th>
                  <th class="px-3 py-2 text-right" style="width:120px">합계</th>
                  <th class="px-2 py-2 text-center" style="width:90px">상태</th>
                </tr>
              </thead>
              <tbody id="accCashBody"></tbody>
            </table>
          </div>
          <div id="accCashPagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- ===== 카드 탭 (조회 — 분류/정정은 /card-expenses) ===== -->
      <div id="accCardTab" style="display:none">
        <div class="ds-card ds-card-compact mb-3">
          <div class="flex flex-wrap items-center gap-3">
            <input type="text" id="accCardSearch" placeholder="가맹점..." class="ds-input" style="width:240px;font-size:12px" onkeydown="if(event.key==='Enter')accLoadCard()">
            <button onclick="accLoadCard()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-search mr-1"></i>조회</button>
            <span class="text-xs text-gray-400">상단 기간=거래일 기준</span>
            <span class="text-xs text-gray-500 ml-1">페이지 합계 <b id="accCardSum" class="text-red-600">-</b></span>
            <a href="/card-expenses" class="ml-auto text-xs text-blue-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>분류·정정 등 전체 관리</a>
          </div>
        </div>
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 360px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="text-[10px] text-gray-500 uppercase border-b">
                  <th class="px-3 py-2 text-left" style="width:90px">거래일</th>
                  <th class="px-3 py-2 text-left" style="width:160px">카드</th>
                  <th class="px-3 py-2 text-left">가맹점</th>
                  <th class="px-3 py-2 text-right" style="width:120px">금액</th>
                  <th class="px-3 py-2 text-left" style="width:120px">분류</th>
                  <th class="px-2 py-2 text-center" style="width:90px">상태</th>
                </tr>
              </thead>
              <tbody id="accCardBody"></tbody>
            </table>
          </div>
          <div id="accCardPagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- ===== 매입 탭 (조회 — 매입확정/정정은 /purchase-invoices) ===== -->
      <div id="accPurchaseTab" style="display:none">
        <div class="ds-card ds-card-compact mb-3">
          <div class="flex flex-wrap items-center gap-3">
            <select id="accPurStatus" onchange="accLoadPurchase()" class="ds-input" style="width:auto;font-size:12px">
              <option value="">전체 결제상태</option>
              <option value="UNPAID">미지급</option>
              <option value="PARTIAL">부분지급</option>
              <option value="PAID">지급완료</option>
            </select>
            <input type="text" id="accPurSearch" placeholder="공급처 / 계산서번호..." class="ds-input" style="width:240px;font-size:12px" onkeydown="if(event.key==='Enter')accLoadPurchase()">
            <button onclick="accLoadPurchase()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-search mr-1"></i>조회</button>
            <span class="text-xs text-gray-400">상단 기간=매입일 기준</span>
            <span class="text-xs text-gray-500 ml-1">합계 <b id="accPurSum" class="text-red-600">-</b></span>
            <a href="/purchase-invoices" class="ml-auto text-xs text-blue-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>매입확정·정정 전체 관리</a>
          </div>
        </div>
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 360px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="text-[10px] text-gray-500 uppercase border-b">
                  <th class="px-3 py-2 text-left" style="width:90px">매입일</th>
                  <th class="px-3 py-2 text-left" style="width:150px">계산서번호</th>
                  <th class="px-3 py-2 text-left">공급처</th>
                  <th class="px-3 py-2 text-right" style="width:110px">공급가</th>
                  <th class="px-3 py-2 text-right" style="width:90px">부가세</th>
                  <th class="px-3 py-2 text-right" style="width:120px">합계</th>
                  <th class="px-2 py-2 text-center" style="width:90px">결제</th>
                </tr>
              </thead>
              <tbody id="accPurchaseBody"></tbody>
            </table>
          </div>
          <div id="accPurchasePagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- ===== 통합 타임라인 탭 (수입/지출 단일 목록 — 입금 +, 카드·매입 −) ===== -->
      <div id="accTimelineTab" style="display:none">
        <div class="ds-card ds-card-compact mb-3">
          <div class="flex flex-wrap items-center gap-3">
            <select id="accTlKind" onchange="accLoadTimeline()" class="ds-input" style="width:auto;font-size:12px">
              <option value="">수입+지출 전체</option>
              <option value="income">수입(입금)만</option>
              <option value="expense">지출(카드·매입)만</option>
            </select>
            <span class="text-xs text-gray-400">상단 기간 기준</span>
            <div class="ml-auto flex items-center gap-4 text-xs">
              <span class="text-gray-500">수입 <b id="accTlIncome" class="text-blue-700">-</b></span>
              <span class="text-gray-500">지출 <b id="accTlExpense" class="text-red-600">-</b></span>
              <span class="text-gray-500">순현금 <b id="accTlNet" class="text-gray-800">-</b></span>
            </div>
          </div>
        </div>
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 360px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="text-[10px] text-gray-500 uppercase border-b">
                  <th class="px-3 py-2 text-left" style="width:112px">일자</th>
                  <th class="px-2 py-2 text-center" style="width:70px">구분</th>
                  <th class="px-3 py-2 text-left">거래처 / 가맹점</th>
                  <th class="px-3 py-2 text-left">상세</th>
                  <th class="px-3 py-2 text-right" style="width:140px">금액</th>
                </tr>
              </thead>
              <tbody id="accTimelineBody"></tbody>
            </table>
          </div>
          <div id="accTimelinePagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- ===== 법인간 거래 탭 ===== -->
      <div id="accInterTab" style="display:none">
        <!-- 법인 페어별 잔액 (기간 무관 누적) -->
        <div class="ds-card ds-card-compact mb-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-gray-600"><i class="fas fa-balance-scale mr-1 text-indigo-500"></i>법인간 채권·채무 잔액 <span class="font-normal text-gray-400">(기간 무관 누적)</span></span>
            <button onclick="accIetOpenModal()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-plus mr-1"></i>거래 등록</button>
          </div>
          <div id="accIetSummary" class="flex flex-wrap gap-2"></div>
        </div>
        <!-- 주문·매입 기반 내부거래 채권·채무 (거래처원장에서 이관) -->
        <div class="ds-card ds-card-compact mb-3">
          <div class="text-xs font-semibold text-gray-600 mb-2"><i class="fas fa-file-invoice-dollar mr-1 text-indigo-500"></i>내부거래 채권·채무 <span class="font-normal text-gray-400">(주문·매입 기반 파생 · 거래처원장 대체)</span></div>
          <div id="accIetDerived"></div>
        </div>
        <!-- 필터 -->
        <div class="ds-card ds-card-compact mb-3">
          <div class="flex flex-wrap items-center gap-3">
            <select id="accIetType" onchange="accIetSearchNow()" class="ds-input" style="width:auto;font-size:12px">
              <option value="">전체 유형</option>
              <option value="SUBROGATION">대납</option>
              <option value="LOAN">자금대여</option>
              <option value="REPAYMENT">상환</option>
              <option value="INTERNAL_TRADE">내부거래대금</option>
              <option value="INVOICE_TRANSFER">계산서이전</option>
              <option value="OTHER">기타</option>
            </select>
            <input type="text" id="accIetSearch" placeholder="거래처 / 내용..." class="ds-input" style="width:220px;font-size:12px" onkeydown="if(event.key==='Enter')accIetSearchNow()">
            <button onclick="accIetSearchNow()" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-search mr-1"></i>조회</button>
            <span class="text-xs text-gray-400">상단 기간=거래일 기준</span>
            <span class="text-xs text-gray-500 ml-1">조회 <b id="accIetCount" class="text-gray-700">-</b>건 · 합계 <b id="accIetSum" class="text-indigo-700">-</b></span>
          </div>
        </div>
        <!-- 테이블 -->
        <div class="ds-card" style="padding:0">
          <div class="overflow-x-auto" style="max-height:calc(100vh - 430px);overflow-y:auto">
            <table class="ds-table ds-table-compact">
              <thead class="sticky top-0 bg-white z-10">
                <tr class="text-[10px] text-gray-500 uppercase border-b">
                  <th class="px-3 py-2 text-left" style="width:90px">거래일</th>
                  <th class="px-3 py-2 text-left" style="width:170px">방향 (지급→수혜)</th>
                  <th class="px-2 py-2 text-center" style="width:100px">유형</th>
                  <th class="px-3 py-2 text-right" style="width:120px">금액</th>
                  <th class="px-2 py-2 text-center" style="width:70px">잔액반영</th>
                  <th class="px-3 py-2 text-left" style="width:150px">관련 거래처</th>
                  <th class="px-3 py-2 text-left">내용</th>
                  <th class="px-3 py-2 text-left" style="width:80px">등록자</th>
                  <th class="px-2 py-2 text-center" style="width:80px">관리</th>
                </tr>
              </thead>
              <tbody id="accIetBody"></tbody>
            </table>
          </div>
          <div id="accIetPagination" class="p-3 border-t flex justify-between items-center text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- ===== 법인간 거래 등록/수정 모달 ===== -->
      <div id="accIetModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-6" style="max-width:480px">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-exchange-alt text-indigo-500 mr-2"></i><span id="accIetModalTitle">법인간 거래 등록</span></h3>
            <button onclick="accIetCloseModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <input type="hidden" id="accIetId">
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">거래일 <span class="text-red-500">*</span></label>
                <input type="date" id="accIetDate" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">금액 <span class="text-red-500">*</span></label>
                <input type="text" inputmode="numeric" data-money id="accIetAmount" placeholder="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">지급 법인(from) <span class="text-red-500">*</span></label>
                <select id="accIetFrom" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
                <p class="text-[11px] text-gray-400 mt-1">돈을 낸(가치를 제공한) 쪽</p>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">수혜 법인(to) <span class="text-red-500">*</span></label>
                <select id="accIetTo" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
                <p class="text-[11px] text-gray-400 mt-1">혜택을 받은(갚아야 할) 쪽</p>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">유형 <span class="text-red-500">*</span></label>
                <select id="accIetTypeSel" onchange="accIetTypeChanged()" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="SUBROGATION">대납 (남의 채무를 대신 지급)</option>
                  <option value="LOAN">자금대여</option>
                  <option value="REPAYMENT">상환 (빌린/대납분 갚음)</option>
                  <option value="INTERNAL_TRADE">내부거래대금</option>
                  <option value="INVOICE_TRANSFER">계산서이전 (기록용)</option>
                  <option value="OTHER">기타</option>
                </select>
              </div>
              <div class="flex items-end pb-2">
                <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" id="accIetAffects" checked class="w-4 h-4">
                  법인간 잔액에 반영
                </label>
              </div>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">관련 거래처 <span class="text-gray-400 font-normal">(선택)</span></label>
              <div class="relative">
                <input type="text" id="accIetClientSearch" placeholder="거래처 검색..." class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" autocomplete="off" oninput="accIetClientInput()">
                <input type="hidden" id="accIetClientId">
                <div id="accIetClientDrop" class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden" style="max-height:200px;overflow-y:auto"></div>
              </div>
              <p class="text-[11px] text-gray-400 mt-1">대납 대상 공급처 등. 지우면 연결 해제.</p>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">내용</label>
              <input type="text" id="accIetDesc" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: 서울경금속 3월분 매입대금 대납 (계산서 이전발행)">
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="accIetCloseModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="accIetSave()" class="ds-btn ds-btn-primary"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>

      <!-- ===== 입금 수정 모달 ===== -->
      <div id="accEditModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-6" style="max-width:440px">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-pen text-blue-500 mr-2"></i>입금 내역 수정</h3>
            <button onclick="accCloseEdit()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <input type="hidden" id="accEditId">
          <div class="bg-gray-50 rounded-lg p-3 mb-4 text-sm flex justify-between">
            <span class="text-gray-500">거래처</span>
            <span class="font-medium" id="accEditClient">-</span>
          </div>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">입금일 <span class="text-red-500">*</span></label>
                <input type="date" id="accEditDate" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">금액 <span class="text-red-500">*</span></label>
                <input type="text" inputmode="numeric" data-money id="accEditAmount" placeholder="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">결제 방법</label>
              <select id="accEditMethod" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
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
              <input type="text" id="accEditRef" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="거래내역·전표 번호 등">
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">메모</label>
              <input type="text" id="accEditNotes" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button onclick="accCloseEdit()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="accSaveEdit()" class="ds-btn ds-btn-primary"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>
    `,
    pageScript: accountingScript,
  })
}
