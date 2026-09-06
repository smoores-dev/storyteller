import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { type Readable } from "node:stream"

import { createReadableStreamFromReadable } from "@remix-run/node"
import contentDisposition from "content-disposition"
import { ZipFile } from "yazl"

import {
  getAlignmentReportFilepath,
  getEmissionsFilepath,
  getProcessedAudioFilepath,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import { isAudioFile } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

type Params = Promise<{ bookId: UUID }>

async function addFile(
  zipfile: ZipFile,
  filepath: string,
  name: string,
  compress = false,
) {
  try {
    await stat(filepath)
  } catch {
    return
  }

  zipfile.addFile(filepath, name, { compress })
}

async function addDirectory(
  zipfile: ZipFile,
  dir: string,
  prefix: string,
  {
    compress = false,
    include,
  }: { compress?: boolean; include?: (filename: string) => boolean } = {},
) {
  let filenames: string[]
  try {
    filenames = await readdir(dir)
  } catch {
    return
  }

  for (const filename of filenames) {
    if (include && !include(filename)) continue
    zipfile.addFile(join(dir, filename), `${prefix}/${filename}`, { compress })
  }
}

export const GET = withHasPermission<Params>("bookUpdate")(async (
  _request,
  { params },
) => {
  const { bookId } = await params
  const book = await getBook(bookId)

  if (!book) {
    return new Response("Book not found", { status: 404 })
  }

  const zipfile = new ZipFile()

  // this needs to be first. if we add an epub first, Archive Util on Macos
  // will think the whole thing is an epub.
  zipfile.addBuffer(
    Buffer.from(JSON.stringify({ bookId, title: book.title }, null, 2)),
    "bundle.json",
  )

  if (book.ebook?.filepath) {
    await addFile(zipfile, book.ebook.filepath, "ebook.epub")
  }

  if (book.readaloud?.filepath) {
    await addFile(zipfile, book.readaloud.filepath, "readaloud.epub")
  }

  if (book.audiobook?.filepath) {
    await addDirectory(zipfile, book.audiobook.filepath, "audiobook", {
      include: isAudioFile,
    })
  }

  await addDirectory(
    zipfile,
    getProcessedAudioFilepath(book),
    "transcoded-audio",
    { include: isAudioFile },
  )
  await addDirectory(zipfile, getEmissionsFilepath(book), "emissions")
  await addDirectory(
    zipfile,
    getTranscriptionsFilepath(book),
    "transcriptions",
    { compress: true },
  )
  await addFile(
    zipfile,
    getAlignmentReportFilepath(book),
    "alignment-report.json",
    true,
  )

  zipfile.end()

  return new Response(
    createReadableStreamFromReadable(zipfile.outputStream as Readable),
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition(
          `debug-bundle-${book.title}.zip`,
        ),
      },
    },
  )
})
