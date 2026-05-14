// 근로계약 관리 스크립트

var lcEditId = 0;
var lcSignContractId = 0;
var lcEmployees = [];
var lcDrawing = false;
var lcLastX = 0;
var lcLastY = 0;

// ===== 유틸 =====
function lcStatusBadge(status) {
  var map = {
    DRAFT: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600"><i class="fas fa-pen text-[7px] mr-1"></i>작성중</span>',
    PENDING_SIGNATURE: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700"><i class="fas fa-clock text-[7px] mr-1"></i>서명 대기</span>',
    SIGNED: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>서명 완료</span>',
    EXPIRED: '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700"><i class="fas fa-times-circle text-[7px] mr-1"></i>만료</span>',
  };
  return map[status] || '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">' + status + '</span>';
}

function lcContractTypeName(type) {
  var map = { HOURLY: '시급제', MONTHLY: '월급제', DAILY: '일급제' };
  return map[type] || type || '-';
}

function lcFmtDate(d) {
  if (!d) return '-';
  return d.substring(0, 10);
}

function lcFmtMoney(n) {
  if (n == null) return '-';
  return parseInt(n).toLocaleString() + '원';
}

// ===== 직원 목록 로드 =====
async function lcLoadEmployees() {
  try {
    var res = await axios.get('/api/hr/employees', { params: { limit: 200 } });
    var d = res.data && res.data.data;
    if (d && Array.isArray(d.employees)) lcEmployees = d.employees;
    else if (Array.isArray(d)) lcEmployees = d;
    else lcEmployees = [];

    var sel = document.getElementById('lcEmpSelect');
    if (!sel) return;
    var opts = '<option value="">- 직원 선택 -</option>';
    for (var i = 0; i < lcEmployees.length; i++) {
      var e = lcEmployees[i];
      if (e.status && e.status !== 'ACTIVE') continue;
      opts += '<option value="' + e.id + '">' + (e.employee_code || '') + ' ' + (e.name || '') + ' (' + (e.department || '-') + ')</option>';
    }
    sel.innerHTML = opts;
  } catch (e) {
    console.error('[laborContracts] 직원 로드 실패', e);
  }
}

// ===== 목록 조회 =====
window.lcLoad = async function() {
  var tbody = document.getElementById('lcBody');
  if (!tbody) { console.warn('[laborContracts] #lcBody not found'); return; }

  tbody.innerHTML = '<tr><td colspan="8" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="8" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>'
    + '<tr><td colspan="8" class="py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>';

  try {
    var params = { limit: 100 };
    var status = document.getElementById('lcStatusFilter').value;
    if (status) params.status = status;

    var res = await axios.get('/api/hr/contracts', { params: params });
    var d = res.data && res.data.data;
    var rows = (d && d.contracts) || [];

    // 검색 필터 (클라이언트 사이드)
    var search = (document.getElementById('lcSearch').value || '').trim().toLowerCase();
    if (search) {
      rows = rows.filter(function(r) {
        return (r.employee_name || '').toLowerCase().indexOf(search) >= 0
          || (r.employee_code || '').toLowerCase().indexOf(search) >= 0;
      });
    }

    // KPI 업데이트
    lcUpdateKPI(d);

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-6">계약서가 없습니다.</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var period = lcFmtDate(r.contract_start_date);
      if (r.contract_end_date) {
        period += ' ~ ' + lcFmtDate(r.contract_end_date);
      } else {
        period += ' ~ 무기한';
      }

      html += '<tr class="hover:bg-gray-50">'
        + '<td class="px-3 py-2 text-left font-medium">' + (r.employee_name || '-') + '<div class="text-[10px] text-gray-400">' + (r.employee_code || '') + '</div></td>'
        + '<td class="px-3 py-2 text-left text-xs">' + (r.entity_name || '-') + '</td>'
        + '<td class="px-3 py-2 text-left text-xs">' + lcContractTypeName(r.contract_type) + '</td>'
        + '<td class="px-3 py-2 text-left text-xs">' + period + '</td>'
        + '<td class="px-3 py-2 text-right text-xs">' + lcFmtMoney(r.hourly_rate) + '</td>'
        + '<td class="px-3 py-2 text-center">' + lcStatusBadge(r.status) + '</td>'
        + '<td class="px-3 py-2 text-center text-xs">' + lcFmtDate(r.signed_at) + '</td>'
        + '<td class="px-3 py-2 text-center">' + lcActionBtns(r) + '</td>'
        + '</tr>';
    }
    tbody.innerHTML = html;
  } catch (e) {
    console.error('[laborContracts] 목록 로드 실패', e);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-red-500 py-6">로드 실패</td></tr>';
  }
};

