# OFFSET/BLEED 통합 + 시트배치 도련 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OFFSET/BLEED를 통합하고, 같은 edge_strip 기법을 시트배치(SheetLayout.jsx)에 적용. 디자이너가 시트 미리보기에서 간격/회전을 인터랙티브하게 제어.

**Architecture:** Phase 1: ProcessOrderItem.jsx에서 createEdgeStrip 함수 확립 + OFFSET/BLEED 병합. Phase 2: 같은 createEdgeStrip을 SheetLayout.jsx에 복사, 캔버스 인터랙션 UI(간격 토글+180° 회전), Program.cs gaps/rotated_180 전달.

**Tech Stack:** Illustrator ExtendScript (JSX), Vanilla JS, C# (.NET 8), SQLite

---

## 파일 구조

```
수정:
  IllustratorAutomat/ProcessOrderItem.jsx     — OFFSET 분기에 edge_strip method 추가
  IllustratorAutomat/Program.cs               — BLEED 파싱 제거, OFFSET method 추가
  src/scripts/orderForm.js                    — BLEED UI 제거, OFFSET UI 확장
  migrations/0166_bleed_post_processing.sql   — BLEED → OFFSET 통합 마이그레이션으로 변경
```

---

### Task 1: ProcessOrderItem.jsx — OFFSET에 edge_strip method 통합

**Files:**
- Modify: `IllustratorAutomat/ProcessOrderItem.jsx`

현재 OFFSET(step 5b)은 scale+duplicate 방식만 사용. `method: "edge_strip"` 시 현재 BLEED(step 2b)의 에지 스트립 기법을 사용하도록 통합.

- [ ] **Step 1: BLEED 섹션(step 2b)을 함수로 추출**

현재 step 2b의 `createEdgeStrip` 함수와 관련 로직을 OFFSET 섹션에서도 호출할 수 있도록, 이미 함수화되어 있는 `createEdgeStrip`을 step 5b에서도 접근 가능하게 한다. 현재 `createEdgeStrip`은 `if (bleedMm > 0)` 블록 안에 정의되어 있으므로 바깥으로 이동.

`ProcessOrderItem.jsx`에서 `createEdgeStrip` 함수를 `if (bleedMm > 0)` 블록 바깥, `main()` 함수 스코프 최상단으로 이동:

```javascript
// main() 함수 안, 상수 정의 직후 (ptPerMm, mmPerPt 뒤)에 배치:

function createEdgeStrip(targetLayer, items, oL, oT, oR, oB, direction, edgeBleedPt, ptPerMm, mmPerPt) {
    if (edgeBleedPt <= 0) return;
    var stripPt = 1.0 * ptPerMm;
    var sL, sT, sR, sB;
    if (direction === 'top')    { sL = oL; sT = oT;          sR = oR; sB = oT - stripPt; }
    if (direction === 'bottom') { sL = oL; sT = oB + stripPt; sR = oR; sB = oB; }
    if (direction === 'left')   { sL = oL; sT = oT;          sR = oL + stripPt; sB = oB; }
    if (direction === 'right')  { sL = oR - stripPt; sT = oT; sR = oR;          sB = oB; }

    var grp = targetLayer.groupItems.add();
    grp.name = "_bleed_" + direction;
    var cr = grp.pathItems.add();
    cr.setEntirePath([[sL, sT], [sR, sT], [sR, sB], [sL, sB]]);
    cr.closed = true; cr.clipping = true;
    cr.filled = false; cr.stroked = false;

    for (var di = items.length - 1; di >= 0; di--) {
        try { items[di].duplicate(grp, ElementPlacement.PLACEATEND); } catch(e) {}
    }
    grp.clipped = true;

    var scX = 100, scY = 100;
    if (direction === 'top' || direction === 'bottom') {
        scY = (edgeBleedPt / stripPt) * 100;
    } else {
        scX = (edgeBleedPt / stripPt) * 100;
    }
    grp.resize(scX, scY, true, true, true, true, scX);

    if (direction === 'top')    { grp.top = oT + edgeBleedPt; grp.left = oL; }
    if (direction === 'bottom') { grp.top = oB;               grp.left = oL; }
    if (direction === 'left')   { grp.left = oL - edgeBleedPt; grp.top = oT; }
    if (direction === 'right')  { grp.left = oR;               grp.top = oT; }

    $.writeln("ProcessOrderItem: edge_strip " + direction + " ("
        + Math.round(edgeBleedPt * mmPerPt) + "mm)");
}
```

- [ ] **Step 2: BLEED 섹션(step 2b) 제거**

기존 step 2b (`// ── 2b. 도련(bleed)` 전체 블록)를 삭제. `bleedCfg` 파라미터 읽기, `bleedMm`, `bT/bB/bL/bR` 변수, `tmpBleedLayer` 모두 제거.

단, `bT/bB/bL/bR` 변수는 step 4(여백 확장)와 step 9(PNG)에서 사용하므로, 이들을 OFFSET 섹션에서 설정하도록 이동 (Step 4에서 처리).

제거할 코드 범위: `var bleedCfg = _p.bleed || null;` 부터 step 2b 끝까지.

- [ ] **Step 3: OFFSET 섹션(step 5b)에 method 분기 추가**

현재 step 5b의 `if (hasOffset)` 블록을 수정. `offsetCfg.method`에 따라 분기:

