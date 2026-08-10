// SessionStart — 훅 런타임 자가진단 배너 (NEW).
// 목적: "jq 부재로 모든 훅이 침묵 무력화"되는 회귀를 영구 방지.
// 이 배너가 세션 시작 시 안 보이면 = 훅 런타임이 깨진 것(즉시 알아챔).
const { ROOT, readInput } = require('./_util.cjs');
readInput();
console.log('[HOOK ✓] node 훅 런타임 정상 (jq 비의존). 안전 게이트 활성: 위험명령 차단·커밋 타입체크·JS문법·DOM회귀. 자동배포(/ship) 가드 신뢰 가능.');
// 문서 다이어트 감시 — 현황판·메모리 인덱스가 한도를 넘으면 세션 시작 시 바로 보이게 (2026-08-10)
try {
  require('child_process').execSync('node scripts/doc-diet-audit.cjs', { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  console.log('[HOOK ⚠] 문서 비대화 — 완료(✅) 항목을 ARCHIVE 로 이관할 것:\n' + ((e.stderr || e.stdout || '').toString().slice(0, 800)));
}
process.exit(0);
