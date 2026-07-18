import { applyD1Migrations, env } from "cloudflare:test";

// @ts-expect-error — injecté via miniflare.bindings dans vitest.config.ts
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
