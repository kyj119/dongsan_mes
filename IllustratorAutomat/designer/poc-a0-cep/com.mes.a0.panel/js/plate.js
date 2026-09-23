/**
 * MODE A — 가로등배너 판 산식 (사각형 축)
 *
 * 왜 순수 모듈인가: 판짜기는 **틀려도 판이 나온다**. 200 이 뜨고 화면이 정상인 §조용한 격하 축이라,
 * 「어떤 판을 만들까」를 UI 파일 안에 두면 회귀가 그 틈으로 지나간다(`placement.js` 가 생긴 이유와 같다).
 * 여기는 일러도 DOM 도 모른다 — 숫자만 받아 숫자를 낸다. 그래서 `cut:plate` 로 검증할 수 있다.
 *
 * ★좌표계 = **좌상단 원점 · x 오른쪽 · y 아래로**(mm).
 *   완성본 EPS 를 읽을 때와 같은 방향이다(AI EPS 는 `1 -1 scale` 이 앞에 붙어 y 가 뒤집혀 있다).
 *   밴드(봉미싱)가 y=0 쪽에 온다 — 실물 배너의 **상단**이다.
 *
 * ★두 단계로 나눠 계산한다. 섞으면 「왜 2.5cm 가 아니지」를 영원히 다시 묻게 된다.
 *   1단계 가공: 전부 정수. 시접·여유·밴드를 더해 판을 만든다.
 *   2단계 보정: **세로만** `shrink` 를 곱한다(전사 수축). 가로는 곱하지 않는다.
 *
 * ★전체가로폭 축소는 **원본이 아니라 시접을 먹는다**. 실측 가로배율이 1.00000 이고 시접만
 *   25 → 23.25 로 줄어 있었다. 그래서 시접은 상수가 아니라 **역산값**이고 `trace` 에 둘 다 남긴다.
 */
