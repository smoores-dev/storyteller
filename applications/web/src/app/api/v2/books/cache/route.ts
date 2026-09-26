import {
  deleteProcessed,
  isReadaloudInFlight,
  resetReadaloudIfUnfinished,
} from "@/assets/fs"
import { withHasPermission } from "@/auth/auth"
import { getBooks } from "@/database/books"

import { readBookUuids } from "./readBookUuids"

export const dynamic = "force-dynamic"

/**
 * @summary Delete processed cache files for many books
 *
 * @desc Deletes processed (split and transcoded) audio and transcription
 *       files. Pass `bookUuids` to limit to specific books, or omit it to
 *       clear the cache for every book in the library.
 */
export const DELETE = withHasPermission("bookProcess")(async (request) => {
  const bookUuids = await readBookUuids(request)

  const books = await getBooks(bookUuids, request.auth.user.id)

  for (const book of books) {
    // don't pull the cache out from under a queued or running job
    if (isReadaloudInFlight(book)) continue

    await deleteProcessed(book)
    await resetReadaloudIfUnfinished(book)
  }

  return new Response(null, { status: 204 })
})
