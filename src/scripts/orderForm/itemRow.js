// orderForm/itemRow.js — 품목 행 빌드/자동완성/추가/삭제/스케일 (Phase 3.1.C 분할)

            function buildItemHtml(id) {
                return `<div class="border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50" id="item-${id}">
                    <input type="hidden" name="ai_group_index_${id}" value="">
                    <input type="hidden" name="ai_analysis_id_${id}" value="">
                    <input type="hidden" name="pricing_method_${id}" value="FIXED">
                    <div class="flex justify-between items-center mb-2">
                        <div class="flex items-center gap-2">
                            <div id="thumb_${id}" class="hidden cursor-pointer" onclick="openThumbModal('thumb_img_${id}')" title="클릭하여 크게 보기">
                                <img id="thumb_img_${id}" class="w-20 h-20 object-contain border border-gray-200 rounded shadow-sm" />
                            </div>
                            <span class="font-bold text-gray-700 text-sm" id="item_label_${id}">품목 #${id}</span>
                            <span id="item_check_${id}" class="hidden text-green-500 text-sm"><i class="fas fa-check-circle"></i></span>
                        </div>
                        <button type="button" onclick="removeItem(${id})" class="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">
                            <i class="fas fa-trash mr-1"></i>삭제
                        </button>
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
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">가로(cm)</label>
                            <input type="number" name="width_${id}" min="0" step="0.1" placeholder="90" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
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
                        if (wInp) { wInp.classList.add('border-purple-500'); wInp.classList.remove('border-gray-300'); }
                        if (hInp) { hInp.classList.add('border-purple-500'); hInp.classList.remove('border-gray-300'); }
                        if (priceLbl) priceLbl.textContent = '단가 (원/㎡)';
                    } else {
                        if (wInp) { wInp.classList.remove('border-purple-500'); wInp.classList.add('border-gray-300'); }
                        if (hInp) { hInp.classList.remove('border-purple-500'); hInp.classList.add('border-gray-300'); }
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
                                specification: it.specification || ''
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

