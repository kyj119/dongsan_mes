import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import prodReportsScript from '../scripts/productionReports.js?raw'
import costAnalysisScript from '../scripts/costAnalysis.js?raw'

export function productionReportsPage(c: Context<HonoEnv>) {
  const tabSwitchScript = `
window.switchProdAnalysisTab = function(tab) {
  var map = {
    production: { content: 'prodAnaProductionContent', tab: 'prodAnaTabProduction' },
    cost:       { content: 'prodAnaCostContent',       tab: 'prodAnaTabCost' },
    oee:        { content: 'prodAnaOeeContent',        tab: 'prodAnaTabOee' }
  };
  Object.keys(map).forEach(function(k) {
    var m = map[k];
    var content = document.getElementById(m.content);
    var btn = document.getElementById(m.tab);
    var on = (k === tab);
    if (content) content.classList.toggle('hidden', !on);
    if (btn) {
      if (on) { btn.classList.remove('border-transparent', 'text-gray-500'); btn.classList.add('border-blue-600', 'text-blue-600'); }
      else { btn.classList.remove('border-blue-600', 'text-blue-600'); btn.classList.add('border-transparent', 'text-gray-500'); }
    }
  });
  if (tab === 'oee' && typeof window.oeeInit === 'function') window.oeeInit();
};
(function() {
  var p = new URLSearchParams(window.location.search);
  var t = p.get('tab');
  var target = null;
  if (t === 'cost' || window.location.hash === '#cost') target = 'cost';
  else if (t === 'oee' || window.location.hash === '#oee') target = 'oee';
  // oeeInit 등은 하위 스크립트에서 정의되므로 스크립트 실행 완료 후 전환
  if (target) setTimeout(function() { window.switchProdAnalysisTab(target); }, 0);
})();
`;

  const combinedScript = tabSwitchScript + '\n' + prodReportsScript + '\n' + costAnalysisScript;

  return renderPage(c, {
    title: '생산 분석',
    activePage: '/production-reports',
    pageContent: `
            <!-- 상위 탭 -->
            <div class="flex border-b mb-6">
              <button onclick="switchProdAnalysisTab('production')" id="prodAnaTabProduction" class="px-5 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
                <i class="fas fa-chart-bar mr-1"></i>생산 실적
              </button>
              <button onclick="switchProdAnalysisTab('cost')" id="prodAnaTabCost" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-calculator mr-1"></i>원가 분석
              </button>
              <button onclick="switchProdAnalysisTab('oee')" id="prodAnaTabOee" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-gauge-high mr-1"></i>설비효율(OEE)
              </button>
            </div>

            <!-- 생산 실적 콘텐츠 -->
            <div id="prodAnaProductionContent">

            <!-- 내부 탭: 일일 생산 | 기간 분석 -->
            <div class="flex border-b mb-4">
              <button onclick="switchMainTab('daily')" id="mainTabDaily" class="px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-600">
                <i class="fas fa-calendar-day mr-1"></i>일일 생산
              </button>
              <button onclick="switchMainTab('period')" id="mainTabPeriod" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-chart-bar mr-1"></i>기간 분석
              </button>
            </div>

            <!-- 일일 생산 패널 -->
            <div id="mainPanelDaily">
              <div class="space-y-6">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <button onclick="changeDailyDate(-1)" class="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"><i class="fas fa-chevron-left"></i></button>
                    <input type="date" id="reportDate" class="px-3 py-1.5 text-sm border rounded-lg" onchange="loadDailySummary()">
                    <button onclick="changeDailyDate(1)" class="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"><i class="fas fa-chevron-right"></i></button>
                    <button onclick="setToday()" class="ds-btn ds-btn-primary">오늘</button>
                  </div>
                </div>

                <!-- KPI 카드 -->
                <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div class="ds-card p-4">
                    <div class="text-xs text-gray-500 mb-1">출력 건수</div>
                    <div class="text-2xl font-bold text-blue-700" id="kpiPrints">-</div>
                    <div class="text-xs text-gray-400 mt-1"><span id="kpiOk">0</span> OK / <span id="kpiError">0</span> 에러</div>
                  </div>
                  <div class="ds-card p-4">
                    <div class="text-xs text-gray-500 mb-1">출력 면적</div>
                    <div class="text-2xl font-bold text-green-700" id="kpiSqm">-</div>
                    <div class="text-xs text-gray-400 mt-1">㎡</div>
                  </div>
                  <div class="ds-card p-4">
                    <div class="text-xs text-gray-500 mb-1">카드 처리율</div>
                    <div class="text-2xl font-bold text-purple-700" id="kpiRate">-</div>
                    <div class="text-xs text-gray-400 mt-1"><span id="kpiCardDone">0</span> / <span id="kpiCardTotal">0</span> 카드</div>
                  </div>
                  <div class="ds-card p-4">
                    <div class="text-xs text-gray-500 mb-1">장비 가동</div>
                    <div class="text-2xl font-bold text-amber-700" id="kpiEquipCount">-</div>
                    <div class="text-xs text-gray-400 mt-1">대</div>
                  </div>
                  <div class="ds-card p-4">
                    <div class="text-xs text-gray-500 mb-1">미완료/마감</div>
                    <div class="text-2xl font-bold text-red-600" id="kpiOverdue">-</div>
                    <div class="text-xs text-gray-400 mt-1">건</div>
                  </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <!-- 장비별 현황 -->
                  <div class="ds-card p-4">
                    <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-print mr-1"></i> 장비별 출력 현황</h3>
                    <div id="equipmentTable">
                      <div class="text-center py-4 text-gray-400 text-sm">데이터 로딩 중...</div>
                    </div>
                  </div>

                  <!-- 시간대별 출력 -->
                  <div class="ds-card p-4">
                    <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-bar mr-1"></i> 시간대별 출력량</h3>
                    <div id="hourlyChart" style="height:250px;">
                      <div class="text-center py-4 text-gray-400 text-sm">데이터 로딩 중...</div>
                    </div>
                  </div>
                </div>

                <!-- 미완료 주문 -->
                <div class="ds-card p-4">
                  <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-exclamation-triangle text-red-500 mr-1"></i> 미완료/마감임박 주문</h3>
                  <div id="overdueTable">
                    <div class="text-center py-4 text-gray-400 text-sm">데이터 로딩 중...</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 기간 분석 패널 -->
            <div id="mainPanelPeriod" class="hidden">
            <!-- 기간 선택 + 탭 -->
            <div class="flex items-center justify-between mb-6">
                <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button onclick="switchReportTab('production')" id="tabProduction" class="report-tab px-3 py-1.5 rounded-md text-sm font-medium bg-white shadow text-gray-800">
                        <i class="fas fa-print mr-1"></i>생산 실적
                    </button>
                    <button onclick="switchReportTab('postprocess')" id="tabPostprocess" class="report-tab px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-cut mr-1"></i>후가공
                    </button>
                    <button onclick="switchReportTab('uptime')" id="tabUptime" class="report-tab px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-tachometer-alt mr-1"></i>가동률
                    </button>
                    <button onclick="switchReportTab('defects')" id="tabDefects" class="report-tab px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-exclamation-triangle mr-1"></i>불량률
                    </button>
                    <button onclick="switchReportTab('consumption')" id="tabConsumption" class="report-tab px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-box-open mr-1"></i>자재 소비
                    </button>
                    <button onclick="switchReportTab('duration')" id="tabDuration" class="report-tab px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-stopwatch mr-1"></i>인쇄시간
                    </button>
                    <button onclick="switchReportTab('dwelltime')" id="tabDwelltime" class="report-tab px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-hourglass-half mr-1"></i>체류시간
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <input type="date" id="dateFrom" class="border rounded px-2 py-1 text-sm">
                    <span class="text-gray-400">~</span>
                    <input type="date" id="dateTo" class="border rounded px-2 py-1 text-sm">
                    <button onclick="loadCurrentTab()" class="ds-btn ds-btn-primary text-sm">조회</button>
                    <button onclick="exportProductionCsv()" class="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700">
                        <i class="fas fa-file-csv mr-1"></i>CSV
                    </button>
                </div>
            </div>

            <!-- 생산 실적 패널 -->
            <div id="panelProduction">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div class="ds-card p-4 text-center">
                        <div class="text-sm text-gray-500">총 출력</div>
                        <div class="text-2xl font-bold text-blue-600" id="prodTotal">-</div>
                    </div>
                    <div class="ds-card p-4 text-center">
                        <div class="text-sm text-gray-500">정상 출력</div>
                        <div class="text-2xl font-bold text-green-600" id="prodOk">-</div>
                    </div>
                    <div class="ds-card p-4 text-center">
                        <div class="text-sm text-gray-500">에러/취소</div>
                        <div class="text-2xl font-bold text-red-600" id="prodError">-</div>
                    </div>
                    <div class="ds-card p-4 text-center">
                        <div class="text-sm text-gray-500">카드 수</div>
                        <div class="text-2xl font-bold text-purple-600" id="prodCards">-</div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-6">
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-server text-blue-500 mr-1"></i>장비별 실적</h3>
                        <div id="prodByEquipment" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-map-marker-alt text-green-500 mr-1"></i>구역별 실적</h3>
                        <div id="prodByZone" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                </div>
                <div class="ds-card p-6 mt-6">
                    <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-bar text-blue-500 mr-1"></i>일별 추이</h3>
                    <div id="prodDaily" class="space-y-1">
                        <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                    </div>
                </div>
            </div>

            <!-- 후가공 패널 -->
            <div id="panelPostprocess" class="hidden">
                <div class="grid grid-cols-2 gap-6">
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-cut text-amber-500 mr-1"></i>후가공 유형별 통계</h3>
                        <div id="ppByType" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-tags text-purple-500 mr-1"></i>카테고리별 후가공 카드</h3>
                        <div id="ppByCategory" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 가동률 패널 -->
            <div id="panelUptime" class="hidden">
                <div class="ds-card p-6">
                    <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-tachometer-alt text-green-500 mr-1"></i>장비별 월간 가동일수 & 유지보수 비용</h3>
                    <div id="uptimeData" class="space-y-3">
                        <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                    </div>
                </div>
            </div>

            <!-- 불량률 패널 -->
            <div id="panelDefects" class="hidden">
                <div class="flex justify-end mb-3">
                    <a id="defectsInspectLink" href="/inspections?tab=results&result=FAILED"
                       class="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
                        <i class="fas fa-clipboard-check mr-1"></i>해당 기간 불합격 검수 보기
                    </a>
                </div>
                <div class="grid grid-cols-2 gap-6">
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-exclamation-triangle text-red-500 mr-1"></i>장비별 불량률</h3>
                        <div id="defectsByEquipment" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-line text-orange-500 mr-1"></i>월별 불량률 추이</h3>
                        <div id="defectsMonthly" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                    <div class="ds-card p-6 col-span-2">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-clipboard-list text-amber-500 mr-1"></i>불량 접수 유형별 현황</h3>
                        <div id="defectsQualityIssues" class="space-y-1">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 자재 소비 패널 -->
            <div id="panelConsumption" class="hidden">
                <div class="grid grid-cols-2 gap-6">
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-box-open text-blue-500 mr-1"></i>품목별 소비량</h3>
                        <div id="consumptionByItem" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-area text-teal-500 mr-1"></i>월별 소비 추이</h3>
                        <div id="consumptionMonthly" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 인쇄시간 패널 -->
            <div id="panelDuration" class="hidden">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <div class="ds-card p-4 text-center">
                        <div class="text-sm text-gray-500">평균 인쇄시간</div>
                        <div class="text-2xl font-bold text-blue-600" id="durAvg">-</div>
                    </div>
                    <div class="ds-card p-4 text-center">
                        <div class="text-sm text-gray-500">총 가동시간</div>
                        <div class="text-2xl font-bold text-green-600" id="durTotalHours">-</div>
                    </div>
                    <div class="ds-card p-4 text-center">
                        <div class="text-sm text-gray-500">총 인쇄 건수</div>
                        <div class="text-2xl font-bold text-purple-600" id="durCount">-</div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-6">
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-server text-blue-500 mr-1"></i>장비별 평균 인쇄시간</h3>
                        <div id="durByEquipment" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-bar text-cyan-500 mr-1"></i>일별 인쇄시간 추이</h3>
                        <div id="durDaily" class="space-y-1">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                </div>
                <div class="ds-card p-6 mt-6">
                    <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-ruler-combined text-blue-500 mr-1"></i>프린터별 규격 대비 인쇄시간</h3>
                    <div id="durByPrinterSize" class="overflow-x-auto">
                        <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                    </div>
                </div>
            </div>

            <!-- 체류시간 패널 -->
            <div id="panelDwelltime" class="hidden">
                <div class="grid grid-cols-2 gap-6">
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-hourglass-half text-orange-500 mr-1"></i>상태별 평균 체류시간</h3>
                        <div id="dwellByStatus">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                    <div class="ds-card p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-tags text-violet-500 mr-1"></i>카테고리별 체류시간</h3>
                        <div id="dwellByCategory" class="space-y-2">
                            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
                        </div>
                    </div>
                </div>
            </div>
            </div><!-- end mainPanelPeriod -->

            </div><!-- end prodAnaProductionContent -->

            <!-- 원가 분석 콘텐츠 -->
            <div id="prodAnaCostContent" class="hidden">
            <div class="space-y-4">

              <!-- 상단 요약 카드 (4개) -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-calculator" style="color:#3b82f6;margin-right:4px"></i>평균 원가/㎡</div>
                  <div class="value" style="color:#3b82f6" id="avgCostPerSqm">-</div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:4px;">금월 기준</div>
                </div>
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-percent" style="color:#f59e0b;margin-right:4px"></i>평균 로스율</div>
                  <div class="value" style="color:#f59e0b" id="avgLossRate">-</div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:4px;">로스 비율</div>
                </div>
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-layer-group" style="color:#16a34a;margin-right:4px"></i>총 소모량</div>
                  <div class="value" style="color:#16a34a;font-size:20px" id="totalConsumed">-</div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:4px;">㎡ 기준</div>
                </div>
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-coins" style="color:#8b5cf6;margin-right:4px"></i>총 원가</div>
                  <div class="value" style="color:#8b5cf6;font-size:20px" id="totalCost">-</div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:4px;">금액 합계</div>
                </div>
              </div>

              <!-- 필터 바 -->
              <div class="ds-card ds-card-compact flex flex-wrap gap-2 items-center">
                <label style="font-size:12px;color:#666;">기간:</label>
                <input type="month" id="fPeriodFrom" class="ds-input" style="width:140px" />
                <span style="color:#9ca3af;">~</span>
                <input type="month" id="fPeriodTo" class="ds-input" style="width:140px" />
                <div class="ml-auto flex gap-2">
                  <button onclick="loadAnalysis()" class="ds-btn ds-btn-ghost ds-btn-sm">
                    <i class="fas fa-sync-alt" style="margin-right:4px"></i>새로고침
                  </button>
                </div>
              </div>

              <!-- 월별 원가 추이 차트 -->
              <div class="ds-card">
                <div style="padding-bottom:12px;border-bottom:1px solid var(--c-border);margin-bottom:16px;">
                  <h3 style="font-size:14px;font-weight:600;color:#374151;margin:0;">
                    <i class="fas fa-chart-bar" style="color:#3b82f6;margin-right:6px;"></i>월별 원가 추이 (원가/㎡)
                  </h3>
                </div>
                <div id="monthlyChart" style="display:flex;flex-direction:column;gap:12px;"></div>
              </div>

              <!-- 로스율 추이 -->
              <div class="ds-card">
                <div style="padding-bottom:12px;border-bottom:1px solid var(--c-border);margin-bottom:16px;">
                  <h3 style="font-size:14px;font-weight:600;color:#374151;margin:0;">
                    <i class="fas fa-chart-line" style="color:#f59e0b;margin-right:6px;"></i>로스율 추이
                  </h3>
                </div>
                <div id="lossRateChart" style="display:flex;flex-direction:column;gap:12px;"></div>
              </div>

              <!-- 원단별 원가 테이블 -->
              <div class="ds-card" style="padding:0;overflow:hidden;">
                <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
                  <h2 class="ds-card-title">
                    <i class="fas fa-list" style="color:#16a34a;margin-right:8px"></i>원단별 원가 분석
                  </h2>
                </div>
                <div class="ds-table-wrap">
                  <table id="materialTable" class="ds-table ds-table-compact ds-table-striped">
                    <thead>
                      <tr>
                        <th style="min-width:140px;">원단명</th>
                        <th style="text-align:center;">폭(mm)</th>
                        <th style="text-align:right;">소모량</th>
                        <th style="text-align:right;">입고단가</th>
                        <th style="text-align:right;">원가/㎡</th>
                        <th style="text-align:center;">로스율</th>
                      </tr>
                    </thead>
                    <tbody id="materialBody">
                      <tr><td colspan="6" style="text-align:center;padding:32px;color:#9ca3af;">데이터 없음</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- 자동차감 이력 테이블 -->
              <div class="ds-card" style="padding:0;overflow:hidden;">
                <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                  <h2 class="ds-card-title">
                    <i class="fas fa-history" style="color:#8b5cf6;margin-right:8px"></i>자동차감 이력
                  </h2>
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <select id="deductMaterial" class="ds-input" style="width:auto" onchange="filterDeductions()" title="원단">
                      <option value="">전체 원단</option>
                    </select>
                    <input type="date" id="deductDateFrom" class="ds-input" style="width:140px" onchange="filterDeductions()" title="차감일 시작" />
                    <input type="date" id="deductDateTo" class="ds-input" style="width:140px" onchange="filterDeductions()" title="차감일 종료" />
                  </div>
                </div>
                <div class="ds-table-wrap">
                  <table id="deductionTable" class="ds-table ds-table-compact ds-table-striped">
                    <thead>
                      <tr>
                        <th style="min-width:120px;">주문번호</th>
                        <th style="min-width:100px;">원단</th>
                        <th style="text-align:right;">차감량</th>
                        <th style="text-align:center;">폭(mm)</th>
                        <th style="text-align:center;">출력크기</th>
                        <th style="text-align:center;">매수</th>
                        <th style="text-align:center;">날짜</th>
                      </tr>
                    </thead>
                    <tbody id="deductionBody">
                      <tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>
                    </tbody>
                  </table>
                </div>
                <div id="deductPagination" style="display:flex;justify-content:flex-end;gap:8px;align-items:center;padding:var(--space-md);"></div>
              </div>

            </div>
            </div><!-- end prodAnaCostContent -->

            <!-- OEE(설비종합효율) 콘텐츠 -->
            <div id="prodAnaOeeContent" class="hidden">
            <div class="space-y-4">

              <!-- 컨트롤 바 -->
              <div class="ds-card p-3 flex flex-wrap items-center gap-2">
                <label class="text-xs text-gray-500">기준일</label>
                <input type="date" id="oeeDate" class="border rounded px-2 py-1 text-sm" onchange="window.oeeLoad()">
                <button onclick="window.oeeCalculate()" class="ds-btn ds-btn-primary text-sm"><i class="fas fa-calculator mr-1"></i>OEE 계산</button>
                <button onclick="window.oeeLoad()" class="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"><i class="fas fa-sync-alt mr-1"></i>새로고침</button>
                <span class="text-[11px] text-gray-400 ml-2 hidden md:inline">가용성 × 성능 × 품질 = 종합효율(OEE) · 기준일 데이터로 재계산</span>
                <span class="ml-auto text-[11px] text-gray-400" id="oeeHint"></span>
              </div>

              <!-- 당일 평균 요약 카드 -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="ds-card p-4"><div class="text-xs text-gray-500 mb-1"><i class="fas fa-plug mr-1"></i>평균 가용성</div><div class="text-2xl font-bold" id="oeeAvgAvail">-</div></div>
                <div class="ds-card p-4"><div class="text-xs text-gray-500 mb-1"><i class="fas fa-bolt mr-1"></i>평균 성능</div><div class="text-2xl font-bold" id="oeeAvgPerf">-</div></div>
                <div class="ds-card p-4"><div class="text-xs text-gray-500 mb-1"><i class="fas fa-award mr-1"></i>평균 품질</div><div class="text-2xl font-bold" id="oeeAvgQual">-</div></div>
                <div class="ds-card p-4"><div class="text-xs text-gray-500 mb-1"><i class="fas fa-gauge-high mr-1"></i>평균 종합(OEE)</div><div class="text-2xl font-bold" id="oeeAvgOee">-</div></div>
              </div>

              <!-- 장비별 OEE 표 -->
              <div class="ds-card p-0 overflow-x-auto">
                <table class="ds-table w-full text-xs">
                  <thead><tr>
                    <th>장비</th>
                    <th class="text-center">가용성</th>
                    <th class="text-center">성능</th>
                    <th class="text-center">품질</th>
                    <th class="text-center">종합(OEE)</th>
                    <th class="text-right">가동시간</th>
                    <th class="text-right">생산/양품</th>
                    <th class="text-right">불량</th>
                    <th class="text-right">면적(㎡)</th>
                  </tr></thead>
                  <tbody id="oeeBody"><tr><td colspan="9" class="text-center py-8 text-gray-400">기준일 선택 후 "OEE 계산"을 실행하세요.</td></tr></tbody>
                </table>
              </div>

            </div>
            </div><!-- end prodAnaOeeContent -->
    `,
    pageScript: combinedScript
  })
}
