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
    `,
    pageScript
  })
}
