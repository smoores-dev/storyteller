import { defineConfig } from "tsup"
import { defaultOptions } from "@storyteller/tsup"

export default defineConfig({
  ...defaultOptions,
  tsconfig: "./tsconfig.json",
  entry: ["index.ts"],
})
