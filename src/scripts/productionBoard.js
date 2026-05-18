/* ── 생산 현황 보드 ─────────────────────────────────────────────────────────── */
var boardData = [];
var currentFilter = 'PRINT_PENDING';
var currentOffset = 0;
var pageSize = 20;
var hasMore = false;
var refreshTimer = null;
var refreshInterval = 30;
var countdown = refreshInterval;
var refreshCount = 0;
var lbCloseTimer = null;

// ── 초기화 ────────────────────────────────────────────────────────────────────
(function init() {
  loadBoard();
  var sortEl = document.getElementById('sortSelect');
  if (sortEl) sortEl.addEventListener('change', function () { loadBoard(); });
  startAutoRefresh();
})();

// ── 데이터 로드 ───────────────────────────────────────────────────────────────
async function loadBoard(append) {
  try {
    var sort = document.getElementById('sortSelect').value;
    var offset = append ? currentOffset + pageSize : 0;
    var params = '?sort=' + sort + '&limit=' + (pageSize + 1) + '&offset=' + offset;
    if (currentFilter) params += '&status=' + currentFilter;

    var res = await axios.get('/api/cards/board' + params);
    if (!res.data.success) return;

    var newCards = res.data.data;
    hasMore = res.data.hasMore;

    if (append) {
      boardData = boardData.concat(newCards);
      currentOffset = offset;
    } else {
      boardData = newCards;
      currentOffset = 0;
    }

    renderStatusTabs(res.data.summary);
    renderGrid(boardData);
    countdown = refreshInterval;
  } catch (e) {
    console.error('Board load error:', e);
  }
}

// ── Summary만 갱신 (경량 새로고침) ────────────────────────────────────────────
async function refreshSummary() {
  try {
    var params = '?summary_only=1';
    var res = await axios.get('/api/cards/board' + params);
    if (res.data.success) renderStatusTabs(res.data.summary);
  } catch (e) { /* silent */ }
}

// ── 상태 탭 렌더 ──────────────────────────────────────────────────────────────
function renderStatusTabs(summary) {
  var tabs = [
    { key: '',              label: '전체',     count: summary.total },
    { key: 'PRINT_PENDING', label: '출력 전',  count: summary.pending },
    { key: 'PRINTING',      label: '출력중',   count: summary.printing },
    { key: 'PRINT_DONE',    label: '출력완료', count: summary.done },
    { key: 'SHIPPED',       label: '출고완료', count: summary.shipped },
    { key: 'HOLD',          label: 'HOLD',     count: summary.hold }
  ];

  var html = '';
  for (var i = 0; i < tabs.length; i++) {
    var t = tabs[i];
    var active = currentFilter === t.key ? ' active' : '';
    html += '<button class="status-tab' + active + '" onclick="filterByStatus(\'' + t.key + '\')">';
    html += t.label + '<span class="badge">' + (t.count || 0) + '</span></button>';
  }
  document.getElementById('statusTabs').innerHTML = html;
}

// ── 필터 ──────────────────────────────────────────────────────────────────────
function filterByStatus(status) {
  currentFilter = status;
  loadBoard();
}

// ── 그리드 렌더 ───────────────────────────────────────────────────────────────
function renderGrid(cards) {
  var grid = document.getElementById('boardGrid');
  if (!cards || cards.length === 0) {
    grid.innerHTML = '<div class="board-empty"><i class="fas fa-inbox"></i><p>표시할 카드가 없습니다</p></div>';
    removeLoadMore();
    return;
  }

  var html = '';
  for (var i = 0; i < cards.length; i++) {
    html += renderTile(cards[i]);
  }
  grid.innerHTML = html;
  initThumbObserver();
  renderLoadMore();
}

