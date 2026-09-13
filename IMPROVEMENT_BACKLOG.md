# Improvement Backlog
<!-- last_run_area: 1 -->
<!-- last_run_at: 2026-09-13T09:43:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **6** (`list_issues(state:OPEN,label:auto-improve)` 실측, 3→6 — 이번 사이클 신규 #647·#648·#649) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **566** (`search_issues(reason:completed,label:auto-improve)` 실측, 변동없음) |
| ❌ rejected | **6** (`not_planned` 4 + `duplicate` 2, 실측, 변동없음) |

> **Area 1 프로덕션 헬스 (2026-09-13T09:43):**
> - **방법**: 세션 시작 시 detached HEAD `dbfc031`(origin/main과 동일) → 로컬 `main`은 stale → `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `6557073`)**: 웹앱 헬스범위(`src/routes`·`src/utils`·`index.tsx`·`wrangler.toml`·`.github/workflows`·`scripts/smoke.cjs`) diff **2커밋뿐**(전체 16커밋 중) — `b87e8f1`(펀칭 계산축 통일, Area2/3/5/6이 이미 "순수계산·DB/인증 접근 0"으로 판정) · `68bca29`(#646 수정, Area2/4/5가 바인드순서·entity격리까지 이미 검증). 신규 검토 대상 없음(둘 다 재확인만).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `dbfc031` 포함). 최신 배포 job(`103603010749`) 전 단계(typecheck·build·self-tests·entity audit·migration-number audit·write canary·deploy·smoke) 전부 success.
> - **smoke 129/129 PASS**(job 로그 직접 확인) — 이번 churn(펀칭·#646)에 신규 라우트 없어 프로브 갭 없음. 마이그레이션 신규 0건(0613이 마지막, 직전 사이클에 이미 분류 완료) — (a)/(b) 드리프트 분류 대상 없음.
> - **#636(cashSchedule.overview) 재확인 — 배수 유지, 재이슈 불필요**: 이번 배포 smoke = **4571ms**(예산 2000ms 대비 초과, 직전 4552ms에서 소폭 상승). owner 국내 실측(421~424ms) 대비 배수 ≈10.9배로 기존에 owner가 검증한 9~14배 범위 안 — area 파일 codify된 규칙대로 배수 자체가 깨졌다는 증거 없이는 재이슈하지 않음.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 3: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#649·#648·#647·#626·#617·#616, 변동없음) — 전건 Area1 관할 밖(Area3/5/6), 재조치 불요.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · done **566**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md 기존 codify 규칙(배수 판정)이 이번 사이클에 그대로 재적중, 새 클래스 발견 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` 대상 — 사이클 로그 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(2커밋 churn 전량 타 Area 재확인 완료, CI green·smoke 129/129·#636 배수 유지), 자동수정 0건(고칠 결함 없음), done-sync: open 6(변동없음)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-12T13:10):**
> - **방법**: 세션 시작 시 HEAD `e155373`(origin/main과 동일) → `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 방법 라인 HEAD `3e69c08`)**: 웹앱 범위 diff **26커밋**. `#600` 브리지(「churn 목록에 나열됨 ≠ Read됨」) 적용 — 26개 해시를 백로그에서 grep해 개별 커버리지 대조: 5건은 Area1~5 자신의 사이클 로그 커밋(자기참조, 검토 대상 아님) · 17건은 다른 Area가 이미 구체 로직(파일·라인)으로 정독 완료(`b87e8f1`펀칭축 통일·`68bca29`#646수정·`681417f`rate-limit·`908c7e5`마이그게이트 등) · **4건이 어느 로그에도 언급 0건**: `d0b5b6b`(문서만, PROJECT_STATUS 배너)·`8b49fdb`(journey e2e 테스트+스냅샷 fixture만, 프로덕션 코드 0)·`f659a1a`·`7a23c95`(IA 축, 아래 직접 검토).
> - **`f659a1a`(레거시 JSX 폐기+empty-catch 게이트 367곳) 직접 검토 — net-new 결함 0건**: 구 `mes-core.jsx`/`mes-sheet.jsx`(07-28 진입점 폐기 후에도 9월까지 편집이 이어지던 죽은 코드)를 저장소에서 제거(Z: `_retired/`로 이동, git 이력 보존) + impose 탭 잔재(43줄 분기·6개 lookup 경고) 제거 + 신설 `audit:empty-catch` 게이트(사유 없는 빈 catch 차단)를 편집훅·커밋훅·`ia:deploy` GATES 3곳에 배선 — 이 세션에서 `npm run audit:empty-catch` 재실행 = **367곳 전부 사유 있음, 통과**. `cut:butt`(53건)·`cut:placement`(38건) 재실행 전부 PASS(회귀 0). `cut:smoke`/`panel:smoke`는 이 샌드박스의 Playwright가 `chromium_headless_shell-1194`만 보유(프로젝트 요구=1217, 리비전 불일치)라 미실행 — 코드 결함이 아니라 이 원격 환경의 브라우저 버전 고정 한계(README 기존 안내와 동일 클래스), owner PC 실행 시 커밋 메시지에 이미 기록된 자체검증(367/367·220·548)을 신뢰.
> - **`7a23c95`(cut 배포 도구 버전 미스매치 수정) 직접 검토**: `cut-main.js`/`mes-lock.jsx`가 사유 주석만 바뀌고 버전번호가 그대로라 `ia:deploy`가 배포 거부하던 것을 버전 bump(0.85.0→0.86.0, 1.1.0→1.1.1)로 해소 — 동작 변경 없음, `npm run cut:shellsync` 재실행 30/30 PASS.
> - **비-웹앱 축 standing scan(#616/#617 클래스)**: `git log 3e69c08..HEAD -- LogWatcher IllustratorAutomat caps-worker workers queue`로 별도 재확인 — 이번 사이클 신규 churn은 위에서 이미 직접 검토한 IA 2건(`f659a1a`·`7a23c95`)뿐, LogWatcher(C#/PowerShell 축) 신규 커밋 0건. 직전 62회차가 발견한 #616/#617(LogWatcher 파서 클래스)은 이번 churn과 무관, 재검토 대상 아님.
> - **close-pending 캐시 재확인**: #616·#617 — `updated_at` 08-31 이후 변동 없음(코멘트 수 2건 그대로), owner가 "장비 롤아웃+실기 확인 대기"를 이미 명시했으므로 64회차 FP룰대로 재통지 불요. #626 — Area5가 이번 사이클 직전(11:40)에 이미 owner 판정 최신 확인 완료, 추가 조치 없음.
> - **standing scan 1: done-sync 절대값 재동기화(리터럴 쿼리)** — `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **566**(변동없음) · `reason:not_planned` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **6**(#649·#648·#647·#626·#617·#616, 변동없음).
> - **standing scan 2: `npm run test:calc`** 26항목 체인 — 전항목 PASS(회귀 0, 이번 churn에 계산축 변경 없음).
> - **standing scan 3: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `e155373` 포함).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · done **566**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 새 클래스 발견 없이 기존 3개 레시피(#600 브리지·비-웹앱 축 scan·close-pending 캐시)가 그대로 적중 — #600 브리지가 26커밋 중 4건의 미검토 후보를 정확히 골라냈고, 그중 IA 2건은 이미 자체 게이트(empty-catch/cut:butt/cut:placement/cut:shellsync)로 커밋 시점에 검증되어 있었음을 재확인.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(26커밋 churn 전량 #600 브리지+비웹앱축 scan으로 clean 확정, IA 2건 직접검토 net-new 0), 자동수정 0건(고칠 결함 없음), done-sync: open 6(변동없음)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 4 데이터 정합성 (2026-09-12T10:35):**
> - **방법**: 세션 시작 시 detached HEAD `fa55ecc`(origin/main과 동일) → `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 최종 HEAD `b0ee03aa`)**: 데이터/스키마 범위(`src/routes`·`src/utils`·`migrations`) diff **4커밋**뿐 — 신규 마이그 1건(`0613_receipt_item_received_packs.sql`)이 직전 Area4 사이클이 issue-only로 보고한 **#646(롤 입고취소 시 received_packs 미역산)의 수정 커밋(`68bca29`)**. 나머지 3커밋(펀칭 계산축 통일·로그인 한도/중복결제·문서)은 Area1/2/3/5가 이미 각자 렌즈로 정독 완료 확인.
> - **#646 수정 전문 재검증(데이터정합성 렌즈) — 정확히 고쳐짐, 회귀 0**: `inventory_receipt_items.received_packs`(0613, `REAL DEFAULT 0`, 기존 행은 0/NULL이라 취소해도 0차감=no-op) 신설 → `po-receive.ts:336-347` INSERT가 `p.receivePacks`를 스냅샷 → `inventory.ts:704` 취소 롤백 SELECT가 그 컬럼을 읽어 `po_item`별 합산(`aggByPoItem[pid].packs`) → UPDATE의 `received_packs = MAX(0, COALESCE(received_packs,0) - ?)` + `line_status` CASE가 `qty_is_estimate=1 AND order_packs>0`일 때 팩 축, 아니면 수량 축으로 정방향(`po-receive.ts`)과 대칭 판정. **바인드 순서 10개소 전수 대조**: SQL `?` 순서(recv,acc,rej,packs,packs,packs,recv,recv,poItemId,poId) ↔ `.bind(r.recv,r.acc,r.rej,r.packs,r.packs,r.packs,r.recv,r.recv,r.poItemId,poId)` 1:1 일치(#642류 "파라미터 한 칸 밀림" 클래스 재발 없음). 커밋 자체가 로컬 D1 E2E(2롤→3롤 입고 후 3롤분 취소 → 5→2, PARTIAL 전이, 큐 재노출)로 이미 검증됨 — 재현 로그 확인.
> - **`db:bootstrap:ci` 전량 재적용** — 628개 전건 ✅(CHECK/FK 위반 0), 0613 신규 컬럼 포함 정상 적용.
> - **standing scan 1: `npm run audit:migration-number`** — 중복 23쌍(변동없음, 0613은 신규 유일 번호라 중복 아님), 같은 테이블 DDL 충돌 0건.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **prod 직접조회 축(`audit:orphan-schedule` 등 `--remote` 스크립트)**: 이 세션엔 `CLOUDFLARE_API_TOKEN` 미설정 — `wrangler d1 execute --remote` 인증 실패 확인(egress 프록시 자체는 통과, wrangler 인증 단계에서 거부). prod 데이터 직접조회 불가 사이클 — 코드/마이그 diff 분석 + 로컬 D1 스키마 정합으로 대체(CLAUDE.md Ground-truth 기법과 일치).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `fa55ecc` 포함, `db:bootstrap:ci`가 CI에서 0613 포함 628건 통과 재확인).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#649·#648·#647·#626·#617·#616, 변동없음) 전건 Area4 관할 밖(Area3/5/6).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · done **566**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 새 클래스 발견 없이 직전 사이클이 issue-only로 낸 발견(#646)의 수정을 데이터정합성 렌즈(바인드 순서·no-op 하위호환·정방향 대칭)로 재검증 — 기존 「증분 컬럼 도입 시 형제 취소/롤백 경로 재확인」 원칙이 정확히 적중.
> - **백로그 트림 체크**: 사이클 로그 13건 → 임계(13건) 도달 → `npm run backlog:trim -- --check` 실행 후 트림.
> - 신규 이슈 0건(churn 4커밋 전량 clean, #646 수정 재검증 완료), 자동수정 0건(고칠 결함 없음), done-sync: open 6(변동없음)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 5 보안 + 인프라 (2026-09-12T11:40):**
> - **방법**: 세션 시작 시 detached HEAD `4b60c53`였으나 로컬 `main`은 `eecca71`(stale, unrelated-histories — shallow-clone 앵커 유실 클래스, force-push 아님) → `git fetch origin main`으로 origin이 `4b60c53`로 갱신 확인 후 `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `7806623`)**: 웹앱 보안범위(`src/routes`·`src/utils`·`src/middleware`·`index.tsx`·`wrangler.toml`·`.github/workflows`) diff **5커밋**(전체 26커밋 중) — `681417f`(로그인 rate-limit 계정별 분리+중복결제 400화)·`68bca29`(#646 수정, Area4가 이미 데이터정합성 렌즈로 바인드순서까지 검증)·`b87e8f1`(펀칭 계산축 통일, Area2/3가 이미 "순수계산·DB/인증 접근 0"으로 판정)·`908c7e5`(마이그 번호 충돌 게이트, 스크립트 신설)·`b76c4ee`(문서만). 보안 렌즈 우선순위 = ①신규 rate-limit 로직 자체 검증 ②#646 수정의 entity 격리 회귀 여부 ③GitHub Actions 워크플로 재확인.
> - **`681417f` rate-limit 변경 전문 검증**: `rateLimitMiddleware`에 `perAccount` 옵션 추가 — 직원 로그인이 IP 5/분(NAT 뒤 여러 직원이 아침에 막히던 문제)에서 **IP 30/분 + 계정별 5/분**으로 전환. 위협모델 재확인: 단일 IP에서 여러 계정 대입은 IP 한도(30/분)로 여전히 제한, 특정 계정 무차별 대입은 계정 한도(5/분)로 그대로 제한 — 완화가 아니라 두 축으로 분리한 것(계정 스프레이 내성은 30/분으로 완화됐으나 브루트포스 내성은 불변). `c.req.json()` 파싱 실패 시 계정 한도만 스킵하고 IP 한도는 유지(catch 흡수, 안전). 포털 로그인·비밀번호변경·refresh는 기존 IP-only 한도 유지(호출 IP가 서로 다르다는 전제, 회귀 없음). `ar-payments.ts`의 `DUPLICATE_PAYMENT` 400 처리는 내부 에러 상세 노출 없이 고정 문구만 반환 — 정보노출 없음.
> - **`68bca29`(#646 수정) 보안 렌즈 재확인**: entity 격리 로직 자체는 변경 없음(기존 `entityFilter` 게이트 상위 유지, 이번 diff는 `received_packs` 컬럼 추가 로직만) — 회귀 0.
> - **GitHub Actions 워크플로 4종 재확인(`deploy.yml`·`verify.yml`·`e2e.yml`·`backup.yml`)** — `pull_request_target`/`workflow_run`이 포크 PR의 신뢰되지 않은 코드를 시크릿과 함께 실행하는 클래스 0건(`verify.yml`은 일반 `pull_request`라 포크에 시크릿 미노출·게다가 이 프로젝트는 PR 자체를 안 씀). `deploy.yml`은 `push:[main]`+`workflow_dispatch`만이라 직접 push 권한자만 트리거 — 시크릿(`CLOUDFLARE_*`·`SMOKE_*`) 참조 전부 `${{ secrets.X }}` 정상 패턴, 하드코딩 폴백 0건. `permissions:` 블록 미선언은 default token이 checkout(읽기)에만 쓰이고 이 워크플로들이 `GITHUB_TOKEN`으로 쓰기 작업(이슈/PR 생성 등)을 하지 않아 실질 위험 없음(신규 이슈 아님, 명시적 최소권한 선언은 개선 여지지만 현재 실질 노출 없음 — 자동수정 대상 아님).
> - **#626(fix-auth 세션 보류 보안항목 2건, Area5 소관) 상태 확인**: 코멘트 확인 — (1) 평문 비밀번호는 owner가 prod 실측(활성 1계정)으로 위험수용 결정 완료(PROJECT_STATUS 실사용전환 트리거 목록 편입) (2) PII 키 분리는 결정 대기 유지. 이슈가 이미 트래킹 중이고 owner 판정이 최신이라 이번 사이클 추가 조치 없음(재이슈·중복코멘트 금지).
> - **XSS standing scan**: `node scripts/check-xss.mjs` 재실행 — **108건**(직전 사이클 117건에서 9건 감소, owner의 UI 결함 일괄수정 커밋(`baf5b0a` 등)이 형제 escapeHtml도 같이 정리한 부수효과로 추정). 이번 churn 5커밋이 건드린 파일(`src/scripts/orderForm/finishing.js`·`src/scripts/shared/finishingLabel.js`·`src/routes/inventory.ts`·`po-receive.ts`·`rateLimit.ts`·`ar-payments.ts`) 중 후보 목록에 매치 0건 — net-new sink 없음.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: `body.password ||` 기본값** → 0건.
> - **standing scan 3: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `4b60c53` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#649·#648·#647·#626·#617·#616, 변동없음) — #626만 Area5 관할(위에서 상태 재확인 완료), 나머지는 Area3/6 관할.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · done **566**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 새 클래스 발견 없이 기존 레시피(rate-limit 변경 검증·부분픽스 완전성·GitHub Actions 신뢰경계 확인)가 그대로 적중.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(5커밋 churn 전량 rate-limit/entity/XSS/시크릿 렌즈로 재확인, net-new 0), 자동수정 0건(고칠 결함 없음), done-sync: open 6(변동없음)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 3 UX/기능 감사 (2026-09-12T09:48):**
> - **방법**: 세션 시작 시 detached HEAD `8d2666c`(origin/main과 동일)였으나 로컬 `main`은 `eecca71`(stale, 104커밋 뒤처짐, shallow clone) → `git fetch --unshallow` 후 `eecca71`이 `8d2666c`의 조상임을 재확인(얕은 clone 아티팩트, 실제 force-push 아님) → `git checkout main` + `git merge --ff-only origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `b1876e0f`)**: `src/pages`+`src/scripts` 좁힌 화면 churn **7커밋**(전부 09-11 당일) — 대부분이 **Area3 자신이 지난 사이클 발견한 항목의 수정 커밋**: `baf5b0ac`(#645/#641/#634/#633/#630/#622 6건 일괄수정)·`efcce156`(#629 더블탭 가드)·`04a9a8e6`(카드 일괄바 통합, journey-loop P2)·`ed005925`(#640 마통 한도입력). 순수 신규 기능은 `3862fe92`(장비 LogWatcher 패널, #625 필드 소비)·`b87e8f1d`(펀칭 계산축 통일 — 카드 라벨/주문서/패널/에이전트)·`6356cf9c`(journey-loop 도구, 비-사용자화면) 3건.
> - **6건 수정 전문 재검증 — 전부 정확히 고쳐짐, 회귀 0**: `poApplyFilters`가 이제 `f.review`도 복원(`purchaseOrders.js:890`, `poReadFilters`와 대칭 확인) = #645 확정 해소. `purchaseCandidates.js:94` `owner_name` 셀이 헤더(`purchaseCandidates.ts:56` "발주 담당")와 열 순서 일치 = #641 해소. `orderForm/calc.js:186` `calcItem`이 `calcFinishing`도 호출 = #634 해소. `cashSchedule.js:738-774` `schSaveBusy` 플래그+버튼 disable = #633 해소. `storageZones.js:633,641` 로드 실패/빈 목록 각각 다른 토스트 = #630 해소. `shell.js:1918` `history.replaceState`가 `location.hash` 보존 = #622 해소. `inventoryCount.js`/`storageZones.js` 4개 버튼(`submitNewCount`·`icAssignUnassigned`·`icCandApply`·`szStartZoneCount`) 전부 `_xxxBusy` 가드 확인 = #629 해소. `bank.js:1793,1836-1838` 마통 한도 입력이 수정 시 채워지고(`toLocaleString`) 저장 시 `parseMoney`로 역파싱 + 마통 해제 시 `null` 전송, `bank.ts:517` 체크박스 `onchange`가 입력칸 hidden 토글 = #640 해소, 신규 갭 없음.
> - **신규 기능 3건 UX 점검 — net-new 결함 0건**: `equipment.js:163-218` 에이전트 패널 = 로딩 스피너·에러 시 "다시 시도" 버튼·빈 목록 안내 문구·우선순위 정렬(`eqAgentActionRank`) 전부 구현, `escapeHtml` 일관 적용. 펀칭(`b87e8f1d`) = 주문서 그리드에 "변 개수는 양 끝(모서리) 포함" 안내 문구 신설 + `finishing-label-selftest` 60케이스 + `panel-smoke` 216/216 자체 검증 포함 — 사용자 오인 여지를 커밋 자체가 막음. journey-loop 도구는 개발자 전용(`npm run journey:cycle`)이라 UX 감사 대상 아님.
> - **새 axios 호출 전수 확인(`git log -p b1876e0f..HEAD -- src/scripts src/pages`)**: 신규 2건 전부 GET(`items?...type=sales`·`print-events/agents`) — 신규 destructive write/confirm 커버리지 갭 없음.
> - **standing scan 1: `showConfirm(msg, function(){...})` 콜백 오용(#426 클래스)** — `grep -rn "showConfirm(" src/scripts` 전수 재확인, 오용 0건(전부 `await`/`.then()`/`resolve()` 정상 패턴, 변동없음).
> - **🔴 journey-loop 미결(⏳) 항목 3건 발견 → GitHub Issue로 승격**: `docs/journeys/PROPOSALS.md`(journey-loop 스킬이 여정 실행 중 발견해 용준님 판정 대기 중이던 항목, auto-improve 큐에는 없었음)에서 판정 `⏳`(보류 아닌 미결) 3건을 검토해 중복 확인(`search_issues` 3건 전부 무매치) 후 신규 이슈 등록:
>   - **#647(M) — 완전 출고된 주문의 출고 취소 UI 부재**: 카드 보드가 `SHIPPED` 카드를 숨기고, 보드 모달 "출고 취소"는 부분출고 건에만 노출, `/cards/:id`엔 취소 버튼 없음. 환원 로직(`restoreStockLinesOnUnship`)은 세 경로 다 있는데 완전출고 건에 닿을 화면이 없음(P9).
>   - **#648(S) — 주문서 필수입력 브라우저 말풍선이 엉뚱한 필드(선불/착불) 지목**: 거래처 미선택 시 앱 메시지 대신 배송방법 하위 select의 native required 말풍선이 먼저 떠 앱 자체 검증 체인이 아예 안 돎(P10).
>   - **#649(S) — 견적서 품목 검색이 자재 필터 누락**: `type=sales`만 걸고 `excludeType=MATERIAL` 미적용 — 주문서 6행 vs 견적서 50행, 영업 확인 필요(P8).
>   - 판정 ①고침 완료된 P1/P2/P5/P7(같은 사이클) 및 ③유지 확정 P3/P4/P6은 이미 코드/문서에 반영됐거나 owner 판정 완료라 재등록 대상 아님 — `⏳`만 승격.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **3**(#626·#617·#616, 신규 등록 전) 전건 일치, 전부 Area3 관할 밖(Area5/Area6) 확인 후 #647~649 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(3→6, #647·#648·#649 신규) · done **566**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md 상단 `line N` 경고 각주 재확인(이미 서술식 참조만 존재, 잔여 0건). 이번 사이클은 새 오탐 클래스 발견 없이 기존 레시피(6건 수정 재검증·showConfirm 오용 scan·axios 신규호출 전수)가 그대로 적중 + **journey-loop(별도 스킬)의 미결 발견을 auto-improve 큐로 브리지**한 최초 사례 — 두 시스템이 각자 발견을 쌓다 한쪽(PROPOSALS.md ⏳)이 리뷰 사이클을 못 타는 사각지대를 이번에 메움. 재발 방지 codify 검토: 다음 Area3 사이클부터 `docs/journeys/PROPOSALS.md`의 `⏳` 행을 standing scan 항목으로 추가할 가치 있으나, 이번이 1회차라 패턴 확정 전 — 다음 사이클에 journey-loop가 새 `⏳`를 남기면 그때 codify.
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 3건(#647 출고취소 UI 부재 M·#648 검증 말풍선 오지목 S·#649 견적 자재필터 누락 S, 전부 journey-loop `⏳` 브리지 승격, issue-only), 자동수정 0건(전부 UI/UX 결정 동반이라 정책상 제안), done-sync: open 3→6(#647~649 신규)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-11T19:20):**
> - **방법**: 세션 시작 시 detached HEAD `5276767`(origin/main과 동일)였으나 로컬 `main`은 `eecca71`(stale, 50커밋 뒤처짐) → `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `485ebf0`)**: 웹앱 범위(`src/routes`·`src/utils`) diff **18커밋** — 롤 발주 검수큐 3단계(1c42bb2e·6809aaad·391c626e)·#646 received_packs 역산 수정(68bca294)·entity IDOR 4건 수정(c2c9b771)·과금축 COALESCE 정정(41cd6e3, #642/#628)·로그인 계정별 rate limit+중복결제 400화(681417f8)·워크벤치 흡수실패 가시화(ee856875)·LogWatcher 패널(3862fe92)·오펀 라우터 제거(3f498350)·UI 결함 묶음(baf5b0a)·은행 한도입력(ed00592)·PER_AREA_ROLL 원가(6b9c9fe1) 등 — **전 커밋이 Area1/3/4/5/6이 이미 각자 렌즈로 정독한 구간과 겹침**(로그 대조 확인). Area2 고유 렌즈(entity_id INSERT/N+1/authMiddleware/타입불일치/dead code/`SELECT *`)로 17개 변경 파일 diff를 처음부터 직접 재확인.
> - **`purchaseOrders/core.ts` 신설 `POST /:id/review`(검수 승인, 0612) 재검증**: `entityFilter(c,'po')`로 법인 격리 적용 확인(Area5가 이미 검증한 것과 동일 결론) — entity_id 누락 아님. `requireRole` 미적용은 같은 파일의 형제 상태전이 엔드포인트와 동형(page-permission이 실질 게이트, 기존 FP 클래스와 일치) — net-new 아님.
> - **`inventory.ts`·`po-receive.ts` received_packs 역산(#646 수정, 68bca294) 컬럼존재성·바인드 순서 대조**: `UPDATE purchase_order_items SET ... received_packs = MAX(0, COALESCE(received_packs,0) - ?) ...` 바인드 배열(`r.recv, r.acc, r.rej, r.packs, r.packs, r.packs, r.recv, r.recv, r.poItemId, poId`)을 SQL의 `?` 순서와 1:1 대조 — CASE 분기 3개(`qty_is_estimate` 분기 2개 + quantity 분기 2개)가 각각 `packs`/`packs`/`recv`/`recv`를 정확히 소비, 개수 일치(10개 `?` = 10개 바인드). 컬럼 `received_packs`는 0610 마이그로 실재 확인(`grep -rn received_packs migrations` 매치).
> - **`cashSchedule.ts` `getWriteEntityId` 전환(c2c9b771) 재검증**: `entityId === null` 분기가 ADMIN 전체모드(0)를 400으로 명시 차단 — 형제 mutate(`ar-payments.ts` 등)와 같은 컨벤션. auto-generate 블록의 `SELECT po.entity_id` 추가 + INSERT 바인드가 `po.entity_id`로 정확히 교체(구 `getEntityId(c)||1` 잔존 0건, `grep -n "getEntityId(c) || 1" src/routes/cashSchedule.ts` 매치 없음).
> - **`purchaseCandidates.ts` `PUT /owners`(#643) 신규 entity 비교 재검증**: `getWriteEntityId` 아닌 `getEntityId(c)`를 써서 `myEntity !== 0`(전체모드 제외) 조건이 ADMIN 전체모드에서 타법인 담당 지정을 허용 — 같은 라우트가 `requireRole('ADMIN','MANAGER')`라 MANAGER는 자기 법인으로 막히고 ADMIN 전체모드만 예외, 의도된 설계(주석 "ADMIN 전체모드만 예외"와 일치) — 갭 아님.
> - **`printEvents.ts` `/agents`(#625) 신규 JOIN성 매핑 N+1 확인**: `equipment` 테이블을 루프 밖에서 1회 SELECT 후 `Map`으로 in-memory 매핑(`nameById`/`nameByAgent`) — heartbeat 행마다 쿼리하는 N+1 아님, 정상 패턴.
> - **`costCalculator.ts` `recalculateOrderCosts`(#642) COALESCE 정정 재검증**: `COALESCE(oi.pricing_method, i.pricing_method) AS pricing_method`가 `orders/core.ts:433`와 동일 별칭 순서(라인 우선) — "뒤가 앞을 덮는다" 함정(CLAUDE.md 단가축 절 명시) 재발 없음 확인.
> - **`rateLimitMiddleware` 계정별 한도(681417f8) 재확인**: `hit()` 분리 후 IP 버킷 우선 체크 → 미초과 시에만 `perAccount` 체크, `c.req.json()` 파싱 실패는 catch로 흡수해 계정 한도만 스킵(IP 한도는 유지) — 예외 경로 안전. entity_id 무관(로그인 전 단계라 격리 대상 아님).
> - **`workbench.ts` 흡수실패 `console.warn` 2곳(ee856875) 재확인**: 동작 변경 없이 로깅만 추가 — 타입/컴파일 영향 없음(`npx tsc --noEmit` clean에 포함 확인).
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 2: authMiddleware recursive 스캔** — `find src/routes -name '*.ts'` 전체 재실행, 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전부 기존 클래스와 일치 — **net-new 0**.
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `5276767` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **3**(직전 5에서 **#646·#629가 완료 처리**됨 — `search_issues(reason:completed)` 564→566과 일치) = #626(Area5)·#617·#616(Area6), 전건 Area2 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **3**(5→3) · done **566**(564→566) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 새 클래스 발견 없이 기존 레시피(entity_id/N+1/authMiddleware/컬럼존재성 표준 스캔)가 18커밋 churn 전량에 그대로 적중 — owner가 같은 커밋에서 이미 정정한 항목(received_packs·entity IDOR·과금축 COALESCE)을 Area2 렌즈로 재검증해 회귀 없음만 확인.
> - **백로그 트림 체크**: 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(18커밋 churn 전량 entity_id/N+1/auth/타입/dead-code 렌즈로 재확인, net-new 0 — 전부 owner가 이미 정정했거나 기존 FP 클래스와 동형), 자동수정 0건(고칠 결함 없음), done-sync: open 5→3(#646·#629 완료)·done 564→566(+2)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-11T18:40):**
> - **방법**: 세션 시작 시 detached HEAD `6557073`(origin/main과 동일) → 로컬 `main`은 `eecca71`(stale, unrelated-histories) → `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area1 로그의 앵커 HEAD(`b8b7c66d`)가 이 세션 히스토리에 없음(과거 세션 간 shallow-clone/rebase 아티팩트, 실제 force-push 아님 — 같은 클래스가 이전 세션들 로그에도 반복 기록됨) → 커밋 타임스탬프 기준(`--since "2026-09-10 09:50"`)으로 대체 탐색, Area6의 최신 로그(15:46, HEAD `3e69c08`)가 그 시점까지의 전체 churn을 이미 커버했으므로 **`3e69c08..HEAD` 11커밋**을 이번 사이클 신선 churn으로 확정: UI 결함 6건 수정(`baf5b0a`, #645/#641/#634/#633/#630/#622 close) · 은행 한도입력(`ed00592`, #640 close) · cardSpend 문서(`b76c4ee`, #638 close) · **마이그 번호 충돌 게이트 신설(`908c7e5`, #639)** · 여정루프 스킬화 2건(`94e9405`·`3b5e39b`) · 로그인 한도/중복결제 수정(`681417f`) · 카드 일괄바 중복 제거(`04a9a8e`) · 여정루프 P6 발견 기록(`6557073`) · 문서 동기화 2건(`e3a22a8`·`dfc5ff5`).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`. 최종 HEAD(`6557073`, job 103210938953) 전 단계(typecheck·self-tests·entity audit·**migration-number 충돌 audit**·write canary·smoke) 전부 success — `908c7e5`가 신설한 게이트가 CI에 실제로 물려 즉시 통과 확인(#608류 "만들었지만 안 도는 게이트" 재발 아님).
> - **smoke 프로브 129/129 PASS**(로그 직접 확인) — 이번 churn의 신규 UI(은행 한도입력)는 기존 `PUT/POST /api/bank/accounts` 재사용이라 신규 라우트 없음, 프로브 갭 없음. 마이그레이션 신규 0건(이번 churn은 코드/문서/게이트 스크립트뿐) — (a)/(b) 드리프트 분류 대상 없음.
> - **#636(cashSchedule.overview 응답시간) 재확인 — 이미 owner가 해소, 재이슈 불필요**: 이번 배포 smoke 로그 = **4552ms**(예산 2000ms 대비 128% 초과, 3135→3589→3524→3850→**4552ms** 5연속 상승). 그러나 owner가 2026-09-10 close 시 **국내 직접 측정(`PROBE_URL=prod npm run audit:query-cost`) 421~424ms**를 근거로 "CI 수치는 GitHub 러너(해외)→Worker→D1 왕복거리가 순차 await 체인(15쿼리)에 곱해진 인공적 값, 실사용자 체감 아님"으로 판정·close 완료. 새 측정치도 이전 배수(약 9~14배)와 일관된 범위라 판정을 뒤집을 근거 없음 — **재이슈 대신 이 판정을 area 파일에 codify**(아래).
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 3: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **egress 확인**: 이 세션도 prod 직접 fetch 차단(`connect_rejected`) — 배포 job 로그 대리검증 방식(기존 codify) 재사용.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` totalCount **5**(직전 14에서 **9건이 용준님 리뷰로 completed 처리**됨 — `search_issues(reason:completed)` 555→564와 정확히 일치, `baf5b0a`가 6건·`ed00592`/`b76c4ee`가 각 1건·나머지 1건은 별도 리뷰). 잔여 5건(#646·#629·#626·#617·#616) 전부 Area1 관할 밖(Area3/4/5/6) — 재grep 불요.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(14→5) · done **564**(555→564) · rejected **6**(변동없음).
> - **🧬 SKILL 강화 → area-1-production-health.md에 codify**: "CI job 로그 응답시간이 예산 초과 + 상승 추세여도, owner의 국내 직접측정(PROBE_URL=prod)이 이미 정상 범위를 확인하고 판정을 닫았다면 재이슈하지 않는다 — CI 러너의 지리적 왕복거리가 순차 다중쿼리 체인에서 실측치를 9~14배까지 부풀릴 수 있고, 이 배수 자체는 owner가 이미 검증한 상수다. 판정을 뒤집으려면 배수 자체가 깨졌다는 증거(국내 재측정 필요, egress 차단 시 owner에게 요청)가 있어야 한다." — 아래 Area 파일에 추가.
> - **백로그 트림 체크**: 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(11커밋 churn 전부 CI green·smoke 129/129·마이그 0건·#636은 owner 기결정 재확인으로 clean), 자동수정 0건(고칠 결함 없음), done-sync: open 14→5(용준님 리뷰 9건)·done 555→564(+9)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-11T15:46):**
> - **방법**: 세션 시작 시 detached HEAD `d835ef8`(origin/main과 동일)였으나 로컬 `main`은 `eecca71`(전전 세션 잔재, unrelated-histories로 merge 거부) → `git checkout -B main origin/main`으로 정합(작업트리 clean, 유실 없음). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 방법 라인 HEAD `a1c943d`)**: 웹앱 범위 diff **29커밋** — Area1~5가 이번 세션 각자 렌즈(롤발주/사후입고/검수큐 4단계·entity IDOR 4건·LogWatcher 패널·오펀라우터·코팅원가 리팩터 9건)로 이미 정독. `#600` 브리지(「churn 목록에 나열됨 ≠ Read됨」) 적용 — 29개 해시를 두 백로그 파일에서 grep해 개별 문단 커버리지 대조, **18개 해시가 목록 나열 없음**(0건 매치) 확인 후 성격별 분류·직독.
> - **분류 ①(9건, 09:50~15:27, `27dfe63`~`e8c89f3`) = Area2가 이미 "순수계산 유틸, entity_id/N+1/auth 코드 자체 없음"으로 블랭킷 판정한 가격엔진 리팩터 구간** — 개별 grep 매치가 0이어도 Area2 로그의 구조적 논거(DB write 없음)가 전체 범위를 커버. 형제인 `6b9c9fe`(PER_AREA_ROLL, 09-08 날짜라 병합 지연되어 같은 구간에 섞여 들어옴)도 diff 직접 확인 = `scripts/orderline-cost-selftest.cjs`+`src/utils/rollConsumption.ts`뿐, DB 접근 0 → 동일 클래스로 판정.
> - **분류 ②(IA/문서/게이트 축, `2f84b8a`·`7e13c50`·`a0b2474`·`102e939`·`3219ed3`·`a5c3815`·`ee85687`… 일부는 CLAUDE.md §IA 자체가 이미 반영)** — `3219ed3`("make the gates the docs name actually run")는 CLAUDE.md의 「조용한 격하」절이 이미 2026-09-10 기록한 `cut:shellsync` GATES 등록 그 자체(문서가 코드와 동기화된 상태 확인). `102e939`+`7cbd650`은 각각 "실제 실행 중인 JSX/prod 마이그와 repo 정합" 복구 커밋(Area4가 7cbd650의 0573 WHERE EXISTS 가드는 이미 검증) — 신규 결함 아니라 드리프트 자기교정. 62회차 비-웹앱 축 스캔(`LogWatcher/IllustratorAutomat/caps-worker/workers/queue`) 별도 실행 = 이 축의 실행코드 churn은 IA 2건(`2f84b8a`·`102e939`)뿐, 둘 다 위와 동일 판정.
> - **분류 ③(직독 필요 — 순수 계산도 IA도 아닌 2건) 전문 검토, net-new 결함 0건**: **`41cd6e3`**(`ar-helpers.ts`+`costCalculator.ts`, #642·#628 닫음) = `recalculateOrderCosts`가 `i.pricing_method`만 읽어 품목 축이 바뀐 뒤 옛 라인을 "오늘의 축"으로 재구성하던 결함을 `orders/core.ts`와 동형인 `COALESCE(oi.pricing_method, i.pricing_method)`로 정정(0600 스냅샷 원칙 준수) + `queryFifoOverdue`의 이월판정을 `order_number LIKE '%OPEN%'`(전표명 패턴, `E{n}-ACCT-*` 회계전표 누락)에서 `orders.is_voucher`로 교체 — `CARRYOVER_ORDER_NUMBER_LIKE` export 잔여참조 `grep` 0건 확인. `#642`/`#628` 둘 다 현재 open 목록에 없음(정상 종결, close-pending 아님). **`ee85687`**(`workbench.ts` 흡수 핸들러) = 파일맵 학습 2종이 `order_item_id` 미확보 시 조용히 0행으로 끝나는 경로에 `console.warn` 2곳 추가 — 동작 변경 없음(순수 가시성), catch 삼킴 방지 원칙과 일치.
> - **open≠unfixed 재확인**: `list_issues(state:OPEN,label:auto-improve)` **14**(변동없음, #613·#617·#622·#626·#629·#630·#633·#634·#638~641·#645·#646 전건 일치) — 이번 churn이 건드린 파일 중 이 14건의 대상 파일과 겹치는 것 없음(close-pending 캐시, 32회차 규칙) 확인 후 개별 재grep 생략.
> - **close-pending 재확인**: #616·#617은 여전히 owner "실기 확인 대기" 코멘트가 최신(64회차 FP룰 유지) — 재통지 불요.
> - **standing scan 1: done-sync 절대값 재동기화(리터럴 쿼리)** — `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **555**(변동없음) · `reason:not_planned` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **14**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런(HEAD `d835ef8` 포함) 중 1건 `failure`(vite5→8 전환 직후 esbuild 미해결, `c0cc5630`, Area1/4/5가 이미 확인)는 다음 커밋이 즉시 해결 — 나머지 전부 `success`.
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 #600 브리지가 29커밋 중 18개 미개별화 해시를 식별→성격별 3분류(계산엔진 블랭킷/IA-문서 자기교정/직독 2건)로 효율적으로 처리한 실증 — 새 클래스 발견 없이 기존 레시피(Area2 블랭킷 판정·#600 브리지·close-pending 캐시)가 그대로 적중.
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 0건(29커밋 churn 전량 #600 브리지+3분류로 clean 확정, 비-웹앱 축 IA 2건 포함 신규 결함 0, open 재확인 14건 전부 close-pending 캐시로 재grep 불요), 자동수정 0건(고칠 결함 없음), done-sync: open 14(변동없음)·done 555(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-11T06:10):**
> - **방법**: 세션 시작 시 HEAD `7806623`(origin/main과 동일, 얕은 clone) → `git fetch --unshallow`(전체 이력 확보), `git merge --ff-only origin/main` 변동 없음(이미 최신). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `a6d9753`)**: 웹앱 범위 diff **32커밋** — 대부분 코팅/가격엔진 리팩터·발주검색바(Area1~4가 이미 렌즈로 정독). 보안 렌즈 우선순위 = ①직전 사이클이 발견한 IDOR(#631/#632/#635/#643)의 **수정 커밋 검증** ②신규 라우트(롤 발주·사후입고·검수큐 3단계, LogWatcher 패널) 격리·인증 확인 ③오펀 라우터 제거(`3f498350`).
> - **`c2c9b771`(#631/#632/#635/#643 수정) 전문 재검증 — 4건 전부 실제로 닫힘**: `cashSchedule.ts` 수동등록 POST가 `getWriteEntityId`+전체모드 400(#635), auto-generate INSERT가 `po.entity_id`로 귀속 전환 + dedup NOT EXISTS에 entity_id 비교 추가(#632, prod 228건 전수 기존 매치 확인이 커밋 메시지에 명시), check-overdue UPDATE/COUNT에 `entityFilter` 적용(#631), `purchase-candidates/owners` PUT이 `body.entity_id !== 호출자 entity`면 403(#643, ADMIN 전체모드만 예외). 4건 모두 형제 규약(다른 mutate가 이미 쓰는 `getWriteEntityId`/`entityFilter` 패턴)과 정확히 동형 — 부분픽스 없음.
> - **롤 발주·사후입고·검수큐 3단계(`1c42bb2e`·`6809aaad`·`391c626e`) 보안 렌즈 재검토 — net-new 결함 0건**: `po-receive.ts` `/:id/receive`는 기존 `entityFilter(c,'po')`+`getWriteEntityId` 전체모드 차단 유지, 신설 `received_packs`/`qty_is_estimate` 파라미터는 서버가 DB에서 읽은 값만 사용(body 미신뢰). 신규 `POST /:id/review`(검수승인)는 `requireRole` 없이 라우터 상속 `requireAnyPagePermission('/purchase-orders','/receiving')`만 게이트 — 언뜻 권한 누락으로 보이나 **같은 파일의 상태전이 엔드포인트가 이미 같은 근거(주석 `:618-623`)로 ADMIN/MANAGER 제한을 의도적으로 뺀 전례**(page-permission이 실질 RBAC, 기존 FP 「쓰기 핸들러 requireRole 부재」 규칙과 동형) — 신규 결함 아님. `entityFilter(c,'po')` 자체는 정확히 적용(남의 법인 발주 승인 차단). adhoc 발주 생성(`POST /`)은 기존 `requireRole('ADMIN','MANAGER')` 유지 + `adhoc_source`를 화이트리스트(`'RECEIVING'`만 허용)로 제한.
> - **LogWatcher 에이전트 현황 패널(`3862fe92`) 확인**: `GET /print-events/agents`는 기존 `authMiddleware`만(변경 없음), 신규 로직은 순수 읽기 JOIN(`equipment` 테이블 이름 매핑)뿐 — mutate 없음, entity_id 없는 전역 장비 마스터라 격리 대상 아님(FP클래스⑤와 동형).
> - **오펀 라우터 제거(`3f498350`) 확인**: `/api/waste`·`/api/budgets` 제거 전 프론트 호출 0건(#334 도달성)을 커밋 메시지가 명시, 공격표면 축소 방향이라 보안 관점에서도 긍정적 — 회귀 없음.
> - **XSS standing scan**: `node scripts/check-xss.mjs` 재실행(117건, 2026-09-06 문서화 레시피 버전과 동일) — 이번 churn 파일(purchaseOrders.js·purchaseOrderForm.js·receiving.js·equipment.js) 매치분 전수 `git blame` 대조 결과 **전부 2026-05~07 기존 라인**(이번 32커밋 churn 밖), `purchaseOrderForm.js:420`의 `notes`는 `:370` 정의-지점에서 이미 `escapeHtml` 적용(정의-지점 escape 전파 패턴, 기존 FP) — **net-new 미이스케이프 sink 0건**.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: `body.password ||` 기본값** → 0건.
> - **standing scan 3: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 1(신규 관찰, 로컬 전용 브랜치 1개가 main에 완전 흡수됨 — 삭제 후보일 뿐 보안 사안 아님)·REVIEW 0, SKIP 1(main).
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런 중 1건 `failure`(vite5→8 전환 직후 esbuild 미해결, `c0cc5630`)는 다음 커밋(`11b767fa`)이 즉시 해결(Area4가 이미 확인) — 최종 HEAD(`7806623`) 포함 나머지 전부 `success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` totalCount **14**(변동없음, #613·#616·#617·#622·#626·#629·#630·#633·#634·#638~641·#645·#646 전건 일치) — 이번 사이클 신규 이슈 없음.
> - **backlog↔GitHub 절대값 재동기화**: open **14**(변동없음) · done **555**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 신규 클래스 발견 없이 기존 3개 레시피(부분픽스 재검증·하위자원 write-isolation·XSS 정의-지점 전파)가 그대로 적중해 clean 판정 — 별도 codify 불요.
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 0건(직전 사이클 IDOR 4건 수정 완전성 확인 + 신규 라우트 3단계 격리 확인 + XSS/시크릿/entity 전 standing scan net-new 0), 자동수정 0건(고칠 결함 없음), done-sync: open 14(변동없음)·done 555(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-11T03:52):**
> - **방법**: 세션 시작 시 detached HEAD `b0ee03aa`(origin/main과 동일)였으나 얕은 clone → `git checkout main` + `git merge --ff-only origin/main`(79커밋, 이미 최신이라 실질 변동 없음) + `git fetch --unshallow`. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 방법 라인 HEAD `bd57b39`)**: 웹앱 범위 diff **22커밋** — 대부분 Area1~3·5·6이 이미 각자 렌즈(코팅원가·가격엔진 리팩터·발주검색바·entity격리·재무축)로 정독. 데이터정합성 렌즈로는 신규 마이그 15건(`0573`~`0576` 회수분 4건 + `0602`~`0612` 신규 11건) 전수 직독이 이번이 최초.
> - **`db:bootstrap:ci` 전량 재적용** — 627개 전건 ✅(CHECK/FK 위반 0), 직전 세션(`7cbd650f`)의 0573 `WHERE EXISTS` 가드가 로컬에서도 정확히 no-op 확인.
> - **🔴 신규 발견 → #646 — 롤 발주 입고 취소 시 `purchase_order_items.received_packs` 누적값이 안 줄어들어 검수 대기 큐가 조용히 놓침**: 이번 사이클 신설 기능(0610~0612)이 CLAUDE.md 「누적 캐시」 클래스를 그대로 재현 — 입고 처리(`po-receive.ts:320`)는 `received_packs`를 `COALESCE(...,0) + ?`로 누적하는데, 기존 입고 전량취소 롤백(`inventory.ts:821-833`, #373)은 형제 컬럼 `received_quantity`/`accepted_quantity`/`rejected_quantity`는 정확히 `MAX(0, col-?)`로 역산하면서 **`received_packs`는 전혀 참조하지 않는다**(`grep -rn received_packs src/` = 증가 1곳뿐, 감소 0곳). 소비처는 이번 사이클 신설 검수 대기 판정 정본 `PO_REVIEW_PENDING_SQL`(`listFilter.ts:53-54`, `received_packs <> order_packs`) — 2회 분할입고 중 나중 입고를 취소하면 `received_packs`가 옛값(=order_packs)에 남아 "차이 없음"으로 오판정, 실제로는 부족한데 검수 큐에 안 뜬다. 근본은 스키마 갭이기도 함 — `inventory_receipt_items`에 애초에 "이 건이 몇 롤이었나"를 저장하는 컬럼이 없어 취소 시 이 건의 기여분만 역산할 방법이 없다(단순 UPDATE 추가로 못 고침, 컬럼 신설 선행 필요). 재고 수량·금액 자체는 무영향(그쪽은 `received_quantity` 기반이라 정확) — **검수 큐 판정에만 국한**. **issue-only(#646, M, 입고취소 트랜잭션 변경=비즈니스 로직)**.
> - **#639(마이그 번호 중복) 재발 확인 + 첫 3중복 발견**: 이번 15건에서 `0573`·`0574`·`0575`가 신규 중복(직전 세션 `7cbd650f`의 prod 회수 작업 부산물, 신규 작성 아님) + **`0576`이 처음으로 3중복**(`_expense_category_mutual_aid_fund`·`_roll_material_unit_axis`·`_uv_board_min_billing`)으로 늘어남 — 셋 다 대상 테이블·컬럼(bank_transactions/expense_categories vs items SVCV-127·KMT-UVONEWAY 한정 vs items UV-* 접두 한정) 비겹침으로 우연히 무해 확인. `#639`에 코멘트로 기록. **CLAUDE.md의 하드코딩 "20쌍" 목록이 이미 실측과 어긋나 있어**(`0080`·`0193`은 현재 단일 파일, 원인 불명) 목록 나열 대신 감사 명령 참조로 교체(안전 문서동기화, `26f...` 예정 커밋 — 아래 자동수정 참고).
> - **entity_id 표본 검증**: `product_materials.material_role`(0603) 로컬 D1 7건 전부 NULL(신규 컬럼, 정상) — prod 적용 여부는 Area1 #644로 이미 확인·close 완료(owner "이미 적용됨" 코멘트).
> - **0604(8월 이관 담당법인 정정) 재검증**: 하드코딩 행 id 없이 데이터 조건(`assigned_entity_id=1 AND assignment_status='PENDING' AND entity_id IN (2,3)`)으로 범위를 고정해 빈 DB에서 자연 no-op(0건) — `billed_by=5` 값은 리터럴이나 WHERE 매치 0건이라 FK 위반 없음. 백업 5테이블(`_bak_0910_*`) IF NOT EXISTS로 멱등, `db:bootstrap:ci`에서 정상 통과 확인.
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음 — 직전 Area4의 hono 승격 유지 확인).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 6런 중 1건 `failure`(vite5→8 전환 직후 esbuild 미해결, `c0cc5630`)이 있었으나 바로 다음 커밋(`11b767fa`, esbuild 직접 devDep 고정)이 즉시 해결 — 최종 HEAD(`b0ee03aa`) 포함 나머지 전부 `success`. 신규 조치 불요(이미 자기 수정됨).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` totalCount **13**(직전 로그의 26에서 **13건이 용준님 리뷰로 completed 처리**됨 — `search_issues(reason:completed)` 542→555와 정확히 일치) 확인 후 #646 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **14**(26→13→14, #646 신규) · done **555**(542→555, +13) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 발견(#646)은 기존 「신규 write-path의 denormalized aggregate 증분(delta) 정합성」 standing check(16회차 codify)이 정확히 겨냥한 클래스 — 그 체크리스트가 "delta 공식 일치"만 보고 "취소/역산 경로가 신규 컬럼을 아는지"는 별도 확인 항목이 아니었다. 재발 시를 위해 그 항목에 "증분 컬럼 도입 시 형제 취소/롤백 경로가 같은 컬럼을 역산하는지" 하위 체크를 추가할 가치가 있으나, 이번이 해당 클래스 3번째 사례(#477·#480과 유사 골격)라 기존 「형제 미완결 sweep」 원칙의 재확인으로 충분 — 별도 신규 codify는 보류.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#646 롤 입고취소 시 received_packs 미역산 — 검수 큐 오판정, M, 입고취소 트랜잭션 변경이라 issue-only), 자동수정 1건(CLAUDE.md 마이그 중복 번호 하드코딩 목록을 감사 명령 참조로 교체 — 문서 동기화, 안전), done-sync: open 26→13(리뷰 반영)→14(#646)·done 542→555(+13)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-10T21:40):**
> - **방법**: 세션 시작 시 detached HEAD `b1876e0f`(origin/main과 동일)였으나 얕은 clone(50커밋) → `git fetch origin main`이 "forced update" 경고를 냈으나 `git fetch --unshallow` 후 `eecca71`이 `b1876e0f`의 조상임을 재확인(얕은 clone 아티팩트, 실제 force-push 아님) → `git checkout main` + `git merge --ff-only origin/main`(54커밋 fast-forward)으로 정합. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `57891a1`)**: `src/pages`+`src/scripts` 좁힌 화면 churn **8커밋** — 발주/입고 "롤 단위 발주 + 사후입고 + 검수큐" 4단계 신규 기능(`1c42bb2e`·`6809aaad`·`485ebf0a`·`391c626e`, 09-10 당일 배포) + 은행 탭합계 기간종속 수정(`1fe56196`) + 은행 미반영사유 칩(`3907d501`, Area5가 이미 보안렌즈로 정독) + 주문 라인 과금축 스냅샷 프론트 반영(`79642f82`, Area1/2/4/6이 계산·데이터 렌즈로 이미 정독) + 로딩 성능(`4653bd97`, dedupe on-load fetches — 알림생성 10분 쓰로틀·카테고리 중복요청 제거, prod Playwright 실측 기반).
> - **🔴 신규 발견 → #645 — 발주 목록 "검수 대기"(REVIEW) 필터를 조건저장/기본값으로 저장하면 복원 시 조용히 풀림**: `purchaseOrders.js` `poReadFilters()`(L164)는 스냅샷에 `overdue`뿐 아니라 이번에 신설된 `review: currentStatus === 'REVIEW'`도 담는데, 복원 함수 `poApplyFilters()`(L888)는 `currentStatus = f.overdue ? 'OVERDUE' : (f.status || '')`로만 복원해 `f.review`를 안 읽는다 — REVIEW로 필터링해 저장한 프리셋을 불러오면 전체 목록으로 조용히 풀린다. 같은 커밋(`391c626e`)의 메시지가 스스로 "한 SQL 문자열을 카드와 목록이 같이 써야 한다, 두 벌로 두면 카드는 3건인데 목록은 5건" 클래스를 경고했는데, 그 경고가 안 미친 두 번째 파생상태(`review`)가 정확히 그 패턴으로 새로 생김 — SQL이 아니라 **프론트 필터 복원 로직**에서. 가장 심각한 경로 = "기본으로"(페이지 진입 시 자동 적용) 프리셋으로 지정하면 매번 검수 대기가 아니라 전체 목록이 뜨는데 에러가 없어 알아채기 어려움 — 신설된 검수 큐(0612, "확인해야 할 걸 기억으로 안 찾게") 기능 목적 자체가 이 경로에서 무력화됨. **issue-only(#645, S, 순수 JS 상태복원 버그이나 Area3 정책상 자동수정 대상 아님)**.
> - **롤 발주/입고 4단계 나머지 전문 검토 — net-new 결함 0건**: `poCalcQtyFromPacks`/`recvPacksChanged`의 "롤×팩사이즈 자동계산 vs 사람이 손으로 고치면 안 덮음" 가드(`dataset.touched`, `oninput` vs JS `.value=` 직접대입이 이벤트를 안 쏘는 성질 정확히 활용) 확인 — 회귀 없음. `adhocCreate`(발주 없이 입고)는 `window.prompt()`로 수량만 받고 금액은 0으로 둔 채 서버에 위임(커밋 메시지가 명시한 의도적 설계, 현장 부담 최소화) — 버그 아님. `PO_REVIEW_PENDING_SQL`을 목록필터(`listFilter.ts`)·통계(`po-queries.ts`) 양쪽이 동일 상수로 import해 카드=목록 수 불일치 재발은 막혀 있음(SQL 레벨은 정상, 위 #645는 그 위의 프론트 상태 계층에서 발생).
> - **은행 탭합계 기간종속 수정(`1fe56196`) 재확인**: `buildTxScopeParams()` 분리로 `loadStats()`가 목록과 **같은 범위**(계좌·기간·입출금, 상태 제외)를 쿼리 — 월 마감이 불가능했던 원인(전체기간 합계 vs 필터된 목록) 해소 확인, "전체기간" 리셋 버튼도 flatpickr 인스턴스 유무 분기 정상. UX 결함 없음.
> - **로딩 성능(`4653bd97`) 재확인**: 알림생성 10분 쓰로틀은 실패 시에도 스탬프를 먼저 찍어(성공/실패 무관 10분 후 재시도) 폭주는 안 나되 실패 시 즉시 재시도는 안 됨 — 코멘트가 명시한 트레이드오프와 일치, 결함 아님. `items/core.js`+`items/tabs.js` 카테고리 공유요청(`window.fetchItemCategories`)도 경쟁조건 없이 정상 폴백.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런(HEAD `b1876e0f` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` totalCount **25**(신규 등록 전) 기존 25건 전건 일치(#613~644) 확인 후 #645 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **26**(25→26, #645 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 발견(파생 필터 상태 중 일부만 복원 경로에 반영)은 #641(헤더-데이터 칸수 불일치)과 같은 "형제 요소 미완결 sweep" 결의 변형 — 재발 시(파생 status 3개 이상 되는 페이지에서 유사 패턴) "poApplyFilters류 복원 함수는 poReadFilters류 스냅샷 함수가 반환하는 키 전부를 커버하는지 diff" 레시피로 codify 고려, 이번 1건뿐이라 보류.
> - **백로그 트림 체크**: 사이클 로그 8건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#645 발주 검수 대기 필터 프리셋 복원 누락, S, issue-only), 자동수정 0건(정책상 Area3은 issue-only), done-sync: open 25(25→26)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
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
