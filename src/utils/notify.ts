import type { D1Database } from '@cloudflare/workers-types'
import { E2E_ENTITY_ID } from './entityFilter'

export async function notifyRoles(db: D1Database, roles: string[], title: string, message?: string, link?: string, entityId?: number): Promise<void> {
  try {
    // #277: 수신 대상에 entity 필터(특정 법인 이벤트면 해당 법인 역할자만). 미지정 시 전 법인 역할자.
    // ★E2E 법인 제외(2026-08-26) — `e2e_tester` 가 활성 ADMIN 이라 **모든 역할 알림을 같이 받고 있었다**.
    //   실수신자 2명에 1명이 로봇이라 알림량이 1.5배였고, 읽는 사람은 없으니 그대로 미읽음으로 쌓였다.
    let userQuery = `SELECT id, default_entity_id FROM users WHERE role IN (${roles.map(() => '?').join(',')}) AND is_active = 1`
      + ` AND COALESCE(default_entity_id, 0) <> ${E2E_ENTITY_ID}`
    const binds: any[] = [...roles]
    if (entityId != null && entityId !== 0) {
      userQuery += ` AND default_entity_id = ?`
      binds.push(entityId)
    }
    const { results: users } = await db.prepare(userQuery).bind(...binds).all() as any

    if (!users || users.length === 0) return

    // #277: 알림에 수신자 본인 entity를 태깅 → GET 알림이 entity 필터로 조회되므로 entity 2 사용자도 수신
    const stmt = db.prepare(
      `INSERT INTO notifications (user_id, title, message, link, entity_id) VALUES (?, ?, ?, ?, ?)`
    )
    const batch = users.map((u: any) => stmt.bind(u.id, title, message ?? null, link ?? null, u.default_entity_id || entityId || 1))
    await db.batch(batch)
  } catch (e) {
    console.error('Notify roles failed:', e)
  }
}
