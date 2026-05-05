import { cp } from "node:fs/promises"

import { NextResponse } from "next/server"

import { Epub } from "@storyteller-platform/epub"

import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { isEpubVersionError } from "@/epub"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

export type UpgradeResult = "upgraded" | "already_epub3" | "error"

async function checkAndUpgrade(
  filepath: string,
  createBackup: boolean,
  backupSuffix: string,
): Promise<UpgradeResult> {
  try {
    using _probe = await Epub.from(filepath)
    return "already_epub3"
  } catch (e) {
    if (!isEpubVersionError(e)) throw e

    logger.info(`EPUB at ${filepath} is not EPUB 3, upgrading`)
  }

  if (createBackup) {
    const backupPath = filepath.replace(/\.epub$/i, `${backupSuffix}.epub`)
    await cp(filepath, backupPath)
    logger.info(`Created EPUB 2 backup at ${backupPath}`)
  }

  using _upgraded = await Epub.upgrade(filepath)
  await _upgraded.saveAndClose()

  return "upgraded"
}

export const POST = withHasPermission<Params>("bookUpdate")(async (
  request,
  { params },
) => {
  const { bookId } = await params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid)

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 })
  }

  const body = (await request.json()) as {
    createBackup?: boolean
    backupSuffix?: string
  }

  const createBackup = body.createBackup ?? true
  const backupSuffix = body.backupSuffix ?? "_epub2"

  const results: Record<string, UpgradeResult> = {}

  const epubPaths = [
    book.ebook?.filepath && { key: "ebook", path: book.ebook.filepath },
    book.readaloud?.filepath && {
      key: "readaloud",
      path: book.readaloud.filepath,
    },
  ].filter(
    (entry): entry is { key: string; path: string } =>
      !!entry && entry.path.endsWith(".epub"),
  )

  if (epubPaths.length === 0) {
    return NextResponse.json(
      { error: "No EPUB files found on this book" },
      { status: 400 },
    )
  }

  for (const { key, path } of epubPaths) {
    try {
      results[key] = await checkAndUpgrade(path, createBackup, backupSuffix)
    } catch (e) {
      logger.error(`Failed to upgrade ${key} at ${path}`)
      logger.error(e)
      results[key] = "error"
    }
  }

  return NextResponse.json(results)
})
