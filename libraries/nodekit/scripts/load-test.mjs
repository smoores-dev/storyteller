import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REQUIRED_EXPORTS = [
  "configure",
  "metadataSearch",
  "metadataBook",
  "metadataBookRaw",
  "coverSearch",
  "download",
]

const TARGET_HOSTS = {
  "darwin-arm64": ["darwin", "arm64"],
  "darwin-x64": ["darwin", "x64"],
  "linux-x64-gnu": ["linux", "x64"],
  "linux-arm64-gnu": ["linux", "arm64"],
  "win32-x64-msvc": ["win32", "x64"],
  "win32-arm64-msvc": ["win32", "arm64"],
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const target = process.env["NAPI_TARGET"]
const explicitPath = process.argv[2]

if (!explicitPath && !target) {
  console.error(
    "usage: node scripts/load-test.mjs <path-to-addon>\n" +
      "   or: NAPI_TARGET=<target> node scripts/load-test.mjs",
  )
  process.exit(1)
}

if (target && !TARGET_HOSTS[target]) {
  console.error(
    `unknown NAPI_TARGET "${target}", expected one of: ` +
      Object.keys(TARGET_HOSTS).join(", "),
  )
  process.exit(1)
}

if (target) {
  const [platform, arch] = TARGET_HOSTS[target]
  if (platform !== process.platform || arch !== process.arch) {
    console.log(
      `skipping load test: ${target} is cross-built, ` +
        `host is ${process.platform}-${process.arch}`,
    )
    process.exit(0)
  }
}

const addonPath = resolve(
  explicitPath ?? resolve(packageDir, `nodekit.${target}.node`),
)

if (!existsSync(addonPath)) {
  console.error(`addon not found at ${addonPath}`)
  process.exit(1)
}

process.env["STORYTELLER_NODEKIT_PATH"] = addonPath

const { loadAddon } = await import("../src/index.ts")

const addon = loadAddon()

const missing = REQUIRED_EXPORTS.filter(
  (name) => typeof addon[name] !== "function",
)

if (missing.length > 0) {
  console.error(
    `missing exports: ${missing.join(", ")}\n` +
      `found: ${Object.keys(addon).sort().join(", ")}`,
  )
  process.exit(1)
}

await addon.configure(JSON.stringify({ tokens: {} }))

console.log(`ok: ${addonPath}`)
console.log(`exports: ${Object.keys(addon).sort().join(", ")}`)
