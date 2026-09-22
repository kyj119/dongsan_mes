// src/scripts/feedback.js — 문제 접수함 목록·상세 (0626, ADMIN/MANAGER)
//
// 신고를 받는 창구는 전역 버튼(layout/feedback.js)이고, 이 화면은 **처리하는 쪽**이다.
// ★처리됨으로 바꾸면 신고자에게 알림이 간다 — 안 알리면 다음부터 신고를 안 한다.

var FBL_CAT = { MISSING: '기능없음', NOTFOUND: '못찾음', ERROR: '오류·느림', WRONG: '값틀림' };
var FBL_CAT_COLOR = {
  MISSING: 'bg-blue-100 text-blue-700',
  NOTFOUND: 'bg-purple-100 text-purple-700',
  ERROR: 'bg-amber-100 text-amber-700',
  WRONG: 'bg-red-100 text-red-700',
};
var fblCurrent = null;

function fblEsc(v) { return window.escapeHtml(String(v == null ? '' : v)); }

function fblSize(n) {
  n = Number(n) || 0;
  return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
}

async function loadFeedbackList() {
  var tbody = document.getElementById('fblBody');
  if (!tbody) { console.warn('[feedback] #fblBody not found'); return; }
  var status = (document.getElementById('fblStatus') || {}).value || '';
  var category = (document.getElementById('fblCategory') || {}).value || '';
  var search = (document.getElementById('fblSearch') || {}).value || '';

  tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">불러오는 중…</td></tr>';
  try {
    var res = await axios.get('/api/feedback', { params: { status: status, category: category, search: search, limit: 100 } });
    var rows = (res.data && res.data.data) || [];
    var sum = (res.data && res.data.summary) || {};
    var openEl = document.getElementById('fblOpen');
    var totalEl = document.getElementById('fblTotal');
    if (openEl) openEl.textContent = sum.open_n == null ? '0' : String(sum.open_n);
    if (totalEl) totalEl.textContent = sum.total_n == null ? '0' : String(sum.total_n);

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">해당하는 신고가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var done = r.status === 'DONE';
      var evidence = [];
      if (r.attach_count) evidence.push('<i class="fas fa-paperclip" title="첨부 ' + r.attach_count + '"></i> ' + r.attach_count);
      if (r.file_path) evidence.push('<i class="fas fa-folder-open text-amber-500" title="파일 경로 있음"></i>');
      return '<tr class="hover:bg-gray-50 cursor-pointer" onclick="openFeedbackDetail(' + r.id + ')">'
        + '<td class="text-xs text-gray-500 whitespace-nowrap">' + fblEsc(String(r.created_at || '').slice(0, 16)) + '</td>'
        + '<td class="text-xs">' + fblEsc(r.reporter_name || '-') + '</td>'
        + '<td><span class="text-xs px-1.5 py-0.5 rounded ' + (FBL_CAT_COLOR[r.category] || 'bg-gray-100 text-gray-600') + '">'
        + fblEsc(FBL_CAT[r.category] || r.category) + '</span></td>'
        + '<td class="text-sm text-gray-800">' + fblEsc(r.body || '') + '</td>'
        + '<td class="text-xs text-gray-500 truncate" title="' + fblEsc(r.page_path || '') + '">' + fblEsc(r.page_label || '-') + '</td>'
        + '<td class="text-xs text-gray-400">' + (evidence.join(' ') || '-') + '</td>'
        + '<td>' + (done
          ? '<span class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">처리됨</span>'
            + (r.notified_at ? '' : '<span class="text-xs text-red-500 ml-1" title="처리했지만 신고자에게 알림이 안 갔습니다">미통보</span>')
          : '<span class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">미처리</span>')
        + '</td></tr>';
    }).join('');
  } catch (e) {
    console.error('[feedback] 목록 조회 실패', e);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-500 py-8">불러오지 못했습니다.</td></tr>';
  }
}

