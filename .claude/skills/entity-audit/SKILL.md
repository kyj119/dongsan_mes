# Entity 필터 자동 감사

routes/*.ts 파일의 SELECT 쿼리에서 entity_id가 있는 테이블을 사용하면서 entityFilter를 적용하지 않은 누락 건을 자동 감지한다.

TRIGGERS: routes 파일 수정 후, 배포 전, "entity 감사", "entity audit", "필터 검사"

## entity_id가 있는 테이블 목록
- bank_transactions
- bank_accounts
- bank_match_rules
- card_fee_rates
- corporate_cards
- card_transactions
- expense_categories
- expense_auto_rules

## 검사 방법

1. `src/routes/*.ts` 파일에서 위 테이블을 참조하는 SELECT 쿼리를 모두 찾는다
2. 각 쿼리 주변에 `entityFilter` 호출이 있는지 확인한다
3. 다음은 예외로 허용한다:
   - ID로 단건 조회하는 경우 (WHERE id = ?)
   - INSERT/UPDATE/DELETE 문의 서브쿼리
   - 이미 entity_id가 JOIN 조건에 포함된 경우
   - **orphan 라우터** — 격리 갭을 보안 이슈로 보고하기 전, 해당 라우터가 프론트에서 호출되는지 `grep -rn "api/<path>" src/scripts src/pages`로 도달성 확인. 호출처 0건이면 dead code(보안 무관)로 분류. index.tsx의 `app.route()` 마운트만으로 "사용 중" 단정 금지 (#334 order_templates)

## 검사 실행

```
Grep으로 각 테이블명이 포함된 SELECT 문을 찾고,
해당 라우트 핸들러 내에서 entityFilter 호출 여부를 확인한다.
```

## 결과 보고

```
Entity 필터 감사 결과
━━━━━━━━━━━━━━━━━━━━
검사 파일: N개
검사 쿼리: N개
누락 건수: N개 (또는 "모두 통과")

[누락 목록]
- routes/bank.ts:123 — bank_transactions SELECT에 entityFilter 없음
- routes/cardExpenses.ts:456 — card_transactions SELECT에 entityFilter 없음
```

누락 건이 있으면 수정 코드도 함께 제안한다.
