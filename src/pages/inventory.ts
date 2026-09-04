import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import { UOM_JS } from '../utils/unitConvert'
import inventoryScript from '../scripts/inventory.js?raw'
import inventoryCountScript from '../scripts/inventoryCount.js?raw'
import inventoryDashboardScript from '../scripts/inventoryDashboard.js?raw'
import inventoryTxScript from '../scripts/inventoryTx.js?raw'
import inventoryValuationScript from '../scripts/inventoryValuation.js?raw'
import { INVENTORY_TX_LABELS_JS } from '../constants/inventoryTx'

export function inventoryPage(c: Context<HonoEnv>) {
  const tabScript = `
    function switchInvTab(tab) {
      // Close any open modals when switching tabs
      document.querySelectorAll('.modal, [id$="Modal"]').forEach(function(m) {
        m.classList.add('hidden');
      });

      var defs = [
        { key: 'stock', btn: 'tabStock', content: 'stockTabContent' },
        { key: 'count', btn: 'tabCount', content: 'countTabContent' },
        { key: 'zone',  btn: 'tabZone',  content: 'zoneTabContent' },
        { key: 'tx',    btn: 'tabTx',    content: 'txTabContent' },
        { key: 'valuation', btn: 'tabValuation', content: 'valuationTabContent' }
      ];
      defs.forEach(function(d) {
        var btn = document.getElementById(d.btn);
        var content = document.getElementById(d.content);
        if (!btn || !content) { console.warn('[inventory] tab not found: ' + d.key); return; }
        if (d.key === tab) {
          btn.classList.remove('border-transparent', 'text-gray-500');
          btn.classList.add('border-blue-600', 'text-blue-600');
          content.classList.remove('hidden');
        } else {
          btn.classList.remove('border-blue-600', 'text-blue-600');
          btn.classList.add('border-transparent', 'text-gray-500');
          content.classList.add('hidden');
        }
      });
      window.location.hash = '#tab=' + tab;

      if (tab === 'count' && typeof loadCounts === 'function') {
        loadCounts();
      }
      // 창고별 탭: 최초 진입 시에만 lazy-load (inventoryDashboard.js)
      if (tab === 'zone' && typeof loadDashboard === 'function' && !window.__zoneLoaded) {
        window.__zoneLoaded = true;
        loadDashboard();
      }
      // 증감내역 탭: invTxInit 이 최초 1회만 초기화하고 이후엔 재조회 (inventoryTx.js)
      if (tab === 'tx' && typeof invTxInit === 'function') {
        invTxInit();
      }
      // 재고자산 평가 탭: 전 품목 평가액 집계라 탭에 들어올 때만 부른다
      if (tab === 'valuation' && typeof invValInit === 'function') {
        invValInit();
      }
    }

    document.addEventListener('DOMContentLoaded', function() {
      const hash = window.location.hash;
      if (hash === '#tab=count') {
        setTimeout(() => switchInvTab('count'), 100);
      } else if (hash === '#tab=zone') {
        setTimeout(() => switchInvTab('zone'), 100);
      } else if (hash === '#tab=tx') {
        setTimeout(() => switchInvTab('tx'), 100);
      } else if (hash === '#tab=valuation') {
        setTimeout(() => switchInvTab('valuation'), 100);
      }
    });
  `;

  const combinedScript = UOM_JS + '\n' + INVENTORY_TX_LABELS_JS + '\n' + tabScript + '\n' + inventoryScript + '\n' + inventoryCountScript + '\n' + inventoryDashboardScript + '\n' + inventoryTxScript + '\n' + inventoryValuationScript;

  return renderPage(c, {
    title: '재고 관리',
    activePage: '/inventory',
    pageContent: `
            <!-- Tab Navigation -->
            <div class="flex border-b mb-6 ds-card" style="border-radius:var(--radius) var(--radius) 0 0">
              <button onclick="switchInvTab('stock')" id="tabStock" class="inv-tab px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600 hover:text-blue-700">
                <i class="fas fa-boxes mr-2"></i>재고 현황
              </button>
              <button onclick="switchInvTab('count')" id="tabCount" class="inv-tab px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-list-check mr-2"></i>재고실사
              </button>
              <button onclick="switchInvTab('zone')" id="tabZone" class="inv-tab px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-warehouse mr-2"></i>창고별
              </button>
              <button onclick="switchInvTab('tx')" id="tabTx" class="inv-tab px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-right-left mr-2"></i>증감내역
              </button>
              <button onclick="switchInvTab('valuation')" id="tabValuation" class="inv-tab px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-coins mr-2"></i>재고자산 평가
              </button>
            </div>

            <!-- Stock Tab Content -->
            <div id="stockTabContent" class="block">
            <!-- Statistics Section -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
                <div class="ds-card p-6">
                    <div class="flex items-center justify-between mb-2">
                        <div class="text-sm text-gray-600">부족 품목</div>
                        <i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
                    </div>
                    <div class="text-3xl font-bold text-red-600" id="lowStockItems">-</div>
                    <div class="text-xs text-gray-500 mt-1">안전 재고 미달</div>
                </div>
                <div class="ds-card p-6">
                    <div class="flex items-center justify-between mb-2">
                        <div class="text-sm text-gray-600">최근 로스율</div>
                        <i class="fas fa-chart-line text-amber-500 text-2xl"></i>
                    </div>
                    <div class="text-3xl font-bold text-amber-600" id="lossRate">-</div>
                    <div class="text-xs text-gray-500 mt-1">실사 vs 이론 재고 차이</div>
                </div>
                <div class="ds-card p-6">
                    <div class="flex items-center justify-between mb-2">
                        <div class="text-sm text-gray-600">마지막 실사</div>
                        <i class="fas fa-clipboard-check text-blue-500 text-2xl"></i>
                    </div>
                    <div class="text-3xl font-bold text-gray-700" id="lastCountDate">-</div>
                    <div class="text-xs text-gray-500 mt-1">최근 재고 실사일</div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="ds-card p-4 mb-6">
                <div class="flex gap-4 flex-wrap">
                    <button id="adjustmentBtn" class="ds-btn ds-btn-primary">
                        <i class="fas fa-adjust mr-2"></i>재고 조정
                    </button>
                    <button id="bulkAssignBtn" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700" data-admin-only>
                        <i class="fas fa-warehouse mr-2"></i>기본창고 일괄배정
                    </button>
                    <button id="refreshBtn" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                        <i class="fas fa-sync-alt mr-2"></i>새로고침
                    </button>
                </div>
            </div>

            <!-- Filters -->
            <div class="ds-filter-bar">
                <div class="ds-filter-field" style="min-width:140px">
                  <label class="ds-label">카테고리</label>
                  <select id="categoryFilter" class="ds-input" onchange="currentPage=1;loadInventory();">
                    <option value="">전체</option>
                  </select>
                </div>
                <div class="ds-filter-field" style="flex:1;min-width:180px">
                  <label class="ds-label">검색</label>
                  <input type="text" id="searchInput" placeholder="품목명 검색" class="ds-input"
                    onkeydown="if(event.key==='Enter'){currentPage=1;loadInventory();}">
                </div>
                <div class="ds-filter-field" style="min-width:120px">
                  <label class="ds-label">재고 상태</label>
                  <select id="stockFilter" class="ds-input" onchange="currentPage=1;loadInventory();">
                    <option value="">전체</option>
                    <option value="low">재고 부족</option>
                  </select>
                </div>
                <div class="ds-filter-actions">
                  <button id="searchBtn" class="ds-btn ds-btn-primary ds-btn-sm">
                    <i class="fas fa-search" style="margin-right:4px"></i>검색
                  </button>
                </div>
            </div>

            <!-- Inventory Table -->
            <div class="ds-card p-6">
                <h2 class="text-xl font-bold mb-4">
                    <i class="fas fa-list text-blue-600 mr-2"></i>재고 현황
                </h2>
                <div id="invFilterChips" class="ds-conds mb-2"></div>
                <div id="invListToolbar"></div>
                <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                    <table class="w-full text-sm ds-table ds-table-striped inv-tbl">
                        <thead class="bg-gray-50">
                            <tr>
                                <!-- data-col = '열 선택'(dsListToolbar) 대상. 액션 열은 제외 -->
                                <th class="col-name px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-col="item_name">품목명</th>
                                <th class="col-tag px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-col="category">카테고리</th>
                                <th class="col-qty px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" data-col="stock">현재고</th>
                                <th class="col-qty px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" data-col="safety">안전재고</th>
                                <th class="col-qty px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" data-col="reorder">재주문점</th>
                                <th class="col-amount px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" data-col="unit_price">단가</th>
                                <th class="col-tag px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" data-col="zone">보관위치</th>
                                <th class="col-action px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">액션</th>
                            </tr>
                        </thead>
                        <tbody id="inventoryTableBody" class="bg-white divide-y divide-gray-100">
                        </tbody>
                    </table>
                </div>

                <div id="invSummaryBar" class="ds-summary"></div>

                <!-- Pagination -->
                <div class="mt-4 flex justify-between items-center">
                    <div class="text-sm text-gray-700">
                        총 <span id="totalCount">0</span>개 품목
                    </div>
                    <div class="flex gap-2">
                        <button id="prevPage" class="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50" disabled>이전</button>
                        <span class="px-4 py-1 text-sm">
                            페이지 <span id="currentPage">1</span> / <span id="totalPages">1</span>
                        </span>
                        <button id="nextPage" class="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50" disabled>다음</button>
                    </div>
                </div>
            </div>
            </div>

            <!-- Count Tab Content -->
            <div id="countTabContent" class="hidden">
            <div class="space-y-4">

              <!-- 상단 요약 카드 -->
              <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-list-check" style="color:var(--c-primary);margin-right:4px"></i>총 실사 횟수</div>
                  <div class="value" style="color:var(--c-primary)" id="totalCounts">-</div>
                </div>
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-hourglass-half" style="color:var(--c-warning);margin-right:4px"></i>진행중</div>
                  <div class="value" style="color:var(--c-warning)" id="inProgressCounts">-</div>
                </div>
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-calendar" style="color:var(--c-success);margin-right:4px"></i>최근 실사일</div>
                  <div class="value" style="color:var(--c-success);font-size:16px" id="countTabLastCountDate">-</div>
                </div>
              </div>

              <!-- 필터 바 -->
              <div class="ds-card ds-card-compact flex flex-wrap gap-2 items-center">
                <select id="fStatus" class="ds-input" style="width:auto">
                  <option value="">전체 상태</option>
                  <option value="DRAFT">작성중</option>
                  <option value="SUBMITTED">제출됨</option>
                  <option value="APPROVED">승인됨</option>
                </select>
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer" title="구역 담당자가 나로 지정된 실사만 봅니다. 담당 미지정 구역과 전수 실사는 관리자에게만 보입니다.">
                  <input type="checkbox" id="fMineOnly" onchange="loadCounts()" style="width:15px;height:15px;cursor:pointer">
                  내 담당만
                </label>
                <div class="ml-auto flex gap-2">
                  <button onclick="loadCounts()" class="ds-btn ds-btn-ghost ds-btn-sm">
                    <i class="fas fa-sync-alt" style="margin-right:4px"></i>새로고침
                  </button>
                  <button onclick="createNewCount()" class="ds-btn ds-btn-primary ds-btn-sm">
                    <i class="fas fa-plus" style="margin-right:4px"></i>새 실사 시작
                  </button>
                </div>
              </div>

              <!-- 실사 목록 테이블 -->
              <div class="ds-card" style="padding:0;overflow:hidden;">
                <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
                  <h2 class="ds-card-title">
                    <i class="fas fa-list" style="color:var(--c-primary);margin-right:8px"></i>실사 목록
                  </h2>
                </div>
                <div class="ds-table-wrap" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                  <table id="countTable" class="ds-table ds-table-compact ds-table-striped">
                    <thead>
                      <tr>
                        <th class="col-name">번호</th>
                        <th class="col-date" style="text-align:center;">날짜</th>
                        <th class="col-tag" style="text-align:center;">유형</th>
                        <th class="col-status" style="text-align:center;">상태</th>
                        <th class="col-qty" style="text-align:center;">항목수</th>
                        <th class="col-tag" style="text-align:center;">제출자</th>
                        <th class="col-action" style="text-align:center;">작업</th>
                      </tr>
                    </thead>
                    <tbody id="countBody">
                      <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--c-text-muted);"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- 소모량 (#618) — /api/inventory-counts/consumption. 실사는 「얼마 남았나」만 답하고
                   판단에 필요한 건 「얼마를 썼나」다. 눌러야 부른다(회차 전체를 훑는 집계).
                   ★이 수치는 추정이다 — API 가 주는 flags(구역 귀속·발주일 기준·건너뛴 구간)를
                     표 위에 그대로 세운다. 숫자만 띄우면 실측으로 읽힌다. -->
              <div class="ds-card overflow-hidden">
                <div class="p-4 flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-bold"><i class="fas fa-fire-flame-simple text-orange-500 mr-2"></i>소모량
                    <span class="text-xs font-normal text-gray-400 ml-1">(기초 + 매입 − 기말 · 추정)</span></h3>
                  <select id="consZone" class="ds-input" style="width:auto"><option value="">전 구역</option></select>
                  <input type="date" id="consFrom" class="ds-input" style="width:auto">
                  <span class="text-gray-400">~</span>
                  <input type="date" id="consTo" class="ds-input" style="width:auto">
                  <button class="ds-btn ds-btn-sm" type="button" onclick="loadConsumption()">조회</button>
                </div>
                <div class="px-4 pb-2 text-xs text-gray-500 hidden" id="consFlags"></div>
                <div class="ds-table-wrap" style="max-height:420px; overflow-y:auto;">
                  <table class="w-full text-sm ds-table ds-table-striped ds-table-compact">
                    <thead class="bg-gray-50">
                      <tr>
                        <th class="col-code px-4 py-3 text-left">품목코드</th>
                        <th class="col-name px-4 py-3 text-left">품목명</th>
                        <th class="col-qty px-3 py-3 text-right">소모량</th>
                        <th class="col-qty px-3 py-3 text-right">매입량</th>
                        <th class="col-amount px-4 py-3 text-right">소모 금액</th>
                      </tr>
                    </thead>
                    <tbody id="consBody"><tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">조회를 누르면 계산합니다</td></tr></tbody>
                  </table>
                </div>
              </div>

            </div>
            </div><!-- /countTabContent — 이 닫는 태그가 없으면 zoneTabContent·detailPanel 이 실사 탭 안에
                       중첩돼 '창고별' 탭이 부모 display:none 에 먹혀 통째로 안 보인다 (2026-08-26 수정) -->

            <!-- 재고자산 평가 Tab Content (#619) — /api/inventory-valuation/* 의 화면.
                 총계 옆에 음수재고·무원가 품목 수를 같이 세운다: 이 수치는 그것들을 안고 있어서
                 총계만 크게 띄우면 「깔끔한 오답」이 된다. -->
            <div id="valuationTabContent" class="hidden">
              <div class="space-y-4">

                <div class="ds-card p-4 flex flex-wrap items-center gap-3">
                  <label class="text-sm text-gray-600">평가 방법</label>
                  <select id="ivMethod" class="ds-input" style="width:auto">
                    <option value="WEIGHTED_AVG">이동평균</option>
                    <option value="FIFO">선입선출(FIFO)</option>
                    <option value="STANDARD">표준원가</option>
                  </select>
                  <button id="ivMethodSave" class="ds-btn ds-btn-primary hidden" type="button">저장</button>
                  <span class="text-xs text-gray-400">방법을 바꾸면 평가액 산식 자체가 바뀝니다 (변경은 관리자만)</span>
                </div>

                <div class="ds-card p-6">
                  <div class="text-sm text-gray-600 mb-1">재고자산 평가액</div>
                  <div class="text-3xl font-bold" id="ivTotal">-</div>
                  <div class="text-xs mt-2 flex flex-wrap gap-1 items-center" id="ivMeta"></div>
                  <div class="text-xs mt-2 p-2 rounded bg-amber-50 text-amber-800 hidden" id="ivNote"></div>
                </div>

                <div class="ds-card overflow-hidden">
                  <div class="ds-table-wrap" style="max-height: calc(100vh - 380px); overflow-y: auto;">
                    <table class="w-full text-sm ds-table ds-table-striped ds-table-compact">
                      <thead class="bg-gray-50">
                        <tr>
                          <th class="col-code px-4 py-3 text-left">품목코드</th>
                          <th class="col-name px-4 py-3 text-left">품목명</th>
                          <th class="col-tag px-3 py-3 text-left">단위</th>
                          <th class="col-qty px-3 py-3 text-right">현재고</th>
                          <th class="col-amount px-3 py-3 text-right">단가</th>
                          <th class="col-amount px-4 py-3 text-right">평가액</th>
                        </tr>
                      </thead>
                      <tbody id="ivBody"></tbody>
                    </table>
                  </div>
                </div>

                <!-- 법인 간 단가 차이 — 눌러야 부른다(전 법인 수불 집계) -->
                <div class="ds-card overflow-hidden">
                  <div class="p-4 flex flex-wrap items-center gap-3">
                    <h3 class="text-base font-bold"><i class="fas fa-scale-unbalanced text-amber-500 mr-2"></i>법인 간 단가 차이</h3>
                    <input type="number" id="ivAlertThreshold" class="ds-input" style="width:90px" value="20" min="1" step="1">
                    <span class="text-sm text-gray-500">% 이상</span>
                    <button class="ds-btn" type="button" onclick="invValLoadAlerts()">조회</button>
                  </div>
                  <table class="w-full text-sm ds-table ds-table-striped ds-table-compact">
                    <thead class="bg-gray-50">
                      <tr>
                        <th class="col-name px-4 py-3 text-left">품목</th>
                        <th class="col-qty px-3 py-3 text-right">최대 차이</th>
                        <th class="col-name px-4 py-3 text-left">법인별 평균 매입단가</th>
                      </tr>
                    </thead>
                    <tbody id="ivAlertBody"><tr><td colspan="3" class="px-4 py-6 text-center text-gray-400">조회를 누르면 계산합니다</td></tr></tbody>
                  </table>
                </div>

              </div>
            </div>

            <!-- 창고별 재고 Tab Content (2026-07-16: /inventory-dashboard 흡수) -->
            <div id="zoneTabContent" class="hidden">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h2 class="text-xl font-bold text-gray-900"><i class="fas fa-warehouse text-blue-600 mr-2"></i>창고별 재고 현황</h2>
                  <p class="text-sm text-gray-500 mt-1">법인·창고별 자재 현황 및 부족 품목 일괄 발주</p>
                </div>
                <button onclick="loadDashboard()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">
                  <i class="fas fa-sync-alt mr-1"></i>새로고침
                </button>
              </div>
              <div id="dashContent"></div>
            </div>

            <!-- 상세 패널 (우측 슬라이드) -->
            <div id="detailPanel" class="hidden" style="position:fixed;right:0;top:0;height:100vh;width:500px;background:var(--c-surface);box-shadow:-4px 0 24px rgba(0,0,0,.12);z-index:60;overflow-y:auto;display:none;">
              <div style="padding:20px;">

                <!-- 패널 헤더 -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                  <div>
                    <h3 id="panelCountNumber" style="font-size:18px;font-weight:700;color:var(--c-text);"></h3>
                    <div id="panelCountDate" style="font-size:12px;color:var(--c-text-muted);margin-top:2px;"></div>
                  </div>
                  <button onclick="closeDetailPanel()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--c-text-muted);padding:4px;" title="닫기">
                    <i class="fas fa-times"></i>
                  </button>
                </div>

                <!-- 상태 뱃지 + 진행률 -->
                <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
                  <span id="panelStatusBadge" style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600;"></span>
                  <span id="panelProgress"></span>
                </div>

                <!-- P3: 구역 실사 — 구역명 -->
                <div id="panelZoneInfo" style="margin-bottom:12px;"></div>

                <!-- P3: 구역 실사 — 미배정 품목 배정 -->
                <div id="panelUnassigned" style="margin-bottom:16px;"></div>

                <!-- 항목 목록 -->
                <div style="margin-bottom:20px;">
                  <h4 style="font-size:13px;font-weight:600;color:var(--c-text);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--c-border-light);">
                    <i class="fas fa-boxes" style="margin-right:6px"></i>품목 실사 현황
                  </h4>
                  <!-- 실사 UX 다①: 품목 검색·필터 / 다②: 차이 요약 -->
                  <div style="display:flex;gap:6px;margin-bottom:8px;">
                    <input type="text" id="panelItemSearch" placeholder="품목명·코드 검색" oninput="icApplyFilter()" style="flex:1;min-width:0;padding:6px 8px;border:1px solid var(--c-border);border-radius:6px;font-size:12px;">
                    <!-- 「재고 있는 것만」이 구역 실사의 기본값이다 — UV실은 16줄 중 15줄이 0 이라
                         담당자가 의미 있는 1줄을 보려고 16줄을 넘겼다(2026-09-04 실측). -->
                    <select id="panelItemFilter" onchange="icApplyFilter()" style="padding:6px 8px;border:1px solid var(--c-border);border-radius:6px;font-size:12px;">
                      <option value="nonzero">재고 있는 것만</option>
                      <option value="all">전체</option>
                      <option value="unfilled">미입력만</option>
                      <option value="diff">차이만</option>
                      <option value="changed">재고변동만</option>
                    </select>
                    <button id="panelAddItemBtn" onclick="icOpenCandidates()" style="padding:6px 10px;border:1px solid var(--c-border);border-radius:6px;font-size:12px;background:var(--c-surface);white-space:nowrap;">
                      <i class="fas fa-plus mr-1"></i>품목 추가
                    </button>
                  </div>
                  <div id="panelDiffSummary" style="margin-bottom:8px;"></div>
                  <!-- 0 인 줄을 접었을 때 그 사실을 알려 주는 자리 (숨기면 「없는 품목」으로 읽힌다) -->
                  <div id="panelZeroHint" style="margin-bottom:8px;"></div>
                  <div id="panelItems" style="max-height:400px;overflow-y:auto;"></div>
                </div>

                <!-- 액션 버튼 -->
                <div id="panelActions" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;padding-top:12px;border-top:1px solid var(--c-border-light);">
                </div>

              </div>
            </div>
            </div>

            <!-- 증감내역 Tab Content (2026-08-30: 전 품목 inventory_transactions) -->
            <div id="txTabContent" class="hidden">
              <!-- Filters -->
              <div class="ds-filter-bar">
                <div class="ds-filter-field" style="min-width:130px">
                  <label class="ds-label">시작일</label>
                  <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-08-01" id="invTxDateFrom" class="js-fp ds-input">
                </div>
                <div class="ds-filter-field" style="min-width:130px">
                  <label class="ds-label">종료일</label>
                  <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-08-31" id="invTxDateTo" class="js-fp ds-input">
                </div>
                <div class="ds-filter-field" style="min-width:110px">
                  <label class="ds-label">유형</label>
                  <select id="invTxType" class="ds-input" onchange="invTxSearch()">
                    <option value="">전체</option>
                    <option value="IN">입고</option>
                    <option value="OUT">출고</option>
                    <option value="ADJUST">조정</option>
                    <option value="TRANSFER_IN">이동입고</option>
                    <option value="TRANSFER_OUT">이동출고</option>
                  </select>
                </div>
                <div class="ds-filter-field" style="min-width:130px">
                  <label class="ds-label">분류</label>
                  <select id="invTxCategory" class="ds-input" onchange="invTxSearch()">
                    <option value="">전체</option>
                  </select>
                </div>
                <div class="ds-filter-field" style="min-width:130px">
                  <label class="ds-label">창고</label>
                  <select id="invTxZone" class="ds-input" onchange="invTxSearch()">
                    <option value="">전체</option>
                    <option value="none">기본창고(미배정)</option>
                  </select>
                </div>
                <div class="ds-filter-field" style="min-width:130px">
                  <label class="ds-label">참조</label>
                  <select id="invTxRefType" class="ds-input" onchange="invTxSearch()">
                    <option value="">전체</option>
                    <option value="PURCHASE">발주입고</option>
                    <option value="RECEIPT_CANCEL">입고취소</option>
                    <option value="ORDER">주문출고</option>
                    <option value="RETURN">반품</option>
                    <option value="TRANSFER">창고이동</option>
                    <option value="ADJUSTMENT">재고조정</option>
                    <option value="STOCK_COUNT">재고실사</option>
                    <option value="SCAN">스캔</option>
                    <option value="AUTO_DEDUCT">인쇄 자동차감</option>
                    <option value="PP_DEDUCT">후가공 자동차감</option>
                  </select>
                </div>
                <div class="ds-filter-field" style="flex:1;min-width:160px">
                  <label class="ds-label">검색</label>
                  <input type="text" id="invTxSearch" placeholder="품목명 / 품목코드" class="ds-input">
                </div>
                <div class="ds-filter-actions">
                  <button onclick="invTxSearch()" class="ds-btn ds-btn-primary ds-btn-sm">
                    <i class="fas fa-search" style="margin-right:4px"></i>조회
                  </button>
                  <button onclick="invTxReset()" class="ds-btn ds-btn-sm">
                    <i class="fas fa-rotate-left" style="margin-right:4px"></i>초기화
                  </button>
                  <button onclick="invTxExport()" class="ds-btn ds-btn-sm">
                    <i class="fas fa-file-csv" style="margin-right:4px"></i>CSV
                  </button>
                </div>
              </div>
              <!-- 품목 단일 필터(재고 현황 탭 '이력' 버튼에서 전달). hidden = 화면엔 칩으로만 노출 -->
              <input type="hidden" id="invTxItemId" value="">

              <div class="ds-card p-6">
                <div class="flex justify-between items-center mb-4">
                  <h2 class="text-xl font-bold">
                    <i class="fas fa-right-left text-blue-600 mr-2"></i>증감내역
                  </h2>
                  <span id="invTxItemName" class="text-sm text-blue-600 font-medium"></span>
                </div>
                <div id="invTxSummary" class="flex flex-wrap items-center gap-2 mb-3"></div>
                <div class="overflow-x-auto" style="max-height: calc(100vh - 320px); overflow-y: auto;">
                  <table class="w-full text-sm ds-table ds-table-striped">
                    <thead class="bg-gray-50">
                      <tr>
                        <th class="col-datetime px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">일시</th>
                        <th class="col-name px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">품목</th>
                        <th class="col-tag px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">분류</th>
                        <th class="col-tag px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">유형</th>
                        <th class="col-amount px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">증감</th>
                        <th class="col-amount px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase" title="해당 창고 기준 잔량">잔량</th>
                        <th class="col-tag px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">창고</th>
                        <th class="col-date px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">참조</th>
                        <th class="col-name px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유·비고</th>
                        <th class="col-tag px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">처리자</th>
                      </tr>
                    </thead>
                    <tbody id="invTxTableBody" class="bg-white divide-y divide-gray-100"></tbody>
                  </table>
                </div>

                <!-- Pagination -->
                <div class="mt-4 flex justify-between items-center">
                  <div class="text-sm text-gray-700">총 <span id="invTxTotalCount">0</span>건</div>
                  <div class="flex gap-2">
                    <button id="invTxPrevPage" class="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50" disabled>이전</button>
                    <span class="px-4 py-1 text-sm">
                      페이지 <span id="invTxCurrentPage">1</span> / <span id="invTxTotalPages">1</span>
                    </span>
                    <button id="invTxNextPage" class="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50" disabled>다음</button>
                  </div>
                </div>
              </div>
            </div><!-- /txTabContent -->

            <!-- 모든 모달들 (탭 콘텐츠 밖) -->
            <!-- Transaction History Modal -->
            <div id="transactionModal" class="ds-modal-overlay hidden">
                <div class="ds-modal p-6 max-h-[80vh] overflow-y-auto" style="max-width:56rem">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold">
                            <i class="fas fa-history text-gray-500 mr-2"></i>
                            거래 이력 - <span id="modalItemName"></span>
                        </h3>
                        <div class="flex items-center gap-3">
                            <!-- 모달은 최근 50건만 보여준다 — 전건·기간 조회는 증감내역 탭으로 -->
                            <button onclick="invTxOpenForItem()" class="ds-btn ds-btn-sm" title="이 품목의 전체 증감내역을 기간 제한 없이 조회">
                                <i class="fas fa-right-left mr-1"></i>전체 내역
                            </button>
                            <button id="closeModal" class="text-gray-500 hover:text-gray-700">
                                <i class="fas fa-times text-2xl"></i>
                            </button>
                        </div>
                    </div>
                    <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                        <table class="w-full text-sm ds-table ds-table-striped">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="col-datetime px-4 py-2 text-left text-xs font-medium text-gray-500">일시</th>
                                    <th class="col-tag px-4 py-2 text-left text-xs font-medium text-gray-500">유형</th>
                                    <th class="col-qty px-4 py-2 text-right text-xs font-medium text-gray-500">수량</th>
                                    <th class="col-qty px-4 py-2 text-right text-xs font-medium text-gray-500">잔액</th>
                                    <th class="col-name px-4 py-2 text-left text-xs font-medium text-gray-500">사유</th>
                                    <th class="col-tag px-4 py-2 text-left text-xs font-medium text-gray-500">처리자</th>
                                </tr>
                            </thead>
                            <tbody id="transactionTableBody" class="bg-white divide-y divide-gray-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Receipt/Release 모달 제거됨 — 입고는 /receiving 페이지에서 처리 -->

            <!-- Adjustment Modal (재고 조정) -->
            <div id="adjustmentModal" class="ds-modal-overlay hidden">
                <div class="ds-modal p-6" style="max-width:42rem">
                    <h3 class="text-xl font-bold mb-4"><i class="fas fa-adjust text-blue-600 mr-2"></i>재고 조정</h3>
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">품목 선택</label>
                                <div class="flex gap-2">
                                  <select id="adjustItem" class="w-full px-3 py-2 border rounded">
                                      <option value="">품목 선택...</option>
                                  </select>
                                  <button type="button" id="adjustItemSearchBtn" class="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm" title="전체 품목에서 검색">
                                    <i class="fas fa-search"></i>
                                  </button>
                                </div>
                                <!-- 드롭다운에는 목록에 그려진 페이지분만 담긴다 — 나머지는 검색으로 -->
                                <div class="text-xs text-gray-400 mt-1">목록에 없는 품목은 <i class="fas fa-search"></i> 로 찾으세요</div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">조정일</label>
                                <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="adjustDate" class="js-fp w-full px-3 py-2 border rounded">
                            </div>
                        </div>
                        <div class="text-sm text-gray-600">현재고: <span id="adjustCurrentStock" class="font-bold">-</span></div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">조정 수량 (+/-)</label>
                                <div class="flex gap-2">
                                    <input type="number" id="adjustQuantity" class="w-full px-3 py-2 border rounded" step="0.01" placeholder="+10 또는 -5">
                                    <select id="adjustUnit" class="px-2 py-2 border rounded text-sm" style="min-width:5rem" title="입력 단위"></select>
                                </div>
                                <div id="adjustConvertHint" class="text-xs text-blue-600 mt-1"></div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">사유</label>
                                <select id="adjustReason" class="w-full px-3 py-2 border rounded">
                                    <option value="">선택...</option>
                                    <option value="COUNT_ERROR">실사 차이</option>
                                    <option value="DAMAGE">파손/불량</option>
                                    <option value="LOSS">분실</option>
                                    <option value="FOUND">추가 발견</option>
                                    <option value="OTHER">기타</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">비고</label>
                            <textarea id="adjustNotes" rows="2" class="w-full px-3 py-2 border rounded"></textarea>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end gap-2">
                        <button id="cancelAdjust" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">취소</button>
                        <button id="submitAdjust" class="ds-btn ds-btn-primary">조정 등록</button>
                    </div>
                </div>
            </div>

            <!-- Settings Modal (안전재고/ROP 설정) -->
            <div id="settingsModal" class="ds-modal-overlay hidden">
                <div class="ds-modal p-6" style="max-width:28rem">
                    <h3 class="text-xl font-bold mb-4">
                        <i class="fas fa-cog text-gray-600 mr-2"></i>
                        재고 설정 - <span id="settingsItemName"></span>
                    </h3>
                    <input type="hidden" id="settingsItemId">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">현재고</label>
                            <div class="px-3 py-2 bg-gray-100 rounded text-sm font-medium" id="settingsCurrentStock">-</div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">안전재고</label>
                            <input type="number" id="settingsSafeStock" class="w-full px-3 py-2 border rounded" min="0" step="0.01">
                            <div class="text-xs text-gray-500 mt-1">이 수량 이하이면 부족 경고 표시</div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">재주문점 (ROP)</label>
                            <input type="number" id="settingsReorderPoint" class="w-full px-3 py-2 border rounded" min="0" step="0.01">
                            <div class="text-xs text-gray-500 mt-1">이 수량 이하이면 발주 검토 필요</div>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end gap-2">
                        <button id="cancelSettings" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">취소</button>
                        <button id="submitSettings" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
                    </div>
                </div>
            </div>

            <!-- 기본창고 일괄배정 (운영설계 B) -->
            <div id="bulkAssignModal" class="ds-modal-overlay hidden">
                <div class="ds-modal p-6" style="max-width:30rem">
                    <h3 class="text-xl font-bold mb-4"><i class="fas fa-warehouse text-gray-600 mr-2"></i>기본창고 일괄배정</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">대상 창고</label>
                            <select id="bulkAssignZone" class="w-full px-3 py-2 border rounded">
                                <option value="">미배정으로 환원</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">카테고리 (선택)</label>
                            <select id="bulkAssignCategory" class="w-full px-3 py-2 border rounded">
                                <option value="">전체</option>
                                <option value="원자재">원자재</option>
                                <option value="태극기">태극기</option>
                                <option value="상품">상품</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">이름 포함 (선택)</label>
                            <input type="text" id="bulkAssignName" class="w-full px-3 py-2 border rounded" placeholder="예: 전사잉크 (전사% 일괄배정 시)">
                        </div>
                        <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="bulkAssignUnassignedOnly"> 미배정 품목만 대상</label>
                        <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="bulkAssignMoveStock" checked> 기존 미배정 재고를 이 창고로 이동</label>
                        <div class="text-xs text-gray-500">카테고리·이름 중 1개 이상 지정. 매입/재고 품목만 적용. (예: 전사잉크→전사 창고)</div>
                        <div id="bulkAssignPreview" class="text-xs font-medium text-blue-700 hidden"></div>
                    </div>
                    <div class="mt-6 flex justify-end gap-2">
                        <button id="cancelBulkAssign" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">취소</button>
                        <button id="previewBulkAssign" class="px-4 py-2 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">미리보기</button>
                        <button id="submitBulkAssign" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">적용</button>
                    </div>
                </div>
            </div>

            <!-- 구역 실사: 품목 추가 (2026-09-04) — 「이 구역에 있는데 목록에 없어요」를 그 자리에서 푼다.
                 ⚠️ display 는 **클래스로만** 다룬다 — 인라인 style 이 .hidden 을 이겨 항상 보이게 된다. -->
            <div id="icCandModal" class="ds-modal-overlay hidden flex items-center justify-center">
              <div class="ds-card" style="width:min(760px,94vw);padding:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                  <h3 style="font-size:16px;font-weight:700;">이 구역에 품목 추가</h3>
                  <button onclick="icCloseCandidates()" style="border:0;background:transparent;font-size:20px;line-height:1;color:#9ca3af;cursor:pointer;">&times;</button>
                </div>
                <input type="text" id="icCandSearch" placeholder="품목명 · 코드 · 검색어" oninput="icCandSearchInput()"
                       style="width:100%;padding:7px 10px;border:1px solid var(--c-border);border-radius:6px;font-size:13px;margin-bottom:10px;">
                <div id="icCandBody"></div>
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
                  <button onclick="icCloseCandidates()" class="ds-btn ds-btn-sm">취소</button>
                  <button id="icCandApply" onclick="icCandApply()" class="ds-btn ds-btn-primary ds-btn-sm">추가</button>
                </div>
              </div>
            </div>

            <!-- 창고별 재고 + 창고 간 이동 (UP3-B1) -->
            <div id="zoneStockModal" class="ds-modal-overlay hidden">
                <div class="ds-modal p-6" style="max-width:40rem">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold">
                            <i class="fas fa-warehouse text-blue-600 mr-2"></i>창고별 재고 - <span id="zoneStockItemName"></span>
                        </h3>
                        <button onclick="document.getElementById('zoneStockModal').classList.add('hidden')" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times text-2xl"></i>
                        </button>
                    </div>
                    <input type="hidden" id="zoneStockItemId">

                    <!-- 창고별 분해 (read) -->
                    <div class="overflow-x-auto mb-5">
                        <table class="w-full text-sm ds-table ds-table-striped">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">창고</th>
                                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">수량</th>
                                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">안전재고</th>
                                </tr>
                            </thead>
                            <tbody id="zoneStockBody" class="bg-white divide-y divide-gray-100"></tbody>
                        </table>
                    </div>

                    <!-- 창고 간 이동 (transfer) -->
                    <div class="border-t pt-4">
                        <h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-right-left text-gray-500 mr-2"></i>창고 간 이동</h4>
                        <div class="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">출발 창고</label>
                                <select id="transferFrom" class="w-full px-3 py-2 border rounded text-sm"></select>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">도착 창고</label>
                                <select id="transferTo" class="w-full px-3 py-2 border rounded text-sm"></select>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">수량</label>
                                <div class="flex gap-2">
                                    <input type="number" id="transferQty" class="w-full px-3 py-2 border rounded text-sm" min="0" step="0.01" placeholder="이동 수량">
                                    <select id="transferUnit" class="px-2 py-2 border rounded text-sm" style="min-width:4.5rem" title="입력 단위"></select>
                                </div>
                                <div id="transferConvertHint" class="text-xs text-blue-600 mt-1"></div>
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-600 mb-1">비고 (선택)</label>
                                <input type="text" id="transferNotes" class="w-full px-3 py-2 border rounded text-sm">
                            </div>
                        </div>
                        <div class="flex justify-end">
                            <button onclick="submitInvTransfer()" class="ds-btn ds-btn-primary"><i class="fas fa-right-left mr-2"></i>이동 실행</button>
                        </div>
                    </div>
                </div>
    `,
    pageScript: combinedScript
  })
}