```javascript
// ── 5b. 오프셋 — method에 따라 scale(기존) 또는 edge_strip(신규) ──
var tmpOffsetLayer = null;
var offT = 0, offB = 0, offL = 0, offR = 0;
var offsetMethod = 'scale'; // 기본값: 하위호환
var offsetCutLine = true;   // 기본값: 하위호환
if (offsetCfg) {
    offsetMethod = offsetCfg.method || 'scale';
    offsetCutLine = (offsetCfg.cut_line !== undefined) ? !!offsetCfg.cut_line : true;

    if (offsetCfg.offset_top !== undefined) {
        offT = (offsetCfg.offset_top || 0) / scaleFactor * ptPerMm;
        offB = (offsetCfg.offset_bottom || 0) / scaleFactor * ptPerMm;
        offL = (offsetCfg.offset_left || 0) / scaleFactor * ptPerMm;
        offR = (offsetCfg.offset_right || 0) / scaleFactor * ptPerMm;
    } else if (offsetCfg.offset_distance) {
        var d = offsetCfg.offset_distance / scaleFactor * ptPerMm;
        offT = offB = offL = offR = d;
    }
}
var hasOffset = (offT > 0 || offB > 0 || offL > 0 || offR > 0);

if (hasOffset) {
    $.writeln("ProcessOrderItem: 오프셋 method=" + offsetMethod
        + " cut_line=" + offsetCutLine
        + " T=" + Math.round(offT/ptPerMm) + " B=" + Math.round(offB/ptPerMm)
        + " L=" + Math.round(offL/ptPerMm) + " R=" + Math.round(offR/ptPerMm) + "mm");

    if (offsetMethod === 'edge_strip') {
        // ── edge_strip 방식: 가장자리 1mm 클리핑 → 스트레칭 ──
        tmpOffsetLayer = doc.layers.add();
        tmpOffsetLayer.name = "_tmp_offset_bleed_";
        tmpOffsetLayer.zOrder(ZOrderMethod.SENDTOBACK);

        var edgeItems = artboardTopItems[abIndex];
        createEdgeStrip(tmpOffsetLayer, edgeItems, oL, oT, oR, oB, 'top',    offT, ptPerMm, mmPerPt);
        createEdgeStrip(tmpOffsetLayer, edgeItems, oL, oT, oR, oB, 'bottom', offB, ptPerMm, mmPerPt);
        createEdgeStrip(tmpOffsetLayer, edgeItems, oL, oT, oR, oB, 'left',   offL, ptPerMm, mmPerPt);
        createEdgeStrip(tmpOffsetLayer, edgeItems, oL, oT, oR, oB, 'right',  offR, ptPerMm, mmPerPt);

        // 아트보드 오프셋만큼 확장
        var curRect = ab.artboardRect;
        ab.artboardRect = [curRect[0] - offL, curRect[1] + offT, curRect[2] + offR, curRect[3] - offB];
    } else {
        // ── scale 방식: 기존 복제 + 비대칭 확대 (하위호환) ──
        // (기존 코드 그대로 유지 — doc.selectObjectsOnActiveArtboard → duplicate → resize → translate)
        doc.artboards.setActiveArtboardIndex(abIndex);
        doc.selection = null;
        doc.selectObjectsOnActiveArtboard();

        var sel = doc.selection;
        if (sel && sel.length > 0) {
            var scX = (designW + offL + offR) / designW * 100;
            var scY = (designH + offT + offB) / designH * 100;
            var shiftX = (offR - offL) / 2;
            var shiftY = (offT - offB) / 2;

            for (var oi = 0; oi < sel.length; oi++) {
                try {
                    var parentName = '';
                    try { parentName = sel[oi].parent.name || ''; } catch(e) {}
                    if (parentName.indexOf('_tmp_') === 0) continue;
                    var dup = sel[oi].duplicate();
                    dup.zOrder(ZOrderMethod.SENDBACKWARD);
                    dup.resize(scX, scY, true, true, true, true, scX);
                    dup.translate(shiftX, shiftY);
                } catch(e) {}
            }
        }
        doc.selection = null;
    }

    // 재단선: cut_line=true 시에만 추가
    if (offsetCutLine) {
        if (!tmpOffsetLayer) {
            tmpOffsetLayer = doc.layers.add();
            tmpOffsetLayer.name = "_tmp_offset_cut_";
        }
        var cutColor = new CMYKColor();
        cutColor.cyan = 0; cutColor.magenta = 100;
        cutColor.yellow = 0; cutColor.black = 0;
        var cutRect = tmpOffsetLayer.pathItems.add();
        cutRect.setEntirePath([[oL, oT], [oR, oT], [oR, oB], [oL, oB]]);
        cutRect.closed = true;
        cutRect.filled = false;
        cutRect.stroked = true;
        cutRect.strokeColor = cutColor;
        cutRect.strokeWidth = 0.08;
    }

    app.redraw();
}

// 오프셋 값을 여백/PNG 계산에 반영 (edge_strip 방식 시)
// bT/bB/bL/bR은 제거된 BLEED 변수 대체
var bT = (offsetMethod === 'edge_strip') ? offT : 0;
var bB = (offsetMethod === 'edge_strip') ? offB : 0;
var bL = (offsetMethod === 'edge_strip') ? offL : 0;
var bR = (offsetMethod === 'edge_strip') ? offR : 0;
```

주의: `bT/bB/bL/bR`은 step 4(여백 확장)와 step 9(PNG 크기)에서 사용됨. edge_strip 방식일 때만 아트보드가 확장되므로 이 값들이 필요.

- [ ] **Step 4: 여백 확장과 PNG 크기에서 bT/bB/bL/bR 참조 확인**

step 4의 아트보드 확장:
```javascript
ab.artboardRect = [oL - bL - mL, oT + bT + mT, oR + bR + mR, oB - bB - mB];
```

