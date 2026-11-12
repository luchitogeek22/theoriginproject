import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8020;
const WEB_PORT = 3020;
const api = `http://localhost:${API_PORT}`;
const web = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: web,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "rm -rf .e2e-tmp && mkdir -p .e2e-tmp && cp -R ../backend/tests/fixtures/real_sequences/storage .e2e-tmp/storage && " +
        "cd ../backend && DATABASE_URL=sqlite:///../frontend/.e2e-tmp/o.db LOCAL_STORAGE_DIR=../frontend/.e2e-tmp/storage " +
        "STORAGE_BACKEND=local REDIS_URL= SUPABASE_URL= SUPABASE_ANON_KEY= SUPABASE_JWT_SECRET= ENVIRONMENT=development " +
        `CORS_ORIGINS=${web} RATE_LIMIT_PER_MINUTE=100000 DISCOVER_COLLECTIONS=false ` +
        "IRSA_SIA2_URL=http://127.0.0.1:9/SIA IRSA_TAP_URL=http://127.0.0.1:9/TAP WISE_IBE_URL=http://127.0.0.1:9/ibe " +
        `${process.env.E2E_PYTHON ?? ".venv/bin/python"} -m uvicorn app.main:app --port ${API_PORT} --log-level warning`,
      url: `${api}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `NEXT_PUBLIC_API_URL=${api} npx next build && NEXT_PUBLIC_API_URL=${api} npx next start -p ${WEB_PORT}`,
      url: web,
      reuseExistingServer: !process.env.CI,
      timeout: 360_000,
    },
  ],
});