function lcActionBtns(r) {
  var btns = '';
  // 미리보기/인쇄
  btns += '<button onclick="lcPreview(' + r.id + ')" class="text-blue-600 hover:text-blue-800 text-xs mr-1" title="미리보기"><i class="fas fa-eye"></i></button>';
  // 수정 (DRAFT/PENDING_SIGNATURE만)
  if (r.status === 'DRAFT' || r.status === 'PENDING_SIGNATURE') {
    btns += '<button onclick="lcOpenEditModal(' + r.id + ')" class="text-gray-600 hover:text-gray-800 text-xs mr-1" title="수정"><i class="fas fa-edit"></i></button>';
  }
  // 서명 (DRAFT/PENDING_SIGNATURE만)
  if (r.status === 'DRAFT' || r.status === 'PENDING_SIGNATURE') {
    btns += '<button onclick="lcOpenSignModal(' + r.id + ')" class="text-green-600 hover:text-green-800 text-xs mr-1" title="서명"><i class="fas fa-signature"></i></button>';
  }
  // 삭제 (DRAFT만)
  if (r.status === 'DRAFT') {
    btns += '<button onclick="lcDelete(' + r.id + ')" class="text-red-600 hover:text-red-800 text-xs" title="삭제"><i class="fas fa-trash"></i></button>';
  }
  return btns;
}

function lcUpdateKPI(data) {
  var contracts = (data && data.contracts) || [];
  var total = (data && data.pagination) ? data.pagination.total : contracts.length;
  var pending = 0;
  for (var i = 0; i < contracts.length; i++) {
    if (contracts[i].status === 'DRAFT' || contracts[i].status === 'PENDING_SIGNATURE') pending++;
  }

  var el = document.getElementById('lcKpiTotal');
  if (el) el.textContent = total;
  el = document.getElementById('lcKpiPending');
  if (el) el.textContent = pending;

  // 만료 임박 비동기 로드
  lcLoadExpiring();
}

async function lcLoadExpiring() {
  try {
    var res = await axios.get('/api/hr/contracts/expiring');
    var d = res.data && res.data.data;
    var count = Array.isArray(d) ? d.length : 0;
    var el = document.getElementById('lcKpiExpiring');
    if (el) el.textContent = count;
  } catch (e) {
    console.error('[laborContracts] 만료 임박 로드 실패', e);
  }
}

// ===== 생성/수정 모달 =====
window.lcOpenEditModal = async function(id) {
  lcEditId = id || 0;
  var titleEl = document.getElementById('lcEditTitle');
  if (titleEl) titleEl.textContent = id ? '계약서 수정' : '계약서 작성';

  // 폼 초기화
  document.getElementById('lcEmpSelect').value = '';
  document.getElementById('lcContractType').value = 'HOURLY';
  document.getElementById('lcWorkType').value = 'REGULAR';
  document.getElementById('lcContractDate').value = new Date().toISOString().substring(0, 10);
  document.getElementById('lcStartDate').value = '';
  document.getElementById('lcEndDate').value = '';
  document.getElementById('lcWageStart').value = '';
  document.getElementById('lcWageEnd').value = '';
  document.getElementById('lcHourlyRate').value = '';
  document.getElementById('lcProbation').value = '3';
  document.getElementById('lcJobDesc').value = '';

  if (id) {
    try {
      var res = await axios.get('/api/hr/contracts/' + id);
      var c = res.data && res.data.data;
      if (c) {
        document.getElementById('lcEmpSelect').value = c.employee_id || '';
        document.getElementById('lcContractType').value = c.contract_type || 'HOURLY';
        document.getElementById('lcWorkType').value = c.work_type || 'REGULAR';
        document.getElementById('lcContractDate').value = (c.contract_date || '').substring(0, 10);
        document.getElementById('lcStartDate').value = (c.contract_start_date || '').substring(0, 10);
        document.getElementById('lcEndDate').value = (c.contract_end_date || '').substring(0, 10);
        document.getElementById('lcWageStart').value = (c.wage_start_date || '').substring(0, 10);
        document.getElementById('lcWageEnd').value = (c.wage_end_date || '').substring(0, 10);
        document.getElementById('lcHourlyRate').value = c.hourly_rate || '';
        document.getElementById('lcProbation').value = c.probation_months != null ? c.probation_months : 3;
        document.getElementById('lcJobDesc').value = c.job_description || '';
      }
    } catch (e) {
      console.error('[laborContracts] 계약서 로드 실패', e);
    }
  }

  document.getElementById('lcEditModal').classList.remove('hidden');
};