step 9의 PNG 크기:
```javascript
var totalW = designW + bL + bR + mL + mR;
var totalH = designH + bT + bB + mT + mB;
```

이 코드는 `bT/bB/bL/bR`이 step 5b 이후에 정의되므로, **step 5b를 step 3 이전으로 이동하거나**, `bT/bB/bL/bR`의 사전 선언이 필요.

가장 깔끔한 해결: step 5b의 오프셋 값 계산 부분만 step 2b 위치(기존 BLEED 위치)로 이동. 실제 적용(에지 스트립 생성, 복제 등)은 step 5b에 유지.

```javascript
// step 2b 위치 (BLEED 제거 후):
// 오프셋 값 사전 계산 (step 5b에서 실제 적용, 여기서는 값만)
var offT = 0, offB = 0, offL = 0, offR = 0;
var offsetMethod = 'scale';
var offsetCutLine = true;
if (offsetCfg) {
    offsetMethod = offsetCfg.method || 'scale';
    offsetCutLine = (offsetCfg.cut_line !== undefined) ? !!offsetCfg.cut_line : true;
    if (offsetCfg.offset_top !== undefined) {
        offT = (offsetCfg.offset_top || 0) / scaleFactor * ptPerMm;
        offB = (offsetCfg.offset_bottom || 0) / scaleFactor * ptPerMm;
        offL = (offsetCfg.offset_left || 0) / scaleFactor * ptPerMm;
        offR = (offsetCfg.offset_right || 0) / scaleFactor * ptPerMm;
    } else if (offsetCfg.offset_distance) {
        var d = offsetCfg.offset_distance / scaleFactor * ptPerMm;
        offT = offB = offL = offR = d;
    }
}
var hasOffset = (offT > 0 || offB > 0 || offL > 0 || offR > 0);
var bT = (offsetMethod === 'edge_strip') ? offT : 0;
var bB = (offsetMethod === 'edge_strip') ? offB : 0;
var bL = (offsetMethod === 'edge_strip') ? offL : 0;
var bR = (offsetMethod === 'edge_strip') ? offR : 0;
```

- [ ] **Step 5: tmpBleedLayer 정리 제거**

step 11(정리)에서 `if (tmpBleedLayer)` 라인 제거. `tmpOffsetLayer`가 이미 edge_strip 레이어를 포함하므로 별도 정리 불필요.

- [ ] **Step 6: 디버그 로그 업데이트**

step 8 디버그 로그에서 `bleed=` 항목을 제거하고 offset에 method 추가:
```javascript
+ " offset=" + (hasOffset ? offsetMethod + " " + Math.round(offT/ptPerMm) + "mm" : "none")
```

- [ ] **Step 7: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 8: 커밋**

```bash
git add IllustratorAutomat/ProcessOrderItem.jsx
git commit -m "refactor: merge BLEED into OFFSET with method parameter (edge_strip/scale)"
```

---

### Task 2: Program.cs — BLEED 파싱 제거 + OFFSET method 추가

**Files:**
- Modify: `IllustratorAutomat/Program.cs`

- [ ] **Step 1: BLEED 파싱 코드 제거**

Program.cs에서 `bleedConfig` 관련 코드 제거:
- `object? bleedConfig = null;` 선언 제거
- `if (ppCode2 == "BLEED" && ...)` 블록 제거
- `bleedConfig == null` 자동 설정 블록 제거
- `bleed = bleedConfig` ia_params 전달 제거
- `if (bleedConfig != null) Console.WriteLine(...)` 로그 제거

- [ ] **Step 2: OFFSET 파싱에 method/cut_line 추가**

기존 OFFSET 파싱 블록에서 method와 cut_line 읽기:

```csharp
if (ppCode2 == "OFFSET" && ppEntry.TryGetProperty("params", out var offsetParams))
{
    // 기존 4방향 오프셋 파싱 유지...
    
    // NEW: method 및 cut_line 파싱
    string method = "scale"; // 기본: 하위호환
    if (offsetParams.TryGetProperty("method", out var methodEl) && methodEl.ValueKind == JsonValueKind.String)
        method = methodEl.GetString() ?? "scale";
    
    bool cutLine = true; // 기본: 하위호환
    if (offsetParams.TryGetProperty("cut_line", out var clEl))
        cutLine = clEl.ValueKind != JsonValueKind.False;
    
    offsetConfig = new
    {
        offset_top = oTop,
        offset_bottom = oBottom,
        offset_left = oLeft,
        offset_right = oRight,
        method = method,
        cut_line = cutLine
    };
}
```

- [ ] **Step 3: 시트 카테고리 자동 OFFSET 설정**

기존 BLEED 자동 설정 코드를 OFFSET 자동 설정으로 변경:

```csharp
// OFFSET 자동 설정: 시트/전사/깃발 카테고리 + 명시적 OFFSET 없을 때
if (offsetConfig == null)
{
    string catLower = category.ToLowerInvariant();
    bool isSheetType = catLower.Contains("시트") || catLower.Contains("sheet")
        || catLower.Contains("전사") || catLower.Contains("transfer")
        || catLower.Contains("깃발") || catLower.Contains("태극기") || catLower.Contains("flag")
        || catLower.Contains("간판") || catLower.Contains("sign");
    if (isSheetType)
    {
        offsetConfig = new { 
            offset_top = 3.0, offset_bottom = 3.0, 
            offset_left = 3.0, offset_right = 3.0,
            method = "edge_strip", cut_line = false 
        };
        Console.WriteLine($"      🔲 도련 자동 설정: 3mm edge_strip (카테고리: {category})");
    }
}
```

