// items/modals.js — 품목 CRUD 모달, 자재 매핑 (Phase 3.1.B 분할)

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

