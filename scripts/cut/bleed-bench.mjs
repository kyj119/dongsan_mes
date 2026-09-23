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
const { repeatLastPixel, isRectLike } = mod.exports

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

console.log('\n── 10 모서리 — 둥글게(기본) vs 각지게(사각) (2026-09-23) ──')
// 가로등배너 벌·사각 조각은 모서리까지 채워야 한다. 기본은 종전 그대로(타원 한계)라 재단 실루엣 조각이 안 흔들린다.
{
  const src = make(30, 20, (x, y) => (x >= 5 && x < 25 && y >= 4 && y < 16) ? [10, 200, 90] : null)
  const g = 5
  const round = repeatLastPixel(src, g)
  const sq = repeatLastPixel(src, g, { corner: 'square' })
  // 원본 잉크 x 5..24 · y 4..15 가 (pad,pad)=(5,5) 만큼 밀려 x 10..29 · y 9..20. 모서리 픽셀 = (10-5, 9-5) = (5,4)
  const at = (r, x, y) => r.data[(y * r.W + x) * 4 + 3]
  ok('① 기본(round)은 모서리가 빈다 — 종전 동작', at(round, 5, 4) < 128)
  // 잉크는 캔버스에서 x 10..29 · y 9..20 → 네 모서리 밖 5px 지점 = (5,4) (34,4) (5,25) (34,25) 가 차야 한다.
  ok('② ★square 는 네 모서리까지 찬다', at(sq, 5, 4) === 255 && at(sq, 34, 4) === 255 && at(sq, 5, 25) === 255 && at(sq, 34, 25) === 255)
  ok('②-b 도련 범위 밖(원본의 투명 여백 끝)은 square 도 비워 둔다', at(sq, sq.W - 1, sq.H - 1) < 128 && at(sq, 0, 0) < 128)
  ok('③ square 도 도련 범위 밖은 안 채운다 (캔버스 크기 동일)', sq.W === round.W && sq.H === round.H)
  const col = [sq.data[(4 * sq.W + 5) * 4], sq.data[(4 * sq.W + 5) * 4 + 1], sq.data[(4 * sq.W + 5) * 4 + 2]]
  ok('④ 모서리 색 = 원본 모서리 픽셀 색', col.join() === '10,200,90', col.join())
  let same = 0, tot = 0
  for (let y = 0; y < sq.H; y++) for (let x = 0; x < sq.W; x++) { if (at(round, x, y) === 255) { tot++; if (at(sq, x, y) === 255) same++ } }
  ok('⑤ round 가 채운 곳은 square 도 전부 채운다 (상위집합)', same === tot, same + '/' + tot)

  // 사각 판정 — 재단이 「사각 조각만 각지게」 정하는 잣대
  ok('⑥ 꽉 찬 사각은 사각', isRectLike(make(20, 10, () => [0, 0, 0])) === true)
  const circle = make(40, 40, (x, y) => ((x - 20) * (x - 20) + (y - 20) * (y - 20) <= 19 * 19) ? [0, 0, 0] : null)
  ok('⑦ 원은 사각이 아니다', isRectLike(circle) === false)
  const aa = make(20, 10, (x, y) => (x === 0 || x === 19 || y === 0 || y === 9) ? [0, 0, 0, 120] : [0, 0, 0])
  ok('⑧ 테두리 한 줄이 반투명(AA)이어도 사각', isRectLike(aa, 200) === false && isRectLike(aa, 100) === true)
  const holed = make(20, 10, (x, y) => (x >= 8 && x < 12 && y >= 3 && y < 7) ? null : [0, 0, 0])
  ok('⑨ 안이 뚫린 사각은 사각이 아니다(덮임 98% 미만)', isRectLike(holed) === false)
}

