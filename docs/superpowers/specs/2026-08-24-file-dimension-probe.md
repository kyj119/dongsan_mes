# 파일 규격 자동 판독 (일러 불요) — 설계 확정 스펙

2026-08-24 확정 (용준님 선택 = **다: 전부**, 별도 세션 구현). 발단 = 가공·재단 피드백 질문 8(주문서 스케일 칸).

## 목적

주문서에서 파일을 연결하면 **일러스트레이터 없이** 파일 규격을 읽어 ①규격 프리필 ②배율(scale_factor) 자동 역산 ③불일치 경고를 제공한다.
근거 = 파일→주문서 백테스트에서 EPS `%%BoundingBox` 헤더 파싱 **100% 판독**(4,614건, `docs/order-file-matching/specless.py:16`) · 배율은 {1,2,5,10} 이산 스냅 성공률 100%(1,329건).

## 파싱 규칙 (신규 유틸 `src/utils/fileDimensions.ts`)

입력 = 파일 머리 64KB(+실패 시 꼬리 64KB) 텍스트. 출력 = `{ w_cm, h_cm, source }`.

| 형식 | 판정 | 추출 | 비고 |
|---|---|---|---|
| EPS (`%!PS-Adobe`) | `%%HiResBoundingBox` 우선, 없으면 `%%BoundingBox` | `(x1-x0)×(y1-y0)` pt | `(atend)`면 꼬리 64KB 재스캔 |
| PDF / .ai(PDF호환) | `%PDF-` 존재 | 첫 `/MediaBox [x0 y0 x1 y1]` | 간접참조(`3 0 R`)면 실패 허용 |
| .ai(pdfCompatible=false) | `%PDF-` 부재 | — | `source:'none'` — 에이전트 저장본이 이 형(memory `design-ai-save-pdfcompatible`) |
| JPG/PNG | — | — | **1차 제외**(DPI 신뢰 불가, 72 기본값 함정) |

- pt→cm = ×2.54/72. `/Rotate` 등 예외는 무시(확정은 사람).
- **의미 차이**: BoundingBox=작업물 범위(도련 포함 가능) · MediaBox=아트보드 → 프리필은 항상 "제안", 허용오차로 흡수.

## Phase 계획

### P1 — 파싱 유틸 + 게이트
- `src/utils/fileDimensions.ts` 신설. 순수 함수(문자열 입력)로 만들어 단위 테스트 가능하게.
- 게이트 `npm run test:file-dims` 신설(샘플 헤더 문자열 고정 — EPS/HiRes/atend/PDF/none 케이스).

### P2 — 업로드 통합 (`src/routes/aiAnalysis.ts:281` `/upload`)
- `file.slice(0,65536)`(+꼬리)를 파싱 — `file.stream()` R2 put과 독립이라 충돌 없음.
- 응답 `data`에 `measured_w_cm / measured_h_cm / measure_source` 추가.
- skip_analysis(직접연결) 시 `groups_json`의 '직접연결' 그룹(`aiAnalysis.ts:357` 구조)에 `width_mm/height_mm` 저장 → **마이그레이션 불필요**, 수정화면 재열람에도 사용.

### P3 — 주문서 UI (`src/scripts/orderForm/itemRow.js` `onLineFileSelected:618`)
- **파일 먼저**: 실측을 규격 칸에 프리필(배율 1 가정) + `dataset.origMm` 세팅 → 기존 `onScaleFactorChange:551` 로직과 자연 결합.
- **규격 먼저**: `배율 = 입력규격 ÷ 파일실측`을 가로·세로 각각 {1,2,5,10}에 스냅(허용오차 ±10%, 도련 흡수). 둘 다 같은 값으로 스냅되면 스케일 칸 자동 세팅.
- **불일치 경고**: 스냅 실패(어중간한 비율) 또는 가로·세로 스냅값 상이 → 경고 배지(규격 오타·파일 오연결 신호). 저장은 막지 않는다.
- 완성본(-3)도 규격 프리필은 동일 적용(스케일 칸은 기존대로 숨김 유지).
- ⚠️ pages↔scripts `getElementById` ID 대조 필수(CLAUDE.md §HTML↔JS Silent Fail).

