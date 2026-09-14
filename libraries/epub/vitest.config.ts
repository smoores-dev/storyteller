import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["*.test.ts"],
    testTimeout: 0,
    hookTimeout: 0,
  },
})
