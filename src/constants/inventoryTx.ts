/**
 * 재고 증감내역(`inventory_transactions`) 표기 정본.
 *
 * 서버(CSV)·클라이언트(목록·모달)가 **같은 맵**을 쓰도록 여기 한 곳에서만 정의하고,
 * 클라이언트로는 `INVENTORY_TX_LABELS_JS` 를 페이지에 주입해 내려보낸다.
 * (사본을 만들면 유형이 늘 때 한쪽만 갱신돼 코드값이 그대로 노출된다)
 */

/** 거래 유형 — INSERT 하는 곳: routes/inventory.ts · utils/stockShip.ts · purchaseOrders/po-receive.ts · returns.ts · scan.ts · inventoryCount.ts */
export const TX_TYPE_LABELS: Record<string, string> = {
  IN: '입고',
  OUT: '출고',
  ADJUST: '조정',
  TRANSFER_IN: '이동입고',
  TRANSFER_OUT: '이동출고',
}

/** 참조 문서 유형 (`reference_type`) */
export const TX_REF_LABELS: Record<string, string> = {
  PURCHASE: '발주입고',
  RECEIPT_CANCEL: '입고취소',
  ORDER: '주문출고',
  RETURN: '반품',
  TRANSFER: '창고이동',
  ADJUSTMENT: '재고조정',
  STOCK_COUNT: '재고실사',
  SCAN: '스캔',
  AUTO_DEDUCT: '인쇄 자동차감',
  PP_DEDUCT: '후가공 자동차감',
  IN: '입고',
  OUT: '출고',
}

/** 조정 사유 (`reason`) — routes/inventory.ts adjustReason 옵션 + inventoryCount STOCK_COUNT */
export const TX_REASON_LABELS: Record<string, string> = {
  STOCK_COUNT: '실사 보정',
  COUNT_ERROR: '실사 차이',
  DAMAGE: '파손·불량',
  LOSS: '분실',
  FOUND: '추가 발견',
  OTHER: '기타',
}

/** 화면 색·아이콘 (Tailwind 클래스) — 유형 배지용 */
export const TX_TYPE_STYLES: Record<string, { cls: string; icon: string }> = {
  IN: { cls: 'bg-blue-50 text-blue-700', icon: 'fas fa-arrow-down' },
  OUT: { cls: 'bg-amber-50 text-amber-700', icon: 'fas fa-arrow-up' },
  ADJUST: { cls: 'bg-gray-100 text-gray-700', icon: 'fas fa-sliders-h' },
  TRANSFER_IN: { cls: 'bg-indigo-50 text-indigo-700', icon: 'fas fa-right-to-bracket' },
  TRANSFER_OUT: { cls: 'bg-purple-50 text-purple-700', icon: 'fas fa-right-from-bracket' },
}

/** 페이지에 주입할 클라이언트 스니펫 (?raw 스크립트에서 `window.INV_TX_LABELS` 로 참조) */
export const INVENTORY_TX_LABELS_JS = `
window.INV_TX_LABELS = {
  type: ${JSON.stringify(TX_TYPE_LABELS)},
  ref: ${JSON.stringify(TX_REF_LABELS)},
  reason: ${JSON.stringify(TX_REASON_LABELS)},
  style: ${JSON.stringify(TX_TYPE_STYLES)}
};
`
