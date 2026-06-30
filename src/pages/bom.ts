// ============================================================================
// 자재명세(BOM) 페이지 — 신모델 product_materials 기반 읽기전용 개요
// 편집은 items 페이지(원자재 연결). MRP/bom_items 구버전은 은퇴(2026-07-01).
// ============================================================================

import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import bomScript from '../scripts/bom.js?raw'

export const bomPage = (c: Context<HonoEnv>) => {
  const content = `
    <div class="space-y-4">
      <!-- 안내 -->
      <div class="ds-card p-4 flex items-start justify-between gap-4">
        <div class="text-sm text-gray-600 flex items-start gap-2">
          <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
          <span>제품별로 연결된 <b>원단/자재</b>와 자동 차감 설정을 보여줍니다. 인쇄 완료 시 이 설정대로 재고가 차감됩니다.
          자재 연결 수정은 <a href="/items" class="text-blue-600 underline">품목 관리</a>에서 합니다.</span>
        </div>
        <a href="/items" class="shrink-0 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 whitespace-nowrap">
          <i class="fas fa-link mr-1"></i>품목에서 자재 연결
        </a>
      </div>

      <!-- 요약 -->
      <div id="bom-summary" class="grid grid-cols-3 gap-3"></div>

      <!-- 미연결 경고 -->
      <div id="bom-unmapped" class="hidden ds-card border border-amber-300 bg-amber-50">
        <div class="flex items-center justify-between p-3 border-b border-amber-200 cursor-pointer" onclick="toggleUnmapped()">
          <h3 class="text-sm font-bold text-amber-800">
            <i class="fas fa-triangle-exclamation mr-1"></i>자재 미연결 제품 <span id="bom-unmapped-count"></span>
            <span class="font-normal text-amber-700">— 인쇄해도 재고가 차감되지 않습니다</span>
          </h3>
          <i id="bom-unmapped-chevron" class="fas fa-chevron-down text-amber-700"></i>
        </div>
        <div id="bom-unmapped-body" class="hidden p-3 max-h-64 overflow-y-auto"></div>
      </div>

      <!-- 자재명세 개요 -->
      <div class="ds-card">
        <div class="flex justify-between items-center p-4 border-b">
          <h2 class="text-lg font-bold"><i class="fas fa-sitemap mr-2 text-blue-600"></i>자재명세 (제품 → 자재)</h2>
          <input id="bom-search" type="text" placeholder="제품/자재 검색" oninput="renderBomOverview()"
                 class="border rounded px-3 py-1.5 text-sm w-56">
        </div>
        <div class="overflow-x-auto" style="max-height: calc(100vh - 360px); overflow-y: auto;">
          <table class="w-full ds-table ds-table-striped">
            <thead>
              <tr class="bg-gray-50 border-b text-sm text-gray-600">
                <th class="col-name px-4 py-3 text-left">제품</th>
                <th class="col-flex px-4 py-3 text-left">연결 자재</th>
                <th class="col-tag px-4 py-3 text-center">차감방식</th>
                <th class="col-qty px-4 py-3 text-right">폭(mm)</th>
                <th class="col-tag px-4 py-3 text-center">규격</th>
                <th class="col-qty px-4 py-3 text-right">로스율</th>
                <th class="col-qty px-4 py-3 text-center">단위</th>
              </tr>
            </thead>
            <tbody id="bom-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `
  return renderPage(c, {
    title: '자재명세(BOM)',
    activePage: '/bom',
    pageContent: content,
    pageScript: bomScript,
  })
}
