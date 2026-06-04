# 카드/주문 상태 모델 단일화 (Status Model Unification)

작성: 2026-06-05 | 상태: **Phase 1~4 구현 완료 + 로컬 E2E 검증 / prod 미배포**

## 구현·검증 결과 (2026-06-05)
- **Phase 1~4 코드 완료**, typecheck+build 통과. 마이그 `0298` 생성.
- **로컬 dev환경 복구**: 기존 D1이 0089까지만 적용(PRINT_PENDING INSERT 불가) → 전체 294개 클린 재적용(0001→0298) + seed. dev:d1 정상 기동. **마이그 체인 처음부터 클린 적용 확인.**
- **실 라우트 E2E PASS**:
  - #1: 유통주문(카드없음) `PATCH /api/orders/bulk-ship` → `status=SHIPPED` 즉시 + `billable_after`(+4d) + history 기록.
  - #2: `status=PRINT_PENDING` 카드 → `/api/cards/board` summary `pending=1` + `kanban_column=rip_waiting` 목록 노출. (구 쿼리로는 0=불가시 재현.)
  - #3: 코드 단일화(printEvents). 실 print-event 시뮬레이션은 미수행(로직·빌드 검증).
- **🔴 최대 미결 — prod `cards.status` CHECK 미확인(권한차단)**: 0284(PRINT_PENDING 추가) prod 적용 여부에 따라 #2 원인이 갈림.
  - 0284 미적용 → core.ts:244 `INSERT 'PRINT_PENDING'`가 CHECK 위반 → **카드 생성 실패가 #2의 진짜 원인. Phase 1(보드) 단독으론 미해결, 마이그(0284/0296/0298) prod 적용이 실제 fix.**
  - 0284 적용 → Phase 1으로 #2 해결.
- **배포 플랜**: ①prod CHECK 확인 → ②마이그 0298(+미적용 0284/0296) `db:console:prod --file` 직접 적용 → ③`deploy:prod`(ASCII 커밋 우회) → ④prod 스모크 + #1·2·3 실검증(배포 전 최근 IA 주문 status 스냅샷 비교).
- **후속(저우선)**: 상태 라벨 단일소스화(clientDetail.js·orders.js·portalOrders.js 각자 statusLabels 보유).

---
작성 당시 계획: 설계 확정, Phase 1 착수

## 배경 — 이중 모델 충돌

코드 내에 상충하는 두 상태 모델이 공존하여 #1·#2·#3 증상을 유발.

- **모델 A** ("PRINT_PENDING이 실제 상태"): 카드 생성 `core.ts:244` → `PRINT_PENDING`, 스캔 `scan.ts:217` → PRINTING, productionBoard.js.
- **모델 B** ("항상 status=PRINTING, rip_status로 구분"): 생산보드 `queries.ts:748·772` (pending=PRINTING+rip null, printing=PRINTING+QUEUED/SENT), 주문동기화 `lifecycle.ts:25-72` (PRINTING/PRINT_DONE/HOLD만 집계).
- 추가 난립값: `RIP_WAITING`(printEvents·orders.js·cardDetail.js), `PRINT_ERROR`(migration 0296).

두더지잡기 정황: 커밋 `1cb77e9`가 #3(주문 PRINTING 점프)을 막으려 생성상태를 PRINT_PENDING으로 변경 → 보드(모델 B)가 PRINT_PENDING을 못 봐서 #2(카드 안 보임) 유발.

## 표준 모델 (확정) — 단일 축

### cards.status (생산 단계, 보드 메인, 단일 축)
| 값 | 한글 | 진입 트리거 |
|---|---|---|
| `PRINT_PENDING` | 출력대기 | 카드 생성 시. IA 가공·RIP 전송 중에도 유지 |
| `PRINTING` | 출력중 | **LogWatcher 실제 인쇄 감지** (보조: 오퍼레이터 수동 '출력 시작' scan.ts CARD:start-print) |
| `PRINT_DONE` | 출력완료 | 전 타일/항목 인쇄 완료 |
| `HOLD` | 보류 | 불량/이슈 |
| `SHIPPED` | 출고완료 | 출고처리 |

### cards.rip_status (RIP 파이프라인, 내부 디테일, 배지만)
`NULL → QUEUED → SENT → COMPLETED / ERROR`. **보드 탭/카운트에 사용 금지.** 상세/배지로만 표시.

### orders.status
`DRAFT/QUOTATION → CONFIRMED → PRINTING → PRINT_DONE → SHIPPED` (+ HOLD/CANCELLED).
- CONFIRMED → PRINTING: 카드 하나라도 실제 PRINTING(LogWatcher) 진입 시.
- 유통(카드 없는) 주문: 출고처리 시 CONFIRMED → SHIPPED **즉시**.

### 폐기/통합 (확정)
- `RIP_WAITING` (status값) → 폐기. RIP 상태는 rip_status로. 재RIP 리셋(lifecycle.ts:1274)은 `PRINT_PENDING`으로.
- `PRINT_ERROR` (status값) → 폐기. 오류는 `rip_status='ERROR'` + quality_issues로만 관리. status는 PRINT_PENDING/HOLD 유지.

## 결정 근거 (사용자 확정 2026-06-05)
1. PRINTING 진입 = 장비 실제 인쇄 감지(LogWatcher). IA 가공·RIP 전송은 출력 아님.
2. 카드 생성~출력 시작 사이 단계는 단일 '출력대기' 하나로 충분. RIP는 내부 디테일.
3. 유통 주문 출고처리 시 즉시 SHIPPED (지연 sync 의존 폐기).
4. PRINT_ERROR는 rip_status='ERROR'+불량으로 통합.

## 운영 전제
LogWatcher 미커버 장비/수동 출력 건은 자동 PRINTING 안 됨 → 오퍼레이터 수동 '출력 시작'(scan.ts CARD:start-print) 보조 유지. PrintExp main 장비는 LogWatcher 커버됨.

## Phase 계획
- **Phase 1 — 상태 정의 단일화 + 보드 가시성(#2)**: `queries.ts` /board 버킷을 status 기준으로(PRINT_PENDING 탭/카운트 노출), rip_status는 배지 강등. cards.js 라벨/탭. → #2 해소.
- **Phase 2 — PRINTING 트리거 단일화(#3)**: 최근 IA 주문 DB 실측 후 조기 전이 지점 특정. `printEvents.ts:248` RIP_WAITING→PRINT_PENDING 체크 교정, LogWatcher 외 PRINTING 전이 제거. sync는 실제 PRINTING 카드 기준. → #3 해소.
- **Phase 3 — 유통 즉시 출고(#1)**: `orders/queries.ts` bulk-ship allShipped 시 status=SHIPPED 즉시(billable_after 유지). shipments.ts /:orderId/ship 동일. → #1 해소.
- **Phase 4 — 레거시 정리**: RIP_WAITING/PRINT_ERROR 데이터 정리 + CHECK 제약 마이그레이션. statusLabels 중복 제거(단일 소스). build + smoke 회귀.

## 영향 파일
core.ts(244), cards/lifecycle.ts(25-89·1179·1274), cards/queries.ts(745-817), printEvents.ts(110-157·246-265), rip.ts(rip_status만 확인), scan.ts(217), orders/queries.ts(187-264), orders/core.ts(2516-2621), shipments.ts(774-816), scripts/cards.js·cardDetail.js·orders.js·productionBoard.js, migrations(신규).
