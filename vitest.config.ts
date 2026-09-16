import { defineConfig } from "vitest/config"

// mostly necessary to make vitest test explorer work
export default defineConfig({
  test: {
    projects: ["libraries/*/vitest.config.ts"],
  },
})
