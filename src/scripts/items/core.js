// items/core.js — 상수, 캐시, 로딩 유틸, 그룹 편집 모달 (Phase 3.1.B 분할)

var allItems = []; // 전체 품목 캐시 (그룹 멤버 미리보기 등에서 사용)
var selectedItemType = 'PRODUCT'; // 모달 내 선택된 타입

// ── 정렬 상태 ──
var tabSortState = { column: '', asc: true };

function sortIcon(column) {
    if (tabSortState.column !== column) return '<i class="fas fa-sort text-gray-300 ml-1"></i>';
    return tabSortState.asc
        ? '<i class="fas fa-sort-up text-blue-600 ml-1"></i>'
        : '<i class="fas fa-sort-down text-blue-600 ml-1"></i>';
}

window.sortTabItems = function(tabName, column) {
    if (tabSortState.column === column) {
        tabSortState.asc = !tabSortState.asc;
    } else {
        tabSortState.column = column;
        tabSortState.asc = true;
    }
    if (tabName === 'output') loadOutputItems(currentOutputFilter);
    else loadTabItems(tabName);
};

// ── 검색 debounce ──
var _tabSearchTimers = {};
function debouncedLoadTab(tabName) {
    if (_tabSearchTimers[tabName]) clearTimeout(_tabSearchTimers[tabName]);
    _tabSearchTimers[tabName] = setTimeout(function() { loadTabItems(tabName); }, 300);
}
window.debouncedLoadTab = debouncedLoadTab;

var _outputSearchTimer = null;
function debouncedLoadOutput() {
    if (_outputSearchTimer) clearTimeout(_outputSearchTimer);
    _outputSearchTimer = setTimeout(function() { loadOutputItems(currentOutputFilter); }, 300);
}
window.debouncedLoadOutput = debouncedLoadOutput;

// 타입 라벨/색상 매핑
var TYPE_CONFIG = {
    PRODUCT: { label: '제품', badgeClass: 'bg-blue-50 text-blue-700' },
    GOODS:   { label: '상품', badgeClass: 'bg-amber-50 text-amber-700' },
    MATERIAL:{ label: '원자재', badgeClass: 'bg-green-50 text-green-700' }
};

// 카테고리 목록 동적 로딩 (DB에서)
async function loadCategories() {
    try {
        var response = await axios.get('/api/items/categories');
        if (response.data.success) {
            var cats = response.data.data;
            var filterSel = document.getElementById('itemCategoryFilter');
            // 필터 드롭다운만 DB 카테고리 로드 (모달은 타입별로 동적 설정)
            cats.forEach(function(cat) {
                var val = cat.category_name;
                filterSel.appendChild(new Option(cat.category_name, val));
            });
        }
    } catch (error) {
        console.error('카테고리 로딩 실패:', error);
    }
}

// 전체 품목 캐시 갱신 (그룹 멤버 미리보기 등에서 사용)
async function loadItems() {
    try {
        var response = await axios.get('/api/items', { params: { limit: 200 } });
        if (response.data.success) {
            allItems = response.data.data;
        }
    } catch (error) { /* ignore */ }
}

function getTypeBadge(item) {
    var type = item.item_type || 'PRODUCT';
    var config = TYPE_CONFIG[type] || TYPE_CONFIG.PRODUCT;
    return '<span class="px-2.5 py-0.5 text-xs font-medium rounded-full ' + config.badgeClass + '">' + config.label + '</span>';
}

// tabItems 관련 함수 블록 시작 (제거 대상)
// ── 타입 선택 및 동적 폼 ──────────────────────────────────

