// ===== 장비 현황 페이지 스크립트 =====

var equipmentList = [];
var capacityData = null;
var equipmentLoadData = null;
var productionTodayData = null;
var weeklyTrendData = null;

// ===== 초기화: 날짜 범위 설정 =====
(function() {
  var today = new Date();
  var thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  document.getElementById('fToDate').valueAsDate = today;
  document.getElementById('fFromDate').valueAsDate = thirtyDaysAgo;
})();

// ===== 메인 데이터 로드 =====
async function loadEquipmentData() {
  try {
    const fromDate = document.getElementById('fFromDate').value;
    const toDate = document.getElementById('fToDate').value;

    // 병렬 로드: 용량 분석, 장비 로드, 금일 생산, 주간 트렌드
    const [capacityRes, loadRes, todayRes, weeklyRes] = await Promise.all([
      authFetch('/api/forecast/capacity-analysis?months=3'),
      authFetch('/api/dashboard/equipment-load'),
      authFetch('/api/dashboard/stats/production-today'),
      authFetch('/api/forecast/capacity-analysis?months=3') // weekly trend는 capacity-analysis에서 추출
    ]);

    capacityData = (await capacityRes.json()).data || {};
    equipmentLoadData = (await loadRes.json()).data || [];
    productionTodayData = (await todayRes.json()).data || {};
    weeklyTrendData = capacityData.weekly_trend || [];

    // 장비 목록 구성
    equipmentList = equipmentLoadData.map(function(eq) {
      // capacity-analysis에서 해당 장비 데이터 찾기
      var capData = (capacityData.equipment || []).find(function(e) {
        return e.printer_name === eq.name;
      });

      return {
        id: eq.id,
        name: eq.name,
        status: eq.agent_status,
        equipmentStatus: eq.equipment_status,
        queue: eq.queue_count || 0,
        dailyCapacity: eq.daily_capacity || 0,
        // capacity-analysis 데이터
        utilization: capData ? capData.utilization : 0,
        activeDays: capData ? capData.active_days : 0,
        totalPrints: capData ? capData.total_prints : 0,
        okPrints: capData ? capData.ok_prints : 0,
        successRate: capData ? capData.success_rate : 0,
        avgDaily: capData ? capData.avg_daily : 0,
        peakDaily: capData ? capData.peak_daily : 0,
      };
    });

    updateSummaryCards();
    renderUtilizationChart();
    renderEquipmentTable();
    renderWeeklyTrend();
  } catch (error) {
    console.error('Error loading equipment data:', error);
    showToast('장비 데이터를 불러올 수 없습니다.', 'error');
  }
}

// ===== 요약 카드 업데이트 =====
function updateSummaryCards() {
  var total = equipmentList.length;
  var active = equipmentList.filter(function(eq) { return eq.status === 'ONLINE'; }).length;
  var todayTotal = productionTodayData.total_prints || 0;
  var todayOk = productionTodayData.ok_count || 0;

  var avgUtil = equipmentList.length > 0
    ? Math.round(equipmentList.reduce(function(s, eq) { return s + eq.utilization; }, 0) / equipmentList.length)
    : 0;

  document.getElementById('totalEquipment').textContent = total.toString();
  document.getElementById('totalEquipmentSub').textContent = '장비';

  document.getElementById('activeEquipment').textContent = active.toString();
  document.getElementById('activeEquipmentSub').textContent = '온라인 / ' + total + '개';

  document.getElementById('todayPrints').textContent = todayTotal.toString();
  var successPct = todayTotal > 0 ? Math.round(todayOk / todayTotal * 100) : 0;
  document.getElementById('todayPrintsSub').textContent = '성공률 ' + successPct + '%';

  document.getElementById('avgUtilization').textContent = avgUtil.toString();
}

// ===== 색상 함수 (가동률 기준) =====
function getUtilizationColor(utilization) {
  if (utilization >= 80) return '#16a34a'; // green-600
  if (utilization >= 50) return '#f59e0b'; // amber-500
  return '#dc2626'; // red-600
}

