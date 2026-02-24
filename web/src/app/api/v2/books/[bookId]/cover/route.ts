import { createHash } from "node:crypto"
import type { Stats } from "node:fs"
import { extname } from "node:path"

import contentDisposition from "content-disposition"

import {
  getExtractedAudiobookCover,
  getExtractedEbookCover,
} from "@/assets/covers"
import { getCachedCoverImage, writeCachedCoverImage } from "@/assets/fs"
import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { optimizeImage } from "@/images"

function hasChanged(
  currentHeaders: Awaited<ReturnType<typeof createCacheHeaders>>,
  conditions: {
    ifNoneMatch: string | null
    ifModifiedSince: string | null
  },
) {
  if (conditions.ifNoneMatch) {
    return conditions.ifNoneMatch !== currentHeaders.Etag
  }

  if (conditions.ifModifiedSince) {
    const conditionDate = new Date(conditions.ifModifiedSince)
    const currentDate = new Date(currentHeaders["Last-Modified"])
    return currentDate > conditionDate
  }

  return true
}

function createCacheHeaders(stats: Stats, updatedAt?: Date) {
  const lastModified = new Date(stats.mtimeMs).toISOString()
  const etagBase = `${Math.round(stats.mtimeMs)}-${stats.size}`
  const etag = `"${createHash("md5").update(etagBase).digest("hex")}"`

  // only cache immutably if updatedAt is provided
  const cacheControl = updatedAt
    ? "public, max-age=31536000, immutable"
    : "must-revalidate"
  return {
    "Last-Modified": lastModified,
    Etag: etag,
    "Cache-Control": cacheControl,
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
 *       The `v` search param is the last known updatedAt of the book.
 *       If it is provided, cover image will be cached in the browser
 */
export const GET = withHasPermission<Params>("bookRead", {
  allowBasicAuth: true,
})(async (request, context) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) return new Response(null, { status: 404 })

  const height = parseInt(request.nextUrl.searchParams.get("h") ?? "0", 10)
  const width = parseInt(request.nextUrl.searchParams.get("w") ?? "0", 10)

  const version = parseInt(request.nextUrl.searchParams.get("v") ?? "0", 10)
  const updatedAt =
    version && !Number.isNaN(version) ? new Date(version) : undefined

  const ifNoneMatch = request.headers.get("if-none-match")
  const ifModifiedSince = request.headers.get("if-modified-since")

  const notModified = new Response(null, { status: 304 })

  const audio = typeof request.nextUrl.searchParams.get("audio") === "string"
  const cachedImage = await getCachedCoverImage(
    book.uuid,
    audio ? "audio" : "text",
    height,
    width,
  )

  const coverImage =
    cachedImage ??
    (audio
      ? await getExtractedAudiobookCover(book)
      : await getExtractedEbookCover(book))

  if (!coverImage) {
    return new Response(null, {
      status: 404,
      ...(updatedAt
        ? { headers: { "Cache-Control": "public, max-age=3600, immutable" } }
        : {}),
    })
  }

  const cacheHeaders = createCacheHeaders(coverImage.stats, updatedAt)

  if (!hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
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

  if (height && width && !cachedImage) {
    coverImage.data = result
    await writeCachedCoverImage(
      book.uuid,
      audio ? "audio" : "text",
      height,
      width,
      coverImage,
    )
  }

  const ext = extname(coverImage.filename)

  const dispositionName = audio ? `audio cover${ext}` : `ebook cover${ext}`

  return new Response(new Uint8Array(result), {
    headers: {
      ...cacheHeaders,
      "Content-Disposition": contentDisposition(
        `${book.title} ${dispositionName}`,
        {
          fallback: dispositionName,
        },
      ),
    },
  })
})
