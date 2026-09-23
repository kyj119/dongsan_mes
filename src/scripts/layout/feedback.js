// src/scripts/layout/feedback.js — 전역 「문제 신고」 모달 (0626)
//
// ★사람이 쓰는 칸은 **분류 + 한 줄**, 둘뿐이다. 나머지(어느 화면·무엇을 보고 있었나·방금 난
//   오류·브라우저)는 이 파일이 모아서 같이 보낸다. 물어보면 안 적기 때문이다.
// ★`?raw` 전역 스코프라 식별자는 전부 `fb`/`feedback` 접두로 둔다(재선언 충돌 방지).

var FB_CATS = ['MISSING', 'NOTFOUND', 'ERROR', 'WRONG'];
var FB_CAT_HINT = {
  MISSING: '어떤 기능이 있었으면 좋겠는지 적어 주세요. 「지금은 ___를 손으로 합니다」도 좋습니다.',
  NOTFOUND: '무엇을 찾고 계셨는지 적어 주세요. 어디를 먼저 보셨는지도 알려 주시면 그 자리로 옮깁니다.',
  ERROR: '★ <b>화면 캡처</b>를 같이 주시면 훨씬 빨리 고칩니다. Win+Shift+S 로 찍고 Ctrl+V.',
  WRONG: '★ <b>어떤 값이 얼마로 나왔고 얼마여야 하는지</b>를 적어 주세요. 숫자가 있어야 대조합니다.',
};
var FB_MAX_CAPTURE = 10 * 1024 * 1024;
var FB_MAX_FILE = 50 * 1024 * 1024;

var fbCategory = '';
var fbPending = [];          // [{ kind, file, name, size }] — 접수 후 순서대로 올린다
var fbSubmitting = false;
var fbPasteBound = false;

