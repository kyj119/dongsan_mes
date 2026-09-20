# Improvement Backlog
<!-- last_run_area: 6 -->
<!-- last_run_at: 2026-09-20T21:45:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **5** (`list_issues(state:OPEN,label:auto-improve)` 실측, 변동없음) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **571** (변동없음) |
| ❌ rejected | **6** (변동없음) |

> **Area 6 자기 진화 (2026-09-20T21:45):**
> - **방법**: 세션 시작 시 detached HEAD `051cb9e`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 67회차 사이클의 결과 커밋 `9750e74`)**: `git diff --stat 9750e74..HEAD -- src migrations scripts .github wrangler.toml index.tsx` = **0파일**, `git log 9750e74..HEAD -- LogWatcher IllustratorAutomat caps-worker workers queue` = **0커밋**. `git log --oneline 9750e74..HEAD` 6커밋 전부 이번 순환(Area6→1→2→3→4→5) 자신들의 북키핑 커밋뿐 — **Area4·5가 이미 각자 로그에 적었던 "이번 순환 전체 애플리케이션 코드 churn 0"이 Area6 렌즈로도 재확인됨**. 컬럼-diff bridge·XSS bridge·비웹앱축 스캔(「비-웹앱 런타임 축」) 전부 대상 churn 자체가 없어 신선 각도 재검토 대상 0건.
> - **done-sync 절대값 재동기화**(리터럴 쿼리): `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **571**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **5**(#654·#650·#626·#617·#616, 변동없음).
> - **open≠unfixed 재확인**: 코드 churn 0이라 5건 전부 상태 불변. `#654`(shipBilling 고아라우트+형제누락)·`#650`(items.ts with_stock=1 entity 격리 누락) — 관련 파일(`shipments.ts`·`items.ts`) 이번 churn에 없음 = 안티패턴 그대로 잔존, 재검증 불요(캐시 신뢰, 32회차 규칙). `#626`(PII키 분리 결정대기) — owner 코멘트 unchanged. `#617`·`#616`(LogWatcher) — owner가 09-08-31 각각 "실기 확인 대기"·"exe 재빌드+PC 롤아웃 대기"를 직접 명시해 열어둔 상태 → 64회차 FP룰(owner가 열어두는 이유를 스스로 밝히면 사이클수 집계 금지) 적용, staleness 통지 불요.
> - **standing scan**: `npm run audit:migration-number`(파일수 불변, 신규 중복 없음, 같은테이블 DDL충돌 0) · `node scripts/sort-audit.cjs`(P1 0, P2 4건 기존 FP 유지) · `npm run branch:clean`(SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, 삭제대상 0) · `npm audit --omit=dev`(0건) · `npm run audit:skills`(OK, 스킬 19개 상주비용 ~2,662자).
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 8런 전부 `conclusion:success`(최종 HEAD `051cb9e` 포함, run #2017).
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클은 "코드 churn 0"이 **2회 연속**(직전 Area4·Area5도 각자 렌즈에서 동일 관측) 관측된 것 — 한 사이클의 우연이 아니라 이번 순환(Area6→5) 전체가 조용했던 것으로 확인되나, 원인이 개발활동 소강(외부 요인)이지 탐지 로직 결함이 아니라 별도 규칙화는 여전히 불요(37회차 이후 "0-churn 자체는 codify 대상 아님" 판단 유지).
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 9건 → 이번 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(전 영역 churn 0이라 재검토 대상 자체가 없음), 자동수정 0건, done-sync: open 5(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-20T13:00):**
> - **방법**: 세션 시작 시 detached HEAD `0862373`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. shallow clone → 직전 Area5 앵커(`1e50a2e`)가 depth 밖이라 `git fetch --unshallow` 필요(기존 codify된 함정 그대로 재현·대응). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 사이클 세션시작 HEAD `1e50a2e`)**: `git diff --stat 1e50a2e..HEAD -- src/routes src/middleware src/utils index.tsx wrangler.toml .github/workflows` **29파일**. `kakao.ts`·`kakaoIdentity.ts`·`shipmentNotice*.ts`·`shipBilling.ts`는 **바로 그 직전 Area5 사이클 자신**이 이미 이 앵커~그 사이클 종료 시점까지 정독 완료한 클러스터(로그 확인) — 재검토 불요. `payroll/shared.ts`·`itemUnits.ts` 형제완전성은 Area2(09-19)가 이미 코드 대조 완료.
> - **Area5 고유 미검토분 직접 정독** (holidays entity축·attendance entity-follow·caps map-employees·shipments #652/#653·payroll reconcile/recalc-deductions·clients has_po·leaves countWorkingDays·items variant-bases·purchaseCandidates/weeklyPurchase N+1접기·printEvents 누계판정·userPrefs presets 등, `orders/helpers.ts`·`orders/lifecycle.ts`·`cards/lifecycle.ts`·`storageZones.ts` 포함): 전 파일 diff 직접 Read, IDOR·SQL 인젝션·authMiddleware 누락·XSS 렌즈로 대조. **결함 0건** — 전부 바인드 파라미터, entity_id 축 변경(attendance `a`→`e`, holidays `entity_id=0 OR entity_id=?`)은 기존 FP클래스와 동형(파생 스코프 정상), `payroll/core.ts` 신규 `/reconcile` 라우트는 router-wide `requireRole('ADMIN','MANAGER')`(`:30`)+`entityFilter(c,'p')` 이미 적용, `payroll/settings.ts` holidays CRUD도 router-wide 인증 확인. `caps.ts GET /map-employees`는 문서화된 의도적 cross-entity(전 법인 매핑 필요)+ADMIN/MANAGER 게이트+PII 최소필드(급여·주민번호 제외)로 기존 FP클래스("문서화된 cross-entity 기능") 그대로.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(빈 문자열 폴백, 기존 FP, 변동없음). 하드코딩 기본 비밀번호·CI 시크릿 폴백 0건.
> - **standing scan 2: `node scripts/check-xss.mjs`**(advisory) — 108건 중 이번 churn 관련 파일(messages.js/messagesAd.js/payroll.js/shipments.js/shipmentsDashboard.js/purchaseCandidates.js/storageZones.js/weeklyPurchase.js) 16건 전수 직접 대조 — 전부 기존 FP 클래스(에러메시지 reflected·escapeHtml/escapeAttr/pcqEsc 이미 적용·숫자집계 only). net-new 미이스케이프 0건.
> - **standing scan 3: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·누락 **0건**(변동없음).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지.
> - **standing scan 5: `npm run branch:clean`** — 삭제대상 0건. **standing scan 6: `npm audit --omit=dev`** — 0건.
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런 전부 `conclusion:success`(최종 HEAD `0862373` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **5**(변동없음). `#650`(items.ts `with_stock=1` 최근판매단가 entity 격리 누락) — `items.ts:226-235` 직접 재확인, `last` 서브쿼리(order_items JOIN orders) 여전히 entity 필터 없음 = 정상 open, 재보고 불필요. `#626`(fix-auth 보류 보안 항목 트래킹) — owner 결정 대기 unchanged.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 완료). 이번 사이클은 기존 FP 카탈로그(entity 파생축 변경·문서화된 cross-entity·router-wide 인증)를 그대로 적용한 사례일 뿐 새 클래스 없음.
> - **백로그 트림 체크**: 사이클 로그 8건 → 이번 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(29파일 전수 직접 Read, IDOR·인젝션·XSS·인증누락 렌즈 전부 clean), 자동수정 0건(고칠 결함 없음), done-sync: open 5(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-20T06:30):**
> - **방법**: 세션 시작 시 detached HEAD `762a212`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`, 실은 실제 force-push가 아니라 이 세션 클론이 들고 있던 낡은 캐시 ref — `git log`로 `02eb83e`가 762a212의 조상임을 확인해 안전 판정) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 세션시작 HEAD `597144d`)**: `git log 597144d..HEAD` **6커밋** — 전부 이번 순환 6개 Area의 자기 북키핑 커밋(Area4→5→6→1→2→3)뿐, `git diff 597144d..HEAD -- src/routes src/utils migrations` = **0파일**. 이번 순환 전체를 통틀어 애플리케이션 코드 변경이 전무했던 드문 사이클(전 사이클들이 100건 안팎 커밋을 다루던 것과 대비) — Area4 고유 렌즈로 재검토할 신규 대상 자체가 없음.
> - **prod 데이터 직접조회 불가 재확인**: 이 세션은 egress 차단(Cloudflare 자격증명 없음, `env`에 `CF_*`/`D1_*` 없음) — 고아 레코드·상태 불일치·중복 데이터 등 **실 데이터 기반 점검은 이번에도 불가**(기존 사이클들과 동일 제약). `schema/baseline_reference.sql`(로컬 D1 부트스트랩 원본)을 직접 열어 재확인: 1,037개 INSERT 전부 `item_categories`·`post_processing_options` 류 **참조/룩업 테이블**뿐이고 `orders`/`order_items`/`clients` 같은 트랜잭션 데이터는 0건 — 로컬 D1로는 스키마 그라운드트루스만 가능하고 데이터-레벨 정합성 검증은 애초에 재현 불가능함을 재확인(신규 발견 아님, 기존 제약의 재확인).
> - **standing scan 1: `npm run audit:migration-number`** — 파일 642개, 중복 25쌍(변동없음), **같은 테이블 DDL 충돌 0건**.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런(Daily D1 Backup 포함) 전부 `conclusion:success`(최종 HEAD `762a212` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **5**(#654·#650·#626·#617·#616, 변동없음) — 전건 Area4 관할 밖(Area2/5/6). Area4가 직접 관여했던 #651·#652는 이미 지난 사이클에 close 완료.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식). "애플리케이션 코드 churn 0" 자체는 이 사이클 처음 관측된 상태라 codify 후보로 검토했으나, 원인이 이번 순환 특이값(우연히 조용한 하루)이지 탐지 로직의 결함이 아니라 별도 규칙화 불필요.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 12건 → 이번 추가 후 13건, 임계(13건) 도달 → 트림 실행.
> - 신규 이슈 0건(churn 자체가 0이라 재검토 대상 없음, prod 데이터 접근 불가 제약 재확인), 자동수정 0건, done-sync: open 5(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-19T13:10):**
> - **방법**: 세션 시작 시 detached HEAD `291d930`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 사이클 세션시작 HEAD `73b8c0e`)**: `git log 73b8c0e..HEAD` 28커밋, `src/pages`+`src/scripts` diff **3커밋**(`5a65ef2`·`3610549`·`095a7af`) — 웹앱 UX 표면 변화가 이례적으로 적은 사이클. `5a65ef2`(합배송 타법인 파트너 출고 실패 수정)는 Area4·5가 이미 IDOR/entity 렌즈로 정독 완료(로그 확인).
> - **`095a7af`+`3610549`(표 잘림 감시자+실제 수정 12곳) Area3 고유 렌즈 검증 — 정확히 이 영역 소관**: prod 56화면 전수 실측(52건 잘림·35건 title 부재)→구조적 해결(`dsTd` 자동 title 부착·`.ds-chip` 자기축소·`npm run audit:table-clip` 기준선 게이트, `/deploy-verify` Phase 4 배선)+실제 12개 열 폭 수정(실측 데이터 기반)을 커밋 메시지 자체가 원인·조치·게이트를 전부 서술하는 자기완결 postmortem으로 기록. **직접 diff 확인**: `dsTd()` 헬퍼가 실제로 title 속성을 자동 부착(`shared-styles.ts`), `table-clip-audit.cjs`가 기준선(44건) 대비 회귀만 잡는 구조(누적 총량이 아닌 신규만 차단, `audit:stock-ledger`와 동일 패턴)로 CLAUDE.md 서술과 일치. 결함 0건 — 오히려 이 영역이 스스로 발견해야 했을 결함군(빈 상태·잘림)을 코드가 자체 감사했다.
> - **보류 항목(`/bank 거래처`) 재확인**: 커밋이 명시적으로 "성격이 다르다(열 폭 아니라 데이터 축)"로 보류했는데, 기준선(`table-clip-baseline.json:44`)에 이미 등재돼 있고 title 속성 보유(정보 손실 없음, 호버로 복구 가능) 확인 — 신규 이슈화 불필요(이미 알려진·완화된 상태).
> - **standing scan 1: showConfirm 콜백 오용(#426 클래스)** — `grep -rn "showConfirm(" src/scripts`로 2번째 인자가 함수인 오용 패턴 **0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: 로딩 표시 커버리지 재확인(15회차·31회차 갭 목록)** — 당시 누락으로 지목된 7페이지(orders/clients/inventory/purchaseOrders/quotations/approvals/cardExpenses) + #498에서 지목된 quality.js/hometaxInvoices.js 전부 `dsSkeleton`/로딩 표시 적용 확인(코드 직접 대조) — 갭 **전량 이미 해소**(과거 사이클의 자동수정이 누적 반영된 결과로 보임), 재이슈 불필요.
> - **standing scan 5: 신규 axios 호출 dead-button 스캔** — `git diff 73b8c0e..HEAD -- src/pages src/scripts`에 신규 axios 호출 **0건**(churn이 UI 폭 조정뿐이라 신규 API 소비 없음) — 27·29회차 전수 스캔(net-new 0) 이후 재검증 불요.
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런 전부 `conclusion:success`(최종 HEAD `291d930` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **5**(#654·#650·#626·#617·#616, 변동없음) — 전건 Area3 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클(표 잘림 감시자)은 Area3 고유 클래스의 실제 사례이나 이미 코드 자체가 원인·게이트·기준선을 완비해 새로 codify할 오탐 패턴·탐지 레시피 없음.
> - **백로그 트림 체크**: 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(3커밋 전수 직접 정독, table-clip 클러스터는 이미 자기완결 해결+게이트 보유, 로딩표시 과거 갭 전량 해소 재확인, dead-button 신규 0), 자동수정 0건(고칠 결함 없음), done-sync: open 5(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-19T07:20):**
> - **방법**: 세션 시작 시 detached HEAD `6a837c8`(origin/main과 동일, Area1 직전 사이클 커밋) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. shallow clone → `git fetch --unshallow`(앵커가 depth 밖). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 사이클 세션시작 HEAD `c54f68c`)**: `git log c54f68c..HEAD` 133커밋, Area2 스코프(`src/routes`·`src/types`·`src/utils`·`migrations`·`index.tsx`) diff **57파일**. 대부분(kakao 알림톡·CAPS 매핑화면·holidays entity-scope·attendance entity-follow·coating unify·합배송 entity필터·#651/#652 dedup)은 Area1·3·4·5·6가 이번 순환에서 이미 각자 렌즈로 정독 완료(백로그 로그 커밋해시 대조 확인) → **Area2 고유 렌즈(entity_id INSERT·N+1·authMiddleware·타입불일치·dead code·SELECT *)로 미검토였던 신규 유틸 클러스터**를 직접 정독: `itemUnits.ts`(256신규, 0619/0620)·`shippingFee.ts`(98신규, 0621)·`shipBilling.ts`(73신규)·`payroll/shared.ts`(+228).
> - **`itemUnits.ts` 단위 변환계수(factor) 형제완전성 — #462 클래스 정밀 대조**: 발주 라인 계수(`backfillPoLineFactors`) 호출처를 파일 자신의 주석("발주를 만드는 경로가 여럿이다: 신규·복사·재발주·특별발주·템플릿·발주요청전환×2")과 실제 라우트 7개(core.ts POST '/'·PUT '/:id' [resolveLineFactor 직접 삽입, backfill 불필요]·po-special.ts '/:id/copy'·'/:id/reorder'·'/quick'·templates.ts '/from-template/:templateId'·purchaseRequests.ts 전환 2곳)를 1:1 대조 — **전 경로 커버, 형제 누락 0건**. `applySalesUnitSnapshots`(주문/견적 판매단위 스냅샷)도 orders/create·update·quotations(3곳) 전량 호출 확인, `orders/operations.ts`(주문 복사)는 원본 라인의 `sales_unit/sales_qty/unit_factor`를 직접 컬럼 복사(주석에 "0620 단위표: 판매단위 스냅샷도 복사본으로 넘긴다" 명시)라 헬퍼 미호출이 정상. 결함 0건 — 이 클러스터는 개발자가 이미 형제완전성을 자체 검증하며 만든 사례.
> - **`shipBilling.ts` 되돌리기 짝(clearShipBillingStmt) 형제완전성**: 파일 주석 "되돌리는 문이 넷이라(주문 출고취소·카드 출고취소·출고 CANCELLED·출고 PREPARING 복귀)"를 실제 호출처와 대조 — `shipments.ts`(2, CANCELLED+PREPARING복귀)·`orders/lifecycle.ts`(1, 주문출고취소)·`cards/lifecycle.ts`(1, 카드출고취소) = 정확히 4곳. 일치.
> - **🔍 신규 발견 #654 — `shipments.ts` `PATCH /:id/status`가 고아 라우트 + (살아있었다면) `applyShipBillingDates` 형제 누락**: `src/scripts`+`src/pages` 전수 grep으로 이 라우트를 호출하는 프론트 코드 0건 확인(실제 사용 경로는 `by-order/:id`·`:orderId/ship`·`orders/:id/status` 셋뿐) — `git log -S`로 도입 시점이 2026-05-08 squash 이전임도 확인, `#334` 도달성 규칙(호출 0건=dead code)에 해당. **부수 발견**: 이 라우트가 살아 있었다면 `status==='SHIPPED'/'IN_TRANSIT'` UPDATE(라인 1489-1492·1504-1508)가 바로 위 주석("이 경로로 SHIPPED 올라가면 재고차감·상태이력도 다른 출고 경로와 같아야 한다")대로 재고차감·상태이력은 맞췄는데 `applyShipBillingDates` 호출만 빠져 있어, `shipBilling.ts` 도입 당시 놓친 형제 후보였을 것 — 죽어 있어 현재 영향은 없음. 라우트 삭제/로직변경 둘 다 자동수정 금지 대상이라 **이슈로만 등록**(#654, 라벨 auto-improve+improvement+30분).
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·누락 **0건**(변동없음).
> - **standing scan 2: authMiddleware recursive 스캔** — 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 직전 사이클과 동일 — **net-new 0**(전건 기존 FP 클래스: barrel/scoped-token/public/helpers).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162` — 신규 P2는 실사 편의계수 정렬용 ORDER BY라 페이징 무관, FP).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 1(고유커밋 0 브랜치, 코드 영향 없음)·REVIEW 0, SKIP 1(main).
> - **standing scan 5: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` 세션 시작 시 **4**(#650·#626·#617·#616, 변동없음) — 전건 Area2 관할 밖, **+#654 신규 등록**으로 **5**.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(+1, #654) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(이미 서술식, 잔여 없음). 이번 발견(#654)은 기존 원칙(#334 도달성 + shipBilling 형제완전성) 두 개를 그대로 적용한 사례 — 새 클래스 아님.
> - **백로그 트림 체크**: 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#654, 고아 라우트+형제누락 이중발견), 자동수정 0건(라우트 삭제/로직변경은 SKILL.md 금지 항목이라 이슈로만), done-sync: open 4→5(#654)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-19T01:10):**
> - **방법**: 세션 시작 시 detached HEAD `9750e74`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 사이클 세션시작 HEAD `0949a01`)**: 57커밋, 웹앱 헬스범위(`src/routes`·`src/utils`·`index.tsx`·`wrangler.toml`·`.github/workflows`·`scripts/smoke.cjs`·`migrations`) diff 23파일 — 전부 Area2~6가 이번 순환에서 이미 각자 렌즈로 정독 완료(caps.ts map-employees·kakao 신기능·item_units·holidays entity-scope·attendance entity-follow·printEvents 행별누계 등, 백로그 로그 확인). `scripts/smoke.cjs`(+6, kakao/item_units 프로브 4종 추가)는 **직전 Area1 사이클(0949a01 세션) 자신이 이미 자동수정으로 추가한 것**이 이번 churn 윈도에 포함된 것 — 신규 사각 없음, 재작업 불요.
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 10런 전부 `conclusion:success`(최종 HEAD `9750e74` 포함). 최신 job(`105809543015`) 전 단계(typecheck·check:fn·jwt-decode·build·self-tests·entity audit·migration-number audit·write canary·deploy·smoke) 전부 success, 총 소요 2분36초.
> - **smoke 133/133 PASS**(job 로그 직접 확인 — 이전 129에서 kakao/units 4종 반영해 133으로 증가). 느린 프로브 3개: `cashSchedule.overview` 5279ms·`orders.detail` 2137ms·`hr.stats` 1780ms.
> - **#636(cashSchedule.overview) 재확인**: 5279ms ÷ owner 국내 실측(421~424ms) ≈ 배수 12.4~12.5배 — 기존 확인된 배수 범위(9~14배) 안쪽, 배수 이탈 증거 없음 → 재이슈 불필요(codify된 「owner 실측 판정 우선」 규칙 적용).
> - **LogWatcher 하트비트**: `scripts/smoke.cjs`에 heartbeat 프로브 없음 + 이 세션은 prod로 직접 fetch 불가(egress 차단, `curl` 확인 — connect timeout). LogWatcher 축은 Area6 관할(#617·#616 이미 open, owner 코멘트로 실기 확인 대기 중) — Area1이 중복 보고하지 않음.
> - **standing scan**: `sort-audit.cjs`(P1 0, P2 4건 기존 FP 유지: `attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`) · `audit:migration-number`(신규 중복 없음, 같은 테이블 DDL 충돌 0건) · `branch:clean`(삭제대상 0) · `npm audit --omit=dev`(0건).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **4**(변동없음, #650·#626·#617·#616) — 전건 Area1 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **4**(변동없음) · done **571**(`search_issues` 리터럴 쿼리 재확인, 변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(2건 모두 ms 수치 숫자열 FP, 실참조 0건, 변동없음). 이번 사이클 신규 클래스 없음.
> - **백로그 트림 체크**: 사이클 로그 9건 → 이번 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(churn 전량 타 Area 재확인 완료, net-new 0), 자동수정 0건(고칠 결함 없음), done-sync: open 4(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-19T00:15, 67회차):**
> - **방법**: 세션 시작 시 detached HEAD `a8b6c20`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. shallow clone이라 앵커(`6f8261a`) 조회 시 `git fetch --unshallow` 필요(depth 밖). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 66회차 세션 HEAD `6f8261a`)**: `git log 6f8261a..HEAD` **93커밋** — item_units/배송비-박스청구/급여 엑셀입력·오버라이드/4대보험 기간축/kakao 알림톡/CAPS 매핑화면/합배송 entity필터는 이번 순환 Area1~5가 이미 각자 렌즈로 서술 정독(로그 확인). 그 외 다수(단가 회전규격 매칭·uom 관리단위 혼입 5곳·출고취소 청구시각 미정리·출력과다 행별누계·표 열잘림 감시·JWT atob·Enter submit·간이세액표 교체·IA 5건[돔보/펀칭/클리핑패스/굽기폴더/전사패널])는 어느 Area 로그에도 해시·키워드로 안 뜸(#600 "나열≠Read" 후보) → **직접 표본 검증**: 각 커밋 메시지 자체가 원인·백테스트/prod실측·게이트 신설을 포함한 자기완결 postmortem이고(`test:ship-billing`·`price-match-audit.py` 19,490건 백테스트·`test:income-tax`·`audit:jwt-decode`·`table-clip-baseline` 등 기존 게이트 체인에 실제로 편입됨, CLAUDE.md 본문에 다수가 이미 정본 서술로 흡수), 코드 diff 직접 대조 결과 entity 격리·인젝션·N+1 새 클래스 0건. IA 5건은 62회차 비웹앱축 룰 대상 — 전부 issue-only 축이나 CLAUDE.md에 이미 원인·수정·게이트 상세 기록, `audit:jsx-ternary`(0건)·`cut:bleed`(13/13)·`cut:placement`(38/38)·`cut:butt`(53건)·`cut:shellsync`(30/30) 전부 통과 확인.
> - **비웹앱 축 standing scan(62회차 룰)**: `git log 6f8261a..HEAD -- LogWatcher IllustratorAutomat caps-worker workers queue` = IA 12커밋(전부 위에서 검증), LogWatcher/caps-worker/workers/queue 변경 0건.
> - **panel:smoke·cut:smoke 미실행**: 이 세션(원격 컨테이너)의 Playwright 헤드리스셸이 `chromium_headless_shell-1194`인데 스크립트 요구 버전은 `-1217` — 버전 불일치로 실행 불가(환경 제약, 코드 결함 아님). `cut:e2e`는 Windows 전용이라 정상 skip. 다음 로컬(Windows) 세션에서 확인 필요.
> - **done-sync 절대값 재동기화**(리터럴 쿼리): `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **571**(+2, #651·#652) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **4**(#650·#626·#617·#616, 변동없음).
> - **open≠unfixed 재확인**: #650 — `items.ts:226-235 GET /:id? with_stock=1`의 `last` 서브쿼리(order_items JOIN orders)에 여전히 entity 필터 없음(코드 직접 대조) = 정상 open. #626 — owner 코멘트(09-10) "PII 키 분리는 결정 대기, 트래킹용으로 열어둠" 그대로 unchanged. #617·#616(LogWatcher) — owner 코멘트가 각각 "코드수정 완료(`28f2dc83`)했으나 실기(PC/장비) 배포·확인 전까지 열어둠"을 명시(64회차 FP룰 — 열어두는 이유를 owner가 직접 밝힌 경우 사이클수 집계 금지) = unchanged, 재이슈 불필요.
> - **standing scan**: `audit:migration-number`(신규 중복 없음, 같은테이블 충돌 0) · `sort-audit.cjs`(P1 0, P2 4건 기존 FP 유지) · `branch:clean`(삭제대상 0) · `npm audit --omit=dev`(0건) · `audit:skills`(OK) · `audit:empty-catch`(28파일·372곳 전부 사유 있음) · CI 최근 8런 전부 success(최종 HEAD `a8b6c20` 포함).
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클은 기존 원칙(#600 나열≠Read, 62회차 비웹앱축, 64회차 owner-대기 FP)의 재확인일 뿐 새 클래스 없음 — 다만 "커밋 메시지 자체가 백테스트/게이트 신설을 포함한 자기완결 postmortem이면 Area 로그에 해시가 없어도 실질 검증완료로 볼 수 있다"는 관찰은 기존 규칙(각 Area가 그 렌즈로 직접 diff 확인)의 적용 사례일 뿐 별도 서브클래스로 codify할 만큼 일반화되지 않아 보류.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 9건(임계 13건 미만), 트림 불요.
> - 신규 이슈 0건(93커밋 중 미언급분 표본 직접 검증 net-new 0, IA 5건 포함 전부 clean), 자동수정 0건(고칠 결함 없음), done-sync: open 4(변동없음)·done 571(+2)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-18T23:20):**
> - **방법**: 세션 시작 시 detached HEAD `2d0f08c`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. shallow clone이라 앵커(`1e50a2e`) 조회 시 `git fetch --unshallow` 필요(depth 밖). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 사이클 세션시작 HEAD `1e50a2e`)**: `git log 1e50a2e..HEAD` 93커밋, 보안범위(`src/routes`·`src/middleware`·`src/utils`·`index.tsx`·`wrangler.toml`·`.github/workflows`) diff **29파일**. Area4가 이번 순환에서 이미 데이터정합성 렌즈로 정독한 항목(holidays entity-scope·attendance entity 파생·급여 결근공제/야간시간·coating unify)은 skip, Area2/3/6가 정독한 항목(CAPS 매핑화면 UX/entity·perf N+1·notify SSOT·barobill 코드표·XSS bridge 표본)도 skip → **Area5 고유 미검토분** = 신규 알림톡 발송 기능 클러스터(`kakao.ts`+431·`kakaoIdentity.ts`+39·`shipmentNotice.ts`+135·`shipmentNoticeBody.ts`+72, `messages.js`+82·`payroll.js`+188 프론트)와 합배송 `#652`/`#653` 형제 커밋(`shipments.ts`)을 Area5 렌즈(entity 격리·IDOR·인증·인젝션·XSS)로 직접 정독.
> - **신규 알림톡 발송 기능(`POST /shipment-notice/preview`·`/send`, `GET /stats/monthly`) 직접 검증**: 라우터 전체가 `kakaoRouter.use('/*', authMiddleware, requireRole('ADMIN','MANAGER'))`로 게이트(`/send`의 inline `requireRole`은 중복이지만 무해). `loadNoticeTargets`가 `entityFilter(c,'o')`로 대상 주문을 자법인으로 제한, `/stats/monthly`도 `entityFilter(c)`(무별칭, `kakao_send_logs` 직접 대상 — 별칭 없는 테이블에 정확히 맞음)로 격리. `kakao_send_logs` INSERT에 `entity_id`(`r.row.entity_id || getEntityId(c) || 1`) 포함 확인. 본문 생성(`fillNoticeBody`/`buildSmsNoticeBody`/`loadItemSummary`)·`kakaoIdentity.resolveKakaoIdentity` 전부 파라미터 바인딩 SQL·순수 문자열치환이라 인젝션 경로 없음. 프론트(`messages.js` 월별비용표·`payroll.js` 이카운트대조표) 신규 innerHTML sink 전수 확인 — free-text(직원명·진단라벨·미매칭목록) 전부 `escapeHtml` 래핑, 숫자·채널라벨(하드코딩 맵)은 SAFE. 결함 0건.
> - **`shipments.ts` `#652`/`#653`(합배송 「함께 출고」) 재검증 — Area4 확인분 독립 재확인**: `POST /consolidation-pending`에 `entityFilter(c,'me')` 추가(호출자 지정 주문만 자법인)·파트너 `p`는 여전히 무필터(합배송은 client-scope cross-entity가 기존 FP클래스 — 목적상 정상), `requireAccessOrRole`에서 DESIGNER 제거도 확인. `#653` 후속(`shippable` 플래그)은 표시용 파생값(`callerEntity===0 || p.entity_id===callerEntity`)이라 새 IDOR 표면 없음. Area4가 이미 코드-diff로 확인했지만 Area5 자신이 `#652`를 신고한 이슈라 보안 렌즈로 독립 재확인 — 일치.
> - **필수 grep(Area5 #338)**: 시크릿 폴백 `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` = 0건(이번 churn 범위, 기존 `fax.ts` 빈문자열 폴백 무해 확인분 변동없음). 기본 비밀번호 패턴(`body.password || '...'`, CI `secrets.X || 'admin'`) = 0건.
> - **standing scan 1: `node scripts/check-xss.mjs`(2026-09-06 codify — 이번 사이클부터 편입)**: 117건 결과 대부분 기존 FP(에러메시지·enum라벨·숫자/치수·정의-지점escape 전파) — 이번 churn 관련 신규 sink는 위에서 직접 확인해 clean. 잔여 FP 재분류는 다음 사이클로 유보(advisory 성격, exit 1 게이트 아님).
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지.
> - **standing scan 4: `npm run audit:migration-number`** — 신규 중복 `0623`(`0623_coating_unify_watermedia.sql`·`0623_holidays_entity_scope.sql`) 포함 20쌍대, **같은 테이블 DDL 충돌 0건**.
> - **standing scan 5: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 6런 전부 `conclusion:success`(최종 HEAD `2d0f08c` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **4**(#650·#626·#617·#616, 변동없음). `#650`(items.ts `with_stock=1` 최근판매단가 entity 격리 누락) — 이번 churn이 같은 파일 다른 함수(`variant-bases`)만 건드려 재확인: `last` 쿼리 여전히 `orders` JOIN에 entity 필터 없음 → 정상 open(미수정). `#626`(레거시 평문비번·PII키 겸용) — owner 판단 대기 변동없음. `#617`·`#616`(LogWatcher) Area5 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **4**(변동없음) · done **569**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(이미 서술식 인용 병기, 잔여 없음). 이번 사이클 신규기능(알림톡 발송)이 기존 레시피(router-wide requireRole·entityFilter 무별칭 직접테이블·INSERT entity_id 스탬프·정의-지점 escape 전파)를 전부 준수해 신 결함·신 클래스 없음. `#652`/`#653` 재확인도 기존 "client-scope cross-entity" FP클래스의 적용일 뿐.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` 대상 — 사이클 로그 12건 → 이번 추가 후 13건, 임계(13건) 도달 → 트림 실행.
> - 신규 이슈 0건(알림톡 기능·합배송 형제커밋 직접 정독, net-new 0 — 전부 clean+기존 컨벤션 준수), 자동수정 0건(고칠 결함 없음), done-sync: open 4(변동없음)·done 569(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-18T21:45):**
> - **방법**: 세션 시작 시 detached HEAD `597144d`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. shallow clone(depth 50, 이번엔 앵커가 그 안이라 `git log 429792a..HEAD`는 즉시 됐으나 `73b8c0e..HEAD` 비교 등에서 `git fetch --unshallow` 필요). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 세션시작 HEAD `429792a`)**: 118커밋, `src/routes`+`src/utils`+`migrations` diff 55파일. 대부분(item_units·배송비-박스청구·급여 엑셀입력/오버라이드/이카운트 대조·kakao·CAPS·표 잘림 감시·IA 패널 5종)은 Area1·2·3·5·6가 이번 순환에서 이미 각자 렌즈로 정독 완료(백로그 로그 확인) → **직전 Area3 사이클(15:46) 세션 HEAD `73b8c0e` 이후 신규분만 재교차**(`git diff 73b8c0e..HEAD -- src/routes src/utils migrations` = 3파일: `orders/helpers.ts`·`shipments.ts`·`migrations/0623_coating_unify_watermedia.sql`) + **어느 Area 로그에도 해시/내용 미언급인 4개 커밋**(`76e2b382`·`3f3c2fdf`·`eefd23a7`·`7fc2e4b0` — grep으로 `item_units`류 8개 키워드 전수 대조해 미등장 확인)을 Area4가 직접 정독.
> - **🔍 cross-area 발견 — #651·#652 실제로 fix-in-tree, close 처리**: `c7b02c8c`(주문유형 dedup + 합배송 entity 필터)가 두 open 이슈의 제안 코드를 **그대로** 적용한 것을 `git diff 73b8c0e..HEAD`로 직접 확인. `orders/helpers.ts:deriveOrderType` — dedup 이전 `rawIds.length`로 자유입력 판정 후 `Set`은 IN절에만 사용(#651 제안 diff와 100% 일치). `shipments.ts:consolidation-pending` — `entityFilter(c,'me')` 추가 + `requireAccessOrRole`에서 DESIGNER 제거(#652 제안과 일치, 추가로 `shippable` 플래그까지 얹음 — #653 형제 커밋). 직전 Area3 사이클(9f54497f)이 "owner 코멘트는 있었지만 실제 미push"라고 정정했던 바로 그 항목이 **그 이후 커밋에서 실제로 push됨** → 코드 재확인 후 두 이슈에 근거(커밋 해시·diff 대조) 코멘트 남기고 **close**(completed).
> - **`76e2b382`(휴일 법인 축) 데이터정합성 직접 검증**: 마이그(`0623_holidays_entity_scope.sql`) — `CREATE holidays_v2(id PK, entity_id NOT NULL DEFAULT 0, UNIQUE(date,entity))` → `INSERT OR IGNORE ... SELECT` → `DROP`→`RENAME` 정석 재생성 패턴(#454 규칙과 일치), `holidays.id`를 참조하는 FK 0건(재생성 안전, `PRAGMA foreign_key_list` 확인). entity_id=0을 "전사"로 쓰는 설계는 NULL-UNIQUE 허점(SQLite가 UNIQUE에서 NULL을 서로 다른 값으로 취급) 회피가 목적이라고 주석에 명시, falsy 체크 금지 경고도 코드에 반영됨(`Math.max(0, Number(entity_id)||0)` 형태로 실수 0과 미지정 0을 같은 값으로 안전 처리). **읽는 쪽 5곳 전수 대조**(`payroll/core.ts`·`settings.ts`·`leaves.ts`·`attendance.ts`·`caps.ts`) — 커밋 메시지가 주장한 배선과 코드 diff 100% 일치. **DELETE 핸들러**(`settings.ts`)가 `WHERE holiday_date=? AND entity_id=?`로 법인 스코프 — 날짜만으로 지우면 타법인 휴무까지 삭제되는 실수를 코드가 이미 방지. 결함 0건.
> - **`eefd23a7`(근태 entity를 직원 소속으로) 데이터정합성 직접 검증 — 이 사이클의 핵심 대상**: `attendance.entity_id`가 "저장 시점 스냅샷"이라 직원 법인 이동 시 과거 근태가 옛 법인에 남아 화면에서 통째로 실종되던 결함의 수정. ① 마이그(`0625`) — `UPDATE attendance SET entity_id=(SELECT e.entity_id FROM employees e WHERE e.id=attendance.employee_id) WHERE EXISTS(... AND e.entity_id != attendance.entity_id)`로 기존 506건(선명4명268·오다플래그6명204·동산1명34) 백필, 멱등(재실행해도 이미 일치하는 행은 WHERE EXISTS가 걸러 no-op). ② **자기교정 여부 확인이 핵심** — `attendance.ts` 읽기 경로 2곳을 `entityFilter(c,'a')`(근태 행 자체의 스냅샷)에서 `entityFilter(c,'e')`(JOIN된 employees의 현재 소속)로 전환해, **앞으로 직원이 또 법인을 옮겨도 같은 증상이 재발하지 않는 파생 구조**로 바뀜(CLAUDE.md "파생으로 뺀다" 원칙과 합치 — 백필은 과거분 정리일 뿐, 재발 방지는 읽기 쪽 구조 변경이 담당). ③ **형제 완전성 sweep** — `attendance` 테이블을 읽는 전 지점(`hr.ts` 4곳·`payroll/core.ts` 1곳·`leaves.ts`)을 grep해 대조한 결과 **전부 이미 `entityFilter(c,'e')` 또는 명시적 `employee_id IN (...)` 목록 기반**이라 이번 버그(a.entity_id 스냅샷 의존)의 대상이 아니었음 확인 — 절반 마이그레이션 잔재(#436 클래스) 없음. ④ 급여 집계는 employee_id 목록으로 근태를 읽어 애초에 이 컬럼을 참조하지 않는다는 커밋 주장을 `payroll/core.ts:837` 직접 대조로 검증(정확). 결함 0건(오히려 재발 방지 설계까지 완비).
> - **`3f3c2fdf`(조기출근 미인정 옵션)·`7fc2e4b0`(엑셀 입력 3건)**: 둘 다 `ALTER TABLE ... ADD COLUMN`(NOT NULL DEFAULT 0 또는 nullable+DEFAULT 0) 단순 확장, FK·CHECK 없음, 기존 행 기본값 안전(§NOT NULL no-default 자동diff 스캔 대상 아님 — 전부 default 有). `0622`의 `employees.external_name`(이카운트 별칭 매칭용)·`payroll.night_hours/holiday_hours`(금액→시간 원본 전환, 기존 행 0 유지·재동기화 시 채워짐 명시) 전부 raw 컬럼 추가뿐 데이터 손상 경로 없음. 결함 0건.
> - **`2f22594c`(코팅 옵션 통일)**: `post_processing_options` UPDATE 2건(이름 변경 1 + `is_active=0` 비활성 1), `material_item_group`(자동차감 유일 키) 무변경 명시, prod 실측 과거 사용 0건 근거로 안전 주장 — UPDATE뿐이라 멱등, 되돌릴 방법(`is_active=1`)도 남김. 결함 0건.
> - **standing scan 1: `npm run audit:migration-number`** — 파일 642개, 중복 번호 25쌍(기존 20쌍+신규 `0621`·`0623` 2쌍), **같은 테이블 DDL 충돌 0건**.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(#651/#652 fix 커밋을 포함한 merge `1acb580d` 및 최종 HEAD `597144d` 포함).
> - **open 이슈 재확인(open≠unfixed) + close**: `list_issues(state:OPEN,label:auto-improve)` 세션 시작 시 6건 → **#651·#652를 코드 재검증 후 close**(completed, 근거 코멘트 첨부) → **4**(#650·#626·#617·#616, 전건 Area4 관할 밖).
> - **backlog↔GitHub 절대값 재동기화**: open **4**(-2, #651·#652 close) · done **569**(변동없음 — close는 completed 사유로 done에 이미 반영되는 시점 차, 다음 집계에서 +2 확정) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md 서술 참조 재확인(이미 서술식, `line N` 잔여 없음). 이번 사이클 핵심 사례(근태 entity 스냅샷 vs 파생)는 기존 원칙(§누적 캐시의 "파생으로 뺀다")의 재확인이라 새 클래스 아님. cross-area #651/#652 close는 기존 "open≠unfixed, 코드로 재검증" 원칙의 적용일 뿐 — 별도 codify 불요.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` 대상 — 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(churn 전수 재확인 net-new 0, 4개 미검토 커밋 전부 clean+자기설계 완비), 자동수정 0건(고칠 결함 없음), 이슈 close 2건(#651·#652, 코드 재검증 후 completed), done-sync: open 6→4(#651·#652 close)·done 569(다음 집계 +2 예정)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-18T15:46):**
> - **방법**: 세션 시작 시 detached HEAD `73b8c0e`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. shallow clone이라 `git fetch --unshallow` 필요(앵커가 depth 밖). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `1b74c7c`)**: 98커밋, `src/pages`+`src/scripts` diff 46커밋. 대부분(item_units·배송비-박스청구·급여 엑셀입력/이카운트 대조/4대보험 기간축·notify SSOT·CAPS 매핑 화면)은 Area1·2·4·5·6가 이미 각자 렌즈(entity·보안·계산정합성)로 정독 완료(로그 해시 대조 확인) → Area3 고유 렌즈(빈 상태·로딩·검색/필터·cross-page 링크)로 미검토였던 두 신규 화면을 직접 재점검.
> - **CAPS 사원 매핑 화면(`94850e9d`+3 후속 fix) Area3 렌즈 검토**: `capsSettings.js` 전 렌더 함수(미매핑/무시/매핑됨 3개 목록)가 빈 상태 토글(`empty.classList.toggle`)·escapeHtml·로딩 스피너(동기화 버튼)를 전부 갖춤. cross-site 잡음(DJ/SM 공유 릴레이 DB)은 주석으로 설계 사유 명시. 배정/무시/무시해제/매핑해제 4개 액션 함수 전부 존재(반쪽 CRUD 없음). 당일 4연속 fix 커밋(a6745ecb·1e789451·8e9e80ed)이 이미 드롭다운 공백·타법인 매핑·무시목록 미갱신을 잡아 현재 상태는 clean. 결함 0건.
> - **출고 「확정 대기」 섹션(`a130c8dd`) Area3 렌즈 검토**: `loadPendingConfirm()` 빈 목록이면 카드 자체를 숨김(별도 빈 상태 문구 불요 — 카드 존재 자체가 "대기 있음" 신호라 숨김이 맞는 설계), 로드 실패 시도 카드 숨김으로 graceful degrade, 합포장 배지·알림 가능여부 배지·박스수 입력 전부 반영. 「알림」·「확정」 버튼을 의도적으로 분리(주석: 합치면 실수 발송, 발송은 되돌릴 수 없음) — UX 설계 근거 명확. 결함 0건.
> - **🔍 cross-area 발견 — Area5 #652 "수정 완료" 코멘트가 실제로는 push 안 됨(live IDOR 잔존)**: CAPS·shipping 신규 코드를 보던 중 `shipments.ts:288 POST /consolidation-pending`을 재확인하게 됐고, owner가 #652에 "`entityFilter(c,'me')`를 붙였다, 게이트 통과"라고 코멘트했는데 **현재 `origin/main`(`73b8c0e`) 코드에 그 변경이 없음**을 발견 — `git log --all -S"entityFilter(c, 'me')"`가 main·feat/dept-pnl·claude/cloudflare-billing-limit-3t5up3 전 브랜치에서 **0건**. `requireAccessOrRole` 도 여전히 DESIGNER 포함(코멘트는 "제외"라 했음), SQL도 `me` 측 entityFilter 없음. **후속 #653이 "#652는 수정 완료"를 전제로 쓰여 있어 이중으로 상태가 어긋난 상태** — 로컬 커밋이 push 안 됐거나 다른 세션 작업트리의 변경이 유실된 것으로 추정. Area3 소관 밖(Area5 IDOR 클래스, 자동수정 금지)이라 직접 수정은 안 하고 **#652에 근거(커밋 해시·grep 결과)를 첨부한 정정 코멘트만 게시**, 사용자에게 별도 알림. 다음 Area5 사이클 또는 owner 재확인 필요.
> - **standing scan 1: showConfirm 콜백 오용(#426 클래스)** — 오용 패턴 **0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **CI 헬스**: 최근 배포 전부 성공(현재 HEAD `73b8c0e` 포함, 세션 시작 전 최근 배포 기록 PROJECT_STATUS.md 기준).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(-2, #647·#648 close 반영) — #652(재확인 결과 실제 미수정, 코멘트로 정정)·#651·#650·#626·#617·#616, 전건 Area3 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(8→6) · done **569**(567→569, +2) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클 핵심 교훈(owner "수정 완료" 코멘트도 검증 없이 신뢰하면 안 된다)은 Area3 고유 클래스가 아니라 기존 "open≠unfixed" 원칙의 확장이라 별도 codify 불요 — 각 Area가 매 사이클 하는 open 이슈 재확인에 "코멘트가 완료를 주장해도 코드로 재검증"을 암묵 포함.
> - **백로그 트림 체크**: 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(CAPS·확정대기 UX 렌즈 net-new 0, #652는 신규 발견이 아니라 기존 이슈의 상태 정정), 자동수정 0건(고칠 결함 없음, #652는 IDOR이라 애초 Area5 소관+자동수정 금지), done-sync: open 8→6(#647·#648 close)·done 567→569(+2)·rejected 6(변동없음). 다음 순번 **Area 4**.
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
| A-026 | stockShip.ts 자기모순 JSDoc 정정 — `restoreStockLinesOnUnship`의 함수설명이 "원장은 지우지 않는다, 환원도 IN행으로 남긴다"(구 문서)와 정반대로 실제 코드는 `DELETE FROM inventory_transactions`(OUT행 삭제, `idx_inventory_tx_unique_ref` UNIQUE 위반 회피). 커밋메시지·형제 함수(`findShipOutRow`) 주석과는 일치·코드도 정합이라 런타임 버그는 아니나, 이 문서를 신뢰해 "IN 보정행 추가"로 되돌리면 방금 고친 재출고 UNIQUE 위반 500이 재발하는 회귀 씨앗. Area 4 직접 발견. 주석 전용·동작 무변경(안전 자동수정). verify PASS(tsc clean+build) | 6da6a72 | 2026-08-31 |
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
