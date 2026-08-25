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
var TABS = ['company', 'cost', 'credit', 'warehouse', 'caps', 'messages'];
var TAB_CONTENT_IDS = {
  company: 'companyTabContent',
  cost: 'costTabContent',
  credit: 'creditTabContent',
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
    testMsgBarobillConnection();
  }
  // 여신 탭 — 영향 시뮬레이션이 전 거래처 집계라 무겁다. 진입 시 1회만 호출(폴링 금지).
  if (tab === 'credit' && typeof loadCreditPolicy === 'function' && !window.__creditTabInitialized) {
    window.__creditTabInitialized = true;
    loadCreditPolicy();
  }
}

// 페이지 로드 시 URL 파라미터 확인
document.addEventListener('DOMContentLoaded', function() {
  var hash = window.location.hash;
  if (hash === '#tab=cost') switchSettingsTab('cost');
  else if (hash === '#tab=credit') switchSettingsTab('credit');
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
          <button onclick="switchSettingsTab('credit')" id="tabCredit" class="settings-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 cursor-pointer hover:text-gray-700">여신 정책</button>
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
              <i class="fas fa-building text-gray-500"></i>
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
              <button onclick="saveSettings()" id="saveBtn" class="ds-btn ds-btn-primary">저장</button>
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

          <!-- 회사 인쇄 정보 (단가표·전달 문서 헤더): 부서연락처 / 웹하드 / 직인 (Phase 2) -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              <i class="fas fa-file-invoice text-indigo-600"></i>
              <span>회사 인쇄 정보</span>
              <span class="text-xs font-normal text-gray-500">(단가표·전달 문서 상단/하단에 표시 · 법인별)</span>
            </h2>

            <!-- 부서별 연락처 -->
            <div class="mt-4">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-bold text-gray-700">부서별 연락처</h3>
                <button onclick="addPcContact()" class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">+ 부서 추가</button>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-sm ds-table-striped ds-table-fixed">
                  <thead>
                    <tr>
                      <th class="text-left">부서명</th>
                      <th class="text-left" style="width:120px">담당자</th>
                      <th class="text-left" style="width:150px">전화</th>
                      <th class="text-left" style="width:150px">팩스</th>
                      <th style="width:40px"></th>
                    </tr>
                  </thead>
                  <tbody id="pcContactsBody"></tbody>
                </table>
              </div>
              <div id="pcNoContactsMsg" class="text-center text-gray-400 py-4 hidden">등록된 부서 연락처가 없습니다.</div>
              <div class="mt-3 flex justify-end">
                <button onclick="savePcContacts()" id="savePcContactsBtn" class="ds-btn ds-btn-primary">연락처 저장</button>
              </div>
            </div>

            <!-- 웹하드 주소 -->
            <div class="mt-6 border-t border-gray-100 pt-6">
              <label class="block text-sm font-bold text-gray-700 mb-1">웹하드 주소</label>
              <p class="text-xs text-gray-400 mb-2">단가표·전달 문서 상단에 파일 전달용 웹하드 주소를 표시합니다.</p>
              <div class="flex gap-2">
                <input type="text" id="pcWebhardUrl" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="https://webhard.example.com">
                <button onclick="savePcWebhard()" id="savePcWebhardBtn" class="ds-btn ds-btn-primary whitespace-nowrap">저장</button>
              </div>
            </div>

            <!-- 직인 (인쇄용) -->
            <div class="mt-6 border-t border-gray-100 pt-6">
              <h3 class="text-sm font-bold text-gray-700 mb-1">직인 (인감도장)</h3>
              <p class="text-xs text-gray-400 mb-3">전달 문서 하단 담당자 옆에 표시됩니다. (PNG/JPG · 위 법인 정보의 인감도장과 동일 값)</p>
              <div id="pcStampArea"></div>
            </div>
          </div>

          <!-- 전자세금계산서 (바로빌) -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <i class="fas fa-file-invoice text-gray-500"></i>
              전자세금계산서
            </h2>
            <div class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">서비스 제공자</label>
                  <input type="text" id="s_tax_provider" value="바로빌" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-700" readonly>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">기본 수신 이메일</label>
                  <input type="email" id="s_tax_default_email" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="tax@example.com">
                </div>
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">바로빌 연결 상태</label>
                  <div id="taxSecretStatus" class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-500">확인 중...</div>
                </div>
              </div>
              <div class="flex flex-col gap-3 pt-2">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="s_tax_test_mode" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked>
                  <span class="text-sm text-gray-700">테스트 모드 <span class="text-gray-400">(바로빌 테스트 서버 사용)</span></span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" id="s_tax_auto_issue" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
                  <span class="text-sm text-gray-700">자동 발행 <span class="text-gray-400">(주문 확정 시 세금계산서 자동 발행)</span></span>
                </label>
              </div>
            </div>
            <div class="mt-6 flex items-center justify-between">
              <button onclick="testBarobillConnection()" id="testBarobillBtn" class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">연결 테스트</button>
              <button onclick="saveTaxSettings()" id="saveTaxBtn" class="ds-btn ds-btn-primary">저장</button>
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
                <i class="fas fa-calculator text-gray-500"></i>
                원가 기준 설정
              </h2>
              <button onclick="addCostRow()" class="ds-btn ds-btn-primary">+ 추가</button>
            </div>
            <p class="text-sm text-gray-500 mb-4">카테고리별 미디어(원단)/잉크 단가를 설정하면 주문 원가가 자동 계산됩니다. (단위: 원/m²)</p>
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full text-sm ds-table-striped ds-table-fixed">
                <thead>
                  <tr>
                    <th class="text-left">카테고리</th>
                    <th class="text-right" style="width:140px">미디어 단가 (원/m²)</th>
                    <th class="text-right" style="width:140px">잉크 단가 (원/m²)</th>
                    <th class="text-left">비고</th>
                    <th style="width:40px"></th>
                  </tr>
                </thead>
                <tbody id="costStandardsBody"></tbody>
              </table>
            </div>
            <div id="noCostMsg" class="text-center text-gray-400 py-6 hidden">등록된 원가 기준이 없습니다.</div>
            <div class="mt-4 flex justify-end">
              <button onclick="saveCostStandards()" id="saveCostBtn" class="ds-btn ds-btn-primary">저장</button>
            </div>
            <div id="costSaveMsg" class="mt-3 text-center text-sm hidden"></div>
            <datalist id="catList"></datalist>
          </div>

        </div>

        <!-- ─── 여신 정책 탭 ─── -->
        <div id="creditTabContent" class="hidden space-y-6">
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
              <i class="fas fa-shield-alt text-gray-400"></i>여신한도 자동 산출
            </h2>
            <p class="text-sm text-gray-500 mb-5 leading-relaxed">
              거래처별로 한도를 입력하지 않습니다. <b>최근 거래 실적에서 한도를 계산</b>합니다.<br>
              거래처 화면에서 한도를 직접 입력하면 그 거래처만 수동값이 우선하고, <b>0 으로 되돌리면 다시 자동</b>이 됩니다.
            </p>

            <div class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-5 text-sm text-gray-700">
              한도 = 최근 <b id="cpFormulaMonths">6</b>개월 월평균 청구액 × <b id="cpFormulaMult">2</b>배
              <span class="text-gray-500">(하한 <span id="cpFormulaFloor">100만</span> · 상한 <span id="cpFormulaCap">5,000만</span>)</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">배수</label>
                <input type="number" step="0.1" min="0.1" max="100" id="cpMultiplier" class="w-full border rounded px-3 py-2 text-sm">
                <p class="text-[11px] text-gray-500 mt-1">월평균 청구액의 몇 배까지 미수를 허용할지</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">산출 기간 (개월)</label>
                <input type="number" step="1" min="1" max="24" id="cpMonths" class="w-full border rounded px-3 py-2 text-sm">
                <p class="text-[11px] text-gray-500 mt-1">12개월 이상으로 늘리면 이월 기초잔액 전표가 산출에 섞입니다</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">하한 (원)</label>
                <input type="text" inputmode="numeric" data-money id="cpFloor" class="w-full border rounded px-3 py-2 text-sm">
                <p class="text-[11px] text-gray-500 mt-1">신규·휴면 거래처가 한도 0 이 되는 것을 막습니다</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">상한 (원)</label>
                <input type="text" inputmode="numeric" data-money id="cpCap" class="w-full border rounded px-3 py-2 text-sm">
                <p class="text-[11px] text-gray-500 mt-1">대형 거래처가 사실상 무제한이 되는 것을 막습니다</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">경고 비율</label>
                <input type="number" step="0.05" min="0.1" max="1" id="cpWarnRatio" class="w-full border rounded px-3 py-2 text-sm">
                <p class="text-[11px] text-gray-500 mt-1">한도의 이 비율에 도달하면 경고(차단 아님). 0.8 = 80%</p>
              </div>
            </div>

            <div class="mt-5 flex items-center gap-2">
              <button onclick="simulateCreditPolicy()" id="cpSimBtn" class="ds-btn">영향 확인</button>
              <button onclick="saveCreditPolicy()" id="cpSaveBtn" class="ds-btn ds-btn-primary">저장</button>
              <span class="text-[11px] text-gray-400">전 거래처 집계라 몇 초 걸립니다</span>
            </div>
            <div id="cpSaveMsg" class="mt-3 text-center text-sm hidden"></div>
          </div>

          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h3 class="text-sm font-bold text-gray-700 mb-1">현재 설정 적용 시 영향</h3>
            <p class="text-[11px] text-gray-500 mb-4">현재 로그인한 법인 기준. 내부법인·현금소매 더미는 제외됩니다.</p>
            <div id="cpImpact" class="text-sm text-gray-500">불러오는 중…</div>
          </div>
        </div>

        <!-- ─── 창고 구역 탭 ─── -->
        <div id="warehouseTabContent" class="hidden space-y-6">

          <!-- 발주 자동승인 설정 -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <i class="fas fa-check-square text-gray-500"></i>
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
              <button onclick="saveAutoApproveSettings()" id="saveAutoApproveBtn" class="ds-btn ds-btn-primary">저장</button>
            </div>
            <div id="autoApproveSaveMsg" class="mt-3 text-center text-sm hidden"></div>
          </div>

          <!-- 창고 구역 관리 -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                <i class="fas fa-warehouse text-gray-500"></i>
                창고 구역 관리
              </h2>
              <button onclick="openAddZoneModal()" class="ds-btn ds-btn-primary">+ 구역 추가</button>
            </div>
            <p class="text-sm text-gray-500 mb-4">자재 저장 구역을 등록하고, 각 구역의 발주 담당자를 지정합니다. 품목에 구역을 배정하면 담당자 기준으로 발주를 관리할 수 있습니다.</p>
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full text-sm ds-table-striped ds-table-fixed">
                <thead>
                  <tr>
                    <th class="text-left" style="width:90px">법인</th>
                    <th class="text-left">구역명</th>
                    <th class="text-left" style="width:80px">코드</th>
                    <th class="text-left">설명</th>
                    <th class="text-left" style="width:100px">담당자</th>
                    <th class="text-center" style="width:70px">품목 수</th>
                    <th class="text-center" style="width:70px">상태</th>
                    <th style="width:80px"></th>
                  </tr>
                </thead>
                <tbody id="storageZonesBody"></tbody>
              </table>
            </div>
            <div id="noZonesMsg" class="text-center py-8 hidden">
              <i class="fas fa-warehouse text-3xl mb-2 block text-gray-300"></i>
              <p class="text-gray-400 text-sm">등록된 창고 구역이 없습니다.</p>
              <button onclick="openAddZoneModal()" class="mt-3 ds-btn ds-btn-primary">+ 첫 구역 추가</button>
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
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs text-gray-500">기간</span>
                <input type="date" id="capsSyncFrom" class="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <span class="text-xs text-gray-400">~</span>
                <input type="date" id="capsSyncTo" class="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <button onclick="clearCapsSyncRange()" class="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50" title="기간 지우기">
                  <i class="fas fa-eraser"></i>
                </button>
                <button onclick="triggerCapsSync()" id="capsSyncBtn" class="ds-btn ds-btn-primary">
                  <i class="fas fa-sync-alt mr-1"></i>지금 동기화
                </button>
              </div>
            </div>
            <p class="text-xs text-gray-400 mt-2">
              <i class="fas fa-info-circle mr-1"></i>기간을 비워두면 최근 며칠 + <b>마지막 성공일 이후 공백을 자동 복구</b>합니다.
              PC가 며칠 꺼져 있었다면 켜기만 해도 자동으로 메워집니다. 기간 지정은 최대 60일.
            </p>
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
              <button onclick="saveCapsSiteSettings()" id="saveCapsSettingsBtn" class="ds-btn ds-btn-primary">저장</button>
            </div>
            <div id="capsSettingsMsg" class="mt-3 text-center text-sm hidden"></div>
          </div>

          <!-- 동기화 이력 -->
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
              <table class="w-full text-sm ds-table ds-table-striped ds-table-fixed">
                <thead>
                  <tr>
                    <th class="col-datetime text-left" style="width:130px">시작</th>
                    <th class="col-status text-left" style="width:80px">상태</th>
                    <th class="col-qty text-right" style="width:60px">수집</th>
                    <th class="col-qty text-right" style="width:60px">신규</th>
                    <th class="col-qty text-right" style="width:60px">갱신</th>
                    <th class="col-qty text-right" style="width:60px">건너뜀</th>
                    <th class="col-qty text-right" style="width:60px">오류</th>
                    <th class="col-tag text-left" style="width:80px">트리거</th>
                    <th class="col-flex text-left">범위</th>
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
          <div id="capsAddSiteModal" class="ds-modal-overlay hidden">
            <div class="ds-modal p-6" style="max-width:28rem">
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
                <button onclick="addCapsSite()" class="ds-btn ds-btn-primary">추가</button>
              </div>
            </div>
          </div>

        </div>

        <!-- ─── 메시지 설정 탭 ─── -->
        <div id="messagesTabContent" class="hidden space-y-6">
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-plug mr-2 text-blue-500"></i>바로빌 연동 상태</h3>
            <div class="space-y-3">
              <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span id="msgBarobillIcon" class="text-lg"><i class="fas fa-spinner fa-spin text-gray-400"></i></span>
                <div class="flex-1">
                  <div class="text-sm font-medium" id="msgBarobillText">확인 중...</div>
                  <div class="text-xs text-gray-400" id="msgBarobillDetail"></div>
                </div>
                <button onclick="testMsgBarobillConnection()" class="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded text-xs hover:bg-gray-50"><i class="fas fa-sync-alt mr-1"></i>연결 확인</button>
              </div>
              <div class="grid grid-cols-3 gap-3 text-center">
                <div class="p-3 bg-gray-50 rounded-lg">
                  <div class="text-xs text-gray-500">통합 포인트</div>
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

          <div class="ds-card p-6">
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
                <p class="text-xs text-gray-400 mt-1">바로빌에 등록된 발신번호</p>
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

          <div class="ds-card p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-6"><i class="fas fa-clipboard-list mr-2 text-yellow-500"></i>발송 위치별 기본 템플릿</h3>
            <p class="text-xs text-gray-400 -mt-4 mb-4">출고·미수금 등 각 발송 화면에서 미리 선택될 알림톡 템플릿입니다. (법인별 설정)</p>
            <div id="ktdList" class="space-y-2"><div class="text-xs text-gray-400">불러오는 중...</div></div>
          </div>

          <div class="ds-card p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-6"><i class="fas fa-envelope mr-2 text-gray-500"></i>이메일 설정</h3>
            <div class="space-y-5">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-semibold text-gray-700">이메일 발송 활성화</label>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" id="msgSettingEmailEnabled" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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

          <div class="ds-card p-6">
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
                <p class="text-xs text-gray-400 mt-1">바로빌에 등록된 팩스 발신번호 (미입력 시 SMS 발신번호 사용)</p>
              </div>
            </div>
          </div>

          <div class="flex justify-end">
            <button onclick="saveMsgSettings()" class="ds-btn ds-btn-primary"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>

        <!-- ─── CAPS 동기화 이력 상세 모달 ─── -->
        <div id="capsSyncLogModal" class="ds-modal-overlay hidden" onclick="if(event.target===this)closeCapsSyncLogModal()">
          <div class="ds-modal p-6 max-h-[90vh] overflow-y-auto" style="max-width:42rem">
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
        <div id="zoneModal" class="ds-modal-overlay hidden" onclick="if(event.target===this)closeZoneModal()">
          <div class="ds-modal p-6" style="max-width:28rem">
            <h3 id="zoneModalTitle" class="text-lg font-bold text-gray-900 mb-4">창고 구역 추가</h3>
            <input type="hidden" id="zoneModalId" value="">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">구역명 <span class="text-red-500">*</span></label>
                <input type="text" id="zoneModalName" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="예: 원단창고">
              </div>
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">법인 <span class="text-red-500">*</span></label>
                <select id="zoneModalEntity" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></select>
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
              <div>
                <label class="block text-sm font-semibold text-gray-700 mb-1">배치도 영역 <span class="text-gray-400 font-normal">(공장 배치도 연결 · 선택)</span></label>
                <select id="zoneModalFacilityZone" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">미지정</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-semibold text-gray-700 mb-1">정렬 순서</label>
                  <input type="number" id="zoneModalSort" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value="0" min="0">
                </div>
                <div class="flex items-end pb-1 gap-4">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id="zoneModalActive" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" checked>
                    <span class="text-sm text-gray-700">활성</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id="zoneModalDefault" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
                    <span class="text-sm text-gray-700">기본 출고 창고</span>
                  </label>
                </div>
              </div>
            </div>
            <div class="mt-6 flex justify-end gap-2">
              <button onclick="closeZoneModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">취소</button>
              <button onclick="saveZone()" id="zoneModalSaveBtn" class="ds-btn ds-btn-primary">저장</button>
            </div>
          </div>
        </div>

      </div>
    `,
    pageScript: combinedScript
  })
}
