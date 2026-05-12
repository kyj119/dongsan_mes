// Skeleton loading
(function initSkeletons() {
  var kpi = document.getElementById('kpiArea');
  if (kpi && window.dsSkeleton) kpi.innerHTML = dsSkeleton.stat(7);
  var skeletonTargets = ['todayDueList','weeklyTrend','cardDistribution','productionToday','uptimeWeekly','activeCardsList','receivablesClients','agingBuckets','topClients','ppStats','recentOrdersList','recentShipmentsList'];
  skeletonTargets.forEach(function(id) {
    var el = document.getElementById(id);
    if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(3, 3);
  });
})();

// 증감률 뱃지 HTML 반환
function changeRateBadge(current, prev) {
  if (!prev || prev === 0) return '';
  var rate = Math.round(((current - prev) / prev) * 100);
  if (rate > 0) return '<span class="text-green-600 text-xs font-semibold tabular-nums">▲ ' + rate + '%</span><span class="text-xs text-gray-400 ml-1">전월 대비</span>';
  if (rate < 0) return '<span class="text-red-500 text-xs font-semibold tabular-nums">▼ ' + Math.abs(rate) + '%</span><span class="text-xs text-gray-400 ml-1">전월 대비</span>';
  return '<span class="text-gray-400 text-xs">전월 동일</span>';
}

// 금액 포맷
function fmtAmt(v) { return (v || 0).toLocaleString() + '원'; }
function fmtAmtShort(v) {
  var n = v || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억원';
  if (n >= 10000) return Math.round(n / 10000) + '만원';
  return n.toLocaleString() + '원';
}

