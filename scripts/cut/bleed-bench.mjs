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

console.log('\n── 8 ★소프트 에지(블렌드 밴드)는 링으로 확대되지 않는다 ──')
// 2026-08-24 반백반흑 실사용 재현("흰 부분 도련이 회색"). 사진·스캔·축소 스무딩은 실루엣
// 가장자리 1~2px 를 **섞인 색(불투명)**으로 만든다. 최외곽을 그대로 반복하면 그 오염이
// 도련 전체 폭으로 확대된다 → 안정점 탐색(srcInsetPx)이 안쪽의 순색을 써야 한다.
// ⚠️ §2(내부 선)와 한 쌍이다 — 안정점 탐색이 "무조건 안쪽"으로 바뀌면 §2 가 깨진다.
{
  const g = 6
  const src = make(30, 20, (x, y) => {
    const core = x >= 6 && x < 24 && y >= 5 && y < 15
    const edge = x >= 5 && x < 25 && y >= 4 && y < 16
    if (core) return [255, 255, 255, 255]      // 몸통 = 흰색
    if (edge) return [128, 128, 128, 255]      // 소프트 에지 1px = 불투명 회색(블렌드)
    return null
  })
  const r = repeatLastPixel(src, g)
  // 판정은 **본체 구간에서 직교로 뻗는 링**만 본다 — 밴드의 모서리 기둥(예: 좌측 세로 1px)은
  // 회색 잉크가 실제로 가장자리에 닿아 이어지는 자리라 회색이 **맞고**(§2 의 "닿아 있으면
  // 이어지는 것이 맞다"), 실전 해상도에서 1px 헤어라인이다. 문제였던 것은 면 전체의 확대다.
  let gray = 0
  for (let y = 0; y < r.H; y++) for (let x = 0; x < r.W; x++) {
    const inSrc = (x >= g + 5 && x < g + 25 && y >= g + 4 && y < g + 16)
    if (inSrc) continue
    const vertical = (x >= g + 6 && x < g + 24) && (y < g + 4 || y >= g + 16)   // 상하 링 × 본체 폭
    const horizontal = (y >= g + 5 && y < g + 15) && (x < g + 5 || x >= g + 25) // 좌우 링 × 본체 높이
    if (!vertical && !horizontal) continue
    const c = px(r, x, y)
    if (c[3] === 255 && c[0] > 40 && c[0] < 215) gray++
  }
  ok('본체 직교 링에 회색(블렌드) 픽셀 0', gray === 0, `${gray}개`)
  ok('링은 몸통 흰색', px(r, 5 + g - 3, 10 + g).slice(0, 3).join() === '255,255,255', px(r, 5 + g - 3, 10 + g).join())
  // 탐색을 끄면(srcInsetPx 0) 종전 동작 = 최외곽(회색)이 그대로 링이 된다 — 옵션이 실제로 작동하는지 확인
  const r0 = repeatLastPixel(src, g, { srcInsetPx: 0 })
  ok('탐색 OFF 면 최외곽 색(회색) 유지', px(r0, 5 + g - 3, 10 + g).slice(0, 3).join() === '128,128,128', px(r0, 5 + g - 3, 10 + g).join())
}

