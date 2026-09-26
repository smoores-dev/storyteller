import { readBookUuids } from "@/app/api/v2/books/cache/readBookUuids"
import { getProcessedUsage, isReadaloudInFlight } from "@/assets/fs"
import { withHasPermission } from "@/auth/auth"
import { getBooks } from "@/database/books"

export const dynamic = "force-dynamic"

/**
 * @summary Measure processed cache files for many books
 *
 * @desc Adds up the processed audio, transcription and emission files that
 *       DELETE /books/cache would remove. Pass `bookUuids` to limit to
 *       specific books, or omit it to measure every book in the library.
 *       Books that are queued or processing are left out, because clearing
 *       the cache skips them.
 */
export const POST = withHasPermission("bookProcess")(async (request) => {
  const bookUuids = await readBookUuids(request)
  const books = await getBooks(bookUuids, request.auth.user.id)

  const parts = { transcodedAudio: 0, transcriptions: 0, emissions: 0 }
  let bookCount = 0
  for (const book of books) {
    if (isReadaloudInFlight(book)) continue

    const usage = await getProcessedUsage(book)
    const size = usage.transcodedAudio + usage.transcriptions + usage.emissions
    if (size === 0) continue

    parts.transcodedAudio += usage.transcodedAudio
    parts.transcriptions += usage.transcriptions
    parts.emissions += usage.emissions
    bookCount++
  }

  const bytes = parts.transcodedAudio + parts.transcriptions + parts.emissions
  return Response.json({ bytes, bookCount, parts })
})
