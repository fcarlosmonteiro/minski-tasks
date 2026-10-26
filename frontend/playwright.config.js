import { defineConfig, devices } from "@playwright/test";

// Roda sobre o docker-compose num projeto próprio (volume próprio), sem tocar
// nos dados do ambiente de desenvolvimento:
//   FRONTEND_PORT=5174 docker compose -p minski-e2e up -d --build
//   cd frontend && npx playwright test
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.js",
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_URL ?? "http://127.0.0.1:5174",
    trace: "retain-on-failure",
  },
});
