import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/paymentRequests.js?raw'

export function paymentRequestsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '지출결의서',
    activePage: '/payment-requests',
    pageContent: `
      <div class="space-y-4">
        <!-- KPI -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
            <div class="text-xl font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="prKpiDraft">-</div>
            <div class="text-[10px] text-gray-400">작성중</div>
          </div>
          <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
            <div class="text-xl font-bold text-amber-600" style="font-variant-numeric:tabular-nums;" id="prKpiPending">-</div>
            <div class="text-[10px] text-gray-400">결재대기</div>
          </div>
          <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
            <div class="text-xl font-bold text-blue-600" style="font-variant-numeric:tabular-nums;" id="prKpiApproved">-</div>
            <div class="text-[10px] text-gray-400">승인완료(이체대기)</div>
          </div>
          <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
            <div class="text-xl font-bold text-green-600" style="font-variant-numeric:tabular-nums;" id="prKpiPaid">-</div>
            <div class="text-[10px] text-gray-400">이체완료</div>
          </div>
        </div>

        <!-- 필터 + 액션 -->
        <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2">
          <select id="prFilterStatus" class="border rounded px-2 py-1 text-xs">
            <option value="">전체 상태</option>
            <option value="DRAFT">작성중</option>
            <option value="PENDING">결재대기</option>
            <option value="APPROVED">승인완료</option>
            <option value="PAID">이체완료</option>
            <option value="REJECTED">반려</option>
            <option value="CANCELLED">취소</option>
          </select>
          <select id="prFilterType" class="border rounded px-2 py-1 text-xs">
            <option value="">전체 유형</option>
            <option value="PURCHASE">매입대금</option>
            <option value="EXPENSE">경비</option>
            <option value="OTHER">기타</option>
          </select>
          <button onclick="loadPaymentRequests()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
            <i class="fas fa-search mr-1"></i>검색
          </button>
          <div class="flex-1"></div>
          <button onclick="prOpenAddModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-plus mr-1"></i>지출결의서 작성
          </button>
        </div>

        <!-- 목록 -->
        <div class="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs ds-table-striped">
              <thead>
                <tr class="bg-gray-50 sticky top-0">
                  <th class="px-2 py-2 text-left text-gray-600 font-semibold">결의서번호</th>
                  <th class="px-2 py-2 text-left text-gray-600 font-semibold">신청일</th>
                  <th class="px-2 py-2 text-left text-gray-600 font-semibold">유형</th>
                  <th class="px-2 py-2 text-left text-gray-600 font-semibold">지급처</th>
                  <th class="px-2 py-2 text-right text-gray-600 font-semibold">금액</th>
                  <th class="px-2 py-2 text-left text-gray-600 font-semibold">사유</th>
                  <th class="px-2 py-2 text-center text-gray-600 font-semibold">상태</th>
                  <th class="px-2 py-2 text-center text-gray-600 font-semibold">작성자</th>
                  <th class="px-2 py-2 text-center text-gray-600 font-semibold">조치</th>
                </tr>
              </thead>
              <tbody id="prTableBody">
                <tr><td colspan="9" class="text-center py-8 text-gray-400">로딩 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 작성/수정 모달 -->
      <div id="prModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-[500px] max-h-[90vh] overflow-y-auto p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold" id="prModalTitle">지출결의서 작성</h3>
            <button onclick="prCloseModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">신청일 <span class="text-red-500">*</span></label>
              <input type="date" id="prDate" class="w-full border rounded px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">유형 <span class="text-red-500">*</span></label>
              <select id="prType" class="w-full border rounded px-3 py-2 text-sm">
                <option value="EXPENSE">경비</option>
                <option value="PURCHASE">매입대금</option>
                <option value="OTHER">기타</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">지급처 <span class="text-red-500">*</span></label>
              <input type="text" id="prRecipientName" class="w-full border rounded px-3 py-2 text-sm" placeholder="받는 사람/회사명">
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">은행</label>
                <input type="text" id="prBank" class="w-full border rounded px-3 py-2 text-sm" placeholder="국민은행">
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">계좌번호</label>
                <input type="text" id="prAccount" class="w-full border rounded px-3 py-2 text-sm" placeholder="123-456-789">
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">금액 <span class="text-red-500">*</span></label>
              <input type="text" inputmode="numeric" data-money id="prAmount" class="w-full border rounded px-3 py-2 text-sm" placeholder="0">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">사유 <span class="text-red-500">*</span></label>
              <textarea id="prDesc" rows="3" class="w-full border rounded px-3 py-2 text-sm" placeholder="지급 사유를 상세히 입력하세요"></textarea>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">비고</label>
              <input type="text" id="prNotes" class="w-full border rounded px-3 py-2 text-sm">
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button onclick="prCloseModal()" class="px-4 py-2 text-sm border rounded hover:bg-gray-50">취소</button>
            <button onclick="prSave()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">저장 (작성중)</button>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
