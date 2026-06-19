# 시안 원본 아카이브 + 정리 보드 — 폐기되던 고객 원본을 작업 EPS와 함께 보존·조회

- **작성일**: 2026-06-16 (brainstorming 세션, 모델 재정의 후 재작성)
- **상태**: ⤴️ **흡수됨** → `2026-06-16-ia-editor-nesting-intake.md`(마스터)의 **P1(원본 자동 아카이브)**로 통합. 이 문서는 아카이브 부분 상세 참조용으로 보존
- **관련**: `2026-06-11-web-canvas-ia-workbench.md`(`/workbench` = 본 보드의 기반·이미 코드 존재), `2026-06-11-incoming-file-editor.md`(편집기 = 보류)
- **개념 교정 이력**: "검수 보드"(1차 오해) → "시안 자산 관리"(원본/작업 분리) → **"원본 아카이브 + 보드"**(현행 IA가 원본을 폐기한다는 발견으로 확정)

---

## 0. 확정 결정 (2026-06-16)

| # | 결정 | 내용 |
|---|---|---|
| D1 | 형태 | **경량 정리 보드** — 캔버스 편집기 ❌. "편집기 형태" = 보기 좋은 비주얼 보드 |
| D2 | "정리"의 정의 | 디자이너 PC에 산재한 고객 파일 문제 해결 = **원본(고객제공) ↔ 작업파일(완성 EPS) 분리 보존 + 자동 리네임 + 보드 조회** |
| D3 | 구현 경로 | 기존 `/workbench` 확장 |
| D4 | 저장소 | **NAS(Z:)** — IA 에이전트가 파일 조작, 웹은 썸네일만 |
| D5 | 인입 | **기존 주문연결 흐름**(`ai_file_path`) 사용 — 별도 감시폴더 신설 안 함 (자체 판단). IA가 처리 후 원본을 보존 |
| D6 | 마이그 범위 | **앞으로의 파일만** — 기존 산재 파일은 용량상 백필 제외 |
| D7 | 작업파일 정의 | **완성 .eps** (현재 디자이너 수작업, 향후 IA/편집기 산출) |
| D8 | 원본 보관 위치 | **별도 원본 트리** (`Z:\원본\...`, 작업 트리 `Z:\DESIGN\...`와 평행) |
| D9 | 원본 명명 | **현행 IA 작업 EPS 파일명 규칙과 동일** + 원본 확장자 |
| D10 | 후가공·승인 | 🔵 **논의 중** (§8) — 현 구조 위에서 기능적 정리 방안 추가 논의 |

## 1. 왜

고객 원본 시안이 **디자이너 개인 PC마다 산재** → 중앙 못 찾고·공유 안 되고·PC 고장 시 유실·재주문/분쟁 시 추적 불가.
결정적으로, **현행 IA는 원본을 가공 후 폐기한다**(임시폴더 처리 → 삭제, `Program.cs:1760`). 작업 EPS만 NAS에 규칙대로 남는다.
→ **원본을 작업 EPS와 동일 규칙으로 별도 트리에 영구 보존**하고, 웹 보드에서 원본↔작업본을 나란히 조회.

## 2. 현행 규칙 (코드 검증 — 2026-06-16)

| | 경로 / 명명 | 보존 | 근거 |
|---|---|---|---|
| **작업 EPS** | `Z:\DESIGN\[카테고리]\YYYY\MM\DD\[주문번호]\` | ✅ 규칙대로 | C# `Program.cs:2111` |
| 작업 EPS 파일명 | `[주문번호]-[순번FFF]-[거래처]-[규격WxH]-[품목]-[수량]EA.eps` | | C# `Program.cs:2095` (`SanitizeFilename`) |
| 카테고리 | `items.category`(1차)·`item_name`(2차)·'기타' → 폴더명 | | C# `Program.cs:2098`, TS `autoProcess.ts:313` |
| **원본 고객파일** | 임시폴더 `C:\Temp\...\req_{id}\source.ext` 처리 후 **삭제** | ❌ **아카이브 없음** | C# `Program.cs:903,1760` |
| 인입(원본 입력) | 주문 생성 시 `orders.ai_file_path`(로컬경로 또는 `r2://`) → IA가 task claim으로 읽음 | | TS `orders/create.ts`, C# `Program.cs:1436` |

