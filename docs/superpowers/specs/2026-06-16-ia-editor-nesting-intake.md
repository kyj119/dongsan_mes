# IA 편집·네스팅·접수 워크벤치 (`/ia-editor`) — 수신 AI를 그룹 단위로 처리·시트 네스팅하여 주문 라인으로

- **작성일**: 2026-06-16 (brainstorming 세션, 통합 모델 확정)
- **상태**: 🟡 **설계 방향 전면 확정 (용준님)** — Phase 설계 완료, 구현 착수 대기. §13(시트 규격 의미)만 착수 전 확인
- **위상**: 이 스펙이 **상위 마스터 로드맵**. 기존 3개 스펙을 통합·흡수:
  - `2026-06-11-web-canvas-ia-workbench.md`(Tier1 검수·Tier2 시트배치) → §6.4 네스팅·P3로 흡수
  - `2026-06-11-incoming-file-editor.md`(편집기) → **편집은 "그림 수정 ❌, 처리 설정 ⭕"로 축소** 재정의
  - `2026-06-16-incoming-file-board.md`(원본 아카이브) → **P1로 흡수**

---

## 0. 확정 결정 (2026-06-16)

| # | 결정 | 내용 |
|---|---|---|
| D1 | 형태 | `/ia-editor` 독립 페이지 — 업로드→탭→그룹선택→처리설정→미리보기→네스팅→주문 라인 |
| D2 | "편집"의 정의 | **그림 수정 ❌**. 처리 설정(목표크기→scale·후가공·회전90°·복제) + 미리보기 |
| D3 | 미리보기 | **렌더 2단계** — 드래그/배치=웹 캔버스 근사(즉시), 최종 미리보기·출력=**IA 실제 렌더** |
| D4 | 주문 연결 | **새 주문 + 기존 주문 둘 다**, 한 거래처 |
| D5 | 원본 보존 | 업로드 원본 자동 아카이브(별도 트리) + 편집결과 EPS 보존 (P1) |
| D6 | 크기 | **목표 W×H 입력 → 자동 scale** (현 ProcessOrderItem scaleFactor) |
| D7 | 라인 정보 | **품목(PM-xxx)+수량 선택**, 크기·후가공·그림은 설정/그룹에서 자동 |
| D8 | 네스팅 범위 | **동일 품목일 때만** + **한 거래처 주문 내** (여러 거래처 안 섞음) |
| D9 | 네스팅 단위 | **시트 배치**(고정 시트 규격 W×H) 중심 — **현수막(롤) 아님**. v1 = **단일 시트, 사각형 패킹**, **회전 허용 토글** |
| D10 | 네스팅 라인 | 네스팅 시트 = **1개 라인**(공통 품목 + 수량=조각수), 금액=**조각별 면적 합산 × 단가** |
| D11 | 1차 포함 제안 | 자재 효율%·사용량 표시 / 회전 토글 / 프리플라이트 경고 / 2단계 렌더 |
| D12 | 다음으로 | 다중 시트(overflow), 이형 true-shape 네스팅, 타일링, 고객 포털 |

## 1. 왜

- 고객 AI 시안이 디자이너 PC에 산재 + 현행 IA는 원본을 가공 후 폐기(`Program.cs:1760`)
- 그룹 추출→매칭→처리→시트배치→주문이 현장 일러+분절된 화면에 묶여 비효율
→ **브라우저 한 화면**에서 파일을 그룹 단위로 처리·네스팅하고 주문 라인까지. 원본은 보존, 출력은 IA가 실행.

## 2. 큰 그림

```
[AI N개 업로드] → 좌측 파일별 탭 (+ 원본 자동 아카이브 Z:\원본\...)
   ↓ ExtractGroups: 그룹/아트보드 썸네일
[그룹 선택] → 우측 인스펙터: 목표 W×H(→scale) · 마감방식(상/하/좌/우) · 후가공옵션 · 회전90° · 복제수
   ↓ 미리보기
   · 드래그/배치 = 웹 캔버스 근사 (즉시)
   · [미리보기]/[출력] = IA 실제 렌더 (ProcessOrderItem → 진짜 PNG/EPS)
[복붙 모음 → 네스팅 작업 탭]  ← 동일 품목·한 거래처만
   ↓ 시트 규격 + 최소 여백 + [자동 배치](사각형 패킹) + 회전 토글 + 수동 미세조정
   → 자재 효율%·사용량 실시간
[주문서 추가] (새/기존, 한 거래처)
   · 단일 디자인     → 라인 1개 (품목+수량)
   · 네스팅 시트     → 라인 1개 (공통 품목 + 수량=조각수, 금액=면적합산)
   ↓
[출력 잡] 네스팅 EPS / 개별 EPS  → 검수 → 승인(auto_process_jobs.approved) → RIP
```

