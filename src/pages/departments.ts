// 부문 관리 페이지 — 부문 트리 + 직원 부문 배정 + 매출 귀속 매핑
// 설계 정본: memory/design-departmental-pnl.md
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import departmentsScript from '../scripts/departments.js?raw'

export function departmentsPage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="max-w-7xl mx-auto px-6 pt-6 space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900">부문 관리</h2>
      <p class="text-sm text-gray-500 mt-1">부문별 손익(관리회계)의 조직 그릇 — 매출·자재비·인건비 귀속 기준</p>
    </div>
    <button onclick="openAddDeptModal()" class="ds-btn ds-btn-primary text-sm">
      <i class="fas fa-plus mr-1"></i>부문 추가
    </button>
  </div>

  <!-- 1) 부문 구조 (트리) -->
  <div class="ds-card overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
      <i class="fas fa-sitemap text-gray-400"></i>
      <h3 class="text-base font-bold text-gray-900">부문 구조</h3>
      <span class="text-xs text-gray-400">PRODUCTION=매출발생 · SUPPORT=공통/지원 · serves=지원 생산부문</span>
    </div>
    <table class="w-full text-sm ds-table ds-table-striped">
      <thead>
        <tr>
          <th class="text-left" style="width:28%">부문</th>
          <th class="text-center" style="width:14%">유형</th>
          <th class="text-left" style="width:16%">지원 생산부문</th>
          <th class="text-center" style="width:14%">재직/전체</th>
          <th class="text-center" style="width:12%">상태</th>
          <th class="text-center" style="width:16%">동작</th>
        </tr>
      </thead>
      <tbody id="deptTreeBody"></tbody>
    </table>
    <div id="deptTreeEmpty" class="hidden text-center py-10 text-sm text-gray-400">등록된 부문이 없습니다.</div>
  </div>

  <!-- 2) 직원 부문 배정 -->
  <div class="ds-card overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <i class="fas fa-users text-gray-400"></i>
        <h3 class="text-base font-bold text-gray-900">직원 부문 배정</h3>
        <span id="deptEmpCount" class="text-xs text-gray-400"></span>
      </div>
      <label class="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" id="deptShowResigned" class="w-4 h-4" onchange="deptToggleResigned(this)"> 퇴사자 포함
      </label>
    </div>
    <div class="max-h-96 overflow-y-auto">
      <table class="w-full text-sm ds-table ds-table-striped">
        <thead class="sticky top-0 bg-white">
          <tr>
            <th class="text-left" style="width:22%">이름</th>
            <th class="text-left" style="width:14%">직급</th>
            <th class="text-left" style="width:14%">법인</th>
            <th class="text-left" style="width:16%">레거시</th>
            <th class="text-left" style="width:34%">부문</th>
          </tr>
        </thead>
        <tbody id="deptEmpBody"></tbody>
      </table>
    </div>
    <div id="deptEmpEmpty" class="hidden text-center py-10 text-sm text-gray-400">직원이 없습니다.</div>
  </div>

  <!-- 3) 매출 귀속 매핑 (읽기전용) -->
  <div class="ds-card overflow-hidden">
    <div class="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
      <i class="fas fa-code-branch text-gray-400"></i>
      <h3 class="text-base font-bold text-gray-900">매출 귀속 매핑</h3>
      <span class="text-xs text-gray-400">품목 분류(category) → 부문. 미매핑 category는 '미분류'로 집계</span>
    </div>
    <div id="deptCatBody" class="p-5 flex flex-wrap gap-2"></div>
    <div id="deptCatEmpty" class="hidden text-center py-8 text-sm text-gray-400">매핑이 없습니다.</div>
  </div>
</div>

<!-- 부문 추가/수정 모달 -->
<div id="deptModal" class="ds-modal-overlay hidden flex items-center justify-center">
  <div class="ds-modal" style="max-width:32rem">
    <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 id="deptModalTitle" class="text-base font-bold text-gray-900">부문 추가</h3>
      <button onclick="closeDeptModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-5 space-y-3">
      <input type="hidden" id="deptModalId">
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1">부문명 *</label>
        <input type="text" id="deptModalName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">유형 *</label>
          <select id="deptModalType" onchange="deptSyncServesVisibility()" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="PRODUCTION">생산(매출발생)</option>
            <option value="SUPPORT">지원/공통</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">상위 부문</label>
          <select id="deptModalParent" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
        </div>
      </div>
      <div id="deptServesWrap">
        <label class="block text-xs font-semibold text-gray-700 mb-1">지원 생산부문 (인건비 직접귀속 대상)</label>
        <select id="deptModalServes" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
        <p class="text-xs text-gray-400 mt-1">지원 부문 인건비를 이 생산부문 원가로 직접 귀속(P4). 비우면 공통(P5 배부).</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">정렬</label>
          <input type="number" id="deptModalSort" value="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        </div>
        <label class="flex items-center gap-2 text-sm text-gray-700 mt-5">
          <input type="checkbox" id="deptModalActive" class="w-4 h-4" checked> 활성
        </label>
      </div>
    </div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
      <button onclick="closeDeptModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">취소</button>
      <button id="deptModalSaveBtn" onclick="saveDept()" class="ds-btn ds-btn-primary text-sm">저장</button>
    </div>
  </div>
</div>
`
  return renderPage(c, {
    title: '부문 관리',
    activePage: '/departments',
    pageContent,
    pageScript: departmentsScript,
  })
}
