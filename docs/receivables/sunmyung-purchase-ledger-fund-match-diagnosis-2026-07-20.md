# 선명(entity 2) 매입원장 · 자금-거래 매칭 점검 (2026-07-20)

> 읽기 전용 조사. prod D1 실측(`wrangler d1 execute webapp-production --remote`). 수정 없음.
> 요청: "매입원장이 없는 것 + 선명 1~6월 자금내역-거래내역 매칭이 안 되는 부분 점검".

## 결론

| 문제 | 실태 | 근본원인 |
|---|---|---|
| ① "매입원장 없음" | 매입원장 데이터는 존재, **미지급 246,187,780 정확**(캐시·목표 일치). 진짜 문제 = **화면마다 매입 수치 불일치** | 선명 매입이 `purchase_orders`(699.8M)·`purchase_invoices`(512.5M) 두 곳에 분산, 지급이 invoice에 미반영(paid=0) |
| ② 자금-거래 매칭 미완 | 출금 114건(189.3M)·입금 26건(94.8M) UNMATCHED 잔존 | 통장 적재 시 지급 미연결 + 자동매칭 lookback 90일 → 1~4월 자동 제외 |

**핵심: 미지급 총액(246M)은 정확. "없다/안 맞는다"는 표시·대사(reconciliation) 문제.**

---

## 문제 ① 선명 매입 이중구조

| 소스 | 건수 | 합계 | 특징 | 읽는 화면 |
|---|--:|--:|---|---|
| `purchase_orders` (SMP-xxxx) | 248 | **699,795,958** | 실매입 512.5M + 기초채무이월 187,259,834(2025-12, 6건) | 매입원장·매입정산·미지급 (`src/routes/ledger/accounts-payable.ts`, `src/scripts/ledger.js`) |
| `purchase_invoices` | 241 | **512,459,124** | `paid_amount` 전량 0, 241건 모두 `po_id`로 PO 연결 | 회계허브 매입탭·summary (`src/routes/accounting.ts:74,198,260,297`) |
| `purchase_payments` | 61 | 453,047,178 | 17개 매입처, 59건 통장 연결 | 지급(양쪽) |

### PO 월별 (entity 2)
| 월 | 건수 | 금액 |
|---|--:|--:|
| 2025-12 (이월) | 6 | 187,259,834 |
| 2026-01 | 21 | 66,809,017 |
| 2026-02 | 21 | 31,911,924 |
| 2026-03 | 37 | 101,829,282 |
| 2026-04 | 44 | 96,491,780 |
| 2026-05 | 46 | 112,840,240 |
| 2026-06 | 73 | 102,653,881 |
| **2026 소계** | 242 | **512,536,124** ≈ purchase_invoices 512,459,124 |

→ 실매입(512.5M)이 PO·invoice **양쪽에 존재**. 이월(187.3M)은 PO에만 존재(정상 발주→매입확정 흐름 + 이월 6건은 PO만).

### 미지급 3중 일치 (AP 잔액 자체는 정확)
- `clients.purchase_balance` 캐시합(매입처) = **246,187,780**
- 파생(PO 699.8M − 지급 453M − 감액) ≈ 246,187,780
- 핸드오프 목표(`docs/HANDOFF-sunmyung-purchase.md`) = **246,187,780**

### 불일치 지점
- 매입원장(PO 기반): 매입액 **699.8M**(이월 포함 과다), 미지급 246M ✔
- 회계허브 매입탭(invoice 기반): 매입 **512.5M 전액 미지급**(지급 453M 미반영, `paid_amount=0`)
- → 회계허브에서는 지급 대사가 안 된 원장처럼 보임.

---

## 문제 ② 선명 통장 ↔ 지급 매칭

| 유형 | APPLIED | CONFIRMED | IGNORED | SUGGESTED | UNMATCHED |
|---|--:|--:|--:|--:|--:|
| 입금 398 | 270 | 43 | 49 | 10 | **26 (94,754,815)** |
| 출금 351 | 118 | – | 118 | 1 | **114 (189,256,433)** |

- 출금 351건 중 `matched_purchase_payment_id` 연결 = 59건. purchase_payments 61건은 거의 다 통장 연결됨(역방향은 OK).

### 원인 3가지
1. 통장 적재(`docs/sunmyung-import/09_bank_transactions.sql`) 시 출금 대부분 `UNMATCHED`/`IGNORED`로 넣고 `matched_purchase_payment_id` 미연결.
2. 원천 출금 308건 중 **BRN 매칭 매입처 61건만** `purchase_payments` 생성 → 나머지(비용·세금·이체·미매칭 매입처)는 미매칭 잔존. 일부는 진짜 매입지급("다선정밀 외상매입-청주발송" 등).
3. 자동매칭 lookback **90일**(`src/routes/bank.ts:27` `MATCH_LOOKBACK_DAYS=90`) → 오늘 기준 2026-04-21 이전은 자동 재매칭 제외 → 선명 1~4월 미처리. 수동 auto-match(`POST /api/bank/transactions/auto-match`)는 `days` 파라미터로 override 가능(`bank.ts:1169`).

---

## 권장 조치 (결정 대기)

### 문제 ① — 매입 정본(SSOT) 통일 필요 [사용자 결정]
- **(권장) purchase_orders 기준**: 매입원장·미지급이 이미 여기 기반이고 246M 정확. 회계허브 매입탭을 PO 기반으로 맞추고 이월 187M 표시 방식 정리. invoice는 세금계산서 대사용으로 분리.
- **(대안) purchase_invoices 기준**: 지급 453M을 `invoice.paid_amount`에 반영 + 이월 별도 처리 + 매입원장을 invoice 기반 재배선.
- ⚠️ 어느 쪽이든 **한쪽 소스 중복 제거 or 명확 분리** 필요(현재는 두 화면이 서로 다른 수치).

