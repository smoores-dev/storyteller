import { NextResponse } from "next/server"
import { z } from "zod"

import { type RelocateMode, relocateToInternal } from "@/assets/fs"
import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

const BodySchema = z
  .object({
    mode: z.enum(["copy", "move", "hardlink"]).optional(),
  })
  .optional()

export const POST = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid, request.auth.user.id)

  if (!book) {
    return NextResponse.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const json = (await request.json().catch(() => null)) as unknown
  const parsed = BodySchema.safeParse(json ?? {})

  const mode: RelocateMode = parsed.success
    ? (parsed.data?.mode ?? "copy")
    : "copy"

  const updated = await relocateToInternal(book, mode)

  return NextResponse.json(updated)
})