- [ ] **Step 4: ia_params.json에서 bleed 제거 확인**

ia_params 생성 코드에서 `bleed = bleedConfig` 줄 제거. `offset = offsetConfig`는 유지 (이미 method/cut_line 포함).

- [ ] **Step 5: 빌드 검증**

```bash
cd IllustratorAutomat && dotnet build
```

- [ ] **Step 6: 커밋**

```bash
git add IllustratorAutomat/Program.cs
git commit -m "refactor: merge BLEED into OFFSET in Program.cs, auto edge_strip for sheet categories"
```

---

### Task 3: orderForm.js — BLEED UI 제거 + OFFSET UI 확장

**Files:**
- Modify: `src/scripts/orderForm.js`

- [ ] **Step 1: BLEED 섹션 HTML 생성 제거**

`// --- Section 2.7: Bleed (도련) checkbox ---` 전체 블록 삭제 (약 25줄).

- [ ] **Step 2: BLEED 이벤트 핸들러 제거**

`// Bleed checkbox` 블록 삭제 (bleedCheck addEventListener, 약 6줄).

- [ ] **Step 3: BLEED 데이터 수집 제거**

`// 5. Bleed (도련)` 블록 삭제 (bleedCheck2, bleedSection, 약 15줄).

- [ ] **Step 4: BLEED 복원 로직 제거**

`} else if (code === 'BLEED') {` 블록 삭제 (약 12줄).

- [ ] **Step 5: bleedOpt 변수 제거**

`const bleedOpt = options.find(...)` 줄 삭제.

- [ ] **Step 6: OFFSET UI에 method/cut_line 옵션 추가**

기존 OFFSET 섹션의 4방향 입력 뒤에 추가:

```javascript
// 기존 offset 입력들 뒤, </div> 닫기 전에 추가:
html += '<div class="flex gap-4 mt-2">';
html += '<label class="flex items-center gap-1.5 text-sm">';
html += '<span class="text-xs text-gray-600">확장 방식:</span>';
html += '<select class="pp-offset-method border rounded px-2 py-1 text-xs" data-row="' + rowId + '">';
html += '<option value="edge_strip">가장자리(도련)</option>';
html += '<option value="scale">스케일(다이컷)</option>';
html += '</select></label>';
html += '<label class="flex items-center gap-1.5 text-sm">';
html += '<input type="checkbox" class="pp-offset-cutline h-4 w-4" data-row="' + rowId + '" checked>';
html += '<span class="text-xs text-gray-600">재단선(M100)</span>';
html += '</label>';
html += '</div>';
```

`<p class="text-xs text-gray-400">` 설명 텍스트 업데이트:
```javascript
html += '<p class="text-xs text-gray-400 mt-1">가장자리: 에지 1mm 스트립 확장 (도련용). 스케일: 전체 비례 확대 (다이컷용).</p>';
```

- [ ] **Step 7: OFFSET 데이터 수집에 method/cut_line 추가**

기존 offset 데이터 수집 코드에서 params에 method/cut_line 추가:

```javascript
// 기존:
params: { offset_top: oTop, offset_bottom: oBottom, offset_left: oLeft, offset_right: oRight },

// 수정:
var methodSel = ppContainer.querySelector('.pp-offset-method');
var cutLineCb = ppContainer.querySelector('.pp-offset-cutline');
pp.push({
    ...
    params: { 
        offset_top: oTop, offset_bottom: oBottom, 
        offset_left: oLeft, offset_right: oRight,
        method: methodSel ? methodSel.value : 'edge_strip',
        cut_line: cutLineCb ? cutLineCb.checked : true
    },
    ...
});
```

- [ ] **Step 8: OFFSET 복원 로직에 method/cut_line 추가**

기존 OFFSET 복원 코드 뒤에:

```javascript
// method 복원
if (pp.params.method) {
    var mSel = container.querySelector('.pp-offset-method');
    if (mSel) mSel.value = pp.params.method;
}
// cut_line 복원
if (pp.params.cut_line !== undefined) {
    var clCb = container.querySelector('.pp-offset-cutline');
    if (clCb) clCb.checked = !!pp.params.cut_line;
}
```

- [ ] **Step 9: 정렬 순서에서 BLEED 제거**

```javascript
// 기존:
var order = { 'PUNCHING': 1, 'OFFSET': 2, 'BLEED': 3, 'ANNOTATION': 4 };
// 수정:
var order = { 'PUNCHING': 1, 'OFFSET': 2, 'ANNOTATION': 3 };
```

- [ ] **Step 10: 빌드 검증**

```bash
npm run verify
```

- [ ] **Step 11: 커밋**

```bash
git add src/scripts/orderForm.js
git commit -m "refactor: remove BLEED UI, add method/cut_line to OFFSET section"
```

---

### Task 4: 마이그레이션 수정

**Files:**
- Modify: `migrations/0166_bleed_post_processing.sql`
- Modify: `migrations/0167_print_media_subcategory.sql` (유지)

- [ ] **Step 1: 0166 마이그레이션을 OFFSET parameter_schema 업데이트로 변경**

기존 BLEED 옵션 INSERT를 OFFSET의 parameter_schema 업데이트로 교체:

