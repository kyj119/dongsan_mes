/**
 * 사각 조각 빠른 경로 — 조각 **전체 면적**을 굽지 않고 판을 짠다 (2026-09-23 용준님 승인 · 조건 = 결과물 불변).
 *
 * 왜: 재단 패널은 이형 스티커용이라 모든 조각을 래스터로 다룬다 → 비용이 실물 면적에 비례한다.
 *   100×500cm 사각 두 장이 조각당 64M px 굽기 · 16M px 도련 PNG · 수십 MB 임베드로 「하얗게 멈춘다」.
 *   그런데 사각 조각은 그 픽셀이 **거의 아무 일도 안 한다** — 마스크는 사각이고, 도련은 가장자리 한 줄을 늘린 것이다.
 *
 * 설계 = **하류를 하나도 안 바꾼다**:
 *   ① 배치 — 굽은 마스크 대신 **같은 규격의 합성 사각 마스크**를 래스터 네스터에 넣는다
 *      (사각을 완벽하게 구운 것과 같다 → 배치·판 나누기·번호 꼬리표·효율%·맞붙임이 종전 코드 그대로 돈다).
 *   ② 칼선 — 사각 + 여백. 여백 > 0 이면 **모서리 반경 = 여백**인 둥근 사각이다
 *      (래스터 팽창·벡터 `jntp=0` 둘 다 그렇게 만든다 — 모양을 바꾸면 결과물이 바뀐다).
 *   ③ 도련 — 네 변의 **얇은 띠**만 구워 같은 엔진(`repeatLastPixel` · square · srcInsetPx 0)으로 늘린다.
 *      사각이 전부 불투명이면 띠 밖 픽셀의 「가장 가까운 잉크」는 띠 안에 있으므로 **전체 PNG 와 같은 픽셀**이 된다
 *      (하네스 `cut:rectfast` 가 대조한다). 비용은 둘레에 비례한다.
 *
 * 사각 판정 = **3겹** — 하나라도 아니면 종전 경로(결과물 불변의 전제다):
 *   ① 벡터(호스트 `mesCut_rectProbe`) — 모양. 모서리·변이 정확히 사각인가(둥근 모서리·획·효과는 여기서 걸린다)
 *   ② 저해상도 굽기(`strictRect`) — 채움. 투명·구멍·떨어진 개체가 없는가(벡터는 투명을 못 본다)
 *   ③ 고해상도 띠(`stripsOpaque`) — 테두리. 도련 공급원이 되는 가장자리가 전부 불투명인가
 *
 * ⚠️ 정본은 이 파일이다. Node 하네스(`npm run cut:rectfast`)가 **이 파일을 직접 검증**한다.
 */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.MesCutRectFast = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  // ② 채움 판정 해상도(mm/px, 실물). 구멍 칼선의 하한(MIN_HOLE_MM 2mm)을 놓치지 않는 가장 거친 값이다 —
  //   지름 2mm 원은 1mm 격자의 픽셀 중심을 반드시 하나 품는다(반지름 1 ≥ 반대각 0.707).
  var CHECK_MMPP = 1.0
  // 띠 깊이(px) — 잉크 쪽으로 이만큼 겹쳐 굽는다. 공급원은 최외곽 한 줄이면 되지만(srcInsetPx 0),
  //   겹침이 있어야 띠끼리·띠와 아트 사이에 **이음매**가 안 생긴다(아트 뒤로 가므로 안 보인다).
  var STRIP_DEPTH_PX = 4
  var ALPHA_MIN = 128

  /** RGBA → 이진 마스크(알파 ≥ 128) */
  function alphaMask(img) {
    var n = img.W * img.H, m = new Uint8Array(n)
    for (var i = 0; i < n; i++) if (img.data[i * 4 + 3] >= ALPHA_MIN) m[i] = 1
    return { W: img.W, H: img.H, m: m }
  }

  /**
   * ② 채움 판정 — 잉크 상자 안이 **전부** 차 있는가. 가장자리 1px 고리는 AA 라 반투명일 수 있어 뺀다.
   * @param mask {W,H,m}  @param expW,expH 벡터가 잰 잉크 크기(px, 없으면 대조 생략)
   * @returns {ok, why, bbox}
   */
  function strictRect(mask, expW, expH) {
    var W = mask.W, H = mask.H, m = mask.m
    var L = W, T = H, R = -1, B = -1, x, y
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (m[y * W + x]) {
      if (x < L) L = x; if (x > R) R = x
      if (y < T) T = y; if (y > B) B = y
    }
    if (R < 0) return { ok: false, why: 'empty' }
    var bw = R - L + 1, bh = B - T + 1
    if (bw < 3 || bh < 3) return { ok: false, why: 'tiny' }
    var holes = 0
    for (y = T + 1; y < B; y++) for (x = L + 1; x < R; x++) if (!m[y * W + x]) holes++
    if (holes) return { ok: false, why: 'fill:' + holes + 'px' }
    // 고리(가장자리 1px)는 AA 로 비어도 되지만, 한 변이 **통째로** 비면 그건 AA 가 아니라 모양이다
    var ring = 0, ringN = 2 * (bw + bh) - 4
    for (x = L; x <= R; x++) { if (m[T * W + x]) ring++; if (m[B * W + x]) ring++ }
    for (y = T + 1; y < B; y++) { if (m[y * W + L]) ring++; if (m[y * W + R]) ring++ }
    if (ring < ringN * 0.9) return { ok: false, why: 'edge:' + Math.round(100 * ring / ringN) + '%' }
    // 벡터가 잰 크기와 대조 — 다른 출처끼리 맞아야 한다(축척·클립 오판을 여기서 잡는다)
    if (expW > 0 && expH > 0) {
      if (Math.abs(bw - expW) > 2 || Math.abs(bh - expH) > 2) {
        return { ok: false, why: 'size:' + bw + 'x' + bh + '/' + Math.round(expW) + 'x' + Math.round(expH) }
      }
    }
    return { ok: true, why: '', bbox: { L: L, T: T, W: bw, H: bh } }
  }

  /**
   * ① 배치 — 사각을 **완벽하게 구운 마스크**. 굽기와 같은 틀(사방 pad)이라 하류가 구분하지 못한다.
   * @returns {W,H,m,inkW,inkH}
   */
  function syntheticBase(wMm, hMm, mmpp, padPx) {
    var iw = Math.max(1, Math.round(wMm / mmpp)), ih = Math.max(1, Math.round(hMm / mmpp))
    var p = Math.max(0, Math.round(padPx || 0))
    var W = iw + 2 * p, H = ih + 2 * p, m = new Uint8Array(W * H)
    for (var y = p; y < p + ih; y++) for (var x = p; x < p + iw; x++) m[y * W + x] = 1
    return { W: W, H: H, m: m, inkW: iw, inkH: ih }
  }

  /**
   * ② 칼선 — params 줄 한 개(mm · 시트 좌표 · y 아래로).
   *   여백 ≤ 0 → 각진 사각 `P` · 여백 > 0 → 모서리 반경 = 여백인 둥근 사각 `B`(베지어 — 호스트 mesCut_bezPath 규약:
   *   시작 앵커 + (핸들1 핸들2 앵커) × 세그먼트).
   * @param x,y 잉크 왼쪽 위(회전 반영 후) · w,h 잉크 크기(회전 반영 후) · off 여백(mm)
   */
  function cutLine(x, y, w, h, off) {
    var f = function (v) { return v.toFixed(2) }
    var pt = function (px, py) { return f(px) + ',' + f(py) }
    if (!(off > 0)) {
      var d = off < 0 ? -off : 0
      var x0 = x + d, y0 = y + d, x1 = x + w - d, y1 = y + h - d
      if (!(x1 > x0 && y1 > y0)) return null
      return 'P ' + [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)].join(' ')
    }
    var r = off, K = 0.5522847498 * r
    var L = x - r, T = y - r, R = x + w + r, B = y + h + r
    // 위 변 왼쪽에서 시작해 시계 방향. 직선 구간은 핸들을 앵커 위에 둔다(= 직선).
    var s = [pt(x, T)]
    var line = function (ax, ay, bx, by) { s.push(pt(ax, ay), pt(bx, by), pt(bx, by)) }
    var arc = function (h1x, h1y, h2x, h2y, bx, by) { s.push(pt(h1x, h1y), pt(h2x, h2y), pt(bx, by)) }
    line(x, T, x + w, T)
    arc(x + w + K, T, R, y - K, R, y)
    line(R, y, R, y + h)
    arc(R, y + h + K, x + w + K, B, x + w, B)
    line(x + w, B, x, B)
    arc(x - K, B, L, y + h + K, L, y + h)
    line(L, y + h, L, y)
    arc(L, y - K, x - K, T, x, T)
    return 'B ' + s.join(' ')
  }

  /**
   * ③ 띠 도련 — 네 변의 잉크 쪽 띠(RGBA)를 받아 **바깥쪽으로만** 늘린다.
   *   top 은 모서리를 포함한 전폭(W+2g)×(g+d) · left/right 는 g+d × H(모서리는 top/bottom 몫).
   *   겹치는 칸(잉크 쪽 d)은 아트 뒤로 가 보이지 않고, 겹친 칸끼리는 같은 값이다(가장 가까운 잉크가 같다).
   * @param B MesCutBleed · strips {t,b,l,r} 각 RGBA · gPx 도련 픽셀
   * @returns {t,b,l,r} RGBA 또는 null(공급원 불투명 아님 → 호출부가 종전 경로로)
   */
  function stripBleeds(B, strips, gPx) {
    var g = Math.max(1, Math.ceil(gPx))
    var grow = {
      t: { t: g, l: g, r: g, b: 0 }, b: { t: 0, l: g, r: g, b: g },
      l: { t: 0, l: g, r: 0, b: 0 }, r: { t: 0, l: 0, r: g, b: 0 },
    }
    var out = {}
    for (var k in grow) {
      if (!grow.hasOwnProperty(k)) continue
      if (!strips[k] || !stripsOpaque(strips[k])) return null
      // 종전 호출(cut-main buildBleedPngs)과 **같은 옵션** — 알파 임계는 적응형 그대로(불투명이면 255 로 정해진다)
      var res = B.repeatLastPixel(strips[k], gPx, { corner: 'square', srcInsetPx: 0 })
      out[k] = crop(res, grow[k], g, strips[k])
    }
    return out
  }

  /** 사방 g 로 늘린 결과에서 필요한 변만 남긴다 — repeatLastPixel 은 대칭 성장만 해도 결과가 같다(띠가 불투명이면). */
  function crop(res, gw, g, src) {
    var x0 = g - gw.l, y0 = g - gw.t
    var W = src.W + gw.l + gw.r, H = src.H + gw.t + gw.b
    var data = new Uint8ClampedArray(W * H * 4)
    for (var y = 0; y < H; y++) {
      var so = ((y + y0) * res.W + x0) * 4, to = y * W * 4
      for (var x = 0; x < W * 4; x++) data[to + x] = res.data[so + x]
    }
    return { W: W, H: H, data: data }
  }

  /** ③ 띠가 **전부** 불투명인가 — 하나라도 비면 도련 공급원이 달라진다(종전 경로로). */
  function stripsOpaque(img) {
    var n = img.W * img.H
    for (var i = 0; i < n; i++) if (img.data[i * 4 + 3] < 255) return false
    return n > 0
  }

  /**
   * 빠른 경로를 쓸 것인가 — 사실만 받아 판정한다(placement.js 와 같은 원칙: 판정을 UI 파일 밖에 둔다).
   * @param f {enabled, hostOk, fill, probe:[{rect,why}], check:[{ok,why}]|null}
   * @returns {on, why, stage}  why 는 사람에게 보여 줄 한 줄(조각 번호는 1-based #N)
   */
  function decide(f) {
    if (!f.enabled) return { on: false, why: '', stage: 'off' }
    if (!f.hostOk) return { on: false, why: '호스트가 구버전이라 쓰지 않았습니다', stage: 'host' }
    if (f.fill) return { on: false, why: '선 도안(닫힌 패스를 면으로)은 쓰지 않습니다', stage: 'fill' }
    var p = f.probe || []
    if (!p.length) return { on: false, why: '조각 모양을 읽지 못했습니다', stage: 'probe' }
    var bad = []
    for (var i = 0; i < p.length; i++) if (!p[i] || !p[i].rect) bad.push('#' + (i + 1) + (p[i] && p[i].why ? '(' + p[i].why + ')' : ''))
    if (bad.length) return { on: false, why: '사각이 아닌 조각 ' + bad.slice(0, 6).join(' ') + (bad.length > 6 ? ' 외 ' + (bad.length - 6) : ''), stage: 'vector' }
    if (!f.check) return { on: true, why: '', stage: 'vector-ok' }
    var bad2 = []
    for (var j = 0; j < f.check.length; j++) if (!f.check[j] || !f.check[j].ok) bad2.push('#' + (j + 1) + (f.check[j] && f.check[j].why ? '(' + f.check[j].why + ')' : ''))
    if (bad2.length) return { on: false, why: '속이 다 차지 않은 조각 ' + bad2.slice(0, 6).join(' ') + (bad2.length > 6 ? ' 외 ' + (bad2.length - 6) : ''), stage: 'fill-check' }
    return { on: true, why: '', stage: 'ok' }
  }

  return {
    CHECK_MMPP: CHECK_MMPP, STRIP_DEPTH_PX: STRIP_DEPTH_PX,
    alphaMask: alphaMask, strictRect: strictRect, syntheticBase: syntheticBase,
    cutLine: cutLine, stripBleeds: stripBleeds, stripsOpaque: stripsOpaque, decide: decide,
  }
})
