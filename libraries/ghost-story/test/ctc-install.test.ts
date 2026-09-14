import assert from "node:assert"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, it } from "vitest"

import { GITLAB_PROJECT_ID } from "../src/cli/config.ts"
import {
  getModelPackageDir,
  getModelPackageFileUrl,
  installModelPackage,
  isCtcModel,
  isModelPackageInstalled,
  listModelPackageFiles,
} from "../src/cli/ctc-install.ts"
import { type CtcModelPackage } from "../src/constants.ts"

const model: CtcModelPackage = {
  name: "test-model",
  version: "1.0.0",
  packageId: 1,
  modelVersionId: 2,
  subdir: "onnx-community/test-model",
  entryFile: "onnx/model.onnx",
}

const contents: Record<string, Buffer> = {
  "config.json": Buffer.from('{"vocab_size":31}'),
  "onnx/model.onnx": Buffer.from("weights"),
}

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex")
}

function manifest(): string {
  return JSON.stringify(
    Object.entries(contents).map(([fileName, body]) => ({
      // the registry url-encodes path separators
      file_name: encodeURIComponent(fileName),
      size: body.length,
      file_sha256: sha256(body),
    })),
  )
}

/**
 * Stands in for the registry. `corrupt` corrupts downloads without changing
 * the manifest, and `downloads` counts the files that were actually fetched.
 */
function registryFetch(
  downloads: { count: number },
  corrupt = false,
): typeof fetch {
  const prefix = `/api/v4/projects/${GITLAB_PROJECT_ID}/packages/`
  const downloadPrefix = `${prefix}ml_models/${model.modelVersionId}/files/`

  return (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const { pathname } = new URL(url)

    if (pathname === `${prefix}${model.packageId}/package_files`) {
      return Promise.resolve(new Response(manifest()))
    }

    if (pathname.startsWith(downloadPrefix)) {
      const fileName = decodeURIComponent(pathname.slice(downloadPrefix.length))
      const body = contents[fileName]
      if (!body) {
        return Promise.resolve(new Response("not found", { status: 404 }))
      }

      const data = corrupt ? Buffer.from("corrupted") : body
      downloads.count++

      return Promise.resolve(
        new Response(data, {
          status: 200,
          headers: { "content-length": String(data.length) },
        }),
      )
    }

    return Promise.resolve(new Response("not found", { status: 404 }))
  }
}

describe("ctc models", () => {
  it("recognizes known variants", () => {
    assert.ok(isCtcModel("fp32"))
    assert.ok(isCtcModel("fp16"))
    assert.ok(isCtcModel("mlx"))
    assert.ok(!isCtcModel("q8"))
  })

  it("builds download urls for files in subdirectories", () => {
    assert.equal(
      getModelPackageFileUrl(model, "onnx/model.onnx"),
      `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/packages/ml_models/2/files/onnx/model.onnx`,
    )
  })
})

describe("model packages", () => {
  const originalFetch = globalThis.fetch
  let modelDir = ""

  beforeAll(async () => {
    modelDir = await mkdtemp(path.join(tmpdir(), "ghost-story-model-packages-"))
  })

  afterAll(async () => {
    globalThis.fetch = originalFetch
    await rm(modelDir, { recursive: true, force: true })
  })

  it("lists files with decoded relative paths", async () => {
    globalThis.fetch = registryFetch({ count: 0 })

    const files = await listModelPackageFiles(model)

    assert.deepEqual(
      files.map((file) => file.fileName),
      ["config.json", "onnx/model.onnx"],
    )
    assert.equal(files[1]?.size, contents["onnx/model.onnx"]?.length)
    assert.equal(files[1]?.sha256, sha256(contents["onnx/model.onnx"]!))
  })

  it("rejects file names that escape the package directory", async () => {
    globalThis.fetch = (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify([{ file_name: "%2E%2E%2Fevil", size: 1 }])),
      )

    await assert.rejects(
      () => listModelPackageFiles(model),
      /invalid file name/,
    )
  })

  it("downloads every file into the model directory", async () => {
    const downloads = { count: 0 }
    globalThis.fetch = registryFetch(downloads)

    const destDir = await installModelPackage(model, {
      modelDir,
      printOutput: false,
    })

    assert.equal(downloads.count, 2)
    assert.equal(destDir, getModelPackageDir(model, modelDir))
    assert.equal(
      await readFile(path.join(destDir, "config.json"), "utf8"),
      '{"vocab_size":31}',
    )
    assert.ok(isModelPackageInstalled(model, modelDir))
  })

  it("skips files that are already up to date", async () => {
    const downloads = { count: 0 }
    globalThis.fetch = registryFetch(downloads)

    await installModelPackage(model, { modelDir, printOutput: false })

    assert.equal(downloads.count, 0)
  })

  it("removes files whose checksum does not match", async () => {
    const destDir = getModelPackageDir(model, modelDir)
    await rm(path.join(destDir, "onnx/model.onnx"), { force: true })

    globalThis.fetch = registryFetch({ count: 0 }, true)

    await assert.rejects(
      () => installModelPackage(model, { modelDir, printOutput: false }),
      /Checksum mismatch/,
    )
    assert.ok(!existsSync(path.join(destDir, "onnx/model.onnx")))
  })
})
