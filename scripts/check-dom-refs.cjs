#!/usr/bin/env node
/**
 * check-dom-refs.cjs — getElementById silent-fail 린트 (#3, review-checklist §12 자동화)
 *
 * CLAUDE.md 함정: ?raw import된 scripts/*.js의 getElementById('X') 대상 ID가
 * 페이지/레이아웃/스크립트 어디에도 정의(id="X")돼 있지 않으면 런타임 silent fail.
 * 이 린트는 "정적 리터럴" getElementById 호출 중 정의처가 전혀 없는 것을 보고한다.
 * (전수 null-가드 삽입은 4,500+ 호출·로직 파괴 위험으로 하지 않음. 이 교차검증으로 대체.)
 *
 * 사용:
 *   node scripts/check-dom-refs.cjs                  # src/scripts/*.js 전체
 *   node scripts/check-dom-refs.cjs src/scripts/a.js # 특정 파일
 *   node scripts/check-dom-refs.cjs --strict         # 미정의 발견 시 exit 1 (CI/review용)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const strict = process.argv.includes('--strict');
const fileArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// 1) 정의된 ID 수집 (모든 src/**/*.{ts,js}): id="X" / id='X' / .id='X' / setAttribute('id','X')
const defFiles = walk(SRC, ['.ts', '.js']);
const defined = new Set();
const RE_DEFS = [
  /\bid\s*=\s*\\?["']([A-Za-z0-9_\-:]+)\\?["']/g, // id="X" (이스케이프 \" 포함)
  /\.id\s*=\s*["']([A-Za-z0-9_\-:]+)["']/g,        // el.id = 'X'
  /setAttribute\(\s*["']id["']\s*,\s*["']([A-Za-z0-9_\-:]+)["']/g,
  /badgeId\s*:\s*["']([A-Za-z0-9_\-:]+)["']/g,     // MENU_ITEMS badgeId → id="${badgeId}"
];
for (const f of defFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const re of RE_DEFS) {
    let m;
    while ((m = re.exec(txt))) defined.add(m[1]);
  }
}

// 2) 검사 대상 파일의 정적 getElementById('X') 참조 수집
const targets = fileArgs.length
  ? fileArgs.map((a) => path.resolve(ROOT, a))
  : walk(path.join(SRC, 'scripts'), ['.js']);

const RE_GEBI = /getElementById\(\s*["']([A-Za-z0-9_\-:]+)["']\s*\)/g;
const missing = []; // {file, id, line}
for (const f of targets) {
  if (!fs.existsSync(f)) continue;
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = RE_GEBI.exec(txt))) {
    const id = m[1];
    if (!defined.has(id)) {
      const line = txt.slice(0, m.index).split('\n').length;
      // 정슬래시로 정규화 (OS 안정·훅 grep 호환)
      missing.push({ file: path.relative(ROOT, f).split(path.sep).join('/'), id, line });
    }
  }
}

if (missing.length === 0) {
  console.log(`[check-dom-refs] OK — 정적 getElementById 참조 전부 정의처 존재 (검사 ${targets.length}개 파일)`);
  process.exit(0);
}
console.log(`[check-dom-refs] 정의처 없는 getElementById ${missing.length}건 (silent-fail 의심):`);
for (const x of missing) console.log(`  ${x.file}:${x.line}  #${x.id}`);
console.log('\n참고: 동적 생성(createElement/innerHTML 후 주입)·외부 라이브러리 ID는 오탐일 수 있음. 실제 페이지 템플릿에 id가 있는지 확인.');
process.exit(strict ? 1 : 0);
