# 웹 캔버스 IA 워크벤치 — AI 파일 뷰어·검수 + 시트 배치 (Tier 1+2)

- **작성일**: 2026-06-11 (Cowork 설계 세션에서 상세화 완료)
- **상태**: ✅ **설계 확정 — 전 결정 수렴, 구현 착수 가능** (로컬 PoC 체크리스트 §8만 측정 후 P1 진입)
- **관련**: #377(자동가공 게이트), `client-self-order-portal` spec, `feedback-sheet-layout.md`, IllustratorAutomat/SheetLayout.jsx

---

## 0. 확정 결정 요약 (2026-06-11 용준님)

| 결정 | 내용 |
|---|---|
| 사용자·목적 | **내부 작업자 먼저** → 같은 캔버스 기술로 고객용 에디터(Tier 3) 확장 |
| 배치 이관 | **시트 배치를 웹 캔버스로 전환** — Illustrator/JSX는 좌표 실행기로 격하 |
| 1차 범위 | Tier 1(뷰어+검수) + Tier 2(배치 캔버스) 통합 설계, Phase 분리 구현 |
| **D-A 변환 시점** | **업로드 즉시 convert 잡 큐잉** — 에이전트 오프라인 시 pending 표시+썸네일 폴백, 에이전트 헬스 배지 |
| **D-B bleed 전략** | **디자인 미세 확대(앵커 중심 +3mm/변)** — 엣지스트립(createEdgeStrip) 로직 제거 → **IA 오프셋 버그 완전 회피 확정** |
| **D-C 동시 편집** | **시트 단위 잠금** — 편집 진입 시 잠금+"○○님 편집 중" 배지, 타인 읽기 전용, 타임아웃 30분 |
| **D-D 자동 배치** | **하이브리드** — 기존 SheetLayout 배치 알고리즘 웹 포팅("자동 배치" 버튼) + 수동 미세조정 |

## 1. 왜

