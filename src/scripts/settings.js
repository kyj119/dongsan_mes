var SETTING_KEYS = [
  'company_name', 'company_business_registration_number',
  'company_representative', 'company_phone',
  'company_business_type', 'company_business_item',
  'company_address', 'company_fax', 'company_bank_info',
  'company_stamp_base64',
  'tax_provider', 'tax_provider_linked_id', 'tax_default_email',
  'email_from_name', 'email_from_address'
];
var CHECKBOX_KEYS = ['tax_test_mode', 'tax_auto_issue', 'email_enabled'];

// ── 회사 정보 키 ──
var COMPANY_KEYS = [
  'company_name', 'company_business_registration_number',
  'company_representative', 'company_phone',
  'company_business_type', 'company_business_item',
  'company_address', 'company_fax', 'company_bank_info',
  'company_stamp_base64'
];
// ── 세금계산서 키 ──
var TAX_KEYS = ['tax_provider', 'tax_provider_linked_id', 'tax_default_email'];
var TAX_CHECKBOX_KEYS = ['tax_test_mode', 'tax_auto_issue'];
// ── 이메일 키 ──
var EMAIL_KEYS = ['email_from_name', 'email_from_address'];
var EMAIL_CHECKBOX_KEYS = ['email_enabled'];

function handleStampUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  if (file.size > 500000) { showToast('이미지 크기는 500KB 이하로 해주세요.', 'warning'); return; }
  var reader = new FileReader();
  reader.onload = function(ev) {
    var base64 = ev.target.result;
    document.getElementById('stampPreview').src = base64;
    document.getElementById('s_company_stamp_base64').value = base64;
  };
  reader.readAsDataURL(file);
}

async function loadSettings() {
  try {
    // 1. 글로벌 설정 로드 (세금계산서, 이메일 등)
    var res = await axios.get('/api/settings');
    if (res.data.success) {
      var data = res.data.data;
      // 글로벌 설정만 적용 (회사 정보는 entity에서 로드)
      ['tax_provider', 'tax_provider_linked_id', 'tax_default_email',
       'email_from_name', 'email_from_address'].forEach(function(key) {
        var el = document.getElementById('s_' + key);
        if (el && data[key]) el.value = data[key];
      });
      CHECKBOX_KEYS.forEach(function(key) {
        var el = document.getElementById('s_' + key);
        if (el) el.checked = data[key] === '1';
      });
      var secretEl = document.getElementById('taxSecretStatus');
      if (secretEl) {
        if (data.tax_secret_key_configured === '1') {
          secretEl.textContent = '설정됨';
          secretEl.className = 'w-full px-3 py-2 border border-green-300 rounded-lg bg-green-50 text-sm text-green-700 font-medium';
        } else {
          secretEl.textContent = '미설정';
          secretEl.className = 'w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-50 text-sm text-amber-700 font-medium';
        }
      }
    }

    // 2. 현재 법인 정보 로드 (entities 테이블)
    var entityRes = await axios.get('/api/settings/entity');
    if (entityRes.data.success) {
      var e = entityRes.data.data;
      var entityLabel = document.getElementById('entityLabel');
      if (entityLabel) entityLabel.textContent = '(' + (e.short_name || e.name || '') + ')';
      var fieldMap = {
        company_name: e.name || '',
        company_business_registration_number: e.business_reg_no || '',
        company_representative: e.representative || '',
        company_phone: e.phone || '',
        company_business_type: e.business_type || '',
        company_business_item: e.business_item || '',
        company_address: e.address || '',
        company_fax: e.fax || '',
        company_bank_info: e.bank_info || '',
        // Phase 1.2: 멀티사업자 이메일
        company_email_from_address: e.email_from_address || '',
        company_email_from_name: e.email_from_name || '',
      };
      Object.keys(fieldMap).forEach(function(key) {
        var el = document.getElementById('s_' + key);
        if (el) el.value = fieldMap[key];
      });
      // 인감도장은 entities 테이블에서 로드
      if (e.stamp_base64) {
        document.getElementById('stampPreview').src = e.stamp_base64;
        document.getElementById('s_company_stamp_base64').value = e.stamp_base64;
      }
    }
  } catch (err) {
    if (err.response && err.response.status === 403) {
      showToast('관리자 권한이 필요합니다.', 'error');
      window.location.href = '/';
    }
  }
}

