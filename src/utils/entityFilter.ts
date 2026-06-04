import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'

/** 현재 요청의 entity ID를 반환. 0 = ADMIN "전체" 모드. */
export function getEntityId(c: Context<HonoEnv>): number {
  const id = c.get('entityId')
  return (id != null) ? id : 1
}

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
