import { defaultServerConditions } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/__test__/*.test.{ts,tsx}"],
    testTimeout: 0,
    hookTimeout: 0,
  },
  ssr: {
    resolve: {
      // Resolve this package's own exports to src rather than dist
      conditions: ["@storyteller", ...defaultServerConditions],
    },
  },
  oxc: {
    jsx: {
      // Disable warnings about using namespaced names with @storyteller-platform/epub's
      // JSX runtime
      throwIfNamespace: false,
    },
  },
})
