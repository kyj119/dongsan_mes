// ============================================================================
// 자재명세(BOM) 프론트엔드 — 신모델 product_materials 읽기전용 개요
// ============================================================================

var esc = window.escapeHtml || function(s) { if (s === null || s === undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); };

var bomProducts = [];   // [{id, item_code, item_name, category, materials:[...]}]
var bomUnmapped = [];   // [{id, item_code, item_name, category}]

// Skeleton loading
(function() {
  var el = document.getElementById('bom-tbody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 7);
})();

async function initBom() {
  try {
    var res = await axios.get('/api/bom/overview');
    var data = (res.data && res.data.data) || {};
    bomProducts = data.products || [];
    bomUnmapped = data.unmapped || [];
    renderBomSummary(data.summary || {});
    renderBomUnmapped();
    renderBomOverview();
  } catch (e) {
    console.error('[bom] overview load failed', e);
    var tbody = document.getElementById('bom-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">자재명세를 불러오지 못했습니다.</td></tr>';
  }
}

// ─── 요약 카드 ──────────────────────────────────────────────────────────────
function renderBomSummary(s) {
  var el = document.getElementById('bom-summary');
  if (!el) return;
  var card = function(label, val, cls) {
    return '<div class="ds-card p-4 text-center"><div class="text-2xl font-bold ' + cls + '">' + val + '</div>'
      + '<div class="text-sm text-gray-500 mt-1">' + label + '</div></div>';
  };
  el.innerHTML =
    card('전체 제품', s.totalProducts || 0, 'text-gray-800')
    + card('자재 연결됨', s.mappedProducts || 0, 'text-blue-600')
    + card('자재 미연결', s.unmappedProducts || 0, (s.unmappedProducts > 0 ? 'text-amber-600' : 'text-green-600'));
}

// ─── 미연결 경고 ────────────────────────────────────────────────────────────
function renderBomUnmapped() {
  var box = document.getElementById('bom-unmapped');
  var body = document.getElementById('bom-unmapped-body');
  var cnt = document.getElementById('bom-unmapped-count');
  if (!box || !body) return;
  if (bomUnmapped.length === 0) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  if (cnt) cnt.textContent = '(' + bomUnmapped.length + '건)';
  body.innerHTML = bomUnmapped.map(function(p) {
    return '<div class="flex items-center justify-between py-1.5 border-b border-amber-200 text-sm">'
      + '<span><span class="font-mono text-xs text-gray-500 mr-2">' + esc(p.item_code || '-') + '</span>'
      + esc(p.item_name) + ' <span class="text-xs text-amber-700">[' + esc(p.category) + ']</span></span>'
      + '<a href="/items?edit=' + p.id + '&tab=materials" class="text-blue-600 hover:underline text-xs whitespace-nowrap">자재 연결 →</a></div>';
  }).join('');
}

function toggleUnmapped() {
  var body = document.getElementById('bom-unmapped-body');
  var chev = document.getElementById('bom-unmapped-chevron');
  if (!body) return;
  body.classList.toggle('hidden');
  if (chev) { chev.classList.toggle('fa-chevron-down'); chev.classList.toggle('fa-chevron-up'); }
}

// ─── 차감방식 배지 ──────────────────────────────────────────────────────────
function dedBadge(method) {
  var map = {
    ROLL:  ['롤(폭매칭·길이)', 'bg-blue-50 text-blue-700'],
    BOARD: ['판재(면적·장)',   'bg-purple-50 text-purple-700'],
    NONE:  ['차감안함',        'bg-gray-100 text-gray-600'],
  };
  var v = map[method] || [method || '-', 'bg-gray-100 text-gray-600'];
  return '<span class="px-2 py-0.5 rounded text-xs ' + v[1] + '">' + esc(v[0]) + '</span>';
}

// ─── 자재명세 테이블 (카테고리 → 제품 → 자재) ─────────────────────────────────
function renderBomOverview() {
  var tbody = document.getElementById('bom-tbody');
  if (!tbody) return;

  var kw = (document.getElementById('bom-search')?.value || '').trim().toLowerCase();
  var filtered = bomProducts;
  if (kw) {
    filtered = bomProducts.filter(function(p) {
      if ((p.item_name || '').toLowerCase().indexOf(kw) >= 0) return true;
      if ((p.item_code || '').toLowerCase().indexOf(kw) >= 0) return true;
      return (p.materials || []).some(function(m) { return (m.material_name || '').toLowerCase().indexOf(kw) >= 0; });
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">'
      + (kw ? '검색 결과가 없습니다.' : '자재가 연결된 제품이 없습니다.') + '</td></tr>';
    return;
  }

  // 카테고리별 그룹
  var groups = {};
  filtered.forEach(function(p) {
    var key = p.category || '미분류';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  var html = '';
  Object.keys(groups).forEach(function(cat) {
    var products = groups[cat];
    html += '<tr class="bg-gray-100"><td colspan="7" class="px-4 py-2 font-semibold text-gray-700">'
      + '<i class="fas fa-folder-open mr-2 text-blue-500"></i>' + esc(cat) + ' (' + products.length + '개 제품)</td></tr>';
    products.forEach(function(p) {
      var mats = p.materials || [];
      var rows = Math.max(mats.length, 1);
      var prodCell = '<td class="px-4 py-2 text-sm align-top" rowspan="' + rows + '">'
        + '<div class="font-medium" title="' + esc(p.item_name) + '">' + esc(p.item_name)
        + ' <a href="/items?edit=' + p.id + '&tab=materials" class="text-gray-300 hover:text-blue-600 text-xs ml-1" title="자재 연결 편집 (품목관리 재료탭)"><i class="fas fa-pen"></i></a></div>'
        + '<div class="text-xs text-gray-400 font-mono">' + esc(p.item_code || '') + '</div></td>';
      if (mats.length === 0) {
        html += '<tr class="border-b hover:bg-blue-50">' + prodCell
          + '<td colspan="6" class="px-4 py-2 text-sm text-gray-400">연결 자재 없음</td></tr>';
        return;
      }
      mats.forEach(function(m, idx) {
        html += '<tr class="border-b hover:bg-blue-50">';
        if (idx === 0) html += prodCell;
        var def = m.is_default ? ' <span class="text-xs text-blue-600">(기본)</span>' : '';
        html += '<td class="px-4 py-2 text-sm font-medium" title="' + esc(m.material_name) + '">'
          + esc(m.material_name) + def
          + (m.material_code ? ' <span class="text-xs text-gray-400 font-mono">' + esc(m.material_code) + '</span>' : '') + '</td>'
          + '<td class="px-4 py-2 text-sm text-center">' + dedBadge(m.deduction_method) + '</td>'
          + '<td class="px-4 py-2 text-sm text-right">' + (m.width_mm != null ? m.width_mm : '<span class="text-amber-600" title="롤 폭 미지정 — 차감 매칭 실패 가능">-</span>') + '</td>'
          + '<td class="px-4 py-2 text-sm text-center">' + esc(m.sheet_spec || '-') + '</td>'
          + '<td class="px-4 py-2 text-sm text-right">' + (((m.waste_factor || 1) - 1) * 100).toFixed(1) + '%</td>'
          + '<td class="px-4 py-2 text-sm text-center">' + esc(m.base_unit || m.unit || '-') + '</td>'
          + '</tr>';
      });
    });
  });
  tbody.innerHTML = html;
}

// SPA 전환(사이드바 클릭)은 DOMContentLoaded 를 다시 쏘지 않는다 — 스크립트가 주입되는 시점에
// 이미 문서가 로드 완료 상태라 리스너만 걸면 영원히 실행되지 않고 스켈레톤이 남는다.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBom);
} else {
  initBom();
}