> ⚠️ **경로 불일치 함정**: 작업 EPS 실제 쓰기는 C#이 `Z:\DESIGN\[카테고리]\...`(`Program.cs:2111`)인데, TS가 DB에 기록하는 `saved_path`는 `Z:\[카테고리]\...`(`autoProcess.ts:321`, **DESIGN 누락**). 보드가 작업파일 위치를 찾을 때 reconcile 필요.

## 3. 목표 모델

```
[주문 생성] 원본 첨부 (ai_file_path) ──→ [IA task claim] 원본을 임시폴더로 수신
   ↓ 분석(ExtractGroups) → groups_json(썸네일)        ↓ 가공(ProcessOrderItem) → 작업 EPS (Z:\DESIGN\...)
   ↓
[IA 아카이브 단계 — 신규]  (삭제 단계를 보존 단계로 교체)
   원본을 작업 EPS와 동일 baseName(Program.cs:2095) + 원본 확장자로 리네임
   → Z:\원본\[카테고리]\YYYY\MM\DD\[주문번호]\[동일명].[ai|eps|pdf]  (영구 보존)
   → API로 archive_path 보고 → DB(original_archives) 기록
   ↓
[웹 보드] /workbench "파일 아카이브" 뷰:
   주문별 카드 = 원본 썸네일 + 작업 EPS 썸네일(output_png) 나란히 + 메타 + 상태
   분류/필터: 카테고리·거래처·기간·상태
```

- 원본 1 : 작업 N (한 원본에서 디자인/품목별 여러 EPS) — 보드는 주문 단위로 원본·작업을 묶어 표시
- 원본 첨부 없는 주문 = 아카이브 대상 없음(graceful skip). 앞으로 첨부가 표준.

## 4. 원본 아카이브 사양

| 항목 | 값 |
|---|---|
| 위치 | `Z:\원본\[카테고리]\YYYY\MM\DD\[주문번호]\` (별도 트리, D8) |
| 파일명 | `[주문번호]-[순번FFF]-[거래처]-[규격WxH]-[품목]-[수량]EA.[원본ext]` — 작업 EPS와 동일 규칙(D9), `Program.cs:2095` baseName 재사용 |
| 시점 | **가공 성공 완료 후**, temp 삭제(`Program.cs:1760`) 직전에 원본 복사 (실패 시 미아카이브) |
| 확장자 | 원본 그대로 (.ai/.eps/.pdf) |
| 원본 보존성 | 불변(아카이브 후 읽기전용 취급). 재가공 시 덮어쓰기 금지·순번 분기 |

## 5. 데이터 모델 (마이그 1~2건)

```sql
-- 원본 아카이브 기록 (작업 EPS는 기존 auto_process_jobs.output_eps_path/output_png_path 사용)
CREATE TABLE original_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  ai_analysis_id INTEGER,             -- 분석/썸네일 연결
  order_ai_file_id INTEGER,           -- 1:N 파일(order_ai_files, 0254) 연결 (있으면)
  archive_path TEXT NOT NULL,         -- Z:\원본\... 최종 경로
  original_filename TEXT,             -- 고객이 준 원래 파일명 (참조)
  file_ext TEXT,                      -- ai|eps|pdf
  thumbnail_base64 TEXT,              -- 보드 표시용 (groups_json에서 복사 가능)
  status TEXT NOT NULL DEFAULT 'archived' CHECK(status IN ('archived','failed')),
  entity_id INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT DEFAULT (datetime('now'))
);

