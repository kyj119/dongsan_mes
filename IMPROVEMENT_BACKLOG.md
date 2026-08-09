# Improvement Backlog
<!-- last_run_area: 2 -->
<!-- last_run_at: 2026-08-10T03:16:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **9** (`search_issues(is:open,label:auto-improve)` 실측, Area2 61회차. 기존 8건(#601~#608) + 신규 #609[unitConvert.ts toBase/formatStock 0호출·write-path 3곳 인라인 재구현, #462 재발위험]) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **524** (`reason:completed` 실측, 변동 없음) |
| ❌ rejected | **6** (`reason:not_planned`=4 + `reason:duplicate`=2, 변동 없음) |

> **Area 2 코드 품질 심층 분석 (2026-08-10T03:16):**
> - **방법**: `git fetch origin main`(HEAD `8947255` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 2 **61회차** — 직전 Area2(08-08T15:16, 60회차) 이후 `src/routes`/`src/scripts`/`index.tsx`/`src/layout`/`src/pages`/migrations 변경 = **3커밋**(`5eb43d1`·`72112df`·`66e16d8`, 전부 `bank.ts`/`hr.ts` 테이블 컬럼폭 CSS 조정) — 셋 다 diff 직접 확인, `style="width:Npx"` 수치 조정 + 설명주석뿐(SQL·entity_id·auth 무관) = 코드품질 렌즈 신선 churn 사실상 0.
> - **전수 standing scan 재실행(churn 부재라 코드베이스 전체 재확인으로 대체)**: ① `npm run audit:entity` — 검사 131파일·entity테이블 SELECT 61·**누락 0**. ② dead-code 스캔(`src/routes`·`src/utils`의 `export function`/`export const` 중 코드베이스 전체 참조 ≤1건) → 후보 3건: `orders/listFilter.ts:hasActiveOrderFilter`(정의 외 0참조, 08-08 신설 SSOT 파일의 일부·같은 파일 나머지 export는 전부 사용중이라 단일 함수만 미배선 — 진행 중인 목록UX 리팩터의 후속 배선 미완일 가능성 높아 보고 보류, 트리비얼) / `utils/unitConvert.ts:toBase,formatStock`(+내부전용 `packSize`/`isMultiUom`) — **net-new #609(S, improvement)**: 실제 재고 write-path 3곳(`scan.ts`·`inventory.ts`·`po-receive.ts`)이 이 유틸을 안 쓰고 pack_size 환산을 각자 인라인 재구현 중 — 지금은 3곳 다 정합(라이브 버그 아님)이나, 바로 이 패턴(같은 컬럼 write 경로가 변환계수를 각자 구현)에서 **#462**(po-receive.ts 환산 누락 → 재고 음수추락)가 실제로 터진 전례가 있어 새 write-path 추가 시 재발 구조 위험 — write-path 재고수량 로직 변경이라 issue-only.
> - **open 9건 재확인(open≠unfixed)**: #601(`orders/update.ts` `return_items` grep 0 — 여전히 미픽스) 외 #602~#608은 이번 churn(CSS폭 조정 3건)과 무관한 파일이라 직전 Area(1, 21:24)의 verified-once 캐시 유지.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **9**(#601~#608 + 신규 #609) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — #609는 기존 codify된 "#462 형제-완전성" 클래스(Area2 line 근처)의 변형(공용유틸 미채택형)이라 신규 규칙 불요, 재발 관찰로 기존 항목에 흡수 가능.
> - 신규 이슈 1건(#609, issue-only), 자동수정 0건, done-sync: new 9(+1)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-09T21:24):**
> - **방법**: `git fetch origin main`(HEAD `e120325` = origin/main 일치, 워킹트리 clean, detached). prod 직접 curl/WebFetch(`/api/health`) → `EGRESS_BLOCKED`(기존 인지된 제약, #453/58회차와 동일)라 GitHub Actions 기록으로 대체. Area 1 **59회차** — 직전 Area1(`f2d8281`, 08-08T09:16, 58회차) 이후 웹앱 관련 16커밋 착륙, 그중 8개 핵심 churn은 방금 Area6(15:16)가 코드품질/보안 렌즈로 이미 전수 검토 완료 → Area1은 프로덕션 헬스 렌즈(배포·CI·백업·스모크 파이프라인 구조)만 신선하게 점검.
> - **deploy.yml 전수 확인(3페이지·90런, 2026-08-06T14:05~08-09T06:18 커버)**: `Daily D1 Backup` 1건(`fb9127f7`, 08-06T18:20, 기존 #605로 이미 추적된 CF API 지연 블립) 제외 **전부 `completed success`**(Typecheck→Build→Deploy→Smoke, 오늘 HEAD `e120325`까지 포함) — 배포 실패 0건.
> - **🔴 net-new #608(M, improvement, 인프라 신뢰성)**: `#430`(read-only smoke가 write 경로 회귀를 못 잡음, 2026-06-23 completed)의 "완료" 처리가 실효되지 않았음을 실측 확인 — 해법으로 구현된 `verify.yml`의 "Local write canary" step이 `on: pull_request` 트리거인데 이 프로젝트는 PR 없이 main 직접 push만 사용(`list_pull_requests(OPEN)`=0, `actions_list(verify.yml)` `total_count: 0`) → **생성 이래 단 한 번도 실행된 적 없음**. 오늘 신규 착륙한 `smoke:write`(prod-safe, entity-99 격리+self-cleaning, `f83bbc3`/`8ef917f`)도 실제 배포경로(`deploy.yml`·`.claude/skills/deploy-verify/SKILL.md` Phase4)엔 미연결(수동 실행만) — 오늘 그 도구가 `f1cc4d8` PO entity_id 버그를 수동 실행으로 실제로 잡아내 도구 자체 유효성은 입증됐으나, 안전망이 "누군가 이번엔 기억하고 돌렸다"는 우연에 의존. `.github/workflows/*.yml`/스킬 파일 변경(+ "언제 돌릴지" 판단) → issue-only.
> - **backup.yml 최신 상태**: 최근 3건(08-07·08-08 success 확인, 08-06 블립은 #605로 기추적) 정상 재개 지속.
> - **e2e.yml**: 여전히 `disabled_manually`(변동 없음). **verify.yml**: 위 #608 참조 — 열린 PR 0건이라 애초 실행 대상 없음(구조적으로 상시 0런).
> - **open 이슈 7건(#601~#607) 재확인**: `list_issues(OPEN,auto-improve)` 실측 그대로 7건, Area6 15:16 사이클 이후 변동 없음(owner 리뷰 대기 중).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **8**(#601~#607 + 신규 #608) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — #608은 신규 발견 클래스("closed=completed 이슈의 CI 트리거가 이 프로젝트 워크플로우(PR 미사용)와 구조적으로 안 맞아 0회 실행")라 Area 6 "closed≠fixed"(#473) 계열과 유사하나 코드가 아니라 CI 트리거 설계 자체의 미스매치라는 점이 다름 — 1회 관찰이라 즉시 codify는 보류, 재발 시 등재 검토.
> - 신규 이슈 1건(#608, issue-only), 자동수정 0건, done-sync: new 8(+1)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-09T15:16):**
> - **방법**: `git fetch origin main`(HEAD `a720d37`, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 6 — 직전 Area5(`21552f6`, 08-09T04:10) 이후 `src/routes`/`src/scripts`/`index.tsx`/`src/layout`/`src/pages`/migrations 변경 = **8개 핵심 churn**(f1cc4d8 발주 entity_id body신뢰+쓰기스모크·8e50541 출고이력탭·e65167c 배송방법 표기통일[0526]·14936b7 7월 출고일 백필[0527]·d4e3865 생산실적탭(print_events 요약)·3d1300d 생산 타임스탬프 축약·15d7bb6 원장 서버검색+칩+컬럼선택·2536d33 CSV무고지잘림/ID컬럼클립 후속감사) — 전부 병렬 세션이 자체 검증(tsc/build/smoke 110/110/sort-audit/entity-audit/check:dom)까지 마친 상태로 착륙. 어느 Area도 아직 못 본 최신 churn이라 line 307 원칙대로 교차 렌즈로 직접 diff Read.
> - **🔍 `f1cc4d8`(발주 생성이 body의 `entity_id`를 신뢰) 중점 검토**: `poCoreRouter.post('/')`가 기존 `getEntityId(c)||1` 고정값을 `(data.entity_id>0) ? data.entity_id : getEntityId(c)||1`로 바꿔 MANAGER가 자기 세션과 다른 법인으로 발주를 생성할 수 있게 됨 — 처음엔 body-entity_id 신뢰 IDOR 패턴(#417 mass-assignment 계열)으로 의심했으나, `orders/create.ts:81-88`가 **이미 같은 패턴**(`billing_entity_id` 명시값 우선 → 세션 → 담당자 소속, "코디 타법인 접수" 업무 사유로 기존 감사에서 승인된 설계)을 쓰고 있고 커밋 메시지가 "mirrors the order route"로 명시 인용 + `8ef917f`(직전 커밋)가 "Same trap orders have"로 기존 패턴과의 동형성을 스스로 기록 — **기존에 이미 검토·승인된 cross-entity 코디네이터 기능의 형제 확장이지 net-new 취약점 아님**. 채번(`getNextEntitySeqNumber`)도 같은 `poEntityId`를 써서 "번호 E{eid}=행 entity_id" 불변식 유지 확인. `requireRole('ADMIN','MANAGER')` 게이트 불변.
> - **`d4e3865`/`8e50541`/`15d7bb6`(printEvents.ts·orders/core.ts·ar-ledger.ts 신규 SELECT 집계) 재검증**: 전부 기존 WHERE/entityFilter 조립부에 순수 집계 컬럼(area_m2·ship_date_estimated·matchedSummary)만 추가, 필터 조건 자체는 무변경 — entity 격리 회귀 0. `ar-ledger.ts` matchedSummary는 #497 cap-aware search가 스스로 지적했던 "로컬 필터가 cap 밖을 누락" 결함(latent, prod 854/1000이라 미발현)을 서버검색 전환으로 해소 — 이번 사이클이 발견 즉시 고친 사례.
> - **XSS 표면 전수**: `ledger.js`(15d7bb6)는 신규 렌더가 전부 `textContent`(innerHTML 0곳). `shipments.js`(8e50541)·`production.js`(d4e3865) 신규 테이블 렌더는 `client_name`/`order_number`/`printer_name`/`file_name`/`delivery_method` 전부 `escapeHtml()` 일관 적용(부분누락 A-024/A-025급 패턴 0). `2536d33`가 오히려 기존 누락 1건(PO번호 title 속성)을 발견해 즉시 escapeHtml 추가 — net-new XSS 0, 기존 결함 1건 자체 픽스됨.
> - **마이그레이션 재검증**: `0526`(배송방법 통일)·`0527`(7월 출고일 백필) 둘 다 CHECK/NOT NULL 위반 없음(단순 UPDATE, 컬럼 존재성 이상 없음), 멱등성 커밋 메시지에 명시 확인. 마이그 번호 중복 전수(`ls migrations | sed... | uniq -d`) — 기존 5쌍(0327·0412·0416·0420·0453) net-new 0.
> - **`src/scripts/items/core.js`/`modals.js` dead-code 제거(2536d33 P3)**: 폐기된 `#linkedMediaDisplay`/`#parentMediaArea`/`#parentMediaId` DOM 조회 5건 제거 — 대상 요소가 이미 없어 상시 no-op이던 것을 `check:dom` 상시경고 해소 목적으로 정리. 회귀 없음(안전 dead-code 제거, 이미 셀프 검증 완료).
> - **write-smoke 신규 추가(`scripts/smoke-write.cjs`, `f83bbc3`/`8ef917f`) 확인**: create→verify→delete→confirm-removal 패턴의 쓰기 경로 E2E — 기존 Area1 codify("read-only smoke가 write-path 회귀를 못 잡음", #430)가 지목한 구조적 사각을 메우는 방향의 자산. 이번 사이클이 자체적으로 이 결함(발주 entity_id)을 그 스모크로 실제 발견해 고쳤음 — SKILL이 codify한 맹점이 실전에서 유효했고 병렬 세션이 그 격차를 스스로 좁힌 사례.
> - **open 7건 재확인(open≠unfixed)**: #601(`orders/update.ts` `return_items` grep 0, `order_ai_files`/`shipment_checks`/`designer_intakes`만 정리됨 — 여전히 미픽스) · #603(`cards/lifecycle.ts:1006` `PATCH /:id/reissue-ack`는 수동 확인만 있고 출고완료 시 자동 클리어 로직 없음 — 미픽스) · #607(`purchaseRequests.ts:211` CSV export가 여전히 자체 `whereClauses` 사본, `buildPrFilter` 미사용 — 미픽스) 직접 grep 재확인. #602·#604·#605·#606은 이번 churn과 무관한 파일이라 verified-once 캐시 유지(2026-08-08/09 직전 Area 로그 기준 unchanged).
> - **branch:clean**(읽기전용): SAFE-absorbed 1건, 삭제대상 1건(임계 30 미달) — 등록 불요.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **7**(변동없음, #601~#607) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클은 신규 오탐/탐지 클래스 발견 없음. `f1cc4d8` 검토는 기존 FP클래스("문서화된 cross-entity 기능", line 227/230)의 실전 재확인일 뿐 신규 codify 불요.
> - 신규 이슈 0건, 자동수정 0건(코드 렌즈 전수 재검토 결과 net-new 0 — 병렬 세션이 이미 자체 검증까지 마치고 착륙), done-sync: new 7(변동없음)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 (2026-08-09T04:10):**
> - **방법**: `git fetch origin main`(HEAD `21552f6`, 워킹트리 clean) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 5 **53회차** — 직전 Area5(`f66d99b`, 08-07T15:27, 52회차; 컨테이너 히스토리에 해당 커밋 없음 — 타임스탬프 경계로 대체) 이후 `2026-08-07 15:27` 이후 `src/routes`/`src/scripts`/`index.tsx`/migrations 변경 커밋 = **9개 핵심 churn**(451f611 담당자 필드 신설[0523]·a6b8e1b 담당자 셀렉트 폼·5963719 P5 entity귀속 소스전환[0524]+감사리포트·5b42896 담당자 실적리포트·39f16b5 주문목록 SSOT+칩+합계바·4a94013 PO/견적/입고 SSOT 확산·7b7842a 사용자별 프리셋/열선택/페이지크기[0525, 신규 라우터 userPrefs.ts]·080df2b 나머지 6목록[발주요청·지급요청·매입인보이스·재고·세금계산서·거래처] SSOT 확산·557cc95 공급가+VAT 불일치 배지) — Area3(52회차, 08-08T21:20)·Area4(54회차, 08-09T03:20)가 각각 UX/데이터정합 렌즈로 이미 diff Read했으나 보안 렌즈(entity 격리·SQL 파라미터화·XSS sink·auth 게이트) 재검토는 전무했음(line 307 원칙 — "churn 목록 나열"≠"그 렌즈로 개별 검토").
> - **신규 라우터 `userPrefs.ts`(0525) 전수 검증**: `authMiddleware` 라우터 전체 적용 + `currentUserId()`가 토큰에서만 취득(body 미신뢰, 헤더 주석에 명시) + PUT/PATCH/DELETE 전부 `WHERE ... AND user_id = ?`로 소유확인 후 변경(남의 프리셋 조작 불가) + 값 길이 상한(8000B)·프리셋 개수 상한(30/페이지) 서버측 강제. IDOR 0.
> - **신규 `reports.ts` 엔드포인트 2개**: `/sales-rep-stats`·`/entity-attribution-audit` 둘 다 라우터 레벨 `requireRole('ADMIN','MANAGER')` 게이트 하위. `entity-attribution-audit`는 설계상 entityFilter 미적용(담당자 소속≠주문 법인 불일치를 전사 단위로 봐야 하는 감사 도구, 주석에 "막지 않고 보여만 준다" 명시) — ADMIN/MANAGER 전용이라 cross-entity 노출이 정책 위반 아님(기존 FP클래스 "문서화된 cross-entity 기능"과 동형).
> - **`orders/listFilter.ts`·`purchaseOrders/listFilter.ts`·`quotationsListFilter.ts`(신설 SSOT 3개) SQL 파라미터화 전수**: search/status/date/amount 등 전 조건이 `?` 바인드, 정렬은 화이트리스트 맵(`resolveXxxSort`, 미상 키는 기본값 폴백 — SQL 주입 경로 없음), entity 가시성은 `orderVisibilityFilter`/`entityFilter`를 헬퍼 최상단에서 호출. SQL 인젝션·엔티티 격리 우회 0.
> - **🟢 net-new 발견 — 이번 리팩터가 기존 취약점 1건을 부수효과로 픽스**: `orders/queries.ts` CSV export(`/export/csv`)가 리팩터 전에는 entity 가시성 필터가 아예 없어(커밋 메시지 자백: "CSV export had no entity visibility filter (other entities' orders leaked)") 타 법인 주문이 CSV로 유출되던 상태였음 — `buildOrderListFilter` SSOT 도입으로 목록·카운트·CSV·통계 4경로가 전부 같은 `orderVisibilityFilter`를 공유하게 되어 현재는 clean. 별도 이슈화 불요(이미 같은 커밋에서 해소, 재발 방지 = SSOT 구조 자체).
> - **`orders/core.ts`·`purchaseOrders/core.ts`·`po-queries.ts`·`po-receipts.ts`·`quotations.ts` 대규모 리팩터(수백 줄 치환) 권한 게이트 회귀 점검**: 각 라우터의 `.use('/*', authMiddleware, requireAnyPagePermission(...)/requireRole(...))` 선언부 불변 확인 + 단건/변경 핸들러의 `entityFilter(c, alias)` 호출부(`// #358계열`/`// #360` 주석 달린 것들)가 리팩터 전후 개수·위치 동일(diff에 `-entityFilter`/`+entityFilter` 순변경 없음, 조건 조립부만 listFilter.ts로 이관). 회귀 0.
> - **080df2b(6개 목록 SSOT 확산) 신규 SQL 6곳(`inventory.ts`·`paymentRequests.ts`·`purchaseInvoices.ts`·`purchaseRequests.ts`·`taxInvoices/queries.ts`) entityFilter 재검증**: 전부 헬퍼 함수 내부에서 `entityFilter(c, alias)` 호출 유지. `purchaseRequests.ts`는 추가로 `user?.role === 'MANAGER'`일 때 `requester_id = ?` 자기-스코프를 헬퍼(`buildPrFilter`) 안에 포함(주석 "이 규칙이 빠지면 권한 경계가 무너지므로 반드시 여기 포함") — list·stats·CSV export(`/export/csv`) 3곳 모두 이 스코프 보유 확인(#607이 지목한 CSV 드리프트는 필터 로직 값 불일치일 뿐, entityFilter·MANAGER 스코프 자체는 3곳 다 존재 — 보안 영향 없음, #607 issue-only 분류 유지가 맞음).
> - **XSS — 7b7842a(`dsListPrefs`/`dsListToolbar`)·080df2b(6페이지 칩/합계바) 신규 innerHTML 표면 전수**: 프리셋명·열 라벨·검색어 등 자유입력이 들어가는 모든 렌더 경로가 `document.createElement`+`textContent`/`createTextNode`만 사용(innerHTML 문자열조합 0곳, 유일한 innerHTML 사용처는 `&times;` 리터럴 1곳뿐 — 사용자 입력 무관). 6개 페이지(`clients.js`·`inventory.js`·`paymentRequests.js`·`purchaseInvoices.js`·`purchaseRequests.js`·`taxInvoices.js`)의 칩/합계바는 전부 공용 `window.dsListUx.renderChips`/`renderSummary`(shell.js) 경유 — 이 헬퍼 자체가 DOM API로만 구성돼 있어 호출부가 이스케이프를 신경 쓸 필요 없이 구조적으로 안전(A-024/A-025급 "부분 escape" 클래스가 아키텍처로 원천 차단됨). Area3(52회차)가 확인한 `39f16b5`/`4a94013`과 같은 결론 — net-new XSS 0.
> - **필수 grep(Area5 #338)**: `c.env.[A-Z_]+ *|| *'` — `fax.ts:43`의 `BAROBILL_FTP_PASSWORD || ''`(빈 문자열 폴백, 리터럴 시크릿 아님) 외 net-new 0. `body.password || '<literal>'` 0건. 시크릿 하드코딩·기본 비밀번호 net-new 0.
> - **c4320c5(item-master-audit 도구) 훅 변경 검토**: `pretooluse-bash.cjs`에 `INSERT INTO items` 감지 시 리마인더 출력만 추가(비차단) — 기존 위험명령 차단/커밋 게이트 로직 변경 없음, 보안 영향 없음.
> - **open≠unfixed 재확인**: #601·#602·#603 대상 코드 grep 재확인 — 여전히 미픽스, open 유지 정상. #604·#606은 Area3(52회차)가 부분진행 코멘트 남김(폼드롭다운·집계뷰 반영됨, 목록컬럼·프론트 소비처는 잔존) — 재확인 결과 동일.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **7**(변동없음) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음(net-new 발견 0, 기존 FP클래스로 전부 설명됨) — "대형 SSOT 리팩터가 진행 중인 IDOR 취약점을 부수효과로 픽스"(orders CSV) 사례는 흥미롭지만 1회 관찰이라 별도 codify 보류.
> - 신규 이슈 0건, 자동수정 0건, done-sync: new 7(변동없음)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-09T03:20):**
> - **방법**: `git fetch origin main`(HEAD `c4320c5`, 워킹트리 clean) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 4 **54회차** — 직전 Area4(`020133c`, 08-07T09:22, 53회차) 이후 `git log --since 2026-08-07T09:22 -- src/routes migrations src/scripts index.tsx src/layout src/pages` = **13커밋**(목록UX SSOT 대확산: 주문/PO/견적/입고 4종 → 나머지 6종[발주요청·지급요청·매입인보이스·재고·세금계산서·거래처]까지, 신규 마이그 3개[0523 sales_rep·0524 employees.default_entity_id·0525 user_filter_presets/user_ui_prefs], 담당자 P4/P5, 관계사 매입제외).
> - **🔴🔴 net-new 치명적 프로덕션 버그 발견 + 즉시 수정·배포**: `src/routes/orders/create.ts` `POST /` — `451f611`(담당자 필드, 08-07)가 `INSERT INTO orders`에 `sales_rep_id` 32번째 컬럼·플레이스홀더를 추가했는데 `.bind()` 호출에는 **31개 값만** 전달(계산해둔 `salesRepId` 변수가 끝내 안 쓰임). D1은 플레이스홀더·바인드 개수가 정확히 일치해야 하므로 **`POST /api/orders` 전량이 500** — MES에서 가장 핵심적인 쓰기 경로(신규 주문 생성)가 08-07 이후 전면 마비 상태였을 것으로 추정됨(prod 실측은 egress 차단으로 불가). `scripts/smoke.cjs`는 read-only GET 위주(SKILL Area1 기존 codify "write-path 회귀를 read-only 프로브가 못 잡음")라 CI가 이 회귀를 놓쳤다. 노드 스크립트로 INSERT문의 컬럼/플레이스홀더 수(32) vs `.bind()` 인자 수(31→32)를 정밀 파싱해 확정 검증 후 `salesRepId`를 마지막 인자로 추가. `orders/operations.ts`(주문복제)·`quotations.ts`(견적전환)·`taxInvoices/issue.ts`(직접발행)·`migration.ts`(이관) 등 나머지 `INSERT INTO orders` 4곳도 동일 기법으로 전수 재검증 — **전부 플레이스홀더=바인드 개수 일치, net-new 0**(sales_rep_id 컬럼 자체를 다루지 않아 안전). `npx tsc --noEmit`+`npm run build`+`npm run audit:entity`(61/61) 전부 clean. **즉시 커밋+push**(`8e19b36`, 배포 파이프라인이 자동으로 prod 반영) — 발견 즉시 유저에게 푸시 알림 발송.
> - **`orders/create.ts` 담당자 폴백 로직 재확인**: `billingEntityId` 결정 순서(①명시 ②세션 ③담당자 소속)가 채번 불변식("번호 E{eid}=행 entity_id")을 지키도록 채번 **전** 계산되는지 확인 — clean(마이그 0524 주석과 실코드 일치).
> - **`inventory.ts` GROUP BY/HAVING 합계 래핑 재검증**: 목록 카운트 서브쿼리를 `SELECT i.id, SUM(qty), unit_price FROM ... GROUP BY i.id`로 바꾸고 바깥에서 `COUNT(*)+SUM(g.qty)+SUM(g.qty*unit_price)`로 감싸는 신규 코드 — 파라미터 바인드 순서·GROUP BY 컬럼 정합 확인, clean.
> - **`userPrefs.ts`(신설, 0525) 데이터정합 검증**: `user_filter_presets`/`user_ui_prefs` 전 라우트가 `user_id`를 토큰에서만 취득(body 미신뢰) + 소유확인 후 UPDATE/DELETE + INSERT 컬럼/바인드 포지셔널 일치 + UNIQUE 제약(`user_id,page_key,name`) ON CONFLICT UPSERT 정상. entity_id 부재는 설계상 정상(개인 설정, 법인 무관). clean.
> - **🟡 net-new #607(S, sibling-completeness 드리프트)**: `purchaseRequests.ts` CSV export(`/export/csv`)가 이번 사이클이 갓 만든 `buildPrFilter` SSOT(목록/카운트/통계 공유)를 안 쓰고 **자체 WHERE 사본**을 유지 — 형제 파일(`orders/queries.ts`·`purchaseOrders/po-queries.ts`)는 CSV도 SSOT를 쓰는데 purchase-requests만 빠짐(A-024/A-025급 부분롤아웃). 구체 드리프트: SSOT는 status 콤마-다중값을 `IN(...)`으로 처리하는데 CSV 사본은 `= ?` 단일비교라 다중상태가 오면 0건. 현재 프론트(`exportPrCsv()`)는 단일-select만 써서 **지금은 도달 불가(latent)**이나 이번 사이클이 다른 페이지에 클릭형 드릴다운(콤마 status)을 막 확산 중이라 다음 확장에 실제로 터질 것 — issue-only(#607, 쿼리 필터링 동작 변경).
> - **CHECK 제약/마이그 번호 중복 재확인**: 신규 마이그 3개(0523·0524·0525) 컬럼존재성·NOT NULL·포지셔널 INSERT 전부 clean. 마이그 번호 중복 기존 5쌍(0327·0412·0416·0420·0453) net-new 0.
> - **open≠unfixed 재확인**: #601(`return_items`)·#603(`needs_reissue` 자기클리어)·#602(silent-catch) 전부 대상 코드 grep 재확인 — 여전히 미픽스, open 유지 정상.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **7**(#601~#606 + 신규 #607) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — INSERT 플레이스홀더/바인드 개수 정밀검증은 기존 "존재X 컬럼" standing scan(Area2/4)의 연장선(신규 컬럼 추가 시 컬럼 존재성뿐 아니라 바인드 개수까지 대조해야 함을 실증) — 신규 codify 룰로 남길지는 재발 시 판단(1회차 관찰).
> - 신규 이슈 1건(#607, issue-only), **자동수정 1건**(order_number 최우선 프로덕션 크래시 버그, verify PASS+즉시 push), done-sync: new 7(+1)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-08T21:20):**
> - **방법**: `git fetch origin main`(HEAD `3de87f3` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. prod 직접 curl(`https://webapp-9i0.pages.dev/`) → `exit 56`(egress 프록시 CONNECT tunnel 403, 기존 인지된 제약) → Playwright도 동일 제약 예상되어 정적 코드 감사로 대체(과거 Area1/Area3 표준 폴백). Area 3 **52회차** — 직전 Area3(`fb9127f`, 08-07T03:35, 51회차) 이후 `git log fb9127f..HEAD -- src/scripts src/pages src/layout index.tsx src/routes` = **7커밋**(주문 목록 SSOT+필터칩+합계바+드릴다운·담당자 P4/P5 시리즈 4개·관계사 매입제외·EP1852 원가정정). **⚠️ 컨테이너 git 이력 재구성 아티팩트 재관찰**(Area5 52회차 line 53과 동일 계열): `git merge-base --is-ancestor fb9127f HEAD` = NOT-ANCESTOR, `ae703eb`가 부모 없는 root(전체 1401파일 스쿼시) — 파일트리 자체는 정상(tsc clean·routes/scripts 정상 존재), `git log fb9127f..HEAD`의 7커밋 나열 자체는 유효(정상 순차 커밋 그래프 위에서 계산됨).
> - **`39f16b5`(주문목록 SSOT+칩+드릴다운+합계바, 475줄) UX 체크리스트 전수**: 빈 상태("주문이 없습니다" 유지)·로딩표시(#421 기존 포맷 재사용)·에러 메시지·칩 escapeHtml(`chip()` 헬퍼 내 적용 확인)·모바일 반응형(flex-wrap 전부) 전부 clean. 정렬 라벨이 CLAUDE.md 규약("최신순만 쓰면 기준 불명확") 그대로 "주문일 최신순"/"등록 최신순"으로 기준 명시 — 모범사례. **자체 검증 커밋**(tsc/build/smoke 110/110/entity감사/sort-audit/browser 확인 명시) net-new UX 결함 0.
> - **🔴 net-new XSS 2건, 즉시 수정 완료(escapeHtml 추가 = 안전 자동수정 화이트리스트)**: ① `a6b8e1b`(#604 담당자 셀렉트)의 `orderForm/intake.js:135-136 ofLoadSalesReps()` — `<option>` 텍스트에 `e.name`/`e.department`(employees 자유입력 마스터, HR ADMIN/MANAGER 편집 가능)를 escapeHtml 없이 innerHTML 삽입. 같은 파일군의 형제 컨벤션(`orderForm/client.js`·`finishing.js`가 전부 escapeHtml로 `<option>` 채움)과 대조해 부분누락 확정(A-024/A-025급 패턴) — `escapeHtml()` 래핑 적용. ② `5b42896`(담당자별 실적 리포트)의 `reports.js:261-262 loadSalesRepStats()` — `r.rep_name`/`r.department`를 escapeHtml 없이 innerHTML 삽입. **같은 파일 바로 위 `loadDesignerStats()`(:204)가 로컬 `esc()` 별칭으로 `designer_name`을 이미 escape**하는 확립된 컨벤션인데 새로 추가된 형제 함수만 누락(전형적 "같은 파일 부분 롤아웃" A-024/A-025 클래스) — `esc()` 래핑 적용. 둘 다 `node -c` 문법 검증 + `npm run verify`(tsc+build) PASS + `npm run check:dom`(기존 baseline 5건 무관, 회귀 0).
> - **`a6b8e1b`(담당자 폼) 나머지 검토**: edit-mode 복원과 옵션로드 레이스를 `dataset.pending`으로 해소한 설계 확인(주석에 명시, 실증 코드 정합) — 안전. 미지정 허용(서버가 로그인유저로 채움)도 UX상 강제선택 회피로 적절.
> - **🔴 net-new #606(S, feature, "백엔드 먼저·화면 나중" 4번째 관찰)**: `5963719`가 신설한 `GET /api/reports/entity-attribution-audit`(담당자 소속≠주문 청구법인 불일치를 담당자별로 접어 반환하는 완성된 리포트, `by_rep`+`capped` 플래그 포함)이 `grep -rln entity-attribution-audit src/scripts src/pages`=0 — 프론트 소비처 없음. 같은 커밋군이 바로 옆에 "담당자별 실적" 패널을 붙였으므로 패널 하나 추가하는 비용이 낮다는 점을 이슈에 명시. 커밋 자체가 "막지 않고 보여만 준다"(모니터링 목적)라 순수 내부진단 도구일 가능성도 코멘트에 남김 — owner가 close/구현 결정.
> - **#604 부분진행 확인 + 코멘트**: 이슈가 제안한 3항목(폼드롭다운/집계뷰/목록컬럼+필터) 중 **폼드롭다운(`a6b8e1b`)·집계뷰(`5b42896`) 2항목은 이번 churn으로 이미 반영**, 목록컬럼+필터만 잔존(`grep sales_rep src/scripts/orders.js`=0 재확인) — 이슈에 진행상황 코멘트 남김(원 증상 "담당자 변경해도 화면에서 확인 불가"는 아직 유효, 남은 범위만으로 재정의하거나 close 여부 owner 판단 요청).
> - **`5963719`/`7fd1334`/`ae703eb` 나머지**: 5963719는 위 #606 외 프론트 신규 UI 없음(create.ts 폴백 로직만, UX 영향 없음). 7fd1334(관계사 매입제외)는 체크박스 라벨만 "법인간거래 포함"→"법인간거래·관계사 포함"으로 갱신, tooltip 텍스트는 미갱신이나 사소(코드스타일급, 이슈화 안 함). ae703eb는 squash 경계에 걸려 개별 diff 확인 불가하나 커밋 메시지상 데이터 정정(원가) — 프론트 영향 없음(cost 페이지는 이번 churn 목록에 없음).
> - **push 중 레이스 — `4a94013`(같은 세션군, PO/견적/입고에 동일 목록UX 확산) 착륙 확인**: 커밋 완료 후 push가 non-fast-forward로 거절돼 재fetch하니 병렬 세션이 방금 이 패턴을 PO·견적·입고 3페이지로 확산한 커밋을 이미 origin에 반영 — rebase로 흡수. 이 커밋이 정확히 오늘 발견한 XSS 클래스(칩/합계바 렌더)를 다루므로 안전성만 빠르게 재확인: `shell.js`에 신설된 공용 `window.dsListUx`가 칩을 **innerHTML 문자열조합 대신 `document.createTextNode`로 DOM 구성**(주석 "라벨의 따옴표·꺾쇠가 사고를 내지 않는다" 명시) — 오늘 발견한 클래스를 아키텍처로 원천봉쇄. `git show 4a94013 -- purchaseOrders.js quotations.js receiving.js orders.js`에 신규 innerHTML 삽입 0건(전부 공용 렌더러 경유) — net-new XSS 없음. 전체 재검증은 다음 Area 사이클(들)이 이어감(line 307 원칙 — 목록만 나열하지 않고 직접 diff 확인함을 기록).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **6**(#601~#605 + 신규 #606) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클은 기존 codify된 두 standing scan(SPA innerHTML free-text XSS 자동스캔·백엔드먼저·화면나중)의 실전 재현만(신규 규칙 불요, #606이 4번째 관찰로 그 패턴의 신뢰도를 강화).
> - 신규 이슈 1건(#606, issue-only) + 코멘트 1건(#604 부분진행), 자동수정 2건(XSS escapeHtml 추가, verify PASS), done-sync: new 6(+1)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-08T15:16):**
> - **방법**: `git fetch origin main`(HEAD `d3debaa` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 2 **60회차** — 직전 Area2(`7670e39`, 08-06T21:33, 59회차) 이후 `git log 7670e39..HEAD -- src/routes src/scripts migrations index.tsx src/layout src/pages` = **3커밋**(`451f611` 주문 담당자·`7fd1334` 관계사 매입제외 — 둘 다 Area1 58회차/Area6 57회차가 코드 렌즈로 이미 전문 검토 완료 + `ef57bf6` 단가 백필은 `docs/`·`.ai-sync/changelog.jsonl`만 변경해 라우트/스크립트 무터치) — 코드품질 렌즈로 신선한 신규 churn이 사실상 0.
> - **전수 standing scan 재실행(churn 부재라 코드베이스 전체 재확인으로 대체)**: ① `npm run audit:entity` — 검사 127파일·entity테이블 SELECT 61·**누락 0**. ② N+1 루프 패턴(`for(...of...)` 내부 `await DB.prepare`) 전수 재grep, 미확인 후보 11곳 직접 Read — `printEvents.ts:625`(카드 매칭 루프, evtResolvedList=파일명 기반 최대 소수건)·`cards/lifecycle.ts:365`(orderId 수<<card 수, 코드 주석에 명시된 의도적 설계)·`orders/operations.ts:189`/`po-special.ts:183`(주문 복제 시 원본 items 수 = bounded 소량)·`bank.ts:693`(바로빌 등록계좌 수, 실무상 개사 몇 개)·`kakao.ts:227/245`(고정 key 배열 6~8개)·`items.ts:1705`(그룹 내 원단 수, 관리자 명시 일괄작업)·`items.ts:515`(스펙조합 곱, 관리자 배리언트 생성)·`aiAnalysis.ts:122`(100건 상한 가드 존재)·`insuranceReports.ts:178`(당월 재직 직원 수) — 전부 데이터-스케일 무관 bounded 루프(FP), net-new 0. ③ authMiddleware recursive 커버리지(`find src/routes -name '*.ts'`) — 미매치 7파일(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전수 확인 = 전부 기존 codify된 FP 클래스(공개 unsubscribe 토큰·`Map.get()` 오매치·agentKeyMiddleware·requireRole 내장·scoped self-token), net-new 0.
> - **open≠unfixed 재확인**: #601 대상 `orders/update.ts`에 `return_items` 여전히 0매치(미픽스, 정상 open 유지).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **5**(변동없음) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — 이번 사이클은 신규 패턴 발견 없이 기존 standing scan 카탈로그로 전수 재검증만 수행.
> - 신규 이슈 0건, 자동수정 0건(코드품질 렌즈 신선 churn 부재 + 전수 재스캔 clean), done-sync: new 5(변동없음)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-08T09:16):**
> - **방법**: `git fetch origin main`(HEAD `f2d8281` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. prod 직접 curl(`/api/notifications/nav-badges`) → `exit 56`(egress 프록시 CONNECT tunnel 403, 기존 인지된 제약, #453과 동일)이라 GitHub Actions 기록으로 대체. Area 1 **58회차** — 직전 Area1(`fbbb5a4`, 08-06T15:21, 57회차) 이후 `git log --since 2026-08-06T15:21 -- src/routes src/scripts migrations index.tsx src/layout src/pages` = **2커밋**(`7fd1334` 관계사 매입제외·`451f611` 주문 담당자 필드) — 둘 다 Area6 57회차가 이미 코드 렌즈로 전문 검토 완료(clean + #604 issue-only), Area1은 프로덕션 헬스 렌즈(배포·CI·백업)만 신선.
> - **deploy.yml 전수 확인(창 내 25런, `31077072581`~`31206362525`)**: 전부 `completed success`(Typecheck→Build→Deploy→Smoke 전 구간, HEAD `f2d8281`까지 포함) — 배포 실패 0건.
> - **🔴 net-new #605(S, improvement, 인프라 신뢰성)**: `backup.yml`(Daily D1 Backup, `timeout-minutes: 10`, 재시도 없음) 최근 30일 run 30건 전수 확인 — 정상 실행은 26~48초인데 **2건만 타임아웃까지 채우고 cancelled**(`2026-08-06T18:20:07Z` 15분3초·`2026-07-28T18:06:53Z` 10분25초, 약 6.7% 빈도). 둘 다 다음날은 정상 success로 자동회복(코드 회귀 아님, CF API 지연 추정 — CLAUDE.md 기존 "CF-internal transient" 계열과 동일 성격)이나 **daily 파일이라 그날치 백업 자체가 R2에 미존재**로 남음(다음날 성공이 그 공백을 메꾸지 않음) — 재해복구 시 특정 일자 타겟팅이 필요한 상황에서 대응 불가 리스크. 수정 방향 = `wrangler d1 export`/`r2 object put` 단계에 재시도 루프(3회·backoff) 추가. `.github/workflows/*.yml` 변경은 안전 자동수정 화이트리스트 밖 → issue-only.
> - **backup.yml 최신 상태**: 마지막 run(`31203429471`, 2026-08-07T17:40:59Z) success, ~24h 간격 정상 재개.
> - **e2e.yml**: 최신 run 여전히 2026-06-22(`disabled_manually` 상태 지속, 변동 없음). **verify.yml**: 열린 PR 0건(`list_pull_requests(state:open)` 직접 확인) → 실행 대상 없음.
> - **open 이슈 4건(#601~#604) 재확인**: `list_issues(OPEN,auto-improve)` 실측 그대로 4건, Area6 57회차 이후 변동 없음(owner 리뷰 대기 중).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **5**(#601·#602·#603·#604 + 신규 #605) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — #605는 기존 codify된 "CF-internal transient 배포실패"(Area1 라인 근처) 패턴과 유사 계열이나 **cron 백업 워크플로우의 재시도 부재**라는 새 각도라 별도 이슈로 등록, SKILL 신규 규칙은 다음 재발 시 codify 검토(1회차 관찰이라 보류).
> - 신규 이슈 1건(#605, issue-only), 자동수정 0건, done-sync: new 5(+1)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-08T03:17):**
> - **방법**: `git fetch origin main`(HEAD `6ef00a7` = origin/main 일치, 워킹트리 clean, detached) 후 `npm ci`(node_modules 0→81), `npx tsc --noEmit` clean. Area 6 **57회차** — 직전 Area6(`878200f`, 08-06T04:05, 56회차는 아님·이번 anchor는 Area5 52회차 마커 `878200f`, 08-07T06:28 UTC=15:28 JST) 이후 `git log --since 2026-08-07T15:27 -- src/routes src/scripts migrations index.tsx src/layout src/pages` = **2커밋**(`7fd1334` 관계사 매입제외·`451f611` 주문 담당자 필드) — Area5가 이미 리뷰한 `82b9e3e` 이후 착륙분으로, 어느 Area도 아직 못 본 최신 churn.
> - **line 307 원칙("churn 나열≠개별 검토") 적용 — 두 신선 커밋을 직접 Read**: 다음 Area(1)가 오기 전에 Area6가 교차 렌즈로 먼저 검토.
> - **`7fd1334`(관계사 매입제외) 전문 검토**: `excludeInternalClientsSql`→`excludePurchaseNonCounterpartiesSql`로 전환한 매입계열 집계 6개 라우트(`financialReports.ts`·`accounts-payable.ts` 4곳·`purchaseOrders/core.ts` 2곳·`po-queries.ts` 3곳) `grep -rn "excludeInternalClientsSql\|excludePurchaseNonCounterpartiesSql" src/routes src/pages src/scripts` 전수 재확인 — **구 함수명 잔존 0건**(형제-비대칭 없이 전면 전환, A-024급 부분롤아웃 패턴 아님). `clientIdColumn` 인터폴레이션은 전부 개발자 리터럴(`'c.id'`/`'supplier_id'`)이라 SQL 인젝션 경로 아님(값도 상수 배열 `[1655]`, bind 아닌 리터럴 인라인이나 요청 입력 무관). AR 쪽(`arPolicy.ts`)에 신 함수가 섞여들지 않았는지 별도 확인 — 0건, 주석 경고("AR엔 쓰지 말 것")대로 격리됨. **clean, net-new 0**.
> - **`451f611`(주문 담당자 sales_rep_id) 전문 검토**: 마이그 0523 컬럼존재성/포지셔널 INSERT 정합 확인(`orders/create.ts` 30→31 바인드 1:1). entity 격리 관점 — `employees.entity_id`(0148) 존재하나 `sales_rep_id`는 body 신뢰로 cross-entity 지정 가능함이 **의도**(마이그 코멘트 자체가 "같은 담당이 시기별로 다른 법인 소속" 사례를 배경으로 명시 — entity 종속 아님이 기능 목적). `PUT /:id`는 기존 `requireEditOrRole('/orders','MANAGER')` 게이트 그대로라 권한 회귀 없음. **🔴 net-new #604(S, feature, 백엔드먼저·화면나중)**: `orders/core.ts` 목록·상세·인보이스 3개 엔드포인트가 `sales_rep_name`/`sales_rep_dept`를 신규 JOIN 응답 필드로 노출했는데 `grep -rln sales_rep src/scripts src/pages` = 0 — 프론트 소비처 전무. 동일 클래스 3회 누적(fixedAssets.ts #77·recurring-candidates #596·이번 #604)이라 SKILL Area 3 절에 standing scan으로 codify(아래 참조). issue-only(신규 UI=정책상 자동수정 금지).
> - **마이그 번호 중복 재확인**: 기존 5쌍(0327·0412·0416·0420·0453) net-new 0. 신규 `0523` 고유.
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-absorbed 1건, REVIEW 0건 — 삭제대상 1건(임계 30 미달), 백로그 등록 불요.
> - **open≠unfixed 재확인**: #601 대상 파일(`orders/update.ts`)이 `451f611`에 포함(sales_rep_id COALESCE 라인만 추가, `DELETE FROM order_items`/`return_items` 정리 섹션은 무변경) — `grep -n return_items src/routes/orders/update.ts`=0 재확인, 잔존 그대로. #602·#603 대상 파일(`cards/queries.ts`·`issueStatus.js`)은 이번 churn과 무관, verified-once 캐시 유지.
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 실측 — open **4**(#601·#602·#603 + 신규 #604) · `reason:completed` **524**(변동없음) · `reason:not_planned` 4 + `reason:duplicate` 2 = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: Area 3 절에 "백엔드 먼저·화면 나중" standing scan 신규 codify(3회 누적 관찰 — fixedAssets.ts·recurring-candidates #596·sales_rep_id #604) — 신규 마이그+API 응답필드 노출 churn마다 프론트 소비처 0건 여부를 명시 점검하도록 레시피 추가.
> - 신규 이슈 1건(#604, issue-only), 자동수정 0건, done-sync: new 4(+1)·done 524(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

## ✅ Approved / 👀 Reviewed (owner 피드백 수신)

> 없음 — 이전 유일 reviewed 건(I-060/#372 CSV 잘림경고)은 06-12 owner 옵션1로 구현·close 완료 → Done 이관 (Area 6 43회차, 2026-07-16 재확인).

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기. (open **실측 9건** — Area 2 61회차, 2026-08-10.)

| Issue | 제목 | 영역 | 라벨 | 상태 메모 |
|-------|------|------|------|-----------|
| #609 | unitConvert.ts toBase/formatStock 0호출 — write-path 3곳(scan/inventory/po-receive) pack_size 환산 각자 인라인 재구현, #462 재발위험 | Area 2 | improvement,S | issue-only, 신규(#609) |
| #608 | 쓰기경로 회귀 방지 3중 장치 중 실제 배포경로엔 전무 — verify.yml 카나리는 생성 이래 0회 실행 | Area 1 | improvement,medium | issue-only, 신규(#608) |
| #607 | purchase-requests CSV export가 buildPrFilter SSOT 미채택 — 다중상태 필터 드리프트(latent, 프론트 미도달) | Area 4 | bug,S | issue-only, 신규(#607) |
| #606 | GET /api/reports/entity-attribution-audit(0524) — 프론트 소비처 0건, "백엔드 먼저·화면 나중" 4번째 사례 | Area 3 | feature,S | issue-only, 신규(#606) |
| #605 | Daily D1 Backup 워크플로우 — CF API 지연 시 10분 타임아웃으로 해당일 백업 누락(재시도 없음) | Area 1 | improvement,S | issue-only |
| #604 | orders.sales_rep_id(0523) — 폼드롭다운·집계뷰는 후속커밋으로 반영됨(코멘트 참조), 목록컬럼+필터만 잔존 | Area 6 | feature,S | issue-only, 부분진행(Area 3 코멘트) |
| #603 | cards "지시 현황" 개정필요 큐 — 출고 완료된 카드도 needs_reissue=1이면 영구 잔류(자기-클리어 없음) | Area 4 | bug,S | issue-only |
| #602 | cards "지시 현황" 탭 — API 실패 시 "누락/개정 없음"으로 오표시(silent catch), 조치필요 배지도 숨겨짐 | Area 3 | bug,S | issue-only |
| #601 | orders/update.ts 라인재작성 경로가 return_items.order_item_id(NOT NULL RESTRICT FK) 정리 누락 — 반품 등록된 주문 편집 시 100% 500 | Area 2 | bug,medium | issue-only |

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
