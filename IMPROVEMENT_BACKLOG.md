# Improvement Backlog
<!-- last_run_area: 2 -->
<!-- last_run_at: 2026-09-09T03:45:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **21** (`list_issues(state:OPEN,label:auto-improve)` 실측, 20→21 #640 신규) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **542** (`search_issues(reason:completed,label:auto-improve)` 실측, 변동없음) |
| ❌ rejected | **6** (`not_planned` 4 + `duplicate` 2, 실측, 변동없음) |

> **Area 2 코드 품질 심층 분석 (2026-09-09T03:45):**
> - **방법**: 세션 시작 시 detached HEAD `9bc875c`(origin/main과 동일)였으나 얕은 clone(50커밋) → `git checkout main`(4커밋 뒤처짐) + `git merge --ff-only origin/main`으로 정합 + `git fetch --unshallow`(2,840여 커밋 확보). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `0eb0c4d`)**: 웹앱 범위 diff **24커밋** — 대부분(af9606e0까지)은 Area1이 이미 이번 세션 안에서 응답시간/CI 렌즈로, Area5/6이 보안·자기진화 렌즈로 정독한 은행매칭·계정마스터·입고권한개방 웨이브와 동일 창. Area1이 이번 사이클 처음 본 신선 구간(`eecca71..9bc875c`, 3커밋)에 집중: `47ffce49`(은행매칭 잔여 13건 분류, 리터럴 UPDATE)·`18e22902`(feat: cashflow §6 베이스라인 + 마이너스통장 한도)·`9bc875c`(가격축 정정, migrations+audit script만).
> - **`18e22902` 전문 직독(신규 코드 있는 유일한 커밋, entity_id·N+1·authMiddleware·dead code·SELECT* 7클래스 점검)**:
>   - entity_id — `cashflowEngine.ts` §6 신규 4쿼리(AR/AP 런레이트·중앙일) 전부 `entityFilter(c)`/`entityFilter(c,'pp')` 정상 바인딩, `bankBalance.ts`·`bank.ts` PUT `/accounts/:id`도 기존 `ef.clause`/`ef.params` 패턴 유지 — net-new 갭 0.
>   - dead code — `baselineFlow.ts`(순수모듈 4export) 전부 `cashflowEngine.ts`가 import해 소비, `bank.ts`/`cashSchedule.ts`의 `credit_limit` 신규 필드도 응답에 다 실림 — dead export 0.
>   - authMiddleware — 신규 라우트 0(기존 엔드포인트에 필드만 추가) — 대상 없음.
>   - N+1/SELECT* — §6은 월단위 집계 SELECT 4개(GROUP BY, 루프 없음), `IN (${ph})` 동적 바인드 신규 0 — 해당 없음.
>   - 계산 규칙 게이트 — `test:baseline-flow`(25항목, 이 커밋이 자신을 `test:calc`에 편입, package.json 확인) 재실행 = **전항목 통과**. CLAUDE.md "계산 규칙은 값 대조 게이트로만 잡힌다" 원칙 준수 확인.
> - **🔴 신규 발견 → #640 — 마이너스통장 한도(`credit_limit`) 백엔드 계약 완성, 프론트 입력경로 0건("백엔드 먼저·화면 나중" 신규 사례)**: `bank.ts:406-449` `PUT /accounts/:id`가 `credit_limit`을 받아 저장하고, `cashSchedule.js:240-243`은 미입력 계좌가 있으면 "계좌 관리에서 입력"이라 안내하는데, `grep -n credit_limit src/scripts/bank.js` **0건** — 계좌 수정 모달(`editAccount()`/`saveAccount()`)에 그 필드 자체가 없어 `saveAccount()`가 서버로 보내는 `body`에 키가 없다. 서버는 `hasOwnProperty` 존재 여부로 갱신을 결정하므로(`bank.ts:445`) **UI 경로로는 영구 입력 불가** — 화면이 안내하는 조작 경로가 실재하지 않는다. 신규 기능(한도여력 표시) 전체가 이 때문에 항상 "미입력" 상태로만 남는다. UI 신규 필드 추가라 자동수정 금지 대상 → issue-only(#640, S).
> - **`47ffce49`·`9bc875c` 재확인**: `47ffce49`는 리터럴 UPDATE 13건 전부 `WHERE id IN (...) AND matched_category_id IS NULL AND EXISTS(...)`로 멱등·entity 범위 자체정합(서브쿼리가 `bank_transactions.entity_id`로 스코프) — 코드 변경 없음, 점검 대상 아님. `9bc875c`는 `migrations/0596`·`0599`(리터럴 데이터 정정)와 `scripts/unit-price-semantics-audit.cjs`(감사 스크립트, `db.prepare` 없는 판정 로직) — 라우트/유틸 코드 변경 0, Area2 스캔 대상 밖.
> - **standing scan 1: `npm run audit:entity`** — 검사 134파일·entity테이블 SELECT 74건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **20**(신규 등록 전) 기존 20건 전건 일치(#613·#616·#617·#622·#624~639) 확인 후 #640 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **21**(20→21, #640 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클은 기존 entity_id/dead-code/계산규칙 게이트 스캔이 정확히 의도대로 작동(net-new 갭 0, 유일한 신규 코드 커밋의 계산 규칙이 자체 게이트 보유+통과)한 실증. area-2-code-quality.md `line N` 잔여참조는 이미 서술식 각주(「컬럼-diff bridge」 등)만 존재 — 이번 사이클도 재확인 0건.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 **8→9건**(직전 Area1 사이클이 이미 트림 완료한 상태에서 이번 로그 추가분), 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#640 마이너스통장 한도 UI 입력경로 부재 — 신규 기능의 화면 안내가 가리키는 경로 자체가 없음, S), 자동수정 0건(entity_id/dead-code/N+1 net-new 갭 0, #640은 UI 신규필드라 issue-only), done-sync: open 20(20→21)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 6 자기 진화 (2026-09-08T16:10):**
> - **방법**: 세션 시작 시 detached HEAD `a1c943d`(origin/main과 동일)였으나 로컬 `main` 브랜치 ref는 `abc38eb`(2026-09-05, Claude co-author 체인)로 **50커밋 실분기**(단순 stale이 아니라 `main ^origin/main`이 실제 50건 반환) — 얕은 clone(50커밋)이라 처음엔 원인 판별 불가, `git fetch --unshallow`(2,836커밋 확보) 후 대조해 로컬 main이 이미 대체된 구버전 체인임을 확인 → 되돌릴 로컬 고유 작업 없음을 `git log main ^origin/main` 전건 검사(전부 Claude 커밋, origin에 없음)로 확인 후 `git reset --hard origin/main`으로 정합. `npm ci`(0→81), `npx tsc --noEmit` clean, `npm audit --omit=dev` 0건.
> - **churn 확인(앵커 = 직전 Area6 방법 라인 HEAD `1eb836a`, unshallow 후에야 유효 대상으로 확인됨)**: 웹앱 범위 diff **43커밋** — 대부분(af9606e0까지 32건)은 Area1~5가 이번 세션 안에서 이미 각자 렌즈로 정독(계정마스터 재정리·차입금분리·은행매칭·입고권한개방·바로빌 등, 이전 로그들과 동일 창). **Area5 종료(`af9606e0`, 10:40) 이후 신규 11커밋**(대출계정번호 매칭 룰화·차량자산 등록(선명 4대+동산 QM6/스포티지)·대출상환스케줄 만기까지 연장·인쇄이벤트 카드매칭 재작성·칸반/스케줄 폴링 가시성 게이팅·**청구서 단가표기 336라인 정정**)은 **어느 Area도 안 본 완전 신선 구간**.
> - **비-웹앱 축 churn(62회차 규칙) — `IllustratorAutomat/designer/poc-a0-cep/com.mes.a0.panel` 3커밋, 두 백로그 파일 어디에도 해시 언급 0건 확인 후 직접 정독**: `9886236f`(롤 소요량 다중판 합산 버그 수정 — `sheets[0]`만 읽던 걸 전체 합으로)·`fabb6c7a`(재단탭 클라이언트/품목 검색을 A0탭과 같은 부분일치 방식으로 교체, CEF datalist 접두어검색의 74% 미도달 실측 근거)·`196e0851`(안 쓰이는 자재 필드 제거, 하류 소비처 3곳 전부 서버 파생값 사용 확인한 근거 주석). `fabb6c7a`가 신설한 `attachSug()`(자동완성 드롭다운, `sug.innerHTML = html`)의 후보 렌더가 텍스트노드·`data-name` 속성 양쪽 `cutEsc()` 일관 적용(& < > " 이스케이프, 속성이 큰따옴표 델리미터라 홑따옴표 미이스케이프는 안전) 확인 — **net-new XSS 0**. `196e0851`의 필드 제거는 주석 자체가 "work order 라인·재고차감·소요량예측은 이미 서버측 product_materials 조인을 쓴다"는 근거를 명시, `grep -rn` 대조로 하류 참조 0 확인 — 완전 제거.
> - **신선 tail 11커밋 심층 검토**: ① **`a1c943d` 단가표기 정정(336/26,751라인)** — 전용 게이트 `test:unit-price-display`(29항목)를 이 커밋 자신이 신설하고 `test:calc`에 편입(package.json 확인) + 데이터 감사 `audit:unit-price-semantics`(baseline 불요, 자기교정 판정식) 동반 — CLAUDE.md "계산 규칙은 값 대조 게이트로만 잡힌다" 원칙을 스스로 실천한 사례. `npm run test:unit-price-display` 재실행 = **29항목 전체 통과**. ② **대출/차량자산 마이그레이션 웨이브(`0588`~`0596`, 9건, 대부분 리터럴 데이터 INSERT)** — `npm run db:bootstrap:ci`로 이번 사이클 신규 마이그 **30건 전체**(0575~0596) 재적용 = **전건 성공**(CHECK/FK 위반 0). ③ **CI 일시 실패 2건 자체수정 확인** — `8ded0cda`(차량자산 등록)·`e7335c61`(대출스케줄)이 `actions_list`에서 `conclusion:failure`(CI 부트스트랩의 빈 DB에 없는 loan FK 참조)로 떴으나 바로 다음 커밋(`2c20b546`·`9954d32f`, "guard ... the same way 0593 was"/"INSERT...SELECT...WHERE EXISTS")이 같은 세션 내에서 즉시 수정해 최종 HEAD(`a1c943d`, run 1800)는 **success** — 방치된 실패 없음, 자기수정 정상 작동.
> - **open≠unfixed 재확인(close-pending 캐시 + 거울 규칙)**: `cashSchedule.ts`는 이번 43커밋 churn에 **포함 0**(파일 불변, 32회차 캐시 규칙상 재검증 생략 가능하나 직접 재grep으로 재확인) → `getEntityId(c) || 1`이 여전히 397·558줄에 잔존, `POST /schedule/check-overdue`의 UPDATE/COUNT도 여전히 entity 절 없음 = **#631/#632/#635/#636 전부 정상 open(미픽스), 오탐 아님**. `orderForm/itemRow.js`는 이번 churn에 없었지만(단가표기 커밋은 `calc.js`/`parent.js`만 건드림) `width_${id}`/`height_${id}`의 `oninput`이 여전히 `calcItem(id)`만 호출 = **#634 정상 open(미픽스)**.
> - **standing scan 1: done-sync 절대값 재동기화(리터럴 쿼리)** — `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **542**(변동없음) · `reason:not_planned` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **20**(변동없음, #613·#616·#617·#622·#624~639 전건 일치).
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 4: `npm run audit:ia-jsx`** — 6개축 전부 "경로 접근 불가"(NAS 미연결, 변동없음) — 드리프트 없음 판정(판정 제외 축이라 참고용).
> - **standing scan 5: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런 중 6 success·2 failure(`8ded0cda`·`e7335c61`, 위 ③에서 자체수정 확인) — 최종 HEAD success.
> - **🧬 SKILL 강화**: 없음 — 이번 사이클의 로컬 main 50커밋 분기는 기존 「⚙️ git fetch-before-compare (Area 1/6)」 규칙(stale tracking ref → fetch 후 재판정) 범위 내의 심화형(얕은 clone이 앵커 자체를 못 가진 케이스)이라 별도 codify 불요 — 다만 매 사이클 "detached HEAD가 origin과 동일해도 로컬 main은 그렇지 않을 수 있다"는 이미 반복 실증된 패턴이 이번에 43→50커밋으로 최대치 갱신. area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(비웹앱 축 3커밋 net-new XSS 0·필드제거 완전, tail 11커밋 중 유일한 계산규칙 변경(단가표기)이 자체 게이트 보유+통과, 마이그 웨이브 30건 전체 CHECK/FK 클린, CI 일시실패 2건 즉시 자체수정, open 이슈 재검증분(#631/#632/#634/#635/#636) 전부 정상 미픽스), 자동수정 0건(고칠 결함 없음), done-sync: open 20(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 1 프로덕션 헬스 (2026-09-08T17:05):**
> - **방법**: 세션 시작 시 `main` HEAD `eecca71`(origin과 동일)이었으나 얕은 clone(50커밋)으로 시작 → `git fetch --unshallow`(2,838커밋 확보). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `1eb836a`)**: 웹앱 범위 diff **68커밋** — 대부분(af9606e0까지, 은행매칭·계정마스터·원가축)은 Area2~6이 이번 세션 이미 각자 렌즈로 정독. Area1 고유 렌즈(CI 헬스·응답시간·마이그 드리프트)로 이번 사이클 신규 churn에 집중.
> - **🔴 #636(cashSchedule.overview 응답시간 회귀) 3번째 측정 — 여전히 재현, 우연 아님 확인**: 최신 배포(`eecca716`, run 34200611207, 07:43) job 로그 직접 대조 = **3524ms**(예산 2000ms 대비 76% 초과). 직전 두 측정(3135ms→3589ms)과 합쳐 **3연속** 예산초과, 변동폭도 3135~3589ms 좁은 범위라 노이즈 아닌 안정적 회귀로 확정. 이번 사이클 `cashflowEngine.ts`에 `loans` JOIN 1건이 신규 추가됐으나 단일 조인이라 14배 증가폭의 주원인일 가능성 낮음(이슈 본문의 순차 await 체인 가설이 여전히 유력) — **신규 이슈 생성 대신 #636에 3차 실측 코멘트 등록**(중복 방지, 재무엔진 로직 변경이라 자동수정 대상 아님).
> - **신규 마이그레이션 22건(`0575`~`0596`) 스키마드리프트(#483/#484 (a)/(b) 분류) 관점 재확인**: `ADD COLUMN`류 3건(`offset_reason`·`expense_categories.role`·`loans.account_no`) 전부 최신 배포 smoke의 **detail 프로브 129/129 PASS**(500 없음)로 prod 적용 확인 — (b)-risk 실현 없음. Area4/6이 데이터정합성·자기진화 렌즈로 이미 전건 직독 완료(CHECK/FK 0건)라 재중복 검토 생략.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 중 8 success·2 failure(`8ded0cda`·`e7335c61`, 둘 다 CI 빈 DB 부트스트랩에서 없는 loan FK 참조로 실패했으나 바로 다음 커밋이 같은 세션 내 즉시 자체수정, Area6가 이미 확인한 것과 동일 건 — 재보고 아님). 최종 HEAD(`eecca716`, job 101978298840) 전 단계(typecheck·build·self-tests·entity audit·write canary·smoke 129/129) success.
> - **egress 확인**: 이 세션도 prod 직접 fetch 차단(`CONNECT tunnel failed 403`) — 배포 job 로그 대리검증 방식(Area1 codify) 재사용.
> - **standing scan 1: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 3: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **20**(변동없음, #613·#616·#617·#622·#624~639 전건 일치).
> - **backlog↔GitHub 절대값 재동기화**: open **20**(변동없음) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 기존 「CI 배포 job 로그 = query-cost 대리지표」·「(a)/(b) 마이그 드리프트」 패턴이 이번 사이클도 그대로 유효(신규 codify 불요). area-1-production-health.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 12건 → 이번 로그 추가 후 13건, **임계(13건) 도달** → `npm run backlog:trim` 실행(아래 처리).
> - 신규 이슈 0건(유일한 실질 발견인 #636 응답시간 회귀는 기존 이슈에 3차 실측 코멘트로 누적, 신규 마이그 22건 스키마드리프트 (b)-risk 미실현, CI 일시실패 2건 이미 자체수정 확인분), 자동수정 0건(고칠 결함 없음), done-sync: open 20(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 5 보안 + 인프라 (2026-09-08T10:40):**
> - **방법**: 세션 시작 시 detached HEAD `8c752b2`(origin/main과 동일 커밋이나 얕은 clone) → `git checkout main` → `git pull`이 divergent-history로 실패(50/52커밋 분기, shallow-clone 앵커 유실 함정) → `git fetch --unshallow` + `git merge --ff-only origin/main`으로 정합(변동 없음, 이미 최신). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm audit --omit=dev` 0건(변동없음, `npm ci` 직후 dev 포함 집계는 11건이나 이건 매 사이클 동일한 devDependency 사안=#613).
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `af61e7e`)**: 웹앱 범위 diff **30커밋** — Area1·2·3·4·6이 이번 세션 안에서 이미 각자 렌즈로 정독한 은행매칭 확장(잔여 제안 승격·카드정산 계정·계좌 잔액/경과일 표시)·cashflow(차입/상환 분리)·계정마스터 대정리(0576~0585)·원가축 보정·신규 매입후보 큐(`purchaseCandidates`)·입고 OPERATOR 권한개방(`0585`) 웨이브 + XSS 자체수정(`3bf7427`/`b16fafb`, 직전 Area5가 이미 커밋한 산출물). **보안 렌즈로는 이번이 최초 통과** — 특히 입고 권한개방 2단계(`8f55dd0e`·`573ea40c`)는 role 게이트를 실제로 낮춘 변경이라 최우선 직독.
> - **입고 OPERATOR 권한개방 2단계 코드 직접 대조 — 회귀 없음 확인**: ① `8f55dd0e`(POST `/:id/receive`)가 `canTouchZone`(실사 `loadOwnedCount`와 동일 헬퍼) 게이트를 페이지권한 개방과 **같은 커밋**에 추가(구역 NULL=거부·관리자=통과·그 외 manager_id 일치) — 개방과 게이트가 분리배포될 창 없음. ② `573ea40c`(PATCH `/:id/status`)는 종전 `requireRole('ADMIN','MANAGER')` 블랭킷 가드를 **전이별 규칙**으로 교체 — 관리자는 종전대로 전체 전이, 그 외는 `DRAFT→CONFIRMED` 단 하나만 + `ownsAnyLineZone`(같은 `RECEIVING_ZONE_JOIN_SQL` 재사용)으로 담당 구역 라인 보유 확인. **PO 단건 조회 자체가 `entityFilter(c)` 유지**(법인 격리 훼손 없음), 라우터 `.use('/*', authMiddleware, requireAnyPagePermission('/purchase-orders','/receiving'))`가 DESIGNER·SALES 진입 자체를 막음 — 취소·되돌리기·강제RECEIVED는 비관리자에 안 열림. `isSupervisor`/`canTouchZone`(`utils/zoneAccess.ts`)도 직접 Read해 zoneId 미검증·법인교차 허용 같은 구멍 없음 확인. Area4가 데이터정합성 렌즈로 이미 본 것과 별개로 **인가 로직 자체가 안전**함을 보안 렌즈로 재확인.
> - **신규 라우터·엔드포인트 인가 전수 대조**: `purchaseCandidates.ts`(read-only GET 1개, `authMiddleware+requireAccessOrRole` 게이트, 쓰기 경로 없음 — Area4가 지적한 cross-entity 스캔은 read-only라 IDOR 아님) · `barobill.ts GET /registration-audit`(신규, 라우터 전체 `.use('/*', authMiddleware, requireRole('ADMIN','MANAGER'))` 상속 + `getEntityId(c)` 0 거부 — 전체모드 차단 확인) 둘 다 clean.
> - **은행매칭 엔진 신규 SQL 전수(`bank.ts` +229줄) — 인젝션·격리 회귀 0건**: `sort` 쿼리파라미터는 화이트리스트 맵(`sortOptions[...] ?? sortOptions.date`) 경유라 임의 SQL 삽입 불가, `limit`/`offset`은 `Number.isFinite` 검증 후 삽입. `promoteSuggestionsFromHistory`·`applyExpenseCategory`(입금-비용계정 방지 게이트 신규)·`efHist`/`efRules` 전부 파라미터 바인딩 + `entityFilter` 별칭(`c`,`r`,`bank_transactions`) 일관 유지. 신규 util 6종(`bankMatchPolicy`·`counterpartName`·`expenseRole`·`loanSettlement`·`overdueSpread`·`apCandidate`/`apSettlement`) 전부 **순수 함수**(`grep DB.prepare` 0건) — SQL/DB 공격면 자체가 없음.
> - **XSS — 신규/변경 프론트 파일 직접 Read(11개 churn 파일)**: `purchaseCandidates.js`(신규 168줄, 전 sink `pcqEsc` 일관), `bank.js`(+243줄, 신규 바로빌 등록현황 패널·잔액표시 전 sink `escHtml` 일관), `receiving.js`(발주확정 버튼 신설, innerHTML 신규 sink 0건 — 네이티브 `confirm()` 텍스트뿐), `cardExpenses.js`/`reports.js`(역할배지·커버리지 안내, 신규 sink 0건) — **net-new XSS 0건**.
> - **`node scripts/check-xss.mjs` 재실행(직전 Area5가 문서화 정규식으로 교체한 버전)** — 117→110건(직전 사이클 10건 fix 반영, 순감 -7은 파일 diff로 라인 이동). 이번 churn 파일(`bank.js`·`cardExpenses.js`·`purchaseCandidates.js`·`receiving.js` 등) 후보를 개별 대조 — 전부 이미 `escHtml`/`escapeHtml`/`pcqEsc`/`hrEscape` 적용됐거나 기존 FP 클래스(에러메시지 `e.message`·enum 라벨·정의-지점 escape 변수 재사용 `contentStr`/`opts`/`names`)에 해당, 신규 미이스케이프 0건.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: CSV Formula Injection** `grep -rn "includes(','" src` → `csv.ts:83` 1건(기존 헬퍼, 신규 CSV export 없음, 변동없음).
> - **standing scan 3: `npm run audit:entity`** — 검사 134파일·entity테이블 SELECT 73건·**누락 0건**(변동없음).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런(HEAD `8c752b2` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **20**(변동없음, #613·#616·#617·#622·#624~639 전건 일치). #626(레거시 평문비번·JWT_SECRET, owner 결정 대기)·#631(cashSchedule check-overdue entity필터 누락, IDOR=owner 워크플로) 재확인 — 둘 다 정상 open.
> - **backlog↔GitHub 절대값 재동기화**: open **20**(변동없음) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클은 기존 FP 카탈로그(page-permission gating·IDOR 비대칭 판별·XSS FP 클래스)가 정확히 의도대로 작동(입고 권한개방이 처음부터 "개방+게이트 동일커밋" 패턴을 지켜 신규 codify 대상 없음)한 실증. area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(30커밋 churn 전체가 보안 렌즈로 clean — 입고 권한개방이 가장 위험한 변경이었으나 개방과 게이트가 매번 같은 커밋에 묶여 배포됨), 자동수정 0건(고칠 결함 없음), done-sync: open 20(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-08T01:20):**
> - **방법**: 세션 시작 시 detached HEAD `8f55dd0`(origin/main과 동일 커밋이나 얕은 clone) → `git checkout main` → `git pull`이 divergent-history(unrelated histories)로 실패 → `git fetch --unshallow` + `git merge --ff-only origin/main`으로 정합(변동 없음, 이미 최신). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm audit --omit=dev` 0건.
> - **churn 확인(앵커 = 직전 Area4 방법 라인 HEAD `e31d4ba`)**: 웹앱 범위 diff **30커밋** — Area1·2·3·5·6이 이번 세션 안에서 이미 각자 렌즈(프로덕션 헬스·코드품질·UX·보안·자기진화)로 정독한 은행매칭 확장(잔여 제안 승격·카드정산 계정)·cashflow(차입/상환 분리)·계정마스터 대정리(공제부금·결번보충·이름통일·표준명·역할컬럼화 0576~0585 7단계)·원가축 보정(롤자재 단위축·UV폼보드 mm→cm·무광시트 폭분리)·신규 매입후보 큐(`purchaseCandidates`)·입고 OPERATOR 권한개방(`0585_receiving_operator_access`) 웨이브. **데이터정합성 렌즈로는 신규 마이그 15건 전수 직독이 이번이 최초**.
> - **신규 마이그레이션 15건(`0575`~`0585`, 번호중복 7쌍 포함) 전문 직독 + `db:bootstrap:ci` 전량 ✅ 적용 확인**: 전부 멱등 가드(`NOT EXISTS`/`WHERE role IS NULL`류)·백업테이블(`_bak_0576_*`·`_bak_0577_*`)·되돌리기 절차를 갖춘 실측 근거 기반 데이터 정정(가맹점명 224건 대조·이카운트 코드 사다리 추론 등 원문 각주에 근거 명시). CHECK 위반 0(`db:bootstrap:ci` 통과 자체가 증거), 신규 비-FK `*_id` 포인터 컬럼 0건(부모삭제 dangling 후보 없음).
> - **계정마스터 7단계 재정리(0576→0577→0578→0579→0580→0581→0582, 같은 날 이름을 세 번 바꾼 이력) 순서 정합성 직접 대조**: 각 UPDATE의 name 대상이 그 시점 스키마에서 실재하는 이름인지 파일 적용 순서(알파벳=시간 순서, 0576 expense < 0576 roll 등 6쌍 전부 도메인 무관이라 순서 무관)대로 추적 — 신설(0576/0577/0578 결번보충)→통합(0578 대출금→대출상환·수수료→지급수수료)→표준화(0579 개칭)→누락정정(0581/0582 수도광열비 잔류 세금성 재분류, 통장+카드 양축)까지 전부 이름 일치 확인, 끊긴 참조 0건. **핵심 구조 개선 확인**: `CAT_ROLE`(계정명 문자열 두 파일 사본)이 이름을 세 번 바꾸는 과정에서 실제로 깨질 뻔한 전례(0584 자체 주석 "한 번만 빠뜨렸으면 4.3억이 조용히 판관비") → 같은 커밋에서 `expense_categories.role` 컬럼화 + `utils/expenseRole.ts` 단일 정본화로 사본 자체를 폐기(`financialReports.ts:34` 주석으로 폐기 확인) — **구조적 재발방지가 코드에 실제 반영됨**.
> - **신규 매입후보 큐(`purchaseCandidates.ts`+`utils/apCandidate.ts`) 데이터정합성 렌즈 직독**: 거래처 풀 조회가 entity_id 필터 없이 **전체 활성 거래처**를 스캔하나 이는 "같은 거래처의 타법인 매칭 후보"가 목적인 의도적 cross-entity 설계(기존 「cross-entity 파생 배지 FP 클래스」와 동형, read-only 집계라 leak 아님) — 출금(`entityFilter(c,'b')`)·발주합계(`entityFilter(c,'po')`) 양쪽은 정상 entity 격리. `test:ap-candidate` 28건 자체 게이트 보유.
> - **0585 입고 OPERATOR 권한개방 — 마이그 자체 경고("이 마이그레이션만 따로 적용하지 말 것") 이행 확인**: 같은 커밋(`8f55dd0`)에서 `po-receive.ts`가 `canTouchZone`(실사 `loadOwnedCount`와 동일 헬퍼) 게이트를 함께 추가해 권한개방+구역검증이 분리배포되지 않음을 코드 직접 대조로 확인(마이그만 먼저 배포되는 창이 없음, 같은 커밋).
> - **🔴 신규 발견 — 병렬 worktree 마이그레이션 번호 중복 채번, 감지 도구 없음(issue-only)**: 이번 사이클 15건 중 **7쌍**(`0576`·`0577`·`0578`·`0579`·`0580`·`0584`·`0585`)이 번호가 겹친다. 직전 Area4 사이클에도 `0569`·`0570` 2쌍이 있었던 **재발 패턴**(2→7쌍, CLAUDE.md 멀티세션 worktree 워크플로우가 번호를 사람이 눈으로 채번하게 하는 구조적 원인). 이번엔 대상 테이블·컬럼이 전부 안 겹쳐 우연히 무해했으나, 감지 도구가 없어 같은 테이블에 같은 컬럼명으로 채번되면 배포 시 `wrangler d1 migrations apply`가 "duplicate column name"으로 실패하거나 스키마가 조용히 갈라질 수 있다. 새 감시 스크립트 신설은 SKILL 정책상 "새 기능"이라 자동수정 대상 아님 → **issue #639 등록**.
> - **standing scan 1: CHECK IN 제약 ↔ literal write 대조** — `db:bootstrap:ci` 15건 전체 적용 성공 자체가 CHECK 위반 0건 입증.
> - **standing scan 2: `npm run audit:entity`** — 검사 134파일·entity테이블 SELECT 73건·**누락 0건**(133→134파일은 `purchaseCandidates.ts` 신규 반영).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 4: `npm run test:calc`(19개 자체테스트 전체, `test:ap-candidate` 28건 포함)** — 전부 PASS.
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 6런(HEAD `8f55dd0` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **19**(신규 등록 전) 기존 19건 전건 일치(#613·#616·#617·#622·#624~638) 확인 후 #639 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **20**(19→20, #639 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: area-4-data-integrity.md에 「중복 마이그레이션 번호 = 병렬 worktree 채번 충돌」 codify 추가(55회차) — 2569·0570(2쌍)→0576~0585(7쌍) 재발 빈도 증가 기록, 탐지 레시피(`ls migrations | sed ... | sort | uniq -d`) 명시.
> - **백로그 트림 체크**: 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#639 병렬 worktree 마이그 번호 중복 채번 — 이번엔 무해했으나 재발 패턴 확인·향후 실충돌 시 배포차단 위험), 자동수정 0건(신규 마이그 15건 전부 정합·구조개선(role 컬럼화) 이미 코드에 반영·발견한 유일한 결함은 도구신설이라 issue-only), done-sync: open 19(변동없음)·done 542(변동없음)·rejected 6(변동없음, #639 반영 전 기준)→#639 반영 후 20. 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-07T21:45):**
> - **방법**: 세션 시작 시 detached HEAD `d4b9528`(origin/main과 동일 커밋이나 얕은 clone) → `git checkout main` → `git pull`이 divergent-history로 실패 → `git fetch --unshallow` + `git merge --ff-only origin/main`으로 정합(변동 없음, 이미 최신). `npm ci`(0→81).
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `a6faad9`)**: 웹앱 범위 diff **28커밋** — 대부분 회계축(계정 표준화·차입금/상환 분리·특약가/원가 데이터 보정)과 은행매칭 엔진 튜닝, IA 재단엔진(맞붙임 롤 소요량·자재필드 제거)으로 **UI 화면 변경은 없음**. `src/scripts`+`src/pages` 좁힌 범위 **8커밋**만 실제 화면 churn — 그중 **feat 2건이 이번 UX 렌즈 최초 통과**: `04d5e932`(바로빌 등록현황 대조 패널 신설, funds 페이지)·`98438b3f`(계좌 카드에 잔액·최종거래 경과일 표시 + "즉시조회"→"갱신" 버튼 통합).
> - **feat 2건 전문 심층 리뷰(직접 Read, `src/scripts/bank.js`+`src/pages/bank.ts`+`src/routes/bank.ts`+`src/routes/barobill.ts`+`src/routes/cardExpenses.ts` 전문 대조)** — 빈상태·로딩·showConfirm 오용·더블서브밋·cross-scope shadow·백엔드먼저화면나중 6개 클래스 점검:
>   - **바로빌 등록현황 패널**(`04d5e932`): 로딩 스피너(초기 hidden div) → `loadBarobillAudit()` 성공 시에만 `barobillAuditSlot`에 "등록현황" 버튼이 주입되는 구조라, **버튼이 DOM에 나타나는 시점 = 이미 `barobillAuditData`가 채워진 시점**(경합 불가 — 버튼 클릭 가능해지기 전에 데이터가 이미 있음) 확인. 에러 시(`entityId=0`·바로빌 API 실패) `bbSection`이 `sec.error`/`empty_suspicious` 분기로 "0건"과 "못 받음"을 구분해 표시 — CLAUDE.md 「조용한 격하」 패턴 회피 의도가 코드에 실제 반영됨. 계좌 삭제(`bank.ts:481`)·카드 삭제(`cardExpenses.ts:290`) 양쪽 다 `barobill_registered=0, collect_cycle=NULL` 리셋 짝 확인(CLAUDE.md 「되돌리는 짝」 준수).
>   - **계좌 카드 잔액/경과일**(`98438b3f`): 신규 mutate `refreshAccount`(즉시조회+수집 통합)가 `await`+`showConfirm(msg)` 정상 패턴(콜백 오용 아님), 서버 `POST /accounts/:id/refresh`·`POST /sync-barobill` 둘 다 실재(`bank.ts:498`·`:736`) 확인 — dead call 아님. 잔액 = `LATEST_BALANCE_SUBQUERY`(자금현황·자금계획과 동일식, 화면 간 불일치 없음). staleness 임계값(7일 amber·14일 red)은 이 커밋 자체가 "계좌마다 정상 주기가 다르다"는 걸 알고도 전 계좌 동일 임계 — 단 이 화면은 "위험 신호" 용도(형제 커밋 `5728fecf`가 이미 판정 로직 쪽엔 계좌별 리듬 반영 완료, 화면 임계값은 단순 안내라 별개 사안, 신규 결함 아님).
>   - **신규 mutate write-path 전수(diff 전체, 8커밋)**: `axios.post/put/delete` net-new 호출 **1건**(위 `refreshAccount`) — 더블서브밋 가드 불요(2단계 모두 사용자 확인 개재, 서버측 refresh는 바로빌 조회 요청이라 멱등, sync-barobill은 날짜범위 upsert성). showConfirm 오용 0건. `?raw` concat 스코프 충돌 0건(신규 top-level 함수 `bbCycleSummary`/`bbSection`/`bbFmtAcct`/`bbFmtCard`/`bankStaleDays`/`bankFmtYmd`/`fmtMoney`가 bank.js 기존 식별자와 충돌 없음, `grep -c` 대조).
>   - **checked clean(나머지 6커밋)**: `531fa093`(margin 탭 커버리지 안내 텍스트만 확장, UI 구조 무변경)·`5728fecf`(bank.js 프론트 diff는 에러메시지 원문노출 개선뿐)·`99891e73`(cashSchedule.js diff는 미적용 사유 텍스트 추가, 이미 Area2가 코드품질 렌즈로 정독한 웨이브)·`3bf74275`(XSS escapeHtml 추가, Area5가 이미 정독) — 전부 UX 신규 결함 없음.
>   - **「백엔드 먼저·화면 나중」standing scan**: 이번 churn의 회계축 마이그레이션(계정 표준화·차입금 분리) 20커밋은 신규 API 응답 필드 노출이 아니라 기존 화면이 읽는 마스터데이터(`account_name` 등)의 값 자체를 정정하는 것이라 이 클래스 대상 아님(화면 소비처는 원래부터 있음, 신규 필드 없음).
> - **standing scan 1: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `d4b9528` 포함) 전부 `conclusion:success`(1건 `cancelled`는 같은 세션 연속 push로 인한 정상 supersede, 실패 아님).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **19**(변동없음, #613·#616·#617·#622·#624~638 전건 일치) — 이번 사이클 신규 결함 0건이라 추가 이슈 없음.
> - **backlog↔GitHub 절대값 재동기화**: open **19**(변동없음) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 8건(직전 Area2가 13건 도달 시 트림 완료 확인) → 이번 로그 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(이번 churn의 유일한 신규 UI 표면 2건이 CLAUDE.md 핵심 패턴들 — 조용한 격하 회피·되돌리는 짝·정본식 재사용 — 을 실제로 준수해 구현됨, 신규 mutate 1건도 가드·서버멱등성 정상), 자동수정 0건(고칠 결함 없음), done-sync: open 19(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-07T15:52):**
> - **방법**: 세션 시작 시 detached HEAD `0eb0c4d`(origin/main과 동일 커밋이나 얕은 clone) → `git checkout main` + `git fetch --unshallow`(divergent-history 오류 해소) + `git merge --ff-only origin/main`으로 정합. `npm ci`(0→81), `npx tsc --noEmit` clean, `npm audit --omit=dev` 0건(변동없음).
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `f019102`)**: 웹앱 범위 diff **14커밋**(2026-09-05~09-07) — 은행매칭 세부튜닝(설명vs금액 우선순위 역전 수정·계좌 최신성/잔액 표시)·카드 offset_reason 4분류 도입(`0575`)·원가축(대체자재 합산 오류 수정)·재단엔진(롤 소요량 합산·자재필드 제거) 신설. `3bf74275`/`b16fafb3`(XSS·스캐너 수정)·`c8197a5`/`4a0cefe`/`b597a45c`/`99891e7`(은행매칭 엔진 본체)는 Area4/5가 직전 세션에서 이미 코드품질 인접 렌즈로 정독 확인 후 재검토 제외, 신선 구간(카드offset·원가축·재단엔진·은행 최신 2커밋)에 집중.
> - **배경지식 심층 리뷰(background agent)** — entity_id 격리·N+1·authMiddleware·컬럼존재성·dead code·타입불일치·누적캐시 7개 클래스 전수 점검:
>   - **신규 → #637(MED)**: `bankMatchPolicy.ts:66` `buildSettlementClientMap`이 거래처명에서 브랜드를 원문 그대로 추출(`"NH농협카드(매출정산)"` → `"NH농협"`)하는데, 조회 키는 `counterpartName.ts` `CARD_BRAND_CANON`이 늘 한글로 정규화(`BC`/`756921567BC` 둘 다 → `'비씨'`)해서 넘김 — prod `clients.client_name`의 BC 정산 거래처가 영문 `"BC카드(매출정산)"`로 등록돼 있으면 맵 키 `"BC"`(영문) vs 조회 키 `"비씨"`(한글) 불일치로 **BC카드 정산만 자동매칭이 조용히 미동작**(throw 없음, `IGNORED` 낙하 = 「조용한 격하」 패턴). `counterpart-selftest.cjs:110-113`은 현대·NH만 커버, BC는 `isNonCounterpartName` 단독 테스트뿐(`buildSettlementClientMap` 통합 케이스 없음) 확인. egress 차단으로 prod `client_name` 실측 불가 → issue-only.
>   - **신규 → #638(LOW)**: `cardSpend.ts:56-67` `cardBillingFilterSql`·`cardBillingAmount`·`NON_BILLED_REASONS`·`OffsetReason` — 어떤 라우트에도 import 안 되는 dead export(`grep -rn` 소비처 0, `card-spend-selftest.cjs` 자체테스트만 참조). 직전 두 커밋(`fab65150`+`0b28dd8` docs)이 "카드 청구주기 vs 출금액 기간귀속 매칭"을 같은 세션에서 탐색한 흔적이라 **당일 작성된 미완 WIP일 가능성**을 배제 못 함 → dead code는 SKILL.md상 safe-auto-fix 대상이지만, 이번엔 판단을 owner에게 맡기고 issue-only(오늘 커밋을 곧바로 지우는 리스크 회피).
>   - **checked clean**: entity_id 격리 net-new 0(이번 diff에 신규 `getEntityId(c)||1` 없음, `entityFilter(c,'ba')` 등 기존 alias 패턴과 일치) · N+1 0 · authMiddleware 갭 0(신규 라우트 없음) · 컬럼존재성 드리프트 0(`offset_reason` 등 `0575` 대조 확인, CHECK 제약은 free TEXT라 없음 — 실제 write 경로 2곳만 일관 사용 확인) · 누적캐시 0(`purchaseOrders/core.ts:696-738` PO취소가 `cash_schedule` 정리를 같은 batch에서 처리 = CLAUDE.md 「되돌리는 짝」 규칙 준수, `apSettlement.ts` 신규 맵은 매 요청 파생계산이라 캐시 아님).
> - **standing scan 1: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런(HEAD `0eb0c4d` 포함) 전부 `conclusion:success`. 세션 진행 중 새 커밋(`bf60a47` 은행매칭 추가튜닝)이 원격에 push돼 CI in-progress 확인 — 이번 사이클 diff 범위(`f019102..0eb0c4d`) 밖이라 리뷰 대상 아님, 다음 Area3 사이클의 churn 앵커가 됨.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **17**(신규 등록 전) 기존 17건 전건 일치(#613·#616·#617·#622·#624~636) 확인 후 #637·#638 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **19**(17→19, #637·#638 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 12건 → 이번 로그 추가 후 13건, **임계(13건) 도달** → `npm run backlog:trim` 실행 필요(아래에서 처리).
> - 신규 이슈 2건(#637 BC카드 정산 브랜드키 불일치 — 재무 자동화 무력화이나 오확정 위험 없음, #638 당일 탐색 산물로 보이는 dead export — WIP 가능성 있어 자동삭제 보류), 자동수정 0건(둘 다 prod 데이터 확인 또는 owner 판단 필요), done-sync: open 17(17→19)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-07T09:52):**
> - **방법**: 세션 시작 시 detached HEAD `1eb836a`(직전 Area6가 이 세션 끝에 만든 docs 커밋, origin과 동일) → `git checkout main` + `git fetch origin main` + `git pull`로 정합(변동 없음, 이미 최신). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm run build` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `50828e8`)**: 웹앱 범위 diff **12커밋** — Area2~6이 이번 세션에서 이미 각자 렌즈로 정독한 은행매칭엔진·cashflow 확장·XSS 자체수정 웨이브(직전 Area6 로그와 동일 창, 새 커밋 없음). **신규 마이그레이션 0건**(migrations diff 공집합) — (a)/(b) 드리프트 분류 대상 없음. CI 헬스: `actions_list(deploy.yml)` 최근 10런(HEAD `1eb836a` 포함) 전부 `conclusion:success`, 최신 job(101579217784)의 typecheck·build·self-tests·entity audit·write canary·smoke 전 단계 success.
> - **🔴 신규 발견 — `cashSchedule.overview` 응답시간 회귀, 예산·baseline 둘 다 초과, CI가 무음(#636)**: 이 세션은 egress 차단으로 prod에 직접 fetch 불가(`agent-proxy connect_rejected` 확인) → `npm run audit:query-cost`를 로컬에서 못 돌림. 대신 최근 배포 job 로그(GitHub Actions)의 smoke 응답시간 줄을 직접 대조하는 방식을 이번에 처음 씀: 최신 배포(`1eb836a`, job 101579217784)의 `cashSchedule.overview` 3589ms, 하루 전 배포(`b84e713`, job 101237225487) 3135ms — 둘 다 `query-cost-audit.cjs`의 `budgetMs:2000` 초과이자 `query-cost-baseline.json`에 저장된 247ms(2026-08-25) 대비 14배. smoke는 200 응답이면 무조건 PASS(`PASS 130/130`)라 이 회귀를 전혀 못 봤고, `audit:query-cost` 자체가 `deploy.yml`에 안 물려 있어 baseline이 이 사이클의 cash-plan/cashflow 대형 웨이브 내내 한 번도 재검증되지 않았다. 원인 추정: `cashSchedule.ts:219-221`이 `buildCashflowDays()`(978줄, D1 쿼리 15개 중 3곳만 `Promise.all`)를 `Promise.all`로 2회 호출 — 각 호출 내부 순차 구간이 병목. 재무 계산 엔진 내부 순서 재배치라 자동수정 대상 아님(`test:cash-settle`/`test:ap-settle`/`test:counterpart` 131항목 회귀 필요) → **issue #636 등록**.
> - **standing scan 1: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **16**(신규 등록 전) 기존 16건 전건 일치(#613·#616·#617·#622·#624~635) 확인 후 #636 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **17**(16→17, #636 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: area-1-production-health.md에 「CI 배포 job 로그의 smoke 응답시간 줄 = egress 차단 시 audit:query-cost 대리지표」 codify 추가 — 다음 사이클부터 무거운 신규 엔드포인트가 churn에 끼면 이 방법으로 baseline 대조.
> - **백로그 트림 체크**: 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#636, cashSchedule.overview 응답시간 14배 회귀 — CI가 구조적으로 못 보는 사각지대, job 로그 대조로 신규 탐지 기법 확립), 자동수정 0건(재무 계산 엔진 내부 순서 재배치라 회귀 위험 — issue-only), done-sync: open 17(16→17)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-07T03:45):**
> - **방법**: 세션 시작 시 detached HEAD `3c72ef6`(직전 Area5가 방금 이 세션에서 만든 커밋, origin과 동일) → `git checkout main`(로컬 main이 43커밋 뒤처져 있었음) + `git pull origin main`으로 정합. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 방법 라인 HEAD `5d71457`)**: 웹앱 범위 diff **12커밋** — 전부 Area1~5가 이번 세션 안에서 순차로 이미 각자 렌즈로 정독한 은행매칭엔진·cashflow 확장·XSS 자체수정 웨이브(직전 Area5가 바로 이 창을 보안 렌즈로 방금 전수 훑고 끝냄, `3bf7427`/`b16fafb`도 그 산출물). **신규 마이그레이션 0건**(`e31d4ba..HEAD -- migrations` 공집합) → 「컬럼-diff bridge」는 이번 사이클 대상 없음. 비-웹앱 축(`LogWatcher/IllustratorAutomat/caps-worker/workers/queue`) churn도 `ad20ec4`(주문 스케일 보정 기능의 `IllustratorAutomat/Program.cs` 8줄) 1건뿐 — 이미 Area4 로그가 "순수 프론트+IA"로 인지·나열했고, 이 사이클이 직접 diff를 열어 확인(파일명에 축소배율 토큰을 규격 옆에 병기, `printEvents.resolveCard`가 의존하는 꼬리 `{주문번호}-{FFF}`는 안 건드림 — 주석이 그 제약을 스스로 명시). 축1(exe 폴더)·축2~5(Z:) 전부 이 샌드박스에 NAS 연결이 없어 실배포 여부 검증 불가(`audit:ia-jsx` 6개축 전부 "경로 접근 불가"로 판정 제외 — #616/#617 이래 반복되는 환경 제약, 신규 아님).
> - **XSS bridge(「XSS bridge」, 16회차 원조 문단) — 직전 Area5 review 대상에 없던 신규 sink 1곳 발견·직접 확인**: `cashSchedule.js`(+94줄, AP/AR 대사 패널 `renderApReconcile` 신설, `0e455ac`/`995ef16` 계열)의 `unapplied_suppliers`/`lagging_suppliers` 배열의 `s.name`(거래처명, free-text) 2곳 — 둘 다 `escapeHtml(s.name)`으로 이미 이스케이프 확인. **net-new XSS 0**(Area5가 남긴 것 없이 clean, 다만 Area5 로그 본문에 이 신설 함수가 개별 언급되지 않았어 "나열됨≠Read됨"(#600) 재발 방지 차원에서 Area6가 직접 열어본 것).
> - **open≠unfixed 거울(「open≠unfixed 거울」, 30회차)**: cashSchedule 3형제(#631 check-overdue entity필터 누락·#632/#635 `getEntityId(c)||1`)를 코드 직접 grep으로 재확인 — `cashSchedule.ts:583-598`(check-overdue UPDATE/COUNT 둘 다 여전히 entity 절 없음)·`:397`·`:558`(`getEntityId(c) || 1` 여전히 잔존) 전부 **미픽스, 정상 open**(이번 churn이 이 파일의 프론트만 건드리고 백엔드 핸들러 3곳은 무변경). #627(waste/budgets 고아 라우터)·#628(ar-helpers.ts)·#629(재고실사 중복편입)·#630(구역배정 빈화면) 대상 파일도 이번 churn 0건(「close-pending 캐시」, 32회차 — 파일 불변이면 재검증 skip, 직전 검증 유효) 확인 후 재grep 생략.
> - **standing scan 1: done-sync 절대값 재동기화(리터럴 쿼리)** — `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **542**(변동없음) · `reason:not_planned` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **16**(변동없음, #613·#616·#617·#622·#624~635 전건 일치).
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `3c72ef6` 포함) 전부 `conclusion:success`.
> - **close-pending 재확인**: #616·#617은 owner 코멘트가 "실기 확인 대기"를 명시(64회차 FP룰) — 사이클 수와 무관하게 정상 open, 재통지 불요.
> - **🧬 SKILL 강화**: 없음 — 이번 사이클은 기존 「컬럼-diff bridge」·「XSS bridge」·「open≠unfixed 거울」·「close-pending 캐시」 4개 규칙이 정확히 의도대로 작동(신규 마이그 0·신설 sink 1건 clean·open 3형제 미픽스 확정·churn 0 파일 재검증 생략)한 실증이라 신규 codify 불요. area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(직전 Area5가 같은 세션에서 방금 이 churn 창을 보안 렌즈로 전수 훑어 브릿지 대상 자체가 거의 없었음, 유일한 신선 지점인 AP/AR 패널 신설 sink 1건도 clean), 자동수정 0건(고칠 코드 없음), done-sync: open 16(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
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
