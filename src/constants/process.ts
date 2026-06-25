// 장비 공정(인쇄방식) 단일 소스(SSOT) — 2026-06-26 (공장 배치도 P0)
// ⚠️ 공정 코드/라벨/색상은 여기서만 정의한다. 페이지/스크립트별 리터럴 금지.
//    정본 = 신모델 품목분류(items.category)와 1:1 (사용자 확정 2026-06-26).
//    print_methods 테이블은 폐기(0335) — 부활시키지 않는다.
//    - TS 페이지: processOptions()/processCheckboxes() 로 폼 렌더
//    - 클라 JS: layout.ts 가 PROCESS_ENUMS_JS 주입 → window.PROCESS_NAMES/PROCESS_COLORS/PROCESS_LIST/PROCESS_PREFIX_HINTS
//    (hr.ts 의 HR_ENUMS_JS, statusLabels.ts 의 STATUS_LABELS_JS 와 동일 패턴)

export interface ProcessDef {
  code: string
  label: string
  color: string
  category: string // 대응하는 items.category (재고 집계 SSOT, P3)
}

// equipment_processes.process_code 의 유효값.
// 순서 = 배지/필터 노출 순서. 라벨·category 모두 신모델 items.category 와 동일.
export const PROCESSES: ProcessDef[] = [
  { code: 'AQUEOUS', label: '수성', color: '#06B6D4', category: '수성' },
  { code: 'SOLVENT', label: '솔벤', color: '#3B82F6', category: '솔벤' },
  { code: 'UV', label: 'UV', color: '#8B5CF6', category: 'UV' },
  { code: 'TRANSFER', label: '전사', color: '#F97316', category: '전사' },
  { code: 'SUBLIMATION', label: '태극기', color: '#EF4444', category: '태극기' },
  { code: 'SIGN', label: '간판', color: '#10B981', category: '간판' },
]

export const PROCESS_CODES = PROCESSES.map((p) => p.code)

function toMap<T>(pick: (p: ProcessDef) => T): Record<string, T> {
  const m: Record<string, T> = {}
  for (const p of PROCESSES) m[p.code] = pick(p)
  return m
}

export const PROCESS_LABELS = toMap((p) => p.label)
export const PROCESS_COLORS = toMap((p) => p.color)
/** process_code → items.category (재고 집계용 SSOT 매핑, P3에서 사용) */
export const PROCESS_CATEGORY = toMap((p) => p.category)

/** 장비 ID 접두사 → 추천 공정 코드. 확신 가능한 것만(나머지는 사용자가 직접 지정). */
export const PROCESS_PREFIX_HINTS: Record<string, string> = {
  EPSON: 'SOLVENT',   // EPSON SC-S 시리즈 = 에코솔벤트
  FLEXI: 'TRANSFER',  // KM 전사 1~4 = 전사
}

/** id 접두사로 추천 공정 코드 반환(없으면 null). 예: 'FLEXI-03' → 'TRANSFER' */
export function recommendProcessByPrefix(equipmentId: string): string | null {
  if (!equipmentId) return null
  const head = equipmentId.toUpperCase().split(/[-_\s]/)[0]
  return PROCESS_PREFIX_HINTS[head] || null
}

/** <option> HTML (단일 선택용; 필요 시). */
export function processOptions(opts: { selected?: string; lead?: string } = {}): string {
  let html = ''
  if (opts.lead != null) html += `<option value="">${opts.lead}</option>`
  for (const p of PROCESSES) {
    const sel = opts.selected === p.code ? ' selected' : ''
    html += `<option value="${p.code}"${sel}>${p.label}</option>`
  }
  return html
}

// 클라이언트 전역 주입 스크립트 — layout.ts 에서 1회 주입.
export const PROCESS_ENUMS_JS = `
window.PROCESS_NAMES = ${JSON.stringify(PROCESS_LABELS)};
window.PROCESS_COLORS = ${JSON.stringify(PROCESS_COLORS)};
window.PROCESS_LIST = ${JSON.stringify(PROCESSES.map((p) => ({ code: p.code, label: p.label, color: p.color })))};
window.PROCESS_PREFIX_HINTS = ${JSON.stringify(PROCESS_PREFIX_HINTS)};
`
