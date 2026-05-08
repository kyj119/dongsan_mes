import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import activityScript from '../scripts/activityLog.js?raw'
import emailScript from '../scripts/emailLogs.js?raw'

export function activityLogPage(c: Context<HonoEnv>) {
  const tabSwitchScript = `
window.switchLogTab = function(tab) {
  var activityTab = document.getElementById('tabActivity');
  var emailTab = document.getElementById('tabEmail');
  var activityContent = document.getElementById('activityTabContent');
  var emailContent = document.getElementById('emailTabContent');

  if (tab === 'activity') {
    activityTab.classList.remove('border-transparent', 'text-gray-500');
    activityTab.classList.add('border-blue-600', 'text-blue-600');
    emailTab.classList.remove('border-blue-600', 'text-blue-600');
    emailTab.classList.add('border-transparent', 'text-gray-500');
    activityContent.classList.remove('hidden');
    emailContent.classList.add('hidden');
    window.location.hash = '';
  } else if (tab === 'email') {
    emailTab.classList.remove('border-transparent', 'text-gray-500');
    emailTab.classList.add('border-blue-600', 'text-blue-600');
    activityTab.classList.remove('border-blue-600', 'text-blue-600');
    activityTab.classList.add('border-transparent', 'text-gray-500');
    emailContent.classList.remove('hidden');
    activityContent.classList.add('hidden');
    window.location.hash = 'email';
  }
};

(function() {
  var urlParams = new URLSearchParams(window.location.search);
  var tabParam = urlParams.get('tab');
  if (tabParam === 'email') {
    window.switchLogTab('email');
  }
})();
`;

  const combinedScript = activityScript + '\n' + emailScript + '\n' + tabSwitchScript;

  return renderPage(c, {
    title: '시스템 로그',
    activePage: '/activity-log',
    pageContent: `
      <!-- 탭 네비게이션 -->
      <div class="flex border-b mb-4">
        <button onclick="switchLogTab('activity')" id="tabActivity" class="log-tab px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600">활동 로그</button>
        <button onclick="switchLogTab('email')" id="tabEmail" class="log-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">이메일 발송</button>
      </div>

      <!-- 활동 로그 탭 -->
      <div id="activityTabContent">
        <div class="bg-white rounded-lg shadow p-4 mb-4">
          <div class="flex flex-wrap gap-3 items-end">
            <div class="flex-1 min-w-[180px]">
              <label class="block text-xs text-gray-500 mb-1">검색</label>
              <input type="text" id="logSearch" placeholder="사용자, 대상명..."
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                onkeydown="if(event.key==='Enter'){currentPage=1;loadLogs();}">
            </div>
            <div class="min-w-[130px]">
              <label class="block text-xs text-gray-500 mb-1">대상 유형</label>
              <select id="entityTypeFilter" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                onchange="currentPage=1;loadLogs();">
                <option value="">전체</option>
                <option value="ORDER">주문</option>
                <option value="CARD">카드</option>
                <option value="PAYMENT">결제</option>
                <option value="CLIENT">거래처</option>
                <option value="SHIPMENT">출고</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">기간 from</label>
              <input type="date" id="logDateFrom" class="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                onchange="currentPage=1;loadLogs();">
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">~ to</label>
              <input type="date" id="logDateTo" class="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                onchange="currentPage=1;loadLogs();">
            </div>
            <button onclick="currentPage=1;loadLogs();"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <i class="fas fa-search mr-1"></i>검색
            </button>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">일시</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">사용자</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">작업</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">대상</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500">상세</th>
                </tr>
              </thead>
              <tbody id="logTableBody" class="divide-y divide-gray-100">
                <tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">로딩 중...</td></tr>
              </tbody>
            </table>
          </div>
          <div id="logPagination" class="px-4 py-3 border-t flex items-center gap-2 flex-wrap"></div>
        </div>
      </div>

      <!-- 이메일 탭 -->
      <div id="emailTabContent" class="hidden">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-gray-800">
            <i class="fas fa-envelope text-gray-600 mr-2"></i>이메일 발송
          </h2>
          <div class="flex gap-2">
            <button onclick="openTestModal()" class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm">
              <i class="fas fa-paper-plane mr-1"></i>테스트 발송
            </button>
          </div>
        </div>

        <!-- 필터 -->
        <div class="bg-white rounded-lg shadow p-4 mb-4">
          <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input type="text" id="filterSearch" placeholder="수신자/제목 검색" class="border rounded px-3 py-2 text-sm" />
            <select id="filterTemplate" class="border rounded px-3 py-2 text-sm">
              <option value="">전체 템플릿</option>
              <option value="SHIPMENT_NOTICE">출고 알림</option>
              <option value="INVOICE_ISSUED">세금계산서 발행</option>
              <option value="TEST">테스트</option>
              <option value="MANUAL">수동 발송</option>
            </select>
            <select id="filterStatus" class="border rounded px-3 py-2 text-sm">
              <option value="">전체 상태</option>
              <option value="SENT">성공</option>
              <option value="FAILED">실패</option>
            </select>
            <input type="date" id="filterDateFrom" class="border rounded px-3 py-2 text-sm" />
            <input type="date" id="filterDateTo" class="border rounded px-3 py-2 text-sm" />
          </div>
          <div class="mt-3 text-right">
            <button onclick="loadData()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
              <i class="fas fa-search mr-1"></i>조회
            </button>
          </div>
        </div>

        <!-- 통계 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4" id="statsArea"></div>

        <!-- 테이블 -->
        <div class="bg-white rounded-lg shadow overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50 border-b">
              <tr>
                <th class="px-4 py-3 text-left">일시</th>
                <th class="px-4 py-3 text-left">템플릿</th>
                <th class="px-4 py-3 text-left">수신자</th>
                <th class="px-4 py-3 text-left">제목</th>
                <th class="px-4 py-3 text-center">상태</th>
                <th class="px-4 py-3 text-left">발송자</th>
              </tr>
            </thead>
            <tbody id="dataBody"></tbody>
          </table>
        </div>

        <!-- 페이지네이션 -->
        <div class="flex justify-center mt-4" id="pagination"></div>
      </div>

      <!-- 테스트 발송 모달 (emailTabContent 밖) -->
      <div id="testModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
          <h3 class="text-lg font-bold mb-4">테스트 이메일 발송</h3>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">수신 이메일</label>
            <input type="email" id="testEmail" class="w-full border rounded px-3 py-2 text-sm" placeholder="test@example.com" />
          </div>
          <div class="flex justify-end gap-2">
            <button onclick="closeTestModal()" class="px-4 py-2 bg-gray-200 rounded text-sm">취소</button>
            <button onclick="sendTestEmail()" class="px-4 py-2 bg-blue-600 text-white rounded text-sm">발송</button>
          </div>
        </div>
      </div>
    `,
    pageScript: combinedScript
  })
}
