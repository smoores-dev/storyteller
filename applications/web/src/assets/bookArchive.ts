import { extname } from "node:path"

import { addDirectory, addFile, createZip, endZip } from "@/assets/zip"
import { isAudioFile } from "@/audio"
import {
  type DownloadSelection,
  downloadableAsset,
  selectedFormats,
} from "@/bookDownloads"
import { type BookWithRelations } from "@/database/books"

export function safeFilename(name: string) {
  return name
    .replaceAll(/[\p{Cc}/\\:*?"<>|]/gu, "")
    .trim()
    .replace(/\.+$/, "")
}

function uniqueNamer() {
  const taken = new Set<string>()

  return (name: string) => {
    let candidate = name
    for (let i = 2; taken.has(candidate.toLowerCase()); i++) {
      candidate = `${name} (${i})`
    }

    taken.add(candidate.toLowerCase())
    return candidate
  }
}

export async function createBookArchive(
  books: BookWithRelations[],
  selection: DownloadSelection,
  libraryName: string,
) {
  const nested = selection === "all" || selection === "audiobook"
  const claimName = uniqueNamer()

  const zipfile = createZip({
    name: "README.txt",
    data: [
      `Downloaded from ${libraryName} on ${new Date().toISOString().slice(0, 10)}.`,
      "",
      ...books
        .filter((book) =>
          selectedFormats(selection).some((format) =>
            downloadableAsset(book, format),
          ),
        )
        .map((book) => book.title),
      "",
    ].join("\n"),
  })

  const titles: string[] = []

  for (const book of books) {
    const base = claimName(safeFilename(book.title) || book.uuid)
    let added = 0

    for (const format of selectedFormats(selection)) {
      const asset = downloadableAsset(book, format)
      if (!asset?.filepath) {
        continue
      }

      if (format === "audiobook") {
        added += await addDirectory(zipfile, asset.filepath, base, isAudioFile)
        continue
      }

      const suffix =
        format === "readaloud" && selection === "all" ? " (readaloud)" : ""
      const filename = `${base}${suffix}${extname(asset.filepath)}`
      if (
        await addFile(
          zipfile,
          asset.filepath,
          nested ? `${base}/${filename}` : filename,
        )
      ) {
        added++
      }
    }

    if (added > 0) {
      titles.push(book.title)
    }
  }

  return { ...(await endZip(zipfile)), titles }
}
