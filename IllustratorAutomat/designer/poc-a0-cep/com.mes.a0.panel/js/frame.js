/**
 * MODE B — 윈드배너 틀 조회 (실루엣 축)
 *
 * ★여기는 **판을 만들지 않는다.** 티어드롭을 좌우 반대로 겹쳐 끼운 배치(F형 105-267: x 478.73~815.63 중첩)는
 *   산식으로 재현할 수 없고, 틀 6종이 담고 있는 정보도 제각각이다. 그래서 하는 일은 셋뿐이다.
 *     ① (형, 규격) 으로 **틀을 찾는다** — 없으면 거절한다
 *     ② 원본을 앉힐 수 있는지 판정한다 — 실루엣이 규격과 다르면 `manual` 로 넘긴다
 *     ③ 디자이너가 확인할 목록을 만든다
 *
 * ★「없으면 거절」이 이 모듈의 핵심이다. 틀이 없는 규격을 추정해서 만들면 판은 나오지만 천은 틀린다
 *   (§조용한 격하). X형·H형은 인수인계에 형만 있고 **틀이 없다** — 그래서 만들지 않는다.
 */
(function (root) {
  'use strict';

  function catalog() { return root.MesFrameCatalog; }

  function fail(code, msg, extra) {
    var r = { ok: false, code: code, reason: msg };
    if (extra) r.detail = extra;
    return r;
  }

  /** 규격 허용오차 — 틀 실측이 소수점을 갖는다(698.88 ≈ 700). */
  var SPEC_TOL = 3;

  /**
   * (형, 규격) → 틀. 거래처 전용 틀은 client 가 맞을 때만 고른다.
   * @param o.type  'F' | 'S'
   * @param o.specW · o.specH  mm
   * @param o.client 거래처명(선택)
   */
  function lookup(o) {
    o = o || {};
    var C = catalog();
    if (!C) return fail('catalog', 'frame-catalog.js 가 먼저 로드되지 않았다');
    if (!o.type) return fail('type', '형이 없다 (F | S)');
    if (!(o.specW > 0) || !(o.specH > 0)) return fail('spec', '규격이 없다');

    var all = C.FRAMES;
    var sameType = [];
    var i, f;
    for (i = 0; i < all.length; i++) {
      f = all[i];
      if (f.type !== o.type) continue;
      sameType.push(f);
    }
    if (!sameType.length) {
      return fail('type', o.type + '형 틀이 없다 — 있는 형: ' +
        all.map(function (x) { return x.type; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).join(', '));
    }

    var hit = [];
    for (i = 0; i < sameType.length; i++) {
      f = sameType[i];
      if (Math.abs(f.spec.w - o.specW) <= SPEC_TOL && Math.abs(f.spec.h - o.specH) <= SPEC_TOL) hit.push(f);
    }
    if (!hit.length) {
      return fail('nomatch', o.type + '형 ' + o.specW + '×' + o.specH + ' 틀이 없다',
        sameType.map(function (x) { return x.id; }));
    }
    // 거래처 전용이 먼저 — 단 거래처가 맞을 때만
    var generic = null, dedicated = null;
    for (i = 0; i < hit.length; i++) {
      if (hit[i].client) { if (o.client && hit[i].client === o.client) dedicated = hit[i]; }
      else if (!generic) generic = hit[i];
    }
    var pick = dedicated || generic;
    if (!pick) return fail('client', hit[0].id + ' 는 ' + hit[0].client + ' 전용 틀이다', hit.map(function (x) { return x.id; }));
    return { ok: true, frame: pick };
  }

  /**
   * 틀 + 원본 → 어떻게 앉힐지 + 디자이너 확인 목록.
   * @param o.frame   lookup() 이 준 틀
   * @param o.design  {w,h} 원본 실측(mm) — 없으면 규격으로 본다
   * @param o.edgeSolid  가장자리가 단색인가 (재단선 판정 보조)
   */
  function plan(o) {
    o = o || {};
    var C = catalog();
    if (!C) return fail('catalog', 'frame-catalog.js 가 먼저 로드되지 않았다');
    var f = o.frame;
    if (!f || !f.id) return fail('frame', '틀이 없다');

    var d = o.design || { w: f.spec.w, h: f.spec.h };
    var review = [];
    var k;
    for (k = 0; k < C.REVIEW.all.length; k++) review.push(C.REVIEW.all[k]);
    for (k = 0; k < C.REVIEW.round.length; k++) review.push(C.REVIEW.round[k]);   // F·S 모두 라운드가 있다
    if (f.seamMm) for (k = 0; k < C.REVIEW.seam.length; k++) review.push(C.REVIEW.seam[k]);
    else review.push({ code: 'seam-missing', level: 'check', msg: '이 틀에는 시접이 그려져 있지 않다 — 시접을 직접 확인한다 (' + f.id + ')' });

    // 원본이 규격과 다르면 앉히지 않는다
    var specOff = Math.abs(d.w - f.spec.w) > SPEC_TOL || Math.abs(d.h - f.spec.h) > SPEC_TOL;
    if (specOff) {
      review.push({
        code: 'design-off-spec', level: 'must',
        msg: '원본이 규격과 다르다 — 원본 ' + d.w + '×' + d.h + ' vs 규격 ' + f.spec.w + '×' + f.spec.h
      });
    }

    var mode = f.placement;
    var why = null;
    if (mode === 'auto' && specOff) { mode = 'manual'; why = 'design-off-spec'; }
    if (f.placement === 'manual') {
      why = 'silhouette-off-spec';
      review.push({
        code: 'place-manual', level: 'must',
        msg: '틀만 연다 — 실루엣 ' + f.silhouette.w + ' 가 규격 ' + f.spec.w + ' 와 달라 패널이 앉히지 않는다. 앉히기는 디자이너가 한다'
      });
    }

    return {
      ok: true,
      frameId: f.id,
      file: f.file,
      plate: f.plate,
      vup: f.vup,
      mode: mode,                    // 'auto' = 실루엣 자리에 앉힌다 · 'manual' = 틀만 연다
      why: why,
      seamMm: f.seamMm,
      review: review,
      trace: { silhouette: f.silhouette, spec: f.spec, specOff: specOff, placementDeclared: f.placement }
    };
  }

  /** 카탈로그 요약 — UI 드롭다운용 */
  function list() {
    var C = catalog();
    if (!C) return [];
    return C.FRAMES.map(function (f) {
      return { id: f.id, type: f.type, spec: f.spec, vup: f.vup, placement: f.placement, client: f.client || null };
    });
  }

  var api = { lookup: lookup, plan: plan, list: list, SPEC_TOL: SPEC_TOL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MesFrame = api;
})(typeof window !== 'undefined' ? window : globalThis);
