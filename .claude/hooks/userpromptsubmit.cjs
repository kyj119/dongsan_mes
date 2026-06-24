// UserPromptSubmit — 설계/구조변경 요청 감지 시 추론·확인 리마인더.
const { readInput } = require('./_util.cjs');
const inp = readInput();
const msg = inp.prompt || '';
if (/설계|아키텍처|구조\s*변경|리팩토|refactor|redesign/i.test(msg)) {
  console.log('[HOOK] 설계 요청 감지 — 실행 전 추론→"이해한 바" 요약→사용자 확인 (CLAUDE.md 작업 원칙). 신규 기능·구조 변경 시 brainstorming 스킬 고려.');
}
process.exit(0);
