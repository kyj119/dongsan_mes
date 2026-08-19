// shared/finishingLabel.js — 마감·후가공 표기 (클라 사본)
//
// ⚠️ 서버 정본 = src/utils/finishingLabel.ts. 규칙이 갈리면 "화면 표기 ≠ 체크리스트 라벨"이 된다.
//    한쪽만 고치지 말 것 (서버 게이트 = npm run test:finishing-label).
//
// 표기 규칙: 4변 동일 → `4방열재단` / 그 외 → `상하좌 열재단`·`좌우 줄미싱+상하 봉미싱`
//            펀칭 → `4개(상 2, 모서리 좌상·우상)`
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

    // 펀칭 params → `4개(상 2, 모서리 좌상·우상)` (PP 이름은 호출부가 붙임)
    function formatPunching(params) {
        var p = parseMaybeJson(params);
        if (!p || typeof p !== 'object') return '';
        var num = function(k) { return Math.max(0, Math.floor(Number(p[k]) || 0)); };
        var corners = PUNCH_CORNERS.map(function(e) { return { ko: e[1], n: num(e[0]) }; }).filter(function(x) { return x.n > 0; });
        var sides = PUNCH_SIDES.map(function(e) { return { ko: e[1], n: num(e[0]) }; }).filter(function(x) { return x.n > 0; });
        var total = corners.concat(sides).reduce(function(s, x) { return s + x.n; }, 0);
        if (total === 0) return '';
        var parts = [];
        var allCorners = corners.length === 4 && corners.every(function(c) { return c.n === 1; });
        if (allCorners) parts.push('4모서리');
        sides.forEach(function(s) { parts.push(s.ko + ' ' + s.n); });
        if (!allCorners && corners.length > 0) {
            parts.push('모서리 ' + corners.map(function(c) { return c.n === 1 ? c.ko : c.ko + ' ' + c.n; }).join('·'));
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
