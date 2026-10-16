import { safeFilename } from "@/assets/bookArchive"
import { withHasPermission } from "@/auth/auth"
import { getBooks } from "@/database/books"
import { getSettings } from "@/database/settings"
import { resolveUserPreferences } from "@/database/userPreferencesTypes"
import { getUserSettings } from "@/database/userSettings"
import { defaultKindleAddress, kindleBooks, kindleRefusal } from "@/kindle"
import { logger } from "@/logging"
import { sendMail } from "@/mail"
import { type UUID } from "@/uuid"

/**
 * @summary Email ebooks to the current user's Kindle address
 * @desc Sends one email with every selected ebook attached. Books without an
 *       ebook are skipped. Kindle has a limit of 25 books. Most providers do not
 *       allow sending more than 25mb of attachments.
 *       Can only send to yourself.
 */
export const POST = withHasPermission("bookDownload")(async (request) => {
  const { books: uuids, to } = (await request.json()) as {
    books: UUID[]
    to?: string[]
  }

  const [{ smtpHost, smtpFrom, libraryName }, rawSettings] = await Promise.all([
    getSettings(),
    getUserSettings(request.auth.user.id),
  ])

  if (!smtpHost) {
    return Response.json(
      { code: "smtp-not-configured", message: "Email is not set up" },
      { status: 503 },
    )
  }

  const { kindleAddresses } = resolveUserPreferences(rawSettings)
  const allowedEmails = new Set(kindleAddresses.map((address) => address.email))
  const defaultAddress = defaultKindleAddress(kindleAddresses)

  const recipients =
    to && to.length > 0
      ? to.filter((email) => allowedEmails.has(email))
      : defaultAddress
        ? [defaultAddress.email]
        : []

  if (recipients.length === 0) {
    return Response.json(
      {
        code: "no-kindle-address",
        message: "No Kindle address saved",
        sender: smtpFrom,
      },
      { status: 409 },
    )
  }

  const books = await getBooks(uuids, request.auth.user.id)

  // TODO: split into several emails instead of refusing once someone needs it
  const refusal = kindleRefusal(books)
  if (refusal) {
    return Response.json(
      { code: refusal, message: `Cannot send to Kindle: ${refusal}` },
      { status: 422 },
    )
  }

  const sendable = kindleBooks(books)
  const [onlyBook] = sendable

  try {
    await sendMail({
      to: recipients,
      subject:
        sendable.length === 1 && onlyBook
          ? onlyBook.title
          : `${sendable.length} books from ${libraryName || "Storyteller"}`,
      text: sendable.map((book) => book.title).join("\n"),
      attachments: sendable.map((book) => ({
        filename: `${safeFilename(book.title) || book.uuid}.epub`,
        path: book.ebook?.filepath ?? "",
        contentType: "application/epub+zip",
      })),
    })
  } catch (error) {
    logger.error({ msg: "Failed to send to Kindle", err: error })
    return Response.json(
      {
        code: "send-failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    )
  }

  return Response.json({
    sent: sendable.length,
    skipped: books.length - sendable.length,
  })
})
