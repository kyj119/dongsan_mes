import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import priceListsScript from '../scripts/priceLists.js?raw'
import clientPricesScript from '../scripts/clientPrices.js?raw'

export function priceListsPage(c: Context<HonoEnv>) {
  const combinedScript = `
${priceListsScript}

${clientPricesScript}

// 탭 전환 함수
function switchPriceTab(tab) {
  const salesTab = document.getElementById('tabSales');
  const purchaseTab = document.getElementById('tabPurchase');
  const salesContent = document.getElementById('salesTabContent');
  const purchaseContent = document.getElementById('purchaseTabContent');

  if (tab === 'sales') {
    salesTab.classList.add('border-blue-600', 'text-blue-600');
    salesTab.classList.remove('border-transparent', 'text-gray-500');
    purchaseTab.classList.remove('border-blue-600', 'text-blue-600');
    purchaseTab.classList.add('border-transparent', 'text-gray-500');
    salesContent.classList.remove('hidden');
    purchaseContent.classList.add('hidden');
    window.location.hash = '';
  } else if (tab === 'purchase') {
    purchaseTab.classList.add('border-blue-600', 'text-blue-600');
    purchaseTab.classList.remove('border-transparent', 'text-gray-500');
    salesTab.classList.remove('border-blue-600', 'text-blue-600');
    salesTab.classList.add('border-transparent', 'text-gray-500');
    purchaseContent.classList.remove('hidden');
    salesContent.classList.add('hidden');
    window.location.hash = 'tab=purchase';
  }
}

// 페이지 로드 시 탭 활성화
document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.substring(1);
  if (urlParams.get('tab') === 'purchase' || hash === 'tab=purchase') {
    setTimeout(() => switchPriceTab('purchase'), 100);
  }
});
`

  return renderPage(c, {
    title: '단가 관리',
    activePage: '/price-lists',
    pageContent: `
<div class="container mx-auto px-4 py-8">
  <!-- 탭 네비게이션 -->
  <div class="flex border-b mb-6">
    <button onclick="switchPriceTab('sales')" id="tabSales" class="price-tab px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600">매출 단가표</button>
    <button onclick="switchPriceTab('purchase')" id="tabPurchase" class="price-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">매입 단가</button>
  </div>

  <!-- 매출 단가표 탭 -->
  <div id="salesTabContent" class="block">
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold"><i class="fas fa-layer-group text-purple-600 mr-2"></i>매출 단가표 관리</h2>
        <button onclick="showAddPriceListModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
          <i class="fas fa-plus mr-1"></i>단가표 추가
        </button>
      </div>
      <div id="priceListCards" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Cards loaded dynamically -->
      </div>
    </div>

    <!-- 선택된 단가표 상세 -->
    <div id="priceListDetail" class="hidden bg-white rounded-lg shadow-lg p-6 mb-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold" id="detailTitle">단가표 상세</h3>
        <div class="flex gap-2">
          <button onclick="showAssignClientModal()" class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <i class="fas fa-user-plus mr-1"></i>거래처 배정
          </button>
        </div>
      </div>

      <!-- Tabs: 배정 거래처 / 적용 단가 미리보기 -->
      <div class="flex border-b mb-4">
        <button id="tabClients" onclick="switchTab('clients')" class="px-4 py-2 text-sm font-medium border-b-2 border-purple-600 text-purple-600">배정 거래처 (<span id="assignedCount">0</span>)</button>
        <button id="tabPreview" onclick="switchTab('preview')" class="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">적용 단가 미리보기</button>
      </div>

      <div id="tabContentClients">
        <div id="assignedClientsList" class="space-y-2"></div>
      </div>
      <div id="tabContentPreview" class="hidden">
        <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-2 text-left">품목코드</th>
                <th class="px-4 py-2 text-left">품목명</th>
                <th class="px-4 py-2 text-left">단위</th>
                <th class="px-4 py-2 text-right">기본단가</th>
                <th class="px-4 py-2 text-right">적용단가</th>
                <th class="px-4 py-2 text-right">차이</th>
              </tr>
            </thead>
            <tbody id="previewTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- 매입 단가 탭 -->
  <div id="purchaseTabContent" class="hidden">
    <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-boxes text-orange-600 mr-2"></i>매입 단가 관리</h2>
      <div class="flex flex-wrap gap-3 items-end mb-4">
        <div class="flex-1 min-w-[200px]">
          <label class="block text-xs font-medium text-gray-500 mb-1">품목 검색 (매입 품목)</label>
          <div class="relative">
            <input type="text" id="itemSearchInput" placeholder="품목명 검색..."
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              oninput="searchItemsForPurchasePrice()" autocomplete="off">
            <div id="itemDropdown" class="hidden absolute z-50 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto"></div>
            <input type="hidden" id="selectedItemId">
          </div>
        </div>
        <div id="selectedItemBadge" class="hidden px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm">
          <span id="selectedItemName" class="font-medium text-orange-700"></span>
          <span id="selectedItemBase" class="text-gray-500 ml-2"></span>
          <button onclick="clearSelectedItem()" class="ml-2 text-orange-400 hover:text-orange-600"><i class="fas fa-times"></i></button>
        </div>
      </div>

      <div id="supplierPriceSection" class="hidden">
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold">공급업체별 단가</h3>
            <span id="supplierPriceCount" class="text-sm text-gray-500"></span>
          </div>
          <button onclick="showAddSupplierPriceModal()" class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <i class="fas fa-plus mr-1"></i>공급업체 추가
          </button>
        </div>
        <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left font-medium text-gray-500">공급업체</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">협의단가</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">최근매입가</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">최근매입일</th>
                <th class="px-4 py-3 text-right font-medium text-gray-500">차이(%)</th>
                <th class="px-4 py-3 text-left font-medium text-gray-500">비고</th>
                <th class="px-4 py-3 text-center font-medium text-gray-500">관리</th>
              </tr>
            </thead>
            <tbody id="supplierPriceBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- 매출 단가표 모달들 -->
<div id="priceListModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4" id="priceListModalTitle">단가표 추가</h2>
      <input type="hidden" id="plModalId">
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">단가표명 *</label>
          <input type="text" id="plModalName" class="w-full px-3 py-2 border rounded-lg" placeholder="예: VIP 거래처">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">조정 비율 (%) *</label>
          <input type="number" id="plModalPercent" class="w-full px-3 py-2 border rounded-lg" step="0.1" value="0" placeholder="예: -10 (10% 할인)">
          <p class="text-xs text-gray-500 mt-1">양수: 인상, 음수: 할인 (예: -5 = 5% 할인)</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">설명</label>
          <input type="text" id="plModalDesc" class="w-full px-3 py-2 border rounded-lg" placeholder="단가표 설명">
        </div>
      </div>
      <div class="mt-5 flex gap-2">
        <button onclick="savePriceList()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
        <button onclick="document.getElementById('priceListModal').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">취소</button>
      </div>
    </div>
  </div>
</div>

<div id="assignClientModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4">거래처 배정</h2>
      <div class="mb-4">
        <input type="text" id="assignClientSearch" class="w-full px-3 py-2 border rounded-lg" placeholder="거래처명 검색..." oninput="searchClientsToAssign()">
        <div id="assignClientResults" class="mt-2 max-h-60 overflow-y-auto border rounded-lg hidden"></div>
      </div>
      <div id="selectedAssignClients" class="flex flex-wrap gap-2 mb-4"></div>
      <div class="flex gap-2">
        <button onclick="confirmAssignClients()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">배정</button>
        <button onclick="document.getElementById('assignClientModal').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">취소</button>
      </div>
    </div>
  </div>
</div>

<!-- 매입 단가 모달 -->
<div id="supplierPriceModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4" id="spModalTitle">공급업체 단가 추가</h2>
      <input type="hidden" id="spModalId">
      <input type="hidden" id="spModalClientId">
      <div class="space-y-3">
        <div id="spSupplierSearchWrap">
          <label class="block text-sm font-medium text-gray-700 mb-1">공급업체 *</label>
          <div class="relative">
            <input type="text" id="spSupplierSearch" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="공급업체명 검색..." oninput="searchSuppliersForPrice()" autocomplete="off">
            <div id="spSupplierDropdown" class="hidden absolute z-50 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto"></div>
          </div>
        </div>
        <div id="spSupplierFixed" class="hidden">
          <label class="block text-sm font-medium text-gray-700 mb-1">공급업체</label>
          <input type="text" id="spSupplierName" class="w-full px-3 py-2 border rounded-lg bg-gray-50" readonly>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">협의단가 *</label>
          <input type="text" inputmode="numeric" data-money id="spModalPrice" class="w-full px-3 py-2 border rounded-lg">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">비고</label>
          <input type="text" id="spModalNotes" class="w-full px-3 py-2 border rounded-lg" placeholder="메모">
        </div>
      </div>
      <div class="mt-5 flex gap-2">
        <button onclick="saveSupplierPrice()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
        <button onclick="document.getElementById('supplierPriceModal').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">취소</button>
      </div>
    </div>
  </div>
</div>
    `,
    pageScript: combinedScript,
  })
}
