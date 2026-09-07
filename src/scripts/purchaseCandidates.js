// 매입 후보 큐 — 전역 접두사 pcq (?raw 스크립트는 전역 스코프를 공유한다)
// 데이터 = GET /api/purchase-candidates · 판정 규칙 정본 = src/utils/apCandidate.ts

var pcqData = { summary: null, suppliers: [], rows: [] };
var pcqSupFilter = { STRONG: true, LIKELY: true, UNKNOWN: true };
var pcqRowFilter = { STRONG: true, LIKELY: true, UNKNOWN: true, EXCLUDE: false };
var pcqEntityNames = { 1: '동산', 2: '선명', 3: '청주' };
var pcqLabels = { STRONG: '확실', LIKELY: '가능', UNKNOWN: '확인필요', EXCLUDE: '제외' };

function pcqEsc(s) {
  return (typeof escapeHtml === 'function') ? escapeHtml(s == null ? '' : String(s))
    : String(s == null ? '' : s).replace(/[&<>"]/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
    });
}
function pcqNum(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
function pcqShort(n) {
  n = Number(n) || 0;
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + '억';
  return Math.round(n / 10000).toLocaleString('ko-KR') + '만';
}
function pcqDate(s) {
  s = String(s || '').replace(/-/g, '');
  return s.length === 8 ? s.slice(0, 4) + '.' + s.slice(4, 6) + '.' + s.slice(6, 8) : s;
}
function pcqEnt(id) { return pcqEntityNames[id] || ('E' + id); }
function pcqTag(v) {
  var cls = { STRONG: 'bg-green-100 text-green-700', LIKELY: 'bg-amber-100 text-amber-700',
    UNKNOWN: 'bg-gray-100 text-gray-600', EXCLUDE: 'bg-gray-100 text-gray-400' }[v] || '';
  return '<span class="px-2 py-0.5 rounded text-xs font-medium ' + cls + '">' + (pcqLabels[v] || v) + '</span>';
}
function pcqChips(elId, state, onToggle) {
  var el = document.getElementById(elId);
  if (!el) { console.warn('[purchaseCandidates] #' + elId + ' not found'); return; }
  el.innerHTML = Object.keys(state).map(function(k) {
    var on = state[k];
    return '<button type="button" data-k="' + k + '" class="px-2.5 py-1 rounded-full text-xs border '
      + (on ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300')
      + '">' + pcqLabels[k] + '</button>';
  }).join('');
  el.onclick = function(e) {
    var b = e.target.closest('button[data-k]');
    if (!b) return;
    state[b.dataset.k] = !state[b.dataset.k];
    pcqChips(elId, state, onToggle);
    onToggle();
  };
}

function pcqRenderSummary() {
  var s = pcqData.summary;
  var el = document.getElementById('pcqSummary');
  if (!el) { console.warn('[purchaseCandidates] #pcqSummary not found'); return; }
  if (!s) { el.innerHTML = ''; return; }
  var tiles = [
    ['발주 누락 추정', pcqShort(s.total_gap) + '원', s.supplier_count + '개 거래처', 'text-blue-600'],
    ['후보 합계', pcqShort(s.candidate_amount) + '원', s.candidate_lines + '건', ''],
    ['확실', pcqShort(s.strong.amount) + '원', s.strong.lines + '건', 'text-green-700'],
    ['가능', pcqShort(s.likely.amount) + '원', s.likely.lines + '건', 'text-amber-700'],
    ['확인필요', pcqShort(s.unknown.amount) + '원', s.unknown.lines + '건', 'text-gray-600']
  ];
  el.innerHTML = tiles.map(function(t) {
    return '<div class="bg-white rounded-lg shadow px-4 py-3">'
      + '<div class="text-xs text-gray-500">' + t[0] + '</div>'
      + '<div class="text-lg font-bold ' + t[3] + '">' + t[1] + '</div>'
      + '<div class="text-xs text-gray-400">' + t[2] + '</div></div>';
  }).join('');
}

function pcqRenderSuppliers() {
  var body = document.getElementById('pcqSupBody');
  var note = document.getElementById('pcqSupNote');
  if (!body || !note) { console.warn('[purchaseCandidates] #pcqSupBody/#pcqSupNote not found'); return; }
  var list = pcqData.suppliers.filter(function(s) { return pcqSupFilter[s.verdict]; });
  note.textContent = list.length + '곳 · 차액 ' + pcqNum(list.reduce(function(a, s) {
    return a + Math.max(0, s.gap); }, 0)) + '원';
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-400">'
      + '해당하는 거래처가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = list.map(function(s) {
    var gapCls = s.gap > 0 ? 'text-red-600 font-semibold' : 'text-gray-400';
    var link = s.client_id
      ? '<a href="/purchase-orders?supplier_id=' + s.client_id + '" class="text-blue-600 hover:underline text-xs">발주 보기</a>'
      : '';
    return '<tr class="border-t hover:bg-gray-50">'
      + '<td class="px-4 py-2"><div class="font-medium text-gray-800">' + pcqEsc(s.name) + '</div>'
      + (s.memos && s.memos.length
        ? '<div class="text-xs text-gray-400 break-all">' + s.memos.map(pcqEsc).join(' · ') + '</div>' : '')
      + '</td>'
      + '<td class="px-4 py-2 text-xs text-gray-600">' + s.entities.map(pcqEnt).join(', ') + '</td>'
      + '<td class="px-4 py-2 text-right">' + pcqNum(s.paid) + '</td>'
      + '<td class="px-4 py-2 text-right text-gray-500">' + pcqNum(s.po_amount)
      + (s.po_count ? '<span class="text-xs text-gray-400"> (' + s.po_count + '건)</span>' : '') + '</td>'
      + '<td class="px-4 py-2 text-right ' + gapCls + '">' + pcqNum(s.gap) + '</td>'
      + '<td class="px-4 py-2 text-xs text-gray-500">' + pcqDate(s.last) + '</td>'
      + '<td class="px-4 py-2">' + pcqTag(s.verdict) + '</td>'
      + '<td class="px-4 py-2 text-right">' + link + '</td>'
      + '</tr>';
  }).join('');
}

