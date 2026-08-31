// ===== 개별 파일 출력완료 토글 =====
async function toggleItemPrint(cardId, cardItemId) {
    try {
        var res = await axios.patch('/api/cards/' + cardId + '/items/' + cardItemId + '/print-toggle');
        if (res.data && res.data.success) {
            // 상태 전환이 일어났을 수 있으므로 전체 새로고침
            await loadKanban();
        }
    } catch (e) {
        console.error('[cards] toggleItemPrint error:', e);
        showToast('출력 상태 변경에 실패했습니다.', 'error');
        loadKanban();
    }
}

// ===== 출력완료 → 진행중 되돌리기 =====
var _revertInProgress = {};
async function revertCard(cardId) {
    if (_revertInProgress[cardId]) return;
    if (!(await showConfirm('이 카드를 진행중으로 되돌리시겠습니까?'))) return;
    _revertInProgress[cardId] = true;
    try {
        var res = await axios.patch('/api/cards/' + cardId + '/revert');
        if (res.data && res.data.success) {
            await loadKanban();
        } else {
            showToast(res.data.error || '되돌리기 실패', 'error');
        }
    } catch (e) {
        console.error('[cards] revertCard error:', e);
        showToast('되돌리기에 실패했습니다.', 'error');
    } finally {
        delete _revertInProgress[cardId];
    }
}

