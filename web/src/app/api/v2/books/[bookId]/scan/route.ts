import { parseScanOptions } from "@/app/api/v2/books/scan/route"
import { Scan } from "@/assets/library/scan"
import { withHasPermission } from "@/auth/auth"
import { getBookUuid } from "@/database/books"

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
  const options = parseScanOptions(request.nextUrl.searchParams)

  const scan = new Scan(
    "manual",
    [{ type: "existing-books", bookUuids: [bookUuid] }],
    options,
  )

  void scan.execute(controller.signal)

  return new Response(null, { status: 204 })
})
