import type { Context } from 'hono'
import { renderPage } from '../layout'
// @ts-ignore — Vite raw import
import shipmentsDashboardScript from '../scripts/shipmentsDashboard.js?raw'

// 출고 예정·실적 마크업 — /shipments 탭과 독립 /shipments-dashboard 가 **같은 것**을 쓴다(2026-09-23).
//   예전엔 두 벌이라 한쪽만 고치면 스크립트의 getElementById 가 다른 쪽에서 조용히 빗나갔다.
// 배송방법 선택지는 서버가 준 「그날 실제로 있는 값」으로 채운다(서버는 정확히 일치로 거른다) —
//   종전 고정 목록 「택배」「화물」은 실값(대신택배·한진택배·대신화물·배송)과 안 맞아 고르면 늘 0건이었다.
export const shipPlanMarkup = `
        <div class="ds-container space-y-4">
          <div class="ds-card p-3">
            <div class="flex flex-wrap items-end gap-3">
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">날짜 (납기)</label>
                <div class="flex items-center gap-1">
                  <button onclick="window.setDashDate('prev')" class="px-2 py-1 text-xs border rounded hover:bg-gray-50" title="하루 전"><i class="fas fa-chevron-left"></i></button>
                  <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="dashDate" class="js-fp border rounded px-2 py-1 text-xs" style="color:var(--c-text);width:100px" />
                  <button onclick="window.setDashDate('next')" class="px-2 py-1 text-xs border rounded hover:bg-gray-50" title="하루 뒤"><i class="fas fa-chevron-right"></i></button>
                  <button onclick="window.setDashDate('today')" class="px-2 py-1 text-xs border rounded hover:bg-gray-50">오늘</button>
                  <button onclick="window.setDashDate('tomorrow')" class="px-2 py-1 text-xs border rounded hover:bg-gray-50" title="전날 저녁에 내일 나갈 것 정리">내일</button>
                </div>
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">배송방법</label>
                <select id="dashMethod" class="border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
                  <option value="">전체</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">상태</label>
                <select id="dashStatus" class="border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
                  <option value="all">전체</option>
                  <option value="unshipped">미출고</option>
                  <option value="shipped">출고완료</option>
                  <option value="ready">준비완료·미출고</option>
                  <option value="preparing">준비중</option>
                  <option value="carried">이월(납기 경과)</option>
                </select>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <button onclick="window.resetDashFilters()" class="text-gray-500 text-xs">초기화</button>
                <button onclick="window.printShipPlan()" class="px-3 py-1 border border-gray-300 text-gray-700 text-xs rounded hover:bg-gray-50" title="지금 보이는 목록을 A4 체크표로 인쇄">
                  <i class="fas fa-print mr-1"></i>예정표 인쇄
                </button>
                <button onclick="window.loadDashboard()" class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-all">
                  <i class="fas fa-rotate mr-1"></i>새로고침
                </button>
              </div>
            </div>
            <div class="text-[11px] text-gray-400 mt-2">납기가 이 날인 주문 전체 + 납기가 지났는데 안 나간 주문(최근 7일, 「이월」). 출고한 건도 「출고완료」로 남아 나간 것·안 나간 것을 한 화면에서 봅니다.</div>
          </div>

          <!-- 요약 — 카운터는 필터와 무관하게 그날 전체 기준 -->
          <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div class="ds-card p-2.5 text-center md:col-span-1 col-span-2">
              <div class="text-xl font-bold tabular-nums"><span id="dashShipped" class="text-green-600">-</span><span class="text-gray-300 mx-1">/</span><span id="dashPlanned" style="color:var(--c-text)">-</span></div>
              <div class="text-[10px] text-gray-400">출고완료 / 납기 예정 <span id="dashShipPct"></span></div>
              <div class="h-1.5 bg-gray-100 rounded mt-1 overflow-hidden"><div id="dashShipBar" class="h-full bg-green-500" style="width:0%"></div></div>
            </div>
            <div class="ds-card p-2.5 text-center">
              <div id="dashReady" class="text-xl font-bold tabular-nums text-blue-600">-</div>
              <div class="text-[10px] text-gray-400">준비완료·미출고</div>
            </div>
            <div class="ds-card p-2.5 text-center">
              <div id="dashPreparing" class="text-xl font-bold tabular-nums text-amber-600">-</div>
              <div class="text-[10px] text-gray-400">준비중</div>
            </div>
            <div class="ds-card p-2.5 text-center col-span-2 md:col-span-2">
              <div id="dashCarried" class="text-xl font-bold tabular-nums text-red-600">-</div>
              <div class="text-[10px] text-gray-400">이월 미출고 (납기 경과) <span id="dashCarriedShipped" class="text-green-600"></span></div>
            </div>
          </div>

          <div id="dashContent">
            <div class="space-y-2">
              <div class="ds-skeleton ds-skeleton-card"></div>
              <div class="ds-skeleton ds-skeleton-card"></div>
              <div class="ds-skeleton ds-skeleton-card"></div>
            </div>
          </div>
        </div>
`

export function shipmentsDashboardPage(c: Context) {
  return renderPage(c, {
    title: '출고 예정·실적',
    activePage: '/shipments-dashboard',
    pageScript: shipmentsDashboardScript,
    pageContent: shipPlanMarkup
  })
}
