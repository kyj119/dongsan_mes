# IllustratorAutomat Project Architecture Analysis

**Project**: Adobe Illustrator Automation Service for ERP+MES Integration  
**Date**: 2026-03-18  
**Version**: v2.0+  
**Primary Language**: C# 8.0 (.NET 8.0) + ExtendScript (ES3)

---

## 1. PROJECT STRUCTURE

### Source Files
```
IllustratorAutomat/
├── Program.cs                 [1,423 lines] — Main C# application
├── ProcessOrderItem.jsx       [600+ lines]  — Order item EPS/PNG generation
├── ExtractGroups.jsx          [800+ lines]  — AI file design extraction & clustering
├── PackGroups.jsx             [700+ lines]  — Group packing + layout + cutting marks
├── IllustratorAutomat.csproj  — Build config
├── README.md                  — Build & JSX documentation
├── publish/                   — Release binaries + JSX + config
│   ├── IllustratorAutomat.exe — Compiled service
│   ├── ExtractGroups.jsx
│   ├── ProcessOrderItem.jsx
│   ├── PackGroups.jsx
│   ├── ia_params.json         — Runtime parameter file
│   ├── ia_debug.log           — Diagnostic logs (ProcessOrderItem)
│   ├── ia_diag.log            — Diagnostic logs (ExtractGroups)
│   └── ia_error.log           — Exception logs
└── bin/Release/net8.0/win-x64/ — Compiled output
```

### Build Output
- **Single-file executable**: `publish/IllustratorAutomat.exe`
- **Self-contained**: All .NET runtime embedded
- **JSX scripts**: Copied to `publish/` folder (no rebuild needed if only JSX modified)

---

## 2. DATA FLOW ARCHITECTURE

### Polling Loop (5-second intervals)
```
Main Thread (async):
  └─ while(true):
     ├─ PollOrdersAsync()       → GET /api/orders?status=CONFIRMED
     ├─ PollAIAnalysisAsync()   → GET /api/ai-analysis?status=pending
     ├─ PollAILayoutAsync()     → GET /api/ai-layout?status=pending
     └─ await Task.Delay(5000ms)
```

### State Tracking (Prevent re-processing)
```csharp
// In-memory dictionaries (reset on restart):
Dictionary<int, string> processedOrders     // key: orderId, value: updated_at timestamp
HashSet<int> processedAnalyses              // AI analysis request IDs
HashSet<int> processedLayouts               // AI layout request IDs
```

**Risk**: State lost on service restart → potential re-processing if DB records remain in processing state.

---

## 3. API ENDPOINTS & DATA EXTRACTION

### 3.1 Order Processing (`PollOrdersAsync`)

#### Input: `GET /api/orders?status=CONFIRMED&limit=10`
```json
{
  "data": [
    {
      "id": 123,
      "order_number": "20260321-001",
      "client_name": "한들플라인",
      "ai_file_path": "C:\\path\\to\\file.ai",  // ← Per-order AI file
      "layout_id": 456,                          // ← Bundle mode (묶음)
      "updated_at": "2026-03-21T10:30:00Z",
      "items": [
        {
          "id": 789,
          "parent_item_id": null,                // Bundle parent (묶음 부모)
          "item_name": "현수막",
          "width": 355,                          // cm
          "height": 207,                         // cm
          "quantity": 1,
          "content": "한들플라인-355x207-현수막 (일반)",
          "category_name": "현수막",              // Z-drive folder path
          "ai_file_path": "...",                 // ← Per-item AI file (override)
          "ai_group_index": -1,                  // -2=bundle, -1=full doc, 0+=specific group
          "scale_factor": 1.0,                   // File coordinate scaling
          "post_processing": "[{...}]"           // JSON array of finish specs
        }
      ]
    }
  ]
}
```

#### Post-Processing JSON (post_processing field)
**Format**: Array of finish spec objects (stored as JSON string in DB)
```json
[
  {
    "code": "FINISH_FOLD",
    "margin_left": 2.0,
    "margin_right": 2.0,
    "margin_top": 2.0,
    "margin_bottom": 2.0
  },
  {
    "code": "PUNCHING",
    "params": {
      "corner_tl": true,
      "corner_tr": true,
      "corner_bl": false,
      "corner_br": false,
      "side_top": 0,
      "side_bottom": 2,
      "side_left": 0,
      "side_right": 0
    }
  },
  {
    "code": "ANNOTATION",
    "params": {
      "positions": ["하"],         // or "position": "하" (backward compat)
      "customText": "주문번호"
    }
  },
  {
    "code": "OFFSET",
    "params": {
      "offset_distance": 30        // mm (converted to cm in code)
    }
  }
]
```

