#!/usr/bin/env node
/**
 * IA 스크립트 런타임 드리프트 감사 (CLAUDE.md "IA JSX 배포 축" · memory feedback-ia-jsx-runtime-path)
 *
 * IA의 JSX/패널은 **웹 배포(CF Pages)와 완전히 분리된 수동 배포 축**이다.
 * `git push`·`npm run deploy` 로는 절대 반영되지 않고, 축이 3개다.
 * 그래서 "repo는 고쳤는데 런타임은 옛날 파일"이 조용히 성립한다 — 이 도구가 그걸 잡는다.
 *
 *   축1 에이전트 JSX  : repo IllustratorAutomat/*.jsx        → 실행 중 exe 폴더(BaseDirectory)
 *   축2 디자이너 JSX  : repo IllustratorAutomat/designer/*.jsx → Z:\DESIGNS\IA-등록\_scripts\
 *   축3 CEP 패널 배포본: repo .../com.mes.a0.panel/**          → Z:\DESIGNS\IA-등록\_scripts\a0-panel\com.mes.a0.panel\
 *   축4 CEP 패널 설치본: 같은 repo 원본                        → %APPDATA%\Adobe\CEP\extensions\com.mes.a0.panel
 *
 * ★ 패널은 **2단 배포**다(install-a0-panel.ps1 실측, 2026-07-29).
 *   - 로직 `mes-a0-host.jsx` = 패널의 `jsx/host.jsx` 스텁이 Z: 정본을 `$.evalFile` → Z: 1개 교체로 전 PC 반영(축2)
 *   - 껍데기 `index.html`·`js/main.js`·`css/style.css` = **PC별 복사 설치** → Z:만 갱신하면 반영 안 된다.
 *     각 PC에서 `install-a0-panel.ps1` 재실행이 필요하고, 그 누락을 잡는 게 축4다.
 *     (실측: 이 PC 설치본은 07-27자로 Z:보다 낡았고, host.jsx 가 스텁이 아니라 구 로직 본체였다
 *      = Z: 로직 수정이 이 PC에 전혀 반영되지 않는 상태였다)
 *
 * 실제 사고(2026-07-29): 축1에서 SheetLayout.jsx 폴백 수정(커밋 5b6d345e, 07-28 15:43)이
 *   exe 폴더에 복사되지 않아 구버전이 계속 돌았다. 모아찍기 판 렌더가 "JSX 반환 빈값"으로
 *   6일간 실패(sheet #20·#21). 브랜치·커밋 기록만 보면 "이미 고침"으로 보였다.
 *
 * 사용법:
 *   node scripts/ia-jsx-audit.cjs             # 3축 대조, 드리프트 시 exit 1
 *   node scripts/ia-jsx-audit.cjs --sync-agent  # 축1만 repo→런타임 복사(.bak 백업 후)
 *   node scripts/ia-jsx-audit.cjs --json      # 기계 판독용
 *
 * 종료코드: 0=일치 · 1=드리프트/누락 있음
 *   NAS(Z:) 미연결은 '확인불가'로 표시만 하고 실패시키지 않는다(사무실 밖 작업 허용).
 *
 * ⚠️ 축2·축3은 자동 동기화하지 않는다. Z: 파일 1개 교체 = **전 디자이너 PC 즉시 반영**이라
 *   되돌림 경로 확보(백업)와 실기기 확인이 선행돼야 한다. 이 도구는 명령만 안내한다.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync } = require('child_process')

const REPO = path.resolve(__dirname, '..')
const IA = path.join(REPO, 'IllustratorAutomat')
const Z_SCRIPTS = 'Z:\\DESIGNS\\IA-등록\\_scripts'
const AGENT_FALLBACK = path.join(IA, 'bin', 'Release', 'net8.0', 'win-x64')

const args = process.argv.slice(2)
const SYNC_AGENT = args.includes('--sync-agent')
const AS_JSON = args.includes('--json')

// 에이전트가 BaseDirectory 에서 읽는 JSX (Program.cs Path.Combine(BaseDirectory, ...) 전수)
const AGENT_JSX = ['SheetLayout.jsx', 'ProcessOrderItem.jsx', 'ExtractGroups.jsx', 'PackGroups.jsx']
// 스텁이 $.evalFile 로 실행하는 Z: 정본 (디자이너 PC엔 스텁만 설치돼 있다)
//   repo 에 실재하는 것만 감사한다 — 새 호스트(mes-cut-host.jsx 등)를 만들면 **자동으로 편입**된다.
//   mes-lock.jsx = 두 호스트가 공유하는 잠금 모듈. 이게 낡으면 패널들이 서로의 작업을 못 본다.
const DESIGNER_JSX = ['mes-core.jsx', 'mes-sheet.jsx', 'mes-a0-host.jsx', 'mes-cut-host.jsx', 'mes-lock.jsx']
  .filter((f) => fs.existsSync(path.join(IA, 'designer', f)))
// ── ★배포 대상을 하드코딩하지 않는다 (2026-08-06 근본수정) ────────────────
// 여태 패널 파일 목록이 손으로 관리되는 배열이었다. 그래서 **목록에 없는 파일은
// 바뀌어도 아무도 모른다** — 같은 사고를 세 번 냈다:
//   ① `.debug` 를 "로컬 디버그 플래그"로 오인해 제외 (2026-07-30 정정)
//   ② 재단 패널이 레지스트리 미등록이라 통째로 감사망 밖 (2026-07-31 정정)
//   ③ **install-a0-panel.ps1 — 배포 도구 자신이 감사망 밖**. Z: 사본이 병합(08-04) 전
//      버전인 채로 방치됐는데 감사는 "드리프트 없음"을 냈다 (2026-08-06 발견)
// 목록을 유지하는 한 ④가 또 나온다. 그래서 **열거**로 바꾼다.
//
// 근거: `install-a0-panel.ps1` 은 `Copy-Item $src\* -Recurse` 로 **폴더째** 복사한다.
//   즉 배포되는 집합 = repo 패널 폴더 그 자체다. 열거하면 새 파일이 자동 편입되고,
//   목록과 실제 배포물이 갈릴 여지가 원천적으로 없어진다.
function walkRel(root, base) {
  if (!fs.existsSync(root)) return []
  const out = []
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name)
    if (e.isDirectory()) { out.push(...walkRel(full, base)); continue }
    out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out.sort()
}

// 런타임에만 있는 파일 = repo 에서 지웠는데 남았거나, 누가 손으로 떨군 것.
//   열거 방식은 "repo 기준"이라 이 방향이 그냥 두면 새 사각지대가 된다 → 대칭으로 막는다.
//   `.bak-*`·`.retired*` 는 설치·배포 스크립트가 만든 백업이라 **경고만** 한다(실패시키지 않는다).
const BACKUP_RE = /(\.bak-|\.retired)/i
function orphansOf(repoRoot, runRoot) {
  if (!fs.existsSync(runRoot)) return []
  const have = new Set(walkRel(repoRoot, repoRoot))
  return walkRel(runRoot, runRoot)
    .filter((r) => !have.has(r))
    .map((r) => ({ rel: r, backup: BACKUP_RE.test(r) }))
}
// geometry.js 정본 = 재단 패널 것. Node 하네스(cut:bench·cut:nest)가 **그 파일을** 로드해 검증하므로
// "검증한 코드 = 배포된 코드"가 성립한다. A0 사본이 갈라지면 그 등식이 조용히 깨진다(A0 쪽은
// 검증된 적 없는 코드가 도는데 하네스는 계속 통과한다) → 바이트 동일을 강제한다.
// 2026-08-04 병합으로 geometry.js **사본이 사라졌다** — 패널이 하나뿐이라 갈릴 대상이 없다.
// Node 하네스(cut:bench·cut:nest)도 이 한 파일을 읽는다 = '검증한 코드 = 배포된 코드'가 자동 성립.
const GEOM_CANON = { panel: 'a0', rel: 'js/geometry.js', copies: [] }
// ── 패널 레지스트리 ────────────────────────────────────────────────
// 패널은 **여러 개**다(2026-07-31~): A0 패널 + 재단 패널(분리 개발 → 병합 예정).
// 하드코딩 1개였을 때는 새 패널이 감사망 밖이라 조용히 드리프트했다 — 여기에 등록하면 축3·축4가 함께 붙는다.
//   repo 폴더가 없으면 자동 skip(미착수 패널을 '없음'으로 실패시키지 않는다).
// 정본 spec = docs/superpowers/specs/2026-07-31-cut-file-panel.md §5.2-③
const PANELS = [
  { id: 'a0', ext: 'com.mes.a0.panel', repo: path.join(IA, 'designer', 'poc-a0-cep', 'com.mes.a0.panel'), zSub: 'a0-panel', install: 'install-a0-panel.ps1' },
].filter((p) => fs.existsSync(p.repo))
// 2026-08-04 병합: 재단 패널(com.mes.cut.panel)은 이 패널의 '재단' 탭으로 흡수됐다.
// 각 PC 에 남아 있는 구 확장은 install-a0-panel.ps1 이 백업 후 지운다(같은 기능이 두 개면 헷갈린다).

// 축4: 이 PC에 실제로 설치돼 일러가 읽는 패널. install-*.ps1 의 설치 위치와 동일.
const installedDir = (ext) => (process.env.APPDATA
  ? path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions', ext)
  : '')

// ── 축5 배포 도구 — repo → Z: (2026-08-06 신설) ────────────────────────
// **배포를 수행하는 스크립트 자신**도 repo→Z: 수동 축이다. 축2(호스트 JSX)도 축3(패널 폴더)도
// 아니라서 여태 무주공산이었고, 그래서 Z: 의 install-a0-panel.ps1 이 병합(08-04) 전 버전인 채로
// 남았는데 감사는 통과했다. 그 버전은 은퇴한 재단 확장을 지우지 못해 **같은 기능이 두 개** 남는다.
//   ⚠️ 여기 등록된 것이 "디자이너가 실제로 실행하는 파일"이다. 매뉴얼이 안내하는 경로와 반드시 일치할 것.
const Z_CAPS = 'Z:\\Designs\\caps-worker'
const TOOLS = [
  { rel: 'install-a0-panel.ps1', repoRoot: path.join(REPO, 'scripts'), runRoot: Z_SCRIPTS },
  // ★.bat = 디자이너가 **실제로 더블클릭하는 파일**. Z: 의 .ps1 은 "원격 스크립트"라 실행 정책에
  //   막히고 연결 프로그램도 없어 더블클릭이 무반응이다 → 래퍼 없이는 절차가 실행 불가능하다.
  { rel: 'install-a0-panel.bat', repoRoot: path.join(REPO, 'scripts'), runRoot: Z_SCRIPTS },
  { rel: 'install-caps-worker.ps1', repoRoot: path.join(REPO, 'scripts'), runRoot: Z_CAPS },
].filter((t) => fs.existsSync(path.join(t.repoRoot, t.rel)))

// 은퇴한 설치 스크립트가 Z: 에 남아 있으면 **누군가 그걸 실행한다**.
//   install-cut-panel.ps1 을 돌리면 병합으로 은퇴한 com.mes.cut.panel 이 되살아나 확장이 두 개가 된다.
//   repo 에 대응 파일이 없는 install-*.ps1/.bat = 정본 없는 도구 → 제거 대상.
function retiredTools() {
  if (!fs.existsSync(Z_SCRIPTS)) return []
  const canon = new Set(TOOLS.filter((t) => t.runRoot === Z_SCRIPTS).map((t) => t.rel.toLowerCase()))
  try {
    return fs.readdirSync(Z_SCRIPTS)
      .filter((n) => /^install-.*\.(ps1|bat)$/i.test(n))
      .filter((n) => !canon.has(n.toLowerCase()))
  } catch { return [] }
}

// CRLF·BOM 정규화 후 해시 — 수동 복사(robocopy·탐색기)와 git 체크아웃이 줄끝을 바꾸므로
// 파일 크기·바이트 비교는 오판한다(memory feedback-ia-jsx-runtime-path).
function hashOf(file) {
  const buf = fs.readFileSync(file)
  let text = buf.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 8)
}

function stamp(file) {
  try { return new Date(fs.statSync(file).mtime).toISOString().slice(5, 16).replace('T', ' ') } catch { return '-' }
}

// 실행 중인 에이전트의 실제 폴더. 이게 진짜 런타임이다 — publish 폴더가 아니다.
function detectAgentDir() {
  if (process.platform !== 'win32') return { dir: AGENT_FALLBACK, live: false }
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Process IllustratorAutomat -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)"',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
    if (out) return { dir: path.dirname(out), live: true }
  } catch { /* 미실행 — 폴백 */ }
  return { dir: AGENT_FALLBACK, live: false }
}

