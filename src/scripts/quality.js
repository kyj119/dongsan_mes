// /quality — 품질/클레임/반품/불량코드 (백엔드 routes/claims.ts·returns.ts 활성화 UI)
// ?raw 전역 스코프 충돌 방지: 전부 IIFE 로컬 + window.qc* 만 노출
(function () {
  var esc = window.escapeHtml || function (s) { return s == null ? '' : String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  var money = window.fmtMoney || function (n) { return Number(n || 0).toLocaleString(); };
  var toast = function (m, t) { if (window.showToast) window.showToast(m, t); else console.log('[quality]', m); };
  var apiErr = function (e, m) { if (window.handleApiError) window.handleApiError(e, m); else { console.error(m, e); toast(m, 'error'); } };
  var fmtDate = function (s) { return s ? String(s).slice(0, 10) : ''; };

  var loaded = { returns: false, defects: false, analytics: false };
  var pickedOrder = { id: null, clientId: null, label: '' };
  var qcClaimsPage = 1, qcReturnsPage = 1;

  // 페이지바 렌더 (orders 페이지 스타일 재사용). goFn = onclick에서 호출할 전역 함수명 문자열.
  function qcRenderPagebar(containerId, pagination, goFn) {
    var container = document.getElementById(containerId);
    if (!container) { console.warn('[quality] #' + containerId + ' not found'); return; }
    var total = pagination ? (pagination.total || 0) : 0;
    var page = pagination ? (pagination.page || 1) : 1;
    var totalPages = pagination ? (pagination.total_pages || Math.ceil(total / (pagination.limit || 1)) || 1) : 1;
    if (totalPages <= 1) { container.innerHTML = pagination ? '<span style="font-size:13px;color:#6b7280;">총 ' + total + '건</span>' : ''; return; }
    var btnStyle = 'padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:#fff;';
    var btnDisabled = 'padding:6px 14px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:not-allowed;background:#f9fafb;color:#9ca3af;';
    var buttons = '';
    var startPage = Math.max(1, page - 2);
    var endPage = Math.min(totalPages, startPage + 4);
    for (var p = startPage; p <= endPage; p++) {
      var active = p === page ? 'padding:6px 12px;border:1px solid #2563eb;border-radius:6px;font-size:13px;cursor:pointer;background:#2563eb;color:#fff;font-weight:600;' : btnStyle;
      buttons += '<button onclick="' + goFn + '(' + p + ')" style="' + active + '">' + p + '</button>';
    }
    container.innerHTML =
      '<button onclick="' + goFn + '(' + (page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + ' style="' + (page <= 1 ? btnDisabled : btnStyle) + '">이전</button>' +
      buttons +
      '<button onclick="' + goFn + '(' + (page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + ' style="' + (page >= totalPages ? btnDisabled : btnStyle) + '">다음</button>' +
      '<span style="font-size:13px;color:#6b7280;margin-left:8px;">' + page + ' / ' + totalPages + ' 페이지 (총 ' + total + '건)</span>';
  }

  var RETURN_LABEL = { REQUESTED: '요청', APPROVED: '승인', SHIPPED_BACK: '반송중', RECEIVED: '입고', INSPECTED: '검수', RESOLVED: '완료' };
  var RETURN_NEXT = { REQUESTED: 'APPROVED', APPROVED: 'SHIPPED_BACK', SHIPPED_BACK: 'RECEIVED', RECEIVED: 'INSPECTED', INSPECTED: 'RESOLVED' };
  var CLAIM_TYPE = { DEFECT: '품질불량', DELAY: '납기지연', QUANTITY: '수량오류', WRONG: '오배송', OTHER: '기타' };
  // customer_claims.status (migrations/0213): OPEN | INVESTIGATING | RESOLVED | CLOSED
  var CLAIM_STATUS_LABEL = { OPEN: '접수', INVESTIGATING: '조사중', RESOLVED: '해결', CLOSED: '종결' };
  // returns.return_reason (migrations/0214): DEFECT | WRONG_ITEM | OVERSTOCK | CUSTOMER_CHANGE
  var RETURN_REASON_LABEL = { DEFECT: '불량품', WRONG_ITEM: '오배송', OVERSTOCK: '재고과다', CUSTOMER_CHANGE: '고객변심' };
  // defect_codes.category — 등록폼(qcDefectCategory) 옵션과 통일 + 레거시 시드값(POST_PROCESS/DESIGN) 호환
  var DEFECT_CATEGORY_LABEL = { PRINT: '인쇄', FINISHING: '후가공', MATERIAL: '자재', COLOR: '색상', SIZE: '규격', OTHER: '기타', POST_PROCESS: '후가공', DESIGN: '디자인' };

  function badge(text, cls) { return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ' + cls + '">' + esc(text) + '</span>'; }
  function claimBadge(s) { return badge(CLAIM_STATUS_LABEL[s] || s || '-', s === 'RESOLVED' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'); }
  function returnBadge(s) { var m = { RESOLVED: 'bg-green-50 text-green-700', REQUESTED: 'bg-amber-50 text-amber-700' }; return badge(RETURN_LABEL[s] || s || '-', m[s] || 'bg-blue-50 text-blue-700'); }

  // ─── 탭 ───
  window.qcTab = function (name) {
    document.querySelectorAll('.qc-pane').forEach(function (p) { p.classList.add('hidden'); });
    var pane = document.getElementById('qc-pane-' + name);
    if (pane) pane.classList.remove('hidden');
    document.querySelectorAll('.qc-tab').forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.className = 'qc-tab px-4 py-2.5 text-xs font-medium border-b-2 ' + (on ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500');
    });
    if (name === 'returns' && !loaded.returns) { loaded.returns = true; window.qcLoadReturns(); }
    if (name === 'defects' && !loaded.defects) { loaded.defects = true; window.qcLoadDefects(); }
    if (name === 'analytics' && !loaded.analytics) { loaded.analytics = true; window.qcLoadAnalytics(); }
  };

  window.qcCloseModal = function (id) { var m = document.getElementById(id); if (m) m.style.display = 'none'; };
  function openModal(id) { var m = document.getElementById(id); if (m) { m.style.display = 'flex'; } }

  // ─── 클레임 ───
  window.qcLoadClaims = function (page) {
    qcClaimsPage = page || 1;
    var st = document.getElementById('qcClaimStatus');
    var body = document.getElementById('qcClaimsBody');
    if (!body) return;
    var params = { page: qcClaimsPage, limit: 50 };
    if (st && st.value) params.status = st.value;
    axios.get('/api/claims', { params: params }).then(function (res) {
      var rows = res.data.data || [];
      qcRenderPagebar('qcClaimsPagebar', res.data.pagination, 'window.qcClaimsGoPage');
      if (!rows.length) { body.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-400">클레임이 없습니다.</td></tr>'; return; }
      body.innerHTML = rows.map(function (r) {
        var act = r.status === 'RESOLVED'
          ? '<span class="text-[10px] text-gray-400">' + fmtDate(r.resolved_at) + '</span>'
          : '<button onclick="window.qcOpenResolve(' + r.id + ')" class="px-2 py-0.5 bg-green-600 text-white text-[10px] rounded">해결</button>';
        return '<tr>' +
          '<td class="col-code font-mono text-[11px]">' + esc(r.claim_number) + '</td>' +
          '<td>' + esc(r.client_name || '-') + '</td>' +
          '<td class="col-code text-[11px]">' + esc(r.order_number || '-') + '</td>' +
          '<td>' + esc(CLAIM_TYPE[r.claim_type] || r.claim_type || '-') + '</td>' +
          '<td class="max-w-[220px] truncate" title="' + esc(r.description) + '">' + esc(r.description) + '</td>' +
          '<td class="col-money text-right tabular-nums">' + money(r.claimed_amount) + '</td>' +
          '<td>' + claimBadge(r.status) + '</td>' +
          '<td class="col-date text-[11px]">' + fmtDate(r.claim_date || r.created_at) + '</td>' +
          '<td class="col-action text-center">' + act + '</td></tr>';
      }).join('');
    }).catch(function (e) { apiErr(e, '클레임 로드 실패'); body.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-400">로드 실패</td></tr>'; });
  };
  window.qcClaimsGoPage = function (p) { window.qcLoadClaims(p); };

  window.qcOpenClaimModal = function () {
    pickedOrder = { id: null, clientId: null, label: '' };
    ['qcClaimOrderSearch', 'qcClaimDesc'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
    var amt = document.getElementById('qcClaimAmount'); if (amt) amt.value = '0';
    var res = document.getElementById('qcOrderResults'); if (res) res.innerHTML = '';
    var pk = document.getElementById('qcClaimOrderPicked'); if (pk) pk.textContent = '';
    openModal('qcClaimModal');
  };

  window.qcSearchOrder = function () {
    var q = document.getElementById('qcClaimOrderSearch');
    var box = document.getElementById('qcOrderResults');
    if (!q || !box || !q.value.trim()) return;
    axios.get('/api/search?q=' + encodeURIComponent(q.value.trim())).then(function (res) {
      var orders = (res.data.data && res.data.data.orders) || [];
      if (!orders.length) { box.innerHTML = '<div class="text-gray-400 py-1">검색 결과 없음</div>'; return; }
      box.innerHTML = orders.map(function (o) {
        return '<div class="py-1 px-1 hover:bg-blue-50 cursor-pointer rounded" onclick="window.qcPickOrder(' + o.id + ',\'' + esc(o.order_number) + '\')">' +
          '<span class="font-mono text-[11px]">' + esc(o.order_number) + '</span> · ' + esc(o.client_name || '') + '</div>';
      }).join('');
    }).catch(function (e) { apiErr(e, '주문 검색 실패'); });
  };

  window.qcPickOrder = function (id, orderNumber) {
    axios.get('/api/orders/' + id).then(function (res) {
      var o = res.data.data || {};
      pickedOrder = { id: id, clientId: o.client_id, label: orderNumber };
      var pk = document.getElementById('qcClaimOrderPicked');
      if (pk) pk.innerHTML = '<i class="fas fa-check mr-1"></i>선택: ' + esc(orderNumber) + ' (' + esc(o.client_name || '') + ')';
      var box = document.getElementById('qcOrderResults'); if (box) box.innerHTML = '';
    }).catch(function (e) { apiErr(e, '주문 조회 실패'); });
  };

  window.qcSubmitClaim = function () {
    if (!pickedOrder.id || !pickedOrder.clientId) { toast('주문을 선택하세요', 'error'); return; }
    var desc = document.getElementById('qcClaimDesc');
    if (!desc || !desc.value.trim()) { toast('내용을 입력하세요', 'error'); return; }
    axios.post('/api/claims', {
      order_id: pickedOrder.id,
      client_id: pickedOrder.clientId,
      claim_type: document.getElementById('qcClaimType').value,
      claimed_amount: Number(document.getElementById('qcClaimAmount').value || 0),
      description: desc.value.trim(),
    }).then(function () { toast('클레임 등록 완료', 'success'); window.qcCloseModal('qcClaimModal'); window.qcLoadClaims(); })
      .catch(function (e) { apiErr(e, '클레임 등록 실패'); });
  };

  window.qcOpenResolve = function (id) {
    document.getElementById('qcResolveId').value = id;
    document.getElementById('qcResolveAmount').value = '0';
    openModal('qcResolveModal');
  };
  window.qcSubmitResolve = function () {
    var id = document.getElementById('qcResolveId').value;
    axios.patch('/api/claims/' + id + '/resolve', {
      resolution_type: document.getElementById('qcResolveType').value,
      resolved_amount: Number(document.getElementById('qcResolveAmount').value || 0),
    }).then(function () { toast('해결 처리 완료', 'success'); window.qcCloseModal('qcResolveModal'); window.qcLoadClaims(); })
      .catch(function (e) { apiErr(e, '해결 처리 실패'); });
  };

  // ─── 반품 ───
  window.qcLoadReturns = function (page) {
    qcReturnsPage = page || 1;
    var st = document.getElementById('qcReturnStatus');
    var body = document.getElementById('qcReturnsBody');
    if (!body) return;
    var params = { page: qcReturnsPage, limit: 50 };
    if (st && st.value) params.status = st.value;
    axios.get('/api/returns', { params: params }).then(function (res) {
      var rows = res.data.data || [];
      qcRenderPagebar('qcReturnsPagebar', res.data.pagination, 'window.qcReturnsGoPage');
      if (!rows.length) { body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">반품이 없습니다.</td></tr>'; return; }
      body.innerHTML = rows.map(function (r) {
        var act = (r.status === 'RESOLVED')
          ? '<span class="text-[10px] text-gray-400">완료</span>'
          : '<button onclick="window.qcOpenReturnStatus(' + r.id + ',\'' + r.status + '\')" class="px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded">상태변경</button>';
        return '<tr>' +
          '<td class="col-code font-mono text-[11px]">' + esc(r.return_number) + '</td>' +
          '<td>' + esc(r.client_name || '-') + '</td>' +
          '<td class="col-code text-[11px]">' + esc(r.order_number || '-') + '</td>' +
          '<td class="max-w-[220px] truncate" title="' + esc(RETURN_REASON_LABEL[r.return_reason] || r.return_reason) + '">' + esc(RETURN_REASON_LABEL[r.return_reason] || r.return_reason) + '</td>' +
          '<td>' + returnBadge(r.status) + '</td>' +
          '<td class="col-money text-right tabular-nums">' + money(r.refund_amount) + '</td>' +
          '<td class="col-date text-[11px]">' + fmtDate(r.return_date || r.created_at) + '</td>' +
          '<td class="col-action text-center">' + act + '</td></tr>';
      }).join('');
    }).catch(function (e) { apiErr(e, '반품 로드 실패'); body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-400">로드 실패</td></tr>'; });
  };
  window.qcReturnsGoPage = function (p) { window.qcLoadReturns(p); };

  window.qcOpenReturnStatus = function (id, current) {
    document.getElementById('qcReturnId').value = id;
    document.getElementById('qcReturnCurrent').innerHTML = '현재: ' + returnBadge(current);
    var next = RETURN_NEXT[current];
    var sel = document.getElementById('qcReturnNext');
    var wrap = document.getElementById('qcReturnResolveWrap');
    if (!next) {
      sel.innerHTML = '<option value="">전환 가능 상태 없음</option>';
      wrap.classList.add('hidden');
    } else {
      sel.innerHTML = '<option value="' + next + '">' + (RETURN_LABEL[next] || next) + '</option>';
      if (next === 'RESOLVED') wrap.classList.remove('hidden'); else wrap.classList.add('hidden');
    }
    openModal('qcReturnModal');
  };
  window.qcSubmitReturnStatus = function () {
    var id = document.getElementById('qcReturnId').value;
    var next = document.getElementById('qcReturnNext').value;
    if (!next) { window.qcCloseModal('qcReturnModal'); return; }
    var body = { status: next };
    if (next === 'RESOLVED') {
      body.resolution = document.getElementById('qcReturnResolution').value;
      body.refund_amount = Number(document.getElementById('qcReturnRefund').value || 0);
    }
    axios.patch('/api/returns/' + id + '/status', body)
      .then(function () { toast('상태 변경 완료', 'success'); window.qcCloseModal('qcReturnModal'); window.qcLoadReturns(); })
      .catch(function (e) { apiErr(e, '상태 변경 실패'); });
  };

  // ─── 불량코드 ───
  window.qcLoadDefects = function () {
    var body = document.getElementById('qcDefectsBody');
    if (!body) return;
    axios.get('/api/claims/defect-codes').then(function (res) {
      var rows = res.data.data || [];
      if (!rows.length) { body.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">불량코드가 없습니다.</td></tr>'; return; }
      body.innerHTML = rows.map(function (r) {
        return '<tr>' +
          '<td class="col-code font-mono text-[11px]">' + esc(r.code) + '</td>' +
          '<td>' + esc(r.name) + '</td>' +
          '<td>' + esc(DEFECT_CATEGORY_LABEL[r.category] || r.category || '-') + '</td>' +
          '<td>' + esc(r.parent_name || '-') + '</td>' +
          '<td class="max-w-[240px] truncate" title="' + esc(r.preventive_action) + '">' + esc(r.preventive_action || '-') + '</td></tr>';
      }).join('');
    }).catch(function (e) { apiErr(e, '불량코드 로드 실패'); body.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-red-400">로드 실패</td></tr>'; });
  };
  window.qcOpenDefectModal = function () {
    ['qcDefectCode', 'qcDefectName', 'qcDefectPrevent'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
    openModal('qcDefectModal');
  };
  window.qcSubmitDefect = function () {
    var code = document.getElementById('qcDefectCode').value.trim();
    var name = document.getElementById('qcDefectName').value.trim();
    if (!code || !name) { toast('코드와 명칭은 필수', 'error'); return; }
    axios.post('/api/claims/defect-codes', {
      code: code, name: name,
      category: document.getElementById('qcDefectCategory').value,
      preventive_action: document.getElementById('qcDefectPrevent').value.trim() || null,
    }).then(function () { toast('불량코드 추가 완료', 'success'); window.qcCloseModal('qcDefectModal'); window.qcLoadDefects(); })
      .catch(function (e) { apiErr(e, '불량코드 추가 실패'); });
  };

  // ─── 분석 ───
  window.qcLoadAnalytics = function () {
    axios.get('/api/claims/analytics').then(function (res) {
      var d = res.data.data || {};
      var t = document.getElementById('qcAnaType');
      var cl = document.getElementById('qcAnaClient');
      var mo = document.getElementById('qcAnaMonthly');
      if (t) t.innerHTML = (d.byType || []).length ? d.byType.map(function (x) {
        return '<div class="flex justify-between"><span>' + esc(CLAIM_TYPE[x.claim_type] || x.claim_type || '-') + '</span><span class="tabular-nums">' + x.cnt + '건 · ' + money(x.total_amount) + '</span></div>';
      }).join('') : '<div class="text-gray-400">데이터 없음</div>';
      if (cl) cl.innerHTML = (d.byClient || []).length ? d.byClient.map(function (x) {
        return '<div class="flex justify-between"><span class="truncate max-w-[140px]">' + esc(x.client_name || '-') + '</span><span class="tabular-nums">' + x.cnt + '건</span></div>';
      }).join('') : '<div class="text-gray-400">데이터 없음</div>';
      if (mo) mo.innerHTML = (d.monthly || []).length ? d.monthly.map(function (x) {
        return '<div class="flex justify-between"><span>' + esc(x.month) + '</span><span class="tabular-nums">' + x.cnt + '건 · ' + money(x.total) + '</span></div>';
      }).join('') : '<div class="text-gray-400">데이터 없음</div>';
    }).catch(function (e) { apiErr(e, '분석 로드 실패'); });
  };

  // 초기 로드 (기본 탭 = 클레임)
  window.qcLoadClaims();
})();
