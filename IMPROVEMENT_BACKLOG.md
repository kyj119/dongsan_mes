# Improvement Backlog
<!-- last_run_area: 6 -->
<!-- last_run_at: 2026-09-23T21:45:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **9** (`list_issues(state:OPEN,label:auto-improve)` 실측, 변동없음 — #660 fixed-in-tree 코멘트 게시, close는 owner 대기) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **571** (변동없음) |
| ❌ rejected | **6** (변동없음) |

> **Area 6 자기 진화 (2026-09-23T21:45):**
> - **방법**: 세션 시작 시 detached HEAD `c978be4`(origin/main과 동일) → 로컬 `main` stale → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 사이클 결과 커밋 `6a17e86`)**: `git log 6a17e86..HEAD` **50커밋** — 이번 순환(Area6→1→2→3→4→5) 자신들의 북키핑 6건 + **웹앱 스코프 16파일**(`src/routes`·`src/scripts`·`src/pages`·`src/layout`·`src/utils`·`migrations`) + **비-웹앱 축 17커밋**(IA 전사(transfer) 호스트 구축 14 + LogWatcher 3).
> - **웹앱 스코프 16파일**: `feedback.ts`·`feedback.js`·`layout/feedback.js`·`printEvents.ts`·`productionReports.ts`·`productionReports.js`·`workbench.ts`·`finishingLabel.ts`·`printFileName.ts`·`menu.ts`·`topbar.ts`·`0626_feedback_reports.sql`은 Area1~5가 이번 순환에서 이미 파일명 단위로 전수 정독(#600 브리지 재확인: 어느 파일도 나열만 되고 Read 안 됨 없음). **나머지 3개(`0627_transfer_streetlight_pp_loop_grommet.sql`·`orderForm/finishing.js`·`shared/finishingLabel.js`)는 백로그 전체 grep(`0627`·`orderForm/finishing.js`·`shared/finishingLabel.js`) 결과 어느 Area 로그에도 등장 0회 — Area6가 직접 정독**.
> - **미정독 3개 직접 검증**: ① `0627` 마이그(가로등배너 하도매 상단/측면 개수 전환·끈고리 PP-LOOP 신설·봉제 프리셋 method_group 정정, 전부 `UPDATE`/`INSERT OR IGNORE` 멱등) — `.claude/PROJECT_STATUS.md` 배포 배너가 이 마이그를 "prod 적용" + "journey 40/40·local-e2e 4/4·smoke:prod 134/134·prod 마커(cm 토글·PP-LOOP·프리셋) 실측"으로 이미 검증 완료(#483 (b)-risk 클래스, 배포 세션 자신이 드리프트까지 확인) — net-new 없음. ② `orderForm/finishing.js`(`syncTransferSewCm` 신설) — DOM 값(`classList.toggle`·`.value`) 조작만, innerHTML 보간·free-text 렌더 없음 = XSS 표면 없음. ③ `shared/finishingLabel.js`(`formatGrommet`·`formatLoop` 신설) — **sibling-parity 대조**: 정본 `src/utils/finishingLabel.ts`의 동일 함수와 `git diff` 라인 단위 대조 결과 로직 **완전 일치**(숫자 파싱·enum 비교·문자열 조합 전부 동형, "정본과 동일" 주석이 사실과 부합) — 형제 비대칭 없음, net-new 0.
> - **비-웹앱 축 17커밋 — IA 전사 호스트 14 + LogWatcher 3**: IA 14건은 전부 자기완결 postmortem 커밋(원인 실측→최소재현→수정→게이트, CLAUDE.md §visibleBounds·§비활성문서읽기·§조용한격하에 이미 직접 반영됨 확인) — `audit:jsx-ternary`(15개 .jsx, 괄호없는 중첩삼항 0)·`audit:jsx-syntax`(32개 전부 파싱)·`audit:empty-catch`(30파일·395곳 전부 사유 있음) 3종 직접 재실행 clean. LogWatcher 3건(`ab08a1a`·`0711903`·`fa9cfb5`, 2026-09-22 커밋인데 이번이 첫 등장 — 「비-웹앱 런타임 축」 62회차 레시피의 정확한 재현)도 같은 형태(립 경로 자동교체 근거 실측·게이트 자기결함 2건 발견수정·규격결손 원인분석+폴백+셀프테스트)로, `make-kit.ps1` 배선 주장(`--selftest-pexp/-flexi/-transfer` 3종)을 `grep`으로 직접 확인 — 존재함(`:38`). 셋 다 issue-only 축(dotnet/PowerShell 실행 수단 없음, 기존 원칙) — 코드 결함 없음.
> - **standing scan**: `npm run audit:migration-number`(같은 테이블 DDL 충돌 0, 변동없음) · `node scripts/sort-audit.cjs`(P1 0, P2 4건 기존 FP 유지) · `npm run branch:clean`(삭제대상 0, SKIP 1=main) · `npm audit --omit=dev`(0건) · `npm run audit:skills`(OK, 스킬 19개 상주비용 ~2,662자).
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 8런 전부 `conclusion:success`(최종 HEAD `c978be4`, run #2051).
> - **done-sync 절대값 재동기화(리터럴 쿼리)**: `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **571**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **9**(#660·#659·#658·#656·#654·#650·#626·#617·#616, 변동없음).
> - **open≠unfixed 재확인**: #660은 Area4가 이미 fixed-in-tree 코멘트 게시(close-pending 유지, 변동없음). #659·#658은 Area5가 이번 순환에서 직접 재확인해 "여전히 미픽스" 확정(코멘트 0건, 재검증 불요). #656·#654·#650·#626·#617·#616 — 각 담당 Area가 이번 순환 중 재확인 완료(로그 상단 참조), Area6 관점에서 추가 변동 없음.
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(이미 서술식, 잔여 없음). 이번 사이클은 기존 3개 레시피(#600 나열≠Read 브리지·「비-웹앱 런타임 축」 범위 브리지·open≠unfixed 거울)를 새 churn 클러스터(전사 후가공 3파일 + LogWatcher 3커밋)에 그대로 적용한 사례 — 새 클래스 없음. `0627` 마이그가 배포 세션 자신의 드리프트 검증으로 이미 닫혀 있었던 것은 「컬럼-diff bridge SELECT-detail 확장」(33회차) 레시피가 기대하는 "owner가 배포 배너에 검증 근거를 남기면 Area6 재검증 비용 절감"의 정확한 사례.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(50커밋 전수 브리지 검토 — 웹앱 16파일 중 13개 타 Area 기정독 확인 + 미정독 3개 직접 정독 clean, 비-웹앱 IA 14건+LogWatcher 3건 전부 자기완결 clean), 자동수정 0건(코드 결함 없음), done-sync: open 9(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-23T15:40):**
> - **방법**: 세션 시작 시 detached HEAD `76ff7de`(origin/main과 동일) → 로컬 `main` stale → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 사이클 세션시작 HEAD `d1b2ec8`)**: `git diff --stat d1b2ec8..HEAD -- src/routes src/middleware src/utils index.tsx wrangler.toml .github/workflows` **6파일**(`feedback.ts`·`printEvents.ts`·`productionReports.ts`·`workbench.ts`·`finishingLabel.ts`·`printFileName.ts`) — 직전 사이클들에 비해 이례적으로 작음(churn 대부분이 이번 순환에선 비-웹앱 IA 전사(transfer) 호스트 구축·`docs(status)` 배너라 Area5 스코프 밖).
> - **Area5 고유 렌즈로 6파일 직접 재검증**: `feedback.ts`는 Area2가 이미 #659(entity 격리 누락)로 등록 완료 — 재검증만(아래 open≠unfixed). `printEvents.ts`(`GET /`) 신규 `cards` IN절 조회는 기존 주석("출력 이벤트=장비 로그, 장비는 전 법인 공유 인프라 → 조회는 격리 안 함", 2026-08-11 설계 결정)과 같은 무격리 패턴을 그대로 따름 — 바인드 파라미터화(`?` 청크 80) 정상, 신규 격리 갭 아님. `workbench.ts`(`GET /intake-config`)는 기존 `orderVisibilityFilter(c,'o')`(ovf) 절이 이미 걸린 SELECT에 컬럼만 추가(품목코드·소분류·판매단위 등) — 필터 보존 확인, SQL 인젝션 없음(전부 바인드). `finishingLabel.ts`·`printFileName.ts`는 순수 문자열 포매팅 유틸(DB 접근·사용자 입력 렌더 없음) — 보안 표면 자체가 없음.
> - **🔁 open≠unfixed 거울 — #658·#659 재검증(둘 다 미해결 확정)**: `taxInvoices/issue.ts` 직접 재확인 — 단건 발행(`:415` `WHERE o.id = ?`, entity 필터 없음)·묶음 발행(`:341` `WHERE o.id IN (...)`, entity 필터 없음) 둘 다 지난 사이클(#658, 09-21) 발견 그대로 잔존. `feedback.ts` 직접 재확인 — 상세(`:115`)·첨부다운로드(`:257`)·처리(`:233`) 3곳 전부 여전히 `isManager` role-only 검사(entity_id 대조 없음), #659(Area2, 09-22) 발견 그대로 잔존. 둘 다 owner 코멘트·PR·fix 커밋 없음(GitHub 직접 조회) — **진짜 미해결**, 재보고 불필요(이미 open).
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건(빈 문자열 폴백, 기존 FP, 변동없음).
> - **standing scan 2: `node scripts/check-xss.mjs`**(advisory) — 107건(직전 106, churn이 `src/scripts`를 건드리지 않아 배경값과 무관한 변동). 이번 churn과 겹치는 프론트 파일 없음(전부 `src/routes`·`src/utils` 백엔드), 재확인 불요.
> - **standing scan 3: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 75건·누락 **0건**(변동없음). #658/#659는 파라미터 바인딩값(entity 조건 부재)이라 이 정적 컬럼감사 범위 밖 — 통과와 두 발견은 모순 아님(기존 인지 사항 재확인).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지.
> - **standing scan 5: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 6: `npm audit --omit=dev`** — 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 10런 전부 `conclusion:success`(최종 HEAD `76ff7de`, run #2050). ⚠️`branch:"main"` 필터를 준 첫 호출이 5런 전(run #2033, 09-21)에서 멈춘 결과를 반환해 "CI가 이틀간 안 돌았다"로 오독할 뻔함 — 필터 없이 재호출하니 run #2050까지 정상 확인, 프록시/캐시 아티팩트로 판단(레포 문제 아님, 재보고 불필요).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **9**건(#660·#659·#658·#656·#654·#650·#626·#617·#616) — #660·#650은 owner 코드로 fixed-in-tree 확정 상태(직전 사이클들이 코멘트 게시, close는 owner 대기) 유지, 나머지 전건 상태 불변.
> - **backlog↔GitHub 절대값 재동기화**: open **9**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클은 기존 레시피("문서화된 무격리 설계 결정 — 장비 로그는 전 법인 공유 인프라", "IDOR 재검증은 closed 우산 이슈뿐 아니라 open 상태도 매 사이클 대조")를 그대로 적용한 사례 — 새 클래스 없음. CI 조회 캐시 아티팩트는 Area5 고유 교훈이 아니라 조회 습관(필터 있는 호출이 의심스러우면 필터 없이 재확인) 메모로 충분, codify 불요.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(churn 6파일 전부 clean 또는 이미 등록된 발견의 재확인, #658·#659 둘 다 미해결 확정 재검증), 자동수정 0건(안전 자동수정 대상 없음 — IDOR류는 issue-only 컨벤션), done-sync: open 9(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-23T00:20):**
> - **방법**: 세션 시작 시 detached HEAD `4cd6542`(origin/main과 동일) → 로컬 `main` stale(`e04c7a9`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 세션시작 HEAD `27787e8`)**: `git log 27787e8..HEAD` 21커밋 — 이번 순환(Area4→5→6→1→2→3) 자신들의 북키핑 6건 + IA 전사(transfer) 호스트 신설 6커밋(비-웹앱 축, Area6가 이미 정독) + 문제 접수함(feedback, 0626) 신설·후속 4커밋(Area1/2/3가 이미 정독) + **Area4 스코프(`src/routes`·`src/utils`·`migrations`·`index.tsx`) diff 15파일**.
> - **15파일 분류** — `migrations/0626_feedback_reports.sql`·`feedback.ts`(Area1 migration-drift·Area2 entity 렌즈 기정독)·`productionReports.ts`(undefined 렌더 버그 수정, Area1 기정독)는 제외. 나머지 **13파일이 `#657` 청크분할 커밋(`8bcad2f`, bind-limit 상한가드 오판정 수정) 신규분** — Area5(09-21T18:30)가 같은 클러스터를 entity 격리·바인드순서·batch원자성 렌즈로 이미 전수 리뷰했으나, **Area4 고유 렌즈(집계 정합성 — SUM/COUNT 누적이 청크 경계에서 이중계상·누락되는가)로는 아직 미검증** → 직접 전수 재검토.
> - **Area4 고유 렌즈로 13파일 직접 재검증**: (1) `taxInvoices/batch.ts` monthly-create — `grouped[client_id]` Record 누적이 청크(`clientIdChunks`, client_id 기준 비중첩 분할)를 가로질러도 안전(각 client_id는 정확히 한 청크에서만 나옴 → 이중계상 불가), `MONTHLY_MAX_GROUPS` 슬라이스 전에 `allGroups.sort(client_id)`로 청크 삽입순서 편향을 되살림(청크화가 "어느 30곳이 먼저 처리되는가"의 뜻을 바꾸지 않도록 커밋 자신이 보정) = 정합. (2) `taxInvoices/helpers.ts`·`issue.ts` — 전부 쓰기(UPDATE/batch) 청크로 집계·합산 없음, 개수대조(`orders.length!==orderIds.length`)는 누적 후 수행 = 정합. (3) `payroll/core.ts` 3곳 — `existsSet`/`empRowMap`(Set/Map, employee_id 유니크)·`targets` 배열 누적(employeeIds 청크가 비중첩) = 정합. (4) `inventory.ts` 저재고 — `SUM(inv.quantity)`가 `GROUP BY i.id` 이고 item_id 청크가 비중첩(각 품목은 한 청크에서만 집계) = 정합. (5) `costs.ts`·`prices.ts`·`purchaseOrders/core.ts`×2·`purchaseRequests.ts`·`quotations.ts`·`shipments.ts`(merge/unmerge) — 전부 단순 concat 또는 Map 키 대입, 집계연산 없음 = 정합. **결함 0건** — `#657` 커밋 메시지가 스스로 남긴 "batch는 원자성 위해 하나로 유지" 원칙이 코드에 그대로 지켜짐, 청크화가 만드는 집계 경계 문제(이번 사이클의 고유 관심사) net-new 없음.
> - **`clientSegment.ts sanitizeEntityIds` `.slice(0,50)` 재확인**: 신규 상한 절단이나, 주석이 근거(법인 prod 4곳)를 명시하고 침묵 절단이 아니라 방어적 상한(엔티티 축은 DB 행이라 고정 enum처럼 걸러지지 않음) — Area4 관점(암묵적 데이터 손실)에서도 근거 있는 트레이드오프로 판단, 이슈화 불요.
> - **🔁 open≠unfixed 거울 — #660 fixed-in-tree 확정, GH 코멘트 게시**: churn 중 owner 자신의 `c758c04`가 #660(feedback MANAGER 알림·진입경로 배선 누락, Area3 09-22 발견)을 직접 수정 — `feedback.ts:86 notifyRoles(['ADMIN','MANAGER'])`로 정정 + `menu.ts`에 `/feedback` 사이드바 항목(ADMIN·MANAGER) 신설. 코드 대조로 두 문제 모두 해소 확인, Issue #660에 fixed-in-tree 코멘트 게시(https://github.com/kyj119/dongsan_mes/issues/660#issuecomment-5787029883, close는 owner 판단). open 카운트는 9 유지(close 전이라 목록엔 그대로).
> - **나머지 8건**: `#659`·`#658`·`#656`·`#654`·`#650`·`#626`·`#617`·`#616` — 이번 churn 범위(15파일) 밖이라 상태 변동 근거 없음, 재확인 생략(직전 Area6 사이클이 #650 fixed-in-tree 확정한 것 외 변동 없음 재확인).
> - **standing scan 1: `npm run audit:migration-number`** — 파일수 643개·중복번호 25쌍(변동, 신규 0621·0623 편입이나 전부 무해), **같은 테이블 DDL 충돌 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 3: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main).
> - **standing scan 4: `npm audit --omit=dev`** — 0건(변동없음).
> - **prod 데이터 직접조회 불가 재확인**: 이 세션도 egress 차단(Cloudflare 자격증명 없음) — 고아 레코드·상태 불일치 등 실 데이터 기반 점검은 이번에도 불가(기존 제약 재확인, 신규 아님).
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런 전부 `conclusion:success`(최종 HEAD `4cd6542` 포함, run #2047).
> - **backlog↔GitHub 절대값 재동기화**: open **9**(변동없음, #660 close-pending) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md 잔여참조 재확인(이미 서술식). 이번 사이클(bind-limit 청크분할의 집계정합성 재검증)은 기존 원칙(직전 Area4 사이클의 청크-분할 집계정합성 렌즈)을 새 청크 클러스터(#657)에 그대로 적용한 사례 — 새 클래스 없음. Area5가 이미 entity/바인드 렌즈로 같은 커밋을 리뷰했어도 Area4의 집계정합성 렌즈는 겹치지 않는다는 것을 재확인(다른 Area의 리뷰 완료가 자기 렌즈 점검을 대체하지 않는다는 기존 원칙의 재적용).
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 9건 → 이번 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(13파일 전수 직접 검증, 청크분할 집계정합성·엔티티 세그먼트 상한 전부 clean), 자동수정 0건(고칠 결함 없음), done-sync: open 9(변동없음, #660 close-pending)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-22T22:40):**
> - **방법**: 세션 시작 시 이미 `main`(`e04c7a9`, origin/main과 동일) — detached HEAD 상태 아님, 별도 checkout 불요. `git fetch origin main` 재확인(diff 0). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 사이클 세션시작 HEAD `291d930`, 2026-09-19T13:10)**: `git log 291d930..HEAD` 41커밋, Area3 스코프(`src/pages`·`src/scripts`·`index.tsx`) diff **4커밋**(`59ddd34` kakao→shipments 알림 이관·`7e4be09` feedback 전역 신고 기능 신설(0626)·`f04d50d`+`ea93492` production-reports undefined/열폭 버그 수정). `59ddd34`는 Area4·6가 이미 자기 렌즈로 정독 완료(백로그 로그 확인), production-reports 2건은 owner 자신이 낸 버그수정 커밋이라 net-new 없음(재확인만).
> - **`7e4be09`(feedback 전역 신고 기능, 994줄 신설) — Area3 고유 렌즈로 직접 UX 정독**: `src/pages/feedback.ts`·`src/scripts/feedback.js`(관리 목록)·`src/scripts/layout/feedback.js`(전역 신고 모달) 3파일 전문 Read. 빈 상태("해당하는 신고가 없습니다")·로딩 표시("불러오는 중…")·검색(`fblSearch`+Enter키+조회버튼)·필터(상태·분류)·더블클릭 가드(`fbSubmitting`/`btn.disabled`)·에러 메시지(토스트+인라인)·상세모달 접근성(ESC 닫기) 전부 구현 — 기존 15·31회차 codify 항목(로딩표시 갭·중복제출) 기준으로 **결함 0건**, 오히려 이 영역이 스스로 찾아야 했을 패턴들을 코드가 이미 자체 구비.
> - **🆕 신규 발견 #660 — MANAGER 권한은 있는데 신규 신고 알림·진입 경로가 없음**: `migrations/0626_feedback_reports.sql:69-70`가 `role_page_permissions`에 ADMIN·MANAGER 둘 다 `/feedback` can_access·can_edit=1 부여(런타임도 일치 — `feedback.ts:176` `GET /`·`:277` `PATCH /:id` 둘 다 `requireRole('ADMIN','MANAGER')`)하는데, 신규 신고 알림(`feedback.ts:86-92` `notifyRoles(db,['ADMIN'],...)`)은 **ADMIN에게만** 간다. 이 기능은 설계상 사이드바/메뉴 진입점이 의도적으로 없다(`grep -rn "/feedback" src/layout src/scripts` 전수 확인 — 참조는 topbar 신고버튼과 feedback 자신 파일뿐, 알림 클릭(`/feedback?id=N`)이 유일한 진입 경로) — 그래서 MANAGER는 URL을 몰라 접근 자체가 원천 차단. 커밋 메시지가 직접 명시한 설계원칙("안 알리면 다음부터 신고를 안 한다 — 채택이 죽는 자리")이 **인입 쪽에도 그대로 적용되는 사례** — ADMIN(활성 3명, 커밋 메시지 실측) 부재 시 MANAGER가 대신 처리하라고 권한을 열어 놨는데 그 경로가 배선 누락으로 죽어 있음. 수정 = `notifyRoles` 역할배열에 `'MANAGER'` 추가 한 줄(XS), 신규 권한을 여는 게 아니라 기존 권한과 알림을 정합화. issue-only(누가 알림받는가=비즈니스 동작 변경).
> - **standing scan 1: showConfirm 콜백 오용(#426 클래스)** — `grep -rn "showConfirm(" src/scripts/feedback.js src/scripts/layout/feedback.js` 0건(해당 없음, feedback은 showConfirm 미사용).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음, `feedback_reports` 목록은 `status,id DESC`로 AUTOINCREMENT 단독 tie-break 이미 정합·마이그 주석에 명시). P2 4건 전부 기존 FP 유지.
> - **standing scan 3: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main).
> - **standing scan 4: 신규 axios 호출 dead-button 스캔** — `feedback.js`·`layout/feedback.js`의 axios 호출(`/api/feedback`·`/api/feedback/:id`·`/api/feedback/:id/attach`·`/api/feedback/:id/attachment/:i`·`/api/feedback/mine`) 전부 `src/routes/feedback.ts`에 실재(`index.tsx:320` 마운트 확인) — net-new 0.
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런 전부 `conclusion:success`(최종 HEAD `e04c7a9` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` 기존 8건(#659·#658·#656·#654·#650·#626·#617·#616) 전건 Area3 관할 밖 또는 상태 유지. 신규 #660 추가로 open **9**.
> - **backlog↔GitHub 절대값 재동기화**: open **9**(+1) · done **571**(변동없음, `search_issues reason:completed` 571 재확인) · rejected **6**(변동없음, `not planned` 4 + `duplicate` 2 재확인).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(이미 서술식, 잔여 없음). #660은 기존 "🚪 백엔드 먼저·화면 나중"(49회차 codify) 레시피의 변주 — 거기는 "API필드가 있는데 읽는 화면이 없다"였고 이번은 "권한·화면은 있는데 알림 배선이 없어 발견을 못 한다"라 **알림-권한 정합성**이라는 인접 축. 기존 레시피 서술에 흡수하기보다 향후 신규 알림 배선(`notifyRoles`) 도입 시 "이 역할 배열이 `role_page_permissions`가 그 페이지에 부여한 역할 집합과 일치하는가"를 대조하는 체크 한 줄을 area-3 파일에 추가할 가치가 있으나, 표본 1건(신규 기능 1개)뿐이라 이번 사이클엔 codify 보류 — 다음 신규 알림 배선 기능에서 같은 패턴이 재현되면 그때 정식 레시피화.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 8건 → 이번 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 **1건**(#660, feedback MANAGER 알림·진입경로 배선 누락), 자동수정 0건(알림 수신자 역할 변경=비즈니스 동작 변경, issue-only), done-sync: open 8→9(#660)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-22T21:45):**
> - **방법**: 세션 시작 시 detached HEAD `50c0760`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 사이클 세션시작 HEAD `f24297d`)**: `git log f24297d..HEAD` 35커밋, Area2 스코프(`src/routes`·`src/types`·`src/utils`·`migrations`·`index.tsx`) diff = **22파일**. 대부분(bind-limit 청크 클러스터·kakao→shipments 이관)은 Area1·3·4·5·6가 이번 순환에서 이미 각자 렌즈로 정독 완료 — Area2 고유 렌즈(entity_id·authMiddleware·N+1·SELECT 컬럼존재성)로 **아직 아무도 안 본 신규 파일**인 `feedback.ts`(326줄, 0626 신설)를 직접 정독.
> - **🆕 신규 발견 #659**: `feedback.ts` 목록(`GET /`)은 `actingEntity = getEntityId(c); if (actingEntity !== 0) where.push('f.entity_id = ?')`로 법인 격리를 정확히 적용하는데, **상세(`GET /:id`)·첨부다운로드(`GET /:id/attachment/:index`)·처리(`PATCH /:id`) 3곳은 entity_id 대조 없이 `isManager = role IN ('ADMIN','MANAGER')`만 검사** — 목록에서 안 보여도 id(AUTOINCREMENT 순차)를 직접 지정하면 타법인 MANAGER가 신고 상세(`client_info`·`last_error`·`context_ref`·`file_path`)를 열람·첨부 다운로드하고 PATCH로 임의 DONE 처리(+ 신고자에게 잘못된 처리완료 알림 발송)까지 가능. `npm run audit:entity`는 "SELECT에 entity_id 컬럼 누락" 정적패턴만 잡아 이 WHERE-조건 부재는 구조적 사각(실측: 133파일 검사·누락 0건 통과 — 감사 미탐지 직접 확인). 도달성 확인(`src/scripts/feedback.js:76,140,164` 3곳 모두 호출) — #334 dead-code 배제. `storage_zones`(#482)·`taxInvoices`(#658)·`items`(#650)에 이은 entity 격리 누락 클래스의 신규 사례, 다만 **WHERE절이 아니라 role-only 접근제어 분기**라는 변주(#658류 정적 SELECT 누락과 다름 — 탐지 레시피 확장 여지, 다음 SKILL 강화 항목 참고).
> - **standing scan 1: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 75건·누락 **0건**(변동없음, feedback_reports는 정적패턴 밖이라 #659 불검출 확인됨 — 위와 동일).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 3: authMiddleware recursive 스캔**(`find src/routes -name '*.ts'` 전수, subdir 포함) — 무-auth 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전부 기존 codify된 정당 클래스(barrel/helpers Map.get FP·hrSelf scoped-token·public webhook류, 변동없음) — `feedback.ts`는 `:15` `feedbackRouter.use('/*', authMiddleware)`로 전 엔드포인트 적용 확인, 갭 없음.
> - **standing scan 4: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 5: `npm audit --omit=dev`** — 0건(변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` 기존 7건(#658·#656·#654·#650·#626·#617·#616) 전건 Area2 관할 밖 또는 상태 유지. 신규 #659 추가로 open **8**.
> - **backlog↔GitHub 절대값 재동기화**: open **8**(+1) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: area-2-code-quality.md에 신규 레시피 codify 완료(이번 사이클 내) — "entity 격리 누락"이 지금까지 정적 SELECT/INSERT 컬럼 부재 위주였는데(#482·#658), #659는 **컬럼은 정상 SELECT되고 role-only 접근제어 분기(`isManager`)가 그 값을 안 씀**이라는 새 형태. 탐지 레시피(`grep -rnE "!== user\.id.*&&.*(isManager|isAdmin|role\s*===)"` + 형제 list엔드포인트 대조)를 area-2 파일에 추가.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 12건 → 이번 추가 후 13건, 임계(13건) 도달 → 트림 실행 예정.
> - 신규 이슈 **1건**(#659, feedback.ts entity 격리 누락 — role-only 접근제어가 타법인 신고 열람/첨부다운로드/처리 허용), 자동수정 0건(IDOR류 접근제어 변경=issue-only 컨벤션, #650/#658 선례), done-sync: open 8(+1)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-22T15:35):**
> - **방법**: 세션 시작 시 detached HEAD `d5a2d8f`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 사이클 세션시작 HEAD `ee5dc9d`)**: `git log ee5dc9d..HEAD` 35커밋 — 이번 순환(Area1→2→3→4→5→6) 자신들의 북키핑 6건 + Area2~6가 이미 각자 렌즈로 정독한 bind-limit 청크·kakao→shipments 이관·IA 전사 호스트 클러스터(Area6 09-22T09:51 로그가 전수 확인) + **Area6 종료 이후 신규 6커밋**(`ecd2c22`~`d5a2d8f`): 전역 「문제 신고」 기능(migration `0626_feedback_reports.sql` + `feedback.ts` 신규 라우터, 탑바 전역 버튼) + `production-reports` undefined 렌더 버그 2건 수정.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 5런 전부 `conclusion:success`(최종 HEAD `d5a2d8f`, run #2042). 최신 job(`106636351367`) 15단계 전부 success(typecheck·check:fn·jwt-decode·bind-limit·build·test:calc·entity-audit·migration-number·write canary·deploy·smoke), 총 소요 2분29초.
> - **smoke 결과**: `PASS 134/134`(job 로그 직접 확인, prod 대상). 느린 엔드포인트 3건 — `cashSchedule.overview` 4044ms·`orders.list` 1281ms·`hr.stats` 1246ms. `cashSchedule.overview`(4044÷421~424ms owner 실측 ≈ **9.5배**)는 기존 codify된 "9~14배 배수 유지 구간" 안 — 배수 이탈 증거 없어 재이슈 불요(owner 실측 판정 우선 원칙 유지).
> - **🔍 Area1 고유 렌즈로 신규 churn 직접 재검증 — 마이그레이션 적용 드리프트(#483 (b)-risk 클래스) 여부**: `migrations/0626_feedback_reports.sql`은 `CREATE TABLE IF NOT EXISTS feedback_reports`이고, 같은 커밋의 `feedback.ts`가 그 테이블에 INSERT/SELECT/UPDATE 10곳(`:70`·`:109`·`:149`·`:166`·`:201`·`:207`·`:224`·`:250`·`:284`·`:293`·`:312`)으로 즉시 의존 — `deploy.yml`은 코드만 자동배포하고 마이그는 prod에 자동적용 안 되므로(owner `db:migrate:prod` 수동) 전형적 (b)-risk: 미적용이면 전 사용자에게 노출된 **탑바 전역 버튼**(`topbar.ts:26 feedbackBtn`, 모든 로그인 사용자 대상)을 누르는 순간 `INSERT INTO feedback_reports`가 `no such table`로 500 — smoke는 `/api/feedback` 무프로브라 이 write-path를 구조적으로 못 봄(#430류 맹점). **직접 대조 결과 = 이미 해소됨**: `.claude/PROJECT_STATUS.md` 배포 배너(prod `7e4be09c`)가 이 기능을 "검증=프로브 19/19·여정 40/40·local-e2e 4/4·**드리프트 0**·smoke 133/133"으로 명시 — `드리프트 0`은 `npm run audit:migration-drift`(prod 실제 `sqlite_master` 대조, egress 있는 owner 세션에서 실행)가 0626 포함 전 마이그의 스키마 객체가 prod에 실재함을 확인했다는 뜻. **결론 = 신규 이슈 아님**(배포 세션 자신이 이 정확한 위험을 이미 검증). 이 재확인 자체는 Area1 고유 관할(#483 클래스)의 정상 재적용 — 새 클래스 아님.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 2: `npm run audit:migration-number`** — 같은 테이블 DDL 충돌 **0건**(변동없음, 기존 중복쌍만).
> - **standing scan 3: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main).
> - **standing scan 4: `npm audit --omit=dev`** — 0건(변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **7**(#658·#656·#654·#650·#626·#617·#616, 변동없음) — 전건 Area1 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **7**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(정규식 오탐 2건 = "baseline 2026" 뿐, 실제 교차참조 0건). 이번 사이클은 #483 (b)-risk 판정 레시피를 새 코드(feedback.ts+0626)에 그대로 적용한 사례 — 배포 세션이 이미 `audit:migration-drift`로 자체 검증까지 마친 것을 확인, 새 클래스 없음. 다만 "탑바 전역 버튼처럼 전 사용자 노출 신규 기능 + CREATE TABLE 마이그"의 조합은 리스크가 국지적 기능보다 크므로, 이 조합이 다음에도 나오면 PROJECT_STATUS.md 배너의 드리프트 검증 문구를 먼저 찾아보는 순서가 유효함을 실증.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(신규 churn 6커밋 전수 검토, feedback 기능의 마이그드리프트 리스크는 배포 세션 자체검증으로 이미 해소 확인), 자동수정 0건, done-sync: open 7(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-22T09:51):**
> - **방법**: 세션 시작 시 detached HEAD `f97cbac`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 사이클 결과 커밋 `ee5dc9d`)**: `git log ee5dc9d..HEAD` **28커밋** — 이번 순환(Area6→1→2→3→4→5) 자신들의 북키핑 6건 + 웹앱 스코프(`src/routes`·`src/scripts`·`src/services`·`src/utils`) **19파일**(bind-limit 청크 클러스터·#650/#655/#657 후속·kakao→shipments 알림 이관) + **비-웹앱 축(IllustratorAutomat) 6커밋**(전사=transfer 신규 호스트, `d1b2ec8`·`77f4b42`·`8d28944`·`9e99715`·`8ed9253`·`ae9ed18`).
> - **웹앱 스코프 19파일**: `search_issues`·본문 대조로 Area4(집계정합성, 09-21 14:20)와 Area5(entity/인젝션/인증, 09-21 18:30)가 이미 파일명+라인 단위로 전수 정독 완료(inventory.ts·items.ts·kakao.ts·orders/helpers.ts·payroll/core.ts·prices.ts·purchaseOrders/core.ts·purchaseRequests.ts·quotations.ts·shipments.ts·taxInvoices/{batch,helpers,issue}.ts·utils/chunk.ts·utils/inventoryAlert.ts·utils/shipmentNotice.ts·services/clientSegment.ts, `src/scripts/{orders,shipments}.js` 4줄은 59ddd34 알림 라우트 이관의 기계적 경로 갱신) — **#600 브리지 재확인: 어느 파일도 "나열만 되고 Read 안 됨" 없음**, Area6 재검토 대상 0.
> - **🌉 비-웹앱 축(「비-웹앙 런타임 축」, 62회차) — IA 6커밋 직접 정독**: 전부 신규 "전사"(transfer) 호스트(`mes-tr-host.jsx`) 구축 과정 — 좌우 자동분석·클립경계·PARM 오류·주석 자기폐쇄 구문오류·스텁 열거 누락 순으로 자기완결 postmortem(원인 실측+최소재현+수정+게이트). CLAUDE.md §visibleBounds 함정에 이미 정본으로 반영됨(2026-09-21 갱신 확인). **직접 검증**: `npm run audit:jsx-ternary`(15개 .jsx, 괄호 없는 중첩 삼항 0) · `audit:jsx-syntax`(30개, 전부 파싱) · `audit:empty-catch`(28파일·379곳 전부 사유 있음) 전부 통과. `mes-tr-host.jsx`에 `mesTr_inkBounds`(클립∩콘텐츠) 함수 존재 확인(`grep` 8회 호출부) — CLAUDE.md가 요구하는 "A0·재단·전사 3자 대조"를 `panel-smoke.mjs` §17e가 이미 구현(`mesTr_inkBounds`·`mesA0_itemBounds`·`mesCut_inkBounds` 3종 존재 + 각 draw 함수가 그 경계로 재는지 검사) — 새 호스트가 게이트를 스스로 갖추고 착륙한 사례, net-new 결함 0. `npm run audit:ia-jsx`·`panel:smoke`(Playwright 브라우저 미설치로 미실행)는 기존과 동일하게 이 환경에서 NAS/exe 접근 불가로 판정 제외(신규 제약 아님).
> - **table-clip 감사 도구 자기교정(`9617ee3`, 웹앱·비웹앱 어느 로그에도 미언급 확인 후 직접 정독)**: `--base` 미지정 시 기본 대상(localhost)이 prod 기준선을 조용히 덮어쓰던 버그를 `--force-base` 명시 가드로 차단(대상 불일치 시 exit 2, 측정 전 판정이라 시간 낭비 없음) + 실측 해소분 7건 반영(44→37). `scripts/table-clip-audit.cjs:159-163` 직접 확인 — 가드 존재. 자기완결 수정, net-new 이슈 없음.
> - **done-sync 절대값 재동기화(리터럴 쿼리)**: `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **571**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **7**(#658·#656·#654·#650·#626·#617·#616, 변동없음).
> - **🔁 open≠unfixed 거울 — #650 fixed-in-tree 확정, GH 코멘트 게시**: Area5(09-20)가 "여전히 entity 필터 없음, 정상 open"으로 남긴 뒤, 이번 churn의 `9c8c428`+`d1bcd5f`(#650 후속)가 실제로 고쳤다 — `items.ts:229-253` 직접 재확인: 재고합계(`efInv`)·최근판매단가(`efOrd`) **두 쿼리 모두** entity 필터 적용, `ROW_NUMBER() OVER (PARTITION BY item_id ...)`가 서브쿼리 **내부**(entity 필터 적용 후)에서 랭킹 — 형제완전성 충족. Issue #650에 fixed-in-tree 코멘트 게시(https://github.com/kyj119/dongsan_mes/issues/650#issuecomment-5769667391, 32회차 규칙: 재검증은 이 세션이, close는 owner). open 카운트는 7 유지(close 전이라 목록엔 그대로).
> - **나머지 6건 재확인**: `#658`(taxInvoices/issue.ts) — `issue.ts:344`(bulk `WHERE o.id IN (...)`)·`:415`(단건 `WHERE o.id = ?`) 둘 다 여전히 entity 필터 없음, 이번 churn(`8bcad2f`)은 이 파일의 bind-limit 청크만 건드림 = **정상 open, 미픽스**. `#656`(bulk-ship 알림 TOCTOU) — `orders.js:92 bulkShipSelected()`에 여전히 버튼 비활성 가드 없음(형제 `doNoticeSend`만 있음) = **정상 open**. `#654`(PATCH /:id/status 고아+billable_after) — 프론트 호출 0건 재확인(전수 grep) + SHIPPED 분기(`shipments.ts` PATCH `/:id/status` 논-취소 브랜치)는 여전히 `billable_after` 미설정(CANCELLED 분기만 최근 `clearShipBillingStmt` 추가됨, 반대 방향 짝) = **정상 open, 미픽스**. `#626`·`#617`·`#616` — owner 코멘트 재조회 결과 각각 09-10(PII 결정대기)·08-31×2(LogWatcher 실기 롤아웃 대기) 이후 변동 없음, 64회차 FP룰대로 재통지 불요.
> - **standing scan**: `npm run audit:migration-number`(파일수 증가분 신규 중복 재유입 없음, 같은테이블 DDL충돌 0) · `node scripts/sort-audit.cjs`(P1 0, P2 4건 기존 FP 유지) · `npm run branch:clean`(SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, 삭제대상 0) · `npm audit --omit=dev`(0건) · `npm run audit:skills`(OK, 스킬 19개 상주비용 ~2,662자).
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 8런 전부 `conclusion:success`(최종 HEAD `f97cbac` 포함, run #2036).
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클은 기존 4개 레시피(#600 브리지·비-웹앱 축 scan·open≠unfixed 거울·close-pending 코멘트)가 정확히 의도대로 작동 — IA "전사" 신규 호스트가 게이트(§17e)를 자체 구비하고 착륙, table-clip 감사 자기교정도 자기완결이라 새 클래스 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(28커밋 전수 브리지 검토, 웹앱 19파일 타 Area 기정독 확인 + 비웹앱 IA 6건 직접 정독 clean + table-clip 도구 수정 clean), 자동수정 0건(코드 결함 없음 — #650 GH 코멘트만), done-sync: open 7(변동없음, #650 close-pending)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-21T18:30):**
> - **방법**: 세션 시작 시 detached HEAD `d1b2ec8`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 사이클 세션시작 HEAD `0862373`)**: `git diff --stat 0862373..HEAD -- src/routes src/middleware src/utils index.tsx wrangler.toml .github/workflows` **20파일**. `aiAnalysis.ts`·`cards/queries.ts`·`inventory.ts`·`items.ts`·`kakao.ts`·`orders/helpers.ts`·`shipments.ts`·`utils/inventoryAlert.ts`·`utils/shipmentNotice.ts`(9파일)는 **바로 직전 Area4 사이클(같은 날 14:20)**이 집계정합성 렌즈로 이미 전수 정독 완료 — Area5는 그 판정을 재사용하지 않고 **entity 격리·인젝션·인증 렌즈로 별도 재확인**(아래).
> - **Area5 고유 렌즈로 20파일 전수 정독** — `audit:bind-limit`(258bbe7) 신설이 만든 IN절 청크 분할 커밋 다수(`costs.ts`·`payroll/core.ts`·`prices.ts`·`purchaseOrders/core.ts`·`purchaseRequests.ts`·`quotations.ts`·`taxInvoices/{batch,helpers,issue}.ts`·`utils/chunk.ts`·`.github/workflows/deploy.yml`)를 바인드 파라미터 순서·entityFilter 보존·batch 원자성 관점으로 직접 대조. 전부 `?` 바인드 유지, `taxInvoices/batch.ts`·`payroll/core.ts`·`purchaseOrders/core.ts` 등은 청크 루프 안에서도 기존 `entityFilter`/`ef.clause` 그대로 보존(정합), `taxInvoices/issue.ts:723`·`:733`·`helpers.ts:328` 등 원자적 쓰기(청구확정·계산서취소)는 "문장만 청크, `db.batch()`는 하나로" 원칙 그대로 지켜짐(#657 커밋 스스로 명시한 설계가 실제로 지켜졌는지 재확인 — 위반 0건).
> - **🆕 신규 발견 #658**: 위 전수 대조 중 `taxInvoices/issue.ts POST /`(레거시 단건·묶음 발행)가 `order_id`/`order_ids` 조회에 **entity 필터가 전혀 없음**을 발견 — 같은 라우터 형제(`batch.ts POST /batch-create`·`POST /monthly-create`, `queries.ts:392`)는 **closed 이슈 #581**("batch.ts entity 필터 전무 — 크로스엔티티 발행")의 수정으로 `entityFilter(c,'o')`를 명시 적용했는데, `issue.ts`의 레거시 발행 진입점만 그 형제픽스에서 빠졌다(SKILL.md "부분픽스 재검증" 클래스의 정확한 재현). entity-scoped MANAGER/edit-role 사용자가 타법인 `order_id`를 직접 지정하면 `createSplitInvoices()`가 그 주문의 **실제 소유 법인**(`order_billing_groups.entity_id`) 설정으로 계산서를 발행하고, `auto_issue:true`면 바로빌/국세청 실전송까지 진행 — 위조 세금계산서 발행급 HIGH. issue로만 등록(IDOR=자동수정 금지 컨벤션), 수정 방향은 batch.ts 패턴 이식(15~30분).
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(빈 문자열 폴백, 기존 FP, 변동없음).
> - **standing scan 2: `node scripts/check-xss.mjs`**(advisory) — 106건(직전 108, churn이 `src/scripts`를 건드리지 않아 이번 사이클과 무관한 배경값 — 감소는 이전 사이클 자동수정 누적분). 이번 churn(전부 `src/routes` 백엔드)과 겹치는 프론트 파일 없음, 재확인 불요.
> - **standing scan 3: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·누락 **0건**(변동없음). ⚠️#658은 정적 SELECT 컬럼감사가 아니라 **파라미터 바인딩값**(entity 조건 자체의 부재)이라 이 감사의 탐지범위 밖 — 감사 통과와 #658 발견이 모순 아님(감사는 "entity 테이블을 SELECT하는데 그 필드가 없다"류가 아니라 신뢰 못한 컬럼 존재성만 봄).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 5: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 6: `npm audit --omit=dev`** — 0건.
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런 전부 `conclusion:success`(최종 HEAD `d1b2ec8` 포함, run #2033).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` 기존 6건(#656·#654·#650·#626·#617·#616) 전건 Area5 관할 밖 또는 이미 알려진 상태 유지(#650은 Area5 자신이 이전 사이클에 등록한 항목, unchanged). 신규 #658 추가로 open **7**.
> - **backlog↔GitHub 절대값 재동기화**: open **7**(+1) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식). #658은 이미 codify된 클래스("부분픽스 재검증 — closed 우산 이슈의 서브모듈 픽스 실재를 재grep", area-5 L38 서술)의 정확한 재적용 — 새 클래스 아님. 다만 이번 실증은 그 레시피가 "같은 파일 내 형제"뿐 아니라 **같은 기능을 구현하는 다른 파일(different router file, 같은 라우터 마운트 경로 하위)** 간에도 유효함을 보여준다 — 기존 서술이 "같은 파일" 위주라 이 변주를 암묵 전제만 했었다.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 9건 → 이번 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 **1건**(#658, taxInvoices/issue.ts 크로스엔티티 세금계산서 위조발행 — #581 형제픽스 누락), 자동수정 0건(IDOR=issue-only 컨벤션), done-sync: open 7(+1)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-21T14:20):**
> - **방법**: 세션 시작 시 detached HEAD `27787e8`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 세션시작 HEAD `762a212`)**: `git log 762a212..HEAD` **22커밋** — 이번 순환(Area4→5→6→1→2→3) 자신들의 북키핑 6건 + **실제 애플리케이션 수정 16건**. Area4 스코프(`src/routes`·`src/utils`·`migrations`·`index.tsx`) diff = **9파일**(`aiAnalysis.ts`·`cards/queries.ts`·`inventory.ts`·`items.ts`·`kakao.ts`·`orders/helpers.ts`·`shipments.ts`·`utils/inventoryAlert.ts`·`utils/shipmentNotice.ts`), `migrations` diff = **0파일**(스키마 변경 없음, ground-truth 재구성 불요).
> - **churn 내용 분류**: 대부분이 `audit:bind-limit` 신설(258bbe7)과 그 감사가 잡은 실결함 청크수정(#650 후속·#655·deriveOrderType·cards/queries.ts·inventory.ts 2곳)이고, `kakao.ts→shipments.ts` 285줄 이관은 **Area3(이번 순환 직전 사이클)가 이미 자기 렌즈로 정독+검증 완료**(#656 등록). Area2/5도 이 클러스터의 entity 격리(#650)·bind-limit(#655/#651) 축을 각자 리뷰 완료 기록.
> - **Area4 고유 렌즈로 직접 재검증(다른 Area가 안 보는 각도)** — 청크 분할이 만드는 **집계 정합성**(고아·중복·부분집계 오류) 관점: (1) `items.ts` stock/last 두 쿼리 — 청크마다 독립 `GROUP BY`/`ROW_NUMBER()` 실행 후 Map에 축적, ids가 `rows.map(r=>r.id)`(품목 PK, 자연 unique)라 청크 간 중복·누락 불가 = 정합. (2) `cards/queries.ts` analysisCache — `Array.from(analysisIds)`(Set, 이미 dedup) 기반 청크 = 정합. (3) `inventory.ts` 입고/출고 두 곳 — 단순 SELECT 결과 concat, 집계 연산 없음 = 정합. (4) `orders/helpers.ts deriveOrderType` — COUNT/SUM 을 청크별로 구해 **합산**(`found +=`·`stockOnly +=`), `ids`가 `Array.from(new Set(rawIds))`로 사전 dedup되어 청크 간 겹침 자체가 없음 = 이중계상 불가, 정합. **결함 0건** — #655 커밋 메시지가 스스로 지적한 "청크 분할 시 dedup·순서보존 필요"라는 교훈이 나머지 4개 신규 청크 자리에도 전부 지켜져 있음(자체-교정 확인).
> - **kakao_send_logs.related_id(=shipments.id) dangling 후보 재확인** — 비-FK 참조 컬럼(#443/#454 클래스)이라 부모(shipments) 하드삭제(`orders/core.ts:712 DELETE FROM shipments WHERE order_id=?`) 시 정리 안 되면 고아. `git log -S"related_type = 'shipments'"` 로 도입 시점 확인 = `6cc92ae`(2026-09-18, 이번 churn 이전) — **이번 사이클 신규 아님**, 이관(`59ddd34`)은 참조 패턴 자체를 안 바꿈(파일만 이동) → churn-트리거 재스캔(#477 레시피) 대상 아님, 재보고 불필요.
> - **entity_id 바인딩 재확인**: `shipments.ts` 신규 `kakao_send_logs` INSERT의 `entity_id` 바인드가 `r.row.entity_id || getEntityId(c) || 1`(주문 자신의 entity_id 우선, 컨텍스트는 폴백) — bare `getEntityId(c)` 전체모드 0-sentinel 오기록(Area4 #487 축) 패턴 아님, 정상.
> - **standing scan 1: `npm run audit:migration-number`** — 파일수 불변(migrations diff 0), 같은 테이블 DDL 충돌 **0건**(변동없음, 기존 중복쌍만).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 3: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main).
> - **standing scan 4: `npm audit --omit=dev`** — 0건(변동없음).
> - **prod 데이터 직접조회 불가 재확인**: 이 세션도 egress 차단(Cloudflare 자격증명 없음) — 고아 레코드·상태 불일치 등 실 데이터 기반 점검은 이번에도 불가(기존 제약 재확인, 신규 아님).
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런 전부 `conclusion:success`(최종 HEAD `27787e8` 포함, run #2032).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#656·#654·#650·#626·#617·#616, 변동없음) — 전건 Area4 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md 잔여참조 재확인(이미 서술식). 이번 사이클(청크분할 집계정합성 재검증)은 기존 원칙(#454/#477 dangling 판별축·#487 entity 오기록축)을 새 코드에 그대로 적용한 사례 — 새 클래스 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 8건 → 이번 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(9파일 전수 직접 검증, 청크분할 집계정합성·dangling 참조·entity 바인딩 전부 clean), 자동수정 0건(고칠 결함 없음), done-sync: open 6(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-21T10:40):**
> - **방법**: 세션 시작 시 detached HEAD `9bbe9d5`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 사이클 결과 HEAD `762a212`)**: `git log 762a212..HEAD` 20커밋 — 이번 순환(Area3→4→5→6→1→2) 자신들의 북키핑 6건 + **실제 애플리케이션 수정 14건**(다른 5개 Area가 이미 각자 렌즈로 리뷰 완료: entity 격리 #650, D1 bind-limit #655/#651, kakao.ts→shipments.ts 배송알림 엔진 이관). `src/scripts` diff는 `orders.js`·`shipments.js` 각 4줄뿐(엔드포인트 경로 `/api/kakao/shipment-notice/*` → `/api/shipments/notice/*` 갱신) — **Area3 고유 렌즈로 신규 검토할 프론트 표면은 사실상 이 이관 하나**.
> - **엔드포인트 이관 무결성 직접 확인**: `grep -rn "kakao/shipment-notice" src/` = 0건(구경로 잔존 참조 없음), `src/index.tsx:315` `app.route('/api/shipments', shipmentsRouter)` 마운트 확인, `shipments.ts` 신경로 라우트 실재 확인 — dead-button 없음.
> - **신규 발견 #656(issue #656)**: 위 이관 대상 기능(배송 알림, 2026-09-18 신설)을 실제로 정독하다가 **기존 Area3 standing scan 클래스(#420류 TOCTOU + #369류 멱등 가드 부재)의 net-new 사례**를 확인 — `orders.js:92 bulkShipSelected()`(일괄출고 버튼)에 진행중 가드가 전혀 없는데(형제 `shipments.js:779 doNoticeSend()`는 `btn.disabled=true` 보유), 서버 `shipments.ts:533 POST /notice/send`가 "이미 보냈는지 읽기"(`kakao_send_logs` SUCCESS 유무)와 "보냈다고 기록하기"(batch INSERT, 맨 마지막) 사이에 **실제 바로빌 발송 호출**이 끼어 있어 원자적이지 않음 — 더블클릭 시 고객에게 알림 문자/알림톡이 중복 발송되고 발송당 과금도 두 배. `deductStockLinesOnShip`(재고차감)·`bulk-ship` 상태전이(CAS `WHERE status=?`)는 이미 멱등 가드가 있어 안전, **뚫리는 건 알림 발송 한 곳뿐**임을 코드 대조로 확인. 자동수정 대상 아님(버튼 disable/원자성 가드 = UI/UX·비즈니스 로직 변경, Area3 정책상 issue-only) → Issue로만 등록.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 2: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main).
> - **standing scan 3: `npm audit --omit=dev`** — 0건(변동없음).
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런 전부 `conclusion:success`(최종 HEAD `9bbe9d5` 포함, run #2030).
> - **open 이슈 재확인(open≠unfixed)**: 기존 5건(#654·#650·#626·#617·#616) 전건 Area3 관할 밖 — 상태 불변. 신규 #656 추가로 open **6**.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(+1) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 완료, 2026-09-19 정리분 유지). #656은 기존 codify된 두 클래스(15회차 더블클릭 standing scan · #420 TOCTOU 패턴)의 정확한 재적용 — 새 클래스 아님, 다만 "신규 기능(배송알림)이 나오면 그 기능 자체에 이 두 standing scan을 재적용한다"는 점을 실증.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 12건 → 이번 추가 후 13건, 임계(13건) 도달 → 트림 실행.
> - 신규 이슈 **1건**(#656, TOCTOU 더블발송), 자동수정 0건(UI가드/원자성은 정책상 issue-only), done-sync: open 6(+1)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-21T06:20):**
> - **방법**: 세션 시작 시 detached HEAD `f24297d`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 사이클 세션시작 HEAD `6a837c8`)**: `git log 6a837c8..HEAD` **6커밋** — 전부 이번 순환(Area2→3→4→5→6→1) 자신들의 북키핑 커밋뿐, `git diff --stat 6a837c8..HEAD -- src/routes src/types src/utils migrations index.tsx` = **0파일**. Area1·3·4·5·6가 이번 순환에서 각자 렌즈로 이미 "애플리케이션 코드 churn 0"을 확인했고, Area2 고유 스코프(entity_id INSERT·N+1·authMiddleware·타입불일치·SELECT 컬럼존재성)로도 동일 재확인 — 정독할 신규 코드 자체가 없음.
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·누락 **0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 3: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main).
> - **standing scan 4: `npm audit --omit=dev`** — 0건(변동없음).
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 5런 전부 `conclusion:success`(최종 HEAD `f24297d` 포함, run #2019).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **5**(#654·#650·#626·#617·#616, 변동없음). `#654`(Area2 자신이 32회차 전 세션에 등록한 고아 라우트+형제누락)는 reaction 0·comment 0·PR 0 — owner 미검토 상태 그대로, 라우트 삭제/로직변경은 SKILL.md 자동수정 금지 대상이라 재작업 불요.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 완료, 2026-09-19 정리분 유지). 이번 사이클은 6개 Area 전체가 이번 순환에서 관측한 "애플리케이션 코드 churn 0"을 Area2 렌즈로 재확인한 사례일 뿐 새 클래스 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(0-churn 재확인, CI healthy, 자동수정 대상 코드 없음), 자동수정 0건, done-sync: open 5(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-21T02:15):**
> - **방법**: 세션 시작 시 detached HEAD `ee5dc9d`(origin/main과 동일) → 로컬 `main` stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 사이클 세션시작 HEAD `9750e74`)**: `git log 9750e74..HEAD` 6커밋 — 전부 이번 순환(Area1→2→3→4→5→6) 자신들의 북키핑 커밋뿐, `git diff --stat 9750e74..HEAD -- src/routes src/utils index.tsx wrangler.toml .github/workflows scripts/smoke.cjs migrations` = **0파일**. Area4·5·6가 이미 각자 렌즈로 "이번 순환 전체 애플리케이션 코드 churn 0"을 확인했고, Area1 헬스범위로도 동일 재확인 — 신규 검토 대상 없음.
> - **CI 헬스**: `actions_list(deploy.yml, branch:main)` 최근 10런 전부 `conclusion:success`(최종 HEAD `ee5dc9d`, run #2018). 최신 job(`106080143015`) 전 15단계(typecheck·check:fn·jwt-decode·build·self-tests·entity audit·migration-number audit·write canary·deploy·smoke) 전부 success, 총 소요 2분36초.
> - **smoke 결과**: `PASS 133/133`(GitHub Actions job 로그 직접 확인, `smoke.cjs` prod 대상). 느린 엔드포인트 3건 — `cashSchedule.overview` 3650ms·`orders.detail` 1949ms·`hr.stats` 1289ms. `cashSchedule.overview`(3650÷421~424ms owner 실측 ≈ **8.6~8.7배**)는 기존 codify된 "9~14배 배수 유지 구간"에 근접·직전 측정치(4552ms)보다 오히려 개선 — 배수 자체가 깨진 증거 없어 재이슈 불요(owner 실측 판정 우선 원칙 유지). `orders.detail`·`hr.stats`는 상시 관측되던 무거운 엔드포인트로 신규 아님.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 2: `npm run audit:migration-number`** — 같은 테이블 DDL 충돌 **0건**(변동없음, 기존 중복쌍만).
> - **standing scan 3: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main).
> - **standing scan 4: `npm audit --omit=dev`** — 0건(변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **5**(#654·#650·#626·#617·#616, 변동없음) — 전건 Area1 관할 밖(Area2/5/6).
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(0건, 이미 서술식 완료). 이번 사이클은 기존 FP 클래스(CI green·smoke 배수 유지)를 그대로 적용한 사례일 뿐 새 클래스 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(0-churn 재확인, CI/smoke 전건 healthy), 자동수정 0건, done-sync: open 5(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
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
