#!/usr/bin/env node
// L1 네스팅 패킹 하네스 — src/scripts/iaEditor.js의 iaeShelfBinPack / iaeMaxRectsPack 순수함수 검증
// 실행: node scripts/nesting-harness.mjs [--cases=200] [--seed=1000] [--out=<json경로>]
// 판정(하드):
//   R1 전수배치 — 입력 전 항목이 정확히 1회씩 배치
//   R2 치수정합 — 배치 치수=원본(w,h) 또는 rotated=true면 스왑. allowRotate=false면 rotated 금지
//   R3 경계 — 0 ≤ x, y / x+w ≤ availableWidth (+eps)
//   R4 겹침·간격 — 쌍별 ink 분리거리 ≥ gap (한 축이라도)
//   R5 에러정당성 — '폭보다 큽니다' 에러는 실제 폭초과 항목이 있을 때만
// 판정(경고):
//   W1 total_height_cm ≠ max(y+h) (재료 소요 길이 과소/과대 보고)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '..', 'src', 'scripts', 'iaEditor.js')
const EPS = 1e-4

// ── 함수 추출 (?raw 전역 스크립트라 import 불가 → 소스에서 브레이스 매칭으로 절취) ──
const code = readFileSync(SRC, 'utf8')
function extractFn(name) {
  const idx = code.indexOf('function ' + name + '(')
  if (idx < 0) throw new Error('함수 없음: ' + name)
  const open = code.indexOf('{', idx)
  let depth = 0
  for (let j = open; j < code.length; j++) {
    const ch = code[j]
    if (ch === '"' || ch === "'") {
      const q = ch
      j++
      while (j < code.length && code[j] !== q) { if (code[j] === '\\') j++; j++ }
      continue
    }
    if (ch === '/' && code[j + 1] === '/') { while (j < code.length && code[j] !== '\n') j++; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return code.slice(idx, j + 1) }
  }
  throw new Error('브레이스 불일치: ' + name)
}
const factory = new Function(
  extractFn('iaeShelfBinPack') + '\n' + extractFn('iaeMaxRectsPack') +
  '\nreturn { shelf: iaeShelfBinPack, maxrects: iaeMaxRectsPack };'
)
const packers = factory()

