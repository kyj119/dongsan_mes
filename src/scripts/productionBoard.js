/* ── 생산 현황 보드 ─────────────────────────────────────────────────────────── */
var boardData = [];
var currentFilter = '';
var refreshTimer = null;
var refreshInterval = 30;
var countdown = refreshInterval;

// ── 초기화 ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  loadBoard();
  document.getElementById('sortSelect').addEventListener('change', loadBoard);
  startAutoRefresh();
});

// ── 데이터 로드 ───────────────────────────────────────────────────────────────
async function loadBoard() {
  try {
    var sort = document.getElementById('sortSelect').value;
    var params = '?sort=' + sort;
    if (currentFilter) params += '&status=' + currentFilter;

    var res = await axios.get('/api/cards/board' + params);
    if (!res.data.success) return;

    boardData = res.data.data;
    renderStatusTabs(res.data.summary);
    renderGrid(boardData);
    countdown = refreshInterval;
  } catch (e) {
    console.error('Board load error:', e);
  }
}

// ── 상태 탭 렌더 ──────────────────────────────────────────────────────────────
function renderStatusTabs(summary) {
  var tabs = [
    { key: '', label: '전체', count: summary.total },
    { key: 'PRINT_PENDING', label: '출력대기', count: summary.pending },
    { key: 'PRINTING', label: '출력중', count: summary.printing },
    { key: 'PRINT_DONE', label: '출력완료', count: summary.done },
    { key: 'HOLD', label: 'HOLD', count: summary.hold }
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
    return;
  }

  var html = '';
  for (var i = 0; i < cards.length; i++) {
    html += renderTile(cards[i]);
  }
  grid.innerHTML = html;
  initThumbObserver();
}

function renderTile(card) {
  var dday = calcDday(card.delivery_date);
  var statusClass = 'status-' + card.status;
  var progress = card.print_progress || { done: 0, total: 1 };
  var pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  var thumbHtml = '';
  if (card.has_thumbnail) {
    thumbHtml = '<div class="tile-thumb" data-card-id="' + card.id + '"><span class="thumb-loading"><i class="fas fa-spinner fa-spin"></i></span></div>';
  } else {
    thumbHtml = '<div class="tile-thumb"><i class="fas fa-image"></i></div>';
  }

  var statusBadge = getStatusBadge(card.status);
  var ppBadge = getPPBadge(card.pp_status);

  var sizeText = '';
  if (card.width && card.height) {
    sizeText = card.width + 'x' + card.height;
    if (card.unit === 'M' || card.unit === 'm') sizeText += 'cm';
  }

  var html = '<div class="board-tile ' + statusClass + '" onclick="openLightbox(' + card.id + ')">';
  html += thumbHtml;
  html += '<div class="tile-body">';
  html += '<div class="tile-client">' + escHtml(card.client_name || '') + '</div>';
  html += '<div class="tile-item" title="' + escHtml(card.item_names || card.item_name || '') + '">' + escHtml(card.item_names || card.item_name || '') + '</div>';
  html += '<div class="tile-meta">';
  html += '<span class="tile-size">' + sizeText + (card.item_count > 1 ? ' · ' + card.item_count + '품목' : '') + '</span>';
  html += '<span class="dday ' + dday.cls + '">' + dday.text + '</span>';
  html += '</div>';

  // 진행률 바
  html += '<div class="progress-bar"><div class="progress-fill' + (pct === 100 ? ' complete' : '') + '" style="width:' + pct + '%"></div></div>';

  // 상태 + PP
  html += '<div class="tile-status">';
  html += statusBadge;
  html += ppBadge;
  if (card.equipment_name) {
    html += '<span class="s-badge" style="background:#f1f5f9;color:#475569"><i class="fas fa-print" style="font-size:9px"></i> ' + escHtml(card.equipment_name) + '</span>';
  }
  html += '</div>';

  html += '</div></div>';
  return html;
}

