// 다중단위(multi-UOM) 변환 — items.unit(관리) ↔ base_unit(차감/저장) × pack_size.
// spec: docs/archive/superpowers/specs/2026-06-27-multi-uom-inventory.md (MU1, 정본=2026-06-27-inventory-redesign-unified.md)
//
// ── 모델 ──
//   unit       관리(재고)단위. 통 / 롤 / 박스 / EA / yd ...
//   base_unit  차감·저장 정밀단위(L/cm/EA/yd). NULL = unit과 동일(단일단위·현행).
//   pack_size  1 unit = pack_size base_unit (1통=20L). NULL/0 = 1.
//   stock_mode PACK(미개봉 포장 개수, 개봉=전부소모) | CONTINUOUS(연속 base).
//
//   ⚠️ inventory.quantity 는 항상 base_unit 단위로 저장된다.
//      base_unit/pack_size 미설정 품목은 quantity=관리단위(현행과 동일).

export interface UomItem {
  unit?: string | null
  base_unit?: string | null
  pack_size?: number | null
  stock_mode?: string | null
}

/** pack_size 안전값(>0, 기본 1). */
export function packSize(item: UomItem): number {
  return item && item.pack_size && item.pack_size > 0 ? item.pack_size : 1
}

/** 다중단위 품목 여부 (base_unit이 unit과 다르고 pack_size 유효). */
export function isMultiUom(item: UomItem): boolean {
  return !!(item && item.base_unit && item.base_unit !== item.unit && item.pack_size && item.pack_size > 0)
}

/**
 * 환산 계수 — **쓰기 경로(입고·출고·취소)는 전부 이걸 쓴다.**
 *
 * ★왜 생겼나 (2026-08-27 전수조사): `packSize()` 는 `pack_size` 만 본다. 그런데 `pack_size` 가
 *   있다고 환산 대상인 게 아니다 — 두 단위가 실제로 **다를 때만**(= `isMultiUom`) 환산한다.
 *     · 시트류  unit=롤 · base_unit=M  · pack 50  → 1롤 입고 = 재고 +50M   (환산 O)
 *     · 현수막  unit=yd · base_unit=없음 · pack 130 → 발주도 재고도 yd     (환산 X)
 *       AQ* 의 130 은 **실사 입력 편의 계수**(1롤≈130yd)이지 환산계수가 아니다(마이그 0540).
 *
 *   이 파일은 표시(`formatStock`)에만 `isMultiUom` 가드를 걸어 뒀고, 정작 **쓰기 경로 5곳이
 *   `packSize` 를 손으로 복사**해 갔다(발주입고·수기입고·입고취소·스캔입고·스캔출고).
 *   그래서 현수막 원단을 MES 로 입고하면 재고가 **130배**가 된다. 활성 품목 49건 노출.
 *   아직 안 터진 이유는 prod 입고가 사실상 0건이었기 때문이다
 *   (inventory_receipts 0행 · inventory_transactions IN 1행) — 과거 손상은 없고,
 *   **입고 기능을 실제로 쓰기 시작하는 순간** 터지는 종류였다.
 *
 * ⚠️ 입고(정방향)와 출고·취소(역방향)는 반드시 같은 계수를 써야 한다. 한쪽만 환산하면
 *    번갈아 처리한 것만으로 재고가 pack_size 배씩 어긋난다.
 *
 * 게이트 = `npm run test:stock-valuation` (규칙 실행 + 쓰기 경로 소스 검사).
 */
export function packFactor(item: UomItem | null | undefined): number {
  return item && isMultiUom(item) ? packSize(item) : 1
}

/** 관리단위 수량 → base_unit 수량. (예: 3통 × 20 = 60 L) */
export function toBase(unitQty: number, item: UomItem): number {
  return (Number(unitQty) || 0) * packFactor(item)
}

/** base_unit 수량 → 관리단위 수량. (예: 60 L / 20 = 3통) */
export function fromBase(baseQty: number, item: UomItem): number {
  return (Number(baseQty) || 0) / packFactor(item)
}

function round2(n: number): number {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100
}

/**
 * 재고(base_unit 저장값) 표시 문자열.
 *  - 단일단위(현행): "X unit"
 *  - PACK: "3통 (60L)"  (관리단위 우선 + base 병기)
 *  - CONTINUOUS: "14800cm (2.96롤)"  (base 우선 + 관리단위 환산 병기)
 */
export function formatStock(baseQty: number, item: UomItem): string {
  const unit = (item && item.unit) || ''
  if (!isMultiUom(item)) {
    return `${round2(baseQty)}${unit ? ' ' + unit : ''}`
  }
  const base = item.base_unit as string
  const inUnit = round2(fromBase(baseQty, item))
  if (item.stock_mode === 'PACK') {
    return `${inUnit}${unit} (${round2(baseQty)}${base})`
  }
  return `${round2(baseQty)}${base} (${inUnit}${unit})`
}

// 클라이언트 전역 주입 스크립트 — layout.ts 에서 1회 주입(UNITS_JS 패턴).
// window.uomFormatStock(baseQty, item) / window.uomToBase / window.uomFromBase
export const UOM_JS = `
window.uomPackSize = function(it){ return it && it.pack_size > 0 ? it.pack_size : 1; };
window.uomIsMulti = function(it){ return !!(it && it.base_unit && it.base_unit !== it.unit && it.pack_size > 0); };
window.uomPackFactor = function(it){ return window.uomIsMulti(it) ? window.uomPackSize(it) : 1; };
window.uomToBase = function(q, it){ return (Number(q)||0) * window.uomPackFactor(it); };
window.uomFromBase = function(q, it){ return (Number(q)||0) / window.uomPackFactor(it); };
window.uomFormatStock = function(baseQty, it){
  var unit = (it && it.unit) || '';
  var r2 = function(n){ return Math.round(((Number(n)||0))*100)/100; };
  if (!window.uomIsMulti(it)) return r2(baseQty) + (unit ? ' ' + unit : '');
  var base = it.base_unit;
  var inUnit = r2(window.uomFromBase(baseQty, it));
  if (it.stock_mode === 'PACK') return inUnit + unit + ' (' + r2(baseQty) + base + ')';
  return r2(baseQty) + base + ' (' + inUnit + unit + ')';
};
`
