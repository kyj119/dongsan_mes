/**
 * 자동 / 확인 분담 판정 — 「패널이 무엇을 하고, 무엇을 사람에게 넘기는가」
 *
 * ★이 모듈이 이 패널의 안전장치다. 판짜기는 틀려도 판이 나오는 축이라(§조용한 격하)
 *   **확인할 수 없는 것을 조용히 하지 않는 것**이 유일한 방어다.
 *   그래서 두 가지를 낸다.
 *     ① `planBleed()` — 도련을 **어떻게** 낼지. 전제가 안 서면 `skip` 하고 사유를 남긴다.
 *     ② `build()`     — 사람이 볼 확인 목록. 인수인계 문장을 그대로 싣는다.
 *
 * ★도련에서 가장 중요한 규칙: **하기 전에 전제를 재고, 안 서면 하지 않는다.**
 *   2026-09-17 실기에서 클립 확장 코드가 「클립 밖 데이터가 있으면」이라는 전제를 주석에만 적고
 *   한 번도 검사하지 않아, 조각 6개 중 5개를 「확장 5개(무손실)」로 보고했는데 실물엔 도련이 0이었다.
 *   **실행 횟수로 결과를 판정하지 않는다** — 거절은 `skip` 으로 세어 화면에 찍는다.
 *
 * ★전사는 원본이 규격에 딱 맞게 온다(용준님 확인). 그래서 「클립만 넓히기」는 기본 경로가 아니다
 *   — 클립 밖에 그림이 없다. 기본은 **가장자리 단색을 벌 크기 사각으로 까는 것**이고,
 *   이건 완성본 실측과도 일치한다(소울·솜씨·제주 전부 n=5 단색 사각 + 클리핑, 래스터 0).
 */
