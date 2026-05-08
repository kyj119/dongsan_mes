var cdData = null;

var statusLabels = {
  'QUOTATION': '견적', 'CONFIRMED': '확정',
  'PRINTING': '출력중', 'PRINT_DONE': '출력완료', 'SHIPPED': '출고',
  'HOLD': '보류', 'CANCELLED': '취소'
};
var statusColors = {
  'QUOTATION': 'bg-gray-100 text-gray-600',
  'CONFIRMED': 'bg-blue-50 text-blue-700', 'PRINTING': 'bg-amber-50 text-amber-700',
  'PRINT_DONE': 'bg-green-50 text-green-700', 'SHIPPED': 'bg-blue-50 text-blue-700',
  'HOLD': 'bg-amber-50 text-amber-700', 'CANCELLED': 'bg-red-50 text-red-700'
};
var noteTypeLabels = { 'GENERAL': '일반', 'IMPORTANT': '중요', 'COMPLAINT': '클레임', 'FOLLOW_UP': '후속조치' };
var noteTypeColors = { 'GENERAL': 'bg-gray-100 text-gray-700', 'IMPORTANT': 'bg-red-50 text-red-700', 'COMPLAINT': 'bg-amber-50 text-amber-700', 'FOLLOW_UP': 'bg-blue-50 text-blue-700' };
var collMethodLabels = { 'PHONE': '전화', 'SMS': '문자', 'EMAIL': '이메일', 'VISIT': '방문', 'LETTER': '내용증명', 'OTHER': '기타' };

function fmt(n) { return (n || 0).toLocaleString(); }
function fmtDate(d) { return d ? d.substring(0, 10) : '-'; }

function switchCdTab(tab) {
  var tabs = ['orders', 'notes', 'collection'];
  tabs.forEach(function(t) {
    var btnId = 'cdTab' + t.charAt(0).toUpperCase() + t.slice(1);
    var btn = document.getElementById(btnId);
    var panel = document.getElementById('cd' + t.charAt(0).toUpperCase() + t.slice(1) + 'Panel');
    if (!btn || !panel) return;
    if (t === tab) {
      btn.className = 'px-5 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-600 whitespace-nowrap';
      panel.classList.remove('hidden');
    } else {
      btn.className = 'px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap';
      panel.classList.add('hidden');
    }
  });
}