// ── 자동 코드 미리보기 ──
window.updateAutoCodePreview = function() {
    var type = selectedItemType || 'PRODUCT';
    var preview = document.getElementById('autoCodePreview');
    if (!preview) return;

    if (type === 'MATERIAL') {
        var rmSub = document.getElementById('rmSubCategory');
        var rmSubVal = rmSub ? rmSub.value : '';
        var rmMap = { '원단류':'F', '판재류':'P', '시트류':'S', '잉크':'I', '전사자재':'T', '간판자재':'G', '부자재':'B', '배너대':'E' };
        var letter = rmMap[rmSubVal] || 'X';
        preview.textContent = '자동 배정: RM-' + letter + '0001~';

        // 판재류 선택 시 규격 입력 표시
    } else {
        // 제품/상품: 카테고리 기반 범위 표시
        var catEl = document.getElementById('itemCategory');
        var catVal = catEl ? catEl.value : '';
        var rangeMap = {
            '전사': '5xxx', '깃발': '5xxx', '윈드배너': '5xxx', '가로등배너': '5xxx',
            '태극기': '6xxx', '새마을기': '6xxx', '민방위기': '6xxx',
            '간판': '7xxx',
            '상품': '8xxx'
        };
        var rangeStr = rangeMap[catVal] || 'XXXX';
        preview.textContent = '자동 배정: PM-' + rangeStr;
    }
};

// 대분류 변경 시 코드 미리보기 업데이트
window.onCategoryChange = function() {
    updateAutoCodePreview();
};

// ── 소재 목록 로드 (parentMediaId 드롭다운용) ──
// 원자재 모달: 연결된 소재 표시 (읽기 전용)
function loadLinkedMediaDisplay(itemId) {
    var container = document.getElementById('linkedMediaDisplay');
    if (!container) return;
    container.innerHTML = '<span class="text-xs text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</span>';

    axios.get('/api/print-system/item-linked-media/' + itemId).then(function(res) {
        var groups = res.data.data || {};
        var groupNames = Object.keys(groups);
        if (groupNames.length === 0) {
            container.innerHTML = '<span class="text-xs text-gray-400">연결된 소재 없음</span>';
            return;
        }
        var html = '';
        groupNames.forEach(function(g) {
            html += '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">'
                + '<i class="fas fa-link text-blue-400"></i>' + escapeHtml(g)
                + '</span>';
        });
        container.innerHTML = html;
    }).catch(function() {
        container.innerHTML = '<span class="text-xs text-gray-400">조회 실패</span>';
    });
}

function loadParentMediaOptions() {
    axios.get('/api/print-system/media').then(function(res) {
        var data = res.data.data || {};
        var select = document.getElementById('parentMediaId');
        if (!select) return;
        var html = '<option value="">연결 없음</option>';
        var allMedia = [];
        if (data.groups) {
            Object.keys(data.groups).forEach(function(g) {
                data.groups[g].forEach(function(m) { allMedia.push(m); });
            });
        }
        if (data.ungrouped) {
            data.ungrouped.forEach(function(m) { allMedia.push(m); });
        }
        allMedia.forEach(function(m) {
            html += '<option value="' + m.id + '">' + escapeHtml(m.name) + ' (' + (m.price_per_unit || 0).toLocaleString() + '원/㎡)</option>';
        });
        select.innerHTML = html;
    }).catch(function(err) {
        console.error('소재 목록 로드 실패:', err);
    });
}

function selectItemType(type) {
    selectedItemType = type;
    document.getElementById('itemType').value = type;

    // 버튼 스타일 업데이트
    document.querySelectorAll('.item-type-btn').forEach(function(btn) {
        var btnType = btn.getAttribute('data-type');
        if (btnType === type) {
            btn.className = 'item-type-btn flex-1 px-4 py-3 border-2 rounded-lg text-center transition-all border-blue-600 bg-blue-50 text-blue-700';
        } else {
            btn.className = 'item-type-btn flex-1 px-4 py-3 border-2 rounded-lg text-center transition-all border-gray-200 text-gray-500 hover:border-gray-400';
        }
    });

    // 타입별 필드 표시/숨김
    updateFieldVisibility(type);

    // 사용원단 탭 표시 여부 (제품만)
    var materialsTabBtn = document.getElementById('materialsTabBtn');
    var itemId = document.getElementById('itemId').value;
    if (type === 'PRODUCT' && itemId) {
        materialsTabBtn.style.display = 'block';
    } else {
        materialsTabBtn.style.display = 'none';
    }
}