async function openFeedbackDetail(id) {
  var modal = document.getElementById('fblDetailModal');
  var body = document.getElementById('fblDetailBody');
  if (!modal || !body) { console.warn('[feedback] detail modal not found'); return; }
  modal.classList.remove('hidden');
  body.innerHTML = '<div class="text-sm text-gray-400 py-6 text-center">불러오는 중…</div>';

  try {
    var res = await axios.get('/api/feedback/' + id);
    var d = (res.data && res.data.data) || null;
    if (!d) throw new Error('없음');
    fblCurrent = d;

    var title = document.getElementById('fblDetailTitle');
    if (title) title.textContent = '#' + d.id + ' · ' + (FBL_CAT[d.category] || d.category);

    var atts = d.attachments || [];
    var attHtml = atts.length
      ? atts.map(function (a, i) {
          return '<button type="button" class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-100 text-xs text-gray-700 hover:bg-gray-200" '
            + 'onclick="downloadFeedbackAttachment(' + d.id + ',' + i + ')">'
            + '<i class="fas ' + (a.kind === 'capture' ? 'fa-image' : 'fa-paperclip') + ' text-gray-400"></i>'
            + fblEsc(a.name) + '<span class="text-gray-400">' + fblSize(a.size) + '</span></button>';
        }).join(' ')
      : '<span class="text-xs text-gray-400">없음</span>';

    var rows = [
      ['낸 사람', fblEsc(d.reporter_name || '-') + ' <span class="text-gray-400">' + fblEsc(String(d.created_at || '').slice(0, 16)) + '</span>'],
      ['어느 화면', fblEsc(d.page_label || '-') + ' <span class="text-gray-400">' + fblEsc(d.page_path || '') + '</span>'],
    ];
    if (d.context_ref) rows.push(['보고 있던 것', fblEsc(d.context_ref)]);
    if (d.file_path) rows.push(['파일 경로', '<code class="text-xs bg-amber-50 px-1.5 py-0.5 rounded">' + fblEsc(d.file_path) + '</code>'
      + ' <span class="text-xs text-gray-400">— 탐색기에 붙여넣어 원본을 그대로 여세요</span>']);
    rows.push(['증거', attHtml]);
    if (d.last_error) rows.push(['최근 기록', '<pre class="text-xs bg-gray-50 rounded p-2 whitespace-pre-wrap">' + fblEsc(d.last_error) + '</pre>']);
    if (d.client_info) rows.push(['환경', '<span class="text-xs text-gray-500">' + fblEsc(d.client_info) + '</span>']);

    var done = d.status === 'DONE';
    body.innerHTML =
      '<div class="text-base text-gray-900 bg-gray-50 rounded-lg p-3 mb-4 whitespace-pre-wrap">' + fblEsc(d.body) + '</div>'
      + '<table class="w-full text-sm mb-4">' + rows.map(function (r) {
        return '<tr><td class="text-xs text-gray-500 align-top py-1.5 pr-3 whitespace-nowrap" style="width:96px;">' + r[0] + '</td>'
          + '<td class="py-1.5">' + r[1] + '</td></tr>';
      }).join('') + '</table>'
      + '<div class="border-t pt-3">'
      + '<label class="text-xs font-semibold text-gray-600 mb-1.5 block">처리 메모 <span class="text-gray-400 font-normal">— 여기 쓴 내용이 신고자에게 그대로 갑니다</span></label>'
      + '<textarea id="fblNote" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="예) 품목 검색에 규격을 같이 띄웠습니다. 다시 한번 봐 주세요.">' + fblEsc(d.handled_note || '') + '</textarea>'
      + (d.handled_by_name ? '<div class="text-xs text-gray-400 mt-1">처리: ' + fblEsc(d.handled_by_name) + ' · ' + fblEsc(String(d.handled_at || '').slice(0, 16))
          + (d.notified_at ? ' · 통보됨' : ' · <span class="text-red-500">미통보</span>') + '</div>' : '')
      + '<div class="flex justify-end gap-2 mt-3">'
      + '<button type="button" onclick="closeFeedbackDetail()" class="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">닫기</button>'
      + (done
        ? '<button type="button" id="fblActBtn" onclick="reopenFeedback(' + d.id + ')" class="px-4 py-2 rounded-lg text-sm text-white bg-gray-500 hover:bg-gray-600">미처리로 되돌리기</button>'
        : '<button type="button" id="fblActBtn" onclick="markFeedbackDone(' + d.id + ')" class="px-4 py-2 rounded-lg text-sm text-white bg-green-600 hover:bg-green-700">처리됨 · 신고자에게 알리기</button>')
      + '</div></div>';
  } catch (e) {
    console.error('[feedback] 상세 조회 실패', e);
    body.innerHTML = '<div class="text-sm text-red-500 py-6 text-center">불러오지 못했습니다.</div>';
  }
}

function closeFeedbackDetail() {
  var modal = document.getElementById('fblDetailModal');
  if (modal) modal.classList.add('hidden');
  fblCurrent = null;
}

async function fblPatch(id, status, successMsg) {
  var btn = document.getElementById('fblActBtn');
  var noteEl = document.getElementById('fblNote');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중…'; }
  try {
    await axios.patch('/api/feedback/' + id, {
      status: status,
      handled_note: noteEl ? (noteEl.value || '').trim() : '',
    });
    closeFeedbackDetail();
    if (typeof showToast === 'function') showToast(successMsg, 'success');
    loadFeedbackList();
  } catch (e) {
    console.error('[feedback] 처리 실패', e);
    if (typeof showToast === 'function') showToast('처리에 실패했습니다.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '다시 시도'; }
  }
}

function markFeedbackDone(id) {
  fblPatch(id, 'DONE', '처리됨으로 바꿨습니다. 신고자에게 알림이 갑니다.');
}

function reopenFeedback(id) {
  fblPatch(id, 'OPEN', '미처리로 되돌렸습니다.');
}

function downloadFeedbackAttachment(id, index) {
  var att = (fblCurrent && fblCurrent.attachments && fblCurrent.attachments[index]) || null;
  window.dsOpenAuthFile('/api/feedback/' + id + '/attachment/' + index, att ? att.name : 'attachment');
}

(function fblInit() {
  loadFeedbackList();
  // 알림 링크(/feedback?id=N)로 들어오면 그 건을 바로 연다
  try {
    var id = new URLSearchParams(location.search).get('id');
    if (id) setTimeout(function () { openFeedbackDetail(parseInt(id)); }, 200);
  } catch (e) { /* 구형 브라우저 — 목록만 보여 준다 */ }
})();
