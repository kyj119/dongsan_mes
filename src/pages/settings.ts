import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import settingsScript from '../scripts/settings.js?raw'
// costSettingsScript 제거 — settings.js의 loadCostStandards가 동일 기능 수행. costBody ID 불일치 에러 원인.
import storageZonesScript from '../scripts/storageZones.js?raw'
import capsSettingsScript from '../scripts/capsSettings.js?raw'

export function settingsPage(c: Context<HonoEnv>) {
  const combinedScript = `
// ─── 탭 전환 함수 ───
var TAB_ACTIVE = 'settings-tab px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600 cursor-pointer hover:text-blue-700';
var TAB_INACTIVE = 'settings-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 cursor-pointer hover:text-gray-700';
var TABS = ['company', 'cost', 'warehouse', 'caps', 'messages'];
var TAB_CONTENT_IDS = {
  company: 'companyTabContent',
  cost: 'costTabContent',
  warehouse: 'warehouseTabContent',
  caps: 'capsTabContent',
  messages: 'messagesTabContent'
};

function switchSettingsTab(tab) {
  TABS.forEach(function(t) {
    var content = document.getElementById(TAB_CONTENT_IDS[t]);
    var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (content) content.classList.toggle('hidden', t !== tab);
    if (btn) btn.className = t === tab ? TAB_ACTIVE : TAB_INACTIVE;
  });
  window.location.hash = tab === 'company' ? '' : 'tab=' + tab;
  // CAPS 탭 최초 진입 시 lazy 초기화
  if (tab === 'caps' && typeof initCapsTab === 'function' && !window.__capsTabInitialized) {
    window.__capsTabInitialized = true;
    initCapsTab();
  }
  // 메시지 탭 최초 진입 시 lazy 초기화
  if (tab === 'messages' && typeof loadMsgSettings === 'function' && !window.__msgTabInitialized) {
    window.__msgTabInitialized = true;
    loadMsgSettings();
    testMsgPopbillConnection();
  }
}

// 페이지 로드 시 URL 파라미터 확인
document.addEventListener('DOMContentLoaded', function() {
  var hash = window.location.hash;
  if (hash === '#tab=cost') switchSettingsTab('cost');
  else if (hash === '#tab=warehouse') switchSettingsTab('warehouse');
  else if (hash === '#tab=caps') switchSettingsTab('caps');
  else if (hash === '#tab=messages') switchSettingsTab('messages');
  else switchSettingsTab('company');
});

${settingsScript}

// costSettingsScript 제거됨 (settings.js loadCostStandards로 통합)

${storageZonesScript}

${capsSettingsScript}
  `

  return renderPage(c, {
    title: '설정',
    activePage: '/settings',
    pageContent: `
      <div class="max-w-3xl mx-auto">

        <!-- ─── 탭 네비게이션 ─── -->
        <div class="flex border-b mb-6">
          <button onclick="switchSettingsTab('company')" id="tabCompany" class="settings-tab px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600 cursor-pointer hover:text-blue-700">법인 설정</button>
          <button onclick="switchSettingsTab('cost')" id="tabCost" class="settings-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 cursor-pointer hover:text-gray-700">원가 기준</button>
          <button onclick="switchSettingsTab('warehouse')" id="tabWarehouse" class="settings-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 cursor-pointer hover:text-gray-700">창고 구역</button>
          <button onclick="switchSettingsTab('caps')" id="tabCaps" class="settings-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 cursor-pointer hover:text-gray-700">
            <i class="fas fa-fingerprint mr-1"></i>CAPS 근태 연동
          </button>
          <button onclick="switchSettingsTab('messages')" id="tabMessages" class="settings-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 cursor-pointer hover:text-gray-700">
            <i class="fas fa-comment-dots mr-1"></i>메시지
          </button>
        </div>

        <!-- ─── 회사 설정 탭 ─── -->
        <div id="companyTabContent" class="space-y-6">

          <!-- 회사 정보 -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <svg class="w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
              <span>법인 정보</span> <span id="entityLabel" class="text-sm font-normal text-blue-600 ml-2"></span>
            </h2>
            <div id="settingsForm" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">회사명</label>
                  <input type="text" id="s_company_name" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="회사명">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">사업자등록번호</label>
                  <input type="text" id="s_company_business_registration_number" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="000-00-00000" maxlength="12">
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">대표자</label>
                  <input type="text" id="s_company_representative" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="대표자명">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">대표 전화</label>
                  <input type="text" id="s_company_phone" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="02-0000-0000">
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">업태</label>
                  <input type="text" id="s_company_business_type" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="제조업">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">종목</label>
                  <input type="text" id="s_company_business_item" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="현수막">
                </div>
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">주소</label>
                <input type="text" id="s_company_address" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="회사 주소">
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">팩스</label>
                  <input type="text" id="s_company_fax" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="02-0000-0000">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">입금계좌</label>
                  <input type="text" id="s_company_bank_info" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="은행명 계좌번호 예금주">
                </div>
              </div>
              <!-- Phase 1.2: 멀티사업자 이메일 발신 설정 -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">이메일 발신 주소 <span class="text-xs font-normal text-gray-400">(거래명세서/원장 발송)</span></label>
                  <input type="email" id="s_company_email_from_address" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="billing@dongsan.co.kr (비우면 글로벌 설정 사용)">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">이메일 발신 이름</label>
                  <input type="text" id="s_company_email_from_name" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="동산기획 (비우면 회사명 사용)">
                </div>
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">인감도장</label>
                <div class="flex items-center gap-4">
                  <img id="stampPreview" class="w-16 h-16 border border-dashed border-gray-300 rounded object-contain bg-gray-50" src="" alt="">
                  <div>
                    <input type="file" id="stampFileInput" accept="image/png,image/jpeg" onchange="handleStampUpload(event)" class="text-sm">
                    <p class="text-xs text-gray-400 mt-1">PNG 또는 JPG, 권장 200x200px 이하</p>
                  </div>
                </div>
                <input type="hidden" id="s_company_stamp_base64" value="">
              </div>
            </div>
            <div class="mt-6 flex justify-end">
              <button onclick="saveSettings()" id="saveBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">저장</button>
            </div>
            <div id="saveMsg" class="mt-3 text-center text-sm hidden"></div>
          </div>

          <!-- 법인별 로고 (Phase 후속: price-list 페이지에서 이동됨) -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              <i class="fas fa-image text-green-600"></i>
              <span>법인별 로고</span>
              <span class="text-xs font-normal text-gray-500">(단가표·견적서·세금계산서 등 인쇄 시 상단 표시)</span>
            </h2>
            <p class="text-sm text-gray-500 mb-4">현재 선택된 법인의 로고를 설정합니다. 권장 높이 60px (PNG/JPG/SVG).</p>
            <div id="logoSettingsArea"></div>
          </div>

          <!-- 전자세금계산서 (팝빌) -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <svg class="w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
              전자세금계산서
            </h2>
            <div class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">공급자</label>
                  <select id="s_tax_provider" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="popbill">팝빌</option>
                    <option value="barobill">바로빌</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">링크아이디</label>
                  <input type="text" id="s_tax_provider_linked_id" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="링크아이디">
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">기본 수신 이메일</label>
                  <input type="email" id="s_tax_default_email" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="tax@example.com">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">비밀키 상태</label>
                  <div id="taxSecretStatus" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500">확인 중...</div>
                  <p class="text-xs text-gray-400 mt-1">변경: <code class="bg-gray-100 px-1 rounded text-xs">wrangler pages secret put POPBILL_SECRET_KEY</code></p>
                </div>
              </div>
              <div class="flex flex-col gap-3 pt-2">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="s_tax_test_mode" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked>
                  <span class="text-sm text-gray-700">테스트 모드 <span class="text-gray-400">(팝빌 테스트 서버 사용)</span></span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="s_tax_auto_issue" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
                  <span class="text-sm text-gray-700">자동 발행 <span class="text-gray-400">(주문 확정 시 세금계산서 자동 발행)</span></span>
                </label>
              </div>
            </div>
            <div class="mt-6 flex items-center justify-between">
              <button onclick="testPopbillConnection()" id="testPopbillBtn" class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">연결 테스트</button>
              <button onclick="saveTaxSettings()" id="saveTaxBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">저장</button>
            </div>
            <div id="taxSaveMsg" class="mt-3 text-center text-sm hidden"></div>
          </div>

          <!-- 이메일 발송 설정은 설정 > 메시지 탭으로 이동됨 -->

        </div>

        <!-- ─── 원가 기준 탭 ─── -->
        <div id="costTabContent" class="hidden space-y-6">

          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>
                원가 기준 설정
              </h2>
              <button onclick="addCostRow()" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">+ 추가</button>
            </div>
            <p class="text-sm text-gray-500 mb-4">카테고리별 미디어(원단)/잉크 단가를 설정하면 주문 원가가 자동 계산됩니다. (단위: 원/m²)</p>
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full text-sm ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wider">
                    <th class="px-3 py-2 text-left">카테고리</th>
                    <th class="px-3 py-2 text-right">미디어 단가 (원/m²)</th>
                    <th class="px-3 py-2 text-right">잉크 단가 (원/m²)</th>
                    <th class="px-3 py-2 text-left">비고</th>
                    <th class="px-3 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody id="costStandardsBody"></tbody>
              </table>
            </div>
            <div id="noCostMsg" class="text-center text-gray-400 py-6 hidden">등록된 원가 기준이 없습니다.</div>
            <div class="mt-4 flex justify-end">
              <button onclick="saveCostStandards()" id="saveCostBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">저장</button>
            </div>
            <div id="costSaveMsg" class="mt-3 text-center text-sm hidden"></div>
            <datalist id="catList"></datalist>
          </div>

        </div>

        <!-- ─── 창고 구역 탭 ─── -->
        <div id="warehouseTabContent" class="hidden space-y-6">

          <!-- 발주 자동승인 설정 -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              빠른 발주 설정
            </h2>
            <p class="text-sm text-gray-500 mb-4">자동승인 한도를 설정하면, 해당 금액 이하의 빠른 발주는 승인 없이 바로 확정됩니다.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="flex items-center gap-2 cursor-pointer mb-3">
                  <input type="checkbox" id="s_po_auto_approve_enabled" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
                  <span class="text-sm text-gray-700">빠른 발주 자동승인 활성화</span>
                </label>
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">자동승인 한도 (원)</label>
                <input type="text" inputmode="numeric" data-money id="s_po_auto_approve_limit" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="500,000">
              </div>
            </div>
            <div class="mt-4 flex justify-end">
              <button onclick="saveAutoApproveSettings()" id="saveAutoApproveBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">저장</button>
            </div>
            <div id="autoApproveSaveMsg" class="mt-3 text-center text-sm hidden"></div>
          </div>

          <!-- 창고 구역 관리 -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 10-4 10 4"/><path d="M4 10v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M10 20v-6h4v6"/><path d="M2 7v4l10 4 10-4V7"/></svg>
                창고 구역 관리
              </h2>
              <button onclick="openAddZoneModal()" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">+ 구역 추가</button>
            </div>
            <p class="text-sm text-gray-500 mb-4">자재 저장 구역을 등록하고, 각 구역의 발주 담당자를 지정합니다. 품목에 구역을 배정하면 담당자 기준으로 발주를 관리할 수 있습니다.</p>
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full text-sm ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wider">
                    <th class="px-3 py-2 text-left">구역명</th>
                    <th class="px-3 py-2 text-left">코드</th>
                    <th class="px-3 py-2 text-left">설명</th>
                    <th class="px-3 py-2 text-left">담당자</th>
                    <th class="px-3 py-2 text-center">품목 수</th>
                    <th class="px-3 py-2 text-center">상태</th>
                    <th class="px-3 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody id="storageZonesBody"></tbody>
              </table>
            </div>
            <div id="noZonesMsg" class="text-center py-8 hidden">
              <svg class="w-10 h-10 text-gray-300 mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 10-4 10 4"/><path d="M4 10v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M10 20v-6h4v6"/><path d="M2 7v4l10 4 10-4V7"/></svg>
              <p class="text-gray-400 text-sm">등록된 창고 구역이 없습니다.</p>
              <button onclick="openAddZoneModal()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">+ 첫 구역 추가</button>
            </div>
          </div>

        </div>

        <!-- ─── CAPS 근태 연동 탭 ─── -->
        <div id="capsTabContent" class="hidden space-y-6">

          <!-- 사이트 선택 카드 -->
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-bold text-gray-700"><i class="fas fa-map-marker-alt mr-1 text-gray-400"></i>CAPS 사이트</h2>
            </div>
            <div id="capsSiteCards" class="grid grid-cols-2 md:grid-cols-4 gap-3"></div>
          </div>

          <!-- 상단 요약 뱃지 + 수동 동기화 버튼 -->
          <div class="bg-white rounded-lg border border-gray-200 p-4">
            <div class="flex items-center justify-between flex-wrap gap-3">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-semibold text-gray-700 mr-1" id="capsCurrentSiteName">—</span>
                <span class="text-xs text-gray-400">|</span>
                <span id="capsBadgeSuccess" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                  <i class="fas fa-check-circle text-[9px] mr-1"></i>성공 <span class="ml-1 tabular-nums">0</span>
                </span>
                <span id="capsBadgePartial" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                  <i class="fas fa-exclamation-circle text-[9px] mr-1"></i>부분 <span class="ml-1 tabular-nums">0</span>
                </span>
                <span id="capsBadgeFailed" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700">
                  <i class="fas fa-times-circle text-[9px] mr-1"></i>실패 <span class="ml-1 tabular-nums">0</span>
                </span>
                <span class="text-xs text-gray-400 ml-2">마지막 성공: <span id="capsLastOk" class="tabular-nums">—</span></span>
              </div>
              <button onclick="triggerCapsSync()" id="capsSyncBtn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                <i class="fas fa-sync-alt mr-1"></i>지금 동기화
              </button>
            </div>
          </div>

          <!-- 미매핑 배너 -->
          <div id="capsUnmappedBanner" class="hidden bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <i class="fas fa-exclamation-triangle text-amber-600 mt-0.5"></i>
              <div class="flex-1">
                <div class="text-sm font-semibold text-amber-800 mb-1">
                  최근 동기화에서 매핑되지 않은 사원번호 <span id="capsUnmappedCount" class="tabular-nums">0</span>건
                </div>
                <div class="text-xs text-amber-700 mb-2">아래 항목을 클릭하면 매핑 폼에 자동 입력됩니다.</div>
                <div id="capsUnmappedList" class="flex flex-wrap gap-1.5"></div>
              </div>
            </div>
          </div>

          <!-- 섹션 1: 사이트별 릴레이 DB 설정 -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <i class="fas fa-database text-gray-500"></i>
              릴레이 DB / 워커 설정
            </h2>
            <p class="text-sm text-gray-500 mb-4">
              선택한 사이트의 on-prem 워커 설정입니다. 워커가 CAPS ACServer에서 <code class="bg-gray-100 px-1 rounded text-xs">nOutput</code> 테이블을 읽어 MES로 푸시합니다.
            </p>
            <div class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">DB 엔진</label>
                  <select id="caps_site_relay_db_engine" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="mysql">MySQL</option>
                    <option value="mssql">MSSQL</option>
                    <option value="postgres">PostgreSQL</option>
                    <option value="access">MS Access (ODBC)</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">Host</label>
                  <input type="text" id="caps_site_relay_db_host" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="192.168.0.x">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">Port</label>
                  <input type="text" id="caps_site_relay_db_port" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="3306">
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">DB 이름</label>
                  <input type="text" id="caps_site_relay_db_name" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="acserver">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">사용자</label>
                  <input type="text" id="caps_site_relay_db_user" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="caps_reader">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">비밀번호</label>
                  <input type="password" id="caps_site_relay_db_password" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="변경 시에만 입력">
                  <p class="text-xs text-gray-400 mt-1">빈 값으로 저장하면 기존 값 유지</p>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">테이블명</label>
                  <input type="text" id="caps_site_relay_table" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="nOutput">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">동기화 주기 (분)</label>
                  <input type="number" id="caps_site_sync_interval_min" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="30" min="1">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">재조회 범위 (일)</label>
                  <input type="number" id="caps_site_sync_lookback_days" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="3" min="1">
                </div>
              </div>
              <div class="border-t border-gray-200 pt-4 space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">워커 Endpoint URL</label>
                    <input type="text" id="caps_site_worker_endpoint" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="https://caps-worker.local/sync">
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">워커 API Key</label>
                    <div class="flex gap-2">
                      <input type="password" id="caps_site_worker_api_key" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="변경 시에만 입력">
                      <button onclick="regenerateCapsSiteKey()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50" title="API 키 재생성">
                        <i class="fas fa-redo"></i>
                      </button>
                    </div>
                    <p class="text-xs text-gray-400 mt-1">빈 값으로 저장하면 기존 값 유지</p>
                  </div>
                </div>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="caps_site_sync_enabled" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
                  <span class="text-sm text-gray-700">CAPS 자동 동기화 활성화</span>
                </label>
              </div>
            </div>
            <div class="mt-6 flex justify-end">
              <button onclick="saveCapsSiteSettings()" id="saveCapsSettingsBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">저장</button>
            </div>
            <div id="capsSettingsMsg" class="mt-3 text-center text-sm hidden"></div>
          </div>

          <!-- 섹션 2: 사원 매핑 -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              <i class="fas fa-id-badge text-gray-500"></i>
              사원 매핑
            </h2>
            <p class="text-sm text-gray-500 mb-4">선택한 사이트의 CAPS 사원번호(e_idno)를 MES 직원과 1:1로 매핑합니다.</p>

            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">CAPS 사원번호 <span class="text-red-500">*</span></label>
                  <input type="text" id="capsMapIdno" class="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e_idno">
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">CAPS 이름</label>
                  <input type="text" id="capsMapName" class="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="참고용">
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">CAPS 부서</label>
                  <input type="text" id="capsMapDept" class="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="참고용">
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 mb-1">MES 직원 <span class="text-red-500">*</span></label>
                  <select id="capsMapEmployee" class="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="">— 선택 —</option>
                  </select>
                </div>
                <div class="flex items-end">
                  <button onclick="addCapsEmployeeMap()" class="w-full px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">
                    <i class="fas fa-plus mr-1"></i>추가
                  </button>
                </div>
              </div>
              <div class="mt-3">
                <label class="block text-xs font-semibold text-gray-600 mb-1">메모</label>
                <input type="text" id="capsMapNotes" class="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="선택 사항">
              </div>
            </div>

            <div class="overflow-x-auto" style="max-height: 400px; overflow-y: auto;">
              <table class="w-full text-sm ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wider">
                    <th class="px-3 py-2 text-left">CAPS e_idno</th>
                    <th class="px-3 py-2 text-left">CAPS 이름/부서</th>
                    <th class="px-3 py-2 text-left"></th>
                    <th class="px-3 py-2 text-left">MES 직원</th>
                    <th class="px-3 py-2 text-left">메모</th>
                    <th class="px-3 py-2 text-left">매핑일</th>
                    <th class="px-3 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody id="capsMapBody"></tbody>
              </table>
            </div>
            <div id="capsMapEmpty" class="text-center py-8 hidden">
              <i class="fas fa-inbox text-3xl text-gray-300 block mb-2"></i>
              <p class="text-sm text-gray-500">등록된 매핑이 없습니다.</p>
            </div>
          </div>

          <!-- 섹션 3: 동기화 이력 -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                <i class="fas fa-history text-gray-500"></i>
                동기화 이력
              </h2>
              <button onclick="loadCapsSyncLog()" class="text-gray-500 hover:text-gray-700 text-sm">
                <i class="fas fa-redo mr-1"></i>새로고침
              </button>
            </div>
            <div class="overflow-x-auto" style="max-height: 500px; overflow-y: auto;">
              <table class="w-full text-sm ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wider">
                    <th class="px-3 py-2 text-left">시작</th>
                    <th class="px-3 py-2 text-left">상태</th>
                    <th class="px-3 py-2 text-right">수집</th>
                    <th class="px-3 py-2 text-right">신규</th>
                    <th class="px-3 py-2 text-right">갱신</th>
                    <th class="px-3 py-2 text-right">건너뜀</th>
                    <th class="px-3 py-2 text-right">오류</th>
                    <th class="px-3 py-2 text-left">트리거</th>
                    <th class="px-3 py-2 text-left">범위</th>
                  </tr>
                </thead>
                <tbody id="capsSyncLogBody"></tbody>
              </table>
            </div>
            <div id="capsSyncLogEmpty" class="text-center py-8 hidden">
              <i class="fas fa-inbox text-3xl text-gray-300 block mb-2"></i>
              <p class="text-sm text-gray-500">동기화 이력이 없습니다.</p>
            </div>
          </div>

          <!-- 사이트 추가 모달 -->
          <div id="capsAddSiteModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div class="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
              <h3 class="text-lg font-bold text-gray-900 mb-4"><i class="fas fa-plus-circle text-blue-500 mr-2"></i>CAPS 사이트 추가</h3>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">사이트 코드 <span class="text-red-500">*</span></label>
                  <input type="text" id="capsNewSiteId" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase" placeholder="CJ (2~5자 영문 대문자)" maxlength="5">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">사이트 이름 <span class="text-red-500">*</span></label>
                  <input type="text" id="capsNewSiteName" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="청주">
                </div>
              </div>
              <div class="mt-6 flex justify-end gap-3">
                <button onclick="closeAddCapsSiteModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">취소</button>
                <button onclick="addCapsSite()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium">추가</button>
              </div>
            </div>
          </div>

        </div>

        <!-- ─── 메시지 설정 탭 ─── -->
        <div id="messagesTabContent" class="hidden space-y-6">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-plug mr-2 text-blue-500"></i>팝빌 연동 상태</h3>
            <div class="space-y-3">
              <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span id="msgPopbillIcon" class="text-lg">⏳</span>
                <div class="flex-1">
                  <div class="text-sm font-medium" id="msgPopbillText">확인 중...</div>
                  <div class="text-xs text-gray-400" id="msgPopbillDetail"></div>
                </div>
                <button onclick="testMsgPopbillConnection()" class="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded text-xs hover:bg-gray-50"><i class="fas fa-sync-alt mr-1"></i>연결 확인</button>
              </div>
              <div class="grid grid-cols-3 gap-3 text-center">
                <div class="p-3 bg-gray-50 rounded-lg">
                  <div class="text-xs text-gray-500">잔여 포인트</div>
                  <div class="text-lg font-bold text-gray-900 mt-1" id="msgConnBalance">-</div>
                </div>
                <div class="p-3 bg-gray-50 rounded-lg">
                  <div class="text-xs text-gray-500">카카오톡 단가</div>
                  <div class="text-lg font-bold text-gray-900 mt-1" id="msgConnUnitCost">-</div>
                </div>
                <div class="p-3 bg-gray-50 rounded-lg">
                  <div class="text-xs text-gray-500">등록 템플릿</div>
                  <div class="text-lg font-bold text-gray-900 mt-1" id="msgConnTemplateCount">-</div>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-6"><i class="fas fa-comment mr-2 text-yellow-500"></i>카카오톡 / SMS 설정</h3>
            <div class="space-y-5">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-semibold text-gray-700">메시지 발송 활성화</label>
                  <p class="text-xs text-gray-400 mt-0.5">비활성화하면 카카오톡 + 문자 발송이 모두 중단됩니다</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="msgSettingEnabled" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">발신번호</label>
                <input type="text" id="msgSettingSenderNum" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="042-xxx-xxxx">
                <p class="text-xs text-gray-400 mt-1">팝빌에 등록된 발신번호</p>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">카카오 채널 ID</label>
                <input type="text" id="msgSettingChannelId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="@동산기획">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">대체문자 발송</label>
                <select id="msgSettingAltSendType" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">미발송 (카카오톡만)</option>
                  <option value="C">카카오톡 내용과 동일</option>
                  <option value="A">별도 대체문자 내용</option>
                </select>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-6"><i class="fas fa-envelope mr-2 text-purple-500"></i>이메일 설정</h3>
            <div class="space-y-5">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-semibold text-gray-700">이메일 발송 활성화</label>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="msgSettingEmailEnabled" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">발신자명</label>
                <input type="text" id="msgSettingEmailFromName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="동산기획">
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">발신 이메일</label>
                <input type="text" id="msgSettingEmailFromAddr" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="noreply@example.com">
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-6"><i class="fas fa-fax mr-2 text-gray-500"></i>팩스 설정</h3>
            <div class="space-y-5">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-semibold text-gray-700">팩스 발송 활성화</label>
                  <p class="text-xs text-gray-400 mt-0.5">비활성화하면 팩스 발송이 중단됩니다</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="msgSettingFaxEnabled" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-600"></div>
                </label>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700 mb-1 block">팩스 발신번호</label>
                <input type="text" id="msgSettingFaxSenderNum" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="042-xxx-xxxx">
                <p class="text-xs text-gray-400 mt-1">팝빌에 등록된 팩스 발신번호 (미입력 시 SMS 발신번호 사용)</p>
              </div>
            </div>
          </div>

          <div class="flex justify-end">
            <button onclick="saveMsgSettings()" class="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>

        <!-- ─── CAPS 동기화 이력 상세 모달 ─── -->
        <div id="capsSyncLogModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target===this)closeCapsSyncLogModal()">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-gray-900">동기화 이력 상세</h3>
              <button onclick="closeCapsSyncLogModal()" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div id="capsSyncLogModalBody" class="space-y-3"></div>
            <div class="mt-6 flex justify-end">
              <button onclick="closeCapsSyncLogModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">닫기</button>
            </div>
          </div>
        </div>

        <!-- ─── 창고 구역 모달 ─── -->
        <div id="zoneModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick="if(event.target===this)closeZoneModal()">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 id="zoneModalTitle" class="text-lg font-bold text-gray-900 mb-4">창고 구역 추가</h3>
            <input type="hidden" id="zoneModalId" value="">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">구역명 <span class="text-red-500">*</span></label>
                <input type="text" id="zoneModalName" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="예: 원단창고">
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">코드</label>
                <input type="text" id="zoneModalCode" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="예: WH-01 (선택)">
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">설명</label>
                <input type="text" id="zoneModalDesc" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="구역에 대한 간단한 설명">
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">담당자</label>
                <select id="zoneModalManager" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">미지정</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">정렬 순서</label>
                  <input type="number" id="zoneModalSort" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value="0" min="0">
                </div>
                <div class="flex items-end pb-1">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id="zoneModalActive" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked>
                    <span class="text-sm text-gray-700">활성</span>
                  </label>
                </div>
              </div>
            </div>
            <div class="mt-6 flex justify-end gap-2">
              <button onclick="closeZoneModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">취소</button>
              <button onclick="saveZone()" id="zoneModalSaveBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">저장</button>
            </div>
          </div>
        </div>

      </div>
    `,
    pageScript: combinedScript
  })
}
