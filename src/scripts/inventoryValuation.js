// ============================================================================
// 재고자산 평가 탭 (#619) — /api/inventory-valuation/* 엔드포인트의 화면
//
// 백엔드는 진작 있었는데 부르는 화면이 없어, 월말 결산에 쓰는 재고자산 금액을
// API 를 직접 때려야만 볼 수 있었다. 2026-08-20 에 평가액 4.6억→3,436만 오류를
// 고친 커밋도 그 결과를 볼 자리가 없었다.
//
// ★ 총계만 크게 띄우지 않는다 — 이 수치는 음수재고·무원가 품목을 그대로 안고 있다.
//   숨기면 「깔끔한 오답」이 되므로 API 가 주는 negative_stock_items / zero_valuation_items /
//   note 를 총계 옆에 같이 세운다(그 커밋이 정확히 그 이유로 필드를 만들었다).
// ============================================================================

var _ivLoaded = false;
var _ivUser = { role: null };
(function () {
  // 저장 버튼 노출용 역할 판정 — 클라는 fail-open, 서버가 requireRole('ADMIN') 로 막는다
  try {
    var tok = localStorage.getItem('token');
    if (!tok) return;
    var parts = tok.split('.');
    if (parts.length < 2) return;
    _ivUser.role = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
  } catch (e) { /* silent */ }
})();

var IV_METHOD_LABEL = { WEIGHTED_AVG: '이동평균', FIFO: '선입선출(FIFO)', STANDARD: '표준원가' };

function invValInit() {
  if (_ivLoaded) { invValLoadReport(); return; }
  _ivLoaded = true;
  var sel = document.getElementById('ivMethod');
  var save = document.getElementById('ivMethodSave');
  if (!sel || !save) { console.warn('[inventoryValuation] #ivMethod / #ivMethodSave not found'); return; }
  if (_ivUser.role === 'ADMIN') save.classList.remove('hidden');
  save.addEventListener('click', invValSaveMethod);
  invValLoadMethod();
}

async function invValLoadMethod() {
  var sel = document.getElementById('ivMethod');
  if (!sel) { console.warn('[inventoryValuation] #ivMethod not found'); return; }
  try {
    var res = await axios.get('/api/inventory-valuation/method');
    if (res.data && res.data.success) sel.value = res.data.data.method || 'WEIGHTED_AVG';
  } catch (e) { console.warn('[inventoryValuation] 평가방법 조회 실패', e); }
  invValLoadReport();
}

async function invValSaveMethod() {
  var sel = document.getElementById('ivMethod');
  if (!sel) { console.warn('[inventoryValuation] #ivMethod not found'); return; }
  try {
    var res = await axios.put('/api/inventory-valuation/method', { method: sel.value });
    if (!res.data || !res.data.success) { alert((res.data && res.data.error) || '평가방법을 바꾸지 못했습니다.'); return; }
    // 방법이 바뀌면 평가액 산식 자체가 바뀐다 — 바로 다시 계산해 보여준다
    invValLoadReport();
  } catch (e) {
    alert((e.response && e.response.data && e.response.data.error) || '평가방법을 바꾸지 못했습니다.');
  }
}

