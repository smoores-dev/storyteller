import {
  linkAudio,
  linkEpub,
  originalAudioExists,
  originalEpubExists,
  persistAudio,
  persistEpub,
} from "@/assets"
import { withHasPermission } from "@/auth"
import { createBook, getBooks } from "@/database/books"
import { Epub } from "@/epub"
import { isProcessing, isQueued } from "@/work/distributor"
import { BlobReader } from "@zip.js/zip.js"
import { NextResponse } from "next/server"
import { basename } from "path"

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

function entriesAreFiles(
  audioFiles: FormDataEntryValue[],
): audioFiles is File[] {
  return audioFiles.every((entry): entry is File => typeof entry !== "string")
}

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
      const authors = await epub.getAuthors()

      const book = createBook(
        title ?? basename(epubPath).replace(".epub", ""),
        authors.map((author) => ({ ...author, uuid: "" })),
      )
      await linkEpub(book.uuid, epubPath)
      await linkAudio(book.uuid, audioPaths)

      return NextResponse.json(book)
    } catch (e) {
      console.error(e)
      return NextResponse.json(
        {
          message: "Missing epubPath or audioPaths",
        },
        { status: 405 },
      )
    }
  }

  const formData = await request.formData()
  const epubFile = formData.get("epub_file")
  const audioFiles = formData.getAll("audio_files")

  if (
    !epubFile ||
    !audioFiles.length ||
    typeof epubFile === "string" ||
    !entriesAreFiles(audioFiles)
  ) {
    return NextResponse.json(
      {
        message: "Missing epub_file or audio_files",
      },
      { status: 405 },
    )
  }

  const dataReader = new BlobReader(epubFile)

  const epub = await Epub.from(dataReader)

  const title = await epub.getTitle()
  const authors = await epub.getAuthors()

  const book = createBook(
    title ?? epubFile.name.replace(".epub", ""),
    authors.map((author) => ({ ...author, uuid: "" })),
  )
  await persistEpub(book.uuid, epubFile)
  await persistAudio(book.uuid, audioFiles)

  return NextResponse.json(book)
})
