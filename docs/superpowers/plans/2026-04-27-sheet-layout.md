# 시트 배치 (Sheet Layout) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주문서 페이지에서 AI/EPS 파일의 여러 디자인 요소를 출력기 롤 폭에 맞춰 자동 배치하고, IA PC에서 출력용 EPS + 재단용 EPS + JPG 3개 파일을 생성하는 기능 추가.

**Architecture:** 기존 ExtractGroups 분석 결과를 재활용하여 [품목 추출] / [시트 배치] 탭 전환 UI 추가. 프론트엔드에서 Shelf Best-Fit bin-packing 알고리즘으로 좌표 계산 + Canvas 미리보기. 확정 시 부모-자식 주문 라인 생성, 주문 저장 시 `mode: "sheet_layout"` auto_process_jobs 생성 → IA PC에서 SheetLayout.jsx 실행.

**Tech Stack:** Vanilla JS (bin-packing + Canvas), Hono route (orders/core.ts), Illustrator JSX

**설계 문서:** `docs/superpowers/specs/2026-04-27-sheet-layout-design.md`

---

## File Structure

| 파일 | 작업 | 역할 |
|------|------|------|
| `src/pages/orderForm.ts` | Modify (L106-133) | AI 분석 패널에 탭 UI HTML 추가 |
| `src/scripts/orderForm.js` | Modify (L1681-1843) | 시트 배치 탭 로직 + bin-packing + Canvas 미리보기 + 부모-���식 생성 |
| `src/routes/orders/core.ts` | Modify (L983-1068) | sheet_layout_params 분기 → auto_process_jobs INSERT |
| `src/routes/autoProcess.ts` | Modify (L177-193) | pending 폴링 시 ia_params 포함 확인 (변경 최소) |