function updateFieldVisibility(type) {
    // 소분류 (후가공 연결): 제품만
    var fieldSubCat = document.getElementById('fieldSubCategory');
    if (fieldSubCat) fieldSubCat.style.display = (type === 'PRODUCT') ? '' : 'none';

    // 단가 방식: 제품만
    var fieldPricing = document.getElementById('fieldPricingMethod');
    if (fieldPricing) fieldPricing.style.display = (type === 'PRODUCT') ? '' : 'none';

    // 규격 힌트: 타입별 안내
    var specHint = document.getElementById('specHint');
    if (specHint) {
        if (type === 'MATERIAL') {
            specHint.textContent = '원단류: 폭을 mm 단위로 입력 (예: 1600mm) — 자동차감 매칭에 사용';
            specHint.classList.remove('hidden');
        } else {
            specHint.classList.add('hidden');
        }
    }

    // 원자재 분류, 소재 연결, 판매 토글: 원자재만
    var rmSubArea = document.getElementById('rmSubCategoryArea');
    if (rmSubArea) rmSubArea.classList.toggle('hidden', type !== 'MATERIAL');
    var parentMediaArea = document.getElementById('parentMediaArea');
    if (parentMediaArea) parentMediaArea.classList.toggle('hidden', type !== 'MATERIAL');
    var rmSalesArea = document.getElementById('rmSalesToggleArea');
    if (rmSalesArea) rmSalesArea.classList.toggle('hidden', type !== 'MATERIAL');

    // 대분류: PRODUCT만 표시, 상품/원자재는 숨김 (자동 설정)
    var categoryArea = document.getElementById('categoryArea');
    var catEl = document.getElementById('itemCategory');
    if (catEl) {
        if (type === 'MATERIAL') {
            catEl.innerHTML = '<option value="원자재">원자재</option>';
            catEl.value = '원자재';
            catEl.removeAttribute('required');
            if (categoryArea) categoryArea.style.display = 'none';
        } else if (type === 'GOODS') {
            catEl.innerHTML = '<option value="상품">상품</option>';
            catEl.value = '상품';
            catEl.removeAttribute('required');
            if (categoryArea) categoryArea.style.display = 'none';
        } else {
            // PRODUCT: 전사계열 / 태극기계열 / 간판만 선택 가능
            if (categoryArea) categoryArea.style.display = '';
            catEl.disabled = false;
            catEl.setAttribute('required', '');
            catEl.innerHTML = '<option value="">선택...</option>'
                + '<optgroup label="전사 (PM-5xxx)">'
                + '<option value="전사">전사</option>'
                + '<option value="깃발">깃발</option>'
                + '<option value="윈드배너">윈드배너</option>'
                + '<option value="가로등배너">가로등배너</option>'
                + '</optgroup>'
                + '<optgroup label="태극기 (PM-6xxx)">'
                + '<option value="태극기">태극기</option>'
                + '<option value="새마을기">새마을기</option>'
                + '<option value="민방위기">민방위기</option>'
                + '</optgroup>'
                + '<optgroup label="간판 (PM-7xxx)">'
                + '<option value="간판">간판</option>'
                + '</optgroup>';
            var categoryHint = document.getElementById('categoryHint');
            if (categoryHint) { categoryHint.textContent = '출력 품목은 설정 탭에서 소재 등록 시 자동 생성됩니다'; categoryHint.classList.remove('hidden'); }
        }
    }

    // 창고 구역: 원자재/상품만 표시
    var fieldStorageZone = document.getElementById('fieldStorageZone');
    if (fieldStorageZone) fieldStorageZone.style.display = (type !== 'PRODUCT') ? '' : 'none';

    // 자동 코드 미리보기 업데이트
    updateAutoCodePreview();

    // 단가 라벨 업데이트
    updatePricingLabel();
}

// ── 그룹 관련 ──────────────────────────────────────────────