// Check system health
axios.get('/api/health')
    .then(response => {
        document.getElementById('status').innerHTML =
            '<div class="flex items-center gap-4">' +
            '<div class="flex items-center"><i class="fas fa-circle text-green-500 mr-2"></i><span>API: 정상</span></div>' +
            '<div class="text-sm text-gray-500">' + new Date(response.data.timestamp).toLocaleString('ko-KR') + '</div>' +
            '</div>';
        return axios.get('/api/db-test');
    })
    .then(response => {
        const statusDiv = document.getElementById('status');
        statusDiv.innerHTML += '<div class="flex items-center mt-2"><i class="fas fa-circle text-green-500 mr-2"></i><span>데이터베이스: 정상 연결</span></div>';
    })
    .catch(error => {
        document.getElementById('status').innerHTML =
            '<div class="flex items-center"><i class="fas fa-circle text-red-500 mr-2"></i><span>시스템 오류: ' + error.message + '</span></div>';
    });

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        const statsResponse = await axios.get('/api/dashboard/stats');
        if (statsResponse.data.success) {
            const stats = statsResponse.data.data;
            // Restore KPI cards from skeleton (Bento Grid)
            var kpiArea = document.getElementById('kpiArea');
            if (kpiArea && kpiArea.querySelector('.ds-skeleton')) {
              kpiArea.innerHTML =
                '<div class="ds-card ds-bento-hero" style="border-left:4px solid var(--c-purple);"><div class="flex items-center justify-between mb-2"><div class="text-sm font-medium" style="color:var(--c-text-secondary)">이번 달 매출</div><i class="fas fa-won-sign" style="color:var(--c-purple);opacity:0.5"></i></div><div style="font-size:36px;font-weight:800;color:var(--c-purple);font-variant-numeric:tabular-nums;line-height:1.1" id="statMonthRevenue">-</div><div class="flex items-center gap-2 mt-3" id="statMonthChange" style="color:var(--c-text-muted);font-size:var(--fs-sm)">-</div><div class="flex items-center gap-4 mt-auto pt-4" style="border-top:1px solid var(--c-border-light)"><div><div class="text-xs" style="color:var(--c-text-muted)">오늘</div><div class="font-bold tabular-nums" style="color:var(--c-text)" id="statTodayRevenueSub">-</div></div></div></div>'
                + '<div class="ds-card ds-card-compact"><div class="flex items-center justify-between mb-1"><div class="text-sm" style="color:var(--c-text-secondary)">오늘 주문</div><i class="fas fa-shopping-cart text-xs" style="color:var(--c-primary);opacity:0.6"></i></div><div class="text-3xl font-bold tabular-nums" style="color:var(--c-primary)" id="statTodayOrders">-</div></div>'
                + '<div class="ds-card ds-card-compact cursor-pointer" onclick="location.href=\'/orders?priority=URGENT\'" id="kpiUrgentCard"><div class="flex items-center justify-between mb-1"><div class="text-sm" style="color:var(--c-text-secondary)">긴급 주문</div><i class="fas fa-bolt text-xs" style="color:var(--c-orange);opacity:0.6"></i></div><div class="text-3xl font-bold tabular-nums" style="color:var(--c-orange)" id="statUrgentCount">-</div><div class="text-xs mt-1" style="color:var(--c-text-muted)">진행 중 긴급건</div></div>'
                + '<div class="ds-card ds-card-compact"><div class="flex items-center justify-between mb-1"><div class="text-sm" style="color:var(--c-text-secondary)">생산 현황</div><i class="fas fa-print text-xs" style="color:var(--c-success);opacity:0.6"></i></div><div class="text-3xl font-bold tabular-nums" style="color:var(--c-success)" id="statProductionOrders">-</div><div class="text-xs mt-1" style="color:var(--c-text-muted)">출고대기 <span class="font-semibold tabular-nums" style="color:var(--c-warning)" id="statShipmentReady">-</span>건</div></div>'
                + '<div class="ds-card ds-card-compact cursor-pointer" onclick="location.href=\'/shipments\'"><div class="flex items-center justify-between mb-1"><div class="text-sm" style="color:var(--c-text-secondary)">오늘 출고</div><i class="fas fa-truck text-xs" style="color:var(--c-warning);opacity:0.6"></i></div><div class="text-3xl font-bold tabular-nums" style="color:var(--c-warning)" id="statTodayShipment">-</div><div class="text-xs mt-1 tabular-nums" id="statTodayShipmentSub" style="color:var(--c-text-muted)">-</div></div>'
                + '<div class="ds-card ds-card-compact"><div class="flex items-center justify-between mb-1"><div class="text-sm" style="color:var(--c-text-secondary)">미수금</div><i class="fas fa-exclamation-triangle text-xs" style="color:var(--c-danger);opacity:0.6"></i></div><div class="text-3xl font-bold tabular-nums" style="color:var(--c-danger)" id="statKpiReceivables">-</div><div class="text-xs mt-1 tabular-nums" id="statKpiOver30" style="color:var(--c-text-muted)">30일+ -</div></div>'
                + '<div class="ds-card ds-card-compact"><div class="flex items-center justify-between mb-1"><div class="text-sm" style="color:var(--c-text-secondary)">수금률</div><i class="fas fa-hand-holding-usd text-xs" style="color:var(--c-teal);opacity:0.6"></i></div><div class="text-3xl font-bold tabular-nums" style="color:var(--c-teal)" id="statCollectionRate">-</div><div class="text-xs mt-1 tabular-nums" style="color:var(--c-text-muted)" id="statCollectionDetail">이번 달</div></div>';
            }
            // 오늘 주문 KPI
            var todayOrders = stats.today_order_count || 0;
            var todayRev = stats.today_revenue || 0;
            var el = document.getElementById('statTodayOrders');
            if (el) el.textContent = todayOrders + '건';
            var sub = document.getElementById('statTodayRevenueSub');
            if (sub) sub.textContent = fmtAmtShort(todayRev);

            // 이번 달 매출 + 증감률
            var monthRev = stats.month_revenue || 0;
            var prevRev = stats.prev_month_revenue || 0;
            var monthEl = document.getElementById('statMonthRevenue');
            if (monthEl) monthEl.textContent = fmtAmtShort(monthRev);
            var changeEl = document.getElementById('statMonthChange');
            if (changeEl) changeEl.innerHTML = changeRateBadge(monthRev, prevRev);

            // 생산 현황 KPI
            document.getElementById('statProductionOrders').textContent = stats.production_orders || 0;
            var shipEl = document.getElementById('statShipmentReady');
            if (shipEl) shipEl.textContent = stats.shipment_ready_count || 0;

            // 오늘 출고 예정 KPI
            var todayShipEl = document.getElementById('statTodayShipment');
            if (todayShipEl) todayShipEl.textContent = (stats.today_shipment_due || 0) + '건';
            var todayShipSub = document.getElementById('statTodayShipmentSub');
            if (todayShipSub) todayShipSub.textContent = '출고대기 ' + (stats.shipment_ready_count || 0) + '건';

            // KPI 5: 긴급 주문 건수
            var urgentCount = stats.urgent_count || 0;
            var urgentEl = document.getElementById('statUrgentCount');
            if (urgentEl) urgentEl.textContent = urgentCount + '건';
            var urgentCard = document.getElementById('kpiUrgentCard');
            if (urgentCard) {
                if (urgentCount > 0) {
                    urgentCard.style.borderLeft = '3px solid var(--c-orange)';
                } else {
                    urgentCard.style.borderLeft = '';
                }
            }

            // KPI 6: 이번 달 수금률
            var monthBilled = stats.month_billed || 0;
            var monthPaid = stats.month_paid || 0;
            var collRate = monthBilled > 0 ? Math.round(monthPaid / monthBilled * 100) : 0;
            var collEl = document.getElementById('statCollectionRate');
            if (collEl) collEl.textContent = collRate + '%';
            var collDetail = document.getElementById('statCollectionDetail');
            if (collDetail) collDetail.textContent = fmtAmtShort(monthPaid) + ' / ' + fmtAmtShort(monthBilled);

            // 이전 통계 (하위 Revenue 카드)
            var todayRevEl = document.getElementById('statTodayRevenue');
            if (todayRevEl) todayRevEl.textContent = fmtAmt(todayRev);
            var weekRevEl = document.getElementById('statWeekRevenue');
            if (weekRevEl) weekRevEl.textContent = fmtAmt(stats.week_revenue || 0);
            var totalRevEl = document.getElementById('statTotalRevenue');
            if (totalRevEl) totalRevEl.textContent = fmtAmt(stats.total_revenue || 0);

            if (stats.pp_stats) {
                const ppStatsDiv = document.getElementById('ppStats');
                const entries = Object.entries(stats.pp_stats);
                if (entries.length === 0) {
                    ppStatsDiv.innerHTML = '<div class="ds-empty">현재 후가공 적용된 활성 카드가 없습니다.</div>';
                } else {
                    ppStatsDiv.innerHTML = entries.map(([name, count]) =>
                        '<div class="flex items-center justify-between p-3 bg-amber-50 rounded-lg">' +
                        '<div class="flex items-center gap-2">' +
                        '<span class="w-2 h-2 bg-amber-500 rounded-full"></span>' +
                        '<span class="font-medium text-sm">' + name + '</span></div>' +
                        '<span class="font-bold text-amber-700">' + count + '건</span></div>'
                    ).join('');
                }
            }
        }

        const clientsResponse = await axios.get('/api/dashboard/stats/clients');
        if (clientsResponse.data.success) {
            const clients = clientsResponse.data.data.slice(0, 5);
            const topClientsDiv = document.getElementById('topClients');
            if (clients.length === 0) {
                topClientsDiv.innerHTML = '<div class="ds-empty">거래처 데이터가 없습니다.</div>';
            } else {
                topClientsDiv.innerHTML = clients.map((client, index) =>
                    '<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">' +
                    '<div class="flex items-center gap-3">' +
                    '<div class="text-2xl font-bold text-gray-400">' + (index + 1) + '</div>' +
                    '<div><div class="font-semibold">' + escapeHtml(client.client_name) + '</div>' +
                    '<div class="text-xs text-gray-500">' + client.order_count + '건 주문</div></div></div>' +
                    '<div class="text-right"><div class="font-bold text-blue-600">' + (client.total_revenue || 0).toLocaleString() + '원</div>' +
                    '<div class="text-xs text-gray-500">총 매출</div></div></div>'
                ).join('');
            }
        }
        // 검수 대기 카드 (PENDING_REVIEW 건수)
        try {
            var prRes = await axios.get('/api/purchase-orders/receipts', { params: { inspection_status: 'PENDING_REVIEW', limit: 1 } });
            if (prRes.data.success) {
                var prCount = (prRes.data.pagination && prRes.data.pagination.total) ? prRes.data.pagination.total : 0;
                var prCard = document.getElementById('dashPendingReview');
                var prCountEl = document.getElementById('dashPendingReviewCount');
                if (prCard && prCountEl) {
                    prCountEl.textContent = prCount;
                    if (prCount > 0) {
                        prCard.classList.remove('hidden');
                    } else {
                        prCard.classList.add('hidden');
                    }
                }
            }
        } catch (prErr) {
            console.warn('검수 대기 카드 조회 실패:', prErr);
        }
    } catch (error) {
        console.error('Load dashboard stats error:', error);
    }
}