## 3. 벤치마크 → 차용

| 벤치마크 | 차용 |
|---|---|
| **Konva / Polotno**(멀티페이지·복붙·export) | 파일 탭=페이지, 복붙 모음, 캔버스 — web-canvas 스펙이 이미 Konva 채택 |
| **사각형 스트립/빈 패킹**(Skyline·MaxRects, `stb_rect_pack` 계열, JS 라이브러리) | [자동 배치] = **브라우저 사각형 패킹**(시트 규격 내, 즉시) |
| **Tilia Phoenix** | 회전 배치·gap margin·자재 효율 표시(차용), 타일링·true-shape(향후) |
| **Customer's Canvas / Wix 인스펙터** | 목표 크기 입력+종횡비 잠금, 마감·후가공 셀렉터 |
| **Enfocus PitStop / Ziflow** | 프리플라이트 경고, 검수·승인 |
| ~~SVGnest/Deepnest(이형 true-shape)~~ | **향후** (현수막/시트 대부분 사각형) |

## 4. 기존 자산 (코드 검증 2026-06-16 — 재사용)

| 자산 | 위치 | 활용 |
|---|---|---|
| `/workbench` 라우트·페이지 | `src/routes/workbench.ts`(orders·analyses·match), `src/pages/workbench.ts` | 검수·매칭 기반 |
| 그룹 썸네일 | `ai_analysis_requests.groups_json=[{index,name,thumbnail_base64,width_mm,height_mm}]`(0011) | 탭 내 그룹 표시 |
| 처리 잡 + 미리보기 | `auto_process_jobs`(0091): `status`(…approved), `output_png_base64`, `ia_params`; `GET /api/auto-process/pending` + `ia_auto_enabled` 게이트(#377) | 렌더 잡·미리보기 |
| ProcessOrderItem 입력 | `iaParams{scaleFactor, marginL/R/T/B(finishing 파생), clipBounds}`(`autoProcess.ts:135`), `getMargins(finishing)`(`:118`) | 처리 설정 실행 |
| 시트 배치 포맷 | `sheet_layouts` + SheetLayout.jsx `ia_params{canvas{width_cm,height_cm,margin_cm}, placements[{group_index,x_cm,y_cm,width_cm,height_cm,rotated}], gaps}` (web-canvas 스펙) | 네스팅 산출 포맷 |
| 1:N 파일 | `order_ai_files`(0254), `order_items.ai_file_id` | 다중 파일 |
| 매칭·라인 | `order_items.ai_analysis_id·ai_group_index·finishing·width·height·quantity·item_id` | 주문 라인 |
| 후가공 | `order_items.finishing`(+`finishing2/3` 드리프트)·`post_processing`(JSON), `finishing_methods`·`finishing_presets`(0176: 열재단·접어미싱·줄미싱·밴드미싱) | 마감·후가공 |
| 출력 파일명 규칙 | `[주문번호]-[순번]-[거래처]-[WxH]-[품목]-[수량]EA.eps`, `Z:\DESIGN\[카테고리]\Y\M\D\[주문번호]\`(`Program.cs:2095,2111`) | 아카이브·출력 명명 |
| 업로드 | `POST /api/files/upload`(R2, AI/EPS/PDF) | 인입 |

> ⚠️ 함정: ① TS `saved_path`(`autoProcess.ts:321`)는 `Z:\[카테고리]`(DESIGN 누락) ↔ C#(`Z:\DESIGN\`) 불일치. ② `finishing2/3` 마이그 없음(드리프트). 둘 다 P1에서 reconcile.

## 5. 핵심 기능 상세

### 5.1 업로드·탭·그룹 + 원본 아카이브 (P1)
- 다중 업로드(드래그&드롭) → 파일별 탭, ExtractGroups 비동기 분석(진행상태)
- 원본은 가공 시 삭제 대신 `Z:\원본\[카테고리]\Y\M\D\[주문번호]\[동일명].[ext]` 영구 보존(`Program.cs:1760` 교체), `original_archives` 기록. **앞으로 파일만**(백필 제외)

### 5.2 처리설정 인스펙터 (P2)
- 그룹 선택 → 우측: 목표 W×H(**종횡비 잠금**, →scale 자동표시) · **마감방식 상/하/좌/우**(`finishing_presets` 재사용→margin 자동) · 후가공옵션 체크 · **회전 90°** · **복제수**

### 5.3 렌더 2단계 (P2)
- **웹 근사**: 드래그·배치·회전은 Konva가 즉시 근사 렌더
- **IA 실제**: [미리보기]/[출력] 시 `auto_process_jobs`에 process 잡 큐잉(preview 플래그) → IA가 ProcessOrderItem 렌더 → `output_png_base64` 폴링 표시. 에이전트 오프라인 시 썸네일 폴백+헬스 배지. 디바운스·캐싱

### 5.4 시트 네스팅 (P3)
- 복붙으로 동일 품목 그룹들을 네스팅 작업 탭에 모음(D8)
- **시트 규격(W×H) 프리셋** + **최소 여백(gap)** + **[자동 배치]**(사각형 패킹, 브라우저) + **회전 허용 토글**(방향성 소재 보호) + 수동 미세조정·스냅
- **자재 효율%·사용 면적/시트 수 실시간**(D11)
- 산출 = `sheet_layouts.placements_json`(기존 포맷). v1 단일 시트, overflow(다중 시트)는 향후

### 5.5 주문 라인 추가 (P4)
- 단일 디자인 → 라인 1개. 네스팅 시트 → 라인 1개(공통 품목+수량=조각수)
- 금액 = 조각별 면적 합산 × 단가(현수막/시트 m² 단가). 조각별 크기는 네스팅 메타 보존
- 새/기존 주문(한 거래처). `order_items`(ai_analysis_id+ai_group_index+finishing+크기+item_id+quantity) 생성

### 5.6 프리플라이트 경고 (P2)
- 라인 추가 전: 규격↔목표 불일치 / 그룹 없음 / (향후)도련·아웃라인·해상도 경고

## 6. 데이터 모델 (마이그)

```sql
-- P1: 원본 아카이브
CREATE TABLE original_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER, ai_analysis_id INTEGER, order_ai_file_id INTEGER,
  archive_path TEXT NOT NULL, original_filename TEXT, file_ext TEXT, thumbnail_base64 TEXT,
  status TEXT NOT NULL DEFAULT 'archived' CHECK(status IN ('archived','failed')),
  entity_id INTEGER NOT NULL DEFAULT 1, archived_at TEXT DEFAULT (datetime('now'))
);
-- P1: 스키마 드리프트 보충 (autoProcess.ts:77 사용 중)
ALTER TABLE order_items ADD COLUMN finishing2 TEXT;
ALTER TABLE order_items ADD COLUMN finishing3 TEXT;
-- P2: 미리보기/잡 타입 구분
ALTER TABLE auto_process_jobs ADD COLUMN job_type TEXT DEFAULT 'auto_process'; -- 'auto_process'|'preview'|'sheet_layout'
-- P3: 시트 네스팅 (web-canvas 스펙 sheet_layouts 채택)
CREATE TABLE sheet_layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  canvas_json TEXT NOT NULL,                 -- {width_cm,height_cm,margin_cm} 시트 규격
  placements_json TEXT NOT NULL DEFAULT '[]',
  item_code TEXT,                            -- 공통 품목 (D8 동일품목 가드)
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','rendered','ordered')),
  source_analysis_ids TEXT, output_job_id INTEGER,
  entity_id INTEGER NOT NULL DEFAULT 1, created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);
