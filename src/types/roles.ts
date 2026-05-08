// 시스템 역할 상수 (4개 고정)
// 마이그레이션 0136 의 CHECK 제약과 일치해야 함.
// 신규 역할 추가 시: 여기 + 0136 CHECK + permissions UI 탭 + permissions API 검증 4곳 동시 갱신.

export const ROLES = ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'] as const
export type Role = typeof ROLES[number]
export const ROLE_SET: ReadonlySet<string> = new Set(ROLES)

export function isValidRole(role: string): role is Role {
  return ROLE_SET.has(role)
}
