// ============================================================================
// BOM/MRP 프론트엔드
// ============================================================================

var bomData = [];
var categoriesList = [];
var materialsList = [];
var mrpRuns = [];

// ─── 초기화 ────────────────────────────────────────────────────────────────────

async function initBom() {
  setupTabs();
  await Promise.all([loadCategories(), loadMaterials()]);
  await loadBom();
  await loadMrpRuns();
}

function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('bg-blue-600', 'text-white'));
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.add('bg-gray-200', 'text-gray-700'));
      btn.classList.remove('bg-gray-200', 'text-gray-700');
      btn.classList.add('bg-blue-600', 'text-white');
      document.querySelectorAll('.tab-content').forEach(p => p.classList.add('hidden'));
      document.getElementById('tab-' + btn.dataset.tab)?.classList.remove('hidden');
    });
  });
}

// ─── 데이터 로드 ──────────────────────────────────────────────────────────────

async function loadCategories() {
  try {
    const res = await axios.get('/api/bom/categories');
    categoriesList = res.data.data || [];
  } catch (e) { console.error(e); }
}

async function loadMaterials() {
  try {
    const res = await axios.get('/api/bom/materials');
    materialsList = res.data.data || [];
  } catch (e) { console.error(e); }
}

async function loadBom() {
  try {
    const res = await axios.get('/api/bom');
    bomData = res.data.data || [];
    renderBomTable();
  } catch (e) { console.error(e); }
}

async function loadMrpRuns() {
  try {
    const res = await axios.get('/api/bom/mrp/runs');
    mrpRuns = res.data.data || [];
    renderMrpHistory();
  } catch (e) { console.error(e); }
}

// ─── BOM 테이블 ──────────────────────────────────────────────────────────────

