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

  // 거리변환 미설정 센티널 — Int16 배열에 들어가야 하므로 1e9 를 쓸 수 없다.
  //   비교는 값이 아니라 **동치**로 한다: 실제 거리(예: 200px)가 센티널보다 커져 오판하는 일을 막는다.
  var SENT = 32767;
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
   * @param opt.srcInsetPx 공급원 색의 **안정점 탐색 깊이**(px). 기본 2 · 0 = 최외곽 그대로.
   *   ★2026-08-24 반백반흑 실사용 보고("흰 부분 도련이 회색") — 가장자리 최외곽 픽셀은
   *   AA·축소 스무딩·래스터 원본(사진/스캔)의 소프트 에지 때문에 **섞인 색(회색)**일 수 있다.
   *   최외곽을 그대로 반복하면 그 오염이 3mm 로 확대된다.
   *   ⚠️ 고정 깊이로 무조건 안쪽을 뽑으면 안 된다 — 가장자리 2px 안쪽 **내부 선**의 색을
   *   끌어와 벡터 오프셋 시절 결함이 되살아난다(하네스 §2가 실제로 잡았다). 그래서
   *   **안정점 탐색**: 같은 방향으로 들어가며 "다음 픽셀과 색이 같은(±8/채널)" 첫 픽셀을
   *   쓴다. 블렌드 밴드는 색이 계속 변하므로 통과되고, 진짜 색 경계는 그 앞의 안정된
   *   가장자리 색에서 멈춘다. 깊이 안에 안정점이 없으면(그라데이션·헤어라인) 최외곽 유지.
   * @returns {W,H,data,pad} pad = 사방으로 늘어난 픽셀 수(=growPx). 원본은 (pad,pad) 위치에 그대로 있다.
   */
  function repeatLastPixel(src, growPx, opt) {
    opt = opt || {};
    var aMin = opt.alphaMin;
    var inset = (typeof opt.srcInsetPx === 'number') ? Math.max(0, Math.round(opt.srcInsetPx)) : 2;

    // ★growPx 는 숫자(사방 같음) 또는 {t,r,b,l}(변마다 다름)이다 — 2026-09-18 전사 축에서 필요해졌다.
    //   가로등배너는 좌우 23.25 · 밴드 쪽 0 · 반대쪽 30.48 처럼 **비대칭**이라 단일 값으로 표현할 수 없다.
    //   ⚠️ 숫자를 넘기면 동작은 **종전과 완전히 같다**(아래 한계식이 원으로 퇴화한다) — 재단 축이 흔들리지 않는다.
    var sym = (typeof growPx === 'number');
    var gL = sym ? growPx : (growPx && growPx.l) || 0;
    var gR = sym ? growPx : (growPx && growPx.r) || 0;
    var gT = sym ? growPx : (growPx && growPx.t) || 0;
    var gB = sym ? growPx : (growPx && growPx.b) || 0;
    var padL = Math.max(0, Math.ceil(gL)), padR = Math.max(0, Math.ceil(gR));
    var padT = Math.max(0, Math.ceil(gT)), padB = Math.max(0, Math.ceil(gB));
    var pad = padL;   // 하위호환 — 대칭일 때만 뜻이 있다. 비대칭이면 아래에서 null 로 바꾼다.

    var W = src.W, H = src.H, s = src.data;
    var NW = W + padL + padR, NH = H + padT + padB;
    var n = NW * NH;
    var out = new Uint8ClampedArray(n * 4);

    // ① 확장 캔버스에 원본을 (padL, padT) 위치에 놓는다
    for (var y = 0; y < H; y++) {
      var so = y * W * 4, to = ((y + padT) * NW + padL) * 4;
      for (var x = 0; x < W * 4; x++) out[to + x] = s[so + x];
    }

    // ★임계는 원본을 얹은 **뒤에** 정한다 — 실제 알파 분포를 봐야 적응형이 성립한다
    if (typeof aMin !== 'number') aMin = pickAlphaMin(out, n);

    // ② 8SSEDT — 각 픽셀에서 가장 가까운 불투명 픽셀까지의 (dx,dy)
    // ★Int16 로 충분하다 — dx/dy 는 "가장 가까운 잉크까지의 픽셀 오프셋"이고 한 변이 32767px 를
    //   넘는 마스크는 애초에 만들지 않는다(픽셀 상한에서 먼저 걸린다). 픽셀당 12바이트 → 8바이트로
    //   줄어 같은 메모리로 상한을 올릴 수 있고, 그만큼 **큰 조각이 저해상도로 안 떨어진다**
    //   (저해상도 = 도련 외곽선 계단이 커지는 원인, 2026-08-06 용준님 지적).
    var dx = new Int16Array(n), dy = new Int16Array(n);
    var i, px, py;
    for (i = 0; i < n; i++) {
      if (out[i * 4 + 3] >= aMin) { dx[i] = 0; dy[i] = 0; }
      else { dx[i] = SENT; dy[i] = SENT; }
    }
    function d2(i) { var a = dx[i], b = dy[i]; return (a === SENT || b === SENT) ? Infinity : (a * a + b * b); }
    function put(i, j, ox, oy) {          // j 의 값을 (ox,oy) 만큼 옮겨 i 에 후보로 넣는다
      if (dx[j] === SENT) return;
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
    //   ★한계는 **방향별**이다. (a,b) 는 공급원 → 나 의 변위이므로 a>0 이면 오른쪽, b>0 이면 아래쪽 성장이다.
    //     (a/gx)² + (b/gy)² <= 1 로 재면 네 값이 같을 때 a²+b² <= g² 로 **정확히 퇴화**한다(종전 동작 보존).
    var filled = 0;
    // ★모서리 — 기본(round)은 타원 한계라 **모서리가 빈다**. 실루엣을 따라 부풀리는 재단 조각엔 그게 맞지만
    //   사각형(가로등배너 벌 · 사각 조각)은 모서리까지 채워야 한다(용준님 2026-09-23 실기 — 「모서리가 채워지지 않아 아쉽다」).
    //   `opt.corner === 'square'` 면 한계가 **사각**(|a|≤gx · |b|≤gy)이 되고, 모서리 픽셀은 8SSEDT 가 준 가장 가까운
    //   잉크(= 원본 모서리 픽셀)의 색을 받아 각진 블록으로 채워진다. 기본값은 종전 그대로 — 재단 조각은 안 흔들린다.
    var square = (opt.corner === 'square');
    function within(a, b) {
      var gx = (a >= 0) ? gR : gL;
      var gy = (b >= 0) ? gB : gT;
      if (a !== 0 && gx <= 0) return false;
      if (b !== 0 && gy <= 0) return false;
      if (square) return Math.abs(a) <= gx && Math.abs(b) <= gy;
      var u = (gx > 0) ? (a / gx) : 0;
      var v = (gy > 0) ? (b / gy) : 0;
      return (u * u + v * v) <= 1;
    }
    for (py = 0; py < NH; py++) {
      for (px = 0; px < NW; px++) {
        i = py * NW + px;
        if (out[i * 4 + 3] >= aMin) continue;      // 원본 잉크는 그대로
        var a = dx[i], b = dy[i];
        if (a === SENT) continue;                   // 공급원 없음
        if (!within(a, b)) continue;                // 도련 범위 밖(방향별)
        var sx = px - a, sy = py - b;              // (dx,dy) 는 "나 → 공급원" 의 반대 방향 누적
        if (sx < 0 || sy < 0 || sx >= NW || sy >= NH) continue;
        var j = (sy * NW + sx) * 4, k = i * 4;
        if (out[j + 3] < aMin) continue;
        // ★공급원 안정점 탐색 — 최외곽이 블렌드(AA·스무딩·소프트 에지)면 색이 안정되는
        //   첫 안쪽 픽셀을 쓴다(위 주석). 안정점이 없으면 최외곽 유지 = 종전 동작.
        //   TOL2 = 채널당 ±8 (8²×3 = 192) — 사진 노이즈는 안정, 블렌드 계단은 불안정으로 갈린다.
        if (inset > 0) {
          var dlen = Math.sqrt(a * a + b * b) || 1;
          var ux = a / dlen, uy = b / dlen;
          var prev = j;
          for (var t = 1; t <= inset + 1; t++) {
            var cx = sx - Math.round(ux * t), cy = sy - Math.round(uy * t);
            if (cx < 0 || cy < 0 || cx >= NW || cy >= NH) break;
            var jj = (cy * NW + cx) * 4;
            if (out[jj + 3] < aMin) break;
            var dr = out[prev] - out[jj], dg = out[prev + 1] - out[jj + 1], db = out[prev + 2] - out[jj + 2];
            if (dr * dr + dg * dg + db * db <= 192) { j = prev; break; }   // prev 가 안정점
            prev = jj;
          }
        }
        out[k] = out[j]; out[k + 1] = out[j + 1]; out[k + 2] = out[j + 2]; out[k + 3] = 255;
        filled++;
      }
    }
    // ⚠️비대칭이면 pad 를 null 로 돌려준다 — 하나의 숫자로 원점을 표현할 수 없기 때문이다.
    //   옛 호출부가 그대로 쓰면 **조용히 어긋나는 대신 눈에 띄게 깨진다**. 새 호출부는 pads 를 본다.
    return { W: NW, H: NH, data: out, pad: (sym ? pad : null), pads: { t: padT, r: padR, b: padB, l: padL }, filled: filled };
  }

  /**
   * 이 그림이 **사각형인가** — 불투명 픽셀이 상자를 거의 다 채우고(≥98%) 네 테두리 줄이 각각 ≥95% 불투명하면 사각으로 본다.
   * 재단이 「사각 조각이면 모서리를 각지게」 정할 때 쓴다(원·로고·글자 덩어리는 false → 종전처럼 둥글게).
   * ⚠️둥근 모서리 사각은 true 가 될 수 있다 — 각진 도련이 칼선 밖으로 조금 더 나갈 뿐이라 해가 없다(잘려 나간다).
   */
  function isRectLike(src, alphaMin) {
    var W = src.W, H = src.H, d = src.data, aMin = (typeof alphaMin === 'number') ? alphaMin : 128;
    if (!(W > 2 && H > 2)) return false;
    var n = W * H, op = 0, i;
    for (i = 0; i < n; i++) if (d[i * 4 + 3] >= aMin) op++;
    if (op / n < 0.98) return false;
    var top = 0, bot = 0, lef = 0, rig = 0, x, y;
    for (x = 0; x < W; x++) { if (d[x * 4 + 3] >= aMin) top++; if (d[((H - 1) * W + x) * 4 + 3] >= aMin) bot++; }
    for (y = 0; y < H; y++) { if (d[(y * W) * 4 + 3] >= aMin) lef++; if (d[(y * W + W - 1) * 4 + 3] >= aMin) rig++; }
    return top / W >= 0.95 && bot / W >= 0.95 && lef / H >= 0.95 && rig / H >= 0.95;
  }

  var api = { repeatLastPixel: repeatLastPixel, isRectLike: isRectLike };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node 하네스
  root.MesCutBleed = api;                                                      // 패널
})(typeof window !== 'undefined' ? window : globalThis);