async function loadClientDetail() {
  try {
    var res = await axios.get('/api/clients/' + CLIENT_ID + '/detail');
    if (!res.data.success) throw new Error(res.data.error);
    cdData = res.data.data;
    var cl = cdData.client;

    document.getElementById('loadingMsg').classList.add('hidden');
    document.getElementById('detailContent').classList.remove('hidden');

    // Header
    document.getElementById('cdClientName').textContent = cl.client_name || '-';
    var codeEl = document.getElementById('cdClientCode');
    codeEl.textContent = cl.client_code || '';
    document.getElementById('cdLedgerLink').href = '/ledger?client_id=' + CLIENT_ID;

    // 사이드바 거래처 정보
    document.getElementById('cdRepresentative').textContent = cl.representative || '-';
    document.getElementById('cdPhone').textContent = cl.phone || '-';
    document.getElementById('cdMobile').textContent = cl.mobile || '-';
    document.getElementById('cdFax').textContent = cl.fax || '-';
    document.getElementById('cdEmail').textContent = cl.email || '-';
    document.getElementById('cdAddress').textContent = cl.address || '-';
    // 배송정보 통합 표시
    var deliveryMethodMap = { SAME: '소재지 동일', FREIGHT: '화물', DIRECT: '직배송', PICKUP: '방문수령' };
    var dmEl = document.getElementById('cdDeliveryMethod');
    if (dmEl) dmEl.textContent = deliveryMethodMap[cl.delivery_method] || '소재지 동일';
    var daEl = document.getElementById('cdDeliveryAddress');
    if (daEl) daEl.textContent = cl.delivery_address || '-';
    document.getElementById('cdBrn').textContent = cl.business_registration_number || '-';

    // 세금계산서 발행 유형
    var invoiceTypeEl = document.getElementById('cdInvoiceType');
    if (invoiceTypeEl) invoiceTypeEl.value = cl.invoice_method || 'PER_ORDER';
    // 자동 회계반영
    var autoBillingEl = document.getElementById('cdAutoBilling');
    if (autoBillingEl) autoBillingEl.checked = cl.auto_billing === 1;

    // 비활성화 버튼 상태
    var toggleBtn = document.getElementById('cdToggleActiveBtn');
    if (toggleBtn) {
      if (cl.is_active === 0) {
        toggleBtn.innerHTML = '<i class="fas fa-power-off mr-1"></i>활성화';
        toggleBtn.className = 'w-full px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm hover:bg-green-100';
      } else {
        toggleBtn.innerHTML = '<i class="fas fa-power-off mr-1"></i>비활성화';
        toggleBtn.className = 'w-full px-3 py-2 bg-white border text-gray-700 rounded-lg text-sm hover:bg-gray-50';
      }
    }

    // KPI (헤더 인라인)
    var rv = cdData.receivables;
    document.getElementById('cdBalance').textContent = fmt(rv.balance) + '원';
    document.getElementById('cdTotalBilled').textContent = fmt(rv.total_billed) + '원';

    // 사이드바 분석 수치
    document.getElementById('cdTotalPayments').textContent = fmt(rv.total_payments) + '원';
    document.getElementById('cdBilledCount').textContent = (rv.billed_count || 0) + '건';
    document.getElementById('cdLastPayment').textContent = rv.last_payment_date || '-';

    // 매출 미니 차트 (사이드바)
    var trend = (cdData.monthly_trend || []).slice().reverse();
    var maxRev = Math.max.apply(null, trend.map(function(m) { return m.revenue || 0; })) || 1;
    var chart = document.getElementById('cdMonthlyChart');
    if (trend.length === 0) {
      chart.innerHTML = '<div class="text-center text-gray-400 py-2 text-xs">데이터 없음</div>';
    } else {
      chart.innerHTML = trend.map(function(m) {
        var w = Math.round(((m.revenue || 0) / maxRev) * 100);
        return '<div class="flex items-center gap-2">'
          + '<span class="w-12 text-[10px] text-gray-500 text-right flex-shrink-0">' + (m.month || '').substring(2) + '</span>'
          + '<div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">'
          + '<div class="h-full bg-blue-400 rounded-full" style="width:' + Math.max(w, 2) + '%"></div></div>'
          + '<span class="w-20 text-right text-[10px] text-gray-600 flex-shrink-0">' + fmt(m.revenue) + '원</span>'
          + '</div>';
      }).join('');
    }

    // 여신 & 사업자 그룹 (ADMIN only)
    var userRole = '';
    try { var t = localStorage.getItem('token'); if(t) { var p = JSON.parse(atob(t.split('.')[1])); userRole = p.role || ''; } } catch(e2){}
    if (userRole === 'ADMIN') {
      document.getElementById('cdCreditSection').classList.remove('hidden');
      document.getElementById('cdCreditLimit').value = fmtMoneyInput(cl.credit_limit || 0);
      document.getElementById('cdCreditHold').value = cl.credit_hold ? '1' : '0';
      loadBillingGroups(cl.billing_group_id);
      loadGroupMembers();
    }

    // 여신 상태 배너
    renderCreditBanner(cl);

    // 포털 계정 (사이드바 자동 로드)
    loadPortalAccount();

    // 패널 렌더
    renderOrders(cdData.orders);
    renderNotes(cdData.notes);
    renderCollection(cdData.collection_logs);

  } catch(e) {
    document.getElementById('loadingMsg').innerHTML = '<div class="text-red-500"><i class="fas fa-exclamation-circle mr-2"></i>로드 실패: ' + (e.message || '') + '</div>';
  }
}

