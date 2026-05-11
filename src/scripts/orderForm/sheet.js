// orderForm/sheet.js — 폼 제출 + AI tabs + 합판 레이아웃·미리보기 (Phase 3.1.C 분할)

            window.submitAsQuotation = async function() {
                const clientId = document.getElementById('clientId').value;
                if (!clientId) { showToast('거래처를 선택하세요.', 'warning'); return; }

                const itemRows = document.querySelectorAll('#itemsContainer > [id^="item"]');
                if (!itemRows.length) { showToast('최소 1개 이상의 품목을 추가하세요.', 'warning'); return; }

                // 유효기한: 오늘로부터 30일 후
                var validUntilDate = new Date();
                validUntilDate.setDate(validUntilDate.getDate() + 30);
                var validUntil = validUntilDate.toISOString().slice(0, 10);

                if (!(await showConfirm('견적서로 저장하시겠습니까?\n유효기한: ' + validUntil + ' (오늘로부터 30일)'))) return;

                // 폼 데이터 수집은 submit 핸들러와 동일 로직을 간략화
                var qBtn = document.getElementById('quotationBtn');
                qBtn.disabled = true;
                qBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>저장 중...';

                try {
                    // 품목 수집 (부모 행만)
                    const items = [];
                    document.querySelectorAll('#itemsContainer > [id^="item"]').forEach(function(row, idx) {
                        const isChildInput = row.querySelector('[name^="is_child_"]');
                        if (isChildInput && isChildInput.value === '1') {
                            const childId = isChildInput.name.replace('is_child_', '');
                            const childParentRowId = row.getAttribute('data-parent-row');
                            const parentRowEl = childParentRowId ? document.getElementById('item-' + childParentRowId) : null;
                            const parentItemName = parentRowEl?.querySelector('[name^="item_search_"]')?.value?.trim() || '묶음 품목';
                            items.push({
                                item_name: parentItemName,
                                parent_client_id: row.querySelector('[name="parent_client_id_' + childId + '"]')?.value || null,
                                content: row.querySelector('[name="child_content_' + childId + '"]')?.value || null,
                                width: (() => { const v = row.querySelector('[name="child_width_' + childId + '"]')?.value; return v ? parseFloat(v) : null; })(),
                                height: (() => { const v = row.querySelector('[name="child_height_' + childId + '"]')?.value; return v ? parseFloat(v) : null; })(),
                                quantity: parseInt(row.querySelector('[name="child_qty_' + childId + '"]')?.value || '1'),
                                unit: 'EA', unit_price: 0, vat_included: 1, sort_order: idx + 1,
                            });
                            return;
                        }
                        const id = row.id.replace('item-', '');
                        const itemName = document.querySelector('[name="item_search_' + id + '"]')?.value?.trim();
                        if (!itemName) return;
                        const qty = parseInt(document.querySelector('[name="quantity_' + id + '"]')?.value) || 1;
                        const unitPrice = parseMoney(document.querySelector('[name="unit_price_' + id + '"]')?.value);
                        items.push({
                            item_id: parseInt(document.querySelector('[name="item_id_' + id + '"]')?.value) || null,
                            item_name: itemName,
                            content: document.querySelector('[name="content_' + id + '"]')?.value || null,
                            width: (() => { const v = document.querySelector('[name="width_' + id + '"]')?.value; return v ? parseFloat(v) : null; })(),
                            height: (() => { const v = document.querySelector('[name="height_' + id + '"]')?.value; return v ? parseFloat(v) : null; })(),
                            quantity: qty, unit: 'EA', unit_price: unitPrice,
                            vat_included: 1, sort_order: idx + 1, post_processing: [],
                        });
                    });

                    const orderData = {
                        client_id: parseInt(clientId),
                        delivery_date: document.getElementById('deliveryDate').value,
                        priority: document.getElementById('priority').value,
                        reception_location: document.getElementById('receptionLocation').value,
                        delivery_info: document.getElementById('deliveryInfo').value,
                        delivery_method: document.getElementById('deliveryMethod').value,
                        notes: document.getElementById('notes').value,
                        contact_phone: document.getElementById('contactPhone').value.trim() || null,
                        contact_mobile: document.getElementById('contactMobile').value.trim() || null,
                        status: 'QUOTATION',
                        valid_until: validUntil,
                        items
                    };

                    const res = await axios.post('/api/orders', orderData);

                    if (res.data.success) {
                        const id = res.data.data.id;
                        showToast('견적서가 저장되었습니다.', 'success');
                        window.location.href = '/quotations';
                    } else {
                        showToast('견적서 저장 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
                    }
                } catch (err) {
                    showToast('견적서 저장 실패: ' + (err.response?.data?.error || err.message), 'error');
                } finally {
                    qBtn.disabled = false;
                    qBtn.innerHTML = '<i class="fas fa-file-alt mr-2"></i>견적서로 저장';
                }
            };

            document.getElementById('addItemBtn').addEventListener('click', addItemRow);

            document.getElementById('addBundleBtn').addEventListener('click', function() {
                const parentId = addParentItemRow(1);
                addChildItemRow(parentId, { index: 1, width_mm: 0, height_mm: 0, thumbnail_base64: null });
                calculateTotal();
            });

            // ── 후가공 일괄 적용 ──────────────────────────────────────
            var bulkPPBtn = document.getElementById('bulkPPBtn');
            if (bulkPPBtn) {
                bulkPPBtn.addEventListener('click', async function() {
                    // 현재 품목 행에서 소분류 수집
                    var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                    var subcats = new Set();
                    rows.forEach(function(row) {
                        var id = row.id.replace('item-', '');
                        var sc = document.querySelector('[name="item_subcat_' + id + '"]');
                        if (sc && sc.value) subcats.add(sc.value);
                    });
                    if (subcats.size === 0) {
                        showToast('품목을 먼저 추가하세요.', 'warning');
                        return;
                    }
                    // 첫 번째 행의 후가공 상태 수집
                    var firstRow = rows[0];
                    var firstId = firstRow.id.replace('item-', '');
                    var firstPP = document.getElementById('pp_options_' + firstId);
                    if (!firstPP) { showToast('첫 번째 품목의 후가공을 먼저 설정하세요.', 'warning'); return; }

                    // finish 방향 드롭다운 값 수집
                    var finishVals = {};
                    firstPP.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                        finishVals[sel.dataset.dir || sel.className] = sel.value;
                    });
                    // punch 체크
                    var punchChecked = firstPP.querySelector('.pp-punch-check');
                    var punchState = punchChecked ? punchChecked.checked : false;
                    // annotation 체크
                    var annoChecked = firstPP.querySelector('.pp-annotation-check');
                    var annoState = annoChecked ? annoChecked.checked : false;
                    // offset 체크
                    var offsetChecked = firstPP.querySelector('.pp-offset-check');
                    var offsetState = offsetChecked ? offsetChecked.checked : false;

                    var targetCount = 0;
                    rows.forEach(function(row, idx) {
                        if (idx === 0) return; // 첫 행 스킵
                        var id = row.id.replace('item-', '');
                        var isChild = row.querySelector('[name^="is_child_"]');
                        if (isChild && isChild.value === '1') return; // 자식 행 스킵
                        var pp = document.getElementById('pp_options_' + id);
                        if (!pp) return;
                        // finish 복사
                        pp.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                            var key = sel.dataset.dir || sel.className;
                            if (finishVals[key] !== undefined) sel.value = finishVals[key];
                            sel.dispatchEvent(new Event('change', {bubbles: true}));
                        });
                        // punch 복사
                        var pc = pp.querySelector('.pp-punch-check');
                        if (pc && pc.checked !== punchState) { pc.checked = punchState; pc.dispatchEvent(new Event('change', {bubbles: true})); }
                        // annotation 복사
                        var ac = pp.querySelector('.pp-annotation-check');
                        if (ac && ac.checked !== annoState) { ac.checked = annoState; ac.dispatchEvent(new Event('change', {bubbles: true})); }
                        // offset 복사
                        var oc = pp.querySelector('.pp-offset-check');
                        if (oc && oc.checked !== offsetState) { oc.checked = offsetState; oc.dispatchEvent(new Event('change', {bubbles: true})); }
                        targetCount++;
                    });
                    if (targetCount > 0) {
                        showToast('첫 행의 후가공을 ' + targetCount + '개 행에 적용했습니다.', 'success');
                    } else {
                        showToast('적용할 대상 행이 없습니다.', 'warning');
                    }
                    calculateTotal();
                });
            }

            // ── AI 파일 분석 기능 ──────────────────────────────────────
            var aiAnalysisId = null;
            var analysisPollingTimer = null;
            var selectedAIFile = null;
            var localAIPath = null;
            var resolvedFilePath = null; // IllustratorAutomat이 업데이트한 파일 경로
            var AI_CHUNK_SIZE = 500 * 1024; // 500KB per chunk

            // ── 시트 배치 상태 변수 ──────────────────────────────────────
            var sheetLayoutGroups = null;
            var sheetLayoutResult = null;
            var sheetQuantities = {};
            var sheetGaps = [];         // [{placement_a, placement_b, side, gap_mm}]

            var COLORS = [
                '#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6',
                '#EC4899','#06B6D4','#84CC16','#F97316','#6366F1'
            ];

            // ── 시트 배치 탭 전환 ─────────────────────────────────────────
            window.switchAiTab = function(tab) {
                var tabExtract = document.getElementById('tabExtract');
                var tabSheet   = document.getElementById('tabSheet');
                var sheetPanel = document.getElementById('sheetLayoutPanel');

                function setTabStyle(el, active) {
                    if (!el) return;
                    if (active) {
                        el.className = 'flex-1 px-4 py-3 text-sm font-semibold rounded-lg border-2 border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-colors';
                    } else {
                        el.className = 'flex-1 px-4 py-3 text-sm font-semibold rounded-lg border-2 border-blue-300 bg-white text-blue-600 hover:bg-blue-50 transition-colors';
                    }
                }

                var extractPanel = document.getElementById('extractPanel');

                if (tab === 'sheet') {
                    setTabStyle(tabSheet, true);
                    setTabStyle(tabExtract, false);
                    if (sheetPanel) sheetPanel.classList.remove('hidden');
                    if (extractPanel) extractPanel.classList.add('hidden');
                    populateSheetElements(sheetLayoutGroups);
                } else {
                    setTabStyle(tabExtract, true);
                    setTabStyle(tabSheet, false);
                    if (sheetPanel) sheetPanel.classList.add('hidden');

                    // 품목 추출 패널 표시
                    var extractPanel = document.getElementById('extractPanel');
                    if (extractPanel) {
                        extractPanel.classList.remove('hidden');
                        populateExtractGroupsList();
                    }
                }
            };

            // ── 시트 배치 요소 테이블 렌더링 ──────────────────────────────
            function getSheetScaleFactor() {
                var el = document.getElementById('sheetScaleFactor');
                return el ? (parseInt(el.value, 10) || 1) : 1;
            }

            // ── 품목 추출 패널: 그룹 목록 표시 ──
            function populateExtractGroupsList() {
                var container = document.getElementById('extractGroupsList');
                if (!container || !sheetLayoutGroups) return;
                container.innerHTML = '';
                sheetLayoutGroups.forEach(function(g, i) {
                    var wCm = g.width_mm ? (g.width_mm / 10).toFixed(1) : '?';
                    var hCm = g.height_mm ? (g.height_mm / 10).toFixed(1) : '?';
                    var thumbHtml = '';
                    if (g.thumbnail_base64) {
                        var b64 = g.thumbnail_base64;
                        if (b64.indexOf('data:') !== 0) b64 = 'data:image/png;base64,' + b64;
                        thumbHtml = '<img src="' + b64 + '" class="w-12 h-12 object-contain rounded border flex-shrink-0">';
                    } else {
                        var color = COLORS[i % COLORS.length];
                        thumbHtml = '<div class="w-12 h-12 rounded border flex items-center justify-center text-white font-bold" style="background:' + color + '">' + String.fromCharCode(65 + i) + '</div>';
                    }
                    container.insertAdjacentHTML('beforeend',
                        '<div class="flex items-center gap-3 py-2 border-b border-gray-100">'
                        + thumbHtml
                        + '<div class="text-sm text-gray-700">그룹 ' + (i + 1) + ' — <b>' + wCm + ' × ' + hCm + ' cm</b> (파일 크기)</div>'
                        + '</div>');
                });
            }

            window.doExtractToLines = function() {
                if (!sheetLayoutGroups || sheetLayoutGroups.length === 0) return;
                removeEmptyItemRows();
                var groups = sheetLayoutGroups;
                var allSameSize = groups.length > 1 && groups.every(function(g) {
                    var refW = groups[0].width_mm, refH = groups[0].height_mm;
                    if (!refW || !refH || !g.width_mm || !g.height_mm) return false;
                    return Math.abs(g.width_mm - refW) / refW < 0.05
                        && Math.abs(g.height_mm - refH) / refH < 0.05;
                });
                if (allSameSize) {
                    populateAsGroupedItem(groups);
                } else {
                    populateRowsFromGroups(groups);
                }
                var aiResultTabs = document.getElementById('aiResultTabs');
                if (aiResultTabs) aiResultTabs.classList.add('hidden');
                showToast(groups.length + '개 품목 라인이 추가되었습니다.', 'success');
                var itemsContainer = document.getElementById('itemsContainer');
                if (itemsContainer) itemsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };

            function populateSheetElements(groups) {
                const tbody = document.getElementById('sheetElementsBody');
                if (!tbody) return;
                tbody.innerHTML = '';
                if (!groups || groups.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">분석 결과가 없습니다.</td></tr>';
                    return;
                }
                var sf = getSheetScaleFactor();
                groups.forEach(function(g, i) {
                    const color = COLORS[i % COLORS.length];
                    // 파일 크기 × 스케일 = 실제 출력 크기
                    const wCm = g.width_mm  ? (g.width_mm  / 10 * sf).toFixed(1) : '?';
                    const hCm = g.height_mm ? (g.height_mm / 10 * sf).toFixed(1) : '?';
                    const qty = sheetQuantities[i] !== undefined ? sheetQuantities[i] : 1;
                    const area = (g.width_mm && g.height_mm)
                        ? ((g.width_mm / 10 * sf) * (g.height_mm / 10 * sf) * qty / 10000).toFixed(4)
                        : '-';

                    let thumbHtml;
                    if (g.thumbnail_base64) {
                        var b64 = g.thumbnail_base64;
                        if (b64.indexOf('data:') !== 0) b64 = 'data:image/png;base64,' + b64;
                        thumbHtml = '<img src="' + b64 + '" class="w-10 h-10 object-contain rounded border" />';
                    } else {
                        const letter = (g.name || String.fromCharCode(65 + i)).charAt(0).toUpperCase();
                        thumbHtml = '<div class="w-10 h-10 rounded flex items-center justify-center text-white font-bold text-sm" style="background:' + color + '">' + letter + '</div>';
                    }

                    const tr = document.createElement('tr');
                    tr.className = 'border-b border-gray-100';
                    tr.innerHTML =
                        '<td class="py-2 px-2">' + thumbHtml + '</td>' +
                        '<td class="py-2 px-2 text-sm text-gray-700">' + wCm + ' × ' + hCm + ' cm</td>' +
                        '<td class="py-2 px-2">' +
                            '<input type="number" min="1" value="' + qty + '" data-group-index="' + i + '" ' +
                            'onchange="onSheetQtyChange(this)" ' +
                            'class="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center" />' +
                        '</td>' +
                        '<td class="py-2 px-2 text-sm text-gray-600 sheet-area-cell" data-group-index="' + i + '">' + area + ' ㎡</td>';
                    tbody.appendChild(tr);
                });

                // 추천 롤 폭으로 기본값 설정 + 배치 가능 영역 표시
                var cutMarksEl = document.getElementById('sheetCutMarks');
                var hasCut = cutMarksEl ? cutMarksEl.checked : false;
                var rec = recommendRollWidth(groups, sheetQuantities, hasCut);
                if (rec) {
                    var rollSel = document.getElementById('sheetRollWidth');
                    if (rollSel) rollSel.value = String(rec.roll);
                    var recEl = document.getElementById('sheetRecommendation');
                    if (recEl) {
                        recEl.textContent = '추천: ' + rec.roll + 'cm (효율 ' + (rec.efficiency * 100).toFixed(1) + '%)';
                        recEl.className = 'text-xs text-blue-600 mt-1';
                    }
                }
                // 배치 가능 영역 업데이트 (onSheetSettingsChange 호출하지 않음 — 재귀 방지)
                var rollVal = parseInt((document.getElementById('sheetRollWidth') || {}).value, 10) || 127;
                var marginVal = hasCut ? 1.5 : 0;
                var availEl = document.getElementById('sheetAvailableWidth');
                if (availEl) availEl.textContent = (rollVal - marginVal * 2).toFixed(0) + ' cm';
                resetSheetPreview();
            }

            window.onSheetQtyChange = function(el) {
                const idx = parseInt(el.getAttribute('data-group-index'), 10);
                const val = Math.max(1, parseInt(el.value, 10) || 1);
                el.value = val;
                sheetQuantities[idx] = val;
                updateSheetAreaDisplay();
                resetSheetPreview();
            };

            function updateSheetAreaDisplay() {
                if (!sheetLayoutGroups) return;
                var sf = getSheetScaleFactor();
                document.querySelectorAll('.sheet-area-cell').forEach(function(cell) {
                    const idx = parseInt(cell.getAttribute('data-group-index'), 10);
                    const g = sheetLayoutGroups[idx];
                    if (!g || !g.width_mm || !g.height_mm) { cell.textContent = '-'; return; }
                    const qty = sheetQuantities[idx] || 1;
                    const area = (g.width_mm / 10 * sf) * (g.height_mm / 10 * sf) * qty / 10000;
                    cell.textContent = area.toFixed(4) + ' ㎡';
                });
            }

            // 스케일 변경 → 테이블 재렌더 + 설정 업데이트
            window.onSheetScaleChange = function() {
                if (sheetLayoutGroups) populateSheetElements(sheetLayoutGroups);
            };

            window.onSheetSettingsChange = function() {
                const widthSel  = document.getElementById('sheetRollWidth');
                const cutMarks  = document.getElementById('sheetCutMarks');
                const availEl   = document.getElementById('sheetAvailableWidth');
                const recEl     = document.getElementById('sheetRecommendation');
                if (!widthSel) return;

                const rollWidth = parseInt(widthSel.value, 10) || 0;
                const hasCut    = cutMarks ? cutMarks.checked : false;
                const margin    = hasCut ? 1.5 : 0; // cm (재단 시 양쪽 1.5cm)
                const available = rollWidth - margin * 2;

                if (availEl) availEl.textContent = available.toFixed(0) + ' cm';

                const rec = recommendRollWidth(sheetLayoutGroups, sheetQuantities, hasCut);
                if (recEl) {
                    if (rec) {
                        recEl.textContent = '추천 폭: ' + rec.roll + 'cm (효율 ' + (rec.efficiency * 100).toFixed(1) + '%, 길이 ' + rec.total_height.toFixed(1) + 'cm)';
                        recEl.className = 'text-xs text-blue-600 mt-1';
                    } else {
                        recEl.textContent = '';
                    }
                }

                resetSheetPreview();
            };

            // ── Bin-Packing 알고리즘 (도련 간격 지원) ───────────────────────
            // bleedGap: 인접 배치 사이 도련 간격 (cm, 기본 0)
            function shelfBinPack(items, availableWidth, bleedGap) {
                if (!items || items.length === 0) return { error: true, errorMsg: '배치할 항목이 없습니다.' };
                var gap = bleedGap || 0; // 도련 간격 (cm)

                // Sort by area descending
                const sorted = items.slice().sort(function(a, b) {
                    return (b.w * b.h) - (a.w * a.h);
                });

                const shelves = []; // { y, height, usedWidth, itemCount }
                const placements = [];

                for (let i = 0; i < sorted.length; i++) {
                    const item = sorted[i];
                    let placed = false;

                    // Try fitting in existing shelves (original then rotated)
                    for (let si = 0; si < shelves.length; si++) {
                        const shelf = shelves[si];
                        // 이미 아이템이 있으면 간격 추가
                        var xGap = shelf.itemCount > 0 ? gap : 0;
                        const orientations = [
                            { w: item.w, h: item.h, rotated: false },
                            { w: item.h, h: item.w, rotated: true }
                        ];
                        for (let oi = 0; oi < orientations.length; oi++) {
                            const o = orientations[oi];
                            if (shelf.usedWidth + xGap + o.w <= availableWidth) {
                                placements.push({
                                    group_index: item.groupIndex,
                                    x_cm: shelf.usedWidth + xGap,
                                    y_cm: shelf.y,
                                    width_cm: o.w,
                                    height_cm: o.h,
                                    rotated: o.rotated
                                });
                                shelf.usedWidth += xGap + o.w;
                                shelf.itemCount++;
                                if (o.h > shelf.height) shelf.height = o.h;
                                placed = true;
                                break;
                            }
                        }
                        if (placed) break;
                    }

                    if (!placed) {
                        // Try both orientations for new shelf
                        const orientations = [
                            { w: item.w, h: item.h, rotated: false },
                            { w: item.h, h: item.w, rotated: true }
                        ];
                        let chosen = null;
                        for (let oi = 0; oi < orientations.length; oi++) {
                            if (orientations[oi].w <= availableWidth) {
                                chosen = orientations[oi];
                                break;
                            }
                        }
                        if (!chosen) {
                            return { error: true, errorMsg: '항목이 롤 폭보다 큽니다: ' + item.w.toFixed(1) + 'cm × ' + item.h.toFixed(1) + 'cm' };
                        }
                        const prevShelf = shelves[shelves.length - 1];
                        // shelf 사이에도 도련 간격 추가
                        const yGap = prevShelf ? gap : 0;
                        const newY = prevShelf ? prevShelf.y + prevShelf.height + yGap : 0;
                        shelves.push({ y: newY, height: chosen.h, usedWidth: chosen.w, itemCount: 1 });
                        placements.push({
                            group_index: item.groupIndex,
                            x_cm: 0,
                            y_cm: newY,
                            width_cm: chosen.w,
                            height_cm: chosen.h,
                            rotated: chosen.rotated
                        });
                    }
                }

                const lastShelf = shelves[shelves.length - 1];
                const totalHeight = lastShelf ? lastShelf.y + lastShelf.height : 0;
                const totalArea   = items.reduce(function(s, it) { return s + it.w * it.h; }, 0);
                const usedArea    = availableWidth * totalHeight;
                const efficiency  = usedArea > 0 ? totalArea / usedArea : 0;
                const rotatedCount = placements.filter(function(p) { return p.rotated; }).length;

                return {
                    error: false,
                    placements: placements,
                    total_width_cm: availableWidth,
                    total_height_cm: totalHeight,
                    efficiency: efficiency,
                    rotated_count: rotatedCount,
                    total_items: items.length
                };
            }

            function recommendRollWidth(groups, quantities, cutMarks) {
                if (!groups || groups.length === 0) return null;
                const rollWidths = [105, 127, 137, 152];
                const margin = (cutMarks ? 1.5 : 0) * 2;
                const sf = getSheetScaleFactor();

                // Build expanded items (스케일 + 기본 bleed 적용 — 추천 시에는 전체 bleed)
                var bleedCm = 0.3; // 3mm → cm
                const items = [];
                groups.forEach(function(g, i) {
                    if (!g.width_mm || !g.height_mm) return;
                    const qty = quantities[i] || 1;
                    var origW = g.width_mm / 10 * sf;
                    var origH = g.height_mm / 10 * sf;
                    for (let q = 0; q < qty; q++) {
                        items.push({
                            groupIndex: i,
                            w: origW + bleedCm * 2,  // 양쪽 bleed 최대
                            h: origH + bleedCm * 2,
                            origW: origW, origH: origH
                        });
                    }
                });
                if (items.length === 0) return null;

                let best = null;
                rollWidths.forEach(function(roll) {
                    const available = roll - margin;
                    if (available <= 0) return;
                    const result = shelfBinPack(items, available, 0);
                    if (result.error) return;
                    if (!best || result.efficiency > best.efficiency ||
                        (Math.abs(result.efficiency - best.efficiency) < 0.001 && result.total_height_cm < best.total_height)) {
                        best = { roll: roll, efficiency: result.efficiency, total_height: result.total_height_cm };
                    }
                });
                return best;
            }

            window.calculateAndPreviewSheet = function() {
                sheetGaps = [];
                const widthSel = document.getElementById('sheetRollWidth');
                const cutMarks = document.getElementById('sheetCutMarks');
                if (!widthSel || !sheetLayoutGroups) { showToast('분석 결과가 없습니다.', 'warning'); return; }

                const rollWidth = parseInt(widthSel.value, 10) || 0;
                const hasCut    = cutMarks ? cutMarks.checked : false;
                const margin    = hasCut ? 1.5 : 0; // cm (재단 시 양쪽 1.5cm)
                const available = rollWidth - margin * 2;
                const sf = getSheetScaleFactor();

                // ── 도련 v5.1: 2-pass — flush 배치 → 인접 분석 → bleed 결정 → 최종 배치 ──
                var bleedMm = 3;
                var bleedCm = bleedMm / 10; // 3mm → cm (스케일은 실제 출력 기준)

                // Pass 1: flush 배치 (원본 크기로, bleed 없이)
                var baseItems = [];
                sheetLayoutGroups.forEach(function(g, i) {
                    if (!g.width_mm || !g.height_mm) return;
                    var qty = sheetQuantities[i] || 1;
                    for (var q = 0; q < qty; q++) {
                        baseItems.push({ groupIndex: i, w: g.width_mm / 10 * sf, h: g.height_mm / 10 * sf });
                    }
                });
                var flushResult = shelfBinPack(baseItems, available, 0);
                if (flushResult.error) { showToast(flushResult.errorMsg, 'error'); return; }

                // Pass 2: 인접 분석 → per-placement bleed 결정
                var boundaries = findAdjacentBoundaries(flushResult.placements);
                var placementBleeds = [];
                for (var pbi = 0; pbi < flushResult.placements.length; pbi++) {
                    var fp = flushResult.placements[pbi];
                    placementBleeds[pbi] = getPerEdgeBleedWithAdjacency(fp.group_index, pbi, flushResult.placements, boundaries, bleedCm);
                }

                // Pass 3: bleed 포함 크기로 최종 배치
                var finalItems = [];
                sheetLayoutGroups.forEach(function(g, i) {
                    if (!g.width_mm || !g.height_mm) return;
                    var qty = sheetQuantities[i] || 1;
                    for (var q = 0; q < qty; q++) {
                        // flush 결과에서 이 groupIndex의 placement 찾기
                        var fpIdx = -1;
                        for (var fi = 0; fi < flushResult.placements.length; fi++) {
                            if (flushResult.placements[fi].group_index === i) { fpIdx = fi; break; }
                        }
                        var bl = fpIdx >= 0 ? placementBleeds[fpIdx] : { top: bleedCm, bottom: bleedCm, left: bleedCm, right: bleedCm };
                        var origW = g.width_mm / 10 * sf;
                        var origH = g.height_mm / 10 * sf;
                        finalItems.push({
                            groupIndex: i,
                            w: origW + bl.left + bl.right,
                            h: origH + bl.top + bl.bottom,
                            origW: origW, origH: origH,
                            bleed: bl
                        });
                    }
                });

                var result = shelfBinPack(finalItems, available, 0);
                if (result.error) { showToast(result.errorMsg, 'error'); return; }

                // placement 좌표 보정
                result.placements.forEach(function(p) {
                    var item = finalItems.find(function(it) { return it.groupIndex === p.group_index; });
                    if (item) {
                        p.x_cm += margin + item.bleed.left;
                        p.y_cm += item.bleed.top;
                        p.width_cm = item.origW;
                        p.height_cm = item.origH;
                        p.bleed = item.bleed;
                    } else {
                        p.x_cm += margin;
                    }
                });

                sheetGaps = [];
                sheetLayoutResult = result;
                // 먼저 영역을 표시한 후 렌더링 (hidden 상태에서는 clientWidth=0)
                var previewArea = document.getElementById('sheetPreviewArea');
                if (previewArea) previewArea.classList.remove('hidden');
                // requestAnimationFrame으로 레이아웃 완료 후 렌더링
                requestAnimationFrame(function() {
                    if (typeof renderSheetCanvas === 'function') renderSheetCanvas();
                    if (typeof showSheetStats === 'function') showSheetStats();
                });
            };

            window.resetSheetPreview = function() {
                sheetLayoutResult = null;
                sheetGaps = [];
                const previewArea = document.getElementById('sheetPreviewArea');
                if (previewArea) previewArea.classList.add('hidden');
            };

            // ── 미리보기 모달 ──────────────────────────────────────────────
            window.openSheetPreviewModal = function() {
                var modal = document.getElementById('sheetPreviewModal');
                if (!modal) return;
                modal.classList.remove('hidden');
                // 모달이 표시된 후 캔버스 렌더링
                requestAnimationFrame(function() {
                    preloadSheetThumbnails(function() {
                        renderSheetCanvasModal();
                    });
                });
            };

            window.closeSheetPreviewModal = function() {
                var modal = document.getElementById('sheetPreviewModal');
                if (modal) modal.classList.add('hidden');
            };

            // 썸네일 이미지 사전 로딩 (캔버스 렌더링 전)
            function preloadSheetThumbnails(callback) {
                if (!sheetLayoutGroups) { callback(); return; }
                window._sheetThumbCache = {};
                var pending = 0;
                var done = function() { pending--; if (pending <= 0) callback(); };
                sheetLayoutGroups.forEach(function(g, i) {
                    if (g.thumbnail_base64) {
                        pending++;
                        var img = new Image();
                        img.onload = function() { window._sheetThumbCache[i] = img; done(); };
                        img.onerror = done;
                        img.src = g.thumbnail_base64;
                    }
                });
                if (pending === 0) callback();
            }

            function renderSheetCanvasModal() {
                if (!sheetLayoutResult) return;
                var canvas = document.getElementById('sheetCanvasModal');
                if (!canvas) return;
                var ctx = canvas.getContext('2d');
                var result = sheetLayoutResult;

                var widthSel = document.getElementById('sheetRollWidth');
                var rollWidth = widthSel ? (parseInt(widthSel.value, 10) || 127) : 127;
                var cutMarksChk = document.getElementById('sheetCutMarks');
                var hasCut = cutMarksChk ? cutMarksChk.checked : false;
                var margin = hasCut ? 1.5 : 0;

                // 모달 내부 캔버스: 부모 너비에 맞춤 (세로형)
                var dpr = window.devicePixelRatio || 1;
                var containerW = canvas.parentElement ? canvas.parentElement.clientWidth - 20 : 800;
                if (containerW < 300) containerW = 800;

                // 세로형: 70% 비율, 중앙 정렬
                var scale = containerW * 0.7 / rollWidth;
                var rollPx = rollWidth * scale; // 실제 롤 폭 픽셀
                var headerH = 40;
                var footerH = 50;
                var contentH = result.total_height_cm * scale;
                var cssW = containerW;
                var cssH = contentH + headerH + footerH;
                var offsetX = (cssW - rollPx) / 2; // 중앙 정렬 오프셋

                canvas.width = cssW * dpr;
                canvas.height = cssH * dpr;
                canvas.style.width = cssW + 'px';
                canvas.style.height = cssH + 'px';
                ctx.scale(dpr, dpr);

                // Background
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(0, 0, cssW, cssH);

                // 상단 롤 폭 라벨
                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('롤 폭 ' + rollWidth + 'cm', cssW / 2, headerH / 2);

                var offsetY = headerH;

                // 롤 폭 테두리 (전체 영역)
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(offsetX, offsetY, rollPx, contentH);

                // 여백 영역 (색상만, 글씨 제거)
                if (margin > 0) {
                    var mPx = margin * scale;
                    ctx.fillStyle = '#fee2e220';
                    ctx.fillRect(offsetX, offsetY, mPx, contentH);
                    ctx.fillRect(offsetX + rollPx - mPx, offsetY, mPx, contentH);
                }

                // 배치 요소 (썸네일 이미지 + 도련 표시 포함)
                result.placements.forEach(function(p) {
                    var gi = p.group_index;
                    var color = COLORS[gi % COLORS.length];
                    var x = p.x_cm * scale + offsetX;
                    var y = p.y_cm * scale + offsetY;
                    // 회전된 placement: 미리보기에서도 w↔h 교환
                    var w = (p.rotated ? p.height_cm : p.width_cm) * scale;
                    var h = (p.rotated ? p.width_cm : p.height_cm) * scale;

                    // 도련 표시: 적용되는 변에 빨간 점선
                    var bl = p.bleed || {};
                    var hasBleed = bl.top > 0 || bl.bottom > 0 || bl.left > 0 || bl.right > 0;
                    if (hasBleed) {
                        ctx.save();
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 3]);
                        if (bl.top > 0)    { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); }
                        if (bl.bottom > 0) { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke(); }
                        if (bl.left > 0)   { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke(); }
                        if (bl.right > 0)  { ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.stroke(); }
                        ctx.setLineDash([]);
                        ctx.restore();
                    }

                    // 썸네일 이미지 그리기 (회전 반영)
                    var group = sheetLayoutGroups ? sheetLayoutGroups[gi] : null;
                    var thumbSrc = group ? group.thumbnail_base64 : null;
                    if (thumbSrc && window._sheetThumbCache && window._sheetThumbCache[gi]) {
                        var img = window._sheetThumbCache[gi];
                        if (p.rotated) {
                            ctx.save();
                            ctx.translate(x + w / 2, y + h / 2);
                            ctx.rotate(-Math.PI / 2);
                            ctx.drawImage(img, -h / 2, -w / 2, h, w);
                            ctx.restore();
                        } else {
                            ctx.drawImage(img, x, y, w, h);
                        }
                    } else {
                        ctx.fillStyle = color + '25';
                        ctx.fillRect(x, y, w, h);
                    }

                    // CutLine 테두리 (실선)
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(x, y, w, h);

                    // 라벨
                    var letter = String.fromCharCode(65 + gi) + (p.rotated ? ' ↻' : '');
                    var labelSize = Math.max(12, Math.min(24, Math.floor(Math.min(w, h) * 0.2)));
                    ctx.fillStyle = 'rgba(255,255,255,0.75)';
                    ctx.fillRect(x + 2, y + 2, labelSize * 1.2, labelSize * 1.4);
                    ctx.fillStyle = color;
                    ctx.font = 'bold ' + labelSize + 'px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(letter, x + 4, y + 4);
                });

                // 하단 요약
                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(
                    '총 길이: ' + result.total_height_cm.toFixed(1) + 'cm | '
                    + result.total_items + '개 요소 | '
                    + '효율: ' + (result.efficiency * 100).toFixed(1) + '%',
                    cssW / 2, cssH - 16
                );

                // 간격 경계 표시 (빨간 점선)
                sheetGaps.forEach(function(gap) {
                    var pa2 = result.placements[gap.placement_a];
                    var pb2 = result.placements[gap.placement_b];
                    if (!pa2 || !pb2) return;
                    ctx.save();
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 3;
                    ctx.setLineDash([6, 4]);
                    if (gap.side === 'right') {
                        var gx = (pa2.x_cm + pa2.width_cm) * scale + offsetX;
                        var gy1 = Math.max(pa2.y_cm, pb2.y_cm) * scale + offsetY;
                        var gy2 = Math.min(pa2.y_cm + pa2.height_cm, pb2.y_cm + pb2.height_cm) * scale + offsetY;
                        ctx.beginPath(); ctx.moveTo(gx, gy1); ctx.lineTo(gx, gy2); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
                        ctx.fillText('3mm', gx, gy1 - 4);
                    } else if (gap.side === 'bottom') {
                        var gy3 = (pa2.y_cm + pa2.height_cm) * scale + offsetY;
                        var gx1 = Math.max(pa2.x_cm, pb2.x_cm) * scale + offsetX;
                        var gx2 = Math.min(pa2.x_cm + pa2.width_cm, pb2.x_cm + pb2.width_cm) * scale + offsetX;
                        ctx.beginPath(); ctx.moveTo(gx1, gy3); ctx.lineTo(gx2, gy3); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
                        ctx.fillText('3mm', (gx1 + gx2) / 2, gy3 - 4);
                    }
                    ctx.restore();
                });

            }

            // calculateAndPreviewSheet에서 호출되는 이전 함수 (이제 모달 자동 오픈)
            function renderSheetCanvas() {
                openSheetPreviewModal();
            }

            function showSheetStats() {
                if (!sheetLayoutResult) return;
                const statsEl = document.getElementById('sheetStats');
                if (!statsEl) return;
                const result = sheetLayoutResult;

                var html = '';

                // 총 요소
                html += '<div class="flex-1 p-2 bg-white rounded border text-center">';
                html += '<div class="text-xs text-gray-500">총 요소</div>';
                html += '<div class="font-bold">' + result.total_items + '개</div>';
                html += '</div>';

                // 배치 크기
                html += '<div class="flex-1 p-2 bg-white rounded border text-center">';
                html += '<div class="text-xs text-gray-500">배치 크기</div>';
                html += '<div class="font-bold text-blue-600">' + result.total_width_cm + ' × ' + result.total_height_cm.toFixed(1) + ' cm</div>';
                html += '</div>';

                // 효율
                html += '<div class="flex-1 p-2 bg-white rounded border text-center">';
                html += '<div class="text-xs text-gray-500">효율</div>';
                html += '<div class="font-bold text-green-600">' + (result.efficiency * 100).toFixed(1) + '%</div>';
                html += '</div>';

                // 회전 (0이면 숨김)
                if (result.rotated_count > 0) {
                    html += '<div class="flex-1 p-2 bg-white rounded border text-center">';
                    html += '<div class="text-xs text-gray-500">회전</div>';
                    html += '<div class="font-bold text-purple-600">' + result.rotated_count + '개</div>';
                    html += '</div>';
                }

                statsEl.innerHTML = html;
            }

            function findAdjacentBoundaries(placements) {
                var boundaries = [];
                for (var i = 0; i < placements.length; i++) {
                    for (var j = i + 1; j < placements.length; j++) {
                        var a = placements[i], b = placements[j];
                        if (Math.abs((a.x_cm + a.width_cm) - b.x_cm) < 0.2) {
                            var overlapTop = Math.min(a.y_cm + a.height_cm, b.y_cm + b.height_cm);
                            var overlapBot = Math.max(a.y_cm, b.y_cm);
                            if (overlapTop > overlapBot) boundaries.push({a: i, b: j, side: 'right'});
                        }
                        if (Math.abs((a.y_cm + a.height_cm) - b.y_cm) < 0.2) {
                            var overlapR = Math.min(a.x_cm + a.width_cm, b.x_cm + b.width_cm);
                            var overlapL = Math.max(a.x_cm, b.x_cm);
                            if (overlapR > overlapL) boundaries.push({a: i, b: j, side: 'bottom'});
                        }
                    }
                }
                return boundaries;
            }

            // ── 도련 v5.1: per-edge bleed 판단 (인접 디자인 색상 고려) ──
            var WHITE_THRESHOLD = 30;
            function isWhiteColor(rgb) {
                if (!rgb || rgb.length < 3) return true;
                var dr = 255-rgb[0], dg = 255-rgb[1], db = 255-rgb[2];
                return Math.sqrt(dr*dr + dg*dg + db*db) < WHITE_THRESHOLD;
            }

            function colorDistance(a, b) {
                if (!a || !b) return 999;
                var dr = a[0]-b[0], dg = a[1]-b[1], db = a[2]-b[2];
                return Math.sqrt(dr*dr + dg*dg + db*db);
            }

            // 디자인별 4방향 bleed 결정 (인접 디자인 색상도 고려)
            // 규칙:
            //   - 양쪽 모두 백색 → bleed 0
            //   - 어느 한쪽이라도 유색 → bleed 적용
            //   - 양쪽 유색이지만 색상 유사 (dist < 60) → bleed 0
            function getPerEdgeBleedWithAdjacency(groupIndex, placementIndex, placements, boundaries, bleedCm) {
                var result = { top: bleedCm, bottom: bleedCm, left: bleedCm, right: bleedCm };
                if (!sheetLayoutGroups || !sheetLayoutGroups[groupIndex]) return result;
                var myEc = sheetLayoutGroups[groupIndex].edge_colors;

                // 각 방향: 외곽 변인지, 인접 변인지 판단
                var sides = ['top', 'bottom', 'left', 'right'];
                var opposites = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
                var bdSideMap = { right: 'right', bottom: 'bottom' }; // boundaries에서 사용하는 side

                for (var si = 0; si < sides.length; si++) {
                    var side = sides[si];
                    var myColor = myEc ? myEc[side] : null;
                    var adjColor = null;
                    var hasAdj = false;

                    // 인접 디자인 찾기
                    for (var bi = 0; bi < boundaries.length; bi++) {
                        var bd = boundaries[bi];
                        var adjGroupIdx = -1;
                        if (bd.side === 'right') {
                            if (bd.a === placementIndex && side === 'right') {
                                adjGroupIdx = placements[bd.b].group_index; adjColor = getEdgeColor(adjGroupIdx, 'left'); hasAdj = true;
                            } else if (bd.b === placementIndex && side === 'left') {
                                adjGroupIdx = placements[bd.a].group_index; adjColor = getEdgeColor(adjGroupIdx, 'right'); hasAdj = true;
                            }
                        } else if (bd.side === 'bottom') {
                            if (bd.a === placementIndex && side === 'bottom') {
                                adjGroupIdx = placements[bd.b].group_index; adjColor = getEdgeColor(adjGroupIdx, 'top'); hasAdj = true;
                            } else if (bd.b === placementIndex && side === 'top') {
                                adjGroupIdx = placements[bd.a].group_index; adjColor = getEdgeColor(adjGroupIdx, 'bottom'); hasAdj = true;
                            }
                        }
                        if (hasAdj) break;
                    }

                    if (hasAdj) {
                        // 인접 변: 양쪽 모두 백색이면 bleed 불필요, 색상 유사해도 불필요
                        var myWhite = isWhiteColor(myColor);
                        var adjWhite = isWhiteColor(adjColor);
                        if (myWhite && adjWhite) {
                            result[side] = 0;
                        } else if (!myWhite && !adjWhite && colorDistance(myColor, adjColor) < 60) {
                            result[side] = 0; // 양쪽 유색이지만 유사
                        }
                        // 어느 한쪽이라도 유색 + 색상 다름 → bleed 유지
                    } else {
                        // 외곽 변: 내 엣지가 백색이면 bleed 불필요
                        if (isWhiteColor(myColor)) result[side] = 0;
                    }
                }

                return result;
            }

            function getEdgeColor(groupIndex, side) {
                if (!sheetLayoutGroups || !sheetLayoutGroups[groupIndex]) return null;
                var ec = sheetLayoutGroups[groupIndex].edge_colors;
                return ec ? ec[side] : null;
            }

            // ── Task 5: 확정 → 부모-자식 주문 라인 생성 ──────────────────────
            window.confirmSheetLayout = function() {
                if (!sheetLayoutResult || !sheetLayoutGroups) {
                    showToast('먼저 배치 미리보기를 실행하세요.', 'warning');
                    return;
                }

                removeEmptyItemRows();

                const childCount = sheetLayoutGroups.length;
                const parentId   = addParentItemRow(childCount);

                // 부모 행 크기 설정
                var wInput = document.querySelector('[name="width_' + parentId + '"]');
                var hInput = document.querySelector('[name="height_' + parentId + '"]');
                if (wInput) wInput.value = sheetLayoutResult.total_width_cm;
                if (hInput) hInput.value = sheetLayoutResult.total_height_cm.toFixed(1);

                // sheet_layout_params hidden input 생성
                var widthSel = document.getElementById('sheetRollWidth');
                var cutMarksEl = document.getElementById('sheetCutMarks');
                var rollWidthCm = widthSel ? (parseInt(widthSel.value, 10) || 0) : 0;
                var hasCut = cutMarksEl ? cutMarksEl.checked : false;
                var marginCm = hasCut ? 1.5 : 0;

                // edge_colors 수집 (sheetLayoutGroups에서)
                var ecList = [];
                if (sheetLayoutGroups) {
                    sheetLayoutGroups.forEach(function(g, idx) {
                        ecList.push(g.edge_colors || { top: [255,255,255], bottom: [255,255,255], left: [255,255,255], right: [255,255,255] });
                    });
                }

                var layoutParams = JSON.stringify({
                    mode: 'sheet_layout',
                    roll_width_cm: rollWidthCm,
                    total_height_cm: sheetLayoutResult.total_height_cm,
                    margin_cm: marginCm,
                    cut_marks: hasCut,
                    scale_factor: getSheetScaleFactor(),
                    bleed_mm: 3,
                    gaps: [],  // v5: per-edge bleed가 placements.bleed에 포함
                    edge_colors: ecList,
                    placements: sheetLayoutResult.placements
                });
                var hiddenInput = document.createElement('input');
                hiddenInput.type  = 'hidden';
                hiddenInput.name  = 'sheet_layout_params_' + parentId;
                hiddenInput.value = layoutParams;
                var parentRow = document.getElementById('item-' + parentId);
                if (parentRow) parentRow.appendChild(hiddenInput);

                // 부모 수량 = 1
                var qtyInput = document.querySelector('[name="quantity_' + parentId + '"]');
                if (qtyInput) qtyInput.value = 1;

                // 부모 행의 scale_factor를 시트 스케일로 설정 (자식 행이 이 값을 참조)
                var sfEl = document.querySelector('[name="scale_factor_' + parentId + '"]');
                if (sfEl) sfEl.value = getSheetScaleFactor();

                // 자식 행 생성
                sheetLayoutGroups.forEach(function(group, i) {
                    addChildItemRow(parentId, group);
                    // 마지막으로 추가된 자식 행의 수량 설정
                    var childRows = document.querySelectorAll('[data-parent-id="' + parentId + '"]');
                    var lastChild = childRows[childRows.length - 1];
                    if (lastChild) {
                        var childId = lastChild.id ? lastChild.id.replace('item-', '') : null;
                        if (childId) {
                            var childQtyEl = document.querySelector('[name="quantity_' + childId + '"]') ||
                                             document.querySelector('[name="child_qty_' + childId + '"]');
                            if (childQtyEl) childQtyEl.value = sheetQuantities[i] || 1;
                        }
                    }
                });

                calcItem(parentId);
                calculateTotal();

                // UI 업데이트
                var aiResultTabs = document.getElementById('aiResultTabs');
                if (aiResultTabs) aiResultTabs.classList.add('hidden');

                var statusEl = document.getElementById('aiAnalysisStatus');
                if (statusEl) {
                    statusEl.textContent = '시트 배치 확정 완료 — ' + childCount + '개 자식 행 생성';
                    statusEl.className = 'mt-2 text-sm text-green-600';
                    statusEl.classList.remove('hidden');
                }

                showToast('시트 배치가 주문 라인에 추가되었습니다.', 'success');
            };

