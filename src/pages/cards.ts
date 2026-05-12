import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/cards.js?raw'

export function cardsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '현장 대시보드',
    activePage: '/cards',
    pageCSS: `
        /* 칸반 컬럼 — 고정 높이 없이 자연 스크롤 */
        .kanban-col {
            display: flex; flex-direction: column;
            background: var(--c-border-light, #f1f5f9); border-radius: var(--radius-lg);
        }
        .col-header {
            position: sticky; top: 0; z-index: 5;
            padding: 10px 14px; font-size: 15px; font-weight: 700;
            border-bottom: 2px solid var(--c-border);
            display: flex; justify-content: space-between; align-items: center;
            border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        }
        .col-count {
            background: rgba(0,0,0,0.12); border-radius: 20px;
            padding: 2px 10px; font-size: 13px;
        }

        /* 칸반 카드 */
        .kanban-card {
            margin: 6px 8px; padding: 12px 14px;
            background: var(--c-surface); border-radius: var(--radius-md);
            border-left: 5px solid var(--c-border);
            box-shadow: var(--shadow-sm);
            cursor: pointer; transition: box-shadow var(--transition-fast);
            min-height: 120px;
        }
        .kanban-card:hover { box-shadow: var(--shadow-md); }
        .kanban-card:active { transform: scale(0.99); }
        .kanban-card.urgency-d0 { border-left-color: #ef4444; }
        .kanban-card.urgency-d1 { border-left-color: #f97316; }
        .kanban-card.urgency-d2 { border-left-color: #eab308; }
        .kanban-card.urgency-d4 { border-left-color: #22c55e; }
        .kanban-card.hold-card {
            background: repeating-linear-gradient(
                135deg, #f9fafb, #f9fafb 8px, #f1f5f9 8px, #f1f5f9 16px
            );
            border-left-color: #94a3b8; opacity: 0.85;
        }
        @keyframes pulse-urgent {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        .kanban-card.urgent-pulse { animation: pulse-urgent 1.5s ease-in-out infinite; }

        /* 터치 친화 버튼 */
        .action-btn {
            min-height: 48px; min-width: 48px;
            padding: 6px 14px;
            border-radius: 8px; font-size: 13px; font-weight: 600;
            border: none; cursor: pointer; transition: opacity 0.1s;
        }
        .action-btn:active { opacity: 0.7; }
        /* UI가이드: Primary(파랑) / Danger(빨강) / Secondary(테두리) / Ghost */
        .action-btn-done { background: #2563eb; color: #fff; }
        .action-btn-hold { background: #fff; color: #dc2626; border: 1px solid #fca5a5; }
        .action-btn-resume { background: #2563eb; color: #fff; }
        .action-btn-rip { background: #2563eb; color: #fff; }

        /* 모바일 탭 */
        .mobile-tab {
            flex: 1; padding: 10px 6px; text-align: center;
            font-size: 13px; font-weight: 600;
            background: #e2e8f0; border-radius: 8px;
            border: none; cursor: pointer;
        }
        .mobile-tab.active { background: #3b82f6; color: #fff; }

        /* 보류 섹션 */
        .hold-toggle {
            padding: 10px 14px; margin-top: 8px;
            background: #fef2f2; border-radius: 8px;
            cursor: pointer; font-size: 13px; font-weight: 600; color: #991b1b;
            border: 1px dashed #fca5a5;
        }

        /* 드래그앤드롭 */
        .kanban-card[draggable="true"] { cursor: grab; }
        .kanban-card[draggable="true"]:active { cursor: grabbing; }
        .dnd-dragging { opacity: 0.4; transform: scale(0.96); }
        .dnd-over {
            background: rgba(59, 130, 246, 0.08) !important;
            outline: 2px dashed #3b82f6;
            outline-offset: -2px;
            border-radius: var(--radius-md);
            min-height: 80px;
        }

        /* 벌크 액션 바 */
        .bulk-bar { transform: translateY(100%); transition: transform 0.3s; }
        .bulk-bar.visible { transform: translateY(0); }

        /* 카드 모달 */
        .thumbnail-img { cursor: zoom-in; }

        /* RIP 배지 */
        .rip-badge {
            font-size: 10px; padding: 2px 6px; border-radius: 4px;
            font-weight: 700; letter-spacing: 0.02em;
        }
        .rip-badge-queued { background: #fef9c3; color: #854d0e; }
        .rip-badge-sent { background: #dbeafe; color: #1e40af; }

        /* 대시보드 패널 */
        #dashboardPanel { align-items: stretch; }

        /* ===== 그리드 뷰 (출력중/출력완료) ===== */
        .grid-card-container {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            padding: 8px;
        }
        .grid-card {
            background: var(--c-surface, #fff);
            border-radius: 10px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            cursor: pointer;
            transition: box-shadow 0.15s, transform 0.1s;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .grid-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .grid-card:active { transform: scale(0.98); }

        /* 썸네일 영역 */
        .grid-card-thumb {
            position: relative;
            background: #f9fafb;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 90px;
            max-height: 140px;
            overflow: hidden;
        }
        .grid-card-img {
            width: 100%;
            height: 100%;
            min-height: 90px;
            max-height: 140px;
            object-fit: contain;
            background: #f9fafb;
        }
        .grid-card-thumb.no-thumb .grid-card-img { display: none; }
        .grid-card-no-img {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 90px;
            width: 100%;
            color: #d1d5db;
        }

        /* 규격 오버레이 */
        .grid-card-spec-overlay {
            position: absolute;
            bottom: 0; left: 0; right: 0;
            background: rgba(0,0,0,0.55);
            color: #fff;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            text-align: center;
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
        }

        /* 카드 정보 영역 */
        .grid-card-info {
            padding: 8px 10px 10px;
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        /* 그리드 액션 버튼 */
        .grid-action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            border: 1px solid #e5e7eb;
            cursor: pointer;
            transition: opacity 0.1s;
            min-height: 30px;
        }
        .grid-action-btn:active { opacity: 0.7; }

        /* ── 카드 상세 슬라이드 패널 (C형) ── */
        .card-panel-overlay {
            position: fixed; inset: 0; z-index: 50;
            background: rgba(0,0,0,0.35);
            transition: background 0.25s;
        }
        .card-panel {
            position: absolute; right: 0; top: 0; bottom: 0;
            width: 560px; max-width: 100vw;
            background: #fff;
            box-shadow: -4px 0 24px rgba(0,0,0,0.12);
            display: flex; flex-direction: column;
            transform: translateX(100%);
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .card-panel.card-panel-open {
            transform: translateX(0);
        }
        .card-panel-header {
            padding: 16px 20px;
            border-bottom: 1px solid #e5e7eb;
            display: flex; align-items: flex-start; gap: 12px;
            flex-shrink: 0;
        }
        .card-panel-body {
            flex: 1; overflow-y: auto;
            padding: 16px 20px;
        }
        .card-panel-footer {
            padding: 12px 20px;
            border-top: 1px solid #e5e7eb;
            background: #fafafa;
            flex-shrink: 0;
        }
        /* 모달 내 아이템 행 */
        .card-modal-item {
            display: flex; align-items: flex-start; gap: 14px;
            padding: 12px 8px;
            border-bottom: 1px solid #f3f4f6;
            border-radius: 8px;
            transition: background 0.1s;
        }
        .card-modal-item:hover { background: #f9fafb; }
        .card-modal-item:last-child { border-bottom: none; }
        .card-modal-item.item-completed { opacity: 0.55; }
        /* 모달 내 썸네일 */
        .card-modal-thumb {
            width: 120px; height: 120px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            background: #f9fafb;
            overflow: hidden;
            flex-shrink: 0;
            cursor: zoom-in;
        }
        .card-modal-item-info {
            flex: 1; min-width: 0;
        }

        /* 1024 이하에서는 1열 */
        @media (max-width: 1023px) {
            .grid-card-container {
                grid-template-columns: repeat(2, 1fr);
            }
            .card-panel { width: 100vw; }
        }
    `,
    pageContent: `
        <!-- 헤더 -->
        <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-bold" style="color:var(--c-text)">현장 대시보드</h2>
            <div class="flex items-center gap-2">
                <button onclick="loadKanban()" class="ds-btn ds-btn-primary ds-btn-sm" style="background:var(--c-success)" title="새로고침 (R)">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
        </div>

        <!-- 상태 배너 -->
        <div id="kanbanStatus" class="ds-alert ds-alert-info mb-2" style="text-align:center">
            <i class="fas fa-spinner fa-spin" style="margin-right:4px"></i> 칸반 로딩 준비중...
        </div>

        <!-- 카테고리 필터 -->
        <div id="categoryFilterBar" class="flex gap-1.5 mb-2 overflow-x-auto pb-1" style="scrollbar-width:thin"></div>

        <!-- 필터 바 -->
        <div class="ds-filter-bar" style="margin-bottom:var(--space-md)">
            <div class="ds-filter-field">
              <label class="ds-label">긴급도</label>
              <select id="urgencyFilter" onchange="setUrgencyFilter(this.value)" class="ds-input">
                <option value="">전체</option>
                <option value="urgent">지연 (D-Day 이전)</option>
                <option value="high">긴급 (D-1)</option>
                <option value="normal">보통 (D-2~3)</option>
                <option value="low">여유 (D-4+)</option>
              </select>
            </div>
            <div class="ds-filter-field">
              <label class="ds-label">정렬</label>
              <select id="kanbanSort" onchange="setKanbanSort(this.value)" class="ds-input">
                <option value="delivery_asc">납기순</option>
                <option value="priority_desc">우선순위순</option>
                <option value="created_desc">최신등록순</option>
              </select>
            </div>
            <div class="ds-filter-field" style="flex:1;min-width:180px">
              <label class="ds-label">검색</label>
              <input type="text" id="kanbanSearch" placeholder="거래처, 품목, 주문번호..."
                class="ds-input" onkeyup="filterKanban(this.value)">
            </div>
        </div>

        <!-- 일괄 액션 바 -->
        <div id="cardBulkBar" class="ds-bulk-bar">
          <div class="ds-bulk-bar-count">
            <i class="fas fa-check-square"></i>
            <span><span id="cardBulkCount">0</span>건 선택</span>
          </div>
          <div class="ds-bulk-bar-divider"></div>
          <div class="ds-bulk-bar-actions">
            <select id="cardBulkStatus" class="ds-input" style="width:auto;min-height:32px;padding:4px 10px;font-size:var(--fs-xs)">
              <option value="">상태 선택</option>
              <option value="PRINT_DONE">출력완료</option>
              <option value="HOLD">보류</option>
              <option value="PRINTING">출력중</option>
            </select>
            <button onclick="cardBulkChangeStatus()" class="ds-btn ds-btn-primary ds-btn-sm">
              <i class="fas fa-sync-alt" style="margin-right:4px"></i>일괄 변경
            </button>
          </div>
          <div class="ds-bulk-bar-end">
            <button onclick="clearCardSelection()" class="ds-btn ds-btn-secondary ds-btn-sm">선택 해제</button>
          </div>
        </div>
        <div id="cardBulkSpacer" class="ds-bulk-bar-spacer"></div>

        <!-- 대시보드 요약 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3" id="dashboardPanel">
            <div class="ds-card ds-card-compact flex items-center gap-3">
                <div id="progressGauge" style="width:60px;height:60px;flex-shrink:0"></div>
                <div>
                    <div class="text-2xl font-bold" id="progressText">0%</div>
                    <div class="text-xs" style="color:var(--c-text-secondary)" id="progressCount">0/0 완료</div>
                </div>
            </div>
            <div class="ds-card ds-card-compact overflow-y-auto" style="max-height:100px">
                <div class="text-xs font-semibold mb-1" style="color:var(--c-text-secondary)">출고방법별</div>
                <div id="deliverySummary" class="space-y-0.5"></div>
            </div>
            <div class="ds-card ds-card-compact" id="todayShipPanel">
                <div class="text-xs font-semibold mb-1" style="color:var(--c-text-secondary)">금일 출고</div>
                <div class="flex items-center gap-2">
                    <span class="text-2xl font-bold text-red-600" id="todayShipCount">0</span>
                    <span class="text-xs text-gray-500">건 출고 예정</span>
                </div>
                <div id="todayShipDetail" class="text-[10px] text-gray-500 mt-1"></div>
            </div>
        </div>

        <!-- KPI 요약 바 -->
        <div class="flex flex-wrap items-center gap-2 mb-3" id="kanbanKpiBar">
            <span id="kpiOverdue" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">지연 0건</span>
            <span class="text-gray-300">|</span>
            <span id="kpiRipWaiting" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">RIP대기 0</span>
            <span id="kpiPrinting" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">출력중 0</span>
            <span id="kpiPrintDone" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">완료 0</span>
            <span class="text-gray-300">|</span>
            <span id="kpiHold" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">보류 0건</span>
        </div>

        <!-- 데스크탑 2컬럼 칸반 (진행중 | 출력완료) -->
        <div class="hidden lg:grid lg:grid-cols-2 gap-3 items-start" id="kanbanBoard">
            <!-- 진행중 (RIP대기 + 출력중 통합) -->
            <div class="kanban-col" id="colInProgress">
                <div class="col-header" style="background:#dbeafe;border-bottom-color:#93c5fd">
                    <i class="fas fa-play-circle" style="margin-right:4px"></i> 진행중 <span class="col-count" id="colCntProgress">0</span>
                </div>
                <div id="listInProgress"></div>
            </div>
            <!-- 출력완료 -->
            <div class="kanban-col" id="colPrintDone">
                <div class="col-header" style="background:#dcfce7;border-bottom-color:#86efac">
                    &#10003; 출력완료 <span class="col-count" id="colCntDone">0</span>
                </div>
                <div id="listPrintDone"></div>
            </div>
        </div>

        <!-- 보류 섹션 (칸반 아래) -->
        <div id="holdSection" class="mt-2" style="display:none">
            <div class="hold-toggle" onclick="toggleHoldSection()">
                &#9208; 보류 (<span id="holdCount">0</span>)
            </div>
            <div id="listHold" style="display:none" class="grid lg:grid-cols-2 gap-2 mt-1"></div>
        </div>

        <!-- 모바일 탭 (<1024px) -->
        <div class="lg:hidden" id="mobileView">
            <div class="flex gap-1 mb-3">
                <button class="mobile-tab active" data-tab="progress" onclick="switchMobileTab('progress')">진행중</button>
                <button class="mobile-tab" data-tab="done" onclick="switchMobileTab('done')">출력완료</button>
            </div>
            <div id="mobileContent"></div>
        </div>

        <!-- HOLD 불량유형 모달 -->
        <div id="holdModal" class="ds-modal-overlay" style="display:none;">
          <div class="ds-modal" style="max-width:448px">
            <div class="ds-modal-header">
              <h3 class="ds-card-title"><i class="fas fa-pause-circle" style="color:var(--c-text-secondary);margin-right:8px"></i>보류 처리</h3>
            </div>
            <div class="ds-modal-body">
              <div style="margin-bottom:var(--space-md)">
                <label class="ds-label">불량 유형 (선택)</label>
                <select id="holdDefectCategory" class="ds-input">
                  <option value="">없음 (단순 보류)</option>
                  <option value="COLOR">색상 불량</option>
                  <option value="SIZE">규격 불량</option>
                  <option value="DAMAGE">파손/찢김</option>
                  <option value="MATERIAL">자재 불량</option>
                  <option value="DESIGN">디자인 오류</option>
                  <option value="OTHER">기타</option>
                </select>
              </div>
              <div>
                <label class="ds-label">보류 사유 <span style="color:var(--c-danger)">*</span></label>
                <textarea id="holdReason" rows="3" class="ds-input" placeholder="보류 사유를 입력하세요..."></textarea>
              </div>
            </div>
            <div class="ds-modal-footer">
              <button onclick="closeHoldModal()" class="ds-btn ds-btn-secondary">취소</button>
              <button onclick="confirmHold()" class="ds-btn ds-btn-primary" style="background:var(--c-text)">보류 처리</button>
            </div>
          </div>
        </div>

        <!-- QR 스캔 입력 (숨김) -->
        <input type="text" id="qrScanInput" style="position:absolute;left:-9999px"
               onkeydown="if(event.key===\x27Enter\x27){processQrScan(this.value);this.value=\x27\x27;event.preventDefault()}">

        <!-- 벌크 액션 바 -->
        <div id="bulkBar" class="bulk-bar fixed bottom-0 left-0 right-0 bg-gray-800 text-white px-4 py-3 z-40">
            <div class="max-w-6xl mx-auto flex items-center justify-between">
                <span id="selectedCount" class="text-sm">0장 선택됨</span>
                <div class="flex gap-2">
                    <button onclick="bulkChangeStatus(\x27PRINT_DONE\x27)" class="action-btn action-btn-done text-xs">&#10003; 출력완료</button>
                    <button onclick="bulkChangeStatus(\x27HOLD\x27)" class="action-btn action-btn-hold text-xs">&#9208; 보류</button>
                    <button onclick="clearSelection()" class="action-btn bg-gray-600 text-white text-xs">해제</button>
                </div>
            </div>
        </div>
    `,
    pageScript
  })
}
