(function() {

  var resetTargetId = null;
  // #335: XSS 방어 — 사용자명/아이디 HTML 이스케이프
  var esc = window.escapeHtml || function(s) { if (s === null || s === undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); };
  // onclick JS 문자열 인자용 이스케이프 (따옴표/역슬래시)
  function jsStr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/</g, '\\x3C'); }

  function getRoleBadge(role) {
    var labels = { ADMIN: '관리자', MANAGER: '매니저', DESIGNER: '디자이너', OPERATOR: '오퍼레이터', ACCOUNTANT: '경리', SALES: '영업', FINISHING: '후가공', SHIPPING: '배송' };
    var label = labels[role] || role;
    return '<span class="role-badge role-' + role + '">' + label + '</span>';
  }

  function formatDate(str) {
    if (!str) return '-';
    return formatKST(str, 'date', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function renderTable(users) {
    if (!users || users.length === 0) {
      document.getElementById('usersTableWrap').innerHTML =
        '<div class="text-center py-12 text-gray-400"><i class="fas fa-users text-3xl mb-3"></i><p>등록된 사용자가 없습니다.</p></div>';
      return;
    }
    var rows = users.map(function(u) {
      var statusBadge = u.is_active
        ? '<span class="status-badge status-active">활성</span>'
        : '<span class="status-badge status-inactive">비활성</span>';
      var toggleLabel = u.is_active ? '비활성화' : '활성화';
      var toggleClass = u.is_active ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700';
      return '<tr class="border-b hover:bg-gray-50">' +
        '<td class="px-4 py-3 font-medium text-gray-900" title="' + esc(u.name || '-') + '">' + esc(u.name || '-') + '</td>' +
        '<td class="px-4 py-3 text-gray-600 font-mono text-sm" title="' + esc(u.username || '-') + '">' + esc(u.username || '-') + '</td>' +
        '<td class="px-4 py-3">' + getRoleBadge(u.role) + '</td>' +
        '<td class="px-4 py-3 text-center">' + statusBadge + '</td>' +
        '<td class="px-4 py-3 text-gray-500 text-sm">' + formatDate(u.last_login_at) + '</td>' +
        '<td class="px-4 py-3 text-center">' +
          '<div class="flex gap-3 items-center justify-center">' +
            '<button data-user-json="' + JSON.stringify(u).replace(/"/g, '&quot;') + '" onclick="showEditModal(JSON.parse(this.getAttribute(\'data-user-json\')))" class="text-blue-600 hover:text-blue-700 text-sm font-medium">수정</button>' +
            '<button onclick="showResetModal(' + u.id + ', \'' + jsStr(u.name || u.username) + '\')" class="text-orange-500 hover:text-orange-700 text-sm font-medium">비번 초기화</button>' +
            '<button onclick="toggleActive(' + u.id + ', ' + (u.is_active ? 'false' : 'true') + ')" class="' + toggleClass + ' text-sm font-medium">' + toggleLabel + '</button>' +
            '<button onclick="openItemAccessModal(' + u.id + ', \'' + jsStr(u.name || u.username) + '\')" class="text-purple-600 hover:text-purple-700 text-sm font-medium" title="주문서에서 이 사용자가 쓸 품목 그룹 제한">품목배정</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('usersTableWrap').innerHTML =
      '<table class="w-full text-left ds-table">' +
        '<thead class="bg-gray-50 border-b">' +
          '<tr>' +
            '<th class="col-name px-4 py-3 text-sm font-medium text-gray-500">이름</th>' +
            '<th class="col-code px-4 py-3 text-sm font-medium text-gray-500">아이디</th>' +
            '<th class="col-tag px-4 py-3 text-sm font-medium text-gray-500">역할</th>' +
            '<th class="col-status px-4 py-3 text-sm font-medium text-gray-500 text-center">상태</th>' +
            '<th class="col-datetime px-4 py-3 text-sm font-medium text-gray-500">마지막 로그인</th>' +
            '<th class="col-action px-4 py-3 text-sm font-medium text-gray-500 text-center">액션</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  window.loadUsers = function() {
    axios.get('/api/users')
      .then(function(res) {
        renderTable(res.data.data || []);
      })
      .catch(function(err) {
        document.getElementById('usersTableWrap').innerHTML =
          '<div class="text-center py-12 text-red-400"><i class="fas fa-exclamation-circle text-3xl mb-3"></i><p>불러오기 실패: ' + esc(err.response && err.response.data && err.response.data.error || err.message) + '</p></div>';
      });
  };

  // ── C2: 사용자별 사용품목(item_group) 배정 모달 ──────────────
  window.openItemAccessModal = function(userId, userName) {
    var existing = document.getElementById('itemAccessModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'itemAccessModal';
    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[70]';
    modal.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">' +
      '<div class="p-4 border-b flex items-center justify-between">' +
        '<h2 class="text-lg font-bold"><i class="fas fa-user-tag text-purple-600 mr-2"></i>사용 품목 배정 — ' + esc(userName || '') + '</h2>' +
        '<button onclick="document.getElementById(\'itemAccessModal\').remove()" class="p-2 text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>' +
      '</div>' +
      '<div class="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b">체크한 품목 그룹만 <b>주문서 검색</b>에 노출됩니다. <b>아무것도 체크 안 하면 전체 노출</b>(제한 없음). 그룹 없는 제품은 항상 노출.</div>' +
      '<div class="flex-1 overflow-auto p-4" id="itemAccessBody"><div class="text-center py-12 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>불러오는 중...</div></div>' +
      '<div class="border-t p-3 bg-gray-50 rounded-b-xl flex items-center justify-between">' +
        '<span class="text-xs text-gray-400" id="itemAccessCount"></span>' +
        '<div class="flex gap-2">' +
          '<button onclick="document.getElementById(\'itemAccessModal\').remove()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>' +
          '<button id="itemAccessSaveBtn" onclick="saveItemAccess(' + userId + ')" class="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700">저장</button>' +
        '</div>' +
      '</div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    Promise.all([
      axios.get('/api/items/groups'),
      axios.get('/api/users/' + userId + '/item-access')
    ]).then(function(rs) {
      var groups = (rs[0].data.data || rs[0].data.groups || []);
      var allowed = {};
      ((rs[1].data.data && rs[1].data.data.groups) || []).forEach(function(g) { allowed[g] = true; });
      // 분류별 묶기
      var byCat = {};
      groups.forEach(function(g) {
        var name = g.item_group; if (!name) return;
        var cat = g.category || '(기타)';
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push({ name: name, count: g.variant_count || g.item_count || 0 });
      });
      var html = '';
      Object.keys(byCat).sort().forEach(function(cat) {
        var items = byCat[cat].sort(function(a, b){ return a.name.localeCompare(b.name); });
        html += '<div class="mb-3 border rounded-lg overflow-hidden">' +
          '<div class="px-3 py-2 bg-gray-50 flex items-center justify-between">' +
            '<span class="font-medium text-sm">' + esc(cat) + ' <span class="text-xs text-gray-400">(' + items.length + ')</span></span>' +
            '<label class="text-xs text-blue-600 cursor-pointer"><input type="checkbox" class="cat-all mr-1" data-cat="' + esc(cat) + '"> 전체</label>' +
          '</div>' +
          '<div class="p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">';
        items.forEach(function(it) {
          html += '<label class="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded hover:bg-purple-50 cursor-pointer">' +
            '<input type="checkbox" class="ia-grp" data-cat="' + esc(cat) + '" value="' + esc(it.name) + '"' + (allowed[it.name] ? ' checked' : '') + '>' +
            '<span class="truncate" title="' + esc(it.name) + '">' + esc(it.name) + '</span></label>';
        });
        html += '</div></div>';
      });
      document.getElementById('itemAccessBody').innerHTML = html || '<div class="text-center py-8 text-gray-400 text-sm">그룹이 없습니다.</div>';
      // 분류 전체 토글
      Array.prototype.forEach.call(document.querySelectorAll('.cat-all'), function(catCb) {
        catCb.addEventListener('change', function() {
          var cat = this.getAttribute('data-cat'); var on = this.checked;
          Array.prototype.forEach.call(document.querySelectorAll('.ia-grp[data-cat="' + cat + '"]'), function(cb) { cb.checked = on; });
          updateItemAccessCount();
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('.ia-grp'), function(cb) { cb.addEventListener('change', updateItemAccessCount); });
      updateItemAccessCount();
    }).catch(function(err) {
      document.getElementById('itemAccessBody').innerHTML = '<div class="text-center py-8 text-red-400 text-sm">불러오기 실패</div>';
    });
  };

  function updateItemAccessCount() {
    var n = document.querySelectorAll('.ia-grp:checked').length;
    var el = document.getElementById('itemAccessCount');
    if (el) el.textContent = n === 0 ? '선택 0 (전체 노출)' : ('선택 ' + n + '개 그룹만 노출');
  }

  window.saveItemAccess = function(userId) {
    var groups = Array.prototype.map.call(document.querySelectorAll('.ia-grp:checked'), function(cb) { return cb.value; });
    var btn = document.getElementById('itemAccessSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    axios.put('/api/users/' + userId + '/item-access', { groups: groups }).then(function() {
      if (window.showToast) showToast('품목 배정 저장 완료 (' + (groups.length || '전체') + ')', 'success');
      var m = document.getElementById('itemAccessModal'); if (m) m.remove();
    }).catch(function(err) {
      if (window.showToast) showToast('저장 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    });
  };

  window.showCreateModal = function() {
    document.getElementById('modalTitle').textContent = '사용자 추가';
    document.getElementById('editUserId').value = '';
    document.getElementById('f_username').value = '';
    document.getElementById('f_name').value = '';
    document.getElementById('f_password').value = '';
    document.getElementById('f_role').value = 'OPERATOR';
    document.getElementById('f_email').value = '';
    document.getElementById('f_phone').value = '';
    if (window.fillEntitySelect) window.fillEntitySelect(document.getElementById('f_entity'), 1);
    if (document.getElementById('f_coordinator')) document.getElementById('f_coordinator').checked = false;
    document.getElementById('usernameField').style.display = '';
    document.getElementById('passwordField').style.display = '';
    document.getElementById('f_username').disabled = false;
    document.getElementById('submitBtn').textContent = '생성';
    document.getElementById('userModal').classList.remove('hidden');
  };

  window.showEditModal = function(u) {
    document.getElementById('modalTitle').textContent = '사용자 수정';
    document.getElementById('editUserId').value = u.id;
    document.getElementById('f_username').value = u.username || '';
    document.getElementById('f_name').value = u.name || '';
    document.getElementById('f_password').value = '';
    document.getElementById('f_role').value = u.role || 'OPERATOR';
    document.getElementById('f_email').value = u.email || '';
    document.getElementById('f_phone').value = u.phone || '';
    if (window.fillEntitySelect) window.fillEntitySelect(document.getElementById('f_entity'), u.default_entity_id || 1);
    if (document.getElementById('f_coordinator')) document.getElementById('f_coordinator').checked = !!u.is_coordinator;
    document.getElementById('usernameField').style.display = '';
    document.getElementById('passwordField').style.display = 'none';
    document.getElementById('f_username').disabled = true;
    document.getElementById('submitBtn').textContent = '저장';
    document.getElementById('userModal').classList.remove('hidden');
  };

  window.closeModal = function() {
    document.getElementById('userModal').classList.add('hidden');
  };

  window.submitUserForm = function(e) {
    e.preventDefault();
    var id = document.getElementById('editUserId').value;
    var isCreate = !id;

    var entityEl = document.getElementById('f_entity');
    var coordEl = document.getElementById('f_coordinator');
    var payload = {
      name: document.getElementById('f_name').value.trim(),
      role: document.getElementById('f_role').value,
      email: document.getElementById('f_email').value.trim() || null,
      phone: document.getElementById('f_phone').value.trim() || null,
      default_entity_id: entityEl ? parseInt(entityEl.value) || 1 : 1,
      is_coordinator: coordEl && coordEl.checked ? 1 : 0,
    };

    if (isCreate) {
      payload.username = document.getElementById('f_username').value.trim();
      payload.password = document.getElementById('f_password').value;
      if (!payload.username) { showToast('아이디를 입력하세요.', 'warning'); return; }
      if (!payload.password) { showToast('비밀번호를 입력하세요.', 'warning'); return; }
    }
    if (!payload.name) { showToast('이름을 입력하세요.', 'warning'); return; }

    var btn = document.getElementById('submitBtn');
    btn.disabled = true;

    var req = isCreate
      ? axios.post('/api/users', payload)
      : axios.patch('/api/users/' + id, payload);

    req.then(function() {
      showToast(isCreate ? '사용자가 생성되었습니다.' : '수정되었습니다.', 'success');
      closeModal();
      loadUsers();
    }).catch(function(err) {
      showToast('저장 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
    }).finally(function() {
      btn.disabled = false;
    });
  };

  window.showResetModal = function(id, name) {
    resetTargetId = id;
    document.getElementById('resetTargetName').textContent = name;
    document.getElementById('newPassword').value = '';
    document.getElementById('resetPwModal').classList.remove('hidden');
  };

  window.closeResetModal = function() {
    document.getElementById('resetPwModal').classList.add('hidden');
    resetTargetId = null;
  };

  window.submitResetPassword = function() {
    var pw = document.getElementById('newPassword').value;
    if (!pw) { showToast('새 비밀번호를 입력하세요.', 'warning'); return; }
    if (!resetTargetId) return;

    axios.post('/api/users/' + resetTargetId + '/reset-password', { password: pw })
      .then(function() {
        showToast('비밀번호가 초기화되었습니다.', 'success');
        closeResetModal();
      })
      .catch(function(err) {
        showToast('초기화 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
      });
  };

  window.toggleActive = async function(id, activate) {
    var msg = activate ? '이 사용자를 활성화하시겠습니까?' : '이 사용자를 비활성화하시겠습니까?';
    if (!(await showConfirm(msg))) return;
    axios.patch('/api/users/' + id, { is_active: activate })
      .then(function() {
        showToast(activate ? '활성화되었습니다.' : '비활성화되었습니다.', 'success');
        loadUsers();
      })
      .catch(function(err) {
        showToast('변경 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
      });
  };

  // Close modal on overlay click
  document.getElementById('userModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.getElementById('resetPwModal').addEventListener('click', function(e) {
    if (e.target === this) closeResetModal();
  });

  // Initial load
  loadUsers();

})();
