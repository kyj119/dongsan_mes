import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import taxScript from '../scripts/taxInvoices.js?raw'
import cashReceiptsScript from '../scripts/cashReceipts.js?raw'
import hometaxScript from '../scripts/hometaxInvoices.js?raw'

export function taxInvoicesPage(c: Context<HonoEnv>) {
  const pageContent = `
    <!-- 상위 탭 -->
    <div class="flex border-b mb-4">
      <button onclick="switchTaxTab('tax')" id="taxTabTax" class="px-5 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
        <i class="fas fa-file-invoice mr-1"></i>세금계산서
      </button>
      <button onclick="switchTaxTab('cash')" id="taxTabCash" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
        <i class="fas fa-receipt mr-1"></i>현금영수증
      </button>
      <button onclick="switchTaxTab('hometax')" id="taxTabHometax" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
        <i class="fas fa-cloud-download-alt mr-1"></i>홈택스 수집
      </button>
    </div>

    <!-- 세금계산서 탭 -->
    <div id="taxTaxContent">
      <!-- 메인 탭 헤더 -->
      <div class="flex border-b mb-4">
        <button id="mainTabBilling" onclick="switchMainTab('billing')"
          class="px-5 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
          <i class="fas fa-check-double mr-1"></i>회계반영 <span id="billingTabBadge" class="hidden ml-1 px-1.5 py-0.5 text-xs rounded-full bg-red-500 text-white font-bold">0</span>
        </button>
        <button id="mainTabUnbilled" onclick="switchMainTab('unbilled')"
          class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-file-invoice mr-1"></i>계산서 발행 <span id="unbilledTabBadge" class="hidden ml-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-500 text-white font-bold">0</span>
        </button>
        <button id="mainTabList" onclick="switchMainTab('list')"
          class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-list mr-1"></i>발행 이력
        </button>
        <button id="mainTabMonthly" onclick="switchMainTab('monthly')"
          class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-calendar-alt mr-1"></i>월합산
        </button>
      </div>

    <!-- ===== 회계반영 대기 패널 ===== -->
    <div id="panelBilling">
      <!-- 알림 배너 -->
      <div id="billingAlertBanner" class="hidden bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4">
        <div class="flex items-center gap-3">
          <i class="fas fa-exclamation-triangle text-amber-500 text-lg"></i>
          <div>
            <div class="text-sm font-bold text-amber-800">회계반영 대기 <span id="billingAlertCount" class="text-red-600">0</span>건</div>
            <div class="text-xs text-amber-600">출고 완료 후 회계반영이 필요한 주문입니다. 총 <span id="billingAlertAmount" class="font-medium">0</span>원</div>
          </div>
          <div class="ml-auto text-xs text-amber-500" id="billingWaitingInfo"></div>
        </div>
      </div>

      <!-- 동기화 바 -->
      <div id="billingSyncBar" class="hidden bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-indigo-700">
            <i class="fas fa-sync-alt mr-1"></i>상태 동기화: 출고완료 → 회계반영 자동 전이
          </span>
          <div class="flex items-center gap-2">
            <span id="syncLastTimeInvoice" class="text-xs text-gray-400"></span>
            <button onclick="runSyncFromInvoicePage()" class="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 font-medium">
              <i class="fas fa-sync-alt mr-1"></i>동기화 실행
            </button>
          </div>
        </div>
      </div>

      <!-- 거래처별 주문 목록 -->
      <div id="billingOrdersList">
        <div class="text-center py-12 text-gray-400 text-sm">
          <i class="fas fa-spinner fa-spin text-2xl mb-3 block"></i>로딩 중...
        </div>
      </div>

      <!-- 하단 일괄 회계반영 바 -->
      <div id="billingBar" class="ds-bulk-bar">
        <div class="ds-bulk-bar-count" style="color:var(--c-success)">
          <i class="fas fa-check-square"></i>
          <span>선택: <span id="billingSelCount">0</span>건 / <span id="billingSelAmount">0</span>원</span>
        </div>
        <div class="ds-bulk-bar-divider"></div>
        <div class="ds-bulk-bar-actions">
          <select id="billingReceiptType" class="ds-input" style="width:auto;min-height:32px;padding:4px 10px;font-size:var(--fs-xs)">
            <option value="">증빙 유형</option>
            <option value="TAX_INVOICE">세금계산서</option>
            <option value="CASH_RECEIPT">현금영수증</option>
            <option value="CARD">카드</option>
            <option value="SIMPLE">간이영수증</option>
          </select>
          <button onclick="submitBulkBilling()" class="ds-btn ds-btn-sm" style="background:var(--c-success);color:#fff">
            <i class="fas fa-check-double" style="margin-right:4px"></i>선택 회계반영
          </button>
        </div>
      </div>
      <div id="billingBarSpacer" class="ds-bulk-bar-spacer"></div>
    </div>

    <!-- ===== 발행 목록 패널 ===== -->
    <div id="panelList" class="hidden">
      <!-- 툴바 -->
      <div class="ds-filter-bar">
        <div class="ds-filter-field" style="min-width:120px">
          <label class="ds-label">상태</label>
          <select id="statusFilter" onchange="loadInvoices(1)" class="ds-input">
            <option value="">전체</option>
            <option value="DRAFT">작성중</option>
            <option value="ISSUED">발행완료</option>
            <option value="SENT">전송완료</option>
            <option value="FAILED">전송실패</option>
            <option value="NTS_SUCCESS">국세청 전송성공</option>
            <option value="NTS_FAILED">국세청 전송실패</option>
            <option value="CANCELLED">취소</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">기간 from</label>
          <input type="date" id="dateFrom" onchange="loadInvoices(1)" class="ds-input">
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">~ to</label>
          <input type="date" id="dateTo" onchange="loadInvoices(1)" class="ds-input">
        </div>
        <div class="ds-filter-field" style="flex:1;min-width:200px">
          <label class="ds-label">검색</label>
          <input type="text" id="searchInput" placeholder="거래처 / 주문번호..."
            class="ds-input" onkeydown="if(event.key==='Enter')loadInvoices(1)">
        </div>
        <div class="ds-filter-actions">
          <button onclick="switchMainTab('unbilled')" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-plus" style="margin-right:4px"></i>새 세금계산서
          </button>
        </div>
      </div>

      <!-- 목록 테이블 -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <table class="w-full text-sm ds-table-striped">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left">관리번호</th>
              <th class="px-4 py-3 text-left">주문번호</th>
              <th class="px-4 py-3 text-left">거래처</th>
              <th class="px-4 py-3 text-center">작성일</th>
              <th class="px-4 py-3 text-right">공급가액</th>
              <th class="px-4 py-3 text-right">세액</th>
              <th class="px-4 py-3 text-right">합계</th>
              <th class="px-4 py-3 text-center">상태</th>
              <th class="px-4 py-3 text-center">액션</th>
            </tr>
          </thead>
          <tbody id="invoiceTableBody">
            <tr><td colspan="9" class="px-4 py-8 text-center text-gray-500">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>
      <div id="pagination" class="mt-4 flex justify-center gap-1"></div>
    </div>

    <!-- ===== 미발행 관리 패널 ===== -->
    <div id="panelUnbilled" class="hidden">
      <!-- 검색 조건 바 -->
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">기간 시작</label>
            <input type="date" id="unbilledFrom" class="px-3 py-2 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">기간 종료</label>
            <input type="date" id="unbilledTo" class="px-3 py-2 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">작성일 (발행 시 적용)</label>
            <input type="date" id="unbilledIssueDate" class="px-3 py-2 border rounded-lg text-sm">
          </div>
          <button onclick="loadUnbilled()" class="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">
            <i class="fas fa-search mr-1"></i>조회
          </button>
        </div>
        <!-- 요약 -->
        <div id="unbilledSummary" class="hidden mt-3 pt-3 border-t text-sm text-gray-600">
          미발행 요약: <span id="summaryText" class="font-medium text-gray-800"></span>
        </div>
      </div>

      <!-- 거래처별 아코디언 목록 -->
      <div id="unbilledAccordion">
        <div class="text-center py-12 text-gray-400 text-sm">
          <i class="fas fa-search text-3xl mb-3 block"></i>
          기간을 선택하고 조회 버튼을 클릭하세요.
        </div>
      </div>

      <!-- 하단 일괄 발행 바 -->
      <div id="batchBar" class="ds-bulk-bar">
        <div class="ds-bulk-bar-count">
          <i class="fas fa-paper-plane"></i>
          <span>선택: <span id="batchSelClients">0</span>개 거래처 / <span id="batchSelOrders">0</span>건 / <span id="batchSelAmount">0</span>원</span>
        </div>
        <div class="ds-bulk-bar-end">
          <button onclick="submitBatchIssue()" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-paper-plane" style="margin-right:4px"></i>선택 일괄 발행
          </button>
        </div>
      </div>
      <div id="batchBarSpacer" class="ds-bulk-bar-spacer"></div>
    </div>

    <!-- ===== 상세 모달 ===== -->
    <div id="detailModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="p-6" id="detailContent"></div>
      </div>
    </div>

    <!-- ===== 수정발행 모달 ===== -->
    <div id="modifyModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold"><i class="fas fa-edit text-orange-500 mr-2"></i>수정 세금계산서 발행</h3>
            <button onclick="document.getElementById('modifyModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
          </div>
          <div id="modifyOriginalInfo" class="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600"></div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">수정 사유 코드 <span class="text-red-500">*</span></label>
            <select id="modifyCode" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="1">1. 기재사항착오정정</option>
              <option value="2">2. 공급가액변동</option>
              <option value="3">3. 환입</option>
              <option value="4">4. 계약해제</option>
              <option value="5">5. 내국신용장사후개설</option>
              <option value="6">6. 착오에의한이중발행</option>
            </select>
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">작성일 <span class="text-red-500">*</span></label>
            <input type="date" id="modifyIssueDate" class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1">비고</label>
            <textarea id="modifyNotes" rows="2" placeholder="수정 사유 상세 (선택)" class="w-full px-3 py-2 border rounded-lg text-sm resize-none"></textarea>
          </div>
          <div class="flex justify-end gap-3">
            <button onclick="document.getElementById('modifyModal').classList.add('hidden')"
              class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">취소</button>
            <button onclick="submitModify()"
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">
              <i class="fas fa-edit mr-1"></i>수정 계산서 생성
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 취소 모달 ===== -->
    <div id="cancelModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 class="text-lg font-bold mb-4"><i class="fas fa-ban text-red-600 mr-2"></i>세금계산서 취소</h3>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">취소 사유 <span class="text-red-500">*</span></label>
          <textarea id="cancelReason" rows="3" placeholder="취소 사유를 입력하세요." class="w-full px-3 py-2 border rounded-lg text-sm resize-none"></textarea>
        </div>
        <div class="flex justify-end gap-3">
          <button onclick="document.getElementById('cancelModal').classList.add('hidden')"
            class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">닫기</button>
          <button onclick="submitCancel()"
            class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium">취소 처리</button>
        </div>
      </div>
    </div>

    <!-- ===== 월합산 발행 패널 ===== -->
    <div id="panelMonthly" class="hidden">
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <div class="flex items-center gap-3 flex-wrap">
          <label class="text-sm font-medium text-gray-700">발행 대상 월:</label>
          <input type="month" id="monthlyPeriod" class="px-3 py-2 border rounded-lg text-sm" />
          <button onclick="loadMonthlyEligible()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <i class="fas fa-search mr-1"></i>조회
          </button>
          <div class="ml-auto">
            <button onclick="createMonthlyInvoices(false)" id="btnMonthlyCreate" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 hidden">
              <i class="fas fa-file-invoice mr-1"></i>일괄 생성 (임시저장)
            </button>
            <button onclick="createMonthlyInvoices(true)" id="btnMonthlyIssue" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 hidden ml-2">
              <i class="fas fa-paper-plane mr-1"></i>일괄 생성+발행
            </button>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-2">* 거래처 상세에서 계산서 유형을 '월합산'으로 설정한 거래처만 표시됩니다.</p>
      </div>
      <div id="monthlyContent">
        <div class="text-center text-gray-400 py-8">대상 월을 선택하고 조회하세요.</div>
      </div>
    </div>

    <!-- ===== 일괄 발행 결과 모달 ===== -->
    <div id="batchResultModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold"><i class="fas fa-check-circle text-green-600 mr-2"></i>일괄 발행 결과</h3>
          <button onclick="document.getElementById('batchResultModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div id="batchResultContent" class="text-sm"></div>
        <div class="flex justify-end mt-4">
          <button onclick="document.getElementById('batchResultModal').classList.add('hidden');loadInvoices(1)"
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">확인</button>
        </div>
      </div>
    </div>
    </div>

    <!-- 현금영수증 탭 -->
    <div id="taxCashContent" class="hidden">
      <!-- Header -->
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">현금영수증</h2>
        <p class="text-gray-600 mt-1">현금거래 기록 및 현금영수증 발행 관리</p>
      </div>

      <!-- Filter Bar -->
      <div class="bg-white rounded-lg border shadow-sm p-4 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <!-- Status Filter -->
          <div>
            <label for="statusFilter" class="block text-sm font-medium text-gray-700 mb-1">상태</label>
            <select id="statusFilter" class="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white">
              <option value="">전체</option>
              <option value="DRAFT">작성중</option>
              <option value="ISSUED">발행완료</option>
              <option value="FAILED">전송실패</option>
              <option value="CANCELLED">취소</option>
              <option value="NTS_SUCCESS">국세청 전송성공</option>
              <option value="NTS_FAILED">국세청 전송실패</option>
            </select>
          </div>

          <!-- Date Range -->
          <div>
            <label for="dateFrom" class="block text-sm font-medium text-gray-700 mb-1">시작일</label>
            <input type="date" id="dateFrom" class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
          </div>
          <div>
            <label for="dateTo" class="block text-sm font-medium text-gray-700 mb-1">종료일</label>
            <input type="date" id="dateTo" class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
          </div>

          <!-- Search -->
          <div>
            <label for="searchInput" class="block text-sm font-medium text-gray-700 mb-1">검색</label>
            <input type="text" id="searchInput" placeholder="거래처명 또는 식별번호" class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
          </div>

          <!-- Actions -->
          <div class="flex items-end">
            <button onclick="loadReceipts(1)" class="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 mr-2">
              <i class="fas fa-search mr-2"></i>검색
            </button>
            <button onclick="openCreateModal()" class="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700">
              <i class="fas fa-plus mr-2"></i>새 현금영수증
            </button>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
          <table class="w-full ds-table-striped">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">관리번호</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">거래처</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">거래일</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">식별유형</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600">공급가액</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600">세액</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-gray-600">합계</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600">상태</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600">액션</th>
              </tr>
            </thead>
            <tbody id="receiptsTable">
              <tr>
                <td colspan="9" class="px-4 py-8 text-center text-gray-500">
                  <i class="fas fa-spinner fa-spin mr-2"></i>로딩 중...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pagination -->
      <div class="mt-6 flex justify-center">
        <div id="pagination" class="flex gap-2">
          <!-- Pagination links will be inserted here -->
        </div>
      </div>

      <!-- Create Modal -->
      <div id="createModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 class="text-lg font-bold text-gray-900">새 현금영수증</h2>
            <button onclick="document.getElementById('createModal').classList.add('hidden')" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>

          <div class="px-6 py-4 space-y-4">
            <!-- Client Selection (Optional) -->
            <div>
              <label for="clientSelect" class="block text-sm font-medium text-gray-700 mb-1">거래처 (선택사항)</label>
              <select id="clientSelect" class="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white">
                <option value="">거래처를 선택하세요</option>
              </select>
            </div>

            <!-- Transaction Date -->
            <div>
              <label for="transactionDate" class="block text-sm font-medium text-gray-700 mb-1">거래일 <span class="text-red-500">*</span></label>
              <input type="date" id="transactionDate" class="w-full border border-gray-300 rounded px-3 py-2 text-sm" required>
            </div>

            <!-- Transaction Type -->
            <div>
              <label for="transactionType" class="block text-sm font-medium text-gray-700 mb-1">거래유형 <span class="text-red-500">*</span></label>
              <select id="transactionType" class="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white" required>
                <option value="">선택하세요</option>
                <option value="EXPENSE">지출</option>
                <option value="INCOME">수입</option>
              </select>
            </div>

            <!-- Identity Type -->
            <div>
              <label for="identityType" class="block text-sm font-medium text-gray-700 mb-1">식별유형 <span class="text-red-500">*</span></label>
              <select id="identityType" class="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white" required>
                <option value="">선택하세요</option>
                <option value="PHONE">휴대폰</option>
                <option value="CARD">카드번호</option>
                <option value="BRN">사업자번호</option>
                <option value="RESIDENT">주민번호</option>
              </select>
            </div>

            <!-- Identity Number -->
            <div>
              <label for="identityNumber" class="block text-sm font-medium text-gray-700 mb-1">식별번호 <span class="text-red-500">*</span></label>
              <input type="text" id="identityNumber" class="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="예: 010-1234-5678" required>
            </div>

            <!-- Supply Amount -->
            <div>
              <label for="supplyAmount" class="block text-sm font-medium text-gray-700 mb-1">공급가액 <span class="text-red-500">*</span></label>
              <input type="text" inputmode="numeric" data-money id="supplyAmount" class="w-full border border-gray-300 rounded px-3 py-2 text-sm" onchange="calcTax()" onkeyup="calcTax()" required>
            </div>

            <!-- Tax -->
            <div>
              <label for="taxAmount" class="block text-sm font-medium text-gray-700 mb-1">세액</label>
              <input type="text" inputmode="numeric" data-money id="taxAmount" class="w-full border border-gray-300 rounded px-3 py-2 text-sm" readonly>
            </div>

            <!-- Total -->
            <div>
              <label for="totalAmount" class="block text-sm font-medium text-gray-700 mb-1">합계</label>
              <input type="text" inputmode="numeric" data-money id="totalAmount" class="w-full border border-gray-300 rounded px-3 py-2 text-sm" readonly>
            </div>

            <!-- Service Charge -->
            <div>
              <label for="serviceCharge" class="block text-sm font-medium text-gray-700 mb-1">봉사료</label>
              <input type="text" inputmode="numeric" data-money id="serviceCharge" class="w-full border border-gray-300 rounded px-3 py-2 text-sm" value="0" onchange="calcTax()" onkeyup="calcTax()">
            </div>

            <!-- Item Name -->
            <div>
              <label for="itemName" class="block text-sm font-medium text-gray-700 mb-1">품목명</label>
              <input type="text" id="itemName" class="w-full border border-gray-300 rounded px-3 py-2 text-sm">
            </div>

            <!-- Memo -->
            <div>
              <label for="memo" class="block text-sm font-medium text-gray-700 mb-1">메모</label>
              <textarea id="memo" class="w-full border border-gray-300 rounded px-3 py-2 text-sm" rows="3"></textarea>
            </div>
          </div>

          <div class="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
            <button onclick="document.getElementById('createModal').classList.add('hidden')" class="border border-gray-300 text-gray-700 bg-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-50">
              취소
            </button>
            <button onclick="createReceipt()" class="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700">
              <i class="fas fa-save mr-2"></i>작성
            </button>
          </div>
        </div>
      </div>

      <!-- Detail Modal -->
      <div id="detailModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 class="text-lg font-bold text-gray-900">현금영수증 상세</h2>
            <button onclick="document.getElementById('detailModal').classList.add('hidden')" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>

          <div id="detailContent" class="px-6 py-4 space-y-4">
            <!-- Detail content will be inserted here -->
          </div>

          <div class="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end" id="detailActions">
            <!-- Action buttons will be inserted here -->
          </div>
        </div>
      </div>
    </div>

    <!-- 홈택스 탭 -->
    <div id="taxHometaxContent" class="hidden">
      <!-- Page Header -->
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">홈택스 세금계산서 수집</h2>
        <p class="text-sm text-gray-600 mt-1">국세청 홈택스에서 세금계산서를 자동 수집 및 대조</p>
      </div>

      <!-- Tab Navigation -->
      <div class="bg-white rounded-t-lg border-b">
        <div class="flex">
          <button id="tabCollect" class="tab-btn active px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600"
            onclick="switchTab('collect')">
            <i class="fas fa-cloud-download-alt mr-2"></i>수집 관리
          </button>
          <button id="tabInvoices" class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            onclick="switchTab('invoices')">
            <i class="fas fa-list mr-2"></i>수집 내역
          </button>
          <button id="tabCompare" class="tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            onclick="switchTab('compare')">
            <i class="fas fa-balance-scale mr-2"></i>대조 비교
          </button>
        </div>
      </div>

      <!-- Tab 1: 수집 관리 -->
      <div id="panelCollect" class="tab-content active bg-white border border-t-0 rounded-b-lg p-6 mb-6">
        <!-- Collection Request Card -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6">
          <h3 class="font-semibold text-gray-900 mb-4 flex items-center">
            <i class="fas fa-cloud-upload-alt text-blue-600 mr-2"></i>수집 요청
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label class="form-label">유형</label>
              <select id="collectType" class="form-select">
                <option value="SALES">매출</option>
                <option value="PURCHASE">매입</option>
              </select>
            </div>
            <div>
              <label class="form-label">시작일</label>
              <input type="date" id="collectStartDate" class="form-input">
            </div>
            <div>
              <label class="form-label">종료일</label>
              <input type="date" id="collectEndDate" class="form-input">
            </div>
            <div class="flex items-end">
              <button onclick="requestCollection()" class="btn-primary w-full">
                <i class="fas fa-sync-alt mr-1"></i>수집 요청
              </button>
            </div>
          </div>
        </div>

        <!-- Collection Jobs Table -->
        <div class="mb-4">
          <h3 class="font-semibold text-gray-900 mb-3 flex items-center">
            <i class="fas fa-tasks text-gray-700 mr-2"></i>수집 작업 목록
          </h3>
        </div>
        <div class="bg-white rounded-lg border overflow-hidden shadow-sm">
          <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
            <table class="w-full ds-table-striped">
              <thead class="table-header">
                <tr>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">작업ID</th>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">유형</th>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">기간</th>
                  <th class="text-center text-xs font-semibold text-gray-600 uppercase">상태</th>
                  <th class="text-right text-xs font-semibold text-gray-600 uppercase">결과</th>
                  <th class="text-right text-xs font-semibold text-gray-600 uppercase">건수</th>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">요청자</th>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">요청일</th>
                  <th class="text-center text-xs font-semibold text-gray-600 uppercase">액션</th>
                </tr>
              </thead>
              <tbody id="jobsTableBody">
                <tr class="table-row">
                  <td colspan="9" class="text-center text-gray-500 py-8">로드 중...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Auth Management -->
        <div class="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-semibold text-gray-900 flex items-center">
                <i class="fas fa-lock text-amber-600 mr-2"></i>인증 관리
              </h4>
              <p class="text-sm text-gray-600 mt-1">홈택스 공동인증서 설정 및 갱신</p>
            </div>
            <button onclick="openCertPopup()" class="btn-cert">
              <i class="fas fa-key mr-1"></i>인증 관리
            </button>
          </div>
        </div>
      </div>

      <!-- Tab 2: 수집 내역 -->
      <div id="panelInvoices" class="tab-content hidden bg-white border rounded-lg p-6 mb-6">
        <!-- Filter Bar -->
        <div class="bg-gray-50 rounded-lg p-4 mb-4">
          <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label class="form-label">유형</label>
              <select id="invoiceFilterType" class="form-select" onchange="loadInvoices(1)">
                <option value="">전체</option>
                <option value="SALES">매출</option>
                <option value="PURCHASE">매입</option>
              </select>
            </div>
            <div>
              <label class="form-label">시작일</label>
              <input type="date" id="invoiceFilterStartDate" class="form-input" onchange="loadInvoices(1)">
            </div>
            <div>
              <label class="form-label">종료일</label>
              <input type="date" id="invoiceFilterEndDate" class="form-input" onchange="loadInvoices(1)">
            </div>
            <div>
              <label class="form-label">매칭 상태</label>
              <select id="invoiceFilterMatchStatus" class="form-select" onchange="loadInvoices(1)">
                <option value="">전체</option>
                <option value="UNMATCHED">미매칭</option>
                <option value="MATCHED">매칭</option>
                <option value="MISMATCH">불일치</option>
              </select>
            </div>
            <div>
              <label class="form-label">검색</label>
              <input type="text" id="invoiceFilterSearch" class="form-input" placeholder="승인번호/회사명" onchange="loadInvoices(1)">
            </div>
          </div>
        </div>

        <!-- Invoices Table -->
        <div class="bg-white rounded-lg border overflow-hidden shadow-sm">
          <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
            <table class="w-full ds-table-striped">
              <thead class="table-header">
                <tr>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">승인번호</th>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">유형</th>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">작성일</th>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">공급자</th>
                  <th class="text-left text-xs font-semibold text-gray-600 uppercase">공급받는자</th>
                  <th class="text-right text-xs font-semibold text-gray-600 uppercase">공급가액</th>
                  <th class="text-right text-xs font-semibold text-gray-600 uppercase">세액</th>
                  <th class="text-right text-xs font-semibold text-gray-600 uppercase">합계</th>
                  <th class="text-center text-xs font-semibold text-gray-600 uppercase">매칭</th>
                  <th class="text-center text-xs font-semibold text-gray-600 uppercase">액션</th>
                </tr>
              </thead>
              <tbody id="invoicesTableBody">
                <tr class="table-row">
                  <td colspan="10" class="text-center text-gray-500 py-8">로드 중...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-between mt-4">
          <div id="paginationInfo" class="text-sm text-gray-600"></div>
          <div class="flex gap-2">
            <button onclick="loadInvoices(currentPage - 1)" class="btn-secondary btn-sm">이전</button>
            <span id="pageDisplay" class="px-2 py-1 text-sm text-gray-600"></span>
            <button onclick="loadInvoices(currentPage + 1)" class="btn-secondary btn-sm">다음</button>
          </div>
        </div>
      </div>

      <!-- Tab 3: 대조 비교 -->
      <div id="panelCompare" class="tab-content hidden bg-white border rounded-lg p-6 mb-6">
        <!-- Comparison Controls -->
        <div class="bg-gray-50 rounded-lg p-4 mb-6">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label class="form-label">월 선택</label>
              <input type="month" id="compareMonth" class="form-input">
            </div>
            <div>
              <label class="form-label">유형</label>
              <select id="compareType" class="form-select">
                <option value="">전체</option>
                <option value="SALES">매출</option>
                <option value="PURCHASE">매입</option>
              </select>
            </div>
            <div class="flex items-end">
              <button onclick="loadComparison()" class="btn-primary w-full">
                <i class="fas fa-sync-alt mr-1"></i>비교 실행
              </button>
            </div>
          </div>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="compareSummary">
          <div class="kpi-card bg-blue-50 border border-blue-200">
            <div class="text-xs font-medium text-blue-700">홈택스 건수</div>
            <div class="text-2xl font-bold text-blue-600" id="hometaxCount">-</div>
          </div>
          <div class="kpi-card bg-gray-50 border border-gray-200">
            <div class="text-xs font-medium text-gray-700">시스템 건수</div>
            <div class="text-2xl font-bold text-gray-600" id="systemCount">-</div>
          </div>
          <div class="kpi-card bg-green-50 border border-green-200">
            <div class="text-xs font-medium text-green-700">매칭 완료</div>
            <div class="text-2xl font-bold text-green-600" id="matchedCount">-</div>
          </div>
          <div class="kpi-card bg-red-50 border border-red-200">
            <div class="text-xs font-medium text-red-700">불일치</div>
            <div class="text-2xl font-bold text-red-600" id="mismatchCount">-</div>
          </div>
        </div>

        <!-- Comparison Results -->
        <div class="space-y-6">
          <!-- 매칭 완료 -->
          <div>
            <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
              <i class="fas fa-check-circle text-green-600 mr-2"></i>매칭 완료
            </h4>
            <div class="bg-white rounded-lg border overflow-hidden shadow-sm">
              <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                <table class="w-full ds-table-striped">
                  <thead class="table-header">
                    <tr>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">홈택스 승인번호</th>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">시스템 관리번호</th>
                      <th class="text-right text-xs font-semibold text-gray-600 uppercase">금액</th>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">공급자</th>
                    </tr>
                  </thead>
                  <tbody id="matchedTableBody">
                    <tr class="table-row"><td colspan="4" class="text-center text-gray-500 py-6">데이터 없음</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 홈택스에만 존재 -->
          <div>
            <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
              <i class="fas fa-exclamation-circle text-amber-600 mr-2"></i>홈택스에만 존재
            </h4>
            <div class="bg-white rounded-lg border overflow-hidden shadow-sm">
              <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                <table class="w-full ds-table-striped">
                  <thead class="table-header">
                    <tr>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">승인번호</th>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">공급자</th>
                      <th class="text-right text-xs font-semibold text-gray-600 uppercase">금액</th>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">작성일</th>
                    </tr>
                  </thead>
                  <tbody id="hometaxOnlyTableBody">
                    <tr class="table-row"><td colspan="4" class="text-center text-gray-500 py-6">데이터 없음</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 시스템에만 존재 -->
          <div>
            <h4 class="font-semibold text-gray-900 mb-3 flex items-center">
              <i class="fas fa-exclamation-circle text-red-600 mr-2"></i>시스템에만 존재
            </h4>
            <div class="bg-white rounded-lg border overflow-hidden shadow-sm">
              <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                <table class="w-full ds-table-striped">
                  <thead class="table-header">
                    <tr>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">관리번호</th>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">공급자</th>
                      <th class="text-right text-xs font-semibold text-gray-600 uppercase">금액</th>
                      <th class="text-left text-xs font-semibold text-gray-600 uppercase">작성일</th>
                    </tr>
                  </thead>
                  <tbody id="systemOnlyTableBody">
                    <tr class="table-row"><td colspan="4" class="text-center text-gray-500 py-6">데이터 없음</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Match Modal -->
      <div id="matchModal" class="modal-overlay">
        <div class="modal-box">
          <h3 class="text-lg font-bold text-gray-900 mb-4">
            <i class="fas fa-link text-blue-600 mr-2"></i>매칭 정보 입력
          </h3>
          <div class="mb-4">
            <label class="form-label">세금계산서 관리번호 (시스템)</label>
            <input type="text" id="matchTaxInvoiceId" class="form-input" placeholder="예: TAX-2024-001234">
          </div>
          <div class="flex gap-2 justify-end">
            <button onclick="closeMatchModal()" class="btn-secondary">취소</button>
            <button onclick="confirmMatch()" class="btn-primary">매칭</button>
          </div>
        </div>
      </div>
    </div>
  `

  // 탭 전환 스크립트
  const tabSwitchScript = `
  window.switchTaxTab = function(tab) {
    var tabs = ['tax', 'cash', 'hometax'];
    tabs.forEach(function(t) {
      var contentId = 'tax' + t.charAt(0).toUpperCase() + t.slice(1) + 'Content';
      var tabBtnId = 'taxTab' + t.charAt(0).toUpperCase() + t.slice(1);
      var content = document.getElementById(contentId);
      var tabBtn = document.getElementById(tabBtnId);
      if (t === tab) {
        if (content) content.classList.remove('hidden');
        if (tabBtn) {
          tabBtn.classList.remove('border-transparent', 'text-gray-500');
          tabBtn.classList.add('border-blue-600', 'text-blue-600');
        }
      } else {
        if (content) content.classList.add('hidden');
        if (tabBtn) {
          tabBtn.classList.remove('border-blue-600', 'text-blue-600');
          tabBtn.classList.add('border-transparent', 'text-gray-500');
        }
      }
    });
  };
  (function() {
    var p = new URLSearchParams(window.location.search);
    var tab = p.get('tab');
    if (tab === 'cash' || window.location.hash === '#cash') {
      window.switchTaxTab('cash');
    } else if (tab === 'hometax' || window.location.hash === '#hometax') {
      window.switchTaxTab('hometax');
    }
  })();
  `;

  const combinedScript = tabSwitchScript + '\n' + taxScript + '\n' + cashReceiptsScript + '\n' + hometaxScript;

  return renderPage(c, {
    title: '세금 증빙',
    activePage: '/tax-invoices',
    pageContent,
    pageScript: combinedScript,
  })
}
