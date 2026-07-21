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
    html += '<div class="card-body"><div class="table-responsive"><table class="ds-table data-table"><thead><tr>';
    html += '<th class="col-name">장비</th><th class="col-flex">정비 항목</th><th class="col-qty text-right">주기</th><th class="col-date">마지막 수행</th><th class="col-date">다음 예정</th><th class="col-status text-center">상태</th>';
    html += '</tr></thead><tbody>';
    if (d.schedules.length === 0) {
      html += '<tr><td colspan="6" class="text-center text-secondary">등록된 스케줄 없음</td></tr>';
    }
    d.schedules.forEach(function(s) {
      var badge = s.due_status === 'OVERDUE' ? '<span class="badge badge-danger"><i class="fas fa-exclamation-triangle mr-1"></i>초과</span>'
        : s.due_status === 'DUE_SOON' ? '<span class="badge badge-warning"><i class="far fa-clock mr-1"></i>임박</span>'
        : '<span class="badge badge-success"><i class="fas fa-check-circle mr-1"></i>정상</span>';
      html += '<tr>';
      html += '<td title="' + esc(s.equipment_name) + '">' + esc(s.equipment_name) + '</td>';
      html += '<td title="' + esc(s.title) + '">' + esc(s.title) + '</td>';
      html += '<td class="text-right">' + s.interval_days + '일</td>';
      html += '<td>' + (s.last_performed_at ? s.last_performed_at.split('T')[0] : '-') + '</td>';
      html += '<td>' + (s.next_due_at || '-') + '</td>';
      html += '<td class="text-center">' + badge + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div></div>';

    // 소모품 현황
    html += '<div class="card mb-4"><div class="card-header"><h3 class="card-title"><i class="fas fa-tint mr-2"></i>소모품 교체 현황</h3></div>';
    html += '<div class="card-body"><div class="table-responsive"><table class="ds-table data-table"><thead><tr>';
    html += '<th class="col-name">장비</th><th class="col-flex">소모품명</th><th class="col-qty text-right">교체주기</th><th class="col-date">다음 교체일</th><th class="col-qty text-right">재고</th><th class="col-status text-center">상태</th>';
    html += '</tr></thead><tbody>';
    if (d.consumables.length === 0) {
      html += '<tr><td colspan="6" class="text-center text-secondary">등록된 소모품 없음</td></tr>';
    }
    d.consumables.forEach(function(item) {
      var badge = item.due_status === 'OVERDUE' ? '<span class="badge badge-danger"><i class="fas fa-exclamation-triangle mr-1"></i>초과</span>'
        : item.due_status === 'DUE_SOON' ? '<span class="badge badge-warning"><i class="far fa-clock mr-1"></i>임박</span>'
        : '<span class="badge badge-success"><i class="fas fa-check-circle mr-1"></i>정상</span>';
      html += '<tr>';
      html += '<td title="' + esc(item.equipment_name) + '">' + esc(item.equipment_name) + '</td>';
      html += '<td title="' + esc(item.name) + '">' + esc(item.name) + '</td>';
      html += '<td class="text-right">' + (item.replacement_cycle_days || '-') + '일</td>';
      html += '<td>' + (item.next_due_at || '-') + '</td>';
      html += '<td class="text-right">' + (item.quantity_on_hand != null ? item.quantity_on_hand : '-') + '</td>';
      html += '<td class="text-center">' + badge + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div></div>';

    // 최근 정비 이력
    html += '<div class="card mb-4"><div class="card-header"><h3 class="card-title"><i class="fas fa-history mr-2"></i>최근 30일 정비 이력</h3></div>';
    html += '<div class="card-body"><div class="table-responsive"><table class="ds-table data-table"><thead><tr>';
    html += '<th class="col-date">일시</th><th class="col-flex">장비</th><th class="col-tag text-center">유형</th><th class="col-name">내용</th><th class="col-qty text-right">다운타임</th><th class="col-amount text-right">비용</th>';
    html += '</tr></thead><tbody>';
    if (d.recent_logs.length === 0) {
      html += '<tr><td colspan="6" class="text-center text-secondary">최근 정비 이력 없음</td></tr>';
    }
    d.recent_logs.forEach(function(log) {
      // equipment.js LOG_TYPE_MAP과 통일 (실제 valid log_type: rip.ts validTypes)
      var typeLabel = { MAINTENANCE: '정기 점검', REPAIR: '수리', PART_REPLACEMENT: '부품 교체', STATUS_CHANGE: '상태 변경', INSPECTION: '검사' };
      html += '<tr>';
      html += '<td>' + (log.performed_at ? log.performed_at.split('T')[0] : '-') + '</td>';
      html += '<td title="' + esc(log.equipment_name) + '">' + esc(log.equipment_name) + '</td>';
      html += '<td class="text-center"><span class="badge badge-info">' + (typeLabel[log.log_type] || log.log_type) + '</span></td>';
      html += '<td title="' + esc(log.description || '') + '">' + esc(log.description || '-') + '</td>';
      html += '<td class="text-right">' + (log.downtime_minutes || 0) + '분</td>';
      html += '<td class="text-right">' + formatWon(log.cost || 0) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div></div>';

    // 장비별 정비 비용 (90일)
    html += '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-chart-pie mr-2"></i>장비별 정비 비용 (90일)</h3></div>';
    html += '<div class="card-body"><div class="table-responsive"><table class="ds-table data-table"><thead><tr>';
    html += '<th class="col-name">장비</th><th class="col-qty text-right">정비 횟수</th><th class="col-amount text-right">총 비용</th><th class="col-qty text-right">총 다운타임</th>';
    html += '</tr></thead><tbody>';
    d.cost_summary.forEach(function(item) {
      html += '<tr>';
      html += '<td title="' + esc(item.equipment_name) + '">' + esc(item.equipment_name) + '</td>';
      html += '<td class="text-right">' + item.log_count + '회</td>';
      html += '<td class="text-right">' + formatWon(item.total_cost) + '</td>';
      html += '<td class="text-right">' + Math.round(item.total_downtime_min / 60 * 10) / 10 + '시간</td>';
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

  function esc(s) { return s == null ? '' : window.escapeHtml(String(s)); }

  // 사이드바 통합: /equipment 허브 이식 시 __maintDefer=true → 정비 탭 첫 진입에 window.__maintInit 호출(멱등). 단독 /maintenance는 flag 없어 즉시.
  var __maintInited = false;
  window.__maintInit = function() { if (__maintInited) return; __maintInited = true; init(); };
  if (!window.__maintDefer) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', window.__maintInit);
    } else {
      window.__maintInit();
    }
  }
})();
