// @ts-check

import { rewriteRelativeImportExtensionsPlugin } from "./rewriteRelativeImportExtensionsPlugin.js"

/**
 * @satisfies {import("tsup").Options}
 */
export const defaultOptions = {
  outDir: "dist",
  bundle: false,
  format: ["esm", "cjs"],
  clean: true,
  esbuildOptions: (options) => {
    options.bundle = false
  },
  esbuildPlugins: [
    rewriteRelativeImportExtensionsPlugin({
      formatMap: (importExtension, outputPath) => {
        if (importExtension !== ".ts") {
          return
        }
        if (!outputPath.endsWith(".cjs")) {
          return
        }
        return ".cjs"
      },
    }),
  ],
  dts: {
    // this fixes the .d.ts generation for some packages (e.g. audiobook)
    compilerOptions: {
      composite: false,
    },
  },
}
