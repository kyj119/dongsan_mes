// 권한 없는 사용자 안내 페이지 (모든 권한 차단 케이스 통합)
// URL ?from=/path → 차단된 페이지 표시. 사용자가 갈 수 있는 첫 허용 페이지 안내.
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'

export function noPermissionPage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="min-h-[60vh] flex items-center justify-center p-6">
  <div class="max-w-lg w-full bg-white rounded-xl shadow-lg p-8">
    <div class="text-center mb-6">
      <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
        <i class="fas fa-lock text-4xl text-amber-600"></i>
      </div>
      <h2 class="text-2xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h2>
      <p class="text-sm text-gray-500" id="npSubtitle">현재 계정에는 이 페이지에 접근할 권한이 부여되지 않았습니다.</p>
    </div>

    <!-- 차단된 페이지 정보 (?from 있을 때만) -->
    <div id="npBlockedBox" class="hidden mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
      <div class="text-xs font-semibold text-amber-700 mb-1">요청하신 페이지</div>
      <div class="text-sm font-bold text-gray-900" id="npBlockedLabel">-</div>
      <div class="text-xs text-gray-500 font-mono mt-0.5" id="npBlockedPath">-</div>
    </div>

    <!-- 계정 정보 -->
    <div class="bg-gray-50 rounded-lg p-4 mb-4">
      <div class="text-xs font-semibold text-gray-500 mb-2">계정 정보</div>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div><span class="text-gray-500">이름:</span> <span class="font-medium text-gray-900" id="npUserName">-</span></div>
        <div><span class="text-gray-500">역할:</span> <span class="font-medium text-gray-900" id="npUserRole">-</span></div>
        <div class="col-span-2"><span class="text-gray-500">접근 가능 페이지:</span> <span class="font-bold text-blue-600" id="npAllowedCount">-</span><span class="text-gray-500">개</span></div>
      </div>
    </div>

    <!-- 안내 메시지 -->
    <div class="mb-6 p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800 flex gap-2">
      <i class="fas fa-info-circle mt-0.5"></i>
      <div>
        ADMIN 권한을 가진 관리자에게 <b id="npRequestLabel">이 페이지</b> 권한 부여를 요청하세요.<br>
        권한이 부여된 후 "새로고침"을 누르면 다시 접근할 수 있습니다.
      </div>
    </div>

    <!-- 권한 요청 버튼 (조건부 노출) -->
    <button id="npRequestBtn" class="hidden w-full mb-3 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed">
      <i class="fas fa-paper-plane mr-1"></i><span id="npRequestLabelBtn">ADMIN 에게 권한 요청</span>
    </button>
    <div id="npNoRequestNote" class="hidden mb-3 p-2.5 rounded-lg bg-gray-50 text-xs text-gray-600 text-center">
      <span id="npNoRequestText">요청 가능한 페이지 정보가 없습니다.</span>
    </div>

    <!-- 보조 액션 -->
    <div class="flex gap-2 pt-3 border-t border-gray-200">
      <button id="npGoAllowedBtn" class="hidden flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
        <i class="fas fa-arrow-right mr-1"></i><span id="npGoAllowedLabel">내 권한 페이지로</span>
      </button>
      <button id="npRefreshBtn" class="flex-1 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
        <i class="fas fa-sync mr-1"></i>새로고침
      </button>
    </div>
  </div>
</div>
`
  const pageScript = `
