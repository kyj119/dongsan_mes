# 재무·자금 일회성 진단 가이드 (2026-08-10)

> **왜 페이지가 아니라 이 방식인가** — `/reports` 재무보고와 `/cash-schedule` 은 지금 숫자를 믿으면 안 된다(§아래 결함).
> 페이지를 고쳐 상시 지표로 만드는 대신, **필요할 때 정확한 정의로 뽑아 Claude 와 함께 깊게 파는** 방식을 택했다
> (용준님 결정 2026-08-10). 상시 지표는 틀리면 조용히 오래 틀리지만, 일회성 진단은 매번 정의를 눈으로 확인하고 들어간다.

## 쓰는 법

```powershell
npm run diagnose:finance                                  # 동산기획(e1) · 올해 · 표
node scripts/finance-diagnose.cjs --entity 2              # 선명
node scripts/finance-diagnose.cjs --from 2026-01-01 --to 2026-06-30
node scripts/finance-diagnose.cjs --json                  # Claude 가 이어받아 분석할 때
node scripts/finance-diagnose.cjs --local                 # 로컬 D1
```

**읽기 전용이다.** SELECT 만 실행하므로 아무 때나 돌려도 안전하다.

출력 = 스냅샷 / 손익 / 자금예정 / **데이터 건강도** / **이관 편중** / **내부거래 대사**.
뒤 셋은 숫자가 아니라 **그 숫자를 어디까지 믿어도 되는지**를 말한다 — 먼저 보고 앞을 읽는다.

## 정의 (여기가 정본)

| 항목 | 정의 | 함정 |
|---|---|---|
| 예금·마이너스통장 | 계좌별 최신 `bank_transactions.balance_after` · `is_overdraft` 로 분리 | 합치면 예금이 과소로 보인다(실제 −4.96억 마통 1개) |
| 대출 | `loans.current_balance` (is_active) | `original_amount` 16/17건이 **계약원금이 아니라 등록시점 잔액** → 진행률 무의미 |
| **미수금(AR)** | 청구그룹 BILLED − 수금 − 조정 · **내부 3사(53·1271·3757) + 현금소매 더미 제외** | 내부법인을 안 빼면 1.2억 부풀어 보인다 |
| **미지급금(AP)** | 발주 final(DRAFT/CANCELLED 제외) − 지급 − 조정 · 같은 제외 | 〃 (0.81억) |
| 매출 | 청구그룹 BILLED · `COALESCE(accounting_date, billed_at)` 기준 | — |
| **매입** | 발주 final · **`order_date` 기준** · `*-OPEN*` 제외 | ★`created_at` 은 **이관 실행 시각**이다 |
| 인건비 | `payroll.net_pay` · `pay_date` 기준 | 테이블명이 `payroll` 이다(`payroll_slips` 아님) |
| 카드사용 | `card_transactions` · `is_offset=0` | 승인↔취소 상계분 제외 |
| 고정비 | `fixed_expenses` MONTHLY 활성 월액 × 개월수 | 법인별로 뽑아야 한다 |
| **매출원가** | **산정하지 않는다** | 주문별 원가 테이블이 없다 → 아래 참조 |

## ★ 페이지 쪽 결함 (이 도구가 우회하는 것들)

`src/routes/financialReports.ts` 실측(2026-08-10):

1. **`FROM order_costs` (:57) — 테이블이 없다.** `.catch` 로 **조용히 0**.
   실재하는 건 `cost_snapshots`·`cost_standards` 다. ⇒ 매출총이익 = 매출액, 매출총이익률 100%.
2. **`FROM payroll_slips` (:88) — 테이블이 없다.** 실재는 `payroll`. `.catch` 로 **인건비 0**.
3. **매입 집계가 `date(created_at)` (:71).** 이관 발주의 `created_at` 은 이관을 돌린 시각이다.
   실측: **2026-08 매입이 `created_at` 기준 6.58억 vs `order_date` 기준 276만.**
4. **매입·고정비 집계에 `entityFilter` 가 없다** — 3법인이 합산된다(매출에는 있다 = 비대칭).

⇒ 영업이익 = 매출 − (경비 0 + 인건비 0 + 3법인 고정비). **구조적으로 과대**하다.
**#71 회계반영 잠복장애와 같은 유형**(없는 컬럼/테이블 참조 + 조용한 폴백)이다.

`src/routes/cashSchedule.ts`:

5. **발주 지급예정 기준일 = `po.delivery_date || po.created_at` (:368).**
   `delivery_date` 는 **907건 전부 NULL**, `expected_date` 도 **전부 NULL** →
   실제로는 **「이관한 날 + 결제조건」이 지급예정일**이 된다. `order_date` 가 있는데 안 쓴다.
6. `cash_schedule` 물질화가 e1 15건 / e2 748건 / **e3 0건** — 사실상 미가동.

## 지금 답할 수 있는 것 / 없는 것

| 질문 | 가능? |
|---|---|
| 현재 순자금·순채권은? | **가능** (이번 세션 대사로 실측 신뢰도 확보) |
| 거래처별 미수·미지급은? | **가능** |
| 월별 매입 추이는? | **가능**(order_date 기준) |
| 월별 매출총이익률은? | **불가** — 주문별 원가가 없다 |
| 다음 달 자금 부족分은? | **부분** — 대출·고정비·카드는 되고, **매입 지급예정일이 없다** |
| 청주(e3) 자금은? | **불가** — 통장 미연동·고정비 0건 |

## 더 깊게 팔 때 (Claude 와 함께)

`--json` 으로 뽑아 넘기고, 필요하면 원본 쿼리를 스크립트에서 골라 변형한다. 자주 쓰는 축:

- **거래처별 채권 노령화** — 청구일 기준 30/60/90일 구간
- **세무장부 대조** — SmartA 원장은 캔버스라 화면으로 훑으면 놓친다 → [[reference-smarta-grid-read]]
- **매입 계정별 성격** — 153 원재료·533 외주가공비는 매입, **530 소모품비·520 수선비는 경비**(§8-Z-16)
- **법인간거래** — 내부 3사는 항상 **양쪽**을 함께 본다. 한쪽만 고치면 거울이 깨진다(§8-Z-31)

## 고칠 거면 (P1)

페이지를 살리기로 방침이 바뀌면 이 순서다. 전부 코드 1~2줄이고 배포가 필요하다.

1. `financialReports.ts:71` `date(created_at)` → `date(order_date)` + entityFilter 추가
2. 고정비 집계에 entityFilter 추가
3. `payroll_slips` → `payroll`
4. `order_costs` 참조 정리 — **원가가 0이면 조용히 넘기지 말고 「원가 미산정」으로 표시**
5. `cashSchedule.ts:368` 기준일에 `order_date` 우선 반영

> 4번이 핵심이다. 지금 구조는 **데이터가 없다는 사실 자체를 숨긴다** — 그래서 오래 안 드러났다.
