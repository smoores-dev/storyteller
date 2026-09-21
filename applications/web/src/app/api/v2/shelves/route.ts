import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { createShelf, getShelves } from "@/database/shelves"
import { type ShelfFilter, type ShelfOrderBy } from "@/shelves"
import { type UUID } from "@/uuid"

import { validateFilter } from "./validateFilter"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user
  const shelves = await getShelves(user.id)

  return NextResponse.json(shelves)
})

export const POST = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user

  const body = (await request.json()) as {
    name: string
    description?: string | null
    filter?: ShelfFilter | null
    orderBy?: ShelfOrderBy | null
    orderDirection?: "asc" | "desc" | null
    limitCount?: number | null
    books?: UUID[]
    icon?: string | null
    color?: string | null
  }

  let filter: ShelfFilter | null = null
  if (body.filter) {
    const validated = validateFilter(body.filter)
    if (!validated.ok) return validated.response
    filter = validated.filter
  }

  const shelf = await createShelf(
    user.id,
    {
      name: body.name,
      description: body.description ?? null,
      filter: filter ? JSON.stringify(filter) : null,
      orderBy: body.orderBy ?? "createdAt",
      orderDirection: body.orderDirection ?? "desc",
      limitCount: body.limitCount ?? null,
      icon: body.icon ?? null,
      color: body.color ?? null,
    },
    body.books,
  )

  return NextResponse.json(shelf)
})
