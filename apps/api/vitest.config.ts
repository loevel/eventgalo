import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
    plugins: [
      cloudflareTest({
        main: "./src/index.ts",
        // wrangler.test.jsonc = wrangler.jsonc sans le binding "ai" (pas d'émulation
        // locale possible, casse le pool de test hors session `wrangler login`).
        wrangler: { configPath: "./wrangler.test.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            TICKET_SIGNING_KEY: "test-signing-key-not-for-production",
            // Désactive l'envoi réel : force le mode debug (sendEmail renvoie un debug_url au lieu d'appeler EMAIL.send).
            EMAIL_FROM: "",
          },
        },
      }),
    ],
  };
});
