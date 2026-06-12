// 인사 공통 코드(부서/직급/고용형태) 단일 소스(SSOT) — 2026-06-12
// ⚠️ 부서·직급·고용형태 코드/라벨은 여기서만 정의한다. 페이지/스크립트별 리터럴 금지.
//    - TS 페이지: deptOptions()/positionOptions()/employmentTypeOptions() 로 <option> 렌더
//    - 클라 JS: layout.ts 가 HR_ENUMS_JS 주입 → window.DEPT_NAMES/POSITION_NAMES/EMPLOYMENT_NAMES 사용
//    (statusLabels.ts 의 STATUS_LABELS_JS 와 동일 패턴)

export interface CodeLabel { code: string; label: string }

// employees.department
export const DEPARTMENTS: CodeLabel[] = [
  { code: 'ADMIN_DEPT', label: '사무직' },
  { code: 'DESIGN', label: '디자인' },
  { code: 'SALES', label: '영업' },
  { code: 'TRANSFER', label: '전사' },
  { code: 'SIGN', label: '간판' },
  { code: 'PRINTING', label: '출력' },
  { code: 'PRODUCTION', label: '생산직' },
  { code: 'EXECUTIVE', label: '임원' },
]

// employees.position
export const POSITIONS: CodeLabel[] = [
  { code: 'STAFF', label: '사원' },
  { code: 'SENIOR_STAFF', label: '주임' },
  { code: 'ASSISTANT_MANAGER', label: '대리' },
  { code: 'MANAGER', label: '과장' },
  { code: 'DEPUTY_GENERAL_MANAGER', label: '차장' },
  { code: 'GENERAL_MANAGER', label: '부장' },
  { code: 'DIRECTOR', label: '이사' },
  { code: 'CEO', label: '대표이사' },
]

// employees.employment_type
export const EMPLOYMENT_TYPES: CodeLabel[] = [
  { code: 'FULL_TIME', label: '정규직' },
  { code: 'CONTRACT', label: '계약직' },
  { code: 'PART_TIME', label: '시간제' },
]

function toLabelMap(items: CodeLabel[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const it of items) m[it.code] = it.label
  return m
}

export const DEPARTMENT_LABELS = toLabelMap(DEPARTMENTS)
export const POSITION_LABELS = toLabelMap(POSITIONS)
export const EMPLOYMENT_LABELS = toLabelMap(EMPLOYMENT_TYPES)

// <option> HTML 생성. lead 지정 시 맨 위 value="" 옵션 추가('전체 부서'·'선택'·'-' 등).
function optionsHTML(items: CodeLabel[], opts: { selected?: string; lead?: string } = {}): string {
  let html = ''
  if (opts.lead != null) html += `<option value="">${opts.lead}</option>`
  for (const it of items) {
    const sel = opts.selected === it.code ? ' selected' : ''
    html += `<option value="${it.code}"${sel}>${it.label}</option>`
  }
  return html
}

export const deptOptions = (opts?: { selected?: string; lead?: string }) => optionsHTML(DEPARTMENTS, opts)
export const positionOptions = (opts?: { selected?: string; lead?: string }) => optionsHTML(POSITIONS, opts)
export const employmentTypeOptions = (opts?: { selected?: string; lead?: string }) => optionsHTML(EMPLOYMENT_TYPES, opts)

// 클라이언트 전역 주입 스크립트 — layout.ts 에서 1회 주입.
// window.DEPT_NAMES / POSITION_NAMES / EMPLOYMENT_NAMES (code→label 맵)
export const HR_ENUMS_JS = `
window.DEPT_NAMES = ${JSON.stringify(DEPARTMENT_LABELS)};
window.POSITION_NAMES = ${JSON.stringify(POSITION_LABELS)};
window.EMPLOYMENT_NAMES = ${JSON.stringify(EMPLOYMENT_LABELS)};
`
