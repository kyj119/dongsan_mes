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
          <div class="ds-card hover:shadow-md transition-shadow p-3 text-center">
            <div class="text-[10px] text-gray-400 mb-1">
              <i class="fas fa-check-circle text-green-500 mr-1"></i>오늘 완료
            </div>
            <div id="kpiOk" class="text-2xl font-bold tabular-nums" style="color:#212529;">
              <span class="ds-skeleton ds-skeleton-title inline-block w-10"></span>
            </div>
            <div class="text-[10px] text-gray-400 mt-1">건</div>
          </div>

          <!-- 오늘 진행중 -->
          <div class="ds-card hover:shadow-md transition-shadow p-3 text-center">
            <div class="text-[10px] text-gray-400 mb-1">
              <i class="fas fa-spinner text-blue-500 mr-1"></i>인쇄 진행중
            </div>
            <div id="kpiPrinting" class="text-2xl font-bold tabular-nums" style="color:#212529;">
              <span class="ds-skeleton ds-skeleton-title inline-block w-10"></span>
            </div>
            <div class="text-[10px] text-gray-400 mt-1">카드</div>
          </div>

          <!-- 오늘 에러/취소 -->
          <div id="kpiErrorCard" class="ds-card hover:shadow-md transition-shadow p-3 text-center">
            <div class="text-[10px] text-gray-400 mb-1">
              <i class="fas fa-exclamation-triangle text-red-500 mr-1"></i>에러 / 취소
            </div>
            <div id="kpiError" class="text-2xl font-bold tabular-nums" style="color:#212529;">
              <span class="ds-skeleton ds-skeleton-title inline-block w-10"></span>
            </div>
            <div class="text-[10px] text-gray-400 mt-1">건</div>
          </div>

          <!-- 평균 인쇄 소요시간 -->
          <div class="ds-card hover:shadow-md transition-shadow p-3 text-center">
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
        <div class="ds-card p-4 mb-4">
          <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 class="text-sm font-bold text-gray-700">
              <i class="fas fa-server text-blue-500 mr-1.5"></i>장비 상태
            </h2>
            <div class="flex items-center gap-2">
              <div class="relative">
                <i class="fas fa-search text-gray-300 text-[10px] absolute left-2 top-1/2 -translate-y-1/2"></i>
                <input id="eqQuickSearch" type="text" oninput="productionFilterEquipment()" placeholder="장비명·ID 검색"
                  class="border rounded pl-6 pr-2 py-1 text-xs w-40" title="장비 즉시검색">
              </div>
              <div id="agentSummary" class="text-xs text-gray-400"></div>
            </div>
          </div>
          <div id="agentList" class="space-y-3">
            <!-- 스켈레톤 -->
            <div class="ds-skeleton" style="height:64px;border-radius:8px;"></div>
            <div class="ds-skeleton" style="height:64px;border-radius:8px;"></div>
            <div class="ds-skeleton" style="height:64px;border-radius:8px;"></div>
          </div>
        </div>

        <!-- ── 최근 출력 이벤트 (페이지네이션 포함) ── -->
        <div class="ds-card mb-4">
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
          <!-- #343: 출력이력 필터 (키워드/기간/다중장비/상태) — 라우트 기구현 -->
          <div class="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/40">
            <!-- 키워드 검색 -->
            <div class="relative">
              <i class="fas fa-search text-gray-300 text-[10px] absolute left-2 top-1/2 -translate-y-1/2"></i>
              <input id="evFilterKeyword" type="text" placeholder="파일명·카드번호·주문번호 검색"
                class="border rounded pl-6 pr-2 py-1 text-xs w-52" title="키워드 검색">
            </div>
            <!-- 다중 장비 선택 드롭다운 -->
            <div class="relative" id="evAgentDropdownWrap">
              <button type="button" id="evAgentDropdownBtn" onclick="productionToggleAgentDropdown()"
                class="border rounded px-2 py-1 text-xs flex items-center gap-1 bg-white hover:bg-gray-50" title="장비 선택">
                <i class="fas fa-server text-gray-400 text-[10px]"></i>
                <span id="evAgentDropdownLabel">전체 장비</span>
                <i class="fas fa-chevron-down text-gray-300 text-[9px]"></i>
              </button>
              <div id="evAgentDropdownPanel"
                class="hidden absolute z-30 mt-1 left-0 bg-white border rounded shadow-lg p-2 text-xs"
                style="min-width:200px;max-height:300px;overflow-y:auto;">
                <label class="flex items-center gap-1.5 py-1 border-b border-gray-100 mb-1 font-medium text-gray-700">
                  <input type="checkbox" id="evAgentSelectAll" onchange="productionToggleAllAgents(this.checked)">전체
                </label>
                <div id="evAgentCheckboxes"></div>
              </div>
            </div>
            <!-- 상태 -->
            <select id="evFilterStatus" onchange="applyEventFilters()" class="border rounded px-2 py-1 text-xs" title="상태">
              <option value="">전체 상태</option>
              <option value="OK">정상</option>
              <option value="ERROR">오류</option>
              <option value="CANCEL">취소</option>
            </select>
            <!-- 기간 범위 -->
            <div class="flex items-center gap-1">
              <input id="evFilterFrom" type="date" onchange="applyEventFilters()" class="border rounded px-2 py-1 text-xs" title="시작일">
              <span class="text-gray-300 text-[10px]">~</span>
              <input id="evFilterTo" type="date" onchange="applyEventFilters()" class="border rounded px-2 py-1 text-xs" title="종료일">
            </div>
            <button onclick="resetEventFilters()" class="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600" title="필터 초기화">
              <i class="fas fa-times mr-0.5"></i>초기화
            </button>
          </div>
          <div class="ds-table-wrap" style="max-height:320px;overflow-y:auto;">
            <table class="w-full text-sm ds-table ds-table-striped ds-table-fixed">
              <thead>
                <tr>
                  <th class="text-left" style="width:100px">시간</th>
                  <th class="text-left" style="width:90px">장비</th>
                  <th class="text-left">파일명</th>
                  <th class="text-left" style="width:120px">규격(cm)</th>
                  <th class="text-left" style="width:64px">소요</th>
                  <th class="text-left" style="width:100px">출력정보</th>
                  <th class="text-left" style="width:80px">상태</th>
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
        <div class="ds-card p-4">
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
          <div class="ds-card p-4">
            <div class="text-sm text-gray-600 mb-1">총 대기 카드</div>
            <div class="text-2xl font-bold text-blue-600" id="statTotalQueue">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-600 mb-1">미배정 카드</div>
            <div class="text-2xl font-bold text-orange-600" id="statUnassigned">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-600 mb-1">오늘 납기</div>
            <div class="text-2xl font-bold text-red-600" id="statTodayDue">-</div>
          </div>
          <div class="ds-card p-4">
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
