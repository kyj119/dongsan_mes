# 선명 매입(purchase) 이관/대사 — 다음 세션 핸드오프 (2026-07-15)

> 매출/미수금 대사는 **완결**(선명 전 거래처 채권 엑셀 완벽 일치). 이 문서 = **매입 지급 이관 + 미지급 대사**용.
> 전체 SQL 정본 = `docs/sunmyung-import/`(00~21). 매출 상세 = `HANDOFF-sunmyung-import-execution.md` + auto-memory `project-sunmyung-item-import`.

## 1. 현재 매입 상태 (prod, entity_id=2)
- `purchase_invoices` **242 전표 / 496,161,096** (subtotal 451,055,542 + VAT 45,105,554), 매입처 **19**, 전량 `payment_status='UNPAID'`, `paid_amount=0`.
- `purchase_invoice_items` **1,098** (item_id 매핑 or NULL). ⚠️item_name 컬럼 없음 → 미매핑 원문은 invoice.notes에 보존됨.
- 원천: `품목마스터/원천주문데이터/매입내역_선명_01.01~06.30.xlsx`(구매현황, 1098행). invoice_number=`SM-YYYYMMDD-No`.

## 2. 해야 할 것 = 매입 지급(AP payment) 이관 + 미지급 대사
매출과 대칭 구조:
| 매출(완료) | 매입(할 것) |
|---|---|
| orders+billing | purchase_invoices (완료) |
| payments(수금)←통장 입금 | **`purchase_payments`(지급)←통장 출금** |
| adjustments(할인/이월) | 매입 에누리/이월 |
| 채권 파일 대사 | **매입처 채무(미지급) 파일 대사** |

### 2-1. 지급 소스 = 통장 출금
- 통장(`통장거래내역_선명01.01~06.30.xlsx`) **출금 308건 / 1,172,812,383 / 상대처 184종**.
- ⚠️ **출금 ≠ 전부 매입지급**: 급여(7M)·공장임차보증금(50M)·대출상환·수수료·계좌간이체 등 **재무/경비 다수 섞임**. **매입처(19)로 매칭되는 출금만** `purchase_payments` 생성.
- 통장 출금行에 **거래처코드(BRN) 있음** → BRN로 매입처 매칭 가능(매입파일은 BRN 없이 이름만이었으나, 등록된 매입처는 client에 BRN 있을 수 있음). 이름+BRN 병행 권장.
- 이체(계좌간 자금이체)·대출·급여·보증금 = 지급 제외(경비/재무는 /bank UI or 별도).

### 2-2. `purchase_payments` 스키마 (지급 대상 테이블)
`supplier_id`(FK clients, NOT NULL)·`payment_date`·`amount`·`payment_method`·`reference_number`·`po_id`(nullable)·`notes`·`created_by`·`entity_id`(DEFAULT 1→**2 명시**). CHECK 없음.
- 지급 반영 후 `purchase_invoices.payment_status`/`paid_amount` 갱신(전표 단위 매칭 or 매입처 총액).

### 2-3. 미지급 대사 (필요 데이터)
- ⚠️ **선명 "매입처별 채무/미지급" 파일이 아직 없음** (채권 파일의 매입 버전). 사용자에게 요청 필요.
- 대사 = 매입(496M) − 지급(통장 출금 매입분) − 에누리 = 미지급 잔액 vs 선명 채무파일.

## 3. ★핵심 교훈 (매출 이관에서 검증됨 — 매입에도 적용)
- **BRN 매칭 우선**(이름은 표기변형 오판). 매입 통장 출금도 BRN로.
- **🐛 CHECK 제약 반드시 실 DDL 확인**(로컬 검증 테이블에 CHECK 복제 안 하면 false pass). 예: bank_transactions match_status='MATCHED' 무효(→APPLIED), items item_type='SERVICE' 무효(→GOODS).
- **🐛 content_key 중복방지**: bank_transactions는 (계좌|일자|시각|유형|금액|잔액) VIRTUAL UNIQUE. 통장 재이관 시 동일포맷(date=YYYYMMDD·time HH:MM:00 초절사·type DEPOSIT/WITHDRAWAL)이어야 동기화 중복 안 남. **출금은 이미 06-29~07-14 동기화분 존재** → 06-28컷 or dedup.
- **🐛 D1 읽기복제 지연**: 집계 쿼리(SUM GROUP BY)가 간헐 stale값. **검증은 raw 원장(주문/지급 행 나열 합산)이 정본**. (대운 991,100 stale vs raw 598,400)
- **원장 created_at 함정**: 이관 주문 created_at=import시각이면 기간필터에서 누락 → 실제 일자로 UPDATE(0518에서 수정). 매입도 동일 주의.
- entity_id=2 전 INSERT 명시(DEFAULT 1 함정). 커밋=worktree로 main(공유 체크아웃 SheetLayout.jsx 등 타세션 dirty 존재).

## 4. 매출 대사 최종 결과 (참고 — 완결)
선명 미수금 = 채권 엑셀 **완벽 일치**(오차 ~7원). 84/86 정확일치 + 2 설명분(재현청주=6월 동산청주 이동·대운=D1지연표시). 청주 12거래처 동산청주(entity3) 귀속, 김진수 14M 오매칭 제거, 계산서-only 주문 생성(오케이/인효/대운), 통장/카드/할인/이월 전량 반영.
