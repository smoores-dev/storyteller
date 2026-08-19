export const NODE_VERSION = "24.18.0"
export const READIUM_VERSION = "0.6.5"

export type Platform = "darwin" | "linux" | "win32"
export type Arch = "arm64" | "x64"

export interface Target {
  triple: string
  platform: Platform
  arch: Arch
  nodeDist: string
  readiumAsset: string
  ffmpeg: { url: string; binaryPath: string }
  ffprobe: { url: string; binaryPath: string }
  alignPrebuild: string
}

const BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"
const RIEDL = "https://ffmpeg.martin-riedl.de/redirect/latest"

export const TARGETS: Record<string, Target> = {
  "aarch64-apple-darwin": {
    triple: "aarch64-apple-darwin",
    platform: "darwin",
    arch: "arm64",
    nodeDist: "darwin-arm64",
    readiumAsset: "readium_darwin_arm64.tar.gz",
    ffmpeg: {
      url: `${RIEDL}/macos/arm64/release/ffmpeg.zip`,
      binaryPath: "ffmpeg",
    },
    ffprobe: {
      url: `${RIEDL}/macos/arm64/release/ffprobe.zip`,
      binaryPath: "ffprobe",
    },
    alignPrebuild: "darwin-arm64",
  },
  "x86_64-apple-darwin": {
    triple: "x86_64-apple-darwin",
    platform: "darwin",
    arch: "x64",
    nodeDist: "darwin-x64",
    readiumAsset: "readium_darwin_x86_64.tar.gz",
    ffmpeg: {
      url: `${RIEDL}/macos/amd64/release/ffmpeg.zip`,
      binaryPath: "ffmpeg",
    },
    ffprobe: {
      url: `${RIEDL}/macos/amd64/release/ffprobe.zip`,
      binaryPath: "ffprobe",
    },
    alignPrebuild: "darwin-x64",
  },
  "x86_64-unknown-linux-gnu": {
    triple: "x86_64-unknown-linux-gnu",
    platform: "linux",
    arch: "x64",
    nodeDist: "linux-x64",
    readiumAsset: "readium_linux_x86_64.tar.gz",
    ffmpeg: {
      url: `${BTBN}/ffmpeg-master-latest-linux64-gpl.tar.xz`,
      binaryPath: "ffmpeg-master-latest-linux64-gpl/bin/ffmpeg",
    },
    ffprobe: {
      url: `${BTBN}/ffmpeg-master-latest-linux64-gpl.tar.xz`,
      binaryPath: "ffmpeg-master-latest-linux64-gpl/bin/ffprobe",
    },
    alignPrebuild: "linux-x64",
  },
  "aarch64-unknown-linux-gnu": {
    triple: "aarch64-unknown-linux-gnu",
    platform: "linux",
    arch: "arm64",
    nodeDist: "linux-arm64",
    readiumAsset: "readium_linux_arm64.tar.gz",
    ffmpeg: {
      url: `${BTBN}/ffmpeg-master-latest-linuxarm64-gpl.tar.xz`,
      binaryPath: "ffmpeg-master-latest-linuxarm64-gpl/bin/ffmpeg",
    },
    ffprobe: {
      url: `${BTBN}/ffmpeg-master-latest-linuxarm64-gpl.tar.xz`,
      binaryPath: "ffmpeg-master-latest-linuxarm64-gpl/bin/ffprobe",
    },
    alignPrebuild: "linux-arm64",
  },
  "x86_64-pc-windows-msvc": {
    triple: "x86_64-pc-windows-msvc",
    platform: "win32",
    arch: "x64",
    nodeDist: "win-x64",
    readiumAsset: "readium_windows_x86_64.zip",
    ffmpeg: {
      url: `${BTBN}/ffmpeg-master-latest-win64-gpl.zip`,
      binaryPath: "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe",
    },
    ffprobe: {
      url: `${BTBN}/ffmpeg-master-latest-win64-gpl.zip`,
      binaryPath: "ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe",
    },
    alignPrebuild: "win32-x64",
  },
}

export function hostTriple(): string {
  const key = `${process.platform}-${process.arch}`
  const triple = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "win32-x64": "x86_64-pc-windows-msvc",
  }[key]
  if (!triple) throw new Error(`unsupported host platform: ${key}`)
  return triple
}

export function getTarget(triple: string): Target {
  const target = TARGETS[triple]
  if (!target) {
    throw new Error(
      `unknown target ${triple}, known: ${Object.keys(TARGETS).join(", ")}`,
    )
  }
  return target
}