function renderBomTable() {
  const tbody = document.getElementById('bom-tbody');
  if (!tbody) return;

  if (bomData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">등록된 BOM 항목이 없습니다.</td></tr>';
    return;
  }

  // 카테고리별 그룹핑
  const groups = {};
  bomData.forEach(b => {
    const key = b.category_name || (b.item_display_name ? `품목: ${b.item_display_name}` : '미분류');
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  let html = '';
  Object.entries(groups).forEach(([group, items]) => {
    html += `<tr class="bg-gray-50"><td colspan="7" class="px-4 py-2 font-semibold text-gray-700">
      <i class="fas fa-folder-open mr-2 text-blue-500"></i>${group} (${items.length}건)</td></tr>`;
    items.forEach(b => {
      html += `<tr class="hover:bg-blue-50 border-b">
        <td class="px-4 py-2 text-sm">${b.category_name || '-'}</td>
        <td class="px-4 py-2 text-sm">${b.item_display_name || '-'}</td>
        <td class="px-4 py-2 text-sm font-medium">${b.material_name}</td>
        <td class="px-4 py-2 text-sm text-right">${b.usage_per_sqm?.toFixed(3) || '0'}</td>
        <td class="px-4 py-2 text-sm text-center">${b.usage_unit}</td>
        <td class="px-4 py-2 text-sm text-right">${((b.waste_factor - 1) * 100).toFixed(1)}%</td>
        <td class="px-4 py-2 text-sm text-center">
          <button onclick="openBomEditModal(${b.id})" class="text-blue-600 hover:text-blue-700 mr-2" title="수정"><i class="fas fa-edit"></i></button>
          <button onclick="deleteBom(${b.id})" class="text-red-600 hover:text-red-700" title="삭제"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    });
  });
  tbody.innerHTML = html;
}

// ─── BOM 추가/수정 모달 ───────────────────────────────────────────────────────

function openBomAddModal() {
  const existing = document.getElementById('bom-modal');
  if (existing) existing.remove();

  const catOptions = categoriesList.map(c => `<option value="${c.category_name}">${c.category_name}</option>`).join('');
  const matOptions = materialsList.map(m => `<option value="${m.id}" data-name="${m.item_name}">${m.item_name} (재고: ${m.quantity || 0})</option>`).join('');

  const html = `<div id="bom-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold">BOM 항목 추가</h3>
        <button onclick="document.getElementById('bom-modal').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
      </div>
      <form id="bom-form" onsubmit="saveBom(event)">
        <input type="hidden" id="bom-id" value="">
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">적용 기준</label>
            <select id="bom-basis" onchange="toggleBomBasis()" class="w-full border rounded px-3 py-2 text-sm">
              <option value="category">카테고리 기준</option>
              <option value="item">품목 기준</option>
            </select>
          </div>
          <div id="bom-category-group">
            <label class="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            <select id="bom-category" class="w-full border rounded px-3 py-2 text-sm">
              <option value="">선택</option>${catOptions}
            </select>
          </div>
          <div id="bom-item-group" class="hidden">
            <label class="block text-sm font-medium text-gray-700 mb-1">품목 ID</label>
            <input type="number" id="bom-item-id" class="w-full border rounded px-3 py-2 text-sm" placeholder="품목 ID 입력">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">원재료</label>
            <select id="bom-material" class="w-full border rounded px-3 py-2 text-sm" onchange="updateMaterialName()">
              <option value="">선택</option>${matOptions}
            </select>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">m²당 사용량</label>
              <input type="number" id="bom-usage" step="0.001" class="w-full border rounded px-3 py-2 text-sm" value="0">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">단위</label>
              <select id="bom-unit" class="w-full border rounded px-3 py-2 text-sm">
                <option value="M">M (미터)</option>
                <option value="ML">ML (밀리리터)</option>
                <option value="EA">EA (개)</option>
                <option value="ROLL">ROLL (롤)</option>
                <option value="SHEET">SHEET (매)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">로스율 (%)</label>
              <input type="number" id="bom-waste" step="0.1" class="w-full border rounded px-3 py-2 text-sm" value="10">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">비고</label>
            <input type="text" id="bom-notes" class="w-full border rounded px-3 py-2 text-sm">
          </div>
        </div>
        <div class="flex justify-end mt-4 space-x-2">
          <button type="button" onclick="document.getElementById('bom-modal').remove()" class="px-4 py-2 bg-gray-200 rounded text-sm">취소</button>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded text-sm">저장</button>
        </div>
      </form>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function toggleBomBasis() {
  const basis = document.getElementById('bom-basis').value;
  document.getElementById('bom-category-group').classList.toggle('hidden', basis !== 'category');
  document.getElementById('bom-item-group').classList.toggle('hidden', basis !== 'item');
}

function updateMaterialName() {
  const sel = document.getElementById('bom-material');
  const opt = sel.options[sel.selectedIndex];
  // material_name stored in data attribute
}

function openBomEditModal(id) {
  const item = bomData.find(b => b.id === id);
  if (!item) return;
  openBomAddModal();
  document.getElementById('bom-id').value = id;
  document.querySelector('#bom-modal h3').textContent = 'BOM 항목 수정';

  if (item.item_id) {
    document.getElementById('bom-basis').value = 'item';
    toggleBomBasis();
    document.getElementById('bom-item-id').value = item.item_id;
  } else {
    document.getElementById('bom-basis').value = 'category';
    toggleBomBasis();
    document.getElementById('bom-category').value = item.category_name || '';
  }
  document.getElementById('bom-material').value = item.material_item_id;
  document.getElementById('bom-usage').value = item.usage_per_sqm;
  document.getElementById('bom-unit').value = item.usage_unit;
  document.getElementById('bom-waste').value = ((item.waste_factor - 1) * 100).toFixed(1);
  document.getElementById('bom-notes').value = item.notes || '';
}

async function saveBom(e) {
  e.preventDefault();
  const id = document.getElementById('bom-id').value;
  const basis = document.getElementById('bom-basis').value;
  const matSel = document.getElementById('bom-material');
  const matOpt = matSel.options[matSel.selectedIndex];

  const data = {
    item_id: basis === 'item' ? Number(document.getElementById('bom-item-id').value) || null : null,
    category_name: basis === 'category' ? document.getElementById('bom-category').value || null : null,
    material_item_id: Number(matSel.value),
    material_name: matOpt?.dataset?.name || matOpt?.textContent?.split(' (')[0] || '',
    usage_per_sqm: Number(document.getElementById('bom-usage').value) || 0,
    usage_unit: document.getElementById('bom-unit').value,
    waste_factor: 1 + (Number(document.getElementById('bom-waste').value) || 0) / 100,
    notes: document.getElementById('bom-notes').value || null,
  };

  try {
    if (id) {
      await axios.put('/api/bom/' + id, data);
    } else {
      await axios.post('/api/bom', data);
    }
    document.getElementById('bom-modal').remove();
    await loadBom();
    showToast(id ? 'BOM 항목이 수정되었습니다.' : 'BOM 항목이 추가되었습니다.');
  } catch (e) {
    showToast(e.response?.data?.error || '저장 실패', 'error');
  }
}

async function deleteBom(id) {
  if (!(await showConfirm('이 BOM 항목을 삭제하시겠습니까?', { danger: true }))) return;
  try {
    await axios.delete('/api/bom/' + id);
    await loadBom();
    showToast('BOM 항목이 삭제되었습니다.');
  } catch (e) {
    showToast('삭제 실패', 'error');
  }
}

// ─── MRP 실행 ─────────────────────────────────────────────────────────────────

function openMrpRunModal() {
  const existing = document.getElementById('mrp-modal');
  if (existing) existing.remove();

  const today = new Date().toISOString().slice(0, 10);
  const html = `<div id="mrp-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold">MRP 실행</h3>
        <button onclick="document.getElementById('mrp-modal').remove()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
      </div>
      <div class="space-y-3">
        <div class="p-3 bg-blue-50 rounded text-sm text-blue-700">
          <i class="fas fa-info-circle mr-1"></i> 확정/생산중 주문의 품목을 BOM 기준으로 원재료 소요량을 계산합니다.
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">시작일</label>
            <input type="date" id="mrp-from" class="w-full border rounded px-3 py-2 text-sm" value="${today}">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">종료일</label>
            <input type="date" id="mrp-to" class="w-full border rounded px-3 py-2 text-sm">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">특정 주문 ID (선택)</label>
          <input type="number" id="mrp-order-id" class="w-full border rounded px-3 py-2 text-sm" placeholder="비우면 전체 대상">
        </div>
      </div>
      <div class="flex justify-end mt-4 space-x-2">
        <button onclick="document.getElementById('mrp-modal').remove()" class="px-4 py-2 bg-gray-200 rounded text-sm">취소</button>
        <button onclick="executeMrp()" class="px-4 py-2 bg-green-600 text-white rounded text-sm"><i class="fas fa-play mr-1"></i>실행</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function executeMrp() {
  const data = {
    date_from: document.getElementById('mrp-from')?.value || null,
    date_to: document.getElementById('mrp-to')?.value || null,
    order_id: document.getElementById('mrp-order-id')?.value || null,
    run_type: 'MANUAL',
  };

  try {
    const res = await axios.post('/api/bom/mrp/run', data);
    document.getElementById('mrp-modal')?.remove();
    const result = res.data.data;
    showToast(`MRP 실행 완료: 자재 ${result.totalMaterials}건, 부족 ${result.shortfallCount}건`);
    renderMrpResult(result);
    await loadMrpRuns();
  } catch (e) {
    showToast(e.response?.data?.error || 'MRP 실행 실패', 'error');
  }
}

function renderMrpResult(result) {
  const container = document.getElementById('mrp-result');
  if (!container) return;

  let html = `<div class="mb-4 p-3 bg-green-50 rounded border border-green-200">
    <div class="font-semibold text-green-700 mb-1"><i class="fas fa-check-circle mr-1"></i>실행 번호: ${result.runNumber}</div>
    <div class="text-sm text-green-700">전체 자재: ${result.totalMaterials}건 | 부족 자재: <span class="${result.shortfallCount > 0 ? 'text-red-600 font-bold' : ''}">${result.shortfallCount}건</span></div>
  </div>`;

  if (result.results.length > 0) {
    html += `<div class="overflow-x-auto"><table class="w-full text-sm">
      <thead><tr class="bg-gray-100 border-b">
        <th class="px-3 py-2 text-left">원재료</th>
        <th class="px-3 py-2 text-right">소요량</th>
        <th class="px-3 py-2 text-right">현재 재고</th>
        <th class="px-3 py-2 text-right">발주중</th>
        <th class="px-3 py-2 text-right">부족량</th>
      </tr></thead><tbody>`;

    result.results.forEach(r => {
      const isShort = r.shortfall > 0;
      html += `<tr class="${isShort ? 'bg-red-50' : ''} border-b">
        <td class="px-3 py-2 ${isShort ? 'font-semibold text-red-700' : ''}">${r.material_name}</td>
        <td class="px-3 py-2 text-right">${r.required_quantity.toFixed(2)}</td>
        <td class="px-3 py-2 text-right">${r.current_stock.toFixed(2)}</td>
        <td class="px-3 py-2 text-right">${r.on_order_quantity.toFixed(2)}</td>
        <td class="px-3 py-2 text-right ${isShort ? 'text-red-600 font-bold' : 'text-green-600'}">${isShort ? r.shortfall.toFixed(2) : '충분'}</td>
      </tr>`;
    });

    html += `</tbody></table></div>`;

    if (result.shortfallCount > 0) {
      html += `<div class="mt-3 text-right">
        <button onclick="createPrFromMrp(${result.runId})" class="px-4 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600">
          <i class="fas fa-shopping-cart mr-1"></i>부족 자재 발주 요청 생성
        </button>
      </div>`;
    }
  } else {
    html += `<div class="text-center py-4 text-gray-500">해당 조건의 주문이 없거나 BOM이 등록되지 않았습니다.</div>`;
  }

  container.innerHTML = html;
}

async function createPrFromMrp(runId) {
  if (!(await showConfirm('부족 자재에 대한 발주 요청(PR)을 자동 생성하시겠습니까?'))) return;
  try {
    const res = await axios.post(`/api/bom/mrp/runs/${runId}/create-pr`);
    const data = res.data.data;
    showToast(`발주 요청 ${data.requestNumber} 생성 완료 (${data.itemCount}건)`);
    await loadMrpRuns();
  } catch (e) {
    showToast(e.response?.data?.error || 'PR 생성 실패', 'error');
  }
}

// ─── MRP 이력 ─────────────────────────────────────────────────────────────────

function renderMrpHistory() {
  const tbody = document.getElementById('mrp-history-tbody');
  if (!tbody) return;

  if (mrpRuns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-gray-500">실행 이력이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = mrpRuns.map(r => `<tr class="hover:bg-blue-50 border-b">
    <td class="px-3 py-2 text-sm font-mono">${r.run_number}</td>
    <td class="px-3 py-2 text-sm"><span class="px-2 py-0.5 rounded text-xs ${r.run_type === 'AUTO' ? 'bg-green-50 text-green-700' : r.run_type === 'ORDER' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-800'}">${r.run_type}</span></td>
    <td class="px-3 py-2 text-sm text-right">${r.total_materials || 0}</td>
    <td class="px-3 py-2 text-sm text-right ${r.shortfall_count > 0 ? 'text-red-600 font-bold' : 'text-green-600'}">${r.shortfall_count || 0}</td>
    <td class="px-3 py-2 text-sm">${r.run_by_name || '-'}</td>
    <td class="px-3 py-2 text-sm">${new Date(r.created_at).toLocaleString('ko-KR')}</td>
    <td class="px-3 py-2 text-sm text-center">
      <button onclick="viewMrpDetail(${r.id})" class="text-blue-600 hover:text-blue-700" title="상세"><i class="fas fa-search"></i></button>
    </td>
  </tr>`).join('');
}

async function viewMrpDetail(runId) {
  try {
    const res = await axios.get(`/api/bom/mrp/runs/${runId}`);
    const { run, results } = res.data.data;
    renderMrpResult({
      runId: run.id,
      runNumber: run.run_number,
      results,
      totalMaterials: run.total_materials,
      shortfallCount: run.shortfall_count,
    });
    // MRP 실행 탭으로 전환
    document.querySelector('[data-tab="mrp"]')?.click();
  } catch (e) {
    showToast('조회 실패', 'error');
  }
}

// 페이지 로드
document.addEventListener('DOMContentLoaded', initBom);
