// ===== 썸네일 줌 =====
function zoomThumb(src) {
    var existing = document.getElementById('zoomModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'zoomModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60]';
    modal.style.cursor = 'grab';
    var safeSrc = src.replace(/[<>"']/g, '');
    modal.innerHTML = '<img src="' + safeSrc + '" id="zoomImg" style="max-width:95vw;max-height:90vh;object-fit:contain;transform-origin:center;transition:transform 0.1s">'
        + '<div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:1">'
        + '<button onclick="event.stopPropagation();zoomChange(1)" style="background:rgba(255,255,255,0.9);border:none;border-radius:8px;width:40px;height:40px;font-size:20px;cursor:pointer">+</button>'
        + '<button onclick="event.stopPropagation();zoomChange(-1)" style="background:rgba(255,255,255,0.9);border:none;border-radius:8px;width:40px;height:40px;font-size:20px;cursor:pointer">&#8722;</button>'
        + '<button onclick="event.stopPropagation();zoomReset()" style="background:rgba(255,255,255,0.9);border:none;border-radius:8px;width:40px;height:40px;font-size:14px;cursor:pointer">1:1</button>'
        + '</div>';
    var scale = 1, posX = 0, posY = 0, dragging = false, startX = 0, startY = 0;
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.onwheel = function(e) { e.preventDefault(); zoomChange(e.deltaY < 0 ? 1 : -1); };
    window.zoomChange = function(dir) {
        scale = Math.max(0.5, Math.min(5, scale + dir * 0.3));
        var img = document.getElementById('zoomImg');
        if (img) img.style.transform = 'scale(' + scale + ') translate(' + posX + 'px,' + posY + 'px)';
    };
    window.zoomReset = function() {
        scale = 1; posX = 0; posY = 0;
        var img = document.getElementById('zoomImg');
        if (img) img.style.transform = 'scale(1)';
    };
    modal.onmousedown = function(e) {
        if (e.target.tagName === 'IMG') {
            dragging = true;
            startX = e.clientX - posX;
            startY = e.clientY - posY;
            modal.style.cursor = 'grabbing';
            e.preventDefault();
        }
    };
    modal.onmousemove = function(e) {
        if (dragging) {
            posX = e.clientX - startX;
            posY = e.clientY - startY;
            var img = document.getElementById('zoomImg');
            if (img) img.style.transform = 'scale(' + scale + ') translate(' + posX + 'px,' + posY + 'px)';
        }
    };
    modal.onmouseup = function() { dragging = false; modal.style.cursor = 'grab'; };
    document.body.appendChild(modal);
}

// ===== 모바일 탭 =====
function switchMobileTab(tab) {
    currentMobileTab = tab;
    document.querySelectorAll('.mobile-tab').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    renderMobileTab();
}

function renderMobileTab() {
    var container = document.getElementById('mobileContent');
    if (!container) return;
    var cards = [];
    var colType = 'progress';
    if (currentMobileTab === 'progress') { cards = inProgressCards; colType = 'progress'; }
    else if (currentMobileTab === 'done') { cards = printDoneCards; colType = 'done'; }
    // done 탭은 거래처별 그룹핑
    if (colType === 'done') {
        renderPrintDoneGrouped(cards, 'mobileContent');
    } else {
        var filtered = sortCards(cards);
        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 py-8 text-sm">없음</div>';
        } else {
            var html = '';
            filtered.forEach(function(card) { html += buildKanbanCard(card, colType); });
            container.innerHTML = html;
        }
    }
    document.querySelectorAll('.mobile-tab').forEach(function(btn) {
        var t = btn.getAttribute('data-tab');
        if (t === 'progress') btn.textContent = '진행중 (' + inProgressCards.length + ')';
        else if (t === 'done') btn.textContent = '출력완료 (' + printDoneCards.length + ')';
    });
}

// ===== 리사이즈: 모바일↔데스크탑 전환 시 탭 카운트 동기화 =====
window.addEventListener('resize', function() {
    if (window.innerWidth < 1024) renderMobileTab();
});

// ===== 불량 접수 =====
var DEFECT_CATEGORIES = [
  { code: 'COLOR', name: '색상불량' },
  { code: 'ALIGNMENT', name: '정렬불량' },
  { code: 'CUT', name: '재단불량' },
  { code: 'MATERIAL', name: '소재불량' },
  { code: 'PRINT', name: '출력불량' },
  { code: 'PP', name: '후가공불량' },
  { code: 'OTHER', name: '기타' }
];

function showDefectForm(cardId) {
  var existing = document.getElementById('defectModal');
  if (existing) existing.remove();

  var optionsHtml = DEFECT_CATEGORIES.map(function(dc) {
    return '<option value="' + dc.code + '">' + dc.name + '</option>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'defectModal';
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  modal.innerHTML = '<div class="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onclick="event.stopPropagation()">'
    + '<h3 class="text-lg font-bold mb-4"><i class="fas fa-exclamation-triangle text-amber-500 mr-2"></i>불량 접수</h3>'
    + '<div class="space-y-3">'
    + '  <div><label class="block text-sm font-medium text-gray-700 mb-1">불량 유형 *</label>'
    + '    <select id="defectCategory" class="w-full px-3 py-2 border rounded-lg">' + optionsHtml + '</select></div>'
    + '  <div><label class="block text-sm font-medium text-gray-700 mb-1">심각도</label>'
    + '    <select id="defectSeverity" class="w-full px-3 py-2 border rounded-lg">'
    + '      <option value="LOW">경미</option><option value="MEDIUM" selected>보통</option><option value="HIGH">심각</option></select></div>'
    + '  <div><label class="block text-sm font-medium text-gray-700 mb-1">상세 설명 *</label>'
    + '    <textarea id="defectDesc" class="w-full px-3 py-2 border rounded-lg" rows="3" placeholder="불량 내용을 입력하세요"></textarea></div>'
    + '  <div class="flex items-center gap-2">'
    + '    <input type="checkbox" id="defectAutoHold" checked class="w-4 h-4">'
    + '    <label for="defectAutoHold" class="text-sm text-gray-600">카드를 보류(HOLD) 상태로 전환</label></div>'
    + '  <div class="flex gap-2 mt-4">'
    + '    <button onclick="submitDefect(' + cardId + ')" class="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium">접수</button>'
    + '    <button onclick="document.getElementById(\'defectModal\').remove()" class="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">취소</button>'
    + '  </div>'
    + '</div></div>';
  document.body.appendChild(modal);
  document.getElementById('defectDesc').focus();
}

async function submitDefect(cardId) {
  var catEl = document.getElementById('defectCategory');
  var sevEl = document.getElementById('defectSeverity');
  var descEl = document.getElementById('defectDesc');
  var holdEl = document.getElementById('defectAutoHold');
  if (!catEl || !sevEl || !descEl || !holdEl) return;
  var category = catEl.value;
  var severity = sevEl.value;
  var desc = descEl.value.trim();
  var autoHold = holdEl.checked;

  if (!desc) { showToast('설명을 입력하세요', 'warning'); return; }

  try {
    var res = await axios.post('/api/cards/' + cardId + '/defects', {
      defect_category: category,
      description: desc,
      severity: severity,
      auto_hold: autoHold
    });
    if (res.data.success) {
      showToast('불량이 접수되었습니다', 'success');
      document.getElementById('defectModal').remove();
      loadKanban();
    } else {
      showToast(res.data.error || '접수 실패', 'error');
    }
  } catch (err) {
    showToast(err.response?.data?.error || '접수 실패', 'error');
  }
}

// ===== 키보드 단축키 =====
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    switch(e.key) {
        case 'r': case 'R':
            if (!e.ctrlKey && !e.metaKey) { loadKanban(); showToast('새로고침', 'info'); }
            break;
        case 'Escape':
            // 모달 닫기는 layout.ts 글로벌 핸들러가 처리
            // 모달이 없을 때만 선택 해제
            var hasModal = document.querySelectorAll('.fixed.inset-0:not(.hidden)').length > 0;
            if (!hasModal && selectedCardIds.size > 0) clearSelection();
            break;
        case 'a':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                inProgressCards.forEach(function(c) { selectedCardIds.add(c.id); });
                updateBulkBar();
            }
            break;
        case '?':
            var helpModal = document.createElement('div');
            helpModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            helpModal.onclick = function(ev) { if (ev.target === helpModal) helpModal.remove(); };
            helpModal.innerHTML = '<div class="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">'
                + '<h3 class="text-lg font-bold mb-4"><i class="fas fa-keyboard mr-2"></i>키보드 단축키</h3>'
                + '<div class="space-y-2 text-sm">'
                + '<div class="flex justify-between"><span class="text-gray-600">새로고침</span><kbd class="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">R</kbd></div>'
                + '<div class="flex justify-between"><span class="text-gray-600">전체 선택</span><kbd class="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl+A</kbd></div>'
                + '<div class="flex justify-between"><span class="text-gray-600">모달/선택 해제</span><kbd class="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">Esc</kbd></div>'
                + '<div class="flex justify-between"><span class="text-gray-600">이 도움말</span><kbd class="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">?</kbd></div>'
                + '</div>'
                + '<div class="mt-4 flex justify-end"><button onclick="this.closest(\'.fixed\').remove()" class="px-4 py-2 bg-gray-600 text-white rounded text-sm">닫기</button></div>'
                + '</div>';
            document.body.appendChild(helpModal);
            break;
    }
});

