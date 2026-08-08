
// === Dark Mode Initialization (FOUC prevention — runs immediately) ===
(function() {
  var theme = localStorage.getItem('theme');
  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();

// Dark mode toggle function
window.toggleDarkMode = function() {
  var isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  var icon = document.getElementById('darkModeIcon');
  if (icon) icon.className = isDark ? 'fas fa-sun text-amber-400' : 'fas fa-moon';
};

// Sync icon on initial load
(function() {
  var icon = document.getElementById('darkModeIcon');
  if (icon && document.documentElement.classList.contains('dark')) {
    icon.className = 'fas fa-sun text-amber-400';
  }
})();

// === Global ESC → close topmost modal ===
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  // fixed overlay 중 보이는 것만 수집
  var modals = Array.from(document.querySelectorAll('.fixed.inset-0')).filter(function(el) {
    if (el.classList.contains('hidden')) return false;
    if (el.style.display === 'none') return false;
    // 실제로 화면에 보이는지 확인
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (!modals.length) return;
  // z-index 높은 순 → 같으면 DOM 뒤쪽(나중에 열림)이 우선
  modals.sort(function(a, b) {
    var za = parseInt(getComputedStyle(a).zIndex) || 0;
    var zb = parseInt(getComputedStyle(b).zIndex) || 0;
    if (zb !== za) return zb - za;
    // 같은 z-index면 DOM 순서 (뒤가 위)
    var all = Array.from(document.querySelectorAll('.fixed.inset-0'));
    return all.indexOf(b) - all.indexOf(a);
  });
  var top = modals[0];
  e.preventDefault();
  e.stopImmediatePropagation();
  // 부수효과(스크롤락 등) 있는 모달은 전용 닫기 함수에 위임 — 단순 hidden 추가로 닫으면 복원 안 됨
  if (top.dataset && top.dataset.escClose && typeof window[top.dataset.escClose] === 'function') {
    window[top.dataset.escClose]();
  } else if (top.id && document.querySelector('#' + top.id + '.hidden') === null && top.parentElement === document.querySelector('.main-content')?.parentElement) {
    top.classList.add('hidden');
  } else if (top.id && !top.dataset.dynamic) {
    top.classList.add('hidden');
  } else {
    // createElement 방식 동적 모달
    top.remove();
  }
});

// === XSS Protection: Global HTML Escape Function ===
window.escapeHtml = function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// === KST 시간 헬퍼 (전역) — #366 ===
// 정책: 저장은 UTC(불변·감사 표준), 표시는 항상 한국시간(Asia/Seoul).
// SQLite 타임스탬프("YYYY-MM-DD HH:MM:SS", tz 표식 없음)를 new Date()로 바로 파싱하면
// 브라우저 로컬로 해석돼 9시간 이르게 표시됨 → 이 헬퍼로 UTC→KST 변환을 단일화.
window.toKstDate = function(ts) {
  if (ts === null || ts === undefined || ts === '') return null;
  var s = String(ts).trim();
  // 순수 날짜("YYYY-MM-DD", 길이 10)는 시각·tz 모호성 없음
  if (s.length === 10 && s.charAt(4) === '-' && s.charAt(7) === '-') return new Date(s + 'T00:00:00');
  var iso = s.indexOf('T') === -1 ? s.replace(' ', 'T') : s;
  var timePart = iso.length > 11 ? iso.slice(11) : '';
  var hasTz = timePart.indexOf('Z') !== -1 || timePart.indexOf('+') !== -1 || timePart.indexOf('-') !== -1;
  if (!hasTz) iso += 'Z'; // tz 표식 없으면 UTC로 간주 (SQLite CURRENT_TIMESTAMP)
  var d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};
// 한국시간 표시. mode: 'date' | 'time' | (기본)전체. 잘못된 값은 원본/'-'.
window.formatKST = function(ts, mode, opts) {
  var d = window.toKstDate(ts);
  if (!d) return (ts === null || ts === undefined || ts === '') ? '-' : String(ts);
  var o = Object.assign({ timeZone: 'Asia/Seoul' }, opts || {});
  if (mode === 'date') return d.toLocaleDateString('ko-KR', o);
  if (mode === 'time') return d.toLocaleTimeString('ko-KR', o);
  return d.toLocaleString('ko-KR', o);
};
// 한국 기준 오늘 "YYYY-MM-DD" (업무일 계산용, 프론트)
window.kstToday = function() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
};

// === Chart Color Constants (표준 차트 팔레트) ===
window.CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#9333ea', '#ec4899', '#06b6d4', '#84cc16'];
window.CHART_BG_CLASSES = ['bg-blue-600', 'bg-green-600', 'bg-amber-500', 'bg-red-600', 'bg-purple-600', 'bg-pink-500', 'bg-cyan-500', 'bg-lime-500'];

// === 금액/숫자 포맷 헬퍼 (전역) ===
// 시스템 전체 금액 표시·입력의 단일 진실 소스
// 자세한 정책: .claude/skills/mes-ui-consistency/SKILL.md §8.5
window.fmtMoney = function(n) {
  if (n === null || n === undefined || n === '') return '-';
  var v = parseInt(n, 10);
  return isNaN(v) ? '-' : v.toLocaleString('ko-KR');
};

window.parseMoney = function(str) {
  if (str === null || str === undefined) return null;
  var s = String(str).replace(/[^\d-]/g, '');
  if (s === '' || s === '-') return null;
  var n = parseInt(s, 10);
  return isNaN(n) ? null : n;
};

// input 채우기용 금액 포맷 (빈값 → '', 유효값 → 콤마 포맷)
window.fmtMoneyInput = function(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  if (!isFinite(n)) return '';
  return n.toLocaleString('ko-KR');
};

// input에서 금액 읽기 (element ID → 숫자)
window.readMoney = function(id) {
  var el = document.getElementById(id);
  if (!el) return 0;
  return window.parseMoney(el.value) || 0;
};

// 숫자 콤마 포맷 SSOT (null/NaN → '0') — 페이지별 로컬 fmt() 재정의 금지, var fmt = window.fmtNum 위임
// fmtMoney(null→'-')와 의미 구분: 집계/수량 표시엔 fmtNum, 금액 셀 표시엔 fmtMoney
window.fmtNum = function(n) {
  return (Number(n) || 0).toLocaleString('ko-KR');
};

// 날짜 표시 포맷 SSOT — ISO/타임스탬프 문자열 → 'YYYY-MM-DD' (falsy → '')
// 페이지별 formatDate/fmtDate/accFmtDate 재정의 금지, null 표기는 호출부에서 || '-'
window.fmtDateOnly = function(v) {
  return v ? String(v).slice(0, 10) : '';
};

// === 표준 모달 열기/닫기 SSOT (hidden 클래스 계통 단일화) ===
// 인라인 style.display 토글 금지 — 전역 ESC closer(hidden)와 충돌 (quality/users 모달 사망 전례).
// 마크업 규약: 기본 hidden 클래스 + (flex 레이아웃이면 flex 클래스 병기 — Tailwind에서 hidden이 후순위라 우선).
// 스크롤락 필요 모달: data-scroll-lock 속성 + 닫기 부수효과가 더 있으면 data-esc-close="함수명" 선언.
window.dsOpenModal = function(idOrEl) {
  var m = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (!m) return;
  m.classList.remove('hidden');
  if (m.dataset && m.dataset.scrollLock != null) document.body.style.overflow = 'hidden';
};
window.dsCloseModal = function(idOrEl) {
  var m = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (!m) return;
  m.classList.add('hidden');
  if (m.dataset && m.dataset.scrollLock != null) document.body.style.overflow = '';
};

// === 공용 거래처 검색 모달 (openItemSearchModal 자매) ===
// 사용: openClientSearchModal({ onSelect: function(client){...}, search: '초기검색어' })
// client = { id, client_name, client_code, business_registration_number, phone, ... } (/api/clients 행 그대로)
var _clientSearchCb = null;
var _clientSearchTimer = null;
window.openClientSearchModal = function(opts) {
  opts = opts || {};
  _clientSearchCb = opts.onSelect || null;
  var existing = document.getElementById('clientSearchModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'clientSearchModal';
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center ds-z-stack';
  modal.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4">'
    + '<div class="p-4 border-b">'
    + '<div class="flex items-center justify-between mb-3">'
    + '<h2 class="text-lg font-bold"><i class="fas fa-building text-blue-600 mr-2"></i>거래처 검색</h2>'
    + '<button onclick="document.getElementById(\'clientSearchModal\').remove()" class="p-2 text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>'
    + '</div>'
    + '<input type="text" id="clientSearchModalInput" placeholder="거래처명 / 코드 / 사업자번호 / 전화..." value="' + window.escapeHtml(opts.search || '') + '"'
    + ' class="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" autofocus>'
    + '</div>'
    + '<div class="flex-1 overflow-auto" id="clientSearchModalBody">'
    + '<div class="text-center py-12 text-gray-400 text-sm">검색어를 입력하세요</div>'
    + '</div></div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  var input = document.getElementById('clientSearchModalInput');
  input.addEventListener('input', function() {
    clearTimeout(_clientSearchTimer);
    _clientSearchTimer = setTimeout(function() { _clientSearchRun(input.value.trim()); }, 250);
  });
  input.focus();
  if (opts.search) _clientSearchRun(opts.search);
};
function _clientSearchRun(q) {
  var body = document.getElementById('clientSearchModalBody');
  if (!body) return;
  if (!q || q.length < 1) { body.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm">검색어를 입력하세요</div>'; return; }
  body.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-1"></i>검색 중...</div>';
  axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50').then(function(res) {
    var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
    if (!clients.length) { body.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm"><i class="fas fa-inbox text-2xl mb-2 block text-gray-300"></i>검색 결과가 없습니다</div>'; return; }
    window.__clientSearchResults = clients;
    body.innerHTML = clients.map(function(cl, i) {
      return '<div class="px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-blue-50" onclick="window.__clientSearchPick(' + i + ')">'
        + '<div class="font-medium text-sm">' + window.escapeHtml(cl.client_name || '') + '</div>'
        + '<div class="text-xs text-gray-500 mt-0.5">'
        + window.escapeHtml(cl.client_code || '')
        + (cl.business_registration_number ? ' | ' + window.escapeHtml(cl.business_registration_number) : '')
        + (cl.phone ? ' | ' + window.escapeHtml(cl.phone) : '')
        + '</div></div>';
    }).join('');
  }).catch(function(e) {
    console.error('[clientSearchModal] search error:', e);
    body.innerHTML = '<div class="text-center py-12 text-red-400 text-sm">검색 실패</div>';
  });
}
window.__clientSearchPick = function(i) {
  var cl = (window.__clientSearchResults || [])[i];
  var modal = document.getElementById('clientSearchModal');
  if (modal) modal.remove();
  if (cl && typeof _clientSearchCb === 'function') _clientSearchCb(cl);
};

// 페이지네이션 렌더 SSOT — pag={total,page,limit,total_pages}, gotoFnName=전역 함수명 문자열
// 페이지별 renderPagination 재정의 금지 (top-level 동명 전역이 서로 덮어쓰는 사고 전례)
window.dsPaginate = function(elOrId, pag, gotoFnName) {
  var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  pag = pag || {};
  var total = pag.total || 0, page = pag.page || 1, limit = pag.limit || 50;
  var pages = Math.max(1, pag.total_pages || Math.ceil(total / limit));
  if (pages <= 1) { el.innerHTML = total > 0 ? '<span class="text-xs text-gray-500">총 ' + total.toLocaleString('ko-KR') + '건</span>' : ''; return; }
  var info = '<span class="text-xs text-gray-500">총 ' + total.toLocaleString('ko-KR') + '건 · ' + page + '/' + pages + ' 페이지</span>';
  var btns = '';
  if (page > 1) btns += '<button onclick="' + gotoFnName + '(' + (page - 1) + ')" class="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 mr-1"><i class="fas fa-chevron-left"></i> 이전</button>';
  if (page < pages) btns += '<button onclick="' + gotoFnName + '(' + (page + 1) + ')" class="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50">다음 <i class="fas fa-chevron-right"></i></button>';
  el.innerHTML = '<div class="flex justify-between items-center w-full"><span>' + info + '</span><span>' + btns + '</span></div>';
};

// === 테이블 빈 상태 행 (전역) ===
// === KPI Count-Up Animation ===
window.animateNumber = function(el, endValue, opts) {
  if (!el) return;
  opts = opts || {};
  var duration = opts.duration || 600;
  var suffix = opts.suffix || '';
  var prefix = opts.prefix || '';
  var formatter = opts.formatter || function(n) { return Math.round(n).toLocaleString('ko-KR'); };
  var start = 0;
  var startTime = null;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / duration, 1);
    // easeOutExpo for snappy feel
    var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    var current = start + (endValue - start) * eased;
    el.textContent = prefix + formatter(current) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  if (endValue === 0) { el.textContent = prefix + formatter(0) + suffix; return; }
  requestAnimationFrame(step);
};

window.emptyRow = function(colspan, msg, icon) {
  return '<tr><td colspan="' + colspan + '" class="text-center py-8 text-gray-400">'
    + (icon ? '<i class="fas ' + icon + ' text-2xl block mb-2"></i>' : '')
    + '<div class="text-sm">' + (msg || '데이터가 없습니다') + '</div></td></tr>';
};

// === API 에러 핸들러 (전역) ===
window.handleApiError = function(error, fallbackMsg) {
  var msg = fallbackMsg || '오류가 발생했습니다.';
  if (error && error.response && error.response.data) {
    msg = error.response.data.error || error.response.data.message || msg;
  }
  showToast(msg, 'error');
  console.error(msg, error);
};

// === Focus Trap (Accessibility) ===
window.trapFocus = function(container) {
  if (!container) return;
  var focusable = container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  first.focus();
  container._trapHandler = function(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  container.addEventListener('keydown', container._trapHandler);
};
window.releaseFocus = function(container) {
  if (!container || !container._trapHandler) return;
  container.removeEventListener('keydown', container._trapHandler);
  delete container._trapHandler;
};

// === DS Sheet (Right Drawer) helpers ===
window.openSheet = function(sheetId) {
  var sheet = document.getElementById(sheetId);
  var overlay = document.getElementById(sheetId + 'Overlay');
  if (sheet) { sheet.classList.add('open'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); trapFocus(sheet); }
  if (overlay) overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeSheet = function(sheetId) {
  var sheet = document.getElementById(sheetId);
  var overlay = document.getElementById(sheetId + 'Overlay');
  if (sheet) { sheet.classList.remove('open'); releaseFocus(sheet); }
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
};

// 단일 input에 자동 콤마 포맷 바인딩
window.attachMoneyInput = function(el) {
  if (!el || el.dataset.moneyBound) return;
  el.dataset.moneyBound = '1';
  el.setAttribute('inputmode', 'numeric');
  el.classList.add('text-right', 'tabular-nums');
  // 초기 값 포맷
  if (el.value !== '' && el.value != null) {
    var initN = window.parseMoney(el.value);
    el.value = initN == null ? '' : initN.toLocaleString('ko-KR');
  }
  el.addEventListener('input', function() {
    var n = window.parseMoney(el.value);
    el.value = n == null ? '' : n.toLocaleString('ko-KR');
  });
  el.addEventListener('blur', function() {
    var n = window.parseMoney(el.value);
    el.value = n == null ? '' : n.toLocaleString('ko-KR');
  });
};

// 폼 안의 모든 [data-money] input을 자동 바인딩
// NOTE: data-money-bound 속성은 attachMoneyInput 내부에서 세팅한다.
// 바깥에서 먼저 세팅하면 attachMoneyInput의 가드가 발동해 리스너가 붙지 않는 버그가 생긴다.
window.bindMoneyInputs = function(rootEl) {
  var root = rootEl || document;
  var nodes = root.querySelectorAll('input[data-money]:not([data-money-bound])');
  nodes.forEach(function(el) {
    window.attachMoneyInput(el);
  });
};

// 폼 제출 직전: data-money input 값을 정수로 정규화하여 객체에 반영
window.collectMoneyFields = function(formEl, dataObj) {
  formEl.querySelectorAll('input[data-money]').forEach(function(el) {
    if (el.name) dataObj[el.name] = window.parseMoney(el.value);
  });
};

// 페이지 로드 시 자동 1회 바인딩
document.addEventListener('DOMContentLoaded', function() { window.bindMoneyInputs(); });
// SPA 네비게이션 후에도 다시 바인딩되도록 — spaNavigate에서도 호출됨

// === 다음(카카오) 우편번호 검색 헬퍼 ===
// 사용법: openPostcodeSearch(function(result) { ... })
//   result = { postal: '12345', address: '서울시 강남구 ...' }
// 또는 input id를 직접 넘기는 방식:
//   openPostcodeSearch({ postalId: 'inputPostal', addressId: 'inputAddress', detailFocusId: 'inputDetail' })
window.openPostcodeSearch = function(arg) {
  if (typeof daum === 'undefined' || !daum.Postcode) {
    alert('우편번호 서비스를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  new daum.Postcode({
    oncomplete: function(data) {
      // 도로명주소 우선, 없으면 지번주소
      var addr = data.roadAddress || data.jibunAddress || data.address || '';
      // 참고항목 (건물명 등) 추가
      var extra = '';
      if (data.bname && /[동|로|가]$/g.test(data.bname)) extra += data.bname;
      if (data.buildingName && data.apartment === 'Y') {
        extra += (extra ? ', ' : '') + data.buildingName;
      }
      if (extra) addr += ' (' + extra + ')';

      var result = { postal: data.zonecode, address: addr };
      if (typeof arg === 'function') {
        arg(result);
      } else if (arg && typeof arg === 'object') {
        var pEl = arg.postalId ? document.getElementById(arg.postalId) : null;
        var aEl = arg.addressId ? document.getElementById(arg.addressId) : null;
        if (pEl) pEl.value = result.postal;
        if (aEl) aEl.value = result.address;
        // 변경 이벤트 발생 (다른 리스너용)
        if (pEl) pEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (aEl) aEl.dispatchEvent(new Event('input', { bubbles: true }));
        // 상세주소 입력칸으로 포커스 이동
        if (arg.detailFocusId) {
          var dEl = document.getElementById(arg.detailFocusId);
          if (dEl) setTimeout(function() { dEl.focus(); }, 100);
        }
      }
    },
    width: '100%',
    height: '100%',
  }).open({ popupTitle: '우편번호 검색', popupKey: 'postcodePopup' });
};

// === Auth Check ===
var __authExpiredShown = false;
var __redirecting = false;
function handleAuthExpired() {
    if (__authExpiredShown || __redirecting) return;
    __authExpiredShown = true;
    __redirecting = true;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

const token = localStorage.getItem('token');
if (!token) {
    handleAuthExpired();
    throw new Error('No auth token');
}
// 로컬 exp 빠른 체크 (시계 오차 60초 여유)
try {
    var __parts = token.split('.');
    if (__parts.length === 3) {
        var __payload = JSON.parse(atob(__parts[1]));
        if (__payload.exp && __payload.exp <= Math.floor(Date.now() / 1000) - 60) {
            handleAuthExpired();
            throw new Error('Token expired');
        }
    }
} catch(e) {
    if (e.message === 'Token expired' || e.message === 'No auth token') throw e;
    // JWT 파싱 실패 시 (corrupt token) — 토큰 제거 후 로그인으로
    console.warn('[Auth] Token parse error, clearing:', e.message);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Token parse error');
}

axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;

// 로컬 체크 통과 → 페이지 즉시 로드. 서버 무효 시 첫 API 호출에서 401 인터셉터가 처리.

// === authFetch: fetch() wrapper with auto token ===
window.authFetch = function(url, options) {
    options = options || {};
    var t = localStorage.getItem('token');
    if (!t) { handleAuthExpired(); return Promise.reject(new Error('No token')); }
    options.headers = Object.assign({ 'Authorization': 'Bearer ' + t }, options.headers || {});
    return fetch(url, options).then(function(res) {
        if (res.status === 401 && window.location.pathname !== '/login') {
            handleAuthExpired();
            return Promise.reject(new Error('Unauthorized'));
        }
        return res;
    });
};

// === Mobile Sidebar ===
function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
// Close sidebar on nav link click (mobile)
document.querySelectorAll('.sidebar .nav-item').forEach(function(el) {
  el.addEventListener('click', function() {
    if (window.innerWidth <= 768) closeMobileSidebar();
  });
});

// === Sidebar Pin / Groups / Favorites ===
function toggleSidebarPin() {
  var sb = document.getElementById('sidebar');
  sb.classList.toggle('pinned');
  localStorage.setItem('sidebar-pinned', sb.classList.contains('pinned') ? '1' : '0');
}

function toggleSidebarGroup(gi) {
  var items = document.getElementById('groupItems' + gi);
  var header = items.previousElementSibling;
  if (!items || !header) return;
  var collapsed = items.classList.toggle('collapsed');
  if (collapsed) header.classList.add('collapsed');
  else header.classList.remove('collapsed');
  // Save state
  var state = {};
  try { state = JSON.parse(localStorage.getItem('sidebar-groups') || '{}'); } catch(e) {}
  state['g' + gi] = collapsed;
  localStorage.setItem('sidebar-groups', JSON.stringify(state));
}

function toggleFavorite(path) {
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem('sidebar-favorites') || '[]'); } catch(e) {}
  var idx = favs.indexOf(path);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(path);
  localStorage.setItem('sidebar-favorites', JSON.stringify(favs));
  renderFavorites();
  updateFavStars();
}

function renderFavorites() {
  var container = document.getElementById('sidebarFavorites');
  if (!container) return;
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem('sidebar-favorites') || '[]'); } catch(e) {}
  if (favs.length === 0) { container.innerHTML = ''; return; }
  var html = '<div class="group-label" style="opacity:1;height:auto;font-size:9px;color:#eab308;padding:8px 18px 2px;"><i class="fas fa-star" style="margin-right:4px;"></i>즐겨찾기</div>';
  var allItems = document.querySelectorAll('.sidebar-nav .nav-item[data-path]');
  var itemMap = {};
  allItems.forEach(function(el) { itemMap[el.getAttribute('data-path')] = el; });
  favs.forEach(function(path) {
    var orig = itemMap[path];
    if (!orig || orig.style.display === 'none') return;
    var icon = orig.querySelector('i.fas');
    var label = orig.querySelector('.nav-label');
    if (!icon || !label) return;
    var isActive = window.location.pathname === path ? ' active' : '';
    html += '<a href="' + path + '" class="nav-item' + isActive + '" title="' + label.textContent + '"><i class="fas ' + icon.className.replace('fas ', '') + '"></i><span class="nav-label">' + label.textContent + '</span></a>';
  });
  container.innerHTML = html;
}

