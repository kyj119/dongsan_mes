// 출고 포장 검수 (모바일) — 출고관리 v2 P4
// ?raw concat 전역 스코프: 전 식별자 pack* 프리픽스 (scan.js 등과 충돌 방지)

var packData = null;      // GET /api/shipments/checklist/by-order 응답 data
var packScanner = null;
var packScanning = false;
var packSaving = false;

// ── html5-qrcode CDN 동적 로드 (scan.js와 동일 CDN — 이미 로드됐으면 스킵) ──
(function packLoadQrLib() {
  if (typeof Html5Qrcode !== 'undefined') return;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
  s.async = true;
  document.head.appendChild(s);
})();

// 수동 입력 = **검색 경유**(2026-08-19). 예전엔 입력값을 그대로 by-order 에 넘겼는데,
// 그 라우트는 shipment 를 생성하는 쓰기 경로라 꼬리 3자리('001')를 치면 **주문 id 1** 에 출고가 생겼다.
// 완전일치(주문번호) 1건이면 종전처럼 즉시 열고, 그 외에는 후보를 띄워 사람이 고른다. QR 은 id 직행 유지.
async function packOpenFromInput() {
  var el = document.getElementById('packOrderInput');
  var v = el ? el.value.trim() : '';
  if (v.length < 2) { showToast('2자 이상 입력하세요', 'warning'); return; }
  try {
    var res = await axios.get('/api/shipments/pack-search?q=' + encodeURIComponent(v));
    var rows = (res.data && res.data.data) || [];
    var exact = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].order_number || '').toUpperCase() === v.toUpperCase()) { exact = rows[i]; break; }
    }
    if (exact) { packRenderResults([]); packLoad(exact.id); return; }
    if (!rows.length) { packRenderResults([]); showToast('일치하는 주문이 없습니다', 'warning'); return; }
    packRenderResults(rows, res.data.has_more);
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) || e.message || '';
    showToast('검색 실패: ' + msg, 'error');
  }
}

