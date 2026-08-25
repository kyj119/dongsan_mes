import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'

/** 현재 요청의 entity ID를 반환. 0 = ADMIN "전체" 모드. */
export function getEntityId(c: Context<HonoEnv>): number {
  const id = c.get('entityId')
  return (id != null) ? id : 1
}

/**
 * 재고 등 법인 귀속이 필수인 쓰기 경로용 entity ID.
 * ADMIN 전체모드(0)는 null 반환 — 호출부에서 400 처리 필수.
 * (기존 `getEntityId(c) || 1` 패턴은 전체모드 쓰기를 조용히 동산(1)에 귀속시키는 함정)
 */
export function getWriteEntityId(c: Context<HonoEnv>): number | null {
  const id = getEntityId(c)
  return id === 0 ? null : id
}

/** getWriteEntityId가 null일 때 공용 400 응답 본문. */
export const ENTITY_ALL_MODE_WRITE_ERROR = '전체 모드에서는 재고를 변경할 수 없습니다. 상단에서 법인을 선택하세요.'

/**
 * E2E 테스트 전용 법인. `entities` 에 `is_active = 1` 로 실재하므로
 * "활성 법인" 조건만으로는 걸러지지 않는다 — 사람에게 나가는 것(알림·발송)에서 뺄 때는 이 상수를 쓸 것.
 *
 * ★2026-08-26: `notifyRoles` 가 이걸 안 봐서 **역할 알림이 전부 `e2e_tester` 에게도 갔다**.
 *   수신자 3명 중 1명이 테스트 계정이라 알림이 33% 부풀었고(미읽음 5,328건 중 상당수),
 *   채택 지표를 사람 활동으로 착각하게 만드는 축이기도 하다([[project-employee-adoption-protocol]]).
 *   ⚠️`entities.is_active = 0` 으로 끄는 방식은 택하지 않았다 — cron 의 법인 루프가 같은 조건을 써서
 *   E2E 시나리오가 조용히 죽는다.
 */
export const E2E_ENTITY_ID = 99

/**
 * 트랜잭션 테이블 쿼리에 entity_id 필터를 추가하는 헬퍼.
 * entityId=0 (전체 모드)이면 빈 문자열 반환 → WHERE 절 생략.
 *
 * @example
 * const { clause, params } = entityFilter(c, 'o')
 * query += clause   // ' AND o.entity_id = ?'  또는  ''
 * allParams.push(...params)
 */
export function entityFilter(
  c: Context<HonoEnv>,
  tableAlias?: string
): { clause: string; params: number[] } {
  const entityId = getEntityId(c)
  if (entityId === 0) return { clause: '', params: [] }
  const prefix = tableAlias ? `${tableAlias}.` : ''
  return { clause: ` AND ${prefix}entity_id = ?`, params: [entityId] }
}

/**
 * storage_zone_id가 현재 요청 법인 소유(또는 ADMIN 전체모드)인지 검증. #461 IDOR 가드.
 * null/undefined = 미배정이므로 통과. 미존재·비활성·타법인 소유면 false.
 * storage_zones는 법인 소유(0232) — 도메인 전체가 #368/#417로 격리됨(목록 드롭다운도 자법인만 노출).
 */
export async function isZoneOwnedByEntity(
  c: Context<HonoEnv>,
  zoneId: number | null | undefined
): Promise<boolean> {
  if (zoneId == null) return true
  const entityId = getEntityId(c)
  const z = entityId === 0
    ? await c.env.DB.prepare('SELECT id FROM storage_zones WHERE id = ? AND is_active = 1').bind(zoneId).first()
    : await c.env.DB.prepare('SELECT id FROM storage_zones WHERE id = ? AND is_active = 1 AND entity_id = ?').bind(zoneId, entityId).first()
  return !!z
}

/**
 * cards 테이블용 엔티티 필터 (requesting_entity_id 컬럼 사용).
 * 카드는 entity_id가 아닌 requesting_entity_id(생산/공정 담당 법인)로 귀속한다.
 * → 타법인 담당(order_items.assigned_entity_id) 품목의 카드가 그 법인 작업 큐에 표시됨.
 * entityId=0 (전체 모드)이면 빈 문자열 반환.
 */
export function cardEntityFilter(
  c: Context<HonoEnv>,
  tableAlias?: string
): { clause: string; params: number[] } {
  const entityId = getEntityId(c)
  if (entityId === 0) return { clause: '', params: [] }
  const prefix = tableAlias ? `${tableAlias}.` : ''
  return { clause: ` AND ${prefix}requesting_entity_id = ?`, params: [entityId] }
}

/**
 * 주문 가시성 필터 (멀티법인 협업 — 코디네이터 교차 가시성).
 * 내 법인이 **소유(청구)**했거나, 내 법인이 **담당**(order_items.assigned_entity_id)한 품목이 있는 주문을 본다.
 * → Phase 2에서 타법인 담당 품목의 카드가 내 법인 큐에 표시되는데, 그 부모 주문의 맥락도 열람 가능.
 * - entityId=0 (ADMIN 전체 모드) → 필터 생략.
 * - is_coordinator (Phase B, JWT) → 필터 생략(전 법인 주문 열람).
 * ⚠️ EXISTS 상관 서브쿼리가 `${prefix}id`를 참조하므로 **tableAlias 필수**(미지정 시 order_items.id로 잘못 해석됨).
 */
export function orderVisibilityFilter(
  c: Context<HonoEnv>,
  tableAlias: string
): { clause: string; params: number[] } {
  const entityId = getEntityId(c)
  if (entityId === 0) return { clause: '', params: [] }
  const user = c.get('user') as { is_coordinator?: number } | undefined
  if (user?.is_coordinator) return { clause: '', params: [] }
  const prefix = `${tableAlias}.`
  return {
    clause: ` AND (${prefix}entity_id = ? OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = ${prefix}id AND oi.assigned_entity_id = ?))`,
    params: [entityId, entityId]
  }
}
