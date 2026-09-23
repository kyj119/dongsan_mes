/**
 * 주문 라인 → 전사 패널 입력 매핑 — **순수 모듈**(하네스 `npm run cut:trorder` 가 이 파일을 그대로 돌린다).
 *
 * 입력 = MES `GET /api/workbench/intake-config` 의 `open_lines` 한 줄(에이전트가 `config.json` 으로 중계 → 패널이 읽는다):
 *   {order_number, client_name, item_name, item_code, sub_category, width, height, quantity, unit,
 *    finishing(JSON 문자열|객체 — 변별 마감 {top,bottom,left,right,*_cm}), post_processing(JSON 배열 — [{code,name,params}])}
 * 출력 = { ok, fields:{specW, specH, vup, fabric, seam, sides, band, sewCm, hwSize, hwTop, hwSide, loops:{top,mid,bottom}},
 *          filled:[키…], defaulted:[{key, why}], notes:[…] }
 *
 * 원칙(용준님 2026-09-23 확정):
 *   · 벌 수 = **판매단위** 「조」(1조 = 2벌 — 0620 order_items.sales_unit/unit_factor 스냅샷, 단위표 0619). unit 열은 기본단위(EA)라 보지 않는다.
 *     판매단위가 조가 아니면(스냅샷 없음·EA) 1벌로 두고 **말한다**. 환산계수가 2 인데 이름이 조가 아니어도 2벌로 두고 말한다.
 *   · 마감 = 변별 마감의 top/bottom 봉미싱(+cm) 또는 후가공 PP-NONWOVEN(부직포 7/10). 둘 다 없으면 채우지 않는다.
 *   · 하도매 = PP-GROMMET params {size, top, side}. 옛 {holes:'2구'} 는 상단 2 로 옮기고 말한다.
 *   · 끈고리 = PP-LOOP params {top, mid, bottom} = 넣음|없음. 옵션이 없으면 전부 켜짐(패널 기본).
 *   · 모르는 것은 **채우지 않고 말한다**(§거절 규칙) — 채운 것·기본값으로 둔 것을 따로 센다.
 * ⚠️ 여기엔 DOM 이 없다. 패널(tr-main.js)이 결과를 입력칸에 넣는다.
 */
