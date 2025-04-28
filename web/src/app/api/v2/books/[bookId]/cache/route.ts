import { deleteOriginals, deleteProcessed } from "@/assets/assets"
import { withHasPermission } from "@/auth"
import { getBookUuid } from "@/database/books"
import { BookEvents } from "@/events"

type Params = Promise<{
  bookId: string
}>

/**
 * @summary Delete cache files for a book
 *
 * @desc Cache files are generated during processing. They include
 *       processed (split and transcoded) audio files, transcriptions, etc.
 */
export const DELETE = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const url = request.nextUrl
  const includeOriginals = typeof url.searchParams.get("originals") === "string"

  await Promise.all([
    deleteProcessed(bookUuid),
    ...(includeOriginals ? [deleteOriginals(bookUuid)] : []),
  ])

  if (includeOriginals) {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid,
      payload: { originalFilesExist: false },
    })
  }

  return new Response(null, { status: 204 })
})
