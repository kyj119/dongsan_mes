// 메시지 관리 스크립트
var currentMsgTab = 'history';
var logsPage = 1;

(function init() {
  loadSummary();
  loadLogs();
})();

function switchMsgTab(tab) {
  currentMsgTab = tab;
  ['history', 'bulk', 'templates', 'stats'].forEach(function(t) {
    var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    var panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
    if (t === tab) {
      btn.className = 'px-5 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-600';
      panel.classList.remove('hidden');
    } else {
      btn.className = 'px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700';
      panel.classList.add('hidden');
    }
  });
  // 탭 진입 시 데이터 로드
  if (tab === 'bulk') loadBulkTemplates();
  if (tab === 'templates') switchTplSubTab(currentTplSubTab || 'kakao');
  if (tab === 'stats') loadStats();
}

async function loadSummary() {
  try {
    var settingsRes = await axios.get('/api/kakao/settings');
    if (settingsRes.data.success) {
      var s = settingsRes.data.data;
      var statusEl = document.getElementById('msgStatusValue');
      if (s.kakao_enabled === '1') {
        statusEl.textContent = '활성';
        statusEl.className = 'text-3xl font-bold mt-1 text-green-600';
      } else {
        statusEl.textContent = '비활성';
        statusEl.className = 'text-3xl font-bold mt-1 text-red-600';
      }
      document.getElementById('msgChannelInfo').textContent = s.kakao_channel_id || '채널 미설정';
    }
  } catch(e) { console.error('msg summary error', e); }

  try {
    var balanceRes = await axios.get('/api/kakao/balance');
    if (balanceRes.data.success) {
      var b = balanceRes.data.data;
      document.getElementById('msgBalance').textContent = (b.remain_point || 0).toLocaleString() + '원';
      document.getElementById('msgPartnerPoint').textContent = '파트너: ' + (b.partner_point || 0).toLocaleString() + '원';
      document.getElementById('msgUnitCost').textContent = (b.unit_cost || 0) + '원/건';
    }
  } catch(e) {
    document.getElementById('msgBalance').textContent = '-';
    document.getElementById('msgUnitCost').textContent = '-';
  }

  try {
    var today = new Date().toISOString().slice(0, 10);
    var logsRes = await axios.get('/api/kakao/logs', { params: { date_from: today, date_to: today, limit: 1 } });
    if (logsRes.data.success) {
      document.getElementById('msgTodayCount').textContent = (logsRes.data.data.pagination.total || 0) + '건';
    }
  } catch(e) {}
}

async function loadLogs(page) {
  logsPage = page || 1;
  var params = { page: logsPage, limit: 30 };
  var search = document.getElementById('logSearch').value.trim();
  var channel = document.getElementById('logChannel').value;
  var status = document.getElementById('logStatus').value;
  if (search) params.search = search;
  if (channel) params.channel = channel;
  if (status) params.status = status;

  try {
    var res = await axios.get('/api/kakao/logs', { params: params });
    if (!res.data.success) return;
    var logs = res.data.data.logs || [];
    var tbody = document.getElementById('logsBody');

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-4 py-12 text-center text-gray-400"><i class="fas fa-comment-dots text-3xl mb-2"></i><br>발송 이력이 없습니다</td></tr>';
      document.getElementById('logsPagination').innerHTML = '';
      return;
    }

    var channelIcon = function(ch) {
      var map = { kakao: '<i class="fas fa-comment text-yellow-500"></i>', sms: '<i class="fas fa-sms text-green-500"></i>', email: '<i class="fas fa-envelope text-purple-500"></i>', fax: '<i class="fas fa-fax text-gray-500"></i>' };
      return map[ch] || '<i class="fas fa-paper-plane text-gray-400"></i>';
    };

    var statusBadge = function(s) {
      var map = { SUCCESS: 'bg-green-50 text-green-700', FAILED: 'bg-red-50 text-red-700', PENDING: 'bg-blue-50 text-blue-700', ALT_SENT: 'bg-amber-50 text-amber-700' };
      var labels = { SUCCESS: '성공', FAILED: '실패', PENDING: '대기', ALT_SENT: '대체문자' };
      return '<span class="rounded-full px-2.5 py-0.5 text-xs font-medium ' + (map[s] || 'bg-gray-100 text-gray-700') + '">' + (labels[s] || s) + '</span>';
    };

    var typeLabel = function(t) {
      var map = { shipments: '출고 알림', tax_invoices: '세금계산서', ledger: '거래내역', orders: '주문 접수', payroll: '급여명세' };
      return map[t] || t || '-';
    };

    var fmtDt = function(d) { return d ? d.replace('T', ' ').substring(0, 16) : '-'; };

    tbody.innerHTML = logs.map(function(log) {
      return '<tr class="border-b border-gray-100 hover:bg-gray-50">'
        + '<td class="px-4 py-3 text-sm text-gray-600">' + fmtDt(log.created_at) + '</td>'
        + '<td class="px-4 py-3 text-sm">' + channelIcon(log.channel || 'kakao') + '</td>'
        + '<td class="px-4 py-3 text-sm font-medium text-gray-900">' + (log.receiver_name || '-') + '</td>'
        + '<td class="px-4 py-3 text-sm text-gray-600">' + (log.receiver_num || '-') + '</td>'
        + '<td class="px-4 py-3 text-sm text-gray-500">' + typeLabel(log.related_type) + '</td>'
        + '<td class="px-4 py-3 text-center">' + statusBadge(log.status) + '</td>'
        + '<td class="px-4 py-3 text-center"><button onclick="viewLogDetail(\'' + (log.receipt_num || '') + '\')" class="text-blue-600 hover:text-blue-800 text-xs"><i class="fas fa-eye"></i></button></td>'
        + '</tr>';
    }).join('');

    var total = res.data.data.pagination.total || 0;
    var totalPages = Math.ceil(total / 30);
    renderLogsPagination(totalPages);
  } catch(e) {
    console.error('msg logs error', e);
  }
}

