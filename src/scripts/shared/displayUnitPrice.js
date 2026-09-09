// shared/displayUnitPrice.js — 라인 단가 **표기** 정본 (장당가 파생)
//
// 무엇을 푸는가:
//   AREA 품목의 `order_items.unit_price` 는 ㎡단가다. 이 값을 문서에 그대로 찍으면
//   `수량 × 단가 ≠ 금액` 이 되어 **받는 사람이 검산할 수 없다**.
//   실사례 E2-20260831-041 — 60×180cm · 30장 · 단가 2,778 · 공급가 150,000.
//   거래처도 디자이너도 30 × 2,778 = 83,340 으로 계산해 안 맞는다(계산은 정상이다:
//   청구면적 1.0m×1.8m ×30 = 54㎡ × 2,778 = 150,012 → 100원 반올림 150,000).
//   → 문서·목록의 단가는 금액에서 되나눈 **장당가**를 쓴다: `round(amount / quantity)`.
//
// 왜 `unit_price × 면적` 을 다시 곱하지 않고 amount 를 나누나:
//   ① 에누리(행 할인)가 있어도 실제 청구액과 항상 맞는다 — 검산 가능성이 목적이다.
//   ② 최소청구(1m)·10cm 올림·100원 반올림이 이미 amount 에 반영돼 있다.
//   ③ 이관·자동적재 라인의 unit_price 의미가 어긋나 있어도(2026-09-08 prod 실측 336건)
//      표기 축은 영향을 안 받는다 — 장당가는 금액 파생이라 늘 맞다.
//   prod 실측: AREA 16,158라인 중 **16,128건(99.8%)이 `장당가 × 수량 = 금액` 정확히 성립**,
//   100원 이상 어긋나는 라인 **0건**.
//
// ⚠️ 이건 **표시 전용**이다. 저장·계산 축(`unit_price` = ㎡단가)은 그대로 둔다 —
//    가격 결정이 ㎡ 축이라는 실측(거래처109 AQ-BANNER 는 600×90·700×90·710×70 이
//    전부 800원/㎡ 로 수렴)이 있고, 여기를 뒤집으면 **규격을 바꿔도 금액이 안 따라온다**.
//    금액 산식 정본 = `src/utils/orderLineAmount.ts` ↔ `src/scripts/orderForm/calc.js`.
//
// 표기 규칙(2026-09-09 용준님 확정 — 09-08 의 병기안을 대체한다):
//   **보이는 화면은 전부 개수(장당) 단가만** — 대외 문서·주문 상세 모두.
//   ㎡ 축은 **백그라운드에만** 남는다: `order_items.unit_price` + 과금 규칙 스냅샷(0600).
//   주문서 입력칸만 예외 — 영업이 ㎡단가로 값을 매기므로 입력은 ㎡ 유지하고, 필드 밑에
//   장당가 한 줄(`= 5,000원/EA`)을 띄운다. ★패널을 새로 만들지 않는다(화면이 지저분해진다).
//
// 게이트 = `npm run test:unit-price-display`
//
// ?raw 결합 스크립트라 전역이 한 스코프에 쏟아진다 — 같은 페이지에 두 번 실려도 죽지 않게 IIFE + 존재 가드.
(function() {
    if (window.MES_UP) return;

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    function has(v) {
        return v !== null && v !== undefined && v !== '';
    }

    /**
     * 장당(개당) 단가 — 표기 정본. `round(amount / quantity)`
     * 수량이 없거나 금액이 없으면 나눌 수 없으므로 저장된 unit_price 를 그대로 돌려준다.
     */
    function perUnit(line) {
        if (!line) return 0;
        var qty = num(line.quantity);
        if (qty > 0 && has(line.amount)) return Math.round(num(line.amount) / qty);
        return num(line.unit_price);
    }

    /** 면적 과금 라인인가 — 판정은 `pricing_method` 뿐이다(값으로 추측하면 에누리와 구분이 안 된다). */
    function isArea(line) {
        return !!line && String(line.pricing_method || '').toUpperCase() === 'AREA';
    }

    /** ㎡단가 = 저장된 unit_price. AREA 가 아니면 병기할 것이 없으므로 null. */
    function perSqm(line) {
        return isArea(line) ? num(line.unit_price) : null;
    }

    window.MES_UP = {
        perUnit: perUnit,
        // ★perSqm·isArea 는 **표시용이 아니다** — 화면은 개수 단가만 찍는다(아래 표기 규칙).
        //   저장된 ㎡단가를 읽어야 하는 진단·감사 코드를 위해 남긴다.
        perSqm: perSqm,
        isArea: isArea
    };
})();
