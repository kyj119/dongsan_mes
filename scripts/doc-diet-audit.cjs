// 문서 다이어트 게이트 — 현황판·메모리 인덱스 비대화 재발 방지 (2026-08-10 신설)
// 배경: PROJECT_STATUS.md 가 완료(✅) 장문 보고 누적으로 90K자(세션 시작마다 로드)까지 비대해진 사고.
//       2026-07-27 다이어트 후 2주 만에 재발 → 문구 규칙만으론 안 지켜져 게이트로 강제.
// 규칙: 완료(✅) 보고 = 현황판 「1줄 요약+남은 것」 + 상세 전문은 PROJECT_STATUS_ARCHIVE.md.
//       MEMORY.md = 1줄 훅 인덱스(경위 서술 금지) + 장문 원본은 memory/MEMORY-ARCHIVE.md.
// 연동: posttooluse-edit 훅(해당 파일 수정 직후 경고) · sessionstart 훅(세션 시작 배너) · 세션 종료 체크.
//
// ★2026-08-19 개편 — 총량만 보던 게이트가 「최신 기록자를 처벌」하고 있었다.
//   증상: 파일이 꽉 찬 뒤에야 울리고, 통과시키는 가장 싼 방법이 **방금 쓴 항목을 깎는 것**이었다.
//   그래서 새 항목만 계속 짧아지고 오래된 덩어리(2,893자짜리 한 줄 등)는 영원히 남았다.
//   실측: 「✅ 최근 완료 — 후속 대기 인덱스」 섹션 하나가 현황판의 **64%**(16,412자)를 먹고 있었다.
//   왜 안 걸렸나 = ①`maxLine` 3000 이 너무 헐거워 2,893자 한 줄이 통과 ②`doneLine` 규칙이
//   **✅ 가 줄 맨 앞에 있을 때만** 매치돼 중간에 ✅ 를 단 항목(1,080·764자)이 전부 빠져나갔다.
//   → ①줄 한도 1200 ②✅ 는 줄 어디에 있든 매치 ③**섹션별 상한**(인덱스 섹션=400자) 신설
//     ④위반을 **큰 것부터** 정렬해 보고 — 이름이 불려야 실제 원인이 고쳐진다.
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
    maxLine: 1200,
    // 완료 항목은 요약 1줄만 — 장문 경위는 ARCHIVE 로. ✅ 는 줄 어디에 있어도 완료 표시로 본다.
    doneLine: { re: /✅/, max: 800, hint: '완료(✅) 항목 장문 — 상세는 PROJECT_STATUS_ARCHIVE.md 로 옮기고 「1줄 요약+남은 것」만 남길 것' },
    // 섹션별 상한 — 「인덱스」라고 이름 붙인 섹션은 실제로 인덱스여야 한다.
    sectionCaps: [
      {
        heading: '## ✅ 최근 완료',
        max: 400,
        hint: '「최근 완료 인덱스」는 인덱스다 — 경위는 ARCHIVE 로 옮기고 「제목 + 남은 것 + ARCHIVE 포인터」만',
      },
    ],
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
  const problems = []; // { size, msg } — size 로 정렬해 **큰 것부터** 보고한다

  if (raw.length > t.maxTotal) {
    problems.push({
      size: Infinity, // 총량 위반은 항상 맨 위
      msg: `총 ${raw.length.toLocaleString()}자 > 한도 ${t.maxTotal.toLocaleString()}자`,
    });
  }

  const lines = raw.split(/\r?\n/);
  let section = null; // 현재 섹션에 걸린 상한
  lines.forEach((l, i) => {
    if (/^#{2,3}\s/.test(l)) {
      section = (t.sectionCaps || []).find((s) => l.startsWith(s.heading)) || null;
      return;
    }
    const at = `L${i + 1} ${l.length.toLocaleString()}자`;
    const tail = `: ${l.slice(0, 60)}…`;

    if (l.length > t.maxLine) {
      problems.push({ size: l.length, msg: `${at} > 줄 한도 ${t.maxLine.toLocaleString()}자${tail}` });
    } else if (section && l.length > section.max) {
      problems.push({ size: l.length, msg: `${at} — [${section.heading}] ${section.hint}${tail}` });
    } else if (t.doneLine && t.doneLine.re.test(l) && l.length > t.doneLine.max) {
      problems.push({ size: l.length, msg: `${at} — ${t.doneLine.hint}${tail}` });
    }
  });

  if (problems.length) {
    failed = true;
    problems.sort((a, b) => b.size - a.size); // 최신 기록자가 아니라 **최대 위반자**가 먼저 불린다
    console.error(`[doc-diet] ${t.label} 위반 ${problems.length}건 → ${t.hint}`);
    problems.slice(0, 8).forEach((p) => console.error('  - ' + p.msg));
    if (problems.length > 8) console.error(`  … 외 ${problems.length - 8}건`);
    const worst = problems.find((p) => p.size !== Infinity);
    if (worst) console.error(`  ▶ 여기부터 줄일 것 (최대 위반): ${worst.msg.split(' —')[0].split(' >')[0]}`);
  }
}

if (failed) process.exit(1);
console.log('[doc-diet] OK — 현황판·메모리 인덱스 한도 내');
