import { parseScanOptions } from "@/app/api/v2/books/scan/route"
import { runSingleBookScan } from "@/assets/library/scanManager"
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

  void runSingleBookScan(bookUuid, controller.signal, options)

  return new Response(null, { status: 204 })
})
