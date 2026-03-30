import { defaultOptions } from "@storyteller-platform/tsup"
import { defineConfig } from "tsup"

export default defineConfig({
  ...defaultOptions,
  clean: true,
  tsconfig: "./tsconfig.json",
  entry: ["src/**/*.ts", "!src/**/__tests__/**"],
  target: ["esnext", "node24"],
  dts: {
    ...defaultOptions.dts,
    compilerOptions: {
      ...defaultOptions.dts.compilerOptions,
      incremental: false,
    },
  },
})
