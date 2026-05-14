// ============================================================================
// 전자결재 페이지
// ============================================================================

import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import approvalsScript from '../scripts/approvals.js?raw'

export const approvalsPage = (c: Context<HonoEnv>) => {
  const content = `
    <div class="space-y-4">
      <!-- 상단 버튼 -->
      <div class="flex justify-between items-center">
        <div class="flex space-x-2">
          <button data-tab="pending" class="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white">대기 결재<span id="pending-count"></span></button>
          <button data-tab="my" class="px-4 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700">내 요청</button>
          <button data-tab="all" class="px-4 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700">전체 현황</button>
          <button data-tab="templates" class="px-4 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700" onclick="renderTemplates()">양식 관리</button>
        </div>
        <button onclick="openNewRequestModal()" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          <i class="fas fa-plus mr-1"></i>새 결재 요청
        </button>
      </div>

      <!-- 탭 1: 대기 결재 -->
      <div id="tab-pending" class="tab-content">
        <div class="bg-white rounded-lg shadow p-4">
          <h2 class="text-lg font-bold mb-4"><i class="fas fa-clock mr-2 text-amber-600"></i>대기 결재</h2>
          <div id="pending-list" class="space-y-3"></div>
        </div>
      </div>

      <!-- 탭 2: 내 요청 -->
      <div id="tab-my" class="tab-content hidden">
        <div class="bg-white rounded-lg shadow">
          <div class="p-4 border-b flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-bold mr-auto"><i class="fas fa-paper-plane mr-2 text-blue-600"></i>내 결재 요청</h2>
            <input id="my-search" type="text" placeholder="검색 (제목, 번호)" class="border rounded px-3 py-1.5 text-sm w-48" oninput="filterMyRequests()">
            <select id="my-type-filter" class="border rounded px-2 py-1.5 text-sm" onchange="filterMyRequests()">
              <option value="">전체 유형</option>
              <option value="PURCHASE_REQUEST">발주 승인</option>
              <option value="PRICE_CHANGE">단가 변경</option>
              <option value="BAD_DEBT_WRITEOFF">미수금 탕감</option>
              <option value="LEAVE_ATTENDANCE">휴가/근태</option>
              <option value="SHIPMENT_HOLD">출고 승인</option>
              <option value="GENERAL">일반</option>
            </select>
            <select id="my-status-filter" class="border rounded px-2 py-1.5 text-sm" onchange="filterMyRequests()">
              <option value="">전체 상태</option>
              <option value="DRAFT">작성중</option>
              <option value="PENDING">대기</option>
              <option value="IN_REVIEW">검토중</option>
              <option value="APPROVED">승인</option>
              <option value="REJECTED">반려</option>
            </select>
          </div>
          <div class="overflow-x-auto" style="max-height: calc(100vh - 320px); overflow-y: auto;">
            <table class="w-full ds-table-striped">
              <thead><tr class="bg-gray-50 border-b text-sm text-gray-500">
                <th class="px-3 py-3 text-left">번호</th>
                <th class="px-3 py-3 text-left">유형</th>
                <th class="px-3 py-3 text-left">제목</th>
                <th class="px-3 py-3 text-right">금액</th>
                <th class="px-3 py-3 text-left">상태</th>
                <th class="px-3 py-3 text-left">요청일</th>
              </tr></thead>
              <tbody id="my-requests-tbody"></tbody>
            </table>
          </div>
          <div id="my-pagination" class="flex items-center justify-between px-4 py-3 border-t text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- 탭 3: 전체 현황 -->
      <div id="tab-all" class="tab-content hidden">
        <div class="bg-white rounded-lg shadow">
          <div class="p-4 border-b flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-bold mr-auto"><i class="fas fa-list mr-2 text-purple-600"></i>전체 결재 현황</h2>
            <input id="all-search" type="text" placeholder="검색 (제목, 번호, 요청자)" class="border rounded px-3 py-1.5 text-sm w-48" oninput="filterAllRequests()">
            <select id="all-type-filter" class="border rounded px-2 py-1.5 text-sm" onchange="filterAllRequests()">
              <option value="">전체 유형</option>
              <option value="PURCHASE_REQUEST">발주 승인</option>
              <option value="PRICE_CHANGE">단가 변경</option>
              <option value="BAD_DEBT_WRITEOFF">미수금 탕감</option>
              <option value="LEAVE_ATTENDANCE">휴가/근태</option>
              <option value="SHIPMENT_HOLD">출고 승인</option>
              <option value="GENERAL">일반</option>
            </select>
            <select id="all-status-filter" class="border rounded px-2 py-1.5 text-sm" onchange="filterAllRequests()">
              <option value="">전체 상태</option>
              <option value="DRAFT">작성중</option>
              <option value="PENDING">대기</option>
              <option value="IN_REVIEW">검토중</option>
              <option value="APPROVED">승인</option>
              <option value="REJECTED">반려</option>
            </select>
          </div>
          <div class="overflow-x-auto" style="max-height: calc(100vh - 320px); overflow-y: auto;">
            <table class="w-full ds-table-striped">
              <thead><tr class="bg-gray-50 border-b text-sm text-gray-500">
                <th class="px-3 py-3 text-left">번호</th>
                <th class="px-3 py-3 text-left">유형</th>
                <th class="px-3 py-3 text-left">제목</th>
                <th class="px-3 py-3 text-left">요청자</th>
                <th class="px-3 py-3 text-right">금액</th>
                <th class="px-3 py-3 text-left">상태</th>
                <th class="px-3 py-3 text-left">요청일</th>
              </tr></thead>
              <tbody id="all-requests-tbody"></tbody>
            </table>
          </div>
          <div id="all-pagination" class="flex items-center justify-between px-4 py-3 border-t text-sm text-gray-500"></div>
        </div>
      </div>

      <!-- 탭 4: 양식 관리 -->
      <div id="tab-templates" class="tab-content hidden">
        <div class="bg-white rounded-lg shadow">
          <div class="p-4 border-b">
            <h2 class="text-lg font-bold"><i class="fas fa-file-alt mr-2 text-green-600"></i>결재 양식</h2>
          </div>
          <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
            <table class="w-full ds-table-striped">
              <thead><tr class="bg-gray-50 border-b text-sm text-gray-500">
                <th class="px-3 py-3 text-left">양식명</th>
                <th class="px-3 py-3 text-left">유형</th>
                <th class="px-3 py-3 text-left">결재 단계</th>
                <th class="px-3 py-3 text-center w-16">관리</th>
              </tr></thead>
              <tbody id="templates-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `
  return renderPage(c, {
    title: '전자결재',
    activePage: '/approvals',
    pageContent: content,
    pageScript: approvalsScript,
  })
}
