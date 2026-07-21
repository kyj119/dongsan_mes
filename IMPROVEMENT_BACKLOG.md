# Improvement Backlog
<!-- last_run_area: 4 -->
<!-- last_run_at: 2026-07-22T03:17:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **12** — Area 4 42회차(07-22T03:17) `search_issues(state:open,label:auto-improve)` **절대값 실측 재동기화**. 직전 기재값 24는 대폭 stale로 판명 — 실측 시점 open은 **10건뿐**(owner가 사이클 사이 #547·#545·#543·#542·#541·#539·#537·#534·#533·#532·#531·#530·#529·#527·#524·#522·#521·#519·#473·#548 다수를 completed/not_planned로 대량 close, 개별 재검증은 하지 않고 실측값 그대로 신뢰). 이번 사이클 신규 #550·#551 2건 생성으로 10→**12**. |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **465** — `search_issues(is:closed,reason:completed)` **절대값 실측 재동기화**(+14, owner의 대량 close 반영). |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 실측 재확인 — 변동 없음) |

> 📦 **과거 사이클 로그**는 `IMPROVEMENT_BACKLOG_ARCHIVE.md`/git 히스토리로 이관됨 (2026-06-10 1차 분리, 2026-06-25 2차 트림 343KB→192KB, 2026-06-25T10:00 3차 트림, 2026-07-03T06:00 4차 트림 288KB→86KB, 2026-07-07T13:00 5차 트림 238KB→78KB, **2026-07-20T19:20 6차 트림 — 07-06~07-17 사이클 로그를 `IMPROVEMENT_BACKLOG_ARCHIVE.md`로 이관: 306KB→80KB, 256KB Read 한도 재확보**). 신규 로그는 계속 이 파일 상단에 추가. 본 파일은 직전 2~3일치(07-18~) 사이클 로그 + 영구 참조 섹션(Approved/New/Auto-fixed/Done/Rejected/FP 카탈로그)만 유지. 이관분은 `IMPROVEMENT_BACKLOG_ARCHIVE.md` 또는 `git log -p -- IMPROVEMENT_BACKLOG.md`로 복원 가능.

> **Area 4 데이터 정합성 (2026-07-22T03:17):**
> - **방법**: `git fetch origin main`(HEAD `73216a0` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 4 **42회차** — 직전 Area4(`70e4943`, 07-20T15:19, 41회차, fetch HEAD `bba885b`) 이후 `src/routes`/`migrations` churn 2커밋뿐: `f9d211a`(intercompany AR을 회계허브 법인간거래 탭으로 재배치, 12파일)·`e7fd9c3`(AP 매입채무에도 내부법인 제외 적용 — 직전 Area4가 발견한 #547의 실제 픽스, Area1/5/6이 이미 close-pending 확인 완료). 신규 마이그레이션 3건(0467 inter_entity_transactions·0468 payslip_publish·0469 pension_base, 전부 Area1 #545가 write-path 컬럼드리프트 각도로 이미 다룸)의 **데이터 정합성 렌즈**(고아 레코드·CHECK 위반·형제 쿼리 비대칭)는 미검증 상태라 general-purpose 에이전트 1개로 심층 위임 + 오케스트레이터가 `payroll/records.ts`·`aiInsights.ts` 핵심 발견을 직접 Read로 교차검증.
> - **🔴 신규 이슈 — #550 (S, bug)**: `payroll/records.ts` `POST /publish`(`:112` 주석 "상태 무관 — 교부는 상태와 독립")가 PENDING 급여도 교부(`payslip_issuance_logs` 생성)할 수 있는데, `DELETE /:id`(`:177`)는 `status!=='PENDING'`만 확인하고 `published_at`/로그 존재 여부를 검사하지 않아 **근로기준법 교부증빙 로그가 고아화**(FK 미선언 확인). 재현: PENDING 급여 발행→직원 열람(`first_viewed_at` 기록)→관리자가 그 PENDING 급여를 삭제→교부·열람 이력이 있었다는 증빙이 dangling으로 조회 불가화. 로직 변경(삭제 정책)이라 issue-only.
> - **🟡 신규 이슈 — #551 (S, improvement)**: `f9d211a`가 `aiInsights.ts`의 `GET /credit-risk/summary` 내 `by_grade` 집계엔 `excludeInternalClientsSql()`을 적용했으나 **6줄 아래 형제 쿼리 `high_risk` TOP10엔 누락**(#547·#462류 형제-비대칭 클래스). 근본 원인은 `POST /credit-risk/calculate-all`이 애초에 내부법인 제외 없이 전 거래처의 `credit_risk_grade`를 계산·저장하는 것. 직접 검증 결과 `/credit-risk/*` 엔드포인트를 호출하는 프론트 UI·cron이 전무(도달성 0) — 현재는 dormant라 LOW, 향후 UI 연결 시 즉시 재발하는 잠복 결함. 비즈니스 로직 변경이라 issue-only.
> - **🟢 나머지 = clean(에이전트 심층 검증)**: `inter_entity_transactions.from/to_bank_transaction_id`는 코드 전체에서 값이 세팅되는 곳이 없어(항상 NULL) 고아화 위험 없음(단 프론트 "연결됨" 배지는 죽은 기능, 별건). `bank_transactions`/`clients` 둘 다 하드 DELETE 경로 없음(append-only/소프트 비활성)이라 신규 참조컬럼 고아화 축 자체가 무해. `transaction_type` CHECK 집합과 서버 `IET_TYPES` 화이트리스트 INSERT/UPDATE 양쪽 일치. `inter_entity_transactions` 수기 장부와 `deriveIntercompanyPositions` 파생 AR/AP는 주석에 명시된 **의도적 별개 시스템**이라 형제-비대칭 아님. `cron.ts` 84줄 삭제분은 전량 `deriveIntercompanyPositions`로 이전 확인(로직 유실 0). `payslip_issuance_logs UNIQUE(payroll_id)` + `ON CONFLICT DO UPDATE` 재교부/재열람 정상 동작.
> - **🟢 backlog↔GitHub 절대값 재동기화(대폭 stale 발견)**: `search_issues(state:open,label:auto-improve)` **실측 10건**(#550/#551 생성 전) — 직전 기재값 24와 큰 괴리 발견, owner가 이번 사이클 사이 다수 이슈(#547·#545·#543·#542·#541·#539·#537·#534·#533·#532·#531·#530·#529·#527·#524·#522·#521·#519·#473·#548 등)를 대량 close(대부분 completed, 3건은 not_planned 재확인)한 것으로 판단 — 개별 재검증 없이 GitHub 실측을 신뢰. #550/#551 생성 후 **12건**. done `search_issues(is:closed,reason:completed)` 실측 **465**(+14) · not_planned 실측 4 + duplicate 실측 2 → rejected **6**(변동 없음). `## 🆕 New` 상세표를 실측 12건으로 전면 교체(아래).
> - **🧬 SKILL 강화 없음(신규 탐지 클래스 아님)** — #550은 기존 "상태 무관 write + 파괴 write 가드 비대칭"(멱등/TOCTOU 계열) 클래스의 교부증빙 변종, #551은 기존 "형제 쿼리 비대칭"(intercompany exclusion sibling-incomplete) 클래스의 정확한 재현 — 둘 다 SKILL의 기존 레시피로 충분히 포착됨.
> - 신규 이슈 2건(#550·#551, 둘 다 issue-only — Area4 정책상 로직 변경은 자동수정 대상 아님), 자동수정 0건, done-sync 대폭 재동기화(new 24(stale)→12(실측)·done 451→465·rejected 6, 전부 절대값 재확인). 다음 순번 Area 5.
>

> **Area 3 UX/기능 감사 (2026-07-21T11:05):**
> - **방법**: `git fetch origin main`(HEAD `352a177` = origin/main 일치, 워킹트리 clean, detached). Area 3 **41회차** — 직전 Area3(`afd639c`, 07-20T09:14, 40회차) 이후 `git log afd639c..HEAD`(16커밋) 대부분은 Area1/2/4/5/6(41~48회차)이 각자 렌즈로 이미 심층 감사 완료(#546~#548). 순수 UX 표면 신규 churn은 없었으나, **직전 몇 사이클 동안 어느 Area도 UX 렌즈로 다루지 않은 대형 기능**을 역추적 — `360cb51`(07-18, Area3 39→40회차 사이 착륙, 직원 셀프서비스 급여명세서 교부+근로계약서 본인서명, `/employee-self` 신규 페이지)이 Area4/5가 데이터정합성·보안 렌즈로는 검증했으나(TOCTOU 안전·#544 XSS) 로딩/빈상태/에러메시지 UX 렌즈로는 미감사 상태임을 확인, 오케스트레이터가 `src/pages/employeeSelf.ts`+`src/scripts/employeeSelf.js`+`src/routes/hrSelf.ts`를 직접 Read로 전수 점검(범위가 3파일이라 위임 없이 직접 검증).
> - **🔴 신규 이슈 — #549 (S, bug)**: `verifySelfToken()`이 임시 토큰을 **30분 TTL**로 발급하고 만료 시 전 엔드포인트가 일관되게 "인증이 필요합니다. 다시 로그인하세요." 401을 반환하는데, `employeeSelf.js`의 **계약서 목록**(`:149-151`)·**급여명세서 목록**(`:203-205`) catch 블록만 이 메시지를 버리고 "목록 조회 실패"라는 원인불명 문구만 표시 — 같은 파일의 로그인 폼(`:49-54`)·서명 제출(`:312-314`)은 정확히 `err.response.data.error`를 읽어 실제 메시지를 보여주는 것과 형제 비대칭. 부가로 목록 화면엔 "돌아가기"만 있고 "로그아웃"이 없어 재로그인까지 3단계(돌아가기→로그아웃→재로그인)가 필요. 계정 없는 현장 직원이 사원번호+생년월일로 접근하는 페이지 특성상(작업 인터럽트·계약서 정독으로 30분 초과가 흔함) 실사용에서 막다른 길(dead end)이 되는 실질 UX 결함. Area3 정책상 issue-only.
> - **🟢 나머지 = clean**: 로그인 폼(로딩 disable+텍스트 변경, 에러 메시지 실제 원인 노출), 재직증명서/급여명세서 열람(새 창 fetch 실패 시 인라인 에러 HTML), 계약서 서명(캔버스 초기화·빈 서명 가드·제출 중 disable·성공 시 목록 자동갱신), 로그아웃(전 섹션 상태 리셋) 전부 정상. 모바일 반응형(max-width 420px 카드, viewport meta, 터치 캔버스 이벤트) 이상 없음. XSS(#544 기수정) 재확인 — `esc()` 일관 적용.
> - **🟢 backlog↔GitHub 절대값 재동기화(직전 사이클 stale 발견)**: `list_issues(state:OPEN,label:auto-improve)` **실측 23건**(#549 생성 전) → 생성 후 **24건**. 직전 Area2 48회차 기재값(new 29)과 불일치 발견 — owner가 그 사이(#529·#530·#541·#542·#543)를 close(541/542/543은 `not_planned` 사유, fixed-in-tree였음에도 owner가 그 사유 선택 — 존중, 재오픈 안 함). `search_issues(is:closed,reason:completed)` 실측 **451**(+3) · `not_planned` 실측 **4**(+3, #541·#542·#543) + `duplicate` 실측 **2**(변동 없음) → rejected **6**.
> - **🧬 SKILL 강화 없음(신규 탐지 클래스 아님)** — #549는 기존 "형제 catch 블록 비대칭"(같은 파일 일부 핸들러만 에러 메시지 노출) 클래스의 정확한 재현. 향후 참고 가치: **Area 손대지 않은 대형 신규 기능은 다른 Area가 자기 렌즈로 커버해도 UX 렌즈 공백이 남을 수 있다** — 이번처럼 "직전 몇 사이클 동안 Area3가 못 본 기능"을 역추적하는 방식이 신선 churn 없는 사이클의 유효한 대안으로 확인(Area6의 "close-pending 재확인" 패턴과 유사한 논리를 Area3에 적용한 사례).
> - 신규 이슈 1건(#549, issue-only), 자동수정 0건(Area3 정책상 자동수정 대상 아님), done-sync 재동기화(new 29(stale)→24(실측)·done 448→451·rejected 3→6, 전부 절대값 재확인). 다음 순번 Area 4.
>

> **Area 2 코드 품질 심층 분석 (2026-07-21T10:20):**
> - **방법**: `git fetch origin main`(HEAD `2adacf5` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 2 **48회차** — 직전 Area2(`bf434b1`, 07-19T22:05, 47회차) 이후 `git log bf434b1..HEAD -- src/routes src/scripts src/pages migrations`(8커밋): 대부분 Area1/3/4/5/6이 각자 렌즈로 이미 심층 감사 완료(`5ad7b2b`=Area3/4, `2511e57`+`1e1b620`+`3f54101`=Area4 41회차·Area5 40회차·Area6 46회차, `bba885b`=Area5 확인, `f9d211a`/`e7fd9c3`=Area1/4, `ba8a6c6`=feature flag OFF 단순 토글). Area2 고유 렌즈(entity_id INSERT·N+1·authMiddleware·컬럼/타입 불일치·dead code·SELECT *·D1 batch 한도)로 general-purpose 에이전트 1개(`2511e57`+`5ad7b2b` 전담) + 오케스트레이터 직접 Read(`1e1b620`의 bank.ts/items.ts/payroll/records.ts/po-queries.ts/accounts-payable.ts)로 교차검증.
> - **🔴 신규 이슈 — #548 (S, bug)**: `1e1b620`이 급여교부(`payroll/records.ts POST /publish`)의 `published_at` UPDATE + 교부증빙 INSERT를 "부분교부 방지" 목적으로 단일 `db.batch(stmts)`로 통합하면서, **바로 이틀 전(`741ee02`, 07-18) 같은 파일에 "D1 한도 준수"를 이유로 명시 추가됐던 80개 청크 분할을 제거**함 — `stmts.length = 1 + targets.length`가 청크 없이 그대로 batch() 호출됨. 이 코드베이스는 `aiInsights.ts:162`·`purchaseOrders/templates.ts:112/264`에서도 독립적으로 동일한 "80-청크 db.batch()" 컨벤션을 쓰고 있어(전부 D1 batch statement 개수 한도 회피 목적), 이번 제거는 실측된 제약을 우연이 아니게 재유입한 회귀. 현재 재직인원 규모에선 무증상이나, 인원이 늘어 한도를 넘는 순간 해당 월 급여교부 전체가 hard-fail. 원자성(청크 단위)과 확장성을 동시에 만족하려면 청크별 UPDATE+INSERT 재설계가 필요해 정책판단 + egress로 prod 인원수 대비 실제 한도초과 여부 검증 불가 → issue-only.
> - **🟢 close-pending 신규 확인 — Area2 자체 미픽스 이슈 중 2건이 `1e1b620`으로 fixed-in-tree(#528·#530), GitHub 코멘트 게시 완료**: ① **#528**(bank 출금→매입지급 중복제출 방어 없음) — `applyBankTransaction()`이 LINKED/출금/입금 3분기 전부 `UPDATE bank_transactions SET match_status='APPLIED' ... WHERE id=? AND match_status != 'APPLIED'` 원자적 클레임(changes=0→409)을 자금변동 INSERT/UPDATE **이전**에 실행하도록 재배치됨 — 안티패턴 잔존 0. ② **#530**(품목 하드삭제 참조검사 3테이블만 커버) — `items.ts` 참조검사가 20개 FK 테이블로 확장됨. `migrations/*.sql` 전체를 파싱한 독립 ground-truth 대조로 누락 0 확인(inventory는 의도적 별도 cleanup 경로).
> - **🟢 나머지 Area2 open 이슈 재확인 — #531·#521·#522는 여전히 미픽스(재확인, 상태 변동 없음)**: `workbench.ts:1178` `getEntityId(c) || 1`(#531)·`departments.ts:78` PATCH `/employees/:id` bare `WHERE id=?`(#521 부분픽스 잔존)·`hr.ts` department_id 미검증(#522) 전부 코드에 안티패턴 그대로 잔존 확인.
> - **🟢 churn 2건(2511e57/5ad7b2b) Area2 렌즈 clean**: entity_id 컬럼 실재·바인드 순열 정합·N+1 없음(intercompany 6쌍 상수 루프, cron self-fetch 엔티티 수 고정)·TS-DB 불일치 없음·dead code 없음. 발견된 entity-scope 갭(AP 대시보드 intercompany 혼입)은 같은 날 후속 커밋(`e7fd9c3`)으로 이미 자체 수정되어 라이브 아님(#547과 동일 사안, 중복보고 안 함).
> - **🟢 entity-audit.mjs·tsc 재확인**: `node scripts/entity-audit.mjs` = 검사 122파일·통과 56·누락 3(`bank.ts:1341/1353`+`cron.ts:189`, 기존 확인 동일 3건 net-new 0). `npx tsc --noEmit` 에러 0.
> - **🟢 backlog↔GitHub sync**: `search_issues(state:open,label:auto-improve)` 실측 28건(#548 생성 전) → 이슈 생성으로 **29건**. done `search_issues(is:closed,reason:completed)`=448(변동 없음) · rejected 3(`not_planned`=1+`duplicate`=2, 변동 없음).
> - **🧬 SKILL 강화 없음(신규 탐지 클래스 아님)** — #548은 기존 "80-청크 db.batch() 컨벤션"(SKILL엔 미문서화였으나 코드베이스에 3개 독립 선례가 이미 존재) 위반 사례. 향후 참고를 위해 SKILL Area2 절에 "batch() 재구조화 시 기존 청크링크 보존 확인" 패턴으로 추가할 가치 있으나 이번 사이클은 발견·이슈화에 집중.
> - 신규 이슈 1건(#548, issue-only), 자동수정 0건(급여 write-path 정책판단 필요), close-pending 신규 확인 2건(#528·#530, GitHub 코멘트 게시 완료), done-sync 변동 없음(new 28→29·done 448·rejected 3 정합 재확인). 다음 순번 Area 3.
>

> **Area 1 프로덕션 헬스 (2026-07-21T09:17):**
> - **방법**: `git fetch origin main`(HEAD `26c06b4` = origin/main 일치, 워킹트리 clean, detached). 프록시가 이번 세션도 prod 호스트 직접 curl 차단(exit 56, CONNECT tunnel 403 — 기존 33~46회차와 동일 제약, `cloudflare-observability` MCP 미인증). Playwright MCP를 통한 prod 브라우저 점검도 이번 세션은 도구 승인 게이트에서 거부되어 미수행(console-error 실측 불가, 배포체인 로그로 대체). Area 1 **47회차** — 직전 Area1(`160678d`, 07-19T21:12, 46회차) 이후 `git log 160678d..HEAD`(27커밋): 대부분 Area2~6(47/40/41/40/46회차)이 각자 렌즈로 이미 심층 감사 완료(#546·#547 생성) + 순수 미검증분 = `f9d211a`(법인간 AR을 inter-entity 탭으로 재배치)·`e7fd9c3`(AP 정합성 체크에서도 내부거래 법인 제외)·`ba8a6c6`(주문서 AI추출 진입점 feature-flag OFF). **신규 마이그레이션 0건**(`git diff 160678d..HEAD --stat -- migrations` = 무출력) — (b)-risk 컬럼드리프트 후보 없음.
> - **🟢 배포체인 = 전수 정상**: `deploy.yml` 최근 15회 실행(07-19T12:33~07-20T18:17) 전부 `conclusion:success`. 최신 커밋(`26c06b4`, run #29767129355) job 단계별 Typecheck(18:17:45~54)/Build(~18:17:58)/Deploy(~18:18:15)/Smoke(18:18:35~49) **전부 success** — 현재 origin/main HEAD가 정상 배포·스모크 통과 상태로 prod에 반영돼 있음 확인. `backup.yml`(Daily D1 Backup) 최근 10회(07-11~07-20) 전부 success, 최신 07-20T18:48. `e2e.yml`은 여전히 `disabled_manually`(재발 아님, 33회차 이래 동일 상태).
> - **🟢 신규 이슈 0건 — churn 3건 모두 Area1 렌즈(prod 헬스) 무관**: `ba8a6c6`는 `IA_WEB_INTAKE_ENABLED=false` 상수 토글 1개 파일 6줄 변경(코드 100% 보존, 즉시 원복 가능한 feature flag)로 CLAUDE.md "미완성은 dirty WIP 금지, feature flag" 원칙을 그대로 따름 — 배포/스모크 정상 통과 확인됨. `f9d211a`/`e7fd9c3`는 재무 로직 변경(entity별 파생값·내부거래 제외)으로 Area4가 41회차에서 이미 심층 검증해 #547(파생화 사이클의 intercompany 캐시손상 위험)로 포착·issue화 완료 — Area1 렌즈(가용성/CI/헬스)로는 두 커밋 다 배포·스모크 그린이라 추가 발견 없음.
> - **🟢 backlog↔GitHub sync**: `search_issues(state:open,label:auto-improve)` 실측 **28건**(변동 없음, 신규 이슈 0). done `search_issues(is:closed,reason:completed)`=**448**(변동 없음) · rejected 3(변동 없음).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — 이번 사이클은 신선 churn 중 Area1 고유 관점(배포/CI/헬스)으로 볼 신규 위험이 없었고(마이그 0건이라 #483/#484 (b)-risk류 재현도 없음), Playwright 도구 거부로 인한 브라우저 점검 공백은 기존 "프록시가 prod 직접 접근 차단"(33~46회차) 제약의 연장선.
> - 신규 이슈 0건, 자동수정 0건(수정 대상 없음), done-sync 변동 없음(new 28·done 448·rejected 3 정합 재확인). 다음 순번 Area 2.
>

> **Area 6 자기 진화 (2026-07-20T19:20):**
> - **방법**: `git fetch origin main`(HEAD `5847d13` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 6 **46회차** — 직전 Area6(`95e9db7`, 07-19T01:10, 45회차) 이후 27커밋 전부 Area1~5(46/47/40/41/40회차)가 각자 렌즈로 이미 심층 감사 완료(`5847d13` 자체가 방금 전 Area5 보고 커밋) — 컬럼-diff/XSS bridge 대상 신선 churn 잔여 0. "신선 churn 없음" → open≠unfixed 재검증 + close-pending 실행 + 도구 자체 상태 확인 + 백로그 문서 정합성 점검으로 전환.
> - **🔍 open≠unfixed 재확인 + close-pending 실행 완료 — Area5가 확인한 fixed-in-tree 6건 중 5건에 직접 커밋 SHA 인용 코멘트 게시(#546은 이미 done으로 close되어 있어 대상 제외 확인)**: `search_issues(state:open,label:auto-improve)` 실측 28건 전수를 확보 후, Area5가 "owner batch-close 대상"으로 안내한 6건(#529·#541·#542·#543·#546·#547) 중 **open 상태로 남은 5건**(#546은 실측 open 목록에 부재 = 이미 owner가 close함, done 448에 반영됨 재확인)에 대해 안티패턴 잔존 여부를 직접 코드 Read/grep으로 재검증 후 각 이슈에 확인 코멘트 게시: ① **#529** — `bank.ts` `applyBankTransaction()` `:25` `if (getEntityId(c) !== 0 && (row.entity_id ?? 1) !== entityId)` 게이트 확인(커밋 `1e1b620`). ② **#541** — `rip.ts:1323/2080`(정정: 실제 라인은 `/maintenance/alerts`·`/maintenance/dashboard`)에 `requireRole('ADMIN','MANAGER')` 서버 게이트 확인(`1e1b620`). ③ **#542** — `accounting.js:615` `accIetRows[r.id] = r` 캐시 충전 확인(`1e1b620`). ④ **#543** — `accounting.ts` `ietValidate()`에 `sessionEntity !== from && sessionEntity !== to` 당사자 검증 확인(`1e1b620`, POST·PUT 양쪽 배선). ⑤ **#547** — `src/routes/ledger/accounts-payable.ts:843/901` `purchase-integrity-check`/`-fix` 양쪽에 `excludeInternalClientsSql('c.id')` 추가 확인(`e7fd9c3`). **5건 전부 안티패턴 잔존 0** — 각 이슈에 코드 인용 + 커밋 SHA + "👍 batch-close 대상" 코멘트 게시 완료(owner가 리뷰 없이 바로 close 가능하도록).
> - **🟢 도구 자체 상태 확인 — 45회차 SKILL/entity-audit.mjs 정정 온전, 회귀 없음**: `git diff 95e9db7..5847d13 -- .claude/skills/entity-audit/SKILL.md .claude/skills/review-checklist/SKILL.md scripts/entity-audit.mjs` = 변경 0. `node scripts/entity-audit.mjs` 재실행 = 검사 122파일·entity테이블 SELECT 59·통과 56·누락 3(`bank.ts:1341/1353`+`cron.ts:189`, 기존 확인 동일 3건 — 좌표는 파일 성장으로 이동했으나 동일 지점, net-new 0). `npx tsc --noEmit` 에러 0.
> - **🗂️ 백로그 `## 🆕 New` 상세표 재동기화 — 26→28건 갱신 + close-pending 상태 메모 반영**: 45회차가 경고한 "상세표는 통계 절대값과 별개로 매 사이클 재확인 필요" 원칙에 따라 신규 편입분(#545·#547)을 표에 추가하고, 이번 사이클이 close-pending 확인한 5건(#529·#541·#542·#543·#547)의 상태 메모를 "미픽스"→"fixed-in-tree, close-pending(코멘트 게시 완료)"으로 갱신. #546은 이미 done이라 표에서 제외 대상 없음(애초 미등재).
> - **🟢 backlog↔GitHub 절대값 재동기화**: `search_issues(state:open,label:auto-improve)`=**28**(변동 없음, 이번 사이클은 코드 이슈 생성 0·close 0 — 코멘트만 게시) · `search_issues(is:closed,reason:completed)`=**448**(변동 없음) · `not_planned`=1 + `duplicate`=2 → rejected **3**(변동 없음, 개별 재확인 완료).
> - **🧬 SKILL 강화 없음(신규 탐지 패턴 아님)** — 이번 사이클은 신선 churn이 없어 "open≠unfixed"(line 281) 레시피의 정상 적용(코멘트를 통한 owner 워크플로 지원)과 상세표 재동기화(문서 드리프트 방지)에 집중. close-pending 5건에 SHA 인용 코멘트를 게시하는 것은 기존 레시피의 실행 확장(재검증에 그치지 않고 owner의 batch-close 의사결정을 돕는 실질 산출물)이나 신규 탐지 클래스는 아님.
> - 신규 이슈 0건, 자동수정 0건(코드 변경 없음, GitHub 코멘트 5건 게시 + 문서 동기화), done-sync 변동 없음(new 28·done 448·rejected 3 전부 정합 재확인). 다음 순번 Area 1.
>

> **Area 5 보안 (2026-07-20T18:10):**
> - **방법**: `git fetch origin main`(HEAD `ba8a6c6` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 5 **40회차** — 직전 Area5(`09919f2`, 07-19T00:20, 39회차) 이후 `src/routes`/`src/scripts` churn 31커밋. general-purpose 에이전트 2개 병렬(①백엔드 라우트 15파일 — SQLi/IDOR/authMiddleware/secrets/CSV injection ②프론트 5파일 — innerHTML XSS/dataset round-trip) + 오케스트레이터가 `accounting.ts`(#543 ietValidate)·`clients.ts`·`items.ts`(#530)·`cron.ts`·`accounts-payable.ts`(#547)·`po-queries.ts`·`financialReports.ts`·`ar-receivables.ts`(#546)·`ar-ledger.ts`·`ar-payments.ts`·`dashboard.ts`·`aiInsights.ts`·`rip.ts`(#541)·`payroll/records.ts`·`orders/lifecycle.ts` 직접 Read로 교차검증.
> - **🟢 신규 이슈 0건 — 전 churn 보안 렌즈 clean**: 신규/변경 쿼리 전부 `?` 바인딩, `excludeInternalClientsSql()`(신규 intercompany 유틸)은 사용자 입력이 아닌 소스 리터럴 컬럼명 + 하드코딩 상수(53/1271/3757)만 인라인해 SQLi 경로 없음. 새로 추가된 파생잔액 서브쿼리(AP/AR/dashboard/financialReports/po-queries)는 전부 `purchase_orders`/`purchase_payments`/`payments`/`adjustments`(entity_id 실보유, migrations 확인)에 `entityFilter()` 적용 — 형제-비대칭 없음. `clients`/`items`는 entity_id 없는 전역 마스터라 관련 bare 조회는 기존 의도(재확인, net-new 아님). 프론트 5파일(accounting.js/clients.js/ledger.js/intake.js/iaEditor.js) innerHTML 신규 sink 전부 escapeHtml/iaeEscape 일관 적용, dataset round-trip 우회 패턴 없음. rate limit/CSV export 관련 변경 0건.
> - **🔍 close-pending 재확인 — fixed-in-tree 6건 발견(Area4 41회차가 이미 #542/#543만 확인, 본 사이클이 #529·#541·#547 3건 추가 확인)**: 이번 churn의 상당수가 이전 사이클이 issue-only로 보고한 항목을 owner/worktree 세션이 이미 코드로 고쳐 놓았으나 GitHub 이슈는 아직 OPEN — line 281 "open≠unfixed" 패턴. 직접 Read로 안티패턴 잔존 여부 재확인: ① **#529**(bank.ts link_payment_id 법인 미검증) — `1e1b620`이 `row.entity_id` 조회 추가 후 `getEntityId(c)!==0 && (row.entity_id??1)!==entityId` 게이트로 차단 확인, 안티패턴 잔존 0. ② **#541**(정비 대시보드 DESIGNER 열람) — `1e1b620`이 `rip.ts:1323/2080`에 `requireRole('ADMIN','MANAGER')` 서버 게이트 추가 확인. ③ **#542**(법인간거래 수정 캐시 미충전)·**#543**(당사자 미검증) — Area4가 이미 확인(재검증 생략). ④ **#546**(연체 cron이 거래처별 기준일 무시) — `bba885b`가 `check-overdue` HAVING절을 `overdue_days > COALESCE(c.overdue_alert_days, 30)`로 정정, `/overdue`와 판정 일원화 확인. ⑤ **#547**(내부거래 3법인 캐시손상) — `e7fd9c3`이 `purchase-integrity-check`/`-fix` 양쪽에 `excludeInternalClientsSql('c.id')` 추가해 내부거래 3법인 자체가 쿼리 스코프에서 제외됨(수정 버튼을 눌러도 그 3법인은 더 이상 손상되지 않음) 확인. **owner에게 6건 일괄 close 대상으로 안내**(개별 재검증 불요, 각 이슈 코멘트로 커밋 SHA 인용 권장).
> - **🟢 backlog↔GitHub sync**: `search_issues(state:open,label:auto-improve)` 실측 **28건**(변동 없음, 신규 이슈 0 — close-pending 6건은 owner action 대기 중이라 카운트 그대로). done 448·rejected 3(이번 churn에 신규 close 커밋 0건, 변동 없음).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — close-pending 재확인은 기존 "open≠unfixed"(Area6 라인 281) 레시피의 정상 적용, 신규 보안 취약점 클래스도 0건 발견.
> - 신규 이슈 0건, 자동수정 0건(수정 대상 없음), close-pending 확인 6건(owner batch-close 대상 안내, 이슈 상태 변경 없음), done-sync 변동 없음(new 28·done 448·rejected 3 정합 재확인). 다음 순번 Area 6.
>

> **Area 4 데이터 정합성 (2026-07-20T15:19):**
> - **방법**: `git fetch origin main`(HEAD `bba885b` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 4 **41회차** — 직전 Area4(`18d2cfe`, 07-18T14:10, 40회차) 이후 `src/routes` churn 8커밋, **신규 마이그레이션 0건**(순수 코드 변경). 가장 신선하고 Area4 렌즈 집중도가 높은 두 커밋을 오케스트레이터 단독 직접 Read로 전수 검증: `2511e57`(feat(ap): AP balance per-entity derivation + intercompany daily mirror audit, 4파일)과 `1e1b620`(fix: 코드리뷰 수정 13건, 13파일) — 나머지(`c10d2b7`/`3fb46cf` PnL COGS는 Area2 47회차 완료, `5ad7b2b`는 Area3 40회차가 #546 생성, `3f54101`/`bba885b`는 그 직접 후속 수정)는 이미 다른 Area가 커버해 중복 감사 제외.
> - **🔴 신규 이슈 — #547 (S, bug)**: `2511e57`는 스스로 "공유 clients 테이블은 한 컬럼에 두 법인의 AP를 담을 수 없다"고 인지하고 4개 읽기 경로(정산/미지급목록/발주stats/재무스냅샷)를 캐시(`clients.purchase_balance`)에서 법인별 파생값으로 전환했으나(4경로 상호정합 확인, clean), 정확히 이 문제의 당사자인 **내부거래 3법인 공급처(client 53/1271/3757, 같은 커밋이 도입한 intercompany 매핑)**를 다루는 `accounts-payable.ts:816/872` `purchase-integrity-check`/`-fix`는 수정에서 누락됨 — `entityFilter(c)`로 **호출자 법인에만 스코프된** 파생값을 계산해 그대로 **법인 구분 없는 공유 컬럼**에 절대값 덮어쓰기(`:911`). 청주(entity 3) MANAGER가 `/ledger` 정산화면(`ledger.js:1529/1558`, 죽은 코드 아님)에서 "일괄 수정"을 누르면 동산기획(client 53) 캐시에서 선명의 매입채무 기여분이 소실되고, 이후 레거시 델타 writer(bank.ts·po-core.ts·po-special.ts·templates.ts)가 이 오염된 값 위에 계속 누적 — "정합성 수정"을 누를수록 캐시가 더 틀어지는 역설. 파괴적 financial cache write-path 정책 결정(전체모드 한정/캐시-기능 은퇴/공유클라이언트 스킵 3택) 필요 + egress로 prod 드리프트 실측 불가라 issue-only.
> - **🟢 나머지 = clean(2건 완결성 검증)**: (1) `1e1b620` 품목 하드삭제 참조검사 3→20개 FK 테이블 확장 — 독립 node 스크립트로 `migrations/*.sql` 전체를 파싱해 `items(id)` 참조 FK 테이블을 ground-truth 재구성(CREATE TABLE 컬럼 인라인 REFERENCES + 별도 FOREIGN KEY 절 양쪽), 20개 차단 라벨과 1:1 대조 — 누락 0(inventory는 별도 cleanup 경로라 의도적 미차단, 정상). (2) `1e1b620` 법인간 거래(#542/#543) 인가 픽스 — `ietValidate`가 PUT 시 **기존 레코드 당사자 확인**(`ietVisibility` 404게이트)과 **신규 body 당사자 확인**(from/to가 세션 법인이어야) 양쪽을 모두 수행해 "당사자를 제3자로 재배정" 우회 불가 확인, `accIetRows` 캐시가 `accIetOpenModal`에서 정상 소비되어 수정모달 중복생성 재발 없음 확인. `3f54101`(client_type 필터 재제거)도 이미 최종 상태 정합 확인(가드 주석 포함, 재발 없음).
> - **🟢 backlog↔GitHub sync**: `search_issues(state:open,label:auto-improve)` 실측 27(#547 생성 전) → **28**(생성 후). done `search_issues(is:closed,reason:completed)`=**448**(#546 완료, +1). rejected 3(변동 없음).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — #547은 기존 "형제-비대칭"(read-path는 파생 전환했으나 write-path 캐시writer 한 곳 누락) 클래스의 entity-derivation 변종 — Area4 SKILL의 #462/#480류 sibling-incomplete 레시피로 이미 충분히 포착됨.
> - 신규 이슈 1건(#547, issue-only), 자동수정 0건(파괴적 financial write-path 정책 판단 필요), done-sync 반영(new 27→28·done 447→448·rejected 3 정합 재확인). 다음 순번 Area 5.
>

> **Area 3 UX/기능 감사 (2026-07-20T09:14):**
> - **방법**: `git fetch origin main`(HEAD `afd639c` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 3 **40회차** — 직전 Area3(`18d2cfe`, 07-18T13:05, 39회차) 이후 `src/scripts`/`src/pages`/`src/routes` churn은 대부분 부문손익 COGS(Area2 47회차 감사완료)·pension_base 마이그 리스크(Area1 #545)·AR 연체관리 문서화 세션(`docs:` 다수) — 순수 UX 표면 변경은 `5ad7b2b`(feat(ledger): AR overdue management gaps) 단일 커밋(연체 기준일 거래처별 커스텀 필드 + BAD_DEBT 조정유형 + cron 알림 배선)뿐이라 이 커밋을 직접 Read로 전수 추적(에이전트 위임 없이 오케스트레이터 단독 — 변경 범위가 7파일·55줄로 작아 직접 검증이 더 정확).
> - **🔴 신규 이슈 — #546 (S, bug)**: 이 커밋이 같은 통에서 ①거래처별 연체 기준일 필드(`clients.overdue_alert_days`, UI·저장·GET/POST/PATCH 전 구간 연동) ②그동안 미배선이던 `POST /receivables/check-overdue`(알림 발송)를 daily-maintenance cron에 신규 연결, 두 가지를 도입했으나 **막 cron에 연결한 바로 그 엔드포인트가 방금 만든 커스텀 기준일 필드를 전혀 참조하지 않음** — `ar-receivables.ts:396-433`의 `check-overdue` HAVING절이 `overdue_days > 30` 하드코딩인 반면, 같은 파일의 대시보드용 형제 쿼리 `GET /overdue`(:159-181)는 `COALESCE(c.overdue_alert_days, 30)`로 이미 정확히 반영 중 — 형제 쿼리 간 비대칭(SKILL 형제-비대칭 클래스의 SQL-임계값 변종). 필드는 UI/DB/검증까지 전 구간 정상인데 유일하게 방금 활성화된 소비처(실제 알림 발송)만 누락돼 기능이 반쪽으로 배포됨(회귀 아닌 최초 결함). 영향: 커스텀 기준일 설정이 사실상 무시되고 전 거래처가 획일적으로 31일차에 알림 발송(설정 무의미 + 알림 피로 또는 조기경고 누락). SQL 쿼리 임계값 로직(비즈니스 로직) 변경이라 Area3 정책상 issue-only.
> - **🟢 나머지 = clean**: BAD_DEBT 조정유형 추가(`ar-payments.ts:303`·`ledger.js:437/527`·`ledger.ts` 모달 옵션)는 형제 완전성 확인(AP측 `accounts-payable.ts:569`의 별도 validTypes는 매입 도메인이라 BAD_DEBT 미해당이 정상, sibling 아님). `overdue_alert_days` 필드 자체의 UI(1-365 min/max)·백엔드 검증(정수 범위 400 에러)·저장 round-trip(null→30일 기본 안내문구)·프론트 에러 표시(`handleApiError`)는 기존 컨벤션과 일관. `clientDetailModal`의 `data-esc-close` 전환(레이아웃 전역 ESC 위임)은 이중 닫힘 버그 수정(자체 리스너 제거) — 별도 이슈화 불필요한 개선.
> - **🟢 backlog↔GitHub sync**: 이슈 생성 전 `search_issues(state:open,label:auto-improve)`=27 확인 후 #546 생성 → 실측 **28**. done `search_issues(is:closed,reason:completed)`=**447**(변동 없음) · rejected 3(변동 없음).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — #546은 기존 "형제-비대칭" 클래스(SKILL Area4/6 다수 codify)의 SQL 임계값(threshold) 변종 — 격리 컬럼(entity_id) 대신 비즈니스 파라미터(overdue_alert_days)가 형제 쿼리 중 한쪽에만 반영된 사례. 이미 확립된 "같은 도메인 형제 쿼리는 전수 대조" 레시피로 충분히 포착됨.
> - 신규 이슈 1건(#546, issue-only), 자동수정 0건(Area3 정책상 자동수정 대상 아님 — SQL 임계값 로직 변경), done-sync 변동 없음(new 27→28·done 447·rejected 3 정합 재확인). 다음 순번 Area 4.
>

> **Area 2 코드 품질 심층 분석 (2026-07-19T22:05):**
> - **방법**: `git fetch origin main`(HEAD `5bb4207` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 2 **47회차** — 직전 Area2(`da50ec7`, 07-18T12:20, 46회차) 이후 `git log da50ec7..HEAD`(28커밋) 대부분은 Area1/3/4/5/6이 각자 렌즈로 이미 심층 감사(#541~#545 생성, #538/#544 자동수정). Area2 고유 렌즈(entity_id INSERT·N+1·authMiddleware·컬럼/타입 불일치·dead code·SELECT *)로 아직 미검증인 순수 신규 코드만 선별 = **부문손익 COGS 반영 2건**(`c10d2b7` 유통 매출원가·`3fb46cf` 제조 매출귀속 전환, 둘 다 `src/routes/departments.ts` 단독) + **payroll 요율모달 dead-code 제거**(`d075dfd`). 나머지(780778e/98c5be8=docs+SQL만, 6494749=layout.ts ESC-close CSS폭 수정 순수 UI) 코드품질 렌즈 무관 확인 후 스킵.
> - **🟢 `departments.ts` PnL COGS(c10d2b7/3fb46cf) = Area2 렌즈 clean**: `GET /pnl` 5개 집계 쿼리(매출·자재비·유통COGS·인건비·인원수) 직접 Read 전수 — `entityFilter(c,'o'/'iad'/'p')` 별칭이 각 쿼리의 실제 FROM 별칭과 일치, `inventory_auto_deductions`(0264)·`payroll`(0150) 둘 다 entity_id 실보유(migrations grep 확인)라 격리 유효. N+1 없음(전부 단일 집계 SELECT, department 순회는 JS 메모리 Map 연산). `SELECT *` 없음. COGS 신규 서브쿼리(`JOIN items i` INNER)가 `oi.item_id IS NULL`(커스텀 라인) 건을 자연 제외하는 것도 커밋 메시지의 "귀속·원가 구조적 불가" 의도와 일치(버그 아님). `matMap.set(distDeptId, ...)` — `유통` 부문 미존재 시 `distDeptId=null`로 unclassified 버킷에 자연 합산되는 것도 주석대로 의도된 폴백.
> - **🟢 payroll 요율모달 제거(`d075dfd`) = dead-code 삭제 완결성 확인**: `grep -rn "payrollOpenRatesModal\|payrollCloseRatesModal\|payrollLoadRates\|prRatesModal\|prRatesYear\|prRatesBody"` 코드베이스 전수 = 0건(호출부·DOM·정의 전부 제거, 잔존 참조로 인한 silent-fail 없음). 대체 경로(`payrollRates.js` 요율 탭)는 별도 프리픽스(`prR*`)라 형제 충돌 없음(diff 자체가 순수 삭제, 신규 로직 0).
> - **🟢 entity-audit.mjs 재확인**: `node scripts/entity-audit.mjs` = 검사 8테이블·SELECT 59·통과 56·누락 3(`bank.ts:1340/1352`+`cron.ts:180`, 기존 확인 동일 3건, net-new 0).
> - **🟢 `npx tsc --noEmit` 재확인**: 에러 0.
> - **🟢 backlog↔GitHub sync**: `search_issues(state:open,label:auto-improve)` 실측 **27건**(변동 없음) · done `search_issues(is:closed,reason:completed)`=**447**(변동 없음) · rejected 3(변동 없음, 직전 사이클과 동일).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — 이번 사이클 순수 신규 코드가 작고(1파일 COGS 로직 + 1건 dead-code 삭제) Area2 고유 렌즈로도 전부 clean. `departments.ts`의 기존 open 이슈(#521, `GET /employees`·`PATCH /employees/:id`의 entityFilter 미적용)는 이번 churn이 건드리지 않은 별개 라인이라 재확인만(재발/악화 없음).
> - 신규 이슈 0건, 자동수정 0건(수정 대상 없음), done-sync 변동 없음(new 27·done 447·rejected 3 정합 재확인). 다음 순번 Area 3.
>

> **Area 1 프로덕션 헬스 (2026-07-19T21:12):**
> - **방법**: `git fetch origin main`(HEAD `160678d` = origin/main 일치, 워킹트리 clean, detached). 프록시가 이번 세션도 prod 호스트 직접 curl을 차단(exit 56, CONNECT tunnel 403 — 기존 33~45회차와 동일 제약, `cloudflare-observability` MCP도 미인증). Area 1 **46회차** — 직전 Area1(`6910766`, 07-18T00:45, 45회차) 이후 22커밋(부문손익 P1 배부·생산허브 통합·사이드바 기능중복 흡수·법인간거래 탭 신설(0467)·직원셀프 급여명세서/근로계약서서명(0468)·pension_base(0469) 등).
> - **🟢 배포체인 = 전수 정상**: `deploy.yml` 최근 30회 실행(07-18T08:32~07-19T10:35) 전부 success, 최신 커밋(`160678d`, run #29683605887) job 단계별 Typecheck/Build/Deploy/Smoke **전부 success**(스모크 10:36:23~10:36:36). `backup.yml`(Daily D1 Backup) 최근 30회 전부 success, 최신 07-18T17:48. `e2e.yml`은 여전히 `disabled_manually`(재발 아님).
> - **🔴 신규 이슈 1건(issue-only, HIGH) — #545**: 직전 Area1 이후 신설 마이그레이션 3건(0467 법인간거래 신규테이블·0468 payroll.published_at·0469 employees.pension_base) 중 **0469만 기존 핵심 write-path를 침범**한 것을 발견 — `741ee02`("코드리뷰 후속 5건")가 **기존** `hr.ts:558-566` `PUT /api/hr/employees/:id`(직원 정보 수정) 핸들러의 급여필드 변경감지 SELECT에 `pension_base` 컬럼을 추가(diff로 직접 확인). 이 SELECT는 어떤 필드를 수정하든 무조건 실행되는 공통 경로라, prod에 0469 미적용 시 **직원 정보 수정 자체가 100% 500**(SKILL #483/#484 (b)-risk 패턴, `no such column`). `scripts/smoke.cjs`는 GET 프로브 위주라 이 write-path를 커버 안 해 smoke green이 이 회귀를 은폐할 수 있음(#430 write-path 맹점 클래스). 대조로 0468(payroll.published_at)은 `hrSelf.ts`·`payroll/records.ts`의 **신규** 엔드포인트만 참조(기존 기능 회귀 없음, 저위험), `payroll/shared.ts`의 급여계산 핵심 경로(`loadEmployeeDefaults`)는 `PRAGMA table_info` 동적 컬럼가드가 이미 있어 안전(우아한 폴백) — `hr.ts:566`만 방어 없이 노출된 예외. egress 차단으로 prod `PRAGMA table_info(employees)` 직접 확인 불가라 **문제 실재 여부는 강한 정황증거 수준**(코드는 이미 deploy 완료·live) — DB 마이그레이션 적용은 되돌리기 어려운 프로덕션 작업이라 자동실행 안 함, owner 확인 요청.
> - **🟢 backlog↔GitHub sync**: `search_issues(label:auto-improve,state:open)` 실측 **27건**(직전 26 + 본 Area1 신규 #545). done(447)·rejected(3) 변동 없음.
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — #483/#484 (b)-risk 레시피의 정상 적용 사례(신규 ADD COLUMN이 detail 아닌 **공통 write-path SELECT**에 유입된 변종), 기존 카탈로그로 충분히 커버.
> - 신규 이슈 1건(#545, issue-only), 자동수정 0건(prod DB 마이그레이션은 owner 전용), done-sync 변동 없음(new 26→27·done 447·rejected 3 정합 재확인). 다음 순번 Area 2.
>
> **Area 6 자기 진화 (2026-07-19T01:10):**
> - **방법**: `git fetch origin main`(HEAD `95e9db7` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 6 **45회차** — 직전 Area6(`6910766`, 07-17T22:10, 44회차) 이후 22커밋(부문손익 P1 배부·생산허브 통합·사이드바 기능중복 4건 흡수·요율모달 dead-code 제거·법인간거래 탭 신설·직원셀프 급여명세서/근로계약서서명·pension_base 필드) 전부 **Area1~5(45~39회차)가 각자 렌즈로 이미 심층 감사 완료**(신규 이슈 #541~#544, 자동수정 #544)임을 `git log 6910766..HEAD --grep`(이슈번호 전수)로 확인 — 이번 churn 구간을 인용하는 커밋이 자기 자신(각 Area의 보고 커밋)뿐이라 컬럼-diff/XSS bridge 대상 잔여 0. "신선 churn 없음" → 이전 사이클들과 동일하게 **open≠unfixed/closed≠fixed 재검증 + 도구 자체 상태 확인 + 백로그 문서 정합성 점검**으로 전환.
> - **🔍 open≠unfixed 재확인 — fixed-in-tree 0건**: `git log 6910766..HEAD --grep`으로 현재 open 26건(#473,504,509,519~540 중 538/544 제외,541~543) 전수 이슈번호 인용 커밋 검색 — 자기 자신의 보고 커밋 외 **어떤 이슈번호도 별도 fix 커밋에서 재인용되지 않음**(병렬 worktree 세션이 close 전에 미리 픽스하는 사례, line 281/#521류 재발 0). `#521`(부문관리 employees, GET 3곳만 부분픽스)도 이번 churn에 `departments.ts` 재수정 없음(`git log 6910766..HEAD -- src/routes/departments.ts`=0) — Area2 38회차 정정 상태 그대로 유효.
> - **🟢 도구 자체 상태 확인 — 44회차 entity-audit.mjs/SKILL 정정 온전**: `git diff 6910766..HEAD -- .claude/skills/entity-audit/SKILL.md .claude/skills/review-checklist/SKILL.md scripts/entity-audit.mjs` = **변경 0**(이번 churn 어느 커밋도 이 3파일을 건드리지 않음) — 지난 사이클이 정정한 "id=? 예외는 SELECT 목록조회 한정, write 형제-비대칭은 별개" 규칙과 review-checklist §10 신규 항목 그대로 유지, 후속 churn에 의한 회귀나 재오염 없음.
> - **🗂️ 백로그 문서 정합성 정비(비-코드 자기수정) — `## 🆕 New` 상세표 재-stale 발견 및 갱신**: 43회차(07-16)가 "5주 stale" 문제를 고쳐 당시 실측 11건으로 표를 전면 교체했으나, 이후 2일간 Area1~5가 신규 이슈 15건(#541~#544 포함, 538/544는 auto-close)을 추가하는 동안 이 상세표는 **다시 갱신되지 않아 11/26건만 반영**된 상태로 3일 재-stale(line 137-138이 경고한 "매 사이클 상세표도 통계와 함께 재동기화 대상"이 지켜지지 않은 사례). 상단 통계 숫자(new 26)는 정확했으나 본문 상세표만 뒤처져 "몇 건이 신규인지는 맞는데 어떤 이슈인지는 15건 누락"인 상태 — 통계-전용 절대값 재동기화(line 268)가 상세표까지 자동으로 커버하지 않음을 재확인. **조치**: 아래 `## 🆕 New` 표를 `search_issues(state:open,label:auto-improve)` 실측 26건 전체로 전면 교체(이슈번호·제목·영역·라벨·상태메모, #521/#473/#504는 기존 특기사항 유지). 코드 변경 없음, 문서 전용.
> - **🧬 SKILL 강화 없음(신규 탐지 패턴 아님)** — 이번 사이클 유일 산출물은 코드가 아니라 **문서 드리프트 재발 확인**(43회차가 고친 지 3일 만에 다시 11/26로 뒤처짐) — "상세표는 통계 절대값 재동기화와 별개로 매 Area6 사이클마다 명시적으로 재확인해야 함"을 재확인. 향후 사이클은 상세표 항목 수를 상단 통계와 기계적으로 대조(둘 다 count만 비교해도 드리프트 조기 발견 가능)하는 습관화가 필요.
> - **🟢 backlog↔GitHub 절대값 재동기화**: `search_issues(is:closed reason:completed)`=**447**(변동 없음, #544 이미 반영) · `not_planned`=1+`duplicate`=2 → rejected **3**(변동 없음) · `search_issues(state:open,label:auto-improve)` 실측 **26건**(직전 26 유지, owner close 0). 통계 표 자체는 이미 정확(Area5 39회차가 갱신) — 상세표만 갱신 대상.
> - 신규 이슈 0건(코드 이슈 없음, 순수 문서 드리프트), 자동수정 0건(문서 동기화는 코드 변경 아님), 문서 동기화 1건(New 상세표 11→26 전면 갱신), done-sync 변동 없음(new 26·done 447·rejected 3 전부 정합 재확인). 다음 순번 Area 1.
>

> **Area 5 보안 (2026-07-19T00:20):**
> - **방법**: `git fetch origin main`(HEAD `09919f2` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 5 **39회차** — 직전 Area5(`c9e4abc`, 07-17T21:21, 38회차) 이후 churn 21커밋 대부분(사이드바 탭통합·손익/생산허브 통합·법인간 거래 신설 등)은 Area1~4·6이 각자 렌즈로 이미 심층 감사 완료(#539~#543). 순수 미검증 보안 표면 = `hrSelf.ts`(신규 172줄, 직원 셀프서비스 인증/증명서/계약서서명)·`accounting.ts`(+221, 법인간 거래) — 오케스트레이터가 직접 Read로 authMiddleware 커버리지·IDOR·rate-limit·XSS 렌즈 전수 검증(신규 코드 규모가 작아 병렬 위임 대신 직접 검증이 효율적).
> - **🔴 신규 이슈 — #544 (S, bug/security) — 자동수정 완료**: `src/templates/laborContract.ts:78-84`가 `signature_employee_base64`/`signature_employer_base64`를 `esc()` 없이 `<img src="...">`에 직접 삽입. `hrSelf.ts:319` PATCH `/self/contracts/:id/sign`의 유일한 검증이 `startsWith('data:image')`뿐이라 `"` 문자로 속성을 탈출하는 payload(`data:image/png;base64,x" onerror="...`)가 통과 → 계정 없이 사원번호+생년월일만으로 얻는 `employee-self` scope 저권한에서 저장 → 이후 HR ADMIN/MANAGER가 `GET /api/hr/contracts/:id/preview`(`hr.ts:1354`)로 열람 시 동일 미escape 템플릿이 렌더되어 **관리자 브라우저 세션에서 stored XSS 실행**(권한 상승). 같은 파일 다른 모든 필드는 이미 `esc()` 적용 — 이 두 줄만 누락. **자동수정**: 두 삽입값을 파일에 이미 import된 `esc()`로 래핑(정상 base64는 escape 대상 문자 미포함이라 동작 무변화, 순수 안전 강화). `npx tsc --noEmit`+`npm run build` 통과 후 커밋(`2129372`, "closes #544") 즉시 push — issue 생성 직후 자동 close 확인.
> - **🟢 나머지 = clean**: `hrSelf.ts` 5개 라우트 전수 재확인 — self-auth는 `index.tsx:254` rate limit 5/분 기등록, 나머지 4개(certificates/employment·contracts 목록/단건 preview·payslips 목록/단건)는 `verifySelfToken()`(scope='employee-self' 검증) + employee_id 소유 게이트, 서명 UPDATE는 `WHERE ... AND status IN ('DRAFT','PENDING_SIGNATURE')`로 TOCTOU 안전(Area4가 40회차에 이미 확인한 것과 동일 결론, 보안 렌즈로 재확인). `accounting.ts` inter-entity 5개 핸들러 — 라우터 전체 `authMiddleware+requireAccessOrRole` 게이트, DELETE는 `ietVisibility()` 당사자 확인 후 삭제(정상), POST/PUT의 당사자 미검증 갭은 Area4 #543이 이미 포착(중복 배제). `accounting.js`/`employeeSelf.js` 신규 innerHTML sink 전수 — `accIetRenderRow`(설명/거래처명/생성자명)·계약서목록(`entity_name`) 전부 escapeHtml/esc 일관 적용, 숫자·enum 라벨 필드는 SAFE. `payslipHtml.ts`(신규 템플릿) 전체 필드 `esc()` 일관. `employmentCertificate.ts`(기존 템플릿, 참고 확인) 이미 clean. 시크릿 폴백/CSV export 패턴 신규 churn 파일 전수 grep 0건.
> - **🟢 backlog↔GitHub sync**: 이슈 생성 전 `search_issues(state:open,label:auto-improve)`=26 확인 후 #544 생성+즉시 자동수정 커밋으로 close → 재확인 실측 **open 26(변동없음)** · done `search_issues(is:closed,reason:completed)`=**447**(+1) · rejected 3(변동 없음).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — #544는 기존 "독립 c.html 페이지의 전역 escapeHtml 부재 + 서명/이미지 데이터 URI를 속성값으로 미검증 삽입" 클래스(SKILL Area5 라인 190 부근 "독립 HTML 페이지 예외" 및 A-024/A-025 부분-escape 클래스)의 정확한 재현 — img-src 컨텍스트도 텍스트노드와 동일하게 escape 필요함을 재확인한 사례일 뿐, 신규 클래스는 아님.
> - 신규 이슈 1건(#544, 자동수정 완료), done-sync 변동 확인(new 26·done 446→447·rejected 3). 다음 순번 Area 6.
>

> **Area 4 데이터 정합성 (2026-07-18T14:10):**
> - **방법**: `git fetch origin main`(HEAD `18d2cfe` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 4 **40회차** — 직전 Area4(`c9e4abc`, 07-17T02:10, 39회차) 이후 `migrations`/`src/routes` churn 6커밋(`git log c9e4abc..HEAD`): 신규 마이그 3건(0467 inter_entity_transactions·0468 payslip_publish·0469 pension_base) + `accounting.ts`(+221, 법인간 거래 CRUD)·`hrSelf.ts`(신규 172줄, 직원 셀프서비스)·`hr.ts`/`leaves.ts`/`payroll/{core,records,shared}.ts`(pension_base 배선). Area2/3/6이 각자 렌즈(코드품질/UX/자기진화)로 이미 훑었으나 데이터 정합성 렌즈(orphan·상태불일치·NOT NULL·CHECK·entity 격리 authorization)는 미검증 상태라 직접 전수 Read로 심층 분석(에이전트 위임 없이 오케스트레이터 단독 — churn 범위가 7파일로 작아 병렬 위임보다 직접 검증이 효율적).
> - **🔴 신규 이슈 — #543 (S, bug)**: 법인간 거래(`inter_entity_transactions`, 0467) 라우터 게이트가 `requireAccessOrRole('/accounting','MANAGER')`(`accounting.ts:26`)라 entity-scoped MANAGER도 통과하는데, 공통 검증 `ietValidate()`(`:346`)가 날짜형식/from≠to/거래유형/금액>0/법인실재를 확인하면서 **정작 from_entity_id·to_entity_id 중 하나가 요청자 자신의 소속 법인인지는 검증하지 않음**. 읽기(`GET /inter-entity`)는 `ietVisibility()`(`:340`)로 당사자(from/to)만 격리하는데(격리 의도 명백), 쓰기(POST `:400`/PUT `:434`)만 이 게이트가 빠진 형제-비대칭. PUT은 기존행 조회 시 당사자 여부를 확인하지만 **새로 들어오는 from/to 값에는 같은 제약이 없어 기존 거래를 자신과 무관한 두 법인 사이 거래로 바꿔치기 가능**. 프론트(`accounting.js:471` accIetFrom/To select)도 `/api/auth/entities` 전체 목록을 그대로 노출해 UI 단 제약도 없음(실도달 확인). entity-scoped MANAGER가 자신과 무관한 두 법인(B·C) 사이 임의 법인간 채권채무를 주입/재지정할 수 있어 `GET /inter-entity/summary` 잔액 집계가 조작됨 — IDOR 인접 인가 누락 + 재무 데이터 무결성 훼손. IDOR 클래스는 프로젝트 정책상 issue-only.
> - **🟢 나머지 = clean**: 0467/0468/0469 NOT NULL no-default 컬럼 전수 INSERT 바인드 확인(inter_entity_transactions 4컬럼·payslip_issuance_logs 3컬럼 전부 충족). CHECK(transaction_type IN(...)) 리터럴 write가 `IET_TYPES` 배열과 1:1 매칭. `entities`/`clients` 하드삭제 라우트 없음(전부 soft-delete, `is_active=0`) — 신규 `from_entity_id`/`to_entity_id`/`client_id` 비-FK 참조 컬럼의 고아 위험 없음(#443/#454 클래스 해당 없음). `from_bank_transaction_id`/`to_bank_transaction_id`는 백엔드 INSERT/UPDATE 어디서도 미기록(프론트 `accounting.js:545`만 읽음) — 향후 기능용 미사용 컬럼, graceful degrade(`||` 폴백)라 무해. `pension_base` 배선(#471 클래스 "부분마이그레이션 잔재" 재검증) — `calcDeductions()` 호출처 5곳(`payroll/core.ts` 4곳+`leaves.ts:1218`) 전수 `pensionBaseOverride` 전달 확인, 형제 누락 0(741ee02가 이미 완전 수정). `hrSelf.ts` 신규 라우트 5종 — 소유(employee_id)+상태(DRAFT/PENDING_SIGNATURE)+교부(published_at) 게이트 전부 확인, 서명 UPDATE도 `WHERE ... AND status IN (...)`로 TOCTOU 안전. `payslip_issuance_logs` UPSERT(`ON CONFLICT(payroll_id)`) 멱등 확인.
> - **🟢 backlog↔GitHub sync**: 이슈 생성 전 `search_issues(state:open,label:auto-improve)`=25 확인 후 #543 생성 → 실측 **26**. done `search_issues(is:closed,reason:completed)`=**446**(변동 없음) · rejected 3(변동 없음).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — #543은 기존 "형제-비대칭 IDOR"(#437/#452류, list는 격리·write는 미격리) 클래스의 정확한 재현이나, 대상이 "단건 조회 WHERE id=?"가 아니라 "신규 등록/수정 payload의 entity 필드값 자체가 검증 없이 자신의 소속을 벗어날 수 있다"는 변종 — 기존 SKILL 레시피(line 191 등)가 상정한 "PUT만 bare WHERE id=?" 패턴과 달리 read-gate는 있으나 write payload의 신규 값은 무검증이라는 점에서 미묘하게 다름. 다음 IDOR standing scan에 "PUT/POST 바디의 entity 필드가 기존 행 소유자 확인과 별개로 재검증되는지"를 체크항목으로 참고할 가치는 있으나, 현재 SKILL 문서 분량상 즉시 codify는 보류(반복 재현 시 승격).
> - 신규 이슈 1건(#543, issue-only), 자동수정 0건(IDOR 인접 인가 로직 = 정책 판단 + 프로젝트 정책상 자동수정 금지), done-sync 변동 없음(new 25→26·done 446·rejected 3 정합 재확인). 다음 순번 Area 5.
>

> **Area 3 UX/기능 감사 (2026-07-18T13:05):**
> - **방법**: `git fetch origin main`(HEAD `ca75ec9` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 3 **39회차** — 직전 Area3(`c536e8b`, 07-17T00:35, 38회차) 이후 `src/scripts`/`src/pages` churn **14커밋**(사이드바 기능중복 4건 흡수-탭 통합 `6d03293`[장비+정비·급여+요율·경영진단·세금+부가세]·요율 모달 dead-code 제거 `d075dfd`·손익허브 통합 `03ff2f6`·생산허브 통합 `057f73a`·직원 셀프서비스 급여명세서/근로계약서 서명 신설 `360cb51`·payroll pension_base 필드 `1a1d818`+후속수정 `741ee02`·법인간 거래 탭 신설 `d469a39`). general-purpose 에이전트 2개 병렬(①사이드바 탭통합 4건 리팩터 전담 — dead-link/탭배선/HTML↔JS silent-fail/`?raw` concat 충돌/역할 도달성 ②신규기능 3건 전담 — employeeSelf/accounting/payroll pension_base의 빈상태·검색필터·로딩·에러메시지·중복제출·showConfirm오용·XSS)로 표준 체크 수행, 오케스트레이터가 confirmed 2건을 `src/pages/equipment.ts`·`src/routes/rip.ts`·`src/index.tsx`·`migrations/0211`·`src/scripts/accounting.js` 직접 Read로 재검증.
> - **🔴 신규 이슈 — #541 (S, bug/security)**: 사이드바 정비 흡수(`6d03293`) 전에는 `/maintenance` 페이지 자체가 `requirePagePermission`(ADMIN/MANAGER만, `migrations/0211`)으로 차단되어 DESIGNER는 `maintenance.js`를 받아본 적조차 없었는데, 흡수 후 `/equipment`(DESIGNER 접근 가능 페이지)에 `maintenance.js`가 무조건 concat되고 정비 탭 노출 여부는 `equipment.ts:13-19`의 **로컬스토리지 role 체크 + CSS hidden 토글뿐** — `switchTab('maintenance')`는 전역함수라 devtools 콘솔로 누구나 호출 가능. 백엔드도 `GET /maintenance/dashboard`(`rip.ts:2080`)·`/maintenance/alerts`(`rip.ts:1323`)가 `authMiddleware`만 있고 `requireRole` 없어 DESIGNER가 장비별 정비비용 집계(`total_cost`)까지 열람 가능 — 페이지레벨 차단이 탭통합으로 소실된 access-control 회귀. 읽기전용(POST/PUT 없음)이라 Medium. IDOR/access-control 클래스는 프로젝트 정책상 issue-only.
> - **🔴 신규 이슈 — #542 (S, bug)**: 신규 "법인간 거래" 탭(`d469a39`)의 수정 기능이 최초 배포부터 완전히 깨져 있음 — `accounting.js:565` `var accIetRows = {}`(캐시, 주석은 "목록 렌더 시 채움") 가 실제로는 어디서도 채워지지 않아(`grep` 2줄뿐: 선언+읽기) 수정 모달이 항상 빈 값으로 열리고 `accIetId`가 빈 문자열로 남아 `accIetSave()`(:655)가 매번 PUT 대신 POST를 호출 — 원본 미변경 + 신규 중복 레코드 생성으로 법인간 채권채무 잔액 집계가 이중 계상됨. 회귀 아닌 도입 즉시 깨짐. 수정은 `accLoadInter()`에 `data.forEach(r=>accIetRows[r.id]=r)` 한 줄 추가로 국지적이나, Area 3 발견은 정책상 자동수정 금지 → issue-only.
> - **🟢 나머지 = clean**: 탭 배선(`switchAnalyticsTab`/`switchTaxTab`/`prSwitchHubTab`/`switchProdMode` 등) 전부 정상 매핑. `?raw` concat 함수명 충돌 0건(`maintenance.js` IIFE 완전격리, `payrollRates.js`는 `prR*` 프리픽스, `vatReports.js`의 `fmt`→`vatFmt`, `productionReports.js`의 `kpiOk/kpiError`→`prodAnaKpiOk/prodAnaKpiError` 개명 확인). `costAnalysis.js`는 클라 lazy-init 가드 + 서버 `requireRole('ADMIN','MANAGER')` 이중 방어로 #541과 달리 안전. 구 라우트(`/maintenance`·`/financial-reports`·`/production-reports` 등)는 `index.tsx`에 여전히 등록돼 있으나 메뉴에서 전부 은퇴(`menu.ts` 주석처리)돼 dead code(라이브 버그 아님). employeeSelf/accounting/payroll 신규 UI는 빈 상태·검색필터·로딩·에러메시지·중복제출 방어(버튼 disable)·`showConfirm` 사용법·XSS escape 전부 기존 컨벤션과 일관, pension_base 5개 호출부(`core.ts` 4곳+`leaves.ts` 741ee02 추가분) 전부 정합. `hrSelf.ts` self-service 라우트 4종은 JWT `sub` 기반 본인소유 게이트로 IDOR 없음(참고 확인, 부차). 대시보드/보고서의 `/production-reports` 잔존 링크(신규 `/production?tab=analysis`로 안 바뀜)는 라우트가 여전히 동작해 dead-link 아님 — 일관성 개선 기회일 뿐 이슈화 안 함.
> - **🟢 backlog↔GitHub sync**: 이슈 생성 전 `search_issues(state:open,label:auto-improve)`=23 확인 후 #541·#542 생성 → 실측 **25**. done `search_issues(is:closed,reason:completed)`=**446**(변동 없음) · rejected 3(변동 없음).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — #541은 기존 "대형파일/페이지 흡수 리팩터 보안회귀"(security-audit SKILL) 클래스의 탭통합 변종(페이지레벨 게이트 소실), #542는 흔한 "캐시 변수 선언만 하고 채우기 누락" 구현 버그로 신규 클래스 아님. 둘 다 신규기능 도입 직후 최초 발견(회귀 아닌 최초 결함).
> - 신규 이슈 2건(#541·#542, 전부 issue-only), 자동수정 0건(Area3 정책상 자동수정 대상 아님), done-sync 변동 없음(new 23→25·done 446·rejected 3 정합 재확인). 다음 순번 Area 4.
>
> **Area 2 코드 품질 심층 분석 (2026-07-18T12:20):**
> - **방법**: `git fetch origin main`(HEAD `da50ec7` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81). Area 2 **46회차** — 직전 Area2(`c536e8b`, 07-16T19:37, 45회차) 이후 `src/routes`/`src/scripts`/`src/pages`/`migrations` churn = **8커밋**(`git log c536e8b..HEAD`): Area3/4/5/6/1 자체 chore 커밋 5건(각자 렌즈로 이미 심층 감사, #534~#540 생성) + 순수 신규 코드 커밋 3건 — `8cedfaa`(AR aging SSOT 통합 Phase2, `bank.ts`/`ledger/ar-helpers.ts`/`reports.ts` 37+39+27줄) + `03ff2f6`(손익허브 통합 Phase1, `financialReports.ts`/`reports.ts`/`financialReports.js`) + `057f73a`(생산허브 통합, `production.ts`/`productionReports.ts`/`productionReports.js`/`costAnalysis.js`) + `cced2ce`(XSS 자동수정, 이미 Area5 자체 커밋). Area2 고유 렌즈(entity_id INSERT·N+1·authMiddleware·컬럼/타입 불일치·dead code·SELECT *)로 세 신규 커밋 전부 직접 Read 재검증 — AR SSOT는 Area4가 39회차(`c9e4abc`)에서 이미 부분픽스 2건(#536/#537) 포착 완료라 중복 배제하고 Area2 고유 관점만 추가 확인.
> - **🟢 AR aging SSOT(`8cedfaa`) = Area2 렌즈 clean**: `buildOldestUnpaidJoin()`의 파라미터 바인드 순서 직접 대조 — `bank.ts:2398`(entityScoped:false, clients엔 entity_id 無이라 무관 전체합산 유지)·`reports.ts` aging/topAR 2곳(entityScoped:true) 전부 SQL 내 `?` 플레이스홀더 순서(efG→efP→efA→oup.g→oup.p)와 `.bind()` 인자 순서 일치 확인. `entityFilter(c,'g')`/`entityFilter(c,'p')`가 `order_billing_groups`/`payments` 양쪽 entity_id 컬럼 보유 확인(`migrations/0150`·`0305`). `AgingRow`/`topAR` 타입 변경(`days_since_payment`→`oldest_unpaid_date`) 후 프론트 소비처(`reports.js:451/457` `cl.days_overdue`) 재확인 — 필드명 불일치 없음(서버가 `days_overdue`로 매핑해 응답). N+1·SELECT * 신규 도입 0.
> - **🟢 손익/생산 허브 통합(`03ff2f6`/`057f73a`) = ID충돌·dead-code·lazy-init 가드 재검증 clean**: `?raw` concat 스코프 충돌(SKILL #475) 관점에서 생산허브 3파일(`production.js`+`productionReports.js`+`costAnalysis.js`) top-level 함수/var 선언 교집합 직접 추출 → 충돌 0건 확인(commit의 "IIFE 불요" 주장과 일치). 손익허브는 반대로 IIFE 래핑 사용(bare 전역 다수라는 커밋 근거 타당). `kpiOk`/`kpiError`(production.js 자체 KPI, id 유지) vs `prodAnaKpiOk`/`prodAnaKpiError`(흡수된 분석 KPI, 신규 프리픽스)로 실제 분리 확인 — 충돌 회피 주장 실증. `__prodAnaInit`/`__costInit`/`__finInit` 전부 `._done` 멱등가드 보유(재진입 안전). `costAnalysis.js`의 `__prodAnaDefer` 체크로 OPERATOR 403 방지(서버 `requireRole('ADMIN','MANAGER')`) 로직 확인 — 클라 가드는 UX용, 실제 방어는 서버 role 체크(기존 원칙과 일치). dead-code 확인: `financialReportsPage`/`productionReportsPage` 독립 라우트가 `index.tsx:432/486`에 여전히 마운트됨(커밋의 "라우트 보존" 주장 실증, 고아 export 아님).
> - **🟢 entity-audit.mjs CI 게이트 재실행 — Area6(#540) 이후 회귀 없음**: `node scripts/entity-audit.mjs` 직접 실행 → 검사 8테이블·SELECT 59·통과 56·누락 3(`bank.ts:1340/1352`+`cron.ts:180`, 전부 Area6이 기존 확인한 동일 3건, net-new 0) — Area6가 문서만 갱신하고 로직은 원복한 결정이 안전했음을 재확인(하드게이트 안정).
> - **🟢 `npx tsc --noEmit` 전체 재확인**: 에러 0(prod 배포 성공과 일치, 회귀 없음).
> - **🟢 backlog↔GitHub sync**: `search_issues(state:open,label:auto-improve)` 실측 **23건**(변동 없음, 신규 이슈 0) · done `search_issues(is:closed,reason:completed)`=**446**(변동 없음) · rejected 3(변동 없음, 재확인 생략 — 최근 3사이클 연속 무변동).
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — 이번 사이클은 신선 churn 자체가 작고(순수 신규 코드 3커밋) Area2 고유 렌즈로 봐도 전부 clean. AR SSOT의 실질적 결함(부분픽스 2건)은 이미 Area4가 자기 사이클에서 포착해 중복 여지가 없었던 것은, "여러 영역이 서로 다른 렌즈로 같은 churn을 감사해도 실질 발견은 그 결함에 가장 특화된 렌즈(Area4=데이터정합성 SSOT)가 먼저 잡는다"는 6영역 순환 설계의 정상 동작 사례.
> - 신규 이슈 0건, 자동수정 0건(수정 대상 없음), done-sync 변동 없음(new 23·done 446·rejected 3 정합 재확인). 다음 순번 Area 3.
>
> **Area 1 프로덕션 헬스 (2026-07-18T00:45):**
> - **방법**: `git fetch origin main`(HEAD `6910766` = origin/main 일치, 워킹트리 clean, detached). 프록시가 이번 세션도 prod 호스트 직접 curl을 차단(exit 56, 기존 33~44회차와 동일 제약, `cloudflare-observability` MCP도 미인증) — GitHub Actions 기록으로 대체. Area 1 **45회차** — 직전 Area1(`33953e2`, 07-16T12:16, 44회차) 이후 대형 churn 다수(경영진단 페이지 신설·사이드바 탭통합 리팩터 3건·자금허브 통합·ia-designer-loop MES판짜기·bank link-first 원장연동(0466)·designer_intakes XSS(#538) 등) — 전부 Area2~6가 각자 렌즈로 이미 심층 감사(신규 이슈 #524~#540 다수 생성) 완료. 이번 사이클은 배포체인/인프라 관점 재확인에 집중.
> - **🟢 배포체인 = 최신 HEAD 포함 전수 정상**: `deploy.yml` 직전 19회 실행(07-16T12:16~07-17T18:19) 전부 success. 최신 커밋(`6910766`, run #29603369516) job 단계별 = Typecheck/Build/Deploy/Smoke **전부 success**(스모크 18초, 18:20:18~18:20:32). `backup.yml`(Daily D1 Backup) 최근 8회 전부 success, 최신 07-17T17:57. `e2e.yml`은 여전히 `disabled_manually`(06-22 owner 비활성화 유지, 재발 아님).
> - **🟢 마이그레이션 드리프트 확인 — 0466(bank_purchase_payment_link) 적용 확정, 리스크 0**: `9077b86`(feat(bank): link-first ledger apply)이 0466 신설(`bank_transactions.matched_purchase_payment_id`/`matched_link_mode`)을 도입했고, 이 컬럼이 `bank.ts:448` **목록 SELECT**(smoke.cjs가 프로브하는 `/api/bank/transactions?limit=10`, `bank.txs`)에 명시 포함됨에도 그 변경이 배포된 merge(`0e66145`, run #29516038548)부터 이후 전 배포까지 smoke가 지속 green — SKILL #483/#484(code-only CI 배포, 마이그는 owner `db:migrate:prod` 수동적용) 패턴상 **이는 owner가 이미 마이그 적용을 완료했다는 강한 정황 증거**(미적용이면 list 프로브부터 `no such column` 500으로 즉시 FAIL했을 것). 드리프트 리스크 없음, 액션 불요.
> - **🟢 backlog↔GitHub sync**: `search_issues(label:auto-improve,state:open)` 실측 **23건**(직전 Area6 stats와 완전 정합, 변동 없음 — owner close 0, 신규 이슈 0). done(446)·rejected(3) 변동 없음.
> - **🧬 SKILL 강화 없음(신규 패턴 아님)** — 마이그레이션 적용 여부를 "그 컬럼이 smoke가 프로브하는 list SELECT에 포함되는데도 smoke가 green"으로 간접 검증하는 방식은 기존 #483/#484 레시피의 정상 적용 사례일 뿐, 새 클래스 아님.
> - 신규 이슈 0건, 자동수정 0건(수정 대상 없음), done-sync 변동 없음(new 23·done 446·rejected 3 정합 재확인). 다음 순번 Area 2.
>
> 📦 *(07-06~07-17 사이클 로그는 2026-07-20T19:20 6차 트림으로 `IMPROVEMENT_BACKLOG_ARCHIVE.md`로 이관 — 306KB→축소, 256KB Read 한도 재확보. 복원: 해당 아카이브 파일 또는 `git log -p -- IMPROVEMENT_BACKLOG.md`.)*

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 12건** — 2026-07-22T03:17 Area 4 42회차, `search_issues(state:open,label:auto-improve)` 직접 재확인 결과 직전 기재값 24가 대폭 stale로 판명. owner가 그 사이 20건 안팎을 대량 close — 개별 재검증 없이 GitHub 실측을 그대로 신뢰. #550·#551 신규 생성.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
| #551 | 신용위험 등급(credit-risk) high_risk 쿼리·calculate-all 내부법인 제외 누락(형제-비대칭) | Area 4 | improvement,S | issue-only, 현재 dormant(도달성 0)라 LOW |
| #550 | PENDING 급여 삭제 시 payslip_issuance_logs 교부증빙 고아화 | Area 4 | bug,S | issue-only, 정책판단 필요(삭제차단 vs 이력동반삭제) |
| #549 | 직원 셀프서비스 — 30분 토큰만료 시 목록화면 오류메시지 무시+재로그인 경로 없음 | Area 3 | bug,S | 미픽스 |
| #540 | entity-audit.mjs CI 게이트 커버리지 8/111테이블 — write-path 사각 | Area 6 | improvement,M | 문서 대응 완료(44회차), 로직 확장은 owner 정책 결정 대기 |
| #536 | AR aging SSOT 통합 부분픽스 — dashboard.ts만 구 방식(UTC julianday) 잔존 | Area 4 | bug,M | 미픽스 |
| #535 | bank LINKED 연결 경로 UNIQUE/재검증 부재 — 동시요청 시 원장 중복연결 | Area 4 | bug,S | 미픽스 |
| #528 | bank 출금→매입지급 적용 중복제출 방어 없음 — 이중지급/이중차감 | Area 2 | bug,M | **fixed-in-tree**(`1e1b620`, 원자적 claim-first 확인, 48회차), close-pending(owner 확인/close 대기 — 코드 수정은 이슈 close를 자동 수반하지 않음) |
| #526 | 부문 손익 자재비 — created_at UTC 미보정(KST 귀속오류) + 이동평균단가 비재현성 | Area 4 | improvement,S/M | 미픽스 |
| #525 | 부문 손익 P5 배부 — serves_department_id 미검증 + totalWeight=0 공통비 무음소실 | Area 4 | bug,S~S-M | 미픽스 |
| #520 | IA 크래시-하드닝 재큐 완료-콜백 세대가드 부재 → zombie write lost-update | Area 4 | bug,S | 미픽스 |
| #509 | 급여 중도입퇴사 일할계산 근거(근무일수/비율) 화면 미표시 | — | improvement,S~S-M | 미픽스 |
| #504 | 회사 인쇄정보 로드 실패 시 무음 처리 (CSV 포뮬러가드는 자동수정 완료, 로드실패 toast만 잔존) | — | improvement,S | 부분 자동수정됨, 잔존분 미픽스 |

> 이전에 "fixed-in-tree, close-pending"으로 표에 남아있던 #547·#545·#543·#542·#541·#539·#537·#534·#533·#532·#531·#530·#529·#527·#524·#522·#521·#519·#473·#548은 42회차 실측 open 목록에서 전부 확인되지 않아(=closed) 표에서 제거함 — 대부분 owner가 completed로 close, #543·#542·#541은 not_planned로 close(위 Rejected 카운트에 반영). #528만 close-pending 상태(코드는 픽스됨, GitHub 이슈만 owner의 명시적 close 대기 — 코드 수정이 이슈 close를 자동 수반하지 않으므로 정상 상태) 그대로 open 유지.

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
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
