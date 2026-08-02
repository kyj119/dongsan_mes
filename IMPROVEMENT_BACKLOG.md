# Improvement Backlog
<!-- last_run_area: 2 -->
<!-- last_run_at: 2026-08-02T09:14:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **6** (#585·#586·#587·#589·#590·#591, GitHub OPEN 실측 — Area2 56회차 재확인, 변동 없음) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **511** (`reason:completed` 절대값 — Area2 56회차 재조회, 변동 없음) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 변동 없음) |

> **2026-07-29 백로그 소진 세션** (main `9686bf69`, deploy success): 11건을 심각도순으로 전건 처리.
> 사전에 **11건 전부 코드 대조**해 오탐 0건·실존 10건 + fixed-in-tree 1건(#580)임을 확인하고 착수했다
> ([[feedback-autoscan-false-positives]] 절차). 검증=tsc 0·build·check:dom 9(기준선)·entity 60/60·
> 로컬 스모크 104/104·**prod 스모크 104/104**·prod 번들 마커 13/13.
> **★브라우저 실클릭이 정적 검사가 통과시킨 실버그 1건을 추가 검출**(대기함 검색 결과를 클라 필터가
> 가리는데 빈 상태 문구는 "없습니다"라고 안내) → 별도 커밋. Phase 7b-2의 교훈이 그대로 재현됐다.
> ⚠️ **발송 계열은 실호출 미검증** — 테스트 호출이 곧 실발송이라 `/send-bulk`·`/ad/send`는 부르지 않고
> 모의 응답·단위 로직으로 대체([[design-ad-compliance-guard]] 함정). 소량 1건 자연검증 필요.

> **Area 2 코드 품질 심층 분석 (2026-08-02T09:14):**
> - **방법**: `git fetch origin main`(HEAD `37d6242` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 2 **56회차** — 직전 Area2(`f0383ef`, 07-31T17:15, 55회차) 이후 `git log f0383ef..HEAD -- src/routes src/scripts migrations`는 **3커밋 전부 순수 데이터 마이그레이션뿐**(`c16071c` 0507 정운교역 깃발원단 22종 등록·`6cb72fb` 0508 간판 BOM P2 product_materials 소요량 컬럼+간판 8품목+표준BOM 24행·`c555deb` 0509 간판 BOM P3 LED밀도 실측보정+단가0 자재 실단가). **`src/routes`·`src/scripts` 코드 변경 0** — 코드품질 렌즈(entity_id·N+1·authMiddleware·dead code·SELECT *)로 diff할 신선 churn이 없어, 데이터 마이그레이션 자체의 컬럼정합성 검증 + 코드베이스 전수 standing scan으로 전환.
> - **신규 마이그 0507~0509 컬럼존재성 검증**: `product_materials`(0089 CREATE: `product_item_id`/`material_item_id`/`is_default` 원본 확인) + 0508 ADD COLUMN(`quantity`/`usage_type`/`usage_param`/`notes`) 전부 실재, `UNIQUE(product_item_id, material_item_id)` 제약이 INSERT OR IGNORE 멱등성 주장과 정합. `items.base_price`(0001 원본 컬럼)·`order_items.item_id` 0509 UPDATE 타깃도 실재. 3파일 전부 `INSERT OR IGNORE`/재실행 안전 가드(`WHERE usage_param=35`류) 명시 — 컬럼오타·NOT NULL 누락 0. Area6 54회차의 "컬럼-diff bridge clean" 판정과 합치, 코드 소비처 없음(`grep -rn "usage_type\|usage_param" src` = 0)도 재확인.
> - **authMiddleware recursive 재스캔**: `for f in $(find src/routes -name '*.ts')...` → 후보 7건 동일(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) — 전부 기존 FP 카탈로그(Map.get 오탐·정보통신망법 무인증·agentKeyMiddleware·barrel·scoped-token)와 일치, net-new 0.
> - **동적 IN절 D1 바인드한도(100) 재점검**: `grep -rnE "IN \(\$\{" src/routes` 150+ 매치 전수 스캔 — 신규 파일/패턴 없음(전부 26~29회차 #458/#478 standing scan이 이미 분류한 per-entity bounded류이거나 80청크 처리 완료 사이트). `shipments.ts:239/423/465`의 `consolidate_with_order_id IN` 계열은 #589(합배송 정리 누락) 대상 파일과 겹치나 그 자체는 chunk된 안전 read/write이고 IN절 바인드 한도 문제 아님(청크 크기가 소규모 그룹 한정). net-new 없음.
> - **`SELECT *` 사용처**: `grep -rn "SELECT \*" src/routes | grep -v "COUNT(\*)"` = 14건, 전부 과거 사이클(A-027류)에서 명시 컬럼 전환 검토·FP 판정 완료된 기존 사이트로 재확인(신규 사이트 0) — 개별 재점검은 다음 유의미 churn 시점으로 이연(반복 재검증 낭비 방지, line 296 close-pending 캐시 원칙 적용).
> - **표준 게이트**: `npx tsc --noEmit` 0 · `node scripts/entity-audit.mjs` = 검사 127파일·SELECT 60·통과 60·누락 0.
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **6건**(#585·#586·#587·#589·#590·#591) — 이번 델타 3커밋이 그 이슈 대상 파일(`messagesAd.ts`·`messages.ts`·`orders.js`/`orderForm/parent.js`·`orders/core.ts`·`docs/dongsan-import`)을 전혀 안 건드려 재grep 없이 unchanged 캐시 신뢰(Area6 54회차가 직전에 직접 재grep 완료).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **6**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(코드 churn 0, 데이터 마이그 컬럼정합성 clean, standing scan 재확인 net-new 0), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(코드 변경 없음, 검토 대상 자체가 데이터 마이그레이션 뿐), done-sync: new 6(변동없음)·done 511·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-02T03:13):**
> - **방법**: `git fetch origin main`(HEAD `9dee203` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). 프록시가 이번 세션도 prod 호스트 직접 접근 차단(`SMOKE_URL=https://webapp-9i0.pages.dev npm run smoke` → 로그인 단계에서 `403 Host not in allowlist` — 기존 인지된 egress 제약 재확인, 변동 없음) — 직접 prod API 헬스체크 불가, GitHub Actions CI 기록으로 대체. Area 1 **55회차** — 직전 Area1(`1237056a`, 07-31T16:26, 54회차) 이후 `git log 1237056a..HEAD` = **15커밋**(취소주문 하드삭제/트레이/묶음프리필 후속 Area2~6 사이클 로그 + 동산 매입원장·LED4U/SK 사인자재 ecount 이관·간판 BOM P1~P3 신규 데이터 트랙 — 전부 Area2~6가 각자 렌즈로 이미 다룸, Area1은 헬스만 확인).
> - **deploy.yml 전수 확인**: run #1118~#1127(`f0383ef`~`9dee203`, 2026-07-31T07:27~2026-08-01T12:17Z) 중 **#1119(`e5ba1ad`, docs(backlog) 전용 커밋) 1건만 `Deploy to Cloudflare Pages` 스텝 failure** — Typecheck/Build 전부 success, 실패는 CF finalize 단계이고 트리 변경 없는 docs-only 커밋이라 코드 회귀 불가, **바로 다음 런(#1120, `efe8b36`) 즉시 success로 회복** → 기존 codify된 "CF-internal transient" 패턴과 정확히 일치, 비보고. 나머지 9건 전부 success. 신규기능 churn(사인 BOM 3단계·매입원장 5곳 적재) 전량 관통하며 배포 안정.
> - **backup.yml 신선도**: 최신 run #77(`9dee203`, 2026-08-01T17:54:07Z) success — 직전 6회 전부 success, 07-28 `cancelled` 1건(`da70faae`)은 기존 인지된 "연속 트리거 supersede" 패턴으로 무해(변동 없음). 다음 일일 백업까지 정상 주기 내.
> - **e2e.yml**: 기존 인지 상태(2026-06-22 이후 미실행, `disabled_manually`) 재확인 필요성 낮음 — 변동 감지 안 됨. **verify.yml**: 열린 PR 0건(`list_pull_requests(open)`=[] 직접 확인) → 이번 사이클도 실행 0건, 정상.
> - **open≠unfixed 재확인**: `list_issues(state:OPEN, label:auto-improve)` 실측 **6건**(#585·#586·#587·#589·#590·#591, Area6 54회차 캐시와 일치) — 15커밋 신선 churn 이후 원 안티패턴 스팟체크 재grep: `messagesAd.ts:381-382` success_count/fail_count만(#585) 잔존·`messages.ts`(pages) `:246 #adSubject`/`:261 #adContent`에 `oninput` 부재(#586) 잔존·`orders/core.ts:161-189` consolidate_with_order_id 정리 로직 부재(#589) 잔존. #587·#590·#591은 이번 churn이 대상 파일(messagesAd.js search·orders parent.js edit-load·이관 마이그)을 건드리지 않아 직전 Area4/5/6 verified-once 캐시 신뢰(unchanged). fixed-in-tree 0건.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(재확인, 변동 없음) · done `reason:completed` **511**(재조회, 변동 없음) · rejected `not_planned`(4)+`duplicate`(2) **6**(재조회, 변동 없음) — 전부 기재값과 정확히 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 CI/헬스 확인 사이클, 신규 클래스 없음.
> - 신규 이슈 0건, 자동수정 0건(순수 CI/인프라 헬스 확인), done-sync: new 6·done 511·rejected 6. 다음 순번 **Area 2**.
>

> **Area 3 UX/기능 감사 (2026-07-31T18:10):**
> - **방법**: `git fetch origin main`(HEAD `e5ba1ad` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 3 **48회차** — 직전 Area3(`c8f255d`, 07-30T14:05, 47회차) 이후 `git log c8f255d..HEAD -- src/scripts src/pages src/layout index.tsx`는 **6커밋**(취소주문 완전삭제 2단계 복원·트레이 삭제/복구+파일명 정보우선형·가공대기함 자동 묶음 프리필·자녀행 합계 dead분기 제거·행 에누리 확정·대기함 썸네일/검색 수정). 나머지 churn(자재마스터·이카운트 적재·IA패널)은 웹 UX 렌즈 밖. 6커밋 전수 인라인 직접 Read(과다위임 억제, 신선 churn 작아 정독이 빠름).
> - **`a621cdd`(취소주문 완전삭제 confirm) 검증**: `orders.js:1329` 2단계 confirm 문구가 상태별로 정확히 분기(CANCELLED=완전삭제 경고+관리자전용 명시 / CONFIRMED·PRINTING·PRINT_DONE=취소처리+카드HOLD 안내+"완전삭제는 다시 삭제 누르면" 안내 / 기타=기존 문구), 토스트가 서버 메시지 우선 사용(소프트/완전 구분) — `showConfirm`은 `await` 패턴(콜백오용 아님, 기존 FP 패턴 확인). clean.
> - **`1a66d92`(트레이 처리됨보기·삭제·복구) 검증**: `ofTrayVoidSelected`/`ofTrayRestoreSelected` 둘 다 결과 토스트에 성공/거부/이미처리 건수 세분 표시, 복구는 #575 패턴(건별 try/catch+실패집계 1회 통지) 준수. "처리됨 보기" 모드는 프리필 진입점(행 클릭·그룹 일괄생성 버튼) 전부 차단해 오조작 방지. 빈 상태 문구("해당 조건의 대기물이 없습니다")는 처리됨/대기 모드 공용으로 자연스러움. 배지 캐시가 피커의 "처리됨 보기"에 의해 덮이지 않도록 가드(`_pickerDone`)도 확인 — clean.
> - **`737ecbb`(자동 묶음 프리필) 검증**: 묶음 발생 시 결과 토스트에 "(동일 규격·마감 → 묶음 N개 자동 구성)" 안내 포함 — 사용자가 왜 자식행이 자동 생성됐는지 인지 가능(묵시적 자동화가 아님). 자식 전멸 시 빈 부모 자동 제거(유령행 방지). clean.
> - **🔴 net-new 발견: #590 주문 수정(edit) 재진입 시 기존 행 에누리(line_discount)가 화면에 복원되지 않고 다음 저장에서 소멸** — `e744bc4`(07-30, 행 에누리 기능 확정)가 **저장 경로**는 정확히 고쳤으나(auto_amount·line_discount·discount_reason·discount_by 정확 기록, prod 백필 실측 회귀 0), **로드(edit 재진입) 경로가 짝을 이루지 못함**: `parent.js:loadOrderForEdit()`이 `item.amount`/`item.auto_amount`/`item.line_discount`/`item.discount_reason`을 전혀 안 읽고 `unit_price`·`width`·`height`만 복원 후 `calcItem(id)` 호출 — `calcItem()`은 `border-amber-400`(수동수정 표식) 없는 갓 렌더된 행을 항상 "비수동"으로 보고 금액을 **자동 재계산값으로 덮어씀**(`calc.js:148-156`, `wasManual` 판정이 로드 시 항상 false). 화면엔 주황 테두리·에누리 문구·사유칸이 전혀 안 뜨고, 이 상태로 아무 필드나 고쳐 저장하면 `calc.js:576` 페이로드가 `amount:undefined`를 보내 서버 `computeLineAmount()`(`orderLineAmount.ts:82`)가 `hasManual=false`로 판정 → **line_discount·discount_reason·discount_by가 전부 초기화되고 금액이 자동값으로 원복**. GET `/api/orders/:id`는 `SELECT oi.*`로 4필드 전부 이미 응답에 포함(`core.ts:446-459`) — 서버엔 데이터가 있는데 프론트 복원 로직만 누락된 순수 load-path 갭. 마이그 0501 백필로 현재 prod 전량 `line_discount=0`이라 아직 실피해 0건이지만, **이 기능으로 실제 에누리를 기록한 첫 주문이 재수정되는 순간부터 재발**(주문 수정은 일상 업무라 빠른 재현 예상) — 이 기능 자체가 고치려던 "수동 조정이 조용히 사라진다"는 증상이 edit 재진입 경로에서 그대로 재발하는 구조. 프론트 함수 1개(로드 시 amber 상태 재현) + 순서 조정으로 수정 가능해 보이나, Area 3 정책상 issue-only(#590 등록, S~M).
> - **`e0c8c60`(자녀행 합계 dead분기 제거)**: `calculateTotal()` 셀렉터 `[id^="item-"]`(부모/일반) vs `[id^="item"]`(자녀 포함) 구분 근거를 주석으로 명시한 정리 — UX 영향 없음(코드품질 영역, Area2 55회차 기확인).
> - **`54287e6`(대기함 썸네일/검색 수정)**: 2026-07-29 백로그 소진 세션이 브라우저 실클릭으로 발견한 "검색결과를 클라 필터가 가리는데 빈 상태 문구는 '없습니다'" 버그의 수정 커밋 자체 — 새로 발견할 대상 아님(이미 그 사이클에서 처리 완료).
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 이전 4건(#585·#586·#587·#589) 안티패턴 재grep 전부 잔존 확인(`messagesAd.ts:381-382` success_count/fail_count만·`messagesAd.js` adLoadOptOuts 파라미터 미전달·`orders/core.ts` consolidate_with_order_id 하드삭제 미정리 잔존) — fixed-in-tree 없음.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(#590 신규 추가) · done/rejected는 이번 사이클 close 0건이라 재조회 생략, Area2 55회차 캐시(511/6) 신뢰.
> - **🧬 SKILL 강화 없음** — #590은 기존 "저장 경로만 고치고 로드 경로 누락" 클래스(#377 부분픽스 계열의 save/load 비대칭 변종)로 설명 가능, 별도 codify 불필요 수준.
> - 신규 이슈 1건(#590), 자동수정 0건(Area 3 정책상 issue-only), done-sync: new 5(+1)·done 511·rejected 6. 다음 순번 **Area 4**.
>

> **Area 4 데이터 정합성 (2026-08-01T09:17):**
> - **방법**: `git fetch origin main`(HEAD `efe8b36` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 4 **49회차** — 직전 Area4(`29ee563`, 07-30T21:35, 48회차) 이후 `git log 29ee563..HEAD -- src/routes migrations src/scripts`는 **5커밋**: 취소주문 완전삭제 2단계 복원(`a621cdd`)·트레이 관리+파일명 정보우선형(`1a66d92`)·가공대기함 자동 묶음 프리필(`737ecbb`)·AR정책 SSOT(`d41699b`, Area5 47회차 기검증)·동산 이카운트 매출 상반기 prod 적재(`f10a8fa`, 주문 7,446·라인 16,873). 전부 인라인 직접 diff Read(과다위임 억제, 신선 churn 작아 정독이 빠름).
> - **`a621cdd`(취소주문 하드삭제 재활성화) 고아 참조 전수 재검증**: node 스크립트로 마이그레이션을 소스순서(CREATE/ALTER/DROP/RENAME) 파싱해 `order_id`류 컬럼을 가진 전 테이블(19개) 목록화 후 하드삭제 batch(`orders/core.ts:653-706`)의 정리 커버리지와 대조 — **`orders.consolidate_with_order_id` 1건만 미정리**(Area2 55회차가 이미 #589로 보고, 재중복 아님). 나머지 후보 `adjustments.order_id`·`mrp_runs.order_id`는 마이그레이션에 `FOREIGN KEY ... ON DELETE SET NULL` 실선언(0047·0073) — prod D1 FK 강제(#413) 하에 자동 정리되므로 수동 batch 불필요(FP, cascade 확인 규칙 §Area4 line148② 그대로 적용). net-new 고아 클래스 0.
> - **`1a66d92`(트레이 restore 엔드포인트) 컬럼존재성+TOCTOU 재확인**: `designer_intakes.status`(CHECK waiting/absorbed/void)·`order_item_id`(REFERENCES order_items(id))·`absorbed_at` 전부 0463 마이그레이션에 실재(그라운드트루스 대조). `UPDATE ... WHERE id=? AND status IN ('absorbed','void')` 상태 재명시 가드로 TOCTOU 안전. `order_item_id=NULL`만 해제하고 주문 라인 자체는 불변 — 주석이 명시한 설계("조용한 주문 변조 방지")와 실제 SQL 일치. clean.
> - **🔴 net-new 발견: #591 `f10a8fa`(이카운트 이관) 자체 감사문서가 진단한 prod 정정이 미실행 상태로 방치** — `docs/dongsan-import/INSPECTION.md:413`이 "공군사관학교(id=3763)의 `business_registration_number`가 실제 BRN이 아니라 내부코드 `'00017'`이므로 NULL로 정정 필요"라고 명시했으나, 추적되는 마이그레이션(0499·0500·0503·0504) 어디에도 이 UPDATE가 없고 세션노트에도 완료 언급이 없다(실제 적재 SQL은 PII라 gitignore 대상이라 저장소에서 실행 여부 확인 불가). `business_registration_number`는 세금계산서 발행 시 그대로 `buyer_brn`으로 제공사에 전송되는데(`taxInvoices/issue.ts:214/374/426`) 코드베이스에 BRN 형식/체크섬 사전검증이 없어(이관 스크립트 자체는 체크섬 게이트를 두고도) 5자리 내부코드가 그대로 나가 발행 실패 위험. egress 차단으로 prod 현재값 직접 확인 불가 + 단일행 financial-master UPDATE라 자동수정 대상 아님 → issue-only(#591, S).
> - **`737ecbb`(카드 편입 자식수량 하드코딩→실제값)**: `helpers.ts` 1줄 read-only 산식 수정(qty:1→child.quantity), N+1/entity_id 영향 없음, Area2 55회차·Area3 48회차 기검증과 합치. 재확인만.
> - **표준 스캔 전부 clean**: `npx tsc --noEmit` 0 · `entity-audit.mjs` 127파일/SELECT60/통과60/누락0 · `sort-audit.cjs` P1 0(P3/P4만 기존 141건, 변동 없음) · 마이그 번호 중복 기존 5쌍만(0327·0412·0416·0420·0453, 신규 0499~0504 전부 유일) · `branch:clean` SAFE-absorbed 1건(임계 30 미달, 백로그 미등록).
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **5건**(#585·#586·#587·#589·#590) — 이번 델타 5커밋이 그 이슈들의 대상 파일(`messagesAd.ts`·`messages.ts`·`orders.js`의 edit-load 경로 등)을 건드리지 않아 재grep 없이 unchanged 캐시 신뢰(Area3 48회차가 직전에 직접 재grep 완료).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(#591 신규 추가) · done/rejected는 이번 사이클 close 0건이라 재조회 값 그대로(511/6, Area3 48회차 캐시와 일치 재확인 완료).
> - **🧬 SKILL 강화 없음** — #591은 "감사문서가 스스로 진단한 정정 항목이 실행 추적 없이 방치"라는 변종이나, 단발성 마스터데이터 1건이라 아직 반복 클래스로 codify할 근거 부족(다음 대량이관 시 재현되면 standing scan 후보).
> - 신규 이슈 1건(#591), 자동수정 0건(financial-master 단일행 수정 + egress 검증불가라 issue-only), done-sync: new 6(+1)·done 511·rejected 6. 다음 순번 **Area 5**.
>

> **Area 5 보안 (2026-08-01T15:15):**
> - **방법**: `git fetch origin main`(HEAD `605cf54` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 5 **48회차** — 직전 Area5(`d41699b`, 07-30T?, 47회차) 이후 `git log d41699b..HEAD -- src/routes src/scripts migrations index.tsx src/layout`는 **3커밋**: 취소주문 완전삭제 2단계 복원(`a621cdd`)·트레이 관리+파일명 정보우선형(`1a66d92`)·가공대기함 자동 묶음 프리필(`737ecbb`). 전부 Area2 55회차·Area3 48회차·Area4 49회차가 각자 렌즈(entity_id/N+1/UX/고아참조/컬럼존재성)로 이미 리뷰했으나 보안 렌즈(IDOR·XSS·인증·인젝션)는 이번이 최초 — 3커밋 인라인 직접 diff Read(과다위임 억제, 신선 churn 작아 정독이 빠름).
> - **`a621cdd`(취소주문 하드삭제 재활성화) IDOR·권한 재확인**: `DELETE /:id`가 `entityFilter(c)`로 주문 조회를 이미 격리(`efOrd`, #333) — CANCELLED 하드삭제 신규 게이트(`user.role !== 'ADMIN' → 403`)는 기존 `requireRole('ADMIN','MANAGER')` 라우터 가드 안에서 ADMIN만 하드삭제 통과·MANAGER는 403으로 명확히 차단, 권한 상승 경로 없음. 하드삭제 batch(662-711행) 전체 파라미터라이즈 확인(문자열 결합 SQL 0건) — 인젝션 없음. clean.
> - **`1a66d92`(트레이 restore·void-bulk) IDOR·TOCTOU 재확인**: `POST /intakes/:id/restore`·기존 `/void-bulk` 둘 다 `entityFilter(c,'designer_intakes')`로 조회 격리 + `canVoidIntake()`(등록 본인 또는 ADMIN/MANAGER) 소유자 검증 + UPDATE에 상태조건 재명시(`WHERE id=? AND status IN(...)`)로 TOCTOU 안전(#534 absorb 패턴과 동일). `GET /intakes` status 콤마다중 파라미터는 `split(',').map(trim)` 후 전량 파라미터 바인드(IN절 플레이스홀더) — SQL 인젝션 경로 없음, entityFilter도 그대로 유지. `printEvents.ts` resolveCard 정규식 anchored→비anchored 변경은 read-only 파일명 파싱 + 파라미터 바인드된 후속 조회라 보안 영향 없음(정규식 자체도 ReDoS 취약 패턴 아님 — 중첩 quantifier 없음).
> - **`737ecbb`(자동 묶음 프리필) XSS 재확인**: `intake.js`/`parent.js` 신규 innerHTML 삽입 지점(`ofTrayRowHtml`·`stBadge`·`sizeLabel`) 전수 확인 — 자유입력 소스(`r.keyword`)는 기존과 동일하게 `escapeHtml()` 적용 유지, 신규 `group.label` 필드는 이 커밋에서 유일하게 하드코딩 리터럴(`'완성본'`)로만 세팅되고 `ai_groups_json`/`groups_json`(IA 에이전트 응답) 스키마엔 `label` 키 자체가 없음(`grep -rn "\"label\"" IllustratorAutomat/*.cs` 0건) — 즉 free-text 유입 경로 없음, dormant sink 아님(FP, 향후 다른 caller가 `.label`에 실제 자유입력을 넣으면 재오픈 대상). `group.content`/`group.qty`는 커밋 메시지가 명시한 대로 `.value =` DOM 프로퍼티 직접 대입(HTML 문자열 조립 아님)이라 attr 이스케이프 문제 자체가 발생 안 함 — 올바른 패턴. `helpers.ts` 카드수량 반영은 read-only 산식이라 보안 영향 없음.
> - **필수 grep 2종(매 사이클)**: `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43 BAROBILL_FTP_PASSWORD || ''`(빈 문자열 폴백, 시크릿 리터럴 아님·인증 실패로 이어질 뿐 백도어 아님 = FP) 1건 외 없음. `grep -rnE "password.*\|\| *'[^']+'" src` + CI yml `secrets\.[A-Z_]+ *\|\| *'` → 0건. net-new 하드코딩 시크릿/기본비밀번호 없음(기존 #314/#338 판정과 동형 유지).
> - **형제-비대칭 IDOR 스팟체크**: 이번 델타가 건드린 3파일(`orders/core.ts`·`workbench.ts`·`printEvents.ts`) 모두 단건/벌크 mutate 핸들러가 형제 read 핸들러와 동일하게 entityFilter를 적용 — #452/#455/#481 클래스의 "일부만 격리" 비대칭 재발 없음.
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **6건**(#585·#586·#587·#589·#590·#591) 전부 보안 라벨 아님(bug/improvement)이고 이번 델타 3커밋이 그 이슈 대상 파일(`messagesAd.ts`·`messages.ts`·`orders.js` edit-load·`docs/dongsan-import`)을 안 건드려 재grep 없이 unchanged 캐시 신뢰(Area4 49회차 직전 재grep 완료).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동 없음, 이번 사이클 신규 이슈·close 0건) · done/rejected 511/6(Area4 49회차 캐시 신뢰).
> - **🧬 SKILL 강화 없음** — 이번 사이클은 기존 표준 레시피(entityFilter 형제대조·TOCTOU 재명시·DOM 프로퍼티 vs innerHTML 구분)로 전부 판정 가능, 신규 클래스 없음.
> - 신규 이슈 0건, 자동수정 0건(net-new 보안 이슈 없음), done-sync: new 6(변동없음)·done 511·rejected 6. 다음 순번 **Area 6**.
>

> **Area 6 자기 진화 (2026-08-01T21:16):**
> - **방법**: `git fetch origin main`(HEAD `c555deb` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 6 **54회차** — 직전 Area5(`b87aa4b`, 08-01T15:15, 48회차) 이후 `git log b87aa4b..HEAD`는 11커밋, 웹 렌즈 대상(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) 한정 diff는 **마이그레이션 3개뿐**(`0507_jungwoon_flag_fabric_items`·`0508_sign_bom_products`·`0509_sign_bom_calibration` — 정운교역/간판 BOM 데이터 정비, 병렬 worktree 세션). 나머지 8커밋은 `docs/dongsan-import/*.py`(일회성 데이터 생성 스크립트, 웹앱 밖) + `memory/session-context.md`/`PROJECT_STATUS.md` 문서뿐.
> - **컬럼-diff bridge**: 0508이 `product_materials`에 `quantity`/`usage_type`/`usage_param`/`notes` 4컬럼을 신규 ADD COLUMN + INSERT하나, `grep -rn "usage_type\|usage_param" src/routes src/scripts` = **0건** — 이 데이터를 소비하는 라우트/스크립트 코드가 아직 없는 순수 데이터 준비 단계(Python 리포트 생성기 `gen_sign_cost_report.py`가 오프라인 소비, 웹 스택 밖). `bom.ts`는 `product_materials`를 여전히 기존 방식(quantity 미참조)으로만 읽어 회귀 없음. 컬럼 존재성 위험 0(소비 코드 자체가 없어 no-such-column throw 불가능한 상태).
> - **브랜치 위생**: `npm run branch:clean` — SAFE-remote 0·SAFE-absorbed 1(임계 30 미달, 백로그 미등록)·REVIEW 0·SKIP 1(main).
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **6건**(#585·#586·#587·#589·#590·#591) — 이번 델타 11커밋이 그 이슈들의 대상 파일(`messagesAd.ts`·`messagesAd.js`·`orders/core.ts`·`orders.js`/`orderForm/parent.js`·`docs/dongsan-import` 이관감사)을 전혀 안 건드려, 6건 전부 직접 재grep으로 안티패턴 잔존 재확인(캐시 아닌 실측): `messagesAd.ts:381-382` success_count/fail_count만 · `messagesAd.js:329` adLoadOptOuts 파라미터 미전달 패턴 유지 · `orders/core.ts:711` 하드삭제 batch에 `UPDATE orders SET consolidate_with_order_id=NULL` 정리문 여전히 부재(#589) · `orderForm/parent.js` loadOrderForEdit류가 여전히 amount/line_discount 미복원(#590). fixed-in-tree 0건.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **6**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 백로그 기재값과 완전 일치, 드리프트 0.
> - **사이클 로그 트림 체크**: `grep -c "^> \*\*Area" IMPROVEMENT_BACKLOG.md` = 12건(임계 13 미달) → 트림 스킵.
> - **🧬 SKILL 강화 없음** — 이번 사이클은 순수 확인(신선 churn이 데이터전용 마이그 3건뿐·done-sync 정합·브랜치 clean)이라 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 자체가 데이터 전용), done-sync: new 6(변동없음)·done 511·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> 📦 **과거 사이클 로그**는 `IMPROVEMENT_BACKLOG_ARCHIVE.md`/git 히스토리로 이관됨 (2026-06-10 1차 분리, 2026-06-25 2차 트림 343KB→192KB, 2026-06-25T10:00 3차 트림, 2026-07-03T06:00 4차 트림 288KB→86KB, 2026-07-07T13:00 5차 트림 238KB→78KB, 2026-07-20T19:20 6차 트림 — 07-06~07-17 사이클 로그 이관: 306KB→80KB, **2026-07-27T23:00 7차 트림 — 사이클 로그 39건 중 31건 이관(최근 8건=전 Area 1바퀴+2만 유지): 196KB→63KB**). 신규 로그는 계속 이 파일 상단에 추가. 본 파일은 **최근 8사이클 로그**(전 Area 1바퀴 커버 = 직전 사이클 diff 판단에 필요한 최소분) + 영구 참조 섹션(Approved/New/Auto-fixed/Done/Rejected/FP 카탈로그)만 유지. 이관분은 `IMPROVEMENT_BACKLOG_ARCHIVE.md` 또는 `git log -p -- IMPROVEMENT_BACKLOG.md`로 복원 가능.
> ↳ **12차 트림 (2026-08-01, 자동)**: 사이클 로그 14건 → 8건 유지, 6건 이관 (88KB → 트림 후 아래 참조).
> ↳ **11차 트림 (2026-07-31, 자동)**: 사이클 로그 13건 → 8건 유지, 5건 이관 (79KB → 트림 후 아래 참조).
> ↳ **10차 트림 (2026-07-30, 자동)**: 사이클 로그 13건 → 8건 유지, 5건 이관 (83KB → 트림 후 아래 참조).
> ↳ **9차 트림 (2026-07-28, 자동)**: 사이클 로그 13건 → 8건 유지, 5건 이관 (82KB → 트림 후 아래 참조).
> ↳ **8차 트림 (2026-07-27, 자동)**: 사이클 로그 9건 → 8건 유지, 1건 이관 (66KB → 트림 후 아래 참조).

> **Area 2 코드 품질 심층 분석 (2026-07-31T17:15):**
> - **방법**: `git fetch origin main`(HEAD `f0383ef` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 2 **55회차** — 직전 Area2(`1d7e67d`, 07-30T09:17, 54회차) 이후 `git log 1d7e67d..HEAD -- src/routes src/scripts migrations`는 **11커밋**: 취소주문 완전삭제 2단계 복원(`a621cdd`)·트레이 관리+파일명 정보우선형(`1a66d92`)·가공대기함 자동 묶음 프리필(`737ecbb`)·AR정책 SSOT(`d41699b`, Area5 47회차 기검증)·이카운트 매출 적재(`f10a8fa`)·실사 SQL주석 문법오류(`8819705`, Area4 48회차가 이미 #588로 발견·자동수정·close)·자녀행 합계 dead분기 제거(`e0c8c60`)·행 에누리 확정(`e744bc4`, Area4/5 기검증)·대기함 썸네일/검색(`54287e6`)·후가공 실패사유 문구(`67ecf26`)·마감재단선+후가공코드(`c8f255d`, Area3/5 기검증). 코드품질 렌즈(entity_id·N+1·authMiddleware·dead code·SELECT *)로 아직 안 본 3건(`a621cdd`·`1a66d92`·`737ecbb`)을 인라인 직접 diff Read로 심층 분석(과다위임 억제, 신선 churn 작아 정독이 빠름).
> - **🔴 net-new 발견(issue-only): #589 취소주문 2단계 하드삭제(`a621cdd`)가 처음 도달 가능해진 consolidate_with_order_id 정리 누락** — `a621cdd`가 "CANCELLED=무조건 400" 화석 가드를 풀어 ADMIN이 취소주문을 실제 하드삭제할 수 있게 함(도입 이래 최초로 이 경로가 살아있는 데이터에 도달). 같은 하드삭제 batch가 #454/#464/#477/#570로 비-FK 참조(`shipments.merged_into_id`·`print_file_map`·`designer_intakes.order_item_id` 등)를 꼼꼼히 정리하는데, **`orders.consolidate_with_order_id`(0438, 합배송 예약 포인터)만 빠짐**. 대표 주문이 취소→하드삭제되면 자식 주문은 존재하지 않는 id를 계속 들고 있어 `orders.js:463-464`(목록 배지)가 `#<죽은id>`를 그대로 노출하며 클릭 시 `viewOrder(<죽은id>)`로 존재하지 않는 주문을 열려 시도(죽은 링크), 상세 모달(`:1037-1038`)도 "대표 주문 #<죽은id>"로 영구 표시. 기존 #483(07-04, 닫힘)이 "하드삭제 dangling은 read-path 무해(FP)"로 판정했으나 그건 쿼리 레벨(status 필터로 자연배제)만 본 것 — 이번 발견은 **표시 레이어**(raw-id fallback + 클릭 이동)라 #483 범위 밖. 파괴적 삭제 batch 수정 + "그룹에서 조용히 이탈 vs 대표 재선출" 정책 판단 필요해 issue-only(#589).
> - **`1a66d92`(트레이 관리 restore 엔드포인트) 검증**: entityFilter 적용·소유자 검증(`canVoidIntake`)·TOCTOU 가드(UPDATE WHERE status IN 재명시, absorb 패턴과 동일) 전부 정상. `printEvents.ts` resolveCard 정규식 변경(anchored→비anchored)은 read-only 파일명 파싱이라 회귀 위험 낮음, `(?!\d)` 오매칭 가드 확인.
> - **`737ecbb`(자동 묶음 프리필) 검증**: `helpers.ts` 자식카드 수량 하드코딩(1)→`child.quantity` 실제 반영 — read-only 산식 수정, N+1/entity_id 영향 없음. 프론트(intake.js/parent.js/calc.js) 신규 루프에 N+1급 DB 호출 없음(프론트 전용).
> - **authMiddleware 전체 recursive 재스캔(25회차 이후 첫 전면 재확인)**: `for f in $(find src/routes -name '*.ts'); do grep -q authMiddleware "$f" || (grep -qE "\.(get|post|put|delete|patch)\(" "$f" && echo "$f"); done` → 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전수 확인 — `orders/helpers.ts`·`payroll/shared.ts`·`taxInvoices/helpers.ts`는 `Map.get(` FP(라우터 아님), `publicUnsubscribe.ts`는 정보통신망법 §50⑧ 명시 무인증+rate-limit(기존 FP), `cron.ts`는 `agentKeyMiddleware`(에이전트 키 게이트, 기존 FP), `hrSelf.ts`는 scoped-token(기존 FP), `messagesAd.ts`는 barrel 패턴(`messages.ts:120` 부모가 `authMiddleware+requireRole` 선적용 후 `:123 .route('/ad', ...)`로 마운트, 자체 `:40 requireRole('ADMIN')`은 추가 강화) — **net-new 0**, 전부 기존 FP 카탈로그로 판정 가능.
> - **SELECT * / N+1 / dead code**: 이번 델타 신규 INSERT 0건(entity_id 점검 대상 없음), 신규 `for/forEach`+`await prepare` N+1 패턴 0건, `e0c8c60`의 `isChild` 분기 제거는 이미 dead-code 정리(안전, 커밋 자체가 정리).
> - **표준 스캔**: `npx tsc --noEmit` 0.
> - **open≠unfixed 재확인**: `list_issues(OPEN,auto-improve)` 실측 신규발견 전 3건(#585·#586·#587) 잔존(Area1 54회차 재확인과 동일) — fixed-in-tree 없음.
> - **backlog↔GitHub 절대값 재동기화**: open **4**(#589 신규 추가) · done/rejected는 이번 사이클 close 0건이라 재조회 생략, Area1 54회차 캐시(511/6) 신뢰.
> - **🧬 SKILL 강화 없음** — #589는 기존 #454/#477/#570 형제완전성 레시피 그대로 적용 가능, 신규 클래스 아님(다만 #483이 "쿼리레벨 FP"로 이미 닫은 컬럼을 "표시레이어"에서 재발견한 사례로 — 향후 "#483급 dangling-FP 판정"은 쿼리뿐 아니라 그 값을 그대로 노출/클릭이동에 쓰는 프론트 소비처까지 재확인 필요라는 교훈만 メモ, 별도 codify 불필요 수준).
> - 신규 이슈 1건(#589), 자동수정 0건(파괴적 삭제 batch 수정 + 정책판단 필요라 issue-only), done-sync: new 4(+1)·done 511·rejected 6. 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-07-31T16:26):**
> - **방법**: `git fetch origin main`(HEAD `1237056` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). 프록시가 이번 세션도 prod 호스트 직접 curl 차단(`webapp-9i0.pages.dev` CONNECT exit 56 — #453 기존 인지 상태 재확인, 변동 없음) — 직접 prod API 헬스체크 불가, GitHub Actions CI 기록으로 대체. Area 1 **54회차** — 직전 Area6(53회차, `7ae8c81`) 이후 `git log 7ae8c81..HEAD`는 **10커밋**(취소주문 완전삭제 2단계 복원·트레이 관리+파일명 정보우선형·가공대기함 자동 묶음 프리필·이카운트 상반기 통장매칭 적재 등 신규 feature churn — 다음 Area2/3/4/5 사이클이 각자 렌즈로 다룰 대상, Area1은 헬스만 확인).
> - **deploy.yml 전수 확인**: 최근 30개 run(2026-07-29T23:26~2026-07-31T04:09Z, `bd69a0b8`~`1237056a`) **전부 `success`** — CF-internal transient·cold-start 재발 0. 취소주문 삭제 2단계 복원(`a621cdd`)·트레이 관리(`1a66d92`)·대기함 자동 묶음 프리필(`737ecbb`)·이카운트 통장 매칭 적재(`f2eb3d4`) 등 신규기능 churn을 관통하며도 배포 전량 green.
> - **backup.yml 신선도**: 최신 run(`d41699b5`, 2026-07-30T18:09:39Z) success — 다음 일일 백업(~18:00Z)까지 약 10시간 남은 정상 주기 내(미실행 아님). 직전 6회 전부 success, 07-28 `cancelled` 1건(`da70faae`)은 기존 인지된 "연속 트리거 supersede" 패턴으로 무해(변동 없음).
> - **e2e.yml**: 최신 run 여전히 2026-06-22(failure/cancelled) — `disabled_manually` 기존 인지 상태 재확인, 변동 없음. **verify.yml**: 열린 PR 0건(`list_pull_requests(open)`=[] 직접 확인) → 이번 사이클도 실행 0건, 정상.
> - **open≠unfixed 재확인**: `list_issues(state:OPEN)` 실측 auto-improve 라벨 **3건**(#585·#586·#587, Area6 53회차 캐시와 일치) — 10건 신선 churn 이후에도 세 이슈의 원 안티패턴을 직접 재grep(`messagesAd.ts:381-382` success_count/fail_count만·`messages.ts:246/261` adSubject/adContent oninput 부재·`messagesAd.js` adLoadOptOuts 파라미터 미전달) 전부 잔존 확인 — fixed-in-tree 없음. 별도 라벨(`auto-scan`/`infra`) #453(egress 차단 인프라 갭)도 OPEN 유지, 이번 사이클이 그 한계를 직접 재현(curl exit 56)해 현재도 유효함 재확인.
> - **backlog↔GitHub 절대값 재동기화**: open auto-improve **3**(재확인) · done/rejected는 이번 사이클 close 0건이라 재조회 생략, Area6 53회차 캐시(511/6) 신뢰.
> - **🧬 SKILL 강화 없음** — 순수 CI/헬스 확인 사이클, 신규 클래스 없음.
> - 신규 이슈 0건, 자동수정 0건(순수 CI/인프라 헬스 확인), done-sync: new 3·done 511·rejected 6. 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-07-31T09:15):**
> - **방법**: `git fetch origin main`(HEAD `7368054` = origin/main 일치, 워킹트리 clean) 후 `npm ci`(node_modules 0→81). Area 6 **53회차** — 직전 Area6(`87b5023`, 07-29T21:25, 52회차) 이후 `git log 87b5023..HEAD`는 39커밋, 웹 렌즈 대상(`src/routes`/`src/scripts`/`migrations`) 한정 **11커밋**(bd69a0b·5b70c58·2fe74b9·c8f255d·67ecf26·54287e6·e744bc4·e0c8c60·8819705·f10a8fa·d41699b). **핵심 관찰 = 이번 사이클은 신선 churn이 사실상 0** — Area1(53회차)~Area5(47회차)가 직전 24시간 내 연속 실행되며 위 11커밋을 전부 각자 렌즈로 이미 커버했고(코드품질=Area2 54회차, UX=Area3 47회차, 데이터정합성=Area4 48회차, 보안=Area5 47회차), **현재 HEAD(`7368054`)가 정확히 Area5 47회차 자신의 커밋 마커** — 즉 Area5 종료 이후 신규 커밋이 0건이라 Area6의 표준 브릿지(직전 Area4 이후 컬럼-diff, 직전 Area5 이후 XSS 재감사)가 검토할 신선 대상 자체가 없음.
> - **브랜치 위생**: `npm run branch:clean` — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0·SKIP 1(main). 정리 대상 0건.
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **3건**(#585·#586·#587) — Area3 47회차·Area5 47회차가 같은 HEAD에서 이미 안티패턴 잔존을 직접 재grep 확인했고(§messagesAd.ts success_count/fail_count만·messages.ts oninput 부재·messagesAd.js search 파라미터 미전달) 그 이후 churn이 0이므로 verified-once+unchanged 캐시를 신뢰(스팟체크: `success_count`/`fail_count` 필드만 존재 재확인, 잔존).
> - **close-pending 적체 해소 확인**: 이전 사이클들이 close-pending으로 추적하던 #479(showPrompt options 오전달 자동수정)를 직접 조회 — `state:closed, reason:completed`로 정상 종결 확인(#480·#481도 open 3건에 미포함 = 종결). close-pending 잔류 0건.
> - **backlog↔GitHub 절대값 재동기화**: open **3**(재확인) · `search_issues(reason:completed)` **511**(재확인, 변동 없음) · `not_planned`(4)+`duplicate`(2) **6**(재확인, 변동 없음) — 전부 백로그 기재값과 정확히 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음**: 이번 사이클은 순수 확인(신선 churn 0·done-sync 정합·브랜치 clean)이라 신규 코드화 패턴 없음. 백로그 사이클 로그 11건(트림 임계 13건 미달) → 트림 스킵.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 자체 없음), done-sync: new 3·done 511·rejected 6(전부 변동 없음). 다음 순번 **Area 1**.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 5건** — #590은 2026-07-31T18:10 Area 3 48회차 신규 등록.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
| #585 | messagesAd.ts POST /send 실패 수신자 식별 불가 — #574 형제 라우트(messages.ts /send-bulk) 미반영 | Area 3 | bug,M | issue-only, 신규(#585) |
| #586 | 광고문자 제목/본문 수정 시 "대상 확인" 미리보기 게이트 미무효화 | Area 3 | bug,S | issue-only, 신규(#586) |
| #587 | 광고문자 수신거부 명단 — 서버 search 파라미터 미사용, 300건 상한 초과 시 과거건 조회 불가 | Area 3 | improvement,S | issue-only, 신규(#587) |
| #589 | 취소주문 2단계 하드삭제(a621cdd)가 처음 도달 가능해진 consolidate_with_order_id 정리 누락 — 자식 주문에 죽은 링크/유령 ID 잔존 | Area 2 | bug,S | issue-only, 신규(#589) |
| #590 | 주문 수정 재진입 시 기존 행 에누리(line_discount) 미복원 → 다음 저장에서 소멸 | Area 3 | bug,M | issue-only, 신규(#590) |

> 직전 사이클(45회차) 표에 있던 #559·#558·#557·#556·#555·#554는 2026-07-29 백로그 소진 세션에서 owner가 심각도순 전건 처리(코드 픽스+배포+close, 상세는 상단 "2026-07-29 백로그 소진 세션" 노트 참조) → Done 이관.

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
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