window.lcCloseEditModal = function() {
  document.getElementById('lcEditModal').classList.add('hidden');
};

window.lcSave = async function() {
  var empId = document.getElementById('lcEmpSelect').value;
  var contractDate = document.getElementById('lcContractDate').value;
  var startDate = document.getElementById('lcStartDate').value;

  if (!empId || !contractDate || !startDate) {
    alert('직원, 계약일, 계약 시작일은 필수입니다.');
    return;
  }

  var payload = {
    employee_id: parseInt(empId),
    contract_type: document.getElementById('lcContractType').value,
    work_type: document.getElementById('lcWorkType').value,
    contract_date: contractDate,
    contract_start_date: startDate,
    contract_end_date: document.getElementById('lcEndDate').value || null,
    wage_start_date: document.getElementById('lcWageStart').value || null,
    wage_end_date: document.getElementById('lcWageEnd').value || null,
    hourly_rate: parseInt(document.getElementById('lcHourlyRate').value) || 0,
    probation_months: parseInt(document.getElementById('lcProbation').value) || 3,
    job_description: document.getElementById('lcJobDesc').value || null,
  };

  try {
    if (lcEditId) {
      await axios.put('/api/hr/contracts/' + lcEditId, payload);
    } else {
      await axios.post('/api/hr/contracts', payload);
    }
    lcCloseEditModal();
    lcLoad();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) || '저장 실패';
    alert(msg);
  }
};

// ===== 삭제 =====
window.lcDelete = async function(id) {
  if (!confirm('이 계약서를 삭제하시겠습니까? (DRAFT만 가능)')) return;
  try {
    await axios.delete('/api/hr/contracts/' + id);
    lcLoad();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) || '삭제 실패';
    alert(msg);
  }
};

// ===== 미리보기 (새 창) =====
window.lcPreview = function(id) {
  window.open('/api/hr/contracts/' + id + '/preview', '_blank', 'width=900,height=800');
};

// ===== 서명 캔버스 =====
window.lcOpenSignModal = function(contractId) {
  lcSignContractId = contractId;
  document.getElementById('lcSignModal').classList.remove('hidden');
  // 캔버스 초기화
  setTimeout(function() { lcInitCanvas(); }, 100);
};

window.lcCloseSignModal = function() {
  document.getElementById('lcSignModal').classList.add('hidden');
  lcSignContractId = 0;
};

function lcInitCanvas() {
  var canvas = document.getElementById('signatureCanvas');
  if (!canvas) { console.warn('[laborContracts] #signatureCanvas not found'); return; }
  var ctx = canvas.getContext('2d');

  // 해상도 대응
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx.scale(2, 2);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111';

  lcDrawing = false;

  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    lcDrawing = true;
    var pos = getPos(e);
    lcLastX = pos.x;
    lcLastY = pos.y;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!lcDrawing) return;
    e.preventDefault();
    var pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lcLastX = pos.x;
    lcLastY = pos.y;
  }

  function stopDraw(e) {
    if (e) e.preventDefault();
    lcDrawing = false;
    ctx.beginPath();
  }

  // 기존 이벤트 제거 후 재등록 (중복 방지)
  canvas.onmousedown = startDraw;
  canvas.onmousemove = draw;
  canvas.onmouseup = stopDraw;
  canvas.onmouseleave = stopDraw;

  canvas.ontouchstart = startDraw;
  canvas.ontouchmove = draw;
  canvas.ontouchend = stopDraw;
}

window.lcClearSignature = function() {
  var canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
};

function lcGetSignatureBase64() {
  var canvas = document.getElementById('signatureCanvas');
  if (!canvas) return null;
  // 빈 캔버스 확인
  var ctx = canvas.getContext('2d');
  var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  var blank = true;
  for (var i = 3; i < data.length; i += 4) {
    if (data[i] > 0) { blank = false; break; }
  }
  if (blank) return null;
  return canvas.toDataURL('image/png');
}

window.lcSubmitSignature = async function() {
  if (!lcSignContractId) return;

  var sigData = lcGetSignatureBase64();
  if (!sigData) {
    alert('서명을 해 주세요.');
    return;
  }

  try {
    await axios.patch('/api/hr/contracts/' + lcSignContractId + '/sign', {
      signature_employee_base64: sigData,
    });
    lcCloseSignModal();
    lcLoad();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) || '서명 실패';
    alert(msg);
  }
};

// ===== 초기화 =====
(function() {
  lcLoadEmployees();
  lcLoad();
})();
