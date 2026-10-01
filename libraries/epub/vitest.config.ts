import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/__test__/*.test.{ts,tsx}"],
    testTimeout: 0,
    hookTimeout: 0,
  },
  oxc: {
    jsx: {
      // Disable warnings about using namespaced names with @storyteller-platform/epub's
      // JSX runtime
      throwIfNamespace: false,
    },
  },
})
