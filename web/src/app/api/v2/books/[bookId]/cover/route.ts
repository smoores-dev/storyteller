import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { open } from "node:fs/promises"
import { basename, extname } from "node:path"
import { Epub } from "@smoores/epub/node"
import { getAudioCover } from "@/assets/covers"
import contentDisposition from "content-disposition"
import { createHash } from "node:crypto"
import { Stats } from "node:fs"
import { getCachedCoverImage, writeCachedCoverImage } from "@/assets/fs"

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
  // scale up images for hi-res displays
  height = height && Math.round(height * 1.5)
  width = Math.round(width * 1.5)

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

function createCacheHeaders(stats: Stats) {
  const lastModified = new Date(stats.mtimeMs).toISOString()
  const etagBase = `${Math.round(stats.mtimeMs)}-${stats.size}`
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
    const cachedImage = await getCachedCoverImage(
      book.uuid,
      "audio",
      height,
      width,
    )
    const coverImage = cachedImage ?? (await getAudioCover(book))
    if (!coverImage) return new Response(null, { status: 404 })

    const cacheHeaders = createCacheHeaders(coverImage.stats)

    if (hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
      return notModified
    }

    const result =
      cachedImage?.data ??
      (height && width
        ? await optimizeImage({
            buffer: coverImage.data,
            height,
            width,
            contentType: coverImage.mimeType,
          })
        : coverImage.data)

    if (height && width) {
      await writeCachedCoverImage(book.uuid, "audio", height, width, coverImage)
    }

    const ext = extname(coverImage.filename)

    return new Response(result, {
      headers: {
        ...cacheHeaders,
        "Content-Disposition": contentDisposition(
          `${book.title} audio cover${ext}`,
          {
            fallback: `audio cover${ext}`,
          },
        ),
      },
    })
  }

  const epubFilepath = book.readaloud?.filepath ?? book.ebook?.filepath
  if (!epubFilepath) return new Response(null, { status: 404 })

  const cachedImage = await getCachedCoverImage(
    book.uuid,
    "text",
    height,
    width,
  )

  let coverImage = cachedImage

  if (!coverImage) {
    if (!epubFilepath) return new Response(null, { status: 404 })
    const epub = await Epub.from(epubFilepath)
    const coverImageItem = await epub.getCoverImageItem()
    if (!coverImageItem) return new Response(null, { status: 404 })
    const data = await epub.getCoverImage()
    if (!data) return new Response(null, { status: 404 })

    const epubFile = await open(epubFilepath)
    const stats = await epubFile.stat()
    await epubFile.close()

    coverImage = {
      filename: basename(coverImageItem.href),
      mimeType: coverImageItem.mediaType ?? "image/jpeg",
      data: Buffer.from(data),
      stats,
    }
  }

  const cacheHeaders = createCacheHeaders(coverImage.stats)

  if (hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
    return notModified
  }

  const result =
    cachedImage?.data ??
    (height && width
      ? await optimizeImage({
          buffer: Buffer.from(coverImage.data),
          height,
          width,
          contentType: coverImage.mimeType,
        })
      : coverImage.data)

  if (height && width) {
    await writeCachedCoverImage(book.uuid, "text", height, width, coverImage)
  }

  const ext = extname(coverImage.filename)

  return new Response(result, {
    headers: {
      ...cacheHeaders,
      "Content-Disposition": contentDisposition(
        `${book.title} ebook cover${ext}`,
        {
          fallback: `ebook cover${ext}`,
        },
      ),
    },
  })
})
