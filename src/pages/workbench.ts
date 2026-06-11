import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/workbench.js?raw'

export function workbenchPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '시안 검수',
    activePage: '/workbench',
    pageContent: `
      <!-- 요약 카드 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="ds-card p-4">
          <div class="text-sm text-gray-600 mb-1">검수 대상 주문</div>
          <div class="text-2xl font-bold text-gray-900" id="statTotal">-</div>
        </div>
        <div class="ds-card p-4">
          <div class="text-sm text-gray-600 mb-1">매칭 완료</div>
          <div class="text-2xl font-bold text-green-600" id="statMatched">-</div>
        </div>
        <div class="ds-card p-4">
          <div class="text-sm text-gray-600 mb-1">미매칭 품목 보유</div>
          <div class="text-2xl font-bold text-amber-500" id="statUnmatched">-</div>
        </div>
        <div class="ds-card p-4">
          <div class="text-sm text-gray-600 mb-1">분석 실패</div>
          <div class="text-2xl font-bold text-red-600" id="statFailed">-</div>
        </div>
      </div>

      <div class="flex gap-4" style="min-height: 600px;">
        <!-- 좌: 주문 목록 -->
        <div class="flex-shrink-0 w-80 ds-card flex flex-col">
          <div class="p-3 border-b border-gray-200">
            <div class="flex gap-2">
              <input id="wbSearch" type="text" placeholder="주문번호/거래처 검색"
                     class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <button id="wbSearchBtn" class="bg-blue-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-blue-700">
                <i class="fas fa-search"></i>
              </button>
            </div>
          </div>
          <div id="wbOrderList" class="flex-1 overflow-y-auto divide-y divide-gray-100">
            <div class="text-center text-gray-400 py-8 text-sm">로딩 중...</div>
          </div>
        </div>

        <!-- 우: 검수 패널 -->
        <div class="flex-1 ds-card flex flex-col">
          <div id="wbDetailHeader" class="p-4 border-b border-gray-200">
            <div class="text-sm text-gray-500">좌측에서 주문을 선택하세요</div>
          </div>
          <div id="wbDetailBody" class="flex-1 overflow-y-auto p-4">
            <div class="flex flex-col items-center justify-center h-full text-gray-300">
              <i class="fas fa-object-group text-5xl mb-3"></i>
              <div class="text-gray-400 text-sm">주문을 선택하면 AI 그룹과 품목 매칭을 검수할 수 있습니다</div>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
