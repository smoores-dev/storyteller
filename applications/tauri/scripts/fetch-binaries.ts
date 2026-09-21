// TODO: maybe should use nix for this?

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  NODE_VERSION,
  READIUM_VERSION,
  type Target,
  getTarget,
  hostTriple,
} from "./targets.ts"

const here = dirname(fileURLToPath(import.meta.url))
const tauriRoot = resolve(here, "..")
const cacheDir = join(tauriRoot, ".cache", "downloads")
const binariesDir = join(tauriRoot, "src-tauri", "binaries")

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    console.log(`cached ${url}`)
    return
  }
  console.log(`downloading ${url}`)
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(`${dest}.partial`, buf)
  rmSync(dest, { force: true })
  copyFileSync(`${dest}.partial`, dest)
  rmSync(`${dest}.partial`, { force: true })
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function verifyFromChecksumFile(
  archivePath: string,
  checksumFilePath: string,
  entryName: string,
) {
  const sums = readFileSync(checksumFilePath, "utf-8")
  const line = sums
    .split("\n")
    .find((l) => l.trim().endsWith(entryName) || l.includes(`  ${entryName}`))
  if (!line) throw new Error(`no checksum entry for ${entryName}`)
  const expected = line.trim().split(/\s+/)[0]
  const actual = sha256(archivePath)
  if (expected !== actual) {
    throw new Error(
      `checksum mismatch for ${entryName}: expected ${expected}, got ${actual}`,
    )
  }
  console.log(`verified ${entryName}`)
}

function extract(archive: string, dest: string) {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  if (archive.endsWith(".zip")) {
    execFileSync("unzip", ["-q", archive, "-d", dest])
  } else {
    execFileSync("tar", ["-xf", archive, "-C", dest])
  }
}

function installBinary(extracted: string, relPath: string, outName: string) {
  const src = join(extracted, relPath)
  if (!existsSync(src)) {
    throw new Error(`expected binary not found in archive: ${src}`)
  }
  mkdirSync(binariesDir, { recursive: true })
  const dest = join(binariesDir, outName)
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
  console.log(`installed ${dest}`)
}

async function fetchNode(target: Target) {
  const version = `v${NODE_VERSION}`
  const isWin = target.platform === "win32"
  const archiveName = `node-${version}-${target.nodeDist}.${isWin ? "zip" : "tar.gz"}`
  const base = `https://nodejs.org/dist/${version}`
  const archive = join(cacheDir, archiveName)
  const shasums = join(cacheDir, `node-${version}-SHASUMS256.txt`)
  await download(`${base}/${archiveName}`, archive)
  await download(`${base}/SHASUMS256.txt`, shasums)
  verifyFromChecksumFile(archive, shasums, archiveName)

  const extracted = join(cacheDir, `node-${version}-${target.nodeDist}`)
  extract(archive, extracted)
  const inner = `node-${version}-${target.nodeDist}`
  const binPath = isWin ? join(inner, "node.exe") : join(inner, "bin", "node")
  installBinary(
    extracted,
    binPath,
    `node-${target.triple}${isWin ? ".exe" : ""}`,
  )
}

async function fetchReadium(target: Target) {
  const base = `https://github.com/readium/cli/releases/download/v${READIUM_VERSION}`
  const archive = join(cacheDir, target.readiumAsset)
  const checksums = join(cacheDir, `readium-v${READIUM_VERSION}-checksums.txt`)
  await download(`${base}/${target.readiumAsset}`, archive)
  await download(`${base}/checksums.txt`, checksums)
  verifyFromChecksumFile(archive, checksums, target.readiumAsset)

  const extracted = join(cacheDir, `readium-${target.triple}`)
  extract(archive, extracted)
  const isWin = target.platform === "win32"
  installBinary(
    extracted,
    isWin ? "readium.exe" : "readium",
    `readium-${target.triple}${isWin ? ".exe" : ""}`,
  )
}

async function fetchFfmpegTool(target: Target, tool: "ffmpeg" | "ffprobe") {
  const { url, binaryPath } = target[tool]
  const ext = url.endsWith(".zip") ? ".zip" : ".tar.xz"
  const shared = target.ffmpeg.url === target.ffprobe.url
  const archiveName = `${shared ? "ffmpeg-tools" : tool}-${target.triple}${ext}`
  const archive = join(cacheDir, archiveName)
  await download(url, archive)
  const extracted = join(cacheDir, `${archiveName}.extracted`)
  extract(archive, extracted)
  const isWin = target.platform === "win32"
  installBinary(
    extracted,
    binaryPath,
    `${tool}-${target.triple}${isWin ? ".exe" : ""}`,
  )
}

async function main() {
  const args = process.argv.slice(2)
  const targetIdx = args.indexOf("--target")
  const triple = targetIdx >= 0 ? args[targetIdx + 1]! : hostTriple()
  const target = getTarget(triple)

  console.log(`fetching sidecar binaries for ${triple}`)
  await fetchNode(target)
  await fetchReadium(target)
  await fetchFfmpegTool(target, "ffmpeg")
  await fetchFfmpegTool(target, "ffprobe")
  console.log("done")
}

await main()
