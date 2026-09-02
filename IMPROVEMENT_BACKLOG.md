# Improvement Backlog
<!-- last_run_area: 1 -->
<!-- last_run_at: 2026-09-02T09:47:01+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **6** (`list_issues(state:OPEN,label:auto-improve)` 실측, 5→6 — #613·#616·#617·#622·#623·#624) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **541** (`search_issues(reason:completed)` 리터럴 쿼리, 변동없음) |
| ❌ rejected | **6** (`not_planned` 4 + `duplicate` 2, 재확인 생략, 변동없음) |

> **Area 1 프로덕션 헬스 (2026-09-02T09:47):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `0fe0170`), `git fetch origin main`(`207078c..0fe0170`, forced update) → `git checkout main && git reset --hard origin/main`(HEAD `0fe0170`). `npm ci`(0→81, node_modules 0개로 시작), `npx tsc --noEmit` clean, `npm run verify`(typecheck+build) 성공.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `3ed9051`)**: 웹앱 범위(`-- src migrations scripts .github`) diff 16커밋 — 전부 Area2/4/5/6이 각자 렌즈로 이미 정독 완료(Area5: `d1de333`·`db76996`·`94a3b72`·`d1f5a9a`·`e706c55`·`b2945c4`·`14d24f4`·`1106198`·`7527a15`·`9ec2c45` / Area4: `0bf01c4` / Area2: `c4be537`·`86d3c74` / Area6: `2670f83`·`9b9f351`, `ab7efe2`는 IA JSX로 웹배포 축 밖). **프로덕션 헬스 렌즈는 다른 Area와 관점이 달라 재분석**: 마이그레이션 적용 드리프트((a)/(b) 분류, #483/#484 codify) — 다른 Area 로그 어디도 이 각도로 보지 않았음.
> - **신규 마이그레이션 8건(0545~0552) 중 (b)-risk 2건 발견 — 이미 배포된 코드가 명시 컬럼 참조**: ① `0545_agent_kit_version.sql`(`agent_heartbeats.kit_version`/`parser_type`) — `9ec2c45`가 `printEvents.ts:527-542` INSERT에서 명시 바인드, `:1011` GET에서도 명시 SELECT. ② `0548_designer_intake_qty_unit.sql`(`designer_intakes.qty_unit`) — `d1f5a9a`가 `workbench.ts:752` INSERT 컬럼 리스트에 포함, 되읽는 SELECT는 전체 코드베이스에 0건(grep 확인 — 읽기전용 감지기 구성 불가). `deploy.yml`은 여전히 코드만 자동배포하고 마이그는 원격 자동적용 안 함(`Local write canary`=로컬 부트스트랩 한정) → prod에 `db:migrate:prod` 미실행 상태면 heartbeat 갱신 전량·디자이너 접수 등록 전량이 `no such column` 500으로 무음 사망 가능. **두 write-path 다 agent/패널 트리거라 smoke(GET 전용) 사각지대 — CLAUDE.md "smoke 맹점" 1~4축과 동일 클래스의 5번째 사례**. egress 차단으로 이 세션에서 prod 직접 확인 불가.
> - **자동수정 적용(안전 — 테스트 인프라 정렬, #484 패턴)**: `scripts/smoke.cjs`에 `GET /api/print-events/agents` 프로브 추가(`kit_version`/`parser_type` 명시 SELECT라 0545 미적용 시 다음 배포 CI에서 500으로 즉시 노출, `items.detail` 프로브와 동일 형태). `node -c` 문법 확인 + `npm run verify` 통과 후 커밋. `0548`(qty_unit)은 되읽는 GET이 없어 같은 방식의 감지기 구성 불가 — issue-only.
> - **이슈 등록 → #624**(S): 위 두 마이그레이션의 (b)-risk 상세 + 이번에 추가한 smoke 감지기가 다음 배포에서 0545 적용 여부를 대리 검증한다는 점 명시. 사전 중복확인(`search_issues` 5개 쿼리, kit_version/qty_unit/db:migrate:prod/0545/0548) 결과 기존 이슈 0건(0548 매칭 1건은 `#570`으로 다른 FK 이슈, 무관 확인).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런(`0fe0170`~`a00e89b`) 전부 `conclusion:success` — 단 이 결과는 heartbeat/intake write-path를 전혀 테스트하지 않았으므로 "정상" 증거가 아니라 "미검증" 상태임을 위 이슈에 명시.
> - **egress 제약 재확인**: prod 직접 fetch 불가(기존 제약과 동일) — CI smoke가 유일한 prod 건강 근거, 이번 사이클은 그 근거 자체의 사각지대를 메우는 감지기를 추가.
> - **standing scan 1: `npm audit --omit=dev`** — 0건(prod 런타임 의존성 청정, 변동없음).
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **5→6**(신규 #624 추가 — #613·#616·#617·#622·#623·#624).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(5→6) · done **541**(변동없음) · rejected **6**(변동없음, 재확인 생략).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` 실행 예정(아래).
> - 신규 이슈 1건(#624, 0545/0548 마이그 (b)-risk 미적용 가능성 — smoke 사각지대 5번째 사례), 자동수정 1건(smoke.cjs에 printEvents.agents 프로브 추가, #484 패턴), done-sync: open 6(5→6)·done 541(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-02T03:48):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `3f25be8`), `git fetch origin main`(`207078c..3f25be8`, forced update) → `git checkout main && git reset --hard origin/main`(HEAD `3f25be8`). `npm ci`(0→81), `npx tsc --noEmit` clean. 앵커(직전 Area6 방법 라인 HEAD `a2372c2`) shallow-clone 유실(반복 함정) → `git fetch --unshallow origin main`으로 복구.
> - **웹앱 범위 churn(앵커 HEAD `a2372c2`) 22커밋 전량 대조** — 대부분 Area1~5가 각자 렌즈로 이미 개별 문단(구체 로직·라인 인용)으로 다룬 것 확인(#600 "나열 vs Read" 기준 충족). **직전 Area5 로그(HEAD `6f2dd0f`) 이후 신규 착륙 + 아직 어느 로그에도 언급 0회인 최신 2커밋만 신선 표적**: `9b9f3514`(0550, intake-config 목록 이름중복 제거 + 미연결 품목 3종 신설)·`2670f837`(0551/0552, 2026-08-08 오분류 사고 정리). 둘 다 직접 Read 정독 — 사전 계열 열거(memory `feedback-item-duplicate-before-create` 준수, "있는데 또 만들기" 재발 0), 형제 대조 근거 명시, 후속 커밋(`2670f837`)이 선행 커밋(`9b9f3514`)의 이름충돌 부작용을 스스로 감지해 정정(0552) — 자기교정 완결. `9b9f3514`가 자기 검증용 smoke 항목(`cut-panel-smoke.mjs`)까지 동반. **데이터정합성/코드품질 결함 0건**, CI(`actions_list`) 두 커밋 모두 `conclusion:success`.
> - **비-웹앱 축(LogWatcher) churn 6커밋 전량 개별 확인(62회차 codify 레시피 적용)**: `9ec2c454`·`28f2dc83`·`147b4050`·`4cd6d91c`·`630c6839`·`eb702d19` — 백로그+아카이브 grep 대조 결과 `28f2dc83`만 기언급(#616/#617 커밋 인용), 나머지 5건은 어느 로그에도 없던 최초 진입. **`28f2dc83` 직독 = fixed-in-tree 확인(「open≠unfixed 거울」, 30회차)**: #616(폴백 이중계상)·#617(센서스 무통지 절단) 둘 다 이 커밋이 코드로 해소 — `_fallbackStarts` 리스트(취소축 `_lastRipCancelAt`과 동일 클래스, 대기열 다건 대응 위해 단일→리스트로 확장) + 로그시계 기준 정리 + 하드캡 500, 센서스는 `GetFiles(AllDirectories)` → 폴더단위 walker로 교체(#617 지적 3건 전부 반영, 이슈 코멘트에 owner 자신이 항목별 확인 기록). **staleness 오판 방지**: 두 이슈 모두 OPEN이지만 owner가 코멘트에서 "장비 롤아웃 + 실기 확인 전까지 열어둡니다"를 명시 → 32회차 "close-pending 적체" 규칙 적용 대상 아님(코드 완료 ≠ 배포 완료를 owner가 이미 구분해 관리 중, 재보고·재촉구 불필요) — **이 구분을 area-6 SKILL에 신규 codify**(아래). 나머지 4커밋(`9ec2c454` 하트비트 필드 추가·`147b4050` UTF-8 인코딩 수정·`4cd6d91c` 이벤트 나이캡+2축 우아한 저하·`630c6839` 폴더 접두사 매칭)은 전부 자체 서술된 검증(리플레이/선택자기테스트)을 동반한 소규모 방어적 수정 — 직독 결과 완전성 결함 0건.
> - **standing scan: `sort-audit.cjs` 신규 P2 1건 재분류** — `workbench.ts:577`(`9b9f3514`가 만든 `SELECT DISTINCT ... ORDER BY p, m`)를 FP로 판정: DISTINCT 프로젝션이 정렬키 전 컬럼과 정확히 일치 → 동값 구간 자체가 불가능(SKILL 신규 codify, 아래). 나머지 P2 2건(`attendance.ts:158`·`dashboard.ts:417`)은 기존 FP 유지.
> - **standing scan: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan: `npm audit --omit=dev`** — 0건(prod 청정).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 30런(`c4be537`~`3f25be8`, HEAD 포함) 전부 `conclusion:success` — 이번 churn 전체가 배포경로 이상 없음.
> - **done-sync 절대값 재동기화(리터럴 쿼리, 37회차 룰)**: `search_issues(is:closed,reason:completed)` **541**(변동없음) · `reason:"not planned"` 4 + `reason:duplicate` 2 = rejected **6**(변동없음) · `list_issues(OPEN)` **5**(변동없음, #613·#616·#617·#622·#623 전건 일치).
> - **open 5건 개별 재확인(open≠unfixed, 30회차 거울)**: #613(devDependency 취약점) — owner가 08-31 코멘트로 실측 갱신(workers-types v4 핀이 마이너 패치 경로까지 막고 있음을 신규 확인, 별도 세션 권장으로 유지). #622·#623 — 09-01 신규 생성(Area3/4), 코멘트 없음, 정상 open. #616·#617 — 위 fixed-in-tree 상세 참조. **5건 전부 owner가 최신 상태를 스스로 갱신 중, Area6 추가 조치 불요**.
> - **🧬 SKILL 강화 2건(area-6-self-evolution.md)**: ① `SELECT DISTINCT` 프로젝션의 `ORDER BY`가 그 프로젝션 전 컬럼을 나열하면 sort-audit P2가 잡아도 FP(DISTINCT가 이미 행 조합을 유일하게 만듦) — `workbench.ts:577` 실증. ② 이슈 코멘트가 "검증 전까지 열어둡니다"를 명시하면 close-pending 적체(32회차) 오경보 금지 — #616/#617 실증. `line N` 잔여참조는 이번 사이클 확인 0건(이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` 실행 예정(아래).
> - 신규 이슈 0건(웹앱 신선 커밋 2건 자기교정 완결 확인·비웹앱 축 6건 전량 최초정독 완료 — 2건은 이미 owner가 코드픽스+필드검증 대기로 직접 관리 중인 fixed-in-tree, 4건은 완전성 결함 없는 방어적 수정), 자동수정 0건, done-sync: open 5(변동없음)·done 541(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-01T21:47):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `6f2dd0f`), `git fetch origin main`(`207078c..6f2dd0f`, forced update) → `git checkout main && git reset --hard origin/main`(HEAD `6f2dd0f`). `npm ci`(0→81), `npx tsc --noEmit` clean. 앵커(직전 Area5 방법 라인 HEAD `9bbf7f4`) shallow-clone 유실(기지 함정) → `git fetch --unshallow origin main`으로 전체 이력 복구 후 재시도.
> - **churn 확인(앵커 = 직전 완주 Area4 방법 라인 HEAD `4bb3627`, Area4가 이미 그 이전 전량을 각 렌즈로 소화)**: 웹앱 범위(`-- src migrations scripts .github`) diff **10커밋 전부 신규**(`d1de333`·`db76996`·`94a3b72`·`d1f5a9a`·`e706c55`·`b2945c4`·`14d24f4`·`1106198`·`7527a15`·`9ec2c45`) — 어느 Area도 아직 정독하지 않은 최초 진입 창.
> - **보안 렌즈 직독 대상 3파일(`dashboard.ts`·`printEvents.ts`·`workbench.ts`) — 신규 라우트 0건**(`grep "Router\.(get|post|put|delete|patch)\("` diff상 `+` 라인 0), 기존 핸들러 내부 쿼리·SELECT 확장만.
> - **`printEvents.ts` heartbeat 확장(`kit_version`/`parser_type`)**: `agentKeyMiddleware` 유지, 신규 2필드 전부 `?` 바인드(SQLi 0), `COALESCE(excluded.x, agent_heartbeats.x)`는 구버전 에이전트의 NULL 덮어쓰기 방지용(정합성이지 보안 아님). 날짜 로직을 `printEventKstDay()`/`printEventAt()` 헬퍼로 통일한 부분도 alias 인자가 전부 코드 리터럴(`'pe'` 등, 사용자 입력 无)이라 SQL 조립 인젝션 표면 없음.
> - **`workbench.ts` `/intake-config` 신규 3개 SELECT(`product_materials`·`items WHERE item_type='MATERIAL'`·`post_processing_options`)**: 대상 테이블 전부 `migrations/*.sql` 재확인 결과 **entity_id 컬럼 부재**(전역 마스터, FP클래스⑤와 동형 — 거래처/품목처럼 법인 무관 공유 마스터) → entityFilter 미적용이 정상, 격리 누락 아님. 라우터는 `.use('/*', authMiddleware, requireRole('ADMIN','MANAGER','DESIGNER'))`로 여전히 게이트(변경 없음).
> - **`dashboard.ts:416-417` 신규 상관 서브쿼리(장비별 대표 공정 `process_code`, `ORDER BY ep.is_primary DESC, ep.process_code ASC LIMIT 1`)**: `node scripts/sort-audit.cjs`가 P2로 신규 플래그했으나 **FP로 판정** — `equipment_processes`의 PK가 `(equipment_id, process_code)` 복합키이고 서브쿼리가 `WHERE ep.equipment_id = e.id`로 단일 장비에 스코프되므로, 마지막 정렬키 `process_code`가 이미 그 스코프 내에서 유일 → 동값 구간 자체가 발생 불가(진짜 tie-break 누락 아님). 스캔이 서브쿼리 내부의 실질적 유일성까지는 못 봐서 과대플래그.
> - **`production.js`/`intake.js` XSS sweep**: 신규 보간(`qty_unit` 조 표기 배지·`process_code` 그룹 라벨)이 `escapeHtml()` 일관 적용(기존 컨벤션 유지), free-text 미이스케이프 신규 sink 0건.
> - **신규 마이그레이션 5건(0545~0549)**: `agent_heartbeats`/`equipment_processes` 컬럼·데이터 보정, `designer_intakes.qty_unit`(표시 전용, 계산 미사용), `items.min_billing_side_cm` 단일행 UPDATE — 전부 운영 데이터·스키마 성격, 시크릿/인증/격리 표면 없음.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 2건(`attendance.ts:158` 기존 노출 유지 + `dashboard.ts:417` 신규 FP, 위 직독 참조).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit --omit=dev`** — 0건(prod 청정). 전체 `npm audit` 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신런(HEAD `6f2dd0f`) `conclusion:success`, 이번 churn 10커밋 전부 그 이전 런에서 개별 success 확인.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **5**(변동없음, #613·#616·#617·#622·#623), `search_issues(reactions:>0, state:open)` 승인 대기 미확인(이번 사이클은 신규 감사만 수행, 승인 처리 워크플로 별도 트리거 대상).
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · done **541**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(신규 churn 10커밋 전량 보안 렌즈 직독 — 신규 라우트 0·SQL 바인딩 정상·XSS sink 0·신규 SELECT 대상 테이블 전부 entity_id 부재 전역 마스터로 격리 불요 확인, sort-audit 신규 P2 1건은 복합PK 유일성으로 FP 판정), 자동수정 0건, done-sync: open 5(변동없음)·done 541(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-01T13:10):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `4bb3627`), `git fetch origin main`(`207078c..4bb3627`, forced update) → `git checkout main && git reset --hard origin/main`(HEAD `4bb3627`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 방법 라인 HEAD `49c2efc`)**: 웹앱 범위 diff 20커밋 — 그중 Area1/2/3/5/6이 이미 각자 렌즈로 정독 완료한 18건(`5dc788b`·`49fd79f`·`8ef1c6b`·`6da6a72`·`d08aeb3`·`b13a415`·`16bdcbd`·`f7454bc`·`9d37076`·`5448d50`·`86d3c74`·`c4be537`·`10ff622`·`c5f0ba6`·`8f32418`·`473e36a`·`86d709b`·`2fd81c4`·`1002274`·`6354e92`·`d51811c`, IA cut-panel 포함)를 뺀 **신규 2건**(직전 완주 Area3 사이클 HEAD `897d65e` 이후 착지) `ab7efe2`(IA JSX 자동감지 마스크, 웹배포축 밖 — Area4 렌즈 대상 아님)·`0bf01c4`(feat(intake): 패널→주문서 item_id 전달 + 대기물 법인 확정 지연) 중 데이터정합성 표면은 후자뿐.
> - **`0bf01c4` 데이터정합성 렌즈 직독(`workbench.ts`, designer_intakes 법인귀속 재설계)**: "대기(waiting)는 법인 미확정 → 흡수 시점에 주문 법인으로 확정"이라는 신규 정책이 판정축을 `status='waiting'`이 아닌 `order_item_id IS NULL`(`waitingOpenFilter`)로 둬 취소/복구 비대칭 함정을 스스로 피함 — 설계 자체는 정합. **형제-완전성 sweep**(`grep -n "designer_intakes" workbench.ts` 전수, #487 클래스 레시피): `entityFilter(c,'designer_intakes')` 잔존 2곳 중 `/intakes/stats`(874행)가 6개 형제 엔드포인트(list·thumb·absorb·void-bulk·void·restore)와 달리 **교체 누락** — 대기중 레코드가 여전히 entity_id=1(패널 미개조)에 몰려 있어 엔티티 스코프 세션(선명/청주)의 등록/대기 지표가 과소집계됨, 이 커밋이 고친 원 버그(대기함 텅 빔)와 동일 클래스가 지표 화면에 잔존. 나머지 1곳(`consumeSheetIntakes`, 99행)은 저장소 전체에서 **호출부 0건**(dead code) — 실행경로 영향 없어 severity 낮음, 이슈 본문에 참고로만 기재. `npm run audit:entity`(67/67 통과)는 필터 *존재* 유무만 검사해 이 "정책은 있으나 잘못된 필터 함수" 케이스를 놓침 — 정적 스캔의 사각 재확인.
> - **판정**: 필터 함수 교체가 표시 집계 범위(비즈니스 카운트)를 바꾸므로 자동수정 금지 대상("비즈니스 로직 변경")에 해당한다고 보수적으로 판단 → **issue-only**(#623, S). 1줄 교체(`entityFilter`→`waitingOpenFilter`) + 로컬 D1 확인이면 충분해 owner 승인 시 즉시 처리 가능.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 5런(`4bb3627`~`c97cdd8`) 전부 `conclusion:success`, `0bf01c4` 자신의 배포런(`33463966498`)도 success — 배포경로 이상 없음.
> - **standing scan: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음, 위 케이스는 이 스캔의 구조적 사각지대로 별도 기록).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **5**(4→5, 이번 사이클 신규 #623 추가 — #613·#616·#617·#622·#623), 중복 확인 사전조회 결과 기존 4건과 주제 겹침 없음.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(4→5) · done **541**(변동없음) · rejected **6**(변동없음, 재확인 생략).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조는 이번 사이클 대상 아님(직전 확인 이후 무변화).
> - **백로그 트림 체크**: `backlog:trim --check` 실행 예정(아래).
> - 신규 이슈 1건(#623, designer_intakes 대기함 법인-오픈 정책의 형제-완전성 누락 — `/intakes/stats` 1곳), 자동수정 0건(필터 정책 변경은 비즈니스 로직 영역으로 보수적 issue-only 판정), done-sync: open 5(4→5)·done 541(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-01T09:44):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `897d65e`), `git fetch origin main`(`207078c..897d65e`, forced update) → `git checkout main && git reset --hard origin/main`(HEAD `897d65e`). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm run build` 성공.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `047a1cd`)**: 웹앱 범위 diff 18커밋. 그중 UX 렌즈 실질 대상은 **`b13a415`**(재고평가/소모량/거래처귀속감사 3개 신규 화면 배선, Area3가 3회 누적 codify한 "백엔드 먼저·화면 나중" #619·#618·#606을 정확히 해소)와 **`f7454bc`**(직송 배송시간→오전/오후 슬롯 전환, orderForm/cards/shipments UI 동반) 2건. 나머지는 IA cut-panel(웹UX 렌즈 밖)·재고 원장 write-path(백엔드 전용, Area2/4/5/6 소관)·CI YAML.
> - **`b13a415` 직독**: `inventoryValuation.js`(신규 143줄) — 로딩/빈상태/에러 3상태 전부 렌더, `negative_stock_items`/`zero_valuation_items`/`note`를 총계 옆에 노출(2026-08-20 평가액 오류 수정이 만든 필드를 총계 단독 표시로 감추지 않음), escapeHtml 전수 적용, `getElementById` 신규 대상 전부 존재+널가드. 커밋 자체가 격리 서버 13-assertion 브라우저 검증 + smoke 113/113 + entity audit 67/67 보고. **UX 관점 결함 0건, 오히려 기존 지적사항 해소**.
> - **`b13a415` 커밋 메시지 내 자기보고 미해결 버그를 직접 추적 — 근본원인 확정, 영향범위 6페이지로 확장**: 메시지가 "the shell drops the URL fragment during auth restore, so /inventory#tab=count ... land on the default tab"를 언급만 하고 고치지 않음. 코드 추적 결과 — `src/layout.ts`가 `SHARED_AUTH_JS`(`shell.js`, 217행)를 페이지 전용 스크립트(266행)보다 먼저 인라인하는데, `shell.js:1805` `history.replaceState({...}, '', window.location.pathname + window.location.search)`가 DOMContentLoaded를 기다리지 않고 즉시 실행되며 URL에 해시를 안 넣어 **주소창 해시를 삭제**한다 — 이후 실행되는 각 페이지의 `DOMContentLoaded` 핸들러가 `window.location.hash`를 읽을 땐 이미 빈 문자열. `grep -rln "location.hash" src/pages`로 소비처 전수 = inventory(count/zone/tx/valuation)·activityLog·productionReports(cost/oee)·reports(forecast/financial)·settings·taxInvoices(cash/hometax/vat) **6페이지**. 새로고침·북마크·공유링크·`/inventory-count` 리다이렉트 전부 기본 탭으로 귀결. **이슈 등록** → #622(issue-only: SPA 내비 공유코드라 6페이지+뒤로가기 히스토리 회귀 확인 필요, 자동수정 정책상 제외).
> - **`f7454bc` 직독(직송 오전/오후 슬롯)**: `npm run test:delivery-slot`(67건, SSOT 쌍 `productionDeadline.ts`↔`deliverySlot.js` 상수 대조) 자체 게이트 동반, 마감일 UI 전용 가드(서버 400은 과거 오전주문 편집을 막아 의도적으로 프론트만 가드) 명시. 코드 자체는 커밋 메시지가 이미 상세 검증 — 재확인 불요.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 2: "백엔드 먼저·화면 나중"** — 이번 churn 신규 API 0건(`b13a415`는 기존 라우트에 화면만 배선) → 신규 후보 없음, 기존 3건(#606/#618/#619)은 `b13a415`로 이미 해소.
> - **CI 헬스**: `deploy.yml` 최신런(HEAD `897d65e`) `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **4**(3→4, 이번 사이클 신규 #622 추가 — #613·#616·#617·#622), `search_issues(reactions:>0, state:open)` **0건**(승인 대기 유지). 중복 확인: `search_issues("hash fragment tab replaceState location.hash dropped")` 사전 조회 0건.
> - **backlog↔GitHub 절대값 재동기화**: open **4**(3→4) · done **541**(변동없음) · rejected **6**(변동없음, 재확인 생략).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 1건(#622, 6페이지 해시 딥링크 무효화 — SPA 내비 공유코드 근본원인), 자동수정 0건, done-sync: open 4(3→4)·done 541(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-01T03:45):**
> - **방법**: `git status`=워킹트리 clean, `git fetch origin main`(`207078c..c97cdd8`, 로컬 ref가 갈라져 있어 forced update) → `git checkout main && git reset --hard origin/main`(HEAD `c97cdd8`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `8ef1c6b`, 전체 17커밋 중 직전 Area1 사이클(21:30, HEAD `3ed9051`)이 이미 정독한 15건을 뺀 신규 2건만 미언급)**: 웹앱 범위(`-- src migrations scripts .github`) 신규 diff는 **`c4be537` 1커밋뿐**(`86d3c74`는 docs만). `src/` 실질 코드 변경 **0줄** — Area2 코드품질 렌즈의 신규 표면 자체가 이번 사이클엔 없음.
> - **`c4be537`("write canary를 진짜 게이트로 만들고, 통과 못 하던 이유를 고침") 직독 — 정확히 #608(직전 Area1 사이클이 신규 발견해 open 상태였던 이슈)의 owner 자신의 수정 세션**: `.github/workflows/verify.yml`(`on:pull_request`라 이 direct-push 프로젝트에서 0회 실행)에 있던 write canary를 `deploy.yml`(매 push 실행, 실패 시 실제 배포 차단)로 이전 + entity 필터 감사(`node scripts/entity-audit.mjs`)도 동일 사유로 이전. 부가로 `migrations apply`를 0001부터 재생하면 `0344`에서 카테고리 id 환경분기(신규replay 14 vs prod 15)로 FK 위반 확정 실패하던 근본원인을 스키마 베이스라인(`#555`) 부트스트랩 후 `0475+` 증분으로 우회하는 `canary:write:ci`(`db:bootstrap:ci` + `canary:write`) 신설. **직접 검증**: `actions_list(deploy.yml)` 최신 3런(`c97cdd8`·`c4be537`·`c07ae82`) 전부 `conclusion:success` → `list_workflow_jobs(run 33395538987, HEAD c4be537)` 스텝 전개 확인 — "Entity filter audit"(22s 아님 즉시, 정상) + "Local write canary (bootstrap + items round-trip)" **26초 소요**(스킵이 아니라 실제 부트스트랩+마이그+round-trip 실행 증거) 둘 다 `conclusion:success`로 Deploy 앞에 배치 확인. **결론 = #608이 지목한 "3중 장치 중 실제 배포경로엔 전무" 상태가 실측으로 해소됨, 코드품질 관점 결함 0건**(YAML 트리거 이전 + 부트스트랩 스크립트 신설, 안티패턴 없음).
> - **owner가 직접 close 확인**: `issue_read(#608)` → `state:closed, state_reason:completed, closed_by:kyj119, closed_at:2026-08-31T13:13:17Z`(=c4be537 커밋 직후) — 이번 사이클이 추가로 close할 것 없음, 재확인만.
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정). 전체 `npm audit` 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **3**(`#613`·`#616`·`#617`만 잔존, #608 close로 4→3). `search_issues(reactions:>0, state:open)` **0건**(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **3**(4→3) · `search_issues(reason:completed)` **541**(540→541, #608 close와 일치) · rejected **6**(변동없음, 재확인 생략).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, grep 검증 완료).
> - **백로그 트림 체크**: `backlog:trim --check` 실행 예정(아래).
> - 신규 이슈 0건(이번 사이클 웹앱 src 변경 0줄 — 유일 신규 커밋은 CI 인프라 YAML이고, 그 자체가 직전 사이클 발견 #608의 owner 수정이라 CI 실측으로 해소 확인만 수행), 자동수정 0건, done-sync: open 3(4→3)·done 541(540→541)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-31T21:30):**
> - **방법**: `git status`=워킹트리 clean, `git fetch origin main`(`207078c..3ed9051`, 로컬 ref가 갈라져 있어 forced update) → `git checkout main && git reset --hard origin/main`(HEAD `3ed9051`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `24a40b1`)**: 웹앱 범위 diff 19커밋 — 이 중 직전 완주 사이클(Area6, 앵커 `a2372c2`) 이후 신규 7커밋: IA cut-panel 4건(`6354e92`·`16bdcbd`·`9d37076`·`5448d50`, 웹배포 축 밖 — 각자 `cut:smoke`/`cut:e2e` 자기증가로 자체검증, 이 렌즈 밖)과 웹앱 실질 3건(`d08aeb3`·`b13a415`·`f7454bc`)을 프로덕션 헬스 렌즈로 직독.
> - **`f7454bc`(신규 `0544_order_delivery_slot.sql`, `orders`/`quotations`에 `ADD COLUMN delivery_slot`) — Area1 codify된 "(b)-risk" 클래스 직접 대조**: 같은 커밋의 배포 코드가 `orders/queries.ts:433`·`cards/queries.ts:234,1019`·`shipments.ts:146`·`quotations.ts:592`에서 `o.delivery_slot`/`delivery_slot`을 **명시 SELECT** — 마이그레이션이 prod에 미적용 상태로 코드만 배포되면 orders/cards/shipments 목록이 전부 `no such column` 500(과거 `#483`/`#484` 사례와 동일 모양). CI 실측(`actions_list` → `list_workflow_jobs(run 33391234594)`)으로 확인: 이 커밋의 `Smoke test (production)` 스텝 `conclusion:success` — orders 목록 등 핵심 프로브가 통과했다는 것은 **마이그레이션이 이미 prod에 적용된 상태에서 코드가 배포됐음**을 의미(마이그 SQL 주석 "용준님 확인 2026-08-31"과 정합, 이번 사이클 자체가 owner 개입 세션으로 추정). **인시던트 아님, (b)-risk 정상 처리 사례로 종결**.
> - **`d08aeb3`·`b13a415` — entity 격리 4건 + 화면-없는 백엔드 3건, 둘 다 owner가 오늘 직접 손댐**: 커밋 메시지가 `#610`·`#612`·`#614`·`#621`(d08aeb3)과 `#619`·`#618`·`#606`(b13a415)을 close 명시 — 하단 open-issue 재확인에서 실측 정합(아래).
> - **CI 헬스**: `deploy.yml` 최근 30런(`207078c`~`3ed9051`) 전부 `conclusion:success`, 신규 7커밋 개별 전부 포함(`d08aeb3`·`b13a415`·`f7454bc` 각각 Typecheck·Build·Self-tests·Deploy·Smoke 전 스텝 success).
> - **egress 제약 재확인**: `curl https://webapp-9i0.pages.dev/api/orders` → `agent-proxy` 차단(exit 56), 기존 제약과 동일 — CI smoke가 유일한 prod 건강 근거.
> - **standing scan 1: `npm audit --omit=dev`** — **0건**(prod 런타임 의존성 청정). 전체(`npm audit`) 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **open 이슈 재확인(open≠unfixed) — 이번 사이클 최대 변화**: `list_issues(OPEN,label:auto-improve)` totalCount **12→4**(`#608`·`#613`·`#616`·`#617`만 잔존). 나머지 8건은 owner가 오늘(2026-08-31) 직접 종료 — `#612`·`#614`·`#621`은 `d08aeb3` 커밋으로 코드 수정 후 close, `#619`·`#618`·`#606`은 `b13a415` 커밋으로 화면 배선 후 close, `#615`·`#620`은 코드 변경 없이(재현/조사 결론) owner가 직접 close(`state_reason:completed`, `closed_by:kyj119`) — `#610`은 이번 12건 목록엔 없던 이슈로 `d08aeb3`가 별도 close.
> - **backlog↔GitHub 절대값 재동기화(Area 6 codify된 리터럴 쿼리 방법 사용)**: `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **540**(532→540, +8 = 위 open 감소분과 정확히 일치) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음). open(4)+done(540 중 auto-improve 신규분)+rejected(6) 정합 확인.
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(0건, grep 검증 완료).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 도달 → 트림 실행.
> - 신규 이슈 0건(웹앱 실질 churn 3건 중 1건은 codify된 (b)-risk 체크리스트로 CI green 확인해 인시던트 아님 종결, 나머지 2건은 owner 자신의 픽스로 이미 issue close 처리됨 — IA cut-panel 4건은 웹배포 축 밖 자체검증), 자동수정 0건, done-sync: open 4(12→4)·done 540(532→540)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-31T16:10):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `a2372c2` 직전), `git fetch origin main`(`207078c..a2372c2`) → `git checkout main && git reset --hard origin/main`(HEAD `a2372c2`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(범위 축 2종, 앵커 = 직전 Area6 방법 라인 HEAD `bddb334`)**: 웹앱 범위 diff 12커밋 — 이 중 Area1~5가 08-30~08-31 사이클에서 이미 개별 정독한 4건(`5dc788b`·`49fd79f`·`8ef1c6b`·`6da6a72`)을 뺀 **8건이 어느 Area 로그에도 언급 0회**(Area5 사이클 종료 이후 새로 착륙 — 「범위/깊이 축」62회차 사각지대와 동일 형태, 이번엔 Area 순환 텀 자체가 원인). 비-웹앱 범위(IA JSX) diff 5커밋 중 3건(`1002274`·`2fd81c4`·`d51811c`)도 미언급.
> - **미언급 8건 중 핵심 1건 정독(`86d709b`, "누적 캐시는 수정·삭제가 안 따라온다" 5축 수정, CLAUDE.md 기술 사고)**: 커밋 자신이 `test:symmetry`(신설, 17건: 주문편집거부·차입금상환델타·자동차감2종 환원·거래처잔액 파생전환·견적전환수 카운트전환) + 회귀 없음(`test:ship-stock` 20/20·`e2e-373` 15/15·`smoke` 113/113)을 본문에 정량 보고 — 마이그레이션 변경 0건(컬럼-diff bridge 대상 아님), `src/scripts/**/*.js` 변경 0건(XSS bridge 대상 아님) 확인. 로컬 게이트 재실행은 서버 기동(`dev:d1`)이 전제(CLAUDE.md 명시)라 이 세션에선 재실행 생략, 대신 **CI 실측**으로 대체 검증 — `actions_list(deploy.yml)` 최신런(#1615, HEAD `a2372c2`) `conclusion:success`(Typecheck·Build·Self-tests·Deploy·Smoke 전 스텝 완주) = 이 churn 윈도 전체가 배포경로 상 이상 없음. 나머지 7건(`473e36a`·`10ff622`·`c5f0ba6`·`8f32418`·`e332e15`·`a2372c2` 등)은 위 5축 수정의 후속 커밋(테스트 게이트화·문서 압축·핸드오프 기록)으로 동일 diff 범위 내 — 별도 정독 불요.
> - **비-웹앱 축 IA cut-panel 3커밋(`1002274`·`2fd81c4`·`d51811c`) 확인**: `5dc788b`(28회차 이전 원조 PDF-freeze 수정)의 후속 반복 정제 — 확대비율 계측 시점(embed 전→후), 회전 시 마스크 손실(rotate도 resize와 동일 결함이라 회전도 PDF 경유로 통일), 전부 각 커밋 자신이 `cut:smoke`(449→450→451, 자기증가) + 실측 좌표(예 1000%+90도 → 876.4x1240mm)로 검증 보고. `npm run audit:ia-jsx` 재실행 = 축1~5 전부 NAS 미연결로 판정 제외(변동없음, 상시 제약) — 드리프트 판정 자체는 무변화. `npm run cut:smoke` 로컬 재실행 시도는 이 샌드박스에 `chrome-headless-shell` 미설치로 실패(사전설치는 `/opt/pw-browsers/chromium`뿐) — **환경 제약이지 리포지토리 결함 아님**(3커밋 모두 자체 게이트 self-report 확인 완료, 실제 개발 PC의 playwright 풀설치에서 검증됨).
> - **backlog↔GitHub 카운트 방법 재검증(Area 3가 위임한 598 이상신호 해소)**: `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` 리터럴 쿼리 재실행 = **532**(12연속 안정값과 일치). Area 3가 관찰한 598은 자연어 시맨틱 매칭(`query` 파라미터가 "conceptual/paraphrased" 매칭이라 도구 설명 자체가 리터럴 필터 아님을 명시)의 재현 불가능한 아티팩트로 결론 — **done=532 확정**, 이상신호 해소. rejected 재실측 `not_planned` 4 + `duplicate` 2 = 6(변동없음).
> - **standing scan 1(closed≠fixed, #473 / open≠unfixed, 30회차)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치) — 12건 대상 파일(entity_id/IDOR/LIKE매칭/마이그 등)과 이번 churn(재고 수정·delete 대칭, IA cut-panel) 파일 교집합 0 → 재검증 스킵 근거 명확, close-pending 캐시 무변화.
> - **standing scan 2: 브랜치 위생(읽기전용)** — `npm run branch:clean` → SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 3: `npm audit`** — 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **CI 헬스**: `deploy.yml` 최신런(#1615, HEAD `a2372c2`) `conclusion:success` — Typecheck·Build·Self-tests·Deploy·Smoke 전부 success.
> - **🧬 SKILL 강화**: area-6-self-evolution.md에 "done 카운트 재동기화는 리터럴 `search_issues` 쿼리로만, 자연어 쿼리 결과는 신뢰 금지" 1줄 강화(§done-sync 방법론, 아래 참조). `line N` 잔여참조는 이번 사이클 대상 아님(직전 확인 0건 유지).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(웹앱 churn 12건 중 미언급 8건을 핵심 커밋 중심으로 정독 — 컬럼/XSS bridge 대상 아님, CI green으로 배포경로 검증 대체·IA cut-panel 3건은 자체 게이트 self-report로 검증·재현 불가한 샌드박스 제약 1건은 리포지토리 결함 아님으로 배제), 자동수정 0건, done-sync: open 12(변동없음)·**done 532(598 이상신호 해소, 확정)**·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-08-31T09:45):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `9bbf7f4`), `git fetch origin main`(`207078c..9bbf7f4`, 이미 최신) → `git checkout main && git reset --hard origin/main`(HEAD `9bbf7f4`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `3ec2d57`)**: 웹앱 범위(`-- src migrations scripts .github`) diff **4커밋**(`5dc788b`·`49fd79f`·`8ef1c6b`·`6da6a72`) — Area1~4·6이 이미 각자 렌즈로 정독 완료한 동일 커밋군(`6da6a72`은 Area4 자신의 주석 정정 자동수정 커밋). `5dc788b`는 IA JSX(재단 스케일링)만 건드려 보안 렌즈 밖. 나머지 3건(재고 조회/출고/환원 write-path)을 보안 렌즈로 전문 재정독.
> - **`49fd79f` CSV export 보안 직독(`inventory.ts:241` `GET /transactions/export`)**: 4개 기존 CSV 구현체 중 `utils/csv.escapeCsvField`를 사용(공용 헬퍼 재사용, 신규 5번째 구현 아님) — 렌더 루프의 14개 필드 **전부** `.map(escapeCsvField)`로 일괄 이스케이프(부분누락 0), 선행 `=`/`+`/`-`/`@` 수식주입 가드 + 숫자-세이프(`signed_quantity`/`balance_after`는 원본 숫자 유지) 확인. `requireRole('ADMIN','MANAGER')` 게이트 확인. `GET /transactions`도 `buildTxFilter`가 `entityFilter(c,'t')` + 전 조건절 바인드 파라미터(LIKE 검색 포함) + `ORDER BY t.transaction_date DESC, t.id DESC` tie-break — SQLi/정렬 규칙 위반 0.
> - **`src/scripts/inventoryTx.js` XSS sweep(자동승격 스캔 레시피 적용)**: `innerHTML` 싱크 7곳 중 데이터 보간 라인(`:81-96`)이 `item_name`·`item_code`·`category`·`zone_name`·`memo`(reason+notes)·`handled_by_name` 전부 `window.escapeHtml()` 래핑, `title` 속성 포함(같은 파일 부분누락 클래스 A-025 재발 없음). `invTxRef()`의 `reference_id`는 시스템 채번 숫자(FP 배제 대상, escape 불요) — sink 0건.
> - **`8ef1c6b` IDOR 비대칭 직독(재고 차감/환원 4개 호출부)**: `deductStockLinesOnShip`/`restoreStockLinesOnUnship` 호출 직전 소유권 검증 4곳 전수 확인 — ① `orders/queries.ts:316-324` bulk-ship이 `entityFilter(c)`로 주문 map을 선적재(타법인 주문은 map 부재→skip) ② `orders/lifecycle.ts:174-175` `/:id/status`가 `entityFilter(c,'orders')`로 order를 읽은 뒤 326행에서 SHIPPED 분기 차감 ③ `shipments.ts:1176` `/:id/status`가 `entityFilter(c)`로 shipment를 읽어 404게이트 통과 후 1187행의 bare `orderRow` 조회(같은 블록 내 이미 검증된 shipment id 파생 — FP클래스ⓐ "블록내 read-gate 선행"에 정확히 부합, IDOR 아님) ④ `shipments.ts:1332-1336` `/:orderId/ship`이 `entityFilter(c)`로 order를 읽은 뒤 1361행에서 차감. **4곳 전부 entityFilter 선행 게이트 확인, IDOR 비대칭 0건**. `entity_id` 폴백(`order.entity_id || getEntityId(c) || 1`)은 기존 157곳 관용구(Area2 기확인)라 net-new 아님.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음, 신규 `/transactions` tie-break 정상), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit`** — 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **CI 헬스**: `deploy.yml` 최근 30런 전부 `conclusion:success`(`9bbf7f4`까지 전부 green).
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues(reactions:>0)` **0건**(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · done **532**(표기 유지, Area6 재동기화 대기 — Area3 로그의 598 이상신호 아직 미해소) · rejected **6**(변동없음, 재확인 생략).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(CSV export escapeCsvField 완전 적용·XSS sweep clean·IDOR 4개 호출부 전부 entityFilter 선행 게이트 확인·SQL 바인딩/정렬 tie-break 정상, 5개 standing scan 전부 net-new 0), 자동수정 0건, done-sync: open 12(변동없음)·done 532(표기 유지)·rejected 6(변동없음). 다음 순번 **Area 6**.
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
