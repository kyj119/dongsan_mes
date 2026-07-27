---
name: db-reset-seed
description: 로컬 D1 데이터베이스를 스키마 베이스라인으로 초기화한다. 개발 중 스키마 변경 후 깨끗한 상태로 재시작할 때 사용. 파괴적 작업이므로 사용자 확인 필수.
disable-model-invocation: true
---

# 로컬 D1 초기화 (베이스라인 부트스트랩)

## 경고

**로컬 D1의 모든 데이터를 삭제**한다. 프로덕션 DB에는 영향 없음.

## ⛔ 절대 하지 말 것 — 마이그레이션 풀리플레이

```bash
# ❌ 신규/초기화된 로컬 D1에 이걸 쓰면 반드시 실패한다
npm run db:migrate:local
```

479개 마이그레이션 순차 적용은 **0344 부근에서 결정적으로 실패**한다.
원인은 카테고리 id 환경 분기(로컬 수성=14 vs prod=15)를 하드코딩한 마이그가 다수 있기 때문
(#555, 2026-07-27 해결). `db:migrate:local`은 **기존 누적 D1에 신규 마이그를 증분 적용할 때만** 쓴다.

## 절차

### 1. 사용자 확인

```
⚠️ 로컬 D1 데이터베이스가 완전히 초기화됩니다.
모든 로컬 데이터가 삭제됩니다. 계속하시겠습니까?
```

### 2. 부트스트랩 실행 (이 한 줄이 전부)

```bash
npm run db:reset
```

= `scripts/bootstrap-local-db.ps1`. 내부 절차:

| 단계 | 내용 |
|------|------|
| 1 | workerd 종료 + 로컬 D1 sqlite 파일 제거 (디렉터리 구조는 보존) |
| 2 | `schema/baseline_schema.sql` — prod 스키마 스냅샷(191테이블) |
| 3 | `schema/baseline_reference.sql` — prod 참조데이터(카탈로그/설정, PII·비밀 제외) |
| 4 | `schema/baseline_applied_migrations.sql` — 0001~0474 applied 마킹 |
| 5 | 로그인 유저 생성 |
| 6 | 미래 마이그(0475+) 증분 적용 |

참조데이터가 **prod의 실제 카테고리 id를 시드**하므로, 이후 하드코딩 category_id 마이그도 신규 환경에서 정합하게 돈다.

### 3. 검증

```bash
npx wrangler d1 execute webapp-production --local --command="SELECT 'users' tbl, COUNT(*) cnt FROM users UNION ALL SELECT 'clients', COUNT(*) FROM clients UNION ALL SELECT 'items', COUNT(*) FROM items;"
```

로그인 확인: `admin` / `password`

### 4. 서버 재시작

```
✅ DB 초기화 완료 — npm run dev:d1 로 재시작
```

## 시드 데이터가 추가로 필요할 때

베이스라인에는 **참조데이터만** 들어간다(거래처·품목 카탈로그·설정). 주문/생산 등 업무 더미데이터가 필요하면:

```bash
npm run db:seed       # seed/seed_users.sql + seed_data.sql
npm run db:seed:all   # 위 + seed_hr / seed_inventory / seed_production
```

- 시드 파일 위치는 **`seed/` 디렉토리**다(프로젝트 루트 아님 — 루트 `seed_*.sql`은 존재하지 않는다).
- 현재 `seed/`: `seed_users` · `seed_data` · `seed_hr` · `seed_inventory` · `seed_production` · `seed_new_items` · `seed_payroll` · `seed_payroll_demo` · `seed_test_employees` (9개)
- `db:seed`/`db:seed:all`은 그중 5개만 참조한다. 나머지는 필요 시 직접 실행.
- ⚠️ 시드는 베이스라인 참조데이터와 **중복 INSERT 충돌**을 낼 수 있다. 베이스라인만으로 개발이 되면 시드는 돌리지 않는 게 기본.

## 관련 npm 스크립트

| 스크립트 | 용도 |
|---|---|
| `db:reset` | **기본** — 베이스라인 부트스트랩 (= `db:bootstrap`) |
| `db:reset:full` | 부트스트랩 + 전체 시드 |
| `db:reset:replay` | 구 방식(마이그 풀리플레이) — **#555로 실패 확정, 사용 금지 · 이력 보존용** |
| `db:migrate:local` | 기존 누적 D1에 **신규 마이그만 증분** 적용 |

## 주의사항

- 프로덕션 DB에는 절대 실행하지 않는다.
- 새 마이그레이션을 만들었다면 초기화가 아니라 `db:migrate:local` 증분으로 충분한지 먼저 판단.
- 베이스라인 자체를 갱신해야 하는 상황(대규모 스키마 변경 누적)이면 `schema/baseline_*.sql` 재생성이 필요 — 사용자 확인 필수.

> 정본: [[project-db-bootstrap-squash]] · `scripts/bootstrap-local-db.ps1`
