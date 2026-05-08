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
}

export async function logActivity(params: LogParams): Promise<void> {
  try {
    await params.db.prepare(
      `INSERT INTO activity_logs (user_id, user_name, action, entity_type, entity_id, entity_label, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      params.userId ?? null,
      params.userName ?? null,
      params.action,
      params.entityType,
      params.entityId ?? null,
      params.entityLabel ?? null,
      params.details ?? null
    ).run()
  } catch (e) {
    console.error('Activity log write failed:', e)
  }
}