function renderTile(card) {
  var dday = calcDday(card.delivery_date);
  var statusClass = 'status-' + card.status;
  if (card.shipped_at) statusClass = 'status-SHIPPED';
  var progress = card.print_progress || { done: 0, total: 1 };
  var pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  var thumbHtml = '';
  if (card.has_thumbnail) {
    thumbHtml = '<div class="tile-thumb" data-card-id="' + card.id + '"><span class="thumb-loading"><i class="fas fa-spinner fa-spin"></i></span></div>';
  } else {
    thumbHtml = '<div class="tile-thumb"><i class="fas fa-image"></i></div>';
  }

  var statusBadge = getStatusBadge(card.status, card.shipped_at);

  var sizeText = '';
  if (card.width && card.height) {
    sizeText = card.width + 'x' + card.height;
  }

  // 수량 표시
  var qtyText = '';
  if (card.total_quantity) {
    qtyText = card.total_quantity + (card.unit || 'EA');
  }

  // 메타 라인: 사이즈 · 수량 · 품목수
  var metaParts = [];
  if (sizeText) metaParts.push(sizeText);
  if (qtyText) metaParts.push(qtyText);
  if (card.item_count > 1) metaParts.push(card.item_count + '품목');

  var html = '<div class="board-tile ' + statusClass + '" onclick="openLightbox(' + card.id + ')">';
  html += thumbHtml;
  html += '<div class="tile-body">';
  html += '<div class="tile-client">' + escHtml(card.client_name || '') + '</div>';
  html += '<div class="tile-item" title="' + escHtml(card.item_names || card.item_name || '') + '">' + escHtml(card.item_names || card.item_name || '') + '</div>';
  html += '<div class="tile-meta">';
  html += '<span class="tile-size">' + metaParts.join(' · ') + '</span>';
  html += '<span class="dday ' + dday.cls + '">' + dday.text + '</span>';
  html += '</div>';

  // 진행률 바
  html += '<div class="progress-bar"><div class="progress-fill' + (pct === 100 ? ' complete' : '') + '" style="width:' + pct + '%"></div></div>';

  // 상태 + PP + 장비
  html += '<div class="tile-status">';
  html += statusBadge;
  html += getPPBadge(card.pp_status, card.pp_names);
  if (card.equipment_name) {
    html += '<span class="s-badge" style="background:#f1f5f9;color:#475569"><i class="fas fa-print" style="font-size:9px"></i> ' + escHtml(card.equipment_name) + '</span>';
  }
  html += '</div>';

  // 후가공 상세 태그 (PP 항목이 있을 때)
  if (card.pp_names && card.pp_names.length > 0) {
    html += '<div class="tile-pp-tags">';
    for (var p = 0; p < card.pp_names.length; p++) {
      html += '<span class="pp-step-tag">' + escHtml(card.pp_names[p]) + '</span>';
    }
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

// ── 더보기 버튼 ──────────────────────────────────────────────────────────────
function renderLoadMore() {
  removeLoadMore();
  if (!hasMore) return;
  var container = document.getElementById('boardContainer');
  var btn = document.createElement('div');
  btn.id = 'loadMoreWrap';
  btn.className = 'load-more-wrap';
  btn.innerHTML = '<button class="load-more-btn" onclick="loadBoard(true)"><i class="fas fa-chevron-down"></i> 더보기</button>';
  container.appendChild(btn);
}

function removeLoadMore() {
  var existing = document.getElementById('loadMoreWrap');
  if (existing) existing.remove();
}

// ── 라이트박스 ────────────────────────────────────────────────────────────────
async function openLightbox(cardId) {
  // 닫기 타이머가 남아 있으면 취소 (race condition 방지)
  if (lbCloseTimer) { clearTimeout(lbCloseTimer); lbCloseTimer = null; }
  var overlay = document.getElementById('lightbox');
  overlay.style.display = 'flex';
  void overlay.offsetHeight; // reflow 강제 → transition 보장
  overlay.classList.add('show');
  document.getElementById('lbTitle').textContent = '로딩 중...';
  document.getElementById('lbBody').innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

  try {
    var res = await axios.get('/api/cards/' + cardId);
    if (!res.data.success) return;
    var card = res.data.data;
    var items = card.items || card._items || [];

    document.getElementById('lbTitle').textContent = card.card_number + ' — ' + (card.client_name || '');

    var html = '';

    // 품목별 썸네일 그리드
    var hasItemThumbs = items.some(function(it) { return !!it.thumbnail_url; });
    if (items.length > 0) {
      html += '<div class="lb-items-grid">';
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var checkIcon = item.print_completed ? '<span class="done-check"><i class="fas fa-check-circle"></i> 완료</span>' : '<span class="pending-check"><i class="far fa-circle"></i> 대기</span>';

        // 후가공 파싱
        var ppList = [];
        try { if (item.post_processing) ppList = typeof item.post_processing === 'string' ? JSON.parse(item.post_processing) : item.post_processing; } catch(_){}
        var ppOverlay = '';
        if (ppList && ppList.length > 0) {
          ppOverlay = '<div class="lb-item-pp">';
          for (var p = 0; p < ppList.length; p++) {
            ppOverlay += '<span class="pp-tag">' + escHtml(ppList[p].name || ppList[p].code || '') + '</span>';
          }
          ppOverlay += '</div>';
        }

        // 이미지: 품목별 → 카드 대표 → 플레이스홀더
        var imgSrc = item.thumbnail_url || (hasItemThumbs ? '' : card.thumbnail_url) || '';
        html += '<div class="lb-item">';
        html += '<div class="lb-item-img-wrap">';
        if (imgSrc) {
          html += '<img src="' + imgSrc + '" alt="" loading="lazy" onclick="zoomImage(this.src)" title="클릭하여 확대">';
        } else {
          html += '<div class="lb-no-thumb"><i class="fas fa-image"></i></div>';
        }
        html += ppOverlay;
        html += '</div>';
        html += '<div class="lb-item-info">';
        html += '<div class="lb-item-name" title="' + escHtml(item.item_name || '') + '">' + escHtml(item.item_name || '') + '</div>';
        html += '<div class="lb-item-size">' + (item.width || 0) + 'x' + (item.height || 0) + ' · ' + (item.quantity || 0) + (item.unit || 'EA') + '</div>';
        html += '<div>' + checkIcon + '</div>';
        html += '</div></div>';
      }
      html += '</div>';
    } else if (card.thumbnail_url) {
      // 품목 없는 카드 — 카드 대표 썸네일 표시
      html += '<div class="lb-single-thumb" onclick="zoomImage(\'' + card.thumbnail_url.replace(/'/g, "\\'") + '\')">';
      html += '<img src="' + card.thumbnail_url + '" alt="">';
      html += '</div>';
    }

    // 상세 정보
    var dday = calcDday(card.delivery_date);
    html += '<dl class="lb-detail-grid">';
    html += '<dt>주문번호</dt><dd>' + escHtml(card.order_number || '-') + '</dd>';
    html += '<dt>납기</dt><dd><span class="dday ' + dday.cls + '">' + dday.text + '</span> ' + (card.delivery_date || '-') + '</dd>';
    html += '<dt>상태</dt><dd>' + getStatusBadge(card.status, card.shipped_at) + '</dd>';
    html += '<dt>후가공</dt><dd>' + getPPBadge(card.pp_status) + '</dd>';
    html += '<dt>장비</dt><dd>' + escHtml(card.equipment_name || card.equipment_id || '미배정') + '</dd>';
    html += '<dt>카테고리</dt><dd>' + escHtml(card.category_name || '-') + '</dd>';
    if (card.shipped_at) {
      html += '<dt>출고일시</dt><dd>' + card.shipped_at.replace('T', ' ').slice(0, 16) + '</dd>';
    }
    if (card.hold_reason) {
      html += '<dt>HOLD 사유</dt><dd style="color:#d97706">' + escHtml(card.hold_reason) + '</dd>';
    }
    html += '</dl>';

    document.getElementById('lbBody').innerHTML = html;
  } catch (e) {
    document.getElementById('lbBody').innerHTML = '<p class="text-center text-red-500">로드 실패</p>';
  }
}

function closeLbZoom() {
  var zoom = document.getElementById('zoomOverlay');
  if (zoom) { zoom.remove(); return true; }
  return false;
}

function toggleLbExpand() {
  var modal = document.getElementById('lbModal');
  var btn = document.getElementById('lbExpandBtn');
  modal.classList.toggle('expanded');
  if (modal.classList.contains('expanded')) {
    btn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>';
    btn.title = '축소';
  } else {
    btn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>';
    btn.title = '확대';
  }
}

function closeLightbox(e) {
  if (e && e.target !== e.currentTarget) return;
  if (lbCloseTimer) { clearTimeout(lbCloseTimer); lbCloseTimer = null; }
  var overlay = document.getElementById('lightbox');
  overlay.classList.remove('show');
  var modal = document.getElementById('lbModal');
  if (modal) modal.classList.remove('expanded');
  var btn = document.getElementById('lbExpandBtn');
  if (btn) { btn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i>'; btn.title = '확대'; }
  lbCloseTimer = setTimeout(function () {
    overlay.style.display = 'none';
    lbCloseTimer = null;
  }, 250);
}

// ESC는 layout.ts 글로벌 핸들러에서 closeLightbox() 호출 (중복 등록 방지)

// ── 이미지 확대 ───────────────────────────────────────────────────────────────
function zoomImage(src) {
  if (!src) return;
  var existing = document.getElementById('zoomOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'zoomOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px;';
  overlay.onclick = function() { overlay.remove(); };

  var img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width:95vw;max-height:90vh;object-fit:contain;border-radius:8px;box-shadow:0 0 40px rgba(0,0,0,0.5);';
  img.onclick = function(e) { e.stopPropagation(); };

  var closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = 'position:absolute;top:16px;right:24px;background:none;border:none;color:white;font-size:36px;cursor:pointer;';
  closeBtn.onclick = function() { overlay.remove(); };

  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

// ── 풀스크린 ──────────────────────────────────────────────────────────────────
function toggleFullscreen() {
  var container = document.getElementById('boardContainer');
  if (!document.fullscreenElement) {
    (container.requestFullscreen || container.webkitRequestFullscreen || container.msRequestFullscreen).call(container);
    container.classList.add('fullscreen-mode');
    container.style.background = 'var(--c-bg-page, #f8fafc)';
    container.style.overflow = 'auto';
  } else {
    document.exitFullscreen();
    container.classList.remove('fullscreen-mode');
    container.style.background = '';
    container.style.overflow = '';
  }
}

document.addEventListener('fullscreenchange', function () {
  if (!document.fullscreenElement) {
    var container = document.getElementById('boardContainer');
    container.classList.remove('fullscreen-mode');
    container.style.background = '';
    container.style.overflow = '';
  }
});

// ── 자동 갱신 (30초: summary만, 2분마다: 전체) ──────────────────────────────
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  countdown = refreshInterval;
  refreshCount = 0;
  refreshTimer = setInterval(function () {
    countdown--;
    var el = document.getElementById('refreshCountdown');
    if (el) el.textContent = countdown + 's';
    if (countdown <= 0) {
      refreshCount++;
      if (refreshCount % 4 === 0) {
        loadBoard();
      } else {
        refreshSummary();
      }
      countdown = refreshInterval;
    }
  }, 1000);
}

// ── 썸네일 Lazy Load (IntersectionObserver + 배치) ────────────────────────────
var thumbObserver = null;
var thumbQueue = [];
var thumbTimer = null;

function initThumbObserver() {
  if (thumbObserver) thumbObserver.disconnect();
  thumbQueue = [];

  var thumbEls = document.querySelectorAll('.tile-thumb[data-card-id]');
  if (thumbEls.length === 0) return;

  thumbObserver = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        var id = Number(entries[i].target.getAttribute('data-card-id'));
        if (id && thumbQueue.indexOf(id) === -1) thumbQueue.push(id);
        thumbObserver.unobserve(entries[i].target);
      }
    }
    scheduleThumbFetch();
  }, { rootMargin: '200px' });

  for (var i = 0; i < thumbEls.length; i++) {
    thumbObserver.observe(thumbEls[i]);
  }
}

