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
  ok('꽉 찬 마스크 = 직사각', B.isRectish(full))
  // ⚠️ 예전 픽스처는 "위 절반만 찬 10×10" 이었는데, **잉크 bbox 로 보면 그건 진짜 10×5 직사각**이다
  //    (2026-08-07 bbox 판정으로 바꾸면서 드러났다). 반례가 되려면 **bbox 안이 안 채워져야** 한다.
  const el = { W: 10, H: 10, m: new Uint8Array(100) }
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (y >= 5 || x < 5) el.m[y * 10 + x] = 1
  ok('ㄴ자 = 직사각 아님 (bbox 는 꽉 차 보여도)', !B.isRectish(el))
  // 조각이 판 위에 놓인 자리와 무관해야 한다 — 같은 도형을 캔버스 구석으로 밀어도 판정이 같다
  const shifted = { W: 30, H: 30, m: new Uint8Array(900) }
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) shifted.m[(y + 18) * 30 + (x + 19)] = el.m[y * 10 + x]
  ok('구석으로 민 ㄴ자도 직사각 아님', !B.isRectish(shifted))
  // 안티앨리어싱은 **최외곽 1px 링**을 비운다 — 그건 직사각으로 봐야 한다.
  //   (모서리 판정을 1px 안쪽에서 하는 이유가 이것이다)
  const aa = { W: 100, H: 100, m: new Uint8Array(10000).fill(1) }
  for (let x = 0; x < 100; x++) { aa.m[x] = 0; aa.m[99 * 100 + x] = 0 }
  for (let y = 0; y < 100; y++) { aa.m[y * 100] = 0; aa.m[y * 100 + 99] = 0 }
  ok('안티앨리어싱 1px 링은 직사각', B.isRectish(aa))
  // ★크기에 따라 판정이 갈리면 안 된다 — 작은 스티커가 맞붙임에서 빠지는 게 그 증상이다
  const aaSmall = { W: 40, H: 24, m: new Uint8Array(40 * 24).fill(1) }
  for (let x = 0; x < 40; x++) { aaSmall.m[x] = 0; aaSmall.m[23 * 40 + x] = 0 }
  for (let y = 0; y < 24; y++) { aaSmall.m[y * 40] = 0; aaSmall.m[y * 40 + 39] = 0 }
  ok('작은 조각의 1px 링도 직사각', B.isRectish(aaSmall))
  // ★변 중간이 파인 도형은 여전히 걸러야 한다(모서리는 멀쩡하므로 채움 비율이 잡는다)
  const notch = { W: 100, H: 100, m: new Uint8Array(10000).fill(1) }
  for (let y = 40; y < 60; y++) for (let x = 60; x < 100; x++) notch.m[y * 100 + x] = 0
  ok('변이 파인 도형은 직사각 아님', !B.isRectish(notch))

  // ★★라운드 사각 — 채움 비율만 보면 통과해 버린다. 통과시키면 라운드가 각지게 잘린다.
  const round = (W, H, r) => {
    const m = new Uint8Array(W * H).fill(1)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cx = x < r ? r : (x >= W - r ? W - 1 - r : x)
        const cy = y < r ? r : (y >= H - r ? H - 1 - r : y)
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) m[y * W + x] = 0
      }
    }
    return { W, H, m }
  }
  // ★★굽기는 pad(≥1mm)를 두른다 — 캔버스 귀퉁이는 **직사각이어도 늘 비어 있다.**
  //   판정을 잉크 bbox 안에서 안 하면 전 조각이 이형으로 떨어져 맞붙임이 한 번도 안 켜진다
  //   (2026-08-07 실사용: 화면에 "조각 #0 가 직사각이 아님"이라는 틀린 사유가 떴다).
  const padded = (iw, ih, pad, mk) => {
    const W = iw + pad * 2, H = ih + pad * 2
    const m = new Uint8Array(W * H)
    const inner = mk ? mk(iw, ih) : { W: iw, H: ih, m: new Uint8Array(iw * ih).fill(1) }
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) m[(y + pad) * W + (x + pad)] = inner.m[y * iw + x]
    return { W, H, m }
  }
  ok('패딩 두른 직사각도 직사각', B.isRectish(padded(120, 60, 4)))
  ok('패딩이 커도 판정이 같다', B.isRectish(padded(120, 60, 40)))
  ok('잉크 bbox 를 정확히 잡는다', (() => {
    const bb = B.inkBBox(padded(120, 60, 4))
    return bb && bb.L === 4 && bb.T === 4 && bb.W === 120 && bb.H === 60
  })())
  ok('빈 마스크는 직사각 아님', !B.isRectish({ W: 10, H: 10, m: new Uint8Array(100) }))

  // 패딩을 걷어낸 뒤에도 라운드는 여전히 걸러져야 한다 — bbox 자르기가 판정을 무디게 하면 안 된다
  ok('패딩 두른 라운드 사각은 여전히 거른다',
    !B.isRectish(padded(200, 100, 6, (w, h) => round(w, h, 10))))

  const r5 = round(200, 100, 10)
  const fill = r5.m.reduce((a, b) => a + b, 0) / (200 * 100)
  ok('라운드 사각은 채움비율로는 안 걸린다(전제 확인)', fill >= 0.98, `채움 ${(fill * 100).toFixed(2)}%`)
  ok('라운드 사각 = 직사각 아님 (모서리 판정)', !B.isRectish(r5))
  ok('반경이 작아도 걸러진다', !B.isRectish(round(400, 200, 6)))
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

