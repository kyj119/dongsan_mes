// ── 판매단위 표기 정본 (0620 단위표, 2026-09-17) ─────────────────────────────
// 라인에 판매단위 스냅샷(sales_unit·sales_qty)이 있으면 「10조(20EA)」, 없으면 「20 EA」.
// 주문 상세·카드 상세·거래명세서·견적서가 전부 이 한 함수를 쓴다 — 표기가 갈리면 여기만 고친다.
//
// ★shell.js 에서 분리(2026-09-26): 거래명세서·견적서는 renderPage 를 안 쓰는 독립 HTML 이라 shell.js 가
//   안 실린다. 그래서 두 문서는 `window.salesQtyLabel ? … : 원시수량` 폴백으로 **늘 원시 수량**을 찍고 있었다
//   (거래처에 나가는 문서만 「10조(20EA)」가 아니라 「20」). 레이아웃과 두 문서가 이 파일을 함께 싣는다.
function salesQtyLabel(line) {
    var q = Number(line && line.quantity) || 0;
    var u = (line && line.unit) || 'EA';
    var su = line && line.sales_unit;
    var sq = Number(line && line.sales_qty) || 0;
    if (su && sq > 0) return sq + su + '(' + q + u + ')';
    return q + ' ' + u;
}
window.salesQtyLabel = salesQtyLabel;
