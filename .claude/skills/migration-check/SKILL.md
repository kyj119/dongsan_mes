# 마이그레이션 검증

새 마이그레이션 파일 생성 시 자동으로 프로덕션 스키마와 대조하여 안전성을 검증한다.

TRIGGERS: migrations/ 파일 생성/수정, "마이그레이션 검증", "migration check"

## 검증 항목

### 1. ALTER TABLE 안전성
- 대상 테이블이 프로덕션에 존재하는지 확인
  ```bash
  npx wrangler d1 execute webapp-production --remote --command="PRAGMA table_info(테이블명)"
  ```
- ADD COLUMN 시 기존 컬럼과 이름 충돌 여부
- NOT NULL 추가 시 DEFAULT 값이 있는지

### 2. 라우트 코드 정합성
- 마이그레이션에서 추가하는 컬럼이 routes/*.ts에서 참조되는지
- 참조 시 entityFilter가 적용되었는지 (/entity-audit 연동)
- 존재하지 않는 컬럼을 참조하는 쿼리가 없는지

### 3. 인덱스 / 제약조건
- UNIQUE 제약조건 추가 시 기존 데이터 충돌 가능성 경고
- FK 참조 테이블 존재 여부

### 4. clients 테이블 주의사항
- **clients 테이블에는 entity_id가 없음** — entityFilter 사용 금지
- users 테이블의 이름 컬럼은 `name` (display_name 아님)

## 결과 보고

```
마이그레이션 검증 결과
━━━━━━━━━━━━━━━━━━━━━
파일: migrations/0241_xxx.sql
대상 테이블: N개
━━━━━━━━━━━━━━━━━━━━━
[안전] ALTER TABLE corporate_cards ADD COLUMN payment_day — 충돌 없음
[주의] ALTER TABLE card_transactions ADD COLUMN approval_type — DEFAULT 설정 확인 필요
[위험] ALTER TABLE xxx ADD COLUMN NOT NULL — DEFAULT 없이 NOT NULL 추가
━━━━━━━━━━━━━━━━━━━━━
판정: 안전 / 주의 / 위험
```
