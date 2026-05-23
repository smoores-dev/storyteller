import { mkdir, readdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"

import { copyWithHardlink, copyWithReflink, move } from "@/assets/fs"
import { type ScanFormat } from "@/assets/library/scanner/types"
import {
  suppressPrefix,
  unsuppressPrefix,
} from "@/assets/library/scanner/write-intent"
import {
  getInternalAudioDirectory,
  getInternalBookDirectory,
  getInternalEpubFilepath,
  getInternalReadaloudFilepath,
} from "@/assets/paths"
import { isAudioFile } from "@/audio"
import { type BookWithRelations, updateBook } from "@/database/books"
import { addIgnoreRule } from "@/database/importRules"
import { type ImportMode } from "@/database/settingsTypes"

type Relocator = (source: string, destination: string) => Promise<void>

function resolveRelocator(
  importMode: Exclude<ImportMode, "reference">,
  bookUuid: BookWithRelations["uuid"],
): Relocator {
  let resolver: Relocator

  switch (importMode) {
    case "move":
      resolver = move
      break
    case "hardlink":
      resolver = copyWithHardlink
      break
    case "copy":
      resolver = copyWithReflink
      break
  }

  return async (source, destination) => {
    suppressPrefix(source)
    suppressPrefix(destination)
    try {
      // doesn't make sense to add for move
      if (importMode === "hardlink" || importMode === "copy") {
        // make sure og file that's left behind isnt reimported
        await addIgnoreRule(source, {
          source: "import-relocate",
          bookUuid,
        })
      }
      await resolver(source, destination)
    } finally {
      unsuppressPrefix(destination)
      unsuppressPrefix(source)
    }
  }
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
 */
export async function relocateIfNeeded(
  book: BookWithRelations,
  filepath: string,
  format: ScanFormat,
  importMode: ImportMode,
): Promise<RelocateResult> {
  if (importMode === "reference") {
    return { book, filepath }
  }
  if (isAlreadyInternal(filepath, book)) {
    return { book, filepath }
  }

  const relocator = resolveRelocator(importMode, book.uuid)

  if (format === "ebook") {
    const dest = getInternalEpubFilepath(book)
    await mkdir(dirname(dest), { recursive: true })
    await relocator(filepath, dest)
    const updated = await updateBook(book.uuid, null, {
      ebook: { filepath: dest, missing: false },
    })
    return { book: updated, filepath: dest }
  }

  if (format === "readaloud") {
    const dest = getInternalReadaloudFilepath(book)
    await mkdir(dirname(dest), { recursive: true })
    await relocator(filepath, dest)
    const updated = await updateBook(book.uuid, null, {
      readaloud: {
        filepath: dest,
        missing: false,
        status: book.readaloud?.status ?? "ALIGNED",
        currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
      },
    })
    return { book: updated, filepath: dest }
  }

  // audiobook: filepath is the source directory.
  const destDir = getInternalAudioDirectory(book)
  await mkdir(destDir, { recursive: true })
  const entries = await readdir(filepath)
  for (const entry of entries) {
    if (!isAudioFile(entry)) continue
    await relocator(join(filepath, entry), join(destDir, entry))
  }
  if (importMode === "move") {
    await rm(filepath, { recursive: true })
  }
  const updated = await updateBook(book.uuid, null, {
    audiobook: { filepath: destDir, missing: false },
  })
  return { book: updated, filepath: destDir }
}
