import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { FileHandle, open } from "node:fs/promises"
import { extname } from "node:path"
import { Epub } from "@smoores/epub/node"
import { getAudioCoverFilepath, getFirstCoverImage } from "@/assets/covers"
import { getAudioCoverImage } from "@/process/processEpub"
import contentDisposition from "content-disposition"
import { extension, lookup } from "mime-types"
import { createReadableStreamFromReadable } from "@remix-run/node"
import { createHash } from "node:crypto"

let _sharp: typeof import("sharp") | undefined

const AVIF = "image/avif"
const WEBP = "image/webp"
const PNG = "image/png"
const JPEG = "image/jpeg"

export async function getSharp() {
  if (_sharp) {
    return _sharp
  }
  _sharp = (await import("sharp")).default
  if (_sharp.concurrency() > 1) {
    // Reducing concurrency should reduce the memory usage too.
    // We more aggressively reduce in dev but also reduce in prod.
    // https://sharp.pixelplumbing.com/api-utility#concurrency
    const divisor = process.env.NODE_ENV === "development" ? 4 : 2
    _sharp.concurrency(Math.floor(Math.max(_sharp.concurrency() / divisor, 1)))
  }
  return _sharp
}

async function optimizeImage({
  buffer,
  contentType,
  width,
  height,
}: {
  buffer: Buffer
  contentType: string
  width: number
  height?: number
}): Promise<Buffer> {
  const quality = 75
  const sharp = await getSharp()
  const transformer = sharp(buffer)
    .timeout({
      seconds: 7,
    })
    .rotate()

  if (height) {
    transformer.resize(width, height)
  } else {
    transformer.resize(width, undefined, {
      withoutEnlargement: true,
    })
  }

  if (contentType === AVIF) {
    transformer.avif({
      quality: Math.max(quality - 20, 1),
      effort: 3,
    })
  } else if (contentType === WEBP) {
    transformer.webp({ quality })
  } else if (contentType === PNG) {
    transformer.png({ quality })
  } else if (contentType === JPEG) {
    transformer.jpeg({ quality, mozjpeg: true })
  }

  const optimizedBuffer = await transformer.toBuffer()

  return optimizedBuffer
}

function hasChanged(
  currentHeaders: Awaited<ReturnType<typeof createCacheHeaders>>,
  conditions: {
    ifNoneMatch: string | null
    ifModifiedSince: string | null
  },
) {
  if (conditions.ifNoneMatch) {
    return conditions.ifNoneMatch === currentHeaders.Etag
  }

  if (conditions.ifModifiedSince) {
    const conditionDate = new Date(conditions.ifModifiedSince)
    const currentDate = new Date(currentHeaders["Last-Modified"])
    return currentDate <= conditionDate
  }

  return false
}

async function createCacheHeaders(file: FileHandle) {
  const stats = await file.stat()
  const lastModified = new Date(stats.mtime).toISOString()
  const etagBase = `${stats.mtime.valueOf()}-${stats.size}`
  const etag = `"${createHash("md5").update(etagBase).digest("hex")}"`

  return {
    "Last-Modified": lastModified,
    Etag: etag,
    "Cache-Control": "must-revalidate",
  }
}

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Get the cover image for a book
 * @desc Use the `audio` search param to get the audio cover. The
 *       default is to get the text cover.
 */
export const GET = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) return new Response(null, { status: 404 })

  const height = parseInt(request.nextUrl.searchParams.get("h") ?? "0", 10)
  const width = parseInt(request.nextUrl.searchParams.get("w") ?? "0", 10)

  const ifNoneMatch = request.headers.get("if-none-match")
  const ifModifiedSince = request.headers.get("if-modified-since")

  const notModified = new Response(null, { status: 304 })

  const audio = typeof request.nextUrl.searchParams.get("audio") === "string"
  if (audio) {
    let file!: FileHandle
    const coverFilepath = await getAudioCoverFilepath(book)
    try {
      // This actually might be undefined, but if it is, we want to
      // throw so that we end up in the catch block
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const file = await open(coverFilepath!)
      const cacheHeaders = await createCacheHeaders(file)

      if (hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
        return notModified
      }

      const result =
        height && width
          ? await optimizeImage({
              buffer: await file.readFile(),
              height,
              width,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              contentType: lookup(coverFilepath!) || ".jpg",
            })
          : createReadableStreamFromReadable(file.createReadStream())

      return new Response(result, {
        headers: {
          ...cacheHeaders,
          "Content-Disposition": contentDisposition(
            // If we got here, this is definitely defined
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            `${book.title} audio cover${extname(coverFilepath!)}`,
            {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              fallback: `audio cover${extname(coverFilepath!)}`,
            },
          ),
        },
      })
    } catch {
      const audioDirectory = book.audiobook?.filepath
      if (!audioDirectory) {
        if (book.readaloud?.filepath) {
          const epub = await Epub.from(book.readaloud.filepath)
          const audioCoverImage = await getAudioCoverImage(epub)
          if (audioCoverImage) {
            const readaloudFile = await open(book.readaloud.filepath)
            const cacheHeaders = await createCacheHeaders(readaloudFile)
            await readaloudFile.close()

            if (hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
              return notModified
            }

            const result =
              height && width
                ? await optimizeImage({
                    buffer: Buffer.from(audioCoverImage),
                    height,
                    width,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    contentType: lookup(coverFilepath!) || ".jpg",
                  })
                : audioCoverImage

            return new Response(result, {
              headers: cacheHeaders,
            })
          }
        }
        return new Response(null, { status: 404 })
      }

      const coverImage = await getFirstCoverImage(audioDirectory)
      if (!coverImage) return new Response(null, { status: 404 })

      const cacheHeaders = await createCacheHeaders(
        await open(coverImage.audiofile),
      )

      if (hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
        return notModified
      }

      const result =
        height && width
          ? await optimizeImage({
              buffer: Buffer.from(coverImage.data),
              height,
              width,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              contentType: coverImage.format,
            })
          : coverImage.data

      return new Response(result, {
        headers: {
          ...cacheHeaders,
          "Content-Type": coverImage.format,
          "Content-Disposition": contentDisposition(
            `${book.title} audio cover.${extension(coverImage.format) || "jpg"}`,
            {
              fallback: `audio cover.${extension(coverImage.format) || "jpg"}`,
            },
          ),
        },
      })
    } finally {
      await file.close()
    }
  }

  const epubFilepath = book.readaloud?.filepath ?? book.ebook?.filepath
  if (!epubFilepath) return new Response(null, { status: 404 })

  const epub = await Epub.from(epubFilepath)
  const coverImageItem = await epub.getCoverImageItem()
  const coverImage = await epub.getCoverImage()
  if (!coverImage) return new Response(null, { status: 404 })

  const epubFile = await open(epubFilepath)
  const cacheHeaders = await createCacheHeaders(epubFile)
  await epubFile.close()

  if (hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
    return notModified
  }

  const result =
    height && width
      ? await optimizeImage({
          buffer: Buffer.from(coverImage),
          height,
          width,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          contentType: lookup(coverImageItem!.href) || ".jpg",
        })
      : coverImage

  return new Response(result, {
    headers: {
      ...cacheHeaders,
      "Content-Disposition": contentDisposition(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        `${book.title} ebook cover${extname(coverImageItem!.href)}`,
        {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          fallback: `ebook cover${extname(coverImageItem!.href)}`,
        },
      ),
    },
  })
})
