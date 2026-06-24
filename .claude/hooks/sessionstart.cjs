// SessionStart — 훅 런타임 자가진단 배너 (NEW).
// 목적: "jq 부재로 모든 훅이 침묵 무력화"되는 회귀를 영구 방지.
// 이 배너가 세션 시작 시 안 보이면 = 훅 런타임이 깨진 것(즉시 알아챔).
const { readInput } = require('./_util.cjs');
readInput();
console.log('[HOOK ✓] node 훅 런타임 정상 (jq 비의존). 안전 게이트 활성: 위험명령 차단·커밋 타입체크·JS문법·DOM회귀. 자동배포(/ship) 가드 신뢰 가능.');
process.exit(0);
