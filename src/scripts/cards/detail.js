// ===== 카드 상세 모달 =====
async function viewCardDetail(cardId) {
    try {
        var results = await Promise.all([
            axios.get('/api/cards/' + cardId),
            axios.get('/api/cards/' + cardId + '/history'),
            axios.get('/api/cards/' + cardId + '/defects')
        ]);
        var card = results[0].data.data;
        // 같은 주문의 다른 카드 조회 (알림 배너용)
        var siblingCards = [];
        if (card && card.order_id) {
            try {
                var sibRes = await axios.get('/api/cards?order_id=' + card.order_id);
                siblingCards = (sibRes.data.data || []).filter(function(c) { return c.id !== cardId; });
            } catch(_) {}
        }
        showCardModal(card, results[1].data.data || [], results[2].data.data || [], siblingCards);
    } catch (e) { showToast('카드 정보 로드 실패', 'error'); }
}

// ===== 시안 MMS 발송 (카드 썸네일 자동 첨부) =====
// /api/cards/:id 는 R2 마커('r2:thumb:')를 data URI로 복원해 주므로(queries.ts) 그대로 첨부 가능.
// 리사이즈·JPG 압축은 통합 발송 모달(shell.js setMsgImageFromDataUri)이 담당.
async function sendCardProofMms(cardId) {
    try {
        var res = await axios.get('/api/cards/' + cardId);
        var card = res.data.data;
        if (!card) { showToast('카드 정보를 불러오지 못했습니다', 'error'); return; }

        var thumb = (card.thumbnail_url && card.thumbnail_url.length > 10) ? card.thumbnail_url : '';
        var items = cardItems(card);
        if (!thumb) {
            for (var i = 0; i < items.length; i++) {
                if (items[i].thumbnail_url && items[i].thumbnail_url.length > 10) { thumb = items[i].thumbnail_url; break; }
            }
        }
        if (!thumb) { showToast('이 카드에는 시안 이미지가 없습니다', 'warning'); return; }

        var itemName = items.length > 0 ? (items[0].item_name || '') : '';
        var body = '[동산기획] 시안 확인 요청' + String.fromCharCode(10)
            + '주문번호: ' + (card.order_number || '-') + String.fromCharCode(10)
            + (itemName ? ('품목: ' + itemName + (items.length > 1 ? ' 외 ' + (items.length - 1) + '건' : '') + String.fromCharCode(10)) : '')
            + '첨부된 시안을 확인 후 회신 부탁드립니다.';

        openSendMessage({
            defaultChannel: 'mms',
            defaultSubject: '시안 확인',
            defaultContent: body,
            receiver: { name: card.client_name || '', phone: card.contact_mobile || card.contact_phone || '' },
            context: { type: 'card', id: card.id, client_id: card.client_id },
            imageDataUri: thumb,
            imageName: card.card_number || '시안'
        });
    } catch (e) {
        showToast('시안 발송 준비 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message || ''), 'error');
    }
}
window.sendCardProofMms = sendCardProofMms;

function buildDefectsHtml(defects) {
  if (!defects || defects.length === 0) return '';
  var catLabels = { COLOR: '색상', ALIGNMENT: '정렬', CUT: '재단', MATERIAL: '소재', PRINT: '출력', PP: '후가공', SIZE: '규격', DAMAGE: '파손', DESIGN: '디자인', OTHER: '기타' };
  var statusLabels = { OPEN: '미처리', UNDER_REVIEW: '검토중', RESOLVED: '해결', REWORK_REQUIRED: '재작업필요' };
  var statusColors = { OPEN: 'bg-red-50 text-red-700', UNDER_REVIEW: 'bg-amber-50 text-amber-700', RESOLVED: 'bg-green-50 text-green-700', REWORK_REQUIRED: 'bg-amber-50 text-amber-700' };
  var rows = defects.map(function(d) {
    return '<div class="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">'
      + '<span class="px-1.5 py-0.5 rounded text-xs font-medium ' + (statusColors[d.status] || 'bg-gray-100') + '">' + (statusLabels[d.status] || d.status) + '</span>'
      + '<span class="text-xs font-medium">' + (catLabels[d.defect_category] || d.defect_category || '') + '</span>'
      + '<span class="text-xs text-gray-500 flex-1">' + escapeHtml(d.description || '') + '</span>'
      + '<span class="text-xs text-gray-400 whitespace-nowrap">' + (d.reported_at ? formatKST(d.reported_at, 'date') : '') + '</span>'
      + '</div>';
  }).join('');
  return '<div class="mt-3 bg-amber-50 rounded p-2">'
    + '<div class="text-xs font-bold text-amber-700 mb-1"><i class="fas fa-exclamation-triangle mr-1"></i>불량 이력 (' + defects.length + '건)</div>'
    + rows + '</div>';
}

function showCardModal(card, history, defects, siblingCards) {
    var existing = document.getElementById('cardModal');
    if (existing) existing.remove();

    // 같은 주문 다른 카드 알림 배너
    var siblingBannerHtml = '';
    if (siblingCards && siblingCards.length > 0) {
        var pendingSiblings = siblingCards.filter(function(s) {
            return s.status !== 'PRINT_DONE' && s.status !== 'SHIPPED';
        });
        if (pendingSiblings.length > 0) {
            siblingBannerHtml = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:12px">'
                + '<div style="font-size:13px;font-weight:600;color:#92400e"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>이 주문에 다른 카드가 있습니다</div>';
            pendingSiblings.forEach(function(s) {
                var sLabel = statusLabels[s.status] || s.status;
                siblingBannerHtml += '<div style="font-size:12px;color:#b45309;margin-top:4px">'
                    + escapeHtml(s.card_number || '') + ': ' + escapeHtml(s.category_name || s.item_name || '') + ' (' + sLabel + ')</div>';
            });
            siblingBannerHtml += '<div style="font-size:11px;color:#d97706;margin-top:6px">→ 전체 완료 후 같이 출고해야 합니다</div></div>';
        } else {
            // 모든 형제 카드 완료
            siblingBannerHtml = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:12px">'
                + '<div style="font-size:13px;font-weight:600;color:#166534"><i class="fas fa-check-circle" style="margin-right:4px"></i>이 주문의 모든 카드가 완료되었습니다</div>'
                + '<div style="font-size:11px;color:#15803d;margin-top:2px">출고 가능 상태입니다.</div></div>';
        }
    }

    var urg = getUrgency(card.delivery_date);
    var stLabel = statusLabels[card.status] || card.status;
    var statusBg = card.status === 'PRINT_DONE' ? 'background:#f0fdf4;color:#166534'
        : card.status === 'HOLD' ? 'background:#fef2f2;color:#991b1b'
        : 'background:#eff6ff;color:#1d4ed8';
    var deliveryMethod = card.delivery_method || '';
    var deliveryTime = card.delivery_time || '';
    var itemsArr = cardItems(card);

    // ── 진행률 계산 ──
    var totalItems = itemsArr.length || 1;
    var doneItems = 0;
    itemsArr.forEach(function(it) { if (it.print_completed === 1) doneItems++; });
    var pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
    var hasProgress = card.status !== 'PRINT_DONE' && itemsArr.length > 0;

    // ── 아이템 리스트 (개별 썸네일 + 체크박스) ──
    // 단품 카드 폴백: 품목 썸네일(ai_analysis 그룹)이 없으면 카드 썸네일을 쓴다.
    //   1품목 카드에선 카드 썸네일 = 그 품목의 시안이라 모호하지 않음(다품목은 폴백 금지 — 오표시).
    //   /api/cards/:id 가 R2 마커('r2:thumb:')를 data URI로 복원해 주므로 그대로 <img src> 가능.
    var cardThumbFallback = (itemsArr.length === 1 && card.thumbnail_url && card.thumbnail_url.length > 10)
        ? card.thumbnail_url : '';
    var itemsHtml = '';
    if (itemsArr.length > 0) {
        itemsArr.forEach(function(it) {
            var realW = Math.round(it.width || 0);
            var realH = Math.round(it.height || 0);
            var sf = it.scale_factor || 1;
            var isDone = it.print_completed === 1;
            var ciId = it.card_item_id || it.id;

            // 썸네일 (크게)
            var itThumb = it.thumbnail_url || cardThumbFallback;
            var thumbHtml = itThumb
                ? '<img src="' + itThumb + '" style="width:100%;height:100%;object-fit:contain;background:#f9fafb" onclick="event.stopPropagation();zoomThumb(this.src)" onerror="this.style.display=\'none\'">'
                : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#d1d5db"><i class="fas fa-image" style="font-size:28px"></i></div>';

            itemsHtml += '<div class="card-modal-item' + (isDone ? ' item-completed' : '') + '">';

            // 썸네일 영역
            itemsHtml += '<div class="card-modal-thumb" onclick="event.stopPropagation()">' + thumbHtml + '</div>';

            // 정보 영역
            itemsHtml += '<div class="card-modal-item-info">';
            itemsHtml += '<div style="display:flex;align-items:center;gap:8px">';
            itemsHtml += '<span style="font-size:14px;font-weight:600;color:' + (isDone ? '#9ca3af' : '#111827') + ';' + (isDone ? 'text-decoration:line-through;' : '') + '">' + escapeHtml(it.item_name || '품목') + '</span>';
            itemsHtml += '<span style="font-size:13px;font-weight:700;color:#2563eb">x' + (it.quantity || 1) + (it.unit || 'EA') + '</span>';
            itemsHtml += '</div>';

            // 규격
            itemsHtml += '<div style="font-size:12px;color:#6b7280;margin-top:2px">' + realW + ' x ' + realH + 'cm';
            if (sf > 1) itemsHtml += ' <span style="color:#9ca3af">(축척 1/' + sf + ')</span>';
            itemsHtml += '</div>';

            // 내용
            if (it.content) {
                itemsHtml += '<div style="font-size:12px;color:#2563eb;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(it.content) + '</div>';
            }

            // 후가공 뱃지
            if (it.post_processing) {
                try {
                    var ppA = typeof it.post_processing === 'string' ? JSON.parse(it.post_processing) : it.post_processing;
                    var visPP = Array.isArray(ppA) ? ppA.filter(function(pp) { return !isPPHidden(pp.name || pp.code || pp); }) : [];
                    if (visPP.length > 0) {
                        itemsHtml += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">';
                        visPP.forEach(function(pp) {
                            var ppName = pp.name || pp.code || pp;
                            var badge = getPPBadge(ppName);
                            // 모달은 지시를 읽는 자리 — 이름만이면 「펀칭」이 몇 개·어디인지 알 수 없다
                            // (칸반 목록 배지는 좁아서 이름만 유지).
                            var ppText = (window.MES_FIN ? window.MES_FIN.pp(pp) : '') || String(ppName);
                            itemsHtml += '<span style="display:inline-flex;padding:1px 6px;font-size:10px;font-weight:600;border-radius:999px;background:' + badge.bg + ';color:' + badge.color + ';border:1px solid ' + badge.border + '">' + escapeHtml(ppText) + '</span>';
                        });
                        itemsHtml += '</div>';
                    }
                } catch(ex2) {}
            }
            // 마감방식 (품목별)
            if (it.finishing) {
                var dFinText = formatFinishing(it.finishing);
                if (dFinText) {
                    itemsHtml += '<div style="margin-top:4px;padding:2px 8px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;font-size:11px;color:#92400e;display:inline-block">'
                        + '<i class="fas fa-cut" style="font-size:9px;margin-right:3px"></i>마감: ' + escapeHtml(dFinText) + '</div>';
                }
            }
            itemsHtml += '</div>'; // end info

            // 체크박스 (출력 완료 토글)
            if (ciId && card.status !== 'PRINT_DONE') {
                itemsHtml += '<div style="display:flex;align-items:center;flex-shrink:0;padding-left:8px" onclick="event.stopPropagation()">';
                itemsHtml += '<input type="checkbox" style="width:20px;height:20px;accent-color:#2563eb;cursor:pointer" '
                    + (isDone ? 'checked' : '') + ' onchange="toggleItemPrint(' + card.id + ',' + ciId + ')">';
                itemsHtml += '</div>';
            } else if (isDone) {
                itemsHtml += '<div style="flex-shrink:0;padding-left:8px"><i class="fas fa-check-circle" style="font-size:18px;color:#16a34a"></i></div>';
            }

            itemsHtml += '</div>'; // end card-modal-item
        });
    } else if (card.category_name) {
        itemsHtml = '<div style="padding:12px 0;font-size:13px;color:#6b7280">' + escapeHtml(card.category_name || '') + ' · ' + (card.item_count || 1) + '건</div>';
    }

    // ── 상태 이력 타임라인 ──
    var histHtml = '';
    if (history.length > 0) {
        histHtml += '<div style="border-top:1px solid #f1f5f9;margin:14px 0 10px"></div>';
        histHtml += '<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">상태 이력</div>';
        history.forEach(function(h) {
            var fromLabel = h.from_status ? (statusLabels[h.from_status] || h.from_status) : '-';
            var toLabel = statusLabels[h.to_status] || h.to_status;
            var dotColor = h.to_status === 'PRINT_DONE' ? '#16a34a' : h.to_status === 'HOLD' ? '#ef4444' : '#3b82f6';
            histHtml += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:11px">';
            histHtml += '<div style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';margin-top:4px;flex-shrink:0"></div>';
            histHtml += '<span style="color:#9ca3af;white-space:nowrap;flex-shrink:0;width:84px">' + formatKST(h.created_at, null, {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}) + '</span>';
            histHtml += '<span style="color:#374151;flex:1;min-width:0;word-break:break-word">' + fromLabel + ' → <b>' + toLabel + '</b>'
                + (h.change_reason ? ' <span style="color:#9ca3af">(' + escapeHtml(h.change_reason) + ')</span>' : '') + '</span>';
            histHtml += '</div>';
        });
    }

    // ── 액션 버튼 ──
    var actionBtns = '';
    if (card.status === 'PRINTING' || card.status === 'RIP_WAITING') {
        if (!card.rip_status) {
            actionBtns += '<button class="action-btn action-btn-rip flex-1" onclick="closeCardModal();showRipSendModal(' + card.id + ')">RIP 전송</button>';
        }
        actionBtns += '<button class="action-btn action-btn-hold flex-1" onclick="closeCardModal();quickHold(' + card.id + ')">보류</button>';
    } else if (card.status === 'HOLD') {
        actionBtns += '<button class="action-btn action-btn-resume flex-1" onclick="closeCardModal();quickStatus(' + card.id + ',\'PRINTING\')">재개</button>';
    } else if (card.status === 'PRINT_DONE') {
        if (card.shipped_at) {
            actionBtns += '<button class="action-btn flex-1" style="background:#fff;color:#6b7280;border:1px solid #d1d5db;border-radius:8px" onclick="closeCardModal();unshipCard(' + card.id + ')"><i class="fas fa-undo"></i> 출고 취소</button>';
        } else {
            actionBtns += '<button class="action-btn action-btn-done flex-1" onclick="closeCardModal();shipCard(' + card.id + ')"><i class="fas fa-truck"></i> 출고</button>';
            actionBtns += '<button class="action-btn flex-1" style="background:#fff;color:#6b7280;border:1px solid #d1d5db;border-radius:8px" onclick="closeCardModal();revertCard(' + card.id + ')"><i class="fas fa-undo"></i> 되돌리기</button>';
        }
    }
    actionBtns += '<button class="action-btn action-btn-hold flex-1" onclick="closeCardModal();showDefectForm(' + card.id + ')"><i class="fas fa-exclamation-triangle"></i> 불량접수</button>';
    // 시안 MMS 발송 — 썸네일(카드 또는 품목)이 있을 때만 노출
    var hasProofImg = (card.thumbnail_url && card.thumbnail_url.length > 10)
        || itemsArr.some(function(it) { return it.thumbnail_url && it.thumbnail_url.length > 10; });
    if (hasProofImg) {
        actionBtns += '<button class="action-btn flex-1" style="background:#f0fdfa;color:#0f766e;border:1px solid #99f6e4;border-radius:8px" onclick="closeCardModal();sendCardProofMms(' + card.id + ')"><i class="fas fa-image"></i> 시안 발송</button>';
    }
    actionBtns += '<button class="action-btn flex-1" style="background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:8px" onclick="printWorkOrder(' + card.order_id + ')"><i class="fas fa-print"></i> 작업지시서</button>';
    // ⚠️ 저장되는 값은 **'전사/태극기'** 다(helpers.ts 의 category). 'TRANSFER_FLAG'·'전사' 와 완전일치로
    //    비교하던 탓에 **봉제작지 버튼이 영구 미노출**이었다 — 정작 그 양식이 필요한 라인에서만 안 떴다.
    var cdCatName = String(card.category_name || '');
    if (cdCatName.indexOf('전사') >= 0 || cdCatName.indexOf('태극기') >= 0 || cdCatName === 'TRANSFER_FLAG') {
        actionBtns += '<button class="action-btn flex-1" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:8px" onclick="printSewingWorkOrder(' + card.id + ')"><i class="fas fa-cut"></i> 봉제작지</button>';
    }

    // ── 모달 조립 (C형 슬라이드 패널) ──
    var modal = document.createElement('div');
    modal.id = 'cardModal';
    modal.className = 'card-panel-overlay';
    modal.onclick = function(e) { if (e.target === modal) closeCardModal(); };

    var timeRem = getTimeRemaining(card.delivery_date, deliveryTime);
    var timeHtml = '';
    if (timeRem) {
        timeHtml = '<span style="font-size:12px;' + (timeRem.urgent ? 'color:#dc2626;font-weight:700' : 'color:#6b7280') + '"><i class="far fa-clock"></i> ' + timeRem.text + '</span>';
    } else {
        timeHtml = '<span style="font-size:12px;color:#9ca3af">' + (card.delivery_date || '납기미정') + '</span>';
    }

    modal.innerHTML = '<div class="card-panel" id="cardPanel">'
        // 헤더
        + '<div class="card-panel-header">'
        + '  <div style="flex:1;min-width:0">'
        + '    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '      <span style="font-size:17px;font-weight:700">' + escapeHtml(card.client_name || '') + '</span>'
        + '      <span style="padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;' + statusBg + '">' + stLabel + '</span>'
        + '    </div>'
        + '    <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#9ca3af">'
        + '      <span>' + escapeHtml(card.card_number || '') + '</span>'
        + '      <span>·</span>'
        + '      <span>' + escapeHtml(card.order_number || '') + '</span>'
        + '      <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;' + (urg.diff <= 0 ? 'background:#ef4444;color:#fff' : urg.diff <= 1 ? 'background:#f97316;color:#fff' : urg.diff <= 3 ? 'background:#eab308;color:#fff' : 'background:#22c55e;color:#fff') + '">' + urg.level + '</span>'
        + '      ' + timeHtml
        + '    </div>'
        + '  </div>'
        + '  <a href="/cards/' + card.id + '" class="spa-link" style="font-size:11px;color:#6b7280;text-decoration:none;padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;white-space:nowrap;flex-shrink:0" title="작업지시서 상세 페이지"><i class="fas fa-external-link-alt" style="margin-right:3px"></i>상세</a>'
        + '  <button onclick="closeCardModal()" style="background:none;border:none;font-size:20px;color:#9ca3af;cursor:pointer;padding:4px;flex-shrink:0">&times;</button>'
        + '</div>'
        // 본문 (스크롤)
        + '<div class="card-panel-body">'
        // 같은 주문 다른 카드 알림 배너
        + siblingBannerHtml
        // 진행률 바
        + (hasProgress
            ? '<div style="margin-bottom:14px">'
            + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
            + '    <span style="font-size:12px;font-weight:600;color:#6b7280">출력 진행</span>'
            + '    <span style="font-size:12px;font-weight:700;color:' + (pct === 100 ? '#16a34a' : '#2563eb') + '">' + pct + '% (' + doneItems + '/' + totalItems + ')</span>'
            + '  </div>'
            + '  <div style="height:6px;background:#e5e7eb;border-radius:4px;overflow:hidden">'
            + '    <div style="height:100%;width:' + pct + '%;background:' + (pct === 100 ? '#16a34a' : '#3b82f6') + ';border-radius:4px;transition:width 0.3s"></div>'
            + '  </div>'
            + '</div>'
            : '')
        // 아이템 리스트
        + itemsHtml
        // 메타 정보
        + '<div style="border-top:1px solid #f1f5f9;margin:14px 0 10px"></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
        + '  <div style="font-size:12px"><span style="color:#9ca3af">납기일:</span> <span style="color:#111827;font-weight:500">' + (card.delivery_date || '미정') + '</span></div>'
        + '  <div style="font-size:12px"><span style="color:#9ca3af">납품:</span> <span style="color:#111827;font-weight:500">' + (deliveryMethod || '-') + (deliveryTime ? ' ' + deliveryTime : '') + '</span></div>'
        + '  <div style="font-size:12px"><span style="color:#9ca3af">카테고리:</span> <span style="color:#111827;font-weight:500">' + escapeHtml(card.category_name || '-') + '</span></div>'
        + '  <div style="font-size:12px"><span style="color:#9ca3af">접수자:</span> <span style="color:#111827;font-weight:500">' + escapeHtml(card.created_by_name || '-') + '</span></div>'
        + '</div>'
        // 메모/보류
        + (card.order_notes ? '<div style="margin-top:8px;padding:8px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af"><i class="fas fa-clipboard" style="margin-right:4px"></i><b>주문 메모:</b> ' + escapeHtml(card.order_notes) + '</div>' : '')
        + (card.client_notes && card.client_notes.length > 0 ? '<div style="margin-top:6px;padding:8px 10px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#854d0e"><i class="fas fa-user-tag" style="margin-right:4px"></i><b>거래처 참고:</b><ul style="margin:4px 0 0 16px;padding:0">' + card.client_notes.map(function(cn) { return '<li>' + escapeHtml(cn.content || '') + '</li>'; }).join('') + '</ul></div>' : '')
        + (card.notes ? '<div style="margin-top:6px;padding:8px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#6b7280"><i class="far fa-sticky-note" style="margin-right:4px"></i>' + escapeHtml(card.notes) + '</div>' : '')
        + (card.hold_reason ? '<div style="margin-top:6px;padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#991b1b"><i class="fas fa-pause-circle" style="margin-right:4px"></i>보류: ' + escapeHtml(card.hold_reason) + '</div>' : '')
        // 불량
        + buildDefectsHtml(defects || [])
        // 이력 타임라인
        + histHtml
        + '</div>'
        // 하단 고정 액션
        + '<div class="card-panel-footer">'
        + '  <div style="display:flex;gap:8px">' + actionBtns + '</div>'
        + '</div>'
        + '</div>';

    document.body.appendChild(modal);
    // 슬라이드 인 애니메이션
    requestAnimationFrame(function() {
        var panel = document.getElementById('cardPanel');
        if (panel) panel.classList.add('card-panel-open');
    });
}

function closeCardModal() {
    var panel = document.getElementById('cardPanel');
    if (panel) {
        panel.classList.remove('card-panel-open');
        setTimeout(function() {
            var modal = document.getElementById('cardModal');
            if (modal) modal.remove();
        }, 250);
    } else {
        var modal = document.getElementById('cardModal');
        if (modal) modal.remove();
    }
}

// ===== 작업지시서 인쇄 =====
async function printWorkOrder(orderId) {
    try {
        var res = await axios.get('/api/orders/' + orderId);
        if (!res.data.success) { showToast('주문 조회 실패', 'error'); return; }
        var order = res.data.data;
        var allItems = order.items || [];

        // Q7: 그룹 품목 처리 — 자식(parent_item_id 있는)만 표시, 부모는 건너뜀
        var childIds = new Set();
        allItems.forEach(function(it) { if (it.parent_item_id) childIds.add(it.parent_item_id); });
        var items = allItems.filter(function(it) { return !childIds.has(it.id); });

        // 라인별 시안 썸네일 — **키는 order_item_id**, 값은 그 라인의 시안.
        //   ⚠️ 예전엔 카드 1장짜리 대표 썸네일을 `thumbMap[item_name]` 에 넣어 ①다품목 카드의 전 품목이
        //      같은 그림으로 인쇄되고 ②같은 품명 라인이 둘이면 서로 덮어썼다.
        //   단건 카드 API 가 ai_analysis 그룹을 라인별로 해석하고 R2 마커도 data URI 로 복원해 주므로
        //   그걸 정본으로 쓴다(인쇄는 동기 렌더라 미리 주입해야 한다).
        var thumbByItemId = {};
        // 라인(생산 그룹) 귀속 — **카드에서 역으로** 읽는다. 카드 그룹 판정은 서버(getCardGroup)가 정본이고
        //   품목 카테고리·기성품 여부·item_type 이 다 필요해서 프론트에서 재구현하면 반드시 갈린다.
        //   카드에 안 담긴 라인 = 제작 대상이 아닌 것(상품·부자재) → 「출고만」 섹션으로 간다.
        var lineByItemId = {};
        try {
            var cardsRes = await axios.get('/api/cards?order_id=' + orderId + '&limit=50');
            if (cardsRes.data.success) {
                var cardsList = cardsRes.data.data?.cards || cardsRes.data.data || [];
                var details = await Promise.all(cardsList.map(function(c) {
                    return axios.get('/api/cards/' + c.id)
                        .then(function(r) { return r.data && r.data.data; })
                        .catch(function() { return null; });
                }));
                details.filter(Boolean).forEach(function(cd) {
                    var cdItems = cardItems(cd);
                    // 단품 카드에서만 카드 썸네일 폴백 (다품목은 어느 라인 것인지 모호 → 폴백 금지)
                    var fallback = (cdItems.length === 1 && cd.thumbnail_url && cd.thumbnail_url.length > 10) ? cd.thumbnail_url : '';
                    cdItems.forEach(function(ci) {
                        var uri = ci.thumbnail_url || fallback;
                        if (uri && ci.id) thumbByItemId[ci.id] = uri;
                        if (ci.id) lineByItemId[ci.id] = cd.category_name || '제작';
                    });
                });
            }
        } catch(e) {}

        // QR 코드 생성
        var qrUrl = window.location.origin + '/cards?order_id=' + orderId;
        var qrDataUrl = '';
        if (typeof QRCode !== 'undefined') {
            try { qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1 }); } catch(e) {}
        } else {
            console.warn('[cards] QRCode 미로드 — 작업지시서 QR 생략 (layout.ts CDN 확인)');
        }

        // XSS 방지 래퍼 (document.write 컨텍스트)
        var esc = window.escapeHtml || function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

        // 마감방식 포맷 헬퍼
        // 표기 정본 = MES_FIN (shared/finishingLabel.js ↔ utils/finishingLabel.ts).
        // 예전엔 이 화면만 `열재단 사방`·`상:열재단`이라 체크리스트(`2면열재단`)와 문장이 갈렸다.
        // ⚠️ esc 는 호출부 책임 — 여기선 원문을 돌려준다.
        function fmtFinishing(fin) {
            return window.MES_FIN ? window.MES_FIN.finishing(fin) : '';
        }

        // 마감 다이어그램 (4변 시각화)
        function finishingDiagram(fin) {
            if (!fin) return '';
            try {
                var f = typeof fin === 'string' ? JSON.parse(fin) : fin;
                var t = f.top || '', b = f.bottom || '', l = f.left || '', r = f.right || '';
                if (!t && !b && !l && !r) return '';
                return '<div style="position:relative;width:100px;height:70px;border:2px solid #92400e;border-radius:4px;margin:4px 0;font-size:9px;color:#92400e">'
                    + '<span style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#fff;padding:0 3px">' + esc(t || '-') + '</span>'
                    + '<span style="position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);background:#fff;padding:0 3px">' + esc(b || '-') + '</span>'
                    + '<span style="position:absolute;left:-2px;top:50%;transform:translateY(-50%) rotate(-90deg);background:#fff;padding:0 3px">' + esc(l || '-') + '</span>'
                    + '<span style="position:absolute;right:-2px;top:50%;transform:translateY(-50%) rotate(90deg);background:#fff;padding:0 3px">' + esc(r || '-') + '</span>'
                    + '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:8px;color:#6b7280">디자인</span>'
                    + '</div>';
            } catch(e) { return ''; }
        }

        // 인쇄 창 생성
        var win = window.open('', '_blank', 'width=700,height=900');
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>작업지시서 - ' + esc(order.order_number || '') + '</title>'
            + '<style>'
            + 'body { font-family: "Malgun Gothic", sans-serif; padding: 20px; font-size: 13px; color: #111; }'
            + 'h1 { font-size: 18px; margin: 0 0 12px; border-bottom: 2px solid #111; padding-bottom: 6px; }'
            + '.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }'
            + '.info { font-size: 13px; line-height: 1.8; }'
            + '.info b { display: inline-block; width: 70px; }'
            + '.notes { background: #f0f7ff; border: 1px solid #bdd7ff; border-radius: 6px; padding: 8px 12px; margin: 10px 0; font-size: 12px; }'
            + '.item-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-top: 12px; page-break-inside: avoid; }'
            + '.item-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }'
            + '.item-thumb { width: 80px; height: 80px; border: 1px solid #e5e7eb; border-radius: 6px; object-fit: contain; background: #f9fafb; }'
            + '.item-info { flex: 1; }'
            + '.item-title { font-size: 14px; font-weight: 700; }'
            + '.item-spec { font-size: 12px; color: #6b7280; margin-top: 2px; }'
            + '.item-detail { display: flex; gap: 16px; align-items: flex-start; margin-top: 8px; }'
            + '.pp-badge { display: inline-block; padding: 1px 8px; font-size: 11px; border-radius: 12px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; margin-right: 4px; }'
            + '.fin-badge { display: inline-block; padding: 1px 8px; font-size: 11px; border-radius: 12px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; margin-right: 4px; }'
            + '.line-section { margin: 14px 0 4px; font-size: 13px; font-weight: 800; color: #111; border-bottom: 2px solid #111; padding-bottom: 3px; page-break-after: avoid; break-after: avoid; }'
            + '.line-section .line-count { float: right; font-size: 11px; font-weight: 600; color: #6b7280; }'
            + '.line-section-ship { border-bottom-color: #9ca3af; color: #4b5563; }'
            + '@media print { body { padding: 10px; } @page { size: A5; margin: 8mm; } .item-card { break-inside: avoid; } }'
            + '</style></head><body>';

        html += '<div class="header">';
        html += '<div><h1>작업지시서</h1>';
        html += '<div class="info">';
        html += '<b>주문번호</b> ' + esc(order.order_number || '-') + '<br>';
        html += '<b>거래처</b> ' + esc(order.client_name || '-') + '<br>';
        html += '<b>납기</b> ' + esc(order.delivery_date || '-') + ' (' + esc(order.delivery_method || '배송') + ')<br>';
        if (order.contact_mobile || order.contact_phone) {
            html += '<b>연락처</b> ' + esc(order.contact_mobile || order.contact_phone || '') + '<br>';
        }
        html += '</div></div>';
        if (qrDataUrl) html += '<img src="' + qrDataUrl + '" style="width:100px;height:100px">';
        html += '</div>';

        if (order.internal_notes) {
            html += '<div class="notes"><b>특이사항:</b> ' + esc(order.internal_notes) + '</div>';
        }

        // 품목별 카드 형태로 표시 (Q8: 시각적 작업지시서)
        // ── 라인(생산 그룹)별 섹션 ─────────────────────────────────────────────
        // 혼재 주문(출력+전사+간판+상품)이 한 덩어리로 찍혀 어느 공정 것인지 종이에서 구분이 안 됐다.
        //   섹션으로 나누고, 섹션마다 그 라인에서만 의미 있는 지시를 보여 준다
        //   (봉제방법·하도매·부직포·수술은 전사·태극기 전용 — 출력엔 마감·후가공).
        var SHIP_ONLY = '상품(제작없음 · 출고만)';
        var sections = [];
        var sectionIndex = {};
        items.forEach(function(item) {
            var line = lineByItemId[item.id] || SHIP_ONLY;
            if (sectionIndex[line] === undefined) { sectionIndex[line] = sections.length; sections.push({ line: line, rows: [] }); }
            sections[sectionIndex[line]].rows.push(item);
        });
        // 출고만 섹션은 항상 마지막(제작 지시가 아니라 동봉 안내다)
        sections.sort(function(a, b) { return (a.line === SHIP_ONLY ? 1 : 0) - (b.line === SHIP_ONLY ? 1 : 0); });

        var itemNo = 0;
        sections.forEach(function(sec) {
          var isSew = sec.line.indexOf('전사') >= 0 || sec.line.indexOf('태극기') >= 0;
          var isShipOnly = sec.line === SHIP_ONLY;
          html += '<div class="line-section' + (isShipOnly ? ' line-section-ship' : '') + '">■ ' + esc(sec.line)
               + '<span class="line-count">' + sec.rows.length + '건</span></div>';
          sec.rows.forEach(function(item) {
            var idx = itemNo++;
            var spec = '';
            if (item.width && item.height) spec = Math.round(item.width) + 'x' + Math.round(item.height) + 'cm';
            var thumb = thumbByItemId[item.id] || '';

            html += '<div class="item-card">';
            html += '<div class="item-header">';
            // 썸네일
            if (thumb) {
                html += '<img src="' + thumb + '" class="item-thumb">';
            } else {
                html += '<div class="item-thumb" style="display:flex;align-items:center;justify-content:center;color:#d1d5db;font-size:24px"><span>&#128444;</span></div>';
            }
            // 기본 정보
            html += '<div class="item-info">';
            html += '<div class="item-title">#' + (idx + 1) + ' ' + esc(item.item_name || '-') + '</div>';
            html += '<div class="item-spec">' + (spec || '-') + ' / ' + (item.quantity || 1) + esc(item.unit || 'EA') + '</div>';
            if (item.content) html += '<div class="item-spec" style="color:#2563eb">' + esc(item.content) + '</div>';
            html += '</div>';
            html += '</div>';

            // 지시 상세 — 출고만 라인은 제작 지시가 없다(동봉 대상)
            if (!isShipOnly) {
                html += '<div class="item-detail">';
                var ppHtml = '';
                if (item.post_processing) {
                    try {
                        var ppArr = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing;
                        if (Array.isArray(ppArr)) {
                            ppArr.filter(function(pp) { return !isPPHidden(pp.name || pp.code || pp); })
                                .forEach(function(pp) {
                                    var txt = window.MES_FIN ? window.MES_FIN.pp(pp) : String(pp.name || pp.code || pp);
                                    if (txt) ppHtml += '<span class="pp-badge">' + esc(txt) + '</span>';
                                });
                        }
                    } catch(e) {}
                }
                var finText = fmtFinishing(item.finishing);
                if (finText) ppHtml += '<span class="fin-badge">' + (isSew ? '✂ 봉제 ' : '✂ 마감 ') + esc(finText) + '</span>';
                var sfv = Number(item.scale_factor) || 1;
                if (!isSew && sfv > 1) ppHtml += '<span class="fin-badge">축척 1/' + sfv + '</span>';
                if (ppHtml) html += '<div>' + ppHtml + '</div>';

                // 마감 다이어그램은 4변 지시가 실제 의미를 갖는 봉제 라인에서만
                if (isSew) {
                    var diagram = finishingDiagram(item.finishing);
                    if (diagram) html += '<div>' + diagram + '</div>';
                }
                html += '</div>'; // end item-detail
            }

            html += '</div>'; // end item-card
          });   // end sec.rows.forEach
        });     // end sections.forEach

        html += '<div style="margin-top:20px;border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280">';
        html += '출력일: ' + new Date().toLocaleDateString('ko-KR') + ' | 담당: __________ | 확인: __________';
        html += '</div>';

        html += '<script>window.onload = function() { window.print(); }<\/script>';
        html += '</body></html>';
        win.document.write(html);
        win.document.close();
    } catch(e) {
        showToast('작업지시서 생성 실패: ' + (e.message || e), 'error');
    }
}

