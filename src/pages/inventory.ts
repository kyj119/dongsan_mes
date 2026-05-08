import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import inventoryScript from '../scripts/inventory.js?raw'
import inventoryCountScript from '../scripts/inventoryCount.js?raw'

export function inventoryPage(c: Context<HonoEnv>) {
  const tabScript = `
    function switchInvTab(tab) {
      // Close any open modals when switching tabs
      document.querySelectorAll('.modal, [id$="Modal"]').forEach(function(m) {
        m.classList.add('hidden');
      });

      const stockTab = document.getElementById('tabStock');
      const countTab = document.getElementById('tabCount');
      const stockContent = document.getElementById('stockTabContent');
      const countContent = document.getElementById('countTabContent');

      if (tab === 'stock') {
        stockTab.classList.remove('border-transparent', 'text-gray-500');
        stockTab.classList.add('border-blue-600', 'text-blue-600');
        countTab.classList.remove('border-blue-600', 'text-blue-600');
        countTab.classList.add('border-transparent', 'text-gray-500');
        stockContent.classList.remove('hidden');
        countContent.classList.add('hidden');
        window.location.hash = '#tab=stock';
      } else if (tab === 'count') {
        countTab.classList.remove('border-transparent', 'text-gray-500');
        countTab.classList.add('border-blue-600', 'text-blue-600');
        stockTab.classList.remove('border-blue-600', 'text-blue-600');
        stockTab.classList.add('border-transparent', 'text-gray-500');
        stockContent.classList.add('hidden');
        countContent.classList.remove('hidden');
        window.location.hash = '#tab=count';
        if (typeof loadCounts === 'function') {
          loadCounts();
        }
      }
    }

    document.addEventListener('DOMContentLoaded', function() {
      const hash = window.location.hash;
      if (hash === '#tab=count') {
        setTimeout(() => switchInvTab('count'), 100);
      }
    });
  `;

  const combinedScript = tabScript + '\n' + inventoryScript + '\n' + inventoryCountScript;

  return renderPage(c, {
    title: '재고 관리',
    activePage: '/inventory',
    pageContent: `
            <!-- Tab Navigation -->
            <div class="flex border-b mb-6 bg-white rounded-t-lg shadow-lg">
              <button onclick="switchInvTab('stock')" id="tabStock" class="inv-tab px-6 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600 hover:text-blue-700">
                <i class="fas fa-boxes mr-2"></i>재고 현황
              </button>
              <button onclick="switchInvTab('count')" id="tabCount" class="inv-tab px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                <i class="fas fa-list-check mr-2"></i>재고실사
              </button>
            </div>

            <!-- Stock Tab Content -->
            <div id="stockTabContent" class="block">
            <!-- Statistics Section -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <div class="flex items-center justify-between mb-2">
                        <div class="text-sm text-gray-600">부족 품목</div>
                        <i class="fas fa-exclamation-triangle text-red-500 text-2xl"></i>
                    </div>
                    <div class="text-3xl font-bold text-red-600" id="lowStockItems">-</div>
                    <div class="text-xs text-gray-500 mt-1">안전 재고 미달</div>
                </div>
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <div class="flex items-center justify-between mb-2">
                        <div class="text-sm text-gray-600">최근 로스율</div>
                        <i class="fas fa-chart-line text-amber-500 text-2xl"></i>
                    </div>
                    <div class="text-3xl font-bold text-amber-600" id="lossRate">-</div>
                    <div class="text-xs text-gray-500 mt-1">실사 vs 이론 재고 차이</div>
                </div>
                <div class="bg-white rounded-lg shadow-lg p-6">
                    <div class="flex items-center justify-between mb-2">
                        <div class="text-sm text-gray-600">마지막 실사</div>
                        <i class="fas fa-clipboard-check text-blue-500 text-2xl"></i>
                    </div>
                    <div class="text-3xl font-bold text-gray-700" id="lastCountDate">-</div>
                    <div class="text-xs text-gray-500 mt-1">최근 재고 실사일</div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="bg-white rounded-lg shadow-lg p-4 mb-6">
                <div class="flex gap-4 flex-wrap">
                    <button id="adjustmentBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        <i class="fas fa-adjust mr-2"></i>재고 조정
                    </button>
                    <button id="refreshBtn" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                        <i class="fas fa-sync-alt mr-2"></i>새로고침
                    </button>
                </div>
            </div>

            <!-- Filters -->
            <div class="bg-white rounded-lg shadow-lg p-4 mb-6">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <select id="categoryFilter" class="px-4 py-2 border rounded">
                        <option value="">전체 카테고리</option>
                    </select>
                    <input type="text" id="searchInput" placeholder="품목명 검색" class="px-4 py-2 border rounded"
                        onkeyup="if(event.key==='Enter'){currentPage=1;loadInventory();}">
                    <select id="stockFilter" class="px-4 py-2 border rounded">
                        <option value="">재고 상태</option>
                        <option value="low">재고 부족</option>
                    </select>
                    <button id="searchBtn" class="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700">
                        <i class="fas fa-search mr-2"></i>조회
                    </button>
                </div>
            </div>

            <!-- Inventory Table -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-bold mb-4">
                    <i class="fas fa-list text-teal-600 mr-2"></i>재고 현황
                </h2>
                <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                    <table class="w-full text-sm ds-table-striped">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">품목명</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">카테고리</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">현재고</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">안전재고</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">재주문점</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">단가</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">보관위치</th>
                                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">액션</th>
                            </tr>
                        </thead>
                        <tbody id="inventoryTableBody" class="bg-white divide-y divide-gray-100">
                        </tbody>
                    </table>
                </div>

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
                  <div class="label"><i class="fas fa-list-check" style="color:#3b82f6;margin-right:4px"></i>총 실사 횟수</div>
                  <div class="value" style="color:#3b82f6" id="totalCounts">-</div>
                </div>
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-hourglass-half" style="color:#f59e0b;margin-right:4px"></i>진행중</div>
                  <div class="value" style="color:#f59e0b" id="inProgressCounts">-</div>
                </div>
                <div class="ds-card ds-card-compact summary-card">
                  <div class="label"><i class="fas fa-calendar" style="color:#16a34a;margin-right:4px"></i>최근 실사일</div>
                  <div class="value" style="color:#16a34a;font-size:16px" id="lastCountDate">-</div>
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
                    <i class="fas fa-list" style="color:#3b82f6;margin-right:8px"></i>실사 목록
                  </h2>
                </div>
                <div class="ds-table-wrap" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                  <table id="countTable" class="ds-table ds-table-compact ds-table-striped">
                    <thead>
                      <tr>
                        <th style="min-width:120px;">번호</th>
                        <th style="text-align:center;">날짜</th>
                        <th style="text-align:center;">유형</th>
                        <th style="text-align:center;">상태</th>
                        <th style="text-align:center;">항목수</th>
                        <th style="text-align:center;">제출자</th>
                        <th style="text-align:center;width:80px;">작업</th>
                      </tr>
                    </thead>
                    <tbody id="countBody">
                      <tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            <!-- 상세 패널 (우측 슬라이드) -->
            <div id="detailPanel" class="hidden" style="position:fixed;right:0;top:0;height:100vh;width:500px;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.12);z-index:60;overflow-y:auto;display:none;">
              <div style="padding:20px;">

                <!-- 패널 헤더 -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
                  <div>
                    <h3 id="panelCountNumber" style="font-size:18px;font-weight:700;color:#1e293b;"></h3>
                    <div id="panelCountDate" style="font-size:12px;color:#9ca3af;margin-top:2px;"></div>
                  </div>
                  <button onclick="closeDetailPanel()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#9ca3af;padding:4px;" title="닫기">
                    <i class="fas fa-times"></i>
                  </button>
                </div>

                <!-- 상태 뱃지 + 진행률 -->
                <div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
                  <span id="panelStatusBadge" style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:600;"></span>
                  <span id="panelProgress"></span>
                </div>

                <!-- 항목 목록 -->
                <div style="margin-bottom:20px;">
                  <h4 style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #f1f5f9;">
                    <i class="fas fa-boxes" style="margin-right:6px"></i>품목 실사 현황
                  </h4>
                  <div id="panelItems" style="max-height:400px;overflow-y:auto;"></div>
                </div>

                <!-- 액션 버튼 -->
                <div id="panelActions" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:20px;padding-top:12px;border-top:1px solid #f1f5f9;">
                </div>

              </div>
            </div>
            </div>

            <!-- 모든 모달들 (탭 콘텐츠 밖) -->
            <!-- Transaction History Modal -->
            <div id="transactionModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold">
                            <i class="fas fa-history text-teal-600 mr-2"></i>
                            거래 이력 - <span id="modalItemName"></span>
                        </h3>
                        <button id="closeModal" class="text-gray-500 hover:text-gray-700">
                            <i class="fas fa-times text-2xl"></i>
                        </button>
                    </div>
                    <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                        <table class="w-full text-sm ds-table-striped">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">일시</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">유형</th>
                                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">수량</th>
                                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500">잔액</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">사유</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">처리자</th>
                                </tr>
                            </thead>
                            <tbody id="transactionTableBody" class="bg-white divide-y divide-gray-100"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Receipt/Release 모달 제거됨 — 입고는 /receiving 페이지에서 처리 -->

            <!-- Adjustment Modal (재고 조정) -->
            <div id="adjustmentModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4">
                    <h3 class="text-xl font-bold mb-4"><i class="fas fa-adjust text-purple-600 mr-2"></i>재고 조정</h3>
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">품목 선택</label>
                                <select id="adjustItem" class="w-full px-3 py-2 border rounded">
                                    <option value="">품목 선택...</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">조정일</label>
                                <input type="date" id="adjustDate" class="w-full px-3 py-2 border rounded">
                            </div>
                        </div>
                        <div class="text-sm text-gray-600">현재고: <span id="adjustCurrentStock" class="font-bold">-</span></div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">조정 수량 (+/-)</label>
                                <input type="number" id="adjustQuantity" class="w-full px-3 py-2 border rounded" step="0.01" placeholder="+10 또는 -5">
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
                        <button id="submitAdjust" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">조정 등록</button>
                    </div>
                </div>
            </div>

            <!-- Settings Modal (안전재고/ROP 설정) -->
            <div id="settingsModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
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
                        <button id="submitSettings" class="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700">저장</button>
                    </div>
                </div>
            </div>
    `,
    pageScript: combinedScript
  })
}
