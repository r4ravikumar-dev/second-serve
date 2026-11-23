import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { DATA_BACKEND: "memory", AUTH_MODE: "dev", AI_MODE: "mock", BLOB_MODE: "local", APP_TIME_ZONE: "Asia/Kolkata" },
  },
});
