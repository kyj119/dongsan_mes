import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/myLeave.js?raw'

// #568 C안 — 로그인 계정 보유 직원의 "내 휴가" (권한 무관, pageAuthMiddleware만). API=/api/my/leaves
export function myLeavePage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '내 휴가',
    activePage: '',
    pageContent: `
      <div class="max-w-3xl mx-auto p-4 space-y-4">
        <h1 class="text-xl font-bold text-gray-900"><i class="fas fa-umbrella-beach text-blue-600 mr-2"></i>내 휴가</h1>

        <div id="mlNoLink" class="hidden ds-card p-6 text-center text-gray-500">
          <i class="fas fa-triangle-exclamation text-amber-500 text-2xl mb-2"></i>
          <div id="mlNoLinkMsg">로그인 계정에 연결된 직원 정보가 없습니다.</div>
        </div>

        <div id="mlBody" class="space-y-4">
          <!-- 연차 요약 -->
          <div class="grid grid-cols-3 gap-2">
            <div class="ds-card p-3 text-center"><div class="text-2xl font-bold tabular-nums text-blue-700" id="mlRemaining">-</div><div class="text-[11px] text-gray-400 mt-0.5">올해 잔여(일)</div></div>
            <div class="ds-card p-3 text-center"><div class="text-2xl font-bold tabular-nums text-gray-900" id="mlUsed">-</div><div class="text-[11px] text-gray-400 mt-0.5">올해 사용(일)</div></div>
            <div class="ds-card p-3 text-center"><div class="text-2xl font-bold tabular-nums text-gray-900" id="mlExpected">-</div><div class="text-[11px] text-gray-400 mt-0.5">예상 부여(일)</div></div>
          </div>

          <!-- 신청 폼 -->
          <div class="ds-card p-4">
            <div class="text-sm font-semibold text-gray-700 mb-3">새 휴가 신청</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-gray-500 mb-1">휴가 유형</label><select id="mlType" class="w-full border border-gray-300 rounded px-2 py-2 text-sm"></select></div>
              <div class="grid grid-cols-2 gap-2">
                <div><label class="block text-xs font-medium text-gray-500 mb-1">시작일</label><input type="date" id="mlStart" class="w-full border border-gray-300 rounded px-2 py-2 text-sm"></div>
                <div><label class="block text-xs font-medium text-gray-500 mb-1">종료일</label><input type="date" id="mlEnd" class="w-full border border-gray-300 rounded px-2 py-2 text-sm"></div>
              </div>
            </div>
            <div class="mt-3"><label class="block text-xs font-medium text-gray-500 mb-1">사유 (선택)</label><textarea id="mlReason" rows="2" class="w-full border border-gray-300 rounded px-2 py-2 text-sm" placeholder="사유"></textarea></div>
            <div id="mlError" class="hidden text-sm text-red-600 mt-2"></div>
            <div class="flex items-center justify-between mt-3">
              <span class="text-[11px] text-gray-400">일수는 주말·공휴일 제외 소정근로일로 자동 산정 · 신청 후 관리자 승인 대기</span>
              <button id="mlSubmit" class="ds-btn ds-btn-primary text-sm font-medium">신청하기</button>
            </div>
          </div>

          <!-- 내 신청 내역 -->
          <div class="ds-card p-0 overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">내 신청 내역</div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                  <tr>
                    <th class="px-4 py-2 text-left">유형</th><th class="px-4 py-2 text-left">기간</th>
                    <th class="col-qty px-4 py-2 text-right">일수</th><th class="col-status px-4 py-2 text-center">상태</th>
                    <th class="col-action px-4 py-2 text-center">조치</th>
                  </tr>
                </thead>
                <tbody id="mlRequests"><tr><td colspan="5" class="text-center py-8 text-gray-400">로딩 중...</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
