// {PAGE_TITLE} 페이지
//
// 치환 필요:
//   {RESOURCE}          예: employee
//   {RESOURCE_KR}       예: 직원
//   {PAGE_TITLE}        예: 직원 관리
//   {PAGE_PATH}         예: employees (앞 슬래시 제외)
//   {ICON}              예: fa-user
//
// 등록 (src/index.tsx):
//   import { {RESOURCE}Page } from './pages/{RESOURCE}'
//   app.get('/{PAGE_PATH}', pageAuthMiddleware, {RESOURCE}Page)
//
// 사이드바 (src/layout.ts sidebarHTML):
//   { path: '/{PAGE_PATH}', icon: '{ICON}', label: '{PAGE_TITLE}', roles: ['ADMIN','MANAGER'] }

import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/{RESOURCE}.js?raw'

export function {RESOURCE}Page(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '{PAGE_TITLE}',
    activePage: '/{PAGE_PATH}',
    pageContent: `
      <div class="space-y-4">
        <!-- 툴바 -->
        <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2 flex-wrap">
          <div class="flex-1 flex items-center gap-2 min-w-[200px]">
            <i class="fas fa-search text-gray-400"></i>
            <input id="{RESOURCE}Search" type="text" placeholder="검색어 입력"
              class="flex-1 border-0 focus:ring-0 text-sm"
              onkeydown="if(event.key==='Enter') {RESOURCE}Load()" />
          </div>
          <button onclick="{RESOURCE}Load()"
            class="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50">
            <i class="fas fa-sync-alt mr-1"></i>새로고침
          </button>
          <button onclick="{RESOURCE}OpenCreateModal()"
            class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-plus mr-1"></i>추가
          </button>
        </div>

        <!-- 테이블 -->
        <div class="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th class="px-3 py-2 text-left">ID</th>
                  <th class="px-3 py-2 text-left">이름</th>
                  <th class="px-3 py-2 text-left">생성일</th>
                  <th class="px-3 py-2 text-center">액션</th>
                </tr>
              </thead>
              <tbody id="{RESOURCE}TableBody">
                <tr><td colspan="4" class="text-center py-8 text-gray-400">로딩 중...</td></tr>
              </tbody>
            </table>
          </div>
          <div id="{RESOURCE}Pagination" class="px-3 py-2 border-t text-xs text-gray-600 flex items-center justify-between"></div>
        </div>
      </div>

      <!-- 생성/수정 모달 -->
      <div id="{RESOURCE}EditModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden items-center justify-center">
        <div class="bg-white rounded-lg shadow-xl w-[500px] max-h-[90vh] overflow-y-auto">
          <div class="px-4 py-3 border-b flex items-center justify-between">
            <h3 id="{RESOURCE}ModalTitle" class="font-semibold text-gray-800">
              <i class="fas {ICON} mr-1"></i>{RESOURCE_KR} 추가
            </h3>
            <button onclick="{RESOURCE}CloseModal()" class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="block text-xs text-gray-600 mb-1">이름 <span class="text-red-500">*</span></label>
              <input id="{RESOURCE}Name" type="text" class="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div class="px-4 py-3 border-t flex justify-end gap-2">
            <button onclick="{RESOURCE}CloseModal()"
              class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50">
              취소
            </button>
            <button onclick="{RESOURCE}Save()"
              class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              <i class="fas fa-save mr-1"></i>저장
            </button>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