function renderLogsPagination(totalPages) {
  var el = document.getElementById('logsPagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  var html = '';
  for (var i = 1; i <= totalPages; i++) {
    html += '<button onclick="loadLogs(' + i + ')" class="px-3 py-1 text-sm rounded '
      + (i === logsPage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100') + '">' + i + '</button>';
  }
  el.innerHTML = html;
}

async function viewLogDetail(receiptNum) {
  var el = document.getElementById('logDetailContent');
  document.getElementById('logDetailModal').classList.remove('hidden');

  if (!receiptNum) {
    el.innerHTML = '<div class="text-center py-4 text-gray-500">접수번호가 없는 발송 건입니다.<br><span class="text-xs text-gray-400">팝빌 발송 상세 조회를 할 수 없습니다.</span></div>';
    return;
  }

  el.innerHTML = '<div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>조회 중...</div>';

  try {
    var res = await axios.get('/api/kakao/logs/' + encodeURIComponent(receiptNum) + '/status');
    if (res.data.success) {
      var d = res.data.data;
      var messages = Array.isArray(d) ? d : (d.messages && Array.isArray(d.messages)) ? d.messages : d.receiveNum ? [d] : [];

      if (messages.length === 0) {
        el.innerHTML = '<div class="text-center py-4 text-gray-500">결과 정보가 없습니다.<br><span class="text-xs text-gray-400">접수번호: ' + receiptNum + '</span></div>';
        return;
      }

      var statusMap = { '0': { label: '대기', color: 'blue' }, '1': { label: '성공', color: 'green' }, '2': { label: '실패', color: 'red' }, '3': { label: '대체문자 발송', color: 'amber' }, '4': { label: '대체문자 실패', color: 'red' } };

      var html = '<div class="mb-3 p-3 bg-gray-50 rounded-lg"><div class="text-xs text-gray-500">접수번호</div><div class="font-mono text-sm">' + receiptNum + '</div></div>';
      messages.forEach(function(msg) {
        var st = statusMap[String(msg.state || msg.reportState || '0')] || { label: '알 수 없음', color: 'gray' };
        html += '<div class="border rounded-lg p-3 mb-2">';
        html += '<div class="flex items-center justify-between mb-2">';
        html += '<span class="font-medium">' + (msg.receiveNum || msg.rcv || '-') + ' ' + (msg.receiveName || msg.rcvnm || '') + '</span>';
        html += '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-' + st.color + '-50 text-' + st.color + '-700">' + st.label + '</span>';
        html += '</div>';
        if (msg.resultMessage || msg.resultCode) html += '<div class="text-xs text-gray-500">결과: ' + (msg.resultMessage || '') + ' (코드: ' + (msg.resultCode || '') + ')</div>';
        if (msg.sentDT || msg.sendDT) html += '<div class="text-xs text-gray-400 mt-1">발송: ' + (msg.sentDT || msg.sendDT || '') + '</div>';
        if (msg.altResultCode) html += '<div class="text-xs text-amber-600 mt-1">대체문자: ' + (msg.altResultCode === 1 ? '성공' : '실패 (' + msg.altResultCode + ')') + '</div>';
        html += '</div>';
      });
      el.innerHTML = html;
    } else {
      el.innerHTML = '<div class="text-center py-4 text-red-500">' + (res.data.error || '조회 실패') + '</div>';
    }
  } catch(e) {
    el.innerHTML = '<div class="text-center py-4 text-red-500">조회 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message) + '</div>';
  }
}

function openIndividualSend() {
  window.openSendMessage({});
}

// === 대량 발송 ===
var bulkChannel = 'kakao';
var bulkTarget = 'employees';
var bulkTemplatesCache = [];
var bulkQuill = null;

function setBulkChannel(ch) {
  bulkChannel = ch;
  var channels = [
    { key: 'kakao', id: 'bulkChKakao', active: 'bg-blue-50 border-2 border-blue-500 text-blue-700' },
    { key: 'sms', id: 'bulkChSms', active: 'bg-green-50 border-2 border-green-500 text-green-700' },
    { key: 'email', id: 'bulkChEmail', active: 'bg-purple-50 border-2 border-purple-500 text-purple-700' }
  ];
  channels.forEach(function(c) {
    var btn = document.getElementById(c.id);
    if (!btn) return;
    btn.className = 'px-4 py-2 rounded-full text-sm font-medium ' + (c.key === ch ? c.active : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400');
  });

  var kakaoArea = document.getElementById('bulkKakaoArea');
  var subjectArea = document.getElementById('bulkSubjectArea');
  var byteCounter = document.getElementById('bulkByteCounter');
  var channelLabel = document.getElementById('bulkChannelLabel');

  if (ch === 'kakao') {
    kakaoArea.classList.remove('hidden');
    subjectArea.classList.add('hidden');
    byteCounter.classList.add('hidden');
    channelLabel.textContent = '카카오톡';
    channelLabel.className = 'text-xs text-blue-600 font-medium';
    loadBulkTemplates();
  } else if (ch === 'sms') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    byteCounter.classList.remove('hidden');
    channelLabel.textContent = 'SMS';
    channelLabel.className = 'text-xs text-green-600 font-medium';
  } else if (ch === 'email') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    byteCounter.classList.add('hidden');
    channelLabel.textContent = '이메일';
    channelLabel.className = 'text-xs text-purple-600 font-medium';
    initBulkQuill();
  }

  // textarea ↔ Quill 에디터 전환
  var textWrap = document.getElementById('bulkContentTextArea');
  var editorWrap = document.getElementById('bulkContentEditorArea');
  if (textWrap && editorWrap) {
    if (ch === 'email') {
      textWrap.classList.add('hidden');
      editorWrap.classList.remove('hidden');
    } else {
      textWrap.classList.remove('hidden');
      editorWrap.classList.add('hidden');
    }
  }

  // 예약 발송: 카카오톡/SMS만 지원
  var scheduleArea = document.getElementById('bulkScheduleArea');
  if (scheduleArea) scheduleArea.classList.toggle('hidden', ch !== 'kakao' && ch !== 'sms');

  updateBulkSendLabel();
}

function initBulkQuill() {
  if (bulkQuill) return;
  if (typeof Quill === 'undefined') return;
  bulkQuill = new Quill('#bulkQuillEditor', {
    theme: 'snow',
    placeholder: '이메일 내용을 작성하세요...',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link'],
        ['clean']
      ]
    }
  });
}

