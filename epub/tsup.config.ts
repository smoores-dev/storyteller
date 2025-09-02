import { defaultOptions } from "@storyteller-platform/tsup"
import { defineConfig } from "tsup"

export default defineConfig({
  ...defaultOptions,
  tsconfig: "./tsconfig.json",
  clean: true,
  format: ["esm", "cjs"],
  entry: ["./**/*.ts", "!./**/*.test.ts", "!./**/*.d.ts", "!tsup.config.ts"],
})
