import {
  linkAudio,
  linkEpub,
  originalAudioExists,
  originalEpubExists,
  persistAudio,
  persistEpub,
} from "@/assets/assets"
import { withHasPermission } from "@/auth"
import { createBook, getBooks } from "@/database/books"
import { Epub } from "@smoores/epub"
import { isProcessing, isQueued } from "@/work/distributor"
import { NextResponse } from "next/server"
import { basename, join } from "node:path"
import busboy from "busboy"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"
import { createWriteStream, mkdirSync } from "node:fs"
import { Readable } from "node:stream"
import { ReadableStream } from "node:stream/web"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("book_list")(async (request) => {
  const url = request.nextUrl
  const syncedOnly = url.searchParams.get("synced")

  const books = await Promise.all(
    getBooks(null, syncedOnly !== null).map(async (book) => {
      return {
        ...book,
        original_files_exist: (
          await Promise.all([
            originalEpubExists(book.uuid),
            originalAudioExists(book.uuid),
          ])
        ).every((originalsExist) => originalsExist),
      }
    }),
  )

  return NextResponse.json(
    books.reverse().map((book) => ({
      ...book,
      ...(book.processingStatus && {
        processing_status: {
          ...book.processingStatus,
          current_task: book.processingStatus.currentTask,
          is_processing: isProcessing(book.uuid),
          is_queued: isQueued(book.uuid),
        },
      }),
    })),
  )
})

export const POST = withHasPermission("book_create")(async (request) => {
  if (request.headers.get("Content-Type") === "application/json") {
    const { epub_path: epubPath, audio_paths: audioPaths } =
      (await request.json()) as {
        epub_path: string
        audio_paths: string[]
      }

    try {
      const epub = await Epub.from(epubPath)
      const title = await epub.getTitle()
      const authors = await epub.getCreators()
      const language = await epub.getLanguage()

      const book = createBook(
        title ?? basename(epubPath).replace(".epub", ""),
        language?.toString() ?? null,
        authors.map((author) => ({
          name: author.name,
          role: author.role ?? null,
          fileAs: author.fileAs ?? author.name,
          uuid: "",
        })),
      )
      await linkEpub(book.uuid, epubPath)
      await linkAudio(book.uuid, audioPaths)

      return NextResponse.json(book)
    } catch (e) {
      logger.error(e)
      return NextResponse.json(
        {
          message: "Missing epubPath or audioPaths",
        },
        { status: 405 },
      )
    }
  }

  const body = request.body as ReadableStream<Uint8Array> | undefined
  if (!body) {
    return NextResponse.json(
      {
        message: "Missing epubPath or audioPaths",
      },
      { status: 405 },
    )
  }

  const headers = Object.fromEntries(request.headers.entries())
  const tmpDir = join(tmpdir(), `storyteller-upload-${randomUUID()}`)
  const paths: {
    epubFile?: string
    audioFiles: string[]
  } = { audioFiles: [] }

  // Manually stream files to disk with busboy to
  // avoid hitting 2GB ceiling in undici's
  // .formData implementation
  await new Promise((resolve, reject) => {
    const bus = busboy({ headers: headers })
    bus.on("file", (name, file, info) => {
      const tmpNamedDir = join(tmpDir, name)
      const tmpFile = join(tmpNamedDir, info.filename)
      if (name === "epub_file") {
        paths.epubFile = tmpFile
      } else if (name === "audio_files") {
        paths.audioFiles.push(tmpFile)
      } else {
        return
      }
      mkdirSync(tmpNamedDir, { recursive: true })
      file.pipe(createWriteStream(tmpFile))
    })
    bus.on("error", reject)
    bus.on("close", resolve)
    Readable.fromWeb(body).pipe(bus)
  })

  if (!paths.epubFile || !paths.audioFiles.length) {
    return NextResponse.json(
      {
        message: "Missing epub_file or audio_files",
      },
      { status: 405 },
    )
  }

  const epub = await Epub.from(paths.epubFile)

  const title = await epub.getTitle()
  const authors = await epub.getCreators()
  const language = await epub.getLanguage()

  const book = createBook(
    title ?? basename(paths.epubFile).replace(".epub", ""),
    language?.toString() ?? null,
    authors.map((author) => ({
      name: author.name,
      role: author.role ?? null,
      fileAs: author.fileAs ?? author.name,
      uuid: "",
    })),
  )
  await persistEpub(book.uuid, paths.epubFile)
  await persistAudio(book.uuid, paths.audioFiles)

  return NextResponse.json(book)
})
