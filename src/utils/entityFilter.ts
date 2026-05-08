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
