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
   * @param o.band   'top' | 'topbottom'
   * @param o.media  원단 — '60폭'
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
    var bandCount = Rules.BANDS[o.band];
    if (!bandCount) return fail('band', '마감 미지원: ' + o.band + ' (지원: ' + Object.keys(Rules.BANDS).join(', ') + ')');
    var vup = Math.round(o.vup || 1);
    if (vup < 1) return fail('vup', '벌 수가 1 미만');
    if (!(o.sewCm >= 0)) return fail('sew', '봉미싱 cm 이 없다');

    // ★봉재 면 수 — **폭 산식을 바꾼다**(좌우 시접 개수). 기본은 3면(가로등 표준).
    var sides = (o.sewSides === undefined || o.sewSides === null) ? 3 : Math.round(o.sewSides);
    var sideRule = R.sewSides[sides];
    if (!sideRule) {
      return fail('sides', sides + '면쌍침은 어느 변인지 모른다 — 가로등 실물 사례가 없다 (지원: '
        + Object.keys(R.sewSides).join('/') + '면)');
    }
    // 3면 = 좌·우·상단이고 상단은 **밴드가 담당**한다. 지금 마감은 둘 다 밴드를 갖지만
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
    var bandH0 = o.sewCm * 10 + R.sewAddMm;           // 봉미싱 + 1cm
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
      panels.push({ x: round2(x), y: round2(bandH), w: round2(panelW), h: round2(panelH) });
      // 원본은 밴드에 붙고, 여유(pad)는 반대쪽에 남는다
      design.push({ x: round2(x + seamActual), y: round2(bandH), w: round2(o.specW), h: round2(designH) });
      bands.push({ x: round2(x), y: 0, w: round2(panelW), h: round2(bandH) });
      if (bandCount === 2) bands.push({ x: round2(x), y: round2(bandH + panelH), w: round2(panelW), h: round2(bandH) });
    }

    return {
      ok: true,
      plate: { w: round2(plateW), h: round2(plateH) },
      panels: panels,
      design: design,
      bands: bands,
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
        fabric: o.fabric || null, nonwovenCm: (o.nonwovenCm === undefined) ? null : o.nonwovenCm,
        hardware: o.hardware || null, sidesNote: sidesNote
      }
    };
  }

  var api = { computePlate: computePlate, round2: round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node 하네스
  root.MesPlate = api;                                                         // 패널
})(typeof window !== 'undefined' ? window : globalThis);
