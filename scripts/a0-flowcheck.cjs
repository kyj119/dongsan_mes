#!/usr/bin/env node
/**
 * A0 가공 플로우 실측 — **한 건 돌린 뒤 이것만 보면 된다** (2026-09-15)
 *
 * ★왜 있나 — 실기 진단이 여태 사람 눈에 기대고 있었다. 패널 화면 한 장, Z: 탐색기 한 번,
 *   MES 대기함 한 번을 사람이 따로 보고 머릿속에서 합쳤다. 그래서 「등록은 됐는데 재단기에
 *   파일이 없다」처럼 **축 사이에서 빠지는 것**이 여러 사이클 동안 안 보였다(2026-09-15 실측).
 *   이건 게이트가 아니라 **계측기**다 — Z: 를 읽으므로 CI 에 못 넣는다. 사람이 부를 때 돈다.
 *
 * ★무엇을 재나 — 작업 폴더 하나를 「플로우가 끝났는가」로 판정한다.
 *   커밋(manifest) → 수령(.ingested) → 픽업(`_출력/<날짜>`) 세 관문과, 각 단계가 Z: 에 쓴 바이트.
 *
 * 사용:
 *   node scripts/a0-flowcheck.cjs              최근 5건
 *   node scripts/a0-flowcheck.cjs --n=20       최근 20건
 *   node scripts/a0-flowcheck.cjs --since=20260915
 *   node scripts/a0-flowcheck.cjs --pc=DESKTOP-6JSH6OL
 *
 * 종료코드: 커밋이 끝난 건에서 픽업이 비었으면 1(그게 현장에 파일이 없는 상태다).
 */
const fs = require('fs')
const path = require('path')

const ROOT = process.env.MES_IA_ROOT || 'Z:\\DESIGNS\\IA-등록'
const OUT_ROOT = path.join(ROOT, '_출력')
const MB = 1048576

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith('--' + k + '='))
  return hit ? hit.slice(k.length + 3) : d
}
const N = parseInt(arg('n', '5'), 10)
const SINCE = arg('since', '')
const PC = arg('pc', '')

const C = process.stdout.isTTY
  ? { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, d: (s) => `\x1b[90m${s}\x1b[0m` }
  : { g: (s) => s, r: (s) => s, y: (s) => s, d: (s) => s }

if (!fs.existsSync(ROOT)) {
  console.log(C.r(`Z: 등록 루트를 못 읽습니다 — ${ROOT}`))
  console.log(C.d('  NAS 연결을 확인하거나 MES_IA_ROOT 로 경로를 지정하세요.'))
  process.exit(2)
}

// 폴더명 규약 = `<YYYYMMDD>_<HHMMSS>_<PC>_<일련>` (mes-a0-host / mes-cut-host 공통)
// ★전체 목록을 따로 들고 있는다 — 픽업 이름 충돌의 **상대**는 화면에 안 뜨는 폴더일 수 있다.
const jobsAll = fs.readdirSync(ROOT).filter((n) => /^\d{8}_\d{6}_/.test(n)).sort()
const jobs = jobsAll
  .filter((n) => (SINCE ? n.slice(0, 8) >= SINCE : true))
  .filter((n) => (PC ? n.includes(PC) : true))
  .sort()
  .slice(-N)

if (!jobs.length) {
  console.log(C.y('대상 폴더가 없습니다.'))
  process.exit(0)
}

const size = (p) => { try { return fs.statSync(p).size } catch { return -1 } }

let broken = 0
const totals = { eps: 0, thumb: 0, workai: 0, manifest: 0, n: 0 }

console.log(`\nA0 가공 플로우 — ${ROOT}  (${jobs.length}건)\n`)

