#!/usr/bin/env node
/**
 * `npm run db:migrate:prod` 차단 가드
 *
 * 왜 막나: prod 의 `d1_migrations` 추적은 0313 에서 멈춰 있는데 파일은 0529 까지 있다.
 *   `wrangler d1 migrations apply --remote` 는 **미추적 219개를 전부 재실행**한다 —
 *   그 안에는 DELETE 와 비멱등 INSERT 가 섞여 있어 데이터가 지워지거나 중복된다.
 *   게다가 추적 자체도 믿을 수 없다(0189 는 적용됨으로 기록돼 있으나 실제 컬럼은 없었다).
 *
 * 추적을 100% 맞추면 풀어도 되지만, 데이터 마이그는 후속 마이그가 같은 데이터를 다시 바꾸기
 * 때문에 사후 검증이 원리적으로 불안정하다 → 당분간 열지 않는다.
 */
console.error(`
❌ npm run db:migrate:prod 는 막혀 있다.

   wrangler d1 migrations apply --remote 는 d1_migrations 에 없는 219개를
   prod 에서 전부 재실행한다(DELETE·비멱등 INSERT 포함 → 데이터 삭제·중복).
   추적이 0313 에서 끊겨 있어서다. 추적 자체도 틀릴 수 있다(0189 전례).

[대신 이렇게]
   1) 스키마 상태 확인
        npm run audit:migration-drift
   2) 신규 마이그레이션 1개만 직접 적용 (-y 없으면 조용히 미적용된다)
        npx wrangler d1 execute webapp-production --remote --file=migrations/NNNN_*.sql -y
   3) 적용 후 재확인
        npm run audit:migration-drift

   로컬은 그대로 쓴다:  npm run db:migrate:local
`)
process.exit(1)
