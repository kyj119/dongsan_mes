# 세션 핸드오프 — 남은 GitHub 이슈 6건 전건 해소 (2026-07-27 #2)

> 세션별 덮어쓰기 파일. durable=[[design-claim-return-ar-adjustment]]. **전부 prod 배포·검증·이슈 close 완료. open 이슈 0건.**

## 배포 상태
- push: origin/main `7f56f39e`(코드 `729ee469` + status doc). prod deploy: `a8323bad`(`--branch main`).
- **prod D1 마이그 0474·0475** = `execute --remote --file` 직접 적용(✅ 검증 완료).
  - ⚠️ **prod d1_migrations 추적이 0313에서 멈춤**(실스키마는 0475). → `db:migrate:prod`(=migrations apply --remote) 쓰면 0314~0475 중복 재적용 시도 → 비-멱등 ALTER 실패. **신규 마이그는 반드시 `execute --remote --file` 직접 적용**.
  - 0474=fixed_expenses backfill(멱등 UPDATE), 0475=adjustments source_type/source_id ALTER + 부분 UNIQUE index.
- 검증: typecheck+build + 로컬 D1 SQL 실행 + apex(`/api/claims` 401·홈 302·deploy URL 401).

## 처리한 이슈 6건 (커밋 `729ee469`)
- **#571 형제-비대칭 IDOR 6핸들러** — 단건 PATCH/DELETE/GET에 entityFilter 이식:
  cards/lifecycle `PATCH /defects/:id` · printEvents `PATCH /:id/actual-printed` · stock-alerts `PATCH /:id/acknowledge` · cardExpenses `DELETE /auto-rules/:id` · hometaxInvoices `GET /jobs/:id/status` **+ 형제 스윕 `POST /jobs/:id/fetch`**(이슈 미기재분, 타법인 작업결과 임의 수집 차단).
- **#570 designer_intakes.order_item_id(0463) RESTRICT** — order_items 삭제 3경로에 `UPDATE designer_intakes SET order_item_id=NULL` 선정리(SET NULL로 흡수이력 존치): orders/core 하드삭제 batch · orders/update 재생성batch + 카드보존standalone. 미수정 시 흡수주문 삭제/라인교체 100% 500.
- **#557 포털계정 셀프발급 IDOR** — 기존 트리(`8efd59c7`)는 SUPER-ADMIN 전용 상향(방향c). **이번에 합집합 게이트로 완화**(사용자 선택 "실거래 검증"): 전체모드(entityId=0) 항상 허용 + 법인 ADMIN은 `orders(client_id)`/`purchase_orders(supplier_id)` 실거래 존재 시만 발급. clients.ts.
- **#567 클레임/반품 → AR 자동조정(근본)** — durable=[[design-claim-return-ar-adjustment]]. 마이그 0475 + `syncArAdjustmentStmts`(ar-helpers.ts) 멱등 헬퍼 + claims/returns resolve 배치 + core.ts 하드삭제 선정리(팬텀AR방지) + quality.js 넛지 "자동조정".
- **#554 부문손익 고정비** + **#560 하드삭제 감사경고** — **기존 `8efd59c7`이 사용자 선택방향(fixedRow 기간중첩+0474 backfill / audit_warning 응답)대로 이미 트리수정 완료** → 이번 배포로 반영. 추가코드 0.

## 핵심 판단·이유
- **open≠unfixed** (메모리 [[feedback-autoscan-false-positives]]): 이슈 4건(#554·560·557·567)이 이미 `8efd59c7`로 트리 수정돼 있었음 → 코드 대조 후 진행. #554·560은 그대로 배포 반영, #557·567만 사용자가 다른 방향 선택.
- **#557**: SUPER-ADMIN 게이트를 삭제가 아닌 **합집합으로 확장**(전체모드 유지 + 법인 실거래 검증 추가) → 배포된 보호 유지하며 운영편의 반영. 근본(portal.ts 전체 entity 스코프)은 미채택(별도).
- **#567**: DELETE→조건부INSERT 멱등 = 재해결/금액수정/방식전환(REFUND→REWORK) 자동정합. 수동조정(source_type NULL) 불간섭. entity는 클레임/반품의 것 스탬프(deriveClientBalance 정확상계).

## ⚠️ 주의사항
- **타 세션 dirty WIP**: 세션 종료 시점 메인 체크아웃에 내가 안 건드린 5파일 modified 상태 — `barobillCodes.ts`·`layout.ts`·`kakao.ts`·`messages.ts`·`barobillSms.ts`(바로빌/카톡/메시지 관련). **손대지 않음**(타 세션 소유). 커밋/revert 금지.
- **마이그 tracking 불일치**(위 배포상태 참조) — prod 마이그는 execute --file 직접.
- prod 실 E2E(클레임 resolve→adjustment 생성)는 **prod 데이터 오염 방지로 미실행**([[project-e2e-prod-pollution]]). 스키마·SQL은 로컬 D1로 검증.

## 다음 세션 TODO / 미결
- **#567 후속(별도 트래킹)**: (a) 클레임(REFUND)+연결 반품(refund) cross-source 이중계상 가능성 — 출처별 dedup만 됨. (b) portal.ts 전체 entity 스코프(#557 근본).
- 기존 블로커 유지: 품목 단가 전역(매출 base_price·무이력514·자재비 소진연결) · 간판 BOM.
- 타 세션 barobill/kakao WIP 완료 여부 확인 후 정리.

## 빌드/검증 명령 (PowerShell)
```
npm run verify              # typecheck + build
node --check src/scripts/quality.js
# prod 마이그(신규): npx wrangler d1 execute webapp-production --remote --file=./migrations/XXXX.sql
# prod 검증: curl -s -o /dev/null -w "%{http_code}" -A "Mozilla/5.0" https://webapp-9i0.pages.dev/api/claims  # 401=정상
```