// ===== 봉제실 작업지시서 =====
async function printSewingWorkOrder(cardId) {
    try {
        // 카드 정보 + 주문 정보 로드
        var cardRes = await axios.get('/api/cards/' + cardId);
        if (!cardRes.data.success) { showToast('카드 조회 실패', 'error'); return; }
        var card = cardRes.data.data;

        var orderRes = await axios.get('/api/orders/' + card.order_id);
        if (!orderRes.data.success) { showToast('주문 조회 실패', 'error'); return; }
        var order = orderRes.data.data;
        var allItems = order.items || [];

        // 카드에 연결된 품목들 = 단건 카드 API가 정본(card_items 조인 + 원단명·품목별 썸네일까지 해석해 준다).
        //   ⚠️ 지역변수명을 cardItems 로 두면 전역 접근자 window.cardItems 를 가려 호출이 깨진다 → sewItems.
        var sewItems = cardItems(card).map(function(ci) {
            // 주문 라인에만 있는 필드(부속 판별용 parent_item_id 등)를 보강. id = order_item id.
            var oi = allItems.find(function(o) { return o.id === ci.id; });
            return oi ? Object.assign({}, oi, ci) : ci;
        });

        // 부속품 찾기 (parent_item_id가 카드 품목 중 하나를 가리키는 GOODS 품목)
        var mainItemIds = new Set(sewItems.map(function(i) { return i.id; }));
        var accessories = allItems.filter(function(i) {
            return i.parent_item_id && mainItemIds.has(i.parent_item_id) && (i.category_name === '부속품' || i.item_type === 'GOODS');
        });

        var esc = window.escapeHtml || function(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

        // 마감(봉제) 방식 추출
        function getSewingInfo(item) {
            var fin = item.finishing;
            if (!fin) return { method: '', detail: '' };
            var f = fin;
            if (typeof fin === 'string') { try { f = JSON.parse(fin); } catch(e) { return { method: '', detail: '' }; } }
            // 봉제방법 요약 — 표기 정본 MES_FIN (예: `4방쌍침` · `좌우 쌍침+상하 오바`)
            return { method: window.MES_FIN ? window.MES_FIN.finishing(f) : '', detail: f };
        }

        // PP에서 하도매/부직포/수술 추출
        function getTransferPP(item) {
            var result = { grommet: '', nonwoven: '', tassel: '' };
            if (!item.post_processing) return result;
            try {
                var ppArr = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing;
                if (!Array.isArray(ppArr)) return result;
                ppArr.forEach(function(pp) {
                    var p = pp.params || {};
                    if (pp.code === 'PP-GROMMET') result.grommet = (p.size || '') + (p.holes || '');
                    else if (pp.code === 'PP-NONWOVEN') result.nonwoven = (p.type || '') + (p.size ? ' ' + p.size + 'cm' : '');
                    else if (pp.code === 'PP-TASSEL') result.tassel = (p.color === '없음' ? '' : p.color || '');
                });
            } catch(e) {}
            return result;
        }

        // 총 수량 계산
        var totalQty = sewItems.reduce(function(sum, i) { return sum + (i.quantity || 1); }, 0);
        var deliveryDate = order.delivery_date || '-';
        var deliveryDay = '';
        try {
            var d = new Date(deliveryDate + 'T00:00:00');
            var days = ['일','월','화','수','목','금','토'];
            deliveryDay = days[d.getDay()];
        } catch(e) {}

        // 규격 (첫 번째 품목 기준)
        var firstItem = sewItems[0] || {};
        var specW = Math.round(firstItem.width || 0);
        var specH = Math.round(firstItem.height || 0);

        // 원단 (카드의 품목에서 추출)
        var fabricName = '';
        if (firstItem.print_media_name) fabricName = firstItem.print_media_name;
        else if (firstItem.media_name) fabricName = firstItem.media_name;

        var sewInfo = getSewingInfo(firstItem);
        var tfPP = getTransferPP(firstItem);

        // ── HTML 생성 (봉제실 작업지시서 양식) ──
        var win = window.open('', '_blank', 'width=650,height=900');
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>봉제 작업지시서 - ' + esc(card.card_number || '') + '</title>'
            + '<style>'
            + 'body { font-family: "Malgun Gothic", sans-serif; padding: 15px; font-size: 13px; color: #111; margin: 0; }'
            + '.title { text-align: center; font-size: 22px; font-weight: 900; letter-spacing: 8px; margin-bottom: 8px; }'
            + '.title::before, .title::after { content: "●"; margin: 0 8px; }'
            + '.header-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; }'
            + '.design-area { border: 2px solid #333; border-radius: 4px; padding: 16px; min-height: 200px; display: flex; align-items: center; justify-content: center; gap: 20px; flex-wrap: wrap; margin-bottom: 8px; }'
            + '.design-item { text-align: center; }'
            + '.design-item img { max-width: 180px; max-height: 180px; object-fit: contain; border: 1px solid #e5e7eb; }'
            + '.design-item .qty { font-size: 18px; font-weight: 700; color: #dc2626; margin-top: 4px; }'
            + '.design-item .spec { font-size: 12px; color: #6b7280; }'
            + '.fabric-spec { display: flex; justify-content: space-between; align-items: baseline; margin: 8px 0; }'
            + '.fabric-name { font-size: 20px; font-weight: 700; color: #1d4ed8; }'
            + '.spec-size { font-size: 24px; font-weight: 900; text-align: right; }'
            + '.spec-price { font-size: 11px; color: #6b7280; }'
            + '.info-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }'
            + '.info-table td { border: 1px solid #333; padding: 4px 8px; font-size: 12px; vertical-align: middle; }'
            + '.info-table .label { background: #f3f4f6; font-weight: 700; width: 70px; text-align: center; }'
            + '.info-table .label2 { background: #f3f4f6; font-weight: 700; width: 60px; text-align: center; }'
            + '.accessories { color: #dc2626; font-weight: 700; font-size: 14px; text-align: center; border: 2px solid #dc2626; border-radius: 6px; padding: 6px; margin: 8px 0; }'
            + '.shipping-section { border: 1px solid #333; margin-top: 4px; }'
            + '.shipping-section td { border: 1px solid #333; padding: 3px 8px; font-size: 11px; }'
            + '.shipping-title { text-align: center; font-weight: 700; font-size: 12px; letter-spacing: 6px; background: #f3f4f6; padding: 4px; border-bottom: 1px solid #333; }'
            + '.notes-row { font-size: 14px; color: #dc2626; font-weight: 700; padding: 6px 8px; }'
            + '@media print { body { padding: 8px; } @page { size: A4; margin: 8mm; } }'
            + '</style></head><body>';

        // 타이틀
        html += '<div class="title">작 업 지 시 서</div>';

        // 헤더 (출고날짜 + 작업수량)
        var dateStr = deliveryDate;
        try {
            var dp = deliveryDate.split('-');
            dateStr = parseInt(dp[1]) + '월 ' + parseInt(dp[2]) + '일(' + deliveryDay + ')';
        } catch(e) {}
        html += '<div class="header-row">';
        html += '<span>출고날짜 : <b>' + esc(dateStr) + '</b></span>';
        html += '<span>작업수량 : <b>' + totalQty + (sewItems.length > 1 ? '장' : (firstItem.unit || 'EA')) + '</b></span>';
        html += '</div>';

        // 디자인 영역
        html += '<div class="design-area">';
        // 단품 카드에서만 카드 썸네일 폴백 — 예전엔 전 품목에 card.thumbnail_url 를 그대로 써서
        // 다품목 봉제작지가 같은 그림만 반복 인쇄됐다.
        var sewFallback = (sewItems.length === 1 && card.thumbnail_url && card.thumbnail_url.length > 10) ? card.thumbnail_url : '';
        sewItems.forEach(function(item) {
            var thumb = item.thumbnail_url || sewFallback;
            html += '<div class="design-item">';
            if (thumb) {
                html += '<img src="' + thumb + '">';
            } else {
                html += '<div style="width:150px;height:150px;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;color:#d1d5db;font-size:40px">&#128444;</div>';
            }
            if (item.width && item.height) {
                html += '<div class="spec">' + Math.round(item.width) + '×' + Math.round(item.height) + '</div>';
            }
            html += '<div class="qty">' + (item.quantity || 1) + (sewItems.length > 1 ? '장' : '') + '</div>';
            html += '</div>';
        });
        html += '</div>';

        // 원단 + 규격
        html += '<div class="fabric-spec">';
        html += '<span class="fabric-name">' + esc(fabricName || '-') + '</span>';
        html += '<span class="spec-size">' + (specW && specH ? specW + '*' + specH : '-') + '</span>';
        html += '</div>';

        // 부속품 (있으면)
        if (accessories.length > 0) {
            var accHtml = accessories.map(function(a) {
                return esc(a.item_name || '') + '—' + (a.quantity || 0) + '개';
            }).join(', ');
            html += '<div class="accessories">' + accHtml + ' 동봉</div>';
        }

        // 봉제 정보 테이블
        html += '<table class="info-table">';
        html += '<tr><td class="label">봉제방법</td><td>① ' + esc(sewInfo.method || '-') + '</td>';
        html += '<td class="label2">하도매</td><td>① ' + esc(tfPP.grommet || '-') + '</td></tr>';
        html += '<tr><td class="label">부직포</td><td>① ' + esc(tfPP.nonwoven || '-') + '</td>';
        html += '<td class="label2" colspan="2">' + (tfPP.tassel ? '수술: ' + esc(tfPP.tassel) : '') + '</td></tr>';
        html += '</table>';

        // 출고처
        html += '<table class="info-table">';
        html += '<tr><td class="label">출 고 처</td><td><b>' + esc(order.client_name || '-') + '</b></td>';
        html += '<td class="label2">연 락 처</td><td>' + esc(order.contact_mobile || order.contact_phone || '-') + '</td></tr>';
        html += '</table>';

        // 배송관련사항
        html += '<div class="shipping-section">';
        html += '<div class="shipping-title">배 송 관 련 사 항</div>';
        html += '<table style="width:100%;border-collapse:collapse">';
        html += '<tr><td style="border:1px solid #333;padding:3px 8px;width:70px;font-size:11px;background:#f3f4f6;font-weight:700">보내는사람</td><td style="border:1px solid #333;padding:3px 8px;font-size:11px"></td></tr>';
        html += '<tr><td style="border:1px solid #333;padding:3px 8px;font-size:11px;background:#f3f4f6;font-weight:700">받는사람</td><td style="border:1px solid #333;padding:3px 8px;font-size:11px;color:#dc2626">' + esc(order.delivery_info || '') + '</td></tr>';
        html += '<tr><td style="border:1px solid #333;padding:3px 8px;font-size:11px;background:#f3f4f6;font-weight:700">배송방법</td><td style="border:1px solid #333;padding:3px 8px;font-size:11px">';
        html += '화물 &nbsp; 지점 (선불, 착불) &nbsp;&nbsp;&nbsp; 택배 ( ' + esc(order.shipping_payment === 'PREPAID' ? '선불' : order.shipping_payment === 'COD' ? '착불' : '선불, 착불') + ' )';
        html += '</td></tr>';
        html += '</table>';
        html += '</div>';

        // 비고
        html += '<table class="info-table" style="margin-top:4px">';
        html += '<tr><td class="label">비 고</td><td class="notes-row">' + esc(order.internal_notes || card.notes || '') + '</td></tr>';
        html += '</table>';

        html += '<script>window.onload = function() { window.print(); }<\/script>';
        html += '</body></html>';
        win.document.write(html);
        win.document.close();
    } catch(e) {
        showToast('봉제 작업지시서 생성 실패: ' + (e.message || e), 'error');
    }
}

