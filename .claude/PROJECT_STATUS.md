# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-05-16

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- (없음)

---

## 🟡 대기 중 (사용자 선택/승인 필요)

### [#65] 후가공 단계별 추적 — 방안 A/B/C 선택 대기
- A: QR 원터치, B: Zone 기반, C: 최소 2단계. 코멘트 제안 완료, 답변 대기

### [#89] syncOrderStatus Race Condition — Option B 승인 대기
- 원자적 조건부 UPDATE SQL 방안 제안. 승인 시 구현

### [#92] 재고 조정 동시성 — 방안 B 승인 대기
- UPDATE WHERE quantity + ? >= 0 원자적 검증 방안 제안

### [#75] 견적 적정 단가 제안 — 방향 수정 답변 완료
- 매입단가 미노출, 평균 판매가 기반 추천 방식으로 전환

### [#79] 로트 추적 → 기간 역추적 축소 — 답변 완료
- lot 테이블 불필요, 기존 receipts 기반 기간별 역추적 쿼리만 추가 (S)

### [#80] 바코드/QR 시스템 — 모바일 설계 답변 완료
- HTTPS + html5-qrcode + 모바일 우선 레이아웃 계획

### [#81] 카드 강화 (폴더 미리보기) — 심층 추론 답변 완료
- 방안 B(썸네일 그리드 뷰) + A(카드 상세 리디자인) 하이브리드 제안

### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 자동 발송
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)

---

## 🟢 최근 완료 (2026-05-15~16)

### 이슈 대량 처리 — 24건 closed (2026-05-15~16)

#### 버그/데이터 정합성 (8건)
- **#63**: 주문 생성 order_items INSERT db.batch() 원자화
- **#64**: shipment_items FK ON DELETE SET NULL (migration 0208)
- **#83**: billing_status 변경 5개 쿼리쌍 db.batch() 원자화
- **#84**: #64 중복 (close)
- **#85**: printEvents reported_by=1 → nullable + console.warn (0222)
- **#86**: approval_requests entity_id 추가 + entityFilter 적용 (0223)
- **#87**: 주문 삭제 6개 DELETE → db.batch() 원자화
- **#88**: inventory_transactions UNIQUE INDEX 중복 방지 (0224)
- **#90**: CAPS 사원 매핑 이전 사이트 비활성화
- **#91**: 입고 unit_price 음수/0 검증 추가

#### 신규 기능 — Tier 1 (5건)
- **#65~#69**: 후가공/프린터큐/OEE/불량코드·클레임/여신한도 → 승인 4건 구현 (#65 대기)

#### 신규 기능 — Tier 2 (6건)
- **#70**: 반품/RMA 워크플로 (`/api/returns`)
- **#71**: 3-Way Matching (`/api/purchase-invoices`)
- **#72**: 자재 폐기/로스 추적 (`/api/waste`)
- **#73**: 정비 관리 페이지 + 대시보드 API
- **#74**: 재고 평가 FIFO/이동평균 (`/api/inventory-valuation`)
- **#75**: 견적↔실적 피드백 (방향 수정 중)

#### 신규 기능 — Tier 3 (4건)
- **#76**: 총계정원장 복식부기 (`/api/gl`, 34개 계정과목 시드)
- **#77**: 고정자산 감가상각 (`/api/fixed-assets`)
- **#78**: 예산 관리 Budget vs Actual (`/api/budgets`)
- **#82**: AI 미수금 리스크 Phase 1 (`/api/ai`)

### 수치 요약
- 마이그레이션: 0208~0224 (17개)
- 신규 라우트 파일: 11개
- 신규 API 엔드포인트: ~55개
- 신규 페이지: maintenance (정비 관리)
- 기존 코드 수정: orders/core.ts, approvals.ts, printEvents.ts, caps.ts, inventory.ts, rip.ts

---

## 📋 다음 세션 TODO

1. **사용자 선택 대기 이슈 답변 확인** — #65, #89, #92 승인 시 즉시 구현
2. **미커밋 변경사항 커밋** — 현재 uncommitted (사용자 확인 후)
3. **프로덕션 배포 판단** — 17개 마이그레이션 + 대량 기능 추가
4. **#75, #79, #80, #81** — 방향 확정 후 구현
