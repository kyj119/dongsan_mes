import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/purchaseOrderForm.js?raw'

export function purchaseOrderFormPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '발주 등록',
    activePage: '/purchase-orders',
    pageCSS: `
      .po-dropdown { position:absolute; z-index:50; background:var(--c-surface); border:1px solid var(--c-border); border-radius:0.5rem; max-height:240px; overflow-y:auto; min-width:340px; width:max-content; box-shadow:0 4px 12px rgba(0,0,0,.1); top:100%; left:0; margin-top:4px; }
      .po-dropdown-item { padding:8px 12px; cursor:pointer; font-size:13px; transition:background .1s; border-bottom:1px solid var(--c-border-light); }
      .po-dropdown-item:last-child { border-bottom:none; }
      .po-dropdown-item:hover { background:var(--c-primary-light); }
      .po-dropdown-item.active { background:var(--c-info-light); }
      .overlay-bg { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; display:flex; align-items:center; justify-content:center; }
      .modal-box { background:var(--c-surface); border-radius:0.75rem; width:90%; max-width:500px; max-height:80vh; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
      .modal-list-item { padding:10px 16px; cursor:pointer; border-bottom:1px solid var(--c-border-light); transition:background .1s; }
      .modal-list-item:hover { background:var(--c-primary-light); }
      .item-row-animate { animation: fadeIn .2s ease; }
      @keyframes fadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
      .po-item-table input[type="text"], .po-item-table input[type="number"] { border:1px solid var(--c-border); border-radius:0.375rem; padding:6px 8px; font-size:13px; width:100%; }
      .po-item-table input:focus { outline:none; ring:2px; border-color:var(--c-primary); box-shadow:0 0 0 2px rgba(59,130,246,.2); }
      .po-item-table input[readonly] { background:var(--c-surface-secondary); cursor:default; }
      .po-item-table td { padding:6px 8px; vertical-align:middle; }
    `,
    pageContent: `
      <div class="max-w-4xl mx-auto space-y-6">

        <!-- ─── 상단 헤더 ─── -->
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2" id="formTitle">
            <i class="fas fa-shopping-cart text-blue-600"></i>
            새 발주서
          </h2>
          <div class="flex items-center gap-2">
            <button onclick="openTemplateModal()" class="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded-lg text-sm hover:bg-gray-50 font-medium">
              <i class="fas fa-file-alt mr-1"></i>템플릿 불러오기
            </button>
            <a href="/purchase-orders" class="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-sm">
              <i class="fas fa-arrow-left mr-1"></i>목록으로
            </a>
          </div>
        </div>

        <!-- ─── 기본 정보 카드 ─── -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <h3 class="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <i class="fas fa-file-alt text-gray-500"></i>
            기본 정보
          </h3>
          <div id="templateModal"></div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">공급업체 <span class="text-red-500">*</span></label>
              <div class="flex items-start gap-2">
                <div class="relative flex-1">
                  <input type="text" id="supplierSearch" placeholder="업체명 입력 후 Enter 또는 검색 결과 선택"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    onkeydown="handleSupplierEnter(event)" oninput="debounceSupplierSearch()" autocomplete="off">
                  <input type="hidden" id="supplierId">
                  <div id="supplierDropdown" class="po-dropdown hidden"></div>
                </div>
                <button id="poRecentBtn" onclick="openRecentPOModal()" class="border border-gray-300 bg-white text-gray-700 rounded px-3 py-2 text-sm hover:bg-gray-50 whitespace-nowrap">
                  <i class="fas fa-history mr-1 text-gray-500"></i>최근 발주
                </button>
              </div>
              <div id="recentPOModal"></div>
              <!-- 자주 품목 칩 -->
              <div id="poFreqItems" class="flex flex-wrap gap-1 mt-2 hidden">
                <span class="text-xs text-gray-400 mr-1 self-center">자주 품목:</span>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">발주일 <span class="text-red-500">*</span></label>
                <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="orderDate" class="js-fp w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">납품 요청일</label>
                <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="expectedDate" class="js-fp w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1">납품 장소</label>
              <input type="text" id="deliveryLocation" placeholder="납품 장소 입력"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            </div>
          </div>
        </div>

        <!-- ─── 발주 품목 카드 ─── -->
        <div class="bg-white rounded-lg border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <i class="fas fa-box text-gray-500"></i>
              발주 품목
              <span id="itemCountBadge" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">0개</span>
            </h3>
            <div class="flex items-center gap-2">
              <select id="zoneFilter" onchange="filterItemsByZone()" class="px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 focus:ring-2 focus:ring-blue-500">
                <option value="">전체 구역</option>
              </select>
              <button onclick="showGroupAddModal()" class="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded-lg text-sm hover:bg-gray-50">
                <i class="fas fa-th-large mr-1"></i>그룹 추가
              </button>
              <button onclick="addItemRow()" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium">
                <i class="fas fa-plus mr-1"></i>품목 추가
              </button>
            </div>
          </div>

          <div style="overflow:visible">
            <table class="w-full text-sm po-item-table ds-table-striped">
              <thead>
                <tr class="bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wider">
                  <th class="px-2 py-2.5 text-left" style="width:24%">품목명</th>
                  <th class="px-2 py-2.5 text-left" style="width:14%">규격</th>
                  <th class="px-2 py-2.5 text-center" style="width:8%">수량</th>
                  <th class="px-2 py-2.5 text-center" style="width:6%">단위</th>
                  <th class="px-2 py-2.5 text-right" style="width:13%">단가</th>
                  <th class="px-2 py-2.5 text-right" style="width:13%">금액</th>
                  <th class="px-2 py-2.5 text-center" style="width:4%">VAT</th>
                  <th class="px-2 py-2.5 text-left" style="width:14%">비고</th>
                  <th class="px-2 py-2.5 text-center" style="width:4%"></th>
                </tr>
              </thead>
              <tbody id="itemsBody"></tbody>
            </table>
          </div>

          <!-- 빈 상태 -->
          <div id="emptyItemsMsg" class="hidden text-center py-8">
            <i class="fas fa-box text-3xl mb-2 block text-gray-300"></i>
            <p class="text-gray-400 text-sm mb-2">발주할 품목이 없습니다</p>
            <button onclick="addItemRow()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium">+ 첫 품목 추가</button>
          </div>
        </div>

        <!-- ─── 합계 + 비고 ─── -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">

          <!-- 비고 -->
          <div class="md:col-span-2 space-y-4">
            <div class="bg-white rounded-lg border border-gray-200 p-5">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">비고 (공급업체 전달)</label>
                  <textarea id="notes" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="공급업체에 전달할 사항"></textarea>
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">내부 메모</label>
                  <textarea id="internalNotes" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="내부 참고 사항 (인쇄 시 미포함)"></textarea>
                </div>
              </div>
            </div>
          </div>

          <!-- 합계 영역 -->
          <div class="bg-white rounded-lg border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">금액 합계</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between items-center py-1">
                <span class="text-gray-500">소계</span>
                <span class="text-gray-900 font-medium" id="totalAmount">0원</span>
              </div>
              <div class="flex justify-between items-center py-1">
                <span class="text-gray-500">부가세 (10%)</span>
                <span class="text-gray-900 font-medium" id="vatAmount">0원</span>
              </div>
              <div class="border-t border-gray-200 pt-2 mt-2">
                <div class="flex justify-between items-center">
                  <span class="text-gray-900 font-bold text-base">합계</span>
                  <span class="text-blue-600 font-bold text-xl" id="finalAmount">0원</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ─── 하단 버튼 ─── -->
        <div class="flex items-center justify-between">
          <button onclick="saveAsTemplate()" class="px-3 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm font-medium">
            <i class="fas fa-save mr-1"></i>템플릿으로 저장
          </button>
          <div class="flex items-center gap-3">
            <a href="/purchase-orders" class="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">취소</a>
            <button onclick="savePO('DRAFT')" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm font-medium">임시저장</button>
            <button onclick="savePO('CONFIRMED')" id="confirmBtn" class="ds-btn ds-btn-primary text-sm font-medium">
              <i class="fas fa-check mr-1"></i>발주 확정
            </button>
          </div>
        </div>

      </div>

      <!-- ─── 그룹 품목 추가 모달 ─── -->
      <div id="groupAddModal" class="ds-modal-overlay hidden flex items-center justify-center" onclick="if(event.target===this)closeGroupAddModal()">
        <div class="ds-modal w-full mx-4" style="max-width:28rem">
          <div class="p-4 border-b flex justify-between items-center">
            <h2 class="text-base font-bold text-gray-900">그룹 품목 추가</h2>
            <button onclick="closeGroupAddModal()" class="text-gray-400 hover:text-gray-600 p-1">
              <i class="fas fa-times text-lg"></i>
            </button>
          </div>
          <div class="p-6">
            <div class="mb-4">
              <label class="block text-sm font-semibold text-gray-700 mb-1">그룹 선택</label>
              <select id="groupAddSelect" onchange="loadGroupItems()" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="">그룹을 선택하세요...</option>
              </select>
            </div>
            <div id="groupAddItems" class="mb-4">
              <p class="text-sm text-gray-500 text-center py-4">그룹을 선택하면 폭별 품목이 표시됩니다.</p>
            </div>
            <div class="flex gap-2">
              <button onclick="addGroupItems()" class="flex-1 ds-btn ds-btn-primary text-sm font-medium">선택 품목 추가</button>
              <button onclick="closeGroupAddModal()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">취소</button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
