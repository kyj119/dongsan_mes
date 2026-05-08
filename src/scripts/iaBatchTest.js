// IA 배치 테스트 페이지 스크립트
let allResults = [];
let currentFilter = 'all';
let createdIds = [];
let pollTimer = null;

// 헬퍼 서버 주소 (folder-scan-server.js)
const SCAN_SERVER = 'http://' + window.location.hostname + ':3001';

// ── 폴더 스캔 ──────────────────────────────────────────
async function scanFolder() {
    const folderPath = document.getElementById('folderPath').value.trim();
    if (!folderPath) {
        showToast('폴더 경로를 입력하세요', 'warning');
        return;
    }

    const scanBtn = document.getElementById('scanBtn');
    const scanStatus = document.getElementById('scanStatus');
    scanBtn.disabled = true;
    scanBtn.textContent = '스캔 중...';
    scanStatus.className = 'mt-2 text-sm text-blue-600';
    scanStatus.textContent = '폴더를 스캔하고 있습니다...';
    scanStatus.classList.remove('hidden');

    try {
        const res = await axios.post(SCAN_SERVER + '/scan', {
            folder_path: folderPath
        }, { timeout: 30000 });

        const data = res.data;
        if (data.success) {
            const textarea = document.getElementById('filePaths');
            // 기존 목록에 추가 (중복 제거)
            const existing = textarea.value.trim().split('\n').filter(Boolean);
            const merged = [...new Set([...existing, ...data.files])];
            textarea.value = merged.join('\n');

            document.getElementById('fileCount').textContent = `(${merged.length}개)`;
            scanStatus.className = 'mt-2 text-sm text-green-600';
            scanStatus.textContent = `✓ ${data.count}개 파일 발견 (${data.elapsed_ms}ms)` +
                (data.truncated ? ' — 최대 수량 도달, 하위 폴더를 나눠서 스캔하세요' : '');

            document.getElementById('helperNotice').classList.add('hidden');
        } else {
            scanStatus.className = 'mt-2 text-sm text-red-600';
            scanStatus.textContent = '✗ ' + data.error;
        }
    } catch (err) {
        scanStatus.className = 'mt-2 text-sm text-red-600';
        if (err.code === 'ECONNREFUSED' || err.message?.includes('Network Error')) {
            scanStatus.textContent = '✗ 폴더 스캔 서버에 연결할 수 없습니다';
            document.getElementById('helperNotice').classList.remove('hidden');
        } else {
            scanStatus.textContent = '✗ ' + (err.response?.data?.error || err.message);
        }
    } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = '폴더 스캔';
    }
}

function clearFiles() {
    document.getElementById('filePaths').value = '';
    document.getElementById('fileCount').textContent = '';
    document.getElementById('scanStatus').classList.add('hidden');
}

