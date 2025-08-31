import { withHasPermission } from "@/auth/auth"
import {
  BookWithRelations,
  createBookFromAudiobook,
  createBookFromEpub,
  deleteBook,
  getBooks,
  updateBook,
} from "@/database/books"
import { NextResponse } from "next/server"
import { UUID } from "@/uuid"
import { deleteAssets } from "@/assets/fs"
import { basename, extname } from "path"
import { isAudioFile, isZipArchive } from "@/audio"
import { Epub } from "@smoores/epub/node"
import { logger } from "@/logging"
import {
  getMetadataFromAudiobook,
  getMetadataFromEpub,
  keepMissingMetadata,
  keepMissingRelations,
} from "@/assets/metadata"
import { Audiobook } from "@smoores/audiobook/node"

export const dynamic = "force-dynamic"

/**
 * @summary List all books in the library
 * @desc Use the `alignedOnly` param to limit results to books that
 *       have been aligned by Storyteller successfully.
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const books = await getBooks(null, request.auth.user.id)

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
    try {
      const epub = await Epub.from(epubPath)
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
    } catch (e) {
      logger.error(`Failed to read EPUB file at ${epubPath}: skipping`)
      logger.error(e)
    }
  }

  let book: BookWithRelations | null = null
  if (readaloud) {
    const fallbackTitle = basename(readaloud, extname(readaloud))
    const epub = await Epub.from(readaloud)
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
    const epub = await Epub.from(ebook)

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

      const update = keepMissingMetadata(book, epubUpdate)
      const relations = keepMissingRelations(book, epubRelations)

      book = await updateBook(book.uuid, update, {
        ...relations,
        ebook: {
          filepath: ebook,
        },
        ...(collection && { collections: [collection] }),
      })
    }
  }

  if (audio.length) {
    const audiobook = await Audiobook.from(audio)
    const audioDirectory = longestPrefix(audio)

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

      const update = keepMissingMetadata(book, audiobookUpdate)
      const relations = keepMissingRelations(book, audiobookRelations)

      book = await updateBook(book.uuid, update, {
        ...relations,
        audiobook: {
          filepath: audioDirectory,
        },
        ...(collection && { collections: [collection] }),
      })
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
  const firstPath = paths[0]
  if (!firstPath || paths.length == 1) return firstPath || ""
  let i = 0
  while (firstPath[i] && paths.every((w) => w[i] === firstPath[i])) i++

  return firstPath.slice(0, i)
}