function updateFavStars() {
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem('sidebar-favorites') || '[]'); } catch(e) {}
  document.querySelectorAll('.sidebar-nav .nav-item[data-path]').forEach(function(el) {
    var path = el.getAttribute('data-path');
    if (favs.indexOf(path) >= 0) el.classList.add('is-fav');
    else el.classList.remove('is-fav');
  });
}

function initSidebarState() {
  // Pin state
  if (localStorage.getItem('sidebar-pinned') === '1') {
    document.getElementById('sidebar').classList.add('pinned');
  }
  // Group collapse state
  try {
    var state = JSON.parse(localStorage.getItem('sidebar-groups') || '{}');
    Object.keys(state).forEach(function(key) {
      if (!state[key]) return;
      var gi = key.replace('g', '');
      var items = document.getElementById('groupItems' + gi);
      var header = items ? items.previousElementSibling : null;
      if (items) items.classList.add('collapsed');
      if (header) header.classList.add('collapsed');
    });
  } catch(e) {}
  // Favorites
  renderFavorites();
  updateFavStars();
}
initSidebarState();

// === Nav Badge Polling ===
async function pollNavBadges() {
  try {
    var res = await fetch('/api/notifications/nav-badges', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    var data = await res.json();
    if (!data.success) return;
    var badges = data.data || {};
    Object.keys(badges).forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var count = badges[id];
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : String(count);
        el.classList.add('visible');
      } else {
        el.classList.remove('visible');
      }
    });
  } catch(e) {}
}
pollNavBadges();
setInterval(pollNavBadges, 60000); // 1분

// 401 interceptor — delegates to handleAuthExpired
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response && error.response.status === 401 && window.location.pathname !== '/login') {
            handleAuthExpired();
        }
        return Promise.reject(error);
    }
);

// User info + role filtering
const __userStr = localStorage.getItem('user');
let currentUserRole = null;
if (__userStr) {
    try {
        const __user = JSON.parse(__userStr);
        currentUserRole = __user.role;
        // #510: 역할 라벨 SSOT = window.ROLE_NAMES(types/roles.ts→HR_ENUMS_JS, 이 스크립트 직전 주입).
        //       하드코딩 사본 제거. 만약을 위한 최소 폴백만 유지.
        const __roleMap = window.ROLE_NAMES || { 'ADMIN': '관리자', 'MANAGER': '매니저', 'DESIGNER': '디자이너', 'OPERATOR': '작업자' };

        const sidebarUserName = document.getElementById('sidebarUserName');
        if (sidebarUserName) sidebarUserName.textContent = __user.name || __user.username || '-';

        const topBarUserName = document.getElementById('topBarUserName');
        if (topBarUserName) topBarUserName.textContent =
            (__user.name || __user.username || '-') + ' (' + (__roleMap[__user.role] || __user.role) + ')';

    } catch(e) { console.error('User parse error:', e); }
}

// user 키 유실 복구 — 토큰은 살아있는데 user만 없으면 역할 기반 UI가 조용히 사라진다
// (실측: 자금관리 '실적' 탭이 role 미상으로 숨겨짐). /api/auth/me로 재수집 후 재적용.
if (!__userStr && token) {
    axios.get('/api/auth/me').then(function(r) {
        var u = r && r.data && r.data.data;
        if (!u) return;
        localStorage.setItem('user', JSON.stringify(u));
        currentUserRole = u.role;
        var __rm = window.ROLE_NAMES || { 'ADMIN': '관리자', 'MANAGER': '매니저', 'DESIGNER': '디자이너', 'OPERATOR': '작업자' };
        var __sn = document.getElementById('sidebarUserName');
        if (__sn) __sn.textContent = u.name || u.username || '-';
        var __tn = document.getElementById('topBarUserName');
        if (__tn) __tn.textContent = (u.name || u.username || '-') + ' (' + (__rm[u.role] || u.role) + ')';
        // 페이지 스크립트는 이미 동기 실행됐으므로 역할 게이트를 다시 적용할 기회를 준다
        window.dispatchEvent(new CustomEvent('ds-user-restored', { detail: { role: u.role } }));
    }).catch(function() {});
}