function toggleBulkSchedule() {
  var checked = document.getElementById('bulkScheduleToggle').checked;
  document.getElementById('bulkScheduleInput').classList.toggle('hidden', !checked);
  if (checked) {
    var d = new Date(Date.now() + 3600000);
    d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10, 0, 0);
    document.getElementById('bulkScheduleAt').value = d.toISOString().slice(0, 16);
  }
}

var bulkSelectedRecipients = []; // { name, phone, email, type }
var _recipientPickerType = '';
var _recipientAllData = [];

function setBulkTarget(target) {
  bulkTarget = target;
  var targets = [
    { key: 'employees', id: 'bulkTgtEmployees', active: 'bg-green-50 border-2 border-green-500 text-green-700' },
    { key: 'clients', id: 'bulkTgtClients', active: 'bg-blue-50 border-2 border-blue-500 text-blue-700' },
    { key: 'custom', id: 'bulkTgtCustom', active: 'bg-amber-50 border-2 border-amber-500 text-amber-700' }
  ];
  targets.forEach(function(t) {
    var btn = document.getElementById(t.id);
    if (!btn) return;
    btn.className = 'px-4 py-2 rounded-full text-sm font-medium ' + (t.key === target ? t.active : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400');
  });

  var customArea = document.getElementById('bulkCustomArea');
  var infoEl = document.getElementById('bulkTargetInfo');
  if (target === 'custom') {
    customArea.classList.remove('hidden');
    infoEl.textContent = '';
    bulkSelectedRecipients = [];
    renderSelectedTags();
  } else {
    customArea.classList.add('hidden');
  }
  updateBulkSendLabel();
}

// === 수신자 선택 팝업 ===
function openRecipientPicker(type) {
  _recipientPickerType = type;
  bulkTarget = type;
  setBulkTarget(type);

  document.getElementById('recipientPickerTitle').textContent = type === 'employees' ? '직원 선택' : '거래처 선택';
  document.getElementById('recipientSearch').value = '';
  document.getElementById('recipientList').innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>';
  document.getElementById('recipientPickerModal').classList.remove('hidden');

  var url = type === 'employees' ? '/api/users' : '/api/clients';
  axios.get(url).then(function(res) {
    var items = [];
    if (type === 'employees') {
      var users = res.data.data || res.data.users || res.data || [];
      if (!Array.isArray(users)) users = [];
      items = users.filter(function(u) { return u.is_active !== 0; }).map(function(u) {
        return { id: u.id, name: u.name || u.username, phone: u.phone || '', email: u.email || '', role: u.role || '', dept: '' };
      });
    } else {
      var clients = res.data.clients || res.data.data || [];
      if (!Array.isArray(clients)) clients = [];
      items = clients.map(function(c) {
        return { id: c.id, name: c.client_name || c.name, phone: c.mobile || c.phone || '', email: c.email || '', role: '', dept: c.client_type || '' };
      });
    }
    _recipientAllData = items;
    document.getElementById('recipientCountInfo').textContent = items.length + '명';
    renderRecipientList(items);
  }).catch(function(e) {
    document.getElementById('recipientList').innerHTML = '<div class="text-center py-8 text-red-500">목록 조회 실패</div>';
  });
}

function renderRecipientList(items) {
  var el = document.getElementById('recipientList');
  if (items.length === 0) {
    el.innerHTML = '<div class="text-center py-8 text-gray-400">결과 없음</div>';
    return;
  }
  var contactField = (bulkChannel === 'email') ? 'email' : 'phone';
  el.innerHTML = items.map(function(item) {
    var contact = item[contactField] || '';
    var isSelected = bulkSelectedRecipients.some(function(r) { return r.id === item.id; });
    var hasContact = !!contact;
    var disabledCls = hasContact ? '' : ' opacity-40';
    var checkedAttr = isSelected ? ' checked' : '';
    var disabledAttr = hasContact ? '' : ' disabled';
    var badge = item.role ? '<span class="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">' + item.role + '</span>' : '';
    if (item.dept) badge = '<span class="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">' + item.dept + '</span>';
    return '<label class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer border-b border-gray-50' + disabledCls + '">'
      + '<input type="checkbox" class="w-4 h-4 text-blue-600 rounded recipient-check" data-id="' + item.id + '" data-name="' + (item.name || '').replace(/"/g, '&quot;') + '" data-phone="' + (item.phone || '') + '" data-email="' + (item.email || '') + '"' + checkedAttr + disabledAttr + ' onchange="onRecipientCheck(this)">'
      + '<div class="flex-1 min-w-0">'
      + '<div class="flex items-center gap-2"><span class="text-sm font-medium text-gray-800">' + (item.name || '-') + '</span>' + badge + '</div>'
      + '<div class="text-xs text-gray-400">' + (contact || '연락처 없음') + '</div>'
      + '</div>'
      + '</label>';
  }).join('');
  updateRecipientSelectedCount();
}

function filterRecipients() {
  var keyword = document.getElementById('recipientSearch').value.trim().toLowerCase();
  if (!keyword) { renderRecipientList(_recipientAllData); return; }
  var filtered = _recipientAllData.filter(function(item) {
    return (item.name || '').toLowerCase().indexOf(keyword) > -1
      || (item.phone || '').indexOf(keyword) > -1
      || (item.email || '').toLowerCase().indexOf(keyword) > -1;
  });
  renderRecipientList(filtered);
}

function onRecipientCheck(checkbox) {
  var id = parseInt(checkbox.dataset.id);
  var name = checkbox.dataset.name;
  var phone = checkbox.dataset.phone;
  var email = checkbox.dataset.email;
  if (checkbox.checked) {
    if (!bulkSelectedRecipients.some(function(r) { return r.id === id; })) {
      bulkSelectedRecipients.push({ id: id, name: name, phone: phone, email: email });
    }
  } else {
    bulkSelectedRecipients = bulkSelectedRecipients.filter(function(r) { return r.id !== id; });
  }
  updateRecipientSelectedCount();
}

function toggleAllRecipients() {
  var checkboxes = document.querySelectorAll('.recipient-check:not(:disabled)');
  var allChecked = true;
  checkboxes.forEach(function(cb) { if (!cb.checked) allChecked = false; });
  checkboxes.forEach(function(cb) {
    cb.checked = !allChecked;
    onRecipientCheck(cb);
  });
}

function updateRecipientSelectedCount() {
  var el = document.getElementById('recipientSelectedCount');
  if (el) el.textContent = bulkSelectedRecipients.length + '명 선택됨';
  var toggleBtn = document.getElementById('recipientToggleAll');
  var checkboxes = document.querySelectorAll('.recipient-check:not(:disabled)');
  var allChecked = checkboxes.length > 0;
  checkboxes.forEach(function(cb) { if (!cb.checked) allChecked = false; });
  if (toggleBtn) toggleBtn.textContent = allChecked ? '전체 해제' : '전체 선택';
}

function closeRecipientPicker() {
  document.getElementById('recipientPickerModal').classList.add('hidden');
}

function confirmRecipientPicker() {
  closeRecipientPicker();
  var infoEl = document.getElementById('bulkTargetInfo');
  if (bulkSelectedRecipients.length > 0) {
    infoEl.textContent = bulkSelectedRecipients.length + '명 선택됨';
    infoEl.className = 'text-sm text-blue-600 mb-2';
  } else {
    infoEl.textContent = '선택된 수신자가 없습니다';
    infoEl.className = 'text-sm text-amber-600 mb-2';
  }
  renderSelectedTags();
  updateBulkSendLabel();
}

function renderSelectedTags() {
  var el = document.getElementById('bulkSelectedTags');
  if (!el) return;
  if (bulkSelectedRecipients.length === 0) { el.innerHTML = ''; return; }
  var maxShow = 10;
  var html = bulkSelectedRecipients.slice(0, maxShow).map(function(r) {
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">'
      + r.name
      + '<button onclick="removeSelectedRecipient(' + r.id + ')" class="text-blue-400 hover:text-blue-600">&times;</button>'
      + '</span>';
  }).join('');
  if (bulkSelectedRecipients.length > maxShow) {
    html += '<span class="text-xs text-gray-400">외 ' + (bulkSelectedRecipients.length - maxShow) + '명</span>';
  }
  el.innerHTML = html;
}

function removeSelectedRecipient(id) {
  bulkSelectedRecipients = bulkSelectedRecipients.filter(function(r) { return r.id !== id; });
  renderSelectedTags();
  var infoEl = document.getElementById('bulkTargetInfo');
  infoEl.textContent = bulkSelectedRecipients.length > 0 ? bulkSelectedRecipients.length + '명 선택됨' : '';
  updateBulkSendLabel();
}

function updateBulkSendLabel() {
  var chLabel = { kakao: '카카오톡', sms: '문자', email: '이메일' };
  document.getElementById('bulkSendLabel').textContent = (chLabel[bulkChannel] || '') + ' 발송';
  var sendBtn = document.getElementById('bulkSendBtn');
  var colors = { kakao: 'bg-blue-600 hover:bg-blue-700', sms: 'bg-green-600 hover:bg-green-700', email: 'bg-purple-600 hover:bg-purple-700' };
  sendBtn.className = 'px-6 py-2.5 text-white rounded-lg text-sm font-medium ' + (colors[bulkChannel] || 'bg-blue-600 hover:bg-blue-700');
}

function loadBulkTemplates() {
  if (bulkTemplatesCache.length > 0) { fillBulkTemplates(); return; }
  axios.get('/api/kakao/templates').then(function(res) {
    if (res.data.success) {
      bulkTemplatesCache = (res.data.data || []).filter(function(t) { return t.state === 'S' || t.state === '3'; });
      fillBulkTemplates();
    }
  }).catch(function() {});
}

function fillBulkTemplates() {
  var sel = document.getElementById('bulkTemplate');
  sel.innerHTML = '<option value="">템플릿 선택</option>' + bulkTemplatesCache.map(function(t) {
    return '<option value="' + t.templateCode + '">' + t.templateName + '</option>';
  }).join('');
}

function onBulkTemplateChange() {
  var code = document.getElementById('bulkTemplate').value;
  var tpl = bulkTemplatesCache.find(function(t) { return t.templateCode === code; });
  if (tpl) document.getElementById('bulkContent').value = tpl.template || '';
}

function updateBulkByteCounter() {
  if (bulkChannel !== 'sms') return;
  var content = document.getElementById('bulkContent').value;
  var bytes = 0;
  for (var i = 0; i < content.length; i++) bytes += content.charCodeAt(i) > 127 ? 2 : 1;
  var subject = document.getElementById('bulkSubject').value.trim();
  var isLms = bytes > 90 || subject.length > 0;
  document.getElementById('bulkChannelLabel').textContent = isLms ? 'LMS' : 'SMS';
  document.getElementById('bulkByteCounter').textContent = bytes + ' / ' + (isLms ? '2000' : '90') + ' byte';
}

// === 템플릿 관리 ===
var currentTplSubTab = 'kakao';

function switchTplSubTab(ch) {
  currentTplSubTab = ch;
  var tabs = [
    { key: 'kakao', id: 'tplSubKakao', panel: 'tplPanelKakao', active: 'bg-yellow-50 border border-yellow-400 text-yellow-800' },
    { key: 'sms', id: 'tplSubSms', panel: 'tplPanelSms', active: 'bg-green-50 border border-green-400 text-green-800' },
    { key: 'email', id: 'tplSubEmail', panel: 'tplPanelEmail', active: 'bg-purple-50 border border-purple-400 text-purple-800' },
    { key: 'fax', id: 'tplSubFax', panel: 'tplPanelFax', active: 'bg-gray-100 border border-gray-400 text-gray-800' }
  ];
  tabs.forEach(function(t) {
    var btn = document.getElementById(t.id);
    var panel = document.getElementById(t.panel);
    if (btn) btn.className = 'px-4 py-2 rounded-lg text-sm font-medium ' + (t.key === ch ? t.active : 'bg-white border border-gray-300 text-gray-600 hover:border-gray-400');
    if (panel) panel.classList.toggle('hidden', t.key !== ch);
  });
  if (ch === 'kakao') loadKakaoTemplates();
  else if (ch !== 'fax') loadDbTemplates(ch);
}

function loadKakaoTemplates() {
  var el = document.getElementById('kakaoTemplatesList');
  el.innerHTML = '<div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>';
  axios.get('/api/kakao/templates').then(function(res) {
    if (!res.data.success) {
      el.innerHTML = '<div class="text-center py-8 text-red-500">템플릿 조회 실패<br><span class="text-xs text-gray-500 mt-2 block">' + (res.data.error || '') + '</span></div>';
      return;
    }
    if (!res.data.data || res.data.data.length === 0) {
      el.innerHTML = '<div class="text-center py-8 text-gray-400">등록된 템플릿이 없습니다</div>';
      return;
    }
    el.innerHTML = res.data.data.map(function(t) {
      var stateBadge = (t.state === 'S' || t.state === '3') ? '<span class="rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-50 text-green-700">승인</span>'
        : t.state === 'R' ? '<span class="rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">검수중</span>'
        : '<span class="rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-50 text-red-700">반려</span>';
      return '<div class="bg-white rounded-lg shadow p-4">'
        + '<div class="flex items-center justify-between mb-2">'
        + '<div class="flex items-center gap-2"><span class="text-sm font-bold text-gray-800">' + (t.templateName || '') + '</span>' + stateBadge + '</div>'
        + '<span class="text-xs text-gray-400">코드: ' + t.templateCode + '</span></div>'
        + '<pre class="text-xs text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">' + (t.template || '') + '</pre>'
        + (t.btns && t.btns.length > 0 ? '<div class="mt-2 flex gap-1">' + t.btns.map(function(b) { return '<span class="text-xs bg-blue-50 text-blue-700 rounded px-2 py-0.5">' + b.n + '</span>'; }).join('') + '</div>' : '')
        + '</div>';
    }).join('');
  }).catch(function(err) {
    var detail = (err.response && err.response.data && err.response.data.error) || err.message || '';
    el.innerHTML = '<div class="text-center py-8 text-red-500">템플릿 조회 실패' + (detail ? '<br><span class="text-xs text-gray-500 mt-2 block">' + detail + '</span>' : '') + '</div>';
  });
}

function loadDbTemplates(channel) {
  var elId = channel + 'TemplatesList';
  var el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = '<div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>';
  axios.get('/api/message-templates', { params: { channel: channel } }).then(function(res) {
    var templates = res.data.data || [];
    if (templates.length === 0) {
      el.innerHTML = '<div class="text-center py-8 text-gray-400">등록된 템플릿이 없습니다. 새 템플릿을 추가해보세요.</div>';
      return;
    }
    el.innerHTML = templates.map(function(t) {
      return '<div class="bg-white rounded-lg shadow p-4">'
        + '<div class="flex items-center justify-between mb-2">'
        + '<span class="text-sm font-bold text-gray-800">' + t.name + '</span>'
        + '<div class="flex gap-2">'
        + '<button onclick="openTplEditor(\'' + channel + '\',' + t.id + ')" class="text-xs text-blue-600 hover:text-blue-800"><i class="fas fa-edit mr-1"></i>편집</button>'
        + '<button onclick="deleteTpl(' + t.id + ',\'' + channel + '\')" class="text-xs text-red-600 hover:text-red-800"><i class="fas fa-trash mr-1"></i>삭제</button>'
        + '</div></div>'
        + (t.subject ? '<div class="text-xs text-gray-500 mb-1">제목: ' + t.subject + '</div>' : '')
        + '<pre class="text-xs text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">' + t.content + '</pre>'
        + '</div>';
    }).join('');
  }).catch(function() {
    el.innerHTML = '<div class="text-center py-8 text-red-500">템플릿 조회 실패</div>';
  });
}

function openTplEditor(channel, id) {
  document.getElementById('tplEditChannel').value = channel;
  document.getElementById('tplEditId').value = id || '';
  document.getElementById('tplEditName').value = '';
  document.getElementById('tplEditSubject').value = '';
  document.getElementById('tplEditContent').value = '';
  document.getElementById('tplEditorTitle').textContent = id ? '템플릿 편집' : '새 템플릿';
  var subjectArea = document.getElementById('tplEditSubjectArea');
  if (channel === 'sms') subjectArea.classList.add('hidden');
  else subjectArea.classList.remove('hidden');

  if (id) {
    axios.get('/api/message-templates', { params: { channel: channel } }).then(function(res) {
      var tpl = (res.data.data || []).find(function(t) { return t.id === id; });
      if (tpl) {
        document.getElementById('tplEditName').value = tpl.name || '';
        document.getElementById('tplEditSubject').value = tpl.subject || '';
        document.getElementById('tplEditContent').value = tpl.content || '';
      }
    });
  }
  document.getElementById('tplEditorModal').classList.remove('hidden');
}

function closeTplEditor() {
  document.getElementById('tplEditorModal').classList.add('hidden');
}

async function saveTplEdit() {
  var channel = document.getElementById('tplEditChannel').value;
  var id = document.getElementById('tplEditId').value;
  var name = document.getElementById('tplEditName').value.trim();
  var subject = document.getElementById('tplEditSubject').value.trim();
  var content = document.getElementById('tplEditContent').value.trim();

  if (!name || !content) { showToast('이름과 내용은 필수입니다', 'warning'); return; }

  try {
    var payload = { channel: channel, name: name, content: content };
    if (subject) payload.subject = subject;
    var res;
    if (id) {
      res = await axios.patch('/api/message-templates/' + id, payload);
    } else {
      res = await axios.post('/api/message-templates', payload);
    }
    if (res.data.success) {
      showToast(id ? '템플릿이 수정되었습니다' : '템플릿이 생성되었습니다', 'success');
      closeTplEditor();
      loadDbTemplates(channel);
    } else {
      showToast(res.data.error || '저장 실패', 'error');
    }
  } catch(e) {
    showToast('저장 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function deleteTpl(id, channel) {
  if (!(await showConfirm('이 템플릿을 삭제하시겠습니까?'))) return;
  try {
    var res = await axios.delete('/api/message-templates/' + id);
    if (res.data.success) {
      showToast('템플릿이 삭제되었습니다', 'success');
      loadDbTemplates(channel);
    } else {
      showToast(res.data.error || '삭제 실패', 'error');
    }
  } catch(e) {
    showToast('삭제 오류', 'error');
  }
}

async function sendBulk() {
  var content = (bulkChannel === 'email' && bulkQuill) ? bulkQuill.root.innerHTML : document.getElementById('bulkContent').value.trim();
  if (!content || (bulkChannel === 'email' && bulkQuill && bulkQuill.getText().trim().length === 0)) { showToast('내용을 입력해주세요', 'warning'); return; }

  var templateCode = bulkChannel === 'kakao' ? document.getElementById('bulkTemplate').value : '';
  if (bulkChannel === 'kakao' && !templateCode) { showToast('카카오톡 템플릿을 선택해주세요', 'warning'); return; }

  var receivers = [];
  var contactField = (bulkChannel === 'email') ? 'email' : 'phone';

  if (bulkTarget === 'custom') {
    var lines = document.getElementById('bulkReceivers').value.trim().split('\n');
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(',');
      if (parts[0] && parts[0].trim()) {
        receivers.push({ num: parts[0].trim(), name: (parts[1] || '').trim() });
      }
    }
    if (receivers.length === 0) { showToast('수신자를 입력해주세요', 'warning'); return; }
  } else if (bulkTarget === 'employees' || bulkTarget === 'clients') {
    // 선택된 수신자 사용
    if (bulkSelectedRecipients.length === 0) {
      showToast('수신자를 선택해주세요. 직원/거래처 선택 버튼을 눌러주세요.', 'warning');
      return;
    }
    receivers = bulkSelectedRecipients.filter(function(r) { return !!r[contactField]; }).map(function(r) {
      return { num: r[contactField], name: r.name };
    });
    if (receivers.length === 0) {
      showToast('선택된 수신자 중 ' + (bulkChannel === 'email' ? '이메일' : '전화번호') + '이 있는 수신자가 없습니다.', 'warning');
      return;
    }
  }

  var chLabel = { kakao: '카카오톡', sms: '문자', email: '이메일' };
  var confirmMsg = receivers.length + '명에게 ' + chLabel[bulkChannel] + '을(를) 발송합니다.';
  if (!(await showConfirm(confirmMsg))) return;

  try {
    var payload = { channel: bulkChannel, target_type: 'custom', content: content, receivers: receivers };
    var subject = document.getElementById('bulkSubject') ? document.getElementById('bulkSubject').value.trim() : '';
    if (subject) payload.subject = subject;
    if (templateCode) payload.template_code = templateCode;

    // 예약 발송
    var scheduleToggle = document.getElementById('bulkScheduleToggle');
    if (scheduleToggle && scheduleToggle.checked && (bulkChannel === 'kakao' || bulkChannel === 'sms')) {
      var scheduleAt = document.getElementById('bulkScheduleAt').value;
      if (scheduleAt) payload.sndDT = scheduleAt.replace(/[-T:]/g, '').substring(0, 14);
    }

    var res = await axios.post('/api/messages/send-bulk', payload);
    if (res.data.success) {
      showToast('대량 발송 완료 (' + (res.data.data.receiver_count || res.data.data.sent_count || 0) + '건)', 'success');
      bulkSelectedRecipients = [];
      renderSelectedTags();
      switchMsgTab('history');
      loadLogs();
      loadSummary();
    } else {
      showToast(res.data.error || '발송 실패', 'error');
    }
  } catch(e) {
    showToast('발송 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// === 발송 통계 ===
var statsDays = 30;
var statDailyChart = null;
var statChannelChart = null;

function loadStats(days) {
  statsDays = days || statsDays || 30;
  // 기간 버튼 활성화
  [7, 30, 90].forEach(function(d) {
    var btn = document.getElementById('statsDays' + d);
    if (!btn) return;
    btn.className = 'px-3 py-1.5 rounded-lg text-xs font-medium ' + (d === statsDays ? 'bg-blue-50 border-2 border-blue-500 text-blue-700' : 'bg-white border border-gray-300 text-gray-600');
  });

  axios.get('/api/messages/stats', { params: { days: statsDays } }).then(function(res) {
    if (!res.data.success) return;
    var data = res.data.data;
    renderStatsSummary(data.summary);
    renderDailyChart(data.daily);
    renderChannelChart(data.byChannel);
    renderByType(data.byType);
    renderTopReceivers(data.topReceivers);
  }).catch(function(e) {
    console.error('stats error', e);
  });
}

function renderStatsSummary(s) {
  document.getElementById('statTotal').textContent = (s.total || 0).toLocaleString() + '건';
  document.getElementById('statSuccess').textContent = (s.success || 0).toLocaleString() + '건';
  document.getElementById('statFailed').textContent = (s.failed || 0).toLocaleString() + '건';
  var rate = s.total > 0 ? Math.round((s.success / s.total) * 100) : 0;
  document.getElementById('statRate').textContent = rate + '%';
}

function renderDailyChart(daily) {
  if (typeof Chart === 'undefined') {
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
    script.onload = function() { drawDailyChart(daily); drawChannelChartInner(null); };
    document.head.appendChild(script);
  } else {
    drawDailyChart(daily);
  }
}

function drawDailyChart(daily) {
  var labels = daily.map(function(d) { return d.date.substring(5); }); // MM-DD
  var successData = daily.map(function(d) { return d.success || 0; });
  var failedData = daily.map(function(d) { return d.failed || 0; });

  if (statDailyChart) statDailyChart.destroy();
  var ctx = document.getElementById('statDailyChart');
  if (!ctx) return;
  statDailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: '성공', data: successData, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4 },
        { label: '실패', data: failedData, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { stacked: true, beginAtZero: true, ticks: { font: { size: 10 } } }
      }
    }
  });
}

var _pendingChannelData = null;
function renderChannelChart(byChannel) {
  _pendingChannelData = byChannel;
  if (typeof Chart !== 'undefined') drawChannelChartInner(byChannel);
}

function drawChannelChartInner(byChannel) {
  byChannel = byChannel || _pendingChannelData;
  if (!byChannel) return;

  var channelLabels = { kakao: '카카오톡', sms: 'SMS', email: '이메일', fax: '팩스' };
  var channelColors = { kakao: '#facc15', sms: '#22c55e', email: '#a855f7', fax: '#6b7280' };
  var labels = byChannel.map(function(c) { return channelLabels[c.channel] || c.channel; });
  var data = byChannel.map(function(c) { return c.total || 0; });
  var colors = byChannel.map(function(c) { return channelColors[c.channel] || '#94a3b8'; });

  if (statChannelChart) statChannelChart.destroy();
  var ctx = document.getElementById('statChannelChart');
  if (!ctx) return;
  statChannelChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }
      }
    }
  });
}

