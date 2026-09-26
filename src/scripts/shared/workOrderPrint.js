// workOrderPrint.js — 작업지시서 인쇄 (정본 1벌)
// 칸반(/cards)과 카드 상세(/cards/:id)가 **같은 함수**를 쓴다. 예전엔 주문 단위 인쇄본과
// 카드 페이지 인쇄본이 따로 있어 원단·마감 표기가 갈렸다(MES_FIN 으로 한 번 통일한 전례).

/** 숨김 후가공 판정 — 정본은 칸반 스크립트(cards/core.js). 카드 상세엔 없으므로 폴백 false. */
function woPPHidden(v) { return (typeof isPPHidden === 'function') ? isPPHidden(v) : false; }

// ===== 작업지시서 인쇄 =====
// 정본 = **주문 단위 1장**(용준님 결정 2026-09-04). 카드 상세(/cards/:id)는 화면 전용이다.
//   주문당 카드 1장이 96.3%(실측)라 종이를 카드로 쪼갤 이유가 없고, 카드가 둘 이상인 주문은
//   전부 「출력 + 전사/태극기」 조합이라 라인 섹션으로 갈라 찍는다.
// 데이터는 `/api/orders/:id/work-order` 한 번으로 받는다 — 예전엔 카드 목록 + 카드 상세를
//   카드 수만큼 개별 GET 하는 N+1 이었다.

