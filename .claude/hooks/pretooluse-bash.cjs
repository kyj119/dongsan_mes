// PreToolUse (matcher: Bash|PowerShell) — 위험명령 차단 + 배포 리마인더 + 커밋 타입체크 게이트.
// jq 비의존. exit 2 = 차단(모델에 사유 전달). exit 0 = 통과(메시지는 stdout).
const { ROOT, readInput } = require('./_util.cjs');
const { execSync } = require('child_process');

const inp = readInput();
const cmd = (inp.tool_input && inp.tool_input.command) || '';
if (!cmd) process.exit(0);

// 1) 되돌리기 어려운 명령 = 하드 차단 (Bash + PowerShell). 마이그/일상 명령 오탐 회피하도록 타이트.
const HARD_BLOCK = [
  /\brm\s+-[a-z]*r/i, // 재귀 rm (-r/-rf/-fr) — 단일파일 rm -f는 허용
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bgit\s+branch\s+-D\b/i,
  // 브랜치 일괄 삭제 — 스크립트 경유도 동일 게이트(우회 방지).
  // 실행 형태(node …branch-cleanup / npm run branch:clean)만 매치 — 커밋 메시지 등 산문 오탐 방지.
  /(?:node\s+\S*branch-cleanup(?:\.cjs)?|branch:clean)[^\n]*--apply/i,
  /\bgit\s+checkout\s+--\s+\./i,
  /\bgit\s+restore\s+(--staged\s+)?\.(\s|$)/i,
  /\bgit\s+push\b.*--force(?!-with-lease)/i,
  /\bRemove-Item\b.*-Recurse/i,
];
for (const re of HARD_BLOCK) {
  if (re.test(cmd)) {
    console.error(`[BLOCK] 되돌리기 어려운 위험 명령 감지 (/${re.source}/). 사용자 확인 필요 — 의도적이면 다시 명시 요청.`);
    process.exit(2);
  }
}

// 2) 경고만 (local 한정·복구 가능) — 차단하지 않음
const WARN = [
  [/\bgit\s+reset\s+--hard/i, 'git reset --hard — 워킹트리 변경 소실. 의도 확인.'],
  [/--force-with-lease/i, 'force-with-lease push — 원격 덮어쓰기. 다른 세션 작업 확인.'],
  [/\bdb:reset\b/i, 'db:reset — 로컬 D1 초기화(prod 무관). 의도 확인.'],
];
const warns = WARN.filter(([re]) => re.test(cmd)).map(([, m]) => '[WARN] ' + m);
if (warns.length) console.log(warns.join('\n'));

// 3) 프로덕션 배포 리마인더
if (/deploy:prod|pages\s+deploy/i.test(cmd)) {
  console.log('[HOOK] 프로덕션 배포 감지 — deploy:prod는 --branch main 내장(apex 반영). 배포 후 smoke + Playwright 프로덕션 검증 필수.');
}

// 3-b) 품목 INSERT 감지 → 중복·규약 감사 리마인더
//   ★ 2026-08-08 에 하루 동안 같은 중복을 **네 번** 만들었다(SGM-TRBW-* · AQT-090 · BJP-* · 후판/스카시).
//     `audit:new-items` 는 그전부터 있었는데 **한 번도 안 돌렸다.** 도구가 없어서가 아니라
//     돌릴 자리가 없어서 난 사고라, 품목을 만드는 순간에 붙인다.
//   차단하지 않는다 — 이관 중엔 신설이 정상이고, 막으면 우회하게 된다. 상기시키기만 한다.
if (/INSERT\s+INTO\s+items\b/i.test(cmd) || /[\w-]*item[\w-]*\.sql/i.test(cmd)) {
  console.log(
    '[HOOK] 품목 신설 감지 — 적재 후 두 감사를 돌릴 것:\n' +
      '  npm run audit:new-items   (중복. R0 이름동일 = 신설 직후 원가 0 에서도 잡는다)\n' +
      '  npm run audit:items       (규격 규약 C·D 게이트 + 건강 지표)\n' +
      '  ※ 신설 전이라면 계열 접두를 열거해 형제를 먼저 볼 것 — 품명 LIKE 검색은 접두가 다르면 못 찾는다.'
  );
}

// 4) 커밋 전 타입체크 게이트 (실패 시 차단)
if (/(^|&&|;|\s)git(\s+-[cC]\s+\S+)*\s+commit/i.test(cmd)) {
  try {
    execSync('npx tsc --noEmit --incremental --tsBuildInfoFile .claude/.tsbuildinfo', {
      cwd: ROOT,
      stdio: 'pipe',
    });
    console.log('[HOOK] 타입체크 통과. /review-checklist 실행 여부 확인.');
  } catch (e) {
    const out = (e.stdout || '').toString() + (e.stderr || '').toString();
    console.error('[BLOCK] 타입 에러 발견 — 수정 후 커밋:\n' + out.slice(0, 2000));
    process.exit(2);
  }
}

process.exit(0);