for (const name of jobs) {
  const dir = path.join(ROOT, name)
  const ymd = name.slice(0, 8)
  const pc = (name.split('_')[2] || '?')
  let files = []
  try { files = fs.readdirSync(dir) } catch { /* ignore: 읽는 도중 지워질 수 있다 — 아래 빈 목록으로 흘러 "잔해"로 잡힌다 */ }

  const mf = files.includes('manifest.json')
  const ingested = files.some((f) => f.startsWith('.ingested'))
  const rejected = files.some((f) => f.startsWith('.rejected'))
  const eps = files.filter((f) => /\.eps$/i.test(f))
  const dxf = files.filter((f) => /\.dxf$/i.test(f))
  const workai = files.filter((f) => /\.ai$/i.test(f))
  const thumbs = files.filter((f) => /^thumb.*\.png$/i.test(f))

  // manifest 가 선언한 mode — 모아찍기(impose)만 work.ai 가 정상이다.
  let mode = '?'
  if (mf) {
    try { mode = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).mode || '?' } catch { /* ignore: 깨진 manifest 는 아래 커밋 관문에서 잡힌다 */ }
  }

  // 픽업 = `_출력/<날짜>/<EPS 이름>`. **바이트까지** 같아야 한다 — 잘린 사본을 재단기가 집어 간다.
  // ★크기가 다르면 「잘렸다」가 아니라 **이름 충돌**일 수 있다 (2026-09-15 실측).
  //   픽업 폴더는 날짜당 하나이고 파일명에 주문번호가 없어서(§재작업 패널 축), 같은 디자인을
  //   같은 날 두 번 등록하면 **두 등록이 같은 이름을 놓고 덮어쓴다** — 재단기에는 나중 것 하나만 남는다.
  //   그래서 다른 폴더에 같은 이름·그 크기가 있으면 그건 「빠진 것」이 아니라 「뺏긴 것」이다. 구분해서 말한다.
  const pick = eps.map((f) => {
    const src = size(path.join(dir, f))
    const dst = size(path.join(OUT_ROOT, ymd, f))
    if (dst > 0 && dst === src) return { f, src, dst, state: 'ok' }
    if (dst < 0) return { f, src, dst, state: 'missing' }
    const rival = jobsAll.find((j) => j !== name && j.slice(0, 8) === ymd && size(path.join(ROOT, j, f)) === dst)
    return { f, src, dst, state: rival ? 'clash' : 'partial', rival }
  })

  const epsB = eps.reduce((a, f) => a + Math.max(0, size(path.join(dir, f))), 0)
  const thB = thumbs.reduce((a, f) => a + Math.max(0, size(path.join(dir, f))), 0)
  const aiB = workai.reduce((a, f) => a + Math.max(0, size(path.join(dir, f))), 0)
  const mfB = mf ? Math.max(0, size(path.join(dir, 'manifest.json'))) : 0
  totals.eps += epsB; totals.thumb += thB; totals.workai += aiB; totals.manifest += mfB; totals.n++

  // ── 관문 판정 ──
  const notes = []
  let bad = false
  if (!mf) { notes.push(C.r('커밋 없음(잔해) — 에이전트는 영원히 안 읽는다')); bad = true }
  else if (!ingested && !rejected) notes.push(C.y('MES 미반영 — 에이전트 수령 대기'))
  else if (rejected) { notes.push(C.r('에이전트가 거절')); bad = true }

  if (mf && eps.length === 0 && mode !== 'impose') { notes.push(C.r('EPS 없음 — 출력할 것이 없다')); bad = true }

  let clashed = false
  for (const p of pick) {
    if (p.state === 'ok') continue
    // 커밋 전이면 아직 차례가 아니다 — 픽업은 에이전트가 커밋을 읽은 뒤에 한다.
    if (!(mf && (ingested || rejected))) { notes.push(C.d('픽업 대기(커밋 전)')); continue }
    if (p.state === 'clash') {
      clashed = true
      notes.push(C.y(`픽업 이름 충돌 — _출력\\${ymd}\\${p.f} 는 ${p.rival} 것이다(이 건은 덮였다)`))
      notes.push(C.d('  파일명에 주문번호가 없어 같은 날 같은 디자인은 한 자리를 다툰다 — 재단기엔 하나만 간다'))
    } else if (p.state === 'missing') {
      notes.push(C.r(`픽업 없음 — _출력\\${ymd}\\${p.f} (원본 ${p.src}B)`)); bad = true
    } else {
      notes.push(C.r(`픽업 잘림 — _출력\\${ymd}\\${p.f} ${p.dst}B vs 원본 ${p.src}B`)); bad = true
    }
  }

  // work.ai = 단건에서는 **낭비**다(호스트 0.16.0 부터 안 쓴다). 모아찍기는 그것이 산출물이라 정상.
  if (workai.length && mode !== 'impose') {
    notes.push(C.y(`work.ai ${(aiB / MB).toFixed(1)}MB — 단건엔 불필요(구 호스트가 돈 폴더)`))
  }

  if (bad) broken++
  const gate = !mf ? C.r('✗커밋') : (rejected ? C.r('✗거절') : (ingested ? C.g('✓수령') : C.y('…대기')))
  const pickTxt = pick.length === 0 ? C.d('—')
    : pick.every((p) => p.state === 'ok') ? C.g('✓픽업')
      : !(mf && ingested) ? C.d('…픽업')
        : clashed && !bad ? C.y('~픽업') : C.r('✗픽업')

  const zB = epsB + thB + aiB + mfB
  console.log(`${gate} ${pickTxt}  ${name}  ${C.d(mode)}`)
  console.log(`      EPS ${(epsB / MB).toFixed(1)}MB${dxf.length ? ' +DXF' : ''} · thumb ${(thB / 1024).toFixed(0)}KB` +
    `${aiB ? ` · work.ai ${(aiB / MB).toFixed(1)}MB` : ''} · Z: 쓰기 합 ${C.y((zB / MB).toFixed(1) + 'MB')}  ${C.d(pc)}`)
  for (const n of notes) console.log('      ' + n)
}

// ── 합계 = 「플로우가 얼마나 콤팩트한가」의 눈금 ──
const z = totals.eps + totals.thumb + totals.workai + totals.manifest
console.log(`\n합계 ${totals.n}건 · Z: 쓰기 ${(z / MB).toFixed(1)}MB` +
  `  (EPS ${(totals.eps / MB).toFixed(1)} · thumb ${(totals.thumb / MB).toFixed(1)} · work.ai ${C.y((totals.workai / MB).toFixed(1))} · manifest ${(totals.manifest / MB).toFixed(2)})`)
if (totals.workai > 0) {
  console.log(C.d(`  work.ai 비중 ${Math.round(100 * totals.workai / z)}% — 호스트 0.16.0 배포 뒤 새 단건에서는 0 이어야 한다.`))
}
// ⚠️ 픽업 사본은 이 합계에 없다 — 같은 Z: 안의 **복사본**이라 읽기+쓰기 왕복이 따로 붙는다(EPS 크기만큼).
console.log(C.d(`  ※ 픽업 사본(_출력)은 위 합계 밖 — 같은 크기의 Z:→Z: 왕복이 건당 한 번 더 붙는다(에이전트가 한다).`))

if (broken) { console.log(C.r(`\n❌ 흐름이 끊긴 건 ${broken}건 — 위 사유를 보세요.`)); process.exit(1) }
console.log(C.g('\n✓ 검사한 건 전부 커밋→수령→픽업까지 닿았습니다.'))
