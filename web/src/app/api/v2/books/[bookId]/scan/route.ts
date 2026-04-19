import { parseScanOptions } from "@/app/api/v2/books/scan/route"
import { scanExistingBooks } from "@/assets/library/scanExisting"
import { runExclusive } from "@/assets/library/scanManager"
import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

export const POST = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const controller = new AbortController()
  const signal = controller.signal
  const options = parseScanOptions(request.nextUrl.searchParams)

  // void runSingleBookScan(bookUuid, controller.signal, options)
  void runExclusive("manual", signal, async () => {
    const book = await getBook(bookUuid)
    if (!book) {
      logger.error(`Book ${bookUuid} not found`)
      return
    }

    await scanExistingBooks(signal, {
      bookUuids: [bookUuid],
      scanOptions: options,
    })
  })

  return new Response(null, { status: 204 })
})
