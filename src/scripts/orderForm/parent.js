// orderForm/parent.js — AI 파일·결과 처리 + 부모/자식 행 + 후가공 복원 + 후행 ops (Phase 3.1.C 분할)

            // 다중 파일 큐 + 전체 아트보드 누적
            var pendingAIFiles = [];
            var _allAnalyzedGroups = [];

            window.onAIFileSelected = function(input) {
                var files = Array.from(input.files || []);
                if (!files.length) return;
                localAIPath = null;
                document.getElementById('aiLocalPath').value = '';
                pendingAIFiles = files.filter(function(f) {
                    var n = f.name.toLowerCase();
                    return n.endsWith('.ai') || n.endsWith('.eps');
                });
                if (!pendingAIFiles.length) {
                    showToast('AI 또는 EPS 파일만 지원합니다.', 'warning');
                    return;
                }
                var label = pendingAIFiles.length === 1
                    ? pendingAIFiles[0].name + ' (' + (pendingAIFiles[0].size / 1024 / 1024).toFixed(1) + 'MB)'
                    : pendingAIFiles.length + '개 파일 선택됨';
                document.getElementById('aiFileLabel').textContent = label;
                document.getElementById('aiAnalysisBtn').disabled = false;
            };

            // 드래그 앤 드롭 핸들러 (다중 파일)
            window.handleAiFileDrop = function(e) {
                var files = Array.from(e.dataTransfer.files || []);
                if (!files.length) return;
                pendingAIFiles = files.filter(function(f) {
                    var n = f.name.toLowerCase();
                    return n.endsWith('.ai') || n.endsWith('.eps');
                });
                if (!pendingAIFiles.length) {
                    showToast('AI 또는 EPS 파일만 지원합니다.', 'warning');
                    return;
                }
                localAIPath = null;
                document.getElementById('aiLocalPath').value = '';
                var label = pendingAIFiles.length === 1
                    ? pendingAIFiles[0].name + ' (' + (pendingAIFiles[0].size / 1024 / 1024).toFixed(1) + 'MB)'
                    : pendingAIFiles.length + '개 파일 선택됨';
                document.getElementById('aiFileLabel').textContent = label;
                document.getElementById('aiAnalysisBtn').disabled = false;
                showToast(pendingAIFiles.length + '개 파일이 선택되었습니다.', 'success');
            };

            function onAILocalPathChanged(input) {
                localAIPath = input.value.trim() || null;
                if (localAIPath) {
                    pendingAIFiles = [];
                    document.getElementById('aiFileLabel').textContent = 'AI/EPS 파일을 여기에 드래그하거나 클릭하여 선택 (여러 파일 가능)';
                    document.getElementById('aiFileInput').value = '';
                }
                document.getElementById('aiAnalysisBtn').disabled = !(localAIPath || pendingAIFiles.length);
            }

            // 503 재시도 헬퍼
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

            // 단일 파일 업로드 + 분석 대기 (Promise 반환)
            function analyzeOneFile(file, fileIdx, totalFiles) {
                return new Promise(function(resolve, reject) {
                    var statusDiv = document.getElementById('aiAnalysisStatus');
                    var prefix = totalFiles > 1 ? '[' + (fileIdx + 1) + '/' + totalFiles + '] ' : '';

                    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> ' + prefix + file.name + ' 업로드 중...';

                    var formData = new FormData();
                    formData.append('file', file);
                    axios.post('/api/ai-analysis/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                        onUploadProgress: function(e) {
                            if (e.total) {
                                var pct = Math.round(e.loaded / e.total * 100);
                                statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> ' + prefix + file.name + ' 업로드 ' + pct + '%';
                            }
                        }
                    }).then(function(res) {
                        if (!res.data.success) { reject(new Error(res.data.error || '업로드 실패')); return; }
                        var thisAnalysisId = res.data.data.id;
                        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> ' + prefix + file.name + ' 분석 중...';

                        // 폴링
                        var elapsed = 0;
                        var poll = setInterval(async function() {
                            elapsed += 2000;
                            if (elapsed > 120000) { clearInterval(poll); reject(new Error(file.name + ' 분석 시간 초과')); return; }
                            try {
                                var r = await axios.get('/api/ai-analysis/' + thisAnalysisId);
                                var d = r.data.data;
                                if (d.status === 'done') {
                                    clearInterval(poll);
                                    resolve({ analysisId: thisAnalysisId, data: d, file: file });
                                } else if (d.status === 'error') {
                                    clearInterval(poll);
                                    reject(new Error(file.name + ': ' + (d.error_message || '분석 오류')));
                                }
                            } catch(e) { /* 폴링 에러 무시 */ }
                        }, 2000);
                    }).catch(reject);
                });
            }

            async function requestAIAnalysis() {
                if (!pendingAIFiles.length && !localAIPath) { showToast('파일을 선택하거나 경로를 입력해주세요.', 'warning'); return; }

                const statusDiv = document.getElementById('aiAnalysisStatus');
                statusDiv.classList.remove('hidden');
                document.getElementById('aiAnalysisBtn').disabled = true;
                resolvedFilePath = null;

                try {
                    if (localAIPath) {
                        // 경로 입력 모드 (단일)
                        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 분석 요청 중...';
                        const res = await postWithRetry('/api/ai-analysis', { file_path: localAIPath });
                        if (!res.data.success) throw new Error(res.data.error || '요청 생성 실패');
                        aiAnalysisId = res.data.data.id;
                        await axios.patch('/api/ai-analysis/' + aiAnalysisId, { status: 'pending' });
                        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> IllustratorAutomat에서 분석 중... (최대 120초 대기)';
                        startAnalysisPolling();
                        return;
                    }

                    // 다중 파일 순차 분석 → 그룹 누적 (자동 추출 안 함)
                    var files = pendingAIFiles.slice();
                    var totalFiles = files.length;
                    var doneCount = 0;
                    var errors = [];

                    for (var i = 0; i < files.length; i++) {
                        try {
                            var result = await analyzeOneFile(files[i], i, totalFiles);
                            var d = result.data;
                            resolvedFilePath = d.file_path || null;
                            aiAnalysisId = result.analysisId;
                            var groups = JSON.parse(d.groups_json || '[]');
                            var fileName = (resolvedFilePath || result.file.name || '').split(/[/\\]/).pop() || ('파일 ' + (i+1));

                            // 각 그룹에 출처 태그 추가
                            groups.forEach(function(g) {
                                g._analysis_id = result.analysisId;
                                g._file_name = fileName;
                            });
                            _allAnalyzedGroups = _allAnalyzedGroups.concat(groups);

                            // 파일 기록
                            if (!window._aiAnalyzedFiles) window._aiAnalyzedFiles = [];
                            window._aiAnalyzedFiles.push({
                                file_path: resolvedFilePath || result.file.name,
                                analysis_id: result.analysisId,
                                groups_count: groups.length
                            });
                            doneCount++;
                        } catch(fileErr) {
                            errors.push(fileErr.message);
                        }
                    }

                    // 최종 상태 표시
                    var fileListHtml = (window._aiAnalyzedFiles || []).map(function(f, fi) {
                        var fname = (f.file_path || '').split(/[/\\]/).pop() || ('파일 ' + (fi+1));
                        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">'
                            + '<i class="fas fa-file"></i>' + fname + ' (' + f.groups_count + '그룹)</span>';
                    }).join(' ');

                    var resultMsg = '<div class="flex flex-wrap items-center gap-2 mb-1">' + fileListHtml + '</div>';
                    if (errors.length) {
                        resultMsg += '<div class="text-xs text-red-500 mt-1"><i class="fas fa-exclamation-circle mr-1"></i>' + errors.join(', ') + '</div>';
                    }
                    resultMsg += '<button type="button" onclick="resetForNextAIFile()" class="mt-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">'
                        + '<i class="fas fa-plus mr-1"></i>추가 파일 분석</button>';
                    statusDiv.innerHTML = resultMsg;

                    // 아트보드 그리드 표시
                    if (doneCount > 0) {
                        renderArtboardGrid();
                        var aiResultTabs = document.getElementById('aiResultTabs');
                        if (aiResultTabs) aiResultTabs.classList.remove('hidden');
                    }

                    pendingAIFiles = [];
                    document.getElementById('aiAnalysisBtn').disabled = false;

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
                            resolvedFilePath = d.file_path || null;
                            const groups = JSON.parse(d.groups_json || '[]');
                            window._lastAnalysisGroups = groups;
                            var fileName = (resolvedFilePath || localAIPath || '').split(/[/\\]/).pop() || '파일';

                            // 각 그룹에 출처 태그
                            groups.forEach(function(g) {
                                g._analysis_id = aiAnalysisId;
                                g._file_name = fileName;
                            });
                            _allAnalyzedGroups = _allAnalyzedGroups.concat(groups);

                            // 파일 기록
                            if (!window._aiAnalyzedFiles) window._aiAnalyzedFiles = [];
                            window._aiAnalyzedFiles.push({
                                file_path: resolvedFilePath || localAIPath || '',
                                analysis_id: aiAnalysisId,
                                groups_count: groups.length
                            });
                            var fileListHtml = window._aiAnalyzedFiles.map(function(f, i) {
                                var fname = (f.file_path || '').split(/[/\\]/).pop() || ('파일 ' + (i+1));
                                return '<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">'
                                    + '<i class="fas fa-file"></i>' + fname + ' (' + f.groups_count + '그룹)</span>';
                            }).join(' ');

                            statusDiv.innerHTML = '<div class="flex flex-wrap items-center gap-2 mb-1">'
                                + fileListHtml + '</div>'
                                + '<button type="button" onclick="resetForNextAIFile()" class="mt-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">'
                                + '<i class="fas fa-plus mr-1"></i>추가 파일 분석</button>';

                            // 아트보드 그리드 표시
                            renderArtboardGrid();
                            var aiResultTabs = document.getElementById('aiResultTabs');
                            if (aiResultTabs) aiResultTabs.classList.remove('hidden');
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

            window.resetForNextAIFile = function() {
                pendingAIFiles = [];
                localAIPath = null;
                aiAnalysisId = null;
                resolvedFilePath = null;
                document.getElementById('aiFileLabel').textContent = 'AI/EPS 파일을 여기에 드래그하거나 클릭하여 선택 (여러 파일 가능)';
                document.getElementById('aiFileInput').value = '';
                document.getElementById('aiLocalPath').value = '';
                document.getElementById('aiAnalysisBtn').disabled = true;
                var aiResultTabs = document.getElementById('aiResultTabs');
                if (aiResultTabs) aiResultTabs.classList.add('hidden');
                showToast('추가 AI 파일을 선택하거나 경로를 입력하세요.', 'info');
            };

            // ── 아트보드 선택 그리드 ──────────────────────────────
            function renderArtboardGrid() {
                var container = document.getElementById('gridItems');
                var countEl = document.getElementById('gridTotalCount');
                if (!container) return;

                // 등록되지 않은 그룹만 표시
                var pending = _allAnalyzedGroups.filter(function(g) { return !g._registered; });
                if (countEl) countEl.textContent = pending.length;

                var html = '';
                pending.forEach(function(g, i) {
                    var uid = (g._analysis_id || 0) + '_' + g.index;
                    var wCm = g.width_mm ? (g.width_mm / 10).toFixed(1) : '?';
                    var hCm = g.height_mm ? (g.height_mm / 10).toFixed(1) : '?';
                    var thumbSrc = g.thumbnail_base64
                        ? (g.thumbnail_base64.indexOf('data:') === 0 ? g.thumbnail_base64 : 'data:image/png;base64,' + g.thumbnail_base64)
                        : '';
                    var thumbHtml = thumbSrc
                        ? '<img src="' + thumbSrc + '" class="w-12 h-12 object-contain rounded border bg-white flex-shrink-0">'
                        : '<div class="w-12 h-12 rounded border bg-gray-100 flex items-center justify-center text-gray-400 text-xs flex-shrink-0">' + (i+1) + '</div>';

                    html += '<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-50 border border-transparent cursor-pointer transition-colors" id="grid-item-' + uid + '" data-uid="' + uid + '" onclick="gridToggleItem(this)">'
                        + '<input type="checkbox" class="grid-check rounded border-gray-300 text-blue-600 pointer-events-none" data-uid="' + uid + '">'
                        + thumbHtml
                        + '<div class="flex-1 min-w-0">'
                        + '<span class="text-sm font-medium text-gray-800">' + (g.name || 'Group ' + (g.index + 1)) + '</span>'
                        + '<span class="text-xs text-gray-400 ml-2">' + wCm + ' × ' + hCm + ' cm</span>'
                        + '</div>'
                        + '<span class="text-xs text-gray-400 truncate max-w-[120px] flex-shrink-0">' + (g._file_name || '') + '</span>'
                        + '</div>';
                });
                container.innerHTML = html;
                gridUpdateCount();

                // 그리드 패널 표시, 시트배치 패널 숨김
                var gridPanel = document.getElementById('artboardGridPanel');
                var sheetPanel = document.getElementById('sheetLayoutPanel');
                if (gridPanel) gridPanel.classList.remove('hidden');
                if (sheetPanel) sheetPanel.classList.add('hidden');
            }

            window.gridToggleItem = function(row) {
                var cb = row.querySelector('.grid-check');
                if (cb) cb.checked = !cb.checked;
                row.classList.toggle('border-blue-400', cb.checked);
                row.classList.toggle('bg-blue-50', cb.checked);
                gridUpdateCount();
            };

            window.gridToggleAll = function(checked) {
                document.querySelectorAll('.grid-check').forEach(function(cb) {
                    cb.checked = checked;
                    var row = cb.closest('[data-uid]');
                    if (row) {
                        row.classList.toggle('border-blue-400', checked);
                        row.classList.toggle('bg-blue-50', checked);
                    }
                });
                gridUpdateCount();
            };

            function gridUpdateCount() {
                var checked = document.querySelectorAll('.grid-check:checked');
                var total = document.querySelectorAll('.grid-check');
                var infoEl = document.getElementById('gridSelectedInfo');
                var btnExtract = document.getElementById('gridBtnExtract');
                var btnSheet = document.getElementById('gridBtnSheet');
                if (infoEl) infoEl.textContent = checked.length + '/' + total.length + '개 선택';
                if (btnExtract) btnExtract.disabled = checked.length === 0;
                if (btnSheet) btnSheet.disabled = checked.length < 2;
                // 전체선택 체크박스 동기화
                var checkAll = document.getElementById('gridCheckAll');
                if (checkAll) checkAll.checked = total.length > 0 && checked.length === total.length;
            }

            function getSelectedGroups() {
                var uids = [];
                document.querySelectorAll('.grid-check:checked').forEach(function(cb) {
                    uids.push(cb.getAttribute('data-uid'));
                });
                return _allAnalyzedGroups.filter(function(g) {
                    var uid = (g._analysis_id || 0) + '_' + g.index;
                    return uids.indexOf(uid) >= 0 && !g._registered;
                });
            }

            function markGroupsRegistered(groups) {
                groups.forEach(function(g) { g._registered = true; });
                renderArtboardGrid();
                // 모두 등록되었으면 그리드 패널 숨기기
                var pending = _allAnalyzedGroups.filter(function(g) { return !g._registered; });
                if (pending.length === 0) {
                    var tabs = document.getElementById('aiResultTabs');
                    if (tabs) tabs.classList.add('hidden');
                }
            }

            window.gridExtractSelected = function() {
                var selected = getSelectedGroups();
                if (!selected.length) { showToast('항목을 선택하세요.', 'warning'); return; }
                extractGroupsToLines(selected);
            };

            window.gridExtractAll = function() {
                var pending = _allAnalyzedGroups.filter(function(g) { return !g._registered; });
                if (!pending.length) { showToast('등록할 항목이 없습니다.', 'warning'); return; }
                extractGroupsToLines(pending);
            };

            function extractGroupsToLines(groups) {
                removeEmptyItemRows();
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
                markGroupsRegistered(groups);
                showToast(groups.length + '개 품목 라인이 추가되었습니다.', 'success');
            }

            window.gridSheetSelected = function() {
                var selected = getSelectedGroups();
                if (selected.length < 2) { showToast('시트배치는 2개 이상 선택하세요.', 'warning'); return; }
                // sheetLayoutGroups에 선택된 그룹 설정
                sheetLayoutGroups = selected;
                sheetQuantities = {};
                selected.forEach(function(_, i) { sheetQuantities[i] = 1; });
                // 시트배치 패널 표시
                var gridPanel = document.getElementById('artboardGridPanel');
                var sheetPanel = document.getElementById('sheetLayoutPanel');
                if (gridPanel) gridPanel.classList.add('hidden');
                if (sheetPanel) sheetPanel.classList.remove('hidden');
                populateSheetElements(sheetLayoutGroups);
            };

            // 시트배치에서 그리드로 돌아가기
            window.backToArtboardGrid = function() {
                var gridPanel = document.getElementById('artboardGridPanel');
                var sheetPanel = document.getElementById('sheetLayoutPanel');
                if (gridPanel) gridPanel.classList.remove('hidden');
                if (sheetPanel) sheetPanel.classList.add('hidden');
            };

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

                    // 분석 요청 ID: 그룹별 개별 추적 (다중 파일 지원)
                    const aiIdEl = document.querySelector('[name="ai_analysis_id_' + id + '"]');
                    if (aiIdEl) aiIdEl.value = group._analysis_id || aiAnalysisId || '';

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
                    <input type="hidden" name="min_billing_side_${id}" value="">
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
                            <input type="text" name="item_search_${id}" placeholder="품목명 검색..." autocomplete="off"
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
                        <div class="flex items-center gap-2 flex-wrap" id="finishing_simple_${id}">
                            <span id="finishing_summary_${id}" class="text-xs font-medium text-gray-700"></span>
                            <button type="button" onclick="toggleFinishingDetail(${id})" class="text-[10px] text-gray-400 hover:text-blue-600 whitespace-nowrap">개별 설정 <i class="fas fa-caret-down"></i></button>
                            <label class="text-[10px] text-gray-500 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer" title="작업은 그대로 하고 청구만 하지 않습니다 — 카드·작업지시서에는 마감이 그대로 표기됩니다"><input type="checkbox" name="fin_service_${id}" onchange="calcFinishing(${id})"> 서비스</label>
                            <span id="finishing_service_${id}" class="hidden text-[11px] font-medium text-orange-600"></span>
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
                // 그룹추출 자식 = group.index(≥0) / 트레이 완성본 자식 = -3 passthrough (intake.js 묶음 프리필)
                const gIdxVal = (group.ai_group_index !== undefined && group.ai_group_index !== null)
                    ? group.ai_group_index : group.index;
                const sizeLabel = group.label ? `${group.label} ${group.index}` : `그룹 ${group.index}`;

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
                            ${sizeLabel}<br>
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
                    <input type="hidden" name="child_ai_group_index_${id}" value="${gIdxVal}">
                    <input type="hidden" name="child_ai_analysis_id_${id}" value="${group._analysis_id || aiAnalysisId || ''}">
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
                // 내용·수량 프리필은 DOM 주입(HTML attr 이스케이프 회피 — 키워드에 따옴표 가능)
                if (group.content) {
                    const cEl = document.querySelector('[name="child_content_' + id + '"]');
                    if (cEl) cEl.value = group.content;
                }
                if (group.qty && Number(group.qty) > 1) {
                    const qEl = document.querySelector('[name="child_qty_' + id + '"]');
                    if (qEl) qEl.value = group.qty;
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

            // 상태 텍스트/색상 (order-form 내부용) — 라벨은 단일 소스(window.MES_STATUS)
            function getStatusText(status) {
                return window.MES_STATUS.orderLabel(status);
            }
            function getStatusColor(status) {
                return window.MES_STATUS.chipClass('order', status); // 상태 색상 SSOT (statusLabels.ts)
            }

            // 담당 법인(assigned_entity) 복원 헬퍼.
            //   셀렉트 옵션은 sheet.js loadEntities 가 비동기로 채운다 — 옵션이 없을 때 .value 를 넣으면
            //   select 는 조용히 '' 가 된다(담당자 셀렉트 #64 와 같은 함정). 그래서 의도값을 dataset 에도
            //   남기고, 옵션 로더가 채운 뒤 그 값을 다시 적용하게 한다.
            function setAssignedEntity(rowId, entityId) {
                var sel = document.querySelector('[name="assigned_entity_' + rowId + '"]');
                if (!sel) return;
                var v = (entityId == null || entityId === '') ? '' : String(entityId);
                sel.dataset.desiredValue = v;
                sel.value = v;
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
                        } else if (code === 'WAY-1' || code === 'WAY-2' || code === 'WAY-3') {
                            // Restore print-layer WAY select
                            var plSel = container.querySelector('.pp-printlayer-select');
                            if (plSel) {
                                for (var pi = 0; pi < plSel.options.length; pi++) {
                                    if (plSel.options[pi].dataset.ppCode === code) { plSel.selectedIndex = pi; break; }
                                }
                            }
                        } else if (code.indexOf('PP-COAT') === 0) {
                            // Restore coating (무광/유광 select) — 시트 SPP031 + 합성지 120g/180g/유광 전체 코드 일반화
                            var coatingSel = container.querySelector('.pp-coating-select');
                            if (coatingSel) {
                                for (var ci = 0; ci < coatingSel.options.length; ci++) {
                                    if (coatingSel.options[ci].dataset.ppCode === code) { coatingSel.selectedIndex = ci; break; }
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
                        } else if (code === 'PP-GROMMET' || code === 'PP-NONWOVEN' || code === 'PP-TASSEL') {
                            // Restore transfer PP (parameter-based)
                            var tfItem = container.querySelector('.pp-transfer-item[data-pp-code="' + code + '"]');
                            if (tfItem) {
                                var tfCheck = tfItem.querySelector('.pp-transfer-check');
                                if (tfCheck) {
                                    tfCheck.checked = true;
                                    var tfParams = tfItem.querySelector('.pp-transfer-params');
                                    if (tfParams) tfParams.style.display = 'flex';
                                }
                                if (pp.params) {
                                    Object.keys(pp.params).forEach(function(key) {
                                        var field = tfItem.querySelector('.pp-tf-field[data-key="' + key + '"]');
                                        if (field) field.value = pp.params[key];
                                    });
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
                    // 0535: 합본(delivery_info)에서 상세를 **접미 매칭**으로만 떼어낸다.
                    //   접미가 아니면 전체를 도로명칸에 — 레거시 8,758건도 표시 손실 0.
                    const delEl = document.getElementById('deliveryInfo');
                    const delDetEl = document.getElementById('deliveryDetail');
                    const delPostEl = document.getElementById('deliveryPostal');
                    const delSplit = window.dsSplitAddress(order.delivery_info, order.delivery_detail);
                    if (delEl) delEl.value = delSplit.road;
                    if (delDetEl) delDetEl.value = delSplit.detail;
                    if (delPostEl) delPostEl.value = order.delivery_postal || '';
                    const dmEl = document.getElementById('deliveryMethod');
                    if (dmEl && order.delivery_method) {
                        var dmOptions = Array.from(dmEl.options).map(function(o) { return o.value; });
                        // 옵션에 없는 과거값은 동적 옵션으로 유지 — ''로 두면 저장 시 서버 기본값('배송')으로
                        // 조용히 치환된다(왕복감사 실증). 담당자 셀렉트(#64)와 같은 규칙.
                        if (dmOptions.indexOf(order.delivery_method) < 0) {
                            var dmLegacy = document.createElement('option');
                            dmLegacy.value = order.delivery_method;
                            dmLegacy.textContent = order.delivery_method + ' (이전값)';
                            dmEl.appendChild(dmLegacy);
                        }
                        dmEl.value = order.delivery_method;
                    }
                    // ★순서 중요: 방법 변경 훅을 시간 복원 **전에** 호출한다 — 뒤에 호출하면
                    //   "이전에 고정이었던 경우 미정으로 리셋" 로직이 방금 복원한 시간을 지운다
                    //   (택배류가 아닌 전 주문에서 수정 저장마다 delivery_time 소실 — 왕복감사 실증).
                    onDeliveryMethodChange();
                    var slotEl = document.getElementById('deliverySlot');
                    if (slotEl && order.delivery_slot) {
                        slotEl.value = order.delivery_slot;
                        refreshDeliverySlotGuard();   // 마감이 지난 AM 도 값은 유지된다
                    }
                    if (order.delivery_time) {
                        var dtParts = order.delivery_time.split(':');
                        var dtHourEl = document.getElementById('deliveryTimeHour');
                        if (dtHourEl) dtHourEl.value = dtParts[0] || '';
                        updateMinuteOptions();
                        var dtMinEl = document.getElementById('deliveryTimeMinute');
                        if (dtMinEl) dtMinEl.value = dtParts[1] || '00';
                    }
                    var spEl = document.getElementById('shippingPayment');
                    if (spEl) spEl.value = order.shipping_payment || '';
                    document.getElementById('notes').value = order.notes || '';
                    // 담당자 복원 — ⚠️ 옵션 로드(ofLoadSalesReps)와 **순서가 보장되지 않는다.**
                    //   옵션이 없을 때 .value 에 넣으면 select 는 조용히 '' 가 된다(담당자 소실).
                    //   그래서 의도값을 dataset 에 남기고, 로더가 채운 뒤 그 값을 적용한다.
                    const salesRepEl = document.getElementById('salesRepId');
                    if (!salesRepEl) console.warn('[orderForm] #salesRepId not found');
                    else {
                        const want = order.sales_rep_id ? String(order.sales_rep_id) : '';
                        salesRepEl.dataset.pending = want;
                        salesRepEl.value = want;              // 옵션이 이미 있으면 즉시 반영
                        // 후보가 디자이너·관리자로 좁혀졌으므로(2026-08-10) 과거 담당자는 목록에 없을 수 있다.
                        //   include 를 붙여 다시 불러야 그 사람이 옵션으로 합류한다 — 안 하면 저장 시 담당자 소실.
                        if (want && window.ofReloadSalesReps) window.ofReloadSalesReps();
                    }
                    const contactPhoneEl = document.getElementById('contactPhone');
                    if (contactPhoneEl) contactPhoneEl.value = order.contact_phone || '';
                    const contactMobileEl = document.getElementById('contactMobile');
                    if (contactMobileEl) contactMobileEl.value = order.contact_mobile || '';

                    // 합배송 예약 복원 (배송 후속 P1) — 수정모드: 기존 예약 라디오 유지
                    _ofConsolidateWith = order.consolidate_with_order_id || null;
                    if (order.client_id) ofLoadUnshippedCandidates(order.client_id, _ofConsolidateWith);

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
                        // 담당 법인 복원 — 없으면 저장 시 undefined 가 가고 update.ts 가 추천값으로 덮는다
                        //   (손으로 지정한 담당이 수정 저장마다 되돌아가고 청구 분할까지 다시 나뉜다).
                        //   ⚠️ 옵션 로드(sheet.js loadEntities)와 순서가 보장되지 않아 의도값을 dataset 에도 남긴다.
                        setAssignedEntity(id, item.assigned_entity_id);
                        // 품목별 최소청구 변(cm) — 이 히든이 비면 calc.js 가 기본 100 으로 되돌아가
                        //   실규격 청구 품목(UV 판재 등)의 금액이 커지고, 그 차이로 복원 로직이 해당 행을
                        //   '수동 에누리'로 오인 마킹한다(이후 규격을 고쳐도 금액이 안 따라온다).
                        set('min_billing_side', item.min_billing_side_cm == null ? '' : item.min_billing_side_cm);

                        // 직접연결 파일 칩 복원 (ai_group_index -1/-3 = 직접연결 약속값) — 없으면 수정화면에서
                        //   연결 여부가 안 보이고 완성본↔가공 전환도 불가(값은 유지되나 표시·조작 불능).
                        if (item.ai_analysis_id && (item.ai_group_index === -1 || item.ai_group_index === -3)) {
                            set('direct_file_path', item.ai_file_path || '');
                            var dfChipE = document.getElementById('direct_file_chip_' + id);
                            var dfNameE = document.getElementById('direct_file_name_' + id);
                            if (dfNameE) dfNameE.textContent = (item.ai_file_path || '').split(/[/\\]/).pop() || ('분석#' + item.ai_analysis_id);
                            if (dfChipE) dfChipE.classList.remove('hidden');
                            var dfPtE = document.getElementById('direct_passthrough_' + id);
                            if (dfPtE) dfPtE.checked = (item.ai_group_index === -3);
                            // 파일 규격 판독값 복원(groups_json '직접연결' width_mm) — 수정화면에서도
                            //   스케일 변경(origMm×배율)이 파일 실측과 결합되게 한다(2026-08-24 파일 규격 자동 판독)
                            try {
                                var dfGroups = JSON.parse(item.ai_groups_json || '[]');
                                var dfG0 = dfGroups && dfGroups[0];
                                if (dfG0 && dfG0.width_mm > 0 && dfG0.height_mm > 0) {
                                    var dfW = document.querySelector('[name="width_' + id + '"]');
                                    var dfH = document.querySelector('[name="height_' + id + '"]');
                                    if (dfW) { dfW.dataset.origMm = String(dfG0.width_mm); dfW.dataset.probeSource = '1'; }
                                    if (dfH) { dfH.dataset.origMm = String(dfG0.height_mm); dfH.dataset.probeSource = '1'; }
                                }
                            } catch (e) { /* groups_json 파싱 실패 무시 */ }
                        }

                        // 칼선 DXF 복원 (core.ts kind='dxf' 서브셀렉트) — 복원 없이는 재저장 시 재연결만 되고 칩이 안 보인다
                        if (item.dxf_analysis_id) {
                            set('dxf_analysis_id', item.dxf_analysis_id);
                            set('dxf_file_path', item.dxf_file_path || '');
                            set('dxf_file_name', item.dxf_file_name || '');
                            var dxfChipE = document.getElementById('dxf_file_chip_' + id);
                            var dxfNameE = document.getElementById('dxf_file_name_chip_' + id);
                            if (dxfNameE) dxfNameE.textContent = item.dxf_file_name || 'DXF';
                            if (dxfChipE) dxfChipE.classList.remove('hidden');
                        }

                        // 유통품목 규격 복원: specification이 있으면 규격칸 표시 + 인쇄 전용칸 비활성 (수정 시 규격 손실 방지)
                        if (item.specification) {
                            applyDistRowMode(id, true);
                            var specEdit = document.querySelector('[name="spec_' + id + '"]');
                            if (specEdit) specEdit.value = item.specification;
                        }

                        var pmRestoreVal = item.pricing_method || 'FIXED';
                        set('pricing_method', pmRestoreVal);
                        if (pmRestoreVal === 'AREA') {
                            var wRestoreEl = document.querySelector('[name="width_' + id + '"]');
                            var hRestoreEl = document.querySelector('[name="height_' + id + '"]');
                            var priceLblRestore = document.getElementById('unit_price_label_' + id);
                            if (wRestoreEl) { wRestoreEl.classList.add('border-blue-500'); wRestoreEl.classList.remove('border-gray-300'); }
                            if (hRestoreEl) { hRestoreEl.classList.add('border-blue-500'); hRestoreEl.classList.remove('border-gray-300'); }
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

                        // #590: 행 에누리 복원 — calcItem이 dataset.autoAmount를 채운 뒤에 실행해야 한다.
                        //   저장된 최종액(item.amount)이 재계산 자동값과 다르면 수동수정 상태(주황 테두리·
                        //   에누리 문구·사유칸)를 재현한다. 이걸 안 하면 저장 시 payload가 amount를 안 보내
                        //   서버가 자동값으로 재계산 → line_discount·discount_reason이 조용히 소멸.
                        //   비교 기준은 저장된 auto_amount가 아니라 재계산값 — 서버 hasManual 판정과 같은 축.
                        (function() {
                            var amtRestoreEl = document.querySelector('[name="amount_' + id + '"]');
                            if (!amtRestoreEl || amtRestoreEl.disabled || item.amount == null) return;
                            var autoRestoreAmt = parseInt(amtRestoreEl.dataset.autoAmount) || 0;
                            var savedAmt = Math.round(item.amount);
                            if (savedAmt === autoRestoreAmt) return;
                            amtRestoreEl.value = savedAmt.toLocaleString() + '원';
                            if (autoRestoreAmt > 0) {
                                onAmountManualEdit(id);
                            } else {
                                // 자동값 0(단가 없이 금액만 있는 이관 라인 — prod 9건)은
                                // onAmountManualEdit의 autoAmt>0 가드에 걸려 마킹이 안 되므로 직접 마킹.
                                // 마킹 없이는 저장 payload가 amount를 안 보내 금액이 0으로 소멸한다.
                                amtRestoreEl.classList.add('border-amber-400');
                                amtRestoreEl.title = '자동 계산: 0원 (수동 수정됨)';
                                var discBoxR = document.getElementById('line_disc_' + id);
                                if (discBoxR) discBoxR.classList.remove('hidden');
                                calculateTotal();
                            }
                            if (item.discount_reason) {
                                var reasonEl = document.querySelector('[name="discount_reason_' + id + '"]');
                                if (reasonEl) reasonEl.value = item.discount_reason;
                            }
                        })();

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

                        // 후가공 복원 — ★수정모드는 applyItemSelection을 안 타 loadItemPP가 영영 안 불렸다.
                        //   pp_options가 placeholder인 채 복원이 no-op → 저장 시 calc.js가 빈 '[]'를 보내
                        //   후가공이 통째로 소실(왕복감사 실증). 옵션을 먼저 로드하고 값을 적용한다.
                        //   (600ms setTimeout 지연 방식 폐기 — 타이밍이 아니라 로드 자체가 없던 게 원인)
                        // 스태시: 컨트롤이 안 그려지는 행(소분류 미지정 등)은 calc.js가 이 원본을 보존한다.
                        if (item.post_processing) {
                            var ppStashRow = document.getElementById('item-' + id);
                            if (ppStashRow) ppStashRow.dataset.origPp = item.post_processing;
                        }
                        if (item.item_id) {
                            set('item_subcat', item.item_subcategory || '');
                            await loadItemPP(id, item.item_subcategory || '');
                            if (item.post_processing) restorePostProcessing(id, item.post_processing);
                        }

                        // 마감방식 복원 — 없으면 수정 화면의 fin 셀렉트가 빈 채로 남고, 저장 시
                        //   calc.js가 빈 finishing을 보내 기존 마감이 조용히 소실된다(update.ts는
                        //   delete+reinsert). 유통 라인(specification)은 마감 섹션 자체가 숨김이라 제외.
                        if (!item.specification) await window.restoreFinishingForRow(id, item.finishing);
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
                        document.getElementById('deliveryDate').value = new Date(newDeliv.getTime() - newDeliv.getTimezoneOffset() * 60000).toISOString().split('T')[0];
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
                // 0535: 수정모드와 동일 규칙(접미 매칭 분해)
                const delEl = document.getElementById('deliveryInfo');
                const delDetElCopy = document.getElementById('deliveryDetail');
                const delPostElCopy = document.getElementById('deliveryPostal');
                const delSplitCopy = window.dsSplitAddress(order.delivery_info, order.delivery_detail);
                if (delEl) delEl.value = delSplitCopy.road;
                if (delDetElCopy) delDetElCopy.value = delSplitCopy.detail;
                if (delPostElCopy) delPostElCopy.value = order.delivery_postal || '';
                const dmEl = document.getElementById('deliveryMethod');
                if (dmEl && order.delivery_method) {
                    var dmOptionsCopy = Array.from(dmEl.options).map(function(o) { return o.value; });
                    // 수정모드와 동일 규칙: 과거값은 동적 옵션으로 유지(치환 금지)
                    if (dmOptionsCopy.indexOf(order.delivery_method) < 0) {
                        var dmLegacyCopy = document.createElement('option');
                        dmLegacyCopy.value = order.delivery_method;
                        dmLegacyCopy.textContent = order.delivery_method + ' (이전값)';
                        dmEl.appendChild(dmLegacyCopy);
                    }
                    dmEl.value = order.delivery_method;
                }
                // 방법 변경 훅은 시간 복원 전에 — 수정모드와 같은 소실 방지 (리셋 로직이 시간을 지움)
                onDeliveryMethodChange();
                var slotElCopy = document.getElementById('deliverySlot');
                if (slotElCopy && order.delivery_slot) {
                    slotElCopy.value = order.delivery_slot;
                    refreshDeliverySlotGuard();
                }
                if (order.delivery_time) {
                    var dtPartsCopy = order.delivery_time.split(':');
                    var dtHourCopy = document.getElementById('deliveryTimeHour');
                    if (dtHourCopy) dtHourCopy.value = dtPartsCopy[0] || '';
                    updateMinuteOptions();
                    var dtMinCopy = document.getElementById('deliveryTimeMinute');
                    if (dtMinCopy) dtMinCopy.value = dtPartsCopy[1] || '00';
                }
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
                    // 담당 법인·최소청구 변 — 수정 경로와 같은 이유로 승계한다(미승계 시 추천값 덮어쓰기·청구면적 왜곡)
                    setAssignedEntity(id, item.assigned_entity_id);
                    set('min_billing_side', item.min_billing_side_cm == null ? '' : item.min_billing_side_cm);
                    // 직접연결 파일 칩 복원 (수정모드와 동일 — 재주문도 연결 상태가 보여야 전환·해제 가능)
                    if (item.ai_analysis_id && (item.ai_group_index === -1 || item.ai_group_index === -3)) {
                        set('direct_file_path', item.ai_file_path || '');
                        var cDfChip = document.getElementById('direct_file_chip_' + id);
                        var cDfName = document.getElementById('direct_file_name_' + id);
                        if (cDfName) cDfName.textContent = (item.ai_file_path || '').split(/[/\\]/).pop() || ('분석#' + item.ai_analysis_id);
                        if (cDfChip) cDfChip.classList.remove('hidden');
                        var cDfPt = document.getElementById('direct_passthrough_' + id);
                        if (cDfPt) cDfPt.checked = (item.ai_group_index === -3);
                        // 파일 규격 판독값 복원 — 수정모드와 동일(재주문에서도 스케일↔실측 결합 유지)
                        try {
                            var cDfGroups = JSON.parse(item.ai_groups_json || '[]');
                            var cDfG0 = cDfGroups && cDfGroups[0];
                            if (cDfG0 && cDfG0.width_mm > 0 && cDfG0.height_mm > 0) {
                                var cDfW = document.querySelector('[name="width_' + id + '"]');
                                var cDfH = document.querySelector('[name="height_' + id + '"]');
                                if (cDfW) { cDfW.dataset.origMm = String(cDfG0.width_mm); cDfW.dataset.probeSource = '1'; }
                                if (cDfH) { cDfH.dataset.origMm = String(cDfG0.height_mm); cDfH.dataset.probeSource = '1'; }
                            }
                        } catch (e) { /* groups_json 파싱 실패 무시 */ }
                    }
                    // 재주문: 칼선 DXF 도 같은 소스 재사용
                    if (item.dxf_analysis_id) {
                        set('dxf_analysis_id', item.dxf_analysis_id);
                        set('dxf_file_path', item.dxf_file_path || '');
                        set('dxf_file_name', item.dxf_file_name || '');
                        var cDxfChip = document.getElementById('dxf_file_chip_' + id);
                        var cDxfName = document.getElementById('dxf_file_name_chip_' + id);
                        if (cDxfName) cDxfName.textContent = item.dxf_file_name || 'DXF';
                        if (cDxfChip) cDxfChip.classList.remove('hidden');
                    }

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

                    // 후가공 승계 — 수정모드와 동일: loadItemPP 없이는 복원이 no-op라 재주문에서 후가공이 소실됐다
                    if (item.post_processing) {
                        var cPpStashRow = document.getElementById('item-' + id);
                        if (cPpStashRow) cPpStashRow.dataset.origPp = item.post_processing;
                    }
                    if (item.item_id) {
                        set('item_subcat', item.item_subcategory || '');
                        await loadItemPP(id, item.item_subcategory || '');
                        if (item.post_processing) restorePostProcessing(id, item.post_processing);
                    }

                    // 재주문도 마감방식 승계 (수정모드와 동일 — 없으면 섹션이 placeholder로 남는다)
                    if (!item.specification) await window.restoreFinishingForRow(id, item.finishing);
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
                    // ★자식이 있는 부모만. idMap 에는 일반 라인도 담겨 있어 전체를 돌리면
                    //   updateParentChildCount 가 자식 0개를 세어 quantity 를 0 으로 덮고(:783-784),
                    //   서버가 `quantity || 1` 로 1 을 저장한다 = 수량이 조용히 1 로 줄어든 복사본.
                    //   수정 경로(loadOrderForEdit)와 같은 규칙이다.
                    const parentIdsWithChildrenCopy = new Set(
                        childItems.map(c => idMap[c.parent_item_id]).filter(Boolean)
                    );
                    parentIdsWithChildrenCopy.forEach(pid => updateParentChildCount(pid));
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
                var box = document.getElementById('line_disc_' + id);
                var txt = document.getElementById('line_disc_txt_' + id);
                if (autoAmt > 0 && manual !== autoAmt) {
                    el.classList.add('border-amber-400');
                    el.title = '자동 계산: ' + autoAmt.toLocaleString() + '원 (수동 수정됨)';
                    // 에누리(차액)를 문구로 드러낸다 — 증액이면 '추가'로 표기(음수 할인)
                    var diff = autoAmt - manual;
                    if (txt) {
                        txt.textContent = diff > 0
                            ? '자동 ' + autoAmt.toLocaleString() + '원 − 에누리 ' + diff.toLocaleString() + '원'
                            : '자동 ' + autoAmt.toLocaleString() + '원 + 추가 ' + Math.abs(diff).toLocaleString() + '원';
                    }
                    if (box) box.classList.remove('hidden');
                } else {
                    el.classList.remove('border-amber-400');
                    el.title = '';
                    if (box) box.classList.add('hidden');
                }
                calculateTotal();
            };

            // (#429: 출력방식 필터 togglePrintMethodFilter/selectPrintMethodFilter/selectPrintMediaFilter 제거
            //  — print-system 폐기로 호출처 0·완전 dead. /api/print-system/items-for-order 404 호출 제거.)

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
            // 거래처 단가 제안 — 품목 선택 시 1회, 그리고 **규격이 채워지면 다시** 물어본다.
            //   품목을 고르는 시점엔 크기를 아직 모르는데, 실측상 단가를 가르는 축이 규격이다:
            //   같은 거래처+품목+규격의 직전가는 중앙오차 **0.0%**(거래처+품목만이면 4.6%).
            //   서버가 규격 일치를 먼저 찾고 없으면 기존 직전가로 떨어진다(routes/prices.ts).
            //   ⚠️ AREA 품목의 ㎡ 단가 환산은 서버가 한다 — 여기서 다시 만지지 말 것.
            window.refreshPriceSuggestion = function(id) {
                var priceInp = document.querySelector('[name="unit_price_' + id + '"]');
                var itemIdEl = document.querySelector('[name="item_id_' + id + '"]');
                var clientEl = document.getElementById('clientId');
                if (!priceInp || !itemIdEl || !clientEl) {
                    console.warn('[orderForm] refreshPriceSuggestion: 행 요소를 찾지 못했습니다 #' + id);
                    return;
                }
                var itemId = itemIdEl.value, clientId = clientEl.value;
                if (!itemId || !clientId) return;

                // 사용자가 손으로 고쳤으면 건드리지 않는다 — 마지막으로 제안한 값과 같을 때만 덮는다.
                var suggested = priceInp.dataset.basePrice;
                var cur = parseMoney(priceInp.value);
                if (suggested && cur && String(cur) !== String(suggested)) return;

                var wEl = document.querySelector('[name="width_' + id + '"]');
                var hEl = document.querySelector('[name="height_' + id + '"]');
                var w = wEl ? parseFloat(wEl.value) : 0;
                var h = hEl ? parseFloat(hEl.value) : 0;
                var q = '/api/prices?item_id=' + encodeURIComponent(itemId) +
                        '&client_id=' + encodeURIComponent(clientId) + '&context=sales';
                if (w > 0 && h > 0) q += '&width=' + w + '&height=' + h;

                var priceAtRequest = priceInp.value;
                axios.get(q).then(function(r) {
                    var d = r && r.data;
                    var srcEl = document.getElementById('price_src_' + id);
                    if (d && d.price_source === 'suppressed') {
                        // 주문제작 계열 — 틀린 값을 채우면 「검토했다」는 착시를 준다. 빈칸이 낫다.
                        if (srcEl) { srcEl.textContent = '건별 견적'; srcEl.classList.remove('hidden'); }
                        return;
                    }
                    if (!d || !(d.suggested_price > 0)) return;
                    if (priceInp.value !== priceAtRequest) return;   // 응답 대기 중 사용자 입력 우선
                    priceInp.value = fmtMoneyInput(d.suggested_price);
                    priceInp.dataset.basePrice = d.suggested_price;  // 특약 저장 제안의 비교 기준
                    if (srcEl) {
                        var label = d.price_source === 'recent_same_spec' ? '같은 규격 최근가'
                                  : d.price_source === 'recent_transaction' ? '최근 거래가'
                                  : d.price_source === 'client_item_price' ? '거래처 특약가'
                                  : d.price_source === 'price_list' ? '단가표'
                                  : d.price_source === 'base_price' ? '기본 단가(추정)' : '';
                        srcEl.textContent = label;
                        srcEl.classList.toggle('hidden', !label);
                    }
                    calcItem(id);
                }).catch(function() { /* 제안 실패는 무음 — 기본 단가로 진행 */ });
            };

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
                    // #426: showConfirm 2번째 인자는 options(객체)라 콜백 미실행 → Promise.then 표준 패턴으로 교체.
                    showConfirm(msg).then(function(confirmed) {
                        if (!confirmed) return;
                        // #318: POST /api/prices 없음 → /client-item-prices (upsert)로 리포인트.
                        // 백엔드 body: { client_id, item_id, price, notes? }. 'context'는 미사용이라 제거.
                        axios.post('/api/prices/client-item-prices', {
                            item_id: parseInt(itemId),
                            client_id: parseInt(clientId),
                            price: newPrice
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
                        // 셀렉트에는 name 이 없다(id="deliveryMethod" 뿐) — [name="delivery_method"] 는 항상 null 이라
                        //   가드에 걸려 조용히 통과했고, 견적서의 배송방법이 주문서에 안 실렸다(기본값 대신택배로 저장).
                        const dm = document.getElementById('deliveryMethod');
                        if (dm) {
                            // 수정·복사 경로와 같은 규칙: 옵션에 없는 과거값은 '(이전값)' 동적 옵션으로 유지
                            var qDmOpts = Array.from(dm.options).map(function(o) { return o.value; });
                            if (qDmOpts.indexOf(q.delivery_method) < 0) {
                                var qDmLegacy = document.createElement('option');
                                qDmLegacy.value = q.delivery_method;
                                qDmLegacy.textContent = q.delivery_method + ' (이전값)';
                                dm.appendChild(qDmLegacy);
                            }
                            dm.value = q.delivery_method;
                            if (typeof onDeliveryMethodChange === 'function') onDeliveryMethodChange();
                        }
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
                    setTimeout(async function() {
                        for (var qIdx = 0; qIdx < nonParentItems.length; qIdx++) {
                            var it = nonParentItems[qIdx];
                            var id = qIdx + 1;
                            var setVal = function(sel, v) {
                                var el = document.querySelector(sel);
                                if (el && v != null) {
                                    el.value = v;
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            };
                            // 품목명은 이벤트 없이 채운다 — input 이벤트가 자동완성을 깨워 300ms 뒤
                            // applyItemSelection이 견적 단가·복원된 후가공을 기본값으로 덮는 경쟁을 만든다.
                            var qSearchEl = document.querySelector('[name="item_search_' + id + '"]');
                            if (qSearchEl && it.item_name != null) qSearchEl.value = it.item_name;
                            setVal('[name="item_id_' + id + '"]', it.item_id);
                            setVal('[name="width_' + id + '"]', it.width);
                            setVal('[name="height_' + id + '"]', it.height);
                            setVal('[name="quantity_' + id + '"]', it.quantity);
                            setVal('[name="unit_price_' + id + '"]', it.unit_price);
                            setVal('[name="content_' + id + '"]', it.content);
                            if (typeof window.calcItem === 'function') window.calcItem(id);
                            // 후가공·마감 승계 — 견적 items에 post_processing/finishing이 저장돼 있다.
                            //   소분류·카테고리는 품목 마스터에서 보충(후가공 옵션 로드·마감 그룹 판별용).
                            if (it.post_processing) {
                                var qPpStashRow = document.getElementById('item-' + id);
                                if (qPpStashRow) qPpStashRow.dataset.origPp = it.post_processing;
                            }
                            if (it.item_id) {
                                try {
                                    var qiRes = await axios.get('/api/items/' + it.item_id);
                                    var qiData = (qiRes.data && qiRes.data.data) || {};
                                    var qSubEl = document.querySelector('[name="item_subcat_' + id + '"]');
                                    if (qSubEl) qSubEl.value = qiData.sub_category || '';
                                    var qCatEl = document.querySelector('[name="category_name_' + id + '"]');
                                    if (qCatEl && !qCatEl.value) qCatEl.value = qiData.category || '';
                                    // 단가 방식·최소청구 변 — 품목 마스터에서 보충한다. 안 채우면 calc.js 가
                                    //   MIN_SIDE 100 으로 되돌아가 실규격 청구 품목의 금액이 부풀고,
                                    //   AREA 품목이 FIXED 로 계산된다.
                                    var qPmEl = document.querySelector('[name="pricing_method_' + id + '"]');
                                    if (qPmEl) qPmEl.value = qiData.pricing_method || 'FIXED';
                                    var qMsEl = document.querySelector('[name="min_billing_side_' + id + '"]');
                                    if (qMsEl) qMsEl.value = (qiData.min_billing_side_cm == null ? '' : qiData.min_billing_side_cm);
                                    if (typeof window.calcItem === 'function') window.calcItem(id);
                                    await loadItemPP(id, qiData.sub_category || '');
                                    if (it.post_processing) restorePostProcessing(id, it.post_processing);
                                } catch(eQi) { console.warn('[orderForm] 견적 후가공 승계 실패', eQi); }
                            }
                            await window.restoreFinishingForRow(id, it.finishing);
                        }
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
