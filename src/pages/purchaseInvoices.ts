import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/purchaseInvoices.js?raw'

export function purchaseInvoicesPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '매입확정',
    activePage: '/purchase-invoices',
    pageContent: `
      <div class="flex border-b mb-6 bg-white rounded-t-lg shadow-sm px-2">
        <button id="tabPending" onclick="switchInvTab('pending')"
          class="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
          <i class="fas fa-clock mr-1"></i>확정 대기
        </button>
        <button id="tabInvoices" onclick="switchInvTab('invoices')"
          class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-file-invoice-dollar mr-1"></i>매입 인보이스
        </button>
      </div>

      <div id="panelPending">
        <div class="ds-card overflow-hidden">
          <table class="ds-table w-full">
            <thead><tr>
              <th class="col-code">발주번호</th><th class="col-name">거래처</th><th class="col-date text-center">발주일</th>
              <th class="col-qty text-center">미정 품목</th><th class="col-qty text-center">입고수량</th><th class="col-action text-center">처리</th>
            </tr></thead>
            <tbody id="pendingBody"></tbody>
          </table>
        </div>
        <p class="text-xs text-gray-400 mt-2">※ 발주 시 '단가미정'으로 입력하고 입고된 품목이 여기 표시됩니다. 거래명세서를 보고 실단가를 확정하세요.</p>
      </div>

      <div id="panelInvoices" class="hidden">
        <div class="flex items-center gap-2 mb-3">
          <select id="invMatchFilter" onchange="loadInvoices(1)" class="border rounded px-2 py-1 text-sm" title="매칭상태">
            <option value="">전체 매칭상태</option>
            <option value="MATCHED">정상</option>
            <option value="PRICE_VARIANCE">단가차이</option>
            <option value="QUANTITY_VARIANCE">수량차이</option>
            <option value="UNMATCHED">미매칭</option>
            <option value="DISPUTED">분쟁</option>
          </select>
        </div>
        <div id="pinvFilterChips" class="ds-conds mb-2"></div>
        <div id="pinvListToolbar"></div>
        <div class="ds-card overflow-hidden">
          <table class="ds-table w-full pinv-tbl">
            <thead><tr>
              <!-- data-col = '열 선택'(dsListToolbar) 대상 -->
              <th class="col-code" data-col="invoice_number">인보이스번호</th><th class="col-name" data-col="supplier">거래처</th><th class="col-code" data-col="po">발주</th><th class="col-date text-center" data-col="invoice_date">일자</th>
              <th class="col-amount text-right" data-col="amount">금액</th><th class="col-status text-center" data-col="match">매칭</th><th class="col-status text-center" data-col="payment">지급</th>
            </tr></thead>
            <tbody id="invoicesBody"></tbody>
          </table>
        </div>
        <div id="pinvSummaryBar" class="ds-summary"></div>
        <div id="invoicesPagination" class="flex items-center justify-end gap-2 mt-3"></div>
      </div>

      <!-- 매입확정 모달 -->
      <div id="confirmModal" class="hidden fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div class="px-5 py-3 border-b flex items-center justify-between">
            <h3 class="font-bold text-lg">매입확정 — <span id="confirmPoNumber"></span></h3>
            <button onclick="closeConfirmModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="p-5">
            <div class="mb-3 text-sm text-gray-600">거래처: <span id="confirmSupplier" class="font-medium text-gray-800"></span></div>
            <div class="mb-3 p-2 bg-gray-50 rounded"><span class="text-xs text-gray-500 mr-2">거래명세서:</span><span id="confirmStatements"></span></div>
            <table class="w-full text-sm mb-4">
              <thead class="bg-gray-50"><tr>
                <th class="px-3 py-2 text-left">품목</th><th class="px-3 py-2 text-center">입고수량</th>
                <th class="px-3 py-2 text-right">참고</th><th class="px-3 py-2 text-left">실단가</th>
              </tr></thead>
              <tbody id="confirmItemsBody"></tbody>
            </table>
            <div class="flex items-center gap-4 mb-4">
              <label class="text-sm text-gray-600">매입일자 <input type="text" id="confirmInvoiceDate" class="js-fp border rounded px-2 py-1 ml-1" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15"></label>
              <div class="ml-auto text-sm">합계: <span id="confirmTotal" class="font-bold text-blue-700">0</span></div>
            </div>
            <div class="flex justify-end gap-2">
              <button onclick="closeConfirmModal()" class="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">취소</button>
              <button onclick="submitConfirm()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">매입확정</button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