loadDashboardStats();

// Load receivables dashboard
async function loadReceivables() {
    try {
        var res = await axios.get('/api/dashboard/stats/receivables');
        if (!res.data.success) return;
        var d = res.data.data;

        // Total receivables
        document.getElementById('statTotalReceivables').textContent =
            (d.total_receivables || 0).toLocaleString() + '원 (' + (d.clients_with_balance || 0) + '개사)';

        // KPI 카드 미수금 업데이트
        var kpiRecEl = document.getElementById('statKpiReceivables');
        if (kpiRecEl) kpiRecEl.textContent = fmtAmtShort(d.total_receivables || 0);
        var over30El = document.getElementById('statKpiOver30');
        if (over30El) {
            var over30 = (d.aging && d.aging.over_30 || 0) + (d.aging && d.aging.over_60 || 0) + (d.aging && d.aging.over_90 || 0);
            var over30Text = '30일+ ' + over30.toLocaleString() + '원';
            if (over30 > 0) {
                over30El.innerHTML = '<span class="text-red-500 font-semibold">⚠ ' + over30Text + '</span>';
            } else {
                over30El.textContent = '연체 없음';
            }
        }

        // TOP 10 clients
        var container = document.getElementById('receivablesClients');
        var clients = d.top_clients || [];
        if (clients.length === 0) {
            container.innerHTML = '<div class="ds-empty">미수금 거래처가 없습니다.</div>';
        } else {
            container.innerHTML = clients.map(function(c, i) {
                var lastPay = c.last_payment_date || '입금 없음';
                return '<div class="flex items-center justify-between p-2 rounded-lg hover:bg-red-50 cursor-pointer" onclick="location.href=\'/ledger?client_id=' + c.id + '\'">'
                    + '<div class="flex items-center gap-2">'
                    + '<span class="w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-700 text-xs font-bold">' + (i+1) + '</span>'
                    + '<div><div class="font-medium text-sm">' + escapeHtml(c.client_name) + '</div>'
                    + '<div class="text-[11px] text-gray-400">청구 ' + (c.billed_order_count || 0) + '건 | 최근입금: ' + escapeHtml(lastPay) + '</div></div></div>'
                    + '<div class="text-right font-bold text-red-600 text-sm">' + (c.balance || 0).toLocaleString() + '원</div>'
                    + '</div>';
            }).join('');
        }

        // Aging buckets
        var aging = d.aging || {};
        var buckets = [
            { label: '30일 이내 (정상)', amount: aging.current || 0, color: 'green' },
            { label: '30~60일 (주의)', amount: aging.over_30 || 0, color: 'yellow' },
            { label: '60~90일 (경고)', amount: aging.over_60 || 0, color: 'orange' },
            { label: '90일 초과 (위험)', amount: aging.over_90 || 0, color: 'red' }
        ];
        var total = buckets.reduce(function(s, b) { return s + b.amount; }, 0) || 1;
        var agingContainer = document.getElementById('agingBuckets');
        agingContainer.innerHTML = buckets.map(function(b) {
            var pct = Math.round((b.amount / total) * 100);
            var barColor = { green: 'bg-green-500', yellow: 'bg-amber-500', orange: 'bg-orange-500', red: 'bg-red-500' }[b.color];
            return '<div>'
                + '<div class="flex justify-between text-sm mb-1">'
                + '<span class="text-gray-600">' + b.label + '</span>'
                + '<span class="font-medium">' + b.amount.toLocaleString() + '원</span></div>'
                + '<div class="h-2 bg-gray-200 rounded-full overflow-hidden">'
                + '<div class="h-full ' + barColor + ' rounded-full" style="width:' + Math.max(pct, 1) + '%"></div>'
                + '</div></div>';
        }).join('');

        if (aging.overdue_count > 0) {
            agingContainer.innerHTML += '<a href="/receivables" class="block mt-2 p-2 bg-red-50 rounded text-sm text-red-700 hover:bg-red-50 transition-colors">'
                + '<i class="fas fa-exclamation-circle mr-1"></i>연체 ' + aging.overdue_count + '건 주의 필요'
                + '<i class="fas fa-arrow-right ml-2 text-xs"></i></a>';
        }
    } catch(e) {
        console.error('Load receivables error:', e);
    }
}
loadReceivables();

