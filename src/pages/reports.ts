import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import reportsScript from '../scripts/reports.js?raw'
import forecastScript from '../scripts/forecast.js?raw'
import financialScript from '../scripts/financialReports.js?raw'
import { financialReportsContent } from './financialReports'
// demandScript 제거됨 (수요분석 탭 = 수주예측+품목분석 탭 재탕, ?raw concat 동명함수가 원본을 덮어써 해당 탭들을 깨뜨림) 2026-06-26

export function reportsPage(c: Context<HonoEnv>) {
  const tabSwitchScript = `
    window.switchAnalyticsTab = function(tab) {
      var tabs = ['reports', 'financial', 'forecast'];
      tabs.forEach(function(t) {
        var content = document.getElementById('ana' + t.charAt(0).toUpperCase() + t.slice(1) + 'Content');
        var tabBtn = document.getElementById('anaTab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (!content || !tabBtn) return;
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
      // 손익계산서 탭 최초 진입 시 lazy-init (financialReports.js)
      if (tab === 'financial' && typeof window.__finInit === 'function') window.__finInit();
    };
    (function() {
      var p = new URLSearchParams(window.location.search);
      var tab = p.get('tab');
      if (tab === 'forecast' || window.location.hash === '#forecast') {
        window.switchAnalyticsTab('forecast');
      } else if (tab === 'financial' || window.location.hash === '#financial') {
        window.switchAnalyticsTab('financial');
      }
    })();
  `;

  // 손익계산서(financialReports.js)=bare 전역(fmt·pnlData 등) 다수 → IIFE 격리(reports/forecast 오염 차단).
  // __finDefer=true로 auto-init 차단 → 손익 탭 첫 진입 시 __finInit() 호출(lazy). 단독 /financial-reports는 즉시.
  const financialEmbed = 'window.__finDefer = true;\n(function(){\n' + financialScript + '\n})();'
  const combinedScript = tabSwitchScript + '\n' + reportsScript + '\n' + forecastScript + '\n' + financialEmbed;

  return renderPage(c, {
    title: '손익·경영 분석',
    activePage: '/reports',
    pageContent: `
      <!-- 상위 탭 -->
      <div class="flex border-b mb-4">
        <button onclick="switchAnalyticsTab('reports')" id="anaTabReports" class="px-5 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
          <i class="fas fa-chart-line mr-1"></i>매출 분석
        </button>
        <button onclick="switchAnalyticsTab('financial')" id="anaTabFinancial" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-file-invoice-dollar mr-1"></i>손익계산서
        </button>
        <button onclick="switchAnalyticsTab('forecast')" id="anaTabForecast" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-chart-area mr-1"></i>수주 예측
        </button>
      </div>

      <!-- 매출 분석 탭 -->
      <div id="anaReportsContent">
      <!-- 이카운트 병행 기간 안내 (조회 구간이 겹칠 때만 채워진다 — shell.js) -->
      <div id="reportsCompletenessNotice"></div>
      <!-- Period Selector -->
      <div class="ds-card p-4 mb-6 flex items-center gap-3 flex-wrap">
        <span class="text-sm font-medium text-gray-700"><i class="fas fa-chart-line mr-1"></i>분석 기간:</span>
        <select id="periodMonths" onchange="loadAllReports()" class="px-3 py-2 border rounded-lg text-sm">
          <option value="3">최근 3개월</option>
          <option value="6" selected>최근 6개월</option>
          <option value="12">최근 12개월</option>
        </select>
        <button onclick="loadAllReports()" class="ds-btn ds-btn-primary ds-btn-sm">
          <i class="fas fa-sync-alt mr-1"></i>새로고침
        </button>
        <button onclick="exportReportCsv()" class="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
          <i class="fas fa-file-csv mr-1"></i>CSV 내보내기
        </button>
        <a href="/production-reports" class="px-3 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-100 ml-auto" title="장비별 실적·불량률·가동률은 생산 분석 페이지에서">
          <i class="fas fa-industry mr-1"></i>생산 분석 &rarr;
        </a>
      </div>

      <!-- Tab Navigation -->
      <div class="flex border-b mb-6">
        <button id="tabMonthly" onclick="switchReportTab('monthly')" class="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">월별 종합</button>
        <button id="tabClients" onclick="switchReportTab('clients')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">거래처 분석</button>
        <button id="tabItems" onclick="switchReportTab('items')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">품목 분석</button>
        <button id="tabDesigners" onclick="switchReportTab('designers')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">디자이너 통계</button>
        <button id="tabMargin" onclick="switchReportTab('margin')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">수익성 분석</button>
        <button id="tabReceivables" onclick="switchReportTab('receivables')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">미수금 분석</button>
        <button id="tabComparison" onclick="switchReportTab('comparison')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">기간 비교</button>
      </div>

      <!-- Monthly Tab -->
      <div id="monthlyPanel">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">기간 총 매출</div>
            <div class="text-2xl font-bold text-blue-600" id="rptTotalRevenue">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">기간 총 입금</div>
            <div class="text-2xl font-bold text-green-600" id="rptTotalPayments">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">총 주문 수</div>
            <div class="text-2xl font-bold text-gray-700" id="rptTotalOrders">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">수금률</div>
            <div class="text-2xl font-bold text-gray-900" id="rptCollectionRate">-</div>
          </div>
        </div>
        <div class="ds-card p-6 mb-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-bar text-blue-500 mr-2"></i>월별 매출/입금 추이</h3>
          <div id="monthlyChartArea" class="space-y-2"></div>
        </div>
        <div class="ds-card overflow-hidden">
          <table class="w-full text-sm ds-table ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="col-tag px-4 py-3 text-left" style="width:80px">월</th>
                <th class="col-qty px-4 py-3 text-right" style="width:80px">주문수</th>
                <th class="col-amount px-4 py-3 text-right" style="width:120px">매출</th>
                <th class="col-amount px-4 py-3 text-right" style="width:120px">입금</th>
                <th class="col-qty px-4 py-3 text-right" style="width:80px">수금률</th>
                <th class="col-qty px-4 py-3 text-right">거래처수</th>
              </tr>
            </thead>
            <tbody id="monthlyTableBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Clients Tab -->
      <div id="clientsPanel" class="hidden">
        <div class="ds-card overflow-hidden mb-6">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-building text-orange-500 mr-2"></i>거래처별 매출 TOP 20</h3></div>
          <table class="w-full text-sm ds-table ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="col-no px-4 py-3 text-center w-10" style="width:40px">#</th>
                <th class="col-name px-4 py-3 text-left">거래처</th>
                <th class="col-qty px-4 py-3 text-right" style="width:80px">주문수</th>
                <th class="col-amount px-4 py-3 text-right" style="width:120px">매출합계</th>
                <th class="col-amount px-4 py-3 text-right" style="width:100px">평균단가</th>
                <th class="col-amount px-4 py-3 text-right" style="width:110px">미수금</th>
                <th class="col-qty px-4 py-3" style="width:80px">비중</th>
              </tr>
            </thead>
            <tbody id="clientsTableBody2"></tbody>
          </table>
        </div>
      </div>

      <!-- Items Tab -->
      <div id="itemsPanel" class="hidden">
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-layer-group text-green-500 mr-2"></i>카테고리별 매출</h3>
            <div id="categoryChart" class="space-y-2"></div>
          </div>
          <div class="ds-card overflow-hidden">
            <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-box text-purple-500 mr-2"></i>품목 TOP 30</h3></div>
            <div class="max-h-[400px] overflow-y-auto">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead class="bg-gray-50 sticky top-0">
                  <tr>
                    <th class="col-name px-4 py-2 text-left">품목명</th>
                    <th class="col-qty px-4 py-2 text-right">주문수</th>
                    <th class="col-qty px-4 py-2 text-right">수량</th>
                    <th class="col-amount px-4 py-2 text-right">매출</th>
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
        <!-- 담당자별 실적 (2026-08-08) — orders.sales_rep_id 기반. 아래 「디자이너별」과 묻는 게 다르다. -->
        <div class="ds-card overflow-hidden mb-6">
          <div class="p-4 flex items-baseline justify-between flex-wrap gap-2">
            <h3 class="text-lg font-bold"><i class="fas fa-user-tie text-emerald-600 mr-2"></i>담당자별 실적
              <span class="text-xs font-normal text-gray-400 ml-1">(주문서 담당자 · 공급가 기준)</span></h3>
            <span class="text-xs text-gray-500">퇴사자 포함 — 과거 실적의 주인이라 빼면 월별 합이 전사와 어긋납니다</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table ds-table-striped">
              <thead class="bg-gray-50"><tr id="repStatsHead"></tr></thead>
              <tbody id="repStatsBody"></tbody>
              <tfoot class="bg-gray-50 font-semibold"><tr id="repStatsFoot"></tr></tfoot>
            </table>
          </div>
        </div>

        <div class="ds-card overflow-hidden">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-user-edit text-blue-500 mr-2"></i>디자이너별 주문 처리
            <span class="text-xs font-normal text-gray-400 ml-1">(등록자 기준 · 처리량 — 이관 주문은 전량 '관리자'로 집계됨. 실적은 위 담당자별 표 참조)</span></h3></div>
          <table class="w-full text-sm ds-table ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="col-name px-4 py-3 text-left">디자이너</th>
                <th class="col-qty px-4 py-3 text-right">주문수</th>
                <th class="col-amount px-4 py-3 text-right">매출합계</th>
                <th class="col-amount px-4 py-3 text-right">평균 금액</th>
                <th class="col-qty px-4 py-3 text-right">완료</th>
                <th class="col-qty px-4 py-3 text-right">진행중</th>
                <th class="col-qty px-4 py-3">처리율</th>
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
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">총 매출</div>
            <div class="text-2xl font-bold text-blue-600" id="mgTotalRevenue">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">총 원가</div>
            <div class="text-2xl font-bold text-red-600" id="mgTotalCost">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">총 이익</div>
            <div class="text-2xl font-bold text-green-600" id="mgTotalProfit">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">평균 마진율</div>
            <div class="text-2xl font-bold text-gray-900" id="mgAvgMargin">-</div>
          </div>
        </div>

        <!-- 카테고리별 마진 + 월별 추이 -->
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-layer-group text-blue-500 mr-2"></i>카테고리별 수익성</h3>
            <div id="mgByCategory" class="space-y-2">
              <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
            </div>
          </div>
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-line text-green-500 mr-2"></i>월별 수익성 추이</h3>
            <div id="mgByMonth" class="space-y-2">
              <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
            </div>
          </div>
        </div>

        <!-- 거래처별 마진 TOP/BOTTOM -->
        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-arrow-up text-green-500 mr-2"></i>고마진 거래처 TOP 10</h3>
            <table class="w-full text-sm ds-table ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="col-name px-3 py-2 text-left">거래처</th>
                  <th class="col-amount px-3 py-2 text-right">매출</th>
                  <th class="col-qty px-3 py-2 text-right">마진율</th>
                  <th class="col-tag px-3 py-2 text-center">등급</th>
                </tr>
              </thead>
              <tbody id="mgTopClientsBody"></tbody>
            </table>
          </div>
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-arrow-down text-red-500 mr-2"></i>저마진 거래처 BOTTOM 10</h3>
            <table class="w-full text-sm ds-table ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="col-name px-3 py-2 text-left">거래처</th>
                  <th class="col-amount px-3 py-2 text-right">매출</th>
                  <th class="col-qty px-3 py-2 text-right">마진율</th>
                  <th class="col-tag px-3 py-2 text-center">등급</th>
                </tr>
              </thead>
              <tbody id="mgBottomClientsBody"></tbody>
            </table>
          </div>
        </div>

        <!-- 거래처 수익성 등급 분포 -->
        <div class="ds-card p-6 mb-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-medal text-amber-500 mr-2"></i>거래처 수익성 등급 분포</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="mgGradeDistribution">
            <div class="text-center text-gray-400 text-sm">로딩 중...</div>
          </div>
        </div>

        <!-- 저마진 주문 -->
        <div class="ds-card p-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-exclamation-triangle text-orange-500 mr-2"></i>저마진 주문 TOP 10</h3>
          <table class="w-full text-sm ds-table ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="col-code px-4 py-3 text-left">주문번호</th>
                <th class="col-name px-4 py-3 text-left">거래처</th>
                <th class="col-amount px-4 py-3 text-right">매출</th>
                <th class="col-amount px-4 py-3 text-right">원가</th>
                <th class="col-amount px-4 py-3 text-right">이익</th>
                <th class="col-qty px-4 py-3 text-right">마진율</th>
              </tr>
            </thead>
            <tbody id="mgLowMarginBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Receivables Tab -->
      <div id="receivablesPanel" class="hidden">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">총 미수금 잔액</div>
            <div class="text-2xl font-bold text-red-600" id="rcTotalAR">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">미수금 거래처</div>
            <div class="text-2xl font-bold text-orange-600" id="rcARClients">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">당월 매출 발생</div>
            <div class="text-2xl font-bold text-blue-600" id="rcMonthBilled">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">당월 수금</div>
            <div class="text-2xl font-bold text-green-600" id="rcMonthCollected">-</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-clock text-orange-500 mr-2"></i>미수금 연령 분석</h3>
            <div id="rcAgingChart" class="space-y-3"></div>
          </div>
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-area text-blue-500 mr-2"></i>월별 수금 추이</h3>
            <div id="rcMonthlyTrend" class="space-y-2"></div>
          </div>
        </div>

        <div class="ds-card overflow-hidden">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-exclamation-circle text-red-500 mr-2"></i>미수금 TOP 15 거래처</h3></div>
          <table class="w-full text-sm ds-table ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="col-no px-4 py-3 text-center w-10">#</th>
                <th class="col-name px-4 py-3 text-left">거래처</th>
                <th class="col-amount px-4 py-3 text-right">미수금</th>
                <th class="col-date px-4 py-3 text-right">최근 입금일</th>
                <th class="col-qty px-4 py-3 text-right">경과일</th>
                <th class="col-qty px-4 py-3 text-right">독촉횟수</th>
              </tr>
            </thead>
            <tbody id="rcTopClientsBody"></tbody>
          </table>
        </div>
      </div>

      <!-- Production Tab 제거 (2026-07-16): 생산 실적 = production-reports 재탕(동일 print events 재집계), 툴바 링크로 일원화 -->

      <!-- Comparison Tab -->
      <div id="comparisonPanel" class="hidden">
        <div class="ds-card p-4 mb-6 flex items-center gap-3 flex-wrap">
          <span class="text-sm font-medium text-gray-700"><i class="fas fa-calendar-alt mr-1"></i>기준월:</span>
          <input type="month" id="cpBaseMonth" class="px-3 py-2 border rounded-lg text-sm" />
          <select id="cpCompareType" class="px-3 py-2 border rounded-lg text-sm">
            <option value="MOM">전월 대비</option>
            <option value="YOY">전년 동기 대비</option>
          </select>
          <button onclick="loadComparison()" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-search mr-1"></i>비교 분석
          </button>
          <span id="cpPeriodLabel" class="text-sm text-gray-500 ml-2"></span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="cpKPICards">
          <div class="text-center text-gray-400 py-8">비교 분석 버튼을 눌러주세요</div>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <div class="ds-card overflow-hidden">
            <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-layer-group text-blue-500 mr-2"></i>카테고리별 매출 비교</h3></div>
            <table class="w-full text-sm ds-table ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="col-name px-4 py-2 text-left">카테고리</th>
                  <th class="col-amount px-4 py-2 text-right">기준월</th>
                  <th class="col-amount px-4 py-2 text-right">비교월</th>
                  <th class="col-amount px-4 py-2 text-right">증감</th>
                </tr>
              </thead>
              <tbody id="cpCategoryBody"></tbody>
            </table>
          </div>
          <div class="ds-card p-6">
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
        <button id="tabClientFc" onclick="switchFcTab('clientFc')" class="px-6 py-3 text-sm font-medium text-gray-500 hover:text-gray-700">거래처 예측</button>
      </div>

      <!-- Forecast Tab -->
      <div id="forecastPanel">
        <!-- 예측 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">다음달 예측 매출</div>
            <div class="text-2xl font-bold text-blue-600" id="fcRevenue">-</div>
            <div class="text-xs text-gray-400 mt-1" id="fcMethod"></div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">다음달 예측 주문수</div>
            <div class="text-2xl font-bold text-green-600" id="fcOrders">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">성장률 (3개월)</div>
            <div class="text-2xl font-bold" id="fcGrowth">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-500">예측 기준월</div>
            <div class="text-2xl font-bold text-gray-700" id="fcMonth">-</div>
          </div>
        </div>

        <!-- 월별 추이 + 예측선 -->
        <div class="ds-card p-6 mb-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-line text-blue-500 mr-2"></i>월별 매출 추이 & 예측</h3>
          <div id="fcMonthlyChart" class="space-y-2"></div>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <!-- 요일별 주문 패턴 -->
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-calendar-week text-green-500 mr-2"></i>요일별 평균 주문량</h3>
            <div id="fcDowChart" class="space-y-2"></div>
          </div>

          <!-- 카테고리별 예측 -->
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4"><i class="fas fa-layer-group text-purple-500 mr-2"></i>카테고리별 예측 매출</h3>
            <div id="fcCategoryChart" class="space-y-2"></div>
          </div>
        </div>
      </div>

      <!-- Capacity Tab 제거 (2026-07-16): 용량 분석(가동률) = production-reports 재탕, 툴바 링크로 일원화 -->

      <!-- Client Forecast Tab -->
      <div id="clientFcPanel" class="hidden">
        <div class="ds-card overflow-hidden">
          <div class="p-4"><h3 class="text-lg font-bold"><i class="fas fa-building text-blue-500 mr-2"></i>거래처별 수주 예측 TOP 15</h3></div>
          <table class="w-full text-sm ds-table ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="col-no px-4 py-3 text-center w-10">#</th>
                <th class="col-name px-4 py-3 text-left">거래처</th>
                <th class="col-amount px-4 py-3 text-right">6개월 합계</th>
                <th class="col-amount px-4 py-3 text-right">월 평균</th>
                <th class="col-amount px-4 py-3 text-right">예측 매출</th>
                <th class="col-tag px-4 py-3 text-right">추세</th>
                <th class="col-qty px-4 py-3 text-right">주문빈도</th>
                <th class="col-status px-4 py-3 text-center">위험</th>
              </tr>
            </thead>
            <tbody id="cfClientsBody"></tbody>
          </table>
        </div>

        <!-- 거래처별 월간 미니 추이 -->
        <div class="ds-card p-6 mt-6">
          <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-bar text-green-500 mr-2"></i>주요 거래처 월별 매출 추이</h3>
          <div id="cfTrendChart" class="space-y-4"></div>
        </div>
      </div>
      </div>

      <!-- 손익계산서 탭 (손익허브 통합: /financial-reports 흡수, lazy) -->
      <div id="anaFinancialContent" class="hidden">
        ${financialReportsContent}
      </div>

    `,
    pageScript: combinedScript
  })
}
