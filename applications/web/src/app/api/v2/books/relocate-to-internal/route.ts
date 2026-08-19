import { NextResponse } from "next/server"
import { z } from "zod"

import { type RelocateMode, relocateToInternal } from "@/assets/fs"
import { withHasPermission } from "@/auth/auth"
import { getBooks } from "@/database/books"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

const BodySchema = z.object({
  bookUuids: z.array(z.uuid()).min(1),
  mode: z.enum(["copy", "move", "hardlink"]).optional(),
})

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const json = (await request.json().catch(() => null)) as unknown
  const parsed = BodySchema.safeParse(json)

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const mode: RelocateMode = parsed.data.mode ?? "copy"

  const books = await getBooks(
    parsed.data.bookUuids as UUID[],
    request.auth.user.id,
  )

  const results = await Promise.all(
    books.map((book) => relocateToInternal(book, mode)),
  )

  return NextResponse.json(results)
})
