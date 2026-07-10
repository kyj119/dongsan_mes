// ===== RIP 전송 모달 =====
var _ripEquipmentList = null; // 캐시

async function loadRipEquipment() {
    if (_ripEquipmentList) return _ripEquipmentList;
    try {
        var res = await axios.get('/api/rip/equipment');
        _ripEquipmentList = res.data.data || [];
        return _ripEquipmentList;
    } catch(e) {
        showToast('장비 목록 로드 실패', 'error');
        return [];
    }
}

async function showRipSendModal(cardId) {
    // 로딩 토스트
    showToast('장비 정보 로딩중...', 'info');

    // 1. 장비 목록 + 카드 아이템 동시 로드
    var equipmentList, items;
    try {
        var [eqList, itemsRes] = await Promise.all([
            loadRipEquipment(),
            axios.get('/api/rip/card-items/' + cardId)
        ]);
        equipmentList = eqList || [];
        items = (itemsRes.data && itemsRes.data.data) || [];
    } catch(e) {
        showToast('데이터 로드 실패: ' + (e.message || '알 수 없는 오류'), 'error');
        return;
    }

    if (items.length === 0) {
        showToast('전송할 아이템이 없습니다', 'warning');
        return;
    }

    var unsent = items.filter(function(it) { return !it.rip_status; });
    if (unsent.length === 0) {
        showToast('모든 아이템이 이미 전송되었습니다', 'info');
        return;
    }

    // 2. 모달 HTML
    var overlay = document.createElement('div');
    overlay.id = 'ripSendOverlay';
    overlay.className = 'card-panel-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeRipSendModal(); };

    var html = '<div class="card-panel" id="ripSendPanel" style="width:520px">';

    // 헤더
    html += '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">';
    html += '<div style="display:flex;align-items:center;gap:8px"><i class="fas fa-satellite-dish" style="color:#2563eb"></i><span style="font-size:16px;font-weight:600;color:#111827">RIP 전송</span></div>';
    html += '<button onclick="closeRipSendModal()" style="background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;font-size:18px">&times;</button>';
    html += '</div>';

    // 본문
    html += '<div style="padding:20px;overflow-y:auto;max-height:calc(100vh - 140px)">';

    // 장비 상태 요약
    html += '<div style="margin-bottom:16px;padding:10px 14px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">';
    html += '<div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px">장비 상태</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    equipmentList.forEach(function(eq) {
        var isOnline = eq.agent_status === 'ONLINE';
        var dotColor = isOnline ? '#16a34a' : '#d1d5db';
        var textColor = isOnline ? '#111827' : '#9ca3af';
        html += '<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:' + textColor + '">';
        html += '<span style="width:6px;height:6px;border-radius:50%;background:' + dotColor + ';display:inline-block"></span>';
        html += escapeHtml(eq.name);
        html += '</span>';
    });
    html += '</div></div>';

    // 아이템 목록
    items.forEach(function(item, idx) {
        var isSent = item.rip_status === 'QUEUED' || item.rip_status === 'SENT';
        var borderColor = isSent ? '#d1d5db' : '#e5e7eb';
        var bgColor = isSent ? '#f9fafb' : '#fff';

        html += '<div class="rip-item-row" data-idx="' + idx + '" style="margin-bottom:12px;padding:14px;border:1px solid ' + borderColor + ';border-radius:8px;background:' + bgColor + '">';

        // 아이템 정보 헤더
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<div style="font-size:13px;font-weight:600;color:#111827">' + escapeHtml(item.item_name) + '</div>';
        if (isSent) {
            var badgeBg = item.rip_status === 'QUEUED' ? '#dbeafe' : '#d1fae5';
            var badgeColor = item.rip_status === 'QUEUED' ? '#1d4ed8' : '#15803d';
            var badgeText = item.rip_status === 'QUEUED' ? 'RIP 대기중' : 'RIP 전송됨';
            html += '<span style="font-size:11px;padding:2px 8px;border-radius:9999px;background:' + badgeBg + ';color:' + badgeColor + '">' + badgeText + '</span>';
        }
        html += '</div>';

        // 규격 정보
        var w = item.width || 0;
        var h = item.height || 0;
        var sf = item.scale_factor || 1;
        var displayW = (w * sf).toFixed(0);
        var displayH = (h * sf).toFixed(0);
        html += '<div style="font-size:12px;color:#6b7280;margin-bottom:10px">';
        html += displayW + '×' + displayH + 'cm · ' + (item.quantity || 1) + '매';
        if (item.content) html += ' · ' + escapeHtml(item.content);
        html += '</div>';

        if (!isSent) {
            // 장비 선택
            html += '<div style="display:flex;gap:8px;margin-bottom:8px">';
            html += '<div style="flex:1">';
            html += '<label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">장비</label>';
            html += '<select id="ripEq_' + idx + '" onchange="onRipEquipmentChange(' + idx + ')" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff">';
            html += '<option value="">선택</option>';
            equipmentList.forEach(function(eq) {
                var disabled = eq.agent_status !== 'ONLINE' ? ' disabled' : '';
                var suffix = eq.agent_status !== 'ONLINE' ? ' (OFFLINE)' : '';
                html += '<option value="' + eq.id + '"' + disabled + '>' + escapeHtml(eq.name) + suffix + '</option>';
            });
            html += '</select></div>';

            // 프리셋 선택
            html += '<div style="flex:1">';
            html += '<label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">프리셋</label>';
            html += '<select id="ripPreset_' + idx + '" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff" disabled>';
            html += '<option value="">장비를 먼저 선택</option>';
            html += '</select></div>';
            html += '</div>';

            // 개별 전송 버튼
            html += '<button id="ripSendBtn_' + idx + '" onclick="sendRipItem(' + item.card_item_id + ',' + idx + ')" ';
            html += 'style="width:100%;padding:7px;font-size:12px;font-weight:600;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>';
            html += '<i class="fas fa-satellite-dish" style="margin-right:4px"></i>전송</button>';
        }

        html += '</div>';
    });

    // 일괄 전송 섹션
    var unsent = items.filter(function(it) { return !it.rip_status; });
    if (unsent.length > 1) {
        html += '<div style="margin-top:16px;padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#f0f7ff">';
        html += '<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:10px"><i class="fas fa-layer-group" style="margin-right:6px;color:#2563eb"></i>일괄 전송</div>';

        html += '<div style="display:flex;gap:8px;margin-bottom:10px">';
        html += '<div style="flex:1">';
        html += '<label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">장비</label>';
        html += '<select id="ripBulkEq" onchange="onRipBulkEquipmentChange()" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff">';
        html += '<option value="">선택</option>';
        equipmentList.forEach(function(eq) {
            var disabled = eq.agent_status !== 'ONLINE' ? ' disabled' : '';
            var suffix = eq.agent_status !== 'ONLINE' ? ' (OFFLINE)' : '';
            html += '<option value="' + eq.id + '"' + disabled + '>' + escapeHtml(eq.name) + suffix + '</option>';
        });
        html += '</select></div>';

        html += '<div style="flex:1">';
        html += '<label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">프리셋</label>';
        html += '<select id="ripBulkPreset" style="width:100%;padding:6px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff" disabled>';
        html += '<option value="">장비를 먼저 선택</option>';
        html += '</select></div>';
        html += '</div>';

        html += '<button id="ripBulkSendBtn" onclick="sendRipBulk(' + cardId + ')" ';
        html += 'style="width:100%;padding:8px;font-size:13px;font-weight:600;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>';
        html += '<i class="fas fa-satellite-dish" style="margin-right:4px"></i>미전송 ' + unsent.length + '건 일괄 전송</button>';
        html += '</div>';
    }

    html += '</div>'; // 본문 끝
    html += '</div>'; // 패널 끝

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // 저장: 아이템 데이터 참조
    window._ripItems = items;
    window._ripEquipmentList = equipmentList;
    window._ripCardId = cardId;

    // ESC 모달 닫기는 layout.ts 글로벌 핸들러가 처리

    // 슬라이드 인 애니메이션
    requestAnimationFrame(function() {
        var panel = document.getElementById('ripSendPanel');
        if (panel) panel.classList.add('card-panel-open');
    });
}