async function printWorkOrder(orderId) {
    try {
        var res = await axios.get('/api/orders/' + orderId + '/work-order');
        if (!res.data.success) { showToast('작업지시서 조회 실패', 'error'); return; }
        var order = res.data.data.order || {};
        var lines = res.data.data.lines || [];
        // 판짜기 묶음(번호 켠 재단 판짜기) — 맨 앞에 가로 A4 한 부씩. 그 판 줄은 아래에서 작게만 찍는다.
        var batches = res.data.data.batches || [];
        var inBatch = {};
        batches.forEach(function(b) { (b.plates || []).forEach(function(p) { if (p.line_id) inBatch[p.line_id] = true; }); });

        // QR = **출고 검수**(/pack?order=N). 종이를 든 사람이 폰으로 그대로 검수에 들어간다.
        //   예전엔 카드 목록(/cards?order_id=)이라 현장이 다시 찾아 들어가야 했다.
        var qrDataUrl = '';
        if (typeof QRCode !== 'undefined') {
            try { qrDataUrl = await QRCode.toDataURL(window.location.origin + '/pack?order=' + orderId, { width: 240, margin: 0 }); } catch(e) {}
        } else {
            console.warn('[cards] QRCode 미로드 — 작업지시서 QR 생략 (layout.ts CDN 확인)');
        }
        // Code128 바코드는 2026-09-23 제거(리더기 없음·도입 예정 없음) — 주문 식별은 QR 하나로 한다.

        // XSS 방지 래퍼 (document.write 컨텍스트)
        var esc = window.escapeHtml || function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

        // 마감·후가공 표기 정본 = MES_FIN (shared/finishingLabel.js ↔ utils/finishingLabel.ts).
        // 여기서 사본을 만들면 체크리스트와 문장이 갈린다.
        function fmtFinishing(fin) {
            return window.MES_FIN ? window.MES_FIN.finishing(fin) : '';
        }

        // 마감 다이어그램 (4변 시각화) — 4변 지시가 실제 의미를 갖는 봉제 라인 전용
        function finishingDiagram(fin) {
            if (!fin) return '';
            try {
                var f = typeof fin === 'string' ? JSON.parse(fin) : fin;
                var t = f.top || '', b = f.bottom || '', l = f.left || '', r = f.right || '';
                if (!t && !b && !l && !r) return '';
                return '<div style="position:relative;width:96px;height:64px;border:2px solid #92400e;border-radius:4px;margin:6px 0 2px;font-size:9px;color:#92400e">'
                    + '<span style="position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#fff;padding:0 3px">' + esc(t || '-') + '</span>'
                    + '<span style="position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);background:#fff;padding:0 3px">' + esc(b || '-') + '</span>'
                    + '<span style="position:absolute;left:-2px;top:50%;transform:translateY(-50%) rotate(-90deg);background:#fff;padding:0 3px">' + esc(l || '-') + '</span>'
                    + '<span style="position:absolute;right:-2px;top:50%;transform:translateY(-50%) rotate(90deg);background:#fff;padding:0 3px">' + esc(r || '-') + '</span>'
                    + '</div>';
            } catch(e) { return ''; }
        }

        var win = window.open('', '_blank', 'width=900,height=1000');
        // 용지 = A4. 시안을 크게 싣기로 한 순간 A5 로는 라인 하나가 한 장을 먹는다.
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>작업지시서 - ' + esc(order.order_number || '') + '</title>'
            + '<style>'
            + 'body { font-family: "Malgun Gothic", sans-serif; padding: 16px; font-size: 13px; color: #111; }'
            + '.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }'
            + 'h1 { font-size: 20px; margin: 0 0 8px; }'
            + '.info { font-size: 13px; line-height: 1.75; }'
            + '.info b { display: inline-block; width: 62px; color: #6b7280; font-weight: 600; }'
            + '.codes { text-align: center; flex-shrink: 0; }'
            + '.codes .qr { width: 20mm; height: 20mm; display: block; margin: 0 auto 2px; }'
            + '.codes .qr-cap { font-size: 9px; color: #6b7280; margin-bottom: 4px; }'
            + '.notes { background: #fff7ed; border: 1px solid #fdba74; border-radius: 6px; padding: 8px 12px; margin: 8px 0; font-size: 13px; }'
            + '.line-section { margin: 14px 0 6px; font-size: 14px; font-weight: 800; border-bottom: 2px solid #111; padding-bottom: 3px; page-break-after: avoid; break-after: avoid; }'
            + '.line-section .cnt { float: right; font-size: 11px; font-weight: 600; color: #6b7280; }'
            + '.line-section-ship { border-bottom-color: #9ca3af; color: #4b5563; }'
            + '.row { display: flex; gap: 12px; align-items: stretch; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 10px; page-break-inside: avoid; break-inside: avoid; }'
            + '.thumb { width: 240px; max-height: 240px; flex-shrink: 0; border: 1px solid #e5e7eb; border-radius: 6px; object-fit: contain; background: #fff; align-self: flex-start; }'
            // ★재단 패널 번호 그림 — 줄 아래 A4 폭 전체(번호로 판↔조각을 대조하는 그림이라 6.3cm 로는 번호가 안 읽힌다)
            + '.row-large { flex-wrap: wrap; }'
            // ★재단 판(2026-09-26 「가」 안) — 한 장을 판 여러 개로 나눈 줄은 판 2부터 새 페이지(판 한 장 = 종이 한 장)
            + '.row-break { break-before: page; page-break-before: always; }'
            + '.plate-head { font-size: 15px; font-weight: 800; margin-bottom: 4px; }'
            + '.plate-head .plate-badge { display: inline-block; background: #111; color: #fff; border-radius: 4px; padding: 1px 8px; margin-right: 6px; }'
            + '.plate-pieces { font-size: 13px; color: #374151; margin: 2px 0 6px; line-height: 1.6; word-break: keep-all; }'
            + '.thumb-large { order: 9; flex: 0 0 100%; width: 100%; max-height: 170mm; border: 1px solid #e5e7eb; border-radius: 6px; object-fit: contain; background: #fff; }'
            + '.thumb-empty { width: 240px; height: 120px; flex-shrink: 0; border: 1px dashed #d1d5db; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #d1d5db; font-size: 34px; align-self: flex-start; }'
            + '.info-col { flex: 1; min-width: 0; }'
            + '.title { font-size: 16px; font-weight: 700; }'
            + '.spec { font-size: 14px; color: #374151; margin-top: 3px; }'
            + '.fabric { font-size: 13px; margin-top: 4px; }'
            + '.fabric b { color: #6b7280; font-weight: 600; }'
            + '.memo { font-size: 12px; color: #1E3A5F; margin-top: 3px; }'
            + '.badges { margin-top: 6px; }'
            + '.pp-badge { display: inline-block; padding: 2px 9px; font-size: 12px; border-radius: 12px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; margin: 0 4px 4px 0; }'
            + '.fin-badge { display: inline-block; padding: 2px 9px; font-size: 12px; border-radius: 12px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; margin: 0 4px 4px 0; }'
            // 검수 칸 — 종이에서 세는 자리. 라인 단위가 출고 검수(/pack)와 같아서 그대로 대조된다.
            + '.check { width: 112px; flex-shrink: 0; border-left: 1px dashed #9ca3af; padding-left: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }'
            + '.chk-box { width: 26px; height: 26px; border: 2px solid #374151; border-radius: 4px; }'
            + '.chk-count { font-size: 15px; font-weight: 700; color: #111; white-space: nowrap; }'
            + '.chk-count .blank { display: inline-block; width: 32px; border-bottom: 1.5px solid #111; margin-right: 3px; }'
            + '.chk-cap { font-size: 9px; color: #9ca3af; }'
            + '.foot { margin-top: 18px; border-top: 1px solid #d1d5db; padding-top: 8px; font-size: 11px; color: #6b7280; }'
            + WO_BATCH_CSS
            + '.wob-print { page: wob; break-after: page; page-break-after: always; }'
            + '@media print { body { padding: 0; } @page { size: A4; margin: 10mm; } @page wob { size: A4 landscape; margin: 8mm; } }'
            + '</style></head><body>';

        batches.forEach(function(b) { html += '<div class="wob-print">' + woBatchHtml(b, order, lines, esc) + '</div>'; });

        // ── 머리 ─────────────────────────────────────────────────────────────
        html += '<div class="head"><div>';
        html += '<h1>작업지시서</h1><div class="info">';
        html += '<b>주문번호</b> ' + esc(order.order_number || '-') + '<br>';
        html += '<b>거래처</b> ' + esc(order.client_name || '-') + '<br>';
        html += '<b>납기</b> ' + esc(order.delivery_date || '-') + ' (' + esc(order.delivery_method || '배송') + ')<br>';
        // 연락처는 **우리 담당자**다. 거래처 번호는 현장이 쓸 일이 없고, 종이가 밖으로 나가기도 한다.
        if (order.sales_rep_name) {
            html += '<b>담당</b> ' + esc(order.sales_rep_name);
            if (order.sales_rep_mobile) html += ' <span style="font-weight:700">' + esc(order.sales_rep_mobile) + '</span>';
            html += '<br>';
        }
        html += '</div></div>';
        html += '<div class="codes">';
        if (qrDataUrl) html += '<img src="' + qrDataUrl + '" class="qr"><div class="qr-cap">출고 검수</div>';
        html += '</div></div>';

        if (order.internal_notes) {
            html += '<div class="notes"><b>특이사항</b> ' + esc(order.internal_notes) + '</div>';
        }

        // ── 라인 섹션 ────────────────────────────────────────────────────────
        // 혼재 주문(출력+전사+간판+상품)이 한 덩어리로 찍히면 종이에서 공정이 구분되지 않는다.
        var SHIP_ONLY = '상품(제작없음 · 출고만)';
        var sections = [];
        var sectionIndex = {};
        lines.forEach(function(ln) {
            var key = ln.production_line || SHIP_ONLY;
            if (sectionIndex[key] === undefined) { sectionIndex[key] = sections.length; sections.push({ line: key, rows: [] }); }
            sections[sectionIndex[key]].rows.push(ln);
        });
        // 출고만 섹션은 항상 마지막 — 제작 지시가 아니라 동봉 안내다.
        sections.sort(function(a, b) { return (a.line === SHIP_ONLY ? 1 : 0) - (b.line === SHIP_ONLY ? 1 : 0); });

        var no = 0;
        sections.forEach(function(sec) {
            var isSew = sec.line.indexOf('전사') >= 0 || sec.line.indexOf('태극기') >= 0;
            var isShipOnly = sec.line === SHIP_ONLY;
            html += '<div class="line-section' + (isShipOnly ? ' line-section-ship' : '') + '">■ ' + esc(sec.line)
                 + '<span class="cnt">' + sec.rows.length + '건</span></div>';

            sec.rows.forEach(function(ln) {
                no++;
                var spec = (ln.width && ln.height) ? (Math.round(ln.width) + '×' + Math.round(ln.height) + 'cm') : '';
                var qty = ln.quantity || 1;
                var unit = ln.unit || 'EA';

                // 판짜기 한 부에 들어간 판은 그 문서가 번호·규격을 다 싣는다 → 여기선 작게, 쪽 나눔 없이
                var batched = !!inBatch[ln.id];
                var large = !batched && !!(ln.thumbnail && ln.thumbnail_large);
                var plate = (ln.plate_total > 1 && ln.plate_index >= 1) ? ln : null;
                html += '<div class="row' + (large ? ' row-large' : '') + (plate && !batched && ln.plate_index > 1 ? ' row-break' : '') + '">';

                // 시안 — 재단 패널 번호 그림은 줄 맨 아래에 크게(아래 .thumb-large), 나머지는 왼쪽 240px
                if (large) html += '<img src="' + ln.thumbnail + '" class="thumb-large">';
                else html += ln.thumbnail
                    ? '<img src="' + ln.thumbnail + '" class="thumb">'
                    : '<div class="thumb-empty"><span>&#128444;</span></div>';

                // 지시
                html += '<div class="info-col">';
                if (plate) {
                    // 판 머리 — 재단 현장이 판 위 꼬리표 번호와 대조하는 목록
                    html += '<div class="plate-head"><span class="plate-badge">판 ' + plate.plate_index + ' / ' + plate.plate_total + '</span>'
                        + (plate.piece_labels && plate.piece_labels.length ? '조각 ' + plate.piece_labels.length + '개' : '') + '</div>';
                    if (batched) html += '<div class="plate-pieces">번호·규격 = 앞쪽 「판짜기 전체」</div>';
                    else if (plate.piece_labels && plate.piece_labels.length) html += '<div class="plate-pieces">' + plate.piece_labels.map(esc).join(' · ') + '</div>';
                }
                html += '<div class="title">#' + no + ' ' + esc(ln.item_name || '-') + '</div>';
                html += '<div class="spec">' + (spec || '-') + ' &nbsp;/&nbsp; ' + qty + esc(unit) + '</div>';
                if (ln.fabric) html += '<div class="fabric"><b>원단</b> ' + esc(ln.fabric) + '</div>';
                if (ln.content) html += '<div class="memo">' + esc(ln.content) + '</div>';

                if (!isShipOnly) {
                    var badges = '';
                    if (ln.post_processing) {
                        try {
                            var ppArr = typeof ln.post_processing === 'string' ? JSON.parse(ln.post_processing) : ln.post_processing;
                            if (Array.isArray(ppArr)) {
                                ppArr.filter(function(pp) { return !woPPHidden(pp.name || pp.code || pp); })
                                    .forEach(function(pp) {
                                        var txt = window.MES_FIN ? window.MES_FIN.pp(pp) : String(pp.name || pp.code || pp);
                                        if (txt) badges += '<span class="pp-badge">' + esc(txt) + '</span>';
                                    });
                            }
                        } catch(e) {}
                    }
                    var finText = fmtFinishing(ln.finishing);
                    if (finText) badges += '<span class="fin-badge">' + (isSew ? '✂ 봉제 ' : '✂ 마감 ') + esc(finText) + '</span>';
                    if (badges) html += '<div class="badges">' + badges + '</div>';
                    if (isSew) html += finishingDiagram(ln.finishing);
                }
                html += '</div>';

                // 검수 칸 — 담은 개수를 손으로 적는다(□ ___/6EA).
                html += '<div class="check">';
                html += '<div class="chk-box"></div>';
                html += '<div class="chk-count"><span class="blank"></span>/ ' + qty + esc(unit) + '</div>';
                html += '<div class="chk-cap">담은 수량</div>';
                html += '</div>';

                html += '</div>';   // .row
            });
        });

        html += '<div class="foot">출력일: ' + new Date().toLocaleDateString('ko-KR') + ' &nbsp;|&nbsp; 담당: __________ &nbsp;|&nbsp; 확인: __________</div>';
        html += '<script>window.onload = function() { window.print(); }<\/script>';
        html += '</body></html>';
        win.document.write(html);
        win.document.close();
    } catch(e) {
        showToast('작업지시서 생성 실패: ' + (e.message || e), 'error');
    }
}

