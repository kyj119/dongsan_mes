/**
 * 재단 패널 — 칼선 기하 엔진 (의존성 0)
 *
 * spec = docs/superpowers/specs/2026-07-31-cut-file-panel.md §4
 * 파이프라인: 마스크 → 거리변환(EDT) → 오프셋 임계 → 컨투어 추적 → 단순화
 *
 * ★이 파일이 정본이다. **패널(CEP)과 하네스(Node)가 같은 파일을 쓴다** —
 *   `scripts/cut/bench.mjs` 가 이걸 직접 로드해 검증하므로, 검증되는 코드가 곧 배포되는 코드다.
 *   (복제하면 하네스는 통과하는데 패널은 다른 코드를 도는 상태가 만들어진다)
 *
 * 순수 계산만 담는다(D5: 일러는 그리기만 한다). PNG 디코딩·파일 I/O 는 여기 없다 —
 *   CEP 는 canvas 로, Node 는 scripts/cut/geometry.mjs 의 디코더로 각자 마스크를 만들어 넘긴다.
 *
 * ⚠️ 해상도가 비용을 결정한다(§4.3). CNC 판 122×207cm 기준
 *    1.0mm/px = 2.5M px·124ms / 0.5mm/px = 10.1M px·524ms / 0.25mm/px = 40.4M px·2.5s
 *    → 0.5mm/px 가 상한. CEP 는 CEF 안이라 메모리 제약이 있다.
 */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.MesCutGeom = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /**
   * 잉크 마스크. img = {W,H,ch,data} (ch=4 면 RGBA — canvas ImageData 와 동일 레이아웃)
   * ⚠️ mode='alpha' 는 실데이터에서 성립하지 않는 경우가 많다 — prod 썸네일 7건 실측 시
   *    투명 픽셀 0~1.2%, 3건은 알파 채널조차 없었다. 재단 대상은 알파가 아니라
   *    **일러에서 흰 배경 위에 렌더한 결과**에서 얻으므로 기본은 'white'(흰 배경 제거)다.
   */
  function inkMask(img, mode, alphaThr, whiteThr) {
    mode = mode || 'white'
    alphaThr = (alphaThr === undefined) ? 16 : alphaThr
    whiteThr = (whiteThr === undefined) ? 247 : whiteThr
    var W = img.W, H = img.H, ch = img.ch || 4, data = img.data
    var m = new Uint8Array(W * H)
    for (var i = 0, n = W * H; i < n; i++) {
      var o = i * ch
      var a = ch === 4 ? data[o + 3] : 255
      if (mode === 'alpha') { m[i] = a >= alphaThr ? 1 : 0; continue }
      if (a < alphaThr) { m[i] = 0; continue }
      m[i] = (data[o] >= whiteThr && data[o + 1] >= whiteThr && data[o + 2] >= whiteThr) ? 0 : 1
    }
    return m
  }

  // ── 연결요소 (4-이웃) ─────────────────────────────────────────────
  function components(mask, W, H, target) {
    target = (target === undefined) ? 1 : target
    var lab = new Int32Array(W * H)
    for (var z = 0; z < lab.length; z++) lab[z] = -1
    var sizes = []
    var stack = []
    for (var i = 0; i < W * H; i++) {
      if (mask[i] !== target || lab[i] >= 0) continue
      var id = sizes.length, sz = 0
      stack.push(i); lab[i] = id
      while (stack.length) {
        var p = stack.pop(); sz++
        var x = p % W, y = (p / W) | 0
        if (x > 0 && mask[p - 1] === target && lab[p - 1] < 0) { lab[p - 1] = id; stack.push(p - 1) }
        if (x < W - 1 && mask[p + 1] === target && lab[p + 1] < 0) { lab[p + 1] = id; stack.push(p + 1) }
        if (y > 0 && mask[p - W] === target && lab[p - W] < 0) { lab[p - W] = id; stack.push(p - W) }
        if (y < H - 1 && mask[p + W] === target && lab[p + W] < 0) { lab[p + W] = id; stack.push(p + W) }
      }
      sizes.push(sz)
    }
    return { lab: lab, sizes: sizes }
  }

  // ── Moore 외곽 추적 ──────────────────────────────────────────────
  var DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  function traceComponent(lab, id, W, H) {
    function at(x, y) { return (x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === id) }
    var sx = -1, sy = -1
    for (var y0 = 0; y0 < H && sx < 0; y0++) {
      for (var x0 = 0; x0 < W; x0++) if (at(x0, y0)) { sx = x0; sy = y0; break }
    }
    if (sx < 0) return []
    var poly = []
    var cx = sx, cy = sy, dir = 6, guard = 0
    do {
      poly.push([cx, cy])
      var found = false
      for (var k = 0; k < 8; k++) {
        var nd = (dir + 6 + k) % 8
        var nx = cx + DIRS[nd][0], ny = cy + DIRS[nd][1]
        if (at(nx, ny)) { cx = nx; cy = ny; dir = nd; found = true; break }
      }
      if (!found) break
    } while (!(cx === sx && cy === sy) && ++guard < W * H * 4)
    return poly
  }

  /**
   * ★ 모든 잉크 성분의 외곽선. **재단에서는 이것이 정본이다.**
   * 최대 성분만 추적하면 나머지 조각이 유실돼 **잘려나간다**(합성 도형 실측 면적오차 50.6%).
   * @param minPx 이보다 작은 성분은 노이즈로 버린다(안티앨리어싱 파편 제거)
   */
  function traceAll(mask, W, H, minPx) {
    minPx = (minPx === undefined) ? 4 : minPx
    var c = components(mask, W, H, 1)
    var out = []
    for (var id = 0; id < c.sizes.length; id++) {
      if (c.sizes[id] < minPx) continue
      var poly = traceComponent(c.lab, id, W, H)
      if (poly.length >= 3) out.push({ poly: poly, px: c.sizes[id] })
    }
    out.sort(function (a, b) { return b.px - a.px })
    return out
  }

  /**
   * ★구멍(내부 홀) 추출. 배경(0) 성분 중 **이미지 테두리에 닿지 않는 것**이 곧 구멍이다.
   *
   * 이게 없으면 `ㅇ·ㅁ·ㅂ·0·8·A·B` 같은 글자의 속이 안 뚫린다 — 시트컷팅 주류가 글자라
   * 실무에서 바로 문제가 된다(2026-07-31 실측: ㅇ자 면적오차 53.2% → 구멍 추출 후 0.2%).
   *
   * ⚠️ **오프셋을 적용한 마스크에 대해 호출할 것**. 그래야 구멍이 함께 축소되고,
   *    오프셋이 구멍 반지름을 넘으면 구멍이 사라진다(칼날이 못 들어가는 물리와 일치).
   *    실측: 구멍 반지름 120px 기준 offset 10/40/100 → 110/80/20, offset 130 → 소멸.
   *
   * @returns [{poly, px}] — 각 구멍의 외곽 폴리곤(픽셀 좌표)
   */
  /**
   * ★속을 메운다 — 바깥에서 못 닿는 배경을 전부 잉크로 바꾼다 (2026-08-27).
   *
   * 왜 필요한가 (실물 sample1.ai 로 실측):
   *   "테두리 사각 + 안쪽 글자" 조각은 잉크가 **테두리 링 + 글자들**뿐이라 조각 bbox 의
   *   **14.4% 만 채워진다**. 그러면 세 가지가 한꺼번에 무너진다 —
   *     ① 네스터가 테두리 안쪽 빈 공간을 "쓸 수 있는 자리"로 보고 **다른 조각을 밀어 넣는다**
   *        (실측: 조각 #1 이 #0 의 x범위 안으로 102mm 파고들었다)
   *     ② `mainPart` 가 얇은 테두리 링보다 **글자 한 덩어리**를 본체로 골라
   *        `isRectish` 가 64% 로 떨어지고 **맞붙임이 거절**된다 → 맞닿은 변이 두 줄로 잘린다
   *     ③ `traceAll`·`findHoles` 가 글자마다·글자 속마다 칼선을 낸다 (실측 10줄)
   *   메우면 채움 98.9% · isRectish true · 칼선 1줄 · 끼어들기 0 — **판 길이는 그대로**였다.
   *
   * 경계에서 시작하는 flood fill 이라 **바깥 배경만** 배경으로 남는다.
   * ⚠️ 원본을 바꾸지 않는다 — 새 배열을 돌려준다(호출부가 팽창 전 잉크를 따로 세야 한다).
   */
  function fillHoles(mask, W, H) {
    var n = W * H
    var outside = new Uint8Array(n)
    var st = [], i, x, y
    for (x = 0; x < W; x++) { st.push(x); st.push((H - 1) * W + x) }
    for (y = 0; y < H; y++) { st.push(y * W); st.push(y * W + W - 1) }
    while (st.length) {
      i = st.pop()
      if (i < 0 || i >= n || outside[i] || mask[i]) continue
      outside[i] = 1
      x = i % W; y = (i / W) | 0
      if (x > 0) st.push(i - 1)
      if (x < W - 1) st.push(i + 1)
      if (y > 0) st.push(i - W)
      if (y < H - 1) st.push(i + W)
    }
    var out = new Uint8Array(n)
    for (i = 0; i < n; i++) out[i] = (mask[i] || !outside[i]) ? 1 : 0
    return out
  }

  function findHoles(mask, W, H, minPx) {
    minPx = (minPx === undefined) ? 4 : minPx
    var c = components(mask, W, H, 0)          // 배경 성분
    var edge = {}
    var x, y
    for (x = 0; x < W; x++) {
      var a = c.lab[x], b = c.lab[(H - 1) * W + x]
      if (a >= 0) edge[a] = 1
      if (b >= 0) edge[b] = 1
    }
    for (y = 0; y < H; y++) {
      var l = c.lab[y * W], r = c.lab[y * W + W - 1]
      if (l >= 0) edge[l] = 1
      if (r >= 0) edge[r] = 1
    }
    var holes = []
    for (var id = 0; id < c.sizes.length; id++) {
      if (edge[id] || c.sizes[id] < minPx) continue
      var poly = traceComponent(c.lab, id, W, H)
      if (poly.length >= 3) holes.push({ poly: poly, px: c.sizes[id] })
    }
    holes.sort(function (p, q) { return q.px - p.px })
    return holes
  }

  /**
   * 구멍이 어느 외곽에 속하는지 배정. 재단에서 compound path 를 만들려면 짝이 맞아야 한다.
   * 구멍의 첫 점이 어느 외곽 폴리곤의 bbox 안에 있는지로 고른다(가장 작은 bbox 우선 —
   * 외곽이 중첩된 경우 안쪽 것에 붙어야 한다).
   */
  function assignHoles(outers, holes) {
    var groups = []
    var i
    for (i = 0; i < outers.length; i++) groups.push({ outer: outers[i], holes: [] })
    for (i = 0; i < holes.length; i++) {
      var hb = polyBBox(holes[i].poly)
      var best = -1, bestArea = Infinity
      for (var j = 0; j < outers.length; j++) {
        var ob = polyBBox(outers[j].poly)
        if (hb.L >= ob.L && hb.R <= ob.R && hb.T >= ob.T && hb.B <= ob.B) {
          var area = ob.w * ob.h
          if (area < bestArea) { bestArea = area; best = j }
        }
      }
      if (best >= 0) groups[best].holes.push(holes[i])
    }
    return groups
  }

  /** 최대 성분 1개만. 진단·비교용이며 재단 산출에는 traceAll 을 쓸 것. */
  function traceOuter(mask, W, H) {
    var all = traceAll(mask, W, H, 1)
    if (!all.length) return null
    var c = components(mask, W, H, 1)
    var ink = 0
    for (var i = 0; i < c.sizes.length; i++) ink += c.sizes[i]
    return { poly: all[0].poly, islands: c.sizes.length, inkPx: ink, bigPx: all[0].px }
  }

  // ── Douglas-Peucker ──────────────────────────────────────────────
  function simplify(poly, tol) {
    if (poly.length < 3) return poly
    var keep = new Uint8Array(poly.length)
    keep[0] = keep[poly.length - 1] = 1
    var st = [[0, poly.length - 1]]
    while (st.length) {
      var seg = st.pop(), a = seg[0], b = seg[1]
      var ax = poly[a][0], ay = poly[a][1], bx = poly[b][0], by = poly[b][1]
      var dx = bx - ax, dy = by - ay
      var L = Math.sqrt(dx * dx + dy * dy) || 1
      var bi = -1, bd = tol
      for (var i = a + 1; i < b; i++) {
        var d = Math.abs((poly[i][0] - ax) * dy - (poly[i][1] - ay) * dx) / L
        if (d > bd) { bd = d; bi = i }
      }
      if (bi > 0) { keep[bi] = 1; st.push([a, bi], [bi, b]) }
    }
    var res = []
    for (var j = 0; j < poly.length; j++) if (keep[j]) res.push(poly[j])
    return res
  }

  // ── 곡선 피팅 (Schneider, Graphics Gems) ─────────────────────────
  //
  // ★왜 필요한가: 컨투어 추적은 **픽셀 계단**을 낳고 단순화는 그것을 직선으로만 잇는다.
  //   네스팅 조각 칼선은 해상도가 거칠어(1mm/px) 원 둘레가 정점 18개짜리 다각형으로 나왔다
  //   — 재단물에서 눈에 보인다(2026-07-31 용준님 지적).
  //
  // 거리변환 오프셋은 **항상 라운드 조인**이라(§4.6) 곡선이 오히려 물리에 맞다. 다만 글자·로고의
  // **진짜 코너까지 둥글게 만들면 안 되므로**, 먼저 코너에서 끊고 각 구간을 따로 피팅한다.

  function vSub(a, b) { return [a[0] - b[0], a[1] - b[1]] }
  function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1]] }
  function vMul(a, s) { return [a[0] * s, a[1] * s] }
  function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] }
  function vLen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]) }
  function vUnit(a) { var l = vLen(a); return l ? [a[0] / l, a[1] / l] : [0, 0] }

  /** 큐빅 베지어 c=[p0,c1,c2,p1] 위의 점 */
  function bezAt(c, t) {
    var mt = 1 - t, b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t
    return [
      b0 * c[0][0] + b1 * c[1][0] + b2 * c[2][0] + b3 * c[3][0],
      b0 * c[0][1] + b1 * c[1][1] + b2 * c[2][1] + b3 * c[3][1],
    ]
  }

  /** 코드 길이 매개변수화 — 균등 t 보다 실제 형상에 훨씬 잘 맞는다 */
  function chordParams(pts) {
    var u = [0]
    for (var i = 1; i < pts.length; i++) u.push(u[i - 1] + vLen(vSub(pts[i], pts[i - 1])))
    var tot = u[u.length - 1] || 1
    for (var j = 0; j < u.length; j++) u[j] /= tot
    return u
  }

  /** 양 끝점·양 끝 접선을 고정하고 제어점 거리만 최소제곱으로 푼다 */
  function genBezier(pts, u, t1, t2) {
    var n = pts.length, first = pts[0], last = pts[n - 1]
    var c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0
    for (var i = 0; i < n; i++) {
      var t = u[i], mt = 1 - t
      var a1 = vMul(t1, 3 * mt * mt * t), a2 = vMul(t2, 3 * mt * t * t)
      c00 += vDot(a1, a1); c01 += vDot(a1, a2); c11 += vDot(a2, a2)
      var b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t
      var tmp = [
        pts[i][0] - (first[0] * (b0 + b1) + last[0] * (b2 + b3)),
        pts[i][1] - (first[1] * (b0 + b1) + last[1] * (b2 + b3)),
      ]
      x0 += vDot(a1, tmp); x1 += vDot(a2, tmp)
    }
    var det = c00 * c11 - c01 * c01
    var al1 = 0, al2 = 0
    if (Math.abs(det) > 1e-12) { al1 = (x0 * c11 - x1 * c01) / det; al2 = (c00 * x1 - c01 * x0) / det }
    // 해가 음수/특이면 wu-barsky 휴리스틱(코드 길이의 1/3)으로 되돌린다
    var seg = vLen(vSub(last, first))
    if (!(al1 > 1e-6 * seg) || !(al2 > 1e-6 * seg)) { al1 = al2 = seg / 3 }
    // ★핸들이 코드 길이를 넘지 않게 막는다 — 끝 접선이 조금만 어긋나도 최소제곱이
    //   긴 핸들로 보상하려다 경로가 부풀어 오른다(재단선이 실제로 밖으로 튀어나온다).
    if (al1 > seg) al1 = seg
    if (al2 > seg) al2 = seg
    return [first, vAdd(first, vMul(t1, al1)), vAdd(last, vMul(t2, al2)), last]
  }

  function maxErr(pts, u, c) {
    var m = 0, idx = Math.floor(pts.length / 2)
    for (var i = 1; i < pts.length - 1; i++) {
      var d = vSub(bezAt(c, u[i]), pts[i])
      var e = d[0] * d[0] + d[1] * d[1]
      if (e > m) { m = e; idx = i }
    }
    return { err: Math.sqrt(m), idx: idx }
  }

  /** Newton-Raphson 로 t 를 곡선에 되맞춘다 — 이것만으로 분할 횟수가 크게 준다 */
  function reparam(pts, u, c) {
    var out = []
    for (var i = 0; i < pts.length; i++) {
      var t = u[i], mt = 1 - t
      var d1 = [
        3 * mt * mt * (c[1][0] - c[0][0]) + 6 * mt * t * (c[2][0] - c[1][0]) + 3 * t * t * (c[3][0] - c[2][0]),
        3 * mt * mt * (c[1][1] - c[0][1]) + 6 * mt * t * (c[2][1] - c[1][1]) + 3 * t * t * (c[3][1] - c[2][1]),
      ]
      var d2 = [
        6 * mt * (c[2][0] - 2 * c[1][0] + c[0][0]) + 6 * t * (c[3][0] - 2 * c[2][0] + c[1][0]),
        6 * mt * (c[2][1] - 2 * c[1][1] + c[0][1]) + 6 * t * (c[3][1] - 2 * c[2][1] + c[1][1]),
      ]
      var q = vSub(bezAt(c, t), pts[i])
      var den = vDot(d1, d1) + vDot(q, d2)
      out.push(den === 0 ? t : Math.min(1, Math.max(0, t - vDot(q, d1) / den)))
    }
    return out
  }

  function fitCubic(pts, t1, t2, tol, depth, acc) {
    if (pts.length < 2) return
    if (pts.length === 2) {
      var d = vLen(vSub(pts[1], pts[0])) / 3
      acc.push([pts[0], vAdd(pts[0], vMul(t1, d)), vAdd(pts[1], vMul(t2, d)), pts[1]])
      return
    }
    // ★★"원본 bbox 밖으로 튀어나갔는가" 도 **분할 사유**다 (2026-08-07 실사용).
    //
    //   거리 오차(maxErr)는 곡선이 표본점에 얼마나 가까운지만 본다. 그런데 직선 구간과 호가
    //   **한 베지어를 공유**하면, 표본점 근처는 다 지나가면서도 전환부에서 **바깥으로 부푼다.**
    //   화면에서는 직선이 호로 넘어가는 자리에 **갈고리처럼 튀어나온 모양**이 된다
    //   (실측 500×350 라운드 사각: 윗변 앵커는 전부 y=980 인데 패스 bbox 상단이 980.16).
    //   3차 베지어는 제어점 껍질을 못 벗어나므로, **껍질이 이 구간 표본의 bbox 안**이면 튐이 없다.
    //   구간 자기 bbox 로 재는 것이 핵심이다 — 전체 bbox 로 재면 정상적인 호까지 걸려 곡선이 꺼진다.
    var lo0 = pts[0][0], hi0 = pts[0][0], lo1 = pts[0][1], hi1 = pts[0][1]
    for (var z = 1; z < pts.length; z++) {
      if (pts[z][0] < lo0) lo0 = pts[z][0]
      if (pts[z][0] > hi0) hi0 = pts[z][0]
      if (pts[z][1] < lo1) lo1 = pts[z][1]
      if (pts[z][1] > hi1) hi1 = pts[z][1]
    }
    var bulge = function (cc) {
      var d = 0, j, p
      for (j = 1; j <= 2; j++) {
        p = cc[j]
        if (lo0 - p[0] > d) d = lo0 - p[0]
        if (lo1 - p[1] > d) d = lo1 - p[1]
        if (p[0] - hi0 > d) d = p[0] - hi0
        if (p[1] - hi1 > d) d = p[1] - hi1
      }
      return d
    }
    var u = chordParams(pts)
    var c = genBezier(pts, u, t1, t2)
    var e = maxErr(pts, u, c)
    if (e.err < tol && bulge(c) <= tol) { acc.push(c); return }
    // 오차가 조금 넘는 정도면 매개변수만 손봐도 들어온다(분할보다 점 수가 적게 나온다)
    if (e.err < tol * tol) {
      for (var k = 0; k < 4; k++) {
        u = reparam(pts, u, c)
        c = genBezier(pts, u, t1, t2)
        e = maxErr(pts, u, c)
        if (e.err < tol && bulge(c) <= tol) { acc.push(c); return }
      }
    }
    if (depth <= 0) { acc.push(c); return }   // 재귀 폭주 방지 — 정확도보다 종료가 우선
    // ★튐 때문에 쪼개는 경우엔 `e.idx` 가 의미 없다(거리 오차는 이미 통과했다) → 가운데서 자른다.
    //   그대로 e.idx(=0 부근)를 쓰면 2점짜리 조각이 반복 생성돼 재귀만 돌고 튐은 안 없어진다.
    var i = (e.err < tol) ? (pts.length >> 1) : e.idx
    i = Math.min(pts.length - 2, Math.max(1, i))
    var center = vUnit(vSub(pts[i - 1], pts[i + 1]))
    fitCubic(pts.slice(0, i + 1), t1, center, tol, depth - 1, acc)
    fitCubic(pts.slice(i), [-center[0], -center[1]], t2, tol, depth - 1, acc)
  }

  /**
   * 코너 검출 — 앞뒤 이웃으로 방향을 재 **꺾임각이 `deg` 이상**이면 코너.
   *
   * ⚠️ 원시 픽셀 컨투어에 그대로 쓰면 계단의 90° 가 전부 코너로 잡힌다.
   *    그래서 `fitCurves` 는 **단순화된 폴리라인**에 대해 이 함수를 부른다(계단이 이미 제거된 상태).
   */
  function findCorners(pts, deg) {
    var n = pts.length, thr = Math.cos(Math.PI * deg / 180), out = []
    for (var i = 0; i < n; i++) {
      var a = vUnit(vSub(pts[i], pts[(i - 1 + n) % n]))
      var b = vUnit(vSub(pts[(i + 1) % n], pts[i]))
      if (!vLen(a) || !vLen(b)) continue
      if (vDot(a, b) < thr) out.push(i)
    }
    return out
  }

  /**
   * ★픽셀 계단 완화 — 이동평균(양 끝점은 고정).
   *
   * 원본 컨투어는 픽셀 경계를 따라가므로 **진폭 ~0.7px(반대각선)의 톱니**를 늘 갖는다.
   * 그 위에 tol=1px 로 곡선을 맞추면 형상이 아니라 **양자화 잡음을 쫓아** 세그먼트가 폭증한다
   * (실측: 원 r=380 이 39 → 134세그). 톱니를 먼저 눕히면 같은 tol 이 형상에만 쓰인다.
   *
   * 코너는 이 함수가 불리기 **전에** 구간으로 잘려 있고 끝점을 고정하므로 뭉개지지 않는다.
   */
  function smoothRun(run, win) {
    var n = run.length
    if (n < 2 * win + 3) return run
    var out = [run[0]]
    for (var i = 1; i < n - 1; i++) {
      var a = i - win; if (a < 0) a = 0
      var b = i + win; if (b > n - 1) b = n - 1
      var sx = 0, sy = 0
      for (var j = a; j <= b; j++) { sx += run[j][0]; sy += run[j][1] }
      out.push([sx / (b - a + 1), sy / (b - a + 1)])
    }
    out.push(run[n - 1])
    return out
  }

  /** 구간 전체 경로길이의 frac 만큼 떨어진 점(fromStart=false 면 끝에서부터) */
  function runPointAt(run, frac, fromStart) {
    var total = 0, i
    for (i = 1; i < run.length; i++) total += vLen(vSub(run[i], run[i - 1]))
    var want = total * frac, acc = 0
    if (fromStart) {
      for (i = 1; i < run.length; i++) { acc += vLen(vSub(run[i], run[i - 1])); if (acc >= want) return run[i] }
      return run[run.length - 1]
    }
    for (i = run.length - 2; i >= 0; i--) { acc += vLen(vSub(run[i + 1], run[i])); if (acc >= want) return run[i] }
    return run[0]
  }

  /**
   * ★끝점 접선을 **한 칸 옆이 아니라 구간 길이의 15% 지점**으로 잡는다.
   *
   * 바로 옆 점으로 잡으면 픽셀 1칸 지그재그가 접선을 45° 틀어 버리고, 최소제곱이 그걸
   * 긴 핸들로 보상하려다 경로가 크게 부푼다 — 실측: L자 세로변에서 제어점이 87px 안으로
   * 밀려 면적오차 3.6%가 났다(칼선이 그만큼 틀리게 나간다).
   */
  function runTangent(run, atStart) {
    var end = atStart ? run[0] : run[run.length - 1]
    var far = runPointAt(run, 0.15, atStart)
    var t = vUnit(vSub(far, end))
    if (vLen(t)) return t
    return atStart ? vUnit(vSub(run[1], run[0])) : vUnit(vSub(run[run.length - 2], run[run.length - 1]))
  }

  /**
   * 닫힌 폴리곤 → 큐빅 베지어 세그먼트 열.
   *
   * @param poly [[x,y],...] 닫힌 컨투어(마지막 점 다음이 첫 점)
   * @param tol 허용오차(px) — 단순화 tol 과 같은 값을 주면 된다
   * @param cornerDeg 이 각도 이상 꺾이면 코너로 보고 곡선을 끊는다(기본 55°).
   *                  글자·로고의 **진짜 코너를 둥글게 만들지 않기 위한 장치**다.
   * @returns [[p0,c1,c2,p1], ...] — 앞 세그먼트의 p1 = 다음 세그먼트의 p0, 마지막 p1 = 첫 p0(닫힘)
   */
  function fitCurves(poly, tol, cornerDeg, smoothWin) {
    if (!poly || poly.length < 4) return []
    tol = tol || 1
    cornerDeg = (cornerDeg === undefined) ? 55 : cornerDeg
    var SMOOTH_WIN = (smoothWin === undefined) ? 2 : smoothWin

    // ★★피팅 대상은 **원본 컨투어 전체**다 — 단순화된 점에 맞추면 안 된다.
    //
    //   단순화본에 맞췄더니 **긴 직선 변에 내부 표본이 남지 않아**(직선은 양 끝점으로 줄어든다)
    //   최소제곱을 구속할 근거가 사라졌고, 오차 판정도 그 몇 점에서만 재니 통과해 버렸다.
    //   실측(글자 배너 310×65mm): 코드 **275mm 짜리 세그먼트 1개**가 만들어져 재단선이
    //   **6.21mm 부풀었다**(면적오차 6.05%). 화면에서 "외곽선을 못 찾고 구부러진다"로 보인다.
    //   원본에 맞추면 직선 구간은 표본이 빽빽해 그대로 직선으로 수렴한다.
    var q = []
    for (var i = 0; i < poly.length; i++) {
      var last = q[q.length - 1]
      if (!last || poly[i][0] !== last[0] || poly[i][1] !== last[1]) q.push(poly[i])
    }
    if (q.length > 1) {
      var f = q[0], l = q[q.length - 1]
      if (f[0] === l[0] && f[1] === l[1]) q.pop()
    }
    var n = q.length
    if (n < 4) return []

    // ★코너는 **성글게 단순화한 폴리라인**에서 찾는다.
    //   원본에서 바로 찾으면 픽셀 계단의 90° 가 전부 코너로 잡혀 원이 다각형이 된다
    //   (실측: r=380 원에서 코너 4개 오검출 → 42세그로 쪼개짐).
    //   Douglas-Peucker 는 원본 점만 남기므로 성근 결과의 점은 원본 안에 반드시 있다 →
    //   좌표로 되찾아 매핑한다. **순서를 지키며 앞에서부터** 찾는다(가는 목처럼 같은 픽셀을
    //   두 번 지나는 컨투어에서 첫 일치만 쓰면 코너가 엉뚱한 자리로 간다).
    var coarse = simplify(poly, Math.max(tol * 3, 1))
    var corners = []
    var cIdx = findCorners(coarse, cornerDeg)
    var scan = 0
    for (var c = 0; c < cIdx.length; c++) {
      var target = coarse[cIdx[c]], at = -1
      for (var s = 0; s < n; s++) {
        var k = (scan + s) % n
        if (q[k][0] === target[0] && q[k][1] === target[1]) { at = k; break }
      }
      if (at < 0) continue
      if (corners.length && corners[corners.length - 1] === at) continue
      corners.push(at)
      scan = at
    }
    corners.sort(function (a, b) { return a - b })
    // ★★직선 구간의 **양 끝에도 매듭을 넣는다** (2026-08-07 실사용 — 라운드 사각 재단선).
    //
    //   코너 판정은 **꺾임 각도**만 본다. 그런데 직선↔호 전환은 **접선이 연속(0°)** 이라
    //   코너로 안 잡히고, 하나의 베지어가 *직선 끝 + 호 시작* 을 함께 근사한다. 그 베지어는
    //   허용오차 안에서 바깥으로 부풀 수 있고, 화면에서는 **직선이 호로 넘어가는 자리에 갈고리처럼
    //   튀어나온 모양**이 된다(실측 500×350 라운드 사각: 윗변 앵커는 전부 y=980 인데 패스 bbox 상단이
    //   980.16 — 전환부에서 0.16mm 솟구쳤다. 조각마다 같은 자리에 생긴다).
    //   → 직선 구간을 **자기 구간으로 분리**하면 호와 베지어를 공유하지 않으므로 원리적으로 안 부푼다.
    //
    //   ⚠️ 곡선 도형은 영향이 없다 — 직선 구간이 없으면 매듭이 하나도 안 늘어난다(원·타원 = 종전과 동일).
    //   ⚠️⚠️ 후보는 `simplify`(DP) 로 고르되, **직선인지는 편차를 직접 잰다.** DP 간격만 보면
    //      완만한 호까지 직선으로 오인한다 — 하네스가 즉시 잡았다(원 r=380 에서 코너 70개·세그 154개).
    //      호는 현 길이 L 에 대해 새그 ≈ L²/(8R) 로 **길수록 급격히 커진다.** 그래서 조건은 두 개다:
    //        ① 현이 충분히 길 것(LONG)  ② 그 구간의 최대 편차가 **아주 작을 것**(EPS)
    //      r=380 원은 80px 현에서 새그 2.1px, 타원(곡률반경 722)은 1.11px → EPS 0.6px 에 전부 걸러진다.
    //      실제 직선 변은 래스터 계단이라도 편차가 0.5px 안쪽이라 그대로 통과한다.
    var LONG = Math.max(80, tol * 25)
    var EPS = Math.max(0.6, tol * 0.3)
    var fine = simplify(poly, Math.max(tol * 0.5, 0.5))
    var fIdx = [], fscan = 0
    for (var g = 0; g < fine.length; g++) {
      var ft = fine[g], fat = -1
      for (var s2 = 0; s2 < n; s2++) {
        var k2 = (fscan + s2) % n
        if (q[k2][0] === ft[0] && q[k2][1] === ft[1]) { fat = k2; break }
      }
      if (fat < 0) continue
      fIdx.push(fat); fscan = fat
    }
    for (var g2 = 0; g2 + 1 < fIdx.length; g2++) {
      var ia = fIdx[g2], ib = fIdx[g2 + 1]
      var ddx = q[ib][0] - q[ia][0], ddy = q[ib][1] - q[ia][1]
      var chord = Math.sqrt(ddx * ddx + ddy * ddy)
      if (chord < LONG) continue
      var dev = 0
      for (var m2 = ia + 1; m2 < ib; m2++) {
        var dv = Math.abs((q[m2][0] - q[ia][0]) * ddy - (q[m2][1] - q[ia][1]) * ddx) / chord
        if (dv > dev) { dev = dv; if (dev > EPS) break }
      }
      if (dev > EPS) continue                 // 완만한 호다 — 쪼개면 안 된다
      addKnot(ia); addKnot(ib)
    }
    // ★기존 코너 **바로 옆**은 같은 꼭짓점이다 — 코너 검출(성근 폴리라인)과 DP 가 고른 점이
    //   한두 픽셀 어긋날 수 있는데, 그걸 따로 세면 매듭이 하나 더 생긴다(하네스: L자 코너 7≠6).
    function addKnot(at) {
      var NEAR = Math.max(2, tol * 2)
      for (var z = 0; z < corners.length; z++) {
        var e = q[corners[z]]
        if (Math.abs(e[0] - q[at][0]) <= NEAR && Math.abs(e[1] - q[at][1]) <= NEAR) return
      }
      corners.push(at)
    }
    corners.sort(function (a, b) { return a - b })
    // 코너가 없으면(원·타원) 아무 지점에서나 한 번 끊어 닫힌 고리를 연 구간으로 만든다
    var cuts = corners.length ? corners : [0]
    var acc = []
    for (var s = 0; s < cuts.length; s++) {
      var a = cuts[s], b = cuts[(s + 1) % cuts.length]
      // ★a===b(코너 1개 = 한 바퀴)도 성립해야 하므로 **먼저 전진한 뒤** 종료를 본다
      var raw = [q[a]], idx = a
      do { idx = (idx + 1) % n; raw.push(q[idx]) } while (idx !== b && raw.length <= n)
      // ★2점 구간(코너와 코너 사이가 직선)도 반드시 내보낸다 — 건너뛰면 사각형 칼선이
      //   통째로 사라진다(fitCubic 이 직선 베지어로 처리한다)
      if (raw.length < 2) continue
      var run = smoothRun(raw, SMOOTH_WIN)
      var t1, t2
      if (a === b) {
        // ★코너가 없는 닫힌 고리(원·타원) — 시작점의 접선을 **이음새를 가로질러** 잡는다.
        //   run[0]→run[1] 로 잡으면 시작점에만 없는 코너가 생긴다(실측: 원에서 코너 1개 오검출).
        t1 = vUnit(vSub(runPointAt(run, 0.05, true), runPointAt(run, 0.05, false)))
        t2 = [-t1[0], -t1[1]]
      } else {
        t1 = runTangent(run, true)
        t2 = runTangent(run, false)
      }
      fitCubic(run, t1, t2, tol, 12, acc)
    }
    return acc
  }

  function polyArea(poly) {
    var s = 0
    for (var i = 0, n = poly.length; i < n; i++) {
      var p1 = poly[i], p2 = poly[(i + 1) % n]
      s += p1[0] * p2[1] - p2[0] * p1[1]
    }
    return Math.abs(s) / 2
  }

  function polyBBox(poly) {
    var L = Infinity, T = Infinity, R = -Infinity, B = -Infinity
    for (var i = 0; i < poly.length; i++) {
      var x = poly[i][0], y = poly[i][1]
      if (x < L) L = x; if (x > R) R = x; if (y < T) T = y; if (y > B) B = y
    }
    return { L: L, T: T, R: R, B: B, w: R - L, h: B - T }
  }

  // ── 거리변환 (Felzenszwalb, separable O(n)) ───────────────────────
  function edt1d(f, n, d, v, z) {
    var k = 0
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity
    for (var q = 1; q < n; q++) {
      var s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity
    }
    k = 0
    for (var q2 = 0; q2 < n; q2++) {
      while (z[k + 1] < q2) k++
      d[q2] = (q2 - v[k]) * (q2 - v[k]) + f[v[k]]
    }
  }

  /** 마스크 **바깥** 픽셀의 최근접 잉크까지 거리(px). 잉크 내부는 0. Float32 = 메모리 절반. */
  function distanceOutside(mask, W, H) {
    var INF = 1e20
    var N = Math.max(W, H)
    var f = new Float64Array(N), d = new Float64Array(N)
    var v = new Int32Array(N), z = new Float64Array(N + 1)
    var g = new Float32Array(W * H)
    for (var i = 0; i < W * H; i++) g[i] = mask[i] ? 0 : INF
    for (var x = 0; x < W; x++) {
      for (var y = 0; y < H; y++) f[y] = g[y * W + x]
      edt1d(f, H, d, v, z)
      for (var y2 = 0; y2 < H; y2++) g[y2 * W + x] = d[y2]
    }
    for (var y3 = 0; y3 < H; y3++) {
      for (var x2 = 0; x2 < W; x2++) f[x2] = g[y3 * W + x2]
      edt1d(f, W, d, v, z)
      for (var x3 = 0; x3 < W; x3++) g[y3 * W + x3] = Math.sqrt(d[x3])
    }
    return g
  }

  /** 잉크 **안쪽** 픽셀의 최근접 경계까지 거리(px). 인셋·타공 배치용. */
  function distanceInside(mask, W, H) {
    var inv = new Uint8Array(W * H)
    for (var i = 0; i < W * H; i++) inv[i] = mask[i] ? 0 : 1
    return distanceOutside(inv, W, H)
  }

  /**
   * 바깥 오프셋 = 거리 ≤ r 영역 (Minkowski 팽창과 동치).
   * 실측(§4.2): 6/6 도형에서 팽창량 오차 0. 사각형이면 **코너 반지름 r 의 라운드사각**이 자동으로 나온다.
   * ⚠️ 항상 라운드 조인이다 — miter(뾰족) 코너는 이 방식으로 나오지 않는다(§4.5 갭).
   * ⚠️ 간격 g 로 떨어진 조각들은 **r ≥ g/2 에서 병합**된다. 글자 컷팅에서 낱글자가 흩어지지 않게 하려면
   *    오프셋 ≥ 자간/2 로 잡는다. 반대로 낱개로 떼려면 그보다 작게.
   */
  function offsetMask(mask, W, H, r) {
    var dist = distanceOutside(mask, W, H)
    var out = new Uint8Array(W * H)
    for (var i = 0; i < W * H; i++) if (dist[i] <= r) out[i] = 1
    return out
  }

  /** 안쪽 오프셋(인셋). 타공 배치 경로 = 외곽에서 r 만큼 안쪽. */
  function insetMask(mask, W, H, r) {
    var dist = distanceInside(mask, W, H)
    var out = new Uint8Array(W * H)
    for (var i = 0; i < W * H; i++) if (mask[i] && dist[i] >= r) out[i] = 1
    return out
  }

  /** 경로 위 등간격 n 점. 타공 좌표 산출(실측: 정사각 인셋 → 코너 4 + 변 중앙 4). */
  function sampleEvenly(poly, n) {
    if (!poly.length || n <= 0) return []
    var step = poly.length / n
    var out = []
    for (var i = 0; i < n; i++) out.push(poly[Math.floor(i * step) % poly.length])
    return out
  }

  /**
   * 판 크기(mm)에 맞는 해상도 자동 선택. §4.3 실측 기반.
   * @returns {mmPerPx, W, H, px} — 픽셀 상한을 넘지 않는 가장 정밀한 해상도
   */
  function pickResolution(widthMm, heightMm, maxPx, candidates) {
    maxPx = maxPx || 12e6
    candidates = candidates || [0.25, 0.5, 1.0, 2.0]
    for (var i = 0; i < candidates.length; i++) {
      var mmPerPx = candidates[i]
      var W = Math.ceil(widthMm / mmPerPx), H = Math.ceil(heightMm / mmPerPx)
      if (W * H <= maxPx) return { mmPerPx: mmPerPx, W: W, H: H, px: W * H }
    }
    var last = candidates[candidates.length - 1]
    var W2 = Math.ceil(widthMm / last), H2 = Math.ceil(heightMm / last)
    return { mmPerPx: last, W: W2, H: H2, px: W2 * H2 }
  }

  // ── 벡터 경로 → 마스크 (계측·향후 벡터 실루엣 경로 · spec §6.26) ─────
  //
  // 실루엣은 파일 안에 이미 정확한 벡터로 있다. 렌더 → 임계 → 계단 → 곡선 복원의 왕복을
  // 건너뛰고 **우리가 통제하는 격자에 직접 채우면** 안티에일리어싱·임계 오차가 통째로 사라진다.
  // ★불리언 union 을 만들지 않는다 — 여러 폴리곤을 **같은 마스크에 그리면** 그게 합집합이다.

  /** 큐빅 베지어 1구간 → 점열(끝점 제외). tol=허용 편차(같은 단위) */
  function flattenCubic(p0, c1, c2, p1, tol, out) {
    // 코드 길이와 제어점 이탈로 분할 수를 정한다 — 균등 분할은 직선 구간에서 낭비, 곡선에서 부족
    var d1 = Math.abs(c1[0] - p0[0]) + Math.abs(c1[1] - p0[1])
      + Math.abs(c2[0] - p1[0]) + Math.abs(c2[1] - p1[1])
    var chord = Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1])
    var n = Math.ceil(Math.sqrt((d1 + chord) / Math.max(tol, 1e-6)) * 1.5)
    if (!(n > 1)) n = 1
    if (n > 256) n = 256
    for (var i = 0; i < n; i++) {
      var t = i / n, mt = 1 - t
      var b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t
      out.push([b0 * p0[0] + b1 * c1[0] + b2 * c2[0] + b3 * p1[0],
      b0 * p0[1] + b1 * c1[1] + b2 * c2[1] + b3 * p1[1]])
    }
  }

  /**
   * 일러 서브패스 → 폴리곤.
   * @param pts [{a:[x,y], l:[x,y], r:[x,y]}, ...]  (anchor / leftDirection / rightDirection)
   * @param closed 닫힌 경로면 마지막 → 첫 구간도 잇는다
   */
  function flattenSubpath(pts, closed, tol) {
    var out = [], n = pts.length
    if (n < 2) return n ? [pts[0].a] : []
    var last = closed ? n : n - 1
    for (var i = 0; i < last; i++) {
      var a = pts[i], b = pts[(i + 1) % n]
      flattenCubic(a.a, a.r, b.l, b.a, tol || 0.05, out)
    }
    if (!closed) out.push(pts[n - 1].a)
    return out
  }

  /**
   * 폴리곤 여러 개를 **주어진 격자에** even-odd 로 채운다(기존 마스크에 OR).
   * @param mask Uint8Array(W*H) — 없으면 새로 만든다
   * @param polys [[[x,y],...], ...]  같은 채우기 단위(compound path)면 한 번에 넘길 것
   * @param mmPerPx 격자 크기 · originXmm/originYmm = 픽셀(0,0) 의 문서 좌표 · yDown=문서 y-up 뒤집기
   */
  function fillPolygonsInto(mask, W, H, polys, mmPerPx, originXmm, originYmm, yDown) {
    if (!mask) mask = new Uint8Array(W * H)
    var toPx = function (p) {
      return [(p[0] - originXmm) / mmPerPx, yDown ? (originYmm - p[1]) / mmPerPx : (p[1] - originYmm) / mmPerPx]
    }
    // 모든 서브패스의 변을 한 번에 모아 스캔라인 — 그래야 compound 의 구멍이 even-odd 로 뚫린다
    var edges = []
    for (var s = 0; s < polys.length; s++) {
      var poly = polys[s], n = poly.length
      if (n < 3) continue
      for (var i = 0; i < n; i++) {
        var a = toPx(poly[i]), b = toPx(poly[(i + 1) % n])
        if (a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1]])
      }
    }
    if (!edges.length) return mask
    for (var py = 0; py < H; py++) {
      var wy = py + 0.5, xs = []
      for (var e = 0; e < edges.length; e++) {
        var g = edges[e], y0 = g[1], y1 = g[3]
        if ((wy >= y0 && wy < y1) || (wy >= y1 && wy < y0)) {
          xs.push(g[0] + (wy - y0) / (y1 - y0) * (g[2] - g[0]))
        }
      }
      if (xs.length < 2) continue
      xs.sort(function (p, q) { return p - q })
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5))
        for (var x = xa; x <= xb; x++) mask[py * W + x] = 1
      }
    }
    return mask
  }

  /**
   * ★마스크 축소 — f×f 블록의 **잉크 피복률**로 거친 격자 값을 정한다.
   *
   * 왜 필요한가(2026-07-31 실측): 일러 PNG 내보내기는 해상도가 거칠수록 경계가 크게 번진다.
   * 100×60mm 사각을 구워 재보면
   *     0.25mm/px → 100.25×60.25mm (오차 0.25 = 1px)
   *     0.75mm/px → **102.00×60.75mm (오차 2.0mm)**
   * 배치 격자(0.75mm/px)에서 바로 마스크를 뜨면 이 2mm 가 그대로 재단선 오차가 된다.
   * → **미세 격자로 굽어 정확한 경계를 얻고, 여기서 배치 격자로 줄인다.**
   *
   * @param coverFrac 이 비율 이상 차면 잉크(0.5 = 절반 이상 = 편향 없는 경계).
   *                  낮추면 바깥쪽으로 안전하게 치우친다.
   */
  function downsampleMask(mask, W, H, f, coverFrac) {
    f = Math.max(1, Math.round(f || 1))
    if (f === 1) return { m: mask, W: W, H: H }
    coverFrac = (coverFrac === undefined) ? 0.5 : coverFrac
    var CW = Math.ceil(W / f), CH = Math.ceil(H / f)
    var out = new Uint8Array(CW * CH)
    for (var cy = 0; cy < CH; cy++) {
      var y0 = cy * f, y1 = Math.min(H, y0 + f)
      for (var cx = 0; cx < CW; cx++) {
        var x0 = cx * f, x1 = Math.min(W, x0 + f)
        var n = 0, tot = (y1 - y0) * (x1 - x0)
        for (var y = y0; y < y1; y++) {
          var row = y * W
          for (var x = x0; x < x1; x++) if (mask[row + x]) n++
        }
        if (tot > 0 && n >= tot * coverFrac) out[cy * CW + cx] = 1
      }
    }
    return { m: out, W: CW, H: CH }
  }

  /**
   * ★간격(gap)이 픽셀 정수배가 되도록 해상도를 스냅한다.
   *
   * `offsetMask` 는 `dist <= r` 로 판정하는데 축방향 거리는 정수라 **r 의 소수부가 버려진다**.
   * 그래서 gap/2 가 정수 px 이 아니면 요청보다 좁게 나온다 — 2026-07-31 실측:
   *
   *     요청 3mm @1.0mm/px → r=1.5px → 실팽창 1px → **보장 2.0mm (1mm 부족)**
   *     요청 5mm @1.0mm/px → r=2.5px → 실팽창 2px → **보장 4.0mm (1mm 부족)**
   *     요청 3mm @0.75mm/px → r=2px  → 실팽창 2px → 보장 3.0mm ✅
   *
   * 롤 1370·1520 이 1.0mm/px 라(pickResolution 12M 상한) **기본 시트 + 간격 3mm 조합이 정확히 최악**이었다.
   * 조용히 좁게 나오므로 사용자가 재단해 보기 전에는 알 수 없다 → 해상도로 근본을 없앤다.
   *
   * @returns {mmPerPx, rPx, exact} exact=false 면 스냅을 포기한 것이므로 호출자가 rPx(올림)로 안전을 확보한다.
   */
  function snapResolution(mmPerPx, gapMm, widthMm, heightMm, maxPx) {
    var half = (gapMm || 0) / 2
    if (!(half > 0) || !(mmPerPx > 0)) return { mmPerPx: mmPerPx, rPx: 0, exact: true }
    maxPx = maxPx || 12e6
    // ★올림 — `round` 로 잡으면 격자가 **더 거칠어지는** 쪽으로 떨어질 수 있다(실측: 요청 half 2.25mm 를
    //   1.0mm/px 기준으로 round 하면 k=2 → 1.125mm/px 로 거칠어졌다). 거친 격자는 경계 오차와
    //   칼선 각짐을 동시에 키운다. 올림하면 항상 base 이하(더 고운 쪽)로 가고, 비용은 아래 예산 루프가 막는다.
    var k = Math.max(1, Math.ceil(half / mmPerPx))
    // 메모리는 해상도의 제곱으로 는다 — 상한을 넘으면 팽창 픽셀을 줄여(=거칠게) 되돌린다
    while (k > 1) {
      var s = half / k
      if (!(widthMm > 0) || !(heightMm > 0)) break
      if (Math.ceil(widthMm / s) * Math.ceil(heightMm / s) <= maxPx) break
      k--
    }
    var snapped = half / k
    // k=1 까지 내렸는데도 상한을 넘으면 스냅 자체가 비용을 감당 못 한다 → 원래 해상도 + 올림으로 폴백
    if (widthMm > 0 && heightMm > 0 &&
      Math.ceil(widthMm / snapped) * Math.ceil(heightMm / snapped) > maxPx) {
      return { mmPerPx: mmPerPx, rPx: Math.ceil(half / mmPerPx), exact: false }
    }
    return { mmPerPx: snapped, rPx: k, exact: true }
  }

  /** 베지어 세그먼트(px) → mm. toMm 과 같은 좌표 규약(yDown 이면 y 뒤집기). */
  function bezToMm(segs, mmPerPx, originXmm, originYmm, yDown) {
    var out = []
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], q = []
      for (var j = 0; j < 4; j++) {
        var x = originXmm + s[j][0] * mmPerPx
        var y = yDown ? (originYmm - s[j][1] * mmPerPx) : (originYmm + s[j][1] * mmPerPx)
        q.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100])
      }
      out.push(q)
    }
    return out
  }

  /**
   * 픽셀 폴리곤 → mm 좌표. 일러가 그릴 수 있는 형태로 바꾼다.
   * origin = 마스크 (0,0) 이 문서에서 갖는 mm 좌표. yDown=true 면 y 를 뒤집는다(래스터는 y-down, 일러는 y-up).
   */
  function toMm(poly, mmPerPx, originXmm, originYmm, yDown) {
    var out = []
    for (var i = 0; i < poly.length; i++) {
      var x = originXmm + poly[i][0] * mmPerPx
      var y = yDown ? (originYmm - poly[i][1] * mmPerPx) : (originYmm + poly[i][1] * mmPerPx)
      out.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100])
    }
    return out
  }

  /**
   * 폴리곤 → 마스크 (even-odd 스캔라인 채우기).
   *
   * 쓰는 곳 ①표준 벤치마크(ESICUP)처럼 폴리곤으로 주어진 입력을 우리 래스터 엔진에 태울 때
   *        ②향후 웹 통합 — 패널이 만든 폴리곤을 서버/웹이 받아 배치만 할 때
   * @param poly [[x,y],...] (닫히지 않아도 됨)
   * @param scale 단위당 픽셀
   * @param padPx 사방 여백(px) — 오프셋·gap 팽창분이 잘리지 않게
   * @returns {W,H,m, offX,offY, scale} offX/offY = 마스크 (0,0) 이 원좌표에서 갖는 값
   */
  function rasterizePolygon(poly, scale, padPx) {
    padPx = padPx || 0
    var bb = polyBBox(poly)
    var W = Math.max(1, Math.ceil((bb.R - bb.L) * scale) + padPx * 2 + 1)
    var H = Math.max(1, Math.ceil((bb.B - bb.T) * scale) + padPx * 2 + 1)
    var m = new Uint8Array(W * H)
    var n = poly.length
    // 각 스캔라인 y 에서 폴리곤과의 교점을 모아 짝수-홀수 규칙으로 채운다
    for (var py = 0; py < H; py++) {
      var wy = (py - padPx + 0.5) / scale + bb.T
      var xs = []
      for (var i = 0; i < n; i++) {
        var a = poly[i], b = poly[(i + 1) % n]
        var y1 = a[1], y2 = b[1]
        if (y1 === y2) continue
        if ((wy >= y1 && wy < y2) || (wy >= y2 && wy < y1)) {
          var t = (wy - y1) / (y2 - y1)
          xs.push(a[0] + t * (b[0] - a[0]))
        }
      }
      if (xs.length < 2) continue
      xs.sort(function (p, q) { return p - q })
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var x0 = Math.round((xs[k] - bb.L) * scale) + padPx
        var x1 = Math.round((xs[k + 1] - bb.L) * scale) + padPx
        if (x1 < 0 || x0 >= W) continue
        if (x0 < 0) x0 = 0
        if (x1 > W - 1) x1 = W - 1
        for (var x = x0; x <= x1; x++) m[py * W + x] = 1
      }
    }
    return { W: W, H: H, m: m, offX: bb.L - padPx / scale, offY: bb.T - padPx / scale, scale: scale }
  }

  return {
    rasterizePolygon: rasterizePolygon,
    inkMask: inkMask,
    components: components,
    traceAll: traceAll,
    traceOuter: traceOuter,
    findHoles: findHoles,
    fillHoles: fillHoles,
    assignHoles: assignHoles,
    simplify: simplify,
    downsampleMask: downsampleMask,
    flattenCubic: flattenCubic,
    flattenSubpath: flattenSubpath,
    fillPolygonsInto: fillPolygonsInto,
    fitCurves: fitCurves,
    bezToMm: bezToMm,
    snapResolution: snapResolution,
    polyArea: polyArea,
    polyBBox: polyBBox,
    distanceOutside: distanceOutside,
    distanceInside: distanceInside,
    offsetMask: offsetMask,
    insetMask: insetMask,
    sampleEvenly: sampleEvenly,
    pickResolution: pickResolution,
    toMm: toMm,
  }
})
