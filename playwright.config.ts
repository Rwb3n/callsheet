import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: {
      Origin: "http://localhost:3000",
    },
  },
  webServer: {
    command: "npm run build && npm run start",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    env: {
      E2E_TEST_MODE: "true",
    },
  },
})
