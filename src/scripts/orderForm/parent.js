// orderForm/parent.js — AI 파일·결과 처리 + 부모/자식 행 + 후가공 복원 + 후행 ops (Phase 3.1.C 분할)

            window.onAIFileSelected = function(input) {
                selectedAIFile = input.files[0];
                if (selectedAIFile) {
                    localAIPath = null;
                    document.getElementById('aiLocalPath').value = '';
                    var sizeMB = (selectedAIFile.size / 1024 / 1024).toFixed(1);
                    document.getElementById('aiFileLabel').textContent = selectedAIFile.name + ' (' + sizeMB + 'MB)';
                    document.getElementById('aiAnalysisBtn').disabled = false;
                }
            };

            // 드래그 앤 드롭 핸들러
            window.handleAiFileDrop = function(e) {
                var files = e.dataTransfer.files;
                if (!files || files.length === 0) return;
                var file = files[0];
                var name = file.name.toLowerCase();
                if (!name.endsWith('.ai') && !name.endsWith('.eps')) {
                    showToast('AI 또는 EPS 파일만 지원합니다.', 'warning');
                    return;
                }
                selectedAIFile = file;
                localAIPath = null;
                document.getElementById('aiLocalPath').value = '';
                var sizeMB = (file.size / 1024 / 1024).toFixed(1);
                document.getElementById('aiFileLabel').textContent = file.name + ' (' + sizeMB + 'MB)';
                document.getElementById('aiAnalysisBtn').disabled = false;
                showToast(file.name + ' 파일이 선택되었습니다.', 'success');
            };

            function onAILocalPathChanged(input) {
                localAIPath = input.value.trim() || null;
                if (localAIPath) {
                    selectedAIFile = null;
                    document.getElementById('aiFileLabel').textContent = 'AI 파일 선택 (.ai, .eps)';
                    document.getElementById('aiFileInput').value = '';
                }
                document.getElementById('aiAnalysisBtn').disabled = !(localAIPath || selectedAIFile);
            }

            async function requestAIAnalysis() {
                if (!selectedAIFile && !localAIPath) { showToast('파일을 선택하거나 경로를 입력해주세요.', 'warning'); return; }

                const statusDiv = document.getElementById('aiAnalysisStatus');
                statusDiv.classList.remove('hidden');
                document.getElementById('aiAnalysisBtn').disabled = true;
                resolvedFilePath = null;

                // 503 재시도 헬퍼: 503 응답 시 2초 후 1회 재시도
                async function postWithRetry(url, data, config) {
                    try {
                        return await axios.post(url, data, config);
                    } catch (err503) {
                        if (err503.response && err503.response.status === 503) {
                            await new Promise(function(r) { setTimeout(r, 2000); });
                            return await axios.post(url, data, config);
                        }
                        throw err503;
                    }
                }

                try {
                    if (localAIPath) {
                        // 경로 입력 모드 — 청크 없이 바로 pending
                        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 분석 요청 중...';
                        const res = await postWithRetry('/api/ai-analysis',
                            { file_path: localAIPath }
                        );
                        if (!res.data.success) throw new Error(res.data.error || '요청 생성 실패');
                        aiAnalysisId = res.data.data.id;
                        await axios.patch('/api/ai-analysis/' + aiAnalysisId,
                            { status: 'pending' }
                        );
                    } else {
                        // 파일 피커 모드 — R2 직접 업로드
                        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 파일 업로드 중...';
                        var formData = new FormData();
                        formData.append('file', selectedAIFile);
                        var res = await axios.post('/api/ai-analysis/upload', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                            onUploadProgress: function(e) {
                                if (e.total) {
                                    var pct = Math.round(e.loaded / e.total * 100);
                                    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 업로드 중... ' + pct + '%';
                                }
                            }
                        });
                        if (!res.data.success) throw new Error(res.data.error || '업로드 실패');
                        aiAnalysisId = res.data.data.id;
                    }
                    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> IllustratorAutomat에서 분석 중... (최대 120초 대기)';
                    startAnalysisPolling();

                } catch(err) {
                    statusDiv.innerHTML = '<i class="fas fa-times-circle text-red-500 mr-1"></i> 오류: ' + (err.response?.data?.error || err.message);
                    document.getElementById('aiAnalysisBtn').disabled = false;
                }
            }

            function startAnalysisPolling() {
                if (analysisPollingTimer) clearInterval(analysisPollingTimer);
                const statusDiv = document.getElementById('aiAnalysisStatus');

                const timeoutId = setTimeout(() => {
                    clearInterval(analysisPollingTimer);
                    analysisPollingTimer = null;
                    statusDiv.innerHTML = '<i class="fas fa-clock text-amber-500 mr-1"></i> 시간 초과. IllustratorAutomat 실행 여부를 확인하세요.';
                }, 120000);

                analysisPollingTimer = setInterval(async () => {
                    try {
                        const res = await axios.get('/api/ai-analysis/' + aiAnalysisId);
                        const d = res.data.data;
                        if (d.status === 'done') {
                            clearInterval(analysisPollingTimer);
                            clearTimeout(timeoutId);
                            analysisPollingTimer = null;
                            resolvedFilePath = d.file_path || null; // temp 경로 저장 (주문 제출 시 사용)
                            const groups = JSON.parse(d.groups_json || '[]');
                            window._lastAnalysisGroups = groups;

                            sheetLayoutGroups = groups;
                            sheetQuantities = {};
                            groups.forEach(function(_, i) { sheetQuantities[i] = 1; });

                            // 탭 표시 + 품목 추출 탭 기본 선택
                            var aiResultTabs = document.getElementById('aiResultTabs');
                            if (aiResultTabs) aiResultTabs.classList.remove('hidden');
                            switchAiTab('extract');

                            statusDiv.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i> 분석 완료: '
                                + groups.length + '개 그룹 추출됨';
                        } else if (d.status === 'error') {
                            clearInterval(analysisPollingTimer);
                            clearTimeout(timeoutId);
                            analysisPollingTimer = null;
                            statusDiv.innerHTML = '<i class="fas fa-exclamation-circle text-red-500 mr-1"></i> 오류: ' + (d.error_message || '알 수 없는 오류');
                        }
                    } catch(err) {
                        console.warn('Polling error:', err.message);
                    }
                }, 2000);
            }

            function removeEmptyItemRows() {
                var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                rows.forEach(function(row) {
                    var id = row.id.replace('item-', '');
                    var name = (document.querySelector('[name="item_search_' + id + '"]') || {}).value || '';
                    var w = (document.querySelector('[name="width_' + id + '"]') || {}).value || '';
                    var h = (document.querySelector('[name="height_' + id + '"]') || {}).value || '';
                    var content = (document.querySelector('[name="content_' + id + '"]') || {}).value || '';
                    var itemId = (document.querySelector('[name="item_id_' + id + '"]') || {}).value || '';
                    var qty = (document.querySelector('[name="quantity_' + id + '"]') || {}).value || '1';
                    if (!name && !w && !h && !content && !itemId && qty === '1') {
                        row.remove();
                    }
                });
            }

            function populateRowsFromGroups(groups) {
                if (!groups || groups.length === 0) return;
                removeEmptyItemRows();

                // 개별 모드: 그룹당 행 1개 추가
                groups.forEach(function(group) {
                    addItemRow();
                    const id = itemCount;

                    const giEl = document.querySelector('[name="ai_group_index_' + id + '"]');
                    if (giEl) giEl.value = group.index;

                    // 현재 분석 요청 ID를 품목 행에 기록 (여러 파일 업로드 시 파일별 추적)
                    const aiIdEl = document.querySelector('[name="ai_analysis_id_' + id + '"]');
                    if (aiIdEl && aiAnalysisId) aiIdEl.value = aiAnalysisId;

                    const wEl = document.querySelector('[name="width_' + id + '"]');
                    const hEl = document.querySelector('[name="height_' + id + '"]');
                    const sfEl = document.querySelector('[name="scale_factor_' + id + '"]');
                    const sf = parseFloat(sfEl?.value) || 1;
                    if (wEl && group.width_mm) {
                        wEl.dataset.origMm = group.width_mm;
                        wEl.value = (group.width_mm / 10 * sf).toFixed(1);
                    }
                    if (hEl && group.height_mm) {
                        hEl.dataset.origMm = group.height_mm;
                        hEl.value = (group.height_mm / 10 * sf).toFixed(1);
                    }

                    // 품목명은 자동 입력하지 않음 (사용자가 직접 입력)

                    if (group.thumbnail_base64) {
                        const thumbDiv = document.getElementById('thumb_' + id);
                        const thumbImg = document.getElementById('thumb_img_' + id);
                        if (thumbDiv && thumbImg) {
                            thumbImg.src = 'data:image/png;base64,' + group.thumbnail_base64;
                            thumbDiv.classList.remove('hidden');
                        }
                    }

                    // AI 분석 행이므로 파일 스케일 표시
                    var scaleDiv = document.getElementById('scale_div_' + id);
                    if (scaleDiv) scaleDiv.classList.remove('hidden');

                    calcItem(id);
                });

                calculateTotal();

                // AI 파일 입력 초기화 (행이 추가된 후 선택 필드 리셋)
                const aiFileInputEl = document.getElementById('aiFileInput');
                if (aiFileInputEl) aiFileInputEl.value = '';
                const aiFileLabelEl = document.getElementById('aiFileLabel');
                if (aiFileLabelEl) aiFileLabelEl.textContent = 'AI 파일 선택 (.ai, .eps)';
                const aiLocalPathEl = document.getElementById('aiLocalPath');
                if (aiLocalPathEl) aiLocalPathEl.value = '';

                // 분석 완료 메시지 업데이트
                const statusDiv2 = document.getElementById('aiAnalysisStatus');
                if (statusDiv2) {
                    statusDiv2.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i> 분석 완료: '
                        + groups.length + '개 그룹 → ' + groups.length + '개 행 추가됨';
                }
            }

            // ── 묶음 편집: 하나의 품목으로 묶기 ──────────────────────────────
            window.populateAsGroupedItem = function(groups) {
                if (!groups || groups.length === 0) return;
                removeEmptyItemRows();
                const parentId = addParentItemRow(groups.length);

                // 부모 행에 규격 설정 (동일 규격이므로 첫 그룹 기준)
                const ref = groups[0];
                const sfEl = document.querySelector('[name="scale_factor_' + parentId + '"]');
                const sf = parseFloat(sfEl?.value) || 1;
                const wEl = document.querySelector('[name="width_' + parentId + '"]');
                const hEl = document.querySelector('[name="height_' + parentId + '"]');
                if (wEl && ref.width_mm) {
                    wEl.dataset.origMm = ref.width_mm;
                    wEl.value = (ref.width_mm / 10 * sf).toFixed(1);
                }
                if (hEl && ref.height_mm) {
                    hEl.dataset.origMm = ref.height_mm;
                    hEl.value = (ref.height_mm / 10 * sf).toFixed(1);
                }

                groups.forEach(function(group) {
                    addChildItemRow(parentId, group);
                });
                calcItem(parentId);
                calculateTotal();
                const sd = document.getElementById('aiAnalysisStatus');
                if (sd) {
                    sd.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i>'
                        + ' 묶음 추가 완료: 부모 행 1개 + 자식 ' + groups.length + '개';
                }
            };

            function addParentItemRow(childCount) {
                itemCount++;
                const id = itemCount;
                const pgId = 'pg' + id;
                const html = buildParentItemHtml(id, childCount, pgId);
                document.getElementById('itemsContainer').insertAdjacentHTML('beforeend', html);
                setupAutocomplete(id);
                var parentEl = document.getElementById('item-' + id);
                if (parentEl && window.bindMoneyInputs) window.bindMoneyInputs(parentEl);
                renumberDisplay();
                return id;
            }

            function buildParentItemHtml(id, childCount, pgId) {
                return `<div class="border-2 border-green-300 rounded-lg p-4 mb-1 bg-green-50" id="item-${id}">
                    <input type="hidden" name="ai_group_index_${id}" value="">
                    <input type="hidden" name="ai_analysis_id_${id}" value="">
                    <input type="hidden" name="client_group_id_${id}" value="${pgId}">
                    <input type="hidden" name="is_parent_${id}" value="1">
                    <input type="hidden" name="pricing_method_${id}" value="FIXED">
                    <div class="flex justify-between items-center mb-3">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-green-700">묶음 품목 #${id}</span>
                            <span id="parent_badge_${id}" class="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded font-medium">×${childCount}장</span>
                            <span class="text-xs text-green-600">(청구·정산 기준 행 — 각 장은 아래 자식 행)</span>
                        </div>
                        <button type="button" onclick="removeItem(${id})" class="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded hover:bg-red-50">
                            <i class="fas fa-trash mr-1"></i>삭제
                        </button>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                        <div class="col-span-2 relative">
                            <label class="block text-xs font-medium text-gray-600 mb-1">품목 <span class="text-red-500">*</span></label>
                            <input type="hidden" name="item_id_${id}">
                            <input type="hidden" name="item_unit_${id}" value="EA">
                            <input type="hidden" name="category_name_${id}">
                            <input type="hidden" name="item_subcat_${id}">
                            <input type="text" name="item_search_${id}" placeholder="🔍 품목명 검색..." autocomplete="off"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                            <div id="item_dd_${id}" class="item-dd hidden"></div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">가로 (cm)</label>
                            <input type="number" name="width_${id}" min="0" step="0.1" placeholder="예: 90"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">세로 (cm)</label>
                            <input type="number" name="height_${id}" min="0" step="0.1" placeholder="예: 60"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1"
                                   title="실제크기/파일크기 배율 (1:1=1, 1/5축소=5)">파일 스케일</label>
                            <input type="number" name="scale_factor_${id}" min="1" step="1" value="1"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                   title="실제크기/파일크기 배율. 1/5 축소 파일이면 5 입력"
                                   oninput="onParentScaleChange(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">수량 (자동)</label>
                            <input type="number" name="quantity_${id}" value="${childCount}" min="1"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">단위</label>
                            <input type="text" name="unit_display_${id}" value="EA" readonly
                                   class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600">
                        </div>
                        <div>
                            <label id="unit_price_label_${id}" class="block text-xs font-medium text-gray-600 mb-1">단가 (원)</label>
                            <input type="text" inputmode="numeric" data-money name="unit_price_${id}" value="0"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">금액</label>
                            <input type="text" name="amount_${id}" readonly value="0원"
                                   class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 font-bold text-blue-700">
                        </div>
                        <div class="flex items-end pb-1">
                            <label class="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" name="vat_${id}" checked class="rounded border-gray-300 text-blue-600" onchange="calculateTotal()">
                                <span class="text-gray-700">부가세 포함</span>
                            </label>
                        </div>
                    </div>
                    <div class="pt-2 border-t border-green-200" id="pp_section_${id}">
                        <label class="block text-xs font-medium text-green-700 mb-2">후가공 <span class="text-gray-400 font-normal">(자식 카드에 상속됨)</span></label>
                        <div id="pp_options_${id}" class="space-y-2 text-sm text-gray-400">품목을 선택하면 후가공 옵션이 표시됩니다.</div>
                        <div id="pp_subtotal_${id}" class="text-right text-sm font-medium text-orange-600 mt-1"></div>
                    </div>
                    <div class="pt-2 border-t border-green-200" id="finishing_section_${id}">
                        <label class="block text-xs font-medium text-green-700 mb-1">마감 방식</label>
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
                    <div class="mt-2 pt-2 border-t border-green-200 flex justify-start">
                        <button type="button" onclick="addManualChildRow(${id})"
                                class="text-sm px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-200 border border-green-300">
                            <i class="fas fa-plus mr-1"></i>자식 행 추가
                        </button>
                    </div>
                </div>`;
            }

            function addChildItemRow(parentId, group) {
                itemCount++;
                const id = itemCount;
                const sf = parseFloat(document.querySelector(`[name="scale_factor_${parentId}"]`)?.value) || 1;
                const wCm = group.width_mm ? (group.width_mm / 10 * sf).toFixed(1) : '';
                const hCm = group.height_mm ? (group.height_mm / 10 * sf).toFixed(1) : '';
                const isManual = (!group.width_mm && !group.height_mm && !group.thumbnail_base64);

                const thumbHtml = group.thumbnail_base64
                    ? `<img src="data:image/png;base64,${group.thumbnail_base64}"
                              class="w-24 h-24 object-contain border rounded bg-white flex-shrink-0 cursor-pointer"
                              onclick="openThumbModal('child_thumb_img_${id}')"
                              id="child_thumb_img_${id}">`
                    : `<div class="w-24 h-24 border rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">없음</div>`;

                const sizeHtml = isManual
                    ? `<div class="flex flex-col gap-1 flex-shrink-0">
                        <span class="text-xs text-gray-500">자식 ${group.index}</span>
                        <div class="flex items-center gap-1">
                            <input type="number" name="child_width_${id}" min="0" step="0.1" placeholder="가로"
                                   value="${wCm}" class="w-16 border rounded px-1 py-0.5 text-xs text-center" title="가로 (cm)">
                            <span class="text-xs text-gray-400">x</span>
                            <input type="number" name="child_height_${id}" min="0" step="0.1" placeholder="세로"
                                   value="${hCm}" class="w-16 border rounded px-1 py-0.5 text-xs text-center" title="세로 (cm)">
                            <span class="text-xs text-gray-400">cm</span>
                        </div>
                    </div>`
                    : `<span class="text-xs text-gray-500 w-20 flex-shrink-0"
                              data-orig-mm-w="${group.width_mm || 0}"
                              data-orig-mm-h="${group.height_mm || 0}">
                            그룹 ${group.index}<br>
                            <span id="child_size_${id}" class="text-gray-400">${wCm ? wCm + '×' + hCm + 'cm' : ''}</span>
                        </span>`;

                const hiddenSizeHtml = isManual
                    ? ''
                    : `<input type="hidden" name="child_width_${id}" value="${wCm}">
                    <input type="hidden" name="child_height_${id}" value="${hCm}">`;

                const html = `<div id="item_row_${id}"
                     class="flex items-center gap-3 border-l-4 border-green-400 bg-green-50 ml-4 pl-3 pr-3 py-2 mb-1 rounded-r child-item-row"
                     data-parent-row="${parentId}">
                    ${thumbHtml}
                    ${sizeHtml}
                    <input type="text" name="child_content_${id}" placeholder="내용명 (예: ○○마트 행사)"
                           class="flex-1 border rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-green-400 min-w-0">
                    <input type="number" name="child_qty_${id}" value="1" min="1"
                           class="w-16 border rounded px-2 py-1.5 text-sm text-center focus:ring-1 focus:ring-green-400 flex-shrink-0"
                           oninput="updateParentChildCount(${parentId})"
                           title="수량">
                    <button type="button" onclick="removeChildItem(${id}, ${parentId})"
                            class="text-red-400 hover:text-red-600 flex-shrink-0 px-1">
                        <i class="fas fa-times"></i>
                    </button>
                    <input type="hidden" name="parent_client_id_${id}" value="pg${parentId}">
                    <input type="hidden" name="child_ai_group_index_${id}" value="${group.index}">
                    <input type="hidden" name="child_ai_analysis_id_${id}" value="${aiAnalysisId || ''}">
                    ${hiddenSizeHtml}
                    <input type="hidden" name="child_scale_factor_${id}" value="${sf}">
                    <input type="hidden" name="is_child_${id}" value="1">
                </div>`;

                // Task 5: 자식 행을 부모 바로 아래, 기존 자식 뒤에 삽입
                const siblings = document.querySelectorAll('[data-parent-row="' + parentId + '"]');
                if (siblings.length > 0) {
                    siblings[siblings.length - 1].insertAdjacentHTML('afterend', html);
                } else {
                    document.getElementById('item-' + parentId).insertAdjacentHTML('afterend', html);
                }
                return id;
            }

            window.removeChildItem = function(childId, parentId) {
                document.getElementById('item_row_' + childId)?.remove();
                const remaining = document.querySelectorAll('[data-parent-row="' + parentId + '"]');
                if (remaining.length === 0) {
                    const parentEl = document.getElementById('item-' + parentId);
                    if (parentEl) {
                        parentEl.remove();
                        renumberDisplay();
                    }
                } else {
                    updateParentChildCount(parentId);
                }
                calculateTotal();
            };

            window.addManualChildRow = function(parentId) {
                const existingChildren = document.querySelectorAll('[data-parent-row="' + parentId + '"]');
                const nextIndex = existingChildren.length + 1;
                addChildItemRow(parentId, {
                    index: nextIndex,
                    width_mm: 0,
                    height_mm: 0,
                    thumbnail_base64: null
                });
                updateParentChildCount(parentId);
                calculateTotal();
            };

            function updateParentChildCount(parentId) {
                let total = 0;
                document.querySelectorAll('[data-parent-row="' + parentId + '"]').forEach(function(row) {
                    const childId = row.id.replace('item_row_', '');
                    const qtyEl = row.querySelector('[name="child_qty_' + childId + '"]');
                    total += parseInt(qtyEl?.value || '1');
                });
                const badge = document.getElementById('parent_badge_' + parentId);
                if (badge) badge.textContent = '×' + total + '장';
                const qtyEl = document.querySelector('[name="quantity_' + parentId + '"]');
                if (qtyEl) { qtyEl.value = total; calcItem(parentId); }
            }


            // ── 수정 모드 진입 처리 ──────────────────────────────────────────

            // 상태 텍스트/색상 (order-form 내부용)
            function getStatusText(status) {
                const map = {
                    'CONFIRMED': '확정',
                    'PRINTING': '출력중',
                    'PRINT_DONE': '출력완료', 'SHIPPED': '출고완료',
                    'HOLD': '보류', 'CANCELLED': '취소'
                };
                return map[status] || status;
            }
            function getStatusColor(status) {
                const map = {
                    'CONFIRMED': 'bg-blue-50 text-blue-700',
                    'PRINTING': 'bg-orange-100 text-orange-800',
                    'PRINT_DONE': 'bg-green-50 text-green-700',
                    'SHIPPED': 'bg-gray-100 text-gray-700',
                    'HOLD': 'bg-gray-200 text-gray-600',
                    'CANCELLED': 'bg-red-50 text-red-700'
                };
                return map[status] || 'bg-gray-100 text-gray-800';
            }

            // 후가공 복원 헬퍼
            function restorePostProcessing(rowId, ppJson) {
                if (!ppJson) return;
                try {
                    const ppArr = typeof ppJson === 'string' ? JSON.parse(ppJson) : ppJson;
                    if (!Array.isArray(ppArr) || ppArr.length === 0) return;

                    const container = document.getElementById('pp_options_' + rowId);
                    if (!container) return;

                    // Sort: finish → punching → offset → annotation (annotation last for correct enable state)
                    ppArr.sort(function(a, b) {
                        var order = { 'PUNCHING': 1, 'OFFSET': 2, 'ANNOTATION': 3 };
                        return (order[a.code] || 0) - (order[b.code] || 0);
                    });
                    ppArr.forEach(function(pp) {
                        const code = pp.code || pp.option_code || '';

                        if (code === 'PUNCHING') {
                            // Restore punching
                            const punchCheck = container.querySelector('.pp-punching-check');
                            if (punchCheck) {
                                punchCheck.checked = true;
                                const detail = document.getElementById('pp_punching_detail_' + rowId);
                                if (detail) detail.style.display = '';
                                // Restore grid values
                                if (pp.params) {
                                    Object.keys(pp.params).forEach(function(key) {
                                        if (key.startsWith('margin_')) return; // skip margin params
                                        const input = container.querySelector('.pp-punch-val[data-key="' + key + '"]');
                                        if (input) {
                                            const v = pp.params[key];
                                            input.value = (v === true) ? 1 : (v === false ? 0 : (parseInt(v) || 0));
                                        }
                                    });
                                }
                            }
                        } else if (code === 'ANNOTATION') {
                            // Restore annotation — enable first (may be disabled)
                            const annoCheck = container.querySelector('.pp-annotation-check');
                            if (annoCheck) {
                                annoCheck.disabled = false;
                                const annoLabel = document.getElementById('pp_annotation_label_' + rowId);
                                if (annoLabel) {
                                    annoLabel.className = 'font-medium text-sm text-gray-700';
                                    annoLabel.innerHTML = '\uc8fc\uc11d';
                                }
                                annoCheck.checked = true;
                                const detail = document.getElementById('pp_annotation_detail_' + rowId);
                                if (detail) detail.style.display = '';
                                // Restore positions (new: array) or position (legacy: string)
                                var positions = (pp.params && pp.params.positions) || (pp.params && pp.params.position ? [pp.params.position] : []);
                                // Uncheck all first
                                container.querySelectorAll('.pp-anno-dir').forEach(function(cb) { cb.checked = false; });
                                // Check saved positions
                                positions.forEach(function(dir) {
                                    var cb = container.querySelector('.pp-anno-dir[data-dir="' + dir + '"]');
                                    if (cb) cb.checked = true;
                                });
                                // Restore customText
                                if (pp.params && pp.params.customText) {
                                    var annoTextInput = container.querySelector('.pp-anno-text');
                                    if (annoTextInput) annoTextInput.value = pp.params.customText;
                                }
                            }
                        } else if (code === 'OFFSET') {
                            const offsetCheck = container.querySelector('.pp-offset-check');
                            if (offsetCheck) {
                                offsetCheck.checked = true;
                                const detail = document.getElementById('pp_offset_detail_' + rowId);
                                if (detail) detail.style.display = '';
                                if (pp.params) {
                                    // 4방향 (신규)
                                    if (pp.params.offset_top !== undefined) {
                                        var ti = container.querySelector('.pp-offset-top');
                                        var bi = container.querySelector('.pp-offset-bottom');
                                        var li = container.querySelector('.pp-offset-left');
                                        var ri = container.querySelector('.pp-offset-right');
                                        if (ti) ti.value = pp.params.offset_top || 0;
                                        if (bi) bi.value = pp.params.offset_bottom || 0;
                                        if (li) li.value = pp.params.offset_left || 0;
                                        if (ri) ri.value = pp.params.offset_right || 0;
                                    }
                                    // 하위호환: 기존 offset_distance → 4방향 동일값
                                    else if (pp.params.offset_distance) {
                                        var d = pp.params.offset_distance;
                                        var inputs = ['pp-offset-top', 'pp-offset-bottom', 'pp-offset-left', 'pp-offset-right'];
                                        inputs.forEach(function(cls) {
                                            var inp = container.querySelector('.' + cls);
                                            if (inp) inp.value = d;
                                        });
                                    }
                                    // method/cut_line 복원
                                    if (pp.params.method) {
                                        var mSel = container.querySelector('.pp-offset-method');
                                        if (mSel) mSel.value = pp.params.method;
                                    }
                                    if (pp.params.cut_line !== undefined) {
                                        var clCb = container.querySelector('.pp-offset-cutline');
                                        if (clCb) clCb.checked = !!pp.params.cut_line;
                                    }
                                }
                            }
                        } else {
                            // Restore finish PP — direction-based
                            if (pp.params && pp.params.directions) {
                                // New format: directions object
                                Object.keys(pp.params.directions).forEach(function(dir) {
                                    var sel = container.querySelector('.pp-finish-dir[data-direction="' + dir + '"]');
                                    if (sel) {
                                        for (var i = 0; i < sel.options.length; i++) {
                                            if (sel.options[i].dataset.ppCode === code || sel.options[i].value === String(pp.id)) {
                                                sel.selectedIndex = i;
                                                sel.dispatchEvent(new Event('change'));
                                                break;
                                            }
                                        }
                                        var marginInput = sel.closest('.pp-finish-dir-row').querySelector('.pp-finish-dir-margin');
                                        if (marginInput) marginInput.value = pp.params.directions[dir];
                                    }
                                });
                            } else {
                                // Legacy format: margin_top/bottom/left/right fields
                                var dirMargins = {
                                    top: parseFloat((pp.params && pp.params.margin_top != null) ? pp.params.margin_top : (pp.margin_top || 0)) || 0,
                                    bottom: parseFloat((pp.params && pp.params.margin_bottom != null) ? pp.params.margin_bottom : (pp.margin_bottom || 0)) || 0,
                                    left: parseFloat((pp.params && pp.params.margin_left != null) ? pp.params.margin_left : (pp.margin_left || 0)) || 0,
                                    right: parseFloat((pp.params && pp.params.margin_right != null) ? pp.params.margin_right : (pp.margin_right || 0)) || 0
                                };
                                Object.keys(dirMargins).forEach(function(dir) {
                                    if (dirMargins[dir] > 0) {
                                        var sel = container.querySelector('.pp-finish-dir[data-direction="' + dir + '"]');
                                        if (sel) {
                                            for (var i = 0; i < sel.options.length; i++) {
                                                if (sel.options[i].dataset.ppCode === code || sel.options[i].value === String(pp.id)) {
                                                    sel.selectedIndex = i;
                                                    sel.dispatchEvent(new Event('change'));
                                                    break;
                                                }
                                            }
                                            var marginInput = sel.closest('.pp-finish-dir-row').querySelector('.pp-finish-dir-margin');
                                            if (marginInput) marginInput.value = dirMargins[dir];
                                        }
                                    }
                                });
                            }
                        }
                    });

                    // Update annotation state after all restorations
                    updateAnnotationState(rowId);
                    calculatePPCost(rowId);
                    calculateTotal();
                } catch(e) { console.error('PP restore error:', e); }
            }

            async function loadOrderForEdit(orderId) {
                try {
                    const res = await axios.get('/api/orders/' + orderId);
                    if (!res.data.success) { showToast('주문 정보를 불러오지 못했습니다.', 'error'); return; }

                    const order = res.data.data;
                    editMode = orderId;

                    // 1. 제목 변경
                    const h1 = document.querySelector('h1');
                    h1.textContent = '주문 수정 (' + order.order_number + ')';

                    // 2. 상태 배지 표시
                    h1.insertAdjacentHTML('afterend',
                        '<span class="ml-3 px-3 py-1 rounded-full text-sm font-medium ' + getStatusColor(order.status) + '">' + getStatusText(order.status) + '</span>'
                    );

                    // 3. 기본 정보 채우기
                    if (order.client_id) {
                        document.getElementById('clientId').value = order.client_id;
                        document.getElementById('clientSearch').value = order.client_name || '';
                    }
                    if (order.delivery_date) document.getElementById('deliveryDate').value = order.delivery_date;
                    const prioEl = document.getElementById('priority');
                    if (prioEl && order.priority) prioEl.value = order.priority;
                    const recEl = document.getElementById('receptionLocation');
                    if (recEl) recEl.value = order.reception_location || '';
                    const delEl = document.getElementById('deliveryInfo');
                    if (delEl) delEl.value = order.delivery_info || '';
                    const dmEl = document.getElementById('deliveryMethod');
                    if (dmEl && order.delivery_method) {
                        var dmOptions = Array.from(dmEl.options).map(function(o) { return o.value; });
                        if (dmOptions.indexOf(order.delivery_method) >= 0) {
                            dmEl.value = order.delivery_method;
                        } else {
                            dmEl.value = '';
                        }
                    }
                    if (order.delivery_time) {
                        var dtParts = order.delivery_time.split(':');
                        var dtHourEl = document.getElementById('deliveryTimeHour');
                        if (dtHourEl) dtHourEl.value = dtParts[0] || '';
                        updateMinuteOptions();
                        var dtMinEl = document.getElementById('deliveryTimeMinute');
                        if (dtMinEl) dtMinEl.value = dtParts[1] || '00';
                    }
                    onDeliveryMethodChange();
                    var spEl = document.getElementById('shippingPayment');
                    if (spEl) spEl.value = order.shipping_payment || '';
                    document.getElementById('notes').value = order.notes || '';
                    const contactPhoneEl = document.getElementById('contactPhone');
                    if (contactPhoneEl) contactPhoneEl.value = order.contact_phone || '';
                    const contactMobileEl = document.getElementById('contactMobile');
                    if (contactMobileEl) contactMobileEl.value = order.contact_mobile || '';

                    // 4. 할인 금액 복원
                    const discountEl = document.getElementById('discountAmount');
                    if (discountEl && order.discount_amount) discountEl.value = fmtMoneyInput(order.discount_amount);

                    // 5. AI 파일 패널
                    if (order.ai_file_path) {
                        const aiPanel = document.querySelector('.mb-6.bg-blue-50');
                        if (aiPanel) {
                            const localPathEl = document.getElementById('aiLocalPath');
                            const fileInputLabel = document.getElementById('aiFileInput')?.closest('label');
                            const analyzeBtn = document.getElementById('aiAnalysisBtn');
                            if (localPathEl) localPathEl.value = order.ai_file_path;
                            if (fileInputLabel) {
                                fileInputLabel.style.pointerEvents = 'none';
                                fileInputLabel.style.opacity = '0.5';
                                const lbl = document.getElementById('aiFileLabel');
                                if (lbl) lbl.textContent = '(기존 파일 유지됨)';
                            }
                            if (analyzeBtn) analyzeBtn.disabled = false;
                            resolvedFilePath = order.ai_file_path;
                            const statusDiv = document.getElementById('aiAnalysisStatus');
                            if (statusDiv) {
                                statusDiv.classList.remove('hidden');
                                statusDiv.innerHTML = '<i class="fas fa-info-circle text-blue-500 mr-1"></i>기존 AI 파일: ' + escapeHtml(order.ai_file_path);
                            }
                        }
                    }

                    // 6. 품목 복원
                    const items = order.items || [];
                    document.getElementById('itemsContainer').innerHTML = '';
                    itemCount = 0;

                    const idMap = {};

                    // Pass 1: 부모/일반 행 먼저
                    const parentItems = items.filter(i => !i.parent_item_id);
                    const childItems = items.filter(i => i.parent_item_id);

                    for (const item of parentItems) {
                        const hasChildren = childItems.some(c => c.parent_item_id === item.id);
                        let id;

                        if (hasChildren) {
                            const childCount = childItems.filter(c => c.parent_item_id === item.id).length;
                            id = addParentItemRow(childCount);
                        } else {
                            addItemRow();
                            id = itemCount;
                        }
                        idMap[item.id] = id;

                        const set = (name, val) => {
                            const el = document.querySelector('[name="' + name + '_' + id + '"]');
                            if (el && val != null) el.value = val;
                        };

                        set('item_search', item.item_name || '');
                        set('item_id', item.item_id || '');
                        set('category_name', item.category_name || '');
                        set('width', item.width || '');
                        set('height', item.height || '');
                        set('scale_factor', item.scale_factor || 1);
                        set('quantity', item.quantity || 1);
                        set('item_unit', item.unit || 'EA');
                        set('unit_price', fmtMoneyInput(item.unit_price || 0));
                        set('content', item.content || '');
                        set('ai_group_index', item.ai_group_index != null ? item.ai_group_index : '');
                        set('ai_analysis_id', item.ai_analysis_id || '');

                        var pmRestoreVal = item.pricing_method || 'FIXED';
                        set('pricing_method', pmRestoreVal);
                        if (pmRestoreVal === 'AREA') {
                            var wRestoreEl = document.querySelector('[name="width_' + id + '"]');
                            var hRestoreEl = document.querySelector('[name="height_' + id + '"]');
                            var priceLblRestore = document.getElementById('unit_price_label_' + id);
                            if (wRestoreEl) { wRestoreEl.classList.add('border-purple-500'); wRestoreEl.classList.remove('border-gray-300'); }
                            if (hRestoreEl) { hRestoreEl.classList.add('border-purple-500'); hRestoreEl.classList.remove('border-gray-300'); }
                            if (priceLblRestore) priceLblRestore.textContent = '단가 (원/㎡)';
                        }

                        if (item.ai_group_index != null && item.ai_group_index !== '') {
                            var scaleDivEdit = document.getElementById('scale_div_' + id);
                            if (scaleDivEdit) scaleDivEdit.classList.remove('hidden');
                        }

                        const vatEl = document.querySelector('[name="vat_' + id + '"]');
                        if (vatEl) vatEl.checked = (item.vat_included == 1);

                        // 단가 미정 복원
                        if (item.price_status === 'PENDING') {
                            const pendingEl = document.querySelector('[name="price_pending_' + id + '"]');
                            if (pendingEl) { pendingEl.checked = true; onPricePendingChange(id); }
                        }

                        calcItem(id);

                        // 썸네일 복원: ai_groups_json에서 해당 그룹의 thumbnail_base64 추출
                        if (item.ai_groups_json && item.ai_group_index != null) {
                            try {
                                var groups = JSON.parse(item.ai_groups_json);
                                var grp = groups.find(function(g) { return g.index == item.ai_group_index; }) || groups[item.ai_group_index];
                                if (grp && grp.thumbnail_base64) {
                                    var thumbDiv = document.getElementById('thumb_' + id);
                                    var thumbImg = document.getElementById('thumb_img_' + id);
                                    if (thumbDiv && thumbImg) {
                                        thumbImg.src = 'data:image/png;base64,' + grp.thumbnail_base64;
                                        thumbDiv.classList.remove('hidden');
                                    }
                                }
                            } catch(e) { /* groups_json 파싱 실패 무시 */ }
                        }

                        if (item.post_processing && item.item_id) {
                            setTimeout(() => restorePostProcessing(id, item.post_processing), 600);
                        }
                    }

                    // Pass 2: 자식 행 (묶음)
                    for (const child of childItems) {
                        const parentRowId = idMap[child.parent_item_id];
                        if (parentRowId == null) continue;

                        const group = {
                            index: child.ai_group_index != null ? child.ai_group_index : 0,
                            width_mm: child.width ? child.width * 10 : 0,
                            height_mm: child.height ? child.height * 10 : 0,
                            thumbnail_base64: null
                        };
                        const childId = addChildItemRow(parentRowId, group);

                        const cSet = (name, val) => {
                            const el = document.querySelector('[name="' + name + '_' + childId + '"]');
                            if (el && val != null) el.value = val;
                        };
                        cSet('child_content', child.content || '');
                        cSet('child_qty', child.quantity || 1);
                        cSet('child_ai_group_index', child.ai_group_index != null ? child.ai_group_index : '');
                        cSet('child_ai_analysis_id', child.ai_analysis_id || '');
                    }
                    if (childItems.length > 0) {
                        const parentIdsWithChildren = new Set(
                            childItems.map(c => idMap[c.parent_item_id]).filter(Boolean)
                        );
                        parentIdsWithChildren.forEach(pid => updateParentChildCount(pid));
                    }

                    // 7. 합계 재계산
                    calculateTotal();

                    // 8. 버튼 변경
                    const submitBtn = document.getElementById('submitBtn');
                    if (submitBtn) {
                        submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>수정 저장';
                    }
                    // 수정 모드에서는 "견적서로 저장" 버튼 숨김
                    const qBtn = document.getElementById('quotationBtn');
                    if (qBtn) qBtn.style.display = 'none';

                    // 9. 상태별 경고
                    const formEl = document.querySelector('form');
                    if (formEl) {
                        if (['PRINTING'].includes(order.status)) {
                            const warn = document.createElement('div');
                            warn.className = 'bg-amber-50 border border-amber-300 text-amber-700 px-4 py-3 rounded mb-4';
                            warn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>이 주문은 이미 제작이 진행 중입니다. 품목을 수정하면 PDF가 재생성됩니다.';
                            formEl.prepend(warn);
                        }
                        if (['PRINT_DONE'].includes(order.status)) {
                            const warn = document.createElement('div');
                            warn.className = 'bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded mb-4';
                            warn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>이 주문은 인쇄가 완료되었습니다. 수정 시 카드가 재생성되고 인쇄 이력이 초기화됩니다.';
                            formEl.prepend(warn);
                        }
                        if (['SHIPPED'].includes(order.status)) {
                            const warn = document.createElement('div');
                            warn.className = 'bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded mb-4';
                            warn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>이 주문은 출고완료 상태입니다. 금액과 비고만 수정하는 것을 권장합니다.';
                            formEl.prepend(warn);
                        }
                    }

                } catch(err) {
                    console.error('Edit load error:', err);
                    showToast('주문 정보를 불러오는 중 오류: ' + (err.response?.data?.error || err.message), 'error');
                }
            }

            async function loadOrderForCopy() {
                const raw = sessionStorage.getItem('copyOrderData');
                sessionStorage.removeItem('copyOrderData');
                if (!raw) { showToast('복사할 주문 정보가 없습니다.', 'warning'); return; }

                let order;
                try { order = JSON.parse(raw); } catch(e) { showToast('주문 데이터 파싱 오류', 'error'); return; }

                // editMode는 null 유지 (새 주문으로 POST)

                // 제목 + 복사 배지
                const h1 = document.querySelector('h1');
                if (h1) {
                    h1.insertAdjacentHTML('afterend',
                        '<span class="ml-3 px-3 py-1 rounded-full text-sm font-medium bg-green-50 text-green-700">복사본 (새 주문)</span>'
                    );
                }

                if (order.client_id) {
                    document.getElementById('clientId').value = order.client_id;
                    document.getElementById('clientSearch').value = order.client_name || '';
                }
                // 납기일: 원본 기간 유지 (delivery_date - order_date 일수를 오늘 기준으로 재계산)
                if (order.delivery_date && order.order_date) {
                    var origOrder = new Date(order.order_date);
                    var origDeliv = new Date(order.delivery_date);
                    var daysDiff = Math.round((origDeliv - origOrder) / (1000 * 60 * 60 * 24));
                    if (daysDiff > 0) {
                        var newDeliv = new Date();
                        newDeliv.setDate(newDeliv.getDate() + daysDiff);
                        document.getElementById('deliveryDate').value = newDeliv.toISOString().split('T')[0];
                    } else {
                        document.getElementById('deliveryDate').value = order.delivery_date;
                    }
                } else if (order.delivery_date) {
                    document.getElementById('deliveryDate').value = order.delivery_date;
                }
                const prioEl = document.getElementById('priority');
                if (prioEl && order.priority) prioEl.value = order.priority;
                const recEl = document.getElementById('receptionLocation');
                if (recEl) recEl.value = order.reception_location || '';
                const delEl = document.getElementById('deliveryInfo');
                if (delEl) delEl.value = order.delivery_info || '';
                const dmEl = document.getElementById('deliveryMethod');
                if (dmEl && order.delivery_method) {
                    var dmOptionsCopy = Array.from(dmEl.options).map(function(o) { return o.value; });
                    if (dmOptionsCopy.indexOf(order.delivery_method) >= 0) {
                        dmEl.value = order.delivery_method;
                    } else {
                        dmEl.value = '';
                    }
                }
                if (order.delivery_time) {
                    var dtPartsCopy = order.delivery_time.split(':');
                    var dtHourCopy = document.getElementById('deliveryTimeHour');
                    if (dtHourCopy) dtHourCopy.value = dtPartsCopy[0] || '';
                    updateMinuteOptions();
                    var dtMinCopy = document.getElementById('deliveryTimeMinute');
                    if (dtMinCopy) dtMinCopy.value = dtPartsCopy[1] || '00';
                }
                onDeliveryMethodChange();
                var spElCopy = document.getElementById('shippingPayment');
                if (spElCopy) spElCopy.value = order.shipping_payment || '';
                document.getElementById('notes').value = order.order_number + '-재주문건';
                const discountEl = document.getElementById('discountAmount');
                if (discountEl) discountEl.value = fmtMoneyInput(order.discount_amount || 0);

                // AI 파일 경로 복원 (재주문: 같은 디자인 파일 재사용)
                if (order.ai_file_path) {
                    const aiPanel = document.querySelector('.mb-6.bg-blue-50');
                    if (aiPanel) {
                        const localPathEl = document.getElementById('aiLocalPath');
                        if (localPathEl) localPathEl.value = order.ai_file_path;
                        const analyzeBtn = document.getElementById('aiAnalysisBtn');
                        if (analyzeBtn) analyzeBtn.disabled = false;
                        resolvedFilePath = order.ai_file_path;
                        const statusDiv = document.getElementById('aiAnalysisStatus');
                        if (statusDiv) {
                            statusDiv.classList.remove('hidden');
                            statusDiv.innerHTML = '<i class="fas fa-copy text-green-500 mr-1"></i>원본 AI 파일 재사용: ' + escapeHtml(order.ai_file_path);
                        }
                    }
                }

                // 품목 복원
                const items = order.items || [];
                document.getElementById('itemsContainer').innerHTML = '';
                itemCount = 0;

                const idMap = {};
                const parentItems = items.filter(i => !i.parent_item_id);
                const childItems = items.filter(i => i.parent_item_id);

                for (const item of parentItems) {
                    const hasChildren = childItems.some(c => c.parent_item_id === item.id);
                    let id;
                    if (hasChildren) {
                        const childCount = childItems.filter(c => c.parent_item_id === item.id).length;
                        id = addParentItemRow(childCount);
                    } else {
                        addItemRow();
                        id = itemCount;
                    }
                    idMap[item.id] = id;

                    const set = (name, val) => {
                        const el = document.querySelector('[name="' + name + '_' + id + '"]');
                        if (el && val != null) el.value = val;
                    };

                    set('item_search', item.item_name || '');
                    set('item_id', item.item_id || '');
                    set('category_name', item.category_name || '');
                    set('width', item.width || '');
                    set('height', item.height || '');
                    set('scale_factor', item.scale_factor || 1);
                    set('quantity', item.quantity || 1);
                    set('item_unit', item.unit || 'EA');
                    set('unit_price', fmtMoneyInput(item.unit_price || 0));
                    set('content', item.content || '');
                    // 재주문: ai_group_index, ai_analysis_id 복사 (같은 디자인 파일 재사용)
                    set('ai_group_index', item.ai_group_index != null ? item.ai_group_index : '');
                    set('ai_analysis_id', item.ai_analysis_id || '');

                    const vatEl = document.querySelector('[name="vat_' + id + '"]');
                    if (vatEl) vatEl.checked = (item.vat_included == 1);

                    if (item.price_status === 'PENDING') {
                        const pendingEl = document.querySelector('[name="price_pending_' + id + '"]');
                        if (pendingEl) { pendingEl.checked = true; onPricePendingChange(id); }
                    }

                    calcItem(id);

                    // 썸네일 복원
                    if (item.ai_groups_json && item.ai_group_index != null) {
                        try {
                            var copyGroups = JSON.parse(item.ai_groups_json);
                            var copyGrp = copyGroups.find(function(g) { return g.index == item.ai_group_index; }) || copyGroups[item.ai_group_index];
                            if (copyGrp && copyGrp.thumbnail_base64) {
                                var cThumbDiv = document.getElementById('thumb_' + id);
                                var cThumbImg = document.getElementById('thumb_img_' + id);
                                if (cThumbDiv && cThumbImg) {
                                    cThumbImg.src = 'data:image/png;base64,' + copyGrp.thumbnail_base64;
                                    cThumbDiv.classList.remove('hidden');
                                }
                            }
                        } catch(e) {}
                    }

                    if (item.post_processing && item.item_id) {
                        setTimeout(() => restorePostProcessing(id, item.post_processing), 600);
                    }
                }

                // Pass 2: 자식 행
                for (const child of childItems) {
                    const parentRowId = idMap[child.parent_item_id];
                    if (parentRowId == null) continue;
                    // 자식 행 썸네일도 복원
                    var childThumb = null;
                    if (child.ai_groups_json && child.ai_group_index != null) {
                        try {
                            var cgs = JSON.parse(child.ai_groups_json);
                            var cg = cgs.find(function(g) { return g.index == child.ai_group_index; }) || cgs[child.ai_group_index];
                            if (cg) childThumb = cg.thumbnail_base64;
                        } catch(e) {}
                    }
                    const group = {
                        index: child.ai_group_index != null ? child.ai_group_index : 0,
                        width_mm: child.width ? child.width * 10 : 0,
                        height_mm: child.height ? child.height * 10 : 0,
                        thumbnail_base64: childThumb || null
                    };
                    const childId = addChildItemRow(parentRowId, group);

                    const cSet = (name, val) => {
                        const el = document.querySelector('[name="' + name + '_' + childId + '"]');
                        if (el && val != null) el.value = val;
                    };
                    cSet('child_content', child.content || '');
                    cSet('child_qty', child.quantity || 1);
                    // 재주문: ai 필드 복사
                    cSet('child_ai_group_index', child.ai_group_index != null ? child.ai_group_index : '');
                    cSet('child_ai_analysis_id', child.ai_analysis_id || '');
                }
                if (childItems.length > 0) {
                    Object.values(idMap).forEach(pid => updateParentChildCount(pid));
                }

                calculateTotal();
            }

            // ============================================
            // 금액 수동 수정 핸들러
            // ============================================
            window.onAmountManualEdit = function(id) {
                var el = document.querySelector('[name="amount_' + id + '"]');
                if (!el) return;
                var autoAmt = parseInt(el.dataset.autoAmount) || 0;
                var manual = parseMoney(el.value);
                if (autoAmt > 0 && manual !== autoAmt) {
                    el.classList.add('border-amber-400');
                    el.title = '자동 계산: ' + autoAmt.toLocaleString() + '원 (수동 수정됨)';
                } else {
                    el.classList.remove('border-amber-400');
                    el.title = '';
                }
                calculateTotal();
            };

            // ============================================
            // 출력방식 필터 (주문서 품목 선택 보조)
            // ============================================
            window.togglePrintMethodFilter = function() {
                var panel = document.getElementById('printMethodFilter');
                if (!panel) return;
                if (panel.classList.contains('hidden')) {
                    // 출력방식 목록 로드
                    axios.get('/api/print-system/methods').then(function(res) {
                        var methods = res.data.data || [];
                        var html = '<div class="flex gap-1 mb-2">';
                        methods.forEach(function(m) {
                            html += '<button type="button" onclick="selectPrintMethodFilter(' + m.id + ',\'' + m.name + '\')" '
                                + 'class="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-blue-50 hover:border-blue-400">'
                                + m.name + '</button>';
                        });
                        html += '</div><div id="printMediaFilterList"></div>';
                        panel.innerHTML = html;
                        panel.classList.remove('hidden');
                    });
                } else {
                    panel.classList.add('hidden');
                }
            };

            window.selectPrintMethodFilter = function(methodId, methodName) {
                // 해당 출력방식의 소재 목록 로드
                axios.get('/api/print-system/items-for-order?method_id=' + methodId).then(function(res) {
                    var items = res.data.data || [];
                    var listEl = document.getElementById('printMediaFilterList');
                    if (!listEl) return;
                    if (!items.length) {
                        listEl.innerHTML = '<p class="text-xs text-gray-400 py-2">등록된 소재가 없습니다.</p>';
                        return;
                    }
                    var html = '<div class="text-xs text-gray-500 mb-1">' + escapeHtml(methodName) + ' 소재:</div><div class="flex flex-wrap gap-1">';
                    items.forEach(function(it) {
                        html += '<button type="button" data-item-id="' + it.id + '" data-item-name="' + escapeHtml(it.item_name || '') + '" data-base-price="' + (it.base_price || 0) + '" data-pricing-method="' + (it.pricing_method || 'AREA') + '" '
                            + 'class="pm-filter-media-btn px-2 py-1 text-xs rounded bg-gray-100 hover:bg-blue-100 border border-gray-200">'
                            + escapeHtml(it.item_name || '') + '</button>';
                    });
                    html += '</div>';
                    listEl.innerHTML = html;
                    // data 속성 기반 이벤트 바인딩 (XSS 방지)
                    listEl.querySelectorAll('.pm-filter-media-btn').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            selectPrintMediaFilter(
                                parseInt(btn.dataset.itemId),
                                btn.dataset.itemName,
                                parseFloat(btn.dataset.basePrice) || 0,
                                btn.dataset.pricingMethod
                            );
                        });
                    });
                });
            };

            window.selectPrintMediaFilter = function(itemId, itemName, basePrice, pricingMethod) {
                // 현재 포커스된 품목 행 또는 첫 빈 행 찾기
                var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                var targetId = null;
                rows.forEach(function(row) {
                    var id = row.id.replace('item-', '');
                    var hidId = document.querySelector('[name="item_id_' + id + '"]');
                    if (!targetId && (!hidId || !hidId.value)) targetId = id;
                });
                if (!targetId && rows.length > 0) {
                    // 모든 행에 품목이 있으면 새 행 추가
                    addItemRow();
                    var newRows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                    targetId = newRows[newRows.length - 1].id.replace('item-', '');
                }
                if (!targetId) return;

                // 품목 정보 채우기
                var hidId = document.querySelector('[name="item_id_' + targetId + '"]');
                var searchInp = document.querySelector('[name="item_search_' + targetId + '"]');
                var priceInp = document.querySelector('[name="unit_price_' + targetId + '"]');
                var pmInp = document.querySelector('[name="pricing_method_' + targetId + '"]');

                if (hidId) hidId.value = itemId;
                if (searchInp) searchInp.value = itemName;
                if (priceInp) priceInp.value = fmtMoneyInput(basePrice);
                if (pmInp) pmInp.value = pricingMethod;

                // 단가 자동 조회
                var clientId = (document.getElementById('clientId') || {}).value;
                if (clientId) {
                    axios.get('/api/price-list/calculate?item_id=' + itemId + '&client_id=' + clientId)
                        .then(function(r) {
                            if (r.data && r.data.data && r.data.data.price > 0) {
                                priceInp.value = fmtMoneyInput(r.data.data.price);
                            }
                            calcItem(targetId);
                        }).catch(function() { calcItem(targetId); });
                } else {
                    calcItem(targetId);
                }

                // 필터 닫기
                var panel = document.getElementById('printMethodFilter');
                if (panel) panel.classList.add('hidden');
            };

            // ============================================
            // 판재 배치 계산 (SHEET 소재)
            // ============================================
            window.updateSheetCalc = function(rowId) {
                var infoEl = document.getElementById('sheet_calc_' + rowId);
                if (!infoEl) return;
                var itemId = (document.querySelector('[name="item_id_' + rowId + '"]') || {}).value;
                if (!itemId) { infoEl.classList.add('hidden'); return; }

                // 품목의 소재 정보 조회 (media_type, sheet dimensions)
                axios.get('/api/items/' + itemId).then(function(res) {
                    var item = res.data.data;
                    if (!item || !item.print_media_id) { infoEl.classList.add('hidden'); return; }

                    // print_media 정보는 items-for-order에서 가져와야 하지만,
                    // 여기서는 간단하게 숨김 처리 (추후 확장)
                    infoEl.classList.add('hidden');
                }).catch(function() { infoEl.classList.add('hidden'); });
            };

            // ============================================
            // 단가 수동 변경 시 거래처 특약 저장 제안
            // ============================================
            window.onUnitPriceManualChange = function(id) {
                var priceInp = document.querySelector('[name="unit_price_' + id + '"]');
                var itemIdEl = document.querySelector('[name="item_id_' + id + '"]');
                var clientIdEl = document.getElementById('clientId');
                if (!priceInp || !itemIdEl || !clientIdEl) return;

                var itemId = itemIdEl.value;
                var clientId = clientIdEl.value;
                var newPrice = parseMoney(priceInp.value);
                if (!itemId || !clientId || !newPrice) return;

                // 기본 단가와 비교
                var basePrice = parseFloat(priceInp.dataset.basePrice || '0');
                if (basePrice && newPrice !== basePrice) {
                    // 저장 제안 팝업 (기존 showConfirm 활용)
                    var msg = '단가가 변경되었습니다 (' + basePrice.toLocaleString() + '원 → ' + newPrice.toLocaleString() + '원).\n이 거래처의 기본 단가로 저장할까요?';
                    showConfirm(msg, function() {
                        axios.post('/api/prices', {
                            item_id: parseInt(itemId),
                            client_id: parseInt(clientId),
                            price: newPrice,
                            context: 'sales'
                        }).then(function() {
                            showToast('거래처 단가가 저장되었습니다.', 'success');
                        }).catch(function() {
                            showToast('단가 저장 실패', 'error');
                        });
                    });
                }
            };

            loadData().then(async () => {
                const params = new URLSearchParams(window.location.search);
                const editId = params.get('edit');
                const isCopy = params.get('copy');
                const quotationId = params.get('quotation_id');
                if (editId) {
                    await loadOrderForEdit(editId);
                } else if (isCopy) {
                    await loadOrderForCopy();
                } else if (quotationId) {
                    // Phase 3.2: 견적서 → 주문 prefill (사용자가 검토/수정 후 제출)
                    await loadQuotationForPrefill(quotationId);
                }
            });

            // Phase 3.2: 견적서 데이터를 주문서에 prefill
            async function loadQuotationForPrefill(quotationId) {
                try {
                    const res = await axios.get('/api/quotations/' + quotationId);
                    if (!res.data.success) {
                        showToast('견적서 로드 실패: ' + (res.data.error || ''), 'error');
                        return;
                    }
                    const q = res.data.data;

                    // 만료/취소 경고
                    if (q.status === 'CANCELLED') {
                        showToast('취소된 견적서입니다. 새 주문에 사용할 수 없습니다.', 'warning');
                        return;
                    }
                    if (q.status === 'EXPIRED') {
                        showToast('주의: 만료된 견적서입니다 (유효기한 ' + (q.valid_until || '-') + ')', 'warning');
                    }

                    // 거래처
                    if (q.client_id) {
                        document.getElementById('clientId').value = q.client_id;
                        document.getElementById('clientSearch').value = q.client_name || '';
                    }
                    // 배송/연락
                    if (q.delivery_date) document.getElementById('deliveryDate').value = q.delivery_date;
                    if (q.delivery_method) {
                        const dm = document.querySelector('[name="delivery_method"]');
                        if (dm) dm.value = q.delivery_method;
                    }
                    if (q.contact_phone) {
                        const cp = document.getElementById('contactPhone');
                        if (cp) cp.value = q.contact_phone;
                    }
                    if (q.contact_mobile) {
                        const cm = document.getElementById('contactMobile');
                        if (cm) cm.value = q.contact_mobile;
                    }
                    if (q.notes) {
                        const nt = document.getElementById('notes');
                        if (nt) nt.value = q.notes;
                    }

                    // 품목 행 채우기 — 기존 빈 행 제거 후 견적서 items로 add
                    document.getElementById('itemsContainer').innerHTML = '';
                    var nonParentItems = (q.items || []).filter(function(it) { return !it.parent_id; });
                    for (var i = 0; i < nonParentItems.length; i++) {
                        window.addItemRow();
                    }
                    // 채우기 (간단: 첫 N개 행)
                    setTimeout(function() {
                        nonParentItems.forEach(function(it, idx) {
                            var id = idx + 1;
                            var setVal = function(sel, v) {
                                var el = document.querySelector(sel);
                                if (el && v != null) {
                                    el.value = v;
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            };
                            setVal('[name="item_search_' + id + '"]', it.item_name);
                            setVal('[name="item_id_' + id + '"]', it.item_id);
                            setVal('[name="width_' + id + '"]', it.width);
                            setVal('[name="height_' + id + '"]', it.height);
                            setVal('[name="quantity_' + id + '"]', it.quantity);
                            setVal('[name="unit_price_' + id + '"]', it.unit_price);
                            setVal('[name="content_' + id + '"]', it.content);
                            if (typeof window.calcItem === 'function') window.calcItem(id);
                        });
                    }, 200);

                    // 견적서 ID를 hidden 필드에 (제출 시 함께 보내기)
                    var hid = document.getElementById('sourceQuotationId');
                    if (!hid) {
                        hid = document.createElement('input');
                        hid.type = 'hidden';
                        hid.id = 'sourceQuotationId';
                        hid.name = 'source_quotation_id';
                        document.querySelector('form').appendChild(hid);
                    }
                    hid.value = quotationId;

                    // 연결 표시 배너
                    var banner = document.createElement('div');
                    banner.className = 'mb-4 px-4 py-3 rounded bg-blue-50 border border-blue-200 text-sm text-blue-800';
                    banner.innerHTML = '<i class="fas fa-link mr-1"></i> 견적서 <a href="/quotation/' + quotationId + '" target="_blank" class="font-bold underline">' + (q.quotation_number || '#' + quotationId) + '</a>에서 가져온 주문서입니다. 내용을 검토하고 저장하세요.';
                    var form = document.querySelector('form');
                    if (form) form.insertBefore(banner, form.firstChild);

                    showToast('견적서 ' + (q.quotation_number || '') + ' 데이터를 불러왔습니다.', 'success');
                } catch(e) {
                    console.error('quotation prefill error:', e);
                    showToast('견적서 prefill 실패: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
                }
            }
