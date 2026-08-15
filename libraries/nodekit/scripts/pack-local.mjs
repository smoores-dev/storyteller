import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { cp, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = resolve(packageDir, "../..")

const HOST_TARGETS = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64": "linux-x64-gnu",
  "linux-arm64": "linux-arm64-gnu",
  "win32-x64": "win32-x64-msvc",
  "win32-arm64": "win32-arm64-msvc",
}

const args = process.argv.slice(2)
const keep = args.includes("--keep")
const stubIndex = args.indexOf("--stub-binary")
const stubBinary = stubIndex === -1 ? null : args[stubIndex + 1]

const hostKey = `${process.platform}-${process.arch}`
const target = HOST_TARGETS[hostKey]

if (!target) {
  console.error(`no nodekit target for host ${hostKey}`)
  process.exit(1)
}

const binaryName = `nodekit.${target}.node`
const binaryPath = stubBinary
  ? resolve(process.cwd(), stubBinary)
  : join(packageDir, binaryName)

if (!existsSync(binaryPath)) {
  console.error(
    `addon not found at ${binaryPath}\n` +
      `run 'yarn workspace @storyteller-platform/nodekit build:native' first, ` +
      `or pass --stub-binary <path> to exercise packaging with another addon`,
  )
  process.exit(1)
}

const outDir = join(packageDir, ".pack-local")
const tarballDir = join(outDir, "tarballs")
const consumerDir = join(tmpdir(), "nodekit-pack-local-consumer")
const npmDir = join(packageDir, "npm")
const artifactsDir = join(packageDir, "artifacts")

const run = (command, commandArgs, cwd) =>
  execFileSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: "false" },
  })

const capture = (command, commandArgs, cwd) =>
  execFileSync(command, commandArgs, { cwd, encoding: "utf8" })

console.log(`==> host ${hostKey} -> target ${target}`)

rmSync(outDir, { recursive: true, force: true })
rmSync(consumerDir, { recursive: true, force: true })
rmSync(npmDir, { recursive: true, force: true })
rmSync(artifactsDir, { recursive: true, force: true })
mkdirSync(tarballDir, { recursive: true })
mkdirSync(consumerDir, { recursive: true })
mkdirSync(artifactsDir, { recursive: true })

console.log(`==> scratch consumer at ${consumerDir}`)

console.log("==> building js")
run("yarn", ["workspace", "@storyteller-platform/nodekit", "build"], repoRoot)

console.log("==> creating per-platform npm dirs")
await cp(binaryPath, join(artifactsDir, binaryName))
run("yarn", ["napi", "create-npm-dirs"], packageDir)
run("yarn", ["napi", "artifacts"], packageDir)

const platformDir = join(npmDir, target)
if (!existsSync(join(platformDir, binaryName))) {
  console.error(`napi artifacts did not place ${binaryName} in ${platformDir}`)
  process.exit(1)
}

const rootPackageJson = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf8"),
)
const platformPackageName = JSON.parse(
  readFileSync(join(platformDir, "package.json"), "utf8"),
).name

console.log(`==> packing ${platformPackageName}`)
run("npm", ["pack", "--pack-destination", tarballDir], platformDir)

console.log(`==> packing ${rootPackageJson.name}`)
run("yarn", ["pack", "--out", join(tarballDir, "nodekit-root.tgz")], packageDir)

const tarballs = await readdir(tarballDir)
const platformTarball = tarballs.find((name) => name !== "nodekit-root.tgz")

console.log("==> installing into a scratch consumer")
writeFileSync(
  join(consumerDir, "package.json"),
  `${JSON.stringify(
    {
      name: "nodekit-pack-local-consumer",
      private: true,
      version: "0.0.0",
      type: "module",
      dependencies: {
        [rootPackageJson.name]: `file:${join(tarballDir, "nodekit-root.tgz")}`,
        [platformPackageName]: `file:${join(tarballDir, platformTarball)}`,
      },
    },
    null,
    2,
  )}\n`,
)

run("npm", ["install", "--no-audit", "--no-fund"], consumerDir)

const verifyScript = `
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const entry = require.resolve("${rootPackageJson.name}")
const { describeAddonResolution, loadAddon } = await import(entry)

const resolution = describeAddonResolution()
console.log(JSON.stringify({ entry, resolution }, null, 2))

if (!resolution.resolved) {
  console.error("FAIL: addon did not resolve from the installed packages")
  process.exit(1)
}

const npmCandidate = resolution.candidates.find(
  (candidate) => candidate.source === "npm" && candidate.exists,
)

if (!npmCandidate) {
  console.error("FAIL: the npm per-platform package was not resolvable")
  process.exit(1)
}

if (resolution.resolved !== npmCandidate.path) {
  console.error(
    "FAIL: expected the npm candidate to win in the scratch consumer, got " +
      resolution.resolved,
  )
  process.exit(1)
}

try {
  loadAddon()
  console.log("OK: resolved and dlopen'd via the npm package")
} catch (error) {
  console.log("PARTIAL: resolved via the npm package but dlopen failed")
  console.log(String(error.message))
  process.exitCode = 2
}
`

writeFileSync(join(consumerDir, "verify.mjs"), verifyScript)

console.log("==> verifying resolution from the installed package")
let verifyStatus = 0
try {
  run("node", ["verify.mjs"], consumerDir)
} catch (error) {
  verifyStatus = error.status ?? 1
}

const entryExports = capture(
  "node",
  [
    "-e",
    `const r=require("node:module").createRequire(process.cwd()+"/");` +
      `console.log(r.resolve("${rootPackageJson.name}"))`,
  ],
  consumerDir,
).trim()

console.log(`\n==> published entry resolves to ${entryExports}`)

if (!keep) {
  rmSync(npmDir, { recursive: true, force: true })
  rmSync(artifactsDir, { recursive: true, force: true })
  console.log(`==> cleaned npm/ and artifacts/ (scratch kept at ${outDir})`)
} else {
  console.log(`==> kept npm/, artifacts/ and ${outDir}`)
}

if (verifyStatus === 2) {
  console.log(
    "\npackaging verified; dlopen failed (expected with --stub-binary)",
  )
  process.exit(0)
}

process.exit(verifyStatus)
