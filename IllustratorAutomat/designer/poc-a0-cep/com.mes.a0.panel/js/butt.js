/**
 * 맞붙임 — **mm 배치 + 공유 변 단일 출력**
 *
 * 왜 별도 모듈인가 (2026-08-06 재설계, spec `2026-08-06-butt-exact-and-cutline-weld.md`):
 *   맞붙임(여백 0·간격 0)의 목적은 **재단을 한 번만** 하는 것이다. 래스터 네스터로는 원리상 안 된다 —
 *   좌표가 픽셀 격자에 양자화돼 최대 한 칸 어긋나고, 어긋나면 칼선이 두 줄로 남는다.
 *   그런데 픽셀 격자는 **일러의 제약이 아니라 우리가 만든 제약**이다. 일러는 부동소수 좌표를 그대로 받는다.
 *   맞붙임에 필요한 건 탐색이 아니라 산수라서, 네스터를 안 거치면 오차가 애초에 생기지 않는다.
 *
 *   그리고 어느 변이 맞닿는지는 **배치를 만든 쪽이 이미 안다**. 나중에 오차로 다시 찾을 이유가 없다
 *   → 사후 용접이 아니라 처음부터 한 번만 그린다. 허용오차 개념이 사라지므로
 *     "안 붙은 선을 잘못 합쳐 재단 위치가 옮겨지는" 위험도 함께 사라진다.
 *
 * ⚠️ 정본은 이 파일이다. Node 하네스(`npm run cut:butt`)가 **이 파일을 직접 검증**한다
 *    (geometry.js·nesting.js·bleed.js 와 같은 원칙 — 검증한 코드 = 배포된 코드).
 * ⚠️ 단위는 전부 **mm**. 픽셀은 이 모듈에 등장하지 않는다.
 */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.MesCutButt = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /**
   * 조각이 직사각에 가까운가 — 잉크가 자기 bbox 를 얼마나 채우는지로 본다.
   * 이형끼리는 붙여도 칼선이 애초에 안 맞으므로, 하나라도 아니면 맞붙임을 쓰지 않는다.
   * @param mask {W,H,m} 팽창 전 마스크  @param minFill 기본 0.98
   */
  /**
   * 잉크가 실제로 차지하는 사각 범위. **패딩을 걷어내는 것이 목적**이다.
   * 굽기는 `padMm`(≥1mm) 만큼 투명 여백을 두르므로, 캔버스 귀퉁이는 직사각이라도 늘 비어 있다.
   * @returns {L,T,R,B,W,H} 또는 잉크가 없으면 null
   */
  function inkBBox(mask) {
    var W = mask.W, H = mask.H, m = mask.m
    var L = W, T = H, R = -1, B = -1
    for (var y = 0; y < H; y++) {
      var row = y * W
      for (var x = 0; x < W; x++) {
        if (!m[row + x]) continue
        if (x < L) L = x
        if (x > R) R = x
        if (y < T) T = y
        if (y > B) B = y
      }
    }
    if (R < L || B < T) return null
    return { L: L, T: T, R: R, B: B, W: R - L + 1, H: B - T + 1 }
  }

  function isRectish(mask, minFill) {
    if (!mask || !mask.W || !mask.H) return false
    // ★★판정은 **잉크 bbox 안에서** 한다 (2026-08-07 실사용 — 이걸 빼먹어 전부 이형으로 떨어졌다).
    //   굽기가 pad(≥1mm)를 두르므로 캔버스 귀퉁이는 **직사각이어도 항상 비어 있다.**
    //   그대로 모서리를 보면 모든 조각이 "라운드/이형"으로 판정돼 맞붙임이 **한 번도 안 켜진다**
    //   — 실제로 그렇게 한 세션을 날렸고, 화면에는 "조각 #0 가 직사각이 아님"이라는 **틀린 사유**가 떴다.
    var bb = inkBBox(mask)
    if (!bb) return false
    var src = mask
    if (bb.L !== 0 || bb.T !== 0 || bb.W !== mask.W || bb.H !== mask.H) {
      var cm = new Uint8Array(bb.W * bb.H)
      for (var yy = 0; yy < bb.H; yy++) {
        var sr = (bb.T + yy) * mask.W + bb.L, dr = yy * bb.W
        for (var xx = 0; xx < bb.W; xx++) cm[dr + xx] = mask.m[sr + xx]
      }
      src = { W: bb.W, H: bb.H, m: cm }
    }
    var W = src.W, H = src.H, m = src.m
    // ★★ 모서리 4곳에 잉크가 있어야 한다 (2026-08-06 용준님 지적).
    //   채움 비율만으로는 **라운드 사각을 못 거른다** — 100×50 에 반경 5mm 면 잃는 면적이
    //   r²(4−π) ≈ 21.5mm² = 0.43% 뿐이라 98% 기준을 그냥 통과한다.
    //   그대로 두면 직사각으로 보고 **직선 공유 변**을 그어 **라운드가 조용히 각지게 된다**
    //   — 제품이 달라지는 사고다. 모서리는 라운드 여부를 곧바로 가르므로 이걸 먼저 본다.
    //   ⚠️ 안티앨리어싱이 맨 끝 1px 을 비울 수 있어 **1px 안쪽**을 본다. 2px 로 하면 반경 6px 짜리
    //      모서리 안쪽에 들어가 버려 라운드를 직사각으로 오판한다(하네스가 잡았다).
    //      역으로 반경이 1~2px(해상도에 따라 0.25~0.5mm)면 통과하는데, 그 정도는 사실상 각진 모서리다.
    var d = (W > 3 && H > 3) ? 1 : 0
    var corners = [
      m[d * W + d], m[d * W + (W - 1 - d)],
      m[(H - 1 - d) * W + d], m[(H - 1 - d) * W + (W - 1 - d)],
    ]
    for (var c = 0; c < 4; c++) if (!corners[c]) return false
    // 채움 비율은 **경계 1px 을 빼고** 잰다 — 그 링은 안티앨리어싱 산물이라 조각이 작을수록
    //   비율을 크게 왜곡한다(100×100 이면 4%, 2000×1000 이면 0.3%). 빼지 않으면 같은 직사각이
    //   **크기에 따라** 통과/탈락이 갈린다 — 작은 스티커가 맞붙임에서 빠지는 게 정확히 그 경우다.
    //   모서리 라운드는 위에서 이미 걸렀으므로, 여기 남은 역할은 "변 중간이 파인" 도형 배제다.
    var x0 = (W > 2) ? 1 : 0, x1 = (W > 2) ? W - 1 : W
    var y0 = (H > 2) ? 1 : 0, y1 = (H > 2) ? H - 1 : H
    var need = (minFill === undefined) ? 0.98 : minFill
    var n = 0
    for (var y = y0; y < y1; y++) {
      var row = y * W
      for (var x = x0; x < x1; x++) if (m[row + x]) n++
    }
    var area = (x1 - x0) * (y1 - y0)
    return area > 0 && n / area >= need
  }

  /**
   * 선반(shelf) 배치 — 간격 0 이라 조각도 행도 서로 맞닿는다.
   *
   * 높이 내림차순으로 넣는다: 행 높이는 그 행에서 가장 높은 조각이 정하므로,
   * 큰 것부터 넣어야 행 안의 낭비가 줄어든다(고전 shelf 휴리스틱, NFH).
   * ★정렬은 **안정적**이어야 한다 — 같은 크기 조각의 순서가 실행마다 바뀌면 하네스가 성립하지 않는다.
   *
   * @param rects [{id, w, h}] mm
   * @param sheetWmm 배치 가능 폭(돔보 여백은 호출자가 이미 뺀 값)
   * @returns {placements:[{id,x,y,w,h}], usedW, usedH, unplaced:[id]}
   */
  function packRects(rects, sheetWmm) {
    var list = []
    for (var i = 0; i < rects.length; i++) list.push({ id: rects[i].id, w: rects[i].w, h: rects[i].h, i: i })
    list.sort(function (a, b) { return (b.h - a.h) || (b.w - a.w) || (a.i - b.i) })

    var placements = [], unplaced = []
    var x = 0, y = 0, rowH = 0, usedW = 0
    for (var k = 0; k < list.length; k++) {
      var p = list[k]
      if (p.w > sheetWmm) { unplaced.push(p.id); continue }   // 폭보다 넓으면 어떤 행에도 못 넣는다
      if (x > 0 && x + p.w > sheetWmm) { y += rowH; x = 0; rowH = 0 }   // 행 바꿈
      placements.push({ id: p.id, x: x, y: y, w: p.w, h: p.h })
      x += p.w
      if (x > usedW) usedW = x
      if (p.h > rowH) rowH = p.h
    }
    return { placements: placements, usedW: usedW, usedH: y + rowH, unplaced: unplaced }
  }

  /**
   * 배치된 사각들의 경계를 **선분 집합**으로. 맞닿은 변은 **한 번만** 나온다.
   *
   * 세로선 = x 가 같은 변끼리 y 구간을 합집합 · 가로선 = y 가 같은 변끼리 x 구간을 합집합.
   * ★끝점만 닿은 구간도 합친다 — 재단기가 끊지 않고 한 번에 지나가는 게 맞다.
   * ★오차 판정이 없다. 좌표는 packRects 가 만든 값이라 인접 변은 **비트 단위로 같다**.
   *   (여기에 허용오차를 넣으면 안 붙은 선까지 합쳐 재단 위치가 옮겨진다 — 그래서 일부러 안 넣는다)
   *
   * @returns [{x1,y1,x2,y2}] — 세로선은 x1===x2, 가로선은 y1===y2
   */
  function cutSegments(placements) {
    var vert = {}, horz = {}
    function add(map, key, a, b) {
      var s = String(key)
      if (!map[s]) map[s] = []
      map[s].push(a < b ? [a, b] : [b, a])
    }
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i]
      var x0 = p.x, x1 = p.x + p.w, y0 = p.y, y1 = p.y + p.h
      add(vert, x0, y0, y1)
      add(vert, x1, y0, y1)
      add(horz, y0, x0, x1)
      add(horz, y1, x0, x1)
    }
    var out = []
    function flush(map, vertical) {
      for (var key in map) {
        if (!Object.prototype.hasOwnProperty.call(map, key)) continue
        var iv = map[key]
        iv.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1] })
        var curA = iv[0][0], curB = iv[0][1]
        for (var j = 1; j < iv.length; j++) {
          if (iv[j][0] <= curB) {                 // 겹치거나 끝점이 닿는다 → 잇는다
            if (iv[j][1] > curB) curB = iv[j][1]
          } else {
            out.push(seg(key, curA, curB, vertical))
            curA = iv[j][0]; curB = iv[j][1]
          }
        }
        out.push(seg(key, curA, curB, vertical))
      }
    }
    function seg(key, a, b, vertical) {
      var c = parseFloat(key)
      return vertical ? { x1: c, y1: a, x2: c, y2: b } : { x1: a, y1: c, x2: b, y2: c }
    }
    flush(vert, true)
    flush(horz, false)
    return out
  }

  /** 배치가 서로 겹치지 않는가 — 하네스·배선 양쪽에서 쓰는 안전 확인. */
  function anyOverlap(placements) {
    for (var i = 0; i < placements.length; i++) {
      for (var j = i + 1; j < placements.length; j++) {
        var a = placements[i], b = placements[j]
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return true
      }
    }
    return false
  }

  return {
    isRectish: isRectish, inkBBox: inkBBox,
    packRects: packRects, cutSegments: cutSegments, anyOverlap: anyOverlap,
  }
})