// ── 검증기 ──
function sepGap(a, b) {
  // 두 배치의 ink 분리거리: x/y축 각각 (양수=떨어짐, 음수=겹침). 한 축이라도 gap 이상이면 통과
  const gx = Math.max(b.x_cm - (a.x_cm + a.width_cm), a.x_cm - (b.x_cm + b.width_cm))
  const gy = Math.max(b.y_cm - (a.y_cm + a.height_cm), a.y_cm - (b.y_cm + b.height_cm))
  return Math.max(gx, gy)
}
function validate(caseRef, items, res, W, gap, allowRotate) {
  const errs = [], warns = []
  const infeasible = items.filter((it) => (allowRotate ? Math.min(it.w, it.h) : it.w) > W + EPS)
  if (res.error) {
    if (infeasible.length === 0) errs.push({ rule: 'R5', msg: '부당 에러(전 항목 폭 이내인데 에러): ' + res.msg })
    return { errs, warns }
  }
  if (infeasible.length > 0) {
    errs.push({ rule: 'R5', msg: '폭초과 항목 ' + infeasible.length + '개인데 성공 반환' })
  }
  const ps = res.placements || []
  // R1 전수배치
  const seen = new Map()
  for (const p of ps) seen.set(p.id, (seen.get(p.id) || 0) + 1)
  for (const it of items) {
    const n = seen.get(it.id) || 0
    if (n !== 1) errs.push({ rule: 'R1', msg: 'id=' + it.id + ' 배치횟수 ' + n })
  }
  if (ps.length !== items.length) errs.push({ rule: 'R1', msg: '배치수 ' + ps.length + ' ≠ 입력수 ' + items.length })
  // R2 치수·회전
  const byId = new Map(items.map((it) => [it.id, it]))
  for (const p of ps) {
    const it = byId.get(p.id)
    if (!it) { errs.push({ rule: 'R2', msg: '미지의 id=' + p.id }); continue }
    const asIs = Math.abs(p.width_cm - it.w) < 1e-9 && Math.abs(p.height_cm - it.h) < 1e-9
    const swapped = Math.abs(p.width_cm - it.h) < 1e-9 && Math.abs(p.height_cm - it.w) < 1e-9
    if (p.rotated ? !swapped : !asIs) errs.push({ rule: 'R2', msg: 'id=' + p.id + ' 치수 불일치 rotated=' + p.rotated + ' → ' + p.width_cm + '×' + p.height_cm + ' (원본 ' + it.w + '×' + it.h + ')' })
    if (!allowRotate && p.rotated) errs.push({ rule: 'R2', msg: 'id=' + p.id + ' 회전 금지 위반' })
  }
  // R3 경계
  for (const p of ps) {
    if (p.x_cm < -EPS || p.y_cm < -EPS) errs.push({ rule: 'R3', msg: 'id=' + p.id + ' 음수좌표 (' + p.x_cm.toFixed(3) + ',' + p.y_cm.toFixed(3) + ')' })
    if (p.x_cm + p.width_cm > W + EPS) errs.push({ rule: 'R3', msg: 'id=' + p.id + ' 폭 이탈 x+w=' + (p.x_cm + p.width_cm).toFixed(3) + ' > ' + W })
  }
  // R4 겹침·간격
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const s = sepGap(ps[i], ps[j])
      if (s < gap - EPS) {
        errs.push({
          rule: 'R4',
          msg: (s < -EPS ? '겹침' : '간격위반') + ' ' + ps[i].id + '↔' + ps[j].id + ' 분리 ' + s.toFixed(3) + 'cm < gap ' + gap +
            ' | ' + JSON.stringify(ps[i]) + ' vs ' + JSON.stringify(ps[j])
        })
      }
    }
  }
  // W1 total_height
  const bottom = ps.reduce((m, p) => Math.max(m, p.y_cm + p.height_cm), 0)
  if (Math.abs((res.total_height_cm || 0) - bottom) > EPS) {
    warns.push({ rule: 'W1', msg: 'total_height_cm=' + (res.total_height_cm || 0).toFixed(3) + ' ≠ 실제 하단 ' + bottom.toFixed(3) + ' (차 ' + ((res.total_height_cm || 0) - bottom).toFixed(3) + 'cm)' })
  }
  return { errs, warns }
}

// ── 케이스 생성 ──
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] ?? true] : [a, true]
}))
const N_CASES = parseInt(args.cases, 10) || 200
const SEED = parseInt(args.seed, 10) || 1000

const WIDTHS = [90, 120, 150, 180, 250, 300, 500]
const GAPS = [0, 0.3, 0.5, 1]
const cases = []
for (let c = 0; c < N_CASES; c++) {
  const rnd = mulberry32(SEED + c)
  const W = WIDTHS[Math.floor(rnd() * WIDTHS.length)]
  const gap = GAPS[Math.floor(rnd() * GAPS.length)]
  const allowRotate = rnd() < 0.7
  const n = 1 + Math.floor(rnd() * 40)
  const items = []
  for (let i = 0; i < n; i++) {
    // 10%는 의도적 폭초과 후보(에러 경로 검증)
    const wMax = rnd() < 0.9 ? W * 0.9 : W * 1.4
    items.push({
      id: 'i' + i,
      w: +(5 + rnd() * Math.max(5, wMax - 5)).toFixed(1),
      h: +(5 + rnd() * 295).toFixed(1)
    })
  }
  cases.push({ ref: 'rand#' + c + '(seed=' + (SEED + c) + ')', items, W, gap, allowRotate })
}
// 실사례 (현장 규격)
const real = [
  { ref: 'real:배너 60×180 ×20 롤150', items: Array.from({ length: 20 }, (_, i) => ({ id: 'b' + i, w: 60, h: 180 })), W: 150, gap: 0.3, allowRotate: true },
  { ref: 'real:현수막 490×90 ×5 롤500', items: Array.from({ length: 5 }, (_, i) => ({ id: 'h' + i, w: 490, h: 90 })), W: 500, gap: 0.5, allowRotate: true },
  {
    ref: 'real:혼합 임포지션 롤250',
    items: [
      ...Array.from({ length: 3 }, (_, i) => ({ id: 'a' + i, w: 120, h: 80 })),
      ...Array.from({ length: 8 }, (_, i) => ({ id: 'c' + i, w: 45, h: 45 })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 'd' + i, w: 90, h: 60 })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: 'e' + i, w: 30, h: 120 }))
    ],
    W: 250, gap: 0.3, allowRotate: true
  },
  { ref: 'real:근접폭 149.7×100 롤150', items: [{ id: 'x0', w: 149.7, h: 100 }], W: 150, gap: 0.3, allowRotate: true },
  { ref: 'real:회전금지 세로배너 45×160 ×12 롤150', items: Array.from({ length: 12 }, (_, i) => ({ id: 'v' + i, w: 45, h: 160 })), W: 150, gap: 0.5, allowRotate: false }
]
cases.push(...real)