// ── 섹션별 저장 헬퍼 ──
async function saveSectionSettings(keys, checkboxKeys, btnId, msgId) {
  var settings = {};
  keys.forEach(function(key) {
    var el = document.getElementById('s_' + key);
    if (el) settings[key] = el.value;
  });
  (checkboxKeys || []).forEach(function(key) {
    var el = document.getElementById('s_' + key);
    if (el) settings[key] = el.checked ? '1' : '0';
  });

  var btn = document.getElementById(btnId);
  var msg = document.getElementById(msgId);
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    var res = await axios.patch('/api/settings', { settings: settings });
    if (res.data.success) {
      msg.className = 'mt-3 text-center text-sm text-green-600';
      msg.textContent = '저장되었습니다.';
      msg.classList.remove('hidden');
      setTimeout(function() { msg.classList.add('hidden'); }, 3000);
    }
  } catch (err) {
    msg.className = 'mt-3 text-center text-sm text-red-600';
    msg.textContent = '저장 실패: ' + (err.response?.data?.error || err.message);
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// 회사 정보 저장 → entities 테이블에 저장
function saveSettings() {
  var payload = {
    name: (document.getElementById('s_company_name') || {}).value || '',
    business_reg_no: (document.getElementById('s_company_business_registration_number') || {}).value || '',
    representative: (document.getElementById('s_company_representative') || {}).value || '',
    phone: (document.getElementById('s_company_phone') || {}).value || '',
    fax: (document.getElementById('s_company_fax') || {}).value || '',
    business_type: (document.getElementById('s_company_business_type') || {}).value || '',
    business_item: (document.getElementById('s_company_business_item') || {}).value || '',
    address: (document.getElementById('s_company_address') || {}).value || '',
    bank_info: (document.getElementById('s_company_bank_info') || {}).value || '',
    stamp_base64: (document.getElementById('s_company_stamp_base64') || {}).value || '',
    // Phase 1.2: 멀티사업자 이메일 발신 설정
    email_from_address: (document.getElementById('s_company_email_from_address') || {}).value || '',
    email_from_name: (document.getElementById('s_company_email_from_name') || {}).value || '',
  };
  // popbill_corp_num 자동 생성 (사업자번호에서 하이픈 제거)
  if (payload.business_reg_no) {
    payload.popbill_corp_num = payload.business_reg_no.replace(/-/g, '');
  }
  // short_name은 name과 동일하게
  payload.short_name = payload.name;

  var btn = document.getElementById('saveBtn');
  var msg = document.getElementById('saveMsg');
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '저장 중...';

  axios.patch('/api/settings/entity', payload)
    .then(function(res) {
      if (res.data.success) {
        msg.className = 'mt-3 text-center text-sm text-green-600';
        msg.textContent = '저장되었습니다.';
        msg.classList.remove('hidden');
        setTimeout(function() { msg.classList.add('hidden'); }, 3000);
        // 사이드바 법인명도 갱신
        var nameEl = document.getElementById('entityName');
        if (nameEl && payload.short_name) nameEl.textContent = payload.short_name;
      }
    })
    .catch(function(err) {
      msg.className = 'mt-3 text-center text-sm text-red-600';
      msg.textContent = '저장 실패: ' + (err.response && err.response.data && err.response.data.error || err.message);
      msg.classList.remove('hidden');
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = originalText;
    });
}

// 세금계산서 설정 저장
function saveTaxSettings() {
  saveSectionSettings(TAX_KEYS, TAX_CHECKBOX_KEYS, 'saveTaxBtn', 'taxSaveMsg');
}

// 이메일 설정 저장
function saveEmailSettings() {
  saveSectionSettings(EMAIL_KEYS, EMAIL_CHECKBOX_KEYS, 'saveEmailBtn', 'emailSaveMsg');
}

// ── 팝빌 연결 테스트 ──
async function testPopbillConnection() {
  var btn = document.getElementById('testPopbillBtn');
  var msg = document.getElementById('taxSaveMsg');
  btn.disabled = true;
  btn.textContent = '연결 중...';

  try {
    // 먼저 현재 세금계산서 설정 저장
    await saveSectionSettings(TAX_KEYS, TAX_CHECKBOX_KEYS, 'saveTaxBtn', 'taxSaveMsg');

    var res = await axios.get('/api/tax-invoices/test-connection');
    if (res.data.success) {
      var d = res.data.data;
      msg.className = 'mt-3 text-center text-sm text-green-600';
      var pointInfo = '회원: ' + (d.remainPoint || 0) + ' / 파트너: ' + (d.partnerPoint || 0);
      msg.textContent = '팝빌 연결 성공! (모드: ' + (d.testMode ? '테스트' : '실서비스') + ', 포인트 — ' + pointInfo + ')';
      msg.classList.remove('hidden');
    } else {
      msg.className = 'mt-3 text-center text-sm text-red-600';
      msg.textContent = res.data.error || '연결 실패';
      msg.classList.remove('hidden');
    }
  } catch (err) {
    msg.className = 'mt-3 text-center text-sm text-red-600';
    msg.textContent = '연결 실패: ' + (err.response?.data?.error || err.message);
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '연결 테스트';
  }
}

async function sendTestEmail() {
  var to = document.getElementById('testEmailTo').value.trim();
  if (!to) { showToast('수신 이메일 주소를 입력하세요.', 'warning'); return; }

  var btn = document.getElementById('testEmailBtn');
  var msg = document.getElementById('testEmailMsg');
  btn.disabled = true;
  btn.textContent = '발송 중...';

  try {
    var res = await axios.post('/api/emails/test', { to: to });
    if (res.data.success) {
      msg.className = 'mt-2 text-sm text-green-600';
      msg.textContent = '테스트 이메일이 발송되었습니다. 수신함을 확인하세요.';
      msg.classList.remove('hidden');
    } else {
      msg.className = 'mt-2 text-sm text-red-600';
      msg.textContent = '발송 실패: ' + (res.data.error || '알 수 없는 오류');
      msg.classList.remove('hidden');
    }
  } catch (err) {
    msg.className = 'mt-2 text-sm text-red-600';
    msg.textContent = '발송 실패: ' + (err.response && err.response.data ? err.response.data.error : err.message);
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '테스트 발송';
    setTimeout(function() { msg.classList.add('hidden'); }, 5000);
  }
}

// ── 원가 기준 ──
var costStandards = [];
var allCategories = [];

async function loadCostStandards() {
  try {
    var [csRes, catRes] = await Promise.all([
      axios.get('/api/settings/cost-standards'),
      axios.get('/api/items/categories')
    ]);
    costStandards = csRes.data.success ? csRes.data.data : [];
    allCategories = catRes.data.success ? (catRes.data.data || []).map(function(c) { return c.category_name; }) : [];
    renderCostTable();
    var dl = document.getElementById('catList');
    if (dl) dl.innerHTML = allCategories.map(function(n) { return '<option value="' + escapeAttr(n) + '">'; }).join('');
  } catch (err) {
    console.error('Cost standards load failed:', err);
  }
}

function renderCostTable() {
  var tbody = document.getElementById('costStandardsBody');
  var noMsg = document.getElementById('noCostMsg');
  if (costStandards.length === 0) {
    tbody.innerHTML = '';
    noMsg.classList.remove('hidden');
    return;
  }
  noMsg.classList.add('hidden');
  tbody.innerHTML = costStandards.map(function(cs, idx) {
    return '<tr class="border-b border-gray-100 hover:bg-gray-50" data-idx="' + idx + '">'
      + '<td class="px-3 py-2"><input type="text" value="' + escapeAttr(cs.category_name || '') + '" data-field="category_name" class="w-full px-2 py-1 border border-gray-300 rounded text-sm" list="catList" placeholder="카테고리명"></td>'
      + '<td class="px-3 py-2"><input type="number" value="' + (cs.media_cost_per_sqm || 0) + '" data-field="media_cost_per_sqm" class="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right" min="0" step="100"></td>'
      + '<td class="px-3 py-2"><input type="number" value="' + (cs.ink_cost_per_sqm || 0) + '" data-field="ink_cost_per_sqm" class="w-full px-2 py-1 border border-gray-300 rounded text-sm text-right" min="0" step="100"></td>'
      + '<td class="px-3 py-2"><input type="text" value="' + escapeAttr(cs.description || '') + '" data-field="description" class="w-full px-2 py-1 border border-gray-300 rounded text-sm" placeholder="비고"></td>'
      + '<td class="px-3 py-2 text-center"><button onclick="removeCostRow(' + idx + ')" class="text-red-500 hover:text-red-700 p-1" title="삭제"><svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button></td>'
      + '</tr>';
  }).join('');
}

function escapeAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function addCostRow() {
  costStandards.push({ category_name: '', media_cost_per_sqm: 0, ink_cost_per_sqm: 0, description: '' });
  renderCostTable();
  var rows = document.querySelectorAll('#costStandardsBody tr');
  if (rows.length > 0) rows[rows.length - 1].querySelector('input').focus();
}

function removeCostRow(idx) {
  costStandards.splice(idx, 1);
  renderCostTable();
}

function collectCostRows() {
  var rows = document.querySelectorAll('#costStandardsBody tr');
  var result = [];
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    var obj = {};
    inputs.forEach(function(inp) {
      var field = inp.getAttribute('data-field');
      if (field) obj[field] = inp.type === 'number' ? parseFloat(inp.value) || 0 : inp.value.trim();
    });
    if (obj.category_name) result.push(obj);
  });
  return result;
}

