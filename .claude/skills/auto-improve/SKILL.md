---
name: auto-improve
description: 자율 점검·개선 에이전트. 6개 영역을 순환하며 실질적 문제 발견 + 안전한 수정 자동 적용 + 기능 제안. "자동 개선", "점검", "patrol", "backlog" 요청 시 사용. /loop과 결합하여 주기적 실행 가능.
---

# 자율 점검·개선 에이전트 (Auto-Improve)

프로젝트를 6개 영역으로 나누어 순환 점검. 각 실행마다 **하나의 영역**에 집중하여 깊이 있는 분석 수행.

## 핵심 원칙

1. **발견만 하지 말고 고쳐라** — 안전한 수정은 직접 적용 + build/E2E 검증
2. **현실적 가치만** — "코드 스타일" 같은 사소한 것 무시, 비즈니스 영향 있는 것만
3. **ultrathink** — 표면적 lint가 아니라 "이 기능이 실제로 쓸모 있는가?" 수준의 분석
4. **자기 진화** — 매 실행마다 자신의 탐지 패턴도 개선

## 6개 점검 영역 (4시간 간격 순환)

### 🔴 Area 1: 프로덕션 헬스

**목적**: 지금 이 순간 시스템이 정상인가?

점검 항목:
- 프로덕션 URL 주요 API 응답 (Playwright MCP 또는 fetch)
  - `/api/auth/login`, `/api/orders`, `/api/cards`, `/api/clients` 등 핵심 20개
  - 200 아닌 응답 → 즉시 🔴 기록
- LogWatcher 하트비트 신선도 (`/api/logwatcher/heartbeat` 또는 DB 직접 조회)
  - 마지막 heartbeat > 1시간이면 경고
- CAPS 동기화 신선도 (`/api/sync/pending` 상태)
- E2E 결과 분석 (GitHub Actions 최근 실행)
  - 실패한 테스트 있으면 원인 분석 + 자동 수정 시도
- 콘솔 에러 (Playwright로 주요 페이지 5개 로드, console.error 수집)

**자동 수정 가능**: E2E 실패 원인이 명확한 코드 버그일 때