**Parsing Logic** (Program.cs lines 918-1003):
1. Parse `post_processing` string as JSON array
2. For each entry, extract `code` and feature-specific `params`
3. Margin rules:
   - FINISH_* codes: margins included → bleed calculation
   - PUNCHING: no bleed (marks inside design)
   - ANNOTATION: margin enforced (1.5cm min for font clearance)
   - OFFSET: margin = offset_distance / 10
4. Child items inherit parent's post_processing if not set
5. Scale factor applied: `actual_margin_cm / scale_factor = file_coordinate_margin`

#### Data Extraction Failures
| Field | Failure Mode | Fallback | Risk |
|-------|--------------|----------|------|
| `ai_file_path` | null/empty | Check per-item, then skip | May skip valid orders if neither set |
| `updated_at` | Missing/null | "" (empty string) | Won't detect re-edits; re-processing skipped |
| `post_processing` | Unparseable JSON | Log warning, use zero margins | Files may print without intended bleeds |
| `category_name` | null/invalid chars | "기타" (etc.) | Wrong Z-drive folder path |
| `order_number` | Bad format | Falls back to DateTime | Date extraction fails → wrong folder structure |

---

### 3.2 AI Analysis Request (`PollAIAnalysisAsync`)

#### Input: `GET /api/ai-analysis?status=pending`
```json
{
  "data": [
    {
      "id": 100,
      "file_path": "C:\\path\\to\\design.ai",
      "request_type": "extract",
      "status": "pending"
    }
  ]
}
```

#### Processing: `ProcessAIAnalysisAsync`
1. **File location strategy**:
   - If `file_path` exists locally → use directly
   - Otherwise → attempt chunk reassembly via `GET /api/ai-analysis/{id}/chunks`

2. **Chunk reassembly** (for cross-PC uploads):
   ```json
   GET /api/ai-analysis/100/chunks
   {
     "data": [
       {"chunk_index": 0, "chunk_data": "base64_encoded_bytes"},
       {"chunk_index": 1, "chunk_data": "base64_encoded_bytes"}
     ]
   }
   ```
   - Reassemble in order by `chunk_index`
   - Base64 decode → write to temp file
   - Stored in `%TEMP%\IllustratorAutomat\req_{id}\source.{ext}`

3. **EPS BoundingBox Parsing** (if .eps input):
   ```
   %!PS-Adobe-3.0 EPSF-3.0
   %%BoundingBox: 0 0 1000 1000    ← Parse this line
   %%HiResBoundingBox: 0 0 1000 1000
   ```
   - C# extracts width/height in mm (via ERP API)
   - Passed to JSX as `eps_width_mm`, `eps_height_mm` for bounds validation

#### Output: `ExtractGroups.jsx` Results
```
Published to:
  {output_folder}/req_{id}-0.png      — Thumbnail
  {output_folder}/groups.json         — Design clusters
```

**groups.json format**:
```json
[
  {
    "index": 0,
    "name": "Design_Cluster_0",
    "width_mm": 350.0,
    "height_mm": 200.0,
    "thumbnail_file": "req_100-0.png"
  },
  {
    "index": 1,
    "name": "Design_Cluster_1",
    "width_mm": 100.0,
    "height_mm": 100.0,
    "thumbnail_file": "req_100-1.png"
  }
]
```

#### Status Update: `PATCH /api/ai-analysis/{id}`
```csharp
{
  "status": "completed"|"processing"|"error",
  "groups_json": "...",         // JSON array (if completed)
  "error_message": "...",       // (if error)
  "file_path": "..."            // Updated file path
}
```

#### Data Extraction Failures
| Field | Failure Mode | Handling | Risk |
|-------|--------------|----------|------|
| `file_path` | Invalid path | Attempt chunks; if chunks empty → error | Files stuck in "processing" |
| `chunks` | Missing/corrupt | Mark as error | Can't recover large files |
| EPS BoundingBox | Invalid format | Fallback to null hint | JSX doesn't validate artboard |
| `groups.json` | Invalid JSON | Parsed as UTF-8 text | ERP API rejects malformed payload |

---