### P4 — 가공대기함 폴백 (낮음, 선택)
- JSX 측정 실패 건(width/height NULL) 한정. **Worker는 Z: 접근 불가** → CEP 패널 JSX가 `File.read`로 헤더만 읽어(문서 열기 불필요) 등록 payload에 실어 보낸다.
- ⚠️ IA 배포축(축3·4) 수정 = `npm run audit:ia-jsx` + `ia:deploy` 필수.

### P5 — 소급 감사 도구 (선택)
- 기존 direct 연결 건(status='direct') 일괄: R2 소스 머리 파싱 → 연결된 order_items 규격×배율과 대조 리포트. admin 배치 엔드포인트 or 로컬 스크립트 — 세션에서 결정.

## 검증

- `npm run build && npm run verify` + `npm run test:file-dims` + smoke.
- 실측: 주문서에서 실제 EPS/AI/PDF 각 1건 연결해 프리필·역산·경고 3경로 확인.
- 신규 페이지 없음 → permission_pages 불요.

## 구현 결과 — P4·P5 (2026-08-24 후속, `ab533dc0`·`018bf35a`, prod 배포)

- **P4 위치 정정**: NULL 규격의 실제 생산자는 CEP 패널이 아니라 **zscan 스캐너**다 — 패널 두 경로(A0·재단)는 측정 실패 시 `nobounds` 로 등록 자체를 중단해 NULL 을 만들지 않는다. 폴백은 `scripts/zscan-intake.cjs` 에 구현(파서 정본을 esbuild 트랜스파일, 사본 없음): 헤더판독 × 제품유형 배율표(`scale_table.csv`, support≥0.85만) — 표 밖 유형·유형없음은 채우지 않고(추측 금지) `post_desc` 에 `규격:파일실측×N` 출처를 남긴다. IA 배포축 무접촉. 실측: 6월 미파싱 258건 중 3건 채움(전부 온전)·판독불가 0 — 커버 확장은 전사축 배율표 학습이 별건.
- **P5**: `GET /api/ai-analysis/audit-dimensions` (ADMIN·읽기전용·페이징) — R2 range 읽기로 머리 64KB 판독, 라인 규격÷배율과 ±10%·회전 허용 대조. `/:id` 보다 먼저 등록(리터럴 경로 삼킴 함정). prod 실행 결과 **대상 0건** — 8/13 8월 주문 삭제로 직접연결 링크 전량 소멸, `order_ai_files` 도 0. 재적재·신규 축적 시 바로 사용 가능.

## 구현 결과 — P1~P3 (2026-08-24, `b98c7044` prod 배포 완료 — smoke 116/116·마커 실측)

- 게이트 `test:file-dims` 19케이스 통과 · dev:d1 + Playwright 3경로 실측 통과. 정본 = memory `design-file-dimension-probe`.
- **스펙 정정 2건 (실파일 실측)**:
  1. **판정은 PDF-우선이어야 한다** — .ai 는 머리 64KB 안에 AI 네이티브 헤더(`%!PS-Adobe` + `%%BoundingBox: 0 0 0 0`)를 임베드하고 있어, 표 순서(EPS 먼저)대로 구현하면 0×0 bbox 에 가로채여 정상 .ai 가 none 이 된다. 구현 = %PDF-(앞 1KB) → MediaBox → 임베디드 bbox 폴백 → 순수 EPS.
  2. **".ai(pdfCompatible=false) = %PDF- 부재 = none" 행은 실파일에서 성립하지 않는다** — memory `design-ai-save-pdfcompatible` 2026-07-31 정정(옵션 무효, 30.7 재확인)대로 .ai 는 비호환 저장이어도 `%PDF-` + 정상 MediaBox(아트보드)를 가진다 → **프리필이 뜬다**(none 이 아니라 pdf-mediabox). none 이 되는 실물은 JPG/PNG 뿐.
