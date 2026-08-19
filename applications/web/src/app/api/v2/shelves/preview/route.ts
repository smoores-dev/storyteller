import { NextResponse } from "next/server"
import { z } from "zod"

import { withHasPermission } from "@/auth/auth"
import { booksQuery } from "@/database/books"
import {
  buildFilterExpression,
  buildSortExpression,
} from "@/database/shelfFilter"
import {
  type ShelfFilter,
  type ShelfOrderBy,
  shelfFilterSchema,
} from "@/shelves"

export const dynamic = "force-dynamic"

export const POST = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user

  const body = (await request.json()) as {
    filter: ShelfFilter | null
    orderBy?: ShelfOrderBy
    orderDirection?: "asc" | "desc"
    limit?: number
  }

  const filter = body.filter

  if (!filter) {
    return NextResponse.json([])
  }

  // validate filter
  const validated = shelfFilterSchema.safeParse(filter)
  if (!validated.success) {
    return NextResponse.json(
      { message: `Invalid filter: ${z.prettifyError(validated.error)}` },
      { status: 400 },
    )
  }

  let query = booksQuery(user.id)

  query = query.where((eb) =>
    buildFilterExpression(eb, validated.data, user.id),
  )

  const limit = body.limit ?? 20
  query = query.limit(limit)

  const orderBy = body.orderBy ?? "createdAt"
  const orderDirection = body.orderDirection ?? "desc"
  query =
    orderBy === "position"
      ? query.orderBy("book.createdAt", orderDirection)
      : query.orderBy(
          buildSortExpression(orderBy, { userId: user.id }),
          orderDirection,
        )

  const books = await query.execute()

  return NextResponse.json(books)
})
