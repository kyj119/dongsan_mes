// 급여 요율/간이세액표 관리 스크립트
// IIFE는 파일 맨 아래

// Skeleton loading
(function() {
  var el = document.getElementById('prRRatesBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 7);
})();

var prRTaxOffset = 0;
var prRTaxLimit = 100;
var prRTaxTotal = 0;
var prREditRateId = 0; // 0 = 신규


var prRInsuranceLabels = {
  NATIONAL_PENSION: '국민연금',
  HEALTH: '건강보험',
  LONG_TERM_CARE: '장기요양',
  EMPLOYMENT: '고용보험',
  INDUSTRIAL_ACCIDENT: '산재보험',
};

window.prRSwitchTab = function(n) {
  document.getElementById('prRPane1').classList.toggle('hidden', n !== 1);
  document.getElementById('prRPane2').classList.toggle('hidden', n !== 2);
  document.getElementById('prRTab1').classList.toggle('border-blue-600', n === 1);
  document.getElementById('prRTab1').classList.toggle('text-blue-600', n === 1);
  document.getElementById('prRTab1').classList.toggle('border-transparent', n !== 1);
  document.getElementById('prRTab1').classList.toggle('text-gray-500', n !== 1);
  document.getElementById('prRTab2').classList.toggle('border-blue-600', n === 2);
  document.getElementById('prRTab2').classList.toggle('text-blue-600', n === 2);
  document.getElementById('prRTab2').classList.toggle('border-transparent', n !== 2);
  document.getElementById('prRTab2').classList.toggle('text-gray-500', n !== 2);
};

window.prRLoadAll = function() {
  var year = document.getElementById('prRYear').value;
  document.getElementById('prRYearLabel').textContent = year;
  document.getElementById('prRYearLabel2').textContent = year;
  prRLoadRates();
  prRTaxOffset = 0;
  prRLoadTaxTable();
};

window.prRLoadRates = async function() {
  var year = document.getElementById('prRYear').value;
  var tbody = document.getElementById('prRRatesBody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-6">로드 중...</td></tr>';
  try {
    var res = await axios.get('/api/payroll/rates/' + year);
    var rows = res.data.data || [];
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-12"><div class="flex flex-col items-center"><i class="fas fa-inbox text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">' + year + '년 요율이 없습니다</p><p class="text-gray-400 text-xs mt-1">"요율 추가" 또는 "연도 복사"를 이용하세요</p></div></td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var minMax = '';
      if (r.min_base) minMax += fmtMoney(r.min_base);
      if (r.max_base) minMax += ' ~ ' + fmtMoney(r.max_base);
      if (!minMax) minMax = '-';
      html += '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
        '<td class="px-4 py-2 font-medium">' + (prRInsuranceLabels[r.insurance_type] || r.insurance_type) + '</td>' +
        '<td class="px-4 py-2 text-right">' + r.total_rate + '%</td>' +
        '<td class="px-4 py-2 text-right">' + r.employee_rate + '%</td>' +
        '<td class="px-4 py-2 text-right">' + r.employer_rate + '%</td>' +
        '<td class="px-4 py-2 text-xs text-gray-600">' + (r.base === 'HEALTH_INSURANCE' ? '건강보험료' : '과세급여') + '</td>' +
        '<td class="px-4 py-2 text-right text-xs text-gray-600">' + minMax + '</td>' +
        '<td class="px-4 py-2 text-center whitespace-nowrap">' +
          '<button onclick="prROpenRateModal(\'' + r.insurance_type + '\')" class="text-blue-600 hover:text-blue-800 mx-1" title="수정"><i class="fas fa-edit"></i></button>' +
          '<button onclick="prRDeleteRate(\'' + r.insurance_type + '\')" class="text-red-600 hover:text-red-800 mx-1" title="삭제"><i class="fas fa-trash"></i></button>' +
        '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-12"><div class="flex flex-col items-center"><i class="fas fa-exclamation-circle text-4xl text-red-300 mb-3"></i><p class="text-red-500 text-sm">로드 실패</p></div></td></tr>';
  }
};

window.prROpenRateModal = async function(type) {
  document.getElementById('prREditModal').classList.remove('hidden');
  document.getElementById('prREditModal').classList.add('flex');
  var year = parseInt(document.getElementById('prRYear').value);
  document.getElementById('prREditYear').value = year;
  document.getElementById('prREditType').value = type || 'NATIONAL_PENSION';
  document.getElementById('prREditType').disabled = !!type;

  if (type) {
    // 기존 요율 로드
    try {
      var res = await axios.get('/api/payroll/rates/' + year);
      var rows = res.data.data || [];
      var row = rows.find(function(r) { return r.insurance_type === type; });
      if (row) {
        document.getElementById('prREditTotal').value = row.total_rate;
        document.getElementById('prREditEmp').value = row.employee_rate;
        document.getElementById('prREditEmployer').value = row.employer_rate;
        document.getElementById('prREditBase').value = row.base || 'TAXABLE_PAY';
        document.getElementById('prREditMin').value = fmtMoneyInput(row.min_base);
        document.getElementById('prREditMax').value = fmtMoneyInput(row.max_base);
        document.getElementById('prREditFrom').value = row.effective_from || '';
        document.getElementById('prREditTo').value = row.effective_to || '';
        return;
      }
    } catch (e) { console.error(e); }
  }
  // 신규
  document.getElementById('prREditTotal').value = '';
  document.getElementById('prREditEmp').value = '';
  document.getElementById('prREditEmployer').value = '';
  document.getElementById('prREditBase').value = 'TAXABLE_PAY';
  document.getElementById('prREditMin').value = '';
  document.getElementById('prREditMax').value = '';
  document.getElementById('prREditFrom').value = year + '-01-01';
  document.getElementById('prREditTo').value = '';
};

window.prRCloseRateModal = function() {
  document.getElementById('prREditModal').classList.add('hidden');
  document.getElementById('prREditModal').classList.remove('flex');
};

window.prRUpdateBaseSelect = function() {
  var type = document.getElementById('prREditType').value;
  var base = document.getElementById('prREditBase');
  if (type === 'LONG_TERM_CARE') base.value = 'HEALTH_INSURANCE';
  else base.value = 'TAXABLE_PAY';
};

window.prRSaveRate = async function() {
  var payload = {
    year: parseInt(document.getElementById('prREditYear').value),
    insurance_type: document.getElementById('prREditType').value,
    total_rate: parseFloat(document.getElementById('prREditTotal').value || 0),
    employee_rate: parseFloat(document.getElementById('prREditEmp').value || 0),
    employer_rate: parseFloat(document.getElementById('prREditEmployer').value || 0),
    base: document.getElementById('prREditBase').value,
    min_base: (function() { var v = readMoney('prREditMin'); return v === 0 && document.getElementById('prREditMin').value === '' ? null : v; })(),
    max_base: (function() { var v = readMoney('prREditMax'); return v === 0 && document.getElementById('prREditMax').value === '' ? null : v; })(),
    effective_from: document.getElementById('prREditFrom').value,
    effective_to: document.getElementById('prREditTo').value || null,
  };
  try {
    await axios.put('/api/payroll/rates', payload);
    prRCloseRateModal();
    prRLoadRates();
  } catch (e) {
    showToast('저장 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

window.prRDeleteRate = async function(type) {
  if (!(await showConfirm((prRInsuranceLabels[type] || type) + ' 요율을 삭제하시겠습니까?', { danger: true }))) return;
  var year = document.getElementById('prRYear').value;
  try {
    await axios.delete('/api/payroll/rates/' + year + '/' + type);
    prRLoadRates();
  } catch (e) { showToast('삭제 실패', 'error'); }
};

// ========== 간이세액표 ==========
window.prRLoadTaxTable = async function() {
  var year = document.getElementById('prRYear').value;
  var tbody = document.getElementById('prRTaxBody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-6">로드 중...</td></tr>';
  try {
    var res = await axios.get('/api/payroll/tax-table/' + year, { params: { offset: prRTaxOffset, limit: prRTaxLimit } });
    var rows = res.data.data || [];
    prRTaxTotal = res.data.total || 0;
    document.getElementById('prRTaxTotal').textContent = prRTaxTotal;
    var pages = Math.max(1, Math.ceil(prRTaxTotal / prRTaxLimit));
    document.getElementById('prRTaxPage').textContent = Math.floor(prRTaxOffset / prRTaxLimit) + 1;
    document.getElementById('prRTaxPages').textContent = pages;
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-12"><div class="flex flex-col items-center"><i class="fas fa-receipt text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">' + year + '년 간이세액표 데이터가 없습니다</p></div></td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<tr class="border-b border-gray-100 hover:bg-gray-50">' +
        '<td class="px-3 py-1.5 text-right text-xs">' + fmtMoney(r.monthly_pay_min) + ' ~ ' + fmtMoney(r.monthly_pay_max) + '</td>' +
        '<td class="px-3 py-1.5 text-right">' + fmtMoney(r.dependents_1) + '</td>' +
        '<td class="px-3 py-1.5 text-right">' + fmtMoney(r.dependents_2) + '</td>' +
        '<td class="px-3 py-1.5 text-right">' + fmtMoney(r.dependents_3) + '</td>' +
        '<td class="px-3 py-1.5 text-right">' + fmtMoney(r.dependents_4) + '</td>' +
        '<td class="px-3 py-1.5 text-right">' + fmtMoney(r.dependents_5) + '</td>' +
        '<td class="px-3 py-1.5 text-right text-gray-500">' + fmtMoney(r.dependents_6) + '</td>' +
        '<td class="px-3 py-1.5 text-center whitespace-nowrap">' +
          '<button onclick="prROpenTaxRowModal(' + r.id + ')" class="text-blue-600 hover:text-blue-800 mx-1" title="수정"><i class="fas fa-edit"></i></button>' +
          '<button onclick="prRDeleteTaxRow(' + r.id + ')" class="text-red-600 hover:text-red-800 mx-1" title="삭제"><i class="fas fa-trash"></i></button>' +
        '</td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-12"><div class="flex flex-col items-center"><i class="fas fa-exclamation-circle text-4xl text-red-300 mb-3"></i><p class="text-red-500 text-sm">로드 실패</p></div></td></tr>';
  }
};

window.prRTaxPrevPage = function() {
  if (prRTaxOffset === 0) return;
  prRTaxOffset = Math.max(0, prRTaxOffset - prRTaxLimit);
  prRLoadTaxTable();
};
window.prRTaxNextPage = function() {
  if (prRTaxOffset + prRTaxLimit >= prRTaxTotal) return;
  prRTaxOffset += prRTaxLimit;
  prRLoadTaxTable();
};

window.prROpenTaxRowModal = async function(id) {
  // 모달 열기 + dependents 인풋 생성
  document.getElementById('prRTaxModal').classList.remove('hidden');
  document.getElementById('prRTaxModal').classList.add('flex');
  var grid = document.getElementById('prRTaxDepsGrid');
  var gridHtml = '';
  for (var i = 1; i <= 11; i++) {
    gridHtml += '<div>' +
      '<label class="text-xs text-gray-600">' + i + (i === 11 ? '명+' : '명') + '</label>' +
      '<input type="text" inputmode="numeric" data-money id="prRTaxDep' + i + '" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right" />' +
      '</div>';
  }
  grid.innerHTML = gridHtml;
  // 동적 생성된 data-money input에 콤마 자동 포맷 바인딩
  if (typeof window.bindMoneyInputs === 'function') window.bindMoneyInputs(grid);
  document.getElementById('prRTaxMin').value = '';
  document.getElementById('prRTaxMax').value = '';
  for (var j = 1; j <= 11; j++) document.getElementById('prRTaxDep' + j).value = '';
  document.getElementById('prRTaxModal').dataset.editId = id || 0;

  if (id) {
    // 기존 행 로드 — 임시로 전체에서 찾기 (상세 API 생략)
    var year = document.getElementById('prRYear').value;
    try {
      var res = await axios.get('/api/payroll/tax-table/' + year, { params: { offset: prRTaxOffset, limit: prRTaxLimit } });
      var rows = res.data.data || [];
      var row = rows.find(function(r) { return r.id === id; });
      if (row) {
        document.getElementById('prRTaxMin').value = fmtMoneyInput(row.monthly_pay_min);
        document.getElementById('prRTaxMax').value = fmtMoneyInput(row.monthly_pay_max);
        for (var k = 1; k <= 11; k++) {
          document.getElementById('prRTaxDep' + k).value = fmtMoneyInput(row['dependents_' + k] || 0);
        }
      }
    } catch (e) { console.error(e); }
  }
};

window.prRCloseTaxRowModal = function() {
  document.getElementById('prRTaxModal').classList.add('hidden');
  document.getElementById('prRTaxModal').classList.remove('flex');
};

window.prRSaveTaxRow = async function() {
  var year = parseInt(document.getElementById('prRYear').value);
  var payload = {
    year: year,
    monthly_pay_min: readMoney('prRTaxMin'),
    monthly_pay_max: readMoney('prRTaxMax'),
  };
  for (var i = 1; i <= 11; i++) {
    payload['dependents_' + i] = readMoney('prRTaxDep' + i);
  }
  if (!payload.monthly_pay_min || !payload.monthly_pay_max) {
    showToast('월급여 구간을 입력하세요', 'warning');
    return;
  }
  try {
    await axios.put('/api/payroll/tax-table', payload);
    prRCloseTaxRowModal();
    prRLoadTaxTable();
  } catch (e) {
    showToast('저장 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

window.prRDeleteTaxRow = async function(id) {
  if (!(await showConfirm('이 행을 삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/payroll/tax-table/' + id);
    prRLoadTaxTable();
  } catch (e) { showToast('삭제 실패', 'error'); }
};

// ========== CSV 임포트/템플릿 ==========
window.prRDownloadCsvTemplate = function() {
  var header = 'monthly_pay_min,monthly_pay_max,dependents_1,dependents_2,dependents_3,dependents_4,dependents_5,dependents_6,dependents_7,dependents_8,dependents_9,dependents_10,dependents_11';
  var sample = '2000000,2010000,22950,10350,2850,0,0,0,0,0,0,0,0';
  var blob = new Blob(['\uFEFF' + header + '\n' + sample + '\n'], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'income_tax_template.csv';
  a.click();
  URL.revokeObjectURL(url);
};

window.prRImportCsv = function(ev) {
  var file = ev.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = async function(e) {
    var text = e.target.result;
    // BOM 제거
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
    if (lines.length < 2) { showToast('CSV 데이터 부족', 'warning'); return; }
    var header = lines[0].split(',').map(function(s) { return s.trim(); });
    var requiredCols = ['monthly_pay_min','monthly_pay_max'];
    for (var i = 0; i < requiredCols.length; i++) {
      if (header.indexOf(requiredCols[i]) === -1) {
        showToast('CSV 헤더에 ' + requiredCols[i] + ' 누락', 'warning');
        return;
      }
    }
    var rows = [];
    for (var j = 1; j < lines.length; j++) {
      var cols = lines[j].split(',');
      var row = {};
      for (var k = 0; k < header.length; k++) {
        row[header[k]] = cols[k] ? cols[k].trim() : '';
      }
      rows.push(row);
    }
    var year = parseInt(document.getElementById('prRYear').value);
    if (!(await showConfirm(year + '년 간이세액표에 ' + rows.length + '행을 임포트합니다.\n기존 데이터를 모두 덮어쓸까요?\n(확인=덮어쓰기, 취소=추가만)', { danger: true }))) {
      // cancel = 추가만
      try {
        var res = await axios.post('/api/payroll/tax-table/import', { year: year, rows: rows, replace: false });
        showToast('임포트 완료: ' + res.data.data.inserted + '행', 'success');
        prRLoadTaxTable();
      } catch (e) { showToast('임포트 실패', 'error'); }
      ev.target.value = '';
      return;
    }
    try {
      var res = await axios.post('/api/payroll/tax-table/import', { year: year, rows: rows, replace: true });
      showToast('임포트 완료: ' + res.data.data.inserted + '행 (기존 삭제)', 'success');
      prRLoadTaxTable();
    } catch (e) { showToast('임포트 실패', 'error'); }
    ev.target.value = '';
  };
  reader.readAsText(file, 'UTF-8');
};

// ========== 전구간 자동생성 ==========
window.prRGenerateTable = async function() {
  var year = parseInt(document.getElementById('prRYear').value);
  if (!(await showConfirm(year + '년 간이세액표를 공식 계산식으로 전구간(100만~1000만, 1만원 단위 900행) 자동 생성합니다.\n\n※ 기존 ' + year + '년 데이터는 모두 삭제됩니다. 계속할까요?', { danger: true }))) return;
  var tbody = document.getElementById('prRTaxBody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin mr-2"></i>생성 중... (약 10~20초 소요)</td></tr>';
  try {
    var res = await axios.post('/api/payroll/tax-table/generate', { year: year, min: 1000000, max: 10000000, step: 10000 });
    showToast('생성 완료: ' + res.data.data.inserted + '행', 'success');
    prRTaxOffset = 0;
    prRLoadTaxTable();
  } catch (e) {
    showToast('생성 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
    prRLoadTaxTable();
  }
};

// ========== 연도 복사 ==========
window.prROpenCopyModal = function() {
  document.getElementById('prRCopyModal').classList.remove('hidden');
  document.getElementById('prRCopyModal').classList.add('flex');
};
window.prRCloseCopyModal = function() {
  document.getElementById('prRCopyModal').classList.add('hidden');
  document.getElementById('prRCopyModal').classList.remove('flex');
};
window.prRCopyRates = async function() {
  var from = parseInt(document.getElementById('prRCopyFrom').value);
  var to = parseInt(document.getElementById('prRCopyTo').value);
  if (!from || !to) { showToast('연도를 입력하세요', 'warning'); return; }
  try {
    await axios.post('/api/payroll/rates/copy', { from_year: from, to_year: to });
    showToast('복사 완료', 'success');
    prRCloseCopyModal();
    document.getElementById('prRYear').value = to;
    prRLoadAll();
  } catch (e) {
    showToast('복사 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

// IIFE 초기화
(function prRInit() {
  prRLoadAll();
})();
