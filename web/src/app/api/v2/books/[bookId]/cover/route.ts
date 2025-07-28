import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { open } from "node:fs/promises"
import { basename, extname } from "node:path"
import { Epub } from "@smoores/epub/node"
import { getAudioCoverFilepath, getFirstCoverImage } from "@/assets/covers"
import { getAudioCoverImage } from "@/process/processEpub"
import contentDisposition from "content-disposition"
import { extension, lookup } from "mime-types"
import { createReadableStreamFromReadable } from "@remix-run/node"

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

  const audio = typeof request.nextUrl.searchParams.get("audio") === "string"
  if (audio) {
    const coverFilepath = await getAudioCoverFilepath(book)
    try {
      // This actually might be undefined, but if it is, we want to
      // throw so that we end up in the catch block
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const file = await open(coverFilepath!)

      return new Response(
        createReadableStreamFromReadable(file.createReadStream()),
        {
          headers: {
            "Content-Disposition": contentDisposition(
              // If we got here, this is definitely defined
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              basename(coverFilepath!),
              {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                fallback: `Cover${extname(coverFilepath!)}`,
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
          if (audioCoverImage) return new Response(audioCoverImage)
        }
        return new Response(null, { status: 404 })
      }

      const customAudioCover = await getAudioCoverFilepath(book)
      if (customAudioCover) {
        return new Response(
          createReadableStreamFromReadable(
            (await open(customAudioCover)).createReadStream(),
          ),
          {
            headers: {
              "Content-Type": lookup(customAudioCover) || "image/jpeg",
              "Content-Disposition": contentDisposition(
                basename(customAudioCover),
              ),
            },
          },
        )
      }

      const coverImage = await getFirstCoverImage(audioDirectory)
      if (!coverImage) return new Response(null, { status: 404 })
      return new Response(coverImage.data, {
        headers: {
          "Content-Type": coverImage.format,
          "Content-Disposition": contentDisposition(
            `Cover${extension(coverImage.format) || ".jpg"}`,
          ),
        },
      })
    }
  }

  const epubFilepath = book.readaloud?.filepath ?? book.ebook?.filepath
  if (!epubFilepath) return new Response(null, { status: 404 })

  const epub = await Epub.from(epubFilepath)
  const coverImage = await epub.getCoverImage()
  if (!coverImage) return new Response(null, { status: 404 })

  return new Response(coverImage)
})
