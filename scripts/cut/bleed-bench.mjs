// 도련(Repeat Last Pixel) 하네스 — 패널이 **실제로 로드하는 파일**을 그대로 검증한다.
//   geometry.js 와 같은 원칙: 계산을 일러 밖에 두는 이유가 이 검증이다.
//   실행 = node scripts/cut/bleed-bench.mjs   (P1 실패 시 exit 1)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'bleed.js')
const mod = { exports: {} }
new Function('module', 'globalThis', fs.readFileSync(SRC, 'utf8'))(mod, { })
const { repeatLastPixel } = mod.exports

let fails = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${name}`)
  else { fails++; console.log(`  FAIL  ${name}   ← ${extra}`) }
}
const px = (img, x, y) => {
  const i = (y * img.W + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
}
// RGBA 캔버스 만들기: fn(x,y) -> [r,g,b,a] | null(투명)
function make(W, H, fn) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = fn(x, y); const i = (y * W + x) * 4
    if (c) { data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3] === undefined ? 255 : c[3] }
  }
  return { W, H, data }
}

console.log('\n── 1 기본 — 단색 사각의 링은 그 색이어야 한다 ──')
{
  const g = 5
  const src = make(30, 20, (x, y) => (x >= 5 && x < 25 && y >= 4 && y < 16) ? [200, 30, 40] : null)
  const r = repeatLastPixel(src, g)
  ok('캔버스가 사방 grow 만큼 커진다', r.W === 30 + 2 * g && r.H === 20 + 2 * g, `${r.W}x${r.H}`)
  ok('pad = grow', r.pad === g, String(r.pad))
  // 원본 잉크 자리(확장 캔버스 좌표 = +pad)는 그대로
  ok('원본 색 보존', px(r, 5 + g, 4 + g).join() === '200,30,40,255', px(r, 5 + g, 4 + g).join())
  // 사각 바로 바깥 3px = 같은 색으로 채워져야
  ok('바깥 3px 이 원본 색', px(r, 5 + g - 3, 10 + g).join() === '200,30,40,255', px(r, 5 + g - 3, 10 + g).join())
  // grow 밖은 투명
  ok('grow 밖은 투명', px(r, 5 + g - (g + 1), 10 + g)[3] === 0, String(px(r, 5 + g - (g + 1), 10 + g)[3]))
}

console.log('\n── 2 ★핵심 — 내부 선은 링에 절대 나타나지 않는다 ──')
// 실사용 결함 재현: 흰 몸통 안에 가장자리에서 2px 떨어진 검정 선.
// 벡터 오프셋 방식은 이 선이 grow 만큼 부풀어 링으로 튀어나왔다(토끼·분홍 여자 증상).
{
  const g = 6
  const src = make(40, 24, (x, y) => {
    if (!(x >= 4 && x < 36 && y >= 4 && y < 20)) return null      // 몸통
    // ★완전한 **내부** 선이어야 한다 — 위/아래로도 몸통 안에 들어와 있어야 가장자리에 닿지 않는다.
    //   (닿아 있으면 거기서는 검정이 이어지는 것이 **맞다**. 도련은 가장자리 색을 잇는 것이므로.)
    if (x >= 6 && x < 8 && y >= 8 && y < 16) return [0, 0, 0]      // 왼쪽 끝에서 2px 안쪽 검정 선
    return [255, 255, 255]
  })
  const r = repeatLastPixel(src, g)
  let blackInRing = 0
  for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
    const inOrig = (x >= g + 4 && x < g + 36 && y >= g + 4 && y < g + 20)
    if (inOrig) continue
    const c = px(r, x, y)
    if (c[3] > 0 && c[0] < 40 && c[1] < 40 && c[2] < 40) blackInRing++
  }
  ok('링에 검정(내부 선) 픽셀 0', blackInRing === 0, `${blackInRing}개`)
  ok('링은 몸통 흰색', px(r, g + 4 - 3, g + 12).join() === '255,255,255,255', px(r, g + 4 - 3, g + 12).join())
}

console.log('\n── 3 색이 위치별로 따라간다(단색 링이 아니다) ──')
{
  const g = 4
  // 위 절반 빨강 · 아래 절반 파랑 → 링도 위/아래가 갈려야 한다
  const src = make(20, 20, (x, y) => (x >= 4 && x < 16 && y >= 4 && y < 16)
    ? (y < 10 ? [255, 0, 0] : [0, 0, 255]) : null)
  const r = repeatLastPixel(src, g)
  ok('링 위쪽 = 빨강', px(r, g + 4 - 2, g + 6).join() === '255,0,0,255', px(r, g + 4 - 2, g + 6).join())
  ok('링 아래쪽 = 파랑', px(r, g + 4 - 2, g + 13).join() === '0,0,255,255', px(r, g + 4 - 2, g + 13).join())
}

console.log('\n── 4 오목한 형상에서 구멍이 나지 않는다 ──')
// bbox 기준 프루닝이 실패했던 자리. 픽셀 방식은 오목·볼록 개념이 없다.
{
  const g = 4
  const src = make(30, 30, (x, y) => {
    const inBox = (x >= 4 && x < 26 && y >= 4 && y < 26)
    const notch = (x >= 12 && x < 18 && y >= 4 && y < 14)          // 위쪽에 파인 홈
    return (inBox && !notch) ? [10, 160, 90] : null
  })
  const r = repeatLastPixel(src, g)
  // 홈 안쪽 벽면 바로 옆(홈 내부)도 링으로 채워져야 한다
  ok('홈 내부도 채워짐', px(r, g + 15, g + 13 - 1)[3] === 255 || px(r, g + 15, g + 12)[3] === 255,
    JSON.stringify(px(r, g + 15, g + 12)))
  ok('홈 색이 아트 색', px(r, g + 15, g + 12).slice(0, 3).join() === '10,160,90', px(r, g + 15, g + 12).join())
}

console.log('\n── 5 성능 — 실사용 크기(0.25mm/px 로 130mm ≈ 520px) ──')
{
  const W = 520, H = 560, g = 24
  const src = make(W, H, (x, y) => (x > 20 && x < W - 20 && y > 20 && y < H - 20) ? [180, 60, 20] : null)
  const t0 = Date.now()
  const r = repeatLastPixel(src, g)
  const ms = Date.now() - t0
  ok('2초 안에 끝난다', ms < 2000, `${ms}ms`)
  console.log(`  (${W}x${H} · grow ${g}px → ${r.W}x${r.H} · 채운 픽셀 ${r.filled} · ${ms}ms)`)
}

console.log('\n── 6 ★안티앨리어싱 가장자리 — 반투명이 남으면 원본과의 경계에 틈이 보인다 ──')
// 2026-08-05 실사용 결함 재현. 굽기(`antiAliasing=true`)는 잉크 가장자리 1~2px 를 반투명으로 만든다.
// 그 픽셀을 "잉크"로 보고 그대로 두면 배경 위에서는 **비어 보이고**(틈) 다른 도련과 겹치면
// **알파 합성으로 진해진다**. 실측: 도련 PNG 27개 전량, 잉크의 1.95%가 알파 1~249.
{
  const g = 5
  const src = make(30, 20, (x, y) => {
    const core = x >= 6 && x < 24 && y >= 5 && y < 15
    const edge = x >= 5 && x < 25 && y >= 4 && y < 16
    if (core) {
      // ★알파 250~254 = "거의 불투명" 구간. 임계를 250 으로 뒀을 때 여기만 살아남아
      //   조각 27개 중 2개에서 틈이 그대로 보였다(274px·6px). 눈에 안 보일 것 같아도 겹치면 합성된다.
      if (x === 6 || x === 23) return [200, 30, 40, 252]
      return [200, 30, 40, 255]
    }
    if (edge) return [200, 30, 40, 128]        // 안티앨리어싱 테두리 1px
    return null
  })
  const r = repeatLastPixel(src, g)
  // 반투명 테두리 자리가 **불투명**해져야 원본 벡터 바로 바깥에 틈이 없다
  ok('반투명 가장자리가 불투명해진다', px(r, 5 + g, 10 + g)[3] === 255, px(r, 5 + g, 10 + g).join())
  ok('그 자리가 아트 색', px(r, 5 + g, 10 + g).slice(0, 3).join() === '200,30,40', px(r, 5 + g, 10 + g).join())
  // 결과에 반투명이 하나라도 남으면 겹칠 때 다시 진해진다
  let semi = 0
  for (let i = 3; i < r.data.length; i += 4) { const a = r.data[i]; if (a > 0 && a < 255) semi++ }
  ok('반투명 픽셀 0개', semi === 0, `${semi}개 남음`)
  ok('원본 불투명부 색 보존', px(r, 6 + g, 10 + g).join() === '200,30,40,255', px(r, 6 + g, 10 + g).join())
}

console.log('\n── 7 반투명이 지배적인 아트에서는 공급원을 잃지 않는다 ──')
// 임계를 무조건 올리면 투명도를 쓴 디자인에서 **불투명 픽셀이 0개** 가 돼 도련이 통째로 안 만들어진다.
{
  const g = 4
  const src = make(20, 20, (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15) ? [0, 120, 255, 100] : null)
  const r = repeatLastPixel(src, g)
  ok('도련이 만들어진다(공급원 상실 없음)', r.filled > 0, `filled=${r.filled}`)
  ok('링 색이 아트 색', px(r, 5 + g - 2, 10 + g).slice(0, 3).join() === '0,120,255', px(r, 5 + g - 2, 10 + g).join())
}

console.log(`\n── 판정 ──`)
if (fails) { console.log(`  ❌ ${fails}건 실패`); process.exit(1) }
console.log('  ✅ 전 항목 통과 (링 색 보존·내부 선 차단·위치별 색·오목 홈·성능·반투명 가장자리)')
