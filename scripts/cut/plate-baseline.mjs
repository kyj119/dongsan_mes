/**
 * 전사 판 ↔ 실측 대조 — `npm run cut:plate:baseline`
 *
 * 기준선 = `scripts/plate-baseline.json` (2026-08 완성본 실측 + 작업지시서 대조).
 *
 * ★두 가지를 따로 본다. 섞으면 게이트가 무뎌진다.
 *   ① **회귀** — 산식 출력이 frozen 과 같은가. 규칙 값이나 산식을 건드리면 여기서 걸린다.
 *   ② **드리프트** — 산식과 실측의 차이가 기록된 범위(maxDiffMm) 안인가. 새 사례가 어긋나면 걸린다.
 *
 * ★measured 가 정답이 아니다. 현행 작업은 세로 보정을 비율이 아니라 +30.36 고정으로 준 흔적이 있고
 *   (60-150 에서 특히 드러난다), 용준님 확인 결과 그건 인수인계에 180↔150 차이가 고지되지 않은 탓이다.
 *   **그래서 산식을 실측에 맞추지 않는다** — 차이는 `deviations` 에 사유와 함께 적어 두고,
 *   거기서 벗어나는 것만 잡는다(`stock-ledger-baseline` 과 같은 방식).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const PANEL = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js')
const load = (f) => import('file://' + path.join(PANEL, f).replace(/\\/g, '/'))

await load('plate-rules.js')
await load('plate.js')
const P = globalThis.MesPlate

const BASE = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'plate-baseline.json'), 'utf8'))
const TOL = BASE.maxDiffMm

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n          ← ' + extra : '')) }
}
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol

console.log('\n전사 판 ↔ 2026-08 실측 대조\n' + '='.repeat(72))
console.log(`기준선 ${BASE.cases.length}건 · 편차 기록 ${BASE.deviations.length}건 · 거절 ${BASE.rejected.length}건 · 허용오차 ${TOL}mm\n`)

// ── ① 회귀 — 산식 출력이 frozen 과 같은가
console.log('[회귀] 산식 출력이 frozen 과 같은가')
for (const c of BASE.cases) {
  const r = P.computePlate(c.input)
  if (!r.ok) { ok(c.name, false, '산식이 거절했다: ' + r.reason); continue }
  const got = { plateW: r.plate.w, plateH: r.plate.h, bandH: r.bands[0].h, panelH: r.panels[0].h, seamActual: r.trace.seamActual }
  const bad = Object.keys(c.frozen).filter((k) => !near(got[k], c.frozen[k]))
  ok(c.name, bad.length === 0, bad.map((k) => `${k} ${got[k]} ≠ ${c.frozen[k]}`).join(' · '))
}

// ── ② 드리프트 — 산식과 실측의 차이
console.log('\n[드리프트] 산식 ↔ 실측 차이가 ' + TOL + 'mm 이내인가')
for (const c of BASE.cases) {
  const r = P.computePlate(c.input)
  if (!r.ok) continue
  const got = { plateW: r.plate.w, plateH: r.plate.h, bandH: r.bands[0].h, panelH: r.panels[0].h }
  const over = Object.keys(c.measured)
    .filter((k) => got[k] !== undefined && Math.abs(got[k] - c.measured[k]) > TOL)
    .map((k) => `${k} 산식 ${got[k]} vs 실측 ${c.measured[k]} (차 ${(got[k] - c.measured[k]).toFixed(2)})`)
  const worst = Math.max(...Object.keys(c.measured).filter((k) => got[k] !== undefined)
    .map((k) => Math.abs(got[k] - c.measured[k])))
  ok(`${c.name}  최대차 ${worst.toFixed(2)}mm`, over.length === 0, over.join(' · '))
}

// ── ③ 거절 — 모르는 축은 만들지 않는다
console.log('\n[거절] 규칙이 닫히지 않은 축은 만들지 않는가')
for (const c of BASE.rejected) {
  const r = P.computePlate(c.input)
  ok(`${c.name} → ${c.expectCode}`, r.ok === false && r.code === c.expectCode,
    r.ok ? '거절하지 않고 판을 만들었다: ' + JSON.stringify(r.plate) : `code=${r.code}`)
}

// ── ④ 편차 기록 — 실패로 세지 않는다. 다만 **커지면** 알린다.
console.log('\n[편차 기록] 현행 작업이 규칙과 다른 자리 — 실패로 세지 않는다')
for (const d of BASE.deviations) {
  const r = P.computePlate(d.input)
  if (!r.ok) { console.log(`  SKIP  ${d.name} — 산식이 거절: ${r.reason}`); continue }
  const diff = r.plate.h - d.measured.plateH
  const grew = Math.abs(diff) > Math.abs(d.diffMm) + TOL
  console.log(`  ${grew ? 'WARN ' : 'NOTE '} ${d.name}`)
  console.log(`          산식 ${r.plate.h} vs 실측 ${d.measured.plateH} → 차 ${diff.toFixed(2)}mm (기록 ${d.diffMm}mm)`)
  console.log(`          ${d.why}`)
  if (grew) { fail++; console.log('          ← 기록된 편차보다 커졌다. 기준선을 다시 보라.') }
}

console.log('\n' + '='.repeat(72))
console.log(fail ? `실패 ${fail} / 검사 ${pass + fail}` : `전 항목 통과 (${pass})`)
process.exit(fail ? 1 : 0)