IA 작업(시안 확인→그룹 추출→품목 매칭→시트 배치)이 현장 PC Illustrator+JSX에 묶여: 깨지기 쉽고(#377 침묵 실패, 3mm 오프셋 버그), 단일 PC 의존, 검수 불투명.
→ 브라우저에서 검수·배치 수행, Illustrator는 실행기.

## 2. 로드맵 파급 (채택으로 변경)

- 세션 "IA 오프셋 디버깅" **제거** — D-B(미세 확대)로 createEdgeStrip 자체를 폐기
- SheetLayout.jsx = **placements 좌표 실행 + 3종 출력(EPS/DXF/JPG)만** 담당 (배치·bleed 로직 제거로 단순화)
- 포털 제작품 선행 = **#377 게이트 + 워크벤치 Tier 1** (검수 UI가 포털 시안 확인의 기반)

## 3. 기존 자산 (코드 확인 완료 — 재사용)

| 자산 | 위치 | 활용 |
|---|---|---|
| **placement JSON 포맷** | SheetLayout.jsx ia_params: `canvas{width_cm,height_cm,margin_cm}` + `placements[{group_index,x_cm,y_cm,width_cm,height_cm,rotated}]` + `gaps` | **웹 캔버스 산출물 = 이 포맷 그대로** (신규 스키마 설계 불요) |
| 그룹 썸네일 | `ai_analysis_requests.groups_json = [{index,name,thumbnail_base64,width_mm,height_mm}]` (마이그 0011) | Tier 1 검수는 **썸네일만으로 즉시 가능** — pdf.js 없이 시작 |
| 잡 큐+에이전트 | `auto_process_jobs`(0091) + `GET /api/auto-process/pending` 폴링 | convert/sheet_layout 잡 타입 확장 |
| 출력 3종+RIP | EPS(출력)/DXF(재단)/JPG(미리보기), `C:\TNSRip-X11\Job\*.job` (rip.ts:1382) | 무변경 |
| 매칭 데이터 | `order_items.ai_analysis_id`·`ai_group_index`, `orders.ai_file_path` | 검수 UI 데이터원 |
| 업로드 가드 | `utils/uploadValidation.ts` + R2 | 변환 산출물 업로드 |

⚠️ 원본 AI는 NAS(Z:) 경로 — 웹 노출용 PNG/PDF는 변환 잡이 생성해 **에이전트→API→R2** 업로드(썸네일과 동일 패턴).

## 4. 데이터 모델 (마이그 1건)

```sql
-- 시트 배치 문서
CREATE TABLE sheet_layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  canvas_json TEXT NOT NULL,        -- {width_cm,height_cm,margin_cm} (원단 폭 프리셋)
  placements_json TEXT NOT NULL DEFAULT '[]',  -- ia_params placements 포맷 그대로
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','locked','exported','printed')),
  locked_by INTEGER, locked_at TEXT,            -- D-C 시트 잠금
  source_analysis_ids TEXT,                     -- 참여 ai_analysis_id 목록(JSON)
  output_job_id INTEGER,                        -- sheet_layout 잡 연결
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);
-- auto_process_jobs.job_type 추가 (기존 행 호환 DEFAULT)
ALTER TABLE auto_process_jobs ADD COLUMN job_type TEXT DEFAULT 'auto_process';  -- 'auto_process'|'convert'|'sheet_layout'
ALTER TABLE ai_analysis_requests ADD COLUMN preview_r2_key TEXT;  -- 변환 산출 PNG/PDF
```
> NOT NULL+DEFAULT 준수, `clients` 무관, 신규 페이지 → `permission_pages` INSERT 필수.

## 5. API (신규 라우터 `src/routes/workbench.ts` + 기존 확장)

```
GET  /api/workbench/analyses?order_id=     그룹 썸네일+매칭 상태 (Tier 1)
PUT  /api/workbench/match                  order_item ↔ ai_group_index 수정 (검수)
POST /api/workbench/convert/:analysisId    convert 잡 큐잉 (D-A: 업로드 훅에서 자동 호출)
GET  /api/workbench/agent-health           에이전트 최근 폴링 시각 → 온라인 배지
CRUD /api/workbench/sheets                 sheet_layouts (+ POST /:id/lock·unlock — D-C)
POST /api/workbench/sheets/:id/auto-place  자동 배치 (D-D: 서버측 알고리즘, SheetLayout 포팅)
POST /api/workbench/sheets/:id/export      sheet_layout 잡 생성 (placements_json → ia_params)
```
전 라우트 entityFilter + requirePagePermission. 에이전트 측: `/pending` 응답에 job_type 포함(기존 에이전트 하위호환 확인).

## 6. UI (2페이지, `mes-ui-consistency` 준수)

1. **`/workbench` 검수**: 주문별 AI 그룹 썸네일 그리드 ↔ 품목 매칭 표시/수정, 변환 상태(pending/done)·에이전트 헬스 배지, [풀 렌더 보기(P1.5, pdf.js)]
2. **`/workbench/sheets/:id` 배치 캔버스**: Konva.js(CDN) — 원단 프리셋(127×55 등), 그룹 드래그·회전(90°)·스냅·정렬, **bleed 시각화(D-B: 확대분 반투명 표시)**, 충돌·여백 경고, 자동 배치 버튼, 잠금 배지, [내보내기]→export 잡
> Konva도 `?raw`/`<script src>` 어느 쪽이든 가능하나 **정적 에셋 P1~P3 이후 착수라 `<script src>` 방식 확정**.

## 7. JSX 변경 (단순화 — 코드 삭제가 주)

- `createEdgeStrip` 및 bleed 자동 오프셋 로직 **제거** (D-B)
- 대신 placement 실행 시 각 그룹을 `(width_cm+0.6, height_cm+0.6)` 으로 **중심 고정 스케일** (양변 +3mm) — 스케일식 1줄
- 입력은 기존 ia_params 포맷 그대로 (웹이 생성) → 검증: 좌표 왕복 테스트(§8-4)

## 8. 로컬 PoC 체크리스트 (P1 착수 전 1회 측정 — 실파일 필요해 Cowork 불가)

1. 최근 주문 AI 20개 표본: PDF 호환 저장 비율 (낮아도 D-A 변환 잡이 흡수 — 측정은 풀렌더 P1.5 판단용)
2. 대형 현수막 AI → PNG 변환 시 해상도·용량 상한 (R2 업로드 한도, 브라우저 표시 성능)
3. 미아웃라인 폰트 비율 (변환은 Illustrator가 하므로 렌더 정확성 영향 없음 — 확대 출력 검증용)
4. **좌표 왕복 1건**: 웹 placements(수기 JSON) → SheetLayout.jsx 실행 → EPS 실측 좌표 일치 + 미세 확대 bleed 시각 확인 ★핵심
5. RIP .job 입력에 EPS 경로 외 의존 없는지 확인

## 9. Phase 계획

| Phase | 내용 | 공수 | 선행 |
|---|---|---|---|
| P0 | §8 PoC (특히 왕복 테스트) + JSX 미세확대 패치 | 1세션 | #377 게이트(세션2)와 동시 가능 |
| P1 | Tier 1 검수 페이지 + convert 잡 + 에이전트 헬스 | 1~2세션 | P0 |
| P1.5 | (조건부) pdf.js 풀 렌더 — §8-1 결과 호환률 높을 때만 | 0.5세션 | P1 |
| P2 | Tier 2 배치 캔버스 + 잠금 + 자동 배치 포팅 | 2~3세션 | P1, 정적 에셋 P1~P3 |
| P3 | export 잡 연결 + JSX 단순화 배포 + 기존 플로우 전환 | 1세션 | P2 |
| P4 | Tier 3 고객 에디터 (별도 spec — 포털 결합) | — | P3 + 포털 brainstorming |

## 10. 검증

P0: 왕복 좌표 오차 0 확인. P1~: `npm run verify`+smoke+신규 페이지 Playwright, 매칭 수정의 entityFilter 격리 e2e. P3: 실주문 1건을 웹 배치로 출력→RIP→실물 확인(병행 운영 1주 후 기존 플로우 종료).
