// 위험명령 훅 회귀 테스트 (2026-08-11 신설). 패턴 정본 = `.claude/hooks/_danger-patterns.cjs` 를 **직접 require**
// (사본 금지 — 사본을 두면 테스트가 통과해도 훅은 다른 규칙으로 돈다).
//
// 왜 필요했나: checkout/restore 규칙이 서로 다르게 앵커돼 **오탐(`git checkout -- .claude/x` 차단)과
// 미탐(`git checkout .` 무방비)이 동시에** 있었는데, 훅에 테스트가 없어 몇 달간 아무도 몰랐다.
// 차단 규칙은 「막아야 할 것」만큼 **「막으면 안 되는 것」**도 명세해야 한다 — 아래 ALLOW 표가 그 명세다.
// 사용: node scripts/hook-guard-selftest.cjs   (실패 시 exit 1)
'use strict';
const { HARD_BLOCK } = require('../.claude/hooks/_danger-patterns.cjs');

const blocked = (cmd) => HARD_BLOCK.some((re) => re.test(cmd));

// 반드시 차단돼야 하는 것
const BLOCK = [
  ['rm -rf dist', '재귀 삭제'],
  ['rm -fr node_modules', '재귀 삭제(플래그 순서 무관)'],
  ['git clean -fd', '미추적 파일 일괄 삭제'],
  ['git branch -D feat/x', '브랜치 강제 삭제'],
  ['node scripts/branch-cleanup.cjs --apply', '브랜치 일괄 삭제(스크립트 경유)'],
  ['npm run branch:clean -- --apply', '브랜치 일괄 삭제(npm 경유)'],
  ['git checkout -- .', '워킹트리 전체 폐기'],
  ['git checkout .', '★`--` 없는 형태도 동일하게 파괴적(구 규칙 미탐)'],
  ['git checkout -- . && npm run build', '체이닝돼도 차단'],
  ['git checkout HEAD -- .', '중간 토큰이 끼어도 차단'],
  ['git restore .', '워킹트리 전체 폐기'],
  ['git restore --staged .', '전체 언스테이지'],
  ['git restore -- .', '★`--` 형태(구 규칙 미탐)'],
  ['git push origin main --force', '원격 강제 덮어쓰기'],
  ['Remove-Item -Recurse -Force dist', 'PowerShell 재귀 삭제'],
];

// 반드시 통과해야 하는 것 (오탐 명세)
const ALLOW = [
  ['git checkout -- .claude/skills/qa-audit/SKILL.md', '★단일 파일 원복 — 구 규칙이 차단하던 실제 오탐'],
  ['git checkout -- .github/workflows/deploy.yml', '점으로 시작하는 경로 일반'],
  ['git checkout -- src/routes/orders.ts', '경로 지정 원복'],
  ['git restore .claude/settings.json', '점으로 시작하는 경로 원복'],
  ['git restore src/pages/orders.ts', '경로 지정 원복'],
  ['git checkout main', '브랜치 전환'],
  ['git checkout -b feat/skills-audit', '브랜치 생성'],
  ['git checkout main && git pull', '브랜치 전환 체이닝'],
  ['git checkout -- .claude/x && ls', '경로 원복 + 체이닝'],
  ['git checkout -- "src/a b.ts"', '공백 포함 경로'],
  ['rm -f dist/tmp.js', '단일 파일 삭제는 허용(기존 정책)'],
  ['git push origin main --force-with-lease', 'lease 있는 push 는 경고만'],
  ['git commit -m "fix: restore . handling"', '산문(커밋 메시지) 오탐 방지'],
  ['npm run branch:clean -- --check', '--apply 없는 점검 모드'],
];

let bad = 0;
for (const [cmd, why] of BLOCK) {
  if (!blocked(cmd)) { bad++; console.error(`  MISS  차단됐어야 함: ${cmd}   (${why})`); }
}
for (const [cmd, why] of ALLOW) {
  if (blocked(cmd)) { bad++; console.error(`  FALSE 통과했어야 함: ${cmd}   (${why})`); }
}

if (bad) {
  console.error(`[hook-guard] ${bad}건 실패 — 패턴 수정 시 「막으면 안 되는 것」도 함께 볼 것`);
  process.exit(1);
}
console.log(`[hook-guard] OK — 차단 ${BLOCK.length}건 · 통과 ${ALLOW.length}건`);
