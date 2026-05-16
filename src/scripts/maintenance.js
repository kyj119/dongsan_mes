// maintenance.js — 정비 관리 페이지 스크립트
(function() {
  var state = { dashboard: null, loading: true };

  function init() {
    loadDashboard();
  }

  async function loadDashboard() {
    state.loading = true;
    render();
    try {
      var res = await axios.get('/api/rip/maintenance/dashboard');
      if (res.data.success) {
        state.dashboard = res.data.data;
      }
    } catch (e) {
      console.error('maintenance dashboard error:', e);
    }
    state.loading = false;
    render();
  }

  function render() {
    var container = document.getElementById('maintenanceContent');
    if (!container) return;

    if (state.loading) {
      container.innerHTML = '<div class="skeleton-list"><div class="skeleton-item"></div><div class="skeleton-item"></div><div class="skeleton-item"></div></div>';
      return;
    }

    var d = state.dashboard;
    if (!d) {
      container.innerHTML = '<p class="text-secondary">데이터를 불러올 수 없습니다.</p>';
      return;
    }

    var html = '';

    // KPI 카드
    html += '<div class="grid grid-cols-4 gap-4 mb-6">';
    html += kpiCard('초과 정비', d.kpi.overdue, d.kpi.overdue > 0 ? 'danger' : 'success', 'fa-exclamation-triangle');
    html += kpiCard('7일내 예정', d.kpi.due_soon, d.kpi.due_soon > 0 ? 'warning' : 'success', 'fa-clock');
    html += kpiCard('90일 정비비', formatWon(d.kpi.total_cost_90d), '', 'fa-won-sign');
    html += kpiCard('90일 다운타임', Math.round(d.kpi.total_downtime_90d_min / 60) + 'h', '', 'fa-hourglass-half');
    html += '</div>';

    // PM 스케줄
    html += '<div class="card mb-4"><div class="card-header"><h3 class="card-title"><i class="fas fa-calendar-check mr-2"></i>예방정비 스케줄</h3></div>';
    html += '<div class="card-body"><div class="table-responsive"><table class="data-table"><thead><tr>';
    html += '<th>장비</th><th>정비 항목</th><th>주기</th><th>마지막 수행</th><th>다음 예정</th><th>상태</th>';
    html += '</tr></thead><tbody>';
    if (d.schedules.length === 0) {
      html += '<tr><td colspan="6" class="text-center text-secondary">등록된 스케줄 없음</td></tr>';
    }
    d.schedules.forEach(function(s) {
      var badge = s.due_status === 'OVERDUE' ? '<span class="badge badge-danger">초과</span>'
        : s.due_status === 'DUE_SOON' ? '<span class="badge badge-warning">임박</span>'
        : '<span class="badge badge-success">정상</span>';
      html += '<tr>';
      html += '<td>' + esc(s.equipment_name) + '</td>';
      html += '<td>' + esc(s.title) + '</td>';
      html += '<td>' + s.interval_days + '일</td>';
      html += '<td>' + (s.last_performed_at ? s.last_performed_at.split('T')[0] : '-') + '</td>';
      html += '<td>' + (s.next_due_at || '-') + '</td>';
      html += '<td>' + badge + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div></div>';

    // 소모품 현황
    html += '<div class="card mb-4"><div class="card-header"><h3 class="card-title"><i class="fas fa-tint mr-2"></i>소모품 교체 현황</h3></div>';
    html += '<div class="card-body"><div class="table-responsive"><table class="data-table"><thead><tr>';
    html += '<th>장비</th><th>소모품명</th><th>교체주기</th><th>다음 교체일</th><th>재고</th><th>상태</th>';
    html += '</tr></thead><tbody>';
    if (d.consumables.length === 0) {
      html += '<tr><td colspan="6" class="text-center text-secondary">등록된 소모품 없음</td></tr>';
    }
    d.consumables.forEach(function(item) {
      var badge = item.due_status === 'OVERDUE' ? '<span class="badge badge-danger">초과</span>'
        : item.due_status === 'DUE_SOON' ? '<span class="badge badge-warning">임박</span>'
        : '<span class="badge badge-success">정상</span>';
      html += '<tr>';
      html += '<td>' + esc(item.equipment_name) + '</td>';
      html += '<td>' + esc(item.name) + '</td>';
      html += '<td>' + (item.replacement_cycle_days || '-') + '일</td>';
      html += '<td>' + (item.next_due_at || '-') + '</td>';
      html += '<td>' + (item.quantity_on_hand != null ? item.quantity_on_hand : '-') + '</td>';
      html += '<td>' + badge + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div></div>';

    // 최근 정비 이력
    html += '<div class="card mb-4"><div class="card-header"><h3 class="card-title"><i class="fas fa-history mr-2"></i>최근 30일 정비 이력</h3></div>';
    html += '<div class="card-body"><div class="table-responsive"><table class="data-table"><thead><tr>';
    html += '<th>일시</th><th>장비</th><th>유형</th><th>내용</th><th>다운타임</th><th>비용</th>';
    html += '</tr></thead><tbody>';
    if (d.recent_logs.length === 0) {
      html += '<tr><td colspan="6" class="text-center text-secondary">최근 정비 이력 없음</td></tr>';
    }
    d.recent_logs.forEach(function(log) {
      var typeLabel = { MAINTENANCE: '예방정비', REPAIR: '수리', CLEANING: '청소', CALIBRATION: '교정', SERVICE: '서비스' };
      html += '<tr>';
      html += '<td>' + (log.performed_at ? log.performed_at.split('T')[0] : '-') + '</td>';
      html += '<td>' + esc(log.equipment_name) + '</td>';
      html += '<td><span class="badge badge-info">' + (typeLabel[log.log_type] || log.log_type) + '</span></td>';
      html += '<td>' + esc(log.description || '-') + '</td>';
      html += '<td>' + (log.downtime_minutes || 0) + '분</td>';
      html += '<td>' + formatWon(log.cost || 0) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div></div>';

    // 장비별 정비 비용 (90일)
    html += '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-chart-pie mr-2"></i>장비별 정비 비용 (90일)</h3></div>';
    html += '<div class="card-body"><div class="table-responsive"><table class="data-table"><thead><tr>';
    html += '<th>장비</th><th>정비 횟수</th><th>총 비용</th><th>총 다운타임</th>';
    html += '</tr></thead><tbody>';
    d.cost_summary.forEach(function(item) {
      html += '<tr>';
      html += '<td>' + esc(item.equipment_name) + '</td>';
      html += '<td>' + item.log_count + '회</td>';
      html += '<td>' + formatWon(item.total_cost) + '</td>';
      html += '<td>' + Math.round(item.total_downtime_min / 60 * 10) / 10 + '시간</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div></div>';

    container.innerHTML = html;
  }

  function kpiCard(label, value, color, icon) {
    var colorClass = color === 'danger' ? 'color: var(--c-danger)' : color === 'warning' ? 'color: var(--c-warning)' : color === 'success' ? 'color: var(--c-success)' : '';
    return '<div class="summary-card card p-4">'
      + '<div class="label"><i class="fas ' + icon + ' mr-1"></i>' + label + '</div>'
      + '<div class="value" style="' + colorClass + '">' + value + '</div>'
      + '</div>';
  }

  function formatWon(v) {
    if (!v) return '₩0';
    return '₩' + Number(v).toLocaleString();
  }

  function esc(s) { return s ? String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''; }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