// ═══ Entities 공용 캐시 + 헬퍼 (법인 select 동적화) ═══
// 향후 사업자 추가 시 DB(entities) INSERT만으로 모든 select/라벨에 자동 반영 (하드코딩 제거).
(function(){
    function __escEnt(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
    window.__entities = window.__entities || null;
    window.__entitiesPromise = window.__entitiesPromise || null;
    window.loadEntities = function() {
        if (window.__entities) return Promise.resolve(window.__entities);
        if (window.__entitiesPromise) return window.__entitiesPromise;
        var tk = localStorage.getItem('token');
        window.__entitiesPromise = fetch('/api/auth/entities', { headers: tk ? { 'Authorization': 'Bearer ' + tk } : {} })
            .then(function(r){ return r.json(); })
            .then(function(d){ window.__entities = (d && d.success && d.data) ? d.data : []; return window.__entities; })
            .catch(function(){ window.__entities = []; return window.__entities; });
        return window.__entitiesPromise;
    };
    // id → 약칭(short_name). 캐시 미로드 시 id 문자열 fallback.
    window.entityName = function(id) {
        if (id == null || id === '') return '-';
        var list = window.__entities || [];
        for (var i = 0; i < list.length; i++) { if (list[i].id === Number(id)) return list[i].short_name; }
        return String(id);
    };
    // select 옵션을 entities로 채우고 selectedId 선택 (async — entities 로드 후).
    window.fillEntitySelect = function(sel, selectedId, opts) {
        if (!sel) return Promise.resolve();
        opts = opts || {};
        return window.loadEntities().then(function(list){
            var html = opts.includeAll ? '<option value="0">전체 (합산)</option>' : '';
            for (var i = 0; i < list.length; i++) {
                html += '<option value="' + list[i].id + '">' + __escEnt(list[i].short_name) + '</option>';
            }
            sel.innerHTML = html;
            if (selectedId != null && selectedId !== '') sel.value = String(selectedId);
        });
    };
})();

// ═══ 날짜 입력 flatpickr 달력 초기화 (공용) ═══
// .js-fp 클래스가 붙은 input에 flatpickr 적용. 년/월 헤더로 빠른 이동(생년월일처럼 오래된 날짜에 유용).
// allowInput:true → 텍스트 직접 입력도 허용(자동하이픈과 병행). CDN 미로드 시 안전하게 무시.
window.hrInitDatePickers = function(rootSel) {
    if (typeof flatpickr === 'undefined') return;
    var root = rootSel ? document.querySelector(rootSel) : document;
    if (!root) return;
    var els = root.querySelectorAll('.js-fp');
    for (var i = 0; i < els.length; i++) {
        if (els[i]._flatpickr) els[i]._flatpickr.destroy();
        flatpickr(els[i], {
            dateFormat: 'Y-m-d',
            allowInput: true,
            disableMobile: true,
            locale: (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.ko) ? flatpickr.l10ns.ko : undefined
        });
    }
};
// 정적 마크업 .js-fp 자동 초기화 — 페이지별 호출 불요. 동적 삽입(innerHTML) 후에만 hrInitDatePickers(rootSel) 직접 호출.
document.addEventListener('DOMContentLoaded', function() { window.hrInitDatePickers(); });

// ═══ Entity Switcher (법인 전환) ═══
var __currentEntityId = 1;
(function initEntitySwitcher() {
    try {
        var t = localStorage.getItem('token');
        if (t) {
            var parts = t.split('.');
            if (parts.length === 3) {
                var p = JSON.parse(atob(parts[1]));
                __currentEntityId = (p.entityId != null) ? p.entityId : 1;
            }
        }
    } catch(e) {}
    localStorage.setItem('entityId', String(__currentEntityId));

    var __et = localStorage.getItem('token');
    if (!__et) {
        var n = document.getElementById('entityName');
        if (n) n.textContent = '-';
        return;
    }
    window.loadEntities().then(function(entities) {
        if (!entities || entities.length === 0) {
            var n2 = document.getElementById('entityName');
            if (n2) n2.textContent = '-';
            return;
        }
        var nameEl = document.getElementById('entityName');
        var ddEl = document.getElementById('entityDropdown');
        var arrowEl = document.getElementById('entityArrow');

        var current = entities.find(function(e) { return e.id === __currentEntityId; });
        if (nameEl) nameEl.textContent = __currentEntityId === 0 ? '전체 (합산)' : (current ? current.short_name : (entities[0] ? entities[0].short_name : '-'));

        if (ddEl) {
            var html = '';
            entities.forEach(function(e) {
                var isActive = e.id === __currentEntityId;
                html += '<div onclick="switchEntity(' + e.id + ')" class="sidebar-entity-item' + (isActive ? ' active' : '') + '">'
                    + (isActive ? '<i class="fas fa-check"></i>' : '<span class="sidebar-entity-spacer"></span>')
                    + escapeHtml(e.short_name)
                    + '</div>';
            });
            if (currentUserRole === 'ADMIN') {
                html += '<div class="sidebar-entity-sep"></div>';
                var allActive = __currentEntityId === 0;
                html += '<div onclick="switchEntity(0)" class="sidebar-entity-item' + (allActive ? ' active' : '') + '">'
                    + (allActive ? '<i class="fas fa-check"></i>' : '<span class="sidebar-entity-spacer"></span>')
                    + '전체 (합산)</div>';
            }
            ddEl.innerHTML = html;
        }

        // 일반 직원은 드롭다운 비활성
        var btn = document.getElementById('entitySwitcherBtn');
        if (btn && currentUserRole && !['ADMIN','MANAGER'].includes(currentUserRole)) {
            btn.style.cursor = 'default';
            if (arrowEl) arrowEl.style.display = 'none';
        }
    }).catch(function(err) {
        var nameEl = document.getElementById('entityName');
        if (nameEl) nameEl.textContent = '-';
    });
})();

window.toggleEntityDropdown = function() {
    if (currentUserRole && !['ADMIN','MANAGER'].includes(currentUserRole)) return;
    var dd = document.getElementById('entityDropdown');
    var arrow = document.getElementById('entityArrow');
    if (dd) {
        var isHidden = getComputedStyle(dd).display === 'none';
        dd.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.style.transform = isHidden ? 'rotate(180deg)' : '';
    }
};

window.switchEntity = function(entityId) {
    var dd = document.getElementById('entityDropdown');
    var arrow = document.getElementById('entityArrow');
    if (dd) dd.style.display = 'none';
    if (arrow) arrow.style.transform = '';
    if (entityId === __currentEntityId) return;

    axios.post('/api/auth/switch-entity', { entity_id: entityId })
        .then(function(res) {
            if (res.data.success) {
                localStorage.setItem('token', res.data.data.token);
                localStorage.setItem('entityId', String(entityId));
                axios.defaults.headers.common['Authorization'] = 'Bearer ' + res.data.data.token;
                window.location.reload();
            }
        })
        .catch(function(err) {
            showToast('법인 전환 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
        });
};

// 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
    var wrap = document.getElementById('entitySwitcher');
    var dd = document.getElementById('entityDropdown');
    if (wrap && dd && !wrap.contains(e.target)) {
        dd.style.display = 'none';
        var arrow = document.getElementById('entityArrow');
        if (arrow) arrow.style.transform = '';
    }
});

// Filter sidebar by page permissions (DB-driven, via /api/permissions/me)
// ADMIN: 모두 표시. 그 외: API 로 받은 page_key 만 표시. 빈 그룹은 헤더도 숨김.
(function applyPagePermissions() {
    if (!currentUserRole) {
        document.body.classList.remove('perm-checking');
        return;
    }
    const navItems = document.querySelectorAll('.nav-item[data-page-key]');
    if (currentUserRole === 'ADMIN') {
        // ADMIN 은 모두 표시 (그룹 정리도 불필요) — FOUC 가드 즉시 해제
        document.body.classList.remove('perm-checking');
        return;
    }
    // FOUC 가드: 권한 fetch 완료 전까지 페이지 본문 숨김 (CSS body.perm-checking)
    document.body.classList.add('perm-checking');
    // 우선 사이드바 모두 숨김 → API 응답 후 허용된 것만 노출
    navItems.forEach(el => { el.style.display = 'none'; });
    const __token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    fetch('/api/permissions/me', {
        headers: __token ? { 'Authorization': 'Bearer ' + __token } : {}
    }).then(r => r.json()).then(res => {
        if (!res || !res.success) return;
        const allowedSet = new Set((res.data && res.data.pages) || []);
        navItems.forEach(el => {
            const key = el.getAttribute('data-page-key');
            if (allowedSet.has(key)) el.style.display = '';
        });
        // 빈 그룹 헤더 숨김
        document.querySelectorAll('.group-items').forEach(group => {
            const items = Array.from(group.querySelectorAll('.nav-item[data-page-key]'));
            const anyVisible = items.some(el => el.style.display !== 'none');
            if (!anyVisible) {
                group.style.display = 'none';
                const header = group.previousElementSibling;
                if (header && header.classList.contains('group-header')) header.style.display = 'none';
                const sep = header && header.previousElementSibling;
                if (sep && sep.classList.contains('group-sep')) sep.style.display = 'none';
            }
        });
        // 현재 페이지가 허용 안 된 페이지면 차단 (비-SPA 초기 로드에서 서버는 통과시킴 → 클라이언트 가드)
        const currentPath = window.location.pathname;
        // 권한 마스터에 등록된 페이지인지 + 허용되지 않았는지
        const navItemForCurrent = document.querySelector('.nav-item[data-page-key="' + currentPath + '"]');
        const isManagedPage = !!navItemForCurrent;
        if (isManagedPage && !allowedSet.has(currentPath)) {
            // /no-permission 안내 페이지로 이동 — ?from 으로 차단된 경로 전달
            window.location.href = '/no-permission?from=' + encodeURIComponent(currentPath);
            return;
        }
        // 권한 0개 사용자가 사이드바를 모두 잃은 경우, /no-permission 으로 유도 (무한 루프 방지)
        if (allowedSet.size === 0 && currentPath !== '/no-permission' && currentPath !== '/login') {
            window.location.href = '/no-permission';
            return;
        }
        // 허용된 페이지면 본문 노출. 차단되어 redirect 예정이면 가드 유지 (300ms 후 setTimeout 으로 이동).
        if (!isManagedPage || allowedSet.has(currentPath)) {
            document.body.classList.remove('perm-checking');
        }
    }).catch(e => {
        console.error('permissions fetch error:', e);
        // 에러 시 일단 본문은 노출 (사용자 잠금 방지)
        document.body.classList.remove('perm-checking');
    });
})();

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('로그아웃 하시겠습니까?')) {
        try { await axios.post('/api/auth/logout'); } catch(e) {}
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        window.location.href = '/login';
    }
});

// === Token Refresh ===
async function checkTokenRefresh() {
    var t = localStorage.getItem('token');
    if (!t) return;
    try {
        var parts = t.split('.');
        if (parts.length !== 3) return;
        var payload = JSON.parse(atob(parts[1]));
        var now = Math.floor(Date.now() / 1000);
        var timeLeft = payload.exp - now;

        if (timeLeft <= -60) { // 시계 오차 60초 여유
            handleAuthExpired();
            return;
        }
        if (timeLeft < 7200) {
            try {
                var res = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + t }
                });
                if (!res.ok) {
                    if (res.status === 401) { handleAuthExpired(); return; }
                    return; // 5xx 등은 무시 (다음 주기에 재시도)
                }
                var data = await res.json();
                if (data.success && data.refreshed && data.data && data.data.token) {
                    localStorage.setItem('token', data.data.token);
                    axios.defaults.headers.common['Authorization'] = 'Bearer ' + data.data.token;
                    console.log('[Auth] Token refreshed');
                }
            } catch(fetchErr) {
                console.warn('[Auth] Token refresh network error (will retry):', fetchErr.message);
            }
        }
    } catch(e) {
        console.warn('[Auth] Token refresh check failed:', e);
    }
}
checkTokenRefresh();
setInterval(checkTokenRefresh, 1800000); // 30분마다