```
> NOT NULL+DEFAULT·entity_id INSERT 의무·`clients` 무관. ALTER 전 PRAGMA 재확인.

## 7. API (`src/routes/workbench.ts` 확장)

```
POST /api/workbench/files/analyze     업로드 파일 분석 큐잉(ExtractGroups) → 탭/그룹
GET  /api/workbench/files             업로드 파일+그룹 썸네일(편집기 데이터원)
POST /api/workbench/preview           그룹+설정 → IA 렌더 잡(preview) 큐잉
GET  /api/workbench/preview/:jobId    렌더 상태·output_png_base64 폴링
CRUD /api/workbench/sheets            sheet_layouts (네스팅, 동일품목 가드)
POST /api/workbench/sheets/:id/render 네스팅 EPS 출력 잡(sheet_layout)
POST /api/workbench/add-to-order      단일/네스팅 → order_items 생성(새/기존, 한 거래처)
POST /api/workbench/archive           IA 원본 아카이브 완료 보고
GET  /api/workbench/agent-health      에이전트 폴링 시각 → 온라인 배지
```
전 라우트 `orderVisibilityFilter` + `requireRole('ADMIN','MANAGER','DESIGNER')`. entity_id 격리. 기존 페이지 확장이라 `permission_pages`는 신규 경로 시만.

## 8. IA 변경 (C# + JSX)

- **C# (`Program.cs`)**: ① `:1760` 임시정리 전 원본을 `Z:\원본\...`로 보존(baseName `:2095` 재사용, `DESIGN`→`원본`) + `/archive` 보고 ② preview 잡 처리(기존 process 경로 재사용, 결과 PNG 반환). `dotnet publish` 후 EXE 재시작
- **JSX**: ProcessOrderItem(단일 렌더) 재사용. SheetLayout.jsx = placements 실행+EPS(web-canvas 스펙대로, bleed=중심 미세확대 D-B)

## 9. Phase 계획 (대형 — 세션 분리)

| Phase | 내용 | 1차 제안 매핑 |
|---|---|---|
| **P1** | 업로드+파일 탭+그룹 썸네일(ExtractGroups) + **원본 자동 아카이브**(C#)+`original_archives`+finishing2/3 보충 | — |
| **P2** | 처리설정 인스펙터(크기/후가공/회전/복제) + **렌더 2단계**(웹 근사+IA 미리보기) + **프리플라이트 경고** | 2단계렌더·프리플라이트 |
| **P3** | **시트 네스팅 캔버스**(복붙 모음+드래그+시트규격/최소여백+자동배치 사각형패킹+**회전토글**+**효율%**) — SheetLayout 포팅 | 회전토글·효율표시 |
| **P4** | **주문 라인 추가**(단일→라인, 네스팅→1라인, 면적단가) + 새/기존 주문 | — |
| **P5** | 출력 잡(네스팅/개별 EPS) + 검수·**승인**(`auto_process_jobs.approved` 재사용) | — |

각 Phase는 독립 세션 권장(brainstorming 분리). PoC(좌표 왕복·실파일 변환)는 web-canvas 스펙 §8 승계.

## 10. 검증

- P1: 실주문 1건 가공 → 원본 `Z:\원본\...` 규칙 보존 + 실패 시 미아카이브 (`dotnet publish`/재시작 후)
- P2~: `npm run verify` + `npm run build && npm run smoke` + `/ia-editor` Playwright(admin/password) + entityFilter 격리 e2e
- P3: 자동 배치 좌표 → SheetLayout 실행 EPS 실측 일치(왕복), 효율% 검산
- P4: 네스팅 라인 면적합산 금액 검산, 동일품목 가드(D8), 타거래처 비노출

## 11. 범위 밖 / 다음 (D12)

- **다중 시트**(overflow → N장), **이형 true-shape 네스팅**(SVGnest/Deepnest), **타일링**(시트 초과 분할) — 다음 검토
- **그림 수정 편집**(문구패치·색교체) = incoming-file-editor — 보류 유지
- **고객 포털 개방** — 별도

## 12. P3 시트 네스팅 — 확정 설계 (용준님 결정 + 코드 검증 2026-06-16)

### 규격 프리셋 (편집 가능 데이터 — 하드코딩 X)
- 롤/시트 미디어 **폭**(mm): 914 · 1050 · 1270 · 1370 · 1520 (폭 고정·**길이 가변**)
- 평판 고정 시트(mm): 900×1800 · 1200×2400 (**고정 W×H**)

### ① 패킹 — 두 모드 모두 (모드 선택 UI)
- **롤**: 폭 고정 → **길이 최소화**(여백 최소). **평판**: 고정 W×H에 채워 빈공간 최소 → **판 수 최소**.
- **재사용**: 둘 다 `src/scripts/orderForm/sheet.js`의 `shelfBinPack(items, availableWidth, gap)`(:402) 활용 — 이미 shelf 패킹 + 회전 + 효율% + 롤폭 추천 구현. 평판 = availableWidth(시트폭) + **높이 cap(시트높이)** → 초과 시 다음 판. 롤 = 높이 무제한(또는 롤 길이 cap).

### ② 돔보 (SheetLayout.jsx 검증 — 이미 구현, "아마 1cm" 정확)
- **시트(전체 배치) 둘레 단위**(조각별 아님): 꼭짓점 대각 외곽 **1cm**(`CORNER_DIST=10mm/scale`) + 돔보원 6mm + 방향마크 6cm(좌상단) + 50cm마다 중간. scaleFactor 적용, 아트보드 `pad=CORNER_DIST+6mm` 확장.
- → 웹 네스팅: 사용가능영역에서 **돔보 여백(기본 1cm) 예약** + 미리보기 표시만. 실제 마크 그리기는 SheetLayout.jsx가 수행(무변경).

### ③ 자동 다중 판 (b형) — D9 "단일시트 v1" → **다중시트 v1로 상향**
- 한 판 초과 시 자동 다음 판: 평판 = 높이 cap 초과 → 다음 시트, 롤 = 롤 길이 cap 초과 → 다음 롤. 각 판 = sheet_layout 1건 → SheetLayout.jsx 실행 1회(또는 멀티 아트보드).

### ★ 재사용 발견 — P3는 그린필드 아님
주문서 폼에 **완성된 시트 네스팅**이 이미 존재: `shelfBinPack`+롤폭 추천+도련 인접(`orderForm/sheet.js`) · `orders.sheet_layout_params`(마이그0163) · SheetLayout.jsx 실행(Program.cs sheetLayout 처리 경로, 주문 흐름으로 소비 중 — auto_process_jobs와 별개). → P3 = 이 엔진을 **ia-editor 그룹 흐름으로 재배치/공유** + Konva 캔버스 + 모드선택/다중판 추가.
