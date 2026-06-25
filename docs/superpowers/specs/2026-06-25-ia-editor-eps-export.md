# IA 편집기 — 주문 없이 가공 EPS 추출·다운로드 (`/ia-editor` Export-first)

- **작성일**: 2026-06-25 (brainstorming 세션, 용준님 확정)
- **상태**: 🟢 착수 — P0(공통)→P1(네스팅)→P2(단일가공) 순차, 백엔드/에이전트/프론트 3팀 병렬
- **목적**: IA 편집기를 **무거운 MES 통합(주문·카드·청구 생성) 없이 "가공 EPS 뽑는 가벼운 도구"로 먼저 안착**. 디자이너가 부담 없이 일상 사용 → 검증되면 주문 통합으로 확장.
- **선행 spec**: `2026-06-16-ia-editor-nesting-intake.md` (§14 정본). 본 spec은 그 위에 **Export 경로**를 추가.

---

## 0. 확정 결정 (2026-06-25)

| # | 결정 | 내용 |
|---|---|---|
| E1 | 두 경로 | ① **파일처리 탭** 단일 그룹 가공 EPS, ② **대지편집 탭** 네스팅 EPS |
| E2 | 단일 가공 단위 | **선택한 그룹 1개씩** (파일 내 여러 그룹은 각각 따로) |
| E3 | 출력 포맷 | **EPS + JPG(미리보기) + DXF(재단선)** 3종 |
| E4 | 수령 방식 | **브라우저 다운로드 버튼** (axios `responseType:blob` 경유) |
| E5 | 우선순위 | **P0 공통 → P1 네스팅 → P2 단일가공** (공통 후 둘 다) |
| E6 | 주문/카드/재고 | **미생성** — 순수 파일 출력. 미수금·생산 흐름 무영향 |
| E7 | 렌더러 | 네스팅=`SheetLayout.jsx`(기존), 단일=`ProcessOrderItem.jsx`(기존, 주문무관 단일실행 구조) |

## 1. 핵심 기술 제약 (반드시 준수)

- **CF 워커(prod)는 NAS(`Z:\`)를 직접 못 읽는다.** 에이전트가 만든 EPS/DXF/JPG는 현재 NAS에만 저장됨. 브라우저 다운로드하려면 **에이전트가 결과물을 R2에 업로드 → 워커가 R2에서 blob 서빙**해야 한다.
- **인증=헤더 전용**([[feedback-auth-header-only-download]]): `<a href>`/`<img src>`/새창은 401. 다운로드는 프론트에서 axios `responseType:blob` → `a[download]` 트리거.
- **마이그레이션 멱등성**([[feedback-migration-idempotency]]): `ALTER`/`CREATE`는 `IF NOT EXISTS`. 번호는 기존 최신+1. 적용은 `execute --file` 직접.
- **entity 격리**: 신규 테이블 `entity_id` INSERT 의무 + `entityFilter` SELECT.
- **D1 바인드**: `.bind(...params)` 스프레드, 루프 체이닝 금지.

## 2. 데이터 흐름

```
[파일처리 탭]  그룹 선택 + 후가공설정 → [가공해서 받기]
   → POST /process (queued) → 에이전트 PollProcessJobs → ProcessOrderItem.jsx
   → EPS/DXF/JPG 생성(NAS) → R2 업로드 → PATCH /process/:id (done, r2 keys)
   → 프론트 폴링(done) → [EPS][JPG][DXF] 다운로드 버튼

[대지편집 탭]  네스팅 배치 → [EPS 출력]
   → (sheet_layout 저장) → POST /sheets/:id/render (queued, 기존)
   → 에이전트 PollSheetRender → SheetLayout.jsx → R2 업로드 → PATCH (done, r2 keys)
   → 프론트 폴링(done) → [EPS][JPG][DXF] 다운로드 버튼
```

---

## 3. P0 — 공통 인프라 (R2 왕복 + 다운로드)

### 3.1 R2 키 규칙
```
render-outputs/{jobType}/{jobId}/{filename}
  jobType = sheet | process
  예) render-outputs/sheet/123/네스팅123-91x150-3건.eps
      render-outputs/process/45/group2-가공.dxf
```

### 3.2 워커 (`src/routes/workbench.ts`)
**(A) 에이전트 업로드 수신** — 에이전트가 산출물 1개씩 multipart 업로드:
```
POST /api/workbench/render-asset   (multipart/form-data)
  fields: file(바이너리), job_type=sheet|process, job_id(int), kind=eps|dxf|jpg
  → 키 sanitize 후 R2.put(render-outputs/{job_type}/{job_id}/{safeName})
  → 200 { success, data: { r2_key } }
  인증: authMiddleware + requireRole(ADMIN,MANAGER,DESIGNER) (에이전트 토큰)
  검증: validateUpload (확장자 eps/dxf/jpg, 50MB)
