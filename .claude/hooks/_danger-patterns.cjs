// 위험명령 패턴 정본 (2026-08-11 분리). `pretooluse-bash.cjs` 와 `scripts/hook-guard-selftest.cjs` 가
// **같은 배열**을 쓴다 — 훅에 인라인으로 두면 테스트가 사본을 갖게 되고, 사본은 반드시 갈린다.
//
// ★분리하게 된 사고(2026-08-11): checkout/restore 두 형제 규칙이 **같은 의도를 다르게 표현**하고 있었다.
//   restore 는 `\.(\s|$)` 로 앵커돼 `git restore .claude/x` 가 통과했는데, checkout 은 `\.` 뿐이라
//   `git checkout -- .claude/skills/x/SKILL.md`(단일 파일 원복)까지 "트리 전체 폐기"로 차단했다.
//   같은 비대칭이 **구멍**도 만들었다 — `git checkout .`(`--` 없음)·`git restore -- .` 는 똑같이 파괴적인데
//   어느 규칙에도 안 걸렸다. 즉 오탐과 미탐이 한 원인에서 나왔다: 규칙을 **문자열 모양**으로 적었기 때문.
//   → 이제 「pathspec 이 트리 전체 토큰(`.` `./` `*` `:/`)인가」로 적는다. 회귀 = `npm run test:hookguard`.
'use strict';

// pathspec 이 「트리 전체」일 때만 매치. 앞의 `(?:\S+\s+)*?` 는 `--`·`--staged`·`HEAD` 같은 중간 토큰을
// 건너뛰되, **마지막 토큰은 뒤에 공백이 없어 소비될 수 없으므로** `.claude/x` 같은 경로는 절대 매치되지 않는다.
const WHOLE_TREE_DISCARD = /\bgit\s+(?:checkout|restore)\s+(?:\S+\s+)*?(?:\.|\.\/|\*|:\/)(?=\s|$|;|&|\|)/i;

// 되돌리기 어려운 명령 = 하드 차단 (Bash + PowerShell). 마이그/일상 명령 오탐 회피하도록 타이트.
const HARD_BLOCK = [
  /\brm\s+-[a-z]*r/i, // 재귀 rm (-r/-rf/-fr) — 단일파일 rm -f는 허용
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bgit\s+branch\s+-D\b/i,
  // 브랜치 일괄 삭제 — 스크립트 경유도 동일 게이트(우회 방지).
  // 실행 형태(node …branch-cleanup / npm run branch:clean)만 매치 — 커밋 메시지 등 산문 오탐 방지.
  /(?:node\s+\S*branch-cleanup(?:\.cjs)?|branch:clean)[^\n]*--apply/i,
  WHOLE_TREE_DISCARD,
  /\bgit\s+push\b.*--force(?!-with-lease)/i,
  /\bRemove-Item\b.*-Recurse/i,
];

// 경고만 (local 한정·복구 가능) — 차단하지 않음
const WARN = [
  [/\bgit\s+reset\s+--hard/i, 'git reset --hard — 워킹트리 변경 소실. 의도 확인.'],
  [/--force-with-lease/i, 'force-with-lease push — 원격 덮어쓰기. 다른 세션 작업 확인.'],
  [/\bdb:reset\b/i, 'db:reset — 로컬 D1 초기화(prod 무관). 의도 확인.'],
  // 경로 지정 원복은 허용하되(단일파일 rm -f 허용과 같은 선), 조용히 지나가지는 않게 한다.
  [/\bgit\s+(?:restore|checkout\s+(?:\S+\s+)*?--)\s+\S/i, '경로 지정 원복 — 그 경로의 미커밋 변경은 사라진다. 대상 확인.'],
];

module.exports = { HARD_BLOCK, WARN, WHOLE_TREE_DISCARD };
