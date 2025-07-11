import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { open } from "node:fs/promises"
import { basename } from "node:path"
import { Epub } from "@smoores/epub/node"
import { getAudioCoverFilepath, getFirstCoverImage } from "@/assets/covers"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary deprecated - Get the cover image for a book
 * @desc Use the `audio` search param to get the audio cover. The
 *       default is to get the text cover.
 */
export const GET = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)

  const book = await getBook(bookUuid)
  if (!book) return new Response(null, { status: 404 })

  const audio = typeof request.nextUrl.searchParams.get("audio") === "string"
  if (audio) {
    const coverFilepath = await getAudioCoverFilepath(book)
    try {
      // This actually might be undefined, but if it is, we want to
      // throw so that we end up in the catch block
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const file = await open(coverFilepath!)

      // @ts-expect-error NextResponse handles Node Streams just fine
      return new Response(file.createReadStream(), {
        headers: {
          // If we got here, this is definitely defined
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          "Content-Disposition": `attachment; filename="${basename(coverFilepath!)}"`,
        },
      })
    } catch {
      const audioDirectory = book.audiobook?.filepath
      if (!audioDirectory) return new Response(null, { status: 404 })

      const coverImage = await getFirstCoverImage(audioDirectory)
      if (!coverImage) return new Response(null, { status: 404 })
      return new Response(coverImage)
    }
  }

  const epubFilepath = book.ebook?.filepath
  if (!epubFilepath) return new Response(null, { status: 404 })

  const epub = await Epub.from(epubFilepath)
  const coverImage = await epub.getCoverImage()
  if (!coverImage) return new Response(null, { status: 404 })

  return new Response(coverImage)
})
