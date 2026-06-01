import type { AuthUser } from './models'
import type { PortalUser } from '../middleware/portalAuth'

// Cloudflare environment bindings
export type Bindings = {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  JWT_SECRET: string;
  AGENT_API_KEY: string;
  BAROBILL_CERT_KEY?: string;
  BAROBILL_CERT_KEY_PROD?: string;
  RESEND_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  // #314: Cloudflare Rate Limiting 바인딩 (portal 인증 throttle). 미구성 환경에선 undefined → 호출부에서 가드.
  PORTAL_RL?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
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
