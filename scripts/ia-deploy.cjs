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

function ask(q) {
  // 비대화 실행(파이프·에디터 터미널·Claude Code `!`)에서는 조용히 진행하면 안 되므로 'n' 이다.
  // ★단 **왜 취소됐는지 말해야 한다.** 그러지 않으면 화면에는 배포 대상까지 멀쩡히 뜬 뒤
  //   "취소했습니다." 한 줄만 남아, 사용자는 자기가 뭘 잘못했는지 알 수 없다(2026-08-06 실제 발생).
  if (!process.stdin.isTTY) {
    console.log(C.y('\n⚠ 대화형 입력을 쓸 수 없어 확인 질문을 받지 못했습니다(비대화 실행).'))
    console.log(C.dim(`  질문: ${q.trim()}`))
    console.log(C.dim('  → 위 "배포 대상" 을 확인했다면 --yes 를 붙여 다시 실행하세요:  npm run ia:deploy -- --yes'))
    console.log(C.dim('     (축2 호스트 로직이 포함되면 --yes 여도 한 번 더 묻습니다 — 그때는 실제 터미널에서 실행할 것)'))
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
const GATES = ['cut:bleed', 'cut:nest', 'cut:smoke', 'panel:smoke']
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

  if (DRY) { console.log(C.dim('\n--dry-run — 아무것도 바꾸지 않았습니다.')); process.exit(0) }

  // ★축2는 전 PC 즉시 반영이라 --yes 여도 반드시 묻는다
  const hasHost = plan.some((p) => p.axis === 'designer')
  if (hasHost) {
    console.log(C.y('\n⚠ 축2(호스트 로직)가 포함되어 있습니다 — Z: 파일 교체 즉시 **전 디자이너 PC**에 반영됩니다.'))
    const a = await ask('  실기 확인을 마쳤습니까? 진행하려면 y (y/N) ')
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
      console.log(C.y('\n축4 — 이 PC 패널 설치본이 낡았습니다. 껍데기 수정은 설치해야 반영됩니다:'))
      console.log(`  powershell -ExecutionPolicy Bypass -File "${script}"`)
      console.log(C.dim('  (다른 디자이너 PC 도 각자 한 번씩 실행해야 합니다 · 실행 후 일러 재시작)'))
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
    console.log(C.y(`  축4 ${left.length}건 남음 — 설치 스크립트를 실행하면 해소됩니다(위 명령).`))
  } else {
    console.log(C.g('  드리프트 없음 — repo와 런타임이 일치합니다.'))
  }
  // 파일 복사로는 해소되지 않는 것들 — 조용히 넘어가면 "배포 완료"가 거짓말이 된다.
  for (const o of (after.orphanBad || [])) console.log(C.r(`  ✖ 런타임 잔재(정본 없음): ${o.runRoot}\\${o.rel}`))
  for (const n of (after.retired || [])) console.log(C.y(`  ⚠ 정본 없는 설치 스크립트: ${n} — Z: 에서 치울 것`))
  console.log(`\n${C.g('배포 완료')}  롤백 = ${backupRoot} 의 파일을 되돌린 뒤 재감사`)
}

main().catch((e) => die(e && e.stack ? e.stack : String(e)))
