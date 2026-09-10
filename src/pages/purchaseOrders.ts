import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/purchaseOrders.js?raw'

export function purchaseOrdersPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '발주 관리',
    activePage: '/purchase-orders',
    pageContent: `
      <!-- 통계 카드 (핵심 4개) — 앞 3개는 현재 조회조건 기준 집계 + 드릴다운.
           '이번달 발주 금액'만 기간 고정 지표라 라벨에 기준을 명시하고 클릭 대상에서 뺀다. -->
      <div id="poStatsArea" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <!-- 검수 대기(0612) — 입고가 발주와 다르거나, 물건이 먼저 와서 사후 생성된 발주.
             담당자가 「뭐가 안 들어왔지」를 기억으로 찾지 않게 시스템이 차이를 먼저 계산해 둔다. -->
        <button type="button" class="ds-card ds-stat p-4" style="border-color:#fdba74"
          data-stat-status="REVIEW" onclick="filterByStatus('REVIEW')"
          title="입고 수량이 발주와 다르거나(예상 수량은 롤 수 기준), 입고 화면에서 사후 생성된 발주입니다. 확인 후 상세에서 「검수 승인」을 누르면 목록에서 빠집니다.">
          <div class="text-xs font-semibold uppercase tracking-wider ds-stat-label" style="color:#c2410c">검수 대기</div>
          <div class="text-3xl font-bold mt-1 tabular-nums" style="color:#ea580c" id="statReview">-</div>
        </button>
        <button type="button" class="ds-card ds-stat p-4" data-stat-status="CONFIRMED" onclick="filterByStatus('CONFIRMED')">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider ds-stat-label">입고 대기</div>
          <div class="text-3xl font-bold text-blue-600 mt-1 tabular-nums" id="statConfirmed">-</div>
        </button>
        <button type="button" class="ds-card ds-stat p-4" data-stat-status="PARTIAL_RECEIVED" onclick="filterByStatus('PARTIAL_RECEIVED')">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider ds-stat-label">부분 입고</div>
          <div class="text-3xl font-bold text-amber-500 mt-1 tabular-nums" id="statPartial">-</div>
        </button>
        <button type="button" class="ds-card ds-stat p-4 border-red-200" data-stat-status="OVERDUE" onclick="filterByStatus('OVERDUE')">
          <div class="text-xs font-semibold text-red-500 uppercase tracking-wider ds-stat-label">납기 지연</div>
          <div class="text-3xl font-bold text-red-600 mt-1 tabular-nums" id="statOverdue">-</div>
        </button>
        <div class="ds-card p-4" title="조회조건과 무관한 고정 지표입니다. 조회조건 기준 금액은 목록 하단 합계 바를 보세요.">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider">이번달 발주 금액 <span class="normal-case font-normal">(조회조건 무관)</span></div>
          <div class="text-2xl font-bold text-gray-900 mt-1 tabular-nums" id="statMonthlyAmount">-</div>
        </div>
      </div>
      <div id="poFilterChips" class="ds-conds mb-6"></div>

      <!-- 검색/필터 바 — 주문서(pages/orders.ts)와 **같은 골격**을 쓴다(2026-09-10).
           종전엔 발주만 라벨 없는 입력칸을 한 줄로 늘어놓아 두 목록의 검색을 따로 익혀야 했고,
           무엇보다 **발주일로 거를 방법이 아예 없었다** — API 는 date_from/date_to 를 이미
           받고 있었는데(routes/purchaseOrders/listFilter.ts) 화면에 입력칸만 없던 것이다.
           ⚠️이 파일은 백틱 템플릿이라 주석에도 백틱을 쓰면 템플릿이 깨진다(CLAUDE.md 함정). -->
      <div class="ds-filter-bar">
        <div class="ds-filter-field" style="flex:1;min-width:180px">
          <label class="ds-label">검색</label>
          <input type="text" id="searchInput" placeholder="발주번호, 공급업체명..." class="ds-input"
            onkeydown="if(event.key==='Enter')loadPOs(1)">
        </div>
        <div class="ds-filter-field" style="min-width:120px">
          <label class="ds-label">상태</label>
          <select id="statusFilter" class="ds-input" onchange="loadPOs(1)">
            <option value="">전체 상태</option>
            <option value="DRAFT">임시저장</option>
            <option value="CONFIRMED">발주확정</option>
            <option value="PARTIAL_RECEIVED">부분입고</option>
            <option value="RECEIVED">입고완료</option>
            <option value="CANCELLED">취소</option>
          </select>
        </div>
        <div class="ds-filter-field" style="min-width:150px">
          <label class="ds-label">공급업체</label>
          <select id="supplierFilter" class="ds-input" onchange="loadPOs(1)">
            <option value="">전체 공급업체</option>
          </select>
        </div>
        <div class="ds-filter-field" style="min-width:130px">
          <label class="ds-label">기간</label>
          <select id="poDatePeriod" class="ds-input" onchange="poApplyDatePeriod(this.value)"
            title="오늘 기준 최근 기간으로 발주일을 설정. 프리셋에는 상대 기간으로 저장되어 언제 적용해도 그날 기준으로 계산">
            <option value="">직접입력</option>
            <option value="1">최근 1개월</option>
            <option value="3">최근 3개월</option>
            <option value="6">최근 6개월(반기)</option>
            <option value="12">최근 1년</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">발주일 from</label>
          <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="poDateFrom"
            class="js-fp ds-input" onchange="poDateManualChange()">
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">~ to</label>
          <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="poDateTo"
            class="js-fp ds-input" onchange="poDateManualChange()">
        </div>
        <div class="ds-filter-field" style="align-self:flex-end">
          <button type="button" onclick="poClearDateFilter()" class="ds-btn ds-btn-secondary ds-btn-sm" title="기간 제한 없이 전체 조회">
            <i class="fas fa-eraser" style="margin-right:4px"></i>날짜 초기화
          </button>
        </div>
        <div class="ds-filter-field" style="min-width:140px">
          <label class="ds-label">정렬</label>
          <!-- 정렬 라벨은 기준을 명시한다(CLAUDE.md 정렬 규약) -->
          <select id="sortSelect" class="ds-input" onchange="loadPOs(1)">
            <option value="order_date_desc">발주일 최신순</option>
            <option value="order_date_asc">발주일 오래된순</option>
            <option value="created_at_desc">등록 최신순</option>
            <option value="expected_date_asc">납기 임박순</option>
            <option value="final_amount_desc">금액 큰순</option>
            <option value="final_amount_asc">금액 작은순</option>
            <option value="supplier_name_asc">공급업체명 가나다순</option>
            <option value="po_number_asc">발주번호순</option>
          </select>
        </div>
        <div class="ds-filter-field" style="min-width:auto">
          <label class="ds-label">법인간거래</label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;height:36px"
            title="내부 법인(동산기획·선명·청주) 간 거래 발주. 기본은 숨김 — 미지급(AP) 집계에서도 제외되며 회계허브 > 법인간거래 탭에서 확인합니다.">
            <input type="checkbox" id="poIncludeIntercompany" onchange="loadPOs(1)" class="rounded border-gray-300">
            <span style="white-space:nowrap;font-size:13px">포함</span>
          </label>
        </div>
        <div class="ds-filter-divider"></div>
        <div class="ds-filter-actions">
          <button onclick="poResetFilters()" class="ds-btn ds-btn-secondary ds-btn-sm">
            <i class="fas fa-undo" style="margin-right:4px"></i>초기화
          </button>
          <button onclick="loadPOs(1)" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-search" style="margin-right:4px"></i>검색
          </button>
          <a href="/purchase-order-form" class="ds-btn ds-btn-sm" style="background:var(--c-success);color:#fff;display:inline-flex;align-items:center;text-decoration:none;">
            <i class="fas fa-plus" style="margin-right:4px"></i>새 발주
          </a>
          <button onclick="openTemplateModal()" class="ds-btn ds-btn-secondary ds-btn-sm">
            <i class="fas fa-copy" style="margin-right:4px"></i>템플릿에서 생성
          </button>
          <button onclick="exportPoCsv()" class="ds-btn ds-btn-secondary ds-btn-sm">
            <i class="fas fa-file-csv" style="margin-right:4px"></i>CSV
          </button>
        </div>
      </div>

      <!-- 목록 도구모음: 프리셋 · 열 선택 · 페이지당 건수 -->
      <div id="poListToolbar"></div>

      <!-- 발주 목록 테이블 -->
      <div class="ds-card overflow-hidden">
        <div style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full text-sm ds-table ds-table-striped po-tbl">
          <thead class="bg-gray-50">
            <tr>
              <!-- data-col = '열 선택'(dsListToolbar) 대상. 작업 열은 숨김 대상에서 제외 -->
              <th class="col-code px-4 py-3 text-left" data-col="po_number">발주번호</th>
              <th class="col-name px-4 py-3 text-left" data-col="supplier">공급업체</th>
              <th class="col-date px-4 py-3 text-center" data-col="order_date">발주일</th>
              <th class="col-date px-4 py-3 text-center" data-col="expected">납기예정</th>
              <th class="col-amount px-4 py-3 text-right" data-col="amount">금액</th>
              <th class="col-status px-4 py-3 text-center" data-col="status">상태</th>
              <th class="col-action px-4 py-3 text-center">작업</th>
            </tr>
          </thead>
          <tbody id="poTableBody">
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
            <tr class="ds-skeleton-row"><td colspan="7" class="px-4 py-2"><div class="ds-skeleton h-8 rounded"></div></td></tr>
          </tbody>
        </table>
        </div>
        <!-- 합계 바 — 조회조건 전체 기준(현재 페이지 아님). 표 스크롤 영역 밖이라 항상 보인다 -->
        <div id="poSummaryBar" class="ds-summary"></div>
      </div>
      <div id="pagination" class="mt-4 flex justify-center"></div>

      <!-- 상세 모달 -->
      <div id="detailModal" class="ds-modal-overlay hidden">
        <div class="ds-modal max-h-[90vh] overflow-y-auto" style="max-width:48rem">
          <div class="p-6" id="detailContent"></div>
        </div>
      </div>

      <!-- 입고 처리 모달 -->
      <div id="receiveModal" class="ds-modal-overlay hidden">
        <div class="ds-modal max-h-[90vh] overflow-y-auto" style="max-width:56rem">
          <div class="p-6" id="receiveContent"></div>
        </div>
      </div>

      <!-- 템플릿 선택 모달 -->
      <div id="templateModal" class="ds-modal-overlay hidden">
        <div class="ds-modal max-h-[85vh] overflow-y-auto" style="max-width:42rem">
          <div class="p-6">
            <div class="flex justify-between items-center mb-4">
              <h3 class="font-bold text-lg"><i class="fas fa-copy text-green-600 mr-2"></i>템플릿에서 발주 생성</h3>
              <button onclick="closeTemplateModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div id="templateList" class="space-y-3 mb-4">
              <div class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin mr-2"></i>템플릿 로딩 중...</div>
            </div>
            <div id="templateDetail" class="hidden border-t pt-4 mt-4">
              <h4 class="font-medium text-sm mb-3"><i class="fas fa-list mr-1"></i>품목 (수량/단가 조정 가능)</h4>
              <div id="templateItems" class="space-y-2 mb-4"></div>
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label class="text-xs text-gray-500">납기예정일</label>
                  <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="tmplExpectedDate" class="js-fp w-full px-3 py-2 border rounded text-sm mt-1" />
                </div>
                <div>
                  <label class="text-xs text-gray-500">생성 상태</label>
                  <select id="tmplStatus" class="w-full px-3 py-2 border rounded text-sm mt-1">
                    <option value="DRAFT">임시저장</option>
                    <option value="CONFIRMED">즉시 확정</option>
                  </select>
                </div>
              </div>
              <div class="flex gap-2 justify-end">
                <button onclick="closeTemplateModal()" class="px-4 py-2 bg-gray-300 rounded text-sm hover:bg-gray-400">취소</button>
                <button onclick="createFromTemplate()" class="ds-btn ds-btn-primary ds-btn-sm">
                  <i class="fas fa-check mr-1"></i>발주 생성
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
