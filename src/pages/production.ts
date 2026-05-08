import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/production.js?raw'

export function productionPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '생산 현황',
    activePage: '/production',
    pageContent: `
      <!-- ── 탭 네비게이션 ── -->
      <div class="flex gap-1 mb-4 border-b border-gray-200">
        <button id="tabBtnStatus" onclick="switchProdTab('status')"
          class="px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-600 -mb-px transition-colors">
          <i class="fas fa-chart-line mr-1.5"></i>현황
        </button>
        <button id="tabBtnSchedule" onclick="switchProdTab('schedule')"
          class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 -mb-px transition-colors">
          <i class="fas fa-tasks mr-1.5"></i>스케줄
        </button>
      </div>

      <!-- ══════════ 탭 1: 현황 ══════════ -->
      <div id="tabStatus">

        <!-- ── 상단: 오늘 생산 KPI ── -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <!-- 오늘 출력 완료 -->
          <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3 text-center">
            <div class="text-[10px] text-gray-400 mb-1">
              <i class="fas fa-check-circle text-green-500 mr-1"></i>오늘 완료
            </div>
            <div id="kpiOk" class="text-2xl font-bold tabular-nums" style="color:#212529;">
              <span class="ds-skeleton ds-skeleton-title inline-block w-10"></span>
            </div>
            <div class="text-[10px] text-gray-400 mt-1">건</div>
          </div>

          <!-- 오늘 진행중 -->
          <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3 text-center">
            <div class="text-[10px] text-gray-400 mb-1">
              <i class="fas fa-spinner text-blue-500 mr-1"></i>인쇄 진행중
            </div>
            <div id="kpiPrinting" class="text-2xl font-bold tabular-nums" style="color:#212529;">
              <span class="ds-skeleton ds-skeleton-title inline-block w-10"></span>
            </div>
            <div class="text-[10px] text-gray-400 mt-1">카드</div>
          </div>

          <!-- 오늘 에러/취소 -->
          <div id="kpiErrorCard" class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3 text-center">
            <div class="text-[10px] text-gray-400 mb-1">
              <i class="fas fa-exclamation-triangle text-red-500 mr-1"></i>에러 / 취소
            </div>
            <div id="kpiError" class="text-2xl font-bold tabular-nums" style="color:#212529;">
              <span class="ds-skeleton ds-skeleton-title inline-block w-10"></span>
            </div>
            <div class="text-[10px] text-gray-400 mt-1">건</div>
          </div>

          <!-- 평균 인쇄 소요시간 -->
          <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-3 text-center">
            <div class="text-[10px] text-gray-400 mb-1">
              <i class="fas fa-stopwatch text-amber-500 mr-1"></i>평균 인쇄시간
            </div>
            <div id="kpiAvgDur" class="text-2xl font-bold tabular-nums" style="color:#212529;">
              <span class="ds-skeleton ds-skeleton-title inline-block w-14"></span>
            </div>
            <div class="text-[10px] text-gray-400 mt-1">오늘 기준</div>
          </div>
        </div>

        <!-- ── 장비(에이전트) 상태 ── -->
        <div class="bg-white rounded-lg border shadow-sm p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-bold text-gray-700">
              <i class="fas fa-server text-blue-500 mr-1.5"></i>장비 상태
            </h2>
            <div id="agentSummary" class="text-xs text-gray-400"></div>
          </div>
          <div id="agentList" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <!-- 스켈레톤 -->
            <div class="ds-skeleton" style="height:64px;border-radius:8px;"></div>
            <div class="ds-skeleton" style="height:64px;border-radius:8px;"></div>
            <div class="ds-skeleton" style="height:64px;border-radius:8px;"></div>
          </div>
        </div>

        <!-- ── 최근 출력 이벤트 (페이지네이션 포함) ── -->
        <div class="bg-white rounded-lg border shadow-sm mb-4">
          <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 class="text-sm font-bold text-gray-700">
              <i class="fas fa-list-alt text-blue-500 mr-1.5"></i>최근 출력 이력
            </h2>
            <div class="flex items-center gap-2">
              <span id="eventsTotalLabel" class="text-[10px] text-gray-400">50건 / 페이지</span>
              <button onclick="loadRecentEvents()" class="text-gray-400 hover:text-gray-600 transition-colors" title="새로고침">
                <i class="fas fa-sync-alt text-xs"></i>
              </button>
            </div>
          </div>
          <div class="ds-table-wrap" style="max-height:320px;overflow-y:auto;">
            <table class="w-full text-sm ds-table ds-table-striped">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase sticky top-0 bg-gray-50 z-5 whitespace-nowrap">시간</th>
                  <th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase sticky top-0 bg-gray-50 z-5 whitespace-nowrap">장비</th>
                  <th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase sticky top-0 bg-gray-50 z-5">파일명</th>
                  <th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase sticky top-0 bg-gray-50 z-5 whitespace-nowrap">규격(cm)</th>
                  <th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase sticky top-0 bg-gray-50 z-5 whitespace-nowrap">소요</th>
                  <th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase sticky top-0 bg-gray-50 z-5 whitespace-nowrap">출력정보</th>
                  <th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase sticky top-0 bg-gray-50 z-5 whitespace-nowrap">상태</th>
                </tr>
              </thead>
              <tbody id="recentEventsBody">
                <tr><td colspan="7" class="px-3 py-8 text-center">
                  <div class="ds-skeleton ds-skeleton-row mb-1"></div>
                  <div class="ds-skeleton ds-skeleton-row mb-1"></div>
                  <div class="ds-skeleton ds-skeleton-row"></div>
                </td></tr>
              </tbody>
            </table>
          </div>
          <!-- 페이지네이션 -->
          <div class="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
            <span class="text-[10px] text-gray-400">전체 <strong id="eventsTotalCount">0</strong>건</span>
            <div class="flex items-center gap-2">
              <button id="eventsPrevBtn" onclick="changeEventsPage(-1)"
                class="px-2 py-1 text-[10px] border rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50" disabled>
                <i class="fas fa-chevron-left"></i>
              </button>
              <span class="text-[10px] text-gray-500">
                <span id="eventsCurrentPage">1</span> / <span id="eventsTotalPages">1</span>
              </span>
              <button id="eventsNextBtn" onclick="changeEventsPage(1)"
                class="px-2 py-1 text-[10px] border rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50" disabled>
                <i class="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- ── 하단: 일별 생산량 차트 ── -->
        <div class="bg-white rounded-lg border shadow-sm p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-bold text-gray-700">
              <i class="fas fa-chart-bar text-blue-500 mr-1.5"></i>최근 7일 일별 출력량
            </h2>
            <div class="flex gap-3 text-[10px] text-gray-400">
              <span><span class="inline-block w-2.5 h-2.5 rounded-sm bg-green-500 mr-1"></span>정상(OK)</span>
              <span><span class="inline-block w-2.5 h-2.5 rounded-sm bg-red-400 mr-1"></span>에러/취소</span>
            </div>
          </div>
          <div id="dailyChart" class="space-y-2">
            <div class="ds-skeleton ds-skeleton-row"></div>
            <div class="ds-skeleton ds-skeleton-row"></div>
            <div class="ds-skeleton ds-skeleton-row"></div>
            <div class="ds-skeleton ds-skeleton-row"></div>
            <div class="ds-skeleton ds-skeleton-row"></div>
          </div>
        </div>

      </div><!-- /tabStatus -->

      <!-- ══════════ 탭 2: 스케줄 ══════════ -->
      <div id="tabSchedule" class="hidden">

        <!-- 요약 통계 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-600 mb-1">총 대기 카드</div>
            <div class="text-2xl font-bold text-blue-600" id="statTotalQueue">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-600 mb-1">미배정 카드</div>
            <div class="text-2xl font-bold text-orange-600" id="statUnassigned">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-600 mb-1">오늘 납기</div>
            <div class="text-2xl font-bold text-red-600" id="statTodayDue">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-600 mb-1">과부하 장비</div>
            <div class="text-2xl font-bold text-red-600" id="statOverloaded">-</div>
          </div>
        </div>

        <!-- 메인 스케줄 보드 -->
        <div class="flex gap-4 overflow-x-auto pb-4" id="scheduleBoard" style="min-height: 500px;">
          <!-- 미배정 패널 -->
          <div class="flex-shrink-0 w-72 bg-orange-50 rounded-lg shadow">
            <div class="p-3 border-b border-orange-200 bg-orange-100 rounded-t-lg">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-orange-800 text-sm">
                  <i class="fas fa-inbox mr-1"></i>
                  미배정
                  <span class="text-xs font-normal ml-1" id="unassignedCount"></span>
                </h3>
              </div>
            </div>
            <div id="unassignedCards" class="p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto"
                 data-equipment-id="">
              <div class="text-center text-gray-400 py-4 text-sm">로딩 중...</div>
            </div>
          </div>

          <!-- 장비별 칼럼 (JS에서 동적 생성) -->
          <div id="equipmentColumns" class="flex gap-4">
            <div class="text-center text-gray-400 py-8">장비 정보를 불러오는 중...</div>
          </div>
        </div>

      </div><!-- /tabSchedule -->
    `,
    pageScript
  })
}
