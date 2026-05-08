import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/quotationForm.js?raw'

export function quotationFormPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '견적서 작성',
    activePage: '/quotations',
    pageCSS: `
      .item-dd { position:absolute; z-index:50; background:white; border:1px solid #d1d5db; border-radius:0.5rem; max-height:220px; overflow-y:auto; width:100%; box-shadow:0 4px 12px rgba(0,0,0,.12); top:100%; left:0; margin-top:2px; }
      .item-dd-entry:hover { background:#eff6ff; }
      .client-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; display:flex; align-items:center; justify-content:center; }
      .client-modal { background:white; border-radius:0.75rem; width:90%; max-width:500px; max-height:80vh; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
      .client-modal-row { padding:10px 16px; cursor:pointer; border-bottom:1px solid #f3f4f6; }
      .client-modal-row:hover { background:#eff6ff; }
    `,
    pageContent: `
      <div class="max-w-5xl mx-auto">
        <div class="bg-white rounded-lg shadow-lg p-6">
          <form id="quotationForm">

            <!-- 기본 정보 -->
            <div class="mb-6">
              <h2 class="text-xl font-bold text-gray-800 mb-4 border-b pb-2">
                <i class="fas fa-info-circle mr-2"></i>기본 정보
              </h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div style="position:relative">
                  <label class="block text-sm font-medium text-gray-700 mb-2">거래처 <span class="text-red-500">*</span></label>
                  <input type="text" id="clientSearch" placeholder="거래처명 입력 후 Enter" autocomplete="off"
                    onkeydown="handleClientEnter(event)"
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500">
                  <input type="hidden" id="clientId">
                  <div id="clientModal"></div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">유효기한 <span class="text-red-500">*</span></label>
                  <input type="date" id="validUntil" required
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500">
                </div>
              </div>
            </div>

            <!-- 견적 품목 -->
            <div class="mb-6">
              <div class="flex justify-between items-center mb-4 border-b pb-2">
                <h2 class="text-xl font-bold text-gray-800"><i class="fas fa-box mr-2"></i>견적 품목</h2>
                <button type="button" id="addItemBtn" class="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600">
                  <i class="fas fa-plus mr-2"></i>품목 추가
                </button>
              </div>
              <div id="itemsContainer"></div>

              <!-- 합계 -->
              <div class="mt-6 pt-6 border-t">
                <div class="flex flex-wrap justify-end items-center gap-6 text-sm md:text-base">
                  <div><span class="font-medium text-gray-700">공급가액:</span> <span id="totalAmount" class="ml-1 font-bold text-blue-600">0</span>원</div>
                  <div><span class="font-medium text-gray-700">부가세:</span> <span id="totalVat" class="ml-1 font-bold text-blue-600">0</span>원</div>
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-700">할인:</span>
                    <input type="text" inputmode="numeric" data-money id="discountAmount" value="0"
                      class="w-28 px-3 py-1 border border-gray-300 rounded text-right text-sm" oninput="calculateTotal()">
                    <span>원</span>
                  </div>
                  <div class="text-lg">
                    <span class="font-bold text-gray-800">최종금액:</span>
                    <span id="grandTotal" class="ml-2 font-bold text-red-600">0</span>원
                  </div>
                </div>
              </div>
            </div>

            <!-- 비고 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2">비고</label>
              <textarea id="notes" rows="3"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                placeholder="특이사항을 입력하세요"></textarea>
            </div>

            <!-- 버튼 -->
            <div class="flex justify-end space-x-4">
              <button type="button" onclick="history.back()" class="px-6 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100">
                <i class="fas fa-times mr-2"></i>취소
              </button>
              <button type="submit" id="submitBtn" class="px-6 py-2 bg-teal-500 text-white rounded hover:bg-teal-600">
                <i class="fas fa-save mr-2"></i>저장
              </button>
            </div>
          </form>
        </div>
      </div>
    `,
    pageScript
  })
}
