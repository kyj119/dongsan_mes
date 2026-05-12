import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/dashboard.js?raw'

export function dashboardPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '대시보드',
    activePage: '/dashboard',
    pageContent: `
            <!-- Quick Stats — Bento Grid -->
            <div id="kpiArea" class="ds-bento mb-8">
                <!-- Hero: 이번 달 매출 (2col × 2row) -->
                <div class="ds-card ds-bento-hero" style="border-left:4px solid var(--c-purple);">
                    <div class="flex items-center justify-between mb-2">
                        <div class="text-sm font-medium" style="color:var(--c-text-secondary)">이번 달 매출</div>
                        <i class="fas fa-won-sign" style="color:var(--c-purple);opacity:0.5"></i>
                    </div>
                    <div style="font-size:36px;font-weight:800;color:var(--c-purple);font-variant-numeric:tabular-nums;line-height:1.1" id="statMonthRevenue">-</div>
                    <div class="flex items-center gap-2 mt-3" id="statMonthChange" style="color:var(--c-text-muted);font-size:var(--fs-sm)">-</div>
                    <div class="flex items-center gap-4 mt-auto pt-4" style="border-top:1px solid var(--c-border-light)">
                        <div><div class="text-xs" style="color:var(--c-text-muted)">오늘</div><div class="font-bold tabular-nums" style="color:var(--c-text)" id="statTodayRevenueSub">-</div></div>
                    </div>
                </div>
                <!-- 오늘 주문 -->
                <div class="ds-card ds-card-compact">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-sm" style="color:var(--c-text-secondary)">오늘 주문</div>
                        <i class="fas fa-shopping-cart text-xs" style="color:var(--c-primary);opacity:0.6"></i>
                    </div>
                    <div class="text-3xl font-bold tabular-nums" style="color:var(--c-primary)" id="statTodayOrders">-</div>
                </div>
                <!-- 긴급 주문 -->
                <div class="ds-card ds-card-compact cursor-pointer" onclick="location.href='/orders?priority=URGENT'" id="kpiUrgentCard">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-sm" style="color:var(--c-text-secondary)">긴급 주문</div>
                        <i class="fas fa-bolt text-xs" style="color:var(--c-orange);opacity:0.6"></i>
                    </div>
                    <div class="text-3xl font-bold tabular-nums" style="color:var(--c-orange)" id="statUrgentCount">-</div>
                    <div class="text-xs mt-1" style="color:var(--c-text-muted)">진행 중 긴급건</div>
                </div>
                <!-- 생산 현황 -->
                <div class="ds-card ds-card-compact">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-sm" style="color:var(--c-text-secondary)">생산 현황</div>
                        <i class="fas fa-print text-xs" style="color:var(--c-success);opacity:0.6"></i>
                    </div>
                    <div class="text-3xl font-bold tabular-nums" style="color:var(--c-success)" id="statProductionOrders">-</div>
                    <div class="text-xs mt-1" style="color:var(--c-text-muted)">출고대기 <span class="font-semibold tabular-nums" style="color:var(--c-warning)" id="statShipmentReady">-</span>건</div>
                </div>
                <!-- 오늘 출고 -->
                <div class="ds-card ds-card-compact cursor-pointer" onclick="location.href='/shipments'">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-sm" style="color:var(--c-text-secondary)">오늘 출고</div>
                        <i class="fas fa-truck text-xs" style="color:var(--c-warning);opacity:0.6"></i>
                    </div>
                    <div class="text-3xl font-bold tabular-nums" style="color:var(--c-warning)" id="statTodayShipment">-</div>
                    <div class="text-xs mt-1 tabular-nums" id="statTodayShipmentSub" style="color:var(--c-text-muted)">-</div>
                </div>
                <!-- 미수금 -->
                <div class="ds-card ds-card-compact">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-sm" style="color:var(--c-text-secondary)">미수금</div>
                        <i class="fas fa-exclamation-triangle text-xs" style="color:var(--c-danger);opacity:0.6"></i>
                    </div>
                    <div class="text-3xl font-bold tabular-nums" style="color:var(--c-danger)" id="statKpiReceivables">-</div>
                    <div class="text-xs mt-1 tabular-nums" id="statKpiOver30" style="color:var(--c-text-muted)">30일+ -</div>
                </div>
                <!-- 수금률 -->
                <div class="ds-card ds-card-compact">
                    <div class="flex items-center justify-between mb-1">
                        <div class="text-sm" style="color:var(--c-text-secondary)">수금률</div>
                        <i class="fas fa-hand-holding-usd text-xs" style="color:var(--c-teal);opacity:0.6"></i>
                    </div>
                    <div class="text-3xl font-bold tabular-nums" style="color:var(--c-teal)" id="statCollectionRate">-</div>
                    <div class="text-xs mt-1 tabular-nums" style="color:var(--c-text-muted)" id="statCollectionDetail">이번 달</div>
                </div>
            </div>

            <!-- 검수 대기 경고 카드 (PENDING_REVIEW 건수 > 0 시 노출) -->
            <div id="dashPendingReview" class="hidden bg-white rounded-lg border border-red-200 shadow-sm hover:shadow-md transition-shadow p-4 mb-6 cursor-pointer" onclick="location.href='/inspections'">
                <div class="text-sm text-gray-600"><i class="fas fa-exclamation-triangle text-red-400 mr-1"></i>검수 대기</div>
                <div class="text-2xl font-bold text-red-600 tabular-nums" id="dashPendingReviewCount">0</div>
                <div class="text-xs text-gray-400 mt-1">관리자 확인 필요 — 클릭하여 검수 페이지 이동</div>
            </div>

            <!-- 금일 납기 경고 + 주문 추이 + 카드 분포 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div class="ds-card">
                <div class="ds-card-header">
                  <h3 class="ds-card-title">
                    <i class="fas fa-exclamation-circle" style="color:var(--c-danger);margin-right:6px"></i>
                    납기 도래/지연 주문
                    <span class="text-xs font-normal" style="color:var(--c-text-muted);margin-left:4px" id="todayDueCount"></span>
                  </h3>
                </div>
                <div id="todayDueList" class="space-y-2 max-h-[240px] overflow-y-auto"></div>
              </div>

              <div class="ds-card">
                <div class="ds-card-header">
                  <h3 class="ds-card-title">
                    <i class="fas fa-chart-bar" style="color:var(--c-primary);margin-right:6px"></i>
                    최근 7일 주문 추이
                  </h3>
                </div>
                <div id="weeklyTrend" class="space-y-1"></div>
              </div>

              <div class="ds-card">
                <div class="ds-card-header">
                  <h3 class="ds-card-title">
                    <i class="fas fa-chart-pie" style="color:var(--c-success);margin-right:6px"></i>
                    카드 상태 분포
                  </h3>
                </div>
                <div id="cardDistribution" class="space-y-2"></div>
              </div>
            </div>

            <!-- 금일 생산 실적 + 장비 가동률 -->
            <div class="grid grid-cols-2 gap-6 mb-8">
              <div class="ds-card">
                <div class="ds-card-header">
                  <h3 class="ds-card-title">
                    <i class="fas fa-industry" style="color:var(--c-info);margin-right:6px"></i>
                    금일 생산 실적
                  </h3>
                  <a href="/production-reports" class="ds-btn ds-btn-ghost ds-btn-sm">상세 &rarr;</a>
                </div>
                <div id="productionToday" class="space-y-3"></div>
              </div>
              <div class="ds-card">
                <div class="ds-card-header">
                  <h3 class="ds-card-title">
                    <i class="fas fa-tachometer-alt" style="color:var(--c-success);margin-right:6px"></i>
                    장비 가동률 (최근 7일)
                  </h3>
                  <a href="/production-reports" class="ds-btn ds-btn-ghost ds-btn-sm">상세 &rarr;</a>
                </div>
                <div id="uptimeWeekly" class="space-y-2"></div>
              </div>
            </div>

            <!-- 진행 중인 작업 -->
            <div class="ds-card mb-8">
                <div class="ds-card-header">
                    <h3 class="ds-card-title" style="font-size:var(--fs-lg)">
                        <i class="fas fa-print" style="color:var(--c-primary);margin-right:8px"></i>
                        진행 중인 작업
                    </h3>
                    <span class="text-sm" style="color:var(--c-text-secondary)" id="activeCardsCount"></span>
                </div>
                <div id="activeCardsList" class="ds-table-wrap"></div>
            </div>

            <!-- 최근 활동 목록 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <div class="ds-card">
                <div class="ds-card-header" style="margin-bottom:var(--space-md)">
                  <h3 class="ds-card-title">
                    <i class="fas fa-file-alt" style="color:var(--c-primary);margin-right:6px"></i>
                    최근 주문 5건
                  </h3>
                  <a href="/orders" class="ds-btn ds-btn-ghost ds-btn-sm">전체 &rarr;</a>
                </div>
                <div id="recentOrdersList" class="space-y-2"></div>
              </div>
              <div class="ds-card">
                <div class="ds-card-header" style="margin-bottom:var(--space-md)">
                  <h3 class="ds-card-title">
                    <i class="fas fa-truck" style="color:var(--c-success);margin-right:6px"></i>
                    최근 출고 5건
                  </h3>
                  <a href="/shipments" class="ds-btn ds-btn-ghost ds-btn-sm">전체 &rarr;</a>
                </div>
                <div id="recentShipmentsList" class="space-y-2"></div>
              </div>
            </div>

            <!-- Revenue Stats -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div class="ds-card" style="background:linear-gradient(135deg,var(--c-primary),var(--c-primary-dark));color:#fff;">
                    <div class="text-sm" style="opacity:0.9;margin-bottom:8px">오늘 매출</div>
                    <div class="text-2xl font-bold" id="statTodayRevenue">0원</div>
                </div>
                <div class="ds-card" style="background:linear-gradient(135deg,var(--c-success),#15803d);color:#fff;">
                    <div class="text-sm" style="opacity:0.9;margin-bottom:8px">이번 주 매출</div>
                    <div class="text-2xl font-bold" id="statWeekRevenue">0원</div>
                </div>
                <div class="ds-card" style="background:linear-gradient(135deg,var(--c-purple),#6d28d9);color:#fff;">
                    <div class="text-sm" style="opacity:0.9;margin-bottom:8px">총 매출</div>
                    <div class="text-2xl font-bold" id="statTotalRevenue">0원</div>
                </div>
            </div>

            <!-- 미수금 현황 -->
            <div class="grid grid-cols-2 gap-6 mb-8">
              <div class="ds-card">
                <div class="ds-card-header" style="margin-bottom:var(--space-md)">
                  <h3 class="ds-card-title" style="font-size:var(--fs-lg)">
                    <i class="fas fa-exclamation-triangle" style="color:var(--c-danger);margin-right:8px"></i>
                    미수금 TOP 10
                  </h3>
                </div>
                <div class="flex items-center justify-between mb-3 text-sm">
                  <span style="color:var(--c-text-secondary)">총 미수금</span>
                  <span class="text-xl font-bold" style="color:var(--c-danger)" id="statTotalReceivables">-</span>
                </div>
                <div id="receivablesClients" class="space-y-2 max-h-[360px] overflow-y-auto"></div>
              </div>
              <div class="ds-card">
                <div class="ds-card-header" style="margin-bottom:var(--space-md)">
                  <h3 class="ds-card-title" style="font-size:var(--fs-lg)">
                    <i class="fas fa-clock" style="color:var(--c-warning);margin-right:8px"></i>
                    연체 현황 (Aging)
                  </h3>
                </div>
                <div id="agingBuckets" class="space-y-3"></div>
                <div style="margin-top:var(--space-lg);padding-top:var(--space-md);border-top:1px solid var(--c-border)">
                  <h4 class="text-sm font-semibold mb-3" style="color:var(--c-text-secondary)">주요 거래처 TOP 5</h4>
                  <div id="topClients" class="space-y-2"></div>
                </div>
              </div>
            </div>

            <!-- 납기 지연 발주 -->
            <div class="ds-card mb-8" id="overduePosSection" style="display:none;">
                <div class="ds-card-header" style="margin-bottom:var(--space-md)">
                  <h3 class="ds-card-title" style="font-size:var(--fs-lg)">
                    <i class="fas fa-truck" style="color:var(--c-danger);margin-right:8px"></i>
                    납기 지연 발주
                    <span class="text-sm font-normal ml-2" style="color:var(--c-text-secondary)" id="overduePoCount"></span>
                  </h3>
                </div>
                <div id="overduePosList" class="space-y-2 max-h-[300px] overflow-y-auto"></div>
            </div>

            <!-- 재고 부족 경고 -->
            <div class="ds-card mb-8" id="lowStockSection" style="display:none;">
                <div class="ds-card-header" style="margin-bottom:var(--space-md)">
                  <h3 class="ds-card-title" style="font-size:var(--fs-lg)">
                    <i class="fas fa-box-open" style="color:var(--c-warning);margin-right:8px"></i>
                    재고 부족 경고
                    <span class="text-sm font-normal ml-2" style="color:var(--c-text-secondary)" id="lowStockCount"></span>
                  </h3>
                </div>
                <div id="lowStockList" class="space-y-2 max-h-[300px] overflow-y-auto"></div>
            </div>

            <!-- 장비 부하 현황 -->
            <div class="ds-card mb-8" id="equipmentLoadSection" style="display:none;">
                <div class="ds-card-header">
                    <h3 class="ds-card-title" style="font-size:var(--fs-lg)">
                        <i class="fas fa-server" style="color:var(--c-info);margin-right:8px"></i>
                        장비 부하 현황
                    </h3>
                    <a href="/schedule" class="ds-btn ds-btn-ghost ds-btn-sm">스케줄 보드 &rarr;</a>
                </div>
                <div id="equipmentLoadList" class="grid grid-cols-2 md:grid-cols-3 gap-3"></div>
            </div>

            <!-- 정비/소모품 알림 -->
            <div class="ds-card mb-8" id="maintenanceAlertsSection" style="display:none;">
                <div class="ds-card-header">
                    <h3 class="ds-card-title" style="font-size:var(--fs-lg)">
                        <i class="fas fa-wrench" style="color:var(--c-warning);margin-right:8px"></i>
                        정비/소모품 알림
                        <span class="text-sm font-normal ml-2" style="color:var(--c-text-secondary)" id="maintenanceAlertCount"></span>
                    </h3>
                    <a href="/equipment" class="ds-btn ds-btn-ghost ds-btn-sm">장비 관리 &rarr;</a>
                </div>
                <div id="maintenanceAlertList" class="space-y-2 max-h-[300px] overflow-y-auto"></div>
            </div>

            <!-- 후가공 현황 -->
            <div class="ds-card mb-8">
                <div class="ds-card-header" style="margin-bottom:var(--space-md)">
                  <h3 class="ds-card-title" style="font-size:var(--fs-lg)">
                    <i class="fas fa-tools" style="color:var(--c-warning);margin-right:8px"></i>
                    후가공 현황 (활성 카드)
                  </h3>
                </div>
                <div id="ppStats" class="space-y-2"></div>
            </div>

            <!-- System Status -->
            <div class="ds-card">
                <div class="ds-card-header" style="margin-bottom:var(--space-md)">
                  <h3 class="ds-card-title" style="font-size:var(--fs-xl)">
                    <i class="fas fa-check-circle" style="color:var(--c-success);margin-right:8px"></i>
                    시스템 상태
                  </h3>
                </div>
                <div id="status" style="color:var(--c-text-secondary)">
                    시스템 상태를 확인하는 중...
                </div>
            </div>
    `,
    pageScript
  })
}
