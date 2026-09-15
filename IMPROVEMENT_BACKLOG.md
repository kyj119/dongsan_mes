# Improvement Backlog
<!-- last_run_area: 4 -->
<!-- last_run_at: 2026-09-15T10:40:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **7** (`list_issues(state:OPEN,label:auto-improve)` 실측 — #651 신규, #647·#648에 fixed-in-tree 코멘트만 close는 owner 대기) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **567** (`search_issues(reason:completed,label:auto-improve)` 실측, 변동없음) |
| ❌ rejected | **6** (`not_planned` 4 + `duplicate` 2, 실측, 변동없음) |

> **Area 4 데이터 정합성 (2026-09-15T10:40):**
> - **방법**: 세션 시작 시 detached HEAD `837b718`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 세션시작 HEAD `6d7239f`)**: `git log 6d7239f..HEAD` 21커밋, `git diff --stat -- src/routes src/utils migrations`는 **공백 아님**(직전 사이클 2연속 공백과 달리 이번엔 실 diff 10파일) — `migrations/0614·0615`(견적 규격텍스트)·`items.ts`(+35, with_stock)·`orders/{core,create,helpers,lifecycle,update}.ts`·`printEvents.ts`·`quotations.ts`. 전부 4개 feature 커밋(`685ea40`·`9212dfe`·`3e23e87`·`588eb19`·`fd92227`)에서 파생 — 각각 Area1/2/3/5/6가 이미 자기 렌즈(보안·타입·UX)로 검토했으나 **Area4 고유 렌즈(고아/dangling·상태정합·파생로직 오류)로는 미검토** → 직접 정독.
> - **`9212dfe`(print-match 파일맵 재연결) 데이터정합성 검증**: `orders/update.ts`의 `print_file_map` 재연결 로직을 라인 단위로 추적 — `savedFileMaps`를 두 분기(카드보존/카드재생성) 이전에 공통 선조회, 재연결 UPDATE도 두 분기 이후 공통 코드에서 실행되어 **카드보존 경로도 포함**(커밋 메시지가 명시한 "카드 보존 경로는 끊지도 않아 죽은 id가 남았다" 결함이 정확히 이 공통화로 해소됨 확인). 매칭 규칙(item_id+sort_order→item_id 폴백, claimed-set으로 중복 item_id 오매칭 방지)이 기존 `#124`(card_items)·`#597`(order_ai_files) 패턴과 동일. `CLAUDE.md` §게이트 목록도 같은 커밋에서 `test:local-e2e` 편입을 정확히 반영 — 문서·코드 불일치 0. 결함 0건(이미 올바르게 고쳐진 상태).
> - **🔴 신규 발견 — `helpers.ts:536 deriveOrderType` Set dedup 부작용으로 순수 유통 주문 오판정 → #651 등록**: 주문 성격(PRODUCTION/DISTRIBUTION)을 라인에서 파생하는 신설 로직(`3e23e87`, P11)이 `ids = Array.from(new Set(...))`로 dedup한 배열 길이를 원본 `items.length`와 비교해 "자유입력 라인 존재"를 판정하는데, **같은 item_id를 가진 정상 중복 라인**(같은 유통품목을 두 줄로 주문)도 이 비교에서 걸려 무조건 `PRODUCTION`으로 오판정됨(재현: `items=[{item_id:5},{item_id:5}]` → `ids.length=1≠items.length=2` → PRODUCTION, 실제론 둘 다 `production_required=0`이라 DISTRIBUTION이 맞음). `order_type`은 카드 생성·`shipment_ready` 초기값·자재 갭 계산에 직결 — 순수 유통 주문에 불필요한 카드가 생길 수 있음. 수정 방향(dedup 전 배열로 길이비교, dedup은 IN절에만 사용) 포함해 이슈 등록. **비즈니스 로직 변경이라 issue-only**(자동수정 금지 목록 해당).
> - **standing scan 1: `npm run audit:migration-number`** — 파일 630개, 중복 번호 **23쌍**(직전 사이클과 동일, 병렬 worktree 채번 충돌 무해 클래스), **같은 테이블 DDL 충돌 0건**.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **prod 직접조회 축(`--remote` 스크립트)**: 이 세션도 `CLOUDFLARE_API_TOKEN` 미설정 — prod 데이터 직접조회 불가(3연속 동일 제약). 코드/마이그 diff 분석으로 대체.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `837b718` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6→7**(#651 신규 등록, 나머지 #650·#648·#647·#626·#617·#616 변동없음) — 신규 외 전건 Area4 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **6→7**(#651 신규) · done **567**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md 서술 참조 재확인(이미 서술식, `line N` 잔여 없음). 이번 사이클은 기존 레시피(파생로직 정독)가 새 결함(#651)을 잡아낸 정상 적중 — 새 클래스로 codify할 만한 탐지 패턴 추가는 아직 판단 이름(사례 1건뿐).
> - **백로그 트림 체크**: 사이클 로그 9건 → 이번 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(`#651` deriveOrderType Set dedup 오판정), 자동수정 0건(비즈니스 로직이라 issue-only), done-sync: open 6→7(#651)·done 567(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-15T09:55):**
> - **방법**: 세션 시작 시 detached HEAD `3bf7a94`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `5df88fc`)**: `git log 5df88fc..HEAD -- src/pages src/scripts` = 4 feature 커밋. `685ea40`(자재포함 토글)·`3e23e87`(유통주문서 폐지)·`588eb19`(견적 규격텍스트)는 Area1/2/5/6가 이미 각자 렌즈로 검토 완료 — **`fd92227`(P9 주문 출고취소·P10 선불/착불 검증)만 전 Area 미검토**, Area3가 직접 정독.
> - **`fd92227` 직접 검토**: `PATCH /api/orders/:id/unship`(`orders/lifecycle.ts`)이 카드 unship과 동일한 검증된 헬퍼(`restoreStockLinesOnUnship`, OUT 행 철회+STOCK_RESTORE 로그)를 재사용, 카드/주문 상태 갱신은 한 batch, 회계반영(BILLED/PAID) 차단 서버·프론트 이중 게이트. 프론트 버튼(`orders.js unshipOrder`)은 role 조건부 노출 + `showConfirm` await 패턴(#426 규칙 준수) + 성공/실패 토스트. P10은 `required`→`data-needs-payment` 전환이 커밋 메시지와 정확히 일치, `calc.js`·`client.js` 양쪽 대조 확인. 결함 0건.
> - **🔗 open 이슈 대조 — #647·#648이 바로 이 커밋으로 해소됨을 확인**: 두 이슈 다 직전 journey-loop 사이클(2026-09-11)이 Area3발 ⏳ 항목을 승격한 것이었고, `docs/journeys/PROPOSALS.md` P9·P10에 owner 판정(P9="남은 부분 진행")과 함께 이번 커밋으로 반영됨. 이슈 본문의 재현 증상·제안 방향(안 2 각각)이 실제 구현과 정확히 일치 — **#647·#648에 fixed-in-tree 코멘트 게시**(코드 재수정 없이 close 가능, close는 owner 대기 — 32회차 규칙: 재검증은 이 세션이, close는 owner).
> - **journey-loop PROPOSALS.md 전수 재확인**: P1~P12 전 항목이 ✅고침 또는 ③유지(설계/정상)로 판정 완료, 신규 ⏳ 0건 — 승격 대상 없음.
> - **standing scan 1: showConfirm 콜백 오용(#426 클래스)** — `grep -rn "showConfirm(" src/scripts`에서 오용 패턴(2번째 인자=함수) **0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 중 9건 success·1건(최신, 이 세션 자체가 만든 HEAD) in_progress — 직전 완료런(`27fdfeb`)까지 전부 success.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#650·#648·#647·#626·#617·#616, 변동없음) — #647·#648에 fixed-in-tree 코멘트 게시(위), 나머지는 Area3 관할 밖.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음, close는 owner 대기) · done **567**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 「open≠unfixed 거울」(다른 Area가 codify한 기존 레시피)이 Area3 자신의 승격 이슈에 정확히 적중 — 새 클래스 발견 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` 대상 — 사이클 로그 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(4커밋 churn 중 3건 타 Area 재확인 완료·1건(`fd92227`) 직접 정독해 net-new 0 — 대신 #647·#648 fixed-in-tree 코멘트 게시), 자동수정 0건(고칠 결함 없음), done-sync: open 6(변동없음)·done 567(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-15T00:55):**
> - **방법**: 세션 시작 시 detached HEAD `bd36b92`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `288d0be`)**: `git log 288d0be..HEAD`가 **13커밋**, 이번엔 드물게 코드 diff 실재(19파일, +285/-864 — orderFormDist.js 602줄 삭제가 대부분). 4개 feature 커밋 중 `9212dfe`(print-match 재연결)·`3e23e87`(유통폼 폐지+#650)·`685ea40`(자재포함 토글)는 Area1/5/6가 이미 검토(#650 등록·net-new 0 확인) — Area2 고유 렌즈(entity_id/N+1/authMiddleware/타입불일치/dead code)로 재확인만. **`588eb19`(견적 규격텍스트 0614/0615)는 전 Area 미검토 — Area2가 직접 정독**.
> - **`588eb19` 직접 검토**: `quotations.ts` INSERT/SELECT 3곳(POST·PUT·convert-to-order)의 컬럼-플레이스홀더-bind 3중 순서를 직접 세어 대조(0596 파라미터 밀림 사고 재발 경계) — 전부 정합, entity_id 포함 정상. `quotation.js`·`quotationForm.js`·`quotations.js`의 신규 `specification` 렌더는 전부 `escapeHtml` 적용(#399 규칙 준수). 0615 데이터마이그는 `UPDATE ... WHERE id=? AND specification=? AND width=? AND height=?` 형태라, prod 행 id 하드코딩이라도 **매치 실패시 단순 0-row no-op**(CLAUDE.md 경고 대상인 INSERT FK 위반 클래스와 다름 — UPDATE는 대상 없으면 조용히 스킵, FK 위반 불가).
> - **🔧 자동수정 1건 — `models.ts` 타입 드리프트**: `src/types/models.ts`의 `QuotationItem`(견적 라인)·`OrderItem`(주문 라인) 인터페이스 둘 다 `specification` 필드 누락 — `quotation_items.specification`(0614, 이번 사이클 신규)·`order_items.specification`(0291, 기존부터 누락)이 실컬럼인데 타입엔 없었다. `tsc`가 못 잡은 이유 = 두 인터페이스 다 쿼리 결과 타이핑에 실사용되지 않음(`grep -rn "QuotationItem\b" src --include=*.ts` 0건, OrderItem은 import만 되고 결과 캐스팅엔 미사용) — 순수 타입-스키마 정합 갭이라 런타임 영향 없음. 두 인터페이스에 `specification?: string;` 추가(TaxInvoiceItem 기존 필드와 동일 옵셔널 패턴) → `npm run verify`(tsc+build) 통과 확인.
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 2: authMiddleware recursive 스캔** — 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 직전 사이클과 동일 — **net-new 0**.
> - **standing scan 3: dead code 잔재** — `orderFormDist.js` 삭제(3e23e87) 후 참조 잔존 여부 `grep -rn "orderFormDist" . --include=*.ts --include=*.tsx --include=*.js`(node_modules 제외) **0건** — 정리 완전.
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `bd36b92` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#650·#648·#647·#626·#617·#616, 변동없음) — 전건 Area2 관할 밖(Area3/5/6).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 리터럴 쿼리 재확인 — open **6**(변동없음) · done **567**(변동없음) · rejected **6**(`not_planned` 4 + `duplicate` 2, 변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 기존 레시피(entity/N+1/dead-code 표준 스캔)가 새 클래스 없이 적중, `models.ts` 드리프트도 기존 체크리스트 항목("models.ts 타입 vs 실제 DB 스키마 비교")의 정상 적용 — codify 불요.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` 대상 — 사이클 로그 추가 후 13건, 임계(13건) 도달 → 트림 실행.
> - 신규 이슈 0건(4커밋 feature churn 중 3건 타 Area 재확인 완료·1건(`588eb19`) 직접 정독해 net-new 0), 자동수정 1건(`models.ts` QuotationItem·OrderItem `specification` 필드 추가, verify 통과, 커밋 예정), done-sync: open 6(변동없음)·done 567(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-14T13:10):**
> - **방법**: 세션 시작 시 detached HEAD `ca4d9d4`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `dbfc031`)**: 웹앱 헬스범위(`src/routes`·`src/utils`·`index.tsx`·`wrangler.toml`·`.github/workflows`·`scripts/smoke.cjs`) diff **2커밋**(전체 13커밋 중) — `9212dfe`(print-match 파일맵 재연결, Area5가 이미 보안 렌즈로 검증)·`3e23e87`(유통 주문서 폐지+order_type 라인파생+품목검색 재고/최근단가, Area5가 entity 격리 렌즈로 검증해 #650 등록). 둘 다 신규 API 라우트 제거/추가 없음(프론트 페이지만 폐지) — smoke 프로브 대상 변경 없음 확인(`grep -n "dist" scripts/smoke.cjs` 0건).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `ca4d9d4` 포함). 최신 배포 job(`103883551953`) 전 단계(typecheck·build·self-tests·entity audit·migration-number audit·write canary·deploy·smoke) 전부 success.
> - **smoke 129/129 PASS**(job 로그 직접 확인) — 신규 라우트 없어 프로브 갭 없음. 마이그레이션 신규 0건(0613이 마지막) — (a)/(b) 드리프트 분류 대상 없음.
> - **#636(cashSchedule.overview) 재확인 — 배수 유지, 재이슈 불필요**: 이번 배포 smoke = **5334ms**(예산 2000ms 초과, 직전 4571ms에서 추가 상승). owner 국내 실측(421~424ms) 대비 배수 ≈12.7배로 기존 owner 검증 범위(9~14배) 안 — 배수 자체가 깨졌다는 증거 없이는 재이슈하지 않음(codify 규칙 그대로 적중).
> - **standing scan 1: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 2: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 3: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **#649 owner 직접 close 확인**: Area6가 남긴 fixed-in-tree/close-pending 코멘트 직후 owner가 `state_reason:completed`로 close(`closed_at` 06:47:27, Area6 커밋 push와 동일 시각) — 코드 수정 없이 문서 커밋만으로 실제 해소 확인된 사례.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#650·#648·#647·#626·#617·#616, #649 제외) — 전건 Area1 관할 밖(Area3/5/6), 재조치 불요.
> - **backlog↔GitHub 절대값 재동기화**: open **7→6**(#649 owner close) · done **566→567**(#649 반영) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md 기존 codify 규칙(배수 판정)이 이번 사이클에 그대로 재적중, 새 클래스 발견 없음.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` 대상 — 사이클 로그 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(2커밋 churn 전량 타 Area 재확인 완료, CI green·smoke 129/129·#636 배수 유지), 자동수정 0건(고칠 결함 없음), done-sync: open 7→6(#649 owner close)·done 566→567(#649 반영)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-14T11:35):**
> - **방법**: 세션 시작 시 detached HEAD `c3be81d`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합(origin이 force-update로 표시됐으나 실제로는 앵커 유실 클래스, unrelated-histories 아님). `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area6 방법 라인 HEAD `e155373`)**: 웹앱 범위 diff **13커밋**. `#600` 브리지 적용 — 각 해시를 백로그에서 grep 대조: 5건은 auto-improve 자기순환 chore(Area1~6, 자기참조)·4건은 docs-only(`569b0b5`·`95c1c82`·`6fc6035`·`3ff6659`)·`9212dfe`·`3e23e87`은 직전 Area5가 이미 구체 로직(라인 인용)으로 정독 완료(#650 발견). **`685ea40`(주문서·견적서 "원자재 포함" 토글 통합) 1건만 미검토 — Area 6가 직접 정독**.
> - **`685ea40` 직접 검토 — net-new 결함 0, #649 근본원인 해소 확인**: `orderForm.ts`/`quotationForm.ts`의 `includeMaterials` 체크박스 기본값을 OFF→ON 전환 + `shell.js` 공용 초기화 함수(`user-prefs orderform.includeMaterials` GET/PUT)로 계정별 기억. XSS/entity 관점 = `axios.get/put('/api/user-prefs...')`는 기존 라우트(변경 없음) 재사용, `quotationForm.js`의 `exclude_type=MATERIAL` 파라미터는 `items.ts`의 화이트리스트 체크(`['PRODUCT','GOODS','MATERIAL'].includes(...)`)를 거치는 기존 파라미터 바인딩 — net-new sink/격리갭 0.
> - **이 커밋이 #649("견적서 품목 검색이 자재를 걸러내지 않아 주문서와 결과가 다름")를 fixed-in-tree로 해소함을 확인 → open≠unfixed 거울(30회차) 적용**: 견적서가 이제 주문서와 동일한 토글+동일 저장키를 공유해 두 폼의 결과 건수 불일치가 사라짐. 형제완전성 재검증 — `itemRow.js`(주문서)·`quotationForm.js`(견적서) 양쪽의 `includeMaterials` 분기 로직 대조, 자재 필터 축은 동일 패턴 공유 확인. **#649에 fixed-in-tree/close-pending 코멘트 게시**(코드 수정 없이 close 가능, 용준님 확인 대기) — 이슈 자체는 close하지 않음(32회차 규칙: 재검증은 이 세션이, close는 owner).
> - **관찰(미확정, 이슈화 보류)**: `itemRow.js:319`의 체크 시 분기가 `exclude_type=MATERIAL`뿐 아니라 `type=sales` 필터까지 함께 생략(주석은 "원자재 포함"만 언급) — 기본값이 OFF→ON으로 바뀌며 이 분기가 이제 전 사용자 기본 경로가 됨. `is_sales_item=0`(매입전용) 품목이 실제로 몇 건인지 이 세션엔 DB 접근 수단이 없어 확인 불가(`CLOUDFLARE_API_TOKEN` 미설정, 로컬 D1도 미부트스트랩) — 데이터 없이 이슈화하면 원가-0 섹션이 경계하는 "금액순 헛짚기"와 같은 오탐 위험. 다음 사이클에 prod 접근 가능하면 `SELECT COUNT(*) FROM items WHERE is_sales_item=0 AND item_type!='MATERIAL'`로 1차 확인 권장.
> - **비-웹앱 축 standing scan(#616/#617 클래스)**: `git log e155373..HEAD -- LogWatcher IllustratorAutomat caps-worker workers queue` = **0커밋**, 이번 사이클 재검토 대상 없음.
> - **close-pending 캐시 재확인**: #616·#617·#626 — `updated_at` 각각 08-31·08-31·09-10 이후 변동 없음, 코드축(LogWatcher) churn도 0이라 재검증 불필요(캐시 신뢰, 32회차 규칙). owner가 이미 대기 사유를 명시했으므로 재통지 불요(64회차 FP룰).
> - **standing scan 1: done-sync 절대값 재동기화(리터럴 쿼리)** — `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **566**(변동없음) · `reason:not_planned` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **7**(#650·#649·#648·#647·#626·#617·#616, 변동없음 — #649는 위에서 fixed-in-tree 코멘트만).
> - **standing scan 2: `npm run test:calc`** 26항목 체인 — 전항목 PASS(exit 0, 회귀 0).
> - **standing scan 3: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `c3be81d` 포함).
> - **backlog↔GitHub 절대값 재동기화**: open **7**(변동없음, #649는 open 유지+close-pending 코멘트) · done **566**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 기존 레시피(#600 브리지·open≠unfixed 거울·close-pending 캐시)가 그대로 적중 — 새 클래스로 codify할 만한 확정 사례는 없었음(`itemRow.js` 관찰은 데이터 미확인이라 보류).
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(13커밋 churn 중 미검토 1건 직접 정독, net-new 0 — 대신 #649 fixed-in-tree 코멘트 게시), 자동수정 0건(고칠 결함 없음), done-sync: open 7(변동없음)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-14T10:20):**
> - **방법**: 세션 시작 시 detached HEAD `569b0b5`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`, shallow-clone 앵커 유실 클래스) → `git fetch origin main` + `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `4b60c53`)**: 웹앱 보안범위(`src/routes`·`src/utils`·`src/middleware`·`index.tsx`·`wrangler.toml`·`.github/workflows`) diff **2커밋**(전체 13커밋 중, 나머지는 auto-improve 자기순환 chore 6건 + 문서 3건 + journey-loop 도구 등) — `9212dfe`(print-match 파일맵 재연결+게이트 배선)·`3e23e87`(유통 주문서 폐지+order_type 라인파생+품목검색 재고/최근단가).
> - **`9212dfe` 보안 렌즈 검증**: `PUT /orders/:id`에 추가된 `print_file_map` 재연결 로직·`printEvents.ts`의 `shipment_ready` 전파·`card_number` 백필 전부 파라미터 바인딩 정상(문자열 결합 SQL 0건), 기존 `requireEditOrRole`/`agentKeyMiddleware` 게이트 변경 없음, 신규 SELECT/UPDATE 전부 같은 함수 스코프의 `order_id`/`card_id`로 한정 — 회귀 0.
> - **🔴 `3e23e87` 신규 `GET /api/items?with_stock=1` 형제쿼리 entity 격리 비대칭 발견 → #650 등록**: 같은 함수에서 `stock` 서브쿼리는 `inventory.entity_id = ?`로 격리하는데 바로 옆 `last`(최근 판매단가/일자) 서브쿼리는 `orders` JOIN에 entity 필터가 전혀 없음 — `clients.ts`의 `lastOrderJoin`(동일 형태에 `entityFilter(c)` 적용)과 대조해 확립된 컨벤션 위반 확인. `authMiddleware`만 있고 role 제한 없는 라우터라 전 법인 사용자가 신규 품목검색 모달("최근단가" 컬럼, `shell.js` 신규 UI)에서 타법인 실거래 단가를 그대로 봄. `npm run audit:entity`는 서브쿼리+윈도우함수 내부라 이 케이스를 못 잡음(0건 보고, 정적감사 사각 재확인). IDOR 비대칭 탐지 규칙(형제 쿼리 하나만 격리=격리 의도 증거)에 정확히 부합 — **자동수정 금지**(프로젝트 IDOR=owner 워크플로 선례 #349/#356/#437과 동일 처리), issue-only.
> - **`orders/create.ts`·`helpers.ts deriveOrderType` 검토**: `items`(entity_id 없는 전역 마스터) 대상 COUNT 쿼리만, 바인딩 정상, 인증/격리 변경 없음 — 회귀 0.
> - **XSS standing scan**: `node scripts/check-xss.mjs` 재실행 — **102건**(직전 108건에서 6건 감소). 이번 churn 파일(`orders.js`·`layout/shell.js`) 매치 후보 확인 — `shell.js:1801/1807`은 로딩 스피너 리터럴(sink 아님), `orders.js` 기존 sink 전부 `escapeHtml` 적용 확인 — net-new sink 0건.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: `body.password ||` 기본값** → 0건.
> - **standing scan 3: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(#650은 이 정적감사 패턴 밖의 서브쿼리/윈도우함수 케이스라 별도 육안 검증으로 발견).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `569b0b5` 포함).
> - **#626 재확인**: `updated_at` 2026-09-10 이후 변동 없음(코멘트 1건 그대로) — owner 판정 대기 유지, 재조치 불요.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#649·#648·#647·#626·#617·#616, #650 등록 전) 전건 재확인 후 #650 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **6→7**(#650 신규) · done **566**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 기존 「IDOR 비대칭 탐지 규칙」(형제 쿼리 대조)이 그대로 새 클래스(신규기능 내 stock/last 형제쿼리 비대칭)를 적중 — 별도 codify 불요, 기존 레시피의 정확한 적용 사례.
> - **백로그 트림 체크**: 사이클 로그 9건 → 이번 추가 후 10건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#650 items with_stock 최근단가 entity 격리 누락, IDOR 비대칭, issue-only), 자동수정 0건(IDOR=owner 워크플로), done-sync: open 6→7(#650 신규)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-13T13:05):**
> - **방법**: 세션 시작 시 detached HEAD `6d7239f`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`) → `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 사이클 최종 HEAD `fa55ecc`)**: `git log fa55ecc..HEAD` = 7커밋이지만 전부 auto-improve 자기순환 chore(Area1·2·3·5·6) + journey-loop round2 문서 커밋(`4b60c53`, `PROJECT_STATUS.md`만) — `git diff --stat fa55ecc..HEAD -- src/routes src/utils migrations`가 **완전 공백**. Area4 렌즈(고아 레코드·상태 불일치·중복·entity_id NULL·인덱스)를 적용할 신규 데이터/스키마 diff 자체가 없음.
> - **standing scan 1: `npm run audit:migration-number`** — 파일 628개, 중복 번호 **23쌍**(직전 사이클 기록 20쌍에서 증가 — 병렬 worktree 채번 충돌, #639에서 이미 codify된 무해 클래스), **같은 테이블 DDL 충돌 0건**(배포 차단 대상 없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **prod 직접조회 축(`--remote` 스크립트)**: 이 세션엔 `CLOUDFLARE_API_TOKEN` 미설정 — prod 데이터 직접조회 불가(직전 사이클과 동일 제약). 코드/마이그 diff 분석(공백 확인)으로 대체.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `6d7239f` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#649·#648·#647·#626·#617·#616, 변동없음) — 전건 Area4 관할 밖(Area3/5/6).
> - **backlog↔GitHub 절대값 재동기화**: `search_issues` 리터럴 쿼리 재확인 — open **6**(변동없음) · done **566**(변동없음) · rejected **6**(`not_planned` 4 + `duplicate` 2, 변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md 서술 참조 재확인(이미 서술식, `line N` 잔여 없음). 이번 사이클은 데이터/스키마 churn 0건이라 새 클래스 발견 기회 자체가 없었음.
> - **백로그 트림 체크**: 사이클 로그 8건 → 이번 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(데이터/스키마 churn 0건, standing scan 전부 기존 baseline 유지), 자동수정 0건(고칠 결함 없음), done-sync: open 6(변동없음)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
>

> **Area 3 UX/기능 감사 (2026-09-13T11:52):**
> - **방법**: 세션 시작 시 detached HEAD `5df88fc`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`) → `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area3 방법 라인 HEAD `8d2666c`)**: `src/pages`+`src/scripts` 범위 `git log 8d2666c..HEAD -- src/pages src/scripts` = **0커밋**. 전체 7커밋 중 5건은 auto-improve 자기순환 chore(Area1·2·4·5·6), 1건은 직전 Area3 사이클 자신의 커밋(`fa55ecc`), 1건은 `PROJECT_STATUS.md`/`memory/session-context.md`만 건드린 journey-loop round2 문서 커밋(`4b60c53`) — UX 렌즈를 적용할 신규 화면 diff 자체가 없음.
> - **journey-loop round2(`4b60c53`) 브리지 확인**: `docs/journeys/PROPOSALS.md` 재확인 — J1b 예외경로·J2 출고취소/재출고를 실제 DB 검증까지 마쳤으나 **판정은 기존 P8·P9·P10 그대로**(`⏳`, 신규 항목 0건). 직전 사이클에 이미 #647·#648·#649로 승격 완료 — 재브리지 대상 없음.
> - **#647·#648·#649 리뷰 상태 재확인**: `search_issues` reactions·comments 전부 **0**(생성 후 1일, 아직 용준님 리뷰 전) — 👍/코멘트/close 셋 다 없어 재조치 없음, 다음 사이클도 계속 관찰.
> - **standing scan 1: showConfirm 콜백 오용(#426 클래스)** — `grep -rn "showConfirm(" src/scripts` 166건 전수, `showConfirm(msg, function...)`/`showConfirm(msg, ()=>...)` 오용 패턴 **0건**(전부 `await`/`.then()` 정상 패턴, 변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `5df88fc` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#649·#648·#647·#626·#617·#616, 변동없음) — #647~649만 Area3 관할(위에서 리뷰 대기 확인), 나머지는 Area5/6 관할.
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · done **566**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-3-ux-audit.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 화면 churn 0건이라 새 UX 결함 발견 기회 자체가 없었음 — journey-loop round2 가 같은 판정(P8~P10 유지)을 재확인해 "다음 사이클에 새 ⏳가 남으면 codify" 조건은 이번에도 미충족.
> - **백로그 트림 체크**: 사이클 로그 12건 → 이번 추가 후 13건, 임계(13건) 도달 → `npm run backlog:trim -- --check` 실행 후 트림.
> - 신규 이슈 0건(화면 churn 0건, journey-loop 신규 ⏳ 0건, 기승격 3건은 리뷰 대기 유지), 자동수정 0건(고칠 결함 없음), done-sync: open 6(변동없음)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 4**.
>

> **Area 2 코드 품질 심층 분석 (2026-09-13T10:35):**
> - **방법**: 세션 시작 시 detached HEAD `288d0be`(origin/main과 동일) → 로컬 `main`은 stale(`eecca71`) → `git checkout -B main origin/main`으로 정합. `npm ci`(0→89), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `5276767`)**: `git log 5276767..288d0be`가 **7커밋**이지만 `src/`·`migrations/` 전체에 대한 `git diff --stat`이 **완전 공백** — 이번 윈도우는 auto-improve 자기순환 chore 커밋(Area1·3·4·5·6) 5건 + journey-loop 문서 커밋(`4b60c53`, PROJECT_STATUS만) 1건뿐, 코드 변경 자체가 0건. Area2 고유 렌즈(entity_id/N+1/authMiddleware/타입불일치/dead code/`SELECT *`)를 적용할 신규 diff가 없음.
> - **standing scan 1: `npm run audit:entity`** — 검사 132파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 2: authMiddleware recursive 스캔** — `find src/routes -name '*.ts'` 전체 재실행, 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 직전 사이클과 정확히 동일 목록 — **net-new 0**.
> - **standing scan 3: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 4: `npm run branch:clean`** — 최초 실행 시 로컬 `main`이 stale이라 SAFE-absorbed 1건으로 오탐(직전 사이클엔 없던 값) → `git checkout -B main origin/main` 정합 후 재실행하니 SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 로컬 브랜치 stale 아티팩트였을 뿐 실제 정리 대상 아님(다른 Area 로그가 반복 기록한 "세션 시작 시 로컬 main stale" 클래스와 동형, 이번엔 branch:clean 판정에도 영향을 준다는 점만 신규 확인).
> - **standing scan 5: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`(최종 HEAD `288d0be` 포함).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` **6**(#649·#648·#647·#626·#617·#616, 변동없음) — 전건 Area2 관할 밖(Area3/5/6).
> - **backlog↔GitHub 절대값 재동기화**: open **6**(변동없음) · done **566**(`search_issues(reason:completed)` 재확인, 변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 사이클은 코드 churn 0건이라 새 클래스 발견 기회 자체가 없었음 — `branch:clean`이 세션 시작 시 로컬 `main` stale 상태에 민감하다는 점만 확인(다른 standing scan은 영향 없음).
> - **백로그 트림 체크**: 사이클 로그 11건 → 이번 추가 후 12건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 0건(코드 churn 0건, 재확인할 diff 자체가 없음), 자동수정 0건, done-sync: open 6(변동없음)·done 566(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

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
