var SETTING_KEYS = [
  'company_name', 'company_business_registration_number',
  'company_representative', 'company_phone',
  'company_business_type', 'company_business_item',
  'company_address', 'company_fax', 'company_bank_info',
  'company_stamp_base64',
  'tax_provider', 'tax_default_email',
  'email_from_name', 'email_from_address'
];
var CHECKBOX_KEYS = ['tax_test_mode', 'tax_auto_issue', 'email_enabled', 'po_auto_approve_enabled'];

// ── 회사 정보 키 ──
var COMPANY_KEYS = [
  'company_name', 'company_business_registration_number',
  'company_representative', 'company_phone',
  'company_business_type', 'company_business_item',
  'company_address', 'company_fax', 'company_bank_info',
  'company_stamp_base64'
];
// ── 세금계산서 키 ──
var TAX_KEYS = ['tax_provider', 'tax_default_email'];
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
        if (el && data[key]) {
          // tax_provider는 DB에 popbill로 남아있어도 바로빌로 표시
          if (key === 'tax_provider') {
            el.value = '바로빌';
          } else {
            el.value = data[key];
          }
        }
      });
      CHECKBOX_KEYS.forEach(function(key) {
        var el = document.getElementById('s_' + key);
        if (el) el.checked = data[key] === '1';
      });
      // #326: 빠른 발주 자동승인 한도 (data-money — 콤마 포맷 표시)
      var autoApproveLimitEl = document.getElementById('s_po_auto_approve_limit');
      if (autoApproveLimitEl) {
        var lim = data.po_auto_approve_limit;
        autoApproveLimitEl.value = (lim != null && lim !== '') ? Number(lim).toLocaleString('ko-KR') : '';
      }
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
      window.currentEntityId = e.id;
      // 법인별 로고 로드 (Phase 후속: price-list에서 이동됨)
      if (typeof loadLogoSettings === 'function' && e.id) loadLogoSettings(e.id);
      // 회사 인쇄 정보(부서연락처·웹하드·직인) 로드 (Phase 2)
      if (typeof loadCompanyPrintInfo === 'function' && e.id) loadCompanyPrintInfo(e.id);
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

