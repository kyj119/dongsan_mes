#!/usr/bin/env node
/**
 * IA 수동 배포 축 자동화 — `npm run ia:deploy`
 *
 * IA의 JSX/패널은 웹 배포(CF Pages)와 **분리된 수동 축**이다(CLAUDE.md "IA 스크립트 = 수동 배포 축 4개").
 * `git push`·`npm run deploy` 로는 절대 반영되지 않아서, 여태 사람이 경로를 손으로 복사했다.
 * 그 과정에서 실제로 사고가 났다:
 *   · 다른 세션의 미커밋 변경이 섞여 Z: 로 나갈 뻔했다(2026-08-05)
 *   · 축3만 올리고 축4(각 PC 설치)를 빠뜨리면 껍데기 수정이 조용히 반영되지 않는다
 *
 * ★배포 대상 목록을 **여기에 다시 적지 않는다.** `ia-jsx-audit.cjs --json` 을 그대로 소비한다.
 *   감사와 배포가 서로 다른 목록을 보면 그 불일치 자체가 다음 사고가 된다.
 *
 * 하는 일(순서 고정):
 *   ① 미커밋 IA 변경 확인   — 남의 작업이 섞여 나가는 것을 막는다
 *   ② 게이트 실행           — 하나라도 실패하면 배포하지 않는다
 *   ③ 드리프트 조회·표시    — 무엇이 나가는지 **눈으로 보고** 확인(y/n)
 *   ④ 백업 → 복사          — 되돌림 경로를 먼저 만든다
 *   ⑤ 재감사               — 드리프트 0 이어야 배포가 끝난 것이다
 *
 * ⚠️ 축2(Z: 호스트)는 **파일 1개 교체 = 전 디자이너 PC 즉시 반영**이다(스텁이 evalFile 하므로).
 *    그래서 확인 프롬프트를 건너뛰는 `--yes` 를 써도 축2가 섞여 있으면 한 번 더 묻는다.
 *    CLAUDE.md 의 "자동 동기화 금지"는 무분별한 자동화를 막자는 뜻이고, 백업·게이트·확인을
 *    갖춘 이 경로는 그 취지를 지킨다.
 * ⚠️ 축1(에이전트 JSX)은 `.csproj CopyToOutputDirectory=Always` 라 **빌드가 반영한다.**
 *    여기서 복사하지 않고 드리프트만 알린다(`--sync-agent` 는 감사 도구 쪽에 이미 있다).
 *
 * 사용법:
 *   npm run ia:deploy                 # 확인 프롬프트 있음(권장)
 *   npm run ia:deploy -- --dry-run    # 무엇이 나갈지만 보고 끝
 *   npm run ia:deploy -- --install    # 축4(이 PC 패널 설치)까지 실행
 *   npm run ia:deploy -- --yes        # 프롬프트 생략(축2가 있으면 그때만 묻는다)
 *   npm run ia:deploy -- --skip-gates # 게이트 생략 — 비상용. 평소에 쓰지 말 것
 *
 * ★버전 표기 게이트(2026-08-27) — 내용이 바뀌는 파일의 버전 문자열이 런타임과 같으면 **배포를 막는다**
 *   (`SHELL_VERSION`·`MESCUT_VERSION`·`MESA0_VERSION`). 번호 하나가 여러 코드 상태를 가리키면
 *   수동 배포축에서 "이 PC 는 어느 셸인가"를 판정할 방법이 없어진다. `--dry-run` 은 보여만 주고,
 *   `--skip-gates` 로만 넘길 수 있다.
 *
 * 종료코드: 0=성공/변경없음 · 1=실패(게이트·복사·재감사) · 2=사용자 취소
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { execSync, execFileSync } = require('child_process')

const REPO = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const YES = has('--yes')
const DRY = has('--dry-run')
const DO_INSTALL = has('--install')
const SKIP_GATES = has('--skip-gates')

const C = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
}
const die = (msg, code = 1) => { console.error(`\n${C.r('✖')} ${msg}`); process.exit(code) }

// @param hard  true = **--yes 로도 못 넘기는** 질문(축2 실기 확인). 안내 문구가 갈린다.
//   ★이 구분이 없으면 미커밋 경고에도 축2 설명이 나온다 — 시킨 대로 했는데 엉뚱한 이유를
//     읽게 되고, 그건 안내가 아니라 함정이다(2026-08-31 실제로 겪었다).
function ask(q, hard) {
  // 비대화 실행(파이프·에디터 터미널·Claude Code `!`)에서는 조용히 진행하면 안 되므로 'n' 이다.
  // ★단 **왜 취소됐는지 말해야 한다.** 그러지 않으면 화면에는 배포 대상까지 멀쩡히 뜬 뒤
  //   "취소했습니다." 한 줄만 남아, 사용자는 자기가 뭘 잘못했는지 알 수 없다(2026-08-06 실제 발생).
  if (!process.stdin.isTTY) {
    console.log(C.y('\n⚠ 대화형 입력을 쓸 수 없어 확인 질문을 받지 못했습니다(비대화 실행).'))
    console.log(C.dim(`  질문: ${q.trim()}`))
    // ★안내는 **막고 있는 게 무엇인지**에 따라 달라야 한다 (2026-08-06).
    //   전에는 무조건 "--yes 를 붙이세요" 였는데, 축2 질문은 --yes 로 안 열린다.
    //   시킨 대로 했는데 같은 자리에서 또 멈추면 안내가 아니라 함정이다(실제로 발생).
    if (YES && hard) {
      console.log(C.y('  → 이 질문은 --yes 로 넘어가지 않습니다. 축2(호스트)는 Z: 파일 교체 즉시'))
      console.log(C.y('     **전 디자이너 PC** 에 반영돼서, 실기 확인을 사람이 답해야 합니다.'))
      console.log(C.dim('     실제 터미널에서:  Win+R → powershell → cd "' + REPO + '" → npm run ia:deploy'))
      console.log(C.dim('     (축2를 빼고 화면만 먼저 내보내려면 호스트 변경을 되돌린 뒤 다시 실행하세요)'))
    } else {
      console.log(C.dim('  → 위 "배포 대상" 을 확인했다면 --yes 를 붙여 다시 실행하세요:  npm run ia:deploy -- --yes'))
      if (YES) {
        console.log(C.y('  → --yes 를 붙였는데도 멈춘 이유 = **위 경고를 먼저 해소**해야 합니다.'))
        console.log(C.dim('     미커밋 IA 변경이면 커밋하거나 되돌린 뒤 다시 실행하세요.'))
      }
      console.log(C.dim('     (축2 호스트 로직이 포함되면 --yes 여도 한 번 더 묻습니다 — 그때는 실제 터미널에서)'))
    }
    return Promise.resolve('n')
  }
  return new Promise((res) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, (a) => { rl.close(); res(String(a).trim().toLowerCase()) })
  })
}

// ── ① 미커밋 IA 변경 ────────────────────────────────────────────────
function uncommittedIa() {
  try {
    const out = execSync('git status --porcelain -- IllustratorAutomat', { cwd: REPO, encoding: 'utf8' })
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  } catch { return [] }
}

// ── ② 게이트 ────────────────────────────────────────────────────────
// 배포하는 코드가 통과한 코드여야 한다. package.json 에 실재하는 것만 돌린다.
// ★`cut:e2e` = **일러를 실제로 돌려** 판을 짜 보는 게이트. 나머지는 소스를 읽거나(정적) 순수
//   모듈을 값으로 돌리는 검사다 — 마스크가 죽어 배경이 사라진 사고는 정적 검사를 전부 통과했다.
//   일러가 안 떠 있으면 스스로 **건너뛴다**(exit 0). 못 도는 걸 실패로 만들면 사람이 게이트를 끈다.
// ★★`cut:butt` 는 하네스가 2026-08-06 부터 있었는데 **이 목록에 없었다** — 배포 때 아무도 안 돌렸다.
//   `cut:placement` 도 같이 넣는다: 「기능이 켜진 채로 끝났는가」를 보는 유일한 게이트라
//   빠지면 조용한 격하(맞붙임이 래스터로 떨어지는 것)가 또 배포를 통과한다(2026-09-04 실사고).
const GATES = ['cut:bleed', 'cut:nest', 'cut:butt', 'cut:placement', 'cut:smoke', 'panel:smoke', 'cut:e2e']
function runGates() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'))
  const list = GATES.filter((g) => pkg.scripts && pkg.scripts[g])
  if (!list.length) { console.log(C.y('  게이트 없음 — package.json 에 해당 스크립트가 없다')); return true }
  for (const g of list) {
    process.stdout.write(`  ${g} ... `)
    try {
      execSync(`npm run ${g}`, { cwd: REPO, encoding: 'utf8', stdio: 'pipe' })
      console.log(C.g('통과'))
    } catch (e) {
      console.log(C.r('실패'))
      const out = `${(e.stdout || '')}${(e.stderr || '')}`
      console.error(out.split(/\r?\n/).slice(-25).join('\n'))
      return false
    }
  }
  return true
}

// ── ③ 드리프트 조회 ─────────────────────────────────────────────────
function audit() {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'ia-jsx-audit.cjs'), '--json'],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    return JSON.parse(out)
  } catch (e) {
    // 드리프트가 있으면 exit 1 이지만 stdout 은 정상 JSON 이다
    const out = (e.stdout || '').trim()
    if (out.startsWith('{')) { try { return JSON.parse(out) } catch { /* fall */ } }
    die(`감사 실행 실패: ${e.message}`)
  }
}

