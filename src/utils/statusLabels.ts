// 카드/주문 상태 라벨 단일 소스 (Status Model Unification, 2026-06-05)
// 표준 모델: docs/superpowers/specs/2026-06-05-status-model-unification.md
// ⚠️ 상태 라벨은 여기에서만 정의한다. 페이지/스크립트별 statusLabels 리터럴 금지.
//    클라이언트는 layout/portalLayout 주입으로 window.MES_STATUS 사용.

// cards.status (생산 단계, 단일 축)
export const CARD_STATUS_LABELS: Record<string, string> = {
  PRINT_PENDING: '출력대기',
  PRINTING: '출력중',
  PRINT_DONE: '출력완료',
  HOLD: '보류',
  SHIPPED: '출고완료',
  // 폐기값 호환 (과거 이력 표시 전용 — 신규 진입 금지)
  RIP_WAITING: '출력대기',
  PRINT_ERROR: '출력대기',
}

// orders.status
export const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: '임시',
  QUOTATION: '견적',
  CONFIRMED: '확정',
  PRINTING: '출력중',
  PRINT_DONE: '출력완료',
  SHIPPED: '출고완료',
  COMPLETED: '배송완료',
  HOLD: '보류',
  CANCELLED: '취소',
}

// 클라이언트 전역 주입용 스크립트 — layout.ts / portalLayout.ts 양쪽에서 주입.
// window.MES_STATUS.cardLabel(s) / orderLabel(s) / cardLabels / orderLabels
export const STATUS_LABELS_JS = `
window.MES_STATUS = (function(){
  var card = ${JSON.stringify(CARD_STATUS_LABELS)};
  var order = ${JSON.stringify(ORDER_STATUS_LABELS)};
  return {
    cardLabels: card,
    orderLabels: order,
    cardLabel: function(s){ return card[s] || s; },
    orderLabel: function(s){ return order[s] || s; }
  };
})();
`
