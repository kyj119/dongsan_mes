/**
 * 맞붙임 하네스 — `npm run cut:butt`
 *
 * 검증 대상 = 패널의 `js/butt.js` **그 파일**(검증한 코드 = 배포된 코드).
 * 판정은 전부 **손으로 셀 수 있는 값**이다 — 근사·허용오차가 없는 설계라서 그렇게 만들 수 있다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const SRC = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'butt.js')

// UMD — globalThis 에 붙는다
await import('file://' + SRC.replace(/\\/g, '/'))
const B = globalThis.MesCutButt

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '   ← ' + extra : '')) }
}
const seg = (s) => `${s.x1},${s.y1}-${s.x2},${s.y2}`

console.log('\n맞붙임 (js/butt.js)\n' + '='.repeat(52))

// ── ① 직사각 판정 ────────────────────────────────────────────────
{
  const full = { W: 10, H: 10, m: new Uint8Array(100).fill(1) }
  const half = { W: 10, H: 10, m: new Uint8Array(100) }
  for (let i = 0; i < 50; i++) half.m[i] = 1
  ok('꽉 찬 마스크 = 직사각', B.isRectish(full))
  ok('반만 찬 마스크 = 직사각 아님', !B.isRectish(half))
  // 안티앨리어싱으로 가장자리가 조금 비는 것은 직사각으로 봐야 한다
  const almost = { W: 100, H: 100, m: new Uint8Array(10000).fill(1) }
  for (let i = 0; i < 150; i++) almost.m[i] = 0        // 1.5% 결손
  ok('1.5% 결손도 직사각', B.isRectish(almost))
}

// ── ② 2×2 동일 조각 → 선분 6개 ────────────────────────────────────
// 100×50 짜리 4장을 폭 200 에 넣으면 2열 2행. 세로선 x=0,100,200 · 가로선 y=0,50,100 = 6.
{
  const r = B.packRects([0, 1, 2, 3].map((id) => ({ id, w: 100, h: 50 })), 200)
  ok('2×2 전부 배치', r.placements.length === 4 && r.unplaced.length === 0)
  ok('2×2 겹침 없음', !B.anyOverlap(r.placements))
  ok('2×2 사용 크기 200×100', r.usedW === 200 && r.usedH === 100, `${r.usedW}×${r.usedH}`)
  const s = B.cutSegments(r.placements)
  ok('2×2 선분 6개 (사각 4개=16 이 아니다)', s.length === 6, `${s.length}개: ${s.map(seg).join(' | ')}`)
  const vx = s.filter((q) => q.x1 === q.x2).map((q) => q.x1).sort((a, b) => a - b)
  const hy = s.filter((q) => q.y1 === q.y2).map((q) => q.y1).sort((a, b) => a - b)
  ok('세로선 x = 0·100·200', String(vx) === '0,100,200', String(vx))
  ok('가로선 y = 0·50·100', String(hy) === '0,50,100', String(hy))
  // 세로선은 두 행을 관통해 **끊기지 않아야** 한다 (끝점이 닿은 구간도 이었는가)
  const mid = s.find((q) => q.x1 === 100 && q.x2 === 100)
  ok('가운데 세로선이 0→100 으로 이어짐', mid && mid.y1 === 0 && mid.y2 === 100, mid ? seg(mid) : '없음')
}

// ── ③ 떨어져 있으면 합치지 않는다 ────────────────────────────────
// 배치를 손으로 만들어 사이를 띄운다 — 오차로 붙여 버리면 재단 위치가 옮겨진다.
{
  const pl = [{ id: 0, x: 0, y: 0, w: 100, h: 50 }, { id: 1, x: 100.5, y: 0, w: 100, h: 50 }]
  const s = B.cutSegments(pl)
  const vx = s.filter((q) => q.x1 === q.x2).map((q) => q.x1).sort((a, b) => a - b)
  ok('0.5mm 떨어지면 세로선 4개 유지', vx.length === 4, String(vx))
  ok('100 과 100.5 가 따로 남는다', vx.includes(100) && vx.includes(100.5), String(vx))
}

// ── ④ 서로 다른 직사각 2종 혼합 ──────────────────────────────────
// 폭 200 · 100×50 두 장 + 50×30 두 장.
//   높이 내림차순 → 100×50 두 장이 1행(y=0..50), 50×30 두 장이 2행(y=50..80)
{
  const r = B.packRects([
    { id: 'a0', w: 100, h: 50 }, { id: 'a1', w: 100, h: 50 },
    { id: 'b0', w: 50, h: 30 }, { id: 'b1', w: 50, h: 30 },
  ], 200)
  ok('혼합 전부 배치', r.placements.length === 4 && r.unplaced.length === 0)
  ok('혼합 겹침 없음', !B.anyOverlap(r.placements))
  const at = (id) => r.placements.find((p) => p.id === id)
  ok('큰 것이 1행', at('a0').y === 0 && at('a1').y === 0)
  ok('작은 것이 2행 y=50', at('b0').y === 50 && at('b1').y === 50, `${at('b0').y}`)
  const s = B.cutSegments(r.placements)
  // 세로선 x: 0,100,200(1행) · 0,50,100(2행) → 합치면 0,50,100,200 = 4
  const vx = s.filter((q) => q.x1 === q.x2).map((q) => q.x1).sort((a, b) => a - b)
  ok('혼합 세로선 x = 0·50·100·200', String(vx) === '0,50,100,200', String(vx))
  // 가로선 y: 0(폭0..200), 50(0..200 = 1행 아래 + 2행 위), 80(0..100)
  const hy = s.filter((q) => q.y1 === q.y2).map((q) => q.y1).sort((a, b) => a - b)
  ok('혼합 가로선 y = 0·50·80', String(hy) === '0,50,80', String(hy))
  // y=50 은 1행 바닥과 2행 천장이 **같은 선** — 한 번만 나와야 한다
  ok('y=50 이 한 줄만', s.filter((q) => q.y1 === 50 && q.y2 === 50).length === 1)
  // x=0 세로선은 1행+2행이 이어져 0→80
  const left = s.find((q) => q.x1 === 0 && q.x2 === 0)
  ok('왼쪽 세로선이 0→80 으로 이어짐', left.y1 === 0 && left.y2 === 80, seg(left))
}

// ── ⑤ 폭보다 넓은 조각 ───────────────────────────────────────────
{
  const r = B.packRects([{ id: 'big', w: 300, h: 10 }, { id: 'ok', w: 50, h: 10 }], 200)
  ok('폭 초과는 미배치로 보고', r.unplaced.length === 1 && r.unplaced[0] === 'big', String(r.unplaced))
  ok('나머지는 배치됨', r.placements.length === 1 && r.placements[0].id === 'ok')
}

// ── ⑥ 순서가 결정적 ──────────────────────────────────────────────
{
  const mk = () => [{ id: 0, w: 40, h: 20 }, { id: 1, w: 40, h: 20 }, { id: 2, w: 40, h: 20 }]
  const a = JSON.stringify(B.packRects(mk(), 100).placements)
  const b = JSON.stringify(B.packRects(mk(), 100).placements)
  ok('같은 입력 → 같은 배치', a === b)
}

console.log('\n── 판정 ──')
if (fail === 0) console.log(`  ✅ 전 항목 통과 (${pass}건)`)
else console.log(`  ❌ 실패 ${fail}건 / 통과 ${pass}건`)
process.exit(fail ? 1 : 0)
