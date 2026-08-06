/**
 * 재단 패널 — 래스터 true-shape 네스팅 (의존성: geometry.js)
 *
 * spec = docs/superpowers/specs/2026-07-31-cut-file-panel.md §6.8
 *
 * ★왜 래스터인가 (2026-07-31 실측):
 *   조각 마스크·거리변환·오프셋을 칼선 파이프라인에서 이미 갖고 있다. 그래서
 *   ⓐ**조각 간 gap 이 공짜** — 마스크를 gap/2 팽창(offsetMask)시켜 배치하면 끝
 *   ⓑ**충돌 판정이 픽셀 AND** — NFP(Minkowski) 구현이 통째로 불필요
 *   ⓒ**구멍 안에 다른 조각을 넣는 것도 자동** — 마스크는 구멍을 그냥 빈 공간으로 본다
 *   bbox 패킹 대비 실측 절감 = 삼각형 20개 40%, 혼합 18개 13%.
 *
 * ⚠️ 정본은 이 파일이다. Node 하네스(scripts/cut/nest-bench.mjs)가 **이 파일을 직접 검증**한다.
 */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.MesCutNest = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /** 마스크 90° 회전(시계). {W,H,m} */
  function rot90(p) {
    var W = p.H, H = p.W
    var m = new Uint8Array(W * H)
    for (var y = 0; y < p.H; y++) {
      for (var x = 0; x < p.W; x++) {
        if (p.m[y * p.W + x]) m[x * W + (p.H - 1 - y)] = 1
      }
    }
    return { W: W, H: H, m: m }
  }

  /** rot ∈ {0,90,180,270} */
  function rotate(p, rot) {
    var r = ((rot % 360) + 360) % 360
    var out = p
    for (var i = 0; i < (r / 90); i++) out = rot90(out)
    return out
  }

  /** 마스크의 실제 잉크 bbox 로 잘라낸다 — 여백이 붙어 있으면 배치가 헐거워진다. */
  function trim(p) {
    var L = p.W, T = p.H, R = -1, B = -1
    for (var y = 0; y < p.H; y++) {
      for (var x = 0; x < p.W; x++) {
        if (!p.m[y * p.W + x]) continue
        if (x < L) L = x
        if (x > R) R = x
        if (y < T) T = y
        if (y > B) B = y
      }
    }
    if (R < 0) return { W: 0, H: 0, m: new Uint8Array(0), offX: 0, offY: 0 }
    var W = R - L + 1, H = B - T + 1
    var m = new Uint8Array(W * H)
    for (var yy = 0; yy < H; yy++) {
      for (var xx = 0; xx < W; xx++) m[yy * W + xx] = p.m[(T + yy) * p.W + (L + xx)]
    }
    return { W: W, H: H, m: m, offX: L, offY: T }
  }

  function inkOf(p) { var n = 0; for (var i = 0; i < p.m.length; i++) n += p.m[i]; return n }

  // ── ★비트마스크 (2026-08-05) ──────────────────────────────────────
  // 겹침 검사가 전체 시간의 대부분이었다. 픽셀을 하나씩 비교하는 대신 **행을 32비트씩 AND** 한다.
  //   문헌(BLF 계열)이 "적절한 자료구조면 수 ms"라고 하는 그 자료구조다.
  // ⚠️ 결과는 **완전히 동일**하다 — 같은 판정을 다른 표현으로 할 뿐이다.
  //    그래서 공개 `fits`(픽셀 버전)는 그대로 남긴다: 하네스가 **독립 구현으로** 배치를 검증한다.
  //    둘이 어긋나면 그건 이 최적화의 버그이므로, 이중 구현이 오히려 안전장치다.

  function popcnt(v) {
    v = v - ((v >>> 1) & 0x55555555)
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
    return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24
  }

  /** 마스크를 행별 32비트 워드로 팩. `lastY` = 열마다 가장 아래 잉크(스카이라인 갱신용, O(W)로 줄인다). */
  function packMask(p) {
    var words = (p.W + 31) >>> 5
    var bits = new Uint32Array(words * p.H)
    var lastY = new Int32Array(p.W)
    for (var x = 0; x < p.W; x++) lastY[x] = -1
    for (var y = 0; y < p.H; y++) {
      var row = y * p.W, brow = y * words
      for (var x2 = 0; x2 < p.W; x2++) {
        if (!p.m[row + x2]) continue
        bits[brow + (x2 >>> 5)] |= (1 << (x2 & 31))
        lastY[x2] = y            // y 오름차순이라 마지막에 남는 값이 최하단이다
      }
    }
    return { W: p.W, H: p.H, m: p.m, words: words, bits: bits, lastY: lastY }
  }

  // 조각이 임의 x 에 놓이므로 워드 경계를 걸친다 → bitOff 만큼 시프트해 두 워드에 나눠 본다.
  //   범위를 넘는 인덱스는 TypedArray 가 undefined 를 주고 `undefined & n === 0` 이라 자연히 안전하다.
  function fitsBits(bits, SWW, p, ox, oy) {
    var bitOff = ox & 31, wordOff = ox >>> 5, pw = p.words
    for (var y = 0; y < p.H; y++) {
      var srow = (oy + y) * SWW + wordOff, prow = y * pw
      for (var w = 0; w < pw; w++) {
        var v = p.bits[prow + w]
        if (!v) continue
        if (bits[srow + w] & (v << bitOff)) return false
        if (bitOff && (bits[srow + w + 1] & (v >>> (32 - bitOff)))) return false
      }
    }
    return true
  }

  function stampBits(bits, SWW, p, ox, oy) {
    var bitOff = ox & 31, wordOff = ox >>> 5, pw = p.words
    for (var y = 0; y < p.H; y++) {
      var srow = (oy + y) * SWW + wordOff, prow = y * pw
      for (var w = 0; w < pw; w++) {
        var v = p.bits[prow + w]
        if (!v) continue
        bits[srow + w] |= (v << bitOff)
        if (bitOff) bits[srow + w + 1] |= (v >>> (32 - bitOff))
      }
    }
  }

  /**
   * 회전·트림·팩 결과 캐시.
   * 같은 (조각, 회전)을 **투입 순서마다 다시** 만들고 있었다 — 순서 8종 × 2패스면 16번씩이다.
   * 회전 결과는 순서·격자와 무관하므로 한 번만 만들면 된다.
   */
  function getCand(cache, src, rot) {
    var byRot = cache.get(src)
    if (!byRot) { byRot = {}; cache.set(src, byRot) }
    if (rot in byRot) return byRot[rot]
    var t = trim(rotate(src, rot))
    var packed = t.W ? packMask(t) : null
    byRot[rot] = packed
    return packed
  }

  /**
   * 시트에 조각을 놓을 수 있는가 (픽셀 AND).
   * 조각 마스크는 이미 gap/2 만큼 팽창돼 있다고 가정한다 → 겹치지 않으면 gap 이 보장된다.
   */
  function fits(sheet, SW, SH, p, ox, oy) {
    if (ox < 0 || oy < 0 || ox + p.W > SW || oy + p.H > SH) return false
    for (var y = 0; y < p.H; y++) {
      var row = (oy + y) * SW + ox
      var prow = y * p.W
      for (var x = 0; x < p.W; x++) {
        if (p.m[prow + x] && sheet[row + x]) return false
      }
    }
    return true
  }


  /**
   * bottom-left 배치. **스카이라인으로 후보를 줄인다** — 전 픽셀 스캔은 큰 시트에서 못 쓴다.
   * 각 x 열의 현재 점유 최고선을 들고, 조각 폭 구간의 최댓값을 후보 y 로 삼는다.
   */
  /**
   * ★순수 bottom-left: y 를 바깥 루프로 돌며 **첫 가능 위치**를 잡는다.
   *
   * 처음엔 스카이라인으로 후보를 줄이는 "최적화"를 했는데 실측에서 **더 느리고 더 나빴다**
   * (삼각형 20개: 순수 BL 360px·13ms vs 스카이라인 528px·198ms). 스카이라인은 조각 폭 전체의
   * 최고점에서 출발하므로 오목한 틈을 놓치고, 그걸 만회하려 아래로 파고들면 검사 횟수만 늘었다.
   * 순수 BL 은 첫 발견 즉시 반환하므로 대개 낮은 y 에서 끝난다 — 단순한 쪽이 빠르고 촘촘하다.
   *
   * 유일한 최적화 = `minSky` 아래는 건너뛴다(모든 열이 그보다 높으면 그 위로만 놓인다).
   */
  function placeOne(bits, SWW, SW, SH, sky, p, step) {
    var minSky = Infinity
    for (var k = 0; k < SW; k++) if (sky[k] < minSky) minSky = sky[k]
    var y0 = Math.max(0, Math.floor((minSky - p.H) / step) * step)
    for (var y = y0; y + p.H <= SH; y += step) {
      for (var x = 0; x + p.W <= SW; x += step) {
        if (fitsBits(bits, SWW, p, x, y)) return { x: x, y: y, top: y + p.H }
      }
    }
    return null
  }

  function updateSky(sky, p, ox, oy) {
    // 열별 최하단 잉크는 팩할 때 이미 구해 뒀다(`lastY`) — 여기서 매번 훑던 O(W·H) 가 O(W) 가 된다.
    for (var x = 0; x < p.W; x++) {
      var last = p.lastY[x]
      if (last < 0) continue
      var top = oy + last + 1
      if (top > sky[ox + x]) sky[ox + x] = top
    }
  }

  /**
   * 다중 시트 네스팅.
   * @param pieces [{id, W, H, m}]  — gap 팽창은 호출자가 미리 적용(offsetMask(gap/2))
   * @param opts {sheetW, sheetH, step, rotations, maxSheets}
   *   sheetH = 0 이면 **롤**(길이 무제한) — 한 장만 쓰고 사용 길이를 보고한다.
   * @returns {sheets:[{placements:[{id,x,y,rot,W,H}], usedH, inkPx}], unplaced:[id], efficiency}
   */
  /**
   * 다중 시트 네스팅 — **여러 투입 순서를 돌려 가장 좋은 결과**를 쓴다(GRASP 계열의 최소 형태).
   *
   * 순서 하나만 쓰면 안 되는 이유는 실측이 보여줬다: "큰 것 먼저"가 정석인데 삼각형 케이스에서는
   * 입력 순서(544px → 360px)가 훨씬 나았다 — 서로 맞물리게 배치된 순서를 정렬이 깨뜨린다.
   * 반대로 무작위 크기가 섞인 벤치마크에서는 큰 것 먼저가 유리하다. **한쪽을 고를 근거가 없으므로 다 돌린다.**
   *
   * 비용: 한 번이 수십~수백 ms 라 6~8회를 돌려도 실사용(조각 수십 개)에서 체감되지 않는다.
   * `opts.tries` 로 조절(기본 8, 최소 4 = 결정적 순서 4종).
   */
  function nest(pieces, opts) {
    opts = opts || {}
    // 조각이 적으면 정밀하게, 많으면 성글게 — 사용자가 초 단위로 기다리는 도구다.
    var n = pieces.length
    var coarse = opts.step || (n <= 20 ? 2 : n <= 60 ? 3 : 4)
    var tries = opts.tries || (n <= 20 ? 8 : n <= 60 ? 6 : 4)

    // ★2단계: ①성근 격자로 여러 투입 순서를 훑고 ②이긴 순서만 촘촘한 격자로 다시 돈다.
    //   step 이 품질을 좌우하는데(벤치마크 평균격차 step3 18.0 → step1 16.4%p) 전부 촘촘히 돌면
    //   느리다. 순서 선택은 성글어도 대체로 같은 결론이 나오므로 마무리에만 정밀도를 쓴다.
    // ★회전·트림·팩 캐시를 **전 순서가 공유**한다 — 순서마다 다시 만들 이유가 없다(격자와도 무관).
    var cache = new Map()
    var cands = buildOrders(pieces, tries)
    var best = null, bestScore = Infinity, bestOrder = null
    for (var i = 0; i < cands.length; i++) {
      var r = nestOnce(cands[i], withStep(opts, coarse), cache)
      var s = scoreOf(r)
      if (s < bestScore) { bestScore = s; best = r; bestOrder = cands[i] }
    }
    var fine = Math.max(1, coarse >> 1)
    if (fine < coarse && bestOrder) {
      var r2 = nestOnce(bestOrder, withStep(opts, fine), cache)
      if (scoreOf(r2) < bestScore) best = r2
    }
    return best
  }

  function withStep(opts, step) {
    var o = {}
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k]
    o.step = step
    return o
  }

  /** 투입 순서 후보 — 결정적 4종 + 나머지는 셔플. 셔플은 시드 고정(재현 가능해야 하네스가 성립한다). */
  function buildOrders(pieces, tries) {
    var byInk = function (p, q) { return inkOf(q) - inkOf(p) }
    var byH = function (p, q) { return (q.H - p.H) || (q.W - p.W) }
    var byW = function (p, q) { return (q.W - p.W) || (q.H - p.H) }
    var out = [
      pieces.slice(),                    // 입력 순서 — 맞물리게 배치된 원본을 존중
      pieces.slice().sort(byInk),        // 면적 큰 것 먼저(정석)
      pieces.slice().sort(byH),          // 키 큰 것 먼저
      pieces.slice().sort(byW),          // 폭 넓은 것 먼저
    ]
    var seed = 12345
    var rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    while (out.length < tries) {
      var a = pieces.slice()
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1))
        var t = a[i]; a[i] = a[j]; a[j] = t
      }
      out.push(a)
    }
    return out.slice(0, Math.max(1, tries))
  }

  /** 낮을수록 좋다: 미배치 최우선 → 시트 수 → 사용 길이 */
  function scoreOf(r) {
    var used = 0
    for (var i = 0; i < r.sheets.length; i++) used += r.sheets[i].usedH
    return r.unplaced.length * 1e9 + r.sheets.length * 1e6 + used
  }

  function nestOnce(order, opts, cache) {
    var SW = opts.sheetW
    var roll = !opts.sheetH
    var SH = roll ? (opts.rollMaxH || 100000) : opts.sheetH
    var step = opts.step || 4
    var rots = opts.rotations || [0]
    var maxSheets = opts.maxSheets || (roll ? 1 : 50)
    var SWW = (SW + 31) >>> 5            // 행당 32비트 워드 수 — 시트 메모리도 1/8 이 된다
    if (!cache) cache = new Map()        // 단독 호출(하네스 등)에서도 동작해야 한다

    var sheets = []
    var unplaced = []
    var remain = order.slice()

    while (remain.length && sheets.length < maxSheets) {
      var bits = new Uint32Array(SWW * SH)
      var sky = new Int32Array(SW)
      var placements = []
      var next = []
      var usedH = 0

      for (var i = 0; i < remain.length; i++) {
        var src = remain[i]
        var best = null
        for (var r = 0; r < rots.length; r++) {
          var cand = getCand(cache, src, rots[r])
          if (!cand || cand.W > SW || cand.H > SH) continue
          var pos = placeOne(bits, SWW, SW, SH, sky, cand, step)
          if (!pos) continue
          // 회전 후보들 사이에서도 같은 기준(최고점 최소)으로 고른다
          if (!best || pos.top < best.pos.top || (pos.top === best.pos.top && pos.x < best.pos.x)) {
            best = { pos: pos, piece: cand, rot: rots[r] }
          }
        }
        if (!best) { next.push(src); continue }
        // ★밀어붙이기 (2026-08-06) — 후보 자리는 `step` 격자에서만 찾는다. step 2 · 0.5mm/px 면
        //   가로로 최대 1mm 가 남고, 맞붙임(여백·간격 0)에서는 그게 그대로 **벌어진 틈**이 된다.
        //   실사용 보고: 간격 0 인데 조각 하나가 살짝 떨어졌다.
        //   찾기는 성글게 하되(빠르다) **놓기 직전에 1px 씩 왼쪽·위로 붙인다** — 탐색량은 그대로고
        //   충돌 판정은 이미 있는 비트 연산(fitsBits)이라 조각당 몇 번의 비교로 끝난다.
        //   ⚠️ 간격은 마스크 팽창으로 이미 들어가 있다 — 여기서 붙여도 칼선 간격은 보장된다.
        // ★미끄러지는 거리는 **step 미만으로 충분하다.** placeOne 은 step 격자의 모든 자리를
        //   이미 검사했으므로, 지금 자리보다 step 이상 왼쪽에 들어갈 곳이 있었다면 거기서 잡혔다.
        //   남는 것은 격자 사이에 낀 나머지(< step)뿐이다.
        //   ⚠️ 이 상한이 없으면 조각이 수천 px 를 미끄러지며 매번 마스크 전체 충돌검사를 돌려
        //      "배치 계산 중..." 에서 멈춘 것처럼 보인다(2026-08-06 실사용에서 발생).
        //      비용 = 조각당 최대 3·(step-1) 회. step 2 면 3회다.
        if (opts.compact !== false && step > 1) {
          var cx = best.pos.x, cy = best.pos.y, lim = step - 1, k2
          for (k2 = 0; k2 < lim && cx > 0 && fitsBits(bits, SWW, best.piece, cx - 1, cy); k2++) cx--
          for (k2 = 0; k2 < lim && cy > 0 && fitsBits(bits, SWW, best.piece, cx, cy - 1); k2++) cy--
          // 위로 붙인 뒤 왼쪽이 더 열릴 수 있다(계단 모양) — 한 번 더 훑는다
          for (k2 = 0; k2 < lim && cx > 0 && fitsBits(bits, SWW, best.piece, cx - 1, cy); k2++) cx--
          best.pos.x = cx; best.pos.y = cy
        }
        stampBits(bits, SWW, best.piece, best.pos.x, best.pos.y)
        updateSky(sky, best.piece, best.pos.x, best.pos.y)
        placements.push({
          id: src.id, x: best.pos.x, y: best.pos.y, rot: best.rot,
          W: best.piece.W, H: best.piece.H,
        })
        if (best.pos.y + best.piece.H > usedH) usedH = best.pos.y + best.piece.H
      }

      if (!placements.length) { unplaced = remain.slice(); break }   // 아무것도 못 놓으면 무한루프 방지
      var inkPx = 0
      for (var s = 0; s < bits.length; s++) { var bv = bits[s]; if (bv) inkPx += popcnt(bv) }
      sheets.push({ placements: placements, usedH: usedH, inkPx: inkPx })
      remain = next
    }
    if (remain.length) for (var u = 0; u < remain.length; u++) unplaced.push(remain[u].id)

    var totalArea = 0, totalInk = 0
    for (var t = 0; t < sheets.length; t++) {
      totalArea += SW * (roll ? sheets[t].usedH : SH)
      totalInk += sheets[t].inkPx
    }
    return {
      sheets: sheets,
      unplaced: unplaced,
      efficiency: totalArea ? (totalInk / totalArea) : 0,
      roll: roll,
    }
  }

  return { nest: nest, rotate: rotate, trim: trim, fits: fits, rot90: rot90 }
})
