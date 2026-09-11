import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { isSea } from "node:sea"

import requireBinding from "node-gyp-build"

const packageDir = resolve(import.meta.dirname, "..")

/**
 * Where MLX looks for its Metal shader library, relative to the directory of the
 * binary it was linked into. `swift build` cannot build shaders, so
 * `scripts/fetch-metallib.mjs` puts one there instead.
 */
const metalLibraryPaths = [
  "mlx.metallib",
  "Resources/mlx.metallib",
  "mlx-swift_Cmlx.bundle/default.metallib",
  "Resources/default.metallib",
  "default.metallib",
]

/**
 * MLX only reports a missing shader library from the first GPU operation, as
 * "Failed to load the default metallib. library not found ...", so check up front
 * and say what to do about it.
 */
function assertMetalLibraryInstalled(): void {
  const directories = [
    join(packageDir, "prebuilds", `${process.platform}-${process.arch}`),
    join(packageDir, "build", "Release"),
    join(packageDir, "build", "Debug"),
  ]
  const installed = directories.some((directory) =>
    metalLibraryPaths.some((path) => existsSync(join(directory, path))),
  )
  if (!installed) {
    throw new Error(
      `MLX Metal shader library not found next to the native binding in ${directories.join(", ")}. Run \`yarn workspace @storyteller-platform/mlx-audio build:native:metallib\`.`,
    )
  }
}

interface BindingModelInfo {
  handle: number
  vocab: Record<string, number>
  samplesPerFrame: number
  minSamples: number
  blankId: number
  frameOffsetSeconds: number
  tokenizer: "sentencepiece" | null
}

export interface Emissions {
  frames: number
  classes: number
  values: Float32Array
}

const bindingDir = process.env["MLX_AUDIO_NATIVE_BINDING"]
// An override points at a binding we know nothing about, so don't police it.
// Inside a single executable there is no package directory either: the bundler
// extracts the binding and its shader library side by side at runtime.
if (!bindingDir && !isSea()) {
  assertMetalLibraryInstalled()
}

const native = requireBinding(bindingDir || packageDir) as {
  loadModel: (directory: string) => Promise<BindingModelInfo>
  compute: (handle: number, samples: Float32Array) => Promise<Emissions>
  closeModel: (handle: number) => Promise<number>
}

export interface ModelInfo {
  handle: number
  vocab: Map<string, number>
  samplesPerFrame: number
  minSamples: number
  blankId: number
  frameOffsetSeconds: number
  tokenizer: "sentencepiece" | null
  [Symbol.asyncDispose]: () => Promise<void>
}

export async function loadModel(directory: string): Promise<ModelInfo> {
  const modelInfo = await native.loadModel(directory)
  return {
    ...modelInfo,
    vocab: new Map(Object.entries(modelInfo.vocab)),
    [Symbol.asyncDispose]: async () => {
      await native.closeModel(modelInfo.handle)
    },
  }
}

export async function compute(
  modelInfo: ModelInfo,
  samples: Float32Array,
): Promise<Emissions> {
  return await native.compute(modelInfo.handle, samples)
}
