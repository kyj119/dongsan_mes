// orderForm/finishing.js — 마감 PP/타공/오프셋/주석 (Phase 3.1.C 분할)

            // ========== 마감 방식 (주문서) ==========
            var finishingMethodsCache = [];

            async function loadFinishingMethodsForOrder() {
                if (finishingMethodsCache.length > 0) return;
                try {
                    var res = await axios.get('/api/finishing/methods');
                    finishingMethodsCache = (res.data.data || []).map(function(m) {
                        return { name: m.name, margin: m.margin_cm };
                    });
                } catch(e) { console.warn('마감 방식 로드 실패'); }
            }

            async function loadFinishingForOrder(id) {
                await loadFinishingMethodsForOrder();
                var methods = finishingMethodsCache;

                var opts = '<option value="">없음</option>' + methods.map(function(m) {
                    return '<option value="' + m.name + '">' + m.name + ' (' + m.margin + 'cm)</option>';
                }).join('');
                ['fin_top_','fin_bottom_','fin_left_','fin_right_'].forEach(function(prefix) {
                    var sel = document.querySelector('[name="' + prefix + id + '"]');
                    if (sel) sel.innerHTML = opts;
                });

                // 프리셋 버튼
                try {
                    var presetsRes = await axios.get('/api/finishing/presets');
                    var presets = presetsRes.data.data || [];
                    var presetsEl = document.getElementById('finishing_presets_' + id);
                    if (presetsEl && presets.length > 0) {
                        presetsEl.innerHTML = presets.map(function(p) {
                            return '<button type="button" data-preset-id="' + id + '" onclick="applyFinPresetToOrder(' + id + ',\'' + escapeHtml(p.config).replace(/'/g, "\\'") + '\',this)" '
                                + 'class="fin-preset-btn px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded hover:bg-blue-100 hover:text-blue-700 border border-transparent">'
                                + escapeHtml(p.name) + '</button>';
                        }).join('');
                    }
                } catch(e) {}
            }

            window.applyFinPresetToOrder = function(itemId, configStr, btnEl) {
                try {
                    var config = JSON.parse(configStr.replace(/&quot;/g, '"'));
                    ['top','bottom','left','right'].forEach(function(dir) {
                        var sel = document.querySelector('[name="fin_' + dir + '_' + itemId + '"]');
                        if (sel && config[dir]) sel.value = config[dir];
                    });
                    var allSame = config.top && config.top === config.bottom && config.top === config.left && config.top === config.right;
                    if (!allSame) {
                        var sides = document.getElementById('finishing_sides_' + itemId);
                        if (sides) sides.classList.remove('hidden');
                    }
                    // 선택된 프리셋 강조 표시
                    document.querySelectorAll('[data-preset-id="' + itemId + '"]').forEach(function(b) {
                        b.className = 'fin-preset-btn px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded border border-transparent';
                    });
                    if (btnEl) {
                        btnEl.className = 'fin-preset-btn px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded border border-blue-600';
                    }
                    calcFinishing(itemId);
                } catch(e) {}
            };

            // 사방 동일 적용
            window.applyFinishingAll = function(itemId) {
                var allSel = document.querySelector('[name="fin_all_' + itemId + '"]');
                var val = allSel ? allSel.value : '';
                ['fin_top_','fin_bottom_','fin_left_','fin_right_'].forEach(function(prefix) {
                    var sel = document.querySelector('[name="' + prefix + itemId + '"]');
                    if (sel) sel.value = val;
                });
                calcFinishing(itemId);
            };

            // 개별 설정 토글
            window.toggleFinishingDetail = function(itemId) {
                var sides = document.getElementById('finishing_sides_' + itemId);
                var btn = document.querySelector('#finishing_simple_' + itemId + ' button');
                if (sides) {
                    var isHidden = sides.classList.contains('hidden');
                    sides.classList.toggle('hidden');
                    if (btn) btn.textContent = isHidden ? '개별 설정 ▴' : '개별 설정 ▾';
                }
            };

            // 방식 선택 시 기본 cm 자동 채움
            window.onFinMethodChange = function(itemId, direction) {
                var sel = document.querySelector('[name="fin_' + direction + '_' + itemId + '"]');
                var cmInput = document.querySelector('[name="fin_cm_' + direction + '_' + itemId + '"]');
                if (sel && cmInput) {
                    var methodName = sel.value;
                    var m = finishingMethodsCache.find(function(fm) { return fm.name === methodName; });
                    cmInput.value = m ? m.margin : '';
                }
                calcFinishing(itemId);
            };

            window.calcFinishing = function(itemId) {
                var getVal = function(name) {
                    var sel = document.querySelector('[name="' + name + '"]');
                    return sel ? sel.value : '';
                };
                var getCm = function(direction) {
                    // cm 오버라이드 우선, 없으면 방식 기본값
                    var cmInput = document.querySelector('[name="fin_cm_' + direction + '_' + itemId + '"]');
                    if (cmInput && cmInput.value !== '') return parseFloat(cmInput.value) || 0;
                    var methodName = getVal('fin_' + direction + '_' + itemId);
                    var m = finishingMethodsCache.find(function(fm) { return fm.name === methodName; });
                    return m ? m.margin : 0;
                };

                var mTop = getCm('top'), mBottom = getCm('bottom'), mLeft = getCm('left'), mRight = getCm('right');

                var widthEl = document.querySelector('[name="width_' + itemId + '"]');
                var heightEl = document.querySelector('[name="height_' + itemId + '"]');
                var w = parseFloat(widthEl?.value) || 0;
                var h = parseFloat(heightEl?.value) || 0;

                var calcEl = document.getElementById('finishing_calc_' + itemId);
                if (calcEl && (mTop || mBottom || mLeft || mRight) && w && h) {
                    var finalW = w + mLeft + mRight;
                    var finalH = h + mTop + mBottom;
                    calcEl.innerHTML = '<i class="fas fa-ruler-combined mr-1 text-blue-400"></i>여백: 상' + mTop + ' 하' + mBottom + ' 좌' + mLeft + ' 우' + mRight + 'cm → <span class="font-medium text-blue-600">' + finalW + '×' + finalH + 'cm</span>';
                } else if (calcEl) {
                    calcEl.innerHTML = '';
                }
            };

            async function loadItemPP(rowId, subcat) {
                const container = document.getElementById('pp_options_' + rowId);
                if (!container) return;
                container.innerHTML = '<span class="text-gray-400">로딩 중...</span>';

                if (!subcat) {
                    container.innerHTML = '<span class="text-gray-400 text-xs">소분류 미지정 품목 (후가공 없음)</span>';
                    return;
                }

                try {
                    const res = await axios.get('/api/post-processing/by-subcategory/' + encodeURIComponent(subcat));
                    const options = res.data.data || [];

                    const finishOpts = options.filter(function(o) { return (o.pp_category || 'finish') === 'finish'; });
                    const punchingOpt = options.find(function(o) { return o.pp_category === 'punching'; });
                    const annotationOpt = options.find(function(o) { return o.pp_category === 'annotation'; });
                    const offsetOpt = options.find(function(o) { return o.pp_category === 'offset'; });


                    let html = '';

                    // --- Section 1: Finish PP — per-direction rows ---
                    if (finishOpts.length > 0) {
                        html += '<div class="pp-finish-section mb-3">';
                        html += '<label class="block text-xs font-medium text-gray-600 mb-1">\ub9c8\uac10 \ubc29\uc2dd</label>';

                        // 전체 동일 적용 빠른 선택
                        html += '<div class="pp-finish-all flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">';
                        html += '<span class="text-xs text-blue-600 font-medium whitespace-nowrap">\uc804\uccb4</span>';
                        html += '<select class="pp-finish-all-select flex-1 border border-blue-200 rounded px-2 py-1 text-sm bg-blue-50" data-row="' + rowId + '">';
                        html += '<option value="">\uc120\ud0dd</option>';
                        finishOpts.forEach(function(opt) {
                            html += '<option value="' + opt.id + '"'
                                + ' data-pp-name="' + (opt.option_name || '') + '"'
                                + '>' + opt.option_name + ' (\uc804\uccb4 \ub3d9\uc77c)</option>';
                        });
                        html += '</select>';
                        html += '</div>';

                        var directions = [
                            { key: 'top',    label: '\uc0c1(T)', marginKey: 'margin_top' },
                            { key: 'bottom', label: '\ud558(B)', marginKey: 'margin_bottom' },
                            { key: 'left',   label: '\uc88c(L)', marginKey: 'margin_left' },
                            { key: 'right',  label: '\uc6b0(R)', marginKey: 'margin_right' }
                        ];

                        directions.forEach(function(dir) {
                            html += '<div class="pp-finish-dir-row flex items-center gap-2 mb-1" data-direction="' + dir.key + '">';
                            html += '<span class="w-10 text-xs text-gray-500">' + dir.label + '</span>';
                            html += '<select class="pp-finish-dir flex-1 border border-gray-300 rounded px-2 py-1 text-sm" data-direction="' + dir.key + '" data-row="' + rowId + '">';
                            html += '<option value="">\uc5c6\uc74c</option>';
                            finishOpts.forEach(function(opt) {
                                html += '<option value="' + opt.id + '"'
                                    + ' data-pp-id="' + opt.id + '"'
                                    + ' data-pp-code="' + (opt.option_code || '') + '"'
                                    + ' data-pp-name="' + (opt.option_name || '') + '"'
                                    + ' data-margin-default="' + (opt[dir.marginKey] || 0) + '"'
                                    + ' data-pricing-type="' + (opt.pricing_type || 'fixed') + '"'
                                    + ' data-additional-cost="' + (opt.additional_cost || 0) + '"'
                                    + ' data-unit-price="' + (opt.unit_price || 0) + '"'
                                    + '>' + opt.option_name + '</option>';
                            });
                            html += '</select>';
                            html += '<input type="number" step="0.1" min="0" class="pp-finish-dir-margin w-16 border rounded px-1 py-0.5 text-center text-xs" data-direction="' + dir.key + '" data-row="' + rowId + '" style="display:none">';
                            html += '<span class="pp-dir-cm text-xs text-gray-400" style="display:none">cm</span>';
                            html += '</div>';
                        });

                        html += '<span class="pp-finish-cost text-xs text-orange-600 font-medium mt-1 block"></span>';
                        html += '</div>';
                    }

                    // --- Section 2: Punching checkbox ---
                    if (punchingOpt) {
                        html += '<div class="pp-punching-section mb-3 pt-2 border-t border-gray-100"'
                            + ' data-pp-id="' + punchingOpt.id + '"'
                            + ' data-pp-code="' + (punchingOpt.option_code || '') + '"'
                            + ' data-pp-name="' + (punchingOpt.option_name || '') + '"'
                            + ' data-margin-top="' + (punchingOpt.margin_top || 0) + '"'
                            + ' data-margin-bottom="' + (punchingOpt.margin_bottom || 0) + '"'
                            + ' data-margin-left="' + (punchingOpt.margin_left || 0) + '"'
                            + ' data-margin-right="' + (punchingOpt.margin_right || 0) + '"'
                            + ' data-pricing-type="' + (punchingOpt.pricing_type || 'fixed') + '"'
                            + ' data-additional-cost="' + (punchingOpt.additional_cost || 0) + '"'
                            + ' data-unit-price="' + (punchingOpt.unit_price || 0) + '"'
                            + '>';
                        html += '<label class="flex items-center gap-2 cursor-pointer">';
                        html += '<input type="checkbox" id="pp_punching_check_' + rowId + '" class="pp-punching-check h-4 w-4" data-row="' + rowId + '">';
                        html += '<span class="font-medium text-sm text-gray-700">\ud380\uce6d</span>';
                        html += '</label>';
                        html += '<div id="pp_punching_detail_' + rowId + '" class="mt-2 ml-6" style="display:none;">';
                        html += '<div class="flex gap-1 mb-2 flex-wrap">';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="top_bottom" data-row="' + rowId + '">\uc0c1\ud558</button>';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="left_right" data-row="' + rowId + '">\uc88c\uc6b0</button>';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="all_sides" data-row="' + rowId + '">\uc0c1\ud558\uc88c\uc6b0</button>';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="corners" data-row="' + rowId + '">4\ubaa8\uc11c\ub9ac</button>';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="reset" data-row="' + rowId + '">\ucd08\uae30\ud654</button>';
                        html += '</div>';
                        html += '<div class="grid grid-cols-3 gap-1 text-center text-xs" style="max-width:200px;">';
                        html += '<label class="flex flex-col items-center"><span>\uc88c\uc0c1</span><input type="number" min="0" max="1" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="corner_tl" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc0c1</span><input type="number" min="0" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="side_top" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc6b0\uc0c1</span><input type="number" min="0" max="1" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="corner_tr" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc88c</span><input type="number" min="0" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="side_left" data-row="' + rowId + '"></label>';
                        html += '<div class="flex items-center justify-center text-gray-400 text-xs">\ucd9c\ub825\ubb3c</div>';
                        html += '<label class="flex flex-col items-center"><span>\uc6b0</span><input type="number" min="0" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="side_right" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc88c\ud558</span><input type="number" min="0" max="1" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="corner_bl" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\ud558</span><input type="number" min="0" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="side_bottom" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc6b0\ud558</span><input type="number" min="0" max="1" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="corner_br" data-row="' + rowId + '"></label>';
                        html += '</div>';
                        html += '<span class="pp-punching-cost text-xs text-orange-600 font-medium mt-1 block"></span>';
                        html += '</div>';
                        html += '</div>';
                    }

                    // --- Section 2.5: Offset (다이컷) checkbox ---
                    if (offsetOpt) {
                        html += '<div class="pp-offset-section mb-2 pt-2 border-t border-gray-100"'
                            + ' data-pp-id="' + offsetOpt.id + '"'
                            + ' data-pp-code="' + (offsetOpt.option_code || '') + '"'
                            + ' data-pp-name="' + (offsetOpt.option_name || '') + '"'
                            + ' data-pricing-type="' + (offsetOpt.pricing_type || 'fixed') + '"'
                            + ' data-additional-cost="' + (offsetOpt.additional_cost || 0) + '"'
                            + ' data-unit-price="' + (offsetOpt.unit_price || 0) + '"'
                            + '>';
                        html += '<label class="flex items-center gap-2 cursor-pointer">';
                        html += '<input type="checkbox" id="pp_offset_check_' + rowId + '" class="pp-offset-check h-4 w-4" data-row="' + rowId + '">';
                        html += '<span class="font-medium text-sm text-gray-700">오프셋(다이컷)</span>';
                        html += '</label>';
                        html += '<div id="pp_offset_detail_' + rowId + '" class="mt-2 ml-6" style="display:none;">';
                        html += '<div class="grid grid-cols-4 gap-2 mb-1">';
                        html += '<div class="text-center"><label class="text-xs text-gray-600 block mb-1">상단</label>'
                            + '<input type="number" min="0" max="20" step="0.5" value="0" '
                            + 'class="pp-offset-top w-full border rounded px-2 py-1 text-sm text-center" data-row="' + rowId + '"></div>';
                        html += '<div class="text-center"><label class="text-xs text-gray-600 block mb-1">하단</label>'
                            + '<input type="number" min="0" max="20" step="0.5" value="0" '
                            + 'class="pp-offset-bottom w-full border rounded px-2 py-1 text-sm text-center" data-row="' + rowId + '"></div>';
                        html += '<div class="text-center"><label class="text-xs text-gray-600 block mb-1">좌측</label>'
                            + '<input type="number" min="0" max="20" step="0.5" value="0" '
                            + 'class="pp-offset-left w-full border rounded px-2 py-1 text-sm text-center" data-row="' + rowId + '"></div>';
                        html += '<div class="text-center"><label class="text-xs text-gray-600 block mb-1">우측</label>'
                            + '<input type="number" min="0" max="20" step="0.5" value="0" '
                            + 'class="pp-offset-right w-full border rounded px-2 py-1 text-sm text-center" data-row="' + rowId + '"></div>';
                        html += '</div>';
                        html += '<p class="text-xs text-gray-400">가장자리: 에지 스트립 확장 (도련). 스케일: 비례 확대 (다이컷).</p>';
                        html += '<div class="flex gap-4 mt-2 pt-2 border-t border-gray-100">';
                        html += '<label class="flex items-center gap-1.5 text-sm">';
                        html += '<span class="text-xs text-gray-600">확장:</span>';
                        html += '<select class="pp-offset-method border rounded px-2 py-1 text-xs" data-row="' + rowId + '">';
                        html += '<option value="edge_strip">가장자리(도련)</option>';
                        html += '<option value="scale">스케일(다이컷)</option>';
                        html += '</select></label>';
                        html += '<label class="flex items-center gap-1.5 text-sm">';
                        html += '<input type="checkbox" class="pp-offset-cutline h-4 w-4" data-row="' + rowId + '" checked>';
                        html += '<span class="text-xs text-gray-600">재단선(M100)</span>';
                        html += '</label>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    }

                    // --- Section 3: Annotation checkbox ---
                    if (annotationOpt) {
                        html += '<div class="pp-annotation-section mb-2 pt-2 border-t border-gray-100"'
                            + ' data-pp-id="' + annotationOpt.id + '"'
                            + ' data-pp-code="' + (annotationOpt.option_code || '') + '"'
                            + ' data-pp-name="' + (annotationOpt.option_name || '') + '"'
                            + ' data-pricing-type="' + (annotationOpt.pricing_type || 'fixed') + '"'
                            + ' data-additional-cost="' + (annotationOpt.additional_cost || 0) + '"'
                            + ' data-unit-price="' + (annotationOpt.unit_price || 0) + '"'
                            + '>';
                        html += '<label class="flex items-center gap-2 cursor-pointer">';
                        html += '<input type="checkbox" id="pp_annotation_check_' + rowId + '" class="pp-annotation-check h-4 w-4" data-row="' + rowId + '" disabled>';
                        html += '<span class="font-medium text-sm text-gray-400" id="pp_annotation_label_' + rowId + '">\uc8fc\uc11d <span class="text-xs font-normal">(\uc5ec\ubc31 \ud544\uc694)</span></span>';
                        html += '</label>';
                        html += '<div id="pp_annotation_detail_' + rowId + '" class="mt-2 ml-6" style="display:none;">';
                        html += '<div class="flex gap-3 flex-wrap">';
                        html += '<label class="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" class="pp-anno-dir h-3.5 w-3.5" data-dir="\uc0c1" data-row="' + rowId + '"> \uc0c1</label>';
                        html += '<label class="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" class="pp-anno-dir h-3.5 w-3.5" data-dir="\ud558" data-row="' + rowId + '" checked> \ud558</label>';
                        html += '<label class="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" class="pp-anno-dir h-3.5 w-3.5" data-dir="\uc88c" data-row="' + rowId + '"> \uc88c</label>';
                        html += '<label class="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" class="pp-anno-dir h-3.5 w-3.5" data-dir="\uc6b0" data-row="' + rowId + '"> \uc6b0</label>';
                        html += '</div>';
                        html += '<div class="mt-1.5">';
                        html += '<input type="text" class="pp-anno-text w-full px-2 py-1 border border-gray-300 rounded text-xs" data-row="' + rowId + '" placeholder="\uc790\ub3d9\uc0dd\uc131 (\uc608: \uc2e4\uc0ac\uad11\uace0-615x375-1\uac1c)">';
                        html += '</div>';
                        html += '<span class="pp-annotation-cost text-xs text-orange-600 font-medium mt-1 block"></span>';
                        html += '</div>';
                        html += '</div>';
                    }

                    container.innerHTML = html || '<div class="text-sm text-gray-400">\uc774 \uc18c\ubd84\ub958\uc5d0 \uc801\uc6a9 \uac00\ub2a5\ud55c \ud6c4\uac00\uacf5\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</div>';

                    setupPPEvents(rowId);

                } catch(e) {
                    console.error('loadItemPP error:', e);
                    container.innerHTML = '<span class="text-red-400 text-xs">\ud6c4\uac00\uacf5 \ub85c\ub529 \uc2e4\ud328</span>';
                }
            }

            function setupPPEvents(rowId) {
                const container = document.getElementById('pp_options_' + rowId);
                if (!container) return;

                // "전체 동일" 빠른 선택 이벤트
                var allSelect = container.querySelector('.pp-finish-all-select');
                if (allSelect) {
                    allSelect.addEventListener('change', function() {
                        var val = this.value;
                        container.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                            sel.value = val;
                            sel.dispatchEvent(new Event('change'));
                        });
                        this.value = '';
                    });
                }

                // Per-direction finish dropdown change
                container.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                    sel.addEventListener('change', function() {
                        var row = this.closest('.pp-finish-dir-row');
                        var marginInput = row.querySelector('.pp-finish-dir-margin');
                        var cmLabel = row.querySelector('.pp-dir-cm');
                        if (this.value) {
                            var opt = this.options[this.selectedIndex];
                            marginInput.value = opt.dataset.marginDefault || 0;
                            marginInput.style.display = '';
                            if (cmLabel) cmLabel.style.display = '';
                        } else {
                            marginInput.style.display = 'none';
                            if (cmLabel) cmLabel.style.display = 'none';
                        }
                        updateAnnotationState(rowId);
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Per-direction margin input change
                container.querySelectorAll('.pp-finish-dir-margin').forEach(function(inp) {
                    inp.addEventListener('input', function() {
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Punching checkbox
                const punchCheck = container.querySelector('.pp-punching-check');
                if (punchCheck) {
                    punchCheck.addEventListener('change', function() {
                        const detail = document.getElementById('pp_punching_detail_' + rowId);
                        if (detail) detail.style.display = this.checked ? '' : 'none';
                        updateAnnotationState(rowId);
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                }

                // Punching grid input changes
                container.querySelectorAll('.pp-punch-val').forEach(function(input) {
                    input.addEventListener('input', function() {
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Punching preset buttons
                container.querySelectorAll('.pp-punch-preset').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        const preset = this.dataset.preset;
                        const vals = container.querySelectorAll('.pp-punch-val');
                        const map = {};
                        vals.forEach(function(v) { map[v.dataset.key] = v; });

                        // Reset all first
                        vals.forEach(function(v) { v.value = 0; });

                        if (preset === 'top_bottom') {
                            if (map['side_top']) map['side_top'].value = 1;
                            if (map['side_bottom']) map['side_bottom'].value = 1;
                        } else if (preset === 'left_right') {
                            if (map['side_left']) map['side_left'].value = 1;
                            if (map['side_right']) map['side_right'].value = 1;
                        } else if (preset === 'all_sides') {
                            if (map['side_top']) map['side_top'].value = 1;
                            if (map['side_bottom']) map['side_bottom'].value = 1;
                            if (map['side_left']) map['side_left'].value = 1;
                            if (map['side_right']) map['side_right'].value = 1;
                        } else if (preset === 'corners') {
                            if (map['corner_tl']) map['corner_tl'].value = 1;
                            if (map['corner_tr']) map['corner_tr'].value = 1;
                            if (map['corner_bl']) map['corner_bl'].value = 1;
                            if (map['corner_br']) map['corner_br'].value = 1;
                        }
                        // 'reset' just leaves all at 0

                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Annotation checkbox
                const annoCheck = container.querySelector('.pp-annotation-check');
                if (annoCheck) {
                    annoCheck.addEventListener('change', function() {
                        const detail = document.getElementById('pp_annotation_detail_' + rowId);
                        if (detail) detail.style.display = this.checked ? '' : 'none';
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                }

                // Annotation direction checkboxes
                container.querySelectorAll('.pp-anno-dir').forEach(function(cb) {
                    cb.addEventListener('change', function() {
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Offset checkbox
                const offsetCheck = container.querySelector('.pp-offset-check');
                if (offsetCheck) {
                    offsetCheck.addEventListener('change', function() {
                        const detail = document.getElementById('pp_offset_detail_' + rowId);
                        if (detail) detail.style.display = this.checked ? '' : 'none';
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                }


            }

            function updateAnnotationState(rowId) {
                const container = document.getElementById('pp_options_' + rowId);
                if (!container) return;

                const annoCheck = container.querySelector('.pp-annotation-check');
                const annoLabel = document.getElementById('pp_annotation_label_' + rowId);

                if (!annoCheck) return;

                var hasFinish = Array.from(container.querySelectorAll('.pp-finish-dir')).some(function(sel) { return sel.value !== ''; });
                // 펀칭은 여백 0 (마크가 그룹 안쪽) → annotation enable 무관
                var hasMargins = hasFinish;

                annoCheck.disabled = !hasMargins;
                if (annoLabel) {
                    annoLabel.className = hasMargins
                        ? 'font-medium text-sm text-gray-700'
                        : 'font-medium text-sm text-gray-400';
                    annoLabel.innerHTML = hasMargins
                        ? '\uc8fc\uc11d'
                        : '\uc8fc\uc11d <span class="text-xs font-normal">(\uc5ec\ubc31 \ud544\uc694)</span>';
                }

                // If margins removed, uncheck annotation
                if (!hasMargins && annoCheck.checked) {
                    annoCheck.checked = false;
                    const detail = document.getElementById('pp_annotation_detail_' + rowId);
                    if (detail) detail.style.display = 'none';
                }
            }

            function renumberDisplay() {
                document.querySelectorAll('#itemsContainer > [id^="item-"]').forEach(function(row, idx) {
                    var span = row.querySelector('span.font-bold.text-gray-700');
                    if (span) {
                        span.textContent = '품목 #' + (idx + 1);
                    } else {
                        var pspan = row.querySelector('span.font-bold.text-green-700');
                        if (pspan) pspan.textContent = '묶음 품목 #' + (idx + 1);
                    }
                });
            }

