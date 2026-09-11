// 흰 테두리 진단 v2 — 조각 **안쪽까지** 들어가서 7mm 띠의 정체를 찾는다.
// 실행: 일러스트레이터 ▸ 파일 ▸ 스크립트 ▸ 기타 스크립트… ▸ 이 파일
// ⚠️ 문서를 하나도 바꾸지 않는다(읽기만 한다).
//
// v1 이 알아낸 것 (2026-09-10 실측)
//   아트 그룹 1020x320mm @10,1770 · 래스터 1006x306mm @17,1777
//   → **도련 래스터가 아트보다 7mm 작고 안쪽**이다. 도련은 바깥으로 나가야 하므로 뒤집혀 있다.
//   → 아트 바깥 7mm 띠를 칠하는 것은 도련이 아니라 **그룹 안의 무언가**다. 그것을 찾는다.
//
// v1 의 한계 — 깊이 2 에서 멈춰 `kids=5` 안을 못 봤다. 클리핑 그룹 안에 흰 배경 사각이 있으면
//   거기 있다(클립 그룹의 bbox 는 클립 모양이라, 안에 큰 흰 사각이 있어도 겉에서는 안 보인다).

var MM = 2.83464567;
var L = [];
var whites = 0, clips = 0, scanned = 0;

function A(s) { return String(s).replace(/[^\x20-\x7E]/g, '?'); }
function mm(v) { return Math.round((v / MM) * 10) / 10; }
function box(it) {
    try {
        var b = it.geometricBounds;
        return mm(b[2] - b[0]) + 'x' + mm(b[1] - b[3]) + '@' + mm(b[0]) + ',' + mm(b[3]);
    } catch (e) { return '?'; }
}

function fillOf(it) {
    try {
        if (!it.filled) return '';
        var c = it.fillColor, t = c.typename;
        if (t === 'CMYKColor') return 'C' + Math.round(c.cyan) + 'M' + Math.round(c.magenta)
            + 'Y' + Math.round(c.yellow) + 'K' + Math.round(c.black);
        if (t === 'RGBColor') return 'R' + Math.round(c.red) + 'G' + Math.round(c.green) + 'B' + Math.round(c.blue);
        if (t === 'GrayColor') return 'Gray' + Math.round(c.gray);
        return A(t);
    } catch (e) { return '?'; }
}

function isWhite(it) {
    try {
        if (!it.filled) return false;
        var c = it.fillColor, t = c.typename;
        if (t === 'CMYKColor') return (c.cyan + c.magenta + c.yellow + c.black) < 2;
        if (t === 'RGBColor') return (c.red > 248 && c.green > 248 && c.blue > 248);
        if (t === 'GrayColor') return c.gray < 2;
    } catch (e) { /* ignore: 진단 프로브 — 색을 못 읽는 개체는 흰 링 후보에서 뺀다 */ }
    return false;
}

function walk(items, depth, path) {
    var pad = '';
    for (var p = 0; p < depth; p++) pad += '  ';
    for (var i = 0; i < items.length && scanned < 6000; i++) {
        var it = items[i], t;
        scanned++;
        try { t = it.typename; } catch (e0) { continue; }

        var mark = '';
        var clipped = false;
        try { clipped = !!it.clipping; } catch (e1) { /* ignore: 진단 프로브 — 개체 종류에 따라 없는 속성 */ }
        if (clipped) { clips++; mark += ' [클립패스]'; }
        if (isWhite(it)) { whites++; mark += ' ★흰색'; }
        var f = fillOf(it);

        if (depth <= 3) {
            L.push(pad + path + i + ' ' + t + ' ' + box(it) + (f ? (' ' + f) : '') + mark);
        }

        if (t === 'GroupItem' || t === 'CompoundPathItem') {
            var kids = null;
            try { kids = it.pageItems; } catch (e2) { kids = null; }
            if (!kids) { try { kids = it.pathItems; } catch (e3) { kids = null; } }
            if (kids && depth < 5) walk(kids, depth + 1, path + i + '.');
        }
    }
}

try {
    if (app.documents.length === 0) { alert('열린 문서가 없습니다.'); }
    else {
        var d = app.activeDocument;
        var ab = d.artboards[0].artboardRect;
        L.push('문서 ' + A(d.name) + '   아트보드 ' + mm(ab[2] - ab[0]) + 'x' + mm(ab[1] - ab[3]) + 'mm');
        L.push('※ 크기 표기 = 폭x높이@왼쪽,아래  (mm)');
        L.push('');
        for (var li = 0; li < d.layers.length; li++) {
            var lay = d.layers[li];
            L.push('[레이어 ' + li + '] "' + A(lay.name) + '" 개체 ' + lay.pageItems.length
                + (lay.visible ? '' : ' (숨김)'));
            walk(lay.pageItems, 0, li + ':');
            L.push('');
        }
        L.push('── 요약 ──');
        L.push('흰색 면 ' + whites + '개 · 클립패스 ' + clips + '개 · 훑은 개체 ' + scanned + '개');
        L.push('');
        if (whites > 0) {
            L.push('→ 흰색 면이 **그룹 안**에 있습니다. 위 목록에서 ★흰색 줄의 크기를 보세요:');
            L.push('   아트 바깥까지 덮는 크기면 그것이 흰 테두리의 정체입니다.');
        } else {
            L.push('→ 어느 깊이에도 흰색 벡터 면이 없습니다.');
            L.push('   그렇다면 흰 띠는 **래스터 픽셀**이거나 클립 밖 여백입니다.');
        }
        alert(L.join('\n'));
    }
} catch (eTop) {
    alert('진단 실패: ' + eTop);
}