// ── 배치 등록 ──────────────────────────────────────────
async function submitBatch() {
    const textarea = document.getElementById('filePaths');
    const paths = textarea.value.trim().split('\n').map(p => p.trim()).filter(Boolean);
    if (paths.length === 0) {
        showToast('파일이 없습니다. 먼저 폴더를 스캔하거나 파일 경로를 입력하세요.', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const resultDiv = document.getElementById('submitResult');
    submitBtn.disabled = true;
    submitBtn.textContent = `${paths.length}건 등록 중...`;
    resultDiv.className = 'text-sm self-center text-blue-600';
    resultDiv.textContent = '';
    resultDiv.classList.remove('hidden');

    // 100건씩 나눠서 등록
    const BATCH_SIZE = 100;
    let totalCreated = 0;
    let allCreatedIds = [];
    let errors = [];

    try {
        for (let i = 0; i < paths.length; i += BATCH_SIZE) {
            const chunk = paths.slice(i, i + BATCH_SIZE);
            resultDiv.textContent = `등록 중... (${i}/${paths.length})`;

            const res = await axios.post('/api/ai-analysis/batch-test', {
                file_paths: chunk,
                tag: 'batch_test_' + new Date().toISOString().slice(0, 10)
            });
            if (res.data.success) {
                totalCreated += res.data.created_count;
                allCreatedIds.push(...(res.data.created_ids || []));
            } else {
                errors.push(res.data.error);
            }
        }

        createdIds = allCreatedIds;
        resultDiv.className = 'text-sm self-center text-green-600';
        resultDiv.textContent = `✓ ${totalCreated}건 등록 완료` +
            (allCreatedIds.length > 0 ? ` (ID: ${allCreatedIds[0]}~${allCreatedIds[allCreatedIds.length - 1]})` : '');

        // ID 범위 자동 설정
        if (allCreatedIds.length > 0) {
            document.getElementById('fromId').value = allCreatedIds[0];
            document.getElementById('toId').value = allCreatedIds[allCreatedIds.length - 1];
        }

        // 결과 즉시 로드 + 폴링 시작
        loadResults();
        startPolling();
    } catch (err) {
        resultDiv.className = 'text-sm self-center text-red-600';
        resultDiv.textContent = '✗ ' + (err.response?.data?.error || err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '전체 분석 요청';
    }
}

// ── 결과 조회 ──────────────────────────────────────────
async function loadResults() {
    const fromId = document.getElementById('fromId').value;
    const toId = document.getElementById('toId').value;

    if (!fromId || !toId) {
        showToast('ID 범위를 입력하세요', 'warning');
        return;
    }

    try {
        const res = await axios.get('/api/ai-analysis/batch-results', {
            params: { from: fromId, to: toId }
        });
        if (res.data.success) {
            allResults = res.data.results || [];
            updateSummary(res.data.summary);
            renderResults();
        }
    } catch (err) {
        console.error('결과 조회 실패:', err);
    }
}

function refreshResults() {
    if (document.getElementById('fromId').value && document.getElementById('toId').value) {
        loadResults();
    }
}

// ── 폴링 ──────────────────────────────────────────────
function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
        await loadResults();
        const pending = allResults.filter(r => r.status === 'pending' || r.status === 'processing');
        if (pending.length === 0 && allResults.length > 0) {
            stopPolling();
        }
    }, 5000);
}

function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

// ── 요약 업데이트 ──────────────────────────────────────
function updateSummary(summary) {
    document.getElementById('summaryCards').classList.remove('hidden');
    document.getElementById('statTotal').textContent = summary.total;
    document.getElementById('statPending').textContent = summary.pending + (summary.processing || 0);
    document.getElementById('statDone').textContent = summary.done;
    document.getElementById('statError').textContent = summary.error;
}

// ── 필터 ──────────────────────────────────────────────
function filterResults(status) {
    currentFilter = status;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('ring-2', 'ring-blue-500');
    });
    event.target.classList.add('ring-2', 'ring-blue-500');
    renderResults();
}

// ── 결과 렌더링 ────────────────────────────────────────
function renderResults() {
    const grid = document.getElementById('resultsGrid');
    let filtered = allResults;
    if (currentFilter !== 'all') {
        filtered = allResults.filter(r => r.status === currentFilter);
    }

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">결과 없음</div>';
        return;
    }

    grid.innerHTML = filtered.map(r => renderResultCard(r)).join('');
}

