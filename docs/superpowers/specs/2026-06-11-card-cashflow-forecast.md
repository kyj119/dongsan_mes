# 법인카드 자금 예측 — 자금 일원화 후속 백로그

- **작성일**: 2026-06-11
- **상태**: ✅ **설계 확정 (2026-06-11 용준님 결정)** — D1=가(일시불 가정, 1차) · D2=가(실적+AVG_3M 혼합) · D3=가(기존 OUT 흐름에 CARD_EXPECTED). 구현 착수 가능
- **추가 확인(2026-06-11)**: `cutoff_day`·`payment_day`는 카드 CRUD API가 이미 사용 중(`cardExpenses.ts:63-88`, DEFAULT 15) — 스키마·UI 완비. `card_transactions.installments`도 기존재(0231)·기록 중이라 **할부 반영(D1-나)은 2차에 로직만 추가하면 됨**
- **관련**: PROJECT_STATUS TODO ⑥, `memory/project-cashflow-unification.md`, cashflowEngine
- **목표**: 법인카드 청구 예정액을 cashflowEngine OUT 흐름에 합성 — 자금 예측 마지막 갭

---

## 1. 배경 / 전제 정정

> ⚠️ **PROJECT_STATUS의 "corporate_cards에 cutoff_day/payment_day 추가 후" 전제는 stale.**
> - `cutoff_day`: **이미 존재** (마이그 `0273_card_cutoff_day.sql`, 2026-05-29 세션)
> - `payment_day`: 마이그 `0241` 주석상 "이전 세션에서 수동 적용됨" — **prod PRAGMA 확인 필요** (착수 시 1순위, 없으면 마이그 1건 추가)
>
> 즉 스키마는 사실상 준비됨 → 본 작업은 **예측 로직 + 엔진 합성**이 본체.

### 기존 인프라
- `cashflowEngine.ts` 하이브리드 엔진(물질화 + 온더플라이 합성) — ORDER_EXPECTED 합성 선례(4-3, 커밋 `607b3e4`)가 그대로 참고 패턴
- `card_transactions` 거래 데이터 + 복합 인덱스(마이그 0304, API 45–72ms)
- 캐시플로 결제예정 배지(0273 세션에서 cutoff_day 기반 일부 구현)

---

## 2. 예측 모델

```
카드별 청구 예정액(월) =
  Σ card_transactions [직전 cutoff_day+1일 ~ 당월 cutoff_day]
  → payment_day에 OUT(CARD_EXPECTED) 합성
```

- 청구 확정 전 구간(마감 전)은 **진행분 + 전월 동기간 평균** 혼합 추정
- 이미 확정·기록된 지급(cash_schedule 수동 입력 등)과 **이중계산 방지** — ORDER_EXPECTED의 balance cap 패턴 재사용

## 3. 결정 포인트 (용준님)

### D1. 할부·이월 처리
- **가 (권고)**: 1차 버전은 일시불 가정(전액 당월 청구) — 할부 거래 비중 확인 후 필요 시 2차
- 나: card_transactions에 할부 개월 컬럼 추가(스키마+입력 UI 수반) — 공수 ↑

### D2. 마감 전 미확정 구간 추정 방식
- **가 (권고)**: 진행분 실적 + 잔여일 × 최근 3개월 일평균 (expenseEstimator AVG_3M 패턴 재사용)
- 나: 진행분만 (보수적, 과소 추정)
- 다: 전월 동월 패턴 (SAME_MONTH_LAST_YEAR — 계절성 있을 때)

### D3. 표시 위치
- **가 (권고)**: 자금 허브 5탭 내 기존 OUT 흐름에 CARD_EXPECTED 타입 추가 (UI 신규 최소)
- 나: 카드 전용 예측 탭 신설

## 4. 구현 계획 (결정 후 1세션)

1. prod PRAGMA로 `payment_day` 존재 확인 → 없으면 마이그(NOT NULL 회피, DEFAULT 15)
2. 카드별 cutoff/payment_day 미설정 행 처리: 기본값 + `/settings` 카드 관리에서 편집 (기존 UI 확장)
3. `cashflowEngine.ts` ④번 합성 패턴 복제 → ⑤ CARD_EXPECTED (entity별 — `cardEntityFilter` 정합 유지)
4. 이중계산 가드: cash_schedule에 동일 카드·동월 수동 OUT 존재 시 합성 skip 또는 차액만
5. monthly/forecast 응답에 타입 노출 + 프론트 범례 추가

## 5. 검증
- 로컬: 더미 거래 3개월 주입 → 월별 청구액 수기 계산 대조
- prod: 실카드 1개 직전 청구서 금액 vs 엔진 산출 비교 (오차 원인 = 할부/취소 분류)
- `npm run verify` + smoke (cashFlow 라우트)

## 6. 공수
구현 1세션 + prod 대조 0.5h. 마이그 0~1건.