// ── 라이트박스 ────────────────────────────────────────────────────────────────
async function openLightbox(cardId) {
  var overlay = document.getElementById('lightbox');
  overlay.classList.add('show');
  overlay.style.display = 'flex';
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
    if (items.length > 0) {
      html += '<div class="lb-items-grid">';
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var checkIcon = item.print_completed ? '<span class="done-check"><i class="fas fa-check-circle"></i> 완료</span>' : '<span class="pending-check"><i class="far fa-circle"></i> 대기</span>';
        html += '<div class="lb-item">';
        if (item.thumbnail_url) {
          html += '<img src="' + item.thumbnail_url + '" alt="" loading="lazy">';
        } else {
          html += '<div class="lb-no-thumb"><i class="fas fa-image"></i></div>';
        }
        html += '<div class="lb-item-info">';
        html += '<div class="lb-item-name" title="' + escHtml(item.item_name || '') + '">' + escHtml(item.item_name || '') + '</div>';
        html += '<div class="lb-item-size">' + (item.width || 0) + 'x' + (item.height || 0) + ' · ' + (item.quantity || 0) + (item.unit || 'EA') + '</div>';
        html += '<div>' + checkIcon + '</div>';
        html += '</div></div>';
      }
      html += '</div>';
    }

    // 상세 정보
    var dday = calcDday(card.delivery_date);
    html += '<dl class="lb-detail-grid">';
    html += '<dt>주문번호</dt><dd>' + escHtml(card.order_number || '-') + '</dd>';
    html += '<dt>납기</dt><dd><span class="dday ' + dday.cls + '">' + dday.text + '</span> ' + (card.delivery_date || '-') + '</dd>';
    html += '<dt>상태</dt><dd>' + getStatusBadge(card.status) + '</dd>';
    html += '<dt>후가공</dt><dd>' + getPPBadge(card.pp_status) + '</dd>';
    html += '<dt>장비</dt><dd>' + escHtml(card.equipment_name || card.equipment_id || '미배정') + '</dd>';
    html += '<dt>카테고리</dt><dd>' + escHtml(card.category_name || '-') + '</dd>';
    if (card.hold_reason) {
      html += '<dt>HOLD 사유</dt><dd style="color:#d97706">' + escHtml(card.hold_reason) + '</dd>';
    }
    html += '</dl>';

    document.getElementById('lbBody').innerHTML = html;
  } catch (e) {
    document.getElementById('lbBody').innerHTML = '<p class="text-center text-red-500">로드 실패</p>';
  }
}

function closeLightbox(e) {
  if (e && e.target !== e.currentTarget) return;
  var overlay = document.getElementById('lightbox');
  overlay.classList.remove('show');
  setTimeout(function () { overlay.style.display = 'none'; }, 200);
}

// ESC 닫기
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeLightbox();
});

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

// ── 자동 갱신 ─────────────────────────────────────────────────────────────────
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  countdown = refreshInterval;
  refreshTimer = setInterval(function () {
    countdown--;
    var el = document.getElementById('refreshCountdown');
    if (el) el.textContent = countdown + 's';
    if (countdown <= 0) {
      loadBoard();
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

function getStatusBadge(status) {
  var map = {
    'PRINTING': '<span class="s-badge s-printing">출력중</span>',
    'PRINT_DONE': '<span class="s-badge s-done">출력완료</span>',
    'HOLD': '<span class="s-badge s-hold">HOLD</span>',
    'PRINT_PENDING': '<span class="s-badge s-pending">대기</span>'
  };
  return map[status] || '<span class="s-badge s-pending">' + (status || '-') + '</span>';
}

function getPPBadge(ppStatus) {
  if (ppStatus === 'DONE') return '<span class="pp-badge pp-done">PP완료</span>';
  if (ppStatus === 'PENDING') return '<span class="pp-badge pp-pending">PP대기</span>';
  return '';
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
