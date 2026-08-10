// 문서 다이어트 게이트 — 현황판·메모리 인덱스 비대화 재발 방지 (2026-08-10 신설)
// 배경: PROJECT_STATUS.md 가 완료(✅) 장문 보고 누적으로 90K자(세션 시작마다 로드)까지 비대해진 사고.
//       2026-07-27 다이어트 후 2주 만에 재발 → 문구 규칙만으론 안 지켜져 게이트로 강제.
// 규칙: 완료(✅) 보고 = 현황판 「1줄 요약+남은 것」 + 상세 전문은 PROJECT_STATUS_ARCHIVE.md.
//       MEMORY.md = 1줄 훅 인덱스(경위 서술 금지) + 장문 원본은 memory/MEMORY-ARCHIVE.md.
// 연동: posttooluse-edit 훅(해당 파일 수정 직후 경고) · sessionstart 훅(세션 시작 배너) · 세션 종료 체크.
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const MEM_DIR = path.join(os.homedir(), '.claude', 'projects', 'C--Users-user-dongsan-mes', 'memory');

const TARGETS = [
  {
    file: path.join(ROOT, '.claude', 'PROJECT_STATUS.md'),
    label: '.claude/PROJECT_STATUS.md',
    maxTotal: 25000,
    maxLine: 3000,
    // 완료 항목(줄 머리 ✅)은 요약 1줄만 — 장문 경위는 ARCHIVE 로
    doneLine: { re: /^[\s>*-]{0,8}\*{0,2}✅/, max: 800, hint: '완료(✅) 항목 장문 — 상세는 PROJECT_STATUS_ARCHIVE.md 로 옮기고 「1줄 요약+남은 것」만 남길 것' },
    hint: '완료 항목을 .claude/PROJECT_STATUS_ARCHIVE.md 로 이관할 것 (2026-08-10 다이어트 규칙)',
  },
  {
    file: path.join(MEM_DIR, 'MEMORY.md'),
    label: 'memory/MEMORY.md',
    maxTotal: 15000,
    maxLine: 500,
    hint: '1줄 훅으로 압축하고 장문 원본은 memory/MEMORY-ARCHIVE.md 로 (개별 메모리 파일에 상세가 이미 있다)',
  },
];

let failed = false;
for (const t of TARGETS) {
  let raw;
  try { raw = fs.readFileSync(t.file, 'utf8'); } catch { continue; } // 없는 환경(다른 PC)에선 스킵
  const problems = [];
  if (raw.length > t.maxTotal) {
    problems.push(`총 ${raw.length.toLocaleString()}자 > 한도 ${t.maxTotal.toLocaleString()}자`);
  }
  const lines = raw.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (l.length > t.maxLine) problems.push(`L${i + 1} ${l.length.toLocaleString()}자 > 줄 한도 ${t.maxLine.toLocaleString()}자: ${l.slice(0, 60)}…`);
    else if (t.doneLine && t.doneLine.re.test(l) && l.length > t.doneLine.max) {
      problems.push(`L${i + 1} ${l.length.toLocaleString()}자 — ${t.doneLine.hint}: ${l.slice(0, 60)}…`);
    }
  });
  if (problems.length) {
    failed = true;
    console.error(`[doc-diet] ${t.label} 위반 ${problems.length}건 → ${t.hint}`);
    problems.slice(0, 8).forEach((p) => console.error('  - ' + p));
    if (problems.length > 8) console.error(`  … 외 ${problems.length - 8}건`);
  }
}

if (failed) process.exit(1);
console.log('[doc-diet] OK — 현황판·메모리 인덱스 한도 내');
