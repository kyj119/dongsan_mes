#!/usr/bin/env node
/**
 * #430: 로컬 write 카나리
 *
 * post-deploy smoke(scripts/smoke.cjs)는 GET 102개 + 로그인 POST 1개뿐인 read-only 프로브라
 * write 경로(품목/주문 생성 등)의 스키마 회귀를 구조적으로 못 잡는다.
 * 실제로 0335(print_media/print_methods DROP)가 items INSERT를 전면 차단했는데도
 * SELECT가 멀쩡해 smoke green으로 prod에 배포된 사례가 있었다(#430).
 *
 * 이 카나리는 owner 권장해법: prod smoke는 read-only 유지하고, 로컬 D1에 마이그 적용 후
 * 품목 create→assert→delete 라운드트립을 빌드/CI 단계에서 돌려 write-path 회귀를 조기 탐지한다.
 * prod 무오염(로컬 D1만 사용).
 *
 * 사용: npm run canary:write   (사전: 로컬 D1 마이그레이션 적용 — db:migrate:local)
 */
const { spawnSync } = require('child_process')
const path = require('path')

const sqlFile = path.join(__dirname, 'canary', 'items-write-canary.sql')

// shell:true + 단일 명령문자열 — Windows(.cmd EINVAL)·Linux 모두 안전. 경로는 따옴표로 공백 대응.
const r = spawnSync(
  `npx wrangler d1 execute webapp-production --local --file "${sqlFile}"`,
  { stdio: 'inherit', shell: true }
)

if (r.error) {
  console.error('[write-canary] ❌ 실행 오류: ' + r.error.message)
  process.exit(1)
}
if (r.status !== 0) {
  console.error('\n[write-canary] ❌ write-path 회귀 감지 — items INSERT 불능.')
  console.error('  원인 후보: 마이그레이션 FK-drop(0335류) / 스키마 드리프트 → 핵심 테이블 write 차단.')
  console.error('  조치: 최근 migrations의 DROP/스키마 변경 점검. SELECT는 통과해도 write는 깨질 수 있음.')
  process.exit(1)
}

console.log('[write-canary] ✅ items write 정상 (로컬 D1 INSERT→assert→DELETE 라운드트립 통과)')