function closeRipSendModal() {
    var panel = document.getElementById('ripSendPanel');
    if (panel) {
        panel.classList.remove('card-panel-open');
        setTimeout(function() {
            var overlay = document.getElementById('ripSendOverlay');
            if (overlay) overlay.remove();
        }, 250);
    } else {
        var overlay = document.getElementById('ripSendOverlay');
        if (overlay) overlay.remove();
    }
    // 전역 변수 정리
    window._ripItems = null;
    window._ripEquipmentList = null;
    window._ripCardId = null;
    // ESC 모달 닫기는 layout.ts 글로벌 핸들러가 처리
}

function _ripEscHandler(e) {
    if (e.key === 'Escape' && document.getElementById('ripSendOverlay')) {
        closeRipSendModal();
    }
}

function onRipEquipmentChange(idx) {
    var eqEl = document.getElementById('ripEq_' + idx);
    var presetSelect = document.getElementById('ripPreset_' + idx);
    var sendBtn = document.getElementById('ripSendBtn_' + idx);
    if (!eqEl || !presetSelect || !sendBtn) return;
    var eqId = eqEl.value;

    presetSelect.innerHTML = '';
    sendBtn.disabled = true;

    if (!eqId) {
        presetSelect.innerHTML = '<option value="">장비를 먼저 선택</option>';
        presetSelect.disabled = true;
        return;
    }

    var eq = (window._ripEquipmentList || []).find(function(e) { return e.id === eqId; });
    var presets = (eq && eq.presets) ? eq.presets : [];

    if (presets.length === 0) {
        presetSelect.innerHTML = '<option value="">프리셋 없음</option>';
        presetSelect.disabled = true;
        return;
    }

    presetSelect.disabled = false;
    presets.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.preset_name;
        opt.textContent = p.preset_name + (p.is_default ? ' (기본)' : '');
        presetSelect.appendChild(opt);
    });

    // 기본 프리셋 자동 선택
    var defaultPreset = presets.find(function(p) { return p.is_default; });
    if (defaultPreset) presetSelect.value = defaultPreset.preset_name;

    sendBtn.disabled = false;
}

