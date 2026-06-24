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

module.exports = { ROOT, readInput };