(function (root) {
  'use strict';

  /**
   * 규칙은 **호출 시점에** root 에서 읽는다 — 로드 시점에 캡처하면 순서에 묶인다.
   * ⚠️ `require` 를 쓰지 않는 이유: repo 가 `"type":"module"` 이라 Node 가 이 파일을 ESM 으로 본다.
   *   기존 하네스는 `new Function('module','globalThis', src)(mod, root)` 로 평가한다(bleed-bench.mjs 전례)
   *   — 그 방식에서 동작하려면 의존을 root 에서만 가져와야 한다.
   */
  function rules() { return root.MesPlateRules; }

  function round2(v) { return Math.round(v * 100) / 100; }

  function fail(code, msg) { return { ok: false, code: code, reason: msg }; }

  /**
   * @param o.specW  주문 규격 가로(mm) — 60cm → 600
   * @param o.specH  주문 규격 세로(mm) — 180cm → 1800
   * @param o.vup    한 판에 앉힐 벌 수 (1조 = 2벌)
   * @param o.seam   봉재방법 — '쌍침' | '오바' | '칼재단' | '열재단'
   * @param o.sewCm  봉미싱 cm (작업지시서 「상단 N cm 봉미싱」)
   * @param o.band   마감 키 — plate-rules.FINISH ('top' | 'topbottom' | 'nonwoven7' | 'nonwoven10')
   * @param o.media  원단 — '60폭'
   * @param o.loops  끈고리 — true/false(전부) 또는 {top, mid, bottom} 자리별(기본 전부 켜짐). 접는선은 밴드가 있으면 항상
   * @param o.holesTop / o.holesSide  하도매 상단·측면 개수(기본 0·0 = 없음)
   */
  function computePlate(o) {
    o = o || {};
    var Rules = rules();
    if (!Rules) return fail('rules', 'plate-rules.js 가 먼저 로드되지 않았다');
    var R = Rules.RULES;

    // ── 입력 검증 — 모르는 축은 **만들지 않는다**(§거절 규칙)
    if (!(o.specW > 0) || !(o.specH > 0)) return fail('spec', '규격이 없다');
    var media = R.media[o.media];
    if (!media) return fail('media', '원단 폭 미등록: ' + o.media + ' (등록된 것: ' + Object.keys(R.media).join(', ') + ')');
    var seamMm = R.seamMm[o.seam];
    if (typeof seamMm !== 'number') return fail('seam', '봉재방법 미등록: ' + o.seam);
    var FIN = Rules.FINISH ? Rules.FINISH[o.band] : null;
    if (!FIN) return fail('band', '마감 미지원: ' + o.band + ' (지원: ' + Object.keys(Rules.FINISH || {}).join(', ') + ')');
    var bandCount = FIN.bands.length;                  // 0 = 부직포(밴드 없음)
    var hasTopBand = FIN.bands.indexOf('top') >= 0, hasBottomBand = FIN.bands.indexOf('bottom') >= 0;
    var nonwovenCm = (typeof FIN.nonwovenCm === 'number') ? FIN.nonwovenCm : null;
    var vup = Math.round(o.vup || 1);
    if (vup < 1) return fail('vup', '벌 수가 1 미만');
    // 봉미싱 cm 은 밴드가 있을 때만 뜻이 있다 — 부직포는 입력을 안 쓴다(패널은 칸을 숨긴다)
    var sewCm = bandCount ? o.sewCm : 0;
    if (!(sewCm >= 0)) return fail('sew', '봉미싱 cm 이 없다');

    // ★봉재 면 수 — **폭 산식을 바꾼다**(좌우 시접 개수). 기본은 3면(가로등 표준).
    var sides = (o.sewSides === undefined || o.sewSides === null) ? 3 : Math.round(o.sewSides);
    var sideRule = R.sewSides[sides];
    if (!sideRule) {
      return fail('sides', sides + '면쌍침은 어느 변인지 모른다 — 가로등 실물 사례가 없다 (지원: '
        + Object.keys(R.sewSides).join('/') + '면)');
    }
    // 3면 = 좌·우·**하단**이고 상단은 봉미싱 밴드다(2026-09-22 정정). 지금 마감은 둘 다 밴드를 갖지만
    // 상하봉미싱이면 밴드가 둘이라 면 수와 어긋날 수 있다 — 막지 않고 **알린다**(사람 판단).
    var sidesNote = null;
    if (sides === 3 && bandCount === 2) sidesNote = '3면쌍침인데 밴드가 상·하 둘이다 — 면 수를 확인하라';

    var gap = media.gap;

    // ── 1단계 · 가로 (정수)
    var panelW0 = o.specW + seamMm * sideRule.lr;     // 공칭 벌폭 650 (좌우 2면)
    var rawW = panelW0 * vup + gap * (vup - 1);       // 그냥 나열하면 1301
    var plateW, panelW, shrunkByW;
    if (media.plateW && rawW > media.plateW) {
      // 「전체가로폭만 줄이기」 — 줄어드는 몫은 전부 시접이 먹는다
      plateW = media.plateW;
      panelW = (plateW - gap * (vup - 1)) / vup;      // 646.5
      shrunkByW = rawW - plateW;                      // 7
    } else {
      plateW = rawW;
      panelW = panelW0;
      shrunkByW = 0;
    }
    var seamActual = (panelW - o.specW) / sideRule.lr;   // 23.25 (좌우 2면 기준)
    if (seamActual < 0) return fail('narrow', '판 폭이 원본보다 좁다(원본 ' + o.specW + ' · 벌 ' + round2(panelW) + ')');

    // ── 1단계 · 세로 (정수)
    var pad = R.panelPadMm[o.band];                   // 상단봉미싱 30 · 상하 0
    var panelH0 = o.specH + pad;                      // 1830
    var bandH0 = bandCount ? (sewCm * 10 + R.sewAddMm) : 0;   // 봉미싱 + 1cm · 부직포는 0
    var plateH0 = panelH0 + bandH0 * bandCount;       // 1890

    // ── 2단계 · 세로만 수축보정
    var k = R.shrink;
    var panelH = panelH0 * k;
    var bandH = bandH0 * k;
    var designH = o.specH * k;
    var plateH = plateH0 * k;

    // ── 배치
    var panels = [], design = [], bands = [], i, x;
    for (i = 0; i < vup; i++) {
      x = i * (panelW + gap);
      var topH = hasTopBand ? bandH : 0;             // 위 밴드가 없으면(부직포) 원본이 판 위 끝에 붙는다
      panels.push({ x: round2(x), y: round2(topH), w: round2(panelW), h: round2(panelH) });
      // 원본은 밴드에 붙고, 여유(pad)는 반대쪽에 남는다
      design.push({ x: round2(x + seamActual), y: round2(topH), w: round2(o.specW), h: round2(designH) });
      if (hasTopBand) bands.push({ x: round2(x), y: 0, w: round2(panelW), h: round2(bandH) });
      if (hasBottomBand) bands.push({ x: round2(x), y: round2(topH + panelH), w: round2(panelW), h: round2(bandH) });
    }
    // ★도련이 덮어야 할 전체 = 벌 ∪ 밴드 (용준님 2026-09-22 「봉미싱 여백에도 도련처럼 비슷한 색이 있어야 한다」).
    //   종전엔 밴드 색을 단색일 때만 따로 채워, 늘리기·픽셀 경로에서는 밴드가 **비어(백색) 나갔다**.
    //   이제 도련 경로 셋이 전부 이 사각을 채운다 — 밴드는 접혀 뒤로 넘어가지만 재단 뒤 가장자리에 색이 남아야 한다.
    var outer = [];
    for (i = 0; i < vup; i++) {
      var ob = panels[i];
      var oy0 = ob.y, oy1 = ob.y + ob.h, q2;
      for (q2 = 0; q2 < bands.length; q2++) {
        var bb = bands[q2];
        if (Math.abs(bb.x - ob.x) > 0.01) continue;
        if (bb.y < oy0) oy0 = bb.y;
        if (bb.y + bb.h > oy1) oy1 = bb.y + bb.h;
      }
      outer.push({ x: ob.x, y: round2(oy0), w: ob.w, h: round2(oy1 - oy0) });
    }

    // ── 접는선·끈고리·하도매 — 정본 = plate-rules.marks (용준님 2026-09-22 확정 → 2026-09-23 정정)
    //   좌표는 판(mm, 좌상단 원점). 세로는 원본과 같이 수축보정을 먹은 좌표다 — 표시는 원본과 **같은 축**에 있어야
    //   재단 뒤 실물에서 제자리에 온다.
    //   ★선(접는선·끈고리)은 원본 안이 아니라 **시접 띠 위**다 — 벌 바깥 끝선(도련이 끝나는 재단선)에 붙어 안쪽으로 시접 폭만큼.
    //     왼쪽 선 = [벌 왼 끝, 원본 왼 끝] · 오른쪽 선 = [원본 오른 끝, 벌 오른 끝]. 시접은 접혀 뒤로 넘어가므로 완성면에 안 남는다.
    //   접는선 = 밴드가 접히는 자리(원본 위/아래 끝선) 양쪽 — 밴드가 있을 때만. 부직포는 없다.
    //   끈고리 = 안쪽 한 개씩: ①위 접는선 + 밴드 높이(부직포는 위 끝선 + 부직포 폭 + 1cm) ②원본 중간 ③아래 접는선 − 밴드 높이.
    //   ⚠️시접이 0(칼재단·열재단)이면 선을 놓을 띠가 없다 — 그리지 않고 trace 에 남긴다(추측해서 원본 안에 넣지 않는다).
    var MK = R.marks;
    var folds = [], loops = [], holes = [];
    // 끈고리 선택 — 자리마다 따로(용준님 2026-09-23). true/false 는 전부 켜기/끄기(구 호출자 호환).
    var sel = o.loops, wantTop, wantMid, wantBottom;
    if (sel === undefined || sel === null || sel === true) { wantTop = true; wantMid = true; wantBottom = true; }
    else if (sel === false) { wantTop = false; wantMid = false; wantBottom = false; }
    else { wantTop = !!sel.top; wantMid = !!sel.mid; wantBottom = !!sel.bottom; }
    var nTop = Math.max(0, Math.round(o.holesTop || 0)), nSide = Math.max(0, Math.round(o.holesSide || 0));
    var lineLen = round2(seamActual);
    var noSeam = !(lineLen > 0);
    var nwLoopMm = (nonwovenCm !== null) ? (nonwovenCm * 10 + ((R.nonwoven && R.nonwoven.loopAddMm) || 0)) * k : 0;
    for (i = 0; i < vup; i++) {
      var d = design[i], pn = panels[i];
      // 「안쪽」 = 마주 보는 쪽. 2벌이면 벌①은 오른쪽·벌②는 왼쪽. 1벌이면 오른쪽(가정 — trace 에 남긴다).
      var inner = (vup >= 2) ? ((i === 0) ? 'right' : 'left') : 'right';
      var xL = d.x, xR = d.x + d.w;
      var lineAt = function (row, side, kind) {
        var x1 = (side === 'left') ? pn.x : xR;
        return { panel: i, x: round2(x1), y: round2(row), len: lineLen, side: side, kind: kind, weightPt: MK.line.weightPt };
      };
      if (MK && MK.line && !noSeam) {
        if (hasTopBand) { folds.push(lineAt(d.y, 'left', 'fold')); folds.push(lineAt(d.y, 'right', 'fold')); }
        if (hasBottomBand) { folds.push(lineAt(d.y + d.h, 'left', 'fold')); folds.push(lineAt(d.y + d.h, 'right', 'fold')); }
        if (wantTop) {
          if (hasTopBand) loops.push(lineAt(d.y + bandH, inner, 'loop'));
          else if (nonwovenCm !== null) loops.push(lineAt(d.y + nwLoopMm, inner, 'loop'));
        }
        if (wantMid) loops.push(lineAt(d.y + d.h / 2, inner, 'loop'));
        if (wantBottom && hasBottomBand) loops.push(lineAt(d.y + d.h - bandH, inner, 'loop'));
      }
      if (MK && MK.hole && (nTop > 0 || nSide > 0)) {
        var ins = MK.hole.insetMm, rad = MK.hole.diaMm / 2;
        var pts = [], q;
        var put = function (cx, cy) {
          for (var z = 0; z < pts.length; z++) if (Math.abs(pts[z].cx - cx) < 1 && Math.abs(pts[z].cy - cy) < 1) return;   // 겹침 = 하나
          pts.push({ panel: i, cx: round2(cx), cy: round2(cy), r: rad });
        };
        // 상단 N — 위 끝선 아래 1cm 줄. 2 = 양 모서리(가로도 1cm 안쪽), 1 = 가운데, N≥3 = 모서리 사이 등분
        if (nTop === 1) put(xL + d.w / 2, d.y + ins);
        else for (q = 0; q < nTop; q++) put(xL + ins + (d.w - 2 * ins) * q / (nTop - 1), d.y + ins);
        // 측면 N — 안쪽 변 안쪽 1cm 줄. 3 = 위 모서리·중간·아래 모서리, 2 = 위·아래 모서리, 1 = 중간
        var xS = (inner === 'left') ? (xL + ins) : (xR - ins);
        if (nSide === 1) put(xS, d.y + d.h / 2);
        else for (q = 0; q < nSide; q++) put(xS, d.y + ins + (d.h - 2 * ins) * q / (nSide - 1));
        for (q = 0; q < pts.length; q++) holes.push(pts[q]);
      }
    }

    return {
      ok: true,
      plate: { w: round2(plateW), h: round2(plateH) },
      panels: panels,
      design: design,
      bands: bands,
      outer: outer,                                   // 벌 ∪ 밴드 — 도련이 덮는 전체
      folds: folds,                                   // 접는선(시접 폭 가로선) — 밴드가 접히는 자리 양쪽
      loops: loops,                                   // 끈고리(시접 폭 가로선) — 안쪽
      holes: holes,                                   // 하도매(Ø5mm 원) — 겹침 제거 후
      punches: [],                                    // 봉미싱 계열엔 펀칭이 없다(펀칭 변형은 부직포 축 — 미지원)
      trace: {
        seamNominal: seamMm,                          // 25  ← 인수인계의 「쌍침 2.5cm」
        seamActual: round2(seamActual),               // 23.25 ← 축소가 먹은 뒤
        shrunkByW: round2(shrunkByW),                 // 7
        rawW: round2(rawW),
        panelH0: round2(panelH0), bandH0: round2(bandH0), plateH0: round2(plateH0),
        shrink: k, bandCount: bandCount, pad: pad, gap: gap, vup: vup,
        sewSides: sides, seamSideCount: sideRule.lr,
        // 산식을 바꾸지 않지만 **판을 만든 조건**으로 남긴다 — 나중에 「왜 이 판이 이런가」를 되짚을 근거다
        fabric: o.fabric || null, nonwovenCm: nonwovenCm, finish: o.band,
        hardware: o.hardware || null, sidesNote: sidesNote,
        marks: { folds: folds.length, loops: loops.length, holes: holes.length, holesTop: nTop, holesSide: nSide,
          lineLen: lineLen, noSeam: noSeam,
          loopSel: ((wantTop ? 'top,' : '') + (wantMid ? 'mid,' : '') + (wantBottom ? 'bottom,' : '')).replace(/,$/, ''),
          innerSide: (vup >= 2 ? 'facing' : 'right-assumed') }
      }
    };
  }

  var api = { computePlate: computePlate, round2: round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node 하네스
  root.MesPlate = api;                                                         // 패널
})(typeof window !== 'undefined' ? window : globalThis);
