// 품목 단위표 편집기 (item_units, 2026-09-17) — spec docs/superpowers/specs/2026-09-17-item-units.md
// 한 품목의 단위 줄(기본단위 1 + 환산 단위 N)을 표로 편집한다. 저장 = PUT /api/items/:id/units.
// items.unit(발주·입고 단위)은 이 표의 「발주·입고」 역할 행에서 파생된다 — 숨은 #itemUnit 에 그 값을 비춘다(saveItem 이 읽는다).
// ⚠️ ?raw concat 전역 — 식별자는 전부 itemUnits 접두.

var _itemUnits = [];      // [{unit, factor, is_base, role_purchase, role_sales, role_count}]
var _itemUnitsDirty = false;
var _itemUnitsItemCode = '';

var ITEM_UNITS_PRESETS = ['EA', '장', '단', '조', '롤', 'M', 'yd', 'cm', 'L', '통', 'BOX', '세트', '㎡'];

function itemUnitsReset(baseUnit) {
    _itemUnits = [{ unit: baseUnit || 'EA', factor: 1, is_base: 1, role_purchase: 1, role_sales: 1, role_count: 1 }];
    _itemUnitsDirty = false;
    _itemUnitsItemCode = '';
    itemUnitsRender();
}

// 수정 모달: GET /api/items/:id 의 units 배열. 비어 있으면(마이그 전 품목) 레거시 열로 1~2행을 만든다.
function itemUnitsLoad(item) {
    _itemUnitsItemCode = (item && item.item_code) || '';
    var rows = (item && Array.isArray(item.units)) ? item.units.slice() : [];
    if (!rows.length) {
        var multi = !!(item && item.base_unit && item.base_unit !== item.unit && Number(item.pack_size) > 1);
        var base = multi ? item.base_unit : (item.unit || 'EA');
        rows = [{ unit: base, factor: 1, is_base: 1, role_purchase: multi ? 0 : 1, role_sales: 1, role_count: multi ? 0 : 1 }];
        if (multi) rows.push({ unit: item.unit, factor: Number(item.pack_size), is_base: 0, role_purchase: 1, role_sales: 0, role_count: 1 });
    }
    _itemUnits = rows.map(function (r) {
        return { unit: r.unit, factor: Number(r.factor) || 1, is_base: r.is_base ? 1 : 0,
                 role_purchase: r.role_purchase ? 1 : 0, role_sales: r.role_sales ? 1 : 0, role_count: r.role_count ? 1 : 0 };
    });
    _itemUnitsDirty = false;
    itemUnitsRender();
}

function itemUnitsBase() {
    for (var i = 0; i < _itemUnits.length; i++) if (_itemUnits[i].is_base) return _itemUnits[i];
    return _itemUnits[0] || null;
}

// 발주·입고 단위 = items.unit 로 파생될 값
function itemUnitsPurchaseUnit() {
    for (var i = 0; i < _itemUnits.length; i++) if (_itemUnits[i].role_purchase) return _itemUnits[i].unit;
    var b = itemUnitsBase();
    return b ? b.unit : 'EA';
}

function itemUnitsSyncHidden() {
    var sel = document.getElementById('itemUnit');
    if (!sel) return;
    var u = itemUnitsPurchaseUnit();
    var has = false;
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === u) { has = true; break; }
    if (!has) { var o = document.createElement('option'); o.value = u; o.textContent = u; sel.appendChild(o); }
    sel.value = u;
}

