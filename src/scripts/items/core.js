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

// (구) sortTabItems·debouncedLoadTab/Output = 출력/원자재 탭 제거로 함께 삭제 (2026-06-21)

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

// ── 소재(print_media) 폐기 — no-op (단순 구조 모델은 원단=품목, product_materials 연결) ──
function loadLinkedMediaDisplay(itemId) {
    var container = document.getElementById('linkedMediaDisplay');
    if (container) container.innerHTML = '<span class="text-xs text-gray-400">—</span>';
}
function loadParentMediaOptions() { /* 소재 폐기 — no-op */ }

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

// #435: 차감방식=BOARD일 때만 보드규격/로스율 입력 노출
function onDeductionMethodChange() {
    var methodEl = document.getElementById('itemDeductionMethod');
    var boardArea = document.getElementById('boardSpecArea');
    if (!methodEl || !boardArea) return;
    boardArea.classList.toggle('hidden', methodEl.value !== 'BOARD');
    // 롤 폭(mm) 입력: ROLL일 때만 노출
    var rollArea = document.getElementById('rollWidthArea');
    if (rollArea) rollArea.classList.toggle('hidden', methodEl.value !== 'ROLL');
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
            specHint.textContent = '원단류(롤): 폭을 mm/cm로 포함하면 자동 인식 (예: 1270mm, 127cm/50m) — 단위는 폭에만, 길이는 m';
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
    // #435: 자동차감 방식 — 원자재만
    var rmDeductionArea = document.getElementById('rmDeductionArea');
    if (rmDeductionArea) rmDeductionArea.classList.toggle('hidden', type !== 'MATERIAL');
    var rmUomArea = document.getElementById('rmUomArea');  // MU1: 다단위 — 원자재만
    if (rmUomArea) rmUomArea.classList.toggle('hidden', type !== 'MATERIAL');
    if (type === 'MATERIAL') onDeductionMethodChange();

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
            // 분류는 item_categories(활성) 동적 — 원자재/상품/기타 제외(타입별 자동설정)
            var _prodCats = (typeof ITEM_CATS !== 'undefined' && ITEM_CATS.length)
                ? ITEM_CATS.filter(function(c){ return ['MATERIAL','GOODS','ETC'].indexOf(c.category_code) < 0; })
                : ['수성','UV','솔벤','전사','태극기','간판'].map(function(n){ return { category_name: n }; });
            catEl.innerHTML = '<option value="">선택...</option>'
                + _prodCats.map(function(c){ return '<option value="' + c.category_name + '">' + c.category_name + '</option>'; }).join('');
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

    // #499: 폭(width_mm) 힌트를 현재 폼 상태로 갱신. 신규 모달(showCreateModal→selectItemType)·
    //       타입 전환(MATERIAL 등) 모두 이 경로를 타므로, 이전 편집 세션의 stale 힌트가 남지 않는다.
    if (typeof itemsWidthHintRefresh === 'function') itemsWidthHintRefresh();
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

    // 단가 연동 설정 로드
    var plCheck = document.getElementById('groupEditPriceLinked');
    if (plCheck) plCheck.checked = false;
    axios.get('/api/items/group-settings/' + encodeURIComponent(groupName)).then(function(res) {
        if (res.data.settings && plCheck) plCheck.checked = !!res.data.settings.price_linked;
    }).catch(function() {});

    loadGroupPriority(groupName);

    document.getElementById('groupEditModal').classList.remove('hidden');
}

