import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/equipment.js?raw'
import dashboardScript from '../scripts/equipmentDashboard.js?raw'
import queueScript from '../scripts/equipment/queue.js?raw'
import maintenanceScript from '../scripts/maintenance.js?raw'
import { maintenanceContent } from './maintenance'

export function equipmentPage(c: Context<HonoEnv>) {
  // 사이드바 통합(2026-07-18): 정비(maintenance) 흡수. __maintDefer로 auto-init 차단 → 정비 탭 첫 진입 시 __maintInit(멱등).
  // 정비 탭은 ADMIN/MANAGER 게이팅(기본 hidden → 관리자만 노출). maintenance.js는 완전 IIFE라 전역/ID 충돌 0.
  const maintGateScript = `
    (function(){
      var __r=''; try{ __r=(JSON.parse(localStorage.getItem('user')||'{}').role)||''; }catch(e){}
      if(__r==='ADMIN' || __r==='MANAGER'){ var b=document.getElementById('tabMaintenance'); if(b) b.classList.remove('hidden'); }
    })();
  `
  const combinedScript = 'window.__maintDefer = true;\n;\n' + pageScript + '\n\n' + dashboardScript + '\n\n' + queueScript + '\n;\n' + maintenanceScript + '\n;\n' + maintGateScript

  return renderPage(c, {
    title: '장비 관리',
    activePage: '/equipment',
    pageCSS: `
      .summary-card { border: 1px solid var(--c-border); }
      .summary-card .label { font-size: var(--fs-xs); color: var(--c-text-secondary); margin-bottom: 4px; }
      .summary-card .value { font-size: 20px; font-weight: 700; }
      .summary-card .subtext { font-size: var(--fs-xs); color: var(--c-text-secondary); margin-top: 4px; }

      .filter-bar select, .filter-bar button { font-size: var(--fs-sm); }

      .utilization-bar {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }
      .utilization-bar-fill {
        flex: 1;
        height: 24px;
        border-radius: 4px;
        position: relative;
        overflow: hidden;
      }
      .utilization-bar-label {
        font-size: 12px;
        font-weight: 600;
        min-width: 40px;
        text-align: right;
      }

      .trend-bar {
        display: inline-block;
        height: 20px;
        border-radius: 2px;
        background: var(--c-border);
        min-width: 4px;
      }

      .status-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      }
      .status-badge.online {
        background: var(--c-success-light);
        color: var(--c-success);
      }
      .status-badge.offline {
        background: var(--c-danger-light);
        color: var(--c-danger);
      }
    `,
    pageContent: `
        <div class="container mx-auto px-4 py-6">
            <!-- 탭 네비게이션 -->
            <div class="flex items-center justify-between mb-4">
                <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button onclick="eqSwitchTab('list')" id="tabList" class="tab-btn px-4 py-2 rounded-md text-sm font-medium bg-white shadow text-gray-800">
                        <i class="fas fa-list mr-1"></i>목록
                    </button>
                    <button onclick="eqSwitchTab('layout')" id="tabLayout" class="tab-btn px-4 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-map mr-1"></i>배치도
                    </button>
                    <button onclick="eqSwitchTab('dashboard')" id="tabDashboard" class="tab-btn px-4 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-chart-bar mr-1"></i>현황
                    </button>
                    <button onclick="eqSwitchTab('queue')" id="tabQueue" class="tab-btn px-4 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700">
                        <i class="fas fa-layer-group mr-1"></i>큐/부하
                    </button>
                    <button onclick="eqSwitchTab('maintenance')" id="tabMaintenance" class="tab-btn px-4 py-2 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700 hidden">
                        <i class="fas fa-wrench mr-1"></i>정비
                    </button>
                </div>
                <button onclick="openAddModal()" class="ds-btn ds-btn-primary ds-btn-sm">
                    <i class="fas fa-plus mr-2"></i>장비 추가
                </button>
            </div>

            <!-- 목록 탭 -->
            <div id="panelList">
                <div class="ds-card overflow-x-auto">
                    <table class="w-full text-sm hover-actions ds-table ds-table-striped">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="col-code px-4 py-3 text-left">ID</th>
                                <th class="col-name px-4 py-3 text-left">이름</th>
                                <th class="col-flex px-4 py-3 text-left">프린터명</th>
                                <th class="col-status px-4 py-3 text-center">상태</th>
                                <th class="col-tag px-4 py-3 text-center">에이전트</th>
                                <th class="col-qty px-4 py-3 text-center">헤드</th>
                                <th class="col-tag px-4 py-3 text-left">위치</th>
                                <th class="col-action px-4 py-3 text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody id="equipTableBody">
                            <tr><td colspan="8" class="text-center py-8 text-gray-400">로딩 중...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 현황 탭 -->
            <div id="panelDashboard" class="hidden">
                <div class="space-y-4">

                    <!-- 상단 요약 카드 -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="ds-card ds-card-compact summary-card">
                            <div class="label"><i class="fas fa-microchip" style="color:var(--c-primary);margin-right:4px"></i>총 장비</div>
                            <div class="value" id="totalEquipment">-</div>
                            <div class="subtext" id="totalEquipmentSub"></div>
                        </div>
                        <div class="ds-card ds-card-compact summary-card">
                            <div class="label"><i class="fas fa-plug" style="color:var(--c-success);margin-right:4px"></i>가동 중</div>
                            <div class="value" style="color:var(--c-success)" id="activeEquipment">-</div>
                            <div class="subtext" id="activeEquipmentSub"></div>
                        </div>
                        <div class="ds-card ds-card-compact summary-card">
                            <div class="label"><i class="fas fa-file" style="color:var(--c-text-secondary);margin-right:4px"></i>오늘 출력</div>
                            <div class="value" style="color:var(--c-text)" id="todayPrints">-</div>
                            <div class="subtext" id="todayPrintsSub"></div>
                        </div>
                        <div class="ds-card ds-card-compact summary-card">
                            <div class="label"><i class="fas fa-chart-pie" style="color:var(--c-text-secondary);margin-right:4px"></i>평균 가동률</div>
                            <div class="value" style="color:var(--c-text)" id="avgUtilization">-</div>
                            <div class="subtext">%</div>
                        </div>
                    </div>

                    <!-- 필터 바 -->
                    <div class="ds-card ds-card-compact flex flex-wrap gap-2 items-center filter-bar">
                        <label style="font-size:12px;color:var(--c-text-secondary);display:flex;align-items:center;gap:6px;">
                            기간
                            <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="fFromDate" class="js-fp ds-input" style="width:140px" />
                        </label>
                        <label style="font-size:12px;color:var(--c-text-secondary);display:flex;align-items:center;gap:6px;">
                            ~
                            <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="fToDate" class="js-fp ds-input" style="width:140px" />
                        </label>
                        <div class="ml-auto flex gap-2">
                            <button onclick="loadEquipmentData()" class="ds-btn ds-btn-ghost ds-btn-sm">
                                <i class="fas fa-sync-alt" style="margin-right:4px"></i>새로고침
                            </button>
                        </div>
                    </div>

                    <!-- 장비별 가동률 -->
                    <div class="ds-card" style="padding:0;overflow:hidden;">
                        <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
                            <h2 class="ds-card-title">
                                <i class="fas fa-chart-bar" style="color:var(--c-primary);margin-right:8px"></i>장비별 가동률
                            </h2>
                        </div>
                        <div id="utilizationChartContainer" style="padding:var(--space-md);min-height:200px;display:flex;flex-direction:column;gap:12px;">
                            <div style="text-align:center;padding:32px;color:var(--c-text-muted);"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
                        </div>
                    </div>

                    <!-- 장비별 실적 테이블 -->
                    <div class="ds-card" style="padding:0;overflow:hidden;">
                        <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
                            <h2 class="ds-card-title">
                                <i class="fas fa-th-large" style="color:var(--c-success);margin-right:8px"></i>장비별 실적
                            </h2>
                        </div>
                        <div class="ds-table-wrap">
                            <table id="equipmentTable" class="ds-table ds-table-compact ds-table-striped">
                                <thead>
                                    <tr>
                                        <th class="col-name" style="min-width:140px;">장비</th>
                                        <th class="col-status" style="text-align:center;">상태</th>
                                        <th class="col-amount" style="text-align:right;">출력건수</th>
                                        <th class="col-qty" style="text-align:center;">성공률</th>
                                        <th class="col-amount" style="text-align:right;">평균시간(초)</th>
                                        <th class="col-status" style="text-align:center;">가동률</th>
                                        <th class="col-action" style="text-align:center;width:60px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="equipmentBody">
                                    <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--c-text-muted);"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 주간 트렌드 -->
                    <div class="ds-card" style="padding:0;overflow:hidden;">
                        <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
                            <h2 class="ds-card-title">
                                <i class="fas fa-line-chart" style="color:var(--c-warning);margin-right:8px"></i>주간 출력 추이
                            </h2>
                        </div>
                        <div id="weeklyTrendContainer" style="padding:var(--space-md);min-height:120px;display:flex;align-items:flex-end;gap:4px;justify-content:space-around;">
                            <div style="text-align:center;padding:32px;color:var(--c-text-muted);width:100%;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- 큐/부하 탭 -->
            <div id="panelQueue" class="hidden">
                <div class="space-y-4">
                    <!-- 툴바 -->
                    <div class="ds-card ds-card-compact flex flex-wrap gap-2 items-center">
                        <div class="text-sm text-gray-600">
                            <i class="fas fa-layer-group mr-1" style="color:var(--c-primary)"></i>장비별 인쇄 큐 · 부하 (진행중 카드 기준)
                            <span class="text-[11px] text-gray-400 ml-1">— 예상시간·부하는 큐에서 "예상시간 재계산" 실행 후 반영</span>
                        </div>
                        <div class="ml-auto flex gap-2">
                            <button onclick="window.eqqUpdateAvgSpeed()" class="ds-btn ds-btn-ghost ds-btn-sm" title="최근 30일 출력이력으로 장비별 평균 인쇄속도(분/㎡)를 재계산합니다">
                                <i class="fas fa-gauge-high" style="margin-right:4px"></i>평균속도 갱신
                            </button>
                            <button onclick="window.eqqLoad()" class="ds-btn ds-btn-ghost ds-btn-sm">
                                <i class="fas fa-sync-alt" style="margin-right:4px"></i>새로고침
                            </button>
                        </div>
                    </div>

                    <!-- 장비 부하 카드 그리드 -->
                    <div id="eqqWorkloadGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div class="col-span-full text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
                    </div>

                    <!-- 선택 장비 큐 상세 -->
                    <div class="ds-card" style="padding:0;overflow:hidden;">
                        <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                            <h2 class="ds-card-title">
                                <i class="fas fa-list-ol" style="color:var(--c-success);margin-right:8px"></i><span id="eqqQueueTitle">장비를 선택하세요</span>
                            </h2>
                            <button id="eqqRecalcBtn" onclick="window.eqqRecalc()" class="ds-btn ds-btn-ghost ds-btn-sm hidden" title="큐 순서 기준으로 예상 시작·종료 시각을 재계산합니다">
                                <i class="fas fa-clock-rotate-left" style="margin-right:4px"></i>예상시간 재계산
                            </button>
                        </div>
                        <div class="ds-table-wrap">
                            <table class="ds-table ds-table-compact">
                                <thead>
                                    <tr>
                                        <th style="width:48px;text-align:center;">순서</th>
                                        <th class="col-code">카드</th>
                                        <th class="col-name">거래처 · 품목</th>
                                        <th class="col-qty" style="text-align:center;">규격</th>
                                        <th class="col-amount" style="text-align:right;">예상(분)</th>
                                        <th style="text-align:center;">예상 시작~종료</th>
                                        <th class="col-date" style="text-align:center;">납기</th>
                                        <th style="width:84px;text-align:center;">순서변경</th>
                                    </tr>
                                </thead>
                                <tbody id="eqqQueueBody">
                                    <tr><td colspan="8" class="text-center py-8 text-gray-400">상단에서 장비를 선택하면 인쇄 대기 큐가 표시됩니다.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 정비 탭 (maintenance 단일소스 이식, ADMIN/MANAGER·lazy) -->
            <div id="panelMaintenance" class="hidden">${maintenanceContent}</div>

            <!-- 배치도 탭 -->
            <div id="panelLayout" class="hidden">
                <div class="ds-card p-4">

                    <!-- 범례 + 공정필터 + 편집 버튼 -->
                    <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
                        <div class="flex items-center gap-3 text-xs">
                            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500 inline-block"></span>가동중</span>
                            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-400 inline-block"></span>대기</span>
                            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-orange-500 inline-block"></span>정비중</span>
                            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-500 inline-block"></span>고장</span>
                        </div>
                        <!-- 공정 필터 (P2, renderProcessFilter가 채움) -->
                        <div id="processFilter" class="flex items-center gap-1 flex-wrap"></div>
                        <div class="flex items-center gap-2">
                            <input type="file" id="floorPlanInput" accept="image/*" class="hidden" onchange="onFloorPlanSelected(this)">
                            <button id="btnUploadFloorPlan" onclick="document.getElementById('floorPlanInput').click()" class="hidden px-3 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                                <i class="fas fa-image"></i><span>도면 업로드</span>
                            </button>
                            <button id="btnDeleteFloorPlan" onclick="deleteFloorPlan()" class="hidden px-3 py-1 text-xs rounded border border-red-200 bg-white text-red-500 hover:bg-red-50 flex items-center gap-1">
                                <i class="fas fa-trash"></i><span>도면 삭제</span>
                            </button>
                            <button id="btnAddZone" onclick="addZone()" class="hidden px-3 py-1 text-xs rounded border border-blue-300 bg-white text-blue-600 hover:bg-blue-50 flex items-center gap-1">
                                <i class="fas fa-plus"></i><span>구역 추가</span>
                            </button>
                            <button id="btnEditLayout" onclick="toggleEditMode()" class="px-3 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                                <i class="fas fa-lock"></i><span>배치 편집</span>
                            </button>
                        </div>
                    </div>

                    <!-- 배치도 캔버스 -->
                    <div id="layoutCanvas" style="height:580px; position:relative; overflow:hidden; border-radius:8px; background:var(--c-bg); border:1px solid var(--c-border); cursor:default;">
                        <!-- 도면 배경 이미지 (R2 blob, z0) -->
                        <div id="layoutBg" style="position:absolute;inset:0;z-index:0;background-size:100% 100%;background-position:center;background-repeat:no-repeat;"></div>
                        <!-- 구역 박스 (facility_zones.bounds %, renderZones가 채움, z1) -->
                        <div id="layoutZones" style="position:absolute;inset:0;z-index:1;pointer-events:none;"></div>
                        <!-- 장비 레이어 (eq-card div들이 layoutCanvas에 직접 append됨, z-index:2) -->
                        <!-- 빈 상태 안내 -->
                        <div id="layoutEmpty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:5;pointer-events:none;">
                            <div class="text-center text-gray-400">
                                <i class="fas fa-map-marked-alt text-4xl mb-2"></i>
                                <p class="text-sm">장비가 없습니다</p>
                            </div>
                        </div>
                    </div>
                    <!-- 구역별 요약 (#370 renderZoneSummary 대상 컨테이너) -->
                    <div id="zoneSummary" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-3"></div>
                </div>
            </div>

            <!-- 팝오버 (단일 요소, 페이지 전역) -->
            <div id="equipPopover" class="hidden fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200" style="min-width:200px;max-width:280px;"></div>

            <!-- 구역(배치도 영역) 추가·편집 모달 (UP3-A) -->
            <div id="zoneEditModal" class="hidden fixed inset-0 z-50 flex items-center justify-center" style="background:rgba(0,0,0,0.4)">
                <div class="bg-white rounded-xl shadow-xl border border-gray-200 p-5" style="width:340px">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-base font-bold text-gray-900" id="zoneEditTitle">구역 추가</h3>
                        <button onclick="document.getElementById('zoneEditModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
                    </div>
                    <input type="hidden" id="zoneEditId">
                    <div class="mb-3">
                        <label class="block text-xs font-medium text-gray-600 mb-1">구역 이름</label>
                        <input type="text" id="zoneEditName" class="w-full px-3 py-2 border rounded text-sm" placeholder="예: 출력실" maxlength="40">
                    </div>
                    <div class="mb-4">
                        <label class="block text-xs font-medium text-gray-600 mb-1">색상</label>
                        <input type="color" id="zoneEditColor" value="#3B82F6" class="w-16 h-9 border rounded cursor-pointer p-0.5">
                    </div>
                    <div class="flex justify-end gap-2">
                        <button onclick="document.getElementById('zoneEditModal').classList.add('hidden')" class="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300">취소</button>
                        <button onclick="saveZone()" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
                    </div>
                </div>
            </div>

            <!-- 장비 상세 패널 (클릭 시 표시) -->
            <div id="detailPanel" class="hidden mt-4">
                <div class="ds-card">
                    <div class="flex items-center justify-between p-4 border-b">
                        <h3 id="detailTitle" class="text-lg font-bold"></h3>
                        <button onclick="closeDetail()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
                    </div>
                    <div class="p-4">
                        <!-- 상태 + 정보 -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div class="border rounded-lg p-3">
                                <h4 class="text-xs font-semibold text-gray-500 mb-2">장비 상태</h4>
                                <div id="detailStatus" class="space-y-2"></div>
                            </div>
                            <div class="border rounded-lg p-3">
                                <h4 class="text-xs font-semibold text-gray-500 mb-2">장비 정보</h4>
                                <div id="detailInfo" class="space-y-1 text-sm"></div>
                            </div>
                            <div class="border rounded-lg p-3">
                                <h4 class="text-xs font-semibold text-gray-500 mb-2">메모</h4>
                                <div id="detailNotes" class="text-sm text-gray-600"></div>
                            </div>
                        </div>

                        <!-- 헤드 관리 -->
                        <div class="mb-6">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-sm">프린트 헤드</h4>
                                <button onclick="openHeadSetup()" id="btnHeadSetup" class="text-xs px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100">
                                    <i class="fas fa-cog mr-1"></i>헤드 설정
                                </button>
                            </div>
                            <div id="detailHeads" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2"></div>
                        </div>

                        <!-- 프리셋 -->
                        <div class="mb-6">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-sm">인쇄 프리셋</h4>
                                <button onclick="openPresetModal()" class="text-xs px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100">
                                    <i class="fas fa-plus mr-1"></i>추가
                                </button>
                            </div>
                            <div id="detailPresets" class="flex flex-wrap gap-2"></div>
                        </div>

                        <!-- 소모품 관리 -->
                        <div class="mb-6">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-sm"><i class="fas fa-box text-amber-500 mr-1"></i>소모품</h4>
                                <button onclick="openConsumableModal()" class="text-xs px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100">
                                    <i class="fas fa-plus mr-1"></i>추가
                                </button>
                            </div>
                            <div id="detailConsumables" class="space-y-2"></div>
                        </div>

                        <!-- 예방정비 스케줄 -->
                        <div class="mb-6">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-sm"><i class="fas fa-calendar-check text-blue-500 mr-1"></i>정비 스케줄</h4>
                                <button onclick="openScheduleModal()" class="text-xs px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100">
                                    <i class="fas fa-plus mr-1"></i>추가
                                </button>
                            </div>
                            <div id="detailSchedules" class="space-y-2"></div>
                        </div>

                        <!-- 생산 실적 -->
                        <div class="mb-6">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-sm"><i class="fas fa-chart-bar text-green-500 mr-1"></i>생산 실적</h4>
                            </div>
                            <div id="detailStats"></div>
                        </div>

                        <!-- 유지보수 이력 -->
                        <div>
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="font-semibold text-sm">유지보수 이력</h4>
                                <button onclick="openMaintenanceModal()" class="text-xs px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100">
                                    <i class="fas fa-plus mr-1"></i>기록 추가
                                </button>
                            </div>
                            <div id="detailLogs" class="space-y-2 max-h-64 overflow-y-auto"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- (0440: 배치도 영역 재고 상세 모달 제거 — /storage-zones 배치도 탭으로 이관) -->

        <!-- 장비 추가/수정 모달 -->
        <div id="equipModal" class="ds-modal-overlay hidden">
            <div class="ds-modal" style="max-width:28rem">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 id="equipModalTitle" class="text-lg font-bold">장비 추가</h3>
                    <button onclick="closeEquipModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <input type="hidden" id="equipEditId">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">ID <span class="text-red-500">*</span></label>
                        <input id="fEquipId" type="text" placeholder="RIP-01" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">이름 <span class="text-red-500">*</span></label>
                        <input id="fEquipName" type="text" placeholder="1번 프린터" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">프린터명</label>
                        <input id="fEquipPrinter" type="text" placeholder="Super Color New H8_A1" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">IP 주소</label>
                        <input id="fEquipIp" type="text" placeholder="192.168.0.101" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">헤드 수</label>
                        <select id="fEquipHeadCount" class="w-full border rounded px-3 py-2 text-sm">
                            <option value="0">설정 안함</option>
                            <option value="2">2개</option>
                            <option value="4">4개</option>
                            <option value="8">8개</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">구역 (배치도)</label>
                        <select id="fEquipZoneId" class="w-full border rounded px-3 py-2 text-sm">
                            <option value="">미지정</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">세부 위치 (메모)</label>
                        <input id="fEquipZone" type="text" placeholder="예: 2층 우측, 창가" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="block text-sm font-medium text-gray-700">공정 (겸용 다중)</label>
                            <button type="button" onclick="applyProcessRecommendation()" class="text-xs text-blue-600 hover:text-blue-700"><i class="fas fa-wand-magic-sparkles mr-1"></i>ID로 추천</button>
                        </div>
                        <div id="fEquipProcesses" class="space-y-1.5 border rounded p-2 max-h-44 overflow-y-auto"></div>
                        <p class="text-[11px] text-gray-400 mt-1">체크=수행 공정, 대표=배지·필터 기본 1개</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">장비 크기 (배치도 표시)</label>
                        <select id="fEquipSizeType" class="w-full border rounded px-3 py-2 text-sm">
                            <option value="LARGE">대형 (3.2m)</option>
                            <option value="SMALL">소형 (1.8m)</option>
                        </select>
                    </div>
                </div>
                <div class="flex justify-end gap-3 p-4 border-t">
                    <button onclick="closeEquipModal()" class="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                    <button onclick="saveEquip()" class="ds-btn ds-btn-primary">저장</button>
                </div>
            </div>
        </div>

        <!-- 프리셋 추가 모달 -->
        <div id="presetModal" class="ds-modal-overlay hidden">
            <div class="ds-modal" style="max-width:28rem">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-bold">프리셋 추가</h3>
                    <button onclick="closePresetModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">프리셋명 <span class="text-red-500">*</span></label>
                        <input id="fPresetName" type="text" placeholder="현수막2패스" class="w-full border rounded px-3 py-2 text-sm" oninput="syncTpsFilename()">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">TPS 파일명 <span class="text-red-500">*</span></label>
                        <input id="fPresetTps" type="text" placeholder="현수막2패스.tps" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">설명</label>
                        <input id="fPresetDesc" type="text" placeholder="선택 입력" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div class="flex items-center gap-2">
                        <input id="fPresetDefault" type="checkbox" class="h-4 w-4">
                        <label class="text-sm font-medium text-gray-700">기본 프리셋으로 설정</label>
                    </div>
                </div>
                <div class="flex justify-end gap-3 p-4 border-t">
                    <button onclick="closePresetModal()" class="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                    <button onclick="savePreset()" class="ds-btn ds-btn-primary">저장</button>
                </div>
            </div>
        </div>

        <!-- 유지보수 기록 추가 모달 -->
        <div id="maintenanceModal" class="ds-modal-overlay hidden">
            <div class="ds-modal" style="max-width:28rem">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-bold">유지보수 기록</h3>
                    <button onclick="closeMaintenanceModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">유형 <span class="text-red-500">*</span></label>
                        <select id="fLogType" class="w-full border rounded px-3 py-2 text-sm">
                            <option value="MAINTENANCE">정기 점검</option>
                            <option value="REPAIR">수리</option>
                            <option value="PART_REPLACEMENT">부품 교체</option>
                            <option value="INSPECTION">검사</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">작업 내용 <span class="text-red-500">*</span></label>
                        <textarea id="fLogDesc" rows="3" placeholder="작업 내용을 입력하세요" class="w-full border rounded px-3 py-2 text-sm"></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">비용 (원)</label>
                        <input id="fLogCost" type="number" placeholder="0" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">작업일시</label>
                        <input id="fLogDate" type="datetime-local" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                </div>
                <div class="flex justify-end gap-3 p-4 border-t">
                    <button onclick="closeMaintenanceModal()" class="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                    <button onclick="saveMaintenance()" class="ds-btn ds-btn-primary">저장</button>
                </div>
            </div>
        </div>

        <!-- 소모품 추가 모달 -->
        <div id="consumableModal" class="ds-modal-overlay hidden">
            <div class="ds-modal" style="max-width:28rem">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-bold">소모품 추가</h3>
                    <button onclick="closeConsumableModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">소모품명 <span class="text-red-500">*</span></label>
                        <input id="fConsName" type="text" placeholder="잉크 카트리지, 와이퍼 등" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">교체 주기 (일)</label>
                        <input id="fConsCycle" type="number" placeholder="30" value="30" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">최종 교체일</label>
                        <input id="fConsLastReplaced" type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" class="js-fp w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">보유 수량</label>
                        <input id="fConsQty" type="number" placeholder="0" value="0" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">비고</label>
                        <input id="fConsNotes" type="text" placeholder="선택 입력" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                </div>
                <div class="flex justify-end gap-3 p-4 border-t">
                    <button onclick="closeConsumableModal()" class="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                    <button onclick="saveConsumable()" class="ds-btn ds-btn-primary">저장</button>
                </div>
            </div>
        </div>

        <!-- 정비 스케줄 추가 모달 -->
        <div id="scheduleModal" class="ds-modal-overlay hidden">
            <div class="ds-modal" style="max-width:28rem">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-bold">정비 스케줄 추가</h3>
                    <button onclick="closeScheduleModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">점검 항목 <span class="text-red-500">*</span></label>
                        <input id="fSchedTitle" type="text" placeholder="헤드 클리닝, 벨트 점검 등" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">점검 주기 (일) <span class="text-red-500">*</span></label>
                        <input id="fSchedInterval" type="number" placeholder="30" value="30" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">설명</label>
                        <textarea id="fSchedDesc" rows="2" placeholder="점검 방법이나 주의사항" class="w-full border rounded px-3 py-2 text-sm"></textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">체크리스트 (줄바꿈 구분)</label>
                        <textarea id="fSchedChecklist" rows="3" placeholder="노즐 상태 확인&#10;잉크 잔량 점검&#10;헤드 클리닝 실행" class="w-full border rounded px-3 py-2 text-sm"></textarea>
                    </div>
                </div>
                <div class="flex justify-end gap-3 p-4 border-t">
                    <button onclick="closeScheduleModal()" class="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                    <button onclick="saveSchedule()" class="ds-btn ds-btn-primary">저장</button>
                </div>
            </div>
        </div>

        <!-- 헤드 설정 모달 -->
        <div id="headSetupModal" class="ds-modal-overlay hidden">
            <div class="ds-modal" style="max-width:24rem">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 class="text-lg font-bold">헤드 설정</h3>
                    <button onclick="closeHeadSetup()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <p class="text-sm text-red-500">주의: 헤드 수를 변경하면 기존 헤드 데이터가 초기화됩니다.</p>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">헤드 수</label>
                        <select id="fHeadCount" class="w-full border rounded px-3 py-2 text-sm">
                            <option value="2">2개</option>
                            <option value="4">4개</option>
                            <option value="8">8개</option>
                        </select>
                    </div>
                </div>
                <div class="flex justify-end gap-3 p-4 border-t">
                    <button onclick="closeHeadSetup()" class="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                    <button onclick="saveHeadSetup()" class="ds-btn ds-btn-primary">적용</button>
                </div>
            </div>
        </div>

        <!-- 헤드 수정 모달 -->
        <div id="headEditModal" class="ds-modal-overlay hidden">
            <div class="ds-modal" style="max-width:24rem">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 id="headEditTitle" class="text-lg font-bold">헤드 #1</h3>
                    <button onclick="closeHeadEdit()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <input type="hidden" id="fHeadNum">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">상태</label>
                        <select id="fHeadStatus" class="w-full border rounded px-3 py-2 text-sm">
                            <option value="NORMAL">정상</option>
                            <option value="CLOGGED">노즐막힘</option>
                            <option value="REPLACE_NEEDED">교체필요</option>
                            <option value="REPLACED">교체완료</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">교체일</label>
                        <input id="fHeadReplacedAt" type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" class="js-fp w-full border rounded px-3 py-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">메모</label>
                        <input id="fHeadNotes" type="text" placeholder="선택 입력" class="w-full border rounded px-3 py-2 text-sm">
                    </div>
                </div>
                <div class="flex justify-end gap-3 p-4 border-t">
                    <button onclick="closeHeadEdit()" class="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                    <button onclick="saveHeadEdit()" class="ds-btn ds-btn-primary">저장</button>
                </div>
            </div>
        </div>
    `,
    pageScript: combinedScript
  })
}
