import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: [
      "store/**/*.test.ts",
      "modules/**/*.test.ts",
      "components/**/*.test.ts",
    ],
    testTimeout: 0,
    hookTimeout: 0,
  },
})
