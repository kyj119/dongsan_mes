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

/** Code128 바코드 → dataURL. 리더기가 읽는 것은 **주문번호**다. 전역이 없으면 빈 문자열(생략). */
function woBarcodeDataUrl(text) {
    if (!text || typeof JsBarcode === 'undefined') return '';
    try {
        var canvas = document.createElement('canvas');
        JsBarcode(canvas, String(text), {
            format: 'CODE128', width: 1.6, height: 44,
            displayValue: true, fontSize: 15, textMargin: 1, margin: 2
        });
        return canvas.toDataURL('image/png');
    } catch (e) {
        console.warn('[cards] 바코드 생성 실패', e);
        return '';
    }
}

async function printWorkOrder(orderId) {
    try {
        var res = await axios.get('/api/orders/' + orderId + '/work-order');
        if (!res.data.success) { showToast('작업지시서 조회 실패', 'error'); return; }
        var order = res.data.data.order || {};
        var lines = res.data.data.lines || [];

        // QR = **출고 검수**(/pack?order=N). 종이를 든 사람이 폰으로 그대로 검수에 들어간다.
        //   예전엔 카드 목록(/cards?order_id=)이라 현장이 다시 찾아 들어가야 했다.
        var qrDataUrl = '';
        if (typeof QRCode !== 'undefined') {
            try { qrDataUrl = await QRCode.toDataURL(window.location.origin + '/pack?order=' + orderId, { width: 240, margin: 0 }); } catch(e) {}
        } else {
            console.warn('[cards] QRCode 미로드 — 작업지시서 QR 생략 (layout.ts CDN 확인)');
        }
        var barDataUrl = woBarcodeDataUrl(order.order_number);

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
            + '.codes .bar { height: 14mm; display: block; }'
            + '.notes { background: #fff7ed; border: 1px solid #fdba74; border-radius: 6px; padding: 8px 12px; margin: 8px 0; font-size: 13px; }'
            + '.line-section { margin: 14px 0 6px; font-size: 14px; font-weight: 800; border-bottom: 2px solid #111; padding-bottom: 3px; page-break-after: avoid; break-after: avoid; }'
            + '.line-section .cnt { float: right; font-size: 11px; font-weight: 600; color: #6b7280; }'
            + '.line-section-ship { border-bottom-color: #9ca3af; color: #4b5563; }'
            + '.row { display: flex; gap: 12px; align-items: stretch; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 10px; page-break-inside: avoid; break-inside: avoid; }'
            + '.thumb { width: 240px; max-height: 240px; flex-shrink: 0; border: 1px solid #e5e7eb; border-radius: 6px; object-fit: contain; background: #fff; align-self: flex-start; }'
            + '.thumb-empty { width: 240px; height: 120px; flex-shrink: 0; border: 1px dashed #d1d5db; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #d1d5db; font-size: 34px; align-self: flex-start; }'
            + '.info-col { flex: 1; min-width: 0; }'
            + '.title { font-size: 16px; font-weight: 700; }'
            + '.spec { font-size: 14px; color: #374151; margin-top: 3px; }'
            + '.fabric { font-size: 13px; margin-top: 4px; }'
            + '.fabric b { color: #6b7280; font-weight: 600; }'
            + '.memo { font-size: 12px; color: #2563eb; margin-top: 3px; }'
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
            + '@media print { body { padding: 0; } @page { size: A4; margin: 10mm; } }'
            + '</style></head><body>';

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
        if (barDataUrl) html += '<img src="' + barDataUrl + '" class="bar">';
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

                html += '<div class="row">';

                // 시안
                html += ln.thumbnail
                    ? '<img src="' + ln.thumbnail + '" class="thumb">'
                    : '<div class="thumb-empty"><span>&#128444;</span></div>';

                // 지시
                html += '<div class="info-col">';
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