```
**(B) 다운로드** — DB result_json의 r2 key를 읽어 R2에서 attachment 서빙:
```
GET /api/workbench/sheets/:id/download?kind=eps|dxf|jpg     (P1)
GET /api/workbench/process/:id/download?kind=eps|dxf|jpg    (P2)
  → entity 격리 SELECT → result_json[kind+'_r2'] → R2.get
  → Content-Type(eps:application/postscript, dxf:image/vnd.dxf 또는 application/dxf, jpg:image/jpeg)
  → Content-Disposition: attachment; filename*=UTF-8''{encoded}
  → 404 if 미존재/미완료
```
> result_json 스키마(에이전트가 채움): `{ eps_r2, dxf_r2, jpg_r2, jpg_base64, width_cm, height_cm, scale_factor }`. 기존 `eps_path`(NAS) 등은 호환 유지.

### 3.3 프론트 (`src/scripts/iaEditor.js`)
```js
// 공통 blob 다운로드 — 인증 헤더 경유
function iaeDownloadBlob(url, filename) {
  axios.get(url, { responseType: 'blob' }).then(function (res) {
    var blob = new Blob([res.data]);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }).catch(function(){ iaeToast('다운로드 실패', 'error'); });
}
```

### 3.4 에이전트 (`IllustratorAutomat/Program.cs`)
```
UploadRenderAssetAsync(jobType, jobId, kind, localPath) → r2_key | null
  HttpClient multipart POST /api/workbench/render-asset (인증 헤더)
  실패 시 null 반환(콜백은 NAS 경로만이라도 보고)
