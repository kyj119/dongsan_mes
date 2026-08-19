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
console.log(`[hook-guard] 패턴 OK — 차단 ${BLOCK.length}건 · 통과 ${ALLOW.length}건`);

// === 해석 회귀 (2026-08-19 신설) ===
// 왜 필요했나: 훅 명령이 상대경로(`node .claude/hooks/…`)라 **셸 cwd 기준**으로 해석됐다.
// Bash 도구는 cwd 가 호출 간 유지되므로, 앞선 명령이 하위 디렉터리에 남아 있으면
// node 가 스크립트를 못 찾고 MODULE_NOT_FOUND 로 죽었다 — 그런데 그 실패가 non-blocking 이라
// **명령은 그대로 실행됐다.** 13.7일 표본에서 발동 979회 중 330회(33.7%)가 게이트 없이 나갔고,
// 그중 재귀 삭제 3건이 무방비로 통과했다. 패턴만 검증하고 **로딩을 검증하지 않아** 몇 달간 아무도 몰랐다.
// → 여기서는 settings.json 의 **실제 명령 문자열**을 읽어 돌린다(사본 금지 — 사본은 반드시 갈린다).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

const settings = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
const preGroup = ((settings.hooks || {}).PreToolUse || [])[0] || {};
const preCmd = ((preGroup.hooks || [])[0] || {}).command;
if (!preCmd) {
  console.error('[hook-guard] settings.json 에서 PreToolUse 훅 명령을 찾지 못함');
  process.exit(1);
}

// env 를 명시적으로 통제한다. 훅이 훅 안에서 돌 때(커밋 게이트)는 CLAUDE_PROJECT_DIR 이 상속되는데,
// Bash 도구에서 직접 돌릴 때는 비어 있다 — 그대로 두면 「프로젝트 밖」 케이스가 실행 경로에 따라
// 결과가 갈린다(실제로 이 테스트가 커밋을 막아 드러났다, 2026-08-19).
const runFrom = (cwd, command, projectDir) => {
  const env = { ...process.env };
  if (projectDir === null) delete env.CLAUDE_PROJECT_DIR;
  else if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  return spawnSync(preCmd, {
    shell: true, cwd, env, encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }),
  }).status;
};

// 실제로 실패했던 지점들 — 하위 디렉터리에서도 게이트가 살아야 한다.
const SUBDIRS = ['.', '.claude/skills', 'docs', 'src'].filter((d) => fs.existsSync(path.join(ROOT, d)));
const DANGER = "rm -rf dist";

let bad2 = 0;
for (const d of SUBDIRS) {
  const cwd = path.join(ROOT, d);
  if (runFrom(cwd, 'npm run build') !== 0) { bad2++; console.error(`  MISS  안전 명령이 막힘: cwd=${d}`); }
  if (runFrom(cwd, DANGER) !== 2) { bad2++; console.error(`  MISS  ★게이트 미작동(재귀 삭제 통과): cwd=${d}`); }
}

// 해석 경로 2개를 각각 격리해서 본다.
const TMP = require('os').tmpdir();
// ① CLAUDE_PROJECT_DIR 없음 + 프로젝트 밖 cwd = 찾을 길이 없다 → fail-closed(예전엔 조용히 통과).
if (runFrom(TMP, 'npm run build', null) !== 2) {
  bad2++; console.error('  MISS  프로젝트 밖 + env 없음에서 fail-closed 되지 않음');
}
// ② CLAUDE_PROJECT_DIR 있음 = cwd 가 어디든 게이트를 찾아야 한다(훅이 실제로 도는 조건).
if (runFrom(TMP, 'npm run build', ROOT) !== 0) {
  bad2++; console.error('  MISS  CLAUDE_PROJECT_DIR 이 있는데도 게이트를 못 찾음');
}

if (bad2) {
  console.error(`[hook-guard] 해석 회귀 ${bad2}건 실패 — 훅 명령은 cwd 비의존이어야 한다`);
  process.exit(1);
}
console.log(`[hook-guard] 해석 OK — 하위 ${SUBDIRS.length}곳 게이트 발동 + 프로젝트 밖 fail-closed`);