// === 글로벌 더블클릭 방지 헬퍼 ===
// 사용법: safeSubmit(btn, async () => { await axios.post(...) })
// btn이 있으면 즉시 disable + 스피너로 더블클릭/중복제출 차단, 없으면 asyncFn만 실행(가드 없이).
// #420: innerHTML 보존(아이콘 버튼 안전) + btn=null이어도 asyncFn 실행(기존 early-return 버그 수정) + 반환값 전달.
async function safeSubmit(btn, asyncFn) {
    if (btn) {
        if (btn.disabled) return;            // 이미 처리중 → 중복 클릭 무시
        btn.disabled = true;
        btn.dataset.origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    try {
        return await asyncFn();
    } finally {
        if (btn) {
            btn.disabled = false;
            if (btn.dataset.origHtml !== undefined) {
                btn.innerHTML = btn.dataset.origHtml;
                delete btn.dataset.origHtml;
            }
        }
    }
}
window.safeSubmit = safeSubmit;
// #420: 인라인 onclick 핸들러에서 트리거 버튼을 동기적으로 캡처(전역 event는 await 후 무효).
window.eventButton = function() {
    try { return (typeof event !== 'undefined' && event && event.target) ? event.target.closest('button') : null; }
    catch (e) { return null; }
};

// === Toast utility ===
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast-item ' + type;
    // message는 서버 에러 문자열이 그대로 릴레이될 수 있어 escape 필수. 개행만 <br>로 허용.
    toast.innerHTML = '<i class="fas ' +
        (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle') +
        ' mr-2"></i>' + window.escapeHtml(String(message == null ? '' : message)).replace(/\n/g, '<br>');
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// === Field Error utility ===
// 입력 검증 실패 시 toast + 필드 포커스 + 빨간 테두리 (blur/input/change 시 자동 해제)
// 사용: showFieldError('qtyInput', '수량을 입력하세요') 또는 showFieldError(element, msg)
function showFieldError(fieldOrId, message) {
    showToast(message, 'error');
    if (!fieldOrId) return;
    var el = typeof fieldOrId === 'string' ? document.getElementById(fieldOrId) : fieldOrId;
    if (!el) return;
    el.classList.add('field-error');
    try { el.focus(); } catch (e) {}
    var clear = function() {
        el.classList.remove('field-error');
        el.removeEventListener('blur', clear);
        el.removeEventListener('input', clear);
        el.removeEventListener('change', clear);
    };
    el.addEventListener('blur', clear);
    el.addEventListener('input', clear);
    el.addEventListener('change', clear);
}
window.showFieldError = showFieldError;
window.showToast = showToast;

// === Confirm Modal (confirm() 대체) ===
window.showConfirm = function(message, options) {
  options = options || {};
  var title = options.title || '확인';
  var confirmText = options.confirmText || '확인';
  var cancelText = options.cancelText || '취소';
  var danger = options.danger || false;

  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'ds-modal-overlay';
    overlay.style.zIndex = '9999';
    overlay.innerHTML =
      '<div class="ds-modal" style="max-width:420px">' +
        '<div class="ds-modal-header">' +
          '<h3 style="font-size:15px"></h3>' +
        '</div>' +
        '<div class="ds-modal-body" style="padding:20px 24px">' +
          '<p style="font-size:14px;color:#374151;white-space:pre-line;margin:0"></p>' +
        '</div>' +
        '<div class="ds-modal-footer">' +
          '<button class="ds-btn ds-btn-ghost" id="__confirmCancel"></button>' +
          '<button class="ds-btn ' + (danger ? 'ds-btn-danger' : 'ds-btn-primary') + '" id="__confirmOk"></button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    // 텍스트는 textContent로 주입(XSS 방지) — title/message에 거래처명 등 사용자 입력이 들어옴
    overlay.querySelector('h3').textContent = title;
    overlay.querySelector('p').textContent = message == null ? '' : String(message);
    overlay.querySelector('#__confirmCancel').textContent = cancelText;
    overlay.querySelector('#__confirmOk').textContent = confirmText;

    function cleanup(result) {
      document.removeEventListener('keydown', escHandler);
      overlay.remove();
      resolve(result);
    }

    overlay.querySelector('#__confirmOk').addEventListener('click', function() { cleanup(true); });
    overlay.querySelector('#__confirmCancel').addEventListener('click', function() { cleanup(false); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) cleanup(false); });

    // ESC 키로 취소
    function escHandler(e) {
      if (e.key === 'Escape') cleanup(false);
    }
    document.addEventListener('keydown', escHandler);

    // 포커스 설정
    setTimeout(function() { overlay.querySelector('#__confirmOk').focus(); }, 50);
  });
};

// 텍스트 입력 모달(prompt 대체). resolve(입력문자열) / 취소 시 resolve(null).
window.showPrompt = function(message, options) {
  options = options || {};
  var danger = options.danger || false;
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'ds-modal-overlay';
    overlay.style.zIndex = '9999';
    overlay.innerHTML =
      '<div class="ds-modal" style="max-width:420px">' +
        '<div class="ds-modal-header"><h3 style="font-size:15px"></h3></div>' +
        '<div class="ds-modal-body" style="padding:20px 24px">' +
          '<p style="font-size:14px;color:#374151;white-space:pre-line;margin:0 0 10px"></p>' +
          '<textarea id="__promptInput" class="ds-input" style="width:100%;min-height:72px;font-size:14px;padding:8px 10px"></textarea>' +
        '</div>' +
        '<div class="ds-modal-footer">' +
          '<button class="ds-btn ds-btn-ghost" id="__promptCancel"></button>' +
          '<button class="ds-btn ' + (danger ? 'ds-btn-danger' : 'ds-btn-primary') + '" id="__promptOk"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    // 텍스트는 textContent로 주입(XSS 방지)
    overlay.querySelector('h3').textContent = options.title || '입력';
    overlay.querySelector('p').textContent = message || '';
    var input = overlay.querySelector('#__promptInput');
    input.placeholder = options.placeholder || '';
    input.value = options.defaultValue || '';
    overlay.querySelector('#__promptCancel').textContent = options.cancelText || '취소';
    overlay.querySelector('#__promptOk').textContent = options.confirmText || '확인';

    function cleanup(result) { overlay.remove(); document.removeEventListener('keydown', escHandler); resolve(result); }
    overlay.querySelector('#__promptOk').addEventListener('click', function() { cleanup(input.value); });
    overlay.querySelector('#__promptCancel').addEventListener('click', function() { cleanup(null); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) cleanup(null); });
    function escHandler(e) { if (e.key === 'Escape') cleanup(null); }
    document.addEventListener('keydown', escHandler);
    setTimeout(function() { input.focus(); }, 50);
  });
};

// === Table Density Toggle ===
function toggleTableDensity(btn) {
  var wrap = btn.closest('.ds-card, .bg-white, [class*="rounded"]');
  if (!wrap) wrap = btn.parentElement;
  var table = wrap.querySelector('.ds-table') || wrap.parentElement.querySelector('.ds-table');
  if (!table) return;
  table.classList.toggle('ds-table-compact');
  var icon = btn.querySelector('i');
  if (icon) {
    if (table.classList.contains('ds-table-compact')) {
      icon.className = 'fas fa-th text-xs';
      btn.title = '기본 밀도';
    } else {
      icon.className = 'fas fa-th-list text-xs';
      btn.title = '컴팩트 밀도';
    }
  }
}

// === Loading Skeleton Helpers ===
function showTableSkeleton(containerId, rows) {
  rows = rows || 5;
  var el = document.getElementById(containerId);
  if (!el) return;
  var html = '';
  for (var i = 0; i < rows; i++) {
    html += '<div class="ds-skeleton ds-skeleton-row"></div>';
  }
  el.innerHTML = html;
}
function showCardSkeleton(containerId, count) {
  count = count || 4;
  var el = document.getElementById(containerId);
  if (!el) return;
  var html = '';
  for (var i = 0; i < count; i++) {
    html += '<div class="ds-skeleton ds-skeleton-card"></div>';
  }
  el.innerHTML = html;
}

// === Global Search ===
var _searchTimer = null;
function debounceGlobalSearch() {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(doGlobalSearch, 300);
}

async function doGlobalSearch() {
  var q = document.getElementById('globalSearchInput')?.value || '';
  var panel = document.getElementById('searchResults');
  if (q.length < 2) { panel.style.display = 'none'; return; }
  try {
    var res = await fetch('/api/search?q=' + encodeURIComponent(q), {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    var data = await res.json();
    if (!data.success) return;
    var d = data.data;
    var html = '';
    var statusLabels = { CONFIRMED:'확정', PRINTING:'출력중', PRINT_DONE:'출력완료', SHIPPED:'출고완료', HOLD:'보류' };
    if (d.orders.length > 0) {
      html += '<div style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">주문</div>';
      html += d.orders.map(function(o) {
        return '<a href="/orders" style="display:flex;justify-content:space-between;padding:8px 12px;text-decoration:none;color:#1e293b;font-size:13px;border-bottom:1px solid #f8fafc;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'">'
          + '<div><span style="font-weight:500;">' + window.escapeHtml(o.order_number || '') + '</span> <span style="color:#64748b;font-size:12px;">' + window.escapeHtml(o.client_name || '') + '</span></div>'
          + '<span style="font-size:11px;color:#94a3b8;">' + window.escapeHtml(statusLabels[o.status] || o.status || '') + '</span></a>';
      }).join('');
    }
    if (d.clients.length > 0) {
      html += '<div style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">거래처</div>';
      html += d.clients.map(function(c) {
        return '<a href="/clients/' + encodeURIComponent(c.id) + '" style="display:flex;justify-content:space-between;padding:8px 12px;text-decoration:none;color:#1e293b;font-size:13px;border-bottom:1px solid #f8fafc;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'">'
          + '<span style="font-weight:500;">' + window.escapeHtml(c.client_name || '') + '</span>'
          + '</a>';
      }).join('');
    }
    if (d.cards.length > 0) {
      html += '<div style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">카드</div>';
      html += d.cards.map(function(ca) {
        return '<a href="/cards" style="display:flex;justify-content:space-between;padding:8px 12px;text-decoration:none;color:#1e293b;font-size:13px;border-bottom:1px solid #f8fafc;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'">'
          + '<span style="font-weight:500;">' + window.escapeHtml(ca.card_number || 'Card #' + ca.id) + '</span>'
          + '<span style="font-size:11px;color:#94a3b8;">' + window.escapeHtml(statusLabels[ca.status] || ca.status || '') + '</span></a>';
      }).join('');
    }
    if (d.quotations && d.quotations.length > 0) {
      html += '<div style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">견적서</div>';
      html += d.quotations.map(function(qt) {
        return '<a href="/quotations" style="display:flex;justify-content:space-between;padding:8px 12px;text-decoration:none;color:#1e293b;font-size:13px;border-bottom:1px solid #f8fafc;cursor:pointer;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'">'
          + '<div><span style="font-weight:500;">' + window.escapeHtml(qt.quotation_number || '') + '</span> <span style="color:#64748b;font-size:12px;">' + window.escapeHtml(qt.client_name || '') + '</span></div>'
          + '<span style="font-size:11px;color:#94a3b8;">' + window.escapeHtml(qt.status || '') + '</span></a>';
      }).join('');
    }
    if (!html) html = '<div style="text-align:center;color:#9ca3af;padding:16px;font-size:13px;">검색 결과 없음</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  } catch(e) { console.error('Search error:', e); }
}

function closeSearchResults() {
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('globalSearchInput').value = '';
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('#globalSearchWrap')) {
    var sr = document.getElementById('searchResults');
    if (sr) sr.style.display = 'none';
  }
});

// === Notification System ===
var _notifOpen = false;

function toggleNotifPanel() {
  _notifOpen = !_notifOpen;
  document.getElementById('notifPanel').style.display = _notifOpen ? 'block' : 'none';
  if (_notifOpen) loadNotifications();
}

// Close panel on outside click
document.addEventListener('click', function(e) {
  if (_notifOpen && !e.target.closest('#notifWrap')) {
    _notifOpen = false;
    document.getElementById('notifPanel').style.display = 'none';
  }
});

async function loadNotifications() {
  try {
    var res = await fetch('/api/notifications?limit=20', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    var data = await res.json();
    if (!data.success) return;
    updateNotifBadge(data.unread_count);
    var list = document.getElementById('notifList');
    if (!data.data || data.data.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:24px;font-size:13px;">알림이 없습니다.</div>';
      return;
    }
    list.innerHTML = data.data.map(function(n) {
      var cls = n.is_read ? 'notif-item read' : 'notif-item unread';
      var ago = timeAgo(n.created_at);
      return '<div class="' + cls + '" onclick="clickNotif(' + n.id + ', ' + JSON.stringify(n.link || '').replace(/"/g, '&quot;') + ')">'
        + '<div class="notif-dot"></div>'
        + '<div class="notif-body">'
        + '<div class="notif-title">' + escHtml(n.title) + '</div>'
        + (n.message ? '<div class="notif-msg">' + escHtml(n.message) + '</div>' : '')
        + '<div class="notif-time">' + ago + '</div>'
        + '</div></div>';
    }).join('');
  } catch(e) { console.error('Load notifications error:', e); }
}

function escHtml(s) {
  return window.escapeHtml(s);
}

async function clickNotif(id, link) {
  try {
    await fetch('/api/notifications/' + id + '/read', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
  } catch(e) {}
  _notifOpen = false;
  document.getElementById('notifPanel').style.display = 'none';
  if (link) window.location.href = link;
  else pollNotifCount();
}

async function markAllNotifRead() {
  try {
    await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    updateNotifBadge(0);
    loadNotifications();
  } catch(e) {}
}

function updateNotifBadge(count) {
  var badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (count > 0) {
    badge.style.display = '';
    badge.textContent = count > 99 ? '99+' : String(count);
  } else {
    badge.style.display = 'none';
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  // SQLite 타임스탬프(tz표식 없음)를 new Date()로 바로 파싱하면 로컬로 해석돼 9시간 어긋남 → toKstDate로 UTC 정규화
  var d = (window.toKstDate ? window.toKstDate(dateStr) : new Date(dateStr));
  if (!d || isNaN(d.getTime())) return '';
  var now = new Date();
  var diff = Math.floor((now - d) / 1000);
  if (diff < 0) return '방금 전';
  if (diff < 60) return '방금 전';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
  return window.formatKST ? window.formatKST(dateStr, 'date') : d.toLocaleDateString('ko-KR');
}

async function pollNotifCount() {
  try {
    var res = await fetch('/api/notifications/unread-count', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    var data = await res.json();
    if (data.success) updateNotifBadge(data.count);
  } catch(e) {}
}

// Generate scheduled alerts then poll count
async function generateAndPoll() {
  try {
    await fetch('/api/notifications/generate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
  } catch(e) {}
  pollNotifCount();
}

// Initial generate + poll, then every 5 minutes for count, every 10 minutes for generate
// (기존 60초/300초에서 변경 — 45명 동시접속 시 D1 부하 80% 감소)
generateAndPoll();
setInterval(pollNotifCount, 300000);
setInterval(generateAndPoll, 600000);

// === Command Palette (Ctrl+K) ===
var _cmdActive = -1;
var _cmdItems = [];

function openCmdPalette() {
  var el = document.getElementById('cmdPalette');
  el.style.display = 'flex';
  var inp = document.getElementById('cmdInput');
  inp.value = '';
  inp.focus();
  buildCmdResults('');
}

function closeCmdPalette() {
  document.getElementById('cmdPalette').style.display = 'none';
  _cmdActive = -1;
}

function buildCmdResults(query) {
  var results = document.getElementById('cmdResults');
  var html = '';
  _cmdItems = [];
  var q = (query || '').toLowerCase().trim();

  // Collect all nav items visible to current user
  var allLinks = document.querySelectorAll('.sidebar-nav .nav-item[data-path]');
  var pages = [];
  allLinks.forEach(function(el) {
    if (el.style.display === 'none') return;
    var label = el.querySelector('.nav-label');
    var icon = el.querySelector('i.fas');
    if (!label) return;
    pages.push({
      path: el.getAttribute('data-path'),
      label: label.textContent,
      icon: icon ? icon.className.replace('fas ', '') : 'fa-circle'
    });
  });

  // Recent pages
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('recent-pages') || '[]'); } catch(e) {}

  if (!q) {
    // Show recent + all
    if (recent.length > 0) {
      html += '<div class="ds-cmd-group">최근 방문</div>';
      recent.slice(0, 5).forEach(function(path) {
        var pg = pages.find(function(p) { return p.path === path; });
        if (pg) {
          html += '<div class="ds-cmd-item" data-path="' + pg.path + '" onclick="cmdNavigate(\'' + pg.path + '\')"><i class="fas ' + pg.icon + '"></i>' + pg.label + '</div>';
          _cmdItems.push(pg.path);
        }
      });
    }
    html += '<div class="ds-cmd-group">전체 메뉴</div>';
    pages.forEach(function(pg) {
      html += '<div class="ds-cmd-item" data-path="' + pg.path + '" onclick="cmdNavigate(\'' + pg.path + '\')"><i class="fas ' + pg.icon + '"></i>' + pg.label + '</div>';
      _cmdItems.push(pg.path);
    });
  } else {
    // Filter
    var matched = pages.filter(function(pg) { return pg.label.toLowerCase().indexOf(q) >= 0 || pg.path.toLowerCase().indexOf(q) >= 0; });
    if (matched.length === 0) {
      html = '<div style="text-align:center;padding:24px;color:var(--c-text-muted);font-size:13px;">결과 없음</div>';
    } else {
      matched.forEach(function(pg) {
        html += '<div class="ds-cmd-item" data-path="' + pg.path + '" onclick="cmdNavigate(\'' + pg.path + '\')"><i class="fas ' + pg.icon + '"></i>' + pg.label + '</div>';
        _cmdItems.push(pg.path);
      });
    }
  }
  results.innerHTML = html;
  _cmdActive = -1;
}

function filterCmdResults() {
  var q = document.getElementById('cmdInput').value;
  buildCmdResults(q);
}

function cmdKeyHandler(e) {
  var items = document.querySelectorAll('#cmdResults .ds-cmd-item');
  if (e.key === 'Escape') { closeCmdPalette(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); _cmdActive = Math.min(_cmdActive + 1, items.length - 1); highlightCmd(items); }
  if (e.key === 'ArrowUp') { e.preventDefault(); _cmdActive = Math.max(_cmdActive - 1, 0); highlightCmd(items); }
  if (e.key === 'Enter' && _cmdActive >= 0 && _cmdActive < _cmdItems.length) {
    e.preventDefault();
    cmdNavigate(_cmdItems[_cmdActive]);
  }
}

function highlightCmd(items) {
  items.forEach(function(el, i) {
    if (i === _cmdActive) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
    else el.classList.remove('active');
  });
}

function cmdNavigate(path) {
  closeCmdPalette();
  // Track recent
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('recent-pages') || '[]'); } catch(e) {}
  recent = recent.filter(function(p) { return p !== path; });
  recent.unshift(path);
  if (recent.length > 10) recent = recent.slice(0, 10);
  localStorage.setItem('recent-pages', JSON.stringify(recent));
  // Navigate (use SPA if available)
  if (typeof spaNavigate === 'function') {
    // SPA navigate is inside IIFE, so we click the sidebar link instead
  }
  window.location.href = path;
}

// Keyboard shortcut
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    var el = document.getElementById('cmdPalette');
    if (el.style.display === 'none' || !el.style.display) openCmdPalette();
    else closeCmdPalette();
  }
});

