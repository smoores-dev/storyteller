#! /usr/bin/env node

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
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
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { build } from "esbuild"
import nodeGypBuild from "node-gyp-build"

const nodePrefix = new Set(builtinModules)
const discoveredAssets = new Map()
const assetsByContent = new Map()

// Avoid embedding (large) CUDA libraries for non-CUDA builds
const embedGpuProviders = Boolean(process.env.STALIGN_CUDA)
const gpuProviderFiles = new Set([
  "libonnxruntime_providers_cuda.so",
  "libonnxruntime_providers_tensorrt.so",
])
let cudaProviderFound = false

rmSync("bundle", { recursive: true, force: true })
mkdirSync("bundle")

const executable = process.platform === "win32" ? "stalign.exe" : "stalign"
rmSync(executable, { force: true })

function contentHash(file) {
  return createHash("sha256")
    .update(readFileSync(file))
    .digest("hex")
    .slice(0, 16)
}

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
  sourcemap: "external",
  format: "cjs",
  conditions: ["@storyteller"],
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
  // @huggingface/transformers imports sharp for its image utilities, but
  // we never use it.
  alias: {
    sharp: fileURLToPath(new URL("./sharp-stub.js", import.meta.url)),
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

        // @huggingface/transformers loads onnxruntime-node through
        // createRequire, which esbuild can't follow, so it's left as a runtime
        // require that fails inside the executable. Turn it into a plain
        // require so it resolves to the bundled copy.
        build.onLoad(
          {
            filter:
              /@huggingface[\\/]transformers[\\/]dist[\\/]transformers\.node\.mjs$/,
          },
          (args) => {
            const source = readFileSync(args.path, "utf8")
            const pattern = /\brequireFromHere\("onnxruntime-node"\)/
            if (!pattern.test(source)) {
              throw new Error(
                `@huggingface/transformers' onnxruntime-node loader changed shape, update ${fileURLToPath(import.meta.url)}`,
              )
            }
            return {
              loader: "js",
              resolveDir: dirname(args.path),
              contents: source.replace(pattern, `require("onnxruntime-node")`),
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

          const libraries = []
          const addLibrary = (file, sourcePath) => {
            const hash = contentHash(sourcePath)
            let asset = assetsByContent.get(hash)
            if (!asset) {
              asset = `${file}-${hash}`
              assetsByContent.set(hash, asset)
              discoveredAssets.set(asset, sourcePath)
            }
            libraries.push([asset, file])
          }
          addLibrary(basename(absPath), absPath)

          // Sibling shared libraries that the .node file depends on (e.g.
          // libonnxruntime.so.1, libonnxruntime.1.24.3.dylib, onnxruntime.dll)
          // have to be extracted to the same temp directory at runtime so the
          // dynamic linker can find them.
          const libDir = dirname(absPath)
          try {
            for (const file of readdirSync(libDir)) {
              if (!isSiblingLibrary(file)) continue
              if (gpuProviderFiles.has(file)) {
                if (!embedGpuProviders) continue
                cudaProviderFound ||=
                  file === "libonnxruntime_providers_cuda.so"
              }
              addLibrary(file, join(libDir, file))
            }
          } catch {}

          // Keyed on the extracted contents, which for macOS copies includes
          // the rpath patch applied to them further down.
          const dirPrefix = `stalign-${basename(absPath, ".node")}-`
          const tmpDirName = `${dirPrefix}${createHash("sha256")
            .update(JSON.stringify([process.platform === "darwin", libraries]))
            .digest("hex")
            .slice(0, 12)}`
          const fileEntries = JSON.stringify(libraries)

          return {
            loader: "js",
            contents: `
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getRawAsset } = require('node:sea');

const tmpDir = path.join(os.tmpdir(), ${JSON.stringify(tmpDirName)});
const tmpPath = path.join(tmpDir, ${JSON.stringify(basename(absPath))});
const files = ${fileEntries};

fs.mkdirSync(tmpDir, { recursive: true });
for (const [asset, file] of files) {
  const target = path.join(tmpDir, file);
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, new Uint8Array(getRawAsset(asset)));
  }
}

// Clear what an older build extracted and this one no longer uses: same addon,
// different contents, untouched for a week.
try {
  for (const entry of fs.readdirSync(os.tmpdir())) {
    if (entry === ${JSON.stringify(tmpDirName)} || !entry.startsWith(${JSON.stringify(dirPrefix)})) continue;
    const stale = path.join(os.tmpdir(), entry);
    try {
      if (fs.statSync(stale).mtimeMs < Date.now() - 7 * 24 * 60 * 60 * 1000) {
        fs.rmSync(stale, { recursive: true, force: true });
      }
    } catch {}
  }
} catch {}

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
      },
    },
  ],
})

if (embedGpuProviders && !cudaProviderFound) {
  throw new Error(
    "STALIGN_CUDA is set but onnxruntime-node has no CUDA provider to embed (CUDA only supported for Linux builds)",
  )
}

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
  output: executable,
  disableExperimentalSEAWarning: true,
  assets,
}

console.log(seaConfig)

writeFileSync("sea-config.json", JSON.stringify(seaConfig, null, 2) + "\n")
