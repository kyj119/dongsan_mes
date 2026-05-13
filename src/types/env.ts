import type { AuthUser } from './models'
import type { PortalUser } from '../middleware/portalAuth'

// Cloudflare environment bindings
export type Bindings = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  JWT_SECRET: string;
  AGENT_API_KEY: string;
  POPBILL_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
};

// Alias for routes that use CloudflareBindings directly
export type CloudflareBindings = Bindings;

// Hono app type with typed context variables
export type HonoEnv = {
  Bindings: Bindings;
  Variables: {
    user: AuthUser;
    entityId: number;
    portalUser: PortalUser;
  };
};
