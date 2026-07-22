// 직원 간이 인증 스크립트
(function() {
  var selfToken = null;
  var employeeInfo = null;
  var selfContracts = [];   // 계약서 목록 캐시 (서명 화면에서 상세 조회)

  var loginSection = document.getElementById('loginSection');
  var menuSection = document.getElementById('menuSection');
  var contractsSection = document.getElementById('contractsSection');
  var payslipsSection = document.getElementById('payslipsSection');
  var signSection = document.getElementById('signSection');
  var errorMsg = document.getElementById('errorMsg');

  // 독립 페이지(전역 escapeHtml 없음) — innerHTML 삽입 free-text XSS 방지
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function(ch) {
      return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;';
    });
  }

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
    if (payslipsSection) payslipsSection.classList.remove('active');
    if (signSection) signSection.classList.remove('active');

    document.getElementById('userName').textContent = employeeInfo.name + '님';
    document.getElementById('userDetail').textContent =
      employeeInfo.employee_code + ' / ' + ((window.DEPT_NAMES && window.DEPT_NAMES[employeeInfo.department]) || employeeInfo.department || '-') + ' / ' + ((window.POSITION_NAMES && window.POSITION_NAMES[employeeInfo.position]) || employeeInfo.position || '-');
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
          selfContracts = contracts;
          if (contracts.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">등록된 계약서가 없습니다.</div>';
          } else {
            var typeLabels = { 'HOURLY': '시급직', 'MONTHLY': '월급직', 'DAILY': '일급직', 'CONTRACT': '도급' };
            var statusLabels = { 'SIGNED': '서명완료', 'DRAFT': '작성중', 'PENDING_SIGNATURE': '서명 대기' };
            var statusClasses = { 'SIGNED': 'status-signed', 'PENDING_SIGNATURE': 'status-pending-sign', 'DRAFT': 'status-draft' };
            list.innerHTML = contracts.map(function(c) {
              var typeLabel = typeLabels[c.contract_type] || c.contract_type || '-';
              var statusLabel = statusLabels[c.status] || c.status || '-';
              var statusClass = statusClasses[c.status] || 'status-draft';
              var period = (c.contract_start_date || '') + ' ~ ' + (c.contract_end_date || '기간 없음');
              var signable = (c.status === 'DRAFT' || c.status === 'PENDING_SIGNATURE');
              var signBtn = signable
                ? '<div><button class="sign-btn" onclick="selfOpenSign(' + c.id + ')"><i class="fas fa-signature mr-1"></i>서명하기</button></div>'
                : '';
              return '<div class="contract-item">'
                + '<div class="type">' + typeLabel + (c.entity_name ? ' (' + esc(c.entity_name) + ')' : '') + '</div>'
                + '<div class="dates">계약일: ' + (c.contract_date || '-') + ' | 기간: ' + period + '</div>'
                + '<span class="status ' + statusClass + '">' + statusLabel + '</span>'
                + signBtn
                + '</div>';
            }).join('');
          }
        }
      } catch (err) {
        var msg = (err.response && err.response.data && err.response.data.error) || '목록 조회 실패';
        list.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px;">' + esc(msg) + '</div>';
        if (err.response && err.response.status === 401) {
          selfToken = null; employeeInfo = null;
          setTimeout(function() {
            loginSection.style.display = 'block';
            menuSection.classList.remove('active');
            contractsSection.classList.remove('active');
            payslipsSection.classList.remove('active');
            showError(msg);
          }, 1200);
        }
      }
    });
  }

  // ===== 급여명세서 =====
  // Authorization 헤더로 HTML을 받아 새 창에 렌더 (인쇄/PDF) — certificate 플로우와 동일
  function openAuthedHtml(url, failTitle) {
    var win = window.open('about:blank', '_blank');
    fetch(url, { headers: { 'Authorization': 'Bearer ' + selfToken } })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        if (!win) return;
        win.document.open(); win.document.write(html); win.document.close();
      })
      .catch(function(err) {
        if (!win) return;
        win.document.open();
        win.document.write('<h2>' + (failTitle || '로드 실패') + '</h2><p>' + (err.message || '오류 발생') + '</p>');
        win.document.close();
      });
  }

  function prFmtWon(n) {
    var v = parseInt(n, 10);
    return (isFinite(v) ? v : 0).toLocaleString('ko-KR');
  }

  var btnPayslips = document.getElementById('btnPayslips');
  if (btnPayslips) {
    btnPayslips.addEventListener('click', async function() {
      if (!selfToken) return;
      menuSection.classList.remove('active');
      payslipsSection.classList.add('active');
      var list = document.getElementById('payslipsList');
      list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">로딩 중...</div>';
      try {
        var res = await axios.get('/api/hr/self/payslips', {
          headers: { 'Authorization': 'Bearer ' + selfToken }
        });
        if (res.data.success) {
          var slips = res.data.data || [];
          if (slips.length === 0) {
            list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;">교부된 급여명세서가 없습니다.</div>';
          } else {
            list.innerHTML = slips.map(function(s) {
              return '<div class="payslip-item" onclick="selfOpenPayslip(' + s.id + ')">'
                + '<span class="pi-period">' + (s.pay_period || '-') + '월분</span>'
                + '<span class="pi-net">₩ ' + prFmtWon(s.net_pay) + '</span>'
                + '</div>';
            }).join('');
          }
        }
      } catch (err) {
        var msg = (err.response && err.response.data && err.response.data.error) || '목록 조회 실패';
        list.innerHTML = '<div style="text-align:center;color:#dc2626;padding:20px;">' + esc(msg) + '</div>';
        if (err.response && err.response.status === 401) {
          selfToken = null; employeeInfo = null;
          setTimeout(function() {
            loginSection.style.display = 'block';
            menuSection.classList.remove('active');
            contractsSection.classList.remove('active');
            payslipsSection.classList.remove('active');
            showError(msg);
          }, 1200);
        }
      }
    });
  }

  // 명세서 열람 (새 창) — onclick 인자는 숫자 id (문자열 주입 없음)
  window.selfOpenPayslip = function(id) {
    if (!selfToken || !id) return;
    openAuthedHtml('/api/hr/self/payslips/' + id, '급여명세서 로드 실패');
  };

  var btnPayslipsBack = document.getElementById('btnPayslipsBack');
  if (btnPayslipsBack) {
    btnPayslipsBack.addEventListener('click', function() {
      payslipsSection.classList.remove('active');
      menuSection.classList.add('active');
    });
  }

  // ===== 근로계약서 본인서명 =====
  var selfSignContractId = 0;
  var selfSignDrawing = false;

  window.selfOpenSign = function(id) {
    var contract = null;
    for (var i = 0; i < selfContracts.length; i++) { if (selfContracts[i].id === id) { contract = selfContracts[i]; break; } }
    if (!contract) return;
    selfSignContractId = id;
    contractsSection.classList.remove('active');
    signSection.classList.add('active');
    var typeLabels = { 'HOURLY': '시급직', 'MONTHLY': '월급직', 'DAILY': '일급직', 'CONTRACT': '도급' };
    var info = document.getElementById('signContractInfo');
    if (info) {
      info.textContent = (typeLabels[contract.contract_type] || contract.contract_type || '계약서')
        + (contract.entity_name ? ' · ' + contract.entity_name : '')
        + ' · 계약일 ' + (contract.contract_date || '-');
    }
    var se = document.getElementById('signError'); if (se) se.style.display = 'none';
    setTimeout(selfInitSignCanvas, 120);
  };

  // 서명 캔버스 초기화 (laborContracts.js 컴포넌트 포팅 — 마우스+터치)
  function selfInitSignCanvas() {
    var canvas = document.getElementById('selfSignCanvas');
    if (!canvas) { console.warn('[employeeSelf] #selfSignCanvas not found'); return; }
    var ctx = canvas.getContext('2d');
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    selfSignDrawing = false;
    function getPos(e) {
      var r = canvas.getBoundingClientRect(); var cx, cy;
      if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
      else { cx = e.clientX; cy = e.clientY; }
      return { x: cx - r.left, y: cy - r.top };
    }
    function startDraw(e) { e.preventDefault(); selfSignDrawing = true; var p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function draw(e) { if (!selfSignDrawing) return; e.preventDefault(); var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function stopDraw(e) { if (e) e.preventDefault(); selfSignDrawing = false; ctx.beginPath(); }
    canvas.onmousedown = startDraw; canvas.onmousemove = draw; canvas.onmouseup = stopDraw; canvas.onmouseleave = stopDraw;
    canvas.ontouchstart = startDraw; canvas.ontouchmove = draw; canvas.ontouchend = stopDraw;
  }

  function selfGetSignatureBase64() {
    var canvas = document.getElementById('selfSignCanvas');
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var blank = true;
    for (var i = 3; i < data.length; i += 4) { if (data[i] > 0) { blank = false; break; } }
    if (blank) return null;
    return canvas.toDataURL('image/png');
  }

  var btnViewContract = document.getElementById('btnViewContract');
  if (btnViewContract) {
    btnViewContract.addEventListener('click', function() {
      if (!selfSignContractId) return;
      openAuthedHtml('/api/hr/self/contracts/' + selfSignContractId + '/preview', '계약서 로드 실패');
    });
  }

  var btnSignClear = document.getElementById('btnSignClear');
  if (btnSignClear) {
    btnSignClear.addEventListener('click', function() {
      var canvas = document.getElementById('selfSignCanvas');
      if (!canvas) return;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  var btnSignSubmit = document.getElementById('btnSignSubmit');
  if (btnSignSubmit) {
    btnSignSubmit.addEventListener('click', async function() {
      if (!selfSignContractId) return;
      var se = document.getElementById('signError');
      var sig = selfGetSignatureBase64();
      if (!sig) { if (se) { se.textContent = '서명을 해 주세요.'; se.style.display = 'block'; } return; }
      btnSignSubmit.disabled = true;
      try {
        await axios.patch('/api/hr/self/contracts/' + selfSignContractId + '/sign',
          { signature_employee_base64: sig },
          { headers: { 'Authorization': 'Bearer ' + selfToken } });
        signSection.classList.remove('active');
        var btnContracts2 = document.getElementById('btnContracts');
        if (btnContracts2) btnContracts2.click();   // 목록 갱신 (서명완료 반영)
      } catch (err) {
        var msg = (err.response && err.response.data && err.response.data.error) || '서명 실패';
        if (se) { se.textContent = msg; se.style.display = 'block'; }
      } finally {
        btnSignSubmit.disabled = false;
      }
    });
  }

  var btnSignBack = document.getElementById('btnSignBack');
  if (btnSignBack) {
    btnSignBack.addEventListener('click', function() {
      signSection.classList.remove('active');
      contractsSection.classList.add('active');
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

  // 로그아웃 (메뉴/계약서/급여명세서 화면 공통)
  function selfLogout() {
    selfToken = null;
    employeeInfo = null;
    loginSection.style.display = 'block';
    menuSection.classList.remove('active');
    contractsSection.classList.remove('active');
    if (payslipsSection) payslipsSection.classList.remove('active');
    if (signSection) signSection.classList.remove('active');
    selfContracts = [];
    errorMsg.style.display = 'none';
    var ecEl = document.getElementById('employeeCode'); if (ecEl) ecEl.value = '';
    var bdEl = document.getElementById('birthDate'); if (bdEl) bdEl.value = '';
  }

  var btnLogout = document.getElementById('btnLogout');
  if (btnLogout) { btnLogout.addEventListener('click', selfLogout); }
  var btnContractsLogout = document.getElementById('btnContractsLogout');
  if (btnContractsLogout) { btnContractsLogout.addEventListener('click', selfLogout); }
  var btnPayslipsLogout = document.getElementById('btnPayslipsLogout');
  if (btnPayslipsLogout) { btnPayslipsLogout.addEventListener('click', selfLogout); }
})();