```sql
-- 0166: OFFSET parameter_schema에 method/cut_line 필드 추가
-- BLEED는 OFFSET에 통합되었으므로 별도 옵션 불필요

UPDATE post_processing_options 
SET parameter_schema = '{"fields":[{"key":"offset_top","label":"상단(mm)","type":"number","default":3,"min":0,"max":20,"step":0.5},{"key":"offset_bottom","label":"하단(mm)","type":"number","default":3,"min":0,"max":20,"step":0.5},{"key":"offset_left","label":"좌측(mm)","type":"number","default":3,"min":0,"max":20,"step":0.5},{"key":"offset_right","label":"우측(mm)","type":"number","default":3,"min":0,"max":20,"step":0.5},{"key":"method","label":"확장방식","type":"select","options":["edge_strip","scale"],"default":"edge_strip"},{"key":"cut_line","label":"재단선(M100)","type":"boolean","default":true}]}'
WHERE option_code = 'OFFSET';

-- BLEED 옵션이 이미 존재하면 비활성화 (데이터 보존)
UPDATE post_processing_options SET is_active = 0 WHERE option_code = 'BLEED';
```

- [ ] **Step 2: 로컬 DB 마이그레이션 실행**

```bash
npm run db:migrate:local
```

- [ ] **Step 3: 커밋**

```bash
git add migrations/0166_bleed_post_processing.sql
git commit -m "refactor: merge BLEED into OFFSET schema, deactivate BLEED option"
```

---

---

## Phase 2: 시트배치 도련 (Task 5-8)

### Task 5: SheetLayout.jsx — createEdgeStrip 추가 + 외곽 도련

**Files:**
- Modify: `IllustratorAutomat/SheetLayout.jsx`

- [ ] **Step 1: createEdgeStrip 함수 추가**

SheetLayout.jsx 상단 (`var scaleFactor` 뒤)에 ProcessOrderItem.jsx에서 확립한 동일 함수 복사:

```javascript
// ── 에지 스트립 (도련/블리드 공통 함수) ──
function createEdgeStrip(targetLayer, items, oL, oT, oR, oB, direction, edgeBleedPt, ptPerMm) {
    if (edgeBleedPt <= 0) return;
    var stripPt = 1.0 * ptPerMm;
    var sL, sT, sR, sB;
    if (direction === 'top')    { sL = oL; sT = oT;          sR = oR; sB = oT - stripPt; }
    if (direction === 'bottom') { sL = oL; sT = oB + stripPt; sR = oR; sB = oB; }
    if (direction === 'left')   { sL = oL; sT = oT;          sR = oL + stripPt; sB = oB; }
    if (direction === 'right')  { sL = oR - stripPt; sT = oT; sR = oR;          sB = oB; }

    var grp = targetLayer.groupItems.add();
    grp.name = "_bleed_" + direction;
    var cr = grp.pathItems.add();
    cr.setEntirePath([[sL, sT], [sR, sT], [sR, sB], [sL, sB]]);
    cr.closed = true; cr.clipping = true;
    cr.filled = false; cr.stroked = false;

    for (var di = items.length - 1; di >= 0; di--) {
        try { items[di].duplicate(grp, ElementPlacement.PLACEATEND); } catch(e) {}
    }
    grp.clipped = true;

    var scX = 100, scY = 100;
    if (direction === 'top' || direction === 'bottom') scY = (edgeBleedPt / stripPt) * 100;
    else scX = (edgeBleedPt / stripPt) * 100;
    grp.resize(scX, scY, true, true, true, true, scX);

    if (direction === 'top')    { grp.top = oT + edgeBleedPt; grp.left = oL; }
    if (direction === 'bottom') { grp.top = oB;               grp.left = oL; }
    if (direction === 'left')   { grp.left = oL - edgeBleedPt; grp.top = oT; }
    if (direction === 'right')  { grp.left = oR;               grp.top = oT; }
}
```

- [ ] **Step 2: 파라미터 읽기 — bleed_mm, gaps**

`_params` 파싱 부분에 추가:

```javascript
var bleedMm    = _params.bleed_mm || 3;  // 기본 3mm
var gaps       = _params.gaps || [];      // 간격 경계 목록
var bleedPt    = bleedMm * PT_PER_MM / scaleFactor;
```

- [ ] **Step 3: rotated_180 지원 추가**

step 7 (Layer A 디자인 배치)에서 기존 `rotated` 뒤에 `rotated_180` 추가:

```javascript
// 기존:
if (pl.rotated) { copied.rotate(-90); }
// 추가:
if (pl.rotated_180) { copied.rotate(180); }
```

- [ ] **Step 4: 시트 외곽 도련 생성**

step 9 (Layer C 돔보) 뒤, step 10 (파일 저장) 전에 추가:

```javascript
// ── 9.5 Layer X: 외곽 도련 (Layer A 아래) ──
var layerX = newDoc.layers.add();
layerX.name = "Bleed";
layerX.zOrder(ZOrderMethod.SENDTOBACK);

// 외곽 도련: Layer A의 전체 아이템을 소스로 사용
var allDesignItems = [];
for (var xi = 0; xi < layerA.pageItems.length; xi++) {
    allDesignItems.push(layerA.pageItems[xi]);
}

// 각 행(shelf)별로 좌/우 외곽 도련 (높이 범위 내)
// 상/하는 전체 폭으로 도련
createEdgeStrip(layerX, allDesignItems, artL, artT, artR, artB, 'top',    bleedPt, PT_PER_MM);
createEdgeStrip(layerX, allDesignItems, artL, artT, artR, artB, 'bottom', bleedPt, PT_PER_MM);
createEdgeStrip(layerX, allDesignItems, artL, artT, artR, artB, 'left',   bleedPt, PT_PER_MM);
createEdgeStrip(layerX, allDesignItems, artL, artT, artR, artB, 'right',  bleedPt, PT_PER_MM);

// 아트보드 도련만큼 확장
newDoc.artboards[0].artboardRect = [
    artL - bleedPt, artT + bleedPt,
    artR + bleedPt, artB - bleedPt
];

$.writeln("SheetLayout: 외곽 도련 " + bleedMm + "mm 적용");
```

