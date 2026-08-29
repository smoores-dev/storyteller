import { mkdir, readdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"

import { copyWithHardlink, copyWithReflink, move } from "@/assets/fs"
import { type ScanFormat } from "@/assets/library/scanner/types"
import {
  releasePrefixAfterSettle,
  suppressPrefix,
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
  ignorePath?: string,
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
        // make sure og file that's left behind isnt reimported. ignorePath
        // lets callers ignore the original source when the bytes we copy from
        // live somewhere else (e.g. the tmp epub3 upgrade in copy mode).
        await addIgnoreRule(ignorePath ?? source, {
          source: "import-relocate",
          bookUuid,
        })
      }
      await resolver(source, destination)
    } finally {
      releasePrefixAfterSettle(destination)
      releasePrefixAfterSettle(source)
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
 * move the file depending on the import mode, and update the format in the db.
 *
 * `ignorePath` overrides which path the import-relocate ignore rule records.
 * pass it when `filepath` is a copy of the real source (e.g. a tmp epub3
 * upgrade) so the original on-disk file gets ignored, not the throwaway copy.
 */
export async function relocateIfNeeded(
  book: BookWithRelations,
  filepath: string,
  format: ScanFormat,
  importMode: ImportMode,
  ignorePath?: string,
): Promise<RelocateResult> {
  if (importMode === "reference") {
    return { book, filepath }
  }
  if (isAlreadyInternal(filepath, book)) {
    return { book, filepath }
  }

  const relocator = resolveRelocator(importMode, book.uuid, ignorePath)

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
  const nonAudioEntries: string[] = []
  for (const entry of entries) {
    if (!isAudioFile(entry)) {
      nonAudioEntries.push(entry)
      continue
    }
    await relocator(join(filepath, entry), join(destDir, entry))
  }

  // dont remove the dir if theres other stuff in there
  if (importMode === "move" && nonAudioEntries.length === 0) {
    await rm(filepath, { recursive: true })
  }
  const updated = await updateBook(book.uuid, null, {
    audiobook: { filepath: destDir, missing: false },
  })
  return { book: updated, filepath: destDir }
}