### 문제 ② — 자금 매칭 완성
1. 미매칭 출금 114건 분류: 매입지급(→purchase_payment 생성·연결) vs 비용/세금/이체(→IGNORED or 비용카테고리).
2. 수동 auto-match `days` override로 1~6월 전체 재스캔.
3. 필요 시 `bank_match_rules`(CONTAINS) 학습으로 반복 거래처 자동화.

---

## 반영 완료 (2026-07-21)

매입원장 정본 = `품목마스터/원천주문데이터/거래처별 채무 선명_01.01~06.30.xlsx`(사용자 확인). 미매칭 자금 전량 분류·반영.

### 출금 112건 (SQL: `선명_매칭반영_2026-07-21.sql`, 롤백 동봉)
- 매입지급 4건 → `purchase_payments` 생성·통장연결. **미지급 246,187,780 → 212,896,022**
  - 호홍 13,095,291·경원GH 18,700 완전청산 / 운산 −20M / 케이엠 −177,767
- 비용 94건 → `matched_category_id` 분류(APPLIED) / 이체·카드·내부 14건 → IGNORED
- ⚠️ 43건은 entity-2에 없는 계정(세무·보안·공과·자본지출) → 기타(58), `match_reason`에 실제 성격 기록

### 입금 26건 (SQL: `선명_입금매칭반영_2026-07-21.sql`, 롤백 동봉)
- 수금 11건 → `payments` 생성·연결(29,573,255): 공감디자인(대전)·영기획·경기애드컴·대운애드빌·포인트광고(부여)·새물광고(신규3785)·광고기획팀(329)·수양광고(1353,2건)·애드스타·화신광고기획
- IGNORED 15건: 이체·가수금·기타수입 13 + 신경옥(공장임대인 전기세정산)·와우프레스(명함 매입처 선입금) 2
- ⚠️ 7월 주문 미입력분 있어 일부 거래처 미수금 일시 음수(정상, 주문 입력 시 상쇄)

### 잔여 4건 반영 (07-21 신규 동기화분, SQL: `선명_잔여4건반영_2026-07-21.sql`)
- 운산직물5월외상대 20M → purchase_payment(운산 미지급 44,635,010) / 김용준 10M×2 → 가수금 IGNORED / CNCITY전기 140,820 → 전기료
- **결과: 선명 통장 미매칭 0건. 미지급 총액 192,896,022.**

### 진단 ① 해결 — 옵션 A(purchase_orders 정본 유지) 채택 (SQL: `선명_매입인보이스_지급배분_2026-07-21.sql`, 롤백 동봉)
- 정본 = purchase_orders(발주) 기반 미지급(전 법인 공용 로직). 세금계산서(purchase_invoices)는 매입확정/부가세 대사용.
- 회계허브 매입탭 표시 보정: 거래처별 purchase_payments를 세금계산서에 **오래된 순 배분(이월 우선 차감)** → paid_amount/payment_status 채움. 코드/배포 없이 데이터로 해결(선명만).
- 결과: PAID 161·PARTIAL 3·UNPAID 77. 거래처별 세금계산서 미지급 = 매입원장 잔액 정확 일치(운산 44,635,010·서울경금속 21,686,665·호홍 0·엘이디포유 −53,900 등). 매입원장(발주)과 회계허브 매입탭(계산서) 수치 일치.
- ⚠️ 배분은 합성값(원 지급은 계산서별 연결 아님) — 거래처 단위로는 정확, 개별 계산서 지정은 근사. 동산기획(내부·이월 112.7M)은 계산서 아니라 법인간거래 탭에서 별도.
- ⚠️ 신규 지급 발생 시 재배분 필요(현재 스냅샷 기준). 향후 지급 등록이 paid_amount 자동 갱신하도록 하려면 별도 코드작업(미결).

## 매입원장 품목 노출 (2026-07-21 배포)

문제: 거래처 원장(매입)이 발주 총액 행만 표시, 품목별 매입내역 미노출("정리 안 됨"의 실체). 데이터(purchase_order_items 1,006라인)는 처음부터 존재.
조치: 매출 원장(ar-ledger) 품목 펼침 패턴을 매입 원장에 미러링.
- `src/routes/ledger/accounts-payable.ts` `/purchase-client/:clientId`: 발주별 `purchase_order_items` 조회(청크 50) → 각 발주 tx에 `items[]` 부착
- `src/scripts/ledger.js` `loadPurchaseClientLedger`: 발주 행 아래 품목 라인(품목명·수량×단가·금액·부가세) 렌더 + 공급가/VAT 표기
검증(prod, 법인2): 운산직물 발주 55건 전부 items, 339 품목라인, 잔액 44,635,010 일치. 커밋 `0f2d7454`, 스모크 102/102.

## 검증 쿼리 (재현용)
```sql
-- 매입 이중구조
SELECT 'PO' t, COUNT(*), SUM(final_amount) FROM purchase_orders WHERE entity_id=2 AND status NOT IN('DRAFT','CANCELLED')
UNION ALL SELECT 'INV', COUNT(*), SUM(total_amount) FROM purchase_invoices WHERE entity_id=2
UNION ALL SELECT 'PAY', COUNT(*), SUM(amount) FROM purchase_payments WHERE entity_id=2;
-- 자금 매칭
SELECT transaction_type, match_status, COUNT(*), SUM(amount) FROM bank_transactions WHERE entity_id=2 GROUP BY 1,2;
```
