# Improvement Backlog
<!-- last_run_area: 1 -->
<!-- last_run_at: 2026-09-07T09:52:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **17** (`list_issues(state:OPEN,label:auto-improve)` 실측, 16→17: #636 신규) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **542** (`search_issues(reason:completed,label:auto-improve)` 실측, 변동없음) |
| ❌ rejected | **6** (`not_planned` 4 + `duplicate` 2, 실측, 변동없음) |

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

> **Area 5 보안 + 인프라 (2026-09-06T22:02):**
> - **방법**: 세션 시작 시 detached HEAD `af61e7e`(origin/main과 동일 커밋) → `git checkout main` + `git fetch origin main` + `git pull`로 정합 확인(변동 없음). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm audit --omit=dev` 0건(변동없음).
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `7529b10`)**: 웹앱 범위 diff **13커밋** — 전부 은행 매칭 엔진 확장(카드정산 라우팅·내부법인 자기이체 차단·은행앱 접두 제거 2차 규칙·발주취소 시 지급예정 batch 정리)과 cashflow 신규(연체분산 2종). Area4가 데이터정합성 렌즈로 이미 대부분 정독했으나 **보안 렌즈는 이번이 최초 통과**.
> - **churn 직독 결과 — net-new 0건**: `bank.ts`(136줄 diff) 신규 SQL 전부 바인드 파라미터, `entityFilter` 형제 일관 유지, 내부법인 판정(`bankMatchPolicy.ts`)·카드정산 매핑(`buildSettlementClientMap`)·접두제거(`counterpartName.ts`)는 전부 순수함수(D1 호출 없음, `eval`/동적 `RegExp` 사용자입력 없음 — `BANK_PREFIX_RE`는 고정 은행명 리스트로만 구성돼 ReDoS 대상 아님). `purchaseOrders/core.ts`(발주취소 시 `cash_schedule` batch 정리)·`cashSchedule.ts`(GET 전용, 기존 `requireEditOrRole` 게이트 유지)는 읽기/상태전이 로직 변경뿐 신규 공격면 없음.
> - **🔴 신규 발견·직접 수정 1 — `scripts/price-match-audit.py` SQL/커맨드 인젝션**: `--since` CLI 값을 f-string으로 SQL에 직접 삽입해 `wrangler d1 execute --remote --command`(prod DB)로 넘기고, Windows에서 `shell=True`. 형식검증 없는 문자열이 SQL과(엔진이 지원하면) cmd.exe 양쪽에 인젝션 가능 — 로컬 전용 읽기전용 분석툴이라 공격표면은 작지만(운영자가 직접 실행) 실제 SQL/커맨드 인젝션 결함. `re.fullmatch(r'\d{4}-\d{2}-\d{2}', a.since)` 검증을 fetch 호출 전에 추가(기본값·문서화된 사용법 모두 그대로 통과, 동작 무변경). 검증: 악의적 `--since` 값 투입 시 검증 실패로 조기 종료 확인. **자동수정**(로컬 dev 스크립트 입력검증, 스키마/API/비즈니스로직 무관 — 안전 범주).
> - **🔴 신규 발견·직접 수정 2 — `scripts/check-xss.mjs`가 생성 이후 한 번도 작동한 적이 없었음**: 이 파일이 문자 그대로 `escapeHtml\(`만 인식해, 이 프로젝트가 실제 쓰는 별칭(`esc`·`escAttr`·`hrEscape`·`sgpEsc` 등— 「SPA innerHTML XSS 자동 standing scan」 항목이 이미 문서화한 정규식 `/[A-Za-z_]*[Ee]sc[A-Za-z]*\s*\(/`)을 전부 미이스케이프로 오판 → `src/scripts` 전체(189줄)가 매번 걸려 신호대잡음비 0에 가까움(git log 1커밋, npm script/CI 미연결, 유용한 결과 낸 적 없음). 문서화된 정규식으로 교체(189→117건). **SKILL 강화**: area-5-security-infra.md에 codify 추가(다음 사이클부터 standing scan 편입).
> - **117건 백그라운드 에이전트 전수 triage(기존 FP 클래스 대조)** — 106건 FP(에러메시지 23·enum/시드데이터 라벨 6·숫자/id 9·정의-지점escape 재사용 등 이미escape 59·jsStr류 JS문자열escape 3·비-사용자데이터 4 등), **confirmed 11건**(1건은 재검증 결과 정규식 파싱 아티팩트로 확인 — 실제로는 이미 fix 적용됨, 나머지 10건 + 클러스터 정독 중 부수 발견 1건 = 총 11개 사이트 fix): `hr.js:77`(entity_name, title속성은 escape인데 content는 raw)·`layout/shell.js:2189`+`messages.js:755`+`ledger.js:1961`(카카오 템플릿 `<option>` 동일 버그 3파일 복붙)·`paymentRequests.js:151/153/154`(수신자명·비고·작성자명)·`postProcessing.js:425/461/470/497`(같은 파일 CRUD 목록 섹션은 이미 escape, 통계/차트 섹션만 누락 — `:470`은 속성 컨텍스트라 `"` 포함 시 속성 자체 파괴)·`dashboard.js:332`(같은 후가공명 필드, 대시보드 배지)·`purchaseRequests.js:259`(changed_by_name, 같은 줄 change_reason은 이미 escape)·`purchaseOrders.js:711`(템플릿명, 인접 supplier_name/notes는 이미 escape — 클러스터 정독 중 부수 발견). **전부 단순 테이블/드롭다운/배지 렌더** = 안전 자동수정 범주(복합 출력문서 아님) → 9개 파일 14줄 17개 escapeHtml 호출 직접 추가, `node --check` 전체 통과·`npm run verify`(typecheck+build) clean·`npm run check:dom` OK·재실행한 check-xss.mjs에서 수정한 10개 라인 전부 후보 목록에서 소멸 확인.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: 두 수정 커밋(`b16fafb`·`3bf7427`) 모두 push 후 `actions_list(deploy.yml)` 확인 — `b16fafb` `conclusion:success`, `3bf7427`는 이 로그 작성 시점 진행중(다음 사이클 시작 시 재확인).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **16**(변동없음, #613·#616·#617·#622·#624~635 전건 일치). #626(레거시 평문비번·JWT_SECRET PII키 겸용, owner 결정 대기)·#631(cashSchedule check-overdue 형제비대칭, IDOR=owner 워크플로) 재확인 — 둘 다 정상 open, 코멘트/리액션 없음.
> - **backlog↔GitHub 절대값 재동기화**: open **16**(변동없음) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: area-5-security-infra.md에 「커밋된 스캐너가 자기 문서화된 레시피와 다르게 구현돼 있으면 조용히 무용지물」 codify 추가(check-xss.mjs 사례) — "이 클래스는 이미 스크립트가 있다"고 존재 여부만 확인하고 넘기지 말 것, 실행해서 신호대잡음비까지 확인해야 검증이 끝난다는 교훈.
> - **백로그 트림 체크**: 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(churn 자체는 clean, 대신 저장소에 방치돼 있던 스캐너 결함 2건을 직접 발견·수정), 자동수정 2건(price-match-audit.py 입력검증 커밋 `b16fafb` + check-xss.mjs 별칭인식 수정 커밋 `b16fafb`) + XSS 실제 수정 1건(9파일 17건 escapeHtml 추가, 커밋 `3bf7427`), done-sync: open 16(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-06T15:47):**
> - **방법**: 세션 시작 시 detached HEAD `e31d4ba`(origin/main과 동일 커밋) → `git checkout main` + `git fetch origin main` + `git pull`로 정합 확인(변동 없음, 이미 최신). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 방법 라인 HEAD `abc38eb`)**: 웹앱 범위(`-- src migrations scripts .github`) diff **22커밋** — 대부분 **cash-plan/cashflow 확장**(연체분산·기지급차감·이상거래 경고, Area2/3/5가 이미 각자 렌즈로 정독) + **은행 매칭 엔진 신설**(`counterpartName.ts` 신규 모듈 — 은행앱 접두 제거·카드정산/계좌번호 판별·내부법인 자기이체 차단, `f019102`·`c8197a5`·`4a0cefe`, 이번 세션 직전 착륙) + IA 배치엔진(`cut:` 축, 비-웹앱) + 마감(봉제) 과금축 Phase 0(0573) + 규격축소파일 스케일 보정(`ad20ec4`, 순수 프론트+IA). **데이터정합성 렌즈로는 은행 매칭 엔진이 이번이 최초 통과**(Area5가 보안 렌즈로 이미 본 파일이나 겹치는 함수 없음).
> - **신규 마이그레이션 3건(0572~0574) 전문 직독 + `db:bootstrap:ci` 전량 ✅ 적용 확인**: (a) `0572`(품목 제안억제 플래그 + 원단교체 2종 FIXED→AREA 축전환) — 축 전환과 같은 마이그에서 `unit_price = amount ÷ 재산정면적`으로 즉시 재계산(선행 사고 0571의 "축만 바꾸고 단가 의미 재계산 누락" 재발 방지 학습 반영), `amount`는 불변이라 재계산행은 `unit_price × 면적 × 수량 = amount` 항등식이 정의상 성립 — 청구 정정 아님 확인. 백업테이블(`_bak_0572_frame_sign`) 존재. 규격 없는 11라인은 재산정 제외하고 그대로 둔 것도 `/api/prices` AREA_USABLE_SQL이 규격없는 AREA라인을 이미 걸러 제안에 안 섞임을 재확인. (b) `0573`(마감 과금축 Phase 0) — 단가 전부 0 시작이라 금액영향 0, `finishing_methods`는 entity_id 없는 전역마스터라 entityFilter 대상 아님. (c) `0574`(계좌별 자금계획 편입 플래그) — 기본값이 멱등하게 의도된 동작을 재현(마이너스통장 제외/예금 포함). 3건 전부 CHECK 위반 0(`db:bootstrap:ci` 통과 자체가 증거), 신규 비-FK `*_id` 포인터 컬럼 0건(→ 부모삭제 dangling 후보 없음).
> - **은행 매칭 엔진 신설 3커밋 데이터정합성 렌즈 직독** — `counterpartName.ts`(정규화·은행앱접두 제거·카드정산/계좌번호 판별)와 `bank.ts`의 `runAutoMatchEngine`/`applyBankTransaction` 변경분 전문 대조: ① 카드정산 브랜드 매칭(`settlementClientByBrand`)이 참조하는 `clients` 쿼리는 `WHERE is_active=1`만이고 entity_id 필터 없음 — `clients` 테이블 자체가 entity_id 미보유 전역마스터(기존 다회차 FP 확인 클래스와 동형)라 정상, 브랜드 매핑(`CARD_BRAND_CANON`)과 정산거래처 이름 파싱(`카드.*$` 제거)의 캐노니컬 값 8종 전수 대조 = 일치. ② 내부법인 자기이체 차단(`internalEntityByClientId`+`tx.entity_id` 비교) — 참조하는 `INTERCOMPANY_ENTITIES`(3사 고정, `constants/intercompany.ts`)는 기존 SSOT(2026-07-20)로 이번 churn 무변경, 매핑 자체 재검증 불요. ③ `applyBankTransaction`의 구 cash_schedule 자동-DONE UPDATE 제거(FIFO 파생 전환) — 남은 `cashSchedule.ts:459`(사람이 누르는 수동 완료 버튼)는 별개 경로라 회귀 아님, 파생 전환 자체는 `test:cash-settle`(52항목)로 게이트됨. **결함 0건**.
> - **standing scan 1: CHECK IN 제약 ↔ literal write 대조** — `db:bootstrap:ci` 3건 전체 적용 성공 자체가 CHECK 위반 0건 입증(`pricing_type`·`pricing_method`(AREA/FIXED) 등).
> - **standing scan 2: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 4: `npm run audit:items:selftest`** — 품목중복 판정 7케이스(중복 3·정상 4) 전부 기대대로.
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **직접 실행 확인**: `npm run test:cash-settle`(52항목)·`npm run test:ap-settle`(47항목)·`npm run test:counterpart`(32항목) 전부 PASS — 은행매칭·자금계획 신설 로직의 자체 게이트가 이미 촘촘함을 재확인.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `e31d4ba` 포함, 은행매칭 3커밋 각각 개별 배포) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **16**(변동없음 — #613·#616·#617·#622·#624~635 전건 일치) — 이번 사이클 데이터정합성 렌즈 신규 결함 0건이라 추가 이슈 없음.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 리터럴 쿼리 재실행 — done **542**(변동없음) · rejected `not_planned` 4 + `duplicate` 2 = **6**(변동없음) · open **16**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 8건 → 이번 로그 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(신규 마이그 3건 전부 항등식·CHECK·전역마스터 정합 확인, 은행매칭 엔진 신설도 entity 경계·내부법인 판정·FIFO 파생 전환 전부 clean, 자체 게이트 131항목 PASS), 자동수정 0건(고칠 코드 없음), done-sync: open 16(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-06T09:52):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD `a6faad9`, origin/main과 동일 커밋) → `git checkout main`(32커밋 behind) → `git fetch --unshallow` + `git pull origin main` → HEAD `a6faad9`로 정합. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `6020713`)**: 웹앱 범위 diff 31커밋, `src/scripts`+`src/pages` 좁힌 범위 13커밋 — 전부 **cash-plan/cashflow 신설 웨이브**(자금계획 달력·예측·전망을 한 화면에 통합, `449635f` 등). Area2가 이미 같은 웨이브를 코드품질 렌즈(entity_id·N+1·authMiddleware)로 정독했으나 **UX 렌즈는 이번이 최초 통과**.
> - **cash-plan 화면 전문 심층 리뷰(background agent)** — `cashSchedule.ts`/`cashSchedule.js`/`bank.ts`/`bank.js` 전문 Read, 빈상태·로딩·에러·showConfirm 오용·`?raw` concat 스코프·더블서브밋·KPI필드 대조·사이드바 도달성 전 항목 점검, 부수로 `orderForm/{finishing,itemRow,calc,parent}.js`(같은 웨이브의 봉제축 가격 Phase 0) 표본 확인:
>   - **신규 → #633(MED)**: `schSave`(수동 자금예정 등록, `cashSchedule.js:723`) 버튼에 disable/in-progress 가드 없음 + 서버 `POST /schedule`(`cashSchedule.ts:376`)도 단순 INSERT라 멱등성 없음(형제 `schAutoGenerate`/`schCheckOverdue`는 서버가 `NOT EXISTS`/조건부 UPDATE로 이미 멱등, 이 버튼만 예외) → 더블클릭 시 동일 예정 중복 등록, 캘린더·90일예측·위험일 KPI 부풀림. 직접 소스 대조로 재검증 완료.
>   - **신규 → #634(LOW-MED)**: 주문폼 가로/세로(`width_/height_`) `oninput`이 `calcItem`만 부르고 `calcFinishing`은 안 부름(`itemRow.js:75,80`) — `calcFinishing`(`finishing.js:153`)은 그 필드를 직접 읽어 "여백 …cm → W×Hcm(참고)"·"서비스 N원"을 그리므로, 마감방식 먼저 선택 후 규격을 고치면 옛 규격 기준 참고값이 그대로 남음. 현재 마감단가 전부 0(Phase 0)이라 "서비스 N원" 표시 자체는 항상 숨김(청구액 영향 없음), 단 "여백 참고" 표시는 지금도 오차 노출·Phase 1(단가 도입) 이후 위험 잔존. 직접 코드 대조(calcItem/calcFinishing 양쪽 전문)로 재검증 완료.
>   - **신규 → #635(MED, #632 형제)**: 수동등록 `POST /schedule`(`cashSchedule.ts:397`)도 `getEntityId(c) || 1` 사용 — `#632`(같은 파일 `:558` 자동생성 PURCHASE 블록)와 **동일 클래스, 다른 위치**. Area2가 "나머지 INSERT 전수 entity_id 누락 0건"이라 기록했으나 그건 "누락" 검사였고 이건 "오귀속"(getWriteEntityId 미사용) 클래스라 그 스캔 밖 — background agent 보고에는 없었으나, #633 검증 과정에서 백엔드 라우트를 직접 열어보다가 발견. 전용 회피 헬퍼 `getWriteEntityId`가 `inventory.ts`·`storageZones.ts`·`returns.ts`·`scan.ts`·`priceSheets.ts`·`fixedAssets.ts`엔 이미 적용돼 있는데 이 엔드포인트만 구패턴. ADMIN 전체모드에서 수동 자금예정 입력 시 법인2/3 담당자 입력분이 법인1에만 잡힘.
>   - **checked clean(agent 보고)**: 빈 상태(일정 없음/`include_in_cash_plan` 계좌 없음) 안전 기본값, 로딩/에러 토스트 정상, `showConfirm` 오용 0건(전부 `await`/`.then`), `?raw` concat 크로스스코프 가드 정상(`hubGoto` 등), KPI 필드명(`overview` 응답 ↔ 프론트 렌더) 전수 일치, `include_in_cash_plan` 토글 왕복 정상.
>   - **직접 재확인(owner 세션)**: 사이드바 도달성 — `menu.ts:64` `/cash-schedule` 정상 등록(구 `/bank` 은퇴는 주석으로 의도 확인) → 네비게이션 갭 아님. `permission_pages` 등록 — `migrations/0137`·`0138`에 이미 존재(이번 웨이브 이전부터의 기존 페이지, 신규 페이지 아님) → CLAUDE.md "신규 페이지→권한 등록" 대상 아님.
> - **standing scan 1: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음 — #635는 "오귀속"이라 이 스캔 클래스 밖, #632와 동일 사각지대).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `a6faad9` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **13**(신규 등록 전) 기존 13건 전건 일치(#613·#616·#617·#622·#624~632) 확인 후 #633·#634·#635 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **16**(13→16, #633·#634·#635 신규) · done **542**(변동없음, `search_issues(reason:completed)` 재확인) · rejected **6**(변동없음, `not_planned` 4 + `duplicate` 2 재확인).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 도달 → 아래 트림 실행.
> - 신규 이슈 3건(#633 자금예정 수동등록 더블클릭 중복 MED, #634 주문폼 마감참고값 미갱신 LOW-MED, #635 수동등록 entity_id 오귀속 MED — #632 형제), 자동수정 0건(전부 UI가드/버튼동작/재무write-path 판단 동반이라 정책상 issue-only), done-sync: open 16(13→16)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-06T03:48):**
> - **방법**: `git status`=워킹트리 clean(main, `f019102`), `git fetch origin main`=이미 최신(로컬=origin 동일 커밋). `git fetch --unshallow`(얕은 clone 복구). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `5f75e659`)**: 웹앱 범위 diff **43커밋** — Area1/3/4/5/6이 이미 이 창을 각자 렌즈(마이그 드리프트·UX·데이터정합성·보안·자기진화)로 정독했으나, **코드품질 렌즈(entity_id 오귀속·N+1·authMiddleware·컬럼드리프트·dead code)로는 이번이 최초 통과**. 신규 대형 기능 = **cash-plan/cashflow 엔진 신설**(`cashSchedule.ts`·`cashflowEngine.ts`·`overdueSpread.ts`·`apSettlement.ts`·`counterpartName.ts`·`bankBalance.ts`) + `prices.ts` 특약가 재연결 + `bank.ts` 매칭 로직 개선 — 이 렌즈 최초 통과 구간에 집중.
> - **cash-plan/cashflow 신설 파일 6개 전문 심층 리뷰(background agent)** — entity_id 격리·N+1·authMiddleware·컬럼존재성·dead code·타입불일치·누적캐시 7개 클래스 전수 점검:
>   - **HIGH 발견 → #632**: `cashSchedule.ts:471` `POST /schedule/auto-generate` 안에서 **PURCHASE 블록만** ORDER 블록(`g.entity_id`를 조회→dedup→INSERT 전체에 일관 사용)과 비대칭 — SELECT가 `po.entity_id`를 조회 안 함(컬럼리스트·`ConfirmedPORow` 인터페이스 둘 다 부재), dedup NOT EXISTS도 `cs.entity_id = po.entity_id` 조건 누락, INSERT(`:558`)가 발주 자신의 법인 대신 **`getEntityId(c) || 1`**(요청 세션 법인)을 사용. 이 패턴은 프로젝트가 이미 문서화한 함정(`entityFilter.ts:12-13` 주석 "기존 `getEntityId(c) || 1` 패턴은 전체모드 쓰기를 조용히 동산(1)에 귀속시키는 함정" — 전용 회피 헬퍼 `getWriteEntityId`까지 만들어 놨는데 이 블록만 구패턴 잔존). 트리거 = ADMIN "전체"모드(entityId=0)에서 자동생성 클릭 → 전 법인 발주가 전부 법인1 자금계획에 귀속, 법인2/3 자금계획엔 그 발주의 지급예정이 누락. 재무 write-path + egress 검증불가 → issue-only.
>   - **checked clean**: `cashSchedule.ts`·`cashflowEngine.ts`·`bank.ts`(include_in_cash_plan)의 나머지 SELECT/UPDATE/DELETE/INSERT 전수(cash_schedule 0245·loans/fixed_expenses 0230·corporate_cards/card_transactions 0231·payments류 0150·purchase_adjustments 0250·price_change_history 0274 대조) entity_id 누락 0건(`loan_payments`는 테이블 자체에 entity_id 없어 `l.entity_id` JOIN 경유가 의도적, 버그 아님). N+1 0건(`cashflowEngine.ts`/`overdueSpread.ts`/`apSettlement.ts`는 순수함수라 D1 호출 자체 없음, `cashSchedule.ts` auto-generate 루프는 `c.env.DB.batch()` 단일 호출로 이미 최적). authMiddleware 정상(라우터 레벨 적용, 형제 패턴 일치). 컬럼존재성 드리프트 0건. dead code 0건(신규 export 전부 사용처 확인). `models.ts`엔 해당 테이블 인터페이스 자체가 없어(로컬 인라인 interface 사용) 타입불일치 대상 없음. 누적캐시 0건(AP/AR 정산이 매 호출 FIFO 파생, 저장형 running total 없음 — CLAUDE.md 「누적 캐시」 권장 패턴 그대로 준수).
> - **standing scan 1: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음 — cashSchedule.ts 포함 스캔 확인, #632는 SELECT 누락이 아니라 오귀속이라 이 스캔 클래스 밖).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: authMiddleware recursive 커버리지** — 무-auth 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전부 기존 정당 클래스 재확인(변동없음, 신규 cashSchedule.ts는 router-level authMiddleware 정상 적용이라 후보에 안 잡힘).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 1(내용 main에 흡수된 로컬전용 브랜치, 삭제 무해)·REVIEW 0, SKIP 1(main).
> - **standing scan 5: `npm audit --omit=dev`** — **0건**(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `f019102` 포함) 전부 `conclusion:success`, job별 typecheck·build·self-test·entity audit·local write canary·smoke 전 단계 success.
> - **open 이슈 재확인(open≠unfixed)**: 기존 #627(waste/budgets 고아 라우터)·#628(ar-helpers.ts CARRYOVER_ORDER_NUMBER_LIKE 잔존) 직접 재확인 — 둘 다 여전히 미조치 상태 확인(정상 open, fixed-in-tree 아님).
> - **backlog↔GitHub 절대값 재동기화**: open **13**(12→13, #632 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 1건(#632, cashSchedule 자동생성 PURCHASE 블록 entity_id 오귀속 — 프로젝트가 이미 문서화한 `getEntityId(c)||1` 함정의 재발), 자동수정 0건(재무 write-path + egress 검증불가로 issue-only), done-sync: open 13(12→13)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-05T21:52):**
> - **방법**: `git status`=워킹트리 clean(main, `79902ea`), `git fetch origin main`=이미 최신(로컬=origin 동일 커밋). `git fetch --unshallow`(얕은 clone 복구). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `bccb517`)**: 웹앱 범위 diff **53커밋** — Area2~6이 각자 렌즈로 이미 이 창의 대부분(구역관리 웨이브·cash-plan 신설·prices 재연결 등)을 정독 완료. Area1 고유 렌즈 = **신규 마이그레이션 14건의 (a)/(b) 드리프트 분류 + CI/smoke 실측**으로 좁힘.
> - **신규 마이그레이션 14건(`0563`~`0574`, 번호중복 2쌍 `0569`·`0570` 포함) `ADD COLUMN` 전수 스캔** — `orders.is_voucher`(0563)·`print_events.match_method`(0569)·`items.price_suggest`(0572)·`finishing_methods.pricing_type/unit_price`(0573)·`bank_accounts.include_in_cash_plan`(0574) 5건이 (b)-risk 후보(배포 코드가 명시 컬럼 SELECT/INSERT). `npm run db:bootstrap:ci`로 로컬 D1에 14건 전부 ✅ 적용 확인.
> - **prod 적용 여부 실측(smoke PASS/FAIL 대리검증, #483/#484 방식)**: 최신 배포런(`79902ea`, job 101265090828) smoke `PASS 129/129` — `bank.accounts`·`cashSchedule.overview`(0574) 200, `orders.detail`·`items.detail`·`purchaseOrders.detail`(0563/0572 인접 경로) 전부 200으로 해당 컬럼들의 prod 적용을 간접 확인. **단 `finishing_methods.pricing_type/unit_price`(0573)를 읽는 유일한 라우트 `GET /api/finishing/methods`가 smoke에 프로브 자체가 없어 드리프트가 있어도 무음**이었음(#483/#484 (b)-risk 클래스의 완전한 사각지대, `orders.is_voucher`·`print_events.match_method`는 각각 orders/print-events 기존 프로브의 목록 SELECT에 안 걸려있어 별도 확인했으나 그쪽은 명시 컬럼 SELECT가 아니라 무해 — `is_voucher`는 응답 필드 추가일 뿐 SELECT * 경로, `match_method`도 동일).
> - **자동수정 적용**: `scripts/smoke.cjs`에 `{ path: '/api/finishing/methods', name: 'finishing.methods' }` 프로브 추가(#429/#484 클래스 — 테스트 인프라 정렬, 비즈로직/스키마 무관). 검증: `node -c` 문법 · `npm run verify`(typecheck+build) clean · `npm run db:bootstrap:ci` 후 해당 쿼리를 `wrangler d1 execute --local`로 직접 실행해 SQL 문법 확인(0행, 에러 없음). 커밋 `50828e8`(`test(smoke): probe /api/finishing/methods for the 0573 column drift`) push 완료 → 다음 배포런(`50828e8`, job 101308911423) smoke **PASS 130/130**, `finishing.methods` 200 — **0573도 이미 prod 적용 확인**(오탐 없음, 이슈 생성 불요·감지기만 신설).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런(HEAD `79902ea`→`50828e8` 포함) 전부 `conclusion:success`.
> - **standing scan 1: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 1(내용이 main에 흡수된 로컬전용 브랜치, 삭제 무해)·REVIEW 0, SKIP 1(main).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm audit --omit=dev`** — **0건**(prod 청정, 변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음 — #613·#616·#617·#622·#624·#625·#626·#627·#628·#629·#630·#631 전건 일치). #624(0545/0548 드리프트)는 여전히 open — 0548(`designer_intakes.qty_unit`)은 읽기경로 부재로 이번 사이클도 대리검증 불가, owner 확인 대기 유지.
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(5개 (b)-risk 컬럼 중 4개는 기존 프로브로 이미 대리검증됐고, 유일한 사각지대(finishing.methods)는 이슈 대신 감지기 자체를 신설해 즉시 prod 적용 확인), 자동수정 1건(smoke.cjs finishing.methods 프로브 추가, 커밋 `50828e8`), done-sync: open 12(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-05T13:35):**
> - **방법**: `git status`=워킹트리 clean(main, `5d71457`), `git fetch origin main`=이미 최신(로컬=origin 동일 커밋). `git fetch --unshallow`(얕은 clone 복구). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 방법 라인 HEAD `78a8dae`)**: 웹앱 범위 diff **62커밋** — Area1~5가 이미 각자 렌즈로 이 창을 순차 정독(직전 Area5 09:05 사이클까지 `7529b10` 커버). Area5 이후 신규 커밋 **3건만**(`b84e713`·`2729bec9`·`5d71457c`) 전 영역 미정독 — Area6 신선각도로 직접 정독.
> - **신선 3커밋 직독** — ① `b84e713`(은행계좌 `include_in_cash_plan` 플래그, 0574) — prod가 자금계획 시작잔액에 마이너스통장 사용액(-4.2억)까지 합산해 90일 예측 위험일이 91/91로 상시 경보였던 걸 수정. `entityFilter` 전 쿼리 적용 확인(`bank.ts` GET/POST/PUT, `cashSchedule.ts` 신규 `getCashPlanStartBalance`), 규칙이 `utils/bankBalance.ts` 한 곳(`isInCashPlan`/`IN_CASH_PLAN`)에만 정의돼 화면 간 불일치(2026-07-17 P1) 재발 없음. ② `2729bec9`(마감 봉제 축 가격 컬럼 Phase 0, 0573) — 전 단가 0원 시작이라 금액 영향 0, `finishing_methods`는 entity_id 없는 전역 마스터라 entityFilter 불요(정상). 둘 다 로컬 픽스처/셀프테스트 자체 검증 동반. ③ `5d71457c`는 0573 번호충돌(다른 세션과 동시 착륙) 리네임뿐(코드 변경 없음). **3건 전부 결함 0건**.
> - **마이그 번호 중복 standing scan**(#438 레시피) — `0573`은 리네임으로 해소(신규 재충돌 없음), 기존 중복 9건(`0327`·`0412`·`0416`·`0420`·`0453`·`0555`·`0563`·`0569`·`0570`)은 전부 과거 사이클이 기능안전 확인한 잔존분(변동없음).
> - **컬럼-diff bridge 적용(0574 `include_in_cash_plan`)**: `scripts/smoke.cjs`가 이 컬럼을 명시 SELECT하는 두 엔드포인트(`bank.accounts`·`cashSchedule.overview`) **둘 다 이미 프로브 중**(108행·195행) — #484류 "smoke가 detail만 놓쳐 마이그 미적용을 은폐" 사각지대가 이번엔 처음부터 없음(list/overview 자체가 신규 컬럼을 참조). 별도 조치 불요.
> - **범위 축 standing scan(#616/#617 레시피) — 비-웹앱 축(LogWatcher/IllustratorAutomat/caps-worker/workers/queue) churn**: `78a8dae..HEAD`에서 **12커밋**(전부 IllustratorAutomat 배치엔진, `69655f41`~`45f5af4a`) — `grep -c`로 백로그+아카이브 전수 대조 = **어느 로그에도 언급 0건**(나열조차 안 됨, 62회차와 동일 사각지대 패턴 재현). 직접 정독 결과 이 wave가 바로 CLAUDE.md "조용한 격하"(2026-09-04 맞붙임 래스터 격하 사고)의 **사고→진단→수정 전체 시퀀스**(엔진 선택을 `placement.js` 순수모듈로 분리, 판 길이 상한 관문화, harden 격자 셀 소속 판정 등) — `npm run cut:butt`(53건)·`npm run cut:placement`(38건) 전항목 통과 재확인(이번 churn 반영 후에도 회귀 없음). `cut:smoke`는 샌드박스 Playwright chromium_headless_shell 미설치로 실행불가(환경 제약, 코드결함 아님), `cut:e2e`는 실제 일러 필요라 원천 불가 — 기존 제약과 동일. **net-new 결함 0건, 사고 대응 자체는 검증됐으나 발견 프로세스의 사각지대(범위 축)는 이번에도 재현** — #616/#617 codify 문단이 정확히 예측한 패턴이라 신규 codify 불요, 기존 레시피 유효성만 재확인.
> - **done-sync 절대값 재동기화(리터럴 쿼리)**: `search_issues(is:closed,reason:completed,label:auto-improve)` **542**(변동없음) · `not_planned`4+`duplicate`2=rejected **6**(변동없음) · `list_issues(OPEN,label:auto-improve)` **12**(변동없음, #613·#616·#617·#622·#624·#625·#626·#627·#628·#629·#630·#631 전건 일치).
> - **open≠unfixed 거울(30회차 레시피)**: 최근 커밋 메시지 전수(`git log 78a8dae..HEAD --grep`)에 열린 12개 이슈 번호 중 어느 것도 "fix #NNN"류로 등장하지 않음(백로그 자체 커밋 4건만 매치) → fixed-in-tree 후보 0건. 표본 재검증(#622, 2026-09-01 가장 오래된 미close): `shell.js` `history.replaceState` 해시 미보존 버그 코드 상 여전히 잔존(1902행, 이슈 인용 라인과 동일 로직) — 정상 open 확인.
> - **standing scan 1: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm audit --omit=dev`** — **0건**(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `5d71457` 포함) 전부 `conclusion:success`.
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 기존 「범위 축」(62회차)·「컬럼-diff bridge」(15회차)·「open≠unfixed 거울」(30회차) 세 규칙이 정확히 의도대로 작동한 실증(신규 codify 불요) — 특히 범위 축 사각지대가 62회차 이후에도 구조적으로 재발함을 재확인(다음 세션들의 churn 로그가 IA 배치엔진 wave를 여전히 나열조차 안 함).
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 0건(신선 웹앱 3커밋 전부 clean, 비-웹앱 축 12커밋도 cut:butt/cut:placement 전항목 통과 재확인해 net-new 0), 자동수정 0건(고칠 코드 없음), done-sync: open 12(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-05T09:05):**
> - **방법**: `git status`=워킹트리 clean(main, `7529b10`), `git fetch origin main`=이미 최신(로컬이 origin과 동일 커밋). `git fetch --unshallow`(얕은 clone 복구). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `8a9556a`)**: 웹앱 범위 diff **59커밋**. 그중 직전 Area4 사이클(HEAD `abc38eb`)까지는 Area1~4가 각자 렌즈로 이미 정독(prod헬스/코드품질/UX/데이터정합성) — **보안 렌즈로는 전부 미정독**이었으므로, `abc38eb..HEAD`의 **신규 11커밋**(cash-plan 신설 + prices 특약가 재연결 + cut 엔진, `df039437`~`c9a4a58`)에 전체 보안 심층, 그 이전 48커밋은 대표 XSS 표본(신규 대형 스크립트 파일)으로 좁혀 분석.
> - **신규 라우터 `cashSchedule.ts`(161줄, 신설) 전문 직독** — `cash_schedule`(entity_id 보유, `migrations/0245`)을 다루는 9개 핸들러 전수 대조: 목록/일자상세/PATCH/DELETE/complete/auto-generate **7개는 전부 `entityFilter` 적용**(형제 일관). **`POST /schedule/check-overdue`(:571) 1곳만 UPDATE·COUNT 둘 다 entity 절 없음** — 같은 파일 안에서 유일하게 컨벤션을 벗어난 형제-비대칭(#437/#452 클래스) → **이슈 등록 #631**(사전 `search_issues` 중복확인 0건). 프론트 트리거(`cashSchedule.js:446`)가 cron이 아니라 버튼이라 실제 도달 가능. 영향은 상태필드 cross-tenant write + 집계 카운트 노출(데이터 절도는 아님) — severity S, issue-only(IDOR류=owner 워크플로).
> - **`prices.ts`(+90/-대량 diff, 특약가 재연결 + 규격매칭 폴백) 직독** — 신규 `SELECT price_suggest FROM items`·`SELECT price FROM client_item_prices` 전부 바인드 파라미터, `width`/`height` 쿼리값도 `Number()` 강제 후 바인드라 SQLi 없음. `client_item_prices`·`items` 둘 다 entity_id 컬럼 부재(전역 마스터, FP클래스⑤와 동형) → entityFilter 불필요가 정상. 형제 `efSales`/`efPurchase`는 기존 그대로 유지 확인. **결함 0건**.
> - **`bank.ts`(21줄 diff)** — `applyBankTransaction`의 cash_schedule 자동-DONE UPDATE 제거(파생 계산으로 전환, 누적캐시 클래스 개선이지 보안 이슈 아님). 회귀 없음.
> - **XSS 표본 스캔(신규/재작성 대형 스크립트, escapeHtml 사용 0회 파일 우선)**: `storageZones.js`(escapeHtml 매치 0 → 헬퍼명이 `escapeAttr`라 오탐, 19개 innerHTML sink 전수 `escapeAttr` 일관 적용 확인·zone_name/description/manager_name/item_name/entity_name 전부 커버) · `cashSchedule.js`(신규 393줄, client_name/representative/description 전부 `escapeHtml`+`escapeJsAttr`(onclick 속성) 이중 적용, `schTypeLabel`은 리터럴 맵 폴백이라 FP) · `orderForm/parent.js` 신규 `refreshPriceSuggestion`(가격원천 라벨은 `textContent` 대입이라 애초 innerHTML 아님, safe) — **net-new sink 0건**.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(빈 문자열 폴백, 기존 FP, 변동없음).
> - **standing scan 2: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음, cashSchedule.ts 포함 스캔 확인).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit --omit=dev`** — **0건**(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `7529b10` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **11→12**(#631 신규 — 기존 11건 전건 일치: #613·#616·#617·#622·#624·#625·#626·#627·#628·#629·#630).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(11→12) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 1건(#631, cashSchedule check-overdue 형제-비대칭 cross-tenant write), 자동수정 0건(IDOR류=issue-only 컨벤션), done-sync: open 12(11→12)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-05T03:47):**
> - **방법**: `git status`=워킹트리 clean(main, `abc38eb`), `git fetch origin main`=이미 최신. `git fetch --unshallow`(얕은 clone 복구). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm run db:bootstrap:ci`로 로컬 D1에 baseline+전체 마이그레이션(0001~0571) 재적용 성공.
> - **churn 확인(앵커 = 직전 Area4 방법 라인 HEAD `4e5322d`)**: 웹앱 범위 diff **122커밋** — `09-03 전체 코드 리뷰 → session/fix-*` 11-worktree `fix-integration` 대형 병합(Area1/2/3/5/6이 각자 렌즈로 이미 정독) + 신규 구역관리 웨이브(Area2/3 기정독) + 그 뒤에 얹힌 **품목/가격/재고 데이터 정리 웨이브**(2026-09-04~05, 신규). **데이터정합성 렌즈는 이번이 최초 통과.**
> - **신규 마이그레이션 22건(0554~0571, 번호충돌 4쌍 포함: 0555×2·0563×2·0569×2·0570×2) 전문 직독 + `db:bootstrap:ci` 전량 ✅ 적용 확인** — 번호충돌도 wrangler가 전체 파일명으로 추적해 알파벳순 정상 적용(Area1 09-04 기존 판정과 동일 클래스, 실해 없음). 22건 전부 (a)스냅샷·백업테이블(`_bak_05xx_*`)·되돌리기 SQL 명시 (b)멱등 가드(`WHERE NOT EXISTS`/`quantity<>0`/`item_name NOT LIKE`) (c)영향면 사전 실측(`product_materials`·`bom_items`·`order_items` 등 0건 확인 후 실행) (d)CHECK 제약(`pricing_method`·`item_type`) 준수 — 위반 0건(`db:bootstrap:ci` 통과 자체가 증거). `0567`은 반대방향 불일치(RECEIVED/RECEIVED인데 수량 0인 83줄)를 **의도적으로 미수정**하고 근거를 주석에 남김 — 데이터 정합성 판단이 이미 사람 손을 거쳤음을 확인, 추가 조치 불요.
> - **신규 비-FK `*_id`/`*_into_id` 포인터 컬럼 스캔(churn-트리거 재스캔, #477/#480 클래스)**: 22개 마이그 중 `ALTER TABLE ADD COLUMN *_id` 형태 신규 참조컬럼 **0건**(`is_voucher`·`match_method`는 값 컬럼, 나머지는 기존 PK 조합 UPDATE) → 부모-삭제 dangling 후보 자체가 없음.
> - **누적 캐시(denormalized aggregate) 증분 write 전수 확인 — CLAUDE.md 최다 재발 클래스**: `git diff 4e5322d..HEAD -- src/routes`에서 `UPDATE inventory SET quantity = quantity ± ?` 6곳(inventory.ts 4·po-receive.ts 1·scan.ts 1) 전수 직독 — **전부 재고 UPDATE와 `inventory_transactions` 원장 INSERT가 같은 `c.env.DB.batch()`** 안에 있고 `balance_after`는 UPDATE 반영값을 서브쿼리로 읽음(CLAUDE.md 「원자성」 정확 준수, 커밋 자체가 "예전엔 단독 `.run()`이라 원장 INSERT가 터지면 재고만 빠졌다"를 주석으로 명시). `templates.ts`의 `clients.purchase_balance +=`도 이번 창에서 **제거**(파생 방식 `utils/supplierPayable`로 통일, 2026-08-31 14곳 제거의 마지막 1곳) — 신규 누적 캐시 write **0건**, 기존 잔재 제거 1건(코드 자체 수정, 이슈 불요).
> - **standing scan 1: CHECK IN 제약 ↔ literal write 대조** — `db:bootstrap:ci` 전체 적용 성공 자체가 22개 마이그의 CHECK 위반 0건을 입증(`pricing_method IN('FIXED','AREA')`·`item_type IN(...)`·`line_status IN(...)` 전부 통과).
> - **standing scan 2: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 4: `npm run audit:items:selftest`** — 품목중복 판정 7케이스(중복 3·정상 4) 전부 기대대로.
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **egress 제약 재확인**: `audit:items`(전체 중복탐지)·`audit:new-items`·`audit:migration-drift`는 `--remote`(prod) 전용이라 이번 사이클도 미실행(Area1이 이미 codify한 제약과 동일) — 로컬 직독 22건 전수 검증으로 대체.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 5런(HEAD `abc38eb` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **11**(변동없음 — #613·#616·#617·#622·#624·#625·#626·#627·#628·#629·#630 전건 일치) — 이번 사이클 데이터정합성 렌즈 신규 결함 0건이라 추가 이슈 없음.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 리터럴 쿼리 재실행 — done **542**(변동없음) · rejected `not_planned` 4 + `duplicate` 2 = **6**(변동없음) · open **11**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 0건(마이그 22건 전부 스냅샷·멱등가드·영향면 사전실측·CHECK준수 확인, 신규 비FK 포인터 0건, 누적캐시 증분 write 6곳 전부 batch 원자성 준수 + 잔여 1건은 코드가 이미 제거), 자동수정 0건(고칠 코드 없음), done-sync: open 11(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-04T21:49):**
> - **방법**: `git status`=워킹트리 clean, `git fetch origin main`(`207078c..6020713`, forced update) → `git checkout main && git reset --hard origin/main`(HEAD `6020713`). 얕은 clone이라 `git fetch --unshallow`로 전체 이력 복구 후 churn 대조. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `e472df1`)**: 웹앱 범위(`-- src migrations scripts .github`) diff **107커밋** — Area1/2/4/5/6이 이미 각자 렌즈로 정독한 `09-03 전체 코드 리뷰 → session/fix-* 11-worktree fix-integration` 대형 병합 + Area2가 코드품질 렌즈로 이미 통과한 **신규 구역관리 기능 웨이브**(2026-09-04, storage_zones 품목배정·inventoryCount 전체화면·zonePicker 신설 등). **UX 렌즈는 이번이 최초 통과** — `src/scripts`/`src/pages` 변경분(`e472df1..HEAD` 32커밋) 위주로 좁혀 분석.
> - **fix-integration 병합분(22커밋, `f511f08b`~`437031c2`) 커밋 메시지 자체가 UX 결함 수정**(예: "add the missing showModal helper so list ship-completion works", "wire the distribution accessory button and the VAT rate", "stop edit/copy/quote prefill from dropping line fields") — 09-03 전체리뷰가 찾은 UX 결함들이 이미 코드로 해소된 상태. 개별 재검증은 Area2가 이미 병행 수행(HIGH 6/6 fixed-in-tree) → Area3는 중복 검증 대신 **신규 구역관리 웨이브(10커밋, `30c230b9`~`6ae1f554`)**에 집중(UX 렌즈 최초 통과, Area2는 code-quality 렌즈로만 통과).
> - **구역관리 웨이브 심층 리뷰(background agent, 6개 파일 전문 Read — `zonePicker.js`/`inventoryCount.js`/`storageZones.js`/`inventoryTx.js`/`inventory.ts`/`storageZones.ts`, 총 3,282줄)**:
>   - **HIGH 발견 → #629**: `POST /api/inventory-counts/:id/add-items`(`inventoryCount.ts:693-702`)의 중복방지가 `SELECT` 조회 후 별도 `INSERT`(비원자) + `inventory_count_items`에 `(count_id,item_id)` UNIQUE 제약 없음(`migrations/0089:68-83` 인덱스만) — 직접 스키마·라우트 확인으로 재검증 완료. 트리거 버튼(`icCandApply`/`icAssignUnassigned`, `inventory.ts:770`)도 요청중 disable 없음. 창고 실사가 태블릿 터치 환경이라 더블탭 흔함 → 같은 품목이 실사 시트에 중복 행. 부수로 `submitNewCount`/`szStartZoneCount`도 버튼가드 없으나 `count_number` UNIQUE(초단위)가 1초 이내는 막아줌(단 원시 제약위반 문자열 노출) — 같은 이슈에 합쳐 기록.
>   - **MED 발견 → #630**: `szAssignInit`(`storageZones.js:608-624`) — "품목 배정" 탭 초기 구역목록 GET 실패 시 `console.warn`만 하고 `sel.options.length` 0이라 `szAssignLoad()` 자체가 호출 안 돼 **탭 전체가 무통지 빈 패널**. 목록 탭의 `noZonesMsg`(정상 빈 상태 처리)와 대조되는 갭 — 직접 코드 대조로 재검증 완료.
>   - **checked 및 clean 확인(에이전트 보고, 표본 재검증 불요 수준)**: `showConfirm` 오용 7곳 전수 확인 0건(전부 `await`/`.then`), 신규 onclick/onchange 핸들러 ~40개 전수 도달성 확인(dead button 0건, concat scope 정확), 로딩/빈상태 표시(zone picker·ledger·count-item 리스트·held-items) 전부 정상, 나머지 write 경로(saveZone/deleteZone/szAssignApply 등) 에러 토스트 정상.
> - **standing scan 1: `showConfirm` 콜백 오용 전역 재스캔**(`grep -rn "showConfirm(" src/scripts` + 2번째인자 function/화살표 패턴) — **0건**(변동없음).
> - **standing scan 2: axios→백엔드 라우트 대사(dead-button)** — 이번 사이클 자체 매처 스크립트가 서브라우터(`.route()`) prefix 미전개로 921/1004건을 가짜 unmatched 처리(SKILL #37에 이미 codify된 "서브라우터 미전개 함정" 재현) → **신뢰 불가로 폐기**, 결과 미채택. 과거 21·27회차가 이미 이 함정을 해소한 버전으로 net-new 0을 반복 확인했으므로 이번 사이클은 재구현 대신 background agent의 표적 도달성 확인(구역관리 웨이브 신규 핸들러 전수, 위 항목)으로 대체.
> - **standing scan 3: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:417`·`workbench.ts:577`).
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `6020713` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **9→11**(신규 #629·#630 추가 — 기존 9건 전건 일치).
> - **backlog↔GitHub 절대값 재동기화**: open **11**(9→11) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 2건(#629 재고실사 품목추가 더블탭 중복편입 HIGH+버튼가드 부재 부수발견, #630 구역배정 탭 무통지 빈화면 MED), 자동수정 0건(UI/UX 변경 동반이라 정책상 issue-only), done-sync: open 11(9→11)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-04T15:52):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `5f75e659`), `git fetch origin main`(이미 최신). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm run build` 성공. 얕은 clone이라 `git fetch --unshallow`로 전체 이력 복구 후 churn 대조.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `e167ec4`)**: 웹앱 범위 diff **135커밋** — `09-03 전체 코드 리뷰`(Fable 5.1) → `session/fix-*` 11-worktree `fix-integration` 대형 병합(Area5/6이 이미 09-03 정독) + 그 뒤에 얹힌 **신규 구역관리 기능 웨이브**(2026-09-04, storage_zones 품목배정·inventoryCount 권한 재배치 등 25커밋, 어느 Area도 아직 안 본 완전 신선 구간).
> - **09-03 전체 리뷰의 Area2 자체 스냅샷**(`docs/audits/2026-09-03-full-review/area2-codequality.md`, HIGH 6·MEDIUM 3·LOW 1) **fixed-in-tree 개별 재검증** — 10건 전수 소스 대조:
>   - HIGH 1(한글금액 '청'→'천' 오타, invoice.js/purchaseInvoice.js) ✅ 수정됨(`quotation.js`와 동일한 `'천'`, 주석에 사고 재발 방지 경고 추가)
>   - HIGH 2(`orders/update.ts:440` PUT이 세션법인 넘겨 담당법인 소실) ✅ 수정됨(`update.ts:464` 이 `orderEntityId` 사용, create/PUT 통일)
>   - HIGH 3(`직배` 폐기값 잔존, orderForm.ts/clients.ts) ✅ 수정됨(SSOT `deliveryMethodOptionsHtml()` 전환)
>   - HIGH 4(clients.ts 배송 필터 영문 enum 0건 매칭) ✅ 수정됨(같은 SSOT 헬퍼로 교체)
>   - HIGH 5(`dashboard.ts:508/512` 장비가동률 `print_started_at` 단독축) ✅ 수정됨(`printEventKstDay()` 적용)
>   - HIGH 6(`forecast.ts:143/147/150` `date(created_at)` UTC 버킷) ✅ 수정됨(`printEventKstDay()` 적용, 헤더에 사고 경위 주석)
>   - MEDIUM 7(유통주문서/견적서 VAT 0.1 하드코딩) ✅ 수정됨(`window.VAT_RATE` 폴백 패턴 적용)
>   - MEDIUM 8(`po-queries.ts:68` 이번달 발주금액 UTC) ✅ 수정됨(`kstDate("'start of month'")`)
>   - MEDIUM 9(`waste.ts`/`budgets.ts` 프론트 호출 0건 고아 라우터, 쓰기 포함) ❌ **미조치 확인 — 신규 이슈 #627 등록**(owner 판단 필요: 미완성기능 vs 폐기, 자동수정 금지 항목이라 issue-only)
>   - LOW 10(`models.ts` `Entity.updated_at` — DB에 없는 컬럼) ❌ **미조치 확인 → 직접 자동수정**(read-only 타입 필드 제거, 참조 0건 확인 후 `npx tsc --noEmit`·`npm run build` 통과, 커밋 `a566de7e` push 완료)
>   - **결과: HIGH 6/6·MEDIUM 2/3 fixed-in-tree, MEDIUM 1건은 이슈화, LOW 1건은 자동수정 — 이번 사이클 fix-integration 세션의 코드품질 개선을 완전히 검증**.
> - **신규 구역관리 기능 웨이브(25커밋, `storageZones.ts`·`inventoryCount.ts`·`notifications.ts`·`orders/listFilter.ts` 직독) — Area2 렌즈 최초 통과**: `storageZones.ts` 신규 3엔드포인트(`/:id/candidates`·`POST /:id/items`·`DELETE /:id/items/:itemId`) 전부 `getWriteEntityId`+`canTouchZone` 이중 가드, D1 바인드 80청크(#458 컨벤션 준수), SELECT 서브쿼리 바인드 순서 주석(`feedback-sqlite-placeholder-subquery-order` 명시 회피) 확인 — entity_id 누락·N+1·바인드초과 0건. `inventoryCount.ts` 권한 재배치(라우터 전역 `requireRole` 제거 → `canTouchZone`/`isSupervisor` 개별 게이트로 전환, 담당자 셀프승인 허용)는 **의도적 비즈니스 정책 변경**(주석에 사유·수치 명시: 실사 22건 중 18건이 승인자 부재로 SUBMITTED 정체) — 10개 엔드포인트 전수 대조 결과 게이트 없는 곳 0건(전부 `loadOwnedCount`/`canTouchZone`/`isSupervisor` 중 하나). `notifications.ts` 입고 담당 매칭이 `items.storage_zone_id`(법인공유) 단일축 → 3단 COALESCE(라인지정→같은법인기본창고→법인 default구역)로 확장된 것도 entity 경계 정확.
> - **신규 발견 — `ar-helpers.ts:171` `CARRYOVER_ORDER_NUMBER_LIKE` 형제 위치 잔존 (이슈 #628)**: `orders/listFilter.ts`의 `voucherOrderSql()`이 이번 웨이브에서 이름패턴(`ICM-%`/`%OPEN%`) 의존을 `orders.is_voucher` 플래그(마이그 `0563`)로 교체했다 — 사유는 실제 사고(`E1-ACCT-1670` 회계매출이 옛 패턴에 안 걸려 6월 매출 오염). `0563`은 `ICM-%`·`%OPEN%`·`E{1,2,3}-ACCT-%` 세 패턴 전부를 `is_voucher`로 백필했는데, `ar-helpers.ts`의 형제 상수 `CARRYOVER_ORDER_NUMBER_LIKE`는 여전히 `%OPEN%` 하나뿐 — AR 미수금 리포트의 "이월분" breakdown이 같은 클래스의 드리프트에 노출됨(단, 실제 미수금 합계 `overdue_amount`/`unpaid_total`은 이 패턴을 안 써서 영향 없음, `carryover_amount` breakdown만). `carryover`가 `is_voucher` 전체와 의미가 같은지(이관만 vs 전표 전체) 업무 판단이 필요해 issue-only.
> - **standing scan 1: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:417`·`workbench.ts:577`).
> - **standing scan 3: authMiddleware recursive 커버리지** — 무-auth 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전부 기존 정당 클래스 재확인(public 의도적+rateLimit · Map.get FP 3 · agentKeyMiddleware · hrSelf scoped-token · messagesAd는 `messages.ts:121`의 `.route('/ad', ...)` 상속+자체 `requireRole('ADMIN')` 추가 게이트, barrel 하위유형으로 신규 codify 불요).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit --omit=dev`** — 이번 사이클도 **미완료**(60초+ 무응답, Area1 09-04 사이클과 동일 증상). `package.json` diff 확인 결과 신규 devDependency 0건(추가분은 전부 `scripts` 항목, selftest 커맨드 등록뿐) → 실측 결과는 직전과 동일(0건)일 가능성 높으나 추정 금지 원칙상 미완료로 기록.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(HEAD `5f75e659` 포함) 전부 `conclusion:success`.
> - **backlog↔GitHub 절대값 재동기화**: open **9**(7→9, #627·#628 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 2건(#627 waste/budgets 고아 라우터 owner판단, #628 ar-helpers.ts 이름패턴 잔존 sibling), 자동수정 1건(`models.ts` Entity.updated_at 제거, 커밋 `a566de7e`), 09-03 전체리뷰 Area2 발견 10건 전수 재검증 완료(HIGH 6/6·MEDIUM 2/3 fixed, MEDIUM 1+LOW 1 이번 사이클로 해소), done-sync: open 9(7→9)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
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
