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
  BAROBILL_FTP_PASSWORD?: string;
  RESEND_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** Cloudflare GraphQL Analytics 조회용(예산 감시). 권한 = Account / Account Analytics / Read.
   *  미설정이면 `/api/cron/budget-check` 의 Cloudflare 축만 건너뛴다(바로빌 점검은 그대로). */
  CF_ANALYTICS_TOKEN?: string;
  /** 위 토큰과 짝. wrangler.jsonc 의 account_id 와 같은 값이지만 런타임에는 주입되지 않아 별도 시크릿이 필요하다. */
  CF_ACCOUNT_ID?: string;
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
