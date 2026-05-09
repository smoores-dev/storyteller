import { parseScanOptions } from "@/app/api/v2/books/scan/route"
import { scanBooks } from "@/assets/library/scanner/scan"
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
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    // no body is fine
  }

  const options = parseScanOptions(request.nextUrl.searchParams, body)

  void scanBooks({
    source: "manual",
    bookUuids: [bookUuid],
    options,
    signal: controller.signal,
  })

  return new Response(null, { status: 204 })
})
