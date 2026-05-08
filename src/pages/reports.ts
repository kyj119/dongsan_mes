import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import reportsScript from '../scripts/reports.js?raw'
import forecastScript from '../scripts/forecast.js?raw'
import demandScript from '../scripts/demandAnalytics.js?raw'

export function reportsPage(c: Context<HonoEnv>) {
  const tabSwitchScript = `
    window.switchAnalyticsTab = function(tab) {
      var tabs = ['reports', 'forecast', 'demand'];
      tabs.forEach(function(t) {
        var content = document.getElementById('ana' + t.charAt(0).toUpperCase() + t.slice(1) + 'Content');
        var tabBtn = document.getElementById('anaTab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (t === tab) {
          content.classList.remove('hidden');
          tabBtn.classList.remove('border-transparent', 'text-gray-500');
          tabBtn.classList.add('border-blue-600', 'text-blue-600');
        } else {
          content.classList.add('hidden');
          tabBtn.classList.remove('border-blue-600', 'text-blue-600');
          tabBtn.classList.add('border-transparent', 'text-gray-500');
        }
      });
    };
    (function() {
      var p = new URLSearchParams(window.location.search);
      var tab = p.get('tab');
      if (tab === 'forecast' || window.location.hash === '#forecast') {
        window.switchAnalyticsTab('forecast');
      } else if (tab === 'demand' || window.location.hash === '#demand') {
        window.switchAnalyticsTab('demand');
      }
    })();
  `;

  const combinedScript = tabSwitchScript + '\n' + reportsScript + '\n' + forecastScript + '\n' + demandScript;

  return renderPage(c, {
    title: '경영 분석',
    activePage: '/reports',
    pageContent: `
      <!-- 상위 탭 -->
      <div class="flex border-b mb-4">
        <button onclick="switchAnalyticsTab('reports')" id="anaTabReports" class="px-5 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
          <i class="fas fa-chart-line mr-1"></i>매출 분석
        </button>
        <button onclick="switchAnalyticsTab('forecast')" id="anaTabForecast" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-chart-area mr-1"></i>수주 예측
        </button>
        <button onclick="switchAnalyticsTab('demand')" id="anaTabDemand" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-chart-bar mr-1"></i>수요 분석
        </button>
      </div>

      <!-- 매출 분석 탭 -->
      <div id="anaReportsContent">
      <!-- Period Selector -->
      <div class="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-3 flex-wrap">
        <span class="text-sm font-medium text-gray-700"><i class="fas fa-chart-line mr-1"></i>분석 기간:</span>
        <select id="periodMonths" onchange="loadAllReports()" class="px-3 py-2 border rounded-lg text-sm">
          <option value="3">최근 3개월</option>
          <option value="6" selected>최근 6개월</option>
          <option value="12">최근 12개월</option>
        </select>
        <button onclick="loadAllReports()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <i class="fas fa-sync-alt mr-1"></i>새로고침
        </button>
        <button onclick="exportReportCsv()" class="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
          <i class="fas fa-file-csv mr-1"></i>CSV 내보내기
        </button>
      </div>

      <!-- Tab Navigation -->
      <div class="flex border-b mb-6">
        <button id="tabMonthly" onclick="switchReportTab('monthly')" class="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">월별 종합</button>
        <button id="tabClients" onclick="switchReportTab('clients')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">거래처 분석</button>
        <button id="tabItems" onclick="switchReportTab('items')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">품목 분석</button>
        <button id="tabDesigners" onclick="switchReportTab('designers')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">디자이너 통계</button>
        <button id="tabMargin" onclick="switchReportTab('margin')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">수익성 분석</button>
        <button id="tabReceivables" onclick="switchReportTab('receivables')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">미수금 분석</button>
        <button id="tabProduction" onclick="switchReportTab('production')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">생산 실적</button>
        <button id="tabComparison" onclick="switchReportTab('comparison')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">기간 비교</button>
      </div>

      <!-- Monthly Tab -->
      <div id="monthlyPanel">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">기간 총 매출</div>
            <div class="text-2xl font-bold text-blue-600" id="rptTotalRevenue">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">기간 총 입금</div>
            <div class="text-2xl font-bold text-green-600" id="rptTotalPayments">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">총 주문 수</div>
            <div class="text-2xl font-bold text-gray-700" id="rptTotalOrders">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">수금률</div>
            <div class="text-2xl font-bold text-purple-600" id="rptCollectionRate">-</div>
          </div>
        </div>
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-bar text-blue-500 mr-2"></i>월별 매출/입금 추이</h3>
          <div id="monthlyChartArea" class="space-y-2"></div>
        </div>
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left">월</th>
                <th class="px-4 py-3 text-right">주문수</th>
                <th class="px-4 py-3 text-right">매출</th>
                <th class="px-4 py-3 text-right">입금</th>
                <th class="px-4 py-3 text-right">수금률</th>
                <th class="px-4 py-3 text-right">거래처수</th>
              </tr>
            </thead>
            <tbody id="monthlyTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Clients Tab -->
      <div id="clientsPanel" class="hidden">
        <div class="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-building text-orange-500 mr-2"></i>거래처별 매출 TOP 20</h3></div>
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-center w-10">#</th>
                <th class="px-4 py-3 text-left">거래처</th>
                <th class="px-4 py-3 text-right">주문수</th>
                <th class="px-4 py-3 text-right">매출합계</th>
                <th class="px-4 py-3 text-right">평균단가</th>
                <th class="px-4 py-3 text-right">미수금</th>
                <th class="px-4 py-3">비중</th>
              </tr>
            </thead>
            <tbody id="clientsTableBody2"></tbody>
          </table>
        </div>
      </div>

      <!-- Items Tab -->
      <div id="itemsPanel" class="hidden">
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-layer-group text-green-500 mr-2"></i>카테고리별 매출</h3>
            <div id="categoryChart" class="space-y-2"></div>
          </div>
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-box text-purple-500 mr-2"></i>품목 TOP 30</h3></div>
            <div class="max-h-[400px] overflow-y-auto">
              <table class="w-full text-sm ds-table-striped">
                <thead class="bg-gray-50 sticky top-0">
                  <tr>
                    <th class="px-4 py-2 text-left">품목명</th>
                    <th class="px-4 py-2 text-right">주문수</th>
                    <th class="px-4 py-2 text-right">수량</th>
                    <th class="px-4 py-2 text-right">매출</th>
                  </tr>
                </thead>
                <tbody id="itemsTableBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Designers Tab -->
      <div id="designersPanel" class="hidden">
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-user-edit text-blue-500 mr-2"></i>디자이너별 주문 처리</h3></div>
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left">디자이너</th>
                <th class="px-4 py-3 text-right">주문수</th>
                <th class="px-4 py-3 text-right">매출합계</th>
                <th class="px-4 py-3 text-right">평균 금액</th>
                <th class="px-4 py-3 text-right">완료</th>
                <th class="px-4 py-3 text-right">진행중</th>
                <th class="px-4 py-3">처리율</th>
              </tr>
            </thead>
            <tbody id="designersTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Margin Tab -->
      <div id="marginPanel" class="hidden">
        <!-- 요약 카드 4개 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">총 매출</div>
            <div class="text-2xl font-bold text-blue-600" id="mgTotalRevenue">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">총 원가</div>
            <div class="text-2xl font-bold text-red-600" id="mgTotalCost">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">총 이익</div>
            <div class="text-2xl font-bold text-green-600" id="mgTotalProfit">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">평균 마진율</div>
            <div class="text-2xl font-bold text-purple-600" id="mgAvgMargin">-</div>
          </div>
        </div>

        <!-- 카테고리별 마진 + 월별 추이 -->
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-layer-group text-blue-500 mr-2"></i>카테고리별 수익성</h3>
            <div id="mgByCategory" class="space-y-2">
              <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
            </div>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-line text-green-500 mr-2"></i>월별 수익성 추이</h3>
            <div id="mgByMonth" class="space-y-2">
              <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
            </div>
          </div>
        </div>

        <!-- 거래처별 마진 TOP/BOTTOM -->
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-arrow-up text-green-500 mr-2"></i>고마진 거래처 TOP 10</h3>
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left">거래처</th>
                  <th class="px-3 py-2 text-right">매출</th>
                  <th class="px-3 py-2 text-right">마진율</th>
                  <th class="px-3 py-2 text-center">등급</th>
                </tr>
              </thead>
              <tbody id="mgTopClientsBody"></tbody>
            </table>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-arrow-down text-red-500 mr-2"></i>저마진 거래처 BOTTOM 10</h3>
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left">거래처</th>
                  <th class="px-3 py-2 text-right">매출</th>
                  <th class="px-3 py-2 text-right">마진율</th>
                  <th class="px-3 py-2 text-center">등급</th>
                </tr>
              </thead>
              <tbody id="mgBottomClientsBody"></tbody>
            </table>
          </div>
        </div>

        <!-- 거래처 수익성 등급 분포 -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-medal text-amber-500 mr-2"></i>거래처 수익성 등급 분포</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="mgGradeDistribution">
            <div class="text-center text-gray-400 text-sm">로딩 중...</div>
          </div>
        </div>

        <!-- 저마진 주문 -->
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-exclamation-triangle text-orange-500 mr-2"></i>저마진 주문 TOP 10</h3>
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left">주문번호</th>
                <th class="px-4 py-3 text-left">거래처</th>
                <th class="px-4 py-3 text-right">매출</th>
                <th class="px-4 py-3 text-right">원가</th>
                <th class="px-4 py-3 text-right">이익</th>
                <th class="px-4 py-3 text-right">마진율</th>
              </tr>
            </thead>
            <tbody id="mgLowMarginBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Receivables Tab -->
      <div id="receivablesPanel" class="hidden">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">총 미수금 잔액</div>
            <div class="text-2xl font-bold text-red-600" id="rcTotalAR">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">미수금 거래처</div>
            <div class="text-2xl font-bold text-orange-600" id="rcARClients">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">당월 매출 발생</div>
            <div class="text-2xl font-bold text-blue-600" id="rcMonthBilled">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">당월 수금</div>
            <div class="text-2xl font-bold text-green-600" id="rcMonthCollected">-</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-clock text-orange-500 mr-2"></i>미수금 연령 분석</h3>
            <div id="rcAgingChart" class="space-y-3"></div>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-area text-blue-500 mr-2"></i>월별 수금 추이</h3>
            <div id="rcMonthlyTrend" class="space-y-2"></div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-exclamation-circle text-red-500 mr-2"></i>미수금 TOP 15 거래처</h3></div>
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-center w-10">#</th>
                <th class="px-4 py-3 text-left">거래처</th>
                <th class="px-4 py-3 text-right">미수금</th>
                <th class="px-4 py-3 text-right">최근 입금일</th>
                <th class="px-4 py-3 text-right">경과일</th>
                <th class="px-4 py-3 text-right">독촉횟수</th>
              </tr>
            </thead>
            <tbody id="rcTopClientsBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Production Tab -->
      <div id="productionPanel" class="hidden">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">출력 완료</div>
            <div class="text-2xl font-bold text-green-600" id="prOkCount">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">출력 에러</div>
            <div class="text-2xl font-bold text-red-600" id="prErrorCount">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">불량 보고</div>
            <div class="text-2xl font-bold text-orange-600" id="prQualityCount">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">유지보수 비용</div>
            <div class="text-2xl font-bold text-purple-600" id="prMaintCost">-</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-print text-blue-500 mr-2"></i>장비별 출력 실적</h3></div>
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left">장비</th>
                  <th class="px-4 py-2 text-right">출력수</th>
                  <th class="px-4 py-2 text-right">성공률</th>
                  <th class="px-4 py-2 text-right">가동일</th>
                </tr>
              </thead>
              <tbody id="prEquipmentBody"></tbody>
            </table>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-bar text-green-500 mr-2"></i>월별 출력 추이</h3>
            <div id="prMonthlyChart" class="space-y-2"></div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-bug text-red-500 mr-2"></i>불량 유형별 분포</h3>
          <div id="prDefectChart" class="space-y-2">
            <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
          </div>
        </div>
      </div>

      <!-- Comparison Tab -->
      <div id="comparisonPanel" class="hidden">
        <div class="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-3 flex-wrap">
          <span class="text-sm font-medium text-gray-700"><i class="fas fa-calendar-alt mr-1"></i>기준월:</span>
          <input type="month" id="cpBaseMonth" class="px-3 py-2 border rounded-lg text-sm" />
          <select id="cpCompareType" class="px-3 py-2 border rounded-lg text-sm">
            <option value="MOM">전월 대비</option>
            <option value="YOY">전년 동기 대비</option>
          </select>
          <button onclick="loadComparison()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <i class="fas fa-search mr-1"></i>비교 분석
          </button>
          <span id="cpPeriodLabel" class="text-sm text-gray-500 ml-2"></span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="cpKPICards">
          <div class="text-center text-gray-400 py-8">비교 분석 버튼을 눌러주세요</div>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="bg-white rounded-lg shadow overflow-hidden">
            <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-layer-group text-blue-500 mr-2"></i>카테고리별 매출 비교</h3></div>
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left">카테고리</th>
                  <th class="px-4 py-2 text-right">기준월</th>
                  <th class="px-4 py-2 text-right">비교월</th>
                  <th class="px-4 py-2 text-right">증감</th>
                </tr>
              </thead>
              <tbody id="cpCategoryBody"></tbody>
            </table>
          </div>
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-exchange-alt text-green-500 mr-2"></i>거래처 변동</h3>
            <div class="mb-4">
              <h4 class="text-sm font-bold text-green-600 mb-2"><i class="fas fa-arrow-up mr-1"></i>매출 증가 TOP 5</h4>
              <div id="cpIncreased" class="space-y-1"></div>
            </div>
            <div>
              <h4 class="text-sm font-bold text-red-600 mb-2"><i class="fas fa-arrow-down mr-1"></i>매출 감소 TOP 5</h4>
              <div id="cpDecreased" class="space-y-1"></div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- 수주 예측 탭 -->
      <div id="anaForecastContent" class="hidden">
      <!-- 3탭: 수주 예측, 용량 분석, 거래처 예측 -->
      <div class="flex border-b mb-6">
        <button id="tabForecast" onclick="switchFcTab('forecast')" class="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">수주 예측</button>
        <button id="tabCapacity" onclick="switchFcTab('capacity')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">용량 분석</button>
        <button id="tabClientFc" onclick="switchFcTab('clientFc')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">거래처 예측</button>
      </div>

      <!-- Forecast Tab -->
      <div id="forecastPanel">
        <!-- 예측 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">다음달 예측 매출</div>
            <div class="text-2xl font-bold text-blue-600" id="fcRevenue">-</div>
            <div class="text-xs text-gray-400 mt-1" id="fcMethod"></div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">다음달 예측 주문수</div>
            <div class="text-2xl font-bold text-green-600" id="fcOrders">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">성장률 (3개월)</div>
            <div class="text-2xl font-bold" id="fcGrowth">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-500">예측 기준월</div>
            <div class="text-2xl font-bold text-gray-700" id="fcMonth">-</div>
          </div>
        </div>

        <!-- 월별 추이 + 예측선 -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-line text-blue-500 mr-2"></i>월별 매출 추이 & 예측</h3>
          <div id="fcMonthlyChart" class="space-y-2"></div>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <!-- 요일별 주문 패턴 -->
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-calendar-week text-green-500 mr-2"></i>요일별 평균 주문량</h3>
            <div id="fcDowChart" class="space-y-2"></div>
          </div>

          <!-- 카테고리별 예측 -->
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-layer-group text-purple-500 mr-2"></i>카테고리별 예측 매출</h3>
            <div id="fcCategoryChart" class="space-y-2"></div>
          </div>
        </div>
      </div>

      <!-- Capacity Tab -->
      <div id="capacityPanel" class="hidden">
        <div class="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-3">
          <span class="text-sm font-medium text-gray-700">분석 기간:</span>
          <select id="capMonths" onchange="loadCapacity()" class="px-3 py-2 border rounded-lg text-sm">
            <option value="1">최근 1개월</option>
            <option value="3" selected>최근 3개월</option>
            <option value="6">최근 6개월</option>
          </select>
        </div>

        <!-- 장비별 가동률 -->
        <div class="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-server text-blue-500 mr-2"></i>장비별 가동 현황</h3></div>
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left">장비</th>
                <th class="px-4 py-3 text-right">총 출력</th>
                <th class="px-4 py-3 text-right">성공률</th>
                <th class="px-4 py-3 text-right">가동일</th>
                <th class="px-4 py-3 text-right">일평균</th>
                <th class="px-4 py-3 text-right">피크</th>
                <th class="px-4 py-3">가동률</th>
              </tr>
            </thead>
            <tbody id="capEquipmentBody"></tbody>
          </table>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <!-- 주간별 출력 추이 -->
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-area text-green-500 mr-2"></i>주간별 출력 추이</h3>
            <div id="capWeeklyChart" class="space-y-2"></div>
          </div>

          <!-- 시간대별 분포 -->
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-clock text-orange-500 mr-2"></i>시간대별 출력 분포</h3>
            <div id="capHourlyChart" class="space-y-1"></div>
          </div>
        </div>
      </div>

      <!-- Client Forecast Tab -->
      <div id="clientFcPanel" class="hidden">
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-building text-blue-500 mr-2"></i>거래처별 수주 예측 TOP 15</h3></div>
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-center w-10">#</th>
                <th class="px-4 py-3 text-left">거래처</th>
                <th class="px-4 py-3 text-right">6개월 합계</th>
                <th class="px-4 py-3 text-right">월 평균</th>
                <th class="px-4 py-3 text-right">예측 매출</th>
                <th class="px-4 py-3 text-right">추세</th>
                <th class="px-4 py-3 text-right">주문빈도</th>
                <th class="px-4 py-3 text-center">위험</th>
              </tr>
            </thead>
            <tbody id="cfClientsBody"></tbody>
          </table>
        </div>

        <!-- 거래처별 월간 미니 추이 -->
        <div class="bg-white rounded-lg shadow p-6 mt-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-bar text-green-500 mr-2"></i>주요 거래처 월별 매출 추이</h3>
          <div id="cfTrendChart" class="space-y-4"></div>
        </div>
      </div>
      </div>

      <!-- 수요 분석 탭 -->
      <div id="anaDemandContent" class="hidden">
      <div class="space-y-6">

        <!-- 상단 요약 카드 -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="ds-card ds-card-compact" style="border-left:4px solid #3b82f6;">
            <div style="font-size:var(--fs-xs);color:var(--c-text-secondary);margin-bottom:6px;">
              <i class="fas fa-file-alt" style="margin-right:4px;"></i>이번달 주문수
            </div>
            <div style="font-size:24px;font-weight:700;color:#1e293b;" id="thisMonthOrders">-</div>
          </div>

          <div class="ds-card ds-card-compact" style="border-left:4px solid #10b981;">
            <div style="font-size:var(--fs-xs);color:var(--c-text-secondary);margin-bottom:6px;">
              <i class="fas fa-won-sign" style="margin-right:4px;"></i>이번달 매출
            </div>
            <div style="font-size:24px;font-weight:700;color:#10b981;" id="thisMonthRevenue">-</div>
          </div>

          <div class="ds-card ds-card-compact">
            <div style="font-size:var(--fs-xs);color:var(--c-text-secondary);margin-bottom:6px;">
              <i class="fas fa-percent" style="margin-right:4px;"></i>전월 대비 (%)
            </div>
            <div style="font-size:24px;font-weight:700;" id="momGrowth">-</div>
          </div>

          <div class="ds-card ds-card-compact" style="border-left:4px solid #f59e0b;">
            <div style="font-size:var(--fs-xs);color:var(--c-text-secondary);margin-bottom:6px;">
              <i class="fas fa-chart-area" style="margin-right:4px;"></i>예측 주문수 (다음달)
            </div>
            <div style="font-size:24px;font-weight:700;color:#f59e0b;" id="nextMonthForecast">-</div>
          </div>
        </div>

        <!-- 섹션 1: 월별 매출 추이 (최근 6개월) -->
        <div class="ds-card" style="padding:0;overflow:hidden;">
          <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
            <h2 class="ds-card-title">
              <i class="fas fa-chart-bar" style="color:#3b82f6;margin-right:8px;"></i>월별 매출 추이 (최근 6개월)
            </h2>
          </div>
          <div style="padding:var(--space-md);">
            <div id="monthlyChart" style="min-height:200px;display:flex;flex-direction:column;gap:12px;"></div>
          </div>
        </div>

        <!-- 섹션 2: 카테고리별 매출 비중 -->
        <div class="ds-card" style="padding:0;overflow:hidden;">
          <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
            <h2 class="ds-card-title">
              <i class="fas fa-layer-group" style="color:#8b5cf6;margin-right:8px;"></i>카테고리별 매출 비중
            </h2>
          </div>
          <div style="padding:var(--space-md);">
            <div id="categoryChart" style="min-height:220px;"></div>
          </div>
        </div>

        <!-- 섹션 3: 주요 거래처 동향 테이블 -->
        <div class="ds-card" style="padding:0;overflow:hidden;">
          <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
            <h2 class="ds-card-title">
              <i class="fas fa-building" style="color:#ec4899;margin-right:8px;"></i>주요 거래처 동향 (TOP 15)
            </h2>
          </div>
          <div class="ds-table-wrap">
            <table class="ds-table ds-table-compact ds-table-striped">
              <thead>
                <tr>
                  <th style="text-align:center;width:50px;">#</th>
                  <th style="min-width:140px;">거래처</th>
                  <th style="text-align:right;">월 매출</th>
                  <th style="text-align:center;">추세</th>
                  <th style="text-align:center;">위험도</th>
                  <th style="text-align:center;">주문빈도</th>
                </tr>
              </thead>
              <tbody id="clientTable">
                <tr><td colspan="6" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 섹션 4: 인기 품목 TOP 10 -->
        <div class="ds-card" style="padding:0;overflow:hidden;">
          <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
            <h2 class="ds-card-title">
              <i class="fas fa-star" style="color:#f59e0b;margin-right:8px;"></i>인기 품목 TOP 10
            </h2>
          </div>
          <div class="ds-table-wrap">
            <table class="ds-table ds-table-compact ds-table-striped">
              <thead>
                <tr>
                  <th style="text-align:center;width:50px;">#</th>
                  <th style="min-width:120px;">품목</th>
                  <th style="min-width:100px;">카테고리</th>
                  <th style="text-align:right;">매출</th>
                  <th style="text-align:center;">주문건수</th>
                  <th style="text-align:right;">수량</th>
                </tr>
              </thead>
              <tbody id="itemTable">
                <tr><td colspan="6" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
      </div>
    `,
    pageScript: combinedScript
  })
}
