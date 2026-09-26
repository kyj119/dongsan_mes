// 공용 훅 유틸 (CommonJS). jq/bash 비의존 — Windows에서 견고.
// 모든 훅 스크립트가 stdin JSON을 이 헬퍼로 읽는다.
const path = require('path');

// .claude/hooks/_util.cjs -> 프로젝트 루트 (두 단계 위)
const ROOT = path.resolve(__dirname, '..', '..');

// stdin(JSON)을 동기 읽기. 실패 시 {} 반환 (절대 throw 안 함 → 훅이 침묵실패 대신 진행).
function readInput() {
  try {
    const fs = require('fs');
    const data = fs.readFileSync(0, 'utf8'); // fd 0 = stdin
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

// ── 검사 기준 폴더(2026-09-26, 리뷰 #75) ────────────────────────────────────────────────
// ROOT 는 **훅 파일이 있는 곳**(= CLAUDE_PROJECT_DIR 로 찾은 메인 체크아웃)이다. worktree 에서 편집·커밋해도
// 게이트가 메인 트리를 검사해, worktree 의 타입 오류·미정의 함수가 통과하고 메인의 남의 WIP 로 막히기도 했다.
// → 대상에서 실제 저장소를 구한다. 이 프로젝트 저장소가 아니면(검사 스크립트 없음) ROOT 로 되돌린다. 절대 throw 하지 않는다.
function projectTop(dir) {
  try {
    const fs = require('fs');
    const { execSync } = require('child_process');
    if (!dir || !fs.existsSync(dir)) return null;
    const top = execSync('git rev-parse --show-toplevel', { cwd: dir, stdio: 'pipe' }).toString().trim();
    if (!top) return null;
    const norm = path.resolve(top);
    return fs.existsSync(path.join(norm, 'scripts', 'check-fn-refs.cjs')) ? norm : null;
  } catch { return null; }
}
// Git Bash 경로(/c/Users/..)를 Windows 경로로
function winPath(p) {
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p || '');
  return m ? m[1].toUpperCase() + ':/' + m[2] : p;
}
/** 편집한 파일이 속한 저장소 */
function fileRoot(file) {
  if (!file) return null;
  return projectTop(path.dirname(path.resolve(winPath(String(file).replace(/\\/g, '/')))));
}
/** Bash/PowerShell 명령이 실제로 도는 저장소 — `cd X &&` · `git -C X` · 입력 cwd 순 */
function bashTargetRoot(inp, cmd) {
  const tries = [];
  const cd = /(?:^|&&|;|\|\|)\s*(?:cd|Set-Location|Push-Location)\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/i.exec(cmd || '');
  if (cd) tries.push(cd[1] || cd[2] || cd[3]);
  const gc = /\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i.exec(cmd || '');
  if (gc) tries.push(gc[1] || gc[2] || gc[3]);
  if (inp && inp.cwd) tries.push(inp.cwd);
  for (const t of tries) {
    const top = projectTop(winPath(String(t)));
    if (top) return top;
  }
  return null;
}

module.exports = { ROOT, readInput, fileRoot, bashTargetRoot, projectTop };
