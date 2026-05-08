import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/cashSchedule.js?raw'

export function cashSchedulePage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '자금계획',
    activePage: '/cash-schedule',
    pageContent: `
      <div class="space-y-4">
        <!-- 탭 버튼 -->
        <div class="bg-white rounded-lg border shadow-sm flex border-b">
          <button id="tabSchedule" onclick="switchScheduleTab('schedule')" class="px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600 flex items-center gap-2">
            <i class="fas fa-calendar-alt text-sm"></i>자금계획
          </button>
          <button id="tabForecast" onclick="switchScheduleTab('forecast')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
            <i class="fas fa-chart-line text-sm"></i>추정자금일보
          </button>
        </div>

        <!-- 자금계획 탭 -->
        <div id="schedulePanel" class="space-y-4">
          <!-- KPI 카드 -->
          <div class="grid grid-cols-5 gap-2">
            <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">이번달 입금예정</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="schKpiInTotal">-</div>
            </div>
            <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">이번달 지급예정</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="schKpiOutTotal">-</div>
            </div>
            <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">순 현금흐름</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="schKpiNetFlow">-</div>
            </div>
            <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">입금 완료</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="schKpiInDone">-</div>
            </div>
            <div class="bg-white rounded-lg border border-red-200 p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-red-500 font-medium mb-1">연체</div>
              <div class="text-lg font-bold text-red-600 tabular-nums" id="schKpiOverdue">-</div>
            </div>
          </div>

          <!-- 제어 바 -->
          <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2">
            <button onclick="schPrevMonth()" class="px-2 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
              <i class="fas fa-chevron-left"></i>
            </button>
            <button onclick="schToday()" class="px-2 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">오늘</button>
            <div id="schMonthLabel" class="text-sm font-medium ml-2"></div>
            <button onclick="schNextMonth()" class="px-2 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
              <i class="fas fa-chevron-right"></i>
            </button>
            <div class="flex-1"></div>
            <button onclick="schAutoGenerate()" class="px-3 py-1.5 text-xs border border-amber-300 text-amber-700 bg-amber-50 rounded hover:bg-amber-100">
              <i class="fas fa-magic mr-1"></i>자동생성
            </button>
            <button onclick="schCheckOverdue()" class="px-3 py-1.5 text-xs border border-red-300 text-red-700 bg-red-50 rounded hover:bg-red-100">
              <i class="fas fa-exclamation-triangle mr-1"></i>연체체크
            </button>
            <button onclick="schOpenAddModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              <i class="fas fa-plus mr-1"></i>예정 등록
            </button>
          </div>

          <!-- 캘린더 그리드 -->
          <div class="bg-white rounded-lg border shadow-sm p-3">
            <div class="grid grid-cols-7 gap-1 text-[10px]">
              <!-- 요일 헤더 -->
              <div class="text-center font-bold text-gray-600 py-1">일</div>
              <div class="text-center font-bold text-gray-600 py-1">월</div>
              <div class="text-center font-bold text-gray-600 py-1">화</div>
              <div class="text-center font-bold text-gray-600 py-1">수</div>
              <div class="text-center font-bold text-gray-600 py-1">목</div>
              <div class="text-center font-bold text-gray-600 py-1">금</div>
              <div class="text-center font-bold text-gray-600 py-1">토</div>
              <!-- 캘린더 셀 -->
              <div id="schCalendarContainer" class="col-span-7"></div>
            </div>
          </div>
        </div>

        <!-- 추정자금일보 탭 -->
        <div id="forecastPanel" class="hidden space-y-4">
          <!-- 제어 바 -->
          <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2">
            <label class="text-[10px] text-gray-500">시작 잔액</label>
            <input id="fcStartBalance" type="text" inputmode="numeric" data-money value="0" class="border rounded px-2 py-1 text-xs w-32 text-gray-900">
            <label class="text-[10px] text-gray-500 ml-2">기간</label>
            <select id="fcDays" class="border rounded px-2 py-1 text-xs">
              <option value="30">30일</option>
              <option value="60">60일</option>
              <option value="90" selected>90일</option>
              <option value="180">180일</option>
            </select>
            <div class="flex-1"></div>
            <button onclick="loadForecast()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              <i class="fas fa-play mr-1"></i>예측 실행
            </button>
          </div>

          <!-- KPI 카드 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">예상 종료 잔액</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="fcKpiEndBalance">-</div>
            </div>
            <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">최저 잔액</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="fcKpiMinBalance">-</div>
            </div>
            <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">최고 잔액</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="fcKpiMaxBalance">-</div>
            </div>
            <div class="bg-white rounded-lg border border-red-200 p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
              <div class="text-[10px] text-red-500 font-medium mb-1">위험일</div>
              <div class="text-lg font-bold text-red-600 tabular-nums" id="fcKpiRiskDays">-</div>
            </div>
          </div>

          <!-- 차트 (간단한 HTML 바 차트) -->
          <div class="bg-white rounded-lg border shadow-sm p-3">
            <div class="text-xs font-medium mb-2 text-gray-600">일별 잔액 추이</div>
            <div id="fcChartContainer" class="w-full overflow-x-auto" style="max-height: 200px;">
              <div class="flex gap-1" id="fcChart"></div>
            </div>
          </div>

          <!-- 위험일 테이블 -->
          <div class="bg-white rounded-lg border shadow-sm p-3">
            <div class="text-xs font-medium mb-2 text-gray-600">음수 잔액 일자</div>
            <div id="fcRiskTable" class="overflow-x-auto"></div>
          </div>

          <!-- 예측 테이블 -->
          <div class="bg-white rounded-lg border shadow-sm p-3">
            <div class="text-xs font-medium mb-2 text-gray-600">일별 예측</div>
            <div id="fcForecastTable" class="overflow-x-auto"></div>
          </div>
        </div>
      </div>

      <!-- 일별 상세 모달 -->
      <div id="schDayModal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-lg w-96 max-h-96 overflow-y-auto">
          <div class="flex justify-between items-center px-4 py-3 border-b">
            <h3 class="text-sm font-bold" id="schDayModalTitle"></h3>
            <button onclick="schCloseDayDetail()" class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div id="schDayModalContent" class="p-4 space-y-2"></div>
        </div>
      </div>

      <!-- 예정 등록 모달 -->
      <div id="schAddModal" class="hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-lg w-96">
          <div class="flex justify-between items-center px-4 py-3 border-b">
            <h3 class="text-sm font-bold">예정 등록</h3>
            <button onclick="schCloseAddModal()" class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">예정일</label>
              <input id="schAddDate" type="date" class="w-full border rounded px-3 py-2 text-sm text-gray-900">
              <div id="schAddDateErr" class="text-[10px] text-red-600 mt-0.5"></div>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">유형</label>
              <select id="schAddType" class="w-full border rounded px-3 py-2 text-sm text-gray-900">
                <option value="IN">입금</option>
                <option value="OUT">지급</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">분류</label>
              <select id="schAddSource" class="w-full border rounded px-3 py-2 text-sm text-gray-900">
                <option value="ORDER">매출 주문</option>
                <option value="PURCHASE">구매 발주</option>
                <option value="FIXED">고정비</option>
                <option value="TAX">세금</option>
                <option value="PAYROLL">급여</option>
                <option value="LOAN">차입금</option>
                <option value="OTHER">기타</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">금액</label>
              <input id="schAddAmount" type="text" inputmode="numeric" data-money class="w-full border rounded px-3 py-2 text-sm text-gray-900">
              <div id="schAddAmountErr" class="text-[10px] text-red-600 mt-0.5"></div>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">설명</label>
              <input id="schAddDesc" type="text" placeholder="선택사항" class="w-full border rounded px-3 py-2 text-sm text-gray-900">
            </div>
            <div class="flex gap-2 justify-end pt-2">
              <button onclick="schCloseAddModal()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">취소</button>
              <button onclick="schSave()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
