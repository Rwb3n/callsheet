import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.integration.test.ts"],
    // Sequential — tests share a single DB and truncate between runs
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 15_000,
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