// 후보 목록 — 오선택 방지용으로 거래처·납품일·라인수·출고여부를 함께 보여준다.
function packRenderResults(rows, hasMore) {
  var box = document.getElementById('packResults');
  if (!box) { console.warn('[pack] #packResults not found'); return; }
  if (!rows || !rows.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  var html = '<div class="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b">'
    + rows.length + '건' + (hasMore ? ' 이상' : '') + ' — 열 주문을 선택하세요</div>';
  html += rows.map(function(r) {
    var shipped = !!r.shipped_at;
    return '<div onclick="packChooseResult(' + r.id + ')" class="px-4 py-3 border-b last:border-b-0 active:bg-gray-100 cursor-pointer">'
      + '<div class="flex items-center gap-2">'
      + '<span class="text-sm font-semibold text-gray-800">' + escapeHtml(r.order_number || ('#' + r.id)) + '</span>'
      + (r.id_match ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">주문 ID ' + r.id + '</span>' : '')
      + (shipped ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">출고완료</span>'
                 : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">미출고</span>')
      + '</div>'
      + '<div class="text-xs text-gray-500 mt-0.5">'
      + escapeHtml(r.client_name || '-') + ' · 납품 ' + (r.delivery_date || '-') + ' · ' + (r.line_count || 0) + '라인'
      + (r.entity_name ? ' · ' + escapeHtml(r.entity_name) : '')
      + '</div></div>';
  }).join('');
  box.innerHTML = html;
  box.classList.remove('hidden');
}

function packChooseResult(orderId) {
  packRenderResults([]);
  packLoad(orderId);
}

// QR 텍스트 파싱: /pack?order=N URL · PACK:N · 숫자 · 주문번호 문자열
function packParseCode(text) {
  if (!text) return '';
  var m = String(text).match(/[?&]order=([^&\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  m = String(text).match(/^PACK:(.+)$/i);
  if (m) return m[1];
  return String(text).trim();
}

async function packLoad(idOrNumber) {
  var card = document.getElementById('packCard');
  var empty = document.getElementById('packEmpty');
  try {
    var res = await axios.get('/api/shipments/checklist/by-order/' + encodeURIComponent(idOrNumber));
    if (!res.data.success) { showToast(res.data.error || '조회 실패', 'error'); return; }
    packData = res.data.data;
    (packData.lines || []).forEach(function(ln) {
      ln._checked = !!ln.checked_at;
    });
    if (empty) empty.classList.add('hidden');
    if (card) card.classList.remove('hidden');
    packRenderResults([]);
    packRender();
    navigator.vibrate && navigator.vibrate(50);
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) || e.message || '';
    showToast('조회 실패: ' + msg, 'error');
  }
}

function packLineSpec(ln) {
  if (ln.specification) return ln.specification;
  if (ln.width && ln.height) return ln.width + 'x' + ln.height;
  return '';
}

function packRender() {
  if (!packData) return;
  var o = packData.order || {};
  var lines = packData.lines || [];
  var nameEl = document.getElementById('packClientName');
  var metaEl = document.getElementById('packOrderMeta');
  if (nameEl) nameEl.textContent = o.client_name || '-';
  if (metaEl) metaEl.textContent = (o.order_number || ('#' + o.id)) + ' · 납품 ' + (o.delivery_date || '-') + ' · ' + (o.delivery_method || '-');

  var linesEl = document.getElementById('packLines');
  if (linesEl) {
    linesEl.innerHTML = lines.map(function(ln, li) {
      var partial = ln.packed_quantity != null;
      var qtyLabel = partial
        ? '<span class="text-amber-600 font-bold">' + ln.packed_quantity + '</span><span class="text-gray-400">/' + (ln.quantity || 0) + '</span>'
        : '<span class="font-bold">' + (ln.quantity || 0) + '</span>';
      return '<div onclick="packToggleLine(' + li + ')" class="flex items-center gap-3 px-4 py-3 border-b active:bg-gray-100 cursor-pointer ' + (ln._checked ? 'bg-green-50' : '') + '">'
        + '<div class="flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center ' + (ln._checked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent') + '"><i class="fas fa-check text-sm"></i></div>'
        + '<div class="flex-1 min-w-0">'
        + '<div class="text-sm font-medium text-gray-800 truncate">' + escapeHtml(ln.item_name || '-') + '</div>'
        + '<div class="text-xs text-gray-500">' + escapeHtml(packLineSpec(ln) || '') + (ln.content ? ' · ' + escapeHtml(ln.content) : '') + '</div>'
        + '</div>'
        + '<div class="text-right flex-shrink-0">'
        + '<div class="text-sm">' + qtyLabel + (ln.unit ? ' <span class="text-xs text-gray-400">' + escapeHtml(ln.unit) + '</span>' : '') + '</div>'
        + '<button onclick="event.stopPropagation();packSetPartial(' + li + ')" class="text-[10px] text-gray-400 underline">부분</button>'
        + '</div>'
        + '</div>';
    }).join('') || '<div class="px-4 py-8 text-center text-gray-400 text-sm">검수할 라인이 없습니다.</div>';
  }
  packRenderPartners();
  packUpdateProgress();
}

// 갭4: 합포장 파트너 칩 — checklist 응답 group(merged 묶음)에서 현재 주문 제외.
// 칩 탭 = 해당 주문 이어서 검수 (타법인이면 by-order entityFilter 404 → 토스트 안내)
function packRenderPartners() {
  var box = document.getElementById('packPartners');
  if (!box) { console.warn('[pack] #packPartners not found'); return; }
  var o = (packData && packData.order) || {};
  var group = (packData && packData.group) || [];
  var partners = group.filter(function(g) { return g.order_id !== o.id; });
  if (!partners.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = '<div class="text-[10px] text-blue-700 font-semibold mb-1"><i class="fas fa-boxes-stacked mr-1"></i>합포장 묶음 — 같은 박스 주문 ' + (partners.length + 1) + '건 (칩을 눌러 이어서 검수)</div>'
    + partners.map(function(g) {
        var total = g.line_total || g.chk_total || 0;
        var done = g.chk_done || 0;
        var full = total > 0 && done >= total;
        var style = full ? 'background:#dcfce7;color:#15803d' : (done > 0 ? 'background:#fef9c3;color:#a16207' : 'background:#f3f4f6;color:#6b7280');
        return '<button onclick="packLoad(' + g.order_id + ')" class="mr-1 mb-1" style="' + style + ';font-size:11px;padding:2px 8px;border-radius:9999px;border:1px solid rgba(0,0,0,0.06)">'
          + (g.entity_name ? escapeHtml(g.entity_name) + ' ' : '') + escapeHtml(g.order_number || ('#' + g.order_id))
          + ' ' + (full ? '✓' : done + '/' + (total || '?')) + '</button>';
      }).join('');
}

function packUpdateProgress() {
  var lines = (packData && packData.lines) || [];
  var done = lines.filter(function(l) { return l._checked; }).length;
  var total = lines.length;
  var txt = document.getElementById('packProgressText');
  var bar = document.getElementById('packProgressBar');
  var banner = document.getElementById('packDoneBanner');
  if (txt) txt.textContent = done + '/' + total;
  if (bar) bar.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  if (banner) banner.classList.toggle('hidden', !(total > 0 && done >= total));
}

async function packSaveLine(ln) {
  if (!packData) return false;
  try {
    await axios.patch('/api/shipments/checklist/' + packData.shipment_id, {
      items: [{ order_item_id: ln.order_item_id, checked: !!ln._checked, packed_quantity: ln.packed_quantity != null ? ln.packed_quantity : null }]
    });
    return true;
  } catch (e) {
    showToast('저장 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
    return false;
  }
}

async function packToggleLine(li) {
  if (!packData || packSaving) return;
  var ln = packData.lines[li];
  if (!ln) return;
  ln._checked = !ln._checked;
  packRender();
  navigator.vibrate && navigator.vibrate(30);
  packSaving = true;
  var ok = await packSaveLine(ln);
  packSaving = false;
  if (!ok) { ln._checked = !ln._checked; packRender(); }
}

async function packSetPartial(li) {
  if (!packData) return;
  var ln = packData.lines[li];
  if (!ln) return;
  var cur = ln.packed_quantity != null ? ln.packed_quantity : (ln.quantity || 0);
  var v = await showPrompt('실제 담은 수량 (전량이면 ' + (ln.quantity || 0) + ', 비우면 전량 처리)', { title: '부분 수량', defaultValue: String(cur), placeholder: String(ln.quantity || 0) });
  if (v === null) return;
  var n = parseFloat(v);
  ln.packed_quantity = (v === '' || isNaN(n)) ? null : n;
  ln._checked = true;
  packRender();
  await packSaveLine(ln);
}

async function packCheckAll() {
  if (!packData) return;
  var lines = packData.lines || [];
  lines.forEach(function(l) { l._checked = true; });
  packRender();
  try {
    await axios.patch('/api/shipments/checklist/' + packData.shipment_id, {
      items: lines.map(function(l) {
        return { order_item_id: l.order_item_id, checked: true, packed_quantity: l.packed_quantity != null ? l.packed_quantity : null };
      })
    });
    showToast('전체 체크 저장 완료', 'success');
  } catch (e) {
    showToast('저장 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
}

// ── 카메라 스캔 ──
function packStartScan() {
  var readerEl = document.getElementById('pack-qr-reader');
  var stopBtn = document.getElementById('packScanStopBtn');
  if (!readerEl) return;
  if (typeof Html5Qrcode === 'undefined') { showToast('QR 스캐너 라이브러리 로딩 중...', 'warning'); return; }
  readerEl.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.remove('hidden');
  packScanner = new Html5Qrcode('pack-qr-reader');
  packScanning = true;
  packScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    function(decodedText) {
      var code = packParseCode(decodedText);
      if (!code) return;
      packStopScan();
      packLoad(code);
    },
    function() { /* miss 무시 */ }
  ).catch(function(err) {
    console.error('[pack] Camera error:', err);
    showToast('카메라 접근 실패 (HTTPS·권한 확인)', 'error');
    packStopScan();
  });
}

function packStopScan() {
  var readerEl = document.getElementById('pack-qr-reader');
  var stopBtn = document.getElementById('packScanStopBtn');
  if (readerEl) readerEl.classList.add('hidden');
  if (stopBtn) stopBtn.classList.add('hidden');
  if (packScanner && packScanning) {
    packScanner.stop().then(function() {
      try { packScanner.clear(); } catch (e) {}
      packScanner = null; packScanning = false;
    }).catch(function() { packScanner = null; packScanning = false; });
  }
}

// ── 초기화: ?order= 자동 로드 + Enter 키 ──
(function packInit() {
  var input = document.getElementById('packOrderInput');
  if (!input) { console.warn('[pack] #packOrderInput not found'); return; }
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') packOpenFromInput(); });
  var params = new URLSearchParams(location.search);
  var order = params.get('order');
  if (order) { input.value = order; packLoad(order); }
})();
