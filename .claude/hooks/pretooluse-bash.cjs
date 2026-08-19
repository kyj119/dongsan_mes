// PreToolUse (matcher: Bash|PowerShell) — 위험명령 차단 + 배포 리마인더 + 커밋 타입체크 게이트.
// jq 비의존. exit 2 = 차단(모델에 사유 전달). exit 0 = 통과(메시지는 stdout).
const { ROOT, readInput } = require('./_util.cjs');
const { HARD_BLOCK, WARN } = require('./_danger-patterns.cjs'); // 정본 = 그 파일. 여기에 사본 두지 말 것.
const { execSync } = require('child_process');

const inp = readInput();
const cmd = (inp.tool_input && inp.tool_input.command) || '';
if (!cmd) process.exit(0);

// 1) 되돌리기 어려운 명령 = 하드 차단 (Bash + PowerShell). 패턴 정본 = `_danger-patterns.cjs`.
for (const re of HARD_BLOCK) {
  if (re.test(cmd)) {
    console.error(`[BLOCK] 되돌리기 어려운 위험 명령 감지 (/${re.source}/). 사용자 확인 필요 — 의도적이면 다시 명시 요청.`);
    process.exit(2);
  }
}

// 2) 경고만 (local 한정·복구 가능) — 차단하지 않음
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

  // 5) 스킬·서브에이전트 정의가 변경된 커밋만 skill-audit 하드게이트 (2026-08-11)
  //    왜 여기인가: `.claude/skills/**` 는 **배포 산출물이 아니다**(dist/ 에 들어가지 않는다) →
  //    ship:gate 에 넣으면 prod 를 깨뜨릴 수 없는 결함으로 배포를 막는 가짜 게이트가 된다.
  //    스킬 결함이 실제로 퍼지는 경로는 배포가 아니라 **커밋→main→다른 세션·auto-improve 봇**이다.
  //    편집 훅(posttooluse-edit)은 경고만이라 무시하고 커밋하면 그대로 나간다 — 그 지점만 막는다.
  // 6) 훅 자신이 변경된 커밋만 위험명령 패턴 회귀 테스트 (2026-08-11)
  //    차단 규칙은 「막아야 할 것」만큼 「막으면 안 되는 것」도 명세돼야 한다 — 그 명세가 selftest 다.
  let dirty = '';
  try { dirty = execSync('git status --porcelain', { cwd: ROOT, stdio: 'pipe' }).toString(); } catch { /* git 미가용 = 게이트 생략 */ }

  const gates = [
    [/\.claude\/(skills\/.*\/SKILL\.md|agents\/.*\.md)/, 'node scripts/skill-audit.cjs',
      '스킬 정의 P1 — 본문은 목차·분기만, 누적 지식은 references/ 로'],
    [/\.claude\/(hooks\/|settings\.json)/, 'node scripts/hook-guard-selftest.cjs',
      '위험명령 패턴 + 훅 해석 회귀 — 오탐과 「게이트 자체가 안 도는」 경우까지'],
    // 현황판 비대화 (2026-08-19) — 편집 훅은 경고뿐이라 무시하고 커밋하면 그대로 나간다.
    //   그 결과 「✅ 최근 완료 인덱스」 섹션이 16,412자(현황판의 64%)까지 자랐다 — 그 지점만 막는다.
    [/\.claude\/PROJECT_STATUS\.md/, 'node scripts/doc-diet-audit.cjs',
      '현황판 비대화 — 경위는 PROJECT_STATUS_ARCHIVE.md 로, 인덱스 항목은 400자 이내'],
  ];
  for (const [scope, run, why] of gates) {
    if (!scope.test(dirty)) continue;
    try {
      execSync(run, { cwd: ROOT, stdio: 'pipe' });
    } catch (e) {
      const out = ((e.stderr || '').toString() + (e.stdout || '').toString());
      console.error(`[BLOCK] ${why}:\n` + out.slice(0, 1500));
      process.exit(2);
    }
  }
}

process.exit(0);
