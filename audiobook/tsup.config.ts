import { defaultOptions } from "@storyteller/tsup"
import { defineConfig } from "tsup"

export default defineConfig({
  ...defaultOptions,
  tsconfig: "./tsconfig.json",
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
})
