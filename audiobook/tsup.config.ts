import { defaultOptions } from "@storyteller-platform/tsup"
import { defineConfig } from "tsup"

export default defineConfig({
  ...defaultOptions,
  tsconfig: "./tsconfig.json",
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!**/node_modules/**"],
})