// ===== 보류 섹션 =====
function renderHoldSection() {
    var filtered = holdCards;
    var section = document.getElementById('holdSection');
    var countEl = document.getElementById('holdCount');
    var listEl = document.getElementById('listHold');
    if (!section || !countEl || !listEl) return;
    if (filtered.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';
    countEl.textContent = filtered.length;
    var html = '';
    filtered.forEach(function(card) { html += buildKanbanCard(card, 'hold'); });
    listEl.innerHTML = html;
    listEl.style.display = holdExpanded ? '' : 'none';
}

function toggleHoldSection() {
    holdExpanded = !holdExpanded;
    var listEl = document.getElementById('listHold');
    if (listEl) listEl.style.display = holdExpanded ? '' : 'none';
}

// ===== 출력완료 거래처별 그룹 렌더링 =====
function renderPrintDoneGrouped(cards, targetId) {
    var el = document.getElementById(targetId || 'listPrintDone');
    if (!el) return;
    if (cards.length === 0) {
        el.innerHTML = '<div class="text-center text-gray-400 py-8 text-sm">미출고 완료 카드 없음</div>';
        return;
    }
    // 거래처별 그룹핑
    var groups = {};
    var groupOrder = [];
    cards.forEach(function(card) {
        var cn = card.client_name || '(미지정)';
        if (!groups[cn]) { groups[cn] = []; groupOrder.push(cn); }
        groups[cn].push(card);
    });
    // 각 그룹 내 정렬 + 그룹 간 정렬 (가장 급한 납기 기준)
    groupOrder.sort(function(a, b) {
        var aMin = Math.min.apply(null, groups[a].map(function(c) { return getUrgency(cardDueDate(c)).diff; }));
        var bMin = Math.min.apply(null, groups[b].map(function(c) { return getUrgency(cardDueDate(c)).diff; }));
        return aMin - bMin;
    });

    var html = '';
    groupOrder.forEach(function(clientName) {
        var groupCards = sortCards(groups[clientName]);
        var isExpanded = printDoneExpanded[clientName] !== false; // 기본 펼침
        var minUrg = Math.min.apply(null, groupCards.map(function(c) { return getUrgency(cardDueDate(c)).diff; }));
        var urgBadge = '';
        if (minUrg <= 0) urgBadge = '<span class="px-1 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700 mr-1">긴급</span>';
        else if (minUrg <= 1) urgBadge = '<span class="px-1 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 mr-1">D-1</span>';

        var safeClient = clientName.replace(/'/g, '\x27').replace(/\\/g, '\\\\');
        html += '<div class="mb-2 border border-gray-200 rounded-lg overflow-hidden bg-white">';
        // 아코디언 헤더
        html += '<div class="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer select-none" onclick="togglePrintDoneGroup(\'' + safeClient + '\')">';
        html += '<div class="flex items-center gap-1.5">';
        html += '<span class="text-xs text-gray-400">' + (isExpanded ? '&#9660;' : '&#9654;') + '</span>';
        html += urgBadge;
        html += '<span class="font-semibold text-sm">' + clientName + '</span>';
        html += '<span class="text-xs text-gray-500">(' + groupCards.length + '건)</span>';
        html += '</div>';
        html += '<button class="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors" onclick="event.stopPropagation();bulkShipByClient(\'' + safeClient + '\')">일괄 출고</button>';
        html += '</div>';
        // 카드 목록 (그리드 뷰)
        html += '<div style="display:' + (isExpanded ? 'block' : 'none') + '">';
        html += '<div class="grid-card-container">';
        groupCards.forEach(function(card) { html += buildGridCard(card, 'done'); });
        html += '</div>';
        html += '</div>';
        html += '</div>';
    });
    el.innerHTML = html;
}

function togglePrintDoneGroup(clientName) {
    var current = printDoneExpanded[clientName];
    printDoneExpanded[clientName] = current === false ? true : false;
    renderPrintDoneGrouped(printDoneCards);
}

// ===== 출고 처리 =====
var _shipInProgress = {};
async function shipCard(cardId, force) {
    if (_shipInProgress[cardId]) return;
    var card = printDoneCards.find(function(c) { return c.id === cardId; });
    var msg = '이 카드를 출고 처리하시겠습니까?';
    if (card && card.pp_status === 'PENDING' && !force) {
        msg = '⚠️ 후가공이 완료되지 않았습니다.\n그래도 출고하시겠습니까?';
    } else if (card && card.order_card_total && card.order_card_done < card.order_card_total) {
        msg = '이 주문의 카드 ' + card.order_card_done + '/' + card.order_card_total + '만 출력완료 상태입니다.\n미완료 카드가 있지만 출고하시겠습니까?';
    }
    if (!(await showConfirm(msg))) return;
    _shipInProgress[cardId] = true;
    try {
        var payload = (card && card.pp_status === 'PENDING') ? { force: true } : {};
        var res = await axios.patch('/api/cards/' + cardId + '/ship', payload);
        var toastMsg = '출고 완료';
        if (res.data.order_shipped) toastMsg += ' (주문 전체 출고)';
        showToast(toastMsg, 'success');
        window.dispatchEvent(new Event('ordersUpdated'));
        loadKanban();
    } catch(e) {
        var msg2 = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '출고 처리 실패';
        showToast(msg2, 'error');
    } finally {
        delete _shipInProgress[cardId];
    }
}

var _unshipInProgress = {};
async function unshipCard(cardId) {
    if (_unshipInProgress[cardId]) return;
    if (!(await showConfirm('이 카드의 출고를 취소하시겠습니까?'))) return;
    _unshipInProgress[cardId] = true;
    try {
        var res = await axios.patch('/api/cards/' + cardId + '/unship', {});
        showToast('출고 취소 완료', 'success');
        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '출고 취소 실패';
        showToast(msg, 'error');
    } finally {
        delete _unshipInProgress[cardId];
    }
}

var _bulkShipInProgress = false;
async function bulkShipByClient(clientName) {
    if (_bulkShipInProgress) return;
    var targetCards = printDoneCards.filter(function(c) { return (c.client_name || '(미지정)') === clientName; });
    if (targetCards.length === 0) return;
    var incomplete = targetCards.filter(function(c) { return c.order_card_total && c.order_card_done < c.order_card_total; });
    var confirmMsg = clientName + ' - ' + targetCards.length + '건 일괄 출고하시겠습니까?';
    if (incomplete.length > 0) {
        confirmMsg = clientName + ' - ' + targetCards.length + '건 중 ' + incomplete.length + '건의 주문에 미완료 카드가 있습니다.\n그래도 출고하시겠습니까?';
    }
    if (!(await showConfirm(confirmMsg))) return;
    _bulkShipInProgress = true;
    try {
        var ids = targetCards.map(function(c) { return c.id; });
        var res = await axios.post('/api/cards/bulk-ship', { card_ids: ids });
        showToast(res.data.message || '일괄 출고 완료', 'success');
        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : '일괄 출고 실패';
        showToast(msg, 'error');
    } finally {
        _bulkShipInProgress = false;
    }
}

// ===== 대시보드 =====
function renderDashboard() {
    renderProgressGauge();
    renderDeliverySummary();
    renderTodayShip();
    renderKanbanKpi();
}

function renderKanbanKpi() {
    var summary = kanbanSummary;
    // KPI 1: 납기 지연
    var overdueEl = document.getElementById('kpiOverdue');
    if (overdueEl) {
        var ov = (summary && summary.overdue) || 0;
        overdueEl.textContent = '지연 ' + ov + '건';
        if (ov > 0) {
            overdueEl.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700';
        } else {
            overdueEl.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400';
        }
    }
    // KPI 2: 컬럼별 카드 수
    var ripEl = document.getElementById('kpiRipWaiting');
    if (ripEl) ripEl.textContent = '출력대기 ' + ((summary && summary.rip_waiting) || 0);
    var printingEl = document.getElementById('kpiPrinting');
    if (printingEl) printingEl.textContent = '출력중 ' + ((summary && summary.printing) || 0);
    var doneEl = document.getElementById('kpiPrintDone');
    if (doneEl) doneEl.textContent = '완료 ' + ((summary && summary.print_done) || 0);
    // KPI 3: 보류 건수
    var holdEl = document.getElementById('kpiHold');
    if (holdEl) {
        var hv = (summary && summary.hold) || 0;
        holdEl.textContent = '보류 ' + hv + '건';
        if (hv > 0) {
            holdEl.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700';
        } else {
            holdEl.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-400';
        }
    }
}

function renderProgressGauge() {
    var summary = kanbanSummary;
    if (!summary) {
        var g = document.getElementById('progressGauge');
        if (g) g.innerHTML = '<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="none" stroke="#e5e7eb" stroke-width="6"/></svg>';
        return;
    }
    var total = summary.today_total || 0;
    var done = summary.today_done || 0;
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    var circumference = 2 * Math.PI * 24;
    var offset = circumference * (1 - pct / 100);
    var color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#3b82f6';
    var gaugeEl = document.getElementById('progressGauge');
    if (gaugeEl) {
        gaugeEl.innerHTML = '<svg width="60" height="60" viewBox="0 0 60 60">'
            + '<circle cx="30" cy="30" r="24" fill="none" stroke="#e5e7eb" stroke-width="6"/>'
            + '<circle cx="30" cy="30" r="24" fill="none" stroke="' + color + '" stroke-width="6" '
            + 'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" '
            + 'transform="rotate(-90 30 30)" stroke-linecap="round"/>'
            + '</svg>';
    }
    var textEl = document.getElementById('progressText');
    if (textEl) textEl.textContent = pct + '%';
    var countEl = document.getElementById('progressCount');
    if (countEl) countEl.textContent = done + '/' + total + ' 완료';
}

function renderDeliverySummary() {
    var summary = kanbanSummary;
    var el = document.getElementById('deliverySummary');
    if (!el) return;
    if (!summary || !summary.by_delivery_method || summary.by_delivery_method.length === 0) {
        el.innerHTML = '<div class="text-xs text-gray-400">데이터 없음</div>';
        return;
    }
    var html = '';
    summary.by_delivery_method.forEach(function(dm) {
        var remaining = dm.total - dm.done;
        html += '<div class="flex items-center justify-between text-xs">'
            + '<span class="truncate">' + (dm.method || '') + (dm.time ? ' ' + dm.time : '') + '</span>'
            + '<span class="font-semibold ' + (remaining > 0 ? 'text-red-600' : 'text-gray-700') + '">'
            + dm.done + '/' + dm.total + '</span>'
            + '</div>';
    });
    el.innerHTML = html;
}

function renderTodayShip() {
    var countEl = document.getElementById('todayShipCount');
    var detailEl = document.getElementById('todayShipDetail');
    if (!countEl) return;

    var now = new Date();
    var todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

    // 오늘 납기인 카드 (진행중 + 출력완료 중 미출고)
    var allCards = inProgressCards.concat(printDoneCards);
    var todayCards = allCards.filter(function(c) {
        return c.delivery_date && c.delivery_date <= todayStr && !c.shipped_at;
    });

    countEl.textContent = todayCards.length;
    countEl.className = 'text-2xl font-bold ' + (todayCards.length > 0 ? 'text-red-600' : 'text-green-600');

    if (detailEl) {
        if (todayCards.length === 0) {
            detailEl.textContent = '모든 출고 완료';
        } else {
            // 배송방법별 분류
            var byMethod = {};
            todayCards.forEach(function(c) {
                var m = c.delivery_method || '미정';
                byMethod[m] = (byMethod[m] || 0) + 1;
            });
            var parts = [];
            for (var m in byMethod) parts.push(m + ' ' + byMethod[m] + '건');
            detailEl.textContent = parts.join(' / ');
        }
    }
}

// ===== 카테고리 필터 =====
async function loadCardCategories() {
    try {
        var res = await axios.get('/api/cards/categories');
        availableCategories = res.data.data || [];
        renderCategoryFilter();
    } catch (e) { console.error('loadCategories error:', e); }
}

function renderCategoryFilter() {
    var bar = document.getElementById('categoryFilterBar');
    if (!bar) return;
    if (availableCategories.length === 0) { bar.innerHTML = ''; return; }
    var html = '<button class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors '
        + (!categoryFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')
        + '" onclick="setCategoryFilter(\'\')">전체</button>';
    availableCategories.forEach(function(cat) {
        var isActive = categoryFilter === cat;
        html += '<button class="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors '
            + (isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')
            + '" onclick="setCategoryFilter(\'' + cat + '\')">' + cat + '</button>';
    });
    bar.innerHTML = html;
}

function setCategoryFilter(cat) {
    categoryFilter = cat;
    saveKanbanFilters();
    renderCategoryFilter();
    loadKanban();
}

// ===== 상태 변경 =====
var _statusInProgress = {};
async function quickStatus(cardId, status) {
    var key = cardId + '_' + status;
    if (_statusInProgress[key]) return;
    _statusInProgress[key] = true;
    try {
        await axios.patch('/api/cards/' + cardId + '/status', { status: status, reason: status === 'PRINT_DONE' ? '출력완료' : '재개' });
        showToast((statusLabels[status] || status) + ' 처리됨', 'success');
        window.dispatchEvent(new Event('ordersUpdated'));
        loadKanban();
    } catch (e) { showToast('상태 변경 실패', 'error'); }
    finally { delete _statusInProgress[key]; }
}

// ===== 전체 품목 출력완료 (카드 PRINT_DONE 단축키) =====
// item 체크 + 카드 상태 전환을 단일 트랜잭션으로 처리.
// quickStatus(id,'PRINT_DONE') 대체 — item과 card 상태 불일치 방지.
var _completeInProgress = {};
async function completeCard(cardId) {
    if (_completeInProgress[cardId]) return;
    _completeInProgress[cardId] = true;
    try {
        var res = await axios.patch('/api/cards/' + cardId + '/complete');
        if (res.data && res.data.success) {
            showToast('출력완료 처리됨', 'success');
            window.dispatchEvent(new Event('ordersUpdated'));
            loadKanban();
        } else {
            showToast(res.data.error || '출력완료 처리 실패', 'error');
        }
    } catch (e) {
        var msg = e.response?.data?.error || '출력완료 처리 실패';
        showToast(msg, 'error');
    } finally { delete _completeInProgress[cardId]; }
}

var _ppCompleteInProgress = {};
async function ppComplete(cardId) {
    if (_ppCompleteInProgress[cardId]) return;
    if (!(await showConfirm('후가공 완료 처리하시겠습니까?'))) return;
    _ppCompleteInProgress[cardId] = true;
    try {
        await axios.patch('/api/cards/' + cardId + '/pp-complete');
        showToast('후가공 완료 처리됨', 'success');
        loadKanban();
    } catch (e) {
        var msg = e.response?.data?.error || '후가공 완료 처리 실패';
        showToast(msg, 'error');
    } finally {
        delete _ppCompleteInProgress[cardId];
    }
}

function quickHold(cardId) {
    openHoldModal(cardId, false);
}

function openHoldModal(cardIds, isBulk) {
    _holdTargetIds = Array.isArray(cardIds) ? cardIds : [cardIds];
    _holdIsBulk = isBulk || false;
    var catEl = document.getElementById('holdDefectCategory');
    var reasonEl = document.getElementById('holdReason');
    var modalEl = document.getElementById('holdModal');
    if (catEl) catEl.value = '';
    if (reasonEl) reasonEl.value = '';
    if (modalEl) modalEl.style.display = 'flex';
}

function closeHoldModal() {
    document.getElementById('holdModal').style.display = 'none';
    _holdTargetIds = [];
}

async function confirmHold() {
    var reason = document.getElementById('holdReason').value.trim();
    if (!reason) {
        showToast('보류 사유를 입력하세요.', 'warning');
        return;
    }
    var defectCategory = document.getElementById('holdDefectCategory').value || null;
    try {
        if (_holdIsBulk) {
            await axios.patch('/api/cards/bulk/status', {
                card_ids: _holdTargetIds,
                status: 'HOLD',
                reason: reason,
                defect_category: defectCategory
            });
        } else {
            await axios.patch('/api/cards/' + _holdTargetIds[0] + '/status', {
                status: 'HOLD',
                reason: reason,
                defect_category: defectCategory
            });
        }
        showToast('보류 처리 완료', 'success');
        closeHoldModal();
        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showToast('오류: ' + msg, 'error');
    }
}

