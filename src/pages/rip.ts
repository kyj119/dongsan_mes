import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/rip.js?raw'

export function ripPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'RIP 모니터',
    activePage: '/rip',
    pageCSS: `
            .badge-ok { background: #dcfce7; color: #166534; }
            .badge-error { background: #fee2e2; color: #991b1b; }
            .badge-cancel { background: #fef3c7; color: #92400e; }
            .badge-online { background: #dcfce7; color: #166534; }
            .badge-offline { background: #fee2e2; color: #991b1b; }
            .bar-ok { background: #22c55e; }
            .bar-error { background: #ef4444; }
            .bar-cancel { background: #f59e0b; }
            .tab-active { border-bottom: 2px solid #2563eb; color: #2563eb; font-weight: 600; }
    `,
    pageContent: `
        <!-- Toolbar -->
        <div class="flex items-center justify-end gap-3 mb-4">
            <span id="lastRefresh" class="text-sm text-gray-500"></span>
            <button onclick="refreshAll()" class="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
                <i class="fas fa-sync-alt mr-1"></i>새로고침
            </button>
        </div>

        <div>
            <!-- Agent Summary Bar -->
            <div id="agentSummaryBar" class="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-6">
                <div class="flex items-center gap-2">
                    <i class="fas fa-server text-gray-500"></i>
                    <span class="font-semibold">에이전트:</span>
                    <span id="agentTotal" class="text-gray-700">0</span>대
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                    <span>온라인 <strong id="agentOnline">0</strong></span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                    <span>오프라인 <strong id="agentOffline">0</strong></span>
                </div>
                <div id="offlineWarning" class="hidden ml-auto text-red-600 text-sm font-medium">
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    <span id="offlineNames"></span> 응답 없음
                </div>
            </div>

            <!-- KPI Cards -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-sm text-gray-500 mb-1">오늘 출력 완료</div>
                    <div class="text-3xl font-bold text-green-600" id="kpiOk">0</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-sm text-gray-500 mb-1">오늘 에러</div>
                    <div class="text-3xl font-bold text-red-600" id="kpiError">0</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-sm text-gray-500 mb-1">오늘 취소</div>
                    <div class="text-3xl font-bold text-amber-600" id="kpiCancel">0</div>
                </div>
                <div class="bg-white rounded-lg shadow p-4">
                    <div class="text-sm text-gray-500 mb-1">오늘 전체</div>
                    <div class="text-3xl font-bold text-blue-600" id="kpiTotal">0</div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="flex border-b border-gray-200 mb-4 bg-white rounded-t-lg px-4">
                <button class="tab-btn px-4 py-3 text-sm tab-active" data-tab="events">
                    <i class="fas fa-list mr-1"></i>실시간 이벤트
                </button>
                <button class="tab-btn px-4 py-3 text-sm text-gray-500 hover:text-gray-700" data-tab="agents">
                    <i class="fas fa-server mr-1"></i>에이전트 목록
                </button>
                <button class="tab-btn px-4 py-3 text-sm text-gray-500 hover:text-gray-700" data-tab="chart">
                    <i class="fas fa-chart-bar mr-1"></i>일별 통계
                </button>
            </div>

            <!-- Tab: Events -->
            <div id="tab-events" class="tab-panel">
                <div class="bg-white rounded-lg shadow">
                    <div class="p-4 border-b flex items-center gap-3 flex-wrap">
                        <select id="filterStatus" class="border rounded px-3 py-1.5 text-sm">
                            <option value="">전체 상태</option>
                            <option value="OK">OK</option>
                            <option value="ERROR">Error</option>
                            <option value="CANCEL">Cancel</option>
                        </select>
                        <select id="filterAgent" class="border rounded px-3 py-1.5 text-sm">
                            <option value="">전체 에이전트</option>
                        </select>
                        <input type="date" id="filterDate" class="border rounded px-3 py-1.5 text-sm" />
                        <button onclick="loadEvents()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                            <i class="fas fa-search mr-1"></i>조회
                        </button>
                    </div>
                    <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                        <table class="w-full text-sm ds-table-striped">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left">시간</th>
                                    <th class="px-4 py-2 text-left">장비</th>
                                    <th class="px-4 py-2 text-left">프린터</th>
                                    <th class="px-4 py-2 text-left">파일명</th>
                                    <th class="px-4 py-2 text-left">상태</th>
                                    <th class="px-4 py-2 text-left">카드 매칭</th>
                                    <th class="px-4 py-2 text-left">출력정보</th>
                                    <th class="px-4 py-2 text-left">크기</th>
                                </tr>
                            </thead>
                            <tbody id="eventsBody">
                                <tr><td colspan="8" class="px-4 py-8 text-center text-gray-400">데이터를 불러오는 중...</td></tr>

                            </tbody>
                        </table>
                    </div>
                    <div class="p-4 border-t flex items-center justify-between">
                        <span class="text-sm text-gray-500">
                            전체 <strong id="eventsTotal">0</strong>건
                        </span>
                        <div class="flex gap-2">
                            <button id="prevPage" onclick="changePage(-1)" class="px-3 py-1 border rounded text-sm disabled:opacity-50" disabled>이전</button>
                            <span class="px-3 py-1 text-sm">페이지 <span id="currentPageNum">1</span>/<span id="totalPagesNum">1</span></span>
                            <button id="nextPage" onclick="changePage(1)" class="px-3 py-1 border rounded text-sm disabled:opacity-50" disabled>다음</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tab: Agents -->
            <div id="tab-agents" class="tab-panel hidden">
                <div class="bg-white rounded-lg shadow">
                    <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                        <table class="w-full text-sm ds-table-striped">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left">상태</th>
                                    <th class="px-4 py-2 text-left">장비번호</th>
                                    <th class="px-4 py-2 text-left">PC명</th>
                                    <th class="px-4 py-2 text-left">IP 주소</th>
                                    <th class="px-4 py-2 text-left">버전</th>
                                    <th class="px-4 py-2 text-left">마지막 접속</th>
                                    <th class="px-4 py-2 text-left">Print.log 경로</th>
                                </tr>
                            </thead>
                            <tbody id="agentsBody">
                                <tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">데이터를 불러오는 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Tab: Chart -->
            <div id="tab-chart" class="tab-panel hidden">
                <div class="bg-white rounded-lg shadow p-6">
                    <h3 class="text-lg font-semibold mb-4">최근 7일 출력 현황</h3>
                    <div id="dailyChart" class="space-y-3"></div>
                    <div class="flex gap-4 mt-4 text-sm text-gray-600">
                        <span><span class="inline-block w-3 h-3 rounded bar-ok mr-1"></span>완료</span>
                        <span><span class="inline-block w-3 h-3 rounded bar-error mr-1"></span>에러</span>
                        <span><span class="inline-block w-3 h-3 rounded bar-cancel mr-1"></span>취소</span>
                    </div>
                </div>
            </div>
        </div>
    `,
    pageScript
  })
}
