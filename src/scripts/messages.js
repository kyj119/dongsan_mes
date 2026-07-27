// 메시지 관리 스크립트
var currentMsgTab = 'history';
var logsPage = 1;

// 거래처 수신자 배지용 client_type 라벨 — clients.js 표시 라벨과 동일 유지
function msgClientTypeLabel(t) {
  var m = { SALES: '매출', PURCHASE: '매입', BOTH: '매출+매입' };
  return m[t] || t;
}

(function init() {
  loadSummary();
  loadLogs();
})();

function switchMsgTab(tab) {
  currentMsgTab = tab;
  ['history', 'bulk', 'groups', 'templates', 'stats'].forEach(function(t) {
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
  if (tab === 'groups') loadContactGroups();
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

  // 안전 setter (ID 없으면 경고만 — silent fail 방지)
  var setMsg = function(id, val) {
    var el = document.getElementById(id);
    if (!el) { console.warn('[messages] #' + id + ' not found'); return; }
    el.textContent = val;
  };
  try {
    var balanceRes = await axios.get('/api/kakao/balance');
    if (balanceRes.data.success) {
      var b = balanceRes.data.data;
      // 통합 포인트 = 파트너(연동) 지갑. 법인 공통 단일 지갑이며 메시지+통장/계좌 조회 요금이 모두 여기서 차감됨.
      // 회원사 지갑(remain_point)은 동산기획 설정상 항상 0이라 표시하지 않음.
      setMsg('msgBalance', (b.partner_point || 0).toLocaleString() + '원');
      setMsg('msgPartnerPoint', '법인 공통 · 통장/계좌 조회 요금 공통 차감');
      // 발송 단가 — 부가세 별도
      setMsg('msgUcAlim', (b.unit_cost_alimtalk || 0).toLocaleString() + '원/건');
      setMsg('msgUcKkoImg', (b.unit_cost_kko_image || 0).toLocaleString() + '원/건');
      setMsg('msgUcSms', (b.unit_cost_sms || 0).toLocaleString() + '원/건');
      setMsg('msgUcLms', (b.unit_cost_lms || 0).toLocaleString() + '원/건');
      setMsg('msgUcMms', (b.unit_cost_mms || 0).toLocaleString() + '원/건');
      setMsg('msgUcFax', (b.unit_cost_fax || 0).toLocaleString() + '원/장');
    }
  } catch(e) {
    setMsg('msgBalance', '-');
    setMsg('msgUcAlim', '-');
    setMsg('msgUcKkoImg', '-');
    setMsg('msgUcSms', '-');
    setMsg('msgUcLms', '-');
    setMsg('msgUcMms', '-');
    setMsg('msgUcFax', '-');
  }

  try {
    var today = window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10);
    var logsRes = await axios.get('/api/kakao/logs', { params: { date_from: today, date_to: today, limit: 1 } });
    if (logsRes.data.success) {
      document.getElementById('msgTodayCount').textContent = (logsRes.data.data.pagination.total || 0) + '건';
    }
  } catch(e) {}
}

// #466: 발송 단가는 기본 정적 상수(/balance) 표시 — 라이브 SOAP 재조회는 이 버튼에만 배선.
async function refreshUnitCost() {
  var setMsg = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
  var btn = document.getElementById('msgUcRefreshBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    var res = await axios.get('/api/kakao/unit-cost');
    if (res.data.success) {
      var b = res.data.data;
      setMsg('msgUcAlim', (b.unit_cost_alimtalk || 0).toLocaleString() + '원/건');
      setMsg('msgUcKkoImg', (b.unit_cost_kko_image || 0).toLocaleString() + '원/건');
      setMsg('msgUcSms', (b.unit_cost_sms || 0).toLocaleString() + '원/건');
      setMsg('msgUcLms', (b.unit_cost_lms || 0).toLocaleString() + '원/건');
      setMsg('msgUcMms', (b.unit_cost_mms || 0).toLocaleString() + '원/건');
      setMsg('msgUcFax', (b.unit_cost_fax || 0).toLocaleString() + '원/장');
      if (typeof showToast === 'function') showToast('발송 단가를 바로빌에서 갱신했습니다.', 'success');
    }
  } catch(e) {
    if (typeof showToast === 'function') showToast('단가 조회 실패', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i>'; }
  }
}
window.refreshUnitCost = refreshUnitCost;

async function loadLogs(page) {
  logsPage = page || 1;
  var params = { page: logsPage, limit: 30 };
  var search = document.getElementById('logSearch').value.trim();
  var channel = document.getElementById('logChannel').value;
  var status = document.getElementById('logStatus').value;
  if (search) params.search = search;
  if (channel) params.channel = channel;
  if (status) params.status = status;
  // #353: 발송일 범위 필터 (라우트 date_from/date_to 기구현)
  var dfEl = document.getElementById('logDateFrom');
  var dtEl = document.getElementById('logDateTo');
  if (dfEl && dfEl.value) params.date_from = dfEl.value;
  if (dtEl && dtEl.value) params.date_to = dtEl.value;

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
      var map = { kakao: '<i class="fas fa-comment text-yellow-500"></i>', sms: '<i class="fas fa-sms text-green-500"></i>', mms: '<i class="fas fa-image text-teal-500" title="MMS"></i>', email: '<i class="fas fa-envelope text-purple-500"></i>', fax: '<i class="fas fa-fax text-gray-500"></i>' };
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
        + '<td class="px-4 py-3 text-sm font-medium text-gray-900" title="' + escapeHtml(log.receiver_name || '') + '">' + escapeHtml(log.receiver_name || '-') + '</td>'
        + '<td class="px-4 py-3 text-sm text-gray-600">' + (log.receiver_num || '-') + '</td>'
        + '<td class="px-4 py-3 text-sm text-gray-500">' + typeLabel(log.related_type) + '</td>'
        + '<td class="px-4 py-3 text-center">' + statusBadge(log.status) + '</td>'
        + '<td class="px-4 py-3 text-center"><button onclick="viewLogDetail(\'' + (log.receipt_num || '') + '\',\'' + (log.channel || 'kakao') + '\')" class="text-blue-600 hover:text-blue-800 text-xs"><i class="fas fa-eye"></i></button></td>'
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

async function viewLogDetail(receiptNum, channel) {
  var el = document.getElementById('logDetailContent');
  document.getElementById('logDetailModal').classList.remove('hidden');

  if (!receiptNum) {
    el.innerHTML = '<div class="text-center py-4 text-gray-500">접수번호가 없는 발송 건입니다.<br><span class="text-xs text-gray-400">발송 상세 조회를 할 수 없습니다.</span></div>';
    return;
  }

  el.innerHTML = '<div class="text-center py-4 text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>조회 중...</div>';

  try {
    // 채널별 조회 API가 다름(알림톡=GetSendKakaotalk, 문자=GetSMSSendMessage) → 서버에 채널 전달
    var qs = (channel === 'sms' || channel === 'mms') ? '?channel=' + channel : '';
    var res = await axios.get('/api/kakao/logs/' + encodeURIComponent(receiptNum) + '/status' + qs);
    if (res.data.success) {
      var d = res.data.data || {};

      // 문자(SMS/LMS/MMS) 응답: SMSMessage 단건(SendKey/SenderNum/ReceiverNum/SendState/Message)
      if ((channel === 'sms' || channel === 'mms') || (d.SendKey && d.SendState !== undefined)) {
        if (!d.SendKey) {
          el.innerHTML = '<div class="text-center py-4 text-gray-500">결과 정보가 없습니다.<br><span class="text-xs text-gray-400">접수번호: ' + escapeHtml(receiptNum) + '</span></div>';
          return;
        }
        var smsState = { '0': { label: '대기', color: 'blue' }, '1': { label: '전송중', color: 'blue' }, '2': { label: '성공', color: 'green' }, '3': { label: '실패', color: 'red' } };
        var ss = smsState[String(d.SendState)] || { label: '상태 ' + d.SendState, color: 'gray' };
        el.innerHTML = '<div class="mb-3 p-3 bg-gray-50 rounded-lg"><div class="text-xs text-gray-500">접수번호</div><div class="font-mono text-sm">' + escapeHtml(receiptNum) + '</div></div>'
          + '<div class="space-y-2 text-sm">'
          + '<div class="flex justify-between"><span class="text-gray-500">전송 상태</span><span class="px-2 py-0.5 rounded text-xs font-medium bg-' + ss.color + '-50 text-' + ss.color + '-700">' + ss.label + '</span></div>'
          + '<div class="flex justify-between"><span class="text-gray-500">발신번호</span><span>' + escapeHtml(d.SenderNum || '-') + '</span></div>'
          + '<div class="flex justify-between"><span class="text-gray-500">수신번호</span><span>' + escapeHtml(d.ReceiverNum || '-') + '</span></div>'
          + '<div class="flex justify-between"><span class="text-gray-500">발송일시</span><span>' + escapeHtml(d.SendDT || '-') + '</span></div>'
          + '</div>'
          + '<div class="mt-3 p-3 bg-gray-50 rounded-lg"><div class="text-xs text-gray-500 mb-1">내용</div><div class="text-sm whitespace-pre-wrap">' + escapeHtml(d.Message || '') + '</div></div>';
        return;
      }

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
        html += '<span class="font-medium">' + escapeHtml(msg.receiveNum || msg.rcv || '-') + ' ' + escapeHtml(msg.receiveName || msg.rcvnm || '') + '</span>';
        html += '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-' + st.color + '-50 text-' + st.color + '-700">' + st.label + '</span>';
        html += '</div>';
        if (msg.resultMessage || msg.resultCode) html += '<div class="text-xs text-gray-500">결과: ' + escapeHtml(msg.resultMessage || '') + ' (코드: ' + escapeHtml(msg.resultCode || '') + ')</div>';
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
    { key: 'mms', id: 'bulkChMms', active: 'bg-teal-50 border-2 border-teal-500 text-teal-700' },
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
  var imageArea = document.getElementById('bulkImageArea');
  if (imageArea) imageArea.classList.toggle('hidden', ch !== 'mms');

  if (ch === 'mms') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    byteCounter.classList.remove('hidden');
    channelLabel.textContent = 'MMS';
    channelLabel.className = 'text-xs text-teal-600 font-medium';
    updateBulkByteCounter();
  } else if (ch === 'kakao') {
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
  if (scheduleArea) scheduleArea.classList.toggle('hidden', ch !== 'kakao' && ch !== 'sms' && ch !== 'mms');

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
    document.getElementById('bulkScheduleAt').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
}

var bulkSelectedRecipients = []; // 선택 수신자 영구 보관소 { id, name, phone, email } — 재검색/재렌더에도 선택 유지(렌더 시 checked 복원)
var _recipientPickerType = '';
var _recipientAllData = [];        // 직원용 인메모리 목록 (직원은 소수 → 클라 필터). 거래처는 서버검색이라 미사용
var _recipientSearchTimer = null;  // 거래처 서버검색 디바운스 타이머
var _recipientSearchSeq = 0;       // 거래처 서버검색 순번 (out-of-order 응답 무시)

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
// forGroup=true면 대량발송 수신자가 아니라 '현재 그룹에 멤버 추가' 용도로 동작한다.
// 이때 대량발송 선택 상태를 건드리면 안 되므로 백업 후 복원한다.
var _recipientForGroup = false;
var _recipientBulkBackup = null;

function openRecipientPicker(type, forGroup) {
  _recipientPickerType = type;
  _recipientForGroup = !!forGroup;
  if (_recipientForGroup) {
    if (!msgCurrentGroupId) { showToast('먼저 그룹을 선택해주세요', 'warning'); return; }
    _recipientBulkBackup = bulkSelectedRecipients;
    bulkSelectedRecipients = [];
  } else {
    bulkTarget = type;
    setBulkTarget(type);
  }

  document.getElementById('recipientPickerTitle').textContent = _recipientForGroup ? '그룹에 거래처 추가'
    : (type === 'employees' ? '직원 선택' : '거래처 선택');
  var searchEl = document.getElementById('recipientSearch');
  if (searchEl) {
    searchEl.value = '';
    searchEl.placeholder = type === 'employees' ? '이름/전화번호 검색' : '거래처명/코드/연락처 검색';
  }
  document.getElementById('recipientList').innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>';
  document.getElementById('recipientPickerModal').classList.remove('hidden');
  // 직원 전환 시 이전 거래처 검색 디바운스가 늦게 발화하지 않도록 정리
  if (_recipientSearchTimer) { clearTimeout(_recipientSearchTimer); _recipientSearchTimer = null; }

  if (type === 'employees') {
    // 직원: 소수 → 전체 로드 후 인메모리 필터 (기존 동작 유지)
    axios.get('/api/users').then(function(res) {
      var users = res.data.data || res.data.users || res.data || [];
      if (!Array.isArray(users)) users = [];
      var items = users.filter(function(u) { return u.is_active !== 0; }).map(function(u) {
        return { id: u.id, name: u.name || u.username, phone: u.phone || '', email: u.email || '', role: u.role || '', dept: '' };
      });
      _recipientAllData = items;
      document.getElementById('recipientCountInfo').textContent = items.length + '명';
      renderRecipientList(items);
    }).catch(function(e) {
      document.getElementById('recipientList').innerHTML = '<div class="text-center py-8 text-red-500">목록 조회 실패</div>';
    });
  } else {
    // 거래처: 3,700+ 건 → 서버검색형. 초기 100건 로드 + 검색어 입력 시 전체에서 조회
    _recipientAllData = [];
    searchRecipientClients('');
  }
}

// 거래처 서버검색 — 페이지당 200건(clients API 상한)씩 누적 로드.
//   예전엔 100건 한 페이지만 불러와 3,700+ 거래처 중 100곳만 보였다(그룹 담기가 사실상 불가).
//   현재: '더 보기'로 이어 담고, '검색 결과 전체'로 조건에 맞는 전부를 한 번에 선택한다.
var RECIPIENT_PAGE_SIZE = 200;
var _recipientPage = 1;
var _recipientKeyword = '';
var _recipientTotal = 0;

function searchRecipientClients(keyword, append) {
  var seq = ++_recipientSearchSeq;
  var listEl = document.getElementById('recipientList');
  var hintEl = document.getElementById('recipientCountInfo');
  if (!append) { _recipientPage = 1; _recipientKeyword = keyword || ''; _recipientAllData = []; }

  axios.get('/api/clients', { params: { search: _recipientKeyword, limit: RECIPIENT_PAGE_SIZE, page: _recipientPage } }).then(function(res) {
    if (seq !== _recipientSearchSeq) return; // 늦게 도착한 이전 검색 응답 폐기
    var clients = (res.data.data && res.data.data.clients) ? res.data.data.clients : (res.data.data || []);
    if (!Array.isArray(clients)) clients = [];
    var items = clients.map(function(c) {
      return { id: c.id, name: c.client_name || c.name, phone: c.mobile || c.phone || '', email: c.email || '', role: '', dept: c.client_type || '' };
    });
    _recipientAllData = append ? _recipientAllData.concat(items) : items;
    _recipientTotal = (res.data.data && res.data.data.pagination) ? res.data.data.pagination.total : _recipientAllData.length;
    if (hintEl) {
      hintEl.textContent = '전체 ' + _recipientTotal + '곳 중 ' + _recipientAllData.length + '곳 불러옴'
        + (_recipientKeyword ? ' (검색: ' + _recipientKeyword + ')' : '');
    }
    var selectAllBtn = document.getElementById('recipientSelectAllServer');
    if (selectAllBtn) {
      selectAllBtn.classList.toggle('hidden', _recipientTotal <= _recipientAllData.length);
      selectAllBtn.textContent = '검색 결과 전체 선택 (' + _recipientTotal + ')';
    }
    renderRecipientList(_recipientAllData);
  }).catch(function(e) {
    if (seq !== _recipientSearchSeq) return;
    listEl.innerHTML = '<div class="text-center py-8 text-red-500">목록 조회 실패</div>';
  });
}

// '더 보기' — 다음 페이지를 이어 붙인다
function loadMoreRecipients() {
  _recipientPage += 1;
  searchRecipientClients(_recipientKeyword, true);
}

// '검색 결과 전체 선택' — 현재 검색 조건의 모든 페이지를 받아 전부 선택.
// 수천 건이 한 번에 잡힐 수 있어 진행 상태를 보여주고, 완료 후 인원수를 알린다.
async function selectAllServerRecipients() {
  var btn = document.getElementById('recipientSelectAllServer');
  var hintEl = document.getElementById('recipientCountInfo');
  if (btn) { btn.disabled = true; btn.textContent = '불러오는 중...'; }
  try {
    var page = 1, all = [], total = 0;
    while (true) {
      var res = await axios.get('/api/clients', { params: { search: _recipientKeyword, limit: RECIPIENT_PAGE_SIZE, page: page } });
      var d = res.data.data || {};
      var rows = d.clients || d || [];
      if (!Array.isArray(rows)) rows = [];
      total = (d.pagination && d.pagination.total) || rows.length;
      all = all.concat(rows.map(function(c) {
        return { id: c.id, name: c.client_name || c.name, phone: c.mobile || c.phone || '', email: c.email || '', role: '', dept: c.client_type || '' };
      }));
      if (all.length >= total || rows.length === 0) break;
      page += 1;
      if (hintEl) hintEl.textContent = '불러오는 중... ' + all.length + ' / ' + total;
    }
    _recipientAllData = all;
    _recipientTotal = total;
    _recipientPage = page;

    // 그룹 담기 모드에선 연락처 없는 곳도 멤버가 될 수 있다(채널 무관 그룹)
    var requireContact = !_recipientForGroup;
    var contactField = (bulkChannel === 'email') ? 'email' : 'phone';
    var picked = all.filter(function(r) { return requireContact ? !!r[contactField] : true; });
    picked.forEach(function(r) {
      if (!bulkSelectedRecipients.some(function(x) { return x.id === r.id; })) {
        bulkSelectedRecipients.push({ id: r.id, name: r.name, phone: r.phone, email: r.email });
      }
    });
    renderRecipientList(_recipientAllData);
    if (hintEl) hintEl.textContent = '전체 ' + total + '곳 불러옴 · ' + picked.length + '곳 선택'
      + (requireContact && all.length > picked.length ? ' (연락처 없는 ' + (all.length - picked.length) + '곳 제외)' : '');
  } catch (e) {
    showToast('전체 불러오기 실패', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.add('hidden'); }
  }
}

function renderRecipientList(items) {
  var el = document.getElementById('recipientList');
  if (items.length === 0) {
    el.innerHTML = '<div class="text-center py-8 text-gray-400">결과 없음</div>';
    return;
  }
  var contactField = (bulkChannel === 'email') ? 'email' : 'phone';
  // 그룹 담기 모드에선 연락처가 없어도 멤버가 될 수 있다(그룹은 채널 무관).
  // 발송 대상에서 빠지는 건 그룹 상세·대량발송 총액에서 따로 경고한다.
  var requireContact = !_recipientForGroup;
  el.innerHTML = items.map(function(item) {
    var contact = item[contactField] || '';
    var isSelected = bulkSelectedRecipients.some(function(r) { return r.id === item.id; });
    var hasContact = !!contact || !requireContact;
    var disabledCls = hasContact ? '' : ' opacity-40';
    var checkedAttr = isSelected ? ' checked' : '';
    var disabledAttr = hasContact ? '' : ' disabled';
    var badge = item.role ? '<span class="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">' + escapeHtml((window.ROLE_NAMES && window.ROLE_NAMES[item.role]) || item.role) + '</span>' : '';
    if (item.dept) badge = '<span class="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">' + escapeHtml(msgClientTypeLabel(item.dept)) + '</span>';
    return '<label class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer border-b border-gray-50' + disabledCls + '">'
      + '<input type="checkbox" class="w-4 h-4 text-blue-600 rounded recipient-check" data-id="' + item.id + '" data-name="' + escapeHtml(item.name || '') + '" data-phone="' + escapeHtml(item.phone || '') + '" data-email="' + escapeHtml(item.email || '') + '"' + checkedAttr + disabledAttr + ' onchange="onRecipientCheck(this)">'
      + '<div class="flex-1 min-w-0">'
      + '<div class="flex items-center gap-2"><span class="text-sm font-medium text-gray-800">' + escapeHtml(item.name || '-') + '</span>' + badge + '</div>'
      + '<div class="text-xs text-gray-400">' + (contact ? escapeHtml(contact) : '연락처 없음') + '</div>'
      + '</div>'
      + '</label>';
  }).join('');

  // 더 보기 — 서버에 남은 거래처가 있을 때만
  if (_recipientPickerType === 'clients' && _recipientTotal > items.length) {
    el.innerHTML += '<button onclick="loadMoreRecipients()" class="w-full mt-2 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">'
      + '<i class="fas fa-chevron-down mr-1"></i>더 보기 (' + items.length + ' / ' + _recipientTotal + ')</button>';
  }
  updateRecipientSelectedCount();
}

function filterRecipients() {
  var searchEl = document.getElementById('recipientSearch');
  var keyword = searchEl ? searchEl.value.trim() : '';

  if (_recipientPickerType === 'clients') {
    // 거래처: 서버검색 (디바운스 280ms) — 3,700+ 거래처 전체 대상
    if (_recipientSearchTimer) clearTimeout(_recipientSearchTimer);
    _recipientSearchTimer = setTimeout(function() { searchRecipientClients(keyword); }, 280);
    return;
  }

  // 직원: 인메모리 필터 (기존 동작)
  var lower = keyword.toLowerCase();
  if (!lower) { renderRecipientList(_recipientAllData); return; }
  var filtered = _recipientAllData.filter(function(item) {
    return (item.name || '').toLowerCase().indexOf(lower) > -1
      || (item.phone || '').indexOf(lower) > -1
      || (item.email || '').toLowerCase().indexOf(lower) > -1;
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
  // 그룹 추가 모드에서 취소/닫기 → 대량발송 선택 상태 원복
  if (_recipientForGroup) {
    bulkSelectedRecipients = _recipientBulkBackup || [];
    _recipientBulkBackup = null;
    _recipientForGroup = false;
  }
}

async function confirmRecipientPicker() {
  // 그룹 멤버 추가 모드
  if (_recipientForGroup) {
    var picked = bulkSelectedRecipients.slice();
    var groupId = msgCurrentGroupId;
    closeRecipientPicker();   // 여기서 백업 복원 + 모드 해제
    if (!groupId || picked.length === 0) return;
    try {
      await axios.post('/api/contact-groups/' + groupId + '/members', {
        members: picked.map(function(p) { return { member_type: 'CLIENT', member_id: p.id }; })
      });
      await loadContactGroups(true);
      showToast(picked.length + '곳을 그룹에 추가했습니다', 'success');
    } catch (e) {
      showToast((e.response && e.response.data && e.response.data.error) || '그룹 추가 실패', 'error');
    }
    return;
  }

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
      + escapeHtml(r.name || '')
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

// 현재 채널에서 실제로 발송 가능한(연락처가 있는) 수신자만 — 비용 계산·발송 payload 공통 기준
function bulkEffectiveRecipients() {
  var field = (bulkChannel === 'email') ? 'email' : 'phone';
  return bulkSelectedRecipients.filter(function(r) { return !!r[field]; });
}

function updateBulkSendLabel() {
  var chLabel = { kakao: '카카오톡', sms: '문자', mms: 'MMS', email: '이메일' };
  document.getElementById('bulkSendLabel').textContent = (chLabel[bulkChannel] || '') + ' 발송';
  var sendBtn = document.getElementById('bulkSendBtn');
  var colors = { kakao: 'bg-blue-600 hover:bg-blue-700', sms: 'bg-green-600 hover:bg-green-700', mms: 'bg-teal-600 hover:bg-teal-700', email: 'bg-purple-600 hover:bg-purple-700' };
  sendBtn.className = 'px-6 py-2.5 text-white rounded-lg text-sm font-medium ' + (colors[bulkChannel] || 'bg-blue-600 hover:bg-blue-700');

  // 예상 비용 — MMS(100원/건)는 실수 한 번의 금액이 커서 항상 눈에 보이게 둔다.
  // ⚠️ 연락처가 없는 수신자는 실제 발송에서 빠지므로 비용 계산에서도 빼야 한다(과대표시 방지).
  var costEl = document.getElementById('bulkCostInfo');
  if (!costEl) return;
  var unit = { kakao: 7, sms: 15, mms: 100, email: 0 }[bulkChannel];
  var eff = bulkEffectiveRecipients();
  var skipped = bulkSelectedRecipients.length - eff.length;
  if (eff.length === 0) { costEl.textContent = ''; return; }
  var suffix = skipped > 0 ? ' <span class="text-amber-600">· 연락처 없음 ' + skipped + '명 제외</span>' : '';
  if (!unit) { costEl.innerHTML = '발송 대상 <b>' + eff.length + '명</b>' + suffix; return; }
  costEl.innerHTML = '예상 비용 <b class="' + (bulkChannel === 'mms' ? 'text-teal-700' : 'text-gray-700') + '">'
    + eff.length + '명 × ' + unit + '원 = ' + (eff.length * unit).toLocaleString() + '원</b> <span class="text-gray-400">(부가세 별도)</span>' + suffix;
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
  if (bulkChannel !== 'sms' && bulkChannel !== 'mms') return;
  var content = document.getElementById('bulkContent').value;
  var bytes = 0;
  for (var i = 0; i < content.length; i++) bytes += content.charCodeAt(i) > 127 ? 2 : 1;
  // MMS는 항상 장문 규격(2000byte) — SMS/LMS 자동전환 라벨을 덮어쓰지 않는다
  if (bulkChannel === 'mms') {
    document.getElementById('bulkChannelLabel').textContent = 'MMS';
    document.getElementById('bulkByteCounter').textContent = bytes + ' / 2000 byte';
    return;
  }
  var subject = document.getElementById('bulkSubject').value.trim();
  var isLms = bytes > 90 || subject.length > 0;
  document.getElementById('bulkChannelLabel').textContent = isLms ? 'LMS' : 'SMS';
  document.getElementById('bulkByteCounter').textContent = bytes + ' / ' + (isLms ? '2000' : '90') + ' byte';
}

// === MMS 대량발송: 이미지 첨부 (압축 규칙은 shell.js 단일 소스 재사용) ===
var bulkImageB64 = null;

function onBulkImagePick(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var infoEl = document.getElementById('bulkImageInfo');
  infoEl.textContent = '이미지 처리 중...';
  var reader = new FileReader();
  reader.onload = async function(e) {
    var compressed = await window.compressImageForMms(e.target.result);
    if (!compressed) {
      bulkImageB64 = null;
      infoEl.textContent = '이미지 처리 실패 (다른 파일을 사용해주세요)';
      updateBulkSendLabel();
      return;
    }
    bulkImageB64 = compressed.slice(compressed.indexOf('base64,') + 7);
    var kb = Math.round(window.mmsImageBytes(bulkImageB64) / 1024);
    infoEl.textContent = file.name + ' · ' + kb + 'KB';
    var prev = document.getElementById('bulkImagePreview');
    prev.src = compressed; prev.classList.remove('hidden');
    document.getElementById('bulkImageClearBtn').classList.remove('hidden');
    updateBulkSendLabel();
  };
  reader.readAsDataURL(file);
}

function clearBulkImage() {
  bulkImageB64 = null;
  var f = document.getElementById('bulkImageFile'); if (f) f.value = '';
  document.getElementById('bulkImageInfo').textContent = '선택된 이미지 없음';
  document.getElementById('bulkImagePreview').classList.add('hidden');
  document.getElementById('bulkImageClearBtn').classList.add('hidden');
  updateBulkSendLabel();
}

// ===========================================================================
// === 연락처 그룹 (정적) — 만들어두고 대량발송에서 골라 쓴다 ===
// 멤버는 참조만 저장하므로 거래처 연락처가 바뀌어도 그룹은 손댈 필요 없다.
// ===========================================================================
var msgGroups = [];
var msgCurrentGroupId = null;
var msgGroupEditorId = null;   // null=신규, 숫자=수정

async function loadContactGroups(keepSelection) {
  try {
    var res = await axios.get('/api/contact-groups');
    msgGroups = res.data.data || [];
  } catch (e) {
    msgGroups = [];
    showToast('그룹 목록 조회 실패', 'error');
  }
  var el = document.getElementById('groupList');
  if (!el) { console.warn('[messages] #groupList not found'); return; }
  if (msgGroups.length === 0) {
    el.innerHTML = '<div class="text-center py-6 text-sm text-gray-400">등록된 그룹이 없습니다.<br>오른쪽 위 <b>새 그룹</b>으로 만들어보세요.</div>';
  } else {
    el.innerHTML = msgGroups.map(function(g) {
      var active = g.id === msgCurrentGroupId;
      return '<button onclick="selectContactGroup(' + g.id + ')" class="w-full text-left px-3 py-2 rounded-lg text-sm '
        + (active ? 'bg-blue-50 border border-blue-300 text-blue-800' : 'hover:bg-gray-50 border border-transparent text-gray-700') + '">'
        + '<div class="flex items-center justify-between"><span class="font-medium truncate">' + escapeHtml(g.name) + '</span>'
        + '<span class="text-xs text-gray-400 ml-2 whitespace-nowrap">' + (g.member_count || 0) + '명</span></div>'
        + (g.description ? '<div class="text-xs text-gray-400 truncate">' + escapeHtml(g.description) + '</div>' : '')
        + '</button>';
    }).join('');
  }
  if (keepSelection && msgCurrentGroupId) selectContactGroup(msgCurrentGroupId);
}

async function selectContactGroup(groupId) {
  msgCurrentGroupId = groupId;
  var g = msgGroups.find(function(x) { return x.id === groupId; });
  document.getElementById('groupDetailName').textContent = g ? g.name : '';
  document.getElementById('groupDetailDesc').textContent = g && g.description ? g.description : '';
  document.getElementById('groupDetailActions').classList.remove('hidden');
  loadContactGroups(false);   // 선택 하이라이트 갱신 (재귀 방지: keepSelection=false)

  var body = document.getElementById('groupMemberBody');
  body.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-gray-400"><i class="fas fa-spinner fa-spin"></i></td></tr>';
  try {
    var res = await axios.get('/api/contact-groups/' + groupId + '/members');
    var d = res.data.data || { members: [] };
    var warn = document.getElementById('groupMemberWarn');
    var warns = [];
    if (d.missing_phone > 0) warns.push('연락처가 없는 멤버 ' + d.missing_phone + '명은 문자·알림톡 발송 대상에서 자동 제외됩니다.');
    if (d.orphan_count > 0) warns.push('삭제되었거나 조회되지 않는 거래처 ' + d.orphan_count + '건이 그룹에 남아 있습니다(발송 대상 아님). 목록의 인원수와 실제 대상 수가 다를 수 있습니다.');
    if (warns.length > 0) {
      warn.innerHTML = warns.join('<br>');
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
    if (d.members.length === 0) {
      body.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-sm text-gray-400">멤버가 없습니다. <b>거래처 추가</b>로 담아보세요.</td></tr>';
      return;
    }
    body.innerHTML = d.members.map(function(m) {
      return '<tr class="border-b border-gray-100">'
        + '<td class="px-3 py-2 text-sm">' + escapeHtml(m.name || '') + '</td>'
        + '<td class="px-3 py-2 text-sm ' + (m.phone ? 'text-gray-600' : 'text-amber-600') + '">' + escapeHtml(m.phone || '연락처 없음') + '</td>'
        + '<td class="px-3 py-2 text-sm text-gray-500">' + escapeHtml(m.email || '-') + '</td>'
        + '<td class="px-3 py-2 text-center"><button onclick="removeGroupMember(\'' + m.member_type + '\',' + m.member_id + ')" class="text-gray-400 hover:text-red-600 text-xs"><i class="fas fa-times"></i></button></td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-sm text-red-500">멤버 조회 실패</td></tr>';
  }
}

function openGroupEditor(groupId) {
  msgGroupEditorId = groupId || null;
  var g = groupId ? msgGroups.find(function(x) { return x.id === groupId; }) : null;
  document.getElementById('groupEditorTitle').textContent = g ? '그룹 수정' : '새 그룹';
  document.getElementById('groupEditorName').value = g ? g.name : '';
  document.getElementById('groupEditorDesc').value = g && g.description ? g.description : '';
  document.getElementById('groupEditorModal').classList.remove('hidden');
}

function closeGroupEditor() {
  document.getElementById('groupEditorModal').classList.add('hidden');
}

function editCurrentGroup() {
  if (!msgCurrentGroupId) return;
  openGroupEditor(msgCurrentGroupId);
}

async function saveGroupEditor() {
  var name = document.getElementById('groupEditorName').value.trim();
  var desc = document.getElementById('groupEditorDesc').value.trim();
  if (!name) { showToast('그룹명을 입력해주세요', 'warning'); return; }
  try {
    if (msgGroupEditorId) {
      await axios.patch('/api/contact-groups/' + msgGroupEditorId, { name: name, description: desc });
    } else {
      var res = await axios.post('/api/contact-groups', { name: name, description: desc });
      msgCurrentGroupId = res.data.data.id;
    }
    closeGroupEditor();
    await loadContactGroups(true);
    showToast('저장되었습니다', 'success');
  } catch (e) {
    showToast((e.response && e.response.data && e.response.data.error) || '저장 실패', 'error');
  }
}

async function deleteCurrentGroup() {
  if (!msgCurrentGroupId) return;
  var g = msgGroups.find(function(x) { return x.id === msgCurrentGroupId; });
  if (!(await showConfirm('그룹 "' + (g ? g.name : '') + '"을(를) 삭제합니다.\n(거래처 자체는 삭제되지 않습니다)'))) return;
  try {
    await axios.delete('/api/contact-groups/' + msgCurrentGroupId);
    msgCurrentGroupId = null;
    document.getElementById('groupDetailName').textContent = '그룹을 선택하세요';
    document.getElementById('groupDetailDesc').textContent = '';
    document.getElementById('groupDetailActions').classList.add('hidden');
    document.getElementById('groupMemberBody').innerHTML = '';
    await loadContactGroups(false);
    showToast('삭제되었습니다', 'success');
  } catch (e) {
    showToast('삭제 실패', 'error');
  }
}

async function removeGroupMember(memberType, memberId) {
  if (!msgCurrentGroupId) return;
  try {
    await axios.delete('/api/contact-groups/' + msgCurrentGroupId + '/members/' + memberType + '/' + memberId);
    await loadContactGroups(true);
  } catch (e) {
    showToast('제거 실패', 'error');
  }
}

// === 대량발송: 그룹으로 수신자 채우기 ===
async function openGroupPicker() {
  document.getElementById('groupPickerModal').classList.remove('hidden');
  var el = document.getElementById('groupPickerList');
  el.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>';
  try {
    var res = await axios.get('/api/contact-groups');
    msgGroups = res.data.data || [];
    if (msgGroups.length === 0) {
      el.innerHTML = '<div class="text-center py-8 text-sm text-gray-400">등록된 그룹이 없습니다.<br><b>그룹 관리</b> 탭에서 먼저 만들어주세요.</div>';
      return;
    }
    el.innerHTML = msgGroups.map(function(g) {
      return '<button onclick="applyGroupToBulk(' + g.id + ')" class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 border border-gray-200 mb-1.5">'
        + '<div class="flex items-center justify-between"><span class="text-sm font-medium text-gray-800">' + escapeHtml(g.name) + '</span>'
        + '<span class="text-xs text-gray-500">' + (g.member_count || 0) + '명</span></div>'
        + (g.description ? '<div class="text-xs text-gray-400">' + escapeHtml(g.description) + '</div>' : '')
        + '</button>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div class="text-center py-8 text-sm text-red-500">그룹 조회 실패</div>';
  }
}

function closeGroupPicker() {
  document.getElementById('groupPickerModal').classList.add('hidden');
}

// 그룹 → 수신자 채우기. 연락처는 지금 조회하므로 항상 최신값이 쓰인다.
async function applyGroupToBulk(groupId) {
  try {
    var res = await axios.get('/api/contact-groups/' + groupId + '/members');
    var d = res.data.data || { members: [] };
    bulkTarget = 'clients';   // 서버 계약상 receivers를 직접 넘기므로 custom 경로와 동일 취급
    setBulkTarget('clients');
    bulkSelectedRecipients = d.members.map(function(m) {
      return { id: m.member_id, name: m.name, phone: m.phone || '', email: m.email || '' };
    });
    closeGroupPicker();
    var g = msgGroups.find(function(x) { return x.id === groupId; });
    var infoEl = document.getElementById('bulkTargetInfo');
    infoEl.textContent = '그룹 "' + (g ? g.name : '') + '" · 멤버 ' + bulkSelectedRecipients.length + '명';
    infoEl.className = 'text-sm text-blue-600 mb-2';
    renderSelectedTags();
    updateBulkSendLabel();
  } catch (e) {
    showToast('그룹 수신자 조회 실패', 'error');
  }
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
        + '<span class="text-sm font-bold text-gray-800">' + escapeHtml(t.name) + '</span>'
        + '<div class="flex gap-2">'
        + '<button onclick="openTplEditor(\'' + channel + '\',' + t.id + ')" class="text-xs text-blue-600 hover:text-blue-800"><i class="fas fa-edit mr-1"></i>편집</button>'
        + '<button onclick="deleteTpl(' + t.id + ',\'' + channel + '\')" class="text-xs text-red-600 hover:text-red-800"><i class="fas fa-trash mr-1"></i>삭제</button>'
        + '</div></div>'
        + (t.subject ? '<div class="text-xs text-gray-500 mb-1">제목: ' + escapeHtml(t.subject) + '</div>' : '')
        + '<pre class="text-xs text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">' + escapeHtml(t.content) + '</pre>'
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

  if (bulkChannel === 'mms' && !bulkImageB64) { showToast('MMS는 첨부 이미지를 선택해주세요', 'warning'); return; }

  // ⚠️ 서버 계약: receivers[].phone|email + content 객체(body/subject/template_code/sndDT).
  //    과거 이 함수는 receivers[].num + content 문자열 + 최상위 subject를 보내 400으로 전건 실패했다
  //    (payroll.js만 올바른 형태였음). 계약을 payroll.js·서버와 일치시킨다.
  var receivers = [];
  var contactField = (bulkChannel === 'email') ? 'email' : 'phone';

  if (bulkTarget === 'custom') {
    var lines = document.getElementById('bulkReceivers').value.trim().split('\n');
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(',');
      if (parts[0] && parts[0].trim()) {
        var rcv = { name: (parts[1] || '').trim() };
        rcv[contactField] = parts[0].trim();
        receivers.push(rcv);
      }
    }
    if (receivers.length === 0) { showToast('수신자를 입력해주세요', 'warning'); return; }
  } else {
    // 직원/거래처/그룹 선택 결과 사용
    if (bulkSelectedRecipients.length === 0) {
      showToast('수신자를 선택해주세요. 직원/거래처/그룹 선택 버튼을 눌러주세요.', 'warning');
      return;
    }
    receivers = bulkSelectedRecipients.filter(function(r) { return !!r[contactField]; }).map(function(r) {
      var o = { name: r.name };
      o[contactField] = r[contactField];
      return o;
    });
    if (receivers.length === 0) {
      showToast('선택된 수신자 중 ' + (bulkChannel === 'email' ? '이메일' : '전화번호') + '이 있는 수신자가 없습니다.', 'warning');
      return;
    }
  }

  var chLabel = { kakao: '카카오톡', sms: '문자', mms: 'MMS', email: '이메일' };
  var unitCost = { kakao: 7, sms: 15, mms: 100, email: 0 }[bulkChannel] || 0;
  var confirmMsg = receivers.length + '명에게 ' + chLabel[bulkChannel] + '을(를) 발송합니다.';
  if (unitCost) {
    confirmMsg += '\n예상 비용: ' + receivers.length + ' × ' + unitCost + '원 = '
      + (receivers.length * unitCost).toLocaleString() + '원 (부가세 별도)';
  }
  if (!(await showConfirm(confirmMsg))) return;

  try {
    var subject = document.getElementById('bulkSubject') ? document.getElementById('bulkSubject').value.trim() : '';
    var payload = {
      channel: bulkChannel,
      target_type: 'custom',
      receivers: receivers,
      content: { body: content }
    };
    if (subject) payload.content.subject = subject;
    if (templateCode) payload.content.template_code = templateCode;
    if (bulkChannel === 'mms') payload.content.image_base64 = bulkImageB64;

    // 예약 발송
    var scheduleToggle = document.getElementById('bulkScheduleToggle');
    if (scheduleToggle && scheduleToggle.checked && (bulkChannel === 'kakao' || bulkChannel === 'sms' || bulkChannel === 'mms')) {
      var scheduleAt = document.getElementById('bulkScheduleAt').value;
      if (scheduleAt) payload.content.sndDT = scheduleAt.replace(/[-T:]/g, '').substring(0, 14);
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
      + '<span class="text-sm font-medium text-gray-800 flex-1">' + escapeHtml(r.receiver_name || '-') + '</span>'
      + '<span class="text-xs text-gray-500">' + (r.receiver_num || '') + '</span>'
      + '<span class="text-xs font-medium text-blue-600 w-10 text-right">' + r.count + '건</span>'
      + '</div>';
  }).join('');
}
