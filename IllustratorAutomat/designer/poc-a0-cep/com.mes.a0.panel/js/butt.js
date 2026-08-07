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
  function isRectish(mask, minFill) {
    if (!mask || !mask.W || !mask.H) return false
    var need = (minFill === undefined) ? 0.98 : minFill
    var n = 0
    for (var i = 0; i < mask.m.length; i++) if (mask.m[i]) n++
    return n / (mask.W * mask.H) >= need
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

  return { isRectish: isRectish, packRects: packRects, cutSegments: cutSegments, anyOverlap: anyOverlap }
})
