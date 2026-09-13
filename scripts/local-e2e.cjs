#!/usr/bin/env node
/**
 * local-e2e.cjs — 서버가 떠 있어야 도는 게이트 4종을 한 줄로 묶는다 (2026-09-14)
 *
 * 왜 있나
 *   `test:symmetry`·`test:ship-stock`·`test:autodeduct`·`test:print-match` 넷 다
 *   **어떤 실행 경로에도 안 물려 있었다** — 「게이트가 있다」와 「게이트가 돈다」는 다른 질문이고
 *   (CLAUDE.md §배포를 실제로 막는 게이트), 실제로 `test:print-match` 는 만들어진 뒤
 *   한 번도 안 돌아 **빨간 채로 4일** 있었다(2026-09-14 에 shipment_ready 미전파·card_number 소실
 *   두 결함을 그대로 품고 있었다). 넷을 묶어 `ship:gate` 의 `journey:gate` **뒤**에 세운다 —
 *   그 시점이면 사이클이 로컬 서버를 이미 띄워 두었다(`scripts/journey/cycle.cjs`).
 *
 * 건너뛰기
 *   `SKIP_JOURNEY=1` 하나로 journey 와 함께 건너뛴다(핫픽스용). 플래그를 새로 만들지 않는 이유 =
 *   둘 다 「로컬 서버가 필요한 게이트」라 사람이 끄는 이유도 하나다. **조용히 통과시키지 않고
 *   건너뛴 사실을 찍는다** — 격하를 성공으로 세면 그 게이트는 없는 것이다.
 */
const { execSync } = require('child_process')

if (process.env.SKIP_JOURNEY === '1') {
  console.log('[local-e2e] SKIPPED — SKIP_JOURNEY=1 (로컬 서버 게이트 일괄 건너뜀, 핫픽스용)')
  process.exit(0)
}

const GATES = ['test:symmetry', 'test:ship-stock', 'test:autodeduct', 'test:print-match']
for (const g of GATES) {
  process.stdout.write(`[local-e2e] ${g} ... `)
  try {
    execSync(`npm run ${g}`, { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' })
    console.log('통과')
  } catch (e) {
    console.log('실패')
    process.stdout.write(`${e.stdout || ''}${e.stderr || ''}`)
    console.error(`\n[local-e2e] ${g} 실패 — 서버(dev:d1)가 떠 있는지부터 확인할 것.`)
    process.exit(1)
  }
}
console.log('[local-e2e] 4/4 통과')