-- 스키마 드리프트 보충 (코드 사용 중·마이그 누락 — autoProcess.ts:77)
ALTER TABLE order_items ADD COLUMN finishing2 TEXT;
ALTER TABLE order_items ADD COLUMN finishing3 TEXT;
```
> NOT NULL+DEFAULT 준수 · `clients` 무관 · INSERT 시 entity_id 명시(DEFAULT 1 함정). ALTER 전 PRAGMA로 부재 재확인(멱등성).

## 6. IA 에이전트 변경 (C# — IllustratorAutomat)

- `Program.cs:1760` 임시폴더 정리 직전에 **원본 아카이브 단계 삽입**: 원본 source 파일을 `Z:\원본\...` 경로로 복사
- 파일명 baseName 로직(`Program.cs:2095`) **재사용** (주문번호·순번·거래처·규격·품목·수량) — 작업 EPS와 동일
- 카테고리/연월일/주문번호 폴더 구성(`Program.cs:2111` 패턴)을 `DESIGN` → `원본`으로 분기
- 아카이브 성공 후 `POST /api/workbench/archive` 로 `archive_path` 등 보고
- C# 변경이므로 `dotnet publish` 후 EXE 재시작 필요 (memory: IllustratorAutomat 빌드)

## 7. API + 웹 보드

```
POST /api/workbench/archive          IA가 원본 아카이브 완료 보고 → original_archives INSERT
GET  /api/workbench/board            주문별 원본↔작업 갤러리 (썸네일·메타·상태), 필터 q/category/client/기간/entity
GET  /api/workbench/board/:orderId   상세 (원본 + 작업 EPS 목록)
```
- 전 라우트 `orderVisibilityFilter` + 기존 `requireRole('ADMIN','MANAGER','DESIGNER')` 유지. `original_archives` INSERT 시 entity_id 격리
- **웹 보드 UI**: `/workbench`에 "파일 아카이브" 뷰 토글 추가. 주문 카드 = 원본 썸네일 + 작업 EPS 썸네일 + 메타(거래처/카테고리/규격/수량) + 상태 배지. `getElementById` 대상은 `scripts/workbench.js`와 대조(silent fail 방지). 기존 `/workbench` 확장이라 `permission_pages` INSERT 불요

## 8. 후가공·승인 레이어 (🔵 논의 중)

**현 구조 (검증)**:
- 후가공: `order_items.finishing`·`finishing2/3`(드리프트)·`post_processing`(JSON), `finishing_methods` 마스터(열재단·접어미싱·줄미싱·밴드미싱+margin, 0176), `cards.finishing`. ProcessOrderItem.jsx에 펀칭·주석·재단선 로직
- 승인: `auto_process_jobs.status`에 **`approved` 값이 이미 존재** (pending→processing→done→approved→failed)

**제안 (확정 전)**: 후가공 = 보드에 요건 **read-only 표시**(정본=order_items, finishing2/3 보충) / 승인 = **기존 `auto_process_jobs.approved` 재사용·노출**(별도 승인개념 신설 회피). → 다음 세션에서 확정.

## 9. Phase 계획

| Phase | 내용 | 공수 |
|---|---|---|
| **P1** | IA 원본 아카이브(C#: 삭제→보존) + `original_archives` 마이그 + `POST /archive` + finishing2/3 보충 | 2~3세션 (C# 빌드 포함) |
| **P2** | 웹 보드 — `/workbench` 파일 아카이브 갤러리 뷰(원본↔작업 썸네일) + 분류·필터 | 1~2세션 |
| **P3** | 후가공·승인 레이어 (§8 논의 확정 후) | TBD |

## 10. 검증

- P1: 실주문 1건 가공 → 원본이 `Z:\원본\[카테고리]\...`에 규칙대로 보존되는지 실측 + temp 삭제 정상 + 실패 시 미아카이브. `dotnet publish`/EXE 재시작 후.
- P2: `npm run verify` + `npm run build && npm run smoke` + `/workbench` 보드 뷰 Playwright(admin/password) + entityFilter 격리 e2e(타 법인 원본 비노출).
- finishing2/3 보충 후 `autoProcess.ts` 경로 회귀 확인.

## 11. 범위 밖 (명시적)

- **기존 산재 파일 백필** — 용량상 제외, 앞으로 파일만 (D6)
- **시안 편집기**(문구패치·색교체) = incoming-file-editor.md — 보류
- **시트 배치 캔버스**(Konva) = web-canvas-workbench Tier2 — 별개
- 경로 불일치(§2 ⚠️)·finishing2/3 드리프트는 P1에서 reconcile
