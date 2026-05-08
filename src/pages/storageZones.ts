// 창고 구역 관리 페이지
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import storageZonesScript from '../scripts/storageZones.js?raw'

export function storageZonesPage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="max-w-7xl mx-auto px-6 pt-6 space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900">창고 구역 관리</h2>
      <p class="text-sm text-gray-500 mt-1">입고 검수 담당자별 품목 구역 설정</p>
    </div>
    <button onclick="openAddZoneModal()" class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700">
      <i class="fas fa-plus mr-1"></i>구역 추가
    </button>
  </div>

  <div class="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
    <table class="w-full text-sm ds-table-striped">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-3 py-3 text-left">구역명</th>
          <th class="px-3 py-3 text-left">코드</th>
          <th class="px-3 py-3 text-left">설명</th>
          <th class="px-3 py-3 text-left">담당자</th>
          <th class="px-3 py-3 text-center">품목 수</th>
          <th class="px-3 py-3 text-center">상태</th>
          <th class="px-3 py-3 text-center w-24">동작</th>
        </tr>
      </thead>
      <tbody id="storageZonesBody"></tbody>
    </table>
    <div id="noZonesMsg" class="hidden text-center py-12">
      <i class="fas fa-warehouse text-3xl mb-3 block text-gray-300"></i>
      <div class="text-sm text-gray-500 mb-1">등록된 창고 구역이 없습니다.</div>
      <button onclick="openAddZoneModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded mt-2 hover:bg-blue-700">+ 구역 추가</button>
    </div>
  </div>

</div>

<!-- 구역 추가/수정 모달 -->
<div id="zoneModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
  <div class="bg-white rounded-lg shadow-xl w-full max-w-lg">
    <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 id="zoneModalTitle" class="text-base font-bold text-gray-900">창고 구역 추가</h3>
      <button onclick="closeZoneModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-5 space-y-3">
      <input type="hidden" id="zoneModalId">
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1">구역명 *</label>
        <input type="text" id="zoneModalName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: 원단 창고">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">코드</label>
          <input type="text" id="zoneModalCode" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: FABRIC">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">정렬 순서</label>
          <input type="number" id="zoneModalSort" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" value="0">
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1">설명</label>
        <textarea id="zoneModalDesc" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="선택"></textarea>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1">담당자</label>
        <select id="zoneModalManager" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">미지정</option>
        </select>
      </div>
      <label class="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" id="zoneModalActive" class="w-4 h-4" checked>
        활성
      </label>
    </div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
      <button onclick="closeZoneModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">취소</button>
      <button id="zoneModalSaveBtn" onclick="saveZone()" class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700">저장</button>
    </div>
  </div>
</div>
`
  return renderPage(c, {
    title: '창고 관리',
    activePage: '/storage-zones',
    pageContent,
    pageScript: storageZonesScript,
  })
}