// ===== 장비별 가동률 차트 =====
function renderUtilizationChart() {
  var container = document.getElementById('utilizationChartContainer');

  if (equipmentList.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:48px;"><i class="fas fa-cogs" style="font-size:36px;color:#d1d5db;margin-bottom:12px;display:block;"></i><p style="color:#6b7280;font-size:13px;">장비 데이터가 없습니다.</p></div>';
    return;
  }

  // 가동률 기준 내림차순 정렬
  var sorted = equipmentList.slice().sort(function(a, b) { return b.utilization - a.utilization; });

  var html = '';
  sorted.forEach(function(eq) {
    var color = getUtilizationColor(eq.utilization);
    var statusBadge = eq.status === 'ONLINE'
      ? '<span class="status-badge online">온라인</span>'
      : '<span class="status-badge offline">오프라인</span>';

    html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--c-border);">';
    html += '  <div style="min-width:120px;font-size:13px;font-weight:600;color:#374151;">' + eq.name + '</div>';
    html += '  <div style="min-width:80px;">' + statusBadge + '</div>';
    html += '  <div class="utilization-bar">';
    html += '    <div class="utilization-bar-fill" style="background:' + color + ';opacity:0.15;">';
    html += '      <div style="width:' + eq.utilization + '%;height:100%;background:' + color + ';transition:width 0.3s;"></div>';
    html += '    </div>';
    html += '    <div class="utilization-bar-label" style="color:' + color + ';">' + eq.utilization + '%</div>';
    html += '  </div>';
    html += '</div>';
  });

  container.innerHTML = html;
}

// ===== 장비별 실적 테이블 =====
function renderEquipmentTable() {
  var tbody = document.getElementById('equipmentBody');

  if (equipmentList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:48px;"><div style="display:flex;flex-direction:column;align-items:center;"><i class="fas fa-cogs" style="font-size:36px;color:#d1d5db;margin-bottom:12px;"></i><p style="color:#6b7280;font-size:13px;margin:0;">장비 데이터가 없습니다.</p></div></td></tr>';
    return;
  }

  // 출력건수 기준 내림차순
  var sorted = equipmentList.slice().sort(function(a, b) { return b.totalPrints - a.totalPrints; });

  var html = '';
  sorted.forEach(function(eq) {
    var color = getUtilizationColor(eq.utilization);
    var statusBadge = eq.status === 'ONLINE'
      ? '<span class="status-badge online">온라인</span>'
      : '<span class="status-badge offline">오프라인</span>';

    var avgTime = eq.totalPrints > 0
      ? Math.round((eq.totalPrints * 60) / eq.totalPrints) // 평균 시간 (초 단위, 대략치)
      : 0;

    html += '<tr>';
    html += '  <td style="font-weight:600;color:#374151;">' + eq.name + '</td>';
    html += '  <td style="text-align:center;">' + statusBadge + '</td>';
    html += '  <td style="text-align:right;color:#3b82f6;font-weight:600;">' + eq.totalPrints.toLocaleString() + '</td>';
    html += '  <td style="text-align:center;color:#10b981;font-weight:600;">' + eq.successRate + '%</td>';
    html += '  <td style="text-align:right;color:#666;">-</td>';
    html += '  <td style="text-align:center;">';
    html += '    <div class="utilization-bar" style="margin:0;">';
    html += '      <div class="utilization-bar-fill" style="background:' + color + ';opacity:0.15;">';
    html += '        <div style="width:' + eq.utilization + '%;height:100%;background:' + color + ';"></div>';
    html += '      </div>';
    html += '      <div class="utilization-bar-label" style="color:' + color + ';min-width:35px;">' + eq.utilization + '%</div>';
    html += '    </div>';
    html += '  </td>';
    html += '  <td style="text-align:center;"></td>';
    html += '</tr>';
  });

  tbody.innerHTML = html;
}

// ===== 주간 트렌드 =====
function renderWeeklyTrend() {
  var container = document.getElementById('weeklyTrendContainer');

  if (!weeklyTrendData || weeklyTrendData.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:32px;color:#9ca3af;width:100;">주간 데이터가 없습니다.</div>';
    return;
  }

  // 최근 12주만 표시
  var recent = weeklyTrendData.slice(-12);
  var maxTotal = Math.max.apply(null, recent.map(function(w) { return w.total || 0; }));

  if (maxTotal === 0) maxTotal = 1;

  var html = '';
  recent.forEach(function(week, idx) {
    var pct = (week.total / maxTotal * 100).toFixed(0);
    var week_label = week.week || 'W' + idx;

    html += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">';
    html += '  <div class="trend-bar" style="width:100%;max-width:24px;height:' + pct + 'px;background:#f59e0b;"></div>';
    html += '  <div style="font-size:10px;color:#9ca3af;text-align:center;">' + week_label.slice(-2) + '</div>';
    html += '  <div style="font-size:11px;font-weight:600;color:#374151;">' + (week.total || 0).toLocaleString() + '</div>';
    html += '</div>';
  });

  container.innerHTML = html;
}

// ===== 페이지 로드 시 실행 =====
loadEquipmentData();
