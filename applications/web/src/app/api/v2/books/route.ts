import { randomUUID } from "node:crypto"
import { basename, dirname, extname, sep } from "node:path"

import { NextResponse } from "next/server"

import { Epub, MemoryAdapter } from "@storyteller-platform/epub"

import { deleteAssets } from "@/assets/fs"
import { filepathFolder, scan } from "@/assets/library/scanner/scan"
import { type Candidate } from "@/assets/library/scanner/types"
import { isAudioFile, isHiddenFile, isZipArchive } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { deleteBook, getBook, getBooks } from "@/database/books"
import {
  type Epub2ImportStrategy,
  type ImportMode,
} from "@/database/settingsTypes"
import { isEpubVersionError } from "@/epub"
import { type UUID } from "@/uuid"

import { parseGetBooksOptions } from "./parseBookQuery"

export const dynamic = "force-dynamic"

/**
 * @summary List all books in the library
 * @desc Use the `alignedOnly` param to limit results to books that
 *       have been aligned by Storyteller successfully.
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const parsed = parseGetBooksOptions(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const books = await getBooks(null, request.auth.user.id, {
    ...parsed.opts,
    includeManifest: false,
  })

  return NextResponse.json(books)
})

export const DELETE = withHasPermission("bookDelete")(async (request) => {
  const { books: bookUuids, preventReImport } = (await request.json()) as {
    books: UUID[]
    preventReImport?: boolean
  }

  const books = await getBooks(bookUuids, request.auth.user.id)

  if (books.length !== bookUuids.length) {
    return Response.json({ message: "Not found" }, { status: 404 })
  }

  for (const book of books) {
    await deleteBook(book.uuid, { preventReImport })
    await deleteAssets(book)
  }

  return new Response(null, { status: 204 })
})

async function probeEpub2(filepath: string): Promise<boolean> {
  try {
    using _epub = await Epub.using(MemoryAdapter).from(filepath)
    return false
  } catch (error) {
    if (isEpubVersionError(error)) return true
    throw error
  }
}

/**
 * @summary Import a book from file paths on the server
 * @desc When `epub2Strategy` is `"auto"` (or omitted), the endpoint probes
 *       each epub to check its version. If any epub is version 2 and the
 *       import mode is not "copy" (which always upgrades automatically), the
 *       response is `{ epub2Detected: true, paths: [...] }` with status 200 -
 *       the caller should re-submit with an explicit `epub2Strategy` value.
 *
 *       When `epub2Strategy` is an explicit value ("replace", "skip",
 *       "backup-and-convert"), the import proceeds using that strategy.
 */
export const POST = withHasPermission("bookCreate")(async (request) => {
  const {
    paths,
    collection,
    importMode,
    epub2Strategy = "auto",
  } = (await request.json()) as {
    paths: string[]
    collection: UUID | undefined
    importMode: ImportMode
    epub2Strategy?: Epub2ImportStrategy | "auto"
  }

  const epubs = paths.filter((path) => extname(path) === ".epub")
  const audio = paths.filter(
    (path) => (isAudioFile(path) || isZipArchive(path)) && !isHiddenFile(path),
  )

  // when strategy is "auto" and import mode could be affected by the user's
  // choice, probe all epubs and ask if any are epub2.
  if (epub2Strategy === "auto" && importMode !== "copy" && epubs.length > 0) {
    const epub2Paths: string[] = []

    for (const epubPath of epubs) {
      const is2 = await probeEpub2(epubPath)
      if (is2) epub2Paths.push(epubPath)
    }

    if (epub2Paths.length > 0) {
      return Response.json({ epub2Detected: true, paths: epub2Paths })
    }
  }

  const newBookUuid = randomUUID()
  const resolvedStrategy = epub2Strategy === "auto" ? undefined : epub2Strategy

  const candidates: Candidate[] = []

  for (const epubPath of epubs) {
    candidates.push({
      folder: filepathFolder(epubPath),
      bookUuidHint: newBookUuid,
      format: "ebook",
      filepath: epubPath,
      titleHint: basename(epubPath, extname(epubPath)),
      ...(collection && { collections: [collection] }),
      importMode,
      ...(resolvedStrategy && { epub2ImportStrategy: resolvedStrategy }),
    })
  }

  if (audio.length) {
    if (audio.length > 1) {
      const longestPrefx = longestPrefix(audio).split(sep)
      const notDirectlyUnderLongestPrefix = audio.find(
        (path) => path.split(sep).length !== longestPrefx.length + 1,
      )

      if (notDirectlyUnderLongestPrefix) {
        return Response.json(
          {
            message: `Audio files must be in a single directory. ${notDirectlyUnderLongestPrefix} is not directly under ${longestPrefx.join(sep)}`,
          },
          { status: 405 },
        )
      }
    }

    const audioDirectory =
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      audio.length === 1 ? dirname(audio[0]!) : longestPrefix(audio)

    candidates.push({
      folder: audioDirectory,
      bookUuidHint: newBookUuid,
      format: "audiobook",
      filepath: audioDirectory,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      titleHint: basename(audio[0]!, extname(audio[0]!)),
      ...(collection && { collections: [collection] }),
      importMode,
    })
  }

  await scan({
    source: "api",
    request: { kind: "candidates", candidates },
    options: { force: true },
    signal: new AbortController().signal,
  })

  const reconciled = await getBook(newBookUuid)

  if (!reconciled) {
    return Response.json(
      { message: "Unable to create book from provided paths" },
      { status: 405 },
    )
  }

  return Response.json(reconciled)
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
