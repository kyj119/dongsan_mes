// PreCompact — 자동압축 직전 스냅샷. 이 프로젝트의 반복 결함(「압축 때 조용히 사라짐」)에 대한 방어.
//   SKILL.md 5,000토큰 절단·현황판 90K자와 같은 계열이다: 경고도 에러도 없이 지시가 없어진 채로 계속 돈다.
// ⚠️ 이 훅의 stdout 은 **디버그 로그로만** 간다 — 모델도 사용자도 못 본다(공식 문서 §stdout).
//    그래서 여기서는 「디스크에 남기기」만 하고, 되살리는 건 `userpromptsubmit.cjs` 가 한다
//    (컨텍스트로 주입되는 훅은 UserPromptSubmit·SessionStart 뿐).
// 압축을 절대 막지 않는다(exit 2 금지) — 스냅샷 실패가 세션을 세우면 배보다 배꼽이다.
const { ROOT, readInput } = require('./_util.cjs');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const inp = readInput();
const trigger = inp.trigger || 'unknown'; // 'auto' | 'manual'
const dir = path.join(ROOT, '.claude', 'compact-backups');
const KEEP = 5; // transcript 는 수~수십 MB. 최근 것만 남긴다.

function git(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

try {
  fs.mkdirSync(dir, { recursive: true });

  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-` +
    `${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;

  // 1) transcript 원본 백업 — 압축으로 잘려나간 내용을 되찾을 수 있는 유일한 사본
  let backup = '';
  if (inp.transcript_path && fs.existsSync(inp.transcript_path)) {
    backup = path.join(dir, `${stamp}-${trigger}.jsonl`);
    fs.copyFileSync(inp.transcript_path, backup);
  }

  // 2) 상태 스냅샷 — 압축 후 모델이 「추측하지 않고」 복구해야 하는 것들
  const uncommitted = git('git status --short').split('\n').filter(Boolean);
  const state = {
    at: d.toISOString(),
    trigger,
    backup: backup ? path.relative(ROOT, backup).split(path.sep).join('/') : null,
    branch: git('git rev-parse --abbrev-ref HEAD'),
    uncommittedCount: uncommitted.length,
    uncommitted: uncommitted.slice(0, 20), // 목록이 길면 잘라 쓴다 — 주입 비용도 비용이다
    recentCommits: git('git log -3 --oneline').split('\n').filter(Boolean),
  };
  fs.writeFileSync(
    path.join(ROOT, '.claude', '.precompact-state.json'),
    JSON.stringify(state, null, 2)
  );

  // 3) 오래된 백업 정리 (파일명이 시각 접두라 사전순 = 시간순)
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
    try { fs.unlinkSync(path.join(dir, f)); } catch {}
  }
} catch {
  // 침묵 통과 — 위 주석 참조.
}
process.exit(0);