### 3.3 AI Layout Request (`PollAILayoutAsync`)

#### Input: `GET /api/ai-layout?status=pending`
```json
{
  "data": [
    {
      "id": 50,
      "file_path": "C:\\path\\to\\layout.ai",
      "mode": "combined",                    // or "individual"
      "group_indices": "[0,1,2,-1]",         // JSON array (string)
      "widths": "[105,127,152]",             // cm options (JSON string)
      "status": "pending"
    }
  ]
}
```

#### Processing: `ProcessLayoutJobAsync`
1. Parse `group_indices` and `widths` as JSON arrays (string → int[])
2. Call `PackGroups.jsx` with parameters:
   ```json
   {
     "source": "...",
     "mode": "combined|individual",
     "groupIndices": "[0,1,2]",
     "widths": "[105,127,152]",
     "output1": "path/to/layout_dombo.eps",
     "output2": "path/to/cutline.eps",
     "outputThumb": "path/to/thumb.png",
     "resultJson": "path/to/result.json"
   }
   ```

3. `PackGroups.jsx` output: `result.json`
   ```json
   {
     "width_cm": 350.0,
     "height_cm": 207.0,
     "groups": [0, 1, 2],
     "dombo_marks": [...]
   }
   ```

#### Status Update: `PATCH /api/ai-layout/{id}`
```json
{
  "status": "completed"|"error",
  "result_json": "...",        // (if completed)
  "error_message": "..."       // (if error)
}
```

#### Data Extraction Failures
| Issue | Handling | Risk |
|-------|----------|------|
| `group_indices` unparseable | parseIntArray() returns [] → use all groups | Unintended group selection |
| `widths` empty array | Default to [105, 127, 152] | Hard-coded defaults may not match request |
| `mode` invalid | Defaults to "combined" | Silent fallback; no validation |
| `result.json` missing | Error logged from error.log | Layout stuck in "processing" |

---

## 4. JSX SCRIPT EXECUTION & PARAMETER PASSING

### 4.1 Parameter Communication Channel
C# writes parameters → JSX reads via file:
```csharp
// C# writes:
string iaParamsJson = JsonSerializer.Serialize(new {
    source = filePath,
    groupIdx = groupIndex,
    marginL = 4.0,
    marginR = 4.0,
    // ... more params
});
File.WriteAllText("publish/ia_params.json", iaParamsJson);

// JSX reads:
var _configFile = new File("ia_params.json");
_configFile.open("r");
var _params = eval("(" + _configFile.read() + ")");

// Access via: _params.source, _params.marginL, etc.
```

**Risk**: Race condition if JSX reads while C# is still writing. (Mitigation: synchronous write before script launch.)

### 4.2 Script Invocation
```csharp
RunJsxScript(scriptPath, paramsJsonPath, timeoutMinutes: 5)
{
  ProcessStartInfo psi = new ProcessStartInfo
  {
      FileName = illustratorPath,
      Arguments = scriptPath,
      UseShellExecute = false,
      RedirectStandardOutput = true
  };
  
  // COM alternative (if Illustrator already running):
  dynamic ilApp = Marshal.GetActiveObject("Illustrator.Application");
  ilApp.DoJavaScript(scriptPath);
}
```

**Timeout**: 5 minutes per script → if JSX hangs, process killed. Log files may be incomplete.

---

## 5. ExtractGroups.jsx: DESIGN CLUSTERING ALGORITHM

### 5.1 Input
- AI/EPS file path (via `ia_params.json`)
- Optional EPS BoundingBox hints from C#

### 5.2 Algorithm (v3: Union-Find 2D Proximity Clustering)

#### Step 1: Collect all top-level items
```javascript
function collectAllItems(doc) {
  // Iterate: doc.layers[] → layer.pageItems[]
  // Include: PathItem, GroupItem, RasterItem (not just groups)
  // Exclude: hidden, non-visible items
  return [{item, vb: visibleBounds, typename, name}, ...]
}
```

#### Step 2: 2D Proximity Clustering (Union-Find)
```javascript
function clusterByProximity(items, threshold=50pt) {
  // O(n²) pairwise distance check
  for (i=0; i<n; i++) {
    for (j=i+1; j<n; j++) {
      if (rectGap(items[i].vb, items[j].vb) <= threshold) {
        // Items overlap or touch → union in same cluster
        unite(i, j);
      }
    }
  }
  // Return: [{items: [...], bounds: [l,t,r,b]}, ...]
}

function rectGap(a, b) {
  // Min distance between two rects (0 if overlapping)
  gx = max(0, max(a[0],b[0]) - min(a[2],b[2]))
  gy = max(0, max(a[3],b[3]) - min(a[1],b[1]))
  return max(gx, gy)  // Chebyshev distance
}
```

