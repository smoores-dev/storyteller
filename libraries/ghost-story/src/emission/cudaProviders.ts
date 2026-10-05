import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import * as nodeModule from "node:module"
import { dirname, join } from "node:path"
import { isSea } from "node:sea"
import { promisify } from "node:util"

const CUDA_PROVIDER_FILES = [
  "libonnxruntime_providers_shared.so",
  "libonnxruntime_providers_cuda.so",
]

let pending: Promise<void> | null = null

export function ensureCudaProviders(): Promise<void> {
  // CUDA providers are bundled into the SEA
  if (isSea()) return Promise.resolve()

  pending ??= installCudaProviders().catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}

async function installCudaProviders() {
  const packageDir = dirname(
    dirname(
      nodeModule.createRequire(import.meta.url).resolve("onnxruntime-node"),
    ),
  )
  const binDir = join(packageDir, "bin", "napi-v6", "linux", "x64")
  const missing = () =>
    CUDA_PROVIDER_FILES.filter((file) => !existsSync(join(binDir, file)))
  if (missing().length === 0) return

  console.warn(
    `[ghost-story] onnxruntime-node is missing its CUDA libraries, likely because the package manager skipped install scripts. Downloading them to ${binDir}`,
  )
  try {
    await promisify(execFile)(
      process.execPath,
      [join(packageDir, "script", "install.js")],
      {
        cwd: packageDir,
        env: { ...process.env, ONNXRUNTIME_NODE_INSTALL: "cuda12" },
      },
    )
  } catch (error) {
    throw new Error(
      `Could not download the CUDA libraries of onnxruntime-node: ${error instanceof Error ? error.message : String(error)}. Reinstall with install scripts allowed, for example npx --allow-scripts=onnxruntime-node @storyteller-platform/ghost-story serve`,
      { cause: error },
    )
  }
  const stillMissing = missing()
  if (stillMissing.length > 0) {
    throw new Error(
      `onnxruntime-node is still missing ${stillMissing.join(", ")} in ${binDir}`,
    )
  }
}
