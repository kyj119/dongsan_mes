import type { Context } from 'hono'
import { renderPage } from '../layout'
// @ts-ignore — Vite raw import
import qualityScript from '../scripts/quality.js?raw'

export function qualityPage(c: Context) {
  const pageContent = `
    <div class="ds-container space-y-4">
      <!-- 탭 네비 -->
      <div class="ds-card p-0 overflow-hidden">
        <div class="flex border-b" id="qcTabs">
          <button data-tab="claims"   onclick="window.qcTab('claims')"   class="qc-tab px-4 py-2.5 text-xs font-medium border-b-2 border-blue-600 text-blue-600"><i class="fas fa-comment-dots mr-1"></i>클레임</button>
          <button data-tab="returns"  onclick="window.qcTab('returns')"  class="qc-tab px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-gray-500"><i class="fas fa-rotate-left mr-1"></i>반품(RMA)</button>
          <button data-tab="defects"  onclick="window.qcTab('defects')"  class="qc-tab px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-gray-500"><i class="fas fa-bug mr-1"></i>불량코드</button>
          <button data-tab="analytics" onclick="window.qcTab('analytics')" class="qc-tab px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-gray-500"><i class="fas fa-chart-pie mr-1"></i>분석</button>
        </div>
      </div>

      <!-- 클레임 -->
      <div id="qc-pane-claims" class="qc-pane space-y-3">
        <div class="ds-card p-3 flex flex-wrap items-end gap-3">
          <div>
            <label class="block text-[10px] text-gray-400 mb-1">상태</label>
            <select id="qcClaimStatus" onchange="window.qcLoadClaims()" class="border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
              <option value="">전체</option>
              <option value="OPEN">접수(OPEN)</option>
              <option value="RESOLVED">해결(RESOLVED)</option>
            </select>
          </div>
          <div class="ml-auto">
            <button onclick="window.qcOpenClaimModal()" class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>새 클레임</button>
          </div>
        </div>
        <div class="ds-card p-0 overflow-x-auto">
          <table class="ds-table w-full text-xs">
            <thead><tr>
              <th class="col-code">클레임번호</th><th>거래처</th><th class="col-code">주문</th><th>유형</th>
              <th>내용</th><th class="col-money">청구액</th><th>상태</th><th class="col-date">등록일</th><th class="col-action">조치</th>
            </tr></thead>
            <tbody id="qcClaimsBody"><tr><td colspan="9" class="text-center py-8 text-gray-400">로딩…</td></tr></tbody>
          </table>
        </div>
        <div id="qcClaimsPagebar" class="flex flex-wrap items-center gap-2 mt-1 px-1"></div>
      </div>

      <!-- 반품 -->
      <div id="qc-pane-returns" class="qc-pane space-y-3 hidden">
        <div class="ds-card p-3 flex flex-wrap items-end gap-3">
          <div>
            <label class="block text-[10px] text-gray-400 mb-1">상태</label>
            <select id="qcReturnStatus" onchange="window.qcLoadReturns()" class="border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
              <option value="">전체</option>
              <option value="REQUESTED">요청</option><option value="APPROVED">승인</option>
              <option value="SHIPPED_BACK">반송중</option><option value="RECEIVED">입고</option>
              <option value="INSPECTED">검수</option><option value="RESOLVED">완료</option>
            </select>
          </div>
          <div class="ml-auto text-[11px] text-gray-400 self-center"><i class="fas fa-circle-info mr-1"></i>반품 생성은 주문 상세에서 (품목 선택 필요)</div>
        </div>
        <div class="ds-card p-0 overflow-x-auto">
          <table class="ds-table w-full text-xs">
            <thead><tr>
              <th class="col-code">반품번호</th><th>거래처</th><th class="col-code">주문</th><th>사유</th>
              <th>상태</th><th class="col-money">환불액</th><th class="col-date">등록일</th><th class="col-action">조치</th>
            </tr></thead>
            <tbody id="qcReturnsBody"><tr><td colspan="8" class="text-center py-8 text-gray-400">로딩…</td></tr></tbody>
          </table>
        </div>
        <div id="qcReturnsPagebar" class="flex flex-wrap items-center gap-2 mt-1 px-1"></div>
      </div>

      <!-- 불량코드 -->
      <div id="qc-pane-defects" class="qc-pane space-y-3 hidden">
        <div class="ds-card p-3 flex items-center">
          <div class="text-xs text-gray-500"><i class="fas fa-bug mr-1"></i>불량 유형 마스터 (자동 품질이슈·클레임 분류 기준)</div>
          <div class="ml-auto"><button onclick="window.qcOpenDefectModal()" class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>불량코드 추가</button></div>
        </div>
        <div class="ds-card p-0 overflow-x-auto">
          <table class="ds-table w-full text-xs">
            <thead><tr><th class="col-code">코드</th><th>명칭</th><th>분류</th><th>상위</th><th>예방조치</th></tr></thead>
            <tbody id="qcDefectsBody"><tr><td colspan="5" class="text-center py-8 text-gray-400">로딩…</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- 분석 -->
      <div id="qc-pane-analytics" class="qc-pane space-y-3 hidden">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="ds-card p-3"><div class="text-xs font-semibold mb-2 text-gray-600">유형별</div><div id="qcAnaType" class="space-y-1 text-xs text-gray-500">-</div></div>
          <div class="ds-card p-3"><div class="text-xs font-semibold mb-2 text-gray-600">거래처 TOP 10</div><div id="qcAnaClient" class="space-y-1 text-xs text-gray-500">-</div></div>
          <div class="ds-card p-3"><div class="text-xs font-semibold mb-2 text-gray-600">월별 추이 (6개월)</div><div id="qcAnaMonthly" class="space-y-1 text-xs text-gray-500">-</div></div>
        </div>
      </div>
    </div>

    <!-- 클레임 생성 모달 -->
    <div id="qcClaimModal" class="fixed inset-0 bg-black/40 z-50 flex hidden items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-4 space-y-3">
        <div class="flex items-center justify-between"><h3 class="text-sm font-semibold">새 클레임</h3><button onclick="window.qcCloseModal('qcClaimModal')" class="text-gray-400"><i class="fas fa-times"></i></button></div>
        <div>
          <label class="block text-[11px] text-gray-500 mb-1">주문 검색 (번호·거래처)</label>
          <div class="flex gap-2">
            <input id="qcClaimOrderSearch" class="flex-1 border rounded px-2 py-1 text-xs" placeholder="주문번호 또는 거래처명" style="color:var(--c-text);" />
            <button onclick="window.qcSearchOrder()" class="px-2 py-1 bg-gray-100 text-xs rounded">조회</button>
          </div>
          <div id="qcOrderResults" class="mt-1 max-h-32 overflow-y-auto text-xs"></div>
          <div id="qcClaimOrderPicked" class="mt-1 text-[11px] text-blue-600"></div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="block text-[11px] text-gray-500 mb-1">유형</label>
            <select id="qcClaimType" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
              <option value="DEFECT">품질불량</option><option value="DELAY">납기지연</option>
              <option value="QUANTITY">수량오류</option><option value="WRONG">오배송</option><option value="OTHER">기타</option>
            </select></div>
          <div><label class="block text-[11px] text-gray-500 mb-1">청구액(원)</label><input id="qcClaimAmount" type="number" class="w-full border rounded px-2 py-1 text-xs" value="0" style="color:var(--c-text);" /></div>
        </div>
        <div><label class="block text-[11px] text-gray-500 mb-1">내용</label><textarea id="qcClaimDesc" rows="3" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);"></textarea></div>
        <div class="flex justify-end gap-2 pt-1">
          <button onclick="window.qcCloseModal('qcClaimModal')" class="px-3 py-1.5 text-xs text-gray-500">취소</button>
          <button onclick="window.qcSubmitClaim()" class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded">등록</button>
        </div>
      </div>
    </div>

    <!-- 클레임 해결 모달 -->
    <div id="qcResolveModal" class="fixed inset-0 bg-black/40 z-50 flex hidden items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-sm p-4 space-y-3">
        <div class="flex items-center justify-between"><h3 class="text-sm font-semibold">클레임 해결</h3><button onclick="window.qcCloseModal('qcResolveModal')" class="text-gray-400"><i class="fas fa-times"></i></button></div>
        <input type="hidden" id="qcResolveId" />
        <div><label class="block text-[11px] text-gray-500 mb-1">처리방식</label>
          <select id="qcResolveType" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
            <option value="REFUND">환불</option><option value="REWORK">재작업</option>
            <option value="DISCOUNT">할인/감액</option><option value="REPLACE">재제작</option><option value="REJECT">반려</option>
          </select></div>
        <div><label class="block text-[11px] text-gray-500 mb-1">확정 금액(원)</label><input id="qcResolveAmount" type="number" class="w-full border rounded px-2 py-1 text-xs" value="0" style="color:var(--c-text);" /></div>
        <div class="flex justify-end gap-2 pt-1">
          <button onclick="window.qcCloseModal('qcResolveModal')" class="px-3 py-1.5 text-xs text-gray-500">취소</button>
          <button onclick="window.qcSubmitResolve()" class="px-3 py-1.5 bg-green-600 text-white text-xs rounded">해결 확정</button>
        </div>
      </div>
    </div>

    <!-- 불량코드 모달 -->
    <div id="qcDefectModal" class="fixed inset-0 bg-black/40 z-50 flex hidden items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-sm p-4 space-y-3">
        <div class="flex items-center justify-between"><h3 class="text-sm font-semibold">불량코드 추가</h3><button onclick="window.qcCloseModal('qcDefectModal')" class="text-gray-400"><i class="fas fa-times"></i></button></div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="block text-[11px] text-gray-500 mb-1">코드</label><input id="qcDefectCode" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);" /></div>
          <div><label class="block text-[11px] text-gray-500 mb-1">분류</label>
            <select id="qcDefectCategory" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
              <option value="PRINT">인쇄</option><option value="FINISHING">후가공</option>
              <option value="MATERIAL">자재</option><option value="COLOR">색상</option><option value="SIZE">규격</option><option value="OTHER">기타</option>
            </select></div>
        </div>
        <div><label class="block text-[11px] text-gray-500 mb-1">명칭</label><input id="qcDefectName" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);" /></div>
        <div><label class="block text-[11px] text-gray-500 mb-1">예방조치</label><input id="qcDefectPrevent" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);" /></div>
        <div class="flex justify-end gap-2 pt-1">
          <button onclick="window.qcCloseModal('qcDefectModal')" class="px-3 py-1.5 text-xs text-gray-500">취소</button>
          <button onclick="window.qcSubmitDefect()" class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded">추가</button>
        </div>
      </div>
    </div>

    <!-- 반품 상태 모달 -->
    <div id="qcReturnModal" class="fixed inset-0 bg-black/40 z-50 flex hidden items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-sm p-4 space-y-3">
        <div class="flex items-center justify-between"><h3 class="text-sm font-semibold">반품 상태 변경</h3><button onclick="window.qcCloseModal('qcReturnModal')" class="text-gray-400"><i class="fas fa-times"></i></button></div>
        <input type="hidden" id="qcReturnId" />
        <div id="qcReturnCurrent" class="text-[11px] text-gray-500"></div>
        <div><label class="block text-[11px] text-gray-500 mb-1">다음 상태</label><select id="qcReturnNext" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);"></select></div>
        <div id="qcReturnResolveWrap" class="hidden space-y-2">
          <div><label class="block text-[11px] text-gray-500 mb-1">처리결과</label>
            <select id="qcReturnResolution" class="w-full border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
              <option value="RESTOCK">재입고(RESTOCK)</option><option value="SCRAP">폐기(SCRAP)</option>
              <option value="REWORK">재작업(REWORK)</option><option value="REJECT">반려(REJECT)</option>
            </select></div>
          <div><label class="block text-[11px] text-gray-500 mb-1">환불액(원)</label><input id="qcReturnRefund" type="number" class="w-full border rounded px-2 py-1 text-xs" value="0" style="color:var(--c-text);" /></div>
          <div class="text-[10px] text-amber-600"><i class="fas fa-triangle-exclamation mr-1"></i>RESTOCK 품목은 완료 시 자동 재입고됩니다.</div>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button onclick="window.qcCloseModal('qcReturnModal')" class="px-3 py-1.5 text-xs text-gray-500">취소</button>
          <button onclick="window.qcSubmitReturnStatus()" class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded">변경</button>
        </div>
      </div>
    </div>
  `

  return renderPage(c, {
    title: '품질/클레임',
    activePage: '/quality',
    pageScript: qualityScript,
    pageContent,
  })
}
