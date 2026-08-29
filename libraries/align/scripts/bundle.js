#! /usr/bin/env node

import { build } from "esbuild"
import { builtinModules } from "node:module"
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path"
import { copyFileSync, readdirSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import nodeGypBuild from "node-gyp-build"
import { fileURLToPath, pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
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
    fileURLToPath(
      new URL("./import.meta.dirname-polyfill.js", import.meta.url),
    ),
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
      name: "node-gyp-build",
      setup(build) {
        build.onResolve({ filter: /^node-gyp-build$/ }, () => ({
          path: "node-gyp-build",
          namespace: "node-gyp-build",
        }))

        build.onLoad(
          { filter: /^node-gyp-build$/, namespace: "node-gyp-build" },
          () => {
            const prebuildPath = nodeGypBuild.path(
              resolve(import.meta.dirname, ".."),
            )

            return {
              loader: "js",
              resolveDir: resolve(import.meta.dirname, ".."),
              contents: `
const nativeModule = require(${JSON.stringify(prebuildPath)});

module.exports = function requireBinding() {
  return nativeModule;
}
              `,
            }
          },
        )
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
            const parentUrl = pathToFileURL(args.resolveDir + sep).href
            const specifier = isAbsolute(args.path)
              ? pathToFileURL(args.path).href
              : args.path

            resolved = fileURLToPath(import.meta.resolve(specifier, parentUrl))
          } catch {
            return
          }

          if (resolved.endsWith(".node")) {
            return { path: resolved, namespace: "native-addon" }
          }
        })

        const handleNodeFile = (args) => {
          const absPath = isAbsolute(args.path)
            ? args.path
            : resolve(args.resolveDir || process.cwd(), args.path)
          const assetName = `${basename(absPath, ".node")}-${randomUUID()}.node`
          discoveredAssets.set(assetName, absPath)

          // Discover sibling shared libraries that the .node file depends on
          // (e.g. libonnxruntime.so.1, libonnxruntime.1.24.3.dylib,
          // onnxruntime.dll). These must be extracted to the same temp
          // directory at runtime so the dynamic linker can find them.
          const siblingLibs = []
          const libDir = dirname(absPath)
          try {
            for (const file of readdirSync(libDir)) {
              if (
                file.endsWith(".dylib") ||
                file.endsWith(".dll") ||
                /\.so(?:\.\d+)*$/.test(file)
              ) {
                const libPath = join(libDir, file)
                const libAssetName = `${file}-${randomUUID()}`
                discoveredAssets.set(libAssetName, libPath)
                siblingLibs.push({ name: libAssetName, file })
              }
            }
          } catch {}

          const tmpDirName = `${basename(absPath, ".node")}-${randomUUID().slice(0, 8)}`
          const siblingLibEntries = JSON.stringify(
            siblingLibs.map((l) => [l.name, l.file]),
          )

          return {
            loader: "js",
            contents: `
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getRawAsset } = require('node:sea');

const tmpDir = path.join(os.tmpdir(), ${JSON.stringify(tmpDirName)});
fs.mkdirSync(tmpDir, { recursive: true });

const tmpPath = path.join(tmpDir, ${JSON.stringify(basename(absPath))});

if (!fs.existsSync(tmpPath)) {
  fs.writeFileSync(tmpPath, new Uint8Array(getRawAsset(${JSON.stringify(assetName)})));
}

const siblingLibs = ${siblingLibEntries};
for (const [assetName, fileName] of siblingLibs) {
  const libPath = path.join(tmpDir, fileName);
  if (!fs.existsSync(libPath)) {
    fs.writeFileSync(libPath, new Uint8Array(getRawAsset(assetName)));
  }
}

// Add the temp directory to the dynamic linker search path so that
// shared library dependencies (e.g. libvips-cpp.dylib, libonnxruntime.so)
// can be found at dlopen time.
const sep = process.platform === 'win32' ? ';' : ':';
const ldPath = process.platform === 'win32' ? 'PATH' :
  process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
const existing = process.env[ldPath] || '';
process.env[ldPath] = existing ? existing + sep + tmpDir : tmpDir;

const mod = { exports: {} };
process.dlopen(mod, tmpPath);
module.exports = mod.exports;
            `,
          }
        }

        build.onLoad(
          { filter: /\.node$/, namespace: "native-addon" },
          handleNodeFile,
        )

        // Catch .node files that esbuild resolves dynamically (e.g. from
        // template-literal requires in onnxruntime-node). These bypass
        // onResolve entirely and are routed straight to onLoad with the
        // default namespace, so we register a namespace-free handler.
        build.onLoad({ filter: /\.node$/ }, handleNodeFile)

        // sharp uses dynamic require() with template literals to load
        // platform-specific @img/sharp-${platform}/sharp.node, which esbuild
        // can't resolve statically. We intercept sharp's lib/sharp.js module
        // and replace it with code that loads the .node file from SEA assets.
        build.onResolve({ filter: /^\.\/sharp$/ }, (args) => {
          if (!args.resolveDir) return
          const libDir = resolve(args.resolveDir)
          if (!libDir.includes("sharp/lib")) return
          return { path: join(libDir, "sharp.js"), namespace: "sharp-binding" }
        })

        build.onLoad(
          { filter: /\.js$/, namespace: "sharp-binding" },
          (args) => {
            const resolveDir = dirname(args.path)

            // Determine the runtime platform (same logic as sharp's libvips.js)
            const { runtimePlatformArch } = require(
              join(resolveDir, "libvips.js"),
            )
            const runtimePlatform = runtimePlatformArch()

            // Resolve the @img/sharp-${platform}/sharp.node path
            const sharpNodePath = fileURLToPath(
              import.meta.resolve(
                `@img/sharp-${runtimePlatform}/sharp.node`,
                pathToFileURL(resolveDir + sep).href,
              ),
            )

            // Resolve the @img/sharp-libvips-${platform}/lib directory
            let libvipsDir
            try {
              const libvipsLibUrl = fileURLToPath(
                import.meta.resolve(
                  `@img/sharp-libvips-${runtimePlatform}/lib`,
                  pathToFileURL(resolveDir + sep).href,
                ),
              )
              libvipsDir = dirname(libvipsLibUrl)
            } catch {}

            // Discover sibling shared libraries from the libvips package
            const siblingLibs = []
            if (libvipsDir) {
              try {
                for (const file of readdirSync(libvipsDir)) {
                  if (
                    file.endsWith(".dylib") ||
                    file.endsWith(".dll") ||
                    /\.so(?:\.\d+)*$/.test(file)
                  ) {
                    const libPath = join(libvipsDir, file)
                    const libAssetName = `${file}-${randomUUID()}`
                    discoveredAssets.set(libAssetName, libPath)
                    siblingLibs.push({ name: libAssetName, file })
                  }
                }
              } catch {}
            }

            // Also discover sibling libs in the sharp .node's own directory
            const sharpLibDir = dirname(sharpNodePath)
            try {
              for (const file of readdirSync(sharpLibDir)) {
                if (
                  file.endsWith(".dylib") ||
                  file.endsWith(".dll") ||
                  /\.so(?:\.\d+)*$/.test(file)
                ) {
                  const libPath = join(sharpLibDir, file)
                  const libAssetName = `${file}-${randomUUID()}`
                  discoveredAssets.set(libAssetName, libPath)
                  siblingLibs.push({ name: libAssetName, file })
                }
              }
            } catch {}

            // Register the .node file as a SEA asset
            const assetName = `sharp-${runtimePlatform}-${randomUUID()}.node`
            discoveredAssets.set(assetName, sharpNodePath)

            const tmpDirName = `sharp-${runtimePlatform}-${randomUUID().slice(0, 8)}`
            const siblingLibEntries = JSON.stringify(
              siblingLibs.map((l) => [l.name, l.file]),
            )

            return {
              loader: "js",
              contents: `
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getRawAsset } = require('node:sea');

const tmpDir = path.join(os.tmpdir(), ${JSON.stringify(tmpDirName)});
fs.mkdirSync(tmpDir, { recursive: true });

const tmpPath = path.join(tmpDir, 'sharp.node');

if (!fs.existsSync(tmpPath)) {
  fs.writeFileSync(tmpPath, new Uint8Array(getRawAsset(${JSON.stringify(assetName)})));
}

const siblingLibs = ${siblingLibEntries};
for (const [assetName, fileName] of siblingLibs) {
  const libPath = path.join(tmpDir, fileName);
  if (!fs.existsSync(libPath)) {
    fs.writeFileSync(libPath, new Uint8Array(getRawAsset(assetName)));
  }
}

// Add the temp directory to the dynamic linker search path so that
// shared library dependencies (e.g. libvips-cpp.dylib) can be found
// at dlopen time.
const sep = process.platform === 'win32' ? ';' : ':';
const ldPath = process.platform === 'win32' ? 'PATH' :
  process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
const existing = process.env[ldPath] || '';
process.env[ldPath] = existing ? existing + sep + tmpDir : tmpDir;

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

    // On macOS, add @loader_path as an rpath to .node files so that
    // shared library dependencies (e.g. libvips-cpp.dylib,
    // libonnxruntime.1.24.3.dylib) can be found at dlopen time when
    // extracted to a temp directory. This is necessary because:
    //   1. DYLD_LIBRARY_PATH set via process.env at runtime is not
    //      read by dyld (it's captured at process startup)
    //   2. The @rpath entries baked into the .node binaries point to
    //      relative paths that don't exist in the temp extraction dir
    // @loader_path resolves to the directory containing the .node file,
    // which is the same temp dir where sibling .dylib/.so files are
    // extracted
    if (process.platform === "darwin" && destPath.endsWith(".node")) {
      try {
        execFileSync(
          "install_name_tool",
          ["-add_rpath", "@loader_path", destPath],
          {
            stdio: ["ignore", "ignore", "ignore"],
          },
        )
      } catch {}
    }

    assets[assetName] = destPath
  } catch {}
}

const seaConfig = {
  main: join("bundle", "bin.cjs"),
  output: process.platform === "win32" ? "stalign.exe" : "stalign",
  disableExperimentalSEAWarning: true,
  assets,
}

console.log(seaConfig)

writeFileSync("sea-config.json", JSON.stringify(seaConfig, null, 2) + "\n")
