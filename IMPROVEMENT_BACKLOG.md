# Improvement Backlog
<!-- last_run_area: 5 -->
<!-- last_run_at: 2026-08-15T21:40:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **5** (`search_issues(state:open,label:auto-improve)` 실측, 변동 없음. #606·#608·#609·#612·#613) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **531** (`search_issues(reason:completed,label:auto-improve)` 실측, 변동 없음) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 재확인 완료 — 변동 없음) |

> **Area 5 보안 + 인프라 (2026-08-15T21:40):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main`(HEAD `f1d1dd4`, origin과 완전 일치) → `git checkout main && git reset --hard origin/main`으로 정리. 직전 Area5 자신의 앵커(`de31dbf`)는 이번 사이클에도 유효한 조상(`merge-base --is-ancestor`=true). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `de31dbf..HEAD`(직전 Area5 자신의 마지막 커밋 이후) = 신규 커밋 8개 전부 auto-improve backlog 커밋 4개(`8927f2e`·`d0473c1`·`b28e617`·`6b78504`·`f1d1dd4`) + LogWatcher C#/kit 전용 커밋 2개(`5692057`·`1f454a8`, 웹앱 스캔 범위 밖) — 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) diff **공백**. 보안 렌즈로 재검토할 신선 코드 자체가 없음.
> - **필수 grep standing scan**: 시크릿 폴백(`c.env.[A-Z_]+ *\|\| *'`) → `fax.ts:43`(기존 FP, 변동없음) 1건뿐. 기본비밀번호 리터럴·CI yml secrets fallback·미청크 동적 IN절 = 전부 0건.
> - **npm audit 재확인**: `npm ci` 후 11건(1 moderate·8 high·2 critical), `--json` 파싱으로 패키지별 direct/transitive 분류 재확인 — `concurrently`·`vite`·`wrangler`(direct) + `esbuild`·`miniflare`·`nanoid`·`postcss`·`sharp`·`shell-quote`·`undici`·`ws`(transitive) 전부 devDependency, **hono는 목록에서 사라짐**(직전 Area5의 `77a7796` CVE 패치 유효 확인) — #613 기보고와 완전 일치, net-new 0.
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, `updated_at`도 직전 확인 시점과 동일). `search_issues(reason:completed)` **531**·`reason:not_planned` **4**·`reason:duplicate` **2**(=rejected 6) 재실측, 전부 변동없음.
> - **🧬 SKILL 강화**: area-5-security-infra.md 잔여 `line N` 참조 5건(「IDOR 비대칭 탐지 규칙」·「문서화된 cross-entity mutation」·「entity_id 없는 전역 마스터」·「독립 HTML 페이지 escapeHtml 부재 예외」·「agent JSON 유입 주의」)을 서술 참조로 전환 완료(2-b 절차, 이번 사이클분) — 잔여 0건(`audit:skills` 재확인). 신규 오탐/탐지 클래스는 없음: 코드 churn 부재라 IDOR/XSS 자동스캔(Area 6 승격분)을 적용할 신선 대상 자체가 없는 quiet cycle.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 10건(직전 Area2 사이클이 트림 완료해 리셋됨) → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(웹앱 churn 없음, npm audit 잔여는 전부 기보고 devDependency), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-15T15:05):**
> - **방법**: `git fetch origin main`(HEAD `6b78504`, origin과 완전 일치). 컨테이너가 detached HEAD였으나 origin/main과 동일 커밋(직전 Area3 자신의 backlog 커밋) — `git checkout main && git reset --hard origin/main`으로 정리, 워킹트리 clean. 직전 Area4 자신의 앵커(`de31dbf`)는 이번 사이클에도 유효한 조상. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `de31dbf..HEAD`(직전 Area4 자신의 마지막 커밋 이후) 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **공백**(신규 커밋 8개 전부 auto-improve backlog 커밋 5개(`bb916ea`·`8927f2e`·`d0473c1`·`b28e617`·`6b78504`) + LogWatcher C#/kit 전용 커밋 2개(`5692057`·`1f454a8`, 웹앱 스캔 범위 밖) + `77a7796`(hono CVE 패치, `package.json`류만 — 이미 Area5가 검증 완료)). 신규 마이그레이션 0건 → CHECK literal-write·NOT NULL no-default·dangling 고아 재스캔(전부 churn-트리거형)이 재검토할 신선 대상 자체가 없음.
> - **standing scan 재실행(신선 churn 부재해도 매 사이클 필수)**: `npm run audit:entity` — 131파일·61쿼리·**누락 0**(변동없음).
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, `updated_at`도 각 이슈 직전 확인 시점과 동일 — 신규 코멘트 없음). `search_issues(reason:completed)` **531**·`reason:not_planned` **4**(+duplicate 2=rejected 6) 재실측, 전부 변동없음.
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. area-4-data-integrity.md는 이미 08-13 사이클에서 `line N` 잔여참조 전건 서술참조 전환 완료(재확인, 잔여 0건).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 9건(직전 Area3 사이클 이후 리셋 유지) → 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(웹앱 churn 없음, 신규 마이그 0건이라 재스캔 대상 없음), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-15T09:20):**
> - **방법**: `git fetch origin main`(HEAD `b28e617`, origin과 완전 일치) → `git checkout main && git reset --hard origin/main`으로 detached HEAD 정리, 워킹트리 clean. 직전 Area3 자신의 앵커(`a7da2a3`)는 이번 사이클에도 유효한 조상(`git merge-base --is-ancestor`=true). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `a7da2a3..HEAD`(직전 Area3 자신의 마지막 커밋 이후) 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **공백**(신규 커밋 9개 전부 auto-improve backlog 커밋 5개(`e74851b`·`de31dbf`·`bb916ea`·`8927f2e`·`d0473c1`·`b28e617`) + LogWatcher C#/kit 전용 커밋 2개(`7b431bc`·`1f454a8`·`5692057`, 웹앱 스캔 범위 밖) + `77a7796`(hono CVE 패치, `package.json`류만 — 이미 Area5 검증 완료)). UX 렌즈로 재검토할 신선 pages/scripts/routes 변경 자체가 없음 — 직전 사이클(08-13)이 이미 이 앵커 이후 유일한 프론트 churn(bank/production/ledger 5파일)을 전수 diff Read해 clean 판정했고, 이번 사이클엔 그 이후 웹앱 파일이 단 1바이트도 안 바뀜.
> - **standing scan 판단**: axios↔라우트 존재성 전수매칭·`showConfirm` 콜백오용·삭제confirm 커버리지·HTML↔JS silent-fail diff는 전부 **전체 코드베이스 대상** 스캔이라 이론상 churn 무관 재실행 가능하나, 스캔 대상 파일(src/scripts/**/*.js, src/pages/**/*.ts)이 직전 사이클과 바이트 단위로 동일 → 재실행해도 직전 결과(net-new 0)와 다를 수 없음(결정론적 grep). 중복 재실행 대신 **직전 사이클 결과를 그대로 승계**, 스킬 지시("이번 사이클 영역 파일 1개만 읽는다" 컨텍스트 절약 원칙)에 맞춰 스킵.
> - **"백엔드 먼저·화면 나중" standing scan**: 승격 조건("신규 마이그+라우트 JOIN 동반 churn")이 이번 사이클엔 불성립(마이그레이션 신규 0건) → 해당 없음.
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, updated_at도 각 이슈 직전 확인 시점과 동일 — 신규 코멘트 없음). `search_issues(reason:completed)` **531**·`reason:not_planned` **4**(+duplicate 2=rejected 6) 재실측, 전부 변동없음.
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. area-3-ux-audit.md는 이미 08-13 사이클에서 `line N` 잔여참조 전건 서술참조 전환 완료(재확인, 잔여 0건).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 9건(직전 Area2 사이클이 이미 트림 완료해 리셋됨) → 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(웹앱 churn 없음, 직전 사이클이 마지막 프론트 변경분을 이미 UX 렌즈로 clean 판정), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-15T03:44):**
> - **방법**: `git fetch origin main`(HEAD `d0473c1`, origin과 완전 일치, 워킹트리 clean) — 직전 Area1 자신의 backlog 커밋이 HEAD. 직전 Area2 자신의 앵커(`d41a1e2`)는 이번 사이클에도 유효한 조상(`git cat-file -t`=commit). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `d41a1e2..HEAD`(직전 Area2 자신의 마지막 커밋 이후) 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **공백**(신규 커밋 9개 전부 auto-improve backlog 커밋 5개(`a7da2a3`·`e74851b`·`de31dbf`·`bb916ea`·`8927f2e`·`d0473c1`) + LogWatcher C#/kit 전용 커밋 3개(`7b431bc`·`1f454a8`·`5692057`, 웹앱 스캔 범위 밖) + `77a7796`(hono CVE 패치, `package.json`류만 — 이미 Area5가 검증 완료)). entity_id INSERT·N+1·authMiddleware·dead code·SELECT* 재검토 대상인 신선 웹앱 코드 자체가 없음.
> - **standing scan 재실행(신선 churn 부재해도 매 사이클 필수)**: ① `npm run audit:entity` — 131파일·61쿼리·**누락 0**(변동없음). ② `grep -rnE "IN \(\$\{" src/routes`(#458 미청크 동적 IN절) — **0건**. ③ authMiddleware recursive 스캔(`find src/routes -name '*.ts'` 전수, 25회차 레시피) — 무-auth+엔드포인트보유 후보 7개(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전부 기존 codify된 정당 클래스(barrel 5·hrSelf scoped-token·publicUnsubscribe 의도적 public·cron agentKeyMiddleware·helpers Map.get FP) 그대로, net-new 0.
> - **npm audit 재확인**: `npm ci` 후 11건(1 moderate·8 high·2 critical) — hono 패치(Area5 `77a7796`) 반영 후 잔여, 전부 devDependency(#613 기보고와 일치, net-new 아님).
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음) — 각 이슈 참조 파일이 이번 churn(공백)과 무관해 재확인 생략 정당.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · `reason:completed` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음, 전부 실측).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. 코드 churn 부재라 기존 codify된 레시피(entity_id diff·IN절 청크·authMiddleware recursive)를 적용할 신규 대상 자체가 없음.
> - **백로그 트림 체크**: 사이클 로그 추가 후 13건 → 임계 13건 도달, `npm run backlog:trim` 실행 예정(이 로그 저장 직후).
> - 신규 이슈 0건(코드 churn 없음), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-14T22:09):**
> - **방법**: `git fetch origin main`(HEAD `5692057`, origin과 완전 일치, 워킹트리 clean). 직전 Area1 자신의 앵커(`d41a1e2`)는 이번 사이클에도 유효한 조상. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `d41a1e2..HEAD`(직전 Area1 자신의 마지막 커밋 이후) 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **공백**(신규 커밋 8개 전부 auto-improve backlog 커밋 3개(`a7da2a3`·`e74851b`·`de31dbf`·`bb916ea`·`8927f2e`) + LogWatcher C#/kit 전용 커밋 3개(`7b431bc`·`1f454a8`·`5692057`, CLAUDE.md 정본상 웹앱 스캔 범위 밖) + `77a7796`(hono CVE 패치, `package.json`류만 변경 — 이미 오늘 Area5가 검증 완료)). 정적 코드 재검토 대상 없음.
> - **배포 CI**: `deploy.yml` 최근 10런(08-12 12:35~08-14 08:04) **전부 success**. 최신런(`5692057`, 08:04:30~08:05:55 완료) job `Verify, Deploy & Smoke` 9스텝 전부 success — Checkout→Setup→Install→**Typecheck**→**Build**→**Deploy to Cloudflare Pages**→Wait→**Smoke test (production)** 전부 통과, `Notify on failure`는 정상 skip.
> - **backup.yml**: 최근 10런(08-04~08-13) 중 9건 success, 08-06 1건만 기존 known failure(#605 픽스로 재발 없음, 변동없음).
> - **verify.yml**: 여전히 `active`이나 실행 이력 미확인(#608 기보고와 일치, net-new 아님). **e2e.yml**: `state: disabled_manually` 재확인(기존 정책, 회귀 아님).
> - **egress 제약(재확인)**: `curl --max-time 8 https://webapp-9i0.pages.dev/api/orders` → CONNECT tunnel 403(exit 56, allowlist 밖). `CLOUDFLARE_API_TOKEN` 미설정(`env | grep CLOUDFLARE` = 0건) → 직접 prod 조회 불가, 기존과 동일 제약 — CI(자체 네트워크 보유)의 deploy.yml 성공 이력(Smoke test 포함)을 prod 헬스 대리 지표로 사용.
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, backlog 캐시와 완전 일치) — 각 이슈 참조 파일이 이번 churn(공백)과 무관해 재확인 생략 정당.
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · `reason:completed` **531**(변동없음, 캐시 유지 — 직전 사이클 이후 GitHub 측 변동 신호 없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. 코드 churn 부재 + CI 전부 green이라 기존 codify된 판별 레시피(cold-start transient·CF finalize transient·smoke stale probe·write-path 맹점·prod↔main 디버전스)를 적용할 신규 사례 자체가 없음.
> - **백로그 트림 체크**: 사이클 로그 추가 후 12건 → 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(코드 churn 없음 + CI 전부 green), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-14T05:10):**
> - **방법**: `git fetch origin main`(HEAD `bb916ea`, origin과 완전 일치, 워킹트리 clean, detached HEAD이나 origin/main과 동일 커밋 = 직전 Area5 자신의 backlog 커밋). 직전 Area6 앵커(`8246df5`)·전역 공유 앵커(`ca38708`) 둘 다 여전히 유효한 조상(`merge-base --is-ancestor`=true). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인 — 이번 사이클은 웹앱 churn 0건**: `git log 8246df5..HEAD -- src/routes src/scripts migrations index.tsx src/layout src/pages` = **공백**(직전 Area6 이후 Area1~5가 전부 backlog 커밋만 생성, 실코드 변경 無). 범위 밖 전체로는 2건뿐: `7b431bc`(LogWatcher kit 설정 파일, CLAUDE.md 정본상 웹앱 스캔 범위 밖) · `77a7796`(hono 4.7.9→4.13.2 CVE 패치, `package.json`/`package-lock.json`만 — 이미 오늘 Area5가 `tsc`/`build` 검증 완료한 자동수정이라 재검증 불요). **컬럼-diff bridge·XSS bridge 둘 다 이번 사이클 검증 대상 없음**(신선 라우트/마이그 churn 부재).
> - **done-sync(절대값 재동기화)**: `search_issues(state:open,label:auto-improve)` **5**(#606·#608·#609·#612·#613, 변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음) — 백로그 기재값과 완전 일치, 드리프트 0.
> - **open≠unfixed 재확인**: 5건 전부 참조 파일이 이번 churn(공백)과 무관 + #606/#608/#609는 기존 owner 코멘트("보류 확정")·#612/#613은 리액션 대기 지속 — 캐시 유지 타당, 재grep 불요.
> - **closed≠fixed 재확인**: 최근 close된 다중모듈 우산 이슈 신규 없음(기존 클러스터는 이미 형제완전성 검증 완료, 캐시 재사용).
> - **마이그 번호 중복 standing scan**: `ls migrations/*.sql | sed -E 's|.*/([0-9]{4})_.*|\1|' | sort | uniq -d` → 기존 5쌍(`0327`·`0412`·`0416`·`0420`·`0453`)만, net-new 0.
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-absorbed 1건, REVIEW 0건 — 삭제대상 1건(임계 30 미달), 등록 불요.
> - **🧬 SKILL 강화**: area-6-self-evolution.md 잔여 `line N` 참조 전건(15건: line 208×3·214·225×2·236·253·274·281×3·288)을 서술 참조(「컬럼-diff bridge」·「XSS bridge」·「드리프트-제거 완전성 규칙」·「purge 3단 완전성 레시피」·「purge 커밋 마이그 번호 중복 부수노트」·「open≠unfixed 거울」·「data-driven 범용 렌더러 dataset round-trip FP 주의」)로 전환 완료(2-b 절차, 이번 사이클분) — 잔여 0건. 신규 오탐/탐지 클래스는 없음: 이번 사이클은 churn 자체가 0이라 bridge류를 실제 적용할 대상이 없었던 quiet cycle — 기존 codify 규칙을 새로 검증할 기회가 아니라, "churn 0일 때 Area6은 표준 standing scan(done-sync·마이그중복·브랜치위생·스킬 서술참조)만 수행하고 조기 종료"가 유일한 신규 관찰이나, 이는 기존 "매 Area마다 churn부터 확인" 절차의 자연스러운 인스턴스라 별도 규칙화 불요.
> - **백로그 트림 체크**: 사이클 로그 추가 후 11건 → 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(churn 0), 자동수정 0건(스킬 파일 서술참조 전환은 코드 아님), done-sync: new 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-08-14T04:35):**
> - **방법**: `git fetch origin main`(HEAD `de31dbf`, origin과 완전 일치, 워킹트리 clean) — 직전 Area4 자신의 backlog 커밋이 HEAD. Area1~4/6이 공유해 온 앵커(`ca38708`)는 여전히 유효한 조상. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `ca38708..HEAD` 웹앱 범위 = 기존 7커밋 그대로(`8245211`·`e7d9047`·`5b6de48`·`f235d5c`·`af0e13a`·`872c0f0`·`8313bdf`) — 직전 Area5(08-12T09:18)가 `8245211`·`f235d5c`만 보안 렌즈로 검증했던 것과 대비해, **이번엔 `e7d9047`·`5b6de48`·`af0e13a`·`872c0f0`·`8313bdf` 5건을 보안 렌즈(SQLi/XSS/IDOR/인증)로 직접 diff Read** — 다른 Area가 이미 데이터정합·UX·자기진화 렌즈로 본 동일 커밋이지만 보안 전용 검토는 미실시였음.
> - **`bank.ts`(8313bdf) 검증**: `detect-transfers`(days 쿼리파라미터→`Number()` 강제 후 바인드, SQL 문자열 삽입 없음)·`confirm-transfer`/`unlink-transfer`(단건 UPDATE가 entityFilter 게이트된 SELECT로 사전 검증된 id만 사용 = block-내 read-gate 패턴, IDOR 아님) 전부 파라미터화 확인. `matched_payment_id` 등 3필드 NULL 정리도 형제 경로(`/unmatch`)와 집합 일치.
> - **`ar-helpers.ts`(e7d9047, FIFO 재작성) SQL 인젝션 관점 재검증**: `CARRYOVER_ORDER_NUMBER_LIKE = "'%OPEN%'"`는 런타임 값이 아니라 **컴파일타임 상수 리터럴**이라 SQL 문자열에 직접 삽입돼도 인젝션 표면 아님. 나머지 전부 `?` 바인드 + `entityFilter(g/p/a)` 3종 적용. HAVING 별칭 미사용(서브쿼리 wrap) 주석도 유지.
> - **`printEvents.ts`(af0e13a/872c0f0) 과다기록 서브쿼리**: `file_name IN (${chunk.map(()=>'?').join(',')})`는 정형 placeholder + DB 조회값(`r.file_name`, 사용자 직접입력 아님) 바인드라 SQLi 표면 없음(#458 청크 패턴 재확인).
> - **`bank.js`/`ledger.js`(프론트) XSS 재확인**: `renderTransferCandidates`의 `account_label`/`counterpart_name` free-text는 `escHtml()` 적용 확인, 신규 `p.fee`/`p.amount`는 `Number()` 강제라 싱크 아님. `transferSummary`는 `textContent` 사용(innerHTML 아님).
> - **필수 grep**: 시크릿 폴백(`c.env.[A-Z_]+ *\|\| *'`) → `fax.ts:43`(기존 FP, 변동없음) 1건뿐. 기본비밀번호 리터럴·CI yml secrets fallback·미청크 동적 IN절 = 전부 0건.
> - **🔒 net-new 발견 — hono(프로덕션 의존성) CVE, 자동수정**: `npm ci` 후 `npm audit` = 12건(1 moderate·9 high·2 critical), 그중 **`hono`(devDep 아닌 실제 프로덕션 런타임 의존성)가 `<=4.12.33` 범위에서 high severity 다건**(CORS 미들웨어 ReDoS `GHSA-8j4g-w8fx-2239`, CORS wildcard+credentials 반사 `GHSA-88fw-hqm2-52qc` 등). CORS credentials 반사는 `index.tsx:224` cors() 설정에 `credentials:true` 자체가 없고(Bearer 인증, 쿠키 미사용 — 기존 오탐표 근거와 일치) 무해하나, **ReDoS는 `/api/*` 전체에 걸린 cors() 미들웨어가 실사용 중이라 실제 도달 가능**. `npm audit fix`(전체)는 wrangler(4.123.0)가 `@cloudflare/workers-types@^5`를 요구하는데 root가 devDep로 v4를 고정해 **ERESOLVE로 즉시 실패** — hono만 단독 `npm install hono@4.13.2`로 격리 업데이트(다른 패키지 미변경) → `npx tsc --noEmit` clean, `npm run build` clean(6,373.64 kB, 베이스라인 6,366.94 kB 대비 hono 자체 코드 증가분) → 커밋(`77a7796`) + push. 나머지 11건(vite/wrangler/esbuild/miniflare/postcss/sharp/nanoid/undici/ws/concurrently/shell-quote)은 전부 devDependency(빌드 툴체인, 프로덕션 번들 미포함) + major 버전 점프 필요(자동수정 금지 범주: 빌드/배포 설정 변경) → **Issue #613**로 보고(wrangler↔workers-types peer 충돌 상세 포함).
> - **open 4건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612(변동없음, 각 1개 owner 코멘트는 기존과 동일 "보류 확정") — 이번 churn 파일과 무관, 캐시 유지.
> - **backlog↔GitHub 절대값 재동기화**: open **4→5**(신규 #613 반영) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. `npm audit` 기반 프로덕션-의존성 CVE 점검은 기존 "필수 grep" 목록(시크릿 폴백 등)과 동일 계열의 standing check로 편입할 가치가 있으나, 이번 1회만으로 반복성 판단 이르다고 보고 codify 보류(다음 Area5에서 재발 시 승격 검토).
> - 신규 이슈 1건(#613, devDependency 취약점+peer충돌), 자동수정 1건(hono CVE 패치, 커밋 `77a7796`), done-sync: open 4→5·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-13T15:47):**
> - **방법**: `git fetch origin main`(HEAD `7b431bc`, origin과 강제업데이트 후 완전 일치, 워킹트리 clean). 직전 Area3 앵커(`a7da2a3`)는 이번 사이클에도 유효한 조상(`git merge-base --is-ancestor`=true) — 그 이후 신규 커밋은 2개뿐: Area3 자신의 backlog 커밋(`e74851b`) + LogWatcher kit 설정 파일(`7b431bc`, `LogWatcher/kit/config/**`만 변경 — 웹앱 스캔 범위 밖). Area1~6이 오늘 공유해 온 앵커(`ca38708`)도 여전히 유효해 그 지점 기준 churn 재확인. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `ca38708..HEAD` 웹앱 범위 = 기존 7커밋 그대로(`8245211`·`e7d9047`·`5b6de48`·`f235d5c`·`af0e13a`·`872c0f0`·`8313bdf`) — 그중 `e7d9047`(FIFO 연체판정)·`5b6de48`(Area4 자신의 dead-code 정리)은 직전 Area4(08-11) 사이클에서 이미 데이터정합성 렌즈로 검토 완료. **`f235d5c`·`af0e13a`·`872c0f0`(출력이력 분할출력/과다기록)·`8313bdf`(계좌이체 수수료허용매칭)는 다른 Area(헬스·품질·UX·보안·자기진화)는 다뤘으나 데이터정합성 렌즈는 미실시** — 4건 신선 diff Read 전수 수행.
> - **`f235d5c`/`872c0f0`(printEvents.ts 타일 가시성+정규화)**: 신규 `tiled=1` 필터·`tile_rows`/`tile_files` 집계 전부 read-only 표시용, 저장 데이터 변형 없음. `872c0f0`은 자기발견 버그(타일 1장=1행을 안 나눠 합산하던 과다기록 오탐)를 `copy_total/tile_count` 정규화로 자체 교정 — 오히려 기존 정합성 결함을 셀프 픽스. 고아/상태불일치/중복 없음.
> - **`af0e13a`(과다기록 의심 배지) 데이터정합성 심층 검증**: 신규 서브쿼리는 `file_name IN (...)` 80개 청크로 조회한 집계값(`day_copies`/`day_rows`)을 응답 JSON에만 얹는 read-only 파생 필드 — `print_events` 테이블에 쓰기 없음, entity_id 미적용은 기존 설계(공유 인프라, Area2/6 기확인)와 일관. 인덱스 관점: `file_name`엔 전용 인덱스가 없어(주 조회는 `id`/`created_at` 기반) 청크당 최대 80개 `file_name IN (...)` + `GROUP BY`가 테이블스캔일 가능성 있으나, `print_events`가 handled `WHERE`(entity/agent/date 등)로 페이지당 최대 50행만 이 서브쿼리에 진입해 스캔 비용이 페이지 크기에 bound(N+1 아님, 이미 Area2가 확인) — **신규 인덱스 제안 보류**(스캔 대상 자체가 작아 marginal value 낮음).
> - **`8313bdf`(계좌이체 수수료허용 매칭) 데이터정합성 심층 검증 — 오탐 직전 자체 배제**: `confirm-transfer`가 이제 `match_status != 'APPLIED'`인 행(CONFIRMED 포함)을 이체후보로 재분류 허용 → **가설**: 이미 `matched_payment_id`로 client 입금(payments 레코드)에 연결된 거래가 이체로 재분류되면 `matched_payment_id`만 NULL 처리되고 `payments` 레코드 자체는 안 지워져 AR이 영구 과소계상될 수 있다(고아 payments). **검증 결과 = 도달 불가능(FP)**: `matched_payment_id`는 `match_status='APPLIED'`로 전이되는 시점(`bank.ts:1651/1697/1705`)에만 설정되는데, `confirm-transfer`가 이체 전환을 막는 조건이 정확히 `match_status === 'APPLIED'`(`:2364`) — 즉 `matched_payment_id`가 실제로 채워진 행은 애초에 이체 후보 전환이 차단된다. `CONFIRMED`(재전환 허용 대상)는 `matched_client_id`만 있고 `matched_payment_id`는 항상 NULL(아직 payments 미생성 상태)이라 널링해도 실질 변화 없음 — 우려한 고아 payments 시나리오는 상태전이 설계상 발생 불가. `unlink-transfer`/`confirm-transfer` 양쪽의 `matched_payment_id`/`matched_purchase_payment_id`/`matched_link_mode` 3필드 동시 정리도 형제 경로(`/unmatch`)와 집합 일치 확인. `idx_bt_matched_pp_uniq`/`idx_bt_matched_payment_uniq`(0470, partial UNIQUE) 무변경 유지로 중복 링크 자체도 DB 레벨 차단.
> - **standing scan 재실행**: `npm run audit:entity` — 131파일·61쿼리·**누락 0**(변동없음).
> - **open 4건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612(변동없음) — 이번 churn(printEvents/production/bank) 파일과 전혀 겹치지 않아 캐시 유지.
> - **backlog↔GitHub 절대값 재동기화**: open **4**(변동없음, 실측) · done/rejected는 직전 사이클(Area3, 오늘 09:45) 이후 GitHub 측 변동 신호 없어 캐시 유지(done 531·rejected 6).
> - **🧬 SKILL 강화**: area-4-data-integrity.md 잔여 `line N` 참조 2건(구 line 148 「CHECK literal-write 스캔」·구 SKILL line 33 「테이블 rebuild FP 클래스」[대상 불명])을 서술 참조로 전환 완료(2-b 절차, 이번 사이클분) — 잔여 0건. 신규 오탐/탐지 클래스는 없음: `confirm-transfer`의 APPLIED 게이트가 `matched_payment_id` 고아화를 원천 차단하는 패턴은 기존 "상태전이 선행조건 대조로 가설 배제" 방법론의 인스턴스일 뿐이라 별도 규칙 불요.
> - 신규 이슈 0건(신선 churn 4건 전부 데이터정합성 렌즈로도 clean — 표시용 파생필드/자체교정/상태전이로 원천 차단된 가설), 자동수정 0건, done-sync: open 4(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-13T09:45):**
> - **방법**: `git fetch origin main`(HEAD `a7da2a3`, origin과 완전 일치) — 컨테이너가 detached HEAD였으나 origin/main과 동일 커밋(직전 Area2 자신의 backlog 커밋). Area1~2가 오늘 공유해 온 앵커(`ca38708`)로 그대로 churn 계산.
> - **churn 확인**: `ca38708..HEAD` 웹앱 범위 diff-stat = `src/pages/{bank,production}.ts`·`src/scripts/{bank,ledger,production}.js` 5파일(119줄) — Area1/2/4/5/6가 이미 각자 렌즈(헬스·품질·데이터정합·보안·자기진화)로 본 동일 커밋군(`8245211`·`e7d9047`·`5b6de48`·`f235d5c`·`af0e13a`·`872c0f0`·`8313bdf`)의 프론트 산출물을 UX 렌즈로 전수 diff Read(코드품질/보안 렌즈와 별개).
> - **`ledger.js`(e7d9047 FIFO 연체판정 UI, 72줄)**: `renderOverdueWarning`이 `drawOverdueWarning`으로 분리되며 상위 10곳만 기본 노출 + "나머지 N곳 더 보기" 토글 신설(전량 렌더 시 큰 건이 안 보이는 문제 자체 예방) — 이관 전액이월(carryOnly) 건은 빨강 대신 앰버톤+"이월" 배지로 구분해 실제 당기 연체와 오독 방지, 합계(`totalAmt`/`totalCarry`) 헤더 표기, `#overdueWarningSection` 부재 시 `console.warn` 가드(HTML↔JS silent-fail 방지 패턴 준수), `escapeHtml`+`replace(/'/g,...)` 이스케이프 유지 — UX 결함 없음, 오히려 기존보다 개선(요약+상세 분리).
> - **`bank.js`/`bank.ts`(8313bdf 계좌이체 수수료매칭 UI)**: 조회기간 셀렉트(90일/1년/전체) + 수수료건수 요약(`transferSummary`) 신설, 로딩 상태(`감지 중...` 스피너) 유지, 수수료 뱃지(`p.fee>0`) 표시. `#transferRange` 부재 시 `console.warn`+기본 90일 폴백(silent-fail 아님). `confirmTransfer(i)` 더블클릭 검토 — 버튼 disable 없이 재클릭 가능하나 백엔드(`bank.ts:2374` UPDATE, WHERE 조건 없이 무조건 갱신)가 **동일 입력에 대해 멱등**(같은 pair id 재기록)이라 TOCTOU 데이터손상 없음(#519 `confirmAllTransfers`는 이미 버튼 disable 처리 확인, 단건 `confirmTransfer`는 멱등이라 가드 불요 판정) — 신고 대상 아님.
> - **`production.js`/`production.ts`(f235d5c/af0e13a/872c0f0 분할출력+과다기록배지)**: 필터칩(`분할출력만`, X로 해제)·요약행(`분할출력 N건·M파일`, 건수≠파일수 오독 방지 주석)·타일배지(`N/M 타일`)·과다기록 배지(`title=` 툴팁에 원인 설명까지 포함, FLEXI 취소 로그 공백 안내) 전부 `escapeHtml` 또는 `Number()` 강제(XSS/렌더 안전, Area6가 이미 검증) — `poRenderRows` 빈 배열 시 generic 빈상태(`해당 조건의 출력 실적이 없습니다`) 유지, `resetOutputFilters`가 신규 `poTiled` 체크박스도 초기화 대상에 포함 — 필터 추가 시 리셋 누락 없음. UX 결함 없음.
> - **백엔드-프론트 계약 대조**: `bank.ts:2341` 응답(`pairs`/`count`/`days`/`feeCount`) ↔ `bank.js` 소비 필드 1:1 일치, `days=0`(전체기간) 옵션도 프론트 select에 존재 — 백엔드먼저·화면나중 패턴 아님(신규 API 필드가 전부 즉시 소비됨).
> - **open 4건 재확인 — 코멘트 확인(신규)**: #606·#608·#609에 각 1개 코멘트 발견해 서브에이전트로 내용 확인 — 전부 **owner(kyj119) 본인**이 남긴 판단이며 내용은 3건 모두 "지금 자동수정 보류, 별도 세션/논의 트랙으로 분리"(#606: 노출 vs 제거 판단 대기, #608: 배포프로세스 논의와 묶어야 함, #609: 재고축 리팩터라 단독 세션 필요) — 👍 승인 없음, 방향 수정 지시도 아님(보류 확정) → auto-improve 액션 불요, 상태 🆕 유지가 맞음(코멘트 존재를 백로그에 근거만 남김, 재보고 방지). #612는 코멘트 없음(리액션 대기 지속).
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(OPEN,auto-improve)` **4**(변동없음) · `search_issues(reason:completed,label:auto-improve)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: area-3-ux-audit.md 잔여 `line N` 참조 1건(구 line 133 「`'/*'` 오발」)을 서술 참조로 전환 완료(2-b 절차, 이번 사이클분) — 잔여 0건. 신규 오탐/탐지 클래스는 없음: `confirmTransfer` 더블클릭 검토가 새로운 하위클래스이나("동일입력 재제출=쓰기멱등이라 무해"), 기존 15회차 "backend 멱등이면 프론트 가드 부재 드롭" 원칙의 인스턴스일 뿐이라 별도 규칙 불요.
> - **백로그 트림 체크**: 사이클 로그 추가 후 13건 → 임계 13건 도달, `npm run backlog:trim` 실행 예정(이 로그 저장 직후).
> - 신규 이슈 0건(churn 5파일 전부 UX 렌즈로도 clean — 로딩/빈상태/이스케이프/필터리셋 전부 양호, 오히려 FIFO 배너는 기존보다 UX 개선), 자동수정 0건(스킬 파일 서술참조 전환은 코드 아님), done-sync: new 4(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-12T16:20):**
> - **방법**: `git fetch origin main`(HEAD `d41a1e2`, origin과 완전 일치, 워킹트리 clean) — 이번 사이클은 컨테이너 재구성 없이 직전 Area1 자신의 커밋이 HEAD(`d41a1e2`=Area1의 backlog 커밋). Area1~6가 오늘 공유해 온 앵커(`ca38708`)는 여전히 유효(`git cat-file -t`=commit, 50커밋 전체 정상 이력). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `ca38708..HEAD` 웹앱 범위 = `bank.ts`/`bank.js`·`cron.ts`·`ledger/ar-helpers.ts`·`ledger/ar-receivables.ts`·`ledger.js`·`printEvents.ts`·`production.ts`/`production.js` 10파일, 7커밋(`8245211`·`e7d9047`·`5b6de48`·`f235d5c`·`af0e13a`·`872c0f0`·`8313bdf`) — Area1 로그대로 Area4/5/6가 데이터정합·보안·자기진화 렌즈로 이미 봤으나 **코드품질 렌즈(entity_id INSERT·N+1·authMiddleware·dead code·SELECT*)는 미실시**라 직접 diff Read 전수 수행.
> - **`bank.ts`(8313bdf/8245211) 코드품질 검증**: `detect-transfers`가 종전 O(W×D) 전수 이중루프를 **날짜별 Map 버킷(`depByDay`, ±2일 창)**으로 교체 — `days=0`(전기간) 옵션 추가로 스케일이 커진 것을 오히려 선제적으로 N+1 방지. `confirm-transfer`/`unlink-transfer`의 신규 `matched_payment_id`/`matched_purchase_payment_id`/`matched_link_mode` NULL 정리 컬럼 3종은 `migrations/0043`(원본 CREATE)·`0466`(ADD COLUMN) 실재 확인(최초 grep이 "ADD COLUMN|CREATE TABLE" 라인 패턴에 안 걸려 오탐 직전이었음 — 컬럼 정의 라인 자체엔 그 텍스트가 없는 원본 CREATE TABLE 바디였음, 재확인으로 배제). `cron.ts`(`bankOnly` 플래그)는 `agentKeyMiddleware` 그대로, 단순 조건분기라 갭 없음.
> - **`ar-helpers.ts`/`ar-receivables.ts`(e7d9047, FIFO 연체판정) 코드품질 재검증(Area4는 데이터정합 렌즈, 이번엔 별개 렌즈)**: 신규 `queryFifoOverdue()` 호출처 3곳(`/overdue`·`/receivables?overdue_only=1`·`/receivables/check-overdue`) 각각 요청당 1회, 루프 내부 호출 없음 — N+1 아님. `SELECT * FROM (...)` 1건은 raw 테이블이 아니라 **CTE 파생테이블 wrapping**(HAVING 별칭 버그 회피용, 원 컬럼은 전부 명시 산출) → "SELECT * 점진 전환 대상" 클래스 아님(FP 배제 확인). 제거된 `OverdueClientRow`/`OverdueAlertRow`는 Area4가 이미 dead code로 제거 완료(`5b6de48`) — 재확인만.
> - **`printEvents.ts`(af0e13a/f235d5c/872c0f0, 분할출력+과다기록배지) 코드품질 검증**: 과다기록 의심 로직의 파일명 배치 조회는 **80개 청크 루프**(D1 바인드 100한도 준수, `d1-bind-param-limit` 패턴)로 이미 N+1 회피 구현 — per-row 쿼리 아님. `authMiddleware` 최상단 유지, `entityFilter` 기존 정책(공유 인프라 무필터, Area2 08-11 25회차 codify) 그대로.
> - **authMiddleware recursive standing scan**: `find src/routes -name '*.ts'` 전수 → 무-auth 후보 7개(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전부 재확인 — `orders/helpers.ts`·`payroll/shared.ts`·`taxInvoices/helpers.ts`는 `Map.get(` FP(라우트 아님, 헬퍼파일), `cron.ts`는 `agentKeyMiddleware`(기존 정당 클래스), `hrSelf.ts`는 scoped-token(기존 정당 클래스), `publicUnsubscribe.ts`는 헤더주석에 §50⑧ 법적근거 명시된 의도적 public(rate-limit+토큰128bit+마스킹). **`messagesAd.ts`는 barrel 미스매치처럼 보였으나 실제론 부모 `messages.ts:120` `messagesRouter.use('/*', authMiddleware, requireRole('ADMIN','MANAGER'))`가 `.route('/ad', messagesAdRouter)`로 마운트된 서브라우터에도 상속** — `requireRole`은 자체 JWT 검증 없이 `c.get('user')`만 확인(`middleware/auth.ts:35`)하는 구조라 부모의 authMiddleware 없이 단독 마운트되면 즉시 401(보안 갭 아니라 항상-거부)이었을 것 — 이번엔 정상 상속 확인, net-new 0.
> - **standing scan 재실행**: ① `npm run audit:entity` — 131파일·61쿼리·**누락 0**. ② `grep -rnE "IN \(\$\{" src/routes`(#458 미청크 동적 IN절) — **0건**. ③ 신규 churn 7커밋 전부 entity_id INSERT 추가 없음(데이터 이동 아닌 판정로직/집계/필터 변경 위주).
> - **open 4건 재확인(open≠unfixed)**: #606(`entity-attribution-audit`)·#608(`verify.yml`)·#609(`unitConvert.ts`)·#612(`orders/create.ts`·`update.ts`) — 이번 churn 10파일과 전혀 겹치지 않아 코드 재확인 없이 캐시 유지 타당.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(OPEN,auto-improve)` **4**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음) — 전부 절대값 실측.
> - **🧬 SKILL 강화**: area-2-code-quality.md 잔여 `line N` 참조 4건(38·41행, 「JOIN-aware 확장 시도 전량FP」·「A-027 자동화 standing scan 승격」·「A-027 명시 SELECT 존재성 sibling 컬럼-diff」·Area6 「churn-bridge」)을 서술 참조로 전환 완료(2-b 절차, 이번 사이클분). 신규 오탐/탐지 클래스는 없음 — `matched_payment_id` grep이 "ADD COLUMN|CREATE TABLE" 라인패턴에 안 걸린 건 원본 CREATE TABLE 바디 컬럼정의가 그 두 키워드를 라인에 안 담는 흔한 케이스라 별도 규칙화할 만큼 반복성 낮음(1회성 자기교정으로 충분).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(churn 7커밋 전부 코드품질 렌즈로도 clean — N+1은 오히려 방지 구현, dead code 없음, authMiddleware 상속 정상, entity_id 갭 없음), 자동수정 0건(스킬 파일 서술참조 전환은 코드 아님), done-sync: new 4(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-12T15:38):**
> - **방법**: `git fetch origin main`(HEAD `528a645`, origin과 완전 일치, 워킹트리 clean). 컨테이너 git 이력이 이번 사이클도 재구성됨(root `0b87962`, 50커밋 전부 최근) — 직전 Area1 앵커(`16296f1`)는 무효(`Not a valid object`), Area2~6가 오늘 공유해 온 앵커(`ca38708`)는 유효해 그대로 채택. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `ca38708..HEAD` 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = `bank.ts`/`bank.js`·`cron.ts`·`ledger/ar-helpers.ts`·`ledger/ar-receivables.ts`·`ledger.js`·`printEvents.ts`·`production.ts`/`production.js` 10파일 — 전부 오늘 Area4(FIFO 연체판정)·Area5/6(분할출력·과다기록 배지)가 이미 각자 렌즈로 전수 검토·clean 판정 완료. Area1 시작점(직전 Area6, `8246df5`) 이후 신규 커밋은 `528a645`(Area6 자신의 backlog 커밋)뿐, 코드 변경 없음 — 이번 사이클은 정적 코드 재검토 대상 없음.
> - **배포 CI**: `deploy.yml` 최근 10런(08-12 00:21~06:25) **전부 success**. 최신런(`528a645`, 06:26:48 완료) job 세부 스텝 9개(Checkout→Setup→Install→**Typecheck**→**Build**→**Deploy to Cloudflare Pages**→Wait→**Smoke test (production)**) 전부 success.
> - **backup.yml**: 최근 6런(08-07~08-12) 연속 success — 08-06 1건만 과거 failure(#605 픽스로 재발 없음, 기존 인지).
> - **verify.yml**: 여전히 `total_count: 0`(생성 이래 0회 실행, #608 기보고와 일치, net-new 아님). **e2e.yml**: `state: disabled_manually` 재확인(기존 정책, 회귀 아님).
> - **egress 제약(재확인)**: `curl --max-time 10 https://webapp-9i0.pages.dev/api/orders` → 연결 실패(exit 56, allowlist 밖). `CLOUDFLARE_API_TOKEN` 미설정 확인(`env | grep CLOUDFLARE` = 0건) → `wrangler d1 execute --remote` 불가. 기존 인지된 제약과 동일 — CI(자체 네트워크 보유)의 deploy.yml 성공 이력을 prod 헬스 대리 지표로 사용.
> - **open 4건 재확인(open≠unfixed)**: `search_issues(is:open,label:auto-improve)` = #606·#608·#609·#612, backlog 캐시와 완전 일치(드리프트 없음). 각 이슈가 참조하는 파일(`orders/create.ts`·`update.ts`·`unitConvert.ts`·`entity-attribution-audit`·`verify.yml`)이 이번 churn 10파일과 전혀 겹치지 않아 재확인 생략 정당.
> - **backlog↔GitHub 절대값 재동기화**: open **4**(변동없음) · `reason:completed` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(재확인 완료, 변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. 코드 churn 부재 + CI 전부 green이라 기존 codify된 판별 레시피(cold-start transient·CF finalize transient·smoke stale probe·write-path 맹점)를 적용할 신규 사례 자체가 없음.
> - **백로그 트림 체크**: 사이클 로그 10건(트림 전) → 임계 12건 이하, 트림 불요.
> - 신규 이슈 0건(코드 churn 없음 + CI 전부 green), 자동수정 0건, done-sync: new 4(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 4건** — Area 3, 2026-08-13. #606·#608·#609는 owner 코멘트로 "보류/별도세션" 방향 확정, 승인 아님.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
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
