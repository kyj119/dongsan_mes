// shared/finishingLabel.js — 마감·후가공 표기 (클라 사본)
//
// ⚠️ 서버 정본 = src/utils/finishingLabel.ts. 규칙이 갈리면 "화면 표기 ≠ 체크리스트 라벨"이 된다.
//    한쪽만 고치지 말 것 (서버 게이트 = npm run test:finishing-label).
//
// 표기 규칙: 4변 동일 → `4방열재단` / 그 외 → `상하좌 열재단`·`좌우 줄미싱+상하 봉미싱`
//            펀칭 → `8개(모서리 4, 4변 1)` — 총개수 → 모서리 → 변마다 **모서리 사이** 개수(실물 표기, 2026-09-11)
//
// ?raw 결합 스크립트라 전역이 한 스코프에 쏟아진다 — 같은 페이지에 두 번 실려도 죽지 않게 IIFE + 존재 가드.
(function() {
    if (window.MES_FIN) return;

    var DIR_ORDER = ['top', 'bottom', 'left', 'right'];
    var DIR_KO = { top: '상', bottom: '하', left: '좌', right: '우' };
    var PUNCH_CORNERS = [['corner_tl', '좌상'], ['corner_tr', '우상'], ['corner_bl', '좌하'], ['corner_br', '우하']];
    var PUNCH_SIDES = [['side_top', '상'], ['side_bottom', '하'], ['side_left', '좌'], ['side_right', '우']];

    function parseMaybeJson(v) {
        if (typeof v !== 'string') return v;
        if (!v.trim()) return null;
        try { return JSON.parse(v); } catch (e) { return null; }
    }

    function sideRank(dirs) {
        for (var i = 0; i < dirs.length; i++) if (dirs[i] === 'left' || dirs[i] === 'right') return 0;
        return 1;
    }

    // 마감 4변 → `4방열재단` · `좌우 줄미싱+상하 봉미싱`
    function formatFinishing(fin) {
        var f = parseMaybeJson(fin);
        if (!f || typeof f !== 'object') return '';
        var order = [], groups = {};
        DIR_ORDER.forEach(function(d) {
            var m = f[d];
            if (m && typeof m === 'string') {
                if (!groups[m]) { groups[m] = []; order.push(m); }
                groups[m].push(d);
            }
        });
        if (order.length === 0) return '';
        if (order.length === 1 && groups[order[0]].length === 4) return '4방' + order[0];
        // 좌우 축을 먼저 적는 현장 표기. 방향 문자 자체는 상하좌우 순.
        order.sort(function(a, b) { return sideRank(groups[a]) - sideRank(groups[b]); });
        return order.map(function(m) {
            return groups[m].map(function(d) { return DIR_KO[d]; }).join('') + ' ' + m;
        }).join('+');
    }

    // 펀칭 params → 실물 표기 `8개(모서리 4, 4변 1)` (PP 이름은 호출부가 붙임)
    //   ★개수 규칙 = 호스트·에이전트와 같다(2026-09-11): 변 N 은 **양 끝 포함** 균등 분배 → N≥2 면 양 끝이
    //     모서리 자리, N=1 이면 가운데 1개. 모서리 체크와 겹치면 하나. 상3·하3·좌3·우3 = 12 가 아니라 **8**.
    //   표기 = 총개수 → 모서리 → 변마다 「모서리 사이」 개수(같은 값은 상하·좌우·4변으로 묶음).
    //   ★잃는 것: 「모서리 따로 + 변 안쪽 N」 옛 해석(side_top=2 가 안쪽 2개) — 이제 양 끝 2개다.
    //   ⚠️ 패널 main.js punchLabel 이 같은 문장을 만든다 — 게이트 panel:smoke 7f 가 대조.
    function formatPunching(params) {
        var p = parseMaybeJson(params);
        if (!p || typeof p !== 'object') return '';
        var num = function(k) { return Math.max(0, Math.floor(Number(p[k]) || 0)); };
        var t = num('side_top'), b = num('side_bottom'), l = num('side_left'), r = num('side_right');
        var corners = [
            ['좌상', num('corner_tl') > 0 || t >= 2 || l >= 2],
            ['우상', num('corner_tr') > 0 || t >= 2 || r >= 2],
            ['좌하', num('corner_bl') > 0 || b >= 2 || l >= 2],
            ['우하', num('corner_br') > 0 || b >= 2 || r >= 2]
        ];
        var inner = function(n) { return n >= 2 ? n - 2 : n; };   // 모서리 사이 개수
        var it = inner(t), ib = inner(b), il = inner(l), ir = inner(r);
        var cornerNames = corners.filter(function(c) { return c[1]; }).map(function(c) { return c[0]; });
        var total = cornerNames.length + it + ib + il + ir;
        if (total === 0) return '';
        var parts = [];
        if (cornerNames.length === 4) parts.push('모서리 4');
        else if (cornerNames.length > 0) parts.push('모서리 ' + cornerNames.join('·'));
        if (it > 0 && it === ib && it === il && it === ir) parts.push('4변 ' + it);
        else {
            if (it > 0 && it === ib) parts.push('상하 ' + it);
            else { if (it > 0) parts.push('상 ' + it); if (ib > 0) parts.push('하 ' + ib); }
            if (il > 0 && il === ir) parts.push('좌우 ' + il);
            else { if (il > 0) parts.push('좌 ' + il); if (ir > 0) parts.push('우 ' + ir); }
        }
        return total + '개(' + parts.join(', ') + ')';
    }

    function isPunchParams(params) {
        return PUNCH_CORNERS.concat(PUNCH_SIDES).some(function(e) { return e[0] in params; });
    }

    function formatParams(params, name) {
        var out = [];
        Object.keys(params).forEach(function(k) {
            var v = params[k];
            if (v == null) return;
            if (k.indexOf('margin_') === 0) return;      // 여백 = 규격에 반영됨
            if (Array.isArray(v)) {
                var s = v.map(function(x) { return DIR_KO[String(x)] || String(x); }).filter(Boolean).join('');
                if (s) out.push(s);
                return;
            }
            if (typeof v === 'object') {
                // 마감 후가공 params.directions — 예전엔 `열재단 [object Object]` 가 찍혔다
                var dirs = DIR_ORDER.filter(function(d) { return Object.prototype.hasOwnProperty.call(v, d); });
                if (dirs.length === 4) out.push('4방');
                else if (dirs.length > 0) out.push(dirs.map(function(d) { return DIR_KO[d]; }).join(''));
                return;
            }
            var sv = String(v).trim();
            if (!sv || sv === '없음' || sv === name) return;
            out.push(/^\d+(\.\d+)?$/.test(sv) ? sv + 'cm' : sv);
        });
        return out.join(' ');
    }

    // 후가공 1건 → `펀칭 4개(상 2, 모서리 좌상·우상)` · `부직포 7cm`
    function formatPP(pp) {
        if (!pp) return '';
        if (typeof pp === 'string') return pp;
        var name = String(pp.name || pp.code || '').trim();
        if (!name) return '';
        var params = (pp.params && typeof pp.params === 'object') ? pp.params : null;
        if (!params) return name;
        if (String(pp.code || '') === 'PUNCHING' || name === '펀칭' || isPunchParams(params)) {
            var t = formatPunching(params);
            return t ? name + ' ' + t : name;
        }
        var detail = formatParams(params, name);
        return detail ? name + ' ' + detail : name;
    }

    // 후가공 배열(JSON 문자열 허용) → `펀칭 4개(상 2), 부직포 7cm`
    function formatPPList(list, sep) {
        var arr = parseMaybeJson(list);
        if (!Array.isArray(arr)) return '';
        return arr.map(formatPP).filter(Boolean).join(sep || ', ');
    }

    window.MES_FIN = {
        finishing: formatFinishing,
        punching: formatPunching,
        pp: formatPP,
        ppList: formatPPList
    };
})();
