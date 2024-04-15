import { persistAudio, persistEpub } from "@/assets"
import { withHasPermission } from "@/auth"
import { createBook, getBooks } from "@/database/books"
import { Epub } from "@/epub"
import { BlobReader } from "@zip.js/zip.js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("book_list")(async (request) => {
  const url = request.nextUrl
  const syncedOnly = url.searchParams.get("synced")

  const books = await getBooks(null, syncedOnly !== null)

  return NextResponse.json(
    books.reverse().map((book) => ({
      ...book,
      ...(book.processingStatus && {
        processing_status: {
          ...book.processingStatus,
          current_task: book.processingStatus.currentTask,
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

  const book = await createBook(
    title ?? epubFile.name.replace(".epub", ""),
    authors.map((author) => ({ ...author, uuid: "" })),
  )
  await persistEpub(book.uuid, epubFile)
  await persistAudio(book.uuid, audioFiles)

  return NextResponse.json(book)
})