function scheduleThumbFetch() {
  if (thumbTimer) return;
  thumbTimer = setTimeout(function () {
    thumbTimer = null;
    flushThumbQueue();
  }, 150);
}

async function flushThumbQueue() {
  if (thumbQueue.length === 0) return;
  var batch = thumbQueue.splice(0, 12);
  try {
    var res = await axios.get('/api/cards/thumbnails?ids=' + batch.join(','));
    if (!res.data.success) return;
    var map = res.data.data;
    for (var i = 0; i < batch.length; i++) {
      var el = document.querySelector('.tile-thumb[data-card-id="' + batch[i] + '"]');
      if (!el) continue;
      if (map[batch[i]]) {
        el.innerHTML = '<img src="' + map[batch[i]] + '" alt="">';
      } else {
        el.innerHTML = '<i class="fas fa-image"></i>';
      }
    }
  } catch (e) {
    // 실패 시 플레이스홀더 유지
  }
  if (thumbQueue.length > 0) flushThumbQueue();
}

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function calcDday(dateStr) {
  if (!dateStr) return { text: '-', cls: 'dday-ok' };
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  var diff = Math.ceil((target - today) / 86400000);
  if (diff < 0) return { text: 'D+' + Math.abs(diff), cls: 'dday-overdue' };
  if (diff === 0) return { text: 'D-Day', cls: 'dday-today' };
  if (diff <= 2) return { text: 'D-' + diff, cls: 'dday-soon' };
  return { text: 'D-' + diff, cls: 'dday-ok' };
}

function getStatusBadge(status, shippedAt) {
  if (shippedAt) return '<span class="s-badge s-shipped"><i class="fas fa-truck" style="font-size:9px"></i> 출고완료</span>';
  var map = {
    'PRINTING': '<span class="s-badge s-printing">출력중</span>',
    'PRINT_DONE': '<span class="s-badge s-done">출력완료</span>',
    'HOLD': '<span class="s-badge s-hold">HOLD</span>',
    'PRINT_PENDING': '<span class="s-badge s-pending">대기</span>'
  };
  return map[status] || '<span class="s-badge s-pending">' + (status || '-') + '</span>';
}

function getPPBadge(ppStatus, ppNames) {
  if (ppStatus === 'DONE') return '<span class="pp-badge pp-done">PP완료</span>';
  if (ppStatus === 'PENDING') {
    var label = 'PP대기';
    if (ppNames && ppNames.length > 0) {
      label = ppNames[0] + (ppNames.length > 1 ? ' +' + (ppNames.length - 1) : '');
    }
    return '<span class="pp-badge pp-pending">' + escHtml(label) + '</span>';
  }
  return '';
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
