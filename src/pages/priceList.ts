import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/priceList.js?raw'

export function priceListPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '단가 관리',
    activePage: '/price-list',
    pageCSS: `
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
      .tab-btn { padding:10px 20px; font-size:14px; font-weight:500; border-bottom:2px solid transparent; cursor:pointer; color:#6b7280; }
      .tab-btn.active { border-bottom-color:#2563eb; color:#2563eb; }
      .tab-btn:hover:not(.active) { color:#374151; }
    `,
    pageContent: `
      <div class="max-w-7xl mx-auto">
        <!-- 탭 헤더 -->
        <div class="bg-white rounded-t-lg shadow px-4 flex gap-0 border-b">
          <button onclick="switchTab('priceTable')" id="tabPriceTable" class="tab-btn active">
            <i class="fas fa-won-sign mr-1"></i>단가표
          </button>
          <button onclick="switchTab('policies')" id="tabPolicies" class="tab-btn">
            <i class="fas fa-sliders-h mr-1"></i>가격 정책
          </button>
          <!-- 로고 설정은 설정(/settings) 페이지로 이동됨 -->
        </div>

        <!-- ======== 탭 1: 단가표 ======== -->
        <div id="panelPriceTable">
          <div class="bg-white shadow px-4 py-3 mb-4 rounded-b-lg">
            <div class="flex flex-wrap items-center gap-3">
              <!-- 거래처 검색 -->
              <div class="flex-1 min-w-[180px] max-w-[320px]" style="position:relative">
                <div class="flex gap-2">
                  <input type="text" id="clientSearch" placeholder="거래처명 검색 (Enter)" autocomplete="off"
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                  <button type="button" onclick="clearClient()" id="clearClientBtn" class="hidden px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
                <input type="hidden" id="clientId">
                <div id="clientDropdown" class="client-dd hidden"></div>
              </div>

              <select id="typeFilter" onchange="applyFilter()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">전체 타입</option>
                <option value="PRODUCT">제품</option>
                <option value="MATERIAL">부자재</option>
                <option value="GOODS">상품</option>
              </select>

              <select id="categoryFilter" onchange="applyFilter()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">전체 카테고리</option>
              </select>

              <div class="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                <button type="button" onclick="setPriceMode('base')" id="modeBtnBase" class="px-4 py-2 bg-blue-600 text-white font-medium">기본 단가</button>
                <button type="button" onclick="setPriceMode('sales')" id="modeBtnSales" class="px-4 py-2 bg-white text-gray-700 hover:bg-gray-50">판매 단가</button>
              </div>

              <button type="button" onclick="printPriceList()" class="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                <i class="fas fa-print mr-1"></i>인쇄
              </button>
            </div>

            <div id="clientBanner" class="hidden mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-2">
              <i class="fas fa-user text-blue-600"></i>
              <span id="clientBannerText" class="text-blue-800 font-medium"></span>
            </div>
          </div>

          <div id="priceTableArea" class="space-y-4"></div>
        </div>

        <!-- ======== 탭 2: 가격 정책 ======== -->
        <div id="panelPolicies" class="hidden">
          <div class="bg-white shadow rounded-b-lg p-4 mb-4">
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
            <div class="bg-white shadow rounded-lg p-4">
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

        <!-- 로고 설정은 /settings 페이지로 이동됨 -->

        <div id="printArea"></div>
      </div>

      <!-- 정책 생성/수정 모달 -->
      <div id="policyModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-[440px] p-6">
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
