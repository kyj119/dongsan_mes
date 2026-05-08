// 권한 관리 페이지 (ADMIN 전용)
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import permissionsScript from '../scripts/permissions.js?raw'

export function permissionsPage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="max-w-6xl mx-auto px-6 pt-6 space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900">권한 관리</h2>
      <p class="text-sm text-gray-500 mt-1">역할별 페이지 접근 권한을 편집합니다. 변경 즉시 다음 요청부터 반영됩니다.</p>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-500">변경됨 <b id="permDirtyCount" class="text-amber-700">0</b></span>
      <button onclick="permResetAll()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-2 text-sm hover:bg-gray-50">
        <i class="fas fa-undo mr-1"></i>되돌리기
      </button>
      <button id="permSaveBtn" onclick="permSave()" disabled
        class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
        <i class="fas fa-save mr-1"></i>저장
      </button>
    </div>
  </div>

  <!-- 역할 탭 -->
  <div class="bg-white rounded-t-lg shadow-sm flex border-b border-gray-200 px-2">
    <button id="permTabMANAGER" onclick="permSwitchRole('MANAGER')"
      class="px-6 py-3 text-sm font-semibold border-b-2 border-blue-600 text-blue-600">
      <i class="fas fa-user-tie mr-1"></i>MANAGER
    </button>
    <button id="permTabDESIGNER" onclick="permSwitchRole('DESIGNER')"
      class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
      <i class="fas fa-paint-brush mr-1"></i>DESIGNER
    </button>
    <button id="permTabOPERATOR" onclick="permSwitchRole('OPERATOR')"
      class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
      <i class="fas fa-hard-hat mr-1"></i>OPERATOR
    </button>
    <button id="permTabADMIN" onclick="permSwitchRole('ADMIN')"
      class="px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-600 ml-auto">
      <i class="fas fa-user-shield mr-1"></i>ADMIN (보기 전용)
    </button>
  </div>

  <!-- 매트릭스 -->
  <div id="permContent" class="bg-white rounded-b-lg shadow-sm p-4 min-h-[400px]">
    <div class="text-center text-gray-400 py-12">
      <i class="fas fa-spinner fa-spin text-3xl mb-2"></i>
      <p class="text-sm">로딩 중...</p>
    </div>
  </div>
</div>
`
  return renderPage(c, {
    title: '권한 관리',
    activePage: '/permissions',
    pageContent,
    pageScript: permissionsScript,
  })
}
