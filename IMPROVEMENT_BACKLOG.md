# Improvement Backlog
<!-- last_run_area: 5 -->
<!-- last_run_at: 2026-08-19T06:20:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **6** (`search_issues(state:open,label:auto-improve)` 실측, +1(#614). #606·#608·#609·#612·#613·#614) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **531** (`search_issues(reason:completed,label:auto-improve)` 실측, 변동 없음) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 재확인 완료 — 변동 없음) |

> **Area 5 보안 + 인프라 (2026-08-19T06:20):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main` → **origin이 `de31dbf..b6d9305`로 전진**(직전 백로그 기재 HEAD `23dbe6e`보다 최신) → `git checkout main && git reset --hard origin/main`(HEAD `b6d9305`, origin과 완전 일치). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area5 자신의 앵커(`9728baa`) 기준 웹앱 범위 diff = 신규 커밋 5개: `a6beebe`(Area2 기정독)·`68c2b60`(Area3 기정독)·`7671499`/`bb56815`/`23dbe6e`(Area4가 데이터 정합성 렌즈로 정독) — 보안 렌즈로는 미검토라 `7671499`(배송지 분리, 신규 입력필드+신규 라우트 2개)·`23dbe6e`(거래처 변경 시 배송처명 갱신)를 직접 정독(`bb56815`는 CSS-only, 보안 무관).
> - **`7671499` 보안 정독**: ① 신규 필드 `delivery_postal`이 프론트 `orders.js:1241`에 `escapeHtml()` 적용돼 렌더(XSS clean) ② **한진 CSV 벌크업로드 재활성화**(그동안 우편번호 항상 공란) — `shipments.ts:1353 POST /hanjin-export`가 `esc = escapeCsvField`(#367 공용 formula-injection 가드)를 전 컬럼에 매핑 적용 중이고 postal은 추가로 `.replace(/[^0-9]/g,'')` 숫자만 허용 = CSV Formula Injection 클래스 신규 위반 없음 ③ 신규 라우트 `clients.ts GET /name-index`(전 거래처 이름색인, `/:id`보다 먼저 등록해 라우트 섀도잉 회피) — `clients` 마스터는 entity_id 컬럼 자체가 없는 전역 테이블(「entity_id 없는 전역 마스터」 FP클래스⑤와 동일 설계), LEFT JOIN 서브쿼리의 `last_order_date`만 `entityFilter`로 자기 법인 한정 = 의도된 설계, IDOR 아님 ④ `settings.ts GET /data-completeness` — role 게이트 없음이나 반환값이 날짜 1개(민감정보 아님)이고 주석에 "경고는 숨길수록 위험" 명시된 의도적 설계 ⑤ `workbench.ts POST/GET /intakes`의 신규 `item_id` 컬럼 — SQL 전부 `?` 바인딩 파라미터화, `LIMIT ${limit}`은 기존 `Math.min(parseInt(...)||n, cap)` 안전 정수(신규 아님).
> - **`23dbe6e` 보안 정독**: `client.js selectClient()` — `.value` 프로퍼티 대입만(innerHTML 아님), XSS 표면 없음.
> - **standing scan 재실행**: ① 시크릿 폴백 `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43`(기존 FP, 변동없음) 1건뿐. ② 기본비밀번호 리터럴 grep → 0건. ③ 미청크 동적 IN절(`IN (\$\{`) → 0건. ④ CI yml secrets fallback → 0건.
> - **npm audit 재확인**: `npm ci` 후 11건(1 moderate·8 high·2 critical) — `concurrently`·`vite`·`wrangler`(direct) + `esbuild`·`miniflare`·`nanoid`·`postcss`·`sharp`·`shell-quote`·`undici`·`ws`(transitive) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **open 6건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613·#614(전건 변동없음, `updated_at` 전건 직전 확인 시점과 동일 — 신규 코멘트 없음. #612 크로스법인 IDOR도 여전히 open).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md는 이미 `line N` 잔여참조 0건(재확인). 이번 사이클은 실제 churn 2건(배송지 분리·CSV 벌크업로드 재활성화)을 보안 렌즈로 직접 정독했으나 기존 codify된 레시피(CSV formula-injection #367 가드·FP클래스⑤ 전역마스터·XSS escapeHtml)로 전량 clean 판정 — 새 오탐/탐지 클래스 도출 없음, 기존 레시피가 신규 CSV 기능에도 정확히 적용됐음을 확인.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 13건 도달, `npm run backlog:trim` 실행 예정(이 로그 저장 직후).
> - 신규 이슈 0건(churn 2건 직접 정독, 전부 정상/완결 코드), 자동수정 0건, done-sync: open 6(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-19T00:45):**
> - **방법**: `git status`=clean, `git fetch origin main` → **origin이 `de31dbf..23dbe6e`로 전진** → `git checkout main && git reset --hard origin/main`(HEAD `23dbe6e`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area4 자신의 앵커(`4932e85`) 기준 웹앱 범위 diff = 신규 커밋 5개: `a6beebe`(Area2 기정독)·`68c2b60`(Area3 기정독)·**`7671499` `feat(orders): split delivery address into postal/road/detail (0535)`**(신규 마이그 0532~0535 포함, 대형)·`bb56815`/`23dbe6e`(후속 UI-only 픽스, 데이터 정합성 무관) — 데이터 정합성 렌즈로 `7671499`와 신규 마이그 4건 직접 정독.
> - **마이그 4건(0532~0535) 정독**: 전부 additive(컬럼/인덱스 추가 또는 `WHERE NOT EXISTS` 멱등 INSERT), NOT NULL no-default 위반 없음, `0533`은 `category_id NOT NULL`에 4단 COALESCE 폴백으로 로컬시드 제약위반까지 방어. `0535`(배송지 분리)는 레거시 `delivery_info` 원문 불변 + 신규 컬럼 전부 NULL 허용 = 8,758건 기존 row 영향 0.
> - **0535 write-path 전수(operations.ts/update.ts/create.ts) recon-status 핸들러(`orders/core.ts:31-81`) 직접 대조**: `RECON_STATUSES` 화이트리스트로 CHECK 미선언 컬럼(`recon_status`)의 literal write를 자체 검증 + `entityFilter` 적용 + D1 bind 100 한도 회피(80개 청크) — 신규 코드 자체는 clean.
> - **🐛 발견 (신규, net-new) — items 하드삭제 참조가드에 `designer_intakes.item_id` 누락**: `0532_designer_intake_item.sql`이 `designer_intakes.item_id INTEGER REFERENCES items(id)`(items를 참조하는 20번째 FK)를 신설했으나, `items.ts:1414` 하드삭제 가드(`refCategories` 19개 카운트 서브쿼리, 주석: "items(id)를 FK로 참조하는 모든 테이블에서 사용 중이면 차단")의 sweep 목록에는 없음. 기존 codify된 「신규 FK 참조 컬럼이 큐레이션된 삭제가드에서 누락」 패턴(#454/#477/#480/#570 계열)의 새 사례 — 단 대상이 order 삭제가 아니라 **item 하드삭제**라는 신규 변종. 영향: 가공대기 매칭으로 `item_id`가 채워진 품목을 ADMIN이 하드삭제하면 가드 통과 후 FK(NO ACTION) 위반으로 throw → 의도된 409 대신 불명확 500. 데이터 손상은 아님(FK가 삭제 자체는 막음), 관리자 UX 저하. **자동수정 안 함**(삭제 차단조건 확장=비즈니스 로직) → **Issue #614** 등록(bug, S).
> - **standing scan**: `npm run audit:entity` 131파일·61쿼리·**누락 0**(변동없음, 신규 컬럼 전부 SELECT 미대상이라 불변). `sort-audit.cjs` P1 **0건**(변동없음). `migration-drift-audit.cjs`는 `CLOUDFLARE_API_TOKEN` 미설정으로 기존과 동일하게 실행 불가(기존 제약, net-new 아님).
> - **open 6건 재확인**: `search_issues(state:open,label:auto-improve)` = #606·#608·#609·#612·#613(전건 변동없음)+**#614 신규**.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(+1) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md는 이미 `line N` 잔여참조 0건(재확인). 이번 사이클 신규 오탐/탐지 클래스 없음(#454/#477/#480/#570 계열 기존 레시피가 item 하드삭제 가드라는 새 대상에도 그대로 적중, 레시피 일반화 확인 — "부모 삭제 핸들러"뿐 아니라 "명시적 참조-카운트 가드"류도 같은 churn-재스캔 규율 적용 대상임을 재확인만, 신규 문서화 불요).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 1건(#614, items 하드삭제 가드 FK 누락), 자동수정 0건, done-sync: open 6(+1)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-18T21:45):**
> - **방법**: `git status`=워킹트리 clean(detached), `git fetch origin main` → **origin이 `de31dbf..68c2b60`로 전진** → `git checkout main && git reset --hard origin/main`(HEAD `68c2b60`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area3 자신의 앵커(`d142fea`) 기준 웹앱 범위 diff = **실질 churn 2건**: ① `a6beebe`(bank/ledger, Area 2가 이미 코드품질 렌즈로 정독·clean 판정) ② **`68c2b60` `feat(inventory): add zone selector to stock count creation modal`**(auto-improve 외부 세션 커밋, `src/scripts/inventoryCount.js` 47줄) — UX 렌즈로 신규, 직접 정독.
> - **`68c2b60` 정독 결과**: 재고 실사 생성 모달에 **구역(zone) 선택 셀렉트를 신규 추가** — 백엔드(`inventoryCount.ts` P3 구역실사 로직, `inventory.ts:953 /dashboard/zones`)는 이미 완비돼 있었으나 모달이 `category`만 보내고 `storage_zone_id`를 안 보내 **구역별 실사가 UI로 생성 불가**하던 갭을 메움 — Area 3가 3회 누적 codify한 「백엔드 먼저·화면 나중」 표준스캔이 정확히 겨냥하는 클래스의 **해소 사례**(신규 결손 아님). 코드 품질도 양호: `escapeHtml` 전건 적용(zone_name/zone_code) · `getElementById` 신규 대상(`countZone`/`countCategory`) 가드+`console.warn` 폴백(CLAUDE.md silent-fail 컨벤션 준수) · 구역 선택 시 분류 셀렉트 비활성화로 서버측 우선순위(구역>분류)와 UI 기대값 정합 · 성공 토스트에 구역명 반영. 실사 흐름(생성→상세조회→완료) 다른 접점(`loadDetailCount`) 변경 없음 — 회귀 위험 낮음.
> - **standing scan 재실행**: ① HTML↔JS silent-fail 전수 diff — 이번 신규 id(`countZone`/`countZoneHint`)는 같은 파일 내 자체 렌더(동적 `modalHtml`)라 (b)류 정상, cross-file 갭 아님. ② axios→라우트 존재성 — `/api/inventory/dashboard/zones`·`/api/inventory-counts`(POST) 둘 다 `inventory.ts`/`inventoryCount.ts`에 실재 확인(신규 매치 아님, 기존 엔드포인트 재사용). ③ 「백엔드 먼저·화면 나중」 표준스캔 — 이번 churn은 반대방향(화면이 뒤늦게 따라붙은 사례)이라 candidate 0.
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, `updated_at` 전건 직전 확인 시점과 동일 — 신규 코멘트 없음).
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md는 이미 `line N` 잔여참조 0건(재확인). 이번 사이클은 실제 churn(신규 UX 기능 커밋)이 있었고 기존 codify된 「백엔드 먼저·화면 나중」 표준스캔 렌즈로 **정반대 방향(갭 해소 사례)**임을 확인 — 새 오탐/탐지 클래스 도출 없음, 기존 레시피가 정상 작동함을 재확인.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(실제 churn 2건 정독, 둘 다 정상/완결 커밋), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 1 프로덕션 헬스 (2026-08-18T09:44):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main`(HEAD `36ac54d`, origin과 완전 일치) → `git checkout main && git reset --hard origin/main`으로 정리. 직전 Area1 자신의 앵커(`e9fa6c5`)는 이번 사이클에도 유효한 조상. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `e9fa6c5..HEAD`(직전 Area1 자신의 마지막 커밋 이후) 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **공백**(신규 커밋 5개 전부 auto-improve backlog 커밋: `d142fea`·`4932e85`·`9728baa`·`4386c76`·`36ac54d`) — 정적 코드 재검토 대상 없음.
> - **배포 CI**: `deploy.yml` 최근 10런(08-15 06:44~08-17 18:45) **전부 success**. 최신런(`36ac54d`, 18:45:00 완료, 현재 HEAD와 일치) success.
> - **backup.yml**: 최근 10런(08-08~08-17) **전부 success**(08-06 known failure는 조회 윈도 밖으로 이탈, 재발 없음).
> - **verify.yml**: 여전히 `active`이나 실행 이력 미확인(#608 기보고와 일치, net-new 아님). **e2e.yml**: `state: disabled_manually` 재확인(기존 정책, 회귀 아님).
> - **egress 제약(재확인)**: `curl --max-time 8 https://webapp-9i0.pages.dev/api/orders` → CONNECT tunnel 실패(exit 56, allowlist 밖). `CLOUDFLARE_API_TOKEN` 미설정(`env | grep CLOUDFLARE` = 0건) → 직접 prod 조회 불가, 기존과 동일 제약 — CI(자체 네트워크 보유)의 deploy.yml 성공 이력(Smoke test 포함)을 prod 헬스 대리 지표로 사용.
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, `updated_at` 전건 직전 확인 시점과 동일 — 신규 코멘트 없음).
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. 코드 churn 부재 + CI 전부 green이라 기존 codify된 판별 레시피(cold-start transient·CF finalize transient·smoke stale probe·write-path 맹점·prod↔main 디버전스)를 적용할 신규 사례 자체가 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 8건 → 이번 로그 추가 후 9건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(코드 churn 없음 + CI 전부 green), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-18T15:44):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean. `git fetch origin main` → **origin이 `de31dbf..a6beebe`로 19커밋 전진**(직전 백로그 기재 HEAD `36ac54d`보다 최신) → `git checkout main && git reset --hard origin/main`으로 정리(HEAD `a6beebe`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area2 자신의 앵커(`e9fa6c5`)는 이번 사이클에도 유효한 조상. `e9fa6c5..HEAD` 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **실질 churn 1건**(`a6beebe` `fix(ledger,bank): keep balance-only suppliers, unify AR period basis, split receivables by entity` — `src/routes/bank.ts`·`src/routes/ledger/{accounts-payable,ar-helpers,ar-ledger}.ts`·`src/scripts/bank.js`·`src/pages/bank.ts`, 나머지 신규커밋 다수는 전부 auto-improve backlog 커밋). 오랜만의 실제 웹앱 diff — 코드 품질 렌즈로 직접 정독.
> - **커밋 diff 정독 결과**: entity_id 배선 정확(`entities` 신규 JOIN·`byEntity` 파라미터화, `ar.eid` 필터 + 소계 집계 전부 entity_id 기준) · `ORDER BY ar.eid ASC, ar.balance DESC, c.id ASC`(고유키 tie-break 준수) · 프론트 `bank.js` `escHtml()` 전건 적용(엔티티명·소계라벨 포함, XSS 갭 없음) · N+1 없음(신규 서브쿼리 전부 JOIN/GROUP BY 집계, 루프 내 쿼리 없음) · 커밋 자체가 typecheck/build/entity-audit 61/61/sort-audit/migration-drift/smoke 111/111/브라우저 확인까지 완결 — Area 2 자동수정 후보(entity_id 누락·타입불일치·dead code) net-new 0.
> - **standing scan 재실행**: ① `npm run audit:entity` — 131파일·61쿼리·**누락 0**(변동없음, 이번 churn 포함 재검증). ② `grep -rnE "IN \(\$\{" src/routes` 전수 재확인 — 매치 전부 기존 codify된 FP 클래스(per-entity bounded IN, #458 판정 기준)이며 이번 신규 커밋 파일(bank.ts/ar-helpers.ts/ar-ledger.ts/accounts-payable.ts)에서 net-new 매치 0. ③ authMiddleware — 이번 churn이 기존 파일 내부 수정뿐(신규 라우트 파일 0) + `bank.ts` `/receivables`는 기존 `requireRole('ADMIN','MANAGER')` 유지 확인, recursive 재스캔 불요.
> - **npm audit 재확인**: `npm ci` 후 11건(1 moderate·8 high·2 critical), 전부 devDependency(#613 기보고와 일치, net-new 아님).
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, `updated_at` 전건 직전 확인 시점과 동일 — 신규 코멘트 없음, 이번 churn과 무관한 영역).
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인 0건(기존 유지). 이번 사이클은 실제 churn이 있었는데도 기존 codify된 레시피(entity_id diff·IN절 청크·sort tie-break·XSS escHtml)로 전량 clean 판정이 가능했음 — 새 오탐/탐지 클래스 도출 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(실제 churn 1건을 직접 정독했으나 이미 자체 검증 완결된 정상 커밋), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 6 자기 진화 (2026-08-18T03:44):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main`(HEAD `4386c76`, origin과 완전 일치) → `git checkout main && git reset --hard origin/main`으로 정리. 직전 Area6 자신의 앵커(`8cf764b`)는 이번 사이클에도 유효한 조상(fast-forward 16커밋). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `8cf764b..HEAD`(직전 Area6 자신의 마지막 커밋 이후) 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **공백**(신규 커밋 6개 전부 auto-improve backlog 커밋: `feb5c26`·`e9fa6c5`·`d142fea`·`4932e85`·`9728baa`·`4386c76`) — 컬럼-diff bridge·XSS bridge 둘 다 이번 사이클 검증 대상 없음(신선 라우트/마이그 churn 부재, 7사이클 연속 quiet).
> - **done-sync(절대값 재동기화)**: `list_issues(OPEN,auto-improve)` **5**(#606·#608·#609·#612·#613, `updated_at` 전건 직전 확인 시점과 동일 — 신규 코멘트 없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음) — 백로그 기재값과 완전 일치, 드리프트 0.
> - **open≠unfixed / closed≠fixed 재확인**: 웹앱 churn 자체가 0(공백)이라 이번 사이클 중 in-tree로 픽스될 수 있었던 대상 자체가 없음 — 캐시 유지 타당, 재grep 불요.
> - **마이그 번호 중복 standing scan**: `ls migrations/*.sql | sed -E 's|.*/([0-9]{4})_.*|\1|' | sort | uniq -d` → 기존 5쌍(`0327`·`0412`·`0416`·`0420`·`0453`)만, 파일수 529개(변동없음), net-new 0.
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-remote 0·SAFE-absorbed 0·REVIEW 0 — 삭제대상 0건.
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md 잔여 `line N` 참조는 이미 0건(전 사이클 전환 완료, 이번 사이클도 재확인). `npm run audit:skills` = area-1 파일에만 잔여 3건(이번 사이클 담당 아니므로 미수정). 신규 오탐/탐지 클래스 없음: churn 자체가 0이라 bridge류를 적용할 신선 대상이 없는 quiet cycle.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 13건 도달, `npm run backlog:trim` 실행 예정(이 로그 저장 직후).
> - 신규 이슈 0건(churn 0), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-08-17T21:52):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main`(HEAD `9728baa`, origin과 완전 일치) → `git checkout main && git reset --hard origin/main`으로 정리. 직전 Area5 자신의 앵커(`8cf764b`)는 이번 사이클에도 유효한 조상. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `8cf764b..HEAD`(직전 Area5 자신의 마지막 커밋 이후) 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **공백**(신규 커밋 5개 전부 auto-improve backlog 커밋: `bb916ea`(hono CVE, 이미 검증완료)·`feb5c26`·`e9fa6c5`·`d142fea`·`9728baa`) — 보안 렌즈로 재검토할 신선 웹앱 코드 자체가 없음.
> - **standing scan 재실행(신선 churn 부재해도 매 사이클 필수)**: ① 시크릿 폴백 `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43`(기존 FP, 변동없음) 1건뿐. ② 기본비밀번호 리터럴 grep → `bank.ts:302 account_password || ''`(신규 매치이나 FP — `c.env.X` 폴백 아니라 사용자 body 파라미터의 옵션 기본값, 상위에서 `req.pwd` 필수여부 사전검증됨. 시크릿 하드코딩 아님). CI yml secrets fallback·미청크 동적 IN절 = 0건.
> - **npm audit 재확인**: `npm ci` 후 11건(1 moderate·8 high·2 critical) — `concurrently`·`vite`·`wrangler`(direct) + `esbuild`·`miniflare`·`nanoid`·`postcss`·`sharp`·`shell-quote`·`undici`·`ws`(transitive) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, `updated_at` 전건 직전 확인 시점과 동일 — 신규 코멘트 없음).
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` **4**(재실측 일치) + `reason:duplicate` 2(캐시) = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md는 이미 `line N` 잔여참조 0건(재확인). `npm run audit:skills` = area-1 파일에만 잔여 3건(이번 사이클 담당 아니므로 미수정). 이번 사이클 신규 오탐/탐지 클래스 없음(churn 0으로 codify된 레시피를 적용할 신선 대상 자체가 없음) — bank.ts:302는 FP로 확인만 하고 카탈로그 추가는 불요(이미 「기본 비밀번호 리터럴」 항목의 통상적 스캔 결과 범위 내).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(웹앱 churn 없음, npm audit 잔여는 전부 기보고 devDependency), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-17T15:50):**
> - **방법**: `git status`=detached HEAD였으나 워킹트리 clean, `git fetch origin main`(HEAD `4932e85`, origin과 완전 일치) → `git checkout main && git reset --hard origin/main`으로 정리. 직전 Area4 자신의 앵커(`f1d1dd4`, 백로그 트림으로 로그는 빠졌으나 git 히스토리엔 존재)는 이번 사이클에도 유효한 조상. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: `f1d1dd4..HEAD`(직전 Area4 자신의 마지막 커밋 이후) 웹앱 범위(`src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages`) = **공백**(신규 커밋 5개 전부 auto-improve backlog 커밋: `8cf764b`·`feb5c26`·`e9fa6c5`·`d142fea`·`4932e85`) — 신규 마이그레이션 0건이라 CHECK literal-write·NOT NULL no-default·dangling 고아 재스캔(전부 churn-트리거형)이 재검토할 신선 대상 자체가 없음.
> - **standing scan 재실행(신선 churn 부재해도 매 사이클 필수)**: `npm run audit:entity` — 131파일·61쿼리·**누락 0**(변동없음). 마이그레이션 파일수 529개(변동없음, 신규 0건 재확인).
> - **open 5건 재확인(open≠unfixed)**: `list_issues(OPEN,auto-improve)` = #606·#608·#609·#612·#613(변동없음, `updated_at` 전건 직전 확인 시점과 동일 — 신규 코멘트 없음).
> - **backlog↔GitHub 절대값 재동기화**: open **5**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md는 이미 `line N` 잔여참조 0건(재확인). 이번 사이클 신규 오탐/탐지 클래스 없음(churn 0으로 codify된 레시피를 적용할 신선 대상 자체가 없음).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(웹앱 churn 없음, 신규 마이그 0건), 자동수정 0건, done-sync: open 5(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 4건** — Area 3, 2026-08-13. #606·#608·#609는 owner 코멘트로 "보류/별도세션" 방향 확정, 승인 아님.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
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