**Threshold**: 50pt (≈18mm) — fixed, not proportional to artboard size.

#### Step 3: Artboard filtering
- Keep clusters within artboard bounds
- Remove clusters outside (trim marks, registration crosses, etc.)

#### Step 4: Micro-cluster absorption
- Clusters < 5% of total area → absorb into nearest cluster
- Prevents stray text/marks from creating false designs

#### Step 5: Bounds calculation
- For each cluster: union of all item visibleBounds
- Convert to mm: `bounds_pt × (1 / 2.834645669) = bounds_mm`

### 5.3 Known Issues & Limitations

#### Issue 1: Clipping Mask Detection
In `getFullBounds()` (ProcessOrderItem.jsx lines 57-76):
- **Case 0**: Layer-level clipping mask (PathItem.clipping in parent Layer)
  - Problem: Not always visible in Illustrator UI; depends on group nesting
  - Workaround: Cross-reference parent layer pageItems
- **Case 1**: Group.clipped flag (group itself is clipped by first child PathItem)
- **Case 2**: Deep nested clipping (child GroupItem contains clipping PathItem)
- **Case 3**: Hollow file structure (root-sized container with small content inside)

**Risk**: If clipping mask misidentified, output bounds ≠ intended crop area.

#### Issue 2: Text Outline Conversion
Auto-fix in ProcessOrderItem.jsx (lines 105-116):
```javascript
for (_ti = doc.textFrames.length - 1; _ti >= 0; _ti--) {
  doc.textFrames[_ti].createOutline();  // TextFrame → PathItem
}
```
- **Risk**: Lossy conversion (no longer editable); fonts embedded as outlines
- **Timing**: After CMYK conversion; text already styled

#### Issue 3: EPS Bounds Validation
ExtractGroups.jsx (v2 change log):
- Artboard + content union + EPS BoundingBox cross-validation
- **Problem**: EPS box may be incorrect/stale in exported files
- **Solution**: Trust Illustrator artboard, use EPS as hint only

#### Issue 4: Scale Factor Handling
Program.cs (lines 1037-1049):
```csharp
// Actual margin (cm) ÷ scale_factor = file coordinate margin
// Example: 3cm bleed + scale_factor=5 → JSX receives 0.6cm
marginL /= scaleFactor;
```
- **Risk**: If scale_factor not set in DB → assumes 1.0 → over-bleeds
- **Design**: Scale for files that are 1/5 size of output (for detail work)

---

## 6. ProcessOrderItem.jsx: ORDER ITEM EPS GENERATION

### 6.1 Input Parameters
```json
{
  "source": "C:\\...\\file.ai",
  "groupIdx": 0,           // -1 = full doc, 0+ = group index
  "marginL": 4.0,          // cm (bleed)
  "marginR": 4.0,
  "marginT": 4.0,
  "marginB": 4.0,
  "epsOutput": "...\\file.eps",
  "pngOutput": "...\\file.png",
  "thumbSize": 300
}
```

### 6.2 Output
- **EPS file**: For RIP/cutting machines (preserves vector data)
- **PNG thumbnail**: Preview image (for web UI)

### 6.3 Bounds Calculation (4-case logic)
See section 5.3 "Issue 1: Clipping Mask Detection". Same logic as ExtractGroups.

---

## 7. PackGroups.jsx: LAYOUT + CUTTING MARKS

### 7.1 Input
```json
{
  "source": "...",
  "mode": "combined|individual",
  "groupIndices": "[0,1,2]",
  "widths": "[105,127,152]",  // cm (target widths to try)
  "output1": "...\\layout_dombo.eps",
  "output2": "...\\cutline.eps",
  "outputThumb": "...\\thumb.png",
  "resultJson": "...\\result.json",
  "thumbSize": 300
}
```

### 7.2 Shelf Layout Algorithm (Bin Packing)
**Mode: combined** (multiple groups → optimize fit)
```
1. Sort groups by height (descending)
2. For each group:
   - Try to fit on existing shelf
   - If doesn't fit: create new shelf below
3. Return: placements = [{group_idx, x, y_top}, ...]
```
**Goal**: Minimize total height for width constraint.

