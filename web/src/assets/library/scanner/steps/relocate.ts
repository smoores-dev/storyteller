import { mkdir, readdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"

import { copyWithHardlink, copyWithReflink, move } from "@/assets/fs"
import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { type ScanFormat } from "@/assets/library/scanner/types"
import {
  suppressPrefix,
  unsuppressPrefix,
} from "@/assets/library/scanner/write-intent"
import {
  getDefaultSuffix,
  getInternalAudioDirectory,
  getInternalBookDirectory,
  getInternalEpubFilepath,
  getInternalReadaloudFilepath,
} from "@/assets/paths"
import { isAudioFile } from "@/audio"
import { type BookWithRelations, updateBook } from "@/database/books"


type Relocator = (source: string, destination: string) => Promise<void>

function resolveRelocator(
  importMode: Exclude<import("@/database/settingsTypes").ImportMode, "reference">,
): Relocator {
  switch (importMode) {
    case "move":
      return move
    case "hardlink":
      return copyWithHardlink
    case "copy":
      return copyWithReflink
  }
}

async function ensureBookDirectory(
  book: BookWithRelations,
): Promise<BookWithRelations> {
  try {
    await mkdir(getInternalBookDirectory(book))
    return book
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    ) {
      throw error
    }
  }
  return await updateBook(book.uuid, {
    suffix: getDefaultSuffix(book.uuid),
  })
}

function isAlreadyInternal(filepath: string, book: BookWithRelations): boolean {
  const internalDir = getInternalBookDirectory(book)
  return filepath === internalDir || filepath.startsWith(internalDir + "/")
}

export type RelocateResult = {
  book: BookWithRelations
  filepath: string
}

/**
 * For non-reference import modes, move/hardlink/reflink the file into the
 * book's internal directory and update the corresponding format-relation's
 * filepath in the DB. Returns the post-relocation book and filepath.
 *
 * For `reference` mode, no-op: returns the original book and filepath.
 *
 * Wraps writes in suppressPrefix/unsuppressPrefix so the watcher doesn't
 * bounce on the moves.
 */
export async function relocateIfNeeded(
  book: BookWithRelations,
  filepath: string,
  format: ScanFormat,
  ctx: ScanCtx,
): Promise<RelocateResult> {
  if (ctx.importMode === "reference") return { book, filepath }
  if (isAlreadyInternal(filepath, book)) return { book, filepath }

  const ensuredBook = await ensureBookDirectory(book)
  const relocator = resolveRelocator(ctx.importMode)

  if (format === "ebook") {
    const dest = getInternalEpubFilepath(ensuredBook)
    await mkdir(dirname(dest), { recursive: true })
    suppressPrefix(dest)
    try {
      await relocator(filepath, dest)
    } finally {
      unsuppressPrefix(dest)
    }
    const updated = await updateBook(ensuredBook.uuid, null, {
      ebook: { filepath: dest, missing: false },
    })
    return { book: updated, filepath: dest }
  }

  if (format === "readaloud") {
    const dest = getInternalReadaloudFilepath(ensuredBook)
    await mkdir(dirname(dest), { recursive: true })
    suppressPrefix(dest)
    try {
      await relocator(filepath, dest)
    } finally {
      unsuppressPrefix(dest)
    }
    const updated = await updateBook(ensuredBook.uuid, null, {
      readaloud: {
        filepath: dest,
        missing: false,
        status: ensuredBook.readaloud?.status ?? "ALIGNED",
        currentStage: ensuredBook.readaloud?.currentStage ?? "SPLIT_TRACKS",
      },
    })
    return { book: updated, filepath: dest }
  }

  // audiobook: filepath is the source directory.
  const destDir = getInternalAudioDirectory(ensuredBook)
  await mkdir(destDir, { recursive: true })
  suppressPrefix(destDir)
  try {
    const entries = await readdir(filepath)
    for (const entry of entries) {
      if (!isAudioFile(entry)) continue
      await relocator(join(filepath, entry), join(destDir, entry))
    }
    if (ctx.importMode === "move") {
      await rm(filepath, { recursive: true })
    }
  } finally {
    unsuppressPrefix(destDir)
  }
  const updated = await updateBook(ensuredBook.uuid, null, {
    audiobook: { filepath: destDir, missing: false },
  })
  return { book: updated, filepath: destDir }
}