- [ ] **Step 5: 간격 경계 도련 생성**

외곽 도련 뒤에 추가. gaps 배열의 각 항목에 대해 해당 아이템 에지에 도련:

```javascript
// ── 9.6 간격 경계 도련 ──
for (var gi = 0; gi < gaps.length; gi++) {
    var gap = gaps[gi];
    var pa = placements[gap.placement_a];
    var pb = placements[gap.placement_b];
    if (!pa || !pb) continue;

    var gapPt = (gap.gap_mm || bleedMm) * PT_PER_MM / scaleFactor;
    var halfGap = gapPt / 2;

    // placement A의 해당 변에서 에지 스트립
    var aItems = [layerA.pageItems[placements.length - 1 - gap.placement_a]];
    var bItems = [layerA.pageItems[placements.length - 1 - gap.placement_b]];

    if (gap.side === 'right') {
        // A의 오른쪽 → halfGap 스트립
        var aR = pa.x_cm * PT_PER_CM + pa.width_cm * PT_PER_CM;
        var aT = canvasHeightPt - pa.y_cm * PT_PER_CM;
        var aB = aT - pa.height_cm * PT_PER_CM;
        createEdgeStrip(layerX, aItems, pa.x_cm * PT_PER_CM, aT, aR, aB, 'right', halfGap, PT_PER_MM);

        // B의 왼쪽 → halfGap 스트립
        var bL = pb.x_cm * PT_PER_CM;
        var bT = canvasHeightPt - pb.y_cm * PT_PER_CM;
        var bB = bT - pb.height_cm * PT_PER_CM;
        createEdgeStrip(layerX, bItems, bL, bT, bL + pb.width_cm * PT_PER_CM, bB, 'left', halfGap, PT_PER_MM);
    } else if (gap.side === 'bottom') {
        // A의 하단 → halfGap 스트립
        var aL2 = pa.x_cm * PT_PER_CM;
        var aT2 = canvasHeightPt - pa.y_cm * PT_PER_CM;
        var aB2 = aT2 - pa.height_cm * PT_PER_CM;
        var aR2 = aL2 + pa.width_cm * PT_PER_CM;
        createEdgeStrip(layerX, aItems, aL2, aT2, aR2, aB2, 'bottom', halfGap, PT_PER_MM);

        // B의 상단 → halfGap 스트립
        var bL2 = pb.x_cm * PT_PER_CM;
        var bT2 = canvasHeightPt - pb.y_cm * PT_PER_CM;
        var bB2 = bT2 - pb.height_cm * PT_PER_CM;
        var bR2 = bL2 + pb.width_cm * PT_PER_CM;
        createEdgeStrip(layerX, bItems, bL2, bT2, bR2, bB2, 'top', halfGap, PT_PER_MM);
    }

    $.writeln("SheetLayout: 간격 도련 [" + gap.placement_a + "]-[" + gap.placement_b + "] " + gap.side);
}
```

- [ ] **Step 6: 커밋**

```bash
git add IllustratorAutomat/SheetLayout.jsx
git commit -m "feat: add edge bleed strips to SheetLayout (perimeter + gap boundaries)"
```

---

### Task 6: Program.cs — 시트배치 gaps/rotated_180/bleed_mm 전달

**Files:**
- Modify: `IllustratorAutomat/Program.cs:1480-1514`

- [ ] **Step 1: placement에 rotated_180 추가**

Program.cs:1483-1491의 placement 구성에 `rotated_180` 추가:

```csharp
scaledPlacements.Add(new
{
    group_index = p.GetProperty("group_index").GetInt32(),
    x_cm = p.GetProperty("x_cm").GetDouble() / scaleFactor,
    y_cm = p.GetProperty("y_cm").GetDouble() / scaleFactor,
    width_cm = p.GetProperty("width_cm").GetDouble() / scaleFactor,
    height_cm = p.GetProperty("height_cm").GetDouble() / scaleFactor,
    rotated = p.TryGetProperty("rotated", out var rEl) && rEl.GetBoolean(),
    rotated_180 = p.TryGetProperty("rotated_180", out var r180El) && r180El.GetBoolean(),
});
```

- [ ] **Step 2: ia_params에 gaps/bleed_mm 추가**

Program.cs:1496-1514의 iaParamsObj에 추가:

```csharp
// gaps 읽기
var gapsList = new List<object>();
if (slParams.TryGetProperty("gaps", out var gapsEl) && gapsEl.ValueKind == JsonValueKind.Array)
{
    foreach (var g in gapsEl.EnumerateArray())
    {
        gapsList.Add(new
        {
            placement_a = g.GetProperty("placement_a").GetInt32(),
            placement_b = g.GetProperty("placement_b").GetInt32(),
            side = g.GetProperty("side").GetString(),
            gap_mm = g.TryGetProperty("gap_mm", out var gmEl) ? gmEl.GetDouble() : 3.0
        });
    }
}

double bleedMm = slParams.TryGetProperty("bleed_mm", out var bmEl) ? bmEl.GetDouble() : 3.0;

var iaParamsObj = new
{
    mode = "sheet_layout",
    source = aiFilePath,
    scale_factor = scaleFactor,
    bleed_mm = bleedMm,
    gaps = gapsList,
    canvas = new { ... },  // 기존 유지
    placements = scaledPlacements,
    outputs = new { ... }  // 기존 유지
};
```

- [ ] **Step 3: 커밋**