async function saveCostStandards() {
  var standards = collectCostRows();
  var btn = document.getElementById('saveCostBtn');
  var msg = document.getElementById('costSaveMsg');
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '저장 중...';
  try {
    var res = await axios.put('/api/settings/cost-standards', { standards: standards });
    if (res.data.success) {
      msg.className = 'mt-3 text-center text-sm text-green-600';
      msg.textContent = '원가 기준이 저장되었습니다.';
      msg.classList.remove('hidden');
      setTimeout(function() { msg.classList.add('hidden'); }, 3000);
      loadCostStandards();
    }
  } catch (err) {
    msg.className = 'mt-3 text-center text-sm text-red-600';
    msg.textContent = '저장 실패: ' + (err.response?.data?.error || err.message);
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

loadSettings();
loadCostStandards();

// === 메시지 설정 (settings 탭용) ===
async function loadMsgSettings() {
  try {
    var res = await axios.get('/api/kakao/settings');
    if (!res.data.success) return;
    var s = res.data.data;
    document.getElementById('msgSettingEnabled').checked = s.kakao_enabled === '1';
    document.getElementById('msgSettingSenderNum').value = s.kakao_sender_num || '';
    document.getElementById('msgSettingChannelId').value = s.kakao_channel_id || '';
    document.getElementById('msgSettingAltSendType').value = s.kakao_alt_send_type || '';
    document.getElementById('msgSettingEmailEnabled').checked = s.email_enabled === '1';
    document.getElementById('msgSettingEmailFromName').value = s.email_from_name || '';
    document.getElementById('msgSettingEmailFromAddr').value = s.email_from_address || '';
    if (document.getElementById('msgSettingFaxEnabled')) {
      document.getElementById('msgSettingFaxEnabled').checked = s.fax_enabled === '1';
    }
    if (document.getElementById('msgSettingFaxSenderNum')) {
      document.getElementById('msgSettingFaxSenderNum').value = s.fax_sender_num || '';
    }
  } catch(e) { console.error('load msg settings error', e); }
}

async function saveMsgSettings() {
  try {
    var payload = {
      kakao_enabled: document.getElementById('msgSettingEnabled').checked ? '1' : '0',
      kakao_sender_num: document.getElementById('msgSettingSenderNum').value.trim(),
      kakao_channel_id: document.getElementById('msgSettingChannelId').value.trim(),
      kakao_alt_send_type: document.getElementById('msgSettingAltSendType').value,
      email_enabled: document.getElementById('msgSettingEmailEnabled').checked ? '1' : '0',
      email_from_name: document.getElementById('msgSettingEmailFromName').value.trim(),
      email_from_address: document.getElementById('msgSettingEmailFromAddr').value.trim(),
      fax_enabled: document.getElementById('msgSettingFaxEnabled') && document.getElementById('msgSettingFaxEnabled').checked ? '1' : '0',
      fax_sender_num: document.getElementById('msgSettingFaxSenderNum') ? document.getElementById('msgSettingFaxSenderNum').value.trim() : ''
    };
    var res = await axios.patch('/api/kakao/settings', payload);
    if (res.data.success) {
      showToast('메시지 설정이 저장되었습니다', 'success');
    } else {
      showToast(res.data.error || '저장 실패', 'error');
    }
  } catch(e) {
    showToast('설정 저장 실패', 'error');
  }
}

async function testMsgPopbillConnection() {
  var iconEl = document.getElementById('msgPopbillIcon');
  var textEl = document.getElementById('msgPopbillText');
  var detailEl = document.getElementById('msgPopbillDetail');
  if (iconEl) iconEl.textContent = '⏳';
  if (textEl) textEl.textContent = '연결 확인 중...';

  try {
    var balRes = await axios.get('/api/kakao/balance');
    if (balRes.data.success) {
      var b = balRes.data.data;
      if (iconEl) iconEl.textContent = '✅';
      if (textEl) { textEl.textContent = '팝빌 연결 정상'; textEl.className = 'text-sm font-medium text-green-700'; }
      if (detailEl) detailEl.textContent = '포인트 조회 성공';
      document.getElementById('msgConnBalance').textContent = (b.remain_point || 0).toLocaleString() + '원';
      document.getElementById('msgConnUnitCost').textContent = (b.unit_cost || 0) + '원';
    } else {
      if (iconEl) iconEl.textContent = '❌';
      if (textEl) { textEl.textContent = '팝빌 연결 실패'; textEl.className = 'text-sm font-medium text-red-700'; }
      if (detailEl) detailEl.textContent = balRes.data.error || '';
    }
  } catch(e) {
    if (iconEl) iconEl.textContent = '❌';
    if (textEl) { textEl.textContent = '팝빌 연결 실패'; textEl.className = 'text-sm font-medium text-red-700'; }
    if (detailEl) detailEl.textContent = '네트워크 오류';
  }

  try {
    var tplRes = await axios.get('/api/kakao/templates');
    if (tplRes.data.success) {
      var templates = tplRes.data.data || [];
      var approved = templates.filter(function(t) { return t.state === 'S' || t.state === '3'; }).length;
      document.getElementById('msgConnTemplateCount').textContent = approved + '개 승인';
    }
  } catch(e) {
    document.getElementById('msgConnTemplateCount').textContent = '조회 실패';
  }
}
