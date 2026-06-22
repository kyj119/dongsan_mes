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

> **🎯 /cards·대형목록 로드 500 = D1 바인드 파라미터 한도(100) 먼저 의심, 마이그레이션 드리프트는 나중 (Area 1 #409, 2026-06-17 codify)**: #409에서 E2E의 `/cards` 로드 결정적 2x 500을 **0312 마이그레이션 prod 미적용**으로 과추정했으나, owner 픽스(`0ba3670`)가 입증한 **실원인 = 칸반 enrichment 쿼리의 `card_id IN (?,?,...)`/`order_id IN (...)`를 행당 1바인드로 묶어 D1 바인드 파라미터 한도(100) 초과**(limit=500 칸반=컬럼당 카드 100+ → 결정적 500, limit=100 OK·200부터 500). 표준 픽스 = **IN 리스트 80개 청크 분할**(`for i+=80` 루프, 그룹/정렬 보존). **교훈**: limit이 큰 목록(칸반 500·대량 export)의 후처리 enrichment에서 `id IN (...)`가 동적 바인드면 행 수가 100을 넘는 순간 결정적 500 → /cards·대형목록 500 진단 시 **(a) IN절 바인드 카운트(>100) 먼저, (b) 마이그레이션 드리프트(`no such column`)는 그 다음**. 두 클래스 모두 "도입 이래 영구 깨짐(회귀 아님)"으로 보이나 바인드 한도는 **데이터 규모 의존**(테스트 데이터가 적으면 우연히 green = 471502c가 0ba3670 전에 green이었던 이유)이라 5+런 연속 green이어야 회복 확정. 탐지: `grep -rn "IN (\${" src/routes`로 동적 IN절 추출 후 상위 호출의 limit/배열 크기가 100 초과 가능한지 확인.

> **🧊 배포후 smoke 로그인 500 = D1 cold-start transient (Area 1 #400·#374, 2026-06-13)**: Deploy 단계는 `✨ Deployment complete!`로 성공했는데 **post-deploy smoke 로그인만 500**으로 잡 fail("즉시 확인 필요" 알람)이면 **코드 버그가 아니라 갓 배포된 worker의 D1 cold-start 지연**일 가능성 높음. 판별: ① 로그인 응답이 **수십초 지연 후 generic catch 500**(`로그인 처리 중 오류`)인지(즉시 4xx는 진짜 인증실패) ② **직후 배포(다음 커밋)에서 자동 회복**됐는지 — 둘 다 yes면 transient(prod 무중단, 배포 자체 성공). `smoke.cjs:205` login()이 #374로 5xx 재시도(MAX=3)를 갖췄으나 **깊은 cold-start엔 3회 윈도가 부족**(#400 `02071f7`은 retry 포함하고도 fail). **재발 자체를 코드결함으로 오판 말 것** — Deploy success + 다음배포 green이면 헬스 정상. 진짜 보고대상은 **연속 배포가 모두 같은 실패**(자동회복 안 됨)이거나 deploy 단계 자체 failure(빌드/wrangler).

> **🕳️ smoke 맹점 2종 = write-path 회귀를 read-only 프로브가 못 잡음 (Area 1 #430, 2026-06-21 codify, 19회차)**: `scripts/smoke.cjs`는 **102 path 프로브 전부 GET + POST는 로그인 1곳(`:210`)뿐** = read-only 헬스체크라 **INSERT/UPDATE/DELETE 경로 회귀를 구조적으로 탐지 불가**. 실증: print-system purge `0335`가 `print_media/print_methods`를 DROP했는데 `items`가 이들을 **inline FK로 참조** → SQLite "부모 테이블 소멸 시 자식 수정 차단"으로 **items INSERT/UPDATE 전량 `no such table` 사망(품목 생성/수정 100% 불능)인데 SELECT는 멀쩡** → 모든 GET 프로브 200 → **smoke green으로 prod-breaking 회귀가 배포 통과(은폐)**, owner가 수동 발견·`0337` FK 스텁 재생성으로 복구(`7cdca2b`). **이것이 line 40(MIME/shell.js 프론트 실행실패)에 이은 smoke 맹점 2종째** — 1종=프론트 실행, 2종=백엔드 write-path. **Area 1 함의**: ① **deploy "success" + smoke green ≠ write 경로 정상** — 특히 마이그레이션이 DROP/스키마 변경을 동반하는 churn(테이블 제거·컬럼 정리)에서 write가 깨지기 쉬운데 smoke는 정확히 그 클래스를 못 봄. ② **DROP/RENAME 마이그레이션이 머지된 사이클의 Area 1은 그 테이블을 write하는 핸들러(INSERT/UPDATE)가 깨졌는지 정적으로 직접 확인**(`grep -rniE "(from|join|into|update)\s+<droppedtable>" src` + 그 테이블을 FK 참조하는 부모/자식 관계 점검) — smoke green을 신뢰 말 것. ③ **D1/SQLite 특수성**: 부모 테이블 DROP 시 자식이 inline FK로 참조하면 자식의 **모든 write가 차단**(SELECT는 동작)되며, D1은 `DROP COLUMN` 차단 + 참조테이블 재빌드가 workerd FK가드로 롤백되어 **부모 스텁(id PK)을 영구 유지**해야 write 복구됨(`0337` 패턴). 탐지 트리거 = `git log <last>..HEAD -- migrations`에 `DROP TABLE`/`DROP COLUMN`이 있으면 그 식별자를 FK로 참조하는 코드/스키마 전수 확인.
>
> **🧯 학습된 패턴 — 정적에셋 MIME/Content-Type 회귀는 smoke(API)로 미탐지 (Area 1, 9dd09cd→144addf→24bb493 2026-06-11, prod 2회 다운)**: 클라 셸 `shell.js`를 `/static`으로 **외부화**(9dd09cd 파일럿)하면, CF Pages **Git 자동빌드** 환경에서 `_routes.json`의 `/static/* 제외`가 미적용되어 워커가 `/static/shell.js`를 **Content-Type 빈값('')으로 서빙** → 브라우저 strict MIME가 "not executable"로 **실행 거부** → `shell.js`(axios 인증헤더·법인 스위처 초기화) 사망 → **전 페이지 API 401 + 무한 로딩 + 법인 미표시**. `_headers`에 Content-Type 명시(144addf)도 자동빌드선 불충분 → **최종 해결 = 인라인 `?raw` 복귀**(24bb493: shell.js를 워커 HTML에 직접 포함 → /static·_routes.json·_headers·빌드순서 의존 전무, 자동/수동 배포 무조건 동작). **핵심 교훈 2가지**: ① `scripts/smoke.cjs`는 API를 직접 fetch라 이 프론트 실행 실패를 **구조적으로 못 잡음**(로그인 API 200이어도 UI는 죽음) → 회귀 신호는 **E2E 콘솔에러·shell.js 로드 확인**에만 잡힘. ② CF Pages Git 자동빌드는 `_routes.json`/`_headers`/빌드순서를 신뢰 못 함 → 핵심 부트스트랩 스크립트는 외부화보다 인라인이 robust. 점검 트리거 = `build-assets.mjs`·`_headers`·`_routes.json`·`/static/*` 파이프라인 변경 시 + Area 1 헬스에서 prod 페이지 콘솔에러 1개라도 있으면 MIME/shell 로드부터 의심.

> **💣 prod↔main 디버전스 = 회귀 시한폭탄 standing scan (Area 1 #422, 2026-06-20 codify, 17회차)**: owner가 다수 픽스(특히 보안 IDOR·100%-fail 컬럼버그)를 **로컬 커밋으로 prod에 수동 배포한 뒤 origin/main에 push하지 않고 GitHub 이슈만 "수정·배포·완료"로 close**하면, **prod는 정상이나 main은 픽스 없는 옛 코드** → `.github/workflows/deploy.yml`이 **main push 트리거 자동배포**라 **다음 main push 순간 CI가 main(픽스 없는 코드)을 prod에 덮어써 close된 픽스가 전부 회귀**(cross-tenant PII 유출·100% 기능사망 재발). #422 실증: owner가 #413~#421(9건, IDOR 3·컬럼버그 1 포함)을 커밋 `5169bbb9`로 prod 수동배포(`81d2ddc0`) 후 close했으나 `5169bbb9`가 origin에 부재(`git cat-file -t` = not a valid object), main 트리(420280d) grep으로 9건 전부 미반영 확인(cards/queries.ts:929 bare `WHERE c.id = ?`·storageZones:112 `body.entity_id`·ar-payments:199 `updated_at`·safeSubmit 호출처 0). **standing 탐지 레시피(매 Area 1)**: ① **최근 close된 auto-improve 이슈의 close 코멘트가 "배포 완료"를 주장**하면 그 픽스가 main 트리에 실재하는지 `grep`으로 직접 검증(이슈 본문의 안티패턴이 현재 HEAD에 잔존=미push 증거). ② close 코멘트가 **특정 커밋 SHA**를 인용하면 `git cat-file -t <sha>`로 origin 존재 확인(없으면 로컬-only = 미push). ③ **GitHub close↔main 트리 불일치 = 디버전스**(prod에만 있고 main에 없음). 보고: 디버전스 발견 시 **단일 메타이슈**로 (a)미push 픽스 목록 (b)다음 main push가 회귀시킬 보안/기능 항목 (c)해결책(5169bbb9 cherry-pick/merge/push). **자동수정 금지**(git push/CI 영역, owner만). **백로그 동기화 함의**: owner 대량 close(9건 done 이관) + 직전 사이클이 만든 메타이슈(#422)를 **이전 사이클 sync가 stale하게 누락**할 수 있음 → 매 Area 1은 `list_issues(OPEN, auto-improve)` **실측 후 직전 stats와 diff**해 done-sync 갱신(추정치 신뢰 금지).

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

> **🔍 명시 컬럼 SELECT 존재성 = INSERT/UPDATE 컬럼-diff와 별개 standing scan (Area 2 A-027, 2026-06-17 codify, 15회차)**: 자동화된 INSERT 컬럼 존재성·UPDATE SET 존재성 스캔은 **`SELECT t.*`(와일드카드) 아닌 명시 컬럼리스트가 미존재 컬럼을 참조하는 SELECT**를 구조적으로 못 잡음 → A-027(hometax `created_at` 3엔드포인트) 사각. **실증**: `hometaxInvoices.ts`의 목록 핸들러는 `SELECT hj.*`/`hi.*`라 안 깨지는데(:130/:369), 단건 `/jobs/:id/status`·`/jobs/:id/fetch`(:162/:223)와 `/compare`(:416)만 **명시 컬럼리스트에 `created_at` 보간** — hometax_jobs는 `requested_at`/`completed_at`, hometax_invoices는 `collected_at`만 보유(created_at 부재) → `no such column` prepare throw로 **해당 핸들러만 선택적 100% 사망**(목록은 멀쩡해 발견 지연). **결정적 증거 = TS 인터페이스(HometaxJobRow가 `requested_at` 선언, created_at 없음)와 SELECT 불일치** = sibling 쿼리 간 copy-paste 오타(한쪽은 올바른 컬럼, 복붙된 다른 SELECT는 `created_at` 유지). **탐지 레시피**: ① `grep -rn "SELECT" src/routes`에서 **명시 컬럼리스트(첫 토큰이 `t.*`/`*` 아닌)** 추출 → ② 각 컬럼이 `FROM`/`JOIN` 테이블 ground-truth(schema.json)에 있는지 대조(JOIN 별칭·`AS` 별칭은 FP 배제) → ③ 같은 테이블에 sibling SELECT가 여럿이면 컬럼셋 diff로 outlier(`created_at` vs `requested_at`) 격리. **자동수정 판정**: read-only SELECT 컬럼오타라 안전 자동수정(A-017/A-019 클래스) — **단 응답 필드명을 프론트가 쓰면 `<실컬럼> AS <원이름>` 별칭으로 round-trip 보존**(A-027: `requested_at AS created_at`). build/verify로 컴파일 검증, egress 불필요.
> - **🤖 A-027 명시 SELECT 존재성을 자동화 standing scan으로 승격 (Area 2, 2026-06-20 codify, 17회차)**: 16회차까지 "발견 시 수동"이던 명시 SELECT 컬럼존재성을 **INSERT/UPDATE 컬럼존재성과 동급 매 사이클 자동스캔**으로 승격 — 한 스캔이 17회차에 net-new 3건 격리(#424 weeklyPurchase `users.mobile`[실제 phone]·#425 scan `equipment.equipment_type/location/manufacturer`[부재]·A-030 portal `order_items.pricing_method`[items 전용]). **스크립트 레시피**: 322-마이그 적용 ground-truth(`/tmp/schema.json`) ↔ `grep -rl SELECT src/routes`의 `SELECT <collist> FROM <singletable> (WHERE|GROUP|ORDER|LIMIT|backtick)` 정규식. **FP 배제(필수)**: ① collist가 `<alias>.*`/`*`로 시작·함수/괄호/`${동적}` 포함이면 SKIP ② `\s+as\s+\w+`·table-prefix(`t.`) 제거 후 컬럼만 대조 ③ JOIN 포함 collist SKIP(단일테이블만). **발견마다 2단 교차검증**: (a)**reachability** — 프론트 `axios` 호출처 grep(0건이면 dead, #334) (b)**sibling 전수** — `grep -rn "<col>" src/routes`로 같은 컬럼이 **다른 테이블에선 정상**인지(#424 mobile은 employees서 정상·A-030 pricing_method는 items서 정상 = outlier 격리, #377 전수). **자동수정 판정**: read-only SELECT 오타 중 (i)프론트가 그 필드 미사용이면 **컬럼 제거**(A-030), (ii)사용하면 `<실컬럼> AS <원이름>` 별칭(A-027). **issue-only**: 외부발송 활성화(#424 SMS)·DB 등가 컬럼 부재로 매핑 모호(#425). verify(typecheck+build)로 컴파일 검증, egress 불필요.
>
> **🪞 백엔드 컬럼/JOIN 제거 → 프론트 stale field read = 컬럼-제거 완전성의 프론트 거울 (Area 2 #431, 2026-06-21 codify, 19회차)**: 드리프트 정리(존재X 컬럼 제거)·시스템 purge가 백엔드 SELECT 컬럼이나 JOIN을 제거하면, 그 필드를 **읽던 프론트(`obj.field`)는 throw가 안 나고 `undefined`→공백/"-"로 렌더** = 조용한 UX 회귀(에러도 smoke 실패도 없어 발견 지연). **실증 #431**: print-system 제거(`92b015a`)가 `cards/queries.ts`에서 `pm.name as print_media_name` + `LEFT JOIN print_media`를 제거 → 백엔드가 `print_media_name`(+fallback `media_name`) 공급 중단 → 카드상세 **양쪽 뷰**(`cardDetail.js:54→:150` `cd-fabric`·`cards/detail.js:548→:617` `fabric-name`)가 stale read → 원단 표시 **영구 "-"**. 결정적 단서 = 그 필드가 **테이블 자체 컬럼이 아니라 JOIN/alias로만 공급**됐던 것(order_items엔 print_media_name 컬럼 없음, 0191은 quotation_items만 → 과거엔 print_media JOIN으로만 들어옴 → JOIN 제거 = 공급원 소멸). **탐지 레시피**: 백엔드 컬럼/JOIN/alias 제거 churn(`git show <commit> -- src/routes | grep '^-.*\bas \w'` / `^-.*JOIN`)마다 제거된 응답 필드명을 `grep -rn "\.<제거필드>" src/scripts`로 전수 → ① 프론트가 그 필드를 읽고 ② `||'-'`/`||''` 가드로 렌더하면 그 UI 필드가 **영구 공백**(가드 없으면 더 큰 깨짐). #429(axios→404)·#377(부분픽스)와 같은 "purge 완전성" 축의 **데이터-필드 거울** — purge 검증 시 (a)dropped-table refs (b)frontend axios→removed routes 에 더해 (c)**removed SELECT-field→frontend stale read**를 3번째 축으로 점검. **자동수정 판정**: 신모델 데이터소스 재배선(신규 JOIN/응답필드=기능변경)이나 프론트 필드 제거(UI변경) 둘 다라 issue-only(egress 차단으로 렌더 검증 불가).
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

> **🔗 프론트 axios → 백엔드 라우트 존재성 standing scan (Area 3, 2026-06-17 codify, 14회차)**: #411(`location.href` page타깃 ↔ index.tsx page라우트)의 **API 거울 클래스** — `src/scripts/**/*.js`의 `axios.{get,post,put,delete,patch}('/api/...')`가 **백엔드에 등록 안 된 경로**를 부르면 404 = 죽은 버튼(유저 관점 "기능 안 됨"). **레시피**: ① `grep -rnoE "axios\.(get|post|put|delete|patch)\('[^']+'" src/scripts` + 템플릿리터럴 형태 → base path 추출(쿼리·`+id` concat 제거). ② index.tsx `app.route('/api/x', xRouter)` 마운트 + 각 라우터(배럴은 서브라우터 follow)의 `.get/post('/...')` 경로 수집. ③ Hono **exact-match**(`/api/foo/bar`는 `/api/foo`만 등록된 라우터로 안 잡힘) + path param(`/:id`)·서브라우터 '/' 마운트 prefix 상속 고려해 매칭. ④ 정적 해석 불가 경로(완전 변수)는 SKIP(FP 회피). **결정적 neutralization 크로스체크 — #318 패턴**: 깨진 엔드포인트가 발견돼도 **그 진입 메뉴가 `menu.ts`에서 주석처리(`// { path: ... }`)됐는지 먼저 확인** — owner가 "백엔드 미구현 → 구현 전까지 네비 숨김"으로 이미 무력화했으면(예: `/material-forecast` #318, menu.ts:73 주석) page 라우트(index.tsx)·script가 남아있어도 **메뉴 미노출 = 도달성 ~0 = dead code(노이즈, 보고 금지)**. 2026-06-17 14회차 = 전 axios 경로 net-new 0, 유일 후보 `/api/forecast/material-consumption`(materialForecast.js:7) = **#318 closed-completed**(메뉴 주석으로 무력화, 의도적 잔존 "구현 시 복원") → 탐지 회귀 0. **보고 전 확인**: ① 백엔드 라우트가 정말 없는지 라우터 파일 직접 Read(추측 금지) ② 진입 메뉴/버튼이 `menu.ts`에 살아있는지(주석=무력화). 둘 다 yes(라우트 부재 + 메뉴 활성)일 때만 이슈.
>
> **🖱️ 핵심 write 더블클릭 중복제출 standing scan (Area 3, 2026-06-19 codify, 15회차)**: 파괴적/금전/재고 write 버튼이 **클릭 후 disable 안 돼 더블클릭으로 중복 실행** = UX 문제이자 데이터 정합성(중복 발행·이중 재고·중복 입금). **근본 = `shell.js:806` `safeSubmit(btn, asyncFn)`(클릭 즉시 disable+"처리중…"+finally 복구) 헬퍼가 정의됐으나 호출처 0건**(`grep -rn "safeSubmit" src/scripts` = 정의 2줄뿐). **레시피**: ① `grep -rn "axios.post\|axios.put\|axios.delete" src/scripts`로 mutate 호출 수집 → 우선순위(주문생성·발행·입금·출고·입고·발주). ② 각 submit 함수가 호출 직전 `btn.disabled=true`/`_inProgress` 플래그/safeSubmit 래핑이 있는지. ③ **backend 멱등성 교차검증(FP 판정 핵심)**: 프론트 가드 부재여도 backend가 멱등하면 무해 → 드롭. **단 "status read 후 분리 write"는 비원자 TOCTOU** — `if(existing.status!=='X')` 가드가 있어도 그 이후 **느린 외부 호출(provider.issue 등) + 그 다음 `UPDATE ... WHERE id=?`에 `WHERE status='X'` 조건 없음**이면 더블클릭이 두 요청 모두 통과(SKILL #369 atomicity). **보고 조건 = 프론트 가드 X + backend 비원자/가산 destructive write + 도달성 LIVE 셋 다**. **FP 배제**: backend 진짜 멱등 가드(`kakao.ts:455 already_sent skip`)·프론트 `_xxxInProgress` 플래그 보유(cards shipCard/completeCard·orders confirmStatusChange = UI disable 없어도 재진입 차단)·모달 submit 후 즉시 닫혀 재진입 차단. 2026-06-19 15회차 = #420(세금계산서 발행 TOCTOU[status→provider.issue→UPDATE 비원자, 성공 SENT를 racing FAILED가 덮음]·입고 received_quantity 가산 이중계상[po-receive.ts:228]) 발견, send-shipment는 already_sent로 FP 드롭. **자동수정 금지**: 버튼 disable/이벤트 배선·원자성 가드 = UI/UX·비즈니스 동작 변경(egress 검증 불가) → issue-only(단 safeSubmit 적용은 기존 자산이라 승인 시 즉시).
> **📊 로딩 표시 커버리지 — 패턴 확립 vs 부분적용 (Area 3, 2026-06-19 codify, 15회차)**: 리스트 fetch 중 로딩 표시(스피너/skeleton/"로딩 중…")가 없으면 느린 네트워크에서 "멈춤/고장" 인지 = UX 부채. **전제 확인 = 전역 로딩 메커니즘 유무 먼저**(`shell.js` axios 인터셉터 = 401만, 전역 오버레이 없음 → 페이지별 개별 필요). **레시피**: primary 리스트 `loadXxx()` 함수가 `axios.get` 직전 tbody에 로딩 표시를 그리는지 전수. **핵심 = 코드베이스에 이미 확립된 패턴 대조**(있는데 일부만 적용 = 일관성 갭이 보고 가치, 전무하면 아키텍처 결정이라 노이즈). 2026-06-19 = 4페이지 구현(shipments skeleton·receiving/purchaseRequests/taxInvoices "로딩 중…") vs 7페이지 누락(orders/clients/inventory/purchaseOrders/quotations/approvals/cardExpenses) → #421 일관성 improvement. ia-editor(신규 churn)는 진행표시·에러·빈상태 모두 양호 = clean. **자동수정 금지**(UI 변경, colspan/컬럼구조 페이지별 상이 → 일괄 회귀 위험).
>
> **🪤 `showConfirm` 콜백 오용 + 핸들러 도달성 standing scan (Area 3 #426, 2026-06-20 codify, 16회차)**: `window.showConfirm(message, options)`(shell.js:864)은 **Promise를 반환하고 콜백을 호출하지 않는** API — 2번째 인자는 `options`(title/danger 등 객체)다. 따라서 `showConfirm(msg, function(){ ...write... })`처럼 **콜백을 2번째 인자로 넘기면 그 콜백은 영원히 미실행**(options로 취급, Promise도 버려짐) → "팝업은 떠도 확인 눌러도 아무 일 없는" 유령 기능. **레시피**: ① `grep -rn "showConfirm(" src/scripts`로 전 호출처 추출 → ② `await showConfirm(`·`showConfirm(...).then(`(정상 Promise 패턴) vs `showConfirm(<msg>, function`·`showConfirm(<msg>, () =>`(2번째 인자=함수=오용)로 분류 → ③ 오용처의 콜백 내부가 destructive/save write(axios.post/delete)면 100% 미작동. **+ 도달성 3단(#334 reachability)**: 발견한 핸들러가 (a)이벤트에 배선됐는지(`grep -rn "<handlerName>" src` 호출처>0, 단가 input은 `oninput="calcItem"`만 = onUnitPriceManualChange 미배선) (b)가드 변수가 실제 세팅되는지(`dataset.basePrice`를 채우는 코드 유무) (c)콜백 invocation이 올바른지 — 셋 중 하나라도 죽으면 그만큼 dead. **실증 #426** = onUnitPriceManualChange가 3중(미배선+basePrice 미설정+콜백오용) 전부 죽어 "거래처 특약 단가 저장 제안" 도입이래 100% 미작동. **자동수정 판정**: ③(콜백→`.then(confirmed=>{if(!confirmed)return;...})`)만은 안전 패턴교체이나 ①②까지 고치면 **휴면 write 활성화 = 기능 추가**(Area 3 자동수정 금지) → issue-only(owner 완성 vs 제거). **FP 배제**: `.then()` 체이닝·`await` 형태는 정상(scan.js:222·items/tabs.js:459·media.js:133). Area 3 SKILL에 codify.
>
> **🗑️ 파괴적 삭제 confirm 가드 커버리지 (Area 3, 2026-06-20 codify, 16회차)**: axios.delete 사이트가 확인 절차 없이 즉시 삭제하면 오삭제 위험. **레시피**: `grep -rln "axios.delete" src/scripts` → 각 사이트 위 ~20줄에 `confirm(`/`showConfirm`/문구타이핑 모달 유무 스캔. **FP 배제(필수)**: ① **래퍼 confirm** — 실삭제 함수(`deleteReceipt`)엔 confirm이 없어도 그 **유일 호출처가 confirm 래퍼**(`confirmDeleteReceipt`가 `showConfirm` 후 호출, 버튼 onclick=래퍼)면 정상 → 호출처 grep로 확인. ② **문구타이핑 모달** — `confirm()` 대신 정확 문구 입력 일치(hrDetail.js hrdConfirmDelete `input.value!==phrase`)는 confirm보다 강함. 2026-06-20 16회차 = 50+ delete 사이트 중 후보 2건 전부 FP(둘 다 위 패턴) = 삭제 confirm 커버리지 우수. **보고 전**: 실삭제 함수 호출처를 grep해 래퍼/모달이 선행하는지 확인(직접 함수에 confirm 없다고 단정 금지).
>
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

> **🔐 prod D1 FK 강제 = Area 4 탐지 전제 (Area 4 #413/25d1b8e, 2026-06-16 codify, 14회차)**: `25d1b8e`(#394 후속)가 prod에서 **D1가 batch 안에서 FK를 강제**함을 입증 — `inventory_transactions.handled_by`(=users(id) FK)에 `'system'` 문자열 바인딩 → FK 위반 → 승인 100% 500. 이로부터 두 standing scan:
> - **① users(id) FK 비-id 바인딩 sweep**: `PRAGMA foreign_key_list`로 `users`를 참조하는 FK 컬럼 전수 추출 후, 각 INSERT/UPDATE write 사이트의 바인딩이 **`c.get('user')?.id || null`/`user.id`/NULL 정규 패턴**인지 확인. **리터럴 문자열(`'system'`/`'admin'`)·username(`user?.username`)·검증 안 된 `X-User-Id` 헤더**가 FK 컬럼에 닿으면 100% 500. **FP 배제**: 동명 컬럼이라도 그 테이블의 그 컬럼이 `fks.json`에 FK로 안 잡히면 비-FK TEXT(예: `inventory_counts.approved_by/submitted_by`·`price_change_history.changed_by`는 비-FK라 `'system'` 안전). 2026-06-16 14회차 = 69 FK 컬럼 전수 net-new 0(25d1b8e가 유일·픽스됨).
> - **② cascade "고아" 후보는 ON DELETE 절 확인 후에만 보고**: 서브에이전트가 "부모 DELETE가 자식 X 미정리 → 고아"로 올리면, **먼저 그 FK의 `on_delete` 액션을 `PRAGMA foreign_key_list`로 확인**. **CASCADE/SET NULL이면 prod FK 강제 환경에서 자동 발동 = FP 즉시 드롭**(핸들러 수동정리 불필요). 서브에이전트의 "D1 FK 미강제라 수동정리 필요" 전제는 25d1b8e 입증과 모순 = FP 근원. **진짜 위험은 반대 방향**: `ON DELETE NO ACTION`(기본) 자식이 존재하면 **부모 삭제가 RESTRICT로 차단(500)** → 핸들러가 삭제 batch에서 **DELETE 전에 그 자식을 수동 SET NULL/DELETE 하는지** 확인(purchaseOrders/core.ts:751/753이 NO ACTION인 purchase_adjustments#312·purchase_invoices#324를 선정리하는 정상 패턴). 2026-06-16 = 서브에이전트 cascade 후보 3건(payments SET NULL·pr_comments CASCADE·converted_po_id SET NULL) 전부 ON DELETE 절로 FP 차단.
>
> **✅ CHECK IN 제약 ↔ literal write 불일치 standing scan (Area 4, 2026-06-18 codify, 15회차)**: ground-truth `sqlite_master.sql`에서 `CHECK(col IN ('A','B',...))` 제약을 전수 추출(이 코드베이스 36개: users.role·orders.status·cards.status·auto_process_jobs.status[**소문자** pending|processing|done|approved|failed]·card_transactions.status 등) → 코드의 `INSERT/UPDATE`가 그 컬럼에 **허용집합 밖 literal 값**을 쓰면 constraint throw로 기능 사망(INSERT/UPDATE 컬럼-존재성 스캔이 못 잡는 사각 — 컬럼은 존재하나 값이 위반). **핵심 FP 회피 = 대상 테이블 정확 매칭**: 컬럼명만 grep(`status='X'`)하면 (a)CHECK 없는 동명 컬럼 테이블(inventory_counts·claims·cash_schedule·vat_reports 등)에서 대량 FP, (b)`pp_status`/`rip_status` 같은 prefix 컬럼이 `\bstatus\s*=` regex에 tail 매칭됨. → **반드시 `UPDATE <t> SET ...`/`INSERT INTO <t> (cols) VALUES(...)`로 대상 테이블을 확정한 뒤 그 테이블의 CHECK 집합과만 대조**(INSERT는 컬럼↔값 positional 매핑). **read-only(SELECT/CASE WHEN)는 constraint 위험 0 → write만**. 충돌 위험 높은 테이블 우선 직접 검증: **소문자 enum**(auto_process_jobs) vs 대문자 혼동, **CANCELLED 없는 cards.status**(orders.status엔 있어 복붙 위험). 2026-06-18 15회차 = literal write CHECK 위반 net-new 0. 탐지: CHECK 추출 후 `byTable[t][col]` Set 구성 → write문 대상테이블 묶어 literal 대조.
> - **🔁 INSERT는 positional 매핑으로 별도 스캔 (Area 4, 2026-06-19 codify, 16회차)**: 15회차 CHECK-literal 스캔은 `UPDATE <t> SET col='X'`(col=값 직접 인접)에 강하나 **`INSERT INTO <t> (cols) VALUES (vals)`는 cols·vals 분리 = positional 매핑 필요**(i번째 컬럼 ↔ i번째 값). VALUES를 depth-0 콤마로 split(괄호/배열 보존)해 `cols[i]`가 CHECK 컬럼이면 `vals[i]` 리터럴을 허용집합과 대조. `?` 바인드·표현식은 SKIP(FP 회피), `vals.length!==cols.length`면 동적이라 SKIP. 16회차 = INSERT positional CHECK 위반 net-new 0(신규 `original_archives.status`·`sheet_layouts.status` 포함 38제약). UPDATE-only로는 INSERT 경로 사각.
> - **📐 신규 write-path의 denormalized aggregate 증분(delta) 정합성 standing check (Area 4, 2026-06-19 codify, 16회차)**: 기존 주문/발주에 라인을 **append**하는 부분-write가 비정규 집계 컬럼(`orders.total_amount/vat_amount/final_amount`·`purchase_orders.received_quantity` 등)을 **증분 갱신**(`SET total_amount = COALESCE(total_amount,0) + ?`)하면 두 가지를 검증: ① **delta 공식이 full-recompute와 일치**하는지 — 불변항(discount·동결 청구그룹·BILLED/PAID)이 보존되고 `final += totalDelta+vatDelta`가 `final = total - discount + vat` 재계산과 동치인지(주문 append `create.ts:POST /:id/items`는 discount 불변 + `recalcOrderBillingGroups` 동결그룹 보존 = 정합). ② **증분 중복적용 방어** — 멱등 가드 없이 재시도/더블클릭하면 delta가 2회 더해짐(#420 `po-receive.ts:228 received_quantity 가산` 클래스의 데이터-정합성 거울). 16회차 append(+333줄)는 ①정합·entity 격리·카드번호 충돌회피·status history 모두 clean, ②는 Area 3 #420으로 이미 보고됨. **탐지**: `git diff <last-area4>..HEAD`에서 신규 `UPDATE ... SET <aggcol> = ... + ?` 증분문 → 해당 aggcol의 full-recompute 공식(create 경로)과 대조 + 멱등 가드 유무 확인.
>
> **🤖 NOT NULL no-default + 전체 컬럼셋 자동 diff (Area 4 standing scan, 2026-06-15 codify, 13회차)**: ground-truth DB에서 테이블별 ① NOT NULL no-default 컬럼셋(`PRAGMA table_info` `notnull===1 && dflt_value===null && pk!==1`) ② 전체 컬럼셋을 추출 → `src/**/*.{ts,js}`의 `INSERT INTO <t> (cols) VALUES/SELECT` 컬럼리스트를 정규식 파싱해 **`missing`(NOT NULL 누락→constraint throw)·`unknown`(존재X 컬럼→no such column throw)** 자동 격리. 단순 콤마 리스트만(서브쿼리/괄호 포함 컬럼셋·`${동적}` 템플릿은 스킵=FP 회피). #394(missing 3+unknown 4)·#406(unknown 6+severity+오타)·**#408(migration.ts items.unit_price unknown)** 전부 이 스캔이 한 번에 격리. **핵심 사각 — import/migration 핸들러 포함**: `/items/preview`(SELECT만)는 통과하나 `/items/import`(INSERT/UPDATE)만 존재X 컬럼 throw = **미리보기 OK인데 실제 실행만 전량 실패하는 침묵 함정**. preview↔execute 분리 핸들러는 execute 경로의 write 컬럼셋을 별도 검증.
>
> **🧭 Ground-truth 기법 (Area 4)**: 프로덕션 D1 직접 접근 불가 시 → `migrations/*.sql` 전체를 로컬 D1에 적용해 **실제 해석 스키마**(테이블/인덱스/UNIQUE) 확보 후 정적분석과 교차검증.
> 인덱스·UNIQUE 누락 후보는 대부분 오탐(컬럼 존재하나 hot query path 아님 / 이미 복합 인덱스 존재) → ground truth로 반증 필수. (Area 4에서 tax_invoices·shipments 2건 오탐 차단)

> **🔀 status-consistency 제외 픽스의 완전성 sweep (Area 4, 2026-06-22 codify, 20회차)**: owner/에이전트가 "특정 status를 가진 행을 보드/대시보드에서 숨김" 픽스(예: CANCELLED 주문의 카드를 보드/대시보드에서 제외)를 추가하면 **#377 부분픽스 규칙 적용** — 같은 엔터티를 집계/나열하는 **모든 글로벌 표면을 전수 sweep**해 누락 없는지 확인. **핵심 분류(FP 회피)**: `grep -rn "FROM <entity>" src/routes` 후보 중 ① **글로벌 보드/대시보드 집계**(전체 카운트·칸반·요약) = 제외 적용 대상, ② **단일 컨텍스트 쿼리(`WHERE <parent>_id=?`)** = 특정 주문 상세 등 문맥상 그 부모 소속이라 제외 불필요(정상), ③ **작업이력/생산실적 집계**(production/oee의 work_records·quality_items JOIN) = 실제 수행된 작업이라 **사후 취소돼도 집계 포함이 정합**(제외하면 오히려 실적 왜곡). 실증 `f81359c`: 취소주문 카드 HOLD 주차 → 보드 영구잔존 → owner가 `cards/queries.ts`(보드 summary/list/칸반)·`dashboard.ts`(카드카운트 6종)만 제외 → 나머지 card 쿼리는 ②③이라 미수정이 정합, 완전. **+ JOIN 존재성 확인**: status를 부모 JOIN 컬럼(`o.status`)으로 거를 때 그 쿼리에 해당 JOIN(`LEFT JOIN orders o`)이 실재하는지 확인 — 없으면 픽스 자체가 `no such column` 회귀 유입(f81359c는 list `where`의 `o.status`에 대응 JOIN 보유=자기정합). 취소카드가 다른 status(HOLD)로 전이되면 status 필터(`status='PRINTING'`)는 **자연 제외**되므로 그런 쿼리는 후보 아님(aiInsights PRINTING join FP 배제).
>
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
> - **🧬 신규 스캔 대상 — 하위자원 append 엔드포인트(`POST /:id/items` 류) write-isolation (Area 5, 2026-06-19 codify, 17회차)**: 기존 신규기능 비대칭 스캔(#417 mass-assignment·#418 read-leak)은 list/단건/생성(`POST /`) 위주였으나, ia-editor가 추가한 **부모자원의 하위 라인을 끼워넣는 sub-resource POST**(`orders/create.ts POST /:id/items`)는 별도 형태의 공격표면. **올바른 패턴(이번 사이클 clean 입증) = (a)부모 조회를 `entityFilter(c,'orders')`로 격리** → (b)자식 INSERT의 entity는 **그 entityFilter-검증된 `order.entity_id`에서 파생**(`billingEntityId = Number(order.entity_id) || ...`)하고 **`body.entity_id`를 절대 신뢰 안 함**(= #417 mass-assignment의 정답 거울). **함정 구분**: body의 `assigned_entity_id`는 격리키가 아니라 **생산 배정(타법인 협업 라우팅)** free-field라 body 신뢰가 정상(create와 동형) — 격리키(entity_id)와 혼동 말 것. **탐지**: churn에서 `POST /:id/<sub>` 하위경로 핸들러 → ① 부모 lookup이 entityFilter인지 ② 자식 INSERT의 entity_id가 부모파생인지(body 아닌지) ③ 새 read 핸들러가 동반됐으면 #418 read-filter 점검. sub-resource write를 신규기능 write-isolation 스캔 목록에 정식 편입.
> - **🆕 변종 — 신규기능 머지의 "write 격리 ↔ read 필터 누락" 비대칭 (Area 5 #418, 2026-06-18 codify)**: 새 멀티-entity 기능을 머지하면 개발자가 **INSERT는 `getEntityId(c)`로 격리 저장**(격리 의도 인지)하면서 그 데이터를 **읽는 list/조회 핸들러에 entityFilter를 빠뜨리는** 비대칭이 반복(IDOR 비대칭 #349/#356 "list 필터·단건 누락"의 신규기능 변종 = **write는 격리·read만 누락**). 실증 #418 = `kakao.ts` INSERT 9곳 전부 `entity_id=getEntityId(c)` + `GET /template-defaults`는 entityFilter인데 **`GET /logs`만 entity 필터 0** → MANAGER(구체 entity)가 타법인 수신자 PII(receiver_num/content) cross-tenant 열람. **탐지**: ① 테이블에 entity_id 존재 확인(`grep -rn "<table>" migrations | grep entity_id`) ② 그 테이블에 INSERT하는 코드가 entity_id에 `getEntityId(c)`를 쓰는지(=격리 의도) ③ 그 테이블을 SELECT하는 **모든** 핸들러가 entityFilter/cardEntityFilter를 갖는지 전수 — 한 곳이라도 빠지면 cross-tenant read. **함정 — `requireRole('ADMIN','MANAGER')` 라우터**: "ADMIN-gated니 전체열람 정상"이라 넘기면 안 됨 — **빈 필터(전체조회)는 `getEntityId(c)===0`(super-ADMIN)에만** 부여되고 **MANAGER는 항상 구체 entityId**라 격리 필수. 머지 churn(`git diff --stat <last-area5>..HEAD -- src/routes`)에서 +라인 큰 라우트 우선.

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

> **🕳️ XSS sweep 사각 3종 (Area 5/6 A-024, 2026-06-15 codify) — "106파일 전수" 자칭이 5사이클 후에도 14 sink 누락**: 페이지별 sweep가 반복적으로 놓치는 3패턴을 매 sweep 명시 점검: ① **escapeHtml 0회 사용 파일**(`grep -c escapeHtml <file>`=0 → "이 파일은 escape 컨벤션 자체가 없음" 신호, innerHTML 싱크 전수 의심 — items/modals.js가 0회인데 item_name 4 sink). ② **`<option value="X">텍스트</option>` 드롭다운** — value **속성**도 미escape면 `"` 속성탈출 가능(텍스트만 보지 말 것 — orderForm/finishing.js m.name이 value+텍스트 양쪽). ③ **전역/공통 컴포넌트**(`layout/shell.js` 사이드바 품목검색 등) — 페이지 단위 sweep가 셸 컴포넌트를 건너뜀(전 페이지 노출이라 노출면 최대). 또 **마스터 자유입력 필드 확대**: 장비명/프린터명/구역명(equipment)·창고구역명/담당자명(storage_zones)·후가공방식명·프리셋명·item_group도 싱크(거래처명/품목명/직원명 외 추가). **agent JSON 유입 주의**: heartbeat 자동등록처럼 외부 agent payload가 마스터 컬럼(equipment.name)으로 들어가면 출력이력 등으로 2차 전파.
> **🔁 같은 파일 "부분 escape 형제 데이터소스" (Area 5 A-025, 2026-06-16 codify) — 이미 픽스한 파일이 6사이클 연속 형제 sink 노출**: A-024(finishing.js `:32 m.name` 마감방식)→A-025(같은 파일 후가공 `option_name`/`option_code` `:178/:204/:321`+data-pp-* 속성) = **파일에 escapeHtml이 N회 있어도(컨벤션 확립) 다른 쿼리/루프(finishOpts vs methods)는 별도 누락 가능**. **"이 파일은 픽스됨" 파일 단위 판정 금지** — `grep -c escapeHtml`>0이어도 안심 말고 **각 innerHTML 보간 데이터소스(다른 axios.get 결과·다른 forEach 루프)별로 sink 전수**. 빠른 탐지: 파일 내 `innerHTML`/`html +=` 보간 변수를 데이터소스(어느 API/배열에서 왔나)별로 그룹핑 → 그룹마다 escapeHtml 적용률 확인(한 그룹만 0%면 누락). `<option>` value+텍스트+data-* 속성 전부 sink(escapeHtml은 dataset round-trip 안전).
> **🧷 prefix-scoped escape 래퍼(`sgpEsc`/`iaeEscape`)의 `typeof===function` fallback = 셸 경유 페이지에서만 안전 (Area 5, 2026-06-21 codify, 18회차)**: 신규 self-service 페이지가 `?raw` 전역 스코프 충돌 회피용 자체 prefix 래퍼 `function sgpEsc(s){ return (typeof escapeHtml==='function') ? escapeHtml(s==null?'':String(s)) : String(s); }`를 도입하면 sink 전수 적용 시 clean(specGroups.js +391 = innerHTML sink 전수 sgpEsc 일관, checkbox `value=` 속성 포함, net-new 0). **단 핵심 함정 = fallback이 raw `String(s)`**라 전역 `escapeHtml` 부재 컨텍스트에선 **escape가 silent disable**. SPA 셸 경유 페이지(specGroups 포함)는 shell.js가 `window.escapeHtml` 전역 정의 → fallback 미발동=안전. **그러나 독립 `c.html` 페이지(payslip/yearEnd, line 190 예외)에서 같은 prefix 래퍼를 쓰면 전역 헬퍼 부재로 fallback 발동→무방비 XSS**. **레시피**: 신규 prefix-escape 래퍼(`grep -rn "function \w*[Ee]sc(" src/scripts`) 발견 시 (a)각 innerHTML sink 적용률 + (b)그 페이지 로드 경로(셸 SPA vs 독립 c.html)를 함께 확인 — 독립 페이지면 fallback이 raw가 아니라 로컬 실제 escape여야 안전. 신규 관리 페이지가 처음부터 prefix 래퍼+전수 적용이면 clean이나 **검증 자체는 Area 5/6 standing meta-check 필수**(A-024/A-025 부분누락 클래스).
> **🪆 agent-payload JSON 배열 → innerHTML = stored-XSS sink 형태 확장 (Area 5, 2026-06-22 codify, 19회차)**: line 203 "agent JSON 유입 주의"의 구체 확인 — 외부 agent(logwatcher)가 보낸 **파일명 배열**이 백엔드에서 `JSON.stringify(nest_members)`로 컬럼 저장(`printEvents.ts`, `?` 바인드라 SQLi 0)된 뒤, 프론트가 `JSON.parse` → `.map()`으로 `<li>` 렌더(`production.js:311`)하는 **JSON-배열 sink**는 기존 "단일 free-text 컬럼" sink와 다른 형태이나 같은 클래스. **올바른 패턴(이번 사이클 clean 입증)**: ① 배열 원소를 **텍스트·title 속성 양쪽** escape(`'<li title="'+escapeHtml(String(m))+'">'+escapeHtml(base)+'</li>'`) ② 동반 `file_name`은 **변수 정의 지점에서 `escapeHtml(ev.file_name)`** 1회 escape 후 모든 렌더에서 그 변수 재사용(`production.js:268` `var fileName = escapeHtml(...)` → :318/:322 재사용 = 정의-지점 escape 전파 패턴, 매 사용처 중복 escape 불필요). **탐지**: agent/외부소스가 채우는 컬럼(file_name·nest_members·equipment.name·heartbeat payload)이 `JSON.parse(...).map(`/`forEach(`로 innerHTML 보간되면 (a)배열 원소 텍스트 (b)그 원소를 쓰는 title/data-* 속성 (c)정의-지점 단일 escape의 전파 완전성 3가지 확인. **FP 배제**: 정의 지점에서 escape된 변수는 하위 렌더 재사용이 안전(중복 escape "필요"로 오보 금지 — `&`가 `&amp;amp;`로 이중인코딩되지 않게 정의-지점 1회가 정답).

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

> **🌉 Area 6가 "직전 Area 4 이후 churn"의 컬럼-diff를 bridge (Area 6 codify, 2026-06-15)**: Area 4의 "존재X 컬럼/NOT NULL 누락" 컬럼 스캔은 6영역 순환이라 **그 사이클 이후 발생한 코드/마이그레이션 churn(다음 Area 4까지 ~24h)을 못 잡음** — 그 사이 Area 5는 보안/XSS 각도라 컬럼 검증 안 함. **Area 6 신선 각도 = 직전 Area 4 HEAD 이후 churn된 라우트/마이그레이션의 INSERT만 골라 ground-truth 컬럼-diff**(`git log <area4-head>..HEAD -- src/routes migrations` → 변경 테이블의 INSERT 컬럼리스트 ↔ `pragma_table_info` 대조 + NOT NULL no-default 바인딩 확인). 2026-06-15 실증: equipment/logwatcher 장비중심 모델 churn(6221acb→ec44fcd, 0312 마이그레이션 + print_events/equipment/oee INSERT 9곳)이 Area 4(fdcb62d) 직후 발생 → Area 6가 309마이그레이션 FAIL 0 위에서 전수 diff = **존재X 0·NOT NULL 누락 0**(equipment.name NOT NULL도 `equipment_name||equipment_id` 폴백 충족) clean 확인. 신규 기능 churn은 컬럼 버그 유입 위험이 가장 높으므로 Area 6 standing meta-check로.
> **⚙️ git fetch-before-compare (Area 1/6)**: detached HEAD에서 `git rev-parse HEAD origin/main`이 갈라져 보이거나 `rev-list --count`가 큰 ahead/behind를 내도 **stale 트래킹 ref일 수 있음** — origin이 force-update됐으면 `git fetch origin main` 후에야 정합 판정 가능(2026-06-15: 세션 시작 시 79/94 갈라짐 → fetch 후 0/0 동기). "stale 푸시 미완" 패닉 전 fetch 먼저.
> **🌉🩹 Area 6 bridge 확장 = "직전 Area 5 이후 프론트 feature churn의 XSS 재감사" (Area 6 codify, 2026-06-18, 16회차)**: 컬럼-diff bridge(line 208)의 **프론트 XSS 거울** — Area 5의 innerHTML free-text sweep도 6영역 순환이라 **그 사이클 이후 머지된 신규 프론트 기능(다음 Area 5까지 ~24h)을 못 잡음**(그 사이 Area 1~4는 XSS 각도 아님). 특히 **대형 프론트 기능이 N1→N5처럼 증분 커밋으로 Area 5 감사 사이사이에 착륙**하면, 직전 Area 5는 그 파일의 **그 시점 버전만** 감사하고 이후 추가분은 미감사로 남음. **Area 6 신선 각도 = 직전 Area 5 HEAD 이후 churn된 `src/scripts/**/*.js`의 추가 라인만 골라 XSS sink 재감사**(`git diff --stat <area5-head>..HEAD -- src/scripts` → +라인 큰 파일 → 그 diff 영역의 innerHTML 보간만 — 파일 전체 아님, Area 5가 기존분 커버). 2026-06-18 16회차 실증: iaEditor.js가 Area 5 감사(962줄 시점, bebee1f) 이후 **N1~N5 캔버스 기능 +914줄**(aa75880~fe09551) 착륙 → 추가분 전 sink(filename/label/finishing/item_name/item_code/client_name/client_code/preset name) 전수 = **`iaeEscape` 일관 적용**(robust: `& < > " '` escape → 텍스트·속성·dataset 컨텍스트 안전), preflight/nesting은 하드코딩/숫자 = **net-new XSS 0**. 신규 feature가 escape 컨벤션(`iaeEscape` 래퍼)을 처음부터 따르면 clean이나, **검증 자체는 Area 6 standing meta-check로 필수**(개발자가 컨벤션을 일부 sink에서 빠뜨릴 위험 = A-024/A-025 누적 클래스). 컬럼 bridge(백엔드 INSERT)와 XSS bridge(프론트 innerHTML) 둘 다 매 Area 6에서 직전 해당영역 HEAD 이후 churn 대상.
> **🌉🩹 컬럼-diff bridge = 도입뿐 아니라 "드리프트 정리(존재X 컬럼 제거)" 커밋의 완전성도 검증 대상 (Area 6 codify, 2026-06-19, 17회차)**: line 214 컬럼 bridge는 "churn이 **나쁜 컬럼을 도입**했나"(INSERT/SELECT에 미존재 컬럼 유입)만 프레이밍했으나, **반대 방향 — dev 세션이 churn 윈도에서 기존 "존재X 컬럼" 드리프트를 제거하는 정리 커밋**도 Area 6 검증 대상(A-026 자기-픽스 완전성의 **dev-세션 거울**). 실증 17회차: 직전 Area 4(2f3c259) 이후 유일 코드 churn = `ad8c0af`("finishing2/3 스키마 드리프트 정리 — 미실현 컬럼 참조 제거", autoProcess/orders.create/helpers 3파일) — `order_items`에 `finishing2`/`finishing3` 컬럼이 **어떤 마이그레이션도 생성 안 함**(0176이 `finishing` 단일 컬럼만 ALTER)인데 3곳이 SELECT → 매 주문생성 try/catch 내 throw(휴면 auto_process_jobs 큐). **검증 = #377 "부분픽스" 규칙 적용**: ① `grep -rn "finishing2\|finishing3" src` 전수 = 코드/SQL 참조 0(autoProcess.ts:108 주석 1건만 잔존, FP) → 형제 누락 없이 **완전 제거**. ② ground-truth 대조(`grep -rn finishing migrations`)로 `finishing2/3` ALTER 전무 = "정말 미실현 컬럼이었나" 확정(제거가 정당). **핵심**: 드리프트 정리 커밋은 "한 곳만 고치고 형제 SELECT 잔존" 위험이 도입과 동일(#377/A-026)이라, Area 6가 churn에서 *removal* 커밋을 만나면 (a)코드베이스 전수 재grep로 잔존 0 확인 (b)ground-truth로 제거 대상이 진짜 미존재였는지 확인 = 2단 완전성 검증. **탐지**: `git log <last-area4>..HEAD --oneline`에서 "드리프트/미실현/컬럼 제거/정리" 커밋 → 제거된 식별자를 `grep -rn` 전수 + migrations 대조.
> **🌉🩹🗑️ 컬럼-diff bridge 확장 = "대형 시스템 purge 커밋의 프론트↔백 완전성" (Area 6 #429, 2026-06-21 codify, 18회차)**: line 225 드리프트-제거 완전성 규칙을 **시스템 단위 purge**(라우터 파일·테이블·설정 탭 통째 제거)로 확대 — 백엔드를 N단계로 제거하면서 **프론트 axios 호출처를 남기는 비대칭**(#377 부분픽스의 frontend-axios 거울, #411 axios→route 존재성과 동일 클래스). **3단 완전성 레시피**: ① **dropped-table SQL refs** — `grep -rniE "(from|join|into|update)\s+(<dropped_table>)\b" src` = 0건이어야(잔존 시 `no such table` 100%-fail). ② **frontend axios→removed routes** — `grep -rn "/api/<removed-prefix>" src/scripts` = 제거된 라우터를 부르는 호출처(전부 404 대상). ③ **UI 진입점 중립화로 bug vs dead-code 분류(#318)** — ②의 호출처가 도달 가능한지: 진입 탭/버튼이 렌더되는지(`tabs.js` html append)·핸들러가 no-op 처리됐는지(`/* 폐기 */`)·모달 트리거가 숨김 div 내부인지. **중립화됐으면 dead code(noise, 사용자 영향 0), 살아있으면 live 404 버그**. 실증 18회차: print-system 제거(`b2b6a6b`1단계→`92b015a`2단계, printSystem.ts -1514·마이그 0334 DROP) → ① dropped-table refs 0(clean) ② 프론트 `/api/print-system/*` **18 호출처 잔존**(media.js 11·tabs.js 4·bulk.js 2·parent.js 1) ③ **전부 중립화**(설정 탭 버튼 미렌더 `tabs.js:19`·`__settings__` 폴백은 활성분류 8개라 미발동·`togglePrintMethodFilter` no-op·소재 모달 트리거 숨김 tabSettings div 내부) → **dead code(#429 cleanup, live 버그 아님)**. 커밋 자신이 "2단계 purge" 명시했으나 백엔드만 purge·프론트 잔여 = 미완. **핵심 교훈**: 시스템 purge는 컬럼 드리프트 정리(line 225)와 동급 완전성 검증 필요하되 **백엔드 제거 완전성(테이블/라우터)과 프론트 호출처 정리는 별개 축** — 백엔드가 깨끗해도 프론트 잔존이 남으면 (진입점 살아있을 때) live 404. **부수 — 마이그 번호 중복**: purge 마이그와 동시 머지된 타 feature 마이그가 같은 번호(0334×2)면 wrangler는 **전체 파일명 키 정렬 적용**이라 기능 안전(둘 다 결정적 적용)이나 컨벤션 위반 = minor. **탐지**: `git log <last-area5>..HEAD --oneline`에서 "제거/purge/decouple/시스템 제거" 커밋 → 제거된 라우터 prefix·테이블명을 위 3단 grep.
> **🆕 Area 6 컬럼-diff bridge가 "신규 feature util(새 테이블+새 컬럼 동시 도입)"을 sibling-parity로 빠르게 clean 판정 (Area 6, 2026-06-22 codify, 20회차)**: 직전 Area4/5 이후 churn이 **신규 기능 util 1개**(예 `71f885e` 후가공 코팅 자재 자동차감 = `autoDeductPostProcessingMaterials.ts` + 0352 `pp_material_deductions` 테이블 + `post_processing_options.material_item_group` 컬럼 + shipments POST fire-and-forget 훅)면, 그 util이 **새 테이블 INSERT + 기존 8테이블 SELECT**를 동시에 깔아 컬럼-존재성 위험이 높음. **가장 빠른 검증 = 동일 도메인의 proven sibling util과 컬럼명 parity 대조**: 신규 차감 util은 인쇄 차감 sibling(`autoDeductInventory.ts`)과 공유 컬럼(`print_events.output_width/output_height/copy_total`·`cards.requesting_entity_id/order_id/order_item_id`)을 **글자그대로 동일**하게 써야 안전(혼동 함정 = `output_width`[print_events 실컬럼, TEXT] vs `output_width_mm`[pp_material_deductions/realtime_cost 테이블 컬럼] — 같은 의미 다른 이름이라 테이블 섞으면 no-such-column). 신규 테이블 INSERT는 **그 마이그(0352)의 CREATE TABLE 컬럼순과 positional 대조**(13컬럼=13값) + NOT NULL no-default(print_event_id/material_item_id/deducted_length_yd) 전부 바인드 확인. **부수 = 이 feature는 #420 TOCTOU 멱등성 클래스의 올바른 reference**: `UNIQUE(print_event_id, material_item_id)` 가드 + INSERT UNIQUE 위반 catch에서 inventory `+= dedYd` race-rollback = fire-and-forget 재실행/동시출고에도 이중차감 0(파괴적 가산 write의 정답 패턴). 신규 feature가 처음부터 sibling 컨벤션·멱등 가드·entity 파생(body 불신)을 따르면 clean이나 **검증 자체는 Area 6 standing meta-check 필수**(컬럼 bridge + XSS bridge + sibling-parity). 20회차 = 이 feature 전 컬럼 clean·entity 격리 sound·멱등 가드 정합 = net-new 0.
>
> **🪞 Area 6 자기-픽스 완전성 검증 (A-026, 2026-06-16 codify)**: 직전 사이클 이후 churn이 **에이전트 자신의 자동수정 픽스뿐**이면(예: A-025 XSS escapeHtml 커밋만, INSERT/컬럼 변경 0) post-Area4 churn 컬럼-diff bridge가 퇴화(검증할 신규 컬럼 write 없음) → **대체 standing check = 직전 자동수정이 손댄 파일을 그 픽스가 codify한 교훈으로 재검**. 실증: A-025 교훈="같은 파일에 escapeHtml이 N회 있어도 다른 데이터소스 루프는 별도 누락 가능, 파일단위 픽스됨 판정 금지" → A-025가 finishing.js의 `option_name`/`option_code`는 escape했으나 **같은 파일 transfer 필드의 `parameter_schema` JSON 하위필드(`v`/`f.label`/`f.key` = 별도 데이터소스)는 누락** → A-026이 격리·픽스. **핵심**: #377 "파일분할 후 부분픽스" 규칙이 **에이전트 자기 자동수정에도 적용** — 자동수정이 "한 파일 한 데이터소스"만 고치면 형제 데이터소스 잔존. 자동수정 직후 또는 다음 Area 6에서 그 파일의 **모든 innerHTML 보간 변수를 데이터소스(어느 API/JSON/배열)별로 그룹핑 → 그룹마다 escapeHtml 적용률 재확인**. parameter_schema·options JSON 같은 **중첩 config JSON도 ADMIN free-input이면 free-text sink**(enum 토큰이라 realism 낮아도 같은 클래스).

**학습된 패턴 (탐지 가치 높음)**:
- N+1 쿼리: for 루프 내 `await DB.prepare(...)` → 보고 대상. **단 FP 예외 = 반복 횟수가 데이터 규모에 비례하지 않고 상수/하드 상한에 묶인 루프**(예: `workbench.ts:552` render-queue 루프가 `LIMIT 3`로 클레임 = 최대 3회, `Promise.all` 병렬 동시실행). 보고 전 루프의 iteration 소스를 확인 — `WHERE status='ACTIVE'`(전 직원)·사용자 업로드 배열처럼 **무한정 커질 수 있어야** N+1(#416 leaves accrual·attendance bulk). `LIMIT N`(상수)·`.slice(0,k)`·고정 enum 순회는 bounded = FP. (Area 2 2026-06-19 codify, 16회차)
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
