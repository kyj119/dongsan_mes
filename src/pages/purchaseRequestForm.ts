import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/purchaseRequestForm.js?raw'

export function purchaseRequestFormPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '발주 요청 작성',
    activePage: '/purchase-requests',
    pageCSS: `
      .pr-item-dd { position:absolute; z-index:50; background:white; border:1px solid #d1d5db; border-radius:0.5rem; max-height:200px; overflow-y:auto; width:100%; box-shadow:0 4px 12px rgba(0,0,0,.12); top:100%; left:0; margin-top:2px; }
      .pr-item-dd-entry { padding:8px 12px; cursor:pointer; font-size:13px; }
      .pr-item-dd-entry:hover { background:#eff6ff; }
      .pr-supplier-dd { position:absolute; z-index:50; background:white; border:1px solid #d1d5db; border-radius:0.5rem; max-height:200px; overflow-y:auto; width:100%; box-shadow:0 4px 12px rgba(0,0,0,.12); top:100%; left:0; margin-top:2px; }
      .pr-supplier-dd-entry { padding:8px 12px; cursor:pointer; font-size:13px; }
      .pr-supplier-dd-entry:hover { background:#eff6ff; }
    `,
    pageContent: `
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-bold mb-6" id="prFormTitle">
            <i class="fas fa-clipboard-list text-blue-600 mr-2"></i>발주 요청 작성
          </h2>

          <!-- 기본 정보 -->
          <div class="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">공급업체 <span class="text-gray-400 text-xs font-normal">(선택)</span></label>
              <div style="position:relative;">
                <input type="text" id="prSupplierSearch" placeholder="공급업체명 검색..."
                  class="w-full px-3 py-2 border rounded-lg text-sm" autocomplete="off"
                  oninput="onPRSupplierInput()" onblur="hidePRSupplierDd()">
                <input type="hidden" id="prSupplierId">
                <div id="prSupplierDd" class="pr-supplier-dd hidden"></div>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">긴급도 <span class="text-red-500">*</span></label>
              <select id="prUrgency" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="LOW">낮음 (LOW)</option>
                <option value="NORMAL" selected>보통 (NORMAL)</option>
                <option value="HIGH">높음 (HIGH)</option>
                <option value="URGENT">긴급 (URGENT)</option>
              </select>
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">요청 사유</label>
              <textarea id="prReason" rows="2" placeholder="발주 요청 사유를 입력하세요..."
                class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">비고</label>
              <textarea id="prNotes" rows="2" placeholder="비고..."
                class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>
          </div>

          <!-- 품목 테이블 -->
          <div class="mb-4">
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-sm font-medium text-gray-700">요청 품목</h3>
              <button type="button" onclick="prAddItemRow()"
                class="px-3 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 text-sm">
                <i class="fas fa-plus mr-1"></i>품목 추가
              </button>
            </div>
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full text-sm ds-table-striped">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-2 py-2 text-left">품목명</th>
                    <th class="px-2 py-2 text-center w-20">수량</th>
                    <th class="px-2 py-2 text-center w-24">단위</th>
                    <th class="px-2 py-2 text-right w-28">예상 단가</th>
                    <th class="px-2 py-2 text-right w-28">예상 금액</th>
                    <th class="px-2 py-2 text-left">비고</th>
                    <th class="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody id="prItemsBody">
                  <tr id="prItemsEmptyRow">
                    <td colspan="7" class="px-4 py-10 text-center">
                      <div class="flex flex-col items-center gap-2 text-gray-400">
                        <i class="fas fa-box-open text-3xl text-gray-300"></i>
                        <div class="text-sm font-medium text-gray-500">품목을 추가해주세요</div>
                        <div class="text-xs text-gray-400">검색 후 추가하거나 위의 "품목 추가" 버튼을 사용하세요</div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 합계 -->
          <div class="flex justify-end mb-6">
            <div class="bg-gray-50 rounded-lg px-6 py-3 text-right">
              <div class="text-sm text-gray-500">총 예상 금액</div>
              <div class="text-xl font-bold" id="prTotalAmount">0원</div>
            </div>
          </div>

          <!-- 버튼 -->
          <div class="flex justify-end gap-3">
            <button type="button" onclick="window.location.href='/purchase-requests'"
              class="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm">취소</button>
            <button type="button" onclick="submitPRRequest()"
              id="prSubmitBtn"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <i class="fas fa-paper-plane mr-1"></i>요청 제출
            </button>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