// ── 최근 사고 기록 (last_error 재료) ─────────────────────────────
// 「방금 난 오류」를 사람이 옮겨 적게 하면 안 적는다. 링버퍼로 조용히 모아 둔다.
var fbTrail = [];
function fbTrailPush(kind, detail) {
  try {
    fbTrail.push({ t: new Date().toISOString().slice(11, 19), kind: kind, detail: String(detail || '').slice(0, 300) });
    if (fbTrail.length > 6) fbTrail.shift();
  } catch (e) { /* 기록 실패가 화면을 막지 않는다 */ }
}
(function fbInstallTrail() {
  try {
    window.addEventListener('error', function (e) {
      fbTrailPush('js', (e && e.message ? e.message : 'error') + ' @ ' + ((e && e.filename) || '') + ':' + ((e && e.lineno) || ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      fbTrailPush('promise', (r && (r.message || r)) || 'rejection');
    });
    if (window.axios && window.axios.interceptors) {
      window.axios.interceptors.response.use(function (res) { return res; }, function (err) {
        try {
          var cfg = (err && err.config) || {};
          var st = (err && err.response && err.response.status) || 'net';
          fbTrailPush('api', String(cfg.method || 'get').toUpperCase() + ' ' + (cfg.url || '') + ' -> ' + st);
        } catch (e2) { /* 인터셉터가 원래 오류 처리를 방해하면 안 된다 */ }
        return Promise.reject(err);
      });
    }
  } catch (e) { /* 계측 실패는 신고 기능 자체를 막지 않는다 */ }
})();

// ── 화면이 아는 것 ───────────────────────────────────────────────
function fbCollectContext() {
  var ctx = { page_path: '', page_label: '', context_ref: '', client_info: '', last_error: '' };
  try {
    ctx.page_path = location.pathname + (location.search || '');
    var t = document.querySelector('.top-bar-title');
    ctx.page_label = (t && t.textContent ? t.textContent : document.title || '').trim().slice(0, 120);

    // 무엇을 보고 있었나 — 페이지가 알려 주면 그걸, 아니면 주소의 식별자를 쓴다.
    // (페이지들이 나중에 data-fb-ref 를 달면 정확해진다. 없어도 동작한다.)
    var refEl = document.querySelector('[data-fb-ref]');
    if (refEl) {
      ctx.context_ref = (refEl.getAttribute('data-fb-ref') || '').slice(0, 300);
    } else {
      var qs = [];
      try {
        new URLSearchParams(location.search).forEach(function (v, k) { qs.push(k + '=' + v); });
      } catch (e) { /* 구형 브라우저 — 주소 식별자 없이 진행 */ }
      ctx.context_ref = qs.join(' · ').slice(0, 300);
    }

    var u = {};
    try { u = JSON.parse(localStorage.getItem('user') || '{}'); } catch (e) { /* 토큰 없는 화면 */ }
    ctx.client_info = JSON.stringify({
      role: u.role || '', entity: u.default_entity_id || u.entityId || '',
      ua: (navigator.userAgent || '').slice(0, 160),
      view: window.innerWidth + 'x' + window.innerHeight,
      when: new Date().toISOString(),
    });

    ctx.last_error = fbTrail.length
      ? fbTrail.map(function (x) { return x.t + ' [' + x.kind + '] ' + x.detail; }).join('\n')
      : '';
  } catch (e) { /* 수집 실패해도 신고 본문은 보내야 한다 */ }
  return ctx;
}

function fbRenderAutoInfo() {
  var el = document.getElementById('fbAutoInfo');
  if (!el) { console.warn('[feedback] #fbAutoInfo not found'); return; }
  var ctx = fbCollectContext();
  var u = {};
  try { u = JSON.parse(localStorage.getItem('user') || '{}'); } catch (e) { /* 미로그인 */ }
  var lines = [
    (u.name || u.username || '이름 없음') + ' · ' + (u.role || ''),
    (ctx.page_label || '') + '  (' + ctx.page_path + ')',
  ];
  if (ctx.context_ref) lines.push('보고 계신 것: ' + ctx.context_ref);
  if (ctx.last_error) lines.push('최근 기록:\n' + ctx.last_error);
  el.textContent = lines.join('\n');
}

// ── 열고 닫기 ────────────────────────────────────────────────────
function openFeedbackModal() {
  var m = document.getElementById('feedbackModal');
  if (!m) { console.warn('[feedback] #feedbackModal not found'); return; }
  fbCategory = '';
  fbPending = [];
  fbSubmitting = false;
  FB_CATS.forEach(function (k) { fbPaintCat(k, false); });
  var b = document.getElementById('fbBody'); if (b) b.value = '';
  var p = document.getElementById('fbFilePath'); if (p) p.value = '';
  var h = document.getElementById('fbHint'); if (h) { h.className = 'hidden'; h.innerHTML = ''; }
  fbRenderAttachList();
  fbRenderAutoInfo();
  fbRemoveMyPanel();
  m.classList.remove('hidden');
  if (!fbPasteBound) { document.addEventListener('paste', fbOnPaste); fbPasteBound = true; }
  setTimeout(function () { if (b) b.focus(); }, 30);
}

function closeFeedbackModal() {
  var m = document.getElementById('feedbackModal');
  if (m) m.classList.add('hidden');
  if (fbPasteBound) { document.removeEventListener('paste', fbOnPaste); fbPasteBound = false; }
  fbPending = [];
  fbRemoveMyPanel();
}

function fbPaintCat(key, on) {
  var el = document.getElementById('fbCat' + key);
  if (!el) return;
  el.className = 'fb-cat px-3 py-1.5 rounded-full text-xs font-medium '
    + (on ? 'bg-blue-50 border-2 border-blue-500 text-blue-700' : 'bg-white border border-gray-300 text-gray-600');
}

function setFeedbackCategory(key) {
  if (FB_CATS.indexOf(key) < 0) return;
  fbCategory = key;
  FB_CATS.forEach(function (k) { fbPaintCat(k, k === key); });
  var h = document.getElementById('fbHint');
  if (h) {
    h.innerHTML = FB_CAT_HINT[key] || '';
    h.className = 'text-xs mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800';
  }
}

// ── 증거 모으기 ──────────────────────────────────────────────────
function focusFeedbackPaste() {
  var b = document.getElementById('fbBody');
  if (b) b.focus();
  var z = document.getElementById('fbPasteZone');
  if (z) {
    z.classList.add('border-blue-400');
    setTimeout(function () { z.classList.remove('border-blue-400'); }, 900);
  }
}

function fbOnPaste(e) {
  var m = document.getElementById('feedbackModal');
  if (!m || m.classList.contains('hidden')) return;
  var files = (e.clipboardData && e.clipboardData.files) || [];
  var added = 0;
  for (var i = 0; i < files.length; i++) {
    if (files[i] && /^image\//.test(files[i].type || '')) { fbAddPending(files[i], 'capture'); added++; }
  }
  if (added) {
    e.preventDefault();   // 이미지는 본문에 넣지 않는다 — 첨부로 간다
    fbRenderAttachList();
  }
}

function onFeedbackFilePick(input) {
  if (!input || !input.files) return;
  for (var i = 0; i < input.files.length; i++) fbAddPending(input.files[i], 'file');
  input.value = '';
  fbRenderAttachList();
}

function fbAddPending(file, kind) {
  if (!file) return;
  var limit = kind === 'capture' ? FB_MAX_CAPTURE : FB_MAX_FILE;
  if (file.size > limit) {
    if (typeof showToast === 'function') {
      showToast(kind === 'capture'
        ? '캡처가 10MB를 넘습니다.'
        : '파일이 50MB를 넘습니다 — Z: 경로를 적어 주시면 원본을 그대로 열어 봅니다.', 'error', 5000);
    }
    return;
  }
  if (fbPending.length >= 10) {
    if (typeof showToast === 'function') showToast('첨부는 10개까지입니다.', 'error');
    return;
  }
  fbPending.push({ kind: kind, file: file, name: file.name || (kind === 'capture' ? '캡처.png' : '파일'), size: file.size });
}

function fbRemovePending(i) {
  fbPending.splice(i, 1);
  fbRenderAttachList();
}

function fbRenderAttachList() {
  var el = document.getElementById('fbAttachList');
  if (!el) { console.warn('[feedback] #fbAttachList not found'); return; }
  if (!fbPending.length) { el.innerHTML = ''; return; }
  el.innerHTML = fbPending.map(function (a, i) {
    var kb = a.size > 1048576 ? (a.size / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(a.size / 1024)) + 'KB';
    return '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-100 text-xs text-gray-700">'
      + '<i class="fas ' + (a.kind === 'capture' ? 'fa-image' : 'fa-paperclip') + ' text-gray-400"></i>'
      + window.escapeHtml(a.name.length > 28 ? a.name.slice(0, 26) + '…' : a.name)
      + '<span class="text-gray-400">' + kb + '</span>'
      + '<button type="button" class="text-gray-400 hover:text-red-600" onclick="fbRemovePending(' + i + ')"><i class="fas fa-times"></i></button>'
      + '</span>';
  }).join('');
}

// ── 보내기 ───────────────────────────────────────────────────────
async function submitFeedback() {
  if (fbSubmitting) return;
  var btn = document.getElementById('fbSubmitBtn');
  var hint = document.getElementById('fbHint');
  var bodyEl = document.getElementById('fbBody');
  var text = bodyEl ? (bodyEl.value || '').trim() : '';

  function warn(msg) {
    if (hint) { hint.innerHTML = msg; hint.className = 'text-xs mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700'; }
  }
  if (!fbCategory) { warn('어떤 문제인지 하나만 골라 주세요.'); return; }
  if (!text) { warn('무슨 일이 있었는지 한 줄만 적어 주세요.'); if (bodyEl) bodyEl.focus(); return; }

  fbSubmitting = true;
  if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }

  try {
    var ctx = fbCollectContext();
    var pathEl = document.getElementById('fbFilePath');
    var res = await axios.post('/api/feedback', {
      category: fbCategory,
      body: text,
      page_path: ctx.page_path,
      page_label: ctx.page_label,
      context_ref: ctx.context_ref,
      client_info: ctx.client_info,
      last_error: ctx.last_error,
      file_path: pathEl ? (pathEl.value || '').trim() : '',
    });
    if (!res.data || !res.data.success) throw new Error((res.data && res.data.error) || '접수 실패');
    var id = res.data.data.id;

    // 첨부는 접수 뒤에 하나씩 — 하나가 실패해도 신고는 이미 남아 있다.
    var failed = 0;
    for (var i = 0; i < fbPending.length; i++) {
      if (btn) btn.textContent = '첨부 ' + (i + 1) + '/' + fbPending.length + '…';
      try {
        var fd = new FormData();
        fd.append('file', fbPending[i].file, fbPending[i].name);
        fd.append('kind', fbPending[i].kind);
        await axios.post('/api/feedback/' + id + '/attach', fd);
      } catch (e) {
        failed++;
        console.error('[feedback] 첨부 실패', fbPending[i].name, e);
      }
    }

    closeFeedbackModal();
    if (typeof showToast === 'function') {
      showToast(failed
        ? '신고는 접수됐습니다(첨부 ' + failed + '건 실패). 확인하고 알려 드리겠습니다.'
        : '접수됐습니다. 확인하고 알려 드리겠습니다.', failed ? 'warning' : 'success', 4000);
    }
  } catch (e) {
    console.error('[feedback] 접수 실패', e);
    var msg = (e && e.response && e.response.data && e.response.data.error) || '보내지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
    warn(window.escapeHtml(msg));
  } finally {
    fbSubmitting = false;
    if (btn) { btn.disabled = false; btn.textContent = '보내기'; }
  }
}

// ── 내가 낸 신고 ─────────────────────────────────────────────────
// 「내 건이 어떻게 됐나」를 본인이 볼 수 있어야 같은 걸 다시 내지 않는다.
// 목록 페이지(/feedback)는 ADMIN/MANAGER 전용이라 여기서 보여 준다.
function fbRemoveMyPanel() {
  var p = document.getElementById('fbMyPanel');
  if (p && p.parentNode) p.parentNode.removeChild(p);
}

async function openMyFeedback() {
  var existing = document.getElementById('fbMyPanel');
  if (existing) { fbRemoveMyPanel(); return; }

  var anchor = document.getElementById('fbAutoInfo');
  var host = anchor && anchor.parentNode ? anchor.parentNode.parentNode : null;
  if (!host) { console.warn('[feedback] my-panel host not found'); return; }

  var panel = document.createElement('div');
  panel.id = 'fbMyPanel';
  panel.className = 'mt-3 border rounded-lg p-3 bg-gray-50';
  panel.innerHTML = '<div class="text-xs text-gray-400">불러오는 중…</div>';
  host.appendChild(panel);

  try {
    var res = await axios.get('/api/feedback/mine');
    var rows = (res.data && res.data.data) || [];
    if (!rows.length) {
      panel.innerHTML = '<div class="text-xs text-gray-500">아직 내신 신고가 없습니다.</div>';
      return;
    }
    var labels = { MISSING: '기능없음', NOTFOUND: '못찾음', ERROR: '오류·느림', WRONG: '값틀림' };
    panel.innerHTML = '<div class="text-xs font-semibold text-gray-600 mb-2">내가 낸 신고</div>'
      + rows.map(function (r) {
        var done = r.status === 'DONE';
        return '<div class="flex items-start gap-2 py-1.5 border-b border-gray-200 last:border-b-0">'
          + '<span class="text-xs px-1.5 py-0.5 rounded ' + (done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700') + '">'
          + (done ? '처리됨' : '접수') + '</span>'
          + '<div class="flex-1 min-w-0">'
          + '<div class="text-xs text-gray-700 truncate">' + window.escapeHtml(r.body || '') + '</div>'
          + '<div class="text-xs text-gray-400">' + window.escapeHtml(String(r.created_at || '').slice(0, 16))
          + ' · ' + window.escapeHtml(labels[r.category] || r.category || '')
          + (r.page_label ? ' · ' + window.escapeHtml(r.page_label) : '') + '</div>'
          + (done && r.handled_note ? '<div class="text-xs text-green-700 mt-0.5">↳ ' + window.escapeHtml(r.handled_note) + '</div>' : '')
          + '</div></div>';
      }).join('');
  } catch (e) {
    console.error('[feedback] 내 신고 조회 실패', e);
    panel.innerHTML = '<div class="text-xs text-red-600">불러오지 못했습니다.</div>';
  }
}

// 로그인 전 화면에서는 버튼을 감춘다 — 낼 수 없는 버튼이 떠 있으면 눌러 보고 실패한다.
(function fbToggleButton() {
  try {
    var btn = document.getElementById('feedbackBtn');
    if (btn && !localStorage.getItem('token')) btn.style.display = 'none';
  } catch (e) { /* localStorage 접근 불가 환경 — 버튼을 그대로 둔다 */ }
})();
