import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/clientDetail.js?raw'

export function clientDetailPage(c: Context<HonoEnv>) {
  const clientId = parseInt(c.req.param('id') || '0', 10) || 0
  return renderPage(c, {
    title: '거래처 상세',
    activePage: '/clients',
    pageContent: `
      <div id="loadingMsg" class="text-center py-12 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>로딩 중...</div>
      <div id="detailContent" class="hidden">

        <!-- Client Header -->
        <div class="bg-white rounded-lg shadow p-5 mb-4">
          <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h2 class="text-2xl font-bold" id="cdClientName">-</h2>
              <div class="text-sm text-gray-500 mt-1" id="cdClientCode">-</div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <!-- KPI 인라인 -->
              <div class="text-right">
                <div class="text-xs text-gray-500">미수금</div>
                <div class="text-lg font-bold text-red-600" id="cdBalance">-</div>
              </div>
              <div class="w-px h-8 bg-gray-300 hidden sm:block"></div>
              <div class="text-right">
                <div class="text-xs text-gray-500">총 매출</div>
                <div class="text-lg font-bold text-blue-600" id="cdTotalBilled">-</div>
              </div>
              <div class="w-px h-8 bg-gray-300 hidden sm:block"></div>
              <div class="text-right">
                <div class="text-xs text-gray-500">신용</div>
                <div class="text-lg font-bold" id="cdCreditScore">-</div>
              </div>
              <div class="w-px h-8 bg-gray-300 hidden sm:block"></div>
              <a id="cdLedgerLink" href="#" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap"><i class="fas fa-file-invoice-dollar mr-1"></i>원장</a>
            </div>
          </div>
        </div>

        <!-- 여신 상태 배너 -->
        <div id="cdCreditBanner" class="hidden mb-3"></div>
        <!-- Risk Alert Banner -->
        <div id="cdRiskBanner" class="hidden mb-3"></div>

        <!-- 2단 레이아웃 -->
        <div class="flex flex-col lg:flex-row gap-6">

          <!-- 좌측: 메인 콘텐츠 (2/3) -->
          <div class="flex-1 min-w-0">

            <!-- 탭 -->
            <div class="flex border-b mb-4 bg-white rounded-t-lg shadow-sm overflow-x-auto">
              <button id="cdTabOrders" onclick="switchCdTab('orders')" class="px-5 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-600 whitespace-nowrap">주문 이력</button>
              <button id="cdTabNotes" onclick="switchCdTab('notes')" class="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap">메모</button>
              <button id="cdTabCollection" onclick="switchCdTab('collection')" class="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap">독촉 이력</button>
            </div>

            <!-- 주문 이력 패널 -->
            <div id="cdOrdersPanel">
              <div class="bg-white rounded-lg shadow overflow-hidden">
                <table class="w-full text-sm ds-table-striped">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-4 py-3 text-left">주문번호</th>
                      <th class="px-4 py-3 text-center">주문일</th>
                      <th class="px-4 py-3 text-center">납기</th>
                      <th class="px-4 py-3 text-right">금액</th>
                      <th class="px-4 py-3 text-center">상태</th>
                      <th class="px-4 py-3 text-center">경리</th>
                    </tr>
                  </thead>
                  <tbody id="cdOrdersBody"></tbody>
                </table>
              </div>
            </div>

            <!-- 메모 패널 -->
            <div id="cdNotesPanel" class="hidden">
              <div id="cdNotesList" class="space-y-3"></div>
            </div>

            <!-- 독촉 이력 패널 -->
            <div id="cdCollectionPanel" class="hidden">
              <div class="bg-white rounded-lg shadow overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                  <h3 class="text-sm font-semibold text-gray-700">독촉 이력</h3>
                </div>
                <table class="w-full text-sm ds-table-striped">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-4 py-3 text-left">연락일</th>
                      <th class="px-4 py-3 text-center">방법</th>
                      <th class="px-4 py-3 text-left">담당자</th>
                      <th class="px-4 py-3 text-center">약속일</th>
                      <th class="px-4 py-3 text-right">약속금액</th>
                      <th class="px-4 py-3 text-left">비고</th>
                    </tr>
                  </thead>
                  <tbody id="cdCollectionBody"></tbody>
                </table>
              </div>
            </div>

          </div><!-- /좌측 -->

          <!-- 우측: 사이드바 (1/3) -->
          <div class="w-full lg:w-80 flex-shrink-0 space-y-4">

            <!-- 거래처 정보 카드 -->
            <div class="bg-white rounded-lg shadow p-4">
              <h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-building mr-1 text-gray-400"></i>거래처 정보</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-gray-500">대표</span><span id="cdRepresentative" class="text-right">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">전화</span><span id="cdPhone" class="text-right">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">휴대폰</span><span id="cdMobile" class="text-right">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">팩스</span><span id="cdFax" class="text-right">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">이메일</span><span id="cdEmail" class="text-right max-w-[180px] truncate">-</span></div>
                <div class="flex justify-between gap-2"><span class="text-gray-500 flex-shrink-0">주소</span><span id="cdAddress" class="text-right text-xs leading-relaxed">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">배송방식</span><span id="cdDeliveryMethod" class="text-right">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">배송지</span><span id="cdDeliveryAddress" class="text-right text-xs">-</span></div>
                <div class="flex justify-between items-center gap-2">
                  <span class="text-gray-500 flex-shrink-0">사업자번호</span>
                  <div class="flex items-center gap-1.5">
                    <span id="cdBrn" class="text-right">-</span>
                    <button onclick="checkClientBrnStatus()" id="cdBtnCheckBrn" class="px-2 py-0.5 text-[10px] border border-gray-300 text-gray-600 rounded hover:bg-gray-50 whitespace-nowrap flex-shrink-0">상태조회</button>
                  </div>
                </div>
                <div id="cdBrnStatusResult" class="hidden text-xs mt-0.5 text-right"></div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-500">세금계산서</span>
                  <select id="cdInvoiceType" onchange="updateInvoiceType()" class="px-2 py-0.5 border rounded text-xs focus:outline-none focus:border-blue-400">
                    <option value="PER_ORDER">건별 발행</option>
                    <option value="MONTHLY">월합산 발행</option>
                    <option value="UNDECIDED">미분류</option>
                    <option value="CARD">카드결제 (미발행)</option>
                    <option value="ISSUED_BY_OTHER">타발행 (미발행)</option>
                  </select>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-500">자동 회계반영</span>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="cdAutoBilling" onchange="updateAutoBilling()" class="sr-only peer">
                    <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            <!-- 분석 카드 -->
            <div class="bg-white rounded-lg shadow p-4">
              <h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-chart-pie mr-1 text-gray-400"></i>분석</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between items-center">
                  <span class="text-gray-500">신용 등급</span>
                  <div class="flex items-center gap-1">
                    <span id="cdCreditGrade" class="px-1.5 py-0.5 rounded text-xs font-bold"></span>
                    <span class="text-xs text-gray-400" id="cdCreditBreakdown"></span>
                  </div>
                </div>
                <div class="flex justify-between"><span class="text-gray-500">수익성</span><span id="cdMarginRate" class="font-medium">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">성장률(3개월)</span><span id="cdGrowthRate" class="font-medium">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">미수금 비율</span><span id="cdArRatio" class="font-medium">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">총 입금</span><span id="cdTotalPayments" class="text-green-600 font-medium">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">최근 입금</span><span id="cdLastPayment">-</span></div>
                <div class="flex justify-between"><span class="text-gray-500">청구건수</span><span id="cdBilledCount">-</span></div>
              </div>
              <!-- 매출 미니 차트 -->
              <div id="cdMonthlyChart" class="mt-3 space-y-1 border-t pt-3"></div>
            </div>

            <!-- 여신 관리 카드 (ADMIN only) -->
            <div id="cdCreditSection" class="hidden">
              <div class="bg-white rounded-lg shadow p-4">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-bold text-gray-700"><i class="fas fa-shield-alt mr-1 text-gray-400"></i>여신 관리</h4>
                  <button onclick="saveCreditSettings()" class="text-xs text-blue-600 hover:underline">저장</button>
                </div>
                <div class="space-y-2 text-sm">
                  <div>
                    <label class="text-xs text-gray-500">여신한도 (0=무제한)</label>
                    <input type="text" inputmode="numeric" data-money id="cdCreditLimit" class="w-full border rounded px-2 py-1 text-sm mt-0.5" value="0">
                  </div>
                  <div>
                    <label class="text-xs text-gray-500">주문 차단</label>
                    <select id="cdCreditHold" class="w-full border rounded px-2 py-1 text-sm mt-0.5">
                      <option value="0">허용</option>
                      <option value="1">차단</option>
                    </select>
                  </div>
                </div>
              </div>
              <!-- 사업자 그룹 (ADMIN only) -->
              <div class="bg-white rounded-lg shadow p-4 mt-4">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-sm font-bold text-gray-700"><i class="fas fa-link mr-1 text-gray-400"></i>사업자 그룹</h4>
                  <button onclick="saveBillingGroup()" class="text-xs text-blue-600 hover:underline">저장</button>
                </div>
                <div class="flex items-center gap-2">
                  <select id="cdBillingGroup" class="flex-1 border rounded px-2 py-1 text-xs">
                    <option value="">없음 (독립)</option>
                  </select>
                  <button onclick="createBillingGroup()" class="text-[10px] px-2 py-1 border rounded text-gray-600 hover:bg-gray-50">
                    <i class="fas fa-plus mr-0.5"></i>새 그룹
                  </button>
                </div>
                <div id="cdGroupMembers" class="mt-2 text-xs text-gray-500"></div>
              </div>
            </div>

            <!-- 포털 계정 카드 -->
            <div class="bg-white rounded-lg shadow p-4">
              <h4 class="text-sm font-bold text-gray-700 mb-3"><i class="fas fa-globe mr-1 text-gray-400"></i>포털 계정</h4>
              <div id="portalAccountStatus">
                <div class="text-center py-3 text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</div>
              </div>
            </div>

            <!-- 액션 버튼 -->
            <div class="space-y-2">
              <button onclick="openNoteModal()" class="w-full px-3 py-2 bg-white border text-gray-700 rounded-lg text-sm hover:bg-gray-50"><i class="fas fa-sticky-note mr-1"></i>메모 추가</button>
              <button id="cdToggleActiveBtn" onclick="toggleClientActive()" class="w-full px-3 py-2 bg-white border text-gray-700 rounded-lg text-sm hover:bg-gray-50"><i class="fas fa-power-off mr-1"></i>비활성화</button>
            </div>

          </div><!-- /우측 사이드바 -->

        </div><!-- /2단 레이아웃 -->

      </div><!-- /detailContent -->

      <!-- Note Modal -->
      <div id="noteModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-96 p-6">
          <h3 class="text-lg font-bold mb-4">메모 추가</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">유형</label>
              <select id="noteType" class="w-full border rounded px-3 py-2 text-sm">
                <option value="GENERAL">일반</option>
                <option value="IMPORTANT">중요</option>
                <option value="COMPLAINT">클레임</option>
                <option value="FOLLOW_UP">후속조치</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">내용</label>
              <textarea id="noteContent" rows="4" class="w-full border rounded px-3 py-2 text-sm" placeholder="메모 내용을 입력하세요"></textarea>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button onclick="closeNoteModal()" class="px-4 py-2 text-sm border rounded hover:bg-gray-50">취소</button>
            <button onclick="saveNote()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
          </div>
        </div>
      </div>
    `,
    pageScript: `var CLIENT_ID = ${clientId};\n${pageScript}`,
  })
}
