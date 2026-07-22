import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/quotations.js?raw'

export function quotationsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '견적서 관리',
    activePage: '/quotations',
    pageContent: `
      <!-- 통계 카드 4개 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="ds-card ds-card-compact cursor-pointer" style="text-align:center" onclick="filterByQuotStatus('')">
          <div class="text-sm" style="color:var(--c-text-secondary)">총 견적수</div>
          <div class="text-3xl font-bold" style="color:var(--c-text)" id="statTotal">-</div>
        </div>
        <div class="ds-card ds-card-compact cursor-pointer" style="text-align:center" onclick="filterByQuotStatus('valid')">
          <div class="text-sm" style="color:var(--c-text-secondary)">유효 견적</div>
          <div class="text-3xl font-bold" style="color:var(--c-text)" id="statValid">-</div>
        </div>
        <div class="ds-card ds-card-compact cursor-pointer" style="text-align:center" onclick="filterByQuotStatus('expired')">
          <div class="text-sm" style="color:var(--c-text-secondary)">만료 견적</div>
          <div class="text-3xl font-bold" style="color:var(--c-danger)" id="statExpired">-</div>
        </div>
        <div class="ds-card ds-card-compact" style="text-align:center">
          <div class="text-sm" style="color:var(--c-text-secondary)">총 견적금액</div>
          <div class="text-2xl font-bold" style="color:var(--c-primary)" id="statAmount">-</div>
        </div>
      </div>

      <!-- 필터 바 -->
      <div class="ds-filter-bar">
        <div class="ds-filter-field" style="min-width:100px">
          <label class="ds-label">상태</label>
          <select id="quotStatusFilter" onchange="loadQuotations(1)" class="ds-input">
            <option value="">전체 상태</option>
            <option value="valid">유효</option>
            <option value="expired">만료</option>
            <option value="converted">주문전환</option>
          </select>
        </div>
        <div class="ds-filter-field" style="flex:1;min-width:160px">
          <label class="ds-label">거래처</label>
          <input type="text" id="quotClientSearch" placeholder="거래처 검색..."
            class="ds-input"
            onkeyup="if(event.key==='Enter')loadQuotations(1)">
        </div>
        <div class="ds-filter-field" style="min-width:130px">
          <label class="ds-label">작성일 from</label>
          <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="quotDateFrom" class="js-fp ds-input"
            onchange="loadQuotations(1)">
        </div>
        <div class="ds-filter-field" style="min-width:130px">
          <label class="ds-label">~ to</label>
          <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="quotDateTo" class="js-fp ds-input"
            onchange="loadQuotations(1)">
        </div>
        <div class="ds-filter-actions">
          <button onclick="loadQuotations(1)" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-search" style="margin-right:4px"></i>검색
          </button>
          <a href="/quotation-form" class="ds-btn ds-btn-primary ds-btn-sm" style="text-decoration:none;">
            <i class="fas fa-plus" style="margin-right:4px"></i>새 견적서
          </a>
        </div>
      </div>

      <!-- 견적 목록 테이블 -->
      <style>
        /* 견적 리스트 전용: 헤더/바디 셀 패딩 통일(정렬 일치) + 액션 컬럼 잘림 방지 (주문 리스트 ord-tbl과 동일 패턴) */
        .ds-table.quot-tbl thead th, .ds-table.quot-tbl tbody td { padding: 7px 8px; }
        .ds-table.quot-tbl td.quot-act { overflow: visible; }
      </style>
      <div class="ds-card" style="padding:0;overflow:hidden;">
        <div class="ds-table-wrap">
          <table class="ds-table ds-table-striped quot-tbl">
            <thead>
              <tr>
                <th style="width:140px">견적번호</th>
                <th style="width:150px">거래처</th>
                <th>품목</th>
                <th style="width:110px;text-align:right">금액</th>
                <th style="width:95px;text-align:center">유효기한</th>
                <th style="width:85px;text-align:center">상태</th>
                <th style="width:90px;text-align:center">작성일</th>
                <th style="width:118px;text-align:center">액션</th>
              </tr>
            </thead>
            <tbody id="quotTableBody">
              <tr><td colspan="8" class="px-4 py-8 text-center" style="color:var(--c-text-muted)">로딩 중...</td></tr>
            </tbody>
          </table>
        </div>
        <div id="quotPagination" class="px-6 py-3 flex items-center gap-2 flex-wrap" style="border-top:1px solid var(--c-border)"></div>
      </div>

      <!-- 상세 모달 -->
      <div id="quotDetailModal" class="ds-modal-overlay hidden">
        <div class="ds-modal ds-modal-wide">
          <div class="ds-modal-body" id="quotDetailContent"></div>
        </div>
      </div>
    `,
    pageScript
  })
}