```bash
git add IllustratorAutomat/Program.cs
git commit -m "feat: pass gaps/rotated_180/bleed_mm to SheetLayout.jsx"
```

---

### Task 7: orderForm.js — 시트배치 캔버스 인터랙션

**Files:**
- Modify: `src/scripts/orderForm.js`

- [ ] **Step 1: 상태 변수 추가**

시트배치 상태 변수 영역(line 1685~)에 추가:

```javascript
var sheetGaps = [];        // [{placement_a, placement_b, side, gap_mm}]
var sheetRotations180 = {}; // {placementIndex: true/false}
```

- [ ] **Step 2: 인접 경계 계산 함수**

```javascript
function findAdjacentBoundaries(placements) {
    var boundaries = [];
    for (var i = 0; i < placements.length; i++) {
        for (var j = i + 1; j < placements.length; j++) {
            var a = placements[i], b = placements[j];
            // 수평 인접: A 오른쪽 ≈ B 왼쪽
            if (Math.abs((a.x_cm + a.width_cm) - b.x_cm) < 0.2) {
                var overlapTop = Math.min(a.y_cm + a.height_cm, b.y_cm + b.height_cm);
                var overlapBot = Math.max(a.y_cm, b.y_cm);
                if (overlapTop > overlapBot) {
                    boundaries.push({a: i, b: j, side: 'right'});
                }
            }
            // 수직 인접: A 하단 ≈ B 상단
            if (Math.abs((a.y_cm + a.height_cm) - b.y_cm) < 0.2) {
                var overlapR = Math.min(a.x_cm + a.width_cm, b.x_cm + b.width_cm);
                var overlapL = Math.max(a.x_cm, b.x_cm);
                if (overlapR > overlapL) {
                    boundaries.push({a: i, b: j, side: 'bottom'});
                }
            }
        }
    }
    return boundaries;
}
```

- [ ] **Step 3: 캔버스 클릭 이벤트 핸들러**

`renderSheetCanvasModal` 함수 뒤에 추가:

```javascript
function setupSheetCanvasInteraction() {
    var canvas = document.getElementById('sheetCanvasModal');
    if (!canvas || !sheetLayoutResult) return;

    canvas.style.cursor = 'pointer';
    var boundaries = findAdjacentBoundaries(sheetLayoutResult.placements);

    canvas.onclick = function(e) {
        var rect = canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        var mx = (e.clientX - rect.left);
        var my = (e.clientY - rect.top);

        var widthSel = document.getElementById('sheetRollWidth');
        var rollWidth = widthSel ? (parseInt(widthSel.value, 10) || 127) : 127;
        var containerW = canvas.parentElement ? canvas.parentElement.clientWidth - 20 : 800;
        var scale = containerW * 0.7 / rollWidth;
        var rollPx = rollWidth * scale;
        var offsetX = (containerW - rollPx) / 2;
        var headerH = 40;

        // 경계 히트 테스트 (±8px 범위)
        for (var bi = 0; bi < boundaries.length; bi++) {
            var bd = boundaries[bi];
            var pa = sheetLayoutResult.placements[bd.a];
            var pb = sheetLayoutResult.placements[bd.b];

            if (bd.side === 'right') {
                var bx = (pa.x_cm + pa.width_cm) * scale + offsetX;
                var by1 = Math.max(pa.y_cm, pb.y_cm) * scale + headerH;
                var by2 = Math.min(pa.y_cm + pa.height_cm, pb.y_cm + pb.height_cm) * scale + headerH;
                if (Math.abs(mx - bx) < 8 && my > by1 && my < by2) {
                    toggleGap(bd.a, bd.b, 'right');
                    renderSheetCanvasModal();
                    setupSheetCanvasInteraction();
                    return;
                }
            } else if (bd.side === 'bottom') {
                var by = (pa.y_cm + pa.height_cm) * scale + headerH;
                var bx1 = Math.max(pa.x_cm, pb.x_cm) * scale + offsetX;
                var bx2 = Math.min(pa.x_cm + pa.width_cm, pb.x_cm + pb.width_cm) * scale + offsetX;
                if (Math.abs(my - by) < 8 && mx > bx1 && mx < bx2) {
                    toggleGap(bd.a, bd.b, 'bottom');
                    renderSheetCanvasModal();
                    setupSheetCanvasInteraction();
                    return;
                }
            }
        }

        // 아이템 히트 테스트 → 180° 회전
        for (var pi = 0; pi < sheetLayoutResult.placements.length; pi++) {
            var p = sheetLayoutResult.placements[pi];
            var px = p.x_cm * scale + offsetX;
            var py = p.y_cm * scale + headerH;
            var pw = p.width_cm * scale;
            var ph = p.height_cm * scale;
            if (mx > px && mx < px + pw && my > py && my < py + ph) {
                sheetRotations180[pi] = !sheetRotations180[pi];
                sheetLayoutResult.placements[pi].rotated_180 = !!sheetRotations180[pi];
                renderSheetCanvasModal();
                setupSheetCanvasInteraction();
                return;
            }
        }
    };
}

function toggleGap(a, b, side) {
    var existing = sheetGaps.findIndex(function(g) {
        return g.placement_a === a && g.placement_b === b && g.side === side;
    });
    if (existing >= 0) {
        sheetGaps.splice(existing, 1);
    } else {
        sheetGaps.push({ placement_a: a, placement_b: b, side: side, gap_mm: 3 });
    }
}
```

- [ ] **Step 4: 캔버스 렌더링에 간격/회전 시각화 추가**

`renderSheetCanvasModal` 함수의 placement 렌더링 뒤에 추가:

