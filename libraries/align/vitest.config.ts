import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 0,
    hookTimeout: 0,
    // This seems to cause issues with the EPUB-related tests
    fileParallelism: false,
  },
  oxc: {
    jsx: {
      // Disable warnings about using namespaced names with @storyteller-platform/epub's
      // JSX runtime
      throwIfNamespace: false,
    },
  },
})
