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

// 상태 → 시맨틱 톤 SSOT (mes-ui-consistency 5색: blue/green/amber/red/gray)
// ⚠️ 상태 색은 여기에서만 정의한다. 페이지별 statusColors/getStatusColor 리터럴 금지.
export const ORDER_STATUS_TONES: Record<string, string> = {
  DRAFT: 'gray',
  QUOTATION: 'amber',
  CONFIRMED: 'blue',
  PRINTING: 'blue',
  PRINT_DONE: 'green',
  SHIPPED: 'green',
  COMPLETED: 'green',
  HOLD: 'amber',
  CANCELLED: 'red',
}

export const CARD_STATUS_TONES: Record<string, string> = {
  PRINT_PENDING: 'amber',
  PRINTING: 'blue',
  PRINT_DONE: 'green',
  HOLD: 'amber',
  SHIPPED: 'green',
  RIP_WAITING: 'amber',
  PRINT_ERROR: 'amber',
}

// 상태 → FA 아이콘 SSOT (뱃지 3요소: 아이콘+텍스트+색상, WCAG 1.4.1)
export const ORDER_STATUS_ICONS: Record<string, string> = {
  DRAFT: 'far fa-clock',
  QUOTATION: 'far fa-clock',
  CONFIRMED: 'fas fa-check',
  PRINTING: 'fas fa-spinner',
  PRINT_DONE: 'fas fa-check-circle',
  SHIPPED: 'fas fa-box',
  COMPLETED: 'fas fa-check-circle',
  HOLD: 'fas fa-pause',
  CANCELLED: 'fas fa-times-circle',
}

export const CARD_STATUS_ICONS: Record<string, string> = {
  PRINT_PENDING: 'far fa-clock',
  PRINTING: 'fas fa-spinner',
  PRINT_DONE: 'fas fa-check-circle',
  HOLD: 'fas fa-pause',
  SHIPPED: 'fas fa-box',
  RIP_WAITING: 'far fa-clock',
  PRINT_ERROR: 'fas fa-exclamation-triangle',
}

// 클라이언트 전역 주입용 스크립트 — layout.ts / portalLayout.ts 양쪽에서 주입.
// window.MES_STATUS.cardLabel(s) / orderLabel(s) / cardLabels / orderLabels
//   + tone/badgeClass/textClass/badge (상태색·아이콘 SSOT — 페이지별 색 맵 재정의 금지)
// window.dsStatusBadge('order'|'card', status) → 완성 뱃지 HTML
export const STATUS_LABELS_JS = `
window.MES_STATUS = (function(){
  var card = ${JSON.stringify(CARD_STATUS_LABELS)};
  var order = ${JSON.stringify(ORDER_STATUS_LABELS)};
  var cardTones = ${JSON.stringify(CARD_STATUS_TONES)};
  var orderTones = ${JSON.stringify(ORDER_STATUS_TONES)};
  var cardIcons = ${JSON.stringify(CARD_STATUS_ICONS)};
  var orderIcons = ${JSON.stringify(ORDER_STATUS_ICONS)};
  // 톤 → 표현 클래스 (ds-badge 팔레트 / 텍스트 컬러). 표현 규칙 변경은 여기 한 곳만.
  var toneBadge = { blue: 'ds-badge-blue', green: 'ds-badge-green', amber: 'ds-badge-yellow', red: 'ds-badge-red', gray: 'ds-badge-gray' };
  var toneText = { blue: 'text-blue-600', green: 'text-green-600', amber: 'text-amber-600', red: 'text-red-500', gray: 'text-gray-500' };
  function pick(kind) { return kind === 'card' ? { l: card, t: cardTones, i: cardIcons } : { l: order, t: orderTones, i: orderIcons }; }
  var api = {
    cardLabels: card,
    orderLabels: order,
    cardLabel: function(s){ return card[s] || s; },
    orderLabel: function(s){ return order[s] || s; },
    tone: function(kind, s){ return pick(kind).t[s] || 'gray'; },
    icon: function(kind, s){ return pick(kind).i[s] || 'fas fa-circle'; },
    badgeClass: function(kind, s){ return 'ds-badge ' + (toneBadge[api.tone(kind, s)] || 'ds-badge-gray'); },
    textClass: function(kind, s){ return toneText[api.tone(kind, s)] || 'text-gray-500'; },
    badge: function(kind, s){
      var p = pick(kind);
      return '<span class="' + api.badgeClass(kind, s) + '"><i class="' + api.icon(kind, s) + ' text-[9px] mr-1"></i>' + (p.l[s] || s) + '</span>';
    }
  };
  return api;
})();
window.dsStatusBadge = window.MES_STATUS.badge;
`
