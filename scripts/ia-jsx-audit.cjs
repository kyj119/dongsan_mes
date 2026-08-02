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
// CEP 패널 배포 산출물.
//   ⚠️ `.debug` 는 여태 "로컬 디버그 플래그"라며 제외돼 있었지만 **전제가 틀렸다**(2026-07-30 실측):
//      install-a0-panel.ps1 이 폴더째 복사하므로 Z: 배포본과 각 PC 설치본에 **실제로 들어가 있다**.
//      삭제하지는 않는다 — CDP 원격 디버깅(핫스왑)이 이 파일에 의존하고, 손이 닿지 않는 디자이너 PC를
//      진단할 때 그게 유일한 수단이다([[reference-cep-hotswap]]). 대신 **추적 대상에 넣어**
//      조용히 드리프트하지 못하게 한다(감사 목록에 없으면 바뀌어도 아무도 모른다).
const PANEL_FILES = [
  'index.html',
  'css/style.css',
  'CSXS/manifest.xml',
  'js/CSInterface.js',
  'js/main.js',
  'jsx/host.jsx',
  '.debug',
]
// 패널별 추가 파일 — 모든 패널이 같은 구성을 갖지는 않는다.
//   재단 패널의 geometry.js 는 **칼선 기하 정본**이자 Node 하네스(cut:bench)의 검증 대상이다.
//   여기 없으면 이 파일만 조용히 낡아 "하네스는 통과하는데 패널은 옛 코드"가 된다.
//   A0 패널도 geometry.js 를 쓴다(묶음분리·자동감지의 잉크 실루엣, 2026-07-31) — **재단 패널의 사본**이다.
const PANEL_EXTRA = { cut: ['js/geometry.js', 'js/nesting.js'], a0: ['js/geometry.js'] }
// geometry.js 정본 = 재단 패널 것. Node 하네스(cut:bench·cut:nest)가 **그 파일을** 로드해 검증하므로
// "검증한 코드 = 배포된 코드"가 성립한다. A0 사본이 갈라지면 그 등식이 조용히 깨진다(A0 쪽은
// 검증된 적 없는 코드가 도는데 하네스는 계속 통과한다) → 바이트 동일을 강제한다.
const GEOM_CANON = { panel: 'cut', rel: 'js/geometry.js', copies: ['a0'] }
// ── 패널 레지스트리 ────────────────────────────────────────────────
// 패널은 **여러 개**다(2026-07-31~): A0 패널 + 재단 패널(분리 개발 → 병합 예정).
// 하드코딩 1개였을 때는 새 패널이 감사망 밖이라 조용히 드리프트했다 — 여기에 등록하면 축3·축4가 함께 붙는다.
//   repo 폴더가 없으면 자동 skip(미착수 패널을 '없음'으로 실패시키지 않는다).
// 정본 spec = docs/superpowers/specs/2026-07-31-cut-file-panel.md §5.2-③
const PANELS = [
  { id: 'a0', ext: 'com.mes.a0.panel', repo: path.join(IA, 'designer', 'poc-a0-cep', 'com.mes.a0.panel'), zSub: 'a0-panel', install: 'install-a0-panel.ps1' },
  { id: 'cut', ext: 'com.mes.cut.panel', repo: path.join(IA, 'designer', 'cut-panel', 'com.mes.cut.panel'), zSub: 'cut-panel', install: 'install-cut-panel.ps1' },
].filter((p) => fs.existsSync(p.repo))

// 축4: 이 PC에 실제로 설치돼 일러가 읽는 패널. install-*.ps1 의 설치 위치와 동일.
const installedDir = (ext) => (process.env.APPDATA
  ? path.join(process.env.APPDATA, 'Adobe', 'CEP', 'extensions', ext)
  : '')

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
const axes = [
  compare('agent', `축1 에이전트 JSX ${agent.live ? '(실행 중 프로세스 실측)' : '(미실행 — 기본 빌드 경로 추정)'}`, AGENT_JSX, IA, agent.dir),
  compare('designer', '축2 디자이너 JSX (Z: 정본)', DESIGNER_JSX, path.join(IA, 'designer'), Z_SCRIPTS),
  ...PANELS.flatMap((p) => {
    const files = PANEL_FILES.concat(PANEL_EXTRA[p.id] || [])
    return [
      compare('panel', `축3 CEP 패널 배포본 [${p.ext}] (Z: 정본)`, files, p.repo, path.join(Z_SCRIPTS, p.zSub, p.ext), p),
      compare('installed', `축4 CEP 패널 설치본 [${p.ext}] (이 PC · 일러가 실제로 읽는 것)`, files, p.repo, installedDir(p.ext) || path.join(REPO, '__no_appdata__'), p),
    ]
  }),
]

const drifted = axes.flatMap((ax) => ax.rows.filter((r) => r.state !== '동일').map((r) => ({ axis: ax.axis, panel: ax.panel, ...r })))

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
  console.log(JSON.stringify({ agentDir: agent.dir, agentLive: agent.live, axes, drifted, twins, twinBad, dupExts }, null, 2))
  process.exit(drifted.length || twinBad.length || dupExts.length ? 1 : 0)
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

if (!drifted.length && !twinBad.length && !dupExts.length) {
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
    console.log('\n[축2·축3 조치] Z: 교체. 축2(로직)는 스텁 evalFile 이라 전 PC 즉시 반영 — 자동 동기화하지 않는다.')
    console.log('  백업 → 복사 → 재감사 순서로 수동 진행:')
    for (const d of zOnly) console.log(`    ${d.panel ? `[${d.panel.ext}] ` : ''}${d.rel}  (${d.state})`)
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
