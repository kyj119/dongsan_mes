// orderForm/calc.js — 단가·총액 계산 (Phase 3.1.C 분할)

            function calculatePPCost(rowId) {
                const container = document.getElementById('pp_options_' + rowId);
                if (!container) return 0;

                const w = parseFloat(document.querySelector('[name="width_' + rowId + '"]')?.value) || 0;
                const h = parseFloat(document.querySelector('[name="height_' + rowId + '"]')?.value) || 0;
                const qty = parseInt(document.querySelector('[name="quantity_' + rowId + '"]')?.value) || 1;
                let subtotal = 0;

                // 1. Finish PP cost — group by ppId across 4 directions
                var ppCostMap = {};
                container.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                    if (!sel.value) return;
                    var opt = sel.options[sel.selectedIndex];
                    var ppId = opt.dataset.ppId;
                    var dirRow = sel.closest('.pp-finish-dir-row');
                    var margin = parseFloat(dirRow.querySelector('.pp-finish-dir-margin').value) || 0;

                    if (!ppCostMap[ppId]) {
                        ppCostMap[ppId] = {
                            pricingType: opt.dataset.pricingType || 'fixed',
                            unitPrice: parseFloat(opt.dataset.unitPrice) || 0,
                            additionalCost: parseFloat(opt.dataset.additionalCost) || 0,
                            marginSum: 0
                        };
                    }
                    ppCostMap[ppId].marginSum += margin;
                });

                var finishCost = 0;
                Object.keys(ppCostMap).forEach(function(ppId) {
                    var info = ppCostMap[ppId];
                    if (info.pricingType === 'fixed') finishCost += info.additionalCost;
                    else if (info.pricingType === 'per_length') finishCost += info.marginSum * info.unitPrice;
                    else if (info.pricingType === 'per_sqm') finishCost += (w / 100) * (h / 100) * info.unitPrice;
                    else if (info.pricingType === 'per_meter') finishCost += ((w + h) * 2 / 100) * info.unitPrice;
                    else if (info.pricingType === 'per_unit') finishCost += qty * info.unitPrice;
                });
                finishCost = Math.round(finishCost);

                var finishCostSpan = container.querySelector('.pp-finish-cost');
                if (finishCostSpan) finishCostSpan.textContent = finishCost > 0 ? '+' + finishCost.toLocaleString() + '\uc6d0' : '';
                subtotal += finishCost;

                // 2. Punching cost
                const punchSection = container.querySelector('.pp-punching-section');
                const punchCheck = container.querySelector('.pp-punching-check');
                const punchCostSpan = container.querySelector('.pp-punching-cost');
                if (punchCheck && punchCheck.checked && punchSection) {
                    const pricingType = punchSection.dataset.pricingType || 'fixed';
                    const additionalCost = parseFloat(punchSection.dataset.additionalCost) || 0;
                    let cost = pricingType === 'fixed' ? additionalCost : 0;
                    cost = Math.round(cost);
                    if (punchCostSpan) punchCostSpan.textContent = cost > 0 ? '+' + cost.toLocaleString() + '\uc6d0' : '';
                    subtotal += cost;
                } else if (punchCostSpan) {
                    punchCostSpan.textContent = '';
                }

                // 3. Annotation cost
                const annoSection = container.querySelector('.pp-annotation-section');
                const annoCheck = container.querySelector('.pp-annotation-check');
                const annoCostSpan = container.querySelector('.pp-annotation-cost');
                if (annoCheck && annoCheck.checked && annoSection) {
                    const pricingType = annoSection.dataset.pricingType || 'fixed';
                    const additionalCost = parseFloat(annoSection.dataset.additionalCost) || 0;
                    let cost = pricingType === 'fixed' ? additionalCost : 0;
                    cost = Math.round(cost);
                    if (annoCostSpan) annoCostSpan.textContent = cost > 0 ? '+' + cost.toLocaleString() + '\uc6d0' : '';
                    subtotal += cost;
                } else if (annoCostSpan) {
                    annoCostSpan.textContent = '';
                }

                const subtotalEl = document.getElementById('pp_subtotal_' + rowId);
                if (subtotalEl) subtotalEl.textContent = subtotal > 0 ? '\ud6c4\uac00\uacf5 \uc18c\uacc4: ' + subtotal.toLocaleString() + '\uc6d0' : '';
                return subtotal;
            }

            window.calcItem = function(id) {
                var qty = parseInt(document.querySelector('[name="quantity_' + id + '"]').value) || 0;
                var price = parseMoney((document.querySelector('[name="unit_price_' + id + '"]') || {}).value);
                var pmEl = document.querySelector('[name="pricing_method_' + id + '"]');
                var pm = pmEl ? pmEl.value : 'FIXED';
                var amt;
                if (pm === 'AREA') {
                    var wEl = document.querySelector('[name="width_' + id + '"]');
                    var hEl = document.querySelector('[name="height_' + id + '"]');
                    var wRaw = wEl ? (parseFloat(wEl.value) || 0) : 0;
                    var hRaw = hEl ? (parseFloat(hEl.value) || 0) : 0;
                    // 금액 계산용: 10cm 단위 올림 (표시는 원본 유지)
                    var w = Math.ceil(wRaw / 10) * 10;
                    var h = Math.ceil(hRaw / 10) * 10;
                    amt = price * (w / 100) * (h / 100) * qty;
                } else {
                    amt = qty * price;
                }
                // 100원 단위 반올림
                amt = Math.round(amt / 100) * 100;
                var el = document.querySelector('[name="amount_' + id + '"]');
                if (el) {
                    // 금액이 수동 수정되지 않았으면 자동 계산값 적용
                    var wasManual = el.classList.contains('border-amber-400');
                    if (!wasManual) {
                        el.value = amt.toLocaleString() + '원';
                    }
                    el.dataset.autoAmount = String(amt);
                }
                calculateTotal();
            };

            function calculateTotal() {
                var total = 0, vat = 0, ppTotal = 0;
                document.querySelectorAll('#itemsContainer > [id^="item-"]').forEach(function(row) {
                    var id = row.id.replace('item-', '');
                    var isChildInput = row.querySelector('[name^="is_child_"]');
                    var isChild = isChildInput && isChildInput.value === '1';
                    var qty = parseInt((document.querySelector('[name="quantity_' + id + '"]') || {}).value || 0);
                    var price = parseMoney((document.querySelector('[name="unit_price_' + id + '"]') || {}).value);
                    var pmEl = document.querySelector('[name="pricing_method_' + id + '"]');
                    var pm = pmEl ? pmEl.value : 'FIXED';
                    var amt;
                    if (pm === 'AREA') {
                        var wEl = document.querySelector('[name="width_' + id + '"]');
                        var hEl = document.querySelector('[name="height_' + id + '"]');
                        var wRaw2 = wEl ? (parseFloat(wEl.value) || 0) : 0;
                        var hRaw2 = hEl ? (parseFloat(hEl.value) || 0) : 0;
                        var w2 = Math.ceil(wRaw2 / 10) * 10;
                        var h2 = Math.ceil(hRaw2 / 10) * 10;
                        amt = price * (w2 / 100) * (h2 / 100) * qty;
                    } else {
                        amt = qty * price;
                    }
                    amt = Math.round(amt / 100) * 100;
                    total += amt;
                    var vatEl = document.querySelector('[name="vat_' + id + '"]');
                    if (vatEl && vatEl.checked) vat += Math.round(amt * 0.1);
                    if (!isChild) ppTotal += calculatePPCost(id) || 0;
                });
                var discount = parseMoney((document.getElementById('discountAmount') || {}).value);
                document.getElementById('totalAmount').textContent = Math.round(total).toLocaleString();
                document.getElementById('totalVat').textContent = vat.toLocaleString();
                var ppTotalEl = document.getElementById('totalPPCost');
                if (ppTotalEl) ppTotalEl.textContent = ppTotal > 0 ? ppTotal.toLocaleString() : '0';
                document.getElementById('grandTotal').textContent = Math.max(0, Math.round(total) + vat + ppTotal - discount).toLocaleString();
            }

            // Enter 키 스마트 동작 (폼 제출 방지 + 필드별 편의 기능)
            document.getElementById('orderForm').addEventListener('keydown', function(e) {
                if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
                e.preventDefault();

                var el = e.target;
                var name = el.name || el.id || '';

                // 1) 품목 검색 필드: 드롭다운 첫 번째 항목 자동 선택
                if (name.startsWith('item_search_')) {
                    var rowId = name.replace('item_search_', '');
                    var dd = document.getElementById('item_dd_' + rowId);
                    if (dd && !dd.classList.contains('hidden')) {
                        var first = dd.querySelector('.item-dd-entry');
                        if (first) { first.dispatchEvent(new MouseEvent('mousedown', {bubbles: true})); return; }
                    }
                    // 드롭다운 없으면 가로 필드로 이동
                    var wField = document.querySelector('[name="width_' + rowId + '"]');
                    if (wField) wField.focus();
                    return;
                }

                // 2) 수량/단가/규격 필드: 같은 행 내 다음 필드로 이동
                var match = name.match(/^(width|height|quantity|unit_price|content)_(\d+)$/);
                if (match) {
                    var field = match[1];
                    var rid = match[2];
                    var order = ['width', 'height', 'quantity', 'unit_price', 'content'];
                    var idx = order.indexOf(field);
                    if (idx >= 0 && idx < order.length - 1) {
                        // 다음 필드로 이동
                        var next = document.querySelector('[name="' + order[idx + 1] + '_' + rid + '"]');
                        if (next) { next.focus(); next.select(); return; }
                    }
                    // 마지막 필드(content)이면 → 새 품목 행 추가 + 포커스
                    if (field === 'content' || field === 'unit_price') {
                        addItemRow();
                        setTimeout(function() {
                            var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                            var lastRow = rows[rows.length - 1];
                            if (lastRow) {
                                var newId = lastRow.id.replace('item-', '');
                                var searchField = document.querySelector('[name="item_search_' + newId + '"]');
                                if (searchField) searchField.focus();
                            }
                        }, 100);
                        return;
                    }
                }

                // 3) 거래처 검색: 기존 handleClientEnter 유지 (이미 별도 핸들러 있음)
                // 4) 기타 필드: 다음 input으로 포커스 이동 (Tab과 유사)
                var allInputs = Array.from(document.getElementById('orderForm').querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select, textarea'));
                var curIdx = allInputs.indexOf(el);
                if (curIdx >= 0 && curIdx < allInputs.length - 1) {
                    allInputs[curIdx + 1].focus();
                }
            });

            var isSubmitting = false;
            document.getElementById('orderForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                if (isSubmitting) return;

                const clientId = document.getElementById('clientId').value;
                if (!clientId) { showToast('거래처를 선택하세요.', 'warning'); return; }

                // 납기일 과거 검증
                const deliveryDateVal = document.getElementById('deliveryDate').value;
                if (deliveryDateVal) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const delivery = new Date(deliveryDateVal);
                    if (delivery < today) {
                        if (!(await showConfirm('납기일이 과거입니다 (' + deliveryDateVal + '). 계속 진행하시겠습니까?'))) {
                            return;
                        }
                    }
                }

                // 일반/부모 행(item-N) + 자식 행(item_row_N) 모두 수집
                const itemRows = document.querySelectorAll('#itemsContainer > [id^="item"]');
                if (!itemRows.length) { showToast('최소 1개 이상의 품목을 추가하세요.', 'warning'); return; }

                const items = [];
                let valid = true;
                itemRows.forEach((row, idx) => {
                    if (!valid) return;

                    // ── 자식 행 처리 ──
                    const isChildInput = row.querySelector('[name^="is_child_"]');
                    if (isChildInput && isChildInput.value === '1') {
                        const childId = isChildInput.name.replace('is_child_', '');
                        const childParentRowId = row.getAttribute('data-parent-row');
                        const parentRowEl = childParentRowId
                            ? document.getElementById('item-' + childParentRowId)
                            : null;
                        const parentItemName = parentRowEl
                            ?.querySelector('[name^="item_search_"]')?.value?.trim() || '묶음 품목';
                        items.push({
                            item_name: parentItemName,
                            parent_client_id: row.querySelector(`[name="parent_client_id_${childId}"]`)?.value || null,
                            ai_group_index: (() => { const v = row.querySelector(`[name="child_ai_group_index_${childId}"]`)?.value; return (v !== '' && v !== undefined) ? parseInt(v) : null; })(),
                            ai_analysis_id: (() => { const v = row.querySelector(`[name="child_ai_analysis_id_${childId}"]`)?.value; return (v !== '' && v !== undefined && !isNaN(parseInt(v))) ? parseInt(v) : null; })(),
                            content: row.querySelector(`[name="child_content_${childId}"]`)?.value || null,
                            width: (() => { const v = row.querySelector(`[name="child_width_${childId}"]`)?.value; return v ? parseFloat(v) : null; })(),
                            height: (() => { const v = row.querySelector(`[name="child_height_${childId}"]`)?.value; return v ? parseFloat(v) : null; })(),
                            scale_factor: parseFloat(row.querySelector(`[name="child_scale_factor_${childId}"]`)?.value || '1'),
                            quantity: parseInt(row.querySelector('[name="child_qty_' + childId + '"]')?.value || '1'),
                            unit: 'EA',
                            unit_price: 0,
                            vat_included: 1,
                            sort_order: idx + 1,
                        });
                        return;
                    }

                    // ── 일반/부모 행 처리 ──
                    const id = row.id.replace('item-', '');
                    const itemName = document.querySelector(`[name="item_search_${id}"]`)?.value?.trim();
                    if (!itemName) { showToast(`품목 #${idx + 1}: 품목명을 입력하세요.`, 'warning'); valid = false; return; }
                    // 3-section PP 수집 (finish / punching / annotation)
                    const pp = [];
                    const ppContainer = document.getElementById('pp_options_' + id);
                    const w = parseFloat(document.querySelector('[name="width_' + id + '"]')?.value) || 0;
                    const h = parseFloat(document.querySelector('[name="height_' + id + '"]')?.value) || 0;
                    const qty = parseInt(document.querySelector('[name="quantity_' + id + '"]')?.value) || 1;

                    if (ppContainer) {
                        // 1. Finish PP — group by ppCode across 4 directions
                        var finishByPP = {};
                        ppContainer.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                            if (!sel.value) return;
                            var opt = sel.options[sel.selectedIndex];
                            var dir = sel.dataset.direction;
                            var dirRow = sel.closest('.pp-finish-dir-row');
                            var margin = parseFloat(dirRow.querySelector('.pp-finish-dir-margin').value) || 0;
                            var ppCode = opt.dataset.ppCode;

                            if (!finishByPP[ppCode]) {
                                finishByPP[ppCode] = {
                                    id: parseInt(opt.dataset.ppId),
                                    code: ppCode,
                                    name: opt.dataset.ppName,
                                    margin_top: 0, margin_bottom: 0, margin_left: 0, margin_right: 0,
                                    params: { directions: {} },
                                    _pricingType: opt.dataset.pricingType || 'fixed',
                                    _unitPrice: parseFloat(opt.dataset.unitPrice) || 0,
                                    _additionalCost: parseFloat(opt.dataset.additionalCost) || 0,
                                    _marginSum: 0
                                };
                            }

                            var dirMap = { top: 'margin_top', bottom: 'margin_bottom', left: 'margin_left', right: 'margin_right' };
                            finishByPP[ppCode][dirMap[dir]] = margin;
                            finishByPP[ppCode].params.directions[dir] = margin;
                            finishByPP[ppCode]._marginSum += margin;
                        });

                        Object.keys(finishByPP).forEach(function(code) {
                            var entry = finishByPP[code];
                            var price = 0;
                            if (entry._pricingType === 'fixed') price = entry._additionalCost;
                            else if (entry._pricingType === 'per_length') price = entry._marginSum * entry._unitPrice;
                            else if (entry._pricingType === 'per_sqm') price = (w / 100) * (h / 100) * entry._unitPrice;
                            else if (entry._pricingType === 'per_meter') price = ((w + h) * 2 / 100) * entry._unitPrice;
                            else if (entry._pricingType === 'per_unit') price = qty * entry._unitPrice;
                            entry.price = Math.round(price);
                            delete entry._pricingType;
                            delete entry._unitPrice;
                            delete entry._additionalCost;
                            delete entry._marginSum;
                            pp.push(entry);
                        });

                        // 2. Punching
                        const punchCheck = ppContainer.querySelector('.pp-punching-check');
                        const punchSection = ppContainer.querySelector('.pp-punching-section');
                        if (punchCheck && punchCheck.checked && punchSection) {
                            const punchParams = {};
                            ppContainer.querySelectorAll('.pp-punch-val').forEach(function(el) {
                                punchParams[el.dataset.key] = parseInt(el.value) || 0;
                            });
                            punchParams.margin_top = parseFloat(punchSection.dataset.marginTop) || 0;
                            punchParams.margin_bottom = parseFloat(punchSection.dataset.marginBottom) || 0;
                            punchParams.margin_left = parseFloat(punchSection.dataset.marginLeft) || 0;
                            punchParams.margin_right = parseFloat(punchSection.dataset.marginRight) || 0;

                            pp.push({
                                id: parseInt(punchSection.dataset.ppId),
                                code: punchSection.dataset.ppCode,
                                name: punchSection.dataset.ppName,
                                margin_left: parseFloat(punchSection.dataset.marginLeft) || 0,
                                margin_right: parseFloat(punchSection.dataset.marginRight) || 0,
                                margin_top: parseFloat(punchSection.dataset.marginTop) || 0,
                                margin_bottom: parseFloat(punchSection.dataset.marginBottom) || 0,
                                params: punchParams,
                                price: 0
                            });
                        }

                        // 3. Annotation
                        const annoCheck = ppContainer.querySelector('.pp-annotation-check');
                        const annoSection = ppContainer.querySelector('.pp-annotation-section');
                        if (annoCheck && annoCheck.checked && annoSection) {
                            const annoParams = {};
                            var positions = [];
                            ppContainer.querySelectorAll('.pp-anno-dir:checked').forEach(function(cb) {
                                positions.push(cb.dataset.dir);
                            });
                            annoParams.positions = positions;
                            var annoTextInput = ppContainer.querySelector('.pp-anno-text');
                            if (annoTextInput && annoTextInput.value.trim()) {
                                annoParams.customText = annoTextInput.value.trim();
                            }

                            pp.push({
                                id: parseInt(annoSection.dataset.ppId),
                                code: annoSection.dataset.ppCode,
                                name: annoSection.dataset.ppName,
                                margin_left: 0,
                                margin_right: 0,
                                margin_top: 0,
                                margin_bottom: 0,
                                params: annoParams,
                                price: 0
                            });
                        }

                        // 4. Offset (다이컷)
                        const offsetCheck2 = ppContainer.querySelector('.pp-offset-check');
                        const offsetSection = ppContainer.querySelector('.pp-offset-section');
                        if (offsetCheck2 && offsetCheck2.checked && offsetSection) {
                            var oTop = parseFloat(ppContainer.querySelector('.pp-offset-top').value) || 0;
                            var oBottom = parseFloat(ppContainer.querySelector('.pp-offset-bottom').value) || 0;
                            var oLeft = parseFloat(ppContainer.querySelector('.pp-offset-left').value) || 0;
                            var oRight = parseFloat(ppContainer.querySelector('.pp-offset-right').value) || 0;
                            pp.push({
                                id: parseInt(offsetSection.dataset.ppId),
                                code: offsetSection.dataset.ppCode,
                                name: offsetSection.dataset.ppName,
                                margin_left: 0,
                                margin_right: 0,
                                margin_top: 0,
                                margin_bottom: 0,
                                params: {
                                    offset_top: oTop, offset_bottom: oBottom,
                                    offset_left: oLeft, offset_right: oRight,
                                    method: (ppContainer.querySelector('.pp-offset-method') || {}).value || 'edge_strip',
                                    cut_line: ppContainer.querySelector('.pp-offset-cutline') ? ppContainer.querySelector('.pp-offset-cutline').checked : true
                                },
                                price: 0
                            });
                        }


                    }
                    const wVal = document.querySelector(`[name="width_${id}"]`)?.value;
                    const hVal = document.querySelector(`[name="height_${id}"]`)?.value;
                    const aiGroupIdxVal = document.querySelector(`[name="ai_group_index_${id}"]`)?.value;
                    const aiAnalysisIdVal = document.querySelector(`[name="ai_analysis_id_${id}"]`)?.value;
                    const sfEl = document.querySelector(`[name="scale_factor_${id}"]`);
                    const sfVal = sfEl ? sfEl.value : '';
                    var pmItemEl = document.querySelector('[name="pricing_method_' + id + '"]');
                    var pmItem = pmItemEl ? pmItemEl.value : 'FIXED';
                    items.push({
                        item_id: document.querySelector(`[name="item_id_${id}"]`)?.value ? parseInt(document.querySelector(`[name="item_id_${id}"]`).value) : undefined,
                        item_name: itemName,
                        category_name: document.querySelector(`[name="category_name_${id}"]`)?.value || '',
                        width: wVal ? parseFloat(wVal) : null,
                        height: hVal ? parseFloat(hVal) : null,
                        scale_factor: sfVal ? parseFloat(sfVal) : 1,
                        quantity: parseInt(document.querySelector(`[name="quantity_${id}"]`)?.value || 1),
                        unit: document.querySelector(`[name="item_unit_${id}"]`)?.value || 'EA',
                        unit_price: parseMoney(document.querySelector(`[name="unit_price_${id}"]`)?.value),
                        pricing_method: pmItem,
                        vat_included: document.querySelector(`[name="vat_${id}"]`)?.checked ? 1 : 0,
                        post_processing: JSON.stringify(pp),
                        finishing: (function() {
                            var finObj = {
                                top: document.querySelector('[name="fin_top_' + id + '"]')?.value || '',
                                bottom: document.querySelector('[name="fin_bottom_' + id + '"]')?.value || '',
                                left: document.querySelector('[name="fin_left_' + id + '"]')?.value || '',
                                right: document.querySelector('[name="fin_right_' + id + '"]')?.value || ''
                            };
                            // cm 오버라이드 (비어있으면 포함 안 함)
                            ['top','bottom','left','right'].forEach(function(dir) {
                                var cmEl = document.querySelector('[name="fin_cm_' + dir + '_' + id + '"]');
                                if (cmEl && cmEl.value !== '') finObj[dir + '_cm'] = parseFloat(cmEl.value) || 0;
                            });
                            return JSON.stringify(finObj);
                        })(),
                        content: document.querySelector(`[name="content_${id}"]`)?.value || '',
                        sort_order: idx + 1,
                        ai_group_index: (aiGroupIdxVal !== '' && aiGroupIdxVal !== undefined) ? parseInt(aiGroupIdxVal) : null,
                        ai_analysis_id: (aiAnalysisIdVal !== '' && aiAnalysisIdVal !== undefined) ? parseInt(aiAnalysisIdVal) : null,
                        sheet_layout_params: (function() {
                            var el = document.querySelector('[name="sheet_layout_params_' + id + '"]');
                            return el ? el.value : null;
                        })(),
                        client_group_id: document.querySelector(`[name="client_group_id_${id}"]`)?.value || null
                    });
                });
                if (!valid) return;

                // 자동 정렬: 카테고리 → 면적(큰 순) → 품목명
                items.sort(function(a, b) {
                    // 자식 행은 부모 바로 뒤에 유지 (sort_order 기준)
                    if (a.parent_client_id || b.parent_client_id) return 0;
                    var catA = (a.category_name || '').toLowerCase();
                    var catB = (b.category_name || '').toLowerCase();
                    if (catA !== catB) return catA < catB ? -1 : 1;
                    var areaA = (a.width || 0) * (a.height || 0);
                    var areaB = (b.width || 0) * (b.height || 0);
                    if (areaA !== areaB) return areaB - areaA; // 큰 순
                    return (a.item_name || '').localeCompare(b.item_name || '');
                });
                // sort_order 재부여
                items.forEach(function(item, idx) { item.sort_order = idx + 1; });

                // 선불/착불 필수 검증
                var spEl = document.getElementById('shippingPayment');
                if (spEl && !spEl.disabled && spEl.required && !spEl.value) {
                    showToast('선불/착불을 선택하세요.', 'warning');
                    return;
                }

                // AREA 품목인데 가로/세로가 0인 경우 경고
                var areaNoSize = items.filter(function(i) { return i.pricing_method === 'AREA' && (!i.width || !i.height); });
                if (areaNoSize.length > 0) {
                    if (!(await showConfirm(areaNoSize.length + '개 면적 단위 품목의 가로/세로가 입력되지 않았습니다. 금액이 0원으로 계산됩니다. 계속하시겠습니까?'))) {
                        return;
                    }
                }

                // 단가 0원 경고
                const zeroItems = items.filter(i => !i.parent_client_id && (i.unit_price === 0 || !i.unit_price));
                if (zeroItems.length > 0) {
                    if (!(await showConfirm(`${zeroItems.length}개 품목의 단가가 0원입니다. 계속하시겠습니까?`))) {
                        isSubmitting = false;
                        const submitBtn = document.getElementById('submitBtn');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = editMode
                            ? '<i class="fas fa-save mr-2"></i>수정 저장'
                            : '<i class="fas fa-save mr-2"></i>등록';
                        return;
                    }
                }

                isSubmitting = true;
                const btn = document.getElementById('submitBtn');
                btn.disabled = true;
                btn.innerHTML = editMode
                    ? '<i class="fas fa-spinner fa-spin mr-2"></i>저장 중...'
                    : '<i class="fas fa-spinner fa-spin mr-2"></i>등록 중...';

                const orderData = {
                    client_id: parseInt(clientId),
                    delivery_date: document.getElementById('deliveryDate').value,
                    priority: document.getElementById('priority').value,
                    reception_location: document.getElementById('receptionLocation').value,
                    delivery_info: document.getElementById('deliveryInfo').value,
                    delivery_method: document.getElementById('deliveryMethod').value,
                    delivery_time: (function() { var h = document.getElementById('deliveryTimeHour').value; var m = document.getElementById('deliveryTimeMinute').value; return h ? (h + ':' + (m || '00')) : null; })(),
                    discount_amount: parseMoney(document.getElementById('discountAmount').value),
                    notes: document.getElementById('notes').value,
                    contact_phone: document.getElementById('contactPhone').value.trim() || null,
                    contact_mobile: document.getElementById('contactMobile').value.trim() || null,
                    shipping_payment: document.getElementById('shippingPayment').value || null,
                    ai_file_path: resolvedFilePath || null,
                    ai_analysis_id: aiAnalysisId || null,
                    layout_id: null,
                    items
                };

                try {
                    let res;
                    if (editMode) {
                        res = await axios.put(`/api/orders/${editMode}`, orderData);
                    } else {
                        res = await axios.post('/api/orders', orderData);
                    }
                    if (res.data.success) {
                        const id = editMode ? editMode : res.data.data.id;
                        var msg = editMode ? '주문이 수정되었습니다.' : '주문이 등록되었습니다.';
                        if (res.data.message && res.data.message.includes('자동가공')) {
                            msg += '\n\n🔄 자동가공이 시작되었습니다. 주문 상세에서 결과를 확인하세요.';
                        }
                        if (res.data.cards_preserved) {
                            msg += '\n\n⚠️ ' + res.data.card_warning;
                        }
                        showToast(msg, 'warning');
                        // 견적서 폼이면 견적서 관리로, 아니면 주문 관리로
                        if (window.location.pathname.includes('quotation-form')) {
                            window.location.href = '/quotations';
                        } else {
                            window.location.href = '/orders?view=' + id;
                        }
                    } else {
                        showToast((editMode ? '수정' : '등록') + ' 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
                        isSubmitting = false; btn.disabled = false;
                        btn.innerHTML = editMode
                            ? '<i class="fas fa-save mr-2"></i>수정 저장'
                            : '<i class="fas fa-save mr-2"></i>등록';
                    }
                } catch (err) {
                    showToast((editMode ? '수정' : '등록') + ' 실패: ' + (err.response?.data?.error || err.message), 'error');
                    isSubmitting = false; btn.disabled = false;
                    btn.innerHTML = editMode
                        ? '<i class="fas fa-save mr-2"></i>수정 저장'
                        : '<i class="fas fa-save mr-2"></i>등록';
                }
            });

            // 수정 모드에서는 견적서 버튼 숨기기 (수정 모드 체크는 loadEditOrder 이후)