// ===== 카드 일괄 선택 (인라인 bulk bar용) =====
function toggleCardSelect(el) {
    var cardId = parseInt(el.dataset.cardId);
    if (el.checked) selectedCardIds.add(cardId);
    else selectedCardIds.delete(cardId);
    updateBulkBar();
    updateCardBulkBar();
}

function updateCardBulkBar() {
    var bar = document.getElementById('cardBulkBar');
    var spacer = document.getElementById('cardBulkSpacer');
    var countEl = document.getElementById('cardBulkCount');
    if (!bar) return;
    if (selectedCardIds.size > 0) {
        bar.classList.add('visible');
        if (spacer) spacer.classList.add('visible');
        if (countEl) countEl.textContent = selectedCardIds.size;
    } else {
        bar.classList.remove('visible');
        if (spacer) spacer.classList.remove('visible');
    }
}

function clearCardSelection() {
    selectedCardIds.clear();
    document.querySelectorAll('.card-checkbox').forEach(function(cb) { cb.checked = false; });
    updateBulkBar();
    updateCardBulkBar();
}

async function cardBulkChangeStatus() {
    var bulkEl = document.getElementById('cardBulkStatus');
    if (!bulkEl) return;
    var newStatus = bulkEl.value;
    if (!newStatus) { showFieldError('cardBulkStatus', '변경할 상태를 선택하세요.'); return; }
    if (selectedCardIds.size === 0) return;
    if (newStatus === 'HOLD') {
        openHoldModal(Array.from(selectedCardIds), true);
        return;
    }
    if (!(await showConfirm(selectedCardIds.size + '건의 카드를 ' + (statusLabels[newStatus] || newStatus) + '(으)로 변경하시겠습니까?'))) return;
    try {
        await axios.patch('/api/cards/bulk/status', {
            card_ids: Array.from(selectedCardIds),
            status: newStatus,
            reason: '일괄 변경'
        });
        showToast(selectedCardIds.size + '건 ' + (statusLabels[newStatus] || newStatus) + ' 처리됨', 'success');
        selectedCardIds.clear();
        updateBulkBar();
        updateCardBulkBar();
        loadKanban();
    } catch (e) {
        showToast('일괄 변경 실패', 'error');
    }
}