function renderByType(byType) {
  var el = document.getElementById('statByType');
  if (!el) return;
  var typeLabels = { shipments: '출고 알림', tax_invoices: '세금계산서', ledger: '거래내역', orders: '주문 접수', payroll: '급여명세', direct: '직접 발송', purchase_orders: '발주서', quotations: '견적서' };
  if (byType.length === 0) { el.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">데이터 없음</div>'; return; }
  var maxVal = Math.max.apply(null, byType.map(function(t) { return t.total; }));
  el.innerHTML = byType.map(function(t) {
    var pct = maxVal > 0 ? Math.round((t.total / maxVal) * 100) : 0;
    return '<div class="flex items-center gap-3">'
      + '<span class="text-xs text-gray-600 w-20 flex-shrink-0">' + (typeLabels[t.type] || t.type) + '</span>'
      + '<div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden"><div class="bg-blue-500 h-full rounded-full" style="width:' + pct + '%"></div></div>'
      + '<span class="text-xs font-medium text-gray-700 w-10 text-right">' + t.total + '</span>'
      + '</div>';
  }).join('');
}

function renderTopReceivers(receivers) {
  var el = document.getElementById('statTopReceivers');
  if (!el) return;
  if (receivers.length === 0) { el.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">데이터 없음</div>'; return; }
  el.innerHTML = receivers.map(function(r, i) {
    return '<div class="flex items-center gap-3 py-1">'
      + '<span class="text-xs text-gray-400 w-5">' + (i + 1) + '</span>'
      + '<span class="text-sm font-medium text-gray-800 flex-1">' + (r.receiver_name || '-') + '</span>'
      + '<span class="text-xs text-gray-500">' + (r.receiver_num || '') + '</span>'
      + '<span class="text-xs font-medium text-blue-600 w-10 text-right">' + r.count + '건</span>'
      + '</div>';
  }).join('');
}
