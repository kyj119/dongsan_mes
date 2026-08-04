# Improvement Backlog
<!-- last_run_area: 4 -->
<!-- last_run_at: 2026-08-04T09:15:08+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **8** (#585·#586·#587·#589·#590·#591·#592·#593, GitHub OPEN 실측 — Area4 51회차, 변동 없음) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **511** (`reason:completed` 절대값 — Area4 51회차 재조회, 변동 없음) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 변동 없음) |

> **Area 4 데이터 정합성 (2026-08-04T09:15):**
> - **방법**: `git fetch origin main`(force-updated, HEAD `ec87745` = origin/main 일치) → `git checkout ec87745`(detached) → `npm ci`(node_modules 0→81). Area 4 **51회차** — 직전 Area4(`8da0c64`, 08-02T21:24, 50회차) 이후 `git log 8da0c64..HEAD -- src/routes migrations src/scripts`는 **0건**(21커밋 전량 IA cut-panel CEP 벡터 컷라인 플러그인 작업[`IllustratorAutomat/designer/**`+`docs/CUT_PANEL_USAGE.md`, CLAUDE.md 명시 IA 축2·독립 배포경로, 웹 SPA/DB 밖] + auto-improve 사이클 로그 4건뿐) — 데이터 정합성 렌즈로 diff할 신선 라우트/마이그/스크립트 churn이 **5사이클 연속** 전무.
> - **표준 게이트**: `npx tsc --noEmit` clean. `ls migrations | sed -E 's|.*/?([0-9]{4})_.*|\1|' | sort | uniq -d` → 기존 5쌍(0327·0412·0416·0420·0453)만 재확인, net-new 0.
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **8건**(#585·#586·#587·#589·#590·#591·#592·#593, 변동없음) — 이번 윈도(21커밋) 전부 `src/routes`/`migrations`/`src/scripts` 밖이라 Area4 관련 이슈(#589 consolidate_with_order_id·#592 간판BOM item_code 오참조·#593 order_item 7282 재분류 충돌)의 대상 파일(`orders/core.ts`·`migrations/0508~0512`) 자체가 이번 churn에 없음 → 직전 Area4 50회차가 직접 발견·재grep 완료한 verified-once 캐시 그대로 신뢰(line 296 원칙), 재검증 스킵. fixed-in-tree 0건.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(데이터/코드 churn 0, 마이그 번호중복 재확인 net-new 0), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 라우트/마이그 churn 자체가 없음), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **2026-07-29 백로그 소진 세션** (main `9686bf69`, deploy success): 11건을 심각도순으로 전건 처리.
> 사전에 **11건 전부 코드 대조**해 오탐 0건·실존 10건 + fixed-in-tree 1건(#580)임을 확인하고 착수했다
> ([[feedback-autoscan-false-positives]] 절차). 검증=tsc 0·build·check:dom 9(기준선)·entity 60/60·
> 로컬 스모크 104/104·**prod 스모크 104/104**·prod 번들 마커 13/13.
> **★브라우저 실클릭이 정적 검사가 통과시킨 실버그 1건을 추가 검출**(대기함 검색 결과를 클라 필터가
> 가리는데 빈 상태 문구는 "없습니다"라고 안내) → 별도 커밋. Phase 7b-2의 교훈이 그대로 재현됐다.
> ⚠️ **발송 계열은 실호출 미검증** — 테스트 호출이 곧 실발송이라 `/send-bulk`·`/ad/send`는 부르지 않고
> 모의 응답·단위 로직으로 대체([[design-ad-compliance-guard]] 함정). 소량 1건 자연검증 필요.

> **Area 3 UX/기능 감사 (2026-08-04T03:13):**
> - **방법**: `git fetch origin main`(HEAD `2a14e3f` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 3 **50회차** — 직전 Area3(`a3d8527`, 08-02T15:22, 49회차) 이후 `git log a3d8527..HEAD -- src/scripts src/pages src/layout index.tsx src/routes`는 **0건**(35커밋 전량 IA cut-panel CEP 플러그인 신규 구축[`IllustratorAutomat/designer/**`, CLAUDE.md 명시 IA 축2·독립 배포경로]·간판 BOM 데이터 마이그[0508~0512, Area2/4/6이 이미 컬럼정합성 검증]·오프라인 매입원장 이관 스크립트뿐) — 웹 UX 렌즈로 볼 신선 churn이 **4사이클 연속** 전무.
> - **open≠unfixed 재확인(대표 2건 직접 재grep, 캐시 아닌 실측)**: `orderForm/parent.js` `loadOrderForEdit()` 여전히 존재 + `grep -n line_discount|discount_reason|discount_by src/scripts/orderForm/parent.js` = 0매치(#590 잔존, load 경로 미복원 그대로) · `messagesAd.js:329 adLoadOptOuts()` 여전히 파라미터 없이 정의·호출(:29/:357/:368, #587 잔존) — fixed-in-tree 0건, 나머지 6건(#585·#586·#589·#591·#592·#593)은 해당 파일 churn 0이라 직전 사이클 verified-once 캐시 그대로 신뢰(line 296 원칙).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(#585·#586·#587·#589·#590·#591·#592·#593, 변동없음) · `reason:completed` **511**(변동없음) · rejected **6**(변동없음, not_planned 4+duplicate 2). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(프론트 코드 churn 0, open 이슈 대표 재확인 2건 모두 잔존), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 프론트 churn 자체가 없음), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-03T21:31):**
> - **방법**: `git fetch origin main`(HEAD `9f59a8a` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 2 **57회차** — 직전 Area2(`37d6242`, 08-02T09:14, 56회차) 이후 `git log 37d6242..HEAD -- src/routes src/scripts migrations index.tsx src/layout` 확인 → `src/routes`·`src/scripts`·`index.tsx`·`src/layout` 변경 **0건**, 유일 diff는 `migrations/0510~0512`(간판 BOM 대손충당 안분/작업지시서 역추적/신규승격 스윕 데이터 3파일, Area4 50회차·#592·#593이 이미 컬럼정합성 다룸) — 코드품질 렌즈로 diff할 신선 churn이 3사이클 연속 없음.
> - **표준 게이트**: `npx tsc --noEmit` 0 · `node scripts/entity-audit.mjs` = 검사 127파일·entity테이블 SELECT 60·통과 60·누락 0.
> - **authMiddleware recursive 재스캔**: `for f in $(find src/routes -name '*.ts')...` → 후보 7건 동일(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) — 직접 재확인: `orders/helpers.ts`·`payroll/shared.ts`·`taxInvoices/helpers.ts`는 `Map.get(` FP(라우트 아님), `cron.ts`는 `agentKeyMiddleware`(에이전트 트리거 경로, 정당), `publicUnsubscribe.ts`는 정보통신망법 §50⑧ 무인증 설계(토큰 128bit+rate-limit+마스킹, 코드 주석 명시), `hrSelf.ts`는 scoped-token(self-auth), `messagesAd.ts`는 barrel 서브라우터(`messages.ts:120` `messagesRouter.use('/*', authMiddleware, requireRole('ADMIN','MANAGER'))`가 부모에서 이미 적용 + 자체 `requireRole('ADMIN')` 추가 게이트) — 7건 전부 기존 FP 카탈로그와 일치, net-new 0.
> - **N+1 패턴 신규 스윕**: `for/forEach` 루프 내부 `await ...prepare(` 자동추출 63건 중 상위 10건(`aiAnalysis.ts`·`bank.ts`·`cardExpenses.ts`·`departments.ts`·`printEvents.ts`·`po-receive.ts`·`purchaseRequests.ts`·`users.ts`·`workbench.ts`) 직접 Read 확인 — 전부 기존 최적화 완료 패턴: 80청크 IN절(bank.ts), `LIMIT 3` 상한(workbench.ts), 루프불변 1회조회로 이미 리팩터됨(purchaseRequests.ts 주석 "루프 불변 1회 조회 → 매 품목 재조회 제거"), 파일 배열 개수만큼 불가피한 개별 INSERT(aiAnalysis.ts 배치생성, 데이터규모 아닌 업로드건수 bounded). 신규 N+1 없음 — 전 코드베이스가 2026-05~07 대규모 N+1 정리(I-018~I-040 등 backlog 하단 done 이력) 이후 안정화된 상태로 재확인.
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **8건**(#585·#586·#587·#589·#590·#591·#592·#593, 변동없음) — 이번 델타(BOM 마이그 3건)가 그 이슈 대상 파일을 전혀 안 건드려 재grep 없이 unchanged 캐시 신뢰(Area1 56회차가 직전에 직접 확인).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(코드 churn 0, N+1/authMiddleware 재스캔 net-new 0), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(코드 변경 없음, 검토 대상 자체가 데이터 마이그레이션 뿐), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-03T15:26):**
> - **방법**: `git fetch origin main`(HEAD `c21a63a` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). `SMOKE_URL=https://webapp-9i0.pages.dev npm run smoke` → 로그인 단계에서 `403 Host not in allowlist` — 프록시가 이번 세션도 prod 호스트 직접 접근 차단(기존 인지된 egress 제약 재확인, 변동 없음), GitHub Actions 기록으로 대체. Area 1 **56회차** — 직전 Area1(`9dee203`, 08-01T12:17, 55회차) 이후 `git log 9dee203..HEAD` = 36커밋이나 웹 렌즈 대상(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) 한정 diff는 **0건** — 전량 auto-improve 사이클 로그(Area2~6)·간판 BOM 데이터 마이그(0508~0512, Area2/4/6 기검증)·IA cut-panel CEP 플러그인 신규 구축(`IllustratorAutomat/designer/**`, 독립 배포경로)뿐. Area1은 헬스 확인이라 코드 diff 무관하게 CI 전수 확인 진행.
> - **deploy.yml 전수 확인**: `9dee203` 이후 발생한 런(2026-08-01T12:17Z~2026-08-03T00:18Z, `id 30699403113`~`30774189792`) 전부 `Deploy to Cloudflare Pages` 스텝까지 **success**(Typecheck/Build/Deploy 전 스텝) — 신규 failure 0건. 직전에 codify된 유일 failure(`e5ba1ad`, docs-only CF-internal transient, 즉시 다음 런 회복)는 이 윈도 이전 사건이라 재보고 아님.
> - **backup.yml 신선도**: 최신 run(`83faddd`, 2026-08-02T17:55:00Z) success — 직전(`9dee203`, 08-01T17:54:07Z) 대비 ~24h 간격으로 일일 스케줄 정상 유지. 07-28 `cancelled` 1건은 기존 인지된 "연속 트리거 supersede" 패턴(변동 없음).
> - **e2e.yml / verify.yml**: e2e.yml 최신 run은 여전히 2026-06-22(`disabled_manually` 상태 지속, 신규 실행 0 — 기존 인지 상태와 동일, 변동 없음). verify.yml은 열린 PR 0건(`list_pull_requests(state:open)` 직접 확인)이라 이번 사이클도 실행 대상 없음.
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **8건**(#585·#586·#587·#589·#590·#591·#592·#593, Area6 54회차 캐시와 일치) — 이번 윈도 웹 렌즈 코드 churn이 0이라 그 이슈들의 대상 파일(`messagesAd.ts`·`messages.ts`·`orders.js`/`orderForm/parent.js`·`orders/core.ts`·간판 BOM 마이그)을 전혀 안 건드림 → 직전 사이클(Area5 49회차·Area4 50회차)이 직접 재grep 완료한 verified-once 캐시 그대로 신뢰(line 296 원칙), 재검증 스킵. fixed-in-tree 0건.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 전부 기재값과 정확히 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 CI/헬스 확인 사이클(deploy·backup·e2e·verify 전부 기존 인지 상태와 동일, 웹 코드 churn 0), 신규 클래스 없음.
> - 신규 이슈 0건, 자동수정 0건(순수 CI/인프라 헬스 확인), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-03T09:16):**
> - **방법**: `git fetch origin main`(HEAD `92e97e6` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 6 **54회차** — 직전 Area5(`92e97e6`, 08-03T03:11, 49회차) 이후 `git log 92e97e6..HEAD` = **0커밋**(원격·로컬 완전 동기, 이번 사이클 사이 코드/데이터 변경 전무) → 컬럼-diff bridge·XSS bridge 둘 다 검토할 신선 churn 자체가 없음(브리지 스킵이 아니라 대상 부재, Area5 로그와 동일 사유).
> - **branch:clean(읽기전용)**: `npm run branch:clean` → SAFE-remote 0·SAFE-absorbed 1(`main` 대비 고유커밋 0)·REVIEW 0·SKIP 1(`main`) — 삭제대상 1건은 30건 미만 임계 미달이라 백로그 등록 불요, `--apply` 미실행(정책대로 읽기전용).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(#585·#586·#587·#589·#590·#591·#592·#593, 변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **open≠unfixed / close-pending 캐시 재확인**: 코드 churn 0이므로 8건 전부 직전 사이클(Area5 49회차·Area4 50회차)이 직접 재grep 완료한 verified-once 캐시 그대로 신뢰(파일 unchanged, line 296 원칙) — 재검증 스킵.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(코드/데이터 churn 0, 브랜치위생 임계 미달, 카운터 드리프트 0), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 churn 자체가 없음), done-sync: new 8(변동없음)·done 511(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 (2026-08-03T03:11):**
> - **방법**: `git fetch origin main`(HEAD `83faddd` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 5 **49회차** — 직전 Area5(`605cf54`, 08-01T15:15, 48회차) 이후 `git log 605cf54..HEAD`는 41커밋이나, 웹 렌즈 대상(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) 한정 diff는 **7커밋뿐**(간판 BOM P2/P3 `product_materials` 소요량+표준BOM+LED밀도보정, 계량비례 산정 확정, 작업지시서 역추적 신규프레임, 교체그룹 전수 신규승격 스윕, 동산 매입원장 5곳 적재 — 전부 순수 데이터 INSERT/UPDATE 마이그레이션). 나머지 34커밋은 IA cut-panel 벡터 컷라인 CEP 플러그인 신규 구축(`IllustratorAutomat/designer/**` — CLAUDE.md 명시 IA 축2, 독립 배포경로·웹 SPA 밖) + 세션문서/원장조사 docs뿐 — 보안(IDOR·XSS·인증·인젝션) 렌즈로 볼 신선 코드 경로가 사실상 전무.
> - **정적 SQL 마이그레이션 자체는 인젝션 표면 아님**: 0507~0512 전부 리터럴 값 INSERT/UPDATE(사용자 입력 경유 0), 파라미터 바인딩 대상 자체가 아니라 Area 5 검토 범위 밖(컬럼정합성은 Area2 56회차·Area4 50회차·Area6 54회차가 이미 clean 확인).
> - **필수 grep 2종(매 사이클)**: `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43 BAROBILL_FTP_PASSWORD || ''`(빈 문자열 폴백, 기존 FP) 1건 외 없음. `grep -rnE "password.*\|\| *'[^']+'" src` + CI yml `secrets\.[A-Z_]+ *\|\| *'` → 0건. net-new 하드코딩 시크릿/기본비밀번호 없음.
> - **형제-비대칭 IDOR·XSS 스캔**: 이번 델타에 `src/routes`·`src/scripts` 변경이 0건이라 신규 mutate 핸들러·innerHTML sink 자체가 없음 — 재검토 대상 없음(스캔 스킵이 아니라 대상 부재).
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **8건**(#585·#586·#587·#589·#590·#591·#592·#593) — 이번 델타 7커밋(전부 마이그레이션)이 그 이슈들의 대상 파일(`messagesAd.ts`·`messages.ts`·`orders.js`/`orderForm/parent.js`·`orders/core.ts`)을 전혀 안 건드려 재grep 없이 unchanged 캐시 신뢰(Area4 50회차가 직전에 직접 재grep 완료). #592·#593(간판 BOM 데이터 오참조)은 보안 라벨 아님(bug), 코드 취약점과 무관.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0.
> - **🧬 SKILL 강화 없음** — 순수 확인 사이클(웹 코드 churn 0, 데이터 마이그는 인젝션 표면 아님, 필수 grep net-new 0), 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 코드 churn 자체가 없음), done-sync: new 8(변동없음)·done 511·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-02T21:24):**
> - **방법**: `git fetch origin main`(HEAD `90373c1` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean(코드 변경 없어 예상대로 0). Area 4 **50회차** — 직전 Area4(`efe8b36`, 08-01T09:17, 49회차) 이후 `git log efe8b36..HEAD -- src/routes migrations src/scripts`는 **7커밋 전부 순수 데이터 마이그레이션**(0507 정운교역 깃발원단 19종+생지 3종·0508 간판 BOM P2 product_materials 소요량 컬럼+간판 8품목+표준BOM 24행·0509 P3 LED밀도 실측보정+단가0 자재+오분류 3라인 재분류·0510 바류 비례산정 확정(notes만)·0511 작업지시서 역추적 9라인+까치발 BOM 신설·0512 교체그룹 전수 신규승격 스윕 91라인). `src/routes`·`src/scripts` 코드 변경 0 — 데이터 마이그 자체의 참조 무결성 전수 검증으로 전환(과다위임 억제, 6개 파일 정독이 위임보다 빠름).
> - **🔴 net-new 발견: #592 간판 BOM(0508) 핵심 자재 3종 item_code 오참조 — SELECT 매치 0행으로 INSERT/UPDATE 전량 silent no-op** — `product_materials`를 `INSERT OR IGNORE ... SELECT p.id, m.id FROM items p, items m WHERE p.item_code=? AND m.item_code=?` 형태로 채우는 0508이 참조한 자재코드 `ALM-2T-WH-48`(백판)·`PC-1.8T-M-48`(광확산판)·`SGM-LED3-2835`(LED)가 **512개 마이그레이션 전수(node 스크립트 + 타겟 grep 교차검증)에 어디에도 정의되지 않음** — SELECT 조인 매치 0행이라 INSERT가 조용히 0행 삽입(존재X 컬럼 클래스의 "존재X 값" 변종, throw 없음). SIGN-CH·SIGN-PRT 두 플래그십 제품 BOM에서 가장 핵심적인 자재(LED·광확산판·백판)가 통째로 누락됐고, 0509가 성환농협 실측사진 기반으로 공들여 계산한 LED 밀도(62개/㎡) 보정 UPDATE도 대상 행이 없어 0행 갱신(실측 작업이 DB에 전혀 반영 안 됨). 근접 후보 카탈로그 존재 확인(`ALM-2T-S-48`=은색뿐·`PC-2T-M-48`=1.8T 자체가 카탈로그에 없음·`SGM-LED3-WH`=명명체계 다른 기존 LED) — 오타 정정 vs 신규 자재 등록 여부는 owner 판단 필요. product_materials 소비 코드가 아직 없어(Area6 54회차 확인) 라이브 버그는 아니나, 향후 원가계산 기능이 이 BOM을 소비하는 순간 조용히 불완전한 원가가 산출됨. issue-only(S).
> - **🔴 net-new 발견: #593 order_item 7282 — 마이그 0509↔0512 반대 방향 재분류 충돌** — 512개 마이그레이션 전수를 order_items 재분류 UPDATE의 id 집합으로 파싱·대조(node 스크립트, `WHERE id=`/`WHERE id IN (...)` + `item_id=(SELECT...)` 가드 패턴 추출) 결과 **id=7282 단 1건이 두 마이그에서 정반대로 재분류**됨: 0509가 규격 단위 오파싱(cm→mm 오독으로 판가/㎡ 100배 과대산정) 구체 증거(실제 16.9㎡·45k/㎡)로 `SIGN-FRL→SIGN-FRL-R`(신규→교체) 정정했으나, 후속 0512의 블랭킷 스윕 규칙("-R & 금액≥300,000 & 품명에 재단/천갈이/교체 없음 → 신규 승격")이 CSV 스냅샷 시점의 현재 분류·금액·품명만 보고 7282를 포함시켜 `SIGN-FRL-R→SIGN-FRL`로 재반전(0509의 근거 있는 정정이 조용히 원복, 마이그 순서상 0512가 최종 승자). 0509의 나머지 2건(5747·17291)은 0512 목록에 없어 무충돌 — 이 클래스는 7282 단건. 원가리포트(`gen_sign_cost_report.py`)가 이 분류로 BOM 세트(FRL=풀세트 vs FRL-R=원단만)를 갈라 계산하므로 실물 재확인 필요. issue-only(S).
> - **product_materials 컬럼-diff 재확인**: 0508 ADD COLUMN(`quantity`/`usage_type`/`usage_param`/`notes`) 전부 실재, `UNIQUE(product_item_id, material_item_id)` 제약이 INSERT OR IGNORE 멱등성과 정합(Area2 56회차 재확인과 합치). 0510(notes만 UPDATE, 데이터 무변경)·0511 까치발 BOM 신설(`ACC-029` 참조는 0429 비활성화→0434 DELETE→0471 재생성 체인으로 이 시점엔 실재 확인, 오탐 아님)·0512 SELECT 검증쿼리 전부 컬럼 존재성 clean.
> - **마이그 번호 중복 재확인**: `ls migrations | sed ... | sort | uniq -d` → 기존 5쌍(0327·0412·0416·0420·0453)만, 신규 0507~0512 전부 유일 번호. net-new 0.
> - **표준 스캔**: `npx tsc --noEmit` 0(코드 변경 없음, 예상대로). 라우트/스크립트 변경이 없어 entity-audit·sort-audit·branch:clean은 이번 델타 대상 없음(직전 Area2/Area1 회차 결과 신뢰).
> - **open≠unfixed 재확인**: `search_issues(is:open,label:auto-improve)` 실측 **6건**(#585·#586·#587·#589·#590·#591) — 이번 델타 7커밋이 그 이슈 대상 파일(`messagesAd.ts`·`messages.ts`·`orders.js`/`orderForm/parent.js`·`orders/core.ts`)을 전혀 안 건드려 재grep 없이 unchanged 캐시 신뢰(Area3 49회차가 직전에 직접 재grep 완료).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(#592·#593 신규 반영) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 이번 사이클의 두 발견은 기존 "존재X 컬럼" 클래스(line 148)의 **"존재X 참조값"** 변종(컬럼이 아니라 SELECT 조인의 lookup 값 자체가 없어 INSERT/UPDATE가 0행으로 조용히 no-op)과, "다중 재분류 마이그 간 대상 id 충돌"이라는 신규 축(빠르게 반복되는 소규모 데이터 정정 마이그레이션 시퀀스에서 후행 블랭킷 규칙이 선행 구체-증거 정정을 인지 없이 덮어씀) — 둘 다 이번 간판 BOM처럼 **하루 안에 5~6개 마이그가 연쇄 착륙하는 고속 반복 데이터 정비 세션**에서 발생 가능성이 높은 클래스로, 향후 유사 세션(자재/가격 대량 정비)마다 "SELECT 기반 INSERT의 lookup 값 존재성 전수 + 같은 대상행에 대한 재분류 UPDATE id 집합 교차중복" 2종 점검을 Area4 standing scan에 추가할 가치 있음(1회성 발견이라 이번엔 SKILL.md 파일 직접 수정은 보류, 다음 유사 사례 재현 시 codify).
> - 신규 이슈 2건(#592·#593), 자동수정 0건(데이터 정정 판단+egress 검증불가라 issue-only), done-sync: new 8(+2)·done 511·rejected 6. 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-02T15:22):**
> - **방법**: `git fetch origin main`(HEAD `a3d8527` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npm run build` 정상(6,277KB worker). Area 3 **49회차** — 직전 Area3(`e5ba1ad`, 07-31T18:10, 48회차) 이후 `git log e5ba1ad..HEAD -- src/scripts src/pages src/layout index.tsx src/routes`는 **0건**. 이번 델타 24커밋 전량이 (a) IA 디자이너 CEP `cut-panel` 플러그인 신규 구축(벡터 컷라인, `IllustratorAutomat/designer/**` + `docs/CUT_PANEL_USAGE.md` — CLAUDE.md 명시 IA 축 2/독립 배포 경로, 웹 SPA 밖) (b) 간판 BOM P1~P3(`product_materials` 데이터 정비, Area2 56회차/Area6 54회차가 이미 컬럼-diff clean 확인, 코드 소비처 0) (c) 동산 매입원장/사인자재 이관(`docs/dongsan-import/*.py`, 오프라인 스크립트) 뿐 — 웹 UX 렌즈로 볼 신선 churn이 전무.
> - **로컬 브라우저 실감사 시도 및 포기**: "가장 중요" 영역 원칙에 따라 실제 Playwright 조작을 시도 — `npm run build` 성공 후 로컬 D1 재현을 위해 `npx wrangler d1 migrations apply webapp-production --local` 실행, **`0344_aqueous_pat.sql`에서 `FOREIGN KEY constraint failed`로 중단**(빈 로컬 DB에 처음부터 500+ 마이그레이션을 순서대로 적용하면 중간 마이그가 실제 prod에만 존재하는 시드행을 전제해 실패 — 코드 결함 아닌 "로컬 처음부터 재현" 자체의 구조적 한계, prod 스냅샷 없이는 해결 불가). `dev:d1`류 스크립트도 PowerShell 전제(Windows 전용)라 이 Linux 세션에서 대체 경로(`wrangler pages dev dist --d1=... --local`) 자체는 가능했으나 마이그 실패로 선행 불가 → 이번 사이클은 정적 분석으로 대체(과거 정규 사이클 관행과 동일선상, 07-29 백로그 소진 세션 같은 별도 전수 브라우저 감사와는 성격이 다름을 명시).
> - **신선 standing scan 1 — 서버 cap+미사용 count 무음 검색누락(#497 클래스) 전수 재스캔**: `grep -rn "\.slice(0, *[0-9]\+)" src/routes` 150+ 매치 전수 분류 — **CSV export truncation류(`inspections.ts`·`po-queries.ts`·`po-receipts.ts`·`purchaseRequests.ts`·`cashSchedule.ts`)는 전부 `truncated` 플래그 + `CSV_TRUNCATION_NOTE` 푸터로 이미 방어**(#372 패턴, clean) — 기존 유일 confirmed 사이트는 `ar-ledger.ts:506`(#497, 이미 이슈화·open 아님 fixed 여부 미확인이나 별건) 뿐, **net-new 0**. `migration.ts`/`caps.ts`/`cards/queries.ts` 등 나머지는 관리자 전용 툴·샘플 필드로 검색 UX 무관.
> - **신선 standing scan 2 — `showConfirm` 콜백 오용(#426 클래스) 전수 재스캔**: `grep -rn "showConfirm(" src/scripts`에서 `await`/`.then()` 정상 패턴이 아닌 3건(`bank.js:800`·`iaEditor.js:2465`·`shipmentsDashboard.js:117`) 개별 확인 — `bank.js:800`은 `resolve(showConfirm(...))`(Promise 그대로 전달, 정상) · `iaEditor.js:2465`는 `.then(function(ok){ if(ok) ... })`(정상) · `shipmentsDashboard.js:117`은 `await` 직접(정상) — **net-new 콜백오용 0**.
> - **open≠unfixed 재확인(Area 3 관련 4건 직접 재grep, 캐시 아닌 실측)**: `messagesAd.ts:381-382` `success_count`/`fail_count`만(#585 잔존) · `messages.ts:246/261` `#adSubject`/`#adContent`에 `oninput` 부재(#586 잔존) · `messagesAd.js:329 adLoadOptOuts()`가 여전히 파라미터 없이 호출(#587 잔존) · `orderForm/parent.js:985-1146 loadOrderForEdit()`가 `calcItem(id)`(:1146) 호출 전까지 `line_discount`/`discount_reason`/`discount_by`/`amount` 어느 것도 복원 안 함(#590 잔존, `set()` 헬퍼가 width/height/unit_price/quantity 등만 채움) — fixed-in-tree 0건.
> - **🩹 백로그 자체 드리프트 발견·보충(문서 정합)**: `## 🆕 New` 표가 #591(Area 4 49회차 신규 등록)을 누락한 채 5행만 유지 중이었음(통계 카운터는 6으로 이미 정확했으나 표만 미갱신) — Area 4/6 원칙("open≠unfixed"·done-sync 정합)을 확장해 표에 #591 행 보충, "실측 5건" 안내문을 "실측 6건"으로 정정. 코드 변경 아닌 백로그 자체 북키핑 수정.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **6**(변동없음) · `reason:completed` **511**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 완전 일치, 드리프트 0(표 누락 1건 제외 — 위에서 보충).
> - **🧬 SKILL 강화 없음** — 이번 사이클은 순수 확인(신선 프론트 churn 0·두 standing scan net-new 0·open 재확인 unchanged) + 백로그 표 드리프트 1건 보정, 신규 코드화 패턴 없음.
> - 신규 이슈 0건, 자동수정 0건(검토 대상 코드 churn 자체가 없음), done-sync: new 6(변동없음)·done 511·rejected 6(변동없음). 다음 순번 **Area 4**.
>

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

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 8건** — #592·#593 신규, Area 4 50회차, 2026-08-02.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
| #585 | messagesAd.ts POST /send 실패 수신자 식별 불가 — #574 형제 라우트(messages.ts /send-bulk) 미반영 | Area 3 | bug,M | issue-only, 신규(#585) |
| #586 | 광고문자 제목/본문 수정 시 "대상 확인" 미리보기 게이트 미무효화 | Area 3 | bug,S | issue-only, 신규(#586) |
| #587 | 광고문자 수신거부 명단 — 서버 search 파라미터 미사용, 300건 상한 초과 시 과거건 조회 불가 | Area 3 | improvement,S | issue-only, 신규(#587) |
| #589 | 취소주문 2단계 하드삭제(a621cdd)가 처음 도달 가능해진 consolidate_with_order_id 정리 누락 — 자식 주문에 죽은 링크/유령 ID 잔존 | Area 2 | bug,S | issue-only, 신규(#589) |
| #590 | 주문 수정 재진입 시 기존 행 에누리(line_discount) 미복원 → 다음 저장에서 소멸 | Area 3 | bug,M | issue-only, 신규(#590) |
| #591 | 공군사관학교(id=3763) business_registration_number에 내부코드 '00017'이 실 BRN처럼 저장 — 세금계산서 발행 시 유효성 거부 위험 | Area 4 | bug,S | issue-only, 신규(#591) |
| #592 | 간판 BOM(0508) 핵심 자재 3종 item_code 오참조 — SELECT 매치 0행으로 INSERT/UPDATE 전량 silent no-op(LED·광확산판·백판 BOM 누락) | Area 4 | bug,S | issue-only, 신규(#592) |
| #593 | order_item 7282 — 마이그 0509(단위오파싱 정정)와 0512(전수 신규승격 스윕)가 반대 방향 재분류, 0509의 실측 근거 보정이 조용히 원복 | Area 4 | bug,S | issue-only, 신규(#593) |

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
