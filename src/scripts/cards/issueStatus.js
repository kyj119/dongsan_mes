// cards/issueStatus.js — 지시 현황 탭 (작업지시서 발행 현황판, 2026-08-05 work-order-auto-issue)
// 전역: switchCardsTab / loadIssueStatus. 내부는 is* prefix (?raw concat 전역충돌 방지)
(function() {
    var isEsc = window.escapeHtml || function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

    window.switchCardsTab = function(tab) {
        var kv = document.getElementById('kanbanView');
        var iv = document.getElementById('issueStatusView');
        var tk = document.getElementById('cardsTabKanban');
        var ti = document.getElementById('cardsTabIssue');
        if (!kv || !iv || !tk || !ti) { console.warn('[cards] tab containers not found'); return; }
        var showIssue = tab === 'issue';
        kv.style.display = showIssue ? 'none' : '';
        iv.style.display = showIssue ? '' : 'none';
        tk.classList.toggle('active', !showIssue);
        ti.classList.toggle('active', showIssue);
        if (showIssue) loadIssueStatus();
    };

    function isFmtDate(d) { return d ? String(d).slice(5, 10) : '-'; }

    function isCardRow(r, extraHtml) {
        var html = '<a href="/cards/' + r.id + '" class="flex items-center gap-2 py-2 px-2 rounded hover:bg-gray-50 border-b border-gray-100 text-sm">';
        html += '<span class="font-mono text-xs text-gray-500">' + isEsc(r.card_number || '') + '</span>';
        html += '<span class="font-semibold flex-1 truncate">' + isEsc(r.client_name || '') + ' · ' + isEsc(r.item_name || r.category_name || '') + '</span>';
        html += extraHtml || '';
        html += '<span class="text-xs text-gray-400 whitespace-nowrap">납기 ' + isFmtDate(r.delivery_date) + '</span>';
        html += '</a>';
        return html;
    }

    window.loadIssueStatus = async function() {
        try {
            var res = await axios.get('/api/cards/issue-status');
            var d = res.data.data || {};
            var missing = d.missing || [], progress = d.progress || [], reissue = d.reissue || [];

            var elM = document.getElementById('isMissingList');
            var elR = document.getElementById('isReissueList');
            var elP = document.getElementById('isProgressList');
            if (!elM || !elR || !elP) { console.warn('[cards] issue-status containers not found'); return; }

            var cntM = document.getElementById('isMissingCnt');
            var cntR = document.getElementById('isReissueCnt');
            var cntP = document.getElementById('isProgressCnt');
            if (cntM) cntM.textContent = missing.length;
            if (cntR) cntR.textContent = reissue.length;
            if (cntP) cntP.textContent = progress.length;

            elM.innerHTML = missing.length === 0
                ? '<p class="text-xs text-gray-400 py-2">누락 없음</p>'
                : missing.map(function(o) {
                    // 조치가 가장 급한 큐인데 예전엔 이 행만 <div> 라 갈 곳이 없었다(개정·진행 행은 링크).
                    // 주문 상세 전용 URL은 없고 /orders 가 ?search 를 로드 시 적용하므로 주문번호로 건다.
                    var href = '/orders?search=' + encodeURIComponent(o.order_number || '');
                    return '<a href="' + href + '" class="spa-link flex items-center gap-2 py-2 px-2 rounded hover:bg-gray-50 border-b border-gray-100 text-sm" title="주문 열기">'
                        + '<span class="font-mono text-xs text-gray-500">' + isEsc(o.order_number || '') + '</span>'
                        + '<span class="font-semibold flex-1 truncate">' + isEsc(o.client_name || '') + '</span>'
                        + '<span class="text-xs text-gray-400 whitespace-nowrap">납기 ' + isFmtDate(o.delivery_date) + '</span>'
                        + '</a>';
                }).join('');

            elR.innerHTML = reissue.length === 0
                ? '<p class="text-xs text-gray-400 py-2">개정 필요 없음</p>'
                : reissue.map(function(r) {
                    return isCardRow(r, '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">개정필요</span>');
                }).join('');

            elP.innerHTML = progress.length === 0
                ? '<p class="text-xs text-gray-400 py-2">진행 중 지시 없음</p>'
                : progress.map(function(r) {
                    var total = r.step_total || 0, done = r.step_done || 0;
                    var pct = total > 0 ? Math.round(done / total * 100) : 0;
                    var bar = '<span class="flex items-center gap-1 w-28">'
                        + '<span class="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden"><span class="block bg-blue-600 h-1.5" style="width:' + pct + '%"></span></span>'
                        + '<span class="text-xs text-gray-500 whitespace-nowrap">' + done + '/' + total + '</span></span>';
                    var re = r.needs_reissue === 1 ? '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">개정</span>' : '';
                    return isCardRow(r, bar + re);
                }).join('');

            // 탭 배지 = 누락 + 개정필요 (조치 필요 건수)
            var badge = document.getElementById('issueTabBadge');
            if (badge) {
                var n = missing.length + reissue.length;
                badge.textContent = n;
                badge.style.display = n > 0 ? '' : 'none';
            }
        } catch(e) {
            console.warn('[cards] issue-status load fail', e);
        }
    };

    // 페이지 로드 시 1회 — 탭 진입 전에도 배지(조치 필요 건수) 노출
    loadIssueStatus();
})();
