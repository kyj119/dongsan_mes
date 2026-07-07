import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/priceManagement.js?raw'

export function priceManagementPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '단가 관리',
    activePage: '/price-list',
    pageCSS: `
      .pm-tab { padding:10px 20px; font-size:14px; font-weight:500; border-bottom:2px solid transparent; cursor:pointer; color:#6b7280; transition:all 0.15s; }
      .pm-tab.active { border-bottom-color:#2563eb; color:#2563eb; }
      .pm-tab:hover:not(.active) { color:#374151; }
      .client-dd { position:absolute; z-index:50; background:white; border:1px solid #d1d5db; border-radius:0.5rem; max-height:220px; overflow-y:auto; width:100%; box-shadow:0 4px 12px rgba(0,0,0,.12); top:100%; left:0; margin-top:2px; }
      .client-dd-entry { padding:8px 12px; cursor:pointer; font-size:13px; }
      .client-dd-entry:hover { background:#eff6ff; }
      @media screen { #printArea { display:none; } }
      @media print {
        body, .main-content, .page-body { position:static !important; overflow:visible !important; height:auto !important; margin:0 !important; padding:0 !important; }
        .sidebar, .main-content > header { display:none !important; }
        .page-body > *:not(#printArea):not(style) { display:none !important; }
        #printArea { display:block !important; }
        /* 다중 페이지(팩스/장문 단가표) 정리: 회사 머리말·열 헤더 매 페이지 반복 + 행/비고/직인 페이지 넘침 방지 */
        #printArea table { border-collapse:collapse !important; width:100% !important; }
        #printArea thead { display:table-header-group; }
        #printArea tr, #printArea img { page-break-inside:avoid; }
        #printArea .ps-notes, #printArea .ps-footer { page-break-inside:avoid; }
      }
    `,
    pageContent: `
      <div class="max-w-7xl mx-auto">
        <!-- 탭 헤더 -->
        <div class="ds-card rounded-b-none px-4 flex gap-0 border-b">
          <button onclick="switchPmTab('purchase')" id="pmTab_purchase" class="pm-tab active">
            <i class="fas fa-truck mr-1"></i>매입단가
          </button>
          <button onclick="switchPmTab('sales')" id="pmTab_sales" class="pm-tab">
            <i class="fas fa-file-invoice-dollar mr-1"></i>매출단가표
          </button>
          <button onclick="switchPmTab('policies')" id="pmTab_policies" class="pm-tab">
            <i class="fas fa-sliders-h mr-1"></i>가격 정책
          </button>
        </div>

        <!-- ======== 탭 1: 매입단가 ======== -->
        <div id="pmPanel_purchase">
          <div class="ds-card rounded-t-none px-4 py-3 mb-4">
            <div class="flex items-center gap-3">
              <input type="text" id="pmSearch" placeholder="품목명, 코드, 그룹 검색..."
                class="flex-1 max-w-[400px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <div class="flex-1"></div>
              <button onclick="openHistoryModal()" class="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                <i class="fas fa-history mr-1"></i>이력
              </button>
            </div>
          </div>
          <div id="pmPurchaseArea">
            <div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
          </div>
        </div>

        <!-- ======== 탭 2: 매출단가표 ======== -->
        <div id="pmPanel_sales" class="hidden">
          <div class="ds-card rounded-t-none px-4 py-3 mb-4">
            <!-- 단가표 세트 관리 -->
            <div class="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-gray-100">
              <span class="text-sm font-semibold text-gray-600"><i class="fas fa-layer-group mr-1 text-blue-600"></i>단가표 세트</span>
              <select id="pmSheetSelect" onchange="onPmSheetChange()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[240px]">
                <option value="">세트 미선택 (전체 품목)</option>
              </select>
              <button type="button" onclick="openPmSheetModal()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>새 세트</button>
              <button type="button" id="pmSheetEditBtn" onclick="openPmSheetModal(pmCurrentSheetId)" disabled class="px-3 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"><i class="fas fa-edit mr-1"></i>수정</button>
              <button type="button" id="pmSheetDeleteBtn" onclick="deletePmSheet()" disabled class="px-3 py-2 border border-gray-300 text-red-500 rounded-lg text-sm hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"><i class="fas fa-trash mr-1"></i>삭제</button>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <!-- 거래처 검색 -->
              <div class="flex-1 min-w-[180px] max-w-[320px]" style="position:relative">
                <div class="flex gap-2">
                  <input type="text" id="salesClientSearch" placeholder="거래처명 검색 (Enter)" autocomplete="off"
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                  <button type="button" onclick="clearSalesClient()" id="salesClearBtn" class="hidden px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
                <input type="hidden" id="salesClientId">
                <div id="salesClientDropdown" class="client-dd hidden"></div>
              </div>

              <select id="salesTypeFilter" onchange="renderSalesTable()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">전체 타입</option>
                <option value="PRODUCT">제품</option>
                <option value="MATERIAL">부자재</option>
                <option value="GOODS">상품</option>
              </select>

              <select id="salesCategoryFilter" onchange="renderSalesTable()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">전체 카테고리</option>
              </select>

              <button type="button" onclick="printSalesList()" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                <i class="fas fa-print mr-1"></i>인쇄
              </button>
              <button type="button" onclick="openFaxModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <i class="fas fa-fax mr-1"></i>팩스
              </button>
            </div>

            <div id="salesClientBanner" class="hidden mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-2">
              <i class="fas fa-user text-blue-600"></i>
              <span id="salesClientBannerText" class="text-blue-800 font-medium"></span>
            </div>
          </div>

          <div id="salesTableArea" class="space-y-4"></div>
        </div>

        <!-- ======== 탭 3: 가격 정책 (priceList.ts에서 이관, 2026-06-26) ======== -->
        <div id="pmPanel_policies" class="hidden">
          <div class="ds-card rounded-t-none p-4 mb-4">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-bold text-gray-800"><i class="fas fa-sliders-h mr-2 text-blue-600"></i>가격 정책 관리</h2>
              <button onclick="openPolicyModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <i class="fas fa-plus mr-1"></i>새 정책
              </button>
            </div>
            <div id="policiesList"></div>
          </div>

          <!-- 정책 규칙 편집 영역 -->
          <div id="policyRulesArea" class="hidden">
            <div class="ds-card p-4">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-list-ul mr-2 text-orange-500"></i><span id="rulesTitle"></span> 규칙</h3>
                <div class="flex gap-2">
                  <button onclick="addCategoryRule()" class="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm hover:bg-gray-200">
                    <i class="fas fa-folder-plus mr-1"></i>카테고리 규칙
                  </button>
                  <button onclick="openItemRuleModal()" class="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm hover:bg-gray-200">
                    <i class="fas fa-cube mr-1"></i>품목별 규칙
                  </button>
                  <button onclick="saveCurrentRules()" class="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                    <i class="fas fa-save mr-1"></i>저장
                  </button>
                </div>
              </div>
              <div id="rulesBody"></div>
            </div>
          </div>
        </div>

      </div>
      <div id="printArea"></div>

      <!-- 변경 이력 모달 -->
      <div id="pmHistoryModal" class="ds-modal-overlay hidden flex items-center justify-center">
        <div class="ds-modal p-6" style="max-width:800px; max-height:80vh; overflow-y:auto">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold"><i class="fas fa-history text-gray-500 mr-2"></i>단가 변경 이력</h3>
            <div class="flex items-center gap-3">
              <select id="pmHistoryLimit" onchange="loadHistory()" class="px-3 py-1.5 border border-gray-300 rounded text-sm">
                <option value="50">최근 50건</option>
                <option value="100">최근 100건</option>
                <option value="200">최근 200건</option>
              </select>
              <button onclick="closeHistoryModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
            </div>
          </div>
          <div id="pmHistoryArea"></div>
        </div>
      </div>

      <!-- 팩스 발송 모달 -->
      <div id="faxModal" class="ds-modal-overlay hidden flex items-center justify-center">
        <div class="ds-modal p-6" style="max-width:400px">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold"><i class="fas fa-fax text-blue-600 mr-2"></i>단가표 팩스 발송</h3>
            <button onclick="closeFaxModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="space-y-3">
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">수신 팩스번호 <span class="text-red-500">*</span></label>
              <input type="text" id="faxNum" placeholder="042-000-0000" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">수신자명</label>
              <input type="text" id="faxName" placeholder="수신자명" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
            <div id="faxStatus" class="text-xs text-gray-500"></div>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button onclick="closeFaxModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="sendFax()" id="faxSendBtn" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-paper-plane mr-1"></i>발송</button>
          </div>
        </div>
      </div>

      <!-- 정책 생성/수정 모달 (priceList.ts에서 이관, 2026-06-26) -->
      <div id="policyModal" class="ds-modal-overlay hidden flex items-center justify-center">
        <div class="ds-modal p-6" style="max-width:440px">
          <h3 class="text-lg font-bold mb-4" id="policyModalTitle">새 가격 정책</h3>
          <input type="hidden" id="policyEditId">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">정책명 <span class="text-red-500">*</span></label>
            <input type="text" id="policyName" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 대량 광고기획사">
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">설명</label>
            <input type="text" id="policyDesc" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 월 100만원 이상 거래처">
          </div>
          <div class="flex justify-end gap-3">
            <button onclick="closePolicyModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
            <button onclick="savePolicyModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">저장</button>
          </div>
        </div>
      </div>

      <!-- 단가표 세트 편집 모달 (Phase 1) -->
      <div id="pmSheetModal" class="ds-modal-overlay hidden flex items-center justify-center">
        <div class="ds-modal p-6" style="max-width:760px; width:95%; max-height:88vh; overflow-y:auto">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold" id="pmSheetModalTitle"><i class="fas fa-layer-group text-blue-600 mr-2"></i>새 단가표 세트</h3>
            <button onclick="closePmSheetModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
          </div>
          <input type="hidden" id="pmSheetEditId">

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">세트 이름 <span class="text-red-500">*</span></label>
              <input type="text" id="pmSheetName" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: OO광고 납품 단가표">
            </div>
            <div style="position:relative">
              <label class="block text-sm font-medium text-gray-700 mb-1">거래처 (적용가 기준)</label>
              <div class="flex gap-2">
                <input type="text" id="pmSheetClientSearch" autocomplete="off" placeholder="거래처명 검색 (Enter) · 미지정=표준가" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <button type="button" onclick="clearPmSheetClient()" id="pmSheetClientClear" class="hidden px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100"><i class="fas fa-times"></i></button>
              </div>
              <input type="hidden" id="pmSheetClientId">
              <div id="pmSheetClientDropdown" class="client-dd hidden"></div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">유효기간</label>
              <input type="date" id="pmSheetValidUntil" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">담당자 / 연락처</label>
              <div class="flex gap-2">
                <input type="text" id="pmSheetContactPerson" placeholder="담당자명" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <input type="text" id="pmSheetContactPhone" placeholder="연락처" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
              </div>
            </div>
            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700 mb-1">비고 · 조건 문구</label>
              <textarea id="pmSheetNotes" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 부가세 별도, 유효기간 내 유효"></textarea>
            </div>
            <div class="md:col-span-2">
              <label class="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" id="pmSheetShowStamp" checked class="h-4 w-4">직인 표시
              </label>
            </div>
          </div>

          <!-- 품목 담기 -->
          <div class="border-t pt-4">
            <div class="flex items-center justify-between mb-2">
              <h4 class="text-sm font-bold text-gray-700"><i class="fas fa-box mr-1 text-blue-500"></i>품목 담기</h4>
              <span class="text-xs text-gray-500">담긴 품목 <span id="pmSheetSelCount" class="font-semibold text-blue-600">0</span>개</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div class="flex gap-2 mb-2">
                  <input type="text" id="pmSheetItemSearch" oninput="renderPmSheetItemPicker()" placeholder="품목명·코드 검색" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <select id="pmSheetItemType" onchange="renderPmSheetItemPicker()" class="px-2 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">전체</option><option value="PRODUCT">제품</option><option value="MATERIAL">부자재</option><option value="GOODS">상품</option>
                  </select>
                </div>
                <div id="pmSheetAvailList" class="border border-gray-200 rounded-lg" style="max-height:260px; overflow-y:auto"></div>
              </div>
              <div>
                <div class="text-xs text-gray-500 mb-2 py-2">담긴 품목 (정렬순)</div>
                <div id="pmSheetSelList" class="border border-gray-200 rounded-lg" style="max-height:260px; overflow-y:auto"></div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-5 pt-4 border-t">
            <button onclick="closePmSheetModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="savePmSheet()" id="pmSheetSaveBtn" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