// ===== 판짜기 작업지시서 (2026-09-26 용준님 「안 A」) =====
// 한 번의 재단 판짜기(원본 1장 → 판 N개)를 **한 부**로 — 판마다 흩어진 쪽은 실제로 보기 어렵다.
//   왼쪽 = 원본 전체 그림(번호는 그림에 이미 찍혀 있다) 위에 **판별 색 테두리** · 오른쪽 = 판별 목록표(번호·규격·확인).
//   보는 순서 = 조각 꼬리표 번호 → 그림에서 자리 → 표에서 규격 확인·체크.
//   데이터 = `/api/orders/:id/work-order` 의 `batches`(조립 정본 utils/cutBatch.ts). 번호 끈 판짜기는 오지 않는다.
//   인쇄(printWorkOrder)와 카드 상세 화면이 **같은 함수**를 쓴다 — 두 벌이면 한쪽만 고쳐진다.
var WO_PLATE_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#4b5563'];
function woPlateColor(k) { return WO_PLATE_COLORS[(Math.max(1, k) - 1) % WO_PLATE_COLORS.length]; }

var WO_BATCH_CSS = ''
    + '.wob-page { font-family: "Malgun Gothic", sans-serif; color: #111; }'
    + '.wob-hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 5px; margin-bottom: 6px; }'
    + '.wob-hd h2 { margin: 0; font-size: 18px; }'
    + '.wob-hd .wob-sub { font-size: 12px; margin-top: 2px; }'
    + '.wob-hd .wob-meta { font-size: 11px; color: #6b7280; text-align: right; line-height: 1.5; }'
    + '.wob-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 8px; }'
    + '.wob-chip { border: 1px solid #d1d5db; border-radius: 12px; padding: 1px 9px; font-size: 12px; }'
    + '.wob-chip.fin { background: #fef3c7; border-color: #f59e0b; }'
    + '.wob-grid { display: flex; gap: 8mm; align-items: flex-start; }'
    // 왼쪽 = 그림 폭만큼(세로로 긴 원본이면 좁아지고 표가 넓어진다) · 가로로 긴 원본은 62% 에서 멈춘다
    + '.wob-left { flex: 0 1 auto; max-width: 62%; min-width: 0; }'
    + '.wob-right { flex: 1; min-width: 0; }'
    + '.wob-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; margin-bottom: 4px; }'
    + '.wob-legend i { display: inline-block; width: 11px; height: 11px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }'
    // 그림 상자 = 그림 크기 그대로(inline-block) — 테두리 SVG 가 % 로 겹치려면 상자와 그림이 같아야 한다
    + '.wob-fig { position: relative; display: inline-block; max-width: 100%; border: 1px solid #d1d5db; background: #fafafa; line-height: 0; }'
    + '.wob-fig img { display: block; max-width: 100%; max-height: 150mm; width: auto; height: auto; }'
    + '.wob-fig svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }'
    + '.wob-nofig { border: 1px dashed #d1d5db; color: #9ca3af; font-size: 12px; padding: 24px; text-align: center; }'
    + '.wob-cap { font-size: 10px; color: #6b7280; margin-top: 3px; }'
    + '.wob-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }'
    + '.wob-tbl th, .wob-tbl td { border: 1px solid #d1d5db; padding: 2px 6px; text-align: center; }'
    + '.wob-tbl th { background: #f3f4f6; }'
    + '.wob-tbl tr.wob-plate td { background: #f9fafb; text-align: left; font-weight: 700; }'
    + '.wob-tbl td.wob-num { font-weight: 800; font-size: 13px; }'
    + '.wob-tbl .wob-note { font-weight: 600; color: #b45309; margin-left: 6px; }'
    + '.wob-box { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #111; }';

