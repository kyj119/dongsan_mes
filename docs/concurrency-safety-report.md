# 동시 사용 안전성 검토 보고서

> **작성일**: 2026-05-04 | **대상**: 8~9명 동시 입력/수정, 15명 동시 조회 환경

---

## 1. 현재 아키텍처 기반 분석

### 인프라
- **런타임**: Cloudflare Workers (V8 isolate, 요청별 독립 실행)
- **DB**: D1 (SQLite 기반, WAL 모드 — 동시 읽기 무제한, 쓰기 순차)
- **상태 관리**: Stateless (JWT 인증, 서버 세션 없음)

### D1(SQLite) 동시성 특성
- **읽기**: 동시 무제한 ✓ (15명 조회 문제없음)
- **쓰기**: 순차 처리 (하나의 writer lock)
- **충돌 시**: 자동 재시도 (Cloudflare D1 내부 처리)
- **트랜잭션**: D1은 단일 요청 내에서만 implicit transaction

---

## 2. 위험 시나리오 분석

### 🔴 HIGH RISK

#### 2-1. 같은 주문 동시 수정 (Lost Update)
- **시나리오**: MANAGER A가 주문 열람 → MANAGER B도 같은 주문 열람 → A 저장 → B 저장 (A 변경 덮어씌움)
- **현재 방어**: 없음
- **영향**: 납기, 수량, 단가 등 중요 데이터 유실
- **발생 빈도**: 낮음 (주문 담당이 보통 1명) but 치명적

#### 2-2. 카드 상태 동시 전환 (Race Condition)
- **시나리오**: OPERATOR A가 카드 "출력완료" 클릭 → OPERATOR B도 같은 카드 "출력완료" 클릭
- **현재 방어**: `status IN ('PRINTING')` WHERE 조건으로 부분 방어
- **영향**: 낮음 (idempotent — 이미 완료면 에러 반환)
- **발생 빈도**: 중간 (현장에서 여러 명이 같은 카드 볼 수 있음)

#### 2-3. 재고 동시 차감 (Over-release)
- **시나리오**: 입고 처리 중 동시에 출고 처리 → 재고 음수 가능
- **현재 방어**: `quantity - ? >= 0` 검증 있지만 read-then-write 패턴
- **영향**: 재고 음수, 데이터 불일치
- **발생 빈도**: 낮음 (입고/출고 담당 분리)

### 🟡 MEDIUM RISK

#### 2-4. 칸반 보드 실시간 반영 지연
- **시나리오**: A가 카드 "출력완료" → B의 칸반에 즉시 반영 안 됨 (수동 새로고침 필요)
- **현재 방어**: 없음 (polling/websocket 없음)
- **영향**: UX 불편 (이중 작업 시도)
- **발생 빈도**: 높음

#### 2-5. 주문번호 중복 (채번 충돌)
- **시나리오**: 동시 주문 생성 시 같은 MAX+1 시퀀스 가져옴
- **현재 방어**: MAX 기반 채번 → D1 순차 쓰기로 실질 방어됨
- **영향**: 이론적 가능, D1 특성상 발생 확률 극히 낮음

#### 2-6. 출고 이중 처리
- **시나리오**: 같은 카드를 2명이 동시 출고 → shipment_items 중복
- **현재 방어**: `shipped_at IS NULL` 조건 + status 체크
- **영향**: 중복 출고 기록

---

## 3. 권장 안전장치

### 즉시 적용 가능 (코드 변경만)

#### A. Optimistic Locking (낙관적 잠금) — 주문 수정
```
orders 테이블에 version INTEGER DEFAULT 0 추가

PUT /api/orders/:id 시:
1. 프론트: 열람 시 version 값 저장
2. 수정 저장 시 WHERE id = ? AND version = ? 조건
3. 매칭 안 되면 "다른 사용자가 수정했습니다. 새로고침해주세요" 에러
4. 성공 시 version = version + 1
```
- **효과**: Lost Update 방지
- **구현 비용**: 1~2시간

#### B. 상태 전이 원자적 업데이트 — 카드
```sql
-- 현재: SELECT → 검증 → UPDATE (2단계, race 가능)
-- 개선: UPDATE ... WHERE status = 'PRINTING' (원자적)
UPDATE cards SET status = 'PRINT_DONE'
WHERE id = ? AND status = 'PRINTING'
RETURNING id
-- 0 rows affected → 이미 다른 상태로 전환됨
```
- **효과**: 동시 상태 전환 안전
- **구현 비용**: 1시간

#### C. 재고 원자적 차감
```sql
-- 현재: SELECT quantity → 검증 → UPDATE (race 가능)
-- 개선:
UPDATE inventory SET quantity = quantity - ?
WHERE item_id = ? AND quantity >= ?
RETURNING quantity
-- 0 rows affected → 재고 부족
```
- **효과**: Over-release 방지
- **구현 비용**: 1시간

### 중기 적용 (인프라 변경)

#### D. 실시간 반영 (Server-Sent Events)
- 카드 상태 변경 시 다른 접속자에게 즉시 알림
- Cloudflare Durable Objects 또는 외부 Pub/Sub 필요
- **구현 비용**: 1~2주

#### E. 편집 잠금 (Pessimistic Lock)
- 주문 편집 시 "XX님이 편집 중" 표시
- 30초 TTL 후 자동 해제
- **구현 비용**: 2~3일

---

## 4. 우선순위 정리

| 순위 | 조치 | 효과 | 비용 |
|------|------|------|------|
| 1 | A. 주문 Optimistic Locking | Lost Update 방지 | 2h |
| 2 | B. 카드 원자적 상태 전환 | Race condition 방지 | 1h |
| 3 | C. 재고 원자적 차감 | Over-release 방지 | 1h |
| 4 | D. SSE 실시간 알림 | UX 개선 | 1~2주 |
| 5 | E. 편집 잠금 | 인지적 안전 | 3일 |

---

## 5. 15명 동시 접속 부하 예상

### Cloudflare Workers 성능
- 요청당 CPU 시간: ~5-15ms (D1 쿼리 포함)
- 동시 15명 × 평균 3초마다 1요청 = **초당 5 요청** → Workers 처리 여유 충분
- D1 읽기: 무제한 (WAL 모드)
- D1 쓰기: 초당 ~100회 가능 → 8~9명 동시 수정에 충분

### 병목 가능 구간
- 주문 생성(카드 자동 생성 포함): ~200-500ms per request
- 칸반 로드(limit=500 + _items JOIN): ~100-200ms
- **동시 15명 칸반 새로고침**: 문제없음 (읽기만)

### 결론
**인프라 부하는 문제없음.** 위험은 **데이터 정합성(동시 수정)**에 집중. A/B/C 안전장치 적용으로 해결.

---

> A/B/C 안전장치 착수 여부는 용준님 확인 후 결정합니다.