// Load active cards for the work table
async function loadActiveCards() {
    try {
        const res = await axios.get('/api/cards?status=PRINTING&limit=100&sort=delivery_asc&exclude_order_status=SHIPPED');
        const cards = res.data.data || [];
        const container = document.getElementById('activeCardsList');
        const countEl = document.getElementById('activeCardsCount');
        if (countEl) countEl.textContent = cards.length + '건';
        if (cards.length === 0) {
            container.innerHTML = '<div class="ds-empty">진행 중인 작업이 없습니다.</div>';
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        let html = '<table class="ds-table ds-table-compact">'
            + '<thead><tr>'
            + '<th>거래처</th>'
            + '<th>품목명</th>'
            + '<th>내용</th>'
            + '<th>규격</th>'
            + '<th style="text-align:center">수량</th>'
            + '<th>후가공</th>'
            + '<th>납기</th>'
            + '</tr></thead><tbody>';
        cards.forEach(function(card) {
            const spec = (card.width && card.height)
                ? Math.round(card.width) + 'x' + Math.round(card.height) + 'cm'
                : '-';
            let ppBadges = '';
            if (card.post_processing) {
                try {
                    const ppArr = typeof card.post_processing === 'string' ? JSON.parse(card.post_processing) : card.post_processing;
                    if (Array.isArray(ppArr) && ppArr.length > 0) {
                        ppBadges = ppArr.map(function(pp) {
                            return '<span class="ds-badge ds-badge-orange" style="margin-right:2px">' + (pp.name || pp.code || pp) + '</span>';
                        }).join('');
                    }
                } catch(e) {}
            }
            const isUrgent = card.delivery_date && card.delivery_date <= today;
            const rowClass = isUrgent ? 'bg-red-50' : '';
            html += '<tr class="border-t hover:bg-gray-50 ' + rowClass + '">'
                + '<td class="px-3 py-2 text-gray-700 whitespace-nowrap">' + escapeHtml(card.client_name || '-') + '</td>'
                + '<td class="px-3 py-2 font-medium text-gray-800">' + escapeHtml(card.item_name || '-') + '</td>'
                + '<td class="px-3 py-2 text-gray-500">' + escapeHtml(card.content || '-') + '</td>'
                + '<td class="px-3 py-2 text-gray-500 whitespace-nowrap">' + spec + '</td>'
                + '<td class="px-3 py-2 text-center text-gray-700">' + (card.quantity || 0) + '</td>'
                + '<td class="px-3 py-2">' + (ppBadges || '<span class="text-gray-300">-</span>') + '</td>'
                + '<td class="px-3 py-2 whitespace-nowrap ' + (isUrgent ? 'text-red-600 font-bold' : 'text-gray-500') + '">' + (card.delivery_date || '-') + '</td>'
                + '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        console.error('Load active cards error:', e);
        document.getElementById('activeCardsList').innerHTML = '<div class="ds-empty" style="color:var(--c-danger)">카드 로드 실패</div>';
    }
}
loadActiveCards();

// Load overdue purchase orders
async function loadOverduePos() {
    try {
        var res = await axios.get('/api/dashboard/overdue-pos');
        if (!res.data.success) return;
        var items = res.data.data || [];
        var section = document.getElementById('overduePosSection');
        if (items.length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';
        document.getElementById('overduePoCount').textContent = items.length + '건';
        var statusLabels = { 'CONFIRMED': '입고대기', 'PARTIAL_RECEIVED': '부분입고' };
        var container = document.getElementById('overduePosList');
        container.innerHTML = items.map(function(po) {
            var days = po.overdue_days || 0;
            var urgency = days >= 7 ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-200';
            var daysBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold '
                + (days >= 7 ? 'bg-red-500 text-white' : 'bg-orange-400 text-white') + '">'
                + days + '일 지연</span>';
            return '<div class="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:shadow-sm ' + urgency + '"'
                + ' onclick="location.href=\'/receiving\'">'
                + '<div class="flex items-center gap-3">'
                + '<div>' + daysBadge + '</div>'
                + '<div>'
                + '<div class="font-medium text-sm">' + (po.po_number || '-') + '</div>'
                + '<div class="text-xs text-gray-500">' + (po.supplier_name || '-')
                + ' | ' + (statusLabels[po.status] || po.status)
                + ' | 납기: ' + (po.expected_date || '-') + '</div>'
                + '</div></div>'
                + '<div class="text-sm font-medium text-gray-700">' + ((po.final_amount || 0).toLocaleString()) + '원</div>'
                + '</div>';
        }).join('');
    } catch(e) {
        console.error('Load overdue POs error:', e);
    }
}
loadOverduePos();

// Load low stock items
async function loadLowStock() {
    try {
        var res = await axios.get('/api/dashboard/low-stock');
        if (!res.data.success) return;
        var items = res.data.data || [];
        var section = document.getElementById('lowStockSection');
        if (items.length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';
        document.getElementById('lowStockCount').textContent = items.length + '건';
        var container = document.getElementById('lowStockList');
        container.innerHTML = items.map(function(item) {
            var pct = item.safety_stock > 0 ? Math.round((item.current_stock / item.safety_stock) * 100) : 0;
            var barColor = pct <= 30 ? 'bg-red-500' : pct <= 60 ? 'bg-orange-400' : 'bg-amber-400';
            return '<div class="flex items-center justify-between p-3 rounded-lg border bg-orange-50 border-orange-200 cursor-pointer hover:shadow-sm"'
                + ' onclick="location.href=\'/inventory\'">'
                + '<div class="flex-1 mr-4">'
                + '<div class="flex items-center gap-2">'
                + '<span class="font-medium text-sm">' + ((item.item_name || '-').replace(/</g, '&lt;')) + '</span>'
                + '<span class="px-1.5 py-0.5 text-[10px] rounded bg-blue-50 text-blue-700">' + ((item.category || '-').replace(/</g, '&lt;')) + '</span>'
                + '</div>'
                + '<div class="mt-1 flex items-center gap-2">'
                + '<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">'
                + '<div class="h-full ' + barColor + ' rounded-full" style="width:' + Math.max(pct, 2) + '%"></div>'
                + '</div>'
                + '<span class="text-xs text-gray-500 whitespace-nowrap">' + item.current_stock + ' / ' + item.safety_stock + ' ' + (item.unit || '') + '</span>'
                + '</div>'
                + '</div>'
                + '<div class="text-right">'
                + '<span class="text-sm font-bold text-orange-700">부족 ' + (item.shortage || 0) + '</span>'
                + '</div>'
                + '</div>';
        }).join('');
    } catch(e) {
        console.error('Load low stock error:', e);
    }
}
loadLowStock();

// Load equipment load
async function loadEquipmentLoad() {
  try {
    var res = await axios.get('/api/dashboard/equipment-load');
    if (!res.data.success) return;
    var items = res.data.data || [];
    var section = document.getElementById('equipmentLoadSection');
    if (items.length === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    var container = document.getElementById('equipmentLoadList');
    var statusLabels = { RUNNING: '가동중', IDLE: '대기', MAINTENANCE: '정비중', BROKEN: '고장' };
    var statusDots = { RUNNING: 'text-green-500', IDLE: 'text-gray-400', MAINTENANCE: 'text-amber-500', BROKEN: 'text-red-500' };
    container.innerHTML = items.map(function(eq) {
      var count = eq.queue_count || 0;
      var cap = eq.daily_capacity || 0;
      var isOverloaded = cap > 0 && count > cap;
      var pct = cap > 0 ? Math.min(100, Math.round((count / cap) * 100)) : 0;
      var barColor = isOverloaded ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-green-500';
      var statusLabel = statusLabels[eq.equipment_status] || eq.equipment_status || 'IDLE';
      var dotClass = statusDots[eq.equipment_status] || 'text-gray-400';
      var onlineDot = eq.agent_status === 'ONLINE' ? '<span class="w-1.5 h-1.5 bg-green-500 rounded-full inline-block ml-1"></span>' : '';
      var loadText = cap > 0 ? (count + '/' + cap) : (count + '건');
      return '<div class="p-3 rounded-lg border ' + (isOverloaded ? 'border-red-300 bg-red-50' : 'border-gray-200') + ' cursor-pointer hover:shadow" onclick="location.href=\'/schedule\'">'
        + '<div class="flex items-center justify-between mb-1">'
        + '<span class="text-sm font-medium">' + eq.name.replace(/</g, '&lt;') + onlineDot + '</span>'
        + '<span class="text-[10px] ' + dotClass + '"><i class="fas fa-circle mr-0.5"></i>' + statusLabel + '</span>'
        + '</div>'
        + (cap > 0
          ? '<div class="w-full bg-gray-200 rounded-full h-2 mb-1"><div class="h-2 rounded-full ' + barColor + '" style="width:' + pct + '%"></div></div>'
            + '<div class="text-[10px] text-gray-500 text-right">' + loadText + ' (' + pct + '%)</div>'
          : '<div class="text-xs text-gray-500">' + loadText + '</div>')
        + '</div>';
    }).join('');
  } catch(e) { console.error('Load equipment load error:', e); }
}
loadEquipmentLoad();

// Load maintenance alerts (소모품/정비 기한 알림)
async function loadMaintenanceAlerts() {
  try {
    var res = await axios.get('/api/rip/maintenance/alerts');
    if (!res.data.success) return;
    var data = res.data.data;
    var section = document.getElementById('maintenanceAlertsSection');
    if (!section) return;
    var total = data.total_alerts || 0;
    if (total === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    document.getElementById('maintenanceAlertCount').textContent = total + '건';

    var html = '';
    (data.consumables || []).forEach(function(c) {
      var isOverdue = c.alert_type === 'OVERDUE';
      html += '<div class="flex items-center justify-between p-2 rounded ' + (isOverdue ? 'bg-red-50' : 'bg-amber-50') + '">'
        + '<div class="flex items-center gap-2">'
        + '<i class="fas fa-box ' + (isOverdue ? 'text-red-500' : 'text-amber-500') + '"></i>'
        + '<div>'
        + '<div class="text-sm font-medium">' + (c.equipment_name || '') + ' - ' + (c.name || '').replace(/</g, '&lt;') + '</div>'
        + '<div class="text-[11px] text-gray-500">교체 기한: ' + (c.next_due_at || '').substring(0, 10) + '</div>'
        + '</div>'
        + '</div>'
        + '<span class="text-[10px] px-1.5 py-0.5 rounded ' + (isOverdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700') + '">'
        + (isOverdue ? '기한 초과' : '곧 도래') + '</span>'
        + '</div>';
    });
    (data.schedules || []).forEach(function(s) {
      var isOverdue = s.alert_type === 'OVERDUE';
      html += '<div class="flex items-center justify-between p-2 rounded ' + (isOverdue ? 'bg-red-50' : 'bg-amber-50') + '">'
        + '<div class="flex items-center gap-2">'
        + '<i class="fas fa-calendar-check ' + (isOverdue ? 'text-red-500' : 'text-amber-500') + '"></i>'
        + '<div>'
        + '<div class="text-sm font-medium">' + (s.equipment_name || '') + ' - ' + (s.title || '').replace(/</g, '&lt;') + '</div>'
        + '<div class="text-[11px] text-gray-500">점검 기한: ' + (s.next_due_at || '').substring(0, 10) + '</div>'
        + '</div>'
        + '</div>'
        + '<span class="text-[10px] px-1.5 py-0.5 rounded ' + (isOverdue ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700') + '">'
        + (isOverdue ? '기한 초과' : '곧 도래') + '</span>'
        + '</div>';
    });
    document.getElementById('maintenanceAlertList').innerHTML = html || '<div class="text-center text-gray-400 text-sm py-2">알림 없음</div>';
  } catch(e) { console.error('Load maintenance alerts error:', e); }
}
loadMaintenanceAlerts();

// Load recent activity (최근 주문 5건 + 최근 출고 5건)
async function loadRecentActivity() {
  try {
    var res = await axios.get('/api/dashboard/stats/recent-activity');
    if (!res.data.success) return;
    var data = res.data.data;

    // 최근 주문
    var ordersEl = document.getElementById('recentOrdersList');
    var orders = data.recent_orders || [];
    var orderStatusLabels = { CONFIRMED:'확정', PRINTING:'생산중', PRINT_DONE:'출력완료', SHIPPED:'출고완료', CANCELLED:'취소', QUOTATION:'견적' };
    var orderStatusColors = { CONFIRMED:'text-blue-500', PRINTING:'text-blue-600', PRINT_DONE:'text-green-600', SHIPPED:'text-purple-600', CANCELLED:'text-red-400', QUOTATION:'text-amber-600' };
    if (ordersEl) {
      if (orders.length === 0) {
        ordersEl.innerHTML = '<div class="ds-empty">최근 주문 없음</div>';
      } else {
        ordersEl.innerHTML = orders.map(function(o) {
          var statusLabel = orderStatusLabels[o.status] || o.status;
          var statusColor = orderStatusColors[o.status] || 'text-gray-500';
          var createdAt = o.created_at ? o.created_at.slice(0, 10) : '-';
          return '<div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="location.href=\'/orders\'">'
            + '<div class="flex items-center gap-2">'
            + '<div>'
            + '<div class="text-sm font-medium text-gray-800">' + escapeHtml(o.order_number || '-') + '</div>'
            + '<div class="text-[11px] text-gray-400">' + escapeHtml(o.client_name || '-') + ' · ' + createdAt + '</div>'
            + '</div></div>'
            + '<div class="text-right">'
            + '<div class="text-sm font-semibold text-gray-700 tabular-nums">' + (o.final_amount || 0).toLocaleString() + '원</div>'
            + '<div class="text-[10px] ' + statusColor + '">' + statusLabel + '</div>'
            + '</div></div>';
        }).join('');
      }
    }

    // 최근 출고
    var shipmentsEl = document.getElementById('recentShipmentsList');
    var shipments = data.recent_shipments || [];
    if (shipmentsEl) {
      if (shipments.length === 0) {
        shipmentsEl.innerHTML = '<div class="ds-empty">최근 출고 없음</div>';
      } else {
        shipmentsEl.innerHTML = shipments.map(function(s) {
          var shippedAt = s.shipped_at ? s.shipped_at.slice(0, 10) : '-';
          return '<div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer" onclick="location.href=\'/shipments\'">'
            + '<div class="flex items-center gap-2">'
            + '<div class="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">'
            + '<i class="fas fa-truck text-green-600 text-xs"></i>'
            + '</div>'
            + '<div>'
            + '<div class="text-sm font-medium text-gray-800">' + escapeHtml(s.order_number || s.shipment_number || '-') + '</div>'
            + '<div class="text-[11px] text-gray-400">' + escapeHtml(s.client_name || '-') + ' · ' + shippedAt + '</div>'
            + '</div></div>'
            + '<div class="text-right">'
            + '<div class="text-sm font-semibold tabular-nums text-green-700">' + (s.final_amount || 0).toLocaleString() + '원</div>'
            + '<div class="text-[10px] text-purple-600">출고완료</div>'
            + '</div></div>';
        }).join('');
      }
    }
  } catch(e) {
    console.error('Load recent activity error:', e);
    var fallback = '<div class="ds-empty text-red-400">로드 실패</div>';
    var oEl = document.getElementById('recentOrdersList');
    var sEl = document.getElementById('recentShipmentsList');
    if (oEl) oEl.innerHTML = fallback;
    if (sEl) sEl.innerHTML = fallback;
  }
}
loadRecentActivity();

// Load today due orders
async function loadTodayDue() {
  try {
    var res = await axios.get('/api/dashboard/stats/today-due');
    if (!res.data.success) return;
    var items = res.data.data || [];
    var countEl = document.getElementById('todayDueCount');
    if (countEl) countEl.textContent = items.length + '건';
    var container = document.getElementById('todayDueList');
    if (items.length === 0) {
      container.innerHTML = '<div class="ds-empty" style="color:var(--c-success)"><i class="fas fa-check-circle" style="margin-right:4px"></i>납기 도래 주문 없음</div>';
      return;
    }
    var today = new Date().toISOString().slice(0, 10);
    container.innerHTML = items.map(function(o) {
      var isOverdue = o.delivery_date < today;
      var urgencyClass = isOverdue ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200';
      var label = isOverdue ? '지연' : 'D-Day';
      var labelClass = isOverdue ? 'bg-red-500 text-white' : 'bg-orange-400 text-white';
      var priorityBadge = o.priority === 'URGENT' ? '<span class="px-1 py-0.5 text-[10px] rounded bg-red-50 text-red-700 ml-1">긴급</span>' : '';
      return '<div class="flex items-center justify-between p-2 rounded-lg border cursor-pointer hover:shadow-sm ' + urgencyClass + '" onclick="location.href=\'/orders\'">'
        + '<div class="flex items-center gap-2">'
        + '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold ' + labelClass + '">' + label + '</span>'
        + '<div>'
        + '<div class="text-xs font-medium">' + escapeHtml(o.order_number) + priorityBadge + '</div>'
        + '<div class="text-[11px] text-gray-500">' + escapeHtml(o.client_name || '-') + ' | 납기: ' + escapeHtml(o.delivery_date || '-') + '</div>'
        + '</div></div>'
        + '<div class="text-xs font-medium text-gray-600">' + (o.final_amount || 0).toLocaleString() + '원</div>'
        + '</div>';
    }).join('');
  } catch(e) { console.error('Load today due error:', e); }
}
loadTodayDue();

// Load weekly trend (bar chart)
async function loadWeeklyTrend() {
  try {
    var res = await axios.get('/api/dashboard/stats/weekly-trend');
    if (!res.data.success) return;
    var items = res.data.data || [];
    var container = document.getElementById('weeklyTrend');
    if (items.length === 0) {
      container.innerHTML = '<div class="ds-empty">데이터 없음</div>';
      return;
    }
    var maxCount = Math.max.apply(null, items.map(function(d) { return d.order_count; })) || 1;
    var days = ['일','월','화','수','목','금','토'];
    container.innerHTML = items.map(function(d) {
      var pct = Math.round((d.order_count / maxCount) * 100);
      var dt = new Date(d.date + 'T00:00:00');
      var dayLabel = (dt.getMonth()+1) + '/' + dt.getDate() + '(' + days[dt.getDay()] + ')';
      return '<div class="flex items-center gap-2">'
        + '<span class="text-[11px] text-gray-500 w-16 text-right">' + dayLabel + '</span>'
        + '<div class="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">'
        + '<div class="h-full bg-blue-500 rounded-full" style="width:' + Math.max(pct, 3) + '%"></div>'
        + '</div>'
        + '<span class="text-[11px] font-medium text-gray-700 w-8">' + d.order_count + '</span>'
        + '</div>';
    }).join('');
  } catch(e) { console.error('Load weekly trend error:', e); }
}
loadWeeklyTrend();

// Load today's production stats
async function loadProductionToday() {
  try {
    var res = await axios.get('/api/dashboard/stats/production-today');
    if (!res.data.success) return;
    var d = res.data.data;
    var container = document.getElementById('productionToday');

    var total = d.total_prints || 0;
    var ok = d.ok_count || 0;
    var cancel = d.cancel_count || 0;
    var err = d.error_count || 0;
    var successRate = total > 0 ? Math.round((ok / total) * 100) : 0;

    var html = '<div class="grid grid-cols-4 gap-2 mb-3">'
      + '<div class="text-center p-2 bg-blue-50 rounded"><div class="text-lg font-bold text-gray-700">' + total + '</div><div class="text-[10px] text-gray-500">전체</div></div>'
      + '<div class="text-center p-2 bg-green-50 rounded"><div class="text-lg font-bold text-gray-700">' + ok + '</div><div class="text-[10px] text-gray-500">완료</div></div>'
      + '<div class="text-center p-2 bg-amber-50 rounded"><div class="text-lg font-bold text-amber-700">' + cancel + '</div><div class="text-[10px] text-gray-500">취소</div></div>'
      + '<div class="text-center p-2 bg-red-50 rounded"><div class="text-lg font-bold text-red-700">' + err + '</div><div class="text-[10px] text-gray-500">에러</div></div>'
      + '</div>';

    html += '<div>'
      + '<div class="flex justify-between text-xs mb-1"><span class="text-gray-500">성공률</span><span class="font-bold text-gray-700">' + successRate + '%</span></div>'
      + '<div class="h-2 bg-gray-200 rounded-full overflow-hidden">'
      + '<div class="h-full bg-green-500 rounded-full" style="width:' + Math.max(successRate, 1) + '%"></div>'
      + '</div></div>';

    var byEquip = d.by_equipment || [];
    if (byEquip.length > 0) {
      html += '<div class="mt-3 pt-3 border-t space-y-1">';
      byEquip.forEach(function(eq) {
        var eqOk = eq.ok_count || 0;
        var eqTotal = eq.total || 0;
        html += '<div class="flex items-center justify-between text-xs">'
          + '<span class="text-gray-600 truncate" style="max-width:120px;">' + (eq.equipment_name || eq.equipment_id || '-').replace(/</g, '&lt;') + '</span>'
          + '<span class="font-medium"><span class="text-green-600">' + eqOk + '</span><span class="text-gray-400">/' + eqTotal + '</span></span>'
          + '</div>';
      });
      html += '</div>';
    }

    if (total === 0) {
      html = '<div class="text-center text-gray-400 py-4 text-sm"><i class="fas fa-moon mr-1"></i>금일 출력 기록 없음</div>';
    }

    container.innerHTML = html;
  } catch(e) { console.error('Load production today error:', e); }
}
loadProductionToday();

// Load weekly uptime stats
async function loadUptimeWeekly() {
  try {
    var res = await axios.get('/api/dashboard/stats/uptime-weekly');
    if (!res.data.success) return;
    var items = res.data.data || [];
    var container = document.getElementById('uptimeWeekly');

    if (items.length === 0) {
      container.innerHTML = '<div class="ds-empty">가동 데이터 없음</div>';
      return;
    }

    container.innerHTML = items.map(function(eq) {
      var activeDays = eq.active_days || 0;
      var pct = Math.round((activeDays / 7) * 100);
      var okRate = eq.total_events > 0 ? Math.round((eq.ok_events / eq.total_events) * 100) : 0;
      var barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
      return '<div>'
        + '<div class="flex justify-between text-xs mb-1">'
        + '<span class="text-gray-600 truncate" style="max-width:140px;">' + (eq.equipment_name || eq.equipment_id || '-').replace(/</g, '&lt;') + '</span>'
        + '<span class="font-medium">' + activeDays + '/7일 <span class="text-gray-400">(' + okRate + '% 성공)</span></span>'
        + '</div>'
        + '<div class="h-2 bg-gray-200 rounded-full overflow-hidden">'
        + '<div class="h-full ' + barColor + ' rounded-full" style="width:' + Math.max(pct, 3) + '%"></div>'
        + '</div></div>';
    }).join('');
  } catch(e) { console.error('Load uptime weekly error:', e); }
}
loadUptimeWeekly();

// Load card distribution
async function loadCardDistribution() {
  try {
    var res = await axios.get('/api/dashboard/stats/card-distribution');
    if (!res.data.success) return;
    var items = res.data.data || [];
    var container = document.getElementById('cardDistribution');
    if (items.length === 0) {
      container.innerHTML = '<div class="ds-empty">카드 없음</div>';
      return;
    }
    var total = items.reduce(function(s, d) { return s + d.count; }, 0) || 1;
    var statusLabels = { PRINTING: '출력중', PRINT_DONE: '출력완료', HOLD: '보류', PENDING: '대기' };
    var statusColors = { PRINTING: 'bg-orange-500', PRINT_DONE: 'bg-green-500', HOLD: 'bg-gray-400', PENDING: 'bg-amber-500' };
    container.innerHTML = items.map(function(d) {
      var pct = Math.round((d.count / total) * 100);
      var label = statusLabels[d.status] || d.status;
      var color = statusColors[d.status] || 'bg-blue-500';
      return '<div>'
        + '<div class="flex justify-between text-xs mb-1">'
        + '<span class="text-gray-600">' + label + '</span>'
        + '<span class="font-medium">' + d.count + '건 (' + pct + '%)</span></div>'
        + '<div class="h-3 bg-gray-100 rounded-full overflow-hidden">'
        + '<div class="h-full ' + color + ' rounded-full" style="width:' + Math.max(pct, 2) + '%"></div>'
        + '</div></div>';
    }).join('');
  } catch(e) { console.error('Load card distribution error:', e); }
}
loadCardDistribution();

// 60초마다 자동 갱신 (탭이 보이는 경우만)
setInterval(function() {
  if (document.hidden) return;
  loadDashboardStats();
}, 60000);