// 빠른 발주 자동승인 설정 저장 (#326)
// 한도는 data-money라 콤마 포함 → parseMoney로 정수 정규화 후 저장 (백엔드는 Number(value)로 비교)
async function saveAutoApproveSettings() {
  var enabledEl = document.getElementById('s_po_auto_approve_enabled');
  var limitEl = document.getElementById('s_po_auto_approve_limit');
  var btn = document.getElementById('saveAutoApproveBtn');
  var msg = document.getElementById('autoApproveSaveMsg');
  if (!enabledEl || !limitEl || !btn || !msg) { console.warn('[settings] saveAutoApproveSettings: 필드 없음'); return; }

  var limit = window.parseMoney(limitEl.value);
  var settings = {
    po_auto_approve_enabled: enabledEl.checked ? '1' : '0',
    po_auto_approve_limit: String(limit == null ? 0 : limit)
  };

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
    msg.textContent = '저장 실패: ' + (err.response && err.response.data && err.response.data.error || err.message);
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ── 바로빌 연결 테스트 ──
async function testBarobillConnection() {
  var btn = document.getElementById('testBarobillBtn');
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
      msg.textContent = '연결 성공! (모드: ' + (d.testMode ? '테스트' : '운영') + ', 포인트 — ' + pointInfo + ')';
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

// #328: orphan sendTestEmail 제거 — settings 페이지에 testEmail UI 없음(실동작은 emailLogs.js/activityLog 페이지)

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
      + '<td class="px-3 py-2 text-center"><button onclick="removeCostRow(' + idx + ')" class="text-red-500 hover:text-red-700 p-1" title="삭제"><i class="fas fa-trash-alt"></i></button></td>'
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
  loadKakaoTemplateDefaults();
}

// === 발송 위치별 기본 템플릿 매핑 ===
var KTD_LABELS = {
  'shipments|freight': '출고 · 대신화물',
  'shipments|daesintaekbae': '출고 · 대신택배',
  'shipments|quick': '출고 · 방문/퀵',
  'shipments|hanjin': '출고 · 한진택배',
  'ledger|': '미수금 안내',
  'orders|': '주문 접수 안내'
};
async function loadKakaoTemplateDefaults() {
  var listEl = document.getElementById('ktdList');
  if (!listEl) return;
  try {
    var results = await Promise.all([
      axios.get('/api/kakao/template-defaults'),
      axios.get('/api/kakao/templates')
    ]);
    var defs = (results[0].data && results[0].data.data) || [];
    var tpls = ((results[1].data && results[1].data.data) || []).filter(function(t){ return t.state === 'S' || t.state === '3'; });
    if (defs.length === 0) { listEl.innerHTML = '<div class="text-xs text-gray-400">등록된 매핑이 없습니다.</div>'; return; }
    var optsHtml = '<option value="">선택 안 함(수동)</option>' + tpls.map(function(t){
      return '<option value="' + escapeHtml(t.templateCode) + '">' + escapeHtml(t.templateName) + '</option>';
    }).join('');
    listEl.innerHTML = defs.map(function(d){
      var key = d.context + '|' + (d.match_key || '');
      var label = KTD_LABELS[key] || (d.context + (d.match_key ? ' · ' + d.match_key : ''));
      var sel = optsHtml.replace('value="' + escapeHtml(d.template_code || '') + '"', 'value="' + escapeHtml(d.template_code || '') + '" selected');
      // #419: inline onchange JS-string 보간 제거 → data-* 속성(escapeHtml escape) + addEventListener. context/match_key가 서버 enum검증 없이 저장돼 stored XSS 가능했음.
      return '<div class="flex items-center justify-between gap-2">'
        + '<span class="text-sm text-gray-700">' + escapeHtml(label) + ' <span class="text-xs text-gray-400">(법인 ' + d.entity_id + ')</span></span>'
        + '<select class="ktd-select border border-gray-300 rounded px-2 py-1 text-sm" data-ctx="' + escapeHtml(d.context || '') + '" data-mk="' + escapeHtml(d.match_key || '') + '" data-eid="' + escapeHtml(String(d.entity_id)) + '">' + sel + '</select>'
        + '</div>';
    }).join('');
    // #419: 인라인 핸들러 대신 이벤트 바인딩 — data-* 값을 읽어 saveKtd 호출(JS-string 보간 자체 소멸)
    Array.prototype.forEach.call(listEl.querySelectorAll('.ktd-select'), function(selEl){
      selEl.addEventListener('change', function(){
        saveKtd(this.getAttribute('data-ctx') || '', this.getAttribute('data-mk') || '', Number(this.getAttribute('data-eid')) || 0, this.value);
      });
    });
  } catch(e) { listEl.innerHTML = '<div class="text-xs text-red-400">불러오기 실패</div>'; }
}
async function saveKtd(context, matchKey, entityId, templateCode) {
  try {
    await axios.put('/api/kakao/template-defaults', { context: context, match_key: matchKey, entity_id: entityId, template_code: templateCode });
    showToast('기본 템플릿이 저장되었습니다', 'success');
  } catch(e) { showToast('저장 실패', 'error'); }
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

async function testMsgBarobillConnection() {
  var iconEl = document.getElementById('msgBarobillIcon');
  var textEl = document.getElementById('msgBarobillText');
  var detailEl = document.getElementById('msgBarobillDetail');
  if (iconEl) iconEl.innerHTML = '<i class="fas fa-spinner fa-spin text-gray-400"></i>';
  if (textEl) textEl.textContent = '연결 확인 중...';

  try {
    var balRes = await axios.get('/api/kakao/balance');
    if (balRes.data.success) {
      var b = balRes.data.data;
      if (iconEl) iconEl.innerHTML = '<i class="fas fa-circle-check text-green-600"></i>';
      if (textEl) { textEl.textContent = '바로빌 연결 정상'; textEl.className = 'text-sm font-medium text-green-700'; }
      if (detailEl) detailEl.textContent = '포인트 조회 성공';
      // 통합(파트너) 지갑이 실잔액. 회원사 지갑(remain_point)은 동산기획 설정상 항상 0 → partner_point 우선.
      document.getElementById('msgConnBalance').textContent = (b.partner_point || b.remain_point || 0).toLocaleString() + '원';
      // 응답 키는 채널별(unit_cost_alimtalk 등). 카카오톡 단가 = 알림톡 단가. (구 b.unit_cost는 미존재 → 항상 0이던 버그)
      document.getElementById('msgConnUnitCost').textContent = (b.unit_cost_alimtalk || 0).toLocaleString() + '원';
    } else {
      if (iconEl) iconEl.innerHTML = '<i class="fas fa-circle-xmark text-red-600"></i>';
      if (textEl) { textEl.textContent = '바로빌 연결 실패'; textEl.className = 'text-sm font-medium text-red-700'; }
      if (detailEl) detailEl.textContent = balRes.data.error || '';
    }
  } catch(e) {
    if (iconEl) iconEl.innerHTML = '<i class="fas fa-circle-xmark text-red-600"></i>';
    if (textEl) { textEl.textContent = '바로빌 연결 실패'; textEl.className = 'text-sm font-medium text-red-700'; }
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

// ========== 법인별 로고 (Phase 후속: price-list에서 이동됨) ==========
var pendingLogoBase64 = null;

async function loadLogoSettings(entityId) {
  try {
    var res = await axios.get('/api/price-list/logo/' + entityId);
    var ent = (res.data.success && res.data.data) ? res.data.data : {};
    var el = document.getElementById('logoSettingsArea');
    if (!el) return;
    el.innerHTML = '<div class="max-w-lg">'
      + '<div class="mb-4">'
      + '<label class="block text-sm font-medium text-gray-700 mb-2">현재 로고</label>'
      + (ent.logo_base64 ? '<img src="' + ent.logo_base64 + '" style="max-height:60px;max-width:240px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;">' : '<div class="text-sm text-gray-400">로고 미설정</div>')
      + '</div>'
      + '<div class="mb-4">'
      + '<label class="block text-sm font-medium text-gray-700 mb-2">로고 업로드 (PNG/JPG/SVG, 권장 높이 60px)</label>'
      + '<input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/svg+xml" onchange="onLogoFileSelected(this)" class="text-sm">'
      + '</div>'
      + '<div class="mb-4"><div id="logoPreview"></div></div>'
      + '<button onclick="saveLogo()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-save mr-1"></i>로고 저장</button>'
      + (ent.logo_base64 ? ' <button onclick="deleteLogo()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 ml-2"><i class="fas fa-trash mr-1"></i>삭제</button>' : '')
      + '</div>';
  } catch (e) { showToast('로고 설정 로드 실패', 'error'); }
}

function onLogoFileSelected(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    pendingLogoBase64 = e.target.result;
    document.getElementById('logoPreview').innerHTML = '<img src="' + pendingLogoBase64 + '" style="max-height:60px;max-width:240px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;margin-top:8px;">';
  };
  reader.readAsDataURL(file);
}

async function saveLogo() {
  if (!pendingLogoBase64) { showToast('로고 파일을 선택하세요.', 'warning'); return; }
  if (!window.currentEntityId) { showToast('법인 정보 로딩 중', 'warning'); return; }
  try {
    await axios.put('/api/price-list/logo/' + window.currentEntityId, { logo_base64: pendingLogoBase64 });
    showToast('로고 저장 완료', 'success');
    pendingLogoBase64 = null;
    loadLogoSettings(window.currentEntityId);
  } catch (e) { showToast('저장 실패', 'error'); }
}

async function deleteLogo() {
  if (!confirm('로고를 삭제하시겠습니까?')) return;
  if (!window.currentEntityId) return;
  try {
    await axios.put('/api/price-list/logo/' + window.currentEntityId, { logo_base64: null });
    showToast('로고 삭제 완료', 'success');
    loadLogoSettings(window.currentEntityId);
  } catch (e) { showToast('삭제 실패', 'error'); }
}

// ========== 회사 인쇄 정보: 부서연락처 / 웹하드 / 직인 (Phase 2 — 전달 문서 헤더) ==========
// 전역 var는 pc(print company) prefix로 격리(?raw concat 전역스코프 충돌 방지).
var pcContacts = [];            // 부서별 연락처 in-memory [{id?, department, person_name, phone, fax}]
var pcDeletedContactIds = [];   // 삭제 대기 id(저장 시 DELETE)
var pcPendingStampBase64 = null;

async function loadCompanyPrintInfo(entityId) {
  if (!entityId) { console.warn('[settings] loadCompanyPrintInfo: entityId 없음'); return; }
  try {
    var res = await axios.get('/api/price-list/company/' + entityId);
    var d = (res.data.success && res.data.data) ? res.data.data : {};
    var whEl = document.getElementById('pcWebhardUrl');
    if (whEl) whEl.value = d.webhard_url || '';
    pcContacts = Array.isArray(d.contacts) ? d.contacts.map(function(cc) {
      return { id: cc.id, department: cc.department || '', person_name: cc.person_name || '', phone: cc.phone || '', fax: cc.fax || '' };
    }) : [];
    pcDeletedContactIds = [];
    renderPcContacts();
    renderPcStamp(d.stamp_base64);
  } catch (e) {
    console.warn('[settings] loadCompanyPrintInfo 실패', e);
    showToast('회사 인쇄정보 로드 실패', 'error');
  }
}

function renderPcContacts() {
  var tbody = document.getElementById('pcContactsBody');
  var noMsg = document.getElementById('pcNoContactsMsg');
  if (!tbody) { console.warn('[settings] #pcContactsBody not found'); return; }
  if (pcContacts.length === 0) {
    tbody.innerHTML = '';
    if (noMsg) noMsg.classList.remove('hidden');
    return;
  }
  if (noMsg) noMsg.classList.add('hidden');
  tbody.innerHTML = pcContacts.map(function(cc, idx) {
    return '<tr data-idx="' + idx + '">'
      + '<td class="px-3 py-2"><input type="text" value="' + escapeAttr(cc.department || '') + '" data-field="department" class="w-full px-2 py-1 border border-gray-300 rounded text-sm" placeholder="제작부"></td>'
      + '<td class="px-3 py-2"><input type="text" value="' + escapeAttr(cc.person_name || '') + '" data-field="person_name" class="w-full px-2 py-1 border border-gray-300 rounded text-sm" placeholder="담당자"></td>'
      + '<td class="px-3 py-2"><input type="text" value="' + escapeAttr(cc.phone || '') + '" data-field="phone" class="w-full px-2 py-1 border border-gray-300 rounded text-sm" placeholder="042-000-0000"></td>'
      + '<td class="px-3 py-2"><input type="text" value="' + escapeAttr(cc.fax || '') + '" data-field="fax" class="w-full px-2 py-1 border border-gray-300 rounded text-sm" placeholder="042-000-0000"></td>'
      + '<td class="px-3 py-2 text-center"><button onclick="removePcContact(' + idx + ')" class="text-red-500 hover:text-red-700 p-1" title="삭제"><i class="fas fa-trash"></i></button></td>'
      + '</tr>';
  }).join('');
}

function addPcContact() {
  collectPcContacts();
  pcContacts.push({ department: '', person_name: '', phone: '', fax: '' });
  renderPcContacts();
  var rows = document.querySelectorAll('#pcContactsBody tr');
  if (rows.length > 0) { var inp = rows[rows.length - 1].querySelector('input'); if (inp) inp.focus(); }
}

function removePcContact(idx) {
  collectPcContacts();
  var cc = pcContacts[idx];
  if (cc && cc.id) pcDeletedContactIds.push(cc.id);
  pcContacts.splice(idx, 1);
  renderPcContacts();
}

// DOM 입력값을 pcContacts로 회수(추가/삭제/저장 전 편집 내용 보존)
function collectPcContacts() {
  var rows = document.querySelectorAll('#pcContactsBody tr');
  rows.forEach(function(row) {
    var idx = Number(row.getAttribute('data-idx'));
    if (isNaN(idx) || !pcContacts[idx]) return;
    row.querySelectorAll('input').forEach(function(inp) {
      var field = inp.getAttribute('data-field');
      if (field) pcContacts[idx][field] = inp.value.trim();
    });
  });
}

async function savePcContacts() {
  if (!window.currentEntityId) { showToast('법인 정보 로딩 중', 'warning'); return; }
  collectPcContacts();
  var eid = window.currentEntityId;
  var btn = document.getElementById('savePcContactsBtn');
  var original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  try {
    for (var i = 0; i < pcDeletedContactIds.length; i++) {
      await axios.delete('/api/price-list/company/' + eid + '/contacts/' + pcDeletedContactIds[i]);
    }
    pcDeletedContactIds = [];
    for (var j = 0; j < pcContacts.length; j++) {
      var cc = pcContacts[j];
      if (!cc.department) continue;   // 부서명 없는 행은 스킵
      var body = { department: cc.department, person_name: cc.person_name, phone: cc.phone, fax: cc.fax, sort_order: j };
      if (cc.id) {
        await axios.put('/api/price-list/company/' + eid + '/contacts/' + cc.id, body);
      } else {
        var r = await axios.post('/api/price-list/company/' + eid + '/contacts', body);
        if (r.data && r.data.data) cc.id = r.data.data.id;
      }
    }
    showToast('부서 연락처가 저장되었습니다', 'success');
    loadCompanyPrintInfo(eid);
  } catch (e) {
    showToast('부서 연락처 저장 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

async function savePcWebhard() {
  if (!window.currentEntityId) { showToast('법인 정보 로딩 중', 'warning'); return; }
  var el = document.getElementById('pcWebhardUrl');
  if (!el) { console.warn('[settings] #pcWebhardUrl not found'); return; }
  var btn = document.getElementById('savePcWebhardBtn');
  var original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  try {
    await axios.put('/api/price-list/company/' + window.currentEntityId, { webhard_url: el.value.trim() });
    showToast('웹하드 주소가 저장되었습니다', 'success');
  } catch (e) {
    showToast('웹하드 저장 실패', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

function renderPcStamp(stampBase64) {
  var el = document.getElementById('pcStampArea');
  if (!el) { console.warn('[settings] #pcStampArea not found'); return; }
  pcPendingStampBase64 = null;
  el.innerHTML = '<div class="max-w-lg">'
    + '<div class="mb-4">'
    + '<label class="block text-sm font-medium text-gray-700 mb-2">현재 직인</label>'
    + (stampBase64 ? '<img src="' + stampBase64 + '" style="max-height:80px;max-width:120px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;">' : '<div class="text-sm text-gray-400">직인 미설정</div>')
    + '</div>'
    + '<div class="mb-4">'
    + '<label class="block text-sm font-medium text-gray-700 mb-2">직인 업로드 (PNG/JPG, 권장 200x200px 이하)</label>'
    + '<input type="file" id="pcStampFileInput" accept="image/png,image/jpeg" onchange="onPcStampFileSelected(this)" class="text-sm">'
    + '</div>'
    + '<div class="mb-4"><div id="pcStampPreview"></div></div>'
    + '<button onclick="savePcStamp()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-save mr-1"></i>직인 저장</button>'
    + (stampBase64 ? ' <button onclick="deletePcStamp()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 ml-2"><i class="fas fa-trash mr-1"></i>삭제</button>' : '')
    + '</div>';
}

function onPcStampFileSelected(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 500000) { showToast('이미지 크기는 500KB 이하로 해주세요.', 'warning'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    pcPendingStampBase64 = e.target.result;
    var pv = document.getElementById('pcStampPreview');
    if (pv) pv.innerHTML = '<img src="' + pcPendingStampBase64 + '" style="max-height:80px;max-width:120px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;margin-top:8px;">';
  };
  reader.readAsDataURL(file);
}

async function savePcStamp() {
  if (!pcPendingStampBase64) { showToast('직인 파일을 선택하세요.', 'warning'); return; }
  if (!window.currentEntityId) { showToast('법인 정보 로딩 중', 'warning'); return; }
  try {
    await axios.put('/api/price-list/stamp/' + window.currentEntityId, { stamp_base64: pcPendingStampBase64 });
    syncCompanyFormStamp(pcPendingStampBase64);
    showToast('직인 저장 완료', 'success');
    renderPcStamp(pcPendingStampBase64);
  } catch (e) {
    showToast('직인 저장 실패', 'error');
  }
}

async function deletePcStamp() {
  if (!confirm('직인을 삭제하시겠습니까?')) return;
  if (!window.currentEntityId) return;
  try {
    await axios.put('/api/price-list/stamp/' + window.currentEntityId, { stamp_base64: null });
    syncCompanyFormStamp('');
    showToast('직인 삭제 완료', 'success');
    renderPcStamp(null);
  } catch (e) {
    showToast('직인 삭제 실패', 'error');
  }
}

// 회사정보 폼(인감도장)의 히든필드·미리보기와 동기화.
// 두 UI가 동일 entities.stamp_base64를 가리키므로, 신규 저장/삭제 후 회사정보 폼 '저장'이
// 옛 값으로 덮어쓰는(clobber) 것을 방지한다.
function syncCompanyFormStamp(base64) {
  var hidden = document.getElementById('s_company_stamp_base64');
  if (hidden) hidden.value = base64 || '';
  var preview = document.getElementById('stampPreview');
  if (preview) preview.src = base64 || '';
}

// ── 여신 정책 ──
// 판정·산출 정본은 서버(routes/ledger/credit-helpers). 여기서 한도를 계산하지 않는다.
// 영향 시뮬레이션은 전 거래처 집계라 무겁다 → 탭 진입 1회 + 버튼 클릭 시에만 호출(폴링 금지).

function cpReadInputs() {
  return {
    multiplier: parseFloat(document.getElementById('cpMultiplier').value) || 0,
    months: parseInt(document.getElementById('cpMonths').value, 10) || 0,
    floor: window.parseMoney(document.getElementById('cpFloor').value),
    cap: window.parseMoney(document.getElementById('cpCap').value),
    warn_ratio: parseFloat(document.getElementById('cpWarnRatio').value) || 0
  };
}

function cpFillInputs(p) {
  document.getElementById('cpMultiplier').value = p.multiplier;
  document.getElementById('cpMonths').value = p.months;
  document.getElementById('cpFloor').value = window.fmtMoneyInput(p.floor);
  document.getElementById('cpCap').value = window.fmtMoneyInput(p.cap);
  document.getElementById('cpWarnRatio').value = p.warnRatio;
}

function cpRenderFormula(p) {
  var man = function(n) { return Math.round(n / 10000).toLocaleString() + '만'; };
  document.getElementById('cpFormulaMonths').textContent = p.months;
  document.getElementById('cpFormulaMult').textContent = p.multiplier;
  document.getElementById('cpFormulaFloor').textContent = man(p.floor);
  document.getElementById('cpFormulaCap').textContent = man(p.cap);
}

function cpRenderImpact(im, isSim) {
  var box = document.getElementById('cpImpact');
  if (!box) { console.warn('[settings] #cpImpact not found'); return; }
  var cell = function(tone, label, value, sub) {
    return '<div class="rounded-lg border border-' + tone + '-200 bg-' + tone + '-50 px-4 py-3">'
      + '<div class="text-[11px] text-' + tone + '-700">' + label + '</div>'
      + '<div class="text-xl font-bold text-' + tone + '-800 mt-0.5">' + value + '</div>'
      + (sub ? '<div class="text-[11px] text-' + tone + '-600 mt-0.5">' + sub + '</div>' : '')
      + '</div>';
  };
  box.innerHTML =
    (isSim ? '<div class="mb-3 text-[11px] text-blue-600">아직 저장하지 않은 값 기준입니다.</div>' : '')
    + '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">'
    + cell('red', '한도 초과', im.exceeded.toLocaleString() + '곳',
        '미수 ' + Math.round(im.exceeded_balance / 10000).toLocaleString() + '만원')
    + cell('amber', '경고 구간', im.warning.toLocaleString() + '곳', null)
    + cell('gray', '판정 대상', im.total.toLocaleString() + '곳', '거래 이력 있는 거래처')
    + cell('gray', '수동 차단 / 무제한', im.held.toLocaleString() + ' / ' + im.unlimited.toLocaleString(), null)
    + '</div>';
}

async function loadCreditPolicy() {
  try {
    var res = await axios.get('/api/settings/credit-policy');
    if (!res.data.success) return;
    var d = res.data.data;
    cpFillInputs(d.saved);
    cpRenderFormula(d.saved);
    cpRenderImpact(d.impact, false);
  } catch (err) {
    var box = document.getElementById('cpImpact');
    if (box) box.textContent = '불러오지 못했습니다: ' + (err.response?.data?.error || err.message);
  }
}

async function simulateCreditPolicy() {
  var btn = document.getElementById('cpSimBtn');
  var v = cpReadInputs();
  btn.disabled = true;
  btn.textContent = '계산 중…';
  try {
    var res = await axios.get('/api/settings/credit-policy', { params: v });
    if (!res.data.success) return;
    cpRenderFormula(res.data.data.simulated);
    cpRenderImpact(res.data.data.impact, true);
  } catch (err) {
    showToast('시뮬레이션 실패: ' + (err.response?.data?.error || err.message), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '영향 확인';
  }
}

async function saveCreditPolicy() {
  var msg = document.getElementById('cpSaveMsg');
  var v = cpReadInputs();
  if (v.multiplier <= 0 || v.months <= 0 || v.cap <= 0 || v.warn_ratio <= 0) {
    msg.className = 'mt-3 text-center text-sm text-red-600';
    msg.textContent = '배수·기간·상한·경고비율은 0보다 커야 합니다.';
    msg.classList.remove('hidden');
    return;
  }
  var btn = document.getElementById('cpSaveBtn');
  btn.disabled = true;
  try {
    await axios.patch('/api/settings', { settings: {
      credit_limit_multiplier: String(v.multiplier),
      credit_limit_months: String(v.months),
      credit_limit_floor: String(v.floor),
      credit_limit_cap: String(v.cap),
      credit_warn_ratio: String(v.warn_ratio)
    }});
    msg.className = 'mt-3 text-center text-sm text-green-600';
    msg.textContent = '저장되었습니다. 다음 주문부터 이 기준이 적용됩니다.';
    msg.classList.remove('hidden');
    await loadCreditPolicy();
  } catch (err) {
    msg.className = 'mt-3 text-center text-sm text-red-600';
    msg.textContent = '저장 실패: ' + (err.response?.data?.error || err.message);
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}