function onRipBulkEquipmentChange() {
    var eqId = document.getElementById('ripBulkEq').value;
    var presetSelect = document.getElementById('ripBulkPreset');
    var sendBtn = document.getElementById('ripBulkSendBtn');

    presetSelect.innerHTML = '';
    sendBtn.disabled = true;

    if (!eqId) {
        presetSelect.innerHTML = '<option value="">장비를 먼저 선택</option>';
        presetSelect.disabled = true;
        return;
    }

    var eq = (window._ripEquipmentList || []).find(function(e) { return e.id === eqId; });
    var presets = (eq && eq.presets) ? eq.presets : [];

    if (presets.length === 0) {
        presetSelect.innerHTML = '<option value="">프리셋 없음</option>';
        presetSelect.disabled = true;
        return;
    }

    presetSelect.disabled = false;
    presets.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.preset_name;
        opt.textContent = p.preset_name + (p.is_default ? ' (기본)' : '');
        presetSelect.appendChild(opt);
    });

    var defaultPreset = presets.find(function(p) { return p.is_default; });
    if (defaultPreset) presetSelect.value = defaultPreset.preset_name;

    sendBtn.disabled = false;
}

async function sendRipItem(cardItemId, idx) {
    var eqEl = document.getElementById('ripEq_' + idx);
    var presetEl = document.getElementById('ripPreset_' + idx);
    var btn = document.getElementById('ripSendBtn_' + idx);
    if (!eqEl || !presetEl || !btn) return;

    var eqId = eqEl.value;
    var preset = presetEl.value;

    if (!eqId || !preset) {
        showToast('장비와 프리셋을 선택해주세요', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i>전송중...';

    try {
        await axios.post('/api/rip/send-item/' + cardItemId, {
            equipment_id: eqId,
            rip_preset: preset
        });
        showToast('RIP 전송 완료', 'success');

        // 해당 아이템 행을 전송됨 상태로 업데이트
        var row = document.querySelector('.rip-item-row[data-idx="' + idx + '"]');
        if (row) {
            row.style.background = '#f9fafb';
            row.style.borderColor = '#d1d5db';
            // 선택/버튼 영역 교체
            var itemName = (window._ripItems[idx] || {}).item_name || '';
            row.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<div style="font-size:13px;font-weight:600;color:#111827">' + escapeHtml(itemName) + '</div>' +
                '<span style="font-size:11px;padding:2px 8px;border-radius:9999px;background:#dbeafe;color:#1d4ed8">RIP 대기중</span>' +
                '</div>';
        }

        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showToast('전송 실패: ' + msg, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-satellite-dish" style="margin-right:4px"></i>전송';
    }
}

async function sendRipBulk(cardId) {
    var eqEl = document.getElementById('ripBulkEq');
    var presetEl = document.getElementById('ripBulkPreset');
    var btn = document.getElementById('ripBulkSendBtn');
    if (!eqEl || !presetEl || !btn) return;

    var eqId = eqEl.value;
    var preset = presetEl.value;

    if (!eqId || !preset) {
        showToast('장비와 프리셋을 선택해주세요', 'warning');
        return;
    }

    var unsent = (window._ripItems || []).filter(function(it) { return !it.rip_status; });
    if (unsent.length === 0) {
        showToast('전송할 아이템이 없습니다', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i>전송중...';

    try {
        var payload = {
            items: unsent.map(function(it) {
                return { card_item_id: it.card_item_id, equipment_id: eqId, rip_preset: preset };
            })
        };
        var res = await axios.post('/api/rip/send-items-bulk', payload);
        var data = res.data.data;
        var sentCount = (data.sent || []).length;
        var errorCount = (data.errors || []).length;

        if (sentCount > 0) showToast(sentCount + '건 RIP 전송 완료' + (errorCount > 0 ? ' (' + errorCount + '건 실패)' : ''), 'success');
        else showToast('전송 실패: ' + (data.errors[0] || {}).error, 'error');

        closeRipSendModal();
        loadKanban();
    } catch(e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
        showToast('일괄 전송 실패: ' + msg, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-satellite-dish" style="margin-right:4px"></i>일괄 전송';
    }
}

// ===== QR 스캔 =====
async function processQrScan(value) {
    if (!value || !value.trim()) return;
    var cardNumber = value.trim();
    try {
        // 카드 상태 조회 후 다음 단계로 자동 전환
        var infoRes = await axios.get('/api/cards/' + encodeURIComponent(cardNumber));
        if (!infoRes.data.success) { showToast('카드를 찾을 수 없습니다: ' + cardNumber, 'error'); return; }
        var card = infoRes.data.data;
        var status = card.status;

        if (status === 'PRINTING') {
            // PRINTING → PRINT_DONE
            await axios.patch('/api/cards/' + card.id + '/status', { status: 'PRINT_DONE' });
            showToast(cardNumber + ' 출력완료 처리됨', 'success');
        } else if (status === 'PRINT_DONE') {
            // PRINT_DONE → 출고
            var res = await axios.post('/api/cards/' + encodeURIComponent(cardNumber) + '/ship', {});
            showToast(cardNumber + ' 출고 처리 완료' + (res.data.order_shipped ? ' (주문 전체 출고)' : ''), 'success');
        } else if (status === 'HOLD') {
            // HOLD → PRINTING (재개)
            await axios.patch('/api/cards/' + card.id + '/status', { status: 'PRINTING' });
            showToast(cardNumber + ' 보류 해제 → 진행중', 'success');
        } else {
            showToast(cardNumber + ' 현재 상태: ' + window.MES_STATUS.cardLabel(status), 'info');
        }
        loadKanban();
    } catch (e) {
        var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : 'QR 처리 실패';
        showToast(msg, 'error');
    }
}

// ===== 선택/벌크 =====
function toggleCardSelection(cardId, checked) {
    if (checked) selectedCardIds.add(cardId); else selectedCardIds.delete(cardId);
    updateBulkBar();
}

function clearSelection() {
    selectedCardIds.clear();
    document.querySelectorAll('input[type=checkbox][data-id]').forEach(function(cb) { cb.checked = false; });
    document.querySelectorAll('.card-checkbox').forEach(function(cb) { cb.checked = false; });
    updateBulkBar();
    updateCardBulkBar();
}

function updateBulkBar() {
    var bar = document.getElementById('bulkBar');
    if (selectedCardIds.size > 0) bar.classList.add('visible');
    else bar.classList.remove('visible');
    document.getElementById('selectedCount').textContent = selectedCardIds.size + '장 선택됨';
}

async function bulkChangeStatus(status) {
    if (selectedCardIds.size === 0) return;
    if (status === 'HOLD') {
        openHoldModal(Array.from(selectedCardIds), true);
        return;
    }
    var reason = '일괄 변경';
    try {
        await axios.patch('/api/cards/bulk/status', { card_ids: Array.from(selectedCardIds), status: status, reason: reason });
        showToast(selectedCardIds.size + '장 ' + (statusLabels[status] || status) + ' 처리됨', 'success');
        selectedCardIds.clear();
        updateBulkBar();
        loadKanban();
    } catch (e) { showToast('일괄 변경 실패', 'error'); }
}

