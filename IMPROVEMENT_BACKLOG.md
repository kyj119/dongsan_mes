# Improvement Backlog
<!-- last_run_area: 4 -->
<!-- last_run_at: 2026-08-28T03:46:30+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **12** (`list_issues(state:open,label:auto-improve)` 실측, 변동없음: #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **532** (변동없음) |
| ❌ rejected | **6** (재확인 생략 — 대상 무변경) |

> **Area 4 데이터 정합성 (2026-08-28T03:46):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD), `git fetch origin main` → `forced update`로 표시됐으나 `git merge-base --is-ancestor e2f5c938 origin/main` = true(fast-forward 확인, rewrite 아님) → `git checkout main && git reset --hard origin/main`(HEAD `e2f5c93`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area4 자신의 앵커(`1676955`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **24커밋** — 대부분(재고 pack_size 환산 축 정정 5커밋·창고탭 노출·품목분류)은 Area1·2·3·6이 각자 렌즈로 이미 정독. **신규 마이그 0건**(NOT NULL/CHECK/FK 스캔 대상 자체 없음) — 이번 사이클은 **데이터정합성 렌즈로 24커밋 전체 재통과**.
> - **`f1895a0` 심층 정독(신규 커밋, 판재 자재선택 tie-break 버그픽스)**: `boardMats[0]`(ORDER BY 없는 쿼리의 행 순서 의존 선택)가 같은 자재의 3x6/4x8 규격이 BOM에 공존하는 UV 포맥스 10종에서 소요량을 1.78배 갈랐던 버그 — CLAUDE.md의 "ORDER BY 고유키 tie-break 필수" 원칙을 **쓰기·선택 경로**(표시가 아니라 어느 자재가 처리되는지)에 그대로 적용한 정정. `rollConsumption.selectBoardMaterial()` 신설(면적 최소 우선, 안 맞으면 최대 폴백, `material_item_id` tie-break)로 두 호출부(`autoDeductInventory.ts`·`materialRequirement.ts`) 모두 단일소스 경유 확인, `grep`으로 잔존 `[0]` 선택 0건. `npm run test:stock-unit` 30/30 통과(회귀주입 3건 실패 확인됨 = 테스트 유효) — **clean, 자동수정 대상 아닌 이미 완결된 dev 세션 정정**.
> - **`c09d0b8` 확인(entity-audit.mjs 게이트 자체 개선)**: `financialReports.ts` 6건이 08-24부터 매 사이클 "FP 확정" 재확인만 반복되던 것을, 별칭 대조 기반 규칙⑤(entityFilter 헬퍼 없이 직접 `<별칭>.entity_id`로 좁힌 패턴 인식)로 근본 해소 — `npm run audit:entity` 재실행 결과 **누락 0건**(기존 6건 FP 전부 해소). 자기검사 7개 fixture(`--selftest`, 평시 실행경로에도 포함)로 GROUP BY 오인·타테이블 별칭 오매칭 등 회귀주입 방어 확인, `node scripts/entity-audit.mjs --selftest` 7/7 통과. **다음 사이클부터 매번 "net-new 0" 재확인하던 financialReports.ts 언급 불필요**.
> - **`ca46317` 확인(item-master-audit.cjs F5 게이트 스코핑)**: 취소된 발주 1건뿐이라 판정 근거 자체가 없는 품목(LGSHT-122)이 게이트를 영구 적색으로 고정하던 문제를 "유효 매입/판매 증거 있는 품목만 판정"으로 스코핑 — C1/C2 분리와 동일 원칙. `npm run audit:items:selftest` 7/7 통과(prod D1 직접조회는 이 샌드박스에 `CLOUDFLARE_API_TOKEN` 없어 불가, 코드 레벨 검토로 대체). 도메인 전문가 수기검증 영역(owner 수기 SQL 동반) — Area4 자동스캔 대상 밖, 기존 판정과 동형.
> - **신규 write문 3건 개별 확인**: ① `inventoryCount.ts` 라인 INSERT 실패 시 헤더 보상삭제(이미 Area6 08-27T01:20이 정독, 재확인만) ② `purchaseRequests.ts` `UPDATE ... SET supplier_id`(read-back 404 게이트 선행, 이미 Area1·3·5·6이 정독) ③ `workbench.ts` `UPDATE print_events SET order_number`(entity_id 미교정 = 기존 #621과 동일 근본원인, 중복이슈화 안 함).
> - **standing scan**: ① `node scripts/sort-audit.cjs` P1 **0건**(변동없음, P2 1건 attendance.ts:158 기존 노출 유지). ② 신규 `SET <col> = ... + ?` 증분 aggregate 패턴 0건(denormalized delta 위험 없음). ③ 신규 `date('now')`/`datetime('now')` 리터럴 0건(KST/UTC 위험 없음). ④ FK 컬럼 비-id 바인딩 sweep — 신규 write 3건 전부 users(id) FK 컬럼 무관.
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지). Area4 소관 #614·#615 재확인 — 이번 churn이 손댄 파일과 무관, 무변화.
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 대상 무변경).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 새 오탐/탐지 클래스 발견보다 **기존 만성 FP(financialReports.ts 6건)가 게이트 자체 개선으로 해소**된 것을 확인 — 다음 사이클부터 그 재확인 절차 생략 가능.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 도달 → 아래 트림 실행.
> - 신규 이슈 0건(24커밋 전체 데이터정합성 렌즈 clean, 신규 write문 3건 개별확인 clean, 만성 FP 1건 게이트 자체개선으로 해소), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-27T21:47):**
> - **방법**: `git status`=워킹트리 clean, `git fetch origin main` → `forced update`로 표시됐으나 `git merge-base --is-ancestor 5cadd9f origin/main` = true(fast-forward 확인, rewrite 아님) → `git checkout main && git reset --hard origin/main`(HEAD `5cadd9f`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area3 자신의 앵커(`ef80c95`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **25커밋** — 대부분 IA/cut(IllustratorAutomat 패널·재단·품목감사) 스크립트로 UX 스캔 범위 밖. 프론트/라우트 churn은 **재고 pack_size 환산 UX 체인**(`inventory.ts/js`·`inventoryDashboard.js`·`inventoryCount.js`)과 **발주요청 공급처 지정 UX**(`purchaseRequests.js`·`purchaseOrders.js`·`purchaseRequestForm.js`)로 좁혀짐. 신규 마이그 0건.
> - **HTML↔JS silent-fail 전수 diff**: churn 범위 신규 `getElementById` 7개(`adjustCurrentStock`·`adjustItem`·`adjustItemSearchBtn`·`apprSupplierId`·`apprSupplierName`·`panelProgress`·`panelStatusBadge`) 전건 대상 id 실재 확인(pages 정적 템플릿 또는 같은 파일 동적 innerHTML) — silent-fail 0건.
> - **axios→라우트 존재성**: 신규 axios 호출 6개(`/api/auth/entities`·`/api/clients`·`/api/clients?search=`·`/api/inventory/:id`·`/api/purchase-requests/open-items`·`PATCH /api/purchase-requests/:id/supplier`) 전부 해당 라우터에 실재(`purchaseRequests.ts:165` `open-items`, `:597` `/:id/supplier`) — dead-button 0건.
> - **신규 화면 요소 심층 정독 4건**: ① `inventoryDashboard.js`(+82) 구역별 부족품목 발주 — 미결 발주요청 품목을 배지로 표시하고 이미 요청중인 품목은 자동 제외(중복발주 방지), confirm 메시지에 발주단위·환산량 병기, 생성 후 `loadDashboard()` 재호출로 배지 즉시 반영 — UX 완결. ② `purchaseRequests.js`(+49) 공급처 미지정 승인건 전용 "공급처 지정" 버튼 — readonly 입력+검색모달 강제(오입력 방지), 미지정 승인 시 `showConfirm` 경고, `escapeHtml` 일관 적용 — clean. ③ `inventoryCount.js`(+52) 상태배지를 서버응답 기준으로 재그리기(목록캐시-상세패널 불일치 수정) + 진행률 함수 단일화(중복→일원화) — clean. ④ `inventory.ts/js` adjustItem 검색모달 추가(2페이지 이후 품목 조정 불가 문제 해결) — `console.warn` 가드 전건, 에러 toast 처리 — clean. **넷 다 자동수정 대상 아닌 이미 완결된 dev 작업, 신규 이슈 없음.**
> - **"백엔드 먼저·화면 나중" gap 재확인**: 이번 churn의 신규 라우트 2개(`open-items`/`:id/supplier`) 둘 다 같은 커밋에서 프론트 소비처(`purchaseRequests.js`) 동반 — gap 없음. `workbench.ts`(+56, 출력완료 매칭 학습 backfill)는 기존 `/intakes/:id/absorb` 액션에 붙은 서버 전용 부수효과(신규 UI 불요) — 대상 아님.
> - **standing scan**: `node scripts/sort-audit.cjs` P1 **0건**(변동없음, P2 1건 attendance.ts:158 기존 노출 유지).
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 대상 무변경).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 서술식 각주만 존재). 이번 25커밋 churn을 UX 렌즈로 전량 재통과했으나 신규 오탐/탐지 클래스 도출 없음(기존 standing scan 레시피 — silent-fail diff·axios matching·백엔드먼저화면나중 — 가 전부 커버, 이번 churn은 dev 세션 자체가 이미 UX까지 완결한 수준).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(25커밋 전체 UX 렌즈 clean, 신규 화면 4건 심층정독 전부 clean, silent-fail/axios/backend-first standing scan 전부 net-new 0), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-27T14:00):**
> - **방법**: `git status`=워킹트리 clean, `git fetch origin main` → `forced update`로 표시됐으나 `git merge-base --is-ancestor 77d5d6d5 origin/main` = true(fast-forward 확인, rewrite 아님) → `git checkout main && git reset --hard origin/main`(HEAD `d7f97e3`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area2 자신의 앵커(`2f9f88f`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **24커밋** — 대부분 IA/cut(IllustratorAutomat 패널·재단) 스크립트로 code-quality 스캔 범위(entity_id·auth·N+1) 밖. 핵심은 **재고 pack_size 환산 수정 체인 5커밋**(`cde2ac5`/`ec84f55`/`eda1905`/`b993cf0`/`2f0aaaa`)과 `50c99f0`(창고 탭 노출+공급업체지정, 이미 Area1·6이 정독)·`30f446f2`(품목감사 게이트C 분리, CLI전용).
> - **#609 완료 확인**: 기존 오픈 이슈 #609("unitConvert.ts toBase/formatStock 0호출, write-path 3곳 인라인 재구현")가 오늘 dev 세션 `cde2ac5`로 정확히 해소됨을 코드 대조로 확인 — `unitConvert.ts`에 `packFactor()` SSOT 신설, **5개 write-path 전체**(`inventory.ts` 수기입고·입고취소, `scan.ts` 스캔입출고, `po-receive.ts` PO입고) 재확인 결과 인라인 재구현 잔존 0건, 전부 `packFactor()` 경유. 코멘트 남기고 close(completed).
> - **신규 발견 — #621**: `workbench.ts`의 오늘 추가된 "출력완료 매칭 학습"(흡수 시점 파일명→주문번호 소급 backfill)을 정독하다가, `printEvents.ts:39-54` `deriveCardEntityId()`가 카드/카드번호 둘 다 모르면(에이전트 엔드포인트, 매칭 전) **entity_id=1로 무조건 디폴트**하고, 기존 `POST /link`·신규 workbench 학습 두 backfill 모두 order_number/card_id는 소급 교정하면서 **entity_id는 교정 안 함**을 확인. `grep -rn "pe.entity_id\|print_events.entity_id\|entityFilter(c,'pe')" src/routes` = 0건 — 대시보드/생산리포트/OEE 전부 이 컬럼을 안 써서 **활성 피해는 0건**(설비가 전사 공유라 원래 무관할 수도 있음)이나, 마이그 0264가 명시적으로 격리 목적 추가한 컬럼이라 향후 법인별 생산리포트를 만들 때 소급 오염된 데이터가 그대로 쌓여 있게 됨. issue化(#621, improvement/S) — production write-path 귀속 의미 변경이라 자동수정 대상 아님.
> - **standing scan**: `npm run audit:entity` — 누락 6건, 전부 `financialReports.ts`(Area4가 이미 FP 확정한 대상과 동일, net-new 0). `purchaseRequests.ts`(69줄 변경, `/open-items`·`PATCH /:id/supplier`) 재정독 — 둘 다 `entityFilter` 정상 적용, Area1 05:30 사이클이 이미 확인한 것과 동일 결론 재확인.
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 1건(#621, entity_id backfill 미교정), 완료 1건(#609 close), 자동수정 0건, done-sync: open 12(구성 변경, 총량 불변)·done 532(+1)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-27T05:30):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → `forced update`로 표시됐으나 `git merge-base --is-ancestor 424f769e origin/main` = true(fast-forward 확인, rewrite 아님) → `git checkout main && git reset --hard origin/main`(HEAD `77d5d6d5`, 직전 Area6 자신의 커밋과 동일 트리). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area1 자신의 앵커(`d72e497`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **27커밋** — 전부 Area2~6(08-25~08-27)이 각자 렌즈로 이미 정독 완료(재무/여신·D1 ANALYZE·재고 존 페이징·품목분류 재판정·메시지 세그먼트·`50c99f02`/`30f446f2` 포함). 이번 사이클은 **prod-health 렌즈(smoke 맹점 4축 — 프론트실행·DROP write-path·agent-path FK·한글 리터럴 SQL)로 재통과**만 수행.
> - **신규 마이그레이션 0건**(`git log d72e497..HEAD -- migrations` 공백) → DROP/RENAME write-path 붕괴 리스크 자체가 없음(축 2 해당 없음).
> - **신규 라우트 4개 직접 정독**(축 3 agent-path FK 점검): `cronRouter.post('/analyze', agentKeyMiddleware, ...)`(ANALYZE 실행 + 통계행수 반환, audit 컬럼 write 없음) · `prRouter.get('/open-items')` · `prRouter.patch('/:id/supplier', requireRole('ADMIN'), ...)` · `settingsRouter.get('/credit-policy', requireRole('ADMIN'), ...)` — 4개 전부 GET/역할게이트 PATCH이고 `INSERT ... changed_by/performed_by` 류 audit-FK write 자체가 없음, 하드코딩 리터럴 위험 없음.
> - **CI 헬스 실측**: `deploy.yml` 최근 30런 전부 `conclusion:success`. 최신런(1570, `77d5d6d5`) 잡 스텝 전부 success — Typecheck·Build·Self-tests(calc gates)·Deploy·Smoke(production) 전 단계 green. Smoke 로그 직접 확인 = **PASS 112/112**(prod 실제 엔드포인트 기준, forecast/oee/claims/notifications/shipments/inspections 등 전 카테고리 200). `backup.yml`(Daily D1 Backup) 최신런(102) success, 최근 24런 중 실패 1건(run 82, 08-06, `docs(ar)` 커밋 — 오래된 건이라 현재 헬스와 무관).
> - **verify.yml 카나리 재확인**: #608(카나리 0회 실행) 무변동, 재확인만 — Area1 소관이나 verify.yml 수정은 CI 파이프라인 변경이라 자동수정 대상 아님.
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#609·#612·#613·#614·#615·#616·#617·#618·#619·#620 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 대상 무변경).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 신규 마이그 0건 + 신규 라우트 4개 전부 clean이라 smoke 맹점 4축 중 어느 것도 net-new 트리거 없음.
> - **백로그 트림 체크**: 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(27커밋 전체 이미 타 Area 정독 완료, prod-health 렌즈 재통과 clean, 신규 라우트 4개 agent-FK 위험 없음, CI/backup 전부 green), 자동수정 0건, done-sync: open 12(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-27T01:20):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → `forced update`로 표시됐으나 shallow(depth 50)라 직전 Area6 자신의 앵커(`45ac35a`)가 fetch 범위 밖 → `git fetch --unshallow origin main`으로 전체 이력 확보 후 `git merge-base --is-ancestor 45ac35a HEAD` = true(fast-forward 확인) → `git checkout main && git reset --hard origin/main`(HEAD `424f769e`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(범위 축 3종)**: 직전 Area6 자신의 앵커(`45ac35a`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **30커밋**, 비-웹앱 범위(`-- LogWatcher IllustratorAutomat caps-worker workers queue`) diff **5커밋**(`f2caf1b8`·`0255d456`·`eb8ffbb2`는 `scripts/cut/*`도 건드려 양쪽에 중복 계상). 웹앱 churn 대부분(재무/여신·D1 ANALYZE·재고 존 페이징·품목분류 재판정·메시지 세그먼트)은 Area1~5(08-25~08-26)가 각자 렌즈로 이미 정독. **어느 Area 로그에도 해시 언급이 없는 신선 커밋 4건**을 `grep -c` 백로그+아카이브 전수 대조로 확정: 웹앱 `50c99f02`(재고/발주요청 P0 UX버그 3건)·`30f446f2`(품목감사 게이트C 분리, CLI 전용) + 비-웹앱 `361557ce`(LogWatcher RIPLOG 인코딩 자동판별)·`035370cc`(진단 키트 재확인 프롬프트) — 이 4건을 Area6 우선 정독 대상으로 확정.
> - **`50c99f02` 심층 정독(가장 큰 diff, 11파일)**: ① `pages/inventory.ts` 닫는 태그 누락으로 "창고별" 탭이 2026-07-16부터 6주간 `display:none` 부모에 갇혀 있던 P0 UX버그 — 자동차감/부족발주 유일 진입점이 통째로 도달불가였음(수정은 태그 추가 1줄, 회귀 위험 없음). ② 신규 `PATCH /:id/supplier`(purchaseRequests.ts) — `entityFilter` read-back 404 게이트 + `requireRole('ADMIN')` + CONVERTED 상태 가드 확인, 타법인 조작 불가. ③ 신규 `GET /open-items` — `entityFilter(c,'pr')` 별칭 명시(조인 모호성 회피) 정상 적용. ④ `routes/inventory.ts`의 신규 location 서브쿼리 — 커밋 주석이 **CLAUDE.md 2026-08-25 바인드-순서 사고**(`[[feedback-sqlite-placeholder-subquery-order]]`)를 직접 인용하며 `entityId===0 ? [...inv.params] : [entityId, ...inv.params]`로 서브쿼리 앞자리에 파라미터를 선치(SQL 텍스트 등장순서와 정확히 일치) — 재발방지 패턴이 신규 코드에 스스로 적용된 것을 코드 대조로 재확인. ⑤ `inventoryCount.ts` POST — 라인 INSERT 실패 시 헤더 보상삭제(`try/catch`+`DELETE`) 추가, 0품목 유령 실사 방지. ⑥ scripts 5개 파일 XSS sweep — `escapeHtml` 일관 적용, 누락 0건. **전체 clean, 자동수정 대상 아님**(이미 dev 세션이 완결 배포·prod smoke 검증 완료, `docs(status)` 커밋으로 자체 기록됨).
> - **`30f446f2` 확인**: `scripts/item-master-audit.cjs`+`scripts/lump-voucher-report.cjs` CLI 감사 스크립트 재설계 + `docs/analysis/*.sql`(owner 수기검증 SQL, prod 2건 sales_flag 정정) — 웹 라우트·DB write 없음(#092a05e23류 기존 판정과 동형), Area6 자동스캔 대상 밖.
> - **🗺️ 범위-축(62회차) 재실증 — `361557ce`/`035370cc` LogWatcher 정독**: ① `361557ce`(FlexiHtmlParser 인코딩 자동판별 + FlexiPrintExpParser 이름조인) — 위치파일을 `위치|길이`로 확장해 "재정렬 vs 진짜 truncation"을 파일 길이 이력으로 구분(무통지 절단 아님, 「no silent caps」 준수), cp949/UTF-8 자동판별 로직이 ASCII만 있으면 판정을 다음 폴로 유보(성급한 오판 방지) — **clean**. ② **주의사항 확인(net-new 버그 아님)**: 이 커밋이 도입한 이름조인(`ClaimRipByName`)도 시각조인과 동일한 `_pending`/폴백 메커니즘을 공유 — 기보고 **#616**(6h 폴백 송출 후 뒤늦은 결과가 UNMATCHED로 재송출, 이중계상)의 억제 로직(`_lastRipCancelAt`)이 이름조인 경로에는 여전히 없음. 이번 커밋으로 HYB-3200-01이 `flexi`→`flexi_printexp`로 전환되며 **#616 노출 대상이 1대 늘었을 뿐** — 새 결함 클래스 아니므로 별도 이슈화 안 함(#616가 이미 이 메커니즘 전체를 커버). ③ `035370cc`(kit.ps1 재확인 루프) — 3회 재입력 루프가 끝까지 무효 입력이어도 기존 분기로 안전하게 빠짐(무한루프·크래시 없음) — **clean**.
> - **open≠unfixed 캐시 재확인**: 이번 사이클 churn 4건(50c99f02/30f446f2/361557ce/035370cc)이 손댄 파일이 open 12건(#606·#608·#609·#612·#613·#614·#615·#616·#617·#618·#619·#620)의 지목 파일과 전부 무관 → 기존 close-pending/open 캐시 유지, 재검증 스킵.
> - **done-sync 절대값 재동기화**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, 전건 일치) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` **4** + `duplicate` **2** = rejected **6**(변동없음). 전 12건 `reactions.+1=0` 재확인(승인 대기 유지).
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **CI 헬스**: `deploy.yml` 최근 15런 전부 `conclusion:success`(50c99f02·30f446f2·424f769e 신선 커밋 포함).
> - **npm audit 재확인**: 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 서술식 각주만 존재). 「범위 축」(62회차) 레시피가 이번에도 정확히 LogWatcher 2커밋을 Area1~5 사각지대에서 낚아챘고(패턴 재현), 「깊이 축」(#600)도 Area5 앵커 이후 신선 웹앱 2커밋을 정확히 격리 — 두 레시피 모두 정상 작동 재확인, 신규 코딩화 대상 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 8건(Area5가 직전에 이미 13건 임계에서 트림 실행함) → 이번 로그 추가 후 9건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(fresh 커밋 4건 전부 clean, #616 노출 확대는 기존 이슈로 커버), 자동수정 0건, done-sync: open 12(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-08-26T21:52):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → `forced update`로 표시됐으나 shallow(depth 50)라 직전 Area5 자신의 앵커(`8f652f8`)가 fetch 범위 밖 → `git fetch --unshallow origin main`으로 전체 이력 확보 후 `git merge-base --is-ancestor 8f652f8 origin/main` = true(fast-forward 확인, rewrite 아님) → `git checkout main && git reset --hard origin/main`(HEAD `30aa144a`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area5 자신의 앵커(`8f652f8`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **32커밋** — 대부분(재무/마진 원가·D1 ANALYZE·재고 존 페이징·품목분류 재판정)은 Area1~4·6이 각자 렌즈로 이미 정독. 이번 사이클은 **보안 렌즈(SQL 바인딩·XSS·authMiddleware·IDOR·rate-limit·시크릿)로 32커밋 전체 재통과**. 직전 Area4 앵커(`1676955`) 이후 순수 신규 4건은 전부 `scripts/cut/*`·`scripts/item-master-audit.cjs`(IA 로컬 테스트/감사 스크립트, 웹 라우트·DB write 없음) — 공격표면 없음.
> - **신규 라우트/서비스 5개 직접 정독**(`contactGroups.ts`+200·`clientSegment.ts`+265·`messageAudience.ts`+213·`credit-helpers.ts`+219·`clients.ts`/`settings.ts` 여신정책): ① `contactGroups.ts` 전체가 `.use('/*', authMiddleware, requireRole('ADMIN','MANAGER'))` 라우터-와이드 게이트, 전 쿼리 파라미터라이즈(SQLi 0) — `contact_groups`는 마이그 주석이 "거래처는 법인 공유 자산이라 그룹도 entity 필터 없음"으로 명시한 의도적 전역 테이블(FP클래스⑤와 동형). ② `clientSegment.ts`의 `resolveSegment` — `entity_ids`/`segments`는 전량 `?` 바인드, `months`는 `sanitizeMonths`(Number.isFinite && floor && 1~120 clamp) 검증 후에만 `kstDate` 템플릿에 인라인(주입 불가). ③ `credit-helpers.ts`(2026-08-25 바인드-순서 사고의 당사자 파일) — `months`(1~24 clamp)·`ratio`(0.1~1, 범위 밖이면 throw)가 전부 숫자 검증 후 인라인, `queryCreditImpact`/`deriveCreditLimit` 재확인 결과 SQLi 없음(Area4가 이미 correctness 관점 검증, 이번엔 injection 관점 재확인). ④ `settings.ts GET/PATCH /credit-policy`·제네릭 `PATCH /`는 전부 `requireRole('ADMIN')`. ⑤ `messageAudience.ts`(신규 서비스, `message_send_recipients` 대상 라우트 자체가 존재하지 않음 — 직접 조회 엔드포인트 0건, 내부 Set 판정에만 사용) — 유출면 없음.
> - **`6c14234b`(알림 ADMIN 가시성 버그픽스) 보안 정독**: `VISIBLE_SQL` 공유 상수로 5개 read/mark-read 경로 통일(2026-08-25 바인드-순서 사고 재발방지 패턴을 그대로 적용 — 조립 지점을 1곳으로 모아 사본이 틀릴 수 없게 함), `entityFilter` 전 경로 유지, ADMIN 확장은 역할-타깃 알림(`user_id IS NULL`)에만 적용되고 개인 알림(`user_id=?`) 격리는 그대로 — cross-user 누출 없음.
> - **`cd7516b2`(신규 `/api/clients?fields=picker`) 보안 정독**: 필터·정렬·dormant 로직이 기존 목록 라우트와 완전 동일 경로(투영만 축소) — 신규 인증/격리 우회면 없음. `clients` 테이블 자체가 entity_id 미보유(FP클래스⑤ 기존 판정 유지). `aiInsights.ts`의 상관 서브쿼리→JOIN 리팩터는 `requireRole('ADMIN','MANAGER')` 불변, 값 동치 검증(prod 2,873건 전수, 커밋 메시지 명시)까지 확인 — SQLi·격리 회귀 없음.
> - **XSS sweep(신규 프론트 churn)**: `messages.js`(+333, 세그먼트 피커/멤버 테이블)·`clientDetail.js`(+54, 여신 배너) 전수 — `m.name`/`m.phone`/`m.matched_reason`/`x.name`/`x.segments`/`credit.message` 등 모든 free-text·서버생성 텍스트 insertion이 `escapeHtml()` 일관 적용(빠진 sink 0건). `settings.js`(+115, 여신정책 시뮬레이터) innerHTML sink는 전부 서버 집계 숫자(`toLocaleString()`)뿐, free-text 없음.
> - **standing scan 4종**: ① `npm run audit:entity` 누락 6건, 전부 `financialReports.ts:82/89/97/102/235/241` — Area2/4가 이미 "per-entity bound-param 루프, FP 확정" 판정한 대상과 완전 동일(재확인, net-new 0). ② `node scripts/sort-audit.cjs` P1 **0건**(변동없음). ③ 시크릿 폴백 `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음), 하드코딩 비밀번호·CI시크릿 폴백 0건. ④ `npm audit` 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치 net-new 0.
> - **authMiddleware 재스캔**: 이번 churn 범위 라우트 파일 중 무-auth 3개(`cron.ts`·`credit-helpers.ts`·`messagesAd.ts`) — 전부 기존 정당 클래스(barrel 부모게이트/helpers 무-엔드포인트) 재확인, net-new 0.
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` totalCount **12**(변동없음, #606·#608·#609·#612·#613·#614·#615·#616·#617·#618·#619·#620 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지). Area5 소관 #612(크로스법인 IDOR)도 무변화.
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 대상 무변경).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 32커밋 churn을 보안 렌즈로 전량 재통과했으나(신규 라우트 5개 심층정독 포함) 신규 오탐/탐지 클래스 도출 없음 — 기존 FP 카탈로그(entity_id 없는 전역 마스터⑤·인라인 entity 격리·barrel authMiddleware)가 전부 커버, 2026-08-25 바인드-순서 사고 재발방지 패턴(VISIBLE_SQL/공유 상수 조립)이 이번 churn(notifications)에서도 스스로 적용된 것을 확인.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 도달 → 아래 트림 실행.
> - 신규 이슈 0건(32커밋 전체 보안 렌즈 clean, 신규 라우트/서비스 5개 심층정독 전부 clean, XSS sweep clean, standing scan 전부 net-new 0), 자동수정 0건, done-sync: open 12(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-26T15:47):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → `forced update`로 표시됐으나 `git fetch --unshallow`(직전 Area4 앵커 `3da5e66`이 depth-50 밖) 후 `git checkout main && git reset --hard origin/main`(HEAD `16769552`, fast-forward 121커밋 확인). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area4 자신의 앵커(`3da5e66`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **28커밋** — 대부분(재무/마진 원가·여신 정책 CTE 사고+재발방지·메시지 세그먼트·재고 존 페이징·D1 ANALYZE·품목분류 재판정)은 Area1·2·3·5·6이 각자 렌즈로 이미 정독(직전 Area3 앵커 `ef80c95` 이후는 2커밋만 신선). 이번 사이클은 **데이터정합성 렌즈(고아·CHECK·NOT NULL·entity_id·denormalized delta·바인드 순서 사고 클래스 재발 여부)로 28커밋 전체 재통과**.
> - **신규 마이그 3건 직접 정독(0541/0542/0543)**: ① `items.min_billing_side_cm`(기본 100, 0=유효값) — `orderLineAmount.ts:resolveMinSide`가 null/undefined/''는 기본값으로, `0`은 `Number.isFinite&&n>=0`으로 보존해 `\|\|` 폴백 사고 없음 확인(주석이 스스로 경고한 함정, 코드는 이미 회피). ② `contact_groups.filter_json/synced_at`+`contact_group_members.source/matched_reason` — AUTO 재동기화가 `DELETE ... WHERE source='AUTO'` 후 재삽입해 MANUAL 멤버 보존(설계 의도대로), `UNIQUE INDEX idx_contact_group_members_uniq`가 있어 `INSERT OR IGNORE`로 정상 dedupe. ③ `message_send_recipients`(FK 미선언, `entity_id` nullable) — 마이그 주석이 "D1은 컬럼 제거 불가라 제약을 늘리지 않음"으로 명시적 설계, `recordBulkRecipients` INSERT가 청크(12행×8바인드) 텍스트-포지션과 바인드 순서 일치 확인. **3건 모두 clean**.
> - **🔍 바인드-순서 사고(CLAUDE.md 2026-08-25 여신 리팩터 사고) 재발 스캔**: 이번 churn에 그 사고의 **당사자 커밋(`7822d3ed`)이 이미 포함** — 시뮬레이션 경고비율 `?`가 `buildCreditEvalSql`의 서브쿼리보다 SQL 텍스트상 앞에 와 파라미터가 한 칸씩 밀리던 사고(초과 37→108건, 3.55억→5.52억 오탐)를 인라인 치환으로 수정 + `credit-helpers.ts`에 재발방지 경고 주석 추가 + `test:credit`에 값-대조 게이트 신설(5be0dc03). **같은 클래스가 코드베이스 다른 곳에 있는지 전수 스캔**: `grep -rn "FROM (\${" src`로 템플릿 서브쿼리 래핑 6곳(`credit-helpers.ts` 2·`clients.ts`·`inventory.ts` 2·`activityLogs.ts`) 전수 확인 — **전부 서브쿼리 앞 SQL 텍스트에 outer `?`가 없음**(clients.ts는 `SELECT *,...FROM(...)`처럼 outer 컬럼리스트가 리터럴이고, ef.params/filterParams/dormantParams/limit·offset이 텍스트 등장 순서와 정확히 일치 재확인) → **net-new 0, 사고 클래스 재발 없음**.
> - **`92a05e23`/`23ae4f1d`/`2f9f88f9`(품목분류 재판정 3건) 데이터정합성 확인**: 전부 `scripts/item-master-audit.cjs`(자체 감사게이트) 정정 + `docs/analysis/*.sql`(수기 UPDATE 스크립트, 커밋에 포함) 형태로 owner가 직접 근거수치(35라인 2,685,000원 등)를 명시하고 완결 배포한 prod 데이터 보정 — Area4 자동스캔 대상 밖(085e055 선례와 동일: 도메인 전문가 수기검증 영역). `item_type` 변경이 department P&L의 order_items 기반 쿼리에만 영향(H2=미판매품목이라 영향 없음, 커밋 메시지 자체 명시) 확인.
> - **standing scan**: ① `npm run audit:entity` 누락 6건 — 전건 `financialReports.ts:82/89/97/102/235/241`, 08-25 Area4 자신이 "per-entity bound-param 루프 패턴, FP 확정" 판정한 대상과 완전 동일(재확인, net-new 0). ② `node scripts/sort-audit.cjs` P1 **0건**(변동없음, P2 127건 중 attendance.ts:158 1건 신규 노출이나 P1 아님이라 게이트 무관). ③ `npm run audit:items:selftest` 7/7 통과(변동없음). ④ `git log 3da5e66..HEAD -- migrations` 신규 3파일 전부 위에서 직접 정독 완료, NOT NULL/CHECK 위반 없음(CHECK 제약 자체가 이번 3마이그에 없음).
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` totalCount **12**(변동없음, #606·#608·#609·#612·#613·#614·#615·#616·#617·#618·#619·#620 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지). Area4 소관 #614·#615도 무변화.
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 대상 무변경).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 바인드-순서 사고 클래스는 CLAUDE.md에 이미 전역 함정으로 기록돼 있고 이번 사이클의 `FROM (${` 전수 스캔이 codify된 탐지 레시피로 이미 충분히 커버됨(신규 표준 스캔 추가 불필요) — 새 오탐/탐지 클래스 도출 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(28커밋 전체 데이터정합성 렌즈 clean, 신규 마이그 3건 전수정독 clean, 바인드-순서 사고 재발 스캔 net-new 0, 품목분류 재판정은 수기검증 영역), 자동수정 0건, done-sync: open 12(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-26T09:46):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → `forced update`로 표시됐으나 `git merge-base --is-ancestor`로 fast-forward 확인(rewrite 아님, shallow depth 50 한계) → `git fetch --unshallow`로 전체 이력 확보 후 `git checkout main && git reset --hard origin/main`(HEAD `ef80c95`, 116커밋 전진). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area3 자신의 앵커(`efc5d27`/HEAD `9f3e59d`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **27커밋** — 대부분(재무/마진·여신 정책·D1 ANALYZE·파일규격)은 Area1·2·4·5·6이 각자 렌즈로 이미 정독. 이번 사이클은 **UX 렌즈(빈 상태·로딩·escape·더블클릭 가드·axios↔라우트 존재성·HTML↔JS silent-fail·"백엔드 먼저 화면 나중")로 신규 화면 요소 전량 재통과**. Area2 최신 앵커(`2f9f88f`) 이후 순수 신규 1건(`cbf5737a` 품목 피커 규격/제품자재 표시)도 포함.
> - **HTML↔JS silent-fail 전수 diff**: churn 범위 `src/scripts`/`src/pages`에 신규 추가된 `getElementById` 리터럴 34개(`cpMultiplier`·`segApplyBtn`·`fMineOnly`·`txTableBody` 등, credit-policy 탭·segment picker·zone manager·query-render 재작업 전체)를 `comm -23`로 대조 — **id= 코퍼스 미존재 0건**(전건 같은 커밋에 템플릿/동적렌더 동반).
> - **axios→백엔드 라우트 존재성**: churn 범위 신규 axios 호출 7개(`/api/clients` picker·`/api/contact-groups/segment-options`·`/api/contact-groups/preview`·`/api/contact-groups/`·`/api/inventory/dashboard/zones`·`/api/settings/credit-policy`·`/api/settings` patch) 전부 해당 라우터 파일에 exact-match 등록 확인(`contactGroups.ts:60`·`settings.ts:150`·`inventory.ts:961`), dead-button 0건.
> - **신규 화면 3건 심층 정독**: ① `d64a15c3`(구역담당자 노출) — `escapeHtml` 일관 적용, `fMineOnly` 체크박스 null가드(`mineEl &&`), 담당구역 우선정렬 UX 양호. ② `78829f63`(메시지 세그먼트 피커, 이미 prod smoke 111/111 자체검증 배포분) — 표본 렌더 전 필드 `escapeHtml`, 빈 상태("조건에 맞는 거래처가 없습니다") 존재, `segApplyBtn`류 write 버튼 `try/finally`로 disable 복구(showConfirm 취소 시 `return`도 finally가 커버해 버튼 안 멈춤 확인). ③ `92d6ac52`(여신정책 시뮬레이터, `cpSimBtn`/`cpSaveBtn`) — 시뮬레이션·저장 양쪽 `disabled`+로딩 텍스트+`finally` 복구, 저장 전 값 검증(0 이하 거부) 존재. **셋 다 clean**.
> - **로딩/더블클릭 가드 spot-check**: `ed4f4e8f`(구역 대시보드 페이지네이션 "더보기") — `zoneMoreBusy[key]` 플래그로 중복클릭 차단 + 스피너 텍스트, 표준 패턴 준수.
> - **"백엔드 먼저·화면 나중" 재확인**: `d924a307`(안전재고/발주점 백필)이 채우는 `reorder_point`/`safe_stock` 소비처를 `grep -rln`으로 재확인 — `inventory.js`/`storageZones.js`/`inventoryDashboard.js`/`weeklyPurchase.js` 기존 화면이 이미 소비 중(신규 화면 갭 아님, 그동안 값이 0이라 안 보였을 뿐). 신규 마이그 2건(`78829f63`/`28c93f88`)은 이미 API 응답 alias 노출 확인됐고 프론트 소비처도 존재(#620/Area5가 각자 렌즈로 이미 검증) — net-new 갭 없음.
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` totalCount **12**(변동없음, #606·#608·#609·#612·#613·#614·#615·#616·#617·#618·#619·#620 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 대상 무변경).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 27커밋 churn을 UX 렌즈로 전량 재통과했으나 신규 오탐/탐지 클래스 도출 없음(기존 standing scan 레시피 — silent-fail diff·axios matching·백엔드먼저화면나중·더블클릭가드 — 가 전부 커버).
> - **백로그 트림 체크**: 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(27커밋 전체 UX 렌즈 clean, 신규 화면 3건 심층정독 전부 clean, standing scan 전부 net-new 0), 자동수정 0건, done-sync: open 12(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 4건** — Area 3, 2026-08-13. #606·#608·#609는 owner 코멘트로 "보류/별도세션" 방향 확정, 승인 아님.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
| #621 | print_events.entity_id — 미매칭 이벤트는 entity 1로 디폴트, 소급 매칭(backfill) 때도 미교정 (활성 피해 0, 향후 법인별 생산리포트 시 오염) | Area 2 | improvement,S | issue-only, 신규(#621) |
| #620 | 한글 리터럴 LIKE/instr 매칭이 prod 원격 D1에서 조용히 실패할 수 있음 — clientSegment.ts 발견 버그(1건 확인)의 유사 패턴 3곳(lifecycle.ts 취소복구·ar-receivables.ts·cron.ts dedup) 재검증 필요 | Area 1 | bug,S | issue-only, 신규(#620) |
| #618 | GET /api/inventory-counts/consumption(8fdf76c) — 프론트 소비처 0건, "백엔드 먼저·화면 나중" 5번째 사례 | Area 2 | improvement,S | issue-only, 신규(#618) |
| #615 | 재고 188품목 rebase(8fdf76c) — qty×pack_size/cost÷pack_size 보정이 재현 불가능한 형태로 prod 적용됨 | Area 4 | bug,S | issue-only, 신규(#615) |
| #614 | items 영구삭제 참조가드에 designer_intakes.item_id 누락(0532 신규 FK) — 하드삭제 시 친절한 409 대신 500 | Area 4 | bug,S | issue-only, 신규(#614) |
| #612 | ai_analysis_id/dxf_analysis_id 크로스 법인 IDOR — 주문 라인에 타법인 분석파일 ID를 넣으면 에이전트가 자동 다운로드·복사 | Area 5 | bug,medium | issue-only, 신규(#612) |
| #608 | 쓰기경로 회귀 방지 3중 장치 중 실제 배포경로엔 전무 — verify.yml 카나리는 생성 이래 0회 실행 | Area 1 | improvement,medium | issue-only |
| #606 | GET /api/reports/entity-attribution-audit(0524) — 프론트 소비처 0건, "백엔드 먼저·화면 나중" 4번째 사례 | Area 3 | feature,S | issue-only |

> #601·#602·#603·#605·#607은 2026-08-10 `c396923`(주문서 편집 라운드트립 손실 클래스 정리 세션)에서 owner가 직접 코드 픽스+배포까지 완결 후 close → Done 이관(Area 6 재검증 완료, 형제-완전성 갭 없음). #604·#611은 08-10 낮 사이클에서 owner가 완료 처리.
> 직전 사이클(45회차) 표에 있던 #559·#558·#557·#556·#555·#554는 2026-07-29 백로그 소진 세션에서 owner가 심각도순 전건 처리(코드 픽스+배포+close, 상세는 상단 "2026-07-29 백로그 소진 세션" 노트 참조) → Done 이관.

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
| A-025 | smoke.cjs에 0540(재고실사 pack_count/per_pack_qty) 마이그 드리프트 detail 프로브 추가 — 오늘 배포된 `inventoryCount.ts:169/218`가 신규 컬럼을 명시 참조하는데 기존 smoke는 목록만 프로브해 #483/#484 (b)-risk 사각지대였음. `/api/inventory-counts/1`(allow404) 프로브 추가 후 push → 배포런 `32254495833` smoke success로 0540이 이미 prod 적용됐음을 라이브 확인(활성 장애 아님, 상시 디텍터 신설). Area 1 직접 발견. verify PASS(tsc clean+build) | c14296c | 2026-08-19 |
| A-024 | orders/create.ts INSERT 바인드 개수 불일치(치명, 프로덕션 크래시) — `451f611`(담당자 필드)가 `INSERT INTO orders`에 `sales_rep_id` 32번째 컬럼·플레이스홀더를 추가했는데 `.bind()`엔 31개 값만 전달(계산된 `salesRepId` 변수가 끝내 미사용). D1은 플레이스홀더=바인드 개수 엄격 일치 요구 → `POST /api/orders`(신규 주문 생성) 전량 500, 08-07 이후 라이브 추정. `scripts/smoke.cjs`가 read-only GET 위주라 CI 미탐지(SKILL 기존 codify 사각). 노드 스크립트로 32=32 확정 후 `salesRepId`를 마지막 인자로 추가, 나머지 `INSERT INTO orders` 4개소(operations/quotations/taxInvoices/migration)도 전수 재검증(전부 정상, sales_rep_id 미참조). Area 4 54회차 직접 발견. verify PASS(tsc clean+build+entity 61/61), 즉시 push 배포 | 8e19b36 | 2026-08-09 |
| A-023 | XSS escapeHtml 누락 2곳 (신규기능 부분누락) — `orderForm/intake.js:135-136 ofLoadSalesReps()`(#604 담당자 셀렉트, employees 자유입력 `name`/`department`를 escapeHtml 없이 `<option>` innerHTML — 형제 `client.js`/`finishing.js`는 이미 escapeHtml 컨벤션 확립) + `reports.js:261-262 loadSalesRepStats()`(담당자별 실적, `rep_name`/`department` 미escape — 같은 파일 바로 위 `loadDesignerStats()`는 로컬 `esc()` 별칭으로 이미 escape하는 확립된 패턴을 새 형제 함수만 누락). A-024/A-025급 "같은 파일 부분 롤아웃" 클래스. Area 3 52회차 직접 발견. verify PASS(tsc clean+build), check:dom baseline 무변(회귀 0) | (이번 커밋) | 2026-08-08 |
| A-022 | branch-cleanup.cjs 셸 인용 버그 + 저재고 알림 단위라벨 불일치 — ①`git branch --format=%(refname:short)` 미인용이 POSIX 셸(bash/dash)에서 괄호 메타문자로 파싱돼 즉시 크래시(Windows cmd.exe에서만 우연히 동작, 순수 셸 이식성 버그) → 큰따옴표 인용. ②`utils/inventoryAlert.ts` 저재고 알림이 base_unit(미터) 저장값에 입고단위(`items.unit`='롤') 라벨을 그대로 붙여 "45롤"(실제 45m)로 오표시 — 0496(롤→미터 단위체계) 형제완전성 사각, `resolveStockUnit()`로 교체(오늘자 inventoryCount.ts 수정과 동일 패턴). Area 6 52회차. verify PASS(tsc clean+build+entity 60/60) | 87b5023 | 2026-07-29 |
| A-021 | iaEditor.js dead code 2건 제거 — `iaeCanUpdateMembership`(드래그/회전/복제 후 시트 멤버십 재배정용, 문서화된 의도는 있었으나 실제 드래그 이벤트 핸들러 자체가 미구현 — 캔버스가 Konva 대신 정적 SVG 미리보기로 방향전환돼 호출부 0) + 유일 의존 헬퍼 `iaeCanSheetByUid`. 코드베이스 전수 grep으로 호출처 0건 확인(동적 dispatch 패턴 없음) 후 제거. Area 2 53회차. verify PASS(tsc clean+build), check:dom 9(회귀 0) | (이번 커밋) | 2026-07-28 |
| A-020c | XSS escapeHtml 누락 3곳 + bank.ts 배치 상한 2곳 — `messages.js` 발송이력/통계 `receiver_num`(형제 `receiver_name`은 escape인데 누락) + `receiving.js` 검수템플릿 드롭다운 `template_name`/`category_name`(관리화면 `inspections.js`는 escape인데 소비화면만 raw) + `bank.ts` batch-apply/batch-match 서버측 1000건 상한(#583, UI Shift범위선택 1000건 캡이 클라이언트 전용이던 것 보완). Area 5 45회차. verify PASS(tsc clean+build) | 040d882, 59330b5 | 2026-07-28 |
| A-020b | XSS escapeHtml 누락 6곳 — `reports.js` 4곳(designer_name/client_name×3, title속성만 escape하고 content는 raw이던 복붙누락) + `ledger.js` 2곳(item.unit, 형제 item_name/spec/content는 escape인데 unit만 누락 — 매입PO품목라인 신기능(0f2d745)이 매출측 기존 미이스케이프 패턴 그대로 복제). Area 5 41회차 프론트 XSS sweep 에이전트 격리 → 오케스트레이터 직접 Read 재확인 후 escapeHtml/esc() 래핑(표시 불변). verify PASS(tsc clean+build) | (이번 커밋) | 2026-07-22 |
| A-019 | #377 잔여분 — 주문생성 자동가공 `orders/create.ts:643` `SELECT id, name FROM items`(존재X 컬럼)→`item_name`. #377 원 위치(core.ts:1489)가 파일분할로 create.ts D.자동가공 블록으로 이동했고 owner 픽스 eadba44는 autoProcess.ts만 정정·이 경로 누락 → best-effort catch(:695)에 삼켜져 `auto_process_jobs` 미생성 지속. autoProcess.ts:96·eadba44와 동일 정정. 휴면 write 활성화 우려는 eadba44의 `ia_auto_enabled` 게이트(0308 기본 OFF)로 이미 해소(서빙 게이트라 job 생성돼도 미노출). 안전 자동수정(컬럼 사실-정정 A-017 클래스 + owner 승인 정정의 누락분 완성). verify PASS(tsc clean+build 391) | 96e98d2 | 2026-06-12 |
| A-018 | 대시보드 납기준수율 KPI 라벨 오기 정정 — `scripts/dashboard.js:47`이 skeleton 교체 시 KPI 그리드 재구성하며 "이번 달 **출고 기준**" 노출, 권위 서버템플릿 `pages/dashboard.ts:85`/title은 "**납기 기준**". #380 수정(6b06512) 후 메트릭이 `delivery_date` 기준 월버킷이므로 "납기 기준"이 정답 → JS 라벨을 권위본에 정합. 사실-정정+기존 사본 정렬(A-014 클래스), 동작/데이터 무변 텍스트만. verify PASS(tsc clean+build 383) | (이번 커밋) | 2026-06-11 |
| A-017 | workbench.ts 존재하지 않는 컬럼 `cl.name` 3곳(`:22/28/56`) → `cl.client_name`. clients 테이블은 `client_name`만(0001:45, `ADD name` 0건 ground-truth) → 매 호출 `no such column: cl.name` throw로 신규 workbench 시안검수 페이지(b0df71c) 주문목록/검색 전체 500. read-only SELECT + 응답 alias 이미 `as client_name`(형식 불변) + 외부효과·entity 귀속 무관 = 안전 자동수정(↔#384는 쓰기/멀티테넌시라 이슈). verify PASS(tsc clean + build 369 modules) | (이번 커밋) | 2026-06-11 |
| A-016 | shell.js 정적에셋 prod 2회 장애 복구 — `9dd09cd` 파일럿이 shell.js를 `/static`으로 외부화했으나 CF Pages **Git 자동빌드**에서 `_routes.json`의 `/static/* 제외`가 미적용 → 워커가 `/static/shell.js`를 Content-Type 빈값('')으로 서빙 → 브라우저 strict MIME 실행거부 → `shell.js` 사망(전 페이지 axios 인증헤더/법인스위처 초기화 실패, 401+무한로딩). `144addf`의 `_headers` Content-Type 명시 시도는 자동빌드 환경서 불충분 → **최종 해결 = 인라인 `?raw` 복귀**(`/static`·`_routes.json`·빌드순서 의존 전무, 워커 +75KB 안정성 우선). (직전 세션 픽스, Area 6 기록 보충) | 24bb493 (144addf 경유) | 2026-06-11 |
| A-015 | files.ts 업로드 R2 키 sanitize — `${folder}/${analysisId}/${file.name}` raw 조합(3요소 클라 제어, 키 인젝션) → A-013 패턴 정규화 (orphan, 동작 무변) | (이번 커밋) | 2026-06-05 |
| A-014 | silent-fail JS 버그 3건 — HR 직원검색 `q`→`search`(핵심검색 무력) + 홈택스 페이지네이션 총건수 0(`data.total`→`pagination.total`) + 홈택스 날짜 파라미터 `start_date`→`date_from` | (이번 커밋) | 2026-06-04 |
| A-013 | aiAnalysis 업로드 R2 키 `file.name` sanitize — path traversal/헤더 인젝션 방어(LOW, ADMIN전용) | (이번 커밋) | 2026-06-03 |
| A-012 | CAPS `GET /settings` 시크릿 노출 차단 — `relay_db_password`+`worker_api_key` 응답 제거(GET /sites 패턴 정렬) | (이번 커밋) | 2026-06-03 |
| A-011 | 재고 목록 "총 N개 품목" 집계 버그 — 페이지 slice 건수(최대 20) 대신 `pagination.total` 전체 COUNT 표시 | 44bd3ed | 2026-06-03 |
| A-010 | Deploy 차단 복구 — wrangler `--commit-message=<sha>` 고정 (한글 커밋메시지 100B 절단→UTF-8 깨짐 차단) | e396f2e | 2026-06-03 |
| A-009 | PO 번호 생성 entity 필터 누락 3곳 → 정규 시퀀스 경로 정렬 (reorder/quick/templates) | e8c8992 | 2026-06-02 |
| A-008 | try-catch 누락 17핸들러 (permissions/finishing/messageTemplates/iaAuto) | 60ee8b8 | 2026-05-14 |
| A-006 | XSS escapeHtml 5건 (approvals/invoice/purchaseInvoice/quotation/clients) | e099b20 | 2026-05-13 |
| A-005 | tax_invoice_items/orders tax_invoice_id 인덱스 추가 (0193 migration) | 1b3a698 | 2026-05-13 |
| A-004 | models.ts 미사용 타입 8개 제거 (UserSession 등) | 2f94080 | 2026-05-13 |
| A-003 | hono 4.12.18 + postcss 8.5.14 보안 패치 (JWT CVE 등 7건) | 16b1482 | 2026-05-12 |

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋/Issue | 날짜 |
|----|------|-----------|------|
| I-064 | 출고 알림톡 일괄발송 부분/전체 실패 "N건 발송 완료" 오보고 — send-shipment-bulk 응답에 status(SUCCESS/PARTIAL/FAILED)·sent_count(실성공)·fail_count·failures[] 추가 + interpretBulkResult 건별 results[] + 프론트 결과모달(실패건 재발송). Area 6(06-12) 코드 직접 대조 후 close | #378 / 9be309d | 2026-06-12 |
| I-063 | AI 주문 자동가공 `auto_process_jobs` 침묵 실패(items.name 존재X 컬럼 throw) — 수동경로(autoProcess.ts /start·/approve)는 eadba44에서 item_name 정정+ia_auto_enabled 게이트, 주문생성경로(create.ts:643 잔여분)는 Area 6 A-019(96e98d2)에서 정정. 두 경로 완료 후 close | #377 / eadba44+96e98d2 | 2026-06-12 |
| I-066 | 대시보드 납기 준수율 KPI 2중 결함 — 결함1(updated_at 출고일 프록시)→`COALESCE(MAX(shipments.shipped_at),MAX(cards.shipped_at),updated_at)` 권위 출고일 + 결함2(SHIPPED 분모만)→`IN('SHIPPED','COMPLETED')` + 월귀속 created_at→delivery_date. Area 3(06-11) git 직접 검증 후 close. 라벨 정정(A-018) 동반 | #380 / 6b06512 | 2026-06-11 |
| I-061b | 입고검수 전량취소(inspection-decision CANCELLED) 멱등 가드 부재 + 비원자 재고 이중차감 — `inventory.ts:414-421` 멱등 가드 + 단일 batch 원자화. (#373=PO측 롤백은 별개 open) | #369 / d1c8b89 | 2026-06-09 |
| I-059 | 업무일자 UTC `date('now')` KST 미보정 — 표시층 formatKST 일괄 + 대시보드 created_at KPI + 회계 DATE컬럼 day-boundary KST 보정. 백엔드 자기일관 churn은 owner 디프리오 | #366 / b8d2f0d·7b64d04 | 2026-06-09 |
| I-058 | storage-zones 목록 `all_entities=1` 쿼리파라미터로 entity 격리 우회(IDOR 11번째, 역할검증 없이 필터 무력화) | #368 / b6d845d | 2026-06-09 |
| I-057 | CSV Formula Injection — 모든 CSV 내보내기 `=+-@` 선행 미가드 → 공용 `escapeCsvField` 단일화 가드(음수금액 숫자-안전) | #367 / 06ff136 | 2026-06-09 |
| I-056 | /api/files/* 범용 R2 프록시 격리 우회(HIGH) — 인증만 통과하면 임의 역할·타법인 전 파일 다운로드 | #365 / b2b170a | 2026-06-09 |
| I-055 | 죽은 레거시 테이블 inventory_items 잔존(LOW cleanup) — `0301_drop_inventory_items.sql` prod 0행 확인 후 DROP | #364 / f9c7ee4 | 2026-06-09 |
| I-054 | autoProcess 멀티테넌시 IDOR 비대칭(클러스터 10번째) — /pending만 entityFilter, 변경 핸들러 무가드 | #361 / b2b170a | 2026-06-09 |
| I-052 | 주요 데이터 로드 실패 시 스켈레톤 영구 잔류 + 에러피드백 전무 — 대시보드/지출결의서 catch-UX 보강 | #362 / b2b170a | 2026-06-09 |
| I-051 | CSV 내보내기 일관성 갭 — 발주요청·입고이력·자금계획 export 추가(peer 정합) | #363 / b2b170a | 2026-06-09 |
| I-050 | 멀티테넌시 IDOR 비대칭(HIGH) — quotations + 법인카드 corporate_cards /:id 격리 보강 (#356 8~9번째) | #360 / b2b170a | 2026-06-09 |
| I-049 | 지출결의서 목록 LIMIT 200 하드캡 → 페이지네이션·총건수 추가(silent truncation 해소) | #359 / b2b170a | 2026-06-09 |
| I-048 | 전자결재(approvals) 멀티테넌시 격리 갭(HIGH, #356 7번째) — list만 entityFilter였던 GET/:id·approve/reject 전 계열 entity 격리 (발주 9핸들러 포함) | #358 / 16915ed | 2026-06-09 |
| I-040 | N+1 신규 클러스터 — 급여 일괄/근태동기화 핫패스(전직원×5~7쿼리) + 발주 품목 루프 batch 전환 | #350 / 108b738 | 2026-06-09 |
| I-031 | N+1 batch 미전환 — PR→PO 변환 recentPO N+1 제거 + child INSERT batch (cashFlow 핫패스) | #341 / ba53c76 | 2026-06-09 |
| I-032 | rip.ts 설비 자식 테이블 entity_id 배선 — 설비 법인 격리 적용(스키마+로직+데이터보정). 직전 approved | #342 / 5e97f82 | 2026-06-09 |
| I-030 | E2E 프로덕션 crud-order 운영데이터 오염 격리 — afterAll cleanup(소프트취소+하드삭제 2회)로 prod 누적 0. cold-start 픽스처는 owner 별도 분리. 직전 approved | #340 / e8429cb | 2026-06-09 |
| I-028 | CI 폴백 자격증명 admin/password — 코드측 평문폴백 제거(a7a15cc). owner **위험수용 close**(pbkdf2 해시저장 확인, admin/password 테스트전용 간주) | #336 / a7a15cc | 2026-06-09 |
| I-046 | 멀티테넌시 격리 갭 6모듈 — /:id 상세·변경 entityFilter 보강 + inventoryCount/leaves 차감을 row entity_id 기준화(호출자 아님)로 교차훼손 차단. 코드검증: insuranceReports entityFilter 6회 | #356 / 6a8cb35 | 2026-06-05 |
| I-047 | 파일 업로드 검증 부재 — `utils/uploadValidation.ts` 신설(size/MIME/ext 화이트리스트) cardExpenses/po/files 적용 + receipt-image path-traversal 가드. 코드검증: 파일 존재 | #357 / 3baa38a | 2026-06-05 |
| I-027 | 저장형 XSS — escapeHtml 클라 7스크립트 + 서버템플릿 2종 + portalLayout 전역주입. portalBalance.js 잔여는 free-text 싱크 부재로 비대상(Area 6 검증) | #335 / da5f0ca | 2026-06-05 |
| I-041 | hr.ts 레거시 급여 endpoint 2개 제거(POST가 미존재 payrolls 테이블 INSERT→크래시, 호출처 0). 코드검증: `INTO payrolls` grep 0 | #351 / 9fdfdf4 | 2026-06-05 |
| I-042 | 현금영수증 탭 필터 무력 — 중복 element ID를 cr* prefix로 셰도잉 해소 + 날짜 파라미터 date_from/date_to 정렬. 코드검증: cashReceipts.js cr* 4개 | #352 / a742d27 | 2026-06-05 |
| I-033 | Dead-filter 3건 — 지출결의 날짜·포털주문 상태(869fcf9) + 생산 출력이력 장비/상태/날짜(printEvents 연결) | #343 / 0c04fad | 2026-06-05 |
| I-034 | 포털 셀프서비스 3건 — 세금계산서 PDF다운로드+페이지네이션 / 미수금 aging / 재주문 모달 | #344 / 0ce9c42 | 2026-06-05 |
| I-035 | 회계 내보내기·검색 — 세금계산서 CSV+지출결의 지급처/사유 검색(29e9fbc). ⚠️**정정(Area6 06-07)**: cashSchedule CSV는 29e9fbc에서 "LOW 미처리" 명시로 **미구현** → #363으로 신규 추적 중 (기존 "월별 CSV done" 기록은 부정확) | #345 / 29e9fbc | 2026-06-05 |
| I-036 | 필터·드릴다운 — 연차 부서필터 + 불량률→검수 드릴다운 + 미사용수당 응답정합 버그(48명 정상렌더) | #346 / 0c04fad | 2026-06-05 |
| I-043 | Dead-filter 클러스터 2탄 — 생산보드/원가/메시지/활동로그/매입/휴가 6건 백엔드 필터 UI 활성화+페이지네이션 | #353 / 0c04fad | 2026-06-05 |
| I-044 | 검수결과 목록 — 공급업체 드롭다운·결과상태·검수일범위·페이지네이션·CSV export(원시 ID 입력 해소) | #354 / 0c04fad | 2026-06-05 |
| I-045 | 여신초과 주문 전면실패 — owner가 (가)안 0300 마이그(approval_requests/templates 재빌드, CHECK에 CREDIT_OVERRIDE 추가)로 해소. ground-truth 재적용+INSERT 컬럼 정합 실측 검증 | #355 / 0300 | 2026-06-05 |
| I-025 | order_templates orphan 라우터 — 도달성 규칙으로 dead-code 재분류→owner (가)승인→삭제(templates.ts+drop마이그 0297, prod 404 확인) | #334 / a7a15cc | 2026-06-04 |
| I-026 | 하드코딩/약한 자격증명 — `fallback-dev-key` 제거(requirePiiKey 4곳) + reset-password 기본값 'password' 제거→필수화(400) | #338 / a7a15cc | 2026-06-04 |
| I-029 | 프로덕션 debug 엔드포인트 — `/api/debug/cards` 제거 + db-test/stats error.message 제네릭화 | #337 / a7a15cc | 2026-06-04 |
| I-039 | hr.ts 멀티테넌시 격리 갭 — 단건GET/detail/증명서 entityFilter 보강 + PUT entity_id mass-assignment 차단(item3 GET/payrolls는 #351 dead-code) | #349 / a7a15cc | 2026-06-04 |
| I-037 | cards.status CHECK 분기 — 0284/0296(7값 superset)+0298(레거시 상태 이관)로 해소, lifecycle.ts PRINT_ERROR→rip_status 처리 | #347 | 2026-06-04 |
| I-013 | 보안 헤더 추가 (X-Frame-Options/X-Content-Type/Referrer-Policy, HSTS/CSP 보류) | #32 | 2026-05-13 |
| I-014 | /api/portal/auth/change-password rate limit 적용 | #33 | 2026-05-13 |
| I-015 | XSS 잔여 escapeHtml 39개소 (approvals.js 24 + cards.js 15) | #34 | 2026-05-13 |
| I-016 | 대시보드 E2E 추가 (e2e/dashboard.spec.ts, 0e67ac6) | #35 | 2026-05-14 |
| I-018 | N+1 printSystem.ts batch 적용 (채번 필요부는 순차 유지) | #37 | 2026-05-14 |
| I-019 | N+1 settings.ts + priceLists.ts assign-clients | #38 | 2026-05-14 |
| I-020 | SELECT * 잔여 정리 (157→8건) | #39 | 2026-05-14 |
| I-021 | approvals 결재 페이지 — 기존 업무흐름 결재 연계로 확장 (owner 논의) | #43 | 2026-05-14 |
| I-022 | tasks.js 작업큐 — 사이드바 통합 검토 (owner 논의) | #44 | 2026-05-14 |
| I-023 | deliveryAnalytics + financialReports CSV 내보내기 | #45 | 2026-05-14 |
| I-024 | 장비 가동률 KPI — 근무시간 기반 가동시간 측정으로 확장 (owner 👍) | #46 | 2026-05-14 |
| I-017 | try-catch 누락 17핸들러 자동 수정 (permissions/finishing/messageTemplates/iaAuto) | A-008 / 60ee8b8 | 2026-05-14 |
| D-001 | shipment_items UNIQUE(shipment_id, card_id) 제약 추가 (0194 migration) | #31 | 2026-05-13 |
| I-015partial | 스모크 커버리지 55→88 엔드포인트 확대 | #15 | 2026-05-13 |
| I-012 | 원단 소모 예측 페이지 검색+상태 필터 추가 | #30 | 2026-05-13 |
| I-011 | 대시보드 전면 재설계: 납기 준수율 KPI + 생산 파이프라인 + KPI 클릭 연결 7개 | #29 | 2026-05-13 |
| F-006 | 주문 상세 모달 "카드 현황" 버튼 추가 | #28 | 2026-05-13 |
| F-005 | 출고 목록 거래처 헤더에 "계산서 발행" 링크 추가 | #27 | 2026-05-13 |
| I-010 | SELECT * 145건 제거 (178→6건, 96%) | #26 | 2026-05-13 |
| A-008 | priceList.ts + inspections.ts N+1 → db.batch() 전환 | #25 | 2026-05-13 |
| A-007 | inventory.ts 입고/출고/취소 N+1 3패턴 → batch 전환 | #24 | 2026-05-13 |
| B-010 | inventoryCount.ts 재고 실사 N+1 → db.batch() 전환 | #22 | 2026-05-13 |
| B-009 | taxInvoices.ts O(N×M×K) 중첩 N+1 → batch 전환 | #21 | 2026-05-13 |
| B-008 | shipments.ts N+1 → db.batch() 전환 | #20 | 2026-05-13 |
| B-007 | prices.ts + rip.ts Promise.all N+1 → IN절 일괄 조회 | #19 | 2026-05-13 |
| B-006 | entity_id 누락 10테이블 (0193 migration + INSERT 16건) | #18 | 2026-05-13 |
| I-007 | as any 902→45 (95% 제거, 9 커밋) | #17 | 2026-05-13 |
| B-005 | printEvents.ts N+1 → 이벤트당 5~7→3~4 쿼리 축소 | #16 | 2026-05-13 |
| I-008 | 스모크 커버리지 확대 (3개 자동 추가) | #15 | 2026-05-12 |
| A-002 | smoke.cjs 3개 엔드포인트 추가 (quotations/hometax/search) | 256e37c | 2026-05-12 |
| A-001 | entity_id INSERT 14건 누락 | c7c20d3 | — |
| B-001 | cards entity_id 격리 | 0960a5a | #1 |
| B-002 | LogWatcher URL + 서비스 실행 | (설정 수정) | #2 |
| B-003 | SHIPPED 카드 확인 모달 | 3dd4274 | #11 |
| B-004 | cards entity_id NULL 32건 보정 | (prod SQL) | #12 |
| I-001 | bank.ts N+1 제거 | 0960a5a | #3 |
| I-002 | autoProcess.ts N+1 제거 | 0960a5a | #4 |
| I-003 | approvals.ts N+1 제거 | 0960a5a | #5 |
| I-004 | clients API 응답 통일 | 0960a5a | #6 |
| I-005 | 로그인 rate limit 적용 | 44c1f04 | #13 |
| I-006 | hr.ts 에러 메시지 제네릭화 | 44c1f04 | #14 |
| F-001 | 거래처 필터 5개 | 575312d | #7 |
| F-002 | 주문 필터 CANCELLED 해소 | 575312d | #8 |
| F-003 | 대시보드 KPI 5개 | 575312d | #9 |

## ❌ Rejected

| ID | 제목 | 사유 | Issue |
|----|------|------|-------|
| I-009 | vite/esbuild dev server SSRF (GHSA-67mh) | "로컬 서버 전용이라 크게 문제 없음" — 프로덕션 영향 없음 | #23 |
| F-004 | 납품시간 disabled 이유 표시 | 용준님: "필요 없음" | #10 |
| I-038 | 전역 UNIQUE가 entity 복합 UNIQUE 무력화 (다법인 번호충돌 잠복) | owner not_planned — 운영 entity 1 수렴, 의도적 보류 | #348 |

---

## 오탐(False Positive) 패턴 — 탐지 제외 목록

> auto-improve 및 security-audit 실행 시 이하 패턴은 이슈 등록 금지.

| 패턴 | 이유 | 첫 발견 |
|------|------|----------|
| `webhooks.ts` `allowedPrefixes` Popbill IP 목록 | 의도적 보안 화이트리스트, 하드코딩 아님 | Area 5 (#20) |
| dev server 전용 취약점 (vite/esbuild SSRF 등) | 프로덕션 영향 없음, 개발자 PC 전용 | Area 1 (#23 거절) |
| disabled 필드에 이유 힌트 없음 | 용준님: 불필요 (F-004 거절 패턴) | Area 3 (#10 거절) |
| CORS `!origin → '*'` (`index.tsx:213`) | Bearer 토큰 인증(쿠키 미사용) — 브라우저는 항상 Origin 전송, 실질 무해 | Area 5 (2026-06-02) |
| rate limiter in-memory `Map` (`rateLimit.ts:6`) | isolate 분산 한계는 기존 인지 아키텍처 제약, 신규 이슈 아님 | Area 5 (2026-06-02) |
| 인덱스/UNIQUE 누락 후보 (ground-truth 미확인) | 로컬 D1 실제 스키마로 반증 필수 — 대부분 이미 존재하거나 hot path 아님 | Area 4 (2026-06-02) |
| orphan 라우터의 entity_id 격리 갭 (프론트 호출처 0건) | UI 도달 불가 = dead code 사안이지 보안 아님. 격리 갭 보고 전 `grep "api/<path>" src/scripts src/pages` 도달성 선검증 필수. **⚠️ 예외(#365)**: 클라 제공 키로 raw 리소스 서빙하는 범용 프록시(R2 파일 `files.ts` GET `/*` 등)는 0-refs여도 인증된 직접 HTTP 호출이 공격표면 → dead-code 강등 금지, 보안 이슈 | Area 6 (#334, 2026-06-04 / 예외 #365 2026-06-07) |
| 비원자적 다중 INSERT "고아 가능" (확정 실패 트리거 부재) | 부모→자식 별도 `.run()`이라도 자식 테이블에 CHECK/NOT-NULL 위반 등 **확정적 실패 트리거가 없으면** 거의 모든 다중문 코드에 해당하는 일반적 비원자성일 뿐 = 노이즈. #355류로 보고하려면 100% 실패하는 구체 트리거(CHECK 누락 리터럴 등) 실증 필요. order_items는 CHECK 0·전컬럼 nullable이라 견적전환/복사 비원자성은 오탐 | Area 4 (2026-06-06) |
| rate-limit "누락" 보고 (라우트 파일에 inline 미들웨어 없음) | rate limit은 라우트 파일이 아니라 `index.tsx`에서 `app.use('/api/...', rateLimitMiddleware(...))`로 **앱 레벨 전역 등록**(240-246: auth/portal login·users/portal change-pw·refresh·self-auth·verify-document·verify-token). 라우트 핸들러만 보면 항상 inline 부재로 오탐 — 보고 전 index.tsx 등록처 grep 필수 | Area 5 (2026-06-06) |
| "escapeHtml 헬퍼 전무(`grep -c escapeHtml`=0) → XSS" | `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용) → 모든 스크립트가 로컬 정의 없이 전역 헬퍼 호출 가능. 파일에 escapeHtml 미정의/미참조 ≠ 취약. 올바른 판정: 실제 `innerHTML` 싱크의 보간값이 (a)사용자 제어 free-text **이고** (b)미escape인지 확인. `Number()` 강제 숫자·시스템 채번코드(order_number 등)·서버 하드코딩 문자열은 싱크 아님. **⚠️ 예외(Area 5 06-10)**: `c.html()`로 자체 `<head>/<script>`를 통째 반환하는 **독립 출력페이지**(`pages/payslip.ts`·`pages/yearEnd.ts` = `/payslip/:id`·`/year-end/:id` 인쇄경로)는 layout 셸 미경유라 `window.escapeHtml` **부재** → "전역헬퍼 있으니 오탐" 논리 적용 금지. 직원 마스터 free-text를 innerHTML raw 연결하면 **진짜 stored XSS**(로컬 `esc()` 추가가 정답·안전 자동수정). 판별: 파일이 layout/shell import 없이 c.html 안에 자체 script + free-text 렌더 | Area 6 (2026-06-06 / 예외 06-10) |
| batch 결과 배열 인덱스 "정렬 불일치" 오독 | 부모-자식 2-pass batch에서 stmt배열(`parentStmts[]`)과 메타배열(`parentClientGroupIds[]`)을 같은 루프에서 push 후 `results[i]`로 매핑할 때 "한쪽은 `continue`로 건너뛰는데 다른 쪽은 무조건 실행→길이 불일치→매핑 깨짐 HIGH"로 보고하기 전, **두 push가 같은 `continue` 가드 뒤에 있는지** 확인. `if(parent_client_id) continue`가 **루프 최상단**이면 자식 행은 두 push를 **모두** 건너뛰어 길이 동일=정합(orders/core.ts:2207-2280·quotations.ts:273-320이 이 형태, 정상). 서브에이전트가 continue 위치를 오독해 HIGH 과대보고 2건 차단. 회피=(a)continue 줄 위치가 첫 push보다 위인지 (b)두 push 사이 별도 조건 push 있는지 직접 Read | Area 4 (2026-06-10) |
| VAT/금액 "부동소수점 누적 → 신고 오차" | 금액이 누적 **직전에 원/100원 단위 정수로 반올림**되면(예: quotations.ts:223 `Math.round(itemAmount/100)*100`) `×세율(0.1)`은 항상 10의 배수=정수라 IEEE754 drift 불가. node `Number.isInteger(누적값)` 실증으로 반증 필수. 견적(추정)↔세금계산서(`Math.round`+정합보정 `total≠supply+tax면 강제정렬`) 반올림 "불일치"도 발행단계가 권위계산이라 버그 아님. number↔REAL/INTEGER 타입표기 차이도 정상 TS | Area 2 (2026-06-08) |
| catch가 success 숨김 "데이터손실" (best-effort 물질화/보상) | try 안이 **부차 denormalized 물질화**(가격이력·cash_schedule 등 언제든 재계산 가능한 파생 데이터)이고 **주석에 best-effort 명시**(예: purchaseInvoices.ts:131/164 "receive Phase4와 동일 정책")면 의도적 설계. 핵심 비즈니스 write(주문/인보이스/잔액)가 try **밖**이면 오탐. batch 실패 후 보상(rollback) DELETE의 `.catch(()=>{})`도 보상 자체 실패는 더 할 게 없으므로 정상. 보고하려면 **핵심 mutation**이 삼켜지고 사용자에게 success로 보이는 구체 경로 실증 필요 | Area 2 (2026-06-08) |
| 트랜잭션 원자성 "분리 write 부분실패 → 고아/불일치" | `DB.batch()` 없이 분리 await 실행이라도 **분리가 구조적으로 강제**되면 노이즈: ① 부모 INSERT가 `result.meta.last_row_id`를 자식에 써야 함(bank apply·shipments 헤더·orders 헤더) ② 중간 READ(`balance_after` 잔량조회)가 끼어 batch 분할 불가피. 단순 "2번째 write 실패하면?"은 확정 트리거 없는 일반 비원자성. **보고 가능 = ①확정 재현 트리거**(멱등 가드 부재로 재시도/중복제출이 destructive write 반복 — 부분실패→500→목록잔류→재클릭, 버튼 재진입 가드 없는 더블클릭) **+ ②회피 가능성**(read를 메모리 산출로 대체해 단일 batch화 가능). #369가 둘 다 충족(보고됨). 보고 전 (a)재고/금액/잔액 변경인지 (b)선행상태 가드(`WHERE status!=...`)·프론트 버튼 재진입 가드 확인 | Area 2 (#369, 2026-06-09) |
| 무인증 self-service auth "브루트포스/열거 HIGH" 과대평가 | `/api/hr/self-auth`(사원번호+생년월일6자리)·portal `/verify-document`(토큰+BRN)처럼 **계정 없는 사용자용 간이 2팩터**는 authMiddleware 부재가 **설계 의도**(공개 진입점). 보고 전 ① `index.tsx:240-246` rate limit 전역 등록 확인(self-auth 5/분·verify-document 10/분 이미 적용) ② 두 팩터 결합(열거가능 식별자+추측가능 비밀)이 동일 코드베이스의 이미 "설계 정상" 판정 패턴과 동형인지 확인. IP-rate-limit 로테이션 한계·timing-attack(단일쿼리+문자열비교)은 모든 로그인 공통. **진짜 보고 대상**: rate limit 미등록 / 단일 팩터 인증 / scope·만료 없는 영구 토큰 발급 | Area 5 (2026-06-09) |

---

## 상태 변경 가이드

| 상태 | 의미 | 누가 변경 |
|------|------|----------|
| 🆕 new | 에이전트가 발견, 미검토 | auto-improve |
| 👀 reviewed | 용준님이 봄, 판단 보류 | 용준님 |
| ✅ approved | 진행 허가 | 용준님 |
| 🔨 in-progress | 구현 중 | Claude |
| ✔️ done | 완료, 배포됨 | Claude |
| ❌ rejected | 불필요 / 부적절 | 용준님 |