// -- 9 도련 겹침 분할 (2026-08-25) --------------------------------------
// ★`cut-main.js` 의 `mesCutSplitBleed` 를 **브레이스 매칭으로 절취해 그대로 돌린다**
//   (`nesting-harness.mjs` 와 같은 수법). cut-main.js 는 DOM 에 묶여 import 가 안 되는데,
//   이 규칙은 분기가 넷이라 소스 패턴 검사(cut:smoke)만으로는 동작을 못 지킨다.
{
  console.log('\n-- 9 도련 겹침 분할 --')
  const CUT_MAIN = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'cut-main.js')
  const src = fs.readFileSync(CUT_MAIN, 'utf8')
  const start = src.indexOf('function mesCutSplitBleed(')
  if (start < 0) { ok('mesCutSplitBleed 추출', false, '함수를 못 찾음') }
  else {
    let i = src.indexOf('{', start), depth = 0, end = -1
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
    }
    const MIN = /var BLEED_MIN_MM = ([\d.]+);/.exec(src)
    const split = new Function('BLEED_MIN_MM', src.slice(start, end) + '; return mesCutSplitBleed;')(MIN ? parseFloat(MIN[1]) : 1.5)
    ok('하한 상수 1.5mm', !!MIN && parseFloat(MIN[1]) === 1.5, MIN ? MIN[1] : '없음')
    const c = (gap, bleed, butt) => split(gap, bleed, !!butt)
    // 1) 간격이 넉넉하면 요청 도련 그대로 · 간격 불변
    let r = c(6, 3); ok('간격 6·도련 3 -> 그대로', r.gapMm === 6 && r.bleedMm === 3, JSON.stringify(r))
    // 2) 갇히면 절반씩 나눠 갖는다 — **간격은 사용자 입력 그대로**(이번 변경의 핵심)
    r = c(3, 3); ok('간격 3·도련 3 -> 간격 3 유지·도련 1.5', r.gapMm === 3 && r.bleedMm === 1.5, JSON.stringify(r))
    // 3) 나눠도 하한 미달일 때만 간격을 올린다
    r = c(1, 3); ok('간격 1·도련 3 -> 간격 3·도련 1.5', r.gapMm === 3 && r.bleedMm === 1.5, JSON.stringify(r))
    // 4) ★하한이 요청 도련을 넘지 않는다 — 1mm 를 원한 사람에게 1.5mm 를 강요하며 재료를 뺏지 않는다
    r = c(1, 1); ok('간격 1·도련 1 -> 간격 2·도련 1(하한이 요청을 안 넘음)', r.gapMm === 2 && r.bleedMm === 1, JSON.stringify(r))
    r = c(0.4, 0.5); ok('작은 도련도 요청 이하로만', r.bleedMm === 0.5 && r.gapMm === 1, JSON.stringify(r))
    // 5) ★맞붙임은 손대지 않는다 — 간격 0 에서 나누면 도련이 통째로 사라진다
    r = c(0, 3, true); ok('맞붙임 -> 간격 0·도련 3 유지', r.gapMm === 0 && r.bleedMm === 3, JSON.stringify(r))
    // 6) 도련 0 이면 아무것도 하지 않는다(시트컷 경로)
    r = c(0, 0); ok('도련 0 -> 간격 0 통과', r.gapMm === 0 && r.bleedMm === 0, JSON.stringify(r))
    r = c(2, 0); ok('도련 0 -> 간격 유지', r.gapMm === 2 && r.bleedMm === 0, JSON.stringify(r))
    // 7) ★불변식 전수 — 간격은 절대 줄지 않고, 도련x2 는 간격을 넘지 않는다(넘으면 옆 조각과 겹친다)
    let bad = 0
    for (let g = 0; g <= 12.0001; g += 0.25) for (const b of [0, 0.5, 1, 1.5, 3, 5]) {
      const o = c(g, b)
      if (o.gapMm < g - 1e-9) bad++
      if (b > 0 && o.gapMm > 0 && o.bleedMm * 2 > o.gapMm + 1e-9) bad += 100
      if (o.bleedMm > b + 1e-9) bad += 10000
    }
    ok('간격 축소 0 · 도련x2 <= 간격 · 요청 초과 0 (전수 294조합)', bad === 0, String(bad))
  }
}

console.log(`\n── 판정 ──`)
if (fails) { console.log(`  ❌ ${fails}건 실패`); process.exit(1) }
console.log('  ✅ 전 항목 통과 (링 색 보존·내부 선 차단·위치별 색·오목 홈·성능·반투명 가장자리·소프트 에지·겹침 분할)')
