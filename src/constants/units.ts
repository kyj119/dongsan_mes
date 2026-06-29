// 품목 단위(items.unit) 단일 소스(SSOT) — 2026-06-26
// ⚠️ 단위 code/label은 여기서만 정의한다. 페이지/스크립트별 리터럴 <option> 금지.
//    - TS 페이지: unitOptions({selected}) 로 <select> 옵션 렌더
//    - 클라 JS: layout.ts 가 UNITS_JS 주입 → window.UNIT_DEFS / window.UNIT_NAMES 사용
//    (hr.ts 의 HR_ENUMS_JS, statusLabels.ts 의 STATUS_LABELS_JS 와 동일 패턴)
//
// ⚠️ code = items.unit 에 저장되는 값. 'yd'(자동차감 ROLL)·'장'(자동차감 BOARD)은
//    src/utils/autoDeductInventory.ts 가 리터럴로 비교하므로 절대 변경 금지.

export interface UnitDef { code: string; label: string }

// items.unit 표준 단위. 잉크=L, 시트/원단=yd, 판재=장, 부속/완제품=EA.
export const UNITS: UnitDef[] = [
  { code: 'EA', label: '개' },
  { code: '롤', label: '롤' },
  { code: 'yd', label: '야드' },   // ⚠️ 자동차감 ROLL — 변경 금지
  { code: '장', label: '장' },     // ⚠️ 자동차감 BOARD — 변경 금지
  { code: 'M', label: '미터' },
  { code: 'L', label: '리터' },    // 잉크 등 액체(차감 base 단위)
  { code: '통', label: '통' },     // 잉크 관리단위(미개봉 통, pack_size=통용량 L)
  { code: 'BOX', label: '박스' },
  { code: 'cm', label: '센티미터' }, // 시트류 차감 base 단위
]

function toLabelMap(items: UnitDef[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const it of items) m[it.code] = it.label
  return m
}

export const UNIT_LABELS = toLabelMap(UNITS)

// <select> 옵션 HTML 생성. selected 값과 일치하는 항목에 selected 부여.
// 표준 목록에 없는 기존 값(레거시)이 selected 로 들어오면 맨 앞에 보존 옵션 추가.
export function unitOptions(opts: { selected?: string } = {}): string {
  let html = ''
  const known = UNITS.some((u) => u.code === opts.selected)
  if (opts.selected && !known) {
    html += `<option value="${opts.selected}" selected>${opts.selected}</option>`
  }
  for (const u of UNITS) {
    const sel = opts.selected === u.code ? ' selected' : ''
    html += `<option value="${u.code}"${sel}>${u.label} (${u.code})</option>`
  }
  return html
}

// 클라이언트 전역 주입 스크립트 — layout.ts 에서 1회 주입.
// window.UNIT_DEFS (배열), window.UNIT_NAMES (code→label 맵)
export const UNITS_JS = `
window.UNIT_DEFS = ${JSON.stringify(UNITS)};
window.UNIT_NAMES = ${JSON.stringify(UNIT_LABELS)};
`
