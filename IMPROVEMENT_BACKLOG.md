# Improvement Backlog
<!-- last_run_area: 5 -->
<!-- last_run_at: 2026-09-11T06:10:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | **14** (`list_issues(state:OPEN,label:auto-improve)` 실측, 변동없음 — 이번 사이클 신규 이슈 0건) |
| ✅ approved | 0 |
| 👀 reviewed | 0 |
| ✔️ done | **555** (`search_issues(reason:completed,label:auto-improve)` 실측, 542→555) |
| ❌ rejected | **6** (`not_planned` 4 + `duplicate` 2, 실측, 변동없음) |

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

> **Area 2 코드 품질 심층 분석 (2026-09-10T16:10):**
> - **방법**: 세션 시작 시 detached HEAD `485ebf0`(origin/main과 동일)였으나 얕은 clone(50커밋) → `git checkout main`(47커밋 뒤처짐) + `git merge --ff-only origin/main`으로 정합 + `git fetch --unshallow`(2,870여 커밋 확보). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area2 방법 라인 HEAD `9bc875c`)**: 웹앱 범위 diff **26커밋** — Area1(09:50)이 이미 `b8b7c66d`까지 프로덕션 헬스 렌즈로 훑었고, 그중 `97bca6e5`·`3503b3bd`·`c1b381f0`(2026-09-09 11:5x)은 애초에 **Area2 스타일 N+1 배치화 자체 수정 커밋**이라 전문 재검증(entity_id·batch 순서·엔티티 스코프)만 수행. Area1 종료 이후 신선 9커밋(`27dfe634`~`485ebf0`, 09:50~15:27)은 코팅원가/판재/롤소요량 가격엔진 리팩터 + 발주목록 검색바 UI — DB write 없는 순수계산 유틸·마이그(리터럴 UPDATE)·프론트 전용이라 Area2 렌즈(entity_id/N+1/auth/타입) 해당 코드 자체가 없음.
> - **`97bca6e5`(GET 3경로 순차 await→batch) 전문 재검증**: `cardExpenses.ts` payment-schedule·`cashFlow.ts` calendar·`prices.ts` item-supplier-prices 3곳 전부 `entityFilter` 절 batch 이전과 동일 유지, 결과 배열 인덱스가 stmt push 순서와 1:1 대응(별도 메타 배열로 매핑 보존) 확인 — 회귀 없음. `prices.ts`는 tie-break(`po.order_date DESC, po.id DESC`)도 유지.
> - **`3503b3bd`+`c1b381f0`(카드 CSV import 행별 SELECT+INSERT → 80청크 batch) 재검증**: 중복확인 SELECT가 `entity_id` 없이 `card_id`만 스코프하지만, 핸들러 상단 `#485` 카드 소속 검증(`cardCheck` — 요청 법인 소속 카드인지 확인 후에만 도달)으로 이미 법인 격리됨 확인, `entity-audit.mjs` ALLOWLIST에 사유 명시(`card_id로 스코프, 직전 cardCheck가 법인 검증`) — 정당한 예외.
> - **authMiddleware recursive 스캔** — `find src/routes -name '*.ts'` 전체 재실행: 후보 7건(`publicUnsubscribe.ts`·`orders/helpers.ts`·`payroll/shared.ts`·`cron.ts`·`messagesAd.ts`·`hrSelf.ts`·`taxInvoices/helpers.ts`) 전부 기존 클래스와 일치(helpers 3종=Map.get FP·cron=agentKeyMiddleware·hrSelf=scoped-token·public=의도적 공개) — **net-new 0**(25회차 이후 baseline 유지).
> - **standing scan 1: `npm run audit:entity`** — 검사 134파일·entity테이블 SELECT 75건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **standing scan 5: `npm run audit:structure`** — 신규 P1급 없음(정렬 tie-break 미적용·계산로직 밀집·중복 블록 모두 기존 baseline, 이번 churn 파일 미해당).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런(HEAD `485ebf0` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` totalCount **25**(변동없음, #613~644 전건 일치) — Area2 소관 열린 이슈(#640·#638·#637·#632·#628·#627) 대상 파일 전부 이번 churn 밖(cashSchedule.ts·bankMatchPolicy.ts·ar-helpers.ts·cardSpend.ts·waste.ts·budgets.ts 무변경) 확인 후 재grep 생략.
> - **backlog↔GitHub 절대값 재동기화**: open **25**(변동없음) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-2-code-quality.md `line N` 잔여참조는 이미 서술식 각주(「컬럼-diff bridge」 등)만 존재, 이번 사이클도 재확인 0건. `messagesAd.ts`(nested sub-router, 부모 `.use('/*', authMiddleware, requireRole)` 상속 + 자체 `requireRole('ADMIN')` 재게이트)는 barrel/scoped-token/public 어디에도 명시 안 된 4번째 정당 클래스이나 단일 사례(코드베이스 전체 1건)라 codify 보류 — 재발 시 codify.
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 0건(entity_id/N+1/authMiddleware 스캔 net-new 0, 신선 churn 대부분 DB-write 없는 순수계산·UI 전용이라 Area2 렌즈 해당 코드 없음, 기존 Area2 소관 open 이슈는 이번 churn 밖이라 재검증 불필요), 자동수정 0건(고칠 결함 없음), done-sync: open 25(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 3**.
>

> **Area 1 프로덕션 헬스 (2026-09-10T09:50):**
> - **방법**: 세션 시작 시 detached HEAD `b8b7c66`(origin/main과 동일) → `git checkout main` + `git merge --ff-only origin/main`(34커밋 fast-forward, 로컬 main이 뒤처져 있었음) + `git fetch --unshallow`. `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area1 방법 라인 HEAD `eecca716`)**: 웹앱 범위 diff **16커밋** — 대부분(cashflow §6까지)은 Area2~6이 이미 각자 렌즈로 정독. Area1 고유 렌즈(CI 헬스·응답시간·마이그 드리프트)로 이번 사이클 신규 churn(단가축 정정 마무리·은행 pending·주문 라인 스냅샷·판재 자규격·코팅 BOM원가·N+1 배치화 3건·8월이관 담당법인 정정)에 집중.
> - **🔴 신규 발견 → #644 — 0603(`product_materials.material_role` 컬럼) prod 미적용 시 주문 원가재계산·자동차감이 무음 실패**: `ab0eae5c`(코팅 BOM 원가 반영)가 신설 컬럼을 `orderLineCost.ts:270`·`autoDeductInventory.ts:124`에서 명시 SELECT — #483/#484 (b)-risk 클래스와 동형(#624 0545/0548과 같은 패턴). 소비처 6곳(`orders/create·update·lifecycle·operations.ts`, `quotations.ts`) 전부 try/catch 비차단이라 **주문 기능 자체는 안 죽고 원가·마진 스냅샷만 조용히 계산 안 됨**(0603이 고치려던 "코팅 원가 0" 문제 재현) — smoke(GET 전용) 구조적으로 무음. `0602`/`0603` 마이그 코멘트에 `0604`(같은 날, 명시적으로 "prod 적용 완료" 기록)와 달리 prod 적용 확인 문구가 없어 egress 제약상 이 세션은 직접 검증 불가 → issue-only(스키마 반영 여부 확인 + 필요 시 `db:migrate:prod`는 owner 실행).
> - **#636(cashSchedule.overview 응답시간) 4차 측정 — 여전히 재현**: 최신 배포(`b8b7c66d`, job 102698470509) job 로그 직접 대조 = **3850ms**(예산 2000ms 대비 93% 초과, smoke `PASS 129/129`). 3135→3589→3524→**3850ms** 4연속 예산초과, 이번 사이클 신규 churn(코팅 BOM)은 cashflowEngine과 무관 확인 — 신규 이슈 대신 기존 이슈에 코멘트로 누적(재무엔진 로직 변경, 자동수정 대상 아님).
> - **#624(0545/0548 마이그 드리프트) 부분 재확인**: 0545 대리검증 프로브(`printEvents.agents`)가 최신 smoke에서 `200 177ms PASS` — **0545 prod 적용 확인**(코멘트로 기록, 이슈는 0548 미확인분 남아 open 유지).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 10런 전부 `conclusion:success`. 최종 HEAD(`b8b7c66d`, job 102698470509) 전 단계(typecheck·self-tests·entity audit·write canary·smoke 129/129) success.
> - **egress 확인**: 이 세션도 prod 직접 fetch 차단 — 배포 job 로그 대리검증 방식(Area1 codify) 재사용.
> - **standing scan 1: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 3: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(OPEN,label:auto-improve)` totalCount **24**(신규 등록 전) 기존 24건 전건 일치 확인 후 #644 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **25**(24→25, #644 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-1-production-health.md `line N` 잔여참조 재확인(grep 오탐 1건뿐 — "baseline"의 부분일치, 실제 참조 0건 재확인). 기존 「(a)/(b) 마이그 드리프트」·「CI job 로그=query-cost 대리지표」 패턴이 이번 발견(#644) 모두 그대로 적용, 신규 codify 불요.
> - **백로그 트림 체크**: 사이클 로그 8건 → 이번 로그 추가 후 9건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#644 0603 material_role prod 미적용 위험, M, 스키마검증이라 issue-only), 자동수정 0건(전부 owner 확인·재무로직 대상), done-sync: open 24(24→25)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 2**.
>

> **Area 6 자기 진화 (2026-09-10T06:20):**
> - **방법**: 세션 시작 시 detached HEAD `9dda3b7`(origin/main과 동일, Area5 종료 시점 백로그 커밋 1개만 더 앞섬) → `git checkout main` + `git merge --ff-only origin/main`(26커밋 fast-forward). `git fetch --unshallow`(shallow clone→2,860여 커밋 확보). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm audit --omit=dev` 0건.
> - **churn 확인(앵커 = 직전 Area6 방법 라인 HEAD `a1c943d`)**: 웹앱 범위 diff **11커밋**(eecca716~4a13e0fb) — 전부 Area1~5가 이번 세션 이미 각자 렌즈로 정독한 대출/cashflow §6/은행매칭/청구단가축/입고평균원가·구역·판매가 웨이브와 동일 창(신선 churn 0). 비-웹앱 축(LogWatcher/IllustratorAutomat/caps-worker/workers/queue) churn = **0커밋**(62회차 규칙 대상 없음).
> - **「churn 목록에 나열됨 ≠ Read됨」(#600) 브리지 적용 — 11커밋 개별 문단 커버리지 대조**: 각 해시를 두 백로그 파일에서 grep해 자기 문단(구체 로직·라인 인용)으로 다뤄졌는지 확인. `eecca716`(대출 QM6)·`18e22902`(cashflow §6, #640 발견)·`47ffce49`(bank 리터럴 UPDATE)·`9bc875c2`(가격축, migrations)·`3907d501`(bankPendingReason.ts, Area5 "bank.ts +186줄" 문단)·`79642f82`(0600 라인 스냅샷, #642 발견) = 기존 로그에 개별 언급 확인. **`5a73dffa`(inventoryZone 배정 구역 입고 목적지 반영)·`e3eb6c20`(판매품목 base_price 입고 시 원가로 덮어쓰기 방지)·`ee78cf97`(평균원가 공백 채우기, recalculate-avg 덮어쓰기→채우기 전환)·`1fe56196`(bank 탭 숫자가 기간필터 무시)·`4a13e0fb`(판재 자 규격 cm 오저장, 0601)는 목록 나열만 있고 개별 Read 흔적 없음** → Area6가 5건 전문 직접 diff Read.
> - **5건 직독 결과 — net-new 결함 0, 전부 사전에 CLAUDE.md 원칙(자기교정 산식·조용한 격하 인지·단일 정본화)을 스스로 준수**: ① `zoneByInventorySql` 공유 함수화로 게이트(축2)와 목적지(입고/차감)가 갈라질 여지 제거, prod 사전측정 1,106품목×2법인 결과변화 0건 확인 후 적용 + `test:inventory-zone` 26→39케이스. ② `judgeBasePriceSync` 순수함수로 판매품목 `base_price`(고객노출단가)를 매입단가로 덮지 않게 격리, prod 사전측정 367개 판매품목 중 135종 10%+ 이동(115종 하락, 대부분 정확히 −40%=매입가÷0.6) 확인 후 적용 + `client_item_prices`는 별도로 항상 기록(매입이력 손실 없음) + `test:purchase-price` 29케이스. ③ `judgeAvgCostFill`이 `avg<=0`일 때만 채우는 자기교정 조건(재실행 2회차 무동작) + SQL WHERE 이중가드 + 발주입고·수동입고 두 형제 경로 동시 적용(한쪽만 고치면 나머지 조용히 공백 잔존하는 #377류 위험을 이 커밋 자신이 피함) + `recalculate-avg` 무조건 덮어쓰기(entity 없는 items 테이블에 entity 필터를 걸어 "동산에서 눌러 선명 원가까지 바꾸는" 버그 동반)도 같은 판정으로 교체, prod 실측상 그 엔드포인트가 지금까지 0건 변경(원장 IN행 1건뿐+단가0) 확인 + `test:avg-cost` 30케이스. ④ `buildTxScope` 단일 헬퍼로 목록·집계(`/stats`)가 같은 범위(계좌·기간·입출금)를 보게 통일, 반환필드명을 `clause`로 유지해 `entity-audit.mjs` 정적감사가 격리 인식하도록 명시 주석. ⑤ 0601 마이그레이션 — 3*6/4*8(자) 오저장 18건을 cm로 환산, `amount` 불변·`unit_price`만 새 면적으로 되나눔(0596과 동일 규칙), 의심 3건(전표뭉침·A2모순·부착명패)을 용준님께 개별 보고 후 18건 전부 진행 확정된 근거가 마이그 주석에 기록됨, `_bak_0601_board_spec` 백업 + 재실행 멱등(`unit_price <> 목표값` 가드). **5건 모두 prod 영향치를 사전 실측하고 자기교정/원자적 batch/형제 경로 동시적용을 스스로 지킨 사례** — 기존 「누적 캐시」·「단가는 축이다」·「조용한 격하」 원칙이 코드 작성 시점에 이미 내재화된 것으로 판단, 신규 codify 대상 아님(원칙이 예방한 사례이지 원칙이 빠진 사례가 아님).
> - **open≠unfixed 재확인(close-pending 캐시 + 거울 규칙)**: `cashSchedule.ts`는 이번 11커밋 중 `18e22902`(cashflow §6)에서 변경됐으나(32회차 캐시 무효화 조건 충족) 직접 재grep — `getEntityId(c) || 1`이 여전히 406·567줄 잔존(#632/#635 대상 라인 이동, 로직 동일), `POST /schedule/check-overdue`(592줄)의 UPDATE/COUNT도 여전히 entity 절 없음(#631) = **#631/#632/#635/#636 전부 정상 open(미픽스), 오탐 아님**. `orderForm/itemRow.js`는 이번 churn에 없음(단가표기 커밋은 `calc.js`/`parent.js`만) → `width_${id}`/`height_${id}` oninput이 여전히 `calcItem(id)`만 호출 = **#634 정상 open(미픽스)**. #627/#628/#629/#630 대상 파일도 이번 churn 0건(close-pending 캐시, 32회차) 확인 후 재grep 생략.
> - **close-pending 재확인**: #616·#617은 owner 코멘트가 "실기 확인 대기"를 명시(64회차 FP룰) — 사이클 수와 무관하게 정상 open, 재통지 불요. #639(마이그 번호 중복)는 이번 신규 마이그 5건(0597~0601)에 중복 재유입 0건(`ls migrations | sort | uniq -d` 대조) 확인.
> - **standing scan 1: done-sync 절대값 재동기화(리터럴 쿼리)** — `search_issues("repo:kyj119/dongsan_mes label:auto-improve is:closed reason:completed")` **542**(변동없음) · `reason:not_planned` **4** + `reason:duplicate` **2** = rejected **6**(변동없음) · `list_issues(state:OPEN,label:auto-improve)` **24**(변동없음, #613·#616·#617·#622·#624~643 전건 일치).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런(HEAD `9dda3b7` 포함) 전부 `conclusion:success`.
> - **🧬 SKILL 강화**: 없음 — 이번 사이클은 #600 브리지가 정확히 의도대로 작동(목록엔 있으나 미개별화된 5커밋을 식별→직독→net-new 0 확정)한 실증. area-6-self-evolution.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재).
> - **백로그 트림 체크**: 아래 처리.
> - 신규 이슈 0건(11커밋 churn 전체가 #600 브리지+기존 로그 대조로 clean 확정, 비-웹앱 축 churn 0, open 재검증분(#631/#632/#634/#635/#636/#627~630) 전부 정상 미픽스, #639 마이그 중복 재유입 0), 자동수정 0건(고칠 결함 없음), done-sync: open 24(변동없음)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 1**.
>

> **Area 5 보안 + 인프라 (2026-09-09T21:47):**
> - **방법**: 세션 시작 시 detached HEAD `a6d9753`(origin/main과 동일)였으나 로컬 `main`은 `eecca71`(25커밋 뒤처짐) → `git checkout main` + `git merge --ff-only origin/main`으로 정합 + `git fetch --unshallow`(2,860여 커밋 확보). `npm ci`(0→81), `npx tsc --noEmit` clean, `npm audit --omit=dev` 0건.
> - **churn 확인(앵커 = 직전 Area5 방법 라인 HEAD `8c752b2`)**: 웹앱 범위(src/migrations/scripts) diff **27커밋** — Area1~4·6이 이번 세션 이미 각자 렌즈로 정독한 대출/차량자산·청구단가축·cashflow §6 웨이브와 동일 창(보안 렌즈로는 이번이 최초 통과). 신규 파일 diff는 마이그레이션 18건 + `src/scripts/shared/displayUnitPrice.js`(순수 표시 포맷터, DB 접근 0) 뿐 — **신규 라우터 파일은 0건**, 기존 라우터(`bank.ts`·`purchaseCandidates.ts`·`cashSchedule.ts`·`inventory.ts`·`inventoryValuation.ts`·`orders/*`·`printEvents.ts`·`purchaseOrders/po-receive.ts`·`quotations.ts`)의 증분만 직독.
> - **🔴 신규 발견 → #643 — `PUT /api/purchase-candidates/owners`가 `body.entity_id`를 검증 없이 INSERT/UPDATE에 사용, MANAGER가 타법인 발주담당을 임의 지정 가능(IDOR)**: `7c1cf06f`(09-08)이 신설한 이 엔드포인트는 `requireRole('ADMIN','MANAGER')`만 게이트하고 `entityFilter`/`getEntityId(c)`를 전혀 참조하지 않은 채 `Number(body.entity_id)`를 그대로 `supplier_owners` PK(entity_id, client_id)의 일부로 써서 `ON CONFLICT DO UPDATE`까지 수행 — 같은 파일 `GET /owners`가 `entityFilter(c,'po')`로 자기 법인만 조회하는 것과 강한 비대칭(형제가 격리하면 격리 의도 증거, Area5 기존 규칙). MANAGER는 `getEntityId(c)`가 항상 구체값이라(0은 ADMIN 전체모드 전용) 정상 UI 경로(프론트가 서버 제공 `r.entity_id`만 재전송)로는 안 열리지만, API 직접 호출로는 자기 법인이 아닌 `entity_id`를 넣어 타법인 거래처의 담당자 배정을 덮어쓸 수 있음. **`npm run audit:entity`가 이 클래스를 못 잡는 이유를 스크립트 자신이 이미 명시**(`entity-audit.mjs:27` "이 스크립트는 SELECT만 검사한다") — INSERT/UPDATE에 attacker-controlled entity_id를 직접 바인딩하는 패턴은 정적 게이트의 기존 문서화된 사각. 기존 codify된 「하위자원 append 엔드포인트 write-isolation」(2026-06-19, `POST /:id/items`류 — 자식 INSERT의 entity는 entityFilter-검증된 부모값에서 파생, body 신뢰 금지)과 같은 원리가 URL param이 아닌 **평평한 body 필드** 형태에도 적용됨을 재확인한 사례 — 별도 신규 클래스는 아니라 SKILL 신규 codify는 보류(기존 규칙이 이미 커버, 사각은 이미 스크립트 자체가 인지). **issue-only(#643, S)** — IDOR 클래스는 이 프로젝트 컨벤션상 owner 검토 후 반영(egress 차단으로 런타임 검증 불가 + 기존 IDOR=owner 워크플로).
> - **`bank.ts` +186줄(대출계좌 자동매칭·미반영사유 칩·마이너스통장 한도) 전문 직독 — net-new 취약점 0건**: 신규 SQL 전부 `requireRole('ADMIN')` 라우터 상속 + `entityFilter(c,'l')`/`(c,'expense_categories')` 일관 적용. `pendingReasonSql('bt')`/`reasonCountSql`(PENDING_REASON_KEYS 상수 기반 인터폴레이션, 주석이 스스로 "키 목록은 상수라 인터폴레이션 안전"이라 명시)과 `pending_reason` 쿼리파라미터는 화이트리스트(`isPendingReasonKey`) 통과 후 `?` 바인딩 — SQL 인젝션 표면 없음. `credit_limit` PUT은 `hasOwnProperty` 존재판정 + `Number()` 강제, entity 격리는 기존 `ef.clause`(#437에서 이미 픽스된 패턴) 유지. `loanAccountMatch.ts`/`bankPendingReason.ts` 신규 유틸 둘 다 순수함수(`grep DB.prepare` 0건).
> - **XSS standing scan**: `node scripts/check-xss.mjs`(문서화된 레시피 버전, 2026-09-06부터 매 사이클 편입) 재실행 후 이번 churn 파일(bank.js/cards/misc.js/orders.js/purchaseCandidates.js/zonePicker.js) 후보 전수 대조 — 전부 이미 escape 적용됐거나(escapeHtml/escHtml/pcqEsc/window.escapeHtml) 이번 churn 밖(FP 기존 라인, `git diff 8c752b2..HEAD`로 미변경 확인) — **net-new 미이스케이프 sink 0건**. 신규 owner 배정 UI(`purchaseCandidates.js` `pcqRenderOwners`)의 `<option>` value/텍스트·client_name/entity_name/note 전부 `pcqEsc` 일관.
> - **standing scan 1: 시크릿 폴백** `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → `fax.ts:43` 1건뿐(기존 FP, 변동없음).
> - **standing scan 2: `body.password ||` 기본값** → 0건.
> - **standing scan 3: `npm run audit:entity`** — 검사 134파일·entity테이블 SELECT 74건·**누락 0건**(변동없음, 위 #643은 이 스캔의 문서화된 사각 밖 클래스).
> - **standing scan 4: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지.
> - **standing scan 5: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 6: `npm audit --omit=dev`** — 0건(prod 청정, 변동없음).
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 8런(HEAD `a6d9753` 포함) 전부 `conclusion:success`.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` totalCount **23**(신규 등록 전) 기존 23건 전건 일치(#613·#616·#617·#622·#624~642) 확인 후 #643 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **24**(23→24, #643 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-5-security-infra.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). #643은 기존 「하위자원 append 엔드포인트 write-isolation」·「형제 비대칭 IDOR」 두 클래스의 합성 사례라 별도 codify 불요(원리는 이미 문서화, `entity-audit.mjs`의 SELECT-only 사각도 스크립트 자신이 이미 주석으로 인지).
> - **백로그 트림 체크**: 아래 실행.
> - 신규 이슈 1건(#643 purchase-candidates owners PUT의 body.entity_id 미검증 IDOR, S, issue-only), 자동수정 0건(IDOR=owner 워크플로 대상), done-sync: open 23(23→24)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 6**.
>

> **Area 4 데이터 정합성 (2026-09-09T15:55):**
> - **방법**: 세션 시작 시 detached HEAD `bd57b39`(origin/main과 동일 커밋이나 얕은 clone, 50커밋) → `git checkout main` + `git merge --ff-only origin/main`(변동 없음, 이미 최신) + `git fetch --unshallow`(2,860여 커밋 확보). `npm ci`(0→81), `npx tsc --noEmit` clean.
> - **churn 확인(앵커 = 직전 Area4 방법 라인 HEAD `8f55dd0`)**: 웹앱 범위 diff **29커밋** — Area1·2·3·5·6이 이번 세션 이미 각자 렌즈(응답시간·코드품질·UX·보안·자기진화)로 정독한 은행매칭/차입금/차량자산/청구단가 웨이브와 동일 창. **데이터정합성 렌즈로는 신규 마이그 18건(`0586`~`0601`) 전수 직독이 이번이 최초**.
> - **`db:bootstrap:ci` 전량 재적용** — 이번 사이클 신규 18건 포함 전체 마이그레이션 **전건 ✅**(CHECK/FK 위반 0). 차량할부 스케줄(0593)의 `INSERT ... SELECT ... WHERE EXISTS(loans.id)` 가드(2c20b546/9954d32f)가 빈 부트스트랩 DB에서 의도대로 no-op 확인(Area6가 이미 확인한 자체수정과 동일 메커니즘, 데이터정합성 렌즈로 재확인).
> - **entity_id 표본 검증(로컬 D1 직접 쿼리)**: `loans`/`loan_payments`/`fixed_assets` 전부 NULL·0 없음, `loan_payments.entity_id` vs 부모 `loans.entity_id` 불일치 0건(스포티지 8488=entity2, 나머지 entity1 전부 일치) — 신규 loans/vehicle 웨이브 net-new entity 오기록 0.
> - **0586 supplier_owners 신설 — CLAUDE.md 두 원칙을 스스로 준수**: 시드 쿼리의 `ROW_NUMBER() OVER (... ORDER BY SUM(poi.amount) DESC, sz.id ASC)`가 처음부터 고유키 tie-break(`sz.id`)를 포함(「목록 정렬」 원칙), 귀속 구역 산식이 `utils/inventoryZone.RECEIVING_ZONE_JOIN_SQL`과 동일해야 함을 주석에 명시(마이그가 TS를 못 불러 사본이 생긴 것일 뿐 정본은 TS쪽) — net-new 결함 없음.
> - **0600 order_line_pricing_snapshot 백필 완전성 확인 + 소비처 대조 중 🔴 신규 발견**: 마이그 자체(컬럼 추가+백필)는 안전(금액 미변경, item_id NULL 340건은 NULL=FIXED 의미로 문서화). 소비처 전수(`grep -rn pricing_method src/routes src/utils`) 대조 결과 `orders/core.ts:433`은 `COALESCE(oi.pricing_method, i.pricing_method)`로 스냅샷을 정확히 우선하는데, **`utils/costCalculator.ts:112-123` `recalculateOrderCosts()`는 스냅샷 컬럼을 전혀 SELECT하지 않고 `i.pricing_method`(품목의 오늘 축)만 읽는다**. 이 함수는 `order_items.amount`가 NULL/공백인 옛 라인에 한해 `computeLineAmount()`로 금액을 재구성해 `margin_rate`를 계산(DB에는 amount 자체가 아니라 cost/margin만 쓰기)하는데, 이때 넘기는 축이 라인 스냅샷이 아니라 품목 현재 축이라 **0600이 막으려던 시나리오(품목 축 변경 후 과거 라인이 "오늘의 축"으로 재구성)가 마진 계산에서 재현**된다. 호출처가 주문 생성·수정·복사·견적전환·상태전이·`POST /costs/backfill` 전부(9곳)라 파급 범위가 넓고, 백필은 정확히 "amount 없는 옛 행"을 표적으로 삼는 기능이라 0600의 실제 유발 사례(UV판재·거치대 재배치)와 같은 품목이 지나가면 마진 리포트가 조용히 틀어짐 — **issue-only(비즈니스 로직=마진 산식 변경, #642 등록)**. `routes/prices.ts`·`quotations.ts`·`items.ts` 등 나머지 소비처는 라인 스냅샷 개념이 아직 없던 견적/품목 자체 조회라 해당 없음(정상).
> - **중복 마이그레이션 번호 재발 확인(#639)**: 이번 18건에서도 2쌍 추가(`0587` 차입금계정↔구역담당권한, `0596` 단가축정정↔QM6대출) — 대상 테이블·컬럼 비겹침으로 우연히 무해(부트스트랩 전건 통과로 확인). 신규 이슈 대신 **#639에 재발 코멘트 등록**(누적 9쌍, 근본수정 미착수 상태 유지 확인).
> - **standing scan 1: `npm run audit:entity`** — 검사 134파일·entity테이블 SELECT 74건·**누락 0건**(변동없음).
> - **standing scan 2: `node scripts/sort-audit.cjs`** — P1 **0건**(변동없음), P2 3건 전부 기존 FP 유지(`attendance.ts:158`·`dashboard.ts:420`·`workbench.ts:577`).
> - **standing scan 3: `npm run branch:clean`** — SAFE-remote 0·SAFE-absorbed 0·REVIEW 0, SKIP 1(main) — 삭제대상 0건.
> - **standing scan 4: `npm audit --omit=dev`** — 🔴 **1건 신규**(변동, 직전까지 0건 유지) — `hono@<4.13.5` moderate CVE 3종(toSSG 경로탈출 불완전수정·parseBody 무제한 중첩→메모리고갈·쿼리파서 URL fragment 이후 파라미터 읽기). `npm audit fix`는 wrangler↔workers-types peer 충돌(#613, 기존 known)로 막혀 **`npm install hono@^4.13.5`로 hono만 단독 승격**(4.13.7, package.json 범위 `^4.13.2` 내). typecheck·build·`test:orderline`(30/30) 확인 후 **직접 커밋+push**(`6c31919b`) — 재적용 후 `npm audit --omit=dev` 0건 재확인.
> - **CI 헬스**: `actions_list(deploy.yml)` 최근 6런(직전 HEAD `bd57b39` 포함) 전부 `conclusion:success`. 이번 사이클 자동수정 커밋(`6c31919b`)의 배포는 조회 시점 `in_progress` — 다음 사이클(Area5)이 착수 시 재확인.
> - **open 이슈 재확인(open≠unfixed)**: `list_issues(state:OPEN,label:auto-improve)` totalCount **22**(신규 등록 전) 기존 22건 전건 일치(#613·#616·#617·#622·#624~641) 확인 후 #642 신규 생성.
> - **backlog↔GitHub 절대값 재동기화**: open **23**(22→23, #642 신규) · done **542**(변동없음) · rejected **6**(변동없음).
> - **🧬 SKILL 강화**: 없음 — area-4-data-integrity.md `line N` 잔여참조 재확인(0건, 이미 서술식 각주만 존재). 이번 발견(라인 스냅샷 도입 후 소비처 일부 미적용)은 기존 「축 드리프트 sweep」·「형제 미완결」 클래스의 변형(스냅샷 컬럼 자체는 신설이 완전했으나 *소비처* sweep이 미완결)이라 별도 codify 불요 — 기존 sweep 레시피("신규 컬럼 추가 시 grep으로 소비처 전수 대조")가 이번에도 그대로 작동해 발견함.
> - **백로그 트림 체크**: `npm run backlog:trim -- --check` — 사이클 로그 10→11건, 임계(13건) 미만, 트림 불요.
> - 신규 이슈 1건(#642 recalculateOrderCosts가 0600 라인 과금축 스냅샷 미반영 — margin_rate가 옛 라인에서 품목 현재축으로 재구성됨, S, 마진 산식 변경이라 issue-only), 자동수정 1건(hono 4.13.2→4.13.7 dependency bump, moderate CVE 3종 해소, `6c31919b`), done-sync: open 22(22→23)·done 542(변동없음)·rejected 6(변동없음). 다음 순번 **Area 5**.
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
