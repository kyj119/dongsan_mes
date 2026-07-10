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

  <!-- 열람/편집 안내 -->
  <div class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-xs text-blue-800">
    <i class="fas fa-circle-info mr-1"></i><b>열람</b>=페이지 접근·조회, <b>편집</b>=생성·수정·삭제. 편집을 켜면 열람은 자동 포함됩니다.
  </div>

  <!-- 역할 탭 (permissions.js 가 ROLES 로 동적 렌더) -->
  <div id="permTabs" class="bg-white rounded-t-lg shadow-sm flex flex-wrap border-b border-gray-200 px-2"></div>

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