// === Scroll shadow on top-bar ===
(function() {
  var tb = document.querySelector('.top-bar');
  if (!tb) return;
  window.addEventListener('scroll', function() {
    if (window.scrollY > 8) tb.classList.add('scrolled');
    else tb.classList.remove('scrolled');
  }, { passive: true });
})();

// Track page visits for "recent"
(function() {
  var path = window.location.pathname;
  if (path === '/login') return;
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('recent-pages') || '[]'); } catch(e) {}
  recent = recent.filter(function(p) { return p !== path; });
  recent.unshift(path);
  if (recent.length > 10) recent = recent.slice(0, 10);
  localStorage.setItem('recent-pages', JSON.stringify(recent));
})();

// === Skeleton Loading Helpers ===
window.dsSkeleton = {
  cards: function(count, cols) {
    cols = cols || 4;
    var html = '<div class="grid grid-cols-' + cols + ' gap-4">';
    for (var i = 0; i < count; i++) html += '<div class="ds-card"><div class="ds-skeleton ds-skeleton-title" style="width:40%;"></div><div class="ds-skeleton ds-skeleton-text" style="width:70%;"></div></div>';
    return html + '</div>';
  },
  table: function(rows, cols) {
    rows = rows || 5; cols = cols || 5;
    var html = '<div class="ds-table-wrap"><table class="ds-table"><thead><tr>';
    for (var c = 0; c < cols; c++) html += '<th><div class="ds-skeleton" style="height:12px;width:' + (50 + Math.random()*40) + 'px;"></div></th>';
    html += '</tr></thead><tbody>';
    for (var r = 0; r < rows; r++) {
      html += '<tr>';
      for (var c = 0; c < cols; c++) html += '<td><div class="ds-skeleton ds-skeleton-text" style="width:' + (50 + Math.random()*50) + '%;"></div></td>';
      html += '</tr>';
    }
    return html + '</tbody></table></div>';
  },
  stat: function(count) {
    count = count || 4;
    var html = '<div class="grid grid-cols-' + count + ' gap-4">';
    for (var i = 0; i < count; i++) html += '<div class="ds-card" style="text-align:center;"><div class="ds-skeleton ds-skeleton-text" style="width:50%;margin:0 auto 8px;"></div><div class="ds-skeleton ds-skeleton-title" style="width:40%;margin:0 auto;"></div></div>';
    return html + '</div>';
  },
  // #421: 조회 페이지 공용 로딩 행 — tbody에 주입(스피너 + 메시지). 전 페이지 일관 포맷.
  loadingRow: function(colspan, message) {
    colspan = colspan || 1;
    message = (message === undefined || message === null) ? '로딩 중...' : message;
    return '<tr><td colspan="' + colspan + '" style="text-align:center;padding:32px 12px;color:#9ca3af;font-size:13px;">'
      + '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>' + message + '</td></tr>';
  },
  // #421: div 컨테이너용 로딩 블록(테이블을 통째로 담는 컨테이너) — loadingRow와 동일 시각 포맷.
  loadingBlock: function(message) {
    message = (message === undefined || message === null) ? '로딩 중...' : message;
    return '<div style="text-align:center;padding:48px 12px;color:#9ca3af;font-size:13px;">'
      + '<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>' + message + '</div>';
  }
};

// === SPA Navigation (Hybrid) ===
// Intercept sidebar link clicks → fetch page → swap content only
(function() {
    let _spaTimers = []; // track setInterval IDs for cleanup
    const _origSetInterval = window.setInterval;
    window.setInterval = function() {
        const id = _origSetInterval.apply(window, arguments);
        _spaTimers.push(id);
        return id;
    };

    function spaCleanup() {
        // Clear all intervals registered by page scripts
        _spaTimers.forEach(id => clearInterval(id));
        _spaTimers = [];
        // Remove dynamic toast container
        const tc = document.getElementById('toast-container');
        if (tc) tc.innerHTML = '';
    }

    async function spaNavigate(url, pushState = true) {
        try {
            const topTitle = document.querySelector('.top-bar-title');
            if (topTitle) topTitle.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>로딩 중...';

            var __t = localStorage.getItem('token');
            const resp = await fetch(url, {
                headers: {
                    'X-SPA-Request': '1',
                    'Authorization': __t ? ('Bearer ' + __t) : ''
                }
            });
            if (!resp.ok) {
                if (resp.status === 401) { handleAuthExpired(); return; }
                window.location.href = url;
                return;
            }

            // Cleanup old page
            spaCleanup();
            const oldPageCSS = document.getElementById('page-css');
            if (oldPageCSS) oldPageCSS.remove();
            const oldPageScript = document.getElementById('page-script');
            if (oldPageScript) oldPageScript.remove();

            const contentType = resp.headers.get('Content-Type') || '';

            if (contentType.includes('application/json')) {
                // Fast path: JSON response from renderPage()
                const data = await resp.json();

                const pageBody = document.querySelector('.page-body');
                if (pageBody) pageBody.innerHTML = data.pageContent;

                if (topTitle) topTitle.textContent = data.title;
                document.title = data.title + ' - ERP+MES';

                if (data.pageCSS) {
                    const style = document.createElement('style');
                    style.id = 'page-css';
                    style.textContent = data.pageCSS;
                    document.head.appendChild(style);
                }

                if (data.pageScript) {
                    const s = document.createElement('script');
                    s.id = 'page-script';
                    s.textContent = data.pageScript;
                    document.body.appendChild(s);
                }
            } else {
                // Non-JSON response — clean full navigation instead of fragile HTML parsing
                console.warn('[SPA] Non-JSON response for', url, '- falling back to full navigation');
                window.location.href = url;
                return;
            }

            // Update active sidebar item
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active');
                if (el.getAttribute('href') === url) el.classList.add('active');
            });

            // Track recent page visit & refresh sidebar sections
            try {
                var rp = JSON.parse(localStorage.getItem('recent-pages') || '[]');
                rp = rp.filter(function(p) { return p !== url; });
                rp.unshift(url);
                if (rp.length > 10) rp = rp.slice(0, 10);
                localStorage.setItem('recent-pages', JSON.stringify(rp));
            } catch(e) {}
            if (typeof renderFavorites === 'function') renderFavorites();

            // SPA 페이지 전환 후 금액 input 자동 바인딩 + 날짜 플랫피커 초기화 (DOMContentLoaded 미발화 경로)
            if (typeof window.bindMoneyInputs === 'function') {
                try { window.bindMoneyInputs(); } catch(e) {}
            }
            if (typeof window.hrInitDatePickers === 'function') {
                try { window.hrInitDatePickers(); } catch(e) {}
            }

            if (pushState) {
                history.pushState({ spaUrl: url }, '', url);
            }

            document.querySelector('.main-content')?.scrollTo(0, 0);

        } catch (err) {
            console.error('[SPA] Navigation failed:', err);
            window.location.href = url;
        }
    }

    // Intercept sidebar navigation clicks
    document.addEventListener('click', function(e) {
        const link = e.target.closest('.sidebar .nav-item[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('http')) return;
        e.preventDefault();
        spaNavigate(href);
    });

    // Handle browser back/forward
    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.spaUrl) {
            spaNavigate(e.state.spaUrl, false);
        }
    });

    // Set initial state
    history.replaceState({ spaUrl: window.location.pathname + window.location.search }, '', window.location.pathname + window.location.search);
})();