function showGroupEditModal(groupName) {
    document.getElementById('groupEditName').value = groupName;
    document.getElementById('groupEditTitle').textContent = '"' + groupName + '" 일괄 수정';
    var groupItems = allItems.filter(function(i) { return i.item_group === groupName; });
    document.getElementById('groupEditDesc').textContent = groupItems.length + '개 품목에 공통 적용됩니다.';

    var catSel = document.getElementById('groupEditCategory');
    var mainCatSel = document.getElementById('itemCategoryFilter');
    catSel.innerHTML = '<option value="">선택...</option>';
    Array.from(mainCatSel.options).forEach(function(opt) {
        if (opt.value) catSel.appendChild(new Option(opt.text, opt.value));
    });

    loadItemSubcatOptions().then(function() {
        var subSel = document.getElementById('groupEditSubCategory');
        populateGroupSubcatSelect(subSel);
    });

    ['Category', 'SubCategory', 'Unit', 'Pricing'].forEach(function(f) {
        document.getElementById('groupEdit' + f + 'Check').checked = false;
        toggleGroupField(f);
    });

    document.getElementById('groupEditModal').classList.remove('hidden');
}

function populateGroupSubcatSelect(sel) {
    var groups = {};
    itemSubcatOptions.forEach(function(s) {
        if (!groups[s.group_name]) groups[s.group_name] = [];
        groups[s.group_name].push(s);
    });
    var optionsHtml = Object.entries(groups).map(function(entry) {
        return '<optgroup label="' + entry[0] + '">' + entry[1].map(function(s) {
            return '<option value="' + s.subcat_name + '">' + s.subcat_name + '</option>';
        }).join('') + '</optgroup>';
    }).join('');
    sel.innerHTML = '<option value="">-- 해당 없음 --</option>' + optionsHtml;
}

function closeGroupEditModal() {
    document.getElementById('groupEditModal').classList.add('hidden');
}

function toggleGroupField(fieldName) {
    var checked = document.getElementById('groupEdit' + fieldName + 'Check').checked;
    var input = document.getElementById('groupEdit' + fieldName);
    input.disabled = !checked;
    if (checked) {
        input.classList.remove('bg-gray-50');
    } else {
        input.classList.add('bg-gray-50');
    }
}

