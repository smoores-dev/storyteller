import { NextResponse } from "next/server"

import { validateFilter } from "@/app/api/v2/shelves/validateFilter"
import { withHasPermission } from "@/auth/auth"
import { booksQuery } from "@/database/books"
import {
  buildFilterExpression,
  buildSortExpressions,
} from "@/database/shelfFilter"
import { type ShelfFilter, type ShelfOrderBy } from "@/shelves"

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

  const validated = validateFilter(filter)
  if (!validated.ok) return validated.response

  let query = booksQuery(user.id)

  query = query.where((eb) =>
    buildFilterExpression(eb, validated.filter, user.id),
  )

  const limit = body.limit ?? 20
  query = query.limit(limit)

  const orderBy = body.orderBy ?? "createdAt"
  const orderDirection = body.orderDirection ?? "desc"
  if (orderBy === "position") {
    query = query.orderBy("book.createdAt", orderDirection)
  } else {
    for (const expr of buildSortExpressions(orderBy, { userId: user.id })) {
      query = query.orderBy(expr, orderDirection)
    }
  }

  const books = await query.execute()

  return NextResponse.json(books)
})
