import type { D1Database } from '@cloudflare/workers-types'

export async function notifyRoles(db: D1Database, roles: string[], title: string, message?: string, link?: string): Promise<void> {
  try {
    const { results: users } = await db.prepare(
      `SELECT id FROM users WHERE role IN (${roles.map(() => '?').join(',')}) AND is_active = 1`
    ).bind(...roles).all() as any

    if (!users || users.length === 0) return

    const stmt = db.prepare(
      `INSERT INTO notifications (user_id, title, message, link) VALUES (?, ?, ?, ?)`
    )
    const batch = users.map((u: any) => stmt.bind(u.id, title, message ?? null, link ?? null))
    await db.batch(batch)
  } catch (e) {
    console.error('Notify roles failed:', e)
  }
}
