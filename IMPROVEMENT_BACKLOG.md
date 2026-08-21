# Improvement Backlog
<!-- last_run_area: 3 -->
<!-- last_run_at: 2026-08-21T21:46:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **11** (`list_issues(state:open,label:auto-improve)` 실측, **+1**. #606·#608·#609·#612·#613·#614·#615·#616·#617·#618·#619) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **531** (`search_issues(reason:completed,label:auto-improve)` 실측, 변동 없음) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 재확인 완료 — 변동 없음) |

> **Area 3 UX/기능 감사 (2026-08-21T21:46):**
> - **방법**: `git status`=clean, `git fetch origin main` → origin `1d6e32d`(직전 Area2 HEAD `539387f`에서 1커밋 전진) → `git checkout main`(이미 origin과 동일, `reset --hard` 불요). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area3 자신의 앵커(`287e460`) 이후 웹앱 범위 diff = 신규 커밋 1개 — `8fdf76c`(재고 base-unit rebase, Area2/4/5/6가 각자 렌즈로 이미 정독) — **UX 렌즈로는 미검토**. 커밋이 `src/routes/*`만 건드리고 `src/pages`·`src/scripts` 변경 0건이라 화면 자체의 신규 회귀는 없음 → 이번 사이클은 이 커밋이 노출한 신규 API 표면의 **프론트 도달성**에 집중.
> - **🐛 발견(신규, net-new) #619 — `/api/inventory-valuation` 전체 6개 엔드포인트 프론트 소비처 0건**: `grep -rln "inventory-valuation" src/pages src/scripts` = 0건, `menu.ts`/`sidebar.ts`에도 진입 메뉴 無(주석 포함 0). 어제(`8fdf76c`) `/report`의 재고 수량 소스 버그(평가액 463M→34M 정정)를 owner가 직접 고칠 만큼 관심 있는 기능인데, 그 결과를 볼 화면이 없음 — GET/PUT `/method`(FIFO·이동평균·표준원가 전환)·GET `/report`(평가보고서)·POST `/fifo-layer`·POST `/recalculate-avg`·GET `/price-alerts`(법인간 단가차이 경고) 전부 미배선. #606·#618과 동일 클래스 "백엔드 먼저·화면 나중" **6번째 사례**이나, 단일 엔드포인트가 아니라 **기능 세트 전체**가 고립된 첫 사례(스킬 codify 대상 후보로 관찰 유지, 아직 1회라 승격 보류). → **Issue #619** 등록(improvement, M).
> - **standing scan**: 이번 churn이 `src/scripts`/`src/pages` 변경을 동반하지 않아 HTML↔JS silent-fail·axios→라우트 매처·showConfirm 오용·delete confirm 커버리지·더블클릭 중복제출 스캔은 신규 표면 없음(전부 이전 사이클 net-new 0 유지, 재확인 스킵 — 대상 파일 자체가 변경 안 됨).
> - **open 11건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614·#615·#616·#617·#618(전건 변동없음, 신규 코멘트 없음, 리액션 0)+**#619 신규**.
> - **backlog↔GitHub 절대값 재동기화**: open **11**(+1) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md는 이번 사이클 담당 파일이라 훑었으나 이미 서술 참조 전환 완료 상태(`line N` 잔여 0, 재계산 없음). "백엔드 먼저·화면 나중" 기존 codify 레시피(2026-08-07, 3회 누적 관찰 후 standing scan 승격)가 "기능 세트 전체 고립" 변종에도 그대로 적중 — 새 오탐/탐지 클래스 도출 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 13건 도달, `npm run backlog:trim` 실행 예정(이 로그 저장 직후).
> - 신규 이슈 1건(#619, 재고평가 기능 세트 전체 미연결), 자동수정 0건, done-sync: open 11(+1)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-21T15:45):**
> - **방법**: `git status`=clean, `git fetch origin main` → origin `539387f`(직전 Area1 HEAD와 동일) → 이미 그 커밋에 체크아웃돼 있어 `reset --hard` 불요. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area2 자신의 앵커(`c776983`) 이후 웹앱 범위 diff = 신규 커밋 1개 — `8fdf76c`(재고 base-unit rebase). Area4(데이터정합성)·Area5(보안)·Area6(사각지대)·Area1(라이브검증)이 각자 렌즈로 이미 정독했으나 **코드품질 렌즈(entity_id·N+1·authMiddleware·dead code·도달성)로는 미검토** → 직접 diff 정독(`inventoryCount.ts` GET /consumption 192줄, `inventoryValuation.ts` 평가 소스 교체).
> - **`inventoryCount.ts` GET /consumption 정독**: `entityFilter(c,'ic')`/`entityFilter(c,'po')` 양쪽 적용(Area5 재확인과 일치), IN절 회차수 ≤60 캡 안전, 정렬 tie-break(`count_date ASC, id ASC`) 준수, 루프는 전부 사전 로드한 배열 위 메모리 연산(N+1 아님), dead code 없음.
> - **🐛 발견(신규, net-new) #618 — 신규 엔드포인트 프론트 소비처 0건**: `grep -rn "inventory-counts/consumption" src/scripts src/pages` = 0건. `scripts/smoke.cjs`엔 프로브가 있어 200 응답은 확인되나(라우트 자체는 정상), 화면 배선이 없어 실사용자는 이 소모량 분석(기초+매입-기말, 구간 집계, 중복매입/음수소모 검출까지 구현된 상당히 정교한 로직)을 볼 수 없음 — #606(entity-attribution-audit)과 동일 클래스 "백엔드 먼저·화면 나중" **5번째 사례**. 커밋 메시지에 화면 미연결 의도가 명시되지 않아 owner 판단 필요(분석전용 의도라면 즉시 close 가능) → **Issue #618** 등록(improvement, S).
> - **standing scan**: ① `npm run audit:entity` 131파일·61쿼리·**누락 0**(변동없음). ② `node scripts/sort-audit.cjs` P1 **0건**(변동없음). ③ authMiddleware recursive 재스캔 = 무-auth 7개 파일(기존과 동일 목록, 전부 기존 정당 클래스: barrel/hrSelf scoped/webhooks empty/helpers Map.get FP), 신규 매치 0. ④ `npm audit` 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치 net-new 0.
> - **open 10건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614·#615·#616·#617(전건 변동없음, 신규 코멘트 없음)+**#618 신규**.
> - **backlog↔GitHub 절대값 재동기화**: open **10**(+1) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md는 이미 `line N` 잔여참조 0건(재확인, 서술식 각주만 존재). 이번 사이클은 실제 미검토 churn 1건을 코드품질 렌즈(entity_id/N+1/authMiddleware/도달성)로 직접 정독했고, 기존 codify된 도달성 레시피(#334)로 신규 엔드포인트의 dead-code 후보를 정확히 격리 — 새 오탐/탐지 클래스 도출 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 1건(#618, 소모량 API 프론트 미연결), 자동수정 0건, done-sync: open 10(+1)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-21T09:10):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → origin `966877e`(직전 Area6 HEAD와 동일, shallow-fetch "forced update" 표기는 `git rev-parse --is-shallow-repository`=true로 재확인, 회귀 아님) → `git checkout main && git reset --hard origin/main`(HEAD `966877e`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **CI 헬스**: `deploy.yml` 최근 30런 전부 `conclusion:success` 1건(`a07a5b24`)만 `cancelled`(후속 푸시 동시성 취소, 실패 아님) — 최신런(`966877e`, Area6 자체 커밋) success. `backup.yml` 최근 10런(08-11~08-20) 전부 success. `verify.yml` 여전히 `total_count:0`(#608 기보고와 일치, net-new 아님).
> - **churn 확인**: 직전 Area1 자신의 앵커(`f3bc6bf`) 이후 웹앱 범위 diff = 신규 커밋 2개 — `dc7a34e`(reports 탭 제거, Area2/3가 이미 정독)·`8fdf76c`(재고 rebase, Area2/4/5가 이미 정독하고 #615 등록) — Area1 고유 관심사(신규 마이그레이션 유무)만 재확인: `git log f3bc6bf..HEAD -- migrations` = **0건**(0540이 직전 사이클 마지막 마이그, 이번 churn 2건 모두 스키마 변경 없음) → smoke drift 신규 (b)-risk 없음.
> - **prod↔main 디버전스 standing scan(#422)**: `search_issues(label:auto-improve,state:closed)` **537**(=done 531+rejected 6, 절대값 일치) — 최근 close는 08-10(#601~#607/#611) 이후 신규 close 0건, 재검증 대상 없음(캐시 유지 타당).
> - **open 9건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614·#615·#616·#617(전건 변동없음, 신규 코멘트 없음, 리액션 0).
> - **backlog↔GitHub 절대값 재동기화**: open **9**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md는 이번 사이클 담당 파일이라 훑었으나 이미 서술 참조 전환 완료 상태(재계산 없음). 이번 사이클은 CI 전량 green + 신규 마이그 0건의 조용한 사이클 — 새 오탐/탐지 클래스 도출 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건, 자동수정 0건, done-sync: open 9(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-20T23:55):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → origin `8ad218d`(직전 Area5 HEAD, shallow-fetch "forced update" 표기는 `git rev-parse --is-shallow-repository`=true로 재확인, 회귀 아님) → `git checkout main && git reset --hard origin/main`(HEAD `8ad218d`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **🗺️ 범위-축 사각지대 발견 및 codify(#616/#617, 62회차)**: #600(깊이 축)의 앞단 = 6영역 전부의 churn 스캔이 `git log -- src migrations scripts .github`(웹앱 범위)라 **`LogWatcher/`·`IllustratorAutomat/` 등 손배포 런타임 축이 목록에조차 안 오른다**. 2026-08-19 LogWatcher 커밋 5건(`592b909` C# 파서 473줄 신규 + `169340e`·`4a3c231`·`efc3ca1`·`48d8995` 키트)을 `grep -c` 로 백로그+아카이브 전수 대조 = **어느 로그에도 해시 언급 0건**(나열조차 없음) → Area6가 직접 정독.
> - **🐛 발견(신규, net-new) #616 — `TnsPrintExpParser.cs` 인쇄실적 이중계상**: 립 시작에서 `rip_fallback_hours`(기본 6h) 초과 후 인쇄 시작된 작업은 (a)안전망이 립 기준으로 **폴백 송출** 후 `_rips`에서 제거 → (b)뒤늦게 도착한 결과가 후보 립 없어 `MatchResults`에서 **UNMATCHED로 또 송출** = PRINT 이벤트 2건. 같은 클래스 이중계상을 **취소 경로에서는 `_lastRipCancelAt`(±5분)으로 이미 억제**하는데 OK 폴백 경로엔 대응 억제 상태 부재(형제 비대칭, `grep` 확인=억제필드는 `_lastRipCancelAt` 하나뿐). 발동 조건=대기열 길이라 바쁜 날일수록 잦음. **자동수정 안 함**(파서 비즈로직 + 샌드박스에 dotnet 빌드/리플레이 수단 없음) → **Issue #616**(bug, S).
> - **🐛 발견(신규, net-new) #617 — `kit.ps1 Invoke-HabitatCensus` 조용한 목록 실패**: 센서스의 존재 목적이 "보이지 않는 로그 찾기"인데 `GetFiles(root,"*",AllDirectories)`가 (1) PS 5.1(.NET Framework, `START.bat`=`powershell -File`)에서 하위폴더 **접근거부 1회에 열거 전체 중단** → ACL 섞인 루트③(AppData/ProgramData)은 로그 있어도 `(열람 실패)` 1줄로 파일0건 기록 (2) `Select-Object -First 4000` **무통지 절단** + `GetFiles` 반환순=디렉터리 순(mtime 아님)이라 최신 로그가 잘릴 수 있음 → 기사가 "로그 없음" 오판·재방문(도구가 없애려던 바로 그 재방문). (3) 대형파일 분기 `rec|history` 무앵커 부분매칭+noise필터 누락으로 `.exe`/`.cab` 오수거. **자동수정 안 함**(kit=수동배포축, CI 미커버, 샌드박스에 PS 실행수단 없음, IA JSX와 동일취급) → **Issue #617**(bug, S).
> - **🧬 SKILL 강화**: area-6-self-evolution.md에 **「churn 스캔 범위-축 사각지대」레시피 codify**(62회차) — `git log <anchor>..HEAD -- LogWatcher IllustratorAutomat caps-worker workers queue`로 비-웹앱 축 churn 별도추출 → `grep -c "<hash>"` 백로그대조로 미언급 커밋 우선정독, 축별 렌즈(C#=이벤트 중복/유실, PS키트=무통지절단, JSX=IA 5축 드리프트), 전부 issue-only(CI·샌드박스 미커버). `npm run audit:skills` OK(스킬목록 2,360자, area-6 `line N` 잔여 0). area-1의 `line N` 3건은 이번 사이클 담당 파일 아니라 미조치(규칙 준수).
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **open≠unfixed 재확인**: 이번 사이클 churn(LogWatcher 5건)은 open 7건이 지목한 파일과 무관 → 캐시 유지. `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614·#615(전건 변동없음)+**#616·#617 신규**.
> - **backlog↔GitHub 절대값 재동기화**: open **9**(+2) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음). 마이그 번호 중복 standing scan = 기존 5쌍(0327·0412·0416·0420·0453)만, net-new 0.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 2건(#616 파서 이중계상·#617 센서스 조용한실패), 자동수정 0건, done-sync: open 9(+2)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-08-20T20:10):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → origin `23785b6`(직전 Area4 HEAD와 동일, shallow-fetch "forced update" 표기는 `git rev-parse --is-shallow-repository`=true로 재확인, 회귀 아님) → `git checkout main && git reset --hard origin/main`(HEAD `23785b6`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area5 자신의 앵커(`b6d9305`) 이후 웹앱 범위 diff = 신규 커밋 9개 — `a6beebe`/`68c2b60`/`7671499`/`bb56815`/`23dbe6e`는 이전 Area5 사이클에서 이미 보안 렌즈로 정독 완료. **미검토 5건** `8fdf76c`(재고 base-unit rebase+소모량API+평가소스 수정)·`64d236c`(재고실사 2칸입력, 0540)·`3b4827a`(카드 슬라이드 race/pinch 가드)·`ddf0108`(카드 슬라이드 내비 신규 라우트)·`a22fb42`(주문서 후가공요약+pack-search)·`3bd431c`(대표자 개인통장 분리)·`619535b`(카드 마감일 데이터정정)·`771e8db`(마감표기 통합) 중 보안 렌즈 미검토분을 직접 정독(3bd431c/771e8db/619535b은 Area6가, a22fb42/ddf0108은 Area2가 authMiddleware·entityFilter·escapeHtml을 이미 확인했으나 재확인 겸 XSS/SQLi 관점 추가 점검).
> - **`ddf0108`+`3b4827a`(카드 슬라이드 내비, `GET /cards/:id/neighbors`) 보안 정독**: `cardEntityFilter(c,'c')` 양쪽 쿼리(현재카드+큐 목록) 적용 확인(Area2 재확인). 프론트 `onclick="cdSlide(' + neighbors.prev_id + ')"` — `prev_id`/`next_id`는 서버 `cards.id`(SQLite 정수 PK)에서 온 숫자값이라 JSON 직렬화 시 항상 number, 문자열 이스케이프 탈출 불가(XSS 무관). `esc(stLabel)` 등 신규 텍스트 노드는 escapeHtml 적용 확인. Clean.
> - **`64d236c`(재고실사 2칸입력) 보안 정독**: `inventoryCount.ts` `POST /`·`PUT /:id/items` 신규/변경 SQL 전건 `?` 바인딩(문자열 결합 0), `numOrNull()` 헬퍼로 입력값 `Number()` 강제 후 바인드(주입 불가). `PUT /:id/items`는 mutate 직전 같은 블록에 `SELECT ... WHERE id=?${entityFilter.clause}` read-gate 확인(#481 "블록내 read-gate" 패턴 충족, IDOR 안전). 프론트 `packVal`/`perPack`은 품목 수량(숫자)이라 미이스케이프 정상(FP클래스 — 숫자/치수는 비-free-text).
> - **`8fdf76c` 신규 `GET /inventory-counts/consumption` 보안 정독**: 라우터 상속 `authMiddleware, requireRole('ADMIN','MANAGER')` 확인, 등록 순서 `/consumption`이 `/:id`보다 먼저(주석 명시·실제 소스 순서 일치 재확인) — 섀도잉 없음. 전 쿼리(회차 목록·라인 조회·매입 조회) `?` 바인딩, `IN (${ids.map(()=>'?').join(',')})`는 파라미터 개수만큼 플레이스홀더 생성(값 삽입 아님, 안전), 회차수 `LIMIT 60` 캡으로 바인드 폭주 방지. `entityFilter(c,'ic')`+`entityFilter(c,'po')` 양쪽 적용. SQLi/IDOR 관점 추가 확인 완료, clean(Area4가 이미 데이터정합성 렌즈로 확인한 것과 別 렌즈로 재검증).
> - **`8fdf76c` `inventoryValuation.ts /report` 보안 정독**: `entityFilter(c)` 결과(`ef.clause`/`ef.params`)를 서브쿼리(`stockSub`)에 문자열 삽입하는 형태이나, 이는 프로젝트 전역 확립된 `entityFilter()` 헬퍼 패턴(clause는 " AND entity_id = ?"류 정적 문자열, 실제 값은 별도 `?` 바인드)이라 사용자 입력 직결 아님 — 주입 불가. 라우터 전역 `authMiddleware` 상속 확인.
> - **standing scan**: ① 시크릿 폴백 `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음). ② 기본 비밀번호 리터럴 grep → 0건. ③ CI yml secrets fallback → 0건. ④ 미청크 동적 IN절(`IN \(\$\{`) → 신규 churn 포함 0건(`8fdf76c`의 IN절은 위에서 확인한 안전 패턴).
> - **npm audit 재확인**: `npm ci` 후 11건(1 moderate·8 high·2 critical) — #613 기보고와 완전 일치, net-new 0.
> - **open 7건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614·#615(전건 변동없음, 신규 코멘트 없음). 7건 전부 `+1` 리액션 0(승인 대기).
> - **backlog↔GitHub 절대값 재동기화**: open **7**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md는 이미 `line N` 잔여참조 0건(재확인). 이번 사이클은 실제 미검토 churn 5건(신규 라우트 2개 포함)을 SQLi/IDOR/XSS 3축으로 직접 정독했고, 전부 기존 codify된 레시피(entityFilter·block내 read-gate·숫자값 비-free-text FP·`entityFilter()` 헬퍼 clause 안전패턴)로 clean 판정 — 새 오탐/탐지 클래스 도출 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 8건 → 이번 로그 추가 후 9건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(churn 5건 직접 정독, 전부 clean), 자동수정 0건, done-sync: open 7(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-20T15:46):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → **origin이 `de31dbf..8fdf76c`로 전진**(shallow-fetch 경계 이동, `git rev-parse --is-shallow-repository`=true로 재확인, 회귀 아님) → `git checkout main && git reset --hard origin/main`(HEAD `8fdf76c`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area4 자신의 앵커(`23dbe6e`) 이후 웹앱 범위 diff = 신규 커밋 9개 — `dc7a34e`/`64d236c`/`3b4827a`/`ddf0108`/`a22fb42`/`3bd431c`/`619535b`/`771e8db`는 Area2/3/6가 각자 렌즈로 이미 정독, **데이터 정합성 렌즈로 미검토** `8fdf76c`(재고 base-unit rebase + 소모량 API + 평가 소스 수정, 오늘 owner 세션)를 직접 정독.
> - **🐛 발견(신규, net-new) — `8fdf76c` "188품목 rebase"가 재현 불가능한 형태로 prod 적용**: 커밋 메시지가 "Rebased 188 items: qty x pack_size, cost / pack_size"를 명시하나, `git show 8fdf76c --stat`에 그 보정을 수행한 스크립트/SQL이 **없음**(diff는 `inventoryCount.ts`(소모량 API)·`inventoryValuation.ts`(평가소스)·문서·대출 3건 보정뿐). 같은 커밋 안의 대출 보정 3건은 `docs/analysis/2026-08-19-loans-*.sql`로 실행명령+멱등가드까지 커밋했고, 프로젝트는 `migrations/0527/0529/0530/0531/0536/0537`처럼 **일회성 데이터 보정을 번호 매긴 마이그레이션으로 추적**해온 확립된 관행이 있는데(0536/0537 재검증: 순수 UPDATE도 전부 커밋됨), 재고 188품목 rebase만 이 관행 밖. 재해복구/스테이징을 `migrations/*.sql` 순차재생으로 구성하면 이 rebase가 자동 유실되고, 대상 필드(`items.avg_unit_cost`·재고수량)가 평가액에 직결 — 이 커밋 자체가 고치려던 "8/07 실사 4.6억 오류"와 동일 클래스 재발 소지. **자동수정 안 함**(사후 스크립트 재구성=owner만 정확한 대상 188건과 before/after를 안다) → **Issue #615** 등록(bug, S).
> - **`8fdf76c` 신규 라우트 `GET /inventory-counts/consumption` 정독**: `entityFilter(c,'ic')`/`entityFilter(c,'po')` 양쪽 적용, 정렬 `count_date ASC, id ASC`(tie-break 준수), IN절 회차수 ≤60 캡으로 바인드 안전, 양끝 미입력 품목은 집계 제외(0-fill로 인한 허위 소모 방지) + `skipped_item_periods`/`duplicate_purchase_lines`/`negative_consumption_items` flags로 신뢰도 명시. Clean.
> - **`8fdf76c` `inventoryValuation.ts` 소스 교체 정독**: 기존 `inventory_transactions` 누적(prod 65행, ADJUST를 출고로 오변환)에서 `inventory`(정본, 타 경로와 통일) 전환 + `is_purchase_item=1` 필터 제거(재고 있으면 평가대상) + `quantity>0`→`<>0`(음수재고 은폐 방지, `negative_stock_items`로 노출) + 정렬 tie-break(`i.id`) 추가. 방향 자체는 타당(#609 클래스와 무관, 집계 소스 통일).
> - **standing scan**: `npm run audit:entity` 131파일·61쿼리·**누락 0**(변동없음). `node scripts/sort-audit.cjs` P1 **0건**(변동없음). 신규 마이그 0533~0540 재검토(NOT NULL DEFAULT·되돌리기 문구·멱등가드 전건 보유) — 0539 `bank_accounts.is_personal INTEGER NOT NULL DEFAULT 0`처럼 신규 컬럼 전부 안전한 additive, net-new 스키마 위반 0. #614(0532 FK 누락)와 별개 net-new 없음.
> - **open 7건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614(변동없음)+**#615 신규**.
> - **backlog↔GitHub 절대값 재동기화**: open **7**(+1) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md는 이미 `line N` 잔여참조 0건(재확인). 이번 사이클 신규 오탐/탐지 클래스 없음(#487류 "재현 불가능한 prod 데이터 보정" 자체는 신규 클래스 후보이나, 이미 「일회성 데이터 보정 = migrations 또는 docs/analysis/*.sql로 추적」이라는 확립된 프로젝트 관행과의 단순 대조로 발견 가능했음 — 별도 정적탐지 레시피 없이도 "커밋 메시지가 데이터값 보정을 언급하는데 그 산출물이 diff에 없다"는 체크 자체가 일반적이라 별도 codify 불요, 다음 사이클에 유사 사례 재발 시 재평가).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 13건 도달, `npm run backlog:trim` 실행 예정(이 로그 저장 직후).
> - 신규 이슈 1건(#615, 재고 rebase 미추적), 자동수정 0건, done-sync: open 7(+1)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-20T09:44):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → **origin이 `de31dbf..287e460`로 전진**(shallow-fetch 경계 이동, `git rev-parse --is-shallow-repository`=true로 재확인, 회귀 아님) → `git checkout main && git reset --hard origin/main`(HEAD `287e460`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area3 자신의 앵커(`68c2b60`) 이후 웹앱 범위 diff = 신규 커밋 11개 — `7671499`/`bb56815`/`23dbe6e`/`3bd431c`/`619535b`/`771e8db`는 Area2/4/5/6가 각자 렌즈로 이미 정독, **UX 렌즈로 미검토** `dc7a34e`(reports 경영진단 탭 제거)·`64d236c`(재고실사 2칸입력)·`3b4827a`(카드 슬라이드 race/pinch 가드)·`ddf0108`(카드 슬라이드 내비 신규)·`a22fb42`(주문서 후가공요약 상시노출+pack 검색화) 5건을 UX 렌즈로 직접 정독.
> - **`ddf0108`+`3b4827a`(카드 슬라이드 내비, #26) 정독**: neighbors fetch 실패 시 `.catch(()=>null)` 폴백으로 화면은 항상 뜸(에러로 죽지 않음) · 로딩 중 `cdRoot.style.opacity='0.4'` 디밍 표시 · 터치 스와이프가 가로스크롤 다품목 표 안에서 시작하면 무시(스크롤 충돌 방지) · 키보드 화살표가 input/textarea/select/contentEditable 포커스 중엔 무시(폼 입력 방해 안 함) · 뒤로가기 `pushState({spaUrl})`로 shell.js popstate 복원 · 후속 커밋(`3b4827a`)이 race guard(구식 응답 폐기)·pinch guard·prefetch까지 자체 보강 — UX 체크리스트(빈 상태/에러메시지/로딩표시/모바일) 전항목 충족, 발견 없음.
> - **`64d236c`(재고실사 2칸입력) 정독**: `pack_count`/`per_pack_qty` 두 칸 입력이 같은 파일(`icRenderItems`) 내에서 자체 렌더하는 `icCalc<id>` id라 cross-file silent-fail 아님(기존 FP클래스 (b)) · 계산은 서버가 수행(클라 곱셈 없음, 반올림/단위 판단 이원화 방지 설계 명시) · `updateItemPack` 실패 시 `alert()`로 사용자에게 즉시 통지. 발견 없음.
> - **`a22fb42`(pack 수동입력→검색 경유) 정독**: 빈 결과 시 "일치하는 주문이 없습니다" 토스트(빈 상태 처리) · 검색 실패 시 서버 에러 메시지 그대로 토스트 · 후보 목록에 거래처/납품일/라인수/출고여부 배지로 오선택 방지 · `escapeHtml` 전건 적용. 발견 없음.
> - **🔍 조사 후 기각 — `dc7a34e`(reports 경영진단 탭 제거) 후 `/management-report` 완전 고아화**: 탭 제거로 `/reports` 진입경로가 사라졌는데, `grep -rn "management-report" src/`로 확인하니 사이드바 메뉴(`menu.ts:76-78`)도 이미 **2026-07-18에 "손익허브 통합, /reports 탭으로 흡수" 사유로 주석처리**돼 있어 이번 커밋 이후 `/management-report`는 **URL 직접 입력 외 진입경로 0**(고아 페이지). 그러나 커밋 메시지 자체가 "Standalone /management-report page kept (direct URL access)"로 **의도를 명시**(백엔드-먼저-화면-나중 실수형 갭이 아니라 owner의 명시적 유지 결정) — Area 3 기존 FP 배제 기준("커밋 메시지에 명시된 의도")에 해당, 이슈 미등록.
> - **standing scan**: ① HTML↔JS silent-fail — 이번 churn 신규 id(`icCalc<id>`/`packResults`) 전부 동일파일 자체렌더, cross-file 갭 0. ② axios→라우트 존재성 — 신규 churn의 axios 신규호출 5건(`/cards/:id/neighbors`·`/inventory-counts/:id/items` PUT·`/settings/data-completeness`·`/items/:id`·`/shipments/pack-search`) 전부 라우터 파일에 실재 확인(뒤 2건은 `7671499` 소속, Area5가 이미 확인), dead button 0. ③ 「백엔드 먼저·화면 나중」 — 이번 churn 5건 모두 라우트+화면 동반 커밋(반대 사례 없음), candidate 0. ④ 더블클릭 중복제출 — `updateItemPack`(inventoryCount)·`packChooseResult`(pack)은 onchange/onclick 즉시 단발 액션(모달 재진입 아님, 파괴적 write 아닌 단일필드 갱신)이라 기존 판정기준(파괴적/금전/재고 write만 우선순위) 미해당, candidate 0.
> - **open 6건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614(전건 변동없음, 신규 코멘트 없음).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` **4**(재확인) → rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md는 이미 `line N` 잔여참조 0건(재확인). 이번 사이클은 실제 churn 5건을 UX 렌즈로 직접 정독했고, 전부 기존 codify된 체크리스트(빈 상태/로딩표시/에러메시지/모바일 스와이프-스크롤 충돌 회피/키보드 접근성)를 충족하는 고품질 구현 — 유일 조사 대상(`dc7a34e` 고아화)도 기존 "커밋 메시지 명시 의도" FP 기준으로 명확히 해소. 새 오탐/탐지 클래스 도출 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(churn 5건 직접 정독, 전부 clean + 고아화 조사 1건은 의도적 설계로 기각), 자동수정 0건, done-sync: open 6(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-20T03:50):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → **origin이 `de31dbf..c776983`로 전진**(shallow-fetch 경계 이동, 기존과 동일 아티팩트) → `git checkout main && git reset --hard origin/main`(HEAD `c776983`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area2 자신의 앵커(`a6beebe`) 이후 웹앱 범위 diff = 신규 커밋 12개 — `68c2b60`/`7671499`/`bb56815`/`23dbe6e`/`3bd431c`/`619535b`/`771e8db`(Area3~6가 각자 렌즈로 이미 정독) 제외, **미검토 5건** `64d236c`(재고실사 2칸입력, 0540)·`3b4827a`(카드 슬라이드 가드)·`ddf0108`(작업지시서 슬라이드 신규 라우트)·`a22fb42`(마감/펀칭 재정의+pack-search 신규 라우트+데드코드 제거)·`dc7a34e`(reports 탭 제거) — 5건 전부 코드품질 렌즈로 직접 diff 정독.
> - **`ddf0108` 신규 라우트 `GET /cards/:id/neighbors`**: `cardsQueriesRouter.use('/*', authMiddleware, requireAnyPagePermission(...))` 상속 확인, `cardEntityFilter(c,'c')` 양쪽 쿼리(현재카드 조회+순회 목록) 적용, id-tie-break(`c.id DESC`) 준수, N+1 없음(단일 SELECT로 큐 전체 id 로드 후 메모리 indexOf). Clean.
> - **`a22fb42` 신규 라우트 `GET /shipments/pack-search`**: `shipmentsRouter.use('/*', authMiddleware, ...)` 상속 + `entityFilter(c,'o')` 적용, `/:id`(라인 771)보다 먼저 등록해 라우트 섀도잉 회피(주석 명시), `LIMIT 11`+길이상한(40자)으로 바인드 폭주 방지, LIKE 대신 `instr()`(D1 LIKE 50바이트 제한 회피, 기존 컨벤션). 프론트 `pack.js`도 `order_number`/`client_name`/`entity_name` 전건 `escapeHtml()` 적용. Clean.
> - **`a22fb42` 데드코드 제거(create.ts D블록+helpers.enqueueAutoProcessJobsForItems+AP_MARGIN_RULES)**: `grep -rn "enqueueAutoProcessJobsForItems\|AP_MARGIN_RULES\|AP_SCALE_RULES" src` = 주석 참조만 남고 호출부 0건(전수 제거 확인, #377류 "부분 픽스 잔존" 아님). 관리자 UI `reports.ts` 탭 제거(`dc7a34e`)도 standalone `/management-report` 라우트·메뉴 링크 존속 확인(orphan 아님).
> - **🔍 Area 1 인계 사안 판정 — `inventoryCount.ts` `packCount*perPack`은 #609와 별개 클래스**: `unitConvert.ts toBase(unitQty,item)`는 **items.pack_size(품목당 고정 계수)**로 관리단위→base 환산하는 유틸인데, 신규 `PUT /:id/items`의 `per_pack_qty`는 실사 라인마다 **손으로 개별 조정 가능한 스냅샷값**(현수막 원단 롤당 112~135yd 편차를 담기 위한 설계, 마이그 주석에 명시) — `toBase()`를 썼다면 이 라인별 보정을 무시하고 매번 `items.pack_size`(고정값)로 되돌아가 **오히려 틀린 계산**이 된다. 기존 codify된 「#462 형제완전성」 FP 배제 조건인 "스냅샷 컬럼은 의도적 보존(MU5, `inventory_receipt_items.quantity`류)"과 동일 클래스 — #609(고정계수 인라인 재구현 3곳)와 무관, 조치 불요. GitHub 코멘트 갱신 불필요(판단 보류 해소만, 이슈 본문 변경 없음).
> - **standing scan**: ① `npm run audit:entity` 131파일·61쿼리·**누락 0**(변동없음). ② `grep -rnE "IN \(\$\{" ` 신규 churn 5개 파일 전수 = 매치 0(신규 IN절 없음). ③ `node scripts/sort-audit.cjs` P1 **0건**(변동없음). ④ authMiddleware recursive 재스캔(`find src/routes -name '*.ts'`) = 무-auth 7개 파일(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전부 기존 정당 클래스 재확인(publicUnsubscribe=법령상 의도적 무인증+토큰, cron=agentKeyMiddleware, messagesAd=상위 라우터 requireRole 상속, 나머지 3개=helpers 파일 `Map.get()` FP, 신규 매치 0).
> - **npm audit 재확인**: `npm ci` 후 11건(1 moderate·8 high·2 critical), 전부 devDependency(#613 기보고와 일치, net-new 0).
> - **open 6건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614(전건 변동없음, 신규 코멘트 없음).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md는 이미 `line N` 잔여참조 0건(재확인, 본문에 서술식만 존재). 이번 사이클은 실제 churn 5건(신규 라우트 2개 포함)을 직접 정독했고, 기존 codify된 레시피(authMiddleware 상속·entity filter·IN절 청크·데드코드 전수 재grep·#462 스냅샷 FP 배제)로 전량 clean 판정 — Area1 인계 사안도 기존 FP 클래스로 명확히 해소. 새 오탐/탐지 클래스 도출 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(churn 5건 직접 정독, 전부 clean + Area1 인계 사안 해소), 자동수정 0건, done-sync: open 6(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 4건** — Area 3, 2026-08-13. #606·#608·#609는 owner 코멘트로 "보류/별도세션" 방향 확정, 승인 아님.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
| #618 | GET /api/inventory-counts/consumption(8fdf76c) — 프론트 소비처 0건, "백엔드 먼저·화면 나중" 5번째 사례 | Area 2 | improvement,S | issue-only, 신규(#618) |
| #615 | 재고 188품목 rebase(8fdf76c) — qty×pack_size/cost÷pack_size 보정이 재현 불가능한 형태로 prod 적용됨 | Area 4 | bug,S | issue-only, 신규(#615) |
| #614 | items 영구삭제 참조가드에 designer_intakes.item_id 누락(0532 신규 FK) — 하드삭제 시 친절한 409 대신 500 | Area 4 | bug,S | issue-only, 신규(#614) |
| #612 | ai_analysis_id/dxf_analysis_id 크로스 법인 IDOR — 주문 라인에 타법인 분석파일 ID를 넣으면 에이전트가 자동 다운로드·복사 | Area 5 | bug,medium | issue-only, 신규(#612) |
| #609 | unitConvert.ts toBase/formatStock 0호출 — write-path 3곳(scan/inventory/po-receive) pack_size 환산 각자 인라인 재구현, #462 재발위험 | Area 2 | improvement,S | issue-only |
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