function renderOrders(orders) {
  var tbody = document.getElementById('cdOrdersBody');
  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">주문이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(function(o) {
    var sBadge = '<span class="px-2 py-0.5 rounded text-xs ' + (statusColors[o.status] || 'bg-gray-100') + '">' + (statusLabels[o.status] || o.status) + '</span>';
    var bBadge = o.billing_status === 'BILLED'
      ? '<span class="text-green-600"><i class="fas fa-check-circle"></i></span>'
      : '<span class="text-gray-300"><i class="fas fa-clock"></i></span>';
    return '<tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="location.href=\'/orders?search=' + encodeURIComponent(o.order_number || '') + '\'">'
      + '<td class="px-4 py-3 font-medium text-blue-700">' + (o.order_number || '') + '</td>'
      + '<td class="px-4 py-3 text-center text-sm">' + fmtDate(o.order_date || o.created_at) + '</td>'
      + '<td class="px-4 py-3 text-center text-sm">' + fmtDate(o.delivery_date) + '</td>'
      + '<td class="px-4 py-3 text-right font-medium">' + fmt(o.final_amount) + '원</td>'
      + '<td class="px-4 py-3 text-center">' + sBadge + '</td>'
      + '<td class="px-4 py-3 text-center">' + bBadge + '</td>'
      + '</tr>';
  }).join('');
}

function renderNotes(notes) {
  var container = document.getElementById('cdNotesList');
  if (!notes || notes.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-8">메모가 없습니다</div>';
    return;
  }
  container.innerHTML = notes.map(function(n) {
    var typeBadge = '<span class="px-2 py-0.5 rounded text-xs ' + (noteTypeColors[n.note_type] || 'bg-gray-100') + '">' + (noteTypeLabels[n.note_type] || n.note_type) + '</span>';
    return '<div class="bg-white rounded-lg shadow p-4">'
      + '<div class="flex justify-between items-start mb-2">'
      + '<div class="flex items-center gap-2">' + typeBadge + '<span class="text-xs text-gray-400">' + fmtDate(n.created_at) + '</span>'
      + (n.created_by_name ? '<span class="text-xs text-gray-400">by ' + n.created_by_name + '</span>' : '') + '</div>'
      + '<button onclick="deleteNote(' + n.id + ')" class="text-red-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button>'
      + '</div>'
      + '<div class="text-sm text-gray-700 whitespace-pre-wrap">' + (n.content || '') + '</div>'
      + '</div>';
  }).join('');
}

function renderCollection(logs) {
  var tbody = document.getElementById('cdCollectionBody');
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">독촉 이력이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(function(cl) {
    return '<tr class="border-t hover:bg-gray-50">'
      + '<td class="px-4 py-3 text-sm">' + fmtDate(cl.contact_date) + '</td>'
      + '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">' + (collMethodLabels[cl.contact_method] || cl.contact_method) + '</span></td>'
      + '<td class="px-4 py-3 text-sm">' + (cl.contact_person || cl.created_by_name || '-') + '</td>'
      + '<td class="px-4 py-3 text-sm">' + fmtDate(cl.promised_date) + '</td>'
      + '<td class="px-4 py-3 text-right text-sm">' + (cl.promised_amount ? fmt(cl.promised_amount) + '원' : '-') + '</td>'
      + '<td class="px-4 py-3 text-sm text-gray-500">' + (cl.notes || '-') + '</td>'
      + '</tr>';
  }).join('');
}

// Note Modal
function openNoteModal() {
  document.getElementById('noteType').value = 'GENERAL';
  document.getElementById('noteContent').value = '';
  document.getElementById('noteModal').classList.remove('hidden');
}
function closeNoteModal() {
  document.getElementById('noteModal').classList.add('hidden');
}

async function saveNote() {
  var content = document.getElementById('noteContent').value.trim();
  if (!content) { showToast('내용을 입력하세요', 'warning'); return; }
  try {
    var res = await axios.post('/api/clients/' + CLIENT_ID + '/notes', {
      note_type: document.getElementById('noteType').value,
      content: content
    });
    if (res.data.success) {
      showToast('메모가 등록되었습니다', 'success');
      closeNoteModal();
      loadClientDetail();
    }
  } catch(e) {
    showToast('메모 등록 실패', 'error');
  }
}