// ===== 초기화 =====
(function initKanban() {
    var statusEl = document.getElementById('kanbanStatus');

    if (typeof axios === 'undefined') {
        if (statusEl) {
            statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-red-50 text-red-700';
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> axios 라이브러리 미로드. 페이지를 새로고침하세요.';
        }
        return;
    }

    var requiredIds = ['listInProgress', 'listPrintDone'];
    var missing = [];
    for (var j = 0; j < requiredIds.length; j++) {
        if (!document.getElementById(requiredIds[j])) missing.push(requiredIds[j]);
    }
    if (missing.length > 0) {
        if (statusEl) {
            statusEl.className = 'mb-2 p-2 rounded-lg text-sm text-center bg-red-50 text-red-700';
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> DOM 요소 누락: ' + missing.join(', ') + '. 페이지를 새로고침하세요.';
        }
        return;
    }

    restoreKanbanFilters();
    loadKanban();
    setInterval(function() { loadKanban(); }, 30000);
    setInterval(function() { renderTodayShip(); }, 60000);
})();

// ===== 드래그앤드롭 =====
var _dragCardId = null;
var _dragFromColumn = null;

var _dndZonesInitialized = false;
function initDragAndDrop() {
    // 드롭 존 이벤트는 최초 1회만 등록 (innerHTML 교체와 무관한 컨테이너)
    if (!_dndZonesInitialized) {
        _dndZonesInitialized = true;
        var dropZones = [
            { el: document.getElementById('listInProgress'), target: 'PRINTING' },
            { el: document.getElementById('listPrintDone'), target: 'PRINT_DONE' },
            { el: document.getElementById('holdSection'), target: 'HOLD' }
        ];

        dropZones.forEach(function(zone) {
            if (!zone.el) return;
            zone.el.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                zone.el.classList.add('dnd-over');
            });
            zone.el.addEventListener('dragleave', function(e) {
                if (zone.el.contains(e.relatedTarget)) return;
                zone.el.classList.remove('dnd-over');
            });
            zone.el.addEventListener('drop', function(e) {
                e.preventDefault();
                zone.el.classList.remove('dnd-over');
                var cardId = parseInt(e.dataTransfer.getData('text/plain'));
                if (!cardId || isNaN(cardId)) return;
                handleDrop(cardId, zone.target);
            });
        });
    }

    // 각 카드에 dragstart 이벤트
    document.querySelectorAll('.kanban-card[draggable="true"]').forEach(function(card) {
        card.addEventListener('dragstart', function(e) {
            _dragCardId = parseInt(card.getAttribute('data-card-id'));
            _dragFromColumn = card.getAttribute('data-card-status');
            e.dataTransfer.setData('text/plain', String(_dragCardId));
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(function() { card.classList.add('dnd-dragging'); }, 0);
            // 드래그 시작 시 보류 섹션 표시 (드롭 타겟으로)
            var holdSec = document.getElementById('holdSection');
            if (holdSec) holdSec.style.display = '';
        });
        card.addEventListener('dragend', function() {
            card.classList.remove('dnd-dragging');
            document.querySelectorAll('.dnd-over').forEach(function(el) { el.classList.remove('dnd-over'); });
            _dragCardId = null;
            _dragFromColumn = null;
            // 보류 카드 없으면 보류 섹션 다시 숨기기
            if (holdCards.length === 0) {
                var holdSec = document.getElementById('holdSection');
                if (holdSec) holdSec.style.display = 'none';
            }
        });
    });
}

function handleDrop(cardId, targetStatus) {
    // 같은 상태로 드롭하면 무시
    if (_dragFromColumn === targetStatus) return;
    // HOLD는 보류 모달 필요
    if (targetStatus === 'HOLD') {
        quickHold(cardId);
        return;
    }
    // PRINT_DONE은 item 전체 체크 + 카드 상태 전환을 원자 처리
    if (targetStatus === 'PRINT_DONE') {
        completeCard(cardId);
        return;
    }
    quickStatus(cardId, targetStatus);
}