> **IA PC 측** (`SheetLayout.jsx`, C# 분기)은 MES 구현 완료 후 별도 작업. 이 계획은 MES 측 (프론트엔드 + 백엔드)만 다룸.

---

## Task 1: orderForm.ts — 탭 UI HTML 추가

**Files:**
- Modify: `src/pages/orderForm.ts:106-133`

- [ ] **Step 1: AI 분석 패널에 탭 네비게이션 + 시트 배치 UI 추가**

`src/pages/orderForm.ts` Line 132 (`<div id="aiAnalysisStatus" ...></div>`) 바로 아래에 탭 영역을 추가한다.

```html
<!-- 분석 결과 탭 (분석 완료 후 표시) -->
<div id="aiResultTabs" class="hidden mt-3">
    <div class="flex border-b border-blue-300">
        <button type="button" onclick="switchAiTab('extract')" id="tabExtract"
            class="px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-700 bg-white rounded-t">
            <i class="fas fa-list mr-1"></i>품목 추출
        </button>
        <button type="button" onclick="switchAiTab('sheet')" id="tabSheet"
            class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-blue-400 hover:text-blue-600 rounded-t">
            <i class="fas fa-th mr-1"></i>시트 배치
        </button>
    </div>

    <!-- 시트 배치 탭 내용 -->
    <div id="sheetLayoutPanel" class="hidden bg-white border border-t-0 border-blue-200 rounded-b-lg p-4">
        <!-- 요소 목록 테이블 -->
        <div class="mb-4">
            <div class="text-sm font-medium text-gray-700 mb-2">추출된 요소</div>
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b text-gray-500">
                        <th class="text-left py-1 px-2">썸네일</th>
                        <th class="text-left py-1 px-2">크기 (cm)</th>
                        <th class="text-center py-1 px-2 w-20">수량</th>
                        <th class="text-right py-1 px-2">면적</th>
                    </tr>
                </thead>
                <tbody id="sheetElementsBody"></tbody>
            </table>
        </div>

        <!-- 롤 폭 + 재단 옵션 -->
        <div class="flex flex-wrap gap-4 items-end mb-4 p-3 bg-gray-50 rounded-lg">
            <div>
                <label class="block text-xs text-gray-500 mb-1">롤 폭</label>
                <select id="sheetRollWidth" onchange="onSheetSettingsChange()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="105">105 cm</option>
                    <option value="127">127 cm</option>
                    <option value="137">137 cm</option>
                    <option value="152">152 cm</option>
                </select>
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">재단선</label>
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" id="sheetCutMarks" checked onchange="onSheetSettingsChange()" class="accent-blue-600">
                    추가 (+3cm 여백)
                </label>
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">배치 가능 영역</label>
                <div id="sheetAvailableWidth" class="text-lg font-bold text-blue-600">124 cm</div>
            </div>
            <div id="sheetRecommendation" class="text-xs text-green-600"></div>
        </div>

        <button type="button" onclick="calculateAndPreviewSheet()" class="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 mb-4">
            <i class="fas fa-th mr-1"></i> 배치 미리보기
        </button>

        <!-- 미리보기 캔버스 -->
        <div id="sheetPreviewArea" class="hidden">
            <div class="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-3">
                <canvas id="sheetCanvas" class="w-full" style="max-height:400px;"></canvas>
            </div>
            <div id="sheetStats" class="flex gap-4 text-sm text-gray-600 mb-4"></div>
            <div class="flex gap-3">
                <button type="button" onclick="resetSheetPreview()" class="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                    <i class="fas fa-arrow-left mr-1"></i> 수량/폭 수정
                </button>
                <button type="button" onclick="confirmSheetLayout()" class="flex-[2] py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
                    <i class="fas fa-check mr-1"></i> 확정 → 주문 라인에 추가
                </button>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/pages/orderForm.ts
git commit -m "feat: 주문서에 시트 배치 탭 HTML 추가"
```

---

## Task 2: orderForm.js — 탭 전환 + 시트 배치 요소 테이블

**Files:**
- Modify: `src/scripts/orderForm.js`

- [ ] **Step 1: 탭 전환 함수 + 시트 배치 상태 변수 추가**

`src/scripts/orderForm.js` Line 1590 (`var AI_CHUNK_SIZE = ...`) 아래에 추가:

```javascript
// ── 시트 배치 상태 ──
var sheetLayoutGroups = null;       // 분석된 그룹 배열
var sheetLayoutResult = null;       // bin-packing 결과
var sheetQuantities = {};           // { groupIndex: count }

window.switchAiTab = function(tab) {
    var tabExtract = document.getElementById('tabExtract');
    var tabSheet = document.getElementById('tabSheet');
    var sheetPanel = document.getElementById('sheetLayoutPanel');
    var activeClass = 'border-blue-600 text-blue-700 bg-white';
    var inactiveClass = 'border-transparent text-blue-400 hover:text-blue-600';

    if (tab === 'sheet') {
        tabExtract.className = tabExtract.className.replace(activeClass, inactiveClass);
        tabSheet.className = tabSheet.className.replace(inactiveClass, activeClass);
        sheetPanel.classList.remove('hidden');
        if (sheetLayoutGroups) populateSheetElements(sheetLayoutGroups);
    } else {
        tabSheet.className = tabSheet.className.replace(activeClass, inactiveClass);
        tabExtract.className = tabExtract.className.replace(inactiveClass, activeClass);
        sheetPanel.classList.add('hidden');
    }
};
```

- [ ] **Step 2: 요소 테이블 렌더링 함수 추가**

위 코드 바로 아래에:

```javascript
function populateSheetElements(groups) {
    var body = document.getElementById('sheetElementsBody');
    if (!body) return;
    body.innerHTML = '';
    var COLORS = ['#3b82f6','#22c55e','#f59e0b','#a855f7','#ef4444','#06b6d4','#ec4899','#84cc16'];
    groups.forEach(function(g, i) {
        var wCm = (g.width_mm / 10).toFixed(1);
        var hCm = (g.height_mm / 10).toFixed(1);
        var qty = sheetQuantities[i] || 1;
        var area = (wCm * hCm * qty).toFixed(0);
        var color = COLORS[i % COLORS.length];
        var thumbHtml = g.thumbnail_base64
            ? '<img src="data:image/png;base64,' + g.thumbnail_base64 + '" class="w-12 h-8 object-contain rounded border">'
            : '<div class="w-12 h-8 rounded border flex items-center justify-center text-xs font-bold" style="background:' + color + '20;color:' + color + ';border-color:' + color + '">' + String.fromCharCode(65 + i) + '</div>';
        body.insertAdjacentHTML('beforeend',
            '<tr class="border-b border-gray-100">'
            + '<td class="py-2 px-2">' + thumbHtml + '</td>'
            + '<td class="py-2 px-2 text-gray-700">' + wCm + ' × ' + hCm + '</td>'
            + '<td class="py-2 px-2 text-center">'
            +   '<input type="number" min="1" max="99" value="' + qty + '" data-group-index="' + i + '"'
            +   ' onchange="onSheetQtyChange(this)" class="w-14 text-center border border-gray-300 rounded px-1 py-1 text-sm">'
            + '</td>'
            + '<td class="py-2 px-2 text-right text-gray-500">' + Number(area).toLocaleString() + ' cm²</td>'
            + '</tr>'
        );
    });
    onSheetSettingsChange();
}

window.onSheetQtyChange = function(el) {
    var idx = parseInt(el.dataset.groupIndex);
    sheetQuantities[idx] = Math.max(1, parseInt(el.value) || 1);
    updateSheetAreaDisplay();
};

function updateSheetAreaDisplay() {
    var rows = document.querySelectorAll('#sheetElementsBody tr');
    rows.forEach(function(row) {
        var input = row.querySelector('input[data-group-index]');
        if (!input) return;
        var idx = parseInt(input.dataset.groupIndex);
        var g = sheetLayoutGroups[idx];
        var qty = sheetQuantities[idx] || 1;
        var area = ((g.width_mm / 10) * (g.height_mm / 10) * qty).toFixed(0);
        var areaCell = row.querySelector('td:last-child');
        if (areaCell) areaCell.textContent = Number(area).toLocaleString() + ' cm²';
    });
}
```

- [ ] **Step 3: 분석 완료 시 탭 표시 + 그룹 저장**

`startAnalysisPolling()` 함수 내부 (Line ~1700, `window._lastAnalysisGroups = groups;` 아래)에 시트 배치용 그룹 저장 및 탭 표시 로직을 추가:

```javascript
// 기존 코드: window._lastAnalysisGroups = groups; 아래에 추가
sheetLayoutGroups = groups;
sheetQuantities = {};
groups.forEach(function(_, i) { sheetQuantities[i] = 1; });
document.getElementById('aiResultTabs').classList.remove('hidden');
```

- [ ] **Step 4: 롤 폭 ���경 + 자동 추천 함수**

```javascript
window.onSheetSettingsChange = function() {
    var rollWidth = parseInt(document.getElementById('sheetRollWidth').value);
    var cutMarks = document.getElementById('sheetCutMarks').checked;
    var available = cutMarks ? rollWidth - 3 : rollWidth;
    document.getElementById('sheetAvailableWidth').textContent = available + ' cm';

    // 자동 추천
    if (sheetLayoutGroups) {
        var rec = recommendRollWidth(sheetLayoutGroups, sheetQuantities, cutMarks);
        var recDiv = document.getElementById('sheetRecommendation');
        if (rec) {
            recDiv.textContent = '✓ 추천: ' + rec.roll + 'cm (효율 ' + rec.efficiency.toFixed(1) + '%)';
            recDiv.className = 'text-xs text-green-600';
        } else {
            recDiv.textContent = '';
        }
    }

    // 미리보기가 이미 있으면 리셋
    resetSheetPreview();
};
```

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add src/scripts/orderForm.js
git commit -m "feat: 시트 배치 탭 전환 + 요소 테이블 렌더링"
```

---

## Task 3: orderForm.js — Bin-Packing 알고리즘 + 롤 폭 추천

**Files:**
- Modify: `src/scripts/orderForm.js`

- [ ] **Step 1: Shelf Best-Fit bin-packing 알고리즘 구현**

Task 2에서 추가한 시트 배치 코드 블록 아래에 추가:

```javascript
// ── Bin-Packing: Shelf Best-Fit with Rotation ──
function shelfBinPack(items, availableWidth) {
    // items: [{ groupIndex, w, h }] (count로 펼친 후)
    // 면적 기준 내림차순 정렬
    var sorted = items.slice().sort(function(a, b) { return (b.w * b.h) - (a.w * a.h); });

    var shelves = []; // [{ y, height, usedWidth, items:[] }]

    for (var i = 0; i < sorted.length; i++) {
        var item = sorted[i];
        var placed = false;

        // 기존 shelf에 넣을 수 있는지 확인
        for (var s = 0; s < shelves.length; s++) {
            var shelf = shelves[s];

            // 원래 방향
            if (shelf.usedWidth + item.w <= availableWidth + 0.01) {
                shelf.items.push({
                    groupIndex: item.groupIndex,
                    x: shelf.usedWidth,
                    y: shelf.y,
                    w: item.w,
                    h: item.h,
                    rotated: false
                });
                shelf.usedWidth += item.w;
                shelf.height = Math.max(shelf.height, item.h);
                placed = true;
                break;
            }

            // 90도 회전
            if (shelf.usedWidth + item.h <= availableWidth + 0.01) {
                shelf.items.push({
                    groupIndex: item.groupIndex,
                    x: shelf.usedWidth,
                    y: shelf.y,
                    w: item.h,
                    h: item.w,
                    rotated: true
                });
                shelf.usedWidth += item.h;
                shelf.height = Math.max(shelf.height, item.w);
                placed = true;
                break;
            }
        }

        if (!placed) {
            // 새 shelf 생성
            var shelfY = 0;
            for (var s2 = 0; s2 < shelves.length; s2++) {
                shelfY += shelves[s2].height;
            }

            // 원래 방향으로 들어가는지 확인
            if (item.w <= availableWidth + 0.01) {
                var newShelf = { y: shelfY, height: item.h, usedWidth: item.w, items: [{
                    groupIndex: item.groupIndex, x: 0, y: shelfY, w: item.w, h: item.h, rotated: false
                }]};
                shelves.push(newShelf);
            } else if (item.h <= availableWidth + 0.01) {
                // 회전해서 넣기
                var newShelf2 = { y: shelfY, height: item.w, usedWidth: item.h, items: [{
                    groupIndex: item.groupIndex, x: 0, y: shelfY, w: item.h, h: item.w, rotated: true
                }]};
                shelves.push(newShelf2);
            } else {
                // 어떤 방향으로도 안 들어감
                return { error: true, errorItem: item, errorMsg: '요소 ' + String.fromCharCode(65 + item.groupIndex) + ' (' + item.w.toFixed(1) + '×' + item.h.toFixed(1) + 'cm)가 롤 폭보다 큽니다.' };
            }
        }
    }

    // 결과 조합
    var placements = [];
    var totalHeight = 0;
    var totalItemArea = 0;
    var rotatedCount = 0;
    shelves.forEach(function(shelf) {
        totalHeight += shelf.height;
        shelf.items.forEach(function(it) {
            placements.push({
                group_index: it.groupIndex,
                x_cm: it.x,
                y_cm: it.y,
                width_cm: it.w,
                height_cm: it.h,
                rotated: it.rotated
            });
            totalItemArea += it.w * it.h;
            if (it.rotated) rotatedCount++;
        });
    });

    var totalArea = availableWidth * totalHeight;
    var efficiency = totalArea > 0 ? (totalItemArea / totalArea * 100) : 0;

    return {
        error: false,
        placements: placements,
        total_width_cm: availableWidth,
        total_height_cm: totalHeight,
        efficiency: efficiency,
        rotated_count: rotatedCount,
        total_items: placements.length
    };
}
```

- [ ] **Step 2: 롤 폭 자동 추천 함수**

```javascript
function recommendRollWidth(groups, quantities, cutMarks) {
    var ROLLS = [105, 127, 137, 152];
    var candidates = [];

    // 요소 펼치기
    var items = [];
    groups.forEach(function(g, i) {
        var count = quantities[i] || 1;
        for (var c = 0; c < count; c++) {
            items.push({ groupIndex: i, w: g.width_mm / 10, h: g.height_mm / 10 });
        }
    });

    ROLLS.forEach(function(roll) {
        var available = cutMarks ? roll - 3 : roll;
        var result = shelfBinPack(items, available);
        if (!result.error) {
            candidates.push({
                roll: roll,
                efficiency: result.efficiency,
                total_height: result.total_height_cm
            });
        }
    });

    if (candidates.length === 0) return null;

    // 효율 최고, 동률이면 길이 최소
    candidates.sort(function(a, b) {
        if (Math.abs(a.efficiency - b.efficiency) > 0.1) return b.efficiency - a.efficiency;
        return a.total_height - b.total_height;
    });

    return candidates[0];
}
```

- [ ] **Step 3: 미리보기 실행 함수**

```javascript
window.calculateAndPreviewSheet = function() {
    if (!sheetLayoutGroups || sheetLayoutGroups.length === 0) {
        showToast('분석된 요소가 없습니다.', 'warning');
        return;
    }

    var rollWidth = parseInt(document.getElementById('sheetRollWidth').value);
    var cutMarks = document.getElementById('sheetCutMarks').checked;
    var marginCm = cutMarks ? 1.5 : 0;
    var available = rollWidth - (marginCm * 2);

    // 요소 펼치기
    var items = [];
    sheetLayoutGroups.forEach(function(g, i) {
        var count = sheetQuantities[i] || 1;
        for (var c = 0; c < count; c++) {
            items.push({ groupIndex: i, w: g.width_mm / 10, h: g.height_mm / 10 });
        }
    });

    var result = shelfBinPack(items, available);
    if (result.error) {
        showToast(result.errorMsg, 'error');
        return;
    }

    // margin offset 적용 (배치 좌표에 여백 추가)
    if (marginCm > 0) {
        result.placements.forEach(function(p) {
            p.x_cm += marginCm;
        });
    }

    sheetLayoutResult = {
        placements: result.placements,
        total_width_cm: rollWidth,
        total_height_cm: result.total_height_cm,
        margin_cm: marginCm,
        efficiency: result.efficiency,
        rotated_count: result.rotated_count,
        total_items: result.total_items,
        cut_marks: cutMarks
    };

    renderSheetCanvas(sheetLayoutResult, rollWidth);
    showSheetStats(sheetLayoutResult);
    document.getElementById('sheetPreviewArea').classList.remove('hidden');
};

window.resetSheetPreview = function() {
    sheetLayoutResult = null;
    document.getElementById('sheetPreviewArea').classList.add('hidden');
};
```

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/scripts/orderForm.js
git commit -m "feat: 시트 배치 bin-packing 알고리즘 + 롤 폭 자동 추천"
```

---

## Task 4: orderForm.js — Canvas 미리보기 렌더링

**Files:**
- Modify: `src/scripts/orderForm.js`

- [ ] **Step 1: Canvas 렌더링 함수**

```javascript
function renderSheetCanvas(result, rollWidth) {
    var canvas = document.getElementById('sheetCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var COLORS = ['#3b82f6','#22c55e','#f59e0b','#a855f7','#ef4444','#06b6d4','#ec4899','#84cc16'];

    // 캔버스 크기 계산 (비율 유지, 최대 너비 기반)
    var containerWidth = canvas.parentElement.clientWidth - 32;
    var scale = containerWidth / rollWidth;
    var canvasHeight = Math.max(result.total_height_cm * scale + 40, 100);

    canvas.width = containerWidth;
    canvas.height = canvasHeight;
    canvas.style.height = canvasHeight + 'px';

    // 배경
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 여백 영역
    if (result.margin_cm > 0) {
        var marginPx = result.margin_cm * scale;
        ctx.fillStyle = '#fef2f2';
        ctx.fillRect(0, 0, marginPx, canvasHeight);
        ctx.fillRect(containerWidth - marginPx, 0, marginPx, canvasHeight);

        // 여백 라벨
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(result.margin_cm + 'cm', marginPx / 2, 12);
        ctx.fillText(result.margin_cm + 'cm', containerWidth - marginPx / 2, 12);
    }

    // 배치 요소 그리기
    result.placements.forEach(function(p) {
        var x = p.x_cm * scale;
        var y = p.y_cm * scale + 20; // 상단 여백
        var w = p.width_cm * scale;
        var h = p.height_cm * scale;
        var color = COLORS[p.group_index % COLORS.length];

        // 채우기
        ctx.fillStyle = color + '25';
        ctx.fillRect(x, y, w, h);

        // 테두리
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);

        // 라벨
        ctx.fillStyle = color;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var label = String.fromCharCode(65 + p.group_index);
        if (p.rotated) label += ' ↻';
        ctx.fillText(label, x + w / 2, y + h / 2);

        // 크기 텍스트
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#64748b';
        var sizeText = p.width_cm.toFixed(1) + '×' + p.height_cm.toFixed(1);
        ctx.fillText(sizeText, x + w / 2, y + h / 2 + 12);
    });

    // 롤 폭 라벨
    ctx.fillStyle = '#475569';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('롤 폭 ' + rollWidth + 'cm', containerWidth / 2, canvasHeight - 5);
}

function showSheetStats(result) {
    var statsDiv = document.getElementById('sheetStats');
    if (!statsDiv) return;
    statsDiv.innerHTML =
        '<div class="flex-1 p-2 bg-white rounded border text-center">'
        + '<div class="text-xs text-gray-500">총 요소</div>'
        + '<div class="text-lg font-bold">' + result.total_items + '개</div></div>'
        + '<div class="flex-1 p-2 bg-white rounded border text-center">'
        + '<div class="text-xs text-gray-500">배치 크기</div>'
        + '<div class="text-lg font-bold text-blue-600">' + result.total_width_cm + ' × ' + result.total_height_cm.toFixed(1) + ' cm</div></div>'
        + '<div class="flex-1 p-2 bg-white rounded border text-center">'
        + '<div class="text-xs text-gray-500">효율</div>'
        + '<div class="text-lg font-bold text-green-600">' + result.efficiency.toFixed(1) + '%</div></div>'
        + (result.rotated_count > 0 ?
            '<div class="flex-1 p-2 bg-white rounded border text-center">'
            + '<div class="text-xs text-gray-500">회전</div>'
            + '<div class="text-lg font-bold text-purple-600">' + result.rotated_count + '개</div></div>'
            : '');
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/scripts/orderForm.js
git commit -m "feat: 시트 배치 Canvas 미리보기 렌더링"
```

---

## Task 5: orderForm.js — 확정 → 부모-자식 주문 라인 생성

**Files:**
- Modify: `src/scripts/orderForm.js`

- [ ] **Step 1: confirmSheetLayout 함수 구현**

```javascript
window.confirmSheetLayout = function() {
    if (!sheetLayoutResult || !sheetLayoutGroups) {
        showToast('먼저 배치 미리보기를 실행하세요.', 'warning');
        return;
    }

    removeEmptyItemRows();

    // 부모 행 추가
    var childCount = sheetLayoutGroups.length;
    var parentId = addParentItemRow(childCount);

    // ���모 행에 배치 결과 크기 설정
    var wEl = document.querySelector('[name="width_' + parentId + '"]');
    var hEl = document.querySelector('[name="height_' + parentId + '"]');
    if (wEl) wEl.value = sheetLayoutResult.total_width_cm;
    if (hEl) hEl.value = sheetLayoutResult.total_height_cm.toFixed(1);

    // 부모 행에 sheet_layout_params hidden field 추가
    var parentRow = document.getElementById('item-' + parentId);
    if (parentRow) {
        var hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'sheet_layout_params_' + parentId;
        hiddenInput.value = JSON.stringify({
            mode: 'sheet_layout',
            roll_width_cm: sheetLayoutResult.total_width_cm,
            total_height_cm: sheetLayoutResult.total_height_cm,
            margin_cm: sheetLayoutResult.margin_cm,
            cut_marks: sheetLayoutResult.cut_marks,
            placements: sheetLayoutResult.placements
        });
        parentRow.appendChild(hiddenInput);
    }

    // 부모 행 수량 = 1
    var qtyEl = document.querySelector('[name="quantity_' + parentId + '"]');
    if (qtyEl) qtyEl.value = '1';

    // 자식 행 추가 (그룹별)
    sheetLayoutGroups.forEach(function(group, i) {
        addChildItemRow(parentId, group);
        // 마지막 추가된 자식 행의 수량 설정
        var childRows = document.querySelectorAll('[data-parent-row="' + parentId + '"]');
        var lastChild = childRows[childRows.length - 1];
        if (lastChild) {
            var childId = lastChild.querySelector('[name^="is_child_"]')?.name?.replace('is_child_', '');
            if (childId) {
                var childQtyEl = lastChild.querySelector('[name="child_qty_' + childId + '"]');
                if (childQtyEl) childQtyEl.value = sheetQuantities[i] || 1;
            }
        }
    });

    calcItem(parentId);
    calculateTotal();

    // 시트 배치 UI 정리
    document.getElementById('aiResultTabs').classList.add('hidden');
    var statusDiv = document.getElementById('aiAnalysisStatus');
    if (statusDiv) {
        statusDiv.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i>'
            + ' 시트 배치 확정: ' + sheetLayoutResult.total_items + '개 요소 → '
            + sheetLayoutResult.total_width_cm + '×' + sheetLayoutResult.total_height_cm.toFixed(1) + 'cm';
    }

    showToast('시트 배치가 주문 라인에 추가되었습니다.', 'success');
};
```

- [ ] **Step 2: 주문 제출 시 sheet_layout_params 수집**

주문 제출 핸들러 (Line ~1144, 일반/부모 행 처리 부분)에서 `sheet_layout_params` hidden field를 읽어 item 데이터에 추가한다.

`src/scripts/orderForm.js` Line ~1300 근처, `client_group_id` 추가 부분 (`items.push({...})` 직전)에 `sheet_layout_params` 필드를 추가:

기존의 items.push 객체에 필드 추가:
```javascript
// 기존 items.push({...}) 객체 내부에 추가
sheet_layout_params: (function() {
    var el = document.querySelector('[name="sheet_layout_params_' + id + '"]');
    return el ? el.value : null;
})(),
```

이 필드를 items.push 객체의 `client_group_id` 바로 위에 추가한다.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add src/scripts/orderForm.js
git commit -m "feat: 시트 배치 확정 → 부모-자식 주문 라인 생성 + 제출 시 params 수집"
```

---

## Task 6: orders/core.ts — sheet_layout auto_process_jobs 생성

**Files:**
- Modify: `src/routes/orders/core.ts:983-1068`

- [ ] **Step 1: auto_process_jobs 생성 로직에 sheet_layout 분기 추가**

`src/routes/orders/core.ts` Line 985 (`if (aiAnalysisId) {`) 블록 내부, Line 991 (`const groups = ...`) 아래에 시트 배치 분기를 추가한다.

기존 Line 992 (`const aiItems = ...`) 위에 삽입:

```typescript
// ── 시트 배치 모드 체크 ──
const sheetLayoutItem = (orderItems as any[]).find(
  (oi: any) => oi.sheet_layout_params && !oi.parent_item_id
)
if (sheetLayoutItem) {
  // sheet_layout 모드: 부모 item 기준으로 1개 job 생성
  const layoutParams = JSON.parse(sheetLayoutItem.sheet_layout_params)
  const ts = Date.now()
  const outputDir = 'Z:\\Designs\\IllustratorAutomat\\_auto_output'
  const srcBase = (analysis.file_path || 'output').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'output'

  const iaParams = {
    mode: 'sheet_layout',
    source: analysis.file_path,
    canvas: {
      width_cm: layoutParams.roll_width_cm,
      height_cm: layoutParams.total_height_cm,
      margin_cm: layoutParams.margin_cm,
    },
    placements: layoutParams.placements,
    outputs: {
      print_eps: `${outputDir}\\${srcBase}_print_${ts}.eps`,
      cut_eps: `${outputDir}\\${srcBase}_cut_${ts}.eps`,
      jpg: `${outputDir}\\${srcBase}_preview_${ts}.jpg`,
    },
  }

  await c.env.DB.prepare(
    `INSERT INTO auto_process_jobs
     (order_id, order_item_id, ai_analysis_id, ai_group_index,
      source_path, product, width_cm, height_cm, finishing,
      scale_factor, clip_bounds, margins, status, ia_params)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(
    orderId, sheetLayoutItem.id, aiAnalysisId, -1,
    analysis.file_path, '시트배치', layoutParams.roll_width_cm, layoutParams.total_height_cm, '',
    1, null, null, JSON.stringify(iaParams)
  ).run()

  autoProcessStarted = true
} else {
  // 기존 개별 가공 모드 (아래 기존 코드 그대로)
```

기존 Line 1063 (`if (aiItems.length > 0) autoProcessStarted = true`) 아래, Line 1064 (`} catch`) 위에 닫는 중괄호 추가:

```typescript
} // else (기존 개별 가공 모드) 닫기
```

- [ ] **Step 2: order_items INSERT에 sheet_layout_params 저장**

`src/routes/orders/core.ts` 품목 삽입 로직 (Line ~638-699)에서 `sheet_layout_params`를 받아 저장한다. order_items 테이블에 이 컬럼이 없으므로, 대신 `notes` 또는 별도 처리 없이 **메모리에서만 사용**한다.

실제로는 orderItems 배열에 `sheet_layout_params`를 그대로 유지하면 된다. 서버 측에서는 이미 `const orderData = await c.req.json()` (Line 511)으로 전체 데이터를 받고, `orderData.items`에 `sheet_layout_params`가 포함되어 있다. 이 값은 Line 985 이후의 auto_process_jobs 생성 로직에서 `orderItems`를 통해 접근한다.

`orderItems` 배열에 `sheet_layout_params`를 매핑해야 한다. 품목 INSERT 로직 (Line ~638)에서 `sheet_layout_params`는 DB에 저장하지 않지만, `orderItems` 배열의 각 요소에 원본 item 데이터의 `sheet_layout_params`를 보존해야 한다.

기존 orderItems 구성 방식을 확인한다. 현재 orderItems는 INSERT 후 `lastRowId`와 함께 배열에 push되는 구조다. 이 push 시 `sheet_layout_params`도 포함시킨다:

```typescript
// 기존 orderItems.push({...}) 에 추가:
sheet_layout_params: item.sheet_layout_params || null,
```

- [ ] **Step 3: 타입 체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 4: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/routes/orders/core.ts
git commit -m "feat: 시트 배치 모드 auto_process_jobs 생성 분기"
```

---

## Task 7: 통합 테스트 + 브라우저 검증

**Files:** (변경 없음, 검증만)

- [ ] **Step 1: 빌드 + 서버 시작**

Run: `npm run build`
Run: (별도 터미널) `npm run dev:d1`

- [ ] **Step 2: 브라우저 검증 — 탭 전환**

`http://192.168.0.94:3000/order-form` 접속:
1. AI 파일 경로 입력 + [그룹 분석] 클릭
2. 분석 완료 후 [품목 추출] / [시트 배치] 탭 표시 확인
3. 탭 전환 시 패널 표시/숨김 확인

- [ ] **Step 3: 브라우저 검증 — 시트 배치 설정**

[시트 배치] 탭에서:
1. 추출된 요소 목록 + 썸네일 표시 확인
2. 수량 변경 → 면적 업데이트 확인
3. 롤 폭 변경 → 배치 가능 영역 업데이트 확인
4. 자동 추천 표시 확인
5. 재단선 체크/해제 → 배치 가능 영역 변경 확인

- [ ] **Step 4: 브라우저 검증 — 미리보기**

[배치 미리보기] 클릭:
1. Canvas에 배치 결과 렌더링 확인
2. 요소별 색상 구분 + 라벨 표시 확인
3. 회전된 요소 ↻ 표시 확인
4. 여��� 영역 표시 확인
5. 통계 (총 요소, 배치 크기, 효율, 회전) 표시 확인

- [ ] **Step 5: 브라우저 검증 — 확정 + 주문 저장**

[확정] 클릭:
1. 부모-자식 주문 라인 생성 확인
2. 부모 행: 전체 크기 (롤 폭 × 총 길이) 확인
3. 자식 행: 각 요소별 크기 + 수량 확인
4. 주문 저장 → auto_process_jobs 생성 확인 (DB 직접 확인)

- [ ] **Step 6: 기존 기능 회귀 테스트**

1. [품목 추출] 탭으로 전환 → 기존 개별행/묶음 품목 생성 정상 동작 확인
2. AI 파일 없이 일반 주문 등록 → 시트 배치 UI 미표시 확인
3. 기존 자동가공 (mode: "process") 정상 동작 확인

- [ ] **Step 7: 최종 커밋 (필요 시)**

```bash
git add -A
git commit -m "fix: 시트 배치 통합 테스트 수정사항"
```

---

## 구현 범위 외 (후속 작업)

| 항목 | 설명 |
|------|------|
| **SheetLayout.jsx** | IA PC에서 실행할 JSX 스크립트 신규 작성 |
| **C# 분기** | IllustratorAutomat.exe에서 `mode === "sheet_layout"` 분기 추가 |
| **돔보 마크** | JSX 내부에서 레지스트레이션 마크 생성 로직 |
| **재단용 EPS** | JSX에서 디자인 레이어 삭제 + 외곽선 인쇄 OFF 처리 |