// ===================================================
// === 팩스 발송 공통 헬퍼 (전역) — PDF 생성 → 큐 접수 → 상태 폴링 ===
// ===================================================
// 바로빌 팩스는 온프렘 에이전트가 FTP 업로드를 대행하므로 즉시 발송이 아님.
// /api/fax/send 로 큐에 접수 → job_id 를 폴링해 sent/error 를 확인한다.
window.loadHtml2Pdf = function() {
  return new Promise(function(resolve, reject) {
    if (window.html2pdf) return resolve(window.html2pdf);
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js';
    s.onload = function() { resolve(window.html2pdf); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
};
window.blobToBase64 = function(blob) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function() { resolve(String(reader.result).split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
// element → PDF → /api/fax/send (서버가 FTP 업로드+발송, 동기). statusCb(메시지)로 진행상황 보고.
// 반환: { ok:true, receipt } | { ok:false, error }
window.faxSend = async function(element, meta, statusCb) {
  function say(m) { if (typeof statusCb === 'function') statusCb(m); }
  say('PDF 생성 중...');
  await window.loadHtml2Pdf();
  var pdfBlob = await window.html2pdf().set({
    margin: [8, 8, 8, 8],
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(element).outputPdf('blob');
  var base64 = await window.blobToBase64(pdfBlob);

  say('팩스 전송 중...');
  var payload = Object.assign({ file_data: base64 }, meta || {});
  var res = await axios.post('/api/fax/send', payload);
  if (!res.data || !res.data.success) return { ok: false, error: (res.data && res.data.error) || '발송 실패' };
  var d = res.data.data;
  if (d.status === 'SUCCESS') return { ok: true, receipt: d.receipt_num };
  return { ok: false, error: d.message || '발송 실패' };
};

// ===================================================
// === 통합 메시지 발송 모달 (전역) ===
// ===================================================
var _msgChannel = 'kakao';
var _msgContext = {};
var _msgTemplates = [];
var _msgQuill = null;
// MMS 첨부 이미지 (raw base64 JPEG — data URI 접두어 없음). 압축 결과만 보관.
var _msgImageB64 = null;
var _msgImageDataUri = null;

window.openSendMessage = function(opts) {
  opts = opts || {};
  _msgContext = opts.context || {};
  var receiver = opts.receiver || {};

  // 수신자 정보 채우기
  document.getElementById('msgRecvName').value = receiver.name || '';
  document.getElementById('msgRecvAddr').value = receiver.phone || receiver.email || receiver.fax || '';
  _msgContext._receiver = receiver;
  _msgContext._templateVars = opts.templateVars || {};

  // 첨부 이미지 초기화 후, 호출부가 준 시안(imageDataUri)이 있으면 자동 첨부
  clearMsgImage();
  if (opts.imageDataUri) setMsgImageFromDataUri(opts.imageDataUri, opts.imageName || '시안');

  // 기본 채널 설정
  setMsgChannel(opts.defaultChannel || 'kakao');

  // 수신자 연락처에 따라 가용 채널 표시 (카카오톡/SMS/MMS는 항상 활성 — 번호 직접 입력 가능)
  var btnKakao = document.getElementById('msgChKakao');
  var btnSms   = document.getElementById('msgChSms');
  var btnMms   = document.getElementById('msgChMms');
  var btnEmail = document.getElementById('msgChEmail');
  var btnFax   = document.getElementById('msgChFax');
  if (btnKakao) btnKakao.disabled = false;
  if (btnSms)   btnSms.disabled   = false;
  if (btnMms)   btnMms.disabled   = false;
  if (btnEmail) btnEmail.disabled = !receiver.email;
  if (btnFax)   btnFax.disabled   = !receiver.fax;

  // 비활성 채널 스타일
  ['Kakao','Sms','Mms','Email','Fax'].forEach(function(ch) {
    var btn = document.getElementById('msgCh' + ch);
    if (!btn) return;
    if (btn.disabled) btn.classList.add('opacity-40');
    else btn.classList.remove('opacity-40');
  });

  // 채널에 따라 적절한 수신 주소 자동 설정
  updateMsgRecvAddr(receiver);

  // 기본 내용
  document.getElementById('msgBody').value = opts.defaultContent || '';
  document.getElementById('msgSubject').value = opts.defaultSubject || '';
  // 본문 프리필은 setMsgChannel 이후라 바이트 카운터가 0으로 남는다 → 여기서 재계산(SMS/MMS)
  if (_msgChannel === 'sms' || _msgChannel === 'mms') updateMsgByteCounter();

  // 카카오톡 템플릿 로드
  var _autoTpl = opts.autoTemplate || '';
  function applyAutoTemplate() {
    if (!_autoTpl) return;
    var sel = document.getElementById('msgTemplate');
    if (sel) { sel.value = _autoTpl; onMsgTemplateChange(); }
  }
  if (_msgTemplates.length === 0) {
    axios.get('/api/kakao/templates').then(function(res) {
      if (res.data.success) {
        _msgTemplates = (res.data.data || []).filter(function(t) { return t.state === 'S' || t.state === '3'; });
        fillMsgTemplates();
        applyAutoTemplate();
      }
    }).catch(function(){});
  } else {
    fillMsgTemplates();
    applyAutoTemplate();
  }

  document.getElementById('msgSendStatus').textContent = '';
  document.getElementById('msgSendStatus').className = 'text-xs text-gray-400';
  document.getElementById('msgSendBtn').disabled = false;
  var modal = document.getElementById('msgSendModal');
  modal.classList.remove('hidden');
  modal.onclick = function(e) {
    if (e.target === this) closeMsgSendModal();
  };
  // 미리보기 초기화
  if (typeof updateMsgPreview === 'function') updateMsgPreview();
};

function closeMsgSendModal() {
  document.getElementById('msgSendModal').classList.add('hidden');
}

function setMsgChannel(ch) {
  _msgChannel = ch;
  var channelKeys = {kakao:'Kakao', sms:'Sms', mms:'Mms', email:'Email', fax:'Fax'};
  var colors      = {kakao:'blue',  sms:'green', mms:'teal', email:'purple', fax:'gray'};

  Object.keys(channelKeys).forEach(function(c) {
    var btn = document.getElementById('msgCh' + channelKeys[c]);
    if (!btn) return;
    var disabledCls = btn.disabled ? ' opacity-40' : '';
    var pillColors = {kakao:'bg-blue-50 border-2 border-blue-500 text-blue-700', sms:'bg-green-50 border-2 border-green-500 text-green-700', mms:'bg-teal-50 border-2 border-teal-500 text-teal-700', email:'bg-purple-50 border-2 border-purple-500 text-purple-700', fax:'bg-gray-100 border-2 border-gray-400 text-gray-700'};
    if (c === ch) {
      btn.className = 'px-3 py-1.5 rounded-full text-xs font-medium ' + pillColors[c] + disabledCls;
    } else {
      btn.className = 'px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-600' + disabledCls;
    }
  });

  // 채널별 폼 전환
  var kakaoArea   = document.getElementById('msgKakaoArea');
  var subjectArea = document.getElementById('msgSubjectArea');
  var subjectHint = document.getElementById('msgSubjectHint');
  var recvLabel   = document.getElementById('msgRecvLabel');
  var byteCounter = document.getElementById('msgByteCounter');
  var channelInfo = document.getElementById('msgChannelInfo');
  var sendBtn     = document.getElementById('msgSendBtn');
  var recvAddr    = document.getElementById('msgRecvAddr');
  var imageArea   = document.getElementById('msgImageArea');

  // 이미지 첨부는 MMS 전용
  if (imageArea) imageArea.classList.toggle('hidden', ch !== 'mms');

  if (ch === 'kakao') {
    kakaoArea.classList.remove('hidden');
    subjectArea.classList.add('hidden');
    byteCounter.classList.add('hidden');
    recvLabel.textContent = '수신번호';
    recvAddr.placeholder  = '010-0000-0000';
    channelInfo.textContent = '카카오톡';
    channelInfo.className = 'text-xs text-blue-600 font-medium';
    sendBtn.className = 'px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700';
  } else if (ch === 'sms') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    if (subjectHint) subjectHint.textContent = '(입력 시 LMS 전환)';
    byteCounter.classList.remove('hidden');
    recvLabel.textContent = '수신번호';
    recvAddr.placeholder  = '010-0000-0000';
    channelInfo.textContent = 'SMS';
    channelInfo.className = 'text-xs text-green-600 font-medium';
    sendBtn.className = 'px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700';
    updateMsgByteCounter();
  } else if (ch === 'mms') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    if (subjectHint) subjectHint.textContent = '(MMS 제목)';
    byteCounter.classList.remove('hidden');
    recvLabel.textContent = '수신번호';
    recvAddr.placeholder  = '010-0000-0000';
    channelInfo.textContent = 'MMS';
    channelInfo.className = 'text-xs text-teal-600 font-medium';
    sendBtn.className = 'px-5 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700';
    updateMsgByteCounter();
  } else if (ch === 'email') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    if (subjectHint) subjectHint.textContent = '';
    byteCounter.classList.add('hidden');
    recvLabel.textContent = '수신 이메일';
    recvAddr.placeholder  = 'email@example.com';
    channelInfo.textContent = '이메일';
    channelInfo.className = 'text-xs text-purple-600 font-medium';
    sendBtn.className = 'px-5 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700';
    // Quill 에디터 활성화
    initMsgQuill();
  } else if (ch === 'fax') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    if (subjectHint) subjectHint.textContent = '';
    byteCounter.classList.add('hidden');
    recvLabel.textContent = '수신 팩스번호';
    recvAddr.placeholder  = '042-000-0000';
    channelInfo.textContent = '팩스 (준비 중)';
    channelInfo.className = 'text-xs text-gray-500 font-medium';
    sendBtn.className = 'px-5 py-2 bg-gray-400 text-white rounded-lg text-sm cursor-not-allowed';
  }

  // 수신 주소 자동 전환
  if (_msgContext._receiver) updateMsgRecvAddr(_msgContext._receiver);

  // textarea ↔ Quill 에디터 전환
  var textAreaWrap = document.getElementById('msgBodyTextArea');
  var editorWrap = document.getElementById('msgBodyEditorArea');
  if (ch === 'email') {
    if (textAreaWrap) textAreaWrap.classList.add('hidden');
    if (editorWrap) editorWrap.classList.remove('hidden');
  } else {
    if (textAreaWrap) textAreaWrap.classList.remove('hidden');
    if (editorWrap) editorWrap.classList.add('hidden');
  }

  // 포털 링크: client_id가 있을 때만 표시
  var portalArea = document.getElementById('msgPortalLinkArea');
  if (portalArea) {
    portalArea.classList.toggle('hidden', !_msgContext || !_msgContext.client_id);
  }

  // 예약 발송: 카카오톡/SMS/MMS 지원 (바로빌 SendDT 파라미터 공통)
  var scheduleArea = document.getElementById('msgScheduleArea');
  if (scheduleArea) {
    scheduleArea.classList.toggle('hidden', ch !== 'kakao' && ch !== 'sms' && ch !== 'mms');
  }

  // 미리보기 전환
  ['Kakao','Sms','Mms','Email','Fax'].forEach(function(name) {
    var preview = document.getElementById('msgPreview' + name);
    if (preview) preview.classList.toggle('hidden', name.toLowerCase() !== ch);
  });
  updateMsgPreview();
}

function updateMsgRecvAddr(receiver) {
  if (!receiver) return;
  _msgContext._receiver = receiver;
  var addr = document.getElementById('msgRecvAddr');
  if (!addr) return;
  if (_msgChannel === 'kakao' || _msgChannel === 'sms' || _msgChannel === 'mms') addr.value = receiver.phone || '';
  else if (_msgChannel === 'email') addr.value = receiver.email || '';
  else if (_msgChannel === 'fax')   addr.value = receiver.fax   || '';
}

function fillMsgTemplates() {
  var sel = document.getElementById('msgTemplate');
  if (!sel) return;
  sel.innerHTML = '<option value="">직접 작성</option>' + _msgTemplates.map(function(t) {
    return '<option value="' + (t.templateCode || '') + '">' + (t.templateName || t.templateCode || '') + '</option>';
  }).join('');
}

function onMsgTemplateChange() {
  var code = document.getElementById('msgTemplate').value;
  if (!code) return;
  var tpl = _msgTemplates.find(function(t) { return t.templateCode === code; });
  if (!tpl) return;
  var body = tpl.template || tpl.content || '';
  // 템플릿 변수 자동 치환 (openSendMessage에서 전달된 templateVars)
  var vars = _msgContext._templateVars || {};
  Object.keys(vars).forEach(function(key) {
    body = body.replace(new RegExp('#\{' + key + '\}', 'g'), vars[key] || '');
  });
  document.getElementById('msgBody').value = body;
  // 템플릿 본문을 바꾼 뒤 미리보기 패널·바이트 카운터도 동기화 (없으면 미리보기가 이전 내용 유지)
  if (_msgChannel === 'sms' && typeof updateMsgByteCounter === 'function') updateMsgByteCounter();
  if (typeof updateMsgPreview === 'function') updateMsgPreview();
}

function updateMsgByteCounter() {
  var bodyEl = document.getElementById('msgBody');
  var subjEl = document.getElementById('msgSubject');
  if (!bodyEl) return;
  var body  = bodyEl.value;
  var bytes = 0;
  for (var i = 0; i < body.length; i++) bytes += body.charCodeAt(i) > 127 ? 2 : 1;
  var subj  = subjEl ? subjEl.value.trim() : '';
  var isLms = bytes > 90 || subj.length > 0;
  var infoEl   = document.getElementById('msgChannelInfo');
  var counterEl = document.getElementById('msgByteCounter');
  // MMS는 항상 장문 규격(2000byte) — SMS/LMS 자동전환 라벨을 덮어쓰지 않는다.
  if (_msgChannel === 'mms') {
    if (infoEl)    infoEl.textContent    = 'MMS';
    if (counterEl) counterEl.textContent = bytes + ' / 2000 byte';
    return;
  }
  if (infoEl)    infoEl.textContent    = isLms ? 'LMS' : 'SMS';
  if (counterEl) counterEl.textContent = bytes + ' / ' + (isLms ? '2000' : '90') + ' byte';
}

function initMsgQuill() {
  if (_msgQuill) return;
  if (typeof Quill === 'undefined') return;
  _msgQuill = new Quill('#msgQuillEditor', {
    theme: 'snow',
    placeholder: '이메일 내용을 작성하세요...',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link', 'image'],
        ['clean']
      ]
    }
  });
  _msgQuill.on('text-change', function() { updateMsgPreview(); });
}

function getMsgBody() {
  if (_msgChannel === 'email' && _msgQuill) {
    return _msgQuill.root.innerHTML;
  }
  return document.getElementById('msgBody').value.trim();
}

function toggleScheduleInput() {
  var checked = document.getElementById('msgScheduleToggle').checked;
  document.getElementById('msgScheduleInput').classList.toggle('hidden', !checked);
  if (checked) {
    // 기본값: 1시간 후
    var d = new Date(Date.now() + 3600000);
    d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10, 0, 0);
    document.getElementById('msgScheduleAt').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
}

// ===== MMS 첨부 이미지 (선택 → JPG 리사이즈·압축 → 미리보기) =====
// Cloudflare Workers엔 이미지 처리기가 없어 리사이즈/압축은 브라우저 canvas 담당.
// 상한(window.MMS_IMAGE)은 서버 constants/barobillCodes.ts 단일 소스에서 주입된다.
function _mmsLimits() {
  var L = window.MMS_IMAGE || {};
  return { maxBytes: L.MAX_BYTES || 300 * 1024, maxPx: L.MAX_PX || 1000 };
}

function _msgB64Bytes(b64) {
  if (!b64) return 0;
  var pad = b64.slice(-2) === '==' ? 2 : b64.slice(-1) === '=' ? 1 : 0;
  return Math.floor(b64.length * 3 / 4) - pad;
}

// dataUri → 긴 변 maxPx 이하 + maxBytes 이하 JPEG dataUri. 품질을 단계적으로 낮추고,
// 그래도 초과하면 해상도를 75%씩 줄여 재시도한다. 실패 시 null.
function _msgCompressImage(dataUri) {
  var lim = _mmsLimits();
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h) { resolve(null); return; }
      var scale = Math.min(1, lim.maxPx / Math.max(w, h));
      for (var attempt = 0; attempt < 4; attempt++) {
        var cw = Math.max(1, Math.round(w * scale));
        var chh = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = chh;
        var ctx = canvas.getContext('2d');
        // JPEG는 투명을 지원하지 않음 → 흰 배경 선칠(투명 PNG 시안이 검게 나오는 것 방지)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, chh);
        ctx.drawImage(img, 0, 0, cw, chh);
        var qualities = [0.85, 0.7, 0.55, 0.4];
        for (var qi = 0; qi < qualities.length; qi++) {
          var out = canvas.toDataURL('image/jpeg', qualities[qi]);
          var b64 = out.slice(out.indexOf('base64,') + 7);
          if (_msgB64Bytes(b64) <= lim.maxBytes) { resolve(out); return; }
        }
        scale = scale * 0.75;
      }
      resolve(null);
    };
    img.onerror = function() { resolve(null); };
    img.src = dataUri;
  });
}

