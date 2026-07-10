// 시스템 역할 상수 (SSOT)
// 권한 매트릭스(role_page_permissions)는 이 역할 문자열을 키로 사용한다.
//
// ⚠️ users.role 컬럼의 CHECK(0001)는 4역할('ADMIN','MANAGER','DESIGNER','OPERATOR')로 고정돼 있고,
//    orders/quotations/status_history 등 ON DELETE RESTRICT 자식 다수 때문에 D1 에서 재빌드 불가
//    (wrangler execute --file 이 FK 를 강제 → DROP TABLE users 실패, 로컬 실증 2026-07-10).
//    → 확장 역할은 users.role 이 아니라 users.job_role(무 CHECK, 0453)에 저장하고,
//      로그인 시 JWT.role = COALESCE(job_role, role) 로 내보낸다. 하위 권한/메뉴 코드는 무수정.
//
// 신규 역할 추가 시 동시 갱신: 여기(ROLES/ROLE_LABELS) + permissions UI(matrix 컬럼) + users.js 드롭다운.
//   role_page_permissions 는 CHECK 를 제거(0453)했으므로 추가 마이그레이션 불필요(app-level ROLE_SET 검증).

export const ROLES = [
  'ADMIN',      // 관리자 — 전체 (매트릭스 우회)
  'MANAGER',    // 중간관리자 (레거시 유지)
  'DESIGNER',   // 디자인
  'OPERATOR',   // 오퍼레이터
  'ACCOUNTANT', // 경리
  'SALES',      // 영업
  'FINISHING',  // 후가공
  'SHIPPING',   // 배송
] as const
export type Role = typeof ROLES[number]
export const ROLE_SET: ReadonlySet<string> = new Set(ROLES)

// 표시 라벨 SSOT (shell.js __roleMap · users.js 드롭다운 · permissions UI 에서 참조)
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: '관리자',
  MANAGER: '매니저',
  DESIGNER: '디자이너',
  OPERATOR: '작업자',
  ACCOUNTANT: '경리',
  SALES: '영업',
  FINISHING: '후가공',
  SHIPPING: '배송',
}

export function isValidRole(role: string): role is Role {
  return ROLE_SET.has(role)
}

// users.role 컬럼 CHECK(0001) 는 레거시 4역할 고정. 확장 역할은 users.job_role 에 저장하고,
// role 컬럼엔 CHECK-안전 대체값을 넣는다(레거시면 그대로, 아니면 'OPERATOR').
export const LEGACY_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'])
export function toLegacyRole(role: string): string {
  return LEGACY_ROLES.has(role) ? role : 'OPERATOR'
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] || role
}
