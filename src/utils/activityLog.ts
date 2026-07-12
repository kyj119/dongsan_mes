import type { D1Database } from '@cloudflare/workers-types'

interface LogParams {
  db: D1Database
  userId?: number | null
  userName?: string | null
  action: string
  entityType: string
  entityId?: number | null
  entityLabel?: string | null
  details?: string | null
  /**
   * #515: 행위가 발생한 법인(행위자 소속). getEntityId(c)를 넘기면 정확.
   * 미지정 시 users.default_entity_id 서브쿼리로 폴백 → 모든 로그가 법인 귀속되어
   * GET /activity-logs의 법인 필터가 MANAGER를 자기 법인 로그로 한정할 수 있음.
   * 0(ADMIN 전체모드)은 NULL로 저장(특정 법인 귀속 아님).
   */
  actorEntityId?: number | null
}

export async function logActivity(params: LogParams): Promise<void> {
  try {
    // actorEntityId 미지정 또는 0(전체모드) → 행위자 기본 법인으로 폴백(서브쿼리).
    const explicitEntity = (params.actorEntityId != null && params.actorEntityId !== 0)
      ? params.actorEntityId
      : null
    await params.db.prepare(
      `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, entity_label, details, actor_entity_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT default_entity_id FROM users WHERE id = ?)))`
    ).bind(
      params.userId ?? null,
      params.userName ?? null,
      params.action,
      params.entityType,
      params.entityId ?? null,
      params.entityLabel ?? null,
      params.details ?? null,
      explicitEntity,
      params.userId ?? null
    ).run()
  } catch (e) {
    console.error('Activity log write failed:', e)
  }
}
