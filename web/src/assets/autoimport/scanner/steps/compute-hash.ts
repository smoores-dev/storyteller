import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"

import { type PipelineStep } from "@/assets/autoimport/scanner/types"
import { isAudioFile } from "@/audio"
import { updateBook } from "@/database/books"

import { getFormatRelationPatch } from "./utils"

async function hashFile(filepath: string): Promise<{ hash: string; fileSize: number | null }> {
  const hash = createHash("sha256")
  const fileStats = await stat(filepath)
  const fileSize = fileStats.isFile() ? fileStats.size : null

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filepath)
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", resolve)
  })

  return {
    hash: hash.digest("hex"),
    fileSize,
  }
}

async function hashAudiobookDirectory(
  dirPath: string,
): Promise<{ hash: string; fileSize: number | null }> {
  const entries = await readdir(dirPath, {
    recursive: true,
    withFileTypes: true,
  })
  const files = entries
    .filter((entry) => entry.isFile() && isAudioFile(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort((a, b) => a.localeCompare(b))

  const hash = createHash("sha256")
  if (files.length === 0) {
    hash.update("empty-audiobook-directory")
    return {
      hash: hash.digest("hex"),
      fileSize: 0,
    }
  }

  let totalSize = 0
  for (const file of files) {
    const fileStats = await stat(file)
    totalSize += fileStats.size
    hash.update(relative(dirPath, file))
    hash.update(":")
    const { hash: fileHash } = await hashFile(file)
    hash.update(fileHash)
    hash.update(";")
  }

  return {
    hash: hash.digest("hex"),
    fileSize: totalSize,
  }
}

export const computeHashStep: PipelineStep = {
  name: "compute-hash",
  async run(ctx) {
    const { hash, fileSize } =
      ctx.format === "audiobook"
        ? await hashAudiobookDirectory(ctx.filepath)
        : await hashFile(ctx.filepath)

    ctx.logger.debug(`Computed hash for ${ctx.filepath}: ${hash}`)

    ctx.fileHash = hash
    ctx.fileSize = fileSize

    if (ctx.flags.has("new")) {
      ctx.flags.add("changed")
    }

    if (!ctx.flags.has("new") && ctx.existingHash !== hash) {
      ctx.flags.add("changed")
    }

    await updateBook(
      ctx.bookUuid,
      null,
      getFormatRelationPatch(ctx, {
        missing: false,
        contentHash: hash,
        fileSize,
      }),
    )

    ctx.existingHash = hash
  },
}
