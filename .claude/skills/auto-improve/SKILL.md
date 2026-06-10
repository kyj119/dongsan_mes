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

> **🧭 도달성(reachability) 선검증 (Area 2·5 #334)**: entity_id 격리 갭을 **멀티테넌시 보안 이슈**로 분류하기 전, 해당 라우터/엔드포인트가 프론트에서 실제 호출되는지 확인 — `grep -rn "api/<path>" src/scripts src/pages`. **호출처 0건이면 orphan 라우터 = dead code 사안**(보안 영향 없음, 삭제/정리 권고로 분류). index.tsx에 `app.route()` 마운트만 돼 있다고 "사용 중"이 아님. (#334 order_templates가 보안 갭으로 오분류됐던 근본 원인 — `/api/templates`는 마운트만 되고 프론트 호출 0건)
>
> **⚠️ 도달성 규칙 예외 — 범용 서빙 프록시 (Area 5·6 #365)**: 위 "0건=dead code"는 **UI 트리거형 격리 갭**(특정 화면에서만 호출되는 `/:id` 핸들러)에만 적용. **클라이언트 제공 키로 raw 리소스를 서빙하는 범용 엔드포인트**(R2 파일 프록시 `files.ts` GET `/*`·generic download-by-key)는 프론트 참조 0건이어도 **인증된 직접 HTTP 호출이 곧 공격표면**(키가 구조적이거나 다른 API 응답에 노출돼 추측·도달 가능) → dead-code로 강등하지 말고 보안 이슈로 보고. 판별 기준: 핸들러가 (a)UI 컨텍스트 없이 임의 식별자/키만으로 (b)DB·entity·역할 검증 없이 리소스를 반환하면 도달성 무관하게 공격표면.

> **🚫 오탐 — 금액 부동소수점 누적 (Area 2 2026-06-08, 7회차)**: "VAT/금액을 반올림 없이 누적해 원 단위 신고 오차"는 **금액이 누적 직전에 정수로 반올림**되면(예: `quotations.ts:223` `Math.round(itemAmount/100)*100` → 100원 단위 정수, `×0.1`=10의 배수=정수) IEEE754 drift 불가. 보고 전 `node -e "...Number.isInteger(누적값)"`로 반증 필수. 견적(추정 금액)↔세금계산서(`Math.round` per-item + `total≠supply+tax면 강제정렬` 정합보정) "반올림 불일치"도 발행단계가 권위계산이라 버그 아님. models.ts `number`↔스키마 `REAL/INTEGER` 타입 표기차도 정상 TS(D1 바인딩 관행).

> **🚫 오탐 — best-effort catch "데이터손실" (Area 2 2026-06-08)**: catch가 에러를 잡고 `{success:true}` 반환해도, try 안이 **부차 denormalized 물질화**(가격이력·cash_schedule 등 언제든 재계산 가능한 파생)이고 **주석에 best-effort 명시**(예: `purchaseInvoices.ts:131/164` "receive Phase4와 동일 정책")면 의도적 설계. **핵심 비즈니스 write(주문/인보이스/잔액/재고)가 try 밖**이면 오탐. batch 실패 후 보상(rollback) `DELETE ... .catch(()=>{})`도 보상 자체 실패는 더 할 게 없어 정상. 보고하려면 **핵심 mutation**이 삼켜지고도 success로 응답하는 구체 경로를 실증.

> **⚖️ 트랜잭션 원자성 — 보고 기준 (Area 2 #369, 2026-06-09)**: "핵심 write가 `DB.batch()` 없이 분리 await 실행 → 부분실패 시 고아/불일치"는 **대부분 오탐**. 분리가 강제된 정상 패턴부터 배제:
> - **구조적 강제 = 정상**: 부모 INSERT가 `result.meta.last_row_id`를 받아 자식 INSERT에 써야 하면 부모는 batch 밖에 둘 수밖에 없음(bank.ts apply matched_payment_id·shipments.ts 출고헤더·orders/core.ts 주문헤더). 중간에 READ가 끼어(`balance_after` 산출용 잔량조회 등) batch를 둘로 나눠야 하는 것도 구조적. 이들은 단순 "2번째 write 실패하면?"이라 **확정 트리거 없는 일반 비원자성 = 노이즈**.
> - **보고 가능 = ① 확정 재현 트리거 + ② 회피 가능성**: ① 멱등 가드 부재로 **재시도/중복제출이 destructive write(재고차감·금액차감)를 반복**하는 구체 경로(부분실패→500→목록 잔류→재클릭, 또는 버튼 비활성화 없는 더블클릭). ② 분리가 last_row_id 강제가 아니라 read 끼임이면 **read를 메모리 산출로 대체해 단일 batch화 가능** → 설계로 고칠 수 있는 진짜 갭. #369(inventory inspection-decision CANCELLED)가 둘 다 충족: 멱등 가드 0 + balance_after 메모리 산출로 원자화 가능. 보고 전 (a)해당 mutation이 재고/금액/잔액 변경인지 (b)선행상태 가드(`WHERE status!=...`)·프론트 버튼 재진입 가드가 있는지 확인.

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
> - **변종 — 클라이언트 플래그로 필터 무력화(#368)**: list가 필터를 갖춰도 `?all_entities=1`류 쿼리 파라미터를 **역할 검증 없이** 신뢰해 필터를 끄면 우회(storageZones.ts:13/21, STAFF가 전 법인 열람). 비대칭 규칙은 "list가 필터를 쓴다"가 전제라 이 변종을 놓침 → `grep -rn "c.req.query(" src/routes` 중 entity/필터 분기를 제어하는 파라미터가 ADMIN/`getEntityId===0` 게이팅 없이 동작하는지 점검. (security-audit SKILL에 상세 codify)

**오탐 제외**:
- `webhooks.ts allowedPrefixes` Popbill IP 목록 → 의도적 보안 화이트리스트, 하드코딩 아님
- dev server 전용 취약점 (vite/esbuild SSRF 등) → 프로덕션 영향 없음, 보고 가치 없음
- CORS `!origin → '*'` (index.tsx:213) → Bearer 인증(쿠키 미사용)이라 실질 무해
- rate limiter in-memory Map (rateLimit.ts:6) → isolate 분산 한계는 기존 인지 아키텍처 제약
- **rate-limit "누락" 보고 (라우트 파일에 inline 미들웨어 없음)** → rate limit은 `index.tsx`에서 `app.use('/api/...', rateLimitMiddleware(...))`로 **앱 레벨 전역 등록**(240-246: auth/portal login·users/portal change-pw·refresh·self-auth·verify-document·verify-token). 라우트 핸들러만 보면 항상 inline 부재로 오탐 → 보고 전 index.tsx 등록처 확인 필수 (Area 5 2026-06-06)
- **"escapeHtml 헬퍼 전무(`grep -c escapeHtml`=0) → XSS"** → `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용). 메인 SPA·포털 셸을 통해 로드되는 스크립트는 로컬 정의 없이 전역 헬퍼 호출 가능 → 그 파일에 escapeHtml 미정의/미참조는 취약 증거 **아님**. 올바른 판정: 실제 `innerHTML` 싱크의 보간값이 (a)사용자 제어 free-text **이고** (b)미escape인지 직접 확인. `Number()` 강제 숫자·시스템 채번코드(order_number)·서버 하드코딩 문자열은 싱크 아님 (Area 6 2026-06-06, #335 portalBalance.js 잔여 오탐 차단)
  - **⚠️ 예외 — 독립 HTML 페이지는 전역 escapeHtml 없음 (Area 5 2026-06-10, 9회차)**: `c.html(\`...\`)`로 자체 `<head>/<script>`를 통째 반환하는 **독립 출력 페이지**(`pages/payslip.ts`·`pages/yearEnd.ts` 급여명세서/연말정산, `/payslip/:id`·`/year-end/:id` 인쇄 경로)는 layout.ts 셸을 거치지 않아 **`window.escapeHtml`가 정의돼 있지 않음**. 여기서 직원 마스터 free-text(성명/부서/직책/연락처)를 `innerHTML`에 raw 연결하면 **진짜 stored XSS**(HR ADMIN/MANAGER가 마스터에 페이로드 저장 → 인쇄 시 실행). 위 "전역 헬퍼 있으니 오탐" 논리를 **독립 페이지에 적용 금지**. 판별: 파일이 `import ... layout`/shell을 쓰지 않고 `c.html` 안에 자체 script를 넣으면 전역 헬퍼 부재 → 로컬 `esc()` 추가가 정답(escapeHtml 누락 = 안전 자동수정 범주). 탐지: `grep -rln "c.html(" src/pages` 후 각 파일이 free-text를 innerHTML/문자열연결로 렌더하는지.
- **무인증 self-service auth 엔드포인트 "브루트포스/열거 HIGH" 과대평가** (Area 5 2026-06-09, 8회차) → `/api/hr/self-auth`(사원번호+생년월일6자리)·portal `/verify-document`(토큰+BRN)처럼 **계정 없는 사용자용 간이 2팩터 인증**은 authMiddleware가 없는 게 **설계 의도**(공개 진입점). 보고 전 ① `index.tsx:240-246` rate limit 전역 등록 확인(self-auth=5/분·verify-document=10/분 이미 적용) ② 두 팩터 결합(열거 가능 식별자 + 추측가능 비밀) 형태가 동일 코드베이스의 **이미 "설계 정상" 판정된 패턴**(verify-document)과 동형인지 확인. rate-limit-by-IP의 IP로테이션 한계는 **모든 로그인 엔드포인트 공통 + 기존 인지 아키텍처 제약**(rateLimit.ts in-memory Map)이라 self-auth 단독 HIGH 아님. timing-attack도 두 분기(emp 없음 vs birth 불일치) 모두 단일쿼리+문자열비교라 유의미 차이 없음. **진짜 보고 대상**: rate limit 자체가 누락됐거나(index.tsx 미등록), 한 팩터만으로(식별자 없이) 인증되거나, scope/만료 없는 영구 토큰을 발급하는 경우.

> **📤 CSV Formula Injection 탐지 (Area 5 #367, 2026-06-08)**: CSV export 헬퍼가 셀 값의 **선행 `=` `+` `-` `@`(탭/CR)**를 이스케이프하지 않으면 자유입력(거래처명·품목명·메모 등)이 다운로드 PC Excel에서 수식 실행(HYPERLINK 유출/DDE). `,"` 개행만 따옴표 처리하는 건 **부족**. 점검: `grep -rn "includes(','" src` 후 각 CSV 헬퍼가 선행 특수문자 가드하는지. **이 코드베이스는 4개 구현 산재**(csv.ts generateCsv/escapeCsvField·tax-agent csvField·shipments 인라인 esc) — 하나만 고치면 우회. 가드 추가 시 **금융 음수금액(`-1000`)이 텍스트로 깨지지 않게 숫자-안전**(`typeof val!=='number' && /^[=+\-@\t\r]/.test(str) && isNaN(Number(str))`) 필수.

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
