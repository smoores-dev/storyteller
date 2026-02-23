import { createHash } from "node:crypto"
import { createWriteStream } from "node:fs"
import { type FileHandle, mkdir, open, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, extname, join } from "node:path"
import { Readable } from "node:stream"

import contentDisposition from "content-disposition"
import { lookup } from "mime-types"
import { ZipFile } from "yazl"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import { getAudioCover } from "@/assets/covers"
import { computeFileHash } from "@/assets/fs"
import { isAudioFile, isZipArchive } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { type BookWithRelations, getBook, getBookUuid } from "@/database/books"
import { logger } from "@/logging"

type Params = Promise<{
  bookId: string
}>

type Format = "readaloud" | "audiobook" | "audiobook-rpf" | "ebook"

function determineFormat(book: BookWithRelations, format: Format | null) {
  if (format === "audiobook-rpf") {
    return "audiobook"
  }

  return (
    format ??
    (book.readaloud && "readaloud") ??
    (book.audiobook && "audiobook") ??
    (book.ebook && "ebook")
  )
}

async function getFilepath(
  book: BookWithRelations,
  format: Exclude<Format, "audiobook-rpf">,
  rpf: boolean,
) {
  const filepath = book[format]?.filepath

  if (!filepath) return null

  if (format !== "audiobook") {
    return filepath
  }

  const entries = await readdir(filepath, { recursive: true })
  const audioFiles = entries.filter(
    (entry) => isAudioFile(entry) || isZipArchive(entry),
  )

  if (audioFiles.length === 1 && !rpf) {
    // We just confirmed there was one of these
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return join(filepath, audioFiles[0]!)
  }

  const zipFilepath = join(
    tmpdir(),
    "storyteller-downloads",
    `${book.uuid}.zip`,
  )
  await mkdir(dirname(zipFilepath), { recursive: true })

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const { promise, resolve } = Promise.withResolvers<void>()
  const zipfile = new ZipFile()
  const writeStream = createWriteStream(zipFilepath)
  writeStream.on("close", () => {
    resolve()
  })
  using stack = new DisposableStack()
  stack.defer(() => {
    writeStream.close()
  })

  zipfile.outputStream.pipe(writeStream)

  for (const audioFile of audioFiles) {
    zipfile.addFile(join(filepath, audioFile), audioFile, { compress: false })
  }

  if (rpf) {
    const epubPath = book.readaloud?.filepath ?? book.ebook?.filepath
    using epub = epubPath ? await Epub.from(epubPath) : null

    using audiobook = await Audiobook.from(
      ...(audioFiles.map((audioFile) =>
        join(filepath, audioFile),
      ) as AudiobookInputs),
    )

    const audiocover = await getAudioCover(book)
    if (audiocover) {
      zipfile.addBuffer(audiocover.data, audiocover.filename)
    }

    const manifest = {
      "@context": "http:/readium.org/webpub-manifest/context.jsonld",
      metadata: {
        "@type": "http://schema.org/Audiobook",
        conformsTo: "https://readium.org/webpub-manifest/profiles/audiobook",
        identifier: epub?.getIdentifier() ?? book.audiobook?.uuid,
        title: book.title,
        description: book.description,
        subject: book.tags.map((tag) => tag.name),
        ...(book.authors.length && {
          author:
            book.authors.length === 1
              ? book.authors[0]?.name
              : book.authors.map((author) => author.name),
        }),
        ...(book.narrators.length && {
          narrator:
            book.narrators.length === 1
              ? book.narrators[0]?.name
              : book.narrators.map((narrator) => narrator.name),
        }),
        language: book.language ?? "und",
        published: (await audiobook.getReleaseDate()) ?? undefined,
        duration: await audiobook.getDuration(),
      },
      links: [
        {
          rel: "self",
          href: "manifest.json",
          type: "application/audiobook+json",
        },
      ],
      readingOrder: (await audiobook.getResources()).map(
        ({ filename, ...resource }) => ({
          ...resource,
          href: filename.replace(filepath, "").replace(/^\//, ""),
        }),
      ),
      resources: audiocover
        ? [
            {
              rel: "cover",
              href: audiocover.filename,
              type: audiocover.mimeType,
            },
          ]
        : [],
      toc: (await audiobook.getChapters()).map((chapter) => ({
        href: `${chapter.filename.replace(filepath, "").replace(/^\//, "")}#t=${chapter.start}`,
        title: chapter.title,
      })),
    }

    zipfile.addBuffer(
      Buffer.from(JSON.stringify(manifest)),
      "manifest.audiobook-manifest",
    )
    zipfile.addBuffer(Buffer.from(JSON.stringify(manifest)), "manifest.json")
  }

  zipfile.end()
  await promise

  return zipFilepath
}

/**
 * @summary Get files for a book
 * @desc The format query param should be specified as one of 'readaloud',
 *       'audiobook', or 'ebook'. This endpoint supports resumable downloads via
 *       HTTP Accept-Ranges headers.
 */
export const GET = withHasPermission<Params>("bookRead", {
  allowBasicAuth: true,
})(async (request, context) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return Response.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const range = request.headers.get("Range")?.valueOf()
  const ifRange = request.headers.get("If-Range")?.valueOf()
  const rangesString = range?.replace("bytes=", "")
  const rangeStrings = rangesString?.split(",")

  const optionalFormat = request.nextUrl.searchParams.get(
    "format",
  ) as Format | null

  const format = determineFormat(book, optionalFormat)
  if (!format) {
    return Response.json(
      { message: `Book with id ${bookId} has no valid formats` },
      { status: 404 },
    )
  }
  const contentType = request.headers.get("Accept")
  const rpf =
    contentType?.includes("application/audiobook+zip") ||
    optionalFormat === "audiobook-rpf"

  const normalizedTitle = book.title
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .replaceAll(/[^a-zA-Z0-9-_.~!#$&'()*+,/:;=?@[\] ]/gu, "")

  const filepath = await getFilepath(book, format, rpf)

  if (!filepath) {
    return Response.json(
      { message: `Could not open ${format} for book with id ${bookId}` },
      { status: 404 },
    )
  }

  let file: FileHandle
  try {
    file = await open(filepath)
  } catch {
    return Response.json(
      { message: `Could not open ${format} for book with id ${bookId}` },
      { status: 404 },
    )
  }

  const stats = await file.stat()
  const lastModified = new Date(stats.mtime).toISOString()
  const etagBase = `${stats.mtime.valueOf()}-${stats.size}`
  const etag = `"${createHash("md5").update(etagBase).digest("hex")}"`

  let start = 0
  let end = stats.size - 1

  const partialResponse =
    range?.startsWith("bytes=") &&
    // We're only supporting single ranges for now
    rangeStrings?.length === 1 &&
    (!ifRange || ifRange === etag || ifRange === lastModified)

  if (partialResponse) {
    // We already ensured that rangeStrings has a length of 1
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstRangeString = rangeStrings[0]!

    const [startString, endString] = firstRangeString.trim().split("-") as [
      string,
      string,
    ]

    try {
      const parsedStart = parseInt(startString.trim(), 10)
      if (!Number.isNaN(parsedStart)) {
        start = parsedStart
      }
      const parsedEnd = parseInt(endString.trim(), 10)
      if (!Number.isNaN(parsedEnd)) {
        end = parsedEnd
      }
    } catch {
      // If the ranges weren't valid, then leave the defaults
    }
  }

  if (start > stats.size - 1) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stats.size}` },
    })
  }

  const readStream = file.createReadStream({ start, end })
  readStream.on("error", (e) => {
    logger.error(e)
  })

  const hash = await computeFileHash(filepath)

  const readableStream = Readable.toWeb(readStream)

  return new Response(readableStream as ReadableStream, {
    status: partialResponse ? 206 : 200,
    headers: {
      "Content-Disposition": contentDisposition(
        `${book.title}${rpf ? ".audiobook" : extname(filepath)}`,
        {
          fallback: `${normalizedTitle}${rpf ? ".audiobook" : extname(filepath)}`,
        },
      ),
      "Content-Type": rpf
        ? "application/audiobook+zip"
        : (lookup(filepath) as string),
      "Content-Length": `${end - start + 1}`,
      "Accept-Ranges": "bytes",
      "Last-Modified": new Date(stats.mtime).toISOString(),
      Etag: etag,
      "X-Storyteller-Hash": hash,
      ...(partialResponse && {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      }),
    },
  })
})
