// Skeleton loading
(function() {
  var el = document.getElementById('ppTableBody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 9);
})();

var paramCount = 0;
var allSubcats = [];
var MARGIN_MAX = 15;

async function loadSubcats() {
    if (allSubcats.length > 0) return allSubcats;
    const res = await axios.get('/api/post-processing/subcategories');
    allSubcats = res.data.data || [];
    return allSubcats;
}

function renderSubcatCheckboxes(selectedIds = []) {
    const container = document.getElementById('subcatCheckboxes');
    if (allSubcats.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400">소분류 없음</p>';
        return;
    }
    const groups = {};
    allSubcats.forEach(s => {
        if (!groups[s.group_name]) groups[s.group_name] = [];
        groups[s.group_name].push(s);
    });
    container.innerHTML = Object.entries(groups).map(([group, items]) => `
        <div>
            <p class="text-xs font-semibold text-gray-500 mb-1">${group}</p>
            <div class="flex flex-wrap gap-3">
                ${items.map(s => `
                    <label class="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="checkbox" class="subcat-check h-4 w-4" value="${s.id}" ${selectedIds.includes(s.id) ? 'checked' : ''}>
                        <span>${s.subcat_name}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function loadList() {
    try {
        const res = await axios.get('/api/post-processing');
        const list = res.data.data || [];
        const tbody = document.getElementById('ppTableBody');
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-12"><div class="flex flex-col items-center"><i class="fas fa-cogs text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">등록된 후가공이 없습니다</p></div></td></tr>';
            return;
        }
        tbody.innerHTML = list.map(p => {
            const schema = p.parameter_schema ? JSON.parse(p.parameter_schema) : null;
            const paramSummary = schema ? schema.fields.map(f => f.label).join(', ') : '-';
            const pricingMap = { fixed: '고정', per_count: '개수×단가', per_length: 'cm×단가', per_area: '면적×단가', per_sqm: '면적×단가', per_meter: '둘레×단가', per_unit: '수량×단가' };
            const priceInfo = p.pricing_type === 'fixed'
                ? `${(p.additional_cost||0).toLocaleString()}원`
                : `단가 ${(p.unit_price||0).toLocaleString()}원`;
            const margins = [p.margin_top||0, p.margin_bottom||0, p.margin_left||0, p.margin_right||0];
            const hasMargin = margins.some(m => m > 0);
            const subcatNames = p.subcategory_names
                ? p.subcategory_names.split(',').map(n => `<span class="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs mr-1 mb-1">${n}</span>`).join('')
                : '<span class="text-gray-400 text-xs">미지정</span>';
            return `<tr class="border-b hover:bg-gray-50 ${p.is_active ? '' : 'opacity-50'}">
                <td class="px-4 py-3 font-mono text-xs text-gray-600">${p.option_code}</td>
                <td class="px-4 py-3 font-medium">${p.option_name}</td>
                <td class="px-4 py-3 text-sm tabular-nums">${pricingMap[p.pricing_type]||'-'}<br><span class="text-gray-500 text-xs">${priceInfo}</span></td>
                <td class="px-4 py-3 text-sm text-gray-600">${paramSummary}</td>
                <td class="px-4 py-3 text-sm">${hasMargin ? margins.join(' / ')+' cm' : '-'}</td>
                <td class="px-4 py-3 text-sm">${subcatNames}</td>
                <td class="px-4 py-3 text-center">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}">
                        <i class="${p.is_active ? 'fas fa-check-circle' : 'fas fa-times-circle'} text-[7px] mr-1"></i>${p.is_active ? '활성' : '비활성'}
                    </span>
                </td>
                <td class="px-4 py-3 text-center">
                    <button onclick="toggleDisplayOnCard(${p.id}, ${p.display_on_card ? 0 : 1})" class="px-2 py-1 text-xs rounded ${p.display_on_card !== 0 ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}" title="${p.display_on_card !== 0 ? '카드에 표시됨 (클릭하여 숨김)' : '카드에서 숨김 (클릭하여 표시)'}">
                        <i class="fas ${p.display_on_card !== 0 ? 'fa-eye' : 'fa-eye-slash'}"></i>
                    </button>
                </td>
                <td class="px-4 py-3 text-center">
                    <button onclick="openEditModal(${p.id})" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-200 mr-1">수정</button>
                    ${p.is_active
                        ? `<button onclick="deactivate(${p.id})" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-200">비활성화</button>`
                        : `<button onclick="activate(${p.id})" class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">활성화</button>`
                    }
                </td>
            </tr>`;
        }).join('');
    } catch(e) {
        document.getElementById('ppTableBody').innerHTML = '<tr><td colspan="9" class="text-center py-12"><div class="flex flex-col items-center"><i class="fas fa-exclamation-circle text-4xl text-red-300 mb-3"></i><p class="text-red-500 text-sm">로딩 실패</p></div></td></tr>';
    }
}

function addParamField(data = {}) {
    paramCount++;
    const id = paramCount;
    document.getElementById('noParamsMsg').classList.add('hidden');
    const div = document.createElement('div');
    div.id = 'param_' + id;
    div.className = 'border rounded p-3 bg-gray-50 relative';
    div.innerHTML = `
        <button type="button" onclick="removeParam(${id})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 text-lg">&times;</button>
        <div class="grid grid-cols-2 gap-2 mb-2">
            <div>
                <label class="text-xs text-gray-600">내부 키 <span class="text-gray-400">(영문, 예: count)</span></label>
                <input type="text" placeholder="예: count" value="${data.key||''}" class="param-key w-full border rounded px-2 py-1 text-sm" oninput="this.value=this.value.replace(/[^a-z_]/g,'')">
            </div>
            <div>
                <label class="text-xs text-gray-600">화면 표시 이름 <span class="text-gray-400">(예: 개수)</span></label>
                <input type="text" placeholder="예: 개수" value="${data.label||''}" class="param-label w-full border rounded px-2 py-1 text-sm">
            </div>
            <div>
                <label class="text-xs text-gray-600">입력 방식</label>
                <select class="param-type w-full border rounded px-2 py-1 text-sm" onchange="onParamTypeChange(this, ${id})">
                    <option value="number" ${data.type==='number'?'selected':''}>숫자 입력</option>
                    <option value="select" ${data.type==='select'?'selected':''}>목록 선택</option>
                    <option value="toggle" ${data.type==='toggle'?'selected':''}>예/아니오</option>
                </select>
            </div>
            <div>
                <label class="text-xs text-gray-600">단위 <span class="text-gray-400">(선택, 예: 개)</span></label>
                <input type="text" placeholder="예: 개, cm" value="${data.unit||''}" class="param-unit w-full border rounded px-2 py-1 text-sm">
            </div>
        </div>
        <div id="selectOptions_${id}" class="${data.type==='select'?'':'hidden'} mb-2">
            <label class="text-xs text-gray-600">선택 목록 <span class="text-gray-400">(쉼표로 구분, 예: 사방,상,하,좌,우)</span></label>
            <input type="text" placeholder="예: 사방,상,하,좌,우" value="${(data.options||[]).join(',')}" class="param-options w-full border rounded px-2 py-1 text-sm">
        </div>
        <div class="grid grid-cols-2 gap-2">
            <div>
                <label class="text-xs text-gray-600">기본값</label>
                <input type="text" placeholder="" value="${data.default!==undefined?data.default:''}" class="param-default w-full border rounded px-2 py-1 text-sm">
            </div>
            <div>
                <label class="text-xs text-gray-600">최솟값 <span class="text-gray-400">(숫자 입력 시)</span></label>
                <input type="number" value="${data.min!==undefined?data.min:0}" class="param-min w-full border rounded px-2 py-1 text-sm">
            </div>
        </div>
    `;
    document.getElementById('paramFields').appendChild(div);
}

function removeParam(id) {
    document.getElementById('param_' + id).remove();
    if (document.querySelectorAll('#paramFields > div').length === 0) {
        document.getElementById('noParamsMsg').classList.remove('hidden');
    }
}

function onParamTypeChange(sel, id) {
    const el = document.getElementById('selectOptions_' + id);
    el.classList.toggle('hidden', sel.value !== 'select');
}

function collectSchema() {
    const rows = document.querySelectorAll('#paramFields > div[id^="param_"]');
    if (rows.length === 0) return null;
    const fields = [];
    rows.forEach(row => {
        const key = row.querySelector('.param-key').value.trim();
        const label = row.querySelector('.param-label').value.trim();
        const type = row.querySelector('.param-type').value;
        if (!key || !label) return;
        const field = { key, label, type };
        const unit = row.querySelector('.param-unit').value.trim();
        if (unit) field.unit = unit;
        const def = row.querySelector('.param-default').value.trim();
        if (def !== '') field.default = type === 'number' ? parseFloat(def) : def;
        if (type === 'number') {
            const min = row.querySelector('.param-min').value;
            if (min !== '') field.min = parseFloat(min);
        }
        if (type === 'select') {
            const opts = row.querySelector('.param-options').value.split(',').map(s => s.trim()).filter(Boolean);
            field.options = opts;
            if (!field.default && opts.length > 0) field.default = opts[0];
        }
        fields.push(field);
    });
    return fields.length > 0 ? { fields } : null;
}

function onPricingTypeChange() {
    const t = document.getElementById('fPricingType').value;
    if (t === 'fixed') document.getElementById('priceLabel').textContent = '추가 금액 (원)';
    else if (t === 'per_count') document.getElementById('priceLabel').textContent = '개당 단가 (원)';
    else if (t === 'per_length') document.getElementById('priceLabel').textContent = 'cm당 단가 (원)';
    else if (t === 'per_sqm') document.getElementById('priceLabel').textContent = 'sqm당 단가 (원)';
    else if (t === 'per_meter') document.getElementById('priceLabel').textContent = 'm당 단가 (원)';
    else if (t === 'per_unit') document.getElementById('priceLabel').textContent = '개당 단가 (원)';
    else document.getElementById('priceLabel').textContent = '단위 단가 (원)';
}

var PRESETS = {
    HOLE_PUNCH: { code:'HOLE_PUNCH', name:'타공', pricingType:'per_count', price:0,
        marginTop:0, marginBottom:0, marginLeft:0, marginRight:0,
        params:[
            { key:'position', label:'위치', type:'select', options:['사방','상','하','좌','우','사방+중간'], default:'사방' },
            { key:'count', label:'개수', type:'number', unit:'개', default:4, min:1 }
        ]},
    STRAP_LOOP: { code:'STRAP_LOOP', name:'끈고리', pricingType:'per_count', price:0,
        marginTop:0, marginBottom:0, marginLeft:0, marginRight:0,
        params:[
            { key:'position', label:'위치', type:'select', options:['상','하','좌','우','사방'], default:'상' },
            { key:'count', label:'개수', type:'number', unit:'개', default:2, min:1 }
        ]},
    MARGIN_ADD: { code:'MARGIN_ADD', name:'여백추가', pricingType:'per_length', price:0,
        marginTop:3, marginBottom:3, marginLeft:2, marginRight:2,
        params:[]},
    DOMBO_MARK: { code:'DOMBO_MARK', name:'돔보마크', pricingType:'fixed', price:0,
        marginTop:0, marginBottom:0, marginLeft:0, marginRight:0,
        params:[]},
    CUT_LINE: { code:'CUT_LINE', name:'재단라인', pricingType:'fixed', price:0,
        marginTop:0, marginBottom:0, marginLeft:0, marginRight:0,
        params:[]}
};

function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    document.getElementById('fCode').value = p.code;
    document.getElementById('fCode').readOnly = false;
    document.getElementById('fName').value = p.name;
    document.getElementById('fDesc').value = '';
    document.getElementById('fPricingType').value = p.pricingType;
    document.getElementById('fPrice').value = p.price;
    document.getElementById('fMarginTop').value = p.marginTop;
    document.getElementById('fMarginBottom').value = p.marginBottom;
    document.getElementById('fMarginLeft').value = p.marginLeft;
    document.getElementById('fMarginRight').value = p.marginRight;
    document.getElementById('paramFields').innerHTML = '';
    document.getElementById('noParamsMsg').classList.toggle('hidden', p.params.length > 0);
    paramCount = 0;
    p.params.forEach(f => addParamField(f));
    onPricingTypeChange();
}

async function openAddModal() {
    document.getElementById('modalTitle').textContent = '후가공 추가';
    document.getElementById('editId').value = '';
    document.getElementById('fCode').value = '';
    document.getElementById('fCode').readOnly = false;
    document.getElementById('fName').value = '';
    document.getElementById('fDesc').value = '';
    document.getElementById('fPricingType').value = 'fixed';
    document.getElementById('fPrice').value = '0';
    document.getElementById('fMarginTop').value = '0';
    document.getElementById('fMarginBottom').value = '0';
    document.getElementById('fMarginLeft').value = '0';
    document.getElementById('fMarginRight').value = '0';
    document.getElementById('paramFields').innerHTML = '';
    document.getElementById('noParamsMsg').classList.remove('hidden');
    paramCount = 0;
    onPricingTypeChange();
    document.getElementById('presetSection').classList.remove('hidden');
    await loadSubcats();
    renderSubcatCheckboxes([]);
    document.getElementById('ppModal').classList.remove('hidden');
}

async function openEditModal(id) {
    try {
        const [listRes, subcatRes] = await Promise.all([
            axios.get('/api/post-processing'),
            axios.get('/api/post-processing/' + id + '/subcategories')
        ]);
        const item = (listRes.data.data || []).find(p => p.id === id);
        if (!item) return;

        document.getElementById('presetSection').classList.add('hidden');
        document.getElementById('modalTitle').textContent = '후가공 수정';
        document.getElementById('editId').value = id;
        document.getElementById('fCode').value = item.option_code;
        document.getElementById('fCode').readOnly = true;
        document.getElementById('fName').value = item.option_name;
        document.getElementById('fDesc').value = item.description || '';
        document.getElementById('fPricingType').value = item.pricing_type || 'fixed';
        document.getElementById('fPrice').value = item.pricing_type === 'fixed'
            ? (item.additional_cost || 0) : (item.unit_price || 0);
        document.getElementById('fMarginTop').value = item.margin_top || 0;
        document.getElementById('fMarginBottom').value = item.margin_bottom || 0;
        document.getElementById('fMarginLeft').value = item.margin_left || 0;
        document.getElementById('fMarginRight').value = item.margin_right || 0;

        document.getElementById('paramFields').innerHTML = '';
        document.getElementById('noParamsMsg').classList.remove('hidden');
        paramCount = 0;
        if (item.parameter_schema) {
            const schema = JSON.parse(item.parameter_schema);
            (schema.fields || []).forEach(f => addParamField(f));
        }
        onPricingTypeChange();

        await loadSubcats();
        const selectedIds = (subcatRes.data.data || []).map(s => s.id);
        renderSubcatCheckboxes(selectedIds);

        document.getElementById('ppModal').classList.remove('hidden');
    } catch(e) {
        showToast('불러오기 실패: ' + e.message, 'error');
    }
}

async function savePP() {
    const editId = document.getElementById('editId').value;
    const pricingType = document.getElementById('fPricingType').value;
    const price = parseFloat(document.getElementById('fPrice').value) || 0;
    const schema = collectSchema();
    const body = {
        option_code: document.getElementById('fCode').value.trim().toUpperCase(),
        option_name: document.getElementById('fName').value.trim(),
        description: document.getElementById('fDesc').value.trim() || null,
        pricing_type: pricingType,
        additional_cost: pricingType === 'fixed' ? price : 0,
        unit_price: pricingType !== 'fixed' ? price : 0,
        margin_top: parseFloat(document.getElementById('fMarginTop').value) || 0,
        margin_bottom: parseFloat(document.getElementById('fMarginBottom').value) || 0,
        margin_left: parseFloat(document.getElementById('fMarginLeft').value) || 0,
        margin_right: parseFloat(document.getElementById('fMarginRight').value) || 0,
        parameter_schema: schema ? JSON.stringify(schema) : null,
    };
    if (!body.option_code || !body.option_name) { showFieldError('fCode', '코드와 이름을 입력하세요.'); return; }
    var marginFields = [body.margin_top, body.margin_bottom, body.margin_left, body.margin_right];
    for (var i = 0; i < marginFields.length; i++) {
        if (marginFields[i] < 0) { showFieldError('fMarginTop', '여백은 0 이상이어야 합니다.'); return; }
        if (marginFields[i] > MARGIN_MAX) { showFieldError('fMarginTop', '여백은 ' + MARGIN_MAX + 'cm 이하여야 합니다.'); return; }
    }
    try {
        let savedId = editId;
        if (editId) {
            await axios.patch('/api/post-processing/' + editId, body);
        } else {
            const createRes = await axios.post('/api/post-processing', body);
            savedId = createRes.data.data?.id;
        }
        // 소분류 연결 저장
        const selectedSubcatIds = [...document.querySelectorAll('.subcat-check:checked')].map(el => parseInt(el.value));
        if (savedId) {
            await axios.put('/api/post-processing/' + savedId + '/subcategories', { subcat_ids: selectedSubcatIds });
        }
        closeModal();
        loadList();
    } catch(e) {
        showToast('저장 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

async function deactivate(id) {
    if (!(await showConfirm('비활성화하면 주문 시 선택 목록에서 숨겨집니다. 계속하시겠습니까?', { danger: true }))) return;
    try {
        await axios.delete('/api/post-processing/' + id);
        loadList();
    } catch(e) {
        showToast('비활성화 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

async function activate(id) {
    try {
        await axios.patch('/api/post-processing/' + id, { is_active: 1 });
        loadList();
    } catch(e) {
        showToast('활성화 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

async function toggleDisplayOnCard(id, newValue) {
    try {
        await axios.patch('/api/post-processing/' + id, { display_on_card: newValue });
        loadList();
        showToast(newValue ? '카드에 표시됩니다' : '카드에서 숨겨집니다', 'success');
    } catch(e) {
        showToast('변경 실패: ' + (e.response?.data?.error || e.message), 'error');
    }
}

function closeModal() {
    document.getElementById('ppModal').classList.add('hidden');
}

// ── 탭 전환 ─────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('[id^="panel-"]').forEach(function(el) { el.classList.add('hidden'); });
    document.querySelectorAll('[id^="tab-"]').forEach(function(el) {
        el.classList.remove('border-pink-600', 'text-pink-700');
        el.classList.add('border-transparent', 'text-gray-500');
    });
    document.getElementById('panel-' + tab).classList.remove('hidden');
    var tabBtn = document.getElementById('tab-' + tab);
    tabBtn.classList.remove('border-transparent', 'text-gray-500');
    tabBtn.classList.add('border-pink-600', 'text-pink-700');
    if (tab === 'stats') loadStats();
    if (tab === 'finishing') { loadFinishingTab(); }
}

// ── 통계 로딩 ────────────────────────────────────────────────
async function loadStats() {
    var months = document.getElementById('statsMonths').value;
    try {
        var res = await axios.get('/api/post-processing/stats?months=' + months);
        var d = res.data.data;
        renderTotalStats(d.totalStats || []);
        renderMonthlyChart(d.monthlyStats || [], parseInt(months));
        renderSubcatStats(d.subcatStats || []);
    } catch(e) {
        document.getElementById('totalStatsBody').innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">통계 로딩 실패</td></tr>';
    }
}

function renderTotalStats(stats) {
    var tbody = document.getElementById('totalStatsBody');
    if (stats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-12"><div class="flex flex-col items-center"><i class="fas fa-chart-bar text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">후가공 사용 데이터가 없습니다</p></div></td></tr>';
        return;
    }
    var totalUsage = stats.reduce(function(s, r) { return s + r.usage_count; }, 0);
    var colors = (window.CHART_BG_CLASSES || ['bg-blue-600', 'bg-green-600', 'bg-amber-500', 'bg-red-600', 'bg-purple-600', 'bg-pink-500', 'bg-cyan-500', 'bg-lime-500']);
    tbody.innerHTML = stats.map(function(r, i) {
        var pct = totalUsage > 0 ? (r.usage_count / totalUsage * 100) : 0;
        var area = r.total_area_sqm ? r.total_area_sqm.toFixed(1) : '0';
        return '<tr class="border-b hover:bg-gray-50">' +
            '<td class="px-4 py-2 font-medium">' + (r.pp_name || r.pp_code) + '</td>' +
            '<td class="px-4 py-2 text-right font-bold">' + r.usage_count.toLocaleString() + '건</td>' +
            '<td class="px-4 py-2 text-right">' + (r.total_qty || 0).toLocaleString() + '</td>' +
            '<td class="px-4 py-2 text-right">' + area + ' m\u00B2</td>' +
            '<td class="px-4 py-2 text-right">' + (r.order_count || 0).toLocaleString() + '</td>' +
            '<td class="px-4 py-2 text-right">' + (r.client_count || 0).toLocaleString() + '</td>' +
            '<td class="px-4 py-2"><div class="flex items-center gap-2"><div class="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">' +
            '<div class="' + colors[i % colors.length] + ' h-4 rounded-full" style="width:' + pct + '%"></div></div>' +
            '<span class="text-xs text-gray-600 w-12 text-right">' + pct.toFixed(1) + '%</span></div></td></tr>';
    }).join('');
}

function renderMonthlyChart(stats, months) {
    var container = document.getElementById('monthlyChart');
    if (stats.length === 0) {
        container.innerHTML = '<div class="text-center py-12"><i class="fas fa-calendar text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">월별 데이터가 없습니다</p></div>';
        return;
    }
    var byMonth = {};
    var ppCodes = [];
    stats.forEach(function(r) {
        if (!byMonth[r.month]) byMonth[r.month] = {};
        byMonth[r.month][r.pp_code] = r.usage_count;
        if (ppCodes.indexOf(r.pp_code) === -1) ppCodes.push(r.pp_code);
    });
    var monthKeys = Object.keys(byMonth).sort();
    var ppNameMap = {};
    stats.forEach(function(r) { ppNameMap[r.pp_code] = r.pp_name || r.pp_code; });
    var maxVal = 0;
    monthKeys.forEach(function(m) { ppCodes.forEach(function(c) { var v = byMonth[m][c] || 0; if (v > maxVal) maxVal = v; }); });
    var _cc = (window.CHART_COLORS || ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#9333ea', '#ec4899', '#06b6d4', '#84cc16']);
    var colorMap = { PUNCHING: _cc[0], ANNOTATION: _cc[1], HEAT_CUT: _cc[2], ROUND_WOOD: _cc[3], LINE_SEWING: _cc[4], GROMMET: _cc[5], WELDING: _cc[6] };
    var defaultColors = _cc.slice(0, 5);

    var legend = '<div class="flex flex-wrap gap-3 mb-3">' + ppCodes.map(function(c, i) {
        var col = colorMap[c] || defaultColors[i % defaultColors.length];
        return '<span class="flex items-center gap-1 text-xs"><span class="w-3 h-3 rounded" style="background:' + col + '"></span>' + (ppNameMap[c] || c) + '</span>';
    }).join('') + '</div>';

    var chart = '<table class="w-full text-sm"><tbody>' + monthKeys.map(function(m) {
        var bars = ppCodes.map(function(c, i) {
            var v = byMonth[m][c] || 0;
            if (v === 0) return '';
            var w = maxVal > 0 ? Math.max(v / maxVal * 100, 2) : 0;
            var col = colorMap[c] || defaultColors[i % defaultColors.length];
            return '<div class="h-5 rounded-sm inline-block mr-0.5 relative group" style="width:' + w + '%;background:' + col + '" title="' + (ppNameMap[c]||c) + ': ' + v + '\uAC74">' +
                '<span class="absolute inset-0 flex items-center justify-center text-white text-xs font-bold" style="font-size:10px">' + (v > 0 ? v : '') + '</span></div>';
        }).join('');
        return '<tr class="border-b"><td class="px-2 py-2 text-gray-600 whitespace-nowrap w-20">' + m + '</td><td class="px-2 py-2"><div class="flex">' + bars + '</div></td></tr>';
    }).join('') + '</tbody></table>';

    container.innerHTML = legend + chart;
}

function renderSubcatStats(stats) {
    var container = document.getElementById('subcatStatsBody');
    if (stats.length === 0) {
        container.innerHTML = '<div class="text-center py-12"><i class="fas fa-folder-open text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 text-sm">소분류별 데이터가 없습니다</p></div>';
        return;
    }
    var bySubcat = {};
    stats.forEach(function(r) {
        var key = r.subcategory || '(\uBBF8\uBD84\uB958)';
        if (!bySubcat[key]) bySubcat[key] = [];
        bySubcat[key].push(r);
    });
    container.innerHTML = Object.entries(bySubcat).map(function(entry) {
        var subcat = entry[0], items = entry[1];
        var total = items.reduce(function(s, r) { return s + r.usage_count; }, 0);
        var bars = items.map(function(r) {
            var pct = total > 0 ? (r.usage_count / total * 100) : 0;
            return '<div class="flex items-center gap-2 text-sm">' +
                '<span class="w-20 text-gray-600 text-right">' + (r.pp_name || r.pp_code) + '</span>' +
                '<div class="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden"><div class="bg-pink-400 h-3 rounded-full" style="width:' + pct + '%"></div></div>' +
                '<span class="text-xs text-gray-500 w-16">' + r.usage_count + '\uAC74 (' + pct.toFixed(0) + '%)</span></div>';
        }).join('');
        return '<div class="border rounded-lg p-3"><div class="flex items-center gap-2 mb-2"><span class="font-medium text-gray-800">' + subcat + '</span><span class="text-xs text-gray-500">\uCD1D ' + total + '\uAC74</span></div>' + bars + '</div>';
    }).join('');
}

// ========== 마감 방식 ==========
var finishingMethods = [];
var finishingPresets = [];

// ========== 마감 방식 탭 ==========
var finMethods = [];
var finPresets = [];

function loadFinishingTab() {
    loadFinMethods();
    loadFinPresets();
}

function loadFinMethods() {
    axios.get('/api/finishing/methods').then(function(res) {
        finMethods = res.data.data || [];
        var html = '';
        finMethods.forEach(function(m) {
            html += '<div class="flex items-center justify-between p-3 border rounded hover:bg-gray-50">'
                + '<div><span class="font-semibold">' + escapeHtml(m.name) + '</span>'
                + '<span class="ml-2 text-sm text-blue-600 font-mono font-bold">' + m.margin_cm + 'cm</span>'
                + (m.description ? '<span class="ml-2 text-xs text-gray-400">' + escapeHtml(m.description) + '</span>' : '')
                + '</div><div class="flex gap-1">'
                + '<button onclick="editFinMethod(' + m.id + ')" class="text-blue-500 hover:text-blue-700 px-2"><i class="fas fa-edit"></i></button>'
                + '<button onclick="delFinMethod(' + m.id + ')" class="text-red-400 hover:text-red-600 px-2"><i class="fas fa-trash"></i></button>'
                + '</div></div>';
        });
        document.getElementById('finMethodList').innerHTML = html || '<div class="text-center py-4 text-gray-400 text-sm">없음</div>';
    });
}

function loadFinPresets() {
    axios.get('/api/finishing/presets').then(function(res) {
        finPresets = res.data.data || [];
        var html = '';
        finPresets.forEach(function(p) {
            var c = typeof p.config === 'string' ? JSON.parse(p.config) : p.config;
            html += '<div class="flex items-center justify-between p-3 border rounded hover:bg-gray-50">'
                + '<div><span class="font-semibold">' + escapeHtml(p.name) + '</span>'
                + '<div class="text-xs text-gray-500 mt-0.5">상:' + (c.top||'-') + ' 하:' + (c.bottom||'-') + ' 좌:' + (c.left||'-') + ' 우:' + (c.right||'-') + '</div>'
                + '</div><div class="flex gap-1">'
                + '<button onclick="editFinPreset(' + p.id + ')" class="text-blue-500 hover:text-blue-700 px-2"><i class="fas fa-edit"></i></button>'
                + '<button onclick="delFinPreset(' + p.id + ')" class="text-red-400 hover:text-red-600 px-2"><i class="fas fa-trash"></i></button>'
                + '</div></div>';
        });
        document.getElementById('finPresetList').innerHTML = html || '<div class="text-center py-4 text-gray-400 text-sm">없음</div>';
    });
}

window.showFinMethodModal = function(id) {
    var m = id ? finMethods.find(function(x) { return x.id === id; }) : null;
    document.getElementById('finMethodTitle').textContent = m ? '수정' : '추가';
    document.getElementById('finMethodId').value = m ? m.id : '';
    document.getElementById('finMethodName').value = m ? m.name : '';
    document.getElementById('finMethodMargin').value = m ? m.margin_cm : 0;
    document.getElementById('finMethodDesc').value = m ? (m.description || '') : '';
    document.getElementById('finMethodModal').classList.remove('hidden');
};
window.editFinMethod = function(id) { showFinMethodModal(id); };

window.saveFinMethod = async function() {
    var id = document.getElementById('finMethodId').value;
    var data = { name: document.getElementById('finMethodName').value.trim(), margin_cm: parseFloat(document.getElementById('finMethodMargin').value) || 0, description: document.getElementById('finMethodDesc').value.trim() || null };
    if (!data.name) { showToast('이름 필수', 'warning'); return; }
    try {
        if (id) await axios.put('/api/finishing/methods/' + id, data);
        else await axios.post('/api/finishing/methods', data);
        document.getElementById('finMethodModal').classList.add('hidden');
        showToast('저장 완료', 'success'); loadFinMethods();
    } catch(e) { showToast(e.response?.data?.error || '실패', 'error'); }
};

window.delFinMethod = async function(id) {
    if (!(await showConfirm('삭제하시겠습니까?', { danger: true }))) return;
    await axios.delete('/api/finishing/methods/' + id); showToast('삭제', 'success'); loadFinMethods();
};

window.showFinPresetModal = function(id) {
    var p = id ? finPresets.find(function(x) { return x.id === id; }) : null;
    var c = p ? (typeof p.config === 'string' ? JSON.parse(p.config) : p.config) : {};
    var opts = '<option value="">선택</option>' + finMethods.map(function(m) { return '<option value="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + ' (' + m.margin_cm + 'cm)</option>'; }).join('');
    ['finPreTop','finPreBot','finPreLeft','finPreRight'].forEach(function(sel) { document.getElementById(sel).innerHTML = opts; });
    document.getElementById('finPresetTitle').textContent = p ? '수정' : '추가';
    document.getElementById('finPresetId').value = p ? p.id : '';
    document.getElementById('finPresetName').value = p ? p.name : '';
    document.getElementById('finPreTop').value = c.top || '';
    document.getElementById('finPreBot').value = c.bottom || '';
    document.getElementById('finPreLeft').value = c.left || '';
    document.getElementById('finPreRight').value = c.right || '';
    document.getElementById('finPresetModal').classList.remove('hidden');
};
window.editFinPreset = function(id) { showFinPresetModal(id); };
window.finPreApplyAll = function() { var v = document.getElementById('finPreTop').value; ['finPreBot','finPreLeft','finPreRight'].forEach(function(id) { document.getElementById(id).value = v; }); };

window.saveFinPreset = async function() {
    var id = document.getElementById('finPresetId').value;
    var name = document.getElementById('finPresetName').value.trim();
    var config = { top: document.getElementById('finPreTop').value, bottom: document.getElementById('finPreBot').value, left: document.getElementById('finPreLeft').value, right: document.getElementById('finPreRight').value };
    if (!name) { showToast('이름 필수', 'warning'); return; }
    try {
        if (id) await axios.put('/api/finishing/presets/' + id, { name: name, config: config });
        else await axios.post('/api/finishing/presets', { name: name, config: config });
        document.getElementById('finPresetModal').classList.add('hidden');
        showToast('저장 완료', 'success'); loadFinPresets();
    } catch(e) { showToast('실패', 'error'); }
};

window.delFinPreset = async function(id) {
    if (!(await showConfirm('삭제하시겠습니까?', { danger: true }))) return;
    await axios.delete('/api/finishing/presets/' + id); showToast('삭제', 'success'); loadFinPresets();
};

loadList();
