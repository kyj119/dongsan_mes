// 직원 간이 인증 스크립트
(function() {
  var selfToken = null;
  var employeeInfo = null;

  var loginSection = document.getElementById('loginSection');
  var menuSection = document.getElementById('menuSection');
  var contractsSection = document.getElementById('contractsSection');
  var errorMsg = document.getElementById('errorMsg');

  // 로그인 폼 제출
  var form = document.getElementById('selfAuthForm');
  if (!form) { console.warn('[employeeSelf] #selfAuthForm not found'); return; }

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    errorMsg.style.display = 'none';
    var btnLogin = document.getElementById('btnLogin');
    btnLogin.disabled = true;
    btnLogin.textContent = '확인 중...';

    var employeeCode = document.getElementById('employeeCode').value.trim();
    var birthDate = document.getElementById('birthDate').value.trim();

    try {
      var res = await axios.post('/api/hr/self-auth', {
        employee_code: employeeCode,
        birth_date: birthDate,
      });

      if (res.data.success) {
        selfToken = res.data.data.token;
        employeeInfo = res.data.data.employee;
        showMenu();
      } else {
        showError(res.data.error || '인증 실패');
      }
    } catch (err) {
      var msg = '인증에 실패했습니다.';
      if (err.response && err.response.data && err.response.data.error) {
        msg = err.response.data.error;
      }
      showError(msg);
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = '본인 확인';
    }
  });

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }

  function showMenu() {
    loginSection.style.display = 'none';
    menuSection.classList.add('active');
    contractsSection.classList.remove('active');

    document.getElementById('userName').textContent = employeeInfo.name + '님';
    document.getElementById('userDetail').textContent =
      employeeInfo.employee_code + ' / ' + (employeeInfo.department || '-') + ' / ' + (employeeInfo.position || '-');
  }

  // 재직증명서 출력
  var btnCert = document.getElementById('btnCertificate');
  if (btnCert) {
    btnCert.addEventListener('click', function() {
      if (!selfToken) return;
      // 새 창에서 재직증명서 HTML 열기
      var url = '/api/hr/self/certificates/employment?purpose=' + encodeURIComponent('제출용');
      var win = window.open('about:blank', '_blank');
      if (win) {
        // Authorization 헤더 전송을 위해 fetch 사용
        fetch(url, {
          headers: { 'Authorization': 'Bearer ' + selfToken }
        })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          win.document.open();
          win.document.write(html);
          win.document.close();
        })
        .catch(function(err) {
          win.document.open();
          win.document.write('<h2>재직증명서 발급 실패</h2><p>' + (err.message || '오류 발생') + '</p>');
          win.document.close();
        });
      }
    });
  }

  // 계약서 목록
  var btnContracts = document.getElementById('btnContracts');
  if (btnContracts) {
    btnContracts.addEventListener('click', async function() {
      if (!selfToken) return;
      menuSection.classList.remove('active');
      contractsSection.classList.add('active');

      var list = document.getElementById('contractsList');
      list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">로딩 중...</div>';

      try {
        var res = await axios.get('/api/hr/self/contracts', {
          headers: { 'Authorization': 'Bearer ' + selfToken }
        });

        if (res.data.success) {
          var contracts = res.data.data || [];
          if (contracts.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">등록된 계약서가 없습니다.</div>';
          } else {
            var typeLabels = { 'HOURLY': '시급직', 'MONTHLY': '월급직', 'DAILY': '일급직', 'CONTRACT': '도급' };
            var statusLabels = { 'SIGNED': '서명완료', 'DRAFT': '작성중' };
            list.innerHTML = contracts.map(function(c) {
              var typeLabel = typeLabels[c.contract_type] || c.contract_type || '-';
              var statusLabel = statusLabels[c.status] || c.status || '-';
              var statusClass = c.status === 'SIGNED' ? 'status-signed' : 'status-draft';
              var period = (c.contract_start_date || '') + ' ~ ' + (c.contract_end_date || '기간 없음');
              return '<div class="contract-item">'
                + '<div class="type">' + typeLabel + (c.entity_name ? ' (' + c.entity_name + ')' : '') + '</div>'
                + '<div class="dates">계약일: ' + (c.contract_date || '-') + ' | 기간: ' + period + '</div>'
                + '<span class="status ' + statusClass + '">' + statusLabel + '</span>'
                + '</div>';
            }).join('');
          }
        }
      } catch (err) {
        list.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px;">목록 조회 실패</div>';
      }
    });
  }

  // 돌아가기
  var btnBack = document.getElementById('btnBack');
  if (btnBack) {
    btnBack.addEventListener('click', function() {
      contractsSection.classList.remove('active');
      menuSection.classList.add('active');
    });
  }

  // 로그아웃
  var btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function() {
      selfToken = null;
      employeeInfo = null;
      loginSection.style.display = 'block';
      menuSection.classList.remove('active');
      contractsSection.classList.remove('active');
      errorMsg.style.display = 'none';
      document.getElementById('employeeCode').value = '';
      document.getElementById('birthDate').value = '';
    });
  }
})();
