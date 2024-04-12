import { TEXT_DIR } from "@/directories"
import { UUID } from "@/uuid"
import { readFile, stat, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { Epub } from "@/epub"

export function getEpubDirectory(bookUuid: UUID) {
  return join(TEXT_DIR, bookUuid)
}

export function getEpubSyncedDirectory(bookUuid: UUID) {
  return join(getEpubDirectory(bookUuid), "synced")
}

export function getEpubSyncedFilepath(bookUuid: UUID) {
  return join(getEpubSyncedDirectory(bookUuid), `${bookUuid}.epub`)
}

export function getEpubFilepath(bookUuid: UUID) {
  return join(getEpubDirectory(bookUuid), "original", `${bookUuid}.epub`)
}

export function getEpubIndexPath(bookUuid: UUID) {
  return join(getEpubDirectory(bookUuid), "index.json")
}

export async function getEpubIndex(
  bookUuid: UUID,
): Promise<null | { cover?: string }> {
  const path = getEpubIndexPath(bookUuid)
  try {
    await stat(path)
  } catch (_) {
    return null
  }

  const indexFile = await readFile(path, {
    encoding: "utf-8",
  })
  return JSON.parse(indexFile)
}

export async function getEpubCoverFilepath(bookUuid: UUID) {
  const index = await getEpubIndex(bookUuid)
  if (index === null) return index

  if (!("cover" in index)) return null

  return join(getEpubDirectory(bookUuid), index.cover)
}

export async function persistCover(bookUuid: UUID, coverFilename: string) {
  const index = (await getEpubIndex(bookUuid)) ?? {}
  index.cover = coverFilename

  await writeFile(getEpubIndexPath(bookUuid), JSON.stringify(index), {
    encoding: "utf-8",
  })
}

export async function persistCustomCover(
  bookUuid: UUID,
  filename: string,
  cover: Uint8Array,
) {
  const coverFilepath = join(getEpubDirectory(bookUuid), filename)
  await writeFile(coverFilepath, cover)
  await persistCover(bookUuid, filename)
}

export async function readEpub(bookUuid: UUID) {
  return Epub.from(getEpubFilepath(bookUuid))
}

export async function getFullText(epub: Epub) {
  const spine = await epub.getSpineItems()
  const chapterTexts = await Promise.all(
    spine.map((item) => epub.readXhtmlItemContents(item.id, "text")),
  )
  return chapterTexts.join("\n")
}

export async function processEpub(bookUuid: UUID) {
  const epub = await readEpub(bookUuid)

  try {
    const coverImageItem = await epub.getCoverImage()
    if (!coverImageItem) {
      console.log(
        `Could not find cover image while processing EPUB file for book ${bookUuid}`,
      )
      return
    }

    const fileExtension = extname(coverImageItem.href)

    const coverImage = await epub.readItemContents(coverImageItem.id)

    persistCustomCover(bookUuid, `Cover${fileExtension}`, coverImage)
  } finally {
    await epub.close()
  }
}
