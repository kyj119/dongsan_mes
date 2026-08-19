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
            // 인쇄물에 실을 QR — **이 카드**를 가리킨다(종이를 든 사람이 화면으로 돌아오는 길).
            //   주문 단위 QR(printWorkOrder)은 목록으로 보내서 현장이 다시 찾아야 했다.
            var qrDataUrl = '';
            if (typeof QRCode !== 'undefined') {
                try { qrDataUrl = await QRCode.toDataURL(window.location.origin + '/cards/' + cardId, { width: 140, margin: 0 }); }
                catch(e) { console.warn('[cardDetail] QR 생성 실패', e); }
            } else {
                console.warn('[cardDetail] QRCode 미로드 — 인쇄 QR 생략 (layout.ts CDN 확인)');
            }
            render(cardRes.data.data, histRes.data.data || [], defRes.data.data || [], cclRes.data.data || [], qrDataUrl);
        } catch(e) {
            // 봉제실이 오래된 QR·북마크로 들어오는 화면이 정확히 여기다 — axios 원문
            // ("Request failed with status code 404")을 그대로 띄우면 현장이 무엇을 해야 할지 모른다.
            var st = e.response && e.response.status;
            var srv = e.response && e.response.data && e.response.data.error;
            var msg = st === 404
                ? '이 카드를 찾을 수 없습니다. 주문이 수정되며 카드가 다시 발행됐거나 취소된 카드일 수 있습니다.'
                : (srv || '카드 정보를 불러오지 못했습니다.');
            document.getElementById('cdRoot').innerHTML =
                '<div class="text-center py-20">'
                + '<p class="text-red-500 mb-3">' + esc(msg) + '</p>'
                + '<a href="/cards" class="spa-link px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"><i class="fas fa-arrow-left mr-1"></i>현장 대시보드로</a>'
                + '</div>';
        }
    }

    function render(card, history, defects, checklist, qrDataUrl) {
        var items = cardItems(card);
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

        // ★생산 라인별 지시 항목 (2026-08-10) — 이 화면은 봉제실 양식 하나로 출발해서
        //   출력(솔벤·수성·UV·평판)·간판 카드에도 봉제방법/하도매/부직포/수술이 그대로 찍혔다.
        //   그 넷은 **전사·태극기 전용**이다. 카드 생성 시 category_name 이 곧 생산 라인이다
        //   (helpers.ts: OUTPUT→'출력' · TRANSFER_FLAG→'전사/태극기' · SIGN→'간판').
        var cdCat = String(card.category_name || '');
        var isSewingLine = cdCat.indexOf('전사') >= 0 || cdCat.indexOf('태극기') >= 0;

        // 봉제/후가공 파라미터 추출
        function extractPP(item) {
            var r = { grommet: '', nonwoven: '', tassel: '' };
            if (!item.post_processing) return r;
            try {
                var arr = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing;
                if (!Array.isArray(arr)) return r;
                arr.forEach(function(pp) {
                    var p = pp.params || {};
                    // 체크리스트 라벨(「하도매 5호 2구」)과 같은 표기 — 붙여 쓰면 같은 값이 달라 보인다
                    if (pp.code === 'PP-GROMMET') r.grommet = [p.size, p.holes].filter(Boolean).join(' ');
                    else if (pp.code === 'PP-NONWOVEN') r.nonwoven = (p.type || '') + (p.size ? ' ' + p.size + 'cm' : '');
                    else if (pp.code === 'PP-TASSEL') r.tassel = (p.color === '없음' ? '' : p.color || '');
                });
            } catch(e) {}
            return r;
        }

        // 마감(봉제) 방식 — 표기 정본 = MES_FIN (shared/finishingLabel.js ↔ utils/finishingLabel.ts)
        function extractFinishing(item) {
            return window.MES_FIN ? window.MES_FIN.finishing(item.finishing) : '';
        }

        // 출력·간판용 범용 후가공 목록 — 코팅·아일렛 등 봉제 3종(PP-GROMMET/NONWOVEN/TASSEL) 밖의
        //   후가공은 예전엔 이 화면 어디에도 안 나왔다(봉제 파라미터만 뽑았기 때문).
        //   펀칭은 params 값을 그대로 나열해 `펀칭 1cm 1cm 2cm 0cm…` 이 나왔다 — 정본(MES_FIN)으로 통일.
        function extractPPList(item) {
            return window.MES_FIN ? window.MES_FIN.ppList(item.post_processing) : '';
        }
        function scaleLabel(it) {
            var sf = Number(it.scale_factor) || 1;
            return sf > 1 ? '1/' + sf : '';
        }

        var firstItem = items[0] || {};
        var ppInfo = extractPP(firstItem);
        var sewMethod = extractFinishing(firstItem);

        // ★다품목 카드: 규격·원단·봉제·후가공을 **첫 품목 기준으로만** 보여 주던 것이 오작업 위험이었다
        //   (100×50 / 60×40 카드가 "100×50 · 3면쌍침 · 5호2구" 한 줄로 나가 봉제실이 전량 같은 규격으로 재단).
        //   품목별로 뽑아 두고, 값이 하나로 모이면(균일) 기존 큰 글씨, 갈리면 품목별 표로 낸다.
        var perItem = items.map(function(it) {
            var p = extractPP(it);
            return {
                name: it.item_name || '', w: Math.round(it.width || 0), h: Math.round(it.height || 0),
                qty: it.quantity || 1, fabric: it.print_media_name || '', sew: extractFinishing(it),
                grommet: p.grommet, nonwoven: p.nonwoven, tassel: p.tassel,
                pp: extractPPList(it), scale: scaleLabel(it)
            };
        });
        // 균일 판정도 라인별로 — 출력 카드에서 봉제 3종이 다 비어 있는 건 차이가 아니다.
        function cdRowKey(r) {
            return isSewingLine
                ? [r.w, r.h, r.fabric, r.sew, r.grommet, r.nonwoven, r.tassel].join('|')
                : [r.w, r.h, r.fabric, r.sew, r.pp, r.scale].join('|');
        }
        var uniformSpec = perItem.length <= 1 || perItem.every(function(r) { return cdRowKey(r) === cdRowKey(perItem[0]); });

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
        if (qrDataUrl) {
            html += '<div class="cd-print-qr"><img src="' + qrDataUrl + '" alt="">'
                 + '<div class="cd-print-qr-no">' + esc(card.card_number || '') + '</div></div>';
        }
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
            // ★규격은 **여기 한 곳**에만 둔다(2026-08-10). 예전엔 우측에 첫 품목 기준 큰 규격이
            //   따로 있어 "35×50 이 뭐냐"가 됐다 — 시안 바로 아래가 그림↔치수를 잇는 자리다.
            if (it.width && it.height) {
                html += '<div class="cd-item-size">' + Math.round(it.width) + '×' + Math.round(it.height) + '<span class="cd-unit">cm</span></div>';
            }
            var cdSf = scaleLabel(it);
            if (cdSf) html += '<div class="text-xs text-amber-700 font-bold">축척 ' + cdSf + '</div>';
            html += '<div class="text-base font-bold text-red-600 mt-0.5">' + (it.quantity || 1) + '장</div>';
            if (it.content) html += '<div class="text-xs text-blue-600 mt-0.5 truncate max-w-[180px]">' + esc(it.content) + '</div>';
            html += '</div>';
        });
        html += '</div>';

        // 규격은 위(시안 아래)로 단일화했다 — 여기엔 라인 표시만 둔다.
        if (!uniformSpec) {
            html += '<div class="cd-mixed-note"><i class="fas fa-triangle-exclamation mr-1"></i>품목마다 규격·마감이 다릅니다 — 위 규격과 아래 표를 <b>품목별로</b> 확인하세요</div>';
        }

        // 부속품
        if (accessories.length > 0) {
            html += '<div class="cd-accessories">';
            html += accessories.map(function(a) { return esc(a.item_name) + '—' + (a.quantity || 0) + '개'; }).join(', ');
            html += ' 동봉</div>';
        }

        // 생산 지시 — 라인별로 항목이 다르다. 균일하면 요약 2행, 갈리면 품목별 표.
        //   전사·태극기 = 봉제방법·하도매·부직포·수술 / 출력·간판 = 마감·후가공·축척
        //   원단은 양쪽 공통(예전엔 큰 글씨로 따로 떠 있었다 → 표로 흡수).
        //   ⚠️ 규격 열은 두지 않는다 — 규격의 자리는 시안 아래 한 곳(용준님 「둘 중 하나로 통일」).
        if (uniformSpec) {
            html += '<div class="cd-production-table">';
            if (isSewingLine) {
                html += '<div class="cd-prod-row"><span class="cd-prod-label">원단</span><span class="cd-prod-value">' + esc(fabric || '-') + '</span>';
                html += '<span class="cd-prod-label">봉제방법</span><span class="cd-prod-value">' + esc(sewMethod || '-') + '</span></div>';
                html += '<div class="cd-prod-row"><span class="cd-prod-label">하도매</span><span class="cd-prod-value">' + esc(ppInfo.grommet || '-') + '</span>';
                html += '<span class="cd-prod-label">부직포</span><span class="cd-prod-value">' + esc(ppInfo.nonwoven || '-') + '</span></div>';
                // 빈 라벨/값 칸이 남지 않게 전폭으로 (4열 그리드에서 마지막 항목이 홀수)
                html += '<div class="cd-prod-row"><span class="cd-prod-label">수술</span>';
                html += '<span class="cd-prod-value" style="grid-column:span 3">' + esc(ppInfo.tassel || '-') + '</span></div>';
            } else {
                html += '<div class="cd-prod-row"><span class="cd-prod-label">원단</span><span class="cd-prod-value">' + esc(fabric || '-') + '</span>';
                html += '<span class="cd-prod-label">마감</span><span class="cd-prod-value">' + esc(sewMethod || '-') + '</span></div>';
                html += '<div class="cd-prod-row"><span class="cd-prod-label">후가공</span><span class="cd-prod-value">' + esc(perItem[0] && perItem[0].pp || '-') + '</span>';
                html += '<span class="cd-prod-label">축척</span><span class="cd-prod-value">' + esc(perItem[0] && perItem[0].scale || '1:1') + '</span></div>';
            }
            html += '</div>';
        } else {
            var cdCols = isSewingLine
                ? ['품목', '수량', '원단', '봉제방법', '하도매', '부직포', '수술']
                : ['품목', '수량', '원단', '마감', '후가공', '축척'];
            html += '<div class="cd-multi-wrap"><table class="cd-multi"><thead><tr>'
                 + cdCols.map(function(h) { return '<th>' + h + '</th>'; }).join('')
                 + '</tr></thead><tbody>';
            perItem.forEach(function(r) {
                html += '<tr>'
                     + '<td class="name">' + esc(r.name) + '</td>'
                     + '<td class="qty">' + r.qty + '</td>'
                     + '<td>' + esc(r.fabric || '-') + '</td>'
                     + '<td>' + esc(r.sew || '-') + '</td>'
                     + (isSewingLine
                        ? '<td>' + esc(r.grommet || '-') + '</td>'
                        + '<td>' + esc(r.nonwoven || '-') + '</td>'
                        + '<td>' + esc(r.tassel || '-') + '</td>'
                        : '<td>' + esc(r.pp || '-') + '</td>'
                        + '<td>' + esc(r.scale || '1:1') + '</td>')
                     + '</tr>';
            });
            html += '</tbody></table></div>';
        }

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
            // 전 스텝 완료인데 출력대기면 상태가 안 움직인다(상태머신 준수) — 왜 그대로인지 알려준다.
            if (ckDone === checklist.length && card.status === 'PRINT_PENDING') {
                html += '<div class="no-print mb-3 p-3 rounded-lg border-2 border-blue-300 bg-blue-50 flex items-center justify-between gap-3 flex-wrap">';
                html += '<span class="text-sm font-bold text-blue-700"><i class="fas fa-circle-info mr-2"></i>전 공정이 체크됐지만 카드가 <b>출력대기</b>입니다 — 출력 시작을 눌러야 출력완료로 넘어갑니다</span>';
                html += '<button onclick="quickAction(\'PRINTING\')" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-bold">출력 시작</button>';
                html += '</div>';
            }
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

        // 품목별 출력완료 토글 — 체크박스처럼 생겼는데 클릭이 안 되면 "눌러도 안 된다"는 오해를 부른다.
        // 카드 모달과 같은 엔드포인트(print-toggle)를 쓴다.
        items.forEach(function(it) {
            var isDone = it.print_completed === 1;
            var ciId = it.card_item_id || 0;
            html += '<button ' + (ciId ? 'onclick="cdItemToggle(' + ciId + ')"' : 'disabled') + ' class="w-full flex items-center gap-3 py-2 border-b border-gray-100 text-left ' + (isDone ? 'opacity-50' : '') + '" style="background:none">';
            html += '<span class="text-lg">' + (isDone ? '<i class="fas fa-square-check text-green-600"></i>' : '<i class="far fa-square text-gray-400"></i>') + '</span>';
            html += '<span class="flex-1 text-sm ' + (isDone ? 'line-through text-gray-400' : 'text-gray-700') + '">' + esc(it.item_name || '') + '</span>';
            html += '<span class="text-xs text-gray-400">' + Math.round(it.width || 0) + '×' + Math.round(it.height || 0) + '</span>';
            html += '<span class="text-sm font-bold text-blue-600">' + (it.quantity || 1) + '장</span>';
            html += '</button>';
        });

        // 액션 버튼
        // ⚠️ PRINT_PENDING 분기가 없어 출력대기 카드엔 버튼이 하나도 없었다 → 이 화면만 보는
        //    현장이 진행시킬 방법이 없는 데드엔드(칸반으로 돌아가야 했다).
        html += '<div class="flex gap-2 mt-4 flex-wrap">';
        if (card.status === 'PRINT_PENDING') {
            html += '<button onclick="quickAction(\'PRINTING\')" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"><i class="fas fa-play mr-1"></i>출력 시작</button>';
            html += '<button onclick="quickAction(\'HOLD\')" class="px-4 py-2 bg-amber-500 text-white rounded text-sm hover:bg-amber-600"><i class="fas fa-pause mr-1"></i>보류</button>';
        } else if (card.status === 'PRINTING') {
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
            var r = await axios.patch('/api/cards/' + cardId + '/status', { status: status });
            // 출력 시작과 동시에 전 공정이 이미 체크돼 있으면 서버가 곧바로 출력완료로 넘긴다.
            if (r.data.data && r.data.data.auto_done) showToast('전 공정 완료 — 출력완료까지 처리됨', 'success');
            else showToast((statusLabels[status] || status) + ' 처리됨', 'success');
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

    // 품목 출력완료 토글 (카드 모달과 동일 엔드포인트)
    window.cdItemToggle = async function(cardItemId) {
        try {
            await axios.patch('/api/cards/' + cardId + '/items/' + cardItemId + '/print-toggle');
            load();
        } catch(e) { showToast('출력완료 토글 실패: ' + (e.response?.data?.error || e.message), 'error'); }
    };

    // 공정 체크리스트 토글 — 전 스텝 완료 && PRINTING이면 서버가 PRINT_DONE 자동 전이
    window.cclToggle = async function(itemId, checked) {
        try {
            var r = await axios.patch('/api/cards/' + cardId + '/checklist/' + itemId, { checked: checked });
            var d = r.data.data || {};
            if (d.auto_done) showToast('전 공정 완료 — 출력완료 처리됨', 'success');
            else if (d.all_checked_but_pending) showToast('전 공정 체크됨 — 「출력 시작」을 눌러야 출력완료로 넘어갑니다', 'info');
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
