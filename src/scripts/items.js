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

// ── CRUD ──────────────────────────────────────────────────

async function showCreateModal() {
    document.getElementById('modalTitle').textContent = '품목 추가';
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemUnit').value = 'EA';
    document.getElementById('itemPrice').value = fmtMoneyInput(0);
    document.getElementById('itemPricingMethod').value = 'FIXED';
    document.getElementById('itemGroup').value = '';
    document.getElementById('itemGroupSort').value = '0';
    var groupSel = document.getElementById('itemGroupSelect');
    if (groupSel) groupSel.value = '';
    var newGroupArea = document.getElementById('newGroupArea');
    if (newGroupArea) newGroupArea.classList.add('hidden');
    var newGroupInput = document.getElementById('itemGroupNew');
    if (newGroupInput) newGroupInput.value = '';
    var specEl = document.getElementById('itemSpecification');
    if (specEl) specEl.value = '';
    var szSel = document.getElementById('itemStorageZone');
    if (szSel) szSel.value = '';
    await loadItemSubcatOptions();
    populateSubcatSelect('');
    loadGroupList();

    // 원자재 관련 필드 초기화
    var rmSubSel = document.getElementById('rmSubCategory');
    if (rmSubSel) rmSubSel.value = '';
    var parentMediaSel = document.getElementById('parentMediaId');
    if (parentMediaSel) parentMediaSel.value = '';
    var linkedMediaDisp = document.getElementById('linkedMediaDisplay');
    if (linkedMediaDisp) linkedMediaDisp.innerHTML = '<span class="text-xs text-gray-400">저장 후 표시됩니다</span>';
    var rmSubArea = document.getElementById('rmSubCategoryArea');
    if (rmSubArea) rmSubArea.classList.add('hidden');
    var parentMediaArea = document.getElementById('parentMediaArea');
    if (parentMediaArea) parentMediaArea.classList.add('hidden');

    // 기본 타입: 제품
    selectItemType('PRODUCT');

    // 새로 만들 때는 재료 탭 숨김
    document.getElementById('materialsTabBtn').style.display = 'none';
    currentProductId = null;

    switchModalTab('basic');
    document.getElementById('itemModal').classList.remove('hidden');
}

async function editItem(id) {
    try {
        var response = await axios.get('/api/items/' + id);
        if (response.data.success) {
            var item = response.data.data;
            document.getElementById('modalTitle').textContent = '품목 수정';
            document.getElementById('itemId').value = item.id;
            document.getElementById('itemName').value = item.item_name;
            document.getElementById('itemUnit').value = item.unit || 'EA';
            document.getElementById('itemPrice').value = fmtMoneyInput(item.base_price || 0);
            document.getElementById('itemPricingMethod').value = item.pricing_method || 'FIXED';
            document.getElementById('itemGroup').value = item.item_group || '';
            document.getElementById('itemGroupSort').value = item.group_sort || 0;
            // 규격 복원: specification 우선, 없으면 width_mm에서 생성
            var specEl2 = document.getElementById('itemSpecification');
            if (specEl2) {
                if (item.specification) {
                    specEl2.value = item.specification;
                } else if (item.width_mm) {
                    specEl2.value = item.width_mm + 'mm';
                } else {
                    specEl2.value = '';
                }
            }
            var szSel2 = document.getElementById('itemStorageZone');
            if (szSel2) szSel2.value = item.storage_zone_id != null ? String(item.storage_zone_id) : '';
            await loadItemSubcatOptions();
            populateSubcatSelect(item.sub_category || item.sub_category_direct || '');
            loadGroupList();

            // 타입 설정 (드롭다운 옵션이 재구성됨)
            var itemType = item.item_type || 'PRODUCT';
            selectItemType(itemType);

            // 타입 설정 후 대분류 복원 (selectItemType이 옵션을 재구성하므로 이후에 설정)
            var catVal = item.category_name || item.category || item.category_direct || '';
            document.getElementById('itemCategory').value = catVal;

            // 원자재인 경우 추가 필드 복원
            if (itemType === 'MATERIAL') {
                var rmSubVal = item.sub_category || item.sub_category_direct || '';
                var rmSubSel = document.getElementById('rmSubCategory');
                if (rmSubSel) {
                    rmSubSel.value = rmSubVal;
                    // 값이 안 맞으면 텍스트 매칭 시도
                    if (rmSubSel.value !== rmSubVal && rmSubVal) {
                        for (var oi = 0; oi < rmSubSel.options.length; oi++) {
                            if (rmSubSel.options[oi].value === rmSubVal || rmSubSel.options[oi].text.indexOf(rmSubVal) >= 0) {
                                rmSubSel.value = rmSubSel.options[oi].value;
                                break;
                            }
                        }
                    }
                }
                // parent_media_id 유지 (hidden)
                var pmHidden = document.getElementById('parentMediaId');
                if (pmHidden) pmHidden.value = item.parent_media_id || '';
                // 연결된 소재 표시 (읽기 전용)
                loadLinkedMediaDisplay(item.id);
                // 판매 가능 토글
                var salesToggle = document.getElementById('rmSalesToggle');
                if (salesToggle) salesToggle.checked = !!item.is_sales_item;
                updateAutoCodePreview();
            }

            // 제품인 경우 재료 탭 표시
            var materialsTabBtn = document.getElementById('materialsTabBtn');
            if (itemType === 'PRODUCT') {
                materialsTabBtn.style.display = 'block';
                currentProductId = id;
                loadProductMaterials(id);
            } else {
                materialsTabBtn.style.display = 'none';
            }

            // 그룹 select 동기화 (loadGroupList가 hidden input에서 읽어서 복원)
            await loadGroupList();
            showGroupMembers();

            switchModalTab('basic');
            document.getElementById('itemModal').classList.remove('hidden');
        }
    } catch (error) {
        showToast('품목 정보를 불러오는데 실패했습니다.', 'error');
    }
}

