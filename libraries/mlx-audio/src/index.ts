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
  loadModel: (directory: string, dtype: ModelDtype) => Promise<BindingModelInfo>
  compute: (
    handle: number,
    samples: Float32Array,
    batch: number,
  ) => Promise<Emissions>
  closeModel: (handle: number) => Promise<number>
}

export type ModelDtype = "fp32" | "fp16"

export interface LoadModelOptions {
  dtype?: ModelDtype
}

export interface ModelInfo {
  handle: number
  dtype: ModelDtype
  vocab: Map<string, number>
  samplesPerFrame: number
  minSamples: number
  blankId: number
  frameOffsetSeconds: number
  tokenizer: "sentencepiece" | null
  [Symbol.asyncDispose]: () => Promise<void>
}

export async function loadModel(
  directory: string,
  options: LoadModelOptions = {},
): Promise<ModelInfo> {
  const dtype = options.dtype ?? "fp32"
  const modelInfo = await native.loadModel(directory, dtype)
  return {
    ...modelInfo,
    dtype,
    vocab: new Map(Object.entries(modelInfo.vocab)),
    [Symbol.asyncDispose]: async () => {
      await native.closeModel(modelInfo.handle)
    },
  }
}

/**
 * Runs several chunks of the same length through the model in one call. Each
 * call has a fixed dispatch cost of several milliseconds, so batching chunks
 * is markedly faster than one call per chunk.
 */
export async function compute(
  modelInfo: ModelInfo,
  chunks: Float32Array[],
): Promise<Emissions[]> {
  const first = chunks[0]
  if (first === undefined) return []
  if (chunks.some((chunk) => chunk.length !== first.length)) {
    throw new Error("Every chunk in a batch must have the same length")
  }
  let samples = first
  if (chunks.length > 1) {
    samples = new Float32Array(first.length * chunks.length)
    chunks.forEach((chunk, index) => {
      samples.set(chunk, index * first.length)
    })
  }
  const batched = await native.compute(modelInfo.handle, samples, chunks.length)
  const stride = batched.frames * batched.classes
  return chunks.map((_, index) => ({
    frames: batched.frames,
    classes: batched.classes,
    values: batched.values.subarray(index * stride, (index + 1) * stride),
  }))
}