(function (root) {
  'use strict';

  function round2(v) { return Math.round(v * 100) / 100; }

  /**
   * 도련 경로 판정.
   * @param o.design  {x,y,w,h} 원본이 놓인 자리
   * @param o.panel   {x,y,w,h} 벌 — 여기까지 채워야 한다
   * @param o.edge    {solid:bool, color:[c,m,y,k]|null, outside:bool}
   *                    solid   = 원본 가장자리가 단색인가
   *                    outside = 클립 밖에 실제 그림이 있는가(전사에선 보통 false)
   * @param o.allowRepeat  래스터 폴백을 허용하는가(기본 true)
   */
  function planBleed(o) {
    o = o || {};
    var d = o.design, p = o.panel;
    if (!d || !p) return { mode: 'skip', why: 'no-geometry', grow: null };

    var grow = {
      l: round2(d.x - p.x),
      r: round2((p.x + p.w) - (d.x + d.w)),
      t: round2(d.y - p.y),
      b: round2((p.y + p.h) - (d.y + d.h))
    };
    var need = (grow.l > 0.01 || grow.r > 0.01 || grow.t > 0.01 || grow.b > 0.01);
    if (!need) return { mode: 'none', why: 'design-fills-panel', grow: grow };

    var e = o.edge || {};
    // ★**기본은 픽셀 반복(repeat)이다** — 2026-09-22 실기(고양 소노): 가장자리에 실제로 있는 것은
    //   사진(래스터)+줄무늬이었고 그라디언트는 위 변 하나뿐이었다. 「전체를 덮는 맨 위 칠」은 가장자리에 보이는
    //   것이 아니다 — 벡터로는 혼합 가장자리를 표현할 수 없다. 픽셀은 렌더된 가장자리 그 자체를 이어 붙이므로
    //   사진·그라디언트·단색 어느 경우도 맞는다(bleed.js 머리말 — 업계 도구 전부가 이 방식).
    //   단색이라도 픽셀이 같은 결과를 낸다. `solid`·`extend` 는 픽셀을 못 만들 때의 폴백으로만 남는다.
    if (o.allowRepeat !== false) return { mode: 'repeat', grow: grow, fallback: (e.solid && e.color) ? 'solid' : (e.extend ? 'extend' : 'skip') };

    // ── 폴백 (픽셀을 쓸 수 없을 때만) ──
    if (e.solid && e.color) return { mode: 'solid', color: e.color, grow: grow };
    if (e.extend === true) return { mode: 'extend', grow: grow };
    if (e.outside === true) return { mode: 'clip', grow: grow };

    return { mode: 'skip', why: e.solid === false ? 'edge-multicolor' : 'edge-unknown', grow: grow };
  }

  /** 도련 판정들을 한 줄로 센다 — 화면·로그에 그대로 찍는다(`bleedmode=solid:2 skip:0`) */
  function tally(plans) {
    var c = {};
    for (var i = 0; i < (plans || []).length; i++) {
      var m = plans[i] && plans[i].mode ? plans[i].mode : '?';
      c[m] = (c[m] || 0) + 1;
    }
    var out = [];
    for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) out.push(k + ':' + c[k]);
    return 'bleedmode=' + (out.length ? out.join(' ') : 'none');
  }

  var ORDER = { must: 0, check: 1 };
  // ★`ORDER[level] || 9` 로 쓰면 안 된다 — must 는 0 이고 0 은 falsy 라 9 로 떨어져
  //   **must 가 맨 아래로 간다.** 사람이 제일 먼저 봐야 할 줄이 화면 끝으로 밀리는 결함이다.
  function rank(level) { return (typeof ORDER[level] === 'number') ? ORDER[level] : 9; }

  /**
   * 확인 목록 조립. 규칙 문장은 각 축의 규칙 파일이 갖고 있고 여기서는 **고르고 합칠 뿐**이다.
   * @param o.mode    'plate'(가로등) | 'frame'(윈드)
   * @param o.bleed   planBleed() 결과
   * @param o.edge    {solid, light}
   * @param o.framePlan  frame.plan() 결과 (mode==='frame')
   * @param o.nonwoven   부직포가 붙는가
   */
  function build(o) {
    o = o || {};
    var items = [], i;

    if (o.mode === 'frame') {
      var fp = o.framePlan;
      if (fp && fp.review) for (i = 0; i < fp.review.length; i++) items.push(fp.review[i]);
    } else {
      var PR = root.MesPlateRules;
      if (PR && PR.REVIEW) {
        for (i = 0; i < PR.REVIEW.all.length; i++) items.push(PR.REVIEW.all[i]);
        for (i = 0; i < PR.REVIEW.sew.length; i++) items.push(PR.REVIEW.sew[i]);
        if (o.nonwoven) for (i = 0; i < PR.REVIEW.nonwoven.length; i++) items.push(PR.REVIEW.nonwoven[i]);
      }
    }

    // 도련이 자동으로 안 된 경우 — **조용히 넘어가지 않는다**
    var b = o.bleed;
    if (b) {
      if (b.mode === 'repeat') {
        items.push({ code: 'bleed-repeat', level: 'check', msg: '가장자리가 단색이 아니라 도련을 래스터로 채웠다 — 결과를 눈으로 확인한다' });
      } else if (b.mode === 'clip') {
        items.push({ code: 'bleed-clip', level: 'check', msg: '클립 밖 그림으로 도련을 냈다 — 네 변 모두 실제로 채워졌는지 본다' });
      } else if (b.mode === 'skip') {
        items.push({ code: 'bleed-skip', level: 'must', msg: '도련을 내지 못했다(' + b.why + ') — 도련을 직접 만든다' });
      }
    }

    // 재단선 — 바탕이 연하면 필요하다. 두께는 원단에 따라 갈린다(인수인계).
    if (o.edge && o.edge.light) {
      var t0 = o.trace || {};
      var PR0 = root.MesPlateRules;
      var fab = (PR0 && t0.fabric && PR0.RULES.fabric[t0.fabric]) ? PR0.RULES.fabric[t0.fabric] : null;
      items.push({
        code: 'cut-mark-needed', level: 'must',
        msg: '바탕이 연한색이다 — 재단선 M50 Y100 이 필요하다'
          + (fab ? ' (' + t0.fabric + ' → ' + fab.cutMarkPt + 'PT)' : '')
      });
    }

    // 산식이 남긴 경고 — 면 수와 밴드가 어긋나 보일 때
    if (o.trace && o.trace.sidesNote) {
      items.push({ code: 'sides-band', level: 'check', msg: o.trace.sidesNote });
    }

    // 끈고리·하도매 — 이제 패널이 그린다(2026-09-22). 몇 개를 어디 기준으로 그렸는지 **확인 항목**으로 남긴다.
    if (o.trace && o.trace.marks && (o.trace.marks.loops > 0 || o.trace.marks.holes > 0)) {
      items.push({
        code: 'marks-drawn', level: 'check',
        msg: '끈고리 ' + o.trace.marks.loops + '개 · 하도매 ' + o.trace.marks.holes + '개(상단 ' + o.trace.marks.holesTop
          + ' · 측면 ' + o.trace.marks.holesSide + ') — 원본 끝선 안쪽, 안쪽 = '
          + (o.trace.marks.innerSide === 'facing' ? '두 벌이 마주 보는 쪽' : '오른쪽(1벌 가정)') + '. 실물 위치를 확인한다'
      });
    }
    // 하도매 구 수만 있고 배치가 없으면(구 패널 입력) — 종전대로 사람이 넣는다
    if (o.trace && o.trace.hardware && o.trace.hardware.holes > 0 && !(o.trace.marks && o.trace.marks.holes > 0)) {
      items.push({
        code: 'hardware-holes', level: 'must',
        msg: '하도매 ' + o.trace.hardware.size + '호 ' + o.trace.hardware.holes
          + '구 — 펀칭·끈고리는 패널이 그리지 않는다. 직접 넣는다'
      });
    }

    // 부직포 cm 를 골랐으면 그 값을 확인 항목에 싣는다(부직포 축 자체는 아직 미지원)
    if (o.trace && o.trace.nonwovenCm) {
      items.push({
        code: 'nonwoven-cm', level: 'check',
        msg: '부직포 ' + o.trace.nonwovenCm + ' — 치수는 아직 산식에 안 들어간다. 자리를 직접 확인한다'
      });
    }

    // 같은 code 는 한 번만, must 가 위로
    var seen = {}, uniq = [];
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.code || seen[it.code]) continue;
      seen[it.code] = 1;
      uniq.push(it);
    }
    uniq.sort(function (a, b2) { return rank(a.level) - rank(b2.level); });
    return uniq;
  }

  /** 저장 전 관문 — must 가 남아 있으면 「확인했다」를 받아야 한다 */
  function mustCount(list) {
    var n = 0;
    for (var i = 0; i < (list || []).length; i++) if (list[i].level === 'must') n++;
    return n;
  }

  var api = { planBleed: planBleed, build: build, tally: tally, mustCount: mustCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MesReview = api;
})(typeof window !== 'undefined' ? window : globalThis);