> **🧊 배포후 smoke 로그인 500 = D1 cold-start transient (Area 1 #400·#374, 2026-06-13)**: Deploy 단계는 `✨ Deployment complete!`로 성공했는데 **post-deploy smoke 로그인만 500**으로 잡 fail("즉시 확인 필요" 알람)이면 **코드 버그가 아니라 갓 배포된 worker의 D1 cold-start 지연**일 가능성 높음. 판별: ① 로그인 응답이 **수십초 지연 후 generic catch 500**(`로그인 처리 중 오류`)인지(즉시 4xx는 진짜 인증실패) ② **직후 배포(다음 커밋)에서 자동 회복**됐는지 — 둘 다 yes면 transient(prod 무중단, 배포 자체 성공). `smoke.cjs:205` login()이 #374로 5xx 재시도(MAX=3)를 갖췄으나 **깊은 cold-start엔 3회 윈도가 부족**(#400 `02071f7`은 retry 포함하고도 fail). **재발 자체를 코드결함으로 오판 말 것** — Deploy success + 다음배포 green이면 헬스 정상. 진짜 보고대상은 **연속 배포가 모두 같은 실패**(자동회복 안 됨)이거나 deploy 단계 자체 failure(빌드/wrangler).

> **🧯 학습된 패턴 — 정적에셋 MIME/Content-Type 회귀는 smoke(API)로 미탐지 (Area 1, 9dd09cd→144addf→24bb493 2026-06-11, prod 2회 다운)**: 클라 셸 `shell.js`를 `/static`으로 **외부화**(9dd09cd 파일럿)하면, CF Pages **Git 자동빌드** 환경에서 `_routes.json`의 `/static/* 제외`가 미적용되어 워커가 `/static/shell.js`를 **Content-Type 빈값('')으로 서빙** → 브라우저 strict MIME가 "not executable"로 **실행 거부** → `shell.js`(axios 인증헤더·법인 스위처 초기화) 사망 → **전 페이지 API 401 + 무한 로딩 + 법인 미표시**. `_headers`에 Content-Type 명시(144addf)도 자동빌드선 불충분 → **최종 해결 = 인라인 `?raw` 복귀**(24bb493: shell.js를 워커 HTML에 직접 포함 → /static·_routes.json·_headers·빌드순서 의존 전무, 자동/수동 배포 무조건 동작). **핵심 교훈 2가지**: ① `scripts/smoke.cjs`는 API를 직접 fetch라 이 프론트 실행 실패를 **구조적으로 못 잡음**(로그인 API 200이어도 UI는 죽음) → 회귀 신호는 **E2E 콘솔에러·shell.js 로드 확인**에만 잡힘. ② CF Pages Git 자동빌드는 `_routes.json`/`_headers`/빌드순서를 신뢰 못 함 → 핵심 부트스트랩 스크립트는 외부화보다 인라인이 robust. 점검 트리거 = `build-assets.mjs`·`_headers`·`_routes.json`·`/static/*` 파이프라인 변경 시 + Area 1 헬스에서 prod 페이지 콘솔에러 1개라도 있으면 MIME/shell 로드부터 의심.

---

### 🟡 Area 2: 코드 품질 심층 분석

**목적**: 숨겨진 버그와 기술 부채 발견

점검 항목:
- `INSERT INTO` 전수 스캔 → entity_id 누락 (이전에 14건 발견한 패턴)
- `models.ts` 타입 vs 실제 DB 스키마 (PRAGMA table_info) 비교
- authMiddleware 누락 라우트 탐지
- N+1 쿼리 패턴 (for 루프 안에 DB 쿼리)
- dead code (export했지만 import 안 된 함수)
- `SELECT *` 사용처 (점진적 명시 컬럼 전환 대상)

**자동 수정 가능**: entity_id 누락, 타입 불일치, dead code 제거

> **🔁 파일분할 후 "부분 픽스" 회귀 — 컬럼오타/안티패턴은 코드베이스 전수 재grep 후 close (Area 6 #377, 2026-06-12)**: 같은 버그(예: `items.name` 미존재 컬럼)가 **분할 전 단일파일과 분할 후 산재 위치 양쪽**에 존재하면, 이슈가 지목한 라인만 픽스하고 close하면 형제 경로가 잔존. 실증: #377 원 위치 `orders/core.ts:1489`가 분할로 `autoProcess.ts`(/start·/approve)와 `orders/create.ts:643`(주문생성 자동가공)로 흩어졌는데 owner 픽스 `eadba44`가 autoProcess.ts만 정정 → create.ts 잔존(best-effort catch에 삼켜져 `auto_process_jobs` 영구 미생성). **규칙**: ① 컬럼오타/로직버그 픽스·done-sync 검증 시 반드시 `grep -rn "<안티패턴>" src`로 **코드베이스 전수 재확인**(`SELECT .* name FROM items` 등) 후에야 close. ② done-sync에서 "커밋이 이슈 픽스함"을 신뢰하기 전, 이슈 본문이 지목한 **원 라인이 파일분할로 이동했는지** + 그 이동처가 픽스에 포함됐는지 git 추적. items.name 클래스 누적 = #377(2경로)·#384(cards.entity_id 5곳)·A-017(workbench cl.name) → 동일 클래스가 반복 산재하므로 "한 곳 고침"≠"전수 해소".

> **🎯 존재X 컬럼 = 최고 생산성 탐지 클래스, "INSERT 컬럼셋 diff"로 빠른 격리 (Area 2/4 standing scan, Area 6 codify 2026-06-13)**: SELECT/INSERT가 미존재 컬럼을 참조하면 prepare 단계 throw(COALESCE로도 못 막음)라 **해당 기능 100% 영구 사망**(회귀 아닌 도입 이래 깨짐). 누적 6건 = #377(items.name)·#384(cards.entity_id 5곳)·#394(inventory_transactions에 inventory_adjustments 컬럼 혼동)·#397(employees.rrn=resident_number)·A-017(workbench cl.name)·A-019(create.ts items.name) → **매 Area 2/4 사이클 standing scan 대상**. **빠른 탐지 레시피 (실증, #394 정밀 격리)**: 같은 테이블에 INSERT하는 핸들러를 **전수 grep 후 컬럼 목록을 나란히 diff** — `grep -rn "INSERT INTO <table>" src/routes -A2` → 7곳은 `transaction_date/quantity/balance_after/handled_by`인데 1곳만 `quantity_before/quantity_after/quantity_change/created_by` = **outlier가 곧 typo**(다른 테이블 스키마 혼동). 같은 원리로 SELECT는 `grep -rn "FROM <table>"` 후 컬럼 교집합에서 벗어난 SELECT가 후보. **ground-truth 대조 필수**(`grep -rn "<컬럼>" migrations/` = 0건이면 미존재 확정, alias `as X`·다른 테이블 동명 컬럼은 FP — #397에서 tax-agent `resident_number`·insuranceReports `as rrn`은 정상). **자동수정 판정**: read-only SELECT 오타(workbench cl.name·create.ts)는 직접 수정 가능(A-017/A-019), **재고/재무 dormant-write 활성화**(#394 inventory_transactions·#384 cards entity write)는 owner 검증(휴면 write 깨우면 egress로 결과 검증 불가).

> **🧭 도달성(reachability) 선검증 (Area 2·5 #334)**: entity_id 격리 갭을 **멀티테넌시 보안 이슈**로 분류하기 전, 해당 라우터/엔드포인트가 프론트에서 실제 호출되는지 확인 — `grep -rn "api/<path>" src/scripts src/pages`. **호출처 0건이면 orphan 라우터 = dead code 사안**(보안 영향 없음, 삭제/정리 권고로 분류). index.tsx에 `app.route()` 마운트만 돼 있다고 "사용 중"이 아님. (#334 order_templates가 보안 갭으로 오분류됐던 근본 원인 — `/api/templates`는 마운트만 되고 프론트 호출 0건)
>
> **⚠️ 도달성 규칙 예외 — 범용 서빙 프록시 (Area 5·6 #365)**: 위 "0건=dead code"는 **UI 트리거형 격리 갭**(특정 화면에서만 호출되는 `/:id` 핸들러)에만 적용. **클라이언트 제공 키로 raw 리소스를 서빙하는 범용 엔드포인트**(R2 파일 프록시 `files.ts` GET `/*`·generic download-by-key)는 프론트 참조 0건이어도 **인증된 직접 HTTP 호출이 곧 공격표면**(키가 구조적이거나 다른 API 응답에 노출돼 추측·도달 가능) → dead-code로 강등하지 말고 보안 이슈로 보고. 판별 기준: 핸들러가 (a)UI 컨텍스트 없이 임의 식별자/키만으로 (b)DB·entity·역할 검증 없이 리소스를 반환하면 도달성 무관하게 공격표면.

> **🚫 오탐 — 금액 부동소수점 누적 (Area 2 2026-06-08, 7회차)**: "VAT/금액을 반올림 없이 누적해 원 단위 신고 오차"는 **금액이 누적 직전에 정수로 반올림**되면(예: `quotations.ts:223` `Math.round(itemAmount/100)*100` → 100원 단위 정수, `×0.1`=10의 배수=정수) IEEE754 drift 불가. 보고 전 `node -e "...Number.isInteger(누적값)"`로 반증 필수. 견적(추정 금액)↔세금계산서(`Math.round` per-item + `total≠supply+tax면 강제정렬` 정합보정) "반올림 불일치"도 발행단계가 권위계산이라 버그 아님. models.ts `number`↔스키마 `REAL/INTEGER` 타입 표기차도 정상 TS(D1 바인딩 관행).

> **🚫 오탐 — best-effort catch "데이터손실" (Area 2 2026-06-08)**: catch가 에러를 잡고 `{success:true}` 반환해도, try 안이 **부차 denormalized 물질화**(가격이력·cash_schedule 등 언제든 재계산 가능한 파생)이고 **주석에 best-effort 명시**(예: `purchaseInvoices.ts:131/164` "receive Phase4와 동일 정책")면 의도적 설계. **핵심 비즈니스 write(주문/인보이스/잔액/재고)가 try 밖**이면 오탐. batch 실패 후 보상(rollback) `DELETE ... .catch(()=>{})`도 보상 자체 실패는 더 할 게 없어 정상. 보고하려면 **핵심 mutation**이 삼켜지고도 success로 응답하는 구체 경로를 실증.

> **⚖️ 트랜잭션 원자성 — 보고 기준 (Area 2 #369, 2026-06-09)**: "핵심 write가 `DB.batch()` 없이 분리 await 실행 → 부분실패 시 고아/불일치"는 **대부분 오탐**. 분리가 강제된 정상 패턴부터 배제:
> - **구조적 강제 = 정상**: 부모 INSERT가 `result.meta.last_row_id`를 받아 자식 INSERT에 써야 하면 부모는 batch 밖에 둘 수밖에 없음(bank.ts apply matched_payment_id·shipments.ts 출고헤더·orders/core.ts 주문헤더). 중간에 READ가 끼어(`balance_after` 산출용 잔량조회 등) batch를 둘로 나눠야 하는 것도 구조적. 이들은 단순 "2번째 write 실패하면?"이라 **확정 트리거 없는 일반 비원자성 = 노이즈**.
> - **보고 가능 = ① 확정 재현 트리거 + ② 회피 가능성**: ① 멱등 가드 부재로 **재시도/중복제출이 destructive write(재고차감·금액차감)를 반복**하는 구체 경로(부분실패→500→목록 잔류→재클릭, 또는 버튼 비활성화 없는 더블클릭). ② 분리가 last_row_id 강제가 아니라 read 끼임이면 **read를 메모리 산출로 대체해 단일 batch화 가능** → 설계로 고칠 수 있는 진짜 갭. #369(inventory inspection-decision CANCELLED)가 둘 다 충족: 멱등 가드 0 + balance_after 메모리 산출로 원자화 가능. 보고 전 (a)해당 mutation이 재고/금액/잔액 변경인지 (b)선행상태 가드(`WHERE status!=...`)·프론트 버튼 재진입 가드가 있는지 확인.

> **🚫 오탐 — `SELECT o.*` 있는데 특정 컬럼 "SELECT 누락" 보고 (Area 3 2026-06-11, 9회차)**: 쿼리가 `SELECT o.*, c.client_name, ...` 형태로 **`o.*`(테이블 와일드카드)로 시작**하면 그 테이블의 **모든 컬럼이 이미 응답에 포함**됨. 뒤에 명시 나열된 건 JOIN 테이블 별칭/서브쿼리 계산값일 뿐. 따라서 "프론트가 `o.billable_after`를 기대하는데 SELECT에 없어 기능 불능"식 보고는 **`o.*`가 존재하면 오탐**(`billable_after`는 migration 0178 ALTER로 추가된 orders 실제 컬럼 → `o.*`에 포함되어 정상 반환). 서브에이전트가 `o.*` 뒤 명시 필드 목록만 훑고 "명시 누락"으로 오독하는 패턴(자기모순 — 본문에 `o.*` 인용하고도 누락 주장). **보고 전 확인**: ① SELECT가 `<alias>.*`로 시작하는지 ② 문제의 컬럼이 그 테이블(alias)의 실제 컬럼인지(migrations grep). 둘 다 yes면 드롭. (orders/core.ts:32 `o.*` ↔ taxInvoices.js billable_after 필터, FP 차단)
>
> **🚫 오탐 — batch 결과 배열 인덱스 "정렬 불일치" 오독 (Area 4 2026-06-10, 9회차)**: 부모-자식 2-pass batch에서 stmt 배열과 메타 배열(예: `parentStmts[]` + `parentClientGroupIds[]`)을 같은 루프에서 push 후 `results[i]`로 매핑할 때 "한쪽 push는 `continue`로 건너뛰는데 다른 쪽은 무조건 실행 → 길이 불일치 → 매핑 깨짐"으로 보고하기 전, **두 push가 같은 루프 안 같은 `continue` 가드 뒤에 있는지** 반드시 확인. `if (item.parent_client_id) continue`가 **루프 최상단**이면 자식 행은 두 push를 **모두** 건너뛰어 배열 길이 동일 → 정합(orders/core.ts:2207-2280·quotations.ts:273-320이 이 형태, 정상). 오탐 회피 = (a)continue의 줄 위치가 첫 push보다 위인지 (b)두 push 사이에 별도 early-continue/조건 push가 있는지 직접 Read로 확인. 서브에이전트가 이 control-flow를 오독해 HIGH로 과대보고한 사례 2건 차단(둘 다 같은 가드 뒤 push).

---

### 🟢 Area 3: UX/기능 감사 (가장 중요)

**목적**: 실제 사용자 관점에서 "이게 있으면 좋겠다"를 발견

점검 방법:
- Playwright MCP로 각 페이지를 실제로 탐색
- 각 페이지별 체크:
  - 빈 상태 (데이터 0건일 때) 메시지가 있는가?
  - 검색/필터가 충분한가? (전화번호 검색, 날짜 범위 등)
  - 모바일 반응형이 깨지는 곳은?
  - 로딩 상태 표시가 있는가?
  - 에러 발생 시 사용자에게 의미 있는 메시지가 나오는가?
- 페이지 간 흐름 점검:
  - 주문 → 카드 → 출고 → 회계반영 전체 journey
  - 빠진 링크, 불편한 navigation
- 대시보드 점검:
  - 현재 KPI 카드가 실질적 가치가 있는가?
  - 누락된 KPI (일일 매출, 납기 준수율, 미수금 연체 등)
  - 차트/그래프 필요성

**자동 수정 불가** — IMPROVEMENT_BACKLOG.md에 구체적 제안 기록

> **🚫 오탐 — 프론트 필드명 ≠ DB 컬럼명 "round-trip 데이터 손실" (Area 3 2026-06-12, 11회차)**: 폼 payload가 `meal`/`transport`로 보내는데 편집모달 로드는 `meal_allowance`/`transportation_allowance`로 읽으면 "필드명 불일치 → 저장 시 데이터 손실"로 보고하기 전, **서버 핸들러의 매핑을 확인**. 이 코드베이스는 `core.ts:294` `body.meal != null ? Number(body.meal) : ...` → `meal_allowance` 컬럼에 저장하는 식으로 **프론트 단축필드(`meal`) → 서버 read(`body.meal`) → DB 컬럼(`meal_allowance`) → 편집로드(`p.meal_allowance`)** 전체 라운드트립이 정합. 프론트 전송키와 DB 컬럼명이 다른 건 정상 패턴(서버가 변환). **보고 전 확인**: ① 폼이 보내는 키(`prGetFormPayload`) ② 서버 save 핸들러가 그 키를 읽는지(`body.<키>`) ③ 저장 컬럼 ④ 편집로드가 그 컬럼을 읽는지 — 4단계 전부 추적해야 "손실"인지 판정 가능. 한쪽(전송키 vs 로드키)만 보고 불일치 단정 금지(서브에이전트가 자기모순으로 "필드명 맞음 ✓"이라 적고도 HIGH 보고한 사례 차단).

> **🚫 오탐 — "페이지 간 네비게이션 링크 부재" (Area 3 2026-06-12, 11회차)**: 주문→카드, 출고→회계반영 등 cross-page 진입 링크가 "없다"고 보고하기 전, **pages/*.ts 정적 템플릿뿐 아니라 scripts/*.js의 JS-렌더 상세모달·액션버튼까지** grep. 이 코드베이스의 cross-page 링크는 대부분 **목록 행이 아니라 상세모달/액션버튼**에 있음 — 예: orders 목록표(`orders.ts`)엔 카드 링크가 없지만 주문 상세모달(`orders.js:989`)에 `<button onclick="location.href='/cards?search='+order.order_number">카드 현황</button>`이 status 조건부로 존재. **보고 전 확인**: `grep -rn "/cards\|/tax-invoices" src/scripts src/pages`로 **양쪽 전수** 후에도 0건일 때만 보고. 서브에이전트가 page.ts 테이블만 보고 "링크 없음"으로 오독한 사례 차단(상세모달 미확인).

> **🔎 HTML↔JS silent-fail 전수 자동화 diff (Area 3 standing scan, 2026-06-15 codify)**: `?raw` import JS의 `getElementById` 대상 id가 pages 템플릿/동적 렌더에 없으면 silent fail = CLAUDE.md 명시 critical 함정. **빠른 전수 레시피**: ① `grep -rhoE "getElementById\('([^']+)'\)" src/scripts/` 로 id 리터럴 전수 추출(unique) ② `grep -rhoE "id=[\"']([a-zA-Z0-9_-]+)[\"']" src/pages/ src/scripts/` + `\.id *= *'...'` 동적할당까지 합쳐 id= 코퍼스 구성 ③ `comm -23`로 **getElementById엔 있으나 id= 어디에도 없는** 잔차만 격리. **잔차 해석(거의 다 FP)**: (a) `shell.js`(layout 셸) self-contained 참조(sidebar/entitySwitcher/notif*/cmd*/msg* 모달/topbar 등 ~40개) → 정상, (b) 스크립트 자체 innerHTML 동적 렌더(extractPanel/token-login-note/nav-badge 등 같은 파일이 그림) → 정상, (c) `if(el)` 가드로 graceful degrade. **진짜 보고 대상 = cross-file 미존재 + 미가드**(요소도 콜백도 부재). 2026-06-15 12회차 = 2212 리터럴 전수 diff 잔차 ~50건 **전부 (a)(b)(c)**, 유일 outlier가 dead code(A-023 itemSearch: 요소·`applyFilters` 콜백 양쪽 제거됨, `bulk.js:515` 주석 실증) = dead-code 제거 자동수정. **서브에이전트 "확인 필요" silent-fail은 대개 FP**(pages에 실재 — zoneFilter/filterCard 사례) → owner가 pages grep로 직접 확정 후에만 보고.

> **🚫 오탐 — "필터 변경 후 미갱신"인데 explicit-search 버튼 존재 (Area 3 2026-06-15, 12회차)**: 탭/필터 전환 시 자동 로드가 없다고 "stale 데이터 MED" 보고하기 전, 해당 패널에 **명시적 "조회"/"검색" 버튼(`onclick="loadXxx()"`)과 placeholder 안내가 있는지** 확인. 이 코드베이스는 무거운 집계 탭(세금계산서 월합산 `taxInvoices.js` `switchMainTab('monthly')`은 기간 기본값만 세팅 + `<button onclick="loadMonthlyEligible()">조회` + `monthlyContent` placeholder "대상 월을 선택하고 조회하세요")을 **의도적 explicit-search**(자동 로드 X)로 설계 — auto-load 아님이 버그 아니라 의도. **보고 전 확인**: ① 패널에 조회 트리거 버튼이 있는지 ② 초기 placeholder가 사용자에게 다음 액션을 안내하는지. 둘 다 yes면 드롭(서브에이전트가 onchange auto-load 부재만 보고 "미갱신"으로 오독한 사례 차단).

---

### 🔵 Area 4: 데이터 정합성

**목적**: DB 데이터가 논리적으로 맞는가?

점검 항목 (D1 직접 쿼리):
- 고아 레코드: order_items.order_id가 존재하지 않는 orders 참조
- 상태 불일치: orders.status=SHIPPED인데 cards.status=PRINTING
- 중복 데이터: 같은 client_code, 같은 order_number
- 누락 필수값: delivery_date NULL인 CONFIRMED 주문
- 인덱스 효율: 자주 쿼리되는 컬럼에 인덱스 있는지
- entity_id=0 또는 NULL인 트랜잭션 레코드

**자동 수정 가능**: 인덱스 추가 (마이그레이션), 데이터 정합성 경고

> **🤖 NOT NULL no-default + 전체 컬럼셋 자동 diff (Area 4 standing scan, 2026-06-15 codify, 13회차)**: ground-truth DB에서 테이블별 ① NOT NULL no-default 컬럼셋(`PRAGMA table_info` `notnull===1 && dflt_value===null && pk!==1`) ② 전체 컬럼셋을 추출 → `src/**/*.{ts,js}`의 `INSERT INTO <t> (cols) VALUES/SELECT` 컬럼리스트를 정규식 파싱해 **`missing`(NOT NULL 누락→constraint throw)·`unknown`(존재X 컬럼→no such column throw)** 자동 격리. 단순 콤마 리스트만(서브쿼리/괄호 포함 컬럼셋·`${동적}` 템플릿은 스킵=FP 회피). #394(missing 3+unknown 4)·#406(unknown 6+severity+오타)·**#408(migration.ts items.unit_price unknown)** 전부 이 스캔이 한 번에 격리. **핵심 사각 — import/migration 핸들러 포함**: `/items/preview`(SELECT만)는 통과하나 `/items/import`(INSERT/UPDATE)만 존재X 컬럼 throw = **미리보기 OK인데 실제 실행만 전량 실패하는 침묵 함정**. preview↔execute 분리 핸들러는 execute 경로의 write 컬럼셋을 별도 검증.
>
> **🧭 Ground-truth 기법 (Area 4)**: 프로덕션 D1 직접 접근 불가 시 → `migrations/*.sql` 전체를 로컬 D1에 적용해 **실제 해석 스키마**(테이블/인덱스/UNIQUE) 확보 후 정적분석과 교차검증.
> 인덱스·UNIQUE 누락 후보는 대부분 오탐(컬럼 존재하나 hot query path 아님 / 이미 복합 인덱스 존재) → ground truth로 반증 필수. (Area 4에서 tax_invoices·shipments 2건 오탐 차단)

> **🕒 업무일자 UTC vs KST 탐지 규칙 (Area 4 #366, 2026-06-08)**: SQLite `date('now')`/`datetime('now')`는 **UTC**라, **업무 의미를 갖는 날짜**(처분일·주문일·자동완료일·납기경과·연체판정 등)에 raw로 쓰면 KST 00:00~09:00 입력 건이 하루 전일로 어긋남. 같은 코드베이스가 KST를 알고 있음이 증거 = `hr.ts:801` `Date.now()+9h`·`hr.ts:816` `'now','+9 hours'`(근태) → KST가 의도인데 나머지 미보정 = 불일치.
> - **우선순위**: 저장되는 DATE 컬럼(`disposed_at`/`order_date`/`auto_complete_date`)은 시간정보 없어 **영구 off-by-one**(회계 귀속·매출 집계 직결) > 비교 필터(매 쿼리 재계산되어 9시 이후 정상화, 일시적).
> - 탐지: `grep -rn "date('now')\|datetime('now')" src/routes` 후 각 사용처가 (a)업무일자(비즈니스 의미) 인지 (b)순수 감사 타임스탬프(`created_at`/`updated_at`=UTC 정상)인지 분류. 업무일자는 `'+9 hours'` 보정 필요. **자동수정 금지**(날짜 시맨틱=비즈니스 로직, 사용처 분류 선행, 잘못 보정 시 UTC 감사로그 훼손).

---

### 🟣 Area 5: 보안 + 인프라

**목적**: 취약점과 인프라 문제

점검 항목:
- SQL 바인딩 없이 문자열 삽입하는 쿼리 탐지
- XSS: innerHTML 사용처 vs escapeHtml 적용 여부
- 인증 누락: authMiddleware 없는 라우트
- Rate limiting 커버리지 (인증·비밀번호 변경 엔드포인트 우선)
- .env / 시크릿 노출 (git history, 코드 내 하드코딩)
- Cloudflare Workers 설정 (호환성 플래그, 보안 헤더)
- GitHub Actions 보안 (시크릿 접근, 권한 범위)

**필수 grep (Area 5 #338 net-new)**:
- 시크릿 폴백: `grep -rnE "c\.env\.[A-Z_]+ *\|\| *'" src` → 암호화 키/JWT 폴백 리터럴
- 기본 비밀번호: `body.password || '리터럴'`, CI yml `secrets.X || 'admin'`
- 이전 #314가 "하드코딩 없음" 단언으로 놓쳤던 패턴 → 매 Area 5 반복

> **🔓 IDOR 비대칭 탐지 규칙 (Area 5 #349/#356)**: 같은 라우터에서 **목록(list)은 `entityFilter` 적용**하면서 **단건 조회/변경(`GET/PUT/PATCH/DELETE /:id`, submit/approve/cancel)은 `WHERE id = ?`만** 쓰면 = 의도적 전역공유 아니라 **격리 누락 버그**. list가 entityFilter를 쓰는 게 격리 의도의 증거. approve/차감이 호출자 `getEntityId(c)`를 쓰면 정합성 훼손까지. **단, 보고 전 도달성 선검증(#334)** — 호출처 0건이면 dead-code. 6모듈 클러스터(#356)를 이 규칙으로 발견. egress 차단 환경에선 런타임 검증 불가라 자동수정 금지, 이슈 보고.
> - **🧩 대형파일 도메인 분할 보안 회귀 점검 (Area 5 2026-06-12, PO 5분할 f428617~6c89232)**: 라우터를 도메인별 N개 서브파일로 쪼개면(예: `purchaseOrders/core.ts` → po-queries/po-receipts/po-receive/po-special + templates/stock-alerts, 바렐 `purchaseOrders.ts`가 `app.route('/', subRouter)` 집계) 보안 회귀 3가지를 **git 분할 전 커밋과 대조**로 확인: ① **각 서브라우터가 자체 `.use('/*', authMiddleware, requireAnyPagePermission(...))`를 재선언**했는지(Hono 미들웨어는 라우터 스코프 — 한 파일만 빠뜨리면 그 파일 라우트 전체 무인증). ② **마운트 순서 = 구체경로 서브라우터 전부 → core(`/:id`) 마지막**(아니면 core의 `/:id`가 `/stats`·`/templates`·`/receipts`를 섀도잉). ③ **단건/변경 핸들러의 `entityFilter`·`requireRole`이 분할 전과 동일**한지(분할 중 누락). 점검법: `for f in core po-queries ...; do grep -n ".use(" $f; done` + `git show <분할직전>:<원본> | grep "requireRole\|entityFilter"`로 핸들러별 대조. PO 분할은 3항 전부 보존(회귀 0) — 분할 자체는 깨끗했고 노출된 갭(receive requireRole 부재)도 분할 전부터 존재한 의도된 page-permission gating(위 FP 참조). **교훈**: 분할 PR은 "보안 속성 보존" 관점에서 git 대조가 가장 빠른 검증.
> - **변종 — 클라이언트 플래그로 필터 무력화(#368)**: list가 필터를 갖춰도 `?all_entities=1`류 쿼리 파라미터를 **역할 검증 없이** 신뢰해 필터를 끄면 우회(storageZones.ts:13/21, STAFF가 전 법인 열람). 비대칭 규칙은 "list가 필터를 쓴다"가 전제라 이 변종을 놓침 → `grep -rn "c.req.query(" src/routes` 중 entity/필터 분기를 제어하는 파라미터가 ADMIN/`getEntityId===0` 게이팅 없이 동작하는지 점검. (security-audit SKILL에 상세 codify)

**오탐 제외**:
- `webhooks.ts allowedPrefixes` Popbill IP 목록 → 의도적 보안 화이트리스트, 하드코딩 아님
- dev server 전용 취약점 (vite/esbuild SSRF 등) → 프로덕션 영향 없음, 보고 가치 없음
- CORS `!origin → '*'` (index.tsx:213) → Bearer 인증(쿠키 미사용)이라 실질 무해
- rate limiter in-memory Map (rateLimit.ts:6) → isolate 분산 한계는 기존 인지 아키텍처 제약
- **rate-limit "누락" 보고 (라우트 파일에 inline 미들웨어 없음)** → rate limit은 `index.tsx`에서 `app.use('/api/...', rateLimitMiddleware(...))`로 **앱 레벨 전역 등록**(240-246: auth/portal login·users/portal change-pw·refresh·self-auth·verify-document·verify-token). 라우트 핸들러만 보면 항상 inline 부재로 오탐 → 보고 전 index.tsx 등록처 확인 필수 (Area 5 2026-06-06)
- **"escapeHtml 헬퍼 전무(`grep -c escapeHtml`=0) → XSS"** → `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용). 메인 SPA·포털 셸을 통해 로드되는 스크립트는 로컬 정의 없이 전역 헬퍼 호출 가능 → 그 파일에 escapeHtml 미정의/미참조는 취약 증거 **아님**. 올바른 판정: 실제 `innerHTML` 싱크의 보간값이 (a)사용자 제어 free-text **이고** (b)미escape인지 직접 확인. `Number()` 강제 숫자·시스템 채번코드(order_number)·서버 하드코딩 문자열은 싱크 아님 (Area 6 2026-06-06, #335 portalBalance.js 잔여 오탐 차단)
  - **⚠️ 예외 — 독립 HTML 페이지는 전역 escapeHtml 없음 (Area 5 2026-06-10, 9회차)**: `c.html(\`...\`)`로 자체 `<head>/<script>`를 통째 반환하는 **독립 출력 페이지**(`pages/payslip.ts`·`pages/yearEnd.ts` 급여명세서/연말정산, `/payslip/:id`·`/year-end/:id` 인쇄 경로)는 layout.ts 셸을 거치지 않아 **`window.escapeHtml`가 정의돼 있지 않음**. 여기서 직원 마스터 free-text(성명/부서/직책/연락처)를 `innerHTML`에 raw 연결하면 **진짜 stored XSS**(HR ADMIN/MANAGER가 마스터에 페이로드 저장 → 인쇄 시 실행). 위 "전역 헬퍼 있으니 오탐" 논리를 **독립 페이지에 적용 금지**. 판별: 파일이 `import ... layout`/shell을 쓰지 않고 `c.html` 안에 자체 script를 넣으면 전역 헬퍼 부재 → 로컬 `esc()` 추가가 정답(escapeHtml 누락 = 안전 자동수정 범주). 탐지: `grep -rln "c.html(" src/pages` 후 각 파일이 free-text를 innerHTML/문자열연결로 렌더하는지.
- **쓰기 핸들러 `requireRole` 부재를 "권한 누락 HIGH"로 과대평가 — page-permission gating이 곧 접근제어** (Area 5 2026-06-12, 10회차) → 이 프로젝트의 데이터 API는 라우터-와이드 `requireAnyPagePermission('/purchase-orders','/receiving')`(`middleware/permissions.ts:66`)로 게이트됨 = **role별 `getAccessiblePages` 조회 후 미보유 시 403**인 실제 RBAC. 따라서 특정 쓰기 핸들러(예: `POST /:id/receive`, po-receive.ts:20)에 `requireRole('ADMIN','MANAGER')` inline이 없어도 **STAFF가 임의 실행** 아님 — 해당 role이 `/receiving` 페이지 권한을 부여받았을 때만 도달. **입고/검수 같은 워크플로는 ADMIN/MANAGER가 아니라 창고담당(=`/receiving` 권한)이 수행하는 게 의도**라 requireRole 미적용이 정상(`core.ts:17` "쓰기는 각 엔드포인트 requireRole" 일반론의 **의도된 예외**). 보고 전 확인: ① 라우터 `.use`에 `requireAnyPagePermission`/`requirePagePermission`이 있는지 ② 그 미들웨어가 `getAccessiblePages`로 실제 403하는지(no-op 아닌지) ③ 해당 동작이 비-ADMIN role의 정당 업무인지. 셋 다 yes면 드롭(서브에이전트가 "writes role-gated" 주석 일반론만 보고 receive 예외를 HIGH로 과대보고한 사례 차단).
- **무인증 self-service auth 엔드포인트 "브루트포스/열거 HIGH" 과대평가** (Area 5 2026-06-09, 8회차) → `/api/hr/self-auth`(사원번호+생년월일6자리)·portal `/verify-document`(토큰+BRN)처럼 **계정 없는 사용자용 간이 2팩터 인증**은 authMiddleware가 없는 게 **설계 의도**(공개 진입점). 보고 전 ① `index.tsx:240-246` rate limit 전역 등록 확인(self-auth=5/분·verify-document=10/분 이미 적용) ② 두 팩터 결합(열거 가능 식별자 + 추측가능 비밀) 형태가 동일 코드베이스의 **이미 "설계 정상" 판정된 패턴**(verify-document)과 동형인지 확인. rate-limit-by-IP의 IP로테이션 한계는 **모든 로그인 엔드포인트 공통 + 기존 인지 아키텍처 제약**(rateLimit.ts in-memory Map)이라 self-auth 단독 HIGH 아님. timing-attack도 두 분기(emp 없음 vs birth 불일치) 모두 단일쿼리+문자열비교라 유의미 차이 없음. **진짜 보고 대상**: rate limit 자체가 누락됐거나(index.tsx 미등록), 한 팩터만으로(식별자 없이) 인증되거나, scope/만료 없는 영구 토큰을 발급하는 경우.

> **📤 CSV Formula Injection 탐지 (Area 5 #367, 2026-06-08)**: CSV export 헬퍼가 셀 값의 **선행 `=` `+` `-` `@`(탭/CR)**를 이스케이프하지 않으면 자유입력(거래처명·품목명·메모 등)이 다운로드 PC Excel에서 수식 실행(HYPERLINK 유출/DDE). `,"` 개행만 따옴표 처리하는 건 **부족**. 점검: `grep -rn "includes(','" src` 후 각 CSV 헬퍼가 선행 특수문자 가드하는지. **이 코드베이스는 4개 구현 산재**(csv.ts generateCsv/escapeCsvField·tax-agent csvField·shipments 인라인 esc) — 하나만 고치면 우회. 가드 추가 시 **금융 음수금액(`-1000`)이 텍스트로 깨지지 않게 숫자-안전**(`typeof val!=='number' && /^[=+\-@\t\r]/.test(str) && isNaN(Number(str))`) 필수.

> **🩹 SPA `innerHTML` free-text stored XSS = 고생산성 standing scan (Area 5/6 codify, 2026-06-14)**: `src/scripts/**/*.js`가 DB free-text(거래처명·품목명·직원명·비고/사유·부서·후가공명 등)를 `escapeHtml()` 없이 `innerHTML`/`insertAdjacentHTML`/`.html()`에 보간하면 stored XSS. **누적 실측 4사이클 = A-020(leaves.js)·A-021(activityLog/insuranceReports)·#399(quotation.js)·A-022(purchaseRequestForm 3 + postProcessing 5)** → "존재X 컬럼"급 반복 클래스라 **매 Area 5 standing scan**. **핵심 특징(오버사이트 패턴)**: 거의 항상 **같은 파일이 일부는 escape하고 일부만 누락** — postProcessing.js는 `:521~624`에서 escapeHtml 쓰면서 `:36/:63/:67` 테이블/체크박스 누락, leaves.js는 드롭다운만 escape·표 행 누락, quotation.js는 `escapeHtml(err.message)` 쓰고 본문 누락. 또 **onclick/onmousedown 속성용 `.replace(/'/g,...)` escape는 있는데 HTML 텍스트 노드용 escapeHtml은 누락**한 경우 多(purchaseRequestForm `:151/:193` attr escape O, `:154/:195` 텍스트 escape X). **빠른 탐지**: `grep -rn "innerHTML\|insertAdjacentHTML\|\.html(" src/scripts` 후 각 싱크의 보간값이 (a)DB free-text **이고** (b)escapeHtml 미래핑인지 직접 Read. **FP 배제**(보고/수정 금지): `Number()`·숫자(qty/price)·날짜(`fmt()`)·시스템 채번코드(order_number/employee_code, ⚠️ 단 item_code/option_code 등 사용자편집 마스터코드는 싱크)·상태배지/enum 라벨 함수·이미 escape된 것. **자동수정 판정**: `window.escapeHtml`(shell.js:62 전역, 셸 경유 스크립트 전부 가용)로 누락 필드 래핑 = **안전 자동수정**(escapeHtml 추가는 동작 무변·SKILL 허용 범주) — **단 단순 테이블/드롭다운/모달 렌더에 한함**. **예외: ~18필드+img-src 섞인 복합 출력 문서 렌더러(quotation.js #399)는 owner 검증(issue-only)** — 렌더 회귀 검증 불가. (독립 HTML 페이지 c.html `pages/payslip/yearEnd`는 별도 — 전역 escapeHtml 부재라 로컬 `esc()` 추가, 위 XSS FP-row 예외 참조.)

**자동 수정 가능**: escapeHtml 추가, SQL 바인딩 수정

---

### ⚙️ Area 6: 자기 진화

**목적**: 이 에이전트 자체의 탐지 능력 향상

수행 작업:
- **IMPROVEMENT_BACKLOG.md ↔ GitHub 동기화**: open/closed 상태 대조 후 done/rejected 반영
  - closed + 완료 코멘트 → done으로 이동
  - closed + 거절 코멘트 → rejected로 이동 + 오탐 패턴 목록 갱신
  - 백로그에 없는 GitHub 이슈도 수집하여 done 섹션에 추가
- 스킬 파일 업데이트:
  - 새로 발견한 패턴을 다른 스킬(review-checklist, security-audit 등)에 추가
  - 오탐(false positive) 패턴 제외 목록 갱신 (IMPROVEMENT_BACKLOG.md 하단 표도 갱신)
- E2E 테스트 강화:
  - 이전 실행에서 발견된 버그에 대한 회귀 테스트 추가 제안
- 이 SKILL.md 자체도 필요하면 업데이트

**학습된 패턴 (탐지 가치 높음)**:
- N+1 쿼리: for 루프 내 `await DB.prepare(...)` → 모든 케이스 보고 대상 (100% 수정율)
- entity_id 누락: 새 테이블 생성 시 entity_id 컬럼 필수 체크 → 반복적으로 발견·수정
- as any 타입 캐스팅: 대규모 제거 가능·환영 받음
- UX 흐름 단절: 페이지 간 이동 링크 부재 → 비즈니스 영향 높음
- 대시보드 KPI 제안 시: 단순 카드 추가가 아닌 **전체 대시보드 UX 재검토 맥락**에서 제안

**학습된 패턴 (탐지 금지)**:
- 비활성 필드 UI 힌트 제안 (disabled 이유 표시 등 미세 UX) → 불필요 판단 (F-004 패턴)
- dev server 전용 취약점 → 프로덕션 영향 없음
- 의도적 IP 화이트리스트 코드 → 보안 제어 목적
- **orphan 라우터의 entity_id 격리 갭** (프론트 호출처 0건) → 보안 아니라 dead code. 격리 갭 보고 전 도달성 선검증 필수 (#334). **단 예외**: 클라 제공 키로 raw 리소스 서빙하는 범용 프록시(R2 파일 등)는 0-refs여도 직접 HTTP 호출이 공격표면 → 보안 이슈 (#365)

---

## 실행 워크플로우

### 수동 실행 (`/auto-improve` 또는 "점검해줘")

```
1. IMPROVEMENT_BACKLOG.md 읽기 (이전 실행 결과 + 승인 상태)
2. 다음 순번 영역 결정 (backlog의 last_run_area 참조)
3. 해당 영역 deep dive (에이전트 2~3개 병렬)
4. 발견 사항 분류:
   - 🔧 자동 수정 가능 → 즉시 수정 + build + E2E 검증
   - 💡 제안 → IMPROVEMENT_BACKLOG.md에 추가
5. 결과 요약 출력
```

### 자동 실행 (`/loop` 또는 `/schedule`)

```
1~5 동일
6. 자동 수정 성공 시 → 커밋 (사용자 확인 필요)
7. 다음 실행 스케줄
```

## 자동 수정 안전 규칙

**자동 수정 허용 (build + E2E 28개 통과 필수)**:
- entity_id INSERT 누락 추가
- models.ts 타입 갱신
- dead code 제거
- 문서 동기화 (sync-docs)
- 인덱스 추가 마이그레이션
- escapeHtml 누락 추가

**자동 수정 금지 (반드시 제안으로)**:
- 새 기능 추가
- UI/UX 변경
- DB 스키마 변경 (인덱스 제외)
- 라우트 추가/삭제
- 비즈니스 로직 변경
- 기존 API 응답 형식 변경

## 승인된 Issue 처리 워크플로우

사용자가 "승인된 이슈 처리해줘" 또는 "backlog 진행해줘"라고 하면 아래 워크플로우 실행.

### Step 1: 승인된 Issue 수집
```bash
# 👍 리액션이 있는 open Issue 조회
gh api repos/{owner}/{repo}/issues?labels=auto-improve&state=open --jq '.[] | select(.reactions["+1"] > 0) | {number, title}'
```

### Step 2: 코멘트 읽기 (핵심!)
```bash
# 각 승인 Issue의 코멘트 전부 읽기
gh issue view {number} --comments
```

코멘트에 담길 수 있는 내용:
- **방향 수정**: "이 방향 말고 이렇게 해줘"
- **범위 조정**: "1번만 하고 2번은 나중에"  
- **추가 맥락**: "실제로는 이렇게 동작해야 해"
- **디자인 힌트**: "기존 XX 페이지 스타일로"
- **거부 사유**: "이건 안 해도 돼, 이유는..."

### Step 3: 구현
- Issue 본문 = 기본 요구사항
- 코멘트 = **수정/보완된 요구사항** (코멘트가 본문과 충돌하면 코멘트 우선)
- 코멘트에 모호한 부분이 있으면 → Issue에 질문 코멘트 남기고 다음 Issue로
- 구현 후 `npm run build && npm run e2e` 검증

### Step 4: 완료 처리
```bash
# 커밋 메시지에 Issue 번호 포함 → 자동 연결
git commit -m "fix: cards entity_id isolation (closes #1)"

# Issue에 결과 코멘트
gh issue comment {number} --body "✅ 완료. 커밋: {hash}\n\n변경 내용:\n- ..."

# Issue close
gh issue close {number}
```

### Step 5: 코멘트로 질문/논의
구현 중 판단이 필요한 경우, Issue에 코멘트로 질문:
```bash
gh issue comment {number} --body "🤔 구현 중 질문:\n\n{질문 내용}\n\n선택지:\n1. ...\n2. ...\n\n코멘트로 답변 부탁드립니다."
```

---

## IMPROVEMENT_BACKLOG.md 형식

```markdown
# Improvement Backlog
<!-- last_run_area: 3 -->
<!-- last_run_at: 2026-05-11T14:00:00+09:00 -->

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 5 |
| 👀 reviewed | 3 |
| ✅ approved | 2 |
| 🔨 in-progress | 1 |
| ✔️ done | 8 |
| ❌ rejected | 2 |

## 🔴 Bugs
### [B-001] LogWatcher 프로덕션 미수신 (Area 1, 2026-05-11)
- **증상**: heartbeat 3일 미갱신
- **원인 추정**: ERP_API_URL 로컬 주소 잔존
- **영향**: 인쇄 완료 상태 자동 반영 안 됨
- **수정**: LogWatcher .env 확인 + heartbeat 모니터링 엔드포인트 추가
- **공수**: 30분
- **상태**: 🆕

## 🟡 Improvements
### [I-001] 대시보드 KPI 현대화 (Area 3, 2026-05-11)
- **현재**: 오늘 출고 예정 N건만 표시
- **제안**: 일일 매출 추이, 납기 준수율, 미수금 연체 현황, 생산 진행률 추가
- **가치**: 관리자가 한눈에 운영 현황 파악
- **공수**: 2세션
- **상태**: 🆕

## 🟢 Features
### [F-001] 거래처 전화번호 검색 (Area 3, 2026-05-11)
- **현재**: 이름/코드로만 검색 가능
- **제안**: phone, mobile 컬럼도 LIKE 검색에 포함
- **가치**: 전화 문의 시 즉시 거래처 찾기
- **공수**: 15분
- **상태**: 🆕

## 🔧 Auto-fixed
### [A-001] entity_id INSERT 14건 누락 (Area 2, 2026-05-09)
- **수정**: inventory/purchaseOrders/taxInvoices INSERT에 entity_id 추가
- **검증**: build + E2E 28/28 통과
- **커밋**: 5af0fed
- **상태**: ✔️ done
```

## 에이전트 배정

각 영역은 빌트인 **Explore**(읽기·탐색) 또는 general-purpose로 병렬 위임. 모델은 메인(Opus 4.8) 상속 — 오버라이드 기본 생략.
> 구 haiku/sonnet/opus 티어 배정은 **폐기**(2026-06-05). 상세 → `references/agent-team-guide.md`
