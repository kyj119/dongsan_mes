# Improvement Backlog
<!-- last_run_area: 2 -->
<!-- last_run_at: 2026-09-25T21:45:16+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **11** (변동없음) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **572** (변동없음) |
| ❌ rejected | **6** (변동없음) |

> **Area 2 코드 품질 심층 분석 (2026-09-25T21:45):**
> - **방법**: 세션 시작 시 로컬 `main`이 origin보다 15커밋 stale(`0425936`) → `git fetch origin main` + `git checkout -B main origin/main`(`b8ad910`)으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 사이클 세션시작 HEAD `1f42a40`)**: `git diff --stat 1f42a40..HEAD -- src/routes src/types src/utils migrations index.tsx` **4파일**(`kakao.ts`·`orders/queries.ts`·`shipments.ts`·`shipmentNotice.ts`), 2커밋(`2cc2d56` 한진 알림톡 자동전환·`8506b3b` 재단 패널 번호 확대). 둘 다 이번 순환 Area1·Area5·Area6가 이미 자기 렌즈로 정독(로그 상단 확인) — Area2 고유 렌즈(entity_id·authMiddleware·N+1·SELECT *·dead code)로 직접 재확인.
> - **`2cc2d56`(한진 알림톡 승인 자동전환) 재검증**: `kakao.ts`·`shipments.ts`·`shipmentNotice.ts` 순수 정책 분기 추가(`isApprovedTemplateState`·`applyTemplateApproval`) — 새 DB write 없음, entity_id 관련 컬럼 미참조(바로빌 외부 API 응답 필터링뿐), N+1 없음(루프 내 DB 쿼리 신설 없음), 함수 시그니처 타입 정합. 결함 0건.
> - **`8506b3b`(재단 패널 번호 확대) 재검증**: `orders/queries.ts:618` 신설 `cutPanelAnalysis` IN절 조회가 `analysisIds.slice(i, i+80)` **80-청크 루프로 정확히 구현**(§D1 바인드한도 컨벤션 100% 준수, chunk80 미사용이지만 동일 폭) — 이번 사이클 D1 바인드한도 standing scan(레시피: 동적 `IN (${ph})` grep)에서 자동 clean 판정. R2 GET은 기존 `Promise.all` 병렬 루프 내부에서 `largeByLine.add()`만 추가(순수 메모리 연산, 추가 왕복 없음) — N+1 아님.
> - **standing scan 1: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 75건·누락 **0건**(변동없음).
> - **standing scan 2: authMiddleware recursive 스캔**(`find src/routes -name '*.ts'` 전수, top-level+subdir) — 무-auth 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`, 변동없음) 전부 기존 정당 클래스(barrel/helpers Map.get FP·hrSelf scoped-token·public webhook류).
> - **standing scan 3: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 4: `npm audit --omit=dev`** — 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 8런 전부 `conclusion:success`(최종 HEAD `b8ad910`, run #2073).
> - **open 이슈 재확인**: `list_issues(state:OPEN,label:auto-improve)` **11**건(#662·#661·#660·#659·#658·#656·#654·#650·#626·#617·#616, 변동없음) — Area2 라벨 신규 0건, churn 범위(4파일)와 겹치는 건 없음.
> - **backlog↔GitHub 절대값 재동기화**: open **11**(변동없음) · done **572**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, grep 매치 없음, 이미 전량 서술식). 이번 사이클은 D1 바인드한도 standing scan 레시피(#458 codify)가 신규 커밋(8506b3b)의 새 IN절을 **처음부터 정확히(80청크) 구현한 사례**를 정확히 통과시켰다는 것을 확인 — 탐지 레시피가 "위반을 잡는 것"뿐 아니라 "준수를 clean으로 정확히 판정하는 것"도 검증된 회차. 새 클래스 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 9건 → 이번 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(churn 2커밋 전부 clean), 자동수정 0건(고칠 결함 없음), done-sync: open 11(변동없음)·done 572(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-25T15:45):**
> - **방법**: 세션 시작 시 로컬 `main`이 origin보다 1커밋 stale(`0425936`) → `git fetch origin main` + `git checkout -B main origin/main`(`485f00a`)으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 10런 전부 `conclusion:success`(최종 HEAD `485f00a`, run #2072 — 직전 Area6 사이클 자신의 커밋). Job 스텝 17개 전부 success(typecheck·check:fn·audit:jwt-decode·audit:bind-limit·build·test:calc·entity-audit·migration-number·canary·deploy·smoke 순).
> - **smoke 재검증(run #2072 job 로그 직접 파싱, #636 대리지표 레시피)**: **PASS 134/134**. 500ms 초과 3건 — 전부 기존 추적 항목, 신규 없음. ① `cashSchedule.overview` **5422ms**(#636 기결정 — owner 국내 직접측정 421~424ms 대비 배수 **≈12.9배**, 기존 관측 배수대(9~14배) 안쪽 → 재이슈 조건인 "배수 이탈" 미충족, 비보고 유지). ② `orders.detail` **2774ms**(`/api/orders/12740`) — 직전 Area1 사이클(830060b, R2 hydrate 병렬화, 13394ms→3088ms)의 **효과가 이번 배포에도 유지**됨을 확인(3088ms→**2774ms**, 추가 악화 없음). 코드 재확인 결과 `orders/core.ts:475` order_items 루프·`thumbnailStore.ts:164` groups 루프 **양쪽 다 이미 `Promise.all` 병렬화 완료**(2단계 전부) — 남은 지연은 이 주문(smoke 고정 프로브, AI-분석 그룹 다수 추정)의 R2 get **동시 호출 개수 자체**로, 추가 안전 자동수정 여지 없음(캐싱/lazy-load는 API 응답 패턴 변경=기능 추가에 해당해 자동수정 정책 밖). **다음 사이클 재확인 대상에서 제외**(자릿수 개선 확정·재발 없음 — "완료로 닫지 않고 모니터링" 루프를 이걸로 종료). ③ `hr.stats` **1706ms** — 기존 관측 범위(1237~1690ms)와 동급, 자릿수 이상 악화 아님 → 조치 대상 아님(변동없음).
> - **churn 확인(앵커 = 직전 Area1 사이클 결과 커밋 `830060b`)**: `git log 830060b..HEAD --oneline -- src/routes src/scripts src/pages src/layout src/utils migrations index.tsx` **3커밋**(`2cc2d56` 한진 알림톡 자동전환·`2437b47` merge·`8506b3b` 재단 패널 번호 확대). 둘 다 이번 순환 Area5가 이미 보안 렌즈로 정독(로그 상단 확인) — Area5 파일목록(`kakao.ts`·`orders/core.ts`·`orders/queries.ts`·`shipments.ts`·`shipmentNotice.ts`·`thumbnailStore.ts`)에 **`workOrderPrint.js`(8506b3b 프론트 렌더 변경)가 빠져 있어** Area1이 직접 `git show 8506b3b -- src/scripts/shared/workOrderPrint.js` 확인 — `.thumb-large` CSS 추가 + `ln.thumbnail`을 `<img src>`에 꽂는 신설 분기는 **기존 `else` 분기가 이미 쓰던 것과 동일한 무이스케이프 삽입 패턴**(신규 XSS 표면 아님), DB/API 접근 없는 순수 프론트 레이아웃 변경 — 결함 없음.
> - **마이그레이션 churn**: `git log 830060b..HEAD -- migrations` 0건(DROP TABLE/COLUMN 해당 없음 — #430 write-path 맹점 트리거 미해당).
> - **open 이슈 재확인**: `list_issues(state:OPEN,label:auto-improve)` **11**건(#662·#661·#660·#659·#658·#656·#654·#650·#626·#617·#616, 변동없음) — Area1 라벨 신규 0건, 전건 타 Area 관할.
> - **LogWatcher 하트비트·CAPS 동기화**: egress 차단 재확인(`curl webapp-9i0.pages.dev` → connect fail, exit 56) — 기존 제약과 동일, 신규 아님.
> - **backlog↔GitHub 절대값 재동기화**: open **11**(변동없음) · done **572**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md 잔여참조 재확인(이미 서술식). 이번 사이클은 기존 두 레시피의 정확한 재적용 — ① #636 대리지표(job 로그 ms 직접 대조)로 orders.detail 자동수정 효과의 **배포 간 지속성**을 실측 확인(1회성 개선이 아니라 다음 배포에도 유지됨을 증명한 최초 사례 — "자동수정했다"와 "고쳐졌다"가 다른 질문이라는 원칙의 긍정 사례), ② churn-bridge 원칙(다른 Area 파일목록에 없는 파일은 직접 확인)을 이번엔 실제 결함 없이 clean 확인으로 종료 — 새 클래스 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 8건 → 이번 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(churn 2건 전부 clean, workOrderPrint.js 갭도 직접확인 결과 무해), 자동수정 0건(고칠 결함 없음 — 이번 회차 성과는 직전 자동수정의 효과 지속성 검증), done-sync: open 11(변동없음)·done 572(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-25T04:10):**
> - **방법**: `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 사이클 결과 커밋 `774101f`)**: `git log 774101f..HEAD` 31커밋. **웹앱 스코프**(`git diff --stat 774101f..HEAD -- src/routes src/scripts src/pages src/layout src/utils migrations index.tsx`) **12파일**(`shipments.ts`(pages+routes)·`shipmentsDashboard.ts`·`kakao.ts`·`orders/core.ts`·`orders/queries.ts`·`orders.js`·`shared/workOrderPrint.js`·`shipments.js`·`shipmentsDashboard.js`·`shipmentNotice.ts`·`thumbnailStore.ts`) + **비-웹앱 IA 축 7커밋**(재단 패널 조각번호 Phase 1: `d2163a9`·`0c642d0`·`1ad7b5a`·`970932c`·`c993462`·`6f0bb8b`·`8e59f3f`).
> - **웹앱 12파일 #600 브리지 대조(나열됨 vs Read됨)**: 이번 순환(Area6→1→2→3→4→5) 로그 전체를 대조한 결과 **12파일 전부 적어도 하나의 Area 로그에서 자기 문단(구체 로직·라인 인용)으로 다뤄짐** — `kakao.ts`·`orders/queries.ts`=Area5 직접검증, `orders/core.ts`·`thumbnailStore.ts`=Area1(자기 자동수정 830060b)+Area4(집계정합성 재검증)+Area5(재확인), `shipments.ts`(routes)=Area2(entity/N+1)+Area3(UX 8항목)+Area4(정합성)+Area5(IDOR/write-redirect), `shipments.ts`(pages)·`shipmentsDashboard.ts`(pages)·`orders.js`·`workOrderPrint.js`·`shipments.js`·`shipmentsDashboard.js`=Area3(8항목 체크리스트로 6파일 전수 diff+Read, #661 발견)+Area5(check-xss 델타 재확인), `shipmentNotice.ts`=Area2+Area4+Area5. **브리지 갭 0건** — 이번 회차는 드물게 "나열만 되고 안 읽힌 커밋"이 없었다.
> - **비-웹앱 IA 축 7커밋(조각번호 Phase 1) 직접 검증**: 어느 Area 로그에도 해시 언급 0회(전수 grep 확인) → Area6 우선 정독 대상. `npm run audit:jsx-ternary`(15개 .jsx, 괄호없는 중첩삼항 0)·`audit:jsx-syntax`(33개 전부 파싱)·`audit:empty-catch`(31파일·409곳 전부 사유 있음)·`audit:ia-jsx`(드리프트 없음 — 단 이 세션은 Z: 미연결이라 축1~5 전부 "확인불가"로 판정제외, repo 자체 게이트만 유효) 4종 전부 clean. `.claude/PROJECT_STATUS.md` 배포 배너가 이 클러스터를 이미 실기 검증(Z:=main·5축 드리프트 0·journey 40/40·smoke:prod 134/134·8506b3b 작업지시서 prod 마커) — 「비-웹앱 런타임 축」(62회차)·「SELECT-detail 확장」(33회차) 레시피가 기대하는 "배포 세션 자신이 드리프트까지 확인하면 Area6 재검증 비용 절감" 사례. `scripts/ia-deploy.cjs`(8e59f3f, 되돌림 배포 차단) 자체 로직도 직접 Read — 런타임 셸버전 문자열을 파싱해 이 폴더 버전보다 높으면 배포를 막는 순수 비교 가드, 부작용 없음.
> - **standing scan 1: `npm run audit:migration-number`** — 같은 테이블 DDL 충돌 **0건**(변동없음, 중복번호 쌍 목록 동일).
> - **standing scan 2: `npm run branch:clean`** — 삭제대상 1건(SAFE-absorbed, main 병합으로 고유커밋 0)·SKIP 1(main). 30건 임계 미달, 백로그 등록 불요.
> - **standing scan 3: `npm audit --omit=dev`** — 0건. **standing scan 4: `npm run audit:skills`** — OK, 스킬 19개 상주비용 ~2,662자.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 8런 전부 `conclusion:success`(최종 HEAD `f19075a`, run #2071).
> - **🧮 done-sync 절대값 재동기화 — 규칙 자체의 결함 발견**: `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` 절대값 **571**·`reason:"not planned"` **4**+`reason:duplicate` **2**=rejected **6**(변동없음)·`list_issues(state:OPEN,label:auto-improve)` **11**(변동없음, #662·#661·#660·#659·#658·#656·#654·#650·#626·#617·#616). **여기서 done 절대값(571)을 그대로 대입하면 이번 순환 Area1의 이슈생략 자동수정(`830060b`, "issue 생략, 즉시 커밋" 명시)이 쌓아온 done=**572**가 사라진다** — 37회차 규칙("매번 절대값으로 덮어쓸 것")이 "모든 done 건에 GitHub 이슈가 있다"는 전제 위에 있었는데 이슈 없는 직접커밋 자동수정 경로가 실제로 존재해 그 전제가 깨짐. **정정 규칙을 codify**(area-6-self-evolution.md, 상세 아래) — done = GitHub 절대값(571) + 이번 사이클 이슈생략 자동수정 건수(1) = **572 유지**(571로 되돌리지 않음).
> - **open≠unfixed**: #662·#661은 이번 순환 신규(Area4·Area3), 아직 owner 리뷰 대기 — 재확인 불요. #660·#650(fixed-in-tree, close-pending)은 각 1~3사이클째로 32회차 적체 임계(2사이클+) 근처지만 owner가 코멘트로 보류 이유를 명시하지 않았고 최근 배포 배너에 후속 검증 흔적 없음 — 다음 사이클도 close-pending 유지되면 batch-close 안내 대상으로 격상 검토. #656·#654·#626·#617·#616은 각 담당 Area가 이번 순환 중 재확인 완료, 변동 없음.
> - **🧬 SKILL 강화**: area-6-self-evolution.md에 「done-sync 절대값 규칙이 놓친 경우 — 이슈생략 자동수정」 codify(위 done-sync 항목 상세, 신규 규칙 클래스). `line N` 잔여참조 재확인(0건, 이미 서술식).
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 12건 → 이번 추가 후 13건, **임계(13건) 도달 → 트림 실행**.
> - 신규 이슈 0건(웹앱 12파일 전부 브리지 확인상 기정독 clean, IA 7커밋 직접검증 게이트 4종+배포배너 clean), 자동수정 0건(코드 결함 없음 — 이번 회차 성과는 done-sync 규칙 자체의 결함 발견·수정), done-sync: open 11(변동없음)·done 571→**572**(GitHub 571+이슈생략 자동수정 1, 규칙 정정으로 유지)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-24T22:50):**
> - **방법**: 세션 시작 시 detached HEAD `d3a1d7d`(origin/main과 동일) → 로컬 `main` stale(`0425936`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 사이클 세션시작 HEAD `76ff7de`)**: `git diff --stat 76ff7de..HEAD -- src/routes src/middleware src/utils index.tsx wrangler.toml .github/workflows` **6파일**(`kakao.ts`·`orders/core.ts`·`orders/queries.ts`·`shipments.ts`·`shipmentNotice.ts`·`thumbnailStore.ts`). `orders/core.ts`(830060b R2 hydrate 병렬화)·`thumbnailStore.ts`는 이번 순환 Area1(자기 성능검증)·Area4(집계정합성 렌즈)가 이미 정독 — 병렬화가 entity 필터·인증에 영향 없음 재확인만. `shipments.ts`·`shipmentNotice.ts`(65af4e6·148ccbc·5d6363d)는 Area2(entity/N+1/dead-code)·Area3(UX)가 이미 정독했으나, **Area5 고유 렌즈(IDOR·bare mutate·write-redirect 안전성)로는 미검증** → 직접 재검토. `kakao.ts`·`orders/queries.ts`(2cc2d56·8506b3b)는 아무 Area도 안 본 완전 신규 — 전수 직접 검증.
> - **`kakao.ts` POST /send-shipment 재검증(한진 알림톡 자동전환, 2cc2d56)**: `shipment` 조회가 `entityFilter(c,'o')` 유지, 신규 SKIPPED 로그 INSERT의 `entity_id`는 `getEntityId(c)` 스탬프(격리 정상). `isApprovedTemplateState` 판정 추가는 순수 상태값 비교, DB 접근·사용자입력 렌더 없음 — IDOR·XSS·SQLi 표면 없음.
> - **`orders/queries.ts` GET /:id/work-order 재검증(재단 번호 확대, 8506b3b)**: 신규 `designer_intakes` 조회가 `analysisIds`(이미 entity-scoped 주문 라인에서 파생) IN절을 80청크로 바인드(`audit:bind-limit` 컨벤션 준수) — entity 필터 불필요(파생 ID가 이미 격리된 상위 쿼리 결과), 신규 격리 갭 없음.
> - **`shipments.ts` write-redirect 안전성 재확인(Area5 고유 렌즈)**: `applyShipmentFieldPatch`(내부 `SELECT merged_into_id FROM shipments WHERE id=?` bare)는 **호출부(`PATCH /:id`)가 진입 시 `entityFilter(c)`로 소유권을 먼저 검증**한 뒤에만 호출됨(FP클래스 "cross-entity 리다이렉트 — 진입점이 호출자 소유 자원만 받으면 안전"과 정확히 일치, `:1568` 확인) — 새 격리 갭 아님. `PATCH /checklist/:shipmentId`(신규/재작성)도 `entityFilter(c,'o')` JOIN 게이트 확인. `loadShipPlan()`(대시보드 재설계)도 `entityFilter(c,'o')` 유지.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건(빈 문자열 폴백, 기존 FP, 변동없음).
> - **standing scan 2: `node scripts/check-xss.mjs`**(advisory) — **109건**(직전 107, +2). 델타 2건을 직접 대조(`shipments.js:248/1969`·`workOrderPrint.js:116`) → 전부 FP, 신규 FP 하위클래스로 codify(아래). 진짜 미이스케이프 net-new 0건.
> - **standing scan 3: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 75건·누락 **0건**(변동없음).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지.
> - **standing scan 5: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 6: `npm audit --omit=dev`** — 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 8런 전부 `conclusion:success`(최종 HEAD `d3a1d7d`, run #2070).
> - **open≠unfixed — #658·#650 재확인(churn 무변경 근거)**: `git diff --stat 76ff7de..HEAD -- src/routes/taxInvoices/issue.ts src/routes/items.ts` = 빈 출력(두 파일 모두 직전 Area5 사이클 이후 무변경) — 직전 사이클(09-23T15:40)이 이미 직접 재확인 완료라 재조회 불필요, 그대로 미해결 유지. `#626`도 churn 밖, 상태 불변.
> - **open 이슈 재확인**: `list_issues(state:OPEN,label:auto-improve)` **11**건(#662·#661·#660·#659·#658·#656·#654·#650·#626·#617·#616) — 전건 Area5 관할 밖 또는 상태 유지.
> - **backlog↔GitHub 절대값 재동기화**: open **11**(변동없음) · done **572**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: area-5-security-infra.md에 새 FP 클래스 추가 — 「`check-xss.mjs`의 `+` 분절(concat-style)도 삼항조건 FP를 물려받는다 + 리터럴 속성값의 field-substring 오매치」(기존 ⓑ클래스가 템플릿리터럴 `${...}` 한정으로 적혀 있었는데 concat 스타일(`+`)에도 같은 형태가 재현됨을 이번 churn 2건에서 실측·codify). `line N` 잔여참조 재확인(0건, 이미 서술식).
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(6파일 전수 검증, IDOR·XSS·SQLi 전부 clean, check-xss 델타 2건 FP 확인), 자동수정 0건(고칠 결함 없음), done-sync: open 11(변동없음)·done 572(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-24T18:20):**
> - **방법**: 세션 시작 시 detached HEAD `d67da50`(origin/main과 동일) → 로컬 `main` stale(`0425936`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 세션시작 HEAD `4cd6542`)**: `git diff --stat 4cd6542..HEAD -- src/routes src/utils migrations index.tsx` **9파일**(`0627` 마이그·`orders/core.ts`·`printEvents.ts`·`shipments.ts`·`workbench.ts`·`finishingLabel.ts`·`printFileName.ts`(신규)·`shipmentNotice.ts`·`thumbnailStore.ts`). 전부 이번 순환(Area4→5→6→1→2→3) 중 다른 Area가 자기 렌즈로 이미 정독(`0627`=Area6 idempotent 확인·`orders/core.ts`+`thumbnailStore.ts`=Area1 자신의 830060b N+1 병렬화 자체검증·`shipments.ts`=Area2 entity/N+1+Area3 UX(confirmPendingRow, #661)·`workbench.ts`=Area5 ovf 필터 확인·`finishingLabel.ts`/`printFileName.ts`=Area2 dead-code+Area6 sibling-parity·`shipmentNotice.ts`=Area2+Area5). **Area4 고유 렌즈(집계정합성·고아레코드·entity_id NULL·인덱스)로는 미검증** → 9파일 직접 재검토.
> - **`orders/core.ts` 830060b 재검토(Area4 렌즈)**: `hydrateGroupsJson`/`hydrateGroups` 순차→`Promise.all` 병렬화는 각 order_item/group을 독립적으로 그 자리에서 mutate(`it.ai_groups_json = ...`, `g.thumbnail_base64 = ...`)하는 구조라 원소 간 공유 상태·누적 카운터 없음 — 병렬화가 집계 순서/중복에 영향 없음(Area1이 이미 성능 렌즈로, 이번엔 정합성 렌즈로 재확인, 결함 0).
> - **🆕 신규 발견 #662 — `GET /:id/invoice`가 `GET /:id`의 원가 역할필터(65af4e6)를 못 받음**: 같은 커밋(`65af4e6`)이 `/:id`에 `ORDER_COST_ROLES`(ADMIN/MANAGER/ACCOUNTANT)/`ORDER_COST_FIELDS`(material_cost 등 6개) 서버측 삭제를 추가했는데(`core.ts:542-546`), **형제 엔드포인트 `/:id/invoice`(`:276`, 거래명세서)는 `oi.*` 로 order_items 를 그대로 반환**하며 이 필터가 없다. `/:id/invoice`는 `requireRole` 없이 라우터 공통 `requireAnyPagePermission('/orders','/cards')`(`:16`)만 걸리고, `/cards` 페이지 권한은 `0453_role_expansion_rw.sql:71,82`에서 **FINISHING·SHIPPING** job_role에도 부여돼 있어(`COALESCE(job_role,role)`가 JWT role) 원가 비공개 대상 직원이 이 API로 원가·마진을 그대로 받을 수 있음. `core.ts:280-282` 주석이 entity 가시성은 이미 형제 맞춤을 명시했는데 같은 날 추가된 역할 필터만 스윕에서 빠짐 — 이 프로젝트가 반복 codify하는 "형제 완전성 누락" 클래스의 데이터 노출판. issue-only(API 응답 형식 변경).
> - **나머지 8파일 재확인**: `printEvents.ts`(과다출력 카드수량 분모 확장) — 읽기전용 판정 로직, 80청크 바인드 정상, 집계 컬럼 write 없음 = Area4 대상 아님. `shipments.ts`(285줄 재설계) — `git diff` grep(`UPDATE|INSERT|DELETE|SET .*\+|COALESCE`) 결과 신규 가산/누적 write 0건(전부 read-side dashboard 재구성 + 알림 발송 코드 제거), Area2가 이미 entity/N+1 확인 완료라 집계정합성 렌즈로도 추가 결함 없음. `workbench.ts`(intake-config 컬럼 확장) — 읽기전용 SELECT 확장(판매단위·후가공·품목코드 컬럼 추가), 쓰기·집계 없음. `finishingLabel.ts`/`printFileName.ts`(신규 `formatGrommet`/`formatLoop`/`parseDeclaredQty`) — 순수 포매팅 함수, DB 접근 없음. `shipmentNotice.ts`(정책값 변경) — Map 상수 스왑뿐. `0627` 마이그 — Area6가 이미 idempotent(`UPDATE`/`INSERT OR IGNORE`) 확인 + prod 배포검증 완료, net-new 없음.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지(`attendance.ts:171`·`dashboard.ts:420`·`workbench.ts:577`·`itemUnits.ts:162`).
> - **standing scan 2: `npm run audit:migration-number`** — 같은 테이블 DDL 충돌 **0건**(변동없음, 중복번호 쌍 목록 동일).
> - **standing scan 3: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 4: `npm audit --omit=dev`** — 0건.
> - **prod 데이터 직접조회 불가 재확인**: 이 세션도 egress 차단 — 고아 레코드·상태 불일치 등 실 데이터 기반 점검은 이번에도 불가(기존 제약 재확인, 신규 아님).
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 8런 전부 `conclusion:success`(최종 HEAD `d67da50`, run #2064).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` 기존 10건(#661·#660·#659·#658·#656·#654·#650·#626·#617·#616) 전건 Area4 관할 밖 또는 상태 유지. `search_issues(invoice cost margin)` 0건 확인 후 #662 net-new 등록.
> - **backlog↔GitHub 절대값 재동기화**: open **11**(+1, #662) · done **572**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클은 기존 churn-bridge 원칙("다른 Area가 자기 렌즈로 이미 본 파일이라도 이 Area 고유 렌즈로는 미검증일 수 있다")을 role-기반 필드제거(entity 격리가 아니라 역할별 응답필드 제거)라는 새 하위클래스에 적용한 사례 — 기존 "형제 스윕 누락" 원칙의 정확한 재적용(entity 축의 #659/#658/#650과 같은 계열이나 이번은 role→field 축), 새 클래스 codify는 불요(기존 형제완전성 원칙이 이미 포괄).
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 **1건**(#662, GET /:id/invoice 원가필드 역할필터 누락 — FINISHING/SHIPPING 노출), 자동수정 0건(API 응답 형식 변경=Area4 정책상 issue-only), done-sync: open 10→11(#662)·done 572(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-24T15:51):**
> - **방법**: 세션 시작 시 detached HEAD `baa1a61`(origin/main과 동일) → 로컬 `main` stale(`0425936`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 사이클 세션시작 HEAD `e04c7a9`)**: `git diff --stat e04c7a9..HEAD -- src/pages src/scripts index.tsx` **9파일**. 대부분(`orderForm/finishing.js`·`shared/finishingLabel.js`·`productionReports.js`)은 이번 순환 Area6(50-commit bridge, `774101f`)가 이미 정독 완료(sibling-parity 대조·XSS 표면 없음 확인). **아직 아무도 UX 렌즈로 안 본 신규** = `65af4e6`(확정 대기 상태 표시·일괄 처리 + 출고 예정·실적 재설계, 6파일: `shipments.ts`·`shipmentsDashboard.ts`·`orders.js`·`workOrderPrint.js`·`shipments.js`·`shipmentsDashboard.js`) — Area2가 이번 순환에서 이 커밋의 **백엔드**(`src/routes/shipments.ts`, entity/N+1/dead-code)는 이미 정독했으나 프론트 UX는 미검증. 일반 에이전트(general-purpose)에 8항목 체크리스트(빈 상태·로딩·에러메시지·더블클릭 가드·showConfirm 오용·크로스페이지 링크·KPI 정의·XSS)로 위임해 직접 diff+Read 검증.
> - **🆕 신규 발견 #661 — `confirmPendingRow`(단건 확정) 더블클릭 가드 없음, 같은 커밋의 `confirmPendingSelected`(신설 일괄확정)만 가드**: `shipments.js:1038` 신설 함수는 `pcBulkConfirmBtn.disabled=true`로 시작(`:1051-1052`)하는데, **같은 커밋에서 payload 추출·"목록에 남음" 토스트까지 재작성된** `shipments.js:1018 confirmPendingRow`는 클릭 핸들러(`:944`,`:946`)에 disable/in-flight 가드가 전혀 없음. **FP 필터 적용 확인**: 15회차 codify 기준("보고 조건 = 프론트 가드 X + backend 비원자/가산 destructive write + 도달성 LIVE 셋 다")의 backend 조건을 직접 검증 — `applyShipmentFieldPatch`(`routes/shipments.ts:1475`)는 `UPDATE ... SET box_count=?,tracking_number=? WHERE id=?` **단순 덮어쓰기**(가산 아님)이고 `syncShippingFeeFromBoxes`(`utils/shippingFee.ts:51`)도 `box_count`를 다시 읽어 배송비 라인 수량을 **세팅**(가산 아님)이라 **멱등** — 데이터 손상 리스크는 없음. 그래서 심각도를 "중복 write=데이터 정합성"이 아니라 **"같은 커밋 내 형제 함수 가드 비대칭(일관성) + 불필요한 중복 요청"**으로 낮춰 보고(15회차 기준의 엄격 적용 — backend가 가산이 아니면 그대로 issue 등급을 낮추는 것이 맞는 판단이라 확인). 도달성 = onclick 배선 확인(`:944`,`:946`), FP 아님. issue-only(버튼 disable 배선=UI 변경 — Area3 자동수정 금지 정책).
> - **8항목 체크리스트 나머지 clean**: `showConfirm(` 전 호출처(`await`/`.then()` 정상, 콜백-2번째인자 오용 0건) · 빈 상태(확정대기 카드 hidden·출고예정 리스트 "N에 해당하는 출고 건이 없습니다" 명시 문구) · escapeHtml(신규 렌더 필드 전부 `esc()`/`escapeHtml()` 적용, 알림 미리보기는 `.textContent`라 자동이스케이프) · KPI 카운터(출고완료가 `shipped ⊆ due`로 필터링돼 `shipped ≤ planned` 항상 성립, 이중계상 불가) · 바코드 제거(Code128/JsBarcode 참조 전 파일 0건, 고아 참조 없음). 크로스페이지 링크 부재(확정대기·예정표 카드→주문상세 클릭스루 없음)·`loadPendingConfirm` catch가 console-only인 점은 **이번 커밋이 손대지 않은 기존 갭**이라 스코프 밖(신규 회귀 아님).
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지.
> - **standing scan 2: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 3: `npm audit --omit=dev`** — 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 8런 전부 `conclusion:success`(최종 HEAD `baa1a61`, run #2063).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` 기존 9건(#660·#659·#658·#656·#654·#650·#626·#617·#616) 전건 Area3 관할 밖 또는 상태 유지, `search_issues` 중복검색(confirmPendingRow·더블클릭 가드) 결과 net-new 확인 후 #661 등록.
> - **backlog↔GitHub 절대값 재동기화**: open **10**(+1, #661) · done **572**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클은 기존 15회차 codify("더블클릭 중복제출 standing scan")를 신규 커밋의 형제함수 쌍에 정확히 재적용한 사례 — backend 멱등성 교차검증이 심각도를 낮추는 실제 판정 사례(FP는 아니지만 등급 조정)로 기존 레시피가 잘 작동함을 재확인. 새 클래스 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 **1건**(#661, confirmPendingRow 더블클릭 가드 비대칭 — backend 멱등이라 저위험 등급), 자동수정 0건(버튼 disable 배선=UI 변경, Area3 정책상 issue-only), done-sync: open 9→10(#661)·done 572(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-24T09:45):**
> - **방법**: 세션 시작 시 detached HEAD `1f42a40`(origin/main과 동일) → 로컬 `main` stale(`0425936`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 사이클 세션시작 HEAD `50c0760`)**: `git diff --stat 50c0760..HEAD -- src/routes src/types src/utils migrations index.tsx` **11파일**. 대부분(`feedback.ts`·`printEvents.ts`·`productionReports.ts`·`workbench.ts`·`finishingLabel.ts`·`printFileName.ts`·`0627` 마이그)은 각 커밋 시점을 대조한 결과 이번 순환의 Area1/3/5/6가 이미 자기 렌즈로 정독 완료(0db24a2·c758c04 등 09-22 커밋, 각 사이클 세션시작보다 이전). `orders/core.ts`(23줄)는 **Area1 자신의 이번 사이클 자동수정**(`830060b` R2 hydrate 병렬화, 커밋 09-23 18:46 — Area1이 이미 심층검증·prod 재확인 완료) — Area2 재검토 불요. **아직 아무도 안 본 신규**ㅡ `shipments.ts`(286줄, 3커밋)·`shipmentNotice.ts`(2커밋) — 전부 09-23 18:54~24 00:09, 직전 Area1(03:48)·Area6(21:45) 사이클 이후에는 안 났지만 **churn 리스트에만 잡히고 어느 로그에도 파일명이 등장하지 않음** — Area2 고유 렌즈(entity_id·authMiddleware·N+1·타입·SELECT *)로 직접 정독.
> - **`shipments.ts` 3커밋 직접 재검증**: (1) `65af4e6`(확정대기·출고예정 재설계) — `GET /dashboard/counts`·`GET /dashboard`를 `loadShipPlan()` 공용 헬퍼로 통합, `entityFilter(c,'o')` 유지(구코드와 동일 패턴), 결과를 `Map<number,ShipPlanOrder>`로 단일 쿼리 후 메모리 집계(N+1 아님, per-order 추가 쿼리 0). (2) `5d6363d`(자동발송 제거) — `sendEmail`/`renderTemplate` import·fire-and-forget 이메일·알림톡 발송 블록 삭제, 대체 코드 없음(dead import 잔존 여부 확인 → 둘 다 import문도 같이 제거돼 있음, 미사용 import 없음). (3) `148ccbc`는 `shipmentNotice.ts`만 건드림(아래). **3커밋 전부 entity 격리·auth·N+1·dead-code 결함 0건** — 순수 정책/설계 변경(owner 의사결정, commit message에 근거 명시)이라 Area2 스코프 밖.
> - **`shipmentNotice.ts`(`148ccbc`) 재검증**: `NOTICE_POLICY` 맵 값 변경(방문수령/직접수령 `notify:true→false`)뿐, 함수 시그니처·타입 무변경. `test:shipment-notice` selftest도 같은 커밋에서 동기화(9항목 유지) — 코드 품질 이슈 없음.
> - **dead-code 확인**: `finishingLabel.ts`(`formatGrommet`·`formatLoop`, Area6가 이미 sibling-parity 대조 완료)·`printFileName.ts`(`doubleSidedFactor`·`DECLARED_QTY_RE`)는 grep상 파일 내부에서만 참조되는 것처럼 보였으나 직접 Read로 확인 — `doubleSidedFactor`는 `parseDeclaredQty`·`declaredQtyFor` 내부에서 실사용(export는 향후 테스트 접근용), dead code 아님.
> - **standing scan 1: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 75건·누락 **0건**(변동없음).
> - **standing scan 2: authMiddleware recursive 스캔**(`find src/routes -name '*.ts'` 전수) — 무-auth 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`, 변동없음) 전부 기존 정당 클래스(barrel/helpers Map.get FP·hrSelf scoped-token·public webhook류). `shipments.ts`는 `:15` 전체 auth 적용 확인, 갭 없음.
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지.
> - **standing scan 4: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 5: `npm audit --omit=dev`** — 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 8런 전부 `conclusion:success`(최종 HEAD `1f42a40`, run #2062).
> - **open 이슈 재확인(open≠unfixed)**: `search_issues(is:open label:auto-improve)` **9**건(#660·#659·#658·#656·#654·#650·#626·#617·#616, 변동없음) — 전건 Area2 관할 밖 또는 상태 유지, churn 범위(11파일)와 겹치는 건 없음.
> - **backlog↔GitHub 절대값 재동기화**: open **9**(변동없음) · done **572**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클은 기존 churn-bridge 원칙("다른 Area가 자기 렌즈로 이미 본 파일이라도 이 Area 고유 렌즈로는 미검증일 수 있다")을 신규 클러스터(shipments.ts 재설계 3커밋)에 정확히 재적용한 사례 — 새 클래스 없음. owner 자신이 쓴 상세 커밋 메시지(정책 근거 명시)가 있으면 Area2 재검토가 "결함 탐지"가 아니라 "결함 부재 확인"으로 빠르게 끝나는 패턴 재확인.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 이번 추가 후 사이클 로그 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(11파일 전수 검토 — 8개는 타 Area 기정독, 3개(shipments.ts×2 커밋+shipmentNotice.ts)는 Area2가 직접 정독해 결함 없음 확인), 자동수정 0건(고칠 결함 없음), done-sync: open 9(변동없음)·done 572(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-24T03:48):**
> - **방법**: 세션 시작 시 이미 `main`(`0425936`, origin/main과 동일) — detached HEAD 아님. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 10런(#2051~#2060) 전부 `conclusion:success`(최종 HEAD `0425936`, run #2060). 이번 사이클 자체 커밋(`830060b`) 배포 run #2061도 `conclusion:success`(smoke 134/134 PASS) — 아래 자동수정 검증 항목.
> - **🆕 자동수정 — `orders.detail` 5~13초 → 병렬화 (issue 생략, 즉시 커밋)**: run #2060(및 직전 2런)의 smoke job 로그를 대조(#636 대리지표 레시피 재사용 — egress 차단으로 prod 직접 fetch 불가, `curl webapp-9i0.pages.dev` → `connect_rejected` 재확인). `GET /api/orders/12740`이 3런 연속 **4955ms·5054ms·13394ms**(다른 133개 프로브는 전부 <1.5s, cashSchedule.overview·hr.stats 제외 나머지 <1s) — 500ms 임계의 느린 엔드포인트 목록에 매번 1위. 원인 = `src/routes/orders/core.ts` GET /:id의 R2 썸네일 hydrate 이중 순차루프: (1) order_items 전체를 순차 `await hydrateGroupsJson`, (2) 그 안 `hydrateGroups`(`src/utils/thumbnailStore.ts`)가 그룹별 R2 get을 또 순차 `await` — 네트워크 왕복이 라인×그룹 수만큼 직렬화된 고전적 N+1. **동일 패턴이 `aiAnalysis.ts`에는 이미 #502로 청크 `Promise.all` 수정이 들어가 있었는데 이 라우트만 스윕에서 빠져 있었다**(형제 비대칭). 수정 = 두 루프 모두 `Promise.all`로 병렬화(그룹 루프는 `thumbnailStore.ts`의 공유 함수라 aiAnalysis·workbench 호출부도 동일 수혜) — 응답 데이터·형식 무변경, 순수 동시성 전환이라 비즈니스 로직 변경에 해당하지 않음(SKILL 자동수정 허용 "N+1 쿼리" 항목). `npx tsc --noEmit`·`npm run build`·`check:fn`·`audit:entity` 전부 clean → 커밋 `830060b` 즉시 push. **배포 run #2061 완료까지 Monitor로 직접 대기·재검증**(같은 세션 내, GitHub API는 egress 허용 — `api.github.com` 200 확인 후 job log 폴링): smoke 재실행 결과 `/api/orders/12740`가 **13394ms → 3088ms**(약 77% 감소, PASS 134/134 유지) — N+1 직렬화는 해소됐으나 여전히 다른 detail류(<1s)보다 느림. 잔여 3초는 이 주문이 AI-분석 그룹(썸네일) 수가 유난히 많은 heavy 테스트 주문(id=12740, smoke 고정 프로브)일 가능성이 높음 — 병렬화해도 R2 get **동시 호출 개수** 자체가 많으면 Workers CPU/네트워크 총량은 남는다. 자릿수 개선(5~13s→3s)은 확정 성과이나 "완전 정상화"는 아니므로 **완료로 닫지 않고 다음 사이클 재확인 대상으로 유지**(그 주문의 실제 그룹 수 확인 후 필요 시 R2 get 자체를 캐싱/lazy화하는 후속 개선 검토 — 이번엔 병렬화만으로 범위 한정).
> - **cashSchedule.overview·hr.stats 재확인(느린 엔드포인트 상시 2·3위)**: cashSchedule.overview(4454~5173ms 3런 연속)는 **#636 기결정 — 재이슈 안 함**(owner가 2026-09-10 국내 직접측정 421~424ms로 "CI 수치=GitHub 러너 해외 왕복거리 배수" 판정 완료, 배수 약 9~11배로 이번 3런도 일관 유지 — 재이슈 조건인 "배수 자체 이탈"은 미충족). hr.stats(1237~1690ms)는 `src/routes/hr.ts:816` GET /stats — 순차 D1 쿼리 5~6개(총계·부서별·출근·평균근무·급여) 자체가 단순 집계라 N+1은 아니고, 초반 4개(총계/부서/출근/평균)는 서로 독립이라 병렬화 여지는 있으나 500ms 임계는 넘어도 자릿수 이상 비정상은 아님(orders.detail의 5~13초와 다른 급) — 이번 사이클 조치 대상에서 제외, 자릿수 이상으로 악화되면 재검토.
> - **신규 이슈 검색 0건 중복**: `search_issues("orders.detail" OR "hydrateGroups" OR "thumbnailStore")` 0건, `search_issues("hr.stats")` 무관 이슈 1건(#391, 근태 UTC/KST 불일치 — 이 발견과 무관) — 기존 미보고 확인 후 진행.
> - **LogWatcher 하트비트·CAPS 동기화**: egress 차단으로 prod DB/엔드포인트 직접 조회 불가(기존 제약 재확인). smoke 프로브에 LogWatcher 전용 엔드포인트 없음 — 이번 사이클 미검증(다음 세션이 egress 열리면 직접 확인 권장).
> - **backlog↔GitHub 절대값 재동기화**: open **9**(변동없음) · done **572**(+1, 자동수정) · rejected **6**(변동없음).
> - **🧬 SKILL 강화 후보**: area-1-production-health.md에 "smoke 느린 엔드포인트 상위 3 중 신규 항목은 즉시 원인 추적" 레시피를 이번 사이클이 실제로 수행(기존 #636/#409 레시피의 정확한 재적용) — 새 클래스 아님, codify 불요. 다만 **"형제 스윕 누락"**(#502가 고친 패턴이 sibling 라우트에 남아있던 것)은 이 프로젝트 CLAUDE.md가 이미 여러 축(§조용한 격하·§ExtendScript 등)에서 반복 codify한 원칙의 백엔드 N+1판 사례 — 기존 원칙 재확인, 신규 SKILL 불요.
> - 신규 이슈 0건(자동수정으로 직접 해결), 자동수정 **1건**(`830060b`, orders.detail R2 hydrate 병렬화), done-sync: open 9(변동없음)·done 571→572(+1)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-23T21:45):**
> - **방법**: 세션 시작 시 detached HEAD `c978be4`(origin/main과 동일) → 로컬 `main` stale → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 사이클 결과 커밋 `6a17e86`)**: `git log 6a17e86..HEAD` **50커밋** — 이번 순환(Area6→1→2→3→4→5) 자신들의 북키핑 6건 + **웹앱 스코프 16파일**(`src/routes`·`src/scripts`·`src/pages`·`src/layout`·`src/utils`·`migrations`) + **비-웹앱 축 17커밋**(IA 전사(transfer) 호스트 구축 14 + LogWatcher 3).
> - **웹앱 스코프 16파일**: `feedback.ts`·`feedback.js`·`layout/feedback.js`·`printEvents.ts`·`productionReports.ts`·`productionReports.js`·`workbench.ts`·`finishingLabel.ts`·`printFileName.ts`·`menu.ts`·`topbar.ts`·`0626_feedback_reports.sql`은 Area1~5가 이번 순환에서 이미 파일명 단위로 전수 정독(#600 브리지 재확인: 어느 파일도 나열만 되고 Read 안 됨 없음). **나머지 3개(`0627_transfer_streetlight_pp_loop_grommet.sql`·`orderForm/finishing.js`·`shared/finishingLabel.js`)는 백로그 전체 grep(`0627`·`orderForm/finishing.js`·`shared/finishingLabel.js`) 결과 어느 Area 로그에도 등장 0회 — Area6가 직접 정독**.
> - **미정독 3개 직접 검증**: ① `0627` 마이그(가로등배너 하도매 상단/측면 개수 전환·끈고리 PP-LOOP 신설·봉제 프리셋 method_group 정정, 전부 `UPDATE`/`INSERT OR IGNORE` 멱등) — `.claude/PROJECT_STATUS.md` 배포 배너가 이 마이그를 "prod 적용" + "journey 40/40·local-e2e 4/4·smoke:prod 134/134·prod 마커(cm 토글·PP-LOOP·프리셋) 실측"으로 이미 검증 완료(#483 (b)-risk 클래스, 배포 세션 자신이 드리프트까지 확인) — net-new 없음. ② `orderForm/finishing.js`(`syncTransferSewCm` 신설) — DOM 값(`classList.toggle`·`.value`) 조작만, innerHTML 보간·free-text 렌더 없음 = XSS 표면 없음. ③ `shared/finishingLabel.js`(`formatGrommet`·`formatLoop` 신설) — **sibling-parity 대조**: 정본 `src/utils/finishingLabel.ts`의 동일 함수와 `git diff` 라인 단위 대조 결과 로직 **완전 일치**(숫자 파싱·enum 비교·문자열 조합 전부 동형, "정본과 동일" 주석이 사실과 부합) — 형제 비대칭 없음, net-new 0.
> - **비-웹앱 축 17커밋 — IA 전사 호스트 14 + LogWatcher 3**: IA 14건은 전부 자기완결 postmortem 커밋(원인 실측→최소재현→수정→게이트, CLAUDE.md §visibleBounds·§비활성문서읽기·§조용한격하에 이미 직접 반영됨 확인) — `audit:jsx-ternary`(15개 .jsx, 괄호없는 중첩삼항 0)·`audit:jsx-syntax`(32개 전부 파싱)·`audit:empty-catch`(30파일·395곳 전부 사유 있음) 3종 직접 재실행 clean. LogWatcher 3건(`ab08a1a`·`0711903`·`fa9cfb5`, 2026-09-22 커밋인데 이번이 첫 등장 — 「비-웹앱 런타임 축」 62회차 레시피의 정확한 재현)도 같은 형태(립 경로 자동교체 근거 실측·게이트 자기결함 2건 발견수정·규격결손 원인분석+폴백+셀프테스트)로, `make-kit.ps1` 배선 주장(`--selftest-pexp/-flexi/-transfer` 3종)을 `grep`으로 직접 확인 — 존재함(`:38`). 셋 다 issue-only 축(dotnet/PowerShell 실행 수단 없음, 기존 원칙) — 코드 결함 없음.
> - **standing scan**: `npm run audit:migration-number`(같은 테이블 DDL 충돌 0, 변동없음) · `node scripts/sort-audit.cjs`(P1 0, P2 4건 기존 FP 유지) · `npm run branch:clean`(삭제대상 0, SKIP 1=main) · `npm audit --omit=dev`(0건) · `npm run audit:skills`(OK, 스킬 19개 상주비용 ~2,662자).
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 8런 전부 `conclusion:success`(최종 HEAD `c978be4`, run #2051).
> - **done-sync 절대값 재동기화(리터럴 쿼리)**: `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **571**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **9**(#660·#659·#658·#656·#654·#650·#626·#617·#616, 변동없음).
> - **open≠unfixed 재확인**: #660은 Area4가 이미 fixed-in-tree 코멘트 게시(close-pending 유지, 변동없음). #659·#658은 Area5가 이번 순환에서 직접 재확인해 "여전히 미픽스" 확정(코멘트 0건, 재검증 불요). #656·#654·#650·#626·#617·#616 — 각 담당 Area가 이번 순환 중 재확인 완료(로그 상단 참조), Area6 관점에서 추가 변동 없음.
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(이미 서술식, 잔여 없음). 이번 사이클은 기존 3개 레시피(#600 나열≠Read 브리지·「비-웹앱 런타임 축」 범위 브리지·open≠unfixed 거울)를 새 churn 클러스터(전사 후가공 3파일 + LogWatcher 3커밋)에 그대로 적용한 사례 — 새 클래스 없음. `0627` 마이그가 배포 세션 자신의 드리프트 검증으로 이미 닫혀 있었던 것은 「컬럼-diff bridge SELECT-detail 확장」(33회차) 레시피가 기대하는 "owner가 배포 배너에 검증 근거를 남기면 Area6 재검증 비용 절감"의 정확한 사례.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(50커밋 전수 브리지 검토 — 웹앱 16파일 중 13개 타 Area 기정독 확인 + 미정독 3개 직접 정독 clean, 비-웹앱 IA 14건+LogWatcher 3건 전부 자기완결 clean), 자동수정 0건(코드 결함 없음), done-sync: open 9(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-23T15:40):**
> - **방법**: 세션 시작 시 detached HEAD `76ff7de`(origin/main과 동일) → 로컬 `main` stale → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 사이클 세션시작 HEAD `d1b2ec8`)**: `git diff --stat d1b2ec8..HEAD -- src/routes src/middleware src/utils index.tsx wrangler.toml .github/workflows` **6파일**(`feedback.ts`·`printEvents.ts`·`productionReports.ts`·`workbench.ts`·`finishingLabel.ts`·`printFileName.ts`) — 직전 사이클들에 비해 이례적으로 작음(churn 대부분이 이번 순환에선 비-웹앱 IA 전사(transfer) 호스트 구축·`docs(status)` 배너라 Area5 스코프 밖).
> - **Area5 고유 렌즈로 6파일 직접 재검증**: `feedback.ts`는 Area2가 이미 #659(entity 격리 누락)로 등록 완료 — 재검증만(아래 open≠unfixed). `printEvents.ts`(`GET /`) 신규 `cards` IN절 조회는 기존 주석("출력 이벤트=장비 로그, 장비는 전 법인 공유 인프라 → 조회는 격리 안 함", 2026-08-11 설계 결정)과 같은 무격리 패턴을 그대로 따름 — 바인드 파라미터화(`?` 청크 80) 정상, 신규 격리 갭 아님. `workbench.ts`(`GET /intake-config`)는 기존 `orderVisibilityFilter(c,'o')`(ovf) 절이 이미 걸린 SELECT에 컬럼만 추가(품목코드·소분류·판매단위 등) — 필터 보존 확인, SQL 인젝션 없음(전부 바인드). `finishingLabel.ts`·`printFileName.ts`는 순수 문자열 포매팅 유틸(DB 접근·사용자 입력 렌더 없음) — 보안 표면 자체가 없음.
> - **🔁 open≠unfixed 거울 — #658·#659 재검증(둘 다 미해결 확정)**: `taxInvoices/issue.ts` 직접 재확인 — 단건 발행(`:415` `WHERE o.id = ?`, entity 필터 없음)·묶음 발행(`:341` `WHERE o.id IN (...)`, entity 필터 없음) 둘 다 지난 사이클(#658, 09-21) 발견 그대로 잔존. `feedback.ts` 직접 재확인 — 상세(`:115`)·첨부다운로드(`:257`)·처리(`:233`) 3곳 전부 여전히 `isManager` role-only 검사(entity_id 대조 없음), #659(Area2, 09-22) 발견 그대로 잔존. 둘 다 owner 코멘트·PR·fix 커밋 없음(GitHub 직접 조회) — **진짜 미해결**, 재보고 불필요(이미 open).
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건(빈 문자열 폴백, 기존 FP, 변동없음).
> - **standing scan 2: `node scripts/check-xss.mjs`**(advisory) — 107건(직전 106, churn이 `src/scripts`를 건드리지 않아 배경값과 무관한 변동). 이번 churn과 겹치는 프론트 파일 없음(전부 `src/routes`·`src/utils` 백엔드), 재확인 불요.
> - **standing scan 3: `npm run audit:entity`** — 검사 133파일·entity테이블 SELECT 75건·누락 **0건**(변동없음). #658/#659는 파라미터 바인딩값(entity 조건 부재)이라 이 정적 컬럼감사 범위 밖 — 통과와 두 발견은 모순 아님(기존 인지 사항 재확인).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 4건 전부 기존 FP 유지.
> - **standing scan 5: `npm run branch:clean`** — 삭제대상 0건(SKIP 1=main). **standing scan 6: `npm audit --omit=dev`** — 0건.
> - **CI 헬스**: `actions_list(deploy.yml)` 최신 10런 전부 `conclusion:success`(최종 HEAD `76ff7de`, run #2050). ⚠️`branch:"main"` 필터를 준 첫 호출이 5런 전(run #2033, 09-21)에서 멈춘 결과를 반환해 "CI가 이틀간 안 돌았다"로 오독할 뻔함 — 필터 없이 재호출하니 run #2050까지 정상 확인, 프록시/캐시 아티팩트로 판단(레포 문제 아님, 재보고 불필요).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **9**건(#660·#659·#658·#656·#654·#650·#626·#617·#616) — #660·#650은 owner 코드로 fixed-in-tree 확정 상태(직전 사이클들이 코멘트 게시, close는 owner 대기) 유지, 나머지 전건 상태 불변.
> - **backlog↔GitHub 절대값 재동기화**: open **9**(변동없음) · done **571**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식). 이번 사이클은 기존 레시피("문서화된 무격리 설계 결정 — 장비 로그는 전 법인 공유 인프라", "IDOR 재검증은 closed 우산 이슈뿐 아니라 open 상태도 매 사이클 대조")를 그대로 적용한 사례 — 새 클래스 없음. CI 조회 캐시 아티팩트는 Area5 고유 교훈이 아니라 조회 습관(필터 있는 호출이 의심스러우면 필터 없이 재확인) 메모로 충분, codify 불요.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 10건 → 이번 추가 후 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(churn 6파일 전부 clean 또는 이미 등록된 발견의 재확인, #658·#659 둘 다 미해결 확정 재검증), 자동수정 0건(안전 자동수정 대상 없음 — IDOR류는 issue-only 컨벤션), done-sync: open 9(변동없음)·done 571(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
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
