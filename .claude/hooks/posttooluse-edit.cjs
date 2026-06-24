// PostToolUse (matcher: Edit|Write) — 라우트/마이그/JSX 리마인더 + JS문법 게이트 + DOM회귀 게이트 + 편집카운터.
// 원래 5~6개로 흩어진 훅을 단일 프로세스로 통합. file_path를 1회 파싱(원본 raw grep 오탐 제거).
const { ROOT, readInput } = require('./_util.cjs');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const inp = readInput();
let file = (inp.tool_input && inp.tool_input.file_path) || '';
file = file.replace(/\\/g, '/');
if (!file) process.exit(0);

const msgs = [];

// 라우트 → entity 리마인더
if (/src\/routes\/.*\.ts$/.test(file)) {
  msgs.push('[HOOK] 라우트 수정 — entity_id 테이블 SELECT에 entityFilter 적용 확인. 배포 전 `npm run audit:entity`. (목록/stats/count/badge 모두)');
}
// 마이그레이션 → migration-check 리마인더
if (/migrations\/.*\.sql$/.test(file)) {
  msgs.push('[HOOK] 마이그레이션 생성 — /migration-check: ①ALTER 대상 테이블 존재 ②NOT NULL엔 DEFAULT ③clients엔 entity_id 없음 ④users.name(≠display_name).');
}
// IA JSX 동기화
if (/IllustratorAutomat\/.*\.jsx$/i.test(file)) {
  msgs.push('[HOOK] JSX 수정 — /ia-automat sync로 source↔publish 동기화 필요.');
}

// JS 문법 게이트 (src/scripts/*.js) — silent-fail 방지, 실패 시 차단
if (/src\/scripts\/.*\.js$/.test(file)) {
  try {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file) // file_path는 절대경로 — ROOT와 join 시 중복됨
    execSync(`node --check "${abs}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error('[HOOK-FAIL] JS 문법 오류 (silent-fail 방지):\n' + ((e.stderr || e.stdout || e.message).toString().slice(0, 1500)));
    process.exit(2);
  }
}

// DOM 참조 회귀 게이트 (src/pages|scripts 의 .ts/.js)
if (/src\/(pages|scripts)\/.*\.(ts|js)$/.test(file)) {
  try {
    const out = execSync('node scripts/check-dom-refs.cjs', { cwd: ROOT, encoding: 'utf8' });
    const cnt = (out.match(/^ {2}src/gm) || []).length; // 슬래시 무관 (정/역 모두 "  src"로 시작)
    const bl = path.join(ROOT, '.claude', '.dom-baseline');
    let prev = NaN;
    try { prev = parseInt(fs.readFileSync(bl, 'utf8').trim(), 10); } catch {}
    if (isNaN(prev)) {
      fs.writeFileSync(bl, String(cnt));
    } else if (cnt > prev) {
      const lines = (out.match(/^ {2}src.*$/gm) || []).slice(0, 10).join('\n');
      console.error(`[HOOK-FAIL] check:dom 회귀 ${prev}->${cnt}건. 신규 getElementById silent-fail 의심:\n${lines}`);
      process.exit(2);
    } else {
      fs.writeFileSync(bl, String(cnt));
    }
  } catch {
    /* check-dom-refs 자체 오류 시 차단하지 않음 */
  }
}

// 편집 카운터 (개인 넛지) — 같은 파일 3회 수정 시 체크포인트 권장
try {
  const cf = path.join(ROOT, '.claude', '.edit_counter');
  fs.appendFileSync(cf, file + '\n');
  const n = fs.readFileSync(cf, 'utf8').split('\n').filter((x) => x === file).length;
  if (n === 3) msgs.push(`[HOOK] ${path.basename(file)} 3회 수정 — PROJECT_STATUS.md 체크포인트 기록 권장.`);
} catch {}

if (msgs.length) console.log(msgs.join('\n'));
process.exit(0);