// ── ⑦ 실물 회귀 — 선반 배치가 낭비하던 그 조각들 ──────────────────
// 2026-08-07 실사용 5장(롤 1370, 돔보 17×2 → 폭 1336). 선반은 **3,725mm·효율 59.6%** 였다.
// 같은 조각을 래스터 네스터는 2,628mm 에 넣었다 — 즉 손실은 원리가 아니라 **패커 선택**이었다.
// 이 게이트는 그 회귀를 막는다. 숫자를 낮추는 개선은 환영이고, 올리는 변경은 여기서 걸린다.
{
  const W = 1336
  const real = () => [
    { id: 2, w: 420, h: 2100 },
    { id: 3, w: 1995, h: 495 },
    { id: 1, w: 485, h: 985 },
    { id: 0, w: 1150, h: 300 },
    { id: 4, w: 1150, h: 300 },
  ]
  const r = B.packRects(real(), W, true)
  ok('실물 5장 전부 배치', r.placements.length === 5 && r.unplaced.length === 0, `미배치 ${r.unplaced}`)
  ok('실물 5장 겹침 없음', !B.anyOverlap(r.placements))
  ok('실물 5장 폭 안 넘음', r.usedW <= W, `${r.usedW} > ${W}`)
  ok('실물 5장 선반(3725mm)보다 낫다', r.usedH < 3725, `${Math.round(r.usedH)}mm`)
  ok('실물 5장 래스터(2628mm) 수준', r.usedH <= 2700, `${Math.round(r.usedH)}mm`)
  console.log(`        └ 실측 ${Math.round(r.usedH)}mm (선반 3725 · 래스터 2628)`)
  // ★맞닿은 변이 실제로 합쳐지는가 — 조각 5장이면 사각 5개 = 선분 20개가 아니어야 한다
  const s = B.cutSegments(r.placements)
  ok('실물 5장 공유 변이 합쳐짐(<20)', s.length < 20, `${s.length}개`)
  // ★회전을 써도 결정적이어야 한다
  ok('회전 포함해도 같은 입력 → 같은 배치',
    JSON.stringify(B.packRects(real(), W, true).placements) === JSON.stringify(r.placements))
  // ★회전은 **명시할 때만** — 기존 호출부(회전 금지)가 조용히 달라지면 안 된다
  const noRot = B.packRects([{ id: 'wide', w: 300, h: 10 }], 200)
  ok('회전 미지정이면 세우지 않는다', noRot.unplaced.length === 1, JSON.stringify(noRot.placements))
}

console.log('\n── 판정 ──')
if (fail === 0) console.log(`  ✅ 전 항목 통과 (${pass}건)`)
else console.log(`  ❌ 실패 ${fail}건 / 통과 ${pass}건`)
process.exit(fail ? 1 : 0)
