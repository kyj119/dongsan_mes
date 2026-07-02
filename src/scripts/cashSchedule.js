// 자금계획 (Cash Schedule) 페이지

// Skeleton loading
(function() {
  var el = document.getElementById('schCalendarContainer');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.cards(6);
})();

var schCurrentYear = null;
var schCurrentMonth = null;
var schCalendarData = null;
var schForecastData = null;

function fmt(n) {
  return (n || 0).toLocaleString('ko-KR', { maximumFractionDigits: 0 });
}

// 하이브리드 엔진 항목 type → 한글 라벨 (달력 pill·일자 상세 공용)
var SCH_TYPE_LABELS = {
  ORDER: '입금예정', ORDER_EXPECTED: '예상입금',
  PURCHASE: '지급예정', PURCHASE_EXPECTED: '지급예상',
  CARD: '카드대금', CARD_EXPECTED: '카드대금',
  FIXED: '고정비', LOAN: '대출상환',
  PAYROLL: '급여', PAYROLL_TAX: '4대보험·원천세',
  TAX: '세금', OTHER: '기타'
};
function schTypeLabel(type) {
  return SCH_TYPE_LABELS[type] || type || '';
}

function fmtDate(d) {
  if (typeof d === 'string') return d;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseDate(s) {
  var parts = s.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

// 초기화는 파일 맨 아래에서 실행 (window.* 함수 정의 이후)

window.loadSchedule = async function() {
  try {
    var y = schCurrentYear;
    var m = schCurrentMonth;
    var res = await axios.get('/api/cash-flow/schedule/calendar?year=' + y + '&month=' + m);
    if (!res.data.success) {
      showToast('캘린더 로드 실패', 'error');
      return;
    }
    schCalendarData = res.data.data;
    renderSchedule();
  } catch (e) {
    console.error('loadSchedule error:', e);
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

function renderSchedule() {
  if (!schCalendarData) return;

  var d = schCalendarData;
  var y = d.year;
  var m = d.month;
  var days = d.days;
  var summary = d.summary;

  // 제목
  document.getElementById('schMonthLabel').textContent = y + '년 ' + m + '월';

  // KPI
  var netFlow = summary.in_total - summary.out_total;
  document.getElementById('schKpiInTotal').textContent = fmt(summary.in_total);
  document.getElementById('schKpiOutTotal').textContent = fmt(summary.out_total);
  document.getElementById('schKpiNetFlow').textContent = fmt(netFlow);
  document.getElementById('schKpiInDone').textContent = fmt(summary.in_done);

  // 연체 개수 계산 (물질화 예정 중 날짜가 지났는데 미완료인 항목 — 온더플라이 추정치는 제외)
  var today = new Date();
  var overdueCount = 0;
  for (var dateStr in days) {
    if (parseDate(dateStr) < today) {
      var day = days[dateStr];
      for (var i = 0; i < day.items.length; i++) {
        var item = day.items[i];
        if (item.materialized && item.status !== 'DONE') overdueCount++;
      }
    }
  }
  document.getElementById('schKpiOverdue').textContent = overdueCount;

  // 캘린더 그리드
  var firstDate = new Date(y, m - 1, 1);
  var firstDayOfWeek = firstDate.getDay();
  var lastDay = new Date(y, m, 0).getDate();

  var html = '';

  // 빈 셀 (이전 달)
  for (var i = 0; i < firstDayOfWeek; i++) {
    html += '<div class="p-1.5 text-[9px] h-24 bg-gray-50 rounded border border-gray-200"></div>';
  }

  // 날짜 셀
  for (var day = 1; day <= lastDay; day++) {
    var dateStr = y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var dayData = days[dateStr];
    var inAmount = dayData.in_total;
    var outAmount = dayData.out_total;
    var itemCount = dayData.items.length;

    var isPast = parseDate(dateStr) < new Date();
    var isToday = dateStr === fmtDate(new Date());
    var className = 'p-1.5 text-[9px] h-24 border rounded cursor-pointer transition-colors hover:bg-blue-50/50 ' +
      (isToday ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:border-blue-300');

    html += '<div class="' + className + '" onclick="schOpenDayDetail(\'' + dateStr + '\')">';
    html += '<div class="font-bold text-gray-700">' + day + '</div>';

    if (inAmount > 0) {
      html += '<div class="text-[8px] text-green-600 font-medium">입 ' + fmt(inAmount) + '</div>';
    }
    if (outAmount > 0) {
      html += '<div class="text-[8px] text-red-600 font-medium">출 ' + fmt(outAmount) + '</div>';
    }

    // 항목 피드백 (엔진 항목: flow/type, 추정치는 ~ 표시)
    if (itemCount > 0) {
      var items = dayData.items;
      var maxPills = 3;
      for (var j = 0; j < Math.min(maxPills, itemCount); j++) {
        var item = items[j];
        var pillClass = item.flow === 'IN' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700';
        html += '<span class="inline-block text-[7px] px-1 py-0.5 rounded ' + pillClass + ' mr-0.5 mt-0.5">' +
          schTypeLabel(item.type) + (item.estimated ? '~' : '') + '</span>';
      }
      if (itemCount > maxPills) {
        html += '<span class="text-[7px] text-gray-500">+' + (itemCount - maxPills) + '</span>';
      }
    }

    html += '</div>';
  }

  document.getElementById('schCalendarContainer').innerHTML = html;
}

// #363: 현재 월 자금일정 CSV 내보내기 (서버 엔드포인트 — 일관성 패턴)
window.exportCashScheduleCsv = async function() {
  try {
    var y = schCurrentYear;
    var m = schCurrentMonth;
    if (!y || !m) { showToast('내보낼 기간이 없습니다', 'info'); return; }
    var from = y + '-' + String(m).padStart(2, '0') + '-01';
    var lastDay = new Date(y, m, 0).getDate();
    var to = y + '-' + String(m).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    var params = new URLSearchParams();
    params.set('from', from);
    params.set('to', to);
    var res = await authFetch('/api/cash-flow/schedule/export/csv?' + params.toString());
    if (!res.ok) throw new Error('서버 오류');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '자금계획_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch(e) {
    showToast('CSV 내보내기 실패: ' + e.message, 'error');
  }
};
// 기존 버튼 호환 alias
window.schExportCSV = window.exportCashScheduleCsv;

window.schPrevMonth = function() {
  schCurrentMonth--;
  if (schCurrentMonth < 1) {
    schCurrentMonth = 12;
    schCurrentYear--;
  }
  loadSchedule();
};

window.schNextMonth = function() {
  schCurrentMonth++;
  if (schCurrentMonth > 12) {
    schCurrentMonth = 1;
    schCurrentYear++;
  }
  loadSchedule();
};

window.schToday = function() {
  var today = new Date();
  schCurrentYear = today.getFullYear();
  schCurrentMonth = today.getMonth() + 1;
  loadSchedule();
};

window.schAutoGenerate = async function() {
  if (!(await showConfirm('주문/발주/고정비에서 자금 예정을 자동 생성하시겠습니까?'))) return;
  try {
    var res = await axios.post('/api/cash-flow/schedule/auto-generate');
    if (res.data.success) {
      showToast('자동 생성 완료', 'success');
      loadSchedule();
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.schCheckOverdue = async function() {
  try {
    var res = await axios.post('/api/cash-flow/schedule/check-overdue');
    if (res.data.success) {
      var data = res.data.data;
      showToast('연체 ' + data.overdue_count + '건 / 기한 준수 ' + data.on_time_count + '건', 'success');
      loadSchedule();
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

// 일자 상세 — 달력 데이터(하이브리드 엔진 항목) 기반. 물질화 행만 완료/삭제 가능, 온더플라이는 표시 전용.
var schDetailDate = null;

window.schOpenDayDetail = function(dateStr) {
  if (!schCalendarData || !schCalendarData.days || !schCalendarData.days[dateStr]) return;
  schDetailDate = dateStr;
  var items = schCalendarData.days[dateStr].items || [];
  var d = parseDate(dateStr);
  var dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];

  document.getElementById('schDayModalTitle').textContent =
    dateStr + ' (' + dayOfWeek + ') - ' + items.length + '건';

  var html = '';
  if (items.length === 0) {
    html = '<div class="text-sm text-gray-400 text-center py-4">데이터가 없습니다.</div>';
  } else {
    items.forEach(function(it) {
      var typeClass = it.flow === 'IN' ? 'text-green-600' : 'text-red-600';
      var statusBadge;
      if (it.materialized) {
        statusBadge = it.status === 'DONE' ?
          '<span class="inline-flex items-center text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded"><i class="fas fa-check-circle text-[7px] mr-0.5"></i>완료</span>' :
          '<span class="inline-flex items-center text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded"><i class="far fa-clock text-[7px] mr-0.5"></i>대기</span>';
      } else {
        statusBadge = it.estimated ?
          '<span class="inline-flex items-center text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded"><i class="fas fa-wand-magic-sparkles text-[7px] mr-0.5"></i>추정</span>' :
          '<span class="inline-flex items-center text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded"><i class="fas fa-bolt text-[7px] mr-0.5"></i>자동</span>';
      }

      html += '<div class="p-2 border rounded bg-gray-50 space-y-1">';
      html += '<div class="flex justify-between items-start">';
      html += '<div class="text-xs font-medium">' + schTypeLabel(it.type) + ' <span class="' + typeClass + '">' + (it.flow === 'IN' ? '입금' : '지급') + '</span></div>';
      html += '<div>' + statusBadge + '</div>';
      html += '</div>';
      html += '<div class="text-[11px] text-gray-600">' + escapeHtml(it.name || '-') + '</div>';
      html += '<div class="text-sm font-bold tabular-nums text-gray-900">' + fmt(it.amount) + '</div>';
      if (it.materialized && it.schedule_id) {
        html += '<div class="flex gap-1 pt-1">';
        if (it.status !== 'DONE') {
          html += '<button onclick="schCompleteItem(' + it.schedule_id + ')" class="px-2 py-0.5 text-[10px] bg-green-600 text-white rounded hover:bg-green-700">완료</button>';
          // '수정' 버튼 제거: schEditItem 미구현(ReferenceError 유발)이라 제거. 수정 필요 시 삭제 후 재등록.
        }
        html += '<button onclick="schDeleteItem(' + it.schedule_id + ')" class="px-2 py-0.5 text-[10px] border border-red-300 text-red-700 rounded hover:bg-red-50">삭제</button>';
        html += '</div>';
      }
      html += '</div>';
    });
  }

  document.getElementById('schDayModalContent').innerHTML = html;
  document.getElementById('schDayModal').classList.remove('hidden');
};

window.schCloseDayDetail = function() {
  document.getElementById('schDayModal').classList.add('hidden');
};

window.schCompleteItem = async function(id) {
  if (!(await showConfirm('완료 처리하시겠습니까?'))) return;
  try {
    var today = fmtDate(new Date());
    var res = await axios.patch('/api/cash-flow/schedule/' + id + '/complete', {
      actual_date: today,
      actual_amount: null
    });
    if (res.data.success) {
      showToast('완료 처리되었습니다.', 'success');
      await loadSchedule();
      if (schDetailDate) schOpenDayDetail(schDetailDate);
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.schDeleteItem = async function(id) {
  if (!(await showConfirm('삭제하시겠습니까?', { danger: true }))) return;
  try {
    var res = await axios.delete('/api/cash-flow/schedule/' + id);
    if (res.data.success) {
      showToast('삭제되었습니다.', 'success');
      schCloseDayDetail();
      loadSchedule();
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.schOpenAddModal = function() {
  document.getElementById('schAddDate').valueAsDate = new Date();
  document.getElementById('schAddType').value = 'IN';
  document.getElementById('schAddSource').value = 'ORDER';
  document.getElementById('schAddAmount').value = '';
  document.getElementById('schAddDesc').value = '';
  var cs = document.getElementById('schAddClientSearch'); if (cs) cs.value = '';
  var ci = document.getElementById('schAddClientId'); if (ci) ci.value = '';
  var cd = document.getElementById('schAddClientDropdown'); if (cd) cd.classList.add('hidden');
  clearErrors();
  document.getElementById('schAddModal').classList.remove('hidden');
};

window.schCloseAddModal = function() {
  document.getElementById('schAddModal').classList.add('hidden');
  var cd = document.getElementById('schAddClientDropdown'); if (cd) cd.classList.add('hidden');
};

// 거래처 검색 autocomplete (디바운스) — bank.js 패턴, sch* prefix(?raw 전역스코프 충돌 방지)
var schClientTimer = null;
window.schSearchClient = function(query) {
  var dropdown = document.getElementById('schAddClientDropdown');
  if (!dropdown) return;
  // 입력이 비면 선택 해제 + 드롭다운 닫기
  if (!query || !query.trim()) {
    var ci0 = document.getElementById('schAddClientId'); if (ci0) ci0.value = '';
    dropdown.classList.add('hidden');
    return;
  }
  if (schClientTimer) clearTimeout(schClientTimer);
  schClientTimer = setTimeout(function() {
    axios.get('/api/cash-flow/clients/search?q=' + encodeURIComponent(query)).then(function(r) {
      var items = (r.data && r.data.data) || [];
      if (!items.length) {
        dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-gray-400">검색 결과 없음</div>';
        dropdown.classList.remove('hidden');
        return;
      }
      var html = '';
      items.forEach(function(cl) {
        var safe = String(cl.client_name || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        var rep = cl.representative ? ' <span class="text-gray-400 text-xs">(' + String(cl.representative).replace(/</g,'&lt;') + ')</span>' : '';
        html += '<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50" onclick="schSelectClient(' + cl.id + ',\'' + safe.replace(/'/g, "\\'") + '\')">';
        html += '<span class="font-medium">' + safe + '</span>' + rep + '</div>';
      });
      dropdown.innerHTML = html;
      dropdown.classList.remove('hidden');
    }).catch(function() { dropdown.classList.add('hidden'); });
  }, 200);
};

window.schSelectClient = function(clientId, clientName) {
  var cs = document.getElementById('schAddClientSearch'); if (cs) cs.value = clientName;
  var ci = document.getElementById('schAddClientId'); if (ci) ci.value = clientId;
  var cd = document.getElementById('schAddClientDropdown'); if (cd) cd.classList.add('hidden');
};

// 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
  var t = e.target;
  if (t && t.closest && !t.closest('#schAddClientSearch') && !t.closest('#schAddClientDropdown')) {
    var cd = document.getElementById('schAddClientDropdown');
    if (cd && !cd.classList.contains('hidden')) cd.classList.add('hidden');
  }
});

function clearErrors() {
  document.getElementById('schAddDateErr').textContent = '';
  document.getElementById('schAddAmountErr').textContent = '';
}

window.schSave = async function() {
  clearErrors();
  var date = document.getElementById('schAddDate').value;
  var type = document.getElementById('schAddType').value;
  var source = document.getElementById('schAddSource').value;
  var amount = (window.parseMoney ? window.parseMoney(document.getElementById('schAddAmount').value) : parseInt(String(document.getElementById('schAddAmount').value || '').replace(/[^\d.-]/g, ''))) || 0;
  var desc = document.getElementById('schAddDesc').value;

  if (!date) { showFieldError('schAddDate', '필수 입력'); return; }
  if (amount <= 0) { showFieldError('schAddAmount', '0보다 큰 금액 입력'); return; }

  try {
    var res = await axios.post('/api/cash-flow/schedule', {
      schedule_date: date,
      flow_type: type,
      source_type: source,
      amount: amount,
      description: desc || null,
      client_id: (document.getElementById('schAddClientId') && document.getElementById('schAddClientId').value) || null
    });
    if (res.data.success) {
      showToast('예정이 등록되었습니다.', 'success');
      schCloseAddModal();
      loadSchedule();
    } else {
      showToast('실패: ' + res.data.error, 'error');
    }
  } catch (e) {
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

window.switchScheduleTab = function(tab) {
  // schedule(자금계획) | monthly(월별요약) | fixed(고정비) | loans(대출) | forecast(추정자금일보)
  // monthly/fixed/loans 로더는 cashFlow.js(IIFE)가 window에 노출
  ['schedule', 'monthly', 'fixed', 'loans', 'forecast'].forEach(function(t) {
    var btn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    var panel = document.getElementById(t + 'Panel');
    if (!btn || !panel) return;
    if (t === tab) {
      btn.className = 'px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600 flex items-center gap-2';
      panel.classList.remove('hidden');
      if (t === 'forecast' && !schForecastData) prefillThenForecast();
      if (t === 'monthly' && window.loadMonthly) window.loadMonthly();
      if (t === 'fixed' && window.loadFixedExpenses) window.loadFixedExpenses();
      if (t === 'loans' && window.loadLoans) window.loadLoans();
    } else {
      btn.className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2';
      panel.classList.add('hidden');
    }
  });
};

// Phase 4: 추정자금일보 첫 진입 시 은행 실잔액을 시작잔액에 자동 prefill (사용자 미입력 시에만)
async function prefillBankBalance() {
  try {
    var el = document.getElementById('fcStartBalance');
    if (!el) return;
    var cur = (el.value || '').replace(/[^\d.-]/g, '');
    if (cur && cur !== '0') return; // 사용자가 이미 입력한 값은 건드리지 않음
    var res = await axios.get('/api/cash-flow/schedule/bank-balance');
    if (res.data.success) {
      el.value = Math.round(res.data.data.total_balance || 0).toLocaleString();
    }
  } catch (e) { console.warn('[cashSchedule] bank-balance prefill 실패', e); }
}
async function prefillThenForecast() {
  await prefillBankBalance();
  loadForecast();
}

window.loadForecast = async function() {
  try {
    var startBalance = (window.parseMoney ? window.parseMoney(document.getElementById('fcStartBalance').value) : parseInt(String(document.getElementById('fcStartBalance').value || '').replace(/[^\d.-]/g, ''))) || 0;
    var days = document.getElementById('fcDays').value;
    var res = await axios.get('/api/cash-flow/schedule/forecast?days=' + days + '&start_balance=' + startBalance);
    if (!res.data.success) {
      showToast('예측 로드 실패', 'error');
      return;
    }
    schForecastData = res.data.data;
    renderForecast();
  } catch (e) {
    console.error('loadForecast error:', e);
    showToast('오류: ' + (e.response?.data?.error || e.message), 'error');
  }
};

function renderForecast() {
  if (!schForecastData) return;

  var d = schForecastData;

  // KPI
  document.getElementById('fcKpiEndBalance').textContent = fmt(d.end_balance);
  document.getElementById('fcKpiMinBalance').textContent = fmt(d.min_balance);
  document.getElementById('fcKpiMaxBalance').textContent = fmt(d.max_balance);
  document.getElementById('fcKpiRiskDays').textContent = d.risk_days_count;

  // 차트 (간단한 바 차트)
  var forecast = d.forecast || [];
  var maxBalance = Math.max(d.max_balance, 1);
  var minBalance = Math.min(d.min_balance, 0);
  var range = maxBalance - minBalance;

  var chartHtml = '';
  forecast.forEach(function(row, idx) {
    if (idx % 3 === 0) { // 3일마다 표시
      var h = range > 0 ? 150 * (row.balance - minBalance) / range : 75;
      h = Math.max(h, 2);
      var color = row.balance < 0 ? '#dc2626' : '#2563eb';
      chartHtml += '<div class="text-center flex-shrink-0" style="width:40px;">';
      chartHtml += '<div style="height:' + h + 'px; background:' + color + '; border-radius:2px; margin-bottom:4px;"></div>';
      chartHtml += '<div class="text-[7px] text-gray-600">' + row.date.substring(5) + '</div>';
      chartHtml += '</div>';
    }
  });
  document.getElementById('fcChart').innerHTML = chartHtml;

  // 위험일 테이블
  var riskDays = d.risk_days || [];
  var riskHtml = '';
  if (riskDays.length === 0) {
    riskHtml = '<div class="text-sm text-gray-400 text-center py-4">음수 잔액 일자가 없습니다.</div>';
  } else {
    riskHtml = '<table class="w-full text-xs"><thead><tr class="bg-gray-50">' +
      '<th class="px-2 py-1.5 text-left text-gray-600">날짜</th>' +
      '<th class="px-2 py-1.5 text-right text-gray-600">잔액</th>' +
      '</tr></thead><tbody>';
    riskDays.forEach(function(row) {
      riskHtml += '<tr class="border-b border-gray-100 hover:bg-red-50/30">' +
        '<td class="px-2 py-1">' + row.date + '</td>' +
        '<td class="px-2 py-1 text-right font-medium text-red-600 tabular-nums">' + fmt(row.balance) + '</td>' +
        '</tr>';
    });
    riskHtml += '</tbody></table>';
  }
  document.getElementById('fcRiskTable').innerHTML = riskHtml;

  // 예측 테이블
  var fcHtml = '<table class="w-full text-xs"><thead><tr class="bg-gray-50">' +
    '<th class="px-2 py-1.5 text-left text-gray-600">날짜</th>' +
    '<th class="px-2 py-1.5 text-right text-gray-600">입금</th>' +
    '<th class="px-2 py-1.5 text-right text-gray-600">지급</th>' +
    '<th class="px-2 py-1.5 text-right text-gray-600">순이동</th>' +
    '<th class="px-2 py-1.5 text-right text-gray-600">잔액</th>' +
    '</tr></thead><tbody>';
  forecast.forEach(function(row) {
    var rowClass = row.balance < 0 ? 'bg-red-50/30' : '';
    fcHtml += '<tr class="border-b border-gray-100 ' + rowClass + '">' +
      '<td class="px-2 py-1">' + row.date + '</td>' +
      '<td class="px-2 py-1 text-right text-green-600 tabular-nums">' + fmt(row.in_amount) + '</td>' +
      '<td class="px-2 py-1 text-right text-red-600 tabular-nums">' + fmt(row.out_amount) + '</td>' +
      '<td class="px-2 py-1 text-right tabular-nums">' + fmt(row.net) + '</td>' +
      '<td class="px-2 py-1 text-right font-medium tabular-nums ' + (row.balance < 0 ? 'text-red-600' : 'text-gray-900') + '">' + fmt(row.balance) + '</td>' +
      '</tr>';
  });
  fcHtml += '</tbody></table>';
  document.getElementById('fcForecastTable').innerHTML = fcHtml;
}

// showToast, showFieldError는 layout.ts의 SHARED_AUTH_JS에서 전역으로 제공됨
// 로컬 fallback 정의하면 호이스팅으로 window.showToast를 덮어써서 무한 재귀 발생 → 정의하지 말 것

// ============================================================
// 초기화 (모든 window.* 함수 정의 이후 실행)
// ============================================================
(function init() {
  var today = new Date();
  schCurrentYear = today.getFullYear();
  schCurrentMonth = today.getMonth() + 1;
  var addDateEl = document.getElementById('schAddDate');
  if (addDateEl) addDateEl.valueAsDate = today;
  window.loadSchedule();
})();
