# Improvement Backlog
<!-- last_run_area: 6 -->
<!-- last_run_at: 2026-08-31T16:10:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **12** (`list_issues(state:OPEN,label:auto-improve)` 실측, 변동없음: #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **532** (`search_issues(reason:completed)` 리터럴 쿼리로 재실측, 확정 — Area 3의 598 이상신호는 자연어 시맨틱 쿼리 아티팩트로 결론, 하단 Area 6 로그 참조) |
| ❌ rejected | **6** (`not_planned` 4 + `duplicate` 2, 재확인, 변동없음) |

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

> **Area 4 데이터 정합성 (2026-08-31T03:46):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `49c2efc`), `git fetch origin main`(이미 최신) → `git checkout main && git reset --hard origin/main`(HEAD `49c2efc`). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm run build` 성공.
> - **churn 확인(앵커 = 직전 Area4 방법 라인 HEAD `f8ab48b`)**: 웹앱 범위(`-- src migrations scripts .github`) diff **3커밋**(`5dc788b`·`49fd79f`·`8ef1c6b`) — Area1~3·6이 이미 각자 렌즈로 정독 완료한 동일 3건, 신규 마이그레이션 0건. `5dc788b`(IA JSX 스케일링)·`49fd79f`(신규 `/inventory#tab=tx`, read-only GET 2종)는 데이터정합성 write-path 표면 없음(후자는 조회 전용). `8ef1c6b`(재고 출고/환원 write-path)만 이 렌즈 정독 대상.
> - **`8ef1c6b` 데이터정합성 렌즈 직독(`stockShip.ts` 재구성)**: `restoreStockLinesOnUnship`이 `idx_inventory_tx_unique_ref`(reference당 OUT 1행 UNIQUE) 위반을 피하려 보정 IN행 대신 **OUT행 자체를 DELETE**하는 설계는 commit message·`findShipOutRow` 주석과 일치해 의도적·정합 — 단, **함수 자신의 JSDoc(구 `:119-120`)이 정반대로 서술**("원장은 지우지 않는다 — 환원도 행으로 남긴다(IN)... 재출고 시 순합이 0")돼 있어 같은 파일 27줄 안에서 자기모순. 실제 코드는 `DELETE FROM inventory_transactions WHERE id=?`(구 `:146`). 이 문서는 이 커밋이 방금 고친 "UNIQUE 위반→재출고 500"을 설명하는 척하며 정반대 설계(IN 보정행 유지)를 정본처럼 서술 — 향후 그 문서를 신뢰해 "감사 목적으로 IN 보정행을 추가"하는 수정이 들어오면 **재출고 UNIQUE 위반 500이 재발**하는 회귀 씨앗. 코드 자체(런타임 동작)는 정합이라 issue 아닌 **안전 자동수정**(주석 전용, 동작 무변경, `deductStockLinesOnShip`/`restoreStockLinesOnUnship` 호출부 4곳·시그니처·바인딩 전부 무변경) 판정 → 즉시 정정 커밋(`6da6a72`).
> - **비-batch write-path 재확인(#477/#480 클래스 후보 배제)**: `deductStockLinesOnShip`/`restoreStockLinesOnUnship`이 주문 상태변경 `c.env.DB.batch()`와 **별도 await**로 실행돼 원자성이 깨지는 것처럼 보이나, `orders/queries.ts:312`·`shipments.ts:1223`에 **이미 명시적으로 문서화된 의도적 트레이드오프**("read-after-write 순차의존이라 batch 불가, 유지") — 재보고 대신 기존 결정 재확인만. 실패 시나리오도 자가치유 확인: `findShipOutRow` 멱등 가드가 있어 부분실패 후 재시도가 중복차감/유실 없이 수렴(라인별 OUT행 존재 여부로 재계산).
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 3: 신규 비-FK `*_id` 참조 컬럼 sweep** — `git diff --stat 49c2efc..HEAD -- migrations` 신규 마이그 0건 → 이 스캔의 신규 후보 자체가 발생 불가.
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit`** — 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **CI 헬스**: `deploy.yml` 최근 30런 전부 `conclusion:success`(`8ef1c6b`·`49fd79f`·`49c2efc` 포함 최신 커밋까지).
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues(reactions:>0)` **0건**(승인 대기 유지). Area4 소관 #614(`designer_intakes` 참조가드 누락)·#615(재고 rebase 재현불가) 재확인 — 이번 churn이 손댄 파일과 무관, 무변화.
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · done **532**(표기 유지 — Area6 재동기화 대기중, Area3 로그 참조) · rejected **6**(변동없음, 재확인 생략).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건, **자동수정 1건**(A-026, `8ef1c6b`의 자기모순 JSDoc 정정 — 안전: 주석 전용·동작 무변경), done-sync: open 12(변동없음)·done 532(표기 유지)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-30T21:44):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `047a1cd`), `git fetch origin main`(이미 최신) → `git checkout main && git reset --hard origin/main`(HEAD `047a1cd`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `564c174`)**: 웹앱 범위(`-- src migrations scripts .github`) diff **3커밋**(`5dc788b`·`49fd79f`·`8ef1c6b`) — Area2가 이미 같은 3커밋을 코드품질 렌즈로 정독 완료. `5dc788b`는 IA JSX(재단 스케일링)만 건드려 UX 렌즈 밖. `8ef1c6b`(재고 차감/환원 write-path)는 프론트 표면 변경 0(백엔드 전용) → UX 렌즈 밖. `49fd79f`만 UX 렌즈 대상 — `/inventory#tab=tx` 신설 탭(전 품목 증감내역, 필터·페이징·CSV), 정확히 Area3가 반복 지적해온 클래스(#606/#618/#619 "백엔드 먼저·화면 나중")의 **반례**라 직접 정독.
> - **`49fd79f` UX 렌즈 직독(`inventoryTx.js` 287줄 + `inventory.ts` +117줄)**: ① **로딩 상태** — `invTxLoad()`가 axios 호출 전 tbody에 스피너("로딩 중...") 즉시 렌더(`:59`). ② **빈 상태** — `rows.length===0`일 때 "해당 조건의 증감내역이 없습니다" 안내 렌더(`:70`, colspan 정합). ③ **에러 상태** — `.catch`가 콘솔 로그 + tbody에 "불러오기 실패" 사용자 메시지(`:102-105`, 백지 방치 없음). ④ **필터 완전성** — 기간·유형·분류·창고·참조유형·검색(품목명/코드) 6종 + CSV 내보내기, 기존 품목별 이력 모달(50건 고정)보다 상위호환. ⑤ **페이지네이션** — 이전/다음 버튼 + 현재/전체 페이지 표시, `disabled` 경계 처리(`invTxRenderPagination`). ⑥ **cross-page 배선** — 기존 품목별 거래이력 모달에 "전체 내역" 버튼 신설(`inventory.ts` diff) → `invTxOpenForItem()`이 `window.__invTxModalItem`(모달 오픈 시 `viewTransactions`가 세팅, `inventory.js` diff)을 읽어 tx탭으로 전환 + 품목고정 + 기간해제(`invTxConsumePending`) — Area3가 반복 검증하는 "실제 배선 확인"(콜백 도달성 3단) 통과, 유령 버튼 아님. ⑦ **HTML↔JS id 와이어링** — 신규 `getElementById` 대상(`invTxDateFrom` 등) 전부 페이지 템플릿에 실재 + 헬퍼 전부 `if(!el){console.warn...return}` 널가드(CLAUDE.md 패턴). ⑧ **더블클릭/showConfirm 오용 체크** — 이 탭은 read-only(axios.get만, delete/post 0건) → 해당 클래스 무관. **UX 관점 결함 0건, 오히려 기존 갭(#606/#618/#619 클래스) 정면 해소 사례**.
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음, 신규 `/api/inventory/transactions` tie-break 정상), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 2: "백엔드 먼저·화면 나중" 패턴** — 이번 churn의 유일 신규 API(`GET /api/inventory/transactions`, `/transactions/export`)는 **같은 커밋에서 프론트 소비처(`inventoryTx.js`)까지 완결** → 이 패턴의 신규 후보 자체가 없음(기존 open #606/#618/#619 3건은 이번 churn과 무관 파일이라 무변화).
> - **standing scan 3: axios→백엔드 라우트 존재성** — `inventoryTx.js` 신규 axios 호출 4종(`transactions`·`transactions/export`·`meta/categories`·`storage-zones`) 전부 `src/routes`에 실재 확인(`meta/categories`·`storage-zones`는 기존 라우트, 신규 아님) — dead button 0건.
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues(reactions:>0)` **0건**(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화 — 이상 신호**: `search_issues(reason:completed)`가 이번 사이클 **598**을 반환(직전 12회 연속 532로 일치하던 것과 어긋남). 같은 세션에서 쿼리 문구 2종(전체 쿼리스트링 vs `owner`/`repo` 파라미터 분리)으로 재시도해도 동일하게 598 — 우연한 오타가 아님. 이 MCP `search_issues`는 도구 설명상 "자연어 시맨틱 매칭"이라 `reason:completed` 리터럴 필터가 아닐 가능성 있음(카운트 근거 자체가 예전부터 근사치였을 수 있음). **rejected 카운트에는 재확인 생략**(대상 무변경 원칙 유지, done만 이상신호) → done 통계는 이번엔 **532 표기 유지**하되 절대값 재확정은 다음 **Area 6**(자기진화, backlog↔GitHub 동기화 소관)에 위임 — 이 필드가 시맨틱 검색이라 신뢰 불가하면 카운팅 방법 자체를 codify해야 함.
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, grep 검증 — 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 8건 → 이번 로그 추가 후 9건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(3커밋 중 UX 렌즈 대상은 1건뿐이었고 로딩·빈상태·에러·필터·페이징·cross-page 배선·id와이어링 전부 clean — 오히려 반복 지적 패턴의 해소 사례), 자동수정 0건, done-sync: open 12(변동없음)·done 532(표기 유지, 하단 이상신호 참조)·rejected 6(변동없음). **backlog↔GitHub 카운트 방법 재검증**을 다음 Area 6에 인계. 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-30T15:47):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `8ef1c6b`), `git fetch origin main`(이미 최신) → `git checkout main && git reset --hard origin/main`(HEAD `8ef1c6b`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `d745bdb`)**: 웹앱 범위(`-- src migrations scripts .github`) diff **3커밋**(`5dc788b`·`49fd79f`·`8ef1c6b`) — `5dc788b`는 IA JSX(재단 스케일링, `scripts/cut/*`)만 건드려 코드품질 렌즈 밖. 나머지 2건은 재고 출고/환원 write-path를 건드리는 실질 커밋이라 전문 직독.
> - **`8ef1c6b` 직독(카드/주문 3개 출고경로 + shipment 취소경로에 재고 차감/환원 추가, `stockShip.ts` 재구성)**: `selectShippableLines`/`findShipOutRow` 공용화로 차감·환원이 같은 집합·같은 키를 보게 함(형제-불일치 방지, #462 클래스 자기예방). `entity_id`는 4개 호출부 전부 `order.entity_id || getEntityId(c) || 1` — 이 폴백 패턴은 이미 코드베이스 157곳에 존재하는 기존 관용구(`grep -rn "getEntityId(c) || 1" src`)라 net-new 아님. `restoreStockLinesOnUnship`이 OUT 원장행을 삭제하는 설계는 `idx_inventory_tx_unique_ref`(reference당 OUT 1행 UNIQUE) 제약과 재출고 시 500 충돌을 피하기 위한 것으로 주석에 근거가 명시돼 있고, `npm run test:ship-stock`(신설 e2e 20건: 출고·환원·재출고·중복출고·shipment취소)이 동반됨 — **issue 사안 아님, 이미 검증된 수정**.
> - **`49fd79f` 직독(신규 `GET /api/inventory/transactions`·`/transactions/export`, `src/routes/inventory.ts` +154줄)**: `inventoryRouter.use('/*', authMiddleware)` 라우터 레벨 적용 확인(`:18`) → 신규 2엔드포인트 전부 커버, export는 `requireRole('ADMIN','MANAGER')` 추가 게이트. `buildTxFilter`가 `entityFilter(c,'t')` 사용(entity 격리) + 모든 조건절 파라미터 바인딩(LIKE 검색 포함 `%${search}%`는 바인드 파라미터로 전달, SQL 삽입 아님). `ORDER BY t.transaction_date DESC, t.id DESC` tie-break 포함(CLAUDE.md 규칙 준수). `LIMIT`은 `Math.min(Math.max(...,1),200)`로 clamp. 신규 HTML id 15개(`invTxDateFrom` 등) 전부 `src/scripts/inventoryTx.js`에서 소비 확인 — 직접 `getElementById` 4개 + `push()`/`invTxSetDate()` 헬퍼 경유 4개, 헬퍼 내부에 `if(!el){console.warn...return}` 널가드 존재(CLAUDE.md "HTML↔JS Silent Fail 방지" 패턴 준수). `escapeHtml` 적용 전수 확인(`item_name`·`category`·`notes`·`handled_by_name` 등 렌더 지점 전부) — XSS sink 없음. **clean**.
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음, 신규 `/transactions` 엔드포인트 포함).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음, 신규 엔드포인트 tie-break 정상 반영), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit`** — 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **CI 헬스**: `deploy.yml` 최근 30런 전부 `conclusion:success`(`8ef1c6b`·`49fd79f` 포함 최신 커밋까지 전부 green). `verify.yml` 카나리 `list_workflow_runs` totalCount **0**(변동없음, #608와 완전 일치).
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `issue_read` 전 12건 `+1` 리액션 **0건**(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 대상 무변경).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 도달 → 트림 실행.
> - 신규 이슈 0건(3커밋 중 2건은 신설 e2e 20건 동반한 검증된 재고 write-path 수정으로 entity_id·authMiddleware·SQL바인딩·XSS이스케이프·ID와이어링 전부 clean, 1건은 IA축이라 렌즈 밖), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-08-30T09:44):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `24a40b1`), `git fetch origin main`(이미 최신) → `git checkout main && git reset --hard origin/main`(HEAD `24a40b1`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `d745bdb`)**: `git log d745bdb..HEAD` 전체 5커밋(Area2~6, 08-29~08-30) diff가 **`IMPROVEMENT_BACKLOG.md`/`IMPROVEMENT_BACKLOG_ARCHIVE.md`만** — 웹앱 범위(`-- src migrations scripts .github`) 실질 churn **0**(각 사이클이 스스로 기록했듯 그 사이클들 자체가 이미 churn 0으로 판정). 신규 마이그/라우트 0건 → smoke 맹점 4축(프론트실행·DROP write-path·agent-FK·한글리터럴) 전부 신규 트리거 없음.
> - **egress 제약 재확인**: `curl https://webapp-9i0.pages.dev/*` 3회 전부 `agent-proxy connect_rejected`(조직 정책, 기존 제약과 동일) — prod 직접 fetch 불가, CI(`deploy.yml`) smoke 스텝이 유일한 prod 건강 근거.
> - **CI 헬스 실측**: `deploy.yml` 최근 30런 전부 `conclusion:success`. 최신런(1600, `24a40b1`) 잡 스텝 전수 확인 — Typecheck·Build·Self-tests·Deploy·**Smoke test (production)** 전부 success(18:45:59~18:46:14 완주). `backup.yml` 최근 10런 전부 success(최신 105회차, `24a40b1`). `verify.yml` 카나리 `list_workflow_runs` totalCount **0**(변동없음, #608와 완전 일치).
> - **standing scan**: `npm audit` **11건**(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치(net-new 0). `npm run branch:clean` → SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues(reactions:>0)` **0건**(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음, 전부 재확인).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 5커밋 전체가 backlog/archive 문서뿐이라 prod-health 렌즈의 신규 표면 자체가 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(웹앱 churn 0, CI 전부 green, standing scan 2종 net-new 0, open/done/rejected 전부 GitHub 실측과 무편차), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-08-30T03:44):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `bddb334`), `git fetch origin main`(`207078c..bddb334`, 이미 최신) → `git checkout main && git reset --hard origin/main`(HEAD `bddb334`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(범위 축 2종, 앵커 = 직전 Area6 방법 라인 HEAD `14ab556`)**: 웹앱 범위(`-- src migrations scripts .github`) diff **0커밋** — Area1~5가 이미 전량(3커밋, avg-cost 백필·ia-deploy 버전게이트·뭉치전표 LEFT JOIN) 소진 완료. 비-웹앱 범위(`-- LogWatcher IllustratorAutomat caps-worker workers queue`) diff **2커밋**(`2cb65aa`·`5a463f6`) — `grep -c` 백로그+아카이브 전수 대조 결과 **어느 로그에도 해시 언급 0건**(「범위 축」62회차 사각지대 재현) → 우선 정독 대상 확정.
> - **`2cb65aa` 심층 정독(축2 디자이너 JSX, 재단 패널 파일명 규약 변경 + A5 스티커 목업, 211줄)**: 파일명 접두를 `(자재+후가공)내용` → `거래처-(자재+후가공)내용`으로 변경(A0 규약과 정렬) — 커밋 메시지가 "print-done 매칭 불영향"을 주장해 **직접 코드 대조로 검증**: `printEvents.ts:106` `resolveCard()` 1차 매칭은 `((?:E\d+-)?\d{8}-\d{3})-(\d{3})` 정규식이 **비anchored**(위치 무관, 2026-07-31 already codified: "정보 우선형 파일명은 키가 꼬리에 온다")라 접두 변경과 무관 — 2차 매칭은 파일명 전체 일치이나 그 학습 값(`workbench.ts` absorb) 자체가 `pairBaseName()`이 만든 문자열을 그대로 저장하므로 양쪽이 항상 같은 생성 규칙을 공유 — **주장 사실 확인, 회귀 없음**. `SHELL_VERSION` 갱신 규율(주석에 명시)도 확인.
> - **`5a463f6` 확인**: `2cb65aa`의 셸 3파일(`index.html`/`cut-main.js`/`main.js`) 변경에 맞춰 `SHELL_VERSION`을 0.5.2→0.5.3으로 올린 자기교정 커밋(2026-08-19 62회차 codify된 버전-드리프트 게이트가 실제로 작동한 사례) — `npm run audit:ia-jsx` 재실행 결과 축1~5 전부 NAS 미연결로 판정 제외(변동없음, 이 샌드박스 상시 제약), 드리프트 자체는 이 커밋으로 이미 해소.
> - **standing scan 1(closed≠fixed 재확인, #473)**: 이번 사이클 churn 2건 모두 CEP 패널 파일이라 12개 open 이슈의 대상 파일(entity_id/IDOR/LIKE매칭/마이그 등 서버 라우트·SQL)과 무관 — 재검증 스킵 근거 명확(파일 교집합 0).
> - **standing scan 2(open≠unfixed 거울, close-pending 캐시)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치) — 12건 전부 이전 사이클(Area1 2026-08-28T21:47·Area2~5 2026-08-29)이 코드 재grep으로 잔존 확인한 것과 **churn 0**(웹앱 범위 diff 0)이므로 캐시 신뢰(재검증 스킵), 신규 fixed-in-tree 후보 없음.
> - **브랜치 위생(읽기전용)**: `npm run branch:clean` → SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 10건 → 이번 로그 추가 후 11건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(비-웹앱 축 2커밋 모두 정독 완료 — 1건은 커밋 자신의 매칭-불영향 주장을 코드로 검증해 사실 확인, 1건은 버전게이트 자기교정 확인, 웹앱 축 churn 0으로 12개 open 이슈 전부 파일 교집합 없어 캐시 신뢰), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-08-29T21:44):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, `3ec2d57`), `git fetch origin main`(`207078c..3ec2d57`) → `git checkout main && git reset --hard origin/main`(HEAD `3ec2d57`, 이미 최신 — Area4 자신의 직전 커밋). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `3c4a5bc8`)**: 웹앱 범위(`-- src migrations scripts .github`) diff **3커밋**(`4c6e5ab`·`175c7f6`·`77782cf`) — Area1·2·3·4·6이 이미 각자 렌즈로 정독 완료한 동일 3건. `git show --stat` 재확인 결과 **셋 다 `docs/price/*.sql`·`package.json`·`scripts/*.cjs`만 변경**(`4c6e5ab`=avg-cost 백필 SQL+감사스크립트, `175c7f6`=`scripts/ia-deploy.cjs` 단독, `77782cf`=`scripts/item-master-audit.cjs`+`scripts/lump-voucher-report.cjs`) — **`src/routes` 변경 0파일, `src/scripts`(프론트 JS) 변경 0파일, 신규 마이그 0건** → 보안 렌즈 표준 스캔(SQL 바인딩·XSS sink·authMiddleware·rate-limit·IDOR 비대칭)의 churn-트리거 신규 표면이 없음. 이번 사이클은 **standing scan 전량 재통과**로 대체.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 4: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 5: `npm audit`** — 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **CI 헬스**: `deploy.yml` 최근 10런 전부 `conclusion:success`. `verify.yml` 카나리 `list_workflow_runs` totalCount **0**(변동없음, #608와 완전 일치).
> - **IDOR 비대칭·XSS sink 전수 자동스캔(#452/#452-mirror) 재실행 불요 판단**: 신규 라우트 0개·신규 프론트 JS 0파일이라 이 사이클의 churn 안에 그 스캔의 신규 후보 자체가 없음(직전 Area5 08-28이 20커밋 범위로 이미 전수 재통과 완료, 그 결과와 이번 3커밋 diff 사이 라우트/JS 변경 0으로 재실행 무의미).
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지). Area5 소관 #612(크로스법인 IDOR) 재확인 — 이번 churn이 손댄 파일과 무관, 무변화.
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · `reason:not_planned` **4** + `duplicate` **2** = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(3커밋 전부 CLI 툴링, src/routes·src/scripts 변경 0으로 보안 표준스캔 신규표면 없음, standing scan 5종·CI헬스·IDOR/XSS 전수스캔 재확인 판단 전부 net-new 0), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-08-29T15:47):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD, f8ab48b), `git fetch origin main`(`207078c..f8ab48b`) → `git merge-base --is-ancestor e2f5c938 origin/main` = true(fast-forward 확인, rewrite 아님) → `git checkout main && git reset --hard origin/main`(HEAD `f8ab48b`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area4 자신의 앵커(`e2f5c938`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **3커밋**(`4c6e5ab`·`175c7f6`·`77782cf`) — **신규 마이그레이션 0건, 신규 라우트 0개**(`git diff --stat -- src/routes` 공백). 셋 다 Area1·2·3·6이 이미 각자 렌즈로 정독 완료한 CLI 툴링(avg-cost 백필 SQL 수정·IA 배포 버전드리프트 게이트·뭉치전표 감사 LEFT JOIN 정정) — 앱 write-path·스키마 변경 자체가 없어 **데이터정합성 렌즈의 표준 스캔(고아 레코드·NOT NULL diff·CHECK literal write·entity_id backfill) 신규 표면이 사실상 없음**.
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 3: 신규 비-FK `*_id` 참조 컬럼 sweep** — 이번 churn에 신규 마이그 0건이라 「churn-트리거 재스캔」(#477/#480 클래스)의 신규 후보 자체가 발생 불가.
> - **`audit:migration-drift` 시도** — 이 샌드박스엔 `CLOUDFLARE_API_TOKEN` 미설정이라 prod D1 직접조회 불가(기존 제약과 동일, net-new 아님) — ground-truth 대조는 로컬 `npx tsc --noEmit` clean + `audit:entity` 정적분석으로 대체.
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지). Area4 소관 #614(`designer_intakes` 참조가드 누락)·#615(재고 rebase 재현불가) 재확인 — 이번 churn이 손댄 파일과 무관, 무변화.
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 8건 → 이번 로그 추가 후 9건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(3커밋 전부 CLI 툴링, 신규 마이그/라우트 0건이라 데이터정합성 표준스캔 신규표면 없음, entity audit·sort-audit·비FK 참조컬럼 sweep 전부 net-new 0), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-08-29T09:47):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD), `git fetch origin main`(`207078c..564c174`) → `git checkout main && git reset --hard origin/main`(HEAD `564c174`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area3 자신의 앵커(`5cadd9f`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **4커밋**(`4c6e5ab`·`175c7f6`·`77782cf`·`c09d0b8`) — 개별 `git show --stat` 확인 결과 **넷 다 `src/pages`·`src/scripts`·`src/routes` 변경 0건**(avg-cost 백필 스크립트·IA 배포 버전게이트·뭉치전표 감사 스크립트·entity-audit 게이트 자체 개선 — 전부 CLI 감사/배포 툴링, `.claude/PROJECT_STATUS*`·`scripts/*.cjs`·`scripts/entity-audit.mjs`·`docs/*` 파일만 변경). **신규 화면·신규 API 응답필드·신규 axios 호출 자체가 없어 UX 렌즈 신규 표면이 없음**(Area2·Area6가 이미 같은 4~6커밋을 각자 렌즈로 정독 완료, 이번엔 UX 관점으로 재확인만).
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 1건 `attendance.ts:158`(기존 노출 유지, 변동없음).
> - **standing scan 2: "백엔드 먼저·화면 나중" 패턴 재확인** — 이번 churn에 신규 마이그레이션 0건·신규 라우트 0개·신규 API 응답필드 0건이라 이 패턴의 신규 후보 자체가 발생 불가(기존 #606·#618·#619 3건은 무변화, 재검증 불요 — 관련 파일 미변경).
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · `reason:"not planned"` **4** + `reason:duplicate` **2** = rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 12건 → 이번 로그 추가 후 13건, 임계 도달 → 트림 실행.
> - 신규 이슈 0건(4커밋 전부 CLI 툴링, UI/route/API 응답필드 변경 0건이라 UX 신규 표면 없음, standing scan 2종 net-new 0), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-08-29T03:46):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD), `git fetch origin main`(`207078c..d745bdb`) → `git merge-base --is-ancestor d7f97e3 origin/main` = true(fast-forward 확인, rewrite 아님) → `git checkout main && git reset --hard origin/main`(HEAD `d745bdb`). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인**: 직전 Area2 자신의 앵커(방법 라인 HEAD `d7f97e3`, 62회차 자기교정 규칙 적용) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **6커밋**(`4c6e5ab`·`175c7f6`·`77782cf`·`c09d0b8`·`f1895a0`·`44576c4`) — **신규 마이그 0건, 신규 라우트 0개**. 6건 전부 CLI 감사/배포 툴링(`scripts/*.cjs`·`entity-audit.mjs`·`ia-deploy.cjs`) 또는 `src/utils/{autoDeductInventory,materialRequirement,rollConsumption}.ts`(자재선택 로직) — routes 변경 자체가 없어 Area2 표준 스캔(entity_id INSERT·authMiddleware·N+1)의 신규 표면이 사실상 없음.
> - **`f1895a0` 유틸 3파일 직접 정독(판재 tie-break 버그픽스, 이미 Area1·4가 정독한 커밋의 코드 자체를 코드품질 렌즈로 재확인)**: `rollConsumption.ts` 신설 `selectBoardMaterial()`(면적 최소 우선 tie-break `material_item_id`) — `grep -rn "boardMats\[0\]\|mats\[0\]" src`=0(잔존 `[0]` 선택 없음, 두 호출부 `autoDeductInventory.ts:165`·`materialRequirement.ts:145` 전부 단일소스 경유), `grep -rn "BOARD_AREA_SQM" src`=0(중복 상수 제거 완료, dead code 없음) — clean.
> - **`autoDeductInventory.ts` INSERT/UPDATE entity_id 재확인**: `inventory_auto_deductions` INSERT(15컬럼)·`inventory` INSERT OR IGNORE/UPDATE 전부 `entityId` 바인드 포함(재고 row 부재 시 0-row 선생성 → UPDATE silent miss 방지 패턴 포함) — clean.
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 67건·**누락 0건**(c09d0b8 게이트 개선 이후 재확인, financialReports.ts 6건 FP 잔존 0 — Area4 08-28 판정과 동일).
> - **standing scan 2: authMiddleware recursive 커버리지**(`find src/routes -name '*.ts'` 전수, top-level+subdir) — 후보 7개(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전건 개별 확인: `orders/helpers.ts`·`payroll/shared.ts`·`taxInvoices/helpers.ts`=`Map.get()` FP(라우트 아님, helper 파일) · `publicUnsubscribe.ts`=의도적 공개(§50⑧ 무료 수신거부 수단, rateLimitMiddleware 게이트, 코드 주석에 명시) · `cron.ts`=`agentKeyMiddleware` scoped-token 4엔드포인트 전부 게이트 · `hrSelf.ts`=self-token scoped 기존 정당 클래스 · `messagesAd.ts`=자체 `requireRole('ADMIN')`만 보여 최초 의심됐으나 **부모 `messages.ts:121` `messagesRouter.use('/*', authMiddleware, requireRole('ADMIN','MANAGER'))`가 `/ad` 서브라우터 마운트(`:124`) 전에 이미 적용** — barrel 부모위임 정상 계층화(ADMIN·MANAGER 허용 후 자체 게이트로 ADMIN만 재좁힘), 실제 실행경로 index.tsx 마운트까지 추적 확인. **전건 FP/정당, net-new 0**.
> - **open 12건 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치), `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · rejected **6**(변동없음, 재확인 생략 — 대상 무변경).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 11건 → 이번 로그 추가 후 12건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(6커밋 전체 코드품질 렌즈 clean — routes 변경 0으로 표준스캔 신규표면 없음, 유틸 3파일 tie-break 픽스 재확인 clean, entity audit·authMiddleware recursive 스캔 전부 net-new 0), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 6 자기 진화 (2026-08-28T15:48):**
> - **방법**: `git status`=워킹트리 clean(detached HEAD), `git fetch origin main` → `forced update`로 표시됐으나 HEAD가 이미 `origin/main`과 동일(`14ab556`) → `git merge-base --is-ancestor 424f769e origin/main` = true(fast-forward 확인, rewrite 아님). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(범위 축 2종)**: 직전 Area6 자신의 앵커(`424f769e`) 이후 웹앱 범위(`-- src migrations scripts .github`) diff **21커밋**, 비-웹앱 범위(`-- LogWatcher IllustratorAutomat caps-worker workers queue`) diff **7커밋**(`1373f57`·`09feec3`·`2a10328`·`0dc1162`·`4156226`은 `scripts/cut/*`도 건드려 양쪽에 중복 계상). `grep -c` 백로그+아카이브 전수 대조 결과 **어느 로그에도 해시 언급 0건인 LogWatcher 커밋 2건**(`3ce57b2`·`1d3d3e7`)을 우선 정독 대상으로 확정.
> - **`3ce57b2` 심층 정독(신규 TnsFloraParser, 평판 TopazRip+Flora 2축 조인, 372줄) — #616 형제-비대칭 3번째 사례**: 전송후취소 무흔적(현장 3라운드 실측 R3=OK 오판) 문제를 Flora `print_rec.dat`(고정 2,376바이트 레코드) 실시각/중단플래그로 보정하는 신규 파서. `ClaimRipByName`이 `_pending`을 **표시만 하고 유지**(재출력 재매칭 대비)하는 설계는 정확하나, `rip_fallback_hours`(기본 6h) 폴백이 미claim 항목을 **송출과 동시에 큐에서 제거**하는 지점 이후 그 이름으로 뒤늦게 도착하는 Flora 레코드는 `ClaimRipByName`이 못 찾아(`rip==null`) **신원 없는 새 이벤트로 무조건 재송출**(`ReadRecords`가 조건 없이 `outEvents`에 추가) — `TnsPrintExpParser.cs`의 `_lastRipCancelAt`(취소 경로 전용 억제 상태)와 동형인 폴백-OK 경로 억제 상태가 이번에도 없음. **#616 본문이 정확히 이 메커니즘**(취소 경로엔 억제 있음·OK 폴백 경로엔 없음)을 다른 파일(`TnsPrintExpParser.cs`)로 신고했고, 62회차 선례(`361557ce`의 `FlexiPrintExpParser`)가 "같은 클래스 재노출은 별도 이슈화 안 함, #616가 메커니즘 전체 커버"로 처리한 전례와 동형 — **신규 이슈화 안 함**, 노출 대상이 TnsPrintExpParser→FlexiPrintExpParser→**TnsFloraParser로 3번째 파서 확대**된 것만 기록(각 파서가 독립 `.cs` 파일에 동일 패턴을 복붙 구현 — 공유 코드 리팩터가 아니라 매 신규 파서가 개별적으로 같은 함정을 재도입하는 구조).
> - **`1d3d3e7` 확인**: `.claude/PROJECT_STATUS.md` 1줄(docs-only, HSM-04 PrintLog 축 폐기 기록) — 코드 변경 없음, clean.
> - **웹앱 축 21커밋 중 Area5 앵커(`3c4a5bc8`) 이후 순수 신규 3건**(`4c6e5ab`·`175c7f6`·`77782cf`) 개별 확인: ① `4c6e5ab`(avg-cost 백필 스크립트가 08-19 base 리베이스 이후 잘못된 축으로 재실행되면 43개 품목 평가액이 61.5M→3B로 폭증할 뻔한 것을 방지 + `audit:avgcost` 신설) ② `175c7f6`(IA 배포 시 버전 문자열 미변경 감지 게이트) ③ `77782cf`(뭉치전표 리포트가 item_id NULL 219행/13.7억을 조용히 누락하던 것을 LEFT JOIN + 사유분류로 표면화) — **셋 다 CLI 감사/배포 툴링**(웹 라우트·DB write 없음, `docs/price/backfill_avg_cost.sql`은 owner 수동 실행 스크립트) — 기존 판정(`30f446f2`/`ca46317`류, owner 수기검증 영역)과 동형, Area6 자동스캔 대상 밖.
> - **웹앱 축 21커밋 중 미언급 12건**(cut/도구 IA 스크립트·데이터 마이그·docs) 스탯 레벨 확인 — 전부 `scripts/cut/*`(넷팅·베젤·용접선) 또는 `data(items)`/`docs(ia)` 성격, 이미 확립된 IA-축/데이터-전용 판정 범주(웹 라우트·DB write 없음)에 해당 — 개별 심층정독 불요.
> - **close-pending 캐시**: 없음(이번 사이클 신규 fixed-in-tree 픽스 0건).
> - **open 12건 재확인(open≠unfixed, 코드 재grep 전수)**: `list_issues(OPEN,label:auto-improve)` totalCount **12**(변동없음, #606·#608·#612·#613·#614·#615·#616·#617·#618·#619·#620·#621 전건 일치). 12건 전부 본문 안티패턴을 코드에서 개별 재grep — **전건 잔존 확인**(#606/#618/#619 프론트 소비처 여전히 0건, #612 `workbench.ts:653` 여전히 entity 격리 없이 INSERT, #614 `items.ts` 참조가드 20종에 `designer_intakes` 여전히 미포함, #616 위 상술, #617 `kit.ps1:242` `Select-Object -First 4000` 여전함, #620 3개 지점(`lifecycle.ts:499`·`ar-receivables.ts:424`의 `CREDIT_ALERT_TITLE_PREFIX='여신 초과'`·`cron.ts:281`) 전부 한글 리터럴 LIKE 여전함, #621 `deriveCardEntityId` 여전히 미교정) — **12건 전부 미픽스, close-pending 없음**. `search_issues`로 전 12건 `reactions.+1=0` 재확인(승인 대기 유지).
> - **backlog↔GitHub 절대값 재동기화**: open **12**(변동없음) · `search_issues(reason:completed)` **532**(변동없음) · `reason:not_planned` **4** + `duplicate` **2** = rejected **6**(변동없음).
> - **브랜치 위생**(읽기전용): `npm run branch:clean` → SAFE-remote 0·SAFE-absorbed 1·REVIEW 0, SKIP 1(main) — 삭제대상 1건(30건 미만, 백로그 등록 불요).
> - **CI 헬스**: `deploy.yml` 최근 30런 전부 `conclusion:success`(3ce57b2·4c6e5ab 포함 최신 커밋까지).
> - **npm audit 재확인**: 11건(1 moderate·8 high·2 critical) 전부 devDependency, #613 기보고와 완전 일치, net-new 0.
> - **verify.yml 카나리 재확인**: `list_workflow_runs(verify.yml)` totalCount **0**(변동없음, #608와 완전 일치).
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 「범위 축」(62회차) 레시피가 이번에도 LogWatcher 2커밋을 Area1~5 사각지대에서 정확히 낚아챘고, 신규 파서(TnsFloraParser)가 #616 메커니즘을 3번째로 재현한 것을 즉시 식별 — 두 레시피 모두 정상 작동, 신규 코딩화 대상 없음.
> - **백로그 트림 체크**: `backlog:trim --check` = 사이클 로그 9건 → 이번 로그 추가 후 10건, 임계 13건 미만, 트림 불요.
> - 신규 이슈 0건(fresh 웹앱 3건 전부 CLI 툴링 clean, LogWatcher 2건 중 1건은 #616 기존 메커니즘 재노출로 처리·1건은 docs-only clean), 자동수정 0건, done-sync: open 12(변동없음)·done 532(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
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