(function (root) {
  'use strict';

  /** 에이전트가 중계한 MES 설정 파일 — 재단(cut-main.js CONFIG_PATH)과 같은 파일이다. */
  var CONFIG_PATH = 'Z:/DESIGNS/IA-등록/_config/config.json';

  function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }
  function parseJson(v) {
    if (v == null) return null;
    if (typeof v !== 'string') return v;
    var s = trim(v);
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function round1(v) { return Math.round(v * 10) / 10; }

  /** 가로등배너 라인인가 — 소분류·품목명·품목코드(TRB-*) 셋 중 하나면 된다(이관 라인은 소분류가 빈 경우가 있다). */
  function isStreetlight(line) {
    if (!line) return false;
    var sc = trim(line.sub_category), nm = trim(line.item_name), code = trim(line.item_code);
    return sc.indexOf('가로등') >= 0 || nm.indexOf('가로등') >= 0 || /^TRB-/.test(code.toUpperCase());   // 정규식 i 플래그는 cut:smoke 식별자 스캐너가 미선언 i 로 본다
  }

  /** 피커 한 줄 표기 — `주문번호 · 거래처 · 품목 60×180 · 20조` */
  function label(line) {
    var w = num(line.width), h = num(line.height);
    var size = (w && h) ? (' ' + round1(w) + '×' + round1(h)) : '';
    // 판매단위 스냅샷이 있으면 그것(20조), 없으면 기본단위 수량(40EA)
    var qty = (line.sales_qty != null && trim(line.sales_unit)) ? (' · ' + line.sales_qty + trim(line.sales_unit))
      : ((line.quantity != null) ? (' · ' + line.quantity + trim(line.unit || '')) : '');
    return trim(line.order_number) + ' · ' + trim(line.client_name) + ' · ' + trim(line.item_name) + size + qty;
  }

  function findPp(list, code, name) {
    if (!list || !list.length) return null;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p) continue;
      if (trim(p.code) === code || trim(p.name) === name || trim(p.name).indexOf(name) === 0) return p;
    }
    return null;
  }
  function yes(v) { var s = trim(v); return s === '넣음' || s === 'O' || s === 'Y' || s === '1' || s === 'true' || v === true; }

  /**
   * @param line   open_lines 한 줄
   * @param rules  MesPlateRules 의 { RULES, FINISH } — 채울 값이 규칙에 있는지 검사한다(없으면 채우지 않는다)
   */
  function mapLine(line, rules) {
    var R = (rules && rules.RULES) || {}, FIN = (rules && rules.FINISH) || {};
    var out = { ok: false, fields: {}, filled: [], defaulted: [], notes: [] };
    if (!line) { out.notes.push('주문 라인이 없다'); return out; }
    if (!isStreetlight(line)) { out.notes.push('가로등배너 라인이 아니다 — ' + trim(line.item_name)); return out; }
    var F = out.fields;
    function fill(k, v) { F[k] = v; out.filled.push(k); }
    function dflt(k, v, why) { F[k] = v; out.defaulted.push({ key: k, why: why }); }

    // ── 규격(cm) — 주문 라인 width/height 가 cm 다
    var w = num(line.width), h = num(line.height);
    if (w > 0 && h > 0) { fill('specW', round1(w)); fill('specH', round1(h)); }
    else out.notes.push('규격이 없다(width/height) — 손으로 넣는다');

    // ── 벌 수 = 판매단위 조(스냅샷). unit 은 기본단위(EA)라 근거가 아니다.
    var sunit = trim(line.sales_unit), unit = trim(line.unit), factor = num(line.unit_factor);
    if (sunit === '조' || unit === '조') fill('vup', 2);
    else if (factor === 2) dflt('vup', 2, '판매단위 「' + (sunit || '없음') + '」의 환산이 2 라 2벌로 둔다');
    else dflt('vup', 1, '판매단위가 「' + (sunit || unit || '없음') + '」— 1벌로 둔다(1조=2벌이면 주문서 판매단위를 조로)');

    // ── 원단 — 품목코드 접두(TRB-PO 폰지 · TRB-ME 매쉬) 우선, 없으면 품목명
    var code = trim(line.item_code).toUpperCase(), nm = trim(line.item_name);
    var fabric = null;
    if (/^TRB-PO/.test(code) || nm.indexOf('폰지') >= 0) fabric = '폰지';
    else if (/^TRB-ME/.test(code) || nm.indexOf('매쉬') >= 0) fabric = '매쉬';
    if (fabric && R.fabric && R.fabric[fabric]) fill('fabric', fabric);
    else if (fabric) out.notes.push('원단 「' + fabric + '」이 패널 규칙에 없다');
    else out.notes.push('원단을 품목에서 못 읽었다(코드 ' + (code || '없음') + ')');

    // ── 변별 마감 → 봉재·면 수·마감(봉미싱)·봉미싱 cm
    var fin = parseJson(line.finishing) || {};
    var top = trim(fin.top), bottom = trim(fin.bottom), left = trim(fin.left), right = trim(fin.right);
    var seamMm = R.seamMm || {};
    var sideMethods = [left, right].filter(function (m) { return !!m; });
    if (left && right && left === right && typeof seamMm[left] === 'number') fill('seam', left);
    else if (left || right) out.notes.push('좌·우 봉재가 다르거나 규칙에 없다(좌 ' + (left || '없음') + ' · 우 ' + (right || '없음') + ') — 봉재는 손으로');
    else out.notes.push('좌·우 봉재가 없다 — 봉재는 손으로');

    if (F.seam) {
      // 3면 = 좌·우·하단(상단은 봉미싱). 하단이 같은 봉재면 3면, 아니면(하단 봉미싱 등) 2면.
      var sides = 2 + ((bottom === F.seam) ? 1 : 0);
      if (R.sewSides && R.sewSides[sides]) fill('sides', sides);
      if (top === F.seam) out.notes.push('상단이 「' + top + '」이다 — 가로등은 상단 봉미싱이 표준이라 마감을 확인한다');
    }

    var pps = parseJson(line.post_processing);
    if (!(pps && pps.length !== undefined)) pps = [];
    var nw = findPp(pps, 'PP-NONWOVEN', '부직포');
    var band = null;
    if (top === '봉미싱' && bottom === '봉미싱') band = 'topbottom';
    else if (top === '봉미싱') band = 'top';
    else if (nw) {
      var nwSize = num(nw.params && nw.params.size);
      var key = (nwSize != null) ? ('nonwoven' + Math.round(nwSize)) : null;
      if (key && FIN[key]) band = key;
      else out.notes.push('부직포 ' + (nwSize == null ? '(폭 없음)' : nwSize + 'cm') + ' 은 패널 마감 목록에 없다(7·10만)');
    }
    if (band && FIN[band]) fill('band', band);
    else if (!band) out.notes.push('마감을 정하지 못했다(상단 봉미싱도 부직포도 없다) — 마감은 손으로');

    if (band === 'top' || band === 'topbottom') {
      var cmTop = num(fin.top_cm), cmBot = num(fin.bottom_cm);
      if (cmTop > 0) fill('sewCm', cmTop);
      else if (cmBot > 0) fill('sewCm', cmBot);
      else dflt('sewCm', 5, '주문서에 봉미싱 cm 이 없어 5 로 둔다');
      if (band === 'topbottom' && cmTop > 0 && cmBot > 0 && cmTop !== cmBot) out.notes.push('상·하 봉미싱 cm 이 다르다(' + cmTop + '/' + cmBot + ') — 패널은 한 값만 쓴다(상단값)');
    }

    // ── 하도매 = PP-GROMMET {size, top, side} · 옛 {holes}
    var gr = findPp(pps, 'PP-GROMMET', '하도매');
    if (gr) {
      var gp = gr.params || {};
      var size = parseInt(String(gp.size || '').replace(/[^0-9]/g, ''), 10);
      var sizes = (R.hardware && R.hardware.sizes) || [];
      if (size > 0 && sizes.indexOf(size) >= 0) fill('hwSize', size);
      else if (size > 0) out.notes.push('하도매 ' + size + '호는 패널 규칙에 없다(' + sizes.join('/') + ')');
      var ht = num(gp.top), hs = num(gp.side);
      if (ht != null || hs != null) { fill('hwTop', Math.max(0, Math.round(ht || 0))); fill('hwSide', Math.max(0, Math.round(hs || 0))); }
      else {
        var holes = parseInt(String(gp.holes || '').replace(/[^0-9]/g, ''), 10);
        if (holes === 2) dflt('hwTop', 2, '옛 「2구」— 상단 2 로 둔다');
        else if (holes === 4) { dflt('hwTop', 2, '옛 「4구」— 상단 2·측면 3 으로 둔다'); dflt('hwSide', 3, '옛 「4구」— 상단 2·측면 3 으로 둔다'); }
        else if (holes > 0) out.notes.push('하도매 「' + holes + '구」는 상단/측면으로 못 나눈다 — 손으로');
        if (F.hwSide === undefined && F.hwTop !== undefined) F.hwSide = 0;
      }
    } else { dflt('hwTop', 0, '하도매 옵션 없음'); dflt('hwSide', 0, '하도매 옵션 없음'); }

    // ── 끈고리 = PP-LOOP {top, mid, bottom}
    var lp = findPp(pps, 'PP-LOOP', '끈고리');
    if (lp) {
      var q = lp.params || {};
      fill('loops', { top: yes(q.top), mid: yes(q.mid), bottom: yes(q.bottom) });
    } else dflt('loops', { top: true, mid: true, bottom: true }, '끈고리 옵션 없음 — 전부 켜 둔다');

    out.ok = true;
    return out;
  }

  var api = { CONFIG_PATH: CONFIG_PATH, isStreetlight: isStreetlight, label: label, mapLine: mapLine, parseJson: parseJson };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node 하네스
  root.MesTrOrder = api;                                                       // 패널
})(typeof window !== 'undefined' ? window : globalThis);
