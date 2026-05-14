import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/financialReports.js?raw'

export function financialReportsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '손익계산서',
    activePage: '/financial-reports',
    pageContent: `
      <div class="space-y-4">
        <!-- 탭 네비게이션 -->
        <div class="bg-white rounded-lg border shadow-sm">
          <div class="flex border-b px-4">
            <button id="tabPnl" onclick="switchFinancialTab('pnl')" class="px-0 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600 flex items-center gap-2">
              <i class="fas fa-file-invoice-dollar"></i>손익계산서
            </button>
            <button id="tabMonthly" onclick="switchFinancialTab('monthly')" class="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
              <i class="fas fa-chart-line"></i>월별 추이
            </button>
            <button id="tabSnapshot" onclick="switchFinancialTab('snapshot')" class="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
              <i class="fas fa-balance-scale"></i>재무 스냅샷
            </button>
          </div>

          <!-- 손익계산서 탭 -->
          <div id="pnlPanel" class="p-4 space-y-4">
            <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2 flex-wrap">
              <label class="text-xs text-gray-500">기간</label>
              <input type="date" id="pnlFromDate" class="border rounded px-2 py-1 text-xs">
              <span class="text-gray-400">~</span>
              <input type="date" id="pnlToDate" class="border rounded px-2 py-1 text-xs">
              <button onclick="loadPnl()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 ml-auto">
                <i class="fas fa-search mr-1"></i>조회
              </button>
              <button onclick="exportFinancialCsv()" class="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"><i class="fas fa-file-csv mr-1"></i>CSV</button>
            </div>

            <!-- KPI 행 -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div class="bg-white rounded-lg border p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-[10px] text-gray-400 mb-1">매출</div>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="pnlRevenue">-</div>
                <div class="text-[10px] text-gray-400 mt-1" id="pnlRevenueCount">건</div>
              </div>
              <div class="bg-white rounded-lg border p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-[10px] text-gray-400 mb-1">매출총이익</div>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="pnlGrossProfit">-</div>
                <div class="text-[10px] text-gray-400 mt-1" id="pnlGrossProfitMargin">-</div>
              </div>
              <div class="bg-white rounded-lg border p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-[10px] text-gray-400 mb-1">영업이익</div>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="pnlOperatingProfit">-</div>
                <div class="text-[10px] text-gray-400 mt-1" id="pnlOperatingMargin">-</div>
              </div>
              <div class="bg-white rounded-lg border p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-[10px] text-gray-400 mb-1">당기순이익</div>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="pnlNetProfit">-</div>
                <div class="text-[10px] text-gray-400 mt-1" id="pnlNetMargin">-</div>
              </div>
            </div>

            <!-- P&L 테이블 -->
            <div class="bg-white rounded-lg border shadow-sm overflow-x-auto">
              <table class="w-full text-xs ds-table-striped">
                <thead class="bg-gray-50 sticky top-0">
                  <tr>
                    <th class="px-3 py-2 text-left text-gray-600 font-semibold">항목</th>
                    <th class="px-3 py-2 text-right text-gray-600 font-semibold" style="font-variant-numeric:tabular-nums;">금액</th>
                    <th class="px-3 py-2 text-right text-gray-600 font-semibold" style="font-variant-numeric:tabular-nums;">수량/비율</th>
                  </tr>
                </thead>
                <tbody id="pnlTableBody">
                  <tr>
                    <td colspan="3" class="px-3 py-8 text-center text-gray-400">
                      <i class="fas fa-inbox text-2xl mb-2 block text-gray-300"></i>
                      조회 버튼을 클릭하여 데이터를 불러오세요
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 월별 추이 탭 -->
          <div id="monthlyPanel" class="hidden p-4 space-y-4">
            <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2 flex-wrap">
              <label class="text-xs text-gray-500">연도</label>
              <select id="monthlyYear" class="border rounded px-2 py-1 text-xs"></select>
              <button onclick="loadMonthlyPnl()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 ml-auto">
                <i class="fas fa-search mr-1"></i>조회
              </button>
              <button onclick="exportFinancialCsv()" class="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"><i class="fas fa-file-csv mr-1"></i>CSV</button>
            </div>

            <!-- KPI 행 -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div class="bg-white rounded-lg border p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-[10px] text-gray-400 mb-1">연간 매출</div>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="monthlyYearRevenue">-</div>
                <div class="text-[10px] text-gray-400 mt-1">합계</div>
              </div>
              <div class="bg-white rounded-lg border p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-[10px] text-gray-400 mb-1">연간 영업이익</div>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="monthlyYearProfit">-</div>
                <div class="text-[10px] text-gray-400 mt-1">합계</div>
              </div>
              <div class="bg-white rounded-lg border p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-[10px] text-gray-400 mb-1">월 평균 매출</div>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="monthlyAvgRevenue">-</div>
                <div class="text-[10px] text-gray-400 mt-1">12개월</div>
              </div>
              <div class="bg-white rounded-lg border p-3 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-[10px] text-gray-400 mb-1">평균 이익률</div>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="monthlyAvgMargin">-</div>
                <div class="text-[10px] text-gray-400 mt-1">%</div>
              </div>
            </div>

            <!-- 차트 -->
            <div class="bg-white rounded-lg border shadow-sm p-4">
              <canvas id="monthlyTrendChart" height="80"></canvas>
            </div>

            <!-- 월별 테이블 -->
            <div class="bg-white rounded-lg border shadow-sm overflow-x-auto">
              <table class="w-full text-xs ds-table-striped">
                <thead class="bg-gray-50 sticky top-0">
                  <tr>
                    <th class="px-3 py-2 text-center text-gray-600 font-semibold">월</th>
                    <th class="px-3 py-2 text-right text-gray-600 font-semibold" style="font-variant-numeric:tabular-nums;">매출</th>
                    <th class="px-3 py-2 text-right text-gray-600 font-semibold" style="font-variant-numeric:tabular-nums;">비용</th>
                    <th class="px-3 py-2 text-right text-gray-600 font-semibold" style="font-variant-numeric:tabular-nums;">이익</th>
                    <th class="px-3 py-2 text-right text-gray-600 font-semibold" style="font-variant-numeric:tabular-nums;">이익률</th>
                  </tr>
                </thead>
                <tbody id="monthlyTableBody">
                  <tr>
                    <td colspan="5" class="px-3 py-8 text-center text-gray-400">
                      <i class="fas fa-inbox text-2xl mb-2 block text-gray-300"></i>
                      조회 버튼을 클릭하여 데이터를 불러오세요
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 재무 스냅샷 탭 -->
          <div id="snapshotPanel" class="hidden p-4 space-y-4">
            <div class="flex justify-end">
              <button onclick="loadBalanceSnapshot()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                <i class="fas fa-sync-alt mr-1"></i>갱신
              </button>
            </div>

            <!-- 자산 카드 -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3 text-center">
                <i class="fas fa-dollar-sign text-green-600 text-xl mb-2 block"></i>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="snapshotCash">-</div>
                <div class="text-[10px] text-gray-400 mt-1">현금</div>
              </div>
              <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3 text-center">
                <i class="fas fa-handshake text-blue-600 text-xl mb-2 block"></i>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="snapshotAr">-</div>
                <div class="text-[10px] text-gray-400 mt-1">미수금</div>
              </div>
              <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3 text-center">
                <i class="fas fa-boxes text-amber-600 text-xl mb-2 block"></i>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="snapshotInventory">-</div>
                <div class="text-[10px] text-gray-400 mt-1">재고</div>
              </div>
              <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3 text-center">
                <i class="fas fa-credit-card text-red-600 text-xl mb-2 block"></i>
                <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="snapshotAp">-</div>
                <div class="text-[10px] text-gray-400 mt-1">매입미지급</div>
              </div>
            </div>

            <!-- 대출 & 순자산 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-4 text-center">
                <i class="fas fa-university text-red-600 text-2xl mb-2 block"></i>
                <div class="text-sm text-gray-500 mb-1">대출 잔액</div>
                <div class="text-2xl font-bold text-red-600" style="font-variant-numeric:tabular-nums;" id="snapshotLoans">-</div>
              </div>
              <div class="bg-white rounded-lg border border-green-200 shadow-sm hover:shadow-md transition-shadow p-4 text-center">
                <i class="fas fa-chart-pie text-green-600 text-2xl mb-2 block"></i>
                <div class="text-sm text-gray-500 mb-1">순자산</div>
                <div class="text-2xl font-bold text-green-600" style="font-variant-numeric:tabular-nums;" id="snapshotNetAssets">-</div>
              </div>
            </div>

            <!-- 타임스탐프 -->
            <div class="text-xs text-gray-400 text-right">
              <span id="snapshotTimestamp">-</span>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
