import { runExistingBookScan } from "@/assets/autoimport/scanManager"
import { withHasPermission } from "@/auth/auth"
import { getBookUuid } from "@/database/books"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

export const POST = withHasPermission<Params>("bookProcess")(async (
  _request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const controller = new AbortController()

  void runExistingBookScan(bookUuid, controller.signal)

  return new Response(null, { status: 204 })
})