async function saveItem(event) {
    event.preventDefault();

    var id = document.getElementById('itemId').value;
    var groupVal = getSelectedGroup();
    var groupSortVal = document.getElementById('itemGroupSort').value;
    var specVal = (document.getElementById('itemSpecification') || {}).value || '';

    // 원자재: 규격에서 width_mm 자동 파싱 (예: "1600mm" → 1600, "160cm" → 1600)
    // 파싱 실패 시 기존 width_mm 보존 (자동차감 매칭에 필수)
    var widthMm = null;
    if (selectedItemType === 'MATERIAL' && specVal) {
        var mmMatch = specVal.match(/(\d+)\s*mm/i);
        var cmMatch = specVal.match(/(\d+)\s*cm/i);
        if (mmMatch) widthMm = parseInt(mmMatch[1]);
        else if (cmMatch) widthMm = parseInt(cmMatch[1]) * 10;
    }
    // 수정 모드: 파싱 못 했으면 기존 width_mm 유지 (서버에서 현재값 보존)
    if (id && widthMm === null && selectedItemType === 'MATERIAL') {
        widthMm = undefined; // undefined → 서버에서 기존값 유지
    }

    var data = {
        item_name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        sub_category: document.getElementById('itemSubCategory').value || null,
        unit: document.getElementById('itemUnit').value || 'EA',
        base_price: readMoney('itemPrice'),
        pricing_method: document.getElementById('itemPricingMethod').value || 'FIXED',
        width_mm: widthMm,
        item_group: groupVal || null,
        group_sort: parseInt(groupSortVal) || 0,
        item_type: selectedItemType,
        specification: specVal.trim() || null,
        storage_zone_id: (function() {
            var el = document.getElementById('itemStorageZone');
            var v = el ? el.value : '';
            return v ? parseInt(v) : null;
        })()
    };

    // 원자재 추가 필드
    if (selectedItemType === 'MATERIAL') {
        var rmSubEl = document.getElementById('rmSubCategory');
        data.rm_sub_category = rmSubEl ? rmSubEl.value : '';
        var pmIdEl = document.getElementById('parentMediaId');
        data.parent_media_id = pmIdEl && pmIdEl.value ? parseInt(pmIdEl.value) : null;
        // 판매 가능 토글
        var salesToggle = document.getElementById('rmSalesToggle');
        if (salesToggle && salesToggle.checked) {
            data.is_sales_item = 1;
        }
    }

    try {
        if (id) {
            await axios.put('/api/items/' + id, data);
            showToast('품목이 수정되었습니다.', 'success');
        } else {
            await axios.post('/api/items', data);
            showToast('품목이 추가되었습니다.', 'success');
        }
        closeModal();
        // 현재 활성 탭에 맞게 목록 갱신
        if (currentMainTab === 'output') loadOutputItems('');
        else if (currentMainTab === 'settings') { loadPrintMethods(); loadPrintMedia(); }
        else if (['transfer','flag','sign','goods','rawMaterial'].includes(currentMainTab)) loadTabItems(currentMainTab);
        else loadItems();
    } catch (error) {
        showToast('저장 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

async function deleteItem(id, name) {
    if (!(await showConfirm('품목 "' + name + '"을(를) 삭제하시겠습니까?', { danger: true }))) {
        return;
    }

    try {
        await axios.delete('/api/items/' + id);
        showToast('품목이 삭제되었습니다.', 'success');
        // 현재 활성 탭에 맞게 목록 갱신
        if (currentMainTab === 'output') loadOutputItems('');
        else if (currentMainTab === 'settings') { loadPrintMethods(); loadPrintMedia(); }
        else if (['transfer','flag','sign','goods','rawMaterial'].includes(currentMainTab)) loadTabItems(currentMainTab);
        else loadItems();
    } catch (error) {
        showToast('삭제 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

function closeModal() {
    document.getElementById('itemModal').classList.add('hidden');
}

function switchModalTab(tabName) {
    document.querySelectorAll('.modalTabContent').forEach(function(tab) {
        tab.classList.add('hidden');
    });

    var tabContent = document.getElementById(tabName + 'Tab');
    if (tabContent) tabContent.classList.remove('hidden');

    document.querySelectorAll('.itemModalTab').forEach(function(btn) {
        btn.classList.remove('active', 'border-blue-600', 'text-blue-600');
        btn.classList.add('border-transparent', 'text-gray-700');
    });

    var activeBtn = document.querySelector('.itemModalTab[data-tab="' + tabName + '"]');
    if (activeBtn) {
        activeBtn.classList.add('active', 'border-blue-600', 'text-blue-600');
        activeBtn.classList.remove('border-transparent', 'text-gray-700');
    }

    if (tabName === 'materials' && currentProductId) {
        loadProductMaterials(currentProductId);
    }
}

// ── 원단 매핑 ──────────────────────────────────────────────

var currentMaterials = [];
var currentProductId = null;

async function loadProductMaterials(productId) {
    try {
        currentProductId = productId;
        var response = await axios.get('/api/items/' + productId + '/materials');
        if (response.data.success) {
            currentMaterials = response.data.data;
            displayProductMaterials();
        }
    } catch (error) {
        console.error('재료 목록 로딩 실패:', error);
        currentMaterials = [];
    }
}

var materialSortMode = 'name_width'; // 기본값: 이름 → 규격

function sortMaterials(materials, mode) {
    return materials.slice().sort(function(a, b) {
        if (mode === 'name_width') {
            var nameComp = (a.item_name || '').localeCompare(b.item_name || '');
            if (nameComp !== 0) return nameComp;
            return (a.width_mm || 0) - (b.width_mm || 0);
        } else if (mode === 'width_asc') {
            return (a.width_mm || 0) - (b.width_mm || 0);
        } else if (mode === 'width_desc') {
            return (b.width_mm || 0) - (a.width_mm || 0);
        } else if (mode === 'stock_desc') {
            return (b.current_stock || 0) - (a.current_stock || 0);
        }
        return 0;
    });
}

function changeMaterialSort(mode) {
    materialSortMode = mode;
    displayProductMaterials();
}

var materialGroupExpanded = {}; // 그룹별 펼침 상태

function toggleMaterialGroup(groupName) {
    materialGroupExpanded[groupName] = !materialGroupExpanded[groupName];
    displayProductMaterials();
}

function displayProductMaterials() {
    var container = document.getElementById('materialsListContainer');
    if (!container) return;

    if (currentMaterials.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-gray-500 text-sm"><p>매핑된 원단이 없습니다.</p></div>';
        return;
    }

    var sorted = sortMaterials(currentMaterials, materialSortMode);

    // 그룹별 분류 (item_group 기준, 없으면 '미분류')
    var groups = {};
    var groupOrder = [];
    sorted.forEach(function(mat) {
        var gName = mat.item_group || '미분류';
        if (!groups[gName]) {
            groups[gName] = [];
            groupOrder.push(gName);
        }
        groups[gName].push(mat);
    });

    var html = '<div class="flex items-center gap-2 mb-2 text-xs">';
    html += '<span class="text-gray-500">정렬:</span>';
    html += '<button onclick="changeMaterialSort(\'name_width\')" class="px-2 py-0.5 rounded ' + (materialSortMode === 'name_width' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600') + '">이름+규격</button>';
    html += '<button onclick="changeMaterialSort(\'width_asc\')" class="px-2 py-0.5 rounded ' + (materialSortMode === 'width_asc' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600') + '">규격 오름차순</button>';
    html += '<button onclick="changeMaterialSort(\'width_desc\')" class="px-2 py-0.5 rounded ' + (materialSortMode === 'width_desc' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600') + '">규격 내림차순</button>';
    html += '<button onclick="changeMaterialSort(\'stock_desc\')" class="px-2 py-0.5 rounded ' + (materialSortMode === 'stock_desc' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-gray-100 text-gray-600') + '">재고순</button>';
    html += '</div>';

    // 그룹이 1개뿐이면 아코디언 없이 플랫 표시
    if (groupOrder.length === 1 && groupOrder[0] === '미분류') {
        html += buildMaterialTable(sorted);
    } else {
        groupOrder.forEach(function(gName) {
            var items = groups[gName];
            var isExpanded = materialGroupExpanded[gName] !== false; // 기본 펼침
            var widths = items.map(function(m) { return m.width_mm ? Math.round(m.width_mm/10) + 'cm' : ''; }).filter(Boolean).join(', ');
            var escapedG = gName.replace(/'/g, "\\'");

            html += '<div class="border border-gray-200 rounded mb-2">';
            html += '<div class="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100">';
            html += '<div class="flex items-center gap-2" onclick="toggleMaterialGroup(\'' + escapedG + '\')">';
            html += '<i class="fas fa-chevron-' + (isExpanded ? 'down' : 'right') + ' text-gray-400 text-xs"></i>';
            html += '<span class="font-medium text-sm text-gray-800">' + gName + '</span>';
            html += '<span class="text-xs text-gray-500">(' + items.length + '개' + (widths ? ' · ' + widths : '') + ')</span>';
            html += '</div>';
            if (gName !== '미분류') {
                html += '<button onclick="event.stopPropagation(); removeMaterialGroupMapping(' + currentProductId + ', \'' + escapedG + '\')" class="text-red-500 hover:text-red-700 text-xs px-2 py-1"><i class="fas fa-trash mr-1"></i>그룹 삭제</button>';
            }
            html += '</div>';

            if (isExpanded) {
                html += '<div class="px-1">' + buildMaterialTable(items) + '</div>';
            }
            html += '</div>';
        });
    }

    container.innerHTML = html;
}

function buildMaterialTable(materials) {
    var html = '<table class="w-full text-sm">';
    html += '<thead class="bg-gray-50"><tr>';
    html += '<th class="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">원단명</th>';
    html += '<th class="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">폭</th>';
    html += '<th class="px-3 py-1.5 text-right text-xs font-semibold text-gray-600">현재고</th>';
    html += '<th class="px-3 py-1.5 text-left text-xs font-semibold text-gray-600">액션</th>';
    html += '</tr></thead>';
    html += '<tbody class="divide-y divide-gray-100">';
    materials.forEach(function(mat) {
        var widthCm = mat.width_mm ? Math.round(mat.width_mm / 10) + 'cm' : '-';
        html += '<tr class="hover:bg-gray-50">';
        html += '<td class="px-3 py-1.5 text-gray-900">' + mat.item_name + '</td>';
        html += '<td class="px-3 py-1.5 text-gray-600">' + widthCm + '</td>';
        html += '<td class="px-3 py-1.5 text-right text-gray-600">' + (mat.current_stock || 0) + '</td>';
        html += '<td class="px-3 py-1.5 font-medium">';
        html += '<button onclick="removeMaterialMapping(' + currentProductId + ', ' + mat.material_item_id + ')" class="text-red-600 hover:text-red-900 text-xs"><i class="fas fa-trash"></i></button>';
        html += '</td>';
        html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

async function showMaterialSearchDropdown() {
    try {
        var searchVal = document.getElementById('materialSearch').value || '';
        var dropdown = document.getElementById('materialSearchDropdown');
        if (!dropdown) return;

        // 그룹 검색 + 개별 원단 검색 병렬 실행
        var [groupRes, matRes] = await Promise.all([
            axios.get('/api/items/materials/groups', { params: { search: searchVal } }),
            axios.get('/api/items/materials/search', { params: { search: searchVal } })
        ]);

        var html = '';

        // 원단 그룹 섹션
        var groups = groupRes.data.success ? groupRes.data.data : [];
        if (groups.length > 0) {
            html += '<div class="px-3 py-1.5 bg-blue-50 text-xs font-bold text-blue-700 border-b">원단 그룹 (일괄 매핑)</div>';
            html += groups.map(function(g) {
                var widths = (g.widths || '').split(',').map(function(w) { return (parseInt(w)/10) + 'cm'; }).join(', ');
                var escapedGroup = (g.item_group || '').replace(/'/g, "\\'");
                return '<div class="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100" onclick="addMaterialGroupMapping(' + currentProductId + ', \'' + escapedGroup + '\')">' +
                    '<div class="font-medium text-blue-800"><i class="fas fa-layer-group mr-1"></i>' + g.item_group + ' <span class="text-xs text-blue-500">(' + g.item_count + '개)</span></div>' +
                    '<div class="text-xs text-gray-500">폭: ' + widths + '</div>' +
                '</div>';
            }).join('');
        }

        // 개별 원단 섹션
        var materials = matRes.data.success ? matRes.data.data : [];
        if (materials.length > 0) {
            html += '<div class="px-3 py-1.5 bg-gray-50 text-xs font-bold text-gray-600 border-b">개별 원단</div>';
            html += materials.map(function(mat) {
                var escapedName = (mat.item_name || '').replace(/'/g, '').replace(/"/g, '');
                return '<div class="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0" onclick="addMaterialMapping(' + currentProductId + ', ' + mat.id + ', \'' + escapedName + '\')">' +
                    '<div class="font-medium text-gray-900">' + mat.item_name + '</div>' +
                    '<div class="text-xs text-gray-500">폭: ' + (mat.width_mm ? Math.round(mat.width_mm / 10) + 'cm' : '-') + '</div>' +
                '</div>';
            }).join('');
        }

        if (!html) {
            html = '<div class="p-2 text-gray-500 text-sm">매핑 가능한 원단이 없습니다.</div>';
        }

        dropdown.innerHTML = html;
        dropdown.classList.remove('hidden');
    } catch (error) {
        console.error('원단 검색 실패:', error);
    }
}

async function addMaterialMapping(productId, materialId, materialName) {
    try {
        await axios.post('/api/items/' + productId + '/materials', {
            material_item_id: materialId,
            is_default: false
        });
        document.getElementById('materialSearchDropdown').classList.add('hidden');
        document.getElementById('materialSearch').value = '';
        await loadProductMaterials(productId);
    } catch (error) {
        showToast('원단 매핑 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

async function addMaterialGroupMapping(productId, groupName) {
    try {
        var response = await axios.post('/api/items/' + productId + '/materials/group', {
            item_group: groupName
        });
        document.getElementById('materialSearchDropdown').classList.add('hidden');
        document.getElementById('materialSearch').value = '';
        if (response.data.success) {
            showToast(response.data.message, 'warning');
        }
        await loadProductMaterials(productId);
    } catch (error) {
        showToast('그룹 매핑 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

async function removeMaterialGroupMapping(productId, groupName) {
    if (!(await showConfirm('"' + groupName + '" 그룹의 모든 원단 매핑을 삭제하시겠습니까?', { danger: true }))) return;
    try {
        var response = await axios.delete('/api/items/' + productId + '/materials/group/' + encodeURIComponent(groupName));
        if (response.data.success) {
            showToast(response.data.message, 'warning');
        }
        await loadProductMaterials(productId);
    } catch (error) {
        showToast('그룹 삭제 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

async function removeMaterialMapping(productId, materialId) {
    if (!(await showConfirm('이 원단 매핑을 삭제하시겠습니까?', { danger: true }))) return;

    try {
        await axios.delete('/api/items/' + productId + '/materials/' + materialId);
        await loadProductMaterials(productId);
    } catch (error) {
        showToast('삭제 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

// ============================================
// 출력방식·소재 관리 (Print System)
// ============================================

var cachedPrintMethods = [];
var cachedPrintMediaData = null;

// 메인 탭 전환 (7탭)
var mainTabNames = ['output', 'transfer', 'flag', 'sign', 'goods', 'rawMaterial', 'settings'];
var currentMainTab = 'output';

window.switchMainTab = function(tab) {
    currentMainTab = tab;
    // 모든 탭 콘텐츠 숨김
    mainTabNames.forEach(function(t) {
        var elId = 'tab' + t.charAt(0).toUpperCase() + t.slice(1);
        var el = document.getElementById(elId);
        if (el) el.classList.add('hidden');
        var btnId = 'tabBtn' + t.charAt(0).toUpperCase() + t.slice(1);
        var btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.remove('border-blue-600', 'text-blue-600');
            btn.classList.add('text-gray-500', 'border-transparent');
        }
    });
    // 기존 tabItems도 숨김
    var oldTab = document.getElementById('tabItems');
    if (oldTab) oldTab.classList.add('hidden');

    // 선택 탭 표시
    var activeElId = 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1);
    var activeEl = document.getElementById(activeElId);
    if (activeEl) activeEl.classList.remove('hidden');
    var activeBtnId = 'tabBtn' + tab.charAt(0).toUpperCase() + tab.slice(1);
    var activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) {
        activeBtn.classList.add('border-blue-600', 'text-blue-600');
        activeBtn.classList.remove('text-gray-500', 'border-transparent');
    }

    // 탭별 데이터 로드
    if (tab === 'output') loadOutputItems('');
    else if (tab === 'settings') { loadPrintMethods(); loadPrintMedia(); }
    else loadTabItems(tab);
};

// ── 출력 탭 ──────────────────────────────────────────────

var currentOutputFilter = '';

window.filterOutputItems = function(prefix) {
    currentOutputFilter = prefix;
    // 필터 버튼 스타일
    document.querySelectorAll('.output-filter-btn').forEach(function(btn) {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-200', 'text-gray-700');
    });
    if (event && event.target) {
        event.target.classList.add('bg-blue-600', 'text-white');
        event.target.classList.remove('bg-gray-200', 'text-gray-700');
    }
    loadOutputItems(prefix);
};

function loadOutputItems(prefix) {
    var url = '/api/print-system/items-for-order';
    if (prefix) url += '?method_code=' + prefix;
    axios.get(url).then(function(res) {
        var items = res.data.data || [];

        // 검색 필터
        var search = (document.getElementById('outputSearch') ? document.getElementById('outputSearch').value : '').toLowerCase().trim();
        if (search) {
            items = items.filter(function(it) {
                var name = (it.item_name || '').toLowerCase();
                var code = (it.item_code || '').toLowerCase();
                // 숫자만 입력하면 PM- 접두사 매칭도
                if (/^\d+$/.test(search)) {
                    return code.includes(search) || code.includes('pm-' + search);
                }
                return name.includes(search) || code.includes(search);
            });
        }

        // 정렬
        if (tabSortState.column) {
            items.sort(function(a, b) {
                var va = a[tabSortState.column]; if (va == null) va = '';
                var vb = b[tabSortState.column]; if (vb == null) vb = '';
                if (typeof va === 'number' && typeof vb === 'number') return tabSortState.asc ? va - vb : vb - va;
                return tabSortState.asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
        }

        document.getElementById('outputItemCount').textContent = items.length + '건';
        if (!items.length) {
            document.getElementById('outputItemsList').innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">등록된 출력 품목이 없습니다.<br><span class="text-xs">설정 탭에서 소재를 등록하고 출력방식에 연결하면 자동 생성됩니다.</span></p>';
            return;
        }
        var html = '<table class="w-full text-sm ds-table-striped"><thead><tr class="text-left text-gray-500 text-xs">'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'item_code\')">코드' + sortIcon('item_code') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'item_name\')">품목명' + sortIcon('item_name') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'category\')">출력방식' + sortIcon('category') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'sub_category\')">소재' + sortIcon('sub_category') + '</th>'
            + '<th class="p-2 text-right cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(\'output\', \'base_price\')">단가/㎡' + sortIcon('base_price') + '</th>'
            + '<th class="p-2">상태</th></tr></thead><tbody>';
        items.forEach(function(it) {
            html += '<tr class="border-t hover:bg-gray-50">'
                + '<td class="p-2 font-mono text-blue-600 text-xs">' + escapeHtml(it.item_code || '') + '</td>'
                + '<td class="p-2 font-medium">' + escapeHtml(it.item_name || '') + '</td>'
                + '<td class="p-2 text-gray-500">' + escapeHtml(it.category || '') + '</td>'
                + '<td class="p-2 text-gray-500">' + escapeHtml(it.sub_category || it.media_name || '') + '</td>'
                + '<td class="p-2 text-right tabular-nums">' + (it.base_price || 0).toLocaleString() + '</td>'
                + '<td class="p-2">' + (it.is_active !== 0 ? '<span class="text-green-600 text-xs">활성</span>' : '<span class="text-gray-400 text-xs">비활성</span>') + '</td>'
                + '</tr>';
        });
        html += '</tbody></table>';
        document.getElementById('outputItemsList').innerHTML = html;
    }).catch(function() {
        document.getElementById('outputItemsList').innerHTML = '<p class="text-red-500 text-sm py-4 text-center">데이터 로드 실패</p>';
    });
}

// ── 범용 탭 로드 (전사·태극기, 간판, 상품·소재, 원자재) ──

var TAB_FILTERS = {
    transfer: {
        label: '전사',
        match: function(it) {
            var cat = (it.category || it.category_direct || '').toLowerCase();
            return ['전사', '깃발', '윈드배너', '가로등배너'].some(function(k) { return cat.indexOf(k) >= 0; });
        }
    },
    flag: {
        label: '태극기',
        match: function(it) {
            var cat = (it.category || it.category_direct || '').toLowerCase();
            return ['태극기', '새마을기', '민방위기'].some(function(k) { return cat.indexOf(k) >= 0; });
        }
    },
    sign: {
        label: '간판',
        match: function(it) {
            var cat = (it.category || it.category_direct || '').toLowerCase();
            return cat.indexOf('간판') >= 0;
        }
    },
    goods: {
        label: '상품',
        match: function(it) {
            var type = (it.item_type || '').toUpperCase();
            return type === 'GOODS' || (type !== 'MATERIAL' && !it.print_method_id && !['전사','깃발','윈드배너','가로등배너','민방위기','태극기','새마을기','간판'].some(function(k) { return (it.category || '').toLowerCase().indexOf(k) >= 0; }));
        }
    },
    rawMaterial: {
        label: '원자재',
        match: function(it) {
            return (it.item_type || '').toUpperCase() === 'MATERIAL' || (it.item_code || '').startsWith('RM-');
        }
    }
};

// ── 원자재 그룹 카드 뷰 ──────────────────────────────────────

function loadRawMaterialGroupView() {
    var search = (document.getElementById('rmSearch') || {}).value || '';
    var rmSubCat = (document.getElementById('rmSubCatFilter') || {}).value || '';
    var rmMediaFilter = (document.getElementById('rmMediaFilter') || {}).value || '';

    // 아이템 목록 + 연결된 그룹 목록 병렬 조회
    var itemsUrl = '/api/items?limit=500' + (search ? '&search=' + encodeURIComponent(search) : '');
    Promise.all([
        axios.get(itemsUrl),
        rmMediaFilter ? axios.get('/api/items/groups').then(function(r) {
            // media_material_groups에 등록된 item_group 목록 (간접 조회)
            return axios.get('/api/print-system/rm-connections/___all___').catch(function() { return { data: { data: [] } }; });
        }).catch(function() { return { data: { data: [] } }; }) : Promise.resolve(null)
    ]).then(function(results) {
        var res = results[0];
        // 연결된 item_group 수집 (media_material_groups 기반)
        var linkedGroups = new Set();
        if (results[1] && results[1].data && results[1].data.data) {
            results[1].data.data.forEach(function(g) {
                if (g.connectedCount > 0) linkedGroups.add(g.name);
            });
        }

        var allRMs = (res.data.data || []).filter(function(it) {
            if (rmSubCat) return (it.item_code || '').startsWith(rmSubCat);
            return (it.item_type || '').toUpperCase() === 'MATERIAL' || (it.item_code || '').startsWith('RM-');
        });

        // 연결 판단: parent_media_id 또는 item_group이 media_material_groups에 있는 경우
        if (rmMediaFilter === 'linked') allRMs = allRMs.filter(function(it) { return it.parent_media_id || linkedGroups.has(it.item_group); });
        else if (rmMediaFilter === 'unlinked') allRMs = allRMs.filter(function(it) { return !it.parent_media_id && !linkedGroups.has(it.item_group); });

        // item_group 기준 그룹핑
        var groups = {};
        var ungrouped = [];
        allRMs.forEach(function(it) {
            if (it.item_group) {
                if (!groups[it.item_group]) groups[it.item_group] = [];
                groups[it.item_group].push(it);
            } else {
                ungrouped.push(it);
            }
        });

        var html = '';

        // 그룹 카드
        Object.keys(groups).sort().forEach(function(groupName) {
            var items = groups[groupName];
            items.sort(function(a, b) { return (a.width_mm || 0) - (b.width_mm || 0); });

            var subCats = {};
            var widths = [];
            items.forEach(function(it) {
                var sc = it.sub_category || '기타';
                subCats[sc] = (subCats[sc] || 0) + 1;
                if (it.width_mm) widths.push(it.width_mm);
            });
            var subCatStr = Object.keys(subCats).join(', ');
            var widthRange = widths.length > 0
                ? Math.min.apply(null, widths) + '~' + Math.max.apply(null, widths) + 'mm'
                : '';

            // 연결 소재 표시 (parent_media_id 기준)
            var linkedMedia = {};
            items.forEach(function(it) {
                if (it.parent_media_name) linkedMedia[it.parent_media_name] = true;
            });
            var mediaStr = Object.keys(linkedMedia).join(', ') || '';

            var escapedGroup = escapeHtml(groupName).replace(/'/g, "\\'");
            html += '<div class="border rounded-lg hover:border-blue-300 hover:shadow-sm transition mb-2">'
                + '<div class="p-3 cursor-pointer flex items-center justify-between" onclick="toggleRMGroup(this, event)">'
                + '<div>'
                + '<span class="font-semibold text-sm">' + escapeHtml(groupName) + '</span>'
                + '<span class="ml-2 text-xs text-gray-400">' + items.length + '개</span>'
                + (widthRange ? '<span class="ml-2 text-xs text-blue-500">' + widthRange + '</span>' : '')
                + '</div>'
                + '<div class="flex items-center gap-3 text-xs text-gray-500">'
                + '<span class="px-2 py-0.5 rounded-full bg-green-50 text-green-700">' + subCatStr + '</span>'
                + (mediaStr ? '<span class="text-gray-300">|</span><span>소재: ' + escapeHtml(mediaStr) + '</span>' : '')
                + '<button onclick="event.stopPropagation(); openRMBulkEditByGroup(\'' + escapedGroup + '\')" class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="일괄 수정"><i class="fas fa-edit mr-0.5"></i>일괄 수정</button>'
                + '<i class="fas fa-chevron-down text-gray-300 ml-1 rm-group-chevron transition-transform"></i>'
                + '</div></div>'
                + '<div class="rm-group-content hidden border-t">'
                + buildRMGroupTable(items, groupName)
                + '</div></div>';
        });

        // 미분류
        if (ungrouped.length > 0) {
            html += '<div class="border rounded-lg mt-3">'
                + '<div class="p-3 font-medium text-sm text-gray-500">미분류 (' + ungrouped.length + '개)</div>'
                + '<div class="border-t">' + buildRMGroupTable(ungrouped, '') + '</div>'
                + '</div>';
        }

        if (!html) html = '<p class="text-gray-400 text-sm py-8 text-center">등록된 원자재가 없습니다.</p>';
        document.getElementById('rmItemsList').innerHTML = html;
    }).catch(function() {
        document.getElementById('rmItemsList').innerHTML = '<p class="text-red-500 text-sm py-4 text-center">데이터 로드 실패</p>';
    });
}

function buildRMGroupTable(items, groupName) {
    var html = '<table class="w-full text-sm"><thead><tr class="text-left text-gray-500 text-xs">'
        + '<th class="p-2">코드</th><th class="p-2">품목명</th><th class="p-2">규격</th>'
        + '<th class="p-2">분류</th><th class="p-2 text-right">단가</th><th class="p-2">단위</th>'
        + '<th class="p-2">작업</th></tr></thead><tbody>';
    items.forEach(function(it) {
        var escapedName = (it.item_name || '').replace(/'/g, '').replace(/"/g, '');
        var specStr = it.specification || (it.width_mm ? it.width_mm + 'mm' : '') || (it.sub_category === '판재류' ? '판재' : '');
        html += '<tr class="border-t hover:bg-gray-50">'
            + '<td class="p-2 font-mono text-blue-600 text-xs">' + escapeHtml(it.item_code || '') + '</td>'
            + '<td class="p-2 font-medium text-sm">' + escapeHtml(it.item_name || '') + '</td>'
            + '<td class="p-2 text-gray-500 text-xs">' + specStr + '</td>'
            + '<td class="p-2 text-gray-500 text-xs">' + escapeHtml(it.sub_category || it.category || '') + '</td>'
            + '<td class="p-2 text-right tabular-nums text-sm">' + (it.base_price || 0).toLocaleString() + '</td>'
            + '<td class="p-2 text-gray-500 text-xs">' + (it.unit || 'EA') + '</td>'
            + '<td class="p-2">'
            + '<button onclick="editItem(' + it.id + ')" class="text-blue-600 hover:underline text-xs mr-2">수정</button>'
            + '<button onclick="deleteItem(' + it.id + ', \'' + escapedName + '\')" class="text-red-500 hover:underline text-xs">삭제</button>'
            + '</td></tr>';
    });
    html += '</tbody></table>';
    return html;
}

window.toggleRMGroup = function(el, e) {
    // 버튼 클릭은 무시 (일괄 수정 버튼 등)
    if (e && (e.target.closest('button') || e.target.tagName === 'BUTTON')) return;
    var content = el.nextElementSibling;
    var chevron = el.querySelector('.rm-group-chevron');
    if (content) content.classList.toggle('hidden');
    if (chevron) chevron.classList.toggle('rotate-180');
};

function loadTabItems(tabName) {
    // 원자재는 그룹 카드 뷰로 전환
    if (tabName === 'rawMaterial') { loadRawMaterialGroupView(); return; }

    var config = TAB_FILTERS[tabName];
    if (!config) return;

    var searchEl = document.getElementById(tabName === 'rawMaterial' ? 'rmSearch' : tabName + 'Search');
    var search = searchEl ? searchEl.value.trim() : '';

    // 원자재: 하위 분류 필터
    var rmSubCat = '';
    if (tabName === 'rawMaterial') {
        var rmFilter = document.getElementById('rmSubCatFilter');
        rmSubCat = rmFilter ? rmFilter.value : '';
    }

    var url = '/api/items?limit=200';
    if (search) url += '&search=' + encodeURIComponent(search);

    // 원자재: 소재 연결 필터
    var rmMediaFilter = '';
    if (tabName === 'rawMaterial') {
        var rmMediaEl = document.getElementById('rmMediaFilter');
        rmMediaFilter = rmMediaEl ? rmMediaEl.value : '';
    }

    axios.get(url).then(function(res) {
        var allTabItems = res.data.data || [];
        var filtered = allTabItems.filter(function(it) {
            if (rmSubCat) return (it.item_code || '').startsWith(rmSubCat);
            return config.match(it);
        });

        // 원자재: 소재 연결 필터 적용
        if (rmMediaFilter === 'linked') {
            filtered = filtered.filter(function(it) { return it.parent_media_id; });
        } else if (rmMediaFilter === 'unlinked') {
            filtered = filtered.filter(function(it) { return !it.parent_media_id; });
        }

        // 정렬
        if (tabSortState.column) {
            filtered.sort(function(a, b) {
                var va = a[tabSortState.column]; if (va == null) va = '';
                var vb = b[tabSortState.column]; if (vb == null) vb = '';
                if (typeof va === 'number' && typeof vb === 'number') return tabSortState.asc ? va - vb : vb - va;
                return tabSortState.asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
        }

        var listId = tabName === 'rawMaterial' ? 'rmItemsList' : tabName + 'ItemsList';

        if (!filtered.length) {
            document.getElementById(listId).innerHTML = '<p class="text-gray-400 text-sm py-8 text-center">등록된 품목이 없습니다.</p>';
            return;
        }

        var tn = "'" + tabName + "'";
        var isRM = tabName === 'rawMaterial';
        var html = '<table class="w-full text-sm ds-table-striped"><thead><tr class="text-left text-gray-500 text-xs">'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'item_code\')">코드' + sortIcon('item_code') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'item_name\')">품목명' + sortIcon('item_name') + '</th>'
            + (isRM ? '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'width_mm\')">규격' + sortIcon('width_mm') + '</th>' : '')
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'category\')">분류' + sortIcon('category') + '</th>'
            + '<th class="p-2 text-right cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'base_price\')">단가' + sortIcon('base_price') + '</th>'
            + '<th class="p-2 cursor-pointer hover:text-blue-600 select-none" onclick="sortTabItems(' + tn + ', \'unit\')">단위' + sortIcon('unit') + '</th>'
            + '<th class="p-2">작업</th></tr></thead><tbody>';
        filtered.forEach(function(it) {
            var escapedName = (it.item_name || '').replace(/'/g, '').replace(/"/g, '');
            var specStr = '';
            if (isRM) {
                if (it.width_mm) specStr = it.width_mm + 'mm';
                else if (it.sub_category === '판재류') specStr = '판재';
            }
            html += '<tr class="border-t hover:bg-gray-50">'
                + '<td class="p-2 font-mono text-blue-600 text-xs">' + escapeHtml(it.item_code || '') + '</td>'
                + '<td class="p-2 font-medium">' + escapeHtml(it.item_name || '') + '</td>'
                + (isRM ? '<td class="p-2 text-gray-500 text-xs">' + specStr + '</td>' : '')
                + '<td class="p-2 text-gray-500 text-xs">' + escapeHtml(it.sub_category || it.category || '') + '</td>'
                + '<td class="p-2 text-right tabular-nums">' + (it.base_price || 0).toLocaleString() + '</td>'
                + '<td class="p-2 text-gray-500">' + (it.unit || 'EA') + '</td>'
                + '<td class="p-2">'
                + '<button onclick="editItem(' + it.id + ')" class="text-blue-600 hover:underline text-xs mr-2">수정</button>'
                + '<button onclick="deleteItem(' + it.id + ', \'' + escapedName + '\')" class="text-red-500 hover:underline text-xs">삭제</button>'
                + '</td></tr>';
        });
        html += '</tbody></table>';
        document.getElementById(listId).innerHTML = html;
    }).catch(function() {
        var listId = tabName === 'rawMaterial' ? 'rmItemsList' : tabName + 'ItemsList';
        document.getElementById(listId).innerHTML = '<p class="text-red-500 text-sm py-4 text-center">데이터 로드 실패</p>';
    });
}

// ── 탭별 품목 추가 ──

window.showCreateModalForTab = function(tabName) {
    showCreateModal();
    // 탭에 따라 item_type 및 대분류 기본값 설정
    if (tabName === 'transfer') {
        selectItemType('PRODUCT');
        setCategoryForTab('전사');
    } else if (tabName === 'flag') {
        selectItemType('PRODUCT');
        setCategoryForTab('태극기');
    } else if (tabName === 'rawMaterial') {
        selectItemType('MATERIAL');
        loadParentMediaOptions();
    } else if (tabName === 'goods') {
        selectItemType('GOODS');
    } else if (tabName === 'sign') {
        selectItemType('PRODUCT');
        setCategoryForTab('간판');
    }
    updateAutoCodePreview();
};

// 탭에서 품목 추가 시 해당 탭의 첫 번째 카테고리를 기본 선택
function setCategoryForTab(defaultCat) {
    var catEl = document.getElementById('itemCategory');
    if (!catEl) return;
    // 옵션 중 defaultCat과 일치하는 것 선택
    for (var i = 0; i < catEl.options.length; i++) {
        if (catEl.options[i].value === defaultCat) {
            catEl.value = defaultCat;
            return;
        }
    }
}

// 출력방식 목록 로드
function loadPrintMethods() {
    axios.get('/api/print-system/methods').then(function(res) {
        var methods = res.data.data;
        cachedPrintMethods = methods;
        var html = '<table class="w-full text-sm"><thead><tr class="text-left text-gray-500 text-xs">'
            + '<th class="pb-2">출력방식</th><th class="pb-2">코드</th><th class="pb-2">카드그룹</th>'
            + '<th class="pb-2">단가 (원/㎡)</th><th class="pb-2">상태</th></tr></thead><tbody>';
        methods.forEach(function(m) {
            html += '<tr class="border-t">'
                + '<td class="py-2 font-medium">' + escapeHtml(m.name) + '</td>'
                + '<td class="py-2 text-gray-500">' + (m.code || '') + '</td>'
                + '<td class="py-2"><span class="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">' + (m.card_group || '') + '</span></td>'
                + '<td class="py-2"><input type="number" id="method-price-' + m.id + '" value="' + (m.price_per_sqm || 0) + '" '
                + 'class="w-24 px-2 py-1 border rounded text-right">'
                + '<button onclick="updateMethodPrice(' + m.id + ', document.getElementById(\'method-price-' + m.id + '\').value)" '
                + 'class="ml-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">적용</button>'
                + '<button onclick="showPriceHistory(\'METHOD\',' + m.id + ')" class="text-xs text-gray-400 hover:text-blue-600 ml-2" title="단가 이력"><i class="fas fa-history"></i></button></td>'
                + '<td class="py-2">' + (m.is_active ? '<span class="text-green-600">활성</span>' : '<span class="text-gray-400">비활성</span>') + '</td>'
                + '</tr>';
        });
        html += '</tbody></table>';
        document.getElementById('printMethodsList').innerHTML = html;
    }).catch(function() {
        document.getElementById('printMethodsList').innerHTML = '<p class="text-red-500 text-sm">로드 실패</p>';
    });
}

// 출력방식 단가 수정
window.updateMethodPrice = function(id, price) {
    var newPrice = parseFloat(price) || 0;
    showConfirm('출력방식 단가를 변경하면 관련 모든 품목의 기본 단가가 연쇄 업데이트됩니다.\n\n변경 단가: ' + fmtMoneyInput(newPrice) + '원/㎡\n\n계속하시겠습니까?').then(function(confirmed) {
        if (!confirmed) return;
        axios.patch('/api/print-system/methods/' + id, { price_per_sqm: newPrice })
            .then(function(res) {
                if (res.data.success) showToast('단가가 업데이트되었습니다. 관련 품목 연쇄 반영됨.', 'success');
            }).catch(function() { showToast('업데이트 실패', 'error'); });
    });
};

// 소재 목록 로드
function loadPrintMedia() {
    axios.get('/api/print-system/media').then(function(res) {
        var data = res.data.data;
        cachedPrintMediaData = data;
        var html = '';

        // 그룹별 카드 (클릭 → 모달)
        if (data.groups) {
            Object.keys(data.groups).forEach(function(groupName) {
                var items = data.groups[groupName];
                var escapedGroup = escapeHtml(groupName).replace(/'/g, "\\'");
                var methods = new Set();
                var priceRange = [Infinity, 0];
                items.forEach(function(m) {
                    (m.methods || []).forEach(function(mt) { methods.add(mt.name); });
                    var p = m.price_per_unit || 0;
                    if (p < priceRange[0]) priceRange[0] = p;
                    if (p > priceRange[1]) priceRange[1] = p;
                });
                var methodStr = Array.from(methods).join(', ') || '미설정';
                var priceStr = priceRange[0] === priceRange[1]
                    ? fmtMoneyInput(priceRange[0]) + '원'
                    : fmtMoneyInput(priceRange[0]) + '~' + fmtMoneyInput(priceRange[1]) + '원';
                var rmCount = items.reduce(function(sum, m) { return sum + (m.raw_materials || []).length; }, 0);

                html += '<div class="border rounded-lg hover:border-blue-300 hover:shadow-sm transition cursor-pointer" '
                    + 'onclick="openMediaGroupModal(\'' + escapedGroup + '\')">'
                    + '<div class="p-3 flex items-center justify-between">'
                    + '<div>'
                    + '<span class="font-semibold text-sm">' + escapeHtml(groupName) + '</span>'
                    + '<span class="ml-2 text-xs text-gray-400">' + items.length + '개 소재</span>'
                    + '</div>'
                    + '<div class="flex items-center gap-3 text-xs text-gray-500">'
                    + '<span>' + methodStr + '</span>'
                    + '<span class="text-gray-300">|</span>'
                    + '<span>' + priceStr + '</span>'
                    + '<span class="text-gray-300">|</span>'
                    + '<span>원자재 ' + rmCount + '건</span>'
                    + '<i class="fas fa-chevron-right text-gray-300 ml-1"></i>'
                    + '</div></div></div>';
            });
        }

        // 그룹 없는 소재
        if (data.ungrouped && data.ungrouped.length > 0) {
            html += '<div class="border rounded-lg mt-3">'
                + '<div class="p-3 font-medium text-sm text-gray-500">기타 소재 (' + data.ungrouped.length + '건)</div>'
                + '<div class="border-t">' + buildPrintMediaTable(data.ungrouped, '') + '</div>'
                + '</div>';
        }

        if (!html) html = '<p class="text-gray-400 text-sm py-4 text-center">등록된 소재가 없습니다.</p>';
        document.getElementById('printMediaList').innerHTML = html;
    }).catch(function() {
        document.getElementById('printMediaList').innerHTML = '<p class="text-red-500 text-sm">로드 실패</p>';
    });
}

window.togglePrintMediaGroup = function(btn) {
    var content = btn.nextElementSibling;
    var icon = btn.querySelector('.ps-toggle-icon');
    content.classList.toggle('hidden');
    if (icon) {
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-right');
    }
};

function buildPrintMediaTable(items, groupName) {
    var gn = groupName ? escapeHtml(groupName).replace(/'/g, "\\'") : '';
    // 일괄 작업 바
    var html = '<div class="flex items-center gap-2 p-2 bg-gray-50 border-b text-xs">'
        + '<label class="flex items-center gap-1 cursor-pointer"><input type="checkbox" onchange="toggleMediaGroupAll(this,\'' + gn + '\')" class="h-3.5 w-3.5"> 전체선택</label>'
        + '<button onclick="bulkChangeMethodsForGroup(\'' + gn + '\')" class="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">출력방식 일괄</button>'
        + '<button onclick="bulkChangeSizesForGroup(\'' + gn + '\')" class="px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">규격 일괄</button>'
        + '</div>';

    html += '<table class="w-full text-xs ds-table-striped" style="table-layout:fixed"><thead><tr class="text-gray-500 text-left">'
        + '<th class="p-2" style="width:5%"></th>'
        + '<th class="p-2" style="width:23%">소재명</th><th class="p-2" style="width:8%">유형</th><th class="p-2 text-right" style="width:13%">단가/㎡</th>'
        + '<th class="p-2" style="width:15%">규격</th><th class="p-2" style="width:22%">출력방식</th><th class="p-2" style="width:14%">작업</th>'
        + '</tr></thead><tbody>';
    items.forEach(function(m) {
        var specW = m.sheet_width_cm || '';
        var specH = m.sheet_height_cm || '';
        var methodIds = (m.methods || []).map(function(mt) { return mt.id; });
        var methodBadges = cachedPrintMethods.map(function(pm) {
            var active = methodIds.indexOf(pm.id) >= 0;
            return '<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded cursor-pointer select-none '
                + (active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400')
                + '" data-media-id="' + m.id + '" data-method-id="' + pm.id + '" onclick="toggleMediaMethod(this)">'
                + escapeHtml(pm.name) + '</span>';
        }).join(' ');

        html += '<tr class="border-t hover:bg-gray-50" data-media-id="' + m.id + '">'
            + '<td class="p-2 text-center"><input type="checkbox" class="media-row-check h-3.5 w-3.5" value="' + m.id + '"></td>'
            + '<td class="p-2"><input type="text" value="' + escapeHtml(m.name) + '" '
            + 'class="w-full border-0 bg-transparent text-sm font-medium focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1 media-edit-name" data-media-id="' + m.id + '"></td>'
            + '<td class="p-2"><span class="px-1.5 py-0.5 rounded text-xs '
            + (m.media_type === 'SHEET' ? 'bg-orange-50 text-orange-700' : 'bg-cyan-50 text-cyan-700') + '">'
            + (m.media_type === 'SHEET' ? '판재' : '롤') + '</span></td>'
            + '<td class="p-2 text-right"><input type="text" value="' + fmtMoneyInput(m.price_per_unit || 0) + '" '
            + 'class="w-full text-right border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1 media-edit-price" data-media-id="' + m.id + '" '
            + 'onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
            + '<td class="p-2">';
        if (m.media_type === 'SHEET') {
            html += '<input type="number" value="' + specW + '" class="w-10 text-center border rounded px-0.5 media-edit-sw" data-media-id="' + m.id + '"> × '
                + '<input type="number" value="' + specH + '" class="w-10 text-center border rounded px-0.5 media-edit-sh" data-media-id="' + m.id + '">';
        } else {
            html += '<input type="number" value="' + (m.roll_width_cm || '') + '" class="w-14 text-center border rounded px-0.5 media-edit-rw" data-media-id="' + m.id + '" placeholder="폭cm">';
        }
        html += '</td>'
            + '<td class="p-2"><div class="flex flex-wrap gap-1">' + methodBadges + '</div></td>'
            + '<td class="p-2">'
            + '<button onclick="editMedia(' + m.id + ')" class="text-blue-400 hover:text-blue-600 mr-1" title="수정"><i class="fas fa-edit"></i></button>'
            + '<button onclick="showPriceHistory(\'MEDIA\',' + m.id + ')" class="text-gray-400 hover:text-blue-600 mr-1" title="단가 이력"><i class="fas fa-history"></i></button>'
            + '<button onclick="deleteMedia(' + m.id + ')" class="text-red-400 hover:text-red-600" title="삭제"><i class="fas fa-trash"></i></button></td>'
            + '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

// 출력방식 토글 (배지 클릭)
// ═══ 소재 그룹명 일괄 변경 ═══
window.renameMediaGroup = function(oldGroupName) {
    var newGroupName = document.getElementById('mediaGroupNameEdit')?.value?.trim();
    if (!newGroupName || newGroupName === oldGroupName) { showToast('변경할 이름을 입력하세요', 'info'); return; }

    showConfirm('"' + oldGroupName + '" → "' + newGroupName + '"\n\n이 그룹의 모든 소재명·출력품목명·원자재명이 일괄 변경됩니다.\n\n예: "' + oldGroupName + ' 1T 백색" → "' + newGroupName + ' 1T 백색"\n\n계속하시겠습니까?').then(function(confirmed) {
        if (!confirmed) return;
        var items = cachedPrintMediaData?.groups?.[oldGroupName] || [];
        var promises = items.map(function(m) {
            var newName = m.name.replace(oldGroupName, newGroupName);
            return axios.put('/api/print-system/media/' + m.id, { name: newName, media_group: newGroupName });
        });
        Promise.all(promises).then(function() {
            showToast(items.length + '개 소재 이름 변경 완료', 'success');
            loadPrintMedia();
            document.getElementById('mediaGroupModal')?.remove();
        }).catch(function() { showToast('이름 변경 실패', 'error'); });
    });
};

// ═══ 소재 그룹 상세 모달 (통합: 소재 + 원자재) ═══
window.openMediaGroupModal = function(groupName) {
    if (!cachedPrintMediaData?.groups?.[groupName]) { showToast('그룹 데이터 없음', 'error'); return; }
    var items = cachedPrintMediaData.groups[groupName];
    var escapedGroup = escapeHtml(groupName).replace(/'/g, "\\'");

    // 기존 모달 제거
    var existing = document.getElementById('mediaGroupModal');
    if (existing) existing.remove();

    // 원자재 수집
    var allRMs = [];
    items.forEach(function(m) {
        if (m.raw_materials) {
            m.raw_materials.forEach(function(rm) {
                rm._mediaId = m.id;
                rm._mediaName = m.name;
                allRMs.push(rm);
            });
        }
    });
    allRMs.sort(function(a, b) { return (a.width_mm || 0) - (b.width_mm || 0); });

    // 원자재 섹션 HTML
    var rmHtml = '<div class="border-t mt-4 pt-4">'
        + '<div class="flex items-center justify-between mb-2">'
        + '<h3 class="text-sm font-bold text-gray-700"><i class="fas fa-cubes text-cyan-600 mr-1"></i>원자재 (' + allRMs.length + '개)</h3>'
        + '<div class="flex items-center gap-2 text-xs">'
        + '<button onclick="rmGroupBulkRename(\'' + escapedGroup + '\')" class="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"><i class="fas fa-i-cursor mr-1"></i>이름 변경</button>'
        + '<select id="rmGroupBulkSubCat" class="px-1.5 py-0.5 border rounded text-xs"><option value="">분류</option><option value="원단류">원단류</option><option value="판재류">판재류</option><option value="시트류">시트류</option><option value="부자재">부자재</option></select>'
        + '<select id="rmGroupBulkUnit" class="px-1.5 py-0.5 border rounded text-xs"><option value="">단위</option><option value="M">M</option><option value="EA">EA</option><option value="장">장</option><option value="kg">kg</option></select>'
        + '<button onclick="rmGroupToggleSales(true)" class="px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">판매ON</button>'
        + '<button onclick="rmGroupToggleSales(false)" class="px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">판매OFF</button>'
        + '<button onclick="rmGroupBulkDelete()" class="px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"><i class="fas fa-trash mr-1"></i>삭제</button>'
        + '</div></div>';

    if (allRMs.length > 0) {
        var hasMultiMedia = items.filter(function(m) { return m.raw_materials && m.raw_materials.length > 0; }).length > 1;

        rmHtml += '<table class="w-full text-xs" style="table-layout:fixed"><thead><tr class="text-gray-500 border-b">'
            + '<th class="p-1.5 w-7"><input type="checkbox" class="h-3.5 w-3.5" onchange="toggleRMGroupAll(this)" checked></th>'
            + (hasMultiMedia ? '<th class="p-1.5 text-left" style="width:14%">소재</th>' : '')
            + '<th class="p-1.5 text-left" style="width:' + (hasMultiMedia ? '14' : '20') + '%">원자재명</th>'
            + '<th class="p-1.5 text-left" style="width:12%">규격</th>'
            + '<th class="p-1.5 text-right" style="width:12%">매입단가</th>'
            + '<th class="p-1.5 text-center" style="width:7%">판매</th>'
            + '<th class="p-1.5 text-right" style="width:12%">매출단가</th>'
            + '<th class="p-1.5 w-7"></th>'
            + '</tr></thead><tbody>';

        // 소재별로 그룹핑하여 표시
        var mediaOrder = items.filter(function(m) { return m.raw_materials && m.raw_materials.length > 0; });
        mediaOrder.forEach(function(media) {
            var mediaRMs = allRMs.filter(function(rm) { return rm._mediaId === media.id; });
            mediaRMs.forEach(function(rm, idx) {
                var spec = rm.specification || (rm.width_mm ? rm.width_mm + 'mm' : '');
                var isSales = !!rm.is_sales_item;
                rmHtml += '<tr class="border-t hover:bg-gray-50 rm-group-edit-row" data-rm-id="' + rm.id + '" data-media-id="' + rm._mediaId + '">'
                    + '<td class="p-1.5 text-center"><input type="checkbox" class="rm-group-check h-3.5 w-3.5" checked></td>';
                if (hasMultiMedia) {
                    rmHtml += '<td class="p-1.5 text-gray-400">' + (idx === 0 ? escapeHtml(media.name) : '') + '</td>';
                }
                rmHtml += '<td class="p-1.5"><input type="text" value="' + escapeHtml(rm.item_name || '') + '" class="rm-grp-name w-full border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1"></td>'
                    + '<td class="p-1.5"><input type="text" value="' + escapeHtml(spec) + '" class="rm-grp-spec w-full border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1" placeholder="1050mm"></td>'
                    + '<td class="p-1.5 text-right"><input type="text" value="' + fmtMoneyInput(rm.base_price || 0) + '" class="rm-grp-price w-full text-right border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1" onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
                    + '<td class="p-1.5 text-center"><input type="checkbox" class="rm-grp-sales h-3.5 w-3.5" ' + (isSales ? 'checked' : '') + ' onchange="toggleRMGroupSalesPrice(this)"></td>'
                    + '<td class="p-1.5 text-right"><input type="text" value="' + fmtMoneyInput(rm.sales_price || 0) + '" class="rm-grp-sales-price w-full text-right border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 ' + (isSales ? '' : 'opacity-30') + '" ' + (isSales ? '' : 'disabled') + ' onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
                    + '<td class="p-1.5"><button onclick="unlinkRMFromGroup(this)" class="text-red-400 hover:text-red-600" title="연결 해제"><i class="fas fa-unlink text-[10px]"></i></button></td>'
                    + '</tr>';
            });
        });
        rmHtml += '</tbody></table>';
    } else {
        rmHtml += '<p class="text-gray-400 text-xs py-3 text-center">연결된 원자재가 없습니다.</p>';
    }

    // 인라인 추가
    rmHtml += '<div class="flex items-center gap-2 mt-2 pt-2 border-t border-dashed">'
        + '<span class="text-xs text-gray-400"><i class="fas fa-plus mr-1"></i>추가:</span>'
        + '<input type="text" id="rmGroupAddSpec" placeholder="규격 (예: 1050mm, 900x1800)" class="w-40 px-2 py-1 border rounded text-xs">'
        + '<button onclick="addRMToGroup(\'' + escapedGroup + '\')" class="px-2 py-1 bg-cyan-50 text-cyan-600 rounded hover:bg-cyan-100 text-xs">추가</button>'
        + '</div></div>';

    var modal = document.createElement('div');
    modal.id = 'mediaGroupModal';
    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
    modal.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col mx-4">'
        + '<div class="flex items-center justify-between p-4 border-b">'
        + '<div>'
        + '<div class="flex items-center gap-2">'
        + '<h2 class="text-lg font-bold">소재 그룹:</h2>'
        + '<input type="text" id="mediaGroupNameEdit" value="' + escapeHtml(groupName) + '" '
        + 'class="text-lg font-bold border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1 w-40">'
        + '<button onclick="renameMediaGroup(\'' + escapedGroup + '\')" '
        + 'class="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200" title="그룹명 변경 시 모든 소재명·출력품목명·원자재명이 일괄 변경됩니다">이름 적용</button>'
        + (allRMs.length > 0 ? '<span class="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full text-xs font-medium">원자재 ' + allRMs.length + '</span>' : '')
        + '</div>'
        + '<p class="text-xs text-gray-400 mt-0.5">' + items.length + '개 소재 · 그룹명 변경 시 전체 명칭 일괄 반영</p>'
        + '</div>'
        + '<div class="flex items-center gap-2">'
        + '<button onclick="addMediaRowToGroup(\'' + escapedGroup + '\')" '
        + 'class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>소재 추가</button>'
        + '<button onclick="document.getElementById(\'mediaGroupModal\').remove()" '
        + 'class="p-2 text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
        + '</div></div>'
        + '<div class="flex-1 overflow-auto p-4">'
        + buildPrintMediaTable(items, groupName)
        + rmHtml
        + '</div>'
        + '<div class="border-t p-3 bg-gray-50 rounded-b-xl">'
        + '<div class="flex items-center justify-between">'
        + '<div class="flex gap-2 text-xs">'
        + '<button onclick="showGroupPriceModal(\'' + escapedGroup + '\')" '
        + 'class="px-3 py-1.5 bg-amber-50 text-amber-700 rounded hover:bg-amber-100"><i class="fas fa-coins mr-1"></i>단가 일괄 조정</button>'
        + '</div>'
        + '<button onclick="saveUnifiedMediaGroup(\'' + escapedGroup + '\')" '
        + 'class="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">저장</button>'
        + '</div></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

// 그룹 내 소재 추가 (모달 안에서)
window.addMediaRowToGroup = function(groupName) {
    var tbody = document.querySelector('#mediaGroupModal tbody');
    if (!tbody) return;
    var newId = 'new-' + Date.now();
    var methodBadges = cachedPrintMethods.map(function(pm) {
        return '<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded cursor-pointer select-none '
            + 'bg-gray-100 text-gray-400'
            + '" data-media-id="' + newId + '" data-method-id="' + pm.id + '" onclick="toggleMediaMethod(this)">'
            + escapeHtml(pm.name) + '</span>';
    }).join(' ');

    var row = '<tr class="border-t bg-blue-50/30" data-media-id="' + newId + '">'
        + '<td class="p-2 text-center"><input type="checkbox" class="media-row-check h-3.5 w-3.5" value="' + newId + '" checked></td>'
        + '<td class="p-2"><input type="text" value="" placeholder="소재명 입력" '
        + 'class="w-full border border-blue-300 bg-white rounded px-2 py-1 text-sm font-medium focus:ring-1 focus:ring-blue-400 media-edit-name" data-media-id="' + newId + '"></td>'
        + '<td class="p-2"><span class="px-1.5 py-0.5 rounded text-xs bg-orange-50 text-orange-700">판재</span></td>'
        + '<td class="p-2 text-right"><input type="text" value="0" '
        + 'class="w-full text-right border border-blue-300 bg-white rounded px-2 py-1 focus:ring-1 focus:ring-blue-400 media-edit-price" data-media-id="' + newId + '"></td>'
        + '<td class="p-2">'
        + '<input type="number" value="" class="w-10 text-center border rounded px-0.5 media-edit-sw" data-media-id="' + newId + '" placeholder="W"> × '
        + '<input type="number" value="" class="w-10 text-center border rounded px-0.5 media-edit-sh" data-media-id="' + newId + '" placeholder="H">'
        + '</td>'
        + '<td class="p-2"><div class="flex flex-wrap gap-1">' + methodBadges + '</div></td>'
        + '<td class="p-2"><button onclick="this.closest(\'tr\').remove()" class="text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button></td>'
        + '</tr>';
    tbody.insertAdjacentHTML('beforeend', row);
    // 새 행의 이름 입력에 포커스
    var newInput = tbody.querySelector('tr:last-child .media-edit-name');
    if (newInput) newInput.focus();
};

// ── 통합 모달 헬퍼 함수 ──

// 통합 모달: 원자재 전체선택
window.toggleRMGroupAll = function(checkbox) {
    var modal = document.getElementById('mediaGroupModal');
    if (!modal) return;
    modal.querySelectorAll('.rm-group-check').forEach(function(cb) { cb.checked = checkbox.checked; });
};

// 통합 모달: 판매 토글 → 매출단가 활성/비활성
window.toggleRMGroupSalesPrice = function(cb) {
    var row = cb.closest('tr');
    var spInput = row.querySelector('.rm-grp-sales-price');
    if (cb.checked) {
        spInput.disabled = false;
        spInput.classList.remove('opacity-30');
    } else {
        spInput.disabled = true;
        spInput.classList.add('opacity-30');
        spInput.value = fmtMoneyInput(0);
    }
};

// 통합 모달: 판매 일괄 ON/OFF
window.rmGroupToggleSales = function(on) {
    document.querySelectorAll('.rm-group-edit-row').forEach(function(row) {
        var check = row.querySelector('.rm-group-check');
        if (check && check.checked) {
            var salesCb = row.querySelector('.rm-grp-sales');
            salesCb.checked = on;
            toggleRMGroupSalesPrice(salesCb);
        }
    });
};

// 통합 모달: 이름 일괄 변경
window.rmGroupBulkRename = function(groupName) {
    var newName = prompt('변경할 원자재명을 입력하세요:');
    if (!newName) return;
    document.querySelectorAll('.rm-group-edit-row').forEach(function(row) {
        var check = row.querySelector('.rm-group-check');
        if (check && check.checked) {
            row.querySelector('.rm-grp-name').value = newName;
        }
    });
};

// 통합 모달: 선택 삭제 (저장 시 반영)
window.rmGroupBulkDelete = function() {
    var rows = document.querySelectorAll('.rm-group-edit-row');
    var toMark = [];
    rows.forEach(function(row) {
        var check = row.querySelector('.rm-group-check');
        if (check && check.checked && !row.dataset.deleted) toMark.push(row);
    });
    if (!toMark.length) { showToast('선택된 항목이 없습니다.', 'warning'); return; }
    toMark.forEach(function(row) {
        row.classList.add('opacity-20', 'line-through', 'bg-red-50');
        row.dataset.deleted = '1';
        var check = row.querySelector('.rm-group-check');
        if (check) check.checked = false;
    });
    showToast(toMark.length + '개 삭제 예약 (저장 시 반영)', 'info');
};

// 통합 모달: 연결 해제 (저장 시 반영)
window.unlinkRMFromGroup = function(btn) {
    var row = btn.closest('tr');
    row.classList.add('opacity-30', 'line-through');
    row.dataset.unlinked = '1';
    // 체크 해제
    var check = row.querySelector('.rm-group-check');
    if (check) check.checked = false;
    // 해제 버튼 → 되돌리기
    btn.innerHTML = '<i class="fas fa-undo text-[10px]"></i>';
    btn.title = '해제 취소';
    btn.onclick = function() { restoreRMRow(btn); };
};

window.restoreRMRow = function(btn) {
    var row = btn.closest('tr');
    row.classList.remove('opacity-30', 'line-through');
    delete row.dataset.unlinked;
    var check = row.querySelector('.rm-group-check');
    if (check) check.checked = true;
    btn.innerHTML = '<i class="fas fa-unlink text-[10px]"></i>';
    btn.title = '연결 해제';
    btn.onclick = function() { unlinkRMFromGroup(btn); };
};

// 통합 모달: 원자재 인라인 추가
window.addRMToGroup = async function(groupName) {
    var specInput = document.getElementById('rmGroupAddSpec');
    if (!specInput) return;
    var spec = specInput.value.trim();
    if (!spec) { showToast('규격을 입력하세요.', 'warning'); return; }

    // 첫 번째 소재의 ID와 이름 사용
    var firstRow = document.querySelector('#mediaGroupModal tr[data-media-id]');
    var mediaId = firstRow ? firstRow.dataset.mediaId : null;
    var nameInput = firstRow ? firstRow.querySelector('.media-edit-name') : null;
    var mediaName = nameInput ? nameInput.value.trim() : groupName;

    if (!mediaId) { showToast('소재가 없습니다.', 'warning'); return; }

    var widthMm = parseWidthFromSpec(spec);
    var subCat = widthMm ? '원단류' : '판재류';
    var unit = widthMm ? 'M' : 'EA';
    try {
        await axios.post('/api/items', {
            item_name: mediaName,
            item_type: 'MATERIAL',
            category: '원자재',
            sub_category: subCat,
            unit: unit,
            width_mm: widthMm,
            specification: spec,
            parent_media_id: parseInt(mediaId)
        });
        showToast(spec + ' 원자재 추가 완료', 'success');
        specInput.value = '';
        loadPrintMedia();
        setTimeout(function() { openMediaGroupModal(groupName); }, 300);
    } catch(err) { showToast('추가 실패: ' + (err.response?.data?.error || err.message), 'error'); }
};

// 통합 저장
window.saveUnifiedMediaGroup = async function(groupName) {
    // 1) 소재 저장 (기존 saveMediaGroup 로직)
    var mediaRows = document.querySelectorAll('#mediaGroupModal tr[data-media-id]');
    var mediaUpdates = [];
    var newItems = [];
    mediaRows.forEach(function(row) {
        var rawId = row.getAttribute('data-media-id');
        var nameInput = row.querySelector('.media-edit-name');
        if (!nameInput) return;
        var priceInput = row.querySelector('.media-edit-price');
        var swInput = row.querySelector('.media-edit-sw');
        var shInput = row.querySelector('.media-edit-sh');
        var rwInput = row.querySelector('.media-edit-rw');

        var methodIds = [];
        row.querySelectorAll('[data-method-id]').forEach(function(badge) {
            if (badge.classList.contains('bg-blue-100')) methodIds.push(parseInt(badge.dataset.methodId));
        });

        var data = {
            name: nameInput.value.trim(),
            price_per_unit: parseMoney(priceInput?.value || '0'),
            sheet_width_cm: swInput ? parseFloat(swInput.value) || null : undefined,
            sheet_height_cm: shInput ? parseFloat(shInput.value) || null : undefined,
            roll_width_cm: rwInput ? parseFloat(rwInput.value) || null : undefined,
            method_ids: methodIds
        };

        if (String(rawId).startsWith('new-')) {
            if (!data.name) return;
            data.media_type = swInput ? 'SHEET' : 'ROLL';
            data.media_group = groupName;
            newItems.push(data);
        } else {
            mediaUpdates.push({ id: rawId, data: data });
        }
    });

    // 2) 원자재 분류
    var rmRows = document.querySelectorAll('.rm-group-edit-row');
    var rmUpdates = [];
    var rmUnlinks = [];
    var rmDeletes = [];
    var bulkSubCat = document.getElementById('rmGroupBulkSubCat');
    var bulkUnit = document.getElementById('rmGroupBulkUnit');
    var subCatVal = bulkSubCat ? bulkSubCat.value : '';
    var unitVal = bulkUnit ? bulkUnit.value : '';

    rmRows.forEach(function(row) {
        var id = parseInt(row.dataset.rmId);
        if (row.dataset.deleted) { rmDeletes.push(id); return; }
        if (row.dataset.unlinked) { rmUnlinks.push(id); return; }
        var name = row.querySelector('.rm-grp-name').value.trim();
        var spec = row.querySelector('.rm-grp-spec').value.trim();
        var width = parseWidthFromSpec(spec);
        var price = parseMoney(row.querySelector('.rm-grp-price').value);
        var isSales = row.querySelector('.rm-grp-sales').checked ? 1 : 0;
        var salesPrice = isSales ? parseMoney(row.querySelector('.rm-grp-sales-price').value) : 0;

        var data = { item_name: name, specification: spec || null, width_mm: width, base_price: price, is_sales_item: isSales, sales_price: salesPrice };
        if (subCatVal) data.sub_category = subCatVal;
        if (unitVal) data.unit = unitVal;
        rmUpdates.push({ id: id, data: data });
    });

    // 삭제/해제가 있으면 최종 확인
    if (rmDeletes.length > 0 || rmUnlinks.length > 0) {
        var msg = '';
        if (rmDeletes.length) msg += rmDeletes.length + '개 삭제';
        if (rmUnlinks.length) msg += (msg ? ', ' : '') + rmUnlinks.length + '개 연결 해제';
        if (!(await showConfirm(msg + '를 포함하여 저장하시겠습니까?'))) return;
    }

    try {
        // 소재 저장
        var mediaPromises = mediaUpdates.map(function(u) {
            return axios.put('/api/print-system/media/' + u.id, u.data);
        });
        var newPromises = newItems.map(function(n) {
            return axios.post('/api/print-system/media', n);
        });
        await Promise.all(mediaPromises.concat(newPromises));

        // 원자재 삭제
        if (rmDeletes.length > 0) {
            await Promise.all(rmDeletes.map(function(id) { return axios.delete('/api/items/' + id); }));
        }
        // 원자재 연결 해제
        if (rmUnlinks.length > 0) {
            await Promise.all(rmUnlinks.map(function(id) { return axios.patch('/api/items/' + id, { parent_media_id: null }); }));
        }
        // 원자재 수정
        if (rmUpdates.length > 0) {
            await Promise.all(rmUpdates.map(function(u) {
                return axios.patch('/api/items/' + u.id, u.data);
            }));
        }

        // product_materials 동기화
        await axios.post('/api/print-system/sync-product-materials/' + encodeURIComponent(groupName));

        showToast('저장 완료', 'success');
        document.getElementById('mediaGroupModal')?.remove();
        loadPrintMedia();
    } catch(err) {
        showToast('저장 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

// ── 원자재 일괄 수정 모달 (그룹명 기반) ──
window.openRMBulkEditByGroup = async function(groupName) {
    try {
        // 소재에 연결된 그룹이면 소재 그룹 모달로 유도
        if (cachedPrintMediaData && cachedPrintMediaData.groups) {
            for (var mgName in cachedPrintMediaData.groups) {
                var mediaItems = cachedPrintMediaData.groups[mgName];
                var hasLink = mediaItems.some(function(m) {
                    return m.raw_materials && m.raw_materials.some(function(rm) { return rm.item_name === groupName || (rm.item_name && rm.item_name.indexOf(groupName) >= 0); });
                });
                // parent_media_id 기준으로 정확히 확인
                var res0 = await axios.get('/api/items?item_type=MATERIAL&item_group=' + encodeURIComponent(groupName) + '&limit=1');
                var sample = (res0.data.data || [])[0];
                if (sample && sample.parent_media_id) {
                    // 소재 그룹명 찾기
                    var linkedMediaGroup = null;
                    for (var gn in cachedPrintMediaData.groups) {
                        if (cachedPrintMediaData.groups[gn].some(function(m) { return m.id === sample.parent_media_id; })) {
                            linkedMediaGroup = gn;
                            break;
                        }
                    }
                    if (linkedMediaGroup) {
                        openMediaGroupModal(linkedMediaGroup);
                        return;
                    }
                }
                break;
            }
        }
        var res = await axios.get('/api/items?item_type=MATERIAL&item_group=' + encodeURIComponent(groupName) + '&limit=500');
        var rms = (res.data.data || []).sort(function(a, b) { return (a.width_mm || 0) - (b.width_mm || 0); });
        if (!rms.length) { showToast('원자재가 없습니다.', 'warning'); return; }
        openRMBulkEditModalWithItems(rms, groupName);
    } catch(err) {
        showToast('데이터 로드 실패', 'error');
    }
};

// 규격 텍스트 → width_mm 자동 파싱 (롤: "1050mm" → 1050, 판재/기타: null)
function parseWidthFromSpec(spec) {
    if (!spec) return null;
    var s = spec.trim();
    // "1050mm" 또는 "1050" (숫자만) → 롤 폭
    var m = s.match(/^(\d+)\s*mm?$/i);
    if (m) return parseInt(m[1]);
    // 숫자만
    if (/^\d+$/.test(s)) return parseInt(s);
    // "900x1800" 등 다차원 → 롤 아님
    return null;
}

function openRMBulkEditModalWithItems(rms, title) {
    var existing = document.getElementById('rmBulkEditModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'rmBulkEditModal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[60]';

    var tableHtml = '<table class="w-full text-xs" style="table-layout:fixed"><thead><tr class="text-gray-500 border-b">'
        + '<th class="p-1.5 w-7"><input type="checkbox" class="h-3.5 w-3.5" onchange="toggleRMBulkAll(this)" checked></th>'
        + '<th class="p-1.5 text-left" style="width:15%">원자재명</th>'
        + '<th class="p-1.5 text-left" style="width:13%">규격</th>'
        + '<th class="p-1.5 text-right" style="width:12%">매입단가</th>'
        + '<th class="p-1.5 text-center" style="width:7%">판매</th>'
        + '<th class="p-1.5 text-right" style="width:12%">매출단가</th>'
        + '<th class="p-1.5 w-7"></th>'
        + '</tr></thead><tbody>';

    rms.forEach(function(rm) {
        var spec = rm.specification || (rm.width_mm ? rm.width_mm + 'mm' : '');
        var isSales = !!rm.is_sales_item;
        tableHtml += '<tr class="border-t hover:bg-gray-50 rm-bulk-row" data-rm-id="' + rm.id + '">'
            + '<td class="p-1.5 text-center"><input type="checkbox" class="rm-bulk-check h-3.5 w-3.5" checked></td>'
            + '<td class="p-1.5"><input type="text" value="' + escapeHtml(rm.item_name || '') + '" class="rm-bulk-name w-full border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1"></td>'
            + '<td class="p-1.5"><input type="text" value="' + escapeHtml(spec) + '" class="rm-bulk-spec w-full border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 -mx-1" placeholder="1050mm"></td>'
            + '<td class="p-1.5 text-right"><input type="text" value="' + fmtMoneyInput(rm.base_price || 0) + '" class="rm-bulk-price w-full text-right border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1" onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
            + '<td class="p-1.5 text-center"><input type="checkbox" class="rm-bulk-sales h-3.5 w-3.5" ' + (isSales ? 'checked' : '') + ' onchange="toggleRMSalesPrice(this)"></td>'
            + '<td class="p-1.5 text-right"><input type="text" value="' + fmtMoneyInput(rm.sales_price || 0) + '" class="rm-bulk-sales-price w-full text-right border-0 bg-transparent text-sm focus:bg-white focus:border focus:border-blue-300 focus:rounded px-1 ' + (isSales ? '' : 'opacity-30') + '" ' + (isSales ? '' : 'disabled') + ' onfocus="this.select()" onblur="this.value=fmtMoneyInput(parseMoney(this.value))"></td>'
            + '<td class="p-1.5"><button onclick="this.closest(\'tr\').remove()" class="text-red-400 hover:text-red-600"><i class="fas fa-times"></i></button></td>'
            + '</tr>';
    });
    tableHtml += '</tbody></table>';

    // 분류/단위 일괄 변경용 현재 값 파악
    var subCats = {};
    var units = {};
    rms.forEach(function(rm) {
        var sc = rm.sub_category || '기타';
        subCats[sc] = (subCats[sc] || 0) + 1;
        var u = rm.unit || 'EA';
        units[u] = (units[u] || 0) + 1;
    });
    var currentSubCat = Object.keys(subCats).length === 1 ? Object.keys(subCats)[0] : '';
    var currentUnit = Object.keys(units).length === 1 ? Object.keys(units)[0] : '';

    modal.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col mx-4">'
        + '<div class="flex items-center justify-between p-4 border-b">'
        + '<div>'
        + '<h2 class="text-lg font-bold"><i class="fas fa-edit text-blue-600 mr-2"></i>원자재 일괄 수정</h2>'
        + '<p class="text-xs text-gray-400 mt-0.5">그룹: <span class="font-medium text-gray-600">' + escapeHtml(title) + '</span> · ' + rms.length + '개</p>'
        + '</div>'
        + '<button onclick="document.getElementById(\'rmBulkEditModal\').remove()" class="p-2 text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>'
        + '</div>'
        + '<div class="p-3 border-b bg-gray-50 flex flex-wrap items-center gap-2 text-xs">'
        + '<span class="text-gray-500 font-medium">선택 항목:</span>'
        + '<button onclick="rmBulkRename()" class="px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"><i class="fas fa-i-cursor mr-1"></i>이름 변경</button>'
        + '<span class="text-gray-300">|</span>'
        + '<label class="flex items-center gap-1">분류 <select id="rmBulkSubCat" class="px-1.5 py-0.5 border rounded text-xs">'
        + '<option value="">변경 안 함</option><option value="원단류"' + (currentSubCat === '원단류' ? ' selected' : '') + '>원단류</option>'
        + '<option value="판재류"' + (currentSubCat === '판재류' ? ' selected' : '') + '>판재류</option>'
        + '<option value="시트류">시트류</option><option value="잉크">잉크</option>'
        + '<option value="전사자재">전사자재</option><option value="간판자재">간판자재</option>'
        + '<option value="부자재">부자재</option><option value="배너대">배너대</option>'
        + '</select></label>'
        + '<label class="flex items-center gap-1">단위 <select id="rmBulkUnit" class="px-1.5 py-0.5 border rounded text-xs">'
        + '<option value="">변경 안 함</option><option value="M"' + (currentUnit === 'M' ? ' selected' : '') + '>M</option>'
        + '<option value="EA"' + (currentUnit === 'EA' ? ' selected' : '') + '>EA</option>'
        + '<option value="장">장</option><option value="kg">kg</option>'
        + '<option value="L">L</option><option value="SET">SET</option>'
        + '</select></label>'
        + '<span class="text-gray-300">|</span>'
        + '<button onclick="rmBulkToggleSales(true)" class="px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">판매 ON</button>'
        + '<button onclick="rmBulkToggleSales(false)" class="px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">판매 OFF</button>'
        + '<span class="text-gray-300">|</span>'
        + '<button onclick="rmBulkDelete()" class="px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"><i class="fas fa-trash mr-1"></i>삭제</button>'
        + '</div>'
        + '<div class="flex-1 overflow-auto p-4">' + tableHtml + '</div>'
        + '<div class="border-t p-3 flex justify-end gap-2 bg-gray-50 rounded-b-xl">'
        + '<button onclick="document.getElementById(\'rmBulkEditModal\').remove()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>'
        + '<button onclick="saveRMBulkEdit()" class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">저장</button>'
        + '</div></div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

window.toggleRMBulkAll = function(checkbox) {
    document.querySelectorAll('.rm-bulk-check').forEach(function(cb) { cb.checked = checkbox.checked; });
};

// 판매 체크 → 매출단가 활성/비활성
window.toggleRMSalesPrice = function(cb) {
    var row = cb.closest('tr');
    var spInput = row.querySelector('.rm-bulk-sales-price');
    if (cb.checked) {
        spInput.disabled = false;
        spInput.classList.remove('opacity-30');
    } else {
        spInput.disabled = true;
        spInput.classList.add('opacity-30');
        spInput.value = fmtMoneyInput(0);
    }
};

// 선택 항목 판매 ON/OFF 일괄
window.rmBulkToggleSales = function(on) {
    document.querySelectorAll('.rm-bulk-row').forEach(function(row) {
        var check = row.querySelector('.rm-bulk-check');
        if (check && check.checked) {
            var salesCb = row.querySelector('.rm-bulk-sales');
            salesCb.checked = on;
            toggleRMSalesPrice(salesCb);
        }
    });
};

window.rmBulkRename = function() {
    var newName = prompt('변경할 이름을 입력하세요:');
    if (!newName) return;
    document.querySelectorAll('.rm-bulk-row').forEach(function(row) {
        var check = row.querySelector('.rm-bulk-check');
        if (check && check.checked) {
            row.querySelector('.rm-bulk-name').value = newName;
        }
    });
};

window.rmBulkDelete = async function() {
    var rows = document.querySelectorAll('.rm-bulk-row');
    var toDelete = [];
    rows.forEach(function(row) {
        var check = row.querySelector('.rm-bulk-check');
        if (check && check.checked) toDelete.push(row);
    });
    if (!toDelete.length) { showToast('선택된 항목이 없습니다.', 'warning'); return; }
    if (!(await showConfirm(toDelete.length + '개 원자재를 삭제하시겠습니까?', { danger: true }))) return;

    var promises = toDelete.map(function(row) {
        var id = row.dataset.rmId;
        return axios.delete('/api/items/' + id);
    });
    try {
        await Promise.all(promises);
        toDelete.forEach(function(row) { row.remove(); });
        showToast(toDelete.length + '개 삭제 완료', 'success');
    } catch(err) {
        showToast('삭제 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

window.saveRMBulkEdit = async function() {
    var rows = document.querySelectorAll('.rm-bulk-row');
    // 일괄 분류/단위
    var bulkSubCat = document.getElementById('rmBulkSubCat');
    var bulkUnit = document.getElementById('rmBulkUnit');
    var subCatVal = bulkSubCat ? bulkSubCat.value : '';
    var unitVal = bulkUnit ? bulkUnit.value : '';

    var updates = [];
    rows.forEach(function(row) {
        var id = parseInt(row.dataset.rmId);
        var name = row.querySelector('.rm-bulk-name').value.trim();
        var spec = row.querySelector('.rm-bulk-spec').value.trim();
        var width = parseWidthFromSpec(spec);
        var price = parseMoney(row.querySelector('.rm-bulk-price').value);
        var isSales = row.querySelector('.rm-bulk-sales').checked ? 1 : 0;
        var salesPrice = isSales ? parseMoney(row.querySelector('.rm-bulk-sales-price').value) : 0;

        var data = {
            item_name: name,
            specification: spec || null,
            width_mm: width,
            base_price: price,
            is_sales_item: isSales,
            sales_price: salesPrice
        };
        if (subCatVal) data.sub_category = subCatVal;
        if (unitVal) data.unit = unitVal;
        updates.push({ id: id, data: data });
    });

    if (!updates.length) {
        document.getElementById('rmBulkEditModal').remove();
        return;
    }

    try {
        await Promise.all(updates.map(function(u) {
            return axios.patch('/api/items/' + u.id, u.data);
        }));
        showToast(updates.length + '개 원자재 수정 완료', 'success');
        document.getElementById('rmBulkEditModal').remove();
        // 원자재 탭 갱신
        if (typeof loadRawMaterialGroupView === 'function') loadRawMaterialGroupView();
        // 소재 관리도 갱신
        if (typeof loadPrintMedia === 'function') loadPrintMedia();
    } catch(err) {
        showToast('수정 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

window.toggleMediaMethod = function(el) {
    var isActive = el.classList.contains('bg-blue-100');
    el.classList.toggle('bg-blue-100', !isActive);
    el.classList.toggle('text-blue-800', !isActive);
    el.classList.toggle('bg-gray-100', isActive);
    el.classList.toggle('text-gray-400', isActive);
};

// 전체 선택
window.toggleMediaGroupAll = function(checkbox, groupName) {
    var container = checkbox.closest('.border-b').parentElement;
    var checks = container.querySelectorAll('.media-row-check');
    checks.forEach(function(c) { c.checked = checkbox.checked; });
};

// 그룹 저장
window.saveMediaGroup = function(groupName) {
    var rows = document.querySelectorAll('tr[data-media-id]');
    var updates = [];
    var newItems = [];
    rows.forEach(function(row) {
        var rawId = row.getAttribute('data-media-id');
        var isNew = String(rawId).startsWith('new-');
        var nameInput = row.querySelector('.media-edit-name');
        if (!nameInput) return;

        var priceInput = row.querySelector('.media-edit-price');
        var swInput = row.querySelector('.media-edit-sw');
        var shInput = row.querySelector('.media-edit-sh');
        var rwInput = row.querySelector('.media-edit-rw');

        // 활성 출력방식 수집
        var methodBadges = row.querySelectorAll('[data-method-id]');
        var methodIds = [];
        methodBadges.forEach(function(b) {
            if (b.classList.contains('bg-blue-100')) methodIds.push(parseInt(b.getAttribute('data-method-id')));
        });

        var itemData = {
            name: nameInput.value.trim(),
            price_per_unit: parseMoney(priceInput?.value || '0'),
            sheet_width_cm: swInput ? parseFloat(swInput.value) || null : undefined,
            sheet_height_cm: shInput ? parseFloat(shInput.value) || null : undefined,
            roll_width_cm: rwInput ? parseFloat(rwInput.value) || null : undefined,
            method_ids: methodIds
        };

        if (isNew) {
            if (!itemData.name) return; // 빈 이름 스킵
            itemData.media_type = swInput ? 'SHEET' : 'ROLL';
            itemData.media_group = groupName;
            newItems.push(itemData);
        } else {
            itemData.id = parseInt(rawId);
            updates.push(itemData);
        }
    });

    if (updates.length === 0 && newItems.length === 0) { showToast('변경 사항이 없습니다', 'info'); return; }

    // 기존 소재 PUT + 신규 소재 POST
    var promises = updates.map(function(u) {
        return axios.put('/api/print-system/media/' + u.id, u);
    });
    var newPromises = newItems.map(function(n) {
        return axios.post('/api/print-system/media', n);
    });
    Promise.all(promises.concat(newPromises)).then(function() {
        showToast((updates.length + newItems.length) + '개 소재 저장 완료', 'success');
        loadPrintMedia();
        var modal = document.getElementById('mediaGroupModal');
        if (modal) modal.remove();
    }).catch(function(err) {
        var msg = err?.response?.data?.error || '저장 실패';
        showToast(msg, 'error');
    });
};

// 출력방식 일괄 변경
window.bulkChangeMethodsForGroup = function(groupName) {
    var checked = getCheckedMediaIds();
    if (checked.length === 0) { showToast('소재를 선택하세요', 'info'); return; }

    // 모달 대신 간단한 체크박스 프롬프트
    var methodHtml = cachedPrintMethods.map(function(m) {
        return '<label class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">'
            + '<input type="checkbox" class="bulk-method-cb h-4 w-4" value="' + m.id + '" checked>'
            + '<span>' + escapeHtml(m.name) + '</span></label>';
    }).join('');

    var modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/30 flex items-center justify-center z-50';
    modal.innerHTML = '<div class="bg-white rounded-xl shadow-xl p-5 w-80">'
        + '<h3 class="font-semibold mb-3">출력방식 일괄 변경 (' + checked.length + '개 소재)</h3>'
        + '<div class="border rounded divide-y">' + methodHtml + '</div>'
        + '<div class="flex gap-2 mt-4">'
        + '<button onclick="applyBulkMethods()" class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">적용</button>'
        + '<button onclick="this.closest(\'.fixed\').remove()" class="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">취소</button>'
        + '</div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.bg-black\\/30').addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

window.applyBulkMethods = function() {
    var modal = document.querySelector('.fixed.inset-0');
    var cbs = modal.querySelectorAll('.bulk-method-cb:checked');
    var methodIds = Array.from(cbs).map(function(c) { return parseInt(c.value); });
    modal.remove();

    var checked = getCheckedMediaIds();
    // 테이블에서 해당 소재의 method 배지 업데이트
    checked.forEach(function(mid) {
        var row = document.querySelector('tr[data-media-id="' + mid + '"]');
        if (!row) return;
        row.querySelectorAll('[data-method-id]').forEach(function(badge) {
            var bmid = parseInt(badge.getAttribute('data-method-id'));
            var active = methodIds.indexOf(bmid) >= 0;
            badge.classList.toggle('bg-blue-100', active);
            badge.classList.toggle('text-blue-800', active);
            badge.classList.toggle('bg-gray-100', !active);
            badge.classList.toggle('text-gray-400', !active);
        });
    });
    showToast(checked.length + '개 소재에 출력방식 반영 (저장 필요)', 'info');
};

// 규격 일괄 변경
window.bulkChangeSizesForGroup = function(groupName) {
    var checked = getCheckedMediaIds();
    if (checked.length === 0) { showToast('소재를 선택하세요', 'info'); return; }

    var modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/30 flex items-center justify-center z-50';
    modal.innerHTML = '<div class="bg-white rounded-xl shadow-xl p-5 w-80">'
        + '<h3 class="font-semibold mb-3">규격 일괄 변경 (' + checked.length + '개 소재)</h3>'
        + '<div class="flex items-center gap-2 mb-4">'
        + '<input type="number" id="bulkSizeW" class="w-20 border rounded px-2 py-1" placeholder="가로cm">'
        + '<span>×</span>'
        + '<input type="number" id="bulkSizeH" class="w-20 border rounded px-2 py-1" placeholder="세로cm">'
        + '</div>'
        + '<div class="flex gap-2">'
        + '<button onclick="applyBulkSizes()" class="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">적용</button>'
        + '<button onclick="this.closest(\'.fixed\').remove()" class="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">취소</button>'
        + '</div></div>';
    document.body.appendChild(modal);
};

window.applyBulkSizes = function() {
    var w = parseFloat(document.getElementById('bulkSizeW').value) || 0;
    var h = parseFloat(document.getElementById('bulkSizeH').value) || 0;
    document.querySelector('.fixed.inset-0').remove();
    if (!w || !h) { showToast('규격을 입력하세요', 'error'); return; }

    var checked = getCheckedMediaIds();
    checked.forEach(function(mid) {
        var row = document.querySelector('tr[data-media-id="' + mid + '"]');
        if (!row) return;
        var sw = row.querySelector('.media-edit-sw');
        var sh = row.querySelector('.media-edit-sh');
        if (sw) sw.value = w;
        if (sh) sh.value = h;
    });
    showToast(checked.length + '개 소재 규격 반영 (저장 필요)', 'info');
};

function getCheckedMediaIds() {
    var checks = document.querySelectorAll('.media-row-check:checked');
    return Array.from(checks).map(function(c) { return parseInt(c.value); });
}

// 출력방식 체크박스 생성 헬퍼
function renderMethodCheckboxes(containerId, selectedIds) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (cachedPrintMethods.length === 0) {
        axios.get('/api/print-system/methods').then(function(res) {
            cachedPrintMethods = res.data.data || [];
            _buildMethodCheckboxes(container, cachedPrintMethods, selectedIds || []);
        });
    } else {
        _buildMethodCheckboxes(container, cachedPrintMethods, selectedIds || []);
    }
}

function _buildMethodCheckboxes(container, methods, selectedIds) {
    container.innerHTML = methods.map(function(m) {
        var checked = selectedIds.indexOf(m.id) >= 0 ? ' checked' : '';
        return '<label class="flex items-center gap-1.5 px-2 py-1 border rounded text-xs cursor-pointer hover:bg-gray-50">'
            + '<input type="checkbox" class="method-checkbox h-3.5 w-3.5" value="' + m.id + '"' + checked + '>'
            + escapeHtml(m.name)
            + '</label>';
    }).join('');
}

function getSelectedMethodIds(containerId) {
    var checks = document.getElementById(containerId).querySelectorAll('.method-checkbox:checked');
    return Array.from(checks).map(function(c) { return parseInt(c.value); });
}

// 소재 유형에 따른 필드 토글
window.toggleMediaSpecFields = function() {
    var type = document.getElementById('mediaType').value;
    document.getElementById('mediaRollFields').classList.toggle('hidden', type !== 'ROLL');
    document.getElementById('mediaSheetFields').classList.toggle('hidden', type !== 'SHEET');
};

// 소재 추가 모달
// 소재 모달 — 판재 규격 행 추가
window.addMediaSheetSizeRow = function(w, h) {
    var container = document.getElementById('mediaSheetSizesList');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'flex gap-1 items-center';
    div.innerHTML = '<input type="number" class="media-sheet-w w-20 px-2 py-1 border rounded text-sm" placeholder="가로" value="' + (w || '') + '">'
        + '<span class="text-gray-400 text-xs">×</span>'
        + '<input type="number" class="media-sheet-h w-20 px-2 py-1 border rounded text-sm" placeholder="세로" value="' + (h || '') + '">'
        + '<span class="text-xs text-gray-400">cm</span>'
        + '<button type="button" onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-500 text-xs ml-1"><i class="fas fa-times"></i></button>';
    container.appendChild(div);
};

// 원자재 탭으로 이동
window.navigateToRMAdd = function() {
    closeMediaAddModal();
    switchMainTab('rawMaterial');
};

// 소재 모달 — 소분류 목록 로드
async function loadMediaSubcategories(selectedId) {
    var sel = document.getElementById('mediaSubcategory');
    if (!sel) return;
    try {
        var res = await axios.get('/api/post-processing/subcategories');
        var subcats = res.data.data || [];
        sel.innerHTML = '<option value="">미지정</option>'
            + subcats.map(function(s) {
                return '<option value="' + s.id + '"' + (s.id == selectedId ? ' selected' : '') + '>' + s.subcat_name + '</option>';
            }).join('');
    } catch(e) {
        sel.innerHTML = '<option value="">로드 실패</option>';
    }
}

window.showMediaAddModal = function() {
    document.getElementById('mediaModalTitle').textContent = '소재 추가';
    document.getElementById('mediaEditId').value = '';
    document.getElementById('mediaName').value = '';
    document.getElementById('mediaType').value = 'ROLL';
    document.getElementById('mediaPrice').value = fmtMoneyInput(0);
    document.getElementById('mediaRollWidth').value = '';
    var sheetList = document.getElementById('mediaSheetSizesList');
    if (sheetList) sheetList.innerHTML = '';
    document.getElementById('mediaGroup').value = '';
    loadMediaSubcategories('');
    // 추가 모드에서는 RM 섹션 숨기기
    var rmSection = document.getElementById('mediaRMSection');
    if (rmSection) rmSection.classList.add('hidden');
    toggleMediaSpecFields();
    renderMethodCheckboxes('mediaMethodCheckboxes', []);
    document.getElementById('mediaAddModal').classList.remove('hidden');
};

window.closeMediaAddModal = function() {
    document.getElementById('mediaAddModal').classList.add('hidden');
};

// 소재 저장
window.saveMedia = function() {
    var id = document.getElementById('mediaEditId').value;
    var name = document.getElementById('mediaName').value.trim();
    var mediaType = document.getElementById('mediaType').value;
    var price = readMoney('mediaPrice');

    if (!name) { showToast('소재명을 입력해주세요.', 'warning'); return; }

    // 판재 규격 수집 (복수)
    var sheetSizesArr = [];
    if (mediaType === 'SHEET') {
        document.querySelectorAll('#mediaSheetSizesList > div').forEach(function(row) {
            var w = parseFloat(row.querySelector('.media-sheet-w')?.value) || 0;
            var h = parseFloat(row.querySelector('.media-sheet-h')?.value) || 0;
            if (w > 0 && h > 0) sheetSizesArr.push({ w: w, h: h });
        });
    }

    var data = {
        name: name,
        media_type: mediaType,
        price_per_unit: price,
        roll_width_cm: mediaType === 'ROLL' ? (parseFloat(document.getElementById('mediaRollWidth').value) || null) : null,
        sheet_width_cm: sheetSizesArr.length > 0 ? sheetSizesArr[0].w : null,
        sheet_height_cm: sheetSizesArr.length > 0 ? sheetSizesArr[0].h : null,
        sheet_sizes: sheetSizesArr.length > 0 ? sheetSizesArr : null,
        media_group: document.getElementById('mediaGroup').value.trim() || null,
        subcategory_id: document.getElementById('mediaSubcategory').value || null
    };

    if (id) {
        // 수정 — 출력방식 연결 변경도 포함
        data.method_ids = getSelectedMethodIds('mediaMethodCheckboxes');
        axios.put('/api/print-system/media/' + id, data).then(function(res) {
            if (res.data.success) {
                var msg = '소재가 수정되었습니다.';
                var dd = res.data.data || {};
                if (dd.created_count > 0) msg += ' (품목 ' + dd.created_count + '개 생성)';
                if (dd.deactivated_count > 0) msg += ' (품목 ' + dd.deactivated_count + '개 비활성화)';
                showToast(msg, 'success');
                closeMediaAddModal();
                loadPrintMedia();
            }
        }).catch(function(err) { showToast('수정 실패: ' + (err.response?.data?.error || err.message), 'error'); });
    } else {
        // 추가 (출력방식 연결 포함)
        data.method_ids = getSelectedMethodIds('mediaMethodCheckboxes');
        axios.post('/api/print-system/media', data).then(function(res) {
            if (res.data.success) {
                var createdCount = (res.data.data.created_items || []).length;
                showToast('소재가 추가되었습니다.' + (createdCount > 0 ? ' (품목 ' + createdCount + '개 자동 생성)' : ''), 'success');
                closeMediaAddModal();
                loadPrintMedia();
            }
        }).catch(function(err) { showToast('추가 실패: ' + (err.response?.data?.error || err.message), 'error'); });
    }
};

// 소재 편집
window.editMedia = function(id) {
    // 캐시에서 찾기
    var media = null;
    if (cachedPrintMediaData) {
        var allMedia = [];
        if (cachedPrintMediaData.groups) {
            Object.values(cachedPrintMediaData.groups).forEach(function(arr) { allMedia = allMedia.concat(arr); });
        }
        if (cachedPrintMediaData.ungrouped) allMedia = allMedia.concat(cachedPrintMediaData.ungrouped);
        media = allMedia.find(function(m) { return m.id === id; });
    }

    if (!media) { showToast('소재 정보를 찾을 수 없습니다.', 'error'); return; }

    document.getElementById('mediaModalTitle').textContent = '소재 수정';
    document.getElementById('mediaEditId').value = id;
    document.getElementById('mediaName').value = media.name || '';
    document.getElementById('mediaType').value = media.media_type || 'ROLL';
    document.getElementById('mediaPrice').value = fmtMoneyInput(media.price_per_unit || 0);
    document.getElementById('mediaRollWidth').value = media.roll_width_cm || '';
    // 판재 규격 복수 표시
    var sheetList = document.getElementById('mediaSheetSizesList');
    if (sheetList) {
        sheetList.innerHTML = '';
        try {
            var sizes = media.sheet_sizes ? (typeof media.sheet_sizes === 'string' ? JSON.parse(media.sheet_sizes) : media.sheet_sizes) : null;
            if (sizes && Array.isArray(sizes) && sizes.length > 0) {
                sizes.forEach(function(s) { addMediaSheetSizeRow(s.w, s.h); });
            } else if (media.sheet_width_cm && media.sheet_height_cm) {
                addMediaSheetSizeRow(media.sheet_width_cm, media.sheet_height_cm);
            }
        } catch(e) {
            if (media.sheet_width_cm && media.sheet_height_cm) addMediaSheetSizeRow(media.sheet_width_cm, media.sheet_height_cm);
        }
    }
    document.getElementById('mediaGroup').value = media.media_group || '';
    loadMediaSubcategories(media.subcategory_id || '');
    toggleMediaSpecFields();

    var connectedMethodIds = (media.methods || []).map(function(m) { return m.id; });
    renderMethodCheckboxes('mediaMethodCheckboxes', connectedMethodIds);

    // 연결된 원자재 표시
    var rmSection = document.getElementById('mediaRMSection');
    var rmList = document.getElementById('mediaRMList');
    if (rmSection && rmList) {
        rmSection.classList.remove('hidden');
        if (media.raw_materials && media.raw_materials.length > 0) {
            rmList.innerHTML = media.raw_materials.map(function(rm) {
                var spec = rm.specification || (rm.width_mm ? rm.width_mm + 'mm' : '');
                return '<div class="flex items-center justify-between bg-gray-50 rounded px-2 py-1">'
                    + '<span>' + escapeHtml(rm.item_code) + ' ' + escapeHtml(rm.item_name)
                    + (spec ? ' <span class="text-gray-400 text-xs">' + escapeHtml(spec) + '</span>' : '')
                    + '</span></div>';
            }).join('');
        } else {
            rmList.innerHTML = '<span class="text-gray-400">연결된 원자재 없음</span>';
        }
    }

    document.getElementById('mediaAddModal').classList.remove('hidden');
};

window.deleteMedia = async function(id) {
    if (!(await showConfirm('이 소재를 삭제하시겠습니까? 관련 품목도 비활성화됩니다.', { danger: true }))) return;
    axios.delete('/api/print-system/media/' + id).then(function(res) {
        if (res.data.success) {
            showToast('소재가 삭제되었습니다.', 'success');
            loadPrintMedia();
        }
    }).catch(function(err) { showToast('삭제 실패: ' + (err.response?.data?.error || err.message), 'error'); });
};

// 일괄 추가 모달
// ===== 소재 일괄 추가 (교차 생성) =====
var bulkAxisData = { 1: [], 2: [] };
var bulkRollWidthsData = [];

window.addBulkRollWidth = function() {
    var input = document.getElementById('bulkRollWidthNewVal');
    var val = parseInt(input.value);
    if (!val || val <= 0) return;
    if (bulkRollWidthsData.includes(val)) { showToast('이미 추가됨', 'warning'); return; }
    bulkRollWidthsData.push(val);
    bulkRollWidthsData.sort(function(a, b) { return a - b; });
    input.value = '';
    renderBulkRollWidths();
};

window.removeBulkRollWidth = function(idx) {
    bulkRollWidthsData.splice(idx, 1);
    renderBulkRollWidths();
};

function renderBulkRollWidths() {
    var container = document.getElementById('bulkRollWidths');
    container.innerHTML = bulkRollWidthsData.map(function(w, i) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded text-xs">'
            + w + '폭'
            + '<button type="button" onclick="removeBulkRollWidth(' + i + ')" class="text-cyan-400 hover:text-red-500">&times;</button></span>';
    }).join('');
}

window.showMediaBulkAddModal = function() {
    document.getElementById('bulkMediaBaseName').value = '';
    document.getElementById('bulkMediaType').value = 'ROLL';
    document.getElementById('bulkAxis1Name').value = '두께';
    document.getElementById('bulkAxis2Name').value = '색상';
    bulkAxisData = { 1: [], 2: [] };
    document.getElementById('bulkAxis1Values').innerHTML = '';
    document.getElementById('bulkAxis2Values').innerHTML = '';
    document.getElementById('bulkAxis1NewVal').value = '';
    document.getElementById('bulkAxis2NewVal').value = '';
    document.getElementById('bulkMatrixPrice').checked = false;
    document.getElementById('bulkPreview').classList.add('hidden');
    var sheetArea = document.getElementById('bulkSheetSizesArea');
    if (sheetArea) sheetArea.classList.add('hidden');
    var sheetSizes = document.getElementById('bulkSheetSizes');
    if (sheetSizes) sheetSizes.innerHTML = '';
    bulkRollWidthsData = [];
    var rollWidths = document.getElementById('bulkRollWidths');
    if (rollWidths) rollWidths.innerHTML = '';
    var rollWidthNew = document.getElementById('bulkRollWidthNewVal');
    if (rollWidthNew) rollWidthNew.value = '';
    var rmWidthsArea = document.getElementById('bulkRollWidthsArea');
    if (rmWidthsArea) rmWidthsArea.classList.remove('hidden');
    var sheetRMCheck = document.getElementById('bulkSheetRMAutoCheck');
    if (sheetRMCheck) sheetRMCheck.checked = true;
    renderMethodCheckboxes('bulkMediaMethodCheckboxes', []);
    renderBulkPriceTable();
    document.getElementById('mediaBulkAddModal').classList.remove('hidden');
};

window.closeMediaBulkAddModal = function() {
    document.getElementById('mediaBulkAddModal').classList.add('hidden');
};

window.onBulkMediaTypeChange = function() {
    var type = document.getElementById('bulkMediaType').value;
    var sheetArea = document.getElementById('bulkSheetSizesArea');
    var rmWidthsArea = document.getElementById('bulkRollWidthsArea');
    if (type === 'SHEET') {
        if (sheetArea) sheetArea.classList.remove('hidden');
        if (rmWidthsArea) rmWidthsArea.classList.add('hidden');
        if (document.getElementById('bulkSheetSizes').children.length === 0) addBulkSheetSize();
    } else {
        if (sheetArea) sheetArea.classList.add('hidden');
        if (rmWidthsArea) rmWidthsArea.classList.remove('hidden');
    }
};

window.addBulkSheetSize = function() {
    var container = document.getElementById('bulkSheetSizes');
    var div = document.createElement('div');
    div.className = 'flex gap-1 items-center';
    div.innerHTML = '<input type="number" class="bulk-sheet-w w-20 px-2 py-1 border rounded text-sm" placeholder="가로cm">'
        + '<span class="text-gray-400">×</span>'
        + '<input type="number" class="bulk-sheet-h w-20 px-2 py-1 border rounded text-sm" placeholder="세로cm">'
        + '<span class="text-xs text-gray-400">cm</span>'
        + '<button type="button" onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-500 text-xs ml-1"><i class="fas fa-times"></i></button>';
    container.appendChild(div);
};

window.addBulkAxisValue = function(axisNum) {
    var input = document.getElementById('bulkAxis' + axisNum + 'NewVal');
    var val = input.value.trim();
    if (!val) return;
    if (bulkAxisData[axisNum].includes(val)) { showToast('이미 추가된 값입니다.', 'warning'); return; }
    bulkAxisData[axisNum].push(val);
    input.value = '';
    renderBulkAxisTags(axisNum);
    renderBulkPriceTable();
};

function renderBulkAxisTags(axisNum) {
    var container = document.getElementById('bulkAxis' + axisNum + 'Values');
    container.innerHTML = bulkAxisData[axisNum].map(function(v, i) {
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">'
            + escapeHtml(v)
            + '<button type="button" onclick="removeBulkAxisValue(' + axisNum + ',' + i + ')" class="text-blue-400 hover:text-red-500">&times;</button></span>';
    }).join('');
}

window.removeBulkAxisValue = function(axisNum, idx) {
    bulkAxisData[axisNum].splice(idx, 1);
    renderBulkAxisTags(axisNum);
    renderBulkPriceTable();
};

window.renderBulkPriceTable = function() {
    var axis1 = bulkAxisData[1];
    if (axis1.length === 0) {
        // 축 없음 → 단일 단가 입력
        document.getElementById('bulkPriceTable').innerHTML = '<div class="flex items-center gap-2"><span class="text-xs font-medium">단가:</span><input type="number" data-price-key="__default__" class="bulk-price-input w-28 px-2 py-1 border rounded text-sm text-right" value="0" placeholder="원/㎡"></div>';
        return;
    }
    var isMatrix = document.getElementById('bulkMatrixPrice').checked;
    var axis2 = bulkAxisData[2];
    var html = '';

    if (!isMatrix || axis2.length === 0) {
        // 축1별 단가만
        html = '<div class="space-y-1">';
        axis1.forEach(function(v) {
            html += '<div class="flex items-center gap-2">'
                + '<span class="w-20 text-xs font-medium">' + escapeHtml(v) + '</span>'
                + '<input type="number" data-price-key="' + escapeHtml(v) + '" class="bulk-price-input w-28 px-2 py-1 border rounded text-sm text-right" value="0" placeholder="원/㎡">'
                + '</div>';
        });
        html += '</div>';
    } else {
        // 매트릭스: 축1 × 축2
        html = '<table class="text-xs w-full"><thead><tr><th class="p-1 text-left"></th>';
        axis2.forEach(function(c) { html += '<th class="p-1 text-center">' + escapeHtml(c) + '</th>'; });
        html += '</tr></thead><tbody>';
        axis1.forEach(function(r) {
            html += '<tr><td class="p-1 font-medium">' + escapeHtml(r) + '</td>';
            axis2.forEach(function(c) {
                var key = r + '_' + c;
                html += '<td class="p-1"><input type="number" data-price-key="' + escapeHtml(key) + '" class="bulk-price-input w-full px-1 py-0.5 border rounded text-right text-xs" value="0"></td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
    }
    document.getElementById('bulkPriceTable').innerHTML = html;
};

window.previewBulkMedia = function() {
    var baseName = document.getElementById('bulkMediaBaseName').value.trim();
    var axis1 = bulkAxisData[1];
    var axis2 = bulkAxisData[2];
    if (!baseName) { showToast('기본 소재명을 입력하세요.', 'warning'); return; }

    var combos = [];
    if (axis2.length > 0) {
        axis1.forEach(function(a) { axis2.forEach(function(b) { combos.push(a + ' ' + b); }); });
    } else {
        axis1.forEach(function(a) { combos.push(a); });
    }

    var methodIds = getSelectedMethodIds('bulkMediaMethodCheckboxes');
    var itemCount = combos.length * (methodIds.length || 1);
    var html = '<div class="text-gray-600 mb-1">소재 ' + combos.length + '건 + 품목 ' + itemCount + '건 생성 예정</div>';
    html += combos.map(function(c) { return '<div class="text-gray-500">· ' + escapeHtml(baseName) + ' ' + escapeHtml(c) + '</div>'; }).join('');

    document.getElementById('bulkPreviewContent').innerHTML = html;
    document.getElementById('bulkPreview').classList.remove('hidden');
};

window.saveBulkMedia = async function() {
    var baseName = document.getElementById('bulkMediaBaseName').value.trim();
    var mediaType = document.getElementById('bulkMediaType').value;
    if (!baseName) { showToast('기본 소재명을 입력해주세요.', 'warning'); return; }

    var axis1 = bulkAxisData[1];
    // 축 없이 단일 소재 등록도 허용

    var axis2 = bulkAxisData[2];
    var isMatrix = document.getElementById('bulkMatrixPrice').checked && axis2.length > 0;

    // 단가 수집
    var priceValues = {};
    document.querySelectorAll('.bulk-price-input').forEach(function(inp) {
        priceValues[inp.dataset.priceKey] = parseFloat(inp.value) || 0;
    });

    // 축 구성 (축 없으면 빈 배열 → 백엔드에서 단일 소재 생성)
    var axes = [];
    if (axis1.length > 0) {
        axes.push({ name: document.getElementById('bulkAxis1Name').value.trim() || '규격', values: axis1 });
        if (axis2.length > 0) {
            axes.push({ name: document.getElementById('bulkAxis2Name').value.trim() || '속성', values: axis2 });
        }
    }

    // 축 없을 때 default_price
    var defaultPrice = priceValues['__default__'] || 0;

    // 판재 규격 수집
    var sheetSizes = [];
    if (mediaType === 'SHEET') {
        document.querySelectorAll('#bulkSheetSizes > div').forEach(function(row) {
            var w = parseFloat(row.querySelector('.bulk-sheet-w').value) || 0;
            var h = parseFloat(row.querySelector('.bulk-sheet-h').value) || 0;
            if (w > 0 && h > 0) sheetSizes.push({ w: w, h: h });
        });
    }
    var rollWidth = null; // 롤 폭은 RM 폭 목록으로 관리 (단일 입력 제거됨)

    var methodIds = getSelectedMethodIds('bulkMediaMethodCheckboxes');

    // 예상 생성 수
    var comboCount = axis1.length > 0 ? axis1.length * (axis2.length || 1) : 1;
    if (!(await showConfirm('소재 ' + comboCount + '건을 생성하시겠습니까?'))) return;

    try {
        var requestData = {
            base_name: baseName,
            media_type: mediaType,
            axes: axes.length > 0 ? axes : undefined,
            default_price: defaultPrice,
            prices: axes.length > 0 ? { type: isMatrix ? 'matrix' : 'by_first_axis', values: priceValues } : undefined,
            sheet_sizes: sheetSizes.length > 0 ? sheetSizes : null,
            roll_width_cm: rollWidth,
            method_ids: methodIds,
            rm_widths: mediaType === 'ROLL' ? (bulkRollWidthsData.length > 0 ? bulkRollWidthsData : null) : null,
            rm_auto: mediaType === 'SHEET' ? (document.getElementById('bulkSheetRMAutoCheck') ? document.getElementById('bulkSheetRMAutoCheck').checked : false) : false,
            rm_sub_category: mediaType === 'ROLL' ? '원단류' : '판재류'
        };
        var res = await axios.post('/api/print-system/media/bulk', requestData);
        if (res.data.success) {
            var d = res.data.data;
            var msg = '소재 ' + d.media_count + '개, 품목 ' + d.item_count + '개';
            if (d.rm_count > 0) msg += ', 원자재 ' + d.rm_count + '개';
            showToast(msg + ' 생성 완료', 'success');
            closeMediaBulkAddModal();
            loadPrintMedia();
        }
    } catch (err) {
        showToast('일괄 생성 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

// 그룹 단가 조정 모달
window.showGroupPriceModal = function(groupName) {
    document.getElementById('groupPriceName').value = groupName;
    document.getElementById('groupPriceTitle').textContent = '"' + groupName + '" 단가 조정';
    document.getElementById('groupPriceAdjustType').value = 'PERCENT';
    document.getElementById('groupPriceValue').value = '0';
    document.getElementById('groupPricePreview').classList.add('hidden');
    document.getElementById('groupPriceModal').classList.remove('hidden');
    previewGroupPrice();
};

window.closeGroupPriceModal = function() {
    document.getElementById('groupPriceModal').classList.add('hidden');
};

window.previewGroupPrice = function() {
    var groupName = document.getElementById('groupPriceName').value;
    var adjustType = document.getElementById('groupPriceAdjustType').value;
    var value = parseFloat(document.getElementById('groupPriceValue').value) || 0;
    var previewEl = document.getElementById('groupPricePreview');

    if (value === 0) { previewEl.classList.add('hidden'); return; }

    // 캐시에서 그룹 소재 찾기
    var items = (cachedPrintMediaData && cachedPrintMediaData.groups && cachedPrintMediaData.groups[groupName]) || [];
    if (items.length === 0) { previewEl.classList.add('hidden'); return; }

    var html = '<table class="w-full text-xs"><thead><tr class="text-gray-500"><th class="text-left pb-1">소재</th><th class="text-right pb-1">현재</th><th class="text-right pb-1">변경후</th></tr></thead><tbody>';
    items.forEach(function(m) {
        var oldP = m.price_per_unit || 0;
        var newP = adjustType === 'PERCENT' ? Math.round(oldP * (1 + value / 100)) : oldP + value;
        if (newP < 0) newP = 0;
        html += '<tr class="border-t"><td class="py-1">' + escapeHtml(m.name) + '</td>'
            + '<td class="py-1 text-right">' + oldP.toLocaleString() + '</td>'
            + '<td class="py-1 text-right font-medium ' + (newP > oldP ? 'text-red-600' : newP < oldP ? 'text-blue-600' : '') + '">' + newP.toLocaleString() + '</td></tr>';
    });
    html += '</tbody></table>';
    previewEl.innerHTML = html;
    previewEl.classList.remove('hidden');
};

window.applyGroupPrice = async function() {
    var groupName = document.getElementById('groupPriceName').value;
    var adjustType = document.getElementById('groupPriceAdjustType').value;
    var value = parseFloat(document.getElementById('groupPriceValue').value) || 0;

    if (value === 0) { showToast('조정 값을 입력해주세요.', 'warning'); return; }

    if (!(await showConfirm('"' + groupName + '" 그룹의 단가를 ' + (adjustType === 'PERCENT' ? value + '%' : value.toLocaleString() + '원') + ' 조정하시겠습니까?'))) return;

    try {
        var res = await axios.patch('/api/print-system/media/group/' + encodeURIComponent(groupName) + '/price', {
            adjust_type: adjustType,
            value: value
        });
        if (res.data.success) {
            showToast(res.data.data.updated_count + '개 소재 단가 조정 완료', 'success');
            closeGroupPriceModal();
            loadPrintMedia();
        }
    } catch (err) {
        showToast('단가 조정 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
};

// ── 이벤트 리스너 ──────────────────────────────────────────

// Enter 키 검색 지원
var itemSearchEl = document.getElementById('itemSearch');
if (itemSearchEl) {
    itemSearchEl.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && typeof window.applyFilters === 'function') window.applyFilters();
    });
}

// 새 그룹명 입력 시 hidden input 동기화 + 멤버 미리보기
var newGroupInput = document.getElementById('itemGroupNew');
if (newGroupInput) {
    newGroupInput.addEventListener('input', function() {
        document.getElementById('itemGroup').value = this.value.trim();
        showGroupMembers();
    });
}

// 재료 검색 드롭다운 숨김 (외부 클릭 시)
document.addEventListener('click', function(e) {
    var dropdown = document.getElementById('materialSearchDropdown');
    var searchField = document.getElementById('materialSearch');
    if (dropdown && !dropdown.contains(e.target) && e.target !== searchField) {
        dropdown.classList.add('hidden');
    }
});

// 원단 검색 Enter 키 지원
var materialSearchInput = document.getElementById('materialSearch');
if (materialSearchInput) {
    materialSearchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            showMaterialSearchDropdown();
        }
    });
}

// ── 품목 복사 ──────────────────────────────────────────────

// copyItem 제거됨 — UI에 복사 버튼 없음

// ── 일괄 등록 ──────────────────────────────────────────────

function showBulkModal() {
    document.getElementById('bulkItemName').value = '';
    document.getElementById('bulkUnit').value = 'YD';
    document.getElementById('bulkPrice').value = fmtMoneyInput(0);

    // 카테고리 드롭다운 채우기
    var bulkCatSel = document.getElementById('bulkCategory');
    var mainCatSel = document.getElementById('itemCategoryFilter');
    bulkCatSel.innerHTML = '<option value="">선택...</option>';
    Array.from(mainCatSel.options).forEach(function(opt) {
        if (opt.value) bulkCatSel.appendChild(new Option(opt.text, opt.value));
    });

    // 폭 입력란 초기화 (3개)
    var container = document.getElementById('bulkWidthList');
    container.innerHTML = '';
    for (var i = 0; i < 3; i++) {
        addBulkWidthRow();
    }

    document.getElementById('bulkItemPreview').classList.add('hidden');
    document.getElementById('bulkModal').classList.remove('hidden');
}

function closeBulkModal() {
    document.getElementById('bulkModal').classList.add('hidden');
}

function addBulkWidthRow() {
    var container = document.getElementById('bulkWidthList');
    var div = document.createElement('div');
    div.className = 'flex gap-2 items-center';
    div.innerHTML = '<input type="number" class="bulk-width-input flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 914">' +
        '<span class="text-xs text-gray-400">mm</span>' +
        '<button type="button" onclick="this.parentElement.remove(); updateBulkPreview();" class="text-gray-400 hover:text-red-500 text-sm"><i class="fas fa-times"></i></button>';
    container.appendChild(div);

    // 입력 시 미리보기 업데이트
    div.querySelector('input').addEventListener('input', updateBulkPreview);
}

function updateBulkPreview() {
    var name = document.getElementById('bulkItemName').value.trim();
    var inputs = document.querySelectorAll('.bulk-width-input');
    var widths = [];
    inputs.forEach(function(inp) {
        var v = parseInt(inp.value);
        if (v > 0) widths.push(v);
    });

    var preview = document.getElementById('bulkItemPreview');
    if (!preview) return;
    if (!name || widths.length === 0) {
        preview.classList.add('hidden');
        return;
    }

    var html = '<span class="font-medium">생성될 품목 (' + widths.length + '개):</span><br>';
    html += widths.map(function(w) { return '• ' + name + ' (규격: ' + w + 'mm)'; }).join('<br>');
    html += '<br><span class="text-gray-400">그룹: "' + name + '"으로 자동 묶임</span>';
    preview.innerHTML = html;
    preview.classList.remove('hidden');
}

async function saveBulkItems() {
    var name = document.getElementById('bulkItemName').value.trim();
    var category = document.getElementById('bulkCategory').value;
    var unit = document.getElementById('bulkUnit').value || 'YD';
    var price = readMoney('bulkPrice');

    if (!name) { showToast('품목명을 입력해주세요.', 'warning'); return; }
    if (!category) { showToast('대분류를 선택해주세요.', 'warning'); return; }

    var inputs = document.querySelectorAll('.bulk-width-input');
    var widths = [];
    inputs.forEach(function(inp) {
        var v = parseInt(inp.value);
        if (v > 0) widths.push(v);
    });

    if (widths.length === 0) { showToast('원단 폭을 하나 이상 입력해주세요.', 'warning'); return; }

    if (!(await showConfirm(widths.length + '개 품목을 생성하시겠습니까?\n\n' + widths.map(function(w) { return name + ' (규격: ' + w + 'mm)'; }).join('\n')))) {
        return;
    }

    try {
        var res = await axios.post('/api/items/bulk', {
            base: {
                item_name: name,
                category: category,
                unit: unit,
                base_price: price,
                item_type: 'MATERIAL',
                item_group: name
            },
            widths: widths
        });
        if (res.data.success) {
            showToast(res.data.message, 'warning');
            closeBulkModal();
            loadItems();
        }
    } catch (error) {
        showToast('일괄 생성 실패: ' + (error.response?.data?.error || error.message), 'error');
    }
}

// 품목명 입력 시 미리보기 업데이트
var bulkNameInput = document.getElementById('bulkItemName');
if (bulkNameInput) {
    bulkNameInput.addEventListener('input', updateBulkPreview);
}

// ── 창고 구역 드롭다운 로드 ──
var _storageZonesCache = null;
async function loadStorageZonesForItem() {
    try {
        var res = await axios.get('/api/storage-zones');
        if (res.data.success) {
            _storageZonesCache = res.data.data || [];
            var sel = document.getElementById('itemStorageZone');
            if (sel) {
                sel.innerHTML = '<option value="">미지정</option>'
                    + _storageZonesCache.map(function(z) {
                        return '<option value="' + z.id + '">' + z.zone_name
                            + (z.manager_name ? ' (' + z.manager_name + ')' : '') + '</option>';
                    }).join('');
            }
        }
    } catch (e) { console.warn('창고 구역 로드 실패:', e); }
}

// ═══════════════════════════════════════════════════════
// 전역 함수 등록 (onclick 핸들러에서 접근 가능하도록)
// ═══════════════════════════════════════════════════════
window.editItem = editItem;
window.deleteItem = deleteItem;
window.showCreateModal = showCreateModal;
window.closeModal = closeModal;
window.saveItem = saveItem;
window.selectItemType = selectItemType;
window.switchModalTab = switchModalTab;
window.showBulkModal = showBulkModal;
window.closeBulkModal = closeBulkModal;
window.addBulkWidthRow = addBulkWidthRow;
window.updateBulkPreview = updateBulkPreview;
window.saveBulkItems = saveBulkItems;
window.showGroupEditModal = showGroupEditModal;
window.closeGroupEditModal = closeGroupEditModal;
window.saveGroupEdit = saveGroupEdit;
window.toggleGroupField = toggleGroupField;
// applyFilters 제거됨 (tabItems 삭제)
window.updatePricingLabel = updatePricingLabel;
window.loadItems = loadItems;
window.changeMaterialSort = changeMaterialSort;
window.toggleMaterialGroup = toggleMaterialGroup;
window.addMaterialMapping = addMaterialMapping;
window.addMaterialGroupMapping = addMaterialGroupMapping;
window.removeMaterialMapping = removeMaterialMapping;
window.removeMaterialGroupMapping = removeMaterialGroupMapping;
window.showGroupMembers = showGroupMembers;

// ── 단가 이력 조회 ──

window.showPriceHistory = function(targetType, targetId) {
    var modal = document.getElementById('priceHistoryModal');
    var body = document.getElementById('priceHistoryBody');
    if (!modal || !body) return;

    body.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">로딩 중...</p>';
    modal.classList.remove('hidden');

    axios.get('/api/print-system/price-history?target_type=' + targetType + '&target_id=' + targetId + '&limit=20')
        .then(function(res) {
            var history = res.data.data || [];
            if (!history.length) {
                body.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">변경 이력이 없습니다.</p>';
                return;
            }
            var title = history[0].target_name || (targetType + ' #' + targetId);
            document.getElementById('priceHistoryTitle').textContent = title + ' 단가 이력';

            var html = '<table class="w-full text-sm"><thead><tr class="text-left text-gray-500 text-xs">'
                + '<th class="pb-2">변경일</th><th class="pb-2 text-right">이전 단가</th>'
                + '<th class="pb-2 text-right">변경 단가</th><th class="pb-2">변경자</th></tr></thead><tbody>';
            history.forEach(function(h) {
                var date = h.changed_at ? h.changed_at.substring(0, 10) : '';
                var diff = (h.new_price || 0) - (h.old_price || 0);
                var diffClass = diff > 0 ? 'text-red-500' : diff < 0 ? 'text-blue-500' : 'text-gray-400';
                var diffSign = diff > 0 ? '+' : '';
                html += '<tr class="border-t">'
                    + '<td class="py-1.5 text-gray-600">' + date + '</td>'
                    + '<td class="py-1.5 text-right tabular-nums">' + (h.old_price || 0).toLocaleString() + '</td>'
                    + '<td class="py-1.5 text-right tabular-nums font-medium">' + (h.new_price || 0).toLocaleString()
                    + ' <span class="text-xs ' + diffClass + '">(' + diffSign + diff.toLocaleString() + ')</span></td>'
                    + '<td class="py-1.5 text-gray-500 text-xs">' + (h.changed_by_name || '') + '</td>'
                    + '</tr>';
            });
            html += '</tbody></table>';
            body.innerHTML = html;
        })
        .catch(function() {
            body.innerHTML = '<p class="text-red-500 text-sm text-center py-4">이력 로드 실패</p>';
        });
};

window.closePriceHistoryModal = function() {
    document.getElementById('priceHistoryModal').classList.add('hidden');
};

// 초기 로딩
loadCategories();
loadStorageZonesForItem();
// 출력 탭이 기본
switchMainTab('output');
