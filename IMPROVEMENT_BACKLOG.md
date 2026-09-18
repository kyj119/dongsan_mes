# Improvement Backlog
<!-- last_run_area: 5 -->
<!-- last_run_at: 2026-09-18T23:20:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **4** (`list_issues(state:OPEN,label:auto-improve)` 실측, -2 — #651·#652 close) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **569** (`search_issues(label:auto-improve is:closed reason:completed)` 실측, +2) |
| ❌ rejected | **6** (`not_planned` 4 + `duplicate` 2, 실측, 변동없음) |

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

> **Area 2 코드 품질 심층 분석 (2026-09-18T10:20):**
> - **방법**: 세션 시작 시 detached HEAD `8cf8cd6`(origin/main과 동일) → 로컬 `main` 부재 → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. shallow clone이라 `git fetch --unshallow` 필요(앵커가 depth 밖). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `c54f68c`)**: 90커밋, 웹앱범위(`src/routes`·`src/types`·`src/utils`·`migrations`·`index.tsx`) diff 48파일 — 대부분(item_units·배송비박스청구·급여엑셀입력/오버라이드·4대보험기간축·kakao신기능·XSS bridge)은 Area1·4·5·6가 이번 순환에서 이미 각자 렌즈로 정독 완료(백로그 로그 확인). **Area1의 직전 사이클(HEAD `0949a01`) 이후 신규 5커밋**(`667a2ed8` perf·`899a020e` notify SSOT·`94850e9d`+`1e789451` caps 매핑화면·`8cf8cd66` barobill 코드표)만 전 Area 어느 로그에도 미등장 — Area2가 직접 정독.
> - **`667a2ed8`(perf: 페이로드/왕복/N+1) Area2 렌즈 검증**: `clients.ts` `has_po=1`·`purchaseCandidates.ts` 거래처-발주 집계·`items.ts` variant_count 전부 **상관 서브쿼리 → GROUP BY 선접기 → LEFT JOIN**으로 전환(CLAUDE.md "큰 쪽을 먼저 GROUP BY" 규칙과 코드 일치), N+1 아님(단발 집계 쿼리). `inventoryCount.ts` with_loss=1의 IN절은 `ids.slice(0,50)`로 D1 바인드 한도(100) 안전 확보(#458 클래스 자기예방). `userPrefs.ts` presets 병합은 user_id+page_key 스코프 유지, 응답형식 확장(하위호환, 기존 필드 불변)이라 API 변경 아님. entity_id 관련 테이블(clients/items) 전부 기존 스코프 유지, 신규 INSERT 없음. 결함 0건.
> - **`899a020e`(notify SSOT 일원화)·`8cf8cd66`(barobill 코드표) 검증**: 둘 다 순수 로직/상수 파일(라우트 SQL·auth 변경 없음), `noticePolicyFor`가 `constants/deliveryMethod` SSOT로 위임 리팩터링(중복 판정 로직 제거 = dead code 정리 방향과 합치), `kakao.ts`의 `withStatus` 헬퍼는 응답 필드 추가(`status_label`/`status_kind`/`status_code`)뿐 기존 필드 보존. 결함 0건.
> - **`94850e9d`+`1e789451`(CAPS 매핑 화면 + 전법인 드롭다운) entity 격리 렌즈 검증**: 신규 `GET /api/caps/map-employees`가 `entityFilter` 없이 **전 법인** 직원을 반환하지만, 커밍 메시지·주석이 명시하듯 CAPS 사이트 자체가 법인횡단 개념이고 `authMiddleware+requireRole('ADMIN','MANAGER')` 게이트 + 응답필드 최소화(급여/주민번호 제외)로 설계된 의도적 예외(기존 FP클래스 "정당한 cross-entity" 해당, #652 IDOR 클래스와 달리 read 자체가 인가된 화면 전용 액션이고 신원 열람 범위가 최소). 신규 이슈화 불필요.
> - **dead code 스캔(신규 유틸 8개 export 전수)**: `kakaoIdentity.ts`·`shipBilling.ts`·`shipmentNotice.ts`·`itemUnits.ts`·`barobillMessagingCodes.ts` 등에서 grep 0-refs로 뜬 심볼(`KAKAO_IDENTITY_KEYS`·`shipDelayDays`·`NOTICE_POLICY`·`noticePolicyFor`·`deriveLegacyPair`·`unitsFromLegacyPair`·`KAKAO_SEND_STATUS` 등) 전수 재확인 = **전부 FP**(grep이 자기 파일 내부 참조를 제외했거나 `scripts/*-selftest.cjs` 전용 소비자를 `--include` 밖에 뒀던 것 — 실제로는 자기 파일 내 사용 또는 전용 픽스처 테스트(`test:calc` 체인 소속)가 import). 신규 계산규칙마다 픽스처 테스트를 같이 만드는 이 프로젝트 관행(CLAUDE.md)과 합치 — codify 불요(기존 dead-code 레시피가 이미 이 클래스를 전제).
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·누락 **0건**(변동없음). item_units/shipping_fee_by_boxes 신규 테이블 = items/order_items 종속(entity_id 자체 없음, 기존 FP클래스⑤) 확인.
> - **standing scan 2: authMiddleware recursive 스캔** — 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 직전 사이클과 동일 — **net-new 0**.
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런 — 7 success + 1 cancelled(연속 push로 즉시 superseded, 정상) + 1 in_progress(현재 HEAD `0ccd0dc` 문서커밋).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **8**(변동없음) — 전건 Area2 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **8**(변동없음) · done **567**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식). 신규 5커밋이 기존 레시피(GROUP BY 선접기·D1 바인드 청크·정당 cross-entity·dead-code FP)로 전부 커버돼 새 클래스 없음.
> - **백로그 트림 체크**: 사이클 로그 9건 → 이번 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(5커밋 직접 정독 + 나머지 43파일 타 Area 재확인 완료, net-new 0), 자동수정 0건(고칠 결함 없음), done-sync: open 8(변동없음)·done 567(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-17T17:00):**
> - **방법**: 세션 시작 시 detached HEAD `0949a01`(origin/main과 동일) → 로컬 `main` 부재 → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. shallow clone(depth 50)이라 `git fetch --unshallow` 먼저 필요했음(앵커가 depth 밖). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `6eae801`)**: 82커밋, 웹앱 헬스범위(`src/routes`·`src/utils`·`index.tsx`·`wrangler.toml`·`.github/workflows`·`scripts/smoke.cjs`·`migrations`) diff **46파일**. 대부분 Area2~6가 이번 순환에서 이미 각자 렌즈로 정독 완료(item_units·배송비박스청구·급여엑셀입력·4대보험기간축·kakao신기능 — 백로그 로그에 서술 확인). Area1 고유 확인 = `.github/workflows/deploy.yml`(+6, JWT decode audit 게이트 신설 — CLAUDE.md 서술과 일치, smoke 프로브·라우트 변경 없음, 리스크 0) + **smoke 커버리지 자체 점검**.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `0949a01` 포함). 최신 job(`105291624109`) 전 단계(typecheck·check:fn·jwt-decode·build·self-tests·entity audit·migration-number audit·write canary·deploy·smoke) 전부 success, 총 소요 2분29초.
> - **smoke 129/129 PASS**(job 로그 직접 확인, 로그인 정상·프론트 부트스트랩 정상).
> - **#636(cashSchedule.overview) 재확인**: 이번 배포 3503ms, owner 국내 실측(421~424ms) 대비 배수 ≈8.3배 — 기존 확인 범위(9~14배)보다 오히려 낮음(악화 아님), 재이슈 불필요.
> - **🔧 자동수정 — kakao·item_units 신기능이 smoke 커버리지 0인 사각 발견 + 메움**: churn 46파일 중 `kakao.ts`(+99, 알림 발송 통계/정체성 분리 신기능)와 `items.ts`(+77, item_units 단위표 신기능, 0619 신규 테이블)에 신규 GET 라우트가 여럿 생겼는데 `scripts/smoke.cjs`에 `kakao`·`units` 문자열이 **0건**(`grep` 확인) — #484 (b)-risk 클래스(신규 테이블/컬럼을 참조하는 핸들러가 smoke 사각). DB전용 4개만 추가(바로빌 실호출 하는 `/templates`·`/balance`는 제외): `kakao.settings`(`GET /api/kakao/settings`)·`kakao.statsMonthly`(`GET /api/kakao/stats/monthly?months=1`)·`items.unitsFlag`(`GET /api/items/units-flag`)·`items.units`(`GET /api/items/1/units`, allow404). `node --check` 통과, `npx tsc --noEmit`+`npm run build` clean. 커밋해 반영.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 2: `npm run audit:migration-number`** — 파일 630+개, 중복 번호 다수(기존과 동일 클래스, 신규 `0621`×2 무해), **같은 테이블 DDL 충돌 0건**.
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **8**(변동없음, #652·#651·#650·#648·#647·#626·#617·#616) — 전건 Area1 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **8**(변동없음) · done **567**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 기존 #484 (b)-risk 규칙을 신규 사례(kakao/item_units)에 그대로 적용한 것으로 새 클래스 아님. area-1-production-health.md `line N` 패턴 재확인(2건 모두 ms 수치 숫자열 FP, 잔여 0건, 변동없음).
> - **백로그 트림 체크**: 사이클 로그 8건(직전 66회차 트림 직후) → 이번 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(smoke 사각은 issue 아닌 직접 자동수정으로 처리), 자동수정 1건(smoke.cjs 프로브 4종 추가, verify clean), done-sync: open 8(변동없음)·done 567(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-17T15:40, 66회차):**
> - **방법**: 세션 시작 시 detached HEAD `6f8261a`(origin/main과 동일) → 로컬 `main` 부재 → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 65회차 세션 HEAD `02eb83e`)**: `git log 02eb83e..HEAD` 50커밋, 웹앱범위 diff 75파일 — item_units(5커밋)·4대보험 기간축(1커밋)·급여 엑셀입력/결근공제/야간시간(6커밋)·배송비 박스청구(4커밋)·Linear UI 리디자인(2커밋)·perf 인덱스(1커밋), 나머지는 auto-improve 자기순환 chore 5건 + journey/status 문서. 전 커밋이 이번 사이클 Area1~5 로그에 개별 서술로 이미 등장(#600 "나열 vs Read" 대조 — 어느 것도 목록전용 누락 없음). **비웹앱 축**(`LogWatcher`·`IllustratorAutomat`·`caps-worker`·`workers`·`queue`, 62회차 룰) = 1커밋(`3057098`)뿐이고 `IllustratorAutomat/ARCHITECTURE.md` docs-only(실행코드 0) → 정독 대상 없음.
> - **컬럼-diff bridge(Area4 미검토 구간 보완)**: Area4 09:44 사이클은 `429792a`(0617)까지만 보고 `0618`(d37f443, deduction_overrides)·`0619~0622`(item_units·absent_deduction·external_name/night_hours) 4개 마이그는 다음 Area4 로테이션(4사이클 뒤)까지 미검토 상태 — Area6가 선제 검증. `payroll/core.ts` UPSERT(:461-537)의 named 컬럼 49개(literal 3 제외 46개 `?`)와 bind 인자 46개를 순서대로 대조 = **1:1 일치**(deduction_overrides/absent_deduction/night_hours/holiday_hours 전부 정확한 위치), `ON CONFLICT ... DO UPDATE SET`에도 신규 4컬럼 반영 확인. `utils/itemUnits.ts` 전 함수(`replaceItemUnits`·`syncUnitsFromPair`·`backfillPoLineFactors`·`applySalesUnitSnapshots`)의 INSERT/UPDATE 컬럼명이 0619/0620 스키마와 전부 일치, NOT NULL-no-default 컬럼(`item_id`·`unit`·`factor`) 전부 바인딩, 실패해도 호출부를 막지 않는 catch 가드 확인. 결함 0건.
> - **XSS bridge 확장분 표본 재확인**: Area5가 "배송비/급여 신기능 신규 innerHTML 싱크 없음"이라 결론냈으나 표본이 `orders.js`뿐이라, `payroll.js`(+586줄, 엑셀 붙여넣기 자유텍스트 파싱)·`items/units.js`(신규, 146줄)를 직접 대조 — `payroll.js`의 붙여넣기 오류 메시지(`errors.map(prEsc).join('<br>')`, 라인 826)·미리보기 표(employee_code/name 전부 `prEsc`, 라인 849-850)·직원 셀렉트 옵션(`escapeHtml`, 라인 20-44) 전부 이스케이프 일관 적용. `items/units.js`의 단위명 입력(`escapeHtml(r.unit)`)도 동일. **부분-escape(A-024/A-025) 클래스 재발 0건**.
> - **N+1 FP 신규 서브클래스 발견 + codify**: `shippingFee.ts:syncShippingFeeFromBoxes`의 `for (const o of group.orders)` 루프 안에 쿼리 3종(billing_status 조회·라인 조회·UPDATE)이 있으나, 반복 대상이 `orders` 전체가 아니라 **합배송 묶음 하나**(물리적 박스 개수 규모)로 이미 좁혀진 하위집합이라 코드상 `LIMIT` 상수가 없어도 bounded — 기존 N+1 FP 규칙(16회차)의 "하드코딩 상한"만으로는 이 케이스를 못 걸러 area-6 파일에 서브클래스로 codify(신규 이슈화 보류).
> - **done-sync 절대값 재동기화**(리터럴 쿼리): `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **567**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **8**(변동없음, #652·#651·#650·#648·#647·#626·#617·#616).
> - **open≠unfixed 재확인**: #651(`deriveOrderType` dedup 버그) — `helpers.ts:536-545` 코드 직접 대조, 안티패턴(`ids.length !== items.length`) 그대로 잔존 = 정상 open. #647·#648 — `issue_read(get)`로 본문 대조, "fixed-in-tree" 노트가 코멘트가 아니라 **이슈 본문 자체에 owner에게 close 요청과 함께 기록**돼 있음을 확인(Area3 65회차 서술과 일치, close-pending 정상). #626·#616·#617 — owner 코멘트 근거 unchanged(파일 churn 0, 32회차 캐시 신뢰 규칙 적용, 재검증 skip).
> - **standing scan**: `audit:migration-number`(24쌍, 신규 `0621`×2 무해 확인, 같은테이블 충돌 0) · `sort-audit.cjs`(P1 0, P2 4건 기존 FP 유지) · `branch:clean`(삭제대상 0) · `npm audit --omit=dev`(0건) · `audit:skills`(OK) · CI 최근 5런 전부 success(최종 HEAD `6f8261a` 포함).
> - **🧬 SKILL 강화**: area-6-self-evolution.md에 신규 FP 서브클래스 1건 추가(N+1 — "루프 소스가 이미 좁혀진 실물 하위집합이면 LIMIT 상수 없이도 bounded"). `line N` 잔여참조 없음(이미 서술식).
> - **백로그 트림 체크**: 사이클 로그 12건 → 이번 추가 후 13건, 임계 도달 → `npm run backlog:trim` 실행(아래 결과 반영).
> - 신규 이슈 0건(컬럼-diff·XSS bridge·N+1 전수 재확인 net-new 0, 기존 오탐 규칙에 서브클래스 1건만 codify), 자동수정 0건(고칠 결함 없음), done-sync: open 8(변동없음)·done 567(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-17T11:10):**
> - **방법**: 세션 시작 시 detached HEAD `1e50a2e`(origin/main과 동일) → 로컬 `main` 부재 → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 사이클 세션시작 HEAD `c002a9e`)**: `git log c002a9e..HEAD` 50커밋, 웹앱 보안범위(`src/routes`·`src/middleware`·`src/utils`·`index.tsx`·`wrangler.toml`·`.github/workflows`) diff는 **30파일** — item_units(품목 다단위표) 신기능 5커밋·배송비-박스청구 신기능 4커밋·급여 엑셀입력/결근공제 5커밋·4대보험 기간축 1커밋(Area4가 이미 기록) + UI 리디자인 2커밋(Area3 기록) + perf 인덱스(Area1 기록). Area4/1/3 기록분 제외한 **item_units·배송비·급여 3개 신기능**을 Area5 고유 렌즈(entity 격리·IDOR·인증·인젝션·XSS)로 직접 정독.
> - **item_units(품목 단위표) 신규 라우트**(`items.ts` `GET/PUT /:id/units`) — `items`는 entity_id 컬럼 자체가 없는 전역 마스터(FP클래스⑤ 확장 확인, `grep migrations`로 실증) → entityFilter 불요가 정상. PUT은 `requireRole('ADMIN','MANAGER')`, GET은 읽기전용. `utils/itemUnits.ts` 전체 SQL 파라미터 바인딩 확인(`applySalesUnitSnapshots`의 `${table}`은 호출부 5곳 전부 하드코딩 리터럴 `'order_items'|'quotation_items'`만 전달 — 인젝션 경로 아님). `migration.ts /items/import`(ADMIN 전용 라우터 `.use`)도 동일 유틸 재사용, 결함 0.
> - **배송비-박스청구 신기능(`shipments.ts`+115, `shippingFee.ts` 신규, `shipBilling.ts`+49) 직접 정독 → net-new 1건 발견(issue화)**: 신규 `POST /consolidation-pending`(`shipments.ts:286`)이 요청 body의 `order_ids`를 **entityFilter도 호출자 entity 검증도 없이** `orders` 테이블 자기조인에 그대로 바인딩 — 같은 파일의 형제 `GET /pending-confirm`(:303)은 `entityFilter(c,'o')` 적용이라 대조됨. 기존 FP클래스("합배송은 client-scope가 정당한 격리축", 29회차)는 **호출자 자신의 주문을 대상으로 하는 write 경로**에 한정된 판정인데, 이 엔드포인트는 read이고 `me`(대조 기준 주문) 쪽조차 검증이 없어 그 판정이 적용 안 됨 — 임의 order_id(정수 순차 채번, 추측 용이)로 타법인 order_number·delivery_date·client_name·entity_name 열람 가능. 프론트 호출처(`orders.js:105 bulkShipSelected`)는 화면에서 체크된(=이미 entity로 걸러진) id만 보내 정상 흐름은 안전하지만, API 자체는 직접 호출 시 무방비(#334 도달성 확인 — 정상 흐름 도달 O, 그 경로가 임의 id를 안 보낼 뿐 서버 가드는 없음) → **#652 등록**(S, IDOR 클래스라 자동수정 금지 — owner 픽스 워크플로). `syncShippingFeeFromBoxes`(shippingFee.ts)는 이미 entity-검증된 shipment PATCH 내부에서만 호출되는 헬퍼라 별도 격리 불요(전부 파라미터 바인딩, 인젝션 없음). `cards/lifecycle.ts`의 `applyShipBillingDates` 호출 3곳은 기존에 이미 소유권 검증된 카드/주문 컨텍스트 내부 호출이라 결함 없음.
> - **급여 엑셀입력·결근공제 신기능(`payroll/{core,shared,records,settings}.ts`, `hr.ts`, `leaves.ts`) Area5 렌즈 재확인**: 순수 계산식 변경(결근공제·야간휴일시간 저장·공제 오버라이드)이라 Area4가 이미 계산정합성으로 검증했으나, 보안 관점(auth·injection)만 별도 확인 — `/save`·`/batch`·`/sync-attendance` 전부 `requireRole('ADMIN','MANAGER')` 라우터-와이드 유지(변동없음), `deduction_overrides` JSON은 `parseDeductionOverrides`가 화이트리스트 키(`np/hi/ltc/ei/it/lt`) + `Number()` 강제 검증 후 저장이라 임의 컬럼 주입 불가, 신규 SQL 전부 파라미터 바인딩. 결함 0.
> - **필수 grep(Area5 #338)**: 시크릿 폴백 `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43`(`BAROBILL_FTP_PASSWORD || ''`) 1건, 그러나 이번 churn(c002a9e..HEAD) 무관 파일(변경 0)이라 재보고 대상 아님 + 빈 문자열 폴백이라 애초에 하드코딩 자격증명 아님(안전 패턴). 기본 비밀번호 패턴 0건.
> - **XSS**: 배송비/급여 신기능은 신규 innerHTML 싱크 없음(`orders.js` 합배송 파트너 confirm 문자열은 `showConfirm()`으로 렌더 — 텍스트 dialog, HTML 파싱 없음 → escapeHtml 불요 확인).
> - **standing scan 1: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**. P2 **4건**(기존 3건 FP 유지 + **신규** `itemUnits.ts:162` `loadItemUnits` `ORDER BY is_base DESC, sort_order, factor`) — 품목당 최대 6행의 표시 순서용 목록이라 동값 시 결과가 뒤섞여도 업무 영향 없음(페이징 없음, 소규모 고정 집합) → 이슈화 보류, 다음 Area1/4 사이클에서 P2 누적 재확인.
> - **standing scan 3: `npm run audit:migration-number`** — 파일 630+개, 신규 중복 `0621`(`0621_payroll_absent_deduction.sql`·`0621_shipping_fee_by_boxes.sql`) 포함 총 20쌍대, **같은 테이블 DDL 충돌 0건**.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 5런 전부 `conclusion:success`(최종 HEAD `1e50a2e` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **7**(#651·#650·#648·#647·#626·#617·#616, 변동없음, 이번 사이클 net-new #652 추가로 8) — #650도 Area5 자신의 직전 발견(entity 격리 누락 클래스, #652와 동형) 재확인만, 아직 owner 미처리.
> - **backlog↔GitHub 절대값 재동기화**: open **8**(+1, #652 신규) · done **567**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(원문 그대로 보존, 이미 서술식 인용 병기됨). 이번 사이클 net-new(#652)는 기존 FP클래스("client-scope cross-entity"의 read/write 구분)를 정교화하는 사례라 다음 유사 발견 시 참조할 수 있도록 위 로그에 구분 기준 명시(별도 area 파일 수정은 불요 — 기존 FP클래스 문서가 이미 "write path" 한정을 명시하고 있어 이번 케이스는 그 경계 밖임을 재확인한 것뿐).
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` 대상 — 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#652, S, IDOR 클래스 issue-only), 자동수정 0건(IDOR은 자동수정 금지 대상), done-sync: open 8(+1)·done 567(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-17T09:44):**
> - **방법**: 세션 시작 시 detached HEAD `429792a`(origin/main과 동일) → 로컬 `main`은 stale(`02eb83e`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 세션시작 HEAD `837b718`)**: `git log 837b718..HEAD` 30커밋, `git diff --stat -- src/routes src/utils migrations`는 8파일 — `migrations/0616`(인덱스, Area1 기록완료)·`migrations/0617`+`src/routes/{hr,leaves,payroll/core,payroll/settings,payroll/shared}.ts`+`statusLabels.ts`(전부 `429792a` 4대보험 기간축 전환 단일 커밋). 나머지 22커밋(UI 리디자인 2종·check:fn 게이트·IA 에이전트 이관 5건·journey 문서화)은 Area1/2/3/5/6가 이번 순환에서 이미 각자 렌즈로 정독 완료(백로그 로그 확인) → Area4 고유 미검토 대상은 `429792a` 하나.
> - **`429792a`(insurance_rates 기간축 전환 + 가입예외 메모) 데이터정합성 직접 검증**: ① 마이그(`0617`) — `UNIQUE(year,type)→UNIQUE(type,effective_from)` 재생성이 CREATE v2→`INSERT OR IGNORE ... SELECT`→DROP→RENAME 정석 패턴, `insurance_rates.id`를 참조하는 FK 0건(재생성 안전) · 2026 국민연금 상/하반기 분리 INSERT·UPDATE 둘 다 `WHERE insurance_type=... AND year=... AND effective_from=...` 값기반 조건이라 빈 DB에서 no-op(prod row-id 하드코딩 위험군 아님, CI bootstrap 안전). ② `loadInsuranceRates(db, refDate)` — `ORDER BY insurance_type, effective_from DESC, id DESC` 후 첫 행만 채택하는 로직이 "과거연도 행이 effective_to NULL이어도 최신이 이긴다" 주석과 정확히 일치. ③ **호출부 전수 대조**(`grep -rn "loadInsuranceRates\|calcDeductions("`) — `payroll/core.ts` 4곳(174/389/574/646/796/887)·`leaves.ts`(1186/1218) 전부 신 시그니처 `rateRefDate(payPeriod, year)`로 마이그레이션 완료, 구 시그니처(`loadInsuranceRates(db, year)`) 잔존 호출 0건 — leaves.ts는 이번 커밋에서 정확히 그 구시그니처를 고쳤고 `payPeriod` 필드도 함께 추가(반쪽 마이그레이션 없음). ④ `settings.ts` PUT/DELETE/COPY — 조회·수정·삭제 키를 `(type, effective_from)`으로 통일(설명 주석 "year+type으로 찾으면 하반기 저장이 상반기 행을 덮어쓴다" 그대로 구현), DELETE는 기간 미지정+복수행이면 400 가드, COPY는 `substr(effective_from,5)` 로 연도만 치환(날짜 포맷 불변). 결함 0건 — 이미 올바르게 설계·구현된 상태(§4대보험 CLAUDE.md 서술과 코드 100% 일치, 자체 게이트 `test:insurance-period` 24항목 보유).
> - **standing scan 1: `npm run audit:migration-number`** — 파일 630+개, 중복 번호 20쌍(기존과 동일 클래스), **같은 테이블 DDL 충돌 0건**(0617 신규 번호 충돌 없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `429792a` = 이번 4대보험 배포 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **7**(#651·#650·#648·#647·#626·#617·#616, 변동없음) — #651은 Area4 자신의 직전 발견(deriveOrderType), 나머지 Area4 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **7**(변동없음) · done **567**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md 서술 참조 재확인(이미 서술식, `line N` 잔여 없음). 이번 사이클은 대형 단일 커밋(429792a)이었으나 저자가 이미 「저장 컬럼 재생성 시 FK 확인」·「호출부 전수 시그니처 이관」·「빈 DB no-op 데이터 마이그」 같은 기존 Area4 codify 원칙을 스스로 준수해 신 결함·신 클래스 모두 0.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` 대상 — 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(단일 대상 커밋 직접 정독, net-new 0 — 자체설계·자체게이트 완비), 자동수정 0건(고칠 결함 없음), done-sync: open 7(변동없음)·done 567(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
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
