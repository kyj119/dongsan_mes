// cardDetail.js — 카드 상세 페이지 (작업지시서 통합 뷰)

(function() {
    var cardId = window.location.pathname.split('/').pop();
    if (!cardId || isNaN(parseInt(cardId))) { document.getElementById('cdRoot').innerHTML = '<p class="text-center py-20 text-gray-400">카드 ID가 올바르지 않습니다.</p>'; return; }

    var esc = window.escapeHtml || function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var statusLabels = window.MES_STATUS.cardLabels; // 단일 소스 (layout 주입)

    async function load() {
        try {
            var [cardRes, histRes, defRes, cclRes] = await Promise.all([
                axios.get('/api/cards/' + cardId),
                axios.get('/api/cards/' + cardId + '/history'),
                axios.get('/api/cards/' + cardId + '/defects'),
                axios.get('/api/cards/' + cardId + '/checklist')
            ]);
            if (!cardRes.data.success) throw new Error('카드 조회 실패');
            render(cardRes.data.data, histRes.data.data || [], defRes.data.data || [], cclRes.data.data || []);
        } catch(e) {
            document.getElementById('cdRoot').innerHTML = '<p class="text-center py-20 text-red-500">' + esc(e.message) + '</p>';
        }
    }

    function render(card, history, defects, checklist) {
        var items = card.items || card._items || [];
        var accessories = card.accessories || [];
        var totalQty = items.reduce(function(s, i) { return s + (i.quantity || 1); }, 0);

        // 납기 포맷
        var dd = card.delivery_date || card.order_delivery_date || '';
        var dayName = '';
        try { var d = new Date(dd + 'T00:00:00'); dayName = ['일','월','화','수','목','금','토'][d.getDay()]; } catch(e) {}
        var dateStr = dd;
        try { var dp = dd.split('-'); dateStr = parseInt(dp[1]) + '월 ' + parseInt(dp[2]) + '일(' + dayName + ')'; } catch(e) {}

        // 긴급도
        var urgClass = '';
        try {
            var today = new Date(); today.setHours(0,0,0,0);
            var dDate = new Date(dd + 'T00:00:00');
            var diff = Math.ceil((dDate - today) / 86400000);
            if (diff < 0) urgClass = 'bg-red-600 text-white';
            else if (diff === 0) urgClass = 'bg-red-500 text-white';
            else if (diff === 1) urgClass = 'bg-amber-500 text-white';
            else urgClass = 'bg-blue-100 text-blue-700';
        } catch(e) {}

        // 상태
        var stLabel = statusLabels[card.status] || card.status;
        var stClass = card.status === 'PRINT_DONE' ? 'bg-green-100 text-green-700' : card.status === 'HOLD' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';

        // 원단 (첫 품목 기준)
        var fabric = '';
        for (var fi = 0; fi < items.length; fi++) { if (items[fi].print_media_name) { fabric = items[fi].print_media_name; break; } }

        // 규격
        var specW = Math.round(items[0]?.width || card.width || 0);
        var specH = Math.round(items[0]?.height || card.height || 0);

        // 봉제/후가공 파라미터 추출
        function extractPP(item) {
            var r = { grommet: '', nonwoven: '', tassel: '' };
            if (!item.post_processing) return r;
            try {
                var arr = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing;
                if (!Array.isArray(arr)) return r;
                arr.forEach(function(pp) {
                    var p = pp.params || {};
                    if (pp.code === 'PP-GROMMET') r.grommet = (p.size || '') + (p.holes || '');
                    else if (pp.code === 'PP-NONWOVEN') r.nonwoven = (p.type || '') + (p.size ? ' ' + p.size + 'cm' : '');
                    else if (pp.code === 'PP-TASSEL') r.tassel = (p.color === '없음' ? '' : p.color || '');
                });
            } catch(e) {}
            return r;
        }

        // 마감(봉제) 방식 추출
        function extractFinishing(item) {
            if (!item.finishing) return '';
            try {
                var f = typeof item.finishing === 'string' ? JSON.parse(item.finishing) : item.finishing;
                var methods = [];
                ['top','bottom','left','right'].forEach(function(dir) { if (f[dir]) methods.push(f[dir]); });
                var counts = {};
                methods.forEach(function(m) { counts[m] = (counts[m] || 0) + 1; });
                return Object.keys(counts).map(function(m) { return counts[m] + '면' + m; }).join(', ');
            } catch(e) { return ''; }
        }

        var firstItem = items[0] || {};
        var ppInfo = extractPP(firstItem);
        var sewMethod = extractFinishing(firstItem);

        // 진행률
        var doneCount = 0;
        items.forEach(function(it) { if (it.print_completed === 1) doneCount++; });
        var pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

        var html = '';

        // ── 헤더 바 ──
        html += '<div class="cd-header no-print">';
        html += '<div class="flex items-center gap-3 flex-wrap">';
        html += '<a href="/cards" class="text-gray-400 hover:text-gray-600"><i class="fas fa-arrow-left"></i></a>';
        html += '<span class="font-mono text-lg font-bold">' + esc(card.card_number || '') + '</span>';
        html += '<span class="px-2 py-0.5 rounded text-xs font-bold ' + stClass + '">' + esc(stLabel) + '</span>';
        html += '<span class="px-2 py-0.5 rounded text-xs font-bold ' + urgClass + '">' + esc(dateStr) + '</span>';
        html += '</div>';
        html += '<div class="flex items-center gap-2">';
        html += '<button onclick="window.print()" class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"><i class="fas fa-print mr-1"></i>인쇄/PDF</button>';
        html += '</div>';
        html += '</div>';

        // ── 개정 필요 배너 (주문 수정 시 카드 보존 경로가 needs_reissue=1 세팅) ──
        if (card.needs_reissue === 1) {
            html += '<div class="no-print mb-3 p-3 rounded-lg border-2 border-amber-400 bg-amber-50 flex items-center justify-between gap-3 flex-wrap">';
            html += '<span class="text-sm font-bold text-amber-700"><i class="fas fa-triangle-exclamation mr-2"></i>주문이 수정되었습니다 — 지시 내용을 다시 확인하세요</span>';
            html += '<button onclick="cclAckReissue()" class="px-3 py-1.5 bg-amber-500 text-white rounded text-sm font-bold">확인 처리</button>';
            html += '</div>';
        }

        // ── 인쇄 전용 헤더 ──
        html += '<div class="print-only cd-print-header">';
        html += '<div class="cd-print-title">● 작 업 지 시 서 ●</div>';
        html += '<div class="cd-print-meta">';
        html += '<span>출고날짜 : <b>' + esc(dateStr) + '</b></span>';
        html += '<span>작업수량 : <b>' + totalQty + '장</b></span>';
        html += '</div>';
        html += '</div>';

        // ── 작업 지시 영역 ──
        html += '<div class="cd-section cd-work-order">';

        // 거래처/주문번호
        html += '<div class="flex items-center justify-between mb-4 pb-2 border-b">';
        html += '<div><span class="text-lg font-bold">' + esc(card.client_name || '') + '</span>';
        html += '<span class="ml-2 text-sm text-gray-400">' + esc(card.order_number || '') + '</span></div>';
        html += '</div>';

        // 디자인 썸네일
        // 단품 카드 폴백: 품목 썸네일이 없으면 카드 썸네일 사용(1품목이면 동일 시안이라 모호하지 않음).
        var cdThumbFallback = (items.length === 1 && card.thumbnail_url && card.thumbnail_url.length > 10)
            ? card.thumbnail_url : '';
        html += '<div class="cd-designs">';
        items.forEach(function(it) {
            var cdThumb = it.thumbnail_url || cdThumbFallback;
            html += '<div class="cd-design-item">';
            if (cdThumb) {
                html += '<img src="' + cdThumb + '" class="cd-design-thumb" onclick="zoomThumb && zoomThumb(this.src)">';
            } else {
                html += '<div class="cd-design-thumb cd-design-placeholder"><i class="fas fa-image text-3xl text-gray-300"></i></div>';
            }
            if (it.width && it.height) html += '<div class="text-xs text-gray-500 mt-1">' + Math.round(it.width) + '×' + Math.round(it.height) + '</div>';
            html += '<div class="text-base font-bold text-red-600 mt-0.5">' + (it.quantity || 1) + '장</div>';
            if (it.content) html += '<div class="text-xs text-blue-600 mt-0.5 truncate max-w-[180px]">' + esc(it.content) + '</div>';
            html += '</div>';
        });
        html += '</div>';

        // 원단 + 규격
        html += '<div class="cd-spec-row">';
        html += '<span class="cd-fabric">' + esc(fabric || '-') + '</span>';
        html += '<span class="cd-size">' + (specW && specH ? specW + '×' + specH : '-') + '</span>';
        html += '</div>';

        // 부속품
        if (accessories.length > 0) {
            html += '<div class="cd-accessories">';
            html += accessories.map(function(a) { return esc(a.item_name) + '—' + (a.quantity || 0) + '개'; }).join(', ');
            html += ' 동봉</div>';
        }

        // 봉제/후가공 테이블
        html += '<div class="cd-production-table">';
        html += '<div class="cd-prod-row"><span class="cd-prod-label">봉제방법</span><span class="cd-prod-value">' + esc(sewMethod || '-') + '</span>';
        html += '<span class="cd-prod-label">하도매</span><span class="cd-prod-value">' + esc(ppInfo.grommet || '-') + '</span></div>';
        html += '<div class="cd-prod-row"><span class="cd-prod-label">부직포</span><span class="cd-prod-value">' + esc(ppInfo.nonwoven || '-') + '</span>';
        html += '<span class="cd-prod-label">' + (ppInfo.tassel ? '수술' : '') + '</span><span class="cd-prod-value">' + esc(ppInfo.tassel || '') + '</span></div>';
        html += '</div>';

        // 배송 정보
        html += '<div class="cd-shipping">';
        html += '<div class="cd-ship-row"><span class="cd-ship-label">출 고 처</span><span class="cd-ship-value font-bold">' + esc(card.client_name || '-') + '</span>';
        html += '<span class="cd-ship-label">연 락 처</span><span class="cd-ship-value">' + esc(card.contact_mobile || card.contact_phone || '-') + '</span></div>';
        html += '<div class="cd-ship-row"><span class="cd-ship-label">배송주소</span><span class="cd-ship-value" style="grid-column:span 3">' + esc(card.delivery_info || '-') + '</span></div>';
        html += '<div class="cd-ship-row"><span class="cd-ship-label">배송방법</span><span class="cd-ship-value">' + esc(card.delivery_method || '-') + '</span>';
        html += '<span class="cd-ship-label">선불/착불</span><span class="cd-ship-value">' + esc(card.shipping_payment === 'PREPAID' ? '선불' : (card.shipping_payment === 'COD' || card.shipping_payment === 'COLLECT') ? '착불' : card.shipping_payment || '-') + '</span></div>';
        html += '</div>';

        // 비고
        var notes = card.notes || card.order_notes || '';
        if (notes) {
            html += '<div class="cd-notes"><span class="cd-prod-label">비 고</span><span class="text-red-600 font-bold">' + esc(notes) + '</span></div>';
        }

        html += '</div>'; // end cd-work-order

        // ── 공정 체크리스트 (작업지시서 진행 체크, 현장 터치 입력) ──
        if (checklist.length > 0) {
            var ckDone = checklist.filter(function(s) { return s.checked_at; }).length;
            html += '<div class="cd-section cd-checklist no-print">';
            html += '<div class="cd-section-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
            html += '<span class="font-bold text-gray-700"><i class="fas fa-list-check mr-2"></i>공정 체크리스트 <span class="text-xs text-gray-400 ml-1">' + ckDone + '/' + checklist.length + '</span></span>';
            html += '<i class="fas fa-chevron-up cd-collapse-icon"></i>';
            html += '</div>';
            html += '<div class="cd-section-body">';
            checklist.forEach(function(s) {
                var on = !!s.checked_at;
                html += '<button onclick="cclToggle(' + s.id + ',' + (on ? 'false' : 'true') + ')" class="w-full flex items-center gap-3 py-3 px-2 border-b border-gray-100 text-left" style="min-height:52px;background:none">';
                html += '<span class="text-2xl">' + (on ? '<i class="fas fa-square-check text-green-600"></i>' : '<i class="far fa-square text-gray-400"></i>') + '</span>';
                html += '<span class="flex-1 text-base ' + (on ? 'line-through text-gray-400' : 'text-gray-800 font-semibold') + '">' + esc(s.label || '') + '</span>';
                if (on) {
                    html += '<span class="text-xs text-gray-400 whitespace-nowrap">' + esc(s.checked_by_name || '') + ' ' + formatKST(s.checked_at, null, {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) + '</span>';
                }
                html += '</button>';
            });
            html += '</div></div>';
        }

        // ── 생산 현황 (접이식) ──
        html += '<div class="cd-section cd-production no-print">';
        html += '<div class="cd-section-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
        html += '<span class="font-bold text-gray-700"><i class="fas fa-industry mr-2"></i>생산 현황</span>';
        html += '<i class="fas fa-chevron-up cd-collapse-icon"></i>';
        html += '</div>';
        html += '<div class="cd-section-body">';

        // 진행률 바
        if (items.length > 0) {
            html += '<div class="mb-3">';
            html += '<div class="flex justify-between text-xs text-gray-500 mb-1"><span>' + doneCount + '/' + items.length + '건 완료</span><span>' + pct + '%</span></div>';
            html += '<div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-blue-600 h-2 rounded-full" style="width:' + pct + '%"></div></div>';
            html += '</div>';
        }

        // 품목별 체크리스트
        items.forEach(function(it) {
            var isDone = it.print_completed === 1;
            html += '<div class="flex items-center gap-3 py-2 border-b border-gray-100 ' + (isDone ? 'opacity-50' : '') + '">';
            html += '<span class="text-lg">' + (isDone ? '<i class="fas fa-square-check text-green-600"></i>' : '<i class="far fa-square text-gray-400"></i>') + '</span>';
            html += '<span class="flex-1 text-sm ' + (isDone ? 'line-through text-gray-400' : 'text-gray-700') + '">' + esc(it.item_name || '') + '</span>';
            html += '<span class="text-xs text-gray-400">' + Math.round(it.width || 0) + '×' + Math.round(it.height || 0) + '</span>';
            html += '<span class="text-sm font-bold text-blue-600">' + (it.quantity || 1) + '장</span>';
            html += '</div>';
        });

        // 액션 버튼
        html += '<div class="flex gap-2 mt-4 flex-wrap">';
        if (card.status === 'PRINTING') {
            html += '<button onclick="quickAction(\'PRINT_DONE\')" class="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"><i class="fas fa-check mr-1"></i>출력완료</button>';
            html += '<button onclick="quickAction(\'HOLD\')" class="px-4 py-2 bg-amber-500 text-white rounded text-sm hover:bg-amber-600"><i class="fas fa-pause mr-1"></i>보류</button>';
        } else if (card.status === 'HOLD') {
            html += '<button onclick="quickAction(\'PRINTING\')" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"><i class="fas fa-play mr-1"></i>재개</button>';
        } else if (card.status === 'PRINT_DONE') {
            html += '<button onclick="shipCard()" class="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"><i class="fas fa-truck mr-1"></i>출고</button>';
        }
        html += '</div>';
        html += '</div></div>'; // end cd-production

        // ── 이력 (접이식) ──
        if (history.length > 0) {
            html += '<div class="cd-section cd-history no-print collapsed">';
            html += '<div class="cd-section-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
            html += '<span class="font-bold text-gray-700"><i class="fas fa-history mr-2"></i>상태 이력</span>';
            html += '<i class="fas fa-chevron-up cd-collapse-icon"></i>';
            html += '</div>';
            html += '<div class="cd-section-body">';
            history.forEach(function(h) {
                var from = statusLabels[h.from_status] || h.from_status || '-';
                var to = statusLabels[h.to_status] || h.to_status;
                html += '<div class="flex gap-3 py-1.5 text-xs">';
                html += '<span class="text-gray-400 w-24 flex-shrink-0 whitespace-nowrap">' + formatKST(h.created_at, null, {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) + '</span>';
                html += '<span>' + esc(from) + ' → <b>' + esc(to) + '</b></span>';
                html += '</div>';
            });
            html += '</div></div>';
        }

        document.getElementById('cdRoot').innerHTML = html;
    }

    // 액션 함수
    window.quickAction = async function(status) {
        try {
            await axios.patch('/api/cards/' + cardId + '/status', { status: status });
            showToast((statusLabels[status] || status) + ' 처리됨', 'success');
            load();
        } catch(e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
    };

    window.shipCard = async function() {
        try {
            await axios.post('/api/cards/' + cardId + '/ship');
            showToast('출고 처리됨', 'success');
            load();
        } catch(e) { showToast('출고 실패: ' + (e.response?.data?.error || e.message), 'error'); }
    };

    // 공정 체크리스트 토글 — 전 스텝 완료 && PRINTING이면 서버가 PRINT_DONE 자동 전이
    window.cclToggle = async function(itemId, checked) {
        try {
            var r = await axios.patch('/api/cards/' + cardId + '/checklist/' + itemId, { checked: checked });
            if (r.data.data && r.data.data.auto_done) showToast('전 공정 완료 — 출력완료 처리됨', 'success');
            load();
        } catch(e) { showToast('체크 실패: ' + (e.response?.data?.error || e.message), 'error'); }
    };

    // 개정필요 확인 처리
    window.cclAckReissue = async function() {
        try {
            await axios.patch('/api/cards/' + cardId + '/reissue-ack');
            showToast('개정 확인 처리됨', 'success');
            load();
        } catch(e) { showToast('실패: ' + (e.response?.data?.error || e.message), 'error'); }
    };

    load();
})();
