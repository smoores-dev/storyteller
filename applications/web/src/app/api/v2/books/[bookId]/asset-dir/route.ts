import { NextResponse } from "next/server"
import { z } from "zod"

import { changeBookAssetDir } from "@/assets/fs"
import { getSafeFilepathSegment } from "@/assets/paths"
import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

const ConflictResolutionSchema = z
  .object({
    ebook: z.enum(["current", "target"]).optional(),
    audiobook: z.enum(["current", "target"]).optional(),
    readaloud: z.enum(["current", "target"]).optional(),
  })
  .optional()

const BodySchema = z.object({
  assetDir: z.string().min(1),
  conflictResolution: ConflictResolutionSchema,
})

export const PUT = withHasPermission<Params>("bookUpdate")(async (
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
  const parsed = BodySchema.safeParse(json)

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const sanitized = getSafeFilepathSegment(parsed.data.assetDir)

  if (!sanitized) {
    return NextResponse.json(
      { message: "Asset directory name is invalid after sanitization" },
      { status: 400 },
    )
  }

  const result = await changeBookAssetDir(
    book,
    sanitized,
    parsed.data.conflictResolution,
  )

  if ("conflict" in result) {
    return NextResponse.json({ conflict: result.conflict }, { status: 409 })
  }

  return NextResponse.json(result.book)
})
