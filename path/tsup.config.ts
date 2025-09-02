import { defineConfig } from "tsup"
import { defaultOptions } from "@storyteller-platform/tsup"

export default defineConfig({
  ...defaultOptions,
  tsconfig: "./tsconfig.json",
  entry: ["index.ts"],
})
