import { defaultOptions } from "@storyteller-platform/tsup"
import { defineConfig } from "tsup"

export default defineConfig({
  ...defaultOptions,
  clean: true,
  tsconfig: "./tsconfig.json",
  entry: ["src/**/*.ts", "!src/**/__tests__/**"],
  dts: {
    ...defaultOptions.dts,
    compilerOptions: {
      ...defaultOptions.dts.compilerOptions,
      incremental: false,
    },
  },
})
