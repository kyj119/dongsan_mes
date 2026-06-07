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

**오탐 제외**:
- `webhooks.ts allowedPrefixes` Popbill IP 목록 → 의도적 보안 화이트리스트, 하드코딩 아님
- dev server 전용 취약점 (vite/esbuild SSRF 등) → 프로덕션 영향 없음, 보고 가치 없음
- CORS `!origin → '*'` (index.tsx:213) → Bearer 인증(쿠키 미사용)이라 실질 무해
- rate limiter in-memory Map (rateLimit.ts:6) → isolate 분산 한계는 기존 인지 아키텍처 제약
- **rate-limit "누락" 보고 (라우트 파일에 inline 미들웨어 없음)** → rate limit은 `index.tsx`에서 `app.use('/api/...', rateLimitMiddleware(...))`로 **앱 레벨 전역 등록**(240-246: auth/portal login·users/portal change-pw·refresh·self-auth·verify-document·verify-token). 라우트 핸들러만 보면 항상 inline 부재로 오탐 → 보고 전 index.tsx 등록처 확인 필수 (Area 5 2026-06-06)
- **"escapeHtml 헬퍼 전무(`grep -c escapeHtml`=0) → XSS"** → `layout.ts:1185`가 `window.escapeHtml`를 **전역 정의**(+`portalLayout.ts` 포털용). 모든 스크립트가 로컬 정의 없이 전역 헬퍼 호출 가능 → 파일에 escapeHtml 미정의/미참조는 취약 증거 **아님**. 올바른 판정: 실제 `innerHTML` 싱크의 보간값이 (a)사용자 제어 free-text **이고** (b)미escape인지 직접 확인. `Number()` 강제 숫자·시스템 채번코드(order_number)·서버 하드코딩 문자열은 싱크 아님 (Area 6 2026-06-06, #335 portalBalance.js 잔여 오탐 차단)

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
