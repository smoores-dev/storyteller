#! /usr/bin/env node

import { build } from "esbuild"
import { builtinModules } from "node:module"
import { basename, join } from "node:path"
import { copyFileSync, writeFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { extname } from "node:path"
import { randomUUID } from "node:crypto"

const nodePrefix = new Set(builtinModules)
const discoveredAssets = new Map()

await build({
  entryPoints: ["src/cli/bin.ts"],
  bundle: true,
  platform: "node",
  sourcemap: "inline",
  format: "cjs",
  outExtension: {
    ".js": ".cjs",
  },
  outdir: "bundle",
  inject: [
    new URL("./import.meta.dirname-polyfill.js", import.meta.url).pathname,
  ],
  define: {
    "import.meta.dirname": "import_meta_dirname",
  },
  plugins: [
    {
      name: "node-builtins",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path.startsWith("node:")) {
            return { path: args.path, external: true }
          }
          if (nodePrefix.has(args.path)) {
            return { path: `node:${args.path}`, external: true }
          }
        })
      },
    },
    {
      name: "native-addons",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.namespace === "native-addon") return
          if (args.path.startsWith("node:")) return
          if (nodePrefix.has(args.path)) return
          if (!args.resolveDir) return

          let resolved
          try {
            const parentUrl = pathToFileURL(args.resolveDir + "/").href
            resolved = fileURLToPath(import.meta.resolve(args.path, parentUrl))
          } catch {
            return
          }

          if (resolved.endsWith(".node")) {
            return { path: resolved, namespace: "native-addon" }
          }
        })

        build.onLoad(
          { filter: /\.node$/, namespace: "native-addon" },
          (args) => {
            const assetName = `${basename(args.path, ".node")}-${randomUUID()}.node`
            discoveredAssets.set(assetName, args.path)
            return {
              loader: "js",
              contents: `
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getRawAsset } = require('node:sea');

const tmpPath = path.join(os.tmpdir(), ${JSON.stringify(assetName)});

if (!fs.existsSync(tmpPath)) {
  fs.writeFileSync(tmpPath, new Uint8Array(getRawAsset(${JSON.stringify(assetName)})));
}

const mod = { exports: {} };
process.dlopen(mod, tmpPath);
module.exports = mod.exports;
            `,
            }
          },
        )
      },
    },
  ],
})

const assets = {}
for (const [assetName, sourcePath] of discoveredAssets) {
  const destPath = join("bundle", assetName)
  try {
    copyFileSync(sourcePath, destPath)
    assets[assetName] = destPath
  } catch {}
}

const seaConfig = {
  main: "bundle/bin.cjs",
  output: "stalign",
  disableExperimentalSEAWarning: true,
  assets,
}

writeFileSync("sea-config.json", JSON.stringify(seaConfig, null, 2) + "\n")
