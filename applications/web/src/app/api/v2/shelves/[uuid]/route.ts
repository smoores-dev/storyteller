import { NextResponse } from "next/server"

import { validateFilter } from "@/app/api/v2/shelves/validateFilter"
import { withHasPermission } from "@/auth/auth"
import {
  type ShelfUpdate,
  deleteShelf,
  getShelf,
  updateShelf,
} from "@/database/shelves"
import { type ShelfFilter, type ShelfOrderBy } from "@/shelves"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ uuid: UUID }>

export const GET = withHasPermission<Params>("bookList")(async (
  request,
  context,
) => {
  const user = request.auth.user
  const { uuid } = await context.params
  const shelf = await getShelf(uuid, user.id)

  return NextResponse.json(shelf)
})

export const PUT = withHasPermission<Params>("bookList")(async (
  request,
  context,
) => {
  const user = request.auth.user
  const { uuid } = await context.params

  const body = (await request.json()) as {
    name?: string
    description?: string | null
    filter?: ShelfFilter | null
    orderBy?: string | null
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

  const shelf = await updateShelf(
    uuid,
    user.id,
    {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.filter !== undefined
        ? { filter: filter ? JSON.stringify(filter) : null }
        : {}),
      ...(body.orderBy !== undefined
        ? { orderBy: (body.orderBy ?? undefined) as ShelfOrderBy | undefined }
        : {}),
      ...(body.orderDirection !== undefined
        ? { orderDirection: body.orderDirection ?? undefined }
        : {}),
      ...(body.limitCount !== undefined ? { limitCount: body.limitCount } : {}),
      ...(body.icon !== undefined ? { icon: body.icon } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    } satisfies ShelfUpdate,
    body.books,
  )

  return NextResponse.json(shelf)
})

export const DELETE = withHasPermission<Params>("bookList")(async (
  request,
  context,
) => {
  const user = request.auth.user
  const { uuid } = await context.params
  await deleteShelf(uuid, user.id)

  return new Response(null, { status: 204 })
})
