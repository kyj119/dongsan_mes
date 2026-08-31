// UserPromptSubmit — ①압축 복구 스냅샷 주입 ②설계/구조변경 요청 시 추론·확인 리마인더.
// 이 훅의 stdout 은 **컨텍스트로 주입된다**(SessionStart 와 함께 둘뿐). PreCompact 가 여기에 의존한다.
const { ROOT, readInput } = require('./_util.cjs');
const fs = require('fs');
const path = require('path');
const inp = readInput();

// 0) 압축 복구 — PreCompact 가 남긴 스냅샷을 압축 후 첫 프롬프트에 1회 주입하고 소비(삭제)한다.
//    PreCompact 자신의 stdout 은 모델에 안 닿으므로, 되살릴 자리는 여기뿐이다.
const marker = path.join(ROOT, '.claude', '.precompact-state.json');
try {
  if (fs.existsSync(marker)) {
    const s = JSON.parse(fs.readFileSync(marker, 'utf8'));
    const out = [`[HOOK] 직전에 컨텍스트 압축(${s.trigger})이 있었습니다 — 압축 전 스냅샷:`];
    out.push(
      `  브랜치 ${s.branch || '?'} · 미커밋 ${s.uncommittedCount}건` +
        (s.uncommitted && s.uncommitted.length ? ` — ${s.uncommitted.join(' | ')}` : '')
    );
    if (s.recentCommits && s.recentCommits.length) out.push(`  최근 커밋: ${s.recentCommits.join(' / ')}`);
    if (s.backup) out.push(`  압축 전 대화 원본: ${s.backup} — 잘려나간 맥락이 필요하면 추측하지 말고 이 파일을 직접 읽을 것`);
    out.push('  ※ 진행 중이던 작업이 불확실하면 .claude/PROJECT_STATUS.md 를 먼저 확인. 세션 종료 시 memory/session-context.md 갱신(CLAUDE.md).');
    console.log(out.join('\n'));
    fs.unlinkSync(marker);
  }
} catch {}

// 1) 설계 요청 감지
const msg = inp.prompt || '';
if (/설계|아키텍처|구조\s*변경|리팩토|refactor|redesign/i.test(msg)) {
  console.log('[HOOK] 설계 요청 감지 — 실행 전 추론→"이해한 바" 요약→사용자 확인 (CLAUDE.md 작업 원칙). 신규 기능·구조 변경 시 brainstorming 스킬 고려.');
}
process.exit(0);
