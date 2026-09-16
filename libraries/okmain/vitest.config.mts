import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["__test__/**/*.test.ts"],
    testTimeout: 0,
    hookTimeout: 0,
  },
})
