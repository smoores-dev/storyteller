#! /usr/bin/env node

import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { builtinModules } from "node:module"
import { createRequire } from "node:module"
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { build } from "esbuild"
import nodeGypBuild from "node-gyp-build"

const require = createRequire(import.meta.url)
const nodePrefix = new Set(builtinModules)
const discoveredAssets = new Map()

// Asset names carry a fresh uuid on every run, so without this the directory
// accumulates a full copy of every native library per compile.
rmSync("bundle", { recursive: true, force: true })
mkdirSync("bundle")

/**
 * Shared libraries that have to sit next to a `.node` file at runtime.
 */
function isSiblingLibrary(file) {
  return (
    file.endsWith(".dylib") ||
    file.endsWith(".dll") ||
    file.endsWith(".metallib") ||
    /\.so(?:\.\d+)*$/.test(file)
  )
}

/**
 * Walks up from a file to the nearest package that ships a native addon,
 * which is what `node-gyp-build` wants to be pointed at.
 */
function findAddonPackageRoot(file) {
  let dir = dirname(file)
  while (true) {
    if (
      existsSync(join(dir, "package.json")) &&
      (existsSync(join(dir, "prebuilds")) ||
        existsSync(join(dir, "binding.gyp")) ||
        existsSync(join(dir, "build")))
    ) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

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
        // Every workspace addon (align's error aligner, mlx-audio's Metal
        // binding) imports `node-gyp-build` and points it at its own package
        // directory, which does not exist inside the executable. Resolve the
        // prebuild for the *importing* package at bundle time instead, and
        // let the native-addons plugin below turn it into a SEA asset.
        build.onResolve({ filter: /^node-gyp-build$/ }, (args) => {
          const packageRoot =
            (args.importer && findAddonPackageRoot(args.importer)) ||
            resolve(import.meta.dirname, "..")
          // esbuild identifies modules by namespace + path, so the path has to
          // be the package root or every addon would share one binding.
          return { path: packageRoot, namespace: "node-gyp-build" }
        })

        build.onLoad({ filter: /.*/, namespace: "node-gyp-build" }, (args) => {
          const packageRoot = args.path
          const packageName =
            JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
              .name ?? basename(packageRoot)

          let prebuildPath
          try {
            prebuildPath = nodeGypBuild.path(packageRoot)
          } catch (error) {
            // e.g. mlx-audio only ships a darwin-arm64 binding. Keep the
            // bundle building and fail at the point of use instead.
            console.warn(
              `no native binding for ${packageName} on ${process.platform}-${process.arch}, it will be unavailable in this build`,
            )
            return {
              loader: "js",
              contents: `
module.exports = function requireBinding() {
  throw new Error(${JSON.stringify(
    `${packageName} has no native binding for ${process.platform}-${process.arch}: ${error.message}`,
  )});
}
                `,
            }
          }

          return {
            loader: "js",
            resolveDir: packageRoot,
            contents: `
const nativeModule = require(${JSON.stringify(prebuildPath)});

module.exports = function requireBinding() {
  return nativeModule;
}
              `,
          }
        })
      },
    },
    {
      name: "onnxruntime-node",
      setup(build) {
        // onnxruntime-node picks its binding with a template-literal require,
        // which makes esbuild bundle the bindings for every platform (about
        // 200MB). Pin it to the platform this executable is being built for.
        build.onLoad(
          { filter: /onnxruntime-node[\\/]dist[\\/]binding\.js$/ },
          (args) => {
            const source = readFileSync(args.path, "utf8")
            const pattern =
              /require\(`\.\.\/bin\/napi-v(\d+)\/\$\{process\.platform\}\/\$\{process\.arch\}\/onnxruntime_binding\.node`\)/
            if (!pattern.test(source)) {
              throw new Error(
                `onnxruntime-node's binding loader changed shape, update ${fileURLToPath(import.meta.url)}`,
              )
            }
            return {
              loader: "js",
              resolveDir: dirname(args.path),
              contents: source.replace(
                pattern,
                (_, napiVersion) =>
                  `require(${JSON.stringify(
                    `../bin/napi-v${napiVersion}/${process.platform}/${process.arch}/onnxruntime_binding.node`,
                  )})`,
              ),
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
              if (isSiblingLibrary(file)) {
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
                  if (isSiblingLibrary(file)) {
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
                if (isSiblingLibrary(file)) {
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