const AXIS_LABEL = { agent: '축1 에이전트', designer: '축2 호스트(Z:)', panel: '축3 패널(Z:)', installed: '축4 설치본(이 PC)', tool: '축5 배포 도구(Z:)' }

// ── ③-B 버전 표기 ───────────────────────────────────────────────────
// **내용이 바뀌는데 번호가 그대로면 안 된다.** 그러면 하나의 번호가 여러 코드 상태를 가리키고,
// 나중에 "이 PC 는 어느 셸인가"를 판정할 수 없다 — IA 축은 배포가 수동이라 이 표기가 유일한 단서다.
// 2026-08-27 실제로 `cut-main.js` 가 **0.57.0 하나로 세 상태**를 가리키게 됐다
// (등록 파라미터 · 굽기 통합 · [◎ 전체] 세 번이 번호 없이 들어갔다).
// ⚠️ 셸 자동갱신 서명은 바이트도 보므로 **동기화 자체는 된다** — 그래서 조용하고, 그래서 위험하다.
const VERSION_MARKS = [
  { rel: /js\/cut-main\.js$/, re: /var\s+SHELL_VERSION\s*=\s*'([^']+)'/, label: '재단 셸 SHELL_VERSION' },
  { rel: /js\/main\.js$/, re: /var\s+SHELL_VERSION\s*=\s*'([^']+)'/, label: 'A0 셸 SHELL_VERSION' },
  { rel: /mes-cut-host\.jsx$/, re: /var\s+MESCUT_VERSION\s*=\s*'([^']+)'/, label: '재단 호스트 MESCUT_VERSION' },
  { rel: /mes-a0-host\.jsx$/, re: /var\s+MESA0_VERSION\s*=\s*'([^']+)'/, label: 'A0 호스트 MESA0_VERSION' },
]
function readVer(file, re) {
  try { const m = fs.readFileSync(file, 'utf8').match(re); return m ? m[1] : null } catch { return null }
}
/** 복사 예정 목록 중 "내용은 다른데 버전 문자열은 같은" 것 */
function staleVersions(plan) {
  const out = []
  for (const p of plan) {
    const rel = p.rel.replace(/\\/g, '/')
    const mark = VERSION_MARKS.find((v) => v.rel.test(rel))
    if (!mark) continue
    const repoV = readVer(path.join(p.repoRoot, p.rel), mark.re)
    const runV = readVer(path.join(p.runRoot, p.rel.replace(/\//g, path.sep)), mark.re)
    // 런타임에 파일이 없으면(신규) 비교 대상이 없다 — 막을 이유도 없다.
    if (repoV && runV && repoV === runV) out.push({ rel, label: mark.label, v: repoV })
  }
  return out
}

// ── ④ 백업 → 복사 ───────────────────────────────────────────────────
function copyOne(repoRoot, runRoot, rel, backupRoot) {
  const src = path.join(repoRoot, rel)
  const dst = path.join(runRoot, rel.replace(/\//g, path.sep))
  if (!fs.existsSync(src)) return { rel, ok: false, why: 'repo 에 파일이 없다' }
  if (fs.existsSync(dst) && backupRoot) {
    const bak = path.join(backupRoot, rel.replace(/\//g, path.sep))
    fs.mkdirSync(path.dirname(bak), { recursive: true })
    fs.copyFileSync(dst, bak)
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
  return { rel, ok: true }
}

async function main() {
  console.log(C.b('\nIA 배포 — 수동 축(웹 배포와 분리)\n'))

  // ① 미커밋 IA 변경
  const dirty = uncommittedIa()
  if (dirty.length) {
    console.log(C.y('⚠ 미커밋 IA 변경이 있습니다 — 커밋되지 않은 코드가 Z: 로 나갑니다.'))
    console.log(C.dim('  다른 세션의 작업이 섞이면 남의 미완성이 전 PC 에 배포됩니다(2026-08-05 실제 사례).'))
    for (const l of dirty.slice(0, 20)) console.log(`    ${l}`)
    if (dirty.length > 20) console.log(`    ... 외 ${dirty.length - 20}건`)
    if (!DRY) {
      const a = await ask('  그래도 계속할까요? (y/N) ')
      if (a !== 'y') { console.log('취소했습니다.'); process.exit(2) }
    }
    console.log('')
  }

  // ② 게이트
  if (SKIP_GATES) console.log(C.y('게이트 생략(--skip-gates) — 비상용입니다.\n'))
  else {
    console.log(C.b('게이트'))
    if (!runGates()) die('게이트 실패 — 배포하지 않았습니다.')
    console.log('')
  }

  // ③ 드리프트
  const data = audit()
  const plan = []      // 복사할 것: {axis, label, repoRoot, runRoot, rel}
  const notes = []
  for (const ax of data.axes) {
    if (ax.unreachable) { notes.push(`${AXIS_LABEL[ax.axis] || ax.axis}: 런타임 경로에 접근할 수 없습니다(${ax.runRoot})`); continue }
    const rows = ax.rows.filter((r) => r.state !== '동일')
    if (!rows.length) continue
    if (ax.axis === 'agent') {
      notes.push(`축1 에이전트 JSX ${rows.length}건 드리프트 — 여기서 복사하지 않습니다. 빌드하거나 \`node scripts/ia-jsx-audit.cjs --sync-agent\``)
      continue
    }
    if (ax.axis === 'installed') continue   // 파일 복사가 아니라 설치 스크립트로 처리한다(아래)
    for (const r of rows) plan.push({ axis: ax.axis, label: ax.label, repoRoot: ax.repoRoot, runRoot: ax.runRoot, rel: r.rel, state: r.state })
  }
  // 축4는 **설치본이 repo 와 실제로 다를 때만** 필요하다.
  //   "축3 을 갱신했으니 무조건 설치"로 두면, 이 PC 가 이미 최신인데도 매번 설치를 안내하게 된다.
  //   축4 판정은 repo↔설치본 비교이므로 Z: 갱신 여부와 무관하게 정확하다.
  const needInstallUniq = data.axes.filter((a) => a.axis === 'installed' && !a.unreachable)
    .filter((a) => a.rows.some((r) => r.state !== '동일'))

  if (!plan.length && !needInstallUniq.length) {
    console.log(C.g('배포할 변경이 없습니다 — repo와 런타임이 이미 일치합니다.'))
    for (const n of notes) console.log(C.y(`  ※ ${n}`))
    process.exit(0)
  }

  console.log(C.b('배포 대상'))
  const byAxis = {}
  for (const p of plan) (byAxis[p.axis] = byAxis[p.axis] || []).push(p)
  for (const [axis, rows] of Object.entries(byAxis)) {
    console.log(`  ${C.b(AXIS_LABEL[axis] || axis)}  → ${C.dim(rows[0].runRoot)}`)
    for (const r of rows) console.log(`    ${r.state === '런타임없음' ? '＋' : '·'} ${r.rel}  ${C.dim(r.state)}`)
  }
  if (needInstallUniq.length) {
    console.log(`  ${C.b('축4 설치본(이 PC)')}  → ${DO_INSTALL ? '설치 스크립트를 실행합니다' : C.y('수동 실행 필요 (--install 로 여기서 실행 가능)')}`)
  }
  for (const n of notes) console.log(C.y(`  ※ ${n}`))

  // ③-B 버전 표기 — dry-run 에서도 보여주고, 실제 배포일 때만 막는다
  const staleVer = staleVersions(plan)
  if (staleVer.length) {
    console.log(C.r('\n✖ 버전 표기가 그대로입니다 — 내용은 바뀌는데 번호가 안 올랐습니다.'))
    for (const s of staleVer) console.log(`    ${s.rel}\n      ${s.label} = ${s.v} ${C.dim('(런타임과 동일)')}`)
    console.log(C.dim('  번호 하나가 여러 코드 상태를 가리키면 "이 PC 는 어느 셸인가"를 판정할 수 없습니다.'))
    console.log(C.dim('  번호를 올리고(맨 앞 주석에 무엇이 바뀌었는지 한 줄) 다시 실행하세요.'))
    if (!DRY && !SKIP_GATES) die('버전 표기를 올린 뒤 다시 실행하세요. 비상 시에만 --skip-gates.')
    if (SKIP_GATES) console.log(C.y('  --skip-gates — 그대로 진행합니다.'))
  }

  if (DRY) { console.log(C.dim('\n--dry-run — 아무것도 바꾸지 않았습니다.')); process.exit(0) }

  // ★축2는 전 PC 즉시 반영이라 --yes 여도 반드시 묻는다
  const hasHost = plan.some((p) => p.axis === 'designer')
  if (hasHost) {
    console.log(C.y('\n⚠ 축2(호스트 로직)가 포함되어 있습니다 — Z: 파일 교체 즉시 **전 디자이너 PC**에 반영됩니다.'))
    const a = await ask('  실기 확인을 마쳤습니까? 진행하려면 y (y/N) ', true)
    if (a !== 'y') { console.log('취소했습니다.'); process.exit(2) }
  } else if (!YES) {
    const a = await ask('\n배포할까요? (y/N) ')
    if (a !== 'y') { console.log('취소했습니다.'); process.exit(2) }
  }

  // ④ 백업 → 복사
  // ★로컬(KST) 시각 — 기존 백업 폴더들이 전부 로컬 기준이라 UTC 를 섞으면 시간순 정렬이 깨진다.
  //   (toISOString 을 자르는 방식은 밀리초 점까지 딸려 와 `...338.` 같은 폴더명을 만든다)
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
  const zRoot = 'Z:\\DESIGNS\\IA-등록\\_scripts'
  const backupRoot = path.join(zRoot, '_backup', stamp)
  let failed = 0
  console.log(`\n백업 → ${C.dim(backupRoot)}`)
  for (const [axis, rows] of Object.entries(byAxis)) {
    for (const r of rows) {
      const res = copyOne(r.repoRoot, r.runRoot, r.rel, path.join(backupRoot, axis))
      if (res.ok) console.log(`  ${C.g('✓')} ${r.rel}`)
      else { failed++; console.log(`  ${C.r('✖')} ${r.rel} — ${res.why}`) }
    }
  }
  if (failed) die(`${failed}건 복사 실패 — 백업은 ${backupRoot} 에 있습니다.`)

  // 축4
  if (needInstallUniq.length) {
    const script = path.join(zRoot, (needInstallUniq[0].panel && needInstallUniq[0].panel.install) || 'install-a0-panel.ps1')
    if (DO_INSTALL) {
      console.log(`\n축4 설치 — ${C.dim(script)}`)
      try {
        const out = execFileSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script], { encoding: 'utf8' })
        console.log(out.split(/\r?\n/).filter((l) => /완료|오류|실패|백업/.test(l)).map((l) => `  ${l}`).join('\n'))
      } catch (e) { die(`설치 스크립트 실패: ${e.message}`) }
    } else {
      // ★2026-08-27 — 축4 는 **스스로 따라온다**. 옛 문구("각 PC 에서 설치 스크립트를 실행")를
      //   그대로 두면 이제는 거짓말이고, 안 해도 되는 사무실 순회를 시킨다.
      //   호스트(축2)의 mesA0_ping() → mesPanel_syncShell() 이 Z: 배포본과 설치본을 대조해 갱신한다.
      console.log(C.y('\n축4 — 이 PC 설치본이 아직 낡았습니다(패널을 아직 안 열었기 때문).'))
      console.log(C.dim('  ★디자이너 PC 는 방문하지 않아도 됩니다 — 패널을 여는 순간 스스로 갱신하고'))
      console.log(C.dim('    "일러스트레이터를 다시 켜 주세요" 를 띄웁니다(호스트 A0-CEP-0.2.0+).'))
      console.log(C.dim(`  이 PC 를 지금 맞추려면:  powershell -ExecutionPolicy Bypass -File "${script}"`))
      console.log(C.dim('  (또는 그냥 패널을 한 번 열었다 일러를 재시작해도 됩니다)'))
    }
  }

  // ⑤ 재감사
  console.log(C.b('\n재감사'))
  const after = audit()
  const left = after.axes.filter((a) => !a.unreachable && a.axis !== 'agent')
    .flatMap((a) => a.rows.filter((r) => r.state !== '동일').map((r) => ({ axis: a.axis, rel: r.rel })))
  const leftBlocking = left.filter((r) => !(r.axis === 'installed' && !DO_INSTALL))
  if (leftBlocking.length) {
    for (const r of leftBlocking) console.log(`  ${C.r('✖')} ${AXIS_LABEL[r.axis] || r.axis} ${r.rel}`)
    die('배포 후에도 드리프트가 남았습니다.')
  }
  if (left.length) {
    console.log(C.y(`  축4 ${left.length}건 남음 — 패널을 열면 자동으로 해소됩니다(또는 위 설치 명령).`))
  } else {
    console.log(C.g('  드리프트 없음 — repo와 런타임이 일치합니다.'))
  }
  // 파일 복사로는 해소되지 않는 것들 — 조용히 넘어가면 "배포 완료"가 거짓말이 된다.
  for (const o of (after.orphanBad || [])) console.log(C.r(`  ✖ 런타임 잔재(정본 없음): ${o.runRoot}\\${o.rel}`))
  for (const n of (after.retired || [])) console.log(C.y(`  ⚠ 정본 없는 설치 스크립트: ${n} — Z: 에서 치울 것`))
  console.log(`\n${C.g('배포 완료')}  롤백 = ${backupRoot} 의 파일을 되돌린 뒤 재감사`)
}

main().catch((e) => die(e && e.stack ? e.stack : String(e)))