// ── 실행 ──
const summary = {}
const failures = []
for (const name of ['shelf', 'maxrects']) {
  summary[name] = { cases: 0, ok: 0, hardFail: 0, warnOnly: 0, byRule: {} }
  for (const cs of cases) {
    summary[name].cases++
    let res
    try {
      res = packers[name](cs.items.map((it) => ({ ...it })), cs.W, cs.gap, cs.allowRotate)
    } catch (e) {
      summary[name].hardFail++
      summary[name].byRule.EXCEPTION = (summary[name].byRule.EXCEPTION || 0) + 1
      failures.push({ packer: name, ref: cs.ref, rule: 'EXCEPTION', msg: String(e && e.stack || e), case: cs })
      continue
    }
    const { errs, warns } = validate(cs.ref, cs.items, res, cs.W, cs.gap, cs.allowRotate)
    if (errs.length) {
      summary[name].hardFail++
      for (const e of errs) {
        summary[name].byRule[e.rule] = (summary[name].byRule[e.rule] || 0) + 1
        failures.push({ packer: name, ref: cs.ref, rule: e.rule, msg: e.msg, case: cs })
      }
    } else if (warns.length) {
      summary[name].warnOnly++
      for (const w of warns) {
        summary[name].byRule[w.rule] = (summary[name].byRule[w.rule] || 0) + 1
        failures.push({ packer: name, ref: cs.ref, rule: w.rule, msg: w.msg, warn: true })
      }
    } else summary[name].ok++
  }
}

// 효율 비교 (정보성 — 실사례만)
console.log('── 효율 비교 (실사례, total_height_cm · 낮을수록 촘촘) ──')
for (const cs of real) {
  const a = packers.shelf(cs.items.map((it) => ({ ...it })), cs.W, cs.gap, cs.allowRotate)
  const b = packers.maxrects(cs.items.map((it) => ({ ...it })), cs.W, cs.gap, cs.allowRotate)
  const fmt = (r) => (r.error ? 'ERR' : r.total_height_cm.toFixed(1))
  console.log('  ' + cs.ref + ' → shelf ' + fmt(a) + ' / maxrects ' + fmt(b))
}

console.log('\n── 판정 요약 ──')
for (const name of ['shelf', 'maxrects']) {
  const s = summary[name]
  console.log(`  ${name.padEnd(8)} 케이스 ${s.cases} · 통과 ${s.ok} · 하드실패 ${s.hardFail} · 경고만 ${s.warnOnly} · 규칙별 ${JSON.stringify(s.byRule)}`)
}

const hard = failures.filter((f) => !f.warn)
if (failures.length) {
  console.log('\n── 상세 (하드실패 우선 · 최대 12건 표시) ──')
  for (const f of [...hard, ...failures.filter((x) => x.warn)].slice(0, 12)) {
    console.log(`  [${f.packer}][${f.rule}]${f.warn ? '(warn)' : ''} ${f.ref}\n    ${f.msg}`)
  }
  const outPath = args.out || path.join(__dirname, '..', 'docs', 'audits', 'nesting-harness-failures.json')
  writeFileSync(outPath, JSON.stringify({ ranAt: new Date().toISOString(), seed: SEED, nCases: N_CASES, summary, failures }, null, 2))
  console.log('\n  전체 상세 → ' + outPath)
}
console.log(hard.length ? '\n결과: 하드실패 ' + hard.length + '건 — 위 상세 확인' : '\n결과: 하드실패 0 (겹침·경계·회전·전수배치 이상 없음)')
process.exit(hard.length ? 1 : 0)