**Mode: individual** (each group separate)
```
- No packing; output each group as standalone page
```

### 7.3 Dombo Marks (Punching Holes)
```
Placement rules:
- 4 corner marks: 1cm outside corners (diagonal)
- Direction mark: 10cm from top-left corner (indicates orientation)
- Intermediate marks: If gap > 50cm, add equally-spaced marks
- Mark size: 6mm diameter circle (black outline only)
```

Example mark positions:
```
  ↗ (dir mark)
┌───────────────┐
│ D             │  D = dombo (corner mark)
│               │
│               │  D = 1cm diagonal from corner
│             D │
└───────────────┘
  D           D
```

### 7.4 Output
- **output1** (layout_dombo.eps): Packed groups + dombo marks
- **output2** (cutline.eps): Cut guide outlines (may be same as output1 in simple mode)
- **resultJson**: Actual dimensions achieved
  ```json
  {
    "width_cm": 350,
    "height_cm": 207,
    "groups": [0, 1, 2],
    "placements": [{idx: 0, x: 0, y: 0}, ...]
  }
  ```

---

## 8. ERROR HANDLING & DIAGNOSTICS

### 8.1 Log Files
| File | Source | Content | Retention |
|------|--------|---------|-----------|
| `ia_debug.log` | ProcessOrderItem.jsx | Bounds calc, margins, group info | Per-execution |
| `ia_diag.log` | ExtractGroups.jsx | Clipping mask diagnosis | Per-execution |
| `ia_error.log` | Any JSX exception | Stack traces, field values | Per-execution |
| `error.log` | PackGroups.jsx | Layout calc errors | Per-execution |
| Console output | C# main | Poll status, API responses, JSX results | Runtime only |

### 8.2 Error Propagation
```
JSX Exception
  ↓
Try-catch writes to error.log
  ↓
C# reads error.log after JSX timeout/exit
  ↓
PATCH /api/{endpoint} with status=error, error_message="..."
  ↓
ERP DB marks request as error (viewable in UI)
```

### 8.3 Common Failure Scenarios
1. **File not found** → Chunk reassembly failed or path invalid
   - **Fix**: Check file upload in ERP, verify NAS mount
2. **Clipping mask not detected** → bounds in output ≠ expected crop
   - **Fix**: Manually verify getFullBounds() 4-case logic vs. file structure
3. **EPS corruption** → RIP fails to parse
   - **Fix**: Check CMYK conversion, text outline conversion logs
4. **Scale factor mismatch** → over/under bleed
   - **Fix**: Verify scale_factor in DB vs. actual file dimensions
5. **Post-processing JSON unparseable** → files print without bleeds
   - **Fix**: Validate JSON syntax in DB (use JSON editor)
6. **Layout algorithm timeout (>5min)** → Process killed, result.json missing
   - **Fix**: Reduce group count or simplify geometry

---

## 9. CONFIGURATION & ENVIRONMENT

### 9.1 Hardcoded Constants (Program.cs)
```csharp
ERP_API_URL = "http://192.168.0.94:3000"
USERNAME = "admin"
PASSWORD = "password"
OUTPUT_FOLDER = @"C:\TNSRip-X11\Preview"
ZDRIVE_PATH = @"Z:\"
POLL_INTERVAL_MS = 5000
```

**Note**: No environment variable substitution. Must edit source code to change.

### 9.2 Unit Conversions (Both C# & JSX)
```
1 point (pt) = 1/72 inch ≈ 0.3528 mm
PT_PER_MM = 2.834645669
PT_PER_CM = 28.34645669
```

### 9.3 Z-Drive Path Structure
```
Z:\DESIGN\
  {category}\
    {year}\
      {month}\
        {day}\
          {order_number}\
            {baseName}-{fileSeq}.eps
            {baseName}-{fileSeq}.png
```
Example:
```
Z:\DESIGN\현수막\2026\03\21\20260321-011\
  20260321-011-001-한들플라인-355x207-현수막 (일반)-1EA.eps
  20260321-011-001-한들플라인-355x207-현수막 (일반)-1EA.png
```

---

