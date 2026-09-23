/**
 * 재단 패널 — 조각 번호 (순수 모듈 · 의존성 없음)
 *
 * 시트 주문(한 파일에 조각 수십 장)에서 **어느 조각이 어느 자리인가**를 번호 하나로 잇는다.
 * 번호는 원본 배치(고객용 이미지)·판의 조각 옆(재단 후 버려지는 꼬리표)·등록 조각 목록 세 곳에
 * **같은 조각 id 에서 파생**돼 실린다 — 사람이 대조하는 자리가 없다(2026-09-23 용준님 확정).
 *
 * ★번호 규칙 (실측 근거 = 국제협력처 솔벤시트 47조각 · scripts/cut/number-bench.mjs):
 *   · 줄 = 세로로 절반 이상 겹치는 조각 묶음. 줄은 위→아래, 줄 안은 왼→오른.
 *   · 「줄 띠 높이 ÷ 그 줄 최대 조각 높이」가 1.5 를 넘으면(겹침이 사슬로 이어진 가짜 줄) 줄 구조 없음.
 *   · 줄이 하나뿐이거나 대부분 1장짜리면 줄 번호가 뜻이 없다 → 평면 번호 1~N.
 *   · 40% 지그재그까지는 줄로 보고, 60% 부터는 평면으로 떨어진다(실측).
 *
 * ★꼬리표 = 마스크에 붙는 사각 (판 위 번호 자리). 배치 엔진(nesting.js)은 마스크만 보므로
 *   꼬리표를 마스크에 붙이면 그 자리가 **저절로** 비워진다 — 배치 로직을 새로 만들지 않는다.
 *   · 자리 = 조각 위쪽, 왼쪽에서 th 만큼 들여서(모서리 돔보 자리를 피한다: 돔보 중심 7mm·지름 6mm).
 *   · 회전하면 꼬리표도 같이 돈다 → `placedGeom` 이 회전별로 꼬리표·조각 사각을 되돌려 준다.
 *     배치 뒤 **조각 사각만** 파이프라인(I 줄·칼선·도련)에 넘기므로 나머지 코드는 꼬리표를 모른다.
 *   · 회전 배치에서는 꼬리표 두께(th)가 **폭**에 더해진다 → `canTab` 이 폭 여유를 본다.
 *     (세로 배치에서는 길이에만 더해지고 롤 길이는 무한이라 걸릴 일이 없다)
 *
 * ⚠️ 정본은 이 파일이다. Node 하네스(scripts/cut/number-bench.mjs)가 **이 파일을 직접 검증**한다.
 */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.MesPieceNumber = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /** 줄 묶기 — bounds [{x,y,w,h}] (y 아래로 증가) → [{top,bottom,items:[idx…]}] 위→아래, 줄 안 왼→오른 */
  function rowsOf(bounds, minOverlap) {
    var ov0 = (minOverlap == null) ? 0.5 : minOverlap
    var idx = []
    for (var i = 0; i < bounds.length; i++) idx.push(i)
    idx.sort(function (a, b) { return (bounds[a].y - bounds[b].y) || (bounds[a].x - bounds[b].x) })
    var rows = []
    for (var k = 0; k < idx.length; k++) {
      var p = bounds[idx[k]], placed = null
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r]
        var ov = Math.min(row.bottom, p.y + p.h) - Math.max(row.top, p.y)
        var minH = Math.min(row.bottom - row.top, p.h)
        if (ov > 0 && minH > 0 && ov / minH >= ov0) { placed = row; break }
      }
      if (placed) {
        placed.items.push(idx[k])
        if (p.y < placed.top) placed.top = p.y
        if (p.y + p.h > placed.bottom) placed.bottom = p.y + p.h
      } else rows.push({ top: p.y, bottom: p.y + p.h, items: [idx[k]] })
    }
    rows.sort(function (a, b) { return a.top - b.top })
    for (var q = 0; q < rows.length; q++) {
      rows[q].items.sort(function (a, b) { return (bounds[a].x - bounds[b].x) || (bounds[a].y - bounds[b].y) })
    }
    return rows
  }

  /** 줄 품질 — 최악 사슬 비율(1.0 = 완전한 줄) */
  function chainOf(rows, bounds) {
    var worst = 0
    for (var r = 0; r < rows.length; r++) {
      var maxH = 0
      for (var i = 0; i < rows[r].items.length; i++) maxH = Math.max(maxH, bounds[rows[r].items[i]].h)
      var c = maxH > 0 ? (rows[r].bottom - rows[r].top) / maxH : 1
      if (c > worst) worst = c
    }
    return worst
  }

  var CHAIN_MAX = 1.5

  /**
   * 번호 부여.
   * @param bounds [{x,y,w,h}] 조각 잉크 경계(같은 단위면 무엇이든)
   * @param mode 'auto' | 'row' | 'seq'
   * @returns {mode:'row'|'seq', labels:string[], rows:number, chain:number, why:string}
   *   labels[i] = bounds[i] 의 번호 · why = 자동 판정 사유(사람 말)
   */
  function assign(bounds, mode) {
    var n = bounds ? bounds.length : 0
    if (!n) return { mode: 'seq', labels: [], rows: 0, chain: 0, why: '조각 없음' }
    var rows = rowsOf(bounds, 0.5)
    var chain = chainOf(rows, bounds)
    var singles = 0
    for (var r = 0; r < rows.length; r++) if (rows[r].items.length === 1) singles++
    var rowLike = chain <= CHAIN_MAX
    var rowUseful = rowLike && rows.length >= 2 && rows.length < n && (singles / rows.length) <= 0.7
    var useRow = (mode === 'row') ? true : (mode === 'seq') ? false : rowUseful
    var why
    if (mode === 'row') why = '줄번호(수동) — ' + rows.length + '줄'
    else if (mode === 'seq') why = '일련(수동) — 1~' + n
    else if (rowUseful) why = rows.length + '줄 감지 → 줄-순번'
    else if (!rowLike) why = '줄 구조 없음(흩어짐) → 일련 1~' + n
    else if (rows.length < 2) why = '한 줄뿐 → 일련 1~' + n
    else why = '줄 대부분이 1장 → 일련 1~' + n
    var labels = new Array(n)
    var seq = 0
    // 순서는 두 모드 모두 줄 순회다 — 줄 구조가 없을 때는 위→아래·왼→오른 정렬과 같아진다
    var order = rowLike ? rows : rowsOf(bounds, 1.01)   // 1.01 = 겹침 인정 안 함 → 조각마다 한 줄
    for (var rr = 0; rr < order.length; rr++) {
      for (var ii = 0; ii < order[rr].items.length; ii++) {
        var id = order[rr].items[ii]
        labels[id] = useRow ? ((rr + 1) + '-' + (ii + 1)) : String(++seq)
      }
    }
    return { mode: useRow ? 'row' : 'seq', labels: labels, rows: rows.length, chain: chain, why: why }
  }

  /**
   * 꼬리표를 마스크에 붙인다 — 위쪽 th 줄, 왼쪽에서 th 들여 tw 칸 (돔보 자리 회피).
   * @param mask {W,H,m}  @param tw,th 정수 px
   * @returns {W,H,m}  (W 는 그대로 · H 는 +th)
   */
  function attachTab(mask, tw, th) {
    var W = mask.W, H = mask.H + th
    var m = new Uint8Array(W * H)
    for (var y = 0; y < mask.H; y++) {
      for (var x = 0; x < W; x++) m[(y + th) * W + x] = mask.m[y * mask.W + x]
    }
    var x0 = (W >= th + tw) ? th : 0
    var x1 = Math.min(W, x0 + tw)
    for (var ty = 0; ty < th; ty++) for (var tx = x0; tx < x1; tx++) m[ty * W + tx] = 1
    return { W: W, H: H, m: m, tabX0: x0, tabW: x1 - x0 }
  }

  /**
   * 배치 결과(꼬리표 포함 마스크의 좌표)를 **조각 사각**과 **꼬리표 사각**으로 되돌린다.
   * 회전은 nesting.js rot90(시계) 규약 그대로 — newX = H-1-y, newY = x.
   * @param pl {x,y,rot}  @param Wg,Hg 꼬리표 붙이기 전 마스크 크기  @param tw,th 실제 붙은 꼬리표(px)
   * @param x0 꼬리표 시작 열(attachTab 의 tabX0)
   * @returns {piece:{x,y,W,H}, tab:{x,y,w,h,vertical}}
   */
  function placedGeom(pl, Wg, Hg, tw, th, x0) {
    var r = ((pl.rot % 360) + 360) % 360
    var X = pl.x, Y = pl.y
    if (r === 0) return { piece: { x: X, y: Y + th, W: Wg, H: Hg }, tab: { x: X + x0, y: Y, w: tw, h: th, vertical: false } }
    if (r === 90) return { piece: { x: X, y: Y, W: Hg, H: Wg }, tab: { x: X + Hg, y: Y + x0, w: th, h: tw, vertical: true } }
    if (r === 180) return { piece: { x: X, y: Y, W: Wg, H: Hg }, tab: { x: X + Wg - x0 - tw, y: Y + Hg, w: tw, h: th, vertical: false } }
    return { piece: { x: X + th, y: Y, W: Hg, H: Wg }, tab: { x: X, y: Y + Wg - x0 - tw, w: th, h: tw, vertical: true } }
  }

  /**
   * 이 조각에 꼬리표를 붙여도 되나 — 세워야만 폭에 들어가는 조각은 꼬리표 두께가 폭에 더해진다.
   * 둘 다 안 들어가면 엔진이 미배치로 낸다(꼬리표와 무관 · 「폭보다 크다」).
   */
  function canTab(Wg, Hg, th, usableW) {
    var upright = Wg <= usableW
    var rotated = Hg + th <= usableW
    return upright || rotated
  }

  /** 원본 mm 좌표 → 원본 PNG px (meta = {abL,abT,abW,abH,w,h}: 아트보드 mm 원점·크기, PNG 픽셀 크기) */
  function mmToPng(meta, x, y) {
    var kx = meta.w / meta.abW, ky = meta.h / meta.abH
    return { x: (x - meta.abL) * kx, y: (y - meta.abT) * ky }
  }

  // ★번호 이미지의 글자 크기 — **인쇄물에서 읽혀야** 한다 (2026-09-24 용준님 「원본 기준으로 번호를 크게」).
  //   작업지시서는 이 그림을 장변 240px(≈63.5mm, workOrderPrint.js `.thumb`)로 줄여 찍는다. 종전 배지는 이미지 장변의
  //   1.4% 고정이라 인쇄하면 **글자 ≈0.7mm** — 사실상 안 보였다. → 조각 **한가운데**, 크기는 **조각 안에서 최대**.
  //   ⚠️처음에는 「인쇄 3mm 하한」을 강제했다 — 47조각 실측 배치에서 번호가 조각보다 커져 **옆 번호와 붙어 읽을 수 없었다**
  //     (「1-11-21-3…」). 조각이 인쇄물에서 5mm 남짓이면 3mm 번호가 들어갈 자리가 없다. **겹치면 크기는 소용없다** →
  //     조각을 넘지 않는 것을 우선한다. 인쇄 크기는 그림을 크게 찍는 쪽(작업지시서)에서 해결한다.
  var PRINT_LONG_MM = 63.5    // 작업지시서 썸네일 장변(240px @96dpi) — 참고용(게이트 보고)
  var MIN_DIGIT_MM = 3        // 인쇄물에서 읽기 좋은 숫자 높이(목표 — 강제하지 않는다)
  var MIN_FONT_PX = 12        // 원본 PNG 에서의 절대 하한(아주 작은 조각)
  var DIGIT_H = 0.72          // 숫자 높이 / 글꼴 크기(굵은 고딕 실측 근사)
  var CHAR_W = 0.62           // 글자 폭 / 글꼴 크기(숫자·대시)
  /**
   * @param meta {abL,abT,abW,abH,w,h} 원본 PNG 메타 · bounds [{x,y,w,h}] 원본 mm · labels [문자열]
   * @returns [{cx, cy, font, stroke} | null] (PNG px) — 라벨 없는 조각은 null
   */
  function labelLayout(meta, bounds, labels) {
    var L = Math.max(meta.w, meta.h)
    var maxFont = L * 0.25
    var kx = meta.w / meta.abW, ky = meta.h / meta.abH, out = []
    for (var i = 0; i < bounds.length; i++) {
      var lab = labels[i]
      if (!lab || !bounds[i]) { out.push(null); continue }
      var p = mmToPng(meta, bounds[i].x, bounds[i].y)
      var wPx = bounds[i].w * kx, hPx = bounds[i].h * ky
      // 조각 안에 들어가는 크기 = 높이의 60% · 폭에 글자 수만큼 들어가는 크기(테두리 포함 88%) 중 작은 것
      var fit = Math.min(hPx * 0.6, (wPx * 0.88) / (CHAR_W * String(lab).length + 0.3))
      var font = Math.round(Math.min(maxFont, Math.max(MIN_FONT_PX, fit)))
      out.push({ cx: p.x + wPx / 2, cy: p.y + hPx / 2, font: font, stroke: Math.max(2, Math.round(font * 0.12)) })
    }
    return out
  }

  return { rowsOf: rowsOf, assign: assign, attachTab: attachTab, placedGeom: placedGeom, canTab: canTab, mmToPng: mmToPng, labelLayout: labelLayout,
    PRINT_LONG_MM: PRINT_LONG_MM, MIN_DIGIT_MM: MIN_DIGIT_MM, MIN_FONT_PX: MIN_FONT_PX, DIGIT_H: DIGIT_H, CHAR_W: CHAR_W, CHAIN_MAX: CHAIN_MAX }
})
