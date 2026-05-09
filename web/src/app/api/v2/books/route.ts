import { basename, dirname, extname, sep } from "node:path"

import { NextResponse } from "next/server"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import {
  getAudioCover,
  getEpubCover,
  writeExtractedAudiobookCover,
  writeExtractedEbookCover,
} from "@/assets/covers"
import { deleteAssets, move } from "@/assets/fs"
import {
  applyFieldOverrides,
  getMetadataFromAudiobook,
  getMetadataFromEpub,
} from "@/assets/metadata"
import { isAudioFile, isZipArchive } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import {
  type BookWithRelations,
  createBookFromAudiobook,
  createBookFromEpub,
  deleteBook,
  getBooks,
  updateBook,
} from "@/database/books"
import { getSetting } from "@/database/settings"
import { isEpubVersionError } from "@/epub"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

/**
 * @summary List all books in the library
 * @desc Use the `alignedOnly` param to limit results to books that
 *       have been aligned by Storyteller successfully.
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const books = await getBooks(null, request.auth.user.id, {
    includeManifest: false,
  })

  return NextResponse.json(books)
})

export const DELETE = withHasPermission("bookDelete")(async (request) => {
  const { books: bookUuids, includeAssets } = (await request.json()) as {
    books: UUID[]
    includeAssets?: "all" | "internal"
  }
  const books = await getBooks(bookUuids, request.auth.user.id)

  if (books.length !== bookUuids.length) {
    return Response.json({ message: "Not found" }, { status: 404 })
  }

  for (const book of books) {
    await deleteBook(book.uuid)
    if (includeAssets) {
      await deleteAssets(book, { all: includeAssets === "all" })
    }
  }

  return new Response(null, { status: 204 })
})

async function openOrUpgradeEpub(epubPath: string): Promise<Epub | null> {
  try {
    return await Epub.from(epubPath)
  } catch (e) {
    if (!isEpubVersionError(e)) {
      logger.error(`Failed to read EPUB file at ${epubPath}: skipping`)
      logger.error(e)
      return null
    }

    const shouldUpgrade = await getSetting("epub2ImportStrategy")
    if (shouldUpgrade === "skip") {
      logger.info(`Skipping EPUB 2 file at ${epubPath} because of settings`)
      throw new Error(
        "EPUB 2 file is not supported. Please upgrade the file to EPUB 3, or change the upgrade strategy in the settings.",
      )
    }

    const backupSuffix = await getSetting("epub2BackupSuffix")
    const backupPath =
      shouldUpgrade === "backup-and-convert"
        ? epubPath.replace(/\.epub$/i, `${backupSuffix}.epub`)
        : undefined

    logger.info(
      `EPUB at ${epubPath} is not EPUB 3, ${shouldUpgrade === "backup-and-convert" ? `creating backup at ${backupPath}` : "auto-converting before import"}`,
    )

    if (backupPath) {
      await move(epubPath, backupPath)
    }

    using upgraded = await Epub.upgrade(
      backupPath ?? epubPath,
      backupPath ? { outputPath: epubPath } : undefined,
    )

    await upgraded.saveAndClose()

    return await Epub.from(epubPath)
  }
}

export const POST = withHasPermission("bookCreate")(async (request) => {
  const { paths, collection } = (await request.json()) as {
    paths: string[]
    collection: UUID | undefined
  }

  const epubs = paths.filter((path) => extname(path) === ".epub")
  const audio = paths.filter((path) => isAudioFile(path) || isZipArchive(path))

  let ebook: string | null = null
  let readaloud: string | null = null

  for (const epubPath of epubs) {
    const epub = await openOrUpgradeEpub(epubPath)
    if (!epub) continue

    using _ = epub
    const manifest = await epub.getManifest()
    const isReadaloud = Object.values(manifest).some(
      (item) => item.mediaOverlay,
    )

    if (!isReadaloud && !ebook) {
      ebook = epubPath
    }

    if (isReadaloud && !readaloud) {
      readaloud = epubPath
    }
  }

  let book: BookWithRelations | null = null
  if (readaloud) {
    const fallbackTitle = basename(readaloud, extname(readaloud))
    using epub = await Epub.from(readaloud)
    book = await createBookFromEpub(
      epub,
      { title: fallbackTitle },
      {
        readaloud: {
          filepath: readaloud,
          status: "ALIGNED",
          currentStage: "SPLIT_TRACKS",
        },
        ...(collection && { collections: [collection] }),
      },
    )
  }

  if (ebook) {
    using epub = await Epub.from(ebook)

    if (!book) {
      const fallbackTitle = basename(ebook, extname(ebook))
      book = await createBookFromEpub(
        epub,
        { title: fallbackTitle },
        {
          ebook: { filepath: ebook },
          ...(collection && { collections: [collection] }),
        },
      )
    } else {
      const { update: epubUpdate, relations: epubRelations } =
        await getMetadataFromEpub(epub)

      const overrides = await getSetting("metadataFieldOverrides")
      const { metadataUpdate, relationUpdate } = applyFieldOverrides(
        overrides,
        book,
        epubUpdate,
        epubRelations,
      )

      book = await updateBook(book.uuid, metadataUpdate, {
        ...relationUpdate,
        ebook: {
          filepath: ebook,
        },
        ...(collection && { collections: [collection] }),
      })
    }

    const coverImage = await getEpubCover(book)
    if (coverImage) {
      await writeExtractedEbookCover(book, coverImage.filename, coverImage.data)
    }
  }

  if (audio.length) {
    using audiobook = await Audiobook.from(...(audio as AudiobookInputs))
    const audioDirectory =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      audio.length === 1 ? dirname(audio[0]!) : longestPrefix(audio)

    if (!book) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const fallbackTitle = basename(audio[0]!, extname(audio[0]!))
      book = await createBookFromAudiobook(
        audiobook,
        { title: fallbackTitle },
        {
          audiobook: { filepath: audioDirectory },
          ...(collection && { collections: [collection] }),
        },
      )
    } else {
      const { update: audiobookUpdate, relations: audiobookRelations } =
        await getMetadataFromAudiobook(audiobook)

      const audioOverrides = await getSetting("metadataFieldOverrides")
      const {
        metadataUpdate: audioMetadataUpdate,
        relationUpdate: audioRelationUpdate,
      } = applyFieldOverrides(
        audioOverrides,
        book,
        audiobookUpdate,
        audiobookRelations,
      )

      book = await updateBook(book.uuid, audioMetadataUpdate, {
        ...audioRelationUpdate,
        audiobook: {
          filepath: audioDirectory,
        },
        ...(collection && { collections: [collection] }),
      })
    }

    const audioCover = await getAudioCover(book)

    if (audioCover) {
      await writeExtractedAudiobookCover(
        book,
        audioCover.filename,
        audioCover.data,
      )
    }
  }

  if (!book) {
    return Response.json(
      { message: "Unable to create book from provided paths" },
      { status: 405 },
    )
  }

  return Response.json(book)
})

function longestPrefix(paths: string[]) {
  const pathsSegments = paths.map((path) => path.split(sep))
  const firstPath = pathsSegments[0]
  if (!firstPath || paths.length === 1) return firstPath?.join(sep) ?? ""
  let i = 0
  while (
    firstPath[i] !== undefined &&
    pathsSegments.every((w) => w[i] === firstPath[i])
  )
    i++

  return firstPath.slice(0, i).join(sep)
}
