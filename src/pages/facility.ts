import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'

export function facilityPage(c: Context<HonoEnv>) {
  return c.redirect('/equipment?tab=layout', 302)
}
