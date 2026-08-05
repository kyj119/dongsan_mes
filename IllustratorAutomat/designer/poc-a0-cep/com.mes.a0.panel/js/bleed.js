/**
 * 도련 — **Repeat Last Pixel** (가장자리 최외곽 픽셀을 바깥으로 반복)
 *
 * 왜 이 방식인가(2026-08-04, 업계 벤치마크 후 재구현):
 *   전문 도구 어느 것도 **벡터 도형을 개별 오프셋하지 않는다**. 전부 가장자리 픽셀 밴드를 다룬다.
 *     · callas pdfToolbox `Repeat Last Pixel` — "트림박스에 가까운 개체가 도련에 딸려 들어가는 것을
 *       피하려 할 때 권장". 우리가 겪은 문제(내부 선이 링을 오염)를 **원천적으로** 없애는 방식이다.
 *     · ONYX/Caldera — Mirror(가장자리 반사) 또는 Stretch(마지막 2mm 늘림), 링 모양은 컷 컨투어를 따름.
 *   도형별 오프셋으로 세 번 고쳐 봤고(bbox 거리 → 윤곽 거리 → 윤곽 접촉) 전부 실패했다.
 *   도형들이 서로 겹치지 않으면 각자가 제 윤곽을 가져 "윤곽 도형 vs 내부 선"이 원리상 안 갈린다.
 *   픽셀 방식엔 '도형'이라는 개념 자체가 없어서 그 실패가 재현될 수 없다.
 *
 * 계산을 일러 밖(패널 JS)에 두는 이유 = **하네스로 검증할 수 있기 때문**이다(geometry.js 와 같은 원칙).
 * ExtendScript 는 픽셀에 접근할 수도, 테스트할 수도 없다.
 *
 * 알고리즘 = 8SSEDT(2-pass chamfer) 로 각 픽셀에서 **가장 가까운 불투명 픽셀까지의 (dx,dy)** 를 구하고,
 * grow 안쪽이면 그 픽셀의 색을 그대로 복사한다. O(W·H) 이고 거리 오차는 1px 미만이다.
 */