// 다른 화면(메시지 대량발송 등)에서도 동일 규칙으로 압축하도록 전역 노출.
// 상한은 window.MMS_IMAGE(서버 constants 주입) 단일 소스.
window.compressImageForMms = _msgCompressImage;
window.mmsImageBytes = _msgB64Bytes;

async function setMsgImageFromDataUri(dataUri, label) {
  var infoEl  = document.getElementById('msgImageInfo');
  var clearEl = document.getElementById('msgImageClearBtn');
  if (infoEl) infoEl.textContent = '이미지 처리 중...';
  var compressed = await _msgCompressImage(dataUri);
  if (!compressed) {
    _msgImageB64 = null; _msgImageDataUri = null;
    if (infoEl) infoEl.textContent = '이미지 처리 실패 (다른 파일을 사용해주세요)';
    updateMsgPreview();
    return false;
  }
  _msgImageDataUri = compressed;
  _msgImageB64 = compressed.slice(compressed.indexOf('base64,') + 7);
  if (infoEl) infoEl.textContent = (label || '이미지') + ' · ' + Math.round(_msgB64Bytes(_msgImageB64) / 1024) + 'KB';
  if (clearEl) clearEl.classList.remove('hidden');
  updateMsgPreview();
  return true;
}
window.setMsgImageFromDataUri = setMsgImageFromDataUri;

function onMsgImagePick(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) { setMsgImageFromDataUri(e.target.result, file.name); };
  reader.readAsDataURL(file);
}
window.onMsgImagePick = onMsgImagePick;

function clearMsgImage() {
  _msgImageB64 = null;
  _msgImageDataUri = null;
  var fileEl  = document.getElementById('msgImageFile');
  var infoEl  = document.getElementById('msgImageInfo');
  var clearEl = document.getElementById('msgImageClearBtn');
  if (fileEl)  fileEl.value = '';
  if (infoEl)  infoEl.textContent = '선택된 이미지 없음';
  if (clearEl) clearEl.classList.add('hidden');
  updateMsgPreview();
}
window.clearMsgImage = clearMsgImage;

function updateMsgPreview() {
  var textBody = document.getElementById('msgBody').value || '';
  var subject = document.getElementById('msgSubject') ? document.getElementById('msgSubject').value : '';

  // 카카오톡/SMS 미리보기 (평문)
  var displayText = textBody || '메시지 내용이 여기에 표시됩니다';
  var kakaoBody = document.getElementById('msgPreviewKakaoBody');
  if (kakaoBody) kakaoBody.textContent = displayText;
  var smsBody = document.getElementById('msgPreviewSmsBody');
  if (smsBody) smsBody.textContent = displayText;

  // MMS 미리보기 (이미지 + 본문)
  var mmsBody = document.getElementById('msgPreviewMmsBody');
  if (mmsBody) mmsBody.textContent = displayText;
  var mmsImg   = document.getElementById('msgPreviewMmsImg');
  var mmsNoImg = document.getElementById('msgPreviewMmsNoImg');
  if (mmsImg && mmsNoImg) {
    if (_msgImageDataUri) {
      mmsImg.src = _msgImageDataUri;
      mmsImg.classList.remove('hidden');
      mmsNoImg.classList.add('hidden');
    } else {
      mmsImg.classList.add('hidden');
      mmsNoImg.classList.remove('hidden');
    }
  }

  // 이메일 미리보기 (HTML)
  var emailSubj = document.getElementById('msgPreviewEmailSubject');
  var emailBody = document.getElementById('msgPreviewEmailBody');
  if (emailSubj) emailSubj.textContent = subject || '(제목 없음)';
  if (emailBody) {
    if (_msgChannel === 'email' && _msgQuill) {
      emailBody.innerHTML = _msgQuill.root.innerHTML;
    } else {
      emailBody.textContent = displayText;
    }
  }
}

async function execMsgSend() {
  var channel    = _msgChannel;
  var recvAddr   = document.getElementById('msgRecvAddr').value.trim();
  var recvName   = document.getElementById('msgRecvName').value.trim();
  var body       = getMsgBody();
  var subject    = document.getElementById('msgSubject').value.trim();
  var templateCode = document.getElementById('msgTemplate').value;

  if (!recvAddr) { if (window.showToast) showToast('수신 주소를 입력해주세요', 'warning'); return; }
  if (!body && channel !== 'fax') { if (window.showToast) showToast('내용을 입력해주세요', 'warning'); return; }
  if (channel === 'kakao' && !templateCode) { if (window.showToast) showToast('카카오톡은 템플릿을 선택해주세요', 'warning'); return; }
  if (channel === 'fax') { if (window.showToast) showToast('팩스는 명세서/견적서 페이지에서 발송해주세요', 'warning'); return; }
  if (channel === 'mms') {
    if (!_msgImageB64) { if (window.showToast) showToast('MMS는 첨부 이미지를 선택해주세요', 'warning'); return; }
    // 100원/건 — 오발송 시 비용이 크므로 명시 확인
    if (!confirm('MMS를 발송합니다.\n건당 100원(부가세 별도)이 과금됩니다. 계속할까요?')) return;
  }

  // 이메일 평문일 경우 줄바꿈 → <br> 변환
  if (channel === 'email' && !_msgQuill) {
    body = body.split(String.fromCharCode(10)).join('<br>');
  }

  var statusEl = document.getElementById('msgSendStatus');
  statusEl.textContent = '발송 중...';
  statusEl.className = 'text-xs text-gray-500';
  document.getElementById('msgSendBtn').disabled = true;

  try {
    var payload = {
      channel: channel,
      receiver: { name: recvName },
      content:  { body: body },
      context:  { type: _msgContext.type, id: _msgContext.id, client_id: _msgContext.client_id }
    };

    if (channel === 'kakao' || channel === 'sms' || channel === 'mms') payload.receiver.phone = recvAddr;
    else if (channel === 'email') payload.receiver.email = recvAddr;
    else if (channel === 'fax')   payload.receiver.fax   = recvAddr;

    if (channel === 'mms') payload.content.image_base64 = _msgImageB64;

    if (subject) payload.content.subject = subject;
    if (templateCode && channel === 'kakao') payload.content.template_code = templateCode;

    var btnData = _msgContext.buttons;
    if (btnData && channel === 'kakao') payload.content.buttons = btnData;

    // 포털 링크 포함
    var portalToggle = document.getElementById('msgPortalLinkToggle');
    if (portalToggle && portalToggle.checked && _msgContext.client_id) {
      payload.include_portal_link = true;
    }

    // 예약 발송
    var scheduleToggle = document.getElementById('msgScheduleToggle');
    if (scheduleToggle && scheduleToggle.checked && (channel === 'kakao' || channel === 'sms' || channel === 'mms')) {
      var scheduleAt = document.getElementById('msgScheduleAt').value;
      if (scheduleAt) {
        if (new Date(scheduleAt) <= new Date()) {
          showToast('예약 시간은 현재 시간 이후여야 합니다.', 'error');
          document.getElementById('msgSendBtn').disabled = false;
          return;
        }
        // datetime-local → yyyyMMddHHmmss (초 보정: 12자리면 '00' 추가)
        var raw = scheduleAt.replace(/[-T:]/g, '').substring(0, 14);
        payload.content.sndDT = raw.length < 14 ? raw + '00000000'.substring(0, 14 - raw.length) : raw;
      }
    }

    var res = await axios.post('/api/messages/send', payload);
    if (res.data.success) {
      var d = res.data.data;
      if (d && d.status === 'FAILED') {
        statusEl.textContent = '발송 실패: ' + (d.message || '');
        statusEl.className   = 'text-xs text-red-600';
      } else {
        var msg = channel === 'email' ? '이메일이 발송되었습니다'
                : channel === 'sms'   ? '문자가 발송되었습니다'
                : channel === 'mms'   ? 'MMS가 발송되었습니다'
                :                       '카카오톡이 발송되었습니다';
        if (window.showToast) showToast(msg, 'success');
        closeMsgSendModal();
      }
    } else {
      statusEl.textContent = res.data.error || '발송 실패';
      statusEl.className   = 'text-xs text-red-600';
    }
  } catch(e) {
    statusEl.textContent = (e.response && e.response.data ? e.response.data.error : e.message) || '오류';
    statusEl.className   = 'text-xs text-red-600';
  }
  document.getElementById('msgSendBtn').disabled = false;
}

// ═══ 품목 검색 모달 (주문서/발주서/견적서 공통) ═══
var _itemSearchCb = null;
var _itemSearchType = 'sales';
var _itemSearchTimer = null;
var _itemSearchForUser = 0;

