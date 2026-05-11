# Improvement Backlog
<!-- last_run_area: 3 -->
<!-- last_run_at: 2026-05-11T14:30:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 10 |
| 👀 reviewed | 0 |
| ✅ approved | 0 |
| 🔨 in-progress | 0 |
| ✔️ done | 1 |
| ❌ rejected | 0 |

---

## 🔴 Bugs / Issues

### [B-001] cards.requesting_entity_id 미설정 — 카드 entity 격리 누락 (Area 2)
- **발견**: 2026-05-11
- **증상**: `cards` 테이블에 `requesting_entity_id` 컬럼 존재하지만, INSERT 시 어디에서도 설정 안 함
- **영향**: 모든 카드가 entity 격리 없이 생성됨. 멀티사업자 환경에서 타 법인 카드가 보일 수 있음
- **위치**: `src/routes/orders/core.ts` ~line 197, `src/routes/cards/lifecycle.ts` ~line 938
- **수정**: INSERT에 `requesting_entity_id` 추가, `getEntityId(c)` 바인딩
- **공수**: 15분
- **상태**: 🆕

### [B-002] LogWatcher 프로덕션 미수신 (Area 1)
- **발견**: 2026-05-11
- **증상**: `agent_heartbeats` 테이블 0행, 로컬 DB에 `print_logs` 테이블 없음
- **영향**: 인쇄 완료 상태 자동 반영 안 됨, 현장 대시보드 진행률 수동 갱신 필요
- **원인 추정**: 프로덕션 전환 후 LogWatcher .env ERP_API_URL 미갱신, 또는 서비스 미실행
- **수정**: 서버PC에서 LogWatcher 프로세스 확인 + .env ERP_API_URL 점검
- **공수**: 30분 (현장 확인 필요)
- **상태**: 🆕

---

## 🟡 Improvements

### [I-001] N+1 쿼리: bank.ts bulk-apply (Area 2)
- **발견**: 2026-05-11
- **위치**: `src/routes/bank.ts` ~line 958
- **현재**: transaction_ids 배열을 순회하며 개별 SELECT (20~50건)
- **수정**: `WHERE id IN (${placeholders})` 단일 쿼리 + Map으로 변환
- **공수**: 30분
- **상태**: 🆕

### [I-002] N+1 쿼리: autoProcess.ts item-name lookup (Area 2)
- **발견**: 2026-05-11
- **위치**: `src/routes/autoProcess.ts` ~line 94
- **현재**: 각 order_item마다 `SELECT name FROM items WHERE id = ?` 개별 호출
- **수정**: item_id 수집 → IN 쿼리 → Map
- **공수**: 30분
- **상태**: 🆕

### [I-003] N+1 쿼리: approvals.ts step INSERT loop (Area 2)
- **발견**: 2026-05-11
- **위치**: `src/routes/approvals.ts` ~line 185
- **현재**: approval_steps를 for 루프로 개별 INSERT
- **수정**: `db.batch([])` 활용
- **공수**: 15분
- **상태**: 🆕

### [I-004] /api/clients 응답에 success 필드 누락 (Area 1)
- **발견**: 2026-05-11
- **현재**: `{clients:[], pagination:{}}` 형태, 다른 API는 모두 `{success:true, data:...}`
- **수정**: 응답 형식 통일
- **공수**: 15분
- **상태**: 🆕

---

## 🟢 Feature Proposals

### [F-001] 거래처 검색에 전화번호 포함 (Area 3)
- **발견**: 2026-05-11
- **현재**: client_name, client_code, search_keywords, business_registration_number만 LIKE 검색. phone/mobile 제외
- **제안**: WHERE절에 `OR c.phone LIKE ? OR c.mobile LIKE ?` 추가
- **가치**: 전화 주문 빈번한 인쇄업 특성상, 전화번호로 즉시 거래처 조회 필수. 하루 수십 건 마찰 해소
- **위치**: `src/routes/clients.ts` ~line 82 WHERE절
- **공수**: 15분
- **상태**: 🆕

### [F-002] 주문 목록 필터 "취소" 고정 문제 (Area 3)
- **발견**: 2026-05-11
- **현재**: localStorage에 `orders_filter_status=CANCELLED` 저장 시 다음 방문 때 빈 목록 표시. KPI "전체 10건"인데 테이블 "주문 없습니다" 모순
- **제안**: CANCELLED 필터는 localStorage 복원에서 제외, 또는 empty-state에 "현재 필터: 취소 / 전체 보기" 링크 추가
- **가치**: 매일 주문 목록 사용하는 직원이 "왜 데이터가 없지?" 혼란 반복 방지
- **공수**: 15분
- **상태**: 🆕

### [F-003] 현장 대시보드(/cards) KPI 강화 (Area 3)
- **발견**: 2026-05-11
- **현재**: 완료율(0%), 출고 예정 건수만 표시. 금일 매출, 납기 지연 건수 없음
- **제안**: "금일 납기 지연 N건" (빨간색 강조), "완료/전체 카드" 비율 확대, "금일 신규 주문 N건/N만원" 추가
- **가치**: 관리자가 아침 출근 시 "오늘 몇 건 나가야 하나, 지연이 몇 건이나" 한눈에 파악
- **공수**: 1시간
- **상태**: 🆕

### [F-004] 납품시간 disabled 이유 미표시 (Area 3)
- **발견**: 2026-05-11
- **현재**: 출고방법이 "대신택배"이면 납품시간이 disabled인데 이유 설명 없음
- **제안**: `(대신택배 출고마감 16:00 고정)` 인라인 힌트
- **가치**: 신규 직원 혼란 해소, 지원 문의 감소
- **공수**: 15분
- **상태**: 🆕

---

## 🔧 Auto-fixed (자동 수정 완료)

### [A-001] entity_id INSERT 14건 누락 (Area 2, 2026-05-09)
- **수정**: inventory/purchaseOrders/taxInvoices INSERT에 entity_id 추가
- **검증**: build + E2E 28/28 통과
- **커밋**: c7c20d3
- **상태**: ✔️ done

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
