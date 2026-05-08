(function() {

  var resetTargetId = null;

  function getRoleBadge(role) {
    var labels = { ADMIN: '관리자', MANAGER: '매니저', DESIGNER: '디자이너', OPERATOR: '현장' };
    var label = labels[role] || role;
    return '<span class="role-badge role-' + role + '">' + label + '</span>';
  }

  function formatDate(str) {
    if (!str) return '-';
    try {
      return new Date(str).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch(e) { return str; }
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
        '<td class="px-4 py-3 font-medium text-gray-900">' + (u.name || '-') + '</td>' +
        '<td class="px-4 py-3 text-gray-600 font-mono text-sm">' + (u.username || '-') + '</td>' +
        '<td class="px-4 py-3">' + getRoleBadge(u.role) + '</td>' +
        '<td class="px-4 py-3">' + statusBadge + '</td>' +
        '<td class="px-4 py-3 text-gray-500 text-sm">' + formatDate(u.last_login_at) + '</td>' +
        '<td class="px-4 py-3">' +
          '<div class="flex gap-3 items-center">' +
            '<button data-user-json="' + JSON.stringify(u).replace(/"/g, '&quot;') + '" onclick="showEditModal(JSON.parse(this.getAttribute(\'data-user-json\')))" class="text-blue-600 hover:text-blue-700 text-sm font-medium">수정</button>' +
            '<button onclick="showResetModal(' + u.id + ', \'' + (u.name || u.username) + '\')" class="text-orange-500 hover:text-orange-700 text-sm font-medium">비번 초기화</button>' +
            '<button onclick="toggleActive(' + u.id + ', ' + (u.is_active ? 'false' : 'true') + ')" class="' + toggleClass + ' text-sm font-medium">' + toggleLabel + '</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('usersTableWrap').innerHTML =
      '<table class="w-full text-left">' +
        '<thead class="bg-gray-50 border-b">' +
          '<tr>' +
            '<th class="px-4 py-3 text-sm font-medium text-gray-500">이름</th>' +
            '<th class="px-4 py-3 text-sm font-medium text-gray-500">아이디</th>' +
            '<th class="px-4 py-3 text-sm font-medium text-gray-500">역할</th>' +
            '<th class="px-4 py-3 text-sm font-medium text-gray-500">상태</th>' +
            '<th class="px-4 py-3 text-sm font-medium text-gray-500">마지막 로그인</th>' +
            '<th class="px-4 py-3 text-sm font-medium text-gray-500">액션</th>' +
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
          '<div class="text-center py-12 text-red-400"><i class="fas fa-exclamation-circle text-3xl mb-3"></i><p>불러오기 실패: ' + (err.response && err.response.data && err.response.data.error || err.message) + '</p></div>';
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
    if (document.getElementById('f_entity')) document.getElementById('f_entity').value = '1';
    document.getElementById('usernameField').style.display = '';
    document.getElementById('passwordField').style.display = '';
    document.getElementById('f_username').disabled = false;
    document.getElementById('submitBtn').textContent = '생성';
    document.getElementById('userModal').style.display = 'flex';
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
    if (document.getElementById('f_entity')) document.getElementById('f_entity').value = String(u.default_entity_id || 1);
    document.getElementById('usernameField').style.display = '';
    document.getElementById('passwordField').style.display = 'none';
    document.getElementById('f_username').disabled = true;
    document.getElementById('submitBtn').textContent = '저장';
    document.getElementById('userModal').style.display = 'flex';
  };

  window.closeModal = function() {
    document.getElementById('userModal').style.display = 'none';
  };

  window.submitUserForm = function(e) {
    e.preventDefault();
    var id = document.getElementById('editUserId').value;
    var isCreate = !id;

    var entityEl = document.getElementById('f_entity');
    var payload = {
      name: document.getElementById('f_name').value.trim(),
      role: document.getElementById('f_role').value,
      email: document.getElementById('f_email').value.trim() || null,
      phone: document.getElementById('f_phone').value.trim() || null,
      default_entity_id: entityEl ? parseInt(entityEl.value) || 1 : 1,
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
    document.getElementById('resetPwModal').style.display = 'flex';
  };

  window.closeResetModal = function() {
    document.getElementById('resetPwModal').style.display = 'none';
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
