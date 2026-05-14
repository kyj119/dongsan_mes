import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/deliveryAnalytics.js?raw'

export function deliveryAnalyticsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '납기 분석',
    activePage: '/delivery-analytics',
    pageCSS: `
      .summary-card { border: 1px solid var(--c-border); }
      .summary-card .label { font-size: var(--fs-xs); color: var(--c-text-secondary); margin-bottom: 4px; }
      .summary-card .value { font-size: 28px; font-weight: 700; }
      .summary-card .unit { font-size: var(--fs-xs); color: var(--c-text-secondary); margin-left: 4px; }
      .dwell-bar-container { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
      .dwell-bar-label { min-width: 120px; font-size: var(--fs-sm); font-weight: 500; }
      .dwell-bar-track { flex: 1; height: 24px; background: #f3f4f6; border-radius: 4px; overflow: hidden; position: relative; }
      .dwell-bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #1e40af); display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 11px; color: white; font-weight: 600; }
      .dwell-bar-value { min-width: 80px; text-align: right; font-size: var(--fs-xs); color: var(--c-text-secondary); font-family: monospace; }
      .filter-bar select, .filter-bar button { font-size: var(--fs-sm); }
    `,
    pageContent: `
      <div class="space-y-4">

        <!-- 상단 요약 카드 -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="ds-card ds-card-compact summary-card" style="border-color:#10b981;">
            <div class="label"><i class="fas fa-check-circle" style="color:#10b981;margin-right:4px"></i>납기 준수율</div>
            <div class="value" style="color:#10b981" id="onTimeRate">-<span class="unit">%</span></div>
          </div>
          <div class="ds-card ds-card-compact summary-card">
            <div class="label"><i class="fas fa-truck" style="color:#3b82f6;margin-right:4px"></i>오늘 출고 예정</div>
            <div class="value" style="color:#3b82f6" id="dueTodayCount">-<span class="unit">건</span></div>
          </div>
          <div class="ds-card ds-card-compact summary-card">
            <div class="label"><i class="fas fa-hourglass-half" style="color:#f59e0b;margin-right:4px"></i>평균 처리시간</div>
            <div class="value" style="color:#f59e0b" id="avgProcessTime">-<span class="unit">시간</span></div>
          </div>
          <div class="ds-card ds-card-compact summary-card" style="border-color:#ef4444;">
            <div class="label"><i class="fas fa-exclamation-triangle" style="color:#ef4444;margin-right:4px"></i>지연 건수</div>
            <div class="value" style="color:#ef4444" id="delayedCount">-<span class="unit">건</span></div>
          </div>
        </div>

        <!-- 필터 바 -->
        <div class="ds-card ds-card-compact flex flex-wrap gap-2 items-center filter-bar">
          <label style="font-size:var(--fs-sm);color:var(--c-text-secondary);">기간</label>
          <input type="date" id="dateFrom" class="ds-input" style="width:auto" />
          <span style="color:var(--c-text-secondary);">~</span>
          <input type="date" id="dateTo" class="ds-input" style="width:auto" />
          <div class="ml-auto flex gap-2">
            <button onclick="loadDeliveryAnalytics()" class="ds-btn ds-btn-primary ds-btn-sm">
              <i class="fas fa-search" style="margin-right:4px"></i>조회
            </button>
            <button onclick="resetFilters()" class="ds-btn ds-btn-ghost ds-btn-sm">
              <i class="fas fa-redo" style="margin-right:4px"></i>초기화
            </button>
            <button onclick="exportDeliveryAnalyticsCsv()" class="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"><i class="fas fa-file-csv mr-1"></i>CSV</button>
          </div>
        </div>

        <!-- 상태별 평균 체류시간 -->
        <div class="ds-card ds-card-compact">
          <div style="padding-bottom:12px;border-bottom:1px solid var(--c-border);margin-bottom:16px;">
            <h3 style="font-size:14px;font-weight:600;color:#374151;margin:0;">
              <i class="fas fa-hourglass-end" style="color:#3b82f6;margin-right:6px;"></i>상태별 평균 체류시간
            </h3>
          </div>
          <div id="dwellTimeContent" style="min-height:120px;display:flex;flex-direction:column;gap:4px;"></div>
        </div>

        <!-- 최근 지연 주문 테이블 -->
        <div class="ds-card" style="padding:0;overflow:hidden;">
          <div style="padding:var(--space-md);border-bottom:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-between;">
            <h2 class="ds-card-title">
              <i class="fas fa-clock" style="color:#ef4444;margin-right:8px"></i>최근 지연 주문
            </h2>
            <span id="delayedTableCount" style="font-size:12px;color:#9ca3af;">0건</span>
          </div>
          <div class="ds-table-wrap">
            <table id="delayedOrdersTable" class="ds-table ds-table-compact ds-table-striped">
              <thead>
                <tr>
                  <th style="min-width:100px;">주문번호</th>
                  <th style="min-width:120px;">거래처</th>
                  <th style="min-width:100px;">품목</th>
                  <th style="text-align:center;">규격</th>
                  <th style="text-align:center;">수량</th>
                  <th style="text-align:center;">납기일</th>
                  <th style="text-align:center;">지연일수</th>
                  <th style="text-align:center;">상태</th>
                </tr>
              </thead>
              <tbody id="delayedOrdersBody">
                <tr><td colspan="8" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `,
    pageScript
  })
}