async function invValLoadReport() {
  var body = document.getElementById('ivBody');
  var total = document.getElementById('ivTotal');
  var meta = document.getElementById('ivMeta');
  var note = document.getElementById('ivNote');
  if (!body || !total || !meta || !note) { console.warn('[inventoryValuation] #iv* not found'); return; }
  body.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">불러오는 중...</td></tr>';
  try {
    var res = await axios.get('/api/inventory-valuation/report');
    if (!res.data || !res.data.success) throw new Error('bad response');
    var d = res.data.data || {};
    var items = d.items || [];

    total.textContent = Math.round(d.total_valuation || 0).toLocaleString() + '원';

    // 신뢰도 — 0 이 아닌 것만 배지로 세운다. 늘 떠 있는 0 은 읽히지 않는다.
    var badges = ['<span class="text-gray-500">' + (d.item_count || 0).toLocaleString() + '품목</span>',
                  '<span class="text-gray-500">' + (IV_METHOD_LABEL[d.method] || d.method || '-') + '</span>'];
    if (d.negative_stock_items) {
      badges.push('<span class="px-1.5 py-0.5 rounded bg-red-100 text-red-700">음수재고 ' + d.negative_stock_items + '품목</span>');
    }
    if (d.zero_valuation_items) {
      badges.push('<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">원가 없음 ' + d.zero_valuation_items + '품목</span>');
    }
    meta.innerHTML = badges.join(' · ');

    if (d.note) { note.textContent = d.note; note.classList.remove('hidden'); }
    else { note.classList.add('hidden'); }

    if (!items.length) {
      body.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">평가 대상 재고가 없습니다</td></tr>';
      return;
    }
    body.innerHTML = items.map(function (r) {
      var stock = Number(r.current_stock) || 0;
      var cost = r.avg_unit_cost != null ? r.avg_unit_cost : (r.avg_cost != null ? r.avg_cost : r.standard_cost);
      var val = Number(r.valuation) || 0;
      return '<tr>'
        + '<td class="px-4 py-2 text-gray-500">' + escapeHtml(r.item_code || '') + '</td>'
        + '<td class="px-4 py-2">' + escapeHtml(r.item_name || '') + '</td>'
        + '<td class="px-3 py-2 text-gray-500">' + escapeHtml(r.base_unit || r.unit || '') + '</td>'
        + '<td class="px-3 py-2 text-right tabular-nums ' + (stock < 0 ? 'text-red-600 font-medium' : '') + '">' + stock.toLocaleString() + '</td>'
        + '<td class="px-3 py-2 text-right tabular-nums text-gray-600">' + (cost != null ? Number(cost).toLocaleString() : '-') + '</td>'
        + '<td class="px-4 py-2 text-right tabular-nums ' + (val ? 'font-medium' : 'text-gray-300') + '">' + val.toLocaleString() + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    console.warn('[inventoryValuation] 평가 보고서 로드 실패', e);
    body.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">불러오지 못했습니다</td></tr>';
  }
}

// 법인 간 동일 품목 단가 차이 — 다법인 구조에서 매입 이상을 잡는 축이라 같은 탭에 둔다.
// 눌러야 부른다: 전 법인 inventory_transactions 를 훑는 집계라 탭 진입마다 돌릴 게 아니다.
async function invValLoadAlerts() {
  var body = document.getElementById('ivAlertBody');
  var thr = document.getElementById('ivAlertThreshold');
  if (!body || !thr) { console.warn('[inventoryValuation] #ivAlert* not found'); return; }
  body.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-400">불러오는 중...</td></tr>';
  try {
    var res = await axios.get('/api/inventory-valuation/price-alerts?threshold=' + (parseFloat(thr.value) || 20));
    if (!res.data || !res.data.success) throw new Error('bad response');
    var alerts = (res.data.data || {}).alerts || [];
    if (!alerts.length) {
      body.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-400">기준 이상 벌어진 품목이 없습니다</td></tr>';
      return;
    }
    body.innerHTML = alerts.map(function (a) {
      var spread = (a.entities || []).map(function (e) {
        return escapeHtml(e.entity_name || '') + ' <span class="text-gray-500">' + Number(e.avg_price || 0).toLocaleString() + '</span>';
      }).join(' · ');
      return '<tr>'
        + '<td class="px-4 py-2">' + escapeHtml(a.item_code || '') + ' <span class="text-gray-500">' + escapeHtml(a.item_name || '') + '</span></td>'
        + '<td class="px-3 py-2 text-right font-medium text-amber-700">' + a.max_diff_pct + '%</td>'
        + '<td class="px-4 py-2 text-gray-600">' + spread + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    console.warn('[inventoryValuation] 단가차이 로드 실패', e);
    body.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-400">불러오지 못했습니다</td></tr>';
  }
}
