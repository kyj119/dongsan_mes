import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/feedback.js?raw'

// 문제 접수함 (0626) — ADMIN/MANAGER 전용. 신고 자체는 전역 버튼(layout)이 받는다.
export function feedbackPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '문제 접수함',
    activePage: '/feedback',
    pageContent: `
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div class="ds-card p-5">
            <div class="text-xs text-gray-500">미처리</div>
            <div class="text-3xl font-bold text-amber-600 mt-1" id="fblOpen">-</div>
          </div>
          <div class="ds-card p-5">
            <div class="text-xs text-gray-500">전체</div>
            <div class="text-3xl font-bold text-gray-900 mt-1" id="fblTotal">-</div>
          </div>
          <div class="ds-card p-5 sm:col-span-2">
            <div class="text-xs text-gray-500 mb-1">분류가 곧 조치입니다</div>
            <div class="text-xs text-gray-600 leading-relaxed">
              <b>기능없음</b> 만든다 · <b>못찾음</b> 위치를 옮긴다 · <b>오류·느림</b> 고친다 ·
              <b class="text-red-600">값틀림</b> 데이터를 정정한다
            </div>
          </div>
        </div>

        <div class="ds-card p-4">
          <div class="flex flex-wrap items-center gap-2">
            <select id="fblStatus" class="border rounded-lg px-3 py-2 text-sm" onchange="loadFeedbackList()">
              <option value="OPEN">미처리</option>
              <option value="">전체</option>
              <option value="DONE">처리됨</option>
            </select>
            <select id="fblCategory" class="border rounded-lg px-3 py-2 text-sm" onchange="loadFeedbackList()">
              <option value="">분류 전체</option>
              <option value="MISSING">기능이 없어요</option>
              <option value="NOTFOUND">못 찾겠어요</option>
              <option value="ERROR">오류·느려요</option>
              <option value="WRONG">값이 틀려요</option>
            </select>
            <input type="text" id="fblSearch" class="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px]"
              placeholder="내용 · 화면 · 이름으로 찾기" onkeydown="if(event.key==='Enter')loadFeedbackList()">
            <button onclick="loadFeedbackList()" class="px-4 py-2 rounded-lg text-sm text-white bg-blue-600 hover:bg-blue-700">
              <i class="fas fa-search mr-1"></i>조회
            </button>
          </div>
        </div>

        <div class="ds-card overflow-hidden">
          <div class="ds-table-wrap" style="overflow-x:auto;">
            <table class="ds-table w-full text-sm">
              <thead>
                <tr>
                  <th style="width:120px;">접수</th>
                  <th style="width:90px;">낸 사람</th>
                  <th style="width:96px;">분류</th>
                  <th>내용</th>
                  <th style="width:150px;">어느 화면</th>
                  <th style="width:74px;">증거</th>
                  <th style="width:92px;">상태</th>
                </tr>
              </thead>
              <tbody id="fblBody">
                <tr><td colspan="7" class="text-center text-gray-400 py-8">불러오는 중…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 상세 -->
      <div id="fblDetailModal" class="hidden fixed inset-0 ds-z-stack flex items-center justify-center bg-black/50" data-esc-close="closeFeedbackDetail">
        <div class="bg-white rounded-lg shadow-xl w-[680px] max-h-[88vh] overflow-y-auto p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-800" id="fblDetailTitle">신고 상세</h3>
            <button onclick="closeFeedbackDetail()" class="text-gray-400 hover:text-gray-600" aria-label="닫기"><i class="fas fa-times"></i></button>
          </div>
          <div id="fblDetailBody"></div>
        </div>
      </div>
    `,
    pageScript,
  })
}