async function deleteNote(noteId) {
  if (!(await showConfirm('이 메모를 삭제하시겠습니까?', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/clients/' + CLIENT_ID + '/notes/' + noteId);
    if (res.data.success) {
      showToast('삭제되었습니다', 'success');
      loadClientDetail();
    }
  } catch(e) {
    showToast('삭제 실패', 'error');
  }
}

// ── Intelligence ──
var RISK_LABELS = {
  'CHURN_RISK': { label: '이탈 위험: 3개월 이상 주문 없음', icon: 'fa-user-slash', color: 'red' },
  'HIGH_AR': { label: '미수금 과다: 청구 대비 50% 이상 미회수', icon: 'fa-exclamation-triangle', color: 'red' },
  'LOW_MARGIN': { label: '저마진: 마진율 15% 미만', icon: 'fa-chart-line', color: 'orange' },
  'DECLINING': { label: '매출 감소: 전분기 대비 30% 이상 하락', icon: 'fa-arrow-down', color: 'orange' },
  'FREQUENT_COLLECTION': { label: '잦은 독촉: 최근 6개월 3회 이상', icon: 'fa-phone', color: 'amber' }
};

function intelGradeColor(g) {
  if (g === 'A') return 'bg-green-50 text-green-700';
  if (g === 'B') return 'bg-blue-50 text-blue-700';
  if (g === 'C') return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

function creditBarColor(score) {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

async function loadIntelligence() {
  try {
    var res = await axios.get('/api/clients/' + CLIENT_ID + '/intelligence');
    if (!res.data.success) return;
    var d = res.data.data;

    // Credit Score (헤더 인라인)
    var csEl = document.getElementById('cdCreditScore');
    csEl.textContent = d.credit.score;
    var scoreNum = d.credit.score;
    csEl.className = 'text-lg font-bold '
      + (scoreNum >= 80 ? 'text-green-600' : scoreNum >= 60 ? 'text-blue-600' : scoreNum >= 40 ? 'text-amber-600' : 'text-red-600');

    // 사이드바 신용 등급
    var gradeEl = document.getElementById('cdCreditGrade');
    gradeEl.textContent = d.credit.grade;
    gradeEl.className = 'px-1.5 py-0.5 rounded text-xs font-bold ' + intelGradeColor(d.credit.grade);
    var bd = d.credit.breakdown;
    document.getElementById('cdCreditBreakdown').textContent =
      '결제' + bd.payment + ' 수익' + bd.profit + ' 성장' + bd.growth;

    // Profitability
    var mrEl = document.getElementById('cdMarginRate');
    mrEl.textContent = d.profitability.margin_rate + '%';
    mrEl.className = 'font-medium ' + (d.profitability.margin_rate >= 30 ? 'text-green-600' : d.profitability.margin_rate >= 15 ? 'text-amber-600' : 'text-red-600');

    // Growth
    var gr = d.growth.growth_rate;
    var grEl = document.getElementById('cdGrowthRate');
    grEl.textContent = (gr > 0 ? '+' : '') + gr + '%';
    grEl.className = 'font-medium ' + (gr > 0 ? 'text-green-600' : gr < 0 ? 'text-red-600' : 'text-gray-600');

    // AR Ratio
    var arEl = document.getElementById('cdArRatio');
    arEl.textContent = d.payment.ar_ratio + '%';
    arEl.className = 'font-medium ' + (d.payment.ar_ratio > 50 ? 'text-red-600' : d.payment.ar_ratio > 20 ? 'text-amber-600' : 'text-green-600');

    // Risk Banner
    if (d.risks && d.risks.length > 0) {
      var banner = document.getElementById('cdRiskBanner');
      banner.innerHTML = d.risks.map(function(r) {
        var info = RISK_LABELS[r] || { label: r, icon: 'fa-info-circle', color: 'gray' };
        var colorMap = { red: 'bg-red-50 border-red-300 text-red-700', orange: 'bg-orange-50 border-orange-300 text-orange-700', amber: 'bg-amber-50 border-amber-300 text-amber-700', gray: 'bg-gray-50 border-gray-300 text-gray-700' };
        return '<div class="border rounded-lg px-4 py-2 text-sm flex items-center gap-2 mb-1 ' + (colorMap[info.color] || colorMap.gray) + '">'
          + '<i class="fas ' + info.icon + '"></i>' + info.label + '</div>';
      }).join('');
      banner.classList.remove('hidden');
    }
  } catch(e) {
    console.error('Intelligence load error:', e);
  }
}

async function updateInvoiceType() {
  var val = document.getElementById('cdInvoiceType').value;
  try {
    var res = await axios.patch('/api/clients/' + CLIENT_ID, { invoice_method: val });
    if (res.data.success) {
      showToast(val === 'MONTHLY' ? '월합산 발행으로 변경됨' : '건별 발행으로 변경됨', 'success');
    }
  } catch(e) {
    showToast('변경 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
}

async function updateAutoBilling() {
  var checked = document.getElementById('cdAutoBilling').checked;
  try {
    var res = await axios.patch('/api/clients/' + CLIENT_ID, { auto_billing: checked ? 1 : 0 });
    if (res.data.success) {
      showToast(checked ? '자동 회계반영 활성화' : '자동 회계반영 비활성화', 'success');
    }
  } catch(e) {
    showToast('변경 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
}


// ============================================================
// 여신 관리
// ============================================================
function renderCreditBanner(cl) {
  var banner = document.getElementById('cdCreditBanner');
  var balance = parseFloat(cl.balance) || 0;
  var limit = parseFloat(cl.credit_limit) || 0;
  var hold = cl.credit_hold === 1;

  if (hold) {
    banner.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><i class="fas fa-ban"></i><span class="font-medium">주문 차단 중</span> — 관리자가 차단을 해제해야 주문 가능</div>';
    banner.classList.remove('hidden');
  } else if (limit > 0 && balance >= limit) {
    banner.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><i class="fas fa-exclamation-triangle"></i><span class="font-medium">여신한도 초과</span> — 잔액 ' + fmt(balance) + '원 / 한도 ' + fmt(limit) + '원</div>';
    banner.classList.remove('hidden');
  } else if (limit > 0 && balance >= limit * 0.8) {
    banner.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700"><i class="fas fa-exclamation-triangle"></i><span class="font-medium">여신한도 80% 도달</span> — 잔액 ' + fmt(balance) + '원 / 한도 ' + fmt(limit) + '원</div>';
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

window.saveCreditSettings = async function() {
  try {
    var limit = parseMoney(document.getElementById('cdCreditLimit').value);
    var hold = parseInt(document.getElementById('cdCreditHold').value) || 0;
    await axios.patch('/api/clients/' + CLIENT_ID + '/credit', { credit_limit: limit, credit_hold: hold });
    showToast('여신 설정이 저장되었습니다.', 'success');
    loadClientDetail();
  } catch(e) {
    showToast('저장 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

// ============================================================
// 사업자 그룹 (Billing Group)
// ============================================================
async function loadBillingGroups(currentGroupId) {
  try {
    var res = await axios.get('/api/clients/billing-groups');
    if (!res.data.success) return;
    var select = document.getElementById('cdBillingGroup');
    select.innerHTML = '<option value="">없음 (독립)</option>';
    (res.data.data || []).forEach(function(g) {
      var opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.group_name + ' (' + (g.member_count || 0) + '개)';
      if (currentGroupId && g.id == currentGroupId) opt.selected = true;
      select.appendChild(opt);
    });
  } catch(e) { console.error('billing groups load error:', e); }
}

async function loadGroupMembers() {
  try {
    var res = await axios.get('/api/clients/' + CLIENT_ID + '/billing-group-members');
    var container = document.getElementById('cdGroupMembers');
    var members = res.data.data || [];
    if (members.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = '<div class="mt-1"><span class="text-[10px] text-gray-400">같은 그룹:</span> '
      + members.map(function(m) {
        return '<a href="/clients/' + m.id + '" class="text-blue-600 hover:underline text-xs mr-2">' + m.client_name + ' (' + (m.business_registration_number || m.client_code) + ')</a>';
      }).join('') + '</div>';
  } catch(e) { console.error('group members error:', e); }
}

window.saveBillingGroup = async function() {
  try {
    var val = document.getElementById('cdBillingGroup').value;
    await axios.patch('/api/clients/' + CLIENT_ID + '/billing-group', {
      billing_group_id: val ? parseInt(val) : null
    });
    showToast('사업자 그룹이 변경되었습니다.', 'warning');
    loadGroupMembers();
  } catch(e) {
    showToast('저장 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.createBillingGroup = async function() {
  var name = prompt('새 사업자 그룹명을 입력하세요:');
  if (!name) return;
  try {
    var res = await axios.post('/api/clients/billing-groups', { group_name: name });
    if (res.data.success) {
      showToast('그룹이 생성되었습니다.', 'success');
      loadBillingGroups(res.data.data.id);
      document.getElementById('cdBillingGroup').value = res.data.data.id;
    }
  } catch(e) {
    showToast('생성 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.toggleClientActive = async function() {
  var cl = cdData?.client;
  if (!cl) return;
  var action = cl.is_active === 1 ? '비활성화' : '활성화';
  if (!(await showConfirm('거래처 "' + cl.client_name + '"을(를) ' + action + '하시겠습니까?'))) return;
  try {
    var res = await axios.patch('/api/clients/' + CLIENT_ID + '/toggle-active');
    if (res.data.success) {
      showToast(res.data.message, 'warning');
      loadClientDetail();
    }
  } catch(e) {
    showToast(action + ' 실패: ' + (e.response?.data?.error || e.message), 'error');
  }
};

// ============================================================
// 포털 계정 관리
// ============================================================
var portalClientId = null;

async function loadPortalAccount() {
  if (!portalClientId) return;
  var el = document.getElementById('portalAccountStatus');
  try {
    var res = await axios.get('/api/clients/' + portalClientId + '/portal-account');
    if (!res.data.success) { el.innerHTML = '<p class="text-red-500 text-sm">조회 실패</p>'; return; }
    var account = res.data.data.account;

    if (!account) {
      el.innerHTML = '<div class="text-center py-4">'
        + '<i class="fas fa-user-plus text-gray-300 text-2xl mb-2"></i>'
        + '<p class="text-gray-500 text-sm mb-3">포털 계정 없음</p>'
        + '<button onclick="showCreatePortalForm()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>계정 생성</button>'
        + '</div>'
        + '<div id="portalCreateForm" class="hidden mt-3 space-y-2 border-t pt-3">'
        + '<div><label class="text-xs font-medium text-gray-700 block mb-0.5">로그인 ID <span class="text-red-500">*</span></label>'
        + '<input type="text" id="portalLoginId" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="로그인 ID"></div>'
        + '<div><label class="text-xs font-medium text-gray-700 block mb-0.5">비밀번호 <span class="text-red-500">*</span></label>'
        + '<input type="password" id="portalPassword" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="초기 비밀번호"></div>'
        + '<div><label class="text-xs font-medium text-gray-700 block mb-0.5">담당자명</label>'
        + '<input type="text" id="portalContactName" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="담당자"></div>'
        + '<div><label class="text-xs font-medium text-gray-700 block mb-0.5">연락처</label>'
        + '<input type="tel" id="portalContactPhone" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="010-0000-0000"></div>'
        + '<div><label class="text-xs font-medium text-gray-700 block mb-0.5">이메일</label>'
        + '<input type="email" id="portalContactEmail" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="email@example.com"></div>'
        + '<div class="flex justify-end gap-2 pt-1"><button onclick="cancelCreatePortal()" class="px-3 py-1.5 border text-gray-700 rounded text-xs">취소</button>'
        + '<button onclick="createPortalAccount()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">생성</button></div>'
        + '</div>';
    } else {
      var statusBadge = account.is_active
        ? '<span class="px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">활성</span>'
        : '<span class="px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">비활성</span>';
      var lastLogin = account.last_login_at ? account.last_login_at.replace('T', ' ').substring(0, 16) : '없음';

      el.innerHTML = '<div class="space-y-2">'
        + '<div class="flex items-center justify-between">'
        + '<span class="text-sm font-medium text-gray-700">' + account.login_id + '</span>'
        + statusBadge
        + '</div>'
        + '<div class="text-xs text-gray-500 space-y-1">'
        + '<div>담당자: <span class="text-gray-700">' + (account.contact_name || '-') + '</span></div>'
        + '<div>연락처: <span class="text-gray-700">' + (account.contact_phone || '-') + '</span></div>'
        + '<div>최근 로그인: <span class="text-gray-700">' + lastLogin + '</span></div>'
        + '</div>'
        + '<div class="flex gap-1.5 pt-2 border-t">'
        + '<button onclick="resetPortalPassword()" class="px-2 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50"><i class="fas fa-key mr-0.5"></i>비번</button>'
        + '<button onclick="togglePortalActive(' + (account.is_active ? 0 : 1) + ')" class="px-2 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50"><i class="fas fa-power-off mr-0.5"></i>' + (account.is_active ? '비활성화' : '활성화') + '</button>'
        + '<button onclick="deletePortalAccount()" class="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"><i class="fas fa-trash mr-0.5"></i>삭제</button>'
        + '</div>'
        + '</div>';
    }
  } catch(e) {
    el.innerHTML = '<p class="text-red-500 text-xs">조회 실패: ' + (e.message || '') + '</p>';
  }
}

function showCreatePortalForm() {
  document.getElementById('portalCreateForm').classList.remove('hidden');
}

function cancelCreatePortal() {
  document.getElementById('portalCreateForm').classList.add('hidden');
}

async function createPortalAccount() {
  var loginId = document.getElementById('portalLoginId').value.trim();
  var password = document.getElementById('portalPassword').value;
  if (!loginId || !password) { showToast('ID와 비밀번호를 입력해주세요', 'warning'); return; }
  if (password.length < 4) { showToast('비밀번호는 4자 이상이어야 합니다', 'warning'); return; }

  try {
    var res = await axios.post('/api/clients/' + portalClientId + '/portal-account', {
      login_id: loginId,
      password: password,
      contact_name: document.getElementById('portalContactName').value.trim() || undefined,
      contact_phone: document.getElementById('portalContactPhone').value.trim() || undefined,
      contact_email: document.getElementById('portalContactEmail').value.trim() || undefined
    });
    if (res.data.success) {
      showToast('포털 계정이 생성되었습니다. ID: ' + loginId, 'success');
      loadPortalAccount();
    } else {
      showToast(res.data.error || '생성 실패', 'error');
    }
  } catch(e) {
    showToast('생성 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function resetPortalPassword() {
  var newPw = prompt('새 비밀번호를 입력하세요:');
  if (!newPw || newPw.length < 4) { showToast('비밀번호는 4자 이상', 'warning'); return; }
  try {
    var res = await axios.patch('/api/clients/' + portalClientId + '/portal-account', { password: newPw });
    if (res.data.success) showToast('비밀번호가 초기화되었습니다', 'success');
    else showToast(res.data.error || '실패', 'error');
  } catch(e) {
    showToast('오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

async function togglePortalActive(newState) {
  try {
    var res = await axios.patch('/api/clients/' + portalClientId + '/portal-account', { is_active: newState });
    if (res.data.success) { showToast(newState ? '활성화됨' : '비활성화됨', 'success'); loadPortalAccount(); }
  } catch(e) { showToast('오류', 'error'); }
}

async function deletePortalAccount() {
  if (!(await showConfirm('포털 계정을 삭제하시겠습니까? 거래처가 더 이상 포털에 로그인할 수 없습니다.'))) return;
  try {
    var res = await axios.delete('/api/clients/' + portalClientId + '/portal-account');
    if (res.data.success) { showToast('포털 계정이 삭제되었습니다', 'success'); loadPortalAccount(); }
  } catch(e) { showToast('삭제 오류', 'error'); }
}

// ============================================================
// 사업자등록상태 조회 (거래처 상세)
// ============================================================
async function checkClientBrnStatus() {
  var brn = document.getElementById('cdBrn').textContent.trim();
  if (!brn || brn === '-' || brn.replace(/-/g, '').length !== 10) {
    showToast('사업자등록번호가 없거나 형식이 맞지 않습니다.', 'warning');
    return;
  }
  var btn = document.getElementById('cdBtnCheckBrn');
  var statusEl = document.getElementById('cdBrnStatusResult');
  if (btn) { btn.disabled = true; btn.textContent = '조회중...'; }
  try {
    var res = await axios.get('/api/clients/check-brn/' + encodeURIComponent(brn));
    if (res.data.success) {
      var d = res.data.data;
      var stateText = d.state || '확인불가';
      var taxText = d.taxType || '';
      var dateText = d.stateDate || '';
      var color = stateText.includes('계속') ? 'text-green-600' : (stateText.includes('폐업') ? 'text-red-600' : 'text-amber-600');
      statusEl.innerHTML = '<span class="' + color + ' font-medium">' + stateText + '</span>'
        + (taxText ? ' · ' + taxText : '')
        + (dateText ? ' (' + dateText + ')' : '');
      statusEl.classList.remove('hidden');
    } else {
      showToast('조회 실패: ' + (res.data.error || ''), 'error');
    }
  } catch(e) {
    showToast('조회 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '상태조회'; }
  }
}

portalClientId = CLIENT_ID;
loadClientDetail();
loadIntelligence();