(async function() {
  // 1) 사용자 정보
  var u = null;
  try { u = JSON.parse(localStorage.getItem('user') || 'null'); } catch(e) {}
  if (u) {
    document.getElementById('npUserName').textContent = u.name || u.username || '-';
    document.getElementById('npUserRole').textContent = u.role || '-';
  }

  // 2) ?from 파싱
  var qs = new URLSearchParams(window.location.search);
  var fromPath = qs.get('from') || '';

  // 3) 페이지 마스터 + 내 권한 병렬 조회
  var pages = [], allowed = [];
  try {
    var [pagesRes, meRes] = await Promise.all([
      axios.get('/api/permissions/pages'),
      axios.get('/api/permissions/me')
    ]);
    if (pagesRes.data.success) pages = pagesRes.data.data || [];
    if (meRes.data.success) allowed = (meRes.data.data && meRes.data.data.pages) || [];
  } catch(e) { console.warn('permissions load:', e); }

  // 4) 접근 가능 페이지 카운트
  document.getElementById('npAllowedCount').textContent = allowed.length;

  // 5) 차단된 페이지 정보 표시
  if (fromPath) {
    var matched = pages.find(function(p) { return p.page_key === fromPath; });
    var label = matched ? matched.page_label : fromPath;
    document.getElementById('npBlockedBox').classList.remove('hidden');
    document.getElementById('npBlockedLabel').textContent = label;
    document.getElementById('npBlockedPath').textContent = fromPath;
    document.getElementById('npRequestLabel').textContent = '"' + label + '"';
    document.getElementById('npSubtitle').textContent = '"' + label + '" 페이지에 접근할 권한이 없습니다.';
  }

  // 6) "내 권한 페이지로" 버튼 — 첫 허용 페이지가 있을 때만
  if (allowed.length > 0) {
    var allowedSet = new Set(allowed);
    // sort_order 순으로 정렬된 페이지 마스터에서 허용된 첫 항목 찾기
    var firstAllowedPage = pages.find(function(p) { return allowedSet.has(p.page_key); });
    if (firstAllowedPage) {
      var btn = document.getElementById('npGoAllowedBtn');
      btn.classList.remove('hidden');
      document.getElementById('npGoAllowedLabel').textContent = firstAllowedPage.page_label + ' 으로 이동';
      btn.addEventListener('click', function() {
        window.location.href = firstAllowedPage.page_key;
      });
    }
  }

  // 7) 새로고침
  document.getElementById('npRefreshBtn').addEventListener('click', function() {
    if (fromPath) {
      // 원래 가려던 페이지로 재시도
      window.location.href = fromPath;
    } else {
      window.location.reload();
    }
  });

  // 8) ADMIN 권한 요청 — fromPath 단일 대상. 케이스별 노출 결정.
  var reqBtn = document.getElementById('npRequestBtn');
  var noteEl = document.getElementById('npNoRequestNote');
  var noteText = document.getElementById('npNoRequestText');
  var labelEl = document.getElementById('npRequestLabelBtn');

  // 클라이언트 측에서도 ADMIN-only 하드 가드 페이지 식별 (서버에서도 차단됨)
  var HARD_ADMIN_ONLY = new Set(['/permissions']);
  var matchedPage = fromPath ? pages.find(function(p) { return p.page_key === fromPath; }) : null;
  var allowedSet2 = new Set(allowed);

  if (!fromPath) {
    // 권한 0개 자동 이동 등 — 어떤 페이지를 요청할지 알 수 없음
    noteEl.classList.remove('hidden');
    noteText.textContent = '구체적으로 요청할 페이지가 없습니다. ADMIN 에게 직접 문의해주세요.';
  } else if (!matchedPage) {
    // 마스터에 없는 path (path parameter 또는 임의 주입)
    noteEl.classList.remove('hidden');
    noteText.textContent = '요청하신 페이지는 권한 시스템에서 관리되지 않습니다. ADMIN 에게 직접 문의해주세요.';
  } else if (HARD_ADMIN_ONLY.has(fromPath)) {
    // ADMIN 전용 하드 가드
    noteEl.classList.remove('hidden');
    noteText.textContent = '이 페이지는 ADMIN 전용으로 설정되어 권한 부여가 불가능합니다.';
  } else if (allowedSet2.has(fromPath)) {
    // 이미 권한이 있음 (이상 케이스)
    noteEl.classList.remove('hidden');
    noteText.textContent = '이 페이지는 이미 접근 권한이 있습니다. 새로고침해보세요.';
  } else {
    // 정상 — 요청 버튼 노출
    labelEl.textContent = '"' + matchedPage.page_label + '" 권한을 ADMIN 에게 요청';
    reqBtn.classList.remove('hidden');
    reqBtn.addEventListener('click', async function() {
      reqBtn.disabled = true;
      var originalLabel = labelEl.textContent;
      labelEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>전송 중...';
      try {
        var res = await axios.post('/api/permissions/request', { page_key: fromPath });
        if (res.data.success) {
          labelEl.innerHTML = '<i class="fas fa-check mr-1"></i>요청 완료 — ADMIN 처리 대기';
          if (typeof window.showToast === 'function') {
            window.showToast('ADMIN에게 권한 요청을 전송했습니다.', 'success');
          }
        } else {
          labelEl.textContent = originalLabel;
          reqBtn.disabled = false;
          if (typeof window.showToast === 'function') {
            window.showToast(res.data.error || '요청 실패', 'error');
          }
        }
      } catch (e) {
        labelEl.textContent = originalLabel;
        reqBtn.disabled = false;
        var msg = (e.response && e.response.data && e.response.data.error) || e.message || '요청 실패';
        if (typeof window.showToast === 'function') {
          window.showToast(msg, 'error');
        } else {
          alert(msg);
        }
      }
    });
  }
})();
`
  return renderPage(c, {
    title: '권한 없음',
    activePage: '/no-permission',
    pageContent,
    pageScript,
  })
}