window.openItemSearchModal = function(opts) {
  opts = opts || {};
  _itemSearchCb = opts.onSelect || null;
  _itemSearchType = opts.type || 'sales';
  _itemSearchForUser = opts.forUser ? 1 : 0;
  var initialSearch = opts.search || '';

  var existing = document.getElementById('itemSearchModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'itemSearchModal';
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center ds-z-stack';
  modal.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">'
    + '<div class="p-4 border-b">'
    + '<div class="flex items-center justify-between mb-3">'
    + '<h2 class="text-lg font-bold"><i class="fas fa-search text-blue-600 mr-2"></i>품목 검색</h2>'
    + '<button onclick="document.getElementById(\'itemSearchModal\').remove()" class="p-2 text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>'
    + '</div>'
    + '<input type="text" id="itemSearchModalInput" placeholder="품목명 또는 코드로 검색..." value="' + (initialSearch || '').replace(/"/g, '') + '"'
    + ' class="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" autofocus>'
    + '</div>'
    + '<div class="flex-1 overflow-auto" id="itemSearchModalBody">'
    + '<div class="text-center py-12 text-gray-400 text-sm">검색어를 입력하세요</div>'
    + '</div>'
    + '<div class="border-t p-3 bg-gray-50 rounded-b-xl flex items-center justify-between">'
    + '<span class="text-xs text-gray-400" id="itemSearchModalCount"></span>'
    + '<button onclick="document.getElementById(\'itemSearchModal\').remove()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>'
    + '</div></div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

  var input = document.getElementById('itemSearchModalInput');
  input.addEventListener('input', function() {
    clearTimeout(_itemSearchTimer);
    var q = this.value.trim();
    if (!q) {
      document.getElementById('itemSearchModalBody').innerHTML = '<div class="text-center py-12 text-gray-400 text-sm">검색어를 입력하세요</div>';
      document.getElementById('itemSearchModalCount').textContent = '';
      return;
    }
    _itemSearchTimer = setTimeout(function() { _doItemSearch(q); }, 250);
  });
  input.focus();

  if (initialSearch) {
    setTimeout(function() { _doItemSearch(initialSearch); }, 100);
  }
};

function _doItemSearch(q) {
  var url = '/api/items?search=' + encodeURIComponent(q) + '&type=' + _itemSearchType + (_itemSearchForUser ? '&for_user=1' : '') + '&limit=50';
  var body = document.getElementById('itemSearchModalBody');
  if (!body) return;
  body.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>검색 중...</div>';

  axios.get(url).then(function(res) {
    var items = res.data.data || [];
    var countEl = document.getElementById('itemSearchModalCount');
    if (countEl) countEl.textContent = items.length + '건';

    if (!items.length) {
      body.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm">검색 결과가 없습니다</div>';
      return;
    }

    var favItems = items.filter(function(it) { return it.is_favorite; });
    var normalItems = items.filter(function(it) { return !it.is_favorite; });
    var sorted = favItems.concat(normalItems);

    var html = '<table class="w-full text-sm"><thead class="sticky top-0 bg-gray-50 z-10">'
      + '<tr class="text-left text-xs text-gray-500">'
      + '<th class="px-4 py-2">코드</th>'
      + '<th class="px-4 py-2">품목명</th>'
      + '<th class="px-4 py-2">분류</th>'
      + '<th class="px-4 py-2">단위</th>'
      + '<th class="px-4 py-2 text-right">단가</th>'
      + '</tr></thead><tbody>';

    if (favItems.length > 0) {
      html += '<tr><td colspan="5" class="px-4 py-1 text-xs font-semibold text-amber-600 bg-amber-50/50 border-b border-amber-100"><i class="fas fa-star text-amber-400 mr-1"></i>즐겨찾기</td></tr>';
    }

    sorted.forEach(function(it, i) {
      if (i === favItems.length && favItems.length > 0) {
        html += '<tr><td colspan="5" class="border-b-2 border-gray-200"></td></tr>';
      }
      var pm = it.pricing_method || 'FIXED';
      var pmBadge = pm === 'AREA' ? ' <span class="text-xs text-blue-600 font-medium">[㎡]</span>' : '';
      var cat = it.category || it.category_direct || it.category_name || '';
      var subcat = it.sub_category || it.sub_category_direct || '';
      var catStr = cat + (subcat ? ' > ' + subcat : '');
      var priceStr = (it.base_price || 0).toLocaleString() + '원' + (pm === 'AREA' ? '/㎡' : '');

      html += '<tr class="border-t hover:bg-blue-50 cursor-pointer item-search-row" '
        + 'data-id="' + it.id + '" data-name="' + (it.item_name || '').replace(/"/g, '') + '" '
        + 'data-price="' + (it.base_price || 0) + '" data-unit="' + (it.unit || 'EA') + '" '
        + 'data-cat="' + (cat || '').replace(/"/g, '') + '" '
        + 'data-subcat="' + (subcat || '').replace(/"/g, '') + '" '
        + 'data-pricing-method="' + pm + '" '
        + 'data-spec="' + (it.specification || '').replace(/"/g, '') + '" '
        + 'data-width-mm="' + (it.width_mm || '') + '" '
        + 'data-item-type="' + (it.item_type || '') + '">'
        + '<td class="px-4 py-2 font-mono text-xs text-blue-600">' + window.escapeHtml(it.item_code || '') + '</td>'
        + '<td class="px-4 py-2 font-medium">' + window.escapeHtml(it.item_name || '') + pmBadge + (it.width_mm ? ' <span class="text-xs font-semibold text-emerald-600">' + (parseInt(it.width_mm, 10) / 10) + 'cm</span>' : '') + '</td>'
        + '<td class="px-4 py-2 text-xs text-gray-500">' + window.escapeHtml(catStr) + '</td>'
        + '<td class="px-4 py-2 text-gray-500">' + (it.unit || 'EA') + '</td>'
        + '<td class="px-4 py-2 text-right tabular-nums">' + priceStr + '</td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('.item-search-row').forEach(function(row) {
      row.addEventListener('click', function() {
        if (_itemSearchCb) {
          _itemSearchCb({
            id: this.dataset.id,
            name: this.dataset.name,
            price: this.dataset.price,
            unit: this.dataset.unit,
            category: this.dataset.cat,
            sub_category: this.dataset.subcat,
            pricing_method: this.dataset.pricingMethod,
            specification: this.dataset.spec,
            width_mm: this.dataset.widthMm,
            item_type: this.dataset.itemType
          });
        }
        document.getElementById('itemSearchModal').remove();
      });
    });
  }).catch(function() {
    body.innerHTML = '<div class="text-center py-8 text-red-500">검색 실패</div>';
  });
}

// ============================================================
// [전역] 체크박스 Shift 범위 선택 (2026-07-27)
//   목록에서 A를 클릭한 뒤 B를 Shift+클릭하면 A~B 사이 전체가 B의 상태로 일괄 토글.
//   페이지별 구현 없이 document 위임 1곳에서 처리(단일 소스) → 체크박스 목록이 있는 모든 페이지 자동 적용.
//   그룹 판정 = 같은 class(없으면 name) + 같은 컨테이너(tbody / [data-check-group], 없으면 문서 전체).
//   숨김(다른 탭)·disabled 체크박스는 제외. 변경분마다 change 이벤트를 재발행해
//   기존 onchange/addEventListener 핸들러(선택 카운터·배지·선택 Set)가 그대로 동작하게 한다.
// ============================================================
(function() {
  var lastEl = null;

  function checkSig(el) {
    var cls = (el.className || '').trim();
    if (cls) return 'c:' + cls;
    if (el.name) return 'n:' + el.name;
    return '';
  }

  function checkGroup(el) {
    var sig = checkSig(el);
    if (!sig) return [];
    var root = el.closest('tbody') || el.closest('[data-check-group]') || document;
    var all = root.querySelectorAll('input[type="checkbox"]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (c.disabled) continue;
      if (checkSig(c) !== sig) continue;
      if (c.offsetParent === null) continue; // 숨겨진 탭/모달 제외
      out.push(c);
    }
    return out;
  }

  document.addEventListener('click', function(e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'checkbox') return;

    var group = checkGroup(el);
    var idx = group.indexOf(el);
    if (idx < 0 || group.length < 2) { lastEl = el; return; }

    if (e.shiftKey && lastEl && lastEl !== el) {
      var prev = group.indexOf(lastEl);
      if (prev >= 0) {
        var start = Math.min(prev, idx);
        var end = Math.max(prev, idx);
        var state = el.checked;
        for (var i = start; i <= end; i++) {
          var c = group[i];
          if (c === el || c.checked === state) continue;
          c.checked = state;
          c.dispatchEvent(new Event('change', { bubbles: true }));
        }
        try { window.getSelection().removeAllRanges(); } catch (err) {} // shift+click 텍스트 선택 해제
      }
    }
    lastEl = el;
  });
})();

/* ── 목록 화면 공통 UX: 조회조건 칩 · 합계 바 · 통계카드 드릴다운 ─────────────
 * 마크업·클래스를 페이지마다 다시 적지 않기 위한 렌더러. 스타일 정본 = shared-styles.ts (ds-cond · ds-summary · ds-stat 계열).
 * ⚠️ 조회조건 칩은 ds-cond 다 — ds-chip 은 이미 '클릭하는 필터 토글 칩'으로 쓰이고 있어(출고 택배사 배지 등) 이름을 나눴다.
 * 설계 근거 = docs/audits/2026-08-08-list-ux-ecount-gap.md
 *
 * "무엇을 보여줄지"(어떤 조건이 있고 무엇을 합산하는지)는 페이지가 정하고,
 * "어떻게 그릴지"만 여기서 담당한다. 페이지별 필터 종류가 제각각이라 그 이상은 공통화하면 오히려 엉킨다.
 */
window.dsListUx = (function() {
  function resolve(target, who) {
    var el = (typeof target === 'string') ? document.getElementById(target) : target;
    if (!el) console.warn('[dsListUx] ' + who + ': 컨테이너를 찾을 수 없음 → ' + target);
    return el;
  }
  function num(v) { return Number(v || 0).toLocaleString(); }

  /**
   * 활성 조회조건 칩.
   * items = [{ label, onClear?, tone? }]  tone: 'static'(해제 불가 안내) | 'warn'(경고)
   * onClear 가 있으면 ✕ 가 붙는다. innerHTML 대신 DOM 으로 만들어 라벨의 따옴표·꺾쇠가 사고를 내지 않는다.
   */
  function renderChips(target, items, labelText) {
    var el = resolve(target, 'renderChips');
    if (!el) return;
    el.textContent = '';
    if (!items || !items.length) return;
    if (!el.classList.contains('ds-conds')) el.classList.add('ds-conds');
    if (labelText !== '') {
      var lb = document.createElement('span');
      lb.className = 'ds-conds-label';
      lb.textContent = labelText || '조회 조건';
      el.appendChild(lb);
    }
    items.forEach(function(it) {
      if (!it) return;
      var chip = document.createElement('span');
      chip.className = 'ds-cond' + (it.tone === 'static' ? ' ds-cond-static' : it.tone === 'warn' ? ' ds-cond-warn' : '');
      chip.appendChild(document.createTextNode(it.label));
      if (typeof it.onClear === 'function') {
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'ds-cond-x';
        x.title = '이 조건만 해제';
        x.innerHTML = '&times;';
        x.addEventListener('click', it.onClear);
        chip.appendChild(x);
      }
      el.appendChild(chip);
    });
  }

  /**
   * 합계 바. cols = [{ label, value, format?: 'number'|'won'|'text', strong? }]
   * ⚠️ 합계는 '조회조건 전체' 기준이어야 한다(현재 페이지 합이 아님). 여러 페이지일 때 문구로 명시한다.
   */
  function renderSummary(target, cols, opts) {
    var el = resolve(target, 'renderSummary');
    if (!el) return;
    opts = opts || {};
    el.textContent = '';
    if (!cols) return;
    if (!el.classList.contains('ds-summary')) el.classList.add('ds-summary');
    var scope = document.createElement('span');
    scope.className = 'ds-summary-scope';
    scope.textContent = opts.scopeText || (opts.multiPage ? '조회조건 전체 합계 (현재 페이지 아님)' : '조회조건 합계');
    // 숫자가 서로 안 맞아 보이는 데이터 사정(예: 공급가 미기재)을 숨기지 않고 알린다
    if (opts.note) {
      var note = document.createElement('span');
      note.className = 'ds-cond ds-cond-warn';
      note.style.marginLeft = '8px';
      note.textContent = opts.note;
      scope.appendChild(note);
    }
    el.appendChild(scope);
    cols.forEach(function(c) {
      if (!c) return;
      var item = document.createElement('span');
      item.className = 'ds-summary-item' + (c.strong ? ' ds-summary-total' : '');
      item.appendChild(document.createTextNode(c.label));
      var b = document.createElement('b');
      b.textContent = c.format === 'text' ? String(c.value == null ? '-' : c.value)
                    : c.format === 'won' ? num(c.value) + '원'
                    : num(c.value);
      item.appendChild(b);
      el.appendChild(item);
    });
  }

  /** 통계 카드 강조 — data-stat-status 가 현재 선택값과 같은 카드에 .ds-stat-active */
  function markActiveStat(status, scopeSelector) {
    var cards = document.querySelectorAll((scopeSelector || '') + '.ds-stat');
    if (!cards.length) { console.warn('[dsListUx] markActiveStat: .ds-stat 없음'); return; }
    for (var i = 0; i < cards.length; i++) {
      var own = cards[i].getAttribute('data-stat-status') || '';
      cards[i].classList.toggle('ds-stat-active', own === (status || ''));
    }
  }

  return { renderChips: renderChips, renderSummary: renderSummary, markActiveStat: markActiveStat };
})();

/** 공급가+부가세 != 합계 인지 판정 — 이관분에 금액 분해가 없는 건이 섞였다는 뜻이다. */
window.dsAmountBreakdownNote = function(summary) {
  if (!summary) return '';
  var parts = (Number(summary.supply_amount) || 0) + (Number(summary.vat_amount) || 0);
  var total = Number(summary.final_amount) || 0;
  if (!total || Math.abs(parts - total) < 1) return '';
  return '공급가·부가세 미기재 건 포함 — 합계 기준으로 보세요';
};