function renderResultCard(r) {
    const statusBadge = getStatusBadge(r.status);
    const fileName = (r.file_path || '').split(/[\\/]/).pop() || r.file_path;
    const folderPath = (r.file_path || '').split(/[\\/]/).slice(-3, -1).join('/');

    let groupsHtml = '';
    if (r.status === 'done' && r.groups_json) {
        try {
            const groups = JSON.parse(r.groups_json);
            if (groups.length === 0) {
                groupsHtml = '<div class="text-sm text-gray-400 mt-2">그룹 없음</div>';
            } else {
                groupsHtml = `
                    <div class="mt-3 grid grid-cols-${Math.min(groups.length, 4)} gap-3">
                        ${groups.map((g, idx) => {
                            // Vision 분류 결과 우선, 없으면 메타데이터 기반 추론
                            const hasVision = !!g.vision_label;
                            const visionIsText = g.vision_label === 'text';
                            const visionIsDesign = g.vision_label === 'design';
                            const visionIsMixed = g.vision_label === 'mixed';

                            // 테두리 색상: Vision 결과 우선
                            let borderClass = 'border-gray-200';
                            if (hasVision) {
                                borderClass = visionIsText ? 'border-red-400 bg-red-50/40' :
                                              visionIsMixed ? 'border-amber-300 bg-amber-50/30' :
                                              'border-green-300 bg-green-50/20';
                            } else if (!g.has_image && !g.has_group) {
                                borderClass = 'border-amber-200 bg-amber-50/20';
                            }

                            // 뱃지
                            let metaBadges = '';
                            if (hasVision) {
                                if (visionIsText) {
                                    metaBadges += `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">🚫 텍스트 (${g.vision_confidence})</span> `;
                                } else if (visionIsDesign) {
                                    metaBadges += `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">✓ 디자인 (${g.vision_confidence})</span> `;
                                } else if (visionIsMixed) {
                                    metaBadges += `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">⚠ 혼합 (${g.vision_confidence})</span> `;
                                }
                            } else {
                                // Vision 미완료 — 메타데이터 기반 표시
                                if (g.has_image) {
                                    metaBadges += '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">🖼 이미지</span> ';
                                } else {
                                    metaBadges += '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 animate-pulse">분류 대기</span> ';
                                }
                            }

                            return `
                            <div class="border ${borderClass} rounded-lg p-2 text-center">
                                ${g.thumbnail_base64
                                    ? `<img src="data:image/png;base64,${g.thumbnail_base64}"
                                           class="w-full h-32 object-contain bg-gray-50 rounded mb-2 cursor-pointer"
                                           onclick="openImageModal(this.src)"
                                           title="클릭하여 크게 보기">`
                                    : '<div class="w-full h-32 bg-gray-100 rounded mb-2 flex items-center justify-center text-gray-400 text-xs">PNG 없음</div>'}
                                <div class="text-xs font-medium text-gray-700">그룹 ${g.index}</div>
                                <div class="text-xs text-gray-500">${g.width_mm} × ${g.height_mm} mm</div>
                                ${g.name ? `<div class="text-xs text-gray-400 truncate">${g.name}</div>` : ''}
                                <div class="mt-1 flex flex-wrap justify-center gap-1">${metaBadges}</div>
                                ${g.item_types ? `<div class="text-[10px] text-gray-400 mt-0.5">${g.item_types}</div>` : ''}
                            </div>
                        `}).join('')}
                    </div>
                `;
            }
        } catch (e) {
            groupsHtml = '<div class="text-sm text-red-400 mt-2">JSON 파싱 오류</div>';
        }
    } else if (r.status === 'error') {
        groupsHtml = `<div class="text-sm text-red-500 mt-2">${r.error_message || '알 수 없는 오류'}</div>`;
    } else if (r.status === 'pending' || r.status === 'processing') {
        groupsHtml = `<div class="text-sm text-amber-500 mt-2 animate-pulse">처리 중...</div>`;
    }

    return `
        <div class="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
            <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-mono text-gray-400">#${r.id}</span>
                    ${statusBadge}
                </div>
                <span class="text-xs text-gray-400">${r.created_at || ''}</span>
            </div>
            <div class="text-sm font-medium text-gray-800 truncate" title="${r.file_path}">
                ${fileName}
            </div>
            <div class="text-xs text-gray-400">${folderPath}</div>
            ${groupsHtml}
        </div>
    `;
}

function getStatusBadge(status) {
    const map = {
        pending: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">대기</span>',
        processing: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">처리중</span>',
        done: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">완료</span>',
        error: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">에러</span>',
    };
    return map[status] || `<span class="text-xs text-gray-500">${status}</span>`;
}

// ── 이미지 모달 ────────────────────────────────────────
function openImageModal(src) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60';
    modal.onclick = () => modal.remove();
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-2 max-w-3xl max-h-[90vh] overflow-auto" onclick="event.stopPropagation()">
            <img src="${src}" class="max-w-full max-h-[85vh] object-contain">
        </div>
    `;
    document.body.appendChild(modal);
}

// ESC로 모달 닫기
// ESC 모달 닫기는 layout.ts 글로벌 핸들러가 처리

// Enter 키로 폴더 스캔
document.getElementById('folderPath')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') scanFolder();
});

// 파일 목록 변경 시 카운트 업데이트
document.getElementById('filePaths')?.addEventListener('input', () => {
    const count = document.getElementById('filePaths').value.trim().split('\n').filter(Boolean).length;
    document.getElementById('fileCount').textContent = count > 0 ? `(${count}개)` : '';
});
