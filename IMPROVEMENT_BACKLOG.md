# Improvement Backlog
<!-- last_run_area: 4 -->
<!-- last_run_at: 2026-08-11T22:20:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **4** (`list_issues(OPEN,auto-improve)` 실측, Area4 재확인. #606·#608·#609·#612, 변동 없음) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **531** (`reason:completed` 실측, 변동 없음) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 재확인 완료 — 변동 없음) |

> **Area 4 데이터 정합성 (2026-08-11T22:20):**
> - **방법**: `git fetch origin main`(HEAD `5f5c69b`) — 컨테이너 git 이력이 이번 사이클도 force-update로 재기록됐으나 직전 Area2/3의 앵커(`ca38708`)는 이번 재기록에도 유효(`git cat-file -t`=commit)해 그 지점 기준 churn 계산 그대로 신뢰 가능. `npm ci`(0→81), `npx tsc --noEmit` clean, `git status` clean.
> - **churn 확인**: `ca38708..HEAD` 중 `src/routes`/`src/scripts`/`migrations`/`index.tsx`/`src/layout`/`src/pages` = `cron.ts`(바로빌 시간당 계좌수집 분기, 순수 운영설정, Area1/3 기확인) + **`ledger/ar-helpers.ts`·`ledger/ar-receivables.ts`·`ledger.js`**(연체 판정 로직 전면 재작성, `e7d9047`) — Area4 렌즈로 신선.
> - **`e7d9047`(연체 판정 LIFO→FIFO 전환) 데이터정합성 심층 검증**: 종전 `/overdue`가 `min(연체청구합, 잔액)`으로 계산해 "입금이 최신 청구건부터 충당된다"(LIFO)는 잘못된 가정 하에 활발히 거래 중인 거래처의 최근 미결제분까지 2025-12-31 이관 캐리오버 전표 탓에 223일 연체로 오표시하던 실버그(prod 실측: E1 201곳/8.15억 → 133곳/4.40억) — `queryFifoOverdue()`(윈도 누적 SUM OVER + `min(청구액, max(0, 누적청구−충당액))` FIFO 워터폴)로 교체. SQL 검증: ORDER BY에 `g.id` tie-break 포함(동일 `bdate` 결정성 확보, CLAUDE.md 정렬 원칙 부합) · HAVING에 별칭 미사용(서브쿼리로 감싸 `clients.overdue_amount` 동명컬럼 오귀속 방지, 주석에 2026-08-10 사고 명시) · `entityFilter` 3파라미터(g/p/a) 전부 적용 · `agingDaysFromOldest`가 Area4 자체 KST SSOT(#366) 준수(UTC 타임스탬프 파싱 후 +9h). `/overdue`·`/receivables?overdue_only=1`·`/receivables/check-overdue` 3개 엔드포인트가 전부 동일 SSOT로 일원화(종전엔 3곳이 각자 다른 기준 — 배너엔 없는 거래처가 목록엔 뜨는 모순 픽스). 로컬 D1 시드 대조 + prod 실측 수치까지 커밋 메시지에 명시된 자기검증 완료 — **net-new 데이터정합성 결함 없음, 오히려 기존 오탐(#미보고 상태였던 LIFO 오분류)을 셀프 픽스**.
> - **🔧 자동수정 — dead code 2건 제거**: `e7d9047`이 `OverdueClientRow`/`OverdueAlertRow`(구 `/overdue`·`/check-overdue` 쿼리 행 타입)를 `ar-receivables.ts` import에서 제거했으나 `ar-helpers.ts` 정의 자체는 잔존 — 전체 repo grep 재확인 결과 두 인터페이스 참조처 0건(정의만 존재). `ar-helpers.ts`에서 20줄 삭제 → `npx tsc --noEmit` clean, `npm run build` clean(6,366.94 kB, 이상 없음), `npm run audit:entity`(131파일·61쿼리·누락 0) 통과 → 커밋.
> - **open 4건 재확인(open≠unfixed)**: #606(`entity-attribution-audit` 프론트 소비처 grep 0)·#608(`verify.yml` 여전히 0회 실행)·#609(`toBase`/`formatStock` 호출처 0)·#612(IDOR 소유권검증 무변경) — 이번 churn(ledger/cron/barobill)과 전부 무관한 파일이라 캐시 유지.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(OPEN,auto-improve)` **4**(변동없음) · `search_issues(reason:completed)` **531**(변동없음) · `search_issues(reason:not_planned)` **4** + duplicate 2 = rejected **6**(재확인 완료, 변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. FIFO 전환은 이미 codify된 "denormalized aggregate 증분 정합성"(area-4 line 근처)과는 다른 축(집계 caching이 아니라 판정 알고리즘 자체 교정)이나, 이미 owner 세션이 prod 실측+로컬 시드 대조까지 자체 완결해 auto-improve가 추가할 검증 가치가 낮음 — 별도 규칙화 보류.
> - 신규 이슈 0건(신선 churn은 owner 세션이 이미 자체 검증 완료), 자동수정 1건(dead code 20줄, 커밋 예정), done-sync: new 4(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-11T21:35):**
> - **방법**: `git fetch origin main`(HEAD `00aaa4c`, origin과 완전 일치, 워킹트리 clean) — 컨테이너 git 이력이 이번 사이클도 재기록(root `f1f9948`, 57커밋 전부 최근, 직전 Area2가 기록한 root `740b8cd`와 다름) — 단 Area2 자신의 앵커(`ca38708`)는 이번 재기록에도 유효해(`git cat-file -t ca38708`=commit) 그 지점 기준 churn 계산은 그대로 신뢰 가능. `npm ci`(0→81) 스킵(직전 사이클 검증 재사용), `git status` clean.
> - **churn 확인**: 직전 Area2 앵커(`ca38708`) 이후 `git diff --stat -- src/scripts src/pages src/layout index.tsx src/routes` = **`src/routes/cron.ts` 1파일뿐**(`8245211` 바로빌 계좌 시간당 수집, 카드는 DAY1이라 제외하는 순수 백엔드/운영 변경 — UX 표면 무관). `src/scripts`/`src/pages`/`src/layout`/`index.tsx` 변경 **0줄** — 이번 사이클은 UX 감사 대상 신선 churn이 사실상 없음.
> - **closed≠fixed 재검증 — #611(카드 다품목 표 overflow-x-auto 누락) 코드 대조**: `cardDetail.js:274` `html += '<div class="cd-multi-wrap"><table class="cd-multi">...'`로 래핑 확인 + `cardDetail.ts:38` `.cd-multi-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }`(인쇄용 `:73`은 `overflow: visible !important`로 별도 처리) 확인 — **실재 픽스, 재발 없음**.
> - **standing scan 대체 실시(신선 churn 부재)**: 새 마이그레이션 0건(`migrations` 디렉터리 ca38708 이후 신규 없음) → "백엔드 먼저·화면 나중"(#606류, 3회 누적 승격 스캔) 신규 후보 자체가 발생하지 않음(전제조건인 신규 컬럼+JOIN 자체가 없음). 대시보드 KPI는 I-011/I-016/I-052/I-059/I-066/A-018/F-003으로 기존에 이미 반복 심층 검토된 영역이라(오늘 Area2도 `dashboard.ts` entity_id 바인드만 별도 대조 완료) 이번 사이클 재감사는 낮은 marginal value로 판단해 생략.
> - **egress 제약(재확인)**: prod host(`webapp-9i0.pages.dev`) curl 403 "Host not in allowlist" — Playwright MCP로 실제 화면 탐색(체크리스트 원칙)도 이 세션에서 불가, 기존 인지된 제약과 동일.
> - **open 4건 재확인(open≠unfixed)**: #606(feature, entity-attribution-audit 프론트 소비처 여전히 0)·#608(verify.yml 여전히 0회 실행)·#609(toBase/formatStock 호출처 여전히 0)·#612(IDOR, 소유권 검증 로직 무변경) — 이번 churn(cron.ts)과 전부 무관한 파일이라 직전 Area2 재확인 캐시 유지.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues(reason:completed)` **531**(변동없음) · open **4**(변동없음) · rejected **6**(재확인 생략, 무변동 근거 충분).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음.
> - 신규 이슈 0건(신선 churn 없음 + 기존 open 4건 전부 여전히 미픽스로 캐시 유지, closed #611은 재검증 결과 실제 픽스), 자동수정 0건, done-sync: new 4(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-11T15:25):**
> - **방법**: `git fetch origin main`(HEAD `ca38708`, origin과 완전 일치) — 컨테이너 git 이력이 이번 사이클도 force-update로 재기록(57커밋 전부 최근, root `740b8cd`). `npm ci`(0→81), `npx tsc --noEmit` clean. 직전 Area2(`8947255`, 08-10T03:16, 61회차) 이후 `src/routes`/`src/scripts`/`index.tsx`/`src/layout`/`src/pages`/migrations 변경 = **12커밋**(ca38708 print-events entity공유·90b0c36 cron 주석·379a7b7 장비 entity공유+다중선택 필터·93c9927 예산알림 신설·4f077a0 등급C 단가백필[0531]·0b87962 AREA 단가정정[0530]·4605227 최소청구면적+가격제안·c396923 주문서 편집 라운드트립 5건 배치·1bfaf7f PDF/JPG/PNG 첨부·7f40097 nav-badges D1폭증+HAVING별칭버그·ee16ae6 라인DXF첨부·0798a37 품목검색/마감섹션) — c396923(5건)은 Area6(00:20)가 이미 코드품질 렌즈로 전수 재검증 완료, 나머지 11커밋은 신선 churn.
> - **entity_id 격리 제거 2건(ca38708·379a7b7) 바인드 정합 검증**: `printEvents.ts`(list/stats×4/unmatched)·`dashboard.ts`/`equipmentQueue.ts`/`facility.ts`(×2)/`rip.ts`(×2) 총 10개 쿼리에서 `entityFilter`/`ef.clause`/`ef.params` 제거 지점을 각각 대조 — 플레이스홀더(`?`) 개수와 `.bind()` 인자 개수가 전부 일치(예: `facility.ts:layout-data`는 `cardEf`만 남기고 `equipEf` 제거 후 바인드 배열도 동일 축소). 커밋 메시지가 "장비/출력이벤트=전 법인 공유 인프라, 쓰기 경로는 격리 유지"로 설계 근거를 명시 + 실제로 write 핸들러(`POST/PATCH /equipment`, 카드 발급 등)는 diff에 미포함 — 의도된 설계 변경, entity_id INSERT 누락류 버그 아님.
> - **`ee16ae6`(라인 DXF 첨부) INSERT 컬럼셋 대조**: `orders/create.ts`(신규)·`orders/update.ts`(신규만 삽입, dup-check 후) 양쪽 `INSERT INTO order_ai_files (..., entity_id)` 8컬럼/8바인드 일치, entity_id는 `billingEntityId`/`existingOrder.entity_id ?? getEntityId(c)||1`로 정상 공급. update.ts의 `for (putParentItems)` 루프 안 `await ... .first()`+`.run()`은 order.items 길이로 bounded(#458 FP배제 "per-entity 품목 IN"과 동일 계열, LIMIT-less 데이터스케일 아님) — N+1 보고 대상 아님.
> - **신규 `budgetAlert.ts`/`cron.ts POST /budget-check` 검토**: `agentKeyMiddleware` 게이트 확인(기존 cron 라우트와 동일 패턴), settings 조회 SQL 파라미터화·Cloudflare 미설정 시 그 축만 스킵 + "설정했는데 조회실패"는 별도 알림(감시가 조용히 꺼지는 것 방지) — 설계 결함 없음. `checkBudgets` 호출처 1곳(cron.ts)뿐이나 서비스 함수 성격상 정상(dead code 아님).
> - **migrations 0530/0531 재검토**: 둘 다 멱등 가드(`WHERE` 조건에 "이미 목표값" 배제 포함)·롤백 SQL·근거 스크립트(`derive-item-prices.cjs`) 명시, CHECK/NOT NULL 위반 없음(단순 UPDATE/INSERT). 마이그 번호 중복 재확인 — 기존 5쌍(0327·0412·0416·0420·0453) net-new 0.
> - **standing scan 재실행**: ① `npm run audit:entity` — 검사 131파일·entity테이블 SELECT 61·**누락 0**. ② `grep -rnE "IN \(\$\{" src/routes` (#458 미청크 동적 IN절) — **0건**(기존 발견 전부 청크 픽스 유지). ③ "헬퍼-루프" N+1 하위클래스(#478, `for...of` 바디에 `await <추출헬퍼>` + LIMIT없는 데이터스케일 집합) grep — **0건**.
> - **open 4건 재확인(open≠unfixed)**: #606(`grep -rln entity-attribution-audit src/scripts src/pages`=0)·#608(`verify.yml` 여전히 `pull_request` 트리거뿐)·#609(`toBase`/`formatStock` 호출처 0, 이번 churn이 재고 write-path 3곳을 안 건드려 무관)·#612(`ai_analysis_id`/`dxf_analysis_id` IDOR — 오늘 `ee16ae6`가 `dxf_analysis_id` 저장 로직을 추가했으나 소유권 검증 로직 자체는 무변경이라 #612 상태 그대로) 전부 코드 직접 재확인, 캐시 유지.
> - **backlog↔GitHub 절대값 재동기화**: `list_issues(OPEN,auto-improve)` open **4**(#606·#608·#609·#612, 변동없음) · `search_issues(reason:completed)` **531**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 직전 사이클과 무변동 근거 충분).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클 신규 오탐/탐지 클래스 없음. entity_id 격리 제거 2건은 기존 FP클래스("문서화된 cross-entity 기능")의 변형(공유 인프라 성격)이라 신규 규칙 불요, 자동 바인드 개수 대조 레시피는 기존 #607류 점검과 동일해 재사용.
> - 신규 이슈 0건(churn 12건 전부 clean — 병렬 세션들이 이미 자체 gate 통과 후 착륙), 자동수정 0건, done-sync: new 4(변동없음)·done 531(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-11T09:19):**
> - **방법**: `git fetch origin main`(HEAD `16296f1`, origin과 완전 일치, 워킹트리 clean). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area6 앵커(`5d76d65`) 이후 `git diff --stat -- src/routes migrations src/scripts index.tsx src/layout` = **0줄**(신규 5커밋은 전부 docs/status board 정리, 코드 변경 없음) — 이번 사이클은 정적 코드 리뷰 대상 자체가 없음.
> - **배포 CI**: `deploy.yml` 최근 10런(08-10 09:54~23:57) **전부 success**, 최신런(`16296f1`, 23:59:00 완료)의 "Smoke test (production)" 단계도 success — GET 프로브 102개 기준 prod 정상(단, #430 codify대로 write-path는 이 프로브로 확인 불가, 별도 회귀 없음 전제).
> - **backup.yml**: 최근 30런 중 08-06 1건만 failure, 08-07~08-10 4런 연속 success — 08-10 Area6가 검증한 #605 픽스(`timeout-minutes 10→25`+3회 재시도)가 실제로 재발을 막고 있음을 CI 실측으로 재확인.
> - **verify.yml**: `total_count: 0`(생성 이래 0회 실행) — #608이 이미 보고한 사실과 일치, net-new 아님. `e2e.yml`은 `disabled_manually` 상태(기존 정책, 회귀 아님).
> - **egress 제약(재확인)**: 이 세션은 `webapp-9i0.pages.dev`(prod host)가 프록시 allowlist 밖(`curl` 403 "Host not in allowlist")이고 `CLOUDFLARE_API_TOKEN` 미설정이라 `wrangler d1 execute --remote`도 불가 — LogWatcher heartbeat·CAPS sync 신선도를 이 세션에서 직접 조회 불가. 대안으로 CI(자체 네트워크 보유)의 deploy.yml 성공 이력을 prod 헬스 대리 지표로 사용.
> - **open 4건 재확인(open≠unfixed)**: `search_issues(is:open,label:auto-improve)` = #606·#608·#609·#612, backlog 캐시와 완전 일치(드리프트 없음).
> - **backlog↔GitHub 절대값 재동기화**: open **4**(변동없음) · `reason:completed` **531**(변동없음) · rejected **6**(변동없음).
> - 신규 이슈 0건(코드 churn 없음 + prod CI 전부 green), 자동수정 0건, done-sync: 변동 없음. 다음 순번 **Area 2**.
>
> **Area 6 자기 진화 (2026-08-11T00:20):**

> **Area 6 자기 진화 (2026-08-11T00:20):**
> - **방법**: `git fetch origin main`(HEAD `5d76d65`, 워킹트리 clean, detached) — 컨테이너 git 이력이 이번엔 재구성 없이 직전 Area5 앵커(`1793f6a`)와 조상관계 유지(`git log 1793f6a..HEAD` 정상 6커밋). `npm ci`(0→81), `npx tsc --noEmit` clean, `doc-diet-audit.cjs` OK. 직전 Area5(21:15) 이후 코드 churn = `c396923`(주문서 편집 라운드트립 손실 클래스 + 이슈배치 #601/602/603/605/607) 1건 — 나머지 3커밋(`f2740dd` 재무진단 스크립트·`3b84c13` 문서다이어트·`5d76d65` 세션핸드오프)은 docs/scripts뿐이거나 read-only 진단도구.
> - **closed≠fixed 재검증 — `c396923`이 주장한 5건 전부 코드 대조**: ① **#601**(반품 라인 FK 500) — `orders/update.ts`에 `return_items` 백업→검증(제거 대상 라인에 미해소 반품 있으면 400)→라인 재작성→`item_id+sort_order` 매칭 재삽입 신설 확인, 이슈가 제시한 옵션(a) 그대로 구현 + INSERT 포지셔널 바인드 8=8 일치. ② **#602**(issue-status silent catch) — `issueStatus.js` catch 블록에 에러 배지(`textContent='!'`+`?`)와 안내문 렌더 추가 확인. ③ **#603**(needs_reissue 큐 영구잔류) — `cards/queries.ts` 두 큐(개정필요·진행중) 모두 `AND o.status NOT IN ('SHIPPED','COMPLETED','CANCELLED','DELETED')` 추가 확인. ④ **#605**(백업 워크플로우 재시도 부재) — `backup.yml` `timeout-minutes: 10→25` + 3회 재시도 루프 확인. ⑤ **#607**(PR CSV export SSOT 미채택) — `purchaseRequests.ts` export/csv가 자체 `whereClauses` 사본을 버리고 `buildPrFilter(c)` 호출로 교체 확인. **5건 전부 실재 확인, 형제-완전성 갭 없음**(각 핸들러의 유일 인스턴스만 문제였고 나머지 형제 경로는 이미 정상이었던 케이스들).
> - **fresh churn 보안/XSS 재검증(`c396923`)**: `scripts/orderForm/{calc,finishing,parent}.js` diff에 신규 `innerHTML`/`insertAdjacentHTML` 0건(전부 `textContent`/`createElement`, `(이전값)` 동적 옵션 주입도 `textContent`) — XSS net-new 0. `return_items` 재삽입은 원본 행의 `entity_id`를 그대로 보존(세션 재파생 아님, 반품 이력은 원 소속 유지가 정합) — entity 격리 회귀 없음.
> - **`f2740dd`(재무진단 스크립트) 검토 — 신규 이슈 불필요**: `docs/analysis/FINANCE_DIAGNOSIS.md`가 `financialReports.ts`(존재하지 않는 `order_costs`/`payroll_slips` 테이블 참조를 `.catch`로 조용히 0 처리해 매출총이익률 100%·인건비 0으로 영업이익 구조적 과대, 매입 집계가 이관 `created_at` 기준이라 8월 6.58억 vs 실제 `order_date` 기준 276만, **매입·고정비 entity_id 필터 부재로 3법인 합산**)·`cashSchedule.ts`(지급예정일이 전부 NULL인 `delivery_date`/`created_at` 폴백)의 구체적 결함을 실측·문서화했으나, **문서 자체에 "용준님 결정 2026-08-10 — 페이지를 고치지 않고 온디맨드 진단 스크립트로 우회"가 명시**돼 있고 고칠 경우의 P1 수정순서까지 이미 적어둠 — owner가 이미 검토·방향을 정한 사안이라 중복 이슈화하지 않음(재무 entity_id 누락은 성격상 Area4/5 후속 사이클이 "이미 문서화·owner 결정됨"으로 인지하고 재보고하지 않도록 이 로그에 근거 남김).
> - **open 4건 재확인(open≠unfixed)**: #606(`entity-attribution-audit` 프론트 소비처 `grep -rln entity-attribution-audit src/scripts src/pages`=0, 여전히 미픽스) · #608(`verify.yml` 트리거 여전히 `pull_request`뿐, PR 미사용 프로젝트라 0회 실행 구조 불변) · #609(`toBase`/`formatStock` 호출처 0, `scan.ts`/`inventory.ts`/`po-receive.ts` 3곳 여전히 pack_size 환산 각자 인라인) 전부 코드 grep 직접 재확인. #612(`ai_analysis_id`/`dxf_analysis_id` cross-entity IDOR)는 Area5가 방금 발견한 신규건이라 재확인 대상에서 제외(당연 미픽스).
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-absorbed 1건, REVIEW 0건 — 삭제대상 1건(임계 30 미달), 등록 불요.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **4**(#606·#608·#609·#612) · `reason:completed` **531**(+5) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클은 신규 오탐/탐지 클래스 발견 없음. `c396923`의 반품 재연결(옵션 a)은 기존 codify된 "#597 item_id+sort_order 매칭" 패턴의 실전 재확인일 뿐. 재무진단 스크립트는 "owner가 이미 검토·방향 결정한 사안은 중복 이슈화 금지"라는 기존 원칙의 신규 인스턴스라 별도 규칙 불요.
> - 신규 이슈 0건, 자동수정 0건(코드 렌즈 재검토 결과 net-new 0 — 병렬 세션이 5건을 스스로 발견·수정·close까지 완결), done-sync: new 4(-5, 순감소 — #601·#602·#603·#605·#607 close 반영, 신규 없음)·done 531(+5)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-08-10T21:15):**
> - **방법**: `git fetch origin main`(HEAD `1793f6a`) — 컨테이너 git 이력이 이번 사이클도 재구성됨(Area4가 15:34에 이미 기록한 것과 같은 계열이나 root가 다시 바뀜: 이번 root=`36feabc` 08-10T14:08, 전체 50커밋 모두 오늘). `npm ci`(0→81), `npx tsc --noEmit` clean. Area4가 채택한 대응(재구성 히스토리에서 `src/routes`/`migrations`/`src/scripts`/`index.tsx`/`src/layout` 변경 커밋 전수를 churn으로 간주)을 그대로 적용 — root 이후 11커밋(카드등록 체인 5·print-events LIKE→substr 체인 2·주문서 폼 4) 전부 보안 렌즈(entity 격리·SQL 파라미터화·XSS·auth 게이트)로 diff Read(Area4는 데이터정합 렌즈로 이미 봤으나 보안 렌즈는 미실시).
> - **카드등록 체인(062714d→65e52e5)**: `entityFilter`/`getEntityId(c)` 일관 적용 확인 — 재활성(UPDATE) 경로도 dup-check SELECT가 이미 entity_id로 스코프된 뒤의 id만 재사용해 IDOR 없음. 바로빌 통신에러 노출(`e93fa62`)은 `barobillCall`의 에러 텍스트가 바로빌 응답(요청 에코 아님)이라 CERTKEY/WebPwd 등 비밀 유출 없음 — 요청자 본인이 이미 아는 카드정보뿐.
> - **print-events LIKE→substr 체인(d0ab0fc/9e44f4f)**: 전부 `?` 파라미터 바인드, SQL 인젝션 없음. `POST /link`가 `#600`(이전 사이클 발견)에서 지적된 `cardEntityFilter` 누락을 이미 자체 수정 완료(`efCard = cardEntityFilter(c,'c')` 주석에 "#600" 명시) — 재확인만, net-new 아님.
> - **🟡 net-new #612(M, bug) — `ai_analysis_id`/`dxf_analysis_id` 크로스 법인 IDOR**: `orders/create.ts`·`orders/update.ts`가 라인의 `ai_analysis_id`(기존)·`dxf_analysis_id`(오늘 `ee16ae6` 신설)를 entity 소유권 검증 없이 `order_ai_files.analysis_id`에 그대로 저장. 이 ID는 `GET /api/ai-analysis/:id/download`(`entityFilter(c)`, entityId=0=전체 계정이면 빈 절 — `aiAnalysis.ts:162` 주석에 명시)로 실파일을 내려받는 데 쓰이는데, IllustratorAutomat 에이전트가 여러 법인 주문을 단일 계정으로 순회 처리(`GET /api/orders?status=CONFIRMED` — entity 파라미터 없음)해 그 계정이 entityId=0일 가능성이 높음. 신규 DXF 경로는 사람 확인 없이 에이전트가 자동으로 그 파일을 다운로드해 주문 폴더에 복사(`Program.cs:3028`). 법인 A의 ADMIN/MANAGER가 순차 ID를 추측해 법인 B의 디자인 파일을 자기 주문에 끼워 넣으면 크로스 법인 IP 유출 가능. IDOR + egress로 에이전트 계정 entity_id 실측 불가 → issue-only.
> - **나머지 4커밋(0798a37 품목검색 제외·1bfaf7f PDF/JPG/PNG 첨부·7f40097 nav-badges·bank.js 잔액표시)**: 7f40097은 전부 `?` 파라미터화 + entity 필터 보존(CTE 재작성이 alias 순서까지 정합), 신규 in-memory TTL 캐시(`navBadgeCache`)는 키가 `entityId:userId` 조합이라 크로스테넌트 누출 없음(기존 rate-limiter Map과 동급 아키텍처, FP). 1bfaf7f는 서버측 업로드가 애초 확장자 화이트리스트를 강제한 적이 없어(파일명만 sanitize) 클라 accept 목록 확대가 공격면을 넓히지 않음(기존 갭 그대로, net-new 아님). bank.js 잔액 기준일은 시스템 타임스탬프(`updated_at`)라 XSS sink 아님.
> - **필수 grep**: 시크릿 폴백 1건(`fax.ts:43` `c.env.BAROBILL_FTP_PASSWORD || ''`)는 빈 문자열 폴백이라 하드코딩 시크릿 아님(FP). `body.password||'literal'` 0건.
> - **open≠unfixed 재확인**: #601(`return_items` grep 0, 여전히 미픽스) — 이번 churn과 무관, 캐시 유지.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **9**(#601~#603+#605~#609 + 신규#612, #604·#611은 owner가 오늘 completed로 close) · `reason:completed` **526**(+2: #604·#611) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — #612는 기존 codify된 "#365 범용 서빙 프록시 예외"(클라 제공 키로 raw 리소스 서빙 = 도달성 무관 공격표면) 클래스의 신규 인스턴스라 규칙 자체는 이미 있음, 재발 관찰로 흡수 가능.
> - 신규 이슈 1건(#612, issue-only), 자동수정 0건, done-sync: new 9(-1, 순증가 아님 — #604·#611 close 2건 반영 후 신규 1건 추가)·done 526(+2)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-10T15:34):**
> - **⚠️ 컨테이너 git 이력 재구성 아티팩트 — 이번엔 종전보다 심함(단순 ancestor 불일치가 아니라 전체 히스토리 대체)**: `git fetch origin main`은 정상(origin/main=HEAD `9e44f4f`, 워킹트리 clean) 이나, 백로그가 참조하는 직전 Area4 HEAD(`c4320c5`)를 포함해 **모든 과거 커밋 SHA가 `Not a valid object`** — `git log`는 총 **50커밋**뿐이고 전부 오늘(08-10 11:23~15:26) 안에 있으며, 그마저 root 커밋(`7546426`, 부모 없음, 전체 트리 스쿼시)이 08-10 11:23 스냅샷. 기존 codify된 "부모 없는 root 스쿼시"(Area3/5 52회차)와 같은 계열이나, 이번엔 **스쿼시 이후 이어진 실제 작업 내용(카드 바로빌 등록/매입 정산/은행 대출)이 백로그가 서술한 직전 사이클들의 작업 내용(주문목록 SSOT·담당자 필드 등)과 전혀 안 겹침** — 파일트리엔 그 SSOT 산출물(`listFilter.ts`·`userPrefs.ts`·`reports.ts`)이 실재해(`ls` 확인) 작업 자체는 유실이 아니지만, **커밋 그래프로 "직전 Area 사이클 이후 churn"을 계산하는 모든 표준 레시피가 이번 사이클엔 무효**. 대응: root 커밋 이후 전 커밋(49개)에서 `src/routes`/`migrations`/`src/scripts` 변경분(**11커밋**)을 churn 전수로 간주해 전부 diff Read.
> - **card 등록 UNIQUE 위반 체인(062714d→138859a→8372be3→e93fa62→65e52e5, 30분내 5커밋) 최종상태 검증**: `POST /api/cards`가 비활성(소프트삭제) 카드 재등록 시 `UNIQUE(card_number_last4,entity_id)`(0249) 위반으로 500 나던 실プロд 버그(전북카드 재등록 실사례)를 세션이 스스로 발견·반복수정 끝에 해결 — 최종본(`65e52e5`)은 기존 행을 `UPDATE ... SET is_active=1`로 재활성(INSERT 아님)해 UNIQUE 충돌 자체를 회피하고 기존 `card_transactions` 이력도 보존. INSERT/UPDATE 포지셔널 바인드 개수 직접 대조(플레이스홀더=바인드 인자 수 일치, #607류 컬럼-바인드 불일치 클래스 재확인) — 정합. 바로빌 -50118(이미등록) 흡수 로직도 `getCardList` 사전조회 → 실패 시 `registCard` → 그래도 -50118이면 흡수, 세 경로 전부 `barobillRegistered=1`로 수렴 확인 — **net-new 버그 없음(이미 세션 내에서 자가 발견·자가 수정 완료)**.
> - **print-events LIKE→substr 체인(d0ab0fc→9e44f4f) 최종상태 검증**: D1이 LIKE 패턴을 50바이트로 제한한다는 사실을 이 세션이 처음 실측(51바이트부터 "pattern too complex" → 단건 POST 500 → LogWatcher 무한재시도로 초당 수십 건 홍수, prod 실사례)해 `substr(file_name,1,N)=nameNoExt AND substr(file_name,N+1,1)='.'` 방식으로 치환 — JS `[...str].length`와 SQLite `substr`가 둘 다 유니코드 문자 단위로 카운트해 정합(바이트 아님), 기존 LIKE의 `%`/`_` 이스케이프 필요성도 함께 제거돼 오히려 더 견고해짐. **부작용 1건(경미)**: `idx_file_map_filename` 인덱스(0079)가 `substr()` 래핑으로 이 3번째 OR 분기에서 사용 불가해져(함수 결과는 인덱싱 불가) 이전 `LIKE 'prefix%'`(SQLite가 종종 인덱스 seek로 최적화 가능한 형태) 대비 풀스캔로 후퇴 — 정확성엔 영향 없고 `print_file_map`이 초당 수십 건 유입 시나리오까지 봤던 테이블이라 스케일에 따라 지연 요인이 될 수 있음. 코드 검색 결과 **파일명-LIKE 매칭 패턴이 코드베이스에서 이 한 곳뿐**이라(다른 60개 `LIKE ?` 사용처는 전부 사람이 타이핑하는 짧은 검색어 바인드) 당장 확산 위험은 없음 — Area6가 "D1 LIKE 50바이트 캡"을 신규 발견 제약으로 codify할지 판단하도록 남겨둠(이슈화는 보류: 성능뿐이고 현재 유일 인스턴스는 이미 정확성 우선으로 고쳐짐).
> - **나머지 8커밋(0528 마이너스통장 분리·전북카드사 옵션·작업지시서 라인 섹션·주문 기간필터 SSOT) 개별 diff Read**: `0528_bank_account_overdraft.sql`(단순 `ADD COLUMN is_overdraft INTEGER NOT NULL DEFAULT 0`) — CHECK/NOT NULL 위반 없음, `bank.ts` INSERT/UPDATE 포지셔널 바인드 재계산 일치. 나머지는 CHECK 제약 없는 enum 추가(카드사 전북) 또는 순수 프론트(작업지시서 라벨·기간필터 localStorage SSOT)라 데이터정합 영향 0.
> - **마이그 번호 중복 재확인**: 기존 5쌍(0327·0412·0416·0420·0453) net-new 0, 신규 0528 유일.
> - **`npm run audit:entity`**: 검사 131파일·entity테이블 SELECT 61·누락 0.
> - **open≠unfixed 재확인**: #601(`orders/update.ts` `return_items` grep 0)·#603(`cards/lifecycle.ts:1075`는 수동 `PATCH .../reissue-ack` 클리어만 있고 출고완료 자동클리어 없음)·#607(`purchaseRequests.ts:228` CSV export 여전히 자체 `whereClauses`, `buildPrFilter` 미사용) 전부 이번 churn(bank/card/orders 프론트)과 무관한 파일이라 코드 직접 grep 재확인만으로 캐시 유지 — 여전히 미픽스.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **10**(변동없음, #601~#609+#611) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 직접 등재는 보류 — "D1 LIKE 패턴 50바이트 캡"은 이번 사이클 실증된 신규 제약이라 향후 Area2/4/6 standing scan 후보(LIKE 바인드값이 사람 타이핑이 아니라 시스템 조합 문자열인 경우 위험)로 가치 있으나, 현재 코드베이스에 이 패턴의 인스턴스가 하나뿐(이미 수정됨)이라 codify는 재발 시로 유보하고 이번 로그에 근거만 남김.
> - 신규 이슈 0건(세션이 자체 발견·자체 수정까지 마친 버그 2건 확인 — 추가 조치 불요), 자동수정 0건, done-sync: new 10(변동없음)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 4건** — Area 6, 2026-08-11.)

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
