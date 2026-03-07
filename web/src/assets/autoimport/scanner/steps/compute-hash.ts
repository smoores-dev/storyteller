import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"

import { isAudioFile } from "@/audio"
import { updateBook } from "@/database/books"

import { type PipelineStep } from "../types"
import { getFormatRelationPatch } from "./utils"

async function hashFile(filepath: string): Promise<string> {
  const hash = createHash("sha256")

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filepath)
    stream.on("data", (chunk: Buffer) => hash.update(chunk))
    stream.on("error", reject)
    stream.on("end", resolve)
  })

  return hash.digest("hex")
}

async function hashAudiobookDirectory(dirPath: string): Promise<string> {
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
    return hash.digest("hex")
  }

  for (const file of files) {
    hash.update(relative(dirPath, file))
    hash.update(":")
    hash.update(await hashFile(file))
    hash.update(";")
  }

  return hash.digest("hex")
}

export const computeHashStep: PipelineStep = {
  name: "compute-hash",
  async run(ctx) {
    const hash =
      ctx.format === "audiobook"
        ? await hashAudiobookDirectory(ctx.filepath)
        : await hashFile(ctx.filepath)

    ctx.logger.debug(`Computed hash for ${ctx.filepath}: ${hash}`)

    ctx.fileHash = hash

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
      }),
    )

    ctx.existingHash = hash
  },
}
