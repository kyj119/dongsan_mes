import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/orders.js?raw'

export function ordersPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '주문 관리',
    activePage: '/orders',
    pageContent: `
      <!-- 통계 카드 — 목록과 같은 조회조건으로 집계(상태 제외), 클릭 시 해당 상태로 드릴다운.
           스타일 정본 = shared-styles.ts 의 ds-stat / ds-conds 계열 (페이지 로컬 CSS 금지) -->
      <div class="mb-6">
        <div id="orderStatsArea" class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button type="button" class="ds-card ds-card-compact ds-stat" data-stat-status="" onclick="ordStatDrilldown('')" title="상태 조건을 해제하고 전체 조회">
            <div class="text-sm ds-stat-label" style="color:var(--c-text-secondary)">전체 주문</div>
            <div class="text-3xl font-bold" style="color:var(--c-primary)" id="statTotal">-</div>
          </button>
          <button type="button" class="ds-card ds-card-compact ds-stat" data-stat-status="CONFIRMED" onclick="ordStatDrilldown('CONFIRMED')" title="확정 주문만 조회">
            <div class="text-sm ds-stat-label" style="color:var(--c-text-secondary)">확정</div>
            <div class="text-3xl font-bold" style="color:var(--c-warning)" id="statConfirmed">-</div>
          </button>
          <button type="button" class="ds-card ds-card-compact ds-stat" data-stat-status="PRINTING,PRINT_DONE" onclick="ordStatDrilldown('PRINTING,PRINT_DONE')" title="출력중 + 출력완료 주문만 조회">
            <div class="text-sm ds-stat-label" style="color:var(--c-text-secondary)">생산중</div>
            <div class="text-3xl font-bold" style="color:var(--c-orange)" id="statProduction">-</div>
          </button>
          <button type="button" class="ds-card ds-card-compact ds-stat" data-stat-status="SHIPPED" onclick="ordStatDrilldown('SHIPPED')" title="출고완료 주문만 조회">
            <div class="text-sm ds-stat-label" style="color:var(--c-text-secondary)">출고완료</div>
            <div class="text-3xl font-bold" style="color:var(--c-success)" id="statShipped">-</div>
          </button>
        </div>
        <div id="orderFilterChips" class="ds-conds"></div>
      </div>

      <!-- 검색/필터 -->
      <div class="ds-filter-bar">
        <div class="ds-filter-field" style="flex:1;min-width:180px">
          <label class="ds-label">검색</label>
          <input type="text" id="searchQuery" placeholder="주문번호, 거래처명, 품목명..."
            class="ds-input"
            onkeydown="if(event.key==='Enter'){currentPage=1;loadOrders();}">
        </div>
        <div class="ds-filter-field" style="min-width:120px">
          <label class="ds-label">상태</label>
          <select id="statusFilter" class="ds-input"
            onchange="currentPage=1;loadOrders();">
            <option value="">전체 (취소제외)</option>
            <option value="CONFIRMED">확정</option>
            <option value="PRINTING">출력중</option>
            <option value="PRINT_DONE">출력완료</option>
            <option value="SHIPPED">출고완료</option>
            <option value="CANCELLED">취소</option>
          </select>
        </div>
        <div class="ds-filter-field" style="min-width:auto">
          <label class="ds-label">출고지연</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;height:36px" title="납기일이 지났는데 아직 출고완료되지 않은 주문만 보기">
            <input type="checkbox" id="overdueFilter" onchange="currentPage=1;loadOrders();" class="rounded border-gray-300">
            <span style="white-space:nowrap;color:var(--c-danger);font-size:13px"><i class="fas fa-clock" style="margin-right:3px"></i>지연만</span>
          </label>
        </div>
        <div class="ds-filter-divider"></div>
        <button type="button" id="filterToggleBtn" class="ds-filter-toggle"
          onclick="var e=document.getElementById('ordFilterMore');e.classList.toggle('open');this.querySelector('span').textContent=e.classList.contains('open')?'접기 \\u25B2':'더보기 \\u25BC';">
          <i class="fas fa-sliders-h"></i><span>더보기 \u25BC</span>
        </button>
        <div class="ds-filter-actions">
          <button onclick="resetAllFilters()" class="ds-btn ds-btn-secondary ds-btn-sm">
            <i class="fas fa-undo" style="margin-right:4px"></i>초기화
          </button>
          <button onclick="currentPage=1;loadOrders();" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-search" style="margin-right:4px"></i>검색
          </button>
          <div id="newOrderBtnWrap" class="hidden">
            <a id="newOrderLink" href="/order-form" class="ds-btn ds-btn-sm" style="background:var(--c-success);color:#fff;display:inline-flex;align-items:center;text-decoration:none;">
              <i class="fas fa-plus" style="margin-right:4px"></i>새 주문
            </a>
          </div>
          <button onclick="exportOrdersCsv()" class="ds-btn ds-btn-secondary ds-btn-sm">
            <i class="fas fa-file-csv" style="margin-right:4px"></i>CSV
          </button>
        </div>

        <!-- 확장 필터 -->
        <div id="ordFilterMore" class="ds-filter-expand">
          <div class="ds-filter-field" style="min-width:120px">
            <label class="ds-label">배송방법</label>
            <select id="deliveryMethodFilter" class="ds-input"
              onchange="currentPage=1;loadOrders();">
              <option value="">전체</option>
              <option value="대신택배">대신택배</option>
              <option value="대신화물">대신화물</option>
              <option value="한진택배">한진택배</option>
              <option value="직접배송">직접배송</option>
              <option value="용차">용차</option>
              <option value="퀵">퀵</option>
              <option value="방문수령">방문수령</option>
            </select>
          </div>
          <div class="ds-filter-field" style="min-width:110px">
            <label class="ds-label">회계상태</label>
            <select id="billingStatusFilter" class="ds-input"
              onchange="currentPage=1;loadOrders();">
              <option value="">전체</option>
              <option value="NONE">미확인</option>
              <option value="BILLED">회계반영</option>
              <option value="PAID">수금완료</option>
            </select>
          </div>
          <div class="ds-filter-field" style="min-width:100px">
            <label class="ds-label">우선순위</label>
            <select id="priorityFilter" class="ds-input"
              onchange="currentPage=1;loadOrders();">
              <option value="">전체</option>
              <option value="URGENT">긴급</option>
              <option value="NORMAL">일반</option>
            </select>
          </div>
          <div class="ds-filter-field" style="min-width:140px">
            <label class="ds-label">정렬</label>
            <!-- 정렬 라벨은 기준을 명시한다("최신순"만 쓰면 어느 날짜 기준인지 불명확 — CLAUDE.md 정렬 규약) -->
            <select id="sortBy" class="ds-input"
              onchange="currentPage=1;loadOrders();">
              <option value="order_date_desc">주문일 최신순</option>
              <option value="order_date_asc">주문일 오래된순</option>
              <option value="delivery_date_asc">납기일 빠른순</option>
              <option value="delivery_date_desc">납기일 늦은순</option>
              <option value="final_amount_desc">금액 큰순</option>
              <option value="final_amount_asc">금액 작은순</option>
              <option value="client_name_asc">거래처명 가나다순</option>
              <option value="created_at_desc">등록 최신순</option>
              <option value="created_at_asc">등록 오래된순</option>
            </select>
          </div>
          <div class="ds-filter-divider"></div>
          <div class="ds-filter-field">
            <label class="ds-label">등록일 from</label>
            <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="orderDateFrom" class="js-fp ds-input"
              onchange="currentPage=1;loadOrders();">
          </div>
          <div class="ds-filter-field">
            <label class="ds-label">~ to</label>
            <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="orderDateTo" class="js-fp ds-input"
              onchange="currentPage=1;loadOrders();">
          </div>
          <div class="ds-filter-field" style="align-self:flex-end">
            <button type="button" onclick="clearDateFilter()" class="ds-btn ds-btn-secondary ds-btn-sm">
              <i class="fas fa-eraser" style="margin-right:4px"></i>날짜 초기화
            </button>
          </div>
        </div>
      </div>

      <!-- 목록 도구모음: 조회조건 프리셋 · 열 선택 · 페이지당 건수 (렌더 = shell.js dsListToolbar) -->
      <div id="ordListToolbar"></div>

      <!-- 일괄 액션 바 (체크박스 선택 시 하단 고정 표시) -->
      <div id="bulkActionBar" class="ds-bulk-bar">
        <div class="ds-bulk-bar-count">
          <i class="fas fa-check-square"></i>
          <span><span id="bulkCount">0</span>건 선택</span>
        </div>
        <div class="ds-bulk-bar-divider"></div>
        <div class="ds-bulk-bar-actions">
          <select id="bulkStatusSelect" class="ds-input" style="width:auto;min-height:32px;padding:4px 10px;font-size:var(--fs-xs)">
            <option value="">상태 선택</option>
          </select>
          <button onclick="bulkChangeStatus()" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-sync-alt" style="margin-right:4px"></i>상태변경
          </button>
        </div>
        <div class="ds-bulk-bar-divider"></div>
        <div class="ds-bulk-bar-actions">
          <button onclick="bulkShipSelected()" class="ds-btn ds-btn-sm" style="background:var(--c-success);color:#fff;">
            <i class="fas fa-shipping-fast" style="margin-right:4px"></i>일괄 출고
          </button>
          <button onclick="bulkBillingConfirm()" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-check-double" style="margin-right:4px"></i>회계반영
          </button>
        </div>
        <div class="ds-bulk-bar-end">
          <button onclick="clearBulkSelection()" class="ds-btn ds-btn-secondary ds-btn-sm">선택 해제</button>
        </div>
      </div>
      <!-- 주문 테이블 -->
      <style>
        /* 주문 리스트 전용: 셀 패딩 통일(헤더/바디 정렬) + 좁은 컬럼 '...' 잘림 방지 (specificity 0,2,2 > ds-table-striped 0,1,2) */
        .ds-table.ord-tbl thead th, .ds-table.ord-tbl tbody td { padding: 7px 8px; }
        /* 액션 아이콘 + 납기일 '지연' 뱃지가 좁은 셀에서 '...'로 잘리지 않도록 (specificity 0,3,1 > ds-table-striped 0,1,2) */
        .ds-table.ord-tbl td.ord-act, .ds-table.ord-tbl td.ord-due { overflow: visible; }
      </style>
      <div class="ds-card" style="padding:0;overflow:hidden;">
        <div class="ds-table-wrap" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="ds-table ds-table-striped ord-tbl">
            <thead>
              <tr>
                <!-- data-col = '열 선택'(dsListToolbar) 대상. 체크박스·액션 열은 숨김 대상에서 제외 -->
                <th style="text-align:center;width:36px"><input type="checkbox" id="selectAllOrders" onchange="toggleSelectAll(this)" class="rounded border-gray-300"></th>
                <th style="width:108px" data-col="order_number">주문번호</th>
                <th style="width:150px" data-col="client">거래처</th>
                <th data-col="item">품목</th>
                <th style="width:100px" data-col="delivery_date">납기일</th>
                <th style="width:96px;text-align:right" data-col="amount">금액</th>
                <th style="width:86px" data-col="status">상태</th>
                <th style="width:82px;text-align:center" data-col="billing">회계반영</th>
                <th style="width:78px" data-col="created">등록일</th>
                <th style="width:130px;text-align:center">액션</th>
              </tr>
            </thead>
            <tbody id="ordersTable">
            </tbody>
          </table>
        </div>
        <!-- 합계 바 — 조회조건 전체 기준(현재 페이지 아님). 스크롤 영역 밖이라 항상 보인다 -->
        <div id="ordersSummaryBar" class="ds-summary"></div>
        <!-- 페이지네이션 -->
        <div id="ordersPagination" class="px-6 py-3 flex items-center gap-2 flex-wrap" style="border-top:1px solid var(--c-border)"></div>
      </div>
      <div id="bulkActionSpacer" class="ds-bulk-bar-spacer"></div>

      <!-- 상태변경 모달 -->
      <div id="statusChangeModal" class="ds-modal-overlay hidden">
        <div class="ds-modal" style="width:320px">
          <div class="ds-modal-header">
            <h3 class="ds-card-title">상태 변경</h3>
          </div>
          <div class="ds-modal-body">
            <select id="newStatusSelect" class="ds-input">
              <option value="CONFIRMED">확정</option>
              <option value="PRINTING">출력중</option>
              <option value="PRINT_DONE">출력완료</option>
              <option value="SHIPPED">출고완료</option>
            </select>
          </div>
          <div class="ds-modal-footer">
            <button onclick="closeStatusModal()" class="ds-btn ds-btn-secondary">닫기</button>
            <button onclick="confirmStatusChange()" class="ds-btn ds-btn-primary">변경</button>
          </div>
        </div>
      </div>

      <!-- 취소 이유 모달 -->
      <div id="cancelReasonModal" class="ds-modal-overlay hidden" style="z-index:60">
        <div class="ds-modal" style="width:380px">
          <div class="ds-modal-header">
            <h3 class="ds-card-title"><i class="fas fa-ban mr-1 text-amber-500"></i>주문 취소</h3>
          </div>
          <div class="ds-modal-body space-y-3">
            <input type="hidden" id="cancelOrderId">
            <p class="text-sm text-gray-600">주문 <strong id="cancelOrderNumber"></strong>을(를) 취소합니다.</p>
            <div>
              <label class="ds-label">취소 이유 <span class="text-red-500">*</span></label>
              <select id="cancelReasonSelect" onchange="onCancelReasonChange()" class="ds-input">
                <option value="">선택해주세요</option>
                <option value="고객 취소">고객 취소</option>
                <option value="디자인 변경">디자인 변경</option>
                <option value="원자재 부족">원자재 부족</option>
                <option value="기타">기타 (직접입력)</option>
              </select>
            </div>
            <div id="cancelReasonDetailRow" class="hidden">
              <label class="ds-label">상세 사유</label>
              <input type="text" id="cancelReasonDetail" class="ds-input" placeholder="취소 사유를 입력해주세요">
            </div>
          </div>
          <div class="ds-modal-footer">
            <button onclick="document.getElementById('cancelReasonModal').classList.add('hidden')" class="ds-btn ds-btn-secondary">닫기</button>
            <button onclick="confirmCancelOrder()" class="ds-btn" style="background:#f59e0b;color:white;">취소 확정</button>
          </div>
        </div>
      </div>

      <!-- 일괄 처리 결과 리포트 모달 (상태변경·회계반영 공용) -->
      <div id="bulkResultModal" class="ds-modal-overlay hidden" style="z-index:60">
        <div class="ds-modal" style="width:420px;max-width:92vw">
          <div class="ds-modal-header">
            <h3 class="ds-card-title" id="bulkResultTitle">처리 결과</h3>
          </div>
          <div class="ds-modal-body" id="bulkResultBody" style="max-height:60vh;overflow-y:auto"></div>
          <div class="ds-modal-footer">
            <button onclick="closeBulkResultModal()" class="ds-btn ds-btn-primary">확인</button>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