/**
 * 판짜기 한 부 HTML.
 * @param b     batches[i] — {plate_total, piece_count, overview(data URI|null), plates:[{index,line_id,other_order_number,waiting,pieces:[{n,w,h,b?}]}]}
 * @param order 주문 머리(주문번호·거래처)
 * @param lines 이 주문의 라인(후가공 요약용 — 이 판짜기의 판 라인만 쓴다)
 */
function woBatchHtml(b, order, lines, esc) {
    esc = esc || window.escapeHtml || function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var byIdx = {};
    (b.plates || []).forEach(function(p) { byIdx[p.index] = p; });

    // 후가공 요약 — 이 판짜기에 속한 이 주문 라인들의 후가공·마감(중복 제거)
    var chips = [], seen = {};
    function chip(t) { if (t && !seen[t]) { seen[t] = 1; chips.push(t); } }
    (lines || []).forEach(function(ln) {
        var mine = (b.plates || []).some(function(p) { return p.line_id === ln.id; });
        if (!mine) return;
        try {
            var pa = typeof ln.post_processing === 'string' ? JSON.parse(ln.post_processing) : ln.post_processing;
            if (Array.isArray(pa)) pa.filter(function(pp) { return !woPPHidden(pp.name || pp.code || pp); })
                .forEach(function(pp) { chip(window.MES_FIN ? window.MES_FIN.pp(pp) : String(pp.name || pp.code || pp)); });
        } catch (e) { /* ignore: 후가공 JSON 이 깨졌으면 요약에서만 빠진다(라인 쪽에 원문이 남는다) */ }
        var ft = window.MES_FIN ? window.MES_FIN.finishing(ln.finishing) : '';
        if (ft) chip('마감 ' + ft);
    });

    var h = '<div class="wob-page">';
    h += '<div class="wob-hd"><div><h2>재단 작업지시서 · 판짜기 전체</h2>'
        + '<div class="wob-sub">' + esc((order && order.client_name) || '') + '</div></div>'
        + '<div class="wob-meta">주문 ' + esc((order && order.order_number) || '-') + '</div></div>';
    h += '<div class="wob-chips"><span class="wob-chip">판 <b>' + b.plate_total + '</b>개</span>'
        + '<span class="wob-chip">조각 <b>' + b.piece_count + '</b>개</span>';
    chips.forEach(function(t) { h += '<span class="wob-chip fin">' + esc(t) + '</span>'; });
    h += '</div>';

    h += '<div class="wob-grid"><div class="wob-left">';
    h += '<div class="wob-legend">';
    for (var k = 1; k <= b.plate_total; k++) {
        var pk = byIdx[k];
        h += '<span><i style="background:' + woPlateColor(k) + '"></i>판 ' + k + '/' + b.plate_total + (pk ? ' (' + pk.pieces.length + '개)' : ' (기록 없음)') + '</span>';
    }
    h += '</div>';
    if (b.overview) {
        // 테두리 = 원본 그림 대비 % 상자(패널 셸 0.102.0+). 구 패널 등록은 상자가 없어 그림만 나간다.
        var rects = '';
        (b.plates || []).forEach(function(p) {
            p.pieces.forEach(function(pc) {
                if (!pc.b) return;
                rects += '<rect x="' + pc.b[0] + '" y="' + pc.b[1] + '" width="' + pc.b[2] + '" height="' + pc.b[3] + '" fill="' + woPlateColor(p.index)
                    + '" fill-opacity="0.08" stroke="' + woPlateColor(p.index) + '" stroke-width="3" vector-effect="non-scaling-stroke"/>';
            });
        });
        h += '<div class="wob-fig"><img src="' + b.overview + '">'
            + (rects ? '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + rects + '</svg>' : '') + '</div>';
        h += '<div class="wob-cap">원본 전체 · 번호 = 조각 꼬리표 · 테두리 색 = 나온 판</div>';
    } else {
        h += '<div class="wob-nofig">원본 전체 그림이 없습니다(구 버전 패널·에이전트 등록) — 목록표로 확인하세요</div>';
    }
    h += '</div><div class="wob-right"><table class="wob-tbl"><tr><th>번호</th><th>규격(mm)</th><th>확인</th></tr>';
    for (var k2 = 1; k2 <= b.plate_total; k2++) {
        var p2 = byIdx[k2], col = woPlateColor(k2);
        var note = !p2 ? '기록 없음' : (p2.other_order_number ? '다른 주문 ' + p2.other_order_number : (p2.waiting ? '대기함 — 아직 주문에 안 넣음' : ''));
        h += '<tr class="wob-plate"><td colspan="3" style="color:' + col + '">■ 판 ' + k2 + '/' + b.plate_total
            + (p2 ? ' — 조각 ' + p2.pieces.length + '개' : '') + (note ? '<span class="wob-note">' + esc(note) + '</span>' : '') + '</td></tr>';
        if (!p2) continue;
        p2.pieces.forEach(function(pc) {
            h += '<tr><td class="wob-num" style="color:' + col + '">' + esc(pc.n) + '</td><td>' + pc.w + ' × ' + pc.h + '</td><td><span class="wob-box"></span></td></tr>';
        });
    }
    h += '</table></div></div></div>';
    return h;
}
