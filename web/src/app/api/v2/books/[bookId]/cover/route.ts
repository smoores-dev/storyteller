import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { extname } from "node:path"
import { getAudioCover, getEpubCover } from "@/assets/covers"
import contentDisposition from "content-disposition"
import { createHash } from "node:crypto"
import { Stats } from "node:fs"
import { getCachedCoverImage, writeCachedCoverImage } from "@/assets/fs"
import { optimizeImage } from "@/images"

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
      coverImage.data = result
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

  const coverImage = cachedImage ?? (await getEpubCover(book))
  if (!coverImage) return new Response(null, { status: 404 })

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
    coverImage.data = result
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