```javascript
// 간격 경계 표시
sheetGaps.forEach(function(gap) {
    var pa = result.placements[gap.placement_a];
    var pb = result.placements[gap.placement_b];
    if (!pa || !pb) return;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    if (gap.side === 'right') {
        var gx = (pa.x_cm + pa.width_cm) * scale + offsetX;
        var gy1 = Math.max(pa.y_cm, pb.y_cm) * scale + offsetY;
        var gy2 = Math.min(pa.y_cm + pa.height_cm, pb.y_cm + pb.height_cm) * scale + offsetY;
        ctx.beginPath(); ctx.moveTo(gx, gy1); ctx.lineTo(gx, gy2); ctx.stroke();
        ctx.fillStyle = '#ef4444'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('3mm', gx, gy1 - 4);
    } else {
        var gy = (pa.y_cm + pa.height_cm) * scale + offsetY;
        var gx1 = Math.max(pa.x_cm, pb.x_cm) * scale + offsetX;
        var gx2 = Math.min(pa.x_cm + pa.width_cm, pb.x_cm + pb.width_cm) * scale + offsetX;
        ctx.beginPath(); ctx.moveTo(gx1, gy); ctx.lineTo(gx2, gy); ctx.stroke();
        ctx.fillStyle = '#ef4444'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('3mm', (gx1 + gx2) / 2, gy - 4);
    }
    ctx.setLineDash([]);
});

// 180° 회전된 아이템 표시
result.placements.forEach(function(p, idx) {
    if (p.rotated_180) {
        var rx = p.x_cm * scale + offsetX;
        var ry = p.y_cm * scale + offsetY;
        var rw = p.width_cm * scale;
        var rh = p.height_cm * scale;
        ctx.fillStyle = '#f59e0b30';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('↻180°', rx + rw - 4, ry + 14);
    }
});
```

- [ ] **Step 5: 모달 열 때 인터랙션 설정**

`openSheetPreviewModal` 함수에 추가:

```javascript
// 기존 requestAnimationFrame 안에:
requestAnimationFrame(function() {
    renderSheetCanvasModal();
    setupSheetCanvasInteraction(); // NEW
});
```

- [ ] **Step 6: confirmSheetLayout에 gaps/rotated_180 포함**

`confirmSheetLayout`의 layoutParams JSON에 추가:

```javascript
var layoutParams = JSON.stringify({
    mode: 'sheet_layout',
    roll_width_cm: rollWidthCm,
    total_height_cm: sheetLayoutResult.total_height_cm,
    margin_cm: marginCm,
    cut_marks: hasCut,
    scale_factor: getSheetScaleFactor(),
    bleed_mm: 3,
    gaps: sheetGaps,
    placements: sheetLayoutResult.placements  // rotated_180 이미 포함
});
```

- [ ] **Step 7: 빌드 검증**

```bash
npm run verify
```

- [ ] **Step 8: 커밋**

```bash
git add src/scripts/orderForm.js
git commit -m "feat: add interactive gap/rotation controls to sheet layout canvas"
```

---

### Task 8: 범례 + 도움말 UI

**Files:**
- Modify: `src/pages/orderForm.ts`

- [ ] **Step 1: 시트 미리보기 모달에 범례 추가**

시트 미리보기 모달 하단에 범례:

```html
<div class="flex items-center gap-4 text-xs text-gray-500 mt-3 px-4 pb-3 border-t pt-2">
    <span>클릭: <span class="text-blue-600 font-medium">아이템 → 180° 회전</span></span>
    <span>클릭: <span class="text-red-500 font-medium">경계선 → 간격 토글</span></span>
    <span class="flex items-center gap-1"><span style="border-top: 3px dashed #ef4444; width: 20px; display: inline-block;"></span> 간격 (3mm 도련)</span>
    <span>외곽: 자동 도련 적용</span>
</div>
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
npm run verify
git add src/pages/orderForm.ts
git commit -m "feat: add legend and help text to sheet layout preview"
```

---

## 셀프 리뷰

**Spec 커버리지:**
- ✅ Phase 1: ProcessOrderItem.jsx edge_strip method 분기
- ✅ Phase 1: Program.cs BLEED 제거, OFFSET method 추가, 시트 카테고리 자동
- ✅ Phase 1: orderForm.js BLEED UI 제거, OFFSET UI 확장
- ✅ Phase 1: 마이그레이션 OFFSET schema 업데이트
- ✅ Phase 1: 하위호환 (method 미지정 시 scale 기본값)
- ✅ Phase 2: SheetLayout.jsx 외곽 + 간격 도련
- ✅ Phase 2: Program.cs gaps/rotated_180/bleed_mm 전달
- ✅ Phase 2: 캔버스 인터랙션 (간격 토글 + 180° 회전)
- ✅ Phase 2: confirmSheetLayout에 gaps/bleed_mm 포함
- ✅ Phase 2: 범례 UI

**Placeholder 스캔:** 없음

**타입 일관성:**
- `offsetCfg.method` (JSX) = `offsetConfig.method` (C#) = `pp.params.method` (JS) → "edge_strip" | "scale"
- `offsetCfg.cut_line` (JSX) = `offsetConfig.cut_line` (C#) = `pp.params.cut_line` (JS) → boolean
- `gaps[].placement_a/b` (JS) = `gaps[].placement_a/b` (C#) = `gaps[].placement_a/b` (JSX) → int
- `gaps[].side` → "right" | "bottom"
- `placement.rotated_180` (JS) = `rotated_180` (C#) = `pl.rotated_180` (JSX) → boolean
