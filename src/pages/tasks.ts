import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import tasksScript from '../scripts/tasks.js?raw'

export function tasksPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '작업 큐',
    activePage: '/tasks',
    pageContent: `
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <div class="flex flex-wrap gap-3 items-end">
          <div class="min-w-[160px]">
            <label class="block text-xs text-gray-500 mb-1">타입</label>
            <select id="typeFilter" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">전체 타입</option>
              <option value="AI_PROCESS">AI 파일 처리</option>
              <option value="MANUAL">수동</option>
            </select>
          </div>
          <div class="min-w-[160px]">
            <label class="block text-xs text-gray-500 mb-1">상태</label>
            <select id="statusFilter" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">전체 상태</option>
              <option value="PENDING">대기</option>
              <option value="PROCESSING">진행중</option>
              <option value="FAILED">실패</option>
              <option value="COMPLETED">완료</option>
              <option value="CANCELLED">취소</option>
            </select>
          </div>
          <button onclick="loadTasks()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <i class="fas fa-sync mr-1"></i>새로고침
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <p class="text-gray-500 text-sm">대기</p>
          <p id="statPending" class="text-3xl font-bold text-gray-900">-</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <p class="text-gray-500 text-sm">진행중</p>
          <p id="statProcessing" class="text-3xl font-bold text-blue-600">-</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <p class="text-gray-500 text-sm">실패</p>
          <p id="statFailed" class="text-3xl font-bold text-red-600">-</p>
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <p class="text-gray-500 text-sm">24시간 완료</p>
          <p id="statCompleted" class="text-3xl font-bold text-green-600">-</p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div class="overflow-x-auto" style="max-height: calc(100vh - 360px); overflow-y: auto;">
          <table class="w-full text-sm ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">타입</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">상태</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">주문/카드</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">재시도</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">에러</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">생성일</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody id="tasksBody" class="divide-y divide-gray-100">
              <tr><td colspan="8" class="text-center py-8 text-gray-400">로딩중...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `,
    pageScript: tasksScript
  })
}

export default tasksPage
