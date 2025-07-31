import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { FileHandle, open } from "node:fs/promises"
import { extname } from "node:path"
import { Epub } from "@smoores/epub/node"
import { getAudioCoverFilepath, getFirstCoverImage } from "@/assets/covers"
import { getAudioCoverImage } from "@/process/processEpub"
import contentDisposition from "content-disposition"
import { extension } from "mime-types"
import { createReadableStreamFromReadable } from "@remix-run/node"
import { createHash } from "node:crypto"

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

  const ifNoneMatch = request.headers.get("if-none-match")
  const ifModifiedSince = request.headers.get("if-modified-since")

  const notModified = new Response(null, { status: 304 })

  const audio = typeof request.nextUrl.searchParams.get("audio") === "string"
  if (audio) {
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

      return new Response(
        createReadableStreamFromReadable(file.createReadStream()),
        {
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
        },
      )
    } catch {
      const audioDirectory = book.audiobook?.filepath
      if (!audioDirectory) {
        if (book.readaloud?.filepath) {
          const epub = await Epub.from(book.readaloud.filepath)
          const audioCoverImage = await getAudioCoverImage(epub)
          if (audioCoverImage) {
            const cacheHeaders = await createCacheHeaders(
              await open(book.readaloud.filepath),
            )

            if (hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
              return notModified
            }

            return new Response(audioCoverImage, {
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

      return new Response(coverImage.data, {
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
    }
  }

  const epubFilepath = book.readaloud?.filepath ?? book.ebook?.filepath
  if (!epubFilepath) return new Response(null, { status: 404 })

  const epub = await Epub.from(epubFilepath)
  const coverImageItem = await epub.getCoverImageItem()
  const coverImage = await epub.getCoverImage()
  if (!coverImage) return new Response(null, { status: 404 })

  const cacheHeaders = await createCacheHeaders(await open(epubFilepath))

  if (hasChanged(cacheHeaders, { ifNoneMatch, ifModifiedSince })) {
    return notModified
  }

  return new Response(coverImage, {
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