// 한 축 비교. 런타임 루트가 없으면(NAS 미연결 등) 'unreachable'.
//   panel = 패널 축일 때의 레지스트리 항목(조치 안내에 설치 스크립트명을 실어 보내기 위함).
function compare(axis, label, files, repoRoot, runRoot, panel = null) {
  const rows = []
  if (!fs.existsSync(runRoot)) return { axis, label, repoRoot, runRoot, panel, unreachable: true, rows }
  for (const rel of files) {
    const a = path.join(repoRoot, rel)
    const b = path.join(runRoot, rel.replace(/\//g, path.sep))
    if (!fs.existsSync(a)) { rows.push({ rel, state: 'repo없음', repo: '-', run: fs.existsSync(b) ? hashOf(b) : '-', mtime: stamp(b) }); continue }
    if (!fs.existsSync(b)) { rows.push({ rel, state: '런타임없음', repo: hashOf(a), run: '-', mtime: '-' }); continue }
    const ha = hashOf(a), hb = hashOf(b)
    rows.push({ rel, state: ha === hb ? '동일' : '드리프트', repo: ha, run: hb, mtime: stamp(b) })
  }
  return { axis, label, repoRoot, runRoot, panel, unreachable: false, rows }
}

const agent = detectAgentDir()
// 축5는 repoRoot/runRoot 조합이 여러 개라 조합별로 묶어 한 축씩 만든다.
// 묶음 키 구분자는 NUL — 경로에 절대 못 들어가는 문자라 공백·특수문자가 있어도 안 깨진다.
const toolAxes = [...new Set(TOOLS.map((t) => `${t.repoRoot} ${t.runRoot}`))].map((key) => {
  const [repoRoot, runRoot] = key.split(' ')
  const files = TOOLS.filter((t) => t.repoRoot === repoRoot && t.runRoot === runRoot).map((t) => t.rel)
  return compare('tool', `축5 배포 도구 (${runRoot})`, files, repoRoot, runRoot)
})
const axes = [
  compare('agent', `축1 에이전트 JSX ${agent.live ? '(실행 중 프로세스 실측)' : '(미실행 — 기본 빌드 경로 추정)'}`, AGENT_JSX, IA, agent.dir),
  compare('designer', '축2 디자이너 JSX (Z: 정본)', DESIGNER_JSX, path.join(IA, 'designer'), Z_SCRIPTS),
  ...PANELS.flatMap((p) => {
    // ★목록이 아니라 열거 — repo 패널 폴더에 있는 것이 곧 배포 대상이다(위 walkRel 주석).
    const files = walkRel(p.repo, p.repo)
    return [
      compare('panel', `축3 CEP 패널 배포본 [${p.ext}] (Z: 정본)`, files, p.repo, path.join(Z_SCRIPTS, p.zSub, p.ext), p),
      compare('installed', `축4 CEP 패널 설치본 [${p.ext}] (이 PC · 일러가 실제로 읽는 것)`, files, p.repo, installedDir(p.ext) || path.join(REPO, '__no_appdata__'), p),
    ]
  }),
  ...toolAxes,
]

const drifted = axes.flatMap((ax) => ax.rows.filter((r) => r.state !== '동일').map((r) => ({ axis: ax.axis, panel: ax.panel, ...r })))

// ── 런타임 잔재 (열거 방식의 역방향) ─────────────────────────────────────
// repo 에서 지운 파일이 런타임에 남으면 "감사 통과 + 옛 파일 살아있음"이 된다.
//   고아 = 실패시킨다(정본 없는 코드가 도는 것). 백업(.bak-·.retired) = 경고만.
const orphanAxes = axes
  .filter((ax) => (ax.axis === 'panel' || ax.axis === 'installed') && !ax.unreachable)
  .map((ax) => ({ label: ax.label, runRoot: ax.runRoot, items: orphansOf(ax.repoRoot, ax.runRoot) }))
  .filter((o) => o.items.length)
const orphanBad = orphanAxes.flatMap((o) => o.items.filter((i) => !i.backup).map((i) => ({ runRoot: o.runRoot, ...i })))
const retired = retiredTools()

// ── 사본 일치(repo 내부) — 축 비교와는 별개 문제다 ────────────────────────
// 축1~4 는 "repo ↔ 런타임" 만 본다. 두 패널이 **repo 안에서** 같이 들고 있는 파일이
// 갈라지는 것은 그 그물에 안 걸린다(양쪽 다 자기 런타임과는 일치하므로 전 축 ✅).
const twins = (() => {
  const canon = PANELS.find((p) => p.id === GEOM_CANON.panel)
  if (!canon) return []
  const src = path.join(canon.repo, GEOM_CANON.rel)
  if (!fs.existsSync(src)) return []
  const h = hashOf(src)
  return GEOM_CANON.copies.map((id) => {
    const p = PANELS.find((x) => x.id === id)
    if (!p) return null
    const f = path.join(p.repo, GEOM_CANON.rel)
    if (!fs.existsSync(f)) return { from: canon.id, to: id, rel: GEOM_CANON.rel, state: '사본없음', canon: h, copy: '-' }
    const hc = hashOf(f)
    return { from: canon.id, to: id, rel: GEOM_CANON.rel, state: hc === h ? '동일' : '사본갈림', canon: h, copy: hc }
  }).filter(Boolean)
})()
const twinBad = twins.filter((t) => t.state !== '동일')

// ── ★같은 Extension ID 중복 등록 (2026-07-31 실측) ──────────────────────
// CEP 는 extensions 아래에서 `CSXS/manifest.xml` 이 있는 폴더를 **전부** 확장으로 등록한다.
// 설치 스크립트가 남긴 `.bak-*` 백업도 manifest·ExtensionBundleId 가 원본과 똑같아서
// **같은 ID 가 여러 개**가 되고, CEP 가 그중 백업(구버전)을 고르는 일이 실제로 일어났다.
//   증상 = 호스트만 새 버전(Z: 에서 evalFile 하므로)이고 **shell 만 옛 버전**으로 뜬다.
//   (실측: host CUT-CEP-0.5.0 / shell 0.7.2 = `.bak-20260731-165851` 폴더의 값)
// 축4 는 정식 폴더만 보므로 **드리프트 0 인데 화면은 구버전**이 된다 → 이 그물이 따로 필요하다.
const dupExts = (() => {
  const root = process.env.APPDATA && path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions')
  if (!root || !fs.existsSync(root)) return []
  const byId = new Map()
  for (const name of fs.readdirSync(root)) {
    const mf = path.join(root, name, 'CSXS', 'manifest.xml')
    if (!fs.existsSync(mf)) continue
    let id = null
    try { id = (/ExtensionBundleId="([^"]+)"/.exec(fs.readFileSync(mf, 'utf8')) || [])[1] || null } catch { /* 읽기 실패는 건너뛴다 */ }
    if (!id) continue
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push(name)
  }
  const known = new Set(PANELS.map((p) => p.ext))
  return [...byId.entries()]
    .filter(([id, dirs]) => known.has(id) && dirs.length > 1)
    .map(([id, dirs]) => ({ id, dirs, extras: dirs.filter((d) => d !== id) }))
})()

if (AS_JSON) {
  console.log(JSON.stringify({ agentDir: agent.dir, agentLive: agent.live, axes, drifted, twins, twinBad, dupExts, orphanAxes, orphanBad, retired }, null, 2))
  process.exit(drifted.length || twinBad.length || dupExts.length || orphanBad.length || retired.length ? 1 : 0)
}

console.log('\nIA 스크립트 런타임 드리프트 감사\n' + '='.repeat(60))
for (const ax of axes) {
  console.log(`\n▸ ${ax.label}`)
  console.log(`  런타임: ${ax.runRoot}`)
  if (ax.unreachable) { console.log('  ⚠️  확인불가 — 경로 접근 불가(NAS 미연결?). 이 축은 판정에서 제외.'); continue }
  for (const r of ax.rows) {
    const mark = r.state === '동일' ? '✅' : '❌'
    console.log(`  ${mark} ${r.rel.padEnd(24)} repo ${r.repo}  런타임 ${r.run}  (${r.mtime})  ${r.state === '동일' ? '' : r.state}`)
  }
}

// 사본 갈림은 축 드리프트와 **독립적으로** 보고한다 — 전 축 ✅ 여도 이건 살아있을 수 있다.
if (twinBad.length) {
  console.log(`\n❌ repo 사본 불일치 ${twinBad.length}건 — 같은 파일을 둘이 들고 있는데 내용이 다릅니다.`)
  for (const t of twinBad) {
    console.log(`  ${t.rel}  정본[${t.from}] ${t.canon}  사본[${t.to}] ${t.copy}  (${t.state})`)
  }
  const cP = PANELS.find((p) => p.id === GEOM_CANON.panel)
  const dP = PANELS.find((p) => p.id === GEOM_CANON.copies[0])
  if (cP && dP) {
    console.log('  조치 — 정본을 사본으로 덮어쓴 뒤 축3·축4를 다시 배포:')
    console.log(`    cp "${path.join(cP.repo, GEOM_CANON.rel)}" "${path.join(dP.repo, GEOM_CANON.rel)}"`)
  }
}

// ★중복 확장은 축 드리프트와 **독립**이다 — 정식 폴더가 최신이어도(전 축 ✅) 일러는 백업을 읽을 수 있다.
if (dupExts.length) {
  console.log(`\n❌ CEP 확장 ID 중복 ${dupExts.length}건 — 일러가 **어느 폴더를 읽을지 알 수 없습니다.**`)
  console.log('  CEP 는 manifest 가 있는 폴더를 전부 등록하는데, `.bak-*` 백업도 ID 가 같습니다.')
  console.log('  증상 = 호스트만 새 버전이고 **shell 만 옛 버전**으로 뜬다(2026-07-31 실측: host 0.5.0 / shell 0.7.2).')
  for (const d of dupExts) {
    console.log(`  ${d.id}  →  폴더 ${d.dirs.length}개`)
    for (const x of d.extras) console.log(`      군더더기: ${x}`)
  }
  console.log('  조치 — extensions **밖으로** 옮기고 일러 재시작:')
  console.log('    powershell -Command "$e=Join-Path $env:APPDATA \'Adobe\\CEP\\extensions\'; $b=Join-Path $env:APPDATA \'Adobe\\CEP\\_panel_backups\'; New-Item -ItemType Directory -Force $b | Out-Null; Get-ChildItem $e -Directory -Filter \'*.bak-*\' | Move-Item -Destination $b -Force"')
  console.log('  (설치 스크립트는 2026-07-31 부터 백업을 extensions 밖에 만든다 — 옛 백업만 남아 있는 상태다)')
}

// ── 런타임 잔재 ─────────────────────────────────────────────────────────
// 열거 방식은 "repo 에 있는 것"을 본다. repo 에서 지운 파일이 런타임에 남는 것은
// 그 그물에 안 걸리므로 여기서 따로 잡는다(전 축 ✅ 여도 살아있을 수 있다).
if (orphanAxes.length) {
  const bad = orphanBad.length
  console.log(`\n${bad ? '❌' : '⚠️ '} 런타임 잔재 — repo 에 없는 파일이 런타임에 있습니다.`)
  for (const o of orphanAxes) {
    console.log(`  ▸ ${o.runRoot}`)
    for (const i of o.items) console.log(`      ${i.backup ? '· ' : '❌'} ${i.rel}${i.backup ? '  (백업 — 경고만)' : '  ★정본 없는 파일'}`)
  }
  if (bad) console.log('  조치 — repo 에서 의도적으로 지운 것이면 런타임에서도 삭제할 것. 아니면 repo 에 되살릴 것.')
  else console.log('  전부 백업 파일입니다 — 판정에는 넣지 않습니다. 거슬리면 지워도 됩니다.')
}

// ── 은퇴한 설치 스크립트 ─────────────────────────────────────────────────
// Z: 에 남아 있으면 누군가 실행한다. install-cut-panel.ps1 은 은퇴한 확장을 되살려
// 같은 기능이 두 개가 되고, 그 상태는 위 dupExts 그물에 걸린다(원인은 여기인데 증상은 저기다).
if (retired.length) {
  console.log(`\n❌ 정본 없는 설치 스크립트 ${retired.length}건 — repo 에 대응 파일이 없습니다.`)
  for (const n of retired) console.log(`  ${Z_SCRIPTS}\\${n}`)
  console.log('  조치 — 은퇴본이면 Z: 에서 치울 것(백업 폴더로 이동):')
  console.log(`    powershell -Command "Move-Item '${Z_SCRIPTS}\\install-cut-panel.*' '${Z_SCRIPTS}\\_retired\\' -Force"`)
}

if (!drifted.length && !twinBad.length && !dupExts.length && !orphanBad.length && !retired.length) {
  console.log('\n✅ 드리프트 없음 — repo와 런타임이 일치합니다.\n')
  process.exit(0)
}
if (!drifted.length) process.exit(1)

console.log(`\n❌ 드리프트 ${drifted.length}건`)
const agentDrift = drifted.filter((d) => d.axis === 'agent')
const zDrift = drifted.filter((d) => d.axis !== 'agent')

if (agentDrift.length) {
  console.log('\n[축1 조치] JSX는 .csproj CopyToOutputDirectory=Always 라 **빌드하면 자동 복사**된다:')
  console.log('    dotnet build IllustratorAutomat/IllustratorAutomat.csproj -c Release -r win-x64')
  console.log('  ⚠️ 에이전트 실행 중이면 exe 잠김으로 빌드 실패 → 중지 후 빌드·재시작.')
  console.log('  JSX만 급히 반영하려면(에이전트 재시작 불필요 — 잡마다 파일을 새로 읽음):')
  console.log('    node scripts/ia-jsx-audit.cjs --sync-agent')
}
if (zDrift.length) {
  const inst = zDrift.filter((d) => d.axis === 'installed')
  const zOnly = zDrift.filter((d) => d.axis !== 'installed')
  if (zOnly.length) {
    console.log('\n[축2·축3·축5 조치] Z: 교체 = `npm run ia:deploy` (백업 → 복사 → 재감사).')
    console.log('  축2(로직)는 스텁 evalFile 이라 전 PC 즉시 반영 — 자동 동기화하지 않는다.')
    for (const d of zOnly) console.log(`    ${d.panel ? `[${d.panel.ext}] ` : ''}${d.rel}  (${d.state})`)
    if (zOnly.some((d) => d.axis === 'tool')) {
      console.log('  ★축5(설치 스크립트)가 낡으면 **디자이너가 낡은 설치기를 돌린다** — 껍데기가 아니라 배포 절차 자체가 구버전이 된다.')
    }
  }
  if (inst.length) {
    console.log('\n[축4 조치] 이 PC 패널 설치본이 낡았다 = 껍데기 수정이 일러에 반영되지 않는다.')
    console.log('  설치 스크립트 재실행(관리자 권한 불요, 기존은 자동 백업):')
    // 패널이 여러 개이므로 드리프트가 난 패널의 설치 스크립트만 안내한다.
    const byPanel = new Map()
    for (const d of inst) {
      const key = d.panel ? d.panel.ext : '(unknown)'
      if (!byPanel.has(key)) byPanel.set(key, { install: d.panel ? d.panel.install : 'install-a0-panel.ps1', rows: [] })
      byPanel.get(key).rows.push(d)
    }
    for (const [ext, g] of byPanel) {
      console.log(`    [${ext}] powershell -ExecutionPolicy Bypass -File "${Z_SCRIPTS}\\${g.install}"`)
      for (const d of g.rows) console.log(`        ${d.rel}  (${d.state})`)
    }
    console.log('  → 실행 후 일러스트레이터 재시작(패널 재로드) 필요.')
  }
}

if (SYNC_AGENT && agentDrift.length) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
  console.log('\n▸ --sync-agent 실행')
  for (const d of agentDrift) {
    const src = path.join(IA, d.rel)
    const dst = path.join(agent.dir, d.rel)
    if (!fs.existsSync(src)) { console.log(`  건너뜀 ${d.rel} — repo에 없음`); continue }
    try {
      if (fs.existsSync(dst)) fs.copyFileSync(dst, `${dst}.bak-${ts}`)
      fs.copyFileSync(src, dst)
      console.log(`  ✅ ${d.rel} 복사 완료 (백업 ${path.basename(dst)}.bak-${ts})`)
    } catch (e) {
      console.log(`  ❌ ${d.rel} 복사 실패: ${e.message}`)
    }
  }
  console.log('  재감사: node scripts/ia-jsx-audit.cjs')
}

process.exit(1)