(function (root) {
  'use strict';

  var INF = 1e9;
  // ★**완전** 불투명만 잉크로 본다. 250 으로 뒀더니 알파 250~254 구간이 그대로 남았다
  //   (2026-08-05 실측: 조각 27개 중 2개에서 274·6px 잔존 → 거기만 여전히 틈이 보인다).
  //   "거의 불투명"은 눈에 안 보일 것 같지만 겹치면 합성되므로 결국 같은 증상을 만든다.
  var SOLID = 255;

  /**
   * 불투명 판정 임계를 정한다.
   *
   * ★2026-08-05 실사용에서 잡힌 결함 — 기본을 낮게(8) 두면 **굽기 안티앨리어싱으로 생긴
   *   반투명 가장자리**가 "원본 잉크"로 분류돼 그대로 남는다. 그 픽셀은
   *     · 배경 위에서는 연하게 비쳐 **윤곽을 따라 틈**처럼 보이고,
   *     · 다른 도련과 겹치면 **알파 합성으로 누적돼 진하게** 보인다(코너에서 특히 — 대각선
   *       경계라 안티앨리어싱 픽셀이 더 많다).
   *   실측(도련 PNG 27개 전량): 잉크의 **1.95%**(20,569px)가 알파 1~249 였고 250~254 는 거의 0,
   *   즉 알파가 중간값에 몰려 있었다. 두 증상이 같은 원인에서 나온다.
   *   → 거의 불투명한 픽셀만 잉크로 보고, 반투명 가장자리는 **채움 대상**으로 넘겨 불투명하게 만든다.
   *     결과적으로 잉크가 1~2px 바깥으로 선명하게 확장돼 원본 벡터와 틈 없이 만난다
   *     (배치 반올림 0.5px 도 여기에 흡수된다).
   *
   * 단 아트가 통째로 반투명이면(투명도를 쓴 디자인) 임계를 올리는 순간 **공급원이 사라져 도련이 0**
   * 이 된다 → 불투명 픽셀이 잉크의 과반일 때만 올린다.
   */
  function pickAlphaMin(out, n) {
    var solid = 0, any = 0;
    for (var i = 0; i < n; i++) {
      var a = out[i * 4 + 3];
      if (a >= SOLID) solid++;
      if (a >= 8) any++;
    }
    return (any > 0 && solid * 2 >= any) ? SOLID : 8;
  }

  /**
   * @param src {W,H,data:Uint8ClampedArray|Array}  RGBA · 투명 배경으로 래스터한 조각
   * @param growPx 바깥으로 넓힐 픽셀 수 (= (여백+도련)/mmPerPx)
   * @param opt.alphaMin 불투명 판정 임계. **생략 = 적응형**(`pickAlphaMin`) — 넘기면 그 값으로 고정한다
   * @returns {W,H,data,pad} pad = 사방으로 늘어난 픽셀 수(=growPx). 원본은 (pad,pad) 위치에 그대로 있다.
   */
  function repeatLastPixel(src, growPx, opt) {
    opt = opt || {};
    var aMin = opt.alphaMin;
    var pad = Math.max(0, Math.ceil(growPx));
    var W = src.W, H = src.H, s = src.data;
    var NW = W + pad * 2, NH = H + pad * 2;
    var n = NW * NH;
    var out = new Uint8ClampedArray(n * 4);

    // ① 확장 캔버스에 원본을 pad 만큼 안쪽으로 놓는다
    for (var y = 0; y < H; y++) {
      var so = y * W * 4, to = ((y + pad) * NW + pad) * 4;
      for (var x = 0; x < W * 4; x++) out[to + x] = s[so + x];
    }

    // ★임계는 원본을 얹은 **뒤에** 정한다 — 실제 알파 분포를 봐야 적응형이 성립한다
    if (typeof aMin !== 'number') aMin = pickAlphaMin(out, n);

    // ② 8SSEDT — 각 픽셀에서 가장 가까운 불투명 픽셀까지의 (dx,dy)
    var dx = new Int32Array(n), dy = new Int32Array(n);
    var i, px, py;
    for (i = 0; i < n; i++) {
      if (out[i * 4 + 3] >= aMin) { dx[i] = 0; dy[i] = 0; }
      else { dx[i] = INF; dy[i] = INF; }
    }
    function d2(i) { var a = dx[i], b = dy[i]; return (a >= INF || b >= INF) ? INF : (a * a + b * b); }
    function put(i, j, ox, oy) {          // j 의 값을 (ox,oy) 만큼 옮겨 i 에 후보로 넣는다
      if (dx[j] >= INF) return;
      var nx = dx[j] + ox, ny = dy[j] + oy;
      if (nx * nx + ny * ny < d2(i)) { dx[i] = nx; dy[i] = ny; }
    }
    for (py = 0; py < NH; py++) {         // forward
      for (px = 0; px < NW; px++) {
        i = py * NW + px;
        if (px > 0) put(i, i - 1, 1, 0);
        if (py > 0) put(i, i - NW, 0, 1);
        if (px > 0 && py > 0) put(i, i - NW - 1, 1, 1);
        if (px < NW - 1 && py > 0) put(i, i - NW + 1, -1, 1);
      }
      for (px = NW - 2; px >= 0; px--) { i = py * NW + px; put(i, i + 1, -1, 0); }
    }
    for (py = NH - 1; py >= 0; py--) {    // backward
      for (px = NW - 1; px >= 0; px--) {
        i = py * NW + px;
        if (px < NW - 1) put(i, i + 1, -1, 0);
        if (py < NH - 1) put(i, i + NW, 0, -1);
        if (px < NW - 1 && py < NH - 1) put(i, i + NW + 1, -1, -1);
        if (px > 0 && py < NH - 1) put(i, i + NW - 1, 1, -1);
      }
      for (px = 1; px < NW; px++) { i = py * NW + px; put(i, i - 1, 1, 0); }
    }

    // ③ grow 안쪽 빈 픽셀에 **가장 가까운 불투명 픽셀의 색**을 그대로 복사(반복)
    var lim2 = growPx * growPx, filled = 0;
    for (py = 0; py < NH; py++) {
      for (px = 0; px < NW; px++) {
        i = py * NW + px;
        if (out[i * 4 + 3] >= aMin) continue;      // 원본 잉크는 그대로
        var a = dx[i], b = dy[i];
        if (a >= INF) continue;                    // 공급원 없음
        if (a * a + b * b > lim2) continue;        // 도련 범위 밖
        var sx = px - a, sy = py - b;              // (dx,dy) 는 "나 → 공급원" 의 반대 방향 누적
        if (sx < 0 || sy < 0 || sx >= NW || sy >= NH) continue;
        var j = (sy * NW + sx) * 4, k = i * 4;
        if (out[j + 3] < aMin) continue;
        out[k] = out[j]; out[k + 1] = out[j + 1]; out[k + 2] = out[j + 2]; out[k + 3] = 255;
        filled++;
      }
    }
    return { W: NW, H: NH, data: out, pad: pad, filled: filled };
  }

  var api = { repeatLastPixel: repeatLastPixel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node 하네스
  root.MesCutBleed = api;                                                      // 패널
})(typeof window !== 'undefined' ? window : globalThis);
