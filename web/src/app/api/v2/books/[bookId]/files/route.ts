import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { type FileHandle, mkdir, open, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, extname, join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import { type Filename, PortablePath, ppath } from "@yarnpkg/fslib"
import { ZipFS } from "@yarnpkg/libzip"
import contentDisposition from "content-disposition"
import { lookup } from "mime-types"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import { getAudioCover } from "@/assets/covers"
import { isAudioFile, isZipArchive } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { type BookWithRelations, getBook, getBookUuid } from "@/database/books"
import { logger } from "@/logging"

type Params = Promise<{
  bookId: string
}>

function determineFormat(
  book: BookWithRelations,
  format: "readaloud" | "audiobook" | "ebook" | null,
) {
  return (
    format ??
    (book.readaloud && "readaloud") ??
    (book.audiobook && "audiobook") ??
    (book.ebook && "ebook")
  )
}

async function getFilepath(
  book: BookWithRelations,
  format: "readaloud" | "audiobook" | "ebook",
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
  const zipFs = new ZipFS(ppath.resolve(zipFilepath), { create: true })
  for (const audioFile of audioFiles) {
    zipFs.mkdirpSync(
      ppath.join(PortablePath.root, dirname(audioFile) as PortablePath),
    )
    await pipeline(
      createReadStream(join(filepath, audioFile)),
      zipFs.createWriteStream(
        ppath.join(PortablePath.root, audioFile as PortablePath),
      ),
    )
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
      await zipFs.writeFilePromise(
        ppath.join(PortablePath.root, audiocover.filename as Filename),
        audiocover.data,
      )
    }

    await zipFs.writeJsonPromise(
      ppath.join(PortablePath.root, "manifest.audiobook-manifest"),
      {
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
            href: "/manifest.audiobook-manifest",
            type: "application/audiobook+json",
          },
        ],
        readingOrder: (await audiobook.getResources()).map(
          ({ filename, ...resource }) => ({
            ...resource,
            href: ppath.join(
              PortablePath.root,
              filename.replace(new RegExp(`^${filepath}`), "") as PortablePath,
            ),
          }),
        ),
        resources: audiocover
          ? [
              {
                rel: "cover",
                href: `/${audiocover.filename}`,
                type: audiocover.mimeType,
              },
            ]
          : [],
        toc: (await audiobook.getChapters()).map((chapter) => ({
          href: `${ppath.join(PortablePath.root, chapter.filename.replace(new RegExp(`^${filepath}`), "") as PortablePath)}#t=${chapter.start}`,
          title: chapter.title,
        })),
      },
    )
  }

  zipFs.saveAndClose()
  return zipFilepath
}

/**
 * @summary Get files for a book
 * @desc The format query param should be specified as one of 'readaloud',
 *       'audiobook', or 'ebook'. This endpoint supports resumable downloads via
 *       HTTP Accept-Ranges headers.
 */
export const GET = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
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

  const optionalFormat = request.nextUrl.searchParams.get("format") as
    | "readaloud"
    | "ebook"
    | "audiobook"
    | null

  const format = determineFormat(book, optionalFormat)
  if (!format) {
    return Response.json(
      { message: `Book with id ${bookId} has no valid formats` },
      { status: 404 },
    )
  }

  const contentType = request.headers.get("Accept")

  const normalizedTitle = book.title
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .replaceAll(/[^a-zA-Z0-9-_.~!#$&'()*+,/:;=?@[\] ]/gu, "")

  const filepath = await getFilepath(
    book,
    format,
    contentType?.includes("application/audiobook+zip") ?? false,
  )

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

  const readableStream = Readable.toWeb(readStream)

  return new Response(readableStream as ReadableStream, {
    status: partialResponse ? 206 : 200,
    headers: {
      "Content-Disposition": contentDisposition(
        `${book.title}${extname(filepath)}`,
        {
          fallback: `${normalizedTitle}${extname(filepath)}`,
        },
      ),
      "Content-Type": lookup(filepath) as string,
      "Content-Length": `${end - start + 1}`,
      "Accept-Ranges": "bytes",
      "Last-Modified": new Date(stats.mtime).toISOString(),
      Etag: etag,
      ...(partialResponse && {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      }),
    },
  })
})