// 동폭 경합이 있는 폭만 "우선 소비 자재" 선택 UI로 노출.
// 경합이 없으면 고를 게 없으므로 섹션 자체를 숨긴다(빈 상자 노출 방지).
var groupPriorityWidths = [];
async function loadGroupPriority(groupName) {
    var box = document.getElementById('groupEditPriorityBox');
    var list = document.getElementById('groupEditPriorityList');
    if (!box || !list) { console.warn('[items] #groupEditPriorityBox/List not found'); return; }
    groupPriorityWidths = [];
    box.classList.add('hidden');
    list.innerHTML = '';
    try {
        var res = await axios.get('/api/items/groups/' + encodeURIComponent(groupName));
        var items = (res.data && res.data.success) ? (res.data.data || []) : [];
        var byWidth = {};
        items.forEach(function(it) {
            if (it.width_mm == null) return;
            (byWidth[it.width_mm] = byWidth[it.width_mm] || []).push(it);
        });
        var widths = Object.keys(byWidth).filter(function(w) { return byWidth[w].length > 1; })
            .sort(function(a, b) { return Number(a) - Number(b); });
        if (widths.length === 0) return;

        groupPriorityWidths = widths.map(function(w) { return { width: w, ids: byWidth[w].map(function(i) { return i.id; }) }; });
        list.innerHTML = widths.map(function(w) {
            var cands = byWidth[w].slice().sort(function(a, b) {
                return (a.group_sort || 0) - (b.group_sort || 0) || a.id - b.id;
            });
            return '<div class="flex items-center gap-2">' +
                '<span class="text-xs text-gray-600 w-16 shrink-0">' + (Number(w) / 10) + 'cm</span>' +
                '<select data-priority-width="' + w + '" class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm">' +
                    cands.map(function(it, idx) {
                        return '<option value="' + it.id + '"' + (idx === 0 ? ' selected' : '') + '>' +
                            escapeHtml(it.item_name || '') + ' (' + escapeHtml(it.item_code || '') + ')</option>';
                    }).join('') +
                '</select></div>';
        }).join('');
        box.classList.remove('hidden');
    } catch (error) {
        console.warn('[items] 우선순위 로드 실패:', error);
    }
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

    // 단가 연동 설정은 별도 저장 (items 일괄 수정과 독립)
    var plCheck = document.getElementById('groupEditPriceLinked');
    var priceLinked = plCheck ? plCheck.checked : false;

    try {
        // 단가 연동 설정 저장 (항상)
        await axios.put('/api/items/group-settings/' + encodeURIComponent(groupName), {
            price_linked: priceLinked ? 1 : 0
        });

        // 일괄 수정 필드가 있으면 함께 저장
        if (Object.keys(updates).length > 0) {
            await axios.patch('/api/items/groups/' + encodeURIComponent(groupName), updates);
        }

        // 우선 소비 자재 (동폭 경합이 있는 폭에서만 노출됨) — 선택=0, 나머지=1
        var priorities = [];
        groupPriorityWidths.forEach(function(w) {
            var sel = document.querySelector('[data-priority-width="' + w.width + '"]');
            if (!sel) return;
            var chosen = parseInt(sel.value, 10);
            w.ids.forEach(function(id) { priorities.push({ id: id, group_sort: id === chosen ? 0 : 1 }); });
        });
        if (priorities.length > 0) {
            await axios.put('/api/items/groups/' + encodeURIComponent(groupName) + '/priority', { priorities: priorities });
        }

        showToast('그룹 "' + groupName + '" 설정 저장 완료' + (priceLinked ? ' (단가 연동 ON)' : ''), 'success');
        closeGroupEditModal();
        loadItems();
    } catch (error) {
        showToast('저장 실패: ' + (error.response?.data?.error || error.message), 'error');
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

// ===== 품목 사진 압축 (업로드 전 클라이언트 리사이즈 + JPG, cardExpenses.js와 동일 로직) =====
// 이미지가 아니면(PDF 등) 원본 그대로. 압축본이 원본보다 크면 원본 사용.
function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1600; quality = quality || 0.82;
    return new Promise(function(resolve) {
        if (!file.type || file.type.indexOf('image/') !== 0) { resolve(file); return; }
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function() {
            var w = img.naturalWidth, h = img.naturalHeight;
            var scale = Math.min(1, maxDim / Math.max(w, h));
            var resized = scale < 1;  // 리사이즈가 필요한(큰) 이미지
            var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
            var canvas = document.createElement('canvas');
            canvas.width = cw; canvas.height = ch;
            canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
            URL.revokeObjectURL(url);
            canvas.toBlob(function(blob) {
                // 리사이즈했으면 항상 JPG 사용(원본이 더 큰 치수). 아니면 더 작은 쪽 선택.
                resolve(blob && (resized || blob.size < file.size) ? blob : file);
            }, 'image/jpeg', quality);
        };
        img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

