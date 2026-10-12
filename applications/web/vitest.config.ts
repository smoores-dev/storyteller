import { join } from "node:path"

import { defaultServerConditions } from "vite"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    resolve: {
      // Resolve @storyteller-platform/epub to src rather than dist
      conditions: ["@storyteller", ...defaultServerConditions],
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      STORYTELLER_DATA_DIR: join(
        import.meta.dirname,
        "src/__fixtures__/__output__",
      ),
      STORYTELLER_TEST_DB: "1",
      STORYTELLER_SECRET_KEY: "test-secret-key",
    },
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
