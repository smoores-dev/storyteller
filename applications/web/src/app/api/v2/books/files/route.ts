import { createBookArchive, safeFilename } from "@/assets/bookArchive"
import { zipResponse } from "@/assets/zip"
import { withHasPermission } from "@/auth/auth"
import { DOWNLOAD_SELECTIONS, type DownloadSelection } from "@/bookDownloads"
import { getBooks } from "@/database/books"
import { getSettings } from "@/database/settings"
import { type UUID } from "@/uuid"

/**
 * @summary download files for several books as one zip.
 * @desc accepts a form with a single `json` field containing
 *       `{ format, bookUuids }`. uses a native form post so the
 *       browser streams the response to disk without buffering in js.
 */
export const POST = withHasPermission("bookDownload")(async (request) => {
  const form = await request.formData()
  const { format: selection, bookUuids: uuids } = JSON.parse(
    form.get("json") as string,
  ) as { format: string; bookUuids: UUID[] }

  if (!DOWNLOAD_SELECTIONS.includes(selection as DownloadSelection)) {
    return Response.json({ message: "Unknown format" }, { status: 400 })
  }

  if (!Array.isArray(uuids) || uuids.length === 0) {
    return Response.json({ message: "No books selected" }, { status: 400 })
  }

  const books = await getBooks(uuids, request.auth.user.id)
  const { libraryName } = await getSettings()
  const library = libraryName || "Storyteller"

  const { titles, ...zip } = await createBookArchive(
    books,
    selection as DownloadSelection,
    library,
  )

  if (titles.length === 0) {
    zip.stream.destroy()
    return Response.json(
      { message: "None of these books have files to download" },
      { status: 404 },
    )
  }

  const [onlyTitle] = titles
  return zipResponse(
    zip,
    titles.length === 1 && onlyTitle
      ? `${safeFilename(onlyTitle) || "Book"}.zip`
      : `${safeFilename(library) || "Storyteller"} (${titles.length} books).zip`,
  )
})
