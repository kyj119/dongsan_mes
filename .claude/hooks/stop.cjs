// Stop — 미커밋 다수 시 세션종료 리마인더 + 편집카운터 정리 + transcript 과적 경고.
const { ROOT, readInput } = require('./_util.cjs');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const inp = readInput();

// 미커밋 변경 (노이즈 줄이려 임계 >5)
try {
  const changed = execSync('git status --short', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean).length;
  if (changed > 5) {
    console.log(`[HOOK] 미커밋 ${changed}건. 세션 종료 시: memory/session-context.md 기록 + /sync-docs (CLAUDE.md 규칙).`);
  }
} catch {}

// 편집 카운터 리셋
try { fs.unlinkSync(path.join(ROOT, '.claude', '.edit_counter')); } catch {}

// transcript 과적 경고 (>5MB)
const tp = inp.transcript_path;
if (tp) {
  try {
    const sz = fs.statSync(tp).size;
    if (sz > 5 * 1024 * 1024) {
      console.log(`[HOOK] 컨텍스트 과적(transcript ~${Math.floor(sz / 1048576)}MB, 임계 5MB). 마무리 후 session-context.md 기록하고 새 세션 전환 권장 (긴 세션=매 턴 감속).`);
    }
  } catch {}
}
process.exit(0);