function pcqRenderRows() {
  var body = document.getElementById('pcqRowBody');
  var note = document.getElementById('pcqRowNote');
  if (!body || !note) { console.warn('[purchaseCandidates] #pcqRowBody/#pcqRowNote not found'); return; }
  var list = pcqData.rows.filter(function(r) { return pcqRowFilter[r.verdict]; });
  note.textContent = list.length + '건 · ' + pcqNum(list.reduce(function(a, r) { return a + r.amount; }, 0)) + '원';
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">'
      + '해당하는 건이 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = list.map(function(r) {
    return '<tr class="border-t hover:bg-gray-50">'
      + '<td class="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">' + pcqDate(r.date) + '</td>'
      + '<td class="px-4 py-2 text-xs text-gray-600">' + pcqEnt(r.entity_id) + '</td>'
      + '<td class="px-4 py-2 text-right font-medium">' + pcqNum(r.amount) + '</td>'
      + '<td class="px-4 py-2"><div class="break-all">' + pcqEsc(r.memo) + '</div>'
      + '<div class="text-xs text-gray-400">' + pcqEsc((r.reasons || []).join(' · ')) + '</div></td>'
      + '<td class="px-4 py-2 text-xs text-gray-500">' + pcqEsc(r.category || '—') + '</td>'
      + '<td class="px-4 py-2">' + pcqTag(r.verdict) + '</td>'
      + '</tr>';
  }).join('');
}

function pcqRenderNotice() {
  var el = document.getElementById('pcqNotice');
  if (!el) { console.warn('[purchaseCandidates] #pcqNotice not found'); return; }
  var s = pcqData.summary;
  if (!s || !s.total_gap) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = '<b>' + pcqDate(s.from) + ' ~ ' + pcqDate(s.to) + '</b> 사이에 통장에서 '
    + '<b>' + pcqNum(s.candidate_amount) + '원</b>이 매입으로 보이게 나갔는데, '
    + '같은 기간 등록된 발주와 <b class="text-red-600">' + pcqNum(s.total_gap) + '원</b>이 벌어져 있습니다. '
    + '발주를 등록하면 이 숫자가 줄어듭니다.';
}

window.pcqLoad = async function() {
  var sel = document.getElementById('pcqMonths');
  if (!sel) { console.warn('[purchaseCandidates] #pcqMonths not found'); return; }
  var body = document.getElementById('pcqSupBody');
  if (body) body.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-400">불러오는 중…</td></tr>';
  try {
    var res = await axios.get('/api/purchase-candidates?months=' + encodeURIComponent(sel.value));
    if (!res.data || !res.data.success) throw new Error((res.data && res.data.error) || '조회 실패');
    pcqData = res.data.data;
    pcqRenderSummary();
    pcqRenderNotice();
    pcqRenderSuppliers();
    pcqRenderRows();
  } catch (e) {
    console.error('[purchaseCandidates] load error:', e);
    if (body) {
      body.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-red-500">'
        + pcqEsc((e.response && e.response.data && e.response.data.error) || '불러오지 못했습니다.')
        + '</td></tr>';
    }
  }
};

// ===== 초기화 =====
(function() {
  pcqChips('pcqSupFilter', pcqSupFilter, pcqRenderSuppliers);
  pcqChips('pcqRowFilter', pcqRowFilter, pcqRenderRows);
  window.pcqLoad();
})();