console.log('\n── 11 모서리 「집게」 회귀 — 테두리 사각의 각진 도련은 변의 색을 잇는다 (2026-09-23 실기) ──')
// 실기: 회색 테두리 + 흰 채움 사각(국제협력처 시트)에서 각진 도련의 **정확히 대각선 위 셀만** 검게 찼다.
//   변 셀은 수직으로 걸어 안쪽 흰색에 안정되는데, 45° 대각선 걸음은 round(0.707·t) 가 t=2 에서 t=1 과 같은
//   픽셀을 가리켜 자기와 비교 → 「안정」 오판 → 모서리 안쪽 대각선 픽셀(테두리 색)을 그대로 썼다.
//   규칙 = 모서리 블록은 옆 변의 도련 색을 잇는다(띠가 모서리를 돌아간다).
{
  const W = 30, H = 20, g = 5
  // 1px 어두운 테두리 + 모서리 안쪽 대각선 픽셀도 어둡게(굵은 선이 모서리에서 두꺼워지는 실물 형태) + 흰 채움
  const dark = (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1
    || (x === 1 && y === 1) || (x === W - 2 && y === 1) || (x === 1 && y === H - 2) || (x === W - 2 && y === H - 2)
  const src = make(W, H, (x, y) => dark(x, y) ? [30, 30, 30] : [255, 255, 255])
  // 재단 탭이 사각 조각에 쓰는 호출 그대로 — 가장자리 픽셀을 그대로 연장(걸음 없음)
  const sq = repeatLastPixel(src, g, { corner: 'square', srcInsetPx: 0 })
  const pad = sq.pad
  ok('① pad 가 대칭이다', pad === g, String(pad))
  let light = 0, filledOut = 0, lightAt = ''
  for (let y = 0; y < sq.H; y++) for (let x = 0; x < sq.W; x++) {
    const inside = x >= pad && x < pad + W && y >= pad && y < pad + H
    if (inside) continue
    const c = px(sq, x, y)
    if (c[3] !== 255) continue
    filledOut++
    if (c[0] !== 30) { light++; if (!lightAt) lightAt = `(${x},${y})=${c.slice(0, 3)}` }
  }
  ok('② 도련(조각 밖) 셀은 전부 찼다 — 모서리 블록 포함', filledOut === (W + 2 * g) * (H + 2 * g) - W * H, String(filledOut))
  ok('③ ★띠가 한 색이다 — 테두리 색 그대로 연장(흰 줄·검은 계단 없음)', light === 0, `${light}개 · 첫 자리 ${lightAt}`)
  // 같은 픽스처를 **걸음 있는** 기본 호출로 돌리면 띠가 섞인다(흰 띠 + 테두리 열 줄무늬) — 재단 탭이 왜 걸음을 끄는지의 근거
  const walked = repeatLastPixel(src, g, { corner: 'square' })
  let mixedDark = 0, mixedLight = 0
  for (let y = 0; y < walked.H; y++) for (let x = 0; x < walked.W; x++) {
    if (x >= pad && x < pad + W && y >= pad && y < pad + H) continue
    const c = px(walked, x, y); if (c[3] !== 255) continue
    if (c[0] < 128) mixedDark++; else mixedLight++
  }
  ok('④ (근거) 걸음이 있으면 띠가 두 색으로 섞인다', mixedDark > 0 && mixedLight > 0, `dark ${mixedDark} · light ${mixedLight}`)
  // 대각선 걸음의 같은 픽셀 두 번 밟기 — 1px 테두리(두꺼워짐 없음)에서 모서리 대각선 셀과 그 옆 셀의 답이 같아야 한다
  const thin = make(W, H, (x, y) => (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? [30, 30, 30] : [255, 255, 255])
  const w2 = repeatLastPixel(thin, g, { corner: 'square' })
  const diag = px(w2, pad - 2, pad - 2), beside = px(w2, pad - 3, pad - 2)
  ok('⑤ 대각선 셀이 옆 셀과 같은 답을 낸다(같은 픽셀 두 번 밟기 정정)', diag.slice(0, 3).join() === beside.slice(0, 3).join(), `${diag} / ${beside}`)
  // 둥근 모드는 손대지 않는다 — 실루엣 조각의 종전 동작 그대로(모서리 비움)
  const round = repeatLastPixel(src, g)
  ok('⑥ round 는 모서리를 비운다(종전)', px(round, 0, 0)[3] < 128)
}

console.log('\n── 9 비대칭 도련 (전사 축, 2026-09-18) ──')
// 가로등배너는 좌우 23.25 · 밴드 쪽 0 · 반대쪽 30.48 처럼 변마다 다르다.
// ★숫자를 넘겼을 때 동작이 **종전과 완전히 같아야** 재단 축이 안 흔들린다 — 그것부터 고정한다.
{
  const src = make(30, 20, (x, y) => (x >= 5 && x < 25 && y >= 4 && y < 16) ? [10, 200, 90] : null)

  const a = repeatLastPixel(src, 5)
  const b = repeatLastPixel(src, { t: 5, r: 5, b: 5, l: 5 })
  ok('① 숫자 5 와 {5,5,5,5} 가 같은 크기', a.W === b.W && a.H === b.H, `${a.W}x${a.H} vs ${b.W}x${b.H}`)
  let diff = 0
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff++
  ok('② ★픽셀까지 동일 — 대칭 경로가 안 바뀌었다', diff === 0, `${diff}px`)
  ok('③ 대칭이면 pad 가 그대로 숫자', a.pad === 5, String(a.pad))

  const c = repeatLastPixel(src, { t: 0, r: 8, b: 3, l: 2 })
  ok('④ 캔버스가 변마다 다르게 커진다', c.W === 30 + 2 + 8 && c.H === 20 + 0 + 3, `${c.W}x${c.H}`)
  ok('⑤ pads 를 돌려준다', c.pads.t === 0 && c.pads.r === 8 && c.pads.b === 3 && c.pads.l === 2, JSON.stringify(c.pads))
  ok('⑥ ★비대칭이면 pad 는 null — 옛 호출부가 조용히 어긋나지 않는다', c.pad === null, String(c.pad))

  // 원본은 (padL, padT) = (2, 0) 에 놓인다. 잉크 사각은 원본 좌표 x 5..24 · y 4..15
  const ix0 = 5 + 2, ix1 = 24 + 2, iy0 = 4 + 0, iy1 = 15 + 0
  ok('⑦ 원본 색 보존', px(c, ix0, iy0).join() === '10,200,90,255', px(c, ix0, iy0).join())
  ok('⑧ ★위로는 안 자란다 (t=0)', px(c, ix0 + 3, iy0 - 1)[3] === 0, String(px(c, ix0 + 3, iy0 - 1)[3]))
  ok('⑨ 오른쪽으로 8px 자란다', px(c, ix1 + 8, 10).join() === '10,200,90,255', px(c, ix1 + 8, 10).join())
  ok('⑩ 오른쪽 9px 은 안 자란다', px(c, ix1 + 9, 10)[3] === 0, String(px(c, ix1 + 9, 10)[3]))
  // 왼쪽 l=2 → 잉크 왼쪽 2px(x=5,6)만 채워지고 그 바깥(x=4)은 투명이다.
  ok('⑪ 왼쪽은 2px 만 (그 바깥은 투명)', px(c, ix0 - 2, 10)[3] === 255 && px(c, ix0 - 3, 10)[3] === 0,
    px(c, ix0 - 2, 10).join() + ' / ' + px(c, ix0 - 3, 10).join())
  ok('⑫ 아래로 3px 자란다', px(c, ix0 + 3, iy1 + 3).join() === '10,200,90,255', px(c, ix0 + 3, iy1 + 3).join())

  // 자가시험 — 한 변을 0 으로 만들면 그쪽이 사라지고, 되돌리면 돌아온다
  const d = repeatLastPixel(src, { t: 4, r: 8, b: 3, l: 2 })
  ok('⑬ 자가시험 — t 를 4 로 주면 위로 자란다', px(d, ix0 + 3 + 0, 4 + 4 - 1)[3] === 255,
    String(px(d, ix0 + 3, 4 + 4 - 1)[3]))
}

console.log(`\n── 판정 ──`)
if (fails) { console.log(`  ❌ ${fails}건 실패`); process.exit(1) }
console.log('  ✅ 전 항목 통과 (링 색 보존·내부 선 차단·위치별 색·오목 홈·성능·반투명 가장자리·소프트 에지·겹침 분할·비대칭)')