```

---

## 4. P1 — 네스팅 다운로드 (대지편집 탭)

### 4.1 프론트
- 대지편집 툴바(또는 네스팅 패널)에 **`EPS 출력`** 버튼 추가.
- 클릭 → 현재 네스팅을 `sheet_layout`으로 저장(기존 `POST /api/workbench/sheets` 흐름 재사용; 없으면 추가) → 반환 id로 `POST /api/workbench/sheets/:id/render`(기존).
- 폴링: `GET /api/workbench/sheets/:id` 의 `render_status`(queued→rendering→done|error). 진행 표시.
- `done` → 결과 패널에 JPG 미리보기(`jpg_base64`) + **[EPS][JPG][DXF]** 다운로드 버튼(`iaeDownloadBlob('/api/workbench/sheets/:id/download?kind=...', name)`).
- `error` → `render_error` 토스트.
- **제약(현행 유지)**: v1 단일분석·단일시트. 다중시트는 후속(버튼에 가드 메시지).

### 4.2 에이전트
- `ProcessSheetRenderAsync`(Program.cs:1318~) 결과 보고 직전, EPS/DXF/JPG를 `UploadRenderAssetAsync("sheet", jobId, ...)` 로 R2 업로드 → `result`에 `eps_r2/dxf_r2/jpg_r2` 추가. 기존 `eps_path` 등 유지.

### 4.3 백엔드
- `PATCH /sheets/:id/render`(기존)는 result_json을 그대로 저장 → r2 키 자동 포함. **수정 불필요** (다운로드 엔드포인트 3.2(B)만 추가).

---

## 5. P2 — 단일 가공 다운로드 (파일처리 탭)

### 5.1 마이그레이션 (신규 테이블)
```sql
-- migrations/{next}_ia_process_jobs.sql  (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS ia_process_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL,         -- ai_analysis_requests.id (소스 .ai)
  group_index INTEGER NOT NULL,         -- 가공할 그룹/아트보드 인덱스
  params_json TEXT NOT NULL,            -- {target_w_cm,target_h_cm,finishing:{top/bottom/left/right:{method,margin_cm}},trim,rotate90}
  status TEXT NOT NULL DEFAULT 'queued',-- queued|rendering|done|error
  result_json TEXT,                     -- {eps_r2,dxf_r2,jpg_r2,jpg_base64,width_cm,height_cm}
  error_message TEXT,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ia_process_jobs_status ON ia_process_jobs(status);
```

### 5.2 워커 (`workbench.ts`)
```
POST /api/workbench/process
  body: { analysis_id, group_index, target_w_cm?, target_h_cm?,
          finishing?:{top?,bottom?,left?,right?:{method,margin_cm}}, trim?, rotate90? }
  → analysis 소유(entity) 검증 + status='done' 확인
  → INSERT ia_process_jobs(status='queued', entity_id, created_by) → { id }

GET /api/workbench/process-queue                (에이전트 폴링)
  → status='queued' 행 LIMIT 3, source_file_path(ai_analysis_requests.file_path) join
  → claim: queued→rendering
  → [{ id, analysis_id, group_index, params_json, source_file_path }]

GET /api/workbench/process/:id                  (프론트 폴링)
  → entity 격리 → { id, status, error_message, result_json }

PATCH /api/workbench/process/:id                (에이전트 콜백)
  body: { status:'done'|'error', result_json?, error_message? }

GET /api/workbench/process/:id/download?kind=   (3.2(B))
```
> 패턴은 `/sheets/:id/render` 계열을 그대로 복제. v1 제약: 단일 그룹.

### 5.3 에이전트 (`Program.cs`)
- `PollProcessJobsAsync()` — 메인 폴링 루프에 추가(PollSheetRenderAsync 옆).
  - `GET /process-queue` → 각 job:
  - 소스 .ai 해석(로컬→R2 다운로드, sheet render와 동일 코드 재사용).
  - `ia_params.json` 작성: `source, artboardIndex=group_index, finishing(4면), targetW=target_w_cm, targetH=target_h_cm, trim, epsOutput, pngOutput, dxfOutput`.
  - `ProcessOrderItem.jsx` 실행 → EPS/PNG(JPG) 생성. **DXF**는 5.4.
  - EPS/DXF/JPG `UploadRenderAssetAsync("process", id, ...)` → R2.
  - `PATCH /process/:id`(done, result_json).
  - 출력 폴더: `Z:\DESIGN\가공\yyyy\MM\dd\process_{id}\`.

### 5.4 ProcessOrderItem.jsx — DXF export 추가 (소규모)
- 신규 파라미터 `dxfOutput`(경로). EPS 저장 직후, 재단선 레이어(또는 전체)를 `SheetLayout.jsx`의 DXF export 패턴 이식:
  ```
  dxfOpts.exportFileFormat = AutoCADExportFileFormat.DXF;
  doc.exportFile(new File(dxfOutput), ExportType.AUTOCAD, dxfOpts);
  ```
- `dxfOutput` 없으면 스킵(주문 가공 호환). JPG는 기존 `pngOutput`(또는 JPEG export 추가) 재사용.

### 5.5 프론트 (`iaEditor.js`)
- 파일처리 탭 인스펙터에 **`가공해서 받기`** 버튼(그룹 선택 시 활성).
- 클릭 → `POST /process`(현재 그룹의 settings: target_w/h, finishing 4면, rotate90, trim) → id.
- 폴링 `GET /process/:id`(status). done → JPG 미리보기 + **[EPS][JPG][DXF]** 다운로드.
- error → 토스트.

---

## 6. 영향 범위 / 파일 분담 (3팀 병렬, 파일 비충돌)

| 팀 | 파일 | 작업 |
|----|------|------|
| **A 워커** | `src/routes/workbench.ts`, `migrations/{next}_*.sql` | render-asset 업로드, sheets/process download, process 큐 4종, 마이그 |
| **B 에이전트** | `IllustratorAutomat/Program.cs`, `ProcessOrderItem.jsx` | UploadRenderAssetAsync, sheet R2업로드, PollProcessJobs, jsx DXF export |
| **C 프론트** | `src/scripts/iaEditor.js` | iaeDownloadBlob, 네스팅 EPS출력 버튼+폴링, 단일 가공 버튼+폴링 |

- **API 계약(§3~§5)** 고정 → 3팀 동시 진행 가능. 통합 후 검증.

## 7. 검증

- 워커/프론트: `npm run verify`(typecheck+build) → `npm run build && npm run smoke`.
- 에이전트: `dotnet build`(C#) — IA publish는 현장 PC 배포(별도).
- E2E(배포 후): Playwright 로그인 → /ia-editor → ① 파일처리 그룹 가공 EPS 다운로드, ② 대지편집 네스팅 EPS 다운로드.

## 8. 배포 주의

- **양쪽 배포**: 워커(`--branch main`, [[feedback-pages-deploy-branch]]) + 에이전트(IllustratorAutomat → `Z:\Designs\IllustratorAutomat\publish\`).
- 마이그레이션 prod 적용(`execute --file`), wrangler observability 키 금지([[project-card-offset-reconcile]]), 한글 커밋 ASCII 우회([[feedback-windows-deploy]]).
- 배포 후 `git push`(배포≠push, [[feedback-deploy-push-divergence]]).
- **되돌리기 어려운 단계(배포)는 용준님 확인 후.**

## 9. 후속 (범위 외)

- 네스팅 다중시트/다중분석 다운로드(현 v1 단일).
- ZIP 일괄(파일 내 전 그룹) — E2에서 "그룹 1개씩"으로 확정, 후속 옵션.
- 가공 결과를 그대로 주문 라인으로 승격(Export→Order 브리지).
