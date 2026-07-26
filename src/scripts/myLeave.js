// /my-leave — 로그인 계정 직원 셀프 휴가 (#568 C안). API=/api/my/leaves (users 토큰, axios 전역 인터셉터가 헤더 부착)
(function () {
  var esc = window.escapeHtml || function (s) { return s == null ? '' : String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var toast = function (m, t) { if (window.showToast) window.showToast(m, t); };
  var LV_STATUS = { PENDING: '대기', APPROVED: '승인', REJECTED: '반려', CANCELLED: '취소' };
  var STATUS_CLS = { PENDING: 'bg-amber-100 text-amber-800', APPROVED: 'bg-green-100 text-green-800', REJECTED: 'bg-red-100 text-red-800', CANCELLED: 'bg-gray-100 text-gray-600' };
  function days(n) { var v = parseFloat(n || 0); return v ? (Math.round(v * 10) / 10).toString() : '0'; }

  function showError(msg) {
    var e = document.getElementById('mlError');
    if (e) { e.textContent = msg; e.classList.remove('hidden'); }
  }
  function clearError() { var e = document.getElementById('mlError'); if (e) e.classList.add('hidden'); }

  function render(data) {
    var bal = data.balance || null;
    var types = data.leave_types || [];
    var reqs = data.requests || [];
    var remaining = 0, used = 0, expected = '-';
    if (bal) {
      expected = (bal.expected_annual != null ? bal.expected_annual : '-');
      var yr = String(bal.current_year);
      (bal.history || []).forEach(function (h) { if (String(h.year) === yr) { remaining += parseFloat(h.remaining || 0); used += parseFloat(h.used || 0); } });
    }
    document.getElementById('mlRemaining').textContent = days(remaining);
    document.getElementById('mlUsed').textContent = days(used);
    document.getElementById('mlExpected').textContent = String(expected);

    var sel = document.getElementById('mlType');
    if (sel) sel.innerHTML = types.map(function (t) { return '<option value="' + esc(t.code) + '">' + esc(t.name) + '</option>'; }).join('') || '<option value="">유형 없음</option>';

    var body = document.getElementById('mlRequests');
    if (!reqs.length) { body.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">신청 내역이 없습니다.</td></tr>'; return; }
    body.innerHTML = reqs.map(function (r) {
      var cls = STATUS_CLS[r.status] || 'bg-gray-100 text-gray-600';
      var badge = '<span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ' + cls + '">' + (LV_STATUS[r.status] || r.status) + '</span>';
      var cancel = r.status === 'PENDING' ? '<button onclick="mlCancel(' + r.id + ')" class="text-xs text-red-600 hover:underline">취소</button>' : '<span class="text-gray-300">-</span>';
      var rej = (r.status === 'REJECTED' && r.rejection_reason) ? '<div class="text-[11px] text-red-600 mt-0.5">반려: ' + esc(r.rejection_reason) + '</div>' : '';
      return '<tr class="border-b border-gray-100">' +
        '<td class="px-4 py-2">' + esc(r.leave_type_name || r.leave_type || '-') + rej + '</td>' +
        '<td class="px-4 py-2 text-gray-600">' + esc(r.start_date || '') + ' ~ ' + esc(r.end_date || '') + (r.reason ? '<div class="text-[11px] text-gray-400">' + esc(r.reason) + '</div>' : '') + '</td>' +
        '<td class="col-qty px-4 py-2 text-right tabular-nums font-medium">' + days(r.days) + '</td>' +
        '<td class="col-status px-4 py-2 text-center">' + badge + '</td>' +
        '<td class="col-action px-4 py-2 text-center">' + cancel + '</td></tr>';
    }).join('');
  }

  function handleNoLink(msg) {
    var nl = document.getElementById('mlNoLink'), bd = document.getElementById('mlBody');
    if (nl) { nl.classList.remove('hidden'); var m = document.getElementById('mlNoLinkMsg'); if (m && msg) m.textContent = msg; }
    if (bd) bd.classList.add('hidden');
  }

  async function load() {
    try {
      var res = await axios.get('/api/my/leaves');
      if (res.data.success) render(res.data.data);
    } catch (err) {
      var d = err.response && err.response.data;
      if (err.response && err.response.status === 404 && d && d.linked === false) { handleNoLink(d.error); return; }
      var body = document.getElementById('mlRequests');
      if (body) body.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">' + esc((d && d.error) || '조회 실패') + '</td></tr>';
    }
  }

  window.mlCancel = async function (id) {
    if (!id) return;
    try { await axios.delete('/api/my/leaves/' + id); toast('신청을 취소했습니다.', 'success'); load(); }
    catch (err) { toast((err.response && err.response.data && err.response.data.error) || '취소 실패', 'error'); }
  };

  var btn = document.getElementById('mlSubmit');
  if (btn) {
    btn.addEventListener('click', async function () {
      clearError();
      var type = document.getElementById('mlType').value;
      var start = document.getElementById('mlStart').value;
      var end = document.getElementById('mlEnd').value;
      var reason = document.getElementById('mlReason').value;
      if (!type || !start || !end) { showError('유형·시작일·종료일을 입력하세요.'); return; }
      if (end < start) { showError('종료일이 시작일보다 빠릅니다.'); return; }
      btn.disabled = true;
      try {
        await axios.post('/api/my/leaves', { leave_type: type, start_date: start, end_date: end, reason: reason });
        document.getElementById('mlReason').value = '';
        toast('휴가를 신청했습니다. 승인 대기 중입니다.', 'success');
        load();
      } catch (err) {
        showError((err.response && err.response.data && err.response.data.error) || '신청 실패');
      } finally { btn.disabled = false; }
    });
  }

  load();
})();
