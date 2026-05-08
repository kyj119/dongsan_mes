---
name: db-reset-seed
description: 로컬 D1 데이터베이스를 초기화하고 전체 마이그레이션 및 시드 데이터를 적용한다. 개발 중 스키마 변경 후 깨끗한 상태로 재시작할 때 사용. 파괴적 작업이므로 사용자 확인 필수.
disable-model-invocation: true
---

# DB 초기화 및 시딩

## 경고

이 작업은 **로컬 D1의 모든 데이터를 삭제**한다. 프로덕션 DB에는 영향 없음.

## 절차

### 1. 사용자 확인

실행 전 반드시 사용자에게 확인:
```
⚠️ 로컬 D1 데이터베이스가 완전히 초기화됩니다.
모든 로컬 데이터가 삭제됩니다. 계속하시겠습니까?
```

### 2. D1 상태 삭제

```bash
rm -rf C:/Users/user/dongsan_mes/.wrangler/state/v3/d1
```

### 3. 마이그레이션 적용

```bash
cd C:/Users/user/dongsan_mes && npm run db:migrate:local
```

모든 마이그레이션 (0001~최신)이 순서대로 적용됨.

### 4. 시드 데이터 실행

프로젝트 루트의 `seed*.sql` 파일을 **자동 탐지**하여 순서대로 실행한다.

```bash
cd C:/Users/user/dongsan_mes

# 자동 탐지: seed.sql을 먼저, 나머지 seed_*.sql을 이름순으로 실행
ls seed*.sql | sort
```

실행 순서 규칙:
1. `seed.sql` — 항상 첫 번째 (기본 시드, users, 설정)
2. `seed_*.sql` — 파일명 알파벳순 (외래키 의존성은 파일명 정렬에 의해 자연 해결)

각 파일을 순차 실행:
```bash
# 먼저 seed.sql
npx wrangler d1 execute webapp-production --local --file=./seed.sql

# 나머지 seed_*.sql 파일을 이름순으로
for f in $(ls seed_*.sql | sort); do
  echo "실행: $f"
  npx wrangler d1 execute webapp-production --local --file=./$f
done
```

새 시드 파일 추가 시 **이 스킬을 수정할 필요 없음** — 파일명만 `seed_<이름>.sql` 패턴을 따르면 자동 포함됨.

### 5. 검증

테이블별 데이터 카운트 확인:

```bash
npx wrangler d1 execute webapp-production --local --command="SELECT 'users' as tbl, COUNT(*) as cnt FROM users UNION ALL SELECT 'clients', COUNT(*) FROM clients UNION ALL SELECT 'items', COUNT(*) FROM items UNION ALL SELECT 'categories', COUNT(*) FROM categories;"
```

### 6. 서버 재시작 안내

```
✅ DB 초기화 완료
npm run dev:d1 로 서버를 재시작하세요.
```

## npm 스크립트 대안

이미 정의된 npm 스크립트로도 실행 가능:
- `npm run db:reset` — 초기화 + 기본 시드만
- `npm run db:reset:full` — 초기화 + 전체 시드

단, 이 스크립트들에 `seed_data.sql`과 `seed_new_items.sql`이 포함되어 있는지 확인 필요.

## 주의사항

- 프로덕션 DB에는 절대 이 절차를 실행하지 않음
- 시드 파일 실행 순서가 잘못되면 외래키 제약 위반 발생 가능
- 새 시드 파일은 `seed_<이름>.sql` 패턴으로 추가하면 자동 탐지됨
