#!/usr/bin/env node
// Fetches the MLX Metal shader library (`default.metallib`) matching the
// mlx-swift version pinned in Package.resolved and writes it out as
// `mlx.metallib`.
//
// SwiftPM (`swift build`) cannot compile Metal shaders, so a command line build
// of this package never produces one and MLX throws "Failed to load the default
// metallib" on the first GPU op. MLX looks for `mlx.metallib` next to the binary
// it was linked into (the `.node` prebuild), so putting the file next to the
// binding is enough.
//
// The file is pulled out of the official `Cmlx.xcframework.zip` release asset
// with HTTP range requests, so only a few hundred kilobytes cross the wire
// instead of the whole ~200MB archive.
//
// Usage: scripts/fetch-metallib.mjs [--version <mlx-swift version>] [--out <path>]

import { createWriteStream } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { inflateRawSync } from "node:zlib"

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const RELEASE_URL = "https://github.com/ml-explore/mlx-swift/releases/download"
/** Path of the shader library inside the xcframework. */
const MEMBER = join(
  "Cmlx.xcframework",
  "macos-arm64_x86_64",
  "Cmlx.framework",
  "Versions",
  "A",
  "Resources",
  "default.metallib",
)
const DEFAULT_OUT = join(
  PACKAGE_DIR,
  "prebuilds",
  "darwin-arm64",
  "mlx.metallib",
)
/** Enough of the tail of the archive to hold the zip central directory. */
const TAIL_SIZE = 64 * 1024

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--version":
        args.version = argv[++i]
        break
      case "--out":
        args.out = resolve(argv[++i])
        break
      default:
        throw new Error(`unknown argument ${argv[i]}`)
    }
  }
  return args
}

/** The mlx-swift version this package resolves to, according to the lockfile. */
async function pinnedVersion() {
  const resolved = JSON.parse(
    await readFile(join(PACKAGE_DIR, "Package.resolved"), "utf8"),
  )
  const pin = (resolved.pins ?? []).find(
    (entry) => entry.identity === "mlx-swift",
  )
  if (!pin?.state?.version) {
    throw new Error("could not find an mlx-swift pin in Package.resolved")
  }
  return pin.state.version
}

/**
 * Resolves the archive url (github redirects it) and reads its length.
 * @param {string} url
 */
async function resolveArchive(url) {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" })
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`)
  }
  const size = Number(response.headers.get("content-length"))
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`could not determine the size of ${url}`)
  }
  // Range requests go to the resolved url so headers survive.
  return { url: response.url, size }
}

/** @param {string} url @param {number} start @param {number} end inclusive */
async function fetchRange(url, start, end) {
  const response = await fetch(url, {
    headers: { range: `bytes=${start}-${end}` },
    redirect: "error",
  })
  if (response.status !== 206) {
    throw new Error(
      `expected 206 for ${url} bytes=${start}-${end}, got ${response.status}`,
    )
  }
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Finds the end of central directory record in the last `TAIL_SIZE` bytes of a
 * zip, which holds where the (much larger) central directory itself starts.
 */
function centralDirectoryIn(tail, size) {
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (tail.readUInt32LE(offset) !== 0x06054b50) continue
    const start = tail.readUInt32LE(offset + 16)
    const length = tail.readUInt32LE(offset + 12)
    if (start + length > size) {
      throw new Error("the central directory runs past the end of the archive")
    }
    return { start, size: length }
  }
  throw new Error("the archive is not a zip file")
}

/**
 * Walks the entries of a zip central directory.
 * @param {Buffer} centralDirectory
 */
function* zipEntries(centralDirectory) {
  let offset = 0
  while (
    offset + 46 <= centralDirectory.length &&
    centralDirectory.readUInt32LE(offset) === 0x02014b50
  ) {
    const nameLength = centralDirectory.readUInt16LE(offset + 28)
    yield {
      name: centralDirectory
        .subarray(offset + 46, offset + 46 + nameLength)
        .toString("utf8"),
      method: centralDirectory.readUInt16LE(offset + 10),
      compressedSize: centralDirectory.readUInt32LE(offset + 20),
      localHeaderOffset: centralDirectory.readUInt32LE(offset + 42),
    }
    offset +=
      46 +
      nameLength +
      centralDirectory.readUInt16LE(offset + 30) +
      centralDirectory.readUInt16LE(offset + 32)
  }
}

/**
 * The local file header in front of a member, which is separate from its
 * central directory record and has a length that varies with the name/extra.
 */
function localHeaderLength(localHeader) {
  if (localHeader.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("expected a local file header")
  }
  if (localHeader.readUInt32LE(18) === 0xffffffff) {
    throw new Error("zip64 local file headers are not supported")
  }
  return 30 + localHeader.readUInt16LE(26) + localHeader.readUInt16LE(28)
}

/** Downloads the macos shader library out of the mlx-swift release archive. */
async function fetchMetallib(version) {
  const archive = await resolveArchive(
    `${RELEASE_URL}/${version}/Cmlx.xcframework.zip`,
  )

  const directory = centralDirectoryIn(
    await fetchRange(archive.url, archive.size - TAIL_SIZE, archive.size - 1),
    archive.size,
  )
  const centralDirectory = await fetchRange(
    archive.url,
    directory.start,
    directory.start + directory.size - 1,
  )

  const entry = [...zipEntries(centralDirectory)].find(
    (candidate) => candidate.name === MEMBER,
  )
  if (!entry) {
    throw new Error(`${MEMBER} is not in the mlx-swift ${version} archive`)
  }
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`unsupported zip compression method ${entry.method}`)
  }

  const localHeader = await fetchRange(
    archive.url,
    entry.localHeaderOffset,
    entry.localHeaderOffset + 29,
  )
  const header = localHeaderLength(localHeader)
  const data = await fetchRange(
    archive.url,
    entry.localHeaderOffset + header,
    entry.localHeaderOffset + header + entry.compressedSize - 1,
  )
  return entry.method === 0 ? data : inflateRawSync(data)
}

const args = parseArgs(process.argv.slice(2))
const version = args.version ?? (await pinnedVersion())
const out = args.out ?? DEFAULT_OUT

const metallib = await fetchMetallib(version)
if (metallib.subarray(0, 4).toString("latin1") !== "MTLB") {
  throw new Error("the downloaded file is not a metal library")
}

await mkdir(dirname(out), { recursive: true })
await new Promise((written, failed) => {
  const stream = createWriteStream(out)
  stream.on("error", failed)
  stream.on("finish", () => written(undefined))
  stream.end(metallib)
})

console.log(`${out}: ${metallib.byteLength} bytes (mlx-swift ${version})`)