function itemUnitsRender() {
    var body = document.getElementById('itemUnitsBody');
    if (!body) { console.warn('[items] #itemUnitsBody not found'); return; }
    var base = itemUnitsBase();
    var html = '';
    for (var i = 0; i < _itemUnits.length; i++) {
        var r = _itemUnits[i];
        var isBase = !!r.is_base;
        html += '<tr class="border-t border-gray-100">'
            + '<td class="py-1 pr-2"><input type="text" list="itemUnitsPresetList" value="' + escapeHtml(r.unit) + '" maxlength="10" oninput="itemUnitsSet(' + i + ',\'unit\',this.value)" class="w-20 px-2 py-1 border border-gray-300 rounded text-xs"></td>'
            + '<td class="py-1 pr-2">'
            + (isBase
                ? '<span class="text-gray-400">기본단위</span>'
                : '<span class="inline-flex items-center gap-1">1 ' + escapeHtml(r.unit || '?') + ' = <input type="number" min="0.0001" step="any" value="' + r.factor + '" oninput="itemUnitsSet(' + i + ',\'factor\',this.value)" class="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-right"> ' + escapeHtml(base ? base.unit : '') + '</span>')
            + '</td>'
            + '<td class="text-center"><input type="radio" name="itemUnitsRoleBase" ' + (isBase ? 'checked' : '') + ' onchange="itemUnitsRole(' + i + ',\'is_base\')" title="재고·소모·단가 축"></td>'
            + '<td class="text-center"><input type="radio" name="itemUnitsRolePurchase" ' + (r.role_purchase ? 'checked' : '') + ' onchange="itemUnitsRole(' + i + ',\'role_purchase\')" title="발주서·입고 기본 단위 = items.unit"></td>'
            + '<td class="text-center"><input type="radio" name="itemUnitsRoleSales" ' + (r.role_sales ? 'checked' : '') + ' onchange="itemUnitsRole(' + i + ',\'role_sales\')" title="주문서·견적서 기본 단위"></td>'
            + '<td class="text-center"><input type="radio" name="itemUnitsRoleCount" ' + (r.role_count ? 'checked' : '') + ' onchange="itemUnitsRole(' + i + ',\'role_count\')" title="실사 입력(포장) 단위"></td>'
            + '<td class="text-right">' + (isBase ? '' : '<button type="button" onclick="itemUnitsRemove(' + i + ')" class="text-gray-400 hover:text-red-500 text-xs" title="줄 삭제"><i class="fas fa-times"></i></button>') + '</td>'
            + '</tr>';
    }
    body.innerHTML = html;
    var hint = document.getElementById('itemUnitsHint');
    if (hint) {
        var parts = [];
        for (var j = 0; j < _itemUnits.length; j++) {
            var x = _itemUnits[j];
            if (!x.is_base) parts.push('1' + x.unit + ' = ' + x.factor + (base ? base.unit : ''));
        }
        hint.textContent = (base ? '기본단위 ' + base.unit : '') + (parts.length ? ' · ' + parts.join(' · ') : ' · 환산 단위 없음(단일 단위)')
            + ' · 발주·입고 단위 = ' + itemUnitsPurchaseUnit();
    }
    itemUnitsSyncHidden();
}

function itemUnitsSet(i, key, val) {
    var r = _itemUnits[i]; if (!r) return;
    if (key === 'factor') r.factor = Number(val) || 0; else r.unit = String(val || '').trim();
    _itemUnitsDirty = true;
    // 단위 이름은 입력 중이라 표 전체를 다시 그리지 않는다(포커스 유지). 힌트·숨은 값만 갱신.
    var hint = document.getElementById('itemUnitsHint');
    if (hint && key === 'unit') itemUnitsSyncHidden();
}

function itemUnitsRole(i, role) {
    for (var j = 0; j < _itemUnits.length; j++) _itemUnits[j][role] = (j === i) ? 1 : 0;
    if (role === 'is_base') _itemUnits[i].factor = 1;
    _itemUnitsDirty = true;
    itemUnitsRender();
}

function itemUnitsAddRow() {
    if (_itemUnits.length >= 6) { showToast('단위는 최대 6줄입니다', 'warning'); return; }
    var block = itemUnitsBlockReason();
    if (block) { showToast(block, 'warning'); return; }
    _itemUnits.push({ unit: '', factor: 1, is_base: 0, role_purchase: 0, role_sales: 0, role_count: 0 });
    _itemUnitsDirty = true;
    itemUnitsRender();
    var body = document.getElementById('itemUnitsBody');
    var inputs = body ? body.querySelectorAll('input[type="text"]') : [];
    if (inputs.length) inputs[inputs.length - 1].focus();
}

function itemUnitsRemove(i) {
    if (_itemUnits[i] && _itemUnits[i].is_base) return;
    _itemUnits.splice(i, 1);
    _itemUnitsDirty = true;
    itemUnitsRender();
}

// 서버(utils/itemUnits.ts multiUnitBlockReason)와 같은 규칙 — 잉크·현수막 원단은 단일 단위
function itemUnitsBlockReason() {
    var code = _itemUnitsItemCode || '';
    if (/^RM-I/i.test(code)) return '잉크는 단일 단위(통)로 관리합니다 — 용량은 품목명에 적습니다';
    if (/^AQ/i.test(code)) return '현수막 원단(AQ)은 yd 단일 단위입니다 — pack 130 은 실사 편의계수';
    return null;
}

// 품목 저장 뒤 호출(saveItem). 표가 바뀌었거나 신규 품목이면 PUT /units.
async function itemUnitsSave(itemId, force) {
    if (!itemId) return;
    if (!_itemUnitsDirty && !force) return;
    var rows = _itemUnits.filter(function (r) { return r.unit; });
    var res = await axios.put('/api/items/' + itemId + '/units', { units: rows });
    if (!res.data || !res.data.success) throw new Error((res.data && res.data.error) || '단위 저장 실패');
    _itemUnitsDirty = false;
}