## 10. DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────┐
│             ERP API (Hono/Cloudflare Workers)           │
└────┬────────────────────────────────────────────────────┘
     │
     ├─→ /api/orders?status=CONFIRMED
     │    └─→ ProcessOrderAsync() 
     │        ├─→ Extract item[] (width, height, quantity, category_name, etc.)
     │        ├─→ Parse post_processing JSON → margins, punching, annotation
     │        ├─→ ProcessItemAsync()
     │        │    ├─→ Call ProcessOrderItem.jsx (if groupIdx != -2)
     │        │    │    ├─→ Input: ia_params.json
     │        │    │    ├─→ Output: EPS + PNG to Z:\DESIGN\...
     │        │    │    └─→ Logs: ia_debug.log, ia_error.log
     │        │    └─→ Copy layout EPS (if groupIdx == -2, layout_id set)
     │        └─→ Register file-map (for LogWatcher matching)
     │
     ├─→ /api/ai-analysis?status=pending
     │    └─→ ProcessAIAnalysisAsync()
     │        ├─→ Download file or reassemble chunks
     │        ├─→ Call ExtractGroups.jsx
     │        │    ├─→ Input: ia_params.json
     │        │    ├─→ Clustering algorithm (Union-Find 2D proximity)
     │        │    ├─→ Output: groups.json + PNG thumbnails
     │        │    └─→ Logs: ia_diag.log, ia_error.log
     │        └─→ PATCH /api/ai-analysis/{id} with status=completed
     │
     └─→ /api/ai-layout?status=pending
          └─→ ProcessLayoutJobAsync()
              ├─→ Parse group_indices[], widths[]
              ├─→ Call PackGroups.jsx
              │    ├─→ Input: ia_params.json (environment variables)
              │    ├─→ Shelf layout algorithm (bin packing)
              │    ├─→ Dombo marks + cut guides
              │    ├─→ Output: output1.eps, output2.eps, result.json
              │    └─→ Logs: error.log
              └─→ PATCH /api/ai-layout/{id} with status=completed
```

---

## 11. SUMMARY OF CRITICAL EXTRACTION POINTS & RISKS

| Step | Data Source | Extraction Method | Failure Point | Impact |
|------|-------------|-------------------|---------------|--------|
| Order fetch | `/api/orders?status=CONFIRMED` | GET + JSON parse | API down, timeout | Orders not processed |
| Item parsing | `items[]` array | JsonElement.GetProperty() | Missing field, wrong type | Null exception crash |
| Post-processing | `post_processing` (JSON string) | JsonDocument.Parse() | Invalid JSON syntax | Files print without bleeds |
| AI file location | `ai_file_path` or per-item override | File.Exists() check | Path invalid, file moved | Processing skipped/error |
| EPS BoundingBox | EPS file header (%%BoundingBox line) | StreamReader + regex | Format invalid, line missing | Bounds hint ignored (safe fallback) |
| Margins calculation | post_processing[].margin_* | Double.GetDouble() + Math.Max() | Type mismatch, NaN | Defaults to zero (print bleed loss) |
| Category name | `category_name` field | SanitizeFilename() + fallback "기타" | Null/invalid chars | Wrong Z-drive folder |
| Order number parsing | `order_number` (YYYYMMDD-NNN format) | String.Substring() | Wrong length, non-numeric | Uses current date instead |
| Scale factor | `scale_factor` field | TryGetDouble() + fallback 1.0 | Missing field, zero/negative | No scaling (over-bleed risk) |
| Clipping bounds | AI file group structure | getFullBounds() 4-case logic | Complex nesting, mixed masks | Bounds ≠ intended crop |
| Cluster detection | All top-level items | visibleBounds + proximity threshold | Overlapping items, edge cases | Unintended design grouping |
| JSON output | groups.json, result.json | buildJSON(), stringify | Escape issues, large arrays | ERP API parse error |

---

## 12. RECOMMENDATIONS FOR ROBUSTNESS

1. **Add validation layer**: Pre-flight checks on order data before JSX invocation
2. **Implement DB state recovery**: Graceful restart handling (query in-progress status from ERP, not local memory)
3. **Parameterize environment**: Move hardcoded constants to config file or env vars
4. **Structured logging**: JSON logs for easier parsing/alerting
5. **Retry logic**: Transient failures (network timeouts) should retry, not fail immediately
6. **JSX sandboxing**: Run ExtractGroups/PackGroups in isolated Illustrator instance (avoid cross-request state)
7. **JSON validation**: Schema validation for post_processing, group_indices, widths arrays before JSX
8. **Error aggregate**: Collect all errors from error.log, not just first line