async function saveGroupEdit() {
    var groupName = document.getElementById('groupEditName').value;
    var updates = {};
    if (document.getElementById('groupEditCategoryCheck').checked) {
        updates.category = document.getElementById('groupEditCategory').value;
    }
    if (document.getElementById('groupEditSubCategoryCheck').checked) {
        updates.sub_category = document.getElementById('groupEditSubCategory').value || null;
    }
    if (document.getElementById('groupEditUnitCheck').checked) {
        updates.unit = document.getElementById('groupEditUnit').value;
    }
    if (document.getElementById('groupEditPricingCheck').checked) {
        updates.pricing_method = document.getElementById('groupEditPricing').value;
    }

    if (Object.keys(updates).length === 0) {
        showToast('변경할 항목을 선택해주세요.', 'warning');
        return;
    }

    try {
        await axios.patch('/api/items/groups/' + encodeURIComponent(groupName), updates);
        showToast('그룹 "' + groupName + '" 일괄 수정 완료', 'success');
        closeGroupEditModal();
        loadItems();
    } catch (error) {
        showToast('일괄 수정 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

// 그룹 datalist + 그룹 멤버 미리보기
async function loadGroupList() {
    try {
        var res = await axios.get('/api/items/groups');
        if (res.data.success) {
            var sel = document.getElementById('itemGroupSelect');
            if (sel) {
                var currentVal = document.getElementById('itemGroup').value;
                sel.innerHTML = '<option value="">그룹 없음</option><option value="__new__">+ 새 그룹 만들기</option>';
                res.data.data.forEach(function(g) {
                    var opt = document.createElement('option');
                    opt.value = g.item_group;
                    opt.textContent = g.item_group + ' (' + (g.variant_count || 0) + '개)';
                    sel.appendChild(opt);
                });
                // 현재 값 복원
                if (currentVal) {
                    // 목록에 있으면 선택
                    var found = false;
                    for (var i = 0; i < sel.options.length; i++) {
                        if (sel.options[i].value === currentVal) { sel.value = currentVal; found = true; break; }
                    }
                    // 목록에 없으면 옵션 추가 후 선택
                    if (!found) {
                        var newOpt = document.createElement('option');
                        newOpt.value = currentVal;
                        newOpt.textContent = currentVal;
                        sel.appendChild(newOpt);
                        sel.value = currentVal;
                    }
                }
            }
        }
    } catch (e) { /* ignore */ }
}

// 그룹 셀렉트 변경 핸들러
window.onGroupSelectChange = function() {
    var sel = document.getElementById('itemGroupSelect');
    var newGroupArea = document.getElementById('newGroupArea');
    var hiddenInput = document.getElementById('itemGroup');

    if (sel.value === '__new__') {
        newGroupArea.classList.remove('hidden');
        document.getElementById('itemGroupNew').focus();
        hiddenInput.value = '';
    } else {
        newGroupArea.classList.add('hidden');
        document.getElementById('itemGroupNew').value = '';
        hiddenInput.value = sel.value;
    }
    showGroupMembers();
};

// 그룹 값 가져오기 (select 또는 새 그룹 입력)
function getSelectedGroup() {
    var sel = document.getElementById('itemGroupSelect');
    if (sel && sel.value === '__new__') {
        return (document.getElementById('itemGroupNew').value || '').trim();
    }
    return sel ? sel.value : (document.getElementById('itemGroup').value || '').trim();
}

// 그룹명 입력 시 해당 그룹 멤버 미리보기
function showGroupMembers() {
    var groupName = getSelectedGroup();
    var infoBox = document.getElementById('groupMembersInfo');
    if (!infoBox) return;

    if (!groupName) {
        infoBox.classList.add('hidden');
        return;
    }

    var members = allItems.filter(function(i) { return i.item_group === groupName; });
    var currentId = document.getElementById('itemId').value;

    if (members.length === 0) {
        infoBox.classList.add('hidden');
        return;
    }

    // 현재 편집 중인 품목 제외
    var otherMembers = members.filter(function(m) { return String(m.id) !== String(currentId); });
    if (otherMembers.length === 0) {
        infoBox.classList.add('hidden');
        return;
    }

    var html = '<span class="font-medium">이 그룹의 기존 품목:</span> ';
    html += otherMembers.map(function(m) {
        var w = m.width_mm ? ' (' + (m.width_mm / 10).toFixed(0) + 'cm)' : '';
        return m.item_name + w;
    }).join(', ');
    infoBox.innerHTML = html;
    infoBox.classList.remove('hidden');
}

// ── 소분류 관련 ──────────────────────────────────────────────

var itemSubcatOptions = [];

async function loadItemSubcatOptions() {
    if (itemSubcatOptions.length > 0) return;
    try {
        var res = await axios.get('/api/post-processing/subcategories');
        itemSubcatOptions = res.data.data || [];
    } catch(e) { itemSubcatOptions = []; }
}

function populateSubcatSelect(currentValue) {
    var sel = document.getElementById('itemSubCategory');
    var groups = {};
    itemSubcatOptions.forEach(function(s) {
        if (!groups[s.group_name]) groups[s.group_name] = [];
        groups[s.group_name].push(s);
    });
    var optionsHtml = Object.entries(groups).map(function(entry) {
        return '<optgroup label="' + entry[0] + '">' + entry[1].map(function(s) {
            return '<option value="' + s.subcat_name + '"' + (s.subcat_name === currentValue ? ' selected' : '') + '>' + s.subcat_name + '</option>';
        }).join('') + '</optgroup>';
    }).join('');
    sel.innerHTML = '<option value="">-- 해당 없음 --</option>' + optionsHtml;
    if (currentValue) sel.value = currentValue;
}

function updatePricingLabel() {
    var pm = document.getElementById('itemPricingMethod').value;
    var lbl = document.getElementById('itemPriceLabel');
    if (!lbl) return;
    // 제품이 아니면 항상 "기본 단가 (원)"
    if (selectedItemType !== 'PRODUCT') {
        lbl.textContent = '기본 단가 (원)';
        return;
    }
    if (pm === 'AREA') {
        lbl.textContent = '기본 단가 (원/㎡)';
    } else {
        lbl.textContent = '기본 단가 (원)';
    }
}

