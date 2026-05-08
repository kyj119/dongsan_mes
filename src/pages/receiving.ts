import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/receiving.js?raw'

export function receivingPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '입고 관리',
    activePage: '/receiving',
    pageContent: `
      <!-- 탭 네비게이션 -->
      <div class="flex border-b mb-6 bg-white rounded-t-lg shadow-sm px-2">
        <button id="tabPending" onclick="switchTab('pending')"
          class="px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
          <i class="fas fa-clock mr-1"></i>입고대기
        </button>
        <button id="tabHistory" onclick="switchTab('history')"
          class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
          <i class="fas fa-history mr-1"></i>입고이력
        </button>
      </div>

      <!-- 입고대기 패널 -->
      <div id="panelPending">
        <!-- 통계 카드 3개 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-600"><i class="fas fa-clock text-blue-400 mr-1"></i>입고대기 PO</div>
            <div class="text-2xl font-bold text-blue-600" id="pendingCount">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-sm text-gray-600"><i class="fas fa-box-open text-amber-400 mr-1"></i>부분입고</div>
            <div class="text-2xl font-bold text-amber-600" id="partialCount">-</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <div class="text-sm text-gray-600"><i class="fas fa-exclamation-triangle text-red-400 mr-1"></i>납기지연</div>
            <div class="text-2xl font-bold text-red-600" id="overdueCount">-</div>
          </div>
        </div>

        <!-- 필터 토글: 내 담당 / 전체 -->
        <div class="bg-white rounded-lg shadow mb-4 p-2 flex items-center justify-between">
          <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden" role="tablist">
            <button id="scopeMineBtn" onclick="switchScope('mine')"
              class="px-4 py-2 text-sm font-medium bg-blue-600 text-white">
              <i class="fas fa-user-check mr-1"></i>내 담당 (<span id="scopeMineCount">0</span>)
            </button>
            <button id="scopeAllBtn" onclick="switchScope('all')"
              class="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <i class="fas fa-list mr-1"></i>전체 (<span id="scopeAllCount">0</span>)
            </button>
          </div>
          <button onclick="loadReceivingQueue()" class="text-sm text-gray-500 hover:text-gray-700">
            <i class="fas fa-sync mr-1"></i>새로고침
          </button>
        </div>

        <!-- PO 카드 목록 -->
        <div id="poCardList" class="space-y-3">
          <div class="text-center text-gray-400 py-12">로딩 중...</div>
        </div>
      </div>

      <!-- 입고이력 패널 -->
      <div id="panelHistory" class="hidden">
        <!-- 필터 바 -->
        <div class="bg-white rounded-lg shadow p-4 mb-4 flex items-center gap-3 flex-wrap">
          <input type="date" id="historyDateFrom" class="px-3 py-2 border rounded-lg text-sm">
          <span class="text-gray-400">~</span>
          <input type="date" id="historyDateTo" class="px-3 py-2 border rounded-lg text-sm">
          <select id="historyStatus" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">전체</option>
            <option value="PASSED">합격</option>
            <option value="PARTIAL">부분합격</option>
            <option value="FAILED">불합격</option>
          </select>
          <input type="text" id="historySearch" placeholder="발주번호, 공급업체 검색..."
            class="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[200px]"
            onkeyup="if(event.key==='Enter')loadReceiptHistory(1)">
          <button onclick="loadReceiptHistory(1)" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            <i class="fas fa-search mr-1"></i>조회
          </button>
        </div>

        <!-- 입고이력 테이블 -->
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left">입고번호</th>
                <th class="px-4 py-3 text-center">입고일</th>
                <th class="px-4 py-3 text-left">발주번호</th>
                <th class="px-4 py-3 text-left">공급업체</th>
                <th class="px-4 py-3 text-center">검수상태</th>
                <th class="px-4 py-3 text-center">합격수량</th>
                <th class="px-4 py-3 text-center">불합격수량</th>
                <th class="px-4 py-3 text-center">검수자</th>
              </tr>
            </thead>
            <tbody id="historyTableBody">
              <tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">탭을 선택하면 이력을 조회합니다.</td></tr>
            </tbody>
          </table>
        </div>
        <div id="historyPagination" class="mt-4 flex justify-center"></div>
      </div>

      <!-- 통합 입고 처리 모달 (발주 상세 + 입고 입력) -->
      <div id="receiveModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div class="p-6">
            <!-- 헤더 -->
            <div class="flex justify-between items-start mb-4">
              <h3 class="text-lg font-bold"><i class="fas fa-truck-loading text-blue-600 mr-2"></i>입고 처리</h3>
              <button onclick="closeReceiveModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <!-- PO 요약 정보 -->
            <div id="receivePoInfo" class="bg-gray-50 rounded-lg p-4 mb-4"></div>

            <!-- 입고 입력 영역 (입고 불가 상태면 숨김) -->
            <div id="receiveInputArea">
              <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">입고일</label>
                  <input type="date" id="receipt_date" class="w-full px-3 py-2 border rounded-lg text-sm">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">비고</label>
                  <textarea id="receipt_notes" rows="1" placeholder="비고 사항..."
                    class="w-full px-3 py-2 border rounded-lg text-sm resize-none"></textarea>
                </div>
              </div>

              <!-- 품목 테이블 헤더 + 전체 잔량 수령 버튼 -->
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-gray-700" id="receiveItemsCount">입고 품목</span>
                <button onclick="fillAllRemaining()" class="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-medium"><i class="fas fa-check-double mr-1"></i>전체 잔량 수령</button>
              </div>
              <div class="overflow-x-auto mb-4">
                <table class="w-full text-sm ds-table-striped">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-3 py-2 text-left">품목명</th>
                      <th class="px-3 py-2 text-center">발주수량</th>
                      <th class="px-3 py-2 text-center">기입고</th>
                      <th class="px-3 py-2 text-center">잔여</th>
                      <th class="px-3 py-2 text-center">이번 수령</th>
                    </tr>
                  </thead>
                  <tbody id="receiveItemsBody">
                    <tr><td colspan="5" class="px-3 py-4 text-center text-gray-400">품목 없음</td></tr>
                  </tbody>
                </table>
              </div>

              <!-- 단축키 안내 -->
              <div class="text-xs text-gray-400 mb-4 flex gap-4">
                <span><kbd class="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Tab</kbd> 다음 필드</span>
                <span><kbd class="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Enter</kbd> 다음 라인</span>
                <span><kbd class="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Ctrl+S</kbd> 입고 확정</span>
                <span><kbd class="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Esc</kbd> 취소</span>
              </div>

              <!-- 버튼 -->
              <div class="flex justify-end gap-3">
                <button onclick="closeReceiveModal()" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">취소</button>
                <button onclick="submitReceive()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium">
                  <i class="fas fa-check mr-1"></i>입고 확정
                </button>
              </div>
            </div>

            <!-- 상세 전용 영역 (입고 불가 상태) -->
            <div id="receiveDetailOnly" class="hidden">
              <div id="detailItems" class="mb-4"></div>
              <div id="detailInspections" class="mb-4"></div>
              <div class="flex justify-end">
                <button onclick="closeReceiveModal()" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm">닫기</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 검수 결과 등록 모달 (입고 후 자동 트리거) -->
      <div id="inspectionEntryModal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center" onclick="if(event.target===this)receivingCloseInspectionModal()">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div id="inspectionEntryBody"></div>
        </div>
      </div>
    `,
    pageScript
  })
}
