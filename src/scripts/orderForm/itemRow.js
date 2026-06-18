// orderForm/itemRow.js — 품목 행 빌드/자동완성/추가/삭제/스케일 (Phase 3.1.C 분할)

            // 품목 담당 법인 셀렉트 옵션 (멀티법인 협업). window.__entities는 sheet.js init에서 로드.
            function entityAssignOptions() {
                var list = window.__entities || [];
                var opts = '<option value="">자동</option>';
                list.forEach(function(e) {
                    var nm = window.escapeHtml ? window.escapeHtml(e.short_name || e.name) : (e.short_name || e.name);
                    opts += '<option value="' + e.id + '">' + nm + '</option>';
                });
                return opts;
            }

            function buildItemHtml(id) {
                return `<div class="border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50" id="item-${id}">
                    <input type="hidden" name="ai_group_index_${id}" value="">
                    <input type="hidden" name="ai_analysis_id_${id}" value="">
                    <input type="hidden" name="direct_file_path_${id}" value="">
                    <input type="hidden" name="pricing_method_${id}" value="FIXED">
                    <div class="flex justify-between items-center mb-2">
                        <div class="flex items-center gap-2 flex-wrap">
                            <div id="thumb_${id}" class="hidden cursor-pointer" onclick="openThumbModal('thumb_img_${id}')" title="클릭하여 크게 보기">
                                <img id="thumb_img_${id}" class="w-20 h-20 object-contain border border-gray-200 rounded shadow-sm" />
                            </div>
                            <span class="font-bold text-gray-700 text-sm" id="item_label_${id}">품목 #${id}</span>
                            <span id="item_check_${id}" class="hidden text-green-500 text-sm"><i class="fas fa-check-circle"></i></span>
                            <span id="item_dist_badge_${id}" class="hidden text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium"><i class="fas fa-box mr-0.5"></i>유통</span>
                            <span id="direct_file_chip_${id}" class="hidden inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                <i class="fas fa-paperclip"></i><span id="direct_file_name_${id}" class="max-w-[140px] truncate"></span>
                                <label class="ml-1 flex items-center gap-0.5 cursor-pointer" title="완성본=가공 없이 그대로 복사 / 해제=마감·크기 가공 적용">
                                    <input type="checkbox" id="direct_passthrough_${id}" class="rounded border-purple-300" onchange="onDirectModeToggle(${id})"><span>완성본</span>
                                </label>
                                <button type="button" onclick="clearDirectFile(${id})" class="text-purple-400 hover:text-purple-700" title="연결 해제"><i class="fas fa-times"></i></button>
                            </span>
                        </div>
                        <div class="flex items-center gap-1">
                            <label class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-purple-100 cursor-pointer whitespace-nowrap" title="그룹추출 없이 완성 EPS/AI를 이 라인에 직접 연결">
                                <i class="fas fa-paperclip mr-1"></i>파일 연결
                                <input type="file" accept=".ai,.eps" class="hidden" onchange="onLineFileSelected(${id}, this)">
                            </label>
                            <button type="button" onclick="removeItem(${id})" class="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">
                                <i class="fas fa-trash mr-1"></i>삭제
                            </button>
                        </div>
                    </div>
                    <div class="grid grid-cols-4 md:grid-cols-8 gap-2 mb-2">
                        <div class="col-span-2 relative">
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">품목 <span class="text-red-500">*</span></label>
                            <input type="hidden" name="item_id_${id}">
                            <input type="hidden" name="item_unit_${id}" value="EA">
                            <input type="hidden" name="category_name_${id}">
                            <input type="hidden" name="item_subcat_${id}">
                            <input type="text" name="item_search_${id}" placeholder="품목명 검색..." autocomplete="off"
                                   class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500">
                            <input type="hidden" name="pricing_method_${id}" value="FIXED">
                            <div id="item_spec_info_${id}" class="hidden text-xs text-blue-600 mt-0.5"></div>
                            <div id="item_dd_${id}" class="item-dd hidden"></div>
                        </div>
                        <div>
                            <label id="dim_label_${id}" class="block text-xs font-medium text-gray-600 mb-0.5">가로(cm)</label>
                            <input type="number" name="width_${id}" min="0" step="0.1" placeholder="90" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
                            <input type="text" name="spec_${id}" placeholder="폭 등 규격" class="hidden w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">세로(cm)</label>
                            <input type="number" name="height_${id}" min="0" step="0.1" placeholder="60" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
                        </div>
                        <div id="scale_div_${id}" class="hidden">
                            <label class="block text-xs font-medium text-gray-600 mb-0.5" title="실제크기/파일크기 배율">스케일</label>
                            <input type="number" name="scale_factor_${id}" min="1" step="1" value="1" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" title="실제크기/파일크기 배율. 1/5 축소 파일이면 5 입력" oninput="onScaleFactorChange(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">수량 <span class="text-red-500">*</span></label>
                            <input type="number" name="quantity_${id}" value="1" min="1" required class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label id="unit_price_label_${id}" class="block text-xs font-medium text-gray-600 mb-0.5">단가</label>
                            <input type="text" inputmode="numeric" data-money name="unit_price_${id}" value="0" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">금액</label>
                            <input type="text" name="amount_${id}" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-bold text-blue-700" value="0원"
                                   oninput="onAmountManualEdit(${id})" data-auto-amount="0">
                        </div>
                    </div>
                    <div class="grid grid-cols-4 md:grid-cols-8 gap-2 mb-2">
                        <div class="col-span-3">
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">내용</label>
                            <input type="text" name="content_${id}" placeholder="예: 홍보용 현수막 (선택)" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">단위</label>
                            <input type="text" name="unit_display_${id}" value="EA" readonly class="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-gray-100 text-gray-600">
                        </div>
                        <div class="flex items-end pb-0.5">
                            <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input type="checkbox" name="vat_${id}" checked class="rounded border-gray-300 text-blue-600" onchange="calculateTotal()">
                                <span class="text-gray-700">부가세</span>
                            </label>
                        </div>
                        <div class="flex items-end pb-0.5">
                            <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input type="checkbox" name="price_pending_${id}" class="rounded border-gray-300 text-amber-600" onchange="onPricePendingChange(${id})">
                                <span class="text-gray-700">단가 미정</span>
                            </label>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5" title="생산 담당 법인. 자동=청구 법인이 담당">담당</label>
                            <select name="assigned_entity_${id}" onchange="if(window.updateBillingHint)window.updateBillingHint()" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">${entityAssignOptions()}</select>
                        </div>
                    </div>
                    <div class="pt-2 border-t border-gray-200" id="pp_section_${id}">
                        <label class="block text-xs font-medium text-gray-600 mb-1">후가공 <span class="text-gray-400 font-normal">(품목 선택 시 자동 로드)</span></label>
                        <div id="pp_options_${id}" class="space-y-1 text-sm text-gray-400">품목을 선택하면 후가공 옵션이 표시됩니다.</div>
                        <div id="pp_subtotal_${id}" class="text-right text-sm font-medium text-orange-600 mt-1"></div>
                    </div>
                    <div class="pt-2 border-t border-gray-200" id="finishing_section_${id}">
                        <label class="block text-xs font-medium text-gray-600 mb-1">마감 방식</label>
                        <div class="flex items-center gap-1 mb-1" id="finishing_presets_${id}"></div>
                        <div class="flex items-center gap-2" id="finishing_simple_${id}">
                            <button type="button" onclick="toggleFinishingDetail(${id})" class="text-[10px] text-gray-400 hover:text-blue-600 whitespace-nowrap">개별 설정 ▾</button>
                        </div>
                        <div class="grid grid-cols-4 gap-1 mt-1 hidden" id="finishing_sides_${id}">
                            <div><label class="text-[10px] text-gray-400">상</label><select name="fin_top_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'top')"></select><input name="fin_cm_top_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">하</label><select name="fin_bottom_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'bottom')"></select><input name="fin_cm_bottom_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">좌</label><select name="fin_left_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'left')"></select><input name="fin_cm_left_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">우</label><select name="fin_right_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'right')"></select><input name="fin_cm_right_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                        </div>
                        <div id="finishing_calc_${id}" class="text-xs text-gray-500 mt-1"></div>
                    </div>
                </div>`;
            }

            // 유통 품목(GOODS/부자재) 행: 인쇄 전용 칸(가로·세로) 비활성 + 후가공/마감 섹션 숨김 + '유통' 뱃지.
            // 생산 품목으로 다시 바꾸면 원복.
            function applyDistRowMode(id, isDist) {
                [['width_' + id, '90'], ['height_' + id, '60']].forEach(function(pair) {
                    var el = document.querySelector('[name="' + pair[0] + '"]');
                    if (!el) return;
                    el.disabled = isDist;
                    if (isDist) {
                        el.value = '';
                        el.placeholder = '-';
                        el.classList.add('bg-gray-100', 'text-gray-400');
                    } else {
                        el.placeholder = pair[1];
                        el.classList.remove('bg-gray-100', 'text-gray-400');
                    }
                });
                var ppSec = document.getElementById('pp_section_' + id);
                var finSec = document.getElementById('finishing_section_' + id);
                if (ppSec) ppSec.classList.toggle('hidden', isDist);
                if (finSec) finSec.classList.toggle('hidden', isDist);
                var badge = document.getElementById('item_dist_badge_' + id);
                if (badge) badge.classList.toggle('hidden', !isDist);
                // 유통품목: 가로(cm) 숨기고 규격(폭 등) 자유 텍스트 입력 표시 (생산품목 복귀 시 원복)
                var widthEl = document.querySelector('[name="width_' + id + '"]');
                var specEl = document.querySelector('[name="spec_' + id + '"]');
                var dimLbl = document.getElementById('dim_label_' + id);
                if (specEl && widthEl) {
                    specEl.classList.toggle('hidden', !isDist);
                    widthEl.classList.toggle('hidden', isDist);
                    if (dimLbl) dimLbl.textContent = isDist ? '규격' : '가로(cm)';
                    if (!isDist) specEl.value = '';
                }
            }

            function setupAutocomplete(id) {
                const input = document.querySelector(`[name="item_search_${id}"]`);
                const dd = document.getElementById(`item_dd_${id}`);
                const hidId = document.querySelector(`[name="item_id_${id}"]`);
                const hidUnit = document.querySelector(`[name="item_unit_${id}"]`);
                const hidCat = document.querySelector(`[name="category_name_${id}"]`);
                const hidSubcat = document.querySelector(`[name="item_subcat_${id}"]`);
                const unitDisp = document.querySelector(`[name="unit_display_${id}"]`);
                const priceInp = document.querySelector(`[name="unit_price_${id}"]`);

                // 품목 선택 적용 (공통)
                function applyItemSelection(item) {
                    hidId.value = item.id;
                    input.value = item.name;
                    hidUnit.value = item.unit;
                    hidCat.value = item.category;
                    if (hidSubcat) hidSubcat.value = item.sub_category || '';
                    unitDisp.value = item.unit;
                    priceInp.value = fmtMoneyInput(item.price);
                    var pm = item.pricing_method || 'FIXED';
                    var pmInp = document.querySelector('[name="pricing_method_' + id + '"]');
                    if (pmInp) pmInp.value = pm;
                    var wInp = document.querySelector('[name="width_' + id + '"]');
                    var hInp = document.querySelector('[name="height_' + id + '"]');
                    var priceLbl = document.getElementById('unit_price_label_' + id);
                    if (pm === 'AREA') {
                        if (wInp) { wInp.classList.add('border-blue-500'); wInp.classList.remove('border-gray-300'); }
                        if (hInp) { hInp.classList.add('border-blue-500'); hInp.classList.remove('border-gray-300'); }
                        if (priceLbl) priceLbl.textContent = '단가 (원/㎡)';
                    } else {
                        if (wInp) { wInp.classList.remove('border-blue-500'); wInp.classList.add('border-gray-300'); }
                        if (hInp) { hInp.classList.remove('border-blue-500'); hInp.classList.add('border-gray-300'); }
                        if (priceLbl) priceLbl.textContent = '단가 (원)';
                    }
                    // FIXED 품목에 규격 정보 표시
                    var specInfo = document.getElementById('item_spec_info_' + id);
                    if (specInfo) {
                        if (pm === 'FIXED' && item.specification) {
                            specInfo.textContent = '규격: ' + item.specification;
                            specInfo.classList.remove('hidden');
                        } else {
                            specInfo.classList.add('hidden');
                        }
                    }
                    // 체크 아이콘 표시
                    var checkEl = document.getElementById('item_check_' + id);
                    if (checkEl) checkEl.classList.remove('hidden');

                    // 유통 품목(GOODS/부자재)이면 인쇄 전용 칸/섹션 단순화
                    var itType = (item.item_type || '').toUpperCase();
                    var isDistItem = itType === 'GOODS' || itType === 'MATERIAL';
                    applyDistRowMode(id, isDistItem);
                    // 유통품목이면 품목 마스터 규격을 규격칸에 자동채움(수정 가능)
                    if (isDistItem) {
                        var specSel = document.querySelector('[name="spec_' + id + '"]');
                        if (specSel && !specSel.value) specSel.value = item.specification || '';
                    }

                    // 기성품/유통 재고 부족 경고 (Phase 3) — 차단 X, 안내만. 출고 시 마이너스 허용
                    if (item.id) {
                        axios.get('/api/items/' + item.id + '/stock').then(function(r) {
                            var d = r.data && r.data.data;
                            if (!d || d.production_required !== 0) return; // 기성/유통(제작 불필요)만 대상
                            var qtyEl = document.querySelector('[name="quantity_' + id + '"]');
                            var qty = qtyEl ? (parseFloat(qtyEl.value) || 1) : 1;
                            if (d.stock < qty) {
                                showToast('⚠️ ' + item.name + ' 재고 부족 (현재 ' + d.stock + ' / 주문 ' + qty + ') — 출고 시 마이너스 처리됩니다', 'warning');
                            }
                        }).catch(function(){});
                    }

                    calcItem(id);
                    var subcat = item.sub_category || item.media_subcategory_name || '';
                    loadItemPP(id, subcat);
                    loadFinishingForOrder(id);
                    const clientIdEl = document.getElementById('clientId');
                    const clientId = clientIdEl ? clientIdEl.value : '';
                    if (clientId && item.id) {
                        axios.get('/api/price-list/calculate?item_id=' + item.id + '&client_id=' + clientId)
                            .then(r => { if (r.data?.data?.price > 0) { priceInp.value = fmtMoneyInput(r.data.data.price); calcItem(id); } })
                            .catch(() => {});
                    }
                }

                // 검색 함수 (input/Enter 공용)
                async function doItemSearch(openModal) {
                    var q = input.value.trim();
                    if (!q) return;
                    try {
                        var res = await axios.get('/api/items?search=' + encodeURIComponent(q) + '&type=sales&limit=50');
                        var items = res.data.data || [];
                        if (items.length === 1) {
                            var it = items[0];
                            applyItemSelection({
                                id: it.id, name: it.item_name, price: it.base_price || 0,
                                unit: it.unit || 'EA', category: it.category || it.category_direct || '',
                                sub_category: it.sub_category || it.sub_category_direct || '',
                                pricing_method: it.pricing_method || 'FIXED',
                                specification: it.specification || '',
                                item_type: it.item_type || ''
                            });
                        } else if (items.length > 1 && openModal) {
                            window.openItemSearchModal({ type: 'sales', search: q, onSelect: applyItemSelection });
                        }
                    } catch(e) { console.error('Search error', e); }
                }

                // input: 자동완성 (1건 자동 적용, 모달은 열지 않음)
                input.addEventListener('input', () => {
                    clearTimeout(searchTimers[id]);
                    hidId.value = '';
                    var checkEl2 = document.getElementById('item_check_' + id);
                    if (checkEl2) checkEl2.classList.add('hidden');
                    const q = input.value.trim();
                    if (!q) return;
                    searchTimers[id] = setTimeout(function() { doItemSearch(false); }
                    , 300);
                });

                // Enter: 모달 열기 허용
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        clearTimeout(searchTimers[id]);
                        doItemSearch(true);
                    }
                });
            }


            window.addItemRow = function() {
                var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                var maxId = 0;
                rows.forEach(function(row) {
                    var id = parseInt(row.id.replace('item-', ''));
                    if (id > maxId) maxId = id;
                });
                itemCount = maxId + 1;
                const wrap = document.createElement('div');
                wrap.innerHTML = buildItemHtml(itemCount);
                var newRow = wrap.firstElementChild;
                document.getElementById('itemsContainer').appendChild(newRow);
                setupAutocomplete(itemCount);
                if (window.bindMoneyInputs) window.bindMoneyInputs(newRow);
                renumberDisplay();
            };

            window.addAccessoryRow = async function() {
                try {
                    var res = await axios.get('/api/items?category=ACCESSORY&is_active=1&limit=50');
                    var accessories = (res.data.data || res.data.items || []);
                    if (accessories.length === 0) {
                        showToast('등록된 부속품이 없습니다. 품목 관리에서 부속품을 등록해주세요.', 'warning');
                        return;
                    }

                    // 모달로 부속품 선택
                    var overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center';
                    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

                    var modal = document.createElement('div');
                    modal.style.cssText = 'background:white;border-radius:12px;padding:20px;max-width:400px;width:90%;max-height:70vh;overflow-y:auto';
                    modal.innerHTML = '<h3 class="text-lg font-bold mb-3"><i class="fas fa-puzzle-piece text-amber-600 mr-2"></i>부속품 추가</h3>'
                        + '<p class="text-xs text-gray-500 mb-3">선택한 부속품이 품목 행으로 추가됩니다.</p>'
                        + '<div class="space-y-1">'
                        + accessories.map(function(acc) {
                            return '<button type="button" class="w-full text-left px-3 py-2 rounded hover:bg-amber-50 border border-gray-100 text-sm flex items-center justify-between" '
                                + 'data-acc-id="' + acc.id + '" data-acc-name="' + escapeHtml(acc.item_name || '') + '" data-acc-code="' + escapeHtml(acc.item_code || '') + '">'
                                + '<span><i class="fas fa-cube text-amber-400 mr-2"></i>' + escapeHtml(acc.item_name || '') + '</span>'
                                + '<span class="text-xs text-gray-400">' + escapeHtml(acc.item_code || '') + '</span>'
                                + '</button>';
                        }).join('')
                        + '</div>';

                    modal.querySelectorAll('button[data-acc-id]').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            var accId = btn.dataset.accId;
                            var accName = btn.dataset.accName;
                            addItemRow();
                            var id = itemCount;
                            // 품목 자동 설정
                            var nameEl = document.querySelector('[name="item_search_' + id + '"]');
                            if (nameEl) nameEl.value = accName;
                            var idEl = document.querySelector('[name="item_id_' + id + '"]');
                            if (idEl) idEl.value = accId;
                            var unitEl = document.querySelector('[name="item_unit_' + id + '"]');
                            if (unitEl) unitEl.value = 'EA';
                            var catEl = document.querySelector('[name="category_name_' + id + '"]');
                            if (catEl) catEl.value = '부속품';
                            // 수량에 포커스
                            var qtyEl = document.querySelector('[name="quantity_' + id + '"]');
                            if (qtyEl) { qtyEl.value = ''; qtyEl.focus(); }
                            // 체크 표시
                            var checkEl = document.getElementById('item_check_' + id);
                            if (checkEl) checkEl.classList.remove('hidden');
                            var labelEl = document.getElementById('item_label_' + id);
                            if (labelEl) labelEl.innerHTML = '<span class="text-amber-600"><i class="fas fa-puzzle-piece mr-1"></i>부속품</span> #' + id;
                            overlay.remove();
                            showToast(accName + ' 추가됨. 수량을 입력하세요.', 'success');
                        });
                    });

                    overlay.appendChild(modal);
                    document.body.appendChild(overlay);
                } catch(err) {
                    showToast('부속품 목록 로딩 실패: ' + err.message, 'error');
                }
            };

            window.openThumbModal = function(imgId) {
                var imgEl = document.getElementById(imgId);
                if (!imgEl || !imgEl.src) return;

                var overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;'
                    + 'display:flex;align-items:center;justify-content:center;overflow:hidden';

                var img = document.createElement('img');
                img.src = imgEl.src;
                img.style.cssText = 'width:90vw;height:90vh;object-fit:contain;'
                    + 'transform-origin:center center;transition:transform 0.08s ease-out;cursor:zoom-in';

                var scale = 1;
                overlay.addEventListener('wheel', function(e) {
                    e.preventDefault();
                    var delta = e.deltaY < 0 ? 0.15 : -0.15;
                    scale = Math.max(0.2, Math.min(8, scale + delta));
                    img.style.transform = 'scale(' + scale + ')';
                    img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
                }, { passive: false });

                overlay.addEventListener('click', function(e) {
                    if (e.target === overlay) { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); }
                });

                var onKey = function(e) {
                    if (e.key === 'Escape') { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); }
                };
                document.addEventListener('keydown', onKey);

                var hint = document.createElement('div');
                hint.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);'
                    + 'color:rgba(255,255,255,0.65);font-size:12px;pointer-events:none;user-select:none;'
                    + 'background:rgba(0,0,0,0.4);padding:4px 10px;border-radius:20px';
                hint.textContent = '스크롤: 확대/축소  ·  바깥 클릭 또는 ESC: 닫기';

                overlay.appendChild(img);
                overlay.appendChild(hint);
                document.body.appendChild(overlay);
            };

            window.removeItem = function(id) {
                // 자식 행 먼저 삭제 (묶음 부모행인 경우)
                document.querySelectorAll('[data-parent-row="' + id + '"]').forEach(function(el) {
                    el.remove();
                });
                const el = document.getElementById(`item-${id}`);
                if (el) { el.remove(); renumberDisplay(); calculateTotal(); }
            };

            window.onScaleFactorChange = function(id) {
                const sf = parseFloat(document.querySelector(`[name="scale_factor_${id}"]`)?.value) || 1;
                const wEl = document.querySelector(`[name="width_${id}"]`);
                const hEl = document.querySelector(`[name="height_${id}"]`);
                if (wEl && wEl.dataset.origMm) wEl.value = (parseFloat(wEl.dataset.origMm) / 10 * sf).toFixed(1);
                if (hEl && hEl.dataset.origMm) hEl.value = (parseFloat(hEl.dataset.origMm) / 10 * sf).toFixed(1);

                // 자식 행들의 scale_factor + 크기 업데이트
                document.querySelectorAll('[data-parent-row="' + id + '"]').forEach(function(childRow) {
                    var sfInput = childRow.querySelector('[name^="child_scale_factor_"]');
                    if (sfInput) sfInput.value = sf;
                    var sizeSpan = childRow.querySelector('[data-orig-mm-w]');
                    if (sizeSpan) {
                        var origW = parseFloat(sizeSpan.dataset.origMmW) || 0;
                        var origH = parseFloat(sizeSpan.dataset.origMmH) || 0;
                        if (origW > 0 && origH > 0) {
                            var wCm = (origW / 10 * sf).toFixed(1);
                            var hCm = (origH / 10 * sf).toFixed(1);
                            var sizeLabel = sizeSpan.querySelector('[id^="child_size_"]');
                            if (sizeLabel) sizeLabel.textContent = wCm + '\u00d7' + hCm + 'cm';
                            if (sfInput) {
                                var childId = sfInput.name.replace('child_scale_factor_', '');
                                var wHidden = childRow.querySelector('[name="child_width_' + childId + '"]');
                                var hHidden = childRow.querySelector('[name="child_height_' + childId + '"]');
                                if (wHidden) wHidden.value = wCm;
                                if (hHidden) hHidden.value = hCm;
                            }
                        }
                    }
                });

                calcItem(id);
            };

            window.onParentScaleChange = function(parentId) {
                const sf = parseFloat(document.querySelector('[name="scale_factor_' + parentId + '"]')?.value) || 1;

                // 부모 자신의 규격도 스케일 반영
                const wEl = document.querySelector('[name="width_' + parentId + '"]');
                const hEl = document.querySelector('[name="height_' + parentId + '"]');
                if (wEl && wEl.dataset.origMm) wEl.value = (parseFloat(wEl.dataset.origMm) / 10 * sf).toFixed(1);
                if (hEl && hEl.dataset.origMm) hEl.value = (parseFloat(hEl.dataset.origMm) / 10 * sf).toFixed(1);

                document.querySelectorAll('[data-parent-row="' + parentId + '"]').forEach(function(childRow) {
                    const childId = childRow.id.replace('item_row_', '');
                    const sfInput = childRow.querySelector('[name^="child_scale_factor_"]');
                    if (sfInput) sfInput.value = sf;
                    const outerSpan = childRow.querySelector('[data-orig-mm-w]');
                    if (!outerSpan) return;
                    const wMm = parseFloat(outerSpan.dataset.origMmW || '0');
                    const hMm = parseFloat(outerSpan.dataset.origMmH || '0');
                    if (!wMm && !hMm) return;
                    const wCm = (wMm / 10 * sf).toFixed(1);
                    const hCm = (hMm / 10 * sf).toFixed(1);
                    const sizeEl = document.getElementById('child_size_' + childId);
                    if (sizeEl) sizeEl.textContent = wCm + '×' + hCm + 'cm';
                    const wHid = childRow.querySelector('[name="child_width_' + childId + '"]');
                    const hHid = childRow.querySelector('[name="child_height_' + childId + '"]');
                    if (wHid) wHid.value = wCm;
                    if (hHid) hHid.value = hCm;
                });
                calcItem(parentId);
            };

            // ── 직접 연결: 라인별 완성 EPS/AI 첨부 (그룹추출 우회) ──────────────────
            // 첨부 파일을 skip_analysis로 업로드(분석 안 함) → 라인 히든필드에 연결.
            // 썸네일은 출력 단계(IllustratorAutomat)에서 생성되어 카드/주문에 반영됨.
            window.onLineFileSelected = async function(id, input) {
                var file = (input.files || [])[0];
                if (!file) return;
                var nm = (file.name || '').toLowerCase();
                if (!(nm.endsWith('.ai') || nm.endsWith('.eps'))) {
                    showToast('AI 또는 EPS 파일만 연결할 수 있습니다.', 'warning');
                    input.value = '';
                    return;
                }
                var chip = document.getElementById('direct_file_chip_' + id);
                var nameEl = document.getElementById('direct_file_name_' + id);
                if (nameEl) nameEl.textContent = file.name + ' 업로드 중...';
                if (chip) chip.classList.remove('hidden');
                try {
                    var fd = new FormData();
                    fd.append('file', file);
                    fd.append('skip_analysis', '1');
                    var res = await axios.post('/api/ai-analysis/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    if (!res.data || !res.data.success) throw new Error((res.data && res.data.error) || '업로드 실패');
                    var d = res.data.data;
                    var aiIdEl = document.querySelector('[name="ai_analysis_id_' + id + '"]');
                    if (aiIdEl) aiIdEl.value = d.id;
                    var fpEl = document.querySelector('[name="direct_file_path_' + id + '"]');
                    if (fpEl) fpEl.value = d.file_path || '';
                    // 완성본/가공 기본값: EPS=완성본(복사), AI=가공
                    var pt = document.getElementById('direct_passthrough_' + id);
                    var isEps = nm.endsWith('.eps');
                    if (pt) pt.checked = isEps;
                    onDirectModeToggle(id);
                    if (nameEl) nameEl.textContent = file.name;
                    // 가공 라인은 파일 스케일 입력 표시
                    var scaleDiv = document.getElementById('scale_div_' + id);
                    if (scaleDiv) scaleDiv.classList.toggle('hidden', isEps);
                    showToast('파일 연결됨: ' + file.name + (isEps ? ' (완성본=복사)' : ' (가공)'), 'success');
                } catch(e) {
                    if (nameEl) nameEl.textContent = '';
                    if (chip) chip.classList.add('hidden');
                    showToast('파일 연결 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
                } finally {
                    input.value = '';
                }
            };

            // 완성본(복사, group_index=-3) ↔ 가공(전체문서, -1) 토글. 파일 연결된 라인에만 적용(그룹분석 라인 보호).
            window.onDirectModeToggle = function(id) {
                var pt = document.getElementById('direct_passthrough_' + id);
                var giEl = document.querySelector('[name="ai_group_index_' + id + '"]');
                var fpEl = document.querySelector('[name="direct_file_path_' + id + '"]');
                if (!giEl || !fpEl || !fpEl.value) return;
                giEl.value = (pt && pt.checked) ? -3 : -1;
                var scaleDiv = document.getElementById('scale_div_' + id);
                if (scaleDiv) scaleDiv.classList.toggle('hidden', !!(pt && pt.checked));
            };

            window.clearDirectFile = function(id) {
                var chip = document.getElementById('direct_file_chip_' + id);
                if (chip) chip.classList.add('hidden');
                var nameEl = document.getElementById('direct_file_name_' + id);
                if (nameEl) nameEl.textContent = '';
                var pt = document.getElementById('direct_passthrough_' + id);
                if (pt) pt.checked = false;
                ['ai_analysis_id_', 'direct_file_path_', 'ai_group_index_'].forEach(function(pfx) {
                    var el = document.querySelector('[name="' + pfx + id + '"]');
                    if (el) el.value = '';
                });
                showToast('파일 연결이 해제되었습니다.', 'info');
            };

