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

---

### 🟣 Area 5: 보안 + 인프라

**목적**: 취약점과 인프라 문제

점검 항목:
- SQL 바인딩 없이 문자열 삽입하는 쿼리 탐지
- XSS: innerHTML 사용처 vs escapeHtml 적용 여부
- 인증 누락: authMiddleware 없는 라우트
- Rate limiting 커버리지
- .env / 시크릿 노출 (git history, 코드 내 하드코딩)
- Cloudflare Workers 설정 (호환성 플래그, 보안 헤더)
- GitHub Actions 보안 (시크릿 접근, 권한 범위)

**자동 수정 가능**: escapeHtml 추가, SQL 바인딩 수정

---

### ⚙️ Area 6: 자기 진화

**목적**: 이 에이전트 자체의 탐지 능력 향상

수행 작업:
- IMPROVEMENT_BACKLOG.md 리뷰:
  - 용준님이 "approved" → "done"으로 바꾼 항목: 제안이 유효했음 → 유사 패턴 강화
  - 오래된 "new" 항목: 가치 없었을 수 있음 → 유사 패턴 약화
  - "rejected" 항목: 잘못된 제안 → 해당 탐지 규칙 수정
- 스킬 파일 업데이트:
  - 새로 발견한 패턴을 다른 스킬(review-checklist, security-audit 등)에 추가
  - 오탐(false positive) 패턴 제외 목록 갱신
- E2E 테스트 강화:
  - 이전 실행에서 발견된 버그에 대한 회귀 테스트 추가 제안
- 이 SKILL.md 자체도 필요하면 업데이트

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

## 에이전트 모델 배정

| 작업 | 모델 | 이유 |
|------|------|------|
| API health check | haiku | 단순 HTTP 요청 |
| 코드 패턴 스캔 | sonnet | 복잡한 패턴 매칭 |
| UX 감사 | opus | 비즈니스 맥락 이해 필요 |
| DB 쿼리 분석 | sonnet | SQL 이해 |
| 보안 스캔 | sonnet | 취약점 패턴 |
| 자기 진화 | opus | 메타 추론 |
